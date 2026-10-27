import { anyPairAllowed, capacitorCandidates, pairAllowed, ratioPair, smallCapPenalty, stockBetween, stockResistor } from './eseries';

/**
 * State-variable (KHN) band-pass, three op-amps:
 *
 *   A1  inverting integrator, R1 in from A3's output, C1 as feedback;
 *       its output is the band-pass output (the stage output)
 *   A2  inverting integrator, R2 in from A1's output, C2 as feedback;
 *       its output is the low-pass
 *   A3  the summer: its - input takes R3 from the input, R4 from A2's
 *       output and R7 from its own output; its + input takes R5 from the
 *       band-pass output and R6 to ground. Its output is the high-pass.
 *
 * With beta = R6/(R5 + R6) on the + input, KCL at the - input and the two
 * integrators give
 *   V_bp/V_in = (R2 R4 C2 / R3) s / ((R1 R2 R4 C1 C2 / R7) s^2 + R2 C2 (1 + R4/R3 + R4/R7) s / (1 + R5/R6) + 1)
 *   omega0  = sqrt(R7 / (R1 R2 R4 C1 C2))
 *   Q       = (1 + R5/R6) / (1 + R4/R3 + R4/R7) sqrt(R1 R4 C1 / (R2 R7 C2))
 *   K       = (R4/R3) (1 + R5/R6) / (1 + R4/R3 + R4/R7)    (the gain at omega0)
 * The design here: C1 = C2 = C, R1 = R2 = R, R4 = R7 = R0, so
 *   omega0 = 1 / (R C),   Q = (1 + R5/R6) / (2 + R0/R3),   K = (R0/R3) Q,
 * hence R3 = Q R0 / K and R5/R6 = 2Q + K - 1: R sets f0, R3 the gain and
 * R5/R6 the Q, and no ratio grows past 2Q.
 *
 * Rounding, each part against the ones before it: R1 and R2 as the
 * stocked pair whose product is closest to 1/(omega0 C)^2 (it sets f0),
 * then R3/R0 (R0 = R4 = R7) the stocked pair closest to the ratio that
 * sets the gain, then R5/R6 the stocked pair closest to the ratio that
 * puts Q on target (ratioPair both).
 */

const KHN_R_MIN = 200;
const KHN_R_MAX = 2_000_000;
const KHN_R_SWEET = 10_000;
/** R4 = R7: any equal value works, this matches the other stages' scale. */
export const KHN_R0 = 10_000;

const khnF0Weight = (q) => Math.max(1, 2 * q);
/** R1 is tried within this factor of R either way, for the product R1 R2 that sets f0. */
const KHN_R1_SPAN = 1.25;

/** What a set of parts gives: f0, Q and the gain at f0 (positive). */
export function khnBpActual({ R1, R2, R3, R4, R5, R6, R7, C1, C2 }) {
	const p = 1 + R5 / R6;
	const D = 1 + R4 / R3 + R4 / R7;
	return { wn: Math.sqrt(R7 / (R1 * R2 * R4 * C1 * C2)), q: (p / D) * Math.sqrt((R1 * R4 * C1) / (R2 * R7 * C2)), gain: ((R4 / R3) * p) / D };
}

/** H(j 2 pi f) of a stage, as { re, im }: gain (omega0/Q) s / (s^2 + (omega0/Q) s + omega0^2). */
export function khnBpResponse(components, f) {
	const { wn, q, gain } = khnBpActual(components);
	const w = 2 * Math.PI * f;
	const a = wn / q;
	const den = { re: wn * wn - w * w, im: a * w };
	const d = den.re * den.re + den.im * den.im;
	const n = gain * a * w;
	return { re: (n * den.im) / d, im: (n * den.re) / d };
}

/**
 * The stage on capacitor C (C1 = C2 = C). f0 rests on the product R1 R2,
 * so R1 is tried at each stocked value within KHN_R1_SPAN of R and R2
 * rounded against it, the closest product kept; then R4 = R7, R3 for the
 * gain, and R5/R6 the stocked pair for the exact Q. Null when no stocked
 * pair gives R5/R6.
 */
function khnRealize(wn, q, C, gain, resistorSeries, pairs) {
	const R = 1 / (wn * C);
	const product = 1 / (wn * wn * C * C);
	const R1s = stockBetween(R / KHN_R1_SPAN, R * KHN_R1_SPAN, resistorSeries);
	if (!R1s.length) R1s.push(stockResistor(R, resistorSeries));
	let best = null;
	for (const R1 of R1s) {
		const R2 = stockResistor(product / R1, resistorSeries, pairAllowed(pairs, 'R2'));
		// a tie, or nearly one, goes to R1 and R2 near equal
		const miss = Math.abs(Math.log((R1 * R2) / product)) + 0.001 * Math.abs(Math.log(R1 / R2));
		if (best === null || miss < best.miss) best = { R1, R2, miss };
	}
	const { R1, R2 } = best;
	// with R1 and R2 unequal the gain also carries sqrt(R2/R1): K = Q (R0/R3) sqrt(R2/R1).
	// Only the ratio R3/R0 counts, so it is the stocked pair closest to it (ratioPair),
	// R0 near KHN_R0; past what a pair reaches, R0 = KHN_R0 and R3 rounded alone
	const ratio = (q * Math.sqrt(R2 / R1)) / gain;
	const gainPair = ratioPair(ratio, resistorSeries, { pairs, other: 'R3', min: KHN_R_MIN, max: KHN_R_MAX, near: KHN_R0 });
	const R0 = gainPair ? gainPair.base : stockResistor(KHN_R0, resistorSeries, pairAllowed(pairs, 'R4'));
	const R3Target = ratio * R0;
	const R3 = gainPair ? gainPair.other : stockResistor(R3Target, resistorSeries, pairAllowed(pairs, 'R3'));
	const D = 1 + R0 / R3 + 1;
	const pTarget = (q * D) / Math.sqrt(R1 / R2);
	const pair = ratioPair(pTarget - 1, resistorSeries, { pairs, other: 'R5' });
	if (!pair) return null;
	const parts = { R1, R2, R3, R4: R0, R5: pair.other, R6: pair.base, R7: R0, C1: C, C2: C };
	const theoretical = { R1: R, R2: R, R3: (q * R0) / gain, R4: R0, R5: (2 * q + gain - 1) * pair.base, R6: pair.base, R7: R0, C1: C, C2: C };
	return { parts, theoretical, steps: { C, R, R0, R2Target: product / R1, R3Target, ratioIdeal: 2 * q + gain - 1, ratioTarget: pTarget - 1, gainTarget: gain, resistorSeries } };
}

function khnMiss(actual, wn, q, gain) {
	return Math.max(khnF0Weight(q) * Math.abs(Math.log(actual.wn / wn)), Math.abs(Math.log(actual.q / q)), Math.abs(Math.log(actual.gain / gain)));
}

function khnScore(wn, q, gain, r) {
	const p = r.parts;
	const miss = khnMiss(khnBpActual(p), wn, q, gain);
	const inRange = [p.R1, p.R2, p.R3, p.R5].every((v) => v > KHN_R_MIN && v < KHN_R_MAX);
	return 1000 * miss * miss + Math.log(p.R1 / KHN_R_SWEET) ** 2 + 0.125 * Math.log(p.R3 / KHN_R_SWEET) ** 2 + smallCapPenalty(p.C1) + (inRange ? 0 : 1000);
}

function khnResult(wn, q, r, manual = false) {
	const p = r.parts;
	const outOfRange = ![p.R1, p.R2, p.R3, p.R5].every((v) => v > KHN_R_MIN && v < KHN_R_MAX);
	return {
		topology: 'khnBp',
		order: 2,
		theoretical: r.theoretical,
		components: p,
		actual: khnBpActual(p),
		steps: { ...r.steps, wn, q },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
}

/**
 * A narrow band-pass stage on the state-variable circuit, from the
 * automatic capacitor search: R near 10 kilo-ohm, scored on what the
 * rounded parts give. `gain` is the gain at f0 (its size): R3 alone sets
 * it. Null when no capacitor keeps R, R3 and R5 in range.
 */
export function designKhnBandPass(wn, q, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size].every((v) => Number.isFinite(v) && v > 0)) return null;
	const search = (p) => {
		let best = null;
		for (const C of capacitorCandidates(capacitors)) {
			const R = 1 / (wn * C);
			if (!(R > KHN_R_MIN && R < KHN_R_MAX)) continue;
			const r = khnRealize(wn, q, C, size, resistorSeries, p);
			if (!r) continue;
			const score = khnScore(wn, q, size, r);
			if (best === null || score < best.score) best = { r, score };
		}
		return best;
	};
	const single = search(false);
	const paired = anyPairAllowed(pairs) ? search(pairs) : null;
	const pick = paired && (!single || paired.score <= single.score) ? paired : single;
	return pick ? khnResult(wn, q, pick.r) : null;
}

/** The same stage from a capacitor chosen by hand (C1 = C2 = C). { ok: false } when no pair gives R5/R6 or a figure is not a positive number. */
export function designKhnBandPassFromCap(wn, q, C, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size, C].every((v) => Number.isFinite(v) && v > 0)) return { ok: false };
	const single = khnRealize(wn, q, C, size, resistorSeries, false);
	const paired = anyPairAllowed(pairs) ? khnRealize(wn, q, C, size, resistorSeries, pairs) : null;
	const r = paired && (!single || khnScore(wn, q, size, paired) <= khnScore(wn, q, size, single)) ? paired : single;
	if (!r) return { ok: false };
	return khnResult(wn, q, r, true);
}
