/**
 * Frequency sweeps for checking a filter with the signal generator: the
 * list of frequencies a stepped sweep holds one after the other, and the
 * reading of a measured response (gain, -3 dB points).
 *
 * The steps of a log sweep are preferred numbers rather than exact powers:
 * a multimeter reading is written down next to "630 Hz", not "631.0 Hz".
 * 3 per decade is the 1-2-5 sequence, 5, 10 and 20 the Renard series R5,
 * R10, R20 (ISO 3), which split each decade into nearly equal ratios.
 */

const SERIES = {
	3: [1, 2, 5],
	5: [1, 1.6, 2.5, 4, 6.3],
	10: [1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8],
	20: [1, 1.12, 1.25, 1.4, 1.6, 1.8, 2, 2.24, 2.5, 2.8, 3.15, 3.55, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9]
};

export const STEPS_PER_DECADE = Object.keys(SERIES).map(Number);

/** At most this many steps, so a typo in the range cannot lock the page in a sweep of thousands. */
export const MAX_STEPS = 400;

const tidy = (f) => Number(f.toPrecision(6));

/**
 * The frequencies of a stepped sweep, low to high, both ends included.
 *   spacing 'log': `perDecade` values per decade from the series above
 *   spacing 'linear': every `step` hertz
 * Returns [] for a range that makes no sense.
 */
export function sweepSteps({ from, to, spacing = 'log', perDecade = 10, step = 100 }) {
	let lo = Number(from);
	let hi = Number(to);
	if (!(lo > 0) || !(hi > 0)) return [];
	if (lo > hi) [lo, hi] = [hi, lo];
	const out = [];
	if (spacing === 'linear') {
		const s = Number(step);
		if (!(s > 0)) return [];
		for (let f = lo; f < hi * (1 + 1e-9) && out.length < MAX_STEPS; f += s) out.push(tidy(f));
	} else {
		const series = SERIES[perDecade] ?? SERIES[10];
		out.push(tidy(lo));
		for (let d = Math.floor(Math.log10(lo)) - 1; d <= Math.ceil(Math.log10(hi)) && out.length < MAX_STEPS; d++) {
			for (const m of series) {
				const f = tidy(m * 10 ** d);
				if (f > lo * (1 + 1e-6) && f < hi * (1 - 1e-6)) out.push(f);
			}
		}
		out.push(tidy(hi));
	}
	if (out[out.length - 1] < hi * (1 - 1e-6) && out.length < MAX_STEPS) out.push(tidy(hi));
	return [...new Set(out)].sort((a, b) => a - b).slice(0, MAX_STEPS);
}

/** 20 log10(out / in), or null when a reading is missing. */
export function gainDb(vin, vout) {
	const a = Number(vin);
	const b = Number(vout);
	if (!(a > 0) || !(b > 0)) return null;
	return 20 * Math.log10(b / a);
}

/**
 * The response measured so far: each step with a gain, the largest gain
 * (the passband), and where the curve crosses 3 dB under it, found by
 * interpolating on a log frequency axis between the two readings either
 * side. `reference` is the input reading used where a step has none: a
 * generator and a sound card are flat enough that one input reading can
 * stand for all, when the meter is too.
 *   rows   [{ f, vin, vout }]
 * Returns { points: [{ f, db }], peak, peakF, crossings: [{ f, rising }] }.
 */
export function readResponse(rows, reference = null) {
	const points = [];
	for (const r of rows) {
		const vin = Number(r.vin) > 0 ? r.vin : reference;
		const db = gainDb(vin, r.vout);
		if (db !== null) points.push({ f: r.f, db });
	}
	if (!points.length) return { points, peak: null, peakF: null, crossings: [] };
	let peak = -Infinity;
	let peakF = null;
	for (const p of points) {
		if (p.db > peak) {
			peak = p.db;
			peakF = p.f;
		}
	}
	const level = peak - 3;
	const crossings = [];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if ((a.db - level) * (b.db - level) >= 0 || a.db === b.db) continue;
		const u = (level - a.db) / (b.db - a.db);
		const f = Math.exp(Math.log(a.f) + u * (Math.log(b.f) - Math.log(a.f)));
		crossings.push({ f, rising: b.db > a.db });
	}
	return { points, peak, peakF, crossings };
}

/** The readings as CSV, for a spreadsheet. */
export function responseCsv(rows, reference = null) {
	const lines = ['frequency_hz,input_v,output_v,gain_db'];
	for (const r of rows) {
		const vin = Number(r.vin) > 0 ? Number(r.vin) : reference;
		const db = gainDb(vin, r.vout);
		lines.push([r.f, Number(r.vin) > 0 ? r.vin : '', Number(r.vout) > 0 ? r.vout : '', db === null ? '' : db.toFixed(2)].join(','));
	}
	return lines.join('\n') + '\n';
}
