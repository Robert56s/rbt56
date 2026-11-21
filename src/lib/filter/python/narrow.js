import { OPAMP_GBW } from '../../spice/opamps';
import { MFB_BP_CAP_RATIO } from '../mfbBandPass';
import { NARROW_MAX_STAGES, NARROW_REAL_GBW, NARROW_RULE } from '../narrowBand';
import { comment, header, IND, PY_WIDTH, PyFile, pyDict, pyEng, pyNum, pyPrints, pyRaise, pyStr, section } from './emit';
import { AMPLIFIER, GAIN_STAGES, NARROW_PY_CIRCUITS, NARROW_PY_NAME, RATIO_HELPERS } from './narrowCircuits';
import { sayHelper } from './parts';
import { docstring, resultsComment } from './settings';
import { pageValue, stockOf, stockSettings, typedOf } from './stock';
import { engHelper } from './template';

/**
 * The file of a narrow band-pass (narrowBand.js: designNarrowBand,
 * realizeNarrow): one second-order band-pass stage, or N identical ones in
 * series, on the circuit the page shows (one of six: narrowCircuits.js),
 * and the gain stages that make up what the circuit's own form leaves of
 * K. Its own layout, the hand method of a narrow band:
 *   SETTINGS  f0, Q or B (as the page took it), K, N, the op-amp the MFB
 *             stage is built for, the TL082 the gain stages are split for,
 *             the stock and the capacitors typed on the page
 *   1 The spec              B, the -3 dB edges f1 and f2, the rule's limits
 *   2 The stages            Q_s = Q sqrt(2^(1/N) - 1) and K_s = K^(1/N)
 *   3 The parts of each stage   the circuit, its H(s), its rule, the parts,
 *                           the gain stages
 *   4 The check             the page's parts, the page's measure of a
 *                           narrow band (narrowFigures: the peak, its gain,
 *                           the -3 dB edges, B, Q) of both sets against the
 *                           spec, within the rule's limits (narrowFit)
 *   Bode plot               around f0, or a short table without matplotlib
 *
 *   narrowFile({ args, design, shown })
 *     args    what the page's downloadNarrowScript passes: filterType
 *             'narrowband', f0, narrowBy ('q' | 'b'), q, bandwidth, gain,
 *             stages, circuit (the one shown) and circuitMenu ('auto' or a
 *             circuit), opampGbw (Hz, the MFB stages' op-amp, or null),
 *             capOverrides (farads by stage index: { C }, or { C1, C2 } for
 *             the MFB circuit), resistorStock, resistorPairs,
 *             resistorPairLimit, capacitorStock
 *     design  designNarrowBand's result
 *     shown   the chain the page shows (realizeNarrow's result, panel 04's
 *             build: ok, circuit, stages), or null
 *   returns the file's text
 */
export function narrowFile({ args, design, shown }) {
	const ctx = narrowContext({ args, design, shown });
	const file = new PyFile();
	file.imports.add('itertools');
	file.imports.add('math');
	file.add(docstring(ctx.what, 'spec', ctx.detail));
	file.add(settings(ctx));
	engHelper(file);
	file.add(section('1 The spec'));
	spec(file, ctx);
	file.add(section('2 The stages'));
	stages(file, ctx);
	file.add(section('3 The parts of each stage'));
	parts(file, ctx);
	file.add(section('4 The check'));
	check(file, ctx);
	file.add(header('Bode plot'));
	plot(file, ctx);
	return file.text();
}

/** The op-amp of a gain-bandwidth, as a sentence names it. */
function opampWords(gbw) {
	const mhz = `${Number((gbw / 1e6).toPrecision(4))} MHz`;
	if (gbw === OPAMP_GBW.TL082) return `a single-pole op-amp of ${mhz} (a TL082)`;
	if (gbw === OPAMP_GBW.LM741) return `a single-pole op-amp of ${mhz} (an LM741)`;
	return `a single-pole op-amp of ${mhz}`;
}

/**
 * Everything the sections read:
 *   args, design, shown   as narrowFile takes them
 *   name, circuit         the Python circuit and its module (narrowCircuits.js)
 *   by                    'q' or 'b': which of Q and B the page took
 *   gbw                   the op-amp the MFB stage is built for (Hz), or null
 *   short                 whether the circuit's own form can leave the chain
 *                         under K: the file then writes the gain stages
 *   stock, typed          the stock (stockOf) and the capacitors typed, by
 *                         stage, the circuit's own fields only
 *   page                  the page's stages, or null when it shows none
 *   caps(field), params   what a circuit's rule reads (narrowCircuits.js)
 *   what, detail          the docstring's summary line, and the sentence
 *                         that opens its next paragraph ('' for none: the
 *                         op-amp, where the line would run past PY_WIDTH)
 */
function narrowContext({ args, design, shown }) {
	const name = NARROW_PY_NAME[(shown?.ok && shown.circuit) || args.circuit];
	const circuit = NARROW_PY_CIRCUITS[name];
	if (!circuit) throw new Error(`filter-design.py: no narrow band-pass circuit ${args.circuit}`);
	const gbw = name === 'mfb_bandpass' && Number.isFinite(args.opampGbw) && args.opampGbw > 0 ? args.opampGbw : null;
	const typed = {};
	for (const [i, caps] of Object.entries(typedOf(args.capOverrides))) {
		const own = Object.fromEntries(Object.entries(caps).filter(([field]) => circuit.field.includes(field)));
		if (Object.keys(own).length) typed[i] = own;
	}
	const anyTyped = Object.keys(typed).length > 0;
	const n = design.n;
	const chain = `Active narrow band-pass filter: ${n === 1 ? `one ${circuit.one}` : `${n} identical ${circuit.many}`}`;
	const built = gbw ? `built for ${opampWords(gbw)}` : '';
	// (the docstring's first line holds the summary alone: the op-amp, where it runs past, opens the next paragraph)
	const fits = `"""${chain}${built ? `, ${built}` : ''}.`.length <= PY_WIDTH;
	const what = fits && built ? `${chain}, ${built}.` : `${chain}.`;
	const detail = fits || !built ? '' : `${n === 1 ? 'The stage is' : 'The stages are'} ${built}.`;
	return {
		args,
		design,
		shown,
		name,
		circuit,
		by: args.narrowBy === 'b' ? 'b' : 'q',
		gbw,
		opampWords: gbw ? opampWords(gbw) : '',
		short: circuit.short({ stageGain: design.stageGain, stageQ: design.stageQ }),
		stock: stockOf(args),
		typed,
		anyTyped,
		page: shown?.ok && shown.stages?.length ? shown.stages : null,
		what,
		detail,
		caps: (field) => (anyTyped ? `caps(typed_here, ${pyStr(field)})` : 'capacitors'),
		params: anyTyped ? 'st, typed_here' : 'st'
	};
}

/** SETTINGS: the spec as the page took it, the op-amps, the stock, the capacitors typed, and the results' names. */
function settings(ctx) {
	const { design, args } = ctx;
	const lines = [header('SETTINGS'), `f0 = ${pyNum(design.f0)}  # Hz, the centre frequency, the one picked out`];
	if (ctx.by === 'q') lines.push(`q = ${pyNum(design.q)}  # the overall Q = f0 / B, B the -3 dB bandwidth`);
	else lines.push(`bandwidth = ${pyNum(args.bandwidth)}  # Hz, the overall -3 dB bandwidth B, so Q = f0 / B`);
	lines.push(`gain = ${pyNum(design.gain)}  # V/V, the gain K at f0 (its size: an inverting circuit gives -K)`, `n = ${design.n}  # N, the identical band-pass stages in series (1 to 6)`);
	if (ctx.gbw) lines.push(`gbw = ${pyEng(ctx.gbw)}  # Hz, the single-pole op-amp the MFB stages are built for (None: ideal)`);
	if (ctx.short) lines.push(`gain_gbw = ${pyEng(NARROW_REAL_GBW)}  # Hz, the gain-bandwidth the gain stages are split for (a TL082's)`);
	const names = [ctx.by === 'q' ? 'bandwidth' : 'q', 'f1', 'f2', 'stage_q', 'stage_gain', 'stages', 'own_parts', 'own_check', 'page_parts', 'page_check'];
	return [lines.join('\n'), stockSettings(ctx), resultsComment(names)].join('\n\n');
}

/** Section 1: Q or B, the -3 dB edges, the gain, and the rule's limits. */
function spec(file, ctx) {
	const width = ctx.by === 'q' ? 'q' : 'bandwidth';
	const checkLine = [
		`if not (f0 > 0 and ${width} > 0 and gain > 0 and isinstance(n, int) and 1 <= n <= ${NARROW_MAX_STAGES}):`,
		pyRaise(`A narrow band-pass needs f0, ${width} and gain above 0 and n a whole number from 1 to ${NARROW_MAX_STAGES}: see SETTINGS.`, IND)
	];
	file.add(
		[
			comment('A narrow band-pass picks out f0: its -3 dB band, B = f0 / Q wide, has its edges f1 and f2 where f1 f2 = f0^2 and f2 - f1 = B,\n    f1, f2 = f0 (sqrt(1 + 1 / (4 Q^2)) -/+ 1 / (2 Q))'),
			...checkLine,
			ctx.by === 'q' ? 'bandwidth = f0 / q  # Hz' : 'q = f0 / bandwidth',
			'half = 1 / (2 * q)',
			'f1 = f0 * (math.sqrt(1 + half * half) - half)',
			'f2 = f0 * (math.sqrt(1 + half * half) + half)',
			ctx.by === 'q' ? 'print(f"  B = f0 / Q = {eng(bandwidth, \'Hz\')}: f1 = {eng(f1, \'Hz\')}, f2 = {eng(f2, \'Hz\')}")' : 'print(f"  Q = f0 / B = {q:.4f}: f1 = {eng(f1, \'Hz\')}, f2 = {eng(f2, \'Hz\')}")',
			'print(f"  K = {gain:g} at f0 ({20 * math.log10(gain):.2f} dB)")',
			comment(
				`The page judges a built filter by the limits of its rule: the peak within ${NARROW_RULE.f0Share === 0.1 ? 'a tenth' : `${NARROW_RULE.f0Share} times`} of the bandwidth of f0, ${NARROW_RULE.qTolerance === NARROW_RULE.gainTolerance ? `Q and K there within ${100 * NARROW_RULE.qTolerance} %` : `Q within ${100 * NARROW_RULE.qTolerance} % and K within ${100 * NARROW_RULE.gainTolerance} %`}. Each limit is a relative error:`
			),
			`LIMITS = {"f0": ${pyNum(NARROW_RULE.f0Share)} / q, "q": ${pyNum(NARROW_RULE.qTolerance)}, "gain": ${pyNum(NARROW_RULE.gainTolerance)}}`,
			'print(f"  the limits: f0 {LIMITS[\'f0\']:.2%}, Q {LIMITS[\'q\']:.0%}, K {LIMITS[\'gain\']:.0%}")'
		].join('\n')
	);
}

/** Section 2: the N identical stages, their Q and gain, the list of stage targets. */
function stages(file, ctx) {
	file.add(
		[
			comment(
				'N identical stages in series, each a band-pass of Q_s and gain K_s at f0,\n    H_s(s) = K_s (w0 / Q_s) s / (s^2 + (w0 / Q_s) s + w0^2),   w0 = 2 pi f0\nlose 3 dB together where (1 + x^2)^N = 2, x = Q_s (f / f0 - f0 / f): the chain is narrower than one stage by sqrt(2^(1/N) - 1), so for the overall Q and K each stage takes\n    Q_s = Q sqrt(2^(1/N) - 1),   K_s = K^(1/N)\nFar from f0 the chain falls 20 N dB a decade on each side.'
			),
			'stage_q = q * math.sqrt(2 ** (1 / n) - 1)',
			'stage_gain = gain ** (1 / n)',
			`stages = [{"circuit": ${pyStr(ctx.name)}, "f0": f0, "q": stage_q, "gain": stage_gain}\n          for _ in range(n)]`,
			'print(f"  N = {n}: each stage at f0 = {eng(f0, \'Hz\')}, Q_s = {stage_q:.4f}, K_s = {stage_gain:.4f}")'
		].join('\n')
	);
}

/** Section 3: the circuit, its rule (a to d), the parts of the stages and the gain stages. */
function parts(file, ctx) {
	const c = ctx.circuit;
	const sk = ctx.name === 'sallen_key_bandpass';
	const pickedBy =
		ctx.args.circuitMenu === 'auto'
			? "The circuit of every stage, as the page's rule picks it: of the six it builds from the stock and measures, the one with the fewest op-amps among those that keep the limits of section 1 from their parts and on a TL082, do not oscillate there, and whose Q moves at most 2 % for 1 % off on any one part (a tie to the one that lands closest, then to fewer parts)."
			: "The circuit of every stage, as picked on the page's Circuit menu (its rule compares six).";
	file.add([comment(pickedBy), '#', comment(c.describe(ctx)), `print(${pyStr(`  the circuit: ${c.label}`)})`].join('\n'));
	const ruleLines = [
		"The file's own rule, stage by stage:",
		`  a. every capacitor (or pair) of the stock the circuit allows is tried${ctx.anyTyped ? ', those typed on the page as they are,' : ''} and its formulas give the resistors;`,
		'  b. every choice is rounded as c says, and the one whose rounded parts land closest is kept (a narrow band moves with every percent of f0), from those within the limits (resistors 1 kohm to 1 Mohm, capacitors 47 pF or more), else from all, flagged; the resistors nearest 10 kohm break a tie, such as two choices a decade apart;',
		`  c. each resistor is rounded down or up to the stock, keeping the combination whose f0, Q and gain land closest to the exact parts', each miss over its limit (fit)${sk ? "; the Sallen-Key's amplifier gain A is solved last, against the parts already rounded" : ''}.`
	];
	if (c.exempt.length) ruleLines.push("The gyrator's R1, its series loss, is small on purpose: rules b and d leave it out.");
	const ratio = `RATIO = ${MFB_BP_CAP_RATIO} * (1 + 1e-9)  # the most C2/C1 either way: ${MFB_BP_CAP_RATIO}, and a hair for its rounding`;
	file.add([comment(ruleLines.join('\n')), 'R_MIN, R_MAX, C_MIN = 1e3, 1e6, 47e-12  # the limits on the parts: ohm, ohm, F', ...(ctx.name === 'mfb_bandpass' ? [ratio] : [])].join('\n'));
	if (ctx.anyTyped) {
		file.add(
			[
				'def caps(typed_here, name):',
				'    """The capacitor typed on the page for this field, or every capacitor of the stock."""',
				'    return [typed_here[name]] if name in typed_here else capacitors'
			].join('\n')
		);
	}
	file.add(c.code(ctx));
	file.add(ruleHelpers(ctx));
	if (ctx.short || sk) file.add(RATIO_HELPERS);
	file.add(c.rounding ?? GENERIC_ROUNDING);
	file.add(VALUE(ctx));
	file.add(FIGURES_LIST);
	// (the part lists of a narrow stage run long: say() wraps them)
	sayHelper(file);
	file.add(DESIGN(ctx));
	if (ctx.short) file.add(AMPLIFIER.code);
	if (ctx.short) file.add(GAIN_STAGES);
	// (with the gain stages, two circuits: CIRCUITS names each and holds its H(s); one circuit is called by name)
	const entries = [`${pyStr(ctx.name)}: (${pyStr(c.label)}, ${ctx.name}_h)`, `"amplifier": (${pyStr(AMPLIFIER.label)}, amplifier_h)`];
	file.add(
		[
			...(ctx.short ? [pyDict('CIRCUITS', entries, 'the name and the H(s) of each circuit'), '', ''] : []),
			'def response(part_set, f):',
			'    """H at f (Hz) of a set of parts: the stages\' H multiplied (each one is driven by an op-amp',
			`    output, or drives an op-amp's + input)."""`,
			'    s = 2j * math.pi * f',
			'    h = 1',
			ctx.short ? '    for circuit, p in part_set:' : '    for _, p in part_set:',
			ctx.short ? '        h *= CIRCUITS[circuit][1](p, s)' : `        h *= ${ctx.name}_h(p, s)`,
			'    return h'
		].join('\n')
	);
	file.add(ctx.anyTyped ? typedLoop(ctx) : sharedLoop(ctx));
	if (ctx.short) file.add(gainLoop(ctx));
}

/** within(), level(), neighbours() and fit(), rules b and c. */
function ruleHelpers(ctx) {
	const loss = ctx.circuit.exempt.length > 0;
	return [
		'def within(p):',
		loss
			? '    """Rule b: every resistor from R_MIN to R_MAX (the gyrator\'s R1 left out), every capacitor\n    C_MIN or more."""'
			: '    """Rule b: every resistor from R_MIN to R_MAX, every capacitor C_MIN or more."""',
		loss
			? '    return all(R_MIN <= v <= R_MAX if name[0] == "R" else v >= C_MIN for name, v in p.items()\n               if name != "R1")'
			: '    return all(R_MIN <= v <= R_MAX if name[0] in "Rr" else v >= C_MIN for name, v in p.items())',
		'',
		'',
		'def level(p):',
		loss
			? '    """Rule b\'s tie: how far the resistors sit from 10 kohm, the mean of ln(R / 10 kohm)^2, R1\n    left out."""'
			: '    """Rule b\'s tie: how far the resistors sit from 10 kohm, the mean of ln(R / 10 kohm)^2."""',
		loss ? '    values = [v for name, v in p.items() if name[0] == "R" and name != "R1"]' : '    values = [v for name, v in p.items() if name[0] in "Rr"]',
		'    return sum(math.log(v / 10e3) ** 2 for v in values) / len(values)',
		'',
		'',
		'def neighbours(r):',
		'    """The stocked resistors just below and just above r: one when r itself is stocked."""',
		'    below = max((v for v in resistors if v <= r), default=None)',
		'    above = min((v for v in resistors if v >= r), default=None)',
		'    return sorted({v for v in (below, above) if v is not None})',
		'',
		'',
		'def fit(got, want):',
		'    """How far figures land from others, in units of the limits (1 on a limit): the largest',
		'    relative miss of f0, Q and the gain, each over its limit."""',
		'    return max(abs(got[key] / want[key] - 1) / LIMITS[key] for key in want)'
	].join('\n');
}

/** Rule c, shared by every circuit but the Sallen-Key. */
const GENERIC_ROUNDING = [
	'def rounded(p, figures):',
	'    """Rule c: every resistor to its stocked neighbour below or above, the combination whose',
	`    figures land closest to the exact parts' kept (fit)."""`,
	'    target = figures(p)',
	'    names = [name for name in p if name[0] in "Rr"]',
	'    best, best_fit = None, math.inf',
	'    for values in itertools.product(*(neighbours(p[name]) for name in names)):',
	'        trial = {**p, **dict(zip(names, values))}',
	'        miss = fit(figures(trial), target)',
	'        if miss < best_fit:',
	'            best, best_fit = trial, miss',
	'    return best'
].join('\n');

/** value(), rule d's printout of a part. */
const VALUE = (ctx) =>
	[
		'def value(name, v):',
		'    """A part as the printout writes it, flagged when it breaks a limit (rule d)."""',
		'    if name[0] in "Rr":',
		ctx.circuit.exempt.length
			? '        inside = R_MIN <= v <= R_MAX or name == "R1"  # (the series loss, small on purpose)\n        return eng(v, "ohm") + ("" if inside else " (outside 1 kohm to 1 Mohm)")'
			: '        return eng(v, "ohm") + ("" if R_MIN <= v <= R_MAX else " (outside 1 kohm to 1 Mohm)")',
		'    return eng(v, "F") + ("" if v >= C_MIN else " (under 47 pF)")'
	].join('\n');

/**
 * design(), rule b over the choices of one stage. With the page's parts to
 * check, a stage no choice builds leaves the file without parts of its own
 * (None, and the page's are checked alone); without them, the file stops.
 */
// (a tie to 1e-9: two choices a decade apart land the same, but for the last bits of their arithmetic, which
// would otherwise pick between them instead of the 10 kohm the rule says; parts.js closest() the same)
const DESIGN = (ctx) =>
	[
		'def design(choices, figures):',
		'    """Rule b: every choice rounded (rule c), and of those within the limits, or of all of them',
		'    with none, the ones whose rounded parts land closest to their exact ones (to 1e-9: choices a',
		'    decade apart land the same), of which the one whose resistors sit nearest 10 kohm. Returns',
		'    its exact parts, its rounded parts and how many keep the limits',
		ctx.page ? '    (None when no choice rounds)."""' : '    (it stops when no choice rounds)."""',
		'    kept = [p for p in choices if within(p)]',
		'    tried = [(p, rounded(p, figures)) for p in kept or choices]',
		'    tried = [(p, parts) for p, parts in tried if parts is not None]',
		'    if not tried:',
		ctx.page ? '        return None' : '        raise SystemExit("No choice of the stock builds the stage: see SETTINGS.")',
		'    fits = [fit(figures(parts), figures(p)) for p, parts in tried]',
		'    least = min(fits)',
		'    ties = [pair for pair, f in zip(tried, fits) if f <= least + 1e-9]',
		'    exact, parts = min(ties, key=lambda pair: level(pair[0]))',
		'    return exact, parts, len(kept)'
	].join('\n');

/** figures_list(), a stage's figures as the printout writes them: units, Q, and how far each lands. */
const FIGURES_LIST = [
	'def figures_list(got, want):',
	'    """The figures of got as the printout writes them, with how far each lands from want\'s."""',
	'    out = []',
	'    for key, v in got.items():',
	'        shown = eng(v, "Hz") if key == "f0" else f"{v:.4g}"',
	'        out.append(f"{\'Q\' if key == \'q\' else key} {shown} ({100 * (v / want[key] - 1):+.2f} %)")',
	'    return out'
].join('\n');

/** The printout of one stage's parts, its exact and rounded values and how its figures land. */
function stagePrint(ctx, indent, stageWord) {
	const pad = IND.repeat(indent);
	const typedNote = ctx.anyTyped;
	const sk = ctx.name === 'sallen_key_bandpass';
	return [
		`${pad}print(f"  ${stageWord}: {kept} of {len(choices)} choices keep the limits; the closest:")`,
		`${pad}for name, v in parts.items():`,
		`${pad}    moved = name[0] in "Rr" and exact[name] != v${sk ? ' and name not in ("Rg", "Rf")' : ''}`,
		`${pad}    was = f"{eng(exact[name], 'ohm')}, rounded to " if moved else ""`,
		...(typedNote
			? [`${pad}    mine = name in typed_here or (name[0] == "C" and "C" in typed_here)`, `${pad}    note = " (typed on the page)" if mine else ""`, `${pad}    print(f"    {name} = {was}{value(name, v)}{note}")`]
			: [`${pad}    print(f"    {name} = {was}{value(name, v)}")`]),
		...(sk ? [`${pad}print(f"    Rf / Rg = {parts['Rf'] / parts['Rg']:.4f}, the pair nearest A - 1, solved last")`] : []),
		`${pad}got, want = ${ctx.name}_figures(parts), ${ctx.name}_figures(exact)`,
		`${pad}say(${ctx.gbw ? '"    after rounding, the circuit alone:"' : '"    after rounding:"'}, figures_list(got, want))`,
		`${pad}if not kept:`,
		`${pad}    print("    none of them keeps the limits: the closest of all is taken, flagged above")`
	];
}

/** The MFB stage past its gain ceiling, built at gain 1 (narrowResonator's tries). */
function atOneLines(ctx, indent, call) {
	if (!(ctx.name === 'mfb_bandpass' && ctx.short)) return [];
	const pad = IND.repeat(indent);
	return [
		`${pad}at_one = st["gain"] > 1 and not any(within(p) for p in choices)`,
		`${pad}if at_one:`,
		`${pad}    print("  past its gain ceiling: built at gain 1, a gain stage adds the rest")`,
		`${pad}    choices = list(${call.replace('(st', '({**st, "gain": 1.0}')})`
	];
}

/** Where the chain falls short of K by its form, for the gain stages: a Python expression over the stages' parts. */
function shortTest(ctx, typed) {
	switch (ctx.name) {
		case 'rlc_gyrator':
		case 'sallen_key_bandpass':
			// (no divider: the stage keeps its own gain, under K_s)
			return typed ? 'any("Rb" not in p for _, p in own_parts)' : '"Rb" not in parts';
		case 'rlc_gic':
			return 'stage_gain > 1';
		case 'mfb_bandpass':
			return typed ? 'any(built_at_one)' : 'at_one';
		default:
			return 'False';
	}
}

/** Section 3's loop with no capacitor typed: the stages are identical, one is designed and repeated. */
function sharedLoop(ctx) {
	const call = `${ctx.name}_choices(st)`;
	const tail = [
		...stagePrint(ctx, 0, 'stage 1'),
		`own_parts = [(${pyStr(ctx.name)}, parts)] * n  # (circuit, parts) of each stage`,
		'if n > 1:',
		'    print(f"  stage{\'s 2 to \' if n > 2 else \' \'}{n}: the same parts")',
		...(ctx.short ? [comment("Whether the stages' own form leaves the chain under K:"), `short = ${shortTest(ctx, false)}`] : [])
	];
	// (with the page's parts to check, a stage no choice builds leaves the file without its own)
	return [
		comment('The stages are identical: the rule designs one, and the chain repeats it.'),
		'st = stages[0]',
		`choices = list(${call})`,
		...atOneLines(ctx, 0, call),
		...(ctx.page
			? [
					`found = design(choices, ${ctx.name}_figures) if choices else None`,
					'if found is None:',
					'    print("  stage 1: no stock choice builds it; the page\'s parts are checked alone")',
					'    own_parts = None',
					'else:',
					'    exact, parts, kept = found',
					...tail.map((l) => `    ${l}`)
				]
			: ['if not choices:', pyRaise('No capacitor of the stock builds the stage: see SETTINGS.', IND), `exact, parts, kept = design(choices, ${ctx.name}_figures)`, ...tail])
	].join('\n');
}

/** Section 3's loop with capacitors typed: each stage on its own, those typed tried first. */
function typedLoop(ctx) {
	const call = `${ctx.name}_choices(st, typed_here)`;
	const mfbShort = ctx.name === 'mfb_bandpass' && ctx.short;
	return [
		'own_parts = []  # (circuit, parts) of each stage',
		...(mfbShort ? ['built_at_one = []  # whether each stage is built at gain 1'] : []),
		'for i, st in enumerate(stages):',
		'    typed_here = typed.get(i + 1, {})',
		`    choices = list(${call})`,
		'    if typed_here and not choices:',
		'        print(f"  stage {i + 1}: the capacitors typed cannot build it, the stock is tried")',
		'        typed_here = {}',
		`        choices = list(${call})`,
		...atOneLines(ctx, 1, call),
		...(mfbShort ? ['    built_at_one.append(at_one)'] : []),
		...(ctx.page
			? [
					`    found = design(choices, ${ctx.name}_figures) if choices else None`,
					'    if found is None:',
					'        print(f"  stage {i + 1}: no stock choice builds it; the page\'s parts are checked alone")',
					'        own_parts = None',
					'        break',
					'    exact, parts, kept = found'
				]
			: ['    if not choices:', pyRaise('No capacitor of the stock builds the stage: see SETTINGS.', IND.repeat(2)), `    exact, parts, kept = design(choices, ${ctx.name}_figures)`]),
		...stagePrint(ctx, 1, 'stage {i + 1}'),
		`    own_parts.append((${pyStr(ctx.name)}, parts))`,
		...(ctx.short ? [comment("Whether the stages' own form leaves the chain under K:"), `short = ${ctx.page ? 'own_parts is not None and ' : ''}${shortTest(ctx, true)}`] : [])
	].join('\n');
}

/** The gain stages after the chain, when its form leaves it under K. */
function gainLoop(ctx) {
	const body = [
		'total = abs(response(own_parts, f0))',
		'if short and gain / total > 1 + 1e-9:',
		'    amps = gain_stages(gain / total)',
		'    own_parts += [("amplifier", p) for p in amps]',
		'    print(f"  the stages give {total:.4f} at f0, and the gain stages the"',
		'          f" {gain / total:.4f} left:")',
		'    for p in amps:',
		'        g = 1 + p["R2"] / p["R1"]',
		'        print(f"    R1 = {value(\'R1\', p[\'R1\'])}, R2 = {value(\'R2\', p[\'R2\'])}:"',
		'              f" 1 + R2/R1 = {g:.4f}")'
	];
	// (with no parts of its own, a stage the rule cannot build, the file has no gain stages either)
	return [
		comment("The gain stages make up what the stages' own form leaves of K at f0, their rounding with it."),
		...(ctx.page ? ['if own_parts:', ...body.map((l) => `    ${l}`)] : body)
	].join('\n');
}

/** page_parts: the chain the page shows, a pair of resistors written as their sum; None without one. */
function pageParts(ctx) {
	if (!ctx.page) return [comment('The page shows no chain of parts for this design, so the check reads the file\'s own alone.'), 'page_parts = None'].join('\n');
	const grid = ctx.page.some((s) => s.stockShortfall);
	const lines = [
		comment(`The parts the page shows for this design${grid ? ' (a stage the stock cannot build taken from the full E24 and E6 series, as the page does)' : ''}, checked the same way:`),
		'page_parts = ['
	];
	ctx.page.forEach((stage, i) => {
		const circuit = NARROW_PY_NAME[stage.topology];
		const values = Object.entries(stage.components).map(([name, v]) => ({ name, ...pageValue(v, ctx.stock, name) }));
		const pairs = values.filter((x) => x.pair).map((x) => x.name);
		const names = pairs.length > 1 ? `${pairs.slice(0, -1).join(', ')} and ${pairs[pairs.length - 1]}` : pairs[0];
		if (pairs.length) lines.push(`${IND}# stage ${i + 1}: ${names} ${pairs.length > 1 ? 'are each' : 'is'} two resistors in series`);
		const one = `${IND}(${pyStr(circuit)}, {${values.map((x) => `${pyStr(x.name)}: ${x.text}`).join(', ')}}),`;
		if (one.length <= PY_WIDTH) {
			lines.push(one);
			return;
		}
		lines.push(`${IND}(${pyStr(circuit)}, {`);
		let line = IND.repeat(2);
		for (const x of values) {
			const piece = `${pyStr(x.name)}: ${x.text},`;
			if (line.trim() && line.length + 1 + piece.length > PY_WIDTH) {
				lines.push(line);
				line = IND.repeat(2);
			}
			line += line.trim() ? ` ${piece}` : piece;
		}
		lines.push(line, `${IND}}),`);
	});
	lines.push(']');
	return lines.join('\n');
}

/** Section 4: the page's parts, the page's measure of a narrow band and the verdict of both sets. */
function check(file, ctx) {
	file.add(
		comment(
			`Each set of parts goes through the chain's H(s) (response, 3) and is read as the page reads a narrow band-pass: the peak of |H| near f0 and its frequency, the -3 dB edges f1 and f2 around it, B = f2 - f1 and Q = f_peak / B, each against the spec within the rule's limits (1). The op-amps are ideal${ctx.gbw ? ', the MFB stages with the op-amp they are built for,' : ','} as on the page's Bode plot.`
		)
	);
	file.add(pageParts(ctx));
	file.add(MEASURE);
	file.add(CHECK(ctx));
	const both = Boolean(ctx.page);
	if (both) {
		file.add(
			[
				'def same_parts(a, b):',
				'    """Whether two sets of parts are the same, circuit by circuit, each value to 1e-9."""',
				'    return len(a) == len(b) and all(',
				'        ca == cb and pa.keys() == pb.keys() and all(math.isclose(pa[name], pb[name]) for name in pa)',
				'        for (ca, pa), (cb, pb) in zip(a, b))'
			].join('\n')
		);
	}
	file.add(
		[
			both ? 'own_check = check(own_parts) if own_parts else None' : 'own_check = check(own_parts)',
			both ? 'page_check = check(page_parts)' : 'page_check = None',
			...(both ? ['if own_check:', '    show("the file\'s parts", own_parts, own_check)'] : ['show("the file\'s parts", own_parts, own_check)']),
			...(both
				? [
						'if own_parts and same_parts(own_parts, page_parts):  # (the same parts: one check for both)',
						'    print("  the page\'s parts: the same parts, so the same check")',
						'else:',
						'    show("the page\'s parts", page_parts, page_check)'
					]
				: [])
		].join('\n')
	);
	const report = [pyPrints(`The page also runs the chain on a single-pole TL082 (${Number((NARROW_REAL_GBW / 1e6).toPrecision(4))} MHz), solved from its netlist, and checks its poles for an oscillation: an op-amp's lag moves a narrow band.`)];
	if (both) {
		report.push(
			'if own_check and not own_check["meets"] and page_check["meets"]:',
			pyPrints("The file's own parts miss: its rule rounds each resistor to a stocked neighbour, where the page solves each part against those it has already rounded.", IND)
		);
	}
	file.add(report.join('\n'));
}

/** measure(): narrowFigures of narrowBand.js, step by step. */
const MEASURE = [
	'def measure(part_set):',
	'    """The figures of a set of parts as the page reads them: |H| on 100 points an octave from',
	"    f0 / 100 to 100 f0, its largest refined by golden section between the grid's neighbours,",
	'    then each -3 dB edge by bisection in log f, None past 1000 times off the peak. The gain',
	'    there is signed by H."""',
	'',
	'    def mag(f):',
	'        return abs(response(part_set, f))',
	'',
	'    points = 1329  # 100 an octave over 4 decades',
	'    grid = [f0 / 100 * 1e4 ** (i / points) for i in range(points + 1)]',
	'    mags = [mag(f) for f in grid]',
	'    top = mags.index(max(mags))',
	'    a, b = math.log(grid[max(0, top - 1)]), math.log(grid[min(points, top + 1)])',
	'    g = (math.sqrt(5) - 1) / 2',
	'    c, d = b - g * (b - a), a + g * (b - a)',
	'    mc, md = mag(math.exp(c)), mag(math.exp(d))',
	'    for _ in range(40):',
	'        if mc > md:',
	'            b, d, md = d, c, mc',
	'            c = b - g * (b - a)',
	'            mc = mag(math.exp(c))',
	'        else:',
	'            a, c, mc = c, d, md',
	'            d = a + g * (b - a)',
	'            md = mag(math.exp(d))',
	'    peak = math.exp((a + b) / 2)',
	'    h = response(part_set, peak)',
	'    half_power = abs(h) / math.sqrt(2)',
	'',
	'    def edge(outer):',
	'        """The -3 dB point between the peak and outer (a log), by bisection; None past outer."""',
	'        if mag(math.exp(outer)) > half_power:',
	'            return None',
	'        x, y = math.log(peak), outer',
	'        for _ in range(50):',
	'            m = (x + y) / 2',
	'            x, y = (m, y) if mag(math.exp(m)) > half_power else (x, m)',
	'        return math.exp((x + y) / 2)',
	'',
	'    lower, upper = edge(math.log(peak / 1000)), edge(math.log(peak * 1000))',
	'    width = upper - lower if lower is not None and upper is not None else None',
	'    return {"f0": peak, "gain": -abs(h) if h.real < 0 else abs(h), "f1": lower, "f2": upper,',
	'            "B": width, "q": peak / width if width else None}'
].join('\n');

/** check() and show(): the verdict of a set and its printout. */
const CHECK = (ctx) => [
	'def check(part_set):',
	'    """A set of parts against the spec: its figures (measure), the error of each against the',
	'    spec, the largest error over its limit (fit: 1 on a limit, None without a Q) and whether',
	'    it keeps the rule\'s limits."""',
	'    fig = measure(part_set)',
	'    if fig["q"] is None:',
	'        return {**fig, "errors": None, "fit": None, "meets": False}',
	'    got = {"f0": fig["f0"], "q": fig["q"], "gain": abs(fig["gain"])}',
	'    want = {"f0": f0, "q": q, "gain": gain}',
	'    errors = {key: got[key] / want[key] - 1 for key in want}',
	'    worst = fit(got, want)',
	'    return {**fig, "errors": errors, "fit": worst, "meets": worst <= 1}',
	'',
	'',
	'def show(name, part_set, c):',
	'    """A set of parts and its check."""',
	'    print(f"  {name}:")',
	ctx.short ? '    for i, (circuit, p) in enumerate(part_set):' : '    for i, (_, p) in enumerate(part_set):',
	'        values = [f"{key} {value(key, v)}" for key, v in p.items()]',
	ctx.short ? '        say(f"    stage {i + 1}, {CIRCUITS[circuit][0]}:", values)' : `        say(f"    stage {i + 1}, ${ctx.circuit.label}:", values)`,
	'    print(f"    the peak at {eng(c[\'f0\'], \'Hz\')}, gain {abs(c[\'gain\']):.4f} there")',
	'    if c["q"] is None:',
	'        print("    no -3 dB edge on one side of the peak: no Q to read, past the rule\'s limits")',
	'        return',
	'    e = c["errors"]',
	'    print(f"    -3 dB edges at {eng(c[\'f1\'], \'Hz\')} and {eng(c[\'f2\'], \'Hz\')}:"',
	'          f" B = {eng(c[\'B\'], \'Hz\')}, Q = {c[\'q\']:.4f}")',
	'    print(f"    against the spec: f0 {e[\'f0\']:+.2%}, Q {e[\'q\']:+.1%}, K {e[\'gain\']:+.1%}")',
	'    verdict = "within the rule\'s limits" if c["meets"] else "past the rule\'s limits"',
	'    print(f"    the largest error is {c[\'fit\']:.2f} of its limit: {verdict}")'
].join('\n');

/** The Bode plot of both sets around f0 with the spec's lines, or a short table without matplotlib. */
function plot(file, ctx) {
	const both = Boolean(ctx.page);
	file.add(
		[
			comment('Drawn only when matplotlib is installed; otherwise a short table of the response.'),
			'try:',
			'    import matplotlib.pyplot as plt',
			'except ImportError:',
			'    plt = None',
			...(both
				? ['sets = [("the file\'s parts", own_parts), ("the page\'s parts", page_parts)]', 'sets = [(name, part_set) for name, part_set in sets if part_set]']
				: ['sets = [("the file\'s parts", own_parts)]']),
			'',
			'',
			'def db(part_set, f):',
			'    """The gain of a set of parts at f (Hz), in dB."""',
			'    return 20 * math.log10(max(abs(response(part_set, f)), 1e-12))',
			'',
			'',
			'if plt is None:',
			'    print("The response in dB (pip install matplotlib draws it):")',
			'    print("              f" + "".join(f"{name:>19}" for name, _ in sets))',
			'    for f in (f0 / 10, f0 / 2, f1, f0, f2, 2 * f0, 10 * f0):',
			'        print(f"  {eng(f, \'Hz\'):>13}" + "".join(f"{db(part_set, f):19.2f}" for _, part_set in sets))',
			'else:',
			'    span = min(10, max(3, 20 / q))  # the page\'s view: the narrower the band, the closer',
			'    freqs = [f0 / span * span ** (2 * i / 399) for i in range(400)]',
			'    for name, part_set in sets:',
			'        plt.semilogx(freqs, [db(part_set, f) for f in freqs], label=name)',
			'    k_db = 20 * math.log10(gain)',
			'    plt.axhline(k_db, color="0.5", linestyle="--", label="K and K - 3 dB, f1, f0 and f2")',
			'    plt.axhline(k_db - 3, color="0.5", linestyle="--")',
			'    for f in (f1, f0, f2):',
			'        plt.axvline(f, color="0.5", linestyle=":")',
			'    plt.xlabel("frequency (Hz)")',
			'    plt.ylabel("gain (dB)")',
			'    plt.grid(True, which="both", alpha=0.3)',
			'    plt.legend()',
			'    plt.show()'
		].join('\n')
	);
}
