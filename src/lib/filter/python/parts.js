import { comment, IND, listWords, PY_WIDTH, pyDict, pyStr } from './emit';
import { anyTyped, roundingHelpers } from './stock';

/**
 * Section 5, the parts of each stage, the file's own simple rule:
 *   a. capacitors typed on the page for the stage are used as they are;
 *      otherwise each capacitor (or each pair the circuit allows) of the
 *      stock is tried, and the circuit's formulas give the resistors, the
 *      source resistance taken off the first stage's input resistor where
 *      it adds to it (each circuit's <circuit>_choices);
 *   b. every choice is rounded as c says, and the one whose rounded figures
 *      land closest to its exact ones (miss(): the worst |ln(got / want)|)
 *      is kept (closest()), from the choices whose parts keep the limits
 *      (every resistor within 1 kohm to 1 Mohm, every capacitor 47 pF or
 *      more), else from all, flagged; of those that land as close, to 1e-9
 *      (two choices a decade apart, the last bits of their arithmetic
 *      apart), the one whose resistors sit nearest 10 kohm (mean of
 *      ln(R / 10 kohm)^2), the first of a tie. The narrow band-pass's rule
 *      (narrow.js) keeps the same order;
 *   c. each resistor is rounded to its stocked neighbour just below or just
 *      above, every combination tried, keeping the one whose figures (f0, Q,
 *      and the others the circuit sets: <circuit>_figures, named by the
 *      family's `figures`) land closest to the exact parts' (stock.js,
 *      rounded);
 *   d. the printout gives each part computed and rounded, and flags the
 *      parts past the limits.
 * A stage no choice of the stock builds by the rule leaves the file without
 * parts of its own (own_parts None): it says so and checks the page's alone
 * (where the page shows none either, it stops there with the reason).
 * Defines own_parts, a list of (circuit, parts) by stage, parts a dict of
 * ohms and farads by the page's part names, and, with more than one
 * circuit, CIRCUITS (circuit -> its name, choices and figures); a file of one
 * circuit calls its functions by name.
 */

/** The figures in the order the rule and the printout name them, and their words in a sentence. */
const FIGURE_WORDS = { f0: 'f0', q: 'Q', fz: 'fz', gain: 'gain', dc_gain: 'DC gain', s_term: "the zero's 1/Q" };

/** The figures rule c holds the stages of this file to: each circuit's (its family's `figures`), in FIGURE_WORDS' order. */
export function figureKeys(ctx) {
	const keys = new Set(ctx.circuits.flatMap((c) => ctx.registry.familyOf(c).figures?.[c] ?? []));
	return Object.keys(FIGURE_WORDS).filter((k) => keys.has(k));
}

/** The longest printout line `say` keeps to. */
const SAY_WIDTH = 92;

/** How wide each figure prints at most, ", " after it: "f0 999.9 kHz (+99.9 %)", "Q 12.34 (+99.9 %)", "zero 1/Q 0.14". */
const FIGURE_TEXT = { f0: 24, fz: 24, q: 19, gain: 25, dc_gain: 28, s_term: 18 };

/**
 * Whether the printout of this file needs say(), the helper that wraps a
 * list over lines: a circuit whose figures, after their longest head ("after
 * rounding:" in 5, "against the target:" in 6; for the MFB band-pass built
 * for an op-amp, "after rounding, the circuit alone, against its own
 * targets:" in 5), or the page's parts of a stage (flags and all), would run
 * past SAY_WIDTH on one line. `extra` the longest line the caller adds
 * (check.js: the page's parts).
 */
export function needsSay(ctx, extra = 0) {
	const head = ctx.opamp ? '    after rounding, the circuit alone, against its own targets:'.length : '      against the target:'.length;
	const widths = ctx.circuits.map((c) => (ctx.registry.familyOf(c).figures?.[c] ?? []).reduce((sum, k) => sum + (FIGURE_TEXT[k] ?? 24), -2));
	return head + Math.max(0, ...widths) > SAY_WIDTH || extra > SAY_WIDTH;
}

/** say(), the helper that prints a head and a list after it in lines of at most SAY_WIDTH characters. */
export function sayHelper(file) {
	file.once(
		'say',
		[
			'def say(head, items):',
			`    """Prints head and the items after it, comma separated, in lines of at most ${SAY_WIDTH}`,
			'    characters, each line after the first two spaces in from head."""',
			'    pad = " " * (len(head) - len(head.lstrip()) + 2)',
			'    line = head',
			'    for j, item in enumerate(items):',
			'        piece = item + ("," if j < len(items) - 1 else "")',
			`        if len(line) + 1 + len(piece) > ${SAY_WIDTH} and line != head:`,
			'            print(line)',
			'            line = pad + piece',
			'        else:',
			'            line += " " + piece',
			'    print(line)'
		].join('\n')
	);
}

/**
 * The Python that prints `head` and the list `items` (Python expressions),
 * wrapped by say() where the file has it, `indent` before the code.
 */
export function printList(file, head, items, indent = '') {
	return file.has('say') ? `${indent}say(${head}, ${items})` : `${indent}print(${head}, ", ".join(${items}))`;
}

/** figures_list(), the figures of a stage as the printout writes them, with how far each lands from another set's. */
export function figuresHelper(file, ctx) {
	const keys = figureKeys(ctx);
	// (a figure's printed name where it is not its key: Q, the DC gain)
	const renamed = keys.filter((k) => FIGURE_WORDS[k] !== k && k !== 's_term');
	const names = `{${renamed.map((k) => `"${k}": "${FIGURE_WORDS[k]}"`).join(', ')}}`;
	const unit = keys.includes('fz') ? 'key in ("f0", "fz")' : 'key == "f0"';
	file.once(
		'figures_list',
		[
			'def figures_list(got, want):',
			keys.includes('s_term')
				? '    """The figures of got as the printout writes them, each with how far it lands from want\'s\n    (s_term as the 1/Q of the notch\'s zero): "f0 10.43 kHz (+4.3 %)"."""'
				: '    """The figures of got as the printout writes them, with how far each lands from want\'s."""',
			'    out = []',
			'    for key, v in got.items():',
			...(keys.includes('s_term') ? ['        if key == "s_term":', '            out.append(f"zero 1/Q {v - 1:.2g}")  # (0 for a zero right on the j w axis)', '        elif key in want:'] : ['        if key in want:']),
			...(renamed.length ? [`            name = ${names}.get(key, key)`] : []),
			`            shown = eng(v, "Hz") if ${unit} else f"{v:.4g}"`,
			`            out.append(f"{${renamed.length ? 'name' : 'key'}} {shown} ({100 * (abs(v / want[key]) - 1):+.1f} %)")`,
			'    return out'
		].join('\n')
	);
}

/** What a topology module's rule reads: the Python of a part's capacitors to try, and the choices' parameters. */
export function ruleContext(ctx) {
	const typed = anyTyped(ctx.typed);
	return {
		...ctx,
		caps: (name) => (typed ? `caps(typed, ${pyStr(name)})` : 'capacitors'),
		params: typed ? 'st, rs, typed' : 'st, rs'
	};
}

/**
 * The Python names of a circuit's name, choices and figures in the stage
 * loops (here and in check.js): the circuit's own where the file has one
 * circuit, else the entries of CIRCUITS.
 */
export function circuitNames(ctx) {
	const one = ctx.circuits.length === 1 ? ctx.circuits[0] : null;
	return one
		? { one, label: () => pyStr(ctx.registry.label(one)), labelText: ctx.registry.label(one), choices: `${one}_choices`, figures: `${one}_figures` }
		: { one: null, label: (circuit) => `CIRCUITS[${circuit}][0]`, choices: 'choices_of', figures: 'figures' };
}

/**
 * opts.source, for a band-stop of two branches: { at, words, note }, the
 * Python condition on i of the stages the source drives ('i in (0,
 * lp_count)': both branches' first stages, on the input node), how rule a
 * says it and the comment on that line; left out, the first stage alone.
 */
export function parts(file, ctx, opts = {}) {
	const typed = anyTyped(ctx.typed);
	const rctx = ruleContext(ctx);
	const source = opts.source ?? { at: 'i == 0', words: "rs taken off the first stage's input resistor" };
	const names = circuitNames(ctx);
	const figures = listWords(figureKeys(ctx).map((k) => FIGURE_WORDS[k]));
	file.add(
		[
			comment(
				[
					"The file's own rule, stage by stage:",
					`  a. ${typed ? 'the capacitors typed on the page are used as they are, else ' : ''}every capacitor (or pair) of the stock the circuit allows is tried, and its formulas give the resistors (${source.words});`,
					'  b. every choice is rounded as c says, and the one whose rounded parts land closest to its exact ones is kept, from those within the limits (resistors 1 kohm to 1 Mohm, capacitors 47 pF or more), else from all, flagged; the resistors nearest 10 kohm break a tie, such as two choices a decade apart;',
					`  c. each resistor is rounded down or up to the stock, keeping the combination whose ${figures} land closest to the exact parts';`,
					'  d. the printout gives each part computed and rounded, and flags any part past the limits.'
				].join('\n')
			),
			'R_MIN, R_MAX, C_MIN = 1e3, 1e6, 47e-12  # the limits on the parts: ohm, ohm, F'
		].join('\n')
	);
	if (typed) {
		file.once(
			'caps',
			[
				'def caps(typed, name):',
				'    """The capacitor typed on the page for this part, or every capacitor of the stock."""',
				'    return [typed[name]] if name in typed else capacitors'
			].join('\n')
		);
	}
	for (const circuit of ctx.circuits) file.add(ctx.registry.familyOf(circuit).rule(circuit, rctx));
	file.once(
		'within',
		[
			'def within(p):',
			'    """Rule b: every resistor from R_MIN to R_MAX, every capacitor C_MIN or more."""',
			'    return all(R_MIN <= v <= R_MAX if name[0] in "Rr" else v >= C_MIN for name, v in p.items())',
			'',
			'',
			'def level(p):',
			'    """Rule b\'s tie: how far the resistors sit from 10 kohm, the mean of ln(R / 10 kohm)^2."""',
			'    values = [v for name, v in p.items() if name[0] in "Rr"]',
			'    return sum(math.log(v / 10e3) ** 2 for v in values) / len(values)'
		].join('\n')
	);
	roundingHelpers(file);
	// (a tie to 1e-9: two choices a decade apart land the same, but for the last bits of their arithmetic,
	// which would otherwise pick between them instead of the 10 kohm the rule says)
	file.once(
		'closest',
		[
			'def closest(choices, figures, rs):',
			'    """Rule b: every choice rounded (rule c), keeping the one whose rounded figures miss its exact',
			'    ones least; of those that miss as little (to 1e-9: choices a decade apart land the same), the',
			'    one whose resistors sit nearest 10 kohm. Returns its exact and its rounded parts."""',
			'    tried = [(p, rounded(p, figures, rs)) for p in choices]',
			'    misses = [miss(figures(parts, rs), figures(p, rs)) for p, parts in tried]',
			'    least = min(misses)',
			'    ties = [pair for pair, m in zip(tried, misses) if m <= least + 1e-9]',
			'    return min(ties, key=lambda pair: level(pair[0]))'
		].join('\n')
	);
	file.once(
		'value',
		[
			'def value(name, v):',
			'    """A part as the printout writes it, flagged when it breaks a limit (rule d)."""',
			'    if name[0] in "Rr":',
			'        return eng(v, "ohm") + ("" if R_MIN <= v <= R_MAX else " (outside 1 kohm to 1 Mohm)")',
			'    return eng(v, "F") + ("" if v >= C_MIN else " (under 47 pF)")'
		].join('\n')
	);
	figuresHelper(file, ctx);
	if (needsSay(ctx, opts.pageWidth ?? 0)) sayHelper(file);
	const loop = [];
	if (!names.one) {
		// (an entry too long for a line takes its figures on the next)
		const entries = ctx.circuits.map((c) => {
			const head = `${pyStr(c)}: (`;
			const one = `${head}${pyStr(ctx.registry.label(c))}, ${c}_choices, ${c}_figures)`;
			return IND.length + one.length + 1 <= PY_WIDTH ? one : `${head}${pyStr(ctx.registry.label(c))}, ${c}_choices,\n${' '.repeat(IND.length + head.length)}${c}_figures)`;
		});
		loop.push(comment('Each circuit: its name, its choices (rule a) and its figures (rule c).'), pyDict('CIRCUITS', entries));
	}
	loop.push('own_parts = []  # (circuit, parts) of each stage', 'for i, st in enumerate(stages):');
	if (!names.one) loop.push('    label, choices_of, figures = CIRCUITS[st["circuit"]]');
	loop.push(opts.source ? `    source = rs if ${source.at} else 0.0  # ${opts.source.note}` : '    source = rs if i == 0 else 0.0  # the source drives the first stage only');
	if (typed) {
		loop.push(
			'    typed_here = typed.get(i + 1, {})',
			`    choices = list(${names.choices}(st, source, typed_here))`,
			'    if typed_here and not choices:',
			'        print(f"  stage {i + 1}: the capacitors typed cannot build it, the stock is tried")',
			'        typed_here = {}',
			`        choices = list(${names.choices}(st, source, typed_here))`
		);
	} else loop.push(`    choices = list(${names.choices}(st, source))`);
	loop.push('    if not choices:');
	// (with the page's parts to check, the file goes on without its own; with none, it stops)
	if (ctx.pageComplete) {
		loop.push('        print(f"  stage {i + 1}: no stock choice builds it; the page\'s parts are checked alone")', '        own_parts = None', '        break');
	} else loop.push('        raise SystemExit(f"Stage {i + 1}: no capacitor of the stock builds it.")');
	const count = `    print(f"  stage {i + 1}, ${names.one ? names.labelText : '{label}'}: {len(kept)} of {len(choices)} choices keep the limits")`;
	loop.push(
		'    kept = [p for p in choices if within(p)]',
		`    exact, parts = closest(kept or choices, ${names.figures}, source)`,
		'    own_parts.append((st["circuit"], parts))',
		count.length <= PY_WIDTH ? count : `${count.replace(' keep the limits")', '"')}\n          " keep the limits")`,
		'    for name, v in parts.items():',
		'        moved = name[0] in "Rr" and v != exact[name]  # (a stocked value stays as it is)',
		'        was = f"{eng(exact[name], \'ohm\')}, rounded to " if moved else ""'
	);
	// (a part typed under its own name, or a capacitor of the value typed under "C", the page's field for the
	// stage's capacitors: every one of most stages, C1 alone of a Boctor low-pass notch, not a Tow-Thomas
	// notch's Cin)
	if (typed) loop.push('        mine = name in typed_here or (name[0] == "C" and v == typed_here.get("C"))', '        note = " (typed on the page)" if mine else ""', '        print(f"    {name} = {was}{value(name, v)}{note}")');
	else loop.push('        print(f"    {name} = {was}{value(name, v)}")');
	// (the MFB band-pass built for an op-amp: its figures are the circuit's alone, against its own targets)
	const mixed = ctx.opamp && !names.one;
	// (the circuit alone's targets are not the stage's: say so, or its percentages read as off the stage's f0)
	const head = ctx.opamp ? (names.one ? '"    after rounding, the circuit alone, against its own targets:"' : 'f"    after rounding{alone}:"') : '"    after rounding:"';
	const gotWant = `    got, want = ${names.figures}(parts, source), ${names.figures}(exact, source)`;
	loop.push(
		gotWant.length <= PY_WIDTH ? gotWant : `    got = ${names.figures}(parts, source)\n    want = ${names.figures}(exact, source)`,
		...(mixed ? ['    alone = ""', '    if st["circuit"] == "mfb_bandpass":', '        alone = ", the circuit alone, against its own targets"'] : []),
		printList(file, head, 'figures_list(got, want)', '    '),
		'    if not kept:',
		'        print("    none of them keeps the limits: the closest of all is taken, flagged above")'
	);
	file.add(loop.join('\n'));
}
