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

/**
 * The smallest capacitor at or above `target`, for a part that must not
 * come out smaller (the output coupling capacitor): from the list when one
 * is given, null when nothing on it reaches; otherwise the E6 steps from
 * 1 pF to 68 mF, the ones electrolytics come in.
 */
export function capacitorNotBelow(target, option = null) {
	const values = Array.isArray(option) ? stockList(option) : seriesValues(E6, -12, -2);
	let best = null;
	for (const v of values) if (v >= target * (1 - 1e-9) && (best === null || v < best)) best = v;
	return best;
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
		const list = stockList(option);
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
	if (stockList(option).some((v) => Math.abs(v / value - 1) < 1e-9)) return null;
	const table = pairTable(option);
	const p = table[firstPairAtOrAbove(table, value * (1 - 1e-9))];
	return p && Math.abs(p.sum / value - 1) < 1e-9 ? [p.a, p.b] : null;
}

/** A resistor as a table prints it: its value, then the two parts in series when it is a pair. */
export function pairLabel(value, option, format, pairs = true) {
	const pair = pairs ? seriesPair(value, option) : null;
	return pair ? `${format(value)} (${format(pair[0])} + ${format(pair[1])})` : format(value);
}


/**
 * The smallest stocked resistor at or above the target, for a part that
 * has to err on the large side (the top of a divider that may pass no more
 * than its limit). With `pairs` on and a list, two in series stand in
 * under the rule pairedResistor follows: only where the single value
 * overshoots by more than 2 %, and only when the pair at least halves
 * that. When nothing on hand reaches the target, the largest value (or
 * the pair that does reach it) is returned.
 */
export function resistorNotBelow(target, option, pairs = false, decadeMin = 0, decadeMax = 7) {
	const values = resistorValues(option, decadeMin, decadeMax);
	if (!values.length) return nearestResistor(target, option);
	const floor = target * (1 - 1e-9);
	const single = values.find((v) => v >= floor) ?? values[values.length - 1];
	if (!pairs || !Array.isArray(option) || !(target > 0)) return single;
	const miss = Math.log(single / target);
	if (miss >= 0 && miss <= Math.log(1 + PAIR_TRIGGER)) return single;
	const table = pairTable(option);
	const pair = table[firstPairAtOrAbove(table, floor)];
	if (!pair) return single;
	return miss < 0 || Math.log(pair.sum / target) <= miss / 2 ? pair.sum : single;
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


/* --------------------------------------------- a limit on the pair count */

/**
 * The stock picker can also cap how many resistors of a circuit are pairs:
 * none, up to N, or as many as help. A designer's `pairs` option then
 * takes, besides true and false, a whitelist: an array or a Set of the
 * names of the resistors that may pair. With true or false nothing changes.
 *
 * "Up to N pairs" starts from the design with pairs where they help. When
 * it holds N pairs or fewer, it is the answer as it stands. Otherwise the
 * subsets of its pairs are tried, stage by stage, each one a real design
 * (the designer rerun with that whitelist), and the N pairs that bring the
 * circuit closest to its targets are kept, every other resistor a single
 * part. A tie goes to fewer pairs, then to the earlier stage, then to the
 * parts the tool lists first.
 */

/** Whether the resistor `name` may be two in series: true lets every one, false or null none, an array or Set of names those only. */
export function pairAllowed(pairs, name) {
	if (pairs === true) return true;
	if (!pairs) return false;
	if (pairs instanceof Set) return pairs.has(name);
	if (Array.isArray(pairs)) return pairs.includes(name);
	return true;
}

/** Whether a `pairs` option lets any resistor pair at all: true, or a whitelist that is not empty. */
export function anyPairAllowed(pairs) {
	if (pairs instanceof Set) return pairs.size > 0;
	if (Array.isArray(pairs)) return pairs.length > 0;
	return Boolean(pairs);
}

/**
 * The resistors of a design that are two in series, in the order given:
 * `parts` maps names to ohms, as an object or as [name, ohms] entries, and
 * holds the resistors only.
 */
export function pairedNames(parts, option) {
	const entries = Array.isArray(parts) ? parts : Object.entries(parts ?? {});
	return entries.filter(([, v]) => typeof v === 'number' && seriesPair(v, option)).map(([name]) => name);
}

/** Every subset of `names` with `size` members, each in the order of `names`; the subsets that hold the earlier names come first. */
export function pairSubsets(names, size) {
	const out = [];
	const pick = [];
	const walk = (start) => {
		if (pick.length === size) {
			out.push(pick.slice());
			return;
		}
		for (let i = start; i <= names.length - (size - pick.length); i++) {
			pick.push(names[i]);
			walk(i + 1);
			pick.pop();
		}
	};
	if (size >= 0 && size <= names.length) walk(0);
	return out;
}

/**
 * Measures closer than this, relative to the larger, count as a tie, so
 * rounding noise in a sum never decides between two designs.
 */
const PAIR_TIE = 1e-9;

/** A measure as the comparisons take it: a number, or Infinity for a design that cannot be built. */
function pairMeasureOf(value) {
	return typeof value === 'number' && !Number.isNaN(value) ? value : Infinity;
}

/** Whether measure a is clearly below measure b (not a tie). */
function pairMeasureLess(a, b) {
	if (a === b || a === Infinity) return false;
	if (b === Infinity) return true;
	return a < b - PAIR_TIE * Math.max(Math.abs(a), Math.abs(b));
}

/** Of two plans with the same number of pairs, whether `a` wins: a lower measure, or on a tie its pairs in the earlier stages. */
function pairPlanBetter(a, b) {
	if (pairMeasureLess(a.measure, b.measure)) return true;
	if (pairMeasureLess(b.measure, a.measure)) return false;
	for (let i = 0; i < a.counts.length; i++) {
		if (a.counts[i] !== b.counts[i]) return a.counts[i] > b.counts[i];
	}
	return false;
}

/**
 * The best design of one stage (or of a whole circuit) for each number of
 * pairs m, from 0 up to the length of `names` or `maxCount`, whichever is
 * smaller.
 *   names     the resistors that are pairs in the design with pairs where
 *             they help, in the order the tool lists its parts
 *   build     (allowed) => the design with `pairs` set to that whitelist,
 *             an array of names ([] gives single parts)
 *   measure   (design) => how far the design lands from its targets, lower
 *             is better; Infinity (or null) for one that cannot be built
 *   full      the design with pairs where they help, the entry for every
 *             name, so a stage that keeps all its pairs is that design; left
 *             out, it is built like the others
 * rows[m] = { count: m, allowed, design, measure }, of the subsets of m
 * names the one with the lowest measure, a tie to the earlier names. Each
 * subset is built once; m = 0 is always build([]), single parts.
 */
export function pairCountTable(names, build, measure, full = undefined, maxCount = names.length) {
	const top = Math.min(names.length, Math.max(0, Math.floor(maxCount)));
	const rows = [];
	for (let m = 0; m <= top; m++) {
		if (m > 0 && m === names.length && full !== undefined) {
			rows.push({ count: m, allowed: names.slice(), design: full, measure: pairMeasureOf(measure(full)) });
			continue;
		}
		let best = null;
		for (const allowed of pairSubsets(names, m)) {
			const design = build(allowed);
			const value = pairMeasureOf(measure(design));
			if (!best || pairMeasureLess(value, best.measure)) best = { count: m, allowed, design, measure: value };
		}
		rows.push(best);
	}
	return rows;
}

/**
 * Spreads a budget of `limit` pairs over the stages of a circuit. tables[s]
 * holds pairCountTable's rows for stage s; the result is, for each stage,
 * the number of pairs it keeps (an index into its rows), the counts summing
 * to `limit` or less and the stage measures to the least. A tie goes to
 * fewer pairs in all, then to the earlier stages. Dynamic programming over
 * the stages, by the number of pairs used so far.
 */
export function allocatePairs(tables, limit) {
	const cap = Math.max(0, Math.floor(limit));
	let plans = [{ measure: 0, counts: [] }];
	for (const rows of tables) {
		const next = [];
		plans.forEach((plan, used) => {
			if (!plan) return;
			rows.forEach((row, m) => {
				if (!row || used + m > cap) return;
				const plan2 = { measure: plan.measure + row.measure, counts: [...plan.counts, m] };
				if (!next[used + m] || pairPlanBetter(plan2, next[used + m])) next[used + m] = plan2;
			});
		});
		plans = next;
	}
	let best = null;
	for (const plan of plans) {
		if (plan && (!best || pairMeasureLess(plan.measure, best.measure))) best = plan;
	}
	return best ? best.counts : tables.map(() => 0);
}

/**
 * "Up to `limit` pairs" for a whole circuit: stages[s] = { names, full,
 * build, measure } as pairCountTable takes them (one entry for a circuit
 * that is not split in stages), and optionally `candidates`: every name of
 * the stage that may pair, in the tool's order, when the whitelists tried
 * are to be all their subsets and not only those of `names` (a part solved
 * from one given up can call for two in series where it did not before).
 * With no limit (null), or when the full designs hold `limit` pairs or
 * fewer in all, every stage is its full design; otherwise allocatePairs
 * shares the pairs out. Returns
 *   stages    per stage { count, allowed, dropped, design, measure }:
 *             the whitelist it was built with and the names it gave up
 *   count     the pairs allowed in all
 *   measure   the stage measures summed
 *   limited   whether the limit took pairs away
 */
export function limitPairs(stages, limit) {
	const total = stages.reduce((n, s) => n + s.names.length, 0);
	const sum = (list) => list.reduce((n, s) => n + s.measure, 0);
	if (limit === null || limit === undefined || total <= limit) {
		const kept = stages.map((s) => ({ count: s.names.length, allowed: s.names.slice(), dropped: [], design: s.full, measure: pairMeasureOf(s.measure(s.full)) }));
		return { stages: kept, count: total, measure: sum(kept), limited: false };
	}
	const tables = stages.map((s) => (s.candidates ? pairCountTable(s.candidates, s.build, s.measure, undefined, limit) : pairCountTable(s.names, s.build, s.measure, s.full, limit)));
	const counts = allocatePairs(tables, limit);
	const chosen = counts.map((m, i) => {
		const row = tables[i][m];
		return { ...row, dropped: stages[i].names.filter((name) => !row.allowed.includes(name)) };
	});
	return { stages: chosen, count: chosen.reduce((n, s) => n + s.count, 0), measure: sum(chosen), limited: true };
}
