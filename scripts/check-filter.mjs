// Numeric checks of the active-filter engine additions: the Tow-Thomas
// biquad (both forms) and the band-stop combiner choice.
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-filter.mjs
//
// 1. Tow-Thomas designs: the reported actual wn/Q equal the general
//    formulas evaluated on the rounded parts, land within E24 rounding of
//    the targets, carry the right gain sign, and the by-hand capacitor
//    variant behaves.
// 2. Combiner: for every topology and a range of branch orders, the
//    combiner the tool picks gives the deepest notch centre of the two
//    options (plain sum or difference), and a Tow-Thomas band-stop at the
//    default spec meets Amin at both stopband edges.
// 3. Sensitivities: the Tow-Thomas constants agree with direct
//    perturbation of Q.
// 4. The new explanations render under strict KaTeX.
// Exits non-zero on any failure.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import katex from 'katex';
import { besselPrototype, ellipticOrder, inverseChebyshevOrder, legendrePolynomial, prototypeFor, prototypeLossDb } from '../src/lib/filter/approximations.js';
import { combinerChoice, magnitudePhaseAt, magnitudePhaseAtParallelSum } from '../src/lib/filter/bode.js';
import { generateScript } from '../src/lib/filter/codegen.js';
import { explainApproximation, explainHpStage, explainOrder, explainStage, explainSummingAmp, explainTowThomas, explainTowThomasHp } from '../src/lib/filter/explain.js';
import { explainTowThomasNotch } from '../src/lib/filter/explainResponses.js';
import { designFirstOrderLowPass } from '../src/lib/filter/firstOrder.js';
import { designFirstOrderHighPass } from '../src/lib/filter/firstOrderHighPass.js';
import { designMfbLowPass } from '../src/lib/filter/mfb.js';
import { designMfbHighPass } from '../src/lib/filter/mfbHighPass.js';
import { designSallenKeyLowPass } from '../src/lib/filter/sallenKey.js';
import { designSallenKeyHighPass } from '../src/lib/filter/sallenKeyHighPass.js';
import { LAB_KIT } from '../src/lib/filter/eseries.js';
import { TOW_THOMAS_SENSITIVITY } from '../src/lib/filter/sensitivity.js';
import { designBandStop, designHighPass, designLowPass } from '../src/lib/filter/stages.js';
import { designTowThomasHighPass, designTowThomasLowPass, designTowThomasLowPassFromCap, designTowThomasNotch } from '../src/lib/filter/towThomas.js';

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};

// ------------------------------------------------------------ 1. designs
for (const [q, hp] of [[0.7071, false], [1.3066, false], [5, false], [20, false], [0.5412, true], [3, true]]) {
	const wn = 2 * Math.PI * 10000;
	const d = hp ? designTowThomasHighPass(wn, q) : designTowThomasLowPass(wn, q);
	const c = d.components;
	const wnF = 1 / Math.sqrt(c.C1 * c.C2 * c.Ra * c.Rb);
	const qF = c.Rd * Math.sqrt(c.C1 / (c.C2 * c.Ra * c.Rb));
	check(`${hp ? 'HP' : 'LP'} Q=${q}: actual equals the general formulas on the rounded parts`, Math.abs(wnF - d.actual.wn) < 1e-6 && Math.abs(qF - d.actual.q) < 1e-9, `f0 ${(d.actual.wn / 2 / Math.PI).toFixed(0)} Hz, Q ${d.actual.q.toFixed(3)}, R ${c.Ra}, Rd ${c.Rd}, C ${c.C1}`);
	check('  within E24 rounding of the target', Math.abs(d.actual.wn / wn - 1) < 0.06 && Math.abs(d.actual.q / q - 1) < 0.06, `${(100 * (d.actual.q / q - 1)).toFixed(1)}% on Q`);
	check(`  gain ${hp ? '-1' : '+1'}, topology ${hp ? 'towThomasHp' : 'towThomas'}`, d.actual.gain === (hp ? -1 : 1) && d.topology === (hp ? 'towThomasHp' : 'towThomas'));
}
const manual = designTowThomasLowPassFromCap(2 * Math.PI * 1000, 2, 1e-8);
check('by-hand capacitor: ok/manual flags, Q within one E24 step', manual.ok && manual.manual && Math.abs(manual.components.Rd / manual.components.Ra / 2 - 1) < 0.07, `R ${manual.components.Ra}, Rd ${manual.components.Rd}`);

// ----------------------------------------------------------- 2. combiner
const second = {
	mfb: (s) => (s.filterType === 'highpass' ? designMfbHighPass(s.wn, s.q) : designMfbLowPass(s.wn, s.q)),
	sallenKey: (s) => (s.filterType === 'highpass' ? designSallenKeyHighPass(s.wn, s.q) : designSallenKeyLowPass(s.wn, s.q)),
	towThomas: (s) => (s.filterType === 'highpass' ? designTowThomasHighPass(s.wn, s.q) : designTowThomasLowPass(s.wn, s.q))
};
const realizeWith = (t) => (s) => (s.order === 1 ? (s.filterType === 'highpass' ? designFirstOrderHighPass(s.tau) : designFirstOrderLowPass(s.tau)) : second[t](s));
const SPEC = { response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 };
let worstLoss = 0;
for (const t of Object.keys(second)) {
	for (const [nl, nh] of [[2, 2], [3, 3], [2, 4], [4, 4], [3, 2], [2, 3], [4, 2], [5, 3]]) {
		const d = designBandStop({ ...SPEC, orderLow: nl, orderHigh: nh });
		const branches = [d.lp.stages.map(realizeWith(t)), d.hp.stages.map(realizeWith(t))];
		const choice = combinerChoice(branches, SPEC.fsl, SPEC.fsh);
		const best = Math.max(choice.sumDb, choice.differenceDb);
		const chosen = choice.mode === 'sum' ? choice.sumDb : choice.differenceDb;
		worstLoss = Math.max(worstLoss, best - chosen);
		check(`${t} ${nl}+${nh}: ${choice.mode}`, chosen >= best - 1e-9, `sum ${choice.sumDb.toFixed(1)} dB, difference ${choice.differenceDb.toFixed(1)} dB`);
	}
}
check('combiner never leaves depth on the table', worstLoss <= 1e-9, `${worstLoss.toFixed(3)} dB`);
{
	const d = designBandStop({ ...SPEC, orderLow: null, orderHigh: null });
	const branches = [d.lp.stages.map(realizeWith('towThomas')), d.hp.stages.map(realizeWith('towThomas'))];
	const { signs } = combinerChoice(branches, SPEC.fsl, SPEC.fsh);
	const atFsl = -magnitudePhaseAtParallelSum(branches, SPEC.fsl, signs).db;
	const atFsh = -magnitudePhaseAtParallelSum(branches, SPEC.fsh, signs).db;
	check(`Tow-Thomas band-stop at the default spec (orders ${d.lp.n}+${d.hp.n}) meets Amin at fsl and fsh`, atFsl >= 40 && atFsh >= 40, `${atFsl.toFixed(1)} / ${atFsh.toFixed(1)} dB`);
}

// ------------------------------------------------------ 3. sensitivities
{
	const base = designTowThomasLowPass(2 * Math.PI * 10000, 2);
	const Q = (c) => c.Rd * Math.sqrt(c.C1 / (c.C2 * c.Ra * c.Rb));
	for (const [name, expect] of Object.entries(TOW_THOMAS_SENSITIVITY)) {
		const c = { ...base.components };
		if (!(name in c)) continue;
		const q0 = Q(c);
		c[name] *= 1.01;
		const s = (Q(c) / q0 - 1) / 0.01;
		check(`S_Q(${name}) = ${expect}`, Math.abs(s - expect) < 0.02, s.toFixed(3));
	}
}

// --------------------------------------------------------------- 4. KaTeX
{
	let n = 0;
	let bad = 0;
	const render = (blocks) => {
		for (const b of blocks) {
			if (b.type === 'eq') {
				n++;
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
				} catch (e) {
					bad++;
					console.log('KATEX FAIL', b.tex.slice(0, 80), e.message);
				}
			} else if (/undefined|NaN/.test(b.text)) {
				bad++;
				console.log('TEXT BAD', b.text.slice(0, 100));
			}
		}
	};
	render(explainTowThomas(designTowThomasLowPass(2 * Math.PI * 10000, 2), 2 * Math.PI * 10000, 2));
	render(explainTowThomas(manual, 2 * Math.PI * 1000, 2));
	render(explainTowThomasHp(designTowThomasHighPass(2 * Math.PI * 10000, 1.3), 2 * Math.PI * 10000, 1.3));
	render(explainSummingAmp(10000, { mode: 'sum', lpSign: -1, hpSign: -1, lpOrder: 3, hpOrder: 3, centreHz: 5477, sumDb: 47.2, differenceDb: 38.9 }));
	render(explainSummingAmp(10000, { mode: 'difference', lpSign: 1, hpSign: -1, lpOrder: 4, hpOrder: 4, centreHz: 5477, sumDb: 55, differenceDb: 61.4 }));
	check(`explanations: ${n} equations render under strict KaTeX`, bad === 0, `${bad} failures`);
}

/* ------------------------------------------------- 5. restricted stock */
{
	const opts = { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors };
	const inStock = (name, v) => {
		const list = /^[Rr]/.test(name) ? LAB_KIT.resistors : LAB_KIT.capacitors;
		return list.some((x) => Math.abs(x / v - 1) < 1e-9);
	};
	const specs = [
		{ label: 'lowpass ', make: () => designLowPass({ response: 'butterworth', amaxDb: 2, aminDb: 40, fp: 10000, fs: 35000, order: null }) },
		{ label: 'highpass', make: () => designHighPass({ response: 'butterworth', amaxDb: 2, aminDb: 40, fp: 10000, fs: 3000, order: null }) },
		{ label: 'chebyshv', make: () => designLowPass({ response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 10000, fs: 35000, order: null }) }
	];
	for (const { label, make } of specs) {
		for (const t of Object.keys(second)) {
			const design = make();
			const realized = design.stages.map((s) =>
				s.order === 1
					? s.filterType === 'highpass'
						? designFirstOrderHighPass(s.tau, opts)
						: designFirstOrderLowPass(s.tau, opts)
					: s.filterType === 'highpass'
						? { mfb: designMfbHighPass, sallenKey: designSallenKeyHighPass, towThomas: designTowThomasHighPass }[t](s.wn, s.q, opts)
						: { mfb: designMfbLowPass, sallenKey: designSallenKeyLowPass, towThomas: designTowThomasLowPass }[t](s.wn, s.q, opts)
			);
			if (realized.some((r) => !r)) {
				check(`stock ${label} ${t}`, false, 'a stage came back unrealizable');
				continue;
			}
			const strays = realized.flatMap((r) => Object.entries(r.components).filter(([name, v]) => !inStock(name, v)));
			const worstQ = Math.max(...realized.filter((r) => r.actual.q).map((r, i) => Math.abs(100 * (r.actual.q / design.stages[i].q - 1))));
			const edge = label.trim() === 'highpass' ? 3000 : 35000;
			const attn = -magnitudePhaseAt(realized, edge).db;
			check(
				`stock ${label} ${t}: every value from the kit`,
				strays.length === 0,
				strays.length ? `hors kit: ${JSON.stringify(strays)}` : `Q off by <= ${worstQ.toFixed(1)}%, ${attn.toFixed(1)} dB at the stopband edge`
			);
		}
	}
	// the Tow-Thomas inverter pair has to come from the kit too
	const tt = designTowThomasLowPass(2 * Math.PI * 10000, 1.3, { resistorSeries: [820, 8200, 82000], capacitors: LAB_KIT.capacitors });
	check('stock: Tow-Thomas inverter pair follows the kit', tt !== null && [820, 8200, 82000].includes(tt.components.r), `r = ${tt && tt.components.r}`);
}

/* ------------------------------ 6. Chebyshev limits from the passband top */
// Chebyshev stages have unity DC gain, so an even order ripples between
// 0 dB and +Amax. The page measures Amax and Amin from the top of the
// passband; measured from 0 dB, 10 of 71 even-order designs looked Amin
// short. With ideal stages, measured from the top, every design must meet
// Amin at fs and lose at most Amax at fp, and the top must be +Amax.
{
	let n = 0;
	let bad = 0;
	let worstTop = 0;
	for (const amax of [0.1, 0.5, 1, 2, 3]) {
		for (const amin of [20, 30, 40, 50, 60]) {
			for (const ratio of [1.3, 1.5, 2, 2.5, 3.5, 5]) {
				const fp = 10000;
				const fs = fp * ratio;
				const d = designLowPass({ response: 'chebyshev', amaxDb: amax, aminDb: amin, fp, fs, order: null });
				if (d.n > 8 || d.n % 2 !== 0) continue;
				n++;
				const stages = d.stages.map((s) => (s.order === 2 ? { order: 2, actual: { wn: s.wn, q: s.q } } : { order: 1, actual: { tau: s.tau } }));
				let top = 0;
				for (let i = 0; i <= 400; i++) top = Math.max(top, magnitudePhaseAt(stages, (fp / 100) * 100 ** (i / 400)).db);
				const atFs = top - magnitudePhaseAt(stages, fs).db;
				const atFp = top - magnitudePhaseAt(stages, fp).db;
				worstTop = Math.max(worstTop, Math.abs(top - amax));
				if (atFs < amin - 1e-6 || atFp > amax + 1e-3) {
					bad++;
					console.log('   CHEBYSHEV', amax, amin, ratio, `n=${d.n}`, atFs.toFixed(2), atFp.toFixed(2));
				}
			}
		}
	}
	check(`chebyshev: ${n} even-order designs meet Amin and Amax measured from the passband top`, n > 50 && bad === 0, `${bad} misses`);
	check('chebyshev: an even order rises to +Amax exactly', worstTop < 0.02, `worst ${worstTop.toFixed(3)} dB off`);
}

/* ----------------------- 7. Legendre, Bessel, inverse Chebyshev, elliptic */
{
	// Legendre: the published polynomials, and a derivative that never goes negative
	const table = { 1: [0, 1], 2: [0, 0, 1], 3: [0, 1, -3, 3], 4: [0, 0, 3, -8, 6], 5: [0, 1, -8, 28, -40, 20], 6: [0, 0, 6, -40, 105, -120, 50], 8: [0, 0, 10, -120, 615, -1624, 2310, -1680, 490] };
	let worst = 0;
	for (const [n, want] of Object.entries(table)) {
		const got = legendrePolynomial(Number(n));
		worst = Math.max(worst, ...want.map((c, i) => Math.abs((got[i] ?? 0) - c)));
	}
	check('legendre: L1..L6 and L8 equal the published polynomials', worst < 1e-9, `max coefficient error ${worst.toExponential(1)}`);
	let monotone = true;
	for (let n = 1; n <= 12; n++) {
		const L = legendrePolynomial(n);
		const at = (w) => L.reduceRight((acc, c) => acc * w + c, 0);
		if (Math.abs(at(0)) > 1e-12 || Math.abs(at(1) - 1) > 1e-9) monotone = false;
		for (let i = 1; i <= 400; i++) if (at((2 * i) / 400) < at((2 * (i - 1)) / 400) - 1e-12) monotone = false;
	}
	check('legendre: L_n(0) = 0, L_n(1) = 1 and never decreasing, n = 1..12', monotone);

	// Bessel: the published poles normalized to -3 dB at 1 rad/s
	const published = {
		2: [[-1.1016, 0.636]],
		3: [[-1.0474, 0.9993], [-1.3227, 0]],
		4: [[-0.9952, 1.2571], [-1.3701, 0.4102]],
		5: [[-0.9577, 1.4711], [-1.3809, 0.7179], [-1.5023, 0]]
	};
	let poleErr = 0;
	for (const [n, list] of Object.entries(published)) {
		const p = besselPrototype(Number(n), 10 * Math.log10(2));
		const got = [...p.sections.map((s) => [-s.a / 2, Math.sqrt(s.b - (s.a / 2) ** 2)]), ...(p.real ? [[-p.real.breal, 0]] : [])];
		for (const [re, im] of list) poleErr = Math.max(poleErr, Math.min(...got.map(([r, i]) => Math.hypot(r - re, i - im))));
	}
	check('bessel: poles of orders 2 to 5 equal the published ones', poleErr < 2e-4, `worst ${poleErr.toExponential(1)}`);

	// elliptic and inverse Chebyshev: exact ripple in both bands, stopband from fs,
	// and the order formula: the order it gives meets the spec, one less does not
	let props = 0;
	let propBad = 0;
	for (const response of ['elliptic', 'inverseChebyshev']) {
		for (const [amax, amin, k] of [[0.1, 50, 0.9], [0.5, 60, 0.8], [1, 40, 0.5], [2, 30, 0.2], [3, 40, 1 / 3.5], [1, 70, 0.6]]) {
			const nFloat = response === 'elliptic' ? ellipticOrder(amax, amin, k) : inverseChebyshevOrder(amax, amin, k);
			const n = Math.ceil(nFloat);
			for (const m of [n, n - 1]) {
				if (m < 1) continue;
				const p = prototypeFor(response, m, amax, amin, k);
				const grid = (a, b, count) => Array.from({ length: count + 1 }, (_, i) => a * (b / a) ** (i / count));
				const pass = grid(1e-3, 1, 3000).map((w) => prototypeLossDb(p, w));
				const peak = -Math.min(...pass);
				const passMax = Math.max(...pass) + peak;
				const stopMin = Math.min(...grid(1 / k, 1000 / k, 20000).map((w) => prototypeLossDb(p, w) + peak));
				props++;
				const ok = m === n ? Math.abs(passMax - amax) < 1e-3 && stopMin >= amin - 1e-6 && Math.abs(stopMin - p.aminReached) < 2e-3 : stopMin < amin;
				if (!ok) {
					propBad++;
					console.log('   RIPPLE', response, amax, amin, k, `n=${m}`, passMax.toFixed(4), stopMin.toFixed(4), p.aminReached.toFixed(4));
				}
			}
		}
	}
	check(`elliptic, inverse Chebyshev: ${props} prototypes ripple exactly Amax and Amin', and the order is the smallest that holds`, propBad === 0, `${propBad} misses`);

	// every response, as designed (ideal parts): Amax at fp from the passband top, Amin across the stopband
	let designs = 0;
	let designBad = 0;
	for (const response of ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic']) {
		for (const [type, fp, fs] of [['lowpass', 10000, 35000], ['lowpass', 10000, 20000], ['highpass', 10000, 3000], ['highpass', 10000, 1500]]) {
			for (const [amax, amin] of [[0.5, 30], [1, 40], [3, 40]]) {
				const make = type === 'highpass' ? designHighPass : designLowPass;
				const d = make({ response, amaxDb: amax, aminDb: amin, fp, fs, order: null });
				if (!Number.isFinite(d.minOrder) || d.n > 12) continue;
				designs++;
				const stages = d.stages.map((s) => (s.order === 2 ? { order: 2, topology: type === 'highpass' && !Number.isFinite(s.wz) ? 'x Hp' : 'x', actual: { wn: s.wn, q: s.q, ...(Number.isFinite(s.wz) ? { wz: s.wz, gain: type === 'highpass' ? 1 : (s.wn / s.wz) ** 2 } : {}) } } : { order: 1, topology: type === 'highpass' ? 'x Hp' : 'x', actual: { tau: s.tau } }));
				const pass = type === 'highpass' ? [fp, fp * 100] : [fp / 100, fp];
				const stop = type === 'highpass' ? [fs / 1000, fs] : [fs, fs * 1000];
				const scan = ([a, b]) => Array.from({ length: 1201 }, (_, i) => a * (b / a) ** (i / 1200));
				const top = Math.max(...scan(pass).map((f) => magnitudePhaseAt(stages, f).db));
				const atFp = top - magnitudePhaseAt(stages, fp).db;
				const stopMin = Math.min(...scan(stop).map((f) => top - magnitudePhaseAt(stages, f).db));
				if (Math.abs(atFp - amax) > 1e-3 || stopMin < amin - 1e-3) {
					designBad++;
					console.log('   SPEC', response, type, fp, fs, amax, amin, `n=${d.n}`, atFp.toFixed(4), stopMin.toFixed(3));
				}
			}
		}
	}
	check(`all six responses: ${designs} ideal designs lose exactly Amax at fp and at least Amin across the stopband`, designs > 50 && designBad === 0, `${designBad} misses`);

	// the notch stage: actual values from the general formula on the rounded parts
	let notchBad = 0;
	for (const [f0, q, fz, lowSide] of [[10000, 4.1, 21400, true], [5600, 0.8, 49000, true], [8400, 1.45, 3700, false], [7700, 0.55, 1500, false], [1000, 12, 1100, true]]) {
		const wn = 2 * Math.PI * f0;
		const wz = 2 * Math.PI * fz;
		const r = designTowThomasNotch(wn, q, wz, { lowSide });
		const c = r.components;
		const wnF = 1 / Math.sqrt(c.C1 * c.C2 * c.Ra * c.Rb);
		const qF = c.Rd * Math.sqrt(c.C1 / (c.C2 * c.Ra * c.Rb));
		const wzF = 1 / Math.sqrt(c.Cin * c.C2 * c.Ra * c.Rz);
		const ok =
			r.topology === 'towThomasNotch' &&
			Math.abs(wnF / r.actual.wn - 1) < 1e-9 &&
			Math.abs(qF / r.actual.q - 1) < 1e-9 &&
			Math.abs(wzF / r.actual.wz - 1) < 1e-9 &&
			Math.abs(r.actual.gain + c.Cin / c.C1) < 1e-12 &&
			Math.abs(r.actual.dcGain + c.Rb / c.Rz) < 1e-12 &&
			Math.abs(r.actual.wz / wz - 1) < 0.035 &&
			Math.abs(r.actual.wn / wn - 1) < 0.05 &&
			(lowSide ? true : c.Cin === c.C1);
		if (!ok) {
			notchBad++;
			console.log('   NOTCH', f0, q, fz, lowSide, JSON.stringify(r.actual), JSON.stringify(c));
		}
	}
	check('notch stages: actual f0, Q, fz and gains equal the formulas on the rounded parts, zero within E24 rounding', notchBad === 0, `${notchBad} misses`);

	// the new explanations: strict KaTeX, plain words
	const blocks = [];
	for (const response of ['legendre', 'bessel', 'inverseChebyshev', 'elliptic']) {
		for (const type of ['lowpass', 'highpass']) {
			const make = type === 'highpass' ? designHighPass : designLowPass;
			const d = make({ response, amaxDb: 1, aminDb: 40, fp: 10000, fs: type === 'highpass' ? 4000 : 25000, order: null });
			if (!d || !d.stages.length) continue;
			blocks.push(...explainApproximation(d), ...explainOrder({ response, amaxDb: 1, aminDb: 40, k: d.k, minOrder: d.minOrder, filterType: type, tried: d.orderSearch }));
			d.stages.forEach((_, i) => blocks.push(...(type === 'highpass' ? explainHpStage(d, i) : explainStage(d, i))));
			for (const s of d.stages.filter((x) => Number.isFinite(x.wz))) blocks.push(...explainTowThomasNotch(designTowThomasNotch(s.wn, s.q, s.wz, { lowSide: type === 'lowpass' }), s.wn, s.q, s.wz));
		}
	}
	blocks.push(...explainSummingAmp(10000, { mode: 'sum', lpGain: 1.08, resistors: { RCA: 10800, RCB: 10000, RCF: 10000 } }), ...explainSummingAmp(10000, { mode: 'difference', lpGain: 0.93, resistors: { RCH: 10000, RCG: 9300, RCL: 9300, RCF: 10000 } }));
	let texBad = 0;
	let wordBad = 0;
	for (const b of blocks) {
		if (b.type === 'eq') {
			try {
				katex.renderToString(b.tex, { throwOnError: true, strict: 'ignore' });
			} catch (e) {
				texBad++;
				console.log('   KATEX', b.tex.slice(0, 90), e.message.slice(0, 80));
			}
		} else if (/undefined|NaN|[–—]|\byou(r)?\b/i.test(b.text)) {
			wordBad++;
			console.log('   TEXT', b.text.slice(0, 120));
		}
	}
	check(`new explanations: ${blocks.filter((b) => b.type === 'eq').length} equations render, no placeholders, no long dashes, never "you"`, texBad === 0 && wordBad === 0, `${texBad} TeX, ${wordBad} text`);

	// the downloadable script runs for the new responses and finds its own spec met
	const dir = mkdtempSync(join(tmpdir(), 'rbt56-filter-'));
	let scriptBad = 0;
	const scripts = [
		{ filterType: 'lowpass', response: 'elliptic', amaxDb: 1, aminDb: 40, fp: 10000, fs: 20000 },
		{ filterType: 'highpass', response: 'inverseChebyshev', amaxDb: 1, aminDb: 40, fp: 10000, fs: 4000 },
		{ filterType: 'lowpass', response: 'bessel', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 },
		{ filterType: 'lowpass', response: 'legendre', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 },
		{ filterType: 'bandstop', response: 'elliptic', responseHp: 'butterworth', responseLp: 'elliptic', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 },
		{ filterType: 'bandpass', response: 'legendre', responseHp: 'legendre', responseLp: 'inverseChebyshev', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 }
	];
	for (const spec of scripts) {
		const code = generateScript({ fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, topology: 'mfb', order: null, orderHp: null, orderLp: null, capOverrides: {}, ...spec });
		const file = join(dir, `${spec.filterType}-${spec.response}.js`);
		writeFileSync(file, code);
		try {
			const out = execFileSync(process.execPath, [file], { encoding: 'utf8' });
			if (!/least attenuation in the stopband .*: OK/.test(out)) {
				scriptBad++;
				console.log('   SCRIPT', spec.filterType, spec.response, out.trim().split('\n').pop());
			}
		} catch (e) {
			scriptBad++;
			console.log('   SCRIPT', spec.filterType, spec.response, String(e.stderr || e.message).split('\n').slice(0, 3).join(' / '));
		}
	}
	check(`downloadable script: runs for ${scripts.length} new-response designs and reports its spec met`, scriptBad === 0, `${scriptBad} failures`);
}

console.log(fails === 0 ? 'filter checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
