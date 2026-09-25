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
 *   { kind: 'R', name, nodes: [a, b], value }     value a number, or a
 *                                                 string such as 'R={..}'
 *                                                 used verbatim
 *   { kind: 'C', name, nodes: [a, b], value, ic } ic: initial voltage, V
 *   { kind: 'L', name, nodes: [a, b], value }
 *   { kind: 'V', name, nodes: [plus, minus], spice }        source spec text
 *   { kind: 'B', name, nodes: [plus, minus], spice }        behavioral current
 *                                                           source, spice = 'I=..'
 *   { kind: 'BV', name, nodes: [plus, minus], spice }       behavioral voltage
 *                                                           source, spice = 'V=..'
 *   { kind: 'D', name, nodes: [anode, cathode], model }
 *   { kind: 'J', name, nodes: [drain, gate, source], model } N-channel JFET
 *   { kind: 'OP', name, nodes: [nonInverting, inverting, out] }
 *   { kind: 'LABEL', text }                                 a comment only
 *
 * Every op-amp is { kind: 'OP' }; which model it becomes (the ideal
 * single-pole one, or a real part on +/-15 V rails) is chosen when the
 * list is rendered, see opamps.js.
 *
 * The .asc is drawn per tool with draw.js, which places these symbols in
 * LTspice's own orientations and wires them; geometry.js models what the
 * drawing looks like on screen, and parseSchematic here reads it back so
 * the checkers can compare it with the netlist.
 */

import { opampModel, RAIL_NEG, RAIL_POS, supplyElements } from './opamps';

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
	R: { name: 'res', prefix: 'R', pins: [{ dx: 16, dy: 16 }, { dx: 16, dy: 96 }], order: [0, 1] },
	C: { name: 'cap', prefix: 'C', pins: [{ dx: 16, dy: 0 }, { dx: 16, dy: 64 }], order: [0, 1] },
	L: { name: 'ind', prefix: 'L', pins: [{ dx: 16, dy: 16 }, { dx: 16, dy: 96 }], order: [0, 1] },
	V: { name: 'voltage', prefix: 'V', pins: [{ dx: 0, dy: 16 }, { dx: 0, dy: 96 }], order: [0, 1] },
	// behavioral current source: + on top, current leaves at the - pin
	B: { name: 'bi', prefix: 'B', pins: [{ dx: 0, dy: 0 }, { dx: 0, dy: 80 }], order: [0, 1] },
	// behavioral voltage source, pins where the plain voltage source has them
	BV: { name: 'bv', prefix: 'B', pins: [{ dx: 0, dy: 16 }, { dx: 0, dy: 96 }], order: [0, 1] },
	// anode first (SpiceOrder 1 is the "+" pin)
	D: { name: 'diode', prefix: 'D', pins: [{ dx: 16, dy: 0 }, { dx: 16, dy: 64 }], order: [0, 1] },
	// njf: D(48,0), G(0,64), S(48,96); our order is drain, gate, source already
	J: { name: 'njf', prefix: '', pins: [{ dx: 48, dy: 0 }, { dx: 0, dy: 64 }, { dx: 48, dy: 96 }], order: [0, 1, 2] },
	// Opamps\opamp is the ideal single-pole op-amp: three pins, with Aol and
	// GBW as editable attributes, which is the model the netlist's own
	// subcircuit imitates. Its SpiceOrder is invin, noninvin, out, while we
	// keep non-inverting first, hence order [1, 0, 2].
	OP: {
		name: 'Opamps\\opamp',
		prefix: 'X',
		pins: [{ dx: -32, dy: 48 }, { dx: -32, dy: 80 }, { dx: 32, dy: 64 }],
		order: [1, 0, 2]
	},
	// Opamps\opamp2, the five-pin symbol for a real part: the signal pins
	// where opamp has them, and V+ (top) and V- (bottom) on short leads.
	// SpiceOrder In+, In-, V+, V-, OUT; our order is non-inverting,
	// inverting, output, then the two rails
	OP2: {
		name: 'Opamps\\opamp2',
		prefix: 'X',
		pins: [{ dx: -32, dy: 80 }, { dx: -32, dy: 48 }, { dx: 0, dy: 32 }, { dx: 0, dy: 96 }, { dx: 32, dy: 64 }],
		order: [0, 1, 3, 4, 2]
	}
};

/**
 * LTspice's eight orientations, as measured on the installed symbols: a
 * pin at (x, y) in the symbol's own frame lands here relative to the
 * placement point. R rotates, M mirrors first.
 */
export const ORIENT = {
	R0: (x, y) => [x, y],
	R90: (x, y) => [-y, x],
	R180: (x, y) => [-x, -y],
	R270: (x, y) => [y, -x],
	M0: (x, y) => [-x, y],
	M90: (x, y) => [y, x],
	M180: (x, y) => [x, -y],
	M270: (x, y) => [-y, -x]
};

/**
 * Text safe inside an LTspice TEXT item: the two characters backslash-n
 * are LTspice's line break there and any other backslash sequence aborts
 * the load, so backslashes become slashes.
 */
export function textSafe(s) {
	return String(s).replace(/\\/g, '/');
}

/** Value text of an element as its netlist line carries it. */
function valueText(e) {
	if (e.kind === 'V' || e.kind === 'B' || e.kind === 'BV') return e.spice;
	if (e.kind === 'D' || e.kind === 'J') return e.model;
	const v = typeof e.value === 'string' ? e.value : spiceValue(e.value);
	return e.kind === 'C' && Number.isFinite(e.ic) ? `${v} IC=${spiceValue(e.ic)}` : v;
}

/**
 * The SYMATTR lines an element's symbol instance needs in a .asc. An
 * ideal op-amp carries its gain-bandwidth, a real one its part name (the
 * subcircuit the file defines); a capacitor with an initial condition
 * carries it on the SpiceLine, which LTspice appends to the netlist line
 * exactly as the .cir writes it.
 */
export function symbolAttributes(e, { gbw = '3Meg', aol = '1Meg', opamp = 'ideal' } = {}) {
	const lines = [`SYMATTR InstName ${e.name}`];
	if (e.kind === 'OP' && opampModel(opamp).real) {
		lines.push(`SYMATTR Value ${opampModel(opamp).id}`);
	} else if (e.kind === 'OP') {
		lines.push('SYMATTR Value opamp', `SYMATTR SpiceLine Aol=${aol}`, `SYMATTR SpiceLine2 GBW=${gbw}`);
	} else if (e.kind === 'C') {
		lines.push(`SYMATTR Value ${typeof e.value === 'string' ? e.value : spiceValue(e.value)}`);
		if (Number.isFinite(e.ic)) lines.push(`SYMATTR SpiceLine IC=${spiceValue(e.ic)}`);
	} else {
		lines.push(`SYMATTR Value ${valueText(e)}`);
	}
	return lines;
}

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
 *   opamp       'ideal' (the single-pole model) or a real part from
 *               opamps.js, which brings its subcircuit and the two rails
 */
export function renderNetlist({ elements, title, comments = [], params = [], directives = [], ideal = false, opamp = 'ideal' }) {
	const model = opampModel(opamp);
	const hasOpamp = elements.some((e) => e.kind === 'OP');
	const all = model.real && hasOpamp ? [...elements, ...supplyElements(opamp)] : elements;
	const body = [];
	for (const e of all) {
		if (e.kind === 'LABEL') {
			body.push('', `* ${e.text}`);
			continue;
		}
		if (!SYMBOLS[e.kind]) throw new Error(`no netlist form for element kind ${e.kind}`);
		const n = e.nodes.join(' ');
		if (e.kind === 'OP' && model.real) body.push(`X${e.name} ${e.nodes[0]} ${e.nodes[1]} ${RAIL_POS} ${RAIL_NEG} ${e.nodes[2]} ${model.id}`);
		else if (e.kind === 'OP') body.push(`X${e.name} ${n} OPAMP`);
		else body.push(`${e.name} ${n} ${valueText(e)}`);
	}
	// a real part brings its own subcircuit, and needs no AOL or GBW
	const library = model.real ? (hasOpamp ? [model.subckt, ''] : []) : opampSubckt({ ideal });
	return [
		`* ${title}`,
		'*',
		...comments.map((l) => `* ${l}`),
		'',
		...(model.real ? params.filter((l) => !/^\.param AOL/i.test(l)) : params),
		'',
		...library,
		...body,
		'',
		...directives,
		'',
		'.end',
		''
	].join('\n');
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
	const directives = [];
	let current = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith('TEXT ')) {
			// a '!' body is SPICE directives, one per line break
			const body = line.replace(/^TEXT\s+-?\d+\s+-?\d+\s+\S+\s+\d+\s+/, '');
			if (body.startsWith('!')) directives.push(...body.slice(1).split('\\n').map((d) => d.trim()).filter(Boolean));
		} else if (line.startsWith('WIRE ')) {
			const [x1, y1, x2, y2] = line.slice(5).split(/\s+/).map(Number);
			wires.push([`${x1},${y1}`, `${x2},${y2}`]);
		} else if (line.startsWith('FLAG ')) {
			const [x, y, name] = line.slice(5).split(/\s+/);
			flags.push({ at: `${x},${y}`, name });
		} else if (line.startsWith('SYMBOL ')) {
			const p = line.slice(7).split(/\s+/);
			current = { sym: p[0], x: Number(p[1]), y: Number(p[2]), orient: p[3] ?? 'R0', attrs: {} };
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
	// pins are net points too: two pins on the same spot touch, as they
	// do in LTspice, and a pin with neither a wire nor another pin on it
	// is dangling
	const pinPoints = new Map();
	const placed = symbols.map((s) => {
		const info = ASC_PINS[s.sym];
		const turn = ORIENT[s.orient] ?? ORIENT.R0;
		const pins = info
			? info.pins.map((pin) => {
					const [dx, dy] = turn(pin.dx, pin.dy);
					const at = `${s.x + dx},${s.y + dy}`;
					pinPoints.set(at, (pinPoints.get(at) ?? 0) + 1);
					return at;
				})
			: [];
		return { s, info, pins };
	});
	for (const [at] of pinPoints) find(at);
	// LTspice also connects a flag or a pin that lands in the middle of a
	// wire, so a drawing that runs a wire through a label point merges
	// the two nets; model that, so the checkers see what LTspice sees
	const parsePt = (k) => k.split(',').map(Number);
	const onSegment = (p, a, b) => {
		const [px, py] = p;
		const [ax, ay] = a;
		const [bx, by] = b;
		if (ax === bx) return px === ax && py > Math.min(ay, by) && py < Math.max(ay, by);
		if (ay === by) return py === ay && px > Math.min(ax, bx) && px < Math.max(ax, bx);
		return false;
	};
	const touchPoints = [...new Set([...flags.map((f) => f.at), ...pinPoints.keys()])];
	for (const k of touchPoints) {
		const p = parsePt(k);
		for (const [a, b] of wires) {
			if (onSegment(p, parsePt(a), parsePt(b))) {
				const ra = find(k);
				const rb = find(a);
				if (ra !== rb) parent.set(ra, rb);
			}
		}
	}

	const nameOf = new Map();
	const clashes = [];
	for (const f of flags) {
		const root = find(f.at);
		if (nameOf.has(root) && nameOf.get(root) !== f.name) clashes.push(`${nameOf.get(root)} and ${f.name} share a node`);
		nameOf.set(root, f.name);
	}
	// a drawn schematic leaves most nets unnamed: give them stable names
	let unnamed = 0;
	const netName = (root) => {
		if (!nameOf.has(root)) nameOf.set(root, `_n${++unnamed}`);
		return nameOf.get(root);
	};

	const elements = [];
	const dangling = [];
	for (const { s, info, pins } of placed) {
		if (!info) {
			dangling.push(`unknown symbol ${s.sym}`);
			continue;
		}
		const nodes = [];
		pins.forEach((at, k) => {
			const attached = wires.some(([a, b]) => a === at || b === at || onSegment(parsePt(at), parsePt(a), parsePt(b))) || pinPoints.get(at) > 1 || flags.some((f) => f.at === at);
			if (!attached) dangling.push(`${s.attrs.InstName} has a pin with nothing attached`);
			nodes[info.order[k]] = netName(find(at));
		});
		// a five-pin op-amp reads as an op-amp on its three signal nodes,
		// with the rails it is wired to alongside
		if (info.kind === 'OP2') elements.push({ kind: 'OP', name: s.attrs.InstName, nodes: nodes.slice(0, 3), rails: nodes.slice(3), value: s.attrs.Value, spiceLine: null });
		else elements.push({ kind: info.kind, name: s.attrs.InstName, nodes, value: s.attrs.Value, spiceLine: s.attrs.SpiceLine ?? null });
	}
	return { elements, clashes, dangling, directives };
}
