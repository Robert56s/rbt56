// Checks for filter-design.py, the filter page's Python download
// (src/lib/filter/python/index.js generateFilterPython), run through the
// harness scripts/lib-python.mjs on the designs of every family of
// scripts/python-checks/ (index.mjs: each family's designs, its rule in
// JavaScript and the library's stage of its parts). Every design, whatever
// its layout (a low-pass or a high-pass, a band filter, a narrow band-pass),
// goes through the same checks:
//   (a) the text: ASCII, parses for Python 3.8 (ast.parse with
//       feature_version=(3, 8)), uses no library API newer than 3.8, imports
//       nothing past math, cmath, itertools and the plot's matplotlib,
//       defines no function twice; its lines hold 100 characters, no tab, no
//       trailing space, and the word rules (no you/your, no course words, no
//       placeholders); the default low-pass file's length within its target
//   (b) the run: python -W error on a strict cp1252 console, matplotlib
//       hidden (and on the Agg backend where the design asks for the plot),
//       to its end; where the page leaves a stage unbuilt, to its end with
//       no page parts, or to that stage's stop with the reason; its printout
//       in lines of at most 92 characters, the table's cells apart
//   (c) the results, read through runpy: the order (each side's for two
//       sides) and the stage targets (f0, Q, the gain, the zero; a narrow
//       band's figures of its spec) equal the page's ideal design to a
//       relative 1e-9; its SETTINGS the page's (the placement, the source,
//       the op-amp's gain-bandwidth exactly where the page builds the stages
//       for one, the stock)
//   (g) the guards: editing a setting its written-in numbers depend on stops
//       it with its message
//   (d) its page parts: the parts the page shows, value for value, each
//       stage on the circuit of its topology (a band-stop's summing
//       amplifier last), the set named above them (the best, a design of the
//       "Next design" list, the set past the limits), each resistor the page
//       builds of two in series written as the stock's own two parts, no
//       other, and no more pairs than the page's limit
//   (e) their check equals the page's measure: the margin within 1e-6 dB
//       (the spec asks 0.01; a family whose H(s) are not the page's figures
//       to rounding would say strict: false), the same verdict, the worst
//       passband and the least stopband points within one step of the
//       page's grid; a narrow band's peak, gain, -3 dB edges, B, Q and fit
//   (f) its own parts: those the rule gives (the family's rule in
//       JavaScript, rule.mjs, or narrow.mjs's), every value from the stock or
//       typed (the E6 series where a circuit's rule takes it, the file saying
//       so), each stage's response the nodal solution of its netlist, and
//       their check equal to the library's measure of the same parts built
//       as the library's stages (measureFilter, as in (e))
// Then: controls (a file of other settings than the page's is told apart
// from it), each circuit's H(s) and input admittance alone against its
// netlist, the spec's matrix covered by the designs run (every type,
// method, response, topology, stock, placement, source, typed capacitors,
// pairs and a pair limit, the design list's first, second and last, the
// parts past the limits, every narrow circuit, the op-amp menu, the
// guards), and a summary by family.
//
// Run with: npm run check:python (Python 3.8 or newer as `python`);
// CHECK_PYTHON_SWEEP=band,narrow,notch (or all) runs those families' sweeps
// too.

import { spawnSync } from 'node:child_process';
import { responseAt } from '../src/lib/filter/bode.js';
import { LAB_KIT, SERIES, seriesPair } from '../src/lib/filter/eseries.js';
import { nodalResponse } from '../src/lib/filter/nodal.js';
import { filterTemplate, measureFilter } from '../src/lib/filter/partSearch.js';
import { shortValue } from '../src/lib/filter/python/emit.js';
import { generateFilterPython, pythonRegistry } from '../src/lib/filter/python/index.js';
import { stageElements } from '../src/lib/filter/stageElements.js';
import { OPAMP_GBW } from '../src/lib/spice/opamps.js';
import { pageParts, pageSettings } from './lib-parts.mjs';
import { cleanup, editSetting, inspect, readResults, runFile } from './lib-python.mjs';
import { mfbBandPass } from './python-checks/band.mjs';
import { FAMILIES } from './python-checks/index.mjs';
import { NARROW_PY, narrowLibStage, narrowMeasure, narrowOwnParts, narrowPage } from './python-checks/narrow.mjs';
import { E6_CAPACITORS, responseChecks } from './python-checks/notch.mjs';
import { ownParts } from './python-checks/rule.mjs';
import { bandChecks } from './python-checks/sallenKeyTowThomas.mjs';

let fails = 0;
let passes = 0;
const check = (label, ok, detail) => {
	if (ok) passes++;
	else {
		fails++;
		console.log(`FAIL ${label}${detail ? `  (${detail})` : ''}`);
	}
	return ok;
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

{
	const v = spawnSync('python', ['--version'], { encoding: 'utf8' });
	if (v.error || v.status !== 0) {
		console.log('check:python needs Python 3.8 or newer on PATH as `python`.');
		process.exit(1);
	}
	console.log(`${v.stdout.trim()}`);
}

/* ------------------------------------------------------------- (a) the text */

const YOU = /\b(you|your|yours|yourself)\b/i;
const PLACEHOLDER = /\bundefined\b|\bNaN\b|\bnull\b|\bInfinity\b|\[object/;
const COURSE = /\b(course|courses|cours|school|professors?|prof|slides?|diapos?|labs?|lectures?|ELE\s?2003|polytechnique|experiments?|moodle|homework|assignments?|teachers?|instructors?)\b/i;
const IMPORTS = new Set(['math', 'cmath', 'itertools', 'matplotlib.pyplot']);

/** Where the text of a file breaks a rule of (a), [] when it keeps them all. */
function textProblems(code) {
	const out = [];
	code.split('\n').forEach((line, i) => {
		if (line.length > 100) out.push(`line ${i + 1} has ${line.length} characters`);
		if (/\t/.test(line)) out.push(`line ${i + 1} has a tab`);
		if (/\s$/.test(line)) out.push(`line ${i + 1} ends in a space`);
	});
	// (the stock named "Lab kit" may be named, and the lab kit's resistors)
	const prose = code.replace(/\blab kit\b|\blab resistors\b/gi, '');
	for (const [name, re] of [['you/your', YOU], ['a placeholder', PLACEHOLDER], ['a course word', COURSE]]) {
		const m = re.exec(prose);
		if (m) out.push(`${name}: "${prose.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')}"`);
	}
	return out;
}

/* -------------------------------------------------- the page and the stock */

/** The method of a design in words: 'low-pass', 'cascade band-pass', 'transformed band-stop', 'narrow band-pass'... */
function methodOf(design, narrow = false) {
	if (narrow) return 'narrow band-pass';
	if (design.method === 'cascade') return 'cascade band-pass';
	if (design.method === 'parallel') return 'band-stop of two branches';
	if (design.method === 'transformed') return `transformed ${design.filterType === 'bandpass' ? 'band-pass' : 'band-stop'}`;
	return design.filterType === 'highpass' ? 'high-pass' : 'low-pass';
}

/**
 * What the page shows for a design's arguments: { args, design, result,
 * layout ('filter' for a low-pass or a high-pass, 'band', 'narrow'),
 * chosen (a narrow band-pass's circuit) }. result is the set of parts shown
 * (lib-parts.mjs pageParts: the best, design args.designIndex of the "Next
 * design" list, 'last' read as its last, or the set past the limits; a
 * narrow band's chain, narrow.mjs narrowPage, null where the page builds
 * none and so offers no file).
 */
function pageOf(raw) {
	if (raw.filterType === 'narrowband') {
		const { design, chosen, result } = narrowPage(raw);
		return { args: { ...raw, circuit: chosen }, design, result, chosen, layout: 'narrow' };
	}
	let args = raw;
	if (args.designIndex === 'last') args = { ...args, designIndex: pageParts({ ...args, designIndex: 0 }).found.designs.count() - 1 };
	const { design, result } = pageParts(args);
	return { args, design, result, layout: ['cascade', 'parallel', 'transformed'].includes(design.method) ? 'band' : 'filter' };
}

/** The stock the page's stock picker gives: a series over 1 ohm to 9.1 Mohm (9.76), E6 from 1 pF to 6.8 uF, or the lists. */
function stockOf(args) {
	const decade = (series, from, to) => {
		const out = [];
		for (let d = from; d <= to; d++) for (const m of series) out.push(m * 10 ** d);
		return out;
	};
	const r = args.resistorStock ?? 'E24';
	const pairs = Array.isArray(r) && Boolean(args.resistorPairs);
	return {
		resistors: Array.isArray(r) ? r : decade(SERIES[r === 'E96' ? 'E96' : 'E24'], 0, 6),
		capacitors: Array.isArray(args.capacitorStock) ? args.capacitorStock : decade(SERIES.E6, -12, -6),
		pairs,
		pairLimit: pairs && Number.isInteger(args.resistorPairLimit) ? args.resistorPairLimit : null
	};
}

/** The stock's name, as the page's stock picker has it. */
function stockName(args) {
	const r = args.resistorStock ?? 'E24';
	const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
	if (!Array.isArray(r)) return r === 'E96' ? 'E96' : 'E24';
	if (!same(r, LAB_KIT.resistors)) return 'a list on hand';
	if (!Array.isArray(args.capacitorStock)) return 'lab resistors';
	return same(args.capacitorStock, LAB_KIT.capacitors) ? 'lab kit' : 'a list on hand';
}

/** The capacitors typed on the page, by stage number (1 the first), each as the file writes it (shortValue: 4.7e-9 for the page's 4.700000000000001e-9). */
const typedOf = (args) => Object.fromEntries(Object.entries(args.capOverrides ?? {}).map(([i, caps]) => [Number(i) + 1, Object.fromEntries(Object.entries(caps ?? {}).map(([name, c]) => [name, shortValue(c)]))]));
const sourceOf = (args) => (args.sourceR > 0 ? args.sourceR : 0);
const gbwGiven = (args) => (Number.isFinite(args.opampGbw) && args.opampGbw > 0 ? args.opampGbw : null);

/** The op-amp a transformed band-pass's MFB band-pass stages are built for, as the page's menus take it (lib-parts.mjs pageMenus): Hz, or null. */
const gbwOf = (args, design) => (design.method === 'transformed' && design.filterType === 'bandpass' && (args.topologyBand ?? 'mfb') === 'mfb' ? gbwGiven(args) : null);

/* ------------------------------------------------------------ the comparisons */

/** The file's stage targets against the page's ideal design's, [] when they agree to 1e-9. */
function targetProblems(stages, design) {
	if (!Array.isArray(stages)) return ['no stages'];
	if (stages.length !== design.stages.length) return [`${stages.length} stages against ${design.stages.length}`];
	const out = [];
	design.stages.forEach((d, i) => {
		const s = stages[i];
		const pairs = d.order === 1 ? [['f0 (1 / 2 pi tau)', s.f0, 1 / (2 * Math.PI * d.tau)]] : [['f0', s.f0, d.wn / (2 * Math.PI)], ['Q', s.q, d.q]];
		if (Number.isFinite(d.wz)) pairs.push(['fz', s.fz, d.wz / (2 * Math.PI)]);
		if (Number.isFinite(d.gain)) pairs.push(['gain', s.gain, d.gain]);
		for (const [name, got, want] of pairs) if (!(Number.isFinite(got) && near(got, want))) out.push(`stage ${i + 1} ${name} ${got} against ${want}`);
	});
	return out;
}

/** The largest relative miss of the file's stage targets on the page's, for the summary. */
function targetMiss(stages, design) {
	return Math.max(
		0,
		...design.stages.flatMap((d, i) => {
			const s = stages?.[i];
			if (!s) return [Infinity];
			const pairs = d.order === 1 ? [[s.f0, 1 / (2 * Math.PI * d.tau)]] : [[s.f0, d.wn / (2 * Math.PI)], [s.q, d.q]];
			if (Number.isFinite(d.wz)) pairs.push([s.fz, d.wz / (2 * Math.PI)]);
			if (Number.isFinite(d.gain)) pairs.push([s.gain, d.gain]);
			return pairs.map(([got, want]) => Math.abs(got / want - 1));
		})
	);
}

/** The page's parts as the file has them, [[circuit, parts]]: the stages, a band-stop's summing amplifier last. */
function pagePartsOf(result, parallel) {
	const stages = result.stages.map((s) => {
		const { family, circuit } = pythonRegistry.circuitOf(s.topology);
		return [circuit, Object.fromEntries(family.pageParts ? family.pageParts(s) : Object.entries(s.components))];
	});
	const combiner = parallel ? result.measure?.combiner?.parts.resistors : null;
	return combiner ? [...stages, ['summer', combiner]] : stages;
}

/**
 * Two part sets [[circuit, parts]], [] when they hold the same values on the
 * same circuits: exactly, or within `tol` (the page's parts, which the file
 * writes as a reader does, 4.7e-9 for the page's 4.700000000000001e-9:
 * python/emit.js shortValue, within 1e-12).
 */
function partsProblems(got, want, what, tol = 0) {
	if (!Array.isArray(got) || got.length !== want.length) return [`${what}: ${got?.length} stages against ${want.length}`];
	const out = [];
	const same = (a, b) => (tol ? Math.abs(a - b) <= tol * Math.abs(b) : a === b);
	want.forEach(([circuit, parts], i) => {
		const [gc, gp] = got[i];
		if (gc !== circuit) out.push(`${what} stage ${i + 1}: ${gc} against ${circuit}`);
		const names = Object.keys(parts);
		if (JSON.stringify(Object.keys(gp)) !== JSON.stringify(names)) out.push(`${what} stage ${i + 1}: parts ${Object.keys(gp)} against ${names}`);
		for (const name of names) if (!same(gp[name], parts[name])) out.push(`${what} stage ${i + 1} ${name} = ${gp[name]} against ${parts[name]}`);
	});
	return out;
}

/** The tolerance of the page's parts as the file writes them (shortValue's). */
const PAGE_TOL = 1e-12;

/** One step of the page's grid at f, as a log ratio: the template's stretch holding f, 400 steps a passband stretch, 800 a stopband one. */
function gridStep(template, f, band) {
	const stretches = band === 'pass' ? template.pass : template.stop;
	const r = stretches.find((x) => f >= x.from * (1 - 1e-12) && f <= x.to * (1 + 1e-12)) ?? stretches[0];
	return Math.log(r.to / r.from) / (band === 'pass' ? 400 : 800);
}

/**
 * A file's check of a part set against a measure of the library's (the
 * page's, or measureFilter's of the same parts), [] when they agree: the
 * margin within `tol` dB, the same verdict, the worst passband and the
 * least stopband points within one step of the page's grid.
 */
function measureProblems(c, m, template, what, tol) {
	if (!c) return [`${what}: no check`];
	const out = [];
	const sameStep = (a, b, band) => Math.abs(Math.log(a / b)) <= gridStep(template, b, band) * 1.001;
	if (!(Math.abs(c.margin - m.margin) <= tol)) out.push(`${what} margin ${c.margin} against ${m.margin}`);
	if (c.meets !== m.meets) out.push(`${what} verdict ${c.meets} against ${m.meets}`);
	if (!sameStep(c.pass.f, m.pass.freq, 'pass')) out.push(`${what} worst passband point ${c.pass.f} Hz against ${m.pass.freq}`);
	if (!sameStep(c.stop.f, m.stop.freq, 'stop')) out.push(`${what} least stopband point ${c.stop.f} Hz against ${m.stop.freq}`);
	return out;
}

// (a narrow band's peak, Q near 1, is found only to about the square root of the double's precision, by
// the page as by the file: its frequency, and Q = f_peak / B with it, to 1e-6)
const NARROW_TOL = { f0: 1e-6, q: 1e-6, gain: 1e-8, f1: 1e-8, f2: 1e-8, B: 1e-8 };

/** A narrow band's check of a part set against a measure (narrowMeasure's, or the page's), [] when they agree. */
function narrowProblems(c, m, what) {
	if (!c) return [`${what}: no check`];
	const rel = (a, b, tol) => (a === null || b === null ? a === b : Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b)));
	const out = [];
	for (const [key, tol] of Object.entries(NARROW_TOL)) if (!rel(c[key], m.figures[key], tol)) out.push(`${what} ${key} ${c[key]} against ${m.figures[key]}`);
	if (!(c.fit === null ? !Number.isFinite(m.fit) : Math.abs(c.fit - m.fit) <= 1e-6)) out.push(`${what} fit ${c.fit} against ${m.fit}`);
	if (c.meets !== m.within) out.push(`${what} verdict ${c.meets} against ${m.within}`);
	return out;
}

/** Each library stage's response against the nodal solution of its netlist at freqs(i), [] when they agree to 1e-9 (the MFB band-pass stages with the op-amp of gbw). */
function nodalProblems(lib, freqs, gbw) {
	return lib.flatMap((stage, i) =>
		freqs(i).flatMap((f) => {
			const a = responseAt([stage], f);
			const b = nodalResponse(stageElements(stage, 0, 'vin', 'vout'), f, stage.topology === 'mfbBp' && gbw !== null ? { gbw } : {});
			return Math.hypot(a.re - b.re, a.im - b.im) <= 1e-9 * Math.hypot(b.re, b.im) ? [] : [`stage ${i + 1} at ${f.toFixed(0)} Hz`];
		})
	);
}

/** The comment lines above `name = [` in a file, joined. */
function commentAbove(code, name) {
	const lines = code.split('\n');
	let at = lines.indexOf(`${name} = [`);
	const words = [];
	while (at > 0 && lines[at - 1].startsWith('# ')) words.unshift(lines[--at].slice(2));
	return words.join(' ');
}

/** The comment above page_parts names the set the page shows, [] when it does. */
function shownProblems(code, result) {
	const said = commentAbove(code, 'page_parts');
	const want = result.pastLimits ? 'the set past the limits on the parts' : result.withinLimits === false ? 'no set within them could be built' : result.designIndex > 0 ? `design ${result.designIndex + 1} of its "Next design" list` : 'the best set it found';
	return said.includes(want) ? [] : [`"${said}" against "${want}"`];
}

/**
 * The pairs of resistors in the file's page parts, written "a + b", against
 * the page's: with pairs on, each resistor the page builds of two in
 * series (its value off the stock, the sum of two of it: seriesPair; none
 * on a stage the page builds from the full E24 and E6 grids, stockShortfall,
 * whose tables show single parts) written as the stock's own two parts and
 * named in the comment above its stage, no other written so, and no more
 * of them than the pair limit. `stages` the page's stages (the summing
 * amplifier has none). [] when they agree.
 */
function pairProblems(code, pageSet, stages, stock) {
	const from = code.indexOf('\npage_parts = [\n');
	if (from < 0) return ['no page_parts list'];
	const block = code.slice(from + '\npage_parts = [\n'.length, code.indexOf('\n]\n', from));
	const entries = [];
	let said = null;
	for (const line of block.split('\n')) {
		const c = /^ {4}# stage (\d+): (.*) (?:is|are each) two resistors in series$/.exec(line);
		if (c) said = c[2].split(/, | and /);
		else if (/^ {4}\("/.test(line)) {
			entries.push({ said: said ?? [], text: line });
			said = null;
		} else if (entries.length) entries[entries.length - 1].text += `\n${line}`;
	}
	if (entries.length !== pageSet.length) return [`${entries.length} stages written against ${pageSet.length}`];
	const out = [];
	let count = 0;
	pageSet.forEach(([, parts], i) => {
		const written = Object.fromEntries([...entries[i].text.matchAll(/"(\w+)": ([\d.e+-]+) \+ ([\d.e+-]+)/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]));
		const want = {};
		if (stock.pairs && !stages[i]?.stockShortfall) {
			for (const [name, v] of Object.entries(parts)) {
				const pair = /^[Rr]/.test(name) ? seriesPair(v, stock.resistors) : null;
				if (pair) want[name] = pair;
			}
		}
		count += Object.keys(written).length;
		// (the two parts as the file writes them, within shortValue's 1e-12)
		const agree = JSON.stringify(Object.keys(written)) === JSON.stringify(Object.keys(want)) && Object.keys(want).every((name) => want[name].every((v, k) => Math.abs(written[name][k] - v) <= PAGE_TOL * v));
		if (!agree) out.push(`stage ${i + 1}: ${JSON.stringify(written)} written against ${JSON.stringify(want)}`);
		if (entries[i].said.join() !== Object.keys(want).join()) out.push(`stage ${i + 1}: the comment names ${entries[i].said.join(', ') || 'none'} against ${Object.keys(want).join(', ') || 'none'}`);
	});
	if (stock.pairLimit !== null && count > stock.pairLimit) out.push(`${count} pairs written, the limit ${stock.pairLimit}`);
	return out;
}

/** The SETTINGS a check reads (readResults' extra names). */
const SETTINGS = ['placement', 'rs', 'gbw', 'resistors', 'capacitors'];

/**
 * The file's SETTINGS against the page's, [] when they agree: the placement
 * and the source (a low-pass, a high-pass, a band filter), the op-amp's
 * gain-bandwidth, written exactly where the page builds MFB band-pass
 * stages for one, and the stock, value for value.
 */
function settingProblems(r, { args, design, layout, chosen }) {
	const out = [];
	if (layout !== 'narrow') {
		const placement = args.placement === 'centred' ? 'centred' : 'edge';
		if (r.placement !== placement) out.push(`placement ${r.placement} against ${placement}`);
		if (r.rs !== sourceOf(args)) out.push(`rs ${r.rs} against ${sourceOf(args)}`);
	}
	const usesMfbBp = Array.isArray(r.stages) && r.stages.some((s) => s.circuit === 'mfb_bandpass');
	const gbw = layout === 'narrow' ? (NARROW_PY[chosen] === 'mfb_bandpass' ? gbwGiven(args) : null) : usesMfbBp ? gbwOf(args, design) : null;
	if ((r.gbw ?? null) !== gbw) out.push(`gbw ${r.gbw} against ${gbw}`);
	const stock = stockOf(args);
	for (const key of ['resistors', 'capacitors']) if (JSON.stringify(r[key]) !== JSON.stringify(stock[key])) out.push(`${key} not the page's (${r[key]?.length} values against ${stock[key].length})`);
	return out;
}

/* ------------------------------------------------------------- one design */

// (the stop of a file at the stage the page leaves unbuilt, by layout)
const UNBUILT_STOP = { filter: /^A Boctor (low|high)-pass notch needs its zero/m, band: /no capacitor of the stock builds it|needs its zero/ };
const circuits = Object.assign({}, ...FAMILIES.map((f) => f.circuits));
let defaultLines = null;

/** The summary of each family (and of each band method in it): designs, the largest differences, the meets. */
const summaries = new Map();
const summaryOf = (key) => summaries.get(key) ?? summaries.set(key, { designs: 0, templates: 0, unbuilt: 0, stopped: 0, skipped: 0, targets: 0, page: 0, own: 0, tally: { designs: 0, own: 0, page: 0 }, narrow: false }).get(key);

/** What the designs run cover, by dimension (the matrix check at the end). */
const covered = new Map();
const cover = (dimension, value) => (covered.get(dimension) ?? covered.set(dimension, new Set()).get(dimension)).add(value);

/** Every check of one design, [label, args, opts] of a family (python-checks/index.mjs says what opts holds). */
function checkDesign(family, [label, raw, opts = {}]) {
	const name = `${family.name}: ${label}`;
	const page = pageOf(raw);
	const { args, design, result, layout } = page;
	const summary = summaryOf(family.name);
	const narrow = layout === 'narrow';
	if (narrow && !result) {
		summary.skipped++;
		return;
	}
	let code;
	try {
		code = generateFilterPython({ args, design, shown: result });
	} catch (e) {
		check(`${name}: the generator writes the file`, false, e.message);
		return;
	}
	const parallel = design.method === 'parallel';
	const unbuilt = !narrow && !result.stages.every(Boolean);
	const method = methodOf(design, narrow);
	const tol = family.strict ? 1e-6 : 0.01;
	const template = narrow ? null : filterTemplate(design);
	if (opts.unbuilt) check(`${name}: the page leaves a stage unbuilt`, unbuilt);
	summary.designs++;
	if (!narrow) summary.templates++;
	if (unbuilt) summary.unbuilt++;

	// (a) the text
	const shape = inspect(code);
	check(`${name}: ASCII`, shape.ascii);
	check(`${name}: parses for Python 3.8`, shape.parse38 === null, shape.parse38);
	check(`${name}: no library API newer than 3.8`, shape.newer.length === 0, shape.newer.join(', '));
	check(`${name}: imports the standard library only`, shape.imports.every((m) => IMPORTS.has(m)), shape.imports.join(', '));
	check(`${name}: no function defined twice`, shape.twice.length === 0, shape.twice.join(', '));
	const text = textProblems(code);
	check(`${name}: lines and words`, text.length === 0, text.slice(0, 3).join('; '));
	if (opts.lines) {
		const n = code.split('\n').length - 1;
		defaultLines = n;
		check(`${name}: ${n} lines, ${opts.lines[0]} to ${opts.lines[1]}`, n >= opts.lines[0] && n <= opts.lines[1]);
	}

	// (b) the run
	const run = runFile(code);
	const ran = run.status === 0 && run.stderr === '';
	const stopped = unbuilt && run.status === 1 && UNBUILT_STOP[layout].test(run.stderr);
	if (unbuilt) check(`${name}: runs, or stops at the stage the page leaves unbuilt with the reason`, ran || stopped, `status ${run.status}: ${run.stderr.slice(-300)}`);
	else check(`${name}: runs with python -W error`, ran, run.stderr.slice(-600));
	// (the printout reads on a console: lines of at most 92 characters, as say() wraps them, and the
	// table's cells apart, a verdict never run into the next column's number)
	const printout = run.stdout.split(/\r?\n/);
	const wide = printout.filter((l) => l.length > 92);
	const joined = printout.filter((l) => /(meets|misses|\(slack\))[-+\d]/.test(l));
	check(`${name}: printout lines of 92 characters or less, the table's cells apart`, wide.length === 0 && joined.length === 0, [...wide, ...joined][0]);
	if (opts.plot) {
		const plot = runFile(code, { matplotlib: true });
		check(`${name}: runs with matplotlib`, plot.status === 0 && plot.stderr === '', plot.stderr.slice(-600));
	}

	// (c) the results: the order, the targets, the settings
	const read = readResults(code, SETTINGS);
	const r = read.results;
	if (!stopped) check(`${name}: every result read`, read.stop === null && read.missing.length === 0, read.stop ?? read.missing.join(', '));
	if (design.method === 'cascade' || parallel) check(`${name}: orders ${r.n_hp} and ${r.n_lp} against ${design.hp.n} and ${design.lp.n}`, r.n_hp === design.hp.n && r.n_lp === design.lp.n);
	else if (!narrow) check(`${name}: order ${r.n} against ${design.n}`, r.n === design.n);
	const targets = targetProblems(r.stages, design);
	if (narrow) {
		const circuit = NARROW_PY[page.chosen];
		check(`${name}: ${design.n} stage targets`, targets.length === 0 && r.stages.every((s) => s.circuit === circuit), targets.slice(0, 3).join('; '));
		const spec = [['f1', r.f1, design.f1], ['f2', r.f2, design.f2], ['stage_q', r.stage_q, design.stageQ], ['stage_gain', r.stage_gain, design.stageGain], args.narrowBy === 'b' ? ['q', r.q, design.q] : ['bandwidth', r.bandwidth, design.B]];
		const off = spec.filter(([, got, want]) => !(Number.isFinite(got) && near(got, want)));
		check(`${name}: the spec's figures`, off.length === 0, off.map(([k, got, want]) => `${k} ${got} against ${want}`).join('; '));
	} else check(`${name}: stage targets`, targets.length === 0, targets.slice(0, 3).join('; '));
	summary.targets = Math.max(summary.targets, targetMiss(r.stages, design));
	const settings = settingProblems(r, page);
	check(`${name}: its settings the page's (placement, source, op-amp, stock)`, settings.length === 0, settings.join('; '));

	// (g) the guards: the edited file stops with its message, or runs on (and says what `more` asks, or
	// checks the page's parts as before: an edit that leaves the template as it was)
	for (const [setting, value, message, more = {}] of opts.guards ?? []) {
		let edited;
		try {
			edited = readResults(editSetting(code, setting, value));
		} catch (e) {
			check(`${name}: ${setting} = ${value}`, false, e.message);
			continue;
		}
		if (message) check(`${name}: ${setting} = ${value} stops it`, edited.stop !== null && message.test(edited.stop), edited.stop ?? 'it ran on');
		else check(`${name}: ${setting} = ${value} still runs`, edited.stop === null, edited.stop);
		if (more.says) check(`${name}: ${setting} = ${value} says ${more.says}`, more.says.test(edited.stdout ?? ''), (edited.stdout ?? '').slice(-300));
		if (more.samePage) {
			const a = edited.results.page_check;
			const b = r.page_check;
			check(`${name}: ${setting} = ${value} checks the page's parts as before`, Boolean(a && b) && Math.abs(a.margin - b.margin) <= 1e-9 && a.meets === b.meets, `${a?.margin} against ${b?.margin}`);
		}
	}
	record(page, raw, r, opts, method);
	if (stopped) {
		summary.stopped++;
		return;
	}
	// (a file that failed, or left a result unset, has nothing more to compare: "every result read" said so)
	if (read.stop !== null || read.missing.length) return;

	// (d) the page's parts, (e) their check
	if (unbuilt) check(`${name}: no page parts to check`, r.page_parts === null && r.page_check === null);
	else {
		const pageSet = narrow ? result.stages.map((s) => [NARROW_PY[s.topology], { ...s.components }]) : pagePartsOf(result, parallel);
		const pp = partsProblems(r.page_parts, pageSet, 'page parts', PAGE_TOL);
		check(`${name}: page parts`, pp.length === 0, pp.slice(0, 3).join('; '));
		const pairs = pairProblems(code, pageSet, result.stages, stockOf(args));
		check(`${name}: page parts' pairs written as the stock's two parts, within the limit`, pairs.length === 0, pairs.slice(0, 2).join('; '));
		if (!narrow) {
			const shown = shownProblems(code, result);
			check(`${name}: page parts named as the set the page shows`, shown.length === 0, shown.join('; '));
		}
		const pm = narrow ? narrowProblems(r.page_check, result, "the page's parts") : measureProblems(r.page_check, result.measure, template, "the page's parts", tol);
		check(`${name}: page parts' check against the page's measure${narrow ? '' : ` (${tol} dB)`}`, pm.length === 0, pm.join('; '));
		if (!narrow && r.page_check) summary.page = Math.max(summary.page, Math.abs(r.page_check.margin - result.measure.margin));
	}
	if (opts.expect) {
		const [what, problemsOf] = opts.expect;
		const problems = problemsOf(r, run.stdout);
		check(`${name}: ${what}`, problems.length === 0, problems.join('; '));
	}

	// (f) the file's own parts
	const own = narrow ? ownNarrow(name, page, r) : ownTemplate(name, page, r, opts, tol, run.stdout);
	if (!own || unbuilt) return;
	if (!narrow) summary.own = Math.max(summary.own, own.margin);
	// (the meets by family, a band method's apart too, and a narrow band-pass's apart in a family of others)
	const keys = layout === 'band' ? [family.name, `${family.name}, ${method}`] : narrow && family.key !== 'narrow' ? [`${family.name}, ${method}`] : [family.name];
	for (const key of keys) {
		const s = summaryOf(key);
		s.narrow = narrow;
		s.tally.designs++;
		s.tally.own += r.own_check.meets ? 1 : 0;
		s.tally.page += (narrow ? result.within : result.measure.meets) ? 1 : 0;
	}
}

/**
 * (f) for a template's design: the rule in JavaScript, the stock (the E6
 * series on a stage whose rule takes it, the file saying so), the netlists,
 * the library's measure. Returns { margin } (its difference), or null.
 */
function ownTemplate(name, { args, design }, r, opts, tol, stdout) {
	const parallel = design.method === 'parallel';
	const stock = stockOf(args);
	const rs = sourceOf(args);
	const gbw = gbwOf(args, design);
	const circs = { ...circuits, mfb_bandpass: mfbBandPass(gbw) };
	const typed = typedOf(args);
	let rule;
	if (parallel) {
		// (each branch on its own, its first stage on the source; a typed capacitor by its number in the branch)
		const n = r.lp_count;
		const shift = (from, to) => Object.fromEntries(Object.entries(typed).flatMap(([k, caps]) => (Number(k) > from && Number(k) <= to ? [[Number(k) - from, caps]] : [])));
		rule = [...ownParts(r.stages.slice(0, n), { circuits: circs, rs, typed: shift(0, n), stock }), ...ownParts(r.stages.slice(n), { circuits: circs, rs, typed: shift(n, r.stages.length), stock })];
	} else rule = ownParts(r.stages, { circuits: circs, rs, typed, stock });
	// (a stage no choice of the stock builds: the file proposes no parts of its own and checks the page's alone)
	const noChoice = rule.filter((x) => typeof x === 'string' && / no choice$/.test(x));
	const ruleProblems = rule.flatMap((x) => (typeof x === 'string' && !/ no choice$/.test(x) ? [x] : []));
	if (!check(`${name}: the rule in JavaScript runs`, ruleProblems.length === 0, ruleProblems.join('; '))) return null;
	if (noChoice.length || r.own_parts === null) {
		cover('soft', `${parallel ? 'band-stop of two branches' : design.method ?? design.filterType}: no parts of its own`);
		check(
			`${name}: a stage no choice of the stock builds (${noChoice.join(', ') || 'none, by the rule in JavaScript'}): no parts of its own, the page's checked alone`,
			noChoice.length > 0 && r.own_parts === null && r.own_check === null && Boolean(r.page_check) && /no stock choice builds it; the page's parts are checked alone/.test(stdout),
			`own_parts ${r.own_parts === null ? 'None' : 'written'}`
		);
		return null;
	}
	const stageList = parallel ? r.own_parts.slice(0, -1) : r.own_parts;
	const op = partsProblems(stageList, rule, 'own parts');
	check(`${name}: own parts follow the rule`, op.length === 0, op.slice(0, 3).join('; '));
	const typedValues = new Set(Object.values(typed).flatMap((caps) => Object.values(caps)));
	// (the capacitors each stage's rule draws on: the stock's, or the E6 series where a circuit's rule falls back to it)
	const capsOf = (i) => circs[r.own_parts[i][0]]?.capacitors?.(r.stages[i], stock.capacitors, typed[i + 1] ?? {}) ?? stock.capacitors;
	const e6 = stageList.flatMap((_, i) => (capsOf(i) === E6_CAPACITORS ? [i + 1] : []));
	const said = (stdout.match(/the E6 series from 1 pF to 6\.8 uF is tried/g) ?? []).length;
	check(`${name}: says the E6 series is tried where the rule takes it${e6.length ? ` (stage ${e6.join(', ')})` : ''}`, said === e6.length && (!opts.e6 || opts.e6.join() === e6.join()), `said ${said} times; stages ${e6.join(', ') || 'none'}${opts.e6 ? `, the family's ${opts.e6.join(', ')}` : ''}`);
	const outside = r.own_parts.flatMap(([, p], i) => Object.entries(p).flatMap(([part, v]) => ((/^[Rr]/.test(part) ? stock.resistors : i < stageList.length ? capsOf(i) : stock.capacitors).includes(v) || typedValues.has(v) ? [] : [`stage ${i + 1} ${part} = ${v}`])));
	check(`${name}: own parts from the stock${e6.length ? ` (E6 on stage ${e6.join(', ')})` : ''}`, outside.length === 0, outside.slice(0, 3).join('; '));
	const lib = stageList.map(([c, p], i) => circs[c].stage(p, r.stages[i]));
	const nodal = nodalProblems(lib, (i) => [0.3, 1, 3].map((x) => x * r.stages[i].f0), gbw);
	check(`${name}: own stages' response equals the nodal solution of their netlist`, nodal.length === 0, nodal.join('; '));
	// (the summing amplifier's resistor and stock as the page's search has them)
	const { combinerR, resistorSeries } = pageSettings(args);
	const m = measureFilter(lib, design, { sourceR: sourceOf(args), template: filterTemplate(design), combinerR, resistorSeries });
	if (parallel) {
		const summer = r.own_parts[r.own_parts.length - 1];
		const want = m.combiner.parts.resistors;
		check(`${name}: the file's summing amplifier is the library's for its branches`, summer[0] === 'summer' && JSON.stringify(summer[1]) === JSON.stringify(want), `${JSON.stringify(summer[1])} against ${JSON.stringify(want)}`);
	}
	const om = measureProblems(r.own_check, m, filterTemplate(design), "the file's parts", tol);
	check(`${name}: own parts' check against the library's measure (${tol} dB)`, om.length === 0, om.join('; '));
	return r.own_check ? { margin: Math.abs(r.own_check.margin - m.margin) } : null;
}

/** (f) for a narrow band-pass: its rule in JavaScript (narrow.mjs), the stock, the netlists, the library's measure of a narrow band. */
function ownNarrow(name, { args, design, chosen }, r) {
	const circuit = NARROW_PY[chosen];
	const gbw = circuit === 'mfb_bandpass' ? gbwGiven(args) : null;
	const own = narrowOwnParts(design, args, circuit);
	// (a stage no choice of the stock builds: the file proposes no parts of its own and checks the page's alone)
	if (/^No (capacitor|choice) of the stock builds the stage/.test(own.stop ?? '') || r.own_parts === null) {
		cover('soft', 'narrow band-pass: no parts of its own');
		check(`${name}: a stage no choice of the stock builds (${own.stop ?? 'none, by the rule in JavaScript'}): no parts of its own, the page's checked alone`, Boolean(own.stop) && r.own_parts === null && r.own_check === null && Boolean(r.page_check), `own_parts ${r.own_parts === null ? 'None' : 'written'}`);
		return null;
	}
	if (!check(`${name}: the rule in JavaScript builds the stages`, Boolean(own.parts), own.stop)) return null;
	const op = partsProblems(r.own_parts, own.parts, 'own parts');
	check(`${name}: own parts follow the rule`, op.length === 0, op.slice(0, 3).join('; '));
	const stock = stockOf(args);
	const typedValues = new Set(Object.values(args.capOverrides ?? {}).flatMap((caps) => Object.values(caps).map(shortValue)));
	const outside = r.own_parts.flatMap(([, p], i) => Object.entries(p).flatMap(([part, v]) => ((/^[Rr]/.test(part) ? stock.resistors : stock.capacitors).includes(v) || typedValues.has(v) ? [] : [`stage ${i + 1} ${part} = ${v}`])));
	check(`${name}: own parts from the stock`, outside.length === 0, outside.slice(0, 3).join('; '));
	const lib = r.own_parts.map(([c, p]) => narrowLibStage(c, p, gbw));
	const nodal = nodalProblems(lib, () => [0.5, 1, 2].map((x) => x * design.f0), gbw);
	check(`${name}: own stages' response equals the nodal solution of their netlist`, nodal.length === 0, nodal.join('; '));
	const om = narrowProblems(r.own_check, narrowMeasure(lib, design), "the file's parts");
	check(`${name}: own parts' check against the library's measure`, om.length === 0, om.join('; '));
	return {};
}

/** What one design covers of the spec's matrix (the check at the end). */
function record({ args, design, result, layout, chosen }, raw, r, opts, method) {
	cover('type', method);
	const responses = layout === 'narrow' ? [] : design.method === 'cascade' || design.method === 'parallel' ? [args.responseHp ?? args.response, args.responseLp ?? args.response] : [design.response ?? args.response];
	for (const response of responses) cover('response', `${method}: ${response}`);
	// (two sides, one prototype with zeros and the other without)
	const zeros = (response) => response === 'elliptic' || response === 'inverseChebyshev';
	if (responses.length === 2 && zeros(responses[0]) !== zeros(responses[1])) cover('sides', method);
	for (const s of result?.stages ?? []) if (s) cover('topology', s.topology);
	for (const [c] of r.own_parts ?? []) cover('circuit', c);
	cover('stock', `${layout}: ${stockName(args)}`);
	if (layout !== 'narrow') {
		cover('placement', `${layout}: ${args.placement === 'centred' ? 'centred' : 'edge'}`);
		cover('source', `${layout}: ${sourceOf(args)} ohm`);
		if (design.method === 'parallel') cover('source', `band-stop of two branches: ${sourceOf(args)} ohm`);
		const index = result.designIndex ?? 0;
		if (index < 2) cover('design', `${layout}: design ${index + 1}`);
		if (raw.designIndex === 'last' && index > 1) cover('design', `${layout}: the last design`);
		if (result.pastLimits) cover('past', `${layout}: the parts past the limits`);
		if ([args.order, args.orderHp, args.orderLp, args.orderBand].some((o) => Number.isInteger(o))) cover('order', layout);
	}
	if (Object.values(args.capOverrides ?? {}).some((caps) => Object.keys(caps ?? {}).length)) cover('typed', layout);
	if (Array.isArray(args.resistorStock) && args.resistorPairs) cover('pairs', `${layout}: ${Number.isInteger(args.resistorPairLimit) ? 'a pair limit' : 'pairs'}`);
	if (opts.guards?.length) cover('guards', layout);
	if (layout === 'narrow') {
		cover('narrow', chosen);
		if ((r.own_parts ?? []).some(([c]) => c === 'amplifier') || result.stages.some((s) => s.topology === 'gainNonInv')) cover('narrow', 'the gain stage');
	}
	// (the op-amp menu of the MFB band-pass stages: a transformed band-pass's, a narrow band-pass's)
	const mfbBp = layout === 'narrow' ? NARROW_PY[chosen] === 'mfb_bandpass' : design.method === 'transformed' && design.filterType === 'bandpass' && (args.topologyBand ?? 'mfb') === 'mfb';
	if (mfbBp) {
		const gbw = gbwGiven(args);
		const opamp = gbw === null ? 'ideal' : gbw === OPAMP_GBW.TL082 ? 'TL082' : gbw === OPAMP_GBW.LM741 ? 'LM741' : 'other';
		cover('opamp', `${layout === 'narrow' ? 'narrow band-pass' : 'transformed band-pass'}: ${opamp}`);
	}
}

for (const family of FAMILIES) {
	const sweep = (process.env.CHECK_PYTHON_SWEEP ?? '').split(',').some((k) => k === 'all' || k === family.key);
	for (const c of [...family.cases, ...(sweep ? (family.sweep ?? []) : [])]) checkDesign(family, c);
}

/* ------------------------------------------------------------------ controls */
// The comparisons tell a wrong file apart: a file placed on the passband edge read against the page
// centred, a file without the source against the page with it, and the file of design 2 of the list
// against the page's design 1, each with problems in its page parts or their check.
{
	const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
	const LP = { filterType: 'lowpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, topology: 'mfb', capOverrides: {}, ...KIT };
	const SK = { filterType: 'lowpass', response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 10000, fs: 25000, order: null, topology: 'sallenKey', capOverrides: {}, placement: 'centred' };
	const controls = [
		['a file placed on the passband edge, against the page centred', { ...LP, placement: 'edge' }, { ...LP, placement: 'centred' }],
		['a file without the source, against the page with 600 ohm', { ...SK, sourceR: 0 }, { ...SK, sourceR: 600 }],
		["the file of design 2 of the list, against the page's design 1", { ...LP, resistorPairs: true, designIndex: 1 }, { ...LP, resistorPairs: true, designIndex: 0 }]
	];
	for (const [label, fileArgs, pageArgs] of controls) {
		const file = pageOf(fileArgs);
		const page = pageOf(pageArgs);
		const r = readResults(generateFilterPython({ args: file.args, design: file.design, shown: file.result })).results;
		const own = [...partsProblems(r.page_parts, pagePartsOf(file.result, false), 'page parts', PAGE_TOL), ...measureProblems(r.page_check, file.result.measure, filterTemplate(file.design), "the page's parts", 1e-6)];
		const told = [...partsProblems(r.page_parts, pagePartsOf(page.result, false), 'page parts', PAGE_TOL), ...measureProblems(r.page_check, page.result.measure, filterTemplate(page.design), "the page's parts", 1e-6)];
		check(`controls: ${label}: told apart, while it agrees with its own page`, told.length > 0 && own.length === 0, own[0] ?? told[0] ?? 'no difference found');
	}
}

/* ------------------------------------------------------- the circuits alone */
// Each circuit's Python functions alone, against the nodal solution of its netlist: the Sallen-Key and
// Tow-Thomas stages on the page's parts of band filters built with them (each H(s) behind rs, each input
// admittance, and each design's whole response the file's way against the page's:
// python-checks/sallenKeyTowThomas.mjs bandChecks), and the notch stages (H(s), H(s) behind 600 ohm and
// Y(s): python-checks/notch.mjs responseChecks).
for (const [label, ok, detail] of bandChecks()) check(label, ok, detail);
for (const [label, ok, detail] of responseChecks({ run: runFile, pageParts, circuitOf: pythonRegistry.circuitOf })) check(label, ok, detail);

/* ------------------------------------------------------- the matrix covered */
// The designs every run checks cover the spec's matrix: each filter type and method, each response on
// each of them (and two sides of which one has zeros and the other not, on the cascade and on the two
// branches), each topology on the page's parts and each circuit of the file's own, each stock on each
// layout, both placements and the sources 0 and 50 ohm (600 on a band-stop of two branches), capacitors
// typed, pairs and a pair limit, the "Next design" list's first, second and last, the parts past the
// limits, an order set on the page, the guards, every narrow circuit and the gain stage, and the op-amp
// menu of the MFB band-pass stages.
{
	const TEMPLATES = ['low-pass', 'high-pass', 'cascade band-pass', 'band-stop of two branches', 'transformed band-pass', 'transformed band-stop'];
	const RESPONSES = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];
	const LAYOUTS = ['filter', 'band', 'narrow'];
	const STOCKS = ['E24', 'E96', 'lab kit', 'lab resistors', 'a list on hand'];
	const want = {
		type: [...TEMPLATES, 'narrow band-pass'],
		response: TEMPLATES.flatMap((t) => RESPONSES.map((r) => `${t}: ${r}`)),
		sides: ['cascade band-pass', 'band-stop of two branches'],
		topology: [...new Set(['mfb', 'mfbHp', 'firstOrder', 'firstOrderHp', 'sallenKey', 'sallenKeyHp', 'towThomas', 'towThomasHp', 'towThomasNotch', 'boctor', 'boctorHp', 'mfbBp', 'towThomasBp', ...Object.keys(NARROW_PY)])],
		circuit: [...new Set(['mfb_lowpass', 'mfb_highpass', 'rc_lowpass', 'rc_highpass', 'sallen_key_lowpass', 'sallen_key_highpass', 'tow_thomas_lowpass', 'tow_thomas_highpass', 'tow_thomas_notch', 'boctor_lowpass_notch', 'boctor_highpass_notch', 'mfb_bandpass', 'tow_thomas_bandpass', 'summer', ...Object.values(NARROW_PY)])],
		stock: LAYOUTS.flatMap((l) => STOCKS.map((s) => `${l}: ${s}`)),
		placement: ['filter', 'band'].flatMap((l) => [`${l}: edge`, `${l}: centred`]),
		source: ['filter: 0 ohm', 'filter: 50 ohm', 'band: 0 ohm', 'band: 50 ohm', 'band-stop of two branches: 600 ohm'],
		typed: LAYOUTS,
		pairs: LAYOUTS.flatMap((l) => [`${l}: pairs`, `${l}: a pair limit`]),
		design: ['filter', 'band'].flatMap((l) => [`${l}: design 1`, `${l}: design 2`, `${l}: the last design`]),
		past: ['filter: the parts past the limits', 'band: the parts past the limits'],
		order: LAYOUTS.slice(0, 2),
		guards: LAYOUTS,
		narrow: ['rlcGyrator', 'rlcGic', 'sallenKeyBp', 'mfbBp', 'khnBp', 'towThomasBp', 'the gain stage'],
		opamp: ['transformed band-pass', 'narrow band-pass'].flatMap((l) => ['TL082', 'LM741', 'ideal', 'other'].map((o) => `${l}: ${o}`))
	};
	const counts = [];
	for (const [dimension, values] of Object.entries(want)) {
		const missing = values.filter((v) => !covered.get(dimension)?.has(v));
		check(`the matrix covered: ${dimension} (${values.length - missing.length} of ${values.length})`, missing.length === 0, `missing ${missing.join(', ')}`);
		counts.push(`${dimension} ${values.length - missing.length}/${values.length}`);
	}
	check(`the matrix covered: the default low-pass file's length`, defaultLines !== null);
	console.log(`the matrix covered: ${counts.join(', ')}`);
}

/* ------------------------------------------------------------------ summary */
// (by family: its designs, the largest differences of its checks, and in how many designs the file's own
// parts meet the template, or a narrow band's rule, and the page's; a band method's, and a narrow band's in a
// family of others, apart)
const dB = (x) => x.toExponential(1);
for (const [key, s] of summaries) {
	const t = s.tally;
	const meets = !t.designs ? '' : s.narrow ? `the file's own parts keep the rule's limits in ${t.own} of ${t.designs}, the page's parts in ${t.page}` : `the file's own parts meet the template in ${t.own} of ${t.designs}, the page's parts in ${t.page}`;
	if (!s.designs) {
		console.log(`${key}: ${meets}`);
		continue;
	}
	const counts = [s.unbuilt ? `${s.unbuilt} with a stage the page leaves unbuilt, ${s.stopped} of them stopping there` : '', s.skipped ? `${s.skipped} more the page cannot build, so it offers no file` : ''].filter(Boolean).join('; ');
	const diffs = s.templates ? `the stage targets within ${dB(s.targets)} of the page's, the page's parts' check within ${dB(s.page)} dB of the page's measure, the file's parts' within ${dB(s.own)} dB of the library's` : '';
	console.log(`${key}: ${s.designs} designs${counts ? ` (${counts})` : ''}${[diffs, meets].filter(Boolean).map((x) => `; ${x}`).join('')}`);
}
cleanup();
console.log(`${passes} passed, ${fails} failed${defaultLines !== null ? `; the default low-pass file has ${defaultLines} lines` : ''}`);
process.exit(fails === 0 ? 0 : 1);
