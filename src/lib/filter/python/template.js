import { comment, pyRaise } from './emit';

/**
 * Section 1, the template of a low-pass or a high-pass: the check of the
 * settings, k, and the passband and stopband stretches the check reads
 * (filterTemplate in partSearch.js: two decades of each).
 *
 * The stretches are the names `passband` and `stopband`: lists of
 * (from Hz, to Hz, limit dB), the limit the most loss over a passband
 * stretch and the least over a stopband stretch. The check (check.js)
 * reads them as they are.
 */

/** eng(), the printout's values with their units, written once before section 1. */
export function engHelper(file) {
	file.once(
		'eng',
		[
			'def eng(v, unit):',
			'    """A value with its unit\'s prefix, to 4 figures: eng(4700, "ohm") is "4.7 kohm"."""',
			'    for prefix, scale in [("M", 1e6), ("k", 1e3), ("", 1.0), ("m", 1e-3), ("u", 1e-6), ("n", 1e-9),',
			'                          ("p", 1e-12)]:',
			'        if abs(v) >= scale or prefix == "p":',
			'            return f"{v / scale:.4g} {prefix}{unit}"'
		].join('\n')
	);
}

export function template(file, ctx) {
	const lp = ctx.lp;
	file.add(
		[
			comment(
				lp
					? 'A low-pass keeps fp and below within amax of the top of its passband, and loses at least amin from fs up. The check (6) reads two decades of each, as the page does.'
					: 'A high-pass keeps fp and above within amax of the top of its passband, and loses at least amin from fs down. The check (6) reads two decades of each, as the page does.'
			),
			lp ? 'if not (0 < fp < fs and 0 < amax < amin):' : 'if not (0 < fs < fp and 0 < amax < amin):',
			pyRaise(lp ? 'A low-pass needs 0 < fp < fs and 0 < amax < amin: see SETTINGS.' : 'A high-pass needs 0 < fs < fp and 0 < amax < amin: see SETTINGS.', '    '),
			lp ? 'k = fp / fs  # the transition ratio, under 1' : 'k = fs / fp  # the transition ratio, under 1',
			lp ? 'passband = [(fp / 100, fp, amax)]  # (from Hz, to Hz, the most loss in dB)' : 'passband = [(fp, fp * 100, amax)]  # (from Hz, to Hz, the most loss in dB)',
			lp ? 'stopband = [(fs, fs * 100, amin)]  # (from Hz, to Hz, the least loss in dB)' : 'stopband = [(fs / 100, fs, amin)]  # (from Hz, to Hz, the least loss in dB)',
			lp ? 'print(f"  k = fp / fs = {k:.4f}")' : 'print(f"  k = fs / fp = {k:.4f}")',
			`print(f"  passband {eng(${lp ? 'fp / 100' : 'fp'}, 'Hz')} to {eng(${lp ? 'fp' : 'fp * 100'}, 'Hz')}: at most {amax:g} dB of loss")`,
			`print(f"  stopband {eng(${lp ? 'fs' : 'fs / 100'}, 'Hz')} to {eng(${lp ? 'fs * 100' : 'fs'}, 'Hz')}: at least {amin:g} dB of loss")`
		].join('\n')
	);
}
