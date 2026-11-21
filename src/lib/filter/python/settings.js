import { comment, header, PY_WIDTH, pyNum, pyStr } from './emit';
import { stockSettings } from './stock';

/**
 * The docstring and the SETTINGS block. The docstring says what the file is
 * (`what`, one sentence: the filter type, the response, the stages), that
 * the page wrote it for this design, how to run it and that SETTINGS can be
 * edited. SETTINGS holds what a reader may change and run again: the spec,
 * the placement, the source resistance, the stock and the capacitors typed
 * on the page; then the names the results end up in.
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
 * The docstring of every file the generator writes: `what` its summary line
 * (the filter type, the response, the stages), `against` what its parts are
 * checked against (a narrow band-pass's spec), `detail` a sentence that opens
 * the next paragraph where the summary leaves something out (a band filter's
 * stages).
 */
export function docstring(what, against = 'template', detail = '') {
	return [
		...wrapped(what, PY_WIDTH, '"""'),
		'',
		...wrapped(`${detail ? `${detail} ` : ''}rbt56.com/tools/filter-design/ wrote this file for one design. It works through the ${against} step by step, proposes the parts of every stage with a simple rule, and checks them against the ${against}, together with the parts the page shows for the same design.`, 96),
		'',
		...wrapped('Run it with Python 3.8 or newer, nothing to install: python filter-design.py. The SETTINGS block can be edited and the file run again. With matplotlib installed, it also draws the Bode plot.', 96),
		'"""'
	].join('\n');
}

/**
 * The names the results end up in, as the comment the checks read lists them
 * (scripts/lib-python.mjs reads this very comment): `names` in order.
 */
export function resultsComment(names) {
	return comment(`After a run, these names hold the results: ${names.join(', ')}.`);
}

/** The order setting: None for the minimum, or the order the page was given. */
export function orderSetting(name, design) {
	const min = design.orderSearch ? design.minOrder : Math.max(1, Math.ceil(design.minOrder));
	return design.n === min || !Number.isFinite(min)
		? `${name} = None  # None for the minimum order, or a whole number`
		: `${name} = ${design.n}  # the order set on the page (the minimum is ${min}); None for the minimum`;
}

/** SETTINGS for a low-pass or a high-pass. */
export function settings(ctx) {
	const { design } = ctx;
	const lines = [
		header('SETTINGS'),
		`fp = ${pyNum(design.fp)}  # Hz, the passband edge`,
		`fs = ${pyNum(design.fs)}  # Hz, the stopband edge`,
		`amax = ${pyNum(design.amaxDb)}  # dB, the most loss allowed over the passband`,
		`amin = ${pyNum(design.aminDb)}  # dB, the least loss required over the stopband`,
		orderSetting('order', design),
		`placement = ${pyStr(ctx.placement)}  # "edge": amax lost exactly at fp; "centred": the middle of the room left`,
		`rs = ${pyNum(ctx.rs)}  # ohm, the source resistance in series with the input (0 for an ideal source)`
	];
	return [lines.join('\n'), stockSettings(ctx), resultsComment(['k', 'n_exact', 'n', 'wc', 'stages', 'own_parts', 'own_check', 'page_parts', 'page_check'])].join('\n\n');
}
