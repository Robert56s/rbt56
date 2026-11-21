import bandPass from './bandPass';
import boctor from './boctor';
import { bandFile } from './band';
import { filterFile } from './filter';
import firstOrder from './firstOrder';
import mfb from './mfb';
import { narrowFile } from './narrow';
import sallenKey from './sallenKey';
import towThomas from './towThomas';
import towThomasNotch from './towThomasNotch';

/**
 * filter-design.py, the page's Python download: one readable file for the
 * design on the page that works through its template step by step,
 * proposes the parts of every stage with its own simple rule and checks
 * them, and the parts the page shows, against the template.
 *
 *   generateFilterPython({ args, design, shown })
 *     args    what the page's downloadScript (downloadNarrowScript for a
 *             narrow band-pass) passes for the design shown: filterType, the
 *             spec (amaxDb, aminDb, fp, fs or fl, fh, fsl, fsh, the sides'
 *             own), response(s), topology menus, order(s), placement,
 *             capOverrides (farads by stage index), resistorStock,
 *             resistorPairs, resistorPairLimit, capacitorStock, sourceR,
 *             pastLimits, designIndex, the band's method and op-amp
 *     design  the page's ideal design (designLowPass and the others in
 *             stages.js), the one the parts shown were chosen for
 *     shown   the parts result the page shows (searchFilterParts in
 *             partSearch.js, its alternative past the limits or a design
 *             of its "Next design" list): its stages are the page's parts
 *   returns the file's text
 *
 * The modules, one per section of the file and one per family of circuits.
 * Each section writes into the file being built (emit.js PyFile: add(code),
 * once(name, code) for a helper several sections share, imports):
 *   emit.js        Python literals, comments, headers, the file builder
 *   filter.js      the layout of a low-pass or a high-pass, and its context
 *                  (filterContext: ctx; ctx.side for sections 2 to 4)
 *   settings.js    docstring(what), settings(ctx), orderSetting, resultsComment
 *   template.js    1 template(file, ctx), and engHelper(file): eng(v, unit)
 *   order.js       2 order(file, side)
 *   poles.js       3 poles(file, side): formulas, or the page's numbers
 *   placement.js   4 placement(file, side): the window, sigma or eps, wc
 *   targets.js     4 targets(file, side): the list of stage targets
 *   stock.js       stockOf(args), typedOf, stockSettings(ctx), pageValue,
 *                  roundingHelpers(file): rule c's neighbours(), miss(),
 *                  rounded()
 *   parts.js       5 parts(file, ctx): the file's own rule (rule b's
 *                  closest()), own_parts
 *   check.js       6 check(file, ctx, { gainDb }): page_parts, the H(s),
 *                  gain_db(), check(), own_check and page_check
 *   report.js      report(file, ctx): the loads, why the own parts miss
 *   plot.js        plot(file, ctx): the Bode plot, or a table without it
 * A side (ctx.side) is one filter of one response: { type, lp, response,
 * design, circuits: { pair, notch, real }, fp, fs, amax, amin, order (the
 * Python names of its settings), v(name) (the Python name of what it
 * defines: k, n_exact, n, sections, real, eps, sigma, wc, stages...) }. A
 * band filter's layout builds one per side (v adding a suffix, the settings
 * names its own) and calls sections 2 to 4 with each, then sets `stages` to
 * the whole list before parts(); check() reads `passband` and `stopband`,
 * lists of (from Hz, to Hz, limit dB) (opts.sloped: a cascade band-pass's
 * passband as (from, to, the limit at each end); opts.sides: each stopband
 * stretch kept and printed apart), and opts.gainDb replaces the
 * cascade's gain_db (a band-stop's two branches, summed, the source on the
 * node they share). ctx also holds args, design, shown, registry, type,
 * placement, rs, stock, typed, circuits (every one the file writes) and
 * pageComplete (whether the page builds every stage).
 * Families (FAMILIES below; the band and narrow layouts in LAYOUTS):
 *   mfb.js, firstOrder.js         MFB low-pass and high-pass, first order
 *   sallenKey.js, towThomas.js    Sallen-Key, Tow-Thomas low/high-pass
 *   boctor.js, towThomasNotch.js  the notch stages: Boctor's low-pass and
 *                                 high-pass forms, the Tow-Thomas notch (its
 *                                 target carries `gain`, the size of its gain
 *                                 far above the zero: targets.js, transform.js)
 *   band.js                       the band layouts: a cascade band-pass, a
 *                                 band-stop of two branches and its summing
 *                                 amplifier (the source on their shared
 *                                 node), each side's sections 2 to 4 with a
 *                                 suffix; transform.js the transformations
 *   bandPass.js                   the MFB band-pass (built for the op-amp's
 *                                 single pole when the page builds it so)
 *                                 and Tow-Thomas band-pass stages
 *   narrow.js, narrowCircuits.js  the narrow band-pass file, a layout of its
 *                                 own (design: designNarrowBand's; shown:
 *                                 the chain panel 04 builds, realizeNarrow's;
 *                                 args those of downloadNarrowScript and the
 *                                 circuit shown) with its six circuits and the
 *                                 gain stage, judged by the page's measure of
 *                                 a narrow band (narrowFigures, NARROW_RULE)
 *
 * Adding a topology: write its family module, add it to FAMILIES below,
 * and give it a check module in scripts/python-checks/ (its index.mjs
 * lists them). A family module exports
 *   family    its name in the docstring's words: 'multiple feedback (MFB)'
 *   circuits  { libraryTopology: pythonCircuit }: each topology of the
 *             library's realized stages (stage.topology) and the Python
 *             circuit it is written as, snake case: 'mfb_lowpass'
 *   label     { pythonCircuit: 'MFB low-pass' }, the printout's name
 *   figures   { pythonCircuit: ['f0', 'q', 'gain'] }: the keys its
 *             <circuit>_figures returns, which rule c's comment and the
 *             printout name (parts.js FIGURE_WORDS)
 *   rule(circuit, ctx)      the Python of rule a and of the figures rule c
 *             reads, two functions:
 *               <circuit>_choices(st, rs) yields a dict of parts for each
 *                 capacitor (pair) of the stock, the resistors from the
 *                 circuit's formulas, exact: st is the stage's target
 *                 ({ circuit, f0, q, fz, gain }, Hz), rs the source
 *                 resistance on its input (0 past the first stage), taken
 *                 off its input resistor where it adds to one; every value
 *                 positive. ctx.params is its parameter list ('st, rs', or
 *                 'st, rs, typed' when capacitors were typed) and
 *                 ctx.caps('C1') the Python of the capacitors to try for C1
 *                 ('capacitors', or the one typed): loop over those.
 *               <circuit>_figures(p, rs) returns a dict of the figures the
 *                 parts set (f0 Hz, q, gain, fz Hz), rs counted where it
 *                 moves them: rule c keeps the rounding whose figures sit
 *                 closest (largest log ratio) to the exact parts'; a
 *                 figure the resistors cannot move (a gain set by equal
 *                 capacitors) counts for nothing there.
 *   response(circuit, ctx)  the Python of <circuit>_h(p, s, rs): the
 *             complex H(s) of the parts, the textbook formula of the
 *             circuit (admittance form where it reads best), ideal op-amps
 *             (the MFB band-pass built for an op-amp: its single pole),
 *             driven through rs (0 past the first stage); check.js
 *             multiplies the stages
 *   pageParts(stage)        optional: the page's parts of a realized stage as
 *             [[name, value]], by default Object.entries(stage.components)
 * Part names are the page's (its components): a resistor's starts with R
 * or r, a capacitor's with C (rules b to d read the first letter). A
 * band-stop of two branches also needs each first stage's input admittance
 * <circuit>_y(p, s) for the node both branches share: band.js asks the
 * families for it (an `admittance(circuit, ctx)` beside `response`).
 *
 * The Python the file holds:
 *   Python 3.8 or newer, the standard library only (math, itertools; the
 *   plot's matplotlib only when it imports), ASCII only (comments and
 *   printed text too: "ohm", "kohm", "uF", "-3 dB"; a Windows console in
 *   cp1252 cannot print the ohm sign), 4-space indents, lines up to 100
 *   characters (emit.js PyFile throws past them), English, short plain
 *   comments, no second person, no en or em dashes, no emojis, no word of
 *   a class or its teaching (check-python.mjs holds the list; the stock
 *   "Lab kit" may be named).
 *   Top-level code that reads step by step and prints as it goes, small
 *   functions where a formula is reused, stage data in lists, never one
 *   copy of the code per stage, no dead code, nothing generic the design
 *   does not use. Numbers written in carry a comment saying where they
 *   come from and a guard that stops with a clear message when the
 *   settings no longer match them. Every result also lives in a plain
 *   module-level name, listed in the comment "After a run, these names
 *   hold the results: ..." under SETTINGS, which the checks read.
 *
 * Testing: npm run check:python (scripts/check-python.mjs, its families in
 * scripts/python-checks/, the harness scripts/lib-python.mjs) writes the
 * files of a matrix of designs, runs each with python -W error, parses it
 * for Python 3.8, reads its results through runpy, and compares them with
 * the page's: the order and stage targets, the page's parts, their check
 * against the page's measure, the file's own parts against a JavaScript
 * copy of its rule and against the library's measure of them, and the
 * guards of the numbers written in. A family's check module lists its
 * designs and, once written, its rule in JavaScript and the library's
 * stage of its parts (scripts/python-checks/mfb.mjs shows the shape).
 */

/** The topology families, each writing the circuits of the library topologies it lists. */
const FAMILIES = [mfb, firstOrder, sallenKey, towThomas, towThomasNotch, boctor, bandPass];

/** The file's layout by filter type. */
const LAYOUTS = { lowpass: filterFile, highpass: filterFile, bandpass: bandFile, bandstop: bandFile, narrowband: narrowFile };

/**
 * The families by library topology and by Python circuit:
 *   circuitOf(topology)  { family, circuit }
 *   familyOf(circuit)    the family module
 *   label(circuit)       the printout's name of the circuit
 */
function makeRegistry(families) {
	const byTopology = new Map();
	const byCircuit = new Map();
	for (const family of families) {
		for (const [topology, circuit] of Object.entries(family.circuits)) {
			byTopology.set(topology, { family, circuit });
			byCircuit.set(circuit, family);
		}
	}
	const familyOf = (circuit) => {
		const family = byCircuit.get(circuit);
		if (!family) throw new Error(`filter-design.py: no family writes the circuit ${circuit}`);
		return family;
	};
	return {
		circuitOf(topology) {
			const hit = byTopology.get(topology);
			if (!hit) throw new Error(`filter-design.py: no family writes the topology ${topology}`);
			return hit;
		},
		familyOf,
		label: (circuit) => familyOf(circuit).label[circuit]
	};
}

const REGISTRY = makeRegistry(FAMILIES);

/** The registry of the families, for the checks: circuitOf, familyOf, label. */
export const pythonRegistry = REGISTRY;

/** filter-design.py for the design on the page (see the header above). */
export function generateFilterPython({ args, design, shown }) {
	const layout = LAYOUTS[args?.filterType];
	if (!layout) throw new Error(`filter-design.py: no layout for the filter type ${args?.filterType}`);
	return layout({ args, design, shown, registry: REGISTRY });
}
