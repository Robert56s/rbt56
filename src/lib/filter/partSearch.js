import { bandBoctorDesign, OPAMPS_PER_STAGE, opampCount, plannedTopology } from './bandMethod';
import { combinerChoice, combinerDesign, branchDcGain, magnitudePhaseAt, magnitudePhaseAtParallelSum, responseAt, responseAtParallelSum } from './bode';
import { boctorCandidates, boctorFromParts, designBoctorNotch, designBoctorNotchFromCap } from './boctor';
import { C_FLOOR, stockResistor } from './eseries';
import { designFirstOrderLowPass, designFirstOrderLowPassFromCap, firstOrderCandidates, firstOrderFromParts } from './firstOrder';
import { designFirstOrderHighPass, designFirstOrderHighPassFromCap, firstOrderHighPassFromParts } from './firstOrderHighPass';
import { formatFarads, formatHz, formatOhms } from './format';
import { designMfbLowPass, designMfbLowPassFromCaps, mfbLowPassCandidates, mfbLowPassFromParts } from './mfb';
import { designMfbBandPass, designMfbBandPassFromCaps, mfbBandPassCandidates, mfbBandPassEffective, mfbBandPassFromParts, mfbBandPassResponseOn } from './mfbBandPass';
import { designMfbHighPass, designMfbHighPassFromCap, mfbHighPassCandidates, mfbHighPassFromParts } from './mfbHighPass';
import { nodalPoles, nodalResponse, nodalSolveAll } from './nodal';
import { filterPairCount, filterPairGroups, planFilterPairs, planFilterPairsAll } from './pairPlan';
import { designSallenKeyLowPass, designSallenKeyLowPassFromCaps, sallenKeyLowPassCandidates, sallenKeyLowPassFromParts } from './sallenKey';
import { designSallenKeyHighPass, designSallenKeyHighPassFromCap, sallenKeyHighPassCandidates, sallenKeyHighPassFromParts } from './sallenKeyHighPass';
import { stageElements } from './stageElements';
import { designBandPass, designBandPassTransformed, designBandStop, designBandStopTransformed, designHighPass, designLowPass, notchOptions } from './stages';
import { designTowThomasBandPass, designTowThomasBandPassFromCap, designTowThomasHighPass, designTowThomasHighPassFromCap, designTowThomasLowPass, designTowThomasLowPassFromCap, designTowThomasNotch, designTowThomasNotchFromCap, towThomasBandPassCandidates, towThomasBandPassFromParts, towThomasCandidates, towThomasFromParts, towThomasNotchCandidates, towThomasNotchFromParts } from './towThomas';

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
 *   4. sensible values: of the sets that meet the template with a margin
 *      (up to the ideal design's) within PART_MARGIN_TOLERANCE_DB of the
 *      best one's (a best of 0 or more gives way to none under 0, and one
 *      under 0, met only by the slack, to none lower) and a deviation from
 *      the ideal response within PART_DEVIATION_TOLERANCE_DB of its (or
 *      PART_DEVIATION_SHARE of it, where that is more), the one
 *      whose resistors sit closest to 10 kohm (the mean of ln^2(R / 10
 *      kohm), as the designers' own sweet-spot scores) and whose capacitors
 *      are not tiny (C_FLOOR)
 *   5. fewer resistors two in series, then the earlier choice
 * Every stage is searched (the designers' candidate functions, each
 * designer's own pick among its candidates), and the parts keep the limits
 * first: every resistor from PART_R_FLOOR to PART_R_MAX, every capacitor
 * from C_FLOOR, and every op-amp output at least PART_LOAD_MIN over the
 * passband (its own network and the next stage's input, from the stage
 * netlists), since a TL082 or an LM741 swings +-10 V only into 2 kohm or
 * more. The best set within them is the answer even when it misses the
 * template; when it does and a set past them meets it, that set comes
 * along as the alternative, with its own alerts. A stage none of whose
 * candidates keeps all the limits keeps those it can in the order floor,
 * ceiling, capacitors, loads, and gives way from the first it cannot keep
 * along with them (relaxed, flagged); a stage whose capacitors were typed
 * by hand and need it keeps none. With pairs, every stage's candidates of
 * single resistors are read apart too, so that a limit on pairs, however
 * small, still builds a set within the limits wherever single resistors
 * do. Where every set judged leaves some output short of its load all the
 * same (the pools read the loads with the ideal stages ahead, a set with
 * its own), those of the set closest to the limits give way to the loads
 * they reach there (flagged). When no set within the limits can be built
 * at all, the best set past them is the answer, flagged (withinLimits
 * false).
 * The filter may be driven through a source resistance (sourceR, a
 * function generator's 50 ohm): every set is then measured with it on the
 * input node, by nodal analysis of that node (the source section below),
 * and the stages on it are searched with it.
 */

/**
 * The source resistance the page starts from, ohms: a function generator's
 * 50 ohm output. The library's own default is 0, an ideal source, so a
 * caller that passes none keeps its results.
 */
export const SOURCE_R_DEFAULT = 50;
/** Below this much over Amax the worst passband loss still counts as on spec, as on the page. */
export const PASSBAND_SLACK_DB = 0.05;
/** The smallest resistor of a stage within the limits. */
export const PART_R_FLOOR = 1000;
/** The largest resistor of a stage within the limits: past it, noise, bias currents and leakage start to count. */
export const PART_R_MAX = 1e6;
/** The smallest load an op-amp output may see over the passband. */
export const PART_LOAD_MIN = 2000;
/**
 * Sensible values: a set whose margin (up to the ideal design's) is within
 * this of the best one's, dB, and whose deviation from the ideal response
 * is within the next of the best one's (or within a third of the best
 * one's own deviation, where that is more: PART_DEVIATION_SHARE), gives way
 * to the set of the two closer to 10 kohm. Calibrated on the page's default
 * cases and a sweep of random designs: 0.02 and 0.1 dB leave the default
 * band-pass on the lab kit with 680 kohm and 56 pF, these two give it 2.2
 * to 75 kohm and 1 nF or more, and 0.05 and 0.3 dB gain little more for
 * half as much again. The share keeps a design whose parts all sit well
 * off the ideal response from turning on hundredths of a dB there: the
 * default band-stop of two branches on the lab kit, driven through 50 ohm,
 * met the template with the same margin with parts near 10 kohm (a mean
 * ln^2 of 2.8) and with parts up to 1 Mohm (7.2), the first 0.20 dB
 * further off the ideal response than the second's 0.64 dB, and took the
 * second; a quarter leaves it so, a half moves cases the default ones do
 * not need moved.
 */
export const PART_MARGIN_TOLERANCE_DB = 0.03;
export const PART_DEVIATION_TOLERANCE_DB = 0.2;
export const PART_DEVIATION_SHARE = 1 / 3;
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
 *   responseAt  (f) => that response, { re, im }
 *   magnitudePhaseAt  (f) => { db, deg } of it, for a Bode plot
 *   sourceR     the source resistance it was measured with
 * A parallel band-stop takes combinerR and resistorSeries (the combiner's
 * resistors); `template` saves rebuilding filterTemplate(design). sourceR
 * (ohms, 0 an ideal source) is the source's resistance in series with the
 * input: the response is the stages' times the source's factor F on the
 * input node (psSourceOn), shared by both branches of a parallel band-stop
 * (nodal analysis of that node). Its combiner is chosen and scaled on the
 * branches alone, as the page has always done: the summing amplifier takes
 * nothing from the input, and F multiplies both branches alike. With
 * sourceR 0 every figure is the one it has always been.
 */
export function measureFilter(realized, design, { combinerR = 10000, resistorSeries = 'E24', template = null, sourceR = 0 } = {}) {
	const t = template ?? filterTemplate(design);
	let combiner = null;
	let gainDbAt;
	let plainAt;
	if (t.parallel) {
		const branches = [realized.slice(0, t.lpCount), realized.slice(t.lpCount)];
		combiner = bandStopCombiner(branches, t.fsl, t.fsh, { combinerR, resistorSeries });
		gainDbAt = (f) => magnitudePhaseAtParallelSum(branches, f, combiner.weights).db;
		plainAt = (f) => responseAtParallelSum(branches, f, combiner.weights);
	} else {
		gainDbAt = (f) => magnitudePhaseAt(realized, f).db;
		plainAt = (f) => responseAt(realized, f);
	}
	let respAt = plainAt;
	if (sourceR > 0) {
		const source = psSourceAt(realized, t, sourceR);
		respAt = (f) => psCmul(plainAt(f), source(f));
		gainDbAt = (f) => {
			const h = respAt(f);
			return 20 * Math.log10(Math.max(Math.sqrt(h.re * h.re + h.im * h.im), 1e-12));
		};
	}
	const phaseAt = (f) => {
		const h = respAt(f);
		return { db: 20 * Math.log10(Math.max(Math.sqrt(h.re * h.re + h.im * h.im), 1e-12)), deg: (Math.atan2(h.im, h.re) * 180) / Math.PI };
	};
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
	return { template: t, peakDb: peak, pass, passEdges, stop, stopEdges, margin, meets: pass.margin >= -PASSBAND_SLACK_DB && stop.margin >= -1e-6, combiner, gainDbAt, responseAt: respAt, magnitudePhaseAt: phaseAt, sourceR: sourceR > 0 ? sourceR : 0 };
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

/** The topologies whose designers list candidates: every one a stage of these designs is built with. */
const PS_SEARCHED = { mfb: true, mfbHp: true, sallenKey: true, sallenKeyHp: true, towThomas: true, towThomasHp: true, firstOrder: true, firstOrderHp: true, towThomasNotch: true, mfbBp: true, towThomasBp: true, boctor: true, boctorHp: true };
/**
 * The topologies whose designer's own pick also comes with each subset of
 * its pairs (the designer rerun with that list of names to pair): the
 * circuits of the most resistors, whose candidates carry only the closest
 * few roundings per capacitor choice, so the pools hold every pick the
 * search had before they listed candidates.
 */
const PS_PAIR_OPTIONS = { mfbBp: true, towThomasBp: true, boctor: true, boctorHp: true };

/** The capacitors typed by hand that a topology reads, or null: C1 and C2 for MFB low-pass and band-pass, Ctop and Cbottom for Sallen-Key low-pass, C for the rest. */
function psCaps(topology, ov) {
	if (!ov) return null;
	const keys = topology === 'mfb' || topology === 'mfbBp' ? ['C1', 'C2'] : topology === 'sallenKey' ? ['Ctop', 'Cbottom'] : ['C'];
	return keys.some((k) => ov[k] > 0) ? ov : null;
}

/**
 * The topologies whose candidates a source on their input is rounded for:
 * the source adds to their one input resistor (PS_SOURCE_ADDS) and moves
 * their f0 or Q with it. A Tow-Thomas low-pass or band-pass takes R1 into a
 * virtual ground, where the source moves its gain alone (PS_SOURCE_FLAT):
 * the template reads every response from its own peak, so nothing there.
 */
const PS_SOURCE_AIMS = { mfb: true, sallenKey: true, firstOrder: true, mfbBp: true };
const PS_SOURCE_FLAT = { towThomas: true, towThomasBp: true };

/**
 * The light records of a searched stage (the designers' candidate
 * functions); a transformed design's MFB band-pass stage is built for the
 * op-amp of ctx.menus.gbw, and with ctx.source a stage whose input resistor
 * the source adds to (PS_SOURCE_AIMS) is rounded with the source's
 * resistance in series with it.
 */
function psRecords(stage, topology, opts, caps, rMin, ctx) {
	const o = { resistorSeries: opts.resistorSeries, capacitors: opts.capacitors, pairs: opts.pairs, caps, rMin, ...(ctx.source && PS_SOURCE_AIMS[topology] ? { rs: ctx.source.rs } : {}) };
	if (topology === 'mfb') return mfbLowPassCandidates(stage.wn, stage.q, o);
	if (topology === 'mfbHp') return mfbHighPassCandidates(stage.wn, stage.q, o);
	if (topology === 'sallenKey') return sallenKeyLowPassCandidates(stage.wn, stage.q, o);
	if (topology === 'sallenKeyHp') return sallenKeyHighPassCandidates(stage.wn, stage.q, o);
	if (topology === 'towThomas' || topology === 'towThomasHp') return towThomasCandidates(stage.wn, stage.q, { ...o, highPass: topology === 'towThomasHp' });
	if (topology === 'firstOrder' || topology === 'firstOrderHp') return firstOrderCandidates(stage.tau, o);
	if (topology === 'mfbBp') return mfbBandPassCandidates(stage.wn, stage.q, { ...o, gain: stage.gain, gbw: ctx.menus.gbw ?? null });
	if (topology === 'towThomasBp') return towThomasBandPassCandidates(stage.wn, stage.q, { ...o, gain: stage.gain });
	if (topology === 'boctor' || topology === 'boctorHp') return boctorCandidates(stage.wn, stage.q, stage.wz, { ...o, lowSide: topology === 'boctor' });
	return towThomasNotchCandidates(stage.wn, stage.q, stage.wz, { ...o, ...notchOptions(stage).towThomas });
}

/** The full stage a record stands for. */
function psRealize(stage, topology, rec, opts, manual, ctx) {
	const o = { resistorSeries: opts.resistorSeries, manual };
	if (topology === 'mfbBp') return mfbBandPassFromParts(stage.wn, stage.q, rec.parts, { ...o, gain: stage.gain, gbw: ctx.menus.gbw ?? null });
	if (topology === 'towThomasBp') return towThomasBandPassFromParts(stage.wn, stage.q, rec.parts, { ...o, gain: stage.gain });
	if (topology === 'boctor' || topology === 'boctorHp') return boctorFromParts(stage.wn, stage.q, stage.wz, rec.parts, { ...o, lowSide: topology === 'boctor' });
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

/** The smallest and the largest resistor a record of the candidate functions rounds to (by the names their parts give the rounded values), read once and kept on it (low, high). */
function psRecordLow(rec) {
	if (rec.low === undefined) psRecordRange(rec);
	return rec.low;
}
function psRecordHigh(rec) {
	if (rec.high === undefined) psRecordRange(rec);
	return rec.high;
}
function psRecordRange(rec) {
	let low = Infinity;
	let high = 0;
	for (const k of PS_ROUNDED) {
		const v = rec.parts[k];
		if (v === undefined) continue;
		if (v < low) low = v;
		if (v > high) high = v;
	}
	rec.low = low;
	rec.high = high;
}
const PS_ROUNDED = ['R1n', 'R2n', 'R3n', 'R4n', 'R5n', 'R6n', 'R', 'Rd', 'Rz', 'RtopN', 'RbottomN'];
/** Whether a record keeps the limits on its parts: its resistors from PART_R_FLOOR to PART_R_MAX, its capacitors from C_FLOOR. */
const psRecordWithin = (rec) => !rec.small && psRecordLow(rec) >= PART_R_FLOOR * (1 - 1e-9) && psRecordHigh(rec) <= PART_R_MAX * (1 + 1e-9);

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
 * The frequencies a load is read at: seventeen per passband stretch,
 * log-spaced, its ends included (up to loadTo where it has one), and inside
 * it, for every stage of Q over 1 in `stages` (the targets), its f0 and a
 * half and a quarter of its bandwidth either side: an output's least load
 * sits at an end or near there, in a dip coarser points can step over
 * (with nine per stretch and the half bandwidths alone, a sweep of 2036
 * random designs left loads down to 1.85 kohm unflagged that a reading on
 * 48 points per stretch found; with these, none under 1.97 kohm). A
 * parallel band-stop's branch carries the signal over its own passband
 * only (branch 0 the low-pass one, below fl; 1 the high-pass one, above
 * fh), and is read there.
 */
function psLoadFrequencies(t, branch = null, stages = []) {
	const out = [];
	for (const r of branch === null ? t.pass : [t.pass[branch]]) {
		const to = r.loadTo ?? r.to;
		for (let i = 0; i <= 16; i++) out.push(r.from * (to / r.from) ** (i / 16));
		for (const s of stages) {
			if (!(s.order === 2 && s.q > 1 && s.wn > 0)) continue;
			const f0 = s.wn / (2 * Math.PI);
			for (const f of [f0 * (1 - 0.5 / s.q), f0 * (1 - 0.25 / s.q), f0, f0 * (1 + 0.25 / s.q), f0 * (1 + 0.5 / s.q)]) if (f > r.from && f < to) out.push(f);
		}
	}
	return out.sort((a, b) => a - b);
}

/**
 * A stage's op-amps at each load frequency, driven by 1 V: each output's
 * voltage and the current it delivers into the stage's own network (their
 * sizes in vAbs and iAbs, one row per op-amp), the stage output's own as
 * complex numbers (vRe, vIm, iRe, iIm), and the current the stage's input
 * takes (its input admittance, yRe, yIm). Each op-amp is { tag, output }: the tag of its name
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
	const fast = design.components ? psLoadDataClosed(design, freqs) : null;
	if (fast) return fast;
	const els = stageElements(design, 0, 'vin', 'vout');
	if (!els.length) return null;
	const rows = nodalSolveAll(els, freqs);
	const opamps = rows[0].opamps.map((o) => ({ tag: o.name.slice(1, -1), output: o.node === 'vout' }));
	const out = opamps.findIndex((o) => o.output);
	const part = (pick) => ({ re: Float64Array.from(rows, (row) => pick(row).re), im: Float64Array.from(rows, (row) => pick(row).im) });
	const none = { re: 0, im: 0 };
	return psLoadPack(
		opamps,
		out,
		opamps.map((_, k) => part((row) => row.opamps[k].voltage)),
		opamps.map((_, k) => part((row) => row.opamps[k].current)),
		part((row) => row.source),
		out < 0 ? part(() => none) : null
	);
}

/**
 * The shape psLoadData returns, from each op-amp's output voltage and
 * current as { re, im } arrays (vs, is) and the input's admittance (y):
 * vAbs and iAbs their sizes, and the stage output's own (out, -1 for none,
 * then `zero`) as vRe, vIm, iRe, iIm, with yRe and yIm.
 */
function psLoadPack(opamps, out, vs, is, y, zero = null) {
	const abs = (z) => {
		const a = new Float64Array(z.re.length);
		for (let j = 0; j < a.length; j++) a[j] = Math.sqrt(z.re[j] * z.re[j] + z.im[j] * z.im[j]);
		return a;
	};
	const v = out >= 0 ? vs[out] : zero;
	const i = out >= 0 ? is[out] : zero;
	return { opamps, vAbs: vs.map(abs), iAbs: is.map(abs), out, vRe: v.re, vIm: v.im, iRe: i.re, iIm: i.im, yRe: y.re, yIm: y.im };
}

/**
 * psLoadDataOf in closed form for the circuits a search reads the most, the
 * same figures as the nodal solve of their netlists (stageElements: the
 * op-amps in its order and tags) to rounding, with ideal op-amps as it has
 * them; null for any other circuit. A Tow-Thomas stage has its three
 * op-amps' inverting inputs at 0 V: with Y1 and Y2 what the input feeds
 * into A1's and A2's summing nodes, KCL there and the inverter give
 *   X1 = -(Y1 + Y2 / (s C2 Ra)) / (s C1 + 1/Rd + 1 / (s C2 Ra Rb))
 *   X2 = -(Y2 + X1/Rb) / (s C2),   X3 = -X2
 * and each output delivers its voltage times what ties it to those nodes:
 * X1 (s C1 + 1/Rd + 1/Rb), X2 (s C2 + 1/r), X3 (1/r + 1/Ra). An MFB
 * band-pass stage has V_A = (1/R1) / (1/R1 + 1/R2 + s (C1 + C2) + s^2 C1
 * C2 R3) and V_out = -s C2 R3 V_A, and delivers (V_out - V_A) s C1 +
 * V_out / R3. A first-order stage's buffer delivers nothing to its own
 * network.
 */
function psLoadDataClosed(design, freqs) {
	const t = design.topology;
	const c = design.components;
	const n = freqs.length;
	const cplx = () => ({ re: new Float64Array(n), im: new Float64Array(n) });
	const pack = (tags, outIndex, vs, is, y) => psLoadPack(tags.map((tag, k) => ({ tag, output: k === outIndex })), outIndex, vs, is, y);
	if (t === 'towThomas' || t === 'towThomasHp' || t === 'towThomasNotch' || t === 'towThomasBp') {
		const { Ra, Rb, Rd, C1, C2, r } = c;
		const byR1 = t === 'towThomas' || t === 'towThomasBp';
		const X = [cplx(), cplx(), cplx()];
		const I = [cplx(), cplx(), cplx()];
		const y = cplx();
		for (let j = 0; j < n; j++) {
			const x = Math.max(2 * Math.PI * freqs[j], 1e-9);
			// Y1 into A1's summing node, Y2 (real) into A2's
			const y1r = byR1 ? 1 / c.R1 : 0;
			const y1i = byR1 ? 0 : x * c.Cin;
			const y2 = t === 'towThomasNotch' ? 1 / c.Rz : 0;
			// X1 = -(Y1 + Y2 / (j x C2 Ra)) / (1/Rd + j (x C1 - 1 / (x C2 Ra Rb)))
			const nr = y1r;
			const ni = y1i - y2 / (x * C2 * Ra);
			const dr = 1 / Rd;
			const di = x * C1 - 1 / (x * C2 * Ra * Rb);
			const dd = dr * dr + di * di;
			const x1r = -(nr * dr + ni * di) / dd;
			const x1i = -(ni * dr - nr * di) / dd;
			// X2 = j (Y2 + X1/Rb) / (x C2), X3 = -X2
			const ur = y2 + x1r / Rb;
			const ui = x1i / Rb;
			const x2r = -ui / (x * C2);
			const x2i = ur / (x * C2);
			X[0].re[j] = x1r;
			X[0].im[j] = x1i;
			X[1].re[j] = x2r;
			X[1].im[j] = x2i;
			X[2].re[j] = -x2r;
			X[2].im[j] = -x2i;
			// the currents: X1 (1/Rd + 1/Rb + j x C1), X2 (1/r + j x C2), X3 (1/r + 1/Ra)
			const g1 = 1 / Rd + 1 / Rb;
			I[0].re[j] = x1r * g1 - x1i * x * C1;
			I[0].im[j] = x1r * x * C1 + x1i * g1;
			I[1].re[j] = x2r / r - x2i * x * C2;
			I[1].im[j] = x2r * x * C2 + x2i / r;
			const g3 = 1 / r + 1 / Ra;
			I[2].re[j] = -x2r * g3;
			I[2].im[j] = -x2i * g3;
			y.re[j] = y1r + y2;
			y.im[j] = y1i;
		}
		return pack(['a', 'b', 'c'], t === 'towThomas' ? 1 : 0, X, I, y);
	}
	if (t === 'mfbBp') {
		const { R1, R2, R3, C1, C2 } = c;
		const V = cplx();
		const I = cplx();
		const y = cplx();
		for (let j = 0; j < n; j++) {
			const x = Math.max(2 * Math.PI * freqs[j], 1e-9);
			// V_A = (1/R1) / (dr + j di)
			const dr = 1 / R1 + 1 / R2 - x * x * C1 * C2 * R3;
			const di = x * (C1 + C2);
			const dd = dr * dr + di * di;
			const ar = dr / (R1 * dd);
			const ai = -di / (R1 * dd);
			// V_out = -j x C2 R3 V_A
			const k = x * C2 * R3;
			const vr = k * ai;
			const vi = -k * ar;
			V.re[j] = vr;
			V.im[j] = vi;
			// (V_out - V_A) j x C1 + V_out / R3
			I.re[j] = -(vi - ai) * x * C1 + vr / R3;
			I.im[j] = (vr - ar) * x * C1 + vi / R3;
			y.re[j] = (1 - ar) / R1;
			y.im[j] = -ai / R1;
		}
		return pack([''], 0, [V], [I], y);
	}
	if (t === 'firstOrder' || t === 'firstOrderHp') {
		const { R, C } = c;
		const V = cplx();
		const I = cplx();
		const y = cplx();
		for (let j = 0; j < n; j++) {
			const x = Math.max(2 * Math.PI * freqs[j], 1e-9);
			const u = x * R * C;
			const d = 1 + u * u;
			// the buffer's input: 1 / (1 + j u) behind R, or j u / (1 + j u) behind C; the input takes j x C / (1 + j u)
			V.re[j] = t === 'firstOrder' ? 1 / d : (u * u) / d;
			V.im[j] = t === 'firstOrder' ? -u / d : u / d;
			y.re[j] = (x * C * u) / d;
			y.im[j] = (x * C) / d;
		}
		return pack([''], 0, [V], [I], y);
	}
	return null;
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
		const vr = a.vRe[j];
		const vi = a.vIm[j];
		const yr = yLoad !== null ? yLoad : b ? b.yRe[j] : 0;
		const yi = yLoad !== null ? 0 : b ? b.yIm[j] : 0;
		const ire = a.iRe[j] + vr * yr - vi * yi;
		const iim = a.iIm[j] + vr * yi + vi * yr;
		const vAbs = Math.sqrt(vr * vr + vi * vi);
		const load = Math.max(vAbs, floor[j]) / Math.sqrt(ire * ire + iim * iim);
		if (load < worst.load) worst = { load, freq: freqs[j], atInput: vAbs < floor[j] };
	}
	return worst;
}

/**
 * 1 / |H before| at each load frequency for every stage: the stages ahead of
 * it in its branch (stage 0 of a branch has 1), ideal or built, and with a
 * source (`source`: { rs, inputs }, the built stages on the input node) its
 * factor F on the input node too: a full swing at the source reaches the
 * input node F times.
 */
function psLoadFloors(stagesAhead, freqsAt, lpCount, source = null) {
	const n = stagesAhead.length;
	const floors = new Array(n);
	const factors = new Map();
	const sourceSize = (freqs) => {
		if (!factors.has(freqs)) {
			const F = psSourceOn(source.inputs, source.rs, Float64Array.from(freqs, (f) => 2 * Math.PI * f), false);
			factors.set(freqs, Float64Array.from(F.re, (re, k) => Math.hypot(re, F.im[k])));
		}
		return factors.get(freqs);
	};
	for (let i = 0; i < n; i++) {
		const freqs = freqsAt(i);
		const first = lpCount !== null && i >= lpCount ? lpCount : 0;
		const before = source ? Float64Array.from(sourceSize(freqs)) : new Float64Array(freqs.length).fill(1);
		for (let j = first; j < i; j++) {
			const size = psSizeAt(stagesAhead[j], freqs);
			for (let k = 0; k < freqs.length; k++) before[k] *= size[k];
		}
		floors[i] = Float64Array.from(before, (h) => 1 / Math.max(h, 1e-12));
	}
	return floors;
}
/** |H| of a stage at the load frequencies, kept per stage (every set of parts judged on the limits asks for its stages ahead again). */
const PS_SIZES = new WeakMap();
function psSizeAt(design, freqs) {
	const kept = PS_SIZES.get(design);
	if (kept && kept.freqs === freqs) return kept.size;
	const r = psStageResponse(design, Float64Array.from(freqs, (f) => 2 * Math.PI * f));
	const size = Float64Array.from(r.re, (re, k) => Math.hypot(re, r.im[k]));
	PS_SIZES.set(design, { freqs, size });
	return size;
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

/* ----------------------------------------------------- the source */

/*
 * The filter is driven through the source's own resistance Rs (a function
 * generator's 50 ohm, 0 for an ideal source), in series with its input.
 * Every op-amp output drives what follows it as an ideal source, so only
 * the stages on the input node see Rs: the first stage of a cascade, or
 * both branches' first stages of a parallel band-stop (the summing
 * amplifier takes nothing from the input), which then share that node.
 * Each such stage takes Y(s) V from it (its input admittance), so nodal
 * analysis of the node gives
 *   V / Vs = F(s) = 1 / (1 + Rs (Y_a(s) + Y_b(s) ...)),
 * and the filter's response is its response from that node times F: the
 * stages themselves, their parts and their actual figures stay those of
 * the stage alone (an ideal source), and F carries the source (the
 * figures with it: psSourceFigures). Where the stage's input is one
 * resistor (MFB low-pass R1, Sallen-Key low-pass R1, Tow-Thomas R1,
 * first-order R, MFB band-pass R1) this is exactly the stage with R + Rs
 * there. Where that moves its f0 or Q, the stage's pool takes candidates
 * rounded for R + Rs as well (PS_SOURCE_AIMS); a Tow-Thomas R1 into a
 * virtual ground moves the gain alone, which no template reads
 * (PS_SOURCE_FLAT). Elsewhere (an input capacitor, or the Boctor sections'
 * two input branches) the source adds a pole of its own, near 1 / (2 pi Rs
 * C) for an input capacitor C into a virtual ground: the pool then takes the
 * candidates that keep the passband's shape best with it (psSourceSpread),
 * and the exact measure judges every set with it. The beam of each run is
 * the one an ideal source has (its pools, stagePools0, read without the
 * source), whose solutions then move with the source over the whole pools
 * (psMovedWithSource), and the designers' own range is searched where the
 * search for an ideal source would search it (and the same design on the
 * passband edge's): what that search weighs is weighed with the source too,
 * so the parts chosen with a source rank at least as well as the parts for
 * an ideal source driven through it. A source that only scales the input
 * stages (PS_SOURCE_FLAT) leaves the search as it is.
 */

/** The resistor a stage's source resistance adds to, by topology: where the input is one resistor. */
const PS_SOURCE_ADDS = { mfb: 'R1', sallenKey: 'R1', towThomas: 'R1', towThomasBp: 'R1', mfbBp: 'R1', firstOrder: 'R' };
/** The input resistor of a built stage the source adds to (its name in components), or null where the input is not one resistor. */
export function sourceAddsTo(design) {
	return (design && PS_SOURCE_ADDS[design.topology]) ?? null;
}
/**
 * Whether a search rounds the candidates of a stage of this circuit on the
 * input node for the source (PS_SOURCE_AIMS: it adds to the stage's one
 * input resistor and moves its f0 or Q). A stage the search built from
 * such a candidate carries sourceRounded, the source's resistance.
 */
export function sourceRoundsFor(design) {
	return Boolean(design && PS_SOURCE_AIMS[design.topology]);
}

/** Complex arithmetic on { re, im }, for the input admittances that need more than a line. */
const psCx = (re, im = 0) => ({ re, im });
const psCadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const psCsub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const psCmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
function psCdiv(a, b) {
	const d = b.re * b.re + b.im * b.im;
	return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/**
 * The input admittance Y(j w) of a built stage at each w (rad/s) of a list:
 * the current its input takes per volt on it, as { re, im } arrays. Closed
 * forms from KCL on its netlist (stageElements), ideal op-amps (V+ = V-)
 * but for an MFB band-pass stage built for an op-amp (actual.gbw: the
 * single-pole op-amp of mfbBandPassResponse), written down topology by
 * topology for the many stages a search reads; any other circuit is solved
 * on its netlist (nodalSolveAll). They agree with the nodal solve to
 * rounding (the checks compare them).
 */
function psInputY(design, w) {
	const n = w.length;
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	// (an ideal stage has no parts: it takes nothing from its input)
	if (!design.components) return { re, im };
	const c = design.components;
	// (a frequency of 0 is read just above it, where every capacitor is open)
	const at = (k) => Math.max(w[k], 1e-9);
	// Y = (1 - V) / R for a node V = (1 / R) / (dr + j di) = (dr - j di) / (R d) behind an input resistor R
	const behind = (k, R, dr, di) => {
		const d = dr * dr + di * di;
		re[k] = (1 - dr / (R * d)) / R;
		im[k] = di / (R * R * d);
	};
	switch (design.topology) {
		case 'mfb': {
			// KCL at the virtual ground: V_out = -V_A / (s C2 R2); at A: (1 - V_A) / R1 = V_A (s C1 + 1/R2 + 1/R3 + 1 / (s C2 R2 R3))
			const { R1, R2, R3, C1, C2 } = c;
			for (let k = 0; k < n; k++) {
				const x = at(k);
				behind(k, R1, 1 / R1 + 1 / R2 + 1 / R3, x * C1 - 1 / (x * C2 * R2 * R3));
			}
			break;
		}
		case 'mfbHp': {
			// V_out = -s C2 R2 V_A; at A: (1 - V_A) s C1 = V_A (1/R1 + s (C2 + C3) + s^2 C2 C3 R2)
			const { R1, R2, C1, C2, C3 } = c;
			for (let k = 0; k < n; k++) {
				const x = at(k);
				const dr = 1 / R1 - x * x * C2 * C3 * R2;
				const di = x * (C1 + C2 + C3);
				const d = dr * dr + di * di;
				// V_A = j x C1 / (dr + j di), Y = j x C1 (1 - V_A)
				const vr = (x * C1 * di) / d;
				const vi = (x * C1 * dr) / d;
				re[k] = x * C1 * vi;
				im[k] = x * C1 * (1 - vr);
			}
			break;
		}
		case 'sallenKey': {
			// a follower: V_P = V_out, V_X = V_P (1 + s Cb R2); at X: (1 - V_X) / R1 = V_P (s Cb + s^2 Cb Ct R2)
			const { R1, R2, Ctop, Cbottom } = c;
			for (let k = 0; k < n; k++) {
				const x = at(k);
				const dr = 1 / R1 - x * x * Cbottom * Ctop * R2;
				const di = (x * Cbottom * R2) / R1 + x * Cbottom;
				const d = dr * dr + di * di;
				const pr = dr / (R1 * d);
				const pi = -di / (R1 * d);
				// V_X = V_P (1 + j x Cb R2)
				const xr = pr - pi * x * Cbottom * R2;
				const xi = pi + pr * x * Cbottom * R2;
				re[k] = (1 - xr) / R1;
				im[k] = -xi / R1;
			}
			break;
		}
		case 'sallenKeyHp': {
			// V_X = V_P (1 + 1 / (s C2 Rb)); at X: (1 - V_X) s C1 = V_P (1/Rb + 1 / (s C2 Rb Rt))
			const { C1, C2, Rtop, Rbottom } = c;
			for (let k = 0; k < n; k++) {
				const x = at(k);
				const dr = C1 / (C2 * Rbottom) + 1 / Rbottom;
				const di = x * C1 - 1 / (x * C2 * Rbottom * Rtop);
				const d = dr * dr + di * di;
				// V_P = j x C1 / (dr + j di)
				const pr = (x * C1 * di) / d;
				const pi = (x * C1 * dr) / d;
				// V_X = V_P (1 - j / (x C2 Rb))
				const u = 1 / (x * C2 * Rbottom);
				const xr = pr + pi * u;
				const xi = pi - pr * u;
				re[k] = x * C1 * xi;
				im[k] = x * C1 * (1 - xr);
			}
			break;
		}
		// R1, Cin or both into a virtual ground
		case 'towThomas':
		case 'towThomasBp':
			re.fill(1 / c.R1);
			break;
		case 'towThomasHp':
			for (let k = 0; k < n; k++) im[k] = w[k] * c.Cin;
			break;
		case 'towThomasNotch':
			re.fill(1 / c.Rz);
			for (let k = 0; k < n; k++) im[k] = w[k] * c.Cin;
			break;
		case 'firstOrder':
		case 'firstOrderHp': {
			// R and C in series into a buffer or to ground: Y = s C / (1 + s R C)
			const { R, C } = c;
			for (let k = 0; k < n; k++) {
				const t = w[k] * R * C;
				const d = 1 + t * t;
				re[k] = (w[k] * C * t) / d;
				im[k] = (w[k] * C) / d;
			}
			break;
		}
		case 'mfbBp': {
			const { R1, R2, R3, C1, C2 } = c;
			const gbw = Number.isFinite(design.actual?.gbw) && design.actual.gbw > 0 ? design.actual.gbw : null;
			if (gbw === null) {
				// V_out = -s C2 R3 V_A; at A: (1 - V_A) / R1 = V_A (1/R2 + s (C1 + C2) + s^2 C1 C2 R3)
				for (let k = 0; k < n; k++) {
					const x = at(k);
					behind(k, R1, 1 / R1 + 1 / R2 - x * x * C1 * C2 * R3, x * (C1 + C2));
				}
				break;
			}
			// V_M = -k V_out with k = s / omega_t; at M: (V_A - V_M) s C2 = (V_M - V_out) / R3, so V_out = g V_A,
			// g = -s C2 / (k s C2 + (1 + k) / R3); at A: (1 - V_A) / R1 = V_A (1/R2 + s C2 (1 + k g) + s C1 (1 - g))
			const wt = 2 * Math.PI * gbw;
			for (let k = 0; k < n; k++) {
				const x = at(k);
				const kk = psCx(0, x / wt);
				const g = psCdiv(psCx(0, -x * C2), psCx(1 / R3 - (x * x * C2) / wt, x / (wt * R3)));
				const den = psCadd(psCadd(psCx(1 / R2), psCmul(psCx(0, x * C2), psCadd(psCx(1), psCmul(kk, g)))), psCmul(psCx(0, x * C1), psCsub(psCx(1), g)));
				behind(k, R1, 1 / R1 + den.re, den.im);
			}
			break;
		}
		case 'boctor': {
			// V_M = V_P = k V_in, k = R5 / (R3 + R5); at M: V_X = V_M + R6 (V_M / R1 + (V_M - V_out) s C1);
			// at X: (1 - V_X) s C2 = V_X / R2 + (V_X - V_M) / R6 + (V_X - V_out) / R4
			const { R1, R2, R3, R4, R5, R6, C1, C2 } = c;
			const vm = R5 / (R3 + R5);
			for (let k = 0; k < n; k++) {
				const x = at(k);
				const alpha = psCx(vm * (1 + R6 / R1), vm * R6 * x * C1);
				const beta = psCx(0, -R6 * x * C1);
				const sigma = psCx(1 / R2 + 1 / R6 + 1 / R4, x * C2);
				const vout = psCdiv(psCsub(psCmul(alpha, sigma), psCx(vm / R6, x * C2)), psCsub(psCx(1 / R4), psCmul(beta, sigma)));
				const vx = psCadd(alpha, psCmul(beta, vout));
				const y = psCmul(psCsub(psCx(1), vx), psCx(0, x * C2));
				re[k] = y.re + 1 / (R3 + R5);
				im[k] = y.im;
			}
			break;
		}
		case 'boctorHp': {
			// V = V_M = V_P; gamma = s C2 / (1 + s C2 R2) the current R2 carries per (1 - V); y1 = s C1 + 1/R1;
			// at M: V_out = R5 (V (1/R4 + 1/R5 + gamma) - gamma); at P: (1 - V) y1 = V / R6 + (V - V_out) / R3
			const { R1, R2, R3, R4, R5, R6, C1, C2 } = c;
			for (let k = 0; k < n; k++) {
				const x = at(k);
				const gamma = psCdiv(psCx(0, x * C2), psCx(1, x * C2 * R2));
				const y1 = psCx(1 / R1, x * C1);
				const r = R5 / R3;
				const num = psCsub(y1, psCmul(psCx(r), gamma));
				const den = psCsub(psCadd(y1, psCx(1 / R6 + 1 / R3)), psCmul(psCx(r), psCadd(psCx(1 / R4 + 1 / R5), gamma)));
				const v = psCdiv(num, den);
				const y = psCmul(psCsub(psCx(1), v), psCadd(gamma, y1));
				re[k] = y.re;
				im[k] = y.im;
			}
			break;
		}
		default: {
			// any other circuit, on its netlist
			const els = stageElements(design, 0, 'vin', 'vout');
			if (!els.length) break;
			const rows = nodalSolveAll(
				els,
				Array.from(w, (x) => x / (2 * Math.PI)),
				design.topology === 'mfbBp' && Number.isFinite(design.actual?.gbw) ? { gbw: design.actual.gbw } : {}
			);
			rows.forEach((row, k) => {
				re[k] = row.source.re;
				im[k] = row.source.im;
			});
		}
	}
	return { re, im };
}

/** psInputY kept per built stage and list of w (the grids of a search ask for the same stages again). */
const PS_INPUT_Y = new WeakMap();
function psInputYOn(design, w) {
	let byGrid = PS_INPUT_Y.get(design);
	if (!byGrid) PS_INPUT_Y.set(design, (byGrid = new WeakMap()));
	let y = byGrid.get(w);
	if (!y) byGrid.set(w, (y = psInputY(design, w)));
	return y;
}

/** The stages on the input node of a set of parts: the first one, or both branches' first ones of a parallel band-stop (by index). */
const psSourceInputs = (t, n) => (t.parallel ? [0, t.lpCount].filter((i) => i < n) : n ? [0] : []);

/**
 * The source's factor F = V_in / V_s = 1 / (1 + rs sum Y) on a list of w
 * (rad/s), { re, im } arrays, for the stages on the input node (`inputs`,
 * built stages), each one's Y kept per w when `keep` (a search's grids).
 * `extra` adds an admittance of its own ({ re, im } arrays or null): the
 * other branch's first stage a pool's member is read with.
 */
function psSourceOn(inputs, rs, w, keep = true, extra = null) {
	const n = w.length;
	const yr = new Float64Array(n);
	const yi = new Float64Array(n);
	for (const d of inputs) {
		const y = keep ? psInputYOn(d, w) : psInputY(d, w);
		for (let k = 0; k < n; k++) {
			yr[k] += y.re[k];
			yi[k] += y.im[k];
		}
	}
	if (extra) {
		for (let k = 0; k < n; k++) {
			yr[k] += extra.re[k];
			yi[k] += extra.im[k];
		}
	}
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		const dr = 1 + rs * yr[k];
		const di = rs * yi[k];
		const d = dr * dr + di * di;
		re[k] = dr / d;
		im[k] = -di / d;
	}
	return { re, im };
}

/** The input admittances of built stages summed on a list of w, { re, im } arrays. */
function psSumY(list, w) {
	const re = new Float64Array(w.length);
	const im = new Float64Array(w.length);
	for (const d of list) {
		const y = psInputYOn(d, w);
		for (let k = 0; k < w.length; k++) {
			re[k] += y.re[k];
			im[k] += y.im[k];
		}
	}
	return { re, im };
}

/**
 * How far the source bends a stage on the input node over the passband: the
 * spread of ln |F| over the grid's passband points (`source`: { rs, other },
 * other the admittance of the other branch's first stage or null). The
 * level F sets is the whole filter's and counts for nothing; its shape is
 * what the template reads.
 */
function psSourceSpread(design, source, G) {
	// (on the passband points alone, the grid's first np)
	G.wPass ??= G.w.subarray(0, G.np);
	const F = psSourceOn([design], source.rs, G.wPass, true, source.other);
	let lo = Infinity;
	let hi = -Infinity;
	for (let k = 0; k < G.np; k++) {
		const v = Math.log(Math.hypot(F.re[k], F.im[k]));
		if (v < lo) lo = v;
		if (v > hi) hi = v;
	}
	return G.np ? hi - lo : 0;
}

/** A response { re, im } (arrays) times the source's factor, in place. */
function psTimesSource(resp, F) {
	for (let k = 0; k < resp.re.length; k++) {
		const re = resp.re[k] * F.re[k] - resp.im[k] * F.im[k];
		resp.im[k] = resp.re[k] * F.im[k] + resp.im[k] * F.re[k];
		resp.re[k] = re;
	}
	return resp;
}

/** The source's factor F at one frequency (Hz), { re, im }, for a set of parts and its template: (f) => F. */
function psSourceAt(realized, t, rs) {
	const inputs = psSourceInputs(t, realized.length).map((i) => realized[i]);
	return (f) => {
		const F = psSourceOn(inputs, rs, Float64Array.of(2 * Math.PI * f), false);
		return { re: F.re[0], im: F.im[0] };
	};
}

/**
 * The figures of the stages on the input node with the source: what the
 * page shows as their f0, Q, zero and gain, read as they are without it.
 * Where the source adds to one input resistor of a cascade's first stage
 * (sourceAddsTo) they are the stage's own formulas with R + Rs, exact.
 * Elsewhere they come from the netlist of the input node (Rs, and every
 * stage on it, stageElements) by nodal analysis (nodal.js): the pole pair
 * (or the real pole of a first-order stage) nearest the stage's own, its
 * zero (Rs moves none: the response is the stage's times F, and F only
 * puts poles of its own in place of the stage's), and the gains times F
 * where the stage's own are read: at DC for a low-pass (and a notch's DC
 * gain), far above for a high-pass or a notch, F there with each pole the
 * source adds taken out (an input capacitor into a virtual ground, now
 * behind Rs: MFB high-pass, Tow-Thomas high-pass and notch). Returns
 * [{ stage, adds, without, with, extraPoles, shared }]: adds the resistor
 * Rs adds to (or null), without the stage's own actual figures, with the
 * same fields with the source, extraPoles the frequencies (Hz) of the
 * poles the source adds to the node, shared true for a parallel band-stop
 * (both stages read on the one node).
 */
function psSourceFigures(list, t, rs) {
	const inputs = psSourceInputs(t, list.length);
	if (!(rs > 0) || inputs.some((i) => !list[i]?.actual || !list[i].components)) return [];
	const shared = inputs.length > 1;
	const exact = (d) => {
		const a = d.actual;
		const c = d.components;
		switch (d.topology) {
			case 'mfb': {
				const R1 = c.R1 + rs;
				const A = (1 / R1 + 1 / c.R2 + 1 / c.R3) / c.C1;
				const wn = 1 / Math.sqrt(c.R2 * c.R3 * c.C1 * c.C2);
				return { ...a, wn, q: wn / A, gain: -c.R3 / R1 };
			}
			case 'sallenKey': {
				const R1 = c.R1 + rs;
				const wn = 1 / Math.sqrt(R1 * c.R2 * c.Ctop * c.Cbottom);
				return { ...a, wn, q: 1 / (wn * c.Cbottom * (R1 + c.R2)), gain: a.gain };
			}
			case 'towThomas':
				return { ...a, gain: (a.gain * c.R1) / (c.R1 + rs) };
			case 'towThomasBp':
				return { ...a, gain: -c.Rd / (c.R1 + rs) };
			case 'firstOrder':
				return { ...a, tau: (c.R + rs) * c.C };
			case 'mfbBp': {
				const e = mfbBandPassEffective({ ...c, R1: c.R1 + rs }, Number.isFinite(a.gbw) ? a.gbw : null);
				return { ...a, wn: e.wn, q: e.q, gain: e.gain };
			}
			default:
				return null;
		}
	};
	if (!shared) {
		const d = list[inputs[0]];
		const e = exact(d);
		if (e) return [{ stage: inputs[0], adds: sourceAddsTo(d), without: d.actual, with: e, extraPoles: [], shared }];
	}
	// the input node's netlist: Rs from the source to it, every stage on it from there
	const els = [{ kind: 'R', name: 'RS', nodes: ['vs', 'vin'], value: rs }, ...inputs.flatMap((i) => stageElements(list[i], i, 'vin', `vo${i}`))];
	const gbwOf = inputs.map((i) => list[i]).find((d) => d.topology === 'mfbBp' && Number.isFinite(d.actual.gbw))?.actual.gbw ?? null;
	const own = (d) => {
		const a = d.actual;
		if (d.order === 1) return [{ re: -1 / a.tau, im: 0 }];
		const s = a.wn / (2 * a.q);
		const disc = 1 - 1 / (4 * a.q * a.q);
		return disc >= 0
			? [{ re: -s, im: a.wn * Math.sqrt(disc) }, { re: -s, im: -a.wn * Math.sqrt(disc) }]
			: [{ re: -s * (1 + Math.sqrt(-disc) * 2 * a.q), im: 0 }, { re: -s * (1 - Math.sqrt(-disc) * 2 * a.q), im: 0 }];
	};
	const scales = inputs.map((i) => (list[i].order === 1 ? 1 / list[i].actual.tau : list[i].actual.wn));
	const poles = nodalPoles(els, { input: 'vs', gbw: gbwOf, scale: Math.min(...scales) }) ?? [];
	// each stage's own poles matched to the nearest of the node's, each pole once
	const free = poles.slice();
	const matched = inputs.map((i) =>
		own(list[i]).map((p) => {
			let best = -1;
			for (let k = 0; k < free.length; k++) if (best < 0 || Math.hypot(free[k].re - p.re, free[k].im - p.im) < Math.hypot(free[best].re - p.re, free[best].im - p.im)) best = k;
			return best < 0 ? p : free.splice(best, 1)[0];
		})
	);
	// the poles of the source's own, left over: real ones, each taken out of F far above (1 - s / p)
	const extra = free.filter((p) => Math.abs(p.im) <= 1e-6 * Math.hypot(p.re, p.im));
	const F = (f) => nodalResponse(els, f, { input: 'vs', output: 'vin', gbw: gbwOf });
	const low = F(1e-6 * Math.min(...scales) / (2 * Math.PI));
	const top = 1e7 * Math.max(...scales, ...extra.map((p) => Math.abs(p.re)));
	const high = extra.reduce((acc, p) => psCmul(acc, psCx(1, top / Math.abs(p.re))), F(top / (2 * Math.PI)));
	const lowF = Math.hypot(low.re, low.im) * Math.sign(low.re || 1);
	const highF = Math.hypot(high.re, high.im) * Math.sign(high.re || 1);
	return inputs.map((i, j) => {
		const d = list[i];
		const a = d.actual;
		const ps = matched[j];
		const out = { ...a };
		if (d.order === 1) {
			out.tau = -1 / ps[0].re;
			// (no gain of its own: 1 at DC for a low-pass, far above for a high-pass)
			out.gain = d.topology === 'firstOrderHp' ? highF : lowF;
		} else {
			const wn = Math.sqrt(Math.hypot(ps[0].re, ps[0].im) * Math.hypot(ps[1].re, ps[1].im));
			out.wn = wn;
			out.q = wn / -(ps[0].re + ps[1].re);
			const hp = Number.isFinite(a.wz) || Boolean(d.topology?.endsWith('Hp'));
			if (Number.isFinite(a.gain)) out.gain = a.gain * (hp ? highF : lowF);
			if (Number.isFinite(a.numeratorS)) out.numeratorS = a.numeratorS * highF;
			if (Number.isFinite(a.dcGain)) out.dcGain = a.dcGain * lowF;
		}
		return { stage: i, adds: shared ? null : sourceAddsTo(d), without: a, with: out, extraPoles: extra.map((p) => Math.abs(p.re) / (2 * Math.PI)), shared };
	});
}

/**
 * The source on the input node of a set of parts (realized stages of
 * `design`), for the page and the script: null for an ideal source
 * (sourceR 0 or none), else
 *   r         the source's resistance, ohms
 *   inputs    the stages on the input node (from 0): the first one, or both
 *             branches' first ones of a parallel band-stop
 *   shared    true for the latter (the one node both branches start from)
 *   factorAt  (f) => F = V(input node) / V(source), { re, im }: what the
 *             source does to the whole response, which is the stages' times F
 *   figures   per stage on the input node { stage, adds, without, with,
 *             extraPoles, shared, responseAt }: psSourceFigures, and
 *             responseAt (f) => that stage's response from the source's EMF,
 *             { re, im } (its own times F), for its gain at a frequency
 * `template` saves rebuilding filterTemplate(design).
 */
export function filterSource(realized, design, { sourceR = 0, template = null } = {}) {
	const rs = Number.isFinite(sourceR) && sourceR > 0 ? sourceR : 0;
	if (!rs || !realized?.length || realized.some((d) => !d)) return null;
	const t = template ?? filterTemplate(design);
	const factorAt = psSourceAt(realized, t, rs);
	const inputs = psSourceInputs(t, realized.length);
	const figures = psSourceFigures(realized, t, rs).map((fig) => ({ ...fig, responseAt: (f) => psCmul(responseAt([realized[fig.stage]], f), factorAt(f)) }));
	return { r: rs, inputs, shared: inputs.length > 1, factorAt, figures };
}

/* ----------------------------------------------------- the fast measure */

/**
 * The template's points for the search: the page's passband points, every
 * passStep-th, and its stopband points, every stopStep-th (the ends kept),
 * 41 points per transition stretch, and for a parallel band-stop the
 * centre of its stopband (where the combiner is chosen). w in rad/s.
 */
function psGrid(t, passStep, stopStep) {
	const pass = [];
	const stop = [];
	const trans = [];
	for (const r of t.pass) {
		if (!(r.from > 0 && r.to > r.from)) continue;
		for (let i = 0; i <= 400; i++) if (i % passStep === 0 || i === 400) {
			const f = r.from * (r.to / r.from) ** (i / 400);
			pass.push({ f, limit: psLimitAt(r, f) });
		}
	}
	for (const r of t.stop) for (let i = 0; i <= 800; i++) if (i % stopStep === 0 || i === 800) stop.push({ f: r.from * (r.to / r.from) ** (i / 800), req: r.aminDb });
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
	if (design.topology === 'mfbBp' && Number.isFinite(a.gbw)) {
		// (as bode.js reads it, at the same frequencies: the parts with the op-amp they were built for)
		const f = new Float64Array(n);
		for (let k = 0; k < n; k++) f[k] = w[k] / (2 * Math.PI);
		const h = mfbBandPassResponseOn(design.components, f, a.gbw);
		return { re: h.re, im: h.im, dc: responseAt([design], 0).re };
	}
	if (PS_FROM_PARTS[design.topology]) {
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
function psJudgeDb(D, G, idealLoss, mIdeal, peakOf = null) {
	// (peakOf: the passband peak, when the caller found it filling D)
	let peak = peakOf ?? -Infinity;
	if (peakOf === null) for (let k = 0; k < G.np; k++) if (D[k] > peak) peak = D[k];
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

/**
 * psJudgeDb of D = total + (to - from), its passband points already in D
 * (with their peak): the stopband and transition points read as they are
 * summed, never stored. The same figures, the same arithmetic.
 */
function psJudgeDelta(D, total, from, to, G, idealLoss, mIdeal, peak) {
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
		const k = G.np + j;
		const m = peak - (total[k] + (to[k] - from[k])) - G.stopReq[j];
		if (m < stop) stop = m;
	}
	const t0 = G.np + G.ns;
	for (let k = t0; k < t0 + G.nt; k++) {
		const d = Math.abs(peak - (total[k] + (to[k] - from[k])) - idealLoss[k]);
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

/**
 * Rule 4, sensible values, against thresholds thr = { capped, dev }: a set
 * that meets the template with its margin (up to the ideal design's) at
 * thr.capped or more and its deviation from the ideal response at thr.dev
 * or less is acceptable, and beats one that is not; of two acceptable sets
 * the one of the lower level wins (a tie within PS_LEVEL_TIE goes to fewer
 * pairs, then to the order of preference); of two that are not, the order
 * of preference decides. The judges carry level (psLevelOf).
 */
function psBetterLevel(a, b, thr) {
	if (a.short !== b.short) return a.short < b.short;
	if ((a.viol ?? 0) !== (b.viol ?? 0)) return (a.viol ?? 0) < (b.viol ?? 0);
	const okA = psAcceptable(a, thr);
	const okB = psAcceptable(b, thr);
	if (okA !== okB) return okA;
	if (!okA) return psBetter(a, b);
	if (Math.abs(a.level - b.level) > PS_LEVEL_TIE) return a.level < b.level;
	if (a.pairs !== b.pairs) return a.pairs < b.pairs;
	return psBetter(a, b);
}
const psAcceptable = (j, thr) => j.meets && j.capped >= thr.capped - 1e-12 && j.dev <= thr.dev + 1e-12;
/** Levels closer than this are a tie (the mean of ln^2(R / 10 kohm): one resistor of twelve from 10 to 11 kohm moves it by 0.001). */
const PS_LEVEL_TIE = 0.02;
/** How far past the limits two sets may differ (log of the factor: about 5 %) and still count as as close to them. */
const PS_PAST_TIE = 0.05;
/**
 * The thresholds of rule 4 around a judged set that meets the template: a
 * margin of 0 or more (to a tie) never gives way to one under 0, and none
 * under 0 to a lower one.
 */
const psSensibleAround = (judge) => {
	const capped = judge.capped - PART_MARGIN_TOLERANCE_DB;
	return { capped: judge.capped >= -PS_MARGIN_TIE ? Math.max(Math.min(0, judge.capped), capped) : judge.capped, dev: judge.dev + Math.max(PART_DEVIATION_TOLERANCE_DB, PART_DEVIATION_SHARE * judge.dev) };
};

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
		const np = G.np;
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
				let peak = -Infinity;
				for (let k = 0; k < np; k++) {
					const v = acc[k] + t[k];
					tmp[k] = v;
					if (v > peak) peak = v;
				}
				for (let k = np; k < len; k++) tmp[k] = acc[k] + t[k];
				return psJudgeDb(tmp, G, idealLoss, mIdeal, peak);
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
				// (one change, the most asked for, in one pass that finds the passband peak too)
				if (changes.length === 1) {
					const [i, k] = changes[0];
					const from = pools[i][st.picks[i]].db;
					const to = pools[i][k].db;
					const total = st.total;
					let peak = -Infinity;
					for (let j = 0; j < np; j++) {
						const v = total[j] + (to[j] - from[j]);
						tmp[j] = v;
						if (v > peak) peak = v;
					}
					// (the rest read as it is summed: psJudgeDb's figures, the same arithmetic)
					return psJudgeDelta(tmp, total, from, to, G, idealLoss, mIdeal, peak);
				}
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

/**
 * A solution of the beam over an ideal source's pools (from, judged
 * without the source) moved with it over the whole pools (to, the same
 * members and those the source brings, E with the source): its picks found
 * in `to` (the same member, or one of the same response), judged there, and
 * the one- and two-stage moves from them (psDescend). null when a pick has
 * no counterpart.
 */
function psMovedWithSource(sol, from, to, E, ctx) {
	const picks = sol.picks.map((k, i) => {
		if (from[i] === to[i]) return k;
		const m = from[i][k];
		return to[i].findIndex((x) => x.design === m.design || (x.pairs === m.pairs && Boolean(x.design.manualError) === Boolean(m.design.manualError) && psSameResponse(x.design, m.design)));
	});
	if (picks.some((k) => k < 0)) return null;
	const judge = E.tryChange(E.prepare(picks), []);
	judge.pairs = picks.reduce((sum, k, i) => sum + to[i][k].pairs, 0);
	judge.short = picks.reduce((sum, k, i) => sum + (to[i][k].short ? 1 : 0), 0);
	judge.viol = picks.reduce((sum, k, i) => sum + (i > 0 && ctx.cross[i] && !psLoadOk(to[i - 1][picks[i - 1]], to[i][k]) ? 1 : 0), 0);
	return psDescend({ picks, judge }, to, E, { ...ctx, budget: judge.pairs > PS_PAIR_COUNTS ? ctx.limit : judge.pairs });
}

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
 * Returns { solutions, finals }: the best solution of each pair count
 * [{ picks, judge }] after the moves, and the first PS_BEAM_FINALS states
 * of each pair count the beam ends with (judged on the grid, where sets of
 * nearly the same room can rank the wrong way round: the caller judges
 * them all on the page's measure); both [] when no set fits.
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
				// (expand gives a judge of its own: the counts go on it)
				const judge = E.expand(st.acc, i, c);
				judge.pairs = pairs;
				judge.short = short;
				judge.viol = viol;
				next.push({ st, k, pairs, short, viol, judge });
			}
		}
		if (!next.length) return { solutions: [], finals: [] };
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
	const solutions = [...starts.values()].map((st) => psDescend({ picks: st.picks.slice(), judge: st.judge }, pools, E, { ...ctx, budget: st.pairs > PS_PAIR_COUNTS ? limit : st.pairs }));
	const seen = new Map();
	const finals = states.filter((st) => {
		const key = Math.min(st.pairs, PS_PAIR_COUNTS + 1);
		seen.set(key, (seen.get(key) ?? 0) + 1);
		return seen.get(key) <= PS_BEAM_FINALS;
	});
	return { solutions, finals };
}
/** How many of the states the beam ends with, per pair count, are judged on the page's measure too. */
const PS_BEAM_FINALS = 2;

/**
 * One- and two-stage moves from a solution while they improve it, within
 * the pair budget and the load rule, in the order of preference or, with
 * ctx.better, in that one (the judges then carry the set's level too).
 */
function psDescend(sol, pools, E, ctx) {
	const { budget, cross, moves } = ctx;
	const better = ctx.better ?? psBetter;
	const order = ctx.order ?? null;
	const n = pools.length;
	let picks = sol.picks;
	let cur = { ...sol.judge, level: psLevelOf(picks.map((k, i) => pools[i][k].level)) };
	let st = E.prepare(picks);
	let pairs = picks.reduce((s, k, i) => s + pools[i][k].pairs, 0);
	let short = picks.reduce((s, k, i) => s + (pools[i][k].short ? 1 : 0), 0);
	// the outputs left short of their load, between stage i - 1 and i
	const violAt = (p, i) => (i > 0 && cross[i] && !psLoadOk(pools[i - 1][p[i - 1]], pools[i][p[i]]) ? 1 : 0);
	const violOf = (p) => p.reduce((s, _, i) => s + violAt(p, i), 0);
	let viol = violOf(picks);
	// the judge of the picks with `changes` ([stage, candidate]), or null when they break the budget
	// (p: the picks with the changes, one array for every attempt)
	const p = picks.slice();
	const attempt = (changes) => {
		let p2 = pairs;
		let s2 = short;
		for (const [i, k] of changes) {
			p2 += pools[i][k].pairs - pools[i][picks[i]].pairs;
			s2 += (pools[i][k].short ? 1 : 0) - (pools[i][picks[i]].short ? 1 : 0);
		}
		if (budget !== null && p2 > budget) return null;
		for (const [i, k] of changes) p[i] = k;
		// only the boundaries next to a changed stage can change (each once)
		let v2 = viol;
		const [a, b] = changes.length > 1 ? (changes[0][0] < changes[1][0] ? [changes[0][0], changes[1][0]] : [changes[1][0], changes[0][0]]) : [changes[0][0], -1];
		for (const i of b < 0 ? [a, a + 1] : b === a + 1 ? [a, a + 1, b + 1] : [a, a + 1, b, b + 1]) if (i < n) v2 += violAt(p, i) - violAt(picks, i);
		let level = 0;
		if (ctx.better) {
			const parts = new Array(n);
			for (let i = 0; i < n; i++) parts[i] = pools[i][p[i]].level;
			level = psLevelOf(parts);
		}
		for (const [i] of changes) p[i] = picks[i];
		const judge = E.tryChange(st, changes);
		judge.pairs = p2;
		judge.short = s2;
		judge.viol = v2;
		judge.level = level;
		return judge;
	};
	const accept = (changes, judge) => {
		picks = picks.slice();
		for (const [i, k] of changes) picks[i] = k;
		for (const [i, k] of changes) p[i] = k;
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
				if (j && better(j, bestJ)) {
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
				for (let x = 0; x < ki; x++) {
					for (let y = 0; y < kj; y++) {
						// (the members tried: the first of each pool, or of ctx.order)
						const a = order ? order[i][x] : x;
						const b = order ? order[j][y] : y;
						if (a === picks[i] || b === picks[j]) continue;
						const change = [
							[i, a],
							[j, b]
						];
						const jj = attempt(change);
						if (jj && better(jj, bestJ)) {
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

/** The smallest and the largest resistor of a built stage, the inverter's matched pair left out (any equal value works there: the stock's nearest 10 kohm). */
function psMinResistor(design) {
	const rs = psResistors(design).filter(([k]) => k !== 'r');
	return rs.length ? Math.min(...rs.map(([, v]) => v)) : Infinity;
}
function psMaxResistor(design) {
	const rs = psResistors(design).filter(([k]) => k !== 'r');
	return rs.length ? Math.max(...rs.map(([, v]) => v)) : 0;
}
/** The capacitors of a built stage, as [name, farads] entries. */
function psCapacitors(design) {
	return Object.entries(design.components ?? {}).filter(([k, v]) => /^C/.test(k) && typeof v === 'number');
}
function psMinCapacitor(design) {
	const cs = psCapacitors(design);
	return cs.length ? Math.min(...cs.map(([, v]) => v)) : Infinity;
}
/** Which limit on its own parts a built stage breaks, the first of 'floor', 'ceiling' and 'cap', or null. */
function psPartsBreak(design) {
	if (psMinResistor(design) < PART_R_FLOOR * (1 - 1e-9)) return 'floor';
	if (psMaxResistor(design) > PART_R_MAX * (1 + 1e-9)) return 'ceiling';
	if (psMinCapacitor(design) < C_FLOOR * (1 - 1e-9)) return 'cap';
	return null;
}
/**
 * How far a built stage's values sit from sensible ones, for the order of
 * preference (rule 4): the sum of ln^2(R / 10 kohm) over its resistors (the
 * inverter's pair left out) and their count, a set's level being the sum
 * over its stages divided by the count, and whether a capacitor is under
 * C_FLOOR (which adds PS_TINY_LEVEL to the set's level).
 */
function psLevelParts(design) {
	let sum = 0;
	let count = 0;
	for (const [k, v] of psResistors(design)) {
		if (k === 'r') continue;
		sum += Math.log(v / 1e4) ** 2;
		count++;
	}
	return { sum, count, tiny: psMinCapacitor(design) < C_FLOOR * (1 - 1e-9) };
}
const PS_TINY_LEVEL = 100;
/** The level of a set of parts from its stages' psLevelParts. */
function psLevelOf(parts) {
	let sum = 0;
	let count = 0;
	let tiny = false;
	for (const p of parts) {
		sum += p.sum;
		count += p.count;
		tiny ||= p.tiny;
	}
	return (count ? sum / count : 0) + (tiny ? PS_TINY_LEVEL : 0);
}

/**
 * The pool of one stage: the designers' own picks first (`picks`, each
 * once), then its candidates by their miss after rounding (a pair has to
 * buy 0.2 % of it, a capacitor under C_FLOOR only when nothing else builds
 * the stage), up to `size` distinct responses for each of `targets`
 * ([{ stage, placedFor }]: the stage, and the same stage of the design on
 * the passband edge, whose candidates are marked placedFor 'edge'), and
 * PS_LEVEL_EXTRA more of those within PS_LEVEL_MISS of the closest, the
 * ones whose values sit nearest 10 kohm (for rule 4, sensible values).
 * Every member is built with `topology`, the circuit the op-amp count was
 * made for. `floor` is the stage's 1 / |H before| at each load frequency
 * (psLoadFloors), terminalY the admittance the combiner puts on a band-stop
 * branch's end, else null. Where capacitors were typed for the stage, the
 * members built from them come first: the designer's automatic values
 * (manualError) only when nothing else is.
 */
function psStagePool(targets, topology, picks, opts, ctx, G, freqs, size, floor, terminalY) {
	const members = [];
	// (extra: a member near 10 kohm for rule 4 only, kept out of the beam; a regular member of the same response takes its place)
	// (bySource: a member the source brings (see below); a regular member of the same response takes its place too, and
	// counts as new: the search for an ideal source would have taken it)
	const add = (design, source, pairs = filterPairCount(design, opts.resistorSeries), extra = false, bySource = false) => {
		if (!design || design.topology !== topology) return false;
		const twin = (m) => m.pairs === pairs && Boolean(m.design.manualError) === Boolean(design.manualError) && psSameResponse(m.design, design);
		const found = members.find((m) => m.design === design || twin(m));
		if (found) {
			if (!extra) found.extra = false;
			if (!bySource && found.bySource) {
				found.bySource = false;
				return true;
			}
			return false;
		}
		// (one shape for every member, its loads solved once asked for (psLoadsOf), its response once in a pool)
		members.push({ design, source, pairs, short: Boolean(design.stockShortfall), loadData: undefined, follows: null, broken: psPartsBreak(design), level: psLevelParts(design), extra, bySource, freqs, floor, resp: null, db: null });
		return true;
	};
	// whether a member of the same response as `design`, single resistors only, is in the pool already
	const hasSingle = (design) => members.some((m) => !m.extra && !m.bySource && m.pairs === 0 && Boolean(m.design.manualError) === Boolean(design.manualError) && (m.design === design || psSameResponse(m.design, design)));
	for (const p of picks) if (p) add(p, 'designer');
	const searched = PS_SEARCHED[topology];
	const caps = searched ? psCaps(topology, ctx.override) : null;
	const typed = Boolean(ctx.override) && Object.values(ctx.override).some((v) => v > 0);
	// the `size` best candidates within the limits on their parts ('strict'), with their resistors from
	// PART_R_FLOOR whatever their capacitors and their largest resistor ('floor': a tiny capacitor where
	// every way within the floor needs one), or in the designers' own range ('loose'), by their miss
	// after rounding, and a few near 10 kohm (listed once)
	const taken = new Set();
	const listed = new Map();
	const built = new Map();
	// (mode 'load': further down the strict list, those whose own outputs keep PART_LOAD_MIN; see strict())
	// On the input node (ctx.source) the pool is the one the stage has for an ideal source, and PS_SOURCE_EXTRA more
	// for the source (marked bySource): where it adds to the input resistor (PS_SOURCE_AIMS), the closest of the
	// candidates rounded for it (psRecords with the source); where it bends the response another way (an input
	// capacitor, or the Boctor sections' two input branches), the closest PS_SOURCE_SCAN read with it, ranked by
	// their miss and the shape the source gives the passband (psSourceSpread). A Tow-Thomas low-pass or band-pass
	// takes its input through R1 into a virtual ground: the source only scales it, and brings none.
	const sourceWay = !ctx.source || PS_SOURCE_FLAT[topology] ? null : PS_SOURCE_AIMS[topology] ? 'aim' : 'bend';
	const listedAim = new Map();
	const take = (mode) => {
		if (!searched || taken.has(mode)) return;
		taken.add(mode);
		targets.forEach(({ stage, placedFor }, t) => {
			if (!listed.has(t)) listed.set(t, psRecords(stage, topology, opts, caps, PS_R_MIN, { ...ctx, source: null }));
			const all = listed.get(t);
			const usableOf = (list) => {
				const recs = mode === 'loose' ? list : mode === 'floor' ? list.filter((r) => psRecordLow(r) >= PART_R_FLOOR * (1 - 1e-9)) : list.filter(psRecordWithin);
				const anyBig = recs.some((r) => !r.small);
				return anyBig ? recs.filter((r) => !r.small) : recs;
			};
			const usable = usableOf(all);
			// (each record built once, whatever modes ask for it: its loads are then solved once too)
			const build = (r) => {
				if (built.has(r)) return built.get(r);
				const design = psRealize(stage, topology, r, opts, Boolean(caps), ctx);
				if (design && placedFor) design.placedFor = placedFor;
				built.set(r, design);
				return design;
			};
			const realize = (list, count, extra = false) => {
				let added = 0;
				for (let j = 0; j < list.length && added < count; j++) if (add(build(list[j].r), 'search', list[j].r.pairs, extra)) added++;
			};
			const score = (r) => r.miss + 0.002 * r.pairs + 1e-6 * r.level;
			// (with pairs, the candidates of single resistors are read apart too: a limit on pairs, however small, keeps
			// what a search of single resistors weighs, PS_SINGLES of them at least, and the loads they keep)
			const singles = opts.pairs ? usable.filter((r) => !r.pairs) : null;
			if (mode === 'load' || mode === 'loadSingles') {
				// (the closest first, each read for its loads; with pairs, the single resistors apart, see strict()).
				// The capacitors set a stage's impedance and its loads with it, the rounding of its resistors moves
				// them a little: once one of a choice of capacitors loads its outputs far too much (PS_LOAD_FAR, the
				// members read already among them), the others of that choice are not read.
				const recs = mode === 'load' ? usable : (singles ?? []);
				const most = mode === 'load' ? size : PS_SINGLES;
				const far = new Set();
				for (const m of members) if (m.loadData !== undefined && m.loadData && loadOf(m) < PART_LOAD_MIN / PS_LOAD_FAR) far.add(psCapsKey(m.design.components));
				let added = 0;
				for (const { r } of psFirst(recs.map((x) => ({ r: x, score: score(x) })), PS_LOAD_SCAN)) {
					if (added >= most) break;
					const key = psCapsKey(r.parts);
					if (far.has(key)) continue;
					const design = build(r);
					if (!design || design.topology !== topology) continue;
					const m = { design, freqs, loadData: undefined };
					const load = psLoadsOf(m) ? loadOf(m) : Infinity;
					if (load >= PART_LOAD_MIN * (1 - 1e-9)) {
						if (add(design, 'search', r.pairs)) added++;
					} else if (load < PART_LOAD_MIN / PS_LOAD_FAR) far.add(key);
				}
				return;
			}
			const list = psFirst(usable.map((r) => ({ r, score: score(r) })), 6 * size);
			realize(list.slice(0, 6 * size), size);
			if (singles && mode === 'strict') {
				// (those already in the pool count; the designers' own range adds to the pool, so those within the limits stay)
				let got = 0;
				for (const { r } of psFirst(singles.map((x) => ({ r: x, score: score(x) })), 6 * PS_SINGLES)) {
					if (got >= PS_SINGLES) break;
					const design = build(r);
					if (!design || design.topology !== topology) continue;
					add(design, 'search', 0);
					if (hasSingle(design)) got++;
				}
			}
			if (!list.length) return;
			const cut = list[0].r.miss + PS_LEVEL_MISS;
			const near = usable.filter((r) => r.miss <= cut);
			if (near.length > size) realize(psFirst(near.map((r) => ({ r, score: r.level + 0.002 * r.pairs + r.miss })), 6 * PS_LEVEL_EXTRA).slice(0, 6 * PS_LEVEL_EXTRA), PS_LEVEL_EXTRA, true);
			if (!sourceWay) return;
			// the members for the source, each new one marked
			const rated = [];
			if (sourceWay === 'aim') {
				if (!listedAim.has(t)) listedAim.set(t, psRecords(stage, topology, opts, caps, PS_R_MIN, ctx));
				const aimedUsable = usableOf(listedAim.get(t));
				for (const { r } of psFirst(aimedUsable.map((x) => ({ r: x, score: score(x) })), 6 * size).slice(0, 6 * size)) rated.push({ r, design: null });
			} else {
				for (const { r } of psFirst(usable.map((x) => ({ r: x, score: score(x) })), PS_SOURCE_SCAN).slice(0, PS_SOURCE_SCAN)) {
					const design = build(r);
					if (design && design.topology === topology) rated.push({ r, design, score: score(r) + psSourceSpread(design, ctx.source, G) });
				}
				rated.sort((a, b) => a.score - b.score);
			}
			let added = 0;
			for (const x of rated) {
				if (added >= PS_SOURCE_EXTRA) break;
				const design = x.design ?? build(x.r);
				// (a candidate rounded for R + Rs says so, for the page)
				if (design && sourceWay === 'aim') design.sourceRounded = ctx.source.rs;
				if (add(design, 'search', x.r.pairs, false, true)) added++;
			}
		});
	};
	const respond = (pool) => {
		for (const m of pool) {
			if (m.db) continue;
			m.resp = psStageResponse(m.design, G.w);
			// (on the input node: the source's factor, with the other branch's first stage the baseline's)
			if (ctx.source) psTimesSource(m.resp, psSourceOn([m.design], ctx.source.rs, G.w, true, ctx.source.other));
			m.db = psDb(m.resp.re, m.resp.im);
		}
		return pool;
	};
	const honours = (m) => !m.design.manualError;
	const typedFirst = (list) => (typed && list.some(honours) ? list.filter(honours) : list);
	const partsOk = (m) => !m.broken;
	// the end of a band-stop branch drives the combiner too
	const loadOf = (m) => {
		const data = psLoadsOf(m);
		const own = psOwnLoad(data, freqs, floor).load;
		return terminalY === null ? own : Math.min(own, psCrossLoad(data, null, freqs, floor, terminalY).load);
	};
	const loadOk = (m) => !psLoadsOf(m) || loadOf(m) >= PART_LOAD_MIN * (1 - 1e-9);
	// the members a pool is made of: the beam's, and those near 10 kohm for rule 4 after them
	// (lenient: the stage keeps no limit at all, its capacitors typed by hand taken past them)
	const split = (list, relaxed, lenient = false) => {
		const pool = list.filter((m) => !m.extra);
		return pool.length ? { pool: respond(pool), extras: respond(list.filter((m) => m.extra)), relaxed, lenient } : { pool: respond(list), extras: [], relaxed, lenient };
	};
	// which limit gives way on a stage none of whose members keeps them all: the first its members cannot keep with those before it
	const relaxedOf = (list) => (!list.some((m) => m.broken !== 'floor') ? 'floor' : !list.some((m) => m.broken !== 'floor' && m.broken !== 'ceiling') ? 'ceiling' : !list.some(partsOk) ? 'cap' : 'load');
	// the members that keep the limits before the one that gives way, in the order floor, ceiling, capacitors
	const keepsBefore = (kind) => (m) => kind === 'floor' || (kind === 'ceiling' ? m.broken !== 'floor' : m.broken !== 'floor' && m.broken !== 'ceiling');
	return {
		/**
		 * Within the limits: every resistor from PART_R_FLOOR to PART_R_MAX,
		 * every capacitor from C_FLOOR, every output of a pick PART_LOAD_MIN from
		 * the stage itself. The closest candidates may all load their outputs
		 * too much while others within the limits do not (smaller capacitors,
		 * larger resistors): the strict list is then read further down, up to
		 * PS_LOAD_SCAN of them, for those that keep their loads (with pairs, the
		 * single resistors apart as well, so that a limit on pairs keeps some
		 * that do whenever a search of single resistors would). A stage none
		 * of whose candidates keeps them all gives way on the first limit, in
		 * the order floor, ceiling, capacitors, loads, that none of them keeps
		 * with those before it, and is built with those that keep the ones
		 * before it (the loads given way: those that keep the limits on their
		 * parts); relaxed says which gave way, and a set of parts is within the
		 * limits when it keeps all the others there. The capacitors typed by
		 * hand come before the limits: when no member built from them keeps
		 * the limits, those past them are taken, and the stage is lenient (it
		 * keeps none of them).
		 */
		strict() {
			take('strict');
			const ok = (m) => partsOk(m) && loadOk(m);
			// (which limits the stage keeps is the question it answers for an ideal source: the members the source
			// brings, bySource, answer none of it, so the source never moves a limit; they join where they keep it)
			const own = (m) => !m.bySource;
			if (!members.some((m) => ok(m) && honours(m) && own(m))) take('load');
			if (opts.pairs && !members.some((m) => ok(m) && honours(m) && own(m) && m.pairs === 0)) take('loadSingles');
			const within = members.filter(ok);
			if (typed && !within.some((m) => honours(m) && own(m))) {
				take('floor');
				take('loose');
				const kept = members.filter(honours);
				if (kept.length) return split(kept, relaxedOf(kept.filter(own)), true);
			}
			if (within.some(own)) return split(typedFirst(within), null);
			const parts = members.filter(partsOk);
			if (parts.some(own)) return split(typedFirst(parts), 'load');
			take('floor');
			take('loose');
			const kind = relaxedOf(members.filter(own));
			return split(typedFirst(members.filter(keepsBefore(kind))), kind);
		},
		/** The designers' own range, the candidates within the limits and from the floor kept too. */
		loose() {
			take('strict');
			take('floor');
			take('loose');
			return split(typedFirst(members.slice()), null);
		},
		/** Whether capacitors were typed for the stage and some member is built from them: no set of parts may then do without them. */
		get honoured() {
			return typed && members.some(honours);
		}
	};
}
/** The extra members of a pool whose values sit nearest 10 kohm, and how much more than the closest candidate they may miss by (log). */
const PS_LEVEL_EXTRA = 6;
const PS_LEVEL_MISS = 0.01;
/** How far down its list of candidates within the limits a stage whose closest ones all load their outputs too much is read for some that do not. */
const PS_LOAD_SCAN = 96;
/** With pairs, how many of the closest candidates of single resistors a pool holds at least (and of those that keep their loads, where it reads them). */
const PS_SINGLES = 8;
/** A load this many times under PART_LOAD_MIN is far too low: the scan for loads passes over the candidates of the same capacitors. */
const PS_LOAD_FAR = 1.5;
/** The capacitor values of a record's parts or a stage's components, as a key: the stage's impedance, near enough. */
function psCapsKey(parts) {
	const values = new Set();
	for (const [k, v] of Object.entries(parts)) if (/^C(in|top|bottom|\d)?$/.test(k) && typeof v === 'number') values.add(v);
	return [...values].sort((a, b) => a - b).join(' ');
}
/** How many of its closest candidates a stage on the input node that the source does not simply add to is read with the source, and how many of them come along for it (psStagePool). */
const PS_SOURCE_SCAN = 96;
const PS_SOURCE_EXTRA = 6;

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
 *   sourceR    the resistance of the source driving the filter, ohms, in
 *              series with its input (0, the default, an ideal source; the
 *              page passes SOURCE_R_DEFAULT): every set of parts is measured
 *              and judged with it, and the stages on the input node are
 *              searched for it (see the source, below). The ideal design
 *              the parts aim at keeps an ideal source. No load limit applies
 *              to the source: it is not an op-amp output
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
 *   relaxed    per stage null, 'floor', 'ceiling', 'cap' or 'load': the
 *              first limit that gave way there (alerts say where)
 *   withinLimits  true when the parts chosen are the best set within the
 *              limits (whether it meets the template or not; its stages may
 *              still give way where no candidate keeps them, or where the
 *              capacitors typed need it: relaxed, alerts), false when no set
 *              within them could be built at all and the best of every set
 *              is shown instead, in the designers' own range (flagged); null
 *              without a search (search false, or a stage not built)
 *   alternative  when the parts within the limits miss the template and a set
 *              past them meets it: that set, in the same shape as this result
 *              (stages, measure, picks, fromEdge, edgeOnly, relaxed, alerts,
 *              loads, pairPlan, baseline, ideal, ms) with withinLimits false,
 *              pastLimits true, withinMargin the margin of the parts within
 *              the limits, and alternative null; the page and the script show
 *              it whole in place of this one when asked to. Else null
 *   alerts     [{ stage, kind: 'floor' | 'ceiling', resistor, value } |
 *              { stage, kind: 'cap', capacitor, value } | { stage, kind:
 *              'load', opamp, output, load, freq, atInput, on }]: every
 *              resistor under PART_R_FLOOR or over PART_R_MAX (the inverter's
 *              matched pair aside), every capacitor under C_FLOOR and every
 *              op-amp output that sees less than PART_LOAD_MIN in the parts
 *              chosen (atInput: the output swings less than the filter's input
 *              there, and the load is the resistor that would draw its current
 *              at full swing; on: 'next' or 'combiner' when the next stage's
 *              input or the summing amplifier on the output made it the
 *              least, null for the stage's own network), with manual true for
 *              a stage whose capacitors were typed by hand; limitAlertText
 *              puts them in words
 *   loads      per stage the least load of its outputs { load, freq, opamp, output, atInput, on }
 *              (a stage on the input node read with the source ahead: its
 *              input swings F times the source's, filterSource)
 *   sourceR    the source resistance searched for (0 for an ideal source)
 *   source     filterSource of the stages: null for an ideal source, else
 *              { r, inputs, shared, factorAt, figures }, the figures of the
 *              stages on the input node with the source and without it
 *   pairPlan   with a pair limit, the shape planFilterPairs returns (limited,
 *              limit, total, count, stages[{ option, design, count, kept,
 *              dropped, short }]), for filterPairPlanSummary and
 *              filterPairLimitSentence; else null
 *   ms         the time it took
 *   alternatives, designerPicks  every set judged and the designers' picks,
 *              for the search of the same design placed off the edge
 * The result is remembered for the same design and settings, and shared:
 * read it, copy it to change it.
 */
export function searchFilterParts(design, settings) {
	const { menus, resistorSeries = 'E24', capacitors = null, pairs = false, pairLimit = null, overrides = {}, combinerR = 10000, search = true, sourceR = 0 } = settings;
	// (a source of 0 ohm, or none given, is an ideal one)
	const rs = Number.isFinite(sourceR) && sourceR > 0 ? sourceR : 0;
	const key = JSON.stringify([design.stages.map(psTargetKey), filterTemplate(design), design.placement?.mode ?? null, menus, resistorSeries, capacitors, pairs, pairLimit, overrides, combinerR, search, rs]);
	if (PS_CACHE.has(key)) return PS_CACHE.get(key);
	const result = psSearchFilter(design, { menus, resistorSeries, capacitors, pairs, pairLimit, overrides, combinerR, search, sourceR: rs });
	if (PS_CACHE.size >= PS_CACHE_SIZE) PS_CACHE.delete(PS_CACHE.keys().next().value);
	PS_CACHE.set(key, result);
	return result;
}

function psSearchFilter(design, settings) {
	const t0 = Date.now();
	const { menus, resistorSeries, capacitors, pairs, pairLimit, overrides, combinerR, search, sourceR } = settings;
	const transformed = design.method === 'transformed';
	const stages = design.stages;
	const n = stages.length;
	const template = filterTemplate(design);
	const opts = { resistorSeries, capacitors, pairs };
	const limit = pairs && pairLimit !== null && pairLimit !== undefined ? pairLimit : null;
	const ctxOf = (i) => ({ menus, transformed, override: overrides[i] });
	const measureOpts = { combinerR, resistorSeries, template };
	// the source's resistance, on the input node (psSourceInputs): every set of parts is measured with it, the ideal design without
	const rs = sourceR;
	const sourceIdx = rs > 0 ? psSourceInputs(template, n) : [];
	const realOpts = rs > 0 ? { ...measureOpts, sourceR: rs } : measureOpts;
	const sourceOf = (list) => (rs > 0 ? { rs, inputs: sourceIdx.map((i) => list[i]) } : null);

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
	const empty = { measure: null, baseline: { stages: baseline, measure: null }, ideal: null, picks: [], relaxed: [], alerts: [], loads: [], pairPlan: null, alternative: null, sourceR: rs, source: null };
	if (baseline.some((s) => !s)) return { ...empty, stages: baseline, fromEdge: [], edgeOnly, withinLimits: null, ms: Date.now() - t0 };
	const baselineMeasure = measureFilter(baseline, design, realOpts);
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
	// (the pools read every stage as an ideal source drives the filter: the source only ever lowers the input node,
	// |F| <= 1 but for a few hundredths where an input takes a negative real current, so a pick that keeps its loads
	// there keeps them with it too, whatever stage on the input node it ends up with)
	const floors = psLoadFloors(idealStages, freqsAt, lpCount);
	// what the summing amplifier of a parallel band-stop puts on each branch's end, from its resistors
	const terminalOf = (combiner) => (i) => (lpCount !== null && combiner && (i === lpCount - 1 || i === n - 1) ? psTerminalY(combiner, i === n - 1 ? 1 : 0) : null);
	// (a set of parts read with its own stages ahead of each)
	const alertsOf = (list, combiner) => psAlerts(list, template, freqsAt, psLoadFloors(list, freqsAt, lpCount, sourceOf(list)), terminalOf(combiner), overrides);
	// the source on the input node: its stages' figures with it, and its factor there (none for an ideal source)
	const sourceInfo = (list) => filterSource(list, design, { sourceR: rs, template });
	const finish = (chosen, picks, pairPlan) => {
		const measure = chosen === baseline ? baselineMeasure : measureFilter(chosen, design, realOpts);
		const { alerts, loads } = alertsOf(chosen, measure.combiner);
		// where the limits gave way: a resistor under the floor first, then one over the ceiling, a capacitor under its floor, an output under its load
		const relaxed = chosen.map((_, i) => PS_ALERT_KINDS.find((kind) => alerts.some((a) => a.stage === i && a.kind === kind)) ?? null);
		return { stages: chosen, measure, baseline: { stages: baseline, measure: baselineMeasure }, ideal, picks, relaxed, alerts, loads, pairPlan, sourceR: rs, source: sourceInfo(chosen), ms: Date.now() - t0 };
	};
	if (!search) return { ...finish(baseline, stages.map(() => 'designer'), null), fromEdge: baseline.map((d) => d.placedFor === 'edge'), edgeOnly, withinLimits: null, alternative: null };

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
	// (the plans of every limit share the designers' reruns: planFilterPairsAll)
	const baselinesAt = (targets, own, lims) => {
		const plans = planFilterPairsAll(targets, own, resistorSeries, lims.filter((m) => m !== null));
		let k = 0;
		return lims.map((m) => (m === null ? targets.map((_, i) => own(i, pairs)) : plans[k++].stages.map((s) => s.design)));
	};
	const baselines = baselinesAt(targetStages, pick, limitsUpTo(pick));
	if (twin) for (const b of baselinesAt(twin, pickT, limitsUpTo(pickT))) if (counted(b)) baselines.push(b);
	// a set of today's parts is a whole answer only within the limit
	const fits = (list) => limit === null || usedBy(list) <= limit;
	const optionsOf = (i, own) => {
		const list = [own(i, false)];
		if (pairs) {
			list.push(own(i, true));
			if (PS_PAIR_OPTIONS[topologies[i]]) {
				const names = (filterPairGroups(own(i, true), resistorSeries) ?? []).map((g) => g.name);
				for (let m = 1; m < names.length; m++) for (const sub of psSubsets(names, m)) list.push(own(i, sub));
			}
		}
		return list;
	};
	const pickLists = stages.map((s, i) => [...baselines.map((b) => b[i]), ...optionsOf(i, pick), ...(twin && !edgeOnly[i] ? optionsOf(i, pickT) : [])].filter(Boolean));
	// today's parts at this very limit are a whole answer too (beyond the pairs where they help would use, the same as theirs)
	if (!baselines.includes(baseline)) baselines.push(baseline);

	// the beam and the moves on part of the page's grid, the final choice on all of it: every second
	// passband point (every fourth for a parallel band-stop or a long cascade), every fourth stopband
	// point (the passband's least room is where sets of parts the closest to the template part ways,
	// and every fourth point there reads it wrong by a few hundredths of a dB)
	const big = n > 8;
	const G = psGrid(template, lpCount !== null || big ? 4 : 2, 4);
	const terminal = terminalOf(baselineMeasure.combiner);
	// (the twin brings its designers' picks and today's parts; its own candidates come with the edge design's search below)
	const targetsOf = (i) => [edgeOnly[i] ? { stage: twin[i], placedFor: 'edge' } : { stage: stages[i], placedFor: null }];
	const size = big ? 10 : 16;
	// a stage on the input node reads its members with the source (a parallel band-stop's with the other branch's first stage the designer's)
	const poolCtx = (i) => {
		if (!sourceIdx.includes(i)) return ctxOf(i);
		const other = sourceIdx.filter((j) => j !== i).map((j) => baseline[j]);
		return { ...ctxOf(i), source: { rs, other: other.length ? psSumY(other, G.w) : null } };
	};
	const stagePools = stages.map((s, i) => psStagePool(targetsOf(i), topologies[i], pickLists[i], opts, poolCtx(i), G, freqsAt(i), size, floors[i], terminal(i)));
	// (with a source, the stages on the input node once more as an ideal source has them, for the runs' beam; none
	// where every one is a Tow-Thomas input into a virtual ground, which the source only scales)
	const stagePools0 = sourceIdx.some((i) => !PS_SOURCE_FLAT[topologies[i]])
		? stages.map((s, i) => (sourceIdx.includes(i) ? psStagePool(targetsOf(i), topologies[i], pickLists[i], opts, ctxOf(i), G, freqsAt(i), size, floors[i], terminal(i)) : stagePools[i]))
		: null;
	// one search: within the limits (strict) or in the designers' own range
	const run = (strict) => {
		const built = stagePools.map((sp) => (strict ? sp.strict() : sp.loose()));
		const pools = built.map((b) => b.pool);
		const relaxed = built.map((b) => b.relaxed);
		const lenient = built.map((b) => b.lenient);
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
		const idealLoss = psLossCurve(idealD, G);
		const E = psEvaluator(G, pools, idealResp, lpCount, combine, idealLoss, mIdeal);
		// (rule 4 moves over the pools with their members near 10 kohm after the beam's own, built when first asked for)
		const extras = built.map((b) => b.extras);
		let wide = null;
		const widened = () => {
			if (!wide) {
				const all = pools.map((pool, i) => [...pool, ...extras[i]]);
				wide = { pools: all, E: psEvaluator(G, all, idealResp, lpCount, combine, idealLoss, mIdeal) };
			}
			return wide;
		};
		// the load rule between two stages, unless the stage after a branch's end (a band-stop's high-pass branch starts at the source),
		// and unless no candidate of the one can leave any candidate of the other its load: that output gives way
		const cross = stages.map((_, i) => strict && i > 0 && !(lpCount !== null && i === lpCount));
		cross.forEach((c, i) => {
			// (as the stages have it for an ideal source: the members the source brings move no limit, strict())
			if (c && !pools[i - 1].some((a) => !a.bySource && pools[i].some((b) => !b.bySource && psLoadOk(a, b)))) {
				cross[i] = false;
				relaxed[i - 1] = relaxed[i - 1] ?? 'load';
			}
		});
		// with pairs, the same width for every count, with a limit or without
		const ctx = { limit, width: pairs ? (big ? 4 : 6) : big ? 8 : 12, cross, moves: big ? 3 : 6 };
		// With a source that does more than scale the stages on the input node (stagePools0), the beam runs over
		// the pools an ideal source has, read without the source: the search an ideal source makes, the same
		// states and solutions (beam0, whose sets are judged with the source like the rest). Its solutions then
		// move with the source over the whole pools, the members the source brings among them (psMovedWithSource).
		if (!stagePools0) {
			const beam = psBeam(pools, E, ctx);
			return { pools, relaxed, lenient, solutions: beam.solutions, finals: beam.finals, beam0: null, G, E, ctx, widened };
		}
		const built0 = stagePools0.map((sp, i) => (sp === stagePools[i] ? built[i] : strict ? sp.strict() : sp.loose()));
		const pools0 = built0.map((b) => b.pool);
		const E0 = psEvaluator(G, pools0, idealResp, lpCount, combine, idealLoss, mIdeal);
		const cross0 = stages.map((_, i) => strict && i > 0 && !(lpCount !== null && i === lpCount) && pools0[i - 1].some((a) => pools0[i].some((b) => psLoadOk(a, b))));
		const ctx0 = { ...ctx, cross: cross0 };
		const b0 = psBeam(pools0, E0, ctx0);
		// (and rule 4 from its solutions, over the same pools with their members near 10 kohm)
		let wide0 = null;
		const widened0 = () => {
			if (!wide0) {
				const all = pools0.map((pool, i) => [...pool, ...built0[i].extras]);
				wide0 = { pools: all, E: psEvaluator(G, all, idealResp, lpCount, combine, idealLoss, mIdeal) };
			}
			return wide0;
		};
		const beam0 = { pools: pools0, solutions: b0.solutions, finals: b0.finals, ctx: ctx0, widened: widened0 };
		const solutions = b0.solutions.map((sol) => psMovedWithSource(sol, pools0, pools, E, ctx)).filter(Boolean);
		return { pools, relaxed, lenient, solutions, finals: [], beam0, G, E, ctx, widened };
	};
	// Rule 4 on a run's solution that meets the template on the grid: moves
	// from it toward sensible values while the margin and the deviation stay
	// within their tolerances of its own, kept within its own pair count as
	// the beam keeps it (so a larger pair limit only adds such sets).
	const sensibleMoves = (r, sol) => {
		if (!sol.judge.meets) return null;
		const thr = psSensibleAround(sol.judge);
		const budget = sol.judge.pairs > PS_PAIR_COUNTS ? limit : sol.judge.pairs;
		// (over the pools with their members near 10 kohm, the beam's own first, so its picks keep their places;
		// the two-stage moves try the members nearest sensible values first)
		const w = r.widened();
		w.order ??= w.pools.map((pool) => pool.map((_, k) => k).sort((a, b) => psLevelOf([pool[a].level]) - psLevelOf([pool[b].level]) || a - b));
		const moved = psDescend({ picks: sol.picks.slice(), judge: sol.judge }, w.pools, w.E, { ...r.ctx, budget, better: (a, b) => psBetterLevel(a, b, thr), order: w.order });
		return moved.picks.every((k, i) => k === sol.picks[i]) ? null : moved.picks.map((k, i) => w.pools[i][k].design);
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
		if (!exactMemo.has(k)) exactMemo.set(k, psExactJudge(list, X, template, mIdeal, { combinerR, resistorSeries, sourceR: rs }));
		return exactMemo.get(k);
	};
	const strictRun = run(true);
	// each pair count's best of a run and the states its beam ended with, judged on the page's own measure
	const listsOf = (b) => [...b.solutions, ...b.finals].map((sol) => sol.picks.map((k, i) => b.pools[i][k].design));
	const solutionsOf = (r) => listsOf(r);
	// the limit each stage gave way on (strictRun.relaxed), and the least load its outputs may see (PART_LOAD_MIN, or
	// the load the set closest to the limits reaches where no set keeps it, below)
	const gaveWay = strictRun.relaxed.slice();
	const loadAt = stages.map(() => PART_LOAD_MIN);
	// how far a set is past the limits: the largest factor (as a log) by which a part leaves its range or an output's
	// load falls short, 0 within them (on a stage that gave way on one, the limits before it only, PS_ALERT_KINDS);
	// withLoads false: on its parts alone
	const howFarPast = (list, withLoads = true) => {
		const loads = withLoads ? alertsOf(list, exact(list).combiner).loads : null;
		let far = 0;
		list.forEach((d, i) => {
			if (strictRun.lenient[i]) return;
			const gave = PS_ALERT_KINDS.indexOf(gaveWay[i]);
			const figures = [Math.log(PART_R_FLOOR / psMinResistor(d)), Math.log(psMaxResistor(d) / PART_R_MAX), Math.log(C_FLOOR / psMinCapacitor(d))];
			if (withLoads) figures.push(Math.log(loadAt[i] / loads[i].load));
			for (let k = 0; k < (gave < 0 ? figures.length : Math.min(gave, figures.length)); k++) far = Math.max(far, figures[k]);
		});
		return far > 1e-9 ? far : 0;
	};
	// every set judged ({ list, judge }), the best within the limits and the best of all
	const judged = [];
	let within = null;
	let any = null;
	// where some way to build a stage keeps the capacitors typed for it, every set of parts keeps them
	const honoured = stagePools.map((sp) => sp.honoured);
	// (every set judged, for a design placed off the edge whose search takes this one's: alternatives)
	const alternatives = [];
	// whether a set keeps the limits, and how far past them it is, asked once and only where it matters
	const past = (e) => (e.past ??= howFarPast(e.list));
	const keeps = (e) => past(e) === 0;
	// (two sets past the limits by factors within PS_PAST_TIE of each other are as close to them)
	const asClose = (a, b) => Math.abs(past(a) - past(b)) <= PS_PAST_TIE;
	// (ideal: the sets an ideal source's beam found, and today's parts, which its search would weigh: ideal0)
	const ideal0 = [];
	const consider = (list, ideal = false) => {
		if (!list || list.some((d, i) => honoured[i] && d.manualError)) return;
		alternatives.push(list);
		const e = { list, judge: exact(list).judge, past: undefined };
		judged.push(e);
		if (ideal) ideal0.push(e);
		if ((!within || psBetter(e.judge, within.judge)) && keeps(e)) within = e;
		if (!any || psBetter(e.judge, any.judge)) any = e;
	};
	// a run's sets: its beam's, and with a source its ideal source's beam's (beam0) and rule 4 from those
	const considerRun = (r) => {
		for (const list of solutionsOf(r)) consider(list);
		if (r.beam0) for (const list of listsOf(r.beam0)) consider(list, true);
	};
	considerRun(strictRun);
	// rule 4, sensible values, from each pair count's best within the limits
	for (const sol of strictRun.solutions) consider(sensibleMoves(strictRun, sol));
	for (const sol of strictRun.beam0?.solutions ?? []) consider(sensibleMoves(strictRun.beam0, sol), true);
	// today's parts, within the limit
	for (const b of baselines) if (fits(b) && counted(b)) consider(b, true);
	// The pools read each output's load with the ideal stages ahead of it, a
	// set of parts with its own (alertsOf), and those can leave an output a
	// little short of its load where every member kept it. When no set judged
	// keeps every limit that way while some keep those on their parts, the
	// outputs short of their load in the one closest to the limits give way to
	// the load they reach there (flagged), and the best set within the limits
	// is found again: such a set is one the stock builds within the limits on
	// its parts, as close to the loads as the search came, not a set past
	// them.
	if (!within) {
		let near = null;
		for (const e of judged) {
			if (howFarPast(e.list, false) > 0) continue;
			if (!near || (asClose(e, near) ? psBetter(e.judge, near.judge) : past(e) < past(near))) near = e;
		}
		if (near) {
			const { loads } = alertsOf(near.list, exact(near.list).combiner);
			loads.forEach((l, i) => {
				if (gaveWay[i] === null && !strictRun.lenient[i] && l.load < PART_LOAD_MIN * (1 - 1e-9)) loadAt[i] = l.load * (1 - 1e-9);
			});
			for (const e of judged) e.past = undefined;
			for (const e of judged) if ((!within || psBetter(e.judge, within.judge)) && keeps(e)) within = e;
		}
	}
	// Short of the ideal design's margin, the designers' own range is searched
	// too. A set it finds that keeps the limits all the same counts as one
	// within them (the search past them tries more), so a larger pair limit
	// never loses it; one that breaks them is the alternative, offered when
	// nothing within them meets the template.
	const short = !within || !within.judge.meets || within.judge.capped < mIdeal - PS_MARGIN_TIE;
	// With a source, the same question as the search for an ideal source asks it (its sets judged without the
	// source): where that search goes on to the designers' own range, this one does too, so it weighs what that
	// one finds there.
	let short0 = false;
	if (!short && strictRun.beam0) {
		let best0 = null;
		for (const e of ideal0) {
			const judge = psExactJudge(e.list, X, template, mIdeal, { combinerR, resistorSeries }).judge;
			if ((!best0 || psBetter(judge, best0)) && keeps(e)) best0 = judge;
		}
		short0 = !best0 || !best0.meets || best0.capped < mIdeal - PS_MARGIN_TIE;
	}
	const looseRun = short || short0 ? run(false) : null;
	if (looseRun) considerRun(looseRun);
	// Short of it too, and not far from the template, a design placed off
	// the passband edge also takes the sets of parts the same design on the
	// edge judges in its own search, each as a whole answer judged here: the
	// candidates around the edge design's targets. (On the same condition as
	// above, so a larger pair limit, whose sets include a smaller one's,
	// never ends worse.)
	const fromEdgeSearch = new Map();
	if (twinDesign && (short || short0) && any && any.judge.margin > -PS_EDGE_RETRY_DB) {
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
			consider(list.map(copyOf));
		}
	}
	// (today's parts when nothing else fits at all)
	if (!any) any = { list: baseline, judge: exact(baseline).judge, past: undefined };
	// Rule 4 around the best of a kind that meets the template: of the sets
	// judged that are acceptable around it (and keep the limits, for the
	// best within them), the one closest to sensible values.
	// (within: the sets that keep the limits; past them, the sets as close to them)
	const sensible = (best, inLimits) => {
		if (!best.judge.meets) return best;
		const thr = psSensibleAround(best.judge);
		let pick = best;
		for (const e of judged) if (e !== best && psBetterLevel(e.judge, pick.judge, thr) && (inLimits ? keeps(e) : asClose(e, best))) pick = e;
		return pick;
	};
	// Past the limits: a set that meets the template first, then the one closest to the limits, then the order of preference.
	const closest = () => {
		let best = null;
		for (const e of judged) {
			if (!best || (e.judge.meets && !best.judge.meets)) best = e;
			else if (e.judge.meets === best.judge.meets && (asClose(e, best) ? psBetter(e.judge, best.judge) : past(e) < past(best))) best = e;
		}
		return best ?? any;
	};
	// The parts within the limits come first, whether they meet the template
	// or not. When they miss it and parts past the limits meet it, those come
	// as the alternative (rule 4 among them too, from the designers' range
	// searched toward sensible values). With no set within the limits at all,
	// the best of every set is the answer, flagged.
	if ((!within || !within.judge.meets) && any.judge.meets && looseRun) {
		for (const sol of looseRun.solutions) consider(sensibleMoves(looseRun, sol));
		for (const sol of looseRun.beam0?.solutions ?? []) consider(sensibleMoves(looseRun.beam0, sol));
	}
	const chosen = within ? sensible(within, true) : sensible(closest(), false);
	// (a set that meets the template within the limits and ranks below them all the same, on stages built from the full grids, is none)
	const past1 = within && !within.judge.meets && any.judge.meets ? sensible(closest(), false) : null;
	const alternative = past1 && past(past1) > 0 ? past1 : null;
	const designerPicks = new Set(pickLists.flat());
	const picksOf = (list) => list.map((d, i) => (pickLists[i].includes(d) || fromEdgeSearch.get(d) === 'designer' ? 'designer' : 'search'));
	const planOf = (list) => (limit === null ? null : psPairPlan(list, stages.map((_, i) => pick(i, true)), resistorSeries, limit));
	const whole = (list) => ({ ...finish(list, picksOf(list), planOf(list)), fromEdge: list.map((d) => d.placedFor === 'edge'), edgeOnly });
	// (alternatives and designerPicks are for the search of the same design placed off the edge, which takes them)
	const main = whole(chosen.list);
	return {
		...main,
		withinLimits: Boolean(within),
		alternative: alternative && { ...whole(alternative.list), withinLimits: false, pastLimits: true, withinMargin: main.measure.margin, alternative: null },
		alternatives,
		designerPicks
	};
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

/** A built stage's response on an exact grid, kept per stage and grid, and its size in dB (db) once asked for. */
const PS_EXACT = new WeakMap();
function psExactResponse(design, X) {
	const kept = PS_EXACT.get(design);
	if (kept && kept.X === X) return kept.r;
	const r = psStageResponse(design, X.w);
	PS_EXACT.set(design, { X, r });
	return r;
}
function psExactDb(design, X) {
	const r = psExactResponse(design, X);
	return (r.db ??= psDbOf(r.re, r.im));
}
/** 20 log10 |H| of a response, |H| floored at 1e-12 as bode.js does. */
function psDbOf(re, im) {
	const out = new Float64Array(re.length);
	for (let k = 0; k < re.length; k++) out[k] = 20 * Math.log10(Math.max(Math.sqrt(re[k] * re[k] + im[k] * im[k]), 1e-12));
	return out;
}

/** The source's factor on an exact grid for the stages on the input node (one, or a parallel band-stop's two), kept per grid and stages: a search judges many sets with the same first stages. */
const PS_EXACT_F = new WeakMap();
function psExactSource(inputs, rs, X) {
	let byFirst = PS_EXACT_F.get(X);
	if (!byFirst) PS_EXACT_F.set(X, (byFirst = new WeakMap()));
	const [a, b] = inputs;
	let kept = byFirst.get(a);
	if (!kept) byFirst.set(a, (kept = { alone: null, with: new WeakMap() }));
	if (!b) return (kept.alone ??= psSourceOn([a], rs, X.w));
	let F = kept.with.get(b);
	if (!F) kept.with.set(b, (F = psSourceOn([a, b], rs, X.w)));
	return F;
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
function psExactJudge(list, X, t, mIdeal, { combinerR, resistorSeries, sourceR = 0 }) {
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
		// (the source's factor on the node both branches share)
		const F = sourceR > 0 ? psExactSource(psSourceInputs(t, list.length).map((i) => list[i]), sourceR, X) : null;
		for (let k = 0; k < len; k++) {
			let re = w0 * lp.re[k] + w1 * hp.re[k];
			let im = w0 * lp.im[k] + w1 * hp.im[k];
			if (F) {
				const r = re * F.re[k] - im * F.im[k];
				im = re * F.im[k] + im * F.re[k];
				re = r;
			}
			D[k] = 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-12));
		}
	} else {
		// (a cascade's dB are its stages' summed, the source's factor's with them)
		for (const d of list) {
			const db = psExactDb(d, X);
			for (let k = 0; k < len; k++) D[k] += db[k];
		}
		if (sourceR > 0 && list.length) {
			const F = psExactSource([list[0]], sourceR, X);
			const db = (F.db ??= psDbOf(F.re, F.im));
			for (let k = 0; k < len; k++) D[k] += db[k];
		}
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
	const judge = { pass, stop, margin, meets: pass >= -PASSBAND_SLACK_DB && stop >= -1e-6, capped: Math.min(margin, mIdeal), dev, pairs, short, level: psLevelOf(list.map(psLevelParts)) };
	return { judge, combiner };
}

/** The kinds of alert, in the order a stage's relaxed names the first. */
const PS_ALERT_KINDS = ['floor', 'ceiling', 'cap', 'load'];

/* ------------------------------------------------------- the alerts in words */

/** An op-amp named with its article ("a TL082", "an LM741"), or the general phrase for null. */
function psOpampPhrase(opamp) {
	if (!opamp) return 'a general-purpose op-amp such as the TL082 or the LM741';
	return `${/^[AEFHILMNORSX]/i.test(opamp) ? 'an' : 'a'} ${opamp}`;
}
const psCapital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** A round value as a sentence reads it: 2 kΩ rather than 2.00 kΩ. */
const psRound = (text) => text.replace(/\.0+(?= )/, '');
/** "A", "A and B", "A, B and C". */
function psListText(items) {
	return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
/** Where a load was read: from f down when f is the end of a passband's grid away from its edge (a low-pass's level holds to DC there), else at f. */
function psLoadWhere(f, t) {
	const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a / b - 1) < 1e-9;
	const edge = (x) => t.passEdges.some((e) => near(e.f, x));
	return t.pass.some((r) => near(f, r.from) && !edge(r.from)) ? `from ${formatHz(f)} down` : `at ${formatHz(f)}`;
}
/** The op-amps of a stage by their tag in the netlist: '' a stage's one op-amp, a to c a Tow-Thomas stage's three. */
const PS_OPAMP_NAMES = { a: 'A1', b: 'A2', c: 'A3' };
/** Parts named with their values, those of one value together: "R1 and R3 = 680 Ω, R2 = 820 Ω". */
function psPartsText(alerts, name, format) {
	const byValue = new Map();
	for (const a of alerts) byValue.set(a.value, [...(byValue.get(a.value) ?? []), a[name]]);
	return psListText([...byValue].map(([v, names]) => `${psListText(names)} = ${format(v)}`));
}

/**
 * The op-amp the alerts of a result name (limitAlertText): the one the MFB
 * band-pass stages are built for when they are (`builtFor`, the "Design the
 * MFB stages for" choice, when it is a TL082 or an LM741), else the one of
 * the LTspice file (`spice`) when it is a TL082 or an LM741, else null (the
 * general phrase). Both datasheets give the full swing into 2 kohm or more.
 */
export function limitAlertOpamp(result, builtFor = null, spice = null) {
	const named = (x) => (x === 'TL082' || x === 'LM741' ? x : null);
	const built = Boolean(result?.stages?.some((s) => s?.topology === 'mfbBp' && Number.isFinite(s.actual?.gbw)));
	return (built ? named(builtFor) : null) ?? named(spice);
}

/**
 * The alerts of a result of searchFilterParts (or of its alternative) in
 * plain sentences, the same words on the page and in the downloaded
 * script. `opamp` names the op-amp the 2 kohm load is for (limitAlertOpamp:
 * 'TL082', 'LM741', or any name), null for the general phrase.
 * Returns
 *   stages   [{ stage, manual, text }]: per stage with an alert (stage from
 *            0), one sentence for its load ("Stage 1's output drives about
 *            475 Ω at 4.22 kHz (its own feedback and stage 2's input), under
 *            the 2 kΩ an LM741 needs to swing ±10 V."), one for its
 *            resistors under the floor, one for those over the ceiling, one
 *            for its capacitors under C_FLOOR, and for parts within the
 *            limits, why the stage keeps them anyway (the capacitors typed
 *            for it, or typed and unable to build it, those typed for the
 *            next stage whose input loads it, no way of building it within
 *            the limits, or no parts for it and the next that keep the load
 *            at once)
 *   summary  the paragraph that goes before them: what each limit broken is
 *            for, which stages break them, and for parts past the limits
 *            (the alternative, or no set within them at all) why; '' when
 *            no stage breaks one
 *   offer    for parts within the limits that miss the template while
 *            parts past them meet it (result.alternative), the line that
 *            says so ("Parts past the limits meet the template, with 0.23 dB
 *            of margin."); else ''
 */
export function limitAlertText(result, opamp = null) {
	const empty = { stages: [], summary: '', offer: '' };
	if (!result || !result.measure || !result.stages?.length || result.stages.some((s) => !s)) return empty;
	const t = result.measure.template;
	const who = psOpampPhrase(opamp);
	const loadMin = psRound(formatOhms(PART_LOAD_MIN));
	const alerts = result.alerts ?? [];
	const n = result.stages.length;
	// (parts past the limits on purpose: the summary says why, once)
	const past = Boolean(result.pastLimits) || result.withinLimits === false;
	const stages = [];
	for (let i = 0; i < n; i++) {
		const here = alerts.filter((a) => a.stage === i);
		if (!here.length) continue;
		const of = (kind) => here.filter((a) => a.kind === kind);
		const sentences = [];
		const load = of('load')[0];
		if (load) {
			const opampName = load.output ? 'output' : (PS_OPAMP_NAMES[load.opamp] ?? `op-amp ${load.opamp}`);
			const lastOfBranch = t.parallel ? i === t.lpCount - 1 || i === n - 1 : i === n - 1;
			const around = !load.output ? 'the parts around it' : load.on === 'next' && !lastOfBranch ? `its own feedback and stage ${i + 2}'s input` : load.on === 'combiner' ? "its own feedback and the summing amplifier's input" : 'its own feedback';
			sentences.push(`Stage ${i + 1}'s ${opampName} drives about ${formatOhms(load.load)} ${psLoadWhere(load.freq, t)} (${around}), under the ${loadMin} ${who} needs to swing ±10 V.`);
		}
		const floor = of('floor');
		if (floor.length) sentences.push(`Stage ${i + 1} has ${psPartsText(floor, 'resistor', formatOhms)}, under the ${psRound(formatOhms(PART_R_FLOOR))} floor: ${floor.length > 1 ? 'resistors that small load the op-amps that drive them' : 'a resistor that small loads the op-amp that drives it'}.`);
		const ceiling = of('ceiling');
		if (ceiling.length) sentences.push(`Stage ${i + 1} has ${psPartsText(ceiling, 'resistor', formatOhms)}, over the ${psRound(formatOhms(PART_R_MAX))} ceiling: ${ceiling.length > 1 ? 'resistors that large pick' : 'a resistor that large picks'} up noise and leakage.`);
		const cap = of('cap');
		if (cap.length) sentences.push(`Stage ${i + 1} has ${psPartsText(cap, 'capacitor', formatFarads)}, under ${psRound(formatFarads(C_FLOOR))}: ${cap.length > 1 ? 'capacitors that small compete' : 'a capacitor that small competes'} with the stray capacitance of a breadboard.`);
		const manual = here.some((a) => a.manual);
		// (an output loaded by the next stage's input, built from capacitors typed for it: those need the load)
		const next = result.stages[i + 1];
		const nextTyped = Boolean(load && load.on === 'next' && !floor.length && !ceiling.length && !cap.length && next?.manual && !next.manualError);
		if (manual) sentences.push('The capacitors typed for this stage need these values.');
		else if (result.stages[i].manualError) sentences.push("The capacitors typed for this stage cannot build it, so it keeps its designer's own values.");
		else if (nextTyped) sentences.push(`The capacitors typed for stage ${i + 2} need that load.`);
		else if (!past) sentences.push(load && !floor.length && !ceiling.length && !cap.length && load.on === 'next' ? 'No parts for this stage and the next keep that load at once.' : 'No way the stock builds this stage stays within the limits.');
		stages.push({ stage: i, manual, text: sentences.join(' ') });
	}
	const offer = result.alternative?.measure?.meets && !result.measure.meets ? `Parts past the limits meet the template, with ${result.alternative.measure.margin.toFixed(2)} dB of margin.` : '';
	if (!stages.length) return { ...empty, offer };
	const kinds = new Set(alerts.map((a) => a.kind));
	const what = [];
	if (kinds.has('load')) what.push(`${psCapital(who)} swings its full ±10 V only into ${loadMin} or more.`);
	if (kinds.has('floor')) what.push(`A resistor under ${psRound(formatOhms(PART_R_FLOOR))} loads the op-amp behind it.`);
	if (kinds.has('ceiling')) what.push(`A resistor over ${psRound(formatOhms(PART_R_MAX))} picks up noise and leakage.`);
	if (kinds.has('cap')) what.push(`A capacitor under ${psRound(formatFarads(C_FLOOR))} competes with the stray capacitance of a breadboard.`);
	const broken = kinds.size > 1 ? 'those limits' : kinds.has('floor') ? 'the resistor floor' : kinds.has('ceiling') ? 'the resistor ceiling' : kinds.has('cap') ? 'the capacitor floor' : 'the load limit';
	const list = stages.map((s) => String(s.stage + 1));
	what.push(`${stages.length > 1 ? `Stages ${psListText(list)} break` : `Stage ${list[0]} breaks`} ${broken}: see under ${stages.length > 1 ? 'each' : 'it'}.`);
	if (!stages.every((s) => s.manual)) {
		if (result.pastLimits) what.push(`These parts meet the template past the limits${Number.isFinite(result.withinMargin) ? `: the best set within them misses it by ${(-result.withinMargin).toFixed(2)} dB` : ''}.`);
		else if (result.withinLimits === false) what.push(`No set of parts within the limits can be built here, so these keep the designers' own range, from ${psRound(formatOhms(PS_R_MIN))}.`);
	}
	return { stages, summary: what.join(' '), offer };
}

/**
 * The loads and the alerts of a set of parts: freqsAt(i) the frequencies
 * stage i is read at, floors[i] its 1 / |H before| there (psLoadFloors),
 * terminalAt(i) the admittance the summing amplifier puts on a band-stop
 * branch's end, else null. The limits on the parts are checked on the
 * circuits searched (every one these designs use), the inverter's matched
 * pair left out.
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
		// (manual: the stage is built from the capacitors typed for it)
		const manual = Object.values(overrides[i] ?? {}).some((v) => v > 0) && !d.manualError;
		if (PS_SEARCHED[d.topology]) {
			for (const [name, v] of psResistors(d)) {
				if (name === 'r') continue;
				if (v < PART_R_FLOOR * (1 - 1e-9)) alerts.push({ stage: i, kind: 'floor', resistor: name, value: v, manual });
				else if (v > PART_R_MAX * (1 + 1e-9)) alerts.push({ stage: i, kind: 'ceiling', resistor: name, value: v, manual });
			}
			for (const [name, v] of psCapacitors(d)) if (v < C_FLOOR * (1 - 1e-9)) alerts.push({ stage: i, kind: 'cap', capacitor: name, value: v, manual });
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
