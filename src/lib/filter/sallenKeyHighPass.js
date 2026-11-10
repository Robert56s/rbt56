import { anyPairAllowed, capacitorCandidates, nearestCapacitor, pairAllowed, pairedResistor, smallCapPenalty, stockNeighbours } from './eseries';

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

/**
 * R_top and R_bottom rounded to stock, and the f0 and Q they give. With
 * `pairs` each may be two resistors in series, kept only when that leaves
 * the stage no further off than single parts, as in roundMfb (mfb.js). Here
 * it never has to refuse: f0 and Q share the two resistors evenly, so the
 * stage's larger miss is the mean of the two parts' own. A list of names
 * in `pairs` (pairAllowed in eseries.js) takes 'Rtop' and 'Rbottom'.
 */
function roundSallenKeyHp(Rtop, Rbottom, C, wn, q, resistorSeries, pairs) {
	const round = (p) => {
		const RtopN = pairedResistor(Rtop, resistorSeries, pairAllowed(p, 'Rtop'));
		const RbottomN = pairedResistor(Rbottom, resistorSeries, pairAllowed(p, 'Rbottom'));
		return { RtopN, RbottomN, wn: 1 / (C * Math.sqrt(RtopN * RbottomN)), q: 0.5 * Math.sqrt(RbottomN / RtopN) };
	};
	const single = round(false);
	if (!anyPairAllowed(pairs)) return single;
	const paired = round(pairs);
	const miss = (r) => Math.max(Math.abs(Math.log(r.wn / wn)), Math.abs(Math.log(r.q / q)));
	return miss(paired) <= miss(single) ? paired : single;
}

export function designSallenKeyHighPass(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const C of caps) {
		const { Rtop, Rbottom } = solveSkHpResistors(wn, q, C);
		const s = scoreSkHpResistors(Rtop, Rbottom) + smallCapPenalty(C);
		if (best === null || s < best.score) best = { C, Rtop, Rbottom, score: s };
	}
	if (!best) return null;

	const r = roundSallenKeyHp(best.Rtop, best.Rbottom, best.C, wn, q, resistorSeries, pairs);

	return {
		topology: 'sallenKeyHp',
		order: 2,
		theoretical: { Rtop: best.Rtop, Rbottom: best.Rbottom, C1: best.C, C2: best.C, ratio: resistorRatioHp(q) },
		components: { Rtop: r.RtopN, Rbottom: r.RbottomN, C1: best.C, C2: best.C },
		actual: { wn: r.wn, q: r.q, gain: 1 },
		steps: { ratio: resistorRatioHp(q), C: best.C, RtopTarget: best.Rtop, RbottomTarget: best.Rbottom, resistorSeries }
	};
}

/**
 * Solves for R_top/R_bottom from a capacitor C chosen by hand (e.g. to
 * match what is actually in stock) instead of searching a preferred
 * series for it. Always has a real solution.
 */
export function designSallenKeyHighPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const { Rtop, Rbottom } = solveSkHpResistors(wn, q, C);
	const r = roundSallenKeyHp(Rtop, Rbottom, C, wn, q, resistorSeries, pairs);
	const outOfRange = !(r.RtopN > SK_HP_R_MIN && r.RtopN < SK_HP_R_MAX && r.RbottomN > SK_HP_R_MIN && r.RbottomN < SK_HP_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'sallenKeyHp',
		order: 2,
		theoretical: { Rtop, Rbottom, C1: C, C2: C, ratio: resistorRatioHp(q) },
		components: { Rtop: r.RtopN, Rbottom: r.RbottomN, C1: C, C2: C },
		actual: { wn: r.wn, q: r.q, gain: 1 },
		steps: { ratio: resistorRatioHp(q), C, RtopTarget: Rtop, RbottomTarget: Rbottom, resistorSeries },
		outOfRange
	};
}

/* ------------------------------------------------- candidates for a joint search */

/**
 * Every way the stock builds this stage, each judged on its rounded parts
 * (partSearch.js): every capacitor C (the one typed by hand, `caps.C`, when
 * there is one), R_top rounded to the stocked values just below and above
 * its ideal value, and R_bottom the same around 4 Q^2 R_top (the rounded
 * one) and around the value that keeps f0 exact on it (stockNeighbours: two
 * in series too where `pairs` lets them). Both stay in [rMin, rMax).
 * Returns light records { miss, wn, q, pairs, small, level, parts }, parts
 * = { C, Rtop, Rbottom, RtopN, RbottomN }, unsorted;
 * sallenKeyHighPassFromParts builds one.
 */
export function sallenKeyHighPassCandidates(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = SK_HP_R_MIN, rMax = SK_HP_R_MAX } = {}) {
	const inRange = (r) => r.value >= rMin * (1 - 1e-9) && r.value < rMax;
	const pairTop = pairAllowed(pairs, 'Rtop');
	const pairBottom = pairAllowed(pairs, 'Rbottom');
	const out = [];
	for (const C of caps?.C > 0 ? [caps.C] : capacitorCandidates(capacitors)) {
		const { Rtop, Rbottom } = solveSkHpResistors(wn, q, C);
		if (Rtop < rMin / 2 || Rtop > rMax * 2 || Rbottom < rMin / 2 || Rbottom > rMax * 2) continue;
		const small = smallCapPenalty(C) > 0;
		for (const t of stockNeighbours(Rtop, resistorSeries, pairTop).filter(inRange)) {
			const seen = new Set();
			const bottoms = [...stockNeighbours(resistorRatioHp(q) * t.value, resistorSeries, pairBottom), ...stockNeighbours(1 / (wn * wn * C * C * t.value), resistorSeries, pairBottom)].filter((r) => inRange(r) && !seen.has(r.value) && seen.add(r.value));
			for (const bt of bottoms) {
				const wnA = 1 / (C * Math.sqrt(t.value * bt.value));
				const qA = 0.5 * Math.sqrt(bt.value / t.value);
				const miss = Math.max(Math.abs(Math.log(wnA / wn)), Math.abs(Math.log(qA / q)));
				out.push({ miss, wn: wnA, q: qA, pairs: (t.pair ? 1 : 0) + (bt.pair ? 1 : 0), small, level: Math.log(t.value / SK_HP_R_SWEET) ** 2 + Math.log(bt.value / SK_HP_R_SWEET) ** 2, parts: { C, Rtop, Rbottom, RtopN: t.value, RbottomN: bt.value } });
			}
		}
	}
	return out;
}

/** The stage a record of sallenKeyHighPassCandidates stands for, in the shape designSallenKeyHighPass returns (with ok, manual and outOfRange for a capacitor typed by hand). */
export function sallenKeyHighPassFromParts(wn, q, parts, { resistorSeries = 'E24', manual = false } = {}) {
	const { C, Rtop, Rbottom, RtopN, RbottomN } = parts;
	return {
		topology: 'sallenKeyHp',
		order: 2,
		theoretical: { Rtop, Rbottom, C1: C, C2: C, ratio: resistorRatioHp(q) },
		components: { Rtop: RtopN, Rbottom: RbottomN, C1: C, C2: C },
		actual: { wn: 1 / (C * Math.sqrt(RtopN * RbottomN)), q: 0.5 * Math.sqrt(RbottomN / RtopN), gain: 1 },
		steps: { ratio: resistorRatioHp(q), C, RtopTarget: Rtop, RbottomTarget: Rbottom, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange: !(RtopN > SK_HP_R_MIN && RtopN < SK_HP_R_MAX && RbottomN > SK_HP_R_MIN && RbottomN < SK_HP_R_MAX) } : {})
	};
}
