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

import { branchDcGain, combinerChoice, combinerDesign, magnitudePhaseAt, magnitudePhaseAtParallelSum } from '../src/lib/filter/bode.js';
import { nearestResistor } from '../src/lib/filter/eseries.js';
import { designFirstOrderLowPass } from '../src/lib/filter/firstOrder.js';
import { designFirstOrderHighPass } from '../src/lib/filter/firstOrderHighPass.js';
import { designMfbLowPass } from '../src/lib/filter/mfb.js';
import { designMfbHighPass } from '../src/lib/filter/mfbHighPass.js';
import { designSallenKeyLowPass } from '../src/lib/filter/sallenKey.js';
import { designSallenKeyHighPass } from '../src/lib/filter/sallenKeyHighPass.js';
import { buildElements, generateNetlist, generateSchematic } from '../src/lib/filter/spice.js';
import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';
import { audit } from '../src/lib/spice/geometry.js';
import { designBandPass, designBandStop, designHighPass, designLowPass } from '../src/lib/filter/stages.js';
import { designTowThomasHighPass, designTowThomasLowPass, designTowThomasNotch } from '../src/lib/filter/towThomas.js';
import { realOpampProblems } from './lib-real-opamp.mjs';

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

/* ----------------------------------------------------------- the cases */
const second = {
	mfb: (s) => (s.filterType === 'highpass' ? designMfbHighPass(s.wn, s.q) : designMfbLowPass(s.wn, s.q)),
	sallenKey: (s) => (s.filterType === 'highpass' ? designSallenKeyHighPass(s.wn, s.q) : designSallenKeyLowPass(s.wn, s.q)),
	towThomas: (s) => (s.filterType === 'highpass' ? designTowThomasHighPass(s.wn, s.q) : designTowThomasLowPass(s.wn, s.q))
};
// a stage with zeros is always a Tow-Thomas notch, as on the page
const realize = (t) => (s) =>
	Number.isFinite(s.wz)
		? designTowThomasNotch(s.wn, s.q, s.wz, { lowSide: s.filterType === 'lowpass' })
		: s.order === 1
			? s.filterType === 'highpass'
				? designFirstOrderHighPass(s.tau)
				: designFirstOrderLowPass(s.tau)
			: second[t](s);

const SPECS = [
	{ filterType: 'lowpass', amaxDb: 0.2, aminDb: 40, fp: 10000, fs: 35000 },
	{ filterType: 'lowpass', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 },
	{ filterType: 'highpass', amaxDb: 3, aminDb: 40, fp: 10000, fs: 3000 },
	// gentle enough for a Bessel high-pass to be built too
	{ filterType: 'highpass', amaxDb: 3, aminDb: 25, fp: 10000, fs: 1500 },
	{ filterType: 'bandpass', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 },
	{ filterType: 'bandstop', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 }
];
const RESPONSE_KEYS = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];
const MIXED = [
	['bessel', 'elliptic'],
	['elliptic', 'butterworth'],
	['inverseChebyshev', 'chebyshev'],
	['legendre', 'inverseChebyshev']
];
const isBand = (t) => t === 'bandpass' || t === 'bandstop';
const CASES = [];
for (const spec of SPECS) {
	for (const topology of Object.keys(second)) {
		for (const response of RESPONSE_KEYS) CASES.push({ spec, topology, responseHp: response, responseLp: response });
		if (isBand(spec.filterType)) for (const [responseHp, responseLp] of MIXED) CASES.push({ spec, topology, responseHp, responseLp });
	}
}
let skipped = 0;

for (const { spec, topology, responseHp, responseLp } of CASES) {
	{
		{
			const response = responseLp;
			const args = { response, responseHp, responseLp, ...spec };
			let design;
			if (spec.filterType === 'bandpass') design = designBandPass({ ...args, orderLow: null, orderHigh: null });
			else if (spec.filterType === 'bandstop') design = designBandStop({ ...args, orderLow: null, orderHigh: null });
			else if (spec.filterType === 'highpass') design = designHighPass({ ...args, order: null });
			else design = designLowPass({ ...args, order: null });
			// what the page would refuse: past its order limit, or a response that never gets there
			const orders = isBand(spec.filterType) ? [design.lp, design.hp] : [design];
			if (orders.some((d) => !Number.isFinite(d.minOrder) || d.n > 8)) {
				skipped++;
				continue;
			}

			const realized = design.stages.map(realize(topology));
			const lpCount = spec.filterType === 'bandstop' ? design.lp.stages.length : 0;
			let combinerMode = 'sum';
			let combinerResistors = null;
			let expected;
			if (spec.filterType === 'bandstop') {
				const branches = [realized.slice(0, lpCount), realized.slice(lpCount)];
				const choice = combinerChoice(branches, spec.fsl, spec.fsh);
				combinerMode = choice.mode;
				// the combiner evens out a low-pass notch stage's DC gain, as on the page
				const parts = combinerDesign(choice.mode, 10000, Math.abs(branchDcGain(branches[0])), (v) => nearestResistor(v, 'E24'));
				combinerResistors = parts.resistors;
				expected = (f) => magnitudePhaseAtParallelSum(branches, f, parts.weights).db;
			} else {
				expected = (f) => magnitudePhaseAt(realized, f).db;
			}

			const netlist = generateNetlist({
				realizedStages: realized,
				topology,
				lpCount,
				combinerMode,
				combinerR: 10000,
				combinerResistors,
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
			const respText = responseHp === responseLp ? responseLp : `${responseHp}/${responseLp}`;
			const label = `${spec.filterType.padEnd(8)} ${topology.padEnd(10)} ${respText.padEnd(16)} n=${design.n ?? `${design.lp.n}+${design.hp.n}`}${spec.filterType === 'bandstop' ? ` ${combinerMode}` : ''}`;
			check(label, worst < 0.02, `ecart max ${worst.toFixed(4)} dB a ${worstAt.toFixed(0)} Hz, ${elements.length} elements`);

			// the .asc has to describe exactly the same circuit. It is drawn, so
			// most of its nets carry no name: what must match is which pins
			// share a net, every name that is drawn, the values and the
			// directives
			const opts = { realizedStages: realized, topology, lpCount, combinerMode, combinerR: 10000, combinerResistors, ...args };
			const asc = generateSchematic(opts);
			const wanted = buildElements({ realizedStages: realized, filterType: spec.filterType, lpCount, combinerMode, combinerR: 10000, combinerResistors }).filter((e) => e.kind !== 'LABEL');
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
			for (const line of generateNetlist(opts).split('\n').filter((l) => /^\.(ac|meas)/.test(l))) if (!directives.includes(line.trim())) problems.push(`.asc lacks ${line.trim()}`);
			check(`  .asc same circuit`, problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : `${got.length} symbols`);
			const issues = audit(asc);
			check(`  .asc drawn clean`, issues.length === 0, issues.length ? issues.slice(0, 3).map((i) => `${i.kind}: ${i.detail}`).join('; ') : 'no overlap, no crossing');
		}
	}
}

// values change length with the frequency (470p, 1.5u, 180k): the drawing
// has to stay clean from a few hertz to a few hundred kilohertz
{
	let drawn = 0;
	const messy = [];
	for (const k of [0.001, 0.1, 30]) {
		for (const spec of SPECS) {
			const scaled = Object.fromEntries(Object.entries(spec).map(([key, v]) => [key, /^f(p|s|l|h|sl|sh)$/.test(key) ? v * k : v]));
			for (const topology of Object.keys(second)) {
				for (const response of ['butterworth', 'chebyshev']) {
					const args = { response, ...scaled };
					let design;
					if (scaled.filterType === 'bandpass') design = designBandPass({ ...args, orderLow: null, orderHigh: null });
					else if (scaled.filterType === 'bandstop') design = designBandStop({ ...args, orderLow: null, orderHigh: null });
					else if (scaled.filterType === 'highpass') design = designHighPass({ ...args, order: null });
					else design = designLowPass({ ...args, order: null });
					const realized = design.stages.map(realize(topology));
					const lpCount = scaled.filterType === 'bandstop' ? design.lp.stages.length : 0;
					const combinerMode = scaled.filterType === 'bandstop' ? combinerChoice([realized.slice(0, lpCount), realized.slice(lpCount)], scaled.fsl, scaled.fsh).mode : 'sum';
					const issues = audit(generateSchematic({ realizedStages: realized, topology, lpCount, combinerMode, combinerR: 10000, ...args }));
					drawn++;
					if (issues.length) messy.push(`${scaled.filterType} ${topology} ${response} x${k}: ${issues[0].kind}: ${issues[0].detail}`);
				}
			}
		}
	}
	check('every drawing from a few hertz to a few hundred kilohertz is clean', messy.length === 0, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
}

// the same drawings with a real op-amp: the five-pin symbol on v++ and
// v--, the rail sources, the part's subcircuit, and the same wiring
{
	let drawn = 0;
	const messy = [];
	for (const spec of SPECS) {
		for (const topology of Object.keys(second)) {
			for (const response of ['butterworth', 'chebyshev', 'elliptic']) {
				const args = { response, ...spec };
				let design;
				if (spec.filterType === 'bandpass') design = designBandPass({ ...args, orderLow: null, orderHigh: null });
				else if (spec.filterType === 'bandstop') design = designBandStop({ ...args, orderLow: null, orderHigh: null });
				else if (spec.filterType === 'highpass') design = designHighPass({ ...args, order: null });
				else design = designLowPass({ ...args, order: null });
				const realized = design.stages.map(realize(topology));
				const lpCount = spec.filterType === 'bandstop' ? design.lp.stages.length : 0;
				const combinerMode = spec.filterType === 'bandstop' ? combinerChoice([realized.slice(0, lpCount), realized.slice(lpCount)], spec.fsl, spec.fsh).mode : 'sum';
				const opts = { realizedStages: realized, topology, lpCount, combinerMode, combinerR: 10000, ...args };
				const ideal = generateSchematic(opts);
				for (const part of ['TL082', 'LM741']) {
					const { problems, issues } = realOpampProblems(ideal, generateSchematic({ ...opts, opamp: part }), part);
					drawn++;
					if (problems.length || issues.length) messy.push(`${spec.filterType} ${topology} ${response} ${part}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
				}
				if (drawn === 2) {
					const cir = generateNetlist({ ...opts, opamp: 'TL082' });
					check('real op-amps: the .cir carries the TL082 subcircuit, the rails and five-node op-amps', /^\.SUBCKT TL082/m.test(cir) && /^VPOS v\+\+ 0 15$/m.test(cir) && /^VNEG v-- 0 -15$/m.test(cir) && /^X\S+ \S+ \S+ v\+\+ v-- \S+ TL082$/m.test(cir) && !/OPAMP/.test(cir.replace(/OPERATIONAL AMPLIFIER/g, '')));
				}
			}
		}
	}
	check('real op-amps: every drawing wired as the ideal one, on v++ and v--, drawn clean', messy.length === 0, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
}

console.log(fails === 0 ? 'netlists LTspice conformes au modele de l outil' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
