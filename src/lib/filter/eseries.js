/**
 * IEC 60063 preferred value series. Capacitors are usually stocked in coarse
 * steps (E6/E12), resistors in finer ones (E24, or E96 for tighter designs).
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
		for (const m of series) out.push(m * 10 ** k);
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
	const options = seriesValues(series, decadeMin, decadeMax);
	let best = options[0];
	let bestErr = Infinity;
	for (const v of options) {
		const err = Math.abs(Math.log(v / target));
		if (err < bestErr) {
			bestErr = err;
			best = v;
		}
	}
	return best;
}

/**
 * A teaching-lab drawer: the values actually stocked there. Deliberately
 * not a preferred series (1 and 2.2 ohm but no 3.3; 4.7 k but no 3.3 k;
 * capacitors in fifteen steps only), which is the point of designing
 * against it rather than against E24.
 */
export const LAB_KIT = {
	resistors: [
		1, 2.2, 4.7, 7.5, 10, 15, 22, 33, 39, 47, 56, 68, 100, 120, 150, 220, 330, 390, 470, 510, 680,
		1e3, 1.5e3, 2e3, 2.2e3, 3e3, 4.7e3, 5.1e3, 5.6e3, 7.5e3, 8.2e3, 10e3, 15e3, 22e3, 33e3, 47e3,
		56e3, 68e3, 75e3, 100e3, 150e3, 220e3, 330e3, 470e3, 680e3, 1e6, 2e6, 4.7e6, 5.6e6
	],
	capacitors: [
		10e-12, 20e-12, 30e-12, 47e-12, 56e-12, 68e-12, 100e-12, 220e-12, 330e-12, 680e-12, 1e-9,
		4.7e-9, 10e-9, 47e-9, 100e-9
	]
};

/**
 * A component kit: the explicit list of values actually on hand, rather
 * than a preferred series repeated across every decade. Real drawers are
 * not decade-repeating (1 ohm and 2.2 ohm but no 3.3 ohm; 4.7 k but no
 * 3.3 k), so a kit is kept as absolute values and matched directly.
 *
 * Every picker below takes either a series name ('E24') or such a list, so
 * handing it a kit changes nothing else in the design code: the search
 * simply has fewer values to choose from, and the realized f0/Q error
 * grows accordingly - which is exactly what the tables are there to show.
 */
function normalizeList(values) {
	return [...new Set(values.filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);
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

/** Nearest stocked resistor: `option` is a series name or an explicit list of ohms. */
export function nearestResistor(target, option) {
	if (Array.isArray(option)) return nearestValue(target, normalizeList(option));
	return nearestInSeries(target, SERIES[option] ?? SERIES.E24);
}

/** Nearest stocked capacitor: `option` is null (the E12 grid) or an explicit list of farads. */
export function nearestCapacitor(target, option) {
	if (Array.isArray(option)) return nearestValue(target, normalizeList(option));
	return nearestInSeries(target, SERIES.E12, -12, -3);
}

/**
 * Capacitor values a search may try: the caller's own list when given one,
 * otherwise E6 steps spanning pF to uF (1e-12 .. 1e-6 F).
 */
/**
 * Under this a capacitor competes with the stray capacitance of a
 * breadboard row and of the op-amp's input pins (a few picofarads), so the
 * built stage drifts off its design. The page flags such a part, and the
 * searches below take one only when no capacitor at or above it works.
 */
export const C_FLOOR = 47e-12;

/**
 * Added to a search score when a candidate uses a capacitor under C_FLOOR:
 * larger than any difference between two valid candidates, so a small
 * capacitor wins only when it is the one way to build the stage.
 */
export function smallCapPenalty(...caps) {
	return caps.some((c) => c < C_FLOOR * (1 - 1e-9)) ? 1000 : 0;
}

export function capacitorCandidates(option) {
	if (Array.isArray(option)) return normalizeList(option);
	return seriesValues(E6, -12, -6);
}


/* ---------------------------------------------- two resistors in series */

/**
 * With a list of values on hand, a part that sets a figure (a frequency, a
 * Q, a gain, a bias) can be built from two resistors in series when no
 * single one comes close: the stock picker's "two in series" option. The
 * rule is the same in every tool: a pair only where the closest single
 * value misses by more than PAIR_TRIGGER, and only when the pair at least
 * halves that miss. A pair is two values of the list, the same one twice
 * allowed. Only resistors pair up: capacitors stay single parts.
 */
const PAIR_TRIGGER = 0.02;
const pairTables = new WeakMap();

/** Every sum of two list values, by sum; of pairs with the same sum, the one with the larger part first. */
function pairTable(option) {
	let table = pairTables.get(option);
	if (!table) {
		const list = normalizeList(option);
		table = [];
		for (let i = 0; i < list.length; i++) {
			for (let j = 0; j <= i; j++) table.push({ sum: list[i] + list[j], a: list[i], b: list[j] });
		}
		table.sort((p, q) => p.sum - q.sum || q.a - p.a);
		pairTables.set(option, table);
	}
	return table;
}

/** Index of the first pair whose sum is at or above the value. */
function firstPairAtOrAbove(table, value) {
	let lo = 0;
	let hi = table.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (table[mid].sum < value) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * A stocked resistor for a part that sets the design: the nearest single
 * value, or, with `pairs` on and a list to pick from, the sum of two in
 * series when the single value misses by more than 2 % and the pair at
 * least halves that miss. The result is a plain number either way, so the
 * design maths needs no change; seriesPair() tells the two parts apart.
 */
export function pairedResistor(target, option, pairs = false) {
	const single = nearestResistor(target, option);
	if (!pairs || !Array.isArray(option) || !(target > 0)) return single;
	const miss = Math.abs(Math.log(single / target));
	if (miss <= Math.log(1 + PAIR_TRIGGER)) return single;
	const table = pairTable(option);
	const i = firstPairAtOrAbove(table, target);
	let best = null;
	for (const p of [table[i - 1], table[i]]) {
		if (!p) continue;
		const pairMiss = Math.abs(Math.log(p.sum / target));
		if (best === null || pairMiss < best.miss) best = { sum: p.sum, miss: pairMiss };
	}
	return best && best.miss <= miss / 2 ? best.sum : single;
}

/** The two list values a resistor is built from, [larger, smaller], or null when the list has it as one part. */
export function seriesPair(value, option) {
	if (!Array.isArray(option) || !(value > 0)) return null;
	if (normalizeList(option).some((v) => Math.abs(v / value - 1) < 1e-9)) return null;
	const table = pairTable(option);
	const p = table[firstPairAtOrAbove(table, value * (1 - 1e-9))];
	return p && Math.abs(p.sum / value - 1) < 1e-9 ? [p.a, p.b] : null;
}

/** A resistor as a table prints it: its value, then the two parts in series when it is a pair. */
export function pairLabel(value, option, format, pairs = true) {
	const pair = pairs ? seriesPair(value, option) : null;
	return pair ? `${format(value)} (${format(pair[0])} + ${format(pair[1])})` : format(value);
}


/** A value in the short form a drawing uses: 2.2k, 680, 1M. */
function shortOhms(v) {
	const trim = (x) => String(Number(x.toPrecision(3)));
	if (v >= 1e6) return trim(v / 1e6) + 'M';
	if (v >= 1e3) return trim(v / 1e3) + 'k';
	return trim(v);
}

/** A resistor as a schematic labels it: its value, or its two parts in short form ("2.2k + 2k") when it is a pair. */
export function pairDiagramLabel(value, option, format, pairs = true) {
	const pair = pairs ? seriesPair(value, option) : null;
	return pair ? `${shortOhms(pair[0])} + ${shortOhms(pair[1])}` : format(value);
}
