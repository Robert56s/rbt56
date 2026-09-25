import { symbols } from 'schematic-symbols';

/**
 * Thin wrapper around the `schematic-symbols` package (real IEC-style
 * component shapes, MIT licensed, used by tscircuit): we use it only for
 * the vetted primitive shapes and port coordinates, and do our own SVG
 * rendering and wire routing so the result has no debug markers and no
 * placeholder {REF}/{VAL} text.
 *
 * Symbol data is in a local "1 unit" space with positive y pointing up;
 * SVG has positive y pointing down, so every y gets negated on the way out.
 */

function primitiveToSvg(p, flipY = false) {
	// y points up in the symbol data and down in SVG; a symbol mirrored
	// top to bottom simply keeps its y
	const Y = (y) => (flipY ? y : -y);
	switch (p.type) {
		case 'path': {
			const d =
				p.points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x} ${Y(pt.y)}`).join(' ') +
				(p.closed ? ' Z' : '');
			const fill = p.closed && p.fill ? 'currentColor' : 'none';
			return `<path d="${d}" fill="${fill}" stroke="currentColor" stroke-width="${p.strokeWidth ?? 0.02}" stroke-linecap="round" stroke-linejoin="round" />`;
		}
		case 'circle':
			return `<circle cx="${p.x}" cy="${Y(p.y)}" r="${p.radius}" fill="${p.fill ? 'currentColor' : 'none'}" ${p.fill ? '' : 'stroke="currentColor" stroke-width="0.02"'} />`;
		case 'box':
			return `<rect x="${p.x}" y="${flipY ? p.y : -p.y - p.height}" width="${p.width}" height="${p.height}" fill="currentColor" />`;
		default:
			return '';
	}
}

/**
 * Places one symbol at (x, y) in the shared canvas, `scale` px per symbol
 * unit. Returns the <g> markup to draw and every port's absolute position,
 * keyed by EVERY label the port has (its number, e.g. "1", and its
 * semantic name when it has one, e.g. "inp1" or "pos") - which labels
 * exist for a given orientation isn't fully consistent across the symbol
 * set, so layout code should use whichever key reads best per component.
 *
 * `flipY` mirrors the symbol top to bottom: an op-amp then has its - input
 * on top, the way most textbooks draw an inverting stage.
 */
export function placeSymbol(name, x, y, scale = 48, { flipY = false } = {}) {
	const sym = symbols[name];
	if (!sym) throw new Error(`Unknown schematic symbol: ${name}`);
	const inner = sym.primitives
		.filter((p) => p.type !== 'text')
		.map((p) => primitiveToSvg(p, flipY))
		.join('');
	// data-symbol is not used for rendering; it lets scripts/check-schematics.mjs
	// recover each placed symbol's name (and so its port positions) from the
	// generated SVG when it audits every diagram's wiring geometry.
	const svg = `<g transform="translate(${x} ${y}) scale(${scale})" data-symbol="${name}${flipY ? ':flipY' : ''}">${inner}</g>`;
	const ports = {};
	for (const port of sym.ports) {
		const abs = { x: x + port.x * scale, y: flipY ? y + port.y * scale : y - port.y * scale };
		for (const key of port.labels) ports[key] = abs;
	}
	return { svg, ports };
}

/** An orthogonal (horizontal-then-vertical, or vertical-then-horizontal) wire between two points. */
export function elbow(a, b, bend = 'h') {
	const mid = bend === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
	return `<path d="M${a.x} ${a.y} L${mid.x} ${mid.y} L${b.x} ${b.y}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />`;
}

/** A straight wire between two points (already aligned on one axis). */
export function wire(a, b) {
	return `<path d="M${a.x} ${a.y} L${b.x} ${b.y}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />`;
}

export function dot(p, r = 3) {
	return `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="currentColor" />`;
}

const JOIN_EPS = 0.75;

function samePoint(p, q, tol = JOIN_EPS) {
	return Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol;
}

function distanceToSegment(p, seg) {
	const dx = seg.b.x - seg.a.x;
	const dy = seg.b.y - seg.a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / len2));
	return { d: Math.hypot(p.x - (seg.a.x + t * dx), p.y - (seg.a.y + t * dy)), t };
}

function directionKey(dx, dy) {
	const len = Math.hypot(dx, dy) || 1;
	return `${Math.round((dx / len) * 10)},${Math.round((dy / len) * 10)}`;
}

/**
 * Derives the set of points where a junction dot belongs, from the actual
 * wire graph: a dot is drawn only where three or more distinct wire
 * directions meet (or two wires plus a component pin), never at a plain
 * corner (two directions) or a simple pin-to-wire connection. This replaces
 * hand-placing dots, which drifted out of sync with the wiring and left
 * some real junctions undotted and some corners wrongly dotted.
 */
export function junctions(segments, ports = []) {
	const candidates = new Map();
	const consider = (p) => {
		const k = `${Math.round(p.x * 2) / 2},${Math.round(p.y * 2) / 2}`;
		if (!candidates.has(k)) candidates.set(k, p);
	};
	for (const s of segments) {
		consider(s.a);
		consider(s.b);
	}
	for (const p of ports) consider(p);

	const live = segments.filter((s) => !samePoint(s.a, s.b));
	const out = [];
	for (const p of candidates.values()) {
		const dirs = new Set();
		for (const s of live) {
			if (samePoint(s.a, p)) dirs.add(directionKey(s.b.x - s.a.x, s.b.y - s.a.y));
			else if (samePoint(s.b, p)) dirs.add(directionKey(s.a.x - s.b.x, s.a.y - s.b.y));
			else {
				const { d, t } = distanceToSegment(p, s);
				if (d <= JOIN_EPS && t > 0.001 && t < 0.999) {
					dirs.add(directionKey(s.b.x - s.a.x, s.b.y - s.a.y));
					dirs.add(directionKey(s.a.x - s.b.x, s.a.y - s.b.y));
				}
			}
		}
		let count = dirs.size;
		if (count > 0 && ports.some((q) => samePoint(q, p, 1.5))) count += 1;
		if (count >= 3) out.push(p);
	}
	return out;
}

/**
 * A small accumulator for one schematic: records every wire segment as it is
 * drawn so the junction dots can be computed from the finished graph instead
 * of placed by hand. Use net.wire()/net.elbow() in place of the bare
 * wire()/elbow() helpers, then net.svg() for the wires and net.dots(ports)
 * for the dots.
 */
export function createNet() {
	const wires = [];
	const segments = [];
	return {
		wire(a, b) {
			wires.push(wire(a, b));
			segments.push({ a, b });
			return this;
		},
		elbow(a, b, bend = 'h') {
			const mid = bend === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
			wires.push(elbow(a, b, bend));
			// When the elbow degenerates to a straight line (a and b already
			// share the bend axis), one half is zero-length - skip it so it
			// does not inject a spurious "no direction" into junction counting.
			if (!samePoint(a, mid)) segments.push({ a, b: mid });
			if (!samePoint(mid, b)) segments.push({ a: mid, b });
			return this;
		},
		svg() {
			return wires.join('');
		},
		dots(ports = []) {
			return junctions(segments, ports)
				.map((p) => dot(p))
				.join('');
		}
	};
}

/** Flattens every placed symbol's port objects into a single array of {x,y} points. */
export function portPoints(...placed) {
	const pts = [];
	for (const sym of placed) {
		const seen = new Set();
		for (const p of Object.values(sym.ports)) {
			const k = `${p.x},${p.y}`;
			if (seen.has(k)) continue;
			seen.add(k);
			pts.push(p);
		}
	}
	return pts;
}

export function label(text, x, y, { anchor = 'start', cls = 'lbl' } = {}) {
	const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
	return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${esc}</text>`;
}
