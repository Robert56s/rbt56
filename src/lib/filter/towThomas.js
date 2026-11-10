import { SERIES, anyPairAllowed, capacitorCandidates, nearestCapacitor, nearestResistor, pairAllowed, pairedResistor, seriesValues, smallCapPenalty, stockNeighbours, stockResistor } from './eseries';

/**
 * Tow-Thomas biquad: two integrators in a loop, three op-amps.
 *
 *   A1  damped (lossy) inverting integrator: input R1 from Vin, loop
 *       resistor Ra from A3's output, feedback C1 in parallel with the
 *       damping resistor Rd. Its output is the band-pass output.
 *   A2  inverting integrator, input Rb, feedback C2. Its output is the
 *       low-pass output, and the stage output here.
 *   A3  unity-gain inverter (two equal resistors r) that closes the loop
 *       with the right sign.
 *
 * KCL at A1's virtual ground, at A2's, and the inverter give
 *   V_bp/Vin = -(s / (C1 R1)) / D(s)
 *   V_lp/Vin = +(1 / (C1 C2 R1 Rb)) / D(s)
 *   D(s) = s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb)
 * so with C1 = C2 = C and Ra = Rb = R:
 *   omega0 = 1 / (R C),   Q = Rd / R,   DC gain of the low-pass = R / R1.
 *
 * The three knobs are independent: R sets omega0, Rd alone sets Q, R1
 * alone sets the gain, and no component ratio grows with Q (MFB needs
 * C1/C2 >= 8 Q^2, Sallen-Key a 4 Q^2 capacitor ratio). The price is three
 * op-amps per stage instead of one.
 *
 * High-pass (feedforward form): replace the input resistor R1 by an input
 * capacitor Cin into A1's summing node. KCL then gives, at A1's output,
 *   V_hp/Vin = -(Cin / C1) s^2 / D(s)
 * so Cin = C gives a unity-magnitude (inverting) high-pass with the same
 * omega0 and Q, and A2's output becomes the band-pass.
 *
 * Notch (the stages of an elliptic or inverse Chebyshev filter, which need
 * zeros on the jw axis): the high-pass form plus one resistor Rz from Vin
 * into A2's summing node. With C1 = C2 = C and Ra = Rb = R, KCL gives
 *   V_out/Vin = -[(Cin / C) s^2 + 1 / (C^2 R Rz)] / D(s)
 * so the zeros sit at omega_z^2 = 1 / (C Cin R Rz), with gain -Cin/C far
 * above them and -R/Rz at DC:
 *   low-pass side  (omega_z > omega_0), DC gain 1:   Cin = C (omega_0/omega_z)^2, Rz = R
 *   high-pass side (omega_z < omega_0), HF gain 1:   Cin = C, Rz = R (omega_0/omega_z)^2
 * On the low-pass side Cin is rounded to a stocked capacitor and Rz is
 * then solved for the exact omega_z, so the rounding shows up as a small
 * DC gain error rather than as a misplaced zero. A notch of a transformed
 * band-pass is held at neither: the `gain` option sets the gain far above
 * the zero instead, Cin = gain C (rounded the same way, Rz solved after).
 *
 * Band-pass (towThomasBp): the low-pass form read at A1's output,
 *   V_bp/Vin = -(s / (C1 R1)) / D(s),   gain at omega0 = -Rd / R1,
 * so R and Rd are found as for the low-pass and R1 = Rd / gain.
 *
 * With `pairs` and a list of values, the resistors that set a figure (R
 * for omega0, Rd for Q, Rz for the zero) may each be two resistors in
 * series (pairedResistor in eseries.js), but a stage keeps its pairs only
 * when they leave it no further from its targets than single parts would:
 * the largest of its f0, Q and zero misses, as logs, decides. Pairing R
 * moves the targets of Rd and Rz, which can then land further from
 * anything on hand. The inverter's two resistors only have to match each
 * other, so they stay single parts.
 * `pairs` may also be a list of the names allowed to pair (pairAllowed in
 * eseries.js): 'Ra' for R (Ra and Rb, and R1 of the low-pass, one value),
 * 'Rd', 'Rz' for a notch and 'R1' for the band-pass gain resistor.
 */

const TT_R_MIN = 200;
const TT_R_MAX = 2_000_000;
const TT_R_SWEET = 10_000;
/** The inverter's two equal resistors: any equal value works, this matches the other stages' scale. */
export const TT_INVERTER_R = 10_000;
/** Below this a notch stage's feed-forward capacitor gets a penalty in the search. */
const TT_CIN_MIN = 100e-12;

function solveTowThomas(wn, q, C) {
	const R = 1 / (wn * C);
	return { R, Rd: q * R };
}

/** How far a stage lands from its targets: the largest of its f0, Q and (for a notch) zero misses, as logs. */
function towThomasMiss(actual, wn, q, wz) {
	const miss = Math.max(Math.abs(Math.log(actual.wn / wn)), Math.abs(Math.log(actual.q / q)));
	return wz ? Math.max(miss, Math.abs(Math.log(actual.wz / wz))) : miss;
}

/** R, then Rd against the rounded R, both rounded to stock; with `pairs`, pairs only where the stage lands no further off. */
function roundTowThomas(Rtarget, C, wn, q, resistorSeries, pairs) {
	const round = (p) => {
		const R = pairedResistor(Rtarget, resistorSeries, pairAllowed(p, 'Ra'));
		// the damping resistor is solved against the ROUNDED R, so that the
		// realized Q = Rd / R lands as close to target as the series allows
		const RdTarget = q * R;
		return { R, RdTarget, Rd: pairedResistor(RdTarget, resistorSeries, pairAllowed(p, 'Rd')) };
	};
	const single = round(false);
	if (!anyPairAllowed(pairs)) return single;
	const paired = round(pairs);
	const missOf = ({ R, Rd }) => towThomasMiss({ wn: 1 / (R * C), q: Rd / R }, wn, q);
	return missOf(paired) <= missOf(single) ? paired : single;
}

/** A notch stage's R, Rd and Rz rounded to stock the same way, the zero's miss counted too. */
function roundNotch(Rtarget, C, Cin, wn, q, wz, resistorSeries, pairs) {
	const round = (p) => {
		const R = pairedResistor(Rtarget, resistorSeries, pairAllowed(p, 'Ra'));
		const Rd = pairedResistor(q * R, resistorSeries, pairAllowed(p, 'Rd'));
		// Rz solved against the parts actually used, so the zero lands where it should
		const RzTarget = 1 / (C * Cin * R * wz * wz);
		return { R, Rd, RzTarget, Rz: pairedResistor(RzTarget, resistorSeries, pairAllowed(p, 'Rz')) };
	};
	const single = round(false);
	if (!anyPairAllowed(pairs)) return single;
	const paired = round(pairs);
	const missOf = ({ R, Rd, Rz }) => towThomasMiss({ wn: 1 / (R * C), q: Rd / R, wz: 1 / Math.sqrt(C * Cin * R * Rz) }, wn, q, wz);
	return missOf(paired) <= missOf(single) ? paired : single;
}

function pickCapacitor(wn, q, capacitors) {
	let best = null;
	for (const C of capacitorCandidates(capacitors)) {
		const { R, Rd } = solveTowThomas(wn, q, C);
		if (!(R > TT_R_MIN && R < TT_R_MAX && Rd > TT_R_MIN && Rd < TT_R_MAX)) continue;
		// R is what sets the impedance level; Rd = Q R is allowed to wander
		// further from the sweet spot, it only has to stay in range
		const score = Math.log(R / TT_R_SWEET) ** 2 + 0.25 * Math.log(Rd / TT_R_SWEET) ** 2 + smallCapPenalty(C);
		if (best === null || score < best.score) best = { C, R, Rd, score };
	}
	return best;
}

function realize(wn, q, C, resistorSeries, { highPass, manual, pairs = false }) {
	const { R: Rtarget, Rd: RdIdeal } = solveTowThomas(wn, q, C);
	// the inverter's matched pair has to come from the same stock as the rest
	const rInv = nearestResistor(TT_INVERTER_R, resistorSeries);
	const { R, RdTarget, Rd } = roundTowThomas(Rtarget, C, wn, q, resistorSeries, pairs);
	const wnActual = 1 / (R * C);
	const qActual = Rd / R;
	const outOfRange = !(R > TT_R_MIN && R < TT_R_MAX && Rd > TT_R_MIN && Rd < TT_R_MAX);
	const shared = {
		order: 2,
		actual: { wn: wnActual, q: qActual, gain: highPass ? -1 : 1 },
		steps: { C, Rtarget, RdIdeal, Rrounded: R, RdTarget, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
	if (highPass) {
		return {
			topology: 'towThomasHp',
			theoretical: { Cin: C, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv },
			components: { Cin: C, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv },
			...shared
		};
	}
	return {
		topology: 'towThomas',
		theoretical: { R1: Rtarget, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv },
		components: { R1: R, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv },
		...shared
	};
}

/** Searches the available capacitor values for one that puts R near 10 kohm, then rounds R and Rd to the stocked resistor values. */
export function designTowThomasLowPass(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const best = pickCapacitor(wn, q, capacitors);
	if (!best) return null;
	return realize(wn, q, best.C, resistorSeries, { highPass: false, manual: false, pairs });
}

/** Same stage from a capacitor chosen by hand (both capacitors take this value). Always realizable. */
export function designTowThomasLowPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	return realize(wn, q, C, resistorSeries, { highPass: false, manual: true, pairs });
}

export function designTowThomasHighPass(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const best = pickCapacitor(wn, q, capacitors);
	if (!best) return null;
	return realize(wn, q, best.C, resistorSeries, { highPass: true, manual: false, pairs });
}

export function designTowThomasHighPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	return realize(wn, q, C, resistorSeries, { highPass: true, manual: true, pairs });
}

/**
 * The notch form. `wz` is the zero, `lowSide` says which gain is held at 1:
 * DC for a stage of a low-pass (wz above wn), infinity for a high-pass.
 */
function realizeNotch(wn, q, wz, C, { resistorSeries, capacitors, lowSide, manual, pairs = false, gain = null }) {
	const { R: Rtarget, Rd: RdIdeal } = solveTowThomas(wn, q, C);
	const rInv = nearestResistor(TT_INVERTER_R, resistorSeries);
	const CinIdeal = ttNotchCinIdeal(wn, wz, C, lowSide, gain);
	const Cin = ttNotchCin(CinIdeal, C, lowSide, gain, capacitors);
	const { R, Rd, RzTarget, Rz } = roundNotch(Rtarget, C, Cin, wn, q, wz, resistorSeries, pairs);
	const RzIdeal = gain !== null ? (Rtarget / gain) * (wn / wz) ** 2 : lowSide ? Rtarget : Rtarget * (wn / wz) ** 2;
	const outOfRange = ![R, Rd, Rz].every((v) => v > TT_R_MIN && v < TT_R_MAX);
	return {
		topology: 'towThomasNotch',
		order: 2,
		// with a set gain neither DC nor HF is held at 1: the side is where the zero sits
		lowSide: gain !== null ? wz > wn : lowSide,
		theoretical: { Cin: CinIdeal, Rz: RzIdeal, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv },
		components: { Cin, Rz, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv },
		actual: { wn: 1 / (R * C), q: Rd / R, wz: 1 / Math.sqrt(C * Cin * R * Rz), gain: -Cin / C, dcGain: -R / Rz },
		steps: { C, Rtarget, RdIdeal, Rrounded: R, RdTarget: q * R, CinIdeal, RzTarget, ...(gain !== null ? { gainTarget: gain } : {}), resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
}

/** A notch stage's ideal Cin: gain C with a set gain, else C (wn/wz)^2 for DC gain 1 or C for HF gain 1. */
function ttNotchCinIdeal(wn, wz, C, lowSide, gain) {
	if (gain !== null) return gain * C;
	return lowSide ? C * (wn / wz) ** 2 : C;
}

/** Cin as built: with a set gain, rounded to a stocked capacitor unless it is C itself. */
function ttNotchCin(CinIdeal, C, lowSide, gain, capacitors) {
	if (gain !== null) return CinIdeal === C ? C : nearestCapacitor(CinIdeal, capacitors);
	return lowSide ? nearestCapacitor(CinIdeal, capacitors) : C;
}

/** The capacitor search behind designTowThomasNotch, weighing the values it would really use (pairs included with `pairs`). */
function searchNotch(wn, q, wz, { lowSide, resistorSeries, capacitors, pairs, gain = null }) {
	let best = null;
	for (const C of capacitorCandidates(capacitors)) {
		const { R } = solveTowThomas(wn, q, C);
		const Rr = pairedResistor(R, resistorSeries, pairAllowed(pairs, 'Ra'));
		const RdIdeal = q * Rr;
		const CinIdeal = ttNotchCinIdeal(wn, wz, C, lowSide, gain);
		const Cin = ttNotchCin(CinIdeal, C, lowSide, gain, capacitors);
		const RzIdeal = 1 / (C * Cin * Rr * wz * wz);
		if (![R, RdIdeal, RzIdeal].every((v) => v > TT_R_MIN && v < TT_R_MAX)) continue;
		const err = (v, target) => Math.log(v / target) ** 2;
		const rounding =
			1000 * err(Rr, R) + 500 * err(pairedResistor(RdIdeal, resistorSeries, pairAllowed(pairs, 'Rd')), RdIdeal) + 250 * err(pairedResistor(RzIdeal, resistorSeries, pairAllowed(pairs, 'Rz')), RzIdeal) + 100 * err(Cin, CinIdeal);
		// a Cin of a few tens of picofarads would compete with the op-amp's own input capacitance
		const tinyCin = CinIdeal < TT_CIN_MIN ? Math.log(TT_CIN_MIN / CinIdeal) ** 2 : 0;
		const level = Math.log(R / TT_R_SWEET) ** 2 + 0.125 * (Math.log(RdIdeal / TT_R_SWEET) ** 2 + Math.log(RzIdeal / TT_R_SWEET) ** 2);
		const score = level + rounding + tinyCin + smallCapPenalty(C, Cin);
		if (best === null || score < best.score) best = { C, score };
	}
	if (!best) return null;
	return realizeNotch(wn, q, wz, best.C, { resistorSeries, capacitors, lowSide, manual: false, pairs, gain });
}

/**
 * A notch stage from the automatic capacitor search. Elliptic stages have
 * high Qs and zeros close to the band edge, so a few percent of rounding
 * shows in the response: besides keeping R near 10 kilo-ohm, the search
 * weighs what rounding each part to stock would cost, f0 (R), Q (Rd), the
 * zero (Rz) and, on the low-pass side, the DC gain (Cin), and takes the
 * capacitor whose parts land closest. With `pairs` the search may settle
 * on another capacitor, and that design is kept only when it lands no
 * further off than the one without pairs. `gain`, when given, is the size
 * of the gain far above the zero and takes the place of the lowSide rule.
 */
export function designTowThomasNotch(wn, q, wz, { lowSide = true, resistorSeries = 'E24', capacitors = null, pairs = false, gain = null } = {}) {
	const single = searchNotch(wn, q, wz, { lowSide, resistorSeries, capacitors, pairs: false, gain });
	if (!anyPairAllowed(pairs)) return single;
	const paired = searchNotch(wn, q, wz, { lowSide, resistorSeries, capacitors, pairs, gain });
	if (!paired || !single) return paired ?? single;
	return towThomasMiss(paired.actual, wn, q, wz) <= towThomasMiss(single.actual, wn, q, wz) ? paired : single;
}

/** The same notch stage from a capacitor chosen by hand (the two integrator capacitors). */
export function designTowThomasNotchFromCap(wn, q, wz, C, { lowSide = true, resistorSeries = 'E24', capacitors = null, pairs = false, gain = null } = {}) {
	return realizeNotch(wn, q, wz, C, { resistorSeries, capacitors, lowSide, manual: true, pairs, gain });
}

/* ------------------------------------------------------------ band-pass */

/** How far a band-pass stage lands from its targets: the largest of its f0, Q and gain misses, as logs. */
function ttBpMiss(actual, wn, q, gain) {
	return Math.max(towThomasMiss(actual, wn, q), Math.abs(Math.log(Math.abs(actual.gain) / gain)));
}

/** The band-pass stage on capacitor C: R and Rd as for the low-pass, then R1 solved against the rounded Rd. */
function ttBpRealize(wn, q, C, { gain, resistorSeries, manual, pairs = false }) {
	const { R: Rtarget, Rd: RdIdeal } = solveTowThomas(wn, q, C);
	const rInv = nearestResistor(TT_INVERTER_R, resistorSeries);
	const { R, RdTarget, Rd } = roundTowThomas(Rtarget, C, wn, q, resistorSeries, pairs);
	// R1 only sets the gain, so it can follow the parts already rounded
	const R1Target = Rd / gain;
	const R1 = pairedResistor(R1Target, resistorSeries, pairAllowed(pairs, 'R1'));
	const outOfRange = ![R1, R, Rd].every((v) => v > TT_R_MIN && v < TT_R_MAX);
	return {
		topology: 'towThomasBp',
		order: 2,
		theoretical: { R1: RdIdeal / gain, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv },
		components: { R1, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv },
		actual: { wn: 1 / (R * C), q: Rd / R, gain: -Rd / R1 },
		steps: { C, Rtarget, RdIdeal, Rrounded: R, RdTarget, R1Target, gainTarget: gain, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
}

/** The capacitor search behind designTowThomasBandPass, weighing what rounding R, Rd and R1 would cost, as searchNotch does. */
function ttBpSearch(wn, q, { gain, resistorSeries, capacitors, pairs }) {
	let best = null;
	for (const C of capacitorCandidates(capacitors)) {
		const { R } = solveTowThomas(wn, q, C);
		const Rr = pairedResistor(R, resistorSeries, pairAllowed(pairs, 'Ra'));
		const RdIdeal = q * Rr;
		const Rdr = pairedResistor(RdIdeal, resistorSeries, pairAllowed(pairs, 'Rd'));
		const R1Ideal = Rdr / gain;
		if (![R, RdIdeal, R1Ideal].every((v) => v > TT_R_MIN && v < TT_R_MAX)) continue;
		const err = (v, target) => Math.log(v / target) ** 2;
		const rounding = 1000 * err(Rr, R) + 500 * err(Rdr, RdIdeal) + 250 * err(pairedResistor(R1Ideal, resistorSeries, pairAllowed(pairs, 'R1')), R1Ideal);
		const level = Math.log(R / TT_R_SWEET) ** 2 + 0.125 * (Math.log(RdIdeal / TT_R_SWEET) ** 2 + Math.log(R1Ideal / TT_R_SWEET) ** 2);
		const score = level + rounding + smallCapPenalty(C);
		if (best === null || score < best.score) best = { C, score };
	}
	if (!best) return null;
	return ttBpRealize(wn, q, best.C, { gain, resistorSeries, manual: false, pairs });
}

/**
 * A band-pass stage at wn with the given Q and the given gain at its own
 * centre (its size: the stage inverts). No ratio grows with Q or with the
 * gain, so it only fails, with null, when no capacitor keeps R, Rd and R1
 * in range.
 */
export function designTowThomasBandPass(wn, q, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	const single = ttBpSearch(wn, q, { gain: size, resistorSeries, capacitors, pairs: false });
	if (!anyPairAllowed(pairs)) return single;
	const paired = ttBpSearch(wn, q, { gain: size, resistorSeries, capacitors, pairs });
	if (!paired || !single) return paired ?? single;
	return ttBpMiss(paired.actual, wn, q, size) <= ttBpMiss(single.actual, wn, q, size) ? paired : single;
}

/**
 * The same band-pass stage from a capacitor chosen by hand (both
 * integrator capacitors). Always realizable; { ok: false } only when f0, Q,
 * the gain or C is not a positive number.
 */
export function designTowThomasBandPassFromCap(wn, q, C, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, C, size].every((v) => Number.isFinite(v) && v > 0)) return { ok: false };
	return ttBpRealize(wn, q, C, { gain: size, resistorSeries, manual: true, pairs });
}

/* ------------------------------------------------- candidates for a joint search */

/** The stocked values a resistor of a candidate may take: just below and just above its target, inside [rMin, rMax). */
function ttNeighbours(target, resistorSeries, pairs, rMin, rMax) {
	return stockNeighbours(target, resistorSeries, pairs).filter((r) => r.value >= rMin * (1 - 1e-9) && r.value < rMax);
}

/**
 * Every way the stock builds a low-pass (or with highPass a high-pass)
 * stage, each judged on its rounded parts (partSearch.js): every capacitor
 * C for the two integrators (the one typed by hand, `caps.C`, when there is
 * one), R rounded to the stocked values just below and above 1 / (omega0 C),
 * and Rd the same around Q times that rounded R (stockNeighbours: two in
 * series too where `pairs` lets them). Every resistor stays in [rMin, rMax).
 * Returns light records { miss, wn, q, pairs, small, level, parts }, parts
 * = { C, Rtarget, RdIdeal, R, Rd }, unsorted; towThomasFromParts builds one.
 * pairs counts R three times for a low-pass (R1, Ra and Rb), twice for a
 * high-pass.
 */
export function towThomasCandidates(wn, q, { highPass = false, resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = TT_R_MIN, rMax = TT_R_MAX } = {}) {
	const pairR = pairAllowed(pairs, 'Ra');
	const pairRd = pairAllowed(pairs, 'Rd');
	const out = [];
	for (const C of caps?.C > 0 ? [caps.C] : capacitorCandidates(capacitors)) {
		const { R: Rtarget, Rd: RdIdeal } = solveTowThomas(wn, q, C);
		if (Rtarget < rMin / 2 || Rtarget > rMax * 2 || RdIdeal < rMin / 2 || RdIdeal > rMax * 2) continue;
		const small = smallCapPenalty(C) > 0;
		for (const r of ttNeighbours(Rtarget, resistorSeries, pairR, rMin, rMax)) {
			for (const d of ttNeighbours(q * r.value, resistorSeries, pairRd, rMin, rMax)) {
				const wnA = 1 / (r.value * C);
				const qA = d.value / r.value;
				const miss = towThomasMiss({ wn: wnA, q: qA }, wn, q);
				const level = Math.log(r.value / TT_R_SWEET) ** 2 + 0.25 * Math.log(d.value / TT_R_SWEET) ** 2;
				out.push({ miss, wn: wnA, q: qA, pairs: (r.pair ? (highPass ? 2 : 3) : 0) + (d.pair ? 1 : 0), small, level, parts: { C, Rtarget, RdIdeal, R: r.value, Rd: d.value } });
			}
		}
	}
	return out;
}

/** The stage a record of towThomasCandidates stands for, in the shape designTowThomasLowPass (or with highPass designTowThomasHighPass) returns, with ok, manual and outOfRange for a capacitor typed by hand. */
export function towThomasFromParts(wn, q, parts, { highPass = false, resistorSeries = 'E24', manual = false } = {}) {
	const { C, Rtarget, RdIdeal, R, Rd } = parts;
	const rInv = stockResistor(TT_INVERTER_R, resistorSeries);
	const shared = {
		order: 2,
		actual: { wn: 1 / (R * C), q: Rd / R, gain: highPass ? -1 : 1 },
		steps: { C, Rtarget, RdIdeal, Rrounded: R, RdTarget: q * R, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange: !(R > TT_R_MIN && R < TT_R_MAX && Rd > TT_R_MIN && Rd < TT_R_MAX) } : {})
	};
	if (highPass) {
		return { topology: 'towThomasHp', theoretical: { Cin: C, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv }, components: { Cin: C, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv }, ...shared };
	}
	return { topology: 'towThomas', theoretical: { R1: Rtarget, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv }, components: { R1: R, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv }, ...shared };
}

/**
 * Every way the stock builds a notch stage, each judged on its rounded
 * parts (partSearch.js), with the options of designTowThomasNotch (lowSide,
 * gain): every C (or `caps.C`), Cin the stocked capacitors on each side of
 * its ideal value where it is rounded (C itself where it is not), R and Rd
 * as for towThomasCandidates, and Rz the stocked values just below and above
 * the one that puts the zero on target with those parts. Every resistor
 * stays in [rMin, rMax). miss is the largest log miss of f0, Q and the zero.
 * Returns light records { miss, wn, q, wz, pairs, small, level, parts },
 * parts = { C, Cin, CinIdeal, Rtarget, RdIdeal, R, Rd, RzTarget, Rz },
 * unsorted; towThomasNotchFromParts builds one.
 */
export function towThomasNotchCandidates(wn, q, wz, { lowSide = true, gain = null, resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = TT_R_MIN, rMax = TT_R_MAX } = {}) {
	const grid = Array.isArray(capacitors) ? capacitorCandidates(capacitors) : seriesValues(SERIES.E12, -12, -3);
	const pairR = pairAllowed(pairs, 'Ra');
	const pairRd = pairAllowed(pairs, 'Rd');
	const pairRz = pairAllowed(pairs, 'Rz');
	const out = [];
	for (const C of caps?.C > 0 ? [caps.C] : capacitorCandidates(capacitors)) {
		const { R: Rtarget, Rd: RdIdeal } = solveTowThomas(wn, q, C);
		if (Rtarget < rMin / 2 || Rtarget > rMax * 2 || RdIdeal < rMin / 2 || RdIdeal > rMax * 2) continue;
		const CinIdeal = ttNotchCinIdeal(wn, wz, C, lowSide, gain);
		const rounded = gain !== null ? CinIdeal !== C : lowSide;
		let cins = [C];
		if (rounded) {
			let i = 0;
			while (i < grid.length && grid[i] < CinIdeal) i++;
			cins = grid.slice(Math.max(0, i - 1), i + 1);
		}
		for (const Cin of cins) {
			const small = smallCapPenalty(C, Cin) > 0;
			const tinyCin = CinIdeal < TT_CIN_MIN ? Math.log(TT_CIN_MIN / CinIdeal) ** 2 : 0;
			for (const r of ttNeighbours(Rtarget, resistorSeries, pairR, rMin, rMax)) {
				const RzTarget = 1 / (C * Cin * r.value * wz * wz);
				const rzs = ttNeighbours(RzTarget, resistorSeries, pairRz, rMin, rMax);
				for (const d of ttNeighbours(q * r.value, resistorSeries, pairRd, rMin, rMax)) {
					for (const z of rzs) {
						const actual = { wn: 1 / (r.value * C), q: d.value / r.value, wz: 1 / Math.sqrt(C * Cin * r.value * z.value) };
						const level = Math.log(r.value / TT_R_SWEET) ** 2 + 0.125 * (Math.log(d.value / TT_R_SWEET) ** 2 + Math.log(z.value / TT_R_SWEET) ** 2) + tinyCin;
						// the gain the stage is held at, missed as the others: far above the zero with a set gain, at DC on the low-pass side
						const gainMiss = gain !== null ? Math.abs(Math.log(Cin / C / gain)) : lowSide ? Math.abs(Math.log(r.value / z.value)) : 0;
						out.push({ miss: Math.max(towThomasMiss(actual, wn, q, wz), gainMiss), ...actual, pairs: (r.pair ? 2 : 0) + (d.pair ? 1 : 0) + (z.pair ? 1 : 0), small, level, parts: { C, Cin, CinIdeal, Rtarget, RdIdeal, R: r.value, Rd: d.value, RzTarget, Rz: z.value } });
					}
				}
			}
		}
	}
	return out;
}

/** The stage a record of towThomasNotchCandidates stands for, in the shape designTowThomasNotch returns (with ok, manual and outOfRange for a capacitor typed by hand). */
export function towThomasNotchFromParts(wn, q, wz, parts, { lowSide = true, gain = null, resistorSeries = 'E24', manual = false } = {}) {
	const { C, Cin, CinIdeal, Rtarget, RdIdeal, R, Rd, RzTarget, Rz } = parts;
	const rInv = stockResistor(TT_INVERTER_R, resistorSeries);
	const RzIdeal = gain !== null ? (Rtarget / gain) * (wn / wz) ** 2 : lowSide ? Rtarget : Rtarget * (wn / wz) ** 2;
	return {
		topology: 'towThomasNotch',
		order: 2,
		lowSide: gain !== null ? wz > wn : lowSide,
		theoretical: { Cin: CinIdeal, Rz: RzIdeal, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv },
		components: { Cin, Rz, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv },
		actual: { wn: 1 / (R * C), q: Rd / R, wz: 1 / Math.sqrt(C * Cin * R * Rz), gain: -Cin / C, dcGain: -R / Rz },
		steps: { C, Rtarget, RdIdeal, Rrounded: R, RdTarget: q * R, CinIdeal, RzTarget, ...(gain !== null ? { gainTarget: gain } : {}), resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange: ![R, Rd, Rz].every((v) => v > TT_R_MIN && v < TT_R_MAX) } : {})
	};
}
