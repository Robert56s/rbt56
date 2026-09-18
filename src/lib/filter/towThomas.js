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
 */

const TT_R_MIN = 200;
const TT_R_MAX = 2_000_000;
const TT_R_SWEET = 10_000;
/** The inverter's two equal resistors: any equal value works, this matches the other stages' scale. */
export const TT_INVERTER_R = 10_000;

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
