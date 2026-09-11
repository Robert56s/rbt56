/**
 * Filter order and normalized pole calculations, low-pass only.
 *
 * Standard active-filter design convention: a passband edge fp with at most
 * Amax dB of attenuation, a stopband edge fs (fs > fp) with at least Amin
 * dB, and a transition ratio k = fp / fs.
 */

/** Transition ratio k = fp / fs, both in Hz (k < 1 for a low-pass). */
export function transitionRatio(fp, fs) {
	return fp / fs;
}

/** Minimum Butterworth order meeting the Amax/Amin/k specification. */
export function butterworthOrder(amaxDb, aminDb, k) {
	const num = Math.log10((10 ** (aminDb / 10) - 1) / (10 ** (amaxDb / 10) - 1));
	const den = 2 * Math.log10(1 / k);
	return num / den;
}

/** Minimum Chebyshev order meeting the Amax/Amin/k specification. */
export function chebyshevOrder(amaxDb, aminDb, k) {
	const ratio = (10 ** (aminDb / 10) - 1) / (10 ** (amaxDb / 10) - 1);
	return Math.acosh(Math.sqrt(ratio)) / Math.acosh(1 / k);
}

/**
 * Normalized (omega_c = 1 rad/s) low-pass prototype, shared by Butterworth
 * and Chebyshev: poles at angle theta_i = (2i+1)pi/(2n) on an ellipse with
 * half-axes sh (imaginary) and ch (real). Butterworth is the sh = ch = 1
 * case, i.e. poles on the unit circle.
 *
 * Returns pairs of second-order stages s^2 + a*s + b, plus a first-order
 * real-pole stage (s/breal + 1) when n is odd. Verified against published
 * reference tables: n=4 Butterworth gives Q = 0.5412 and 1.3066, n=4
 * Chebyshev 0.5 dB gives (a,b) = (0.350706, 1.063519) and
 * (0.846680, 0.356412).
 */
function envelopeStages(n, sh, ch) {
	const pairs = Math.floor(n / 2);
	const stages = [];
	for (let i = 0; i < pairs; i++) {
		const theta = ((2 * i + 1) * Math.PI) / (2 * n);
		const sigma = -sh * Math.sin(theta);
		const omega = ch * Math.cos(theta);
		stages.push({ i, theta, sigma, omega, a: -2 * sigma, b: sigma * sigma + omega * omega });
	}
	const real = n % 2 === 1 ? { breal: sh } : null;
	return { stages, real, sh, ch };
}

/** Normalized Butterworth low-pass stages for order n. */
export function butterworthStages(n) {
	return envelopeStages(n, 1, 1);
}

/**
 * Normalized Chebyshev type I low-pass stages for order n, ripple amaxDb.
 * Also returns epsilon and beta, the two quantities the ripple spec gets
 * turned into before the poles can be placed (see chebyshevStages' own
 * derivation in the UI's "show the math" panel).
 */
export function chebyshevStages(n, amaxDb) {
	const eps = Math.sqrt(10 ** (amaxDb / 10) - 1);
	const beta = Math.asinh(1 / eps) / n;
	return { ...envelopeStages(n, Math.sinh(beta), Math.cosh(beta)), eps, beta };
}
