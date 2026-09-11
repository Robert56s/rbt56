// Geometry audit of every generated circuit schematic.
//
// Runs the real diagram builders (src/lib/filter/circuits.js and
// src/lib/modulation/circuits.js), parses the SVG they return, and checks:
//
//   body      a wire runs through a component's drawn body (not just its pin)
//   pin       a wire passes through a pin it is not connected to
//   overlap   two wires of DIFFERENT nets lie on the same line (read as one wire)
//   crossing  two wires of different nets cross (needs a routing change)
//   dot       a real junction (3+ things meeting) has no dot, or a dot sits
//             where nothing branches
//   label     label text is drawn over a wire, a component's ink or another label
//   diagonal  a wire is neither horizontal nor vertical
//   viewbox   something is drawn outside the diagram's viewBox
//
// Usage:  node --import ./scripts/resolve-ext.mjs scripts/check-schematics.mjs
// Exits non-zero when any bug-level issue is found.

import { symbols } from 'schematic-symbols';
import * as filter from '../src/lib/filter/circuits.js';
import * as modulation from '../src/lib/modulation/circuits.js';

const CHAR_W = 6.6; // 11px monospace
const LABEL_ASCENT = 11;
const LABEL_DESCENT = 3;
const EPS = 0.75;

// ---------------------------------------------------------------- parsing

function num(s) {
	return Number(s);
}

function parsePathPoints(d) {
	const pts = [];
	const re = /[ML]\s*([-\d.e]+)[\s,]+([-\d.e]+)/g;
	let m;
	while ((m = re.exec(d))) pts.push({ x: num(m[1]), y: num(m[2]) });
	return pts;
}

function parseDiagram(svg) {
	const parts = { symbols: [], wires: [], dots: [], labels: [] };

	const gRe = /<g transform="translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)" data-symbol="([^"]+)">([\s\S]*?)<\/g>/g;
	let rest = svg.replace(gRe, (_, tx, ty, s, name, inner) => {
		const X = num(tx);
		const Y = num(ty);
		const S = num(s);
		const segs = [];
		const pts = [];
		for (const m of inner.matchAll(/<path d="([^"]+)"/g)) {
			const local = parsePathPoints(m[1]);
			const abs = local.map((p) => ({ x: X + p.x * S, y: Y + p.y * S }));
			for (let i = 1; i < abs.length; i++) segs.push({ a: abs[i - 1], b: abs[i] });
			if (/ Z"/.test(m[0]) && abs.length > 2) segs.push({ a: abs[abs.length - 1], b: abs[0] });
			pts.push(...abs);
		}
		for (const m of inner.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)) {
			const c = { x: X + num(m[1]) * S, y: Y + num(m[2]) * S };
			const r = num(m[3]) * S;
			pts.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
			segs.push(
				{ a: { x: c.x - r, y: c.y - r }, b: { x: c.x + r, y: c.y - r } },
				{ a: { x: c.x + r, y: c.y - r }, b: { x: c.x + r, y: c.y + r } },
				{ a: { x: c.x + r, y: c.y + r }, b: { x: c.x - r, y: c.y + r } },
				{ a: { x: c.x - r, y: c.y + r }, b: { x: c.x - r, y: c.y - r } }
			);
		}
		for (const m of inner.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)) {
			const x0 = X + num(m[1]) * S;
			const y0 = Y + num(m[2]) * S;
			const x1 = x0 + num(m[3]) * S;
			const y1 = y0 + num(m[4]) * S;
			pts.push({ x: x0, y: y0 }, { x: x1, y: y1 });
			segs.push({ a: { x: x0, y: y0 }, b: { x: x1, y: y0 } }, { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } });
			segs.push({ a: { x: x1, y: y1 }, b: { x: x0, y: y1 } }, { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } });
		}
		const sym = symbols[name];
		const ports = sym.ports.map((p) => ({
			label: p.labels[p.labels.length - 1],
			x: X + p.x * S,
			y: Y - p.y * S
		}));
		const bbox = boxOf(pts);
		parts.symbols.push({ name, X, Y, S, segs, ports, bbox });
		return '';
	});

	for (const m of rest.matchAll(/<path d="([^"]+)"[^>]*stroke-width="1.6"/g)) {
		const pts = parsePathPoints(m[1]);
		for (let i = 1; i < pts.length; i++) {
			const a = pts[i - 1];
			const b = pts[i];
			if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue; // zero-length, draws nothing
			parts.wires.push({ a, b });
		}
	}
	for (const m of rest.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="3"/g)) {
		parts.dots.push({ x: num(m[1]), y: num(m[2]) });
	}
	for (const m of rest.matchAll(/<text x="([^"]+)" y="([^"]+)" text-anchor="([^"]+)" class="([^"]+)">([^<]*)<\/text>/g)) {
		const text = m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<');
		const x = num(m[1]);
		const y = num(m[2]);
		const w = text.length * CHAR_W;
		const x0 = m[3] === 'end' ? x - w : m[3] === 'middle' ? x - w / 2 : x;
		parts.labels.push({ text, box: { x0, x1: x0 + w, y0: y - LABEL_ASCENT, y1: y + LABEL_DESCENT } });
	}
	return parts;
}

// --------------------------------------------------------------- geometry

function boxOf(pts) {
	const xs = pts.map((p) => p.x);
	const ys = pts.map((p) => p.y);
	return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function same(p, q, tol = EPS) {
	return Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol;
}

function orient(seg) {
	const dx = Math.abs(seg.b.x - seg.a.x);
	const dy = Math.abs(seg.b.y - seg.a.y);
	if (dy <= 2 && dx > dy) return 'h';
	if (dx <= 2 && dy > dx) return 'v';
	return 'd';
}

/** Length of the part of segment ab that lies strictly inside box (Liang-Barsky). */
function lengthInside(seg, box) {
	const { a, b } = seg;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	let t0 = 0;
	let t1 = 1;
	const checks = [
		[-dx, a.x - box.x0],
		[dx, box.x1 - a.x],
		[-dy, a.y - box.y0],
		[dy, box.y1 - a.y]
	];
	for (const [p, q] of checks) {
		if (p === 0) {
			if (q < 0) return 0;
			continue;
		}
		const t = q / p;
		if (p < 0) t0 = Math.max(t0, t);
		else t1 = Math.min(t1, t);
		if (t0 > t1) return 0;
	}
	return (t1 - t0) * Math.hypot(dx, dy);
}

/** Distance from point p to segment ab, and where along it (0..1). */
function distToSeg(p, seg) {
	const { a, b } = seg;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
	const cx = a.x + t * dx;
	const cy = a.y + t * dy;
	return { d: Math.hypot(p.x - cx, p.y - cy), t };
}

function segBox(seg) {
	return boxOf([seg.a, seg.b]);
}

function boxesOverlap(a, b, tol = 0) {
	return a.x0 < b.x1 - tol && a.x1 > b.x0 + tol && a.y0 < b.y1 - tol && a.y1 > b.y0 + tol;
}

function segIntersectsBox(seg, box) {
	return lengthInside(seg, box) > 0.5 || (boxesOverlap(segBox(seg), box) && lengthInside(seg, box) > 0);
}

// ----------------------------------------------------------------- checks

function checkDiagram(name, diagram) {
	const issues = [];
	const bug = (kind, msg) => issues.push({ level: 'bug', kind, msg });
	const note = (kind, msg) => issues.push({ level: 'note', kind, msg });
	const fmt = (p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`;

	const { symbols: syms, wires, dots, labels } = parseDiagram(diagram.svg);

	// --- diagonal wires
	for (const w of wires) {
		if (orient(w) === 'd') bug('diagonal', `wire ${fmt(w.a)}-${fmt(w.b)} is neither horizontal nor vertical`);
	}

	// --- wires through a component body / through a foreign pin
	const allPorts = syms.flatMap((s) => s.ports.map((p) => ({ ...p, sym: s.name })));
	for (const w of wires) {
		for (const s of syms) {
			const inner = { x0: s.bbox.x0 + 1, x1: s.bbox.x1 - 1, y0: s.bbox.y0 + 1, y1: s.bbox.y1 - 1 };
			if (inner.x1 <= inner.x0 || inner.y1 <= inner.y0) continue;
			const len = lengthInside(w, inner);
			if (len > 2) bug('body', `wire ${fmt(w.a)}-${fmt(w.b)} runs ${len.toFixed(1)}px through the body of ${s.name} [${fmt({ x: s.bbox.x0, y: s.bbox.y0 })}-${fmt({ x: s.bbox.x1, y: s.bbox.y1 })}]`);
		}
		for (const p of allPorts) {
			if (same(p, w.a, 1.5) || same(p, w.b, 1.5)) continue;
			const { d, t } = distToSeg(p, w);
			if (d <= 1 && t > 0.02 && t < 0.98) bug('pin', `wire ${fmt(w.a)}-${fmt(w.b)} passes through pin ${p.label} of ${p.sym} at ${fmt(p)} without connecting to it`);
		}
	}

	// --- connectivity (nets): endpoints joined, T-touches joined
	const parent = new Map();
	const key = (p) => `${Math.round(p.x * 2) / 2},${Math.round(p.y * 2) / 2}`;
	const find = (k) => {
		while (parent.get(k) !== k) {
			parent.set(k, parent.get(parent.get(k)));
			k = parent.get(k);
		}
		return k;
	};
	const add = (k) => {
		if (!parent.has(k)) parent.set(k, k);
	};
	const union = (a, b) => {
		a = find(a);
		b = find(b);
		if (a !== b) parent.set(a, b);
	};
	for (const w of wires) {
		w.ka = key(w.a);
		w.kb = key(w.b);
		add(w.ka);
		add(w.kb);
		union(w.ka, w.kb);
	}
	const touches = []; // endpoint landing on another wire's interior
	for (const w of wires) {
		for (const end of [w.a, w.b]) {
			for (const o of wires) {
				if (o === w) continue;
				const { d, t } = distToSeg(end, o);
				if (d <= EPS && t > 0.001 && t < 0.999) {
					union(key(end), o.ka);
					touches.push({ p: end, on: o });
				}
			}
		}
	}
	const net = (w) => find(w.ka);

	// --- overlaps and crossings between different nets
	for (let i = 0; i < wires.length; i++) {
		for (let j = i + 1; j < wires.length; j++) {
			const w = wires[i];
			const o = wires[j];
			if (net(w) === net(o)) continue;
			const ow = orient(w);
			const oo = orient(o);
			const bw = segBox(w);
			const bo = segBox(o);
			if (ow === oo && ow !== 'd') {
				const colinear = ow === 'h' ? Math.abs(w.a.y - o.a.y) <= 1 : Math.abs(w.a.x - o.a.x) <= 1;
				const lo = ow === 'h' ? Math.max(bw.x0, bo.x0) : Math.max(bw.y0, bo.y0);
				const hi = ow === 'h' ? Math.min(bw.x1, bo.x1) : Math.min(bw.y1, bo.y1);
				if (colinear && hi - lo > 1) bug('overlap', `wires of different nets overlap for ${(hi - lo).toFixed(1)}px: ${fmt(w.a)}-${fmt(w.b)} and ${fmt(o.a)}-${fmt(o.b)}`);
			} else if (ow !== 'd' && oo !== 'd') {
				const h = ow === 'h' ? w : o;
				const v = ow === 'h' ? o : w;
				const hb = segBox(h);
				const vb = segBox(v);
				const x = v.a.x;
				const y = h.a.y;
				const insideH = x > hb.x0 + 1 && x < hb.x1 - 1;
				const insideV = y > vb.y0 + 1 && y < vb.y1 - 1;
				// A perpendicular crossing of two unconnected nets is legal in a
				// schematic (crossing without a dot = not connected), so this is
				// a note, not a failure - but still worth minimizing.
				if (insideH && insideV) note('crossing', `wires of different nets cross at (${x.toFixed(1)},${y.toFixed(1)}): ${fmt(h.a)}-${fmt(h.b)} and ${fmt(v.a)}-${fmt(v.b)}`);
			}
		}
	}

	// --- junction dots
	const candidates = new Map();
	const consider = (p) => {
		const k = key(p);
		if (!candidates.has(k)) candidates.set(k, p);
	};
	for (const w of wires) {
		consider(w.a);
		consider(w.b);
	}
	for (const p of allPorts) consider(p);
	for (const t of touches) consider(t.p);

	const dirKey = (dx, dy) => {
		const len = Math.hypot(dx, dy) || 1;
		return `${Math.round((dx / len) * 10)},${Math.round((dy / len) * 10)}`;
	};
	for (const p of candidates.values()) {
		const dirs = new Set();
		for (const w of wires) {
			if (same(w.a, p)) dirs.add(dirKey(w.b.x - w.a.x, w.b.y - w.a.y));
			else if (same(w.b, p)) dirs.add(dirKey(w.a.x - w.b.x, w.a.y - w.b.y));
			else {
				const { d, t } = distToSeg(p, w);
				if (d <= EPS && t > 0.001 && t < 0.999) {
					dirs.add(dirKey(w.b.x - w.a.x, w.b.y - w.a.y));
					dirs.add(dirKey(w.a.x - w.b.x, w.a.y - w.b.y));
				}
			}
		}
		let count = dirs.size;
		const onPort = allPorts.find((q) => same(q, p, 1.5));
		if (onPort && count > 0) count += 1;
		const hasDot = dots.some((d) => same(d, p, 1.5));
		if (count >= 3 && !hasDot) bug('dot', `junction at ${fmt(p)} (${count} things meet${onPort ? `, incl. pin ${onPort.label} of ${onPort.sym}` : ''}) has no dot`);
		if (count < 3 && hasDot) bug('dot', `dot at ${fmt(p)} but only ${count} thing(s) meet there`);
	}
	for (const d of dots) {
		if (![...candidates.values()].some((p) => same(p, d, 1.5))) bug('dot', `dot at ${fmt(d)} is not on any wire endpoint or pin`);
	}

	// --- labels over ink
	for (const lb of labels) {
		for (const w of wires) {
			if (segIntersectsBox(w, lb.box)) bug('label', `label "${lb.text}" is drawn over wire ${fmt(w.a)}-${fmt(w.b)}`);
		}
		for (const s of syms) {
			for (const seg of s.segs) {
				if (segIntersectsBox(seg, lb.box)) {
					bug('label', `label "${lb.text}" is drawn over the ink of ${s.name}`);
					break;
				}
			}
		}
		for (const other of labels) {
			if (other === lb) continue;
			if (boxesOverlap(lb.box, other.box) && labels.indexOf(other) > labels.indexOf(lb)) bug('label', `labels "${lb.text}" and "${other.text}" overlap`);
		}
	}

	// --- viewBox
	const [vx, vy, vw, vh] = diagram.viewBox.split(' ').map(Number);
	const view = { x0: vx, x1: vx + vw, y0: vy, y1: vy + vh };
	const everything = [
		...syms.map((s) => s.bbox),
		...wires.map(segBox),
		...labels.map((l) => l.box)
	];
	for (const b of everything) {
		if (b.x0 < view.x0 - 0.5 || b.x1 > view.x1 + 0.5 || b.y0 < view.y0 - 0.5 || b.y1 > view.y1 + 0.5) {
			note('viewbox', `element [${b.x0.toFixed(0)},${b.y0.toFixed(0)}-${b.x1.toFixed(0)},${b.y1.toFixed(0)}] is outside viewBox ${diagram.viewBox}`);
			break;
		}
	}

	return { name, issues, counts: { symbols: syms.length, wires: wires.length, dots: dots.length, labels: labels.length } };
}

// ------------------------------------------------------------------ cases

const CASES = [
	['filter/buildMfbDiagram', () => filter.buildMfbDiagram({ R1: 11000, R2: 5600, R3: 11000, C1: 1e-8, C2: 1e-9 })],
	['filter/buildSallenKeyDiagram', () => filter.buildSallenKeyDiagram({ R1: 11000, R2: 11000, Ctop: 2.2e-8, Cbottom: 1e-8 })],
	['filter/buildMfbHpDiagram', () => filter.buildMfbHpDiagram({ C1: 1e-9, C2: 1e-9, C3: 1e-9, R1: 75000, R2: 336000 })],
	['filter/buildSallenKeyHpDiagram', () => filter.buildSallenKeyHpDiagram({ C1: 1e-8, C2: 1e-8, Rtop: 22000, Rbottom: 11000 })],
	['filter/buildFirstOrderHpDiagram', () => filter.buildFirstOrderHpDiagram({ R: 16000, C: 1e-8 }, 1.6e-4)],
	['filter/buildFirstOrderDiagram', () => filter.buildFirstOrderDiagram({ R: 16000, C: 1e-8 }, 1.6e-4)],
	['filter/buildSummingAmpDiagram', () => filter.buildSummingAmpDiagram(10000)],
	['modulation/buildJfetGainCellDiagram', () => modulation.buildJfetGainCellDiagram({ rb: 13600 })],
	['modulation/buildGainStageDiagram', () => modulation.buildGainStageDiagram({ rtop: 8200, rbottom: 10000 })],
	['modulation/buildHighPassDiagram', () => modulation.buildHighPassDiagram({ r: 100000, c: 2.2e-7 })],
	['modulation/buildSummerDiagram(n=2)', () => modulation.buildSummerDiagram({ inputs: ['x_m(t) (AC)', 'V_bias (DC)'], r: 10000 })],
	['modulation/buildSummerDiagram(n=3)', () => modulation.buildSummerDiagram({ inputs: ['x_p(t)', 'x_m(t)', 'V_DC (bias)'], r: 10000 })],
	['modulation/buildDividerDiagram', () => modulation.buildDividerDiagram({ top: 51000, bottom: 10000, vcc: 12 })],
	['modulation/buildDiodeTankDiagram', () => modulation.buildDiodeTankDiagram({ l: 1e-3, c: 1.5e-8, r: 4300 })],
	['modulation/buildPrecisionRectifierDiagram', () => modulation.buildPrecisionRectifierDiagram({ r1: 10000, r2: 10000, r3: 10000 })],
	['modulation/buildEnvelopeLowPassDiagram', () => modulation.buildEnvelopeLowPassDiagram({ R1: 11000, R2: 11000, Ctop: 2.2e-8, Cbottom: 1e-8 })]
];

let bugs = 0;
for (const [name, build] of CASES) {
	const result = checkDiagram(name, build());
	const bad = result.issues.filter((i) => i.level === 'bug');
	bugs += bad.length;
	const c = result.counts;
	console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'}  ${name}  (${c.symbols} symbols, ${c.wires} wire segments, ${c.dots} dots, ${c.labels} labels)`);
	for (const i of result.issues) console.log(`      ${i.level === 'bug' ? '!' : '-'} [${i.kind}] ${i.msg}`);
}
console.log();
console.log(bugs === 0 ? 'all schematics clean' : `${bugs} issue(s) found`);
process.exit(bugs === 0 ? 0 : 1);
