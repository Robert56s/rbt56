// Verifies the generated LTspice netlists by simulating them.
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-spice.mjs
//
// The netlist is parsed and solved with complex modified nodal analysis
// (op-amps as ideal nullors), then compared against the response the tool
// itself predicts from the same realized stages. Any miswired node,
// swapped component or wrong op-amp pin shows up immediately as a
// mismatch, which a netlist that merely "looks right" would hide.
//
// Exits non-zero on any mismatch.

import { magnitudePhaseAt, magnitudePhaseAtParallelSum, combinerChoice } from '../src/lib/filter/bode.js';
import { designFirstOrderLowPass } from '../src/lib/filter/firstOrder.js';
import { designFirstOrderHighPass } from '../src/lib/filter/firstOrderHighPass.js';
import { designMfbLowPass } from '../src/lib/filter/mfb.js';
import { designMfbHighPass } from '../src/lib/filter/mfbHighPass.js';
import { designSallenKeyLowPass } from '../src/lib/filter/sallenKey.js';
import { designSallenKeyHighPass } from '../src/lib/filter/sallenKeyHighPass.js';
import { buildElements, generateNetlist, generateSchematic, spiceValue } from '../src/lib/filter/spice.js';
import { designBandPass, designBandStop, designHighPass, designLowPass } from '../src/lib/filter/stages.js';
import { designTowThomasHighPass, designTowThomasLowPass } from '../src/lib/filter/towThomas.js';

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};

/* ------------------------------------------------------------- complex */
const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => {
	const d = b.re * b.re + b.im * b.im;
	return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const abs = (a) => Math.hypot(a.re, a.im);

/* --------------------------------------------------------- netlist parse */
const SUFFIX = { meg: 1e6, g: 1e9, k: 1e3, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };

function parseValue(text) {
	const m = /^([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z]*)/i.exec(text.trim());
	if (!m) return NaN;
	const base = Number(m[1]);
	const suf = m[2].toLowerCase();
	if (!suf) return base;
	if (suf.startsWith('meg')) return base * 1e6;
	const key = Object.keys(SUFFIX).find((s) => s !== 'meg' && suf.startsWith(s));
	return key ? base * SUFFIX[key] : base;
}

function parseNetlist(text) {
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

/** Solves the parsed netlist at one frequency, returns V(vout) with V(vin) driven at 1 V. */
function solveAt(elements, freqHz) {
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
			// nullator forces V(p) = V(m)
			const out = idx(e.out);
			const p = idx(e.p);
			const m = idx(e.m);
			if (out >= 0) A[out][row] = add(A[out][row], cx(1));
			if (p >= 0) A[row][p] = add(A[row][p], cx(1));
			if (m >= 0) A[row][m] = sub(A[row][m], cx(1));
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

/* ------------------------------------------------- .asc connectivity */

// Pin offsets of the stock symbols, as read from the shipped .asy files.
const ASC_PINS = {
	res: [[16, 16], [16, 96]],
	cap: [[16, 0], [16, 64]],
	voltage: [[0, 16], [0, 96]],
	'Opamps\\opamp': [[-32, 48], [-32, 80], [32, 64]]
};

/**
 * Rebuilds the circuit a .asc actually describes: nets come from the wires
 * (union-find over shared endpoints), names from the flags sitting on them,
 * and each symbol's nodes from where its pins land. Anything mis-wired, or
 * two different nets accidentally landing on the same point, shows up here.
 */
function parseSchematic(text) {
	const wires = [];
	const flags = [];
	const symbols = [];
	let current = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith('WIRE ')) {
			const [x1, y1, x2, y2] = line.slice(5).split(/\s+/).map(Number);
			wires.push([`${x1},${y1}`, `${x2},${y2}`]);
		} else if (line.startsWith('FLAG ')) {
			const [x, y, name] = line.slice(5).split(/\s+/);
			flags.push({ at: `${x},${y}`, name });
		} else if (line.startsWith('SYMBOL ')) {
			const p = line.slice(7).split(/\s+/);
			current = { sym: p[0], x: Number(p[1]), y: Number(p[2]), attrs: {} };
			symbols.push(current);
		} else if (line.startsWith('SYMATTR ') && current) {
			const rest = line.slice(8);
			const sp = rest.indexOf(' ');
			current.attrs[rest.slice(0, sp)] = rest.slice(sp + 1);
		}
	}

	const parent = new Map();
	const find = (k) => {
		if (!parent.has(k)) parent.set(k, k);
		while (parent.get(k) !== k) {
			parent.set(k, parent.get(parent.get(k)));
			k = parent.get(k);
		}
		return k;
	};
	const union = (a, b) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent.set(ra, rb);
	};
	for (const [a, b] of wires) union(a, b);

	const nameOf = new Map();
	const clashes = [];
	for (const f of flags) {
		const root = find(f.at);
		if (nameOf.has(root) && nameOf.get(root) !== f.name) clashes.push(`${nameOf.get(root)} and ${f.name} share a node`);
		nameOf.set(root, f.name);
	}

	const elements = [];
	const dangling = [];
	for (const s of symbols) {
		const pins = ASC_PINS[s.sym];
		if (!pins) {
			dangling.push(`unknown symbol ${s.sym}`);
			continue;
		}
		const nodes = pins.map(([dx, dy]) => {
			const at = `${s.x + dx},${s.y + dy}`;
			if (!parent.has(at)) {
				dangling.push(`${s.attrs.InstName} has a pin with nothing attached`);
				return null;
			}
			const name = nameOf.get(find(at));
			if (!name) dangling.push(`${s.attrs.InstName} sits on an unnamed net`);
			return name ?? null;
		});
		const kind = s.sym === 'voltage' ? 'V' : s.sym.endsWith('opamp') ? 'OP' : s.sym === 'cap' ? 'C' : 'R';
		elements.push({
			kind,
			name: s.attrs.InstName,
			// the symbol's pins are invin, noninvin, out; canonical order is
			// non-inverting, inverting, out
			nodes: kind === 'OP' ? [nodes[1], nodes[0], nodes[2]] : nodes,
			value: s.attrs.Value
		});
	}
	return { elements, clashes, dangling };
}

/* ----------------------------------------------------------- the cases */
const second = {
	mfb: (s) => (s.filterType === 'highpass' ? designMfbHighPass(s.wn, s.q) : designMfbLowPass(s.wn, s.q)),
	sallenKey: (s) => (s.filterType === 'highpass' ? designSallenKeyHighPass(s.wn, s.q) : designSallenKeyLowPass(s.wn, s.q)),
	towThomas: (s) => (s.filterType === 'highpass' ? designTowThomasHighPass(s.wn, s.q) : designTowThomasLowPass(s.wn, s.q))
};
const realize = (t) => (s) =>
	s.order === 1 ? (s.filterType === 'highpass' ? designFirstOrderHighPass(s.tau) : designFirstOrderLowPass(s.tau)) : second[t](s);

const SPECS = [
	{ filterType: 'lowpass', amaxDb: 0.2, aminDb: 40, fp: 10000, fs: 35000 },
	{ filterType: 'lowpass', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 },
	{ filterType: 'highpass', amaxDb: 3, aminDb: 40, fp: 10000, fs: 3000 },
	{ filterType: 'bandpass', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 },
	{ filterType: 'bandstop', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 }
];

for (const spec of SPECS) {
	for (const topology of Object.keys(second)) {
		for (const response of ['butterworth', 'chebyshev']) {
			const args = { response, ...spec };
			let design;
			if (spec.filterType === 'bandpass') design = designBandPass({ ...args, orderLow: null, orderHigh: null });
			else if (spec.filterType === 'bandstop') design = designBandStop({ ...args, orderLow: null, orderHigh: null });
			else if (spec.filterType === 'highpass') design = designHighPass({ ...args, order: null });
			else design = designLowPass({ ...args, order: null });

			const realized = design.stages.map(realize(topology));
			const lpCount = spec.filterType === 'bandstop' ? design.lp.stages.length : 0;
			let combinerMode = 'sum';
			let expected;
			if (spec.filterType === 'bandstop') {
				const branches = [realized.slice(0, lpCount), realized.slice(lpCount)];
				const choice = combinerChoice(branches, spec.fsl, spec.fsh);
				combinerMode = choice.mode;
				expected = (f) => magnitudePhaseAtParallelSum(branches, f, choice.signs).db;
			} else {
				expected = (f) => magnitudePhaseAt(realized, f).db;
			}

			const netlist = generateNetlist({
				realizedStages: realized,
				topology,
				lpCount,
				combinerMode,
				combinerR: 10000,
				ideal: true,
				...args
			});
			const elements = parseNetlist(netlist);

			const lo = spec.filterType === 'bandpass' || spec.filterType === 'bandstop' ? spec.fsl / 5 : Math.min(spec.fp, spec.fs) / 5;
			const hi = spec.filterType === 'bandpass' || spec.filterType === 'bandstop' ? spec.fsh * 5 : Math.max(spec.fp, spec.fs) * 5;
			let worst = 0;
			let worstAt = 0;
			for (let i = 0; i <= 24; i++) {
				const f = lo * (hi / lo) ** (i / 24);
				const sim = 20 * Math.log10(Math.max(abs(solveAt(elements, f)), 1e-15));
				const err = Math.abs(sim - expected(f));
				if (err > worst) {
					worst = err;
					worstAt = f;
				}
			}
			const label = `${spec.filterType.padEnd(8)} ${topology.padEnd(10)} ${response.padEnd(12)} n=${design.n ?? `${design.lp.n}+${design.hp.n}`}${spec.filterType === 'bandstop' ? ` ${combinerMode}` : ''}`;
			check(label, worst < 0.02, `ecart max ${worst.toFixed(4)} dB a ${worstAt.toFixed(0)} Hz, ${elements.length} elements`);

			// the .asc has to describe exactly the same circuit
			const asc = generateSchematic({
				realizedStages: realized,
				topology,
				lpCount,
				combinerMode,
				combinerR: 10000,
				...args
			});
			const wanted = buildElements({ realizedStages: realized, filterType: spec.filterType, lpCount, combinerMode, combinerR: 10000 }).filter((e) => e.kind !== 'LABEL');
			const { elements: got, clashes, dangling } = parseSchematic(asc);
			const problems = [...clashes, ...dangling];
			if (got.length !== wanted.length) problems.push(`${got.length} symbols for ${wanted.length} elements`);
			for (const w of wanted) {
				const g = got.find((e) => e.name === w.name);
				if (!g) {
					problems.push(`${w.name} missing from the schematic`);
					continue;
				}
				if (g.kind !== w.kind) problems.push(`${w.name} is a ${g.kind}, expected ${w.kind}`);
				if (g.nodes.join('|') !== w.nodes.join('|')) problems.push(`${w.name} wired ${g.nodes.join(',')} instead of ${w.nodes.join(',')}`);
				if (w.kind !== 'V' && w.kind !== 'OP' && g.value !== spiceValue(w.value)) problems.push(`${w.name} reads ${g.value}, expected ${spiceValue(w.value)}`);
			}
			check(`  .asc same circuit`, problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : `${got.length} symbols, ${asc.split('FLAG ').length - 1} net labels`);
		}
	}
}

console.log(fails === 0 ? 'netlists LTspice conformes au modele de l outil' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
