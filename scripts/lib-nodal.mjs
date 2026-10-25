// The nodal solver and the netlist and schematic readers the LTspice checks
// share (check-spice.mjs, check-hand.mjs): complex arithmetic, a .cir
// parser, the solver (op-amps as ideal nullors, or the netlist's own
// single-pole model) and the comparison of an .asc with the elements it
// was drawn from.

import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';

/* ------------------------------------------------------------- complex */
export const cx = (re, im = 0) => ({ re, im });
export const add = (a, b) => cx(a.re + b.re, a.im + b.im);
export const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
export const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const div = (a, b) => {
	const d = b.re * b.re + b.im * b.im;
	return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
export const abs = (a) => Math.hypot(a.re, a.im);

/* --------------------------------------------------------- netlist parse */
const SUFFIX = { meg: 1e6, g: 1e9, k: 1e3, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };

export function parseValue(text) {
	const m = /^([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z]*)/i.exec(text.trim());
	if (!m) return NaN;
	const base = Number(m[1]);
	const suf = m[2].toLowerCase();
	if (!suf) return base;
	if (suf.startsWith('meg')) return base * 1e6;
	const key = Object.keys(SUFFIX).find((s) => s !== 'meg' && suf.startsWith(s));
	return key ? base * SUFFIX[key] : base;
}

export function parseNetlist(text) {
	const elements = [];
	let inSubckt = false;
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('*')) continue;
		if (/^\.subckt/i.test(line)) {
			inSubckt = true;
			continue;
		}
		if (/^\.ends/i.test(line)) {
			inSubckt = false;
			continue;
		}
		if (inSubckt || line.startsWith('.')) continue;
		const p = line.split(/\s+/);
		const kind = p[0][0].toUpperCase();
		if (kind === 'R' || kind === 'C') elements.push({ kind, name: p[0], a: p[1], b: p[2], value: parseValue(p[3]) });
		else if (kind === 'V') elements.push({ kind, name: p[0], a: p[1], b: p[2] });
		else if (kind === 'X') elements.push({ kind: 'OP', name: p[0], p: p[1], m: p[2], out: p[3] });
	}
	return elements;
}

/** The single-pole op-amp a netlist's own subcircuit sets up: its .param AOL and GBW. */
export function opampParams(text) {
	const line = /^\.param AOL=(\S+) GBW=(\S+)$/m.exec(text);
	return line ? { aol: parseValue(line[1]), gbw: parseValue(line[2]) } : null;
}

/**
 * Solves the parsed netlist at one frequency, returns V(vout) with V(vin)
 * driven at 1 V. The op-amps are ideal nullors, or with `opamp` ({ aol,
 * gbw }) the netlist's single-pole model: V(out) = A(s) (V(p) - V(m)),
 * A(s) = AOL / (1 + s AOL / (2 pi GBW)).
 */
export function solveAt(elements, freqHz, opamp = null) {
	const w = 2 * Math.PI * freqHz;
	const nodes = new Map();
	const idx = (n) => {
		if (n === '0') return -1;
		if (!nodes.has(n)) nodes.set(n, nodes.size);
		return nodes.get(n);
	};
	for (const e of elements) {
		if (e.kind === 'OP') {
			idx(e.p);
			idx(e.m);
			idx(e.out);
		} else {
			idx(e.a);
			idx(e.b);
		}
	}
	const extras = elements.filter((e) => e.kind === 'V' || e.kind === 'OP');
	const n = nodes.size;
	const size = n + extras.length;
	const A = Array.from({ length: size }, () => Array.from({ length: size }, () => cx(0)));
	const rhs = Array.from({ length: size }, () => cx(0));

	const stampY = (i, j, y) => {
		if (i >= 0) A[i][i] = add(A[i][i], y);
		if (j >= 0) A[j][j] = add(A[j][j], y);
		if (i >= 0 && j >= 0) {
			A[i][j] = sub(A[i][j], y);
			A[j][i] = sub(A[j][i], y);
		}
	};

	for (const e of elements) {
		if (e.kind === 'R') stampY(idx(e.a), idx(e.b), cx(1 / e.value));
		else if (e.kind === 'C') stampY(idx(e.a), idx(e.b), cx(0, w * e.value));
	}
	extras.forEach((e, k) => {
		const row = n + k;
		if (e.kind === 'V') {
			const a = idx(e.a);
			const b = idx(e.b);
			if (a >= 0) {
				A[a][row] = add(A[a][row], cx(1));
				A[row][a] = add(A[row][a], cx(1));
			}
			if (b >= 0) {
				A[b][row] = sub(A[b][row], cx(1));
				A[row][b] = sub(A[row][b], cx(1));
			}
			rhs[row] = cx(1); // 1 V AC
		} else {
			// ideal op-amp: norator injects an unknown current into `out`,
			// nullator forces V(p) = V(m); a single-pole one instead holds
			// V(p) - V(m) = (1/AOL + s/(2 pi GBW)) V(out)
			const out = idx(e.out);
			const p = idx(e.p);
			const m = idx(e.m);
			if (out >= 0) A[out][row] = add(A[out][row], cx(1));
			if (p >= 0) A[row][p] = add(A[row][p], cx(1));
			if (m >= 0) A[row][m] = sub(A[row][m], cx(1));
			if (opamp && out >= 0) A[row][out] = sub(A[row][out], cx(1 / opamp.aol, w / (2 * Math.PI * opamp.gbw)));
		}
	});

	// Gaussian elimination with partial pivoting
	for (let col = 0; col < size; col++) {
		let piv = col;
		for (let r = col + 1; r < size; r++) if (abs(A[r][col]) > abs(A[piv][col])) piv = r;
		if (abs(A[piv][col]) < 1e-18) continue;
		if (piv !== col) {
			[A[col], A[piv]] = [A[piv], A[col]];
			[rhs[col], rhs[piv]] = [rhs[piv], rhs[col]];
		}
		for (let r = col + 1; r < size; r++) {
			if (abs(A[r][col]) === 0) continue;
			const f = div(A[r][col], A[col][col]);
			for (let c = col; c < size; c++) A[r][c] = sub(A[r][c], mul(f, A[col][c]));
			rhs[r] = sub(rhs[r], mul(f, rhs[col]));
		}
	}
	const x = Array.from({ length: size }, () => cx(0));
	for (let r = size - 1; r >= 0; r--) {
		let s = rhs[r];
		for (let c = r + 1; c < size; c++) s = sub(s, mul(A[r][c], x[c]));
		x[r] = abs(A[r][r]) < 1e-18 ? cx(0) : div(s, A[r][r]);
	}
	const vout = nodes.get('vout');
	return vout === undefined ? cx(0) : x[vout];
}

/**
 * What differs between a drawn .asc and the elements it was drawn from
 * (`wanted`, buildElements without its labels): which pins share a net,
 * every name that is drawn, the values, and the .ac and .meas directives
 * of the netlist. Returns { problems, symbols }.
 */
export function ascParity(asc, wanted, netlist) {
	const { elements: got, clashes, dangling, directives } = parseSchematic(asc);
	const problems = [...clashes, ...dangling];
	if (got.length !== wanted.length) problems.push(`${got.length} symbols for ${wanted.length} elements`);
	const netOf = new Map();
	const nodeOf = new Map();
	for (const w of wanted) {
		const g = got.find((e) => e.name === w.name);
		if (!g) {
			problems.push(`${w.name} missing from the schematic`);
			continue;
		}
		if (g.kind !== w.kind) problems.push(`${w.name} is a ${g.kind}, expected ${w.kind}`);
		g.nodes.forEach((net, i) => {
			const node = w.nodes[i];
			if (netOf.has(net) && netOf.get(net) !== node) problems.push(`${w.name} pin ${i}: drawn net joins ${netOf.get(net)} and ${node}`);
			if (nodeOf.has(node) && nodeOf.get(node) !== net) problems.push(`${w.name} pin ${i}: node ${node} is split in the drawing`);
			netOf.set(net, node);
			nodeOf.set(node, net);
			if (!net.startsWith('_n') && net !== node) problems.push(`${w.name} pin ${i}: labelled ${net}, expected ${node}`);
		});
		if (w.kind !== 'V' && w.kind !== 'OP' && g.value !== spiceValue(w.value)) problems.push(`${w.name} reads ${g.value}, expected ${spiceValue(w.value)}`);
	}
	if (!directives.includes('.lib opamp.sub')) problems.push('no .lib opamp.sub');
	for (const line of netlist.split('\n').filter((l) => /^\.(ac|meas)/.test(l))) if (!directives.includes(line.trim())) problems.push(`.asc lacks ${line.trim()}`);
	return { problems, symbols: got.length };
}
