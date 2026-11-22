import { LAB_KIT, SERIES, seriesPair } from '../../filter/eseries';
import { comment, header, noted, PY_WIDTH, pyEng, pyList, pyNum, pyPart, pyStr } from '../../filter/python/emit';

/**
 * The docstring, SETTINGS and the stock of the oscillator's file. SETTINGS
 * holds what the page designed from, as data a reader may change and run
 * again: the topology and its amplitude control (guarded: the file's code
 * is written for them alone), the frequency and amplitude asked, the excess
 * gain (or the quadrature loop's growth per cycle), the op-amp, the diode
 * and the JFET where the design has them, and the stock. settingNames()
 * gives the scalar ones in order, which the check writes as the page's
 * (page_settings) to tell a run at the page's settings from another.
 */

/** A value with its unit's prefix, to 4 figures, as the file's eng() prints it: 1000 Hz is "1 kHz". */
function engText(v, unit) {
	for (const [prefix, scale] of [['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12]]) {
		if (Math.abs(v) >= scale || prefix === 'p') return `${String(Number((v / scale).toPrecision(4)))} ${prefix}${unit}`;
	}
	return `${v} ${unit}`;
}

/** Words in lines of at most `width` characters, `first` before the first line's. */
function wrapWords(text, width, first = '') {
	const lines = [];
	let line = first;
	for (const w of text.split(' ')) {
		if (line.length > first.length && line.length + 1 + w.length > width) {
			lines.push(line);
			line = w;
			continue;
		}
		line += line === first ? w : ` ${w}`;
	}
	lines.push(line);
	return lines;
}

/** Each topology as the docstring (title), SETTINGS (setting) and the guard's message (name) say it. */
export const TOPOLOGY_WORDS = {
	wien: { title: 'Wien bridge', setting: 'the Wien bridge', name: 'Wien bridge' },
	phaseShift: { title: 'Phase shift', setting: '3 RC sections, no buffers', name: 'phase shift ladder' },
	bufferedPhaseShift: { title: 'Buffered phase shift', setting: '3 buffered RC sections', name: 'buffered phase shift ladder' },
	bubba: { title: 'Bubba', setting: '4 buffered RC sections', name: 'Bubba' },
	quadrature: { title: 'Quadrature', setting: 'two integrators and an inverter', name: 'quadrature loop' }
};

/** Each amplitude control as the docstring and SETTINGS name it. */
export const CONTROL_WORDS = {
	diodes: { title: 'diode limiting', setting: 'diode limiting' },
	lamp: { title: 'a lamp in the lower leg', setting: 'a lamp in the lower leg' },
	jfet: { title: 'JFET gain control', setting: 'a JFET in the lower leg' },
	clamp: { title: 'a diode clamp', setting: 'Rn and a diode clamp' }
};

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const sorted = (list) => [...new Set(list.filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);

/**
 * The stock the file takes its parts from: { kind: 'E24' | 'E96' | 'lab' |
 * 'labR' | 'custom', resistors (a series name or a sorted list of ohms),
 * capacitors (a sorted list of farads, or null for the E6 series), pairs
 * (the page may make a resistor of two in series), pairLimit (how many, or
 * null), shortfall (the page fell back to E24 and E6: the stock on hand
 * cannot build this design) }.
 */
export function stockOf(args, design) {
	if (design.stockShortfall) return { kind: 'E24', resistors: 'E24', capacitors: null, pairs: false, pairLimit: null, shortfall: true };
	const list = Array.isArray(args.resistorSeries);
	const resistors = list ? sorted(args.resistorSeries) : args.resistorSeries === 'E96' ? 'E96' : 'E24';
	const capacitors = Array.isArray(args.capacitors) ? sorted(args.capacitors) : null;
	const lab = list && sameList(resistors, LAB_KIT.resistors);
	const kind = !list ? resistors : lab && capacitors === null ? 'labR' : lab && sameList(capacitors, LAB_KIT.capacitors) ? 'lab' : 'custom';
	const pairs = list && args.pairs === true;
	const pairLimit = pairs && Number.isInteger(args.pairLimit) ? args.pairLimit : null;
	return { kind, resistors, capacitors, pairs, pairLimit, shortfall: false };
}

/** A part of the page's as the file writes it: its value, or the sum of its two stocked parts. */
export function pageValue(value, ctx) {
	const { design } = ctx;
	const pair = design.pairs ? seriesPair(value, design.resistorSeries) : null;
	return pair ? { text: `${pyPart(pair[0])} + ${pyPart(pair[1])}`, pair: true } : { text: pyPart(value), pair: false };
}

/** The docstring: what the file is, that the page wrote it, how to run it. */
export function docstring(ctx) {
	const { design } = ctx;
	const what = `${TOPOLOGY_WORDS[ctx.topology].title} sine oscillator with ${CONTROL_WORDS[ctx.control].title}, for ${engText(design.frequency, 'Hz')} and ${engText(design.amplitude, 'V')} peak.`;
	return [
		...wrapWords(what, PY_WIDTH, '"""'),
		'',
		...wrapWords(
			`rbt56.com/tools/oscillator/ wrote this file for one design: the loop step by step with the op-amp's lag in it, R and C and the amplitude control's parts by simple rules, and a check of these parts and the page's. Run it with Python 3.8 or newer, nothing to install: python ${ctx.name}. The SETTINGS block can be edited and the file run again.`,
			96
		),
		'"""'
	].join('\n');
}

const decimals = (list) => list.map((v) => v.toFixed(1));
const E96_RULE = 'E96 = [round(10 ** (i / 96), 2) for i in range(96)]  # 96 steps a decade, to 3 figures';
const E6_RULE = `capacitors = [m * 10 ** d for d in range(-12, -5) for m in (${decimals(SERIES.E6).join(', ')})]  # F`;

/** The stock in words, and where E96 comes in for an E24 stock. */
function stockWords(ctx) {
	const { stock, control } = ctx;
	const e6 = 'the E6 capacitors from 1 pF to 6.8 uF';
	const words = {
		E24: `the E24 series (5 %) from 1 ohm to 910 Mohm, and ${e6}`,
		E96: `the E96 series (1 %) from 1 ohm to 976 Mohm, and ${e6}`,
		lab: 'the lab kit',
		labR: `the lab kit's resistors, and ${e6}`,
		custom: 'the list on hand'
	}[stock.kind];
	const lead = stock.shortfall ? 'The parts on hand cannot build this oscillator so that it starts and holds its amplitude, so the page shows it with E24 resistors and E6 capacitors instead, and the file takes the same: ' : 'The stock the file takes its parts from: ';
	const e96 = stock.kind !== 'E24' ? '' : control === 'diodes' ? ' Rf1 is a 1 % part, from E96, as on the page (section 4).' : control === 'jfet' ? ' Rser and Ra may come from E96, as on the page (section 4).' : '';
	return `${lead}${words}.${e96}`;
}

/** Whether the file needs E96 beside an E24 stock: Rf1 of a diode limiter, Rser and Ra of an AGC. */
export const needsE96 = (ctx) => ctx.stock.kind === 'E24' && (ctx.control === 'diodes' || ctx.control === 'jfet');

/** SETTINGS' stock: the resistors and capacitors as Python lists or rules. */
function stockSettings(ctx) {
	const { stock } = ctx;
	const lines = [comment(stockWords(ctx))];
	if (stock.kind === 'E24') {
		const e24 = decimals(SERIES.E24);
		lines.push(`E24 = [${e24.slice(0, 18).join(', ')},`, `       ${e24.slice(18).join(', ')}]`, 'resistors = [m * 10 ** d for d in range(9) for m in E24]  # ohm');
		if (needsE96(ctx)) lines.push(E96_RULE, 'resistors_e96 = [m * 10 ** d for d in range(9) for m in E96]  # ohm');
		lines.push(E6_RULE);
	} else if (stock.kind === 'E96') {
		lines.push(E96_RULE, 'resistors = [m * 10 ** d for d in range(9) for m in E96]  # ohm', E6_RULE);
	} else {
		lines.push(pyList('resistors', stock.resistors.map(pyEng), 'ohm'));
		lines.push(stock.capacitors ? pyList('capacitors', stock.capacitors.map(pyEng), 'F') : E6_RULE);
	}
	if (stock.pairs) {
		const limit = stock.pairLimit === null ? '' : `, ${stock.pairLimit === 1 ? 'one such pair' : `at most ${stock.pairLimit} such pairs`} in the oscillator, R counted once for each place it sits`;
		lines.push(comment(`The page may also make a resistor of two of these in series${limit}; the file's own rule keeps to single values.`));
	}
	return lines.join('\n');
}

/**
 * The scalar settings of the file, in SETTINGS' order, as [Python name, the
 * page's value as a Python literal]: SETTINGS writes them so, and the check
 * writes them again as page_settings, so a run at the page's settings
 * compares equal (as_page).
 */
export function settingNames(ctx) {
	const { design, control, args } = ctx;
	const names = [
		['frequency', pyNum(design.frequency)],
		['amplitude', pyNum(design.amplitude)],
		control === 'clamp' ? ['growth', pyNum(args.quadGrowth ?? 0.1)] : ['excess', pyNum(args.excessGain ?? 0.05)],
		['gbw', pyEng(design.opamp.gbw)],
		['slew_rate', pyEng(design.opamp.slewRate)],
		['swing', pyNum(design.opamp.opampSwing)]
	];
	if (control !== 'lamp') names.push(['diode', pyStr(design.diode)]);
	if (control === 'jfet') names.push(['jfet', pyStr(design.jfet)]);
	return names;
}

/** The names the results end up in, for this design's file. */
function resultNames(ctx) {
	const names = ['k', 'gain_textbook'];
	if (ctx.control === 'clamp') names.push('rho_start');
	names.push('rc_textbook', 'f_textbook', 'textbook_ok', 'rc_target');
	if (ctx.control !== 'clamp') names.push('required_gain');
	if (ctx.control === 'diodes') names.push('first_parts');
	names.push('own_parts', 'own_check', 'page_parts');
	if (ctx.control === 'diodes') names.push('page_gain', 'page_amplitude', 'page_verdict');
	names.push('page_check', 'as_page');
	return names;
}

/** What `excess` does in this file: where a diode string sets the start, and where a lamp or an AGC does. */
function excessNote(ctx) {
	const x = ctx.args.excessGain ?? 0.05;
	const pct = Number((100 * x).toPrecision(6));
	if (ctx.control === 'diodes') return `how far above the balance gain the amplifier starts: ${pyNum(x)} is ${pct} %`;
	return `the page retunes R C at 1 + excess times the balance gain; the ${ctx.control === 'lamp' ? 'cold lamp' : 'open JFET'} starts it`;
}

/** The SETTINGS block. */
export function settings(ctx) {
	const { design, control, args } = ctx;
	const value = Object.fromEntries(settingNames(ctx));
	const lines = [
		header('SETTINGS'),
		noted(`topology = ${pyStr(ctx.topology)}`, `${TOPOLOGY_WORDS[ctx.topology].setting}: this file's loop is written for it alone`),
		noted(`stabilizer = ${pyStr(design.stabilizer)}`, `${CONTROL_WORDS[control].setting}: its code is written for it alone`),
		noted(`frequency = ${value.frequency}`, 'Hz, wanted at the output'),
		noted(`amplitude = ${value.amplitude}`, 'V peak, wanted at the output')
	];
	if (control === 'clamp') lines.push(noted(`growth = ${value.growth}`, `the start-up growth per cycle that Rn designs in: ${value.growth} is ${Number((100 * (args.quadGrowth ?? 0.1)).toPrecision(6))} %`));
	else lines.push(noted(`excess = ${value.excess}`, excessNote(ctx)));
	lines.push(
		noted(`gbw = ${value.gbw}`, "Hz, the op-amp's gain-bandwidth"),
		noted(`slew_rate = ${value.slew_rate}`, `V/s, the op-amp's slew rate (${Number((design.opamp.slewRate / 1e6).toPrecision(6))} V/us)`),
		noted(`swing = ${value.swing}`, "V, the op-amp's output swing")
	);
	if (control !== 'lamp') {
		const whose = { diodes: "the limiter's diodes", jfet: "the detector's diode", clamp: "the clamp's diodes" }[control];
		lines.push(noted(`diode = ${value.diode}`, `${whose}, "1N4148" or "BAT54" (their models in section 4)`));
	}
	if (control === 'jfet') lines.push(noted(`jfet = ${value.jfet}`, 'the JFET, "generic" or "J111" (their models in section 4)'));
	return [lines.join('\n'), stockSettings(ctx), comment(`After a run, these names hold the results: ${resultNames(ctx).join(', ')}.`)].join('\n\n');
}
