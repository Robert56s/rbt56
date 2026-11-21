import { SERIES } from '../eseries';
import { comment, IND, listWords, noted, PY_WIDTH, pyDict, pyPrints, pyStr, prose, shortValue } from './emit';
import { circuitNames, needsSay, printList, sayHelper } from './parts';
import { pageValue } from './stock';

/**
 * Section 6, the check: the page's parts as data, each circuit's H(s) from
 * its parts (each topology module's response), the measure the page takes
 * (measureFilter in partSearch.js: from the top of the passband, 401
 * points per passband stretch and 801 per stopband stretch, the worst
 * passband point against its limit, the least stopband point against amin,
 * PASSBAND_SLACK_DB on the passband) of both part sets, and their printout:
 * the page's parts stage by stage against their targets (the file's own
 * are printed so in 5), then one table of both checks. Defines page_parts,
 * gain_db(), check(), own_check and page_check (and RESPONSES, each
 * circuit's H(s), where the file has more than one).
 *
 * gain_db(part_set, f) multiplies the stages and puts the source on the
 * first one: a band filter whose response is built otherwise (a
 * band-stop's two branches, summed, the source on the node they share)
 * passes the Python of its own `def gain_db(part_set, f):` through
 * opts.gainDb; check() and the plot read gain_db alone.
 */

/** A value with its unit for a comment, 3 figures (4 as the printout's eng() writes it): 778 ohm, 300 kHz, 30 pF. */
function words(v, unit, digits = 3) {
	for (const [prefix, scale] of [['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12]]) {
		if (Math.abs(v) >= scale || prefix === 'p') return `${prose(v / scale, digits)} ${prefix}${unit}`;
	}
	return `${v} ${unit}`;
}

/**
 * The page's alerts on the parts shown (shown.alerts: an output load under 2
 * kohm, a resistor under the floor or over the ceiling, a capacitor under 47
 * pF), in words: { loads, all }, the loads alone (the file prints them: it
 * computes none) and every alert, '' for none.
 */
export function alertWords(shown) {
	const alerts = shown?.alerts ?? [];
	const loads = alerts.filter((a) => a.kind === 'load').map((a) => `stage ${a.stage + 1} drives about ${words(a.load, 'ohm')} at ${words(a.freq, 'Hz')}`);
	const parts = alerts
		.filter((a) => a.kind !== 'load')
		.map((a) => `stage ${a.stage + 1}'s ${a.resistor ?? a.capacitor} = ${words(a.value, a.kind === 'cap' ? 'F' : 'ohm')} (${a.kind === 'floor' ? 'under 1 kohm' : a.kind === 'ceiling' ? 'over 1 Mohm' : 'under 47 pF'})`);
	return { loads: loads.length ? `${listWords(loads)}, under the 2 kohm an op-amp's output needs` : '', all: listWords([...loads, ...parts]) };
}

/** The set the page shows, in words, for the comment above page_parts. */
export function shownWords(shown) {
	const broken = alertWords(shown).all;
	if (shown?.pastLimits) return `the set past the limits on the parts, which the page offers when none within them meets the template${broken ? `: ${broken}` : ''}`;
	if (shown?.withinLimits === false) return `past the limits on the parts: no set within them could be built${broken ? `; ${broken}` : ''}`;
	if (Number.isInteger(shown?.designIndex) && shown.designIndex > 0) return `design ${shown.designIndex + 1} of its "Next design" list`;
	return `the best set it found${broken ? `; the page's alerts on it: ${broken}` : ''}`;
}

/** The E6 capacitors SETTINGS writes where the stock has no list, and the E12 grid the page takes Ctop and Cin from then (1 pF to 820 uF). */
const gridOf = (series, from, to) => {
	const out = [];
	for (let d = from; d <= to; d++) for (const m of series) out.push(m * 10 ** d);
	return out;
};
const E6_STOCK = gridOf(SERIES.E6, -12, -6);
const E12_GRID = gridOf(SERIES.E12, -12, -4);

/**
 * Where the page's parts leave the stock SETTINGS writes, as comment lines:
 * a stage the stock cannot build, which the page builds from the full E24
 * and E6 series (stockShortfall), and the capacitors off the list (without
 * one, the E12 grid the page takes a Sallen-Key's Ctop and a Tow-Thomas
 * notch's Cin from), the ones typed on the page left out.
 */
function offStock(ctx, stages) {
	const list = ctx.stock.capacitors ?? E6_STOCK;
	const has = (v) => list.some((c) => Math.abs(c / v - 1) < 1e-9);
	const short = [];
	const off = [];
	stages.forEach((stage, i) => {
		if (stage.stockShortfall) {
			short.push(i + 1);
			return;
		}
		const typed = Object.values(ctx.typed[i] ?? {}).map(shortValue);
		for (const [name, v] of Object.entries(stage.components)) {
			if (/^C/.test(name) && !has(v) && !typed.includes(shortValue(v))) off.push({ stage: i + 1, name, grid: !ctx.stock.capacitors && E12_GRID.some((c) => Math.abs(c / v - 1) < 1e-9) });
		}
	});
	const out = [];
	if (short.length) out.push(`${short.length > 1 ? `Stages ${listWords(short.map(String))}` : `Stage ${short[0]}`}: the stock cannot build ${short.length > 1 ? 'them' : 'it'}, so the page takes ${short.length > 1 ? 'their' : 'its'} parts from the full E24 and E6 series.`);
	const named = (xs) => listWords([...new Set(xs.map((x) => x.name))].map((name) => `${name} of ${xs.filter((x) => x.name === name).length > 1 ? 'stages' : 'stage'} ${listWords(xs.filter((x) => x.name === name).map((x) => String(x.stage)))}`));
	const grid = off.filter((x) => x.grid);
	const other = off.filter((x) => !x.grid);
	if (grid.length) out.push(`Not in the capacitors above: ${named(grid)}, which the page takes from the E12 series (1 pF to 820 uF) where no capacitor list is given.`);
	if (other.length) out.push(`Not in the capacitors above: ${named(other)}.`);
	return out.length ? comment(out.join(' ')) : null;
}

/**
 * page_parts: each stage the page shows as (circuit, parts), a pair of
 * resistors written as their sum; None when the page cannot build every
 * stage (ctx.pageComplete false: its parts then have nothing to check).
 * `extra` adds one more entry after the stages, { circuit, entries
 * ([[name, value]]), words, note }: a band-stop's summing amplifier,
 * `words` its name in the comment above, `note` a comment line above it.
 * `tail` code written right under the list (a band-stop's page_lp_count).
 */
export function pageParts(ctx, extra = null, tail = null) {
	if (!ctx.pageComplete) return [comment('The page cannot build every stage of this design (it says which), so it shows no set of parts to check here.'), 'page_parts = None'].join('\n');
	const stages = ctx.shown?.stages ?? [];
	const which = shownWords(ctx.shown);
	// (a design of the Next design list names itself: "for this design" would say it twice)
	const lines = [comment(`The parts the page shows${which.startsWith('design ') ? '' : ' for this design'} (${which}), checked the same way${extra ? `, ${extra.words} last` : ''}:`)];
	const off = offStock(ctx, stages);
	if (off) lines.push(off);
	lines.push('page_parts = [');
	const items = stages.map((stage) => {
		const { family, circuit } = ctx.registry.circuitOf(stage.topology);
		return { circuit, entries: family.pageParts ? family.pageParts(stage) : Object.entries(stage.components) };
	});
	if (extra) items.push(extra);
	items.forEach(({ circuit, entries, note }, i) => {
		const values = entries.map(([name, v]) => ({ name, ...pageValue(v, ctx.stock, name) }));
		const pairs = values.filter((x) => x.pair).map((x) => x.name);
		if (note) lines.push(comment(note, IND));
		if (pairs.length) lines.push(`${IND}# stage ${i + 1}: ${listWords(pairs)} ${pairs.length > 1 ? 'are each' : 'is'} two resistors in series`);
		const body = values.map((x) => `${pyStr(x.name)}: ${x.text}`).join(', ');
		const one = `${IND}(${pyStr(circuit)}, {${body}}),`;
		if (one.length <= PY_WIDTH) lines.push(one);
		else {
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
		}
	});
	lines.push(']');
	if (tail) lines.push(tail);
	return lines.join('\n');
}

/** The cascade's gain: the stages multiplied, the source on the first one. */
function cascadeGain(ctx) {
	const one = circuitNames(ctx).one;
	return [
		'def gain_db(part_set, f):',
		'    """The gain of a set of parts at f (Hz), in dB: the stages\' H multiplied, rs in series with',
		'    the first stage\'s input (an op-amp output drives the next stage as an ideal source)."""',
		'    s = 2j * math.pi * f',
		'    h = 1',
		one ? '    for i, (_, p) in enumerate(part_set):' : '    for i, (circuit, p) in enumerate(part_set):',
		one ? `        h *= ${one}_h(p, s, rs if i == 0 else 0.0)` : '        h *= RESPONSES[circuit](p, s, rs if i == 0 else 0.0)',
		'    return 20 * math.log10(max(abs(h), 1e-12))'
	].join('\n');
}

/** The longest line the page's parts of a stage print on (head and parts, flags and all), for needsSay. */
function pageWidth(ctx, extra) {
	const R_MIN = 1e3;
	const R_MAX = 1e6;
	const C_MIN = 47e-12;
	const items = (ctx.shown?.stages ?? []).filter(Boolean).map((stage) => [ctx.registry.label(ctx.registry.circuitOf(stage.topology).circuit), Object.entries(stage.components)]);
	if (extra) items.push(['summing amplifier', extra.entries]);
	return Math.max(
		0,
		...items.map(([label, entries], i) => {
			const parts = entries.map(([name, v]) => {
				const r = /^[Rr]/.test(name);
				const flag = r ? (v >= R_MIN && v <= R_MAX ? '' : ' (outside 1 kohm to 1 Mohm)') : v >= C_MIN ? '' : ' (under 47 pF)';
				return `${name} ${words(v, r ? 'ohm' : 'F', 4)}${flag}`.length + 1;
			});
			return `    stage ${i + 1}, ${label}:`.length + parts.reduce((a, b) => a + b + 1, 0);
		})
	);
}

/**
 * The section's options, for a band filter (band.js, transform.js); left
 * out, a low-pass or a high-pass:
 *   comment   the comment that opens the section, in place of the one below
 *   pageExtra pageParts' extra entry (a band-stop's summing amplifier)
 *   pageTail  pageParts' tail (a band-stop's page_lp_count)
 *   gainDb    the Python of the filter's own `def gain_db(part_set, f):`
 *   sloped    the passband stretches are (from Hz, to Hz, the limit at
 *             each end): a cascade band-pass, amax_hp at fl and amax_lp at
 *             fh, the limit straight between on a log axis
 *   sides     the names of the stopband stretches (a band-pass's two sides):
 *             the check keeps the least loss of each, and prints each
 *   rows      the Python of the table's row names before "margin" (one for
 *             the passband, one for each stopband stretch the check keeps)
 *   limits    a line of Python before the table the rows read (the passband
 *             limits of a band filter's two sides, in words)
 *   pageStages  the page's parts that are stages, a Python slice of
 *             page_parts ('page_parts[:-1]' with a summing amplifier last),
 *             `same` the Python test that the settings still give the page's
 *             stages, and `summer` true to print the amplifier after them
 *   source    the Python test on i of the stages the source drives, for
 *             their figures ('i in (0, lp_count)': both branches' first)
 */
export function check(file, ctx, opts = {}) {
	const names = circuitNames(ctx);
	file.add(
		comment(
			opts.comment ??
				"Each set of parts goes through each stage's H(s), from its parts with ideal op-amps and rs in series with the input, and is read as the page reads its template: from the top of the passband, the worst passband loss against amax (0.05 dB of slack), the least stopband loss against amin."
		)
	);
	file.add(pageParts(ctx, opts.pageExtra ?? null, opts.pageTail ?? null));
	for (const circuit of ctx.circuits) file.add(ctx.registry.familyOf(circuit).response(circuit, ctx));
	if (!names.one) file.add(pyDict('RESPONSES', ctx.circuits.map((c) => `${pyStr(c)}: ${c}_h`), "each circuit's H(s)"));
	file.add(opts.gainDb ?? cascadeGain(ctx));
	const sides = Array.isArray(opts.sides) && opts.sides.length > 1;
	const points = opts.sloped
		? ['    points = [(lo * (hi / lo) ** (i / 400), limit_lo + (limit_hi - limit_lo) * i / 400)', '              for lo, hi, limit_lo, limit_hi in passband for i in range(401)]']
		: ['    points = [(lo * (hi / lo) ** (i / 400), limit) for lo, hi, limit in passband', '              for i in range(401)]'];
	// (the cells of its column in the table: the worst passband point, the least stopband point of each
	// stretch kept, the margin with the verdict)
	const cells = (stops) => [
		'    slack = " (slack)" if meets and worst["margin"] < 0 else ""',
		'    cells = [f"{worst[\'loss\']:.3f} dB at {eng(worst[\'f\'], \'Hz\')}",',
		`             ${stops},`,
		'             f"{margin:+.3f} dB, {\'meets\' if meets else \'misses\'}{slack}"]'
	];
	const stop = sides
		? [
				'    sides = []  # the stopband point with the least room of each stretch',
				'    for lo, hi, limit in stopband:',
				'        least = None',
				'        for i in range(801):',
				'            f = lo * (hi / lo) ** (i / 800)',
				'            loss = top - gain_db(part_set, f)',
				'            if least is None or loss - limit < least["margin"]:',
				'                least = {"f": f, "loss": loss, "limit": limit, "margin": loss - limit}',
				'        sides.append(least)',
				'    least = min(sides, key=lambda side: side["margin"])',
				'    margin = min(worst["margin"], least["margin"])',
				'    meets = worst["margin"] >= -0.05 and least["margin"] >= -1e-6',
				...cells('*(f"{side[\'loss\']:.2f} dB at {eng(side[\'f\'], \'Hz\')}" for side in sides)'),
				'    return {"top": top, "pass": worst, "stop": least, "sides": sides, "margin": margin,',
				'            "meets": meets, "cells": cells}'
			]
		: [
				'    least = None',
				'    for lo, hi, limit in stopband:',
				'        for i in range(801):',
				'            f = lo * (hi / lo) ** (i / 800)',
				'            loss = top - gain_db(part_set, f)',
				'            if least is None or loss - limit < least["margin"]:',
				'                least = {"f": f, "loss": loss, "limit": limit, "margin": loss - limit}',
				'    margin = min(worst["margin"], least["margin"])',
				'    meets = worst["margin"] >= -0.05 and least["margin"] >= -1e-6',
				...cells('f"{least[\'loss\']:.2f} dB at {eng(least[\'f\'], \'Hz\')}"'),
				'    return {"top": top, "pass": worst, "stop": least, "margin": margin, "meets": meets,',
				'            "cells": cells}'
			];
	file.add(
		[
			'def check(part_set):',
			sides
				? '    """A set of parts against the template: the top of its passband, the passband point with the\n    least room against its limit, the stopband point with the least room against its amin (and\n    the one of each side), the margin (the smaller room), whether it meets the template, and its\n    cells in the table below."""'
				: '    """A set of parts against the template: the top of its passband, the passband and the stopband\n    points with the least room against their limits, the margin (the smaller room), whether it\n    meets the template, and its cells in the table below."""',
			...points,
			'    gains = [gain_db(part_set, f) for f, _ in points]',
			'    top = max(gains)',
			'    worst = None',
			'    for (f, limit), g in zip(points, gains):',
			'        loss = top - g',
			'        if worst is None or limit - loss < worst["margin"]:',
			'            worst = {"f": f, "loss": loss, "limit": limit, "margin": limit - loss}',
			...stop
		].join('\n')
	);
	const page = ctx.pageComplete;
	const lines = [page ? `own_check = check(own_parts) if own_parts else None` : 'own_check = check(own_parts)', page ? 'page_check = check(page_parts)' : 'page_check = None'];
	if (page) {
		if (needsSay(ctx, pageWidth(ctx, opts.pageExtra)) || ctx.opamp) sayHelper(file);
		const stagesOf = opts.pageStages?.list ?? 'page_parts';
		const same = opts.pageStages?.same ?? 'len(page_parts) == len(stages)';
		// (the stage's name in the f-string of its line: the one circuit's own, or its entry of CIRCUITS)
		const label = names.one ? names.labelText : '{CIRCUITS[circuit][0]}';
		const figures = names.one ? names.figures : 'CIRCUITS[circuit][2]';
		const sourceAt = opts.source ?? 'i == 0';
		const want = ctx.opamp ? 'want' : 'stages[i]';
		// (the MFB band-pass built for an op-amp: its figures are the circuit's alone, read against the
		// circuit's own targets; a file of those stages alone needs no test of the circuit)
		const onlyMfb = names.one === 'mfb_bandpass';
		if (ctx.opamp) {
			file.add(
				[
					'def aim(st, p):',
					onlyMfb
						? '    """What the figures of a stage\'s parts aim at: the circuit alone\'s own targets\n    (circuit_targets), which the op-amp brings onto the stage\'s."""'
						: '    """What the figures of a stage\'s parts aim at: its target, or for an MFB band-pass built for\n    the op-amp, the circuit alone\'s own targets (circuit_targets), which the op-amp brings\n    onto the target."""',
					onlyMfb ? '    t = circuit_targets(st, p["C2"] / p["C1"])' : '    t = circuit_targets(st, p["C2"] / p["C1"]) if st["circuit"] == "mfb_bandpass" else None',
					'    return st if t is None else {"f0": t[0] / (2 * math.pi), "q": t[1], "gain": t[2]}'
				].join('\n')
			);
		}
		const loads = alertWords(ctx.shown).loads;
		const unused = names.one && (!ctx.opamp || onlyMfb);
		lines.push(
			'print("  the page\'s parts:")',
			...(loads ? [pyPrints(`(the page's alerts on the loads: ${loads}; the file does not compute loads)`, '', '    ')] : []),
			`for i, (${unused ? '_' : 'circuit'}, p) in enumerate(${stagesOf}):`,
			// (the parts on the line that prints them where it fits)
			...(file.has('say') || `    print(f"    stage {i + 1}, ${label}:", ", ".join(f"{name} {value(name, v)}" for name, v in p.items()))`.length > PY_WIDTH
				? ['    values = [f"{name} {value(name, v)}" for name, v in p.items()]', printList(file, `f"    stage {i + 1}, ${label}:"`, 'values', '    ')]
				: [`    print(f"    stage {i + 1}, ${label}:", ", ".join(f"{name} {value(name, v)}" for name, v in p.items()))`]),
			noted(`if ${same}:`, "whether the settings still give the page's stages", '    '),
			`        got = ${figures}(p, rs if ${sourceAt} else 0.0)`,
			...(ctx.opamp ? ['        want = aim(stages[i], p)'] : []),
			...(ctx.opamp && !onlyMfb ? ['        aimed = "the circuit alone, against its own targets" if circuit == "mfb_bandpass" else ""'] : []),
			printList(
				file,
				ctx.opamp ? (onlyMfb ? '"      the circuit alone, against its own targets:"' : 'f"      {aimed or \'against the target\'}:"') : '"      against the target:"',
				`figures_list(got, ${want})`,
				'        '
			),
			...(opts.pageStages?.summer ? ['values = [f"{name} {value(name, v)}" for name, v in page_parts[-1][1].items()]', printList(file, '"    summing amplifier:"', 'values')] : [])
		);
	}
	// (the table: one column for each set checked, a row for the passband, each stopband stretch and the
	// margin; `sets` is the plot's too)
	const rows = [...(opts.rows ?? ['f"passband, <= {amax:g} dB"', 'f"stopband, >= {amin:g} dB"']), '"margin"'];
	const loop = `for j, row in enumerate([${rows.join(', ')}]):`;
	lines.push(
		...(page
			? ['sets = [("the file\'s parts", own_parts, own_check), ("the page\'s parts", page_parts, page_check)]', 'sets = [(name, part_set, c) for name, part_set, c in sets if c is not None]']
			: ['sets = [("the file\'s parts", own_parts, own_check)]  # (the page shows no set to check)']),
		...(opts.limits ? [opts.limits] : []),
		// (columns of 26 characters: a cell runs to 24, "+0.012 dB, meets (slack)", and keeps two spaces from the last)
		'print(" " * 30 + "".join(f"{name:>26}" for name, _, _ in sets))',
		...(loop.length <= PY_WIDTH ? [loop] : ['rows = [', ...rows.map((r) => `${IND}${r},`), ']', 'for j, row in enumerate(rows):']),
		'    print(f"  {row:28}" + "".join(f"{c[\'cells\'][j]:>26}" for _, _, c in sets))'
	);
	file.add(lines.join('\n'));
}
