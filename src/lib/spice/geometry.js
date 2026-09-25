/**
 * What an LTspice schematic looks like on screen, as boxes, so a drawing
 * can be checked for overlaps without opening LTspice.
 *
 * Text, measured on LTspice 26 screenshots at font size 2: one line is 28
 * units high and centred on its anchor, a character is 11 to 12 units
 * wide (12 is used), and a TEXT item starts exactly at its x. Symbol
 * bodies come from the shipped .asy files. Attribute windows follow the
 * conventions LTspice's own editor writes when a part is rotated,
 * tallied over the 4334 example schematics it ships (a horizontal
 * resistor, R90, is saved with its name above and its value below, both
 * horizontal: WINDOW 0 0 56 VBottom 2 and WINDOW 3 32 56 VTop 2).
 *
 * audit() reads a .asc back and lists everything that would look wrong:
 * text over text, text over a part or a wire, a wire through a part, two
 * parts touching or too close, a label LTspice would draw vertically, a
 * wire end left hanging, and nets that cross.
 */

import { ORIENT } from './core';

export const CHAR_W = 12;
export const LINE_H = 28;

/**
 * Body boxes [x0, y0, x1, y1] in the symbol's own frame (several boxes
 * trace a triangle or a circle closely enough that a label may sit just
 * off its edge), pins, and the .asy default windows.
 */
const circle = (cx, cy) => [
	[cx - 32, cy - 12, cx + 32, cy + 12],
	[cx - 28, cy - 24, cx + 28, cy + 24],
	[cx - 20, cy - 32, cx + 20, cy + 32]
];
export const SHAPES = {
	res: { body: [[0, 24, 32, 88]], pins: [[16, 16], [16, 96]], windows: { 0: [36, 40, 'Left'], 3: [36, 76, 'Left'] } },
	cap: { body: [[0, 26, 32, 38]], pins: [[16, 0], [16, 64]], windows: { 0: [24, 8, 'Left'], 3: [24, 56, 'Left'] } },
	ind: { body: [[0, 16, 32, 96]], pins: [[16, 16], [16, 96]], windows: { 0: [36, 40, 'Left'], 3: [36, 80, 'Left'] } },
	voltage: { body: circle(0, 56), pins: [[0, 16], [0, 96]], windows: { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] } },
	bi: { body: circle(0, 40), pins: [[0, 0], [0, 80]], windows: { 0: [24, 0, 'Left'], 3: [24, 80, 'Left'] } },
	bv: { body: circle(0, 56), pins: [[0, 16], [0, 96]], windows: { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] } },
	diode: { body: [[0, 20, 32, 44]], pins: [[16, 0], [16, 64]], windows: { 0: [24, 0, 'Left'], 3: [24, 64, 'Left'] } },
	njf: { body: [[4, 16, 48, 80]], pins: [[48, 0], [0, 64], [48, 96]], windows: { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] } },
	// the triangle from (-32, 32)-(-32, 96) to the tip at (32, 64), in four slices
	'Opamps\\opamp': {
		body: [
			[-32, 32, -16, 96],
			[-16, 40, 0, 88],
			[0, 48, 16, 80],
			[16, 56, 32, 72]
		],
		pins: [[-32, 48], [-32, 80], [32, 64]],
		windows: { 0: [0, 32, 'Left'] }
	},
	// the same triangle, with V+ and V- on 16-unit leads above and below it
	'Opamps\\opamp2': {
		body: [
			[-32, 32, -16, 96],
			[-16, 40, 0, 88],
			[0, 48, 16, 80],
			[16, 56, 32, 72]
		],
		pins: [[-32, 80], [-32, 48], [0, 32], [0, 96], [32, 64]],
		windows: { 0: [16, 32, 'Left'], 3: [16, 96, 'Left'] }
	}
};

/**
 * The windows LTspice's editor writes for a rotated part (from its own
 * example files). Keyed by symbol, then orientation.
 */
export const CANONICAL = {
	res: {
		R90: { 0: [0, 56, 'VBottom'], 3: [32, 56, 'VTop'] },
		M90: { 0: [0, 56, 'VBottom'], 3: [32, 56, 'VTop'] },
		R270: { 0: [32, 56, 'VTop'], 3: [0, 56, 'VBottom'] },
		M270: { 0: [32, 56, 'VTop'], 3: [0, 56, 'VBottom'] },
		R180: { 0: [36, 76, 'Left'], 3: [36, 40, 'Left'] },
		M180: { 0: [36, 76, 'Left'], 3: [36, 40, 'Left'] }
	},
	cap: {
		R90: { 0: [0, 32, 'VBottom'], 3: [32, 32, 'VTop'] },
		M90: { 0: [0, 32, 'VBottom'], 3: [32, 32, 'VTop'] },
		R270: { 0: [32, 32, 'VTop'], 3: [0, 32, 'VBottom'] },
		M270: { 0: [32, 32, 'VTop'], 3: [0, 32, 'VBottom'] },
		R180: { 0: [24, 56, 'Left'], 3: [24, 8, 'Left'] },
		M180: { 0: [24, 56, 'Left'], 3: [24, 8, 'Left'] }
	},
	diode: {
		R90: { 0: [0, 32, 'VBottom'], 3: [32, 32, 'VTop'] },
		M90: { 0: [0, 32, 'VBottom'], 3: [32, 32, 'VTop'] },
		R270: { 0: [32, 32, 'VTop'], 3: [0, 32, 'VBottom'] },
		M270: { 0: [32, 32, 'VTop'], 3: [0, 32, 'VBottom'] },
		R180: { 0: [24, 64, 'Left'], 3: [24, 0, 'Left'] },
		M180: { 0: [24, 64, 'Left'], 3: [24, 0, 'Left'] }
	},
	ind: {
		R90: { 0: [5, 56, 'VBottom'], 3: [32, 56, 'VTop'] },
		R270: { 0: [32, 56, 'VTop'], 3: [5, 56, 'VBottom'] },
		M180: { 0: [36, 80, 'Left'], 3: [36, 40, 'Left'] }
	},
	voltage: {
		R90: { 0: [-32, 56, 'VBottom'], 3: [32, 56, 'VTop'] },
		R270: { 0: [32, 56, 'VTop'], 3: [-32, 56, 'VBottom'] },
		M180: { 0: [24, 96, 'Left'], 3: [24, 16, 'Left'] }
	},
	bi: { M180: { 0: [26, 78, 'Left'], 3: [24, 0, 'Left'] } }
};

/**
 * How a window's justification renders once the part is turned: text is
 * always drawn upright, so a turn by 180 swaps left and right, a mirror
 * swaps the side it mirrors, and a quarter turn makes an ordinary
 * justification vertical (returned as null) and a V one horizontal.
 */
export function renderedJustify(orient, j) {
	const vertical = j.startsWith('V');
	const base = vertical ? j.slice(1) : j;
	const swapLR = { Left: 'Right', Right: 'Left' };
	const swapTB = { Top: 'Bottom', Bottom: 'Top' };
	switch (orient) {
		case 'R0':
			return vertical ? null : base;
		case 'M0':
			return vertical ? null : (swapLR[base] ?? base);
		case 'R180':
			return vertical ? null : (swapLR[base] ?? swapTB[base] ?? base);
		case 'M180':
			return vertical ? null : (swapTB[base] ?? base);
		case 'R90':
		case 'M90':
			return vertical ? base : null;
		case 'R270':
		case 'M270':
			return vertical ? (swapTB[base] ?? base) : null;
		default:
			return null;
	}
}

/** Box of a line or block of horizontal text anchored at (x, y). */
export function textBox(x, y, lines, justify = 'Left') {
	const list = Array.isArray(lines) ? lines : [lines];
	const w = CHAR_W * Math.max(0, ...list.map((l) => String(l).length));
	const h = LINE_H * list.length;
	switch (justify) {
		case 'Right':
			return [x - w, y - LINE_H / 2, x, y - LINE_H / 2 + h];
		case 'Center':
			return [x - w / 2, y - LINE_H / 2, x + w / 2, y - LINE_H / 2 + h];
		case 'Top':
			return [x - w / 2, y, x + w / 2, y + h];
		case 'Bottom':
			return [x - w / 2, y - h, x + w / 2, y];
		default:
			return [x, y - LINE_H / 2, x + w, y - LINE_H / 2 + h];
	}
}

function turnBox([x0, y0, x1, y1], orient, at) {
	const t = ORIENT[orient] ?? ORIENT.R0;
	const pts = [t(x0, y0), t(x1, y0), t(x0, y1), t(x1, y1)];
	const xs = pts.map((p) => p[0] + at.x);
	const ys = pts.map((p) => p[1] + at.y);
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Text each window shows: 0 the instance name, 3 the value. */
function windowText(id, attrs) {
	if (Number(id) === 0) return attrs.InstName ?? '';
	if (Number(id) === 3) return attrs.Value ?? '';
	if (Number(id) === 123) return attrs.SpiceLine ?? '';
	if (Number(id) === 39) return attrs.SpiceLine2 ?? '';
	return '';
}

/**
 * Everything a placed symbol puts on screen: its body box, its pins, and
 * one box per visible window (null box when LTspice would draw it
 * vertically). `windows` are the explicit WINDOW lines, which override
 * the .asy defaults.
 */
export function symbolFootprint({ sym, x, y, orient = 'R0', windows = {}, attrs = {} }) {
	const shape = SHAPES[sym];
	if (!shape) return null;
	const t = ORIENT[orient] ?? ORIENT.R0;
	const bodies = shape.body.map((b) => turnBox(b, orient, { x, y }));
	const body = [Math.min(...bodies.map((b) => b[0])), Math.min(...bodies.map((b) => b[1])), Math.max(...bodies.map((b) => b[2])), Math.max(...bodies.map((b) => b[3]))];
	const pins = shape.pins.map(([px, py]) => {
		const [dx, dy] = t(px, py);
		return { x: x + dx, y: y + dy };
	});
	const merged = { ...shape.windows, ...windows };
	const labels = [];
	for (const [id, w] of Object.entries(merged)) {
		if (!w || w[2] === 'Invisible') continue;
		const text = windowText(id, attrs);
		if (!text) continue;
		const [dx, dy] = t(w[0], w[1]);
		const justify = renderedJustify(orient, w[2]);
		labels.push({ id: Number(id), text, anchor: { x: x + dx, y: y + dy }, justify, box: justify ? textBox(x + dx, y + dy, text, justify) : null });
	}
	return { sym, orient, body, bodies, pins, labels };
}

/* ------------------------------------------------------------ parsing */

/** Reads a .asc into symbols (with their windows and attributes), wires, flags and TEXT items. */
export function readAsc(text) {
	const symbols = [];
	const wires = [];
	const flags = [];
	const texts = [];
	let current = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		const p = line.split(/\s+/);
		if (p[0] === 'SYMBOL') {
			current = { sym: p[1], x: Number(p[2]), y: Number(p[3]), orient: p[4] ?? 'R0', windows: {}, attrs: {} };
			symbols.push(current);
		} else if (p[0] === 'WINDOW' && current) {
			current.windows[p[1]] = [Number(p[2]), Number(p[3]), p[4]];
		} else if (p[0] === 'SYMATTR' && current) {
			current.attrs[p[1]] = p.slice(2).join(' ');
		} else if (p[0] === 'WIRE') {
			const [x1, y1, x2, y2] = p.slice(1, 5).map(Number);
			wires.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
			current = null;
		} else if (p[0] === 'FLAG') {
			flags.push({ at: { x: Number(p[1]), y: Number(p[2]) }, name: p.slice(3).join(' ') });
			current = null;
		} else if (p[0] === 'TEXT') {
			const m = /^TEXT\s+(-?\d+)\s+(-?\d+)\s+(\S+)\s+(\d+)\s+(.*)$/.exec(line);
			if (m) {
				const body = m[5];
				texts.push({ x: Number(m[1]), y: Number(m[2]), justify: m[3], directive: body.startsWith('!'), lines: body.slice(1).split('\\n') });
			}
			current = null;
		}
	}
	return { symbols, wires, flags, texts };
}

/* -------------------------------------------------------------- audit */

const key = (p) => `${p.x},${p.y}`;
const overlaps = (a, b, pad = 0) => a[0] < b[2] - pad && b[0] < a[2] - pad && a[1] < b[3] - pad && b[1] < a[3] - pad;
const grow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];

/** Length of an axis-aligned segment inside a box's interior. */
function lengthInside(s, box) {
	if (s.a.y === s.b.y) {
		const y = s.a.y;
		if (!(y > box[1] && y < box[3])) return 0;
		const lo = Math.max(Math.min(s.a.x, s.b.x), box[0]);
		const hi = Math.min(Math.max(s.a.x, s.b.x), box[2]);
		return Math.max(0, hi - lo);
	}
	if (s.a.x === s.b.x) {
		const x = s.a.x;
		if (!(x > box[0] && x < box[2])) return 0;
		const lo = Math.max(Math.min(s.a.y, s.b.y), box[1]);
		const hi = Math.min(Math.max(s.a.y, s.b.y), box[3]);
		return Math.max(0, hi - lo);
	}
	return 1;
}

function onSegment(p, s) {
	if (s.a.x === s.b.x) return p.x === s.a.x && p.y >= Math.min(s.a.y, s.b.y) && p.y <= Math.max(s.a.y, s.b.y);
	if (s.a.y === s.b.y) return p.y === s.a.y && p.x >= Math.min(s.a.x, s.b.x) && p.x <= Math.max(s.a.x, s.b.x);
	return false;
}

/**
 * Lists what would look wrong in LTspice. Each issue is { kind, detail }.
 *   vertical-label  a window LTspice would draw vertically
 *   text            two texts overlap (labels, flag names, TEXT blocks)
 *   text-on-part    a text lies over a symbol body or a ground symbol
 *   text-on-wire    a wire runs through a text
 *   wire-in-part    a wire runs through a symbol body
 *   parts           two bodies overlap or sit closer than `clearance`
 *   touching        two parts joined pin to pin, with no wire between
 *   loose-end       a wire end that lands on nothing
 *   flag            a named flag LTspice would draw ambiguously
 *   crossing        wires of two nets cross (legal, but worth avoiding)
 */
export function audit(asc, { clearance = 16 } = {}) {
	const { symbols, wires, flags, texts } = readAsc(asc);
	const issues = [];
	const add = (kind, detail) => issues.push({ kind, detail });
	const parts = symbols.map((s) => ({ s, f: symbolFootprint(s) })).filter((p) => p.f);
	const name = (p) => p.s.attrs.InstName ?? p.s.sym;

	// every point a wire end may legally land on
	const pinSet = new Map();
	for (const p of parts) for (const pin of p.f.pins) pinSet.set(key(pin), (pinSet.get(key(pin)) ?? 0) + 1);
	const ends = new Map();
	for (const w of wires) for (const e of [w.a, w.b]) ends.set(key(e), (ends.get(key(e)) ?? 0) + 1);

	// texts on screen: attribute labels, flag names, ground symbols, TEXT blocks
	const texty = [];
	for (const p of parts) {
		for (const l of p.f.labels) {
			if (!l.box) add('vertical-label', `${name(p)} ${l.id === 0 ? 'name' : 'value'} "${l.text}" would be drawn vertically (${p.s.orient})`);
			else texty.push({ what: `${name(p)} "${l.text}"`, box: l.box, owner: p });
		}
	}
	const grounds = [];
	for (const f of flags) {
		if (f.name === '0') {
			grounds.push({ what: 'ground', box: [f.at.x - 16, f.at.y, f.at.x + 16, f.at.y + 16], at: f.at });
			continue;
		}
		const attached = wires.filter((w) => key(w.a) === key(f.at) || key(w.b) === key(f.at));
		const through = wires.filter((w) => key(w.a) !== key(f.at) && key(w.b) !== key(f.at) && onSegment(f.at, w));
		if (attached.length !== 1 || through.length) {
			add('flag', `label ${f.name} at ${key(f.at)} should end a single wire (it has ${attached.length} ending there${through.length ? ' and one running through' : ''})`);
			continue;
		}
		const w = attached[0];
		const other = key(w.a) === key(f.at) ? w.b : w.a;
		if (other.y !== f.at.y) {
			add('flag', `label ${f.name} at ${key(f.at)} ends a vertical wire, so LTspice would write it vertically`);
			continue;
		}
		const toRight = other.x < f.at.x;
		const w0 = CHAR_W * f.name.length;
		const box = toRight ? [f.at.x + 6, f.at.y - LINE_H / 2, f.at.x + 6 + w0, f.at.y + LINE_H / 2] : [f.at.x - 6 - w0, f.at.y - LINE_H / 2, f.at.x - 6, f.at.y + LINE_H / 2];
		texty.push({ what: `label ${f.name}`, box, flag: f });
	}
	for (const t of texts) texty.push({ what: t.directive ? 'directives' : 'comment', box: textBox(t.x, t.y, t.lines, t.justify) });

	// text against text, parts and grounds
	for (let i = 0; i < texty.length; i++) {
		for (let j = i + 1; j < texty.length; j++) if (overlaps(texty[i].box, texty[j].box)) add('text', `${texty[i].what} overlaps ${texty[j].what}`);
		for (const p of parts) if (p.f.bodies.some((b) => overlaps(texty[i].box, b, 1))) add('text-on-part', `${texty[i].what} lies on ${name(p)}`);
		for (const g of grounds) if (overlaps(texty[i].box, g.box)) add('text-on-part', `${texty[i].what} lies on a ground at ${key(g.at)}`);
	}
	// wires through text (a flag's own wire stops short of its name)
	for (const w of wires) {
		for (const t of texty) if (lengthInside(w, t.box) > 0) add('text-on-wire', `wire ${key(w.a)}-${key(w.b)} runs through ${t.what}`);
	}
	// wires through bodies; a wire may start at a part's own pin and leave it
	for (const w of wires) {
		for (const p of parts) {
			const inside = Math.max(...p.f.bodies.map((b) => lengthInside(w, grow(b, 2))));
			if (inside <= 2.5) continue;
			add('wire-in-part', `wire ${key(w.a)}-${key(w.b)} runs through ${name(p)}`);
		}
	}
	// grounds: nothing but their own stub may touch them, or come so close
	// that the triangle's corner seems to sit on another wire
	for (const g of grounds) {
		for (const w of wires) {
			if (key(w.a) === key(g.at) || key(w.b) === key(g.at)) continue;
			if (lengthInside(w, grow(g.box, 8)) > 0) add('text-on-part', `wire ${key(w.a)}-${key(w.b)} runs through or against a ground at ${key(g.at)}`);
		}
		for (const p of parts) if (p.f.bodies.some((b) => overlaps(g.box, b))) add('parts', `a ground at ${key(g.at)} sits on ${name(p)}`);
		for (const h of grounds) if (h !== g && overlaps(g.box, h.box)) add('parts', `grounds at ${key(g.at)} and ${key(h.at)} overlap`);
	}
	// parts against parts
	for (let i = 0; i < parts.length; i++) {
		for (let j = i + 1; j < parts.length; j++) {
			const a = parts[i];
			const b = parts[j];
			if (a.f.bodies.some((ba) => b.f.bodies.some((bb) => overlaps(grow(ba, clearance / 2), grow(bb, clearance / 2))))) add('parts', `${name(a)} and ${name(b)} are closer than ${clearance} units`);
			for (const pa of a.f.pins) for (const pb of b.f.pins) if (key(pa) === key(pb)) add('touching', `${name(a)} and ${name(b)} touch pin to pin at ${key(pa)}, with no wire between`);
		}
	}
	// wire ends that land on nothing, or in the middle of another wire (a
	// junction is always drawn as wires meeting end to end, so the netlist
	// checkers and LTspice agree on it)
	for (const w of wires) {
		for (const e of [w.a, w.b]) {
			const k = key(e);
			const mid = wires.find((o) => o !== w && key(o.a) !== k && key(o.b) !== k && onSegment(e, o));
			if (mid) add('tee', `wire end at ${k} lands in the middle of the wire ${key(mid.a)}-${key(mid.b)}; split it there`);
			if ((ends.get(k) ?? 0) > 1 || pinSet.has(k) || flags.some((f) => key(f.at) === k) || mid) continue;
			add('loose-end', `wire end at ${k} lands on nothing`);
		}
	}
	// crossings between wires: a crossing with no end on the other wire is
	// two nets passing, which LTspice draws without a dot
	for (let i = 0; i < wires.length; i++) {
		for (let j = i + 1; j < wires.length; j++) {
			const h = wires[i].a.y === wires[i].b.y ? wires[i] : wires[j].a.y === wires[j].b.y ? wires[j] : null;
			const v = h === wires[i] ? wires[j] : wires[i];
			if (!h || v.a.x !== v.b.x || h === v) continue;
			const x = v.a.x;
			const y = h.a.y;
			const inH = x > Math.min(h.a.x, h.b.x) && x < Math.max(h.a.x, h.b.x);
			const inV = y > Math.min(v.a.y, v.b.y) && y < Math.max(v.a.y, v.b.y);
			if (inH && inV) add('crossing', `wires cross at ${x},${y}`);
		}
	}
	return issues;
}

/** Everything a drawing covers, text included: where notes can go below it. */
export function extent(asc) {
	const { symbols, wires, flags, texts } = readAsc(asc);
	const box = [Infinity, Infinity, -Infinity, -Infinity];
	const take = (b) => {
		box[0] = Math.min(box[0], b[0]);
		box[1] = Math.min(box[1], b[1]);
		box[2] = Math.max(box[2], b[2]);
		box[3] = Math.max(box[3], b[3]);
	};
	for (const s of symbols) {
		const f = symbolFootprint(s);
		if (!f) continue;
		take(f.body);
		for (const l of f.labels) if (l.box) take(l.box);
	}
	for (const w of wires) take([Math.min(w.a.x, w.b.x), Math.min(w.a.y, w.b.y), Math.max(w.a.x, w.b.x), Math.max(w.a.y, w.b.y)]);
	for (const f of flags) take(f.name === '0' ? [f.at.x - 16, f.at.y, f.at.x + 16, f.at.y + 16] : [f.at.x - 6 - CHAR_W * f.name.length, f.at.y - LINE_H / 2, f.at.x + 6 + CHAR_W * f.name.length, f.at.y + LINE_H / 2]);
	for (const t of texts) take(textBox(t.x, t.y, t.lines, t.justify));
	return box;
}
