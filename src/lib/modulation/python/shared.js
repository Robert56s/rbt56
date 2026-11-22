import { LAB_KIT } from '../../filter/eseries';
import { comment, header, PY_WIDTH, pyEng, pyList, pyPart, pyStr } from '../../filter/python/emit';
import { seriesPair } from '../eseries';

/**
 * What the three AM files share: the docstring, the stock in SETTINGS (a
 * series by its rule, a list as it is), the results comment, eng() and the
 * rounding helpers, the page's parts as data (a pair of resistors as the
 * sum of its two parts), the table that prints two sets side by side, and
 * what the page says of each check a set misses.
 */

/** Words in lines of at most `width` characters, `first` before the first line's. */
function wrapped(text, width, first = '') {
	const lines = [];
	let line = first;
	for (const w of text.split(' ')) {
		if (line.length > first.length && line.length + 1 + w.length > width) {
			lines.push(line);
			line = w;
			continue;
		}
		line += line === first ? w : ` ${w}`;
	}
	lines.push(line);
	return lines;
}

/**
 * The docstring: `what` the summary line, `steps` what the design works
 * through (a phrase), `name` the file's name, `plot` what matplotlib draws.
 */
export function docstring({ what, steps, name, plot }) {
	return [
		...wrapped(what, PY_WIDTH, '"""'),
		'',
		...wrapped(`rbt56.com/tools/am-modulator-demodulator/ wrote this file for one design. It works through the design step by step, ${steps}, proposes the parts with a simple rule and checks them, together with the parts the page shows for the same design.`, 96),
		'',
		...wrapped(`Run it with Python 3.8 or newer, nothing to install: python ${name}. The SETTINGS block can be edited and the file run again. With matplotlib installed, it also draws ${plot}.`, 96),
		'"""'
	].join('\n');
}

/** The names the results end up in, as the checks read them (scripts/lib-python.mjs). */
export const resultsComment = (names) => comment(`After a run, these names hold the results: ${names.join(', ')}.`);

/** SETTINGS' header. */
export const settingsHeader = () => header('SETTINGS');

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The stock as the page's stock picker gives it, { kind, resistors,
 * capacitors, pairs, pairLimit }: kind 'E24', 'E96', 'lab', 'labR' or
 * 'custom' (read from the lists when it is not given), resistors a series
 * name or a list of ohms, capacitors a list of farads or null (the circuit's
 * usual values), pairs whether the page may make a resistor of two in
 * series, pairLimit how many (null for as many as help).
 */
export function stockOf(stock = {}) {
	const resistors = stock.resistors ?? 'E24';
	const capacitors = Array.isArray(stock.capacitors) ? stock.capacitors : null;
	const list = Array.isArray(resistors);
	const guessed = !list ? (resistors === 'E96' ? 'E96' : 'E24') : sameList(resistors, LAB_KIT.resistors) ? (capacitors === null ? 'labR' : sameList(capacitors, LAB_KIT.capacitors) ? 'lab' : 'custom') : 'custom';
	const kind = ['E24', 'E96', 'lab', 'labR', 'custom'].includes(stock.kind) && (stock.kind === 'E24' || stock.kind === 'E96') === !list ? stock.kind : guessed;
	const pairs = list && Boolean(stock.pairs);
	const pairLimit = pairs && Number.isInteger(stock.pairLimit) ? stock.pairLimit : null;
	return { kind, resistors: list ? resistors : kind, capacitors, pairs, pairLimit };
}

/**
 * The capacitor stock each circuit takes when the page has no list:
 *   usual  the gate drive's coupling capacitor: 1, 2.2 and 4.7 from 1 nF to
 *          10 uF (jfetModulator.js CAP_STOCK)
 *   e12    the diode modulator's tank: E12 from 1 pF to 8.2 uF
 *   e6     the envelope low-pass: E6 from 1 pF to 6.8 uF
 * Each comes with its words and its Python, a list or a rule; a rule writes
 * every value as the decimal it stands for, round(m * 10 ** d, 1 - d), the
 * same doubles the page's series hold.
 */
const USUAL_CAPS = [1e-9, 2.2e-9, 4.7e-9, 1e-8, 2.2e-8, 4.7e-8, 1e-7, 2.2e-7, 4.7e-7, 1e-6, 2.2e-6, 4.7e-6, 1e-5];
const CAP_STOCKS = {
	usual: { words: 'the usual capacitors from 1 nF to 10 uF', code: () => [pyList('capacitors', USUAL_CAPS.map(pyEng), 'F')] },
	e12: {
		words: 'the E12 capacitors from 1 pF to 8.2 uF',
		code: () => [pyList('E12', E12.map((v) => v.toFixed(1))), 'capacitors = [round(m * 10 ** d, 1 - d) for d in range(-12, -5) for m in E12]  # F']
	},
	e6: {
		words: 'the E6 capacitors from 1 pF to 6.8 uF',
		code: () => [pyList('E6', E6.map((v) => v.toFixed(1))), 'capacitors = [round(m * 10 ** d, 1 - d) for d in range(-12, -5) for m in E6]  # F']
	}
};

/** The usual capacitors of the gate drive, as the page has them (for the checks). */
export const USUAL_CAPACITORS = USUAL_CAPS;

/** What the stock is, in words, for a circuit whose capacitors without a list are `caps`. */
export function stockWords(stock, caps) {
	const usual = CAP_STOCKS[caps].words;
	return {
		E24: `the E24 series (5 %) from 1 ohm to 91 Mohm, and ${usual}`,
		E96: `the E96 series (1 %) from 1 ohm to 97.6 Mohm, and ${usual}`,
		lab: 'the lab kit',
		labR: `the lab kit's resistors, and ${usual}`,
		custom: 'the list on hand'
	}[stock.kind];
}

/**
 * SETTINGS' stock: the resistors and capacitors as Python, `caps` the
 * circuit's capacitors without a list (CAP_STOCKS), `pairsWhere` the words
 * after "pairs" that say where the page's limit counts them ('in the whole
 * filter'), `note` a sentence after the first (the diode modulator's
 * fallback to E24).
 */
export function stockSettings(stock, { caps, pairsWhere = 'in the whole circuit', note = '' }) {
	const lines = [comment(`The stock the file takes its parts from: ${stockWords(stock, caps)}.${note ? ` ${note}` : ''}`)];
	if (stock.kind === 'E24') lines.push(pyList('E24', E24.map((v) => v.toFixed(1))), 'resistors = [round(m * 10 ** d, 2) for d in range(8) for m in E24]  # ohm');
	else if (stock.kind === 'E96') lines.push('E96 = [round(10 ** (i / 96), 2) for i in range(96)]  # 96 steps a decade, to 3 figures', 'resistors = [round(m * 10 ** d, 2) for d in range(8) for m in E96]  # ohm');
	else lines.push(pyList('resistors', stock.resistors.map(pyEng), 'ohm'));
	if (stock.capacitors) lines.push(pyList('capacitors', stock.capacitors.map(pyEng), 'F'));
	else lines.push(...CAP_STOCKS[caps].code());
	if (stock.pairs) {
		const limit = stock.pairLimit === null ? '' : ` (${stock.pairLimit === 1 ? 'one such pair' : `at most ${stock.pairLimit} such pairs`} ${pairsWhere})`;
		lines.push(comment(`The page may also make a resistor of two of these in series${limit}; the file's own rule keeps to single values.`));
	}
	lines.push('resistors, capacitors = sorted(resistors), sorted(capacitors)  # (the steps take them in order)');
	return lines.join('\n');
}

/** eng(), the printout's values with their units, written once. */
export function engHelper(file) {
	file.once(
		'eng',
		[
			'def eng(v, unit):',
			'    """A value with its unit\'s prefix, to 4 figures: eng(4700, "ohm") is "4.7 kohm"."""',
			'    for prefix, scale in [("M", 1e6), ("k", 1e3), ("", 1.0), ("m", 1e-3), ("u", 1e-6), ("n", 1e-9),',
			'                          ("p", 1e-12)]:',
			'        if abs(v) >= scale or prefix == "p":',
			'            return f"{v / scale:.4g} {prefix}{unit}" if v else f"0 {unit}"'
		].join('\n')
	);
}

/** A value as the file's eng() prints it, for its comments: engText(4700, 'ohm') is '4.7 kohm'. */
export function engText(v, unit) {
	if (!v) return `0 ${unit}`;
	for (const [prefix, scale] of [['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12]]) {
		if (Math.abs(v) >= scale || prefix === 'p') return `${Number((v / scale).toPrecision(4))} ${prefix}${unit}`;
	}
	return `${v} ${unit}`;
}

/** say(), which prints a head and a list after it in lines of at most 92 characters, written once. */
export function sayHelper(file) {
	file.once(
		'say',
		[
			'def say(head, items):',
			'    """Prints head and the items after it, comma separated, in lines of at most 92 characters,',
			'    each line after the first two spaces in from head."""',
			'    pad = " " * (len(head) - len(head.lstrip()) + 2)',
			'    line = head',
			'    for j, item in enumerate(items):',
			'        piece = item + ("," if j < len(items) - 1 else "")',
			'        if len(line) + 1 + len(piece) > 92 and line != head:',
			'            print(line)',
			'            line = pad + piece',
			'        else:',
			'            line += " " + piece',
			'    print(line)'
		].join('\n')
	);
}

/** neighbours(), the stocked resistors either side of a value, written once. */
export function neighboursHelper(file) {
	file.once(
		'neighbours',
		[
			'def neighbours(r):',
			'    """The stocked resistors just below and just above r: one when r itself is stocked."""',
			'    below = max((v for v in resistors if v <= r), default=None)',
			'    above = min((v for v in resistors if v >= r), default=None)',
			'    return sorted({v for v in (below, above) if v is not None})'
		].join('\n')
	);
}

/** neighbours() and closer(), the rounding of the file's own rule, written once. */
export function roundingHelpers(file) {
	neighboursHelper(file);
	file.once(
		'closer',
		[
			'def closer(r, figure, target):',
			'    """r rounded down or up to the stock, whichever lands figure(R) closer to the target."""',
			'    return min(neighbours(r), key=lambda v: abs(math.log(figure(v) / target)))'
		].join('\n')
	);
}

/** The Python of the stocked resistor nearest a value (ohms, Python text), as the page's nearestResistor. */
export const nearestCode = (value) => `min(resistors, key=lambda v: abs(math.log(v / ${/^[\w.]+$/.test(value) ? value : `(${value})`})))`;

/** A page part as Python writes it: a resistor of two in series as the sum of the stock's two parts. */
export function pageValue(name, value, stock) {
	const pair = stock.pairs && /^R/.test(name) ? seriesPair(value, stock.resistors) : null;
	return pair ? { text: `${pyPart(pair[0])} + ${pyPart(pair[1])}`, pair: true } : { text: value === null ? 'None' : pyPart(value), pair: false };
}

/**
 * A dict literal `name = {"k": v, ...}` whose items flow over lines of at
 * most PY_WIDTH characters, each continuation lined up after the brace.
 * `items` are [key, Python text].
 */
export function pyDictFlow(name, items, indent = '') {
	const head = `${indent}${name} = {`;
	const pad = ' '.repeat(head.length);
	const pieces = items.map(([k, v], i) => `"${k}": ${v}${i < items.length - 1 ? ',' : '}'}`);
	const lines = [];
	let line = head;
	for (const piece of pieces) {
		if (line !== head && line.length + 1 + piece.length > PY_WIDTH) {
			lines.push(line);
			line = pad + piece;
		} else line += line === head ? piece : ` ${piece}`;
	}
	lines.push(line);
	return lines.join('\n');
}

/**
 * Python items flowing over lines of at most PY_WIDTH characters: `open`
 * the text before the first item ('    checks = {'), `items` the items'
 * Python, `close` what follows the last ('}'); continuations line up after
 * `open`.
 */
export function flow(open, items, close) {
	const pad = ' '.repeat(open.length);
	const lines = [];
	let line = open;
	items.forEach((item, i) => {
		const piece = `${item}${i < items.length - 1 ? ',' : close}`;
		if (line !== open && line.length + 1 + piece.length > PY_WIDTH) {
			lines.push(line);
			line = pad + piece;
		} else line += line === open ? piece : ` ${piece}`;
	});
	lines.push(line);
	return lines.join('\n');
}

/**
 * The page's parts of one circuit as data: `page_parts = {...}` under a
 * comment, the resistors the page builds of two in series written as the
 * sum of their two parts and named in the comment; `raw` parts written as
 * given (their Python), `note` the page's note on its limit of pairs.
 */
export function pageParts(parts, stock, { raw = {}, note = null } = {}) {
	const values = [...Object.entries(parts).map(([key, v]) => [key, pageValue(key, v, stock)]), ...Object.entries(raw).map(([key, text]) => [key, { text, pair: false }])];
	const pairs = values.filter(([, v]) => v.pair).map(([key]) => key);
	const said = pairs.length ? ` (${pairs.length > 1 ? `${pairs.slice(0, -1).join(', ')} and ${pairs[pairs.length - 1]} are each` : `${pairs[0]} is`} two resistors in series)` : '';
	return [limitNoteCode(note), comment(`The parts the page shows for this design, checked the same way${said}:`), pyDictFlow('page_parts', values.map(([key, v]) => [key, v.text]))].filter(Boolean).join('\n');
}

/** The page's note on its limit of pairs (what it kept and what it left single), as a comment; '' with none. */
export function limitNoteCode(note) {
	return note ? comment(`What the page says of its limit: ${note}`) : '';
}

/**
 * The code that prints two sets side by side: `rows` the Python of each row
 * label, the sets' cells in check()'s "cells" (the verdict, last, a count of
 * the misses), the labels `width` wide, then what each set misses, by
 * say() where the file has it (`say`).
 */
export function tableCode(rows, width = 36, { say = true } = {}) {
	return [
		flow('rows = [', rows, ']'),
		`print(" " * ${width + 2} + "".join(f"{name:>24}" for name, _ in sets))`,
		'for j, row in enumerate(rows):',
		`    print(f"  {row:${width}}" + "".join(f"{chk['cells'][j]:>24}" for _, chk in sets))`,
		'for name, chk in sets:',
		'    if chk["misses"]:',
		say ? '        say(f"  {name} miss:", chk["misses"])' : '        print(f"  {name} miss: " + ", ".join(chk["misses"]))'
	].join('\n');
}

/**
 * What the page says of each check a set misses, as its flags say it: a
 * dict of [key, text], one line of text each, and the loop that prints the
 * text of each key in `missed` (the misses of the sets, which the file
 * names first).
 */
export function adviceCode(entries) {
	return [
		'advice = {  # what the page says of each check missed, as its flags say it',
		...entries.map(([key, text]) => `    ${pyStr(key)}: ${pyStr(text)},`),
		'}',
		'for key, text in advice.items():',
		'    if key in missed:',
		'        print("  " + text)'
	].join('\n');
}
