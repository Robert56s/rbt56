import { comment, listWords, pyDict, pyList, pyNum, pyPrints, pyStr, section } from '../../filter/python/emit';
import { growthHelper } from './control';
import { pageValue, settingNames } from './settings';
import { bodyRaise, pyDef } from './write';

/**
 * The last section of the oscillator's file, the check: evaluate(), one
 * evaluation of a set of parts (the gain the loop needs, the frequency it
 * runs at, the start, the amplitude held, the op-amp's lag and slew, and
 * the page's tests: whether it starts, holds, and keeps within what the
 * op-amp can do), run on the file's parts and on the page's, written as
 * data with the page's names and the settings the page designed for
 * (page_settings, as_page); a table of both side by side, the parts first,
 * a verdict each; and a sentence on how they differ, or that the settings
 * are no longer the page's.
 *
 * The evaluation is the page's for each part of its design (topologies.js
 * designWith after its parts are chosen): a diode limiter's loop carries
 * the diodes' capacitance as its parts split the string, runs where it is
 * in phase at the start gain, grows by its pole; a lamp or an AGC holds the
 * loop at balance; the quadrature loop runs at its pole with Rn. One
 * difference: the page finds a diode limiter's balance gain and amplitude
 * in its second pass with the split of its first parts, where evaluate()
 * takes each set's own split; the file writes what the page shows
 * (page_gain, page_amplitude, page_verdict) and, where the two differ,
 * says so in one sentence (the check script counts it).
 */

/** The page's parts of the design, [name, value] in the file's order (the page's names). */
export function pagePartsOf(ctx) {
	const { design } = ctx;
	const p = design.parts;
	if (ctx.control === 'diodes') return ctx.kind === 'wien' ? [['R', design.r], ['C', design.c], ['Rg', design.rg], ['Rf1', p.rf1], ['Rf2', p.rf2]] : [['R', design.r], ['C', design.c], ['Rf1', p.rf1], ['Rf2', p.rf2]];
	if (ctx.control === 'lamp') return [['R', design.r], ['C', design.c], ['Rf', p.rf]];
	if (ctx.control === 'jfet') return [['R', design.r], ['C', design.c], ['Rf', p.rf], ['Rser', p.rSeries], ['Ra', p.ra], ['Rb', p.rb], ['Rx', p.rx], ['Cdet', p.cDet]];
	return [['R', design.r], ['C', design.c], ['Ra', p.ra], ['Rb', p.rb], ['Rn', p.rn], ['Rd1', p.rd1], ['Rd2', p.rd2]];
}

/** The page's own verdict on its design, in the words of the file's verdict(). */
export function pageVerdictOf(design) {
	if (!design.starts) return 'do not start';
	if (!(design.limiter.regulates !== false && design.opamp.swingOk)) return 'start, then clip';
	if (!(design.opamp.opampOk && design.opamp.slewOk)) return 'start, op-amp too slow';
	return 'start and hold';
}

/** The own parts' dict of the file, as the sections before left their names. */
function ownPartsCode(ctx) {
	if (ctx.control === 'lamp') return 'own_parts = {"R": r, "C": c, "Rf": rf}';
	if (ctx.control === 'jfet') return 'own_parts = {"R": r, "C": c, "Rf": rf, "Rser": r_ser, "Ra": ra, "Rb": rb, "Rx": rx, "Cdet": c_det}';
	return 'own_parts = {"R": r, "C": c, "Ra": ra, "Rb": rb, "Rn": rn, "Rd1": rd1, "Rd2": rd2}';
}

/** Where R sits, for the note on a pair. */
function rPlaces(ctx) {
	if (ctx.kind === 'wien') return 'in both arms';
	if (ctx.kind === 'quadrature') return 'in both integrators';
	return `in all ${ctx.ladder.sections} sections`;
}

/** The comment on the evaluation, by control. */
function evaluationWords(ctx) {
	const opamp = (n) =>
		`the op-amp's lag atan(f0 N / gbw), N ${n}, and slew 2 pi f0 A, which the page wants under 25 degrees (the textbook R C within 20 %, section 2) and half the slew rate. The verdict: do not start; start, then clip (none held, or one past the swing); start, op-amp too slow (a test above failed); start and hold.`;
	if (ctx.control === 'diodes') {
		return `Each set of parts, its diodes' capacitance in the loop: the gain needed (balance); at the start gain the frequency it runs at, the loop gain there and the growth per cycle exp(2 pi sigma / w) - 1 of its pole s = sigma + j w (L(s) = 1); the amplitude held; ${opamp(ctx.kind === 'wien' ? 'the start gain' : '1 + the start gain')}`;
	}
	if (ctx.control === 'lamp') return `Each set of parts: the gain the loop needs (balance), where the lamp holds it, so the loop runs where it is in phase at that gain; the gain at switch-on with the lamp cold, and how large the loop comes back there; the amplitude, the one asked, which the lamp is chosen for; ${opamp('the gain needed')}`;
	if (ctx.control === 'jfet') return `Each set of parts: the gain the loop needs (balance), where the AGC holds it, so the loop runs where it is in phase at that gain; the amplitude the AGC settles at and its gain at switch-on (agc_amplitude), and how large the loop comes back there; ${opamp('the gain needed')}`;
	return `Each set of parts: the pole with Rn, the frequency the loop runs at and its growth per cycle; the clamp's balance, 1 / Rn + 2 sigma_lag C, and the amplitude it holds; ${opamp('2')}`;
}

/** The op-amp's two tests and the slew, the last lines of every evaluate(): `lag` and `slew` set before. */
const OPAMP_TESTS = '"opamp_ok": textbook_ok and starts and lag <= 25, "slew_ok": slew <= slew_rate / 2}';

/** evaluate() of the design's control. */
function evaluateFn(ctx) {
	const doc = 'What a set of parts does, as the comment above says.';
	const noBalance = ['if g is None:', bodyRaise('The loop finds no balance with these parts on this op-amp.', '    ')];
	if (ctx.control === 'diodes') {
		const wien = ctx.kind === 'wien';
		const ref = wien ? 'parts["Rg"]' : 'parts["R"]';
		return pyDef('evaluate(parts)', doc, [
			'rc = parts["R"] * parts["C"]',
			`diode_cap = (${ref}, parts["Rf2"] / (parts["Rf1"] + parts["Rf2"]), 2 * CJO)`,
			'g = balance(rc, diode_cap)',
			wien ? 'start = 1 + (parts["Rf1"] + parts["Rf2"]) / parts["Rg"]' : 'start = (parts["Rf1"] + parts["Rf2"]) / parts["R"]',
			'found = zero_phase(rc, start, 2 * math.pi * frequency, diode_cap)',
			'f0 = found[0] / (2 * math.pi) if found else k / (2 * math.pi * rc)',
			's, settled = pole(rc, start, diode_cap)',
			'growth = growth_of(s) if settled else None',
			`held = amplitude_held(parts["Rf1"], parts["Rf2"], g, ${ref}) if g else None`,
			'starts = growth is not None and growth > 0',
			`lag = math.degrees(math.atan(f0 * ${wien ? 'start' : '(1 + start)'} / gbw))`,
			'slew = 2 * math.pi * f0 * (held or amplitude)',
			'return {"f0": f0, "gain": g, "start": start, "loop": abs(found[1]) if found else None,',
			'        "growth": growth, "amplitude": held, "lag": lag, "slew": slew, "starts": starts,',
			'        "holds": held is not None and start > g and held <= swing,',
			`        ${OPAMP_TESTS}`
		]);
	}
	if (ctx.control === 'lamp') {
		return pyDef('evaluate(parts)', doc, [
			'rc = parts["R"] * parts["C"]',
			'g = balance(rc)',
			...noBalance,
			'hot, cold = lamp(parts["Rf"], g)',
			'start = 1 + parts["Rf"] / cold',
			'w0 = 2 * math.pi * frequency',
			'found = zero_phase(rc, g, w0)',
			'f0 = found[0] / (2 * math.pi) if found else k / (2 * math.pi * rc)',
			'at_start = zero_phase(rc, start, w0)',
			'starts = start > g',
			'lag = math.degrees(math.atan(f0 * g / gbw))',
			'slew = 2 * math.pi * f0 * amplitude',
			'return {"f0": f0, "gain": g, "start": start, "loop": abs(at_start[1]) if at_start else None,',
			'        "hot": hot, "cold": cold, "amplitude": amplitude, "lag": lag, "slew": slew,',
			'        "starts": starts, "holds": amplitude <= swing,',
			`        ${OPAMP_TESTS}`
		]);
	}
	if (ctx.control === 'jfet') {
		return pyDef('evaluate(parts)', doc, [
			'rc = parts["R"] * parts["C"]',
			'g = balance(rc)',
			...noBalance,
			'held, start = agc_amplitude(parts, g)',
			'w0 = 2 * math.pi * frequency',
			'found = zero_phase(rc, g, w0)',
			'f0 = found[0] / (2 * math.pi) if found else k / (2 * math.pi * rc)',
			'at_start = zero_phase(rc, start, w0) if start else None',
			'starts = start is not None and start > g',
			'lag = math.degrees(math.atan(f0 * g / gbw))',
			'slew = 2 * math.pi * f0 * (held or amplitude)',
			'return {"f0": f0, "gain": g, "start": start, "loop": abs(at_start[1]) if at_start else None,',
			'        "amplitude": held, "cycles": parts["Cdet"] * (parts["Ra"] + parts["Rb"]) * frequency,',
			'        "lag": lag, "slew": slew, "starts": starts, "holds": starts and held <= swing,',
			`        ${OPAMP_TESTS}`
		]);
	}
	return pyDef('evaluate(parts)', doc, [
		'rc = parts["R"] * parts["C"]',
		's, settled = pole(rc, parts["R"] / parts["Rn"])',
		's0, _ = pole(rc, 0.0)',
		'f0 = abs(s.imag) / (2 * math.pi)',
		'g_target = 1 / parts["Rn"] + 2 * max(0.0, s0.real) * parts["C"]',
		'held = amplitude_held(parts["Rd1"], parts["Rd2"], g_target)',
		'starts = settled and s.real > 0',
		'lag = math.degrees(math.atan(f0 * 2 / gbw))',
		'slew = 2 * math.pi * f0 * (held or amplitude)',
		'return {"f0": f0, "growth": growth_of(s), "g_target": g_target, "amplitude": held,',
		'        "lag": lag, "slew": slew, "starts": starts,',
		'        "holds": held is not None and starts and held <= swing,',
		`        ${OPAMP_TESTS}`
	]);
}

/** The table's figure rows: [label (Python expression), cell (Python expression of got, held its amplitude)]. */
function figureRows(ctx) {
	const f = ['f"frequency, {eng(frequency, \'Hz\')} asked"', 'f"{eng(got[\'f0\'], \'Hz\')} ({100 * (got[\'f0\'] / frequency - 1):+.2f} %)"'];
	const amp = ['f"amplitude, {eng(amplitude, \'V\')} asked"', 'f"{eng(held, \'V\')} ({100 * (held / amplitude - 1):+.1f} %)" if held else "none"'];
	const lag = ['"op-amp lag"', 'f"{got[\'lag\']:.2f} deg" + ("" if got["lag"] <= 25 and textbook_ok else ", too far")'];
	const slew = ['f"slew, {slew_rate / 2e6:g} V/us at most"', 'f"{got[\'slew\'] / 1e6:.3f} V/us" + ("" if got["slew_ok"] else ", too fast")'];
	const loop = ['"loop gain at start"', 'f"{got[\'loop\']:.4f}" if got["loop"] else "none"'];
	if (ctx.control === 'diodes') {
		return [
			f,
			['"gain needed, start"', 'f"{got[\'gain\']:.4f}, {got[\'start\']:.3f}" if got["gain"] else "none"'],
			loop,
			['"growth per cycle"', 'f"{100 * got[\'growth\']:+.1f} %" if got["growth"] is not None else "none"'],
			amp,
			lag,
			slew
		];
	}
	if (ctx.control === 'lamp') return [f, ['"gain needed, at switch-on"', 'f"{got[\'gain\']:.4f}, {got[\'start\']:.2f}"'], loop, ['"the lamp hot, cold"', 'f"{eng(got[\'hot\'], \'ohm\')}, {eng(got[\'cold\'], \'ohm\')}"'], amp, lag, slew];
	if (ctx.control === 'jfet') {
		return [f, ['"gain needed, at switch-on"', 'f"{got[\'gain\']:.4f}, {got[\'start\']:.2f}" if got["start"] else "none"'], loop, amp, ['"detector, cycles"', 'f"{got[\'cycles\']:.0f}"'], lag, slew];
	}
	return [f, ['"growth per cycle"', 'f"{100 * got[\'growth\']:+.2f} %" if got["growth"] is not None else "none"'], amp, lag, slew];
}

/** The check section, last of the file. */
export function checkSections(file, ctx) {
	const n = ctx.numbers.check;
	const diodes = ctx.control === 'diodes';
	const parts = pagePartsOf(ctx);
	const values = parts.map(([name, v]) => [name, pageValue(v, ctx)]);
	const pairs = values.filter(([, v]) => v.pair).map(([name]) => name);
	const items = values.map(([name, v]) => `${pyStr(name)}: ${v.text}`);
	const intro = [section(`${n} The check`), comment(evaluationWords(ctx))];
	if (!diodes) intro.push(ownPartsCode(ctx));
	file.add(intro.join('\n'));
	if (diodes) {
		growthHelper(file);
		file.add(
			pyDef('pole(rc, gain, diode_cap)', "The loop's pole s near j w0, where L(s) = 1, by Newton's method, and whether it settled.", [
				'w0 = 2 * math.pi * frequency',
				's = 1j * w0',
				'for _ in range(80):',
				'    f = 1 - loop_gain(s, rc, gain, diode_cap)',
				'    ds = 1j * w0 * 1e-6',
				'    slope = (1 - loop_gain(s + ds, rc, gain, diode_cap) - f) / ds',
				'    if slope == 0:',
				'        break',
				'    step = f / slope',
				'    if abs(step) > 0.25 * w0:',
				'        step *= 0.25 * w0 / abs(step)',
				'    if not (math.isfinite((s - step).real) and math.isfinite((s - step).imag)):',
				'        break',
				'    s -= step',
				'    if abs(step) < 1e-9 * w0:',
				'        return s, s.imag != 0',
				'return s, False'
			])
		);
	}
	file.add(evaluateFn(ctx));
	const rows = figureRows(ctx);
	file.add(
		pyDef('verdict(got)', "A set of parts' outcome, by the page's tests in the order the comment above gives them.", [
			'if not got["starts"]:',
			'    return "do not start"',
			'if not got["holds"]:',
			'    return "start, then clip"',
			'return "start and hold" if got["opamp_ok"] and got["slew_ok"] else "start, op-amp too slow"'
		])
	);
	file.add(
		pyDef('cells(parts, got)', "The table's cells of a set of parts and its evaluation.", [
			'held = got["amplitude"]',
			'out = [eng(v, "F" if name[0] == "C" else "ohm") if v else "none" for name, v in parts.items()]',
			'return out + [',
			...rows.map(([, cell]) => `    ${cell},`),
			'    verdict(got),',
			']'
		])
	);
	const settingsNow = settingNames(ctx);
	const shows = diodes ? ', its gain, amplitude and verdict for them,' : ' and';
	const note = [comment(`The page's parts${shows} its settings (in as_page's order):`)];
	if (pairs.length) note.push(comment(`${listWords(pairs)} ${pairs.length === 1 ? 'is' : 'are each'} two resistors in series, the page's option${pairs.includes('R') ? ` (R ${rPlaces(ctx)})` : ''}.`));
	note.push(pyDict('page_parts', items));
	if (diodes) {
		const shown = ctx.design.limiter.amplitudeActual;
		note.push(`page_gain = ${pyNum(ctx.design.requiredGain)}`, `page_amplitude = ${Number.isFinite(shown) ? `${pyNum(shown)}  # V peak` : 'None'}`, `page_verdict = ${pyStr(pageVerdictOf(ctx.design))}`);
	}
	note.push(`page_settings = (${settingsNow.map(([, text]) => text).join(', ')})`, `as_page = (${settingsNow.map(([name]) => name).join(', ')}) == page_settings`);
	file.add(note.join('\n'));
	const labels = rows.map(([label]) => label);
	const lines = [
		'own_check = evaluate(own_parts)',
		'page_check = evaluate(page_parts)',
		pyList('rows', [...labels, '"verdict"'], "the table's rows: the parts, then these").replace(/^rows = \[/, 'rows = list(page_parts) + ['),
		'print(" " * 30 + "the file\'s parts".rjust(26) + "the page\'s parts".rjust(26))',
		'for row, own, page in zip(rows, cells(own_parts, own_check), cells(page_parts, page_check)):',
		'    print(f"  {row:28}{own:>26}{page:>26}")',
		'differ = [name for name, v in page_parts.items()',
		'          if not math.isclose(own_parts[name], v, rel_tol=1e-9)]  # (the same part, however written)',
		'mine, theirs = verdict(own_check), verdict(page_check)',
		'if not as_page:',
		pyPrints("The settings are no longer the page's: its parts are checked here as they are.", '    '),
		'elif not differ:',
		pyPrints("The file's rule picks the page's parts.", '    '),
		'else:',
		'    print(f"  The two sets differ in {\', \'.join(differ)}:")',
		'    outcome = f"both {mine}" if mine == theirs else f"the file\'s parts {mine}; the page\'s {theirs}"',
		'    print(f"  {outcome}.")',
		// (an R the page makes of two in series differs for that alone; its C, by the page's score)
		pairs.includes('R') ? '    if "C" in differ:' : '    if "R" in differ or "C" in differ:',
		pyPrints("The file keeps the R that lands R C closest; the page also weighs an R near 10 kohm, 100 ln^2 of R's miss + 0.05 ln^2(R / 10 kohm), and the rest follows.", '        ')
	];
	// (Rf1 or Rf2 by the file's rule d and e; one the page makes of two in series differs for that alone)
	const rfFree = ['Rf1', 'Rf2'].filter((name) => !pairs.includes(name));
	if (diodes && rfFree.length) {
		lines.push(
			`    elif ${rfFree.map((name) => `"${name}" in differ`).join(' or ')}:`,
			pyPrints('The file keeps the stocked neighbours whose amplitude lands closest (rules d and e); the page tries more values and weighs the start gain too.', '        ')
		);
	}
	if (pairs.length) lines.push(pyPrints(`The page makes ${listWords(pairs)} of two resistors in series, which the file's rule leaves out.`, '    '));
	if (diodes) {
		lines.push(
			'if as_page and not math.isclose(page_check["gain"] or 0.0, page_gain, rel_tol=1e-6):',
			'    held_text = eng(page_amplitude, "V") if page_amplitude else "no amplitude"',
			'    print(f"  The page shows a gain of {page_gain:.4f} and {held_text} for its parts "',
			'          f"({page_verdict}):")',
			pyPrints("it finds them at its first parts' split, where this check takes each set's own.", '    ')
		);
	}
	file.add(lines.join('\n'));
}
