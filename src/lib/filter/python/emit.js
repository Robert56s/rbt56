/**
 * Shared helpers of the Python generator (index.js): Python literals,
 * comments wrapped to the file's width, section headers, and the file
 * builder that writes each helper function once.
 *
 * Every function here returns plain text. The file the generator writes is
 * ASCII only, 4-space indents, lines up to PY_WIDTH characters.
 */

/** The longest line the file has. */
export const PY_WIDTH = 100;

/** One indent level. */
export const IND = '    ';

/**
 * A Python float literal that reads back as exactly x: the shortest decimal
 * JavaScript writes for it ('1e-9', '0.7653668647301796'), with '.0' added
 * to a whole number so that it stays a float (10000 -> '10000.0').
 */
export function pyNum(x) {
	if (!Number.isFinite(x)) throw new Error(`pyNum: ${x} is not a finite number`);
	const text = String(x);
	return /[.e]/.test(text) ? text : `${text}.0`;
}

/**
 * A part value in engineering notation, exact as pyNum: 7500 -> '7.5e3',
 * 6.8e-10 -> '680e-12', 1e-8 -> '10e-9', 220 -> '220.0'. The digits are the
 * shortest ones JavaScript writes for x with the decimal point moved, so the
 * literal reads back as the same double.
 */
export function pyEng(x) {
	if (!Number.isFinite(x)) throw new Error(`pyEng: ${x} is not a finite number`);
	if (x === 0) return '0.0';
	const [mant, expText] = Math.abs(x).toExponential().split('e');
	const exp = Number(expText);
	const digits = mant.replace('.', '');
	const e3 = Math.floor(exp / 3) * 3;
	const lead = 1 + exp - e3;
	const whole = digits.slice(0, lead).padEnd(lead, '0');
	const frac = digits.slice(lead);
	const body = frac ? `${whole}.${frac}` : whole;
	const sign = x < 0 ? '-' : '';
	if (e3 === 0) return `${sign}${frac ? body : `${body}.0`}`;
	return `${sign}${body}e${e3}`;
}

/**
 * A part's value as a reader writes it: the fewest figures that land within
 * 1e-12 of x (4.700000000000001e-9, the page's 4.7 nF times 1e-9, is 4.7e-9;
 * 2.2000000000000003e-9 of the E6 grid is 2.2e-9). The page's parts and the
 * capacitors typed on it are written so (pyPart), and the checks compare
 * them within 1e-12.
 */
export function shortValue(x) {
	if (!Number.isFinite(x) || x === 0) return x;
	for (let p = 1; p <= 15; p++) {
		const short = Number(x.toPrecision(p));
		if (Math.abs(short - x) <= 1e-12 * Math.abs(x)) return short;
	}
	return x;
}

/** shortValue in engineering notation: 4.700000000000001e-9 -> '4.7e-9'. */
export const pyPart = (x) => pyEng(shortValue(x));

/** A Python string literal of ASCII text: double-quoted, or single-quoted where that spares a backslash ('placement = "centred"'). */
export function pyStr(text) {
	assertAscii(text);
	const s = String(text);
	if (s.includes('"') && !s.includes("'") && !s.includes('\\')) return `'${s}'`;
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A call with one plain string argument, `head` its start up to the
 * opening parenthesis ('raise SystemExit(', 'print('), wrapped at PY_WIDTH
 * into string pieces Python joins, each continuation lined up under the
 * first piece. No braces: an f-string is written by hand.
 */
export function pyCall(head, text, indent = '') {
	if (/[{}]/.test(text)) throw new Error(`pyCall: braces in ${text}`);
	const open = `${indent}${head}`;
	const room = PY_WIDTH - open.length - 3;
	const words = String(text).split(' ');
	const pieces = [];
	let piece = '';
	for (const w of words) {
		const next = piece ? `${piece} ${w}` : w;
		if (piece && next.length + 1 > room) {
			pieces.push(`${piece} `);
			piece = w;
		} else piece = next;
	}
	pieces.push(piece);
	const pad = ' '.repeat(open.length);
	return pieces.map((p, i) => `${i ? pad : open}${pyStr(p)}${i === pieces.length - 1 ? ')' : ''}`).join('\n');
}

/**
 * Prose printed as it reads on a console: lines of up to 88 characters,
 * each one print() of a plain string, `lead` (two spaces) before each, the
 * code indented by `indent`.
 */
export function pyPrints(text, indent = '', lead = '  ') {
	if (/[{}]/.test(text)) throw new Error(`pyPrints: braces in ${text}`);
	const lines = [];
	let line = '';
	// (88 on the console, and the source line within PY_WIDTH: print(" and ") around it)
	const room = Math.min(88, PY_WIDTH - indent.length - 9) - lead.length;
	for (const w of String(text).split(' ')) {
		if (line && line.length + 1 + w.length > room) {
			lines.push(line);
			line = w;
		} else line = line ? `${line} ${w}` : w;
	}
	if (line) lines.push(line);
	return lines.map((l) => `${indent}print(${pyStr(lead + l)})`).join('\n');
}

/** raise SystemExit("...") with a plain message, wrapped (pyCall). */
export const pyRaise = (text, indent = '') => pyCall('raise SystemExit(', text, indent);

/** Throws on a character outside printable ASCII (the file must print on a cp1252 console). */
export function assertAscii(text) {
	const bad = /[^\x20-\x7e\n]/.exec(String(text));
	if (bad) throw new Error(`not ASCII: ${JSON.stringify(bad[0])} in ${JSON.stringify(String(text).slice(Math.max(0, bad.index - 30), bad.index + 30))}`);
}

/** How wide a comment's lines run, a little inside PY_WIDTH. */
const COMMENT_WIDTH = 96;

/** The longest run of words the wrapper keeps on one line (a formula, a number and its unit). */
const GLUE_MAX = 40;

/** A number, and a unit that follows one: "1 pF", "6.8 uF", "3 dB", "10 kohm". */
const NUMBER = /^[-+]?[\d.]+(e[-+]?\d+)?$/;
const UNIT = /^[kMmunp]?(Hz|F|ohm|dB)[,.;:)]*$/;
/** A word that ties its neighbours together in a formula: =, and the operators written apart. */
const TIES = new Set(['=', '>=', '<=', '-', '+', '*', '/', '->']);

/** A word that opens a formula in parentheses: "(s^2", "(f", "(2n)", "(1/k)", not "(the". */
const MATH_OPEN = /^\((\d|[A-Za-z]\w?(\^|\/|$))/;

/** How many parentheses a run of words leaves open. */
const depth = (text) => (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length;

/**
 * The words of a paragraph, those that read as one kept together: each side
 * of '=' (and of the operators written apart, '-' and '+' in "10^(amax/10) -
 * 1") with its neighbours, a formula in parentheses ("(s^2 + a s + b)"), a
 * number with its unit. A run that would grow past GLUE_MAX characters is
 * left to break.
 */
function glued(words) {
	const out = [];
	let tie = false;
	let open = false;
	for (const w of words) {
		const last = out[out.length - 1];
		const join = last !== undefined && (tie || open || TIES.has(w) || (NUMBER.test(last.split(' ').pop()) && UNIT.test(w)));
		if (join && last.length + 1 + w.length <= GLUE_MAX) out[out.length - 1] = `${last} ${w}`;
		else out.push(w);
		const now = out[out.length - 1];
		// (a formula's parenthesis keeps its words together until it closes)
		open = (open || MATH_OPEN.test(w)) && depth(now) > 0;
		tie = TIES.has(w);
	}
	return out;
}

/**
 * Prose as comment lines, wrapped at COMMENT_WIDTH: `indent` before each
 * '# '. Each line of the text is a paragraph; one that starts with spaces
 * keeps them (an indented formula, a list item), and its continuation lines
 * line up under its text (under the text after "a. " for an item). A formula
 * around '=' and a number with its unit stay on one line (glued).
 */
export function comment(text, indent = '') {
	const out = [];
	for (const para of String(text).split('\n')) {
		const lead = /^ */.exec(para)[0];
		const words = glued(para.trim().split(/\s+/).filter(Boolean));
		if (!words.length) {
			out.push(`${indent}#`);
			continue;
		}
		const hang = lead + (/^\w\. /.test(para.trim()) ? '   ' : '');
		let line = `${indent}# ${lead}`;
		let fresh = true;
		for (const w of words) {
			if (!fresh && line.length + 1 + w.length > COMMENT_WIDTH) {
				out.push(line);
				line = `${indent}# ${hang}${w}`;
				continue;
			}
			line += fresh ? w : ` ${w}`;
			fresh = false;
		}
		out.push(line);
	}
	return out.join('\n');
}

/** A section's header line: '# --- 1 The template ---...' to 88 characters. */
export function header(title) {
	const head = `# --- ${title} `;
	return head + '-'.repeat(Math.max(3, 88 - head.length));
}

/** A numbered section's start: its header, and the print of its title under it. */
export const section = (title) => `${header(title)}\nprint(${pyStr(title)})`;

/**
 * A list literal `name = [v, v, ...]  # tail`, on one line when it fits,
 * else one item per slot wrapped at PY_WIDTH with a trailing comma.
 */
export function pyList(name, items, tail = '') {
	const one = `${name} = [${items.join(', ')}]${tail ? `  # ${tail}` : ''}`;
	if (one.length <= PY_WIDTH) return one;
	const lines = [];
	let line = IND;
	for (const item of items) {
		const piece = `${item},`;
		if (line.trim() && line.length + 1 + piece.length > PY_WIDTH) {
			lines.push(line);
			line = IND;
		}
		line += line.trim() ? ` ${piece}` : piece;
	}
	if (line.trim()) lines.push(line);
	return `${name} = [\n${lines.join('\n')}\n]${tail ? `  # ${tail}` : ''}`;
}

/**
 * A dict literal `name = {k: v, ...}  # tail` from its 'k: v' items, on one
 * line when it fits, else one item a line (the tail after the brace).
 */
export function pyDict(name, items, tail = '') {
	const note = tail ? `  # ${tail}` : '';
	const one = `${name} = {${items.join(', ')}}${note}`;
	if (one.length <= PY_WIDTH && !one.includes('\n')) return one;
	return [`${name} = {${note}`, ...items.map((item) => `${IND}${item},`), '}'].join('\n');
}

/** Code indented by `levels` steps, every non-empty line. */
export function indent(code, levels = 1) {
	const pad = IND.repeat(levels);
	return code
		.split('\n')
		.map((l) => (l ? pad + l : l))
		.join('\n');
}

/**
 * The file being written: blocks of code in order, and helper functions
 * that several sections use, each written once, before its first use.
 *   add(code)        appends a block (a section, a loop, a print)
 *   once(name, code) appends code the first time `name` is asked for and
 *                    returns true then; later calls add nothing
 *   has(name)        whether `name` was written
 *   imports          the modules the file imports (a Set: add to it), written
 *                    under the first block, the docstring
 *   text()           the file, blocks two lines apart around a function
 *                    or a header, one line apart otherwise (PEP 8)
 */
export class PyFile {
	constructor() {
		this.blocks = [];
		this.names = new Set();
		this.imports = new Set();
	}
	add(code) {
		if (code && code.trim()) this.blocks.push(code.replace(/\s+$/, ''));
		return this;
	}
	/** Appends code to the last block, right under it (no blank line): what goes on from it, as a report under its table. */
	follow(code) {
		if (!this.blocks.length || /^(def |class )/m.test(this.blocks[this.blocks.length - 1])) return this.add(code);
		if (code && code.trim()) this.blocks[this.blocks.length - 1] += `\n${code.replace(/\s+$/, '')}`;
		return this;
	}
	once(name, code) {
		if (this.names.has(name)) return false;
		this.names.add(name);
		this.add(code);
		return true;
	}
	has(name) {
		return this.names.has(name);
	}
	text() {
		// (a section's header right above its first block; two blank lines around a top-level
		// function and before a header, one elsewhere: PEP 8)
		const hasDef = (b) => /^(def |class )/m.test(b);
		const isHeader = (b) => /^# --- [^\n]*$/.test(b);
		// (a section's start: its header and the print of its title, code: a function after it still
		// takes two blank lines)
		const isStart = (b) => /^# --- [^\n]*\nprint\("[^\n]*"\)$/.test(b);
		const blocks = this.imports.size ? [this.blocks[0], [...this.imports].sort().map((m) => `import ${m}`).join('\n'), ...this.blocks.slice(1)] : this.blocks;
		let out = '';
		blocks.forEach((b, i) => {
			if (i > 0) {
				const prev = blocks[i - 1];
				const tight = isHeader(prev) || (isStart(prev) && !hasDef(b));
				out += tight ? '\n' : hasDef(b) || hasDef(prev) || b.startsWith('# --- ') ? '\n\n\n' : '\n\n';
			}
			out += b;
		});
		const text = `${out}\n`;
		assertAscii(text);
		const long = text.split('\n').find((l) => l.length > PY_WIDTH);
		if (long) throw new Error(`line over ${PY_WIDTH} characters: ${long}`);
		return text;
	}
}

/**
 * A line of code with a comment at its end, or with the comment on the line
 * above where the two do not fit in PY_WIDTH (a band side's longer names).
 */
export function noted(code, note, indent = '') {
	const one = `${indent}${code}  # ${note}`;
	return one.length <= PY_WIDTH ? one : `${indent}# ${note.charAt(0).toUpperCase()}${note.slice(1)}:\n${indent}${code}`;
}

/**
 * A call `head(first, rest)` on one line, or broken after `first` with the
 * rest lined up under it where the line would pass PY_WIDTH.
 */
export function fitCall(head, first, rest) {
	const one = `${head}(${first}, ${rest})`;
	return one.length <= PY_WIDTH ? one : `${head}(${first},\n${' '.repeat(head.length + 1)}${rest})`;
}

/** A list in words: 'a', 'a and b', 'a, b and c'. */
export const listWords = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''));

/** A number as prose prints it: 4 figures, no exponent for the usual sizes (10000, 0.2857). */
export function prose(x, digits = 4) {
	return String(Number(x.toPrecision(digits)));
}
