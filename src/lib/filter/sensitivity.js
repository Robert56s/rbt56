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

/** Worst-case %error on Q from a component tolerance, root-sum-of-squares. */
export function worstCaseQError(sensitivities, tolerancePercent) {
	const sum = Object.values(sensitivities).reduce((acc, s) => acc + (s * tolerancePercent) ** 2, 0);
	return Math.sqrt(sum);
}
