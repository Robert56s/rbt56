// Shared by the filter checks: the parts the page shows for a design, as
// it picks them (searchFilterParts of partSearch.js, on the whole filter
// against its template), from the same arguments the page hands
// generateScript (codegen.js). The downloaded script must print exactly
// these parts, so the checks build both from one set of arguments:
//   pageDesign(args)   the design, placed as args.placement says
//   pageSettings(args) the search's settings: the menus, the stock, the
//                      pairs and their limit, the capacitors typed (farads),
//                      the band-stop's summing resistor and the source
//                      resistance (args.sourceR, ohms; left out 0, as
//                      generateScript takes it)
//   pageParts(args)    { design, settings, found, result, opamp }: the
//                      search's result (found), the set the page shows
//                      (result: found's alternative with args.pastLimits
//                      when it has one, else found), and the op-amp its
//                      alerts name (limitAlertOpamp of args.mfbOpamp and
//                      args.spiceOpamp)
//   pageNetlistOpts(args, page)  what the page hands spice.js for them
//   scriptParts(out)   the parts a script printed, [[name, value]] in order
//   partsProblems(out, page)  where a script's parts, response points,
//                      verdict and notes on the limits differ from the
//                      page's (page: pageParts's), [] when they agree

import { LAB_KIT, nearestResistor } from '../src/lib/filter/eseries.js';
import { limitAlertOpamp, limitAlertText, searchFilterParts } from '../src/lib/filter/partSearch.js';
import { designBandPass, designBandPassTransformed, designBandStop, designBandStopTransformed, designHighPass, designLowPass } from '../src/lib/filter/stages.js';

const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
const LP = { filterType: 'lowpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null };
const BP = { filterType: 'bandpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, orderHp: null, orderLp: null };
const BS = { filterType: 'bandstop', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, orderHp: null, orderLp: null };
const NARROW = { filterType: 'bandpass', response: 'butterworth', amaxDb: 3, aminDb: 40, aminDbHp: 50, aminDbLp: 30, fl: 40000, fh: 60000, fsl: 10000, fsh: 100000, bandMethod: 'transformed', orderBand: null };

/**
 * The page's settings the files are checked on, as generateScript's
 * arguments (each run on both placements): every topology the search
 * covers, the notches of both circuits, a band-stop's two branches and its
 * combiner, both transformations (the MFB band-pass stages built for the
 * TL082 and the LM741), the stocks, pairs under a limit, capacitors typed
 * by hand, a source resistance (sourceR, the band-stop's shared node among
 * them) and the set past the limits (pastLimits).
 */
export const PAGE_CASES = [
	['low-pass, MFB, lab kit', { ...LP, topology: 'mfb', ...KIT }],
	['low-pass, Sallen-Key, lab kit, pairs', { ...LP, response: 'chebyshev', amaxDb: 1, topology: 'sallenKey', ...KIT, resistorPairs: true }],
	['high-pass, MFB, E24', { ...LP, filterType: 'highpass', fs: 3000, topology: 'mfb' }],
	['high-pass, Tow-Thomas, lab resistors', { ...LP, filterType: 'highpass', response: 'legendre', fs: 3000, topology: 'towThomas', resistorStock: LAB_KIT.resistors }],
	['elliptic low-pass, Boctor, E24', { ...LP, response: 'elliptic', amaxDb: 1, fs: 20000, topology: 'boctor' }],
	['elliptic low-pass, Tow-Thomas, lab kit, 10 nF typed', { ...LP, response: 'elliptic', amaxDb: 1, fs: 20000, topology: 'towThomas', ...KIT, capOverrides: { 0: { C: 1e-8 } } }],
	['band-pass cascade, Tow-Thomas, lab resistors', { ...BP, topology: 'towThomas', resistorStock: LAB_KIT.resistors }],
	['band-stop of two branches, MFB, lab kit', { ...BS, topology: 'mfb', ...KIT }],
	['Bessel band-stop of two branches, Sallen-Key, E96', { ...BS, response: 'bessel', aminDb: 30, topology: 'sallenKey', resistorStock: 'E96' }],
	['narrow band-pass transformed, TL082, lab kit, 2 pairs', { ...NARROW, topology: 'mfb', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: 3450000, ...KIT, resistorPairs: true, resistorPairLimit: 2 }],
	['elliptic band-pass transformed, Tow-Thomas, lab kit', { ...NARROW, response: 'elliptic', topology: 'towThomas', topologyBand: 'towThomas', topologyNotch: 'towThomas', ...KIT }],
	['band-stop transformed, Boctor, E96', { ...BS, bandMethod: 'transformed', topology: 'mfb', topologyBand: 'mfb', topologyNotch: 'boctor', resistorStock: 'E96' }],
	// the page's defaults: a 50 ohm source ahead of the input (RS in the files), the MFB band-pass stages built for the LM741
	['the default band-pass, transformed, MFB for the LM741, lab kit, 50 ohm source', { ...BP, bandMethod: 'transformed', topology: 'mfb', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: 1000000, mfbOpamp: 'LM741', spiceOpamp: 'TL082', ...KIT, sourceR: 50 }],
	['low-pass, MFB, lab kit, 50 ohm source', { ...LP, topology: 'mfb', ...KIT, sourceR: 50 }],
	// a 600 ohm source on the node both branches start from
	['band-stop of two branches, Tow-Thomas, lab resistors, 600 ohm source', { ...BS, topology: 'towThomas', resistorStock: LAB_KIT.resistors, sourceR: 600 }],
	// on the edge the best set within the limits misses: the set past them that meets, shown (PAST_LIMITS)
	['band-stop transformed, Boctor, lab kit, 50 ohm source, past the limits', { ...BS, bandMethod: 'transformed', topology: 'mfb', topologyBand: 'mfb', topologyNotch: 'boctor', ...KIT, sourceR: 50, pastLimits: true }]
];

/** generateScript's arguments with its own defaults filled in. */
function filled(args) {
	const a = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
	return {
		amaxDbHp: a.amaxDb,
		aminDbHp: a.aminDb,
		amaxDbLp: a.amaxDb,
		aminDbLp: a.aminDb,
		responseHp: a.response,
		responseLp: a.response,
		topologyHp: a.topology,
		topologyLp: a.topology,
		bandMethod: 'cascade',
		topologyBand: 'mfb',
		topologyNotch: 'boctor',
		orderBand: null,
		placement: 'edge',
		capOverrides: {},
		resistorPairs: false,
		...a
	};
}

const isBand = (a) => a.filterType === 'bandpass' || a.filterType === 'bandstop';
const isTransformed = (a) => isBand(a) && a.bandMethod === 'transformed';

/** The design the page shows (and the script's ORDER section builds) for generateScript's arguments. */
export function pageDesign(args) {
	const a = filled(args);
	const placement = a.placement === 'centred' ? 'centred' : 'edge';
	const { fl, fh, fsl, fsh } = a;
	if (isTransformed(a)) {
		const amaxDb = Math.min(a.amaxDbHp, a.amaxDbLp);
		return a.filterType === 'bandpass'
			? designBandPassTransformed({ response: a.responseLp, amaxDb, aminDbLow: a.aminDbHp, aminDbHigh: a.aminDbLp, fl, fh, fsl, fsh, order: a.orderBand, placement })
			: designBandStopTransformed({ response: a.responseLp, amaxDb, aminDb: a.aminDb, fl, fh, fsl, fsh, order: a.orderBand, placement });
	}
	if (a.filterType === 'bandpass') return designBandPass({ responseHp: a.responseHp, responseLp: a.responseLp, amaxDbHp: a.amaxDbHp, aminDbHp: a.aminDbHp, amaxDbLp: a.amaxDbLp, aminDbLp: a.aminDbLp, fl, fh, fsl, fsh, orderHigh: a.orderHp ?? null, orderLow: a.orderLp ?? null, placement });
	if (a.filterType === 'bandstop') return designBandStop({ responseHp: a.responseHp, responseLp: a.responseLp, amaxDbHp: a.amaxDbHp, amaxDbLp: a.amaxDbLp, aminDb: a.aminDb, fl, fh, fsl, fsh, orderHigh: a.orderHp ?? null, orderLow: a.orderLp ?? null, placement });
	const spec = { response: a.response, amaxDb: a.amaxDb, aminDb: a.aminDb, fp: a.fp, fs: a.fs, order: a.order ?? null, placement };
	return a.filterType === 'highpass' ? designHighPass(spec) : designLowPass(spec);
}

/** The page's menus: a transformed design's two (the op-amp of its MFB band-pass stages when one is named), else each side's Topology menu. */
export function pageMenus(args) {
	const a = filled(args);
	if (isTransformed(a)) {
		const gbw = a.filterType === 'bandpass' && a.topologyBand === 'mfb' && Number.isFinite(a.opampGbw) ? { gbw: a.opampGbw } : {};
		return { method: 'transformed', bandpass: a.topologyBand, notch: a.topologyNotch, ...gbw };
	}
	return isBand(a) ? { method: 'cascade', highpass: a.topologyHp, lowpass: a.topologyLp } : { method: 'cascade', highpass: a.topology, lowpass: a.topology };
}

/** The search's settings the page passes: a list's summing resistor is its value nearest 10 kohm. */
export function pageSettings(args) {
	const a = filled(args);
	const resistorSeries = a.resistorStock ?? 'E24';
	const pairs = Boolean(a.resistorPairs);
	return {
		menus: pageMenus(a),
		resistorSeries,
		capacitors: a.capacitorStock ?? null,
		pairs,
		pairLimit: pairs && a.resistorPairLimit !== null && a.resistorPairLimit !== undefined ? a.resistorPairLimit : null,
		overrides: a.capOverrides,
		combinerR: Array.isArray(resistorSeries) ? nearestResistor(10000, resistorSeries) : 10000,
		sourceR: Number.isFinite(a.sourceR) && a.sourceR > 0 ? a.sourceR : 0
	};
}

/**
 * The design and the parts the page shows for generateScript's arguments:
 * the search's result, the set shown (past the limits when asked and
 * offered) and the op-amp the alerts name.
 */
export function pageParts(args) {
	const a = filled(args);
	const design = pageDesign(args);
	const settings = pageSettings(args);
	const found = searchFilterParts(design, settings);
	const result = a.pastLimits && found.alternative ? found.alternative : found;
	// (the MFB stages' op-amp counts for a transformed band-pass only, as generateScript writes OPAMP_GBW_PART)
	const builtFor = isTransformed(a) && a.filterType === 'bandpass' && a.opampGbw !== undefined ? (a.mfbOpamp ?? null) : null;
	return { design, settings, found, result, opamp: limitAlertOpamp(result, builtFor, a.spiceOpamp ?? null) };
}

/**
 * What the page hands generateNetlist / generateSchematic (spice.js) for
 * these parts, as its LTspice download does: the spec, the topology labels,
 * one chain or two summed branches with the search's combiner, the stock
 * (for the pair notes), and a transformed design's centre and width.
 */
export function pageNetlistOpts(args, { design, settings, result }) {
	const a = filled(args);
	const band = isBand(a);
	const transformed = isTransformed(a);
	const parallel = a.filterType === 'bandstop' && !transformed;
	const amaxBand = Math.min(a.amaxDbHp, a.amaxDbLp);
	const combiner = result.measure?.combiner ?? null;
	const corrected = result.stages.some((s) => s.topology === 'mfbBp' && Number.isFinite(s.actual.gbw));
	return {
		realizedStages: result.stages,
		...(corrected ? { correctedGbw: settings.menus.gbw } : {}),
		filterType: a.filterType,
		response: band ? (a.responseHp === a.responseLp ? a.responseLp : null) : a.response,
		responseHp: a.responseHp,
		responseLp: a.responseLp,
		amaxDb: transformed ? amaxBand : a.amaxDb,
		aminDb: a.aminDb,
		amaxDbHp: transformed ? amaxBand : band ? a.amaxDbHp : null,
		aminDbHp: band ? a.aminDbHp : null,
		amaxDbLp: transformed ? amaxBand : band ? a.amaxDbLp : null,
		aminDbLp: band ? a.aminDbLp : null,
		fp: a.fp,
		fs: a.fs,
		fl: a.fl,
		fh: a.fh,
		fsl: a.fsl,
		fsh: a.fsh,
		topology: transformed ? (a.filterType === 'bandstop' ? a.topologyNotch : a.topologyBand) : band ? (a.topologyHp === a.topologyLp ? a.topologyHp : null) : a.topology,
		topologyHp: band && !transformed ? a.topologyHp : null,
		topologyLp: band && !transformed ? a.topologyLp : null,
		structure: parallel ? 'parallel' : 'cascade',
		method: transformed ? 'transformed' : undefined,
		f0: transformed ? design.f0 : undefined,
		B: transformed ? design.B : undefined,
		lpCount: parallel ? design.lp.stages.length : 0,
		combinerMode: combiner ? combiner.choice.mode : 'sum',
		combinerR: settings.combinerR,
		combinerResistors: combiner ? combiner.parts.resistors : null,
		resistorStock: settings.resistorSeries,
		pairs: settings.pairs,
		// the source's resistance ahead of the input (RS), as the page's measure has it
		sourceR: settings.sourceR
	};
}

/** The parts a script printed under STAGES (the combiner's resistors included), [[name, value]] in order. */
export function scriptParts(out) {
	const from = out.indexOf('\nSTAGES\n');
	const to = out.indexOf('\nFREQUENCY RESPONSE');
	const text = out.slice(from < 0 ? 0 : from, to < 0 ? out.length : to);
	const parts = [];
	for (const line of text.split('\n')) {
		const first = /^ {2}R = ([\d.e+-]+) ohm.*, C = ([\d.e+-]+) F$/.exec(line);
		if (first) {
			parts.push(['R', Number(first[1])], ['C', Number(first[2])]);
			continue;
		}
		const m = /^ {2}(\w+) = ([\d.e+-]+) (ohm|F)\b/.exec(line);
		if (m) parts.push([m[1], Number(m[2])]);
	}
	return parts;
}

/** The parts the page shows, as a script prints them: resistors to the ohm, capacitors to five figures. */
export function pageLines(result) {
	const rows = result.stages.flatMap((s) => Object.entries(s.components));
	const combiner = result.measure?.combiner;
	if (combiner) rows.push(...Object.entries(combiner.parts.resistors));
	return rows.map(([name, v]) => [name, /^[Rr]/.test(name) ? v : Number(v.toExponential(4))]);
}

/**
 * Where a script's output differs from the page's result: its parts, the
 * response at the points it prints, the figures of its verdict (the worst
 * passband loss, the least stopband attenuation, the margin and the whole
 * template's OK or NOT MET), and with `opamp` given (pageParts's) its notes
 * on the limits, word for word the page's (limitAlertText: one per stage,
 * the summary on the limits line, the offer of parts past them). [] when
 * they agree.
 */
export function partsProblems(out, { design, result, opamp }) {
	const problems = [];
	if (/^ERROR/m.test(out)) return [out.slice(out.indexOf('ERROR'), out.indexOf('ERROR') + 200)];
	const got = scriptParts(out);
	const want = pageLines(result);
	const same = (g, w) => g[0] === w[0] && (/^[Rr]/.test(w[0]) ? Math.abs(g[1] - w[1]) <= 0.5 + 1e-9 * w[1] : Math.abs(g[1] / w[1] - 1) < 1e-9);
	if (got.length !== want.length || got.some((g, k) => !same(g, want[k]))) {
		const k = want.findIndex((w, j) => !got[j] || !same(got[j], w));
		problems.push(`parts: ${got.length} printed against ${want.length}${k >= 0 ? `, first ${got[k] ? got[k].join(' = ') : 'none'} against ${want[k].join(' = ')}` : ''}`);
	}
	const m = result.measure;
	// the points the script prints the response at, in its order
	const { fp, fs, fl, fh, fsl, fsh } = design;
	const type = design.method === 'cascade' ? 'bandpass' : design.method === 'parallel' ? 'bandstop' : design.filterType;
	const points = {
		lowpass: () => [fp / 10, fp, Math.sqrt(fp * fs), fs, fs * 10],
		highpass: () => [fs / 10, fs, Math.sqrt(fp * fs), fp, fp * 10],
		bandpass: () => [fsl / 10, fsl, fl, Math.sqrt(fl * fh), fh, fsh, fsh * 10],
		bandstop: () => [fl / 10, fl, fsl, Math.sqrt(fsl * fsh), fsh, fh, fh * 10]
	}[type]();
	const printed = [...out.matchAll(/^ +(\d+) Hz : +(-?[\d.]+) dB$/gm)].map((x) => Number(x[2]));
	if (printed.length !== points.length || points.some((f, k) => Math.abs(printed[k] - m.gainDbAt(f)) > 0.0051)) problems.push(`response points: ${printed.join(' ')} against ${points.map((f) => m.gainDbAt(f).toFixed(2)).join(' ')}`);
	const pass = /worst loss in the passband (-?[\d.]+) dB at (\d+) Hz/.exec(out);
	const stop = /least attenuation in the stopband (-?[\d.]+) dB/.exec(out);
	const margin = /^margin (-?[\d.]+) dB.*the whole template: (OK|NOT MET)$/m.exec(out);
	if (!pass || Math.abs(Number(pass[1]) - m.pass.loss) > 5.1e-4) problems.push(`worst passband loss ${pass?.[1]} against ${m.pass.loss.toFixed(3)}`);
	if (!stop || Math.abs(Number(stop[1]) - m.stop.db) > 0.051) problems.push(`stopband ${stop?.[1]} against ${m.stop.db.toFixed(1)}`);
	if (!margin || Math.abs(Number(margin[1]) - m.margin) > 5.1e-4 || (margin[2] === 'OK') !== m.meets) problems.push(`margin ${margin?.[1]} ${margin?.[2]} against ${m.margin.toFixed(3)} ${m.meets ? 'OK' : 'NOT MET'}`);
	if (opamp !== undefined) {
		const text = limitAlertText(result, opamp);
		const notes = [...out.matchAll(/^ {2}note: (.*)$/gm)].map((x) => x[1]).filter((x) => !/^CAP_OVERRIDES/.test(x));
		const want = text.stages.map((s) => s.text);
		if (notes.length !== want.length || notes.some((x, k) => x !== want[k])) problems.push(`notes: ${notes.length} printed against ${want.length}${notes.length || want.length ? `, first "${notes[0] ?? ''}" against "${want[0] ?? ''}"` : ''}`);
		const line = /^limits of the search \([^)]*\): (.*)$/m.exec(out);
		if (!line || line[1] !== (text.summary || 'kept')) problems.push(`limits line "${line?.[1]}" against "${text.summary || 'kept'}"`);
		if (out.includes(text.offer || '\u0000') !== Boolean(text.offer)) problems.push(`offer "${text.offer}" not printed`);
	}
	return problems;
}
