import { LAB_KIT } from './filter/eseries';

/**
 * Which component values a design may round its parts to: a preferred
 * series, the lab drawer, or a list of what is actually on hand. The tools
 * that pick parts (filters, AM modulators and demodulator) share this one
 * setting, since it describes the drawer rather than the circuit, and it
 * is kept in this browser between visits.
 *
 * Whatever is chosen becomes { resistorSeries, capacitors }, the shape the
 * part pickers in src/lib/filter/eseries.js and src/lib/modulation/eseries.js
 * take: a series name ('E24', 'E96') or an explicit list of ohms, and null
 * (the usual capacitor grids) or an explicit list of farads.
 */

export const STOCK_CHOICES = [
	{ id: 'E24', label: 'E24 series (standard, 5 %)' },
	{ id: 'E96', label: 'E96 series (1 %)' },
	{ id: 'lab', label: `Lab kit (${LAB_KIT.resistors.length} R, ${LAB_KIT.capacitors.length} C)` },
	{ id: 'custom', label: 'My own list' }
];

const STOCK_KEY = 'rbt56.stock';
// where the filter tool kept it before the setting was shared
const LEGACY_KEY = 'rbt56.filter.stock';

const UNIT = { p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

function trimNum(x) {
	return Number(x.toPrecision(4)).toString();
}

/** Reads "1k, 4.7k, 10k" or "10p 20p 1n" into absolute values, sorted, without repeats. */
export function parseStock(text, kind) {
	const out = [];
	for (const raw of String(text).split(/[\s,;]+/)) {
		if (!raw) continue;
		// the Greek capital omega and the ohm sign are two different characters
		let token = raw.replace(/ohms?/gi, '').replace(/[ΩΩ]/g, '');
		if (kind === 'capacitor') token = token.replace(/[fF]$/, '');
		const m = /^([0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)(meg|[pnumkKMG])?$/.exec(token);
		if (!m) continue;
		const mult = !m[2] ? 1 : m[2] === 'meg' ? 1e6 : (UNIT[m[2]] ?? 1);
		const value = Number(m[1]) * mult;
		if (Number.isFinite(value) && value > 0) out.push(value);
	}
	return [...new Set(out)].sort((a, b) => a - b);
}

/** The inverse, so the boxes can be prefilled and round-tripped. */
export function formatStock(values, kind) {
	return values
		.map((v) => {
			if (kind === 'capacitor') {
				if (v >= 1e-6) return trimNum(v * 1e6) + 'u';
				if (v >= 1e-9) return trimNum(v * 1e9) + 'n';
				return trimNum(v * 1e12) + 'p';
			}
			if (v >= 1e6) return trimNum(v / 1e6) + 'M';
			if (v >= 1e3) return trimNum(v / 1e3) + 'k';
			return trimNum(v);
		})
		.join(', ');
}

/** What a fresh visit starts with: E24, and the lab drawer in the boxes as a starting list. */
export function defaultStock() {
	return { stock: 'E24', resistorText: formatStock(LAB_KIT.resistors, 'resistor'), capacitorText: formatStock(LAB_KIT.capacitors, 'capacitor') };
}

/**
 * The setting as the pickers take it. An empty custom box falls back to the
 * lab drawer for that kind, rather than leaving nothing to pick from.
 */
export function componentOptions(stock, resistorText, capacitorText) {
	if (stock === 'lab') return { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors };
	if (stock === 'custom') {
		const resistors = parseStock(resistorText, 'resistor');
		const capacitors = parseStock(capacitorText, 'capacitor');
		return { resistorSeries: resistors.length ? resistors : LAB_KIT.resistors, capacitors: capacitors.length ? capacitors : LAB_KIT.capacitors };
	}
	return { resistorSeries: stock === 'E96' ? 'E96' : 'E24', capacitors: null };
}

/** Whether the setting narrows the search to a list rather than a full series. */
export function isRestricted(stock) {
	return stock === 'lab' || stock === 'custom';
}

/** The saved setting, or null when there is none or storage is blocked. */
export function loadStock() {
	try {
		const saved = JSON.parse(localStorage.getItem(STOCK_KEY) ?? localStorage.getItem(LEGACY_KEY) ?? 'null');
		if (!saved || typeof saved !== 'object') return null;
		const out = {};
		if (STOCK_CHOICES.some((c) => c.id === saved.stock)) out.stock = saved.stock;
		if (typeof saved.resistorText === 'string') out.resistorText = saved.resistorText;
		if (typeof saved.capacitorText === 'string') out.capacitorText = saved.capacitorText;
		return out;
	} catch {
		return null;
	}
}

/** Keeps the setting for the next visit; blocked storage just means it is not kept. */
export function saveStock({ stock, resistorText, capacitorText }) {
	try {
		localStorage.setItem(STOCK_KEY, JSON.stringify({ stock, resistorText, capacitorText }));
	} catch {
		// private window or storage blocked
	}
}
