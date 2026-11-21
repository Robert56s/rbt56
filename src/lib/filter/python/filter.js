import { RESPONSES } from '../approximations';
import { check } from './check';
import { PY_WIDTH, PyFile, header, listWords, section } from './emit';
import { order } from './order';
import { parts } from './parts';
import { placement } from './placement';
import { plot } from './plot';
import { lossReal, poles } from './poles';
import { report } from './report';
import { docstring, settings } from './settings';
import { stockOf, typedOf } from './stock';
import { targets } from './targets';
import { engHelper, template } from './template';

/**
 * The file for a low-pass or a high-pass: the sections in the order the
 * hand method takes them. Sections 2 to 4 (order, poles, placement and the
 * stage targets) read `ctx.side`, one filter of one response: a band
 * filter's layout (band.js) can build one side per half of its spec and
 * call the same sections with each.
 */
export function filterFile({ args, design, shown, registry }) {
	const ctx = filterContext({ args, design, shown, registry });
	const file = new PyFile();
	file.imports.add('math');
	file.add(docstring(ctx.what, 'template', ctx.detail));
	file.add(settings(ctx));
	engHelper(file);
	file.add(section('1 The template'));
	template(file, ctx);
	file.add(section('2 The order'));
	order(file, ctx.side);
	file.add(section('3 The normalized poles'));
	poles(file, ctx.side);
	file.add(section('4 Placement and denormalization'));
	placement(file, ctx.side);
	targets(file, ctx.side);
	file.add(section('5 The parts of each stage'));
	parts(file, ctx);
	file.add(section('6 The check'));
	check(file, ctx);
	report(file, ctx);
	file.add(header('Bode plot'));
	plot(file, ctx);
	return file.text();
}

/** What a stage is, for the circuit that builds it: a pole pair, a pole pair with a zero, or the real pole. */
export const stageKind = (stage) => (stage.order === 1 ? 'real' : Number.isFinite(stage.wz) ? 'notch' : 'pair');

/**
 * The library topology each kind of stage of a low-pass or high-pass is
 * built with under a Topology menu, as the page's designers build them
 * (psDesignerBuild in partSearch.js): the all-pole stages of the Boctor menu
 * are Tow-Thomas, its stages with a zero Boctor's. Used where the page left
 * a stage unbuilt; otherwise the stages the page shows say it.
 */
const MENU_TOPOLOGY = {
	mfb: { pair: ['mfb', 'mfbHp'] },
	sallenKey: { pair: ['sallenKey', 'sallenKeyHp'] },
	towThomas: { pair: ['towThomas', 'towThomasHp'], notch: ['towThomasNotch', 'towThomasNotch'] },
	boctor: { pair: ['towThomas', 'towThomasHp'], notch: ['boctor', 'boctorHp'] }
};
const REAL_TOPOLOGY = ['firstOrder', 'firstOrderHp'];

/**
 * The Python circuit of each kind of stage of one side, { pair, notch, real }
 * (null for a kind it has none of): read from the stages the page shows
 * (`shownStages`, aligned with `stages`), else from the Topology menu.
 */
export function sideCircuits(registry, stages, shownStages, menu, type) {
	const hp = type === 'highpass' ? 1 : 0;
	const out = { pair: null, notch: null, real: null };
	stages.forEach((stage, i) => {
		const kind = stageKind(stage);
		const topology = shownStages?.[i]?.topology ?? (kind === 'real' ? REAL_TOPOLOGY[hp] : MENU_TOPOLOGY[menu]?.[kind]?.[hp]);
		const { circuit } = registry.circuitOf(topology);
		if (out[kind] && out[kind] !== circuit) throw new Error(`filter-design.py: stages of one kind on two circuits, ${out[kind]} and ${circuit}`);
		out[kind] = circuit;
	});
	return out;
}

/** The source resistance as the page's measure takes it, ohms: 0 for an ideal source or for no value. */
export const sourceOhms = (r) => (Number.isFinite(r) && r > 0 ? r : 0);

/**
 * Everything the sections read for a low-pass or a high-pass. ctx.side is
 * the one filter the order, poles, placement and targets sections build:
 *   type, lp, response, design   the filter and the library's ideal design
 *   circuits   the Python circuit of each kind of stage (sideCircuits)
 *   fp, fs, amax, amin, order    the Python names of its settings
 *   v(name)    the Python name of what it defines (k, n, sections, wc,
 *              stages...): the name itself here, a band side's with a suffix
 */
export function filterContext({ args, design, shown, registry }) {
	const type = design.filterType;
	const shownStages = shown?.stages ?? null;
	const circuits = sideCircuits(registry, design.stages, shownStages, args.topology, type);
	const side = {
		type,
		lp: type === 'lowpass',
		response: design.response,
		design,
		circuits,
		// (loss_db with a real pole where this prototype can have one: poles.js lossReal)
		lossReal: lossReal([{ response: design.response, design }]),
		fp: 'fp',
		fs: 'fs',
		amax: 'amax',
		amin: 'amin',
		order: 'order',
		v: (name) => name
	};
	const used = [...new Set([...design.stages.map((s) => circuits[stageKind(s)]), ...(shownStages ?? []).filter(Boolean).map((s) => registry.circuitOf(s.topology).circuit)])];
	const families = [...new Set(used.map((c) => registry.familyOf(c).family))];
	// (the docstring's first line holds the summary alone: the stages, where it runs past, open the next paragraph)
	const head = `Active ${type === 'highpass' ? 'high-pass' : 'low-pass'} filter: ${RESPONSES[design.response]?.label ?? design.response} response`;
	const fits = `"""${head}, ${listWords(families)} stages.`.length <= PY_WIDTH;
	return {
		args,
		design,
		shown,
		registry,
		type,
		lp: type === 'lowpass',
		side,
		placement: design.placement?.mode === 'centred' ? 'centred' : 'edge',
		rs: sourceOhms(args.sourceR),
		stock: stockOf(args),
		typed: typedOf(args.capOverrides),
		// the circuits the file writes: its own stages' and the page's, in that order
		circuits: used,
		// whether the page builds every stage: its parts are then checked too
		pageComplete: Boolean(shownStages?.length) && shownStages.every(Boolean),
		what: fits ? `${head}, ${listWords(families)} stages.` : `${head}.`,
		detail: fits ? '' : `Its stages: ${listWords(families)}.`
	};
}
