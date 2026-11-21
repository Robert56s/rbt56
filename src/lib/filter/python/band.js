import { RESPONSES as RESPONSE_NAMES } from '../approximations';
import { check } from './check';
import { comment, header, listWords, PyFile, pyNum, pyRaise, pyStr, section } from './emit';
import { sideCircuits, sourceOhms, stageKind } from './filter';
import { order, PLAIN_NAME } from './order';
import { circuitNames, parts } from './parts';
import { placement } from './placement';
import { plot } from './plot';
import { LOSS_DB_RESPONSES, lossReal, poles } from './poles';
import { report } from './report';
import { docstring, orderSetting, resultsComment } from './settings';
import { stockOf, stockSettings, typedOf } from './stock';
import { targets } from './targets';
import { engHelper } from './template';
import { transformedFile } from './transform';

/**
 * The file of a band-pass or a band-stop, by the method the page shows
 * (design.method, the Method menu's auto already resolved, bandMethod.js
 * chooseBandMethod: the fewer op-amps, a tie the cascade):
 *   cascade      a band-pass as a high-pass section (fl, fsl) and a
 *                low-pass section (fh, fsh) in series (designBandPass in
 *                stages.js), each its own response, limits and topology
 *   parallel     a band-stop as a low-pass branch (fl, fsl) and a high-pass
 *                branch (fh, fsh) from one input, added by a summing
 *                amplifier (designBandStop; bandStopCombiner in
 *                partSearch.js), the source on the node both branches
 *                start from
 *   transformed  one low-pass prototype turned into band-pass or notch
 *                stages (transform.js)
 * A cascade or parallel file builds sections 2 to 4 twice, one side each
 * (the side shape of filter.js, every name with the side's suffix: n_hp,
 * stages_lp), then joins the two lists of stages and runs sections 5 and 6
 * on the whole filter.
 */
export function bandFile({ args, design, shown, registry }) {
	if (design.method === 'transformed') return transformedFile({ args, design, shown, registry });
	const ctx = bandContext({ args, design, shown, registry });
	const pass = ctx.type === 'bandpass';
	const [first, second] = ctx.sides;
	const file = new PyFile();
	file.imports.add('math');
	file.add(docstring(ctx.what, 'template', ctx.detail));
	file.add(bandSettings(ctx));
	engHelper(file);
	file.add(section('1 The template'));
	file.add(pass ? CASCADE_TEMPLATE : PARALLEL_TEMPLATE);
	file.add(section('2 The order'));
	for (const side of ctx.sides) order(file, side);
	file.add(section('3 The normalized poles'));
	for (const side of ctx.sides) poles(file, side);
	file.add(section('4 Placement and denormalization'));
	for (const side of ctx.sides) {
		placement(file, side);
		targets(file, side);
	}
	file.add(
		pass
			? 'stages = stages_hp + stages_lp  # the whole filter: the high-pass section first'
			: ['stages = stages_lp + stages_hp  # the whole filter: the low-pass branch first', `lp_count = len(stages_lp)  # the stages of the low-pass branch`].join('\n')
	);
	file.add(section('5 The parts of each stage'));
	parts(file, ctx, pass ? {} : { source: { at: 'i in (0, lp_count)', words: "rs taken off the input resistor of each branch's first stage, both on the input node", note: 'both branches start on the input node' } });
	file.add(section('6 The check'));
	check(file, ctx, pass ? CASCADE_CHECK : parallelCheck(ctx, first, second));
	report(file, ctx);
	file.add(header('Bode plot'));
	plot(file, ctx, pass ? CASCADE_FRAME : PARALLEL_FRAME);
	return file.text();
}

/**
 * The two sides of a cascade or parallel design, in the order design.stages
 * lists their stages: the high-pass section then the low-pass section of a
 * band-pass, the low-pass branch then the high-pass branch of a band-stop.
 * Each is a side of filter.js (the design of that half, its settings'
 * Python names, `tag` its name in the printout, `after` the list of stages
 * before its own).
 */
function bandSides({ args, design, shown, registry }) {
	const pass = design.method === 'cascade';
	const hpMenu = args.topologyHp ?? args.topology;
	const lpMenu = args.topologyLp ?? args.topology;
	const specs = pass
		? [
				{ half: design.hp, fp: 'fl', fs: 'fsl', amax: 'amax_hp', amin: 'amin_hp', suffix: 'hp', tag: 'high-pass section', menu: hpMenu },
				{ half: design.lp, fp: 'fh', fs: 'fsh', amax: 'amax_lp', amin: 'amin_lp', suffix: 'lp', tag: 'low-pass section', menu: lpMenu }
			]
		: [
				{ half: design.lp, fp: 'fl', fs: 'fsl', amax: 'amax_lp', amin: 'amin', suffix: 'lp', tag: 'low-pass branch', menu: lpMenu },
				{ half: design.hp, fp: 'fh', fs: 'fsh', amax: 'amax_hp', amin: 'amin', suffix: 'hp', tag: 'high-pass branch', menu: hpMenu }
			];
	const shownStages = shown?.stages ?? null;
	// (one loss_db for both sides: where one side's prototype sections carry a zero and the other's do
	// not, it reads both shapes; poles.js lossHelper)
	const lossShapes = new Set(specs.filter((s) => LOSS_DB_RESPONSES.includes(s.half.response)).map((s) => Boolean(RESPONSE_NAMES[s.half.response]?.zeros)));
	// (and with a real pole where either side's prototype can have one)
	const real = lossReal(specs.map((s) => ({ response: s.half.response, design: s.half })));
	let at = 0;
	return specs.map((s, i) => {
		const type = s.half.filterType;
		const shownSide = shownStages ? shownStages.slice(at, at + s.half.stages.length) : null;
		at += s.half.stages.length;
		return {
			type,
			lp: type === 'lowpass',
			response: s.half.response,
			...(lossShapes.size > 1 ? { lossZeros: 'both' } : {}),
			lossReal: real,
			design: s.half,
			circuits: sideCircuits(registry, s.half.stages, shownSide, s.menu, type),
			fp: s.fp,
			fs: s.fs,
			amax: s.amax,
			amin: s.amin,
			order: `order_${s.suffix}`,
			tag: s.tag,
			// (the second side of one response: its comments say what differs and point to the first's)
			like: i && specs[0].half.response === s.half.response ? specs[0].tag : null,
			after: i ? `stages_${specs[0].suffix}` : null,
			v: (name) => `${name}_${s.suffix}`
		};
	});
}

/** Everything the sections read for a cascade or parallel band filter (filterContext's fields, and the two sides). */
function bandContext({ args, design, shown, registry }) {
	const pass = design.method === 'cascade';
	const sides = bandSides({ args, design, shown, registry });
	const shownStages = shown?.stages ?? null;
	const used = [...new Set([...sides.flatMap((side) => side.design.stages.map((s) => side.circuits[stageKind(s)])), ...(shownStages ?? []).filter(Boolean).map((s) => registry.circuitOf(s.topology).circuit)])];
	const families = [...new Set(used.map((c) => registry.familyOf(c).family))];
	const [a, b] = sides;
	const name = (side) => PLAIN_NAME[side.response] ?? RESPONSE_NAMES[side.response]?.label ?? side.response;
	// (the summary on one line, the stages in a sentence of their own under it)
	const halves = pass ? ['high-pass', 'low-pass', 'section', 'in series'] : ['low-pass', 'high-pass', 'branch', 'summed'];
	const responses = a.response === b.response ? `${name(a)} response, a ${halves[0]} and a ${halves[1]} ${halves[2]} ${halves[3]}` : `two ${halves[2]}${pass ? 's' : 'es'} ${halves[3]}, ${name(a)} ${halves[0]} and ${name(b)} ${halves[1]}`;
	return {
		args,
		design,
		shown,
		registry,
		type: pass ? 'bandpass' : 'bandstop',
		lp: false,
		sides,
		placement: design.placement?.mode === 'centred' ? 'centred' : 'edge',
		rs: sourceOhms(args.sourceR),
		stock: stockOf(args),
		typed: typedOf(args.capOverrides),
		circuits: used,
		pageComplete: Boolean(shownStages?.length) && shownStages.every(Boolean),
		what: `Active ${pass ? 'band-pass' : 'band-stop'} filter: ${responses}.`,
		detail: `Its stages: ${listWords(families)}.`
	};
}

/** SETTINGS of a cascade or parallel band filter: the four edges, each side's limits and order. */
function bandSettings(ctx) {
	const { design } = ctx;
	const pass = ctx.type === 'bandpass';
	const [a, b] = ctx.sides;
	const edges = pass
		? [
				`fsl = ${pyNum(design.fsl)}  # Hz, the lower stopband edge`,
				`fl = ${pyNum(design.fl)}  # Hz, the lower passband edge`,
				`fh = ${pyNum(design.fh)}  # Hz, the upper passband edge`,
				`fsh = ${pyNum(design.fsh)}  # Hz, the upper stopband edge`,
				comment('The high-pass section holds fl and fsl, the low-pass section fh and fsh, each with its own limits:'),
				`amax_hp = ${pyNum(design.amaxDbHp)}  # dB, the most loss allowed at fl`,
				`amin_hp = ${pyNum(design.aminDbHp)}  # dB, the least loss required from fsl down`,
				`amax_lp = ${pyNum(design.amaxDbLp)}  # dB, the most loss allowed at fh`,
				`amin_lp = ${pyNum(design.aminDbLp)}  # dB, the least loss required from fsh up`
			]
		: [
				`fl = ${pyNum(design.fl)}  # Hz, the lower passband edge`,
				`fsl = ${pyNum(design.fsl)}  # Hz, the lower stopband edge`,
				`fsh = ${pyNum(design.fsh)}  # Hz, the upper stopband edge`,
				`fh = ${pyNum(design.fh)}  # Hz, the upper passband edge`,
				comment('The low-pass branch holds fl and fsl, the high-pass branch fh and fsh; both hold amin:'),
				`amax_lp = ${pyNum(design.amaxDbLp)}  # dB, the most loss allowed from fl down`,
				`amax_hp = ${pyNum(design.amaxDbHp)}  # dB, the most loss allowed from fh up`,
				`amin = ${pyNum(design.lp.aminDb)}  # dB, the least loss required from fsl to fsh`
			];
	const lines = [
		header('SETTINGS'),
		...edges,
		orderSetting(a.order, a.design),
		orderSetting(b.order, b.design),
		`placement = ${pyStr(ctx.placement)}  # "edge": amax exactly at fl and fh; "centred": the middle of the room left`,
		`rs = ${pyNum(ctx.rs)}  # ohm, the source resistance in series with the input (0 for an ideal source)`
	];
	const names = [a, b].flatMap((side) => [side.v('k'), side.v('n'), side.v('wc')]);
	return [lines.join('\n'), stockSettings(ctx), resultsComment([...names, ...(pass ? [] : ['lp_count']), 'stages', 'own_parts', 'own_check', 'page_parts', 'page_check'])].join('\n\n');
}

/* ---------------------------------------------------------------- template */

const CASCADE_TEMPLATE = [
	comment(
		'A band-pass keeps fl to fh within its limit of the top of its passband, amax_hp at fl and amax_lp at fh (straight between on a log axis), and loses at least amin_hp from fsl down and amin_lp from fsh up. The page builds a band filter one of two ways, the one its Method menu shows (on auto, the one that takes fewer op-amps, the cascade on a tie): here the cascade, a high-pass section (passband edge fl, stopband edge fsl) and a low-pass section (fh, fsh) in series, each designed as a filter of its own. The check (6) reads two decades below fsl and above fsh, as the page does.'
	),
	'if not (0 < fsl < fl < fh < fsh and 0 < amax_hp < amin_hp and 0 < amax_lp < amin_lp):',
	pyRaise('A band-pass needs 0 < fsl < fl < fh < fsh and 0 < amax < amin on each side: see SETTINGS.', '    '),
	"k_hp = fsl / fl  # the high-pass section's transition ratio, under 1",
	"k_lp = fh / fsh  # the low-pass section's",
	comment('(from Hz, to Hz, the most loss at each end in dB) and (from Hz, to Hz, the least loss in dB):'),
	'passband = [(fl, fh, amax_hp, amax_lp)]',
	'stopband = [(fsl / 100, fsl, amin_hp), (fsh, fsh * 100, amin_lp)]',
	'print(f"  k_hp = fsl / fl = {k_hp:.4f}, k_lp = fh / fsh = {k_lp:.4f}")',
	`print(f"  passband {eng(fl, 'Hz')} to {eng(fh, 'Hz')}: at most {amax_hp:g} dB of loss at fl,"`,
	'      f" {amax_lp:g} dB at fh")',
	`print(f"  stopband {eng(fsl / 100, 'Hz')} to {eng(fsl, 'Hz')}: at least {amin_hp:g} dB of loss")`,
	`print(f"  stopband {eng(fsh, 'Hz')} to {eng(fsh * 100, 'Hz')}: at least {amin_lp:g} dB of loss")`
].join('\n');

const PARALLEL_TEMPLATE = [
	comment(
		'A band-stop keeps fl and below within amax_lp of the top of its passband, and fh and above within amax_hp, and loses at least amin from fsl to fsh. The page builds a band filter one of two ways, the one its Method menu shows (on auto, the one that takes fewer op-amps, the cascade on a tie): here two branches from the same input, a low-pass (passband edge fl, stopband edge fsl) and a high-pass (fh, fsh), each designed as a filter of its own, and a summing amplifier adds them: each one passes its own passband, and both block the stopband. The check (6) reads two decades below fl and above fh, as the page does.'
	),
	'if not (0 < fl < fsl < fsh < fh and 0 < amax_lp < amin and 0 < amax_hp < amin):',
	pyRaise('A band-stop needs 0 < fl < fsl < fsh < fh and 0 < amax < amin on each side: see SETTINGS.', '    '),
	"k_lp = fl / fsl  # the low-pass branch's transition ratio, under 1",
	"k_hp = fsh / fh  # the high-pass branch's",
	comment('(from Hz, to Hz, the most loss in dB) and (from Hz, to Hz, the least loss in dB):'),
	'passband = [(fl / 100, fl, amax_lp), (fh, fh * 100, amax_hp)]',
	'stopband = [(fsl, fsh, amin)]',
	'print(f"  k_lp = fl / fsl = {k_lp:.4f}, k_hp = fsh / fh = {k_hp:.4f}")',
	`print(f"  passband {eng(fl / 100, 'Hz')} to {eng(fl, 'Hz')}: at most {amax_lp:g} dB of loss")`,
	`print(f"  passband {eng(fh, 'Hz')} to {eng(fh * 100, 'Hz')}: at most {amax_hp:g} dB of loss")`,
	`print(f"  stopband {eng(fsl, 'Hz')} to {eng(fsh, 'Hz')}: at least {amin:g} dB of loss")`
].join('\n');

/* ------------------------------------------------------------------- check */

/** check()'s options for a cascade band-pass: the sloped limit across its passband, each side's stopband. */
const CASCADE_CHECK = {
	sloped: true,
	sides: ['below the band', 'above the band'],
	comment:
		"Each set of parts goes through each stage's H(s), written from its parts with ideal op-amps and rs in series with the input, and is read as the page reads its template: from the top of the passband (401 points from fl to fh), the worst passband loss against its limit (0.05 dB of slack), and the least stopband loss of each side against its amin (801 points a stretch).",
	limits: 'limits = f"{amax_hp:g}" if amax_hp == amax_lp else f"{amax_hp:g} to {amax_lp:g}"  # dB, fl to fh',
	rows: ['f"passband, <= {limits} dB"', 'f"below the band, >= {amin_hp:g} dB"', 'f"above the band, >= {amin_lp:g} dB"']
};

/** The summing amplifier's resistors by the names the page's table gives them, for the comment on the entry. */
const SUMMER_NAMES = 'RCA the low-pass input (the page\'s Ra), RCB the high-pass input (Rb), RCF the feedback (Rf); as a difference amplifier, RCH the high-pass input, RCG its divider to ground, RCL the low-pass input';

/**
 * check()'s options for a band-stop of two branches: the summing amplifier
 * as the last entry of each set (the page's as data, the file's by its
 * rule), the page's own low-pass branch count beside its parts
 * (page_lp_count: a set splits into its branches by its own count), and the
 * response of the two branches added, the source on the node they share.
 */
function parallelCheck(ctx, lpSide, hpSide) {
	const combiner = ctx.shown?.measure?.combiner?.parts?.resistors ?? null;
	const first = (side) => side.circuits[stageKind(side.design.stages[0])];
	const ys = [...new Set([first(lpSide), first(hpSide), ...(ctx.pageComplete ? [ctx.shown.stages[0], ctx.shown.stages[lpSide.design.stages.length]].map((s) => ctx.registry.circuitOf(s.topology).circuit) : [])])];
	const lpCount = lpSide.design.stages.length;
	const extra = ctx.pageComplete && combiner;
	return {
		comment:
			"Each set of parts goes through each stage's H(s), written from its parts with ideal op-amps: each branch's stages multiplied, the two branches added by the summing amplifier, and rs on the node both branches start from. It is read as the page reads its template: from the top of the passband (401 points a stretch), the worst passband loss against its amax (0.05 dB of slack) and the least stopband loss against amin (801 points).",
		pageExtra: extra ? { circuit: 'summer', entries: Object.entries(combiner), words: 'its summing amplifier', note: `the summing amplifier: ${SUMMER_NAMES}` } : null,
		pageTail: ctx.pageComplete ? `page_lp_count = ${lpCount}  # the page's low-pass branch: the first ${lpCount} of its stages` : null,
		pageStages: extra ? { list: 'page_parts[:-1]', same: 'len(page_parts) - 1 == len(stages) and page_lp_count == lp_count', summer: true } : null,
		source: 'i in (0, lp_count)',
		limits: 'limits = f"{amax_lp:g}" if amax_lp == amax_hp else f"{amax_lp:g} and {amax_hp:g}"  # dB',
		rows: ['f"passband, <= {limits} dB"', 'f"stopband, >= {amin:g} dB"'],
		gainDb: parallelGain(ctx, ys)
	};
}

/**
 * The Python of <circuit>_y(p, s), the input admittance its family writes
 * beside its H(s) (index.js), for the circuit a branch starts with.
 */
function inputAdmittance(registry, circuit, ctx) {
	const family = registry.familyOf(circuit);
	const code = family.admittance?.(circuit, ctx);
	if (!code) throw new Error(`filter-design.py: the family of ${circuit} writes no input admittance, which a band-stop of two branches needs`);
	return code;
}

/**
 * The Python of a band-stop of two branches after the H(s): each first
 * stage's input admittance (its family's), the summing amplifier's rule,
 * its weights, gain_db, and the file's own summing amplifier added to
 * own_parts. `ys` the circuits whose admittance is written.
 */
function parallelGain(ctx, ys) {
	const blocks = ys.map((c) => inputAdmittance(ctx.registry, c, ctx)).filter(Boolean);
	const items = ys.map((c) => `${pyStr(c)}: ${c}_y`);
	const table = `ADMITTANCES = {${items.join(', ')}}  # the input admittance of each branch's first stage`;
	return [
		...blocks.flatMap((b) => [b, '', '']),
		table.length <= 100 ? table : ['ADMITTANCES = {  # the input admittance of each branch\'s first stage', ...items.map((x) => `    ${x},`), '}'].join('\n'),
		'',
		'',
		...summerCode(ctx.pageComplete, circuitNames(ctx).one)
	].join('\n');
}

/**
 * The summing amplifier: its rule (the page's combinerChoice and combinerDesign in bode.js), its weights,
 * gain_db, and the file's own amplifier; `page` whether the file holds the page's parts (and their
 * page_lp_count).
 */
const summerCode = (page, one) => [
	'def nearest(r):',
	'    """The stocked resistor nearest r on a log scale (the lower one on a tie)."""',
	'    return min(resistors, key=lambda v: (abs(math.log(v / r)), v))',
	'',
	'',
	'R_SUM = nearest(10e3)  # ohm, the stock\'s resistor nearest 10 kohm',
	'',
	'',
	'def branch(stages, s):',
	'    """H(s) of one branch: its stages multiplied, the first one as an ideal source drives it."""',
	'    h = 1',
	// (a file of one circuit calls its H(s) by name)
	...(one ? ['    for _, p in stages:', `        h *= ${one}_h(p, s, 0.0)`] : ['    for circuit, p in stages:', '        h *= RESPONSES[circuit](p, s, 0.0)']),
	'    return h',
	'',
	'',
	'def summer(stages):',
	'    """The summing amplifier of a set of stages, as the page builds it: the sum -(V_lp + V_hp),',
	'    or the difference V_hp - V_lp where that leaves the deeper notch at sqrt(fsl fsh), the',
	"    middle of the stopband, where the two branches' tails meet and cancel in antiphase (the sum",
	'    on a tie). Every resistor is R_SUM but the low-pass input, R_SUM times the low-pass',
	"    branch's DC gain rounded to the stock, so that both passbands come out at one level. Its",
	"    resistors, by the page's table: RCA the low-pass input (Ra), RCB the high-pass input (Rb),",
	'    RCF the feedback (Rf); as a difference amplifier, RCH the high-pass input, RCG its divider',
	'    to ground and RCL the low-pass input."""',
	'    lp, hp = stages[:lp_count], stages[lp_count:]',
	'    s = 2j * math.pi * math.sqrt(fsl * fsh)',
	'    plain = -20 * math.log10(max(abs(branch(lp, s) + branch(hp, s)), 1e-12))',
	'    difference = -20 * math.log10(max(abs(branch(hp, s) - branch(lp, s)), 1e-12))',
	'    dc = abs(branch(lp, 0j).real)',
	'    r_lp = R_SUM if abs(dc - 1) < 1e-9 else nearest(R_SUM * dc)',
	'    if difference > plain + 1e-9:',
	'        return {"RCH": R_SUM, "RCG": r_lp, "RCL": r_lp, "RCF": R_SUM}',
	'    return {"RCA": r_lp, "RCB": R_SUM, "RCF": R_SUM}',
	'',
	'',
	'def weights(amp):',
	'    """What a summing amplifier multiplies each branch by, (low-pass, high-pass), its overall sign',
	'    left out: the sum gives Vout = -(RCF/RCA V_lp + RCF/RCB V_hp), the difference',
	'    Vout = (1 + RCF/RCL) RCG/(RCH + RCG) V_hp - RCF/RCL V_lp."""',
	'    if "RCA" in amp:',
	'        return amp["RCF"] / amp["RCA"], amp["RCF"] / amp["RCB"]',
	'    gain = amp["RCF"] / amp["RCL"]',
	'    return -gain, (1 + gain) * (amp["RCG"] / (amp["RCH"] + amp["RCG"]))',
	'',
	'',
	'def gain_db(part_set, f):',
	'    """The gain of a set of parts at f (Hz), in dB: the two branches weighted and added by the',
	'    summing amplifier (the last entry of the set), times the factor of the source on the node',
	'    both branches start from, F = 1 / (1 + rs (Y_lp + Y_hp)), Y_lp and Y_hp the input',
	page ? "    admittances of the branches' first stages (the summing amplifier takes nothing from it)." : "    admittances of the branches' first stages (the summing amplifier takes nothing from it).\"\"\"",
	...(page ? ["    Each set splits into its branches by its own count: the page's parts by page_lp_count.\"\"\""] : []),
	'    s = 2j * math.pi * f',
	'    *stages, (_, amp) = part_set',
	page ? '    count = page_lp_count if part_set is page_parts else lp_count' : '    count = lp_count',
	'    lp, hp = stages[:count], stages[count:]',
	'    w_lp, w_hp = weights(amp)',
	'    h = w_lp * branch(lp, s) + w_hp * branch(hp, s)',
	'    y = ADMITTANCES[lp[0][0]](lp[0][1], s) + ADMITTANCES[hp[0][0]](hp[0][1], s)',
	'    return 20 * math.log10(max(abs(h / (1 + rs * y)), 1e-12))',
	'',
	'',
	"# The file's own summing amplifier, by the rule above, on its own stages (it reads their H(s)):",
	// (without parts of its own, a stage its rule cannot build, the file has no amplifier to design either)
	...(page ? ['if own_parts:'] : []),
	...[
		'own_parts.append(("summer", summer(own_parts)))',
		'mode = "the sum" if "RCA" in own_parts[-1][1] else "the difference"',
		'dc = abs(branch(own_parts[:lp_count], 0j).real)',
		'print(f"  the file\'s summing amplifier, {mode}; the low-pass branch\'s DC gain {dc:.4f}:")',
		'print("    " + ", ".join(f"{name} {value(name, v)}" for name, v in own_parts[-1][1].items()))'
	].map((l) => (page ? `    ${l}` : l))
];

/* -------------------------------------------------------------------- plot */

const CASCADE_FRAME = {
	points: 'fsl / 10, fsl, fl, math.sqrt(fl * fh), fh, fsh, fsh * 10',
	span: ['fsl / 10', 'fsh * 10'],
	limits: [
		'plt.plot([fl, fh], [-amax_hp, -amax_lp], color="0.5", linestyle="--", label="amax and amin")',
		'plt.hlines(-amin_hp, lo, fsl, colors="0.5", linestyles="--")',
		'plt.hlines(-amin_lp, fsh, hi, colors="0.5", linestyles="--")'
	]
};

const PARALLEL_FRAME = {
	points: 'fl / 10, fl, fsl, math.sqrt(fsl * fsh), fsh, fh, fh * 10',
	span: ['fl / 10', 'fh * 10'],
	limits: [
		'plt.hlines(-amax_lp, lo, fl, colors="0.5", linestyles="--", label="amax and amin")',
		'plt.hlines(-amax_hp, fh, hi, colors="0.5", linestyles="--")',
		'plt.hlines(-amin, fsl, fsh, colors="0.5", linestyles="--")'
	]
};
