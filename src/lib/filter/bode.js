/**
 * Frequency response of a cascade of realized stages, evaluated from the
 * actual (rounded) component values rather than the ideal design targets:
 * this is what actually shows up on the bench.
 */

/** Complex response H(j*2*pi*f) of the full cascade at one frequency. */
export function responseAt(stages, freqHz) {
	const s = { re: 0, im: 2 * Math.PI * freqHz };
	return cascadeAt(stages, s);
}

function cascadeAt(stages, s) {
	let re = 1;
	let im = 0;
	for (const stage of stages) {
		const h = stageGainComplex(stage, s);
		const nre = re * h.re - im * h.im;
		const nim = re * h.im + im * h.re;
		re = nre;
		im = nim;
	}
	return { re, im };
}

/**
 * Complex response of a band-stop built from two branches summed by a
 * unity-gain inverting summing amplifier (see buildSummingAmpDiagram in
 * circuits.js): a low-pass branch and a high-pass branch, each its own
 * independent cascade, added together rather than multiplied in series.
 * branches is an array of stage-arrays, e.g. [lpStages, hpStages].
 */
export function responseAtParallelSum(branches, freqHz) {
	const s = { re: 0, im: 2 * Math.PI * freqHz };
	let re = 0;
	let im = 0;
	for (const branch of branches) {
		const h = cascadeAt(branch, s);
		re += h.re;
		im += h.im;
	}
	return { re, im };
}

function stageGainComplex(stage, s) {
	// s = j*omega only (s.re is always 0 here), kept generic for clarity.
	// High-pass stages (topology name ends in "Hp") have a numerator that
	// scales with s (first order) or s^2 (second order) instead of being
	// constant, since H(0) = 0 and H(infinity) is what is finite.
	const isHp = stage.topology?.endsWith('Hp');

	if (stage.order === 1) {
		const tau = stage.actual.tau;
		if (isHp) {
			// H(s) = tau*s / (tau*s + 1), s purely imaginary.
			return complexDivide({ re: 0, im: tau * s.im }, { re: 1, im: tau * s.im });
		}
		// s purely imaginary, so tau*s + 1 = 1 + j*tau*omega.
		return complexDivide({ re: 1, im: 0 }, { re: 1, im: tau * s.im });
	}
	const wn = stage.actual.wn;
	const q = stage.actual.q;
	const gain = stage.actual.gain ?? 1;
	// s^2 = -omega^2 (real), (wn/q)*s = j*(wn/q)*omega (imaginary)
	const den = { re: wn * wn - s.im * s.im, im: (wn / q) * s.im };
	const num = isHp
		? { re: -gain * s.im * s.im, im: 0 } // gain * s^2, s^2 = -omega^2
		: { re: gain * wn * wn, im: 0 };
	return complexDivide(num, den);
}

function complexDivide(a, b) {
	const denom = b.re * b.re + b.im * b.im;
	return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
}

/** Magnitude in dB and phase in degrees at one frequency. */
export function magnitudePhaseAt(stages, freqHz) {
	const { re, im } = responseAt(stages, freqHz);
	const mag = Math.sqrt(re * re + im * im);
	return { db: 20 * Math.log10(Math.max(mag, 1e-12)), deg: (Math.atan2(im, re) * 180) / Math.PI };
}

/** A log-spaced sweep of {freq, db, deg} points from fMin to fMax. */
export function sweep(stages, fMin, fMax, points = 200) {
	const out = [];
	const logMin = Math.log10(fMin);
	const logMax = Math.log10(fMax);
	for (let i = 0; i < points; i++) {
		const freq = points === 1 ? fMin : 10 ** (logMin + ((logMax - logMin) * i) / (points - 1));
		out.push({ freq, ...magnitudePhaseAt(stages, freq) });
	}
	return out;
}

/** Magnitude in dB and phase in degrees, for the parallel-sum (band-stop) response. */
export function magnitudePhaseAtParallelSum(branches, freqHz) {
	const { re, im } = responseAtParallelSum(branches, freqHz);
	const mag = Math.sqrt(re * re + im * im);
	return { db: 20 * Math.log10(Math.max(mag, 1e-12)), deg: (Math.atan2(im, re) * 180) / Math.PI };
}

/** A log-spaced sweep of the parallel-sum (band-stop) response from fMin to fMax. */
export function sweepParallelSum(branches, fMin, fMax, points = 200) {
	const out = [];
	const logMin = Math.log10(fMin);
	const logMax = Math.log10(fMax);
	for (let i = 0; i < points; i++) {
		const freq = points === 1 ? fMin : 10 ** (logMin + ((logMax - logMin) * i) / (points - 1));
		out.push({ freq, ...magnitudePhaseAtParallelSum(branches, freq) });
	}
	return out;
}
