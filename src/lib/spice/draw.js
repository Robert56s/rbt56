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
 */
function windowsFor(symName, orient, labels) {
	const shape = SHAPES[symName];
	const canonical = CANONICAL[symName]?.[orient];
	const out = {};
	if (canonical) Object.assign(out, canonical);
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
 * A sheet under construction. Coordinates are LTspice units; anything
 * placed off the 16 grid is refused, since LTspice would not connect it.
 */
export function createSheet({ gbw = '3Meg', aol = '1Meg' } = {}) {
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
		const sym = SYMBOLS[e.kind];
		if (!sym) throw new Error(`no LTspice symbol for kind ${e.kind}`);
		onGrid(x, 'x');
		onGrid(y, 'y');
		const at = sh({ x, y });
		symbols.push({ e, x: at.x, y: at.y, orient, windows: windowsFor(sym.name, orient, labels) });
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
		const sym = SYMBOLS.OP;
		const orient = mirror ? (flip ? 'R180' : 'M0') : flip ? 'M180' : 'R0';
		const outPin = sym.pins[sym.order.indexOf(2)];
		const [dx, dy] = ORIENT[orient](outPin.dx, outPin.dy);
		return place(e, out.x - dx, out.y - dy, orient, { labels });
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
		flags.push({ at: sh(at), name: name === '0' ? '0' : nameMap(name) });
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
			lines.push(`SYMBOL ${SYMBOLS[s.e.kind].name} ${s.x} ${s.y} ${s.orient}`);
			for (const [id, w] of Object.entries(s.windows)) lines.push(`WINDOW ${id} ${w[0]} ${w[1]} ${w[2]} 2`);
			lines.push(...symbolAttributes(s.e, { gbw, aol }));
		}
		lines.push(...texts);
		const body = lines.join('\r\n');
		const [, , x1, y1] = extent(body);
		return ['Version 4', `SHEET 1 ${Math.max(880, Math.ceil(x1 + 64))} ${Math.max(680, Math.ceil(y1 + 64))}`, body].join('\r\n') + '\r\n';
	}

	/** How wide an element's name and value are written, for spacing parts whose values vary. */
	function labelWidth(e) {
		const shown = symbolAttributes(e, { gbw, aol })
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
	 * The comment and the directives, under the drawing: the comment first,
	 * a blank line, then the directives, each block at its real height so
	 * nothing is written over anything.
	 */
	function notes({ comments = [], directives = [] }) {
		const box = bounds();
		const x = Math.floor(box.minX / GRID) * GRID;
		let y = Math.ceil((box.maxY + 48 + LINE_H / 2) / GRID) * GRID;
		if (comments.length) {
			texts.push(`TEXT ${x} ${y} Left 2 ;${comments.map(textSafe).join('\\n')}`);
			y = Math.ceil((y + LINE_H * (comments.length + 1)) / GRID) * GRID;
		}
		if (directives.length) texts.push(`TEXT ${x} ${y} Left 2 !${directives.map(textSafe).join('\\n')}`);
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
