/**
 * The filter tool introduced from the beginning, in seven steps: see a
 * filter act on two tones, count in decibels, build the smallest filter
 * (one resistor, one capacitor) and watch it fail the spec, fix the slope
 * with the order, fix the knee with an op-amp and Q, turn stages into
 * parts, then read the rest of the page. Every number in the prose and in
 * the equations comes from the page's live values; when one is missing or
 * not finite the prose falls back to a general sentence and the equation
 * to its symbolic line.
 *
 * All arguments are optional, so a caller may pass a subset:
 *   filterType      'lowpass' | 'highpass' | 'bandpass' | 'bandstop' | 'narrowband'
 *   response        'butterworth' | 'chebyshev' | 'legendre' | 'bessel' | 'inverseChebyshev' | 'elliptic'
 *                   (for a band type, the low-pass side's, which the figures follow)
 *   topology        'mfb' | 'sallenKey' | 'towThomas'
 *   order, stages   the order used and the count of realized stages
 *   fp, fs          edges of a low-pass or high-pass, Hz
 *   fl, fh, fsl, fsh  edges of a band type, Hz
 *   lpFp, lpFs      the band type's low-pass side (fh, fsh for a band-pass; fl, fsl for a band-stop)
 *   amaxDb, aminDb  the two limits
 *   k               transition ratio of a low-pass or high-pass (always below 1)
 *   design          the result of designLowPass, designHighPass, designBandPass or designBandStop
 *   realizedStages  the stages built from rounded parts (panel 04)
 *   bandStopBranches, combineSigns   band-stop only: the two branches and the combiner's signs
 *   attenuationAtFs, attenuationAtFp                  the flags under panel 05, low-pass and high-pass
 *   attenuationAtFsl, attenuationAtFsh, attenuationAtFl, attenuationAtFh   the same for the band types
 *   stock           'E24' | 'E96' | 'lab' | 'labR' | 'custom'
 *   method          'transformed' when a band type is built from one low-pass prototype by
 *                   transformation (designBandPassTransformed / designBandStopTransformed, also
 *                   recognized from design.method); anything else keeps the cascade and
 *                   parallel-sum text. For it: design is that design, topology is the
 *                   Band-pass stages menu ('mfb' | 'towThomas'), order is not read, and the
 *                   figures and counts follow the prototype (passband edge B, stopband edge
 *                   Omega B, its own Amax and Amin) instead of a low-pass side
 *   topologyNotch   transformed only: the Notch stages menu, 'boctor' | 'towThomas'
 * For 'narrowband' only design (designNarrowBand's result, for the numbers
 * of its line) is read: the type gets a line of its own, then short
 * steps of its own (the band and Q, one stage, several, the six circuits,
 * the panels), every one true of the page in that mode.
 */

import { RESPONSES } from './approximations';
import { nearestResistor } from './eseries';
import { butterworthOrder, chebyshevOrder, transitionRatio } from './order';
import { bandStopbandRatio, designLowPass, minimumOrder } from './stages';

const h = (text) => ({ h: text });
const p = (text) => ({ p: text });
const eq = (tex, intro) => ({ eq: tex, intro });
const widget = (name, props) => ({ widget: name, props });
const terms = (list) => ({ terms: list });

const TWO_PI = 2 * Math.PI;
const TYPES = ['lowpass', 'highpass', 'bandpass', 'bandstop', 'narrowband'];
const C_RC = 10e-9; // the capacitor of the one-section example, 10 nF
const MAX_ORDER = 16; // the page's limit
// the stand-in used by the figures when the page has no valid design
const DEFAULT_SPEC = { response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null };

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const allPos = (...xs) => xs.every((x) => isNum(x) && x > 0);

/* ------------------------------------------------------------ formatting */

/** A spec number the way it was typed: 3, 0.5, 35000. */
const plain = (x) => String(Number(x.toPrecision(6)));

/** Three significant figures with a unit: 10.0 kHz, 350 Hz. */
function hzParts(f) {
	const r = Number(f.toPrecision(3));
	if (r >= 1e6) return [(r / 1e6).toPrecision(3), 'MHz'];
	if (r >= 1e3) return [(r / 1e3).toPrecision(3), 'kHz'];
	return [r.toPrecision(3), 'Hz'];
}
const hzText = (f) => hzParts(f).join(' ');
const hzTex = (f) => {
	const [v, u] = hzParts(f);
	return `${v}\\ \\text{${u}}`;
};

/** Up to three significant figures, trailing zeros dropped: 1.6, 8.2, 470. */
const trim3 = (x) => String(Number(x.toPrecision(3)));

function ohmParts(r) {
	if (r >= 1e6) return [trim3(r / 1e6), 'M'];
	if (r >= 1e3) return [trim3(r / 1e3), 'k'];
	return [trim3(r), ''];
}
const ohmTex = (r) => {
	const [v, prefix] = ohmParts(r);
	return prefix ? `${v}\\,\\text{${prefix}}\\Omega` : `${v}\\,\\Omega`;
};
const ohmWords = (r) => {
	const [v, prefix] = ohmParts(r);
	return `${v} ${prefix === 'M' ? 'megohm' : prefix === 'k' ? 'kilohm' : 'ohm'}`;
};
/** The unrounded result of a formula: whole ohms below 10 kilohm, as the design notes do. */
const ohmExactTex = (r) => (r < 1e4 ? `${Math.round(r)}\\ \\Omega` : ohmTex(r));

function faradTex(c) {
	if (c >= 1e-6) return `${trim3(c / 1e-6)}\\,\\mu\\text{F}`;
	if (c >= 1e-9) return `${trim3(c / 1e-9)}\\,\\text{nF}`;
	return `${trim3(c / 1e-12)}\\,\\text{pF}`;
}

/** 'a', 'a and b', 'a, b and c'. */
function listText(items) {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
const COUNT = ['no', 'one', 'two', 'three', 'four'];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ----------------------------------------------------------- the design */

function validDesign(d) {
	return d && Array.isArray(d.stages) && d.stages.length > 0 && isNum(d.n);
}

/**
 * The side of the design the figures and the counting use: the whole
 * filter, a band type's low-pass side, or, for a band type built by
 * transformation, its low-pass prototype (passband edge B, stopband edge
 * Omega B; without a design, the closer stopband edge's Omega).
 */
function sideOf({ type, fp, fs, fl, fh, fsl, fsh, lpFp, lpFs, design, transformed }) {
	if (transformed) {
		const proto = design && validDesign(design.lowpass) ? design.lowpass : null;
		const omega = allPos(fl, fh, fsl, fsh) ? Math.min(bandStopbandRatio(type, fl, fh, fsl), bandStopbandRatio(type, fl, fh, fsh)) : NaN;
		return {
			kind: 'lowpass',
			fp: proto ? proto.fp : fh - fl,
			fs: proto ? proto.fs : (fh - fl) * omega,
			a: 'B',
			b: 'ΩB',
			texA: 'B',
			texB: '\\Omega B',
			design: proto,
			prototype: true
		};
	}
	if (type === 'bandpass' || type === 'bandstop') {
		const stop = type === 'bandstop';
		return {
			kind: 'lowpass',
			fp: isNum(lpFp) ? lpFp : stop ? fl : fh,
			fs: isNum(lpFs) ? lpFs : stop ? fsl : fsh,
			a: stop ? 'fl' : 'fh',
			b: stop ? 'fsl' : 'fsh',
			texA: stop ? 'f_l' : 'f_h',
			texB: stop ? 'f_{sl}' : 'f_{sh}',
			design: design && validDesign(design.lp) ? design.lp : null
		};
	}
	return { kind: type, fp, fs, a: 'fp', b: 'fs', texA: 'f_p', texB: 'f_s', design: validDesign(design) ? design : null };
}

/** The side's spec is usable: four positive numbers, the edges the right way round, Amin above Amax. */
function specOk(side, amaxDb, aminDb) {
	if (!allPos(side.fp, side.fs, amaxDb, aminDb) || !(aminDb > amaxDb)) return false;
	return side.kind === 'highpass' ? side.fp > side.fs : side.fs > side.fp;
}

/** The second-order stages as { f0, q } and the first-order corner, from a design's stage list. */
function stageTable(design) {
	const second = design.stages.filter((s) => s.order === 2 && allPos(s.wn, s.q)).map((s) => ({ f0: s.wn / TWO_PI, q: s.q, ...(allPos(s.wz) ? { fz: s.wz / TWO_PI } : {}) }));
	const first = design.stages.find((s) => s.order === 1 && allPos(s.tau));
	return { second, fc: first ? 1 / (TWO_PI * first.tau) : null };
}

/* ------------------------------------------------ 1. what a filter does */

const TYPE_LINE = {
	lowpass: 'This page is set to low-pass: the low frequencies pass and the high ones are turned down, which is what removes hiss from a recording or smooths a jittery measurement.',
	highpass: 'This page is set to high-pass: the high frequencies pass and the low ones, hum and slow drift, are turned down.',
	bandpass: 'This page is set to band-pass: one window of frequencies passes and everything outside it is turned down. The tool builds it as a high-pass followed by a low-pass, so what follows applies to each half.',
	bandstop: 'This page is set to band-stop: one window is turned down and everything on either side passes. The tool builds it as a low-pass and a high-pass added together, so what follows applies to each branch.'
};

/** The band type's line when it is built from one low-pass prototype, with B and the centre when the edges allow. */
function transformedTypeLine(type, fl, fh) {
	const known = allPos(fl, fh) && fh > fl;
	const width = known ? `, here ${hzText(fh - fl)}` : '';
	const centre = known ? `, here ${hzText(Math.sqrt(fl * fh))}` : '';
	return type === 'bandpass'
		? `This page is set to band-pass: one window of frequencies passes and everything outside it is turned down. The tool builds it from one low-pass prototype whose passband edge is the bandwidth B = fh - fl${width}, moved up around the centre of the band, the geometric mean of fl and fh${centre}, so what follows applies to that prototype.`
		: `This page is set to band-stop: one window is turned down and everything on either side passes. The tool builds it from one low-pass prototype whose passband edge is the bandwidth B = fh - fl${width}, folded around the centre of the band, the geometric mean of fl and fh${centre}, so what follows applies to that prototype.`;
}

function whatAFilterDoes({ type, fp, fs, fl, fh, fsl, fsh, realizedStages, bandStopBranches, combineSigns, transformed = false }) {
	const band = type === 'bandpass' || type === 'bandstop';
	const edgesOk = band ? allPos(fl, fh, fsl, fsh) : allPos(fp, fs);
	const stagesOk = Array.isArray(realizedStages) && realizedStages.length > 0;
	const branchesOk = Array.isArray(bandStopBranches) && bandStopBranches.length === 2 && bandStopBranches.every((b) => Array.isArray(b) && b.length > 0);
	// a band-stop built by transformation is one chain of notch stages, with no branches
	const parallel = type === 'bandstop' && !transformed;
	const live = edgesOk && stagesOk && (!parallel || branchesOk);
	const props = live
		? {
				filterType: type,
				...(band ? { fl, fh, fsl, fsh } : { fp, fs }),
				stages: realizedStages,
				...(parallel ? { branches: bandStopBranches, signs: Array.isArray(combineSigns) ? combineSigns : [1, 1] } : {}),
				...(type === 'bandstop' && transformed ? { cascade: true } : {})
			}
		: {};
	return [
		h('What a filter does'),
		p(
			'Any signal is a sum of sine waves at different frequencies. A recorded voice holds low notes and high notes at once. A sensor wire carries a slow reading plus fast noise picked up along the way. A filter is a circuit whose gain, output amplitude divided by input amplitude, depends on frequency: near 1 for the frequencies that should pass, near 0 for the rest.'
		),
		p(
			`${transformed ? transformedTypeLine(type, fl, fh) : TYPE_LINE[type]} Active means the circuit is built around an op-amp, a small amplifier chip, with resistors and capacitors around it instead of coils. ${
				live
					? 'The figure sends two test tones through the circuit designed on this page, with the rounded part values of panel 04.'
					: 'The page has no valid design yet, so the figure sends two test tones through a default one, a fourth-order low-pass at 10 kHz.'
			}`
		),
		widget('two-tones', props)
	];
}

/* ------------------------------------------------------- 2. decibels */

// the two words and the edges, named before the limits use them
const PASSBAND = 'The passband, the frequencies that must get through,';
const STOPBAND = 'The stopband, the frequencies that must be turned down,';
const LIMITS = {
	lowpass: { bands: `${PASSBAND} lies below the edge fp. ${STOPBAND} lies above the edge fs.`, slide: 'Between fp and fs the filter is free to slide.' },
	highpass: { bands: `${PASSBAND} lies above the edge fp. ${STOPBAND} lies below the edge fs.`, slide: 'Between fs and fp the filter is free to slide.' },
	bandpass: { bands: `${PASSBAND} lies between the edges fl and fh. ${STOPBAND} lies below fsl and above fsh.`, slide: 'Between fsl and fl, and between fh and fsh, the filter is free to slide.' },
	bandstop: { bands: `${PASSBAND} lies below fl and above fh. ${STOPBAND} lies between fsl and fsh.`, slide: 'Between fl and fsl, and between fsh and fh, the filter is free to slide.' }
};

/** 10^(-A/20) to two significant figures: 0.71, 0.01. */
const ratioText = (db) => String(Number((10 ** (-db / 20)).toPrecision(2)));

/**
 * The decibels section of a band type built by transformation: one Amax,
 * and for a band-pass one Amin per stopband edge (named per edge when they
 * differ). The limits come from the design when there is one.
 */
function transformedDecibels({ type, amaxDb, aminDb, bandLimits, design }) {
	const limits = LIMITS[type];
	const valid = design && validDesign(design);
	const amax = valid && allPos(design.amaxDb) ? design.amaxDb : amaxDb;
	let aminLow = aminDb;
	let aminHigh = aminDb;
	if (valid && allPos(design.aminDbLow, design.aminDbHigh)) [aminLow, aminHigh] = [design.aminDbLow, design.aminDbHigh];
	else if (bandLimits && allPos(bandLimits.aminAtFsl, bandLimits.aminAtFsh)) [aminLow, aminHigh] = [bandLimits.aminAtFsl, bandLimits.aminAtFsh];
	const amaxOk = allPos(amax);
	const aminOk = allPos(aminLow, aminHigh);
	const split = aminOk && aminLow !== aminHigh;
	const limitsSentence = `Amax${amaxOk ? `, here ${plain(amax)} dB,` : ''} is how much the passband may sag. Amin${
		split ? `, ${plain(aminLow)} dB below fsl and ${plain(aminHigh)} dB above fsh,` : aminOk ? `, here ${plain(aminLow)} dB,` : ''
	} is how far down the stopband must be.`;
	const lines = ['A_{\\text{dB}} &= 20\\log_{10}\\dfrac{V_{in}}{V_{out}}'];
	const ratioLine = (name, db) => `${name} = ${plain(db)}\\ \\text{dB} &\\Rightarrow \\dfrac{V_{out}}{V_{in}} = 10^{-${plain(db)}/20} = ${ratioText(db)}`;
	if (amaxOk) lines.push(ratioLine('A_{max}', amax));
	if (split) lines.push(ratioLine('A_{min}(f_{sl})', aminLow), ratioLine('A_{min}(f_{sh})', aminHigh));
	else if (aminOk) lines.push(ratioLine('A_{min}', aminLow));
	const tex = lines.length === 1 ? 'A_{\\text{dB}} = 20\\log_{10}\\dfrac{V_{in}}{V_{out}}' : `\\begin{aligned} ${lines.join(' \\\\[4pt] ')} \\end{aligned}`;
	const intro =
		lines.length === 1
			? 'A decibel figure is a ratio in disguise. The loss in dB from the voltage ratio:'
			: `A decibel figure is a ratio in disguise. The loss in dB from the voltage ratio, then the page's ${lines.length === 2 ? 'limit' : 'limits'} turned back into ${lines.length === 2 ? 'a ratio' : 'ratios'}:`;
	return [
		h('Decibels and the two limits'),
		p(
			'Gain ratios run from 1 down to 0.001 and lower, which is awkward on one graph. The page counts them in decibels instead: 20 times the logarithm of the ratio. A ratio of 1 is 0 dB, 0.5 is about 6 dB down, 0.1 is 20 dB down, 0.01 is 40 dB down. Every factor of ten is another 20 dB, so a plot of dB against a log frequency axis turns the curves into near straight lines. That plot is a Bode plot, and panel 05 draws one.'
		),
		p(
			`The specification in panel 01 is written in this unit. ${limits.bands} ${limitsSentence} ${limits.slide} The limits and the edges draw forbidden zones on the Bode plot, under each passband and over each stopband, and any curve that misses them all is a valid design.`
		),
		eq(tex, intro)
	];
}

function decibels({ type, amaxDb, aminDb, bandLimits = null, transformed = false, design = null }) {
	if (transformed) return transformedDecibels({ type, amaxDb, aminDb, bandLimits, design });
	const band = type === 'bandpass' || type === 'bandstop';
	const limits = LIMITS[type];
	const amaxOk = allPos(amaxDb);
	const aminOk = allPos(aminDb);
	// a band filter whose two sides ask for different limits names both;
	// the figures below are then the low-pass side's, the one counted here
	const sideWord = type === 'bandstop' ? 'branch' : 'side';
	const bl = band && bandLimits && allPos(bandLimits.hp.amaxDb, bandLimits.hp.aminDb, bandLimits.lp.amaxDb, bandLimits.lp.aminDb) ? bandLimits : null;
	const amaxSplit = !!bl && bl.hp.amaxDb !== bl.lp.amaxDb;
	const aminSplit = !!bl && bl.hp.aminDb !== bl.lp.aminDb;
	const split = amaxSplit || aminSplit;
	const perSide = (hp, lp) => `${plain(hp)} dB on the high-pass ${sideWord} and ${plain(lp)} dB on the low-pass ${sideWord}`;
	const limitsSentence = `${
		amaxSplit ? `Amax, ${perSide(bl.hp.amaxDb, bl.lp.amaxDb)},` : `Amax${amaxOk ? `, here ${plain(amaxDb)} dB,` : ''}`
	} is how much the passband may sag. ${aminSplit ? `Amin, ${perSide(bl.hp.aminDb, bl.lp.aminDb)},` : `Amin${aminOk ? `, here ${plain(aminDb)} dB,` : ''}`} is how far down the stopband must be.`;
	const lines = ['A_{\\text{dB}} &= 20\\log_{10}\\dfrac{V_{in}}{V_{out}}'];
	if (amaxOk) lines.push(`A_{max} = ${plain(amaxDb)}\\ \\text{dB} &\\Rightarrow \\dfrac{V_{out}}{V_{in}} = 10^{-${plain(amaxDb)}/20} = ${ratioText(amaxDb)}`);
	if (aminOk) lines.push(`A_{min} = ${plain(aminDb)}\\ \\text{dB} &\\Rightarrow \\dfrac{V_{out}}{V_{in}} = 10^{-${plain(aminDb)}/20} = ${ratioText(aminDb)}`);
	const tex = lines.length === 1 ? 'A_{\\text{dB}} = 20\\log_{10}\\dfrac{V_{in}}{V_{out}}' : `\\begin{aligned} ${lines.join(' \\\\[4pt] ')} \\end{aligned}`;
	const intro =
		lines.length === 1
			? 'A decibel figure is a ratio in disguise. The loss in dB from the voltage ratio:'
			: `A decibel figure is a ratio in disguise. The loss in dB from the voltage ratio, then ${split ? `the low-pass ${sideWord}'s` : "the page's"} ${lines.length === 3 ? 'two limits' : 'limit'} turned back into ${lines.length === 3 ? 'ratios' : 'a ratio'}:`;
	return [
		h('Decibels and the two limits'),
		p(
			'Gain ratios run from 1 down to 0.001 and lower, which is awkward on one graph. The page counts them in decibels instead: 20 times the logarithm of the ratio. A ratio of 1 is 0 dB, 0.5 is about 6 dB down, 0.1 is 20 dB down, 0.01 is 40 dB down. Every factor of ten is another 20 dB, so a plot of dB against a log frequency axis turns the curves into near straight lines. That plot is a Bode plot, and panel 05 draws one.'
		),
		p(
			`The specification in panel 01 is written in this unit. ${limits.bands} ${limitsSentence} ${limits.slide} ${
				band
					? 'The limits and the edges draw forbidden zones on the Bode plot, under each passband and over each stopband, and any curve that misses them all is a valid design.'
					: 'The four numbers draw two forbidden zones on the Bode plot, one under the passband and one over the stopband, and any curve that misses both is a valid design.'
			}`
		),
		eq(tex, intro)
	];
}

/* ------------------------------------------- 3. one resistor, one capacitor */

function specProps(side, amaxDb, aminDb, type, ok) {
	if (!ok) return {};
	const band = type === 'bandpass' || type === 'bandstop';
	return { kind: side.kind, fp: side.fp, fs: side.fs, amaxDb, aminDb, live: true, ...(band ? { side: side.prototype ? 'prototype' : type } : {}) };
}

/** 'band-pass' or 'band-stop'. */
const bandName = (type) => (type === 'bandpass' ? 'band-pass' : 'band-stop');

function oneRc({ type, side, amaxDb, aminDb, ok }) {
	const band = type === 'bandpass' || type === 'bandstop';
	const high = side.kind === 'highpass';
	const fpOk = allPos(side.fp);
	const rExact = fpOk ? 1 / (TWO_PI * side.fp * C_RC) : NaN;
	const rE24 = fpOk ? nearestResistor(rExact, 'E24') : NaN;
	// one slope is enough only when the Butterworth count is at most 1
	const k = ok ? transitionRatio(high ? side.fs : side.fp, high ? side.fp : side.fs) : NaN;
	const nOne = ok ? butterworthOrder(amaxDb, aminDb, k) : NaN;
	let verdict = '.';
	if (isNum(nOne)) {
		verdict =
			nOne > 1
				? ", and with this page's spec no corner position clears both zones."
				: ". This page's spec is loose enough that one corner position does clear both zones, and the tool then builds a single first-order stage.";
		// a one-pole prototype becomes one band stage, not a first-order one
		if (side.prototype && nOne <= 1) verdict = ". This page's spec is loose enough that one corner position does clear both zones, so the prototype is a single RC section.";
	}
	const slope = high
		? 'Below it, every tenfold step down in frequency, a decade, costs another 20 dB, and that slope is fixed.'
		: 'Past it, every tenfold step in frequency, a decade, costs another 20 dB, and that slope is fixed.';
	const tex = fpOk
		? `\\begin{aligned} f_c &= \\dfrac{1}{2\\pi R C} \\\\[6pt] R &= \\dfrac{1}{2\\pi ${side.texA} C} = \\dfrac{1}{2\\pi \\cdot ${plain(side.fp)}\\ \\text{Hz} \\cdot 10\\ \\text{nF}} = ${ohmExactTex(rExact)} \\approx ${ohmTex(rE24)} \\end{aligned}`
		: 'f_c = \\dfrac{1}{2\\pi R C}';
	const intro = fpOk
		? `The corner sits where the capacitor's opposition to the signal equals the resistor's. One formula, then turned around to find the resistor that puts the corner at the passband edge${band ? `, ${side.a},` : ''} with a 10 nF capacitor, rounded to ${ohmWords(rE24)}, the nearest value in the E24 series of standard resistors:`
		: "The corner sits where the capacitor's opposition to the signal equals the resistor's:";
	return [
		h('One resistor, one capacitor'),
		p(
			`The simplest low-pass is a resistor in series and a capacitor to ground, output taken across the capacitor. A capacitor takes time to charge through a resistor. A slow sine wave leaves it plenty of time, so the capacitor voltage follows the input almost exactly: gain near 1. A fast sine wave reverses before the capacitor has charged, so only a small ripple appears: gain near 0.${
				high
					? ' Swapping the two parts, capacitor in series and resistor to ground, gives a high-pass: the capacitor blocks the slow waves and passes the fast ones. The same formula gives the corner, and the slope now falls toward low frequencies.'
					: ''
			}`
		),
		p(
			`The frequency where the two behaviours meet is the corner, fc, set by the product R times C alone. At fc the output is 3 dB down. ${slope} The figure draws this one section on the Bode axes with the spec's two forbidden zones. R and C move the corner. Nothing moves the slope${verdict}${
				side.prototype
					? ` For a ${bandName(type)} built by transformation the figure and the numbers use the low-pass prototype: its passband edge is the bandwidth B and its stopband edge sits at Ω times B.`
					: band
						? ` For a ${type === 'bandpass' ? 'band-pass' : 'band-stop'} the figure and the numbers use the low-pass side, ${side.a} and ${side.b}.`
						: ''
			}`
		),
		eq(tex, intro),
		widget('rc-on-spec', specProps(side, amaxDb, aminDb, type, ok))
	];
}

/* ----------------------------------------------------------- 4. the order */

/**
 * What choosing a response other than Butterworth does to the count, in one
 * sentence: how the curve differs and what panel 02 reports next to the
 * Butterworth order.
 */
function responseCountLine(resp, nResp, nButter, side) {
	const vs = (n) => (n === null ? 'no order up to its limit' : n === nButter ? `the same ${n} as Butterworth` : `${n} where Butterworth needs ${nButter}`);
	switch (resp) {
		case 'chebyshev':
			return nResp < nButter
				? ` With Chebyshev chosen the curve drops faster past ${side.a} for the same n, so panel 02 reports ${nResp} where Butterworth needs ${nButter}; the next section says what that costs.`
				: ` With Chebyshev chosen the curve drops faster past ${side.a} for the same n, though this spec needs n = ${nButter} either way.`;
		case 'legendre':
			return ` With Legendre chosen the curve still never wobbles but drops faster past ${side.a}, so panel 02 reports ${vs(nResp)}.`;
		case 'bessel':
			return ` With Bessel chosen the curve bends over more gently, to keep the delay flat, so panel 02 reports ${vs(nResp)}.`;
		case 'inverseChebyshev':
			return ` With the inverse Chebyshev chosen the passband stays flat and the stopband ripples between zeros past ${side.b}, so panel 02 reports ${vs(nResp)}.`;
		case 'elliptic':
			return ` With elliptic chosen both bands ripple and zeros sit past ${side.b}, the steepest drop there is, so panel 02 reports ${vs(nResp)}.`;
		default:
			return '';
	}
}

function theOrder({ type, response, side, amaxDb, aminDb, ok, order }) {
	const band = type === 'bandpass' || type === 'bandstop';
	const high = side.kind === 'highpass';
	const resp = RESPONSES[response] ? response : 'butterworth';
	const cheby = resp !== 'butterworth';
	// the gap: fs over fp for a low-pass, fp over fs for a high-pass, always above 1
	const ratio = ok ? (high ? side.fp / side.fs : side.fs / side.fp) : NaN;
	const [lowEdge, highEdge] = high ? [side.b, side.a] : [side.a, side.b];
	const [lowTex, highTex] = high ? [side.texB, side.texA] : [side.texA, side.texB];
	const [lowVal, highVal] = high ? [side.fs, side.fp] : [side.fp, side.fs];
	const blocks = [
		h('Steeper: the order'),
		p(
			'One RC section falls 20 dB per decade. Two in a row multiply their gains, so their slopes add: 40 dB per decade. Three give 60. The count of sections is the order, n, and far past the corner the slope is 20 n dB per decade. The order is the first thing the tool computes, and a rough count is easy.'
		)
	];
	if (!ok) {
		blocks.push(
			p(
				'Take the drop demanded, Amin, and divide it by the drop one slope gives across the gap from fp to fs, then round up. Panel 02 does the same count exactly, with Amax included. The figure draws the whole family of orders against the two zones, and the smallest n that clears both is the minimum panel 02 reports.'
			),
			eq('n \\ge \\dfrac{A_{min}}{20\\log_{10}(f_s/f_p)}', 'The rough count: the drop demanded divided by the drop per slope across the gap:'),
			widget('order-on-spec', { response: resp })
		);
		return blocks;
	}
	const k = 1 / ratio;
	const perSlope = 20 * Math.log10(ratio);
	// three significant figures, so that a narrow gap still divides out as printed (0.828, not 0.8)
	const perText = perSlope.toPrecision(3);
	const gapText = String(Number(ratio.toPrecision(3)));
	const rough = aminDb / perSlope;
	const roughN = Math.max(1, Math.ceil(rough));
	// shown to one decimal, or two when one would round onto a whole number that disagrees with the count
	const roughText = Math.max(1, Math.ceil(Number(rough.toFixed(1)))) === roughN ? rough.toFixed(1) : rough.toFixed(2);
	const nButter = Math.max(1, Math.ceil(butterworthOrder(amaxDb, aminDb, k)));
	// the chosen response's own count (null when a searched response never gets there)
	const nResp = resp === 'butterworth' ? nButter : minimumOrder(resp, amaxDb, aminDb, k).n;
	// with another response chosen, panel 02 counts for it: the Butterworth count is named as such
	let exact;
	if (cheby) {
		exact =
			nButter === roughN
				? `The exact count for a Butterworth response, with Amax included, gives the same ${nButter}.`
				: `The exact count for a Butterworth response, with Amax at ${plain(amaxDb)} dB included, gives ${nButter}: the rough count leaves Amax out.`;
	} else {
		exact =
			nButter === roughN
				? `Panel 02 does the same count exactly, with Amax included; with Amax at ${plain(amaxDb)} dB the two agree.`
				: `Panel 02 does the same count exactly, with Amax included, and with Amax at ${plain(amaxDb)} dB it asks for ${nButter}: the rough count leaves Amax out.`;
	}
	let sideNote = band
		? ` For a ${type === 'bandpass' ? 'band-pass' : 'band-stop'} the count is done once per side and panel 02 reports both orders; the numbers here and the figure follow the low-pass side.`
		: '';
	if (side.prototype) {
		sideNote = ` For a ${bandName(type)} built by transformation the count is done on the prototype, from the Ω of each stopband edge, and panel 02 shows both; the numbers here and the figure use the edges the prototype is designed with, B and ΩB.`;
	}
	blocks.push(
		p(
			`Take the drop demanded, Amin, and divide it by the drop one slope gives across the gap from ${lowEdge} to ${highEdge}. Here ${highEdge} is ${gapText} times ${lowEdge}, one slope loses ${perText} dB across that gap, and ${plain(aminDb)} dB of drop needs ${roughText} slopes, so ${roughN}. ${exact}${sideNote}`
		)
	);
	const chebyLine = responseCountLine(resp, nResp, nButter, side);
	const limitLine = nResp === null || nResp > MAX_ORDER ? ` That is past the tool's limit of ${MAX_ORDER}, so panel 02 asks for a looser spec.` : '';
	blocks.push(
		p(
			`The figure draws the whole family of orders against the two zones, and the smallest n that clears both is the minimum panel 02 reports.${chebyLine}${limitLine}`
		)
	);
	let introEdges = band ? "the page's Amin and the low-pass side's edges" : high ? "the page's Amin, fp and fs; for a high-pass fp is the upper edge" : "the page's Amin, fp and fs";
	if (side.prototype) introEdges = "the prototype's Amin and edges, B and ΩB";
	blocks.push(
		eq(
			`n \\ge \\dfrac{A_{min}}{20\\log_{10}(${highTex}/${lowTex})} = \\dfrac{${plain(aminDb)}}{20\\log_{10}(${plain(highVal)}/${plain(lowVal)})} = \\dfrac{${plain(aminDb)}}{${perText}} = ${roughText} \\;\\Rightarrow\\; n = ${roughN}`,
			`The rough count: the drop demanded divided by the drop per slope across the gap, with ${introEdges}:`
		)
	);
	const n0 = side.design ? side.design.n : !band && isNum(order) ? order : null;
	blocks.push(widget('order-on-spec', { ...specProps(side, amaxDb, aminDb, type, ok), response: resp, ...(isNum(n0) ? { n0 } : {}) }));
	return blocks;
}

/* ---------------------------------------------------- 5. op-amps and Q */

/** What the stage Qs of a response other than Butterworth and Chebyshev I are for, in a sentence or two. */
function responseStory(resp, { high, side }) {
	const beyond = `in the stopband, beyond ${side.b}`;
	switch (resp) {
		case 'legendre':
			return ` Their product never wobbles, like Butterworth's, but it gives up some flatness near ${high ? 'the top of the band' : 'DC'} to drop faster past ${side.a}: the steepest drop a curve can have without ripple. That is what Legendre means.`;
		case 'bessel':
			return ' Their Q values are low on purpose: the product delays every frequency of the passband by nearly the same time, so a pulse or a square wave keeps its shape. That is what Bessel means, and the price is a gentler drop than Butterworth\'s.';
		case 'inverseChebyshev':
			return ` Each of them also carries a pair of zeros, a frequency it blocks completely, placed ${beyond}: the passband stays flat like Butterworth's, and the stopband bounces between those zeros instead of falling steadily. That is the inverse Chebyshev.`;
		case 'elliptic':
			return ` Each of them also carries a pair of zeros, a frequency it blocks completely, placed ${beyond}, and their Q values are high: the passband ripples by at most Amax, the stopband bounces between the zeros, and no other response drops as fast. That is what elliptic means.`;
		default:
			return '';
	}
}

/** What the transformation makes of the prototype's stages, after the prototype's own listing. */
function prototypeTail(type, pairs, real, zeros = false) {
	const kind = type === 'bandpass' ? 'band-pass' : 'notch';
	// a pair that carries zeros becomes notch stages, in a band-pass too
	const pairKind = zeros ? 'notch' : kind;
	const total = 2 * pairs + (real ? 1 : 0);
	if (pairs === 0) return ` The transformation turns that RC stage into the one ${kind} stage of panel 03.`;
	const rc = real ? (pairKind === kind ? ' and the RC stage into one' : ` and the RC stage into one ${kind} stage`) : '';
	return ` The transformation then turns each pair into two ${pairKind} stages${rc}: the ${total} stages of panel 03.`;
}

function opampAndQ({ type, response, side, amaxDb, aminDb, ok }) {
	const band = type === 'bandpass' || type === 'bandstop';
	const high = side.kind === 'highpass';
	const resp = RESPONSES[response] ? response : 'butterworth';
	const cheby = resp === 'chebyshev';
	const blocks = [
		h('Why an op-amp, and what Q is'),
		p(
			'Stacking bare RC sections has two problems. Whatever comes after a section draws current from its capacitor and shifts the corner. And however many are stacked, the knee stays soft: the curve bends over gradually. An op-amp fixes both, and that is what active means. It drives the next section without loading the one before.'
		),
		p(
			'With a little of its output fed back to its input, one op-amp with two resistors and two capacitors makes a second-order stage: two slopes and one new number, Q, the sharpness of the knee. Q = 0.707 is the flattest. A higher Q puts a bump just before the corner, a lower Q a rounded sag.'
		)
	];

	const d = side.design;
	const amaxText = allPos(amaxDb) ? `${plain(amaxDb)} dB` : 'Amax';
	if (!d) {
		blocks.push(
			p(
				`Order 4, for example, is two such stages, each with its own corner, f0, and its own Q; panel 03 lists them once the design is valid. Neither is flat alone. Butterworth picks Q values whose product is flat up to the passband edge and exactly Amax down there. Chebyshev picks higher Q values and keeps the bumps on purpose: they are the ripple, at most Amax high, and they buy the steeper drop.`
			)
		);
	} else {
		const n = d.n;
		const { second, fc } = stageTable(d);
		const lead = side.prototype ? 'In the prototype, order' : band ? 'On the low-pass side, order' : 'Order';
		// the prototype's stages are not the ones panel 03 lists: the transformation comes after
		const listed = side.prototype ? 'with' : 'listed in panel 03 with';
		const qs = second.map((s) => s.q.toFixed(2));
		const f0s = second.map((s) => hzText(s.f0));
		const sameF0 = second.every((s) => Math.abs(s.f0 / second[0].f0 - 1) < 1e-3);
		// f0 is named as the stage's corner the first time it appears
		const f0Text = second.length === 1 ? `its corner f0 = ${f0s[0]}` : sameF0 ? `the same corner f0 = ${f0s[0]}` : `corners f0 = ${listText(f0s)},`;
		const count = second.length === 1 ? 'one such stage' : `${COUNT[second.length] ?? second.length} such stages`;
		const upTo = high ? `down to ${side.a}` : `up to ${side.a}`;
		const beyond = high ? ' below it' : '';
		let text;
		if (n === 1 || second.length === 0) {
			text = `${lead} 1 is a single RC stage${side.prototype ? '' : ', listed in panel 03'}: with one slope there is no knee to sharpen, so no Q.`;
		} else if (resp !== 'butterworth' && resp !== 'chebyshev') {
			const listing = `${lead} ${n} is ${count}${fc ? ' plus one plain RC stage' : ''}, ${listed} ${f0Text} and Q = ${listText(qs)}${fc ? `, the RC stage at ${hzText(fc)}` : ''}.`;
			text = `${listing}${responseStory(resp, { high, side })}`;
		} else if (!cheby) {
			const parts = second.length + (fc ? 1 : 0);
			const listing = `${lead} ${n} is ${count}${fc ? ' plus one plain RC stage for the leftover slope' : ''}, ${listed} ${f0Text} and Q = ${listText(qs)}${fc ? `, the RC stage at ${hzText(fc)}` : ''}.`;
			const alone = parts >= 2 ? ` ${parts === 2 ? 'Neither' : 'None of them'} is flat alone. Their product is flat ${upTo}, ${amaxText} down there, then falls at ${20 * n} dB per decade${beyond}. That flat product is what Butterworth means.` : ` With Q = ${qs[0]} it is already the flattest on its own: flat ${upTo}, ${amaxText} down there, then falling at ${20 * n} dB per decade${beyond}. That flat curve is what Butterworth means.`;
			text = `${listing}${alone} Chebyshev picks higher Q values and keeps the bumps on purpose: they are the ripple, at most Amax high, and they buy the steeper drop.`;
		} else {
			const listing = `${lead} ${n} is ${count}${fc ? ' plus one plain RC stage' : ''}, ${listed} ${f0Text} and Q = ${listText(qs)}${fc ? `, the RC stage at ${hzText(fc)}` : ''}.`;
			const bump =
				second.length === 1
					? ` The bump of the high-Q stage is kept on purpose: it is the ripple, at most Amax high, ${amaxText} here, and it buys the steeper drop.`
					: ` The bumps of the high-Q stages are kept on purpose: they are the ripple, at most Amax high, ${amaxText} here, and they buy the steeper drop.`;
			let versus = ` Butterworth would instead pick Q values whose product is flat ${upTo}.`;
			if (ok) {
				const k = transitionRatio(high ? side.fs : side.fp, high ? side.fp : side.fs);
				const extra = Math.max(1, Math.ceil(butterworthOrder(amaxDb, aminDb, k))) - Math.max(1, Math.ceil(chebyshevOrder(amaxDb, aminDb, k)));
				versus =
					extra > 0
						? ` Butterworth would instead pick Q values whose product is flat ${upTo} and pay with ${extra === 1 ? 'one more order' : `${plural(extra, 'more order')}`}.`
						: ` Butterworth would instead pick Q values whose product is flat ${upTo}, at the same order for this spec.`;
			}
			text = `${listing}${bump}${versus}`;
		}
		if (side.prototype) text += prototypeTail(type, second.length, Boolean(fc), second.some((s) => isNum(s.fz)));
		blocks.push(p(text));
	}

	// the figure: the page's stages, or the default design's with a note
	let props;
	if (d) {
		const { second, fc } = stageTable(d);
		props = {
			kind: side.kind,
			fp: side.fp,
			amaxDb,
			stages: second,
			order: d.n,
			...(isNum(fc) ? { fc } : {}),
			live: true,
			...(band ? { side: side.prototype ? 'prototype' : type } : {})
		};
	} else {
		const fallback = designLowPass(DEFAULT_SPEC);
		props = { kind: 'lowpass', fp: DEFAULT_SPEC.fp, amaxDb: DEFAULT_SPEC.amaxDb, stages: stageTable(fallback).second, order: fallback.n, live: false };
	}
	if (!allPos(props.fp, props.amaxDb)) {
		props = { ...props, fp: DEFAULT_SPEC.fp, amaxDb: DEFAULT_SPEC.amaxDb };
	}
	blocks.push(widget('stages-multiply', props));
	return blocks;
}

/* ------------------------------------------------- 6. stages to parts */

const TOPOLOGY_NAME = { mfb: 'multiple feedback', sallenKey: 'Sallen-Key', towThomas: 'Tow-Thomas', boctor: 'Boctor' };
const TOPOLOGY_LINE = {
	boctor: 'Boctor uses one op-amp for a section with stopband zeros. The high-pass form needs gain above one; accurate resistor ratios set the depth of the notch.',
	mfb: 'Multiple feedback, the default, returns the output through two paths and inverts the signal, harmless in a filter; its f0 and Q depend least on the op-amp being ideal.',
	sallenKey: 'Sallen-Key uses the op-amp as a follower, keeps the signal the right way up and is the easiest to read and tune, but is more sensitive to part tolerances at high Q.',
	towThomas: 'Tow-Thomas spends three op-amps per stage so that f0 and Q are set by separate resistors.'
};
const ROUNDING = {
	E24: 'fixes the capacitors from a short standard series, solves for the resistors, rounds each to the nearest E24 value',
	E96: 'fixes the capacitors from a short standard series, solves for the resistors, rounds each to the nearest E96 value',
	lab: 'fixes the capacitors from the lab kit, solves for the resistors, rounds each to the nearest value in the kit',
	labR: 'fixes the capacitors from a short standard series, solves for the resistors, rounds each to the nearest lab resistor',
	custom: 'fixes the capacitors from the pasted list, solves for the resistors, rounds each to the nearest value in that list'
};

/** Symbolic corner formula for a stage's topology, with the parts it reads, in order. */
const CORNER = {
	mfb: { sym: 'f_0 = \\dfrac{1}{2\\pi\\sqrt{R_2 R_3 C_1 C_2}}', parts: ['R2', 'R3', 'C1', 'C2'] },
	mfbHp: { sym: 'f_0 = \\dfrac{1}{2\\pi\\sqrt{R_1 R_2 C_2 C_3}}', parts: ['R1', 'R2', 'C2', 'C3'] },
	sallenKey: { sym: 'f_0 = \\dfrac{1}{2\\pi\\sqrt{R_1 R_2 C_{\\text{top}} C_{\\text{bottom}}}}', parts: ['R1', 'R2', 'Ctop', 'Cbottom'] },
	sallenKeyHp: { sym: 'f_0 = \\dfrac{1}{2\\pi\\sqrt{R_{\\text{top}} R_{\\text{bottom}} C_1 C_2}}', parts: ['Rtop', 'Rbottom', 'C1', 'C2'] },
	towThomas: { sym: 'f_0 = \\dfrac{1}{2\\pi R C}, \\quad R = R_a = R_b,\\ \\ C = C_1 = C_2', parts: ['Ra', 'C1'], simple: true },
	towThomasHp: { sym: 'f_0 = \\dfrac{1}{2\\pi R C}, \\quad R = R_a = R_b,\\ \\ C = C_1 = C_2', parts: ['Ra', 'C1'], simple: true },
	towThomasNotch: { sym: 'f_0 = \\dfrac{1}{2\\pi R C}, \\quad R = R_a = R_b,\\ \\ C = C_1 = C_2', parts: ['Ra', 'C1'], simple: true },
	towThomasBp: { sym: 'f_0 = \\dfrac{1}{2\\pi R C}, \\quad R = R_a = R_b,\\ \\ C = C_1 = C_2', parts: ['Ra', 'C1'], simple: true },
	firstOrder: { sym: 'f_c = \\dfrac{1}{2\\pi R C}', parts: ['R', 'C'], simple: true },
	firstOrderHp: { sym: 'f_c = \\dfrac{1}{2\\pi R C}', parts: ['R', 'C'], simple: true }
};

const partTex = (name, v) => (/^R/.test(name) ? ohmTex(v) : faradTex(v));

// the multiple-feedback band-pass: R1 and R2 count together, in parallel
const MFB_BP_CORNER = 'f_0 = \\dfrac{1}{2\\pi}\\sqrt{\\dfrac{1/R_1 + 1/R_2}{R_3 C_1 C_2}}';

function stageCorner(stage) {
	if (stage?.topology === 'mfbBp') {
		const c = stage.components;
		if (!c || !['R1', 'R2', 'R3', 'C1', 'C2'].every((name) => allPos(c[name]))) return null;
		const f = Math.sqrt((1 / c.R1 + 1 / c.R2) / (c.R3 * c.C1 * c.C2)) / TWO_PI;
		return {
			f,
			tex: `${MFB_BP_CORNER} = \\dfrac{1}{2\\pi}\\sqrt{\\dfrac{1/${ohmTex(c.R1)} + 1/${ohmTex(c.R2)}}{${ohmTex(c.R3)} \\cdot ${faradTex(c.C1)} \\cdot ${faradTex(c.C2)}}} = ${hzTex(f)}`
		};
	}
	if (stage?.topology === 'boctor' || stage?.topology === 'boctorHp') {
		const f = stage.actual.wn / TWO_PI;
		const formula = stage.topology === 'boctor'
			? String.raw`f_0=\frac1{2\pi\sqrt{R_4R_6C_1C_2}}`
			: String.raw`f_0=\frac1{2\pi}\sqrt{\frac{1/R_1+1/R_6-R_5/(R_3R_4)}{R_2C_1C_2}}`;
		return { f, tex: `${formula} = ${hzTex(f)}` };
	}
	const shape = CORNER[stage?.topology];
	const c = stage?.components;
	if (!shape || !c || !shape.parts.every((name) => allPos(c[name]))) return null;
	const values = shape.parts.map((name) => c[name]);
	const product = values.reduce((a, v) => a * v, 1);
	const f = shape.simple ? 1 / (TWO_PI * product) : 1 / (TWO_PI * Math.sqrt(product));
	const texValues = values.map((v, i) => partTex(shape.parts[i], v)).join(' \\cdot ');
	const numeric = shape.simple ? `\\dfrac{1}{2\\pi \\cdot ${texValues}}` : `\\dfrac{1}{2\\pi\\sqrt{${texValues}}}`;
	const lhs = shape.sym.split(', \\quad')[0];
	const where = shape.sym.includes('\\quad') ? shape.sym.slice(shape.sym.indexOf('\\quad')) : '';
	return { f, tex: `${lhs} = ${numeric} = ${hzTex(f)}${where ? ` \\qquad ${where.replace('\\quad ', '')}` : ''}` };
}

/** How the parts are rounded with two in series allowed: where no single one comes close, for up to pairLimit resistors when a limit is set. */
const pairsRounding = (pairs, pairLimit) =>
	!pairs ? '' : pairLimit ? ` (or, for up to ${pairLimit} of them in the whole filter, to two resistors in series where no single one comes close)` : ' (or to two resistors in series where no single one comes close)';

function stagesToParts({ topology, stock, design, realizedStages, needsTowThomas, pairs = false, pairLimit = null }) {
	const known = TOPOLOGY_LINE[topology] ? topology : 'mfb';
	const others = Object.keys(TOPOLOGY_LINE).filter((t) => t !== known);
	// order 1: every stage is first order, which the Topology menu does not touch
	const onlyFirst = Boolean(design && Array.isArray(design.stages) && design.stages.length > 0 && design.stages.every((s) => s.order === 1));
	let menu = 'The Topology menu sets how they are wired around the op-amp.';
	if (TOPOLOGY_LINE[topology]) {
		menu = onlyFirst
			? `The Topology menu sets how second-order stages are wired around the op-amp, and this page is set to ${TOPOLOGY_NAME[topology]}; with order 1 there is no such stage, so the menu changes nothing yet.`
			: `The Topology menu sets how they are wired around the op-amp, and this page is set to ${TOPOLOGY_NAME[topology]}.`;
	}
	const rounding =
		(ROUNDING[stock] ?? 'fixes the capacitors from the values in stock, solves for the resistors, rounds each to the nearest value in stock') +
		pairsRounding(pairs, pairLimit);
	// zeros take the Tow-Thomas notch form, so the menu has to be on it
	if (needsTowThomas && !['towThomas', 'boctor'].includes(topology)) {
		menu += ' Elliptic and inverse Chebyshev put zeros in the stopband, which need Tow-Thomas or Boctor notch sections, so the page designs nothing until the menu is on Tow-Thomas or Boctor.';
	} else if (needsTowThomas || (Array.isArray(realizedStages) && realizedStages.some((s) => s?.topology === 'towThomasNotch'))) {
		menu += ' With zeros in the response the menu selects Tow-Thomas or Boctor notch sections. Boctor saves op-amps but has realization limits and needs accurate resistor ratios for deep rejection.';
	}

	const stage = Array.isArray(realizedStages) ? realizedStages[0] : null;
	const corner = stageCorner(stage);
	// the parts sentence follows the formula the equation below shows
	const shape = CORNER[stage?.topology] ? stage.topology : known;
	let parts = 'The corner still comes from R times C, as in the one-section formula, only now four parts share the job under a square root.';
	if (/^firstOrder/.test(shape)) parts = 'Stage 1 here is a first-order stage, one resistor and one capacitor, so its corner is the one-section formula as it is.';
	else if (/^towThomas/.test(shape)) parts = 'The corner still comes from R times C, as in the one-section formula. The wiring chosen here uses two equal resistors and two equal capacitors, so the formula keeps its one-section form.';
	// a band type's design has no single n, only its list of stages
	const target = design && Array.isArray(design.stages) && design.stages.length > 0 ? design.stages[0] : null;
	const asked = target ? (target.order === 1 ? (allPos(target.tau) ? 1 / (TWO_PI * target.tau) : NaN) : allPos(target.wn) ? target.wn / TWO_PI : NaN) : NaN;
	let tex;
	let intro;
	if (corner) {
		tex = corner.tex;
		intro = isNum(asked)
			? `Stage 1's corner from its own rounded parts, with the values in panel 04, next to the ${hzText(asked)} it was asked for; the difference is the cost of rounding:`
			: "Stage 1's corner from its own rounded parts, with the values in panel 04:";
	} else {
		const fallback = CORNER[stage?.topology] ?? CORNER[known] ?? CORNER.mfb;
		tex = fallback.sym;
		intro = "A stage's corner from its parts, for the wiring chosen:";
	}

	return [
		h('From stages to parts'),
		p(
			`f0 and Q are what a stage must produce; the resistors and capacitors are how. ${parts} ${menu}`
		),
		p([TOPOLOGY_LINE[known], ...others.map((t) => TOPOLOGY_LINE[t])].join(' ')),
		p(
			`Whatever the wiring, the exact values the formulas want are in no drawer. Panel 04 ${rounding}, then recomputes f0 and Q from the rounded parts and lists the shift in percent.`
		),
		eq(tex, intro)
	];
}

const BAND_LINE = {
	mfb: 'Multiple feedback (Delyiannis-Friend) builds each band-pass stage with one op-amp; its resistor ratios grow with Q squared, so a narrow band, with its high Q, asks a lot of it.',
	towThomas: 'Tow-Thomas spends three op-amps per stage so that f0, Q and the gain are set by separate resistors, which suits the high Q of a narrow band.'
};
const NOTCH_LINE = {
	boctor: TOPOLOGY_LINE.boctor,
	towThomas: 'A Tow-Thomas notch spends three op-amps per stage and builds every notch, the symmetric one on the centre of the band included.'
};

/**
 * From stages to parts for a band type built by transformation: the
 * Band-pass stages menu, and the Notch stages menu for the notch stages
 * (every stage of a band-stop, the pole pairs of a band-pass with zeros).
 */
function transformedStagesToParts({ type, topology, topologyNotch, stock, design, realizedStages, pairs = false, pairLimit = null }) {
	const stop = type === 'bandstop';
	const stages = design && Array.isArray(design.stages) ? design.stages : [];
	const realized = Array.isArray(realizedStages) ? realizedStages.filter(Boolean) : [];
	const hasNotches = stop || stages.some((s) => isNum(s.wz));
	const bandMenu = topology === 'towThomas' ? 'towThomas' : 'mfb';
	const notchMenu = topologyNotch === 'boctor' || topologyNotch === 'towThomas' ? topologyNotch : realized.some((s) => /^boctor/.test(s.topology ?? '')) ? 'boctor' : 'towThomas';
	// a stage Boctor cannot build, the symmetric notch among them, is a Tow-Thomas notch instead
	const fallback = notchMenu === 'boctor' && realized.some((s) => s.topology === 'towThomasNotch');
	const notchText = `${TOPOLOGY_NAME[notchMenu]}${fallback ? ", with a Tow-Thomas notch wherever Boctor cannot build the stage, or where Boctor's own gain would move the passband by more than 1 dB or leave its zero off target" : ''}`;
	let menu;
	if (stop) {
		menu = `In a band-stop built by transformation every stage is a notch, whatever the response, and the Notch stages menu sets how they are wired around the op-amp: this page is set to ${notchText}.`;
	} else {
		menu = `The Band-pass stages menu sets how they are wired around the op-amp, and this page is set to ${TOPOLOGY_NAME[bandMenu]}.`;
		if (hasNotches) menu += ` With zeros in the response the pole pairs become notch stages, which the Notch stages menu builds, set to ${notchText}.`;
	}
	const otherNotch = notchMenu === 'boctor' ? 'towThomas' : 'boctor';
	const lines = stop ? [NOTCH_LINE[notchMenu], NOTCH_LINE[otherNotch]] : [BAND_LINE[bandMenu], BAND_LINE[bandMenu === 'mfb' ? 'towThomas' : 'mfb'], ...(hasNotches ? [NOTCH_LINE[notchMenu]] : [])];
	const rounding =
		(ROUNDING[stock] ?? 'fixes the capacitors from the values in stock, solves for the resistors, rounds each to the nearest value in stock') +
		pairsRounding(pairs, pairLimit);

	const stage = realized[0] ?? null;
	const corner = stageCorner(stage);
	const target = stages[0] ?? null;
	// a band-pass stage peaks at its f0, its centre; a notch stage turns there, its corner
	const word = target && target.filterType !== 'bandpass' ? 'corner' : 'centre';
	let parts = `The ${word} still comes from R times C, as in the one-section formula, only now four parts share the job under a square root.`;
	if (stage?.topology === 'mfbBp') parts = 'The centre still comes from R times C, as in the one-section formula, only now five parts share the job: R1 and R2 count together, in parallel, with R3, C1 and C2 under a square root.';
	else if (/^towThomas/.test(stage?.topology ?? '')) parts = `The ${word} still comes from R times C, as in the one-section formula. The wiring chosen here uses two equal resistors and two equal capacitors, so the formula keeps its one-section form.`;
	const asked = target && allPos(target.wn) ? target.wn / TWO_PI : NaN;
	let tex;
	let intro;
	if (corner) {
		tex = corner.tex;
		intro = isNum(asked)
			? `Stage 1's ${word} from its own rounded parts, with the values in panel 04, next to the ${hzText(asked)} it was asked for; the difference is the cost of rounding:`
			: `Stage 1's ${word} from its own rounded parts, with the values in panel 04:`;
	} else {
		tex = CORNER[stage?.topology]?.sym ?? (stop ? CORNER.towThomasNotch.sym : bandMenu === 'towThomas' ? CORNER.towThomasBp.sym : MFB_BP_CORNER);
		intro = `A stage's ${word} from its parts, for the wiring chosen:`;
	}

	return [
		h('From stages to parts'),
		p(`f0 and Q are what a stage must produce; the resistors and capacitors are how. ${parts} ${menu}`),
		p(lines.join(' ')),
		p(
			`Whatever the wiring, the exact values the formulas want are in no drawer. Panel 04 ${rounding}, then recomputes f0 and Q from the rounded parts and lists the shift in percent.`
		),
		eq(tex, intro)
	];
}

/* ------------------------------------------------ 7. the rest of the page */

function restOfPage({ type, amaxDb, aminDb, bandLimits = null, k, stages, attenuationAtFs, attenuationAtFp, attenuationAtFsl, attenuationAtFsh, attenuationAtFl, attenuationAtFh, transformed = false, design = null }) {
	const band = type === 'bandpass' || type === 'bandstop';
	const high = type === 'highpass';
	// a transformed design has one Amax and the Amin of each stopband edge
	if (transformed && design && validDesign(design) && allPos(design.amaxDb, design.aminDbLow, design.aminDbHigh)) {
		bandLimits = { amaxAtFl: design.amaxDb, amaxAtFh: design.amaxDb, aminAtFsl: design.aminDbLow, aminAtFsh: design.aminDbHigh };
	}
	let kText;
	if (transformed) kText = 'maps each stopband edge onto the prototype, Ω at fsl and fsh, before the count';
	else if (band) kText = 'computes k, the transition ratio, once per side';
	else if (isNum(k)) kText = `shows k = ${high ? 'fs/fp' : 'fp/fs'}, the transition ratio, ${k.toFixed(4)} here`;
	else kText = `shows k = ${high ? 'fs/fp' : 'fp/fs'}, the transition ratio`;
	const everyStage = !isNum(stages) || stages < 1 ? 'every stage' : stages === 1 ? 'the one stage' : stages === 2 ? 'both stages' : `all ${stages} stages`;
	const limitsOk = allPos(amaxDb, aminDb);
	let flags = 'and the flags under it say the same in numbers';
	if (limitsOk && !band && isNum(attenuationAtFs) && isNum(attenuationAtFp)) {
		flags = `and the flags under it say the same in numbers, here ${attenuationAtFs.toFixed(1)} dB at fs against ${plain(aminDb)} required and ${attenuationAtFp.toFixed(2)} dB at fp against ${plain(amaxDb)} allowed`;
	} else if (limitsOk && band && [attenuationAtFsl, attenuationAtFsh, attenuationAtFl, attenuationAtFh].every(isNum)) {
		// each edge against its own side's limit
		const at = bandLimits && allPos(bandLimits.amaxAtFl, bandLimits.amaxAtFh, bandLimits.aminAtFsl, bandLimits.aminAtFsh) ? bandLimits : { amaxAtFl: amaxDb, amaxAtFh: amaxDb, aminAtFsl: aminDb, aminAtFsh: aminDb };
		const aminText = at.aminAtFsl === at.aminAtFsh ? plain(at.aminAtFsl) : `${plain(at.aminAtFsl)} and ${plain(at.aminAtFsh)}`;
		const amaxText = at.amaxAtFl === at.amaxAtFh ? plain(at.amaxAtFl) : `${plain(at.amaxAtFl)} and ${plain(at.amaxAtFh)}`;
		flags = `and the flags under it say the same in numbers, here ${attenuationAtFsl.toFixed(1)} dB at fsl and ${attenuationAtFsh.toFixed(1)} dB at fsh against ${aminText} required, ${attenuationAtFl.toFixed(2)} dB at fl and ${attenuationAtFh.toFixed(2)} dB at fh against ${amaxText} allowed`;
	}
	return [
		h('Reading the rest of the page'),
		p(
			`The page runs top to bottom in the order the design is done. 01 Specification holds the inputs met above: filter type, Amax, Amin, the edges, response, topology. 02 Order applies the exact count and ${kText}; its slider allows a higher order than the minimum, for margin. 03 Stages lists f0 and Q for each stage. 04 Components gives the resistors and capacitors of ${everyStage}, rounded to values in stock, with the shift in f0 and Q that the rounding cost, and draws the circuit.`
		),
		p(
			`05 Bode plot is the report card: the curve is computed from the rounded parts, the amber lines are the ${band ? 'edges and limits' : 'four numbers'} of 01, ${flags}. 06 Download exports the circuit as an LTspice file ready to simulate, and the same calculation as a standalone script. 07 Next steps lists what to check on the bench. Every Show the math block is optional reading.`
		)
	];
}

const GLOSSARY = [
	['passband', 'the frequencies that must get through, losing at most Amax'],
	['stopband', 'the frequencies that must be turned down, by at least Amin'],
	['dB', 'a voltage ratio counted in steps, 20 per factor of ten; 3 dB is about 0.71, 40 dB is 0.01'],
	['decade', 'a factor of ten in frequency, one grid line to the next on the Bode plot'],
	['Bode plot', 'gain in dB against frequency on a log axis; panel 05 draws it from the rounded parts'],
	['corner (fc, f0)', 'the frequency where a section or a stage hands over from passing to blocking; 1/(2piRC) for one RC'],
	['order (n)', 'the number of slopes; far from the corner the curve falls 20 n dB per decade'],
	['stage', 'one op-amp block, second order (two slopes) or first order (one), with its own f0 and Q'],
	['Q', "the sharpness of a stage's knee; 0.707 is flattest, higher bumps, lower sags"],
	['response', 'the recipe the Q values come from: Butterworth flattest, Chebyshev and elliptic steeper with ripple, Legendre steepest without, Bessel best for pulses'],
	['zero (fz)', 'a frequency a stage blocks completely; elliptic and inverse Chebyshev stages each carry a pair'],
	['op-amp', 'the amplifier chip each stage is built around; it is what makes the filter active']
];
// added for a band type built by transformation
const BAND_TERMS = [
	['centre and bandwidth (B)', 'the middle of a band on a log axis, the geometric mean of fl and fh, and its width, B = fh - fl'],
	['prototype', 'the low-pass a band filter is built from by transformation, with its passband edge at B']
];

/** The counts of a narrow band-pass, which takes up to six stages. */
const NARROW_COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * The short line a narrow band-pass gets before its basics, with the
 * page's own numbers when its design is valid.
 */
function narrowTypeLine(design) {
	const ok = Boolean(design) && design.filterType === 'narrowband' && allPos(design.f0, design.q, design.B, design.gain) && isNum(design.n) && design.n >= 1;
	const db = ok ? 20 * Math.log10(design.gain) : NaN;
	const count = ok ? (design.n === 1 ? 'one stage' : `${NARROW_COUNT[design.n] ?? design.n} identical stages`) : '';
	const here = ok
		? ` Here f0 = ${hzText(design.f0)} and Q = ${trim3(design.q)}, so B = ${hzText(design.B)}; K = ${trim3(design.gain)}, ${Math.abs(db) < 0.05 ? '0 dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`}, with ${count}.`
		: '';
	return [
		h('A narrow band-pass'),
		p(
			`This page is set to narrow band-pass: it picks out one frequency, f0, with one second-order band-pass stage or a few identical ones in series. Q = f0/B says how narrow it is, B being the width of the band between the two points 3 dB below the peak, and K is the gain at f0.${here} The steps below introduce it; panels 02 to 07 then build it.`
		)
	];
}

// the words of a narrow band-pass page
const NARROW_TERMS = [
	['dB', 'a voltage ratio counted in steps, 20 per factor of ten; 3 dB is about 0.71, 40 dB is 0.01'],
	['decade', 'a factor of ten in frequency, one grid line to the next on the Bode plot'],
	['Bode plot', 'gain in dB against frequency on a log axis; panel 05 draws it from the rounded parts'],
	['centre (f0)', 'the frequency the filter picks out, where its gain peaks at K'],
	['-3 dB edges (f1, f2)', 'the two frequencies where the gain is 3 dB under its peak, one either side of f0; f1 f2 = f0^2'],
	['bandwidth (B)', 'the width of the band between the edges, B = f2 - f1'],
	['Q', 'the sharpness of the band, f0/B; one stage of a chain has its own, lower Q_s'],
	['gain (K)', 'the gain at f0, in V/V or in dB'],
	['stage', 'one second-order band-pass block with its op-amps; N identical ones in series narrow the band'],
	['op-amp', 'the amplifier chip each stage is built around; it is what makes the filter active'],
	['gain-bandwidth (GBW)', "an op-amp's gain times the frequency where it holds it; 3.45 MHz for a TL082, which moves a narrow band-pass as f0 times Q grows"]
];

/**
 * The basics of a narrow band-pass: its line, then steps of its own. The
 * steps of the four other types speak of passbands, stopbands, Amax, an
 * order and a response, which this type has none of.
 */
function narrowBasics(design) {
	return [
		...narrowTypeLine(design),
		h('What a filter does'),
		p(
			'Any signal is a sum of sine waves at different frequencies. A recorded voice holds low notes and high notes at once. A sensor wire carries a slow reading plus fast noise picked up along the way. A filter is a circuit whose gain, output amplitude divided by input amplitude, depends on frequency: near 1 for the frequencies that should pass, near 0 for the rest.'
		),
		p(
			'A narrow band-pass keeps one tone and turns down everything else: a pilot tone, a carrier, one note out of a mix. Active means the circuit is built around an op-amp, a small amplifier chip, with resistors and capacitors around it instead of coils.'
		),
		h('Decibels and the band'),
		p(
			'Gain ratios run from 1 down to 0.001 and lower, which is awkward on one graph. The page counts them in decibels instead: 20 times the logarithm of the ratio. A ratio of 1 is 0 dB, 0.5 is about 6 dB down, 0.1 is 20 dB down, 0.01 is 40 dB down. Every factor of ten is another 20 dB, so a plot of dB against a log frequency axis turns the curves into near straight lines. That plot is a Bode plot, and panel 05 draws one.'
		),
		p(
			'A band-pass peaks at f0 and falls away on both sides. Its band runs between the two frequencies where it is 3 dB under its peak, about 0.71 of it: f1 below f0 and f2 above. Their difference is the bandwidth B, and Q = f0/B says how narrow the band is: at Q = 5 the band is a fifth of f0 wide. On a log axis the two edges sit symmetric about f0.'
		),
		eq('Q = \\dfrac{f_0}{B}, \\qquad B = f_2 - f_1, \\qquad f_1 f_2 = f_0^2', 'The width of the band and its sharpness:'),
		h('One stage'),
		p(
			'One second-order stage, an op-amp or a few with resistors and capacitors, makes the peak: a gain of K at f0, falling 20 dB per decade on each side far from it. Its Q sets the width. The higher the Q, the narrower the band, and the more a part a little off moves f0 and Q: a stage Q of 5 to 10 builds reliably.'
		),
		eq('H(s) = K\\,\\dfrac{\\frac{\\omega_0}{Q}\\,s}{s^2 + \\frac{\\omega_0}{Q}\\,s + \\omega_0^2}, \\qquad \\omega_0 = 2\\pi f_0', 'One stage in the standard band-pass form, exactly K at f0:'),
		h('Several stages'),
		p(
			"N identical stages in series multiply their responses: far from f0 the chain falls N times faster, 20 N dB per decade, and its band is narrower than one stage's. So for the same overall Q each stage gets a lower Q, easier to hold with real parts, for N times the op-amps. Panel 02 works it out."
		),
		h('From stages to parts'),
		p(
			"Six circuits can build a stage: an RLC with its inductor made of op-amps (a gyrator, or Antoniou's GIC), the Sallen-Key, the multiple feedback, the state-variable and the Tow-Thomas band-pass. Panel 04 builds the spec on all six from the parts in stock, measures each one with ideal op-amps and on a TL082, and picks one by a rule it states; the Circuit menu in panel 01 picks another."
		),
		h('Reading the rest of the page'),
		p(
			'01 Specification holds f0, Q or B, K and N. 02 Stages gives the Q and the gain of each stage. 03 Transfer function writes H(s) with its numbers. 04 Components compares the six circuits and builds the one chosen, its parts rounded to values in stock, with what the rounding costs. 05 Bode plot is the report card: the curve from the rounded parts with f0, f1, f2 and the gain marked, and the figures on a TL082 under it. 06 Download exports the circuit as an LTspice file and the same calculation as a standalone script. 07 Next steps lists what to check on the bench. Every Show the math block is optional reading.'
		),
		h('Words used on this page'),
		terms(NARROW_TERMS)
	];
}

export function filterBasics({
	filterType,
	response,
	topology,
	order,
	stages,
	fp,
	fs,
	amaxDb,
	aminDb,
	bandLimits = null,
	fl,
	fh,
	fsl,
	fsh,
	lpFp,
	lpFs,
	k,
	design,
	realizedStages,
	bandStopBranches,
	combineSigns,
	attenuationAtFs,
	attenuationAtFp,
	attenuationAtFsl,
	attenuationAtFsh,
	attenuationAtFl,
	attenuationAtFh,
	stock,
	needsTowThomas,
	pairs = false,
	pairLimit = null,
	method,
	topologyNotch
} = {}) {
	const type = TYPES.includes(filterType) ? filterType : 'lowpass';
	// a narrow band-pass: its own line and steps
	if (type === 'narrowband') return narrowBasics(design);
	const transformed = (type === 'bandpass' || type === 'bandstop') && (method === 'transformed' || design?.method === 'transformed');
	const side = sideOf({ type, fp, fs, fl, fh, fsl, fsh, lpFp, lpFs, design, transformed });
	// the prototype's own limits: Amax, and the Amin it is designed with (a fitted floor kept to two decimals, rounded down)
	const limits = side.prototype && side.design ? { amaxDb: side.design.amaxDb, aminDb: Math.floor(side.design.aminDb * 100 + 1e-9) / 100 } : { amaxDb, aminDb };
	const ok = specOk(side, limits.amaxDb, limits.aminDb);
	return [
		...whatAFilterDoes({ type, fp, fs, fl, fh, fsl, fsh, realizedStages, bandStopBranches, combineSigns, transformed }),
		...decibels({ type, amaxDb, aminDb, bandLimits, transformed, design }),
		...oneRc({ type, side, ...limits, ok }),
		...theOrder({ type, response, side, ...limits, ok, order }),
		...opampAndQ({ type, response, side, ...limits, ok }),
		...(transformed
			? transformedStagesToParts({ type, topology, topologyNotch, stock, design, realizedStages, pairs, pairLimit })
			: stagesToParts({ topology, stock, design, realizedStages, needsTowThomas, pairs, pairLimit })),
		...restOfPage({ type, amaxDb, aminDb, bandLimits, k, stages, attenuationAtFs, attenuationAtFp, attenuationAtFsl, attenuationAtFsh, attenuationAtFl, attenuationAtFh, transformed, design }),
		h('Words used on this page'),
		terms(transformed ? [...GLOSSARY, ...BAND_TERMS] : GLOSSARY)
	];
}
