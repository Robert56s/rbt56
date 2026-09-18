import { capacitorCandidates, nearestCapacitor, nearestResistor } from './eseries';

/**
 * Sallen-Key high-pass, unity-gain simplified form: two equal capacitors C
 * in series from Vin to the op-amp's non-inverting input, a resistor
 * R_bottom from the C-C junction to ground, and a feedback resistor R_top
 * from the output back to that same junction. This is the exact R-C dual
 * of the low-pass circuit (sallenKey.js): same equations with every R and
 * C swapped.
 *
 *   wn = 1 / (C * sqrt(R_top * R_bottom))
 *   Q  = (1/2) * sqrt(R_bottom / R_top)   =>   R_bottom = 4*Q^2 * R_top
 *
 * With C1 = C2 = C fixed, both resistors follow directly once C is
 * chosen (no search needed for them): R_top = 1/(2*Q*wn*C),
 * R_bottom = 4*Q^2*R_top. Re-derived from the general Sallen-Key nodal
 * equations and cross-checked against the low-pass formula by
 * substitution - the two match term for term under the R<->C swap.
 */

const SK_HP_R_MIN = 200;
const SK_HP_R_MAX = 2_000_000;
const SK_HP_R_SWEET = 10_000;

export function resistorRatioHp(q) {
	// R_bottom / R_top, fixed by Q the same way the low-pass capacitor
	// ratio (capRatio in sallenKey.js) is - named differently here so the
	// two functions never collide once both get inlined into one script.
	return 4 * q * q;
}

function solveSkHpResistors(wn, q, C) {
	const Rtop = 1 / (2 * q * wn * C);
	const Rbottom = resistorRatioHp(q) * Rtop;
	return { Rtop, Rbottom };
}

function scoreSkHpResistors(Rtop, Rbottom) {
	if (!(Rtop > SK_HP_R_MIN && Rtop < SK_HP_R_MAX && Rbottom > SK_HP_R_MIN && Rbottom < SK_HP_R_MAX)) return Infinity;
	return Math.log(Rtop / SK_HP_R_SWEET) ** 2 + Math.log(Rbottom / SK_HP_R_SWEET) ** 2;
}

export function designSallenKeyHighPass(wn, q, { resistorSeries = 'E24', capacitors = null } = {}) {
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const C of caps) {
		const { Rtop, Rbottom } = solveSkHpResistors(wn, q, C);
		const s = scoreSkHpResistors(Rtop, Rbottom);
		if (best === null || s < best.score) best = { C, Rtop, Rbottom, score: s };
	}
	if (!best) return null;

	const RtopN = nearestResistor(best.Rtop, resistorSeries);
	const RbottomN = nearestResistor(best.Rbottom, resistorSeries);
	const wnActual = 1 / (best.C * Math.sqrt(RtopN * RbottomN));
	const qActual = 0.5 * Math.sqrt(RbottomN / RtopN);

	return {
		topology: 'sallenKeyHp',
		order: 2,
		theoretical: { Rtop: best.Rtop, Rbottom: best.Rbottom, C1: best.C, C2: best.C, ratio: resistorRatioHp(q) },
		components: { Rtop: RtopN, Rbottom: RbottomN, C1: best.C, C2: best.C },
		actual: { wn: wnActual, q: qActual, gain: 1 },
		steps: { ratio: resistorRatioHp(q), C: best.C, RtopTarget: best.Rtop, RbottomTarget: best.Rbottom, resistorSeries }
	};
}

/**
 * Solves for R_top/R_bottom from a capacitor C chosen by hand (e.g. to
 * match what is actually in stock) instead of searching a preferred
 * series for it. Always has a real solution.
 */
export function designSallenKeyHighPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null } = {}) {
	const { Rtop, Rbottom } = solveSkHpResistors(wn, q, C);
	const RtopN = nearestResistor(Rtop, resistorSeries);
	const RbottomN = nearestResistor(Rbottom, resistorSeries);
	const wnActual = 1 / (C * Math.sqrt(RtopN * RbottomN));
	const qActual = 0.5 * Math.sqrt(RbottomN / RtopN);
	const outOfRange = !(RtopN > SK_HP_R_MIN && RtopN < SK_HP_R_MAX && RbottomN > SK_HP_R_MIN && RbottomN < SK_HP_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'sallenKeyHp',
		order: 2,
		theoretical: { Rtop, Rbottom, C1: C, C2: C, ratio: resistorRatioHp(q) },
		components: { Rtop: RtopN, Rbottom: RbottomN, C1: C, C2: C },
		actual: { wn: wnActual, q: qActual, gain: 1 },
		steps: { ratio: resistorRatioHp(q), C, RtopTarget: Rtop, RbottomTarget: Rbottom, resistorSeries },
		outOfRange
	};
}
