/**
 * Drawing a real LTspice schematic.
 *
 * LTspice keeps symbols on a 16-unit grid and knows eight orientations
 * (R0, R90, R180, R270 and their mirrors M0..M270). A wire only connects
 * where its end lands exactly on a pin or on another wire, and a FLAG
 * names the net at a point (the name 0 is ground). Junction dots are
 * LTspice's own business: it draws one wherever three wires meet.
 *
 * A sheet built here is the same element list the netlist is rendered
 * from, placed by hand per topology: every element is placed once, by
 * saying where one of its pins should land and which way it should
 * point, and the sheet reports where its other pins ended up so the
 * wiring can be written in terms of pins rather than coordinates.
 *
 * What the drawing looks like is modelled in geometry.js: every part is
 * written with the attribute windows LTspice's own editor uses for that
 * orientation (so a horizontal resistor reads its name above and its
 * value below, both horizontal), notes() puts the comment and the
 * directives under the drawing at their real height, and audit() lists
 * anything that would overlap. The check scripts run it on every
 * configuration, and read the drawing back with parseSchematic to compare
 * it with the netlist.
 */

import { ORIENT, SYMBOLS, symbolAttributes, textSafe } from './core';
import { audit as auditAsc, CANONICAL, CHAR_W, extent, LINE_H, SHAPES } from './geometry';
import { opampModel, RAIL_NEG, RAIL_POS, subcktDirective, supplyElements } from './opamps';

const GRID = 16;

/** Where pin k of a symbol lands, for a placement point and orientation. */
function pinAt(sym, k, x, y, orient) {
	const [dx, dy] = ORIENT[orient](sym.pins[k].dx, sym.pins[k].dy);
	return { x: x + dx, y: y + dy };
}

const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

/** The orientation a two-pin part takes to run from its first node `dir`-wards. */
const TWO_PIN_ORIENT = { down: 'R0', up: 'M180', right: 'R270', left: 'R90' };

/**
 * The WINDOW lines of a placed symbol. Starts from what LTspice's editor
 * writes for the orientation and moves the text where `labels` asks:
 *   vertical parts    'right' (default) or 'left' of the body
 *   horizontal parts  'above' (default: name above, value below) or
 *                     'below' (name below, value above)
 *   op-amps           'above' (default: name over the top edge) or 'below'
 *
 * A five-pin op-amp keeps its supply leads clear: its name goes over the
 * body's input corner and its part name under it (or the other way round
 * with 'below'), both right-aligned so they end short of the leads.
 */
function windowsFor(symName, orient, labels) {
	const shape = SHAPES[symName];
	const canonical = CANONICAL[symName]?.[orient];
	const out = {};
	if (canonical) Object.assign(out, canonical);
	if (symName === 'Opamps\\opamp2') return opampWindows(orient, labels)[0];
	if (symName === 'Opamps\\opamp') {
		// the name sits over the top edge (R0, M0) or under the bottom edge
		// (M180, R180, flipped); window (0, 96) puts it on the other side
		const upright = orient === 'R0' || orient === 'M0';
		if ((labels === 'below' && upright) || (labels === 'above' && !upright)) out[0] = [0, 96, 'Left'];
		return out;
	}
	if (!labels || labels === 'right' || labels === 'above') return out;
	const horizontal = orient === 'R90' || orient === 'R270' || orient === 'M90' || orient === 'M270';
	const base = { ...shape.windows, ...out };
	if (horizontal && labels === 'below') {
		// swap the two windows: each keeps its own justification rule
		const a = base[0];
		const b = base[3];
		if (a && b) {
			out[0] = [b[0], b[1], b[2]];
			out[3] = [a[0], a[1], a[2]];
		}
		return out;
	}
	if (!horizontal && labels === 'left') {
		// mirror the windows to the far side of the body, right-aligned there
		const [bx0, , bx1] = shape.body.reduce((acc, b) => [Math.min(acc[0], b[0]), 0, Math.max(acc[2], b[2])], [Infinity, 0, -Infinity]);
		for (const id of [0, 3]) {
			const w = base[id];
			if (!w) continue;
			const gap = w[0] - bx1;
			const x = bx0 - gap;
			// under M180 alignment keeps its side, under R0 it is plain
			out[id] = [x, w[1], 'Right'];
		}
		return out;
	}
	return out;
}

/**
 * Where a five-pin op-amp's name and part name can go, in order of
 * preference: both over the input corner (the part name stacked outside
 * the name), both under it, one each side, then the name alone with the
 * part name hidden. Right-aligned at x = -16 so neither reaches the
 * supply leads at x = 0. Symbol y runs the other way when the part is
 * flipped, so "over" is y 16 upright and y 112 flipped.
 */
function opampWindows(orient, labels) {
	const flipped = orient === 'M180' || orient === 'R180';
	const over = flipped ? [112, 140] : [16, -12];
	const under = flipped ? [16, -12] : [112, 140];
	const [first, second] = labels === 'below' ? [under, over] : [over, under];
	const w = (nameY, valueY) => ({ 0: [-16, nameY, 'Right'], 3: valueY === null ? [-16, nameY, 'Invisible'] : [-16, valueY, 'Right'] });
	return [w(first[0], first[1]), w(second[0], second[1]), w(first[0], second[0]), w(first[0], null), w(second[0], null)];
}

/**
 * The shapes a supply stub may take from a rail pin, as moves: 'v' away
 * from the body, 'h' towards the output side (negative: the input side).
 * The last move is horizontal, so the rail's name reads horizontally.
 */
const RAIL_PATHS = [
	[['h', 32]],
	[['v', 16], ['h', 32]],
	[['v', 16], ['h', 16]],
	[['v', 32], ['h', 32]],
	[['v', 16], ['h', -32]],
	[['v', 32], ['h', -32]],
	[['h', 16]],
	[['v', 48], ['h', 32]],
	[['v', 48], ['h', -32]],
	[['v', 64], ['h', 32]],
	[['v', 64], ['h', -32]]
];

/**
 * A sheet under construction. Coordinates are LTspice units; anything
 * placed off the 16 grid is refused, since LTspice would not connect it.
 */
export function createSheet({ gbw = '3Meg', aol = '1Meg', opamp = 'ideal' } = {}) {
	const model = opampModel(opamp);
	let opampCount = 0;
	// real op-amps waiting for their labels and rail stubs, placed last
	const realOps = [];
	const symbols = [];
	const wires = [];
	const flags = [];
	const texts = [];
	// a block drawn with its own coordinates can be shifted, and its net
	// names rewritten, so one layout serves as a sub-circuit of another
	let offset = { x: 0, y: 0 };
	let nameMap = (n) => n;
	const sh = (p) => ({ x: p.x + offset.x, y: p.y + offset.y });

	/** Runs `fn` with every coordinate shifted by (dx, dy) and every flag name passed through `names`. */
	function block({ dx = 0, dy = 0, names = (n) => n }, fn) {
		const saved = { offset, nameMap };
		offset = { x: offset.x + dx, y: offset.y + dy };
		const outer = nameMap;
		nameMap = (n) => outer(names(n));
		try {
			return fn();
		} finally {
			offset = saved.offset;
			nameMap = saved.nameMap;
		}
	}

	const onGrid = (v, what) => {
		if (v % GRID !== 0) throw new Error(`${what} ${v} is off LTspice's 16-unit grid`);
		return v;
	};

	/**
	 * Places an element with its placement point at (x, y). Returns the
	 * pins in the element's own node order, so pins[0] is the node listed
	 * first in `nodes` whatever the symbol's SpiceOrder.
	 */
	function place(e, x, y, orient = 'R0', { labels } = {}) {
		// an op-amp is the five-pin symbol when the sheet uses a real part
		const sym = SYMBOLS[e.kind === 'OP' && model.real ? 'OP2' : e.kind];
		if (!sym) throw new Error(`no LTspice symbol for kind ${e.kind}`);
		onGrid(x, 'x');
		onGrid(y, 'y');
		const at = sh({ x, y });
		symbols.push({ e, x: at.x, y: at.y, orient, windows: windowsFor(sym.name, orient, labels), symName: sym.name });
		const pins = [];
		sym.pins.forEach((_, k) => {
			pins[sym.order[k]] = pinAt(sym, k, x, y, orient);
		});
		return { e, pins, x, y, orient };
	}

	/**
	 * Places a two-pin element so that its first node's pin sits at `from`
	 * and its second node's pin lies `dir` from it, at the symbol's own
	 * pin spacing, in the orientation LTspice's editor would give it.
	 */
	function placeFrom(e, from, dir, opts = {}) {
		const sym = SYMBOLS[e.kind];
		const orient = TWO_PIN_ORIENT[dir];
		if (!orient) throw new Error(`no direction ${dir}`);
		const a = sym.pins[sym.order.indexOf(0)];
		const [ax, ay] = ORIENT[orient](a.dx, a.dy);
		const b = sym.pins[sym.order.indexOf(1)];
		const [bx, by] = ORIENT[orient](b.dx, b.dy);
		const [ux, uy] = DIRS[dir];
		const len = Math.hypot(bx - ax, by - ay);
		if (Math.abs(bx - ax - ux * len) > 1e-9 || Math.abs(by - ay - uy * len) > 1e-9) throw new Error(`cannot orient ${e.kind} ${dir}`);
		return place(e, from.x - ax, from.y - ay, orient, opts);
	}

	/**
	 * Places an op-amp pointing right, by where its output pin should be:
	 * inverting input on top, or with `flip` the non-inverting input on top
	 * (how a non-inverting stage is drawn). `mirror` points it left, inputs
	 * on the right. `labels` ('above' or 'below') moves its name to the
	 * other side of the body.
	 */
	function placeOpamp(e, out, { flip = false, mirror = false, labels } = {}) {
		const sym = SYMBOLS[model.real ? 'OP2' : 'OP'];
		const orient = mirror ? (flip ? 'R180' : 'M0') : flip ? 'M180' : 'R0';
		const outPin = sym.pins[sym.order.indexOf(2)];
		const [dx, dy] = ORIENT[orient](outPin.dx, outPin.dy);
		const placed = place(e, out.x - dx, out.y - dy, orient, { labels });
		opampCount++;
		// a real op-amp's rails are wired once the drawing around it is
		// done (see fitOpamps), where they can be fitted clear of it
		if (model.real) realOps.push({ sym: symbols[symbols.length - 1], orient, labels, vp: sh(placed.pins[3]), vn: sh(placed.pins[4]), out: sh(placed.pins[2]) });
		return placed;
	}

	/** A straight wire; refuses diagonals since LTspice draws them but nobody wants them. */
	function wire(a, b) {
		if (a.x !== b.x && a.y !== b.y) throw new Error(`diagonal wire from ${a.x},${a.y} to ${b.x},${b.y}`);
		if (a.x === b.x && a.y === b.y) return;
		onGrid(a.x, 'wire x');
		onGrid(a.y, 'wire y');
		onGrid(b.x, 'wire x');
		onGrid(b.y, 'wire y');
		wires.push([sh(a), sh(b)]);
	}

	/** Two segments: across then down ('h') or down then across ('v'). */
	function elbow(a, b, first = 'h') {
		const corner = first === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
		wire(a, corner);
		wire(corner, b);
		return corner;
	}

	/** A run through several points, each leg straight. */
	function route(...points) {
		for (let i = 1; i < points.length; i++) wire(points[i - 1], points[i]);
		return points[points.length - 1];
	}

	/** Names the net at a point; 0 is ground and draws the ground symbol. */
	function flag(at, name) {
		onGrid(at.x, 'flag x');
		onGrid(at.y, 'flag y');
		// ground and the op-amp rails are global: a block never renames them
		flags.push({ at: sh(at), name: name === '0' || name === RAIL_POS || name === RAIL_NEG ? name : nameMap(name) });
	}

	/**
	 * A named net label on its own short stub, so LTspice writes the name
	 * horizontally, on the far side from the wire: `dir` is where the stub
	 * points ('right' or 'left'). Returns the stub's end.
	 */
	function label(at, name, dir = 'right', stub = 32) {
		const end = { x: at.x + (dir === 'left' ? -stub : stub), y: at.y };
		wire(at, end);
		flag(end, name);
		return end;
	}

	/** Ground at a point, with a short stub down so the symbol hangs clear. */
	function ground(at, stub = 32) {
		const end = { x: at.x, y: at.y + stub };
		wire(at, end);
		flag(end, '0');
		return end;
	}

	/** A comment (';') or a SPICE directive ('!'). Several lines become one block. */
	function text(x, y, lines, { directive = false } = {}) {
		const body = (Array.isArray(lines) ? lines : [lines]).map(textSafe).join('\\n');
		const p = sh({ x, y });
		texts.push(`TEXT ${p.x} ${p.y} Left 2 ${directive ? '!' : ';'}${body}`);
	}

	/** The .asc file. LTspice writes CRLF, so the file looks native. */
	function render() {
		const lines = [];
		for (const [a, b] of wires) lines.push(`WIRE ${a.x} ${a.y} ${b.x} ${b.y}`);
		for (const f of flags) lines.push(`FLAG ${f.at.x} ${f.at.y} ${f.name}`);
		for (const s of symbols) {
			lines.push(`SYMBOL ${s.symName} ${s.x} ${s.y} ${s.orient}`);
			for (const [id, w] of Object.entries(s.windows)) lines.push(`WINDOW ${id} ${w[0]} ${w[1]} ${w[2]} 2`);
			lines.push(...symbolAttributes(s.e, { gbw, aol, opamp }));
		}
		lines.push(...texts);
		const body = lines.join('\r\n');
		const [, , x1, y1] = extent(body);
		return ['Version 4', `SHEET 1 ${Math.max(880, Math.ceil(x1 + 64))} ${Math.max(680, Math.ceil(y1 + 64))}`, body].join('\r\n') + '\r\n';
	}

	/** How wide an element's name and value are written, for spacing parts whose values vary. */
	function labelWidth(e) {
		const shown = symbolAttributes(e, { gbw, aol, opamp })
			.map((l) => /^SYMATTR (InstName|Value) (.*)$/.exec(l))
			.filter(Boolean)
			.map((m) => m[2].length);
		return CHAR_W * Math.max(0, ...shown);
	}

	/** What the drawing covers so far, labels and text included. */
	function bounds() {
		const [minX, minY, maxX, maxY] = extent(render());
		return { minX, minY, maxX, maxY };
	}

	/**
	 * Fits every real op-amp into the finished drawing: its labels in the
	 * first arrangement that overlaps nothing, then each rail pin on the
	 * first stub shape that crosses and touches nothing, each tried against
	 * the whole sheet's audit. A shape that cannot be fitted anywhere keeps
	 * the first candidate, so the audit reports it.
	 */
	function fitOpamps() {
		const issues = () => auditAsc(render()).length;
		// every op-amp's text hidden to start with, so each one is fitted
		// against the drawing and the op-amps fitted before it only
		for (const op of realOps) op.sym.windows = { 0: [-16, 16, 'Invisible'], 3: [-16, 16, 'Invisible'] };
		let base = issues();
		for (const op of realOps) {
			const layouts = opampWindows(op.orient, op.labels);
			let fitted = false;
			for (const w of layouts) {
				op.sym.windows = w;
				if (issues() <= base) {
					fitted = true;
					break;
				}
			}
			if (!fitted) op.sym.windows = layouts[0];
			base = issues();
			for (const [pin, name] of [[op.vp, RAIL_POS], [op.vn, RAIL_NEG]]) {
				const away = Math.sign(pin.y - op.out.y) || -1;
				const towards = Math.sign(op.out.x - pin.x) || 1;
				const draw = (path) => {
					let q = pin;
					path.forEach(([axis, len], k) => {
						const next = axis === 'v' ? { x: q.x, y: q.y + away * len } : { x: q.x + towards * len, y: q.y };
						if (k === path.length - 1) label(q, name, next.x > q.x ? 'right' : 'left', Math.abs(next.x - q.x));
						else wire(q, next);
						q = next;
					});
				};
				let done = false;
				for (const path of RAIL_PATHS) {
					const w0 = wires.length;
					const f0 = flags.length;
					draw(path);
					if (issues() <= base) {
						done = true;
						break;
					}
					wires.length = w0;
					flags.length = f0;
				}
				if (!done) draw(RAIL_PATHS[0]);
				base = issues();
			}
		}
	}

	/**
	 * The two rail sources of a sheet with real op-amps, under the drawing:
	 * each stands on ground, its + pin running up to a named stub.
	 */
	function supplies() {
		const sources = supplyElements(opamp).filter((e) => e.kind !== 'LABEL');
		const box = bounds();
		const x = Math.floor(box.minX / GRID) * GRID + 48;
		const y = Math.ceil((box.maxY + 64) / GRID) * GRID;
		sources.forEach((e, k) => {
			const src = place(e, x + 224 * k, y + 32, 'R0');
			ground(src.pins[1]);
			const top = { x: src.pins[0].x, y: src.pins[0].y - 32 };
			wire(src.pins[0], top);
			label(top, e.nodes[0], 'right');
		});
	}

	/**
	 * The comment and the directives, under the drawing: the comment first,
	 * a blank line, then the directives, each block at its real height so
	 * nothing is written over anything. A sheet with real op-amps gets its
	 * rail sources first, and its directives carry the part's subcircuit in
	 * place of LTspice's ideal op-amp library.
	 */
	function notes({ comments = [], directives: given = [] }) {
		let directives = given;
		let subckt = [];
		if (opampCount && model.real) {
			fitOpamps();
			supplies();
			directives = given.filter((d) => d !== '.lib opamp.sub');
			subckt = subcktDirective(opamp);
		}
		const box = bounds();
		const x = Math.floor(box.minX / GRID) * GRID;
		let y = Math.ceil((box.maxY + 48 + LINE_H / 2) / GRID) * GRID;
		if (comments.length) {
			texts.push(`TEXT ${x} ${y} Left 2 ;${comments.map(textSafe).join('\\n')}`);
			y = Math.ceil((y + LINE_H * (comments.length + 1)) / GRID) * GRID;
		}
		if (directives.length) texts.push(`TEXT ${x} ${y} Left 2 !${directives.map(textSafe).join('\\n')}`);
		// the op-amp's subcircuit in a column of its own, right of the rest
		if (subckt.length) {
			const wide = Math.max(0, ...directives.map((l) => l.length));
			const x2 = Math.ceil((x + CHAR_W * wide + 64) / GRID) * GRID;
			texts.push(`TEXT ${x2} ${y} Left 2 !${subckt.map(textSafe).join('\\n')}`);
		}
	}

	return { place, placeFrom, placeOpamp, wire, elbow, route, flag, label, ground, text, block, labelWidth, bounds, notes, render, audit: (opts) => auditAsc(render(), opts) };
}

/** Pin spacing of a two-pin symbol, handy for laying parts end to end. */
export function span(kind) {
	const sym = SYMBOLS[kind];
	const a = sym.pins[sym.order.indexOf(0)];
	const b = sym.pins[sym.order.indexOf(1)];
	return Math.hypot(b.dx - a.dx, b.dy - a.dy);
}

/* ------------------------------------------------ drawing helpers */

const STEP = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

/** A wire of `len` from p; returns its end. */
export function run(sheet, p, dir, len) {
	const [ux, uy] = STEP[dir];
	const q = { x: p.x + ux * len, y: p.y + uy * len };
	sheet.wire(p, q);
	return q;
}

/** A wire of `gap` (48 by default), then a two-pin part; returns the part's far pin. */
export function series(sheet, e, p, dir, { gap = 48, labels } = {}) {
	const q = gap ? run(sheet, p, dir, gap) : p;
	return sheet.placeFrom(e, q, dir, { labels }).pins[1];
}

/** A part hanging down from a rail on a short stub, so its name clears the rail. */
export function hang(sheet, e, at, { stub = 32, labels } = {}) {
	return sheet.placeFrom(e, run(sheet, at, 'down', stub), 'down', { labels });
}

/** Grounds an op-amp input: a short step away from the body (left, or right for a mirrored op-amp), then down to ground. */
export function groundInput(sheet, pin, step = 32, dir = 'left') {
	sheet.ground(run(sheet, pin, dir, step));
}
