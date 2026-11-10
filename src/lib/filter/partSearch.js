import { bandBoctorDesign, OPAMPS_PER_STAGE, opampCount, plannedTopology } from './bandMethod';
import { combinerChoice, combinerDesign, branchDcGain, magnitudePhaseAt, magnitudePhaseAtParallelSum, responseAt } from './bode';
import { designBoctorNotch, designBoctorNotchFromCap } from './boctor';
import { stockResistor } from './eseries';
import { designFirstOrderLowPass, designFirstOrderLowPassFromCap, firstOrderCandidates, firstOrderFromParts } from './firstOrder';
import { designFirstOrderHighPass, designFirstOrderHighPassFromCap, firstOrderHighPassFromParts } from './firstOrderHighPass';
import { designMfbLowPass, designMfbLowPassFromCaps, mfbLowPassCandidates, mfbLowPassFromParts } from './mfb';
import { designMfbBandPass, designMfbBandPassFromCaps } from './mfbBandPass';
import { designMfbHighPass, designMfbHighPassFromCap, mfbHighPassCandidates, mfbHighPassFromParts } from './mfbHighPass';
import { nodalSolveAll } from './nodal';
import { filterPairCount, filterPairGroups, planFilterPairs } from './pairPlan';
import { designSallenKeyLowPass, designSallenKeyLowPassFromCaps, sallenKeyLowPassCandidates, sallenKeyLowPassFromParts } from './sallenKey';
import { designSallenKeyHighPass, designSallenKeyHighPassFromCap, sallenKeyHighPassCandidates, sallenKeyHighPassFromParts } from './sallenKeyHighPass';
import { stageElements } from './stageElements';
import { designBandPass, designBandPassTransformed, designBandStop, designBandStopTransformed, designHighPass, designLowPass, notchOptions } from './stages';
import { designTowThomasBandPass, designTowThomasBandPassFromCap, designTowThomasHighPass, designTowThomasHighPassFromCap, designTowThomasLowPass, designTowThomasLowPassFromCap, designTowThomasNotch, designTowThomasNotchFromCap, towThomasCandidates, towThomasFromParts, towThomasNotchCandidates, towThomasNotchFromParts } from './towThomas';

/**
 * Choosing the parts of a whole filter against its template.
 *
 * Each stage designer alone picks its capacitors on the ideal resistors and
 * rounds afterwards, never looking at the rest of the filter. Here every
 * stage first lists the ways the stock builds it, each judged on its rounded
 * parts (the designers' candidate functions: every capacitor choice, both
 * roots where there are two, each resistor just below and just above its
 * ideal value, two in series where the stock picker allows it), keeps the
 * closest ones and always the designer's own pick, and a beam search over
 * the stages followed by one- and two-stage moves then picks the set whose
 * cascade (the band-stop's parallel sum with its combiner) meets the
 * template best, measured the way the page measures it (measureFilter). A
 * design placed off the passband edge tries the parts of the same design on
 * the edge as well, so the search never ends further from the template than
 * the page's parts before the placement existed.
 * The order of preference:
 *   0. fewer stages on the full E24 and E6 grids (the stock cannot build them)
 *   1. the template met on the whole passband and the whole stopband, the
 *      worst passband loss within Amax + PASSBAND_SLACK_DB
 *   2. the larger margin, up to the ideal design's own (idealMargin of its
 *      placement, 0 on the passband edge): more is not sought, so the
 *      parts stay close to the response that was designed
 *   3. the response closest to the ideal one (the largest dB deviation over
 *      the passband and the transition band)
 *   4. fewer resistors two in series, then the earlier choice
 * The resistors of the searched stages start at PART_R_FLOOR and every
 * op-amp output must see at least PART_LOAD_MIN over the passband (its own
 * network and the next stage's input, from the stage netlists), since a
 * TL082 swings +-10 V only into 2 kohm or more. A design that meets the
 * template only past those limits, or misses it either way and comes closer
 * past them, keeps the designers' own range, and says so (alerts).
 */

/** Below this much over Amax the worst passband loss still counts as on spec, as on the page. */
export const PASSBAND_SLACK_DB = 0.05;
/** The smallest resistor of a searched stage. */
export const PART_R_FLOOR = 1000;
/** The smallest load an op-amp output may see over the passband. */
export const PART_LOAD_MIN = 2000;
/** The designers' own range, the fallback. */
const PS_R_MIN = 200;

/* ------------------------------------------------------------ the template */

/** The limit at f of a passband stretch: one Amax, or straight from one to the other on a log axis. */
function psLimitAt(range, f) {
	if (range.amaxFrom === range.amaxTo) return range.amaxFrom;
	return range.amaxFrom + ((range.amaxTo - range.amaxFrom) * Math.log(f / range.from)) / Math.log(range.to / range.from);
}

/** About where a TL082 stops swinging its full +-10 V (its full-power bandwidth, 13 V/us over 2 pi 10 V). */
const PS_FULL_SWING_HZ = 200000;

/**
 * How far up from its edge a passband that runs up is read for the loads:
 * its whole two decades below PS_FULL_SWING_HZ, past which the op-amp
 * cannot swing its full range anyway, and at least one decade (an edge
 * that high is read one decade up, where every capacitor coupled to an
 * output is nearly a short already).
 */
const psLoadTo = (edge) => Math.min(edge * 100, Math.max(edge * 10, PS_FULL_SWING_HZ));

/**
 * The template a design answers to, as the page measures it:
 *   pass        the passband stretches [{ from, to, amaxFrom, amaxTo }]: two
 *               decades below fp for a low-pass (above for a high-pass), fl
 *               to fh for a band-pass (the limit straight from one side's
 *               Amax to the other's), two decades out from fl and fh for a
 *               band-stop
 *   stop        the stopband stretches [{ from, to, aminDb }]: two decades out
 *               from each stopband edge, fsl to fsh for a band-stop
 *   transition  between the edges, where the closeness to the ideal is read too
 *   passEdges, stopEdges  [{ name, f, amaxDb | aminDb }]: fp, fs or fl, fh, fsl, fsh
 * A passband that runs up from its edge has loadTo too (psLoadTo): the
 * loads are read up to where a TL082 still swings its full range.
 *   parallel    a band-stop of two summed branches, the low-pass one the
 *               first lpCount stages
 */
export function filterTemplate(design) {
	const type = design.method === 'cascade' ? 'bandpass' : design.method === 'parallel' ? 'bandstop' : design.filterType;
	if (type === 'lowpass' || type === 'highpass') {
		const { fp, fs, amaxDb, aminDb } = design;
		const lp = type === 'lowpass';
		return {
			filterType: type,
			parallel: false,
			pass: [lp ? { from: fp / 100, to: fp, amaxFrom: amaxDb, amaxTo: amaxDb } : { from: fp, to: fp * 100, amaxFrom: amaxDb, amaxTo: amaxDb, loadTo: psLoadTo(fp) }],
			stop: [lp ? { from: fs, to: fs * 100, aminDb } : { from: fs / 100, to: fs, aminDb }],
			transition: [lp ? { from: fp, to: fs } : { from: fs, to: fp }],
			passEdges: [{ name: 'fp', f: fp, amaxDb }],
			stopEdges: [{ name: 'fs', f: fs, aminDb }]
		};
	}
	const { fl, fh, fsl, fsh } = design;
	const transformed = design.method === 'transformed';
	if (type === 'bandpass') {
		const amaxL = transformed ? design.amaxDb : design.amaxDbHp;
		const amaxH = transformed ? design.amaxDb : design.amaxDbLp;
		const aminL = transformed ? design.aminDbLow : design.aminDbHp;
		const aminH = transformed ? design.aminDbHigh : design.aminDbLp;
		return {
			filterType: type,
			parallel: false,
			pass: [{ from: fl, to: fh, amaxFrom: amaxL, amaxTo: amaxH }],
			stop: [
				{ from: fsl / 100, to: fsl, aminDb: aminL },
				{ from: fsh, to: fsh * 100, aminDb: aminH }
			],
			transition: [
				{ from: fsl, to: fl },
				{ from: fh, to: fsh }
			],
			passEdges: [
				{ name: 'fl', f: fl, amaxDb: amaxL },
				{ name: 'fh', f: fh, amaxDb: amaxH }
			],
			stopEdges: [
				{ name: 'fsl', f: fsl, aminDb: aminL },
				{ name: 'fsh', f: fsh, aminDb: aminH }
			]
		};
	}
	const amaxL = transformed ? design.amaxDb : design.amaxDbLp;
	const amaxH = transformed ? design.amaxDb : design.amaxDbHp;
	const amin = transformed ? design.aminDbLow : (design.aminDb ?? Math.max(design.aminDbLp, design.aminDbHp));
	return {
		filterType: type,
		parallel: !transformed,
		lpCount: transformed ? null : design.lp.stages.length,
		fsl,
		fsh,
		pass: [
			{ from: fl / 100, to: fl, amaxFrom: amaxL, amaxTo: amaxL },
			{ from: fh, to: fh * 100, amaxFrom: amaxH, amaxTo: amaxH, loadTo: psLoadTo(fh) }
		],
		stop: [{ from: fsl, to: fsh, aminDb: amin }],
		transition: [
			{ from: fl, to: fsl },
			{ from: fsh, to: fh }
		],
		passEdges: [
			{ name: 'fl', f: fl, amaxDb: amaxL },
			{ name: 'fh', f: fh, amaxDb: amaxH }
		],
		stopEdges: [
			{ name: 'fsl', f: fsl, aminDb: amin },
			{ name: 'fsh', f: fsh, aminDb: amin }
		]
	};
}

/**
 * The summing amplifier of a parallel band-stop, as the page builds it: the
 * sum or the difference (combinerChoice), the low-pass input resistor scaled
 * by that branch's DC gain and rounded to the stock (combinerDesign), and the
 * weights the response multiplies each branch by.
 */
export function bandStopCombiner(branches, fsl, fsh, { combinerR = 10000, resistorSeries = 'E24' } = {}) {
	const choice = combinerChoice(branches, fsl, fsh);
	const lpGain = Math.abs(branchDcGain(branches[0]));
	const parts = combinerDesign(choice.mode, combinerR, lpGain, (v) => stockResistor(v, resistorSeries));
	return { choice, lpGain, parts, weights: parts.weights };
}

/**
 * A realized filter measured against its template, the page's way: from the
 * peak of the passband (401 points per passband stretch, as passbandPeakDb),
 * the worst loss over the whole passband against its limit, and the least
 * attenuation over the stopband against its Amin (801 points per stretch, as
 * stopbandWorst). Returns
 *   peakDb      the passband peak
 *   pass        { loss, freq, limit, margin, edge }: the passband point with
 *               the least room (edge names it when it is fp, fl or fh, else null)
 *   passEdges   [{ name, freq, loss, amaxDb, margin }] at fp (fl and fh)
 *   stop        { db, freq, required, margin }: the stopband point with the
 *               least room, db its attenuation (the page's stopbandWorst)
 *   stopEdges   [{ name, freq, loss, aminDb, margin }] at fs (fsl and fsh)
 *   margin      the smaller of the two rooms, dB
 *   meets       pass.margin >= -PASSBAND_SLACK_DB and stop.margin >= -1e-6
 *   combiner    a parallel band-stop's summing amplifier (bandStopCombiner)
 *   gainDbAt    (f) => the response in dB the figures come from
 * A parallel band-stop takes combinerR and resistorSeries (the combiner's
 * resistors); `template` saves rebuilding filterTemplate(design).
 */
export function measureFilter(realized, design, { combinerR = 10000, resistorSeries = 'E24', template = null } = {}) {
	const t = template ?? filterTemplate(design);
	let combiner = null;
	let gainDbAt;
	if (t.parallel) {
		const branches = [realized.slice(0, t.lpCount), realized.slice(t.lpCount)];
		combiner = bandStopCombiner(branches, t.fsl, t.fsh, { combinerR, resistorSeries });
		gainDbAt = (f) => magnitudePhaseAtParallelSum(branches, f, combiner.weights).db;
	} else gainDbAt = (f) => magnitudePhaseAt(realized, f).db;
	const passPoints = [];
	let peak = -Infinity;
	for (const r of t.pass) {
		if (!(r.from > 0 && r.to > r.from)) continue;
		for (let i = 0; i <= 400; i++) {
			const f = r.from * (r.to / r.from) ** (i / 400);
			const db = gainDbAt(f);
			passPoints.push({ f, db, limit: psLimitAt(r, f) });
			peak = Math.max(peak, db);
		}
	}
	if (!Number.isFinite(peak)) peak = 0;
	let pass = { loss: 0, freq: null, limit: null, margin: Infinity, edge: null };
	for (const p of passPoints) {
		const loss = peak - p.db;
		if (p.limit - loss < pass.margin) pass = { loss, freq: p.f, limit: p.limit, margin: p.limit - loss, edge: null };
	}
	const edge = t.passEdges.find((e) => pass.freq !== null && Math.abs(pass.freq / e.f - 1) < 1e-9);
	if (edge) pass.edge = edge.name;
	let stop = { db: Infinity, freq: null, required: null, margin: Infinity };
	for (const r of t.stop) {
		for (let i = 0; i <= 800; i++) {
			const f = r.from * (r.to / r.from) ** (i / 800);
			const att = peak - gainDbAt(f);
			if (att - r.aminDb < stop.margin) stop = { db: att, freq: f, required: r.aminDb, margin: att - r.aminDb };
		}
	}
	const passEdges = t.passEdges.map((e) => {
		const loss = peak - gainDbAt(e.f);
		return { name: e.name, freq: e.f, loss, amaxDb: e.amaxDb, margin: e.amaxDb - loss };
	});
	const stopEdges = t.stopEdges.map((e) => {
		const loss = peak - gainDbAt(e.f);
		return { name: e.name, freq: e.f, loss, aminDb: e.aminDb, margin: loss - e.aminDb };
	});
	const margin = Math.min(pass.margin, stop.margin);
	return { template: t, peakDb: peak, pass, passEdges, stop, stopEdges, margin, meets: pass.margin >= -PASSBAND_SLACK_DB && stop.margin >= -1e-6, combiner, gainDbAt };
}

/* ---------------------------------------------------- the designers' picks */

const psFullGrid = (opts) => opts.resistorSeries === 'E24' && !opts.capacitors && !opts.pairs;

/** The menu a stage answers to: a transformed design's band-pass or notch menu, else its side's. */
function psMenu(stage, ctx) {
	if (ctx.transformed) return stage.filterType === 'bandpass' ? ctx.menus.bandpass : ctx.menus.notch;
	return stage.filterType === 'highpass' ? ctx.menus.highpass : ctx.menus.lowpass;
}

/**
 * One stage as its designer alone builds it, with the capacitors typed by
 * hand (farads) when there are: what the page has always shown, the search's
 * starting point and its fallback.
 */
function psDesignerBuild(stage, opts, ctx) {
	const ov = ctx.override;
	if (Number.isFinite(stage.wz)) {
		const plan = notchOptions(stage);
		// a transformed design sends a notch Boctor cannot build to Tow-Thomas, stage by stage
		const planned = ctx.transformed ? plannedTopology(stage, ctx.menus) : null;
		const boctor = planned ? planned.topology === 'boctor' || planned.topology === 'boctorHp' : psMenu(stage, ctx) === 'boctor';
		if (boctor) {
			const notchOpts = { ...opts, lowSide: plan.boctorLowSide };
			// the op-amp count already searched the full grid: a copy of that design, not a second search
			const found = psFullGrid(opts) ? bandBoctorDesign(stage.wn, stage.q, stage.wz, plan.boctorLowSide) : designBoctorNotch(stage.wn, stage.q, stage.wz, notchOpts);
			const auto = found && { ...found };
			if (!ov?.C) return auto;
			return designBoctorNotchFromCap(stage.wn, stage.q, stage.wz, ov.C, notchOpts) ?? (auto && { ...auto, manualError: 'This capacitor cannot realize the Boctor section with positive resistors in range. Showing the automatic values.' });
		}
		const notchOpts = { ...opts, ...plan.towThomas };
		const mark = (r) => (r && planned?.fallback ? { ...r, boctorFallback: planned.why } : r);
		if (ov?.C > 0) {
			const r = designTowThomasNotchFromCap(stage.wn, stage.q, stage.wz, ov.C, notchOpts);
			if (r.ok) return mark(r);
		}
		return mark(designTowThomasNotch(stage.wn, stage.q, stage.wz, notchOpts));
	}

	// a band-pass stage of a transformed design, held at its own centre gain
	if (stage.filterType === 'bandpass') {
		const bpOpts = { ...opts, gain: stage.gain };
		if (ctx.menus.bandpass === 'towThomas') {
			if (ov?.C > 0) {
				const r = designTowThomasBandPassFromCap(stage.wn, stage.q, ov.C, bpOpts);
				if (r.ok) return r;
			}
			return designTowThomasBandPass(stage.wn, stage.q, bpOpts);
		}
		const gbw = ctx.menus.gbw ?? null;
		const mfbOpts = gbw !== null ? { ...bpOpts, gbw } : bpOpts;
		const auto = designMfbBandPass(stage.wn, stage.q, mfbOpts);
		if (ov?.C1 > 0 || ov?.C2 > 0) {
			const C1 = ov?.C1 > 0 ? ov.C1 : auto?.components.C1;
			const C2 = ov?.C2 > 0 ? ov.C2 : auto?.components.C2;
			const r = designMfbBandPassFromCaps(stage.wn, stage.q, C1, C2, mfbOpts);
			if (r.ok) return r;
			// built for an op-amp, the circuit's own gain and Q set the ceiling
			const circuit = r.predistorted ?? { gain: stage.gain, q: stage.q };
			const why =
				r.why === 'opamp'
					? 'With this op-amp no circuit lands on this stage, whatever the capacitors: it is too slow at f0 to correct for.'
					: r.why === 'loop'
						? `With C2/C1 = ${(C2 / C1).toFixed(2)} the op-amp is left a loop gain of ${r.loopGain.toFixed(2)} at f0, under 2: too little to correct for. A smaller C2/C1 lowers the noise gain.`
						: circuit.gain >= r.maxGain
							? `C2/C1 = ${(C2 / C1).toFixed(2)} cannot give this stage its gain of ${circuit.gain.toFixed(3)} at Q = ${circuit.q.toFixed(4)}: the most it reaches is Q²(1 + C2/C1) = ${r.maxGain.toFixed(3)}, so C2/C1 must be above ${r.neededRatio.toFixed(2)}.`
							: 'These capacitors need a resistor outside what the stock can give.';
			return auto && { ...auto, manualError: `${why} Showing the automatic values below instead.` };
		}
		return auto;
	}

	const wiring = psMenu(stage, ctx);
	if (stage.filterType === 'highpass') {
		if (stage.order === 1) {
			if (ov?.C > 0) {
				const r = designFirstOrderHighPassFromCap(stage.tau, ov.C, opts);
				if (r.ok) return r;
			}
			return designFirstOrderHighPass(stage.tau, opts);
		}
		if (wiring === 'towThomas' || wiring === 'boctor') {
			if (ov?.C > 0) {
				const r = designTowThomasHighPassFromCap(stage.wn, stage.q, ov.C, opts);
				if (r.ok) return r;
			}
			return designTowThomasHighPass(stage.wn, stage.q, opts);
		}
		if (wiring === 'sallenKey') {
			if (ov?.C > 0) {
				const r = designSallenKeyHighPassFromCap(stage.wn, stage.q, ov.C, opts);
				if (r.ok) return r;
			}
			return designSallenKeyHighPass(stage.wn, stage.q, opts);
		}
		if (ov?.C > 0) {
			const r = designMfbHighPassFromCap(stage.wn, stage.q, ov.C, opts);
			if (r.ok) return r;
		}
		return designMfbHighPass(stage.wn, stage.q, opts);
	}

	if (stage.order === 1) {
		if (ov?.C > 0) {
			const r = designFirstOrderLowPassFromCap(stage.tau, ov.C, opts);
			if (r.ok) return r;
		}
		return designFirstOrderLowPass(stage.tau, opts);
	}
	if (wiring === 'towThomas' || wiring === 'boctor') {
		if (ov?.C > 0) {
			const r = designTowThomasLowPassFromCap(stage.wn, stage.q, ov.C, opts);
			if (r.ok) return r;
		}
		return designTowThomasLowPass(stage.wn, stage.q, opts);
	}
	if (wiring === 'sallenKey') {
		const auto = designSallenKeyLowPass(stage.wn, stage.q, opts);
		if ((ov?.Ctop > 0 || ov?.Cbottom > 0) && (auto || (ov?.Ctop > 0 && ov?.Cbottom > 0))) {
			const Ctop = ov?.Ctop > 0 ? ov.Ctop : auto.components.Ctop;
			const Cbottom = ov?.Cbottom > 0 ? ov.Cbottom : auto.components.Cbottom;
			const r = designSallenKeyLowPassFromCaps(stage.wn, stage.q, Ctop, Cbottom, opts);
			if (r.ok) return r;
		}
		return auto;
	}
	const auto = designMfbLowPass(stage.wn, stage.q, opts);
	if ((ov?.C1 > 0 || ov?.C2 > 0) && (auto || (ov?.C1 > 0 && ov?.C2 > 0))) {
		const C1 = ov?.C1 > 0 ? ov.C1 : auto.components.C1;
		const C2 = ov?.C2 > 0 ? ov.C2 : auto.components.C2;
		const r = designMfbLowPassFromCaps(stage.wn, stage.q, C1, C2, opts);
		if (r.ok) return r;
		return (
			auto && {
				...auto,
				manualError: `C1/C2 = ${(C1 / C2).toFixed(2)}:1 cannot realize Q = ${stage.q.toFixed(4)} for this stage (needs at least 8Q² = ${(8 * stage.q * stage.q).toFixed(1)}:1, i.e. C1 at least that many times C2). Showing the automatic values below instead.`
			}
		);
	}
	return auto;
}

/**
 * The stage as the page shows it without a search: built from the stock,
 * or from the full E24 / E6 grid, flagged stockShortfall, when the stock
 * cannot build it at all. null when neither can.
 */
export function designerStage(stage, i, { menus, transformed = false, resistorSeries = 'E24', capacitors = null, pairs = false, overrides = {} } = {}) {
	const ctx = { menus, transformed, override: overrides[i] };
	const built = psDesignerBuild(stage, { resistorSeries, capacitors, pairs }, ctx);
	if (built) return built;
	const fallback = psDesignerBuild(stage, { resistorSeries: 'E24', capacitors: null }, ctx);
	return fallback && { ...fallback, stockShortfall: true };
}

/* -------------------------------------------------------- stage candidates */

/** The topology a stage is built with under the menus, as the page builds it. */
function psTopology(stage, ctx) {
	if (ctx.transformed) {
		if (stage.filterType === 'bandpass') return ctx.menus.bandpass === 'towThomas' ? 'towThomasBp' : 'mfbBp';
		return plannedTopology(stage, ctx.menus).topology;
	}
	const hp = stage.filterType === 'highpass';
	const menu = psMenu(stage, ctx);
	if (Number.isFinite(stage.wz)) return menu === 'boctor' ? (notchOptions(stage).boctorLowSide ? 'boctor' : 'boctorHp') : 'towThomasNotch';
	if (stage.order === 1) return hp ? 'firstOrderHp' : 'firstOrder';
	if (menu === 'towThomas' || menu === 'boctor') return hp ? 'towThomasHp' : 'towThomas';
	if (menu === 'sallenKey') return hp ? 'sallenKeyHp' : 'sallenKey';
	return hp ? 'mfbHp' : 'mfb';
}

/** The topologies whose designers list candidates; the others (Boctor, the band-pass stages of a transformed design) give their one pick. */
const PS_SEARCHED = { mfb: true, mfbHp: true, sallenKey: true, sallenKeyHp: true, towThomas: true, towThomasHp: true, firstOrder: true, firstOrderHp: true, towThomasNotch: true };

/** The capacitors typed by hand that a topology reads, or null: C1 and C2 for MFB low-pass, Ctop and Cbottom for Sallen-Key low-pass, C for the rest. */
function psCaps(topology, ov) {
	if (!ov) return null;
	const keys = topology === 'mfb' ? ['C1', 'C2'] : topology === 'sallenKey' ? ['Ctop', 'Cbottom'] : ['C'];
	return keys.some((k) => ov[k] > 0) ? ov : null;
}

/** The light records of a searched stage (the designers' candidate functions). */
function psRecords(stage, topology, opts, caps, rMin) {
	const o = { resistorSeries: opts.resistorSeries, capacitors: opts.capacitors, pairs: opts.pairs, caps, rMin };
	if (topology === 'mfb') return mfbLowPassCandidates(stage.wn, stage.q, o);
	if (topology === 'mfbHp') return mfbHighPassCandidates(stage.wn, stage.q, o);
	if (topology === 'sallenKey') return sallenKeyLowPassCandidates(stage.wn, stage.q, o);
	if (topology === 'sallenKeyHp') return sallenKeyHighPassCandidates(stage.wn, stage.q, o);
	if (topology === 'towThomas' || topology === 'towThomasHp') return towThomasCandidates(stage.wn, stage.q, { ...o, highPass: topology === 'towThomasHp' });
	if (topology === 'firstOrder' || topology === 'firstOrderHp') return firstOrderCandidates(stage.tau, o);
	return towThomasNotchCandidates(stage.wn, stage.q, stage.wz, { ...o, ...notchOptions(stage).towThomas });
}

/** The full stage a record stands for. */
function psRealize(stage, topology, rec, opts, manual, ctx) {
	const o = { resistorSeries: opts.resistorSeries, manual };
	if (topology === 'mfb') return mfbLowPassFromParts(stage.wn, stage.q, rec.parts, o);
	if (topology === 'mfbHp') return mfbHighPassFromParts(stage.wn, stage.q, rec.parts, o);
	if (topology === 'sallenKey') return sallenKeyLowPassFromParts(stage.wn, stage.q, rec.parts, o);
	if (topology === 'sallenKeyHp') return sallenKeyHighPassFromParts(stage.wn, stage.q, rec.parts, o);
	if (topology === 'towThomas' || topology === 'towThomasHp') return towThomasFromParts(stage.wn, stage.q, rec.parts, { ...o, highPass: topology === 'towThomasHp' });
	if (topology === 'firstOrder') return firstOrderFromParts(stage.tau, rec.parts, o);
	if (topology === 'firstOrderHp') return firstOrderHighPassFromParts(stage.tau, rec.parts, o);
	const r = towThomasNotchFromParts(stage.wn, stage.q, stage.wz, rec.parts, { ...o, ...notchOptions(stage).towThomas });
	const planned = ctx.transformed ? plannedTopology(stage, ctx.menus) : null;
	return planned?.fallback ? { ...r, boctorFallback: planned.why } : r;
}

/** The smallest resistor a record of the candidate functions rounds to (by the names their parts give the rounded values). */
function psRecordLow(rec) {
	let low = Infinity;
	for (const k of PS_ROUNDED) if (rec.parts[k] !== undefined) low = Math.min(low, rec.parts[k]);
	return low;
}
const PS_ROUNDED = ['R1n', 'R2n', 'R', 'Rd', 'Rz', 'RtopN', 'RbottomN'];

/** The first `count` of a list by score, in order (as sorting it all would give them, ties in list order). */
function psFirst(list, count) {
	if (list.length > 4 * count) {
		const cut = psKth(Float64Array.from(list, (x) => x.score), count - 1);
		list = list.filter((x) => x.score <= cut);
	}
	return list.sort((a, b) => a.score - b.score);
}

/** The k-th smallest of a (from 0), by selection; a is reordered. */
function psKth(a, k) {
	let lo = 0;
	let hi = a.length - 1;
	while (lo < hi) {
		const pivot = a[(lo + hi) >> 1];
		let i = lo;
		let j = hi;
		while (i <= j) {
			while (a[i] < pivot) i++;
			while (a[j] > pivot) j--;
			if (i <= j) {
				const t = a[i];
				a[i] = a[j];
				a[j] = t;
				i++;
				j--;
			}
		}
		if (k <= j) hi = j;
		else if (k >= i) lo = i;
		else break;
	}
	return a[k];
}

/** The resistors of a built stage, as [name, ohms] entries. */
function psResistors(design) {
	return Object.entries(design.components ?? {}).filter(([k, v]) => /^R/.test(k) && typeof v === 'number');
}

/** Whether two built stages have the same response (the same f0, Q, zero, tau and gain). */
function psSameResponse(a, b) {
	if (a.topology !== b.topology) return false;
	const x = a.actual;
	const y = b.actual;
	const same = (u, v) => (u === undefined && v === undefined) || (Number.isFinite(u) && Number.isFinite(v) && Math.abs(u / v - 1) < 1e-12);
	return same(x.wn, y.wn) && same(x.q, y.q) && same(x.wz, y.wz) && same(x.tau, y.tau) && same(x.gain, y.gain);
}

/* -------------------------------------------------------- loads, by nodal analysis */

/** The loads of each built stage, for the frequencies they were read at. */
const PS_LOADS = new WeakMap();

/**
 * The frequencies a load is read at: nine per passband stretch, log-spaced,
 * its ends included (up to loadTo where it has one), and inside it, for
 * every stage of Q over 1 in `stages` (the targets), its f0 and half its
 * bandwidth either side: an output's least load sits at an end or near
 * there, in a dip the nine points can step over (with those points, the
 * least of 999 searched stages read within 0.1 % of 257 points). A
 * parallel band-stop's branch carries the signal over its own passband
 * only (branch 0 the low-pass one, below fl; 1 the high-pass one, above
 * fh), and is read there.
 */
function psLoadFrequencies(t, branch = null, stages = []) {
	const out = [];
	for (const r of branch === null ? t.pass : [t.pass[branch]]) {
		const to = r.loadTo ?? r.to;
		for (let i = 0; i <= 8; i++) out.push(r.from * (to / r.from) ** (i / 8));
		for (const s of stages) {
			if (!(s.order === 2 && s.q > 1 && s.wn > 0)) continue;
			const f0 = s.wn / (2 * Math.PI);
			for (const f of [f0 * (1 - 0.5 / s.q), f0, f0 * (1 + 0.5 / s.q)]) if (f > r.from && f < to) out.push(f);
		}
	}
	return out.sort((a, b) => a - b);
}

/**
 * A stage's op-amps at each load frequency, driven by 1 V: each output's
 * voltage and the current it delivers into the stage's own network (their
 * sizes in vAbs and iAbs, one row per op-amp), the stage output's own as
 * complex numbers (v, i), and the current the stage's input takes (its
 * input admittance, y). Each op-amp is { tag, output }: the tag of its name
 * in the netlist, '' for a stage's one op-amp, and whether it is the
 * stage's output. Kept per built stage.
 */
function psLoadData(design, freqs) {
	const cached = PS_LOADS.get(design);
	if (cached && cached.freqs === freqs) return cached.data;
	const data = psLoadDataOf(design, freqs);
	PS_LOADS.set(design, { freqs, data });
	return data;
}
function psLoadDataOf(design, freqs) {
	const els = stageElements(design, 0, 'vin', 'vout');
	if (!els.length) return null;
	const rows = nodalSolveAll(els, freqs);
	const opamps = rows[0].opamps.map((o) => ({ tag: o.name.slice(1, -1), output: o.node === 'vout' }));
	const out = opamps.findIndex((o) => o.output);
	return {
		opamps,
		vAbs: opamps.map((_, k) => Float64Array.from(rows, (row) => Math.hypot(row.opamps[k].voltage.re, row.opamps[k].voltage.im))),
		iAbs: opamps.map((_, k) => Float64Array.from(rows, (row) => Math.hypot(row.opamps[k].current.re, row.opamps[k].current.im))),
		out,
		v: rows.map((row) => (out >= 0 ? row.opamps[out].voltage : { re: 0, im: 0 })),
		i: rows.map((row) => (out >= 0 ? row.opamps[out].current : { re: 0, im: 0 })),
		y: rows.map((row) => row.source)
	};
}

/*
 * A load is read at the largest signal the filter passes at each frequency:
 * its input at full swing, or less where this output would swing past it.
 * At that signal the output delivers its current, and the load is the
 * resistor that would draw as much at full swing,
 *   load = max(|Vout|, 1 / |H before|) / |Iout|
 * per volt at the stage's input, H before the stages ahead of it (its
 * branch's, in a parallel band-stop). Where the output swings at least as
 * far as the filter's input this is |Vout| / |Iout|, the load itself. An
 * output that barely moves (a Tow-Thomas integrator far above its f0, a
 * branch deep in its stopband) delivers little current even into a near
 * short, and is not flagged for it. `floor` holds 1 / |H before| at each
 * frequency; atInput says the input's level set the figure. The pools
 * take the ideal stages ahead (one floor per stage, whatever is picked
 * before it); a whole set of parts, the one chosen and every set judged
 * on the limits, takes its own stages ahead.
 */

/** The least load the outputs of a stage see from the stage alone: { load, freq, opamp, output, atInput }. */
function psOwnLoad(data, freqs, floor) {
	let own = { load: Infinity, freq: null, opamp: null, output: false, atInput: false };
	if (!data) return own;
	data.opamps.forEach((o, k) => {
		const vAbs = data.vAbs[k];
		const iAbs = data.iAbs[k];
		for (let j = 0; j < freqs.length; j++) {
			const swing = Math.max(vAbs[j], floor[j]);
			const load = swing / iAbs[j];
			if (load < own.load) own = { load, freq: freqs[j], opamp: o.tag, output: o.output, atInput: vAbs[j] < floor[j] };
		}
	});
	return own;
}

/** The least load the output of stage a sees once stage b's input (or a resistor to ground, yLoad its admittance) hangs on it too: { load, freq, atInput }. */
function psCrossLoad(a, b, freqs, floor, yLoad = null) {
	if (!a || a.out < 0) return { load: Infinity, freq: null, atInput: false };
	let worst = { load: Infinity, freq: null, atInput: false };
	for (let j = 0; j < freqs.length; j++) {
		const v = a.v[j];
		const y = yLoad !== null ? { re: yLoad, im: 0 } : b ? b.y[j] : { re: 0, im: 0 };
		const ire = a.i[j].re + v.re * y.re - v.im * y.im;
		const iim = a.i[j].im + v.re * y.im + v.im * y.re;
		const vAbs = Math.hypot(v.re, v.im);
		const load = Math.max(vAbs, floor[j]) / Math.hypot(ire, iim);
		if (load < worst.load) worst = { load, freq: freqs[j], atInput: vAbs < floor[j] };
	}
	return worst;
}

/** 1 / |H before| at each load frequency for every stage: the stages ahead of it in its branch (stage 0 of a branch has 1), ideal or built. */
function psLoadFloors(stagesAhead, freqsAt, lpCount) {
	const n = stagesAhead.length;
	const floors = new Array(n);
	for (let i = 0; i < n; i++) {
		const freqs = freqsAt(i);
		const w = Float64Array.from(freqs, (f) => 2 * Math.PI * f);
		const first = lpCount !== null && i >= lpCount ? lpCount : 0;
		const before = new Float64Array(freqs.length).fill(1);
		for (let j = first; j < i; j++) {
			const r = psStageResponse(stagesAhead[j], w);
			for (let k = 0; k < freqs.length; k++) before[k] *= Math.hypot(r.re[k], r.im[k]);
		}
		floors[i] = Float64Array.from(before, (h) => 1 / Math.max(h, 1e-12));
	}
	return floors;
}

/**
 * The admittance a parallel band-stop's summing amplifier puts on the end of
 * branch b (0 the low-pass one), from its resistors: into the virtual ground
 * of a sum, RCA and RCB; for a difference RCL into the inverting input
 * (which sits at the high-pass branch's output, divided, and that is in its
 * stopband over the low-pass branch's passband, so near ground), and RCH
 * and RCG in series to ground.
 */
function psTerminalY(combiner, b) {
	const r = combiner.parts.resistors;
	if (combiner.parts.mode === 'difference') return b === 0 ? 1 / r.RCL : 1 / (r.RCH + r.RCG);
	return b === 0 ? 1 / r.RCA : 1 / r.RCB;
}

/* ----------------------------------------------------- the fast measure */

/**
 * The template's points for the search: the page's passband and stopband
 * points (every step-th, the ends kept), 41 points per transition stretch,
 * and for a parallel band-stop the centre of its stopband (where the
 * combiner is chosen). w in rad/s.
 */
function psGrid(t, step) {
	const pass = [];
	const stop = [];
	const trans = [];
	for (const r of t.pass) {
		if (!(r.from > 0 && r.to > r.from)) continue;
		for (let i = 0; i <= 400; i++) if (i % step === 0 || i === 400) {
			const f = r.from * (r.to / r.from) ** (i / 400);
			pass.push({ f, limit: psLimitAt(r, f) });
		}
	}
	for (const r of t.stop) for (let i = 0; i <= 800; i++) if (i % step === 0 || i === 800) stop.push({ f: r.from * (r.to / r.from) ** (i / 800), req: r.aminDb });
	for (const r of t.transition) for (let i = 0; i <= 40; i++) trans.push(r.from * (r.to / r.from) ** (i / 40));
	const freqs = [...pass.map((p) => p.f), ...stop.map((p) => p.f), ...trans, ...(t.parallel ? [Math.sqrt(t.fsl * t.fsh)] : [])];
	return {
		w: Float64Array.from(freqs, (f) => 2 * Math.PI * f),
		np: pass.length,
		ns: stop.length,
		nt: trans.length,
		passLimit: Float64Array.from(pass, (p) => p.limit),
		stopReq: Float64Array.from(stop, (p) => p.req),
		passLimitPow: Float64Array.from(pass, (p) => 10 ** (p.limit / 10)),
		stopReqPow: Float64Array.from(stop, (p) => 10 ** (p.req / 10)),
		centre: t.parallel ? freqs.length - 1 : -1
	};
}

/** The topologies bode.js evaluates from their parts rather than from f0 and Q. */
const PS_FROM_PARTS = { rlcGyrator: true, rlcGic: true, sallenKeyBp: true, khnBp: true };

/** A stage's response on the grid, re and im, as bode.js evaluates it; dc its gain at DC. */
function psStageResponse(design, w) {
	const n = w.length;
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	const a = design.actual;
	if ((design.topology === 'mfbBp' && Number.isFinite(a.gbw)) || PS_FROM_PARTS[design.topology]) {
		for (let k = 0; k < n; k++) {
			const h = responseAt([design], w[k] / (2 * Math.PI));
			re[k] = h.re;
			im[k] = h.im;
		}
		return { re, im, dc: responseAt([design], 0).re };
	}
	const hp = Boolean(design.topology?.endsWith('Hp'));
	if (design.order === 0) {
		re.fill(a.gain);
		return { re, im, dc: a.gain };
	}
	if (design.order === 1) {
		for (let k = 0; k < n; k++) {
			const t = a.tau * w[k];
			const d = 1 + t * t;
			re[k] = hp ? (t * t) / d : 1 / d;
			im[k] = hp ? t / d : -t / d;
		}
		return { re, im, dc: hp ? 0 : 1 };
	}
	const gain = a.gain ?? 1;
	const notch = Number.isFinite(a.wz);
	const bp = !notch && Boolean(design.topology?.endsWith('Bp'));
	const s1 = a.numeratorS ?? 0;
	const wn2 = a.wn * a.wn;
	const damp = a.wn / a.q;
	for (let k = 0; k < n; k++) {
		const x = w[k];
		const dr = wn2 - x * x;
		const di = damp * x;
		let nr = 0;
		let ni = 0;
		if (notch) {
			nr = gain * (a.wz * a.wz - x * x);
			ni = s1 * x;
		} else if (bp) ni = gain * damp * x;
		else if (hp) nr = -gain * x * x;
		else nr = gain * wn2;
		const dd = dr * dr + di * di;
		re[k] = (nr * dr + ni * di) / dd;
		im[k] = (ni * dr - nr * di) / dd;
	}
	const dc = notch ? (gain * a.wz * a.wz) / wn2 : bp || hp ? 0 : gain;
	return { re, im, dc };
}

/** dB of a response, |H| floored at 1e-12 as bode.js does. */
function psDb(re, im) {
	const out = new Float64Array(re.length);
	for (let k = 0; k < re.length; k++) out[k] = 10 * Math.log10(Math.max(re[k] * re[k] + im[k] * im[k], 1e-24));
	return out;
}

/**
 * The figures the order of preference reads, from a response in dB on the
 * grid: the room left in the passband and in the stopband (from the
 * passband peak), whether the template is met, the margin up to the ideal
 * design's, and the largest deviation from the ideal response's loss
 * (idealLoss) over the passband and transition points.
 */
function psJudgeDb(D, G, idealLoss, mIdeal) {
	let peak = -Infinity;
	for (let k = 0; k < G.np; k++) if (D[k] > peak) peak = D[k];
	let pass = Infinity;
	let dev = 0;
	for (let k = 0; k < G.np; k++) {
		const loss = peak - D[k];
		const m = G.passLimit[k] - loss;
		if (m < pass) pass = m;
		const d = Math.abs(loss - idealLoss[k]);
		if (d > dev) dev = d;
	}
	let stop = Infinity;
	for (let j = 0; j < G.ns; j++) {
		const m = peak - D[G.np + j] - G.stopReq[j];
		if (m < stop) stop = m;
	}
	const t0 = G.np + G.ns;
	for (let k = t0; k < t0 + G.nt; k++) {
		const d = Math.abs(peak - D[k] - idealLoss[k]);
		if (d > dev) dev = d;
	}
	const margin = Math.min(pass, stop);
	return { pass, stop, margin, meets: pass >= -PASSBAND_SLACK_DB && stop >= -1e-6, capped: Math.min(margin, mIdeal), dev };
}

/** The same figures from a response as |H|^2 (a parallel band-stop's sum), with idealLoss as 10^(loss/10): a few logarithms in all. */
function psJudgePower(P, G, idealLoss, mIdeal) {
	let peak = 0;
	for (let k = 0; k < G.np; k++) if (P[k] > peak) peak = P[k];
	// the least room in the passband is the least |H|^2 10^(limit/10), in the stopband the largest |H|^2 10^(Amin/10)
	let low = Infinity;
	for (let k = 0; k < G.np; k++) {
		const v = P[k] * G.passLimitPow[k];
		if (v < low) low = v;
	}
	let high = 0;
	for (let j = 0; j < G.ns; j++) {
		const v = P[G.np + j] * G.stopReqPow[j];
		if (v > high) high = v;
	}
	const peakDb = 10 * Math.log10(Math.max(peak, 1e-24));
	const pass = 10 * Math.log10(Math.max(low, 1e-300)) - peakDb;
	const stop = peakDb - 10 * Math.log10(Math.max(high, 1e-300));
	// the deviation from the ideal loss L is the largest |10 log(peak / (|H|^2 10^(L/10)))|: the ratio's two extremes
	let most = 0;
	let least = Infinity;
	const t0 = G.np + G.ns;
	for (let k = 0; k < t0 + G.nt; k++) {
		if (k === G.np) k = t0;
		const r = peak / (Math.max(P[k], 1e-24) * idealLoss[k]);
		if (r > most) most = r;
		if (r < least) least = r;
	}
	const dev = 10 * Math.max(Math.log10(most), -Math.log10(least));
	const margin = Math.min(pass, stop);
	return { pass, stop, margin, meets: pass >= -PASSBAND_SLACK_DB && stop >= -1e-6, capped: Math.min(margin, mIdeal), dev };
}

/** Margins closer than this (dB) are a tie, and so are deviations from the ideal closer than the next: the later rules then decide. */
const PS_MARGIN_TIE = 1e-3;
const PS_DEVIATION_TIE = 5e-3;

/** Whether judged solution a is better than b in the order of preference (not a tie); viol counts the outputs a search within the limits leaves short of their load. */
function psBetter(a, b) {
	if (a.short !== b.short) return a.short < b.short;
	if ((a.viol ?? 0) !== (b.viol ?? 0)) return (a.viol ?? 0) < (b.viol ?? 0);
	if (a.meets !== b.meets) return a.meets;
	if (Math.abs(a.capped - b.capped) > PS_MARGIN_TIE) return a.capped > b.capped;
	if (Math.abs(a.dev - b.dev) > PS_DEVIATION_TIE) return a.dev < b.dev;
	return a.pairs < b.pairs;
}
const psOrder = (a, b) => (psBetter(a.judge, b.judge) ? -1 : psBetter(b.judge, a.judge) ? 1 : 0);

/** Complex arrays: a times b into out (out may be a or b), and a fresh product of a list of responses { re, im, dc }. */
function psMul(a, b, out) {
	for (let k = 0; k < out.re.length; k++) {
		const re = a.re[k] * b.re[k] - a.im[k] * b.im[k];
		out.im[k] = a.re[k] * b.im[k] + a.im[k] * b.re[k];
		out.re[k] = re;
	}
	out.dc = a.dc * b.dc;
	return out;
}
function psProduct(list, len) {
	const out = { re: new Float64Array(len).fill(1), im: new Float64Array(len), dc: 1 };
	for (const r of list) psMul(out, r, out);
	return out;
}
const psComplex = (len) => ({ re: new Float64Array(len), im: new Float64Array(len), dc: 1 });

/**
 * The response of picks on the grid, judged, for the beam and the moves. A
 * cascade sums the stages' dB. A parallel band-stop multiplies each branch
 * out, chooses its combiner as the page does (combine) and judges the sum's
 * |H|^2. The beam extends a partial set (the stages still to choose at their
 * ideal response); the moves start from a full set (prepare) and change one
 * or two stages of it (tryChange).
 */
function psEvaluator(G, pools, ideal, lpCount, combine, idealLoss, mIdeal) {
	const n = pools.length;
	const len = G.w.length;
	const tmp = new Float64Array(len);
	if (lpCount === null) {
		const judge = (D) => psJudgeDb(D, G, idealLoss, mIdeal);
		// suffix[i] = the ideal stages from i on, summed
		const suffix = Array.from({ length: n + 1 }, () => new Float64Array(len));
		for (let i = n - 1; i >= 0; i--) for (let k = 0; k < len; k++) suffix[i][k] = suffix[i + 1][k] + ideal[i].db[k];
		// each candidate with the ideal stages after it, kept: the beam tries it after many states
		const withSuffix = new Map();
		const tail = (i, c) => {
			let t = withSuffix.get(c);
			if (!t) {
				t = new Float64Array(len);
				const suf = suffix[i + 1];
				for (let k = 0; k < len; k++) t[k] = c.db[k] + suf[k];
				withSuffix.set(c, t);
			}
			return t;
		};
		return {
			start: () => new Float64Array(len),
			expand(acc, i, c) {
				const t = tail(i, c);
				for (let k = 0; k < len; k++) tmp[k] = acc[k] + t[k];
				return judge(tmp);
			},
			extend(acc, i, c) {
				const out = new Float64Array(len);
				for (let k = 0; k < len; k++) out[k] = acc[k] + c.db[k];
				return out;
			},
			prepare(picks) {
				const total = new Float64Array(len);
				picks.forEach((k, i) => {
					const db = pools[i][k].db;
					for (let j = 0; j < len; j++) total[j] += db[j];
				});
				return { picks, total };
			},
			tryChange(st, changes) {
				tmp.set(st.total);
				for (const [i, k] of changes) {
					const from = pools[i][st.picks[i]].db;
					const to = pools[i][k].db;
					for (let j = 0; j < len; j++) tmp[j] += to[j] - from[j];
				}
				return judge(tmp);
			}
		};
	}
	const idealLossPow = Float64Array.from(idealLoss, (v) => 10 ** (v / 10));
	const judge = (P) => psJudgePower(P, G, idealLossPow, mIdeal);
	const branchOf = (i) => (i < lpCount ? 0 : 1);
	const first = [0, lpCount];
	const sizes = [lpCount, n - lpCount];
	const sufLp = Array.from({ length: lpCount + 1 }, (_, i) => psProduct(ideal.slice(i, lpCount), len));
	const sufHp = Array.from({ length: n - lpCount + 1 }, (_, i) => psProduct(ideal.slice(lpCount + i, n), len));
	const s1 = psComplex(len);
	const s2 = psComplex(len);
	const s3 = psComplex(len);
	// each candidate times the ideal stages after it in its branch, kept: the beam tries it after many states
	const withSuffix = new Map();
	const tail = (i, c) => {
		if (!withSuffix.has(c)) withSuffix.set(c, psMul(c.resp, i < lpCount ? sufLp[i + 1] : sufHp[i - lpCount + 1], psComplex(len)));
		return withSuffix.get(c);
	};
	return {
		start: () => ({ lp: psProduct([], len), hp: psProduct([], len) }),
		expand(acc, i, c) {
			if (i < lpCount) return judge(combine(psMul(acc.lp, tail(i, c), s2), sufHp[0], tmp));
			return judge(combine(acc.lp, psMul(acc.hp, tail(i, c), s2), tmp));
		},
		extend(acc, i, c) {
			return i < lpCount ? { lp: psMul(acc.lp, c.resp, psComplex(len)), hp: acc.hp } : { lp: acc.lp, hp: psMul(acc.hp, c.resp, psComplex(len)) };
		},
		// per branch, the products of the picks before each stage and after it
		prepare(picks) {
			const pre = [0, 1].map((b) => {
				const out = [psProduct([], len)];
				for (let j = 0; j < sizes[b]; j++) out.push(psMul(out[j], pools[first[b] + j][picks[first[b] + j]].resp, psComplex(len)));
				return out;
			});
			const post = [0, 1].map((b) => {
				const out = new Array(sizes[b] + 1);
				out[sizes[b]] = psProduct([], len);
				for (let j = sizes[b] - 1; j >= 0; j--) out[j] = psMul(out[j + 1], pools[first[b] + j][picks[first[b] + j]].resp, psComplex(len));
				return out;
			});
			return { picks, pre, post, mid: new Map() };
		},
		tryChange(st, changes) {
			const branch = [0, 1].map((b) => {
				const here = changes.filter(([i]) => branchOf(i) === b).map(([i, k]) => [i - first[b], pools[i][k].resp]);
				if (!here.length) return st.pre[b][sizes[b]];
				const out = b === 0 ? s1 : s2;
				if (here.length === 1) {
					const [j, c] = here[0];
					return psMul(psMul(st.pre[b][j], c, out), st.post[b][j + 1], out);
				}
				const [[ja, ca], [jb, cb]] = here[0][0] < here[1][0] ? here : [here[1], here[0]];
				// the picks between the two changed stages, kept for the other pairs of the same two stages
				const key = `${b} ${ja} ${jb}`;
				if (!st.mid.has(key)) st.mid.set(key, psProduct(Array.from({ length: jb - ja - 1 }, (_, m) => pools[first[b] + ja + 1 + m][st.picks[first[b] + ja + 1 + m]].resp), len));
				psMul(psMul(st.pre[b][ja], ca, out), st.mid.get(key), out);
				return psMul(psMul(out, cb, s3), st.post[b][jb + 1], out);
			});
			return judge(combine(branch[0], branch[1], tmp));
		}
	};
}

/* ---------------------------------------------------------- the search */

/** A pool member's loads (psLoadData), solved the first time they are asked for. */
function psLoadsOf(m) {
	if (m.loadData === undefined) m.loadData = psLoadData(m.design, m.freqs);
	return m.loadData;
}

/** Whether candidate c of stage i may follow the pick before it (pool members): the earlier output must see PART_LOAD_MIN with c's input on it. */
function psLoadOk(prev, c) {
	if (!prev) return true;
	// the beam asks for the same two members again and again: kept on the earlier one
	prev.follows ??= new Map();
	let ok = prev.follows.get(c);
	if (ok === undefined) {
		const a = psLoadsOf(prev);
		const b = psLoadsOf(c);
		ok = !a || !b || psCrossLoad(a, b, prev.freqs, prev.floor).load >= PART_LOAD_MIN * (1 - 1e-9);
		prev.follows.set(c, ok);
	}
	return ok;
}

/**
 * The beam over the stages, with the stages still to choose at their ideal
 * response, then one- and two-stage moves from the best state of each
 * pair count. States are kept apart by the pairs they use, each count up to
 * PS_PAIR_COUNTS with its own `width` best, the larger ones together, with
 * a limit or without: a larger limit only adds states, and so do pairs
 * where they help, so the best they find is never worse than a smaller
 * limit's (exactly up to PS_PAIR_COUNTS pairs, past it all but always).
 * `cross` holds, per stage, whether its pick must
 * leave the one before it PART_LOAD_MIN (false where no two candidates can):
 * a set that does not is kept, but ranks below every set that does.
 * Returns the best solution of each pair count [{ picks, judge }] (judged on
 * the grid: the caller judges them on the page's measure), [] when no set fits.
 */
function psBeam(pools, E, ctx) {
	const { limit, width, cross } = ctx;
	const n = pools.length;
	let states = [{ picks: [], pairs: 0, short: 0, viol: 0, acc: E.start() }];
	for (let i = 0; i < n; i++) {
		const next = [];
		for (const st of states) {
			const prev = i > 0 ? pools[i - 1][st.picks[i - 1]] : null;
			for (let k = 0; k < pools[i].length; k++) {
				const c = pools[i][k];
				const pairs = st.pairs + c.pairs;
				if (limit !== null && pairs > limit) continue;
				const short = st.short + (c.short ? 1 : 0);
				const viol = st.viol + (cross[i] && !psLoadOk(prev, c) ? 1 : 0);
				next.push({ st, k, pairs, short, viol, judge: { ...E.expand(st.acc, i, c), pairs, short, viol } });
			}
		}
		if (!next.length) return [];
		const buckets = new Map();
		for (const x of next) {
			const key = Math.min(x.pairs, PS_PAIR_COUNTS + 1);
			if (!buckets.has(key)) buckets.set(key, []);
			buckets.get(key).push(x);
		}
		states = [];
		for (const list of buckets.values()) {
			list.sort(psOrder);
			for (const x of list.slice(0, width)) states.push({ picks: [...x.st.picks, x.k], pairs: x.pairs, short: x.short, viol: x.viol, acc: E.extend(x.st.acc, i, pools[i][x.k]), judge: x.judge });
		}
	}
	// the moves, from the best state of each pair count, each kept within its own count
	const starts = new Map();
	for (const st of states) {
		const key = Math.min(st.pairs, PS_PAIR_COUNTS + 1);
		if (!starts.has(key) || psBetter(st.judge, starts.get(key).judge)) starts.set(key, st);
	}
	// (the larger counts move within the limit)
	return [...starts.values()].map((st) => psDescend({ picks: st.picks.slice(), judge: st.judge }, pools, E, { ...ctx, budget: st.pairs > PS_PAIR_COUNTS ? limit : st.pairs }));
}

/** One- and two-stage moves from a solution while they improve it, within the pair budget and the load rule. */
function psDescend(sol, pools, E, ctx) {
	const { budget, cross, moves } = ctx;
	const n = pools.length;
	let picks = sol.picks;
	let cur = sol.judge;
	let st = E.prepare(picks);
	let pairs = picks.reduce((s, k, i) => s + pools[i][k].pairs, 0);
	let short = picks.reduce((s, k, i) => s + (pools[i][k].short ? 1 : 0), 0);
	// the outputs left short of their load, between stage i - 1 and i
	const violAt = (p, i) => (i > 0 && cross[i] && !psLoadOk(pools[i - 1][p[i - 1]], pools[i][p[i]]) ? 1 : 0);
	const violOf = (p) => p.reduce((s, _, i) => s + violAt(p, i), 0);
	let viol = violOf(picks);
	// the judge of the picks with `changes` ([stage, candidate]), or null when they break the budget
	const attempt = (changes) => {
		let p2 = pairs;
		let s2 = short;
		const p = picks.slice();
		for (const [i, k] of changes) {
			p2 += pools[i][k].pairs - pools[i][picks[i]].pairs;
			s2 += (pools[i][k].short ? 1 : 0) - (pools[i][picks[i]].short ? 1 : 0);
			p[i] = k;
		}
		if (budget !== null && p2 > budget) return null;
		// only the boundaries next to a changed stage can change
		const near = new Set(changes.flatMap(([i]) => [i, i + 1]).filter((i) => i < n));
		let v2 = viol;
		for (const i of near) v2 += violAt(p, i) - violAt(picks, i);
		return { ...E.tryChange(st, changes), pairs: p2, short: s2, viol: v2 };
	};
	const accept = (changes, judge) => {
		picks = picks.slice();
		for (const [i, k] of changes) picks[i] = k;
		cur = judge;
		pairs = judge.pairs;
		short = judge.short;
		viol = judge.viol;
		st = E.prepare(picks);
	};
	for (let sweep = 0; sweep < 6; sweep++) {
		let improved = false;
		for (let i = 0; i < n; i++) {
			let bestChange = null;
			let bestJ = cur;
			for (let k = 0; k < pools[i].length; k++) {
				if (k === picks[i]) continue;
				const j = attempt([[i, k]]);
				if (j && psBetter(j, bestJ)) {
					bestJ = j;
					bestChange = [[i, k]];
				}
			}
			if (bestChange) {
				accept(bestChange, bestJ);
				improved = true;
			}
		}
		if (improved || n < 2) continue;
		for (let i = 0; i < n && !improved; i++) {
			for (let j = i + 1; j < n; j++) {
				let bestChange = null;
				let bestJ = cur;
				const ki = Math.min(moves, pools[i].length);
				const kj = Math.min(moves, pools[j].length);
				for (let a = 0; a < ki; a++) {
					for (let b = 0; b < kj; b++) {
						if (a === picks[i] || b === picks[j]) continue;
						const change = [
							[i, a],
							[j, b]
						];
						const jj = attempt(change);
						if (jj && psBetter(jj, bestJ)) {
							bestJ = jj;
							bestChange = change;
						}
					}
				}
				if (bestChange) {
					accept(bestChange, bestJ);
					improved = true;
				}
			}
		}
		if (!improved) break;
	}
	return { picks, judge: cur };
}

/* ---------------------------------------------------------- the pools */

/** The ideal stage of a target, as a realized stage bode.js reads: its targets as its actual figures, the gain and sign the built stage has. */
function psIdealStage(stage, built) {
	const sign = Math.sign(built?.actual?.gain ?? 1) || 1;
	const hp = stage.filterType === 'highpass';
	if (stage.order === 1) return { order: 1, topology: hp ? 'firstOrderHp' : 'firstOrder', actual: { tau: stage.tau } };
	if (stage.filterType === 'bandpass') return { order: 2, topology: 'idealBp', actual: { wn: stage.wn, q: stage.q, gain: sign * stage.gain } };
	if (Number.isFinite(stage.wz)) {
		// a notch held at gain 1 at DC, far above its zero, or at the gain that leaves it 1 at f0
		const plan = notchOptions(stage).towThomas;
		const size = plan.gain !== undefined ? plan.gain : plan.lowSide ? (stage.wn * stage.wn) / (stage.wz * stage.wz) : 1;
		return { order: 2, topology: 'idealNotch', actual: { wn: stage.wn, q: stage.q, wz: stage.wz, gain: sign * size } };
	}
	return { order: 2, topology: hp ? 'idealHp' : 'ideal', actual: { wn: stage.wn, q: stage.q, gain: sign } };
}

/** The smallest resistor of a built stage, the inverter's matched pair left out. */
function psMinResistor(design) {
	const rs = psResistors(design).filter(([k]) => k !== 'r');
	return rs.length ? Math.min(...rs.map(([, v]) => v)) : Infinity;
}

/**
 * The pool of one stage: the designers' own picks first (`picks`, each
 * once), then for a searched topology its candidates by their miss after
 * rounding (a pair has to buy 0.2 % of it, a capacitor under C_FLOOR only
 * when nothing else builds the stage), up to `size` distinct responses for
 * each of `targets` ([{ stage, placedFor }]: the stage, and the same stage
 * of the design on the passband edge, whose candidates are marked
 * placedFor 'edge'). Every member is built with `topology`, the circuit
 * the op-amp count was made for. `floor` is the stage's 1 / |H before| at
 * each load frequency (psLoadFloors), terminalY the admittance the
 * combiner puts on a band-stop branch's end, else null. Where capacitors
 * were typed for the stage, the members built from them come first: the
 * designer's automatic values (manualError) only when nothing else is.
 */
function psStagePool(targets, topology, picks, opts, ctx, G, freqs, size, floor, terminalY) {
	const members = [];
	const add = (design, source, pairs = filterPairCount(design, opts.resistorSeries)) => {
		if (!design || design.topology !== topology) return false;
		const twin = (m) => m.pairs === pairs && Boolean(m.design.manualError) === Boolean(design.manualError) && psSameResponse(m.design, design);
		if (members.some((m) => m.design === design || twin(m))) return false;
		// (one shape for every member, its loads solved once asked for (psLoadsOf), its response once in a pool)
		members.push({ design, source, pairs, short: Boolean(design.stockShortfall), loadData: undefined, follows: null, minR: psMinResistor(design), freqs, floor, resp: null, db: null });
		return true;
	};
	for (const p of picks) if (p) add(p, 'designer');
	const searched = PS_SEARCHED[topology];
	const caps = searched ? psCaps(topology, ctx.override) : null;
	const typed = Boolean(ctx.override) && Object.values(ctx.override).some((v) => v > 0);
	// the `size` best candidates whose resistors start at rMin, by their miss after rounding
	// (listed once from PS_R_MIN, the floor's taken out of them)
	const taken = new Set();
	const listed = new Map();
	const take = (rMin) => {
		if (!searched || taken.has(rMin)) return;
		taken.add(rMin);
		targets.forEach(({ stage, placedFor }, t) => {
			if (!listed.has(t)) listed.set(t, psRecords(stage, topology, opts, caps, PS_R_MIN));
			const all = listed.get(t);
			const recs = rMin > PS_R_MIN ? all.filter((r) => psRecordLow(r) >= rMin * (1 - 1e-9)) : all;
			const anyBig = recs.some((r) => !r.small);
			const list = psFirst((anyBig ? recs.filter((r) => !r.small) : recs).map((r) => ({ r, score: r.miss + 0.002 * r.pairs + 1e-6 * r.level })), 6 * size);
			let added = 0;
			for (let j = 0; j < list.length && added < size && j < 6 * size; j++) {
				const design = psRealize(stage, topology, list[j].r, opts, Boolean(caps), ctx);
				if (placedFor) design.placedFor = placedFor;
				if (add(design, 'search', list[j].r.pairs)) added++;
			}
		});
	};
	const respond = (pool) => {
		for (const m of pool) {
			if (m.db) continue;
			m.resp = psStageResponse(m.design, G.w);
			m.db = psDb(m.resp.re, m.resp.im);
		}
		return pool;
	};
	const honours = (m) => !m.design.manualError;
	const typedFirst = (list) => (typed && list.some(honours) ? list.filter(honours) : list);
	const floorOk = (m) => !PS_SEARCHED[m.design.topology] || m.minR >= PART_R_FLOOR * (1 - 1e-9);
	// the end of a band-stop branch drives the combiner too
	const loadOf = (m) => {
		const data = psLoadsOf(m);
		const own = psOwnLoad(data, freqs, floor).load;
		return terminalY === null ? own : Math.min(own, psCrossLoad(data, null, freqs, floor, terminalY).load);
	};
	const loadOk = (m) => !psLoadsOf(m) || loadOf(m) >= PART_LOAD_MIN * (1 - 1e-9);
	return {
		/**
		 * Within the limits: a searched stage's resistors from PART_R_FLOOR, every
		 * output of a pick PART_LOAD_MIN from the stage itself; a stage none of
		 * whose candidates can is built without them, and relaxed says which gave
		 * way. The capacitors typed by hand come before the limits: when no
		 * member built from them keeps the limits, those past them are taken.
		 */
		strict() {
			take(PART_R_FLOOR);
			const within = members.filter((m) => floorOk(m) && loadOk(m));
			if (typed && !within.some(honours)) {
				take(PS_R_MIN);
				const kept = members.filter(honours);
				if (kept.length) return { pool: respond(kept), relaxed: kept.some(floorOk) ? 'load' : 'floor' };
			}
			if (within.length) return { pool: respond(typedFirst(within)), relaxed: null };
			const relaxed = members.some(floorOk) ? 'load' : 'floor';
			take(PS_R_MIN);
			return { pool: respond(typedFirst(members.slice())), relaxed };
		},
		/** The designers' own range, the candidates within the limits kept too. */
		loose() {
			take(PART_R_FLOOR);
			take(PS_R_MIN);
			return { pool: respond(typedFirst(members.slice())), relaxed: null };
		},
		/** Whether capacitors were typed for the stage and some member is built from them: no set of parts may then do without them. */
		get honoured() {
			return typed && members.some(honours);
		}
	};
}

/* ---------------------------------------------------------- the entry point */

const PS_CACHE = new Map();
const PS_CACHE_SIZE = 24;
/** The largest pair limit whose parts of today seed the pools (the stock picker offers 20). */
const PS_LIMIT_MOST = 20;
/** The pair counts the beam keeps apart, each with its own states; more pairs share one more (psBeam). */
const PS_PAIR_COUNTS = 6;
/** A design placed off the passband edge that misses its template by less than this (dB) tries the edge design's own search too. */
const PS_EDGE_RETRY_DB = 1;

/** The designers' picks, remembered across searches (a new pair limit or placement asks for most of them again). Shared: read them, copy to change. */
const PS_PICKS = new Map();
const PS_PICKS_SIZE = 4000;
const psTargetKey = (s) => [s.order, s.filterType, s.wn, s.q, s.wz, s.tau, s.gain, s.gainAt, s.hfGain, s.notch, s.w0];
// a list of values goes in a pick's key as a number of its own rather than its hundreds of values
const PS_LIST_IDS = new WeakMap();
let psListCount = 0;
function psListKey(v) {
	if (v === null || typeof v !== 'object') return v;
	if (!PS_LIST_IDS.has(v)) PS_LIST_IDS.set(v, `list ${++psListCount}`);
	return PS_LIST_IDS.get(v);
}
function psPick(stage, { menus, transformed, resistorSeries, capacitors, pairs, override }) {
	const key = JSON.stringify([psTargetKey(stage), menus, transformed, psListKey(resistorSeries), psListKey(capacitors), pairs, override ?? null]);
	if (PS_PICKS.has(key)) return PS_PICKS.get(key);
	const design = designerStage(stage, 0, { menus, transformed, resistorSeries, capacitors, pairs, overrides: override ? { 0: override } : {} });
	if (PS_PICKS.size >= PS_PICKS_SIZE) PS_PICKS.delete(PS_PICKS.keys().next().value);
	PS_PICKS.set(key, design);
	return design;
}

/**
 * The op-amps of what searchFilterParts builds, as opampCount (bandMethod.js)
 * counts them: a stage of a design placed off the passband edge that its
 * circuit cannot reach there (an MFB band-pass stage whose Q or gain the
 * placement moves past what it gives) is built as the same stage of the
 * design on the edge, and counted so. edgeOnly lists those stages (from 1).
 * The page and the script choose a band filter's method on this count.
 */
export function placedOpampCount(design, menus) {
	const count = opampCount(design, menus);
	if (!count) return null;
	if (!count.unavailable || (design.placement?.mode ?? 'edge') === 'edge') return { ...count, edgeOnly: [] };
	const twin = psEdgeTwin(design);
	if (!twin || twin.stages.length !== design.stages.length) return { ...count, edgeOnly: [] };
	let opamps = design.method === 'parallel' ? 1 : 0;
	let unavailable = null;
	const fallbacks = [];
	const edgeOnly = [];
	const topologies = design.stages.map((stage, i) => {
		let plan = plannedTopology(stage, menus);
		if (plan.unavailable) {
			const onEdge = plannedTopology(twin.stages[i], menus);
			if (!onEdge.unavailable) {
				plan = onEdge;
				edgeOnly.push(i + 1);
			}
		}
		if (!plan.unavailable) opamps += OPAMPS_PER_STAGE[plan.topology];
		else if (unavailable === null) unavailable = `stage ${i + 1}: ${plan.unavailable}`;
		if (plan.fallback) fallbacks.push(i + 1);
		return plan.topology;
	});
	return { opamps: unavailable ? Infinity : opamps, stages: design.stages.length, unavailable, fallbacks, topologies, edgeOnly };
}

/**
 * The parts of a whole filter, chosen against its template.
 *   design     designLowPass / designHighPass / designBandPass / designBandStop
 *              / designBandPassTransformed / designBandStopTransformed
 *   menus      the topology menus, as plannedTopology (bandMethod.js) takes
 *              them: { method: 'cascade', highpass, lowpass } for a low-pass,
 *              high-pass, cascade or parallel design (the one Topology menu
 *              in both for a low-pass or high-pass), { method: 'transformed',
 *              bandpass, notch, gbw } for a transformed one
 *   resistorSeries, capacitors, pairs, pairLimit   the stock (componentOptions)
 *   overrides  the capacitors typed by hand, in farads: { [stage]: { C } or
 *              { C1, C2 } or { Ctop, Cbottom } }
 *   combinerR  a parallel band-stop's summing resistor
 *   search     false: today's parts, each stage's designer alone (the pairs
 *              shared out by planFilterPairs under a limit)
 * Returns
 *   stages     the realized stages, in the shape their designers return, or
 *              null for a stage that cannot be built (then nothing else is set)
 *   measure    measureFilter of those stages
 *   baseline   { stages, measure }: the designers' own parts, for comparison
 *   ideal      { stages, measure, margin }: the ideal design and the margin
 *              the search aims at (0 on the passband edge)
 *   picks      per stage 'designer' (a designer's own pick) or 'search'
 *   fromEdge   per stage true when its parts come from the same design on
 *              the passband edge (they then carry placedFor: 'edge'), whose
 *              targets they were rounded around (edgeDesignOf)
 *   edgeOnly   per stage true when its circuit cannot reach the stage where
 *              the design is placed, so it is built as on the passband edge
 *              (fromEdge too; placedOpampCount counts it the same way)
 *   relaxed    per stage null, 'floor' or 'load': the limit that gave way there
 *   withinLimits  whether the parts chosen keep the limits (its stages may
 *              still give way where no candidate keeps them: relaxed), false
 *              when only the designers' own range met the template or came
 *              closer to it
 *   alerts     [{ stage, kind: 'floor', resistor, value } | { stage, kind:
 *              'load', opamp, output, load, freq, atInput, on }]: every
 *              resistor of a searched stage under PART_R_FLOOR and every op-amp
 *              output that sees less than PART_LOAD_MIN in the parts chosen
 *              (atInput: the output swings less than the filter's input there,
 *              and the load is the resistor that would draw its current at
 *              full swing; on: 'next' or 'combiner' when the next stage's
 *              input or the summing amplifier on the output made it the
 *              least, null for the stage's own network), with manual true for
 *              a stage whose capacitors were typed by hand
 *   loads      per stage the least load of its outputs { load, freq, opamp, output, atInput, on }
 *   pairPlan   with a pair limit, the shape planFilterPairs returns (limited,
 *              limit, total, count, stages[{ option, design, count, kept,
 *              dropped, short }]), for filterPairPlanSummary and
 *              filterPairLimitSentence; else null
 *   ms         the time it took
 * The result is remembered for the same design and settings, and shared:
 * read it, copy it to change it.
 */
export function searchFilterParts(design, settings) {
	const { menus, resistorSeries = 'E24', capacitors = null, pairs = false, pairLimit = null, overrides = {}, combinerR = 10000, search = true } = settings;
	const key = JSON.stringify([design.stages.map(psTargetKey), filterTemplate(design), design.placement?.mode ?? null, menus, resistorSeries, capacitors, pairs, pairLimit, overrides, combinerR, search]);
	if (PS_CACHE.has(key)) return PS_CACHE.get(key);
	const result = psSearchFilter(design, { menus, resistorSeries, capacitors, pairs, pairLimit, overrides, combinerR, search });
	if (PS_CACHE.size >= PS_CACHE_SIZE) PS_CACHE.delete(PS_CACHE.keys().next().value);
	PS_CACHE.set(key, result);
	return result;
}

function psSearchFilter(design, settings) {
	const t0 = Date.now();
	const { menus, resistorSeries, capacitors, pairs, pairLimit, overrides, combinerR, search } = settings;
	const transformed = design.method === 'transformed';
	const stages = design.stages;
	const n = stages.length;
	const template = filterTemplate(design);
	const opts = { resistorSeries, capacitors, pairs };
	const limit = pairs && pairLimit !== null && pairLimit !== undefined ? pairLimit : null;
	const ctxOf = (i) => ({ menus, transformed, override: overrides[i] });
	const measureOpts = { combinerR, resistorSeries, template };

	// A design placed off the passband edge searches the parts of the same
	// design on the edge too (its twin): the page's parts before the placement
	// existed, and the candidates around those targets. Whatever the
	// placement, the template is the same, and the search then never ends
	// further from it than those parts.
	// (none where the placement found no room: the same stages)
	const sameStages = (d) => JSON.stringify(d.stages.map(psTargetKey)) === JSON.stringify(stages.map(psTargetKey));
	const twinDesign = (design.placement?.mode ?? 'edge') !== 'edge' && !sameStages(psEdgeTwin(design)) ? psEdgeTwin(design) : null;
	const twin = twinDesign && twinDesign.stages.length === n ? twinDesign.stages : null;
	// the designers' own picks, each built once
	const pickHere = (i, p) => psPick(stages[i], { menus, transformed, resistorSeries, capacitors, pairs: p, override: overrides[i] });
	const memoT = new Map();
	const pickT = (i, p) => {
		const k = `${i} ${JSON.stringify(p)}`;
		if (!memoT.has(k)) {
			const d = psPick(twin[i], { menus, transformed, resistorSeries, capacitors, pairs: p, override: overrides[i] });
			memoT.set(k, d && { ...d, placedFor: 'edge' });
		}
		return memoT.get(k);
	};
	// a stage its circuit cannot reach where the design is placed is built as on the edge
	const edgeOnly = stages.map((_, i) => Boolean(twin) && !pickHere(i, pairs) && Boolean(pickT(i, pairs)));
	const pick = (i, p) => (edgeOnly[i] ? pickT(i, p) : pickHere(i, p));
	const targetStages = stages.map((s, i) => (edgeOnly[i] ? twin[i] : s));
	// the circuit of each stage, the one its op-amps were counted for (placedOpampCount): every set of parts is built with it
	const topologies = targetStages.map((s, i) => psTopology(s, ctxOf(i)));
	const counted = (list) => list.every((d, i) => d && d.topology === topologies[i]);
	const baselineFor = (lim) => (lim === null ? stages.map((_, i) => pick(i, pairs)) : planFilterPairs(targetStages, (i, p) => pick(i, p), resistorSeries, lim).stages.map((s) => s.design));
	const baseline = baselineFor(limit);
	const empty = { measure: null, baseline: { stages: baseline, measure: null }, ideal: null, picks: [], relaxed: [], alerts: [], loads: [], pairPlan: null };
	if (baseline.some((s) => !s)) return { ...empty, stages: baseline, fromEdge: [], edgeOnly, withinLimits: null, ms: Date.now() - t0 };
	const baselineMeasure = measureFilter(baseline, design, measureOpts);
	const idealStages = stages.map((s, i) => psIdealStage(s, baseline[i]));
	const idealMeasure = measureFilter(idealStages, design, measureOpts);
	const mIdeal = (design.placement?.mode ?? 'edge') === 'edge' ? 0 : Math.max(0, idealMeasure.margin);
	const ideal = { stages: idealStages, measure: idealMeasure, margin: mIdeal };
	// the load frequencies of each stage, with the peaks of the stages read there: a parallel band-stop's branch over its own passband
	const lpCount = template.parallel ? template.lpCount : null;
	const peaksOf = (from, to) => targetStages.slice(from, to);
	const branchFreqs = lpCount !== null ? [psLoadFrequencies(template, 0, peaksOf(0, lpCount)), psLoadFrequencies(template, 1, peaksOf(lpCount, n))] : null;
	const freqs = branchFreqs ? null : psLoadFrequencies(template, null, peaksOf(0, n));
	const freqsAt = (i) => (branchFreqs ? branchFreqs[i < lpCount ? 0 : 1] : freqs);
	const floors = psLoadFloors(idealStages, freqsAt, lpCount);
	// what the summing amplifier of a parallel band-stop puts on each branch's end, from its resistors
	const terminalOf = (combiner) => (i) => (lpCount !== null && combiner && (i === lpCount - 1 || i === n - 1) ? psTerminalY(combiner, i === n - 1 ? 1 : 0) : null);
	// (a set of parts read with its own stages ahead of each)
	const alertsOf = (list, combiner) => psAlerts(list, template, freqsAt, psLoadFloors(list, freqsAt, lpCount), terminalOf(combiner), overrides);
	const finish = (chosen, picks, pairPlan) => {
		const measure = chosen === baseline ? baselineMeasure : measureFilter(chosen, design, measureOpts);
		const { alerts, loads } = alertsOf(chosen, measure.combiner);
		// where the limits gave way: a resistor under the floor first, else an output under its load
		const relaxed = chosen.map((_, i) => (alerts.some((a) => a.stage === i && a.kind === 'floor') ? 'floor' : alerts.some((a) => a.stage === i && a.kind === 'load') ? 'load' : null));
		return { stages: chosen, measure, baseline: { stages: baseline, measure: baselineMeasure }, ideal, picks, relaxed, alerts, loads, pairPlan, ms: Date.now() - t0 };
	};
	if (!search) return { ...finish(baseline, stages.map(() => 'designer'), null), fromEdge: baseline.map((d) => d.placedFor === 'edge'), edgeOnly, withinLimits: null };

	const twinBaselineFor = (lim) => (lim === null ? twin.map((_, i) => pickT(i, pairs)) : planFilterPairs(twin, (i, p) => pickT(i, p), resistorSeries, lim).stages.map((s) => s.design));
	// The designer's picks every pool starts with: the parts of today's page
	// for every pair limit up to the pairs where they help would use (the
	// same pools whatever the limit, and without one: a larger limit loses
	// nothing, and pairs where they help lose nothing to a limit), single
	// parts, and for a stage that lists no candidates its pair options.
	const usedBy = (list) => list.reduce((sum, d) => sum + filterPairCount(d, resistorSeries), 0);
	const limitsUpTo = (own) => {
		if (!pairs) return [null];
		const most = Math.min(PS_LIMIT_MOST, usedBy(Array.from({ length: n }, (_, i) => own(i, true)).filter(Boolean)));
		return Array.from({ length: most + 1 }, (_, m) => m);
	};
	// (the order too stays the same whatever the limit: ties go to the earlier member)
	const baselines = limitsUpTo(pick).map((m) => baselineFor(m));
	if (twin) {
		for (const m of limitsUpTo(pickT)) {
			const b = twinBaselineFor(m);
			if (counted(b)) baselines.push(b);
		}
	}
	// a set of today's parts is a whole answer only within the limit
	const fits = (list) => limit === null || usedBy(list) <= limit;
	const optionsOf = (i, own) => {
		const list = [own(i, false)];
		if (pairs) {
			list.push(own(i, true));
			if (!PS_SEARCHED[topologies[i]]) {
				const names = (filterPairGroups(own(i, true), resistorSeries) ?? []).map((g) => g.name);
				for (let m = 1; m < names.length; m++) for (const sub of psSubsets(names, m)) list.push(own(i, sub));
			}
		}
		return list;
	};
	const pickLists = stages.map((s, i) => [...baselines.map((b) => b[i]), ...optionsOf(i, pick), ...(twin && !edgeOnly[i] ? optionsOf(i, pickT) : [])].filter(Boolean));
	// today's parts at this very limit are a whole answer too (beyond the pairs where they help would use, the same as theirs)
	if (!baselines.includes(baseline)) baselines.push(baseline);

	// the beam and the moves on part of the page's grid (every second point, every fourth for a
	// parallel band-stop or a long cascade), the final choice on all of it
	const big = n > 8;
	const G = psGrid(template, lpCount !== null || big ? 4 : 2);
	const terminal = terminalOf(baselineMeasure.combiner);
	// (the twin brings its designers' picks and today's parts; its own candidates come with the edge design's search below)
	const targetsOf = (i) => [edgeOnly[i] ? { stage: twin[i], placedFor: 'edge' } : { stage: stages[i], placedFor: null }];
	const size = big ? 10 : 16;
	const stagePools = stages.map((s, i) => psStagePool(targetsOf(i), topologies[i], pickLists[i], opts, ctxOf(i), G, freqsAt(i), size, floors[i], terminal(i)));
	// one search: within the limits (strict) or in the designers' own range
	const run = (strict) => {
		const built = stagePools.map((sp) => (strict ? sp.strict() : sp.loose()));
		const pools = built.map((b) => b.pool);
		const relaxed = built.map((b) => b.relaxed);
		const len = G.w.length;
		const idealResp = idealStages.map((s) => {
			const r = psStageResponse(s, G.w);
			return { ...r, db: psDb(r.re, r.im) };
		});
		const combine = psCombiner(G, lpCount, combinerR, resistorSeries);
		const idealD =
			lpCount === null
				? idealResp.reduce((acc, r) => acc.map((v, k) => v + r.db[k]), new Float64Array(len))
				: psPowerDb(combine(psProduct(idealResp.slice(0, lpCount), len), psProduct(idealResp.slice(lpCount), len), new Float64Array(len)));
		const E = psEvaluator(G, pools, idealResp, lpCount, combine, psLossCurve(idealD, G), mIdeal);
		// the load rule between two stages, unless the stage after a branch's end (a band-stop's high-pass branch starts at the source),
		// and unless no candidate of the one can leave any candidate of the other its load: that output gives way
		const cross = stages.map((_, i) => strict && i > 0 && !(lpCount !== null && i === lpCount));
		cross.forEach((c, i) => {
			if (c && !pools[i - 1].some((a) => pools[i].some((b) => psLoadOk(a, b)))) {
				cross[i] = false;
				relaxed[i - 1] = relaxed[i - 1] ?? 'load';
			}
		});
		// with pairs, the same width for every count, with a limit or without
		const ctx = { limit, width: pairs ? (big ? 4 : 6) : big ? 8 : 12, cross, moves: big ? 3 : 6 };
		return { pools, relaxed, solutions: psBeam(pools, E, ctx), G };
	};

	// the solutions judged on the page's own measure: the search's best, and today's parts for every limit up to this one
	const X = psExactGrid(template, idealMeasure);
	const exactMemo = new Map();
	const ids = new Map();
	const idOf = (d) => {
		if (!ids.has(d)) ids.set(d, ids.size);
		return ids.get(d);
	};
	const exact = (list) => {
		const k = list.map(idOf).join(' ');
		if (!exactMemo.has(k)) exactMemo.set(k, psExactJudge(list, X, template, mIdeal, { combinerR, resistorSeries }));
		return exactMemo.get(k);
	};
	const strictRun = run(true);
	// each pair count's best of a run, judged on the page's own measure
	const solutionsOf = (r) => r.solutions.map((sol) => sol.picks.map((k, i) => r.pools[i][k].design));
	// a set keeps the limits where it can: its resistors from the floor and its outputs' loads (but on a stage no candidate could keep them on)
	const keepsLimits = (list) => {
		const { loads } = alertsOf(list, exact(list).combiner);
		return list.every((d, i) => {
			if (strictRun.relaxed[i]) return true;
			return loads[i].load >= PART_LOAD_MIN * (1 - 1e-9) && (!PS_SEARCHED[d.topology] || psMinResistor(d) >= PART_R_FLOOR * (1 - 1e-9));
		});
	};
	// the best set within the limits, and the best of every set tried
	let within = null;
	let any = null;
	// where some way to build a stage keeps the capacitors typed for it, every set of parts keeps them
	const honoured = stagePools.map((sp) => sp.honoured);
	// (every set judged, for a design placed off the edge whose search takes this one's: alternatives)
	const alternatives = [];
	// (keeps: whether the set keeps the limits, asked only of a set better than the best within them)
	const consider = (list, keeps) => {
		if (list.some((d, i) => honoured[i] && d.manualError)) return;
		alternatives.push(list);
		const j = exact(list).judge;
		if ((!within || psBetter(j, within.judge)) && keeps()) within = { list, judge: j };
		if (!any || psBetter(j, any.judge)) any = { list, judge: j };
	};
	for (const list of solutionsOf(strictRun)) consider(list, () => keepsLimits(list));
	// today's parts, within the limit
	for (const b of baselines) if (fits(b) && counted(b)) consider(b, () => keepsLimits(b));
	// Short of the ideal design's margin, the designers' own range is searched
	// too. A set it finds that keeps the limits all the same counts as one
	// within them (the search past them tries more), so a larger pair limit
	// never loses it; one that breaks them is kept only when nothing within
	// them meets the template, or when it comes closer to a template missed
	// either way (alerts say where).
	const short = !within || !within.judge.meets || within.judge.capped < mIdeal - PS_MARGIN_TIE;
	if (short) {
		for (const list of solutionsOf(run(false))) consider(list, () => keepsLimits(list));
	}
	// Short of it too, and not far from the template, a design placed off
	// the passband edge also takes the sets of parts the same design on the
	// edge judges in its own search, each as a whole answer judged here: the
	// candidates around the edge design's targets. (On the same condition as
	// above, so a larger pair limit, whose sets include a smaller one's,
	// never ends worse.)
	const fromEdgeSearch = new Map();
	if (twinDesign && short && any.judge.margin > -PS_EDGE_RETRY_DB) {
		const edge = searchFilterParts(twinDesign, settings);
		const copies = new Map();
		const copyOf = (d) => {
			if (!copies.has(d)) {
				const copy = { ...d, placedFor: 'edge' };
				copies.set(d, copy);
				fromEdgeSearch.set(copy, edge.designerPicks?.has(d) ? 'designer' : 'search');
			}
			return copies.get(d);
		};
		for (const list of edge.alternatives ?? [edge.stages]) {
			if (list.length !== n || !counted(list)) continue;
			const copied = list.map(copyOf);
			consider(copied, () => keepsLimits(copied));
		}
	}
	// (today's parts when nothing else fits at all)
	if (!any) any = { list: baseline, judge: exact(baseline).judge };
	const best = within && within.judge.meets ? within : any;
	const chosen = best.list;
	const picks = chosen.map((d, i) => (pickLists[i].includes(d) || fromEdgeSearch.get(d) === 'designer' ? 'designer' : 'search'));
	const fromEdge = chosen.map((d) => d.placedFor === 'edge');
	const pairPlan = limit === null ? null : psPairPlan(chosen, stages.map((_, i) => pick(i, true)), resistorSeries, limit);
	// (alternatives and designerPicks are for the search of the same design placed off the edge, which takes them)
	const designerPicks = new Set(pickLists.flat());
	return { ...finish(chosen, picks, pairPlan), fromEdge, edgeOnly, withinLimits: Boolean(within) && best.list === within.list, alternatives, designerPicks };
}

/** Every subset of `names` with `size` members, in order. */
function psSubsets(names, size) {
	const out = [];
	const walk = (start, acc) => {
		if (acc.length === size) {
			out.push(acc.slice());
			return;
		}
		for (let i = start; i < names.length; i++) {
			acc.push(names[i]);
			walk(i + 1, acc);
			acc.pop();
		}
	};
	walk(0, []);
	return out;
}

/** dB of a response given as |H|^2. */
function psPowerDb(P) {
	return Float64Array.from(P, (v) => 10 * Math.log10(Math.max(v, 1e-24)));
}

/** The ideal response's loss from its passband peak, on the grid. */
function psLossCurve(D, G) {
	let peak = -Infinity;
	for (let k = 0; k < G.np; k++) if (D[k] > peak) peak = D[k];
	return Float64Array.from(D, (v) => peak - v);
}

/** The combiner of a parallel band-stop on the grid, as bandStopCombiner chooses it, the two branches summed into |H|^2. */
function psCombiner(G, lpCount, combinerR, resistorSeries) {
	if (lpCount === null) return null;
	const c = G.centre;
	const rounded = new Map();
	return (lp, hp, out) => {
		const depth = (s) => -20 * Math.log10(Math.max(Math.hypot(s * lp.re[c] + hp.re[c], s * lp.im[c] + hp.im[c]), 1e-12));
		const mode = depth(-1) > depth(1) + 1e-9 ? 'difference' : 'sum';
		const lpGain = Math.abs(lp.dc);
		const k = `${mode} ${lpGain}`;
		if (!rounded.has(k)) rounded.set(k, combinerDesign(mode, combinerR, lpGain, (v) => stockResistor(v, resistorSeries)).weights);
		const [w0, w1] = rounded.get(k);
		for (let j = 0; j < out.length; j++) {
			const re = w0 * lp.re[j] + w1 * hp.re[j];
			const im = w0 * lp.im[j] + w1 * hp.im[j];
			out[j] = Math.max(re * re + im * im, 1e-24);
		}
		return out;
	};
}

/**
 * The points of the page's measure (measureFilter: 401 per passband
 * stretch, 801 per stopband stretch) and those the closeness to the ideal
 * is read at (101 per passband stretch, 41 per transition stretch), w in
 * rad/s, with the ideal design's loss at the latter (idealMeasure).
 */
function psExactGrid(t, idealMeasure) {
	const pass = [];
	const limit = [];
	const stop = [];
	const req = [];
	const dev = [];
	for (const r of t.pass) {
		if (!(r.from > 0 && r.to > r.from)) continue;
		for (let i = 0; i <= 400; i++) {
			const f = r.from * (r.to / r.from) ** (i / 400);
			pass.push(f);
			limit.push(psLimitAt(r, f));
		}
	}
	for (const r of t.stop) {
		for (let i = 0; i <= 800; i++) {
			stop.push(r.from * (r.to / r.from) ** (i / 800));
			req.push(r.aminDb);
		}
	}
	for (const r of t.pass) for (let i = 0; i <= 100; i++) dev.push(r.from * (r.to / r.from) ** (i / 100));
	for (const r of t.transition) for (let i = 0; i <= 40; i++) dev.push(r.from * (r.to / r.from) ** (i / 40));
	return {
		w: Float64Array.from([...pass, ...stop, ...dev], (f) => 2 * Math.PI * f),
		np: pass.length,
		ns: stop.length,
		limit: Float64Array.from(limit),
		req: Float64Array.from(req),
		idealLoss: Float64Array.from(dev, (f) => idealMeasure.peakDb - idealMeasure.gainDbAt(f))
	};
}

/** A built stage's response on an exact grid, kept per stage and grid. */
const PS_EXACT = new WeakMap();
function psExactResponse(design, X) {
	const kept = PS_EXACT.get(design);
	if (kept && kept.X === X) return kept.r;
	const r = psStageResponse(design, X.w);
	PS_EXACT.set(design, { X, r });
	return r;
}

/**
 * A whole set of parts judged as measureFilter measures it, in the order of
 * preference (psBetter): the same figures on the same points, from each
 * stage's response kept on the grid rather than the cascade rebuilt point
 * by point, for the many sets a search judges (the set chosen is then
 * measured by measureFilter itself). The deviation from the ideal is read
 * over the passband and transition points. A parallel band-stop's combiner
 * is chosen as bandStopCombiner chooses it, and returned.
 */
function psExactJudge(list, X, t, mIdeal, { combinerR, resistorSeries }) {
	const len = X.w.length;
	const product = (stages) => {
		const re = new Float64Array(len).fill(1);
		const im = new Float64Array(len);
		for (const d of stages) {
			const r = psExactResponse(d, X);
			for (let k = 0; k < len; k++) {
				const a = re[k] * r.re[k] - im[k] * r.im[k];
				im[k] = re[k] * r.im[k] + im[k] * r.re[k];
				re[k] = a;
			}
		}
		return { re, im };
	};
	let combiner = null;
	const D = new Float64Array(len);
	if (t.parallel) {
		const branches = [list.slice(0, t.lpCount), list.slice(t.lpCount)];
		combiner = bandStopCombiner(branches, t.fsl, t.fsh, { combinerR, resistorSeries });
		const [w0, w1] = combiner.weights;
		const lp = product(branches[0]);
		const hp = product(branches[1]);
		for (let k = 0; k < len; k++) {
			const re = w0 * lp.re[k] + w1 * hp.re[k];
			const im = w0 * lp.im[k] + w1 * hp.im[k];
			D[k] = 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-12));
		}
	} else {
		const h = product(list);
		for (let k = 0; k < len; k++) D[k] = 20 * Math.log10(Math.max(Math.sqrt(h.re[k] * h.re[k] + h.im[k] * h.im[k]), 1e-12));
	}
	let peak = -Infinity;
	for (let k = 0; k < X.np; k++) if (D[k] > peak) peak = D[k];
	if (!Number.isFinite(peak)) peak = 0;
	let pass = Infinity;
	for (let k = 0; k < X.np; k++) pass = Math.min(pass, X.limit[k] - (peak - D[k]));
	let stop = Infinity;
	for (let j = 0; j < X.ns; j++) stop = Math.min(stop, peak - D[X.np + j] - X.req[j]);
	let dev = 0;
	const d0 = X.np + X.ns;
	for (let k = d0; k < len; k++) dev = Math.max(dev, Math.abs(peak - D[k] - X.idealLoss[k - d0]));
	const margin = Math.min(pass, stop);
	const pairs = list.reduce((sum, d) => sum + filterPairCount(d, resistorSeries), 0);
	const short = list.filter((d) => d.stockShortfall).length;
	const judge = { pass, stop, margin, meets: pass >= -PASSBAND_SLACK_DB && stop >= -1e-6, capped: Math.min(margin, mIdeal), dev, pairs, short };
	return { judge, combiner };
}

/**
 * The loads and the alerts of a set of parts: freqsAt(i) the frequencies
 * stage i is read at, floors[i] its 1 / |H before| there (psLoadFloors),
 * terminalAt(i) the admittance the summing amplifier puts on a band-stop
 * branch's end, else null. The floor is checked on the circuits searched.
 */
function psAlerts(chosen, t, freqsAt, floors, terminalAt, overrides) {
	const n = chosen.length;
	const data = chosen.map((d, i) => psLoadData(d, freqsAt(i)));
	const alerts = [];
	const loads = chosen.map((d, i) => {
		const freqs = freqsAt(i);
		const own = psOwnLoad(data[i], freqs, floors[i]);
		// the output with what hangs on it: the next stage of its branch, the combiner, or nothing
		const lastOfBranch = t.parallel ? i === t.lpCount - 1 || i === n - 1 : i === n - 1;
		const next = !lastOfBranch ? psCrossLoad(data[i], data[i + 1], freqs, floors[i]) : psCrossLoad(data[i], null, freqs, floors[i], terminalAt(i));
		const outTag = data[i] && data[i].out >= 0 ? data[i].opamps[data[i].out].tag : null;
		// (on: what hangs on the output besides the stage's own network made it the least)
		const on = !lastOfBranch ? 'next' : t.parallel ? 'combiner' : null;
		const worst = next.load < own.load ? { load: next.load, freq: next.freq, opamp: outTag, output: true, atInput: next.atInput, on } : { ...own, on: null };
		const manual = Boolean(overrides[i]);
		if (PS_SEARCHED[d.topology]) {
			for (const [name, v] of psResistors(d)) if (name !== 'r' && v < PART_R_FLOOR * (1 - 1e-9)) alerts.push({ stage: i, kind: 'floor', resistor: name, value: v, manual });
		}
		if (worst.load < PART_LOAD_MIN * (1 - 1e-9)) alerts.push({ stage: i, kind: 'load', opamp: worst.opamp, output: worst.output, load: worst.load, freq: worst.freq, atInput: worst.atInput, on: worst.on, manual });
		return worst;
	});
	return { alerts, loads };
}

/**
 * The pair plan of a limited search, in the shape planFilterPairs returns:
 * what pairs where they help would use (each designer's own pairs, `free`),
 * and per stage what the limit kept and gave up.
 */
function psPairPlan(chosen, free, option, limit) {
	const total = free.reduce((s, d) => s + filterPairCount(d, option), 0);
	const rows = chosen.map((d, i) => {
		const kept = filterPairGroups(d, option);
		const was = filterPairGroups(free[i], option);
		return { option: kept.map((g) => g.name), design: d, count: filterPairCount(d, option), kept, dropped: was.filter((g) => !kept.some((k) => k.name === g.name)), short: Boolean(d.stockShortfall && free[i] && !free[i].stockShortfall) };
	});
	return { limited: total > limit, limit, total, count: rows.reduce((s, r) => s + r.count, 0), measure: null, stages: rows };
}

/** The same design on the passband edge: the spec it was designed from, at the same order, placement 'edge' (kept per design). */
const PS_TWINS = new WeakMap();
function psEdgeTwin(design) {
	if (!PS_TWINS.has(design)) PS_TWINS.set(design, psPlacedAs(design, 'edge'));
	return PS_TWINS.get(design);
}

/**
 * The same design on the passband edge, at the same orders: the design whose
 * stages the parts marked fromEdge were rounded around, the targets to
 * compare them with. null for a design already on the edge. Shared: read it.
 */
export function edgeDesignOf(design) {
	if (!design || (design.placement?.mode ?? 'edge') === 'edge') return null;
	return psEdgeTwin(design);
}

/** The same design placed another way ('centred', 'edge'), at the same orders: what the other choice of panel 01 gives. */
export function designPlacedAs(design, mode) {
	if (!design) return null;
	return mode === 'edge' ? edgeDesignOf(design) ?? design : psPlacedAs(design, mode);
}
function psPlacedAs(design, mode) {
	if (design.method === 'cascade' || design.method === 'parallel') {
		const { responseHp, responseLp, amaxDbHp, aminDbHp, amaxDbLp, aminDbLp, fl, fh, fsl, fsh } = design;
		const spec = { responseHp, responseLp, amaxDbHp, aminDbHp, amaxDbLp, aminDbLp, fl, fh, fsl, fsh, orderHigh: design.hp.n, orderLow: design.lp.n, placement: mode };
		return design.method === 'cascade' ? designBandPass(spec) : designBandStop(spec);
	}
	if (design.method === 'transformed') {
		const { response, amaxDb, aminDbLow, aminDbHigh, fl, fh, fsl, fsh, n } = design;
		if (design.filterType === 'bandstop') return designBandStopTransformed({ response, amaxDb, aminDb: aminDbLow, fl, fh, fsl, fsh, order: n, placement: mode });
		return designBandPassTransformed({ response, amaxDb, aminDbLow, aminDbHigh, fl, fh, fsl, fsh, order: n, placement: mode });
	}
	const { response, amaxDb, aminDb, fp, fs, n } = design;
	return (design.filterType === 'highpass' ? designHighPass : designLowPass)({ response, amaxDb, aminDb, fp, fs, order: n, placement: mode });
}
