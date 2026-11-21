import { LAB_KIT, seriesPair } from '../eseries';
import { comment, pyDict, pyEng, pyList, pyPart, shortValue } from './emit';

/**
 * The stock and the rounding: which values the file takes its parts from
 * (the page's stock picker: E24, E96, the lab kit, the lab resistors with
 * every E6 capacitor, or a list on hand), the capacitors typed on the page,
 * and the helpers of rule c, neighbours(), miss() and rounded().
 *
 * A series is written as its rule: its base values times every decade
 * from 1 ohm (E24 to 9.1 Mohm, E96 to 9.76 Mohm), the capacitors the E6
 * series from 1 pF to 6.8 uF, the page's own (capacitorCandidates in
 * eseries.js). A list is written as it is, in engineering notation.
 */

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The stock of generateFilterPython's arguments, as the page's downloadScript
 * passes it: { kind: 'E24' | 'E96' | 'lab' | 'labR' | 'custom', resistors
 * (a series name or a list of ohms), capacitors (a list of farads, or null
 * for the E6 series), pairs (the page may make a resistor of two in series),
 * pairLimit (how many, or null) }.
 */
export function stockOf(args) {
	const resistors = args.resistorStock ?? 'E24';
	const capacitors = Array.isArray(args.capacitorStock) ? args.capacitorStock : null;
	const list = Array.isArray(resistors);
	const kind = !list ? (resistors === 'E96' ? 'E96' : 'E24') : sameList(resistors, LAB_KIT.resistors) ? (capacitors === null ? 'labR' : sameList(capacitors, LAB_KIT.capacitors) ? 'lab' : 'custom') : 'custom';
	const pairs = list && Boolean(args.resistorPairs);
	const pairLimit = pairs && Number.isInteger(args.resistorPairLimit) ? args.resistorPairLimit : null;
	return { kind, resistors: list ? resistors : kind, capacitors, pairs, pairLimit };
}

/**
 * The capacitors typed on the page, farads by stage index and part name: {
 * [i]: { C1: F } }, the stages with one only, each value as a reader writes
 * it (shortValue: the page's 4.7 nF times 1e-9 is 4.7e-9 here; the checks
 * take the same values).
 */
export function typedOf(capOverrides) {
	const out = {};
	for (const [key, caps] of Object.entries(capOverrides ?? {})) {
		const kept = Object.fromEntries(
			Object.entries(caps ?? {})
				.filter(([, c]) => Number.isFinite(c) && c > 0)
				.map(([name, c]) => [name, shortValue(c)])
		);
		if (Object.keys(kept).length) out[Number(key)] = kept;
	}
	return out;
}

/** Whether any capacitor was typed on the page. */
export const anyTyped = (typed) => Object.keys(typed).length > 0;

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const E6_RULE = 'capacitors = [m * 10 ** d for d in range(-12, -5) for m in (1.0, 1.5, 2.2, 3.3, 4.7, 6.8)]  # F';

/** What the stock is, in words. */
export function stockWords(stock) {
	return {
		E24: 'the E24 series (5 %) from 1 ohm to 9.1 Mohm, and the E6 capacitors from 1 pF to 6.8 uF',
		E96: 'the E96 series (1 %) from 1 ohm to 9.76 Mohm, and the E6 capacitors from 1 pF to 6.8 uF',
		lab: 'the lab kit',
		labR: 'the lab kit\'s resistors, and the E6 capacitors from 1 pF to 6.8 uF',
		custom: 'the list on hand'
	}[stock.kind];
}

/** SETTINGS' stock: the resistors and capacitors as Python lists, and the capacitors typed on the page. */
export function stockSettings(ctx) {
	const { stock, typed } = ctx;
	const lines = [comment(`The stock the file takes its parts from: ${stockWords(stock)}.`)];
	if (stock.kind === 'E24') lines.push(pyList('E24', E24.map((v) => v.toFixed(1))), 'resistors = [m * 10 ** d for d in range(7) for m in E24]  # ohm', E6_RULE);
	else if (stock.kind === 'E96') lines.push('E96 = [round(10 ** (i / 96), 2) for i in range(96)]  # 96 steps a decade, to 3 figures', 'resistors = [m * 10 ** d for d in range(7) for m in E96]  # ohm', E6_RULE);
	else {
		lines.push(pyList('resistors', stock.resistors.map(pyEng), 'ohm'));
		lines.push(stock.capacitors ? pyList('capacitors', stock.capacitors.map(pyEng), 'F') : E6_RULE);
	}
	if (stock.pairs) {
		lines.push(
			comment(
				`The page may also make a resistor of two of these in series${stock.pairLimit !== null ? ` (${stock.pairLimit === 1 ? 'one such pair' : `at most ${stock.pairLimit} such pairs`} in the whole filter)` : ''}; the file's own rule keeps to single values.`
			)
		);
	}
	const entries = Object.entries(typed);
	if (entries.length) {
		// (one stage a line where they do not fit on one)
		const items = entries.map(([i, caps]) => `${Number(i) + 1}: {${Object.entries(caps).map(([name, c]) => `"${name}": ${pyPart(c)}`).join(', ')}}`);
		lines.push('', comment('Capacitors typed on the page, by stage (1 the first), in F: the rule takes them as they are.'), pyDict('typed', items));
	}
	return lines.join('\n');
}

/** The value of a page's part as Python writes it (pyPart), a pair of resistors as the sum of its two parts. */
export function pageValue(value, stock, name) {
	const pair = stock.pairs && /^[Rr]/.test(name) ? seriesPair(value, stock.resistors) : null;
	return pair ? { text: `${pyPart(pair[0])} + ${pyPart(pair[1])}`, pair: true } : { text: pyPart(value), pair: false };
}

/** neighbours(), miss() and rounded(), rule c of the parts (rule b ranks its choices by miss() too). */
export function roundingHelpers(file) {
	file.once(
		'neighbours',
		[
			'def neighbours(r):',
			'    """The stocked resistors just below and just above r: one when r itself is stocked."""',
			'    below = max((v for v in resistors if v <= r), default=None)',
			'    above = min((v for v in resistors if v >= r), default=None)',
			'    return sorted({v for v in (below, above) if v is not None})',
			'',
			'',
			'def miss(got, want):',
			'    """How far a stage\'s figures land from others: the worst |ln(got / want)| of them."""',
			'    return max(abs(math.log(got[key] / want[key])) for key in want)',
			'',
			'',
			'def rounded(p, figures, rs):',
			'    """Rule c: every resistor to its neighbour below or above, keeping the combination whose',
			'    figures miss the exact parts\' least."""',
			'    target = figures(p, rs)',
			'    names = [name for name in p if name[0] in "Rr"]',
			'    best, best_miss = None, math.inf',
			'    for values in itertools.product(*(neighbours(p[name]) for name in names)):',
			'        trial = {**p, **dict(zip(names, values))}',
			'        off = miss(figures(trial, rs), target)',
			'        if off < best_miss:',
			'            best, best_miss = trial, off',
			'    return best'
		].join('\n')
	);
	file.imports.add('itertools');
}
