import { capacitorCandidates, nearestCapacitor, nearestResistor } from './eseries';

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
 * Searches a preferred capacitor series for a well-scaled C (used for all
 * three capacitors), then rounds the resulting resistors to a preferred
 * series and reports the actual wn/Q/gain the rounded values give.
 */
export function designMfbHighPass(wn, q, { resistorSeries = 'E24', capacitors = null } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const C of caps) {
		const { R1, R2 } = solveMfbHpResistors(a, b, C);
		const score = scoreMfbHpResistors(R1, R2);
		if (best === null || score < best.score) best = { C, R1, R2, score };
	}
	if (!best) return null;

	const R1n = nearestResistor(best.R1, resistorSeries);
	const R2n = nearestResistor(best.R2, resistorSeries);
	const aActual = 3 / (R2n * best.C);
	const bActual = 1 / (R1n * R2n * best.C * best.C);

	return {
		topology: 'mfbHp',
		order: 2,
		theoretical: { R1: best.R1, R2: best.R2, C1: best.C, C2: best.C, C3: best.C },
		components: { R1: R1n, R2: R2n, C1: best.C, C2: best.C, C3: best.C },
		actual: { wn: Math.sqrt(bActual), q: Math.sqrt(bActual) / aActual, gain: -1 },
		steps: { a, b, C: best.C, resistorSeries }
	};
}

/**
 * Solves for R1/R2 from a capacitor C chosen by hand (e.g. to match what
 * is actually in stock), instead of searching a preferred series for it.
 * Unlike MFB low-pass, this always has a real solution: there is no
 * realizability ceiling on Q for this topology.
 */
export function designMfbHighPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const { R1, R2 } = solveMfbHpResistors(a, b, C);

	const R1n = nearestResistor(R1, resistorSeries);
	const R2n = nearestResistor(R2, resistorSeries);
	const aActual = 3 / (R2n * C);
	const bActual = 1 / (R1n * R2n * C * C);
	const outOfRange = !(R1n > MFB_HP_R_MIN && R1n < MFB_HP_R_MAX && R2n > MFB_HP_R_MIN && R2n < MFB_HP_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'mfbHp',
		order: 2,
		theoretical: { R1, R2, C1: C, C2: C, C3: C },
		components: { R1: R1n, R2: R2n, C1: C, C2: C, C3: C },
		actual: { wn: Math.sqrt(bActual), q: Math.sqrt(bActual) / aActual, gain: -1 },
		steps: { a, b, C, resistorSeries },
		outOfRange
	};
}
