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

/** Value with an engineering suffix LTspice understands (220p, 4.7n, 1.5k). */
export function spiceValue(v) {
	const a = Math.abs(v);
	if (a === 0) return '0';
	if (a >= 1e6) return `${trim(v / 1e6)}meg`;
	if (a >= 1e3) return `${trim(v / 1e3)}k`;
	if (a >= 1) return trim(v);
	if (a >= 1e-3) return `${trim(v * 1e3)}m`;
	if (a >= 1e-6) return `${trim(v * 1e6)}u`;
	if (a >= 1e-9) return `${trim(v * 1e9)}n`;
	return `${trim(v * 1e12)}p`;
}

function trim(x) {
	// 4 significant figures is plenty, and keeps 4.7n from becoming 4.7000000001n
	return Number(x.toPrecision(4)).toString();
}

/**
 * The elements of one realized stage, wired from `nIn` to `nOut`. `i` makes
 * every internal node and reference designator unique. An op-amp's nodes
 * are always listed [non-inverting, inverting, output]; each renderer maps
 * that onto its own convention.
 */
function stageElements(stage, i, nIn, nOut) {
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
	const out = [{ kind: 'V', name: 'V1', nodes: ['vin', '0'] }];
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

/* --------------------------------------------------------- .cir netlist */

/**
 * A plain netlist. Its op-amp is a local subcircuit (open-loop gain with
 * one dominant pole, both parameters at the top), so the file runs with no
 * external library and the gain-bandwidth can be swept.
 */
export function generateNetlist(opts) {
	const { filterType, gbw = '3meg', ideal = false } = opts;
	const elements = buildElements(opts);
	const { low, high } = sweepRange(opts);

	const head = [
		`* Active ${TYPE_LABEL[filterType] ?? filterType} filter, generated by rbt56.com/tools/filter-design/`,
		'*',
		...specSummary(opts).map((l) => `* ${l}`),
		'*',
		'* Open in LTspice (File > Open, set the filter to All Files) and Run,',
		'* then plot V(vout). For a schematic instead, download the .asc.',
		'*',
		'* The op-amp is a generic model: open-loop gain AOL with one dominant',
		'* pole set so the gain-bandwidth product equals GBW. Change GBW to the',
		'* part you will actually use (3meg = TL07x/TL08x, 8meg = OPA2134,',
		'* 10meg = NE5532) and rerun to see whether the op-amp limits the design.',
		'',
		`.param AOL=1meg GBW=${gbw}`,
		''
	];

	const opamp = ideal
		? ['* ideal op-amp (used by the netlist checker)', '.subckt OPAMP inp inn out', 'E1 out 0 inp inn 1g', '.ends', '']
		: ['.subckt OPAMP inp inn out', 'E1 e 0 inp inn {AOL}', 'R1 e f 1k', 'C1 f 0 {AOL/(2*pi*GBW*1k)}', 'E2 out 0 f 0 1', '.ends', ''];

	const body = ['* input: 1 V AC so V(vout) reads directly as the gain'];
	for (const e of elements) {
		if (e.kind === 'LABEL') body.push('', `* ${e.text}`);
		else if (e.kind === 'V') body.push(`${e.name} ${e.nodes[0]} ${e.nodes[1]} AC 1 SIN(0 1 1k)`);
		else if (e.kind === 'OP') body.push(`X${e.name} ${e.nodes[0]} ${e.nodes[1]} ${e.nodes[2]} OPAMP`);
		else body.push(`${e.name} ${e.nodes[0]} ${e.nodes[1]} ${spiceValue(e.value)}`);
	}
	body.push('');

	const tail = [
		`.ac dec 200 ${low} ${high}`,
		...measurePoints(opts).map(([name, f]) => `.meas AC v_${name} FIND V(vout) AT ${f}`),
		'',
		'* For a time-domain look instead, comment out the .ac line above and',
		'* uncomment the next one (1 kHz input, 5 ms):',
		'*.tran 0 5m 0 1u',
		'',
		'.end',
		''
	];

	return [...head, ...opamp, ...body, ...tail].join('\n');
}

/* ------------------------------------------------------- .asc schematic */

/**
 * Pin offsets of the stock LTspice symbols, read from the shipped .asy
 * files. A wire has to land exactly on these for LTspice to connect it.
 */
const SYMBOLS = {
	res: { name: 'res', pins: [{ dx: 16, dy: 16, dir: 'up' }, { dx: 16, dy: 96, dir: 'down' }] },
	cap: { name: 'cap', pins: [{ dx: 16, dy: 0, dir: 'up' }, { dx: 16, dy: 64, dir: 'down' }] },
	voltage: { name: 'voltage', pins: [{ dx: 0, dy: 16, dir: 'up' }, { dx: 0, dy: 96, dir: 'down' }] },
	// Opamps\opamp is the ideal single-pole op-amp: three pins, and Aol and
	// GBW as editable attributes, which is exactly the model the netlist's
	// own subcircuit imitates. Its SpiceOrder is invin, noninvin, out.
	opamp: {
		name: 'Opamps\\opamp',
		pins: [{ dx: -32, dy: 48, dir: 'left' }, { dx: -32, dy: 80, dir: 'left' }, { dx: 32, dy: 64, dir: 'right' }]
	}
};

const STUB = 32;
const CELL_W = 224;
const CELL_H = 224;
const COLS = 6;

/** Where a stub ends, given a pin and the direction it leaves the body. */
function stubEnd(x, y, dir) {
	if (dir === 'up') return { x, y: y - STUB };
	if (dir === 'down') return { x, y: y + STUB };
	if (dir === 'left') return { x: x - 2 * STUB, y };
	return { x: x + 2 * STUB, y };
}

/**
 * A .asc schematic. Components carry their real symbols and values;
 * connections are made with net labels rather than long wires, so the
 * layout stays readable whatever the topology and nothing can be
 * accidentally mis-routed. Dragging parts around in LTspice keeps the
 * circuit intact, since the labels travel with the pins.
 */
export function generateSchematic(opts) {
	const { filterType, gbw = '3Meg' } = opts;
	const elements = buildElements(opts);
	const { low, high } = sweepRange(opts);

	const lines = [];
	const parts = elements.filter((e) => e.kind !== 'LABEL');
	const rows = Math.ceil(parts.length / COLS);
	const originX = 128;
	const originY = 96;

	let maxX = 0;
	let maxY = 0;
	parts.forEach((e, i) => {
		const col = i % COLS;
		const row = Math.floor(i / COLS);
		const x = originX + col * CELL_W;
		const y = originY + row * CELL_H;
		const sym = e.kind === 'OP' ? SYMBOLS.opamp : e.kind === 'V' ? SYMBOLS.voltage : e.kind === 'C' ? SYMBOLS.cap : SYMBOLS.res;

		// the op-amp symbol's pins are invin, noninvin, out; our canonical
		// node order is non-inverting, inverting, out, hence the swap
		const nodes = e.kind === 'OP' ? [e.nodes[1], e.nodes[0], e.nodes[2]] : e.nodes;

		lines.push(`SYMBOL ${sym.name} ${x} ${y} R0`);
		lines.push(`SYMATTR InstName ${e.name}`);
		if (e.kind === 'V') lines.push('SYMATTR Value AC 1 SIN(0 1 1k)');
		else if (e.kind === 'OP') {
			lines.push('SYMATTR Value opamp');
			lines.push('SYMATTR SpiceLine Aol=1Meg');
			lines.push(`SYMATTR SpiceLine2 GBW=${gbw}`);
		} else lines.push(`SYMATTR Value ${spiceValue(e.value)}`);

		sym.pins.forEach((pin, k) => {
			const px = x + pin.dx;
			const py = y + pin.dy;
			const end = stubEnd(px, py, pin.dir);
			lines.push(`WIRE ${px} ${py} ${end.x} ${end.y}`);
			lines.push(`FLAG ${end.x} ${end.y} ${nodes[k]}`);
			maxX = Math.max(maxX, end.x + 64);
			maxY = Math.max(maxY, end.y + 64);
		});
	});

	const textX = originX - 64;
	let textY = originY + rows * CELL_H + 48;
	const text = [];
	const push = (prefix, body) => {
		text.push(`TEXT ${textX} ${textY} Left 2 ${prefix}${body}`);
		textY += 32;
	};
	push(';', `Active ${TYPE_LABEL[filterType] ?? filterType} filter, generated by rbt56.com/tools/filter-design/`);
	for (const l of specSummary(opts)) push(';', l);
	push(';', 'Connections are made by net label, not by drawn wires: pins sharing a');
	push(';', 'name are the same node. Press Run and plot V(vout).');
	push(';', 'Each op-amp is the ideal single-pole model; set GBW to the real part');
	push(';', '(3Meg = TL07x/TL08x, 8Meg = OPA2134, 10Meg = NE5532) to see its effect.');
	push('!', '.lib opamp.sub');
	push('!', `.ac dec 200 ${low} ${high}`);
	for (const [name, f] of measurePoints(opts)) push('!', `.meas AC v_${name} FIND V(vout) AT ${f}`);

	maxY = Math.max(maxY, textY + 32);
	const header = ['Version 4', `SHEET 1 ${Math.max(880, maxX)} ${Math.max(680, maxY)}`];
	// LTspice writes its schematics with CRLF; keep that so the file looks
	// native on the machines this tool is used from
	return [...header, ...lines, ...text].join('\r\n') + '\r\n';
}
