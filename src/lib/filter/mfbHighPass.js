import { anyPairAllowed, capacitorCandidates, nearestCapacitor, pairAllowed, pairedResistor, smallCapPenalty, stockNeighbours } from './eseries';

/**
 * Multiple-feedback (MFB) high-pass, the standard equal-capacitor layout:
 * C1 from the input to the summing node, R1 from the summing node to
 * ground, C2 from the summing node to the inverting input, C3 from the
 * summing node to the output (feedback), R2 from the inverting input to
 * the output (feedback). Setting C1 = C2 = C3 = C (the standard
 * simplification) gives a gain of exactly -1 in the passband
 * (H(infinity) = -C1/C3 = -1) and reduces the design to solving two
 * resistors from two equations:
 *
 *   H(s) = -s^2 (C1/C3) / (s^2 + a*s + b)
 *   a = (C1+C2+C3) / (R2*C2*C3) = 3 / (R2*C)      [C1=C2=C3=C]
 *   b = 1 / (R1*R2*C2*C3)       = 1 / (R1*R2*C^2)
 *
 * Verified against a reference design (2nd-order Butterworth, 1 kHz
 * cutoff, C=1nF): normalized R1n=0.4714, R2n=2.1213 (omega_c=1 rad/s),
 * scaling to R1=75k, R2=336k - matches exactly.
 */

const MFB_HP_R_MIN = 200; // ohms, below this the op-amp output is loaded too hard
const MFB_HP_R_MAX = 2_000_000; // ohms, above this noise and leakage start to matter
const MFB_HP_R_SWEET = 10_000; // ohms, center of the range this search prefers

function solveMfbHpResistors(a, b, C) {
	const R2 = 3 / (a * C);
	const R1 = 1 / (b * R2 * C * C);
	return { R1, R2 };
}

function mfbHpSweetSpotScore(R1, R2) {
	return Math.log(R1 / MFB_HP_R_SWEET) ** 2 + Math.log(R2 / MFB_HP_R_SWEET) ** 2;
}

function scoreMfbHpResistors(R1, R2) {
	if (!(R1 > MFB_HP_R_MIN && R1 < MFB_HP_R_MAX && R2 > MFB_HP_R_MIN && R2 < MFB_HP_R_MAX)) return Infinity;
	return mfbHpSweetSpotScore(R1, R2);
}

/**
 * R1 and R2 rounded to stock, and the f0 and Q they give. With `pairs`
 * each may be two resistors in series, kept only when that leaves the
 * stage no further off than single parts, as in roundMfb (mfb.js). Here it
 * never has to refuse: f0 and Q share R1 and R2 evenly, so the stage's
 * larger miss is the mean of the two parts' own. A list of names in
 * `pairs` (pairAllowed in eseries.js) takes 'R1' and 'R2'.
 */
function roundMfbHp(R1, R2, C, wn, q, resistorSeries, pairs) {
	const round = (p) => {
		const R1n = pairedResistor(R1, resistorSeries, pairAllowed(p, 'R1'));
		const R2n = pairedResistor(R2, resistorSeries, pairAllowed(p, 'R2'));
		const aActual = 3 / (R2n * C);
		const bActual = 1 / (R1n * R2n * C * C);
		return { R1n, R2n, wn: Math.sqrt(bActual), q: Math.sqrt(bActual) / aActual };
	};
	const single = round(false);
	if (!anyPairAllowed(pairs)) return single;
	const paired = round(pairs);
	const miss = (r) => Math.max(Math.abs(Math.log(r.wn / wn)), Math.abs(Math.log(r.q / q)));
	return miss(paired) <= miss(single) ? paired : single;
}

/**
 * Searches a preferred capacitor series for a well-scaled C (used for all
 * three capacitors), then rounds the resulting resistors to a preferred
 * series and reports the actual wn/Q/gain the rounded values give (two in
 * series allowed with `pairs`, see roundMfbHp).
 */
export function designMfbHighPass(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const C of caps) {
		const { R1, R2 } = solveMfbHpResistors(a, b, C);
		const score = scoreMfbHpResistors(R1, R2) + smallCapPenalty(C);
		if (best === null || score < best.score) best = { C, R1, R2, score };
	}
	if (!best) return null;

	const r = roundMfbHp(best.R1, best.R2, best.C, wn, q, resistorSeries, pairs);

	return {
		topology: 'mfbHp',
		order: 2,
		theoretical: { R1: best.R1, R2: best.R2, C1: best.C, C2: best.C, C3: best.C },
		components: { R1: r.R1n, R2: r.R2n, C1: best.C, C2: best.C, C3: best.C },
		actual: { wn: r.wn, q: r.q, gain: -1 },
		steps: { a, b, C: best.C, resistorSeries }
	};
}

/**
 * Solves for R1/R2 from a capacitor C chosen by hand (e.g. to match what
 * is actually in stock), instead of searching a preferred series for it.
 * Unlike MFB low-pass, this always has a real solution: there is no
 * realizability ceiling on Q for this topology.
 */
export function designMfbHighPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const { R1, R2 } = solveMfbHpResistors(a, b, C);

	const r = roundMfbHp(R1, R2, C, wn, q, resistorSeries, pairs);
	const outOfRange = !(r.R1n > MFB_HP_R_MIN && r.R1n < MFB_HP_R_MAX && r.R2n > MFB_HP_R_MIN && r.R2n < MFB_HP_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'mfbHp',
		order: 2,
		theoretical: { R1, R2, C1: C, C2: C, C3: C },
		components: { R1: r.R1n, R2: r.R2n, C1: C, C2: C, C3: C },
		actual: { wn: r.wn, q: r.q, gain: -1 },
		steps: { a, b, C, resistorSeries },
		outOfRange
	};
}

/* ------------------------------------------------- candidates for a joint search */

/**
 * Every way the stock builds this stage, each judged on its rounded parts
 * (partSearch.js): every capacitor C (the one typed by hand, `caps.C`, when
 * there is one), R2 rounded to the stocked values just below and above its
 * ideal value, and R1 the same around its ideal value and around the one
 * that keeps f0 exact on the rounded R2 (stockNeighbours: two in series too
 * where `pairs` lets them). Every resistor stays in [rMin, rMax).
 * Returns light records { miss, wn, q, pairs, small, level, parts }, parts
 * = { C, R1, R2, R1n, R2n }, unsorted; mfbHighPassFromParts builds one.
 */
export function mfbHighPassCandidates(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = MFB_HP_R_MIN, rMax = MFB_HP_R_MAX } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const inRange = (r) => r.value >= rMin * (1 - 1e-9) && r.value < rMax;
	const pairR1 = pairAllowed(pairs, 'R1');
	const pairR2 = pairAllowed(pairs, 'R2');
	const out = [];
	for (const C of caps?.C > 0 ? [caps.C] : capacitorCandidates(capacitors)) {
		const { R1, R2 } = solveMfbHpResistors(a, b, C);
		if (R1 < rMin / 2 || R1 > rMax * 2 || R2 < rMin / 2 || R2 > rMax * 2) continue;
		const small = smallCapPenalty(C) > 0;
		for (const r2 of stockNeighbours(R2, resistorSeries, pairR2).filter(inRange)) {
			const seen = new Set();
			const r1s = [...stockNeighbours(R1, resistorSeries, pairR1), ...stockNeighbours(1 / (b * r2.value * C * C), resistorSeries, pairR1)].filter((r) => inRange(r) && !seen.has(r.value) && seen.add(r.value));
			for (const r1 of r1s) {
				const wnA = 1 / (C * Math.sqrt(r1.value * r2.value));
				const qA = (wnA * r2.value * C) / 3;
				const miss = Math.max(Math.abs(Math.log(wnA / wn)), Math.abs(Math.log(qA / q)));
				out.push({ miss, wn: wnA, q: qA, pairs: (r1.pair ? 1 : 0) + (r2.pair ? 1 : 0), small, level: mfbHpSweetSpotScore(r1.value, r2.value), parts: { C, R1, R2, R1n: r1.value, R2n: r2.value } });
			}
		}
	}
	return out;
}

/** The stage a record of mfbHighPassCandidates stands for, in the shape designMfbHighPass returns (with ok, manual and outOfRange for a capacitor typed by hand). */
export function mfbHighPassFromParts(wn, q, parts, { resistorSeries = 'E24', manual = false } = {}) {
	const { C, R1, R2, R1n, R2n } = parts;
	const wnA = 1 / (C * Math.sqrt(R1n * R2n));
	return {
		topology: 'mfbHp',
		order: 2,
		theoretical: { R1, R2, C1: C, C2: C, C3: C },
		components: { R1: R1n, R2: R2n, C1: C, C2: C, C3: C },
		actual: { wn: wnA, q: (wnA * R2n * C) / 3, gain: -1 },
		steps: { a: wn / q, b: wn * wn, C, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange: scoreMfbHpResistors(R1n, R2n) === Infinity } : {})
	};
}
