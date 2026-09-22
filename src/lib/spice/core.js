/**
 * LTspice output shared by every tool that exports a circuit.
 *
 * A circuit is described once as a flat list of elements; this module
 * renders that list either as a .cir netlist (self-contained, its op-amp a
 * local subcircuit, easy to read and to diff) or as a .asc schematic (real
 * LTspice symbols, what opens on a double-click). Both come from the same
 * list, so a tool cannot ship a schematic and a netlist that disagree.
 *
 * Element shapes, `nodes` in the order given:
 *   { kind: 'R', name, nodes: [a, b], value }
 *   { kind: 'C', name, nodes: [a, b], value }
 *   { kind: 'L', name, nodes: [a, b], value }
 *   { kind: 'V', name, nodes: [plus, minus], spice }        source spec text
 *   { kind: 'D', name, nodes: [anode, cathode], model }
 *   { kind: 'J', name, nodes: [drain, gate, source], model } N-channel JFET
 *   { kind: 'OP', name, nodes: [nonInverting, inverting, out] }
 *   { kind: 'LABEL', text }                                 a comment only
 *
 * Connections in the .asc are made with net labels rather than drawn
 * wires: every pin gets a short stub and a label, and pins sharing a name
 * are the same node. That keeps the sheet readable whatever the topology,
 * makes mis-routing impossible, and lets parts be dragged around in
 * LTspice without breaking the circuit.
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
 * Pin offsets of the stock LTspice symbols, read from the shipped .asy
 * files. A wire has to land exactly on these for LTspice to connect it.
 * `order` lists which of our canonical nodes each pin takes, since a
 * symbol's SpiceOrder is not always the order we keep them in.
 */
export const SYMBOLS = {
	R: { name: 'res', prefix: 'R', pins: [{ dx: 16, dy: 16, dir: 'up' }, { dx: 16, dy: 96, dir: 'down' }], order: [0, 1] },
	C: { name: 'cap', prefix: 'C', pins: [{ dx: 16, dy: 0, dir: 'up' }, { dx: 16, dy: 64, dir: 'down' }], order: [0, 1] },
	L: { name: 'ind', prefix: 'L', pins: [{ dx: 16, dy: 16, dir: 'up' }, { dx: 16, dy: 96, dir: 'down' }], order: [0, 1] },
	V: { name: 'voltage', prefix: 'V', pins: [{ dx: 0, dy: 16, dir: 'up' }, { dx: 0, dy: 96, dir: 'down' }], order: [0, 1] },
	// anode first (SpiceOrder 1 is the "+" pin)
	D: { name: 'diode', prefix: 'D', pins: [{ dx: 16, dy: 0, dir: 'up' }, { dx: 16, dy: 64, dir: 'down' }], order: [0, 1] },
	// njf: D(48,0), G(0,64), S(48,96); our order is drain, gate, source already
	J: { name: 'njf', prefix: '', pins: [{ dx: 48, dy: 0, dir: 'up' }, { dx: 0, dy: 64, dir: 'left' }, { dx: 48, dy: 96, dir: 'down' }], order: [0, 1, 2] },
	// Opamps\opamp is the ideal single-pole op-amp: three pins, with Aol and
	// GBW as editable attributes, which is the model the netlist's own
	// subcircuit imitates. Its SpiceOrder is invin, noninvin, out, while we
	// keep non-inverting first, hence order [1, 0, 2].
	OP: {
		name: 'Opamps\\opamp',
		prefix: 'X',
		pins: [{ dx: -32, dy: 48, dir: 'left' }, { dx: -32, dy: 80, dir: 'left' }, { dx: 32, dy: 64, dir: 'right' }],
		order: [1, 0, 2]
	}
};

/** The op-amp subcircuit the netlist carries, so it needs no library. */
export function opampSubckt({ ideal = false } = {}) {
	return ideal
		? ['* ideal op-amp (used by the netlist checker)', '.subckt OPAMP inp inn out', 'E1 out 0 inp inn 1g', '.ends', '']
		: [
				'* open-loop gain AOL with one dominant pole, so the gain-bandwidth',
				'* product is GBW: the same model the .asc symbol uses',
				'.subckt OPAMP inp inn out',
				'E1 e 0 inp inn {AOL}',
				'R1 e f 1k',
				'C1 f 0 {AOL/(2*pi*GBW*1k)}',
				'E2 out 0 f 0 1',
				'.ends',
				''
			];
}

/**
 * A .cir netlist.
 *   elements    the circuit
 *   title       first comment line
 *   comments    further comment lines, without the leading '*'
 *   params      lines of .param, .model, .ic ... placed before the circuit
 *   directives  analysis lines placed after it
 *   ideal       replace the op-amp model with an ideal one (for checking)
 */
export function renderNetlist({ elements, title, comments = [], params = [], directives = [], ideal = false }) {
	const body = [];
	for (const e of elements) {
		if (e.kind === 'LABEL') {
			body.push('', `* ${e.text}`);
			continue;
		}
		const n = e.nodes.join(' ');
		if (e.kind === 'V') body.push(`${e.name} ${n} ${e.spice}`);
		else if (e.kind === 'OP') body.push(`X${e.name} ${n} OPAMP`);
		else if (e.kind === 'D' || e.kind === 'J') body.push(`${e.name} ${n} ${e.model}`);
		else body.push(`${e.name} ${n} ${spiceValue(e.value)}`);
	}
	return [
		`* ${title}`,
		'*',
		...comments.map((l) => `* ${l}`),
		'',
		...params,
		'',
		...opampSubckt({ ideal }),
		...body,
		'',
		...directives,
		'',
		'.end',
		''
	].join('\n');
}

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
 * A .asc schematic of the same circuit. `directives` are emitted as SPICE
 * directive text (a leading '!'), `comments` as plain text notes.
 */
export function renderSchematic({ elements, title, comments = [], directives = [], gbw = '3Meg', aol = '1Meg' }) {
	const lines = [];
	const parts = elements.filter((e) => e.kind !== 'LABEL');
	const rows = Math.ceil(parts.length / COLS);
	const originX = 128;
	const originY = 96;
	let maxX = 0;
	let maxY = 0;

	parts.forEach((e, i) => {
		const sym = SYMBOLS[e.kind];
		if (!sym) return;
		const x = originX + (i % COLS) * CELL_W;
		const y = originY + Math.floor(i / COLS) * CELL_H;
		lines.push(`SYMBOL ${sym.name} ${x} ${y} R0`);
		// a JFET's stock prefix already supplies the leading letter
		lines.push(`SYMATTR InstName ${e.kind === 'J' ? e.name.replace(/^J/, '') : e.name}`);
		if (e.kind === 'V') lines.push(`SYMATTR Value ${e.spice}`);
		else if (e.kind === 'OP') {
			lines.push('SYMATTR Value opamp');
			lines.push(`SYMATTR SpiceLine Aol=${aol}`);
			lines.push(`SYMATTR SpiceLine2 GBW=${gbw}`);
		} else if (e.kind === 'D' || e.kind === 'J') lines.push(`SYMATTR Value ${e.model}`);
		else lines.push(`SYMATTR Value ${spiceValue(e.value)}`);

		sym.pins.forEach((pin, k) => {
			const px = x + pin.dx;
			const py = y + pin.dy;
			const end = stubEnd(px, py, pin.dir);
			lines.push(`WIRE ${px} ${py} ${end.x} ${end.y}`);
			lines.push(`FLAG ${end.x} ${end.y} ${e.nodes[sym.order[k]]}`);
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
	push(';', title);
	for (const l of comments) push(';', l);
	push(';', 'Connections are made by net label, not by drawn wires: pins sharing a');
	push(';', 'name are the same node. Press Run to simulate.');
	for (const d of directives) push('!', d);

	maxY = Math.max(maxY, textY + 32);
	// LTspice writes its schematics with CRLF; keep that so the file looks
	// native on the machines this tool is used from
	return ['Version 4', `SHEET 1 ${Math.max(880, maxX)} ${Math.max(680, maxY)}`, ...lines, ...text].join('\r\n') + '\r\n';
}

/* ------------------------------------------------------- verification */

const ASC_PINS = Object.fromEntries(Object.entries(SYMBOLS).map(([kind, s]) => [s.name, { kind, pins: s.pins, order: s.order }]));

/**
 * Rebuilds the circuit a .asc actually describes: nets come from the wires
 * (union-find over shared endpoints), names from the flags sitting on
 * them, and each symbol's nodes from where its pins land. Anything
 * mis-wired, or two different nets landing on the same point, shows up
 * here. Used by the checkers, not by the page.
 */
export function parseSchematic(text) {
	const wires = [];
	const flags = [];
	const symbols = [];
	let current = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith('WIRE ')) {
			const [x1, y1, x2, y2] = line.slice(5).split(/\s+/).map(Number);
			wires.push([`${x1},${y1}`, `${x2},${y2}`]);
		} else if (line.startsWith('FLAG ')) {
			const [x, y, name] = line.slice(5).split(/\s+/);
			flags.push({ at: `${x},${y}`, name });
		} else if (line.startsWith('SYMBOL ')) {
			const p = line.slice(7).split(/\s+/);
			current = { sym: p[0], x: Number(p[1]), y: Number(p[2]), attrs: {} };
			symbols.push(current);
		} else if (line.startsWith('SYMATTR ') && current) {
			const rest = line.slice(8);
			const sp = rest.indexOf(' ');
			current.attrs[rest.slice(0, sp)] = rest.slice(sp + 1);
		}
	}

	const parent = new Map();
	const find = (k) => {
		if (!parent.has(k)) parent.set(k, k);
		while (parent.get(k) !== k) {
			parent.set(k, parent.get(parent.get(k)));
			k = parent.get(k);
		}
		return k;
	};
	for (const [a, b] of wires) {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent.set(ra, rb);
	}

	const nameOf = new Map();
	const clashes = [];
	for (const f of flags) {
		const root = find(f.at);
		if (nameOf.has(root) && nameOf.get(root) !== f.name) clashes.push(`${nameOf.get(root)} and ${f.name} share a node`);
		nameOf.set(root, f.name);
	}

	const elements = [];
	const dangling = [];
	for (const s of symbols) {
		const info = ASC_PINS[s.sym];
		if (!info) {
			dangling.push(`unknown symbol ${s.sym}`);
			continue;
		}
		const nodes = [];
		info.pins.forEach((pin, k) => {
			const at = `${s.x + pin.dx},${s.y + pin.dy}`;
			if (!parent.has(at)) {
				dangling.push(`${s.attrs.InstName} has a pin with nothing attached`);
				return;
			}
			const name = nameOf.get(find(at));
			if (!name) dangling.push(`${s.attrs.InstName} sits on an unnamed net`);
			nodes[info.order[k]] = name ?? null;
		});
		elements.push({ kind: info.kind, name: s.attrs.InstName, nodes, value: s.attrs.Value });
	}
	return { elements, clashes, dangling };
}
