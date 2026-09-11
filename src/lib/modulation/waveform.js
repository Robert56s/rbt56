/**
 * Time-domain sample generators for the preview plots. All return
 * { t: Float64Array, y: Float64Array } pairs over [0, duration] at n
 * samples, evaluated directly from the closed-form expressions (not a
 * discretized simulation), so a fast carrier next to a slow envelope stays
 * accurate regardless of how few samples are drawn.
 */
function series(duration, n) {
	const t = new Float64Array(n);
	for (let i = 0; i < n; i++) t[i] = (duration * i) / (n - 1);
	return t;
}

export function carrier(fp, ap, duration, n = 2000) {
	const t = series(duration, n);
	const y = new Float64Array(n);
	for (let i = 0; i < n; i++) y[i] = ap * Math.cos(2 * Math.PI * fp * t[i]);
	return { t, y };
}

export function modulating(fm, am, duration, n = 2000) {
	const t = series(duration, n);
	const y = new Float64Array(n);
	for (let i = 0; i < n; i++) y[i] = am * Math.cos(2 * Math.PI * fm * t[i]);
	return { t, y };
}

/** Standard AM signal Ap*(1 + n*cos(wm t))*cos(wp t). */
export function amSignal(fp, fm, ap, n, duration, samples = 4000) {
	const t = series(duration, samples);
	const y = new Float64Array(samples);
	for (let i = 0; i < samples; i++) {
		y[i] = ap * (1 + n * Math.cos(2 * Math.PI * fm * t[i])) * Math.cos(2 * Math.PI * fp * t[i]);
	}
	return { t, y };
}

export function envelope(fm, ap, n, duration, samples = 4000, sign = 1) {
	const t = series(duration, samples);
	const y = new Float64Array(samples);
	for (let i = 0; i < samples; i++) y[i] = sign * ap * (1 + n * Math.cos(2 * Math.PI * fm * t[i]));
	return { t, y };
}

export function rectify(signal, mode) {
	const y = new Float64Array(signal.y.length);
	for (let i = 0; i < y.length; i++) {
		const v = signal.y[i];
		y[i] = mode === 'full' ? Math.abs(v) : Math.max(v, 0);
	}
	return { t: signal.t, y };
}
