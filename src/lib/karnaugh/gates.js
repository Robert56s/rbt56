/**
 * Logic-gate symbols (distinctive-shape style: D for AND, shield for OR,
 * triangle plus bubble for NOT), drawn straight into page coordinates.
 * The schematic-symbols package the analog tools use has no logic gates,
 * so these are defined here in the same { svg, ports } shape, and every
 * symbol carries data-ports/data-bbox attributes so scripts/check-
 * schematics.mjs can audit the wiring around them exactly as it does for
 * the analog diagrams.
 *
 * Every gate: inputs on the left edge, spaced PIN apart and centred on y;
 * one output on the right at (x + width, y). Wires must end exactly on a
 * port; a gate's body never crosses its own ports.
 */

const PIN = 14;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"';

function inputYs(y, nIn) {
	return Array.from({ length: nIn }, (_, k) => y - ((nIn - 1) * PIN) / 2 + k * PIN);
}

function wrap(name, ports, bbox, inner) {
	const portList = [...ports.in, ports.out].map((p) => `${p.x},${p.y}`).join(';');
	return `<g data-symbol="${name}" data-ports="${portList}" data-bbox="${bbox.x0},${bbox.y0},${bbox.x1},${bbox.y1}">${inner}</g>`;
}

export function gateHeight(nIn) {
	return Math.max(36, PIN * nIn + 8);
}

/** AND gate with nIn inputs, body from x to x + width, centred on y. */
export function andGate(x, y, nIn) {
	const H = gateHeight(nIn);
	const W = Math.max(46, H / 2 + 16);
	const r = H / 2;
	const ys = inputYs(y, nIn);
	const path = `M ${x} ${y - r} L ${x + W - r} ${y - r} A ${r} ${r} 0 0 1 ${x + W - r} ${y + r} L ${x} ${y + r} Z`;
	const ports = { in: ys.map((py) => ({ x, y: py })), out: { x: x + W, y } };
	const bbox = { x0: x, y0: y - r, x1: x + W, y1: y + r };
	return { name: `and${nIn}`, svg: wrap(`and${nIn}`, ports, bbox, `<path d="${path}" ${STROKE} />`), ports, bbox, width: W, height: H };
}

/**
 * OR gate with nIn inputs. The back is a curve, so each input carries a
 * short stub from the left edge (where its port is) in to the curve; the
 * stubs are part of the symbol, not wires.
 */
export function orGate(x, y, nIn) {
	const H = gateHeight(nIn);
	const W = Math.max(50, H / 2 + 20);
	const r = H / 2;
	const ys = inputYs(y, nIn);
	const bulge = 0.28 * W; // how far the back curve reaches in at mid-height
	const path =
		`M ${x} ${y - r} Q ${x + 0.68 * W} ${y - r} ${x + W} ${y} ` +
		`Q ${x + 0.68 * W} ${y + r} ${x} ${y + r} ` +
		`Q ${x + bulge} ${y} ${x} ${y - r} Z`;
	// back curve is a quadratic Bezier from (x, y-r) via (x+bulge, y) to (x, y+r):
	// X(t) = x + 2 bulge t (1-t), with t = (py - (y - r)) / H
	const stubs = ys
		.map((py) => {
			const t = (py - (y - r)) / H;
			const xb = x + 2 * bulge * t * (1 - t);
			return `<path d="M ${x} ${py} L ${xb.toFixed(2)} ${py}" ${STROKE} />`;
		})
		.join('');
	const ports = { in: ys.map((py) => ({ x, y: py })), out: { x: x + W, y } };
	const bbox = { x0: x, y0: y - r, x1: x + W, y1: y + r };
	return { name: `or${nIn}`, svg: wrap(`or${nIn}`, ports, bbox, `<path d="${path}" ${STROKE} />${stubs}`), ports, bbox, width: W, height: H };
}

/** Inverter: triangle plus bubble, input at (x, y), output at (x + 30, y). */
export function notGate(x, y) {
	const h = 10;
	const w = 22;
	const rb = 4;
	const path = `M ${x} ${y - h} L ${x + w} ${y} L ${x} ${y + h} Z`;
	const bubble = `<circle cx="${x + w + rb}" cy="${y}" r="${rb}" ${STROKE} />`;
	const ports = { in: [{ x, y }], out: { x: x + w + 2 * rb, y } };
	const bbox = { x0: x, y0: y - h, x1: x + w + 2 * rb, y1: y + h };
	return { name: 'not', svg: wrap('not', ports, bbox, `<path d="${path}" ${STROKE} />${bubble}`), ports, bbox, width: w + 2 * rb, height: 2 * h };
}
