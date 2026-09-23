import { renderNetlist, spiceValue } from '../spice/core';
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
		case 'firstOrder': {
			// passive RC then the unity-gain buffer the schematic shows
			const A = n('a');
			return [R('', nIn, A, c.R), C('', A, '0', c.C), op('', A, nOut, nOut)];
		}
		case 'firstOrderHp': {
			const A = n('a');
			return [C('', nIn, A, c.C), R('', A, '0', c.R), op('', A, nOut, nOut)];
		}
		default:
			return [];
	}
}

function chainElements(stages, from, to, startIndex = 1) {
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
 * Every element of the circuit, format-independent. The source V1 is
 * included so both renderers drive the input the same way.
 */
export function buildElements({ realizedStages, filterType, lpCount = 0, combinerMode = 'sum', combinerR = 10000 }) {
	const out = [{ kind: 'V', name: 'V1', nodes: ['vin', '0'], spice: 'AC 1 SIN(0 1 1k)' }];
	if (filterType === 'bandstop') {
		const lp = realizedStages.slice(0, lpCount);
		const hp = realizedStages.slice(lpCount);
		out.push({ kind: 'LABEL', text: 'low-pass branch' }, ...chainElements(lp, 'vin', 'lpout', 1));
		out.push({ kind: 'LABEL', text: 'high-pass branch' }, ...chainElements(hp, 'vin', 'hpout', 1 + lp.length));
		if (combinerMode === 'difference') {
			// V(hpout) - V(lpout): the tool picked this over a plain sum
			// because it gives the deeper notch for these branch orders
			out.push(
				{ kind: 'LABEL', text: 'difference amplifier: Vout = V(hpout) - V(lpout)' },
				{ kind: 'R', name: 'RCH', nodes: ['hpout', 'cmp'], value: combinerR },
				{ kind: 'R', name: 'RCG', nodes: ['cmp', '0'], value: combinerR },
				{ kind: 'R', name: 'RCL', nodes: ['lpout', 'cmm'], value: combinerR },
				{ kind: 'R', name: 'RCF', nodes: ['cmm', 'vout'], value: combinerR },
				{ kind: 'OP', name: 'UC', nodes: ['cmp', 'cmm', 'vout'] }
			);
		} else {
			out.push(
				{ kind: 'LABEL', text: 'inverting summing amplifier: Vout = -(V(lpout) + V(hpout))' },
				{ kind: 'R', name: 'RCA', nodes: ['lpout', 'csum'], value: combinerR },
				{ kind: 'R', name: 'RCB', nodes: ['hpout', 'csum'], value: combinerR },
				{ kind: 'R', name: 'RCF', nodes: ['vout', 'csum'], value: combinerR },
				{ kind: 'OP', name: 'UC', nodes: ['0', 'csum', 'vout'] }
			);
		}
	} else {
		out.push(...chainElements(realizedStages, 'vin', 'vout', 1));
	}
	return out;
}

/** The frequencies worth measuring: the spec edges. */
function measurePoints({ filterType, fp, fs, fl, fh, fsl, fsh }) {
	return isBand(filterType)
		? [
				['fl', fl],
				['fh', fh],
				['fsl', fsl],
				['fsh', fsh]
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

function specSummary({ filterType, response, amaxDb, aminDb, fp, fs, fl, fh, fsl, fsh, topology }) {
	const edges = isBand(filterType) ? `fl = ${fl} Hz, fh = ${fh} Hz, fsl = ${fsl} Hz, fsh = ${fsh} Hz` : `fp = ${fp} Hz, fs = ${fs} Hz`;
	return [`${TYPE_LABEL[filterType] ?? filterType}, ${response}`, `Amax = ${amaxDb} dB, Amin = ${aminDb} dB, ${edges}`, `topology: ${topology}`];
}

/* ------------------------------------------------------------- output */

function headerLines(opts) {
	const { filterType } = opts;
	return {
		title: `Active ${TYPE_LABEL[filterType] ?? filterType} filter, generated by rbt56.com/tools/filter-design/`,
		comments: [
			...specSummary(opts),
			'',
			'The op-amp is a generic model: open-loop gain AOL with one dominant',
			'pole set so the gain-bandwidth product equals GBW. Change GBW to the',
			'part you will actually use (3meg = TL07x/TL08x, 8meg = OPA2134,',
			'10meg = NE5532) and rerun to see whether the op-amp limits the design.'
		]
	};
}

function analysis(opts) {
	const { low, high } = sweepRange(opts);
	return [`.ac dec 200 ${low} ${high}`, ...measurePoints(opts).map(([name, f]) => `.meas AC v_${name} FIND V(vout) AT ${f}`)];
}

/**
 * A plain netlist. Its op-amp is a local subcircuit, so the file runs with
 * no external library and the gain-bandwidth can be swept.
 */
export function generateNetlist(opts) {
	const { gbw = '3meg', ideal = false } = opts;
	const { title, comments } = headerLines(opts);
	return renderNetlist({
		elements: buildElements(opts),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run,', 'then plot V(vout). For a schematic instead, download the .asc.'],
		params: [`.param AOL=1meg GBW=${gbw}`],
		directives: [...analysis(opts), '', '* For a time-domain look instead, comment out the .ac line above and', '* uncomment the next one (1 kHz input, 5 ms):', '*.tran 0 5m 0 1u'],
		ideal
	});
}

const TOPOLOGY_LABEL = { mfb: 'multiple feedback', sallenKey: 'Sallen-Key', towThomas: 'Tow-Thomas' };

/** The note on the drawn schematic, in two lines (the .cir carries the longer explanation). */
function schematicNotes(opts) {
	const { filterType, response, topology, realizedStages = [] } = opts;
	const order = realizedStages.reduce((n, s) => n + (s.order ?? (/^firstOrder/.test(s.topology) ? 1 : 2)), 0);
	const kind = `${TYPE_LABEL[filterType] ?? filterType}, ${response}, order ${order}, ${TOPOLOGY_LABEL[topology] ?? topology}`;
	return [`Active ${kind} filter (rbt56.com/tools/filter-design)`, 'Run, then plot V(vout); the .meas lines give its gain at the band edges.'];
}

/**
 * The same circuit as a .asc schematic: real symbols, drawn and wired
 * stage by stage (sheet.js), the AC analysis already set up.
 */
export function generateSchematic(opts) {
	const { gbw = '3Meg' } = opts;
	return drawFilter(
		{ ...opts, elements: buildElements(opts) },
		{ comments: schematicNotes(opts), directives: ['.lib opamp.sub', ...analysis(opts)], gbw }
	);
}
