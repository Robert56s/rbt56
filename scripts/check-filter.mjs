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
// 12. The narrow band-pass (narrowBand.js): the four new stage designers
//    against nodal analysis of their netlists and their own equations
//    (pinned like the others), the simulated inductors, the
//    sensitivities, the textbook numbers at 10 kHz, Q 5 and 10 nF, N
//    identical stages and their bandwidth, the comparison table and its
//    rule, the chains with their gain stage, the pairs, the capacitors by
//    hand, the explanations and the downloadable script.
// 13. The design placed in its template (stages.js) and the parts picked on
//    the whole filter (partSearch.js): the window's ends and middle for
//    every response, the default spec's numbers, the whole-passband
//    measure, the opening design on the lab kit, never worse than the parts
//    of before on a pinned sample, the pair limit, the resistor floor and
//    the op-amp loads (by the checks' own nodal solve), the capacitors typed
//    by hand, the downloadable script against the page (lib-parts.mjs), one
//    scope for the script, and the time a search takes.
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
import { C_FLOOR, LAB_KIT, nearestResistor, pairedResistor, pairSubsets, seriesPair } from '../src/lib/filter/eseries.js';
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
import { PART_LOAD_MIN, PART_MARGIN_TOLERANCE_DB, PART_R_FLOOR, PART_R_MAX, PASSBAND_SLACK_DB, SOURCE_R_DEFAULT, filterSource, filterTemplate, limitAlertOpamp, limitAlertText, measureFilter, searchFilterParts } from '../src/lib/filter/partSearch.js';
import { pageParts, pageSettings, partsProblems } from './lib-parts.mjs';

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

	// the downloadable script runs for the new responses and finds its whole
	// template met, placed as the page opens (centred), with the page's parts
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
		const args = { ...base, ...spec, ...wiring(spec), placement: 'centred' };
		const code = generateScript(args);
		const file = join(dir, `${spec.filterType}-${spec.response}.js`);
		writeFileSync(file, code);
		try {
			const out = execFileSync(process.execPath, [file], { encoding: 'utf8' });
			const wrong = partsProblems(out, pageParts(args));
			if (!/least attenuation in the stopband .*: OK/.test(out) || !/the whole template: OK$/.test(out.trim()) || wrong.length) {
				scriptBad++;
				console.log('   SCRIPT', spec.filterType, spec.response, wrong[0] ?? out.trim().split('\n').pop());
			}
		} catch (e) {
			scriptBad++;
			console.log('   SCRIPT', spec.filterType, spec.response, String(e.stderr || e.message).split('\n').slice(0, 3).join(' / '));
		}
	}
	check(`downloadable script: runs for ${scripts.length} new-response designs, a band filter's plain side on MFB, prints the page's parts and reports its whole template met`, scriptBad === 0, `${scriptBad} failures`);

	// the other side of a band filter may be Sallen-Key as well
	{
		const spec = scripts.find((s) => s.filterType === 'bandpass');
		const file = join(dir, 'bandpass-sallenkey-side.js');
		writeFileSync(file, generateScript({ ...base, ...spec, ...wiring(spec, 'sallenKey'), placement: 'centred' }));
		let ok = false;
		try {
			ok = /the whole template: OK$/.test(execFileSync(process.execPath, [file], { encoding: 'utf8' }).trim());
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
	// retaken when the searches began to avoid capacitors under 47 pF (C_FLOOR in eseries.js),
	// then when designMfbLowPassFromCaps began to choose its resistor root after
	// rounding (the "by hand" MFB rows: every one that moved now lands closer
	// to its f0 and Q; the automatic designs did not move)
	const BEFORE = { E24: '21f9bb64364301e8', E96: '2cc477cffa604f92', lab: 'afcc9ad27692c2bf', labR: 'adc8e23e41f121ad' };
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
	// What moved those fingerprints, checked: the MFB root from two capacitors
	// typed by hand. Before, the root whose ideal resistors sat nearer 10
	// kohm was taken and then rounded; now the root is chosen after rounding.
	// Both rebuilt here from the quadratic (x = 1/R1 = (a C1 +- sqrt(D)) / 4,
	// 1/R2 = a C1 - 2x, a = w0/Q, single parts): over the sweep's f0 and Q,
	// capacitor ratios from 8Q^2 to 40Q^2, every stock, the root chosen now
	// never lands further from f0 and Q than the old one where the old one's
	// resistors stayed in range (200 ohm to 2 Mohm).
	{
		let rows = 0;
		let moved = 0;
		const worse = [];
		for (const [name, opts] of Object.entries(PAIR_STOCKS)) {
			for (const f0 of PAIR_F0) {
				const wn = 2 * Math.PI * f0;
				for (const q of PAIR_Q) {
					for (const C2 of [1e-10, 1e-9, 4.7e-9, 2.2e-8]) {
						for (const k of [1, 1.3, 2, 5]) {
							const C1 = C2 * 8 * q * q * k;
							const a = wn / q;
							const D = (a * C1) ** 2 - 8 * wn * wn * C1 * C2;
							const roots = [1, -1].map((sign) => (a * C1 + sign * Math.sqrt(D)) / 4).map((x) => ({ R1: 1 / x, R2: 1 / (a * C1 - 2 * x) })).filter((r) => r.R1 > 0 && r.R2 > 0);
							if (!roots.length) continue;
							const rounded = ({ R1, R2 }) => {
								const R1n = pairedResistor(R1, opts.resistorSeries, false);
								const R2n = pairedResistor(R2, opts.resistorSeries, false);
								const b = 1 / (R1n * R2n * C1 * C2);
								const w = Math.sqrt(b);
								return { R1n, R2n, miss: Math.max(Math.abs(Math.log(w / wn)), Math.abs(Math.log(w / ((1 / C1) * (2 / R1n + 1 / R2n)) / q))) };
							};
							const sweet = ({ R1, R2 }) => Math.log(R1 / 10000) ** 2 + Math.log(R2 / 10000) ** 2;
							const old = rounded(roots.reduce((x, y) => (sweet(y) < sweet(x) ? y : x)));
							const now = designMfbLowPassFromCaps(wn, q, C1, C2, { ...opts, pairs: false });
							if (!now.ok) continue;
							rows++;
							if (now.components.R1 !== old.R1n || now.components.R2 !== old.R2n) moved++;
							const inRange = [old.R1n, old.R2n].every((v) => v > 200 && v < 2e6);
							const missNow = Math.max(Math.abs(Math.log(now.actual.wn / wn)), Math.abs(Math.log(now.actual.q / q)));
							if (inRange && missNow > old.miss + 1e-12) worse.push(`${name} ${f0} Hz Q ${q} C1/C2 ${(C1 / C2).toFixed(1)}: ${missNow.toFixed(4)} against ${old.miss.toFixed(4)}`);
						}
					}
				}
			}
		}
		check('MFB by hand, the root chosen after rounding: never further from f0 and Q than the root nearer 10 kohm before rounding, where that one stays in range', worse.length === 0 && moved > 0, worse.length ? worse.slice(0, 3).join('; ') : `${rows} designs, ${moved} on the other root now`);
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
	// The page's opening design (Butterworth low-pass, 10 kHz, 3 and 40 dB,
	// MFB) on the lab kit, built by its stage designers alone (the page's
	// parts until the part search): pairs bring every f0 within 1 %. The
	// page now picks the parts on the whole filter (partSearch.js), so what it
	// shows for this design is checked in section 13 against the template.
	{
		const design = designLowPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null });
		const worst = (pairs) => Math.max(...design.stages.map((st) => designMfbLowPass(st.wn, st.q, { ...PAIR_STOCKS.lab, pairs })).map((r, i) => Math.abs(r.actual.wn / design.stages[i].wn - 1)));
		check("pairs on: the opening design's stages, each built by its designer alone on the lab kit, get every f0 within 1 %", worst(false) > 0.1 && worst(true) < 0.01, `worst f0 ${pct(worst(false))} -> ${pct(worst(true))}`);
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
// part search and prints each pair with its two parts; switched to false it
// gives the single-part design back. Either way its parts are the ones the
// page picks for the same settings (lib-parts.mjs), on the passband edge
// and centred, and each pair is printed as the stock's two parts.
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
	const cases = [
		['mfb-lowpass', { filterType: 'lowpass', response: 'butterworth', topology: 'mfb', fp: 10000, fs: 35000 }],
		['tt-highpass', { filterType: 'highpass', response: 'chebyshev', topology: 'towThomas', fp: 10000, fs: 3000 }]
	];
	const problems = [];
	let sample = '';
	for (const [name, spec] of cases) {
		for (const placement of ['edge', 'centred']) {
			const args = { ...base, ...spec, resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors, resistorPairs: true, placement };
			const code = generateScript(args);
			const on = run(`${name}-${placement}-on.js`, code);
			const off = run(`${name}-${placement}-off.js`, code.replace('const RESISTOR_PAIRS = true;', 'const RESISTOR_PAIRS = false;'));
			if (!/^const RESISTOR_PAIRS = true;/m.test(code) || !/^const RESISTOR_PAIRS = false;/m.test(generateScript({ ...base, ...spec }))) problems.push(`${name}: RESISTOR_PAIRS not written as asked`);
			if (!/ohm \(\d+ \+ \d+ in series\)/.test(on) || /in series\)/.test(off)) problems.push(`${name} ${placement}: pairs printed ${/in series\)/.test(on) ? 'with the option off' : 'nowhere'}`);
			// every pair printed is the stock's own two parts for that value
			for (const [, v, a, b] of on.matchAll(/ = (\d+) ohm \((\d+) \+ (\d+) in series\)/g)) {
				if (JSON.stringify(seriesPair(Number(v), LAB_KIT.resistors)) !== JSON.stringify([Number(a), Number(b)])) problems.push(`${name} ${placement}: ${v} printed as ${a} + ${b}`);
			}
			for (const [label, out, pairs] of [['on', on, true], ['off', off, false]]) {
				const wrong = partsProblems(out, pageParts({ ...args, resistorPairs: pairs }));
				if (wrong.length) problems.push(`${name} ${placement} pairs ${label}: ${wrong[0]}`);
			}
			sample ||= on.split('\n').find((l) => /in series\)/.test(l))?.trim() ?? '';
		}
	}
	check(
		'downloadable script: RESISTOR_PAIRS = true prints the parts the page picks with pairs, each pair as its two parts, on the edge and centred; false gives the page\'s single parts back',
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
	// the page's stages, says which method has fewer op-amps, and prints the
	// parts, the response and the verdict the page shows (lib-parts.mjs), on
	// the passband edge and centred. Centred, as the page opens, the narrow
	// band-pass and the default band-stop meet their whole template; on the
	// edge the band-pass stages a transformed design cannot search keep their
	// designer's pick, and the narrow band-pass on MFB is reported short in
	// its passband, as the page reports it; held to order 2 it is short of
	// its 50 dB.
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-band-'));
		// the page's arguments: its sides on Tow-Thomas when the response has zeros, as the page insists
		const sideOf = (response) => (hasZeros(response) ? 'towThomas' : 'mfb');
		const args = (spec, response, topologyBand, topologyNotch, orderBand = null, placement = 'centred') => ({
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
			orderBand,
			placement
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
		const cases = [
			['narrow-bp-butterworth-mfb', BAND_SPECS.narrowBp, 'butterworth', 'mfb', 'boctor'],
			['narrow-bp-elliptic-towthomas', BAND_SPECS.narrowBp, 'elliptic', 'towThomas', 'towThomas'],
			['default-bs-butterworth-boctor', BAND_SPECS.defaultBs, 'butterworth', 'mfb', 'boctor']
		];
		const problems = [];
		const verdicts = [];
		for (const [name, spec, response, band, notch] of cases) {
			for (const placement of ['centred', 'edge']) {
				const a = args(spec, response, band, notch, null, placement);
				const out = run(`${name}-${placement}`, a);
				const page = pageParts(a);
				const wrong = partsProblems(out, page);
				if (wrong.length) problems.push(`${name} ${placement}: ${wrong[0]}`);
				const design = designTransformed(spec, response);
				const choice = chooseBandMethod({ cascade: opampCount(cascadeOf(spec, response), cascadeMenus(sideOf(response))), transformed: opampCount(design, transformedMenus(band, notch)) });
				const fewest = choice === 'transformed' ? 'the transformation' : spec.filterType === 'bandpass' ? 'the cascade' : 'the summed branches';
				if (!out.includes(`fewest op-amps: ${fewest}`) || !(spec.filterType === 'bandpass' ? /gain at f0 \([\d.]+ Hz\): -?[\d.]+ dB/ : /gain at DC: -?[\d.]+ dB/).test(out)) problems.push(`${name}: no method or level line`);
				if (placement === 'centred' && !/the whole template: OK$/.test(out.trim())) problems.push(`${name} centred: ${out.trim().split('\n').pop()}`);
				verdicts.push(`${name} ${placement} ${page.result.measure.margin.toFixed(2)} dB`);
			}
		}
		// on the edge the MFB band-pass's designers alone lose 3.38 dB at fh (bee16b2's parts, Amax 3 dB): now that its
		// band-pass stages are searched too (mfbBandPassCandidates), the search keeps within 3 dB (2.85 dB at fh)
		const edgeMfb = run('narrow-bp-mfb-edge-again', args(BAND_SPECS.narrowBp, 'butterworth', 'mfb', 'boctor', null, 'edge'));
		if (!/worst loss in the passband [\d.]+ dB at \d+ Hz \(f[lh]\), Amax there 3 dB: OK/.test(edgeMfb)) problems.push(`narrow band-pass on the edge: ${edgeMfb.trim().split('\n').slice(-4, -3)}`);
		const short = run('narrow-bp-order-2', args(BAND_SPECS.narrowBp, 'butterworth', 'mfb', 'boctor', 2));
		if (!/least attenuation in the stopband .*\(spec asks for >= 50 dB there\): NOT MET$/m.test(short) || !/the whole template: NOT MET$/.test(short.trim())) problems.push(`order 2: ${short.trim().split('\n').pop()}`);
		check(
			'downloadable script, transformed: the narrow band-pass (Butterworth on MFB, elliptic on Tow-Thomas) and the default band-stop (Boctor notches) print the page\'s parts, response and verdict on the edge and centred, meet their template centred; on the edge the MFB band-pass keeps within Amax (its stages searched), and order 2 is short of its stopband, as the page says',
			problems.length === 0,
			problems.length ? problems.slice(0, 2).join('; ') : verdicts.join(', ')
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

	// (h) The downloaded script. Without an op-amp it carries none: what
	// codegen.js writes around the engine (everything but the inlined
	// library sources) is pinned over 1152 scripts, moved only on purpose
	// (see below). With OPAMP_GBW a transformed
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
		// taken from codegen.js before OPAMP_GBW existed, then moved on
		// purpose: once when the next-steps note began to give the Tow-Thomas
		// Q law, Q / (1 - 4 Q f0 / f_T), and 400 Q f0 instead of "a few
		// hundred"; once when the script began to place the design in its
		// template (PLACEMENT, its own section) and to take its parts from the
		// part search on the whole filter (searchFilterParts, with its notes
		// and the whole-passband verdict) instead of each stage's designer;
		// once more when a stage a centred design puts out of its circuit's
		// reach began to be built and counted as on the passband edge
		// (placedOpampCount), a stage rounded around the edge design to be
		// printed against that design's stage, the load notes to say when an
		// output is read at the input's full swing, and PLACEMENT to list its
		// values; and once more when the limits came first and the source came
		// in: SOURCE_R (the source resistance, its line and the figures of the
		// stages on the input with it), PAST_LIMITS (the set past the limits
		// the page offers) and OPAMP_PART (the op-amp the notes name), the
		// notes on the limits written by the library (limitAlertText) and the
		// limits line naming the 1 Mohm ceiling and the 47 pF floor. None added
		// OPAMP_GBW to a script without an op-amp.
		const SCRIPTS_BEFORE = '760a905194ce0d04';
		const print = createHash('sha256').update(texts.join('\n')).digest('hex').slice(0, 16);
		check(`downloadable script without an op-amp: all ${texts.length} scripts as pinned around the engine, none with OPAMP_GBW`, print === SCRIPTS_BEFORE && !texts.some((t) => /OPAMP_GBW/.test(t)), `${print}, expected ${SCRIPTS_BEFORE}`);

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
		const problems = [];
		// the page's parts for the same arguments, built for the TL082 (the page's own figures are with it)
		const code = generateScript({ ...args, opampGbw: GBWS.TL082 });
		const out = run('narrow-tl082', code);
		const page = pageParts({ ...args, opampGbw: GBWS.TL082 });
		problems.push(...partsProblems(out, page).map((p) => `TL082: ${p}`));
		if (!page.result.stages.every((s) => s.topology === 'mfbBp' && s.actual.gbw === GBWS.TL082)) problems.push('the page\'s stages are not built for the TL082');
		if ((out.match(/with the op-amp \(single pole, GBW = 3\.45 MHz\)/g) ?? []).length !== 3 || (out.match(/the circuit alone \(ideal op-amp\)/g) ?? []).length !== 3) problems.push('stages not printed with the op-amp and alone');
		if (!/^const OPAMP_GBW = 3450000;$/m.test(code)) problems.push('no OPAMP_GBW parameter');
		// the closing steps say the corrected stages' numbers include the op-amp; with null they stay as they were
		const steps = (text) => text.slice(text.indexOf('// NEXT STEPS')).replace(/\n\/\/\s+/g, ' ');
		if (!/stages are built for a single-pole op-amp of 3\.45 MHz, so their numbers above include it/.test(steps(code))) problems.push('next steps do not name the op-amp');
		if (!/least attenuation in the stopband .*: OK$/m.test(out) || !/the whole template: OK$/.test(out.trim())) problems.push(`verdict: ${out.trim().split('\n').pop()}`);
		const slow = run('narrow-lm741', generateScript({ ...args, opampGbw: GBWS.LM741 }));
		if (!/fewest op-amps: the cascade/.test(slow) || !/loop gain under 2/.test(slow) || !/a faster op-amp in OPAMP_GBW/.test(slow)) problems.push(`LM741: ${slow.trim().split('\n').pop().slice(0, 120)}`);
		const noneCode = generateScript({ ...args, opampGbw: null });
		if (!/Every number above comes from an ideal op-amp/.test(steps(noneCode))) problems.push('OPAMP_GBW = null changes the next steps');
		const none = run('narrow-none', noneCode);
		if (!/^\s*actual f0 = /m.test(none) || /with the op-amp/.test(none)) problems.push('OPAMP_GBW = null does not give the plain stages');
		problems.push(...partsProblems(none, pageParts({ ...args, opampGbw: null })).map((p) => `no op-amp: ${p}`));
		check('downloadable script with OPAMP_GBW: the narrow band-pass built for the TL082 prints the page\'s parts and response and meets its template; the LM741 cannot be built (loop gain); null builds the page\'s plain stages', problems.length === 0, problems.slice(0, 2).join('; '));
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
	// limit, and then the parts it prints are the ones the page picks under
	// that limit (the part search keeps to it, lib-parts.mjs), with the page's
	// summary; set to null it prints the page's parts with pairs where they help
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
		const problems = [];
		let compared = 0;
		for (const c of cases.filter((x) => x.script)) {
			const spec = { ...base, ...c.script, ...scriptStock };
			if (/RESISTOR_PAIR_LIMIT/.test(generateScript(spec))) problems.push(`${c.label}: RESISTOR_PAIR_LIMIT without a limit`);
			for (const n of [1, 2, 3]) {
				const placement = n === 2 ? 'centred' : 'edge';
				const code = generateScript({ ...spec, resistorPairLimit: n, placement });
				if (!new RegExp(`^const RESISTOR_PAIR_LIMIT = ${n};`, 'm').test(code)) problems.push(`${c.label} N=${n}: no RESISTOR_PAIR_LIMIT line`);
				const out = run(`${c.script.filterType}-${c.script.topology}-${n}`, code);
				const page = pageParts({ ...spec, resistorPairLimit: n, placement });
				compared++;
				const wrong = partsProblems(out, page);
				if (wrong.length) problems.push(`${c.label} N=${n}: ${wrong[0]}`);
				if (!page.result.pairPlan || !out.includes(filterPairPlanSummary(page.result.pairPlan))) problems.push(`${c.label} N=${n}: the summary is not the page's`);
				if ((out.match(/ in series\)/g) ?? []).length > n) problems.push(`${c.label} N=${n}: ${(out.match(/ in series\)/g) ?? []).length} pairs printed`);
				if (n === 2) {
					const off = run(`${c.script.filterType}-${c.script.topology}-null`, code.replace(/^const RESISTOR_PAIR_LIMIT = 2;/m, 'const RESISTOR_PAIR_LIMIT = null;'));
					compared++;
					const free = partsProblems(off, pageParts({ ...spec, placement }));
					if (free.length) problems.push(`${c.label}: RESISTOR_PAIR_LIMIT = null is not the page's pairs where they help (${free[0]})`);
				}
			}
		}
		check('pair limit, downloadable script: RESISTOR_PAIR_LIMIT only with a limit; the parts it prints are the page\'s under N = 1, 2, 3 (on the edge and centred), its summary the page\'s, and null gives the page\'s pairs where they help', problems.length === 0 && compared === 16, problems.length ? problems.slice(0, 2).join('; ') : `${compared} runs`);
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
		// The page's parts (the part search under the same limit) leave no more
		// stages on the full grids than the plan's fewest, and the script prints
		// them, with the page's summary
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
			const page = pageParts({ ...spec, resistorPairLimit: n });
			const fellPage = page.result.stages.filter((s) => s.stockShortfall).length;
			const fellPlan = plan.stages.filter((s) => s.design.stockShortfall).length;
			if (fellPage > fellPlan) problems.push(`N=${n}: the page's parts leave ${fellPage} stages on the full grids, the plan ${fellPlan}`);
			const wrong = partsProblems(out, page);
			if (wrong.length) problems.push(`script N=${n}: ${wrong[0]}`);
			if (!out.includes(filterPairPlanSummary(page.result.pairPlan))) problems.push(`script N=${n}: the summary is not the page's`);
		}
		check(
			'pair limit, a short list: a stage the list builds with the pairs left is never shown on the full grids instead (the fewest such stages any lists give, for every N, and no more in the page\'s parts), the notes say why one is, and the script prints the page\'s parts',
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

/* ------------------------------------------------ 12. the narrow band-pass */
// The fifth filter type (narrowBand.js): one frequency picked out by one
// second-order band-pass stage, or by N identical ones, on six circuits.
// Every netlist here is solved by the checks' own nodal solver
// (lib-nodal.mjs), not by the tool's nodal.js.
{
	const { compareNarrowCircuits, designNarrowBand, narrowChainElements, narrowDefaultCircuit, narrowFigures, narrowFit, narrowIdealStages, narrowNetlistResponse, narrowShrink, narrowStability, narrowTextbook, realizeNarrow, NARROW_CIRCUITS, NARROW_GAIN_SPEED, NARROW_LABELS, NARROW_MAX_GAIN_STAGES, NARROW_REAL_GBW, NARROW_RULE } = await import('../src/lib/filter/narrowBand.js');
	const { designRlcGic, designRlcGicFromCap, designRlcGyrator, designRlcGyratorFromCap, rlcGicActual, rlcGyratorActual } = await import('../src/lib/filter/rlcBandPass.js');
	const { designSallenKeyBandPass, designSallenKeyBandPassFromCap, sallenKeyBpActual } = await import('../src/lib/filter/sallenKeyBandPass.js');
	const { designKhnBandPass, designKhnBandPassFromCap, khnBpActual } = await import('../src/lib/filter/khnBandPass.js');
	const { mfbBandPassActual } = await import('../src/lib/filter/mfbBandPass.js');
	const { designTowThomasBandPassFromCap } = await import('../src/lib/filter/towThomas.js');
	const { stageElements } = await import('../src/lib/filter/stageElements.js');
	const { nodalResponse } = await import('../src/lib/filter/nodal.js');
	const { responseAt } = await import('../src/lib/filter/bode.js');
	const { khnBpSensitivity, rlcGicSensitivity, rlcGyratorSensitivity, sallenKeyBpSensitivity } = await import('../src/lib/filter/sensitivity.js');
	const { explainNarrowBandCircuit, explainNarrowBandOrder, explainNarrowBandStage } = await import('../src/lib/filter/explain.js');
	const { filterPairGroups } = await import('../src/lib/filter/pairPlan.js');
	const { solveAt } = await import('./lib-nodal.mjs');

	const TWO_PI = 2 * Math.PI;
	const kit = LAB_KIT.resistors;
	const relErr = (a, b) => Math.hypot(a.re - b.re, a.im - b.im) / Math.hypot(b.re, b.im);
	const cDiv = (a, b) => {
		const d = b.re * b.re + b.im * b.im;
		return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
	};
	const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
	const cInv = (a) => cDiv({ re: 1, im: 0 }, a);
	/** Elements of stageElements as lib-nodal reads them, the 1 V source on vin included. */
	const forSolver = (els) => [
		{ kind: 'V', name: 'V1', a: 'vin', b: '0' },
		...els.map((e) => (e.kind === 'OP' ? { kind: 'OP', name: e.name, p: e.nodes[0], m: e.nodes[1], out: e.nodes[2] } : { kind: e.kind, name: e.name, a: e.nodes[0], b: e.nodes[1], value: e.value }))
	];
	/** V(vout) of one stage's netlist, from vin to vout, solved by lib-nodal (op-amps ideal, or the single-pole one given). */
	const netH = (stage, f, opamp = null) => solveAt(forSolver(stageElements(stage, 1, 'vin', 'vout')), f, opamp);
	/** The second-order band-pass a stage's actual figures describe: gain (omega0/Q) s / (s^2 + (omega0/Q) s + omega0^2). */
	const bandPassOf = ({ wn, q, gain }, f) => {
		const w = TWO_PI * f;
		return cDiv({ re: 0, im: (gain * wn * w) / q }, { re: wn * wn - w * w, im: (wn * w) / q });
	};
	/** The same with the gyrator's zero at wz: k (s + wz) / (...), k set by |H(j omega0)| = gain. */
	const gyratorOf = ({ wn, q, gain, wz }, f) => {
		const w = TWO_PI * f;
		const k = (gain * wn * wn) / (q * Math.hypot(wn, wz));
		return cDiv({ re: k * wz, im: k * w }, { re: wn * wn - w * w, im: (wn * w) / q });
	};
	/** The input as the tank sees it: Ra || Rb and alpha = Rb / (Ra + Rb). */
	const thevenin = ({ Ra, Rb }) => (Rb > 0 ? { R: (Ra * Rb) / (Ra + Rb), alpha: Rb / (Ra + Rb) } : { R: Ra, alpha: 1 });
	/** alpha Z / (R + Z) = alpha / (1 + R Y), Y the tank: C in parallel with the simulated inductor's Z_in. */
	const tankH = (c, zin, f) => {
		const { R, alpha } = thevenin(c);
		const y = cAdd({ re: 0, im: TWO_PI * f * c.C }, cInv(zin));
		return cDiv({ re: alpha, im: 0 }, { re: 1 + R * y.re, im: R * y.im });
	};
	/** The gyrator's input impedance: R1 (1 + s R2 Cg) / (1 + s R1 Cg). */
	const gyratorZin = ({ R1, R2, Cg }, f) => cDiv({ re: R1, im: R1 * TWO_PI * f * R2 * Cg }, { re: 1, im: TWO_PI * f * R1 * Cg });
	/** Antoniou's converter: s Cg R1 R3 R4 / R2, an exact inductor. */
	const gicZin = ({ R1, R2, R3, R4, Cg }, f) => ({ re: 0, im: (TWO_PI * f * Cg * R1 * R3 * R4) / R2 });
	/** The state-variable band-pass as its own equations write it, for any parts. */
	const khnH = ({ R1, R2, R3, R4, R5, R6, R7, C1, C2 }, f) => {
		const w = TWO_PI * f;
		const a2 = (R1 * R2 * R4 * C1 * C2) / R7;
		const a1 = ((R2 * C2) / (1 + R5 / R6)) * (1 + R4 / R3 + R4 / R7);
		return cDiv({ re: 0, im: ((R2 * R4 * C2) / R3) * w }, { re: 1 - a2 * w * w, im: a1 * w });
	};
	/** What the circuit's own equations give for a built stage, independent of its designer. */
	const ownEquations = (d, f) => {
		const c = d.components;
		if (d.topology === 'rlcGyrator') return tankH(c, gyratorZin(c, f), f);
		if (d.topology === 'rlcGic') return tankH(c, gicZin(c, f), f);
		if (d.topology === 'khnBp') return khnH(c, f);
		return null;
	};
	/** A stage's Q from its parts, for finite differences. */
	const Q_OF = {
		rlcGyrator: (c) => rlcGyratorActual(c).q,
		rlcGic: (c) => rlcGicActual(c).q,
		sallenKeyBp: (c) => sallenKeyBpActual(c).q,
		khnBp: (c) => khnBpActual(c).q,
		mfbBp: (c) => mfbBandPassActual(c).q,
		towThomasBp: (c) => c.Rd * Math.sqrt(c.C1 / (c.C2 * c.Ra * c.Rb))
	};
	const SENSITIVITY = { rlcGyrator: rlcGyratorSensitivity, rlcGic: rlcGicSensitivity, sallenKeyBp: sallenKeyBpSensitivity, khnBp: khnBpSensitivity };
	/** S^Q_x = x dQ / (Q dx) of every part, by central differences. */
	const numericSensitivity = (topology, c) =>
		Object.fromEntries(
			Object.keys(c)
				.filter((k) => Number.isFinite(c[k]) && c[k] > 0 && Q_OF[topology]({ ...c, [k]: c[k] * 1.000001 }) !== Q_OF[topology](c))
				.map((k) => [k, Math.log(Q_OF[topology]({ ...c, [k]: c[k] * (1 + 1e-6) }) / Q_OF[topology]({ ...c, [k]: c[k] * (1 - 1e-6) })) / Math.log((1 + 1e-6) / (1 - 1e-6))])
		);
	/**
	 * The peak of |H| near f0, its -3 dB edges, B and Q, and the gain signed
	 * by H at the peak: a fine log grid from f0/span to span f0 (4 unless
	 * given), golden section on the peak, bisection on the edges. Written
	 * apart from narrowFigures.
	 */
	const measure = (H, f0, points = 1600, span = 4) => {
		const mag = (f) => Math.hypot(H(f).re, H(f).im);
		let best = 0;
		let bestI = 0;
		const at = (i) => (f0 / span) * (span * span) ** (i / points);
		for (let i = 0; i <= points; i++) {
			const m = mag(at(i));
			if (m > best) {
				best = m;
				bestI = i;
			}
		}
		let a = Math.log(at(Math.max(0, bestI - 1)));
		let b = Math.log(at(Math.min(points, bestI + 1)));
		for (let k = 0; k < 80; k++) {
			const m1 = a + (b - a) / 3;
			const m2 = b - (b - a) / 3;
			if (mag(Math.exp(m1)) > mag(Math.exp(m2))) b = m2;
			else a = m1;
		}
		const fp = Math.exp((a + b) / 2);
		const peak = mag(fp);
		const edge = (outer) => {
			let x = Math.log(fp);
			let y = Math.log(outer);
			if (mag(outer) > peak / Math.SQRT2) return null;
			for (let k = 0; k < 60; k++) {
				const m = (x + y) / 2;
				if (mag(Math.exp(m)) > peak / Math.SQRT2) x = m;
				else y = m;
			}
			return Math.exp((x + y) / 2);
		};
		const f1 = edge(fp / 1000);
		const f2 = edge(fp * 1000);
		return { f0: fp, gain: Math.sign(H(fp).re) * peak, f1, f2, q: f1 && f2 ? fp / (f2 - f1) : null };
	};
	const pc = (x, d = 2) => `${(100 * x).toFixed(d)} %`;

	// (a) The four new stage designers (the RLC with a gyrator or with
	// Antoniou's GIC for its inductor, the Sallen-Key band-pass and the state
	// variable circuit), automatic and from capacitors chosen by hand, over
	// f0, Q and gain on four stocks. Every built stage's netlist, solved by
	// lib-nodal, is the response its actual figures describe (a band-pass of
	// that f0, Q and centre gain, positive; the gyrator's with its zero), the
	// circuit's own equations (the RLC tank with the gyrator's exact Z_in or
	// the GIC's s Cg R1 R3 R4 / R2; the state-variable transfer function),
	// what bode.js plots, and what nodal.js solves, with an ideal and with a
	// single-pole op-amp. On E24 and E96 each lands within the rounding of
	// its targets; capacitors chosen by hand are used as given, and the
	// automatic ones entered by hand give the same stage.
	const DESIGNERS = {
		rlcGyrator: { auto: designRlcGyrator, byHand: designRlcGyratorFromCap, cap: (d) => d.components.C, capsUsed: (d) => [d.components.C, d.components.Cg] },
		rlcGic: { auto: designRlcGic, byHand: designRlcGicFromCap, cap: (d) => d.components.C, capsUsed: (d) => [d.components.C, d.components.Cg] },
		sallenKeyBp: { auto: designSallenKeyBandPass, byHand: designSallenKeyBandPassFromCap, cap: (d) => d.components.C1, capsUsed: (d) => [d.components.C1, d.components.C2] },
		khnBp: { auto: designKhnBandPass, byHand: designKhnBandPassFromCap, cap: (d) => d.components.C1, capsUsed: (d) => [d.components.C1, d.components.C2] }
	};
	const STOCKS = { E24: PAIR_STOCKS.E24, E96: PAIR_STOCKS.E96, kit: PAIR_STOCKS.lab, kitPairs: { ...PAIR_STOCKS.lab, pairs: true } };
	const NARROW_F0 = [50, 1000, 10000, 49000, 200000];
	const NARROW_Q = [0.7071, 2, 5, 10, 20];
	const NARROW_GAIN = [0.4, 1, 2.03];
	/** Every new designer over the grid, automatic and by hand, as [label, design] rows. */
	const sweepNarrow = (opts) => {
		const rows = [];
		for (const [topology, { auto, byHand, cap }] of Object.entries(DESIGNERS)) {
			for (const f0 of NARROW_F0) {
				for (const q of NARROW_Q) {
					for (const gain of NARROW_GAIN) {
						const at = `${f0} Hz Q ${q} gain ${gain}`;
						const wn = TWO_PI * f0;
						const d = auto(wn, q, { ...opts, gain });
						rows.push([`${topology} ${at}`, d]);
						if (!d) continue;
						rows.push([`${topology} by hand ${at}`, byHand(wn, q, cap(d) * 2.2, { ...opts, gain })]);
						rows.push([`${topology} by hand, its own capacitor ${at}`, byHand(wn, q, cap(d), { ...opts, gain })]);
					}
				}
			}
		}
		return rows;
	};
	// taken when the designers were added; a deliberate change to one moves them: rerun and update them.
	// Moved once: the state-variable designer rounds its gain as the ratio R3/R0 (ratioPair), not R3 alone
	const NARROW_DESIGNERS_BEFORE = { E24: 'e703c7c9347ed3fd', E96: '0cfa0869ce9b02e6', kit: '359158c0d60caa27', kitPairs: '2a6cd65d8098b4a2' };
	/** The designs as text, every number at any depth to nine digits (a last-bit difference in Math.log cannot show). */
	const narrowPrint = (rows) => createHash('sha256').update(rows.map((row) => JSON.stringify(row, (k, v) => (typeof v === 'number' ? Number(v.toPrecision(9)) : v))).join('\n')).digest('hex').slice(0, 16);
	const opampAt = { aol: Infinity, gbw: NARROW_REAL_GBW };
	for (const [name, opts] of Object.entries(STOCKS)) {
		const rows = sweepNarrow(opts);
		const built = rows.filter(([, d]) => d && d.components && d.ok !== false);
		const wrong = [];
		const off = [];
		const notGiven = [];
		let worst = { model: 0, own: 0, bode: 0, nodal: 0, single: 0 };
		const land = { f0: 0, q: 0, gain: 0 };
		for (const [label, d] of built) {
			const wn = d.steps.wn;
			const f0 = wn / TWO_PI;
			const freqs = [f0 / 10, f0 / 2, f0 / 1.1, f0, d.actual.wn / TWO_PI, f0 * 1.1, 2 * f0, 10 * f0];
			for (const f of freqs) {
				const h = netH(d, f);
				const model = d.topology === 'rlcGyrator' ? gyratorOf(d.actual, f) : bandPassOf(d.actual, f);
				const own = ownEquations(d, f);
				const single = netH(d, f, opampAt);
				worst = {
					model: Math.max(worst.model, relErr(h, model)),
					own: Math.max(worst.own, own ? relErr(h, own) : 0),
					bode: Math.max(worst.bode, relErr(h, responseAt([d], f))),
					nodal: Math.max(worst.nodal, relErr(nodalResponse(stageElements(d, 1, 'vin', 'vout'), f), h)),
					single: Math.max(worst.single, relErr(nodalResponse(stageElements(d, 1, 'vin', 'vout'), f, { gbw: NARROW_REAL_GBW }), single))
				};
			}
			// non-inverting: H at its own f0 is the positive centre gain
			const top = netH(d, d.actual.wn / TWO_PI);
			if (!(top.re > 0 && Math.abs(Math.hypot(top.re, top.im) / d.actual.gain - 1) < 1e-9)) wrong.push(`${label}: H(j omega0) = ${top.re.toFixed(4)} ${top.im >= 0 ? '+' : '-'} j ${Math.abs(top.im).toFixed(4)} against ${d.actual.gain}`);
			if (/by hand/.test(label)) {
				const given = /its own capacitor/.test(label) ? null : d.steps.C;
				if (!(d.ok && d.manual && DESIGNERS[d.topology].capsUsed(d).every((v) => v === d.steps.C))) notGiven.push(`${label}: ${JSON.stringify(DESIGNERS[d.topology].capsUsed(d))}`);
				if (given === null) {
					const auto = built.find(([l]) => l === label.replace(' by hand, its own capacitor', ''));
					if (!opts.pairs && auto && JSON.stringify(auto[1].components) !== JSON.stringify(d.components)) notGiven.push(`${label}: not the automatic stage`);
				}
				continue;
			}
			const q = d.steps.q;
			const gain = d.steps.gainTarget;
			const ef = Math.abs(d.actual.wn / wn - 1);
			const eq = Math.abs(d.actual.q / q - 1);
			// the gain is the circuit's own unless the design sets it: the state-variable stage, an input divider
			const eg = d.topology === 'khnBp' || d.steps.divider ? Math.abs(d.actual.gain / gain - 1) : 0;
			land.f0 = Math.max(land.f0, ef);
			land.q = Math.max(land.q, eq);
			land.gain = Math.max(land.gain, eg);
			// the Sallen-Key's Q follows K - 1 some 2 sqrt(2) Q - 1 times over: held to its own 25 % limit on E24
			const sk = d.topology === 'sallenKeyBp' && name === 'E24';
			const lim = name === 'E24' ? { f0: 0.025, q: sk ? 0.25 : 0.04, gain: sk ? 0.25 : 0.05 } : name === 'E96' ? { f0: 0.01, q: 0.015, gain: 0.025 } : null;
			if (lim && (ef > lim.f0 || eq > lim.q || eg > lim.gain)) off.push(`${label}: f0 ${pc(ef)}, Q ${pc(eq)}, gain ${pc(eg)}`);
		}
		const print = narrowPrint(rows);
		const solved = worst.model < 1e-9 && worst.own < 1e-9 && worst.bode < 1e-9 && worst.nodal < 1e-9 && worst.single < 1e-9;
		check(
			`narrow band-pass designers, ${name}: ${built.length} of ${rows.length} stages built, each netlist the response of its actual figures, of its own equations, of bode.js and of nodal.js (ideal and single-pole), non-inverting${STOCKS[name].resistorSeries === 'E24' || STOCKS[name].resistorSeries === 'E96' ? ', on target within the rounding' : ''}, capacitors by hand as given, all as pinned`,
			solved && wrong.length === 0 && off.length === 0 && notGiven.length === 0 && print === NARROW_DESIGNERS_BEFORE[name],
			[
				wrong[0],
				off[0],
				notGiven[0],
				solved ? null : `worst against its figures ${worst.model.toExponential(1)}, its equations ${worst.own.toExponential(1)}, bode ${worst.bode.toExponential(1)}, nodal.js ${worst.nodal.toExponential(1)}, single pole ${worst.single.toExponential(1)}`,
				`worst f0 ${pc(land.f0)}, Q ${pc(land.q)}, set gain ${pc(land.gain)}; ${print}, expected ${NARROW_DESIGNERS_BEFORE[name]}`
			]
				.filter(Boolean)
				.join('; ')
		);
	}

	// The two simulated inductors on their own, a series resistor Rs from vin
	// to the port: Z = Rs V / (1 - V) at the port is the gyrator's
	// R1 (1 + s R2 Cg) / (1 + s R1 Cg) and the GIC's s Cg R1 R3 R4 / R2
	{
		const Rs = 1000;
		const portZ = (els, f) => {
			const v = solveAt(forSolver([{ kind: 'R', name: 'Rs', nodes: ['vin', 'vout'], value: Rs }, ...els]), f);
			return cDiv({ re: Rs * v.re, im: Rs * v.im }, { re: 1 - v.re, im: -v.im });
		};
		let worst = 0;
		for (const [R1, R2, R3, R4, Cg] of [[50, 50660, 1500, 1800, 1e-8], [330, 1.2e6, 10000, 4700, 2.2e-9], [1000, 82000, 2200, 22000, 4.7e-7]]) {
			const gyr = [
				{ kind: 'R', name: 'R1', nodes: ['vout', 'o'], value: R1 },
				{ kind: 'C', name: 'Cg', nodes: ['vout', 'x'], value: Cg },
				{ kind: 'R', name: 'R2', nodes: ['x', '0'], value: R2 },
				{ kind: 'OP', name: 'Ug', nodes: ['x', 'o', 'o'] }
			];
			const gic = [
				{ kind: 'R', name: 'R1', nodes: ['vout', 'a'], value: R1 * 10 },
				{ kind: 'R', name: 'R2', nodes: ['a', 'b'], value: R2 / 10 },
				{ kind: 'R', name: 'R3', nodes: ['b', 'd'], value: R3 },
				{ kind: 'C', name: 'Cg', nodes: ['d', 'e'], value: Cg },
				{ kind: 'R', name: 'R4', nodes: ['e', '0'], value: R4 },
				{ kind: 'OP', name: 'U1', nodes: ['vout', 'b', 'd'] },
				{ kind: 'OP', name: 'U2', nodes: ['e', 'b', 'a'] }
			];
			for (const f of [10, 300, 3000, 10000, 100000]) {
				worst = Math.max(worst, relErr(portZ(gyr, f), gyratorZin({ R1, R2, Cg }, f)), relErr(portZ(gic, f), gicZin({ R1: R1 * 10, R2: R2 / 10, R3, R4, Cg }, f)));
			}
		}
		check("simulated inductors: the gyrator's port is R1 (1 + s R2 Cg) / (1 + s R1 Cg) and the GIC's s Cg R1 R3 R4 / R2, by nodal analysis", worst < 1e-9, `worst ${worst.toExponential(1)}`);
	}

	// Q's sensitivity to each part (sensitivity.js) against central
	// differences of the stage's own Q, on the stages built above for E24
	{
		let worst = 0;
		let compared = 0;
		let where = '';
		for (const [, d] of sweepNarrow(STOCKS.E24).filter(([l, x]) => x && x.components && !/by hand/.test(l))) {
			const formula = SENSITIVITY[d.topology](d.components);
			const numeric = numericSensitivity(d.topology, d.components);
			for (const k of new Set([...Object.keys(formula), ...Object.keys(numeric)])) {
				compared++;
				const e = Math.abs((formula[k] ?? 0) - (numeric[k] ?? 0));
				if (e > worst) {
					worst = e;
					where = `${d.topology} ${k}: ${formula[k]} against ${numeric[k]}`;
				}
			}
		}
		check('narrow band-pass sensitivities: every S^Q of the four new stages equals a central difference of its Q', worst < 1e-5 && compared > 1000, `${compared} parts, worst ${worst.toExponential(1)}${worst >= 1e-5 ? ` at ${where}` : ''}`);
	}

	// (b) The textbook numbers at f0 = 10 kHz, Q = 5, C = 10 nF, and what
	// nodal analysis makes of them: the plain RLC (L = 25.33 mH, R = Q
	// sqrt(L/C) = 7.958 kOhm, through a GIC set to that L), the gyrator at R1 =
	// 50 Ohm, R2 = 50.66 kOhm (its exact Z_in loses 2 to 3 dB, moves the peak up
	// and lowers Q), the equal-part Sallen-Key (R = 2.251 kOhm, K_a = 3.717,
	// centre gain K_a/(4 - K_a) = 2 sqrt(2) Q - 1 = 13.14, S^Q_K the same), the
	// two-resistor multiple feedback form (159.2 Ohm and 15.92 kOhm, centre gain
	// -2Q^2 = -50), the state-variable circuit at unity gain (7.958 kOhm and
	// 318.3 Ohm) and with the design rule R3 = Q R0 / K, R5/R6 = 2Q + K - 1 for
	// several K and Q, its low-pass and high-pass outputs where they belong,
	// and the Tow-Thomas (R = 1.592 kOhm, Rd = R1 = 7.958 kOhm).
	{
		const w0 = TWO_PI * 10000;
		const C = 1e-8;
		const tb = narrowTextbook(w0, 5, C);
		const near = (a, b, tol) => Math.abs(a / b - 1) <= tol;
		const problems = [];
		const want = [
			['L', tb.rlc.L, 0.025330],
			['R', tb.rlc.R, 7957.7],
			['gyrator R1', tb.gyrator.R1, 50],
			['gyrator R2', tb.gyrator.R2, 50660],
			['Sallen-Key R', tb.sallenKey.R, 2250.8],
			['Sallen-Key K', tb.sallenKey.K, 3.7172],
			['Sallen-Key centre gain', tb.sallenKey.ownGain, 13.142],
			['Sallen-Key S^Q_K', tb.sallenKey.sensitivityK, 13.142],
			['MFB R1', tb.mfbTwoResistor.R1, 159.15],
			['MFB R3', tb.mfbTwoResistor.R3, 15915],
			['MFB gain', tb.mfbTwoResistor.gain, -50],
			['KHN R1', tb.khnRatio.R1, 7957.7],
			['KHN R2', tb.khnRatio.R2, 318.31],
			['Tow-Thomas R', tb.towThomas.R, 1591.5],
			['Tow-Thomas Rd', tb.towThomas.Rd, 7957.7],
			['Tow-Thomas R1', tb.towThomas.R1, 7957.7]
		];
		for (const [label, got, expected] of want) if (!near(got, expected, 2e-4)) problems.push(`${label} ${got} against ${expected}`);
		const tt = designTowThomasBandPassFromCap(w0, 5, C).theoretical;
		if (!(near(tt.Ra, 1591.5, 2e-4) && near(tt.Rd, 7957.7, 2e-4) && near(tt.R1, 7957.7, 2e-4))) problems.push(`Tow-Thomas designer ${JSON.stringify(tt)}`);
		const fig = (stage) => measure((f) => netH(stage, f), 10000);
		const X = 1 / (w0 * C);
		// the plain RLC: a GIC of four equal resistors X is L = X / omega0 exactly
		const rlc = fig({ topology: 'rlcGic', components: { Ra: tb.rlc.R, C, R1: X, R2: X, R3: X, R4: X, Cg: C } });
		if (!(near(rlc.f0, 10000, 1e-6) && near(rlc.q, 5, 1e-6) && near(rlc.gain, 1, 1e-9))) problems.push(`RLC ${JSON.stringify(rlc)}`);
		// the gyrator at the textbook values
		const gy = fig({ topology: 'rlcGyrator', components: { Ra: tb.rlc.R, C, R1: 50, R2: tb.gyrator.R2, Cg: C } });
		const gyDb = 20 * Math.log10(gy.gain);
		if (!(gyDb < -2 && gyDb > -3 && gy.f0 > 10000 && gy.f0 < 10100 && gy.q < 4.2 && gy.q > 3.4)) problems.push(`textbook gyrator ${gyDb.toFixed(2)} dB at ${gy.f0.toFixed(1)} Hz, Q ${gy.q?.toFixed(3)}`);
		// the equal-part Sallen-Key
		const R = tb.sallenKey.R;
		const sk = { topology: 'sallenKeyBp', components: { Ra: R, C1: C, C2: C, R2: R, R3: R, Rg: 1000, Rf: (tb.sallenKey.K - 1) * 1000 } };
		const skFig = fig(sk);
		const skS = sallenKeyBpSensitivity(sk.components);
		const K = tb.sallenKey.K;
		if (!(near(skFig.f0, 10000, 1e-6) && near(skFig.q, 5, 1e-6) && near(skFig.gain, K / (4 - K), 1e-9) && near(skS.Rf, (K - 1) / (4 - K), 1e-9))) problems.push(`Sallen-Key ${JSON.stringify(skFig)}, S_Rf ${skS.Rf}`);
		// the two-resistor multiple feedback form: no resistor to ground
		const mfb = fig({ topology: 'mfbBp', components: { R1: tb.mfbTwoResistor.R1, R2: Infinity, R3: tb.mfbTwoResistor.R3, C1: C, C2: C } });
		if (!(near(mfb.f0, 10000, 1e-6) && near(mfb.q, 5, 1e-6) && near(mfb.gain, -50, 1e-9))) problems.push(`MFB two-resistor ${JSON.stringify(mfb)}`);
		// the state-variable circuit: unity gain from the integrators, then the design rule
		const khnUnity = fig({ topology: 'khnBp', components: { R1: tb.khnRatio.R1, R2: tb.khnRatio.R2, R3: 1e4, R4: 1e4, R5: 2e4, R6: 1e4, R7: 1e4, C1: C, C2: C } });
		if (!(near(khnUnity.f0, 10000, 1e-6) && near(khnUnity.q, 5, 1e-6) && near(khnUnity.gain, 1, 1e-9))) problems.push(`KHN unity ${JSON.stringify(khnUnity)}`);
		let rules = 0;
		for (const k of [0.5, 1, 4]) {
			for (const qq of [2, 5, 20]) {
				const c = { R1: X, R2: X, R3: (qq * 1e4) / k, R4: 1e4, R5: (2 * qq + k - 1) * 1e4, R6: 1e4, R7: 1e4, C1: C, C2: C };
				const r = fig({ topology: 'khnBp', components: c });
				rules++;
				if (!(near(r.f0, 10000, 1e-6) && near(r.q, qq, 1e-6) && near(r.gain, k, 1e-9))) problems.push(`KHN rule K ${k} Q ${qq}: ${JSON.stringify(r)}`);
			}
		}
		// its outputs: the summer's (s1hp) passes high frequencies, the second integrator's (s1lp) low ones
		const khn = { topology: 'khnBp', components: { R1: X, R2: X, R3: 5e4, R4: 1e4, R5: 1e5, R6: 1e4, R7: 1e4, C1: C, C2: C } };
		const out = (node, f) => Math.hypot(nodalResponse(stageElements(khn, 1, 'vin', 'vout'), f, { output: node }).re, nodalResponse(stageElements(khn, 1, 'vin', 'vout'), f, { output: node }).im);
		if (!(out('s1lp', 100) > 100 * out('s1lp', 1e6) && out('s1hp', 1e6) > 100 * out('s1hp', 100))) problems.push('KHN low-pass and high-pass outputs swapped');
		check(
			'narrow band-pass, the textbook numbers at 10 kHz, Q 5, 10 nF and nodal analysis of each circuit: L 25.33 mH and R 7.958 kOhm, the gyrator at 50 Ohm and 50.66 kOhm 2 to 3 dB short, the Sallen-Key at 2.251 kOhm and K = 3.717 with centre gain 13.14, the two-resistor MFB at -50, the state-variable rule for nine K and Q, the Tow-Thomas',
			problems.length === 0 && rules === 9,
			problems.length ? problems.slice(0, 3).join('; ') : `textbook gyrator ${gyDb.toFixed(2)} dB at ${gy.f0.toFixed(1)} Hz, Q ${gy.q.toFixed(3)}`
		);
	}

	// (c) N identical stages: each takes Q_s = Q sqrt(2^(1/N) - 1) and K^(1/N),
	// all on f0, and the chain of the ideal stages (narrowIdealStages through
	// bode.js) is K at f0, 3.0103 dB down at f1 and f2 with f1 f2 = f0^2 and
	// f2 - f1 = B, falls 20 N dB per decade far from f0, and narrowFigures
	// reads it so. The spec by B is the spec by Q; a figure out of range is
	// refused.
	{
		const problems = [];
		let designs = 0;
		for (const f0 of [1000, 10000]) {
			for (const q of [0.7, 5, 30]) {
				for (const gain of [0.5, 1, 8]) {
					for (let n = 1; n <= 6; n++) {
						const d = designNarrowBand({ f0, q, gain, stages: n });
						designs++;
						const where = `f0 ${f0} Q ${q} K ${gain} N ${n}`;
						const shrink = Math.sqrt(2 ** (1 / n) - 1);
						const sameStages = d.stages.length === n && d.stages.every((s, i) => s.index === i && s.wn === TWO_PI * f0 && Math.abs(s.q / (q * shrink) - 1) < 1e-12 && Math.abs(s.gain / gain ** (1 / n) - 1) < 1e-12 && s.filterType === 'bandpass' && s.order === 2);
						if (!sameStages || Math.abs(narrowShrink(n) / shrink - 1) > 1e-12 || Math.abs(d.B - f0 / q) > 1e-9 * f0) problems.push(`${where}: stages`);
						if (Math.abs((d.f1 * d.f2) / (f0 * f0) - 1) > 1e-12 || Math.abs((d.f2 - d.f1) / d.B - 1) > 1e-12 || d.skirtDbPerDecade !== -20 * n) problems.push(`${where}: edges ${d.f1} ${d.f2}`);
						const ideal = narrowIdealStages(d);
						const db = (f) => magnitudePhaseAt(ideal, f).db;
						const k = 20 * Math.log10(gain);
						if (Math.abs(db(f0) - k) > 1e-9 || Math.abs(db(d.f1) - k + 10 * Math.log10(2)) > 1e-9 || Math.abs(db(d.f2) - k + 10 * Math.log10(2)) > 1e-9 || !(db(f0 * 1.001) < db(f0) && db(f0 / 1.001) < db(f0))) problems.push(`${where}: ${db(f0).toFixed(4)} dB at f0, ${(db(f0) - db(d.f1)).toFixed(5)} dB down at f1`);
						// far from f0, on the complex response (the dB of bode.js stops at -240 dB)
						const far = (f) => 20 * Math.log10(Math.hypot(responseAt(ideal, f).re, responseAt(ideal, f).im));
						const slope = far(f0 * 1e3) - far(f0 * 1e4);
						const slopeLow = far(f0 / 1e4) - far(f0 / 1e3);
						if (Math.abs(slope - 20 * n) > 1e-3 || Math.abs(slopeLow + 20 * n) > 1e-3) problems.push(`${where}: skirts ${slope.toFixed(3)} and ${slopeLow.toFixed(3)} dB per decade`);
						const fig = narrowFigures((f) => responseAt(ideal, f), f0);
						if (Math.abs(fig.f0 / f0 - 1) > 1e-6 || Math.abs(fig.q / q - 1) > 1e-6 || Math.abs(fig.gain / gain - 1) > 1e-9 || Math.abs(fig.f1 / d.f1 - 1) > 1e-6 || Math.abs(fig.f2 / d.f2 - 1) > 1e-6) problems.push(`${where}: narrowFigures ${JSON.stringify(fig)}`);
					}
				}
			}
		}
		const byB = designNarrowBand({ f0: 10000, bandwidth: 2000, gain: 1, stages: 2 });
		const byQ = designNarrowBand({ f0: 10000, q: 5, gain: 1, stages: 2 });
		if (byB.by !== 'b' || byQ.by !== 'q' || JSON.stringify({ ...byB, by: 'q' }) !== JSON.stringify(byQ)) problems.push('the spec by B is not the spec by Q');
		const refused = [{ f0: 10000, q: 5, stages: 0 }, { f0: 10000, q: 5, stages: 7 }, { f0: 10000, q: 5, stages: 2.5 }, { f0: -1, q: 5 }, { f0: 10000, q: 0 }, { f0: 10000 }, { f0: 10000, q: 5, gain: 0 }, { f0: NaN, q: 5 }].filter((s) => designNarrowBand(s) !== null);
		if (refused.length) problems.push(`not refused: ${JSON.stringify(refused[0])}`);
		check(
			`N identical stages: ${designs} designs, Q_s = Q sqrt(2^(1/N) - 1) and K^(1/N) each, the chain K at f0 and 3.0103 dB down at f1 and f2 (f1 f2 = f0^2, f2 - f1 = B), skirts of 20 N dB per decade, read back by narrowFigures; B gives the design Q does; out-of-range figures refused`,
			problems.length === 0,
			problems.slice(0, 3).join('; ')
		);
	}

	// (d) The comparison table and its rule (compareNarrowCircuits,
	// narrowDefaultCircuit), on the reference spec and others, each row
	// checked from the chain it built: the op-amps and parts counted from its
	// netlist, its spread, the figures with ideal op-amps measured on bode.js
	// and on a single-pole op-amp of the TL082's 3.45 MHz measured on the
	// whole chain's netlist solved by lib-nodal (not stage by stage), its
	// worst Q sensitivity by central differences, whether it qualifies under
	// NARROW_RULE (both sets of figures within |error| <= limit, no
	// oscillation on the TL082, whose poles section (d4) checks apart), and
	// the circuit the rule picks. At the reference spec (10 kHz, Q 5, K 1,
	// one stage, E24) the multiple feedback band-pass, one op-amp, is the
	// default.
	{
		const OPAMPS = { rlcGyrator: (s) => (s.buffered === false ? 1 : 2), rlcGic: (s) => (s.buffered === false ? 2 : 3), sallenKeyBp: () => 1, mfbBp: () => 1, khnBp: () => 3, towThomasBp: () => 3, gainNonInv: () => 1 };
		const cases = [
			['reference, E24', { f0: 10000, q: 5, gain: 1, stages: 1 }, PAIR_STOCKS.E24],
			['reference, MFB built for the TL082', { f0: 10000, q: 5, gain: 1, stages: 1 }, { ...PAIR_STOCKS.E24, gbw: OPAMP_GBW.TL082 }],
			['K 4 over two stages, E24', { f0: 10000, q: 5, gain: 4, stages: 2 }, PAIR_STOCKS.E24],
			['B 500 Hz, K 0.3, the kit with pairs', { f0: 3000, bandwidth: 500, gain: 0.3, stages: 1 }, { ...PAIR_STOCKS.lab, pairs: true }],
			['Q 20 at 1 kHz, K 10, E96', { f0: 1000, q: 20, gain: 10, stages: 1 }, PAIR_STOCKS.E96],
			['Q 10 at 100 kHz, E24 (none qualifies)', { f0: 100000, q: 10, gain: 1, stages: 1 }, PAIR_STOCKS.E24]
		];
		const problems = [];
		const table = [];
		let rowsChecked = 0;
		for (const [label, spec, opts] of cases) {
			const d = designNarrowBand(spec);
			const rows = compareNarrowCircuits(d, opts);
			if (rows.map((r) => r.circuit).join() !== NARROW_CIRCUITS.join()) problems.push(`${label}: rows ${rows.map((r) => r.circuit)}`);
			const mine = [];
			for (const r of rows) {
				if (!r.ok) {
					if (!(typeof r.why === 'string' && r.why.length && r.qualifies === false)) problems.push(`${label} ${r.circuit}: refused without a reason`);
					continue;
				}
				rowsChecked++;
				const at = `${label} ${r.circuit}`;
				const st = r.realized.stages;
				const els = narrowChainElements(st);
				const opamps = els.filter((e) => e.kind === 'OP').length;
				const counted = st.reduce((n, s) => n + OPAMPS[s.topology](s), 0);
				const values = (kind) => els.filter((e) => e.kind === kind).map((e) => e.value);
				const ratio = (v) => Math.max(...v) / Math.min(...v);
				if (opamps !== r.opamps || counted !== r.opamps || r.parts.resistors !== values('R').length || r.parts.capacitors !== values('C').length || r.parts.total !== els.length - opamps || Math.abs(r.spread.resistors / ratio(values('R')) - 1) > 1e-12) problems.push(`${at}: counts ${r.opamps} op-amps (${opamps}, ${counted}), ${JSON.stringify(r.parts)}`);
				// identical stages, the gain stages last when there are any, an RLC tank before them unbuffered
				const res = r.realized.resonators;
				const gs = r.realized.gainStages;
				if (res.length !== d.n || !res.every((s) => JSON.stringify(s.components) === JSON.stringify(res[0].components))) problems.push(`${at}: stages not identical`);
				if (gs.length && (gs.some((g, k) => st[st.length - gs.length + k] !== g || g.topology !== 'gainNonInv') || r.realized.gainStage !== gs[0] || (/^rlc/.test(r.circuit) && st[st.length - gs.length - 1].buffered !== false))) problems.push(`${at}: gain stages`);
				// the figures, measured apart
				const ideal = measure((f) => responseAt(st, f), d.f0);
				const all = forSolver(els);
				const real = measure((f) => solveAt(all, f, { aol: Infinity, gbw: NARROW_REAL_GBW }), d.f0, 800);
				const same = (a, b) => Math.abs(a.f0 / b.f0 - 1) < 2e-6 && Math.abs(a.q / b.q - 1) < 2e-5 && Math.abs(a.gain / b.gain - 1) < 1e-6;
				if (!same(ideal, r.ideal.figures)) problems.push(`${at}: ideal figures ${JSON.stringify(r.ideal.figures)} against ${JSON.stringify(ideal)}`);
				if (!same(real, r.real.figures)) problems.push(`${at}: real figures ${JSON.stringify(r.real.figures)} against ${JSON.stringify(real)}`);
				// the worst part for Q
				const numeric = numericSensitivity(res[0].topology, res[0].components);
				const worst = Object.entries(numeric).reduce((w, [part, v]) => (w === null || Math.abs(v) > Math.abs(w.value) ? { part, value: v } : w), null);
				// a tie (R5 and R6 of the state-variable circuit) may name either part
				const named = r.sensitivity.worst;
				if (!(worst && Math.abs(Math.abs(named.value) - Math.abs(worst.value)) < 1e-5 && Math.abs(numeric[named.part] - named.value) < 1e-5)) problems.push(`${at}: worst part ${JSON.stringify(named)} against ${JSON.stringify(worst)}`);
				// the rule, applied to the figures measured here: |error| within each limit, from the parts and on the TL082
				const errOf = (m) => ({ f0: m.f0 / d.f0 - 1, q: m.q / d.q - 1, gain: Math.abs(m.gain) / d.gain - 1 });
				const fitOf = (e) => Math.max(Math.abs(e.f0) / (NARROW_RULE.f0Share / d.q), Math.abs(e.q) / NARROW_RULE.qTolerance, Math.abs(e.gain) / NARROW_RULE.gainTolerance);
				const oscillates = Boolean(r.stability?.oscillates);
				const fit = Math.max(fitOf(errOf(ideal)), oscillates ? Infinity : fitOf(errOf(real)));
				const qualifies = fit <= 1 && !oscillates && Math.abs(worst.value) <= NARROW_RULE.sensitivityMax;
				if (qualifies !== r.qualifies || (qualifies && r.reasons.length) || (!qualifies && !r.reasons.length) || (Number.isFinite(fit) ? Math.abs(fit / r.fit.rule - 1) > 1e-4 : r.fit.rule !== Infinity)) problems.push(`${at}: qualifies ${r.qualifies} (${r.reasons.join(', ')}), measured ${qualifies}, fit ${fit} against ${r.fit.rule}`);
				mine.push({ circuit: r.circuit, qualifies, oscillates, opamps, fit, parts: els.length - opamps });
			}
			// the rule's pick: the fewest op-amps among those that qualify, then the closest, then fewer parts; else the closest that does not oscillate
			const steady = mine.filter((m) => !m.oscillates);
			const pool = mine.some((m) => m.qualifies) ? mine.filter((m) => m.qualifies) : steady.length ? steady : mine;
			const pick = [...pool].sort((a, b) => (mine.some((m) => m.qualifies) ? a.opamps - b.opamps : 0) || a.fit - b.fit || a.parts - b.parts)[0]?.circuit ?? null;
			const chosen = narrowDefaultCircuit(rows);
			if (chosen !== pick) problems.push(`${label}: default ${chosen}, the rule gives ${pick}`);
			table.push(`${label}: ${chosen} (${mine.filter((m) => m.qualifies).map((m) => m.circuit).join(', ') || 'none'} qualify)`);
		}
		const reference = compareNarrowCircuits(designNarrowBand({ f0: 10000, q: 5, gain: 1, stages: 1 }), PAIR_STOCKS.E24);
		check(
			`narrow band-pass comparison: ${rowsChecked} rows over ${cases.length} specs, each counted from its netlist, its figures measured on bode.js and on its whole netlist with the single-pole TL082, its worst Q sensitivity, its verdict and the default as the rule says; the reference spec builds all six and defaults to the multiple feedback band-pass`,
			problems.length === 0 && reference.every((r) => r.ok) && narrowDefaultCircuit(reference) === 'mfbBp',
			problems.length ? problems.slice(0, 3).join('; ') : table.join('; ')
		);
	}

	// (d3) Where the op-amp moves the peak far (a slow op-amp against f0 Q),
	// the table's figures are still those of the true peak: its f0, its
	// gain and its Q, measured here from f0/10 to 10 f0
	{
		const problems = [];
		const shown = [];
		for (const [label, spec, opts] of [
			['Q 10 at 100 kHz, E24', { f0: 100000, q: 10, gain: 1, stages: 1 }, PAIR_STOCKS.E24],
			['Q 10 at 100 kHz, the kit with pairs', { f0: 100000, q: 10, gain: 1, stages: 1 }, { ...PAIR_STOCKS.lab, pairs: true }],
			['Q 5 at 200 kHz, E24', { f0: 200000, q: 5, gain: 1, stages: 1 }, PAIR_STOCKS.E24]
		]) {
			const d = designNarrowBand(spec);
			for (const r of compareNarrowCircuits(d, opts).filter((x) => x.ok)) {
				const H = narrowNetlistResponse(r.realized.stages, { gbw: NARROW_REAL_GBW });
				const m = measure(H, d.f0, 3000, 10);
				const t = r.real.figures;
				shown.push(`${r.circuit} ${(100 * (m.f0 / d.f0 - 1)).toFixed(1)} %`);
				if (!(Math.abs(t.f0 / m.f0 - 1) < 1e-4 && Math.abs(Math.abs(t.gain) / Math.abs(m.gain) - 1) < 1e-4 && (t.q === null) === (m.q === null) && (m.q === null || Math.abs(t.q / m.q - 1) < 1e-3))) problems.push(`${label}, ${r.circuit}: the table says ${t.f0.toFixed(0)} Hz, ${t.gainDb.toFixed(2)} dB, Q ${t.q?.toFixed(3)}; the peak is at ${m.f0.toFixed(0)} Hz, ${(20 * Math.log10(Math.abs(m.gain))).toFixed(2)} dB, Q ${m.q?.toFixed(3)}`);
			}
		}
		check('narrow band-pass comparison on a slow op-amp: the figures on the TL082 are those of the true peak, however far the op-amp moves it', problems.length === 0, problems.length ? problems.slice(0, 2).join('; ') : `peaks moved ${shown.join(', ')}`);
	}

	// (e) The chain built on each circuit, N = 1, 2 and 6, K = 0.3, 1 and 10,
	// E24: a stage that cannot reach its gain by its form (an RLC, a
	// Sallen-Key past its own 2 sqrt(2) Q_s - 1, a multiple feedback stage
	// past its ceiling) is followed by non-inverting gain stages that
	// lands the chain on K within its ratio's rounding; with no gain stage
	// the chain's gain is the product of its stages' own; the identical
	// stages keep Q = Q_s / sqrt(2^(1/N) - 1) of the chain; and nodal.js,
	// stage by stage, solves the chain as lib-nodal does whole.
	{
		const problems = [];
		let chains = 0;
		let withGain = 0;
		const worst = { gain: 0, q: 0, single: 0 };
		for (const circuit of NARROW_CIRCUITS) {
			for (const n of [1, 2, 6]) {
				for (const gain of [0.3, 1, 10]) {
					const d = designNarrowBand({ f0: 10000, q: 5, gain, stages: n });
					const r = realizeNarrow(d, circuit, PAIR_STOCKS.E24);
					const at = `${circuit} N ${n} K ${gain}`;
					if (!r.ok) {
						problems.push(`${at}: ${r.why}`);
						continue;
					}
					chains++;
					const fig = measure((f) => responseAt(r.stages, f), 10000);
					const own = r.stageGains.reduce((p, g) => p * g, 1);
					if (r.gainStages.length) {
						withGain++;
						const gs = r.gainStages;
						const made = gs.slice(0, -1).reduce((p, g) => p * g.actual.gain, 1);
						const e = Math.abs(Math.abs(fig.gain) / gain - 1);
						worst.gain = Math.max(worst.gain, e);
						if (!(gs.every((g) => g.topology === 'gainNonInv' && Math.abs(g.actual.gain / (1 + g.components.R2 / g.components.R1) - 1) < 1e-12) && Math.abs((made * gs[gs.length - 1].steps.gainTarget) / (gain / own) - 1) < 1e-9 && e < 0.03)) problems.push(`${at}: gain stages ${JSON.stringify(gs.map((g) => g.actual))} for ${gain / own}, chain ${pc(e)} off K`);
					} else if (Math.abs(Math.abs(fig.gain) / own - 1) > 0.02) problems.push(`${at}: chain gain ${fig.gain} against its stages' ${own}`);
					// the stages' own Q, narrowed by the shrink factor
					const stage = measure((f) => responseAt([r.resonators[0]], f), 10000);
					const eq = Math.abs(fig.q / (stage.q / d.shrink) - 1);
					worst.q = Math.max(worst.q, eq);
					if (eq > 0.002) problems.push(`${at}: chain Q ${fig.q} against ${stage.q / d.shrink}`);
					// nodal.js stage by stage, lib-nodal on the whole chain, single-pole op-amps
					if (n <= 2) {
						const H = narrowNetlistResponse(r.stages, { gbw: NARROW_REAL_GBW });
						const all = forSolver(narrowChainElements(r.stages));
						for (const f of [3000, 9000, 10000, 11000, 30000]) worst.single = Math.max(worst.single, relErr(H(f), solveAt(all, f, opampAt)));
					}
				}
			}
		}
		check(
			`narrow band-pass chains: ${chains} built on the six circuits, ${withGain} with the gain stage, which lands K within its ratio's rounding; without it the chain gives its stages' own; Q of N identical stages is Q_s / sqrt(2^(1/N) - 1); nodal.js stage by stage equals the whole netlist`,
			problems.length === 0 && chains === 54 && withGain > 0 && worst.single < 1e-9,
			problems.length ? problems.slice(0, 3).join('; ') : `worst K with a gain stage ${pc(worst.gain)}, Q ${pc(worst.q, 3)}, single pole ${worst.single.toExponential(1)}`
		);
	}

	// (e4) A large K: a chain whose stages fall short of K by their form is
	// never built without the gain stage that makes up the rest; when no
	// gain stage can, it is refused rather than shown that far off
	{
		const problems = [];
		const shown = [];
		for (const gain of [300, 1000, 5000]) {
			const d = designNarrowBand({ f0: 10000, q: 5, gain, stages: 1 });
			for (const circuit of ['rlcGyrator', 'rlcGic', 'sallenKeyBp', 'mfbBp']) {
				const r = realizeNarrow(d, circuit, PAIR_STOCKS.E24);
				if (!r.ok) {
					shown.push(`${circuit} K ${gain} refused`);
					continue;
				}
				const chain = Math.abs(measure((f) => responseAt(r.stages, f), d.f0).gain);
				shown.push(`${circuit} K ${gain} ${chain.toPrecision(4)}`);
				if (Math.abs(chain / gain - 1) > 0.1) problems.push(`${circuit} at K ${gain}: built with ${r.gainStages.length ? `gain stages of ${r.gainStages.map((g) => g.actual.gain.toFixed(1)).join(', ')}` : 'no gain stage'}, the chain passes ${chain.toPrecision(4)} at its peak`);
			}
		}
		check('narrow band-pass, a large K: a chain that falls short of K by its form comes with the gain stage that makes up the rest, or is refused', problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : shown.join(', '));
	}

	// (e5) The gain split over identical amplifiers: one amplifier of gain g
	// keeps g / sqrt(1 + (g f0/GBW)^2) on a single-pole TL082, so the chain
	// takes the fewest amplifiers (up to NARROW_MAX_GAIN_STAGES) whose g f0
	// stays within NARROW_GAIN_SPEED GBW; the chain still lands on K with
	// ideal op-amps, and on the TL082 the amplifiers lose under 2 % at f0
	{
		const problems = [];
		const shown = [];
		for (const [f0, gain, circuit, stages] of [
			[10000, 10, 'rlcGic', 1],
			[40000, 100, 'rlcGic', 1],
			[40000, 100, 'rlcGyrator', 1],
			[10000, 1000, 'rlcGic', 1],
			[95000, 20, 'rlcGic', 2],
			[3000, 300, 'sallenKeyBp', 1]
		]) {
			const d = designNarrowBand({ f0, q: 5, gain, stages });
			const r = realizeNarrow(d, circuit, PAIR_STOCKS.E24);
			const at = `${circuit} K ${gain} at ${f0} Hz`;
			if (!r.ok) {
				problems.push(`${at}: ${r.why}`);
				continue;
			}
			const gs = r.gainStages;
			const rest = gain / r.stageGains.reduce((p, g) => p * g, 1);
			const quick = (m) => rest ** (1 / m) * f0 <= NARROW_GAIN_SPEED * NARROW_REAL_GBW;
			let fewest = 1;
			while (fewest < NARROW_MAX_GAIN_STAGES && !quick(fewest)) fewest++;
			const chain = Math.abs(measure((f) => responseAt(r.stages, f), f0).gain);
			const loss = gs.reduce((p, g) => p * Math.hypot(1, (g.actual.gain * f0) / NARROW_REAL_GBW), 1);
			shown.push(`${at}: ${gs.length} x ${gs.map((g) => g.actual.gain.toFixed(2)).join(', ')}`);
			if (gs.length !== fewest || !gs.every((g, k) => k === gs.length - 1 || JSON.stringify(g.components) === JSON.stringify(gs[0].components))) problems.push(`${at}: ${gs.length} gain stages for ${rest.toPrecision(4)}, the fewest quick enough is ${fewest}`);
			if (Math.abs(chain / gain - 1) > 0.03) problems.push(`${at}: the chain passes ${chain.toPrecision(4)}`);
			if (quick(gs.length) && loss - 1 > 0.02) problems.push(`${at}: the amplifiers lose ${pc(loss - 1)} on the TL082`);
		}
		check('narrow band-pass gain stages: split over the fewest identical amplifiers that keep g f0 within GBW/10 on the TL082, the last one taking the rounding, the chain on K', problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : shown.join('; '));
	}

	// (d4) The poles. narrowStability (nodal.js's nodalPoles) counts the
	// poles in the right half plane of every distinct stage on the
	// single-pole TL082; here they are counted apart, by the argument
	// principle on det(G + s C) of the stage's netlist, around the right
	// half plane. A magnitude response cannot tell a pole pair from its
	// mirror image, so the table must not rank such a circuit by it: at 95
	// kHz, Q 20 the state-variable and Tow-Thomas stages oscillate on a
	// TL082 and the default is another circuit
	{
		const cx2 = (re, im = 0) => ({ re, im });
		const cmul = (a, b) => cx2(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
		const cdiv = (a, b) => {
			const q = b.re * b.re + b.im * b.im;
			return cx2((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q);
		};
		const cabs = (a) => Math.hypot(a.re, a.im);
		/** det(Y(s)) of a stage, vin shorted, single-pole op-amps of gbw (Hz), unknowns the node voltages and the op-amp currents. */
		const detAt = (els, s, gbw) => {
			const index = new Map();
			const nodeOf = (n) => (n === '0' || n === 'vin' ? -1 : index.has(n) ? index.get(n) : (index.set(n, index.size), index.size - 1));
			for (const e of els) e.nodes.forEach(nodeOf);
			const ops = els.filter((e) => e.kind === 'OP');
			const n = index.size;
			const size = n + ops.length;
			const M = Array.from({ length: size }, () => Array.from({ length: size }, () => cx2(0)));
			const put = (r, c, y) => {
				if (r >= 0 && c >= 0) M[r][c] = cx2(M[r][c].re + y.re, M[r][c].im + y.im);
			};
			const stampY = (a, b, y) => {
				put(a, a, y);
				put(b, b, y);
				put(a, b, cx2(-y.re, -y.im));
				put(b, a, cx2(-y.re, -y.im));
			};
			for (const e of els) {
				const [a, b] = e.nodes.map(nodeOf);
				if (e.kind === 'R') stampY(a, b, cx2(1 / e.value));
				if (e.kind === 'C') stampY(a, b, cmul(s, cx2(e.value)));
			}
			ops.forEach((e, k) => {
				const row = n + k;
				const [pp, m, o] = e.nodes.map(nodeOf);
				put(o, row, cx2(1));
				put(row, pp, cx2(1));
				put(row, m, cx2(-1));
				put(row, o, cdiv(cx2(-s.re, -s.im), cx2(2 * Math.PI * gbw)));
			});
			let det = cx2(1);
			for (let c = 0; c < size; c++) {
				let pv = c;
				for (let r = c + 1; r < size; r++) if (cabs(M[r][c]) > cabs(M[pv][c])) pv = r;
				if (cabs(M[pv][c]) === 0) return cx2(0);
				if (pv !== c) {
					[M[pv], M[c]] = [M[c], M[pv]];
					det = cx2(-det.re, -det.im);
				}
				det = cmul(det, M[c][c]);
				for (let r = c + 1; r < size; r++) {
					const f = cdiv(M[r][c], M[c][c]);
					for (let k = c; k < size; k++) M[r][k] = cx2(M[r][k].re - cmul(f, M[c][k]).re, M[r][k].im - cmul(f, M[c][k]).im);
				}
			}
			return det;
		};
		/** Zeros of det in the right half plane: its winding along -jR..+jR (log spaced) and the right half circle of radius R. */
		const rhp = (els, gbw, w0) => {
			const R = 400 * 2 * Math.PI * gbw;
			const N = 20000;
			const ys = [];
			for (let i = 0; i <= N; i++) ys.push(R * 1e-9 ** (i / N));
			const path = [...ys.map((y) => cx2(1e-9 * w0, y)), ...ys.slice().reverse().map((y) => cx2(1e-9 * w0, -y))];
			for (let i = 0; i <= 4000; i++) {
				const th = -Math.PI / 2 + (Math.PI * i) / 4000;
				path.push(cx2(R * Math.cos(th), R * Math.sin(th)));
			}
			let wind = 0;
			let prev = null;
			for (const s of path) {
				const dd = detAt(els, s, gbw);
				const a = Math.atan2(dd.im, dd.re);
				if (prev !== null) {
					let da = a - prev;
					while (da > Math.PI) da -= 2 * Math.PI;
					while (da < -Math.PI) da += 2 * Math.PI;
					wind += da;
				}
				prev = a;
			}
			return Math.abs(Math.round(wind / (2 * Math.PI)));
		};
		const problems = [];
		let stagesCounted = 0;
		let unstable = 0;
		const defaults = [];
		for (const [f0, q, gain] of [
			[95000, 20, 1],
			[95000, 9.5, 1],
			[150000, 20, 10],
			[40000, 5, 100],
			[10000, 5, 1]
		]) {
			const d = designNarrowBand({ f0, q, gain, stages: 1 });
			const rows = compareNarrowCircuits(d, PAIR_STOCKS.E24);
			for (const r of rows.filter((x) => x.ok)) {
				const seen = new Set();
				let count = 0;
				for (const st of r.realized.stages) {
					const els = stageElements(st, 1, 'vin', 'vout').filter((e) => ['R', 'C', 'OP'].includes(e.kind));
					const key = JSON.stringify(els);
					if (seen.has(key)) continue;
					seen.add(key);
					stagesCounted++;
					count += rhp(els, NARROW_REAL_GBW, TWO_PI * f0);
				}
				const said = r.stability?.oscillates;
				if (count) unstable++;
				if (Boolean(count) !== Boolean(said)) problems.push(`${f0} Hz Q ${q} K ${gain} ${r.circuit}: ${count} poles in the right half plane, narrowStability says ${said ? 'it oscillates' : 'stable'}`);
				if (said && (r.qualifies || !r.reasons.some((x) => /^oscillates/.test(x)))) problems.push(`${f0} Hz Q ${q} K ${gain} ${r.circuit}: oscillates yet ${r.qualifies ? 'qualifies' : `not said: ${r.reasons.join(', ')}`}`);
				// the chain the page shows says the same
				if (Boolean(narrowStability(r.realized.stages, { gbw: NARROW_REAL_GBW, f0 })?.oscillates) !== Boolean(said)) problems.push(`${f0} Hz ${r.circuit}: the chain and the row disagree`);
			}
			const pick = narrowDefaultCircuit(rows);
			defaults.push(`${f0 / 1000} kHz Q ${q} K ${gain}: ${pick}`);
			if (rows.some((x) => x.ok && !x.stability?.oscillates) && rows.find((x) => x.circuit === pick)?.stability?.oscillates) problems.push(`${f0} Hz Q ${q}: the default ${pick} oscillates`);
		}
		const ref = compareNarrowCircuits(designNarrowBand({ f0: 95000, q: 20, gain: 1, stages: 1 }), PAIR_STOCKS.E24);
		const flagged = ['khnBp', 'towThomasBp'].every((c) => ref.find((x) => x.circuit === c)?.stability?.oscillates);
		check(
			`narrow band-pass poles: ${stagesCounted} distinct stages on the single-pole TL082, ${unstable} chains oscillating, each as the argument principle counts them; an oscillating row never qualifies and never becomes the default while a stable one is built; at 95 kHz, Q 20 the state-variable and Tow-Thomas stages oscillate`,
			problems.length === 0 && flagged && unstable > 0,
			problems.length ? problems.slice(0, 3).join('; ') : defaults.join(', ')
		);
	}

	// (e2) Pairs: on the kit with pairs, every resistor of every chain is a
	// kit value or two of them in series; a list of names lets only those
	// groups pair (filterPairGroups names them), which is how the page's
	// "Up to N pairs" builds a narrow band-pass
	{
		const problems = [];
		let paired = 0;
		let lists = 0;
		for (const circuit of NARROW_CIRCUITS) {
			for (const [f0, q, gain] of [[10000, 5, 1], [3000, 8, 4], [500, 2, 0.4]]) {
				const d = designNarrowBand({ f0, q, gain, stages: 1 });
				const full = realizeNarrow(d, circuit, { ...PAIR_STOCKS.lab, pairs: true });
				if (!full.ok) continue;
				const names = [...new Set(full.stages.flatMap((s) => filterPairGroups(s, kit).map((g) => g.name)))];
				const tries = [true, [], ...names.map((n) => [n])];
				for (const list of tries) {
					const r = list === true ? full : realizeNarrow(d, circuit, { ...PAIR_STOCKS.lab, pairs: list });
					if (!r.ok) continue;
					lists++;
					for (const s of r.stages) {
						if (s.stockShortfall) continue;
						for (const [part, v] of Object.entries(s.components)) {
							if (!/^R/.test(part)) continue;
							const pair = seriesPair(v, kit);
							if (pair) paired++;
							if (!pair && !kit.some((x) => Math.abs(x / v - 1) < 1e-9)) problems.push(`${circuit} ${f0} Hz [${list}] ${s.topology} ${part} = ${v} is neither a kit value nor two`);
							if (pair && list !== true) {
								const group = filterPairGroups(s, kit).find((g) => g.parts.includes(part));
								if (!group || !list.includes(group.name)) problems.push(`${circuit} ${f0} Hz [${list}] ${s.topology} ${part} pairs`);
							}
						}
					}
				}
			}
		}
		check('narrow band-pass pairs: on the kit every resistor is a kit value or two in series, and a list of names lets only those groups pair', problems.length === 0 && paired > 10 && lists > 30, problems.length ? problems.slice(0, 3).join('; ') : `${lists} chains, ${paired} paired resistors`);
	}

	// (e3) Capacitors chosen by hand: a chain either uses them exactly, every
	// stage they were given for, or is refused with the reason and the
	// designer's own answer, which the page turns into its message
	{
		const problems = [];
		const seen = { used: 0, refused: 0 };
		const d = designNarrowBand({ f0: 10000, q: 5, gain: 1, stages: 2 });
		for (const circuit of NARROW_CIRCUITS) {
			for (const C of [1e-12, 4.7e-9, 1e-8, 1e-5]) {
				const cap = circuit === 'mfbBp' ? { C1: C, C2: C / 2.2 } : { C };
				for (const gbw of circuit === 'mfbBp' ? [null, OPAMP_GBW.TL082] : [null]) {
					const r = realizeNarrow(d, circuit, { ...PAIR_STOCKS.E24, gbw, caps: [cap, null] });
					const at = `${circuit} C ${C}${gbw ? ' TL082' : ''}`;
					if (r.ok) {
						seen.used++;
						const c = r.resonators[0].components;
						const used = circuit === 'mfbBp' ? c.C1 === cap.C1 && c.C2 === cap.C2 : (c.C ?? c.C1) === C && Object.entries(c).filter(([k]) => /^C/.test(k)).every(([, v]) => v === C);
						if (!used || r.resonators[0].manual !== true) problems.push(`${at}: built on ${JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k]) => /^C/.test(k))))}`);
					} else {
						seen.refused++;
						if (!(/stage 1: the capacitors chosen by hand cannot build this stage/.test(r.why) && r.failure && r.failure.ok === false)) problems.push(`${at}: refused as ${r.why}, ${JSON.stringify(r.failure)}`);
					}
				}
			}
		}
		check('narrow band-pass, capacitors by hand: used exactly as given, or the chain is refused with the reason and the designer\'s own answer', problems.length === 0 && seen.used > 0 && seen.refused > 0, problems.length ? problems.slice(0, 3).join('; ') : `${seen.used} built on them, ${seen.refused} refused`);
	}

	// (d2) Across the range the page takes: f0 from 10 Hz to 1 MHz, Q from 0.5
	// to 60, K from 0.01 to 100, one stage or six, the comparison never
	// throws, every row is built with finite figures or refused with a
	// reason, and the default is a circuit that was built
	{
		const problems = [];
		let specs = 0;
		let rows = 0;
		let built = 0;
		for (const f0 of [10, 10000, 1e6]) {
			for (const q of [0.5, 10, 60]) {
				for (const gain of [0.01, 1, 100]) {
					for (const stages of [1, 6]) {
						const at = `f0 ${f0} Q ${q} K ${gain} N ${stages}`;
						specs++;
						try {
							const d = designNarrowBand({ f0, q, gain, stages });
							const list = compareNarrowCircuits(d, PAIR_STOCKS.E24);
							const pick = narrowDefaultCircuit(list);
							for (const r of list) {
								rows++;
								if (r.ok) {
									built++;
									const finite = [r.ideal.figures.f0, r.ideal.figures.gain, r.real.figures.f0, r.real.figures.gain, r.opamps, r.parts.total].every(Number.isFinite);
									if (!finite) problems.push(`${at} ${r.circuit}: figures ${JSON.stringify(r.ideal.figures)}`);
								} else if (!(typeof r.why === 'string' && r.why.length > 5 && !/undefined|NaN/.test(r.why))) problems.push(`${at} ${r.circuit}: refused as ${r.why}`);
							}
							if (list.some((r) => r.ok) ? !list.find((r) => r.circuit === pick)?.ok : pick !== null) problems.push(`${at}: default ${pick}`);
						} catch (e) {
							problems.push(`${at}: throws ${e.message}`);
						}
					}
				}
			}
		}
		check(`narrow band-pass across the range: ${specs} specs, ${built} of ${rows} rows built with finite figures, the rest refused with a reason, never an exception, the default always built`, problems.length === 0 && built > rows / 2, problems.slice(0, 3).join('; '));
	}

	// (f) The explanations of panels 02 to 04 (explainNarrowBandOrder,
	// explainNarrowBandStage, explainNarrowBandCircuit for every stage of
	// every circuit, the gain stage included, automatic and with capacitors
	// by hand, the MFB built for the TL082): strict KaTeX, plain words, none
	// of the words the site avoids
	{
		const blocks = [];
		for (const spec of [{ f0: 10000, q: 5, gain: 1, stages: 1 }, { f0: 10000, q: 5, gain: 4, stages: 3 }, { f0: 300, bandwidth: 20, gain: 0.2, stages: 2 }, { f0: 200000, q: 0.8, gain: 60, stages: 6 }]) {
			const d = designNarrowBand(spec);
			blocks.push(...explainNarrowBandOrder(d));
			d.stages.forEach((_, i) => blocks.push(...explainNarrowBandStage(d, i)));
			for (const stock of [PAIR_STOCKS.E24, { ...PAIR_STOCKS.lab, pairs: true }]) {
				for (const circuit of NARROW_CIRCUITS) {
					for (const gbw of circuit === 'mfbBp' ? [null, OPAMP_GBW.TL082] : [null]) {
						for (const byHand of [false, true]) {
							const caps = byHand ? d.stages.map(() => (circuit === 'mfbBp' ? { C1: 1e-8, C2: 1e-8 } : { C: 1e-8 })) : [];
							const r = realizeNarrow(d, circuit, { ...stock, gbw, caps });
							if (!r.ok) continue;
							r.stages.forEach((s, i) => blocks.push(...explainNarrowBandCircuit(s, s.topology === 'gainNonInv' ? null : d.stages[i], { design: d, realized: r, gbw })));
						}
					}
				}
			}
		}
		let texBad = 0;
		for (const b of blocks.filter((x) => x.type === 'eq')) {
			try {
				katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
			} catch (e) {
				texBad++;
				if (texBad < 3) console.log('   KATEX', b.tex.slice(0, 90), e.message.slice(0, 80));
			}
		}
		const words = blocks.filter((b) => b.type !== 'eq' && (/undefined|NaN|Infinity|\bnull\b/.test(b.text) || /[–—]|\byou(r)?\b|resonan|discriminant|dominant|\bcourse\b|professor|\bslides?\b|\blab\b/i.test(b.text)));
		const eqs = blocks.filter((b) => b.type === 'eq').length;
		check(`narrow band-pass explanations: ${eqs} equations render under strict KaTeX, ${blocks.length - eqs} paragraphs in plain words`, eqs > 1000 && texBad === 0 && words.length === 0, words.length ? words[0].text.slice(0, 120) : `${texBad} TeX failures`);
	}

	// (g) The downloadable script for a narrow band-pass: it rebuilds the
	// circuit the page shows (the rule's pick, or the one the menu names,
	// capacitors by hand included), prints its figures from the parts as the
	// page computes them, and ends OK or NOT MET as the rule's limits say;
	// with RESISTOR_PAIR_LIMIT it keeps to that many pairs
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-narrow-'));
		const run = (name, code) => {
			const file = join(dir, `${name}.js`);
			writeFileSync(file, code);
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return `ERROR ${e.stderr || e.message}`;
			}
		};
		const cases = [
			['reference, auto', { f0: 10000, q: 5, gain: 1, stages: 1 }, 'auto', {}, PAIR_STOCKS.E24, null],
			['gyrator, K 4 over three stages', { f0: 10000, q: 5, gain: 4, stages: 3 }, 'rlcGyrator', {}, PAIR_STOCKS.E24, null],
			['state variable by B, K 0.2', { f0: 2000, bandwidth: 250, gain: 0.2, stages: 2 }, 'khnBp', {}, PAIR_STOCKS.E96, null],
			['GIC, 10 nF by hand on stage 1', { f0: 10000, q: 5, gain: 1, stages: 2 }, 'rlcGic', { 0: { C: 1e-8 } }, PAIR_STOCKS.E24, null],
			['MFB built for the TL082, the kit', { f0: 10000, q: 8, gain: 1, stages: 1 }, 'mfbBp', {}, PAIR_STOCKS.lab, OPAMP_GBW.TL082],
			['Sallen-Key, Q 20, 100 kHz', { f0: 100000, q: 20, gain: 1, stages: 1 }, 'sallenKeyBp', {}, PAIR_STOCKS.E24, null]
		];
		const problems = [];
		const verdicts = [];
		for (const [label, spec, menu, caps, stock, gbw] of cases) {
			const d = designNarrowBand(spec);
			const opts = { ...stock, gbw };
			const circuit = menu === 'auto' ? narrowDefaultCircuit(compareNarrowCircuits(d, opts)) : menu;
			const r = realizeNarrow(d, circuit, { ...opts, caps: d.stages.map((_, i) => caps[i] ?? null) });
			const out = run(label.replace(/\W+/g, '-'), generateScript({ filterType: 'narrowband', f0: spec.f0, narrowBy: spec.q ? 'q' : 'b', q: spec.q ?? null, bandwidth: spec.bandwidth ?? null, gain: spec.gain, stages: spec.stages, circuit, circuitMenu: menu, opampGbw: gbw, capOverrides: caps, resistorStock: stock.resistorSeries, resistorPairs: false, capacitorStock: stock.capacitors }));
			if (/^ERROR/.test(out)) {
				problems.push(`${label}: ${out.slice(0, 160)}`);
				continue;
			}
			const fig = narrowFigures((f) => responseAt(r.stages, f), d.f0);
			const m = /from the parts: peak at ([\d.]+) Hz, (-?[\d.]+) dB.*Q = ([\d.]+)/.exec(out);
			if (!out.includes(`this script builds: ${NARROW_LABELS[circuit]}`)) problems.push(`${label}: builds another circuit`);
			if (!m || Math.abs(Number(m[1]) - fig.f0) > 0.051 || Math.abs(Number(m[2]) - fig.gainDb) > 0.0051 || Math.abs(Number(m[3]) - fig.q) > 5.1e-5) problems.push(`${label}: figures ${m ? m.slice(1).join(', ') : 'missing'} against ${fig.f0.toFixed(1)} Hz, ${fig.gainDb.toFixed(2)} dB, Q ${fig.q.toFixed(4)}`);
			// the verdict covers both sets of figures: from the parts, and on the TL082 (where an oscillation fails it)
			const verdict = narrowFit({ f0: fig.f0 / d.f0 - 1, q: fig.q / d.q - 1, gain: Math.abs(fig.gain) / d.gain - 1 }, d) <= 1 ? 'OK' : 'NOT MET';
			const rf = narrowFigures(narrowNetlistResponse(r.stages, { gbw: NARROW_REAL_GBW }), d.f0);
			const oscillates = narrowStability(r.stages, { gbw: NARROW_REAL_GBW, f0: d.f0 })?.oscillates;
			const onTl = oscillates ? 'it oscillates, NOT MET' : narrowFit({ f0: rf.f0 / d.f0 - 1, q: rf.q / d.q - 1, gain: Math.abs(rf.gain) / d.gain - 1 }, d) <= 1 ? 'OK' : 'NOT MET';
			const last = out.trim().split('\n').pop();
			if (!(last.startsWith('verdict: from the rounded parts, ') && last.endsWith(`: ${verdict}; on a TL082: ${onTl}`))) problems.push(`${label}: ${last} where the page says ${verdict}, ${onTl} on a TL082`);
			verdicts.push(`${label} ${verdict} / ${onTl}`);
		}
		// a limit of one pair on the kit
		const limited = run('pair-limit', generateScript({ filterType: 'narrowband', f0: 10000, narrowBy: 'q', q: 5, bandwidth: null, gain: 1, stages: 2, circuit: 'sallenKeyBp', circuitMenu: 'sallenKeyBp', opampGbw: null, capOverrides: {}, resistorStock: kit, resistorPairs: true, resistorPairLimit: 1, capacitorStock: LAB_KIT.capacitors }));
		const pairsPrinted = (limited.match(/in series\)/g) ?? []).length;
		if (/^ERROR/.test(limited) || !/^const RESISTOR_PAIR_LIMIT = 1;/m.test(generateScript({ filterType: 'narrowband', f0: 10000, narrowBy: 'q', q: 5, gain: 1, stages: 1, circuit: 'mfbBp', circuitMenu: 'auto', capOverrides: {}, resistorStock: kit, resistorPairs: true, resistorPairLimit: 1, capacitorStock: null })) || pairsPrinted > 1) problems.push(`pair limit: ${pairsPrinted} pairs printed${/^ERROR/.test(limited) ? `, ${limited.slice(0, 120)}` : ''}`);
		check('downloadable script, narrow band-pass: rebuilds the circuit shown, prints its figures as the page computes them, ends OK or NOT MET as the rule says, and keeps to RESISTOR_PAIR_LIMIT', problems.length === 0, problems.length ? problems.slice(0, 2).join('; ') : verdicts.join(', '));
	}
}

/* ------------------------ 13. placement in the template and the part search */
// The design is placed in its template (stages.js, placementWindow): its
// whole-number order leaves a range for one free parameter between Amax
// exactly at the passband edge and Amin exactly at the stopband edge, the
// frequency scale for a flat or falling passband, the ripple for an
// equiripple one; 'centred' takes the geometric middle, 'edge' the first
// end. The page then picks every stage's parts on the whole filter
// (partSearch.js): measured over the whole passband and stopband, up to
// the ideal design's margin, its resistors from 1 kohm and every op-amp
// output loaded by 2 kohm or more, else the designers' range, flagged.
{
	const { designBandPassTransformed, designBandStopTransformed } = await import('../src/lib/filter/stages.js');
	const { stageElements } = await import('../src/lib/filter/stageElements.js');
	const { solveNodes } = await import('./lib-nodal.mjs');
	const { componentOptions } = await import('../src/lib/stock.js');
	const lab = componentOptions('lab', '', '', false, null);
	const labR = componentOptions('labR', '', '', false, null);
	const cascade = (topology) => ({ method: 'cascade', highpass: topology, lowpass: topology });
	const scan = (a, b, count) => Array.from({ length: count + 1 }, (_, i) => a * (b / a) ** (i / count));
	/** An ideal design measured on a dense grid of its own: the worst passband loss and each stopband edge's least loss, from the passband peak. */
	const idealFigures = (d) => {
		const stages = d.stages.map(targetStage);
		const g = (f) => magnitudePhaseAt(stages, f).db;
		const t = filterTemplate(d);
		const pass = t.pass.flatMap((r) => scan(r.from, r.to, 4000).map((f) => ({ f, db: g(f), limit: r.amaxFrom })));
		const peak = Math.max(...pass.map((p) => p.db));
		const worstPass = Math.min(...pass.map((p) => p.limit - (peak - p.db)));
		// each stopband stretch from its edge outward (a band-stop's one stretch from both ends to its middle)
		const stops = t.stop.map((r) => Math.min(...scan(r.from, r.to, 8000).map((f) => peak - g(f) - r.aminDb)));
		return { pass: worstPass, stop: Math.min(...stops) };
	};
	const SPECS = {
		butterworth: [3, 40, 3.5],
		chebyshev: [1, 40, 3.5],
		legendre: [2, 40, 2.5],
		bessel: [3, 30, 4],
		inverseChebyshev: [1, 50, 1.8],
		elliptic: [0.5, 60, 1.4]
	};
	// the grid error of each family on the 4001 / 8001 points: exact for the monotone ones, the ripple peaks for the rest
	const TOL = { butterworth: 1e-6, legendre: 1e-3, bessel: 1e-3, chebyshev: 2e-3, inverseChebyshev: 2e-3, elliptic: 3e-3 };

	// (a) the window's two ends and its middle, every response, low-pass,
	// high-pass and both transformations: 'edge' loses exactly Amax in the
	// passband, 'stop' (the other end, kept for checks) exactly Amin in the
	// stopband, 'centred' takes the geometric middle (sqrt(high) of the
	// scale, sqrt(low high) of eps) and keeps the two margins it reports
	{
		const problems = [];
		const worst = {};
		for (const response of RESPONSE_KEYS) {
			const [amaxDb, aminDb, ratio] = SPECS[response];
			const makers = {
				lowpass: (placement) => designLowPass({ response, amaxDb, aminDb, fp: 10000, fs: 10000 * ratio, order: null, placement }),
				highpass: (placement) => designHighPass({ response, amaxDb, aminDb, fp: 10000, fs: 10000 / ratio, order: null, placement }),
				bandpass: (placement) => designBandPassTransformed({ response, amaxDb, aminDbLow: aminDb + 5, aminDbHigh: aminDb, fl: 40000, fh: 60000, fsl: 40000 / (1 + ratio / 3), fsh: 60000 * (1 + ratio / 3), placement }),
				bandstop: (placement) => designBandStopTransformed({ response, amaxDb, aminDb, fl: 9000, fh: 11500, fsl: 9000 * (1 + 0.03 * ratio), fsh: 11500 / (1 + 0.03 * ratio), placement })
			};
			for (const [kind, make] of Object.entries(makers)) {
				const label = `${response} ${kind}`;
				const edge = make('edge');
				const stop = make('stop');
				const mid = make('centred');
				const p = mid.placement;
				if (p.empty) {
					problems.push(`${label}: no room`);
					continue;
				}
				const fe = idealFigures(edge);
				const fs = idealFigures(stop);
				const fm = idealFigures(mid);
				const err = Math.max(Math.abs(fe.pass), Math.abs(fs.stop), Math.abs(fm.pass - p.margins.pass), Math.abs(fm.stop - p.margins.stop));
				worst[response] = Math.max(worst[response] ?? 0, err);
				if (err > TOL[response]) problems.push(`${label}: edge ${fe.pass.toExponential(2)}, stop ${fs.stop.toExponential(2)}, centred ${fm.pass.toFixed(4)}/${fm.stop.toFixed(4)} against ${p.margins.pass.toFixed(4)}/${p.margins.stop.toFixed(4)}`);
				// the edge keeps today's design, its room all in the stopband; the stop end has none left there
				if (!(fe.stop > 1e-4 && fs.pass > 1e-4 && fm.pass > 1e-4 && fm.stop > 1e-4)) problems.push(`${label}: margins edge ${fe.stop.toFixed(3)}, stop ${fs.pass.toFixed(3)}, centred ${fm.pass.toFixed(3)}/${fm.stop.toFixed(3)}`);
				const middle = p.kind === 'scale' ? Math.sqrt(p.high) : Math.sqrt(p.low * p.high);
				if (Math.abs(p.value / middle - 1) > 1e-12 || Math.abs(p.idealMargin - Math.min(p.margins.pass, p.margins.stop)) > 1e-12 || edge.placement.idealMargin !== 0) problems.push(`${label}: value ${p.value} against the middle ${middle}, ideal margin ${p.idealMargin}`);
				if (p.kind !== (response === 'chebyshev' || response === 'elliptic' ? 'ripple' : 'scale')) problems.push(`${label}: placed by ${p.kind}`);
			}
		}
		check(
			'placement: for every response (low-pass, high-pass, transformed band-pass and band-stop) the edge loses exactly Amax in the passband, the other end exactly Amin in the stopband, and centred is the geometric middle with the margins it reports',
			problems.length === 0,
			problems.length ? problems.slice(0, 3).join('; ') : Object.entries(worst).map(([r, e]) => `${r} ${e.toExponential(1)} dB`).join(', ')
		);
	}

	// (b) the numbers worked out for the default spec: Butterworth 3/40 dB,
	// 10 and 35 kHz, n = 4: f-3dB from 10005.9 to 11068.1 Hz, the middle
	// 10523.6 Hz, which is sqrt(fp fs) (eps_p eps_s)^(-1/(2n)), and 0.79 and
	// 1.75 dB of margin; Chebyshev 1/40 dB, the same edges: a ripple of
	// 0.1958 dB, 0.80 and 7.49 dB
	{
		const eps = (a) => Math.sqrt(10 ** (a / 10) - 1);
		const bw = designLowPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' });
		const p = bw.placement;
		const f3 = (s) => 10000 * bw.wcScale * s;
		const closed = Math.sqrt(10000 * 35000) * (eps(3) * eps(40)) ** (-1 / (2 * bw.n));
		const ch = designLowPass({ response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' }).placement;
		const near = (a, b, d) => Math.abs(a - b) <= d;
		check(
			'placement, the default spec: f-3dB from 10005.9 to 11068.1 Hz, centred at 10523.6 Hz (the closed form), margins 0.786 and 1.752 dB; Chebyshev 1/40 dB centred on a 0.1958 dB ripple, margins 0.804 and 7.493 dB',
			bw.n === 4 && near(f3(1), 10005.9, 0.05) && near(f3(p.high), 11068.1, 0.05) && near(bw.wc / (2 * Math.PI), 10523.6, 0.05) && Math.abs(bw.wc / (2 * Math.PI) / closed - 1) < 1e-9 && near(p.margins.pass, 0.786, 5e-4) && near(p.margins.stop, 1.752, 5e-4) && near(ch.rippleDb.chosen, 0.1958, 5e-5) && near(ch.margins.pass, 0.804, 5e-4) && near(ch.margins.stop, 7.493, 5e-4),
			`f-3dB ${f3(1).toFixed(1)} to ${f3(p.high).toFixed(1)}, centred ${(bw.wc / (2 * Math.PI)).toFixed(1)} Hz (closed form ${closed.toFixed(1)}), ${p.margins.pass.toFixed(3)} / ${p.margins.stop.toFixed(3)} dB; Chebyshev ${ch.rippleDb.chosen.toFixed(4)} dB, ${ch.margins.pass.toFixed(3)} / ${ch.margins.stop.toFixed(3)} dB`
		);
	}

	// (c) the whole passband: the page's measure reads the worst loss over
	// it, from its peak, not only at fp. The Chebyshev 0.5/40 dB low-pass
	// (10 and 35 kHz) on the lab kit, Sallen-Key, as its designers alone build
	// it, loses 0.00 dB at fp but 2.54 dB at 6 kHz: measured at fp only it
	// would pass. measureFilter finds that point (against a dense grid of the
	// checks' own), says it is not at the edge, and the template missed; the
	// page's parts meet it. Over a set of designs, meets is the passband's
	// worst loss within Amax + PASSBAND_SLACK_DB and the stopband's within Amin.
	{
		const d = designLowPass({ response: 'chebyshev', amaxDb: 0.5, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'edge' });
		const today = searchFilterParts(d, { menus: cascade('sallenKey'), ...lab, search: false });
		const m = today.measure;
		const g = (f) => magnitudePhaseAt(today.stages, f).db;
		const grid = scan(100, 10000, 8000);
		const peak = Math.max(...grid.map(g));
		const dense = Math.max(...grid.map((f) => peak - g(f)));
		const page = searchFilterParts(designLowPass({ response: 'chebyshev', amaxDb: 0.5, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' }), { menus: cascade('sallenKey'), ...lab });
		let inconsistent = 0;
		for (const response of RESPONSE_KEYS) {
			for (const placement of ['edge', 'centred']) {
				const r = searchFilterParts(designLowPass({ response, amaxDb: SPECS[response][0], aminDb: SPECS[response][1], fp: 10000, fs: 10000 * SPECS[response][2], order: null, placement }), { menus: cascade(hasZeros(response) ? 'towThomas' : 'mfb'), ...labR });
				for (const x of [r.measure, r.baseline.measure]) if (x.meets !== (x.pass.margin >= -PASSBAND_SLACK_DB && x.stop.margin >= -1e-6) || Math.abs(x.margin - Math.min(x.pass.margin, x.stop.margin)) > 1e-12) inconsistent++;
			}
		}
		check(
			'whole passband: the Chebyshev 0.5 dB low-pass on Sallen-Key, lab kit, as its designers build it, loses 0.00 dB at fp but 2.54 dB inside; the measure finds it (not at the edge) and calls the template missed, the page\'s parts meet it, and meets follows the two margins everywhere',
			m.passEdges[0].loss < 0.01 && m.pass.edge === null && Math.abs(m.pass.loss - dense) < 0.02 && m.pass.loss > 2.4 && !m.meets && page.measure.meets && inconsistent === 0,
			`at fp ${m.passEdges[0].loss.toFixed(3)} dB, worst ${m.pass.loss.toFixed(3)} dB at ${m.pass.freq.toFixed(0)} Hz (dense grid ${dense.toFixed(3)}), the page's parts ${page.measure.pass.loss.toFixed(3)} dB, margin ${page.measure.margin.toFixed(3)}; ${inconsistent} inconsistent`
		);
	}

	// (d) the page's opening design, Butterworth 3/40 dB, 10 and 35 kHz, MFB,
	// on the lab kit. Its designers alone miss the template by 1.1 dB (4.13
	// dB lost at fp). The part search meets it on the passband edge (with a
	// little margin, the ideal design there having none) and, centred as the
	// page opens, with at least the ideal design's 0.786 dB, within the
	// limits (no alert); so do E24, E96 and the lab resistors
	{
		const spec = { response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null };
		const edge = searchFilterParts(designLowPass({ ...spec, placement: 'edge' }), { menus: cascade('mfb'), ...lab });
		const centred = searchFilterParts(designLowPass({ ...spec, placement: 'centred' }), { menus: cascade('mfb'), ...lab });
		const others = ['E24', 'E96', 'labR'].map((s) => [s, searchFilterParts(designLowPass({ ...spec, placement: 'centred' }), { menus: cascade('mfb'), ...componentOptions(s, '', '', false, null) })]);
		const today = edge.baseline.measure;
		check(
			"the page's opening design on the lab kit: its designers alone miss by 1.1 dB (4.13 dB at fp); the search meets it on the edge and, centred, with at least the ideal design's 0.786 dB, within the limits; E24, E96 and the lab resistors too",
			!today.meets && today.margin < -1 && edge.measure.meets && edge.measure.margin > 0.05 && centred.measure.meets && centred.measure.margin >= centred.ideal.margin - 1e-3 && centred.ideal.margin > 0.78 && [edge, centred].every((r) => r.withinLimits && r.alerts.length === 0) && others.every(([, r]) => r.measure.meets && r.measure.margin >= 0.75 && r.alerts.length === 0),
			`today ${today.passEdges[0].loss.toFixed(3)} dB at fp, margin ${today.margin.toFixed(3)}; edge ${edge.measure.passEdges[0].loss.toFixed(3)} / ${edge.measure.stop.db.toFixed(2)} dB, margin ${edge.measure.margin.toFixed(3)}; centred ${centred.measure.margin.toFixed(3)} (ideal ${centred.ideal.margin.toFixed(3)}); ${others.map(([s, r]) => `${s} ${r.measure.margin.toFixed(3)}`).join(', ')}`
		);
	}

	// (e) Never worse than today: a fixed sample of 36 specs (every type,
	// both band methods, every response, seven stocks and limits, the three
	// topologies and both notch circuits), each built with today's parts as
	// the page showed them before the search (the library at that commit,
	// on the passband edge) and measured with the whole-passband measure.
	// Those margins are pinned below; the 5 specs today's page could not
	// build are left out. The search, on the edge and centred, meets the
	// template wherever today's parts did, and where both miss it misses by
	// no more.
	{
		const RESP = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];
		const ZEROS = { inverseChebyshev: true, elliptic: true };
		const LIMITS = { butterworth: [3, 40, 3.5], chebyshev: [1, 50, 2], legendre: [2, 40, 2.5], bessel: [3, 30, 4], inverseChebyshev: [1, 50, 1.8], elliptic: [0.5, 60, 1.4] };
		const STOCKS = [['E24', false, null], ['E96', false, null], ['lab', false, null], ['labR', false, null], ['lab', true, null], ['lab', true, 2], ['labR', true, 1]];
		const sample = [];
		let k = 0;
		for (const type of ['lowpass', 'highpass', 'bandpass', 'bandstop', 'bandpassT', 'bandstopT']) {
			RESP.forEach((response, j) => {
				const [amaxDb, aminDb, ratio] = LIMITS[response];
				const [stock, pairs, limit] = STOCKS[k % STOCKS.length];
				const topo = ZEROS[response] ? ['towThomas', 'boctor'][k % 2] : ['mfb', 'sallenKey', 'towThomas'][k % 3];
				k++;
				const c = { type, response, amaxDb, aminDb, stock, pairs, limit, topo };
				if (type === 'lowpass') Object.assign(c, { fp: 10000, fs: 10000 * ratio });
				else if (type === 'highpass') Object.assign(c, { fp: 10000, fs: 10000 / ratio });
				else if (type === 'bandpass') Object.assign(c, { fl: 1000, fh: 10000, fsl: 1000 / ratio, fsh: 10000 * ratio });
				else if (type === 'bandstop') Object.assign(c, { fl: 1000, fh: 30000, fsl: 1000 * ratio, fsh: 30000 / ratio });
				else if (type === 'bandpassT') Object.assign(c, { fl: 40000, fh: 60000, fsl: 40000 / (1 + ratio / 4), fsh: 60000 * (1 + ratio / 4), bandpass: j % 2 ? 'towThomas' : 'mfb', notch: ZEROS[response] ? ['towThomas', 'boctor'][j % 2] : 'boctor' });
				else Object.assign(c, { fl: 9000, fh: 11500, fsl: 9000 * (1 + 0.04 * ratio), fsh: 11500 / (1 + 0.04 * ratio), bandpass: 'mfb', notch: ZEROS[response] ? ['towThomas', 'boctor'][j % 2] : 'boctor' });
				sample.push(c);
			});
		}
		const designOf = (c, placement) => {
			const { response, amaxDb, aminDb } = c;
			if (c.type === 'lowpass') return designLowPass({ response, amaxDb, aminDb, fp: c.fp, fs: c.fs, order: null, placement });
			if (c.type === 'highpass') return designHighPass({ response, amaxDb, aminDb, fp: c.fp, fs: c.fs, order: null, placement });
			if (c.type === 'bandpass') return designBandPass({ response, amaxDb, aminDb, fl: c.fl, fh: c.fh, fsl: c.fsl, fsh: c.fsh, placement });
			if (c.type === 'bandstop') return designBandStop({ response, amaxDb, aminDb, fl: c.fl, fh: c.fh, fsl: c.fsl, fsh: c.fsh, placement });
			if (c.type === 'bandpassT') return designBandPassTransformed({ response, amaxDb, aminDbLow: aminDb, aminDbHigh: aminDb, fl: c.fl, fh: c.fh, fsl: c.fsl, fsh: c.fsh, placement });
			return designBandStopTransformed({ response, amaxDb, aminDb, fl: c.fl, fh: c.fh, fsl: c.fsl, fsh: c.fsh, placement });
		};
		const settingsOf = (c) => {
			const o = componentOptions(c.stock, '', '', c.pairs, c.limit);
			const menus = c.type.endsWith('T') ? { method: 'transformed', bandpass: c.bandpass, notch: c.notch, ...(c.type === 'bandpassT' && c.bandpass === 'mfb' ? { gbw: OPAMP_GBW.TL082 } : {}) } : cascade(c.topo);
			return { menus, ...o, combinerR: Array.isArray(o.resistorSeries) ? nearestResistor(10000, o.resistorSeries) : 10000 };
		};
		// [sample index, today's margin (dB), today met the template], taken from the library before the part search
		const TODAY = [[0, -0.1069, false], [1, -0.7794, false], [2, 0.6476, true], [3, -1.3359, false], [4, -0.2389, false], [5, -4.1302, false], [6, 0.507, true], [7, -1.1739, false], [8, 0.0157, true], [9, 0.363, true], [10, -2.3093, false], [12, -0.4616, false], [13, -4.5426, false], [14, -1.2094, false], [15, 0.4947, true], [16, -6.1326, false], [18, -0.1654, false], [19, -10.4649, false], [20, -3.4095, false], [21, 0.096, true], [22, -4.9976, false], [25, -3.7214, false], [27, -0.4839, false], [28, -3.2636, false], [29, -1.5999, false], [30, -11.8617, false], [31, -13.5562, false], [32, 0.0908, true], [33, -11.7083, false], [34, -12.8509, false], [35, -17.2946, false]];
		// The limits come first (decision A): where today's parts break one of them (the designers alone, search: false,
		// whose margins are the pinned ones), the parts within the limits may miss by more, or miss where today's met;
		// then a set past the limits that meets must come along as the alternative wherever today's parts met. These
		// were 10 (high-pass inverse Chebyshev, lab resistors: today's loads), 31 (Chebyshev band-stop transformed:
		// today's loads) and 32 (Legendre band-stop transformed: today met past the load limit) when the limits came first.
		// 33 (Bessel band-stop transformed, lab kit, N = 2) and 34 (inverse Chebyshev band-stop transformed, lab
		// resistors, N = 1) joined them when the search stopped calling a stage unable to keep its load while some of
		// its candidates keep it (and stopped falling back to the designers' range, past the limits, for a hair short
		// of a load): both missed today by 11.7 and 12.9 dB with every notch's load broken, and now keep the loads.
		const problems = [];
		const excused = new Set();
		let met = { today: 0, edge: 0, centred: 0 };
		let gained = 0;
		let pinnedOff = 0;
		for (const [i, margin, meets] of TODAY) {
			const c = sample[i];
			if (meets) met.today++;
			const today = searchFilterParts(designOf(c, 'edge'), { ...settingsOf(c), search: false });
			if (Math.abs(today.measure.margin - margin) > 1e-3) pinnedOff++;
			const broke = today.alerts.length > 0;
			for (const placement of ['edge', 'centred']) {
				const r = searchFilterParts(designOf(c, placement), settingsOf(c));
				const now = r.measure;
				if (now.meets) met[placement]++;
				if (placement === 'centred') gained += now.margin - margin;
				const worse = (meets && !now.meets) || (!meets && !now.meets && now.margin < margin - 1e-3);
				const name = `${i} ${c.type} ${c.response} ${c.stock}${c.pairs ? ' pairs' : ''}${c.limit ? ` N=${c.limit}` : ''} ${placement}`;
				if (worse && broke && r.withinLimits === true) {
					excused.add(i);
					if (meets && !r.alternative?.measure.meets) problems.push(`${name}: within the limits ${now.margin.toFixed(3)} dB and no alternative that meets, where today's parts met past them`);
				} else if (worse) problems.push(`${name}: ${now.margin.toFixed(3)} dB against today's ${margin}`);
			}
		}
		check(
			`never worse than today: ${TODAY.length} pinned specs, on the edge and centred, meet wherever today's parts met and miss by no more where both miss, but where today's parts break the limits and the parts now keep them (then a set past the limits that meets is offered wherever today's met)`,
			sample.length === 36 && pinnedOff === 0 && problems.length === 0 && met.centred > met.today && excused.size <= 5,
			problems.length ? problems.slice(0, 3).join('; ') : `met today ${met.today}, edge ${met.edge}, centred ${met.centred}; mean margin gained centred ${(gained / TODAY.length).toFixed(2)} dB; within the limits where today's broke them: ${[...excused].join(', ') || 'none'}${pinnedOff ? `; ${pinnedOff} pinned margins off` : ''}`
		);
	}

	// (f) "Up to N pairs": the search keeps to N and its result never gets
	// worse as N grows (the same pools whatever the limit, so a larger one
	// only adds sets), on both placements, ranked limits first: within the
	// limits, then with no limit given way at all (no alert), then the
	// template met, then the margin (up to the ideal design's; where both
	// meet, within the PART_MARGIN_TOLERANCE_DB that sensible values may
	// trade, since the set rule 4 starts from can change with N). A step
	// from a smaller N that had to give way on a limit to a larger one that
	// keeps it may give margin back, even miss (the limits come first); then
	// a set past the limits that meets comes along as the alternative
	// wherever the smaller N met. Since every pool holds single resistors
	// too and a stage keeps its loads wherever a candidate does, every N
	// here is within the limits, and that happens in 2 steps, both on the
	// Tow-Thomas high-pass on the lab resistors (centred from N = 1 to 2, on
	// the edge from N = 2 to 3), where the smaller N gives way on a load
	{
		const problems = [];
		const rows = [];
		const specs = [
			['Butterworth low-pass, MFB', designLowPass, { response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 }, 'mfb'],
			['Chebyshev high-pass, Tow-Thomas', designHighPass, { response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 3000, fs: 1000 }, 'towThomas'],
			['Legendre low-pass, Sallen-Key', designLowPass, { response: 'legendre', amaxDb: 1, aminDb: 50, fp: 2000, fs: 5000 }, 'sallenKey'],
			['Butterworth band-stop, MFB', designBandStop, { response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 }, 'mfb']
		];
		const rank = (r) => [r.withinLimits === true ? 1 : 0, r.alerts.length === 0 ? 1 : 0, r.measure.meets ? 1 : 0, Math.min(r.measure.margin, r.ideal.margin)];
		let byLimits = 0;
		for (const [label, make, spec, topology] of specs) {
			for (const stock of ['lab', 'labR']) {
				for (const placement of ['edge', 'centred']) {
					const d = make({ ...spec, placement });
					const byN = [1, 2, 3, 4].map((n) => searchFilterParts(d, { menus: cascade(topology), ...componentOptions(stock, '', '', true, n) }));
					byN.forEach((r, k) => {
						const used = r.stages.reduce((s, x) => s + filterPairCount(x, LAB_KIT.resistors), 0);
						if (used > k + 1) problems.push(`${label} ${stock} ${placement} N=${k + 1}: ${used} pairs`);
						// (the alternative, past the limits, keeps to N too)
						const usedAlt = r.alternative ? r.alternative.stages.reduce((s, x) => s + filterPairCount(x, LAB_KIT.resistors), 0) : 0;
						if (usedAlt > k + 1) problems.push(`${label} ${stock} ${placement} N=${k + 1}: ${usedAlt} pairs past the limits`);
						if (k === 0) return;
						const [a, b] = [rank(byN[k - 1]), rank(r)];
						const tol = a[2] && b[2] ? PART_MARGIN_TOLERANCE_DB + 1e-3 : 1e-3;
						const worse = b[0] < a[0] || (b[0] === a[0] && (b[1] < a[1] || (b[1] === a[1] && (b[2] < a[2] || (b[2] === a[2] && b[3] < a[3] - tol)))));
						if (worse) problems.push(`${label} ${stock} ${placement}: N=${k} ${byN[k - 1].measure.margin.toFixed(3)} -> N=${k + 1} ${r.measure.margin.toFixed(3)}`);
						else if ((b[0] > a[0] || (b[0] === a[0] && b[1] > a[1])) && (b[2] < a[2] || b[3] < a[3] - 1e-3)) {
							// the limits first: past them at the smaller N, within them at this one, and what met past them offered
							byLimits++;
							if (byN[k - 1].measure.meets && !r.measure.meets && !r.alternative?.measure.meets) problems.push(`${label} ${stock} ${placement}: N=${k + 1} within the limits misses, with no alternative that meets where N=${k} met past them`);
						}
					});
					rows.push(`${label} ${stock} ${placement} ${byN.map((r) => `${r.measure.margin.toFixed(2)}${r.withinLimits ? '' : '*'}`).join('/')}`);
				}
			}
		}
		check('pair limit and the search: at most N resistors two in series (the alternative too), and the result never worse as N grows from 1 to 4 (4 filters, lab kit and lab resistors, both placements), the limits first: a step into them may give margin back, with a set past them that meets offered where the smaller N met', problems.length === 0 && byLimits <= 2, problems.length ? problems.slice(0, 3).join('; ') : `${byLimits} step${byLimits === 1 ? '' : 's'} back into the limits; ${rows.slice(0, 4).join(', ')} (* past the limits)`);
	}

	// (g) The floor and the loads. An op-amp output's load is |V| / |I| with
	// the current it delivers into its own network and the next stage's
	// input (or the band-stop's summing resistor), solved here by the
	// checks' own nodal solver (lib-nodal.mjs) on the stage netlists: within
	// the limits every searched resistor is 1 kohm or more and every load 2
	// kohm or more over the passband (a band-stop's branch over its own);
	// an alert names the stage, the part or the op-amp, and the load and
	// frequency the solver finds there. An output that swings less than the
	// filter's input there (atInput) is read at the input's full swing: the
	// resistor that would draw its current then, 1 / |H ahead| / |I|, with H
	// ahead the built stages before it, chained from the filter's input.
	{
		const forSolver = (els) => [{ kind: 'V', name: 'V1', a: 'vin', b: '0' }, ...els.map((e) => (e.kind === 'OP' ? { kind: 'OP', name: e.name, p: e.nodes[0], m: e.nodes[1], out: e.nodes[2] } : { kind: e.kind, name: e.name, a: e.nodes[0], b: e.nodes[1], value: e.value }))];
		/** |H| of the stages ahead of stage i at f, the realized ones chained from the filter's input. */
		const gainBefore = (stages, i, f) => {
			if (i === 0) return 1;
			const els = stages.slice(0, i).flatMap((s, j) => stageElements(s, j, j === 0 ? 'vin' : `chain${j}`, `chain${j + 1}`));
			const v = solveNodes(forSolver(els), f).get(`chain${i}`);
			return Math.hypot(v.re, v.im);
		};
		/** The load on op-amp `tag` of stage i at f: its stage driven by 1 V, the next stage (or a resistor to ground) on its output; with swing, also |V| and |I| apart. */
		const loadOf = (stages, i, tag, f, after, swing = false) => {
			const els = [...stageElements(stages[i], i, 'vin', 'n1')];
			if (after === 'stage') els.push(...stageElements(stages[i + 1], i + 1, 'n1', 'vout'));
			if (typeof after === 'number') els.push({ kind: 'R', name: 'Rload', nodes: ['n1', '0'], value: after });
			const ops = els.filter((e) => e.kind === 'OP' && e.name.slice(1, -String(i).length || undefined) === tag && e.name.endsWith(String(i)));
			const op = ops[0];
			const v = solveNodes(forSolver(els), f);
			const out = op.nodes[2];
			const vo = v.get(out);
			let ire = 0;
			let iim = 0;
			for (const e of els) {
				if (e.kind !== 'R' && e.kind !== 'C') continue;
				const [a, b] = e.nodes;
				if (a !== out && b !== out) continue;
				const other = a === out ? b : a;
				const vb = other === '0' ? { re: 0, im: 0 } : v.get(other);
				const dre = vo.re - vb.re;
				const dim = vo.im - vb.im;
				const y = e.kind === 'R' ? { re: 1 / e.value, im: 0 } : { re: 0, im: 2 * Math.PI * f * e.value };
				ire += dre * y.re - dim * y.im;
				iim += dre * y.im + dim * y.re;
			}
			if (swing) return { v: Math.hypot(vo.re, vo.im), i: Math.hypot(ire, iim) };
			return Math.hypot(vo.re, vo.im) / Math.hypot(ire, iim);
		};
		const problems = [];
		const rows = [];
		const within = [
			['default low-pass, MFB, lab kit, centred', designLowPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' }), cascade('mfb'), lab],
			['default band-stop, MFB, lab kit, centred', designBandStop({ response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: 'centred' }), cascade('mfb'), lab],
			['Butterworth band-pass cascade, Tow-Thomas, lab resistors, centred', designBandPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, placement: 'centred' }), cascade('towThomas'), labR],
			['elliptic low-pass, Tow-Thomas, E24, centred', designLowPass({ response: 'elliptic', amaxDb: 1, aminDb: 40, fp: 10000, fs: 20000, order: null, placement: 'centred' }), cascade('towThomas'), componentOptions('E24', '', '', false, null)]
		];
		for (const [label, d, menus, stock] of within) {
			const r = searchFilterParts(d, { menus, ...stock, combinerR: 10000 });
			const t = filterTemplate(d);
			// nine log-spaced points per passband stretch, one that runs up from its edge read to loadTo (a TL082's full swing);
			// a band-stop's branch over its own passband only (the other is its stopband: no signal there)
			const read = (stretches) => stretches.flatMap((p) => scan(p.from, p.loadTo ?? p.to, 8));
			let least = Infinity;
			r.stages.forEach((s, i) => {
				const freqs = t.parallel ? read([t.pass[i < t.lpCount ? 0 : 1]]) : read(t.pass);
				for (const [name, v] of Object.entries(s.components)) if ((/^R/.test(name) && (v < PART_R_FLOOR || v > PART_R_MAX)) || (/^C/.test(name) && v < C_FLOOR)) problems.push(`${label} stage ${i + 1}: ${name} = ${v}`);
				const last = t.parallel ? i === t.lpCount - 1 || i === r.stages.length - 1 : i === r.stages.length - 1;
				const after = !last ? 'stage' : t.parallel ? 10000 : null;
				const tags = stageElements(s, i, 'vin', 'n1').filter((e) => e.kind === 'OP').map((e) => e.name.slice(1, e.name.length - String(i).length));
				for (const tag of tags) for (const f of freqs) least = Math.min(least, loadOf(r.stages, i, tag, f, after));
			});
			if (!(r.withinLimits && r.alerts.length === 0 && least >= PART_LOAD_MIN * (1 - 1e-9))) problems.push(`${label}: within ${r.withinLimits}, ${r.alerts.length} alerts, least load ${least.toFixed(0)} ohm`);
			rows.push(`${label.split(',')[0]} ${least.toFixed(0)} ohm`);
		}
		// past the limits: the elliptic Tow-Thomas low-pass on the lab kit with 100 nF typed for stage 1 (the
		// 10 nF typed before the limits came first now keeps every one of them: resistors of 1 kohm and more)
		const d = designLowPass({ response: 'elliptic', amaxDb: 1, aminDb: 40, fp: 10000, fs: 20000, order: null, placement: 'centred' });
		const r = searchFilterParts(d, { menus: cascade('towThomas'), ...lab, overrides: { 0: { C: 1e-7 } } });
		// and the default band-stop transformed on E24, whose notches' first op-amp barely swings ten times above fh (atInput)
		const bs = designBandStopTransformed({ response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: 'centred' });
		const rb = searchFilterParts(bs, { menus: { method: 'transformed', bandpass: 'mfb', notch: 'boctor' }, ...componentOptions('E24', '', '', false, null) });
		// and the set past the limits offered for the same band-stop on the edge on the lab kit (its alternative)
		const ra = searchFilterParts(designBandStopTransformed({ response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: 'edge' }), { menus: { method: 'transformed', bandpass: 'mfb', notch: 'boctor' }, ...lab }).alternative;
		let checked = 0;
		let atInput = 0;
		for (const [res, a] of [...r.alerts.map((a) => [r, a]), ...rb.alerts.map((a) => [rb, a]), ...(ra?.alerts ?? []).map((a) => [ra, a])]) {
			const s = res.stages[a.stage];
			if (a.kind === 'floor' || a.kind === 'ceiling') {
				if (!(s.components[a.resistor] === a.value && (a.kind === 'floor' ? a.value < PART_R_FLOOR : a.value > PART_R_MAX))) problems.push(`${a.kind} alert ${JSON.stringify(a)}`);
			} else if (a.kind === 'cap') {
				if (!(s.components[a.capacitor] === a.value && a.value < C_FLOOR)) problems.push(`cap alert ${JSON.stringify(a)}`);
			} else {
				// (on: the next stage's input made the load the least, null the stage's own network)
				const out = loadOf(res.stages, a.stage, a.opamp, a.freq, a.on === 'next' ? 'stage' : null, true);
				const raw = out.v / out.i;
				if (a.atInput) {
					// the output swings less than the input there: read at the input's full swing
					atInput++;
					const full = 1 / gainBefore(res.stages, a.stage, a.freq) / out.i;
					if (!(out.v * out.i > 0 && full > raw && Math.abs(full / a.load - 1) < 1e-6 && a.load < PART_LOAD_MIN)) problems.push(`load alert ${JSON.stringify(a)}: the solver finds ${full.toFixed(1)} ohm at full swing (${raw.toFixed(1)} ohm alone)`);
				} else if (!(Math.abs(raw / a.load - 1) < 1e-6 && a.load < PART_LOAD_MIN)) problems.push(`load alert ${JSON.stringify(a)}: the solver finds ${raw.toFixed(1)} ohm`);
			}
			if (a.manual !== (res === r && a.stage === 0)) problems.push(`alert on stage ${a.stage + 1}: manual ${a.manual}`);
			checked++;
		}
		const kinds = new Set(r.alerts.map((a) => a.kind));
		// (typed capacitors keep their rule: honoured, that stage alone given way and flagged, every other stage within the limits)
		if (!(kinds.has('floor') && kinds.has('load') && r.alerts.every((a) => a.stage === 0) && r.withinLimits === true && r.relaxed[0] === 'floor' && r.stages[0].components.C1 === 1e-7 && r.stages[0].manual)) problems.push(`elliptic with 100 nF: alerts ${[...kinds]}, within ${r.withinLimits}, relaxed ${r.relaxed}, C1 ${r.stages[0].components.C1}`);
		if (!ra || !ra.alerts.length) problems.push('the band-stop on the edge on the lab kit: no set past the limits with its alerts');
		check(
			'floor and loads: within the limits every searched resistor is from 1 kohm to 1 Mohm, every capacitor 47 pF or more and every op-amp output sees 2 kohm or more over the passband (the checks\' own nodal solve, the next stage and the summing resistor on it); past them (capacitors typed, a set past the limits) each alert names a part past its bound or a load the solver finds, and says the capacitors were typed',
			problems.length === 0 && checked >= 3 && atInput >= 1,
			problems.length ? problems.slice(0, 3).join('; ') : `${rows.join(', ')}; ${checked} alerts confirmed, ${atInput} read at the input's full swing`
		);
	}

	// (h) The capacitors typed by hand (farads here, nF on the page): the
	// default low-pass on the lab kit with 100 nF / 4.7 nF and 47 nF / 1 nF.
	// The search keeps them, picks the resistors around them, and meets the
	// template where the designers alone left Amax 0.05 dB over at fp; it
	// needs resistors under the floor and loads under 2 kohm for that, and
	// says so on both stages.
	{
		const overrides = { 0: { C1: 1e-7, C2: 4.7e-9 }, 1: { C1: 4.7e-8, C2: 1e-9 } };
		const rows = [];
		const problems = [];
		for (const placement of ['edge', 'centred']) {
			const d = designLowPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement });
			const r = searchFilterParts(d, { menus: cascade('mfb'), ...lab, overrides });
			const kept = r.stages.every((s, i) => s.components.C1 === overrides[i].C1 && s.components.C2 === overrides[i].C2 && s.manual);
			const flagged = [0, 1].every((i) => r.alerts.some((a) => a.stage === i && a.manual));
			const today = r.baseline.measure;
			if (!kept || !flagged || !r.measure.meets || r.measure.margin < today.margin + 0.5) problems.push(`${placement}: kept ${kept}, flagged ${flagged}, ${r.measure.margin.toFixed(3)} against today's ${today.margin.toFixed(3)}`);
			rows.push(`${placement}: today ${today.passEdges[0].loss.toFixed(3)} dB at fp, search ${r.measure.passEdges[0].loss.toFixed(3)} / ${r.measure.stop.db.toFixed(2)} dB (${r.measure.margin >= 0 ? '+' : ''}${r.measure.margin.toFixed(3)})`);
		}
		check('capacitors typed by hand: kept on both stages, the resistors searched around them, the template met with at least 0.5 dB more margin than the designers alone, and the floor and loads they need flagged on both stages', problems.length === 0, problems.length ? problems.join('; ') : rows.join('; '));
	}

	// (i) The downloaded script reproduces the page: the parts, the response
	// at the points it prints, the verdict and the notes on the limits word
	// for word (limitAlertText, the op-amp named as the page names it), for
	// every type, both band methods, both placements, the stocks, pairs under
	// a limit, the capacitors typed, the op-amp of a transformed band-pass,
	// a source resistance (SOURCE_R, the band-stop's shared node among them)
	// and the set past the limits (PAST_LIMITS); and a script placed on the
	// edge, or without the source, is told apart from the page
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-search-'));
		const base = { amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {}, response: 'butterworth', topology: 'mfb' };
		const kit = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
		const cases = [
			['low-pass, lab kit', { filterType: 'lowpass', ...kit }],
			['high-pass, Sallen-Key, E24', { filterType: 'highpass', fs: 3000, topology: 'sallenKey' }],
			['band-pass cascade, Tow-Thomas, lab resistors', { filterType: 'bandpass', topology: 'towThomas', resistorStock: LAB_KIT.resistors }],
			['band-stop of two branches, lab kit', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, ...kit }],
			['narrow band-pass transformed, TL082, lab kit, 2 pairs', { filterType: 'bandpass', fl: 40000, fh: 60000, fsl: 10000, fsh: 100000, aminDbHp: 50, aminDbLp: 30, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.TL082, ...kit, resistorPairs: true, resistorPairLimit: 2 }],
			['band-stop transformed, Boctor, E96', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', resistorStock: 'E96' }],
			['elliptic low-pass, Tow-Thomas, lab kit, 10 nF typed', { filterType: 'lowpass', response: 'elliptic', amaxDb: 1, fs: 20000, topology: 'towThomas', ...kit, capOverrides: { 0: { C: 1e-8 } } }],
			['low-pass, lab kit, capacitors typed, LTspice on a TL082', { filterType: 'lowpass', ...kit, capOverrides: { 0: { C1: 1e-7, C2: 4.7e-9 }, 1: { C1: 4.7e-8, C2: 1e-9 } }, spiceOpamp: 'TL082' }],
			['Chebyshev high-pass, Tow-Thomas, lab kit, 1 pair', { filterType: 'highpass', response: 'chebyshev', amaxDb: 1, fp: 3000, fs: 1000, topology: 'towThomas', ...kit, resistorPairs: true, resistorPairLimit: 1 }],
			// the page's defaults: a 50 ohm source, the LTspice file on a TL082, the MFB stages built for an LM741
			['the default band-pass, transformed, MFB for the LM741, lab kit, 50 ohm source', { filterType: 'bandpass', bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.LM741, mfbOpamp: 'LM741', spiceOpamp: 'TL082', ...kit, sourceR: SOURCE_R_DEFAULT }],
			['low-pass, Sallen-Key, E24, 600 ohm source', { filterType: 'lowpass', response: 'chebyshev', amaxDb: 1, fs: 25000, topology: 'sallenKey', sourceR: 600, spiceOpamp: 'LM741' }],
			['band-stop of two branches, MFB, E24, 600 ohm source', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, sourceR: 600 }],
			// within the limits it misses on the edge; past them a set meets: shown with PAST_LIMITS, the alerts naming the LM741 of the LTspice file
			['band-stop transformed, Boctor, lab kit, 50 ohm source, past the limits', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', ...kit, sourceR: SOURCE_R_DEFAULT, pastLimits: true, spiceOpamp: 'LM741' }],
			['band-stop transformed, Boctor, lab kit, 50 ohm source, within the limits', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', ...kit, sourceR: SOURCE_R_DEFAULT, spiceOpamp: 'ideal' }],
			// past the limits, the load alerts of MFB band-pass stages built for an LM741 name it, the LTspice file on a TL082
			// (centred only: on the edge an LM741 leaves a stage a loop gain under 2, and the page, like the script, refuses it)
			['Chebyshev band-pass transformed, MFB for the LM741, lab resistors, past the limits', { filterType: 'bandpass', response: 'chebyshev', amaxDb: 1, fl: 10000, fh: 40000, fsl: 3000, fsh: 120000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.LM741, mfbOpamp: 'LM741', spiceOpamp: 'TL082', resistorStock: LAB_KIT.resistors, pastLimits: true }, ['centred']]
		];
		const run = (name, code) => {
			const file = join(dir, `${name.replace(/\W+/g, '-')}.js`);
			writeFileSync(file, code);
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return `${e.stdout ?? ''}ERROR ${e.stderr || e.message}`;
			}
		};
		const problems = [];
		let compared = 0;
		let notesShown = 0;
		let alternatives = 0;
		let withSource = 0;
		const named = new Set();
		for (const [label, spec, placements = ['edge', 'centred']] of cases) {
			for (const placement of placements) {
				const args = { ...base, ...spec, placement };
				const code = generateScript(args);
				if (!new RegExp(`^const PLACEMENT = "${placement}";`, 'm').test(code)) problems.push(`${label}: no PLACEMENT = "${placement}"`);
				if (!new RegExp(`^const SOURCE_R = ${spec.sourceR ?? 0};`, 'm').test(code) || !new RegExp(`^const PAST_LIMITS = ${Boolean(spec.pastLimits)};`, 'm').test(code)) problems.push(`${label}: SOURCE_R or PAST_LIMITS not written as asked`);
				const out = run(`${label} ${placement}`, code);
				const page = pageParts(args);
				compared++;
				// (the notes too, word for word: page.opamp is the op-amp the page's alerts name)
				const wrong = partsProblems(out, page);
				if (wrong.length) problems.push(`${label} ${placement}: ${wrong[0]}`);
				// the placement section and the search's notes, as the page's result has them
				if (!out.includes(placement === 'edge' ? 'PLACEMENT (on the passband edge)' : 'PLACEMENT (centred in the template)')) problems.push(`${label} ${placement}: no placement section`);
				const text = limitAlertText(page.result, page.opamp);
				notesShown += text.stages.length;
				for (const [name, phrase] of [['LM741', / an LM741 needs to swing/], ['TL082', / a TL082 needs to swing/], ['general', / a general-purpose op-amp such as the TL082 or the LM741 needs to swing/]]) if (phrase.test(out)) named.add(name);
				const fromSearch = (out.match(/^ {2}parts from the search/gm) ?? []).length;
				if (fromSearch !== page.result.picks.filter((p) => p === 'search').length) problems.push(`${label} ${placement}: ${fromSearch} stages from the search against ${page.result.picks.filter((p) => p === 'search').length}`);
				// the set past the limits, shown with PAST_LIMITS when the page offers one
				if (page.result !== page.found) {
					alternatives++;
					if (!page.result.pastLimits || !page.result.measure.meets || page.found.measure.meets || !/These parts meet the template past the limits/.test(out)) problems.push(`${label} ${placement}: the set past the limits`);
				}
				// the source: its line, and the figures of the stage(s) on the input with it
				if (spec.sourceR > 0) {
					withSource++;
					const figures = page.result.source?.figures ?? [];
					if (!out.includes(`source: ${spec.sourceR} ohm in series with the input (SOURCE_R)`) || (out.match(/^ {2}with the source \(/gm) ?? []).length !== figures.length || !figures.length) problems.push(`${label} ${placement}: the source's lines (${figures.length} figures)`);
				}
			}
		}
		// the edge script against the centred page, and the script without the source against the page with it: told apart
		const args = { ...base, filterType: 'lowpass', ...kit };
		const edgeOut = run('control', generateScript({ ...args, placement: 'edge' }));
		const control = partsProblems(edgeOut, pageParts({ ...args, placement: 'centred' })).length > 0;
		const sk = { ...base, ...cases.find(([l]) => /Sallen-Key, E24, 600/.test(l))[1], placement: 'centred' };
		const noSource = run('control-source', generateScript({ ...sk, sourceR: 0 }));
		const controlSource = partsProblems(noSource, pageParts(sk)).length > 0;
		check(
			`downloadable script: ${compared} scripts (every type, both band methods, both placements, stocks, pairs, capacitors typed, the TL082 and the LM741, ${withSource} with a source resistance, ${alternatives} past the limits) print the page's parts, response, verdict, placement and notes word for word, and an edge script, or one without the source, is told apart from the page`,
			problems.length === 0 && control && controlSource && notesShown > 0 && alternatives >= 2 && withSource >= 8 && named.has('LM741') && named.has('TL082') && named.has('general'),
			problems.length ? problems.slice(0, 3).join('; ') : `${notesShown} notes, the op-amp named: ${[...named].join(', ')}`
		);
	}

	// (j) The script is one scope: every top-level name of the inlined
	// library and the report is declared once (a second function of the same
	// name would silently replace the first), and every import of an inlined
	// module fits on one line (inline() drops the import lines)
	{
		const problems = [];
		for (const args of [{ filterType: 'lowpass', response: 'butterworth', topology: 'mfb', fp: 10000, fs: 35000, amaxDb: 3, aminDb: 40, order: null, capOverrides: {} }, { filterType: 'bandpass', response: 'butterworth', topology: 'mfb', amaxDb: 3, aminDb: 40, fl: 40000, fh: 60000, fsl: 10000, fsh: 100000, bandMethod: 'transformed', opampGbw: OPAMP_GBW.TL082, resistorStock: LAB_KIT.resistors, resistorPairs: true, resistorPairLimit: 2, capOverrides: {}, placement: 'centred' }]) {
			const code = generateScript(args);
			const seen = new Map();
			for (const line of code.split('\n')) {
				const m = /^(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/.exec(line) || /^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
				if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
			}
			const dups = [...seen].filter(([, n]) => n > 1).map(([name]) => name);
			if (dups.length) problems.push(`${args.filterType}: ${dups.join(', ')}`);
			if (/^import\s/m.test(code) || /^export\s/m.test(code)) problems.push(`${args.filterType}: an import or export left`);
		}
		const { readFileSync } = await import('node:fs');
		for (const name of ['eseries', 'format', 'order', 'approximations', 'stages', 'mfb', 'mfbHighPass', 'mfbBandPass', 'sallenKey', 'sallenKeyHighPass', 'towThomas', 'boctor', 'bandMethod', 'firstOrder', 'firstOrderHighPass', 'pairPlan', 'stageElements', 'nodal', 'bode', 'sensitivity', 'partSearch']) {
			const src = readFileSync(new URL(`../src/lib/filter/${name}.js`, import.meta.url), 'utf8');
			for (const line of src.split('\n')) if (/^import\s/.test(line) && !/from\s+'[^']+';?\s*$/.test(line)) problems.push(`${name}.js: ${line.slice(0, 60)}`);
		}
		check('downloadable script: one scope, every top-level name declared once, every import of an inlined module on one line', problems.length === 0, problems.join('; '));
	}

	// (k) Time: the worst cases of the page's settings, each searched cold
	// (specs not searched above, so nothing is remembered): order 16 on the
	// lab kit with pairs under a limit of 4, a band-stop of 16 + 16 on the lab
	// resistors with pairs, an elliptic of order 12 on Tow-Thomas, and the
	// families whose designers take longest (Boctor and a transformed
	// band-pass of MFB stages built for the TL082, the lab resistors with
	// pairs: every list of names to pair is built for the pair limits). The
	// page reruns after a pause in the typing, so order 16 on the lab kit
	// stays under 300 ms and every case under 400 ms; the same settings
	// again come from memory. Since every stage of a transformed design is
	// searched (MFB and Tow-Thomas band-pass, Boctor and Tow-Thomas notches)
	// and the source resistance came in, the transformations at the page's
	// order limit on the lab kit with pairs (16 MFB band-pass stages built
	// for the TL082, 16 Boctor and Tow-Thomas notch stages) are timed too,
	// with no source and with the page's 50 ohm. Cold in a fresh node
	// process they took (Nov 2026) 461 and 587 ms, 580 and 676 ms: more than
	// here, where the engine has run every check above first. Here they take
	// 410 to 525 ms, over the 0.4 s of the other cases: searching every stage
	// within the limits costs that much at 16 stages with pairs, and cutting it
	// back cost parts that meet the template. Their own bound is 0.65 s; in the
	// browser the page's worst pause measured about 0.3 s
	{
		const cases = [
			['low-pass, order 16, lab kit, pairs, N = 4', designLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 60, fp: 9900, fs: 12900, order: 16, placement: 'centred' }), cascade('mfb'), componentOptions('lab', '', '', true, 4)],
			['band-stop, 16 + 16, lab resistors, pairs, N = 2', designBandStop({ response: 'butterworth', amaxDb: 1, aminDb: 60, fl: 990, fh: 29900, fsl: 1290, fsh: 22900, orderLow: 16, orderHigh: 16, placement: 'centred' }), cascade('mfb'), componentOptions('labR', '', '', true, 2)],
			['elliptic low-pass, order 12, Tow-Thomas, lab kit, N = 4', designLowPass({ response: 'elliptic', amaxDb: 0.5, aminDb: 80, fp: 9900, fs: 10900, order: 12, placement: 'centred' }), cascade('towThomas'), componentOptions('lab', '', '', true, 4)],
			['Chebyshev low-pass, order 16, Sallen-Key, E96', designLowPass({ response: 'chebyshev', amaxDb: 0.5, aminDb: 60, fp: 9900, fs: 10900, order: 16, placement: 'centred' }), cascade('sallenKey'), componentOptions('E96', '', '', false, null)],
			['inverse Chebyshev low-pass, Boctor, lab resistors, pairs', designLowPass({ response: 'inverseChebyshev', amaxDb: 0.1, aminDb: 39, fp: 6030, fs: 19500, order: null, placement: 'centred' }), cascade('boctor'), componentOptions('labR', '', '', true, null)],
			[
				'transformed band-pass, 16 stages, MFB for the TL082, lab resistors, pairs, N = 3',
				designBandPassTransformed({ response: 'butterworth', amaxDb: 1, aminDbLow: 45, aminDbHigh: 45, fl: 240, fh: 6990, fsl: 169, fsh: 52100, placement: 'centred' }),
				{ method: 'transformed', bandpass: 'mfb', notch: 'towThomas', gbw: OPAMP_GBW.TL082 },
				componentOptions('labR', '', '', true, 3)
			],
			[
				'transformed band-pass, 16 stages, MFB for the TL082, lab resistors, pairs, N = 3, 50 ohm source',
				designBandPassTransformed({ response: 'butterworth', amaxDb: 1, aminDbLow: 45, aminDbHigh: 45, fl: 240, fh: 6990, fsl: 169, fsh: 52100, placement: 'centred' }),
				{ method: 'transformed', bandpass: 'mfb', notch: 'towThomas', gbw: OPAMP_GBW.TL082 },
				componentOptions('labR', '', '', true, 3),
				SOURCE_R_DEFAULT
			],
			// the prototype at the page's order limit, 16: sixteen stages
			['transformed band-pass, 16 stages, MFB for the TL082, lab kit, pairs', designBandPassTransformed({ response: 'butterworth', amaxDb: 1, aminDbLow: 40, aminDbHigh: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: 16, placement: 'centred' }), { method: 'transformed', bandpass: 'mfb', notch: 'boctor', gbw: OPAMP_GBW.TL082 }, componentOptions('lab', '', '', true, null)],
			['transformed band-pass, 16 stages, MFB for the TL082, lab kit, pairs, 50 ohm source', designBandPassTransformed({ response: 'butterworth', amaxDb: 1, aminDbLow: 40, aminDbHigh: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: 16, placement: 'centred' }), { method: 'transformed', bandpass: 'mfb', notch: 'boctor', gbw: OPAMP_GBW.TL082 }, componentOptions('lab', '', '', true, null), SOURCE_R_DEFAULT],
			['transformed band-stop, 16 Boctor and Tow-Thomas notch stages, lab kit, pairs', designBandStopTransformed({ response: 'butterworth', amaxDb: 1, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, order: 16, placement: 'centred' }), { method: 'transformed', bandpass: 'mfb', notch: 'boctor' }, componentOptions('lab', '', '', true, null)],
			['transformed band-stop, 16 notch stages, lab kit, pairs, 50 ohm source', designBandStopTransformed({ response: 'butterworth', amaxDb: 1, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, order: 16, placement: 'centred' }), { method: 'transformed', bandpass: 'mfb', notch: 'boctor' }, componentOptions('lab', '', '', true, null), SOURCE_R_DEFAULT]
		];
		const times = [];
		let warm = 0;
		for (const [label, d, menus, stock, sourceR = 0] of cases) {
			const settings = { menus, ...stock, sourceR };
			const t0 = performance.now();
			const r = searchFilterParts(d, settings);
			const t1 = performance.now();
			const again = searchFilterParts(d, settings);
			warm = Math.max(warm, performance.now() - t1);
			if (again !== r || r.stages.some((s) => !s)) times.push([label, Infinity]);
			else times.push([label, t1 - t0]);
		}
		// (the cases from before, held to 0.4 s, then every 16-stage transformation with pairs, the earlier one with
		// lab resistors included (396 to 406 ms from run to run), to 0.65 s on their own line)
		const before = times.slice(0, 5);
		const atLimit = times.slice(5);
		const worst = Math.max(...before.map(([, ms]) => ms));
		const first = times[0][1];
		check(
			'time: the worst cases searched cold stay under 0.4 s (order 16 on the lab kit with pairs under 0.3 s), and the same settings again come from memory at once',
			first < 300 && worst < 400 && warm < 5,
			`${before.map(([label, ms]) => `${label} ${ms.toFixed(0)} ms`).join(', ')}; again ${warm.toFixed(2)} ms`
		);
		check(
			'time: the transformations at the page\'s order limit (16 stages, every one searched, lab kit or lab resistors with pairs, the TL082 pre-compensation, Boctor notches, no source and 50 ohm) stay under 0.65 s',
			atLimit.every(([, ms]) => ms < 650),
			atLimit.map(([label, ms]) => `${label} ${ms.toFixed(0)} ms`).join(', ')
		);
	}
}

// ------------------------------------- 14. limits first, every stage searched, the source
// The parts keep the limits first (every resistor from 1 kohm to 1 Mohm,
// every capacitor from 47 pF, every op-amp output loaded by 2 kohm or
// more), the best set within them is the answer even when it misses the
// template, and a set past them that meets comes along as the
// alternative; every stage of a transformed design is searched (the MFB
// and Tow-Thomas band-pass, the Boctor and Tow-Thomas notches); among sets
// as good, the values closer to 10 kohm and capacitors that are not tiny
// win; and the filter may be driven through a source resistance, the
// stages on the input node searched with it.
{
	const { designBandPassTransformed, designBandStopTransformed } = await import('../src/lib/filter/stages.js');
	const { stageElements } = await import('../src/lib/filter/stageElements.js');
	const { solveNodes } = await import('./lib-nodal.mjs');
	const { componentOptions } = await import('../src/lib/stock.js');
	const cascade = (topology) => ({ method: 'cascade', highpass: topology, lowpass: topology });
	const stockOf = (name) => {
		const o = componentOptions(name, '', '', false, null);
		return { ...o, combinerR: Array.isArray(o.resistorSeries) ? nearestResistor(10000, o.resistorSeries) : 10000 };
	};
	const resistorsOf = (s) => Object.entries(s.components).filter(([k, v]) => /^R/.test(k) && typeof v === 'number');
	const capacitorsOf = (s) => Object.entries(s.components).filter(([k, v]) => /^C/.test(k) && typeof v === 'number');
	const robert = (placement) => designBandPassTransformed({ response: 'butterworth', amaxDb: 3, aminDbLow: 40, aminDbHigh: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, placement });
	const transformedMenus = (gbw) => ({ method: 'transformed', bandpass: 'mfb', notch: 'boctor', ...(gbw ? { gbw } : {}) });

	// (a) Robert's default band-pass (transformed, MFB band-pass stages and
	// the Boctor notch menu, the lab kit): with the stages built for the
	// LM741 the page used to show stage 1 with R1 = 510 ohm and loads of 475
	// ohm, past the limits and missing the template. Now, for the LM741, the
	// TL082 and the ideal op-amp, on the edge and centred, with an ideal
	// source and the page's 50 ohm: within the limits (every resistor from 1
	// kohm, every load 2 kohm or more), meeting the template, no alert, and
	// every one of its four stages takes parts from its own search in some
	// of these cases (mfbBandPassCandidates)
	{
		const problems = [];
		const rows = [];
		const searched = new Set();
		const lab = stockOf('lab');
		for (const [part, gbw] of [['LM741', OPAMP_GBW.LM741], ['TL082', OPAMP_GBW.TL082], ['ideal', null]]) {
			for (const placement of ['edge', 'centred']) {
				for (const sourceR of [0, SOURCE_R_DEFAULT]) {
					const r = searchFilterParts(robert(placement), { menus: transformedMenus(gbw), ...lab, sourceR });
					const minR = Math.min(...r.stages.flatMap((s) => resistorsOf(s).map(([, v]) => v)));
					const maxR = Math.max(...r.stages.flatMap((s) => resistorsOf(s).map(([, v]) => v)));
					const minC = Math.min(...r.stages.flatMap((s) => capacitorsOf(s).map(([, v]) => v)));
					const minLoad = Math.min(...r.loads.map((l) => l.load));
					r.picks.forEach((p, i) => p === 'search' && searched.add(i));
					const ok = r.withinLimits === true && r.measure.meets && r.alerts.length === 0 && r.relaxed.every((x) => x === null) && r.stages.every((s) => s.topology === 'mfbBp') && minR >= PART_R_FLOOR && maxR <= PART_R_MAX && minC >= C_FLOOR && minLoad >= PART_LOAD_MIN;
					if (!ok) problems.push(`${part} ${placement} ${sourceR} ohm: margin ${r.measure.margin.toFixed(3)}, within ${r.withinLimits}, ${r.alerts.length} alerts, R ${minR} to ${maxR}, least load ${minLoad.toFixed(0)} ohm`);
					rows.push(`${part} ${placement} ${sourceR} ohm ${r.measure.margin.toFixed(2)} dB`);
				}
			}
		}
		check(
			"the default band-pass, transformed on MFB band-pass stages, lab kit: for the LM741, the TL082 and the ideal op-amp, on the edge and centred, with no source and a 50 ohm one, within the limits (every resistor from 1 kohm, every load 2 kohm or more), meeting the template, no alert, each of its stages searched",
			problems.length === 0 && searched.size === 4,
			problems.length ? problems.slice(0, 3).join('; ') : `${rows.join(', ')}; stages from their search: ${[...searched].map((i) => i + 1).join(', ')}`
		);
	}

	// (b) The bounds, on every default case of the page (low-pass, high-pass,
	// the band-pass both ways with the three op-amps, the band-stop both ways;
	// E24, E96, the lab kit and the lab resistors; both placements; no source
	// and 50 ohm): within the limits no resistor is over 1 Mohm, none under 1
	// kohm and no capacitor under 47 pF, anywhere; a load may give way only
	// where no candidate keeps it (relaxed 'load', flagged); the alerts name
	// exactly the parts past a bound; and a set past the limits offered
	// breaks one of them
	{
		const LP = { response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null };
		const BP = { response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 };
		const BS = { response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 };
		const designs = [
			['low-pass', (p) => designLowPass({ ...LP, placement: p }), cascade('mfb')],
			['high-pass', (p) => designHighPass({ ...LP, fs: 3000, placement: p }), cascade('mfb')],
			['band-pass cascade', (p) => designBandPass({ ...BP, placement: p }), cascade('mfb')],
			['band-pass transformed, TL082', robert, transformedMenus(OPAMP_GBW.TL082)],
			['band-pass transformed, LM741', robert, transformedMenus(OPAMP_GBW.LM741)],
			['band-pass transformed, ideal', robert, transformedMenus(null)],
			['band-stop of two branches', (p) => designBandStop({ ...BS, placement: p }), cascade('mfb')],
			['band-stop transformed', (p) => designBandStopTransformed({ response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: p }), transformedMenus(null)]
		];
		const problems = [];
		let cases = 0;
		let within = 0;
		let met = 0;
		const loadsGiven = [];
		const offered = [];
		for (const [label, make, menus] of designs) {
			for (const stock of ['E24', 'E96', 'lab', 'labR']) {
				for (const placement of ['edge', 'centred']) {
					for (const sourceR of [0, SOURCE_R_DEFAULT]) {
						const r = searchFilterParts(make(placement), { menus, ...stockOf(stock), sourceR });
						const name = `${label} ${stock} ${placement} ${sourceR} ohm`;
						cases++;
						if (r.measure.meets) met++;
						for (const [res, past] of [[r, false], ...(r.alternative ? [[r.alternative, true]] : [])]) {
							// every part past a bound, and the alerts that name them
							const out = res.stages.flatMap((s, i) => [...resistorsOf(s).filter(([, v]) => v < PART_R_FLOOR * (1 - 1e-9) || v > PART_R_MAX * (1 + 1e-9)), ...capacitorsOf(s).filter(([, v]) => v < C_FLOOR * (1 - 1e-9))].map(([k]) => `${i} ${k}`));
							const named = res.alerts.filter((a) => a.kind !== 'load').map((a) => `${a.stage} ${a.resistor ?? a.capacitor}`);
							if (out.length !== named.length || out.some((x) => !named.includes(x))) problems.push(`${name}${past ? ' past the limits' : ''}: parts past a bound ${out.join(', ') || 'none'}, alerts ${named.join(', ') || 'none'}`);
							if (past && !res.alerts.length) problems.push(`${name}: the set past the limits keeps them`);
							if (!past && res.withinLimits === true && out.length) problems.push(`${name}: within the limits, ${out.join(', ')}`);
						}
						if (r.withinLimits !== true) problems.push(`${name}: no set within the limits (${r.withinLimits})`);
						else within++;
						if (r.relaxed.some((x) => x !== null && x !== 'load')) problems.push(`${name}: relaxed ${r.relaxed.join(',')}`);
						if (r.relaxed.some((x) => x === 'load')) loadsGiven.push(`${label} ${stock}`);
						if (r.alternative) offered.push(`${label} ${stock} ${placement} ${sourceR} ohm (${r.measure.margin.toFixed(2)} -> ${r.alternative.measure.margin.toFixed(2)} dB)`);
					}
				}
			}
		}
		check(
			`bounds: ${cases} default cases of the page (every type, both band methods, the three op-amps, four stocks, both placements, no source and 50 ohm) keep the limits: no resistor under 1 kohm or over 1 Mohm, no capacitor under 47 pF, a load given way only where no candidate keeps it; the alerts name every part past a bound, and every set past the limits offered breaks one`,
			problems.length === 0 && within === cases,
			problems.length ? problems.slice(0, 3).join('; ') : `${met} of ${cases} meet the template; loads given way: ${[...new Set(loadsGiven)].join(', ') || 'none'}; past the limits offered: ${offered.join(', ') || 'none'}`
		);
	}

	// (c) Limits first, the other offered: the default band-stop transformed
	// on the lab kit and on the lab resistors, on the edge (no source and 50
	// ohm). The best set within the limits misses the template; a set past
	// them meets it and comes along whole (its own stages, measure, alerts,
	// pastLimits, withinMargin the margin of the parts within), with no
	// alternative of its own; the alert text offers it with its margin, and
	// over it says why it is past the limits. Centred, the set within the
	// limits meets, and nothing is offered
	{
		const problems = [];
		const rows = [];
		for (const stock of ['lab', 'labR']) {
			for (const sourceR of [0, SOURCE_R_DEFAULT]) {
				const make = (p) => designBandStopTransformed({ response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: p });
				const r = searchFilterParts(make('edge'), { menus: transformedMenus(null), ...stockOf(stock), sourceR });
				const a = r.alternative;
				const name = `${stock} ${sourceR} ohm`;
				if (!(r.withinLimits === true && !r.measure.meets && r.alerts.length === 0 && a)) {
					problems.push(`${name}: within ${r.withinLimits}, meets ${r.measure.meets}, ${r.alerts.length} alerts, alternative ${Boolean(a)}`);
					continue;
				}
				const text = limitAlertText(r, null);
				const past = limitAlertText(a, null);
				const offer = `Parts past the limits meet the template, with ${a.measure.margin.toFixed(2)} dB of margin.`;
				const why = `These parts meet the template past the limits: the best set within them misses it by ${(-r.measure.margin).toFixed(2)} dB.`;
				if (!(a.measure.meets && a.pastLimits === true && a.withinLimits === false && a.alternative === null && a.withinMargin === r.measure.margin && a.alerts.length > 0 && a.stages.length === r.stages.length && a.sourceR === r.sourceR)) problems.push(`${name}: the alternative ${JSON.stringify({ meets: a.measure.meets, past: a.pastLimits, within: a.withinLimits, alerts: a.alerts.length })}`);
				if (text.offer !== offer || text.stages.length || !past.summary.endsWith(why) || past.offer || !past.stages.length) problems.push(`${name}: the text "${text.offer}" / "${past.summary}"`);
				const centred = searchFilterParts(make('centred'), { menus: transformedMenus(null), ...stockOf(stock), sourceR });
				if (!(centred.measure.meets && centred.withinLimits === true && centred.alternative === null && limitAlertText(centred).offer === '')) problems.push(`${name} centred: meets ${centred.measure.meets}, alternative ${Boolean(centred.alternative)}`);
				rows.push(`${name} ${r.measure.margin.toFixed(2)} -> ${a.measure.margin.toFixed(2)} dB`);
			}
		}
		check('limits first: the best set within the limits is kept even when it misses (the default band-stop transformed on the edge, lab kit and lab resistors), the set past them that meets offered whole with its alerts and margins, the alert text offering it and, shown, saying why', problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : rows.join(', '));
	}

	// (d) Sensible values: the default low-pass on the lab kit (Butterworth
	// 3/40 dB, 10 and 35 kHz, MFB). bee16b2 picked 150k / 47k / 150k with 680
	// pF and 47 pF centred (mean ln^2(R / 10 kohm) 3.72) and 68k / 56k / 68k
	// with 1 nF and 68 pF, 220k / 33k / 220k on the edge (5.14). Among the
	// sets within PART_MARGIN_TOLERANCE_DB of the best margin (up to the ideal
	// design's) and as close to the ideal response, the one nearer 10 kohm
	// with no tiny capacitor wins: resistors of a few kohm to a few tens of
	// kohm, every capacitor 220 pF or more, the template still met with the
	// ideal design's margin, less the tolerance
	{
		const BEE = { centred: 3.718, edge: 5.1419 };
		const problems = [];
		const rows = [];
		for (const placement of ['centred', 'edge']) {
			const r = searchFilterParts(designLowPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement }), { menus: cascade('mfb'), ...stockOf('lab') });
			const R = r.stages.flatMap((s) => resistorsOf(s).map(([, v]) => v));
			const C = r.stages.flatMap((s) => capacitorsOf(s).map(([, v]) => v));
			const ln2 = R.reduce((sum, v) => sum + Math.log(v / 1e4) ** 2, 0) / R.length;
			if (!(r.measure.meets && r.measure.margin >= r.ideal.margin - PART_MARGIN_TOLERANCE_DB && Math.min(...R) >= 1000 && Math.max(...R) <= 100000 && Math.min(...C) >= 220e-12 && ln2 < BEE[placement] / 3)) problems.push(`${placement}: margin ${r.measure.margin.toFixed(3)} (ideal ${r.ideal.margin.toFixed(3)}), R ${Math.min(...R)} to ${Math.max(...R)}, least C ${Math.min(...C)}, ln2 ${ln2.toFixed(3)}`);
			rows.push(`${placement}: ${r.stages.map((s) => Object.values(s.components).map((v) => spiceValue(v)).join(' ')).join(' | ')} (ln2 ${ln2.toFixed(2)} against ${BEE[placement]})`);
		}
		check('sensible values: the default low-pass on the lab kit takes resistors from 1 to 100 kohm and capacitors of 220 pF or more, nearer 10 kohm than bee16b2 by a factor of 3 or more, and still meets the template with the ideal design\'s margin within PART_MARGIN_TOLERANCE_DB', problems.length === 0, problems.length ? problems.join('; ') : rows.join('; '));
	}

	// (e) The source. With sourceR 0, or none given, or one that is not a
	// positive number, the search gives the same result as the search
	// without a source (the same parts, the same measure), with no source
	// figures, and its measure is bode.js's response (magnitudePhaseAt, or
	// magnitudePhaseAtParallelSum with the combiner's weights)
	{
		const LP = { response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' };
		const samples = [
			['low-pass, MFB, lab kit', designLowPass(LP), cascade('mfb'), 'lab'],
			['Chebyshev high-pass, Tow-Thomas, lab resistors', designHighPass({ ...LP, response: 'chebyshev', amaxDb: 1, fp: 3000, fs: 1000 }), cascade('towThomas'), 'labR'],
			['band-stop of two branches, Sallen-Key, E96', designBandStop({ response: 'bessel', amaxDb: 3, aminDb: 30, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: 'edge' }), cascade('sallenKey'), 'E96'],
			['the default band-pass, transformed, LM741, lab kit', robert('centred'), transformedMenus(OPAMP_GBW.LM741), 'lab'],
			['elliptic band-stop transformed, Boctor, E24', designBandStopTransformed({ response: 'elliptic', amaxDb: 1, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: 'centred' }), transformedMenus(null), 'E24']
		];
		const problems = [];
		const partsOf = (r) => JSON.stringify([r.stages.map((s) => s.components), r.measure.margin, r.alerts, r.alternative ? r.alternative.stages.map((s) => s.components) : null]);
		for (const [label, d, menus, stock] of samples) {
			const settings = { menus, ...stockOf(stock) };
			const none = searchFilterParts(d, settings);
			for (const sourceR of [0, -50, NaN, undefined]) {
				const r = searchFilterParts(d, { ...settings, sourceR });
				if (partsOf(r) !== partsOf(none) || r.source !== null || r.sourceR !== 0 || r.measure.sourceR !== 0) problems.push(`${label} with sourceR ${sourceR}: not the same as without a source`);
			}
			const t = none.measure.template;
			const branches = t.parallel ? [none.stages.slice(0, t.lpCount), none.stages.slice(t.lpCount)] : null;
			const bode = (f) => (branches ? magnitudePhaseAtParallelSum(branches, f, none.measure.combiner.weights) : magnitudePhaseAt(none.stages, f));
			for (const f of [37, 300, 1000, 4100, 10000, 29000, 1e5]) {
				const a = none.measure.magnitudePhaseAt(f);
				const b = bode(f);
				if (Math.abs(a.db - b.db) > 1e-9 || Math.abs(none.measure.gainDbAt(f) - b.db) > 1e-9 || (b.db > -200 && Math.abs(((a.deg - b.deg + 540) % 360) - 180) > 1e-6)) problems.push(`${label} at ${f} Hz: ${a.db} dB ${a.deg} deg against bode.js ${b.db} dB ${b.deg} deg`);
			}
		}
		check('source resistance 0 (or none given, or not a positive number): the search gives the same parts and measure as without a source, no source figures, and its measure is bode.js\'s response, magnitude and phase', problems.length === 0, problems.slice(0, 3).join('; ') || `${samples.length} designs, 4 ways to say none`);
	}

	// (f) With a source: every stage on the input node (the first stage of a
	// cascade or a transformed design, both first stages of a band-stop's two
	// branches) is solved here with the source in series, by the checks' own
	// nodal solver (lib-nodal.mjs) on the stage netlists, the band-stop's two
	// branches on the one node (V1, RS, then every stage from vin), and the
	// page's measure (measureFilter with sourceR) gives that response, complex,
	// within rounding. The figures with the source (filterSource) give each
	// stage on the input node its response from the source's own voltage, and
	// where the source adds to one input resistor (MFB and Sallen-Key low-pass
	// R1, a first-order stage's R) their f0, Q and gain (tau) are those of the
	// stage with R + Rs exactly. No alert concerns the source: it is not an
	// op-amp output
	{
		const forSolver = (els) => els.map((e) => (e.kind === 'OP' ? { kind: 'OP', name: e.name, p: e.nodes[0], m: e.nodes[1], out: e.nodes[2] } : e.kind === 'V' ? { kind: 'V', name: e.name, a: e.nodes[0], b: e.nodes[1] } : { kind: e.kind, name: e.name, a: e.nodes[0], b: e.nodes[1], value: e.value }));
		const cx = (re, im) => ({ re, im });
		const rel = (a, b) => Math.hypot(a.re - b.re, a.im - b.im) / Math.max(Math.hypot(b.re, b.im), 1e-300);
		const LP = { response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' };
		const BS = { response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: 'centred' };
		const designs = [
			['low-pass, MFB', designLowPass(LP), cascade('mfb'), 'lab'],
			['low-pass of order 5, Sallen-Key (a first-order stage first)', designLowPass({ ...LP, order: 5 }), cascade('sallenKey'), 'E24'],
			['Chebyshev low-pass, Sallen-Key', designLowPass({ ...LP, response: 'chebyshev', amaxDb: 1, fs: 25000 }), cascade('sallenKey'), 'E96'],
			['low-pass, Tow-Thomas', designLowPass(LP), cascade('towThomas'), 'labR'],
			['high-pass, MFB', designHighPass({ ...LP, fs: 3000 }), cascade('mfb'), 'lab'],
			['high-pass of order 5, Sallen-Key', designHighPass({ ...LP, fs: 3000, order: 5 }), cascade('sallenKey'), 'E24'],
			['Chebyshev high-pass, Tow-Thomas', designHighPass({ ...LP, response: 'chebyshev', amaxDb: 1, fp: 3000, fs: 1000 }), cascade('towThomas'), 'labR'],
			['elliptic low-pass, Boctor', designLowPass({ ...LP, response: 'elliptic', amaxDb: 1, fs: 20000 }), cascade('boctor'), 'E24'],
			['elliptic high-pass, Tow-Thomas notches', designHighPass({ ...LP, response: 'elliptic', amaxDb: 1, fs: 5000 }), cascade('towThomas'), 'E96'],
			['the default band-pass, transformed, MFB for the LM741', robert('centred'), transformedMenus(OPAMP_GBW.LM741), 'lab', OPAMP_GBW.LM741],
			['band-pass transformed, Tow-Thomas band-pass stages', robert('edge'), { method: 'transformed', bandpass: 'towThomas', notch: 'towThomas' }, 'E24'],
			['band-stop transformed, Boctor notches', designBandStopTransformed(BS), transformedMenus(null), 'lab'],
			['band-stop of two branches, MFB', designBandStop(BS), cascade('mfb'), 'lab'],
			['band-stop of two branches, Sallen-Key', designBandStop(BS), cascade('sallenKey'), 'E96'],
			['band-stop of two branches, Tow-Thomas', designBandStop(BS), cascade('towThomas'), 'labR']
		];
		const problems = [];
		let worst = 0;
		let worstFig = 0;
		let exact = 0;
		let solved = 0;
		for (const [label, d, menus, stock, gbw] of designs) {
			for (const sourceR of [SOURCE_R_DEFAULT, 600, 4700]) {
				const r = searchFilterParts(d, { menus, ...stockOf(stock), sourceR });
				const t = r.measure.template;
				const n = r.stages.length;
				const opamp = gbw ? { aol: Infinity, gbw } : null;
				// the whole filter from V1 through RS: a chain, or two branches from vin
				const els = [{ kind: 'V', name: 'V1', nodes: ['vs', '0'] }, { kind: 'R', name: 'RS', nodes: ['vs', 'vin'], value: sourceR }];
				const outs = [];
				const chain = (from, to, start, end) => {
					for (let i = start; i < end; i++) {
						const a = i === start ? from : `n${i}`;
						const b = i === end - 1 ? to : `n${i + 1}`;
						els.push(...stageElements(r.stages[i], i, a, b));
						outs[i] = b;
					}
				};
				if (t.parallel) {
					chain('vin', 'lpout', 0, t.lpCount);
					chain('vin', 'hpout', t.lpCount, n);
				} else chain('vin', 'vout', 0, n);
				const solver = forSolver(els);
				const lo = Math.min(...t.stop.map((x) => x.from), ...t.pass.map((x) => x.from));
				const hi = Math.max(...t.stop.map((x) => x.to), ...t.pass.map((x) => x.to));
				for (let k = 0; k <= 30; k++) {
					const f = lo * (hi / lo) ** (k / 30);
					const v = solveNodes(solver, f, opamp);
					const w = t.parallel ? r.measure.combiner.weights : null;
					const sim = t.parallel ? cx(w[0] * v.get('lpout').re + w[1] * v.get('hpout').re, w[0] * v.get('lpout').im + w[1] * v.get('hpout').im) : v.get('vout');
					const want = r.measure.responseAt(f);
					// (deep in a band-stop's notch both are next to nothing)
					if (Math.hypot(want.re, want.im) < 1e-9) continue;
					const e = rel(sim, want);
					worst = Math.max(worst, e);
					if (e > 1e-6) problems.push(`${label}, ${sourceR} ohm, at ${f.toFixed(0)} Hz: the solver ${JSON.stringify(sim)}, the page ${JSON.stringify(want)}`);
					// each stage on the input node: its output from the source's own voltage
					for (const fig of r.source.figures) {
						const ef = rel(v.get(outs[fig.stage]), fig.responseAt(f));
						worstFig = Math.max(worstFig, ef);
						if (ef > 1e-6) problems.push(`${label}, ${sourceR} ohm: stage ${fig.stage + 1}'s figures at ${f.toFixed(0)} Hz`);
					}
				}
				solved++;
				const inputs = t.parallel ? [0, t.lpCount] : [0];
				if (JSON.stringify(r.source.inputs) !== JSON.stringify(inputs) || r.source.shared !== t.parallel || r.source.figures.length !== inputs.length) problems.push(`${label}, ${sourceR} ohm: the source on stages ${r.source.inputs}`);
				// where the source adds to the one input resistor of a cascade's first stage (MFB or Sallen-Key low-pass R1, a
				// first-order R), its figures with the source are the stage's own form with R + Rs: that low-pass of f0, Q and
				// gain (or tau), evaluated, is the solver's output of the stage, from the source's own voltage
				for (const fig of r.source.figures) {
					const s = r.stages[fig.stage];
					if (!fig.adds || !['mfb', 'sallenKey', 'firstOrder'].includes(s.topology)) continue;
					const w = fig.with;
					let e = 0;
					const own = (s.actual.wn ?? 1 / s.actual.tau) / (2 * Math.PI);
					for (const f of [lo, Math.sqrt(lo * hi), hi, 0.37 * own, own, 1.9 * own]) {
						const x = 2 * Math.PI * f;
						const biquad = s.order === 1 ? { re: 1, im: x * w.tau } : { re: w.wn * w.wn - x * x, im: (x * w.wn) / w.q };
						const k = s.order === 1 ? 1 : w.gain * w.wn * w.wn;
						const d2 = biquad.re * biquad.re + biquad.im * biquad.im;
						const form = { re: (k * biquad.re) / d2, im: (-k * biquad.im) / d2 };
						e = Math.max(e, rel(solveNodes(solver, f, opamp).get(outs[fig.stage]), form));
					}
					if (e > 1e-9) problems.push(`${label}, ${sourceR} ohm: stage ${fig.stage + 1} with ${fig.adds} + Rs, its figures ${JSON.stringify(w)} off by ${e.toExponential(1)}`);
					else exact++;
				}
				if (r.alerts.some((a) => !(a.stage >= 0 && a.stage < n)) || r.loads.length !== n) problems.push(`${label}, ${sourceR} ohm: an alert or a load off the stages`);
			}
		}
		check(
			`source resistance (50, 600 and 4700 ohm): the page's measure is the response the checks' own nodal solve gives with RS in series (${designs.length} designs, every circuit first, the band-stop's two branches on one node), each stage on the input node's figures its response from the source, exact where the source adds to R1 or R`,
			problems.length === 0 && exact >= 9 && solved === 3 * designs.length,
			problems.length ? problems.slice(0, 3).join('; ') : `worst ${worst.toExponential(1)} on the whole, ${worstFig.toExponential(1)} on the input stages; ${exact} figures with R + Rs exact`
		);
	}

	// (g) The first stage compensates where it can: the parts searched with
	// the source never rank below the parts searched without it, driven
	// through it (the template met first, then the margin up to the ideal
	// design's, within PART_MARGIN_TOLERANCE_DB that sensible values may
	// trade), on the page's defaults and at 50 and 600 ohm; and where the
	// parts for an ideal source miss through 600 ohm, those searched with it
	// meet: a Sallen-Key low-pass (the source adds to R1), an MFB high-pass
	// (a capacitor input: the exact measure moves its parts) and the
	// band-stop of two branches (the one node both share)
	{
		const LP = { response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' };
		const designs = [
			['low-pass, MFB', designLowPass(LP), cascade('mfb')],
			['Chebyshev low-pass, Sallen-Key', designLowPass({ ...LP, response: 'chebyshev', amaxDb: 1, fs: 25000 }), cascade('sallenKey')],
			['high-pass, MFB', designHighPass({ ...LP, fs: 3000 }), cascade('mfb')],
			['Chebyshev high-pass, Tow-Thomas', designHighPass({ ...LP, response: 'chebyshev', amaxDb: 1, fp: 3000, fs: 1000 }), cascade('towThomas')],
			['the default band-pass, transformed, LM741', robert('centred'), transformedMenus(OPAMP_GBW.LM741)],
			['band-stop of two branches, MFB', designBandStop({ response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, placement: 'centred' }), cascade('mfb')]
		];
		const problems = [];
		const rescued = [];
		for (const [label, d, menus] of designs) {
			for (const stock of ['E24', 'lab']) {
				const settings = { menus, ...stockOf(stock) };
				const r0 = searchFilterParts(d, settings);
				for (const sourceR of [SOURCE_R_DEFAULT, 600]) {
					const r = searchFilterParts(d, { ...settings, sourceR });
					const driven = measureFilter(r0.stages, d, { combinerR: settings.combinerR, resistorSeries: settings.resistorSeries, sourceR });
					const capped = (m) => Math.min(m.margin, r.ideal.margin);
					if ((driven.meets && !r.measure.meets) || (driven.meets === r.measure.meets && capped(r.measure) < capped(driven) - PART_MARGIN_TOLERANCE_DB - 1e-3)) problems.push(`${label} ${stock} ${sourceR} ohm: ${r.measure.margin.toFixed(3)} dB against ${driven.margin.toFixed(3)} for the parts of an ideal source`);
					if (!driven.meets && r.measure.meets) rescued.push(`${label} ${stock} ${sourceR} ohm (${driven.margin.toFixed(2)} -> ${r.measure.margin.toFixed(2)} dB)`);
				}
			}
		}
		const must = ['Chebyshev low-pass, Sallen-Key E24 600', 'high-pass, MFB lab 600', 'band-stop of two branches, MFB E24 600'];
		const missing = must.filter((m) => !rescued.some((x) => x.startsWith(m)));
		check('source resistance: the parts searched with it never rank below the parts of an ideal source driven through it, and meet where those miss through 600 ohm (a Sallen-Key low-pass, an MFB high-pass, the band-stop\'s shared node)', problems.length === 0 && missing.length === 0, problems.length ? problems.slice(0, 3).join('; ') : missing.length ? `not met: ${missing.join(', ')}` : `met with the source where the parts of an ideal source miss: ${rescued.join(', ')}`);
	}

	// (h) The alert names the op-amp (limitAlertOpamp, limitAlertText): the one
	// the MFB band-pass stages are built for when they are, else the LTspice
	// file's when it is a TL082 or an LM741, else a general-purpose one. A
	// transformed Chebyshev band-pass on MFB stages built for the LM741, the
	// lab resistors, centred: its set past the limits has loads under 2 kohm,
	// and its sentence is the spec's one plain sentence per stage
	{
		const problems = [];
		const d = designBandPassTransformed({ response: 'chebyshev', amaxDb: 1, aminDbLow: 40, aminDbHigh: 40, fl: 10000, fh: 40000, fsl: 3000, fsh: 120000, placement: 'centred' });
		const r = searchFilterParts(d, { menus: transformedMenus(OPAMP_GBW.LM741), ...stockOf('labR') });
		const a = r.alternative;
		const typed = searchFilterParts(designLowPass({ response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, placement: 'centred' }), { menus: cascade('mfb'), ...stockOf('lab'), overrides: { 0: { C1: 1e-7, C2: 4.7e-9 } } });
		let sentence = '';
		if (!a || !a.alerts.some((x) => x.kind === 'load')) problems.push('no set past the limits with a load alert');
		else {
			const names = [limitAlertOpamp(a, 'LM741', 'TL082'), limitAlertOpamp(a, 'other', 'TL082'), limitAlertOpamp(a, 'other', 'ideal'), limitAlertOpamp(a, 'ideal', 'LM741'), limitAlertOpamp(typed, 'LM741', 'TL082'), limitAlertOpamp(typed, 'TL082', 'ideal')];
			if (JSON.stringify(names) !== JSON.stringify(['LM741', 'TL082', null, 'LM741', 'TL082', null])) problems.push(`limitAlertOpamp: ${JSON.stringify(names)}`);
			const text = limitAlertText(a, 'LM741');
			const load = text.stages.find((s) => / drives about /.test(s.text));
			sentence = load?.text ?? '';
			if (!/^Stage \d+'s output drives about [\d.]+ k?Ω (at|from) [\d.]+ k?Hz( down)? \((its own feedback and stage \d+'s input|its own feedback)\), under the 2 kΩ an LM741 needs to swing ±10 V\./.test(sentence)) problems.push(`the sentence: "${sentence}"`);
			if (!/^An LM741 swings its full ±10 V only into 2 kΩ or more\./.test(text.summary)) problems.push(`the summary: "${text.summary}"`);
			const general = limitAlertText(a, null);
			if (!general.stages.some((s) => / a general-purpose op-amp such as the TL082 or the LM741 needs to swing ±10 V\./.test(s.text)) || !/^A general-purpose op-amp such as the TL082 or the LM741 swings its full ±10 V/.test(general.summary)) problems.push(`the general phrase: "${general.summary}"`);
			if (!limitAlertText(typed, 'TL082').stages.some((s) => / a TL082 needs to swing ±10 V\./.test(s.text))) problems.push('a TL082 named for the LTspice file');
		}
		check('the alert names the op-amp: the one the MFB stages are built for, else the LTspice file\'s TL082 or LM741, else a general-purpose one, in one plain sentence per stage', problems.length === 0, problems.length ? problems.join('; ') : sentence);
	}

	// (i) The script download is hidden until the script is reworked: one
	// constant, SCRIPT_DOWNLOAD = false, wraps both "Download
	// filter-design.js" buttons (the narrow band-pass's panel 06 and the
	// general one) and the paragraph that presents the file above each, so
	// that setting it back to true brings them back as they were; the
	// functions that write the script stay (the checks above run it), and
	// no other text of the page or of its formula sheet points to the script
	{
		const { readFileSync } = await import('node:fs');
		const page = readFileSync(new URL('../src/routes/(site)/tools/filter-design/+page.svelte', import.meta.url), 'utf8');
		const sheet = readFileSync(new URL('../src/routes/(site)/tools/filter-design/formulas/+page.svelte', import.meta.url), 'utf8');
		const markup = page.slice(page.lastIndexOf('</script>'));
		// the stretches of markup inside {#if SCRIPT_DOWNLOAD} ... {/if}, nested blocks counted
		const hidden = [];
		const stack = [];
		for (const m of markup.matchAll(/\{#if\b[^}]*\}|\{\/if\}/g)) {
			if (m[0].startsWith('{#if')) stack.push({ script: /^\{#if SCRIPT_DOWNLOAD\}$/.test(m[0]), from: m.index });
			else {
				const open = stack.pop();
				if (open?.script) hidden.push([open.from, m.index]);
			}
		}
		const inside = (i) => hidden.some(([a, b]) => i > a && i < b);
		const at = (text) => [...markup.matchAll(new RegExp(text, 'g'))].map((m) => m.index);
		const buttons = at('>Download filter-design\\.js</button>');
		const presents = at('A standalone JavaScript file');
		const named = at('filter-design\\.js|standalone script|downloadable script');
		const problems = [];
		if (!/^\tconst SCRIPT_DOWNLOAD = false;$/m.test(page)) problems.push('no SCRIPT_DOWNLOAD = false');
		if (buttons.length !== 2 || presents.length !== 2 || !hidden.length) problems.push(`${buttons.length} buttons, ${presents.length} paragraphs presenting the file, ${hidden.length} blocks`);
		if ([...buttons, ...presents, ...named].some((i) => !inside(i))) problems.push('a mention of the script outside {#if SCRIPT_DOWNLOAD}');
		if (!/function downloadScript\(\)/.test(page) || !/function downloadNarrowScript\(\)/.test(page)) problems.push('the functions that write the script are gone');
		if (/filter-design\.js|standalone script|downloadable script|the script\b/i.test(sheet)) problems.push('the formula sheet points to the script');
		// (Start here's text comes from filterBasics, which names the script unless told it is hidden: every call passes the constant)
		const basicsCalls = [...page.matchAll(/filterBasics\(\{[\s\S]*?\}\)/g)].map((m) => m[0]);
		if (basicsCalls.length < 2 || basicsCalls.some((c) => !/\bscript: SCRIPT_DOWNLOAD\b/.test(c))) problems.push(`${basicsCalls.filter((c) => !/\bscript: SCRIPT_DOWNLOAD\b/.test(c)).length} of ${basicsCalls.length} filterBasics calls without script: SCRIPT_DOWNLOAD`);
		check('the script download hidden (SCRIPT_DOWNLOAD = false): both buttons and the paragraphs presenting the file inside {#if SCRIPT_DOWNLOAD}, the code that writes the script kept, every filterBasics call told whether it shows, no other mention on the page or the formula sheet', problems.length === 0, problems.join('; ') || `${hidden.length} blocks, ${basicsCalls.length} filterBasics calls`);
	}
}

console.log(fails === 0 ? 'filter checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
