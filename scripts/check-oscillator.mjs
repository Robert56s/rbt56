// Numeric checks of the sine-oscillator tool.
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-oscillator.mjs
//
// 1. The RC ladder solver reproduces the exact textbook results for the
//    three ladder topologies, and shows the loading penalty it exists to
//    avoid guessing at.
// 2. Every design lands on its frequency within component rounding, and
//    its amplitude limiter really does straddle the gain the loop needs.
// 3. The exported netlist OSCILLATES WHERE IT SHOULD: the element list is
//    run through a small transient simulator and the frequency is read
//    off its zero crossings, then compared with the design's own f0. This
//    catches a netlist wired to a different circuit than the page
//    describes, and confirms the amplitude really does build.
// 4. The .asc describes the same circuit as the .cir.
// 5. The explanations render under strict KaTeX.
// Exits non-zero on any failure.

import { readFileSync } from 'node:fs';
import katex from 'katex';
import { explainBarkhausen, explainOpampLimit, explainStabilizer, explainTopology } from '../src/lib/oscillator/explain.js';
import { buildElements, generateNetlist, generateSchematic } from '../src/lib/oscillator/spice.js';
import { compareOscillators, designOscillator, solveLadder, TOPOLOGIES } from '../src/lib/oscillator/topologies.js';
import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ------------------------------------------------------------ complex */
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cDiv = (a, b) => {
	const d = b.re * b.re + b.im * b.im;
	return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cAbs = (a) => Math.hypot(a.re, a.im);

/**
 * A small transient simulator, so the exported netlist can be run rather
 * than argued about. Resistors and capacitors are stamped into a modified
 * nodal analysis, capacitors by the trapezoidal companion model (the same
 * one SPICE uses by default, and the one that neither adds nor removes
 * damping, which matters when the whole question is whether something
 * oscillates). Op-amps are ideal nullors. Diodes are left out: that is
 * their state at start-up, when the amplitude is still growing, which is
 * exactly the regime whose frequency the design predicts.
 *
 * One capacitor starts with a small charge on it, standing in for the
 * circuit noise that starts a real oscillator, and the frequency is read
 * back off the zero crossings once the waveform is established.
 */
function transient(elements, { f0, periods = 60, perPeriod = 300, probe }) {
	const h = 1 / (f0 * perPeriod);
	const steps = Math.round(periods * perPeriod);
	const parts = elements.filter((e) => e.kind !== 'LABEL' && e.kind !== 'D');
	const nodes = new Map();
	const idx = (n) => {
		if (n === '0') return -1;
		if (!nodes.has(n)) nodes.set(n, nodes.size);
		return nodes.get(n);
	};
	for (const e of parts) for (const n of e.nodes) idx(n);
	const amps = parts.filter((e) => e.kind === 'OP');
	const caps = parts.filter((e) => e.kind === 'C').map((e) => ({ e, geq: (2 * e.value) / h, v: 0, i: 0 }));
	if (caps.length === 0) return null;
	caps[0].v = 0.1; // the nudge
	const n = nodes.size;
	const size = n + amps.length;

	const A = Array.from({ length: size }, () => new Float64Array(size));
	const stamp = (i, j, g) => {
		if (i >= 0) A[i][i] += g;
		if (j >= 0) A[j][j] += g;
		if (i >= 0 && j >= 0) {
			A[i][j] -= g;
			A[j][i] -= g;
		}
	};
	for (const e of parts) {
		if (e.kind === 'R') stamp(idx(e.nodes[0]), idx(e.nodes[1]), 1 / e.value);
	}
	for (const c of caps) stamp(idx(c.e.nodes[0]), idx(c.e.nodes[1]), c.geq);
	amps.forEach((e, k) => {
		const row = n + k;
		const out = idx(e.nodes[2]);
		const pp = idx(e.nodes[0]);
		const mm = idx(e.nodes[1]);
		if (out >= 0) A[out][row] += 1;
		if (pp >= 0) A[row][pp] += 1;
		if (mm >= 0) A[row][mm] -= 1;
	});

	// the matrix is constant, so factor it once
	const perm = Array.from({ length: size }, (_, i) => i);
	for (let col = 0; col < size; col++) {
		let piv = col;
		for (let r = col + 1; r < size; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
		if (Math.abs(A[piv][col]) < 1e-14) return null;
		if (piv !== col) {
			[A[col], A[piv]] = [A[piv], A[col]];
			[perm[col], perm[piv]] = [perm[piv], perm[col]];
		}
		for (let r = col + 1; r < size; r++) {
			const f = A[r][col] / A[col][col];
			A[r][col] = f;
			for (let c = col + 1; c < size; c++) A[r][c] -= f * A[col][c];
		}
	}
	const solve = (b) => {
		const y = new Float64Array(size);
		for (let i = 0; i < size; i++) {
			let s2 = b[perm[i]];
			for (let j = 0; j < i; j++) s2 -= A[i][j] * y[j];
			y[i] = s2;
		}
		const x = new Float64Array(size);
		for (let i = size - 1; i >= 0; i--) {
			let s2 = y[i];
			for (let j = i + 1; j < size; j++) s2 -= A[i][j] * x[j];
			x[i] = s2 / A[i][i];
		}
		return x;
	};

	const probeIdx = idx(probe);
	const trace = new Float64Array(steps);
	const b = new Float64Array(size);
	for (let k = 0; k < steps; k++) {
		b.fill(0);
		for (const c of caps) {
			const ieq = c.geq * c.v + c.i;
			const a = idx(c.e.nodes[0]);
			const bb = idx(c.e.nodes[1]);
			if (a >= 0) b[a] += ieq;
			if (bb >= 0) b[bb] -= ieq;
		}
		const x = solve(b);
		for (const c of caps) {
			const a = idx(c.e.nodes[0]);
			const bb = idx(c.e.nodes[1]);
			const vNew = (a >= 0 ? x[a] : 0) - (bb >= 0 ? x[bb] : 0);
			c.i = c.geq * vNew - (c.geq * c.v + c.i);
			c.v = vNew;
		}
		trace[k] = probeIdx >= 0 ? x[probeIdx] : 0;
	}

	// frequency from the zero crossings of the last third, interpolated
	const from = Math.floor(steps * 0.6);
	const times = [];
	for (let k = from + 1; k < steps; k++) {
		if (trace[k - 1] < 0 && trace[k] >= 0) {
			const frac = -trace[k - 1] / (trace[k] - trace[k - 1]);
			times.push((k - 1 + frac) * h);
		}
	}
	if (times.length < 3) return null;
	const span = times[times.length - 1] - times[0];
	const grew = Math.abs(trace[steps - 1]) > Math.abs(trace[Math.floor(steps * 0.2)]);
	return { f: (times.length - 1) / span, cycles: times.length - 1, grew };
}

/** Where the exported netlist actually oscillates. */
function netlistFrequency(design) {
	const probe = design.topology === 'quadrature' ? 'vsin' : 'vout';
	return transient(buildElements(design), { f0: design.f0, probe });
}

/**
 * The same design with the feedback resistor at its exact value instead of
 * the nearest stock one. The design's f0 is the frequency at the balance
 * point, where the loop gain is exactly 1; rounding the feedback resistor
 * leaves a few percent of residual gain, which moves the frequency while
 * the amplitude is still building. Trimming it away separates "is the
 * netlist the circuit we meant" from "what does E24 cost", which are two
 * different questions.
 */
function atBalance(d) {
	const exact = d.requiredGain * d.rg;
	const copy = { ...d, parts: { ...d.parts }, limiter: { ...d.limiter } };
	if (d.topology === 'wien') copy.parts.rf1 = 2 * d.rg - d.parts.rf2;
	else copy.limiter.rf = exact;
	return copy;
}

/* ------------------------------------------------ 1. the ladder solver */
{
	const cases = [
		['3 sections, unbuffered', 3, false, 1 / Math.sqrt(6), 29],
		['3 sections, buffered', 3, true, 1 / Math.sqrt(3), 8],
		['4 sections, buffered (Bubba)', 4, true, 1, 4]
	];
	for (const [label, n, buffered, x0, gain] of cases) {
		const r = solveLadder(n, { buffered, loadRatio: Infinity });
		check(`ladder ${label}: exact x0 and gain`, near(r.x0, x0, 1e-6) && near(r.gain, gain, 1e-6), `x0 ${r.x0.toFixed(5)}, gain ${r.gain.toFixed(4)}`);
	}
	const loaded = solveLadder(3, { buffered: false, loadRatio: 1 });
	check('ladder: an extra load on the end really does cost gain', loaded.gain > 35, `gain ${loaded.gain.toFixed(1)} instead of 29, which is why the tool solves rather than quotes`);
}

/* --------------------------------------- 2. designs and their limiters */
const BASE = { frequency: 1000, amplitude: 3, gbw: 3e6, slewRate: 13e6, opampSwing: 10.5 };
for (const t of TOPOLOGIES) {
	const d = designOscillator({ ...BASE, topology: t.id });
	check(`${t.id}: designs, frequency within rounding`, d !== null && Math.abs(d.f0Error) < 0.03, d ? `${d.f0.toFixed(1)} Hz (${(100 * d.f0Error).toFixed(2)} %)` : 'null');
	check(`  limiter straddles the gain the loop needs`, d.limiter.regulates === true, `${d.limiter.gainStart.toFixed(2)} and ${d.limiter.gainLimited.toFixed(2)} around ${d.requiredGain.toFixed(2)}`);
	check(`  amplitude lands near the target`, near(d.limiter.amplitudeActual, 3, 0.9), `${d.limiter.amplitudeActual.toFixed(2)} V for 3 V`);
}
for (const s of ['diodes', 'lamp', 'jfet']) {
	const d = designOscillator({ ...BASE, topology: 'wien', stabilizer: s });
	check(`wien + ${s}: designs with a gain of 3`, d !== null && near(d.requiredGain, 3, 1e-9), `parts ${Object.keys(d.parts).join(', ')}`);
}

/* ------------------- 3. the exported netlist oscillates where it should */
// Two separate properties, because they are two separate frequencies. The
// design's f0 is the balance point, where the loop gain is exactly 1; with
// the excess gain a real circuit needs to start, the poles sit slightly
// off the axis and the STARTING oscillation runs at a different frequency
// until the limiter pulls the gain back. So the frequency is checked at
// balance, and the growth is checked with the excess the design ships.
for (const t of TOPOLOGIES) {
	for (const f of [200, 1000, 20000]) {
		const bal = atBalance(designOscillator({ ...BASE, frequency: f, topology: t.id, gbw: 1e9, excessGain: 0 }));
		const got = netlistFrequency(bal);
		check(
			`${t.id} at ${f} Hz: the netlist oscillates at the designed frequency`,
			got !== null && near(got.f / bal.f0, 1, 0.003),
			got ? `${got.f.toFixed(1)} Hz against ${bal.f0.toFixed(1)} Hz over ${got.cycles} cycles` : 'no oscillation'
		);
	}
	const d = designOscillator({ ...BASE, topology: t.id });
	const run = netlistFrequency(d);
	check(`${t.id}: with the excess gain it ships, the amplitude builds`, run !== null && run.grew, run ? `start-up at ${run.f.toFixed(1)} Hz, ${((run.f / d.f0 - 1) * 100).toFixed(1)} % off the settled frequency` : 'no oscillation');
}
for (const s of ['lamp', 'jfet']) {
	const d = atBalance(designOscillator({ ...BASE, topology: 'wien', stabilizer: s, excessGain: 0 }));
	const got = netlistFrequency(d);
	check(`wien + ${s}: the netlist oscillates at f0`, got !== null && near(got.f / d.f0, 1, 0.02), got ? `${got.f.toFixed(1)} Hz against ${d.f0.toFixed(1)} Hz` : 'no oscillation');
}

/* ------------------------------ 4. the .asc is the same circuit as the .cir */
for (const t of TOPOLOGIES) {
	const d = designOscillator({ ...BASE, topology: t.id });
	const wanted = buildElements(d).filter((e) => e.kind !== 'LABEL');
	const { elements: got, clashes, dangling } = parseSchematic(generateSchematic(d));
	const problems = [...clashes, ...dangling];
	if (got.length !== wanted.length) problems.push(`${got.length} symbols for ${wanted.length} elements`);
	for (const w of wanted) {
		const name = w.kind === 'J' ? w.name.replace(/^J/, '') : w.name;
		const g = got.find((e) => e.name === name);
		if (!g) {
			problems.push(`${w.name} missing`);
			continue;
		}
		if (g.kind !== w.kind) problems.push(`${w.name} is a ${g.kind}, expected ${w.kind}`);
		if (g.nodes.join('|') !== w.nodes.join('|')) problems.push(`${w.name} wired ${g.nodes.join(',')} instead of ${w.nodes.join(',')}`);
		if (w.kind === 'R' || w.kind === 'C') {
			if (g.value !== spiceValue(w.value)) problems.push(`${w.name} reads ${g.value}, expected ${spiceValue(w.value)}`);
		}
	}
	check(`${t.id}: .asc and .cir describe the same circuit`, problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : `${got.length} symbols`);
	const cir = generateNetlist(d);
	check(`  .cir carries the analysis and a start-up nudge`, /\.tran /.test(cir) && /\.ic V\(/.test(cir) && /\.four /.test(cir));
}

/* --------------------------------------------------------------- 5. KaTeX */
{
	let n = 0;
	let bad = 0;
	for (const t of TOPOLOGIES) {
		for (const s of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : [null]) {
			const d = designOscillator({ ...BASE, topology: t.id, ...(s ? { stabilizer: s } : {}) });
			const slow = designOscillator({ ...BASE, topology: t.id, frequency: 200000, ...(s ? { stabilizer: s } : {}) });
			for (const dd of [d, slow].filter(Boolean)) {
				for (const b of [...explainBarkhausen(dd), ...explainTopology(dd), ...explainStabilizer(dd), ...explainOpampLimit(dd)]) {
					if (b.type === 'eq') {
						n++;
						try {
							katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
						} catch (e) {
							bad++;
							console.log('KATEX FAIL', t.id, b.tex.slice(0, 90), e.message);
						}
					} else if (/undefined|NaN/.test(b.text)) {
						bad++;
						console.log('TEXT BAD', t.id, b.text.slice(0, 110));
					}
				}
			}
		}
	}
	check(`explanations: ${n} equations render under strict KaTeX`, bad === 0, `${bad} failures`);
}

/* --------------------------------------------- the comparison and verdict */
{
	const rows = compareOscillators({ ...BASE, frequency: 55000 });
	const wien = rows.find((r) => r.id === 'wien');
	const ps = rows.find((r) => r.id === 'phaseShift');
	check('comparison: the Wien bridge asks the least of the op-amp', wien.gain < ps.gain && wien.fMax > ps.fMax, `gain ${wien.gain} vs ${ps.gain}, ceiling ${(wien.fMax / 1000).toFixed(0)} kHz vs ${(ps.fMax / 1000).toFixed(0)} kHz`);
	check('comparison: at 55 kHz a TL08x rules the phase-shift versions out', !ps.gbwOk && wien.gbwOk, `phase shift ratio ${ps.gbwRatio.toFixed(2)}, wien ${wien.gbwRatio.toFixed(2)}`);
	const quad = rows.find((r) => r.id === 'quadrature');
	check('comparison: quadrature reaches highest and gives two outputs', quad.fMax >= wien.fMax && quad.outputs === 'quadrature', `ceiling ${(quad.fMax / 1000).toFixed(0)} kHz`);
}

/* ------------------------------------------------- the formula sheet page */
{
	const src = readFileSync(new URL('../src/routes/(site)/tools/oscillator/formulas/+page.svelte', import.meta.url), 'utf8');
	// the sheet's tex are template literals, so a pair of backslashes in the
	// source is one backslash in the string KaTeX actually receives
	const found = [...src.matchAll(/tex=\{`([\s\S]*?)`\}/g)].map((m) => m[1].replace(/\\\\/g, '\\'));
	let bad = 0;
	for (const tex of found) {
		try {
			katex.renderToString(tex, { throwOnError: true, strict: 'error' });
		} catch (e) {
			bad++;
			console.log('KATEX FAIL (sheet)', tex.slice(0, 90), e.message);
		}
	}
	check(`formula sheet: ${found.length} equations render under strict KaTeX`, found.length > 30 && bad === 0, `${bad} failures`);
	// every topology's constant and required gain has to be stated there
	for (const needle of ['sqrt{6}', 'A = 29', 'A = 3', 'A = 1', 'Barkhausen', 'SLOA060']) {
		check(`formula sheet mentions ${needle}`, src.includes(needle));
	}
}

console.log(fails === 0 ? 'oscillator checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
