import { opampModel, opampPhrase } from '../spice/opamps';
import { renderNetlist, spiceValue } from '../spice/core';
import { RESPONSES } from './approximations';
import { seriesPair } from './eseries';
import { drawFilter } from './sheet';

export { spiceValue };

/**
 * LTspice output for a realized design, in two formats built from one
 * description of the circuit:
 *
 *   generateSchematic()  a .asc schematic, what LTspice opens on a
 *                        double-click, with real symbols that can be
 *                        edited in the GUI
 *   generateNetlist()    a .cir netlist, self-contained (its op-amp is a
 *                        local subcircuit, so no library is needed) and
 *                        easy to diff or read
 *
 * Both come from buildElements(), so they always describe the same
 * circuit: the checker in scripts/check-spice.mjs simulates the netlist
 * against the tool's own model and then re-derives the schematic's
 * connectivity from its wires and net labels to confirm the two agree.
 *
 * Node names are readable rather than numbered: vin, vout, and per-stage
 * names like s1a (summing node of stage 1) or s2n (inverting input of
 * stage 2).
 */

/**
 * The elements of one realized stage, wired from `nIn` to `nOut`. `i` makes
 * every internal node and reference designator unique. An op-amp's nodes
 * are always listed [non-inverting, inverting, output]; each renderer maps
 * that onto its own convention.
 */
export function stageElements(stage, i, nIn, nOut) {
	const c = stage.components;
	const n = (suffix) => `s${i}${suffix}`;
	const R = (tag, a, b, value) => ({ kind: 'R', name: `R${tag}${i}`, nodes: [a, b], value });
	const C = (tag, a, b, value) => ({ kind: 'C', name: `C${tag}${i}`, nodes: [a, b], value });
	const op = (tag, p, m, out) => ({ kind: 'OP', name: `U${tag}${i}`, nodes: [p, m, out] });

	switch (stage.topology) {
		case 'boctor': {
			const X = n('x'), M = n('m'), P = n('p');
			return [C('2', nIn, X, c.C2), R('6', X, M, c.R6), C('1', M, nOut, c.C1), R('2', X, '0', c.R2), R('1', M, '0', c.R1), R('4', X, nOut, c.R4), R('3', nIn, P, c.R3), R('5', P, '0', c.R5), op('', P, M, nOut)];
		}
		case 'boctorHp': {
			const X = n('x'), M = n('m'), P = n('p');
			return [C('2', nIn, X, c.C2), R('2', X, M, c.R2), C('1', nIn, P, c.C1), R('4', M, '0', c.R4), R('5', M, nOut, c.R5), R('1', nIn, P, c.R1), R('3', P, nOut, c.R3), R('6', P, '0', c.R6), op('', P, M, nOut)];
		}
		case 'mfb': {
			// R1 in to summing node A, C1 A to ground, R2 A to the virtual
			// ground, R3 feedback to A, C2 feedback from the virtual ground.
			const A = n('a');
			const M = n('n');
			return [R('1', nIn, A, c.R1), C('1', A, '0', c.C1), R('2', A, M, c.R2), R('3', nOut, A, c.R3), C('2', M, nOut, c.C2), op('', '0', M, nOut)];
		}
		case 'mfbHp': {
			const A = n('a');
			const M = n('n');
			return [C('1', nIn, A, c.C1), R('1', A, '0', c.R1), C('2', A, M, c.C2), C('3', nOut, A, c.C3), R('2', M, nOut, c.R2), op('', '0', M, nOut)];
		}
		case 'sallenKey': {
			// two equal R to the + input, Cbottom to ground, Ctop from the
			// output back to the R-R junction, op-amp as a follower
			const X = n('x');
			const P = n('p');
			return [R('1', nIn, X, c.R1), R('2', X, P, c.R2), C('b', P, '0', c.Cbottom), C('t', nOut, X, c.Ctop), op('', P, nOut, nOut)];
		}
		case 'sallenKeyHp': {
			const X = n('x');
			const P = n('p');
			return [C('1', nIn, X, c.C1), C('2', X, P, c.C2), R('b', P, '0', c.Rbottom), R('t', nOut, X, c.Rtop), op('', P, nOut, nOut)];
		}
		case 'towThomas': {
			// A1 damped integrator (output = band-pass), A2 integrator
			// (output = low-pass, the stage output), A3 unity inverter
			const N1 = n('n1');
			const N2 = n('n2');
			const B = n('bp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				R('1', nIn, N1, c.R1),
				R('a', N3, N1, c.Ra),
				C('1', N1, B, c.C1),
				R('d', N1, B, c.Rd),
				op('a', '0', N1, B),
				R('b', B, N2, c.Rb),
				C('2', N2, nOut, c.C2),
				op('b', '0', N2, nOut),
				R('r1', nOut, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'towThomasHp': {
			// same loop, input through Cin: A1's output is the high-pass
			const N1 = n('n1');
			const N2 = n('n2');
			const L = n('lp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				C('in', nIn, N1, c.Cin),
				R('a', N3, N1, c.Ra),
				C('1', N1, nOut, c.C1),
				R('d', N1, nOut, c.Rd),
				op('a', '0', N1, nOut),
				R('b', nOut, N2, c.Rb),
				C('2', N2, L, c.C2),
				op('b', '0', N2, L),
				R('r1', L, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'towThomasNotch': {
			// the high-pass loop plus Rz from the input into A2: A1's output is the notch
			const N1 = n('n1');
			const N2 = n('n2');
			const B = n('bp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				C('in', nIn, N1, c.Cin),
				R('z', nIn, N2, c.Rz),
				R('a', N3, N1, c.Ra),
				C('1', N1, nOut, c.C1),
				R('d', N1, nOut, c.Rd),
				op('a', '0', N1, nOut),
				R('b', nOut, N2, c.Rb),
				C('2', N2, B, c.C2),
				op('b', '0', N2, B),
				R('r1', B, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'mfbBp': {
			// Delyiannis-Friend: R1 in to A and R2 A to ground (the input
			// attenuator), C2 A to the virtual ground, C1 output back to A, R3
			// output back to the virtual ground. The order of mfbHp, so drawMfb
			// draws it.
			const A = n('a');
			const M = n('n');
			return [R('1', nIn, A, c.R1), R('2', A, '0', c.R2), C('2', A, M, c.C2), C('1', nOut, A, c.C1), R('3', M, nOut, c.R3), op('', '0', M, nOut)];
		}
		case 'towThomasBp': {
			// the low-pass loop with its output taken at A1 (the band-pass):
			// towThomasHp with R1 in place of Cin
			const N1 = n('n1');
			const N2 = n('n2');
			const L = n('lp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				R('1', nIn, N1, c.R1),
				R('a', N3, N1, c.Ra),
				C('1', N1, nOut, c.C1),
				R('d', N1, nOut, c.Rd),
				op('a', '0', N1, nOut),
				R('b', nOut, N2, c.Rb),
				C('2', N2, L, c.C2),
				op('b', '0', N2, L),
				R('r1', L, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'firstOrder': {
			// passive RC then the unity-gain buffer the schematic shows
			const A = n('a');
			return [R('', nIn, A, c.R), C('', A, '0', c.C), op('', A, nOut, nOut)];
		}
		case 'firstOrderHp': {
			const A = n('a');
			return [C('', nIn, A, c.C), R('', A, '0', c.R), op('', A, nOut, nOut)];
		}
		// The gain stages of a filter designed by hand (handDesign.js), each
		// R1 and R2 as the method names them:
		case 'gainInv': {
			// inverting amplifier, -R2/R1: R1 in to the virtual ground, R2 back from the output
			const M = n('n');
			return [R('1', nIn, M, c.R1), R('2', M, nOut, c.R2), op('', '0', M, nOut)];
		}
		case 'gainDivider': {
			// R2 in series, R1 to ground, then a follower: R1/(R1 + R2), the
			// order of a first-order stage, so drawFirstOrder draws it
			const A = n('a');
			return [R('2', nIn, A, c.R2), R('1', A, '0', c.R1), op('', A, nOut, nOut)];
		}
		case 'gainNonInv': {
			// non-inverting amplifier, 1 + R2/R1: R1 from the - input to ground, R2 back from the output
			const M = n('n');
			return [R('1', M, '0', c.R1), R('2', M, nOut, c.R2), op('', nIn, M, nOut)];
		}
		default:
			return [];
	}
}

/** Stages in cascade from node `from` to node `to`, numbered from `startIndex`. */
export function chainElements(stages, from, to, startIndex = 1) {
	const out = [];
	let node = from;
	stages.forEach((stage, k) => {
		const i = startIndex + k;
		const next = k === stages.length - 1 ? to : `st${i}`;
		out.push({ kind: 'LABEL', text: `stage ${i}: ${stage.topology}` });
		out.push(...stageElements(stage, i, node, next));
		node = next;
	});
	return out;
}

const TYPE_LABEL = { lowpass: 'low-pass', highpass: 'high-pass', bandpass: 'band-pass', bandstop: 'band-stop' };
const isBand = (t) => t === 'bandpass' || t === 'bandstop';
/**
 * A band filter built from one low-pass prototype (stages.js,
 * designBandPassTransformed / designBandStopTransformed); a band-stop
 * drawn as one chain is one too.
 */
const isTransformed = ({ filterType, method, structure }) => isBand(filterType) && (method === 'transformed' || (filterType === 'bandstop' && structure === 'cascade'));
const hz = (f) => Number(f.toPrecision(6));
/**
 * MFB band-pass stages built for a single-pole op-amp (mfbBandPass.js):
 * opts.correctedGbw, in Hz. The single-pole model in the file then takes
 * that gain-bandwidth unless gbw says otherwise, and the notes say so. Left
 * at it, the note says that it is the GBW set in the file: the generic
 * note above it quotes datasheet figures (3meg for a TL07x), and the
 * stages may be built for another (3.45 MHz, measured on the TL082 model).
 */
const correctedGbw = (opts) => (Number.isFinite(opts.correctedGbw) && opts.correctedGbw > 0 ? opts.correctedGbw : null);
const correctedLine = (opts) => {
	const mhz = Number((correctedGbw(opts) / 1e6).toPrecision(4));
	// the single-pole model left at that GBW
	const setHere = !opampModel(opts.opamp ?? 'ideal').real && opts.gbw === undefined;
	return setHere
		? `The MFB band-pass stages are built for a single-pole op-amp of ${mhz} MHz, the GBW set here: another GBW moves them.`
		: `The MFB band-pass stages are built for a single-pole op-amp of ${mhz} MHz: another op-amp moves them.`;
};

/**
 * Every element of the circuit, format-independent. The source V1 is
 * included so both renderers drive the input the same way. A band-stop
 * is two branches and a combiner (structure 'parallel'), or with
 * structure 'cascade' (a transformed band-stop, every stage a notch) one
 * chain like any other filter.
 */
export function buildElements({ realizedStages, filterType, method, structure = method === 'transformed' ? 'cascade' : 'parallel', lpCount = 0, combinerMode = 'sum', combinerR = 10000, combinerResistors = null }) {
	const out = [{ kind: 'V', name: 'V1', nodes: ['vin', '0'], spice: 'AC 1 SIN(0 1 1k)' }];
	if (filterType === 'bandstop' && structure !== 'cascade') {
		const lp = realizedStages.slice(0, lpCount);
		const hp = realizedStages.slice(lpCount);
		// the combiner's resistors: all equal, unless the low-pass branch's
		// input resistor was scaled to even out a notch stage's DC gain
		const rv = (key) => combinerResistors?.[key] ?? combinerR;
		out.push({ kind: 'LABEL', text: 'low-pass branch' }, ...chainElements(lp, 'vin', 'lpout', 1));
		out.push({ kind: 'LABEL', text: 'high-pass branch' }, ...chainElements(hp, 'vin', 'hpout', 1 + lp.length));
		if (combinerMode === 'difference') {
			// V(hpout) - V(lpout): the tool picked this over a plain sum
			// because it gives the deeper notch for these branch orders
			out.push(
				{ kind: 'LABEL', text: 'difference amplifier: Vout = V(hpout) - V(lpout)' },
				{ kind: 'R', name: 'RCH', nodes: ['hpout', 'cmp'], value: rv('RCH') },
				{ kind: 'R', name: 'RCG', nodes: ['cmp', '0'], value: rv('RCG') },
				{ kind: 'R', name: 'RCL', nodes: ['lpout', 'cmm'], value: rv('RCL') },
				{ kind: 'R', name: 'RCF', nodes: ['cmm', 'vout'], value: rv('RCF') },
				{ kind: 'OP', name: 'UC', nodes: ['cmp', 'cmm', 'vout'] }
			);
		} else {
			out.push(
				{ kind: 'LABEL', text: 'inverting summing amplifier: Vout = -(V(lpout) + V(hpout))' },
				{ kind: 'R', name: 'RCA', nodes: ['lpout', 'csum'], value: rv('RCA') },
				{ kind: 'R', name: 'RCB', nodes: ['hpout', 'csum'], value: rv('RCB') },
				{ kind: 'R', name: 'RCF', nodes: ['vout', 'csum'], value: rv('RCF') },
				{ kind: 'OP', name: 'UC', nodes: ['0', 'csum', 'vout'] }
			);
		}
	} else {
		out.push(...chainElements(realizedStages, 'vin', 'vout', 1));
	}
	return out;
}

/** The frequencies worth measuring: the spec edges, and the centre f0 of a transformed band-pass (its gain is 1 there). */
function measurePoints(opts) {
	const { filterType, fp, fs, fl, fh, fsl, fsh } = opts;
	return isBand(filterType)
		? [
				['fl', fl],
				['fh', fh],
				['fsl', fsl],
				['fsh', fsh],
				...(isTransformed(opts) && filterType === 'bandpass' ? [['f0', hz(bandCentreOf(opts).f0)]] : [])
			]
		: [
				['fp', fp],
				['fs', fs]
			];
}

function sweepRange({ filterType, fp, fs, fsl, fsh }) {
	const low = Math.max(1, Math.round((isBand(filterType) ? fsl : Math.min(fp, fs)) / 100));
	const high = Math.round((isBand(filterType) ? fsh : Math.max(fp, fs)) * 100);
	return { low, high };
}

/** f0 and B of a band, as given or from fl and fh. */
function bandCentreOf({ f0, B, fl, fh }) {
	return { f0: f0 ?? Math.sqrt(fl * fh), B: B ?? fh - fl };
}

/** The response in words: one name, or one per side when a band type mixes two (a transformed band has one). */
function responseText(opts) {
	const { filterType, response, responseHp, responseLp } = opts;
	const name = (r) => RESPONSES[r]?.label ?? r;
	if (isBand(filterType) && !isTransformed(opts) && responseHp && responseLp && responseHp !== responseLp) return `${name(responseHp)} high-pass side, ${name(responseLp)} low-pass side`;
	return name(response ?? responseLp ?? 'butterworth');
}

/**
 * The limits of a transformed band: one Amax (fl and fh land on the same
 * prototype edge), and for a band-pass an Amin per stopband edge when the
 * two differ. aminDbLow / aminDbHigh when given, else the sides' figures.
 */
function transformedLimitsText({ filterType, amaxDb, aminDb, amaxDbHp, amaxDbLp, aminDbHp, aminDbLp, aminDbLow, aminDbHigh }) {
	const amax = Number.isFinite(amaxDbHp) && Number.isFinite(amaxDbLp) ? Math.min(amaxDbHp, amaxDbLp) : amaxDb;
	const low = aminDbLow ?? aminDbHp ?? aminDb;
	const high = aminDbHigh ?? aminDbLp ?? aminDb;
	const amin = filterType === 'bandstop' || low === high ? `${low} dB` : `${low} dB at fsl, ${high} dB at fsh`;
	return `Amax = ${amax} dB, Amin = ${amin}`;
}

/** The limits in one line, each one per side when a band filter's two sides differ. */
function limitsText(opts) {
	const { filterType, amaxDb, aminDb, amaxDbHp, aminDbHp, amaxDbLp, aminDbLp } = opts;
	if (!isBand(filterType)) return `Amax = ${amaxDb} dB, Amin = ${aminDb} dB`;
	if (isTransformed(opts)) return transformedLimitsText(opts);
	const word = filterType === 'bandstop' ? 'branch' : 'side';
	const pair = (hp, lp) => (hp === lp ? `${lp} dB` : `${hp} dB (high-pass ${word}), ${lp} dB (low-pass ${word})`);
	return `Amax = ${pair(amaxDbHp ?? amaxDb, amaxDbLp ?? amaxDb)}, Amin = ${pair(aminDbHp ?? aminDb, aminDbLp ?? aminDb)}`;
}

function specSummary(opts) {
	const { filterType, fp, fs, fl, fh, fsl, fsh, topology, topologyHp, topologyLp } = opts;
	const edges = isBand(filterType) ? `fl = ${fl} Hz, fh = ${fh} Hz, fsl = ${fsl} Hz, fsh = ${fsh} Hz` : `fp = ${fp} Hz, fs = ${fs} Hz`;
	if (isTransformed(opts)) {
		const { f0, B } = bandCentreOf(opts);
		const type = TYPE_LABEL[filterType];
		return [`${type}, ${responseText(opts)}, low-pass to ${type} transformation`, `${limitsText(opts)}, ${edges}`, `f0 = ${hz(f0)} Hz, B = ${hz(B)} Hz, stages: ${stagesText(opts)}`];
	}
	return [`${TYPE_LABEL[filterType] ?? filterType}, ${responseText(opts)}`, `${limitsText(opts)}, ${edges}`, topologyHp && topologyLp && topologyHp !== topologyLp ? `topology: ${topologyHp} (high-pass side), ${topologyLp} (low-pass side)` : `topology: ${topology ?? topologyLp}`];
}

/**
 * One line per resistor built from two in series (the stock picker's "two
 * in series" option, `pairs` with a list in `resistorStock`). The file
 * keeps their sum, the same resistor electrically; these lines name the
 * two parts, `where` saying what the file does with the sum. A stage that
 * fell back to the full series (stockShortfall) has no pairs.
 */
function pairLines({ realizedStages = [], resistorStock = null, pairs = false }, where) {
	if (!pairs || !Array.isArray(resistorStock)) return [];
	const lines = [];
	realizedStages.forEach((stage, k) => {
		if (stage.stockShortfall) return;
		for (const e of stageElements(stage, k + 1, 'in', 'out')) {
			const pair = e.kind === 'R' ? seriesPair(e.value, resistorStock) : null;
			if (pair) lines.push(`stage ${k + 1} ${e.name} = ${spiceValue(pair[0])} + ${spiceValue(pair[1])} in series (${where})`);
		}
	});
	return lines;
}

/* ------------------------------------------------------------- output */

function headerLines(opts) {
	const { filterType, opamp = 'ideal' } = opts;
	const pairs = pairLines(opts, 'their sum is used below');
	return {
		title: `Active ${TYPE_LABEL[filterType] ?? filterType} filter, generated by rbt56.com/tools/filter-design/`,
		comments: [
			...specSummary(opts),
			'',
			...(pairs.length ? [...pairs, ''] : []),
			...(opampModel(opamp).real
				? [`The op-amps are ${opampPhrase(opamp)} (VPOS, VNEG), so the run shows`, 'what the part adds to the design: its gain-bandwidth, slew rate and', 'output limits. The ideal op-amp on the page gives the design itself.']
				: [
						'The op-amp is a generic model: open-loop gain AOL with one dominant',
						'pole set so the gain-bandwidth product equals GBW. Change GBW to the',
						'part that will be built (3meg = TL07x/TL08x, 8meg = OPA2134,',
						'10meg = NE5532) and rerun to see whether the op-amp limits the design.'
					]),
			...(correctedGbw(opts) ? [correctedLine(opts)] : [])
		]
	};
}

/**
 * Points per decade of the sweep. The .meas lines read between its points,
 * and a transformed band's stages sharpen as the band narrows, so its
 * sweep puts about 50 points across f0/Q of its sharpest stage.
 */
function pointsPerDecade(opts) {
	if (!isTransformed(opts)) return 200;
	const q = Math.max(0, ...(opts.realizedStages ?? []).map((s) => s.actual?.q).filter(Number.isFinite));
	return Math.max(200, Math.ceil((50 * Math.LN10 * q) / 100) * 100);
}

function analysis(opts) {
	const { low, high } = sweepRange(opts);
	return [`.ac dec ${pointsPerDecade(opts)} ${low} ${high}`, ...measurePoints(opts).map(([name, f]) => `.meas AC v_${name} FIND V(vout) AT ${f}`)];
}

/**
 * A plain netlist. Its op-amp is a local subcircuit, so the file runs with
 * no external library and the gain-bandwidth can be swept.
 */
export function generateNetlist(opts) {
	const { gbw = correctedGbw(opts) ? spiceValue(correctedGbw(opts)) : '3meg', ideal = false, opamp = 'ideal' } = opts;
	const { title, comments } = headerLines(opts);
	return renderNetlist({
		elements: buildElements(opts),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run,', 'then plot V(vout). For a schematic instead, download the .asc.'],
		params: [`.param AOL=1meg GBW=${gbw}`],
		directives: [...analysis(opts), '', '* For a time-domain look instead, comment out the .ac line above and', '* uncomment the next one (1 kHz input, 5 ms):', '*.tran 0 5m 0 1u'],
		ideal,
		opamp
	});
}

const TOPOLOGY_LABEL = { mfb: 'multiple feedback', sallenKey: 'Sallen-Key', towThomas: 'Tow-Thomas', boctor: 'Boctor notch', mfbBp: 'multiple feedback band-pass', towThomasBp: 'Tow-Thomas band-pass', gainInv: 'inverting gain', gainDivider: 'divider gain', gainNonInv: 'non-inverting gain' };

/** The stage circuits actually on the sheet: the chosen topology, the notch stages, the band-pass stages, or several. */
function stagesText({ topology, realizedStages = [] }) {
	const kinds = new Set(realizedStages.map((s) => (s.topology === 'towThomasNotch' ? 'Tow-Thomas notch' : /^firstOrder/.test(s.topology) ? null : TOPOLOGY_LABEL[s.topology] ?? TOPOLOGY_LABEL[s.topology.replace(/Hp$/, '')])).filter(Boolean));
	return kinds.size ? [...kinds].join(' and ') : TOPOLOGY_LABEL[topology] ?? topology;
}

/** The note on the drawn schematic: two lines (the .cir carries the longer explanation), then one per resistor built from two in series. */
function schematicNotes(opts) {
	const { filterType, realizedStages = [] } = opts;
	const order = realizedStages.reduce((n, s) => n + (s.order ?? (/^firstOrder/.test(s.topology) ? 1 : 2)), 0);
	const kind = `${TYPE_LABEL[filterType] ?? filterType}, ${responseText(opts)}, order ${order}, ${stagesText(opts)}`;
	if (isTransformed(opts)) {
		const { f0, B } = bandCentreOf(opts);
		const at = filterType === 'bandpass' ? 'at the band edges and at f0' : 'at the band edges';
		return [`Active ${kind} filter (rbt56.com/tools/filter-design)`, `Low-pass to ${TYPE_LABEL[filterType]} transformation, f0 = ${hz(f0)} Hz, B = ${hz(B)} Hz.`, `Run, then plot V(vout); the .meas lines give its gain ${at}.`, ...(correctedGbw(opts) ? [correctedLine(opts)] : []), ...pairLines(opts, 'the drawing shows their sum')];
	}
	return [`Active ${kind} filter (rbt56.com/tools/filter-design)`, 'Run, then plot V(vout); the .meas lines give its gain at the band edges.', ...pairLines(opts, 'the drawing shows their sum')];
}

/**
 * The same circuit as a .asc schematic: real symbols, drawn and wired
 * stage by stage (sheet.js), the AC analysis already set up.
 */
export function generateSchematic(opts) {
	const { gbw = correctedGbw(opts) ? `${Number((correctedGbw(opts) / 1e6).toPrecision(4))}Meg` : '3Meg', opamp = 'ideal' } = opts;
	return drawFilter(
		{ ...opts, elements: buildElements(opts) },
		{ comments: schematicNotes(opts), directives: ['.lib opamp.sub', ...analysis(opts)], gbw, opamp }
	);
}
