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
export function responseAtParallelSum(branches, freqHz, signs = null) {
	const s = { re: 0, im: 2 * Math.PI * freqHz };
	let re = 0;
	let im = 0;
	branches.forEach((branch, i) => {
		// signs: +1 for an input the combiner adds, -1 for one it subtracts
		// (a difference amplifier is used when the two branches come out with
		// opposite signs, so that they still reinforce in the stopband)
		const k = signs ? signs[i] : 1;
		const h = cascadeAt(branch, s);
		re += k * h.re;
		im += k * h.im;
	});
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
	if (Number.isFinite(stage.actual.wz)) {
		// a notch stage: gain * (s^2 + wz^2), gain being the value far above the zero
		const wz = stage.actual.wz;
		return complexDivide({ re: gain * (wz * wz - s.im * s.im), im: 0 }, den);
	}
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
export function magnitudePhaseAtParallelSum(branches, freqHz, signs = null) {
	const { re, im } = responseAtParallelSum(branches, freqHz, signs);
	const mag = Math.sqrt(re * re + im * im);
	return { db: 20 * Math.log10(Math.max(mag, 1e-12)), deg: (Math.atan2(im, re) * 180) / Math.PI };
}

/** A log-spaced sweep of the parallel-sum (band-stop) response from fMin to fMax. */
export function sweepParallelSum(branches, fMin, fMax, points = 200, signs = null) {
	const out = [];
	const logMin = Math.log10(fMin);
	const logMax = Math.log10(fMax);
	for (let i = 0; i < points; i++) {
		const freq = points === 1 ? fMin : 10 ** (logMin + ((logMax - logMin) * i) / (points - 1));
		out.push({ freq, ...magnitudePhaseAtParallelSum(branches, freq, signs) });
	}
	return out;
}

/** Net sign of a branch's passband gain: the product of its stages' gains (+1 non-inverting, -1 inverting). */
export function branchSign(stages) {
	return stages.reduce((s, stage) => s * Math.sign(stage.actual?.gain ?? 1), 1);
}

/** Total order of a branch: the sum of its stages' orders. */
export function branchOrder(stages) {
	return stages.reduce((n, stage) => n + (stage.order ?? 2), 0);
}

/**
 * Which sign the band-stop combiner should give each branch, and why.
 * Deep in the stopband each branch is down to its tail: the low-pass tail
 * falls like 1/s^n (phase -n*90 degrees), the high-pass tail rises like
 * s^m (+m*90 degrees), each carrying its branch's passband sign. At the
 * centre of the notch the two tails are comparable in size, and the notch
 * is deepest when they arrive in antiphase and cancel. Whether a plain sum
 * or a difference does that depends on the two orders and signs, and on
 * how far the realized poles sit from their asymptotes, so rather than
 * trust a rule of thumb both options are evaluated with the realized
 * stages at the centre of the stopband and the deeper notch wins (a tie
 * goes to the plain sum). Returns { mode, signs, centreHz, sumDb,
 * differenceDb }, depths as positive dB of attenuation.
 */
export function combinerChoice(branches, fsl, fsh) {
	const centreHz = Math.sqrt(fsl * fsh);
	const depth = (signs) => -magnitudePhaseAtParallelSum(branches, centreHz, signs).db;
	const sumDb = depth([1, 1]);
	const differenceDb = depth([-1, 1]);
	const mode = differenceDb > sumDb + 1e-9 ? 'difference' : 'sum';
	return { mode, signs: mode === 'difference' ? [-1, 1] : [1, 1], centreHz, sumDb, differenceDb };
}

export function combinerSigns(branches, fsl, fsh) {
	return combinerChoice(branches, fsl, fsh).signs;
}

/** Gain of a branch at DC (its real value, sign included): 1 or -1 unless a notch stage's rounded Cin moved it. */
export function branchDcGain(stages) {
	return responseAt(stages, 0).re;
}

/**
 * The combiner's resistors and the weights it gives each branch, for a
 * low-pass branch whose passband gain is lpGain in size (1 for every stage
 * but a low-pass notch, whose DC gain follows a rounded capacitor ratio).
 * With lpGain = 1 every resistor is R. Otherwise the low-pass input
 * resistor is scaled by lpGain (rounded with `round`), so both passbands
 * still come out at the same level:
 *   sum         Vout = -(RCF/RCA V_lp + RCF/RCB V_hp)
 *   difference  Vout = (1 + RCF/RCL) RCG/(RCH + RCG) V_hp - (RCF/RCL) V_lp
 * The weights are what the band-stop response multiplies each branch by
 * (the sum's overall inversion left out, as for the signs above).
 */
export function combinerDesign(mode, R, lpGain = 1, round = (v) => v) {
	const scaled = Math.abs(lpGain - 1) < 1e-9 ? R : round(R * lpGain);
	if (mode === 'difference') {
		const r = { RCH: R, RCG: scaled, RCL: scaled, RCF: R };
		return { mode, resistors: r, weights: [-(r.RCF / r.RCL), (1 + r.RCF / r.RCL) * (r.RCG / (r.RCH + r.RCG))] };
	}
	const r = { RCA: scaled, RCB: R, RCF: R };
	return { mode, resistors: r, weights: [r.RCF / r.RCA, r.RCF / r.RCB] };
}
