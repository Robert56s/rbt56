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
 * wiring can be written in terms of pins rather than coordinates. The
 * check scripts read the result back with parseSchematic and compare it
 * with the netlist, so a drawing that connects anything differently from
 * the netlist is caught, and LTspice's own netlister is run on the file
 * as the final word when it is installed.
 */

import { ORIENT, SYMBOLS, symbolAttributes, textSafe } from './core';

const GRID = 16;

/** Where pin k of a symbol lands, for a placement point and orientation. */
function pinAt(sym, k, x, y, orient) {
	const [dx, dy] = ORIENT[orient](sym.pins[k].dx, sym.pins[k].dy);
	return { x: x + dx, y: y + dy };
}

const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

/**
 * A sheet under construction. Coordinates are LTspice units; anything
 * placed off the 16 grid is refused, since LTspice would not connect it.
 */
export function createSheet({ gbw = '3Meg', aol = '1Meg' } = {}) {
	const symbols = [];
	const wires = [];
	const flags = [];
	const texts = [];
	const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
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
			fn();
		} finally {
			offset = saved.offset;
			nameMap = saved.nameMap;
		}
	}

	const grow = (x, y) => {
		box.minX = Math.min(box.minX, x);
		box.minY = Math.min(box.minY, y);
		box.maxX = Math.max(box.maxX, x);
		box.maxY = Math.max(box.maxY, y);
	};
	const onGrid = (v, what) => {
		if (v % GRID !== 0) throw new Error(`${what} ${v} is off LTspice's 16-unit grid`);
		return v;
	};

	/**
	 * Places an element with its placement point at (x, y). Returns the
	 * pins in the element's own node order, so pins[0] is the node listed
	 * first in `nodes` whatever the symbol's SpiceOrder.
	 */
	function place(e, x, y, orient = 'R0', { windows = [] } = {}) {
		const sym = SYMBOLS[e.kind];
		if (!sym) throw new Error(`no LTspice symbol for kind ${e.kind}`);
		onGrid(x, 'x');
		onGrid(y, 'y');
		const at = sh({ x, y });
		symbols.push({ e, x: at.x, y: at.y, orient, windows });
		// pins are reported in the caller's own (block) coordinates
		const pins = [];
		sym.pins.forEach((_, k) => {
			const p = pinAt(sym, k, x, y, orient);
			pins[sym.order[k]] = p;
			grow(p.x + offset.x, p.y + offset.y);
		});
		// the body is within about 96 units of the placement point
		grow(at.x - 96, at.y - 96);
		grow(at.x + 96, at.y + 96);
		return { e, pins, x, y, orient };
	}

	/**
	 * Places a two-pin element so that its first node's pin sits at `from`
	 * and its second node's pin lies `dir` from it, at the symbol's own
	 * pin spacing. Picks the plain rotation that does it.
	 */
	function placeFrom(e, from, dir) {
		const sym = SYMBOLS[e.kind];
		const [ux, uy] = DIRS[dir];
		const a = sym.pins[sym.order.indexOf(0)];
		const b = sym.pins[sym.order.indexOf(1)];
		for (const orient of ['R0', 'R90', 'R180', 'R270', 'M0', 'M90', 'M180', 'M270']) {
			const [ax, ay] = ORIENT[orient](a.dx, a.dy);
			const [bx, by] = ORIENT[orient](b.dx, b.dy);
			const vx = bx - ax;
			const vy = by - ay;
			const len = Math.hypot(vx, vy);
			if (Math.abs(vx - ux * len) < 1e-9 && Math.abs(vy - uy * len) < 1e-9) {
				return place(e, from.x - ax, from.y - ay, orient);
			}
		}
		throw new Error(`cannot orient ${e.kind} ${dir}`);
	}

	/**
	 * Places an op-amp by where its output pin should be. `flip` puts the
	 * non-inverting input on top (LTspice's symbol has it at the bottom),
	 * `mirror` makes it point left.
	 */
	function placeOpamp(e, out, { flip = false, mirror = false } = {}) {
		const orient = mirror ? (flip ? 'R180' : 'M0') : flip ? 'M180' : 'R0';
		const sym = SYMBOLS.OP;
		const outPin = sym.pins[sym.order.indexOf(2)];
		const [dx, dy] = ORIENT[orient](outPin.dx, outPin.dy);
		return place(e, out.x - dx, out.y - dy, orient);
	}

	/** A straight wire; refuses diagonals since LTspice draws them but nobody wants them. */
	function wire(a, b) {
		if (a.x !== b.x && a.y !== b.y) throw new Error(`diagonal wire from ${a.x},${a.y} to ${b.x},${b.y}`);
		if (a.x === b.x && a.y === b.y) return;
		onGrid(a.x, 'wire x');
		onGrid(a.y, 'wire y');
		onGrid(b.x, 'wire x');
		onGrid(b.y, 'wire y');
		const p = sh(a);
		const q = sh(b);
		wires.push([p, q]);
		grow(p.x, p.y);
		grow(q.x, q.y);
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
	}

	/** Names the net at a point; 0 is ground and draws the ground symbol. */
	function flag(at, name) {
		onGrid(at.x, 'flag x');
		onGrid(at.y, 'flag y');
		const p = sh(at);
		const label = name === '0' ? '0' : nameMap(name);
		flags.push({ at: p, name: label });
		grow(p.x, p.y + (label === '0' ? 32 : 0));
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
		grow(p.x, p.y + 16 * (Array.isArray(lines) ? lines.length : 1));
	}

	function bounds() {
		return { ...box };
	}

	/** The .asc file. LTspice writes CRLF, so the file looks native. */
	function render() {
		const lines = ['Version 4', `SHEET 1 ${Math.max(880, box.maxX + 64)} ${Math.max(680, box.maxY + 64)}`];
		for (const [a, b] of wires) lines.push(`WIRE ${a.x} ${a.y} ${b.x} ${b.y}`);
		for (const f of flags) lines.push(`FLAG ${f.at.x} ${f.at.y} ${f.name}`);
		for (const s of symbols) {
			lines.push(`SYMBOL ${SYMBOLS[s.e.kind].name} ${s.x} ${s.y} ${s.orient}`);
			for (const w of s.windows) lines.push(`WINDOW ${w.id} ${w.x} ${w.y} ${w.align ?? 'Left'} 2`);
			lines.push(...symbolAttributes(s.e, { gbw, aol }));
		}
		lines.push(...texts);
		return lines.join('\r\n') + '\r\n';
	}

	return { place, placeFrom, placeOpamp, wire, elbow, route, flag, ground, text, block, bounds, render };
}

/** Pin spacing of a two-pin symbol, handy for laying parts end to end. */
export function span(kind) {
	const sym = SYMBOLS[kind];
	const a = sym.pins[sym.order.indexOf(0)];
	const b = sym.pins[sym.order.indexOf(1)];
	return Math.hypot(b.dx - a.dx, b.dy - a.dy);
}
