import { capacitorCandidates, nearestInSeries, SERIES } from './eseries';

/**
 * Multiple-feedback (MFB) low-pass, the standard (Rauch) layout: R1 from
 * the input to the summing node S, C1 from S to ground, R2 from S to the
 * inverting input, R3 from the output back to S, C2 from the inverting
 * input to the output. (KCL at S and at the virtual-ground inverting input
 * gives the a, b, c below; see explainMfb in explain.js for the two
 * equations written out.)
 *
 *   H(s) = c / (s^2 + a*s + b)
 *   a = (1/C1) * (1/R1 + 1/R2 + 1/R3)
 *   b = 1 / (R2*R3*C1*C2)
 *   c = -1 / (R1*R2*C1*C2)
 *
 * Choosing R1 = R3 gives a DC gain of exactly -1 (H(0) = c/b = -R3/R1) and
 * leaves two unknowns (R1 = R3, R2) for two equations:
 *   2x + y  = a*C1        with x = 1/R1 = 1/R3, y = 1/R2
 *   x*y     = b*C1*C2
 * => 2x^2 - (a*C1)*x + b*C1*C2 = 0, real only if C1/C2 >= 8*Q^2.
 */

const MFB_R_MIN = 200; // ohms, below this the op-amp output is loaded too hard
const MFB_R_MAX = 2_000_000; // ohms, above this noise and leakage start to matter
const MFB_R_SWEET = 10_000; // ohms, center of the range this search prefers

function solveRoots(a, b, C1, C2) {
	const disc = (a * C1) ** 2 - 8 * b * C1 * C2;
	if (disc < 0) return null;
	const sqrtDisc = Math.sqrt(disc);
	return [+1, -1].map((sign) => {
		const x = (a * C1 + sign * sqrtDisc) / 4;
		const y = a * C1 - 2 * x;
		return { R1: 1 / x, R2: 1 / y };
	});
}

function sweetSpotScore(R1, R2) {
	return Math.log(R1 / MFB_R_SWEET) ** 2 + Math.log(R2 / MFB_R_SWEET) ** 2;
}

function scoreResistors(R1, R2) {
	if (!(R1 > MFB_R_MIN && R1 < MFB_R_MAX && R2 > MFB_R_MIN && R2 < MFB_R_MAX)) return Infinity;
	return sweetSpotScore(R1, R2);
}

/**
 * Searches a preferred capacitor series for a realizable, well-scaled pair
 * (C1, C2), then rounds the resulting resistors to a preferred series and
 * reports the actual wn/Q/gain the rounded values give.
 */
export function designMfbLowPass(wn, q, { resistorSeries = 'E24' } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const caps = capacitorCandidates();

	let best = null;
	for (const C1 of caps) {
		for (const C2 of caps) {
			if (C2 > C1) continue; // C1/C2 >= 8Q^2 needs C1 the larger one
			if (C1 / C2 < 8 * q * q * 1.02) continue; // small margin off the singular case
			const roots = solveRoots(a, b, C1, C2);
			if (!roots) continue;
			for (const { R1, R2 } of roots) {
				const score = scoreResistors(R1, R2);
				if (best === null || score < best.score) best = { C1, C2, R1, R2, score };
			}
		}
	}
	if (!best) return null;

	const series = SERIES[resistorSeries];
	const R1n = nearestInSeries(best.R1, series);
	const R2n = nearestInSeries(best.R2, series);
	const aActual = (1 / best.C1) * (2 / R1n + 1 / R2n);
	const bActual = 1 / (R1n * R2n * best.C1 * best.C2);
	const discriminant = (a * best.C1) ** 2 - 8 * b * best.C1 * best.C2;

	return {
		topology: 'mfb',
		order: 2,
		theoretical: { R1: best.R1, R2: best.R2, R3: best.R1, C1: best.C1, C2: best.C2 },
		components: { R1: R1n, R2: R2n, R3: R1n, C1: best.C1, C2: best.C2 },
		actual: { wn: Math.sqrt(bActual), q: Math.sqrt(bActual) / aActual, gain: -1 },
		steps: { a, b, C1: best.C1, C2: best.C2, discriminant, x: 1 / best.R1, resistorSeries }
	};
}

/**
 * Solves for R1/R2/R3 from a C1/C2 pair chosen by hand (e.g. to match what
 * is actually in stock), instead of searching a preferred series for them.
 * Returns { ok: false, discriminant, neededRatio } when the pair cannot
 * realize this Q at all (C1/C2 < 8*Q^2, the same singularity the automatic
 * search avoids by construction).
 */
export function designMfbLowPassFromCaps(wn, q, C1, C2, { resistorSeries = 'E24' } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const discriminant = (a * C1) ** 2 - 8 * b * C1 * C2;
	if (discriminant < 0) {
		return { ok: false, discriminant, neededRatio: 8 * q * q, actualRatio: C1 / C2 };
	}

	const roots = solveRoots(a, b, C1, C2).filter(({ R1, R2 }) => R1 > 0 && R2 > 0);
	if (roots.length === 0) {
		return { ok: false, discriminant, neededRatio: 8 * q * q, actualRatio: C1 / C2 };
	}

	let best = null;
	for (const { R1, R2 } of roots) {
		const score = sweetSpotScore(R1, R2);
		if (best === null || score < best.score) best = { R1, R2, score };
	}

	const series = SERIES[resistorSeries];
	const R1n = nearestInSeries(best.R1, series);
	const R2n = nearestInSeries(best.R2, series);
	const aActual = (1 / C1) * (2 / R1n + 1 / R2n);
	const bActual = 1 / (R1n * R2n * C1 * C2);
	const outOfRange = !(R1n > MFB_R_MIN && R1n < MFB_R_MAX && R2n > MFB_R_MIN && R2n < MFB_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'mfb',
		order: 2,
		theoretical: { R1: best.R1, R2: best.R2, R3: best.R1, C1, C2 },
		components: { R1: R1n, R2: R2n, R3: R1n, C1, C2 },
		actual: { wn: Math.sqrt(bActual), q: Math.sqrt(bActual) / aActual, gain: -1 },
		steps: { a, b, C1, C2, discriminant, x: 1 / best.R1, resistorSeries },
		outOfRange
	};
}
