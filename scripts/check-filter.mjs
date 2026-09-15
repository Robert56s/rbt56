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

import katex from 'katex';
import { combinerChoice, magnitudePhaseAtParallelSum } from '../src/lib/filter/bode.js';
import { explainSummingAmp, explainTowThomas, explainTowThomasHp } from '../src/lib/filter/explain.js';
import { designFirstOrderLowPass } from '../src/lib/filter/firstOrder.js';
import { designFirstOrderHighPass } from '../src/lib/filter/firstOrderHighPass.js';
import { designMfbLowPass } from '../src/lib/filter/mfb.js';
import { designMfbHighPass } from '../src/lib/filter/mfbHighPass.js';
import { designSallenKeyLowPass } from '../src/lib/filter/sallenKey.js';
import { designSallenKeyHighPass } from '../src/lib/filter/sallenKeyHighPass.js';
import { TOW_THOMAS_SENSITIVITY } from '../src/lib/filter/sensitivity.js';
import { designBandStop } from '../src/lib/filter/stages.js';
import { designTowThomasHighPass, designTowThomasLowPass, designTowThomasLowPassFromCap } from '../src/lib/filter/towThomas.js';

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

console.log(fails === 0 ? 'filter checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
