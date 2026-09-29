import { capacitorCandidates, nearestCapacitor, pairedResistor } from './eseries';

/**
 * First-order low-pass stage: H(s) = 1 / (RCs + 1), used for the leftover
 * real pole of an odd-order filter, tau = RC.
 */

const FO_R_MIN = 200;
const FO_R_MAX = 2_000_000;
const FO_R_SWEET = 10_000;

/**
 * R rounded to stock. With `pairs` it may be two resistors in series, kept
 * only when that leaves tau no further off than a single part, as in
 * roundMfb (mfb.js); with tau set by R alone, a pair is always kept.
 */
function roundFirstOrder(Rtarget, C, tau, resistorSeries, pairs) {
	const single = pairedResistor(Rtarget, resistorSeries, false);
	if (!pairs) return single;
	const paired = pairedResistor(Rtarget, resistorSeries, true);
	const miss = (R) => Math.abs(Math.log((R * C) / tau));
	return miss(paired) <= miss(single) ? paired : single;
}

export function designFirstOrderLowPass(tau, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const C of caps) {
		const Rtarget = tau / C;
		if (!(Rtarget > FO_R_MIN && Rtarget < FO_R_MAX)) continue;
		const score = Math.log(Rtarget / FO_R_SWEET) ** 2;
		if (best === null || score < best.score) best = { C, Rtarget, score };
	}
	// Every candidate landed outside the sweet range (very short or very long
	// tau): fall back to whichever capacitor gets closest to it.
	if (!best) {
		for (const C of caps) {
			const Rtarget = tau / C;
			const score = Math.abs(Math.log(Rtarget / FO_R_SWEET));
			if (best === null || score < best.score) best = { C, Rtarget, score };
		}
	}

	const R = roundFirstOrder(best.Rtarget, best.C, tau, resistorSeries, pairs);
	return {
		topology: 'firstOrder',
		order: 1,
		theoretical: { R: best.Rtarget, C: best.C },
		components: { R, C: best.C },
		actual: { tau: R * best.C },
		steps: { tau, C: best.C, Rtarget: best.Rtarget, resistorSeries }
	};
}

/**
 * Solves for R from a capacitor chosen by hand (e.g. to match what is
 * actually in stock) instead of searching a preferred series for it.
 */
export function designFirstOrderLowPassFromCap(tau, C, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const Rtarget = tau / C;
	const R = roundFirstOrder(Rtarget, C, tau, resistorSeries, pairs);
	const outOfRange = !(Rtarget > FO_R_MIN && Rtarget < FO_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'firstOrder',
		order: 1,
		theoretical: { R: Rtarget, C },
		components: { R, C },
		actual: { tau: R * C },
		steps: { tau, C, Rtarget, resistorSeries },
		outOfRange
	};
}
