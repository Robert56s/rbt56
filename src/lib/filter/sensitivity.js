/**
 * Sensitivity of Q to a 1% component error, S^Q_x = (x/Q)(dQ/dx): how many
 * percent Q moves for every 1% a single component is off by.
 *
 * Sallen-Key (unity-gain, equal-R simplified form): with R1, R2 free
 * (not yet set equal), Q = sqrt(Ctop/Cbottom) * sqrt(R1*R2)/(R1+R2). The
 * R1*R2/(R1+R2) factor is homogeneous of degree 0 and symmetric in R1,R2,
 * so at the design point R1=R2 its sensitivity to each vanishes exactly
 * (confirmed numerically by direct perturbation, not just symbolically):
 *   S_R1^Q = S_R2^Q = 0, S_Ctop^Q = +1/2, S_Cbottom^Q = -1/2.
 * A component tolerance on R barely moves Q at all for this topology -
 * the real practical limit at high Q is the capacitor ratio 4*Q^2 itself
 * getting impractically large, not resistor sensitivity.
 * MFB stays under 1/2 in magnitude for every component as long as no
 * resistor dominates:
 *   S_R1^Q = R2*R3 / (R1*R2 + R1*R3 + R2*R3),
 *   S_R2^Q = S_R3^Q are the same expression with R1 swapped in, minus 1/2,
 *   S_C1^Q = +1/2, S_C2^Q = -1/2.
 */

export const SALLEN_KEY_SENSITIVITY = { R1: 0, R2: 0, Ctop: 0.5, Cbottom: -0.5 };

/**
 * High-pass MFB (mfbHighPass.js): Q = sqrt(R2*C2*C3/R1) / (C1+C2+C3),
 * fixed constants throughout (unlike the low-pass MFB's, which depend on
 * the actual R values), from differentiating that with respect to each
 * component independently and evaluating at the design point C1=C2=C3:
 *   S_R1^Q = -1/2, S_R2^Q = +1/2 (R1, R2 only appear as sqrt(R2/R1))
 *   S_C1^Q = -1/3, S_C2^Q = S_C3^Q = +1/6 (C1 only appears in the sum on
 *   the bottom, C2 and C3 appear both there and under the square root)
 * These three capacitor sensitivities sum to exactly 0 - moving all three
 * together by the same percent leaves Q unchanged, as it should for a
 * ratio that is homogeneous of degree 0 in C1, C2, C3 - but real
 * capacitors drift independently, so each still contributes its own term
 * to the worst-case estimate below.
 */
export const MFB_HP_SENSITIVITY = { R1: -0.5, R2: 0.5, C1: -1 / 3, C2: 1 / 6, C3: 1 / 6 };

/**
 * High-pass Sallen-Key (sallenKeyHighPass.js), the R-C dual of the
 * low-pass circuit above: with C1, C2 free (not yet set equal),
 * Q = sqrt(Rbottom/Rtop) * sqrt(C1*C2)/(C1+C2). By the exact same
 * symmetry-plus-homogeneity argument as the low-pass case (just with R
 * and C swapped), the equal input capacitors' sensitivity vanishes at
 * the design point C1=C2, and the two resistors get the direct power-law
 * exponents from Q's sqrt(Rbottom/Rtop) factor:
 *   S_C1^Q = S_C2^Q = 0, S_Rbottom^Q = +1/2, S_Rtop^Q = -1/2.
 */
export const SALLEN_KEY_HP_SENSITIVITY = { C1: 0, C2: 0, Rbottom: 0.5, Rtop: -0.5 };

/**
 * Tow-Thomas biquad (towThomas.js): Q = Rd * sqrt(C1 / (C2 Ra Rb)), a plain
 * product of powers, so every sensitivity is a fixed exponent that does
 * not depend on Q or on the values:
 *   S_Rd^Q = +1, S_C1^Q = +1/2, S_C2^Q = -1/2, S_Ra^Q = S_Rb^Q = -1/2,
 * and the input element (R1, or Cin for the high-pass) and the inverter's
 * matched pair r do not enter Q at all. omega0 = 1/sqrt(C1 C2 Ra Rb) has
 * -1/2 for each of its four parts. Nothing here grows with Q, which is the
 * property that lets this topology reach Qs the one-op-amp stages cannot.
 */
export const TOW_THOMAS_SENSITIVITY = { R1: 0, Ra: -0.5, Rb: -0.5, Rd: 1, C1: 0.5, C2: -0.5 };
export const TOW_THOMAS_HP_SENSITIVITY = { Cin: 0, Ra: -0.5, Rb: -0.5, Rd: 1, C1: 0.5, C2: -0.5 };
/** The notch form: Cin and Rz only place the zeros (omega_z^2 = 1/(C Cin R Rz)), so Q is the same product. */
export const TOW_THOMAS_NOTCH_SENSITIVITY = { Cin: 0, Rz: 0, Ra: -0.5, Rb: -0.5, Rd: 1, C1: 0.5, C2: -0.5 };

export function mfbSensitivity({ R1, R2, R3 }) {
	const sum = R1 * R2 + R1 * R3 + R2 * R3;
	return {
		R1: (R2 * R3) / sum,
		R2: (R1 * R3) / sum - 0.5,
		R3: (R1 * R2) / sum - 0.5,
		C1: 0.5,
		C2: -0.5
	};
}

/**
 * The Tow-Thomas band-pass (towThomasBp in towThomas.js) is the same loop
 * read at A1's output: R1 only sets the gain, so Q has the same exponents.
 */
export const TOW_THOMAS_BP_SENSITIVITY = { R1: 0, Ra: -0.5, Rb: -0.5, Rd: 1, C1: 0.5, C2: -0.5 };

/**
 * MFB band-pass (mfbBandPass.js): Q = sqrt(G R3 C1 C2) / (C1 + C2), with
 * G = G1 + G2 the two conductances from node A to the input and to ground.
 * R3 sits under the square root alone, R1 and R2 share G in proportion to
 * their conductance, and the capacitors cancel when they are equal:
 *   S_R3^Q = +1/2,  S_R1^Q = -(1/2) G1/G,  S_R2^Q = -(1/2) G2/G,
 *   S_C1^Q = (C2 - C1) / (2 (C1 + C2)),  S_C2^Q = (C1 - C2) / (2 (C1 + C2)).
 */
export function mfbBpSensitivity({ R1, R2, R3, C1, C2 }) {
	const G1 = 1 / R1;
	const G2 = 1 / R2;
	const G = G1 + G2;
	return {
		R1: (-0.5 * G1) / G,
		R2: (-0.5 * G2) / G,
		R3: 0.5,
		C1: (C2 - C1) / (2 * (C1 + C2)),
		C2: (C1 - C2) / (2 * (C1 + C2))
	};
}

/** Worst-case %error on Q from a component tolerance, root-sum-of-squares. */
export function worstCaseQError(sensitivities, tolerancePercent) {
	const sum = Object.values(sensitivities).reduce((acc, s) => acc + (s * tolerancePercent) ** 2, 0);
	return Math.sqrt(sum);
}

/*
 * The narrow band-pass stages (rlcBandPass.js, sallenKeyBandPass.js,
 * khnBandPass.js): S^Q_x = x dQ/(Q dx) for each part, from the exact
 * expressions of each designer, for any parts (equal or not). A part a
 * stage does not have (Rb with no input divider) is left out.
 */

/**
 * Sallen-Key band-pass: Q = omega0 / a with
 *   omega0^2 = (G1 + G3) / (C1 C2 R2),   a = (G1 + (1 - K) G3)/C1 + 1/(C2 R2) + 1/(C1 R2),
 * G1 = 1/Ra (+ 1/Rb), G3 = 1/R3, K = 1 + Rf/Rg. Rf and Rg act through K:
 * S_Rf = -S_Rg = (Rf/Rg) G3 / (C1 a), which is (K - 1)/(4 - K) with equal
 * parts, the largest of all.
 */
export function sallenKeyBpSensitivity({ Ra, Rb, C1, C2, R2, R3, Rf, Rg }) {
	const Ga = 1 / Ra;
	const Gb = Number.isFinite(Rb) && Rb > 0 ? 1 / Rb : 0;
	const G1 = Ga + Gb;
	const G3 = 1 / R3;
	const K = 1 + Rf / Rg;
	const a = (G1 + (1 - K) * G3) / C1 + 1 / (C2 * R2) + 1 / (C1 * R2);
	const s = {
		Ra: (-0.5 * Ga) / (G1 + G3) + Ga / (C1 * a),
		...(Gb ? { Rb: (-0.5 * Gb) / (G1 + G3) + Gb / (C1 * a) } : {}),
		C1: -0.5 + ((G1 + (1 - K) * G3) / C1 + 1 / (C1 * R2)) / a,
		C2: -0.5 + 1 / (C2 * R2 * a),
		R2: -0.5 + (1 / (C2 * R2) + 1 / (C1 * R2)) / a,
		R3: (-0.5 * G3) / (G1 + G3) + ((1 - K) * G3) / (C1 * a),
		Rf: ((Rf / Rg) * G3) / (C1 * a),
		Rg: -((Rf / Rg) * G3) / (C1 * a)
	};
	return s;
}

/**
 * State-variable band-pass: Q = p / D sqrt(R1 R4 C1 / (R2 R7 C2)), p = 1 + R5/R6,
 * D = 1 + R4/R3 + R4/R7. Every exponent stays at or under 1: R5 and R6 carry
 * (p - 1)/p, the most.
 */
export function khnBpSensitivity({ R1, R2, R3, R4, R5, R6, R7 }) {
	const p = 1 + R5 / R6;
	const D = 1 + R4 / R3 + R4 / R7;
	return {
		R1: 0.5,
		R2: -0.5,
		R3: R4 / R3 / D,
		R4: 0.5 - (R4 / R3 + R4 / R7) / D,
		R5: (R5 / R6) / p,
		R6: -(R5 / R6) / p,
		R7: -0.5 + R4 / R7 / D,
		C1: 0.5,
		C2: -0.5
	};
}

/**
 * RLC with Antoniou's GIC: Q = R sqrt(C / L), R = Ra || Rb, L = Cg R1 R3 R4 / R2,
 * plain exponents: the input resistors share 1, the tank capacitor 1/2,
 * the converter's parts 1/2 each.
 */
export function rlcGicSensitivity({ Ra, Rb }) {
	const divided = Number.isFinite(Rb) && Rb > 0;
	return {
		Ra: divided ? Rb / (Ra + Rb) : 1,
		...(divided ? { Rb: Ra / (Ra + Rb) } : {}),
		C: 0.5,
		Cg: -0.5,
		R1: -0.5,
		R2: 0.5,
		R3: -0.5,
		R4: -0.5
	};
}

/**
 * RLC with a gyrator: Q = omega0 / a with
 *   omega0^2 = (g + 1/R1) h / (C Cg),   a = g/C + h/C + h/Cg,
 * g = 1/Ra (+ 1/Rb), h = 1/R2.
 */
export function rlcGyratorSensitivity({ Ra, Rb, C, R1, R2, Cg }) {
	const Ga = 1 / Ra;
	const Gb = Number.isFinite(Rb) && Rb > 0 ? 1 / Rb : 0;
	const g = Ga + Gb;
	const G1 = 1 / R1;
	const h = 1 / R2;
	const a = g / C + h / C + h / Cg;
	return {
		Ra: (-0.5 * Ga) / (g + G1) + Ga / (C * a),
		...(Gb ? { Rb: (-0.5 * Gb) / (g + G1) + Gb / (C * a) } : {}),
		C: -0.5 + (g / C + h / C) / a,
		R1: (-0.5 * G1) / (g + G1),
		R2: -0.5 + (h / C + h / Cg) / a,
		Cg: -0.5 + h / Cg / a
	};
}
