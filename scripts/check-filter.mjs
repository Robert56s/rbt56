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
// 5. Band filters by transformation (the second method next to the
//    cascade and the parallel sum): the cascade unchanged, the
//    transformation's math, its ideal designs on spec and minimal, the
//    op-amp count and the automatic choice, the explanations, the
//    downloadable script, and the band-pass designers pinned.
// 10. MFB band-pass stages built for their op-amp (a single-pole GBW): the
//    exact model, the designs on a grid against the plain ones, where no
//    circuit or stock can land, the narrow band-pass with the TL082, the
//    op-amp count, the explanation and the downloadable script, which
//    without an op-amp stays as it was.
// 11. A limit on the pairs (the stock picker's "Up to N pairs"): the
//    designers' lists of names, the plan on whole filters for every N
//    against every combination of lists, the downloadable script with
//    RESISTOR_PAIR_LIMIT, the LTspice notes and the Start here panel.
// Exits non-zero on any failure.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import katex from 'katex';
import { boctorActual, boctorFeasible, designBoctorNotch, designBoctorNotchFromCap } from '../src/lib/filter/boctor.js';
import { explainBoctor } from '../src/lib/filter/explainBoctor.js';
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
import { LAB_KIT, pairedResistor, pairSubsets, seriesPair } from '../src/lib/filter/eseries.js';
import { TOW_THOMAS_SENSITIVITY } from '../src/lib/filter/sensitivity.js';
import { generateNetlist, generateSchematic, spiceValue } from '../src/lib/filter/spice.js';
import { bandCentre, bandStopbandRatio, designBandPass, designBandStop, designHighPass, designLowPass, minimumOrder as minimumOrderOf, notchOptions } from '../src/lib/filter/stages.js';
import { designTowThomasBandPass, designTowThomasBandPassFromCap, designTowThomasHighPass, designTowThomasHighPassFromCap, designTowThomasLowPass, designTowThomasLowPassFromCap, designTowThomasNotch, designTowThomasNotchFromCap } from '../src/lib/filter/towThomas.js';
import { audit } from '../src/lib/spice/geometry.js';
import { bandBoctorDesign, chooseBandMethod, mfbBandPassFeasible, opampCount, plannedTopology } from '../src/lib/filter/bandMethod.js';
import { designMfbBandPass, designMfbBandPassFromCaps, mfbBandPassActual, mfbBandPassEffective, mfbBandPassResponse } from '../src/lib/filter/mfbBandPass.js';
import { OPAMP_GBW } from '../src/lib/spice/opamps.js';
import { explainBandTransform, explainMfbBp, explainTowThomasBp, explainTransformedOrder, explainTransformedStage } from '../src/lib/filter/explain.js';
import { BAND_SPECS, BAND_SPEC_NAMES, RESPONSE_KEYS, designTransformed, hasZeros, realizeBandStage, realizeTransformed, targetStage, transformedMenus } from './lib-band.mjs';
import { filterPairCount, filterPairGroups, filterPairLimitSentence, filterPairPlanSummary, filterStageMeasure, planFilterPairs } from '../src/lib/filter/pairPlan.js';
import { filterBasics } from '../src/lib/filter/basics.js';

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
				if (new RegExp(`needs Tow-Thomas or Boctor notch stages: set ${name} = 'towThomas'`).test(String(e.stderr))) refused++;
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

// Boctor: exact ideal coefficients, stock rounding, manual edits and script parity.
{
	const wn = 2 * Math.PI * 10000;
	for (const lowSide of [true, false]) {
		const wz = wn * (lowSide ? 2 : 0.5), q = 0.9;
		for (const resistorSeries of ['E24', 'E96', LAB_KIT.resistors]) {
			const opts = { lowSide, resistorSeries };
			const d = designBoctorNotch(wn, q, wz, opts);
			const paired = designBoctorNotch(wn, q, wz, { ...opts, pairs: true });
			check(`Boctor ${lowSide ? 'LP' : 'HP'} stock design`, !!d && !!paired);
			if (!d) continue;
			const a = boctorActual(d.theoretical, lowSide);
			check('  ideal poles, Q and zero reproduce the target', Math.abs(a.wn / wn - 1) < 1e-10 && Math.abs(a.q / q - 1) < 1e-10 && Math.abs(a.wz / wz - 1) < 1e-10 && Math.abs(a.numeratorS / (a.gain * wz)) < 1e-10);
			const edited = designBoctorNotchFromCap(wn, q, wz, d.components.C1, opts);
			check('  manual C is respected', edited?.manual && edited.components.C1 === d.components.C1);
			for (const block of explainBoctor(d)) if (block.type === 'eq') {
				try { katex.renderToString(block.tex, { throwOnError: true, strict: 'error' }); }
				catch (e) { check('Boctor equation renders', false, e.message); }
			}
		}
	}
	check('Boctor rejects impossible high-pass Q and reversed zero ordering', !boctorFeasible(wn, 2, wn / 2, false) && designBoctorNotch(wn, 2, wn / 2, { lowSide: false }) === null && !boctorFeasible(wn, 1, wn / 2, true));
	const dir = mkdtempSync(join(tmpdir(), 'rbt56-boctor-'));
	for (const response of ['inverseChebyshev', 'elliptic']) {
		const opts = { filterType: 'lowpass', response, topology: 'boctor', stock: 'E24', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, capOverrides: {}, pairs: true };
		const text = generateScript(opts), path = join(dir, `${response}.js`);
		writeFileSync(path, text);
		try {
			const output = execFileSync(process.execPath, [path], { encoding: 'utf8' });
			check(`Boctor ${response} downloadable script executes`, output.includes('numerator s coefficient') && !output.includes('NaN'));
		} catch (e) { check(`Boctor ${response} script executes`, false, e.message); }
	}
}

/* --------------------------------------- 9. band filters by transformation */
// The second way to build a band filter (stages.js): one low-pass
// prototype with its passband edge at B = fh - fl and each stopband edge
// at its own Omega, every pole pair turned into two band-pass or notch
// stages about f0 = sqrt(fl fh), no summing amplifier. The page counts the
// op-amps of both ways and by default builds the one with fewer
// (bandMethod.js); the library default stays the cascade.
{
	const hz = (w) => w / (2 * Math.PI);
	const near = (a, b, tol) => Math.abs(a / b - 1) <= tol;
	const scan = ([a, b], count = 1200) => Array.from({ length: count + 1 }, (_, i) => a * (b / a) ** (i / count));
	/** An ideal design (its target stages) measured as the page measures it: from the top of its passband. */
	const measureBand = (d) => {
		const stages = d.stages.map(targetStage);
		const g = (f) => magnitudePhaseAt(stages, f).db;
		const bp = d.filterType === 'bandpass';
		const pass = (bp ? [[d.fl, d.fh]] : [[d.fl / 100, d.fl], [d.fh, d.fh * 100]]).flatMap((r) => scan(r)).map(g);
		const top = Math.max(...pass);
		const stops = bp ? [[[d.fsl / 1000, d.fsl], d.aminDbLow], [[d.fsh, d.fsh * 1000], d.aminDbHigh]] : [[[d.fsl, d.fsh], d.aminDb]];
		const margin = Math.min(...stops.map(([band, amin]) => Math.min(...scan(band).map((f) => top - g(f) - amin))));
		return { g, top, passLoss: top - Math.min(...pass), atFl: top - g(d.fl), atFh: top - g(d.fh), atFsl: top - g(d.fsl), atFsh: top - g(d.fsh), margin };
	};
	const meets = (d, m) => Math.abs(m.atFl - d.amaxDb) <= 1e-3 && Math.abs(m.atFh - d.amaxDb) <= 1e-3 && m.passLoss <= d.amaxDb + 1e-3 && m.margin >= -1e-3;
	/** The same band spec built the classic way, at its minimum orders: the band-pass's Amin per side. */
	const cascadeOf = (spec, response) =>
		spec.filterType === 'bandpass'
			? designBandPass({ response, amaxDb: spec.amaxDb, aminDbHp: spec.aminDbLow, aminDbLp: spec.aminDbHigh, fl: spec.fl, fh: spec.fh, fsl: spec.fsl, fsh: spec.fsh, orderLow: null, orderHigh: null })
			: designBandStop({ response, amaxDb: spec.amaxDb, aminDb: spec.aminDb, fl: spec.fl, fh: spec.fh, fsl: spec.fsl, fsh: spec.fsh, orderLow: null, orderHigh: null });
	const cascadeMenus = (side) => ({ method: 'cascade', highpass: side, lowpass: side });

	// (a) The cascade and the parallel sum stay the library default, stage
	// for stage: this fingerprint was taken from the code before the
	// transformation existed, over five band specs, six responses, the
	// minimum orders and orders 3 + 4. It covers the stage targets only
	// (order, type, f0, Q, zero, tau), so the new method key does not move
	// it; a change to the classic way of building a band does.
	{
		const BAND_CASCADE_BEFORE = '6c9b0252a4e2a460';
		const specs = [
			['bp default', 'bandpass', { amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 }],
			['bp sides', 'bandpass', { amaxDbHp: 1, aminDbHp: 30, amaxDbLp: 0.5, aminDbLp: 60, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 }],
			['bp narrow', 'bandpass', { amaxDb: 3, aminDbHp: 50, aminDbLp: 30, fl: 40000, fh: 60000, fsl: 10000, fsh: 100000 }],
			['bs default', 'bandstop', { amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 }],
			['bs sides', 'bandstop', { amaxDbHp: 1, amaxDbLp: 0.5, aminDb: 50, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 }]
		];
		const num = (v) => (Number.isFinite(v) ? Number(v.toPrecision(9)) : null);
		const rows = [];
		const methods = new Set();
		for (const [label, type, spec] of specs) {
			for (const response of RESPONSE_KEYS) {
				for (const [orderLow, orderHigh] of [[null, null], [3, 4]]) {
					const d = (type === 'bandpass' ? designBandPass : designBandStop)({ response, ...spec, orderLow, orderHigh, method: 'cascade' });
					methods.add(`${type} ${d.method}`);
					rows.push(JSON.stringify([label, response, orderLow, orderHigh, d.lp.n, d.hp.n, d.stages.map((s) => [s.order, s.filterType, num(s.wn), num(s.q), num(s.wz), num(s.tau)])]));
				}
			}
		}
		const got = createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16);
		check(
			`band filters the classic way: all ${rows.length} designs exactly as before the transformation existed, and they say 'cascade' / 'parallel'`,
			got === BAND_CASCADE_BEFORE && [...methods].sort().join() === 'bandpass cascade,bandstop parallel',
			`${got}, expected ${BAND_CASCADE_BEFORE}; ${[...methods].join(', ')}`
		);
	}

	// (b) The transformation's numbers: f0 and B, each stopband edge on the
	// prototype (Omega), the order counted edge by edge with its own Amin,
	// and the two designs worked by hand: the narrow band-pass (three
	// stages where the cascade takes seven) and the default band-stop.
	{
		const { f0, B } = bandCentre(40000, 60000);
		const omegaBp = [10000, 100000].map((fs) => bandStopbandRatio('bandpass', 40000, 60000, fs));
		const omegaBs = [3000, 10000].map((fs) => bandStopbandRatio('bandstop', 1000, 30000, fs));
		check(
			'transformation: f0 = sqrt(fl fh), B = fh - fl, Omega = |fs^2 - f0^2| / (fs B) for a band-pass and fs B / |f0^2 - fs^2| for a band-stop',
			near(f0, Math.sqrt(2.4e9), 1e-15) && B === 20000 && near(omegaBp[0], 11.5, 1e-12) && near(omegaBp[1], 3.8, 1e-12) && omegaBs.every((o) => near(o, 29 / 7, 1e-12)),
			`f0 ${f0.toFixed(2)} Hz, Omega ${omegaBp.map((o) => o.toFixed(4)).join(' / ')} and ${omegaBs.map((o) => o.toFixed(4)).join(' / ')}`
		);

		const bp = designTransformed(BAND_SPECS.narrowBp, 'butterworth');
		const [low, high] = bp.orderInfo.edges;
		check(
			'transformation: the narrow band-pass counts its order edge by edge (50 dB at Omega 11.5, 30 dB at Omega 3.8) and takes the larger, n = 3',
			low.omega === bp.omegaLow && high.omega === bp.omegaHigh && low.aminDb === 50 && high.aminDb === 30 &&
				near(low.value, minimumOrderOf('butterworth', 3, 50, 1 / 11.5).value, 1e-9) && near(high.value, minimumOrderOf('butterworth', 3, 30, 1 / 3.8).value, 1e-9) &&
				near(high.value, 2.5886, 1e-4) && bp.n === 3 && bp.n === Math.max(low.n, high.n),
			`n ${low.value.toFixed(4)} at fsl, ${high.value.toFixed(4)} at fsh, n = ${bp.n}`
		);
		const want = [
			['lower', 41047.01, 4.9719],
			['upper', 58469.55, 4.9719],
			['centre', 48989.79, 2.4476]
		];
		const m = measureBand(bp);
		check(
			'transformation: the narrow band-pass, Butterworth, is 41047 Hz and 58469.6 Hz at Q 4.972 and 48989.8 Hz at Q 2.448; from its peak it loses 63.6 dB at fsl, 3.000 dB at fl and fh, 34.8 dB at fsh',
			bp.stages.length === 3 &&
				bp.stages.every((s, i) => s.filterType === 'bandpass' && s.role === want[i][0] && near(hz(s.wn), want[i][1], 2e-7) && Math.abs(s.q - want[i][2]) < 5e-5) &&
				Math.abs(m.atFsl - 63.62) < 0.01 && Math.abs(m.atFl - 3) < 1e-3 && Math.abs(m.atFh - 3) < 1e-3 && Math.abs(m.atFsh - 34.77) < 0.01,
			`${bp.stages.map((s) => `${hz(s.wn).toFixed(2)} Hz Q ${s.q.toFixed(4)}`).join(', ')}; ${m.atFsl.toFixed(2)} / ${m.atFl.toFixed(4)} / ${m.atFh.toFixed(4)} / ${m.atFsh.toFixed(2)} dB`
		);

		const bs = designTransformed(BAND_SPECS.defaultBs, 'butterworth');
		const notches = [
			[1009.38, 1.3854, 'lowpass'],
			[29721.24, 1.3854, 'highpass'],
			[1061.44, 0.5476, 'lowpass'],
			[28263.5, 0.5476, 'highpass']
		];
		const ms = measureBand(bs);
		check(
			'transformation: the default band-stop, Butterworth, has Omega 4.1429 at both edges, n = 4, four notches with their zero on f0 = 5477.2 Hz, 3.000 dB at fl and fh and 49.36 dB at fsl and fsh',
			near(bs.omegaLow, 4.1429, 2e-5) && near(bs.omegaHigh, 4.1429, 2e-5) && bs.n === 4 && bs.stages.length === 4 &&
				bs.stages.every((s, i) => near(hz(s.wn), notches[i][0], 5e-6) && Math.abs(s.q - notches[i][1]) < 5e-5 && s.filterType === notches[i][2] && near(hz(s.wz), 5477.23, 1e-5)) &&
				Math.abs(ms.atFl - 3) < 1e-3 && Math.abs(ms.atFh - 3) < 1e-3 && Math.abs(ms.atFsl - 49.36) < 0.005 && Math.abs(ms.atFsh - 49.36) < 0.005,
			`${bs.stages.map((s) => `${hz(s.wn).toFixed(2)} Hz Q ${s.q.toFixed(4)} ${s.filterType}`).join(', ')}; ${ms.atFl.toFixed(4)} / ${ms.atFh.toFixed(4)} / ${ms.atFsl.toFixed(2)} / ${ms.atFsh.toFixed(2)} dB`
		);
	}

	// (c) Every response on the four band specs, with ideal parts: exactly
	// Amax lost at fl and fh measured from the passband top and never more
	// across the passband, at least Amin across each stopband (a band-pass's
	// Amin per edge), gain exactly 1 at f0 (band-pass) or at DC and far above
	// the band (band-stop), each pole pair two stages whose f0 multiply to
	// f0^2 with one Q (and zeros that multiply to f0^2 too), the whole the
	// prototype under the substitution, and one order less short of the spec.
	{
		let designs = 0;
		const bad = [];
		const unreachable = [];
		for (const [key, spec] of Object.entries(BAND_SPECS)) {
			for (const response of RESPONSE_KEYS) {
				const d = designTransformed(spec, response);
				const where = `${BAND_SPEC_NAMES[key]} ${response} n=${d.n}`;
				if (d.orderInfo.n === null) {
					unreachable.push(`${BAND_SPEC_NAMES[key]} ${response}`);
					continue;
				}
				designs++;
				const problems = [];
				const m = measureBand(d);
				if (!meets(d, m)) problems.push(`Amax ${m.atFl.toFixed(4)} / ${m.atFh.toFixed(4)} dB, passband ${m.passLoss.toFixed(4)} dB, Amin margin ${m.margin.toFixed(3)} dB`);
				const unity = d.filterType === 'bandpass' ? [m.g(d.f0)] : [m.g(0), m.g(d.fh * 1e6)];
				if (unity.some((x) => !(Math.abs(x) < 1e-9))) problems.push(`gain ${unity.map((x) => x.toExponential(1)).join(' / ')} dB at ${d.filterType === 'bandpass' ? 'f0' : 'DC / far above'}`);
				const w0sq = d.w0 * d.w0;
				d.stages.forEach((s, i) => {
					if (s.role === 'lower') {
						const up = d.stages[i + 1];
						const types = d.filterType === 'bandpass' ? ['highpass', 'lowpass'] : ['lowpass', 'highpass'];
						const pairOk = up?.role === 'upper' && up.pole === s.pole && s.wn < up.wn && near(s.wn * up.wn, w0sq, 1e-9) && near(s.q, up.q, 1e-9);
						const zerosOk = !Number.isFinite(s.wz) || (s.filterType === types[0] && up.filterType === types[1] && near(s.wz * up.wz, w0sq, 1e-9));
						if (!pairOk || !zerosOk) problems.push(`stages ${i + 1} and ${i + 2} are no pair about f0`);
					}
					if (s.role === 'centre' && !(s.wn === d.w0 && (d.filterType === 'bandpass' ? s.gain === 1 : s.notch === 'symmetric' && s.wz === s.wn))) problems.push(`stage ${i + 1} is not on f0`);
				});
				// |H(j w)| of the band filter is |H_lp(j Omega)| of its prototype, Omega = |w^2 - w0^2| / w or bw^2 w / |w0^2 - w^2|
				const proto = d.lowpass.stages.map(targetStage);
				let worst = 0;
				for (const f of scan([d.fl / 50, d.fh * 50], 400)) {
					const w = 2 * Math.PI * f;
					const omega = d.filterType === 'bandpass' ? Math.abs(w * w - w0sq) / w : (d.bw * d.bw * w) / Math.abs(w0sq - w * w);
					const a = m.g(f);
					const b = magnitudePhaseAt(proto, hz(omega)).db;
					if (a > -200 && b > -200) worst = Math.max(worst, Math.abs(a - b));
				}
				if (!(worst < 1e-6)) problems.push(`${worst.toExponential(1)} dB off its prototype`);
				if (d.n > 1) {
					const less = designTransformed(spec, response, d.n - 1);
					if (meets(less, measureBand(less))) problems.push(`order ${d.n - 1} meets the spec too`);
				}
				if (problems.length) bad.push(`${where}: ${problems.join(', ')}`);
			}
		}
		check(
			`transformation: ${designs} ideal designs (six responses, narrow and default band-pass and band-stop) lose exactly Amax at fl and fh and at least Amin across the stopband, pass gain 1 at f0 or at DC, pair their stages about f0, equal their prototype, and need every order they have`,
			designs === 4 * RESPONSE_KEYS.length - unreachable.length && unreachable.join() === 'narrow band-stop bessel' && bad.length === 0,
			bad.length ? bad.slice(0, 3).join('; ') : `out of reach: ${unreachable.join(', ') || 'none'}`
		);
	}

	// (d) The op-amp count and the automatic choice (bandMethod.js), each
	// method at its minimum order under the page's menus. The narrow
	// band-pass takes 7 op-amps as a cascade on MFB and 3 as band-pass
	// stages, so it is transformed; a tie keeps the cascade; a cascade notch
	// on MFB cannot be built, which leaves the transformation.
	{
		const narrow = BAND_SPECS.narrowBp;
		const c = opampCount(cascadeOf(narrow, 'butterworth'), cascadeMenus('mfb'));
		const t = opampCount(designTransformed(narrow, 'butterworth'), transformedMenus('mfb', 'boctor'));
		const tt = opampCount(designTransformed(narrow, 'butterworth'), transformedMenus('towThomas', 'towThomas'));
		check(
			'op-amps: the narrow band-pass, Butterworth, is 7 as a cascade on MFB and 3 on MFB band-pass stages, so it is transformed; on Tow-Thomas stages (9) the cascade stays',
			c.opamps === 7 && c.stages === 7 && t.opamps === 3 && t.topologies.every((x) => x === 'mfbBp') && chooseBandMethod({ cascade: c, transformed: t }) === 'transformed' && tt.opamps === 9 && chooseBandMethod({ cascade: c, transformed: tt }) === 'cascade',
			`${c.opamps} against ${t.opamps}, ${tt.opamps} on Tow-Thomas`
		);
		const lc = opampCount(cascadeOf(BAND_SPECS.defaultBp, 'legendre'), cascadeMenus('mfb'));
		const lt = opampCount(designTransformed(BAND_SPECS.defaultBp, 'legendre'), transformedMenus('mfb', 'boctor'));
		check(
			'op-amps: a tie keeps the cascade (the default band-pass, Legendre on MFB: 4 and 4)',
			lc.opamps === 4 && lt.opamps === 4 && chooseBandMethod({ cascade: lc, transformed: lt }) === 'cascade',
			`${lc.opamps} against ${lt.opamps}`
		);
		const ec = opampCount(cascadeOf(narrow, 'elliptic'), cascadeMenus('mfb'));
		const et = opampCount(designTransformed(narrow, 'elliptic'), transformedMenus('mfb', 'boctor'));
		check(
			'op-amps: an elliptic cascade on MFB cannot be built (its notches need Tow-Thomas or Boctor), so the transformation is used; with neither buildable, the cascade',
			ec.opamps === Infinity && /a notch needs Tow-Thomas or Boctor/.test(ec.unavailable) && Number.isFinite(et.opamps) && chooseBandMethod({ cascade: ec, transformed: et }) === 'transformed' && chooseBandMethod({ cascade: null, transformed: null }) === 'cascade' && chooseBandMethod({ cascade: ec, transformed: { ...et, opamps: Infinity, unavailable: 'x' } }) === 'cascade',
			`${ec.unavailable}; transformed ${et.opamps} (${et.topologies.join(', ')})`
		);
	}

	// (e) Boctor sets its own gain. A transformed design keeps a Boctor notch
	// only when that gain lands within 1 dB of the stage's target (gain 1 at
	// f0 in a band-pass, at DC in a band-stop) with its zero on target; the
	// others go to Tow-Thomas (why 'level'). Kept on Boctor, the default
	// band-stop would pass DC 20 dB down; with the fallbacks it takes 10
	// op-amps and the summed branches (7) stay.
	{
		const spec = BAND_SPECS.defaultBs;
		const menus = transformedMenus('mfb', 'boctor');
		const d = designTransformed(spec, 'butterworth');
		const t = opampCount(d, menus);
		const why = d.stages.map((s) => plannedTopology(s, menus).why ?? '-');
		const c = opampCount(cascadeOf(spec, 'butterworth'), cascadeMenus('mfb'));
		const realized = realizeTransformed(d, menus);
		const level = [0, spec.fh * 1000].map((f) => magnitudePhaseAt(realized, f).db);
		check(
			'Boctor, default band-stop, Butterworth: stage 1 stays on Boctor, stage 2 leaves it for its Q limit and stages 3 and 4 for their level; 10 op-amps, so the summed branches (7) stay, and the transformation passes DC and far above the band within 1 dB of 0 dB',
			t.opamps === 10 && JSON.stringify(t.fallbacks) === '[2,3,4]' && why.join() === '-,limit,level,level' && c.opamps === 7 && chooseBandMethod({ cascade: c, transformed: t }) === 'cascade' && level.every((x) => Math.abs(x) < 1),
			`${t.topologies.join(', ')}; DC ${level[0].toFixed(2)} dB, far above ${level[1].toFixed(2)} dB`
		);
		let kept = 0;
		let leftForLevel = 0;
		const off = [];
		// the four specs, and wider bands with lower Q, where Boctor is kept more often
		const specs = Object.entries(BAND_SPECS);
		for (const [fl, fh] of [[100, 100000], [300, 30000], [2000, 8000]]) {
			for (const amaxDb of [1, 3]) {
				const f0 = Math.sqrt(fl * fh);
				const spread = (fh / fl) ** 0.25;
				specs.push([`wide ${fl}-${fh} Hz`, { filterType: 'bandstop', amaxDb, aminDb: 30, fl, fh, fsl: f0 / spread, fsh: f0 * spread }]);
				specs.push([`wide ${fl}-${fh} Hz`, { filterType: 'bandpass', amaxDb, aminDbLow: 30, aminDbHigh: 30, fl, fh, fsl: fl / 3, fsh: fh * 3 }]);
			}
		}
		for (const [key, s] of specs) {
			for (const response of RESPONSE_KEYS) {
				const dd = designTransformed(s, response);
				if (dd.orderInfo.n === null) continue;
				dd.stages.forEach((st, i) => {
					if (!Number.isFinite(st.wz)) return;
					const plan = plannedTopology(st, menus);
					const lowSide = notchOptions(st).boctorLowSide;
					const b = lowSide === null ? null : bandBoctorDesign(st.wn, st.q, st.wz, lowSide);
					if (!b) return;
					// the stage's own level where its design holds it, read from its
					// rounded parts, and its zero: within 0.5 % and at least 40 dB deep there
					const levelDb = st.gainAt === 'dc' ? 20 * Math.log10(Math.abs(b.actual.dcGain)) : magnitudePhaseAt([b], hz(st.w0)).db;
					const holds = Math.abs(levelDb) <= 1 && Math.abs(b.actual.wz / st.wz - 1) <= 0.005 && magnitudePhaseAt([b], hz(st.wz)).db <= levelDb - 40;
					const where = `${BAND_SPEC_NAMES[key] ?? key} ${s.filterType} ${response} stage ${i + 1} (${levelDb.toFixed(2)} dB)`;
					if (plan.topology === 'boctor' || plan.topology === 'boctorHp') {
						kept++;
						if (!holds) off.push(`${where} kept on Boctor`);
					} else if (plan.why === 'level') {
						leftForLevel++;
						if (holds) off.push(`${where} left Boctor although it holds`);
					}
				});
			}
		}
		check(
			`Boctor in a transformed design: every notch kept on Boctor (${kept}) lands within 1 dB of its target with its zero on target, every notch sent to Tow-Thomas for its level (${leftForLevel}) misses`,
			kept > 0 && leftForLevel > 0 && off.length === 0,
			off.slice(0, 3).join('; ')
		);
	}

	// (f) The transformation's explanations (explain.js, and the notch and
	// Boctor texts in a transformed context) render under strict KaTeX, with
	// no placeholder, no long dash, never "you", none of the words a
	// case-insensitive NaN check would trip on
	{
		const blocks = [];
		const designs = [];
		for (const spec of Object.values(BAND_SPECS)) for (const response of RESPONSE_KEYS) designs.push(designTransformed(spec, response));
		// an order set by hand, above and below the count
		designs.push(designTransformed(BAND_SPECS.narrowBp, 'butterworth', 5), designTransformed(BAND_SPECS.narrowBp, 'elliptic', 2));
		for (const d of designs.filter((x) => x.orderInfo.n !== null)) {
			const context = { method: 'transformed', filterType: d.filterType, w0: d.w0 };
			blocks.push(...explainApproximation(d.lowpass), ...explainBandTransform(d), ...explainTransformedOrder(d));
			d.stages.forEach((st, i) => {
				blocks.push(...explainTransformedStage(d, i));
				if (st.filterType === 'bandpass') {
					const mfb = designMfbBandPass(st.wn, st.q, { gain: st.gain });
					const tt = designTowThomasBandPass(st.wn, st.q, { gain: st.gain });
					if (mfb) blocks.push(...explainMfbBp(mfb, st.wn, st.q));
					if (tt) blocks.push(...explainTowThomasBp(tt, st.wn, st.q));
					return;
				}
				const how = notchOptions(st);
				blocks.push(...explainTowThomasNotch(designTowThomasNotch(st.wn, st.q, st.wz, how.towThomas), st.wn, st.q, st.wz, context));
				const b = how.boctorLowSide === null ? null : bandBoctorDesign(st.wn, st.q, st.wz, how.boctorLowSide);
				if (b) blocks.push(...explainBoctor(b, context));
			});
		}
		let texBad = 0;
		const wordBad = [];
		for (const b of blocks) {
			if (b.type === 'eq') {
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
				} catch (e) {
					texBad++;
					console.log('   KATEX', b.tex.slice(0, 90), e.message.slice(0, 80));
				}
			} else if (/undefined|NaN|Infinity/.test(b.text) || /[–—]|\byou(r)?\b|resonan|discriminant|dominant/i.test(b.text)) wordBad.push(b.text);
		}
		const eqs = blocks.filter((b) => b.type === 'eq').length;
		check(
			`transformation explanations: ${eqs} equations render under strict KaTeX, ${blocks.length - eqs} paragraphs in plain words`,
			eqs > 500 && texBad === 0 && wordBad.length === 0,
			wordBad.length ? wordBad[0].slice(0, 120) : `${texBad} TeX failures`
		);
	}

	// (g) The downloadable script with BAND_METHOD = "transformed" designs
	// the page's stages, says which method has fewer op-amps, finds its own
	// spec met with the stopband figure the page's stages give, and held to
	// order 2 reports the narrow band-pass short.
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-band-'));
		// the page's arguments: its sides on Tow-Thomas when the response has zeros, as the page insists
		const sideOf = (response) => (hasZeros(response) ? 'towThomas' : 'mfb');
		const args = (spec, response, topologyBand, topologyNotch, orderBand = null) => ({
			filterType: spec.filterType,
			response,
			responseHp: response,
			responseLp: response,
			topology: sideOf(response),
			topologyHp: sideOf(response),
			topologyLp: sideOf(response),
			amaxDb: spec.amaxDb,
			amaxDbHp: spec.amaxDb,
			amaxDbLp: spec.amaxDb,
			aminDb: spec.aminDb ?? spec.aminDbHigh,
			aminDbHp: spec.aminDbLow ?? spec.aminDb,
			aminDbLp: spec.aminDbHigh ?? spec.aminDb,
			fl: spec.fl,
			fh: spec.fh,
			fsl: spec.fsl,
			fsh: spec.fsh,
			fp: 10000,
			fs: 35000,
			order: null,
			orderHp: null,
			orderLp: null,
			capOverrides: {},
			bandMethod: 'transformed',
			topologyBand,
			topologyNotch,
			orderBand
		});
		const run = (name, opts) => {
			const file = join(dir, `${name}.js`);
			writeFileSync(file, generateScript(opts));
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return 'ERROR ' + String(e.stderr || e.message);
			}
		};
		/** The least attenuation across the stopband, from the passband top, of the stages the page builds. */
		const leastOf = (spec, realized) => {
			const g = (f) => magnitudePhaseAt(realized, f).db;
			const bp = spec.filterType === 'bandpass';
			const top = Math.max(...(bp ? [[spec.fl, spec.fh]] : [[spec.fl / 100, spec.fl], [spec.fh, spec.fh * 100]]).flatMap((r) => scan(r, 600)).map(g));
			const stops = bp ? [[[spec.fsl / 100, spec.fsl], spec.aminDbLow], [[spec.fsh, spec.fsh * 100], spec.aminDbHigh]] : [[[spec.fsl, spec.fsh], spec.aminDb]];
			let worst = { db: Infinity, margin: Infinity };
			for (const [band, amin] of stops) for (const f of scan(band, 600)) if (top - g(f) - amin < worst.margin) worst = { db: top - g(f), margin: top - g(f) - amin };
			return worst.db;
		};
		const cases = [
			['narrow-bp-butterworth-mfb', BAND_SPECS.narrowBp, 'butterworth', 'mfb', 'boctor'],
			['narrow-bp-elliptic-towthomas', BAND_SPECS.narrowBp, 'elliptic', 'towThomas', 'towThomas'],
			['default-bs-butterworth-boctor', BAND_SPECS.defaultBs, 'butterworth', 'mfb', 'boctor']
		];
		const problems = [];
		for (const [name, spec, response, band, notch] of cases) {
			const out = run(name, args(spec, response, band, notch));
			const verdict = /least attenuation in the stopband ([\d.]+) dB at \d+ Hz \(spec asks for >= [\d.]+ dB there\): OK$/.exec(out.trim());
			const design = designTransformed(spec, response);
			const page = leastOf(spec, realizeTransformed(design, transformedMenus(band, notch)));
			const choice = chooseBandMethod({ cascade: opampCount(cascadeOf(spec, response), cascadeMenus(sideOf(response))), transformed: opampCount(design, transformedMenus(band, notch)) });
			const fewest = choice === 'transformed' ? 'the transformation' : spec.filterType === 'bandpass' ? 'the cascade' : 'the summed branches';
			if (!verdict) problems.push(`${name}: ${out.trim().split('\n').pop()}`);
			else if (Math.abs(Number(verdict[1]) - page) > 0.051) problems.push(`${name}: ${verdict[1]} dB, the page's stages ${page.toFixed(2)} dB`);
			if (!out.includes(`fewest op-amps: ${fewest}`) || !(spec.filterType === 'bandpass' ? /gain at f0 \([\d.]+ Hz\): -?[\d.]+ dB/ : /gain at DC: -?[\d.]+ dB/).test(out)) problems.push(`${name}: no method or level line`);
		}
		const short = run('narrow-bp-order-2', args(BAND_SPECS.narrowBp, 'butterworth', 'mfb', 'boctor', 2));
		if (!/least attenuation in the stopband .*\(spec asks for >= 50 dB there\): NOT MET$/.test(short.trim())) problems.push(`order 2: ${short.trim().split('\n').pop()}`);
		check(
			'downloadable script, transformed: the narrow band-pass (Butterworth on MFB, elliptic on Tow-Thomas) and the default band-stop (Boctor notches) end with their spec met, as the page computes it; order 2 is reported short',
			problems.length === 0,
			problems.slice(0, 2).join('; ')
		);
	}

	// (h) The transformation's stage designers (the MFB and Tow-Thomas
	// band-pass, the Tow-Thomas notch held at a gain), automatic and from
	// capacitors chosen by hand, over a spread of f0, Q and gain on four
	// stocks: the actual figures are the formulas on the rounded parts, and
	// each stock's designs are pinned like BEFORE above. A deliberate change
	// to one of these designers moves them: rerun and update them.
	{
		// taken when the designers were added
		const BAND_DESIGNERS_BEFORE = { E24: 'e28208ab907b25e5', E96: '24d8db6a9d190f54', lab: '77d6db58ff1afafe', labPairs: 'b830612b115fe43e' };
		const stocks = { E24: PAIR_STOCKS.E24, E96: PAIR_STOCKS.E96, lab: PAIR_STOCKS.lab, labPairs: { ...PAIR_STOCKS.lab, pairs: true } };
		const sweepBand = (opts) => {
			const rows = [];
			for (const f0 of [50, 1000, 10000, 49000, 200000]) {
				const wn = 2 * Math.PI * f0;
				for (const q of [0.35, 0.7071, 2, 5, 10, 20]) {
					for (const gain of [0.4, 1, 2.03]) {
						const at = `${f0} Hz Q ${q} gain ${gain}`;
						const o = { ...opts, gain };
						const mfb = designMfbBandPass(wn, q, o);
						rows.push([`mfbBp ${at}`, mfb]);
						if (mfb) rows.push([`mfbBp by hand ${at}`, designMfbBandPassFromCaps(wn, q, mfb.components.C1 * 2.2, mfb.components.C2, o)]);
						const tt = designTowThomasBandPass(wn, q, o);
						rows.push([`towThomasBp ${at}`, tt]);
						if (tt) rows.push([`towThomasBp by hand ${at}`, designTowThomasBandPassFromCap(wn, q, tt.components.C1 * 2.2, o)]);
						for (const ratio of [1.6, 1 / 1.7]) {
							const notch = designTowThomasNotch(wn, q, wn * ratio, o);
							rows.push([`notch at a gain ${ratio.toFixed(3)} ${at}`, notch]);
							if (notch) rows.push([`notch at a gain by hand ${ratio.toFixed(3)} ${at}`, designTowThomasNotchFromCap(wn, q, wn * ratio, notch.components.C1 * 2.2, o)]);
						}
					}
				}
			}
			return rows;
		};
		const rel = (a, b) => Math.abs(a / b - 1) < 1e-9;
		for (const [name, opts] of Object.entries(stocks)) {
			const rows = sweepBand(opts);
			const built = rows.filter(([, d]) => d && d.components && d.ok !== false);
			const wrong = built.filter(([, d]) => {
				const c = d.components;
				const a = d.actual;
				if (d.topology === 'mfbBp') {
					const f = mfbBandPassActual(c);
					return !(rel(f.wn, a.wn) && rel(f.q, a.q) && rel(f.gain, a.gain) && a.gain < 0);
				}
				const wn = 1 / Math.sqrt(c.C1 * c.C2 * c.Ra * c.Rb);
				const q = c.Rd * Math.sqrt(c.C1 / (c.C2 * c.Ra * c.Rb));
				if (d.topology === 'towThomasBp') return !(rel(wn, a.wn) && rel(q, a.q) && rel(-c.Rd / c.R1, a.gain));
				return !(d.topology === 'towThomasNotch' && rel(wn, a.wn) && rel(q, a.q) && rel(1 / Math.sqrt(c.Cin * c.C2 * c.Ra * c.Rz), a.wz) && rel(-c.Cin / c.C1, a.gain) && rel(-c.Rb / c.Rz, a.dcGain));
			});
			const print = fingerprint(rows);
			check(
				`band-pass designers and the notch at a gain, ${name}: ${built.length} of ${rows.length} designs built, actual figures equal the formulas on the rounded parts, all as pinned`,
				wrong.length === 0 && print === BAND_DESIGNERS_BEFORE[name],
				wrong.length ? `${wrong[0][0]}: ${JSON.stringify(wrong[0][1].actual)}` : `${print}, expected ${BAND_DESIGNERS_BEFORE[name]}`
			);
		}
	}
}

/* ------------------------- 10. MFB band-pass stages built for their op-amp */
// With a single-pole op-amp, A(s) = 2 pi GBW / s, an MFB band-pass stage
// keeps its peak gain but its f0 falls and its Q rises. Given a GBW, the
// designers build the circuit at a higher f0 and a lower Q so that the
// stage with that op-amp lands on its target (mfbBandPass.js), and bode.js
// evaluates such a stage exactly with its op-amp.
{
	const TWO_PI = 2 * Math.PI;
	const near = (a, b, tol) => Math.abs(a / b - 1) <= tol;
	const scan = ([a, b], count = 600) => Array.from({ length: count + 1 }, (_, i) => a * (b / a) ** (i / count));
	const GBWS = { TL082: OPAMP_GBW.TL082, LM741: OPAMP_GBW.LM741 };
	// complex helpers and an independent nodal solve: unknowns V_A, V_M, V_out
	const C = (re, im = 0) => ({ re, im });
	const cAdd = (a, b) => C(a.re + b.re, a.im + b.im);
	const cSub = (a, b) => C(a.re - b.re, a.im - b.im);
	const cMul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
	const cDiv = (a, b) => {
		const d = b.re * b.re + b.im * b.im;
		return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
	};
	const cAbs = (a) => Math.hypot(a.re, a.im);
	/** The nodal matrix at a complex s: KCL at A and at M, and the op-amp, s V_out + omega_t V_M = 0 (V_M = 0 for an ideal one). */
	const nodalMatrix = ({ R1, R2, R3, C1, C2 }, s, gbw) => {
		const y1 = cMul(s, C(C1));
		const y2 = cMul(s, C(C2));
		const neg = (a) => C(-a.re, -a.im);
		return [
			[cAdd(C(1 / R1 + 1 / R2), cAdd(y1, y2)), neg(y2), neg(y1)],
			[neg(y2), cAdd(y2, C(1 / R3)), C(-1 / R3)],
			gbw ? [C(0), C(TWO_PI * gbw), s] : [C(0), C(1), C(0)]
		];
	};
	const solve3 = (M, v) => {
		M = M.map((r) => r.slice());
		v = v.slice();
		let det = C(1);
		for (let i = 0; i < 3; i++) {
			let piv = i;
			for (let r = i + 1; r < 3; r++) if (cAbs(M[r][i]) > cAbs(M[piv][i])) piv = r;
			if (piv !== i) {
				[M[i], M[piv]] = [M[piv], M[i]];
				[v[i], v[piv]] = [v[piv], v[i]];
				det = C(-det.re, -det.im);
			}
			det = cMul(det, M[i][i]);
			for (let r = i + 1; r < 3; r++) {
				const f = cDiv(M[r][i], M[i][i]);
				for (let c = i; c < 3; c++) M[r][c] = cSub(M[r][c], cMul(f, M[i][c]));
				v[r] = cSub(v[r], cMul(f, v[i]));
			}
		}
		const x = [C(0), C(0), C(0)];
		for (let i = 2; i >= 0; i--) {
			let s = v[i];
			for (let c = i + 1; c < 3; c++) s = cSub(s, cMul(M[i][c], x[c]));
			x[i] = cDiv(s, M[i][i]);
		}
		return { x, det };
	};
	const nodalH = (parts, f, gbw) => solve3(nodalMatrix(parts, C(0, TWO_PI * f), gbw), [C(1 / parts.R1), C(0), C(0)]).x[2];
	const nodalDet = (parts, s, gbw) => solve3(nodalMatrix(parts, s, gbw), [C(0), C(0), C(0)]).det;
	const missOf = (a, wn, q, gain, f0Weight = 1) => Math.max(f0Weight * Math.abs(Math.log(a.wn / wn)), Math.abs(Math.log(a.q / q)), Math.abs(Math.log(-a.gain / gain)));

	// (a) The exact response against the independent nodal solve, with an
	// ideal op-amp (today's transfer function) and with single-pole ones
	{
		const parts = [
			{ R1: 12000, R2: 330, R3: 75000, C1: 1e-9, C2: 1e-9 },
			{ R1: 4700, R2: 1500, R3: 220000, C1: 2.2e-9, C2: 1e-9 },
			{ R1: 100000, R2: Infinity, R3: 200000, C1: 1e-10, C2: 4.7e-10 }
		];
		let worst = 0;
		let worstIdeal = 0;
		for (const p of parts) {
			for (const f of [10, 1000, 10000, 30000, 50000, 100000, 1e6]) {
				for (const gbw of [null, 1e6, GBWS.TL082, 1e9]) {
					const a = mfbBandPassResponse(p, f, gbw);
					const b = nodalH(p, f, gbw);
					worst = Math.max(worst, cAbs(cSub(a, b)) / cAbs(b));
				}
				// with an ideal op-amp: -(s/(R1 C1)) / (s^2 + s omega0/Q + omega0^2) from mfbBandPassActual
				const act = mfbBandPassActual(p);
				const w = TWO_PI * f;
				const h = cDiv(C(0, -w / (p.R1 * p.C1)), C(act.wn * act.wn - w * w, (act.wn / act.q) * w));
				worstIdeal = Math.max(worstIdeal, cAbs(cSub(mfbBandPassResponse(p, f), h)) / cAbs(h));
			}
		}
		check('MFB band-pass with a single-pole op-amp: the exact response equals an independent nodal solve, and the ideal op-amp gives the transfer function as before', worst < 1e-12 && worstIdeal < 1e-12, `worst ${worst.toExponential(1)}, ideal ${worstIdeal.toExponential(1)}`);
	}

	// (b) Built for an op-amp, over a grid on E24 and E96: actual is the
	// stage with that op-amp (its pole pair a root of the nodal
	// determinant, its gain the nodal |H| there), ideal the circuit alone,
	// the loop gain at least 2, and the circuit-alone targets land exactly
	// on the target with unrounded parts. What it lands is set against the
	// plain designer on its own ideal targets, on the same stages, where it
	// moves the band: the miss with the f0 miss counted max(1, 2Q) times
	// (the search's own score), and the gain across the stage's own -3 dB
	// band against its target. No further off on average nor at worst. The
	// plain miss, f0 counted once, is shown: the search trades a little of
	// it for f0. A stage left a loop gain under 2 comes back null.
	{
		const grid = [];
		for (const f0 of [200, 1000, 5000, 10000, 20000, 49000, 100000]) for (const q of [0.35, 0.7071, 2, 5, 10]) for (const gain of [0.4, 1, 2.03]) grid.push([TWO_PI * f0, q, gain]);
		const stats = (list) => {
			const s = [...list].sort((a, b) => a - b);
			return { mean: s.reduce((a, b) => a + b, 0) / s.length, p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))], max: s[s.length - 1] };
		};
		const pc = (x) => `${(100 * x).toFixed(2)}%`;
		// the most the stage's gain strays from its target across its own -3 dB band, in dB
		const bandDb = (stage, wn, q, gain) => {
			const target = { order: 2, topology: 'xBp', actual: { wn, q, gain: -gain } };
			const half = Math.sqrt(1 + 1 / (4 * q * q));
			const f0 = wn / TWO_PI;
			return Math.max(...scan([f0 * (half - 1 / (2 * q)), f0 * (half + 1 / (2 * q))], 100).map((f) => Math.abs(magnitudePhaseAt([stage], f).db - magnitudePhaseAt([target], f).db)));
		};
		for (const [part, gbw] of Object.entries(GBWS)) {
			for (const resistorSeries of ['E24', 'E96']) {
				const wrong = [];
				const plain = { miss: [], weighted: [], band: [] };
				const corrected = { miss: [], weighted: [], band: [] };
				let skipped = 0;
				for (const [wn, q, gain] of grid) {
					const p = designMfbBandPass(wn, q, { gain, resistorSeries });
					const d = designMfbBandPass(wn, q, { gain, resistorSeries, gbw });
					if (!d) {
						skipped++;
						continue;
					}
					const at = `${(wn / TWO_PI).toFixed(0)} Hz Q ${q} gain ${gain}`;
					const eff = mfbBandPassEffective(d.components, gbw);
					const a = d.actual;
					const re = -a.wn / (2 * a.q);
					const root = a.q > 0.5 ? C(re, a.wn * Math.sqrt(1 - 1 / (4 * a.q * a.q))) : C(re + a.wn * Math.sqrt(1 / (4 * a.q * a.q) - 1));
					const zero = cAbs(nodalDet(d.components, root, gbw)) / cAbs(nodalDet(d.components, cMul(root, C(1 + 1e-6)), gbw));
					const atPeak = cAbs(nodalH(d.components, a.wn / TWO_PI, gbw));
					const pre = d.steps.predistorted;
					const unrounded = mfbBandPassEffective(d.theoretical, gbw);
					const ok =
						a.gbw === gbw &&
						near(a.wn, eff.wn, 1e-12) &&
						near(a.q, eff.q, 1e-12) &&
						near(a.gain, eff.gain, 1e-12) &&
						a.gain < 0 &&
						zero < 1e-3 &&
						near(atPeak, -a.gain, 1e-9) &&
						JSON.stringify(d.ideal) === JSON.stringify(mfbBandPassActual(d.components)) &&
						d.steps.loopGain >= 2 &&
						near(d.steps.loopGain, gbw / ((1 + pre.q * pre.q * (1 + d.components.C2 / d.components.C1)) * (pre.wn / TWO_PI)), 1e-12) &&
						near(d.steps.k, (q * (1 + d.components.C2 / d.components.C1) * wn) / (TWO_PI * gbw), 1e-12) &&
						pre.wn > wn &&
						pre.q < q &&
						missOf(unrounded, wn, q, gain) < 1e-9;
					if (!ok) wrong.push(at);
					if (p) {
						const w = Math.max(1, 2 * q);
						plain.miss.push(missOf(p.actual, wn, q, gain));
						corrected.miss.push(missOf(a, wn, q, gain));
						plain.weighted.push(missOf(p.actual, wn, q, gain, w));
						corrected.weighted.push(missOf(a, wn, q, gain, w));
						plain.band.push(bandDb(p, wn, q, gain));
						corrected.band.push(bandDb(d, wn, q, gain));
					}
				}
				const [pm, cm, pw, cw, pb, cb] = [plain.miss, corrected.miss, plain.weighted, corrected.weighted, plain.band, corrected.band].map(stats);
				const db = (x) => `${x.toFixed(2)} dB`;
				check(
					`built for the ${part} (${gbw / 1e6} MHz), ${resistorSeries}: ${grid.length - skipped} of ${grid.length} stages built (the rest under a loop gain of 2), each the exact nodal model of its rounded parts with that op-amp, landing where it moves the band at least as close as the plain designer does on its own ideal targets, on average and at worst`,
					wrong.length === 0 && cw.mean <= pw.mean && cw.max <= pw.max && cb.mean <= pb.mean && cb.max <= pb.max,
					`${wrong.length ? `wrong at ${wrong[0]}; ` : ''}f0 miss counted 2Q times, with the op-amp: mean ${pc(cw.mean)}, max ${pc(cw.max)}, plain: mean ${pc(pw.mean)}, max ${pc(pw.max)}; across the stage's band, with the op-amp: mean ${db(cb.mean)}, max ${db(cb.max)}, plain: mean ${db(pb.mean)}, max ${db(pb.max)}; f0 counted once, with the op-amp: mean ${pc(cm.mean)}, max ${pc(cm.max)}, plain: mean ${pc(pm.mean)}, max ${pc(pm.max)}`
				);
			}
		}
	}

	// (c) Without a GBW nothing moves: null and Infinity are the plain
	// designer, key for key (BAND_DESIGNERS_BEFORE pins it)
	{
		let same = 0;
		let total = 0;
		for (const f0 of [1000, 49000]) {
			for (const q of [0.7071, 5]) {
				const wn = TWO_PI * f0;
				const plain = designMfbBandPass(wn, q, { gain: 1 });
				const manual = designMfbBandPassFromCaps(wn, q, 1e-9, 1e-9, { gain: 1 });
				for (const gbw of [null, Infinity, undefined]) {
					total += 2;
					if (JSON.stringify(designMfbBandPass(wn, q, { gain: 1, gbw })) === JSON.stringify(plain)) same++;
					if (JSON.stringify(designMfbBandPassFromCaps(wn, q, 1e-9, 1e-9, { gain: 1, gbw })) === JSON.stringify(manual)) same++;
				}
			}
		}
		check('no GBW (null, Infinity or left out): the MFB band-pass designers give exactly the plain designs', same === total, `${same} of ${total}`);
	}

	// (d) The capacitors of an automatic design entered by hand give the
	// same stage; a pair that leaves too little loop gain, or a gain past
	// the circuit's ceiling, says why
	{
		const problems = [];
		const ref = designTransformed(BAND_SPECS.narrowBp, 'butterworth');
		for (const s of ref.stages) {
			const auto = designMfbBandPass(s.wn, s.q, { gain: s.gain, gbw: GBWS.TL082 });
			const manual = designMfbBandPassFromCaps(s.wn, s.q, auto.components.C1, auto.components.C2, { gain: s.gain, gbw: GBWS.TL082 });
			if (!manual.ok || JSON.stringify(manual.components) !== JSON.stringify(auto.components) || JSON.stringify(manual.actual) !== JSON.stringify(auto.actual)) problems.push(`stage ${s.role}: by hand differs`);
		}
		const lower = ref.stages[0];
		const loop = designMfbBandPassFromCaps(lower.wn, lower.q, 1e-9, 1e-9, { gain: lower.gain, gbw: GBWS.TL082 });
		if (loop.ok !== false || loop.why !== 'loop' || !(loop.loopGain < 2)) problems.push(`equal capacitors: ${JSON.stringify({ ok: loop.ok, why: loop.why, loopGain: loop.loopGain })}`);
		const ceiling = designMfbBandPassFromCaps(TWO_PI * 1000, 0.5, 1e-8, 1e-9, { gain: 1, gbw: GBWS.TL082 });
		if (ceiling.ok !== false || ceiling.why !== 'gain' || !(ceiling.predistorted.gain >= ceiling.maxGain)) problems.push(`gain ceiling: ${JSON.stringify({ ok: ceiling.ok, why: ceiling.why })}`);
		check('built for an op-amp by hand: the automatic capacitors give the same stage, too little loop gain or a gain past the ceiling is refused with its reason', problems.length === 0, problems.join('; '));
	}

	// (d2) Where no circuit can land: an op-amp too slow for any capacitor
	// pair (low Q, GBW only 3 times f0) is refused as 'opamp', and the
	// designer returns null. A short list of values whose resistors only
	// clamp to its end builds nothing (the plain designer, with more pairs,
	// builds the stage within a few %), so the stage falls back to the full
	// grid, flagged, as the page does.
	{
		const problems = [];
		const slowWn = TWO_PI * 10000;
		const slow = designMfbBandPassFromCaps(slowWn, 0.15, 1e-9, 4.7e-9, { gain: 0.1, gbw: 30000 });
		if (slow.ok !== false || slow.why !== 'opamp' || slow.predistorted !== null) problems.push(`slow op-amp: ${JSON.stringify({ ok: slow.ok, why: slow.why })}`);
		if (designMfbBandPass(slowWn, 0.15, { gain: 0.1, gbw: 30000 }) !== null) problems.push('slow op-amp: the designer builds a stage');
		const ref = designTransformed(BAND_SPECS.narrowBp, 'butterworth');
		const upper = ref.stages[1];
		const shortList = [1000, 1200, 1500, 1800, 2200, 2700, 3300, 3900, 4700, 5600, 6800, 8200, 10000, 12000, 15000, 18000, 22000, 27000, 33000, 39000, 47000, 56000, 68000, 82000, 100000, 120000, 150000, 180000, 220000, 270000, 330000];
		const fewCaps = [1e-10, 2.2e-10, 4.7e-10, 1e-9, 2.2e-9, 4.7e-9];
		for (const pairs of [false, true]) {
			const stock = { gain: upper.gain, resistorSeries: shortList, capacitors: fewCaps, pairs };
			const plain = designMfbBandPass(upper.wn, upper.q, stock);
			if (!plain || Math.abs(plain.actual.wn / upper.wn - 1) > 0.05) problems.push(`short list${pairs ? ', pairs' : ''}: the plain designer misses`);
			if (designMfbBandPass(upper.wn, upper.q, { ...stock, gbw: GBWS.TL082 }) !== null) problems.push(`short list${pairs ? ', pairs' : ''}: a clamped stage is built`);
			const byHand = designMfbBandPassFromCaps(upper.wn, upper.q, 1e-9, 1e-10, { ...stock, gbw: GBWS.TL082 });
			if (byHand.ok !== false || byHand.why !== 'parts') problems.push(`short list${pairs ? ', pairs' : ''}, by hand: ${JSON.stringify({ ok: byHand.ok, why: byHand.why })}`);
		}
		const realized = realizeTransformed(ref, { ...transformedMenus('mfb', 'boctor'), gbw: GBWS.TL082 }, { resistorSeries: shortList, capacitors: fewCaps });
		const fell = realized[1];
		if (!fell?.stockShortfall || Math.abs(fell.actual.wn / upper.wn - 1) > 0.05) problems.push(`short list on the page's path: ${fell ? `f0 ${(100 * (fell.actual.wn / upper.wn - 1)).toFixed(2)}%, flagged ${!!fell.stockShortfall}` : 'nothing built'}`);
		check("built for an op-amp, where nothing lands: an op-amp too slow for any pair is refused as 'opamp', and a short list whose resistors only clamp to its end builds no stage, which then takes the full grid, flagged", problems.length === 0, problems.join('; '));
	}

	// (e) The narrow band-pass of the transformation, its MFB band-pass
	// stages built for the TL082: under bode (each stage with its op-amp)
	// fl and fh lose Amax within the E24 rounding, 0.5 dB either way, and
	// both stopband edges hold. The plain stages with the same op-amp miss
	// fh by several dB.
	{
		const spec = BAND_SPECS.narrowBp;
		const d = designTransformed(spec, 'butterworth');
		const built = d.stages.map((s) => designMfbBandPass(s.wn, s.q, { gain: s.gain, gbw: GBWS.TL082 }));
		const plain = d.stages.map((s) => designMfbBandPass(s.wn, s.q, { gain: s.gain }));
		const withOpamp = plain.map((s) => ({ ...s, actual: { ...s.actual, gbw: GBWS.TL082 } }));
		const losses = (stages) => {
			const g = (f) => magnitudePhaseAt(stages, f).db;
			const top = Math.max(...scan([spec.fl, spec.fh], 600).map(g));
			return { fl: top - g(spec.fl), fh: top - g(spec.fh), fsl: top - g(spec.fsl), fsh: top - g(spec.fsh) };
		};
		const c = losses(built);
		const p = losses(plain);
		const w = losses(withOpamp);
		const text = (l) => `fl ${l.fl.toFixed(2)}, fh ${l.fh.toFixed(2)}, fsl ${l.fsl.toFixed(1)}, fsh ${l.fsh.toFixed(1)} dB`;
		check(
			'narrow band-pass, MFB stages built for the TL082: Amax within 0.5 dB at fl and fh with the op-amp, Amin met; the plain stages with the same op-amp miss fh by several dB',
			built.every(Boolean) &&
				Math.abs(c.fl - spec.amaxDb) <= 0.5 &&
				Math.abs(c.fh - spec.amaxDb) <= 0.5 &&
				c.fsl >= spec.aminDbLow &&
				c.fsh >= spec.aminDbHigh &&
				w.fh > spec.amaxDb + 3,
			`built for it: ${text(c)}; plain, ideal op-amp: ${text(p)}; plain with the TL082: ${text(w)}`
		);
	}

	// (f) The op-amp count knows the op-amp: a stage the correction cannot
	// reach is unavailable for the transformation, and the cheap test agrees
	// with the designer over the grid
	{
		const ref = designTransformed(BAND_SPECS.narrowBp, 'butterworth');
		const tl = opampCount(ref, { ...transformedMenus('mfb', 'boctor'), gbw: GBWS.TL082 });
		const lm = opampCount(ref, { ...transformedMenus('mfb', 'boctor'), gbw: GBWS.LM741 });
		const plainCount = opampCount(ref, transformedMenus('mfb', 'boctor'));
		let disagree = 0;
		let total = 0;
		for (const f0 of [1000, 10000, 49000, 100000, 200000]) {
			for (const q of [0.5, 1, 2, 5, 10]) {
				for (const gain of [1, 2.03]) {
					for (const gbw of Object.values(GBWS)) {
						total++;
						if (mfbBandPassFeasible(TWO_PI * f0, q, gain, gbw) !== (designMfbBandPass(TWO_PI * f0, q, { gain, gbw }) !== null)) disagree++;
					}
				}
			}
		}
		check(
			'op-amp count with the correction: the narrow band-pass takes 3 op-amps built for the TL082, none can be built for the LM741 (loop gain), and the cheap feasibility test agrees with the designer',
			tl.opamps === 3 && plainCount.opamps === 3 && lm.opamps === Infinity && /loop gain under 2/.test(lm.unavailable) && disagree === 0,
			`TL082 ${tl.opamps}, LM741 ${lm.unavailable}; ${disagree} of ${total} disagree`
		);
	}

	// (g) The explanation of a stage built for its op-amp renders under
	// strict KaTeX, in plain words
	{
		const blocks = [];
		for (const spec of [BAND_SPECS.narrowBp, BAND_SPECS.defaultBp]) {
			for (const response of ['butterworth', 'chebyshev', 'bessel']) {
				const d = designTransformed(spec, response);
				for (const s of d.stages) {
					for (const gbw of Object.values(GBWS)) {
						const st = designMfbBandPass(s.wn, s.q, { gain: s.gain, gbw });
						if (st) blocks.push(...explainMfbBp(st, s.wn, s.q));
						const manual = st && designMfbBandPassFromCaps(s.wn, s.q, st.components.C1, st.components.C2, { gain: s.gain, gbw });
						if (manual?.ok) blocks.push(...explainMfbBp(manual, s.wn, s.q));
					}
				}
			}
		}
		let texBad = 0;
		const wordBad = blocks.filter((b) => b.type !== 'eq' && (/undefined|NaN|Infinity/.test(b.text) || /[–—]|\byou(r)?\b|resonan|discriminant|dominant/i.test(b.text)));
		for (const b of blocks.filter((x) => x.type === 'eq')) {
			try {
				katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
			} catch {
				texBad++;
			}
		}
		const opampText = blocks.some((b) => b.type !== 'eq' && /built for a real op-amp/.test(b.text));
		check('explanations of stages built for their op-amp: strict KaTeX, plain words, the op-amp paragraph present', blocks.length > 100 && texBad === 0 && wordBad.length === 0 && opampText, wordBad.length ? wordBad[0].text.slice(0, 120) : `${blocks.length} blocks, ${texBad} TeX failures`);
	}

	// (h) The downloaded script. Without an op-amp it is exactly what it
	// was: what codegen.js writes around the engine (everything but the
	// inlined library sources) is pinned over 1152 scripts, taken from the
	// code before the option existed. With OPAMP_GBW a transformed
	// band-pass builds its MFB stages for that op-amp, prints them with it
	// and alone, and judges the response with it, as the page does.
	{
		const template = (code) => code.slice(0, code.indexOf('// ===================================================================== \n// ENGINE')) + code.slice(code.indexOf('// =====================================================================\n// REPORT'));
		const base = { amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null };
		const texts = [];
		for (const filterType of ['lowpass', 'highpass', 'bandpass', 'bandstop']) {
			for (const response of RESPONSE_KEYS) {
				for (const topology of ['mfb', 'sallenKey', 'towThomas', 'boctor']) {
					for (const bandMethod of [undefined, 'cascade', 'transformed']) {
						for (const stock of [{}, { resistorStock: [1000, 2200, 4700, 10000], capacitorStock: [1e-9, 1e-8], resistorPairs: true }]) {
							for (const capOverrides of [{}, { 0: { C1: 1e-9, C2: 2.2e-9 }, 1: { C: 1e-8 } }]) {
								const wiring = { topologyBand: topology === 'towThomas' ? 'towThomas' : 'mfb', topologyNotch: topology === 'towThomas' ? 'towThomas' : 'boctor', orderBand: bandMethod === 'transformed' ? 4 : null };
								texts.push(template(generateScript({ ...base, filterType, response, topology, bandMethod, ...wiring, ...stock, capOverrides })));
							}
						}
					}
				}
			}
		}
		// taken from codegen.js before OPAMP_GBW existed, then moved once on
		// purpose: the next-steps note now gives the Tow-Thomas Q law,
		// Q / (1 - 4 Q f0 / f_T), and 400 Q f0 instead of "a few hundred"
		const SCRIPTS_BEFORE = 'ba48a189d84c14de';
		const print = createHash('sha256').update(texts.join('\n')).digest('hex').slice(0, 16);
		check(`downloadable script without an op-amp: all ${texts.length} scripts exactly as before around the engine`, print === SCRIPTS_BEFORE && !texts.some((t) => /OPAMP_GBW/.test(t)), `${print}, expected ${SCRIPTS_BEFORE}`);

		const dir = mkdtempSync(join(tmpdir(), 'rbt56-gbw-'));
		const spec = BAND_SPECS.narrowBp;
		const args = { ...base, filterType: 'bandpass', response: 'butterworth', responseHp: 'butterworth', responseLp: 'butterworth', topology: 'mfb', amaxDbHp: spec.amaxDb, amaxDbLp: spec.amaxDb, aminDbHp: spec.aminDbLow, aminDbLp: spec.aminDbHigh, fl: spec.fl, fh: spec.fh, fsl: spec.fsl, fsh: spec.fsh, capOverrides: {}, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor' };
		const run = (name, code) => {
			const file = join(dir, `${name}.js`);
			writeFileSync(file, code);
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return `${e.stdout ?? ''}ERROR ${e.stderr || e.message}`;
			}
		};
		const d = designTransformed(spec, 'butterworth');
		const built = d.stages.map((s) => designMfbBandPass(s.wn, s.q, { gain: s.gain, gbw: GBWS.TL082 }));
		const problems = [];
		const code = generateScript({ ...args, opampGbw: GBWS.TL082 });
		const out = run('narrow-tl082', code);
		for (const f of [spec.fsl, spec.fl, spec.fh, spec.fsh]) {
			const line = new RegExp(`^\\s*${f} Hz :\\s+(-?[\\d.]+) dB$`, 'm').exec(out);
			if (!line || Math.abs(Number(line[1]) - magnitudePhaseAt(built, f).db) > 0.006) problems.push(`${f} Hz: ${line?.[1]} dB, the page's ${magnitudePhaseAt(built, f).db.toFixed(2)} dB`);
		}
		if ((out.match(/with the op-amp \(single pole, GBW = 3\.45 MHz\)/g) ?? []).length !== 3 || (out.match(/the circuit alone \(ideal op-amp\)/g) ?? []).length !== 3) problems.push('stages not printed with the op-amp and alone');
		if (!/^const OPAMP_GBW = 3450000;$/m.test(code)) problems.push('no OPAMP_GBW parameter');
		// the closing steps say the corrected stages' numbers include the op-amp; with null they stay as they were
		const steps = (text) => text.slice(text.indexOf('// NEXT STEPS')).replace(/\n\/\/\s+/g, ' ');
		if (!/stages are built for a single-pole op-amp of 3\.45 MHz, so their numbers above include it/.test(steps(code))) problems.push('next steps do not name the op-amp');
		if (!/least attenuation in the stopband .*: OK$/.test(out.trim())) problems.push(`verdict: ${out.trim().split('\n').pop()}`);
		const slow = run('narrow-lm741', generateScript({ ...args, opampGbw: GBWS.LM741 }));
		if (!/fewest op-amps: the cascade/.test(slow) || !/loop gain under 2/.test(slow) || !/a faster op-amp in OPAMP_GBW/.test(slow)) problems.push(`LM741: ${slow.trim().split('\n').pop().slice(0, 120)}`);
		const noneCode = generateScript({ ...args, opampGbw: null });
		if (!/Every number above comes from an ideal op-amp/.test(steps(noneCode))) problems.push('OPAMP_GBW = null changes the next steps');
		const none = run('narrow-none', noneCode);
		if (!/^\s*actual f0 = /m.test(none) || /with the op-amp/.test(none) || !/: OK$/.test(none.trim())) problems.push('OPAMP_GBW = null does not give the plain stages');
		check('downloadable script with OPAMP_GBW: the narrow band-pass built for the TL082 gives the page\'s response and meets its spec; the LM741 cannot be built (loop gain); null builds the plain stages', problems.length === 0, problems.slice(0, 2).join('; '));
	}
}

/* ------------------------------------------------ 11. a limit on the pairs */
// The stock picker's "Up to N pairs" (pairPlan.js). Every designer takes,
// besides true and false, a list of the names allowed to pair; the plan
// starts from the design with pairs where they help and, when that holds
// more than N resistors built as two in series, keeps the ones that bring
// the whole filter closest to its targets (the squared stage misses,
// summed), every other resistor a single part.
{
	const kit = LAB_KIT.resistors;
	const LIMIT_GBW = OPAMP_GBW.TL082;
	const ALL_NAMES = ['R', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'Ra', 'Rd', 'Rz', 'Rtop', 'Rbottom'];
	const rel = (a, b) => Math.abs(a / b - 1) < 1e-9;
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	const resistors = (d) => Object.entries(d?.components ?? {}).filter(([n]) => /^R/.test(n));

	// the designers of the transformation and Boctor, over a small grid; section 8's sweep covers the rest
	const sweepOthers = (opts) => {
		const rows = [];
		for (const f0 of [480, 10000, 49000]) {
			const wn = 2 * Math.PI * f0;
			for (const q of [0.7071, 2, 5]) {
				const at = `${f0} Hz Q ${q}`;
				for (const gbw of [null, LIMIT_GBW]) rows.push([`mfbBp ${gbw} ${at}`, designMfbBandPass(wn, q, { ...opts, gain: 2.03, gbw })]);
				rows.push([`towThomasBp ${at}`, designTowThomasBandPass(wn, q, { ...opts, gain: 0.4 })]);
				rows.push([`notch at a gain ${at}`, designTowThomasNotch(wn, q, wn * 1.6, { ...opts, gain: 1.3 })]);
				rows.push([`boctor ${at}`, designBoctorNotch(wn, q, wn * 2, { ...opts, lowSide: true })]);
				if (q < 1) rows.push([`boctorHp ${at}`, designBoctorNotch(wn, q, wn / 2, { ...opts, lowSide: false })]);
			}
		}
		return rows;
	};

	// (a) with true or false nothing moved (section 8 and the band pins above
	// still hold), and a list naming every resistor is true, an empty one false
	{
		const lab = PAIR_STOCKS.lab;
		const both = (pairs) => fingerprint([...sweepDesigns({ ...lab, pairs }), ...sweepOthers({ ...lab, pairs })]);
		const on = both(true);
		const off = both(false);
		const lists = [both(ALL_NAMES), both(new Set(ALL_NAMES)), both([]), both(new Set())];
		check(
			'pair limit: every designer takes a list of names to pair; naming every resistor gives the design of true, an empty list that of false',
			lists[0] === on && lists[1] === on && lists[2] === off && lists[3] === off && on !== off,
			`${on} / ${off}`
		);
	}

	// (b) a list builds a real design: only the named parts pair, every part
	// is a kit value or two of them, the parts one value sets stay equal, and
	// the actual figures are the formulas on the parts
	{
		const formula = (d) => {
			const c = d.components;
			switch (d.topology) {
				case 'firstOrder':
				case 'firstOrderHp':
					return { tau: c.R * c.C };
				case 'mfb': {
					const a = (1 / c.C1) * (1 / c.R1 + 1 / c.R2 + 1 / c.R3);
					const b = 1 / (c.R2 * c.R3 * c.C1 * c.C2);
					return { wn: Math.sqrt(b), q: Math.sqrt(b) / a };
				}
				case 'mfbHp': {
					const a = (c.C1 + c.C2 + c.C3) / (c.R2 * c.C2 * c.C3);
					const b = 1 / (c.R1 * c.R2 * c.C2 * c.C3);
					return { wn: Math.sqrt(b), q: Math.sqrt(b) / a };
				}
				case 'sallenKey':
					return { wn: 1 / Math.sqrt(c.R1 * c.R2 * c.Ctop * c.Cbottom), q: Math.sqrt(c.R1 * c.R2 * c.Ctop * c.Cbottom) / (c.Cbottom * (c.R1 + c.R2)) };
				case 'sallenKeyHp':
					return { wn: 1 / Math.sqrt(c.Rtop * c.Rbottom * c.C1 * c.C2), q: Math.sqrt(c.Rtop * c.Rbottom * c.C1 * c.C2) / (c.Rtop * (c.C1 + c.C2)) };
				case 'mfbBp':
					return Number.isFinite(d.actual.gbw) ? mfbBandPassEffective(c, d.actual.gbw) : mfbBandPassActual(c);
				case 'boctor':
				case 'boctorHp': {
					const a = boctorActual(c, d.lowSide);
					return { wn: a.wn, q: a.q, wz: a.wz };
				}
				default: {
					const out = { wn: 1 / Math.sqrt(c.C1 * c.C2 * c.Ra * c.Rb), q: c.Rd * Math.sqrt(c.C1 / (c.C2 * c.Ra * c.Rb)) };
					if (d.topology === 'towThomasNotch') out.wz = 1 / Math.sqrt(c.Cin * c.C2 * c.Ra * c.Rz);
					if (d.topology === 'towThomasBp') out.gain = -c.Rd / c.R1;
					return out;
				}
			}
		};
		const EQUAL = { mfb: [['R1', 'R3']], sallenKey: [['R1', 'R2']], towThomas: [['R1', 'Ra', 'Rb']], towThomasHp: [['Ra', 'Rb']], towThomasNotch: [['Ra', 'Rb']], towThomasBp: [['Ra', 'Rb']] };
		const NAMES = {
			firstOrder: ['R'],
			mfb: ['R1', 'R2'],
			mfbHp: ['R1', 'R2'],
			sallenKey: ['R1'],
			sallenKeyHp: ['Rtop', 'Rbottom'],
			towThomas: ['Ra', 'Rd'],
			towThomasHp: ['Ra', 'Rd'],
			towThomasNotch: ['Ra', 'Rd', 'Rz'],
			towThomasBp: ['Ra', 'Rd', 'R1'],
			mfbBp: ['R1', 'R2', 'R3'],
			boctor: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']
		};
		// the parts a name lets pair
		const GROUP = { mfb: { R1: ['R1', 'R3'] }, sallenKey: { R1: ['R1', 'R2'] }, towThomas: { Ra: ['R1', 'Ra', 'Rb'] }, towThomasHp: { Ra: ['Ra', 'Rb'] }, towThomasNotch: { Ra: ['Ra', 'Rb'] }, towThomasBp: { Ra: ['Ra', 'Rb'] } };
		const MAKERS = {
			firstOrder: (wn, q, o) => designFirstOrderLowPass(1 / wn, o),
			mfb: (wn, q, o) => designMfbLowPass(wn, q, o),
			mfbHp: (wn, q, o) => designMfbHighPass(wn, q, o),
			sallenKey: (wn, q, o) => designSallenKeyLowPass(wn, q, o),
			sallenKeyHp: (wn, q, o) => designSallenKeyHighPass(wn, q, o),
			towThomas: (wn, q, o) => designTowThomasLowPass(wn, q, o),
			towThomasHp: (wn, q, o) => designTowThomasHighPass(wn, q, o),
			towThomasNotch: (wn, q, o) => designTowThomasNotch(wn, q, wn * 1.6, { ...o, lowSide: true }),
			towThomasBp: (wn, q, o) => designTowThomasBandPass(wn, q, { ...o, gain: 0.7 }),
			mfbBp: (wn, q, o) => designMfbBandPass(wn, q, { ...o, gain: 1.4, gbw: q > 1 ? LIMIT_GBW : null }),
			boctor: (wn, q, o) => designBoctorNotch(wn, q, wn * 2, { ...o, lowSide: true })
		};
		const problems = [];
		let built = 0;
		let paired = 0;
		for (const [kind, make] of Object.entries(MAKERS)) {
			const names = NAMES[kind];
			const lists = [...names.map((n) => [n]), ...names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]))];
			for (const f0 of [480, 3300, 32260]) {
				for (const q of [0.5412, 1.3066, 3]) {
					const wn = 2 * Math.PI * f0;
					for (const stock of [PAIR_STOCKS.lab, PAIR_STOCKS.labR]) {
						for (const list of lists) {
							const d = make(wn, q, { ...stock, pairs: list });
							if (!d) continue;
							built++;
							const label = `${kind} ${f0} Hz Q ${q} [${list}]`;
							const allowedParts = new Set(list.flatMap((n) => GROUP[kind]?.[n] ?? [n]));
							for (const [part, v] of resistors(d)) {
								const pair = seriesPair(v, kit);
								if (pair) paired++;
								if (pair && !allowedParts.has(part)) problems.push(`${label}: ${part} pairs`);
								if (!pair && !kit.some((x) => rel(x, v))) problems.push(`${label}: ${part} = ${v} is neither a kit value nor two`);
							}
							for (const group of EQUAL[kind] ?? []) if (!group.every((p) => d.components[p] === d.components[group[0]])) problems.push(`${label}: ${group.join(' = ')} broken`);
							const f = formula(d);
							for (const [k, v] of Object.entries(f)) if (!rel(v, d.actual[k])) problems.push(`${label}: ${k} ${d.actual[k]} against ${v}`);
						}
					}
				}
			}
		}
		check('pair limit: a list of names builds a real design: only those parts pair, equal parts stay equal, the actual figures are the formulas on the parts', problems.length === 0 && paired > 100, problems.length ? problems.slice(0, 3).join('; ') : `${built} designs, ${paired} paired resistors`);
	}

	// (c) the plan on whole filters, built as the page builds them (a stage
	// the stock cannot build takes the full grid, flagged), for every N
	const fullGrid = { resistorSeries: 'E24', capacitors: null };
	const shown = (make) => (o) => make(o) ?? ((d) => d && { ...d, stockShortfall: true })(make(fullGrid));
	const cascadeStage = (stage, menu, o) => {
		if (Number.isFinite(stage.wz)) {
			const how = notchOptions(stage);
			return menu === 'boctor' ? designBoctorNotch(stage.wn, stage.q, stage.wz, { ...o, lowSide: how.boctorLowSide }) : designTowThomasNotch(stage.wn, stage.q, stage.wz, { ...o, ...how.towThomas });
		}
		const hp = stage.filterType === 'highpass';
		if (stage.order === 1) return (hp ? designFirstOrderHighPass : designFirstOrderLowPass)(stage.tau, o);
		if (menu === 'towThomas' || menu === 'boctor') return (hp ? designTowThomasHighPass : designTowThomasLowPass)(stage.wn, stage.q, o);
		if (menu === 'sallenKey') return (hp ? designSallenKeyHighPass : designSallenKeyLowPass)(stage.wn, stage.q, o);
		return (hp ? designMfbHighPass : designMfbLowPass)(stage.wn, stage.q, o);
	};
	const narrow = BAND_SPECS.narrowBp;
	const narrowArgs = { filterType: 'bandpass', response: 'butterworth', topology: 'mfb', amaxDb: 3, aminDb: 40, amaxDbHp: 3, amaxDbLp: 3, aminDbHp: narrow.aminDbLow, aminDbLp: narrow.aminDbHigh, fl: narrow.fl, fh: narrow.fh, fsl: narrow.fsl, fsh: narrow.fsh, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: LIMIT_GBW };
	const lab = PAIR_STOCKS.lab;
	const labR = PAIR_STOCKS.labR;
	const cascadeCase = (label, design, menu, stock, script) => ({ label, stages: design.stages, build: (i, pairs) => shown((o) => cascadeStage(design.stages[i], menu, o))({ ...stock, pairs }), script });
	const bandCase = (label, design, menus, stock, script) => ({ label, stages: design.stages, build: (i, pairs) => realizeBandStage(design.stages[i], menus, { ...stock, pairs }), script });
	const lowpass = (response, amaxDb, aminDb, fp, fs) => designLowPass({ response, amaxDb, aminDb, fp, fs, order: null });
	const scriptStock = { resistorStock: kit, capacitorStock: LAB_KIT.capacitors, resistorPairs: true };
	const cases = [
		cascadeCase('Butterworth low-pass, MFB, lab kit', lowpass('butterworth', 3, 40, 10000, 35000), 'mfb', lab, { filterType: 'lowpass', response: 'butterworth', topology: 'mfb', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 }),
		cascadeCase('Chebyshev low-pass, Tow-Thomas, lab kit', lowpass('chebyshev', 1, 60, 10000, 20000), 'towThomas', lab, { filterType: 'lowpass', response: 'chebyshev', topology: 'towThomas', amaxDb: 1, aminDb: 60, fp: 10000, fs: 20000 }),
		cascadeCase('elliptic low-pass, Boctor, lab kit', lowpass('elliptic', 0.5, 60, 10000, 13000), 'boctor', lab, { filterType: 'lowpass', response: 'elliptic', topology: 'boctor', amaxDb: 0.5, aminDb: 60, fp: 10000, fs: 13000 }),
		cascadeCase('elliptic low-pass, Tow-Thomas, lab resistors', lowpass('elliptic', 0.5, 60, 10000, 13000), 'towThomas', labR, null),
		cascadeCase('Butterworth high-pass, Sallen-Key, lab kit', designHighPass({ response: 'butterworth', amaxDb: 3, aminDb: 50, fp: 10000, fs: 3000, order: null }), 'sallenKey', lab, null),
		cascadeCase('Bessel band-pass cascade, MFB, lab kit', designBandPass({ response: 'bessel', amaxDb: 3, aminDb: 30, fl: 1000, fh: 10000, fsl: 200, fsh: 50000, orderLow: null, orderHigh: null }), 'mfb', lab, null),
		bandCase('narrow band-pass transformed, MFB for the TL082, lab kit', designTransformed(narrow, 'butterworth'), { ...transformedMenus('mfb', 'boctor'), gbw: LIMIT_GBW }, lab, narrowArgs),
		bandCase('band-stop transformed, Boctor else Tow-Thomas, lab kit', designTransformed(BAND_SPECS.defaultBs, 'butterworth'), transformedMenus('mfb', 'boctor'), lab, null),
		bandCase('elliptic band-pass transformed, Tow-Thomas, lab resistors', designTransformed(narrow, 'elliptic'), transformedMenus('towThomas', 'towThomas'), labR, null)
	];
	const plans = new Map();
	// every group of parts one value sets, by topology, as the component tables list them
	const ALL_GROUPS = {
		firstOrder: [{ name: 'R', parts: ['R'] }],
		firstOrderHp: [{ name: 'R', parts: ['R'] }],
		mfb: [{ name: 'R1', parts: ['R1', 'R3'] }, { name: 'R2', parts: ['R2'] }],
		mfbHp: [{ name: 'R1', parts: ['R1'] }, { name: 'R2', parts: ['R2'] }],
		sallenKey: [{ name: 'R1', parts: ['R1', 'R2'] }],
		sallenKeyHp: [{ name: 'Rtop', parts: ['Rtop'] }, { name: 'Rbottom', parts: ['Rbottom'] }],
		towThomas: [{ name: 'Ra', parts: ['R1', 'Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
		towThomasHp: [{ name: 'Ra', parts: ['Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
		towThomasNotch: [{ name: 'Rz', parts: ['Rz'] }, { name: 'Ra', parts: ['Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
		towThomasBp: [{ name: 'R1', parts: ['R1'] }, { name: 'Ra', parts: ['Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
		mfbBp: ['R1', 'R2', 'R3'].map((n) => ({ name: n, parts: [n] }))
	};
	{
		const problems = [];
		const rows = [];
		const texts = [];
		let bruteChecked = 0;
		for (const c of cases) {
			// every build once, as the page keeps them
			const memo = new Map();
			const build = (i, pairs) => {
				const key = `${i} ${JSON.stringify(pairs)}`;
				if (!memo.has(key)) memo.set(key, c.build(i, pairs));
				return memo.get(key);
			};
			const single = c.stages.map((_, i) => build(i, false));
			const full = c.stages.map((_, i) => build(i, true));
			const top = planFilterPairs(c.stages, build, kit, null);
			const total = top.total;
			const byN = [];
			// N: pairs kept / measure, for the record
			rows.push(`${c.label}:`);
			for (let n = 0; n <= total + 1; n++) byN.push(planFilterPairs(c.stages, build, kit, n));
			byN.push(planFilterPairs(c.stages, build, kit, 20));
			plans.set(c.label, { build, byN, top });
			if (total < 3) problems.push(`${c.label}: only ${total} pairs where they help`);
			if (!same(top.stages.map((s) => s.design), full) || top.limited) problems.push(`${c.label}: no limit is not pairs where they help`);
			byN.forEach((plan, k) => {
				const n = k <= total + 1 ? k : 20;
				const designs = plan.stages.map((s) => s.design);
				// the pairs as the tables print them: every R part of a stage that did not fall back
				const counted = designs.reduce((sum, d) => sum + (d.stockShortfall ? 0 : resistors(d).filter(([, v]) => seriesPair(v, kit)).length), 0);
				if (counted !== plan.count || counted > Math.max(n, 0)) problems.push(`${c.label} N=${n}: ${counted} pairs built, plan says ${plan.count}`);
				if (n === 0 && !same(designs, single)) problems.push(`${c.label}: N=0 is not single parts`);
				if (n >= total && (plan.limited || !same(designs, full))) problems.push(`${c.label} N=${n}: not the design with pairs where they help`);
				if (n > 0 && n < total && plan.measure > byN[n - 1].measure * (1 + 1e-9)) problems.push(`${c.label} N=${n}: measure ${plan.measure} worse than ${byN[n - 1].measure} at N=${n - 1}`);
				// each stage is its designer rerun with the list it keeps, and only listed parts pair
				plan.stages.forEach((s, i) => {
					if (!same(s.design, build(i, s.option))) problems.push(`${c.label} N=${n} stage ${i + 1}: not the design of its list`);
					if (Array.isArray(s.option) && s.kept.some((g) => !s.option.includes(g.name))) problems.push(`${c.label} N=${n} stage ${i + 1}: ${s.kept.map((g) => g.name)} pair outside [${s.option}]`);
				});
				texts.push(filterPairPlanSummary(plan), ...plan.stages.map((s) => filterPairLimitSentence(s, n)));
				if (k <= total) rows.push(`${n}:${plan.count}/${plan.measure.toExponential(2)}`);
			});
			// against every way to give each stage a list holding N resistors or
			// fewer: the sum of the pairs built at most N, a list that builds no
			// pair counting only as single parts. A list may name any resistor of
			// a stage built from the kit, not only those pairs where they help made
			// pairs (one given up can leave another needing two in series), but a
			// Boctor stage's six (64 lists, each a search over every capacitor)
			// keep to those
			const opened = full.map((d) => (!d || !d.components || d.stockShortfall ? [] : /^boctor/.test(d.topology) ? filterPairGroups(d, kit) : ALL_GROUPS[d.topology] ?? []));
			const options = opened.map((groups, i) => {
				const names = groups.map((g) => g.name);
				const out = [];
				for (let m = 0; m <= names.length; m++) {
					for (const list of pairSubsets(names, m)) {
						const weight = list.reduce((sum, name) => sum + groups.find((g) => g.name === name).parts.length, 0);
						const design = m === names.length && m > 0 ? full[i] : build(i, list);
						out.push({ empty: m === 0, weight, count: filterPairCount(design, kit), measure: filterStageMeasure(c.stages[i], design, full[i]) });
					}
				}
				return out;
			});
			const combos = options.reduce((n, o) => n * o.length, 1);
			if (combos <= 20000) {
				for (let n = 1; n < total; n++) {
					let best = Infinity;
					const walk = (i, used, measure) => {
						if (i === options.length) {
							best = Math.min(best, measure);
							return;
						}
						for (const o of options[i]) {
							if (o.empty) walk(i + 1, used, measure + o.measure);
							else if (o.count > 0 && o.weight <= n && used + o.count <= n) walk(i + 1, used + o.count, measure + o.measure);
						}
					};
					walk(0, 0, 0);
					bruteChecked++;
					if (!(Math.abs(byN[n].measure - best) <= 1e-9 * Math.max(best, 1e-12))) problems.push(`${c.label} N=${n}: plan ${byN[n].measure}, best list ${best}`);
				}
			}
			rows.push('|');
		}
		const wordBad = texts.filter((t) => /undefined|NaN|\byou(r)?\b|[–—]/.test(t));
		check(
			`pair limit: ${cases.length} filters, N from 0 past the count of pairs where they help: at most N pairs built, N = 0 is single parts, N at or past the count is the design with pairs where they help, the measure never grows below it, every stage its designer rerun with its list, the best lists found (${bruteChecked} limits against every combination)`,
			problems.length === 0 && wordBad.length === 0 && bruteChecked > 10,
			problems.length ? problems.slice(0, 3).join('; ') : wordBad.length ? wordBad[0] : rows.join(' ').slice(0, 400)
		);
	}

	// (d) the downloaded script: RESISTOR_PAIR_LIMIT only when the page has a
	// limit, and then the stages it prints are the page's choice; set to null
	// it prints the design with pairs where they help
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-pair-limit-'));
		const base = { amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {} };
		const run = (name, code) => {
			const file = join(dir, `${name}.js`);
			writeFileSync(file, code);
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return `ERROR ${e.stderr || e.message}`;
			}
		};
		// the resistor lines a script prints, and the same from the page's designs
		const printedParts = (out) =>
			[...out.matchAll(/^ {2}(R\w*|r) = ([\d.]+) ohm( \(([\d.]+) \+ ([\d.]+) in series\))?/gm)].map((m) => `${m[1]} = ${Math.round(Number(m[2]))}${m[3] ? ` (${m[4]} + ${m[5]})` : ''}`);
		const expectedParts = (designs) =>
			designs.flatMap((d) =>
				Object.entries(d.components)
					.filter(([name]) => /^[Rr]/.test(name))
					.map(([name, v]) => {
						const pair = d.stockShortfall ? null : seriesPair(v, kit);
						return { text: `${name} = ${Math.round(v)}${pair ? ` (${Number(pair[0].toPrecision(6))} + ${Number(pair[1].toPrecision(6))})` : ''}`, loose: !!d.stockShortfall };
					})
			);
		// a stage on the full grid prints any pair the kit happens to sum to; the page shows none
		const sameParts = (got, want) => got.length === want.length && want.every((w, k) => (w.loose ? got[k].replace(/ \(.*\)$/, '') === w.text : got[k] === w.text));
		const firstOff = (got, want) => {
			const k = want.findIndex((w, j) => !sameParts([got[j] ?? ''], [w]));
			return k < 0 ? `${got.length} lines against ${want.length}` : `${got[k]} against ${want[k].text}`;
		};
		const problems = [];
		let compared = 0;
		for (const c of cases.filter((x) => x.script)) {
			const { byN, top } = plans.get(c.label);
			const spec = { ...base, ...c.script, ...scriptStock };
			if (/RESISTOR_PAIR_LIMIT/.test(generateScript(spec))) problems.push(`${c.label}: RESISTOR_PAIR_LIMIT without a limit`);
			for (const n of [1, 2, 3]) {
				const code = generateScript({ ...spec, resistorPairLimit: n });
				if (!new RegExp(`^const RESISTOR_PAIR_LIMIT = ${n};`, 'm').test(code)) problems.push(`${c.label} N=${n}: no RESISTOR_PAIR_LIMIT line`);
				const out = run(`${c.script.filterType}-${c.script.topology}-${n}`, code);
				const got = printedParts(out);
				const want = expectedParts(byN[n].stages.map((s) => s.design));
				compared++;
				if (!sameParts(got, want)) problems.push(`${c.label} N=${n}: ${firstOff(got, want)}`);
				if (!out.includes(filterPairPlanSummary(byN[n]))) problems.push(`${c.label} N=${n}: the summary is not the page's`);
				if (n === 2) {
					const off = run(`${c.script.filterType}-${c.script.topology}-null`, code.replace(/^const RESISTOR_PAIR_LIMIT = 2;/m, 'const RESISTOR_PAIR_LIMIT = null;'));
					compared++;
					if (!sameParts(printedParts(off), expectedParts(top.stages.map((s) => s.design)))) problems.push(`${c.label}: RESISTOR_PAIR_LIMIT = null is not pairs where they help`);
				}
			}
		}
		check('pair limit, downloadable script: RESISTOR_PAIR_LIMIT only with a limit; the stages it prints are the page\'s choice for N = 1, 2, 3, its summary the page\'s, and null gives pairs where they help', problems.length === 0 && compared === 16, problems.length ? problems.slice(0, 2).join('; ') : `${compared} runs`);
	}

	// (e) LTspice: the notes follow the parts built, so they name the kept pairs only
	{
		const c = cases[0];
		const plan = plans.get(c.label).byN[2];
		const realized = plan.stages.map((s) => s.design);
		const opts = { realizedStages: realized, topology: 'mfb', lpCount: 0, combinerMode: 'sum', combinerR: 10000, combinerResistors: null, filterType: 'lowpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, resistorStock: kit, pairs: true };
		const notes = generateNetlist(opts).split('\n').filter((l) => /in series/.test(l));
		const kept = plan.stages.flatMap((s, k) => s.kept.flatMap((g) => g.parts.map((p) => `stage ${k + 1} ${p}${k + 1} =`)));
		check('pair limit, LTspice: one note per kept pair, none for the dropped ones', notes.length === plan.count && kept.every((k) => notes.some((l) => l.includes(k))), notes.join(' | '));
	}

	// (f) the Start here panel says how many may pair
	{
		const d = lowpass('butterworth', 3, 40, 10000, 35000);
		const plan = plans.get(cases[0].label).byN[2];
		const args = { filterType: 'lowpass', response: 'butterworth', topology: 'mfb', order: d.n, stages: d.stages.length, fp: 10000, fs: 35000, amaxDb: 3, aminDb: 40, design: d, realizedStages: plan.stages.map((s) => s.design), stock: 'lab', pairs: true };
		const words = (blocks) => JSON.stringify(blocks);
		const limited = words(filterBasics({ ...args, pairLimit: 2 }));
		const open = words(filterBasics(args));
		check('pair limit, Start here: the rounding sentence gives the limit, and without one stays as it was', /for up to 2 of them in the whole filter, to two resistors in series/.test(limited) && !/for up to/.test(open) && /\(or to two resistors in series where no single one comes close\)/.test(open));
	}

	// (g) a list too short to build some stages from single parts: a stage
	// the list builds with the pairs a limit leaves it is never shown on the
	// full E24 and E6 grids instead (their finer values would land it closer,
	// so a plain miss would pick them), and the script makes the same choice
	{
		const shortList = [1000, 2200, 4700, 10000, 22000, 47000];
		const stock = { resistorSeries: shortList, capacitors: [1e-9, 1e-8, 1e-7] };
		const d = designTransformed(BAND_SPECS.defaultBp, 'chebyshev');
		const menus = { ...transformedMenus('mfb', 'boctor'), gbw: LIMIT_GBW };
		const memo = new Map();
		const build = (i, pairs) => {
			const key = `${i} ${JSON.stringify(pairs)}`;
			if (!memo.has(key)) memo.set(key, realizeBandStage(d.stages[i], menus, { ...stock, pairs }));
			return memo.get(key);
		};
		const full = d.stages.map((_, i) => build(i, true));
		const total = planFilterPairs(d.stages, build, shortList, null).total;
		const problems = [];
		const rows = [];
		// every list each stage can take: the pairs it builds, the resistors it names, whether it stays on the list
		const options = full.map((fd, i) => {
			const groups = filterPairGroups(fd, shortList);
			const out = [];
			for (let m = 0; m <= groups.length; m++) {
				for (const list of pairSubsets(groups.map((g) => g.name), m)) {
					const design = m === groups.length && m > 0 ? fd : build(i, list);
					out.push({ empty: m === 0, weight: list.reduce((n, name) => n + groups.find((g) => g.name === name).parts.length, 0), count: filterPairCount(design, shortList), fell: Boolean(design?.stockShortfall) });
				}
			}
			return out;
		});
		const meaningful = full.some((fd, i) => !fd.stockShortfall && build(i, []).stockShortfall);
		for (let n = 1; n < total; n++) {
			const plan = planFilterPairs(d.stages, build, shortList, n);
			const fell = plan.stages.filter((s) => s.design.stockShortfall).length;
			// the fewest stages on the full grids that any lists within n leave
			let fewest = Infinity;
			const walk = (i, used, f) => {
				if (i === options.length) {
					fewest = Math.min(fewest, f);
					return;
				}
				for (const o of options[i]) {
					if (o.empty) walk(i + 1, used, f + Number(o.fell));
					else if (o.count > 0 && o.weight <= n && used + o.count <= n) walk(i + 1, used + o.count, f + Number(o.fell));
				}
			};
			walk(0, 0, 0);
			if (fell !== fewest) problems.push(`N=${n}: ${fell} stages on the full grids, ${fewest} would do`);
			if (plan.count > n) problems.push(`N=${n}: ${plan.count} pairs`);
			const summary = filterPairPlanSummary(plan);
			const shortSet = plan.stages.flatMap((s, i) => (s.short ? [i + 1] : []));
			if (shortSet.length && !/more pairs than that to be built from the list, so (it is|they are) shown with the full E24 and E6 grids\./.test(summary)) problems.push(`N=${n}: the summary does not say why stages ${shortSet} are on the full grids`);
			if (!shortSet.length && /full E24/.test(summary)) problems.push(`N=${n}: the summary names the full grids for no stage`);
			plan.stages.forEach((s, i) => {
				if (s.short && !/too few pairs to be built from the list/.test(filterPairLimitSentence(s, n))) problems.push(`N=${n} stage ${i + 1}: the stage sentence`);
			});
			rows.push(`${n}:${plan.count} pairs, ${fell} on the grids`);
		}
		// the script prints the stages the page shows, the full-grid ones flagged
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-pair-short-'));
		const spec = { filterType: 'bandpass', response: 'chebyshev', topology: 'mfb', amaxDb: 3, aminDb: 40, amaxDbHp: 3, amaxDbLp: 3, aminDbHp: 40, aminDbLp: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, fp: 10000, fs: 35000, order: null, orderHp: null, orderLp: null, capOverrides: {}, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: LIMIT_GBW, resistorStock: shortList, capacitorStock: stock.capacitors, resistorPairs: true };
		for (const n of [1, total - 1]) {
			const file = join(dir, `short-${n}.js`);
			writeFileSync(file, generateScript({ ...spec, resistorPairLimit: n }));
			let out;
			try {
				out = execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				out = `ERROR ${e.stderr || e.message}`;
			}
			const plan = planFilterPairs(d.stages, build, shortList, n);
			const got = [...out.matchAll(/^ {2}(R\w*) = ([\d.]+) ohm/gm)].map((m) => `${m[1]} = ${Math.round(Number(m[2]))}`);
			const want = plan.stages.flatMap((s) => Object.entries(s.design.components).filter(([name]) => /^R/.test(name)).map(([name, v]) => `${name} = ${Math.round(v)}`));
			if (got.join() !== want.join()) problems.push(`script N=${n}: ${got.join(' ')} against ${want.join(' ')}`);
			if (!out.includes(filterPairPlanSummary(plan))) problems.push(`script N=${n}: the summary is not the page's`);
		}
		check(
			'pair limit, a short list: a stage the list builds with the pairs left is never shown on the full grids instead (the fewest such stages any lists give, for every N), the notes say why one is, and the script makes the same choice',
			problems.length === 0 && meaningful && total >= 3,
			problems.length ? problems.slice(0, 3).join('; ') : `${total} pairs where they help; ${rows.join(', ')}`
		);
	}

	// (h) a stage may gain a pair that pairs where they help leave single: a
	// part solved from one given up can need two in series where it did not.
	// A Chebyshev high-pass in Tow-Thomas stages on the lab kit (1 dB, 40 dB,
	// 3 kHz from 1 kHz) pairs Ra and Rd of stage 1 and Ra of stage 2 where they
	// help; with one pair, stage 2's Rd alone lands it closest, and with four,
	// stage 1's two groups and stage 2's Rd
	{
		const d = designHighPass({ response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 3000, fs: 1000, order: null });
		const memo = new Map();
		const build = (i, pairs) => {
			const key = `${i} ${JSON.stringify(pairs)}`;
			if (!memo.has(key)) memo.set(key, shown((o) => cascadeStage(d.stages[i], 'towThomas', o))({ ...lab, pairs }));
			return memo.get(key);
		};
		const groupsOf = (plan) => plan.stages.map((st) => st.kept.map((g) => g.name).join('+') || '-').join(' ');
		const [top, single, one, four] = [null, 0, 1, 4].map((n) => planFilterPairs(d.stages, build, kit, n));
		check(
			"pair limit: a stage may gain a pair that pairs where they help leave single: a Chebyshev Tow-Thomas high-pass on the lab kit keeps stage 2's Rd with one pair, closer than single parts",
			groupsOf(top) === 'Ra+Rd Ra' && groupsOf(one) === '- Rd' && one.measure < 0.98 * single.measure && groupsOf(four) === 'Ra+Rd Rd' && four.count === 4,
			`N=1 ${groupsOf(one)} ${one.measure.toExponential(3)} against single parts ${single.measure.toExponential(3)}; N=4 ${groupsOf(four)} ${four.measure.toExponential(3)}`
		);
	}
}

console.log(fails === 0 ? 'filter checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
