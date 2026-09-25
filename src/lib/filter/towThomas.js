import { capacitorCandidates, nearestCapacitor, nearestResistor } from './eseries';

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
 * DC gain error rather than as a misplaced zero.
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

function pickCapacitor(wn, q, capacitors) {
	let best = null;
	for (const C of capacitorCandidates(capacitors)) {
		const { R, Rd } = solveTowThomas(wn, q, C);
		if (!(R > TT_R_MIN && R < TT_R_MAX && Rd > TT_R_MIN && Rd < TT_R_MAX)) continue;
		// R is what sets the impedance level; Rd = Q R is allowed to wander
		// further from the sweet spot, it only has to stay in range
		const score = Math.log(R / TT_R_SWEET) ** 2 + 0.25 * Math.log(Rd / TT_R_SWEET) ** 2;
		if (best === null || score < best.score) best = { C, R, Rd, score };
	}
	return best;
}

function realize(wn, q, C, resistorSeries, { highPass, manual }) {
	const { R: Rtarget, Rd: RdIdeal } = solveTowThomas(wn, q, C);
	// the inverter's matched pair has to come from the same stock as the rest
	const rInv = nearestResistor(TT_INVERTER_R, resistorSeries);
	const R = nearestResistor(Rtarget, resistorSeries);
	// the damping resistor is solved against the ROUNDED R, so that the
	// realized Q = Rd / R lands as close to target as the series allows
	const RdTarget = q * R;
	const Rd = nearestResistor(RdTarget, resistorSeries);
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
export function designTowThomasLowPass(wn, q, { resistorSeries = 'E24', capacitors = null } = {}) {
	const best = pickCapacitor(wn, q, capacitors);
	if (!best) return null;
	return realize(wn, q, best.C, resistorSeries, { highPass: false, manual: false });
}

/** Same stage from a capacitor chosen by hand (both capacitors take this value). Always realizable. */
export function designTowThomasLowPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null } = {}) {
	return realize(wn, q, C, resistorSeries, { highPass: false, manual: true });
}

export function designTowThomasHighPass(wn, q, { resistorSeries = 'E24', capacitors = null } = {}) {
	const best = pickCapacitor(wn, q, capacitors);
	if (!best) return null;
	return realize(wn, q, best.C, resistorSeries, { highPass: true, manual: false });
}

export function designTowThomasHighPassFromCap(wn, q, C, { resistorSeries = 'E24', capacitors = null } = {}) {
	return realize(wn, q, C, resistorSeries, { highPass: true, manual: true });
}

/**
 * The notch form. `wz` is the zero, `lowSide` says which gain is held at 1:
 * DC for a stage of a low-pass (wz above wn), infinity for a high-pass.
 */
function realizeNotch(wn, q, wz, C, { resistorSeries, capacitors, lowSide, manual }) {
	const { R: Rtarget, Rd: RdIdeal } = solveTowThomas(wn, q, C);
	const rInv = nearestResistor(TT_INVERTER_R, resistorSeries);
	const R = nearestResistor(Rtarget, resistorSeries);
	const Rd = nearestResistor(q * R, resistorSeries);
	const CinIdeal = lowSide ? C * (wn / wz) ** 2 : C;
	const Cin = lowSide ? nearestCapacitor(CinIdeal, capacitors) : C;
	// Rz solved against the parts actually used, so the zero lands where it should
	const RzTarget = 1 / (C * Cin * R * wz * wz);
	const Rz = nearestResistor(RzTarget, resistorSeries);
	const RzIdeal = lowSide ? Rtarget : Rtarget * (wn / wz) ** 2;
	const outOfRange = ![R, Rd, Rz].every((v) => v > TT_R_MIN && v < TT_R_MAX);
	return {
		topology: 'towThomasNotch',
		order: 2,
		lowSide,
		theoretical: { Cin: CinIdeal, Rz: RzIdeal, Ra: Rtarget, Rb: Rtarget, Rd: RdIdeal, C1: C, C2: C, r: rInv },
		components: { Cin, Rz, Ra: R, Rb: R, Rd, C1: C, C2: C, r: rInv },
		actual: { wn: 1 / (R * C), q: Rd / R, wz: 1 / Math.sqrt(C * Cin * R * Rz), gain: -Cin / C, dcGain: -R / Rz },
		steps: { C, Rtarget, RdIdeal, Rrounded: R, RdTarget: q * R, CinIdeal, RzTarget, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
}

/**
 * A notch stage from the automatic capacitor search. Elliptic stages have
 * high Qs and zeros close to the band edge, so a few percent of rounding
 * shows in the response: besides keeping R near 10 kilo-ohm, the search
 * weighs what rounding each part to stock would cost, f0 (R), Q (Rd), the
 * zero (Rz) and, on the low-pass side, the DC gain (Cin), and takes the
 * capacitor whose parts land closest.
 */
export function designTowThomasNotch(wn, q, wz, { lowSide = true, resistorSeries = 'E24', capacitors = null } = {}) {
	let best = null;
	for (const C of capacitorCandidates(capacitors)) {
		const { R } = solveTowThomas(wn, q, C);
		const Rr = nearestResistor(R, resistorSeries);
		const RdIdeal = q * Rr;
		const CinIdeal = lowSide ? C * (wn / wz) ** 2 : C;
		const Cin = lowSide ? nearestCapacitor(CinIdeal, capacitors) : C;
		const RzIdeal = 1 / (C * Cin * Rr * wz * wz);
		if (![R, RdIdeal, RzIdeal].every((v) => v > TT_R_MIN && v < TT_R_MAX)) continue;
		const err = (v, target) => Math.log(v / target) ** 2;
		const rounding =
			1000 * err(Rr, R) + 500 * err(nearestResistor(RdIdeal, resistorSeries), RdIdeal) + 250 * err(nearestResistor(RzIdeal, resistorSeries), RzIdeal) + 100 * err(Cin, CinIdeal);
		// a Cin of a few tens of picofarads would compete with the op-amp's own input capacitance
		const tinyCin = CinIdeal < TT_CIN_MIN ? Math.log(TT_CIN_MIN / CinIdeal) ** 2 : 0;
		const level = Math.log(R / TT_R_SWEET) ** 2 + 0.125 * (Math.log(RdIdeal / TT_R_SWEET) ** 2 + Math.log(RzIdeal / TT_R_SWEET) ** 2);
		const score = level + rounding + tinyCin;
		if (best === null || score < best.score) best = { C, score };
	}
	if (!best) return null;
	return realizeNotch(wn, q, wz, best.C, { resistorSeries, capacitors, lowSide, manual: false });
}

/** The same notch stage from a capacitor chosen by hand (the two integrator capacitors). */
export function designTowThomasNotchFromCap(wn, q, wz, C, { lowSide = true, resistorSeries = 'E24', capacitors = null } = {}) {
	return realizeNotch(wn, q, wz, C, { resistorSeries, capacitors, lowSide, manual: true });
}
