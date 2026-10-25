// Checks for "Build your own active filter", the filter page's panel that
// walks the current spec through the table method by hand
// (src/lib/filter/handDesign.js, src/lib/components/BuildPanel.svelte):
//
//   (a) the two tables equal the library's prototypes (butterworthStages,
//       chebyshevStages(n, 0.5)) to 1e-6;
//   (b) parseValue reads the ways a value gets typed;
//   (c) the reference numbers: Chebyshev high-pass at 100 kHz, the 20 to
//       40 kHz Butterworth band-pass and its three splits, the Butterworth
//       order past the tables;
//   (d) every step's solution equals the automatic tool's numbers over a
//       grid of specs (low-pass, high-pass, band-pass, band-stop,
//       Butterworth at any Amax, Chebyshev 0.5 dB, symmetric and
//       asymmetric bands, one or two Amin), the exact design meets the
//       page's spec, and so does the design built from the exact parts of
//       every circuit;
//   (e) the checkers take the right numbers and name the classic slips;
//   (f) the stage formulas for any parts equal the nodal solution of the
//       netlist spice.js writes for them (random unequal parts);
//   (g) the gain stages in the netlist, the .asc (parity, audit, real
//       op-amps) and the stage drawings;
//   (h) the Q sensitivities equal finite differences;
//   (i) every TeX string renders under strict KaTeX and every text keeps
//       the word rules (no you/your, no dashes, no course words, no
//       placeholders);
//   (j) every Python snippet runs and prints the module's numbers within
//       1e-6 (skipped with a message when python or its packages are
//       missing).
//
// Run with: npm run check:hand

import katex from 'katex';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as hd from '../src/lib/filter/handDesign.js';
import { butterworthStages, chebyshevStages } from '../src/lib/filter/order.js';
import { bandStopbandRatio, designBandPassTransformed, designBandStopTransformed, designHighPass, designLowPass } from '../src/lib/filter/stages.js';
import { magnitudePhaseAt, responseAt } from '../src/lib/filter/bode.js';
import { buildElements, generateNetlist, generateSchematic } from '../src/lib/filter/spice.js';
import { audit } from '../src/lib/spice/geometry.js';
import * as circuits from '../src/lib/filter/circuits.js';
import { abs, ascParity, parseNetlist, solveAt, sub } from './lib-nodal.mjs';
import { checkDiagram } from './lib-diagram-audit.mjs';
import { realOpampProblems } from './lib-real-opamp.mjs';

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-300) + 1e-300;

// a seeded generator, so a failure repeats
let seed = 20261014;
const rand = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const logUniform = (lo, hi) => lo * (hi / lo) ** rand();

/* ------------------------------------------------------------ (a) tables */
{
	let worst = 0;
	for (let n = 1; n <= 6; n++) {
		for (const [table, proto] of [
			[hd.BUTTERWORTH_TABLE, butterworthStages(n)],
			[hd.CHEBYSHEV_TABLE, chebyshevStages(n, 0.5)]
		]) {
			const row = table[n - 1];
			const quads = row.factors.filter((f) => f.p === undefined);
			const real = row.factors.find((f) => f.p !== undefined);
			if (quads.length !== proto.stages.length || !!real !== !!proto.real) worst = Infinity;
			quads.forEach((f, i) => {
				worst = Math.max(worst, Math.abs(f.a - proto.stages[i].a), Math.abs(f.b - proto.stages[i].b));
			});
			if (real) worst = Math.max(worst, Math.abs(real.p - proto.real.breal));
		}
	}
	check('tables: Butterworth and Chebyshev 0.5 dB, orders 1 to 6, equal the library prototypes to 1e-6', worst <= 1e-6, `largest gap ${worst.toExponential(2)}`);
}

/* ------------------------------------------------------------ (b) values */
{
	const cases = [
		['1.5e-9', 1.5e-9],
		['1.5n', 1.5e-9],
		['10k', 1e4],
		['4k7', 4700],
		['1n5', 1.5e-9],
		['2.2u', 2.2e-6],
		['2.2uF', 2.2e-6],
		['100p', 1e-10],
		['100 pF', 1e-10],
		['1M', 1e6],
		['1meg', 1e6],
		['10 kΩ', 1e4],
		['4,7k', 4700],
		['6.283e5 rad/s', 628300],
		['0.25', 0.25],
		['-3', -3],
		['1e3Hz', 1000],
		['0,125', 0.125],
		['6,283e5', 628300]
	];
	const bad = cases.filter(([t, want]) => !near(hd.parseValue(t), want, 1e-12));
	// a comma before three digits could be a thousands separator: not read, and the check says why
	const unread = ['', 'abc', '1..2', '10 kk', '10,000', '8,875', '1,234,567', '4,700k'].filter((t) => !Number.isNaN(hd.parseValue(t)));
	const comma = hd.judge('8,875', 8875);
	check(
		`values: ${cases.length} ways of typing a value read right, nonsense and thousands commas read as NaN, and a thousands comma is named`,
		bad.length === 0 && unread.length === 0 && comma.state === 'unread' && /comma/.test(comma.message),
		bad.length ? bad.map(([t]) => `${t} -> ${hd.parseValue(t)}`).join(', ') : unread.join(', ') || comma.message
	);
}

/* ------------------------------------------------- (c) reference numbers */
const sig = (x, d = 4) => Number(x.toPrecision(d));
{
	const spec = hd.handSpec({ filterType: 'highpass', fp: 100000, fs: 60000, amaxDb: 0.5, aminDb: 20 });
	const c = hd.solveAll(spec, 'chebyshev');
	const f = c.s4.factors;
	const coefs = [f[0].a, f[0].b, f[1].a, f[1].b].map((x) => sig(x));
	check(
		'reference: Chebyshev 0.5 dB high-pass, 100 kHz / 60 kHz / 20 dB: n >= 3.6794 -> 4, Hd = s^4 / ((s^2 + 2.072e5 s + 3.712e11)(s^2 + 1.493e6 s + 1.108e12))',
		sig(c.s2.value, 5) === 3.6794 && c.s2.n === 4 && coefs.join() === [2.072e5, 3.712e11, 1.493e6, 1.108e12].join() && c.s4.numerator.coef === 1 && c.s4.numerator.power === 4,
		`n >= ${c.s2.value.toFixed(4)}, ${coefs.join(', ')}`
	);
	const b = hd.solveAll(spec, 'butterworth');
	check('reference: the same high-pass as a Butterworth needs n = 6.56 -> 7, past the tables', sig(b.s2.value, 3) === 6.56 && b.s2.n === 7 && b.stop === 'order' && b.s2.beyond, `${b.s2.value.toFixed(4)}`);
	const bpSpec = hd.handSpec({ filterType: 'bandpass', fl: 20000, fh: 40000, fsl: 10000, fsh: 80000, amaxDb: 3.0103, aminDb: 20 });
	const bp = hd.solveAll(bpSpec, 'butterworth');
	const q = bp.s4.factors.map((x) => [sig(x.a), sig(x.b)]);
	const K = (kinds) => hd.stagesStep(bp.s1, bp.s4, kinds).K;
	check(
		'reference: Butterworth band-pass 20 to 40 kHz, order 2: Hd = 1.5791e10 s^2 / ((s^2 + 6.669e4 s + 1.897e10)(s^2 + 1.11e5 s + 5.258e10)); splits LP+HP 0.83, HP+LP 0.3, BP+BP 2.13',
		bp.s2.n === 2 &&
			sig(bp.s4.numerator.coef, 5) === 1.5791e10 &&
			q[0].join() === [6.669e4, 1.897e10].join() &&
			sig(q[1][0], 3) === 1.11e5 &&
			q[1][1] === 5.258e10 &&
			sig(K(['lowpass', 'highpass']), 2) === 0.83 &&
			sig(K(['highpass', 'lowpass']), 1) === 0.3 &&
			sig(K(['bandpass', 'bandpass']), 3) === 2.13,
		`${q.map((x) => x.join(', ')).join(' / ')}, K = ${sig(K(['lowpass', 'highpass']))}, ${sig(K(['highpass', 'lowpass']))}, ${sig(K(['bandpass', 'bandpass']))}`
	);
}

/* --------------------------------------------- (d) against the automatic tool */

const SPECS = [];
for (const fs of [1300, 2000, 4000]) for (const amaxDb of [0.1, 1, 3, 3.0103]) for (const aminDb of [20, 45]) SPECS.push({ filterType: 'lowpass', fp: 1000, fs, amaxDb, aminDb });
for (const fs of [770, 500, 250]) for (const amaxDb of [0.5, 1, 3]) for (const aminDb of [20, 45]) SPECS.push({ filterType: 'highpass', fp: 1000, fs, amaxDb, aminDb });
// band-pass, fl fh = 2e6: symmetric, then fsl fsh over and under fl fh, one Amin or two
for (const [fsl, fsh] of [
	[500, 4000],
	[800, 2500],
	[600, 4000],
	[500, 3000]
]) {
	for (const amaxDb of [0.5, 1, 3.0103]) {
		for (const [lo, hi] of [
			[30, 30],
			[25, 35],
			[35, 25]
		]) {
			SPECS.push({ filterType: 'bandpass', fl: 1000, fh: 2000, fsl, fsh, amaxDb, aminDb: Math.max(lo, hi), amaxAtFl: amaxDb, amaxAtFh: amaxDb, aminAtFsl: lo, aminAtFsh: hi });
		}
	}
}
// band-stop, fl fh = 4e6, one Amin
for (const [fsl, fsh] of [
	[1600, 2500],
	[1800, 4e6 / 1800],
	[1500, 2000],
	[1800, 3000]
]) {
	for (const amaxDb of [0.5, 1, 3.0103]) for (const aminDb of [20, 30]) SPECS.push({ filterType: 'bandstop', fl: 1000, fh: 4000, fsl, fsh, amaxDb, aminDb, amaxAtFl: amaxDb, amaxAtFh: amaxDb, aminAtFsl: aminDb, aminAtFsh: aminDb });
}
// n_exact just under 1: the exact first-order design sits on both limits
SPECS.push({ filterType: 'lowpass', fp: 1000, fs: 3000, amaxDb: 3.0103, aminDb: 10 }, { filterType: 'highpass', fp: 3000, fs: 1000, amaxDb: 3.0103, aminDb: 10 });
// two different Amax at a band's edges: the method takes the smaller
SPECS.push({ filterType: 'bandpass', fl: 1000, fh: 2000, fsl: 500, fsh: 4000, amaxDb: 1, aminDb: 30, amaxAtFl: 1, amaxAtFh: 2, aminAtFsl: 30, aminAtFsh: 30 });

const RESPONSES = ['butterworth', 'chebyshev'];
const E24 = { resistorSeries: 'E24', capacitors: null, pairs: false };
/** Every ctx the grid builds, kept for the text checks below, and those refused at step 1. */
const contexts = [];
const blockedContexts = [];
{
	let ran = 0;
	let beyond = 0;
	let blocked = 0;
	const problems = [];
	let built = 0;
	// by wn to 1e-9 then Q: equal wn may differ in their last bit from one computation to the other
	const sortStages = (list) => [...list].sort((x, y) => Math.round(1e9 * Math.log(x.wn / y.wn)) || x.q - y.q);
	for (const raw of SPECS) {
		const spec = hd.handSpec(raw);
		if (!spec.valid) {
			problems.push(`invalid spec ${JSON.stringify(raw)}`);
			continue;
		}
		for (const response of RESPONSES) {
			const ctx = hd.solveAll(spec, response);
			const tag = `${raw.filterType} ${response} ${JSON.stringify(raw)}`;
			if (ctx.stop === 'ripple') {
				blocked++;
				blockedContexts.push(ctx);
				if (!(response === 'chebyshev' && spec.amaxDb < 0.5)) problems.push(`${tag}: blocked`);
				continue;
			}
			if (response === 'chebyshev' && spec.amaxDb < 0.5) problems.push(`${tag}: not blocked under 0.5 dB`);
			const t = raw.filterType;
			const amax = ctx.s1.amaxDb;
			// step 1 and the order
			let auto;
			if (t === 'lowpass' || t === 'highpass') {
				const design = (t === 'lowpass' ? designLowPass : designHighPass)({ response, amaxDb: amax, aminDb: spec.aminDb, fp: spec.fp, fs: spec.fs, order: null });
				if (!near(design.k, ctx.s1.k, 1e-12)) problems.push(`${tag}: k ${ctx.s1.k} against ${design.k}`);
				if (design.n !== ctx.s2.n || !near(design.minOrder, ctx.s2.value, 1e-12)) problems.push(`${tag}: n ${ctx.s2.value}/${ctx.s2.n} against ${design.minOrder}/${design.n}`);
				if (ctx.stop === 'order') {
					beyond++;
					contexts.push(ctx);
					continue;
				}
				auto = (t === 'lowpass' ? designLowPass : designHighPass)({ response, amaxDb: amax, aminDb: spec.aminDb, fp: spec.fp, fs: spec.fs, order: ctx.s2.n });
				if (!near(auto.wc, ctx.s4.wd, 1e-12)) problems.push(`${tag}: wc ${ctx.s4.wd} against ${auto.wc}`);
				const hand = ctx.s5.stages;
				const second = sortStages(hand.filter((s) => s.order === 2));
				const second2 = sortStages(auto.stages.filter((s) => s.order === 2));
				if (second.length !== second2.length || second.some((s, i) => !near(s.wn, second2[i].wn, 1e-5) || !near(s.q, second2[i].q, 1e-5))) problems.push(`${tag}: stages differ`);
				const first = hand.find((s) => s.order === 1);
				const first2 = auto.stages.find((s) => s.order === 1);
				if (!!first !== !!first2 || (first && !near(first.p, 1 / first2.tau, 1e-5))) problems.push(`${tag}: first-order stage differs`);
				if (!near(ctx.s5.K, 1, 1e-12)) problems.push(`${tag}: K = ${ctx.s5.K}, not 1`);
			} else {
				// the band k is 1/Omega of the nearer stopband edge, the symmetric fix's own result
				const omega = Math.min(bandStopbandRatio(t, spec.fl, spec.fh, spec.fsl), bandStopbandRatio(t, spec.fl, spec.fh, spec.fsh));
				if (!near(ctx.s1.k, 1 / omega, 1e-10)) problems.push(`${tag}: k ${ctx.s1.k} against 1/Omega ${1 / omega}`);
				if (!near(ctx.s1.sym.fsl * ctx.s1.sym.fsh, spec.fl * spec.fh, 1e-12)) problems.push(`${tag}: not symmetric after the fix`);
				const stricter = t === 'bandpass' ? ctx.s1.sym.fsl >= spec.fsl - 1e-9 && ctx.s1.sym.fsh <= spec.fsh + 1e-9 : ctx.s1.sym.fsl <= spec.fsl + 1e-9 && ctx.s1.sym.fsh >= spec.fsh - 1e-9;
				if (!stricter) problems.push(`${tag}: the symmetric fix loosens the spec`);
				const args = { response, amaxDb: amax, aminDbLow: spec.aminLow, aminDbHigh: spec.aminHigh, fl: spec.fl, fh: spec.fh, fsl: spec.fsl, fsh: spec.fsh };
				const min = t === 'bandpass' ? designBandPassTransformed(args) : designBandStopTransformed({ ...args, aminDb: spec.aminDb });
				if (spec.aminSplit ? ctx.s2.n < min.n : ctx.s2.n !== min.n) problems.push(`${tag}: n ${ctx.s2.n} against ${min.n}`);
				if (ctx.stop === 'order') {
					beyond++;
					contexts.push(ctx);
					continue;
				}
				auto = t === 'bandpass' ? designBandPassTransformed({ ...args, order: ctx.s2.n }) : designBandStopTransformed({ ...args, aminDb: spec.aminDb, order: ctx.s2.n });
				const hand = sortStages(ctx.s5.stages);
				const other = sortStages(auto.stages);
				if (hand.length !== other.length || hand.some((s, i) => !near(s.wn, other[i].wn, 1e-5) || !near(s.q, other[i].q, 1e-5))) problems.push(`${tag}: band stages differ`);
				if (t === 'bandstop' && (ctx.s5.stages.some((s) => !near(s.wz, auto.w0, 1e-12)) || !near(ctx.s5.K, 1, 1e-12))) problems.push(`${tag}: notch zeros or K`);
				if (t === 'bandpass') {
					const gains = auto.stages.reduce((acc, s) => acc * s.gain, 1);
					if (!near(ctx.s5.K, gains, 1e-5)) problems.push(`${tag}: K ${ctx.s5.K} against the product of the stage gains ${gains}`);
				}
			}
			ran++;
			contexts.push(ctx);
			// the exact design meets the page's spec
			const ideal = hd.verdict(spec, hd.idealStages(ctx));
			if (!ideal.ok) problems.push(`${tag}: the exact design misses ${ideal.edges.filter((e) => !e.ok).map((e) => `${e.name} ${e.loss.toFixed(3)}/${e.limit}`).join(', ')}`);
			// built from the exact parts of each circuit, with the stock's own capacitors
			if (t === 'bandstop') continue;
			for (const pickIndex of [0, 1]) {
				const stages = [];
				let failed = null;
				for (const st of ctx.s5.stages) {
					const choices = hd.topologyChoices(st);
					const topo = choices[Math.min(pickIndex, choices.length - 1)];
					const caps = hd.suggestCaps(topo, st, E24);
					const sol = caps && hd.solveParts(topo, st, caps);
					if (!sol?.ok) {
						failed = `${topo} ${sol?.text ?? 'no capacitors'}`;
						break;
					}
					const parts = { ...caps, ...sol.parts };
					const r = hd.stageResult(topo, st, parts);
					// a Sallen-Key with equal resistors takes its Q from the capacitor ratio
					const qFree = topo === 'sallenKey';
					const errs = Object.entries(r.errors).filter(([k]) => !(qFree && k === 'q'));
					if (errs.some(([, e]) => Math.abs(e) > 1e-9)) failed = `${topo} exact parts miss ${errs.map(([k, e]) => `${k} ${e.toExponential(1)}`).join(', ')}`;
					// with the ratio at 4Q^2 the Sallen-Key's Q is exact too
					const exactCaps = qFree ? { Ctop: 4 * st.q * st.q * caps.Cbottom, Cbottom: caps.Cbottom } : caps;
					const exact = qFree ? { ...exactCaps, ...hd.solveParts(topo, st, exactCaps).parts } : parts;
					stages.push(hd.realizeStage(topo, exact));
				}
				if (!failed && ctx.s5.K !== 1 && Math.abs(ctx.s5.K - 1) > 1e-12) {
					const circuit = hd.gainCircuitFor(ctx.s5.K);
					const g = hd.solveGain(circuit, ctx.s5.K, 10000);
					stages.push(hd.realizeStage(circuit, g.parts));
				}
				if (failed) {
					problems.push(`${tag}: ${failed}`);
					continue;
				}
				built++;
				const v = hd.verdict(spec, stages);
				if (!v.ok) problems.push(`${tag} circuits ${pickIndex}: the built design misses ${v.edges.filter((e) => !e.ok).map((e) => `${e.name} ${e.loss.toFixed(3)}/${e.limit}`).join(', ')}`);
			}
		}
	}
	// every split of a band-pass: the powers of s add up, and the exact design meets the spec whatever the split
	let splits = 0;
	for (const ctx of contexts.filter((c) => c.spec.filterType === 'bandpass' && c.s5 && c.s2.n % 2 === 0)) {
		const half = ctx.s2.n / 2;
		for (const kinds of [Array(ctx.s2.n * 1).fill('bandpass'), [...Array(half).fill('lowpass'), ...Array(half).fill('highpass')], [...Array(half).fill('highpass'), ...Array(half).fill('lowpass')]]) {
			const c2 = hd.solveAll(ctx.spec, ctx.response, { kinds });
			splits++;
			if (!c2.s5.kindsOk) problems.push(`split ${kinds} not accepted`);
			else if (!hd.verdict(ctx.spec, hd.idealStages(c2)).ok) problems.push(`split ${kinds}: misses the spec`);
		}
		const wrong = hd.solveAll(ctx.spec, ctx.response, { kinds: Array(ctx.s2.n).fill('lowpass') });
		if (wrong.s5.kindsOk) problems.push('all low-pass stages accepted for a band-pass');
	}
	check(
		`grid: ${ran} designs (and ${beyond} past the tables, ${blocked} Chebyshev under 0.5 dB refused) equal the automatic tool step by step; the exact designs meet the page's spec; ${built} built from exact parts meet it too; ${splits} band-pass splits`,
		problems.length === 0 && ran > 150,
		problems.slice(0, 3).join('; ')
	);
}

/* ---------------------------------------------------------- (e) checkers */
{
	const problems = [];
	const right = (ctx) => {
		const v1 = { k: String(ctx.s1.k) };
		if (ctx.spec.band) {
			if (ctx.s1.sym.moved) v1.edge = String(ctx.s1.sym[ctx.s1.sym.moved]);
			v1.wc = String(ctx.s1.wc);
			v1.B = String(ctx.s1.B);
		}
		const v4 = { w: String(ctx.spec.band ? ctx.s4.Bd : ctx.s4.wd), num: String(ctx.s4.numerator.coef) };
		ctx.s4.factors.forEach((f, i) => (f.kind === 'real' ? (v4[`f${i}.p`] = String(f.p)) : ((v4[`f${i}.a`] = String(f.a)), (v4[`f${i}.b`] = String(f.b)))));
		const v5 = { K: String(ctx.s5.K) };
		ctx.s5.stages.forEach((s, i) => (s.order === 1 ? (v5[`${i}.p`] = String(s.p)) : ((v5[`${i}.wn`] = String(s.wn)), (v5[`${i}.q`] = String(s.q)))));
		return { v1, v2: { value: String(ctx.s2.value), n: String(ctx.s2.n) }, v4, v5 };
	};
	const allOk = (x) => {
		const leaves = [];
		const walk = (y) => {
			if (!y || typeof y !== 'object') return;
			if ('state' in y && 'message' in y) leaves.push(y);
			else Object.values(y).forEach(walk);
		};
		walk(x);
		return leaves.length > 0 && leaves.every((l) => l.state === 'ok');
	};
	let n = 0;
	for (const ctx of contexts.filter((c) => c.s5)) {
		const { v1, v2, v4, v5 } = right(ctx);
		// the factors typed in reverse order still match
		const rows = hd.factorRows(ctx.s4, v4).reverse();
		const results = [hd.checkSpec(ctx, v1), hd.checkOrder(ctx, v2), hd.checkTable(ctx, ctx.s2.n), hd.checkDenorm(ctx, v4, rows.some((r) => r.p !== undefined) ? hd.factorRows(ctx.s4, v4) : rows), hd.checkStages(ctx, v5)];
		n++;
		if (!results.every(allOk)) problems.push(`right values refused: ${ctx.spec.filterType} ${ctx.response} n=${ctx.s2.n}`);
	}
	const lp = contexts.find((c) => c.s5 && c.spec.filterType === 'lowpass' && c.response === 'butterworth' && Math.abs(c.s4.scale - 1) > 0.01);
	const neg = hd.checkOrder(lp, { value: String(-lp.s2.value), n: String(lp.s2.n - 1) });
	if (!/upside down, this gives a negative n/.test(neg.value.message)) problems.push(`negative n: ${neg.value.message}`);
	if (!/Round up/.test(neg.n.message)) problems.push(`rounded down: ${neg.n.message}`);
	const hz = hd.checkSpec(lp, { k: String(1 / lp.s1.k) });
	if (!/upside down/.test(hz.k.message)) problems.push(`1/k: ${hz.k.message}`);
	const d = hd.checkDenorm(lp, { w: String(lp.s1.wmax), num: String(lp.s4.numerator.coef) }, hd.factorRows(lp.s4, {}));
	if (!/ωmax itself/.test(d.w.message)) problems.push(`no Butterworth correction: ${d.w.message}`);
	const d2 = hd.checkDenorm(lp, { w: String(lp.s4.wd / (2 * Math.PI)) }, []);
	if (!/frequency in Hz/.test(d2.w.message)) problems.push(`Hz: ${d2.w.message}`);
	const bpAsym = contexts.find((c) => c.s5 && c.spec.filterType === 'bandpass' && c.s1.sym.moved);
	const raw = hd.checkSpec(bpAsym, { k: String(bpAsym.s1.rawK) });
	if (!/symmetric first/.test(raw.k.message)) problems.push(`raw band k: ${raw.k.message}`);
	const cheb = contexts.find((c) => c.s5 && c.response === 'chebyshev' && c.spec.amaxDb > 0.5 && !c.spec.band);
	const chebAmax = hd.checkOrder(cheb, { value: String(hd.orderValue('chebyshev', cheb.spec.amaxDb, cheb.s1.aminDb, cheb.s1.k)), n: '' });
	if (!/0\.5 dB of ripple/.test(chebAmax.value.message)) problems.push(`Chebyshev Amax: ${chebAmax.value.message}`);
	// wn in rad/s or f0 in Hz both pass; an upside-down Q is named
	const st = hd.checkStages(lp, { '0.wn': String(lp.s5.stages[0].wn / (2 * Math.PI)), '0.q': String(1 / lp.s5.stages[0].q), '1.wn': String(lp.s5.stages[1].wn) });
	if (st.stages[0].wn.state !== 'ok' || st.stages[1].wn.state !== 'ok' || !/upside down/.test(st.stages[0].q.message)) problems.push(`stage slips: ${st.stages[0].wn.message} / ${st.stages[0].q.message}`);
	const blank = hd.judge('', 1);
	const garbage = hd.judge('ten', 1);
	if (blank.state !== 'empty' || garbage.state !== 'unread') problems.push('blank or unreadable input');
	// a first-order factor left blank says so under its own field
	const odd = contexts.find((c) => c.s5 && c.spec.filterType === 'lowpass' && c.s4.factors.some((f) => f.kind === 'real') && c.s4.factors.length > 1);
	const v4odd = {};
	odd.s4.factors.forEach((f, i) => f.kind === 'quadratic' && ((v4odd[`f${i}.a`] = String(f.a)), (v4odd[`f${i}.b`] = String(f.b))));
	const blankP = hd.checkDenorm(odd, v4odd, hd.factorRows(odd.s4, v4odd)).factors.find((r) => 'p' in r);
	if (blankP?.p?.state !== 'empty') problems.push(`a blank first-order factor: ${JSON.stringify(blankP)}`);
	// a wrong value learns its direction and a rough size, never a figure to work the answer back from
	for (const x of [0.3, 0.9, 0.97, 1.02, 1.3, 5, 40]) {
		const m = hd.judge(String(1234.5 * x), 1234.5).message;
		if (/\d/.test(m) || !/too (high|low)/.test(m)) problems.push(`the message for ${x} times the answer: ${m}`);
	}
	check(`checkers: the right numbers pass in ${n} designs (factors in any order); the order's sign, rounding down, 1/k, Hz for rad/s, the missing Butterworth correction, the raw band k, Chebyshev at the page's Amax and an upside-down Q are each named; wn passes in rad/s or as f0 in Hz; a blank first-order factor is named; a wrong value is told its direction only`, problems.length === 0, problems.slice(0, 3).join('; '));
}

/* --------------------------- (e) the reader's own numbers, carried forward */
{
	// A reader who rounds every result to three significant figures and
	// carries the rounded numbers into the next step (B from step 1 into
	// Bd, ωc or Bd into the numerator and the factors, the factors into ωn,
	// Q and K): every number is accepted. Only an order whose rounded value
	// falls on the other side of a whole number is refused, rightly.
	const R = (x) => Number(x.toPrecision(3));
	const problems = [];
	let designs = 0;
	let crossings = 0;
	for (const ctx of contexts.filter((c) => c.s5)) {
		designs++;
		const { s1, s3, s4, s5, spec } = ctx;
		const t = spec.filterType;
		const v1 = { k: String(R(s1.k)) };
		if (spec.band) {
			if (s1.sym.moved) v1.edge = String(R(s1.sym[s1.sym.moved]));
			v1.wc = String(R(s1.wc));
			v1.B = String(R(s1.B));
		}
		const nx = R(hd.orderValue(ctx.response, s1.amaxDb, s1.aminDb, R(s1.k)));
		const v2 = { value: String(nx), n: String(ctx.s2.n) };
		if (Math.max(1, Math.ceil(nx)) !== ctx.s2.n) crossings++;
		const w = spec.band ? R(R(s1.B) * s4.scale) : R(s1.wmax * s4.scale);
		const v4 = { w: String(w), num: String(R(t === 'lowpass' || t === 'bandpass' ? s3.numerator * w ** ctx.s2.n : s4.numerator.coef)) };
		// a band's factors come from the Python, a low-pass or high-pass's from the reader's own ωc
		const typed = spec.band
			? s4.factors.map((f) => ({ a: R(f.a), b: R(f.b) }))
			: s3.factors.map((f) => (f.p !== undefined ? { p: R(t === 'lowpass' ? f.p * w : w / f.p) } : t === 'lowpass' ? { a: R(f.a * w), b: R(f.b * w * w) } : { a: R((f.a * w) / f.b), b: R((w * w) / f.b) }));
		typed.forEach((f, i) => ('p' in f ? (v4[`f${i}.p`] = String(f.p)) : ((v4[`f${i}.a`] = String(f.a)), (v4[`f${i}.b`] = String(f.b)))));
		const v5 = {};
		let product = 1;
		s5.stages.forEach((st, i) => {
			const f = typed[i];
			if (st.order === 1) {
				v5[`${i}.p`] = String(f.p);
				product *= st.kind === 'lowpass' ? f.p : 1;
				return;
			}
			v5[`${i}.wn`] = String(R(Math.sqrt(f.b)));
			v5[`${i}.q`] = String(R(Math.sqrt(f.b) / f.a));
			product *= st.kind === 'lowpass' ? f.b : st.kind === 'bandpass' ? f.a : 1;
		});
		v5.K = String(R(Number(v4.num) / product));
		const results = { s1: hd.checkSpec(ctx, v1), s2: hd.checkOrder(ctx, v2, { v1 }), s4: hd.checkDenorm(ctx, v4, hd.factorRows(s4, v4), { v1 }), s5: hd.checkStages(ctx, v5, { v1, v4 }) };
		const refused = [];
		const walk = (x, path) => {
			if (!x || typeof x !== 'object') return;
			if ('state' in x && 'message' in x) {
				if (x.state !== 'ok') refused.push(`${path}: ${x.message}`);
			} else for (const [k, y] of Object.entries(x)) walk(y, `${path}.${k}`);
		};
		walk(results, 'step');
		if (refused.length) problems.push(`${t} ${ctx.response} n=${ctx.s2.n} ${JSON.stringify(spec).slice(0, 80)}: ${refused.slice(0, 2).join(', ')}`);
	}
	check(`carried numbers: in ${designs} designs a reader who keeps three significant figures and carries them from step to step has every number accepted (${crossings} rounded order values fall on the next whole number, which step 2's n then names)`, problems.length === 0 && designs > 150, problems.slice(0, 2).join('; '));
}

/* ------------------------------------------- (f) stage formulas against nodal */
const STAGE_TYPE = { sallenKey: 'lowpass', mfb: 'lowpass', firstOrder: 'lowpass', sallenKeyHp: 'highpass', mfbHp: 'highpass', firstOrderHp: 'highpass', mfbBp: 'bandpass', gainInv: 'lowpass', gainDivider: 'lowpass', gainNonInv: 'lowpass' };
const netOpts = (stages, filterType = 'lowpass') => ({ realizedStages: stages, filterType, response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 1000, fs: 3000, fl: 1000, fh: 2000, fsl: 500, fsh: 4000, aminDbLow: 40, aminDbHigh: 40, topology: 'by hand', structure: 'cascade', ideal: true });
// four significant figures, as the netlist writes them (spiceValue), so the file holds the very parts
const sig4 = (x) => Number(x.toPrecision(4));
const randomParts = (topology) => Object.fromEntries(hd.partNames(topology).map((nm) => [nm, sig4(/^R/.test(nm) ? logUniform(1e3, 1e5) : logUniform(1e-9, 1e-7))]));
{
	let worst = 0;
	let where = '';
	let cases = 0;
	for (const topology of Object.keys(hd.TOPOLOGIES)) {
		for (let k = 0; k < 20; k++) {
			const parts = randomParts(topology);
			const stage = hd.realizeStage(topology, parts);
			const elements = parseNetlist(generateNetlist(netOpts([stage], STAGE_TYPE[topology] === 'bandpass' ? 'bandpass' : STAGE_TYPE[topology])));
			const f0 = stage.actual.wn ? stage.actual.wn / (2 * Math.PI) : stage.actual.tau ? 1 / (2 * Math.PI * stage.actual.tau) : 1000;
			for (const m of [0.05, 0.3, 0.9, 1, 1.1, 3, 20]) {
				const sim = solveAt(elements, f0 * m);
				const h = responseAt([stage], f0 * m);
				const err = abs(sub(sim, h)) / Math.max(abs(h), 1e-300);
				if (err > worst) {
					worst = err;
					where = `${topology} at ${(f0 * m).toFixed(1)} Hz`;
				}
			}
			cases++;
		}
	}
	check(`stage formulas: ${cases} stages of random unequal parts, every circuit and gain stage, equal the nodal solution of their netlist (sign and phase included)`, worst < 1e-9, `worst ${worst.toExponential(1)} at ${where}`);
	// the exact parts the panel solves for give the stage's targets exactly, unequal capacitors too
	let solved = 0;
	const misses = [];
	for (let k = 0; k < 60; k++) {
		const st = { order: 2, wn: 2 * Math.PI * logUniform(100, 1e5), q: logUniform(0.4, 8) };
		for (const topology of ['sallenKey', 'mfb', 'sallenKeyHp', 'mfbHp', 'mfbBp']) {
			const caps = Object.fromEntries(hd.TOPOLOGIES[topology].caps.map((nm) => [nm, logUniform(1e-10, 1e-7)]));
			if (topology === 'sallenKey') caps.Ctop = caps.Cbottom * 4 * st.q * st.q * (1 + rand());
			const typed = topology === 'sallenKey' ? { R1: '20k', R2: '10k' } : {};
			const sol = hd.solveParts(topology, st, caps, typed);
			if (topology === 'mfb') {
				const possible = caps.C1 / caps.C2 >= 8 * st.q * st.q;
				if (sol.ok !== possible) misses.push(`mfb ratio ${caps.C1 / caps.C2} vs 8Q^2 ${8 * st.q * st.q}: ok ${sol.ok}`);
			}
			if (topology === 'mfbBp') {
				const possible = 1 < st.q * st.q * (1 + caps.C2 / caps.C1);
				if (sol.ok !== possible) misses.push(`mfbBp gain ceiling: ok ${sol.ok}`);
			}
			if (!sol.ok) continue;
			for (const parts of [sol.parts, ...(sol.other ? [sol.other] : [])]) {
				const r = hd.stageResult(topology, st, { ...caps, ...parts });
				const gainOff = topology === 'mfbHp' ? Math.abs(r.actual.gain + caps.C1 / caps.C3) : Math.abs(Math.abs(r.actual.gain) - 1);
				if (Math.abs(r.errors.wn) > 1e-9 || Math.abs(r.errors.q) > 1e-9 || gainOff > 1e-9) misses.push(`${topology}: ${JSON.stringify(r.errors)}`);
			}
			solved++;
		}
	}
	for (let k = 0; k < 30; k++) {
		const K = logUniform(0.05, 20);
		for (const circuit of ['gainInv', 'gainDivider', 'gainNonInv']) {
			const g = hd.solveGain(circuit, K, logUniform(1e3, 1e5));
			const possible = circuit === 'gainInv' || (circuit === 'gainDivider' ? K < 1 : K > 1);
			if (g.ok !== possible) misses.push(`${circuit} K ${K}: ok ${g.ok}`);
			if (g.ok && Math.abs(Math.abs(hd.TOPOLOGIES[circuit].actual(g.parts).gain) - K) > 1e-9 * K) misses.push(`${circuit} gain`);
		}
	}
	check(`exact parts: ${solved} solved stages (unequal capacitors, Sallen-Key with unequal resistors) give their targets to 1e-9; the 8Q^2 and band-pass gain limits refuse exactly the impossible pairs; gain stages hit K`, misses.length === 0, misses.slice(0, 3).join('; '));
}

/* ------------------------------------------------------- (g) gain stages */
{
	const problems = [];
	const sk = hd.realizeStage('sallenKey', { R1: 11000, R2: 9100, Ctop: 22e-9, Cbottom: 10e-9 });
	const mfbBp = hd.realizeStage('mfbBp', { R1: 15000, R2: 2200, R3: 33000, C1: 1e-9, C2: 1e-9 });
	let chains = 0;
	for (const [circuit, parts] of [
		['gainInv', { R1: 10000, R2: 21300 }],
		['gainDivider', { R1: 10000, R2: 2010 }],
		['gainNonInv', { R1: 10000, R2: 13300 }]
	]) {
		const g = hd.realizeStage(circuit, parts);
		for (const [stages, filterType] of [
			[[g], 'lowpass'],
			[[sk, g], 'lowpass'],
			[[g, sk], 'lowpass'],
			[[mfbBp, g, mfbBp], 'bandpass']
		]) {
			chains++;
			const opts = { ...netOpts(stages, filterType), method: filterType === 'bandpass' ? 'transformed' : undefined, f0: 1414.2, B: 1000 };
			const net = generateNetlist(opts);
			const els = parseNetlist(net);
			for (const f of [10, 300, 1000, 3000, 1e5]) {
				const err = Math.abs(20 * Math.log10(abs(solveAt(els, f))) - magnitudePhaseAt(stages, f).db);
				if (err > 1e-9) problems.push(`${circuit} chain ${stages.length}: ${err} dB at ${f} Hz`);
			}
			const asc = generateSchematic(opts);
			const wanted = buildElements(opts).filter((e) => e.kind !== 'LABEL');
			const { problems: parity } = ascParity(asc, wanted, net);
			problems.push(...parity.map((p) => `${circuit}: ${p}`));
			problems.push(...audit(asc).map((i) => `${circuit} audit: ${i.kind} ${i.detail}`));
			for (const part of ['TL082', 'LM741']) {
				const r = realOpampProblems(asc, generateSchematic({ ...opts, ideal: false, opamp: part }), part);
				problems.push(...r.problems.map((p) => `${circuit} ${part}: ${p}`), ...r.issues.map((i) => `${circuit} ${part}: ${i.kind} ${i.detail}`));
			}
		}
		const build = { gainInv: circuits.buildGainInvDiagram, gainDivider: circuits.buildGainDividerDiagram, gainNonInv: circuits.buildGainNonInvDiagram }[circuit];
		for (const scale of [0.01, 1, 100]) {
			const scaled = { R1: parts.R1 * scale, R2: parts.R2 * scale };
			for (const ohms of [undefined, () => '12.1k + 3.32k', () => '1.00M + 1.00M']) {
				// a bug, or anything drawn outside the box
				const bugs = checkDiagram(circuit, build(scaled, ohms ? { ohms } : {})).issues.filter((i) => i.level === 'bug' || i.kind === 'viewbox');
				problems.push(...bugs.map((b) => `${circuit} drawing: ${b.kind} ${b.msg}`));
			}
		}
	}
	check(`gain stages: ${chains} chains with an inverting, a divider or a non-inverting stage solve to the Bode model; their .asc wires as the netlist, draws clean, also with a TL082 or an LM741; the stage drawings audit clean`, problems.length === 0, problems.slice(0, 3).join('; '));
}

/* ---------------------------------- the reader's whole filter in LTspice */
{
	const problems = [];
	let files = 0;
	for (const ctx of contexts.filter((c) => c.s5 && c.spec.filterType !== 'bandstop').filter((_, i) => i % 7 === 0)) {
		const stages = ctx.s5.stages.map((st) => {
			const topo = hd.topologyChoices(st)[0];
			const caps = hd.suggestCaps(topo, st, E24);
			// the parts as typed: four significant figures, as the file writes them
			const parts = { ...caps, ...hd.solveParts(topo, st, caps).parts };
			return hd.realizeStage(topo, Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, sig4(v)])));
		});
		if (Math.abs(ctx.s5.K - 1) > 1e-12) {
			const circuit = hd.gainCircuitFor(ctx.s5.K);
			const g = hd.solveGain(circuit, ctx.s5.K, 10000).parts;
			stages.push(hd.realizeStage(circuit, { R1: g.R1, R2: sig4(g.R2) }));
		}
		const opts = { ...hd.schematicOptions(ctx.spec, ctx, stages), ideal: true };
		const net = generateNetlist(opts);
		const els = parseNetlist(net);
		const frame = hd.filterFrame(ctx.spec);
		for (const f of [...frame.pass, ...frame.stop]) {
			const err = Math.abs(20 * Math.log10(abs(solveAt(els, f))) - magnitudePhaseAt(stages, f).db);
			if (err > 1e-6) problems.push(`${ctx.spec.filterType}: ${err} dB at ${f}`);
		}
		const asc = generateSchematic(opts);
		problems.push(...ascParity(asc, buildElements(opts).filter((e) => e.kind !== 'LABEL'), net).problems, ...audit(asc).map((i) => `${i.kind} ${i.detail}`));
		if (/undefined|NaN|null/.test(asc)) problems.push('a placeholder in the .asc');
		files++;
	}
	check(`the panel's LTspice file: ${files} filters built by hand solve to their Bode model at the edges, and the .asc wires and draws clean`, problems.length === 0 && files > 5, problems.slice(0, 3).join('; '));
}

/* ------------------------------------------------------ (h) sensitivities */
{
	let worst = 0;
	for (let k = 0; k < 40; k++) {
		for (const topology of ['sallenKey', 'mfb']) {
			const parts = randomParts(topology);
			const s = hd.sensitivityOf(topology, parts);
			for (const nm of Object.keys(s)) {
				const h = 1e-6;
				const q = (x) => hd.TOPOLOGIES[topology].actual({ ...parts, [nm]: parts[nm] * x }).q;
				const fd = (Math.log(q(1 + h)) - Math.log(q(1 - h))) / (Math.log(1 + h) - Math.log(1 - h));
				worst = Math.max(worst, Math.abs(fd - s[nm]));
			}
		}
	}
	const equal = hd.sensitivityOf('sallenKey', { R1: 1e4, R2: 1e4, Ctop: 2e-8, Cbottom: 1e-8 });
	check('sensitivities: Sallen-Key and multiple feedback S^Q equal finite differences; equal resistors give S_R^Q = 0, never -2', worst < 1e-6 && equal.R1 === 0 && equal.R2 === 0 && equal.Ctop === 0.5, `worst ${worst.toExponential(1)}`);
}

/* ---------------------------------------------------- (i) TeX and words */
const YOU = /\b(you|your|yours|yourself)\b/i;
const DASHES = /[–—]/;
const PLACEHOLDER = /\bundefined\b|\bNaN\b|\bnull\b|\bInfinity\b|\[object/;
const COURSE = /\b(course|courses|cours|school|professors?|prof|slides?|diapos?|diapositives?|labs?|lectures?|ELE\s?2003|polytechnique|experiments?|moodle|homework|assignments?|teachers?|instructors?|exo\d*)\b/i;
const AVOID = /\b(resonan\w*|discriminants?|dominant)\b/i;
{
	const texts = [];
	const tex = [];
	const addBlocks = (where, list) => {
		for (const b of list ?? []) {
			if (b.p !== undefined) texts.push([where, b.p]);
			else if (b.caution !== undefined) texts.push([where, b.caution]);
			else if (b.warn !== undefined) texts.push([where, b.warn]);
			else if (b.eq !== undefined) tex.push([where, b.eq]);
			else if (b.table) {
				for (const h of b.table.head) texts.push([where, h]);
				for (const row of b.table.rows) for (const cell of row) (b.table.tex ? tex : texts).push([where, b.table.tex ? `\\displaystyle ${cell}` : cell]);
			} else texts.push([where, `unknown block ${JSON.stringify(b)}`]);
		}
	};
	const addTexts = (where, t) => {
		for (const key of ['intro', 'after', 'hint1', 'hint2', 'solution', 'form', 'design']) addBlocks(`${where} ${key}`, t[key]);
	};
	const messages = (where, x) => {
		if (!x || typeof x !== 'object') return;
		if (typeof x.message === 'string') texts.push([where, x.message]);
		for (const y of Object.values(x)) if (y && typeof y === 'object') messages(where, y);
	};
	for (const ctx of contexts) {
		const where = `${ctx.spec.filterType} ${ctx.response} n=${ctx.s2.n}`;
		addTexts(`${where} step 1`, hd.specTexts(ctx));
		addTexts(`${where} step 2`, hd.orderTexts(ctx));
		texts.push([`${where} python 1`, hd.pythonSpec(ctx)], [`${where} python 2`, hd.pythonOrder(ctx)]);
		// what the checkers say to wrong, blank and unreadable values
		for (const v of [{}, { k: 'x', edge: '1', wc: '2', B: '3', value: '-1', n: '0.5' }, { k: '0.5', wc: String(ctx.s1.wc / (2 * Math.PI)), value: '2', n: '1' }]) {
			messages(`${where} checks`, hd.checkSpec(ctx, v));
			messages(`${where} checks`, hd.checkOrder(ctx, v));
		}
		if (ctx.stop === 'order') {
			addBlocks(`${where} beyond`, hd.beyondText(ctx));
			continue;
		}
		addTexts(`${where} step 3`, hd.tableTexts(ctx));
		addTexts(`${where} step 4`, hd.denormTexts(ctx));
		addTexts(`${where} step 5`, hd.stagesTexts(ctx));
		addTexts(`${where} gain`, hd.gainTexts(ctx));
		tex.push([where, hd.hdTex(ctx)], [where, hd.hnTex(ctx.response, ctx.s2.n)], ...ctx.s5.stages.map((st) => [where, hd.stageTex(st)]), ...ctx.s4.factors.map((f) => [where, hd.denormFactorTex(f)]), ...ctx.s3.factors.map((f) => [where, hd.tableFactorTex(f)]));
		texts.push([`${where} python 4`, hd.pythonDenorm(ctx)], [`${where} python 5`, hd.pythonStages(ctx)]);
		messages(`${where} checks`, hd.checkTable(ctx, 1));
		messages(`${where} checks`, hd.checkTable(ctx, null));
		messages(`${where} checks`, hd.checkDenorm(ctx, { w: '1', num: '1' }, hd.factorRows(ctx.s4, {})));
		// half-typed and unreadable factor rows, and one row too many
		const halfTyped = Object.fromEntries(ctx.s4.factors.flatMap((f, i) => (f.kind === 'real' ? [[`f${i}.p`, 'x']] : [[`f${i}.a`, String(f.a)]])));
		messages(`${where} checks`, hd.checkDenorm(ctx, halfTyped, [...hd.factorRows(ctx.s4, halfTyped), { a: '1', b: '2' }, { p: '3' }]));
		messages(`${where} checks`, hd.checkStages(ctx, { K: '0.1' }));
		if (ctx.spec.filterType === 'bandstop') {
			addBlocks(`${where} notch`, hd.notchStopTexts());
			continue;
		}
		for (const st of ctx.s5.stages) {
			for (const topo of hd.topologyChoices(st)) {
				addTexts(`${where} ${topo}`, hd.topologyTexts(topo, st));
				const caps = hd.suggestCaps(topo, st, E24);
				const sol = hd.solveParts(topo, st, caps);
				texts.push([`${where} ${topo} python`, hd.pythonComponents(topo, st, caps)], ...(sol.notes ?? []).map((n) => [`${where} ${topo} note`, n]));
				// a pair of capacitors that cannot work, and its message
				const badCaps = Object.fromEntries(hd.TOPOLOGIES[topo].caps.map((nm) => [nm, nm === 'C2' || nm === 'Ctop' ? 1e-6 : 1e-9]));
				const bad = hd.solveParts(topo, st, badCaps, { R1: '1k', R2: '2k' });
				if (bad.text) texts.push([`${where} ${topo} refusal`, bad.text]);
				(bad.notes ?? []).forEach((n) => texts.push([`${where} ${topo} note`, n]));
			}
		}
		addTexts(`${where} gain stage`, hd.gainStageTexts(ctx.s5.K, ctx.s5.stages.filter((st) => st.kind === 'bandpass').length));
		const ideal = hd.verdict(ctx.spec, hd.idealStages(ctx));
		hd.verdictTexts(ctx.spec, ideal, ideal).forEach((f) => texts.push([`${where} verdict`, f.text]));
		// a filter that misses, for the other wordings
		const off = hd.verdict(ctx.spec, hd.idealStages(ctx).map((s) => (s.order === 2 ? { ...s, actual: { ...s.actual, wn: s.actual.wn * 1.3 } } : s)));
		hd.verdictTexts(ctx.spec, off, ideal).forEach((f) => texts.push([`${where} verdict off`, f.text]));
		for (const m of [1.02, 0.95]) {
			const near = hd.verdict(ctx.spec, hd.idealStages(ctx).map((s) => (s.order === 2 ? { ...s, actual: { ...s.actual, wn: s.actual.wn * m } } : s)));
			hd.verdictTexts(ctx.spec, near, ideal).forEach((f) => texts.push([`${where} verdict near`, f.text]));
		}
	}
	// a Chebyshev refused under 0.5 dB says so, and stops
	for (const ctx of blockedContexts) addTexts(`${ctx.spec.filterType} refused`, hd.specTexts(ctx));
	if (!blockedContexts.length || !blockedContexts.every((c) => hd.specTexts(c).intro.some((b) => b.warn))) texts.push(['refusal', 'undefined: a Chebyshev under 0.5 dB is not refused with a warning']);
	addBlocks('sensitivity', hd.sensitivityTexts());
	for (const stock of ['E24', 'E96', 'lab', 'labR', 'custom']) for (const pairs of [false, true]) texts.push(['stock words', hd.stockWords(stock, pairs)]);
	texts.push(['follower', hd.FOLLOWER_NOTE], ...Object.values(hd.TOPOLOGIES).map((t) => ['labels', `${t.label} ${t.short}`]), ...hd.REPORT_COLUMNS.map((h) => ['report', h]));
	for (const row of [...hd.BUTTERWORTH_TABLE, ...hd.CHEBYSHEV_TABLE]) tex.push(['tables', row.tex]);
	const table = hd.denormTable();
	for (const row of table.rows) for (const cell of row) tex.push(['denorm table', `\\displaystyle ${cell}`]);
	// the report and its copies
	const rows = hd.reportRows([{ label: 'Stage 1', topology: 'mfb', parts: { R1: 1e4, R2: 2e4, R3: 1e4, C1: 1e-8, C2: 1e-9 }, theoretical: { R1: 1.01e4, R2: 1.98e4, R3: 1.01e4, C1: 1e-8, C2: 1e-9 } }, { label: 'Gain stage', topology: 'gainNonInv', parts: { R1: 1e4, R2: 1.2e4 }, theoretical: null }]);
	texts.push(['report tsv', hd.reportTsv(rows)], ['report md', hd.reportMarkdown(rows)]);
	const tsv = hd.reportTsv(rows);
	if (!tsv.startsWith('Component\tTheoretical value\tActual value\tRelative error (%)\nStage 1 C1\t10 nF\t10 nF\t0.00\n') || !/^Stage 1 R1\t10\.1 kΩ\t10 kΩ\t-0\.99$/m.test(tsv) || !/^\| Gain stage R2 \| - \| 12 kΩ \| - \|$/m.test(hd.reportMarkdown(rows))) texts.push(['report', 'undefined: the report format changed']);

	// the panel's own words, its markup and expressions taken out
	const svelte = readFileSync(new URL('../src/lib/components/BuildPanel.svelte', import.meta.url), 'utf8');
	let markup = svelte.replace(/<script>[\s\S]*?<\/script>/, '').replace(/<style>[\s\S]*?<\/style>/, '');
	for (let i = 0; i < 6; i++) markup = markup.replace(/\{[^{}]*\}/g, ' ');
	markup = markup.replace(/<[^>]*>/g, ' ');
	// the panel's title, as it was asked for, is the one place the reader is addressed
	const TITLE = 'Build your own active filter';
	texts.push(['BuildPanel.svelte', markup.replaceAll(TITLE, '')]);
	// and the strings inside its expressions and script: grade words, flags, labels
	const template = svelte.replace(/<script>[\s\S]*?<\/script>/, '').replace(/<style>[\s\S]*?<\/style>/, '');
	const script = (svelte.match(/<script>([\s\S]*?)<\/script>/) ?? ['', ''])[1].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
	let literals = 0;
	for (const code of [template, script]) {
		for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
			// a template literal's own words, its expressions taken out
			const text = (m[1] ?? m[2]).replace(/\$\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' ');
			if (!/[a-z]{3}/i.test(text)) continue;
			literals++;
			texts.push(['BuildPanel.svelte strings', text.replaceAll(TITLE, '')]);
		}
	}
	if (literals < 40) texts.push(['BuildPanel.svelte strings', `undefined: only ${literals} string literals found`]);
	const comments = (svelte.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join('\n').replaceAll(TITLE, '');
	const moduleComments = (readFileSync(new URL('../src/lib/filter/handDesign.js', import.meta.url), 'utf8').match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join('\n');
	const checkComments = (readFileSync(new URL('./check-hand.mjs', import.meta.url), 'utf8').match(/^\/\/[^\n]*/gm) ?? []).join('\n').replaceAll(TITLE, '');

	const wordProblems = [];
	for (const [where, text] of texts) {
		if (typeof text !== 'string') wordProblems.push(`${where}: not a string`);
		else if (YOU.test(text)) wordProblems.push(`${where}: "${text.match(YOU)[0]}" in "${text.slice(0, 80)}"`);
		else if (DASHES.test(text)) wordProblems.push(`${where}: a dash in "${text.slice(0, 80)}"`);
		else if (PLACEHOLDER.test(text)) wordProblems.push(`${where}: a placeholder in "${text.slice(0, 80)}"`);
		else if (COURSE.test(text)) wordProblems.push(`${where}: "${text.match(COURSE)[0]}" in "${text.slice(0, 80)}"`);
		else if (AVOID.test(text)) wordProblems.push(`${where}: "${text.match(AVOID)[0]}" in "${text.slice(0, 80)}"`);
	}
	for (const [where, text] of [['BuildPanel.svelte comments', comments], ['handDesign.js comments', moduleComments], ['check-hand.mjs header', checkComments.replace(/no you\/your, no dashes, no course words/, '')]]) {
		if (COURSE.test(text) || YOU.test(text) || DASHES.test(text)) wordProblems.push(`${where}: "${(text.match(COURSE) ?? text.match(YOU) ?? text.match(DASHES))[0]}"`);
	}
	let texBad = [];
	const seen = new Set();
	for (const [where, t] of tex) {
		if (seen.has(t)) continue;
		seen.add(t);
		try {
			katex.renderToString(t, { throwOnError: true, strict: 'error', displayMode: true });
		} catch (e) {
			texBad.push(`${where}: ${e.message.slice(0, 90)} in ${t.slice(0, 60)}`);
		}
		if (PLACEHOLDER.test(t)) texBad.push(`${where}: placeholder in ${t.slice(0, 60)}`);
	}
	check(`TeX: ${seen.size} distinct formulas render under strict KaTeX`, texBad.length === 0, texBad.slice(0, 3).join('; '));
	check(`words: ${texts.length} texts (prose, hints, solutions, check messages, notes, verdicts, Python, the panel's markup and comments) without you/your, dashes, course words, placeholders or the avoided words`, wordProblems.length === 0, wordProblems.slice(0, 3).join('; '));
}

/* ------------------------------------------------------------ (j) Python */
{
	const py = ['python', 'python3', 'py'].find((cmd) => {
		const r = spawnSync(cmd, ['-c', 'import numpy, sympy, scipy, matplotlib'], { encoding: 'utf8' });
		return r.status === 0;
	});
	if (!py) {
		console.log('skip Python snippets: no python with numpy, sympy, scipy and matplotlib on the PATH');
	} else {
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-hand-'));
		const jobs = [];
		const pick = [
			// the reference examples, and one of each kind with odd orders and asymmetric bands
			(c) => c.spec.filterType === 'lowpass' && c.response === 'butterworth' && c.s5 && c.s2.n % 2 === 1 && Math.abs(c.s4.scale - 1) > 0.01,
			(c) => c.spec.filterType === 'lowpass' && c.response === 'chebyshev' && c.s5 && c.s2.n % 2 === 1,
			(c) => c.spec.filterType === 'highpass' && c.response === 'butterworth' && c.s5 && c.s2.n % 2 === 1,
			(c) => c.spec.filterType === 'highpass' && c.response === 'chebyshev' && c.s5 && c.s2.n % 2 === 0,
			(c) => c.spec.filterType === 'bandpass' && c.response === 'butterworth' && c.s5 && c.s1.sym.moved && c.spec.aminSplit && c.s2.n % 2 === 1,
			(c) => c.spec.filterType === 'bandpass' && c.response === 'chebyshev' && c.s5 && c.s2.n >= 2,
			(c) => c.spec.filterType === 'bandstop' && c.response === 'butterworth' && c.s5 && c.s1.sym.moved && c.s2.n % 2 === 1,
			(c) => c.spec.filterType === 'bandstop' && c.response === 'chebyshev' && c.s5
		];
		const chosen = pick.map((f) => contexts.find(f)).filter(Boolean);
		chosen.push(hd.solveAll(hd.handSpec({ filterType: 'highpass', fp: 100000, fs: 60000, amaxDb: 0.5, aminDb: 20 }), 'chebyshev'));
		chosen.push(hd.solveAll(hd.handSpec({ filterType: 'bandpass', fl: 20000, fh: 40000, fsl: 10000, fsh: 80000, amaxDb: 3.0103, aminDb: 20 }), 'butterworth'));
		const nums = (text) => [...text.matchAll(/([A-Za-z_][\w^ +]*?) = (-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g)].map((m) => ({ name: m[1].trim().split(/\s+/).pop(), value: Number(m[2]) }));
		const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b)) + 1e-12;
		const sameSet = (got, want) => got.length === want.length && want.every((w) => got.some((g) => w.every((x, i) => close(g[i], x))));
		for (const ctx of chosen) {
			const tag = `${ctx.spec.filterType} ${ctx.response} n=${ctx.s2.n}`;
			jobs.push({
				tag: `${tag} step 1`,
				code: hd.pythonSpec(ctx),
				verify: (out) => {
					const v = Object.fromEntries(nums(out).map((x) => [x.name, x.value]));
					return close(v.k, ctx.s1.k) && (!ctx.spec.band || (close(v.wc, ctx.s1.wc) && close(v.B, ctx.s1.B) && close(v.fsl, ctx.s1.sym.fsl) && close(v.fsh, ctx.s1.sym.fsh)));
				}
			});
			jobs.push({
				tag: `${tag} step 2`,
				code: hd.pythonOrder(ctx),
				verify: (out) => {
					const v = Object.fromEntries(nums(out).map((x) => [x.name, x.value]));
					return close(v.n_exact, ctx.s2.value) && v.n === ctx.s2.n;
				}
			});
			jobs.push({
				tag: `${tag} step 4`,
				code: hd.pythonDenorm(ctx),
				verify: (out) => {
					const list = nums(out);
					const w = list.find((x) => x.name === (ctx.spec.band ? 'B' : 'wc'));
					const num = list.find((x) => x.name === 'numerator');
					const a = list.filter((x) => x.name === 'a').map((x) => x.value);
					const b = list.filter((x) => x.name === 'b').map((x) => x.value);
					const p = list.filter((x) => x.name === 'p').map((x) => x.value);
					const quads = ctx.s4.factors.filter((f) => f.kind === 'quadratic').map((f) => [f.a, f.b]);
					const reals = ctx.s4.factors.filter((f) => f.kind === 'real').map((f) => [f.p]);
					return close(w.value, ctx.spec.band ? ctx.s4.Bd : ctx.s4.wd) && close(num.value, ctx.s4.numerator.coef) && sameSet(a.map((x, i) => [x, b[i]]), quads) && sameSet(p.map((x) => [x]), reals);
				}
			});
			jobs.push({
				tag: `${tag} step 5`,
				code: hd.pythonStages(ctx),
				verify: (out) => {
					const list = nums(out);
					const wn = list.filter((x) => x.name === 'wn').map((x) => x.value);
					const q = list.filter((x) => x.name === 'Q').map((x) => x.value);
					const p = list.filter((x) => x.name === 'p').map((x) => x.value);
					const K = list.find((x) => x.name === 'K').value;
					const two = ctx.s5.stages.filter((s) => s.order === 2);
					const one = ctx.s5.stages.filter((s) => s.order === 1);
					return close(K, ctx.s5.K) && two.every((s, i) => close(wn[i], s.wn) && close(q[i], s.q)) && one.every((s, i) => close(p[i], s.p));
				}
			});
			if (ctx.spec.filterType === 'bandstop') continue;
			const stages = [];
			for (const st of ctx.s5.stages) {
				for (const topo of hd.topologyChoices(st)) {
					const caps = hd.suggestCaps(topo, st, E24);
					jobs.push({
						tag: `${tag} step 6 ${topo}`,
						code: hd.pythonComponents(topo, st, caps),
						verify: (out) => {
							const list = nums(out).filter((x) => /^R/.test(x.name));
							const names = hd.TOPOLOGIES[topo].resistors;
							const sols = [];
							for (let i = 0; i + names.length <= list.length; i += names.length) sols.push(names.map((nm, k) => list[i + k].value));
							let want;
							if (topo === 'sallenKey') {
								const S = 1 / (st.wn * st.q * caps.Cbottom);
								const P = 1 / (st.wn * st.wn * caps.Ctop * caps.Cbottom);
								if (S * S >= 4 * P) {
									const big = (S + Math.sqrt(S * S - 4 * P)) / 2;
									want = [
										[big, P / big],
										[P / big, big]
									];
								} else want = [Array(2).fill(hd.solveParts(topo, st, caps).parts.R1)];
							} else {
								const sol = hd.solveParts(topo, st, caps);
								want = [sol.parts, ...(sol.other ? [sol.other] : [])].map((x) => names.map((nm) => x[nm]));
							}
							return sameSet(sols, want);
						}
					});
				}
				const topo = hd.topologyChoices(st)[0];
				const caps = hd.suggestCaps(topo, st, E24);
				stages.push(hd.realizeStage(topo, { ...caps, ...hd.solveParts(topo, st, caps).parts }));
			}
			if (Math.abs(ctx.s5.K - 1) > 1e-12) {
				const circuit = hd.gainCircuitFor(ctx.s5.K);
				stages.push(hd.realizeStage(circuit, hd.solveGain(circuit, ctx.s5.K, 10000).parts));
			}
			jobs.push({
				tag: `${tag} step 7`,
				code: hd.pythonBode(ctx.spec, stages),
				verify: (out) => {
					// the top of the passband and the loss at each edge, as the panel's verdict reads them
					const list = nums(out);
					const v = hd.verdict(ctx.spec, stages);
					const top = list.find((x) => x.name === 'passband');
					const sameDb = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
					return (
						!!top &&
						sameDb(top.value, v.peakDb) &&
						v.edges.every((e) => {
							const got = list.find((x) => x.name === e.name);
							return got && sameDb(got.value, e.loss);
						})
					);
				}
			});
		}
		// capacitors that leave no real resistors: the snippet says so, with the condition
		const stuck = { order: 2, kind: 'lowpass', wn: 2 * Math.PI * 1000, q: 2 };
		for (const [topo, caps, want] of [
			['mfb', { C1: 1e-8, C2: 1e-9 }, 8 * stuck.q * stuck.q],
			['mfbBp', { C1: 1e-8, C2: 1e-9 }, 1 / (0.3 * 0.3) - 1]
		]) {
			const st = topo === 'mfbBp' ? { ...stuck, kind: 'bandpass', q: 0.3 } : stuck;
			if (hd.solveParts(topo, st, caps).ok) continue;
			jobs.push({
				tag: `${topo} with capacitors that cannot work`,
				code: hd.pythonComponents(topo, st, caps),
				verify: (out) => {
					const line = out.split('\n').find((l) => /no real resistors/.test(l));
					return !!line && !/^R1 =/m.test(out) && [...line.matchAll(/-?\d+\.?\d*(?:e[-+]?\d+)?/gi)].some((m) => Math.abs(Number(m[0]) - want) <= 1e-9 * want);
				}
			});
		}
		const run = (job, k) =>
			new Promise((resolve) => {
				const file = join(dir, `snippet${k}.py`);
				writeFileSync(file, job.code);
				const child = spawn(py, [file], { cwd: dir, env: { ...process.env, MPLBACKEND: 'Agg', PYTHONWARNINGS: 'ignore' } });
				let out = '';
				let err = '';
				child.stdout.on('data', (d) => (out += d));
				child.stderr.on('data', (d) => (err += d));
				child.on('close', (code) => resolve({ job, code, out, err }));
			});
		const results = [];
		let next = 0;
		const workers = Array.from({ length: 6 }, async () => {
			while (next < jobs.length) {
				const k = next++;
				results.push(await run(jobs[k], k));
			}
		});
		await Promise.all(workers);
		rmSync(dir, { recursive: true, force: true });
		const failed = results.filter((r) => r.code !== 0 || !r.job.verify(r.out));
		check(
			`Python: ${results.length} snippets run as written (${chosen.length} designs: steps 1, 2, 4, 5, the sympy solve of every circuit, the Bode with scipy) and print the panel's numbers to 1e-6`,
			failed.length === 0,
			failed
				.slice(0, 2)
				.map((r) => `${r.job.tag}: exit ${r.code} ${(r.err || r.out).trim().split('\n').slice(-2).join(' | ').slice(0, 160)}`)
				.join('; ')
		);
	}
}

/* ------------------------------------------------------------- storage */
{
	const a = hd.storageKey(hd.handSpec({ filterType: 'lowpass', fp: 1000, fs: 2000, amaxDb: 1, aminDb: 40 }));
	const b = hd.storageKey(hd.handSpec({ filterType: 'lowpass', fp: 1000, fs: 2000, amaxDb: 1, aminDb: 41 }));
	const c = hd.storageKey(hd.handSpec({ filterType: 'bandpass', fl: 1, fh: 2, fsl: 0.5, fsh: 4, amaxDb: 1, aminDb: 40, aminAtFsl: 40, aminAtFsh: 30 }));
	const d = hd.storageKey(hd.handSpec({ filterType: 'bandpass', fl: 1, fh: 2, fsl: 0.5, fsh: 4, amaxDb: 1, aminDb: 40, aminAtFsl: 30, aminAtFsh: 40 }));
	check('storage: the progress key follows the spec, edge by edge', a !== b && c !== d && a === hd.storageKey(hd.handSpec({ filterType: 'lowpass', fp: 1000, fs: 2000, amaxDb: 1, aminDb: 40 })), a);
}

console.log(fails === 0 ? 'hand design checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
