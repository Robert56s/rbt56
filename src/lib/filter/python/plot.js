import { comment } from './emit';

/**
 * The Bode plot of both part sets with the template's limits, drawn only
 * when matplotlib imports; without it, a short table of the response and
 * how to get the plot. The gains are read from the top of each set's
 * passband, as the check reads them; gain_db stops at -240 dB (|H| held at
 * 1e-12), so the table writes "under -200" past -200 dB. The frequency span
 * of a low-pass is the page's Bode plot's (fp / 50 to 10 fs), a high-pass's
 * the same turned round (fs / 10 to 50 fp: its passband as wide); the
 * table's points are the edges, their geometric middle and a decade out
 * from each. Without the page's parts (ctx.pageComplete false), the file's
 * alone; without the file's (a stage its rule cannot build), the page's.
 * A band filter passes its own frame (band.js): { points, span, limits },
 * the Python of the table's frequencies, of the span's two ends and of the
 * lines that draw its limits.
 */
export function plot(file, ctx, frame = lowHighFrame(ctx.lp)) {
	file.add(
		[
			comment('Drawn only when matplotlib is installed; otherwise a short table of the response.'),
			'try:',
			'    import matplotlib.pyplot as plt',
			'except ImportError:',
			'    plt = None',
			'if plt is None:',
			'    print("The response in dB from the top of the passband (pip install matplotlib draws it):")',
			'    print("              f" + "".join(f"{name:>19}" for name, _, _ in sets))',
			`    for f in (${frame.points}):`,
			'        gains = [gain_db(part_set, f) - c["top"] for _, part_set, c in sets]',
			'        text = [f"{g:19.2f}" if g > -200 else f"{\'under -200\':>19}" for g in gains]',
			'        print(f"  {eng(f, \'Hz\'):>13}" + "".join(text))',
			'else:',
			`    lo, hi = ${frame.span[0]}, ${frame.span[1]}`,
			'    freqs = [lo * (hi / lo) ** (i / 299) for i in range(300)]',
			'    for name, part_set, c in sets:',
			'        plt.semilogx(freqs, [gain_db(part_set, f) - c["top"] for f in freqs], label=name)',
			...frame.limits.map((line) => `    ${line}`),
			'    plt.xlim(lo, hi)',
			'    plt.xlabel("frequency (Hz)")',
			'    plt.ylabel("gain from the top of the passband (dB)")',
			'    plt.grid(True, which="both", alpha=0.3)',
			'    plt.legend()',
			'    plt.show()'
		].join('\n')
	);
}

/** The frame of a low-pass or a high-pass. */
function lowHighFrame(lp) {
	return {
		points: lp ? 'fp / 10, fp, math.sqrt(fp * fs), fs, fs * 10' : 'fs / 10, fs, math.sqrt(fp * fs), fp, fp * 10',
		span: lp ? ['fp / 50', 'fs * 10'] : ['fs / 10', 'fp * 50'],
		limits: lp
			? ['plt.hlines(-amax, lo, fp, colors="0.5", linestyles="--", label="amax and amin")', 'plt.hlines(-amin, fs, hi, colors="0.5", linestyles="--")']
			: ['plt.hlines(-amax, fp, hi, colors="0.5", linestyles="--", label="amax and amin")', 'plt.hlines(-amin, lo, fs, colors="0.5", linestyles="--")']
	};
}
