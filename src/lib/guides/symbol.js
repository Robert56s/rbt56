import { symbols } from 'schematic-symbols';
import { placeSymbol } from '../filter/schematic';

/**
 * One schematic symbol from `schematic-symbols`, drawn on its own with its
 * terminals named: { svg, viewBox, ports }. The box comes from the symbol's
 * own primitives (some, like the Darlington pair, are not centred on their
 * origin), plus room for the labels.
 *   name     the symbol, e.g. 'npn_bipolar_transistor_down'
 *   labels   { portKey: 'C', ... }, a port's key being any of its labels
 *   flipY    mirror top to bottom (a PNP drawn with its emitter on top)
 *   light    add two arrows of incoming light (a phototransistor)
 */
export function symbolDrawing(name, { labels = {}, flipY = false, light = false, scale = 64 } = {}) {
	const sym = symbols[name];
	if (!sym) throw new Error(`Unknown schematic symbol: ${name}`);
	const placed = placeSymbol(name, 0, 0, scale, { flipY });

	// the primitives' extent in page units (y flips unless flipY)
	const xs = [];
	const ys = [];
	const Y = (y) => (flipY ? y : -y) * scale;
	for (const p of sym.primitives) {
		if (p.type === 'path') for (const q of p.points) xs.push(q.x * scale), ys.push(Y(q.y));
		if (p.type === 'circle') xs.push((p.x - p.radius) * scale, (p.x + p.radius) * scale), ys.push(Y(p.y) - p.radius * scale, Y(p.y) + p.radius * scale);
	}
	for (const port of Object.values(placed.ports)) xs.push(port.x), ys.push(port.y);
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
	const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

	let extra = '';
	if (light) {
		// two arrows aimed at the base region, from the upper left
		const ax = Math.min(...xs) - 6;
		const ay = Math.min(...ys) + 4;
		for (const d of [0, 14]) {
			const x0 = ax - 18 + d;
			const y0 = ay - 16 + d * 0.2;
			const x1 = x0 + 15;
			const y1 = y0 + 13;
			extra += `<path d="M${x0} ${y0} L${x1} ${y1}" stroke="currentColor" stroke-width="1.4" fill="none"/>`;
			extra += `<path d="M${x1} ${y1} l-6.5 -1.2 l3.6 -4.2 z" fill="currentColor"/>`;
			xs.push(x0);
			ys.push(y0);
		}
	}

	// labels sit beyond each port, away from the middle of the symbol
	let text = '';
	const seen = new Set();
	for (const [key, label] of Object.entries(labels)) {
		const port = placed.ports[key];
		if (!port || seen.has(`${port.x},${port.y}`)) continue;
		seen.add(`${port.x},${port.y}`);
		const dx = port.x - cx;
		const dy = port.y - cy;
		const horizontal = Math.abs(dx) > Math.abs(dy);
		const tx = horizontal ? port.x + Math.sign(dx) * 7 : port.x + 7;
		const ty = horizontal ? port.y - 5 : port.y + Math.sign(dy) * 4 + (dy > 0 ? 9 : -2);
		const anchor = horizontal ? (dx > 0 ? 'start' : 'end') : 'start';
		text += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" class="pin">${label}</text>`;
		xs.push(tx + (anchor === 'end' ? -12 : anchor === 'start' ? 14 : 0), tx);
		ys.push(ty - 11, ty + 3);
	}

	const pad = 4;
	const x0 = Math.min(...xs) - pad;
	const y0 = Math.min(...ys) - pad;
	const w = Math.max(...xs) - x0 + pad;
	const h = Math.max(...ys) - y0 + pad;
	return { svg: placed.svg + extra + text, viewBox: `${x0} ${y0} ${w} ${h}`, ports: placed.ports };
}
