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
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import katex from 'katex';
import { besselPrototype, ellipticOrder, inverseChebyshevOrder, legendrePolynomial, prototypeFor, prototypeLossDb } from '../src/lib/filter/approximations.js';
import { combinerChoice, magnitudePhaseAt, magnitudePhaseAtParallelSum } from '../src/lib/filter/bode.js';
import { generateScript } from '../src/lib/filter/codegen.js';
import { explainApproximation, explainFirstOrder, explainHpStage, explainMfb, explainMfbHp, explainOrder, explainSallenKey, explainSallenKeyHp, explainStage, explainSummingAmp, explainTowThomas, explainTowThomasHp } from '../src/lib/filter/explain.js';
import { explainTowThomasNotch } from '../src/lib/filter/explainResponses.js';
import { designFirstOrderLowPass, designFirstOrderLowPassFromCap } from '../src/lib/filter/firstOrder.js';
import { designFirstOrderHighPass, designFirstOrderHighPassFromCap } from '../src/lib/filter/firstOrderHighPass.js';
import { designMfbLowPass, designMfbLowPassFromCaps } from '../src/lib/filter/mfb.js';
import { designMfbHighPass, designMfbHighPassFromCap } from '../src/lib/filter/mfbHighPass.js';
import { designSallenKeyLowPass, designSallenKeyLowPassFromCaps } from '../src/lib/filter/sallenKey.js';
import { designSallenKeyHighPass, designSallenKeyHighPassFromCap } from '../src/lib/filter/sallenKeyHighPass.js';
import { LAB_KIT, pairedResistor, seriesPair } from '../src/lib/filter/eseries.js';
import { TOW_THOMAS_SENSITIVITY } from '../src/lib/filter/sensitivity.js';
import { generateNetlist, generateSchematic, spiceValue } from '../src/lib/filter/spice.js';
import { designBandStop, designHighPass, designLowPass } from '../src/lib/filter/stages.js';
import { designTowThomasHighPass, designTowThomasHighPassFromCap, designTowThomasLowPass, designTowThomasLowPassFromCap, designTowThomasNotch, designTowThomasNotchFromCap } from '../src/lib/filter/towThomas.js';
import { audit } from '../src/lib/spice/geometry.js';

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
	// zeros take the Tow-Thomas topology, as the page insists, on their own
	// side only: the other side of a band filter keeps MFB
	const zeros = (r) => r === 'elliptic' || r === 'inverseChebyshev';
	const band = (spec) => spec.filterType === 'bandpass' || spec.filterType === 'bandstop';
	const wiring = (spec, other = 'mfb') =>
		band(spec)
			? { topology: 'mfb', topologyHp: zeros(spec.responseHp) ? 'towThomas' : other, topologyLp: zeros(spec.responseLp) ? 'towThomas' : other }
			: { topology: zeros(spec.response) ? 'towThomas' : other };
	const withZeros = (spec) => (band(spec) ? zeros(spec.responseHp) || zeros(spec.responseLp) : zeros(spec.response));
	const base = { fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {} };
	for (const spec of scripts) {
		const code = generateScript({ ...base, ...spec, ...wiring(spec) });
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
	check(`downloadable script: runs for ${scripts.length} new-response designs, a band filter's plain side on MFB, and reports its spec met`, scriptBad === 0, `${scriptBad} failures`);

	// the other side of a band filter may be Sallen-Key as well
	{
		const spec = scripts.find((s) => s.filterType === 'bandpass');
		const file = join(dir, 'bandpass-sallenkey-side.js');
		writeFileSync(file, generateScript({ ...base, ...spec, ...wiring(spec, 'sallenKey') }));
		let ok = false;
		try {
			ok = /least attenuation in the stopband .*: OK/.test(execFileSync(process.execPath, [file], { encoding: 'utf8' }));
		} catch {
			ok = false;
		}
		check('downloadable script: a band-pass with Legendre on Sallen-Key and inverse Chebyshev on Tow-Thomas runs and meets its spec', ok);
	}

	// and refuses a zeros response on any other topology, with the reason and the menu to change
	let refused = 0;
	const zeroSpecs = scripts.filter(withZeros);
	for (const spec of zeroSpecs) {
		for (const topology of ['mfb', 'sallenKey']) {
			const w = band(spec)
				? { topology: 'mfb', topologyHp: zeros(spec.responseHp) ? topology : 'mfb', topologyLp: zeros(spec.responseLp) ? topology : 'mfb' }
				: { topology };
			const name = band(spec) ? (zeros(spec.responseHp) ? 'TOPOLOGY_HP' : 'TOPOLOGY_LP') : 'TOPOLOGY';
			const file = join(dir, `${spec.filterType}-${spec.response}-${topology}.js`);
			writeFileSync(file, generateScript({ ...base, ...spec, ...w }));
			try {
				execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				if (new RegExp(`can only be built with Tow-Thomas stages: set ${name} = 'towThomas'`).test(String(e.stderr))) refused++;
			}
		}
	}
	check("downloadable script: stops on an elliptic or inverse Chebyshev side on MFB or Sallen-Key, and names the menu to set to Tow-Thomas", refused === 2 * zeroSpecs.length, `${refused} of ${2 * zeroSpecs.length}`);
}

/* ---------------------------------- a band filter's limits, side by side */
{
	const { designBandPass, minimumOrder } = await import('../src/lib/filter/stages.js');
	const { transitionRatio } = await import('../src/lib/filter/order.js');
	const edgesBp = { fl: 1000, fh: 10000, fsl: 300, fsh: 30000 };
	const edgesBs = { fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 };
	const sides = { amaxDbHp: 1, aminDbHp: 30, amaxDbLp: 0.5, aminDbLp: 60 };

	// each side's order and prototype come from its own two limits
	const bp = designBandPass({ responseHp: 'butterworth', responseLp: 'chebyshev', ...edgesBp, ...sides });
	const bpHp = minimumOrder('butterworth', 1, 30, transitionRatio(300, 1000)).n;
	const bpLp = minimumOrder('chebyshev', 0.5, 60, transitionRatio(10000, 30000)).n;
	check(
		'band-pass: each side is designed on its own Amax and Amin',
		bp.hp.amaxDb === 1 && bp.hp.aminDb === 30 && bp.lp.amaxDb === 0.5 && bp.lp.aminDb === 60 && bp.hp.n === bpHp && bp.lp.n === bpLp && bp.amaxDb === null && bp.aminDb === null,
		`n = ${bp.hp.n} + ${bp.lp.n}, expected ${bpHp} + ${bpLp}`
	);
	// a band-stop, as the page builds it: an Amax per branch, one Amin for the stopband both share
	const bs = designBandStop({ responseHp: 'butterworth', responseLp: 'butterworth', ...edgesBs, amaxDbHp: 1, amaxDbLp: 0.5, aminDb: 50 });
	const bsLp = minimumOrder('butterworth', 0.5, 50, transitionRatio(1000, 3000)).n;
	const bsHp = minimumOrder('butterworth', 1, 50, transitionRatio(10000, 30000)).n;
	check('band-stop: each branch gets its own Amax at its passband edge and the one Amin at its stopband edge', bs.lp.amaxDb === 0.5 && bs.hp.amaxDb === 1 && bs.lp.aminDb === 50 && bs.hp.aminDb === 50 && bs.lp.n === bsLp && bs.hp.n === bsHp && bs.amaxDb === null && bs.aminDb === 50, `n = ${bs.lp.n} + ${bs.hp.n}, expected ${bsLp} + ${bsHp}`);

	// left out, the per-side limits are the shared pair: the same design as before
	const shared = { responseHp: 'legendre', responseLp: 'elliptic', amaxDb: 2, aminDb: 45, ...edgesBp };
	const same = JSON.stringify(designBandPass(shared)) === JSON.stringify(designBandPass({ ...shared, amaxDbHp: 2, aminDbHp: 45, amaxDbLp: 2, aminDbLp: 45 }));
	check('band-pass: one shared Amax and Amin give the same design as the same pair on each side', same && designBandPass(shared).amaxDb === 2);

	// the downloadable script designs and checks each side against its own limits
	const dir = mkdtempSync(join(tmpdir(), 'rbt56-sides-'));
	const run = (name, opts) => {
		const file = join(dir, `${name}.js`);
		writeFileSync(file, generateScript({ fp: 10000, fs: 35000, order: null, orderHp: null, orderLp: null, capOverrides: {}, response: 'butterworth', responseHp: 'butterworth', responseLp: 'butterworth', topology: 'mfb', amaxDb: 3, aminDb: 40, ...opts }));
		try {
			return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
		} catch (e) {
			return 'ERROR ' + String(e.stderr || e.message);
		}
	};
	const okBp = run('bp-sides', { filterType: 'bandpass', ...edgesBp, ...sides });
	// the band-stop's AMIN_HP and AMIN_LP (set here to 30 and 60) are ignored: its one stopband takes Amin
	const okBs = run('bs-sides', { filterType: 'bandstop', ...edgesBs, ...sides, aminDb: 50 });
	check(
		'downloadable script: a band-pass with Amax and Amin per side, and a band-stop with Amax per branch and one Amin, meet them',
		/least attenuation in the stopband .*: OK/.test(okBp) &&
			/least attenuation in the stopband .*\(spec asks for >= 50 dB there\): OK/.test(okBs) &&
			/high-pass side Amax=1 dB Amin=30 dB, low-pass side Amax=0.5 dB Amin=60 dB/.test(okBp) &&
			/Amin=50 dB across the stopband, low-pass branch Amax=0.5 dB, high-pass branch Amax=1 dB/.test(okBs),
		[okBp, okBs].map((o) => o.trim().split('\n').pop()).join(' / ')
	);
	// held to the shared 30 dB the low-pass side would pass with fewer stages: the check must see its own 60 dB
	const nFor30 = minimumOrder('butterworth', 0.5, 30, transitionRatio(10000, 30000)).n;
	const short = run('bp-short', { filterType: 'bandpass', ...edgesBp, ...sides, orderLp: nFor30 });
	check('downloadable script: a low-pass side built for 30 dB is reported short of its own 60 dB', /least attenuation in the stopband .*: NOT MET/.test(short) && /asks for >= 60 dB there/.test(short), short.trim().split('\n').pop());
}

/* -------------------------------------------- 8. two resistors in series */
// The stock picker's "two in series" option (pairedResistor in eseries.js):
// with a list of values, a resistor that sets f0, Q or a zero may be the
// sum of two. The sweep runs every designer, automatic and from capacitors
// chosen by hand, over a spread of f0 and Q.
const PAIR_F0 = [37, 480, 3300, 10000, 32260, 150000];
const PAIR_Q = [0.5412, 0.7071, 1.3066, 1.8398, 3, 8];
/** Every designer, automatic and from capacitors chosen by hand, over a spread of f0 and Q: [label, design] rows. */
function sweepDesigns(opts) {
	const rows = [];
	for (const f0 of PAIR_F0) {
		const wn = 2 * Math.PI * f0;
		const tau = 1 / wn;
		const fo = designFirstOrderLowPass(tau, opts);
		rows.push(['firstOrder', fo], ['firstOrder by hand', designFirstOrderLowPassFromCap(tau, fo.components.C * 2.2, opts)]);
		rows.push(['firstOrderHp', designFirstOrderHighPass(tau, opts)], ['firstOrderHp by hand', designFirstOrderHighPassFromCap(tau, fo.components.C / 2.2, opts)]);
		for (const q of PAIR_Q) {
			const at = `${f0} Hz Q ${q}`;
			const mfb = designMfbLowPass(wn, q, opts);
			rows.push([`mfb ${at}`, mfb]);
			if (mfb) {
				rows.push([`mfb by hand ${at}`, designMfbLowPassFromCaps(wn, q, mfb.components.C1 * 2.2, mfb.components.C2, opts)]);
				rows.push([`mfb by hand, too close ${at}`, designMfbLowPassFromCaps(wn, q, mfb.components.C2, mfb.components.C2, opts)]);
			}
			const mfbHp = designMfbHighPass(wn, q, opts);
			rows.push([`mfbHp ${at}`, mfbHp], [`mfbHp by hand ${at}`, designMfbHighPassFromCap(wn, q, mfbHp.components.C1 * 2.2, opts)]);
			const sk = designSallenKeyLowPass(wn, q, opts);
			rows.push([`sallenKey ${at}`, sk]);
			if (sk) rows.push([`sallenKey by hand ${at}`, designSallenKeyLowPassFromCaps(wn, q, sk.components.Ctop * 1.5, sk.components.Cbottom, opts)]);
			const skHp = designSallenKeyHighPass(wn, q, opts);
			rows.push([`sallenKeyHp ${at}`, skHp], [`sallenKeyHp by hand ${at}`, designSallenKeyHighPassFromCap(wn, q, skHp.components.C1 * 2.2, opts)]);
			const tt = designTowThomasLowPass(wn, q, opts);
			rows.push([`towThomas ${at}`, tt]);
			if (tt) rows.push([`towThomas by hand ${at}`, designTowThomasLowPassFromCap(wn, q, tt.components.C1 * 2.2, opts)]);
			const ttHp = designTowThomasHighPass(wn, q, opts);
			rows.push([`towThomasHp ${at}`, ttHp]);
			if (ttHp) rows.push([`towThomasHp by hand ${at}`, designTowThomasHighPassFromCap(wn, q, ttHp.components.C1 / 2.2, opts)]);
			for (const [ratio, lowSide] of [[1.6, true], [3.1, true], [1 / 1.7, false], [1 / 2.9, false]]) {
				const notch = designTowThomasNotch(wn, q, wn * ratio, { ...opts, lowSide });
				rows.push([`notch ${ratio.toFixed(3)} ${at}`, notch]);
				if (notch) rows.push([`notch by hand ${ratio.toFixed(3)} ${at}`, designTowThomasNotchFromCap(wn, q, wn * ratio, notch.components.C1 * 2.2, { ...opts, lowSide })]);
			}
		}
	}
	return rows;
}
/** A design as plain text, numbers to nine digits (so a last-bit difference in Math.log cannot show) and lists by length. */
function designText([label, d]) {
	const flat = (o) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toPrecision(9)) : Array.isArray(v) ? v.length : v]));
	return JSON.stringify([label, d && { ...flat(d), theoretical: flat(d.theoretical), components: flat(d.components), actual: flat(d.actual), steps: flat(d.steps) }]);
}
const fingerprint = (rows) => createHash('sha256').update(rows.map(designText).join('\n')).digest('hex').slice(0, 16);
const PAIR_STOCKS = {
	E24: { resistorSeries: 'E24', capacitors: null },
	E96: { resistorSeries: 'E96', capacitors: null },
	lab: { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors },
	labR: { resistorSeries: LAB_KIT.resistors, capacitors: null }
};

// (a) Off, and always for E24 and E96 (a full series has a close value
// everywhere), every design is the one the code gave before the option
// existed: these fingerprints were taken from that code over this sweep.
// A deliberate change to a designer moves them too: rerun and update them.
{
	// retaken when the searches began to avoid capacitors under 47 pF (C_FLOOR in eseries.js)
	const BEFORE = { E24: 'c145fc6ff57332c7', E96: '9fb167b8061e19b8', lab: '90bf9582cfc60661', labR: 'a63bd8c92ed9f783' };
	for (const [name, opts] of Object.entries(PAIR_STOCKS)) {
		const rows = sweepDesigns({ ...opts, pairs: false });
		const off = fingerprint(rows);
		const unset = fingerprint(sweepDesigns(opts));
		const list = Array.isArray(opts.resistorSeries);
		const on = list ? null : fingerprint(sweepDesigns({ ...opts, pairs: true }));
		check(
			`pairs off, ${name}${list ? '' : ' (and on: a series never pairs)'}: all ${rows.length} designs exactly as before the option`,
			off === BEFORE[name] && unset === BEFORE[name] && (list || on === BEFORE[name]),
			`${off}${list ? '' : `, on ${on}`}, expected ${BEFORE[name]}`
		);
	}
}

// (b) On, with the lab kit: every resistor is a kit value or two of them in
// series; only the parts that set f0, Q or a zero pair up, each exactly as
// the rule picks for its own target (Rd for the rounded R, Rz for the parts
// actually used), or, in a stage those pairs would have left further off,
// every part a single value; the inverter's matched pair and the
// capacitors stay single kit values.
{
	const kit = LAB_KIT.resistors;
	const inList = (list, v) => list.some((x) => Math.abs(x / v - 1) < 1e-9);
	const TARGETS = {
		mfb: (d) => ({ R1: d.theoretical.R1, R2: d.theoretical.R2, R3: d.theoretical.R1 }),
		mfbHp: (d) => ({ R1: d.theoretical.R1, R2: d.theoretical.R2 }),
		sallenKey: (d) => ({ R1: d.steps.Rtarget, R2: d.steps.Rtarget }),
		sallenKeyHp: (d) => ({ Rtop: d.steps.RtopTarget, Rbottom: d.steps.RbottomTarget }),
		towThomas: (d) => ({ R1: d.steps.Rtarget, Ra: d.steps.Rtarget, Rb: d.steps.Rtarget, Rd: d.steps.RdTarget }),
		towThomasHp: (d) => ({ Ra: d.steps.Rtarget, Rb: d.steps.Rtarget, Rd: d.steps.RdTarget }),
		towThomasNotch: (d) => ({ Ra: d.steps.Rtarget, Rb: d.steps.Rtarget, Rd: d.steps.RdTarget, Rz: d.steps.RzTarget }),
		firstOrder: (d) => ({ R: d.steps.Rtarget }),
		firstOrderHp: (d) => ({ R: d.steps.Rtarget })
	};
	for (const name of ['lab', 'labR']) {
		const rows = sweepDesigns({ ...PAIR_STOCKS[name], pairs: true }).filter(([, d]) => d && d.components);
		const problems = [];
		const pairedParts = new Set();
		let resistors = 0;
		let paired = 0;
		let kept = 0;
		for (const [label, d] of rows) {
			const targets = TARGETS[d.topology](d);
			// every figure-setting part as the rule picks it, with pairs or (the stage kept single parts) without
			const rule = (p) => Object.entries(targets).every(([part, t]) => d.components[part] === pairedResistor(t, kit, p));
			if (!rule(true)) {
				if (rule(false)) kept++;
				else problems.push(`${label}: ${JSON.stringify(d.components)} is neither the rule's pairs nor single parts`);
			}
			for (const [part, v] of Object.entries(d.components)) {
				if (/^[Rr]/.test(part)) {
					resistors++;
					const pair = seriesPair(v, kit);
					if (pair) {
						paired++;
						pairedParts.add(`${d.topology} ${part}`);
					}
					if (!(part in targets)) {
						if (!inList(kit, v)) problems.push(`${label} ${part} = ${v} should be one kit value`);
					} else if (!inList(kit, v) && !pair) problems.push(`${label} ${part} = ${v} is neither a kit value nor two of them`);
				} else if (name === 'lab' && !/by hand/.test(label) && !inList(LAB_KIT.capacitors, v)) problems.push(`${label} ${part} = ${v} is not a kit capacitor`);
			}
		}
		// every part that sets a figure pairs somewhere in the sweep
		const expected = Object.entries(TARGETS).flatMap(([t, f]) => Object.keys(f({ theoretical: {}, steps: {} })).map((part) => `${t} ${part}`));
		const never = expected.filter((p) => !pairedParts.has(p));
		check(
			`pairs on, ${name}: every resistor a kit value or two in series, only the parts that set f0, Q or a zero pair up, each as the rule picks for its target`,
			problems.length === 0 && never.length === 0,
			problems.length ? problems.slice(0, 3).join('; ') : never.length ? `never paired: ${never.join(', ')}` : `${paired} of ${resistors} resistors in ${rows.length} designs are pairs, ${kept} stages kept single parts`
		);
	}
}

// What the pairs buy: how far each stage lands from its targets, the
// largest of its f0, Q and (for a notch) zero misses as logs, or its tau
// miss, with the option off and on. Every designer keeps a stage's pairs
// only when they leave it no further off by that measure than single parts,
// since pairing each part on its own miss is not enough: in an MFB
// low-pass the misses of R1 and R2 can partly cancel in Q, a Tow-Thomas Rd
// is re-solved against the paired R, and the notch search can settle on
// another capacitor. So no stage of any designer may come out worse. The
// worst and mean misses are printed for the record.
{
	const STAGE_KINDS = {
		firstOrder: (wn, q, o) => designFirstOrderLowPass(1 / wn, o),
		sallenKey: (wn, q, o) => designSallenKeyLowPass(wn, q, o),
		sallenKeyHp: (wn, q, o) => designSallenKeyHighPass(wn, q, o),
		mfbHp: (wn, q, o) => designMfbHighPass(wn, q, o),
		mfb: (wn, q, o) => designMfbLowPass(wn, q, o),
		towThomas: (wn, q, o) => designTowThomasLowPass(wn, q, o),
		towThomasHp: (wn, q, o) => designTowThomasHighPass(wn, q, o),
		notch: (wn, q, o) => designTowThomasNotch(wn, q, wn * 1.6, { ...o, lowSide: true }),
		notchHp: (wn, q, o) => designTowThomasNotch(wn, q, wn / 1.7, { ...o, lowSide: false })
	};
	const stageMiss = (d, wn, q) =>
		d.order === 1
			? Math.abs(Math.log(d.actual.tau * wn))
			: Math.max(Math.abs(Math.log(d.actual.wn / wn)), Math.abs(Math.log(d.actual.q / q)), d.actual.wz ? Math.abs(Math.log(d.actual.wz / (d.lowSide ? wn * 1.6 : wn / 1.7))) : 0);
	// 50 Hz to 100 kHz, low to high Q, the kit with its capacitors and with every capacitor
	const grid = [];
	for (let i = 0; i <= 30; i++) for (const q of [0.5, 0.5412, 0.6, 0.7071, 0.9, 1.1, 1.3066, 1.6, 1.8398, 2.2, 3, 4.5, 8]) grid.push([2 * Math.PI * 50 * 2000 ** (i / 30), q]);
	const pct = (x) => `${(100 * x).toFixed(2)}%`;
	for (const [kind, make] of Object.entries(STAGE_KINDS)) {
		const s = { stages: 0, better: 0, worse: [], worstOff: 0, worstOn: 0, sumOff: 0, sumOn: 0 };
		for (const stock of [PAIR_STOCKS.lab, PAIR_STOCKS.labR]) {
			for (const [wn, q] of grid) {
				const off = make(wn, q, { ...stock, pairs: false });
				const on = make(wn, q, { ...stock, pairs: true });
				if (!off || !on) continue;
				const a = stageMiss(off, wn, q);
				const b = stageMiss(on, wn, q);
				s.stages++;
				if (b < a) s.better++;
				if (b > a) s.worse.push(`${(wn / 2 / Math.PI).toFixed(0)} Hz Q ${q}: ${pct(a)} -> ${pct(b)}`);
				s.worstOff = Math.max(s.worstOff, a);
				s.worstOn = Math.max(s.worstOn, b);
				s.sumOff += a;
				s.sumOn += b;
			}
		}
		// a Sallen-Key low-pass's Q comes from its capacitors, so its miss often stays what it was
		check(
			`pairs on, ${kind}: no stage worse, ${s.better} of ${s.stages} better`,
			s.worse.length === 0 && s.better * 3 > s.stages,
			s.worse.length ? `${s.worse.length} worse, first ${s.worse[0]}` : `worst stage ${pct(s.worstOff)} -> ${pct(s.worstOn)}, mean ${pct(s.sumOff / s.stages)} -> ${pct(s.sumOn / s.stages)}`
		);
	}

	// where pairing each part on its own miss would leave the stage further
	// off, it keeps single parts: an MFB low-pass stage (Q 0.5412 at 79.6
	// kHz: R1 8.2 k would take 8.2 k + 330 while R2 = 15 k stays single, and
	// f0 would go from 0.8 % to 2.8 % low) and the first stage of a Chebyshev
	// Tow-Thomas high-pass (Q 3.07 at 10.9 kHz: pairing R would move Rd's
	// target 4 % from 47 k, with no pair halving that)
	{
		const wn = 2 * Math.PI * 20 * 10 ** 3.6;
		const hp = designHighPass({ response: 'chebyshev', amaxDb: 3, aminDb: 40, fp: 10000, fs: 3000, order: null }).stages[0];
		const cases = [
			[designMfbLowPass(wn, 0.5412, { ...PAIR_STOCKS.lab, pairs: false }), designMfbLowPass(wn, 0.5412, { ...PAIR_STOCKS.lab, pairs: true }), (d) => d.theoretical.R1, 'R1'],
			[designTowThomasHighPass(hp.wn, hp.q, { ...PAIR_STOCKS.lab, pairs: false }), designTowThomasHighPass(hp.wn, hp.q, { ...PAIR_STOCKS.lab, pairs: true }), (d) => d.steps.Rtarget, 'Ra']
		];
		const kept = cases.filter(([off, on, target, part]) => JSON.stringify(on.components) === JSON.stringify(off.components) && pairedResistor(target(off), LAB_KIT.resistors, true) !== off.components[part]);
		check('pairs on: a stage those pairs would leave further off keeps its single parts (an MFB low-pass and a Tow-Thomas high-pass stage)', kept.length === cases.length, `${kept.length} of ${cases.length}`);
	}

	// two known cases. An MFB high-pass stage of 32.26 kHz, Q 1.8398: the
	// kit's nearest single values, 1.5 k and 47 k, put f0 13.6 % low.
	{
		const wn = 2 * Math.PI * 32260;
		const q = 1.8398;
		const off = designMfbHighPass(wn, q, { ...PAIR_STOCKS.lab, pairs: false });
		const on = designMfbHighPass(wn, q, { ...PAIR_STOCKS.lab, pairs: true });
		const f0 = (d) => d.actual.wn / wn - 1;
		const qe = (d) => d.actual.q / q - 1;
		check(
			'pairs on: MFB high-pass at 32.26 kHz, Q 1.8398 goes from 1.5 k and 47 k to 1 k + 330 and 33 k + 7.5 k, f0 back within 1.5 %',
			off.components.R1 === 1500 && off.components.R2 === 47000 && f0(off) < -0.13 && JSON.stringify(seriesPair(on.components.R1, LAB_KIT.resistors)) === '[1000,330]' && JSON.stringify(seriesPair(on.components.R2, LAB_KIT.resistors)) === '[33000,7500]' && Math.abs(f0(on)) < 0.015 && Math.abs(qe(on)) < 0.005,
			`f0 ${pct(f0(off))} -> ${pct(f0(on))}, Q ${pct(qe(off))} -> ${pct(qe(on))}`
		);
	}
	// the page's opening design (Butterworth low-pass, 10 kHz, 3 and 40 dB, MFB) on the lab kit
	{
		const design = designLowPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null });
		const worst = (pairs) => Math.max(...design.stages.map((st) => designMfbLowPass(st.wn, st.q, { ...PAIR_STOCKS.lab, pairs })).map((r, i) => Math.abs(r.actual.wn / design.stages[i].wn - 1)));
		check("pairs on: the page's opening design on the lab kit gets every f0 within 1 %", worst(false) > 0.1 && worst(true) < 0.01, `worst f0 ${pct(worst(false))} -> ${pct(worst(true))}`);
	}
}

// the math panels print a pair with its two parts and name what was
// rounded to (the list, not every value on it), and still render
{
	const o = { ...PAIR_STOCKS.lab, pairs: true };
	const wn = 2 * Math.PI * 10000;
	const blocks = [
		...explainMfb(designMfbLowPass(wn, 0.5412, o), wn, 0.5412),
		...explainMfb(designMfbLowPass(wn, 0.5412, PAIR_STOCKS.lab), wn, 0.5412),
		...explainMfbHp(designMfbHighPass(2 * Math.PI * 32260, 1.8398, o), 2 * Math.PI * 32260, 1.8398),
		...explainSallenKey(designSallenKeyLowPass(wn, 0.7071, o), 0.7071),
		...explainSallenKeyHp(designSallenKeyHighPass(wn, 0.7071, o), 0.7071),
		...explainFirstOrder(designFirstOrderLowPass(1 / wn, o)),
		...explainTowThomas(designTowThomasLowPass(wn, 1.618, o), wn, 1.618),
		...explainTowThomasHp(designTowThomasHighPass(wn, 1.618, o), wn, 1.618)
	];
	const texts = blocks.filter((b) => b.type === 'p').map((b) => b.text);
	let texBad = 0;
	for (const b of blocks.filter((x) => x.type === 'eq')) {
		try {
			katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
		} catch {
			texBad++;
		}
	}
	// "NaN" case-sensitive, or it would find "discriminant"
	const wordBad = texts.filter((t) => /undefined|NaN/.test(t) || /[–—]|\byou(r)?\b|\d,\d/i.test(t));
	const pairShown = texts.filter((t) => /Ω \([\d.]+ k?Ω \+ [\d.]+ k?Ω\)/.test(t)).length;
	check('pairs on: the math panels show each pair with its two parts, render, and name the list rather than printing it', texBad === 0 && wordBad.length === 0 && pairShown >= 6, wordBad.length ? wordBad[0].slice(0, 120) : `${pairShown} sentences with a pair, ${texBad} TeX failures`);
}

// (c) The downloaded script: RESISTOR_PAIRS = true hands the option to the
// same designers and prints each pair with its two parts; switched to false
// it gives the single-part design back. The Chebyshev high-pass has a stage
// that keeps single parts with the option on (see above), so the script
// has to carry that rule too.
{
	const dir = mkdtempSync(join(tmpdir(), 'rbt56-pairs-'));
	const base = { amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {} };
	const run = (name, text) => {
		const file = join(dir, name);
		writeFileSync(file, text);
		try {
			return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
		} catch (e) {
			return 'ERROR ' + String(e.stderr || e.message);
		}
	};
	// each stage's resistors as the script prints them, from the page's own designers
	const printed = (stages, second, pairs) =>
		stages.flatMap((st) => {
			const o = { ...PAIR_STOCKS.lab, pairs };
			const ohms = (v) => {
				const pair = pairs ? seriesPair(v, LAB_KIT.resistors) : null;
				return `${v.toFixed(0)} ohm${pair ? ` (${pair[0]} + ${pair[1]} in series)` : ''}`;
			};
			if (st.order === 1) {
				const R = (st.filterType === 'highpass' ? designFirstOrderHighPass : designFirstOrderLowPass)(st.tau, o).components.R;
				return [`  R = ${pairs && seriesPair(R, LAB_KIT.resistors) ? ohms(R) : `${R} ohm`}, C = `];
			}
			return Object.entries(second(st, o).components)
				.filter(([n]) => /^[Rr]/.test(n))
				.map(([n, v]) => `  ${n} = ${ohms(v)}\n`);
		});
	const cases = [
		['mfb-lowpass', { filterType: 'lowpass', response: 'butterworth', topology: 'mfb', fp: 10000, fs: 35000 }, designLowPass, (st, o) => designMfbLowPass(st.wn, st.q, o)],
		['tt-highpass', { filterType: 'highpass', response: 'chebyshev', topology: 'towThomas', fp: 10000, fs: 3000 }, designHighPass, (st, o) => designTowThomasHighPass(st.wn, st.q, o)]
	];
	const problems = [];
	let sample = '';
	for (const [name, spec, make, second] of cases) {
		const code = generateScript({ ...base, ...spec, resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors, resistorPairs: true });
		const on = run(`${name}-on.js`, code);
		const off = run(`${name}-off.js`, code.replace('const RESISTOR_PAIRS = true;', 'const RESISTOR_PAIRS = false;'));
		const stages = make({ response: spec.response, amaxDb: 3, aminDb: 40, fp: spec.fp, fs: spec.fs, order: null }).stages;
		const missing = [...printed(stages, second, true).filter((l) => !on.includes(l)), ...printed(stages, second, false).filter((l) => !off.includes(l))];
		if (!/^const RESISTOR_PAIRS = true;/m.test(code) || !/^const RESISTOR_PAIRS = false;/m.test(generateScript({ ...base, ...spec }))) problems.push(`${name}: RESISTOR_PAIRS not written as asked`);
		if (!/ohm \(\d+ \+ \d+ in series\)/.test(on) || /in series\)/.test(off)) problems.push(`${name}: pairs printed ${/in series\)/.test(on) ? 'with the option off' : 'nowhere'}`);
		if (missing.length) problems.push(`${name} missing: ${missing[0].trim()}`);
		if (!/least attenuation in the stopband .*: OK/.test(on)) problems.push(`${name}: ${on.trim().split('\n').pop()}`);
		sample ||= on.split('\n').find((l) => /in series\)/.test(l))?.trim() ?? '';
	}
	check(
		'downloadable script: RESISTOR_PAIRS = true prints each pair with its two parts exactly as the page designs it (single parts where the page keeps them) and meets the spec; false gives single parts back',
		problems.length === 0,
		problems.length ? problems.slice(0, 2).join('; ') : sample
	);
}

// LTspice: the files keep each pair's sum, so the circuit is the one the
// page computes, and their notes name the two parts, one line per paired
// resistor, in the .cir header and on the .asc sheet
{
	const spec = { filterType: 'lowpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 };
	const design = designLowPass({ ...spec, order: null });
	const realized = design.stages.map((st) => designMfbLowPass(st.wn, st.q, { ...PAIR_STOCKS.lab, pairs: true }));
	const opts = { realizedStages: realized, topology: 'mfb', lpCount: 0, combinerMode: 'sum', combinerR: 10000, combinerResistors: null, ...spec, resistorStock: LAB_KIT.resistors, pairs: true };
	const cir = generateNetlist(opts);
	const asc = generateSchematic(opts);
	const circuit = (text) => text.split('\n').filter((l) => !l.startsWith('*')).join('\n');
	const notes = realized.flatMap((r, k) =>
		['R1', 'R2', 'R3'].flatMap((n) => {
			const pair = seriesPair(r.components[n], LAB_KIT.resistors);
			return pair ? [`stage ${k + 1} ${n}${k + 1} = ${spiceValue(pair[0])} + ${spiceValue(pair[1])} in series`] : [];
		})
	);
	const missing = notes.filter((l) => !cir.includes(`* ${l} (their sum is used below)\n`) || !asc.includes(`${l} (the drawing shows their sum)`));
	const issues = audit(asc);
	check(
		'LTspice: a note per paired resistor in the .cir header and on the .asc sheet, the circuit itself unchanged, drawn clean',
		notes.length === 6 && missing.length === 0 && circuit(cir) === circuit(generateNetlist({ ...opts, pairs: false })) && !/in series/.test(generateNetlist({ ...opts, pairs: false })) && issues.length === 0,
		missing.length ? `missing: ${missing[0]}` : issues.length ? `${issues[0].kind}: ${issues[0].detail}` : notes[0]
	);
}

console.log(fails === 0 ? 'filter checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
