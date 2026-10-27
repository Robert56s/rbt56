import { OPAMP_GBW } from '../spice/opamps';
import { responseAt } from './bode';
import { capacitorCandidates, ratioPair, smallCapPenalty } from './eseries';
import { formatHz } from './format';
import { designKhnBandPass, designKhnBandPassFromCap } from './khnBandPass';
import { designMfbBandPass, designMfbBandPassFromCaps } from './mfbBandPass';
import { nodalPoles, nodalResponse } from './nodal';
import { filterPairCount, filterPairGroups } from './pairPlan';
import { designRlcGic, designRlcGicFromCap, designRlcGyrator, designRlcGyratorFromCap, GYRATOR_R1 } from './rlcBandPass';
import { designSallenKeyBandPass, designSallenKeyBandPassFromCap, sallenKeyBpOwnGain } from './sallenKeyBandPass';
import { khnBpSensitivity, mfbBpSensitivity, rlcGicSensitivity, rlcGyratorSensitivity, sallenKeyBpSensitivity, TOW_THOMAS_BP_SENSITIVITY } from './sensitivity';
import { stageElements } from './stageElements';
import { designTowThomasBandPass, designTowThomasBandPassFromCap } from './towThomas';

/**
 * Narrow band-pass: one frequency picked out by one second-order
 * band-pass stage, or by N identical ones in cascade.
 *
 * Spec: f0, Q or the -3 dB bandwidth B (Q = f0 / B), the gain K wanted at
 * f0 (its size: an inverting circuit gives -K), and N.
 *
 * N identical stages, each H(s) = K_s (omega0/Q_s) s / (s^2 + (omega0/Q_s) s + omega0^2):
 * with x = Q_s (f/f0 - f0/f), |H|^2 = K_s^2 / (1 + x^2) per stage, so the
 * cascade is 3 dB down where (1 + x^2)^N = 2, x^2 = 2^(1/N) - 1, and the
 * band edges f1 f2 = f0^2 with f2 - f1 = f0 sqrt(2^(1/N) - 1) / Q_s. The
 * overall bandwidth is the stage's times sqrt(2^(1/N) - 1), so for a Q
 * overall each stage gets
 *   Q_s = Q sqrt(2^(1/N) - 1)   (lower than Q),
 * all centred on f0, each with the gain K^(1/N). The price: N times the
 * op-amps, and skirts N times as steep, -20 N dB per decade far from f0.
 *
 * Six circuits build a stage: the RLC with its inductor simulated by a
 * gyrator or by Antoniou's GIC, the Sallen-Key band-pass, the multiple
 * feedback band-pass, the state-variable (KHN) circuit and the Tow-Thomas
 * biquad. compareNarrowCircuits builds the spec on each and measures what
 * comes out, with an ideal op-amp and with a single-pole op-amp of the
 * TL082's measured gain-bandwidth, solved from each circuit's netlist.
 */

/** The circuits, in the order the comparison lists them (the topology names of their stages). */
export const NARROW_CIRCUITS = ['rlcGyrator', 'rlcGic', 'sallenKeyBp', 'mfbBp', 'khnBp', 'towThomasBp'];

export const NARROW_LABELS = {
	rlcGyrator: 'RLC, gyrator inductor',
	rlcGic: 'RLC, Antoniou GIC inductor',
	sallenKeyBp: 'Sallen-Key band-pass',
	mfbBp: 'Multiple feedback band-pass',
	khnBp: 'State variable (KHN)',
	towThomasBp: 'Tow-Thomas band-pass'
};

/** A circuit's name inside a sentence: the label with a common word lowered (multiple feedback band-pass). */
export const narrowLabelInText = (circuit) => (NARROW_LABELS[circuit] ?? circuit).replace(/^(Multiple|State)/, (w) => w.toLowerCase());

/** The most identical stages the spec takes. */
export const NARROW_MAX_STAGES = 6;

/** The single-pole op-amp the comparison runs every circuit on: the TL082's measured gain-bandwidth (opamps.js). */
export const NARROW_REAL_GBW = OPAMP_GBW.TL082;

/**
 * The gain stages after the chain: at most this many, and each one's
 * gain g kept to g f0 <= NARROW_GAIN_SPEED GBW on the TL082, where its
 * loss at f0 stays under 0.5 % (1 / sqrt(1 + 0.1^2)).
 */
export const NARROW_MAX_GAIN_STAGES = 3;
export const NARROW_GAIN_SPEED = 0.1;

/** sqrt(2^(1/N) - 1): how much N identical stages narrow one stage's bandwidth. */
export function narrowShrink(n) {
	return Math.sqrt(2 ** (1 / n) - 1);
}

/**
 * The narrow band-pass from its spec: f0 (Hz), q or bandwidth (Hz, the
 * overall -3 dB width; q wins when both are given), gain K (V/V, its size)
 * and stages N (1 to NARROW_MAX_STAGES). Returns null when a figure is not
 * a positive number or N is not a whole number in range, else
 *   { filterType: 'narrowband', by: 'q' | 'b', f0, w0, q, B, gain, gainDb,
 *     n, shrink, stageQ, stageB, stageGain, stageGainDb, skirtDbPerDecade,
 *     f1, f2, stages }
 * f1 and f2 are the -3 dB edges (f1 f2 = f0^2), stageB the bandwidth of
 * one stage alone, and stages the N targets
 *   { order: 2, filterType: 'bandpass', wn, q, gain, w0, role: 'narrow', index }.
 */
export function designNarrowBand({ f0, q = null, bandwidth = null, gain = 1, stages = 1 }) {
	const by = Number.isFinite(q) && q > 0 ? 'q' : 'b';
	const Q = by === 'q' ? q : f0 / bandwidth;
	const K = Math.abs(gain);
	if (![f0, Q, K].every((v) => Number.isFinite(v) && v > 0)) return null;
	if (!(Number.isInteger(stages) && stages >= 1 && stages <= NARROW_MAX_STAGES)) return null;
	const n = stages;
	const w0 = 2 * Math.PI * f0;
	const shrink = narrowShrink(n);
	const stageQ = Q * shrink;
	const stageGain = K ** (1 / n);
	const B = f0 / Q;
	const half = 1 / (2 * Q);
	return {
		filterType: 'narrowband',
		by,
		f0,
		w0,
		q: Q,
		B,
		gain: K,
		gainDb: 20 * Math.log10(K),
		n,
		shrink,
		stageQ,
		stageB: f0 / stageQ,
		stageGain,
		stageGainDb: 20 * Math.log10(stageGain),
		skirtDbPerDecade: -20 * n,
		f1: f0 * (Math.sqrt(1 + half * half) - half),
		f2: f0 * (Math.sqrt(1 + half * half) + half),
		stages: Array.from({ length: n }, (_, index) => ({ order: 2, filterType: 'bandpass', wn: w0, q: stageQ, gain: stageGain, w0, role: 'narrow', index }))
	};
}

/** The design's targets as stages bode.js reads (a 'Bp' topology at its centre gain): the response asked for, before any part. */
export function narrowIdealStages(design) {
	return design.stages.map((s) => ({ topology: 'idealBp', order: 2, actual: { wn: s.wn, q: s.q, gain: s.gain } }));
}

/**
 * The textbook values each circuit starts from, for one capacitor C and
 * the stage's own f0 and Q (the explanation's numbers): the plain RLC (R =
 * Q sqrt(L/C), L = 1/(omega0^2 C)), the gyrator's R2 = L/(R1 C) at its
 * smallest R1, the Sallen-Key's equal R and K, the two-resistor multiple
 * feedback form (no resistor to ground: R1 = 1/(2 Q omega0 C), R3 =
 * 2Q/(omega0 C), centre gain -2Q^2, the ceiling of the three-resistor
 * form), the state-variable circuit set by its integrators (R5/R6 = 2,
 * R3 = R4 = R7: R1 = Q/(omega0 C), R2 = 1/(Q omega0 C), gain 1) and the
 * Tow-Thomas (R = 1/(omega0 C), Rd = Q R, R1 = Rd/K).
 */
export function narrowTextbook(wn, q, C, gain = 1) {
	const X = 1 / (wn * C);
	const L = X / wn;
	const K = 4 - Math.SQRT2 / q;
	return {
		C,
		rlc: { L, R: q * X },
		gyrator: { R1: GYRATOR_R1, R2: L / (GYRATOR_R1 * C), L },
		sallenKey: { R: Math.SQRT2 * X, K, ownGain: sallenKeyBpOwnGain(q), sensitivityK: K / (4 - K) },
		mfbTwoResistor: { R1: X / (2 * q), R3: 2 * q * X, gain: -2 * q * q },
		khnRatio: { R1: q * X, R2: X / q, R5R6: 2, gain: 1 },
		khn: { R: X, R3overR0: q / gain, R5R6: 2 * q + gain - 1 },
		towThomas: { R: X, Rd: q * X, R1: (q * X) / gain }
	};
}

/* ------------------------------------------------------------ the stages */

/**
 * A non-inverting amplifier of gain `gain` (over 1) as a realized stage:
 * R1 from the - input to ground, R2 from there to the output, R2/R1 the
 * stocked ratio closest to gain - 1 (R1 near 10 kilo-ohm). The gainNonInv
 * stage of the build-by-hand tool, so its netlist, drawing and Bode are
 * that one's. Null for a gain at or under 1, or one no stocked pair gives.
 */
export function designNarrowGainStage(gain, { resistorSeries = 'E24', pairs = false } = {}) {
	if (!(Number.isFinite(gain) && gain > 1)) return null;
	const pair = ratioPair(gain - 1, resistorSeries, { pairs, other: 'R2', min: 10 });
	if (!pair) return null;
	return {
		topology: 'gainNonInv',
		order: 0,
		theoretical: { R1: pair.base, R2: (gain - 1) * pair.base },
		components: { R1: pair.base, R2: pair.other },
		actual: { gain: 1 + pair.other / pair.base },
		steps: { gainTarget: gain, resistorSeries }
	};
}

/** One gain stage from the stock, else from the full E24 series (stockShortfall). */
function narrowGainStageOrGrid(gain, opts) {
	const stage = designNarrowGainStage(gain, opts);
	if (stage) return stage;
	const grid = designNarrowGainStage(gain, { resistorSeries: 'E24' });
	return grid && { ...grid, stockShortfall: true };
}

/**
 * The non-inverting stages that bring a chain's gain up by `gain` (over
 * 1) at f0. One amplifier of gain g on a single-pole op-amp of gain-
 * bandwidth gbw keeps g/sqrt(1 + (g f0/gbw)^2) at f0, so a large gain at a
 * high f0 is split over m identical amplifiers, each gain^(1/m): the
 * fewest (up to NARROW_MAX_GAIN_STAGES) that keep every g f0 within
 * NARROW_GAIN_SPEED gbw and that the stock builds; when none does, the
 * count that loses least. The last one takes what the rounding of the
 * others leaves, so the product lands on `gain`. gbw null: one amplifier
 * unless the stock needs more. Returns the stages ([] for a gain at or
 * under 1), or null when no ratio gives them.
 */
export function designNarrowGainStages(gain, f0, { resistorSeries = 'E24', pairs = false, gbw = NARROW_REAL_GBW } = {}) {
	if (!(Number.isFinite(gain) && gain > 1)) return [];
	const fast = Number.isFinite(gbw) && gbw > 0 && Number.isFinite(f0) && f0 > 0;
	const lossOf = (m) => (fast ? m * Math.log(Math.hypot(1, (gain ** (1 / m) * f0) / gbw)) : 0);
	let best = null;
	for (let m = 1; m <= NARROW_MAX_GAIN_STAGES; m++) {
		const g = gain ** (1 / m);
		const stages = [];
		let made = 1;
		for (let k = 0; k < m; k++) {
			const s = narrowGainStageOrGrid(k === m - 1 ? gain / made : g, { resistorSeries, pairs });
			if (!s) break;
			stages.push(s);
			made *= s.actual.gain;
		}
		if (stages.length < m) continue;
		const quick = !fast || g * f0 <= NARROW_GAIN_SPEED * gbw;
		const shortfall = stages.some((s) => s.stockShortfall);
		// the fewest that are quick enough from the stock; else the one that loses least
		const rank = [quick ? 0 : 1, shortfall ? 1 : 0, quick ? m : lossOf(m)];
		if (best === null || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && (rank[1] < best.rank[1] || (rank[1] === best.rank[1] && rank[2] < best.rank[2] - 1e-12)))) best = { stages, rank };
		if (quick && !shortfall) break;
	}
	return best ? best.stages : null;
}

/** One stage of a circuit from the automatic search, or from the capacitors chosen by hand (`cap`: { C }, or { C1, C2 } for the multiple feedback one). */
function narrowStageDesign(circuit, wn, q, gain, opts, cap) {
	const C = cap?.C ?? cap?.C1;
	const manual = Number.isFinite(C) && C > 0;
	const stock = { resistorSeries: opts.resistorSeries, capacitors: opts.capacitors, pairs: opts.pairs, gain };
	switch (circuit) {
		case 'rlcGyrator': {
			// the gyrator is sized for the op-amp the comparison runs on: its lag moves f0 (rlcBandPass.js)
			const o = { ...stock, gbw: Number.isFinite(opts.realGbw) && opts.realGbw > 0 ? opts.realGbw : NARROW_REAL_GBW };
			return manual ? designRlcGyratorFromCap(wn, q, C, o) : designRlcGyrator(wn, q, o);
		}
		case 'rlcGic':
			return manual ? designRlcGicFromCap(wn, q, C, stock) : designRlcGic(wn, q, stock);
		case 'sallenKeyBp':
			return manual ? designSallenKeyBandPassFromCap(wn, q, C, stock) : designSallenKeyBandPass(wn, q, stock);
		case 'khnBp':
			return manual ? designKhnBandPassFromCap(wn, q, C, stock) : designKhnBandPass(wn, q, stock);
		case 'towThomasBp':
			return manual ? designTowThomasBandPassFromCap(wn, q, C, stock) : narrowTowThomas(wn, q, stock);
		case 'mfbBp': {
			const gbw = Number.isFinite(opts.gbw) && opts.gbw > 0 ? opts.gbw : null;
			const o = { resistorSeries: opts.resistorSeries, capacitors: opts.capacitors, pairs: opts.pairs, gain, gbw };
			if (manual) return designMfbBandPassFromCaps(wn, q, C, cap.C2 ?? C, o);
			return designMfbBandPass(wn, q, o);
		}
		default:
			return null;
	}
}

/** Whether a designer's answer is a built stage (null and { ok: false } are not). */
const narrowBuilt = (d) => Boolean(d) && d.ok !== false && Boolean(d.components);

/**
 * A Tow-Thomas band-pass stage for a narrow band. Its own designer
 * (towThomas.js, shared with the other filter types) picks the capacitor
 * on the resistor levels and weighs an f0 miss like a Q miss; near the
 * edges of a band of quality Q an f0 miss counts 2Q times as much, as the
 * four narrow designers weigh it. So each stocked capacitor is built too,
 * and the one that lands closest on that weighing is kept, the levels of
 * R, Rd and R1 breaking near ties.
 */
function narrowTowThomas(wn, q, opts) {
	const size = Math.abs(opts.gain);
	const score = (d) => {
		const a = d.actual;
		const miss = Math.max(Math.max(1, 2 * q) * Math.abs(Math.log(a.wn / wn)), Math.abs(Math.log(a.q / q)), Math.abs(Math.log(Math.abs(a.gain) / size)));
		const c = d.components;
		const level = Math.log(c.Ra / 1e4) ** 2 + 0.125 * (Math.log(c.Rd / 1e4) ** 2 + Math.log(c.R1 / 1e4) ** 2);
		return 1000 * miss * miss + level + smallCapPenalty(c.C1);
	};
	const auto = designTowThomasBandPass(wn, q, opts);
	let best = auto ? { d: auto, score: score(auto) } : null;
	for (const C of capacitorCandidates(opts.capacitors)) {
		const d = designTowThomasBandPassFromCap(wn, q, C, opts);
		if (!narrowBuilt(d) || d.outOfRange) continue;
		const s = score(d);
		if (best === null || s < best.score - 1e-12) {
			// an automatic stage: none of the flags of a capacitor chosen by hand
			const stage = { ...d };
			delete stage.ok;
			delete stage.manual;
			delete stage.outOfRange;
			best = { d: stage, score: s };
		}
	}
	return best ? best.d : null;
}

/**
 * Whether a built stage gives less than the gain it was asked for by its
 * very form (not by rounding): an RLC or a Sallen-Key with no divider
 * whose own centre gain is under it, a multiple feedback stage built at
 * gain 1 instead. Only such a stage calls for the gain stage.
 */
function narrowShort(circuit, stage, gain) {
	const own = stage.steps?.ownGain;
	if (circuit === 'rlcGic') return gain > 1 + 1e-9;
	if (circuit === 'rlcGyrator' || circuit === 'sallenKeyBp') return !stage.steps.divider && gain > own * (1 + 1e-9);
	if (circuit === 'mfbBp') return Math.abs(stage.steps.gainTarget - gain) > 1e-9 * gain;
	return false;
}

/**
 * One resonator stage as the page builds it: with the stock, else on the
 * full E24 and E6 grids (stockShortfall), as the other filter types do. A
 * multiple feedback stage that cannot reach the gain asked for (its
 * ceiling Q^2 (1 + C2/C1)) is built at gain 1 and the gain stage makes up
 * the rest. Capacitors chosen by hand are used as they are. Returns
 * { stage, short, why, failure }: stage null (with why, and the designer's
 * own failure for capacitors chosen by hand) when nothing builds it, short
 * as narrowShort says.
 */
function narrowResonator(circuit, wn, q, gain, opts, cap) {
	const manual = Boolean(cap) && (Number.isFinite(cap.C) || Number.isFinite(cap.C1));
	const tries = circuit === 'mfbBp' && gain > 1 ? [gain, 1] : [gain];
	let failure = null;
	for (const g of tries) {
		const d = narrowStageDesign(circuit, wn, q, g, opts, cap);
		if (narrowBuilt(d)) return { stage: d, short: narrowShort(circuit, d, gain), why: null, failure: null };
		if (manual) {
			failure = d;
			continue;
		}
		const grid = narrowStageDesign(circuit, wn, q, g, { ...opts, resistorSeries: 'E24', capacitors: null, pairs: false }, null);
		if (narrowBuilt(grid)) return { stage: { ...grid, stockShortfall: true }, short: narrowShort(circuit, grid, gain), why: null, failure: null };
	}
	let why = manual ? 'the capacitors chosen by hand cannot build this stage' : `no ${narrowLabelInText(circuit)} stage reaches Q = ${Number(q.toPrecision(3))} at this f0 with parts in range`;
	// a multiple feedback stage built for an op-amp: the op-amp, not the parts, may be what fails
	if (!manual && circuit === 'mfbBp' && Number.isFinite(opts.gbw) && opts.gbw > 0 && tries.some((g) => narrowBuilt(narrowStageDesign(circuit, wn, q, g, { ...opts, gbw: null }, null)))) {
		why = `the op-amp it is designed for (${formatHz(opts.gbw)}, single pole) is too slow to correct for at this f0 and Q, with no capacitors that leave it a loop gain of 2; designed for an ideal op-amp (panel 01) it builds, and then moves on the real part`;
	}
	return { stage: null, short: false, why, failure };
}

/** The stage's own centre gain, its size: what bode.js gives at its f0. */
function narrowStageGain(stage) {
	const h = responseAt([stage], stage.actual.wn / (2 * Math.PI));
	return Math.hypot(h.re, h.im);
}

/**
 * The narrow band-pass built on one circuit. `opts`: resistorSeries,
 * capacitors and pairs (the stock), gbw (Hz: the multiple feedback stages
 * built for a single-pole op-amp of that gain-bandwidth, as the page's
 * "Design the MFB stages for" asks; null for an ideal op-amp) and caps, an
 * array of capacitors chosen by hand per stage ({ C }, or { C1, C2 } for
 * the multiple feedback one; null or missing for the search).
 *
 * Each stage asks for the gain K^(1/N): circuits with a gain of their own
 * (the RLC: 1 for the GIC, under 1 for the gyrator; the Sallen-Key: 2
 * sqrt(2) Q_s - 1) bring it down with an input divider. When a stage
 * cannot reach its gain by its form (narrowShort: an RLC or a Sallen-Key
 * whose own gain is under it, a multiple feedback stage past its
 * ceiling), non-inverting gain stages after the last one add the rest,
 * the rounding of every stage included (designNarrowGainStages: one, or
 * up to three identical ones where one would be too slow on the TL082 or
 * past what a stocked ratio gives). An RLC stage followed by a gain stage
 * is built without its own follower (buffered false): the amplifier's +
 * input buffers it. realGbw (Hz, NARROW_REAL_GBW unless given) is the
 * op-amp the gain stages and the gyrator are sized for.
 *
 * Returns { circuit, label, ok, why, stages, resonators, gainStages,
 * gainStage (the first of them, or null), stageGains, opamps, parts:
 * { resistors, capacitors, total }, spread: { resistors, capacitors } }
 * where stages is the chain from the input to the output (what bode.js,
 * spice.js and the drawings take), ok false with why when a stage cannot
 * be built.
 */
export function realizeNarrow(design, circuit, { resistorSeries = 'E24', capacitors = null, pairs = false, gbw = null, caps = [], realGbw = NARROW_REAL_GBW } = {}) {
	const label = NARROW_LABELS[circuit] ?? circuit;
	const fail = (why) => ({ circuit, label, ok: false, why, stages: [], resonators: [], gainStages: [], gainStage: null, stageGains: [], opamps: null, parts: null, spread: null });
	if (!design || !NARROW_CIRCUITS.includes(circuit)) return fail('no design');
	const opts = { resistorSeries, capacitors, pairs, gbw, realGbw };
	const cache = new Map();
	const resonators = [];
	let short = false;
	for (const target of design.stages) {
		const cap = caps?.[target.index] ?? null;
		const key = JSON.stringify(cap ?? null);
		if (!cache.has(key)) cache.set(key, narrowResonator(circuit, target.wn, target.q, target.gain, opts, cap));
		const built = cache.get(key);
		if (!built.stage) return { ...fail(`stage ${target.index + 1}: ${built.why}`), failure: built.failure };
		resonators.push(built.stage);
		short = short || built.short;
	}
	const stageGains = resonators.map(narrowStageGain);
	const total = stageGains.reduce((p, g) => p * g, 1);
	// the gain stages make up what the stages' form leaves short, and their rounding with it
	let gainStages = [];
	if (short && design.gain / total > 1 + 1e-9) {
		gainStages = designNarrowGainStages(design.gain / total, design.f0, { resistorSeries, pairs, gbw: realGbw });
		if (!gainStages) return fail(`the chain gives ${Number(total.toPrecision(3))} at f0, and no stocked ratio of up to ${NARROW_MAX_GAIN_STAGES} gain stages makes up the ${Number((design.gain / total).toPrecision(3))} left`);
	}
	const chain = resonators.map((s) => ({ ...s }));
	// the gain stage's + input buffers an RLC tank: no follower before it
	if (gainStages.length && (circuit === 'rlcGyrator' || circuit === 'rlcGic')) chain[chain.length - 1] = { ...chain[chain.length - 1], buffered: false };
	const stages = [...chain, ...gainStages];
	const elements = narrowChainElements(stages);
	const resistors = elements.filter((e) => e.kind === 'R').map((e) => e.value);
	const caps2 = elements.filter((e) => e.kind === 'C').map((e) => e.value);
	const ratio = (list) => (list.length ? Math.max(...list) / Math.min(...list) : 1);
	return {
		circuit,
		label,
		ok: true,
		why: null,
		stages,
		resonators: chain,
		gainStages,
		gainStage: gainStages[0] ?? null,
		stageGains,
		opamps: elements.filter((e) => e.kind === 'OP').length,
		parts: { resistors: resistors.length, capacitors: caps2.length, total: resistors.length + caps2.length },
		spread: { resistors: ratio(resistors), capacitors: ratio(caps2) }
	};
}

/** The elements of a chain of stages from vin to vout, as the netlist numbers them (no labels). */
export function narrowChainElements(stages) {
	const out = [];
	let node = 'vin';
	stages.forEach((stage, k) => {
		const next = k === stages.length - 1 ? 'vout' : `st${k + 1}`;
		out.push(...stageElements(stage, k + 1, node, next));
		node = next;
	});
	return out;
}

/* ------------------------------------------------------------ measuring */

/**
 * H(j 2 pi f) of a chain solved from its netlist, stage by stage (every
 * stage is driven from an op-amp output, or for an RLC tank followed by
 * the gain stage, into an op-amp's + input, so the stages multiply), with
 * ideal op-amps or, with gbw (Hz), single-pole ones of that gain-bandwidth.
 * Returns a function of f.
 */
export function narrowNetlistResponse(stages, { gbw = null } = {}) {
	// identical stages are solved once and counted
	const groups = new Map();
	for (const s of stages) {
		const els = stageElements(s, 1, 'vin', 'vout');
		const key = JSON.stringify(els);
		if (groups.has(key)) groups.get(key).count++;
		else groups.set(key, { els, count: 1 });
	}
	const list = [...groups.values()];
	return (f) => {
		let re = 1;
		let im = 0;
		for (const { els, count } of list) {
			const h = nodalResponse(els, f, { gbw });
			for (let k = 0; k < count; k++) {
				const nre = re * h.re - im * h.im;
				im = re * h.im + im * h.re;
				re = nre;
			}
		}
		return { re, im };
	};
}

const narrowMag = (h) => Math.hypot(h.re, h.im);

/**
 * The figures of a band-pass response H(f) near f0: the peak (f0, its
 * frequency, and gain, the size of H there, signed by the real part of H
 * at the peak), the -3 dB edges f1 and f2 around it, B = f2 - f1 and Q =
 * f0 / B. The peak is sought from f0 / 2 to 2 f0, and when the largest
 * value sits on an end of that window (a slow op-amp can move the peak
 * that far), from f0 / 10 to 10 f0, then f0 / 100 to 100 f0, at the same
 * step; it is then refined by golden section. An edge is found by
 * bisection in log f (the response climbs to its peak and falls after
 * it). An edge farther than 1000 times off is null, and so then are B and
 * Q.
 */
export function narrowFigures(H, f0) {
	let grid = [];
	let bestI = 0;
	let N = 0;
	for (const span of [2, 10, 100]) {
		// 100 points per octave, about 0.7 % between points, whatever the window
		N = Math.round(200 * Math.log2(span));
		const lo = Math.log(f0 / span);
		const hi = Math.log(span * f0);
		let bestM = -Infinity;
		grid = [];
		for (let i = 0; i <= N; i++) {
			const f = Math.exp(lo + ((hi - lo) * i) / N);
			const m = narrowMag(H(f));
			grid.push(f);
			if (m > bestM) {
				bestM = m;
				bestI = i;
			}
		}
		if (bestI > 0 && bestI < N) break;
	}
	// golden section on log f between the grid neighbours
	let a = Math.log(grid[Math.max(0, bestI - 1)]);
	let b = Math.log(grid[Math.min(N, bestI + 1)]);
	const g = (Math.sqrt(5) - 1) / 2;
	let c = b - g * (b - a);
	let d = a + g * (b - a);
	let mc = narrowMag(H(Math.exp(c)));
	let md = narrowMag(H(Math.exp(d)));
	for (let k = 0; k < 40; k++) {
		if (mc > md) {
			b = d;
			d = c;
			md = mc;
			c = b - g * (b - a);
			mc = narrowMag(H(Math.exp(c)));
		} else {
			a = c;
			c = d;
			mc = md;
			d = a + g * (b - a);
			md = narrowMag(H(Math.exp(d)));
		}
	}
	const fPeak = Math.exp((a + b) / 2);
	const hPeak = H(fPeak);
	const peak = narrowMag(hPeak);
	const level = peak / Math.SQRT2;
	const edge = (inner, outer) => {
		if (narrowMag(H(Math.exp(outer))) > level) return null;
		let x = inner;
		let y = outer;
		for (let k = 0; k < 50; k++) {
			const m = (x + y) / 2;
			if (narrowMag(H(Math.exp(m))) > level) x = m;
			else y = m;
		}
		return Math.exp((x + y) / 2);
	};
	const f1 = edge(Math.log(fPeak), Math.log(fPeak / 1000));
	const f2 = edge(Math.log(fPeak), Math.log(fPeak * 1000));
	const B = f1 !== null && f2 !== null ? f2 - f1 : null;
	const gain = Math.sign(hPeak.re || 1) * peak;
	return { f0: fPeak, gain, gainDb: 20 * Math.log10(peak), f1, f2, B, q: B ? fPeak / B : null };
}

/** Relative errors of figures against the design: f0, Q and the size of the gain, as fractions. */
function narrowErrors(fig, design) {
	return {
		f0: fig.f0 / design.f0 - 1,
		q: fig.q === null ? null : fig.q / design.q - 1,
		gain: Math.abs(fig.gain) / design.gain - 1
	};
}

/* ------------------------------------------------------------ the choice */

/**
 * The rule that picks the default circuit. A circuit qualifies when,
 * built from the stock, it keeps f0 within a tenth of the bandwidth
 * (|df0/f0| <= 0.1/Q) and Q and K within 10 % (|dQ/Q|, |dK/K| <= 0.1),
 * both from its parts with ideal op-amps and on the single-pole TL082;
 * when it does not oscillate on that TL082; and when its Q moves at most
 * 2 % for 1 % off on any one part. Of those the fewest op-amps win, a tie
 * going to the one that lands closest (the largest of the errors, each
 * over its limit, of the worse of the two sets: `fit.rule`), then to
 * fewer parts. When none qualifies, the closest one that does not
 * oscillate.
 */
export const NARROW_RULE = { f0Share: 0.1, qTolerance: 0.1, gainTolerance: 0.1, sensitivityMax: 2 };

export const NARROW_RULE_TEXT =
	'The default circuit is the one with the fewest op-amps among those that, built from the stock, keep f0 within a tenth of the bandwidth and Q and K within 10 %, both from their parts with ideal op-amps and on a TL082, do not oscillate on the TL082, and whose Q moves at most 2 % for 1 % off on any one part. A tie goes to the one that lands closest, then to fewer parts. When none qualifies, the one that lands closest without oscillating.';

/** How far figures land, in units of the rule's limits: the largest of the f0, Q and gain errors, each over its limit (1 is on the limit). */
export function narrowFit(errors, design) {
	if (!errors || errors.q === null) return Infinity;
	return Math.max(Math.abs(errors.f0) / (NARROW_RULE.f0Share / design.q), Math.abs(errors.q) / NARROW_RULE.qTolerance, Math.abs(errors.gain) / NARROW_RULE.gainTolerance);
}

/** What keeps a set of figures out of the rule, as short phrases; `where` says which set (from the parts, on a TL082). */
function narrowMisses(e, design, where) {
	const out = [];
	if (!(Math.abs(e.f0) <= NARROW_RULE.f0Share / design.q)) out.push(`f0 off by more than a tenth of the bandwidth ${where}`);
	if (!(e.q !== null && Math.abs(e.q) <= NARROW_RULE.qTolerance)) out.push(`Q off by more than 10 % ${where}`);
	if (!(Math.abs(e.gain) <= NARROW_RULE.gainTolerance)) out.push(`K off by more than 10 % ${where}`);
	return out;
}

/**
 * Whether a chain oscillates: the poles of each distinct stage (nodalPoles,
 * the input shorted), with ideal op-amps or single-pole ones of gbw (Hz).
 * Every stage is driven from an op-amp output or into an op-amp input, so
 * the chain is stable when each of its stages is. Returns { oscillates,
 * freq (Hz, the right-most pole's frequency, or null), margin (minus the
 * largest Re(p)/|p|: about 1/(2Q) of the sharpest pole pair when
 * stable) }, or null when no stage has determinate poles.
 */
export function narrowStability(stages, { gbw = null, f0 } = {}) {
	const seen = new Set();
	let worst = null;
	for (const s of stages) {
		const els = stageElements(s, 1, 'vin', 'vout');
		const key = JSON.stringify(els);
		if (seen.has(key)) continue;
		seen.add(key);
		const scale = 2 * Math.PI * (Number.isFinite(f0) && f0 > 0 ? f0 : (s.actual?.wn ?? 2 * Math.PI * 1000) / (2 * Math.PI));
		const poles = nodalPoles(els, { gbw, scale });
		for (const p of poles ?? []) {
			const size = Math.hypot(p.re, p.im);
			if (!(size > 0)) continue;
			const rel = p.re / size;
			if (worst === null || rel > worst.rel) worst = { rel, p };
		}
	}
	if (worst === null) return null;
	const oscillates = worst.rel > 1e-9;
	return { oscillates, freq: oscillates ? Math.abs(worst.p.im) / (2 * Math.PI) : null, margin: -worst.rel };
}

/**
 * "Up to N pairs" for a narrow band-pass: its stages are identical, so
 * every one takes the same pairs. `realize(pairs)` builds the chain with
 * `pairs` (true, or the list of names allowed to pair). Pairs where they
 * help, when they fit the limit; else every subset of the names they pair
 * is built, and the one that lands closest from its parts (narrowFit,
 * the gain included) within the limit is kept, a tie going to fewer
 * pairs. `option` is the resistor stock. Returns { realized, limited,
 * limit, total, count, kept, dropped }.
 */
export function narrowLimitPairs(realize, limit, design, option) {
	const count = (r) => r.stages.reduce((n, s) => n + filterPairCount(s, option), 0);
	const full = realize(true);
	const total = full.ok ? count(full) : 0;
	if (!full.ok || total <= limit) return { realized: full, limited: false, limit, total, count: total, kept: [], dropped: [] };
	const names = [...new Set(full.stages.flatMap((s) => filterPairGroups(s, option).map((g) => g.name)))];
	let best = null;
	for (let mask = 0; mask < 2 ** names.length; mask++) {
		const allowed = names.filter((_, b) => mask & (1 << b));
		const r = realize(allowed);
		if (!r.ok) continue;
		const c = count(r);
		if (c > limit) continue;
		const fit = narrowFit(narrowErrors(narrowFigures((f) => responseAt(r.stages, f), design.f0), design), design);
		const closer = best === null || fit < best.fit * (1 - 1e-9) || (Math.abs(fit - best.fit) <= 1e-9 * Math.max(fit, best.fit) && c < best.count);
		if (closer) best = { realized: r, fit, count: c };
	}
	if (!best) return { realized: full, limited: false, limit, total, count: total, kept: [], dropped: [] };
	const kept = [...new Set(best.realized.stages.flatMap((s) => filterPairGroups(s, option).map((g) => g.name)))];
	return { realized: best.realized, limited: true, limit, total, count: best.count, kept, dropped: names.filter((n) => !kept.includes(n)) };
}

/** S^Q_x of every part of a resonator stage, by its topology: the formulas of sensitivity.js. */
export function narrowStageSensitivity(stage) {
	const c = stage.components;
	switch (stage.topology) {
		case 'rlcGyrator':
			return rlcGyratorSensitivity(c);
		case 'rlcGic':
			return rlcGicSensitivity(c);
		case 'sallenKeyBp':
			return sallenKeyBpSensitivity(c);
		case 'khnBp':
			return khnBpSensitivity(c);
		case 'mfbBp':
			return mfbBpSensitivity(c);
		case 'towThomasBp':
			// the inverter's two resistors (both r) set its gain, which Q follows as a square root
			return { ...TOW_THOMAS_BP_SENSITIVITY, r1: -0.5, r2: 0.5 };
		default:
			return null;
	}
}

/** The part Q is most sensitive to, { part, value } (value signed, compared by size). */
function narrowWorst(sens) {
	let worst = null;
	for (const [part, value] of Object.entries(sens ?? {})) if (worst === null || Math.abs(value) > Math.abs(worst.value)) worst = { part, value };
	return worst;
}

/**
 * Every circuit built for the design and measured, as the comparison
 * table shows it. `opts` as realizeNarrow takes them, plus realGbw (Hz,
 * NARROW_REAL_GBW unless given): the single-pole op-amp every circuit is
 * run on. Each row:
 *   circuit, label, ok, why, realized (realizeNarrow's result),
 *   opamps, parts, spread,
 *   sensitivity { parts, worst: { part, value } } (one resonator stage),
 *   ideal { figures, errors }   from the parts with ideal op-amps (bode.js,
 *                               as the page plots it; an MFB stage built
 *                               for an op-amp is read with that op-amp)
 *   real { figures, errors }    the netlist solved with the single-pole op-amp
 *   shift { f0, q, gainDb }     what that op-amp moves (real against ideal)
 *   stability                   narrowStability on that op-amp: { oscillates, freq, margin }
 *   fit { ideal, real, rule }   narrowFit of each, and the worse of the two
 *                               (Infinity when it oscillates), what the rule ranks by
 *   qualifies, reasons          under NARROW_RULE
 *   plan                        with pairs and a pairLimit: narrowLimitPairs' plan
 * A row that cannot be built has ok false, its why, and nulls. With
 * opts.pairLimit (a number) and pairs, each circuit is built within that
 * many resistors of two in series (narrowLimitPairs), as the page builds
 * the circuit it shows.
 */
export function compareNarrowCircuits(design, opts = {}) {
	const realGbw = Number.isFinite(opts.realGbw) && opts.realGbw > 0 ? opts.realGbw : NARROW_REAL_GBW;
	const limit = opts.pairs && Number.isFinite(opts.pairLimit) && opts.pairLimit >= 0 ? opts.pairLimit : null;
	const onTl082 = realGbw === NARROW_REAL_GBW ? 'on a TL082' : 'on the op-amp';
	return NARROW_CIRCUITS.map((circuit) => {
		const build = (pairs) => realizeNarrow(design, circuit, { ...opts, pairs, realGbw });
		const plan = limit !== null ? narrowLimitPairs(build, limit, design, opts.resistorSeries) : null;
		const realized = plan ? plan.realized : build(opts.pairs);
		const row = { circuit, label: realized.label, ok: realized.ok, why: realized.why, realized, plan, opamps: realized.opamps, parts: realized.parts, spread: realized.spread };
		if (!realized.ok) return { ...row, sensitivity: null, ideal: null, real: null, shift: null, stability: null, fit: { ideal: Infinity, real: Infinity, rule: Infinity }, qualifies: false, reasons: [realized.why] };
		const sens = narrowStageSensitivity(realized.resonators[0]);
		const idealFig = narrowFigures((f) => responseAt(realized.stages, f), design.f0);
		const realFig = narrowFigures(narrowNetlistResponse(realized.stages, { gbw: realGbw }), design.f0);
		const ideal = { figures: idealFig, errors: narrowErrors(idealFig, design) };
		const real = { figures: realFig, errors: narrowErrors(realFig, design) };
		const shift = { f0: realFig.f0 / idealFig.f0 - 1, q: realFig.q && idealFig.q ? realFig.q / idealFig.q - 1 : null, gainDb: realFig.gainDb - idealFig.gainDb };
		const stability = narrowStability(realized.stages, { gbw: realGbw, f0: design.f0 });
		const oscillates = Boolean(stability?.oscillates);
		const fitIdeal = narrowFit(ideal.errors, design);
		const fitReal = oscillates ? Infinity : narrowFit(real.errors, design);
		const fit = { ideal: fitIdeal, real: fitReal, rule: Math.max(fitIdeal, fitReal) };
		const worst = narrowWorst(sens);
		const reasons = [];
		if (oscillates) reasons.push(`oscillates ${onTl082}, near ${formatHz(stability.freq)}`);
		reasons.push(...narrowMisses(ideal.errors, design, 'from the parts'));
		if (!oscillates) reasons.push(...narrowMisses(real.errors, design, onTl082));
		if (!(worst && Math.abs(worst.value) <= NARROW_RULE.sensitivityMax)) reasons.push(`Q moves ${worst ? Math.abs(worst.value).toFixed(1) : '?'} % for 1 % on ${worst ? worst.part : 'a part'}`);
		return { ...row, sensitivity: { parts: sens, worst }, ideal, real, shift, stability, fit, qualifies: reasons.length === 0, reasons };
	});
}

/** The circuit NARROW_RULE picks from compareNarrowCircuits' rows (its key), or null when none can be built. */
export function narrowDefaultCircuit(rows) {
	const built = rows.filter((r) => r.ok);
	if (!built.length) return null;
	const qualified = built.filter((r) => r.qualifies);
	const steady = built.filter((r) => !r.stability?.oscillates);
	const byFit = (a, b) => a.fit.rule - b.fit.rule || a.parts.total - b.parts.total;
	if (qualified.length) return [...qualified].sort((a, b) => a.opamps - b.opamps || byFit(a, b))[0].circuit;
	return [...(steady.length ? steady : built)].sort(byFit)[0].circuit;
}
