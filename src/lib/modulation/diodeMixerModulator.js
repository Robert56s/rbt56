import { nearestInSeries, SERIES, seriesValues } from './eseries';

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
 * Q = R*sqrt(C/L) = w0*R*C, bandwidth BW = f0/Q = 1/(2*pi*R*C). Choosing
 * BW = 2 * sidebandMargin * fmMax keeps the tank wide enough to pass the
 * fp +- fmMax sidebands with sidebandMargin >= 1 of headroom.
 *
 * The tank has to sit on the carrier: a single E6 capacitor can miss it
 * by several percent (15 nF with 1 mH rings at 41.1 kHz for a 40 kHz
 * carrier), which moves the band by more than the margin and drops one
 * sideband. So C is a parallel pair of E12 values, a main part topped up
 * by a smaller one (or a single part when it is close enough), which
 * lands within 0.2 percent on average and 0.9 percent at worst. R then
 * follows from the bandwidth directly, R = 1/(2*pi*BW*C), with the band
 * widened by what detuning is left, and Q is quoted at the tank's own f0.
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
	// a main E12 capacitor with a smaller E12 one in parallel (or none): the
	// pair closest to the target, preferring the single part on a tie
	const mains = seriesValues(SERIES.E12, -12, -6).filter((v) => v <= cTarget * 1.0005);
	const trims = [0, ...seriesValues(SERIES.E12, -12, -6)];
	let best = null;
	for (const c1 of mains.length ? mains : [1e-12]) {
		for (const c2 of trims) {
			if (c2 > c1) break;
			const total = c1 + c2;
			const err = Math.abs(Math.log(total / cTarget));
			if (!best || err < best.err - 1e-9) best = { c1, c2, err };
		}
	}
	const capacitors = best.c2 > 0 ? [best.c1, best.c2] : [best.c1];
	const c = best.c1 + best.c2;
	const f0Actual = 1 / (2 * Math.PI * Math.sqrt(inductance * c));

	// R from the bandwidth: BW = 1/(2 pi R C) for a parallel tank. The band
	// is widened by whatever detuning the capacitor pair left, so both
	// sidebands keep the margin asked for, and R is rounded down in its
	// series (a smaller R is a wider band, never a narrower one)
	const detuning = f0Actual - fp;
	const bandwidthNeeded = bandwidth + 2 * Math.abs(detuning);
	const rTarget = 1 / (2 * Math.PI * bandwidthNeeded * c);
	const series = SERIES[resistorSeries];
	const below = seriesValues(series, 0, 7).filter((v) => v <= rTarget * (1 + 1e-9));
	const r = below.length ? below[below.length - 1] : nearestInSeries(rTarget, series);
	const qActual = r * Math.sqrt(c / inductance);
	const bwActual = 1 / (2 * Math.PI * r * c);
	// do both sidebands sit inside the half-power band of the real tank?
	const bandLow = f0Actual - bwActual / 2;
	const bandHigh = f0Actual + bwActual / 2;
	const slack = 1e-9 * fp;
	const sidebandsInBand = fp - fmMax >= bandLow - slack && fp + fmMax <= bandHigh + slack;

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
		capacitors,
		cTarget,
		resistance: r,
		rTarget,
		detuning,
		bandwidthNeeded,
		f0Actual,
		qActual,
		bwActual,
		bandLow,
		bandHigh,
		sidebandsInBand,
		requiredBias,
		diodeVf
	};
}
