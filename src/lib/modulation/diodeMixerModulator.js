import { nearestInSeries, SERIES } from './eseries';

/**
 * Diode + resonant tank AM modulator: sum the carrier and the modulating
 * signal (plus a DC bias), pass the sum through a diode, and select the
 * carrier-plus-sidebands cluster with a parallel RLC tank tuned to the
 * carrier frequency.
 *
 * Why this produces an AM-like signal: a diode's current is a nonlinear
 * (exponential) function of its voltage. Expanding that nonlinearity as a
 * Taylor/power series in the small-signal regime, i(v) ~= a*v + b*v^2 + ...,
 * and substituting v(t) = Vdc + Ap*cos(wp t) + Am*cos(wm t) into the
 * quadratic term gives a cross-product 2*b*Ap*Am*cos(wp t)*cos(wm t), which
 * is exactly the sum/difference-frequency product cos((wp+wm)t) and
 * cos((wp-wm)t) that a real multiplier would produce - alongside the
 * unwanted a*v linear term (carrier and modulating tone, un-mixed) and the
 * b*v^2 second-harmonic terms (2*wp, 2*wm, and a DC shift). The resonant
 * tank, tuned to wp with just enough bandwidth to admit wp +- wm, keeps the
 * carrier and its first-order sidebands and rejects everything else.
 *
 * Tank design: f0 = 1/(2*pi*sqrt(L*C)), and for a parallel RLC,
 * Q = R*sqrt(C/L) = w0*R*C, bandwidth BW = f0/Q. Choosing
 * BW = 2 * sidebandMargin * fmMax keeps the tank wide enough to pass the
 * fp +- fmMax sidebands with sidebandMargin >= 1 of headroom.
 */
export function designDiodeMixerModulator({
	fp,
	fmMax,
	sidebandMargin = 1.2,
	carrierAmplitude,
	modAmplitude,
	diodeVf = 0.7,
	biasMargin = 0.3,
	inductance = 1e-3,
	resistorSeries = 'E24'
} = {}) {
	if (!(fp > 0) || !(fmMax > 0) || !(inductance > 0)) return null;

	const w0 = 2 * Math.PI * fp;
	const bandwidth = 2 * sidebandMargin * fmMax;
	const q = fp / bandwidth;

	const cTarget = 1 / (w0 * w0 * inductance);
	const capSeries = [1, 1.5, 2.2, 3.3, 4.7, 6.8];
	const cCandidates = [];
	for (let dec = -9; dec <= -6; dec++) for (const m of capSeries) cCandidates.push(m * 10 ** dec);
	const c = cCandidates.reduce((best, v) =>
		Math.abs(Math.log(v / cTarget)) < Math.abs(Math.log(best / cTarget)) ? v : best
	);
	const f0Actual = 1 / (2 * Math.PI * Math.sqrt(inductance * c));

	const rTarget = q / (w0 * c);
	const series = SERIES[resistorSeries];
	const r = nearestInSeries(rTarget, series);
	const qActual = w0 * r * c;
	const bwActual = f0Actual / qActual;

	// Bias: the summer output (carrier + modulating + DC) must stay above
	// the diode's forward threshold at all times, with margin.
	const requiredBias =
		Number.isFinite(carrierAmplitude) && Number.isFinite(modAmplitude)
			? carrierAmplitude + modAmplitude + diodeVf + biasMargin
			: null;

	return {
		fp,
		fmMax,
		sidebandMargin,
		bandwidth,
		q,
		inductance,
		capacitance: c,
		resistance: r,
		f0Actual,
		qActual,
		bwActual,
		requiredBias,
		diodeVf
	};
}
