import { PyFile } from '../../filter/python/emit';
import { buildElements } from '../spice';
import { checkSections } from './check';
import { controlSection, capacitanceSection } from './control';
import { loopSection, opampSection } from './loop';
import { partsSection } from './parts';
import { docstring, settings, stockOf } from './settings';

/**
 * {stem}.py, the oscillator page's Python download (stem as the page names
 * its LTspice files, `${topology}-oscillator`): one readable file for the
 * design on the page that works through the loop step by step, proposes R
 * and C with its own simple rule, sizes the amplitude control for them the
 * way limiter.js does (a diode limiter's stocked pair by a simple rule of
 * its own too), and checks what those parts and the parts the page shows
 * do: the frequency, the start, the amplitude and the page's tests of the
 * op-amp (its lag, the textbook R C's shift, the slew).
 *
 *   generateOscillatorPython({ args, design })
 *     args    what the page designs from: its params (frequency, amplitude,
 *             stabilizer, diode, jfet, excessGain, quadGrowth, gbw,
 *             slewRate, opampSwing, resistorSeries, capacitors, pairs,
 *             pairLimit) and the topology
 *     design  the design the page shows (designFor on the page:
 *             designOscillator, or its E24 fallback, stockShortfall)
 *   returns the file's text; throws where the page exports nothing (the
 *   amplitude control could not be sized: spice.js buildElements says so)
 *
 * The file, for one topology and one amplitude control (it holds only the
 * code that design needs):
 *   docstring, SETTINGS     settings.js: the inputs, the stock, the names
 *                           the results end up in
 *   1 The loop              loop.js: the guards (the topology and control,
 *                           the page's inputs above 0), Barkhausen's
 *                           condition for the network, w0 R C and the gain
 *                           it asks (the plain ladder solved as one network,
 *                           by bisection, as the page solves it)
 *   2 The op-amp in the loop  loop.js: the single-pole op-amp, the loop
 *                           opened, its zero-phase frequency, balance gain
 *                           and the retune of R C (the quadrature loop: its
 *                           pole, det M(s) = 0 of its node equations), the
 *                           page's test on the textbook R C (textbook_ok)
 *   3 R and C from the stock  parts.js: the file's own rule (the filter's
 *                           rule: every capacitor tried, R rounded to the
 *                           stock, the closest within the page's limits,
 *                           10 kohm on a tie) and Rg
 *   4 The amplitude control  control.js: diodes across Rf2, a lamp, a JFET
 *                           AGC, or the quadrature loop's Rn and clamp, each
 *                           sized and its amplitude found as limiter.js
 *                           does it, the diode and JFET models written in
 *   5 The diodes' capacitance  control.js, diode limiters only: the design
 *                           made again with it in the loop, as the page
 *                           does, its lines printed again for those parts
 *   6 The check (5 without the second pass)  check.js: evaluate(), one
 *                           evaluation of a set of parts with the page's
 *                           tests, run on the file's and on the page's
 *                           (written as data with the settings they were
 *                           made for), side by side with a verdict each,
 *                           and why they differ, or that the settings are
 *                           no longer the page's; a diode limiter's file
 *                           also carries what the page shows for its parts
 *                           (page_gain, page_amplitude, page_verdict),
 *                           which the page finds at its first pass's split,
 *                           and says so where the parts' own split moves it
 * The Python: as the filter's file (src/lib/filter/python/index.js says it
 * in full): 3.8 or newer, the math module only, ASCII, lines up to 100
 * characters (emit.js PyFile throws past them), English, plain comments,
 * no second person, no dashes, no word of a class or its teaching; numbers
 * written in carry where they come from and a guard; every result in a
 * module-level name the comment "After a run, these names hold the
 * results: ..." lists. No plot: the page's design panels show none (its
 * basics panel's figures are illustrations of the ideal network).
 *
 * Testing: npm run check:oscillator, its section "the Python download"
 * (scripts/check-oscillator.mjs, the harness scripts/lib-python.mjs).
 */

/** The parts the export needs, as spice.js checks them: throws "no export: ..." where the page offers no download. */
function assertExportable(design) {
	buildElements(design);
}

/**
 * What the sections read: the page's args and design, the loop's kind
 * ('wien', 'ladder', 'quadrature'), the amplitude control ('diodes',
 * 'lamp', 'jfet', 'clamp'), the ladder ({ sections, buffered }), the stock
 * (settings.js stockOf), the file's name, and the section numbers.
 */
function contextOf(args, design) {
	if (!design) throw new Error('oscillator .py: no design to write');
	assertExportable(design);
	const control = design.limiter.kind;
	const numbers = { loop: 1, opamp: 2, parts: 3, control: 4 };
	if (control === 'diodes') numbers.capacitance = 5;
	numbers.check = control === 'diodes' ? 6 : 5;
	return {
		args,
		design,
		topology: design.topology,
		kind: design.kind,
		control,
		ladder: design.topo.ladder ?? null,
		stock: stockOf(args, design),
		name: `${design.topology}-oscillator.py`,
		numbers
	};
}

/** {stem}.py for the design on the page (see the header above). */
export function generateOscillatorPython({ args, design }) {
	const ctx = contextOf(args ?? {}, design);
	const file = new PyFile();
	file.add(docstring(ctx));
	file.imports.add('math');
	file.add(settings(ctx));
	file.once(
		'eng',
		[
			'def eng(v, unit):',
			'    """A value with its unit\'s prefix, to 4 figures: eng(4700, "ohm") is "4.7 kohm"."""',
			'    for prefix, scale in [("M", 1e6), ("k", 1e3), ("", 1.0), ("m", 1e-3), ("u", 1e-6), ("n", 1e-9),',
			'                          ("p", 1e-12)]:',
			'        if abs(v) >= scale or prefix == "p":',
			'            return f"{v / scale:.4g} {prefix}{unit}"'
		].join('\n')
	);
	loopSection(file, ctx);
	opampSection(file, ctx);
	partsSection(file, ctx);
	controlSection(file, ctx);
	if (ctx.numbers.capacitance) capacitanceSection(file, ctx);
	checkSections(file, ctx);
	return file.text();
}
