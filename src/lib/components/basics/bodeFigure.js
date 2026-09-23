/**
 * Shared pieces of the filter tool's beginner figures: a log frequency
 * grid, the labels the readouts use, the frame the Bode figures share, and
 * the two forbidden zones a specification draws on a Bode plot.
 */

export const AMBER = 'var(--amber, #b7791f)';

/** n frequencies spaced evenly on a log axis, x0 to x1. */
export function logSpace(x0, x1, n = 240) {
	const out = new Array(n);
	const span = Math.log(x1 / x0);
	for (let i = 0; i < n; i++) out[i] = x0 * Math.exp((span * i) / (n - 1));
	return out;
}

/** Three significant figures with a unit: 10.0 kHz, 350 Hz, 1.20 MHz. */
export function hzText(f) {
	if (!Number.isFinite(f) || f <= 0) return '';
	const r = Number(f.toPrecision(3));
	if (r >= 1e6) return `${(r / 1e6).toPrecision(3)} MHz`;
	if (r >= 1e3) return `${(r / 1e3).toPrecision(3)} kHz`;
	return `${r.toPrecision(3)} Hz`;
}

/** A dB figure at a fixed number of decimals, never written -0.0. */
export function dbText(x, digits = 1) {
	if (!Number.isFinite(x)) return '';
	const s = x.toFixed(digits);
	return Number(s) === 0 ? (0).toFixed(digits) : s;
}

/** A spec number the way it was typed: 3, 0.5, 40. */
export function plain(x) {
	return Number.isFinite(x) ? String(Number(x.toPrecision(6))) : '';
}

/** A linear gain as a percentage of the input: 100, 12.5, 0.04, under 0.01. */
export function pctText(gain) {
	const p = 100 * gain;
	if (!Number.isFinite(p)) return '';
	if (p >= 10) return p.toFixed(0);
	if (p >= 1) return p.toFixed(1);
	if (p >= 0.01) return p.toFixed(2);
	// deep in a stopband the figure would otherwise print 1e-10
	return 'under 0.01';
}

/**
 * The frequency window of the Bode figures, the one panel 05 uses (fp/50
 * to 10 fs), widened when needed so that both edges and the range of the
 * fs slider stay inside it.
 */
export function specFrame(kind, fp, fs) {
	if (kind === 'highpass') return { x0: Math.min(fp / 50, fs / 10), x1: Math.max(fs * 10, fp * 3) };
	return { x0: fp / 50, x1: Math.max(fs * 10, fp * 25) };
}

/** The bottom of the dB axis: -60, or lower when Amin reaches past it. */
export function frameBottom(aminDb) {
	return Math.min(-60, -10 * Math.ceil((aminDb + 10) / 10));
}

/**
 * The spec as two forbidden zones on a dB against log frequency frame.
 * Low-pass: below -Amax up to fp (the passband may not sag that far) and
 * above -Amin from fs on (the stopband must be at least that far down).
 * High-pass: the mirror image. Returns the shaded boxes, the dashed edges
 * (a vertical at each edge, a horizontal at each limit) and a test for a
 * point inside either zone, which the figures use to draw the curve red.
 */
export function specZones({ kind, fp, fs, amaxDb, aminDb, x0, x1, yMin, yMax }) {
	const high = kind === 'highpass';
	const boxes = [
		high ? { x0: fp, x1, y0: yMin, y1: -amaxDb, color: AMBER } : { x0, x1: fp, y0: yMin, y1: -amaxDb, color: AMBER },
		high ? { x0, x1: fs, y0: -aminDb, y1: yMax, color: AMBER } : { x0: fs, x1, y0: -aminDb, y1: yMax, color: AMBER }
	];
	// a curve that lands exactly on a limit is on spec, not in the zone
	const tol = 1e-6;
	const inPass = (f, db) => (high ? f >= fp : f <= fp) && db < -amaxDb - tol;
	const inStop = (f, db) => (high ? f <= fs : f >= fs) && db > -aminDb + tol;
	return {
		boxes,
		inZone: (f, db) => inPass(f, db) || inStop(f, db),
		markers: [
			{ x: fp, label: 'fp', color: AMBER },
			{ x: fs, label: 'fs', color: AMBER }
		],
		hlines: [
			{ y: -amaxDb, label: `-${plain(amaxDb)} dB`, color: AMBER },
			{ y: -aminDb, label: `-${plain(aminDb)} dB`, color: AMBER }
		]
	};
}
