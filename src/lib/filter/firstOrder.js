import { capacitorCandidates, nearestCapacitor, pairAllowed, pairedResistor, smallCapPenalty, stockNeighbours } from './eseries';

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
 * roundMfb (mfb.js); with tau set by R alone, a pair is always kept. A
 * list of names in `pairs` (pairAllowed in eseries.js) takes 'R'.
 */
function roundFirstOrder(Rtarget, C, tau, resistorSeries, pairs) {
	const single = pairedResistor(Rtarget, resistorSeries, false);
	if (!pairAllowed(pairs, 'R')) return single;
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
		const score = Math.log(Rtarget / FO_R_SWEET) ** 2 + smallCapPenalty(C);
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

/* ------------------------------------------------- candidates for a joint search */

/**
 * Every way the stock builds this stage, each judged on its rounded parts
 * (partSearch.js): every capacitor C (the one typed by hand, `caps.C`, when
 * there is one) and R rounded to the stocked values just below and above
 * tau / C (stockNeighbours: two in series too where `pairs` lets them), R
 * in [rMin, rMax). Returns light records { miss, tau, pairs, small, level,
 * parts }, parts = { C, Rtarget, R }, unsorted; firstOrderFromParts builds
 * one. `rs`, the resistance of the source driving a low-pass stage, adds to
 * R: tau is (R + rs) C, and R is rounded around Rtarget - rs too.
 */
export function firstOrderCandidates(tau, { resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = FO_R_MIN, rMax = FO_R_MAX, rs = 0 } = {}) {
	const pairR = pairAllowed(pairs, 'R');
	const out = [];
	for (const C of caps?.C > 0 ? [caps.C] : capacitorCandidates(capacitors)) {
		const Rtarget = tau / C;
		if (Rtarget < rMin / 2 || Rtarget > rMax * 2) continue;
		const small = smallCapPenalty(C) > 0;
		let rList = stockNeighbours(Rtarget, resistorSeries, pairR);
		if (rs > 0) {
			const seen = new Set(rList.map((r) => r.value));
			rList = [...rList, ...stockNeighbours(Rtarget - rs, resistorSeries, pairR).filter((r) => !seen.has(r.value) && seen.add(r.value))];
		}
		for (const r of rList) {
			if (!(r.value >= rMin * (1 - 1e-9) && r.value < rMax)) continue;
			const tauA = (r.value + rs) * C;
			out.push({ miss: Math.abs(Math.log(tauA / tau)), tau: tauA, pairs: r.pair ? 1 : 0, small, level: Math.log(r.value / FO_R_SWEET) ** 2, parts: { C, Rtarget, R: r.value } });
		}
	}
	return out;
}

/** The stage a record of firstOrderCandidates stands for, in the shape designFirstOrderLowPass returns (with ok, manual and outOfRange for a capacitor typed by hand). */
export function firstOrderFromParts(tau, parts, { resistorSeries = 'E24', manual = false } = {}) {
	const { C, Rtarget, R } = parts;
	return {
		topology: 'firstOrder',
		order: 1,
		theoretical: { R: Rtarget, C },
		components: { R, C },
		actual: { tau: R * C },
		steps: { tau, C, Rtarget, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange: !(Rtarget > FO_R_MIN && Rtarget < FO_R_MAX) } : {})
	};
}
