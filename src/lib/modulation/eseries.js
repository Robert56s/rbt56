/**
 * IEC 60063 preferred value series. Capacitors are usually stocked in coarse
 * steps (E6/E12), resistors in finer ones (E24, or E96 for tighter designs).
 *
 * The designs pick parts through the stock-aware helpers at the end: each
 * takes an `option` that is either a series name ('E24', 'E96') or an
 * explicit list of values actually on hand (a lab drawer, a user's own
 * list), so restricting the stock changes nothing else in the design code.
 */

const E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const E24 = [
	1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6,
	6.2, 6.8, 7.5, 8.2, 9.1
];
const E96 = Array.from({ length: 96 }, (_, i) => Math.round(10 ** (i / 96) * 100) / 100);

export const SERIES = { E6, E12, E24, E96 };

/** Every value of a series across the given decades (powers of ten). */
export function seriesValues(series, decadeMin, decadeMax) {
	const out = [];
	for (let k = decadeMin; k <= decadeMax; k++) {
		// rounded to 12 digits so 5.1 x 10^5 reads 510000, not 509999.99999999994
		for (const m of series) out.push(Number((m * 10 ** k).toPrecision(12)));
	}
	return out;
}

/**
 * Nearest value in a series to the target, by relative (log) distance.
 * The default range covers both resistors and capacitors (1e-12 .. 1e12)
 * so a caller that forgets to pass decadeMin/decadeMax gets a merely wide
 * search rather than a silently wrong one restricted to the wrong unit.
 */
export function nearestInSeries(target, series, decadeMin = -12, decadeMax = 12) {
	return nearestValue(target, seriesValues(series, decadeMin, decadeMax));
}

/** Nearest value of an explicit list, by relative (log) distance. */
export function nearestValue(target, values) {
	let best = values[0];
	let bestErr = Infinity;
	for (const v of values) {
		const err = Math.abs(Math.log(v / target));
		if (err < bestErr) {
			bestErr = err;
			best = v;
		}
	}
	return best;
}

/** A list as the pickers use it: positive, finite, sorted, no repeats. */
export function stockList(values) {
	return [...new Set(values.filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);
}

/** How the explanations name a stock: the series, or 'stock' for a list. */
export function stockName(option) {
	return Array.isArray(option) ? 'stock' : option in SERIES ? option : 'E24';
}

/**
 * Every resistor a stock offers from 10^decadeMin up to (not including)
 * 10^(decadeMax + 1): the series across those decades, or the list's values
 * in that span.
 */
export function resistorValues(option, decadeMin = 0, decadeMax = 7) {
	if (Array.isArray(option)) {
		const lo = 10 ** decadeMin * (1 - 1e-9);
		const hi = 10 ** (decadeMax + 1);
		return stockList(option).filter((v) => v >= lo && v < hi);
	}
	return seriesValues(SERIES[option] ?? SERIES.E24, decadeMin, decadeMax);
}

/** Nearest stocked resistor. */
export function nearestResistor(target, option, decadeMin = -12, decadeMax = 12) {
	if (Array.isArray(option)) return nearestValue(target, stockList(option));
	return nearestInSeries(target, SERIES[option] ?? SERIES.E24, decadeMin, decadeMax);
}

/** The largest stocked resistor not above the target, for limits that must not be exceeded; null when none is. */
export function largestResistorNotAbove(target, option, decadeMin = 0, decadeMax = 7) {
	const below = resistorValues(option, decadeMin, decadeMax).filter((v) => v <= target * (1 + 1e-9));
	return below.length ? below[below.length - 1] : null;
}

/**
 * Capacitors a stock offers: the list itself, or a series across the
 * given decades (E12 from 1 pF to 9.9 uF unless told otherwise).
 */
export function capacitorValues(option, series = 'E12', decadeMin = -12, decadeMax = -6) {
	if (Array.isArray(option)) return stockList(option);
	return seriesValues(SERIES[series], decadeMin, decadeMax);
}

/** Nearest stocked capacitor: the list's nearest, or the nearest E12 value from 1 pF to 9.9 mF. */
export function nearestCapacitor(target, option) {
	if (Array.isArray(option)) return nearestValue(target, stockList(option));
	return nearestInSeries(target, SERIES.E12, -12, -3);
}

/** Capacitor values a search may try: the list, or E6 steps spanning pF to uF (1e-12 .. 1e-6 F). */
export function capacitorCandidates(option = null) {
	if (Array.isArray(option)) return stockList(option);
	return seriesValues(E6, -12, -6);
}
