import { IND, PY_WIDTH, pyRaise } from '../../filter/python/emit';

/**
 * Helpers of the oscillator's generator beside the filter's emit.js (read
 * there: pyNum, pyEng, pyStr, comment, section, PyFile): a function written
 * from its signature, docstring and body.
 */

/** Words that tie their neighbours together in a formula, as emit.js comment() keeps them. */
const TIES = new Set(['=', '>=', '<=', '-', '+', '*', '/', '->']);
/** A number, and a unit that follows one: "1 kV", "100 Mohm". */
const NUMBER = /^[-+]?[\d.]+(e[-+]?\d+)?$/;
const UNIT = /^[kMmunp]?(Hz|F|ohm|dB|V|W|s)[,.;:)]*$/;

/**
 * The words of a text, those that read as one kept together so a line never
 * breaks inside them: each side of an operator written apart ("w / w_target",
 * "x = Rt - Rf1"), and a number with its unit, up to 40 characters a run.
 */
function glued(text) {
	const out = [];
	let tie = false;
	for (const w of text.split(' ')) {
		const last = out[out.length - 1];
		const join = last !== undefined && (tie || TIES.has(w) || (NUMBER.test(last.split(' ').pop()) && UNIT.test(w)));
		if (join && last.length + 1 + w.length <= 40) out[out.length - 1] = `${last} ${w}`;
		else out.push(w);
		tie = TIES.has(w);
	}
	return out;
}

/** A docstring's lines, wrapped so each holds PY_WIDTH characters with its closing quotes. */
function docLines(text, indent = IND) {
	const out = [];
	let line = `${indent}"""`;
	let fresh = true;
	for (const w of glued(text)) {
		if (!fresh && line.length + 1 + w.length > PY_WIDTH - 3) {
			out.push(line);
			line = `${indent}${w}`;
			continue;
		}
		line += fresh ? w : ` ${w}`;
		fresh = false;
	}
	out.push(`${line}"""`);
	return out;
}

/**
 * A top-level function: `def signature:`, its docstring, and its body,
 * lines written one indent in from the def (so a body line of `x = 1` and
 * a nested `    return x` come out at 4 and 8 spaces). A body line may hold
 * several (a wrapped raise); '' is a blank line (around a nested def), and
 * null is no line, so a caller can leave one out.
 */
export function pyDef(signature, doc, body) {
	const lines = body.filter((l) => l !== null && l !== undefined).flatMap((l) => l.split('\n'));
	return [`def ${signature}:`, ...docLines(doc), ...lines.map((l) => (l ? `${IND}${l}` : ''))].join('\n');
}

/** raise SystemExit(...) for a pyDef body, at `indent` within the body: wrapped for the column it lands at in the file. */
export function bodyRaise(text, indent = '') {
	return pyRaise(text, IND + indent)
		.split('\n')
		.map((l) => l.slice(IND.length))
		.join('\n');
}
