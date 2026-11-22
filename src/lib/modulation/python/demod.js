import { comment, header, pyEng, pyNum, pyPrints, pyRaise, PyFile, section } from '../../filter/python/emit';
import { diodeCurrentHelper, diodeSettings } from './diodeLaw';
import { CIRCUITS, envelopeTargets, orderSection, partsSection, polesSection, sallenKeyFallback } from './lowpass';
import { adviceCode, docstring, engHelper, flow, limitNoteCode, nearestCode, pageValue, resultsComment, settingsHeader, stockOf, stockSettings, tableCode } from './shared';

/**
 * am-demodulator.py: the page's envelope demodulator, a rectifier (the
 * precision full-wave circuit, or one diode with R_L) and the envelope
 * low-pass, with its output through a capacitor into a load when the page
 * has one. The sections:
 *   1 the template       the ripple, its nearest sideband fs, k
 *   2 the rectifier      R1 = R2 = R3 (or R_L) the stocked value nearest 1 kohm
 *   3 the order          Butterworth or Chebyshev, even, at most 8
 *   4 the stages         the normalized poles and each stage's f0 and Q
 *   5 the parts          the file's own rule for each stage (lowpass.js)
 *   6 the output         C_out into the load, as the page sizes it
 *   7 the check          both sets: the template, the sharpest Q, what comes
 *                        out (the precision rectifier's 2/pi, or the bare
 *                        diode worked out cycle by cycle), the op-amps'
 *                        swing, the message band through C_out and what the
 *                        load takes; then what the page says of each check
 *                        missed
 *   then the page's preview: the wave, rectified, and its envelope.
 * args (demodArgs below): what the page's downloadDemod passes.
 */

/**
 * The arguments, filled in:
 *   rectifierType  'full' or 'half'; fpCarrier, fmMax, amaxDb, aminDb,
 *                  order (null for the minimum), response ('butterworth' or
 *                  'chebyshev'), topology ('sallenKey' or 'mfb'), index (the
 *                  test wave's), amplitude (its carrier), opampSwing,
 *                  outputCoupling, loadOhms, fmMin
 *   stock          { kind, resistors, capacitors, pairs, pairLimit }
 *   page           the page's parts: R (the rectifier's R1 = R2 = R3, or
 *                  R_L), stages [{ parts (the stage's components), shortfall
 *                  (built from E24 and E6 as the stock cannot) }], Cout (null
 *                  without the output stage)
 *   limitNote      the page's note on its limit of pairs (pairLimitNote), or
 *                  null
 */
function demodArgs(raw) {
	const a = { ...raw, stock: stockOf(raw.stock) };
	a.full = a.rectifierType !== 'half';
	a.circuit = CIRCUITS[a.topology] ?? 'sallen_key';
	a.coupling = Boolean(a.outputCoupling);
	a.ripple = a.full ? 2 * a.fpCarrier : a.fpCarrier;
	return a;
}

function settings(a) {
	const lines = [
		settingsHeader(),
		comment(`The ${a.full ? 'precision full-wave rectifier (two op-amps, two diodes)' : 'half-wave rectifier, one diode with R_L to ground,'} then a ${a.response === 'chebyshev' ? 'Chebyshev' : 'Butterworth'} low-pass of ${a.circuit === 'mfb' ? 'MFB' : 'Sallen-Key'} stages.`),
		`fp = ${pyNum(a.fpCarrier)}  # Hz, the carrier`,
		`fm_max = ${pyNum(a.fmMax)}  # Hz, the highest message frequency: the low-pass's passband edge`,
		`amax = ${pyNum(a.amaxDb)}  # dB, the most loss over the message band`,
		`amin = ${pyNum(a.aminDb)}  # dB, the least loss from the ripple's nearest sideband up`,
		a.order === null || a.order === undefined ? 'order = None  # None for the minimum, or an even whole number' : `order = ${a.order}  # the order set on the page; None for the minimum`,
		`amplitude = ${pyNum(a.amplitude)}  # V, the carrier's peak at the input`,
		`index = ${pyNum(a.index)}  # the test wave's modulation index`,
		`opamp_swing = ${pyNum(a.opampSwing)}  # V, what the op-amps reach on their rails`
	];
	if (a.coupling) lines.push(`load = ${pyNum(a.loadOhms)}  # ohm, what the output drives through C_out`, `fm_min = ${pyNum(a.fmMin)}  # Hz, the lowest message frequency C_out passes`);
	if (!a.full) lines.push('', diodeSettings('1N4148', { role: 'The rectifier\'s diode' }));
	const stock = [stockSettings(a.stock, { caps: 'e6', pairsWhere: 'over the whole low-pass' })];
	if (a.coupling) {
		if (a.stock.capacitors) stock.push('E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8]  # (for a C_out the list has none of)');
		stock.push('electrolytics = [round(m * 10 ** d, 1 - d) for d in range(-12, -1) for m in E6]  # F, to 68 mF');
	}
	const results = ['k', 'fs', 'n_exact', 'n', 'stages', 'own_parts', 'own_check', 'page_parts', 'page_check'];
	return [lines.join('\n'), stock.join('\n'), resultsComment(results)].join('\n\n');
}

function templateSection(file, a) {
	file.add(
		[
			comment(
				`The ${a.full ? 'precision rectifier gives |x|: its ripple sits at twice the carrier' : 'diode passes the positive half of each cycle: its ripple sits at the carrier itself'}, and the message rides on the ripple as sidebands, the nearest at the ripple's frequency minus fm_max. That is where the low-pass's stopband starts: it passes fm_max and below losing at most amax, and loses at least amin from fs up.`
			),
			`ripple = ${a.full ? '2 * fp' : 'fp'}  # Hz`,
			'fs = ripple - fm_max  # Hz, the stopband edge',
			'if not (0 < fm_max < fp and fs > fm_max and 0 < amax < amin and 0 < index <= 1 and amplitude > 0',
			'        and opamp_swing > 0):',
			pyRaise('The message has to sit under the carrier and under the ripple\'s nearest sideband, 0 < amax < amin, 0 < index <= 1: see SETTINGS.', '    '),
			'k = fm_max / fs',
			'print(f"  ripple at {eng(ripple, \'Hz\')}, its nearest sideband fs = {eng(fs, \'Hz\')}:"',
			'      f" k = fm_max / fs = {k:.4f}")'
		].join('\n')
	);
}

function rectifierSection(file, a) {
	file.add(
		[
			comment(
				a.full
					? "The precision rectifier: U1A follows the input on the positive half, and on the negative one U1B inverts it through R1 and R2 (R3 ties its + input to ground), so with R1 = R2 the output is |V_in|, no diode drop in it. Its mean is 2/pi of the carrier. Any equal value sets the gain; 1 kohm, the value TI used, keeps the switched-off diode's few pF from leaking the carrier: the stocked value nearest it, as the page takes it."
					: "One diode, R_L from its cathode to ground: the return path that lets the output come down when the envelope does. Each crest loses the diode's drop, and the diode stops conducting where the envelope dips under it, so what comes out is worked out cycle by cycle in the check. R_L is the stocked value nearest 1 kohm, as the page takes it."
			),
			`r_rect = ${nearestCode('1e3')}  # ohm, ${a.full ? 'R1 = R2 = R3' : 'R_L'}`,
			`print(f"  ${a.full ? 'R1 = R2 = R3' : 'R_L'} = {eng(r_rect, 'ohm')}, the stocked value nearest 1 kohm")`
		].join('\n')
	);
}

function couplingSection(file, a) {
	file.add(
		[
			comment(
				`The filter hands the message back on a DC level, the rectifier's average of the carrier, which a load would take as a steady current. C_out in series blocks it, and with the load R_load makes a first-order high-pass, f_c = 1 / (2 pi R_load C). It is sized on the passband spec, at most amax lost at fm_min:\n    f_c <= fm_min sqrt(10^(amax/10) - 1),  C_out >= 1 / (2 pi R_load f_c)\nthen rounded up, to the stock, else to the next E6 value electrolytics come in: a larger C only flattens the low end. The file takes it the page's way. An electrolytic's + plate goes to the side that sits higher in DC: the filter's output when its level is positive, the load (at 0 V through R_load) when ${a.circuit === 'mfb' ? 'an odd count of MFB stages turns it negative' : 'it is negative'}.`
			),
			'if not (load > 0 and 0 < fm_min < fm_max):',
			pyRaise('The load has to be over 0 ohm and fm_min between 0 and fm_max: see SETTINGS.', '    '),
			'fc_max = fm_min * math.sqrt(10 ** (amax / 10) - 1)',
			'c_target = 1 / (2 * math.pi * load * fc_max)',
			'stocked = [v for v in capacitors if v >= c_target * (1 - 1e-9)]',
			'c_out = min(stocked or [v for v in electrolytics if v >= c_target * (1 - 1e-9)])',
			'print(f"  f_c at most {fc_max:.4g} Hz: C_out at least {eng(c_target, \'F\')} -> {eng(c_out, \'F\')}")',
			'if not stocked:',
			a.stock.capacitors ? '    print("  none on the list is as large: the next E6 value")' : '    print("  the next E6 value an electrolytic comes in")',
			a.circuit === 'mfb'
				? 'print("  an electrolytic, rated 16 V or more, its + plate toward "\n      + ("the load" if (n // 2) % 2 else "the filter\'s output"))'
				: 'print("  an electrolytic, rated 16 V or more, its + plate toward the filter\'s output")'
		].join('\n')
	);
}

/** The page's parts as data: the rectifier's R, each stage's parts (its pairs and its fallback said above it), C_out. */
function pagePartsCode(a) {
	const e12 = a.circuit === 'sallen_key' && !a.stock.capacitors ? '; the page takes each Cbottom from E6 and rounds Ctop to E12, so a Ctop may be a value the E6 list above does not hold' : '';
	const lines = [limitNoteCode(a.limitNote), comment(`The parts the page shows for this design, checked the same way${e12}:`)].filter(Boolean);
	lines.push(`page_parts = {"R": ${pageValue('R', a.page.R, { pairs: false }).text}, "stages": [`);
	a.page.stages.forEach((stage, i) => {
		const values = Object.entries(stage.parts).map(([name, v]) => [name, stage.shortfall ? pageValue(name, v, { pairs: false }) : pageValue(name, v, a.stock)]);
		const pairs = values.filter(([, v]) => v.pair).map(([name]) => name);
		if (stage.shortfall) lines.push(`    # stage ${i + 1}: the parts on hand cannot build it, so the page takes E24 and E6/E12`);
		else if (pairs.length) lines.push(`    # stage ${i + 1}: ${pairs.length > 1 ? `${pairs.slice(0, -1).join(', ')} and ${pairs[pairs.length - 1]} are each` : `${pairs[0]} is`} two resistors in series`);
		lines.push(flow('    {', values.map(([name, v]) => `"${name}": ${v.text}`), '},'));
	});
	lines.push(`]${a.coupling ? `, "Cout": ${pyEng(a.page.Cout)}` : ''}}`);
	return lines.join('\n');
}

function checkSection(file, a) {
	const mfb = a.circuit === 'mfb';
	const words = [
		"each stage 1 / |1 - x^2 + j x / Q| with x = w / w0, multiplied, read as the page reads the template: the passband's highest and lowest gain from 0 to fm_max (201 points), whose span may reach amax, and the loss at fs, which has to reach amin (each with 0.1 dB of slack); the sharpest stage's Q, at most 4 (past it a stage leans on the op-amp)",
		a.full
			? `what comes out for the test wave, the precision rectifier's exact 2/pi: a mean of ${mfb ? '(-1)^stages ' : ''}2 amplitude / pi and a tone of 2 amplitude index |H(fm_max)| / pi`
			: `what comes out for the test wave, the bare diode worked out cycle by cycle: over 48 points of a message cycle, the average of one carrier cycle of the diode's current into R_L (and the first stage's R1, which the carrier sees in parallel)${mfb ? ", which the MFB's R1 takes as DC too" : ', with the DC that current pushes through R_L, which the diode works against, found by bisection'}; and that tone against an ideal diode's, amplitude index |H(fm_max)| / pi`,
		`the op-amps' swing: ${a.full ? "U1A runs one diode's drop past the crest, amplitude (1 + index) + 0.7 V, and " : ''}the filter's output reaches its level plus the tone`,
		...(a.coupling ? ["the message band through the low-pass and C_out together, from fm_min to fm_max (201 points), whose span may reach amax too; and what the load takes at the tone's crest, at most 10 mA (past it a TL08x no longer drives the load cleanly), and 1 mW in earphones (600 ohm or less), which already play loud from it"] : [])
	];
	file.add(comment(`Each set of parts goes through the same evaluation: ${words.join('; ')}.`));
	file.add(pagePartsCode(a));
	file.add(
		[
			'if len(page_parts["stages"]) != len(stages):  # (settings edited to another order)',
			'    print("  the page\'s parts hold the stages of its own settings, not these: left out")',
			'    page_parts = None'
		].join('\n')
	);
	if (!a.full) diodeCurrentHelper(file);
	const fns = [
		'def gain(figs, f):',
		'    """|H| of the stages whose figures are figs at f: each 1 / |1 - x^2 + j x / Q|, x = w / w0."""',
		'    w = 2 * math.pi * f',
		'    h = 1.0',
		'    for fig in figs:',
		'        x = w / fig["w0"]',
		'        h /= math.hypot(1 - x * x, x / fig["q"])',
		'    return h'
	];
	if (!a.full) {
		fns.push(
			'',
			'',
			'def half_wave_mean(height, r1):',
			...(mfb
				? [
						'    """The average of the diode\'s output over one carrier cycle of this height: the diode law into',
						'    R_L with the first stage\'s R1 in parallel. The MFB\'s R1 takes the DC too, so the DC sees what',
						'    the carrier sees and nothing more holds the diode back: the plain mean of its current."""',
						'    rac = (r_rect * r1) / (r_rect + r1)',
						'    total = 0.0',
						'    for k in range(96):',
						'        total += diode_current(height * math.cos((2 * math.pi * k) / 96), rac)',
						'    return rac * (total / 96)'
					]
				: [
						'    """The average of the diode\'s output over one carrier cycle of this height: the diode law into',
						'    R_L, the first stage\'s R1 in parallel for the carrier\'s swing; the DC it pushes through R_L',
						'    alone (a Sallen-Key takes none), which the diode works against, found by bisection."""',
						'    rac = (r_rect * r1) / (r_rect + r1)',
						'    lo, hi = 0.0, height / r_rect',
						'    for _ in range(40):',
						'        mid = (lo + hi) / 2',
						'        total = 0.0',
						'        for k in range(96):',
						'            v = height * math.cos((2 * math.pi * k) / 96) - (r_rect - rac) * mid',
						'            total += diode_current(v, rac)',
						'        lo, hi = (mid, hi) if total / 96 > mid else (lo, mid)',
						'    return (r_rect * (lo + hi)) / 2'
					])
		);
	}
	file.add(fns.join('\n'));
	// (each MFB stage turns the level over: (-1)^stages)
	const signed = (x) => (mfb ? `(-1) ** len(figs) * ${x}` : x);
	const output = a.full
		? [`    mean = ${signed('(2 / math.pi) * amplitude')}`, '    tone = (2 / math.pi) * amplitude * index * gain(figs, fm_max)']
		: [
				'    m0 = re = im = 0.0',
				'    for i in range(48):',
				'        ph = (2 * math.pi * i) / 48',
				'        y = half_wave_mean(amplitude * (1 + index * math.sin(ph)), p["stages"][0]["R1"])',
				'        m0, re, im = m0 + y, re + y * math.cos(ph), im + y * math.sin(ph)',
				`    mean = (${signed('m0')}) / 48`,
				'    tone = ((2 * math.hypot(re, im)) / 48) * gain(figs, fm_max)',
				'    ideal = (1 / math.pi) * amplitude * index * gain(figs, fm_max)  # an ideal diode\'s tone'
			];
	const checks = [
		'"passband": span <= amax + 0.1',
		'"stopband": -at_fs >= amin - 0.1',
		'"sharpest Q": max(fig["q"] for fig in figs) <= 4',
		'"swing": needed <= opamp_swing',
		...(a.coupling ? ['"band": band_span <= amax + 0.1', '"current": current <= 0.01', '"power": load > 600 or power <= 1e-3'] : [])
	];
	const cells = [
		'*[f"{eng(fig[\'w0\'] / (2 * math.pi), \'Hz\')}, {fig[\'q\']:.4g}" for fig in figs]',
		'f"{span:.3f} dB"',
		'f"{-at_fs:.2f} dB"',
		'f"{max(fig[\'q\'] for fig in figs):.3g}"',
		'f"{eng(mean, \'V\')}, {eng(tone, \'V\')}"',
		...(a.full ? [] : ['f"{100 * tone / ideal:.0f} % of {eng(ideal, \'V\')}"']),
		'eng(needed, "V")',
		...(a.coupling ? ['f"{band_span:.3f} dB"', 'f"{eng(tone_load, \'V\')}, {eng(current, \'A\')}"', 'eng(power, "W")'] : []),
		'"meets" if not misses else f"misses {len(misses)}"'
	];
	// what the page says of each check missed, as its flags say it
	const advice = [
		['passband', 'The passband: a finer stock or a looser amax brings it back.'],
		['stopband', 'The stopband: a finer stock, or a larger amin, which adds a stage, fixes it.'],
		['sharpest Q', 'The sharpest Q: Butterworth, a tighter amax or a lower amin brings it down.'],
		['swing', 'The swing: a divider before the rectifier, or wider rails, keeps the crest inside.'],
		...(a.coupling
			? [
					['band', 'The band through C_out: a lower fm_min or a looser amax brings it back.'],
					['current', 'The current: past 10 mA a TL08x distorts; an LM386 between the two takes it.'],
					['power', 'The power: earphones play loud from 1 mW; a volume potentiometer brings it down.']
				]
			: [])
	];
	file.add(
		[
			'def check(name, p):',
			'    """A set of parts through the evaluation above: its figures, its checks (True when met), the',
			'    verdict and its cells in the table below."""',
			'    figs = [figures(stage) for stage in p["stages"]]',
			'    grid = [(fm_max * i) / 200 or fm_max / 1000 for i in range(201)]',
			'    passband = [20 * math.log10(gain(figs, f)) for f in grid]',
			'    span = max(passband) - min(passband)',
			'    at_fs = 20 * math.log10(gain(figs, fs))',
			...output,
			a.full ? '    needed = max(amplitude * (1 + index) + 0.7, abs(mean) + tone)' : '    needed = abs(mean) + tone  # (the bare diode has no op-amp of its own)',
			...(a.coupling
				? [
						'    fc = 1 / (2 * math.pi * load * p["Cout"])',
						'    band = [20 * math.log10(gain(figs, f) / math.sqrt(1 + (fc / f) ** 2))',
						'            for f in (fm_min * (fm_max / fm_min) ** (i / 200) for i in range(201))]',
						'    band_span = max(band) - min(band)',
						'    tone_load = tone / math.sqrt(1 + (fc / fm_max) ** 2)',
						'    current = tone_load / load  # A, at the tone\'s crest',
						'    power = tone_load ** 2 / (2 * load)  # W'
					]
				: []),
			flow('    checks = {', checks, '}'),
			'    misses = [key for key, ok in checks.items() if not ok]',
			flow('    cells = [', cells, ']'),
			'    return {"figures": figs, "span": span, "at_fs": at_fs, "mean": mean, "tone": tone,',
			`            "needed": needed,${a.full ? '' : ' "ideal": ideal,'}${a.coupling ? ' "fc": fc, "band_span": band_span,' : ''}`,
			...(a.coupling ? ['            "tone_load": tone_load, "current": current, "power": power,'] : []),
			'            "checks": checks, "misses": misses, "meets": not misses, "cells": cells}'
		].join('\n')
	);
	const rows = [
		'*[f"stage {i + 1}: f0, Q" for i in range(len(stages))]',
		'f"passband span, at most {amax:g} dB"',
		'f"loss at fs, at least {amin:g} dB"',
		'"the sharpest Q, at most 4"',
		'"output mean, tone"',
		...(a.full ? [] : ['"the tone, of an ideal diode\'s"']),
		'f"op-amp swing needed, within {opamp_swing:g} V"',
		...(a.coupling ? ['f"band through C_out, at most {amax:g} dB"', '"tone, current at the load, at most 10 mA"', '"power, at most 1 mW in earphones"'] : []),
		'"verdict"'
	];
	const why =
		a.circuit === 'mfb'
			? `the page picks the pair of capacitors that puts R1 = R3 and R2 nearest 10 kohm${a.stock.pairs ? ' and may build them of two in series' : ''}, the file's rule the one whose rounding lands f0 and Q closest`
			: `the page builds R1 = R2${a.stock.pairs ? ', maybe of two in series,' : ''} and rounds Ctop to ${a.stock.capacitors ? 'the stock' : 'E12'} around 4 Q^2 Cbottom, which moves Q; the file's rule lets R1 and R2 differ and reaches the Q from any pair`;
	file.add(
		[
			'own_parts = None',
			'if own_stages is not None:',
			`    own_parts = {"R": r_rect, "stages": own_stages${a.coupling ? ', "Cout": c_out' : ''}}`,
			'own_check = None if own_parts is None else check("the file\'s parts", own_parts)',
			'page_check = None if page_parts is None else check("the page\'s parts", page_parts)',
			'sets = [("the file\'s parts", own_check), ("the page\'s parts", page_check)]',
			'sets = [(name, chk) for name, chk in sets if chk]  # (the sets there are to check)',
			'if not sets:',
			pyRaise("Neither the file's rule nor the page's parts build these stages: get the file again from the page.", '    '),
			tableCode(rows, 40, { say: false }),
			'if own_check and page_check:',
			'    if own_check["meets"] and page_check["meets"]:',
			'        print("  Both sets meet every check.")',
			'    elif own_check["meets"]:',
			'        print("  The file\'s parts meet every check where the page\'s miss "',
			'              + ", ".join(page_check["misses"]) + ":")',
			pyPrints(`${why}.`, '        '),
			'    elif page_check["meets"]:',
			'        print("  The file\'s parts miss " + ", ".join(own_check["misses"])',
			'              + " where the page\'s meet:")',
			pyPrints('its rule rounds each stage on its own to land f0 and Q closest, where the page\'s span over the whole band can come out lower.', '        '),
			'missed = [key for _, chk in sets for key in chk["misses"]]',
			adviceCode(advice)
		].join('\n')
	);
}

function plotSection(file, a) {
	file.add(
		[
			comment("The page's preview: the modulated input, rectified, and the envelope it carries before the low-pass smooths the ripple away, drawn only when matplotlib is installed; otherwise a short table of the envelope."),
			`average = ${a.full ? '(2 * amplitude) / math.pi  # the rectified wave\'s mean' : 'amplitude / math.pi  # the half-rectified wave\'s mean'}`,
			'try:',
			'    import matplotlib.pyplot as plt',
			'except ImportError:',
			'    plt = None',
			'if plt is None:',
			'    print("The envelope before the low-pass, in V (pip install matplotlib draws the waves):")',
			'    print("        t (ms)        input   rectified")',
			'    for i in range(5):',
			'        m = 1 + index * math.cos(2 * math.pi * i / 4)',
			'        print(f"  {1e3 * i / (4 * fm_max):12.4g}{amplitude * m:13.4f}{average * m:12.4f}")',
			'else:',
			'    t = [4 / fm_max * i / 5999 for i in range(6000)]',
			'    m = [1 + index * math.cos(2 * math.pi * fm_max * x) for x in t]',
			'    wave = [amplitude * mi * math.cos(2 * math.pi * fp * x) for mi, x in zip(m, t)]',
			'    ms = [1e3 * x for x in t]',
			'    plt.plot(ms, wave, color="0.75", linewidth=0.5, label="the modulated input")',
			`    plt.plot(ms, [${a.full ? 'abs(v)' : 'max(v, 0.0)'} for v in wave], linewidth=0.5, label="rectified")`,
			'    plt.plot(ms, [average * mi for mi in m], linewidth=2, label="the envelope it carries")',
			'    plt.xlabel("time (ms)")',
			'    plt.ylabel("V")',
			'    plt.legend()',
			'    plt.show()'
		].join('\n')
	);
}

/** am-demodulator.py for the design on the page (see the header above). */
export function demodFile(raw) {
	const a = demodArgs(raw);
	const targets = envelopeTargets({ response: a.response, amaxDb: a.amaxDb, aminDb: a.aminDb, fp: a.fmMax, fs: a.ripple - a.fmMax, order: a.order });
	const fallback = a.circuit === 'sallen_key' && sallenKeyFallback(targets.stages, a.stock.capacitors);
	const file = new PyFile();
	file.imports.add('math');
	file.imports.add('itertools');
	file.add(
		docstring({
			what: `AM demodulator: a ${a.full ? 'precision full-wave' : 'half-wave'} rectifier and a ${a.response === 'chebyshev' ? 'Chebyshev' : 'Butterworth'} ${a.circuit === 'mfb' ? 'MFB' : 'Sallen-Key'} low-pass.`,
			steps: `from the ripple the rectifier leaves to the low-pass that removes it${a.coupling ? ' and the capacitor into the load' : ''}`,
			name: 'am-demodulator.py',
			plot: "the page's preview"
		})
	);
	file.add(settings(a));
	engHelper(file);
	file.add(section('1 The template'));
	templateSection(file, a);
	file.add(section('2 The rectifier'));
	rectifierSection(file, a);
	file.add(section('3 The order'));
	orderSection(file, a);
	file.add(section('4 The stages'));
	polesSection(file, a);
	file.add(section('5 The parts of each stage'));
	partsSection(file, a, { fallback });
	let at = 6;
	if (a.coupling) {
		file.add(section(`${at++} The output to the load`));
		couplingSection(file, a);
	}
	file.add(section(`${at} The check`));
	checkSection(file, a);
	file.add(header('Preview'));
	plotSection(file, a);
	return file.text();
}
