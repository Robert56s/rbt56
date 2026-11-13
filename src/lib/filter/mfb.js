import { anyPairAllowed, capacitorCandidates, nearestCapacitor, pairAllowed, pairedResistor, smallCapPenalty, stockNeighbours } from './eseries';

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
 * R1 (= R3) and R2 rounded to stock, and the f0 and Q they give. With
 * `pairs` and a list of values each may be two resistors in series
 * (pairedResistor in eseries.js), but the stage keeps its pairs only when
 * they leave it no further from its targets than single parts would: the
 * larger of its f0 and Q misses, as logs, decides. Each resistor is paired
 * on its own miss, and in Q the misses of R1 and R2 can partly cancel, so
 * pairing one of them alone could otherwise move the stage further off.
 * `pairs` may also be a list of the names allowed to pair (pairAllowed in
 * eseries.js): 'R1' (R1 and R3, one value) and 'R2'.
 */
function roundMfb(R1, R2, C1, C2, wn, q, resistorSeries, pairs) {
	const round = (p) => {
		const R1n = pairedResistor(R1, resistorSeries, pairAllowed(p, 'R1'));
		const R2n = pairedResistor(R2, resistorSeries, pairAllowed(p, 'R2'));
		const aActual = (1 / C1) * (2 / R1n + 1 / R2n);
		const bActual = 1 / (R1n * R2n * C1 * C2);
		return { R1n, R2n, wn: Math.sqrt(bActual), q: Math.sqrt(bActual) / aActual };
	};
	const single = round(false);
	if (!anyPairAllowed(pairs)) return single;
	const paired = round(pairs);
	const miss = (r) => Math.max(Math.abs(Math.log(r.wn / wn)), Math.abs(Math.log(r.q / q)));
	return miss(paired) <= miss(single) ? paired : single;
}

/**
 * Searches a preferred capacitor series for a realizable, well-scaled pair
 * (C1, C2), then rounds the resulting resistors to a preferred series and
 * reports the actual wn/Q/gain the rounded values give (two in series
 * allowed with `pairs`, see roundMfb).
 */
export function designMfbLowPass(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const C1 of caps) {
		for (const C2 of caps) {
			if (C2 > C1) continue; // C1/C2 >= 8Q^2 needs C1 the larger one
			if (C1 / C2 < 8 * q * q * 1.02) continue; // small margin off the singular case
			const roots = solveRoots(a, b, C1, C2);
			if (!roots) continue;
			for (const { R1, R2 } of roots) {
				const score = scoreResistors(R1, R2) + smallCapPenalty(C1, C2);
				if (best === null || score < best.score) best = { C1, C2, R1, R2, score };
			}
		}
	}
	if (!best) return null;

	const r = roundMfb(best.R1, best.R2, best.C1, best.C2, wn, q, resistorSeries, pairs);
	const discriminant = (a * best.C1) ** 2 - 8 * b * best.C1 * best.C2;

	return {
		topology: 'mfb',
		order: 2,
		theoretical: { R1: best.R1, R2: best.R2, R3: best.R1, C1: best.C1, C2: best.C2 },
		components: { R1: r.R1n, R2: r.R2n, R3: r.R1n, C1: best.C1, C2: best.C2 },
		actual: { wn: r.wn, q: r.q, gain: -1 },
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
export function designMfbLowPassFromCaps(wn, q, C1, C2, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
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

	// the root is chosen after rounding: a root whose stocked resistors stay
	// in range first, then the one that lands the stage closest to its f0
	// and Q, then (a tie) the one nearer 10 kohm
	let best = null;
	for (const { R1, R2 } of roots) {
		const r = roundMfb(R1, R2, C1, C2, wn, q, resistorSeries, pairs);
		const out = scoreResistors(r.R1n, r.R2n) === Infinity;
		const miss = Math.max(Math.abs(Math.log(r.wn / wn)), Math.abs(Math.log(r.q / q)));
		const score = sweetSpotScore(R1, R2);
		const better = best === null || (out !== best.out ? !out : miss < best.miss - 1e-12 || (Math.abs(miss - best.miss) <= 1e-12 && score < best.score));
		if (better) best = { R1, R2, r, out, miss, score };
	}

	const r = best.r;
	const outOfRange = !(r.R1n > MFB_R_MIN && r.R1n < MFB_R_MAX && r.R2n > MFB_R_MIN && r.R2n < MFB_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'mfb',
		order: 2,
		theoretical: { R1: best.R1, R2: best.R2, R3: best.R1, C1, C2 },
		components: { R1: r.R1n, R2: r.R2n, R3: r.R1n, C1, C2 },
		actual: { wn: r.wn, q: r.q, gain: -1 },
		steps: { a, b, C1, C2, discriminant, x: 1 / best.R1, resistorSeries },
		outOfRange
	};
}

/* ------------------------------------------------- candidates for a joint search */

/**
 * Every way the stock builds this stage, each judged on its rounded parts,
 * for a search over the whole filter (partSearch.js): every capacitor pair
 * with C2 <= C1 (both from `caps` when typed by hand, one of them when only
 * one is), both roots, and R1 (= R3) and R2 each rounded to the stocked
 * values just below and just above (stockNeighbours: two in series too where
 * `pairs` lets them), around the ideal root and around the R2 that keeps f0
 * exact on the rounded R1. A pair a little under the 8 Q^2 bar (down to
 * 4 Q^2) takes the double root, for a Q somewhat short. Every resistor stays
 * in [rMin, rMax).
 * Returns light records { miss, wn, q, pairs, small, level, parts }, parts
 * = { C1, C2, R1, R2, R1n, R2n, root } (R1, R2 the ideal root, root +1 or
 * -1, or 0 for the double root), unsorted; mfbLowPassFromParts builds one.
 * miss is the larger log miss of f0 and Q, pairs the resistors that are
 * two in series (R1 counts with R3), level how far they sit from 10 kohm.
 * `rs`, the resistance of the source driving the stage, adds to R1 (not to
 * R3, the same value): the misses are of R1 + rs, and R1 is rounded around
 * its ideal value less rs / 2 too (2 / R1 becomes about 1 / (R1 + rs / 2)).
 */
export function mfbLowPassCandidates(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = MFB_R_MIN, rMax = MFB_R_MAX, rs = 0 } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const all = capacitorCandidates(capacitors);
	const list1 = caps?.C1 > 0 ? [caps.C1] : all;
	const list2 = caps?.C2 > 0 ? [caps.C2] : all;
	const inRange = (r) => r.value >= rMin * (1 - 1e-9) && r.value < rMax;
	const pairR1 = pairAllowed(pairs, 'R1');
	const pairR2 = pairAllowed(pairs, 'R2');
	const out = [];
	for (const C1 of list1) {
		for (const C2 of list2) {
			if (C2 > C1 && !(caps?.C1 > 0 && caps?.C2 > 0)) continue;
			const ratio = C1 / C2;
			if (ratio < 4 * q * q) continue;
			const disc = (a * C1) ** 2 - 8 * b * C1 * C2;
			const sq = disc > 0 ? Math.sqrt(disc) : 0;
			for (const root of disc > 0 ? [1, -1] : [0]) {
				const x = (a * C1 + root * sq) / 4;
				const y = a * C1 - 2 * x;
				if (!(x > 0 && y > 0)) continue;
				const R1 = 1 / x;
				const R2 = 1 / y;
				// an ideal root far outside the range cannot round into it
				if (R1 < rMin / 2 || R1 > rMax * 2 || R2 < rMin / 2 || R2 > rMax * 2) continue;
				const small = smallCapPenalty(C1, C2) > 0;
				let r1s = stockNeighbours(R1, resistorSeries, pairR1).filter(inRange);
				if (rs > 0) {
					const seen1 = new Set(r1s.map((r) => r.value));
					r1s = [...r1s, ...stockNeighbours(R1 - rs / 2, resistorSeries, pairR1).filter((r) => inRange(r) && !seen1.has(r.value) && seen1.add(r.value))];
				}
				for (const r1 of r1s) {
					// R2 near its ideal value, and near the one that keeps f0 exact with this R1
					const seen = new Set();
					const r2s = [...stockNeighbours(R2, resistorSeries, pairR2), ...stockNeighbours(1 / (b * r1.value * C1 * C2), resistorSeries, pairR2)].filter((r) => inRange(r) && !seen.has(r.value) && seen.add(r.value));
					for (const r2 of r2s) {
						const A = rs > 0 ? (1 / (r1.value + rs) + 1 / r1.value + 1 / r2.value) / C1 : (2 / r1.value + 1 / r2.value) / C1;
						const wnA = 1 / Math.sqrt(r1.value * r2.value * C1 * C2);
						const qA = wnA / A;
						const miss = Math.max(Math.abs(Math.log(wnA / wn)), Math.abs(Math.log(qA / q)));
						const level = sweetSpotScore(r1.value, r2.value);
						out.push({ miss, wn: wnA, q: qA, pairs: (r1.pair ? 2 : 0) + (r2.pair ? 1 : 0), small, level, parts: { C1, C2, R1, R2, R1n: r1.value, R2n: r2.value, root } });
					}
				}
			}
		}
	}
	return out;
}

/**
 * The stage a record of mfbLowPassCandidates stands for, in the shape
 * designMfbLowPass returns (with ok, manual and outOfRange when its
 * capacitors were typed by hand). steps.root says which root (+1, -1, or 0
 * for the double root of a pair under 8 Q^2, whose discriminant is then
 * negative and is taken as 0).
 */
export function mfbLowPassFromParts(wn, q, parts, { resistorSeries = 'E24', manual = false } = {}) {
	const { C1, C2, R1, R2, R1n, R2n, root } = parts;
	const a = wn / q;
	const b = wn * wn;
	const A = (2 / R1n + 1 / R2n) / C1;
	const wnA = 1 / Math.sqrt(R1n * R2n * C1 * C2);
	const discriminant = (a * C1) ** 2 - 8 * b * C1 * C2;
	return {
		topology: 'mfb',
		order: 2,
		theoretical: { R1, R2, R3: R1, C1, C2 },
		components: { R1: R1n, R2: R2n, R3: R1n, C1, C2 },
		actual: { wn: wnA, q: wnA / A, gain: -1 },
		steps: { a, b, C1, C2, discriminant, x: 1 / R1, resistorSeries, root, ...(root === 0 ? { doubleRoot: true } : {}) },
		...(manual ? { ok: true, manual: true, outOfRange: scoreResistors(R1n, R2n) === Infinity } : {})
	};
}
