// Numeric checks of the AM modulator engine (JFET gain cell).
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-am.mjs
//
// Regression tests for the three errors found in review (a missing field
// that rendered as "-", a gate-drive chain whose stages loaded one another,
// a validity condition stated for the wrong limit), plus the design checks
// added with them: carrier amplitude from the triode and op-amp limits,
// gain-bandwidth and slew checks with the numbers the review quoted, and a
// brute-force confirmation that the VDS^2 term leaves the envelope alone.
//
// The last section checks the page's three Python downloads
// (src/lib/modulation/python/) through scripts/lib-python.mjs, which runs
// them with `python` (3.8 or newer) on the PATH.
// Exits non-zero on any failure.

import katex from 'katex';
import { explainCarrierPath, explainConditioningChain, explainInvertingCell, explainJfetGainCell, explainJfetPhysics, explainOpampLimits } from '../src/lib/modulation/explain.js';
import { explainJfetModel, explainJfetSourcing } from '../src/lib/modulation/explain.js';
import { fitModel, JFET_PRESETS, modelFromIdss, modelFromRdsOn, parseMeasurements } from '../src/lib/modulation/jfetModel.js';
import { channelConductance, compareTopologies, conductanceDepth, designJfetModulator } from '../src/lib/modulation/jfetModulator.js';
import { buildDemodElements, buildDiodeElements, buildElements as buildModElements, generateDemodSchematic, generateDiodeNetlist, generateDiodeSchematic, generateNetlist as modNetlist, generateSchematic as modSchematic } from '../src/lib/modulation/spice.js';
import { designDiodeMixerModulator } from '../src/lib/modulation/diodeMixerModulator.js';
import { DIODE_MODELS } from '../src/lib/modulation/diodeLaw.js';
import { designEnvelopeLowPass, designEnvelopeStage } from '../src/lib/modulation/envelopeFilter.js';
import { designHalfWaveRectifier, designPrecisionRectifier, recoveredEnvelope } from '../src/lib/modulation/rectifier.js';
import { explainDiodeModulator } from '../src/lib/modulation/explain.js';
import { designOscillator } from '../src/lib/oscillator/topologies.js';
import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';
import { audit } from '../src/lib/spice/geometry.js';
import { realOpampProblems } from './lib-real-opamp.mjs';

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const base = { vp: -4, idss: 5e-3, swingFraction: 0.9, targetModulationIndex: 0.85, sourceAmplitude: 1, fmMin: 100, vcc: 12, fp: 55000 };
const d = designJfetModulator(base);

/* ---------------------------------------------- the three review bugs */
check('#0 vgsPeakSwing is returned, and is what the rounded summer delivers', near(d.vgsPeakSwing, d.conditioning.summer.gainActual * base.sourceAmplitude, 1e-12) && near(d.vgsPeakSwing, 1.8, 0.05), String(d.vgsPeakSwing));

const sm = d.conditioning.summer;
// the summer's own formulas, from its actual parts: no loading terms anywhere
check('#5 bias delivered is Rf Vcc / Rbias exactly, within E24 of the target', near(sm.biasActual, -(sm.rf * base.vcc) / sm.rbias, 1e-12) && near(sm.biasActual, -2, 0.1), `${sm.biasActual.toFixed(3)} V for -2 V (the loaded chain gave -1.07 V)`);
check('#5 high-pass corner is 1/(2 pi Rac C) exactly, near the target', near(sm.fcActual, 1 / (2 * Math.PI * sm.rac * sm.c), 1e-9) && sm.fcActual < 2 * sm.fcTarget, `${sm.fcActual.toFixed(1)} Hz for ${sm.fcTarget} Hz (the loaded chain gave 80 Hz for 7)`);
check('#5 gain is Rf / Rac, within E24 of the target', near(sm.gainActual, sm.rf / sm.rac, 1e-12) && near(sm.gainActual, sm.gainTarget, 0.05 * sm.gainTarget), `${sm.gainActual.toFixed(3)} for ${sm.gainTarget.toFixed(3)}`);

check('#4 triode limit is VGS_min - VP, about (1-s)|VP|/2', near(d.carrier.vdsSat, d.vgsMin - d.vp, 1e-12) && near(d.carrier.vdsSat, 0.2, 0.03), `${d.carrier.vdsSat.toFixed(3)} V`);

/* ------------------------------------------- (b) by brute force */
// Full quadratic model at three points of the message; the 2fp component
// of the output must be identical whatever the gate does.
{
	const beta = (2 * d.idss) / (d.vp * d.vp);
	const Ac = d.carrier.ac;
	const N = 4096;
	const secondHarmonic = (vgs) => {
		let re = 0;
		let im = 0;
		let dc = 0;
		for (let i = 0; i < N; i++) {
			const th = (2 * Math.PI * i) / N;
			const vds = Ac * Math.cos(th);
			const id = beta * ((vgs - d.vp) * vds - (vds * vds) / 2);
			const vout = vds + d.rb * id;
			re += vout * Math.cos(2 * th);
			im -= vout * Math.sin(2 * th);
			dc += vout;
		}
		return { amp2: (2 * Math.hypot(re, im)) / N, dc: dc / N };
	};
	const trough = secondHarmonic(d.vgsMin);
	const mid = secondHarmonic(d.vc);
	const crest = secondHarmonic(d.vgsMax);
	const predicted = (d.rb * beta * Ac * Ac) / 4;
	check('(b) 2fp tone is Rb beta Ac^2/4 and independent of the gate', near(trough.amp2, predicted, 1e-9) && near(mid.amp2, predicted, 1e-9) && near(crest.amp2, predicted, 1e-9), `${(predicted * 1000).toFixed(2)} mV at trough, bias and crest`);
	check('(b) DC offset equals the same amount, with the opposite sign', near(trough.dc, -predicted, 1e-9) && near(crest.dc, -predicted, 1e-9), `${(trough.dc * 1000).toFixed(2)} mV`);
	// and the fundamental follows the gain, which is the envelope
	const fundamental = (vgs) => {
		let re = 0;
		for (let i = 0; i < N; i++) {
			const th = (2 * Math.PI * i) / N;
			const vds = Ac * Math.cos(th);
			re += (vds + d.rb * beta * ((vgs - d.vp) * vds - (vds * vds) / 2)) * Math.cos(th);
		}
		return (2 * re) / N;
	};
	check('(b) fundamental at the crest / trough is exactly K_max Ac / K_min Ac', near(fundamental(d.vgsMax), d.gainMax * Ac, 1e-9) && near(fundamental(d.vgsMin), d.gainMin * Ac, 1e-9), `${fundamental(d.vgsMax).toFixed(4)} / ${fundamental(d.vgsMin).toFixed(4)} V`);
}

/* ----------------------------------------------- the review's numbers */
check('review: K_max = 1 + x (1 + s) at the defaults', near(d.gainMax, 1 + d.x * (1 + d.gDepth), 1e-9), d.gainMax.toFixed(2));
check('review: fp K_max / GBW is over the rule at 55 kHz', near(d.opamp.gbwRatio, (55000 * d.gainMax) / 3e6, 1e-9) && d.opamp.gbwRatio > 0.2, d.opamp.gbwRatio.toFixed(3));
check('review: crest factor is the single-pole loss at K_max', near(d.opamp.factorCrest, 1 / Math.sqrt(1 + d.opamp.gbwRatio ** 2), 1e-9) && d.opamp.factorCrest < 0.95, d.opamp.factorCrest.toFixed(4));
check('review: must warn', d.opamp.gbwOk === false && d.opamp.rbLimit !== null, `Rb limit ${d.opamp.rbLimit} ohm, n ${d.opamp.nAtLimit.toFixed(3)}`);
{
	// G0 = 1/25 S, VP = -5, s = 0.9, K_max 11 -> x 5.26, Rb 263 -> 270, n 0.756, triode 0.25, Ac 0.125
	const g0 = 1 / 25;
	const idss = (g0 * 5) / 2; // G(VC) = IDSS/|VP|
	const d2 = designJfetModulator({ vp: -5, idss, swingFraction: 0.9, rb: 270, fp: 55000 });
	check('review set 2: x, n, K_max, triode limit, Ac', near(d2.x, 270 / d2.r1AtCenter, 1e-9) && near(d2.modulationIndex, (d2.gDepth * d2.x) / (1 + d2.x), 1e-9) && near(d2.gainMax, 1 + d2.x * (1 + d2.gDepth), 1e-9) && near(d2.carrier.vdsSat, d2.vgsMin - d2.vp, 1e-9) && near(d2.carrier.acTriode, 0.5 * d2.carrier.vdsSat, 1e-9), `x ${d2.x.toFixed(2)}, n ${d2.modulationIndex.toFixed(3)}, K_max ${d2.gainMax.toFixed(2)}, Ac ${d2.carrier.acTriode}`);
	// 270 is the review's own upward rounding of 263, so it sits a hair over the 0.2 rule
	check('review set 2: sits right at the GBW rule', near(d2.opamp.gbwRatio, 0.2, 0.01), `ratio ${d2.opamp.gbwRatio.toFixed(3)}`);
}

/* ------------------------------------------------------ consistency */
check('carrier: Ac never exceeds either limit', d.carrier.ac <= d.carrier.acTriode + 1e-9 && d.carrier.ac <= d.carrier.acOpamp + 1e-9, `${d.carrier.ac.toFixed(4)} <= min(${d.carrier.acTriode.toFixed(3)}, ${d.carrier.acOpamp.toFixed(3)})`);
check('carrier: envelope ratio matches (1+n)/(1-n)', near(d.carrier.envelopeMax / d.carrier.envelopeMin, (1 + d.modulationIndex) / (1 - d.modulationIndex), 1e-9));
check('carrier: peak current is Ac times the largest conductance', near(d.carrier.jfetPeakCurrent, d.carrier.ac * channelConductance(d.vgsMax, d.vp, d.idss), 1e-12));
{
	const ideal = designJfetModulator({ ...base, gbw: 1e12 });
	check('GBW -> infinity: no crest loss, n effective = n, THD -> 0', near(ideal.opamp.factorCrest, 1, 1e-9) && near(ideal.opamp.effectiveModulationIndex, ideal.modulationIndex, 1e-9) && ideal.opamp.thd < 1e-9, `THD ${ideal.opamp.thd.toExponential(1)}`);
	const limited = designJfetModulator({ ...base, rb: d.opamp.rbLimit });
	check('suggested Rb lands at or under the rule', limited.opamp.gbwRatio <= 0.2 + 1e-9 && near(limited.modulationIndex, d.opamp.nAtLimit, 1e-9), `ratio ${limited.opamp.gbwRatio.toFixed(3)}, THD ${(100 * limited.opamp.thd).toFixed(2)}%`);
	const tight = designJfetModulator({ ...base, vp: -10, idss: 20e-3, vcc: 9, opampSwing: 7.5 });
	check('J111 on a 9 V rail: the summer headroom check trips', tight.conditioning.summer.headroomOk === false, `needs ${tight.conditioning.summer.outMin.toFixed(2)} V`);
	const slow = designJfetModulator({ ...base, fp: 500000, slewRate: 1e6, carrierMargin: 1 });
	check('slew check can trip', slow.opamp.slewOk === false, `needs ${(slow.opamp.slewNeeded / 1e6).toFixed(2)} V/us`);
}

/* ------------------------------------------------- characterization */
{
	// the same physical device three ways: (VP, IDSS), (VP, rDS(on)), and a
	// line fitted to divider measurements taken on it
	const beta = (2 * 5e-3) / 16;
	const byIdss = modelFromIdss(-4, 5e-3);
	const byRds = modelFromRdsOn(-4, 1 / (beta * 4));
	check('model: rDS(on) mode gives the same line as IDSS mode', near(byRds.beta, byIdss.beta, 1e-15) && near(byRds.idss, 5e-3, 1e-15) && near(byIdss.rdsOn, 400, 1e-9), `beta ${byIdss.beta.toExponential(4)}, rDS(on) ${byIdss.rdsOn}`);
	const rows = [-0.5, -1, -1.5, -2, -2.5, -3, -3.5].map((vgs) => {
		const rds = 1 / (beta * (vgs + 4));
		const vd = (0.2 * rds) / (1000 + rds);
		return `${vgs} 0.2 ${vd.toFixed(6)} 1000`;
	});
	const pts = parseMeasurements(rows.join(String.fromCharCode(10)) + String.fromCharCode(10) + 'not a row');
	check('parse: divider rows give rDS = Rs VD/(Vin - VD), junk skipped', pts.length === 7 && near(pts[3].rds, 800, 0.01), `${pts.length} rows, rDS(-2 V) = ${pts[3].rds.toFixed(2)}`);
	check('parse: two-column rows', parseMeasurements('-2 800\n-1, 533.3').map((r) => r.rds).join(',') === '800,533.3');
	const fit = fitModel(pts, { low: -3.5, high: -0.5 });
	check('fit: recovers VP and beta from exact points', near(fit.vp, -4, 1e-4) && near(fit.beta, beta, 1e-8) && fit.fit.r2 > 0.99999 && fit.fit.maxDev < 1e-4, `VP ${fit.vp.toFixed(4)}, beta ${fit.beta.toExponential(4)}, R2 ${fit.fit.r2.toFixed(6)}`);
	check('fit: bias is the window middle, half-range its half-width', fit.vc === -2 && fit.halfRange === 1.5);
	const noisy = pts.map((pt, i) => ({ ...pt, g: pt.g * (1 + (i % 2 ? 0.04 : -0.04)) }));
	const f2 = fitModel(noisy, { low: -3.5, high: -0.5 });
	check('fit: reports the deviation of bent data', f2.fit.maxDev > 0.03 && f2.fit.r2 < 0.999, `max ${(100 * f2.fit.maxDev).toFixed(1)}%, R2 ${f2.fit.r2.toFixed(4)}`);
	check('fit: refuses a window with fewer than two points', fitModel(pts, { low: -0.6, high: -0.4 }) === null);
	check('fit: window past VP is flagged, deviation capped at 100%', (() => { const f = fitModel(pts, { low: -4.5, high: -0.5 }); return f.fit.crossesZero === true && f.fit.maxDev <= 1; })());

	const same = { swingFraction: 0.9, targetModulationIndex: 0.85, sourceAmplitude: 1, fmMin: 100, vcc: 12, fp: 55000 };
	const dI = designJfetModulator({ vp: -4, idss: 5e-3, ...same });
	const dR = designJfetModulator({ model: byRds, ...same });
	check('design: identical from IDSS and from rDS(on)', dI.rb === dR.rb && dI.modulationIndex === dR.modulationIndex && near(dI.gDepth, 0.9, 0.02), `Rb ${dI.rb}, gDepth ${dI.gDepth}`);
	const dM = designJfetModulator({ model: fit, ...same, targetModulationIndex: 0.6 });
	// R_b is rounded to the stock, so n lands near the target rather than on it
	check('design: measured window narrows the depth to swing/(VC - VP)', near(dM.gDepth, dM.vgsPeakSwing / (dM.vc - dM.vp), 1e-12) && near(dM.gDepth, 0.675, 0.02) && near(dM.modulationIndex, 0.6, 0.015) && dM.vgsMin > dM.vp, `s = ${dM.gDepth.toFixed(4)}, n = ${dM.modulationIndex.toFixed(4)}, VGS_min ${dM.vgsMin.toFixed(2)} > VP ${dM.vp.toFixed(2)}`);
	{
		const e24 = (v) => [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1].some((m) => near(v / 10 ** Math.floor(Math.log10(v)), m, 1e-9));
		const n = (d) => (d.gDepth * d.x) / (1 + d.x);
		check('design: R_b is a stock value and n follows from it', [dI, dM].every((d) => e24(d.rb) && near(d.x, d.rb / d.r1AtCenter, 1e-12) && near(d.modulationIndex, n(d), 1e-12) && Math.abs(d.feedbackTarget / d.rb - 1) < 0.05), `R_b ${dI.rb} (${dI.feedbackTarget.toFixed(1)} asked), ${dM.rb} (${dM.feedbackTarget.toFixed(1)} asked)`);
	}
	check('design: refuses a target above the depth, and says the ceiling', designJfetModulator({ model: fit, ...same }) === null && near(conductanceDepth(fit, 0.9), 0.675, 1e-3), `ceiling ${conductanceDepth(fit, 0.9).toFixed(3)}`);
	check('presets: J111 limits as stated on the datasheet', JFET_PRESETS.J111.vpRange[0] === -10 && JFET_PRESETS.J111.vpRange[1] === -3 && JFET_PRESETS.J111.idssMin === 20e-3 && JFET_PRESETS.J111.rdsOnMax === 30);
	const j111 = designJfetModulator({ model: modelFromRdsOn(-6.5, 30), ...same });
	check('J111 preset: designs, and the gate drive still fits a 12 V rail', j111 !== null && j111.conditioning.summer.headroomOk, `Rb ${j111.rb.toFixed(0)} ohm, gate to ${j111.conditioning.summer.outMin.toFixed(2)} V`);
	for (const [label, dd] of [['rdson', dR], ['measured', dM], ['J111', j111]]) {
		const blocks = [...explainJfetModel(dd.model), ...explainJfetPhysics(dd), ...explainJfetGainCell(dd), ...explainOpampLimits(dd)];
		let bad = 0;
		for (const b of blocks) {
			if (b.type === 'eq') {
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
				} catch {
					bad++;
				}
			} else if (/undefined|NaN/.test(b.text)) bad++;
		}
		check(`explanations in ${label} mode render`, bad === 0);
	}
}

/* --------------------------------------------------- inverting cell */
{
	const inv = designJfetModulator({ ...base, topology: 'inverting' });
	check('inverting: n equals the conductance depth, whatever x', inv.modulationIndex === inv.gDepth && near(inv.modulationIndex, 0.9, 0.02), `n ${inv.modulationIndex}, x ${inv.x.toFixed(3)}`);
	check('inverting: K0 = x, signal gain x(1 -/+ s)', near(inv.nominalGain, inv.x, 1e-12) && near(inv.gainMin, inv.x * (1 - inv.gDepth), 1e-12) && near(inv.gainMax, inv.x * (1 + inv.gDepth), 1e-12));
	check('inverting: noise gain 1 + x(1 + s m), auto x lands under the GBW rule', near(inv.opamp.kCrest, 1 + inv.x * (1 + inv.gDepth), 1e-12) && inv.opamp.gbwOk, `K_max ${inv.opamp.kCrest.toFixed(2)}, ratio ${inv.opamp.gbwRatio.toFixed(3)}`);
	check('inverting: R2 is the largest stock value under the rule', inv.r2 === 3900 && inv.rb === null, `R2 ${inv.r2}`);
	// brute force: -R2 * I_D with the full quadratic model gives the same crest / trough fundamentals
	{
		const Ac = inv.carrier.ac;
		const N = 4096;
		const fundamental = (vgs) => {
			let re = 0;
			for (let i = 0; i < N; i++) {
				const th = (2 * Math.PI * i) / N;
				const vds = Ac * Math.cos(th);
				re += -inv.r2 * inv.beta * ((vgs - inv.vp) * vds - (vds * vds) / 2) * Math.cos(th);
			}
			return Math.abs((2 * re) / N);
		};
		check('inverting: brute-force envelope matches x(1 +/- s) Ac', near(fundamental(inv.vgsMax), inv.gainMax * Ac, 1e-9) && near(fundamental(inv.vgsMin), inv.gainMin * Ac, 1e-9), `${fundamental(inv.vgsMax).toFixed(4)} / ${fundamental(inv.vgsMin).toFixed(4)} V`);
	}
	check('inverting: the follower matters (divider alone bends the envelope)', inv.buffer.withoutBuffer.thd > 0.1 && inv.buffer.withBuffer.thd < 0.01, `THD ${(100 * inv.buffer.withoutBuffer.thd).toFixed(1)}% without, ${(100 * inv.buffer.withBuffer.thd).toFixed(2)}% with`);
	const noBuf = designJfetModulator({ ...base, topology: 'inverting', carrierBuffer: false });
	check('inverting: without the follower the overall THD reflects it', noBuf.opamp.thd > 0.1 && noBuf.opamp.opampCount === 3, `THD ${(100 * noBuf.opamp.thd).toFixed(1)}%, ${noBuf.opamp.opampCount} op-amps`);
	check('inverting: post-gain reaches the target with a constant factor', inv.postGain.needed && near(inv.postGain.outputAmplitude, 1, 0.08) && inv.postGain.factor > 0.99 && inv.postGain.swingOk && inv.postGain.slewOk, `${inv.postGain.outputAmplitude.toFixed(3)} V, K ${inv.postGain.kActual}`);
	check('inverting: no post-gain when the cell already reaches the target', designJfetModulator({ ...base, topology: 'inverting', targetOutputAmplitude: 0.3 }).postGain.needed === false);
	check('inverting: 4 op-amps with follower and post-gain', inv.opamp.opampCount === 4);
	check('inverting: same triode limit and carrier as the non-inverting cell', near(inv.carrier.vdsSat, d.carrier.vdsSat, 1e-12) && near(inv.carrier.ac, d.carrier.ac, 1e-12));
	check('inverting: R2 override is honoured and flagged when too large', (() => { const big = designJfetModulator({ ...base, topology: 'inverting', r2: 20000 }); return big.r2 === 20000 && big.opamp.gbwOk === false && big.opamp.rbLimit === 3900 && near(big.opamp.nAtLimit, big.gDepth, 1e-12); })());
	const rows = compareTopologies(base);
	check('comparison: both rows realizable, inverting deeper and cleaner, non-inverting fewer op-amps', rows.length === 2 && rows.every((r) => r.ok) && rows[1].nEffective > rows[0].nEffective && rows[1].thd < rows[0].thd && rows[0].opampCount < rows[1].opampCount, `n_eff ${rows[0].nEffective.toFixed(3)} vs ${rows[1].nEffective.toFixed(3)}, THD ${(100 * rows[0].thd).toFixed(1)}% vs ${(100 * rows[1].thd).toFixed(2)}%`);
	let bad = 0;
	for (const dd of [inv, noBuf]) {
		for (const b of [...explainInvertingCell(dd), ...explainCarrierPath(dd), ...explainOpampLimits(dd)]) {
			if (b.type === 'eq') {
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
				} catch {
					bad++;
				}
			} else if (/undefined|NaN/.test(b.text)) bad++;
		}
	}
	check('inverting: explanations render', bad === 0);
}

/* ------------------------------------------------- LTspice export */
{
	const osc = designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: 55000, amplitude: 1 });
	for (const [label, opts] of [
		['non-inverting, external carrier', { design: d, fmPreview: 1000, oscillator: null }],
		['non-inverting, carrier oscillator on board', { design: d, fmPreview: 1000, oscillator: osc }],
		['inverting, carrier oscillator on board', { design: designJfetModulator({ ...base, topology: 'inverting' }), fmPreview: 1000, oscillator: osc }],
		['inverting, external carrier', { design: designJfetModulator({ ...base, topology: 'inverting' }), fmPreview: 1000, oscillator: null }],
		['inverting, no carrier buffer', { design: designJfetModulator({ ...base, topology: 'inverting', carrierBuffer: false }), fmPreview: 1000, oscillator: null }],
		['inverting, no post-gain stage', { design: designJfetModulator({ ...base, topology: 'inverting', targetOutputAmplitude: 0.3 }), fmPreview: 1000, oscillator: null }]
	]) {
		const wanted = buildModElements(opts).filter((e) => e.kind !== 'LABEL');
		const asc = modSchematic(opts);
		const { elements: got, clashes, dangling, directives } = parseSchematic(asc);
		const problems = [...clashes, ...dangling];
		if (got.length !== wanted.length) problems.push(`${got.length} symbols for ${wanted.length} elements`);
		// the sheet is drawn, so most nets carry no name: what must match is
		// which pins share a net, plus every name that is drawn
		const netOf = new Map();
		const nodeOf = new Map();
		for (const w of wanted) {
			const g = got.find((e) => e.name === w.name);
			if (!g) {
				problems.push(`${w.name} missing`);
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
			if ((w.kind === 'R' || w.kind === 'C') && typeof w.value === 'number' && g.value !== spiceValue(w.value)) problems.push(`${w.name} reads ${g.value}, expected ${spiceValue(w.value)}`);
		}
		for (const m of new Set(wanted.filter((e) => e.model).map((e) => e.model))) if (!directives.some((l) => l.startsWith(`.model ${m} `))) problems.push(`no .model ${m} in the .asc`);
		if (!directives.includes('.lib opamp.sub')) problems.push('no .lib opamp.sub');
		check(`spice ${label}: .asc and .cir agree`, problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : `${got.length} symbols`);
		const issues = audit(asc);
		check(`spice ${label}: .asc drawn clean`, issues.length === 0, issues.length ? issues.slice(0, 3).map((i) => `${i.kind}: ${i.detail}`).join('; ') : 'no overlap, no crossing');
	}
	// values change length with the design: the drawing has to stay clean
	// across carriers, JFETs and options, not just at the points above
	{
		let drawn = 0;
		const messy = [];
		for (const topology of ['noninverting', 'inverting']) {
			for (const fp of [10000, 455000]) {
				for (const [vp, idss] of [[-1, 1e-3], [-8, 20e-3]]) {
					for (const extra of [{}, { carrierBuffer: false }, { targetOutputAmplitude: 0.3 }, { vcc: 5 }]) {
						for (const withOsc of [false, true]) {
							let asc;
							try {
								const design = designJfetModulator({ ...base, topology, fp, vp, idss, ...extra });
								const oscillator = withOsc ? designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: fp, amplitude: 1 }) : null;
								asc = modSchematic({ design, fmPreview: 1000, oscillator });
							} catch {
								continue;
							}
							drawn++;
							const issues = audit(asc);
							if (issues.length) messy.push(`${topology} ${fp} Hz VP ${vp} ${JSON.stringify(extra)}${withOsc ? ' + oscillator' : ''}: ${issues[0].kind}: ${issues[0].detail}`);
						}
					}
				}
			}
		}
		check('spice: every drawing across the range is clean', messy.length === 0 && drawn > 30, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
	}
	// the JFET's SPICE parameters have to describe the same straight line
	// the page designed against: Vto = VP and Beta = IDSS / VP^2
	const cir = modNetlist({ design: d, fmPreview: 1000, oscillator: null });
	const m = /\.model JMOD NJF\(Vto=(\S+) Beta=(\S+)/.exec(cir);
	check('spice: the JFET model matches the design line', m !== null && near(Number(m[1]), d.vp, 1e-3) && near(Number(m[2]), d.idss / (d.vp * d.vp), 1e-9), m ? `Vto ${m[1]}, Beta ${m[2]} against beta/2 = ${(d.beta / 2).toExponential(4)}` : 'no model card');
	check('spice: SPICE Beta is exactly half the tool beta', m !== null && near(Number(m[2]), d.beta / 2, 1e-12));
	check('spice: the netlist carries a transient run and the gate node', /\.tran /.test(cir) && /vgate/.test(cir));
	// the embedded oscillator must not collide with the modulator's own nodes
	const withOsc = buildModElements({ design: d, fmPreview: 1000, oscillator: osc });
	const oscNodes = new Set(withOsc.filter((e) => e.name && e.name.endsWith('O')).flatMap((e) => e.nodes));
	check('spice: the embedded oscillator reaches the carrier divider', oscNodes.has('vcar'), [...oscNodes].join(' '));
	check('spice: its other nodes are all prefixed, so nothing collides', [...oscNodes].every((n) => n === '0' || n === 'vcar' || n.startsWith('osc_')));
}

// the .asc must describe the .cir: same parts, same values, same partition of pins into nets
const sameAsNetlist = (wanted, asc) => {
	const { elements: got, clashes, dangling, directives } = parseSchematic(asc);
	const problems = [...clashes, ...dangling];
	if (got.length !== wanted.length) problems.push(`${got.length} symbols for ${wanted.length} elements`);
	const netOf = new Map();
	const nodeOf = new Map();
	for (const w of wanted) {
		const g = got.find((e) => e.name === w.name);
		if (!g) {
			problems.push(`${w.name} missing`);
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
		if ((w.kind === 'R' || w.kind === 'C' || w.kind === 'L') && typeof w.value === 'number' && g.value !== spiceValue(w.value)) problems.push(`${w.name} reads ${g.value}, expected ${spiceValue(w.value)}`);
	}
	for (const m of new Set(wanted.filter((e) => e.model).map((e) => e.model))) if (!directives.some((l) => l.startsWith(`.model ${m} `))) problems.push(`no .model ${m} in the .asc`);
	if (wanted.some((e) => e.kind === 'OP') && !directives.includes('.lib opamp.sub')) problems.push('no .lib opamp.sub');
	return problems;
};

/* --------------------------------- diode + tank modulator, demodulator */
{
	// an independent envelope: the diode law solved by Newton on the
	// junction voltage at every instant (no table), the tank's answer by a
	// relaxed fixed point, the index as the envelope's fundamental over its
	// mean, as the engine defines it
	const envelopeIndependent = (dd, P = 16) => {
		const d = DIODE_MODELS[dd.diode];
		const nvt = d.N * 0.025852;
		const R = dd.rs + d.Rs;
		const solve = (v) => {
			if (v <= 0) return d.Is * Math.expm1(v / nvt);
			let vd = Math.min(v, 0.6);
			for (let k = 0; k < 100; k++) {
				const e = Math.exp(vd / nvt);
				const g = R * d.Is * (e - 1) + vd - v;
				const step = g / ((R * d.Is * e) / nvt + 1);
				vd = Math.min(v, vd - step);
				if (Math.abs(step) < 1e-13) break;
			}
			return (v - vd) / R;
		};
		const w = 2 * Math.PI * dd.fp;
		const b = w * dd.capacitance - 1 / (w * dd.inductance);
		const g = 1 / dd.rt;
		const z = { re: g / (g * g + b * b), im: -b / (g * g + b * b) };
		const S = 256;
		const env = [];
		for (let p = 0; p < P; p++) {
			const u = dd.summer.um * Math.cos((2 * Math.PI * p) / P) + dd.summer.vb;
			let v1 = { re: 0, im: 0 };
			for (let it = 0; it < 300; it++) {
				let re = 0;
				let im = 0;
				for (let k = 0; k < S; k++) {
					const th = (2 * Math.PI * k) / S;
					const i = solve(dd.summer.drive * Math.cos(th) + u - (v1.re * Math.cos(th) - v1.im * Math.sin(th)));
					re += i * Math.cos(th);
					im += i * Math.sin(th);
				}
				const next = { re: z.re * ((2 * re) / S) - z.im * ((-2 * im) / S), im: z.re * ((-2 * im) / S) + z.im * ((2 * re) / S) };
				const step = Math.hypot(next.re - v1.re, next.im - v1.im);
				v1 = { re: v1.re + 0.6 * (next.re - v1.re), im: v1.im + 0.6 * (next.im - v1.im) };
				if (step < 1e-10) break;
			}
			env.push(Math.hypot(v1.re, v1.im));
		}
		const mean = env.reduce((a, x) => a + x, 0) / P;
		let re = 0;
		let im = 0;
		env.forEach((x, p) => {
			re += x * Math.cos((2 * Math.PI * p) / P);
			im += x * Math.sin((2 * Math.PI * p) / P);
		});
		return { mean, n: (2 * Math.hypot(re, im)) / P / mean };
	};

	const dd = designDiodeMixerModulator({ fp: 40000, fmMax: 1000 });
	check('diode: the defaults design, near the target index', dd !== null && Math.abs(dd.modulationIndex - 0.8) < 0.04, dd ? `n ${dd.modulationIndex.toFixed(3)}, carrier ${dd.carrierOut.toFixed(3)} V` : 'null');
	{
		const ind = envelopeIndependent(dd);
		check('diode: an independent solve of the carrier cycle gives the same envelope', near(ind.mean, dd.carrierOut, 0.005 * dd.carrierOut) && near(ind.n, dd.modulationIndex, 0.005), `carrier ${ind.mean.toFixed(4)} vs ${dd.carrierOut.toFixed(4)} V, index ${ind.n.toFixed(4)} vs ${dd.modulationIndex.toFixed(4)}`);
	}
	check('diode: the ideal switch is the textbook 4 u_m / (pi A_d)', near(dd.idealIndex, (4 * dd.summer.um) / (Math.PI * dd.summer.drive), 1e-12));
	check('diode: the source seen through the diode is about 2 R_s', dd.rSource > 1.8 * dd.rs && dd.rSource < 2.4 * dd.rs, `${dd.rSource.toFixed(0)} ohm for R_s ${dd.rs}`);
	check('diode: the loaded band is the one asked for, within the rounding of R_t', dd.bwLoaded >= 0.97 * dd.bandwidthNeeded && dd.bwLoaded <= 1.12 * dd.bandwidthNeeded, `${dd.bwLoaded.toFixed(0)} Hz for ${dd.bandwidthNeeded.toFixed(0)}`);
	check('diode: the sidebands lose what a one-pole envelope filter says', near(dd.sidebandGain, 1 / Math.sqrt(1 + ((2 * dd.fmMax) / dd.bwLoaded) ** 2), 0.005) && near(dd.indexAtFmMax, dd.modulationIndex * dd.sidebandGain, 1e-12), `${dd.sidebandGain.toFixed(4)}`);
	check('diode: the summer is wired as the table says', near(dd.summer.drive, (dd.summer.rf / dd.summer.rp) * dd.carrierAmplitude, 1e-12) && near(dd.summer.um, (dd.summer.rf / dd.summer.rm) * dd.modAmplitude, 1e-12) && near(dd.summer.vb, (dd.summer.rf / dd.summer.rb) * dd.vcc, 1e-12), `Rp ${dd.summer.rp}, Rm ${dd.summer.rm}, Rb ${dd.summer.rb}`);
	check('diode: the envelope is clean enough to be AM', dd.thd < 0.05 && dd.thdAtFmMax <= dd.thd, `THD ${(100 * dd.thd).toFixed(2)} % slow, ${(100 * dd.thdAtFmMax).toFixed(2)} % at f_m,max`);
	const bat = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, diode: 'BAT54' });
	check('diode: a Schottky needs no bias, and gets no R_b', bat !== null && bat.summer.rb === null && bat.summer.vb === 0 && Math.abs(bat.modulationIndex - 0.8) < 0.04, bat ? `n ${bat.modulationIndex.toFixed(3)}` : 'null');
	check('diode: a narrow tank takes more off a fast tone', designDiodeMixerModulator({ fp: 40000, fmMax: 1000, sidebandMargin: 1.2 }).sidebandGain < 0.8);
	check('diode: a fast carrier trips the summer check for a TL08x', designDiodeMixerModulator({ fp: 455000, fmMax: 5000, inductance: 100e-6 }).summer.gbwOk === false);
	check('diode: refuses an index over 1 and a message band too close to the carrier', designDiodeMixerModulator({ fp: 40000, fmMax: 1000, targetModulationIndex: 1.2 }) === null && designDiodeMixerModulator({ fp: 40000, fmMax: 25000 }) === null);
	{
		let bad = 0;
		let count = 0;
		for (const design of [dd, bat, designDiodeMixerModulator({ fp: 40000, fmMax: 1000, sidebandMargin: 0.4 })]) {
			for (const b of explainDiodeModulator(design)) {
				if (b.type === 'eq') {
					count++;
					try {
						katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
					} catch (e) {
						bad++;
						console.log('KATEX FAIL diode', b.tex.slice(0, 80), e.message);
					}
				} else if (/undefined|NaN|[–—]/.test(b.text) || /\byou(r|rs)?\b/i.test(b.text)) {
					bad++;
					console.log('TEXT BAD diode', b.text.slice(0, 100));
				}
			}
		}
		check(`diode: explanations render under strict KaTeX, plain words (${count} equations)`, bad === 0, `${bad} failures`);
	}

	// the exports: the drawn .asc is the .cir, and every drawing is clean
	{
		const messy = [];
		let drawn = 0;
		for (const fp of [10000, 40000, 55000, 200000]) {
			for (const extra of [{}, { diode: 'BAT54' }, { sidebandMargin: 1.2 }, { targetModulationIndex: 0.4 }, { carrierAmplitude: 0.2, modAmplitude: 0.1 }]) {
				const design = designDiodeMixerModulator({ fp, fmMax: fp / 40, ...extra });
				if (!design) continue;
				drawn++;
				const asc = generateDiodeSchematic({ design });
				const problems = sameAsNetlist(buildDiodeElements({ design }).filter((e) => e.kind !== 'LABEL'), asc);
				const issues = audit(asc);
				if (problems.length || issues.length) messy.push(`${fp} Hz ${JSON.stringify(extra)}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
			}
		}
		check('diode export: every .asc is its .cir, drawn clean', messy.length === 0 && drawn >= 18, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} designs`);
		const cir = generateDiodeNetlist({ design: dd });
		check('diode export: the netlist carries the diode model, the tank and a transient run', cir.includes(DIODE_MODELS['1N4148'].spice) && /\nL1 vout 0 1m\n/.test(cir) && /\nRT vout 0 /.test(cir) && /\nD1 na vout DX\n/.test(cir) && /\.tran /.test(cir));
	}
	{
		const messy = [];
		let drawn = 0;
		for (const topology of ['sallenKey', 'mfb']) {
			for (const rectifierType of ['full', 'half']) {
				for (const response of ['butterworth', 'chebyshev']) {
					for (const [fp, fm, aminDb] of [
						[40000, 1000, 40],
						[55000, 3000, 60],
						[10000, 300, 30]
					]) {
						const envelope = designEnvelopeLowPass({ response, amaxDb: 1, aminDb, fp: fm, fs: rectifierType === 'full' ? 2 * fp : fp, order: null, topology });
						const rectifier = rectifierType === 'full' ? designPrecisionRectifier() : designHalfWaveRectifier();
						const opts = { rectifierType, rectifier, envelope, fp, fm, index: 0.9 };
						drawn++;
						const asc = generateDemodSchematic(opts);
						const problems = sameAsNetlist(buildDemodElements(opts).filter((e) => e.kind !== 'LABEL'), asc);
						const issues = audit(asc);
						if (problems.length || issues.length) messy.push(`${topology} ${rectifierType} ${response} ${fp}/${fm}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
					}
				}
			}
		}
		check('demodulator export: every .asc is its .cir, drawn clean, Sallen-Key and MFB', messy.length === 0 && drawn === 24, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} designs`);
		const envelope = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 80000, order: null });
		const full = buildDemodElements({ rectifierType: 'full', rectifier: designPrecisionRectifier(), envelope });
		const byName = Object.fromEntries(full.filter((e) => e.name).map((e) => [e.name, e]));
		check("demodulator export: D1 runs from U1A's - input into its output, as in TIDU030", byName.D1.nodes[0] === byName.U1A.nodes[1] && byName.D1.nodes[1] === byName.U1A.nodes[2] && byName.D2.nodes[0] === byName.U1A.nodes[2] && byName.D2.nodes[1] === byName.U1B.nodes[0], `D1 ${byName.D1.nodes.join(' -> ')}, U1A ${byName.U1A.nodes.join(' ')}`);
		const half = buildDemodElements({ rectifierType: 'half', rectifier: designHalfWaveRectifier(), envelope });
		check('demodulator export: the half-wave diode has its load resistor to ground', half.some((e) => e.name === 'RL' && e.nodes.includes('vrect') && e.nodes.includes('0')));
		const exactFull = recoveredEnvelope({ rectifierType: 'full', rectifier: designPrecisionRectifier(), envelope, fm: 1000, index: 0.9 });
		const bare = recoveredEnvelope({ rectifierType: 'half', rectifier: designHalfWaveRectifier(), envelope: designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 40000, order: null }), fm: 1000, index: 0.9 });
		check('demodulator: the precision rectifier gives 2/pi of the wave, the bare diode less than 1/pi', near(exactFull.mean, 2 / Math.PI, 1e-12) && bare.mean < bare.ideal.mean && bare.tone < bare.ideal.tone && bare.mean > 0.3 * bare.ideal.mean, `full ${exactFull.mean.toFixed(4)} V; half ${bare.mean.toFixed(4)} V for an ideal ${bare.ideal.mean.toFixed(4)}`);
		check('demodulator: the rectifier uses 1 k, the value TI used', designPrecisionRectifier().r1 === 1000);
	}
	// every AM export with a real op-amp: five-pin symbols on v++ and v--,
	// the rail sources, the part's subcircuit, and the same wiring as the
	// ideal drawing (the Wien oscillator's rails included, never renamed)
	{
		let drawn = 0;
		const messy = [];
		const osc = designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: 55000, amplitude: 1 });
		const exports = [];
		for (const topology of ['noninverting', 'inverting']) {
			for (const oscillator of [null, osc]) {
				const opts = { design: designJfetModulator({ ...base, topology }), fmPreview: 1000, oscillator };
				exports.push([`jfet ${topology}${oscillator ? ' + oscillator' : ''}`, (opamp) => modSchematic({ ...opts, opamp })]);
			}
		}
		for (const extra of [{}, { diode: 'BAT54' }, { fp: 455000, fmMax: 5000, inductance: 100e-6 }]) {
			const design = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, ...extra });
			exports.push([`diode ${JSON.stringify(extra)}`, (opamp) => generateDiodeSchematic({ design, opamp })]);
		}
		for (const topology of ['sallenKey', 'mfb']) {
			for (const rectifierType of ['full', 'half']) {
				for (const response of ['butterworth', 'chebyshev']) {
					const envelope = designEnvelopeLowPass({ response, amaxDb: 1, aminDb: 40, fp: 1000, fs: rectifierType === 'full' ? 80000 : 40000, order: null, topology });
					const opts = { rectifierType, rectifier: rectifierType === 'full' ? designPrecisionRectifier() : designHalfWaveRectifier(), envelope, fp: 40000, fm: 1000, index: 0.9 };
					exports.push([`demod ${topology} ${rectifierType} ${response}`, (opamp) => generateDemodSchematic({ ...opts, opamp })]);
				}
			}
		}
		for (const [label, draw] of exports) {
			const ideal = draw('ideal');
			for (const part of ['TL082', 'LM741']) {
				const { problems, issues } = realOpampProblems(ideal, draw(part), part);
				drawn++;
				if (problems.length || issues.length) messy.push(`${label} ${part}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
			}
		}
		check('real op-amps: every AM drawing wired as the ideal one, on v++ and v--, drawn clean', messy.length === 0 && drawn === 30, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
	}
}

/* --------------------------------------------------------------- KaTeX */
{
	let n = 0;
	let bad = 0;
	const render = (label, blocks) => {
		for (const b of blocks) {
			if (b.type === 'eq') {
				n++;
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
				} catch (e) {
					bad++;
					console.log('KATEX FAIL', label, b.tex.slice(0, 80), e.message);
				}
			} else if (/undefined|NaN|±-/.test(b.text)) {
				bad++;
				console.log('TEXT BAD', label, b.text.slice(0, 100));
			}
		}
	};
	for (const [label, dd] of [
		['defaults', d],
		['rb-limited', designJfetModulator({ ...base, rb: 3900 })],
		['J111', designJfetModulator({ ...base, vp: -10, idss: 20e-3 })],
		['no divider', designJfetModulator({ ...base, carrierSourceAmplitude: 0.05 })]
	]) {
		render(label, [...explainJfetPhysics(dd), ...explainJfetGainCell(dd), ...explainConditioningChain(dd), ...explainCarrierPath(dd), ...explainOpampLimits(dd)]);
	}
	check(`explanations: ${n} equations render under strict KaTeX, no "-" placeholders`, bad === 0, `${bad} failures`);
}

/* ------------------------------------------- the V_P, I_DSS, r_DS(on) guide */
{
	const guide = explainJfetSourcing();
	const words = guide.flatMap((b) => {
		if (b.type === 'table') return [...b.head, ...b.rows.flat()];
		if (b.type === 'steps') return b.items;
		if (b.type === 'figure') return [b.label];
		return b.type === 'eq' ? [] : [b.text];
	});
	let bad = 0;
	for (const b of guide.filter((x) => x.type === 'eq')) {
		try {
			katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
		} catch (e) {
			bad++;
			console.log('KATEX FAIL guide', b.tex.slice(0, 80), e.message);
		}
	}
	check('guide: its equations render under strict KaTeX', bad === 0 && guide.some((b) => b.type === 'eq'), `${guide.filter((b) => b.type === 'eq').length} equations`);
	const wrong = words.filter((t) => typeof t !== 'string' || t.length === 0 || /undefined|NaN|[–—]/.test(t) || /\byou(r|rs)?\b/i.test(t));
	check('guide: plain words, no placeholders, no long dashes, never "you"', wrong.length === 0, wrong.length ? wrong[0] : `${words.length} pieces of text`);
	const table = guide.find((b) => b.type === 'table');
	check('guide: the datasheet table covers V_P, I_DSS and r_DS(on)', !!table && ['V_P', 'I_DSS', 'r_DS(on)'].every((f) => table.rows.some((r) => r[0] === f)));
	const fig = guide.find((b) => b.type === 'figure');
	check('guide: draws the bench circuit, a JFET and two voltmeters', !!fig && /data-symbol="njfet_transistor_horz"/.test(fig.diagram.svg) && (fig.diagram.svg.match(/data-symbol="voltmeter"/g) ?? []).length === 2);
}

/* ------------------------------------ parts from the stock the page picks */
{
	const { LAB_KIT } = await import('../src/lib/filter/eseries.js');
	const { componentOptions } = await import('../src/lib/stock.js');
	const custom = componentOptions('custom', '1k, 2.2k, 4.7k, 10k, 22k, 47k, 100k, 220k, 470k, 1M', '1n, 10n, 100n, 470n');
	const stocks = { lab: componentOptions('lab'), labR: componentOptions('labR'), custom };
	const inList = (v, list) => list.some((x) => Math.abs(x / v - 1) < 1e-9);
	for (const [name, parts] of Object.entries(stocks)) {
		const R = parts.resistorSeries;
		const C = parts.capacitors;
		const bad = [];
		const rOk = (label, v) => {
			if (v !== null && v !== undefined && v !== 0 && !inList(v, R)) bad.push(`${label} ${v}`);
		};
		// the lab resistors come with every standard capacitor: only the resistors are checked then
		const cOk = (label, v) => {
			if (v && C && !inList(v, C)) bad.push(`${label} ${v}`);
		};
		for (const topology of ['noninverting', 'inverting']) {
			const d = designJfetModulator({ ...base, topology, ...parts });
			// a 1-2.2-4.7 list has no gate-drive gain near 1.8 that keeps the channel open:
			// no design there, which the page says; the lab drawer has to build both cells
			if (!d) {
				if (name !== 'custom') bad.push(`jfet ${topology}: no design`);
				continue;
			}
			const sm = d.conditioning.summer;
			for (const [k, v] of Object.entries({ rf: sm.rf, rac: sm.rac, rbias: sm.rbias, feedback: d.feedback, divTop: d.carrier.divider.top, divBottom: d.carrier.divider.bottom, rtop: d.postGain?.rtop, rbottom: d.postGain?.rbottom, rbLimit: d.opamp.rbLimit })) rOk(`jfet ${topology} ${k}`, v);
			cOk(`jfet ${topology} c`, sm.c);
		}
		const dd = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, resistorSeries: R, capacitors: C });
		if (!dd) bad.push('diode: no design');
		else {
			for (const [k, v] of Object.entries({ rf: dd.summer.rf, rp: dd.summer.rp, rm: dd.summer.rm, rb: dd.summer.rb, rs: dd.rs, rt: dd.rt })) rOk(`diode ${k}`, v);
			dd.capacitors.forEach((c, i) => cOk(`diode C${i + 1}`, c));
		}
		const env = designEnvelopeLowPass({ response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 1000, fs: 79000, order: null, resistorSeries: R, capacitors: C });
		env.realized.forEach((s, i) => {
			if (s.stockShortfall) return;
			rOk(`envelope ${i + 1} R`, s.components.R1);
			cOk(`envelope ${i + 1} Ctop`, s.components.Ctop);
			cOk(`envelope ${i + 1} Cbottom`, s.components.Cbottom);
		});
		rOk('rectifier R', designPrecisionRectifier({ resistorSeries: R }).r1);
		rOk('half-wave RL', designHalfWaveRectifier({ resistorSeries: R }).rl);
		const osc = designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: 55000, amplitude: 1, resistorSeries: R, capacitors: C });
		if (osc) {
			for (const [k, v] of Object.entries({ r: osc.r, rg: osc.rg, rf1: osc.parts.rf1, rf2: osc.parts.rf2 })) rOk(`wien ${k}`, v);
			cOk('wien c', osc.c);
		}
		check(`stock: every AM part comes from the ${name} list (JFET both cells, diode, envelope, rectifier, Wien)`, bad.length === 0, bad.length ? bad.slice(0, 4).join('; ') : `${name}${osc ? '' : ', no Wien bridge from it'}`);
	}
	// the default stock is E24 and the usual capacitors, exactly as before the option existed
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	const e24 = { resistorSeries: 'E24', capacitors: null };
	check(
		'stock: E24 by default, the same parts with the option spelled out',
		same(designJfetModulator(base), designJfetModulator({ ...base, ...e24 })) &&
			same(designDiodeMixerModulator({ fp: 40000, fmMax: 1000 }), designDiodeMixerModulator({ fp: 40000, fmMax: 1000, ...e24 })) &&
			same(designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 79000, order: null }), designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 79000, order: null, ...e24 }))
	);
	const dLab = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, capacitors: LAB_KIT.capacitors });
	check('stock: the diode tank takes its capacitors from the list, under either name', same(dLab.capacitors, designDiodeMixerModulator({ fp: 40000, fmMax: 1000, capacitorStock: LAB_KIT.capacitors }).capacitors) && dLab.capacitors.every((c) => inList(c, LAB_KIT.capacitors)), dLab.capacitors.join(', '));
}

/* ---------------------------------------- the review's diode and filter cases */
{
	const hiZ = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, inductance: 0.1, sidebandMargin: 0.7 });
	check('diode: the source the tank sees is about 2 R_s even when R_s is large', hiZ && hiZ.rSource / hiZ.rs > 1.8 && hiZ.rSource / hiZ.rs < 2.4, hiZ && `${(hiZ.rSource / hiZ.rs).toFixed(2)} R_s`);
	check('diode: a high R_s is flagged for the junction capacitance LTspice keeps', hiZ && hiZ.cjOk === false && designDiodeMixerModulator({ fp: 40000, fmMax: 1000 }).cjOk === true);
	const round = designDiodeMixerModulator({ fp: 50000, fmMax: 10000 });
	check('diode: a tone whose harmonic lands on 0 Hz gives a finite distortion', round && Number.isFinite(round.thdAtFmMax), round && String(round.thdAtFmMax));
	check('diode: a message inside the tank band is refused (fp > (margin + 1) fmMax)', designDiodeMixerModulator({ fp: 40000, fmMax: 10000 }) === null && designDiodeMixerModulator({ fp: 40000, fmMax: 9000 }) !== null);
	const tooMany = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 39000, fs: 40000, order: null, maxOrder: 8 });
	check('envelope: an order past the limit is reported, with no stages built', tooMany.tooHigh === true && tooMany.n > 8 && !tooMany.realized);
	const cheb = designEnvelopeLowPass({ response: 'chebyshev', amaxDb: 3, aminDb: 40, fp: 1000, fs: 7200, order: null });
	const { envelopeGainDb } = await import('../src/lib/modulation/envelopeFilter.js');
	check('envelope: an even-order Chebyshev keeps the ripple Amin under DC, not just under its peak', -envelopeGainDb(cheb, 7200) >= 40 - 0.5, `${(-envelopeGainDb(cheb, 7200)).toFixed(1)} dB at fs, order ${cheb.n}`);
}

/* ------------------------ odd lists never crash the diode design, and misses are flagged */
{
	const { componentOptions } = await import('../src/lib/stock.js');
	const results = [];
	let threw = 0;
	for (const r of ['1, 2.2, 4.7', '5', '8.2', '1k 10k 100k 1M', '10k', '330 3.3k 33k 330k']) {
		const parts = componentOptions('custom', r, '1n 10n 100n');
		try {
			const d = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, resistorSeries: parts.resistorSeries, capacitors: parts.capacitors });
			results.push(d === null || (Number.isFinite(d.modulationIndex) && typeof d.indexOk === 'boolean'));
		} catch {
			threw++;
		}
	}
	check('stock: sparse or tiny resistor lists give a diode design or none, never a crash or NaN, with indexOk set', threw === 0 && results.every(Boolean), `${threw} crashes`);
	const off = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, ...componentOptions('custom', '1k 10k 100k 1M', '1n 10n 100n') });
	check('stock: an index the parts cannot reach is flagged (indexOk false)', off && off.indexOk === false && designDiodeMixerModulator({ fp: 40000, fmMax: 1000 }).indexOk === true, off && off.modulationIndex.toFixed(3));
}

/* ------------------------------ two resistors in series (the stock picker's option) */
{
	const { LAB_KIT } = await import('../src/lib/filter/eseries.js');
	const { componentOptions } = await import('../src/lib/stock.js');
	const { nearestResistor, pairLabel, resistorNotBelow, seriesPair } = await import('../src/lib/modulation/eseries.js');
	const { formatOhms } = await import('../src/lib/modulation/format.js');
	const { generateDemodNetlist } = await import('../src/lib/modulation/spice.js');
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	const inList = (v, list) => list.some((x) => Math.abs(x / v - 1) < 1e-9);
	const kit = [...LAB_KIT.capacitors, 10e-6];

	// the case that asked for the option: a J111-like line measured on the
	// bench, the lab kit with a 10 uF capacitor added
	const rows = ['-0.5 0.2 0.0026 1000', '-1.0 0.2 0.0029 1000', '-1.5 0.2 0.0031 1000', '-2.0 0.2 0.0034 1000', '-2.5 0.2 0.0037 1000', '-3.0 0.2 0.0041 1000'];
	const measured = fitModel(parseMeasurements(rows.join(String.fromCharCode(10))), { low: -7, high: 0 });
	const bench = { model: measured, topology: 'noninverting', swingFraction: 0.9, targetModulationIndex: 0.7, fp: 50000, vcc: 15, opampSwing: 13.5, gbw: 4e6, slewRate: 16e6, carrierMargin: 0.15, carrierSourceAmplitude: 0.6, resistorSeries: LAB_KIT.resistors, capacitors: kit };

	// (a) off, or on with a full series: exactly the designs from before the option
	{
		const single = designJfetModulator({ ...bench, pairs: false });
		const sm1 = single.conditioning.summer;
		const dLab = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, resistorSeries: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors, pairs: false });
		const envLab = designEnvelopeLowPass({ response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 1000, fs: 79000, order: null, resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors, pairs: false });
		check(
			'pairs off: the parts the tool gave before the option (bench JFET, lab diode, lab envelope)',
			sm1.rac === 4700 && sm1.rbias === 68000 && single.rb === 150 && near(single.modulationIndex, 0.6882, 5e-5) && dLab.summer.rp === 4700 && dLab.summer.rm === 8200 && near(dLab.modulationIndex, 0.7766, 5e-5) && envLab.realized[0].components.R1 === 7500,
			`R_bias ${sm1.rbias}, R_b ${single.rb}, n ${single.modulationIndex.toFixed(4)}; R_p ${dLab.summer.rp}, R_m ${dLab.summer.rm}; R ${envLab.realized[0].components.R1}`
		);
		const diff = [];
		const stocks = { E24: componentOptions('E24'), E96: componentOptions('E96'), lab: componentOptions('lab'), labR: componentOptions('labR') };
		for (const [name, parts] of Object.entries(stocks)) {
			const { resistorSeries, capacitors } = parts;
			const settings = name === 'E24' || name === 'E96' ? [false, true] : [false];
			for (const pairs of settings) {
				for (const topology of ['noninverting', 'inverting']) {
					for (const set of [base, { ...bench, resistorSeries: undefined, capacitors: undefined }]) {
						if (!same(designJfetModulator({ ...set, topology, resistorSeries, capacitors }), designJfetModulator({ ...set, topology, resistorSeries, capacitors, pairs }))) diff.push(`${name} jfet ${topology} pairs ${pairs}`);
					}
				}
				for (const set of [{ fp: 40000, fmMax: 1000 }, { fp: 55000, fmMax: 3000, targetModulationIndex: 0.6, diode: 'BAT54' }]) {
					if (!same(designDiodeMixerModulator({ ...set, resistorSeries, capacitorStock: capacitors }), designDiodeMixerModulator({ ...set, resistorSeries, capacitorStock: capacitors, pairs }))) diff.push(`${name} diode pairs ${pairs}`);
				}
				for (const response of ['butterworth', 'chebyshev']) {
					const spec = { response, amaxDb: 1, aminDb: 40, fp: 1000, fs: 79000, order: null, resistorSeries, capacitors };
					if (!same(designEnvelopeLowPass(spec), designEnvelopeLowPass({ ...spec, pairs }))) diff.push(`${name} envelope ${response} pairs ${pairs}`);
				}
			}
		}
		check('pairs off (and on for E24 or E96): every design is the one without the option', diff.length === 0, diff.length ? diff.slice(0, 4).join('; ') : 'JFET both cells, diode, envelope on E24, E96, lab, labR');
		check('pairs: the stock setting only turns them on for a list', !componentOptions('E24', '', '', true).pairs && !componentOptions('E96', '', '', true).pairs && componentOptions('lab', '', '', true).pairs && componentOptions('labR', '', '', true).pairs && !componentOptions('lab').pairs);
	}

	// (c) the bench case: 68 k left the bias at -3.31 V and n at 0.688
	{
		const d0 = designJfetModulator({ ...bench, pairs: false });
		const d1 = designJfetModulator({ ...bench, pairs: true });
		const s1 = d1.conditioning.summer;
		check(
			'pairs: the bench JFET gets R_bias = 56 k + 8.2 k, the bias on -3.50 V and n back to 0.70',
			near(d0.conditioning.summer.biasActual, -3.31, 0.005) && near(d0.modulationIndex, 0.688, 5e-4) && s1.rbias === 64200 && same(seriesPair(s1.rbias, LAB_KIT.resistors), [56000, 8200]) && near(s1.biasActual, -3.5, 0.01) && d1.modulationIndex > d0.modulationIndex && Math.abs(d1.modulationIndex - 0.7) < 0.005,
			`before: R_bias ${d0.conditioning.summer.rbias}, bias ${d0.conditioning.summer.biasActual.toFixed(3)} V, n ${d0.modulationIndex.toFixed(3)}; with pairs: R_bias ${s1.rbias}, bias ${s1.biasActual.toFixed(3)} V, R_b ${d1.rb}, n ${d1.modulationIndex.toFixed(3)}`
		);
		check('pairs: a table prints a pair with its two parts, a single value as before', pairLabel(64200, LAB_KIT.resistors, formatOhms) === '64.2 kΩ (56.0 kΩ + 8.20 kΩ)' && pairLabel(68000, LAB_KIT.resistors, formatOhms) === '68.0 kΩ' && pairLabel(64200, LAB_KIT.resistors, formatOhms, false) === '64.2 kΩ', pairLabel(64200, LAB_KIT.resistors, formatOhms));
		// the same design redone for a slower op-amp with the files' R_b keeps the same gate drive
		const slow = designJfetModulator({ ...bench, pairs: true, gbw: 1e6, slewRate: 0.5e6, rb: d1.rb });
		check('pairs: redone for an LM741 with the same R_b, the gate drive does not change', slow.conditioning.summer.rac === s1.rac && slow.conditioning.summer.rbias === s1.rbias && slow.rb === d1.rb, `R_ac ${slow.conditioning.summer.rac}, R_bias ${slow.conditioning.summer.rbias}`);
	}

	// (b) on, with a list: every part is a list value or two of them, and
	// nothing the page reports against a target lands further off
	{
		let seed = 20260928;
		const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
		const lists = { lab: LAB_KIT.resistors, custom: componentOptions('custom', '1k 2.2k 4.7k 10k 22k 47k 100k 220k 470k 1M', '').resistorSeries, sparse: componentOptions('custom', '10 22 47 100 220 470 1k 2.2k 4.7k 10k 22k 47k 100k 220k 470k 1M', '').resistorSeries };
		const bad = [];
		let designs = 0;
		let better = 0;
		let rescued = 0;
		const madeOf = (label, v, list) => {
			if (v > 0 && !inList(v, list) && !seriesPair(v, list)) bad.push(`${label} ${v} is neither on the list nor two of it`);
		};
		const single = (label, v, list) => {
			if (v > 0 && !inList(v, list)) bad.push(`${label} ${v} should be one part`);
		};
		const logMiss = (a, b) => Math.abs(Math.log(a / b));
		for (let i = 0; i < 600; i++) {
			const [ln, list] = Object.entries(lists)[i % 3];
			const vp = -(0.5 + 9.5 * rand());
			const model = i % 4 === 3 ? measured : rand() < 0.5 ? modelFromIdss(vp, 1e-3 * (0.5 + 40 * rand())) : modelFromRdsOn(vp, 10 + 500 * rand());
			const swingFraction = 0.4 + 0.6 * rand();
			const topology = i % 5 === 4 ? 'inverting' : 'noninverting';
			const set = { model, topology, swingFraction, targetModulationIndex: (0.2 + 0.75 * rand()) * swingFraction, sourceAmplitude: 0.2 + 2 * rand(), vcc: 5 + 12 * rand(), fp: 10000 + 90000 * rand(), fmMin: 20 + 200 * rand(), opampSwing: 3 + 10.5 * rand(), resistorSeries: list, capacitors: i % 2 ? kit : null };
			const d0 = designJfetModulator({ ...set, pairs: false });
			const d1 = designJfetModulator({ ...set, pairs: true });
			if (d0 && !d1) bad.push(`jfet ${ln} ${i}: pairs lost the design`);
			if (!d0 && d1) rescued++;
			if (!d0 || !d1) continue;
			designs++;
			const [s0, s1] = [d0.conditioning.summer, d1.conditioning.summer];
			for (const [k, v] of Object.entries({ rac: s1.rac, rbias: s1.rbias, rb: d1.rb, divTop: d1.carrier.divider.top, rtop: d1.postGain?.rtop })) madeOf(`jfet ${ln} ${k}`, v, list);
			for (const [k, v] of Object.entries({ rf: s1.rf, r2: d1.r2, divBottom: d1.carrier.divider.bottom, rbottom: d1.postGain?.rbottom })) single(`jfet ${ln} ${k}`, v, list);
			// the carrier on the channel never passes its limit, with one part or two; with
			// two the divider's top is no further above its target than the single value
			for (const [tag, d] of [['single', d0], ['pairs', d1]]) {
				if (d.carrier.divider.top > 0 && d.carrier.ac > d.carrier.acMax * (1 + 1e-9)) bad.push(`jfet ${ln} ${i} ${tag}: carrier ${d.carrier.ac.toFixed(4)} V above its limit ${d.carrier.acMax.toFixed(4)} V`);
				if (d.carrier.divider.top > 0 && d.carrier.divider.top < d.carrier.divider.topTarget * (1 - 1e-9)) bad.push(`jfet ${ln} ${i} ${tag}: divider top under its target`);
			}
			if (d1.carrier.divider.top > resistorNotBelow(d1.carrier.divider.topTarget, list, false) * (1 + 1e-9)) bad.push(`jfet ${ln} ${i}: the pair is further above the divider target than the single value`);
			if (d1.postGain?.needed && logMiss(d1.postGain.kActual, d1.postGain.kTarget) > logMiss(1 + nearestResistor((d1.postGain.kTarget - 1) * d1.postGain.rbottom, list) / d1.postGain.rbottom, d1.postGain.kTarget) + 1e-12) bad.push(`jfet ${ln} ${i}: post-gain further off with pairs`);
			if (logMiss(-s1.biasActual, s1.biasTarget) > logMiss(-s0.biasActual, s0.biasTarget) + 1e-12) bad.push(`jfet ${ln} ${i}: bias further off`);
			if (logMiss(s1.gainActual, s1.gainTarget) > logMiss(s0.gainActual, s0.gainTarget) + 1e-12) bad.push(`jfet ${ln} ${i}: gain further off`);
			// the bias and swing within the summer's reach, and the coupling corner, where the single parts had them
			if (s0.headroomOk && !s1.headroomOk) bad.push(`jfet ${ln} ${i}: the summer no longer reaches the gate swing`);
			if (s0.fcOk && !s1.fcOk) bad.push(`jfet ${ln} ${i}: the coupling corner lost`);
			if (topology === 'noninverting') {
				const [e0, e1] = [d0, d1].map((d) => Math.abs(d.modulationIndex - set.targetModulationIndex));
				if (e1 > e0 + 1e-12) bad.push(`jfet ${ln} ${i}: n further off (${e0.toFixed(4)} -> ${e1.toFixed(4)})`);
				if (e1 < e0 - 1e-6) better++;
			}
		}
		check(`pairs: ${designs} random JFET designs on three lists, every part on the list or two of it, R_f, R_2 and the feet of the dividers single, the carrier never above its limit, bias, gain and n never further off, headroom and coupling corner never lost, no design lost`, bad.length === 0 && designs > 400, bad.length ? bad.slice(0, 3).join('; ') : `n closer in ${better}, ${rescued} designs only with pairs`);

		// every check the diode panels make, as the page reads it
		const DIODE_FLAGS = { indexOk: (x) => x.indexOk, tuneOk: (x) => x.tuneOk, rangeOk: (x) => x.rangeOk, cjOk: (x) => x.cjOk, sidebandsInBand: (x) => x.sidebandsInBand, currentOk: (x) => x.currentOk, leakOk: (x) => x.leakOk, swingOk: (x) => x.summer.swingOk, gbwOk: (x) => x.summer.gbwOk, slope: (x) => x.sidebandGain >= 0.9, underOne: (x) => x.modulationIndex <= 1 };
		const badD = [];
		let diodeBetter = 0;
		for (let i = 0; i < 30; i++) {
			const [ln, list] = Object.entries(lists)[i % 3];
			const fp = 10000 + 300000 * rand();
			const set = { fp, fmMax: fp / (8 + 60 * rand()), sidebandMargin: 0.8 + 3 * rand(), inductance: [1e-4, 1e-3, 1e-2][i % 3], carrierAmplitude: 0.2 + 2 * rand(), modAmplitude: 0.1 + 2 * rand(), targetModulationIndex: 0.3 + 0.7 * rand(), carrierDrive: 0.5 + 5 * rand(), vcc: 5 + 10 * rand(), opampSwing: 3 + 8 * rand(), diode: i % 4 ? '1N4148' : 'BAT54', resistorSeries: list, capacitorStock: i % 2 ? LAB_KIT.capacitors : null };
			const d0 = designDiodeMixerModulator({ ...set, pairs: false });
			const d1 = designDiodeMixerModulator({ ...set, pairs: true });
			if (d0 && !d1) badD.push(`diode ${ln} ${i}: pairs lost the design`);
			if (!d0 || !d1) continue;
			madeOf(`diode ${ln} rp`, d1.summer.rp, list);
			madeOf(`diode ${ln} rm`, d1.summer.rm, list);
			for (const [k, v] of Object.entries({ rf: d1.summer.rf, rb: d1.summer.rb, rs: d1.rs, rt: d1.rt })) single(`diode ${ln} ${k}`, v, list);
			if (d1.rt !== d0.rt || d1.rs !== d0.rs || d1.summer.rb !== d0.summer.rb || d1.capacitance !== d0.capacitance) badD.push(`diode ${ln} ${i}: the tank or the bias moved`);
			const [e0, e1] = [d0, d1].map((d) => Math.abs(d.modulationIndex - set.targetModulationIndex));
			if (e1 > e0 + 1e-12) badD.push(`diode ${ln} ${i}: index further off (${e0.toFixed(4)} -> ${e1.toFixed(4)})`);
			for (const [k, ok] of Object.entries(DIODE_FLAGS)) if (ok(d0) && !ok(d1)) badD.push(`diode ${ln} ${i}: ${k} lost`);
			if (e1 < e0 - 1e-6) diodeBetter++;
		}
		badD.push(...bad.filter((b) => b.startsWith('diode')));
		check('pairs: diode designs on three lists, R_p and R_m on the list or two of it, the tank and the bias untouched, the index never further off, no page check lost', badD.length === 0 && diodeBetter > 5, badD.length ? badD.slice(0, 3).join('; ') : `index closer in ${diodeBetter} of 30`);

		const badE = [];
		let stages = 0;
		let stageBetter = 0;
		for (let i = 0; i < 120; i++) {
			const [ln, list] = Object.entries(lists)[i % 3];
			const fm = 100 + 5000 * rand();
			const spec = { response: i % 2 ? 'chebyshev' : 'butterworth', amaxDb: 0.5 + rand(), aminDb: 20 + 40 * rand(), fp: fm, fs: fm * (5 + 80 * rand()), order: null, maxOrder: 8, resistorSeries: list, capacitors: i % 3 ? LAB_KIT.capacitors : null };
			const e0 = designEnvelopeLowPass({ ...spec, pairs: false });
			const e1 = designEnvelopeLowPass({ ...spec, pairs: true });
			if (e0.tooHigh) continue;
			e1.realized.forEach((s1, k) => {
				const s0 = e0.realized[k];
				stages++;
				const { wn, q } = e1.stages[k];
				if (!s1.stockShortfall) madeOf(`envelope ${ln} R`, s1.components.R1, list);
				if (s1.stockShortfall && !same(s0, s1)) badE.push(`envelope ${ln} ${i}: an E24 stage changed`);
				if (s1.components.Ctop !== s0.components.Ctop || s1.components.Cbottom !== s0.components.Cbottom) badE.push(`envelope ${ln} ${i}: the capacitors moved`);
				// how far a stage lands from what it was asked: its f0 or its Q, whichever is further off
				const stageMiss = (st) => Math.max(logMiss(st.actual.wn, wn), logMiss(st.actual.q, q));
				if (stageMiss(s1) > stageMiss(s0) + 1e-12) badE.push(`envelope ${ln} ${i}: stage ${k + 1} further off`);
				if (logMiss(s1.actual.wn, wn) > logMiss(s0.actual.wn, wn) + 1e-12) badE.push(`envelope ${ln} ${i}: f0 further off`);
				if (logMiss(s1.actual.wn, wn) < logMiss(s0.actual.wn, wn) - 1e-9) stageBetter++;
			});
		}
		badE.push(...bad.filter((b) => b.startsWith('envelope')));
		check('pairs: envelope stages on three lists, R on the list or two of it, the capacitors untouched, max(|ln f0 ratio|, |ln Q ratio|) and f0 never further off', badE.length === 0 && stageBetter > 20, badE.length ? badE.slice(0, 3).join('; ') : `f0 closer in ${stageBetter} of ${stages} stages`);

		// the Wien carrier the page can put on the board, from the same list
		const badW = [];
		for (const [ln, list] of Object.entries(lists)) {
			for (const frequency of [20000, 55000]) {
				const osc = designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency, amplitude: 0.6, resistorSeries: list, capacitors: LAB_KIT.capacitors, pairs: true });
				if (!osc) continue;
				for (const [k, v] of Object.entries({ r: osc.r, rf1: osc.parts.rf1, rf2: osc.parts.rf2, rg: osc.rg })) if (v > 0 && !inList(v, list) && !seriesPair(v, list)) badW.push(`wien ${ln} ${frequency} ${k} ${v}`);
			}
		}
		check('pairs: the Wien carrier oscillator from a list: every resistor on it or two of it', badW.length === 0, badW.length ? badW.slice(0, 3).join('; ') : 'lab, custom, sparse');
	}

	// the LTspice files keep the sums and say how each is built
	{
		const d1 = designJfetModulator({ ...bench, pairs: true });
		const osc = designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: 50000, amplitude: 0.6, resistorSeries: LAB_KIT.resistors, capacitors: kit, pairs: true });
		const stock = { resistorSeries: LAB_KIT.resistors, pairs: true };
		const opts = { design: d1, fmPreview: 1000, oscillator: osc };
		const cir = modNetlist({ ...opts, ...stock });
		const asc = modSchematic({ ...opts, ...stock });
		const oscPairs = osc ? [['RSO', osc.r], ['RPO', osc.r], ['RF1O', osc.parts.rf1], ['RF2O', osc.parts.rf2], ['RGO', osc.rg]].filter(([, v]) => seriesPair(v, LAB_KIT.resistors)) : [];
		const cirOk = cir.includes('* RBIAS = 56k + 8.2k in series (their sum is used below)') && /\nRBIAS vcc nsum 64\.2k\n/.test(cir) && oscPairs.every(([name]) => cir.includes(`* ${name} = `));
		const ascOk = asc.includes('RBIAS = 56k + 8.2k in series (drawn as their sum)') && oscPairs.every(([name]) => asc.includes(`${name} = `));
		const { elements: got, clashes, dangling } = parseSchematic(asc);
		const wanted = buildModElements(opts).filter((e) => e.kind !== 'LABEL');
		const drawnOk = clashes.length === 0 && dangling.length === 0 && got.length === wanted.length && audit(asc).length === 0;
		check('pairs: the JFET .cir and .asc note each pair (the oscillator\'s too), keep the sum, and the drawing stays clean', cirOk && ascOk && drawnOk, `${oscPairs.length} oscillator pairs; ${audit(asc).map((x) => x.kind).join(', ') || 'clean'}`);
		const off = [
			modNetlist(opts) === modNetlist({ ...opts, resistorSeries: LAB_KIT.resistors, pairs: false }),
			modSchematic(opts) === modSchematic({ ...opts, resistorSeries: LAB_KIT.resistors, pairs: false }),
			!modNetlist({ ...opts, resistorSeries: 'E24', pairs: true }).includes('in series')
		];
		check('pairs: off, or with a series, the LTspice files are the ones from before', off.every(Boolean), off.join(' '));
		const dd = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, resistorSeries: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors, pairs: true });
		const dCir = generateDiodeNetlist({ design: dd, ...stock });
		const dAsc = generateDiodeSchematic({ design: dd, ...stock });
		const dPairs = [['RP', dd.summer.rp], ['RM', dd.summer.rm]].filter(([, v]) => seriesPair(v, LAB_KIT.resistors));
		check('pairs: the diode files note R_p and R_m when they are pairs, and the drawing stays clean', dPairs.length > 0 && dPairs.every(([name]) => dCir.includes(`* ${name} = `) && dAsc.includes(`${name} = `)) && audit(dAsc).length === 0 && parseSchematic(dAsc).elements.length === buildDiodeElements({ design: dd }).filter((e) => e.kind !== 'LABEL').length, dPairs.map(([n, v]) => `${n} ${v}`).join(', '));
		const envelope = designEnvelopeLowPass({ response: 'chebyshev', amaxDb: 1, aminDb: 40, fp: 1000, fs: 79000, order: null, resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors, pairs: true });
		const dm = { rectifierType: 'full', rectifier: designPrecisionRectifier({ resistorSeries: LAB_KIT.resistors }), envelope, fp: 40000, fm: 1000, index: 0.9, ...stock };
		const eCir = generateDemodNetlist(dm);
		const eAsc = generateDemodSchematic(dm);
		const rPair = seriesPair(envelope.realized[0].components.R1, LAB_KIT.resistors);
		check('pairs: the demodulator files note both R of a stage built as a pair, and the drawing stays clean', rPair !== null && eCir.includes(`* R11 = ${spiceValue(rPair[0])} + ${spiceValue(rPair[1])} in series`) && eCir.includes('* R21 = ') && eAsc.includes('R21 = ') && audit(eAsc).length === 0, rPair ? `R ${envelope.realized[0].components.R1} = ${rPair.join(' + ')}` : 'no pair');
	}

	// (d) the downloaded scripts ran with RESISTOR_PAIRS = true and printed the pairs: the Python
	// files write the page's pairs as two parts and check them; that is checked at the end of
	// this file ("python: the bench JFET with pairs writes R_bias = 56 k + 8.2 k")
	// (e) the carrier divider is rounded to the safe side: the carrier on the
	// channel lands at or under the limit k sets, never a rounding step above
	{
		const bad = [];
		let designs = 0;
		let closest = 1;
		const stocks = { E24: componentOptions('E24'), E96: componentOptions('E96'), lab: componentOptions('lab'), labR: componentOptions('labR'), 'lab+pairs': componentOptions('lab', '', '', true) };
		for (const [name, parts] of Object.entries(stocks)) {
			for (const model of [modelFromIdss(-4, 5e-3), modelFromRdsOn(-6.5, 30), measured]) {
				for (const topology of ['noninverting', 'inverting']) {
					for (const carrierSourceAmplitude of [0.02, 0.1, 0.2, 0.6, 1, 2.5, 5, 12]) {
						for (const carrierMargin of [0.1, 0.15, 0.5, 1]) {
							const d = designJfetModulator({ model, topology, swingFraction: 0.9, targetModulationIndex: 0.6, fp: 50000, vcc: 15, opampSwing: 13.5, carrierSourceAmplitude, carrierMargin, ...parts });
							if (!d) continue;
							designs++;
							const c = d.carrier;
							const tag = `${name} ${topology} ${carrierSourceAmplitude} V k ${carrierMargin}`;
							if (carrierSourceAmplitude <= c.acMax) {
								if (c.divider.top !== 0 || !near(c.ac, carrierSourceAmplitude, 1e-12)) bad.push(`${tag}: a divider where the source is already under the limit`);
								continue;
							}
							if (!(c.divider.top > 0)) bad.push(`${tag}: no divider`);
							if (c.ac > c.acMax * (1 + 1e-9)) bad.push(`${tag}: ${c.ac.toFixed(4)} V above ${c.acMax.toFixed(4)} V`);
							if (!near(c.ac, (carrierSourceAmplitude * c.divider.bottom) / (c.divider.top + c.divider.bottom), 1e-12)) bad.push(`${tag}: A_c is not the divider's`);
							closest = Math.min(closest, c.ac / c.acMax);
						}
					}
				}
			}
		}
		check(`divider: the carrier lands at or under its limit in ${designs} designs, every stock, both cells`, bad.length === 0 && designs > 400, bad.length ? bad.slice(0, 3).join('; ') : `lowest ${(100 * closest).toFixed(0)} % of the limit`);

		// the case that showed it: a 5 V generator on the lab kit, 47 k was the nearest value and let 104 mV through for 96 mV
		const gen = { ...bench, carrierSourceAmplitude: 5 };
		const one = designJfetModulator({ ...gen, pairs: false });
		const two = designJfetModulator({ ...gen, pairs: true });
		const nearestWas = (d) => (5 * 1000) / (nearestResistor(d.carrier.divider.topTarget, LAB_KIT.resistors) + 1000);
		check(
			'divider: a 5 V generator on the lab kit gets the next value up where the nearest let too much through: 47 k for 33 k, or 47 k + 4.7 k for 47 k with two in series',
			one.carrier.divider.top === 47000 && nearestResistor(one.carrier.divider.topTarget, LAB_KIT.resistors) === 33000 && nearestWas(one) > one.carrier.acMax && one.carrier.ac <= one.carrier.acMax &&
				same(seriesPair(two.carrier.divider.top, LAB_KIT.resistors), [47000, 4700]) && nearestWas(two) > two.carrier.acMax && two.carrier.ac <= two.carrier.acMax && two.carrier.ac / two.carrier.acMax > 0.97,
			`one part: ${one.carrier.divider.top} ohm, ${(1000 * one.carrier.ac).toFixed(1)} mV of ${(1000 * one.carrier.acMax).toFixed(1)} (the nearest gave ${(1000 * nearestWas(one)).toFixed(1)}); two: ${two.carrier.divider.top} ohm, ${(1000 * two.carrier.ac).toFixed(1)} mV of ${(1000 * two.carrier.acMax).toFixed(1)} (the nearest gave ${(1000 * nearestWas(two)).toFixed(1)})`
		);
		// a list with nothing large enough over a 1 k foot takes a smaller foot, and still holds the limit
		const short = designJfetModulator({ ...bench, resistorSeries: LAB_KIT.resistors.filter((v) => v <= 47000), carrierSourceAmplitude: 12, carrierMargin: 0.05 });
		check(
			'divider: when no value on hand reaches the target over 1 k, a smaller foot keeps the carrier under its limit',
			short && short.carrier.divider.top === 47000 && short.carrier.divider.bottom < 1000 && short.carrier.ac <= short.carrier.acMax && short.carrier.divider.top >= short.carrier.divider.topTarget * (1 - 1e-9),
			short ? `${short.carrier.divider.top} / ${short.carrier.divider.bottom} ohm, ${(1000 * short.carrier.ac).toFixed(1)} mV of ${(1000 * short.carrier.acMax).toFixed(1)}` : 'no design'
		);
		check('divider: the round-up picker takes the value itself when it is on hand, and the next one up otherwise', resistorNotBelow(10000, LAB_KIT.resistors) === 10000 && resistorNotBelow(10001, LAB_KIT.resistors) === 15000 && resistorNotBelow(9220, 'E24') === 10000 && resistorNotBelow(9220, 'E96') === 9310 && resistorNotBelow(9220, LAB_KIT.resistors, true) === 9400);
	}

	// (f) the output gain stage after the non-inverting cell
	{
		const plain = designJfetModulator({ ...bench, pairs: true });
		const off = designJfetModulator({ ...bench, pairs: true, outputStage: false, targetOutputAmplitude: 2 });
		const on = designJfetModulator({ ...bench, pairs: true, outputStage: true, targetOutputAmplitude: 2 });
		const pg = on.postGain;
		check('output stage: off by default, and without it the design is the one from before', plain.postGain === null && same(plain, designJfetModulator({ ...bench, pairs: true, targetOutputAmplitude: 1 })) && off.postGain === null && off.opamp.opampCount === 2);
		const topPair = seriesPair(pg.rtop, LAB_KIT.resistors);
		const onePart = designJfetModulator({ ...bench, pairs: false, outputStage: true, targetOutputAmplitude: 2 }).postGain;
		check(
			'output stage: brings the bench cell to 2 V with R_top two in series (2 k + 390), one more op-amp, the cell itself untouched',
			pg.needed && pg.rbottom === 1000 && same(topPair, [2000, 390]) && near(pg.kActual, pg.kTarget, 0.01 * pg.kTarget) && near(pg.outputAmplitude, 2, 0.02) && pg.swingOk && pg.slewOk && pg.factor > 0.999 && on.opamp.opampCount === 3 &&
				on.rb === off.rb && on.modulationIndex === off.modulationIndex && on.carrier.ac === off.carrier.ac && on.opamp.thd === off.opamp.thd,
			`K ${pg.kActual.toFixed(3)} for ${pg.kTarget.toFixed(3)}, R_top ${pg.rtop} ohm, output ${pg.outputAmplitude.toFixed(3)} V, envelope up to ${pg.envelopeMax.toFixed(2)} V, ${on.opamp.opampCount} op-amps`
		);
		check('output stage: with one part per resistor R_top is a single list value, a little further from the level asked', inList(onePart.rtop, LAB_KIT.resistors) && Math.abs(onePart.outputAmplitude - 2) >= Math.abs(pg.outputAmplitude - 2), `R_top ${onePart.rtop} ohm, output ${onePart.outputAmplitude.toFixed(3)} V`);
		const small = designJfetModulator({ ...bench, outputStage: true, targetOutputAmplitude: 0.3 });
		check('output stage: none when the cell already reaches the level asked for', small.postGain.needed === false && small.opamp.opampCount === 2 && small.postGain.outputAmplitude === small.carrier.carrierOut);
		const hot = designJfetModulator({ ...bench, outputStage: true, targetOutputAmplitude: 12 });
		check('output stage: a target whose envelope passes the op-amp swing is flagged', hot.postGain.needed && hot.postGain.swingOk === false);

		// the files carry it: the cell's output becomes vcell, the stage gives vout
		const els = buildModElements({ design: on, fmPreview: 1000 });
		const byName = Object.fromEntries(els.filter((e) => e.name).map((e) => [e.name, e]));
		const wired = same(byName.RB.nodes, ['vcell', 'ncell']) && same(byName.UC.nodes, ['vac', 'ncell', 'vcell']) && same(byName.UP.nodes, ['vcell', 'npg', 'vout']) && same(byName.RPT.nodes, ['vout', 'npg']) && same(byName.RPB.nodes, ['npg', '0']) && byName.RPT.value === pg.rtop && byName.RPB.value === pg.rbottom;
		const before = buildModElements({ design: off, fmPreview: 1000 });
		const plainWired = same(before.find((e) => e.name === 'RB').nodes, ['vout', 'ncell']) && !before.some((e) => e.name === 'UP');
		check('output stage: the netlist has the cell on vcell and the stage on vout, and is unchanged without it', wired && plainWired);
		const problems = [];
		for (const opamp of ['ideal', 'TL082']) {
			const asc = modSchematic({ design: on, fmPreview: 1000, oscillator: null, opamp, resistorSeries: LAB_KIT.resistors, pairs: true });
			const cir = modNetlist({ design: on, fmPreview: 1000, oscillator: null, opamp, resistorSeries: LAB_KIT.resistors, pairs: true });
			const { elements: got, clashes, dangling } = parseSchematic(asc);
			if (clashes.length || dangling.length) problems.push(`${opamp}: ${[...clashes, ...dangling][0]}`);
			for (const w of els.filter((e) => (e.kind === 'R' || e.kind === 'C') && typeof e.value === 'number')) {
				const g = got.find((e) => e.name === w.name);
				if (!g || g.value !== spiceValue(w.value)) problems.push(`${opamp}: ${w.name} reads ${g?.value}`);
			}
			const issues = audit(asc);
			if (issues.length) problems.push(`${opamp}: ${issues[0].kind}: ${issues[0].detail}`);
			// the two level parts that are pairs here are named in the file's notes
			const divPair = seriesPair(on.carrier.divider.top, LAB_KIT.resistors);
			if (!divPair) problems.push(`${opamp}: the divider top is not a pair in this case`);
			for (const note of [`RPT = ${spiceValue(topPair[0])} + ${spiceValue(topPair[1])} in series`, divPair ? `RDT = ${spiceValue(divPair[0])} + ${spiceValue(divPair[1])} in series` : 'RDT = '])
				if (!cir.includes(note) || !asc.includes(note)) problems.push(`${opamp}: no "${note}" note`);
		}
		check('output stage: the drawn .asc carries the stage, wired as the netlist, drawn clean, with its pair notes', problems.length === 0, problems.slice(0, 3).join('; '));

		// the comparison table follows
		const rowsOn = compareTopologies({ ...bench, pairs: true, outputStage: true, targetOutputAmplitude: 2 });
		check('output stage: the comparison row gives the final output and the op-amp count', near(rowsOn[0].carrierOut, pg.outputAmplitude, 1e-12) && rowsOn[0].opampCount === 3);
		// the downloaded script designed the stage and printed it with the divider and their
		// pairs: the Python file's are checked at the end of this file ("python: the output stage
		// after the bench cell")

		// the explanation says what the stage is for, and the equations render
		const blocks = explainJfetGainCell(on);
		let tex = 0;
		let broken = 0;
		for (const b of blocks.filter((x) => x.type === 'eq')) {
			tex++;
			try {
				katex.renderToString(b.tex, { throwOnError: true, strict: 'error', displayMode: true });
			} catch {
				broken++;
			}
		}
		const words = blocks.filter((x) => x.type === 'p').map((x) => x.text).join(' ');
		check('output stage: the cell explanation covers it, in clean text, and its equations render', words.includes('The output stage.') && !words.includes('undefined') && !words.includes('NaN') && broken === 0 && tex > explainJfetGainCell(off).filter((x) => x.type === 'eq').length, `${tex} equations, ${broken} broken`);
	}

}

/* ------------------------------- the envelope filter built from MFB stages */
{
	const { LAB_KIT } = await import('../src/lib/filter/eseries.js');
	const { componentOptions } = await import('../src/lib/stock.js');
	const { seriesPair } = await import('../src/lib/modulation/eseries.js');
	const { envelopeGainAt, envelopeGainDb, envelopeSign } = await import('../src/lib/modulation/envelopeFilter.js');
	const { explainEnvelopeFilter } = await import('../src/lib/modulation/explain.js');
	const { generateDemodNetlist } = await import('../src/lib/modulation/spice.js');
	const inList = (v, list) => list.some((x) => Math.abs(x / v - 1) < 1e-9);
	const stageMiss = (r, t) => Math.max(Math.abs(Math.log(r.actual.wn / t.wn)), Math.abs(Math.log(r.actual.q / t.q)));

	const specs = [];
	for (const response of ['butterworth', 'chebyshev']) {
		for (const [fm, fs, aminDb, amaxDb] of [
			[1000, 99000, 40, 1],
			[1000, 79000, 40, 1],
			[3000, 107000, 60, 1],
			[300, 19700, 40, 0.5],
			[1000, 9000, 40, 1],
			[1000, 20000, 80, 1],
			[1000, 5000, 60, 0.5]
		]) {
			specs.push({ response, amaxDb, aminDb, fp: fm, fs, order: null, maxOrder: 8 });
		}
	}

	// (a) every stage an MFB with R3 = R1 and C1/C2 past 8 Q^2, its parts on the stock,
	// close to its target, and the stopband still at least Amin down
	{
		const limits = { E24: 0.07, E96: 0.02, lab: 0.16, labR: 0.16, 'lab pairs': 0.03, 'labR pairs': 0.03 };
		const bad = [];
		let stages = 0;
		for (const [name, stock, pairs] of [
			['E24', 'E24', false],
			['E96', 'E96', false],
			['lab', 'lab', false],
			['labR', 'labR', false],
			['lab pairs', 'lab', true],
			['labR pairs', 'labR', true]
		]) {
			const parts = componentOptions(stock, '', '', pairs);
			for (const spec of specs) {
				const e = designEnvelopeLowPass({ ...spec, topology: 'mfb', ...parts });
				const tag = `${name} ${spec.response} ${spec.fp}/${spec.fs}`;
				if (e.tooHigh || e.topology !== 'mfb') {
					bad.push(`${tag}: no MFB design`);
					continue;
				}
				e.realized.forEach((r, i) => {
					stages++;
					const t = e.stages[i];
					const c = r.components;
					if (r.topology !== 'mfb' || r.actual.gain !== -1) bad.push(`${tag} stage ${i + 1}: not an MFB with a gain of -1`);
					if (c.R3 !== c.R1) bad.push(`${tag} stage ${i + 1}: R3 ${c.R3} is not R1 ${c.R1}`);
					if (c.C1 / c.C2 < 8 * t.q * t.q) bad.push(`${tag} stage ${i + 1}: C1/C2 ${(c.C1 / c.C2).toFixed(1)} under 8 Q^2`);
					if (r.stockShortfall) bad.push(`${tag} stage ${i + 1}: the stock could not build it`);
					const list = Array.isArray(parts.resistorSeries) ? parts.resistorSeries : null;
					for (const v of [c.R1, c.R2]) if (list && !inList(v, list) && !(parts.pairs && seriesPair(v, list))) bad.push(`${tag} stage ${i + 1}: ${v} ohm is neither on the list nor two of it`);
					for (const v of [c.C1, c.C2]) if (parts.capacitors && !inList(v, parts.capacitors)) bad.push(`${tag} stage ${i + 1}: ${v} F is not on the list`);
					if (stageMiss(r, t) > limits[name]) bad.push(`${tag} stage ${i + 1}: ${(100 * stageMiss(r, t)).toFixed(1)} % off its f0 or Q`);
				});
				if (-envelopeGainDb(e, spec.fs) < spec.aminDb - 0.1) bad.push(`${tag}: only ${(-envelopeGainDb(e, spec.fs)).toFixed(1)} dB at fs`);
			}
		}
		check('mfb: every stage an MFB, R3 = R1, C1/C2 past 8 Q^2, its parts on the stock (or two of it), near its f0 and Q, Amin kept', bad.length === 0 && stages > 100, bad.length ? bad.slice(0, 3).join('; ') : `${stages} stages on six stocks`);
	}

	// (b) the same order and the same ideal stages as the Sallen-Key: only the sign differs
	{
		const bad = [];
		for (const spec of specs) {
			const m = designEnvelopeLowPass({ ...spec, topology: 'mfb', resistorSeries: 'E96' });
			const s = designEnvelopeLowPass({ ...spec, topology: 'sallenKey', resistorSeries: 'E96' });
			const tag = `${spec.response} ${spec.fp}/${spec.fs}`;
			if (m.n !== s.n || JSON.stringify(m.stages) !== JSON.stringify(s.stages)) bad.push(`${tag}: other stages than the Sallen-Key's`);
			if (envelopeSign(m) !== (-1) ** (m.n / 2) || envelopeSign(s) !== 1) bad.push(`${tag}: sign ${envelopeSign(m)} for order ${m.n}`);
		}
		const two = designEnvelopeLowPass({ ...specs[0], topology: 'mfb' });
		const four = designEnvelopeLowPass({ ...specs[5], topology: 'mfb' });
		check('mfb: the same order and target stages as the Sallen-Key, the sign (-1)^(n/2): inverted at order 2, upright at order 4', bad.length === 0 && two.n === 2 && envelopeSign(two) === -1 && four.n === 4 && envelopeSign(four) === 1, bad.length ? bad.slice(0, 3).join('; ') : `${specs.length} specs`);
	}

	// (c) what comes out: the precision rectifier's 2/pi with the filter's sign, the
	// tone its size; the bare diode loaded by R1 as well, so a little less than with a Sallen-Key
	{
		const two = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 99000, order: null, topology: 'mfb' });
		const four = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 80, fp: 1000, fs: 20000, order: null, topology: 'mfb' });
		const full2 = recoveredEnvelope({ rectifierType: 'full', rectifier: designPrecisionRectifier(), envelope: two, fm: 1000, index: 0.75 });
		const full4 = recoveredEnvelope({ rectifierType: 'full', rectifier: designPrecisionRectifier(), envelope: four, fm: 1000, index: 0.75 });
		check(
			'mfb: the precision rectifier gives -2/pi through one MFB stage, +2/pi through two, the tone 2/pi n |H(fm)| either way',
			near(full2.mean, -2 / Math.PI, 1e-12) && full2.sign === -1 && near(full4.mean, 2 / Math.PI, 1e-12) && full4.sign === 1 && near(full2.tone, (2 / Math.PI) * 0.75 * envelopeGainAt(two, 1000), 1e-12) && full2.tone > 0,
			`${full2.mean.toFixed(4)} V and ${full4.mean.toFixed(4)} V, tone ${full2.tone.toFixed(4)} V`
		);
		// a 20 kHz carrier: the half-wave ripple's nearest sideband at 19 kHz, an order-2 filter, one stage
		const halfMfb = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 19000, order: null, topology: 'mfb' });
		const halfSk = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 19000, order: null });
		const bareMfb = recoveredEnvelope({ rectifierType: 'half', rectifier: designHalfWaveRectifier(), envelope: halfMfb, fm: 1000, index: 0.9 });
		const bareSk = recoveredEnvelope({ rectifierType: 'half', rectifier: designHalfWaveRectifier(), envelope: halfSk, fm: 1000, index: 0.9 });
		check(
			"mfb: the bare diode's mean comes out negative through one MFB stage, a little smaller than with a Sallen-Key (R1 takes DC too)",
			halfMfb.n === 2 && bareMfb.mean < 0 && -bareMfb.mean < bareSk.mean && -bareMfb.mean > 0.85 * bareSk.mean && bareMfb.ideal.mean < 0 && !bareMfb.exact,
			`${bareMfb.mean.toFixed(4)} V against ${bareSk.mean.toFixed(4)} V, R1 ${halfMfb.realized[0].components.R1} ohm next to R_L 1 k`
		);
	}

	// (d) the netlist: the stage wired as the filter tool's MFB, named in the files, pairs noted on R1, R2 and R3
	{
		const envelope = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 99000, order: null, topology: 'mfb' });
		const opts = { rectifierType: 'full', rectifier: designPrecisionRectifier(), envelope, fp: 50000, fm: 1000, index: 0.75 };
		const els = buildDemodElements(opts);
		const by = Object.fromEntries(els.filter((e) => e.name).map((e) => [e.name, e]));
		const wired =
			by.R11?.nodes.join() === 'vrect,s1a' &&
			by.C11?.nodes.join() === 's1a,0' &&
			by.R21?.nodes.join() === 's1a,s1n' &&
			by.R31?.nodes.join() === 'vout,s1a' &&
			by.C21?.nodes.join() === 's1n,vout' &&
			by.U1?.nodes.join() === '0,s1n,vout' &&
			by.R31.value === by.R11.value;
		const cir = generateDemodNetlist(opts);
		check(
			'mfb: the netlist wires R1, C1, R2, R3, C2 around a grounded + input, and says the stage inverts and the level reads negative',
			wired && cir.includes('order-2 Butterworth MFB low-pass') && cir.includes('1 MFB stage, each with a DC gain of -1') && cir.includes('DC level of -2 Ac/pi = -0.637 V') && cir.includes('comes out upside down'),
			wired ? 'wired as drawn' : els.filter((e) => /^(R|C)\d|^U1$/.test(e.name)).map((e) => `${e.name} ${e.nodes.join(' ')}`).join('; ')
		);
		const lab = componentOptions('labR', '', '', true);
		const envPairs = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 99000, order: null, topology: 'mfb', ...lab });
		const dm = { ...opts, envelope: envPairs, rectifier: designPrecisionRectifier({ resistorSeries: lab.resistorSeries }), resistorSeries: lab.resistorSeries, pairs: true };
		const pCir = generateDemodNetlist(dm);
		const pAsc = generateDemodSchematic(dm);
		const r1Pair = seriesPair(envPairs.realized[0].components.R1, LAB_KIT.resistors);
		const note = r1Pair ? `R11 = ${spiceValue(r1Pair[0])} + ${spiceValue(r1Pair[1])} in series` : null;
		const note3 = r1Pair ? `R31 = ${spiceValue(r1Pair[0])} + ${spiceValue(r1Pair[1])} in series` : null;
		check('mfb: with two in series the files note R1 and R3 (the same pair), and the drawing stays clean', note !== null && pCir.includes(note) && pCir.includes(note3) && pAsc.includes(note3) && audit(pAsc).length === 0, note ?? 'R1 is not a pair here');
	}

	// (e) a list with nothing that reaches C1/C2 >= 8 Q^2 falls back to the usual values, flagged
	{
		const e = designEnvelopeLowPass({ response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 99000, order: null, topology: 'mfb', resistorSeries: [1000, 10000, 100000], capacitors: [10e-9] });
		const r = e.realized[0];
		check('mfb: one capacitor value cannot set C1/C2, so the stage comes from E24 and E6 and is flagged', r?.stockShortfall === true && r.topology === 'mfb' && e.shortfallStages.join() === '1' && r.components.C1 / r.components.C2 >= 8 * e.stages[0].q ** 2, r ? `C1 ${r.components.C1}, C2 ${r.components.C2}` : 'no stage');
	}

	// (f) the explanation: the MFB derivation for each stage and the sign, in clean text, the equations under strict KaTeX
	{
		let tex = 0;
		let broken = 0;
		const words = [];
		const designs = [specs[0], specs[5], specs[7], specs[12]].map((spec) => designEnvelopeLowPass({ ...spec, topology: 'mfb', ...componentOptions('labR', '', '', true) }));
		for (const e of designs) {
			const blocks = explainEnvelopeFilter(e);
			for (const b of blocks.filter((x) => x.type === 'eq')) {
				tex++;
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error', displayMode: true });
				} catch {
					broken++;
				}
			}
			words.push(blocks.filter((x) => x.type === 'p').map((x) => x.text).join(' '));
		}
		const all = words.join(' ');
		const sk = explainEnvelopeFilter(designEnvelopeLowPass({ ...specs[0] })).map((b) => b.text ?? '').join(' ');
		check(
			'mfb: the explanation derives each MFB stage and says what the sign does, plain text, every equation renders',
			broken === 0 && all.includes('MFB components') && all.includes('The sign of what comes out') && words[0].includes('upside down') && words[1].includes('upright') && !/undefined|NaN/.test(all) && !sk.includes('The sign of what comes out'),
			`${tex} equations, ${broken} broken`
		);
	}

	// (g) the downloaded script built the MFB filter and said the output is inverted: the Python
	// file's are checked at the end of this file ("python: the MFB demodulator on the lab
	// resistors")

	// (h) the formula sheet: every equation renders under strict KaTeX, the MFB stage among them
	{
		const { readFileSync } = await import('node:fs');
		const src = readFileSync(new URL('../src/routes/(site)/tools/am-modulator-demodulator/formulas/+page.svelte', import.meta.url), 'utf8');
		const found = [...src.matchAll(/tex=\{`([\s\S]*?)`\}/g)].map((m) => m[1].replace(/\\\\/g, '\\'));
		let sheetBad = 0;
		for (const tex of found) {
			try {
				katex.renderToString(tex, { throwOnError: true, strict: 'error' });
			} catch (e) {
				sheetBad++;
				console.log('KATEX FAIL (sheet)', tex.slice(0, 90), e.message);
			}
		}
		check(`formula sheet: ${found.length} equations render under strict KaTeX, the MFB stage among them`, found.length > 40 && sheetBad === 0 && src.includes('MFB low-pass (gain -1)') && src.includes('8Q^2'), `${sheetBad} failures`);
	}
}

/* ---------------------------------- the demodulator's output into a load */
{
	const { designOutputCoupling, couplingGainAt, LOAD_CURRENT_LIMIT } = await import('../src/lib/modulation/outputCoupling.js');
	const { capacitorNotBelow } = await import('../src/lib/modulation/eseries.js');
	const { explainOutputCoupling } = await import('../src/lib/modulation/explain.js');
	const { generateDemodNetlist } = await import('../src/lib/modulation/spice.js');
	const spec = { response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 99000, order: null };
	const full = (envelope) => recoveredEnvelope({ rectifierType: 'full', rectifier: designPrecisionRectifier(), envelope, fm: 1000, index: 0.75 });
	const couple = (ex, extra = {}) => designOutputCoupling({ rLoad: 32, fmMin: 100, fm: 1000, amaxDb: 1, level: ex.mean, tone: ex.tone, ...extra });
	const sk = designEnvelopeLowPass(spec);
	const mfb = designEnvelopeLowPass({ ...spec, topology: 'mfb' });
	const mfb4 = designEnvelopeLowPass({ ...spec, aminDb: 80, fs: 20000, topology: 'mfb' });
	const exSk = full(sk);
	const exMfb = full(mfb);
	const cSk = couple(exSk);
	const cMfb = couple(exMfb);

	// (a) the bench: 32 ohm earphones, a message from 100 Hz, 1 dB
	check(
		'output: 32 ohm earphones and a message from 100 Hz with Amax 1 dB want at least 97.7 uF, rounded up to 100 uF, 0.96 dB at 100 Hz',
		near(cSk.cTarget, 97.74e-6, 0.01e-6) && near(cSk.c, 100e-6, 1e-12) && near(cSk.fc, 49.74, 0.01) && near(cSk.lossAtFmMin, 0.96, 0.005) && cSk.lossAtFmMin <= 1 && !cSk.stockShortfall,
		`C ${cSk.c} F for ${cSk.cTarget.toExponential(4)}, f_c ${cSk.fc.toFixed(2)} Hz, ${cSk.lossAtFmMin.toFixed(3)} dB`
	);

	// (b) the + plate goes to the side that sits higher in DC
	const half = recoveredEnvelope({ rectifierType: 'half', rectifier: designHalfWaveRectifier(), envelope: designEnvelopeLowPass({ ...spec, fs: 19000, topology: 'mfb' }), fm: 1000, index: 0.75 });
	check(
		'output: the + plate faces the filter after a Sallen-Key or two MFB stages, the load after one MFB stage, full-wave or half',
		cSk.plusToward === 'filter' && cMfb.plusToward === 'load' && couple(full(mfb4)).plusToward === 'filter' && couple(half).plusToward === 'load' && near(cMfb.level, -2 / Math.PI, 1e-12),
		`${cSk.plusToward}, ${cMfb.plusToward}, ${couple(full(mfb4)).plusToward}, ${couple(half).plusToward}`
	);

	// (c) the stock: the smallest value at or above, never below; a list without one falls back to E6, flagged
	{
		const bad = [];
		const e6 = [1, 1.5, 2.2, 3.3, 4.7, 6.8];
		for (let i = 0; i < 400; i++) {
			const t = 10 ** (-11 + (9 * i) / 400);
			const c = capacitorNotBelow(t);
			// the E6 value just under c, which has to be under t
			const k = Math.floor(Math.log10(c) + 1e-9);
			const m = c / 10 ** k;
			const j = e6.findIndex((x) => Math.abs(x - m) < 1e-6);
			const below = j > 0 ? e6[j - 1] * 10 ** k : 6.8 * 10 ** (k - 1);
			if (!(c >= t * (1 - 1e-9)) || !(below < t)) bad.push(`${t.toExponential(3)} -> ${c}`);
		}
		const list = couple(exSk, { capacitors: [10e-6, 100e-6, 470e-6] });
		const short = couple(exSk, { capacitors: [10e-9, 100e-9, 10e-6] });
		const big = couple(exSk, { rLoad: 16, capacitors: [10e-6, 100e-6, 470e-6] });
		check(
			'output: C is the smallest value at or above its floor, from the list when it has one, else E6 and flagged',
			bad.length === 0 && near(list.c, 100e-6, 1e-12) && !list.stockShortfall && short.stockShortfall && near(short.c, 100e-6, 1e-12) && near(big.c, 470e-6, 1e-12) && capacitorNotBelow(1e-3, [10e-6]) === null,
			bad.length ? bad.slice(0, 3).join('; ') : `list ${list.c}, short ${short.c} (flagged ${short.stockShortfall}), 16 ohm ${big.c}`
		);
	}

	// (d) the low end never loses more than Amax, whatever the load, the frequency or the spec
	{
		const bad = [];
		for (const rLoad of [8, 16, 32, 300, 600, 10000, 47000])
			for (const fmMin of [20, 50, 100, 300])
				for (const amaxDb of [0.1, 0.5, 1, 3]) {
					const cp = couple(exSk, { rLoad, fmMin, amaxDb });
					if (cp.lossAtFmMin > amaxDb + 1e-9 || cp.c < cp.cTarget * (1 - 1e-9) || Math.abs(couplingGainAt(cp, 1000) - cp.gainAtFm) > 1e-12) bad.push(`${rLoad} ohm ${fmMin} Hz ${amaxDb} dB: ${cp.lossAtFmMin.toFixed(3)} dB`);
				}
		check('output: at most Amax lost at the lowest frequency for every load, frequency and Amax', bad.length === 0, bad.length ? bad.slice(0, 3).join('; ') : '112 designs');
	}

	// (e) what the load draws: earphones past the 10 mA a TL08x drives cleanly, an amplifier's input far under
	{
		const amp = couple(exSk, { rLoad: 10000 });
		check(
			'output: 32 ohm earphones draw past 10 mA at the crest and are flagged, a 10 k input is not',
			!cSk.currentOk && near(cSk.peakCurrent, cSk.toneAtLoad / 32, 1e-15) && cSk.peakCurrent > LOAD_CURRENT_LIMIT && amp.currentOk && near(cSk.dcCurrentBlocked, (2 / Math.PI) / 32, 1e-12),
			`${(1000 * cSk.peakCurrent).toFixed(1)} mA and ${(1000 * amp.peakCurrent).toFixed(3)} mA, ${(1000 * cSk.dcCurrentBlocked).toFixed(1)} mA of DC kept off`
		);
	}

	// (f) the files: COUT with its + plate first, the load, its measurements, time to charge, the drawing clean
	{
		const messy = [];
		for (const [label, envelope, rectifierType] of [
			['sallen-key full', sk, 'full'],
			['mfb full', mfb, 'full'],
			['mfb half', designEnvelopeLowPass({ ...spec, fs: 49000, topology: 'mfb' }), 'half'],
			['mfb order 4', mfb4, 'full']
		]) {
			const rectifier = rectifierType === 'full' ? designPrecisionRectifier() : designHalfWaveRectifier();
			const base = { rectifierType, rectifier, envelope, fp: 50000, fm: 1000, index: 0.75 };
			const ex = recoveredEnvelope({ ...base, fm: 1000 });
			const coupling = designOutputCoupling({ rLoad: 32, fmMin: 100, fm: 1000, amaxDb: 1, level: ex.mean, tone: ex.tone });
			const opts = { ...base, coupling };
			const els = buildDemodElements(opts);
			const cout = els.find((e) => e.name === 'COUT');
			const plusNode = coupling.plusToward === 'load' ? 'vload' : 'vout';
			if (!cout || cout.nodes[0] !== plusNode || !cout.polarized) messy.push(`${label}: COUT ${cout?.nodes.join(' ')}`);
			if (!els.some((e) => e.name === 'RLOAD' && e.nodes.join() === 'vload,0' && e.value === 32)) messy.push(`${label}: no RLOAD from vload to ground`);
			const cir = generateDemodNetlist(opts);
			const tran = /\.tran 0 (\S+) (\S+)/.exec(cir);
			if (!cir.includes('.meas TRAN vloadavg AVG V(vload)') || !cir.includes('.meas TRAN vloadpp PP V(vload)')) messy.push(`${label}: no vload measurements`);
			if (!tran || Number(tran[2]) < 8 * coupling.timeConstant * (1 - 1e-3)) messy.push(`${label}: saved from ${tran?.[2]} s, before eight R_L C`);
			const asc = generateDemodSchematic(opts);
			const problems = sameAsNetlist(els.filter((e) => e.kind !== 'LABEL'), asc);
			const issues = audit(asc);
			if (!asc.includes('SYMBOL polcap')) problems.push('COUT not drawn as a polcap');
			if (problems.length || issues.length) messy.push(`${label}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
			for (const part of ['TL082', 'LM741']) {
				const r = realOpampProblems(asc, generateDemodSchematic({ ...opts, opamp: part }), part);
				if (r.problems.length || r.issues.length) messy.push(`${label} ${part}: ${r.problems[0] ?? `${r.issues[0].kind}: ${r.issues[0].detail}`}`);
			}
		}
		check('output: the files carry COUT with its + plate first and drawn as a polcap, the load, its measurements and time to charge, every drawing clean', messy.length === 0, messy.length ? messy.slice(0, 3).join('; ') : 'four demodulators, ideal and real op-amps');
	}

	// (g) the downloaded script printed the output, and nothing of it when it was off: the Python
	// file's are checked at the end of this file ("python: with the output on, C_out = 100 uF")

	// (h) the explanation: plain text, every equation under strict KaTeX
	{
		let tex = 0;
		let broken = 0;
		const words = [];
		for (const cp of [cSk, cMfb, couple(exSk, { rLoad: 10000, fmMin: 50, amaxDb: 0.5 })]) {
			const blocks = explainOutputCoupling(cp);
			for (const b of blocks.filter((x) => x.type === 'eq')) {
				tex++;
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error', displayMode: true });
				} catch {
					broken++;
				}
			}
			words.push(blocks.filter((x) => x.type === 'p').map((x) => x.text).join(' '));
		}
		check(
			'output: the explanation sizes C, says which way round it goes and what the load draws, plain text, every equation renders',
			broken === 0 && words[0].includes("to the filter's output, the higher side") && words[1].includes('to the load') && !/undefined|NaN/.test(words.join(' ')),
			`${tex} equations, ${broken} broken`
		);
	}
}

/* ---------------------------- the carrier the demodulator actually receives */
{
	const { demodExpectation, generateDemodNetlist } = await import('../src/lib/modulation/spice.js');
	const { demodSwing } = await import('../src/lib/modulation/rectifier.js');
	const { designOutputCoupling } = await import('../src/lib/modulation/outputCoupling.js');
	const { explainOutputCoupling, explainRectifier } = await import('../src/lib/modulation/explain.js');
	const spec = { response: 'butterworth', amaxDb: 1, aminDb: 40, fp: 1000, fs: 99000, order: null };
	const mfb = designEnvelopeLowPass({ ...spec, topology: 'mfb' });
	const fullOpts = (amplitude) => ({ rectifierType: 'full', rectifier: designPrecisionRectifier(), envelope: mfb, fp: 50000, fm: 1000, index: 0.75, amplitude });
	const one = demodExpectation(fullOpts(1));
	const four = demodExpectation(fullOpts(4));

	// (a) the precision rectifier is linear: four times the carrier, four times everything
	check(
		'carrier: through the precision rectifier a 4 V carrier gives four times the 1 V mean and tone, -2.546 V through one MFB stage',
		near(four.mean, 4 * one.mean, 1e-12) && near(four.tone, 4 * one.tone, 1e-12) && near(four.mean, (-8 / Math.PI), 1e-12),
		`${four.mean.toFixed(4)} V, tone ${four.tone.toFixed(4)} V`
	);

	// (b) the bare diode is not: its drop weighs less on a larger carrier
	{
		const sk = designEnvelopeLowPass({ ...spec, fs: 49000 });
		const halfAt = (amplitude) => demodExpectation({ rectifierType: 'half', rectifier: designHalfWaveRectifier(), envelope: sk, fp: 50000, fm: 1000, index: 0.75, amplitude });
		const eff = (a) => halfAt(a).mean / (a / Math.PI);
		check('carrier: the bare diode keeps a larger share of a larger carrier, never all of it', eff(0.5) < eff(1) && eff(1) < eff(4) && eff(4) < eff(10) && eff(10) < 1, [0.5, 1, 4, 10].map((a) => `${a} V: ${(100 * eff(a)).toFixed(1)} %`).join(', '));
	}

	// (c) the LTspice files carry the carrier asked for
	{
		const cir = generateDemodNetlist(fullOpts(4));
		const asc = generateDemodSchematic(fullOpts(4));
		check('carrier: the files test the demodulator with the carrier asked for, on the .param line', cir.includes('.param Ac=4 idx=0.75') && cir.includes('test wave: 4 V carrier') && asc.includes('Ac=4') && cir.includes(`DC level of -2 Ac/pi = ${four.mean.toFixed(3)} V`), cir.split(String.fromCharCode(10)).find((l) => l.startsWith('.param Ac')) ?? 'no .param line');
	}

	// (d) the op-amps' swing: U1A reaches the crest plus a diode's drop; the bare diode leaves only the filter
	{
		const at = (amplitude, rectifierType = 'full', swing = 13.5) => {
			const opts = rectifierType === 'full' ? fullOpts(amplitude) : { ...fullOpts(amplitude), rectifierType, rectifier: designHalfWaveRectifier() };
			return demodSwing({ rectifierType, amplitude, index: 0.75, out: demodExpectation(opts), swing });
		};
		const fits = at(4);
		const clips = at(8);
		const half = at(8, 'half');
		check(
			'carrier: 4 V fits in 13.5 V (U1A at 7.7 V), 8 V does not (14.7 V); the bare diode leaves only the filter, at its level plus the tone',
			fits.ok && near(fits.needed, 7.7, 1e-9) && fits.where === 'rectifier' && !clips.ok && near(clips.needed, 14.7, 1e-9) && half.rectifier === 0 && half.where === 'filter' && half.ok && near(half.needed, Math.abs(half.needed), 0),
			`${fits.needed.toFixed(2)} V, ${clips.needed.toFixed(2)} V, half-wave ${half.needed.toFixed(3)} V`
		);
		// the explanation says it, both ways, and its equations render
		let broken = 0;
		const texts = [];
		for (const [sw, type] of [[fits, 'full'], [clips, 'full'], [half, 'half']]) {
			const blocks = explainRectifier(type, 50000, 1000, sw);
			for (const b of blocks.filter((x) => x.type === 'eq')) {
				try {
					katex.renderToString(b.tex, { throwOnError: true, strict: 'error', displayMode: true });
				} catch {
					broken++;
				}
			}
			texts.push(blocks.filter((x) => x.type === 'p').map((x) => x.text).join(' '));
		}
		check('carrier: the rectifier explanation checks the swing, says what clipping costs, and renders', broken === 0 && texts.every((t) => t.includes('Room for the wave')) && texts[1].includes('clips the tops') && !texts[0].includes('clips the tops') && !/undefined|NaN/.test(texts.join(' ')), `${broken} broken`);
	}

	// (e) the load: four times the current, sixteen times the power; a listened load past 1 mW is flagged, an input never
	{
		const cp = (ex, rLoad) => designOutputCoupling({ rLoad, fmMin: 100, fm: 1000, amaxDb: 1, level: ex.mean, tone: ex.tone, amplitude: ex === four ? 4 : 1 });
		const ear1 = cp(one, 32);
		const ear4 = cp(four, 32);
		const input4 = cp(four, 10000);
		check(
			'carrier: at 4 V the earphones take four times the current and sixteen times the power, flagged; a 10 k input is not listened to',
			near(ear4.peakCurrent, 4 * ear1.peakCurrent, 1e-12) && near(ear4.power, 16 * ear1.power, 1e-12) && near(ear1.power, ear1.toneAtLoad ** 2 / 64, 1e-15) && !ear1.powerOk && !ear4.powerOk && ear4.listened && !input4.listened && input4.powerOk,
			`${(1000 * ear1.power).toFixed(2)} mW and ${(1000 * ear4.power).toFixed(1)} mW, ${(1000 * ear4.peakCurrent).toFixed(1)} mA`
		);
		const blocks = explainOutputCoupling(ear4);
		let broken = 0;
		for (const b of blocks.filter((x) => x.type === 'eq')) {
			try {
				katex.renderToString(b.tex, { throwOnError: true, strict: 'error', displayMode: true });
			} catch {
				broken++;
			}
		}
		const words = blocks.filter((x) => x.type === 'p').map((x) => x.text).join(' ');
		const tex = blocks.filter((x) => x.type === 'eq').map((x) => x.tex).join(' ');
		check('carrier: the output explanation names the 4 V carrier and gives the power in the earphones', broken === 0 && words.includes('4.00 V carrier') && tex.includes('P = ') && !explainOutputCoupling(input4).some((b) => b.type === 'eq' && b.tex.includes('P = ')), `${broken} broken`);
	}

	// (f) the downloaded script took the carrier and the swing: the Python file's are checked at
	// the end of this file ("python: a 4 V carrier")
}

/* --------------------- a limit on the pairs (the stock picker's "up to N pairs") */
{
	const { LAB_KIT } = await import('../src/lib/filter/eseries.js');
	const { componentOptions } = await import('../src/lib/stock.js');
	const { pairedNames, pairSubsets, seriesPair } = await import('../src/lib/modulation/eseries.js');
	const L = await import('../src/lib/modulation/pairLimit.js');
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	const inList = (v, list) => list.some((x) => Math.abs(x / v - 1) < 1e-9);
	const kit = [...LAB_KIT.capacitors, 10e-6];
	const rows = ['-0.5 0.2 0.0026 1000', '-1.0 0.2 0.0029 1000', '-1.5 0.2 0.0031 1000', '-2.0 0.2 0.0034 1000', '-2.5 0.2 0.0037 1000', '-3.0 0.2 0.0041 1000'];
	const measured = fitModel(parseMeasurements(rows.join(String.fromCharCode(10))), { low: -7, high: 0 });
	const lists = {
		lab: LAB_KIT.resistors,
		custom: componentOptions('custom', '1k 2.2k 4.7k 10k 22k 47k 100k 220k 470k 1M', '').resistorSeries,
		sparse: componentOptions('custom', '10 22 47 100 220 470 1k 2.2k 4.7k 10k 22k 47k 100k 220k 470k 1M', '').resistorSeries
	};
	// a list that builds the 50 kHz carrier only with pairs (not in the sweeps below)
	const shortListOnly = componentOptions('custom', '10, 22, 47, 100, 150, 220, 470, 1k, 2.2k, 4.7k, 10k, 22k, 47k, 100k', '').resistorSeries;
	let seed = 20261025;
	const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

	// One circuit under every limit from 0 to one past its count: the pairs
	// kept never pass the limit, the measure never gets worse while the limit
	// is under the count, the count or more gives the design with pairs where
	// they help, 0 gives single parts, and each design is the designer's own
	// for the whitelist it keeps, its pairs all inside that whitelist. With
	// `order` (every name the whitelist takes) and `measure`, a limit under the
	// count also gives the design an exhaustive search finds: every whitelist
	// of the names the circuit has a resistor for, paired or not with pairs
	// where they help, holding the limit or fewer, the lowest measure, a tie
	// to fewer names, then to the earlier ones. `searched` counts those limits.
	const allSubsets = (names) => Array.from({ length: names.length + 1 }, (_, m) => pairSubsets(names, m)).flat();
	const searched = { limits: 0, gained: 0 };
	const sweep = (tag, { limitOf, design, single, parts, list, real, order, measure }, bad) => {
		const full = limitOf(null);
		if (!same(full.design, design(true))) bad.push(`${tag}: no limit is not the design with pairs where they help`);
		const count = pairedNames(parts(full.design), list).length;
		const fullNames = pairedNames(parts(full.design), list);
		let every = null;
		if (order && count > 0) {
			const has = new Set([full.design, single].flatMap((d) => (d ? parts(d) : [])).map(([name]) => name));
			every = allSubsets(order.filter((name) => has.has(name))).map((w) => {
				const d = design(w);
				return { w, d, m: measure(d) };
			});
		}
		let prev = Infinity;
		for (let n = 0; n <= count + 1; n++) {
			const r = limitOf(n);
			if (every && n < count) {
				let best = null;
				for (const o of every) {
					if (o.w.length > n) continue;
					if (!best || o.m < best.m - 1e-9 * Math.max(Math.abs(o.m), Math.abs(best.m))) best = o;
				}
				searched.limits++;
				if (!same(r.design, best.d)) bad.push(`${tag} N=${n}: [${pairedNames(parts(r.design), list)}] ${r.measure} where the whitelist [${best.w}] gives ${best.m}`);
				if (pairedNames(parts(r.design), list).some((name) => !fullNames.includes(name))) searched.gained++;
			}
			const kept = pairedNames(parts(r.design), list);
			if (kept.length > n) bad.push(`${tag} N=${n}: ${kept.length} pairs`);
			if (n >= count && !same(r.design, full.design)) bad.push(`${tag} N=${n}: not the design with pairs where they help`);
			if (n === 0 && !same(r.design, single)) bad.push(`${tag} N=0: not single parts`);
			if (n < count) {
				if (r.measure > prev + 1e-12 * Math.max(1, Math.abs(prev))) bad.push(`${tag} N=${n}: measure up from ${prev} to ${r.measure}`);
				prev = r.measure;
			}
			if (r.pairs !== true && !kept.every((name) => r.pairs.includes(name))) bad.push(`${tag} N=${n}: a pair outside the whitelist`);
			if (!same(design(r.pairs), r.design)) bad.push(`${tag} N=${n}: the whitelist does not give the design back`);
			if (r.design && !parts(r.design).every(([, v]) => inList(v, list) || seriesPair(v, list))) bad.push(`${tag} N=${n}: a resistor neither on the list nor two of it`);
			if (r.design && real && !real(r.design)) bad.push(`${tag} N=${n}: the figures do not follow from the parts`);
		}
		return count;
	};

	// the JFET modulator: its figures from its own parts
	const realJfet = (d) => {
		const s = d.conditioning.summer;
		const c = d.carrier;
		return (
			near(s.gainActual, s.rf / s.rac, 1e-12) &&
			near(s.biasActual, -(s.rf * d.conditioning.vcc) / s.rbias, 1e-9) &&
			(d.rb === null || (near(d.x, d.rb / d.r1AtCenter, 1e-12) && near(d.modulationIndex, (d.gDepth * d.x) / (1 + d.x), 1e-12))) &&
			near(c.ac, (c.sourceAmplitude * c.divider.bottom) / (c.divider.top + c.divider.bottom), 1e-12) &&
			(!d.postGain?.needed || near(d.postGain.kActual, 1 + d.postGain.rtop / d.postGain.rbottom, 1e-12))
		);
	};
	const ALL_JFET = ['Rac', 'Rbias', 'Rb', 'Rdt', 'Rtop'];
	{
		const bad = [];
		let designs = 0;
		let limitedCases = 0;
		for (let i = 0; i < 90; i++) {
			const [ln, list] = Object.entries(lists)[i % 3];
			const vp = -(0.5 + 9.5 * rand());
			const model = i % 4 === 3 ? measured : rand() < 0.5 ? modelFromIdss(vp, 1e-3 * (0.5 + 40 * rand())) : modelFromRdsOn(vp, 10 + 500 * rand());
			const swingFraction = 0.4 + 0.6 * rand();
			const set = {
				model,
				topology: i % 3 === 1 ? 'inverting' : 'noninverting',
				outputStage: i % 2 === 0,
				targetOutputAmplitude: 0.5 + 3 * rand(),
				swingFraction,
				targetModulationIndex: (0.2 + 0.75 * rand()) * swingFraction,
				sourceAmplitude: 0.2 + 2 * rand(),
				vcc: 5 + 12 * rand(),
				fp: 10000 + 90000 * rand(),
				fmMin: 20 + 200 * rand(),
				opampSwing: 3 + 10.5 * rand(),
				carrierSourceAmplitude: [0.6, 1, 5][i % 3],
				carrierMargin: 0.15,
				resistorSeries: list,
				capacitors: i % 2 ? kit : null
			};
			const single = designJfetModulator({ ...set, pairs: false });
			if (!single) continue;
			designs++;
			if (!same(designJfetModulator({ ...set, pairs: ALL_JFET }), designJfetModulator({ ...set, pairs: true })) || !same(designJfetModulator({ ...set, pairs: [] }), single)) bad.push(`jfet ${ln} ${i}: a whitelist of every name, or of none, is not pairs on, or off`);
			const count = sweep(
				`jfet ${ln} ${i}`,
				{ limitOf: (n) => L.limitJfetPairs({ ...set, pairs: true }, n), design: (pairs) => designJfetModulator({ ...set, pairs }), single, parts: L.jfetPairParts, list, real: realJfet, order: ALL_JFET, measure: L.jfetPairMeasure },
				bad
			);
			if (count >= 2) limitedCases++;
		}
		check(`pair limit: ${designs} random JFET modulators on three lists, both cells, every limit from 0 to past the count: never more pairs than the limit, the measure never up below the count, the full design from the count on, single parts at 0, each a real design of its whitelist`, bad.length === 0 && limitedCases > 10, bad.length ? bad.slice(0, 3).join('; ') : `${limitedCases} with two pairs or more`);
		check(
			'pair limit: on that sweep every limit under the count gives the design an exhaustive search over every whitelist of the modulator\'s resistors finds, not only of its pairs where they help',
			bad.length === 0 && searched.limits > 100,
			`${searched.limits} limits, ${searched.gained} with a pair that pairs where they help leave single`
		);
	}

	// an inverting cell on the lab kit whose pairs where they help are R_ac,
	// R_bias and R_top: with 2 pairs, R_ac and the carrier divider's top land
	// it three times closer than any two of those three
	{
		const set = {
			model: modelFromIdss(-1.5006623715162277, 1e-3 * (0.5 + 40 * 0.45957204699516296)),
			topology: 'inverting',
			outputStage: true,
			targetOutputAmplitude: 3.171481341123581,
			swingFraction: 0.4210147142410279,
			targetModulationIndex: 0.15397919181816266,
			sourceAmplitude: 1.5389917016029357,
			vcc: 14.88405179977417,
			fp: 95654.14547920227,
			fmMin: 161.662335395813,
			opampSwing: 10.958154022693634,
			carrierSourceAmplitude: 0.6,
			carrierMargin: 0.15,
			resistorSeries: lists.lab,
			capacitors: LAB_KIT.capacitors,
			pairs: true
		};
		const fullNames = pairedNames(L.jfetPairParts(designJfetModulator(set)), lists.lab);
		const two = L.limitJfetPairs(set, 2);
		const subsets = pairSubsets(fullNames, 2).map((w) => L.jfetPairMeasure(designJfetModulator({ ...set, pairs: w })));
		check(
			'pair limit: a JFET modulator whose pairs where they help are R_ac, R_bias and R_top keeps R_ac and the divider top with 2 pairs, closer than any two of those',
			same(fullNames, ['Rac', 'Rbias', 'Rtop']) && same(two.kept, ['Rac', 'Rdt']) && same(two.added, ['Rdt']) && two.measure < 2e-3 && subsets.every((m) => m > 3 * two.measure),
			`${two.kept.join('+')} ${two.measure.toExponential(3)}; best of the full design's pairs ${Math.min(...subsets).toExponential(3)}`
		);
	}

	// the JFET modulator with the Wien carrier on the board, under one limit for both
	const works = (o) => Boolean(o && o.starts && o.limiter.regulates && o.opamp.swingOk);
	const carrierCase = (base, list, caps, amplitude) => {
		const osc = { topology: 'wien', stabilizer: 'diodes', frequency: base.fp, amplitude, gbw: base.gbw, slewRate: base.slewRate, opampSwing: base.opampSwing };
		const designCarrier = (pairs) => {
			const own = designOscillator({ ...osc, resistorSeries: list, capacitors: caps, pairs });
			if (works(own)) return own;
			const fallback = designOscillator({ ...osc, resistorSeries: 'E24', capacitors: null, pairs: false });
			return works(fallback) || !own ? fallback && { ...fallback, stockShortfall: true } : own;
		};
		const carrierOf = (o) => (works(o) && o.limiter.amplitudeActual ? o.limiter.amplitudeActual : amplitude);
		return { designCarrier, carrierOf, options: L.carrierPairOptions(designCarrier, list) };
	};
	const bench = { model: measured, topology: 'noninverting', swingFraction: 0.9, targetModulationIndex: 0.75, sourceAmplitude: 1, fmMin: 100, fp: 50000, vcc: 15, opampSwing: 13.5, gbw: 4e6, slewRate: 16e6, carrierMargin: 0.15, resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors, pairs: true };
	const carrierPairs = (o, list) => (o && !o.stockShortfall ? [o.r, o.r, o.parts.rf1, o.parts.rf2].filter((v) => seriesPair(v, list)).length : 0);
	{
		const bad = [];
		const counts = [];
		const shortFallbacks = [];
		let slowest = 0;
		const cases = [
			['bench', bench, LAB_KIT.resistors, LAB_KIT.capacitors, 1],
			['bench inverting', { ...bench, topology: 'inverting' }, LAB_KIT.resistors, LAB_KIT.capacitors, 1],
			['bench 0.6 V, output stage', { ...bench, outputStage: true, targetOutputAmplitude: 2 }, LAB_KIT.resistors, kit, 0.6],
			// no modulator from single parts on this list: under a limit too low, no design either
			['custom 20 kHz', { ...bench, fp: 20000, resistorSeries: lists.custom }, lists.custom, LAB_KIT.capacitors, 1],
			['sparse 80 kHz', { ...bench, fp: 80000, targetModulationIndex: 0.5, resistorSeries: lists.sparse, capacitors: kit }, lists.sparse, kit, 2],
			// the modulator's full design misses by more than a subset of it once the oscillator holds some pairs
			['lab 20 kHz, 2 V carrier', { ...bench, model: modelFromIdss(-1.5, 0.005), fp: 20000, targetModulationIndex: 0.5 }, LAB_KIT.resistors, LAB_KIT.capacitors, 2],
			['lab 20 kHz, 2 V carrier, inverting', { ...bench, model: modelFromIdss(-1.5, 0.005), fp: 20000, targetModulationIndex: 0.5, topology: 'inverting' }, LAB_KIT.resistors, LAB_KIT.capacitors, 2],
			// single parts from this list build no carrier that starts and holds: it needs pairs
			['short list 50 kHz', { ...bench, resistorSeries: shortListOnly }, shortListOnly, LAB_KIT.capacitors, 1]
		];
		let scriptLists = 0;
		let flatChecked = 0;
		for (const [tag, params, list, caps, amplitude] of cases) {
			const { designCarrier, carrierOf, options } = carrierCase(params, list, caps, amplitude);
			const fullOsc = designCarrier(true);
			// every carrier whitelist the oscillator tool would weigh, by what it takes from the limit
			const slots = fullOsc.stockShortfall ? [] : ['R', 'Rf1', 'Rf2'];
			const carriers = [...allSubsets(slots).slice(0, -1).map((w) => ({ w, o: designCarrier(w.length ? w : false) })), { w: true, o: fullOsc }]
				.filter((c) => c.w === true || carrierPairs(c.o, list) === 0 || ['R', 'Rf1', 'Rf2'].every((slot) => c.w.includes(slot) || !seriesPair(slot === 'R' ? c.o.r : slot === 'Rf1' ? c.o.parts.rf1 : c.o.parts.rf2, list)))
				.map((c) => ({ ...c, cost: c.w === true ? carrierPairs(c.o, list) : c.w.reduce((k, slot) => k + (slot === 'R' ? 2 : 1), 0), m: L.carrierPairMeasure(c.o) }));
			const fullCell = designJfetModulator({ ...params, carrierSourceAmplitude: carrierOf(fullOsc) });
			const total = carrierPairs(fullOsc, list) + pairedNames(L.jfetPairParts(fullCell), list).length;
			counts.push(`${tag} ${total}`);
			let prev = Infinity;
			for (let n = 0; n <= total + 1; n++) {
				const t0 = performance.now();
				const r = L.limitJfetWithCarrier(params, n, options, carrierOf);
				slowest = Math.max(slowest, performance.now() - t0);
				const pairsIn = carrierPairs(r.oscillator, list) + pairedNames(L.jfetPairParts(r.design), list).length;
				if (pairsIn > n || pairsIn !== r.count) bad.push(`${tag} N=${n}: ${pairsIn} pairs (says ${r.count})`);
				if (n >= total && (!same(r.oscillator, fullOsc) || !same(r.design, fullCell))) bad.push(`${tag} N=${n}: not the full designs`);
				if (n === 0 && (!same(r.oscillator, designCarrier(false)) || !same(r.design, designJfetModulator({ ...params, pairs: false, carrierSourceAmplitude: carrierOf(designCarrier(false)) })))) bad.push(`${tag} N=0: not single parts`);
				if (n < total) {
					if (r.measure > prev + 1e-12 * Math.max(1, prev)) bad.push(`${tag} N=${n}: measure up from ${prev} to ${r.measure}`);
					prev = r.measure;
				}
				// the modulator alone under its share, on that carrier, or with the
				// whitelist the section returns: the same modulator
				if (r.scriptPairs ? !same(designJfetModulator({ ...params, carrierSourceAmplitude: r.carrier, pairs: r.scriptPairs }), r.design) : r.budget !== null && !same(L.limitJfetPairs({ ...params, carrierSourceAmplitude: r.carrier }, r.budget).design, r.design)) bad.push(`${tag} N=${n}: the modulator under its share is another design`);
				if (r.scriptPairs) scriptLists++;
				// every whitelist of the oscillator's R, Rf1 and Rf2 whose resistors fit
				// (its pairs where they help counted by their count), each with every
				// whitelist of the modulator's resistors in what it leaves, or its full
				// design where that fits: the lowest sum of the two measures
				if (n < total) {
					let best = Infinity;
					for (const c of carriers) {
						if (c.cost > n) continue;
						const on = { ...params, carrierSourceAmplitude: carrierOf(c.o) };
						const cellFull = designJfetModulator(on);
						const cellSingle = designJfetModulator({ ...on, pairs: false });
						const has = new Set([cellFull, cellSingle].flatMap((d) => L.jfetPairParts(d)).map(([name]) => name));
						let cell = cellFull && pairedNames(L.jfetPairParts(cellFull), list).length <= n - c.cost ? L.jfetPairMeasure(cellFull) : Infinity;
						for (const w of allSubsets(ALL_JFET.filter((name) => has.has(name)))) if (w.length <= n - c.cost) cell = Math.min(cell, L.jfetPairMeasure(designJfetModulator({ ...on, pairs: w })));
						best = Math.min(best, c.m + cell);
					}
					flatChecked++;
					if (Math.abs(r.measure - best) > 1e-9 * Math.max(Math.abs(best), 1e-12)) bad.push(`${tag} N=${n}: ${r.measure} where an exhaustive search gives ${best}`);
				}
				if (r.carrier !== carrierOf(r.oscillator) || (r.design && !near(r.design.carrier.sourceAmplitude, r.carrier, 0))) bad.push(`${tag} N=${n}: the modulator is not on the oscillator's carrier`);
				if (r.carrierPairs !== true && r.carrierPairs !== false && !r.carrierKept.every((slot) => r.carrierPairs.includes(slot))) bad.push(`${tag} N=${n}: an oscillator pair outside its whitelist`);
				// an oscillator on E24 and E6 only when none the list builds fits, with a modulator in what it leaves
				if (r.oscillator?.stockShortfall) {
					const fits = options.find((o) => o.count <= n && o.oscillator && !o.oscillator.stockShortfall && Number.isFinite(L.limitJfetPairs({ ...params, carrierSourceAmplitude: carrierOf(o.oscillator) }, n - o.count).measure));
					if (fits) bad.push(`${tag} N=${n}: the oscillator is on E24 though [${fits.slots}] from the list fits`);
				}
				if (tag === 'short list 50 kHz' && n > 0 && n < total && r.oscillator?.stockShortfall) shortFallbacks.push(n);
			}
		}
		// the short list's carrier is on E24 without pairs, and from the list with them
		const shortCase = carrierCase({ ...bench, resistorSeries: shortListOnly }, shortListOnly, LAB_KIT.capacitors, 1);
		if (!shortCase.designCarrier(false)?.stockShortfall || shortCase.designCarrier(true)?.stockShortfall) bad.push('short list 50 kHz: the carrier is not on E24 with single parts and on the list with pairs');
		check(`pair limit: the JFET modulator and its Wien carrier share one limit (${counts.join(', ')} pairs in all): never more than the limit, the measure never up below the count, the full designs from the count on, single parts at 0, the modulator what its share gives, the oscillator on E24 and E6 only when none from the list fits`, bad.length === 0, bad.length ? bad.slice(0, 3).join('; ') : `slowest ${slowest.toFixed(0)} ms; short list on E24 at N = ${shortFallbacks.join(', ') || 'none'}`);
		check(
			'pair limit: there every limit under the count gives what an exhaustive search over every whitelist of the oscillator and of the modulator finds, the script getting the whitelist where no share of its own gives it',
			bad.length === 0 && flatChecked > 30,
			`${flatChecked} limits, ${scriptLists} with the whitelist in the script`
		);
	}

	// the diode modulator
	{
		const bad = [];
		let limitedCases = 0;
		const realDiode = (d) => near(d.summer.drive, (d.summer.rf / d.summer.rp) * d.carrierAmplitude, 1e-12) && near(d.summer.um, (d.summer.rf / d.summer.rm) * d.modAmplitude, 1e-12);
		const sets = [
			{ fp: 40000, fmMax: 1000, targetModulationIndex: 0.93, carrierDrive: 1.7 },
			{ fp: 40000, fmMax: 1000 },
			{ fp: 55000, fmMax: 3000, targetModulationIndex: 0.6 },
			{ fp: 120000, fmMax: 5000, targetModulationIndex: 0.7, carrierDrive: 3, diode: 'BAT54' },
			{ fp: 25000, fmMax: 800, targetModulationIndex: 0.85, carrierDrive: 1.3, inductance: 1e-2 }
		];
		sets.forEach((s, i) => {
			for (const [ln, list] of Object.entries(lists)) {
				const set = { ...s, resistorSeries: list, capacitorStock: i % 2 ? LAB_KIT.capacitors : null };
				const single = designDiodeMixerModulator({ ...set, pairs: false });
				if (!single) continue;
				if (!same(designDiodeMixerModulator({ ...set, pairs: ['Rp', 'Rm'] }), designDiodeMixerModulator({ ...set, pairs: true })) || !same(designDiodeMixerModulator({ ...set, pairs: [] }), single)) bad.push(`diode ${ln} ${i}: a whitelist of both, or of none, is not pairs on, or off`);
				const count = sweep(
					`diode ${ln} ${i}`,
					{ limitOf: (n) => L.limitDiodePairs({ ...set, pairs: true }, n), design: (pairs) => designDiodeMixerModulator({ ...set, pairs }), single, parts: L.diodePairParts, list, real: realDiode, order: ['Rp', 'Rm'], measure: L.diodePairMeasure },
					bad
				);
				if (count >= 2) limitedCases++;
			}
		});
		check('pair limit: diode modulators on three lists, every limit: never more pairs than the limit, the measure never up below the count, the full design from the count on, single parts at 0, each a real design of its whitelist', bad.length === 0 && limitedCases >= 1, bad.length ? bad.slice(0, 3).join('; ') : `${limitedCases} with R_p and R_m both pairs`);
	}

	// the envelope low-pass, every stage counted
	const realStage = (st) => {
		const c = st.components;
		if (st.topology === 'mfb') {
			const a = (1 / c.C1) * (2 / c.R1 + 1 / c.R2);
			const b = 1 / (c.R1 * c.R2 * c.C1 * c.C2);
			return c.R1 === c.R3 && near(st.actual.wn, Math.sqrt(b), 1e-9 * Math.sqrt(b)) && near(st.actual.q, Math.sqrt(b) / a, 1e-12);
		}
		return c.R1 === c.R2 && near(st.actual.wn, 1 / (c.R1 * Math.sqrt(c.Ctop * c.Cbottom)), 1e-9 * st.actual.wn);
	};
	const envelopeParts = (design) => (design.realized ?? []).flatMap((stage, k) => L.envelopePairParts(stage, k));
	{
		const bad = [];
		let stagesSeen = 0;
		let limitedCases = 0;
		const allNames = [1, 2, 3, 4].flatMap((k) => [`R1${k}`, `R2${k}`, `R3${k}`]);
		let envelopeSearched = 0;
		for (let i = 0; i < 90; i++) {
			const [ln, list] = Object.entries(lists)[i % 3];
			const fm = 100 + 5000 * rand();
			const spec = { response: i % 2 ? 'chebyshev' : 'butterworth', topology: i % 3 === 0 ? 'sallenKey' : 'mfb', amaxDb: 0.5 + rand(), aminDb: 20 + 40 * rand(), fp: fm, fs: fm * (5 + 60 * rand()), order: i % 5 === 0 ? 6 : null, maxOrder: 8, resistorSeries: list, capacitors: i % 3 === 2 ? LAB_KIT.capacitors : null };
			const single = designEnvelopeLowPass({ ...spec, pairs: false });
			if (single.tooHigh) continue;
			stagesSeen += single.realized.length;
			if (!same(designEnvelopeLowPass({ ...spec, pairs: allNames }), designEnvelopeLowPass({ ...spec, pairs: true })) || !same(designEnvelopeLowPass({ ...spec, pairs: [] }), single)) bad.push(`envelope ${ln} ${i}: a whitelist of every name, or of none, is not pairs on, or off`);
			const count = sweep(
				`envelope ${ln} ${i}`,
				{ limitOf: (n) => L.limitEnvelopePairs({ ...spec, pairs: true }, n), design: (pairs) => designEnvelopeLowPass({ ...spec, pairs }), single, parts: envelopeParts, list, real: (d) => d.realized.every(realStage) },
				bad
			);
			if (count >= 3) limitedCases++;
			// every whitelist of every stage's resistors, the stages' lists holding the limit or fewer in all: the lowest sum of the stage misses
			const full = designEnvelopeLowPass({ ...spec, pairs: true });
			const per = full.realized.map((st, k) =>
				allSubsets(L.envelopePairParts(st, k).map(([name]) => name)).map((w) => ({ size: w.length, m: L.envelopeStageMeasure(full.stages[k], designEnvelopeStage(full.stages[k], k, { topology: spec.topology, resistorSeries: list, capacitors: spec.capacitors, pairs: w })) }))
			);
			for (let n = 0; n < count; n++) {
				let best = Infinity;
				const walk = (k, used, m) => {
					if (k === per.length) best = Math.min(best, m);
					else for (const o of per[k]) if (used + o.size <= n) walk(k + 1, used + o.size, m + o.m);
				};
				walk(0, 0, 0);
				envelopeSearched++;
				const got = L.limitEnvelopePairs({ ...spec, pairs: true }, n).measure;
				if (Math.abs(got - best) > 1e-9 * Math.max(best, 1e-12)) bad.push(`envelope ${ln} ${i} N=${n}: ${got} where an exhaustive search gives ${best}`);
			}
		}
		check(`pair limit: random envelope low-passes on three lists (${stagesSeen} stages, Sallen-Key and MFB), every limit: never more pairs than the limit over all stages, the summed stage misses never up below the count, the full design from the count on, single parts at 0, each stage a real design`, bad.length === 0 && limitedCases > 10, bad.length ? bad.slice(0, 3).join('; ') : `${limitedCases} with three pairs or more`);
		check('pair limit: the diode modulators and envelope low-passes give what an exhaustive search over every whitelist of their resistors finds, stage by stage for the filters', bad.length === 0 && envelopeSearched > 50, `${envelopeSearched} envelope limits, ${searched.limits} limits in all`);
	}

	// the LTspice files note the pairs a limit kept, and only those
	{
		const { generateDemodNetlist } = await import('../src/lib/modulation/spice.js');
		const problems = [];
		const stock = { resistorSeries: LAB_KIT.resistors, pairs: true };
		const notesOf = (text) => [...text.matchAll(/([A-Z][A-Z0-9]*) = \S+ \+ \S+ in series \((?:their sum is used below|drawn as their sum)\)/g)].map((m) => m[1]);
		const { carrierOf, options } = carrierCase(bench, LAB_KIT.resistors, LAB_KIT.capacitors, 1);
		const seen = [];
		for (const n of [1, 2, 3]) {
			const r = L.limitJfetWithCarrier(bench, n, options, carrierOf);
			const osc = works(r.oscillator) ? r.oscillator : null;
			const wanted = [...r.kept.map((k) => ({ Rac: 'RAC', Rbias: 'RBIAS', Rb: 'RB', Rdt: 'RDT', Rtop: 'RPT' })[k]), ...r.carrierKept.flatMap((slot) => ({ R: ['RSO', 'RPO'], Rf1: ['RF1O'], Rf2: ['RF2O'] })[slot])].sort();
			for (const [kind, text] of [['cir', modNetlist({ design: r.design, fmPreview: 1000, oscillator: osc, ...stock })], ['asc', modSchematic({ design: r.design, fmPreview: 1000, oscillator: osc, ...stock })]]) {
				const got = notesOf(text).sort();
				if (!same(got, wanted)) problems.push(`jfet N=${n} ${kind}: ${got.join(' ')} for ${wanted.join(' ')}`);
			}
			seen.push(`N=${n} ${wanted.join(' ')}`);
		}
		const dr = L.limitDiodePairs({ fp: 40000, fmMax: 1000, targetModulationIndex: 0.93, carrierDrive: 1.7, resistorSeries: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors, pairs: true }, 1);
		const dGot = notesOf(generateDiodeNetlist({ design: dr.design, ...stock })).sort();
		if (!same(dGot, dr.kept.map((k) => k.toUpperCase()).sort())) problems.push(`diode: ${dGot.join(' ')} for ${dr.kept.join(' ')}`);
		const er = L.limitEnvelopePairs({ response: 'butterworth', amaxDb: 1, aminDb: 60, fp: 1000, fs: 99000, order: 6, topology: 'mfb', resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors, pairs: true, maxOrder: 8 }, 4);
		const dm = { rectifierType: 'full', rectifier: designPrecisionRectifier({ resistorSeries: LAB_KIT.resistors }), envelope: er.design, fp: 50000, fm: 1000, index: 0.75, ...stock };
		for (const [kind, text] of [['cir', generateDemodNetlist(dm)], ['asc', generateDemodSchematic(dm)]]) {
			const got = notesOf(text).sort();
			if (!same(got, [...er.kept].sort())) problems.push(`demod ${kind}: ${got.join(' ')} for ${er.kept.join(' ')}`);
		}
		check('pair limit: the .cir and .asc note exactly the pairs a limit kept (the JFET modulator with its oscillator, the diode modulator, the envelope stages)', problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : `${seen.join('; ')}; diode ${dGot.join(' ')}; demod ${er.kept.join(' ')}`);
	}

	// what the page says when a limit took pairs away
	{
		const a = L.pairLimitNote({ limit: 1, kept: ['Rdt'], dropped: ['Rb', 'carrier Rf1'] });
		const b = L.pairLimitNote({ limit: 1, kept: [], dropped: ['R11', 'R21'], together: true });
		const c = L.pairLimitNote({ limit: 3, kept: ['R21', 'R12', 'R32'], dropped: ['R11', 'R31', 'R22'] });
		const texts = [a, b, c];
		check(
			'pair limit: one note says which pairs a limit kept and which became single parts, in clean text, and none when nothing was taken away',
			a === "At most 1 pair: the carrier divider's top stays two in series. R_b and the oscillator's Rf1 are single parts, though two in series would bring them closer." &&
				b === 'At most 1 pair: every resistor is a single part here. R1 and R2 of stage 1 are single parts, though two in series would bring them closer. Equal resistors pair together or not at all, and each one counts.' &&
				c.startsWith('At most 3 pairs: R2 of stage 1 and R1 and R3 of stage 2 stay two in series. R1 and R3 of stage 1 and R2 of stage 2 are single parts') &&
				L.pairLimitNote({ limit: 2, kept: ['Rb'], dropped: [] }) === null &&
				L.pairLimitNote({ limit: 2, kept: ['carrier R'], dropped: ['Rb'] }).includes("the oscillator's two R stay two in series") &&
				texts.every((t) => !/\byou(r)?\b|[–—]|undefined|NaN/i.test(t)),
			c
		);
		// a pair the limit adds where pairs where they help leave a single part is said to become one
		const added = L.pairLimitNote({ limit: 2, kept: ['Rac', 'Rdt'], dropped: ['Rbias', 'Rtop'], added: ['Rdt'] });
		const onlyAdded = L.pairLimitNote({ limit: 1, kept: ['Rdt'], dropped: ['Rb'], added: ['Rdt'] });
		check(
			'pair limit: the note says which pairs stay, which become pairs where pairs where they help leave single parts, and which became single parts',
			added === "At most 2 pairs: R_ac stays two in series, and the carrier divider's top becomes two in series too. R_bias and the post-gain stage's R_top are single parts, though two in series would bring them closer." &&
				onlyAdded === "At most 1 pair: the carrier divider's top becomes two in series. R_b is a single part, though two in series would bring it closer.",
			added
		);
	}

	// the downloaded scripts made the page's choice again from RESISTOR_PAIR_LIMIT (and
	// RESISTOR_PAIRS, a whitelist of the resistors that may pair): the downloads are Python files
	// now, which take the page's parts as data, so that is gone; what they write under a limit,
	// the pairs the page kept and its note, is checked with them at the end of this file
	// ("python: under a limit on the pairs")
}

/* ------------------------------------------ the Python downloads (python/index.js) */
// jfet-am-modulator.py, diode-tank-am-modulator.py and am-demodulator.py, the
// page's downloads in place of the JavaScript scripts it gave before (the
// engine inlined, codegen.js, gone), each checked through the harness
// scripts/lib-python.mjs on a matrix of the page's designs that covers its
// every option, one line below per property of each file:
//   the text     ASCII, parses for Python 3.8, no library API newer, the
//                standard library only (matplotlib.pyplot in its try), no
//                function defined twice; lines of 100 characters, no tab,
//                no trailing space, no dash but the hyphen, the word rules
//   the run      python -W error, matplotlib hidden (and on the Agg backend
//                for one file of each circuit), its printout in lines of 92
//                characters, every result read back through runpy
//   the design   the figures the file computes before any part are the
//                page's: the JFET's line, the window and the gate drive's
//                targets; the tank, its band, the best bias and R_b; the
//                template, the order and the stage targets (to 1e-12, the
//                bias 1e-9); its stock the page's, value for value
//   page parts   as the page shows them (within the 1e-12 the file writes
//                them to), each resistor the page builds of two in series
//                written as the stock's two parts, no other, named in the
//                comment above, no more of them than the page's limit, its
//                note on that limit above them; and their check equal to
//                the page's own design: 1e-10, the diode's cycle solve
//                1e-7, the bare diode's rectifier 1e-9
//   own parts    the file's rule written again in JavaScript, from its own
//                stock; their check equal to the same steps in JavaScript
//                (the JFET, the steps shown equal to the library's design on
//                the page's parts) or to the library's own solvers (the
//                diode's envelope, the envelope low-pass, the rectifier, the
//                coupling) on the same parts
//   the guards   editing a setting stops the file with its message, each
//                of the four the Wien bridge's carrier (a number written
//                in) rests on among them
// Then the properties the JavaScript scripts' checks held, now on the .py
// files; a random sweep; a control; the matrix covered.
{
	const { cleanup, editSetting, inspect, readResults, runFile } = await import('./lib-python.mjs');
	const { generateDemodPython, generateDiodePython, generateJfetPython } = await import('../src/lib/modulation/python/index.js');
	const { USUAL_CAPACITORS } = await import('../src/lib/modulation/python/shared.js');
	const { parseFixedVds } = await import('../src/lib/modulation/jfetModel.js');
	const { carrierCycle, currentTable, driveForIndex, envelopeOf, fundamentalWith, tankImpedance } = await import('../src/lib/modulation/diodeMixerModulator.js');
	const { envelopeGainDb } = await import('../src/lib/modulation/envelopeFilter.js');
	const L = await import('../src/lib/modulation/pairLimit.js');
	const { couplingGainAt, designOutputCoupling, HEADPHONE_MAX_OHMS, LOAD_CURRENT_LIMIT, LOAD_POWER_LIMIT } = await import('../src/lib/modulation/outputCoupling.js');
	const { demodSwing } = await import('../src/lib/modulation/rectifier.js');
	const { demodExpectation } = await import('../src/lib/modulation/spice.js');
	const { capacitorCandidates, resistorValues, seriesPair, seriesValues, SERIES } = await import('../src/lib/modulation/eseries.js');
	const { componentOptions, isRestricted } = await import('../src/lib/stock.js');
	const { LAB_KIT } = await import('../src/lib/filter/eseries.js');
	const started = performance.now();

	/* the page: its derived state for its inputs, and what its download functions pass */
	const JFET_INPUTS = {
		jfetMode: 'measured',
		vp: -4,
		idssMa: 5,
		rdsOn: 400,
		measurementText: ['-0.5  0.2  0.0026  1000', '-1.0  0.2  0.0029  1000', '-1.5  0.2  0.0031  1000', '-2.0  0.2  0.0034  1000', '-2.5  0.2  0.0037  1000', '-3.0  0.2  0.0041  1000'].join('\n'),
		fixedVds: 0.2,
		seriesR: 0,
		fixedText: [' 0.0   2.60', '-0.5   2.53', '-1.0   2.46', '-1.5   2.39', '-2.0   2.32', '-2.5   2.25', '-3.0   2.16', '-3.5   2.07', '-4.0   1.95', '-4.5   1.83', '-5.0   1.68', '-5.5   1.50', '-6.0   1.24', '-6.5   0.85', '-7.0   0.19', '-7.5   0.00'].join('\n'),
		windowLow: -7.2,
		windowHigh: 0,
		swingFraction: 0.9,
		targetN: 0.75,
		sourceAmplitude: 1,
		fmMin: 100,
		vcc: 15,
		fp: 50000,
		topology: 'noninverting',
		targetOutputAmplitude: 1,
		outputStage: false,
		carrierBuffer: true,
		carrierFrom: 'wien',
		carrierSourceAmplitude: 1,
		carrierMargin: 0.15,
		opampSwing: 13.5,
		gbwMhz: 4,
		slewRateVus: 16,
		fmPreview: 1000
	};
	const STOCK_INPUTS = { stock: 'E24', resistorText: '', capacitorText: '', pairs: false, pairLimit: null };
	const works = (o) => Boolean(o && o.starts && o.limiter.regulates && o.opamp.swingOk);
	const stockArgsOf = (s, parts, pairCap) => ({ kind: s.stock, resistors: parts.resistorSeries, capacitors: parts.capacitors, pairs: parts.pairs, pairLimit: pairCap });

	/** The JFET panels (jfetModel, jfetSection: the Wien carrier and the pairs limit shared with it) and downloadJfet's arguments. */
	function jfetPage(inputs) {
		const s = { ...JFET_INPUTS, ...STOCK_INPUTS, ...inputs };
		const parts = componentOptions(s.stock, s.resistorText, s.capacitorText, s.pairs, s.pairLimit);
		const restricted = isRestricted(s.stock);
		const pairCap = parts.pairs ? parts.pairLimit : null;
		const points = s.jfetMode === 'measured' ? parseMeasurements(s.measurementText) : s.jfetMode === 'fixedvds' ? parseFixedVds(s.fixedText, { vds: s.fixedVds, rs: s.seriesR }).rows : [];
		let model;
		if (s.jfetMode === 'idss') model = modelFromIdss(s.vp, s.idssMa / 1000);
		else if (s.jfetMode === 'rdson') model = modelFromRdsOn(s.vp, s.rdsOn);
		else {
			const m = fitModel(points, { low: s.windowLow, high: s.windowHigh });
			model = m && s.jfetMode === 'fixedvds' ? { ...m, source: 'fixedvds', vds: s.fixedVds, rs: s.seriesR > 0 ? s.seriesR : 0 } : m;
		}
		const ceiling = model ? conductanceDepth(model, s.swingFraction) : null;
		const gbw = s.gbwMhz * 1e6;
		const slewRate = s.slewRateVus * 1e6;
		const valid = model !== null && ceiling !== null && s.swingFraction > 0 && s.swingFraction <= 1 && s.targetN > 0 && s.targetN < ceiling && s.fp > 0 && gbw > 0 && slewRate > 0 && s.opampSwing > 0;
		const inputsOf = { model, topology: s.topology, targetOutputAmplitude: s.targetOutputAmplitude, outputStage: s.outputStage, carrierBuffer: s.carrierBuffer, swingFraction: s.swingFraction, targetModulationIndex: s.targetN, sourceAmplitude: s.sourceAmplitude, fmMin: s.fmMin, vcc: s.vcc, fp: s.fp, carrierMargin: s.carrierMargin, opampSwing: s.opampSwing, gbw, slewRate, ...parts };
		const carrierFor = (pairs) => {
			const osc = (p) => designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: s.fp, amplitude: s.carrierSourceAmplitude, gbw, slewRate, opampSwing: s.opampSwing, ...p });
			const mine = osc({ resistorSeries: parts.resistorSeries, capacitors: parts.capacitors, pairs });
			if (!restricted || works(mine)) return mine;
			const fallback = osc({ resistorSeries: 'E24', capacitors: null, pairs: false });
			return works(fallback) || !mine ? fallback && { ...fallback, stockShortfall: true } : mine;
		};
		const carrierOf = (o) => (s.carrierFrom === 'wien' && works(o) && o.limiter.amplitudeActual ? o.limiter.amplitudeActual : s.carrierSourceAmplitude);
		let section = null;
		if (valid) {
			if (pairCap === null) {
				const oscillator = s.carrierFrom === 'wien' ? carrierFor(parts.pairs) : null;
				const carrier = carrierOf(oscillator);
				section = { design: designJfetModulator({ ...inputsOf, carrierSourceAmplitude: carrier }), oscillator, carrier };
			} else if (s.carrierFrom !== 'wien') section = { ...L.limitJfetPairs({ ...inputsOf, carrierSourceAmplitude: s.carrierSourceAmplitude }, pairCap), oscillator: null, carrier: s.carrierSourceAmplitude, carrierKept: [], carrierDropped: [], carrierAdded: [], carrierCount: 0, budget: pairCap };
			else section = L.limitJfetWithCarrier(inputsOf, pairCap, L.carrierPairOptions(carrierFor, parts.resistorSeries), carrierOf);
		}
		const design = section?.design ?? null;
		if (!design) return { s, model, design: null };
		const w = works(section.oscillator) ? section.oscillator : null;
		const sm = design.conditioning.summer;
		let limitNote = null;
		if (section.limited) {
			const carrierName = (slot) => `carrier ${slot}`;
			const together = pairCap - section.count === 1 && section.carrierDropped.includes('R');
			const carrierDropped = section.oscillator?.stockShortfall ? [] : section.carrierDropped;
			limitNote = L.pairLimitNote({ limit: pairCap, kept: [...section.kept, ...section.carrierKept.map(carrierName)], dropped: [...section.dropped, ...carrierDropped.map(carrierName)], added: [...(section.added ?? []), ...(section.carrierAdded ?? []).map(carrierName)], together });
		}
		const page = { Rf: sm.rf, Rac: sm.rac, Rbias: sm.rbias, C: sm.c, ...(design.topology === 'inverting' ? { R2: design.r2 } : { Rb: design.rb }), Rdt: design.carrier.divider.top, Rdb: design.carrier.divider.bottom, ...(design.postGain?.needed ? { Rtop: design.postGain.rtop, Rbottom: design.postGain.rbottom } : {}) };
		const args = {
			mode: s.jfetMode,
			vp: s.vp,
			idssMa: s.idssMa,
			rdsOn: s.rdsOn,
			text: s.jfetMode === 'fixedvds' ? s.fixedText : s.measurementText,
			vds: s.fixedVds,
			rs: s.seriesR,
			window: model.fit ? [model.fit.low, model.fit.high] : null,
			topology: s.topology,
			targetOutputAmplitude: s.targetOutputAmplitude,
			outputStage: s.outputStage,
			carrierBuffer: s.carrierBuffer,
			swingFraction: s.swingFraction,
			targetModulationIndex: s.targetN,
			sourceAmplitude: s.sourceAmplitude,
			fmMin: s.fmMin,
			vcc: s.vcc,
			fp: s.fp,
			carrierAmplitude: section.carrier,
			wien: w ? { r: w.r, c: w.c, rf1: w.parts.rf1, rf2: w.parts.rf2, rg: w.rg } : null,
			carrierMargin: s.carrierMargin,
			opampSwing: s.opampSwing,
			gbw,
			slewRate,
			fmPreview: s.fmPreview,
			stock: stockArgsOf(s, parts, pairCap),
			page,
			limitNote
		};
		return { s, model, design, oscillator: section.oscillator, section, args };
	}

	const DIODE_INPUTS = { fpDiode: 40000, fmMaxDiode: 1000, sidebandMargin: 3, carrierAmp: 1, modAmp: 1, targetNDiode: 0.8, carrierDrive: 2, vccDiode: 12, diodePart: '1N4148', inductanceMh: 1 };

	/** The diode panels (the design shown, the E24 fallback where the stock reaches no index) and downloadDiode's arguments. */
	function diodePage(inputs) {
		const s = { ...DIODE_INPUTS, ...STOCK_INPUTS, ...inputs };
		const parts = componentOptions(s.stock, s.resistorText, s.capacitorText, s.pairs, s.pairLimit);
		const pairCap = parts.pairs ? parts.pairLimit : null;
		const inductance = s.inductanceMh / 1000;
		const valid = s.fpDiode > 0 && s.fmMaxDiode > 0 && s.fpDiode - s.sidebandMargin * s.fmMaxDiode > s.fmMaxDiode && inductance > 0 && s.sidebandMargin > 0 && s.carrierAmp > 0 && s.modAmp > 0 && s.targetNDiode > 0 && s.targetNDiode <= 1 && s.carrierDrive > 0 && s.vccDiode > 0;
		if (!valid) return { s, design: null };
		const params = { fp: s.fpDiode, fmMax: s.fmMaxDiode, sidebandMargin: s.sidebandMargin, inductance, carrierAmplitude: s.carrierAmp, modAmplitude: s.modAmp, targetModulationIndex: s.targetNDiode, carrierDrive: s.carrierDrive, vcc: s.vccDiode, opampSwing: Math.max(0.5, s.vccDiode - 1.5), diode: s.diodePart, resistorSeries: parts.resistorSeries, capacitorStock: parts.capacitors, pairs: parts.pairs };
		const limited = pairCap === null ? null : L.limitDiodePairs(params, pairCap);
		const own = limited ? limited.design : designDiodeMixerModulator(params);
		let design = own;
		if (isRestricted(s.stock) && !(own && own.indexOk)) {
			const fallback = designDiodeMixerModulator({ ...params, resistorSeries: 'E24', capacitorStock: null, pairs: false });
			if (fallback && (!own || (fallback.indexOk && !own.indexOk))) design = { ...fallback, stockShortfall: true };
		}
		if (!design) return { s, design: null };
		const args = {
			fp: s.fpDiode,
			fmMax: s.fmMaxDiode,
			sidebandMargin: s.sidebandMargin,
			inductance,
			carrierAmplitude: s.carrierAmp,
			modAmplitude: s.modAmp,
			targetModulationIndex: s.targetNDiode,
			carrierDrive: s.carrierDrive,
			vcc: s.vccDiode,
			diode: s.diodePart,
			stock: design.stockShortfall ? { kind: 'E24', resistors: 'E24', capacitors: null, pairs: false, pairLimit: null } : stockArgsOf(s, parts, pairCap),
			shortfall: Boolean(design.stockShortfall),
			page: { Rf: design.summer.rf, Rp: design.summer.rp, Rm: design.summer.rm, Rb: design.summer.rb, Rs: design.rs, Rt: design.rt, C: design.capacitors },
			limitNote: limited?.limited && !design.stockShortfall ? L.pairLimitNote({ limit: pairCap, kept: limited.kept, dropped: limited.dropped, added: limited.added }) : null
		};
		return { s, design, limited, args };
	}

	const DEMOD_INPUTS = { rectifierType: 'full', fpCarrierDemod: 50000, fmMaxDemod: 1000, amaxDb: 1, aminDb: 40, response: 'butterworth', envelopeTopology: 'sallenKey', orderOverride: null, demoModIndex: 0.75, demodAmplitude: 1, demodOpampSwing: 13.5, outputCoupling: true, loadOhms: 32, fmMinDemod: 100 };

	/** The demodulator panels (the low-pass and its check, what comes out, the coupling and the band through it) and downloadDemod's arguments. */
	function demodPage(inputs) {
		const s = { ...DEMOD_INPUTS, ...STOCK_INPUTS, ...inputs };
		const parts = componentOptions(s.stock, s.resistorText, s.capacitorText, s.pairs, s.pairLimit);
		const pairCap = parts.pairs ? parts.pairLimit : null;
		const ripple = s.rectifierType === 'full' ? 2 * s.fpCarrierDemod : s.fpCarrierDemod;
		const valid = s.fmMaxDemod > 0 && s.fmMaxDemod < s.fpCarrierDemod && ripple - s.fmMaxDemod > s.fmMaxDemod && s.amaxDb > 0 && s.aminDb > s.amaxDb && s.demoModIndex > 0 && s.demoModIndex <= 1 && s.demodAmplitude > 0 && s.demodOpampSwing > 0;
		if (!valid) return { s, envelope: null };
		const spec = { response: s.response, amaxDb: s.amaxDb, aminDb: s.aminDb, fp: s.fmMaxDemod, fs: ripple - s.fmMaxDemod, order: s.orderOverride, topology: s.envelopeTopology, maxOrder: 8, ...parts };
		const limited = pairCap === null ? null : L.limitEnvelopePairs(spec, pairCap);
		const raw = limited ? limited.design : designEnvelopeLowPass(spec);
		const envelope = raw && !raw.tooHigh ? raw : null;
		if (!envelope) return { s, envelope: null };
		let top = -Infinity;
		let bottom = Infinity;
		for (let i = 0; i <= 200; i++) {
			const db = envelopeGainDb(envelope, (s.fmMaxDemod * i) / 200 || s.fmMaxDemod / 1000);
			top = Math.max(top, db);
			bottom = Math.min(bottom, db);
		}
		const atSideband = envelopeGainDb(envelope, ripple - s.fmMaxDemod);
		const verdict = { span: top - bottom, atSideband, maxQ: Math.max(...envelope.realized.map((st) => st.actual.q)), spanOk: top - bottom <= s.amaxDb + 0.1, stopOk: -atSideband >= s.aminDb - 0.1 };
		const rectifier = s.rectifierType === 'full' ? designPrecisionRectifier({ resistorSeries: parts.resistorSeries }) : designHalfWaveRectifier({ resistorSeries: parts.resistorSeries });
		const out = demodExpectation({ rectifierType: s.rectifierType, rectifier, envelope, fp: s.fpCarrierDemod, fm: s.fmMaxDemod, index: s.demoModIndex, amplitude: s.demodAmplitude });
		const swing = demodSwing({ rectifierType: s.rectifierType, amplitude: s.demodAmplitude, index: s.demoModIndex, out, swing: s.demodOpampSwing });
		const couplingValid = s.loadOhms > 0 && s.fmMinDemod > 0 && s.fmMinDemod < s.fmMaxDemod;
		const coupling = s.outputCoupling && couplingValid ? designOutputCoupling({ rLoad: s.loadOhms, fmMin: s.fmMinDemod, fm: s.fmMaxDemod, amaxDb: s.amaxDb, level: out.mean, tone: out.tone, amplitude: s.demodAmplitude, capacitors: parts.capacitors }) : null;
		let band = null;
		if (coupling) {
			let hi = -Infinity;
			let lo = Infinity;
			for (let i = 0; i <= 200; i++) {
				const f = s.fmMinDemod * (s.fmMaxDemod / s.fmMinDemod) ** (i / 200);
				const db = envelopeGainDb(envelope, f) + 20 * Math.log10(couplingGainAt(coupling, f));
				hi = Math.max(hi, db);
				lo = Math.min(lo, db);
			}
			band = { span: hi - lo, ok: hi - lo <= s.amaxDb + 0.1 };
		}
		const stages = envelope.realized.map((st) => {
			const c = st.components;
			return { parts: st.topology === 'mfb' ? { R1: c.R1, R2: c.R2, R3: c.R3, C1: c.C1, C2: c.C2 } : { R1: c.R1, R2: c.R2, Ctop: c.Ctop, Cbottom: c.Cbottom }, shortfall: Boolean(st.stockShortfall) };
		});
		const args = {
			rectifierType: s.rectifierType,
			fpCarrier: s.fpCarrierDemod,
			fmMax: s.fmMaxDemod,
			amaxDb: s.amaxDb,
			aminDb: s.aminDb,
			order: s.orderOverride,
			response: s.response,
			topology: s.envelopeTopology,
			index: s.demoModIndex,
			amplitude: s.demodAmplitude,
			opampSwing: s.demodOpampSwing,
			outputCoupling: Boolean(coupling),
			loadOhms: s.loadOhms,
			fmMin: s.fmMinDemod,
			stock: stockArgsOf(s, parts, pairCap),
			page: { R: s.rectifierType === 'full' ? rectifier.r1 : rectifier.rl, stages, Cout: coupling ? coupling.c : null },
			limitNote: limited?.limited ? L.pairLimitNote({ limit: pairCap, kept: limited.kept, dropped: limited.dropped, added: limited.added, together: pairCap - limited.count === 1 && limited.dropped.some((name) => name.startsWith('R1')) }) : null
		};
		return { s, envelope, limited, verdict, out, swing, coupling, band, args };
	}

	/* the files' rules in JavaScript, written again from their comments, the arithmetic the files' own */
	const lnMiss = (got, want) => Math.abs(Math.log(got / want));
	const neighbours = (r, list) => {
		let below = null;
		let above = null;
		for (const v of list) {
			if (v <= r && (below === null || v > below)) below = v;
			if (v >= r && (above === null || v < above)) above = v;
		}
		return [...new Set([below, above].filter((v) => v !== null))].sort((x, y) => x - y);
	};
	const closer = (r, figure, target, list) => neighbours(r, list).reduce((b, v) => (b === null || lnMiss(figure(v), target) < lnMiss(figure(b), target) ? v : b), null);
	const nearestOf = (target, list) => list.reduce((b, v) => (Math.abs(Math.log(v / target)) < Math.abs(Math.log(b / target)) ? v : b), list[0]);

	/** The JFET file's steps 3 to 6 in JavaScript: gate(), cell(), carrier(), stage(), opamp(). */
	function jfetSteps(a, m) {
		const inverting = a.topology === 'inverting';
		const { vp, beta } = m;
		const gate = (p) => {
			const gain = p.Rf / p.Rac;
			const bias = -(p.Rf * a.vcc) / p.Rbias;
			const swing = gain * a.sourceAmplitude;
			return { gain, bias, vgs_min: bias - swing, vgs_max: bias + swing, depth: swing / (bias - vp), r_vc: 1 / (beta * (bias - vp)) };
		};
		const cell = (p, g) => {
			if (inverting) {
				const x = p.R2 / g.r_vc;
				return { x, n: g.depth, k0: x, r_min: 1 / (beta * (g.vgs_max - vp)), k_min: x * (1 - g.depth), k_max: x * (1 + g.depth) };
			}
			const x = p.Rb / g.r_vc;
			const rMin = 1 / (beta * (g.vgs_max - vp));
			return { x, n: (g.depth * x) / (1 + x), k0: 1 + x, r_min: rMin, k_min: 1 + p.Rb / (1 / (beta * (g.vgs_min - vp))), k_max: 1 + p.Rb / rMin };
		};
		const limitOf = (g, k) => Math.min(a.carrierMargin * (g.vgs_min - vp), a.opampSwing / k.k_max);
		const carrier = (p, g, k) => {
			const ac = (a.carrierAmplitude * p.Rdb) / (p.Rdt + p.Rdb);
			return { limit: limitOf(g, k), ac, out: k.k0 * ac, env_max: k.k_max * ac, env_min: k.k_min * ac, current: ac / k.r_min, tone_2fp: ((inverting ? p.R2 : p.Rb) * beta * ac * ac) / 4 };
		};
		const loss = (gain) => {
			const r = (a.fp * gain) / a.gbw;
			return 1 / Math.sqrt(1 + r * r);
		};
		const stage = (p, car) => {
			if (!('Rtop' in p)) return { k: 1, kept: 1, out: car.out, peak: car.env_max };
			const k = 1 + p.Rtop / p.Rbottom;
			return { k, kept: loss(k), out: k * car.out * loss(k), peak: k * car.env_max };
		};
		const stats = (envelope) => {
			const e = Array.from({ length: 512 }, (_, i) => envelope(Math.cos((2 * Math.PI * i) / 512)));
			const harmonic = (h) => {
				let re = 0;
				let im = 0;
				e.forEach((v, i) => {
					re += v * Math.cos((2 * Math.PI * h * i) / 512);
					im -= v * Math.sin((2 * Math.PI * h * i) / 512);
				});
				return Math.hypot(re, im) / 512;
			};
			let rest = 0;
			for (let h = 2; h <= 10; h++) rest += harmonic(h) ** 2;
			const crest = envelope(1);
			const trough = envelope(-1);
			return { n: (crest - trough) / (crest + trough), crest, trough, thd: Math.sqrt(rest) / harmonic(1) };
		};
		const sourceZ = (p, follower) => (follower ? 5 : p.Rdt > 0 ? (p.Rdt * p.Rdb) / (p.Rdt + p.Rdb) : 0);
		const opamp = (p, g, k, car) => {
			const s = g.depth;
			const x = k.x;
			const zG = inverting ? sourceZ(p, a.carrierBuffer !== false) * beta * (g.bias - vp) : 0;
			const st = inverting ? stats((mm) => ((x * (1 + s * mm)) / (1 + zG * (1 + s * mm))) * loss(1 + x * (1 + s * mm))) : stats((mm) => (1 + x * (1 + s * mm)) * loss(1 + x * (1 + s * mm)));
			const noise = [-1, 0, 1].map((mm) => 1 + x * (1 + s * mm));
			const lifted = (4 * car.tone_2fp) / car.ac;
			const opamps = 2 + (inverting && a.carrierBuffer !== false ? 1 : 0) + ('Rtop' in p ? 1 : 0);
			return { noise, kept: noise.map(loss), n_eff: st.n, n_peaks: (st.crest - st.trough) / (st.crest + st.trough + lifted), thd: st.thd, gbw_ratio: (a.fp * noise[2]) / a.gbw, slew: 2 * Math.PI * a.fp * car.env_max, opamps };
		};
		const evaluate = (p) => {
			const g = gate(p);
			const k = cell(p, g);
			const car = carrier(p, g, k);
			return { gain: g.gain, bias: g.bias, depth: g.depth, fc: 1 / (2 * Math.PI * p.Rac * p.C), ...k, ...car, ...opamp(p, g, k, car), stage: stage(p, car) };
		};
		return { gate, cell, carrier, limitOf, evaluate };
	}

	/** The JFET file's own parts, its rule a to e, from its own stock (R, C). */
	function jfetRule(a, m, R, C) {
		const f = jfetSteps(a, m);
		const inverting = a.topology === 'inverting';
		const gainT = (a.swingFraction * m.halfRange) / a.sourceAmplitude;
		const biasT = Math.abs(m.vc);
		const tried = R.filter((v) => v >= 4.7e3 && v <= 47e3);
		const choices = [];
		for (const rf of tried.length ? tried : [nearestOf(10e3, R)]) {
			const rac = closer(rf / gainT, (r) => rf / r, gainT, R);
			const rbias = closer((rf * a.vcc) / biasT, (r) => (rf * a.vcc) / r, biasT, R);
			const g = f.gate({ Rf: rf, Rac: rac, Rbias: rbias });
			if (g.vgs_min > m.vp && (inverting || g.depth > a.targetModulationIndex)) choices.push([Math.max(lnMiss(g.gain, gainT), lnMiss(-g.bias, biasT)), rf, rac, rbias]);
		}
		if (!choices.length) return null;
		const least = Math.min(...choices.map((c) => c[0]));
		const [, rf, rac, rbias] = choices.filter((c) => c[0] <= least + 1e-9).reduce((b, c) => (Math.abs(Math.log(c[1] / 10e3)) < Math.abs(Math.log(b[1] / 10e3)) ? c : b));
		const cExact = 1 / (2 * Math.PI * rac * (a.fmMin / 10));
		const up = C.filter((v) => v >= cExact * (1 - 1e-9));
		const p = { Rf: rf, Rac: rac, Rbias: rbias, C: up.length ? Math.min(...up) : Math.max(...C) };
		const g = f.gate(p);
		if (inverting) {
			const xRule = ((0.2 * a.gbw) / a.fp - 1) / (1 + g.depth);
			const r2Max = Math.min(10, xRule > 0.5 ? xRule : 0.5) * g.r_vc;
			const below = R.filter((v) => v <= r2Max * (1 + 1e-9));
			p.R2 = below.length ? Math.max(...below) : nearestOf(r2Max, R);
		} else {
			const t = a.targetModulationIndex;
			p.Rb = closer((t / (g.depth - t)) * g.r_vc, (r) => f.cell({ Rb: r }, g).n, t, R);
		}
		const k = f.cell(p, g);
		const ratio = Math.min(1, f.limitOf(g, k) / a.carrierAmplitude);
		let foot = nearestOf(1e3, R);
		let top = 0;
		if (ratio < 1) {
			const topExact = foot * (1 / ratio - 1);
			const above = R.filter((v) => v >= topExact * (1 - 1e-9));
			top = above.length ? Math.min(...above) : Math.max(...R);
			if (top < topExact * (1 - 1e-9)) {
				const down = R.filter((v) => v <= (top / (1 / ratio - 1)) * (1 + 1e-9));
				if (down.length) foot = Math.max(...down);
			}
		}
		p.Rdt = top;
		p.Rdb = foot;
		if (inverting || a.outputStage) {
			const kT = a.targetOutputAmplitude / f.carrier(p, g, k).out;
			if (kT > 1.05) {
				const rbottom = nearestOf(1e3, R);
				p.Rtop = closer((kT - 1) * rbottom, (r) => 1 + r / rbottom, kT, R);
				p.Rbottom = rbottom;
			}
		}
		return p;
	}

	/** The diode file's message drive and own R_p, R_m (the four roundings), from the library's own solvers. */
	function diodeRule(a, py, R) {
		const d = DIODE_MODELS[a.diode] ?? DIODE_MODELS['1N4148'];
		const rf = nearestOf(10e3, R);
		const c = py.tank_c.reduce((x, y) => x + y, 0);
		const reach = 3 * a.carrierDrive + 2;
		const current = currentTable(py.rs, d, -reach, reach);
		const base = { a: a.carrierDrive, z: tankImpedance(a.fp, { r: py.rt, l: a.inductance, c }), relax: 1 / (1 + py.rt / (2 * py.rs)) };
		const vb = py.rb ? (rf * a.vcc) / py.rb : 0;
		const umWanted = driveForIndex(current, base, vb, a.targetModulationIndex, 12, 64);
		let best = null;
		for (const rp of neighbours((rf * a.carrierAmplitude) / a.carrierDrive, R)) {
			const drive = (rf / rp) * a.carrierAmplitude;
			for (const rm of neighbours((rf * a.modAmplitude) / ((umWanted ?? py.um_wanted) * (drive / a.carrierDrive)), R)) {
				const off = lnMiss(envelopeOf(current, { ...base, a: drive, um: (rf / rm) * a.modAmplitude, vb }, 12, 64).n, a.targetModulationIndex);
				if (!best || off < best.off) best = { off, rp, rm };
			}
		}
		return { umWanted, parts: { Rf: rf, Rp: best.rp, Rm: best.rm, Rb: py.rb, Rs: py.rs, Rt: py.rt, C: py.tank_c } };
	}

	/** A set of diode modulator parts through the page's evaluation (its design's build), from the library's own solvers. */
	function diodeEval(a, p) {
		const d = DIODE_MODELS[a.diode] ?? DIODE_MODELS['1N4148'];
		const c = p.C.reduce((x, y) => x + y, 0);
		const reach = 3 * a.carrierDrive + 2;
		const current = currentTable(p.Rs, d, -reach, reach);
		const z = tankImpedance(a.fp, { r: p.Rt, l: a.inductance, c });
		const relax = 1 / (1 + p.Rt / (2 * p.Rs));
		const drive = (p.Rf / p.Rp) * a.carrierAmplitude;
		const um = (p.Rf / p.Rm) * a.modAmplitude;
		const vb = p.Rb ? (p.Rf * a.vcc) / p.Rb : 0;
		const env = envelopeOf(current, { a: drive, um, vb, z, relax }, 32, 128);
		const at = carrierCycle(current, drive, vb, z, 128, relax);
		const dv = 1e-3 * Math.max(1e-3, Math.hypot(at.v1.re, at.v1.im));
		const di = fundamentalWith(current, drive, vb, at.v1, 128).re - fundamentalWith(current, drive, vb, { re: at.v1.re + dv, im: at.v1.im }, 128).re;
		const rSource = di > 0 ? dv / di : 2 * p.Rs;
		const rEff = 1 / (1 / p.Rt + 1 / rSource);
		const f0 = 1 / (2 * Math.PI * Math.sqrt(a.inductance * c));
		const bw = 1 / (2 * Math.PI * rEff * c);
		const mag = (q) => Math.hypot(q.re, q.im);
		const loaded = { r: rEff, l: a.inductance, c };
		const zc = mag(tankImpedance(a.fp, loaded));
		const sideband = (mag(tankImpedance(a.fp - a.fmMax, loaded)) / zc + mag(tankImpedance(a.fp + a.fmMax, loaded)) / zc) / 2;
		const hOut = env.harmonics.map((x, k) => x * ((mag(tankImpedance(a.fp - (k + 1) * a.fmMax, loaded)) + mag(tankImpedance(a.fp + (k + 1) * a.fmMax, loaded))) / (2 * zc)));
		const peak = drive + um + vb;
		return {
			n: env.n,
			mean: env.mean,
			thd: env.thd,
			max: env.max,
			min: env.min,
			peak: env.peak,
			r_source: rSource,
			r_loaded: rEff,
			bw,
			q: f0 / bw,
			sideband,
			index_fm: env.n * sideband,
			thd_fm: hOut[0] > 0 ? Math.sqrt(hOut.slice(1).reduce((s, x) => s + x * x, 0)) / hOut[0] : 0,
			peak_out: peak,
			current: env.peak + peak / p.Rf,
			leak: (mag(tankImpedance(a.fmMax, loaded)) * (um / (2 * p.Rs))) / Math.max(1e-12, env.mean),
			noise: 1 + p.Rf * (1 / p.Rp + 1 / p.Rm + (p.Rb ? 1 / p.Rb : 0)),
			ideal_n: (4 * um) / (Math.PI * drive),
			ideal_out: (drive * rEff) / (2 * p.Rs)
		};
	}

	const skFigures = (p) => {
		const w0 = 1 / Math.sqrt(p.R1 * p.R2 * p.Ctop * p.Cbottom);
		return { w0, q: 1 / (w0 * (p.R1 + p.R2) * p.Cbottom) };
	};
	const mfbFigures = (p) => {
		const w0 = 1 / Math.sqrt(p.R2 * p.R3 * p.C1 * p.C2);
		return { w0, q: w0 / ((1 / p.R1 + 1 / p.R2 + 1 / p.R3) / p.C1) };
	};

	/** The demodulator file's own parts of each stage, its rule a to c (lowpass.js); null where a stage has no choice. */
	function demodRule(a, stages, R, C, fallback) {
		const mfb = a.topology === 'mfb';
		const figures = mfb ? mfbFigures : skFigures;
		const within = (p) => Object.entries(p).every(([name, v]) => name[0] !== 'R' || (v > 200 && v < 2e6));
		const level = (p) => {
			const values = Object.entries(p).filter(([name]) => name[0] === 'R').map(([, v]) => v);
			return values.reduce((s, v) => s + Math.log(v / 10e3) ** 2, 0) / values.length;
		};
		const miss = (got, want) => Math.max(lnMiss(got.w0, want.w0), lnMiss(got.q, want.q));
		const rounded = (p) => {
			const target = figures(p);
			const names = Object.keys(p).filter((name) => name[0] === 'R' && name !== 'R3');
			let best = null;
			let bestMiss = Infinity;
			const walk = (i, trial) => {
				if (i === names.length) {
					const t = mfb ? { ...trial, R3: trial.R1 } : trial;
					const off = miss(figures(t), target);
					if (off < bestMiss) {
						best = t;
						bestMiss = off;
					}
					return;
				}
				for (const v of neighbours(p[names[i]], R)) walk(i + 1, { ...trial, [names[i]]: v });
			};
			walk(0, { ...p });
			return best;
		};
		const out = [];
		for (const st of stages) {
			const tried = [];
			if (mfb) {
				const k = st.w0 / st.q;
				for (const c1 of C) {
					for (const c2 of C) {
						const disc = (k * c1) ** 2 - 8 * st.w0 * st.w0 * c1 * c2;
						if (disc < 0) continue;
						for (const x of [(k * c1 + Math.sqrt(disc)) / 4, (k * c1 - Math.sqrt(disc)) / 4]) tried.push({ R1: 1 / x, R2: 1 / (k * c1 - 2 * x), R3: 1 / x, C1: c1, C2: c2 });
					}
				}
			} else {
				for (const ctop of C) {
					for (const cbottom of C) {
						const total = 1 / (st.w0 * st.q * cbottom);
						const disc = total * total - 4 / (st.w0 * st.w0 * ctop * cbottom);
						if (disc < 0) continue;
						const r1 = (total + Math.sqrt(disc)) / 2;
						tried.push({ R1: r1, R2: total - r1, Ctop: ctop, Cbottom: cbottom });
					}
				}
				if (!tried.length && fallback) {
					const topRatio = Math.max(...C.flatMap((ctop) => C.map((cbottom) => ctop / cbottom)));
					for (const ctop of C) {
						for (const cbottom of C) {
							if (ctop / cbottom !== topRatio) continue;
							const r = 1 / (st.w0 * Math.sqrt(ctop * cbottom));
							tried.push({ R1: r, R2: r, Ctop: ctop, Cbottom: cbottom });
						}
					}
				}
			}
			if (!tried.length) return null;
			const kept = tried.filter(within);
			const pairs = (kept.length ? kept : tried).map((p) => [p, rounded(p)]);
			const misses = pairs.map(([p, r]) => miss(figures(r), figures(p)));
			const least = Math.min(...misses);
			out.push(pairs.filter((_, i) => misses[i] <= least + 1e-9).reduce((b, pair) => (level(pair[0]) < level(b[0]) ? pair : b))[1]);
		}
		return out;
	}

	/** A set of demodulator parts through the library's own evaluation: its stages built as the library's, its gain, rectifier and coupling. */
	function demodEval(a, p) {
		const mfb = a.topology === 'mfb';
		const realized = p.stages.map((st) => {
			const f = mfb ? mfbFigures(st) : skFigures(st);
			return { topology: mfb ? 'mfb' : 'sallenKey', components: st, actual: { wn: f.w0, q: f.q, gain: mfb ? -1 : 1 } };
		});
		const envelope = { realized };
		let top = -Infinity;
		let bottom = Infinity;
		for (let i = 0; i <= 200; i++) {
			const db = envelopeGainDb(envelope, (a.fmMax * i) / 200 || a.fmMax / 1000);
			top = Math.max(top, db);
			bottom = Math.min(bottom, db);
		}
		const ripple = a.rectifierType === 'full' ? 2 * a.fpCarrier : a.fpCarrier;
		const rectifier = a.rectifierType === 'full' ? { diode: '1N4148', r1: p.R } : { diode: '1N4148', rl: p.R };
		const out = recoveredEnvelope({ rectifierType: a.rectifierType, rectifier, envelope, fm: a.fmMax, index: a.index, amplitude: a.amplitude });
		const swing = demodSwing({ rectifierType: a.rectifierType, amplitude: a.amplitude, index: a.index, out, swing: a.opampSwing });
		const result = { span: top - bottom, at_fs: envelopeGainDb(envelope, ripple - a.fmMax), mean: out.mean, tone: out.tone, needed: swing.needed, ...(a.rectifierType === 'half' ? { ideal: out.ideal.tone } : {}), figures: realized.map((st) => ({ w0: st.actual.wn, q: st.actual.q })) };
		// judged the page's way: its template's slack, its flag past a Q of 4, demodSwing, the coupling's limits
		const maxQ = Math.max(...realized.map((st) => st.actual.q));
		result.checks = { passband: result.span <= a.amaxDb + 0.1, stopband: -result.at_fs >= a.aminDb - 0.1, 'sharpest Q': maxQ <= 4, swing: swing.ok };
		if (a.outputCoupling) {
			const fc = 1 / (2 * Math.PI * a.loadOhms * p.Cout);
			let hi = -Infinity;
			let lo = Infinity;
			for (let i = 0; i <= 200; i++) {
				const f = a.fmMin * (a.fmMax / a.fmMin) ** (i / 200);
				const db = envelopeGainDb(envelope, f) + 20 * Math.log10(couplingGainAt({ fc }, f));
				hi = Math.max(hi, db);
				lo = Math.min(lo, db);
			}
			const toneLoad = out.tone * couplingGainAt({ fc }, a.fmMax);
			const power = toneLoad ** 2 / (2 * a.loadOhms);
			Object.assign(result, { fc, band_span: hi - lo, tone_load: toneLoad, current: toneLoad / a.loadOhms, power });
			Object.assign(result.checks, { band: hi - lo <= a.amaxDb + 0.1, current: toneLoad / a.loadOhms <= LOAD_CURRENT_LIMIT, power: a.loadOhms > HEADPHONE_MAX_OHMS || power <= LOAD_POWER_LIMIT });
		}
		return result;
	}

	/* the comparisons */
	const rel = (x, y, tol) => x === y || Math.abs(x - y) <= tol * Math.max(Math.abs(x), Math.abs(y));
	/** [name, got, want] rows that differ: numbers past tol relative, anything else not the same. */
	const differ = (rows, tol) => rows.filter(([, got, want]) => !(typeof got === 'number' && typeof want === 'number' ? rel(got, want, tol) : JSON.stringify(got) === JSON.stringify(want))).map(([k, got, want]) => `${k} ${JSON.stringify(got)} against ${JSON.stringify(want)}`);
	/** Two part sets value for value, exactly or within tol (the page's parts as the file writes them). */
	const partsDiffer = (got, want, tol = 0) => {
		if (!got || !want) return [`parts ${JSON.stringify(got)} against ${JSON.stringify(want)}`];
		const same = (x, y) => (x === null || y === null ? x === y : tol ? Math.abs(x - y) <= tol * Math.abs(y) : x === y);
		const out = JSON.stringify(Object.keys(got)) === JSON.stringify(Object.keys(want)) ? [] : [`names ${Object.keys(got)} against ${Object.keys(want)}`];
		for (const [k, v] of Object.entries(want)) {
			const g = got[k];
			if (Array.isArray(v) ? !(Array.isArray(g) && g.length === v.length && v.every((x, i) => same(g[i], x))) : !same(g, v)) out.push(`${k} ${JSON.stringify(g)} against ${JSON.stringify(v)}`);
		}
		return out;
	};
	/** The pairs of a parts block of the file ("Rbias": 56e3 + 8.2e3), by name. */
	const pairsWritten = (text) => Object.fromEntries([...text.matchAll(/"(\w+)": ([\d.e+-]+) \+ ([\d.e+-]+)/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]));
	/** The pairs the page builds among parts, by name, as the stock's two parts. */
	const pairsOf = (parts, stock) => Object.fromEntries(stock.pairs ? Object.entries(parts).flatMap(([k, v]) => (/^R/.test(k) && typeof v === 'number' && seriesPair(v, stock.resistors) ? [[k, seriesPair(v, stock.resistors)]] : [])) : []);
	const samePairs = (got, want) => JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(want).sort()) && Object.keys(want).every((k) => want[k].every((v, i) => Math.abs(got[k][i] - v) <= 1e-12 * v));
	/** A file's page_parts block, and the comment above it. */
	const pageBlock = (code) => {
		const at = code.indexOf('\npage_parts = {');
		return { block: code.slice(at, code.indexOf('\n\n', at + 1)), said: code.slice(code.lastIndexOf('\n\n', at) + 2, at) };
	};

	/** The page's note on its limit above its parts, its words as the page has them (the comment joined), or none at all. */
	const noteProblems = (code, limitNote) => {
		const { said } = pageBlock(code);
		const flat = said.replace(/\n# /g, ' ');
		if (!limitNote) return /What the page says of its limit/.test(code) ? ['a note with no limit'] : [];
		return flat.startsWith(`# What the page says of its limit: ${limitNote}`) ? [] : [`no note "${limitNote.slice(0, 60)}"`];
	};

	/* the text and the run */
	const YOU = /\b(you|your|yours|yourself)\b/i;
	const PLACEHOLDER = /\bundefined\b|\bNaN\b|\bnull\b|\bInfinity\b|\[object/;
	const COURSE = /\b(course|courses|cours|school|professors?|prof|slides?|diapos?|labs?|lectures?|ELE\s?2003|polytechnique|experiments?|moodle|homework|assignments?|teachers?|instructors?)\b/i;
	const IMPORTS = new Set(['math', 'cmath', 'itertools', 'matplotlib.pyplot']);
	const textProblems = (code) => {
		const out = [];
		code.split('\n').forEach((line, i) => {
			if (line.length > 100) out.push(`line ${i + 1} has ${line.length} characters`);
			if (/\t/.test(line)) out.push(`line ${i + 1} has a tab`);
			if (/\s$/.test(line)) out.push(`line ${i + 1} ends in a space`);
		});
		if (/[–—]/.test(code)) out.push('an en or em dash');
		// (the stock named "Lab kit" may be named, and the lab kit's resistors)
		const prose = code.replace(/\blab kit('s)?\b|\blab resistors\b/gi, '');
		for (const [name, re] of [['you/your', YOU], ['a placeholder', PLACEHOLDER], ['a course word', COURSE]]) {
			const m = re.exec(prose);
			if (m) out.push(`${name}: "${prose.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')}"`);
		}
		return out;
	};

	// one tally per file and property: the designs it was checked on, and what broke it
	const tally = new Map();
	const note = (file, property, problems) => {
		const key = `${file}: ${property}`;
		const t = tally.get(key) ?? tally.set(key, { designs: 0, problems: [] }).get(key);
		t.designs++;
		for (const p of problems) t.problems.push(p);
	};
	const covered = new Map();
	const cover = (dimension, value) => (covered.get(dimension) ?? covered.set(dimension, new Set()).get(dimension)).add(value);
	const lengths = {};

	/** What every file goes through: the text, the run (with matplotlib on Agg where asked), the results read back. */
	function common(file, label, code, { plot = false } = {}) {
		const shape = inspect(code);
		note(file, 'ASCII, parses for Python 3.8, no library API newer, the standard library only, no function defined twice', shape.ascii && shape.parse38 === null && shape.newer.length === 0 && shape.imports.every((mod) => IMPORTS.has(mod)) && shape.twice.length === 0 ? [] : [`${label}: ${[shape.parse38, shape.newer.join(' '), shape.imports.join(' '), shape.twice.join(' ')].filter(Boolean).join('; ')}`]);
		note(file, 'lines of 100 characters, no tab, no dash but the hyphen, no "you", no placeholder, no course word', textProblems(code).map((p) => `${label}: ${p}`));
		const run = runFile(code);
		const wide = run.stdout.split(/\r?\n/).filter((l) => l.length > 92);
		note(file, 'runs with python -W error, matplotlib hidden, its printout in lines of 92 characters', run.status === 0 && run.stderr === '' && wide.length === 0 ? [] : [`${label}: ${run.stderr.slice(-300) || wide[0]}`]);
		if (plot) {
			const drawn = runFile(code, { matplotlib: true });
			note(file, 'runs with matplotlib on the Agg backend', drawn.status === 0 && drawn.stderr === '' ? [] : [`${label}: ${drawn.stderr.slice(-300)}`]);
		}
		const read = readResults(code, ['resistors', 'capacitors']);
		note(file, 'every result read back through runpy', read.stop === null && read.missing.length === 0 ? [] : [`${label}: ${read.stop ?? read.missing.join(', ')}`]);
		return { read, r: read.results, stdout: run.stdout, lines: code.split('\n').length - 1 };
	}

	/** The file's advice (what the page says of each check missed): an entry for every check, the text of each one missed printed once. */
	const adviceProblems = (code, stdout, r) => {
		const at = code.indexOf('\nadvice = {');
		if (at < 0) return ['no advice'];
		const entries = Object.fromEntries([...code.slice(at, code.indexOf('\n}', at)).matchAll(/\n {4}"([^"]+)": "([^"]+)",/g)].map((m) => [m[1], m[2]]));
		const sets = [r.own_check, r.page_check].filter(Boolean);
		const out = Object.keys(sets[0].checks).filter((key) => !entries[key]).map((key) => `no advice on ${key}`);
		for (const [key, text] of Object.entries(entries)) {
			const times = stdout.split(`  ${text}`).length - 1;
			if (times !== (sets.some((chk) => chk.misses.includes(key)) ? 1 : 0)) out.push(`${key} printed ${times} times`);
		}
		return out;
	};

	/** Each edit of a setting stops the file with its message. */
	function guards(file, label, code, list) {
		const problems = [];
		for (const [setting, value, message] of list) {
			const edited = readResults(editSetting(code, setting, value));
			if (!(edited.stop !== null && message.test(edited.stop))) problems.push(`${label}: ${setting} = ${value}: ${edited.stop ?? 'it ran on'}`);
		}
		note(file, 'editing a setting it rests on stops it with its message', problems);
	}

	/** The file's stock against the page's, value for value. */
	const stockProblems = (r, stock, kind) => {
		const out = [];
		if (JSON.stringify(r.resistors) !== JSON.stringify(Array.isArray(stock.resistors) ? stock.resistors : resistorValues(stock.resistors, 0, 7))) out.push('resistors');
		const caps = stock.capacitors ?? (kind === 'usual' ? USUAL_CAPACITORS : kind === 'e12' ? seriesValues(SERIES.E12, -12, -6) : capacitorCandidates(null));
		if (JSON.stringify(r.capacitors) !== JSON.stringify(caps)) out.push('capacitors');
		return out;
	};

	const JFET = 'jfet-am-modulator.py';
	const DIODE = 'diode-tank-am-modulator.py';
	const DEMOD = 'am-demodulator.py';

	/** One JFET design of the page: its file, every check of it; returns what the later checks read. */
	function jfetCase(label, inputs, opts = {}) {
		const pg = jfetPage(inputs);
		if (!opts.sweep) note(JFET, 'the page designs every case of the matrix', pg.design ? [] : [label]);
		if (!pg.design) return null;
		const a = pg.args;
		const code = generateJfetPython(a);
		const run = common(JFET, label, code, opts);
		if (opts.default) lengths.jfet = run.lines;
		if (run.read.stop !== null) return null;
		const { r } = run;
		const m = pg.model;
		const d = pg.design;
		const sm = d.conditioning.summer;
		const rows = [['vp', r.vp, m.vp], ['beta', r.beta, m.beta], ['vc', r.vc, m.vc], ['half_range', r.half_range, m.halfRange], ['swing', r.swing, d.swingTarget], ['depth', r.depth, conductanceDepth(m, a.swingFraction)], ['gain_target', r.gain_target, sm.gainTarget], ['bias_target', r.bias_target, sm.biasTarget]];
		if (m.fit) for (const [k, key] of [['a', 'a'], ['b', 'b'], ['r2', 'r2'], ['max_dev', 'maxDev'], ['max_dev_at', 'maxDevAt'], ['count', 'count'], ['low', 'low'], ['high', 'high']]) rows.push([`fit ${k}`, r.fit?.[k], m.fit[key]]);
		note(JFET, "the JFET's line, the window and the gate drive's targets are the page's (1e-12)", differ(rows, 1e-12).map((x) => `${label}: ${x}`));
		note(JFET, "its stock is the page's, value for value", stockProblems(r, a.stock, 'usual').map((x) => `${label}: ${x}`));
		note(JFET, "the page's parts, as the page shows them", partsDiffer(r.page_parts, a.page, 1e-12).map((x) => `${label}: ${x}`));
		note(JFET, "the page's note on its limit of pairs, when it has one, above its parts", noteProblems(code, a.limitNote).map((x) => `${label}: ${x}`));
		const { block, said } = pageBlock(code);
		const written = pairsWritten(block);
		const want = pairsOf(a.page, a.stock);
		note(JFET, "each resistor the page builds of two in series written as the stock's two parts and named, no other, within the page's limit", [...(samePairs(written, want) ? [] : [`${label}: ${JSON.stringify(written)} against ${JSON.stringify(want)}`]), ...Object.keys(want).filter((k) => !said.includes(k)).map((k) => `${label}: ${k} not named`), ...(a.stock.pairLimit !== null && Object.keys(written).length > a.stock.pairLimit ? [`${label}: ${Object.keys(written).length} pairs`] : [])]);
		// the page's parts through the file's steps, against the page's own design
		const pc = r.page_check;
		const c = d.carrier;
		const o = d.opamp;
		const pageRows = [
			['gain', pc.gain, sm.gainActual], ['bias', pc.bias, sm.biasActual], ['depth', pc.depth, d.gDepth], ['fc', pc.fc, sm.fcActual], ['x', pc.x, d.x], ['n', pc.n, d.modulationIndex], ['k0', pc.k0, d.nominalGain], ['k_min', pc.k_min, d.gainMin], ['k_max', pc.k_max, d.gainMax], ['r_min', pc.r_min, d.r1Min],
			['limit', pc.limit, c.acMax], ['ac', pc.ac, c.ac], ['out', pc.out, c.carrierOut], ['env_max', pc.env_max, c.envelopeMax], ['env_min', pc.env_min, c.envelopeMin], ['current', pc.current, c.jfetPeakCurrent], ['tone_2fp', pc.tone_2fp, c.tone2fp],
			...['kTrough', 'kNominal', 'kCrest'].map((k, i) => [k, pc.noise[i], o[k]]), ...['factorTrough', 'factorNominal', 'factorCrest'].map((k, i) => [k, pc.kept[i], o[k]]),
			['n_eff', pc.n_eff, o.effectiveModulationIndex], ['n_peaks', pc.n_peaks, o.peakModulationIndex], ['thd', pc.thd, o.thd], ['gbw_ratio', pc.gbw_ratio, o.gbwRatio], ['slew', pc.slew, o.slewNeeded], ['opamps', pc.opamps, o.opampCount],
			['gate swing', pc.checks['gate swing'], sm.headroomOk], ['corner', pc.checks.corner, sm.fcOk], ['gbw rule', pc.checks['gbw rule'], o.gbwOk], ['slew ok', pc.checks.slew, o.slewOk], ['current ok', pc.checks.current, c.jfetPeakCurrent <= 0.01], ['carrier ok', pc.checks.carrier, c.ac <= c.acMax * (1 + 1e-9)]
		];
		if (a.topology === 'inverting' || a.outputStage) {
			const pgn = d.postGain;
			pageRows.push(['stage k', pc.stage.k, pgn.kActual], ['stage kept', pc.stage.kept, pgn.factor], ['stage out', pc.stage.out, pgn.outputAmplitude], ['stage peak', pc.stage.peak, pgn.envelopeMax]);
			if (pgn.needed) pageRows.push(['stage swing ok', pc.checks['stage swing'], pgn.swingOk], ['stage slew ok', pc.checks['stage slew'], pgn.slewOk]);
		}
		note(JFET, "the page's parts' check equals the page's own design (1e-10)", differ(pageRows, 1e-10).map((x) => `${label}: ${x}`));
		// the file's own parts: its rule in JavaScript from its stock, and their check against the same steps in JavaScript,
		// those steps first shown equal to the library's design on the page's parts
		const steps = jfetSteps(a, m);
		const onPage = steps.evaluate(a.page);
		note(JFET, "the file's steps in JavaScript, on the page's parts, equal the library's design (1e-12)", differ([['n', onPage.n, d.modulationIndex], ['out', onPage.out, c.carrierOut], ['n_eff', onPage.n_eff, o.effectiveModulationIndex], ['thd', onPage.thd, o.thd], ['gbw_ratio', onPage.gbw_ratio, o.gbwRatio], ['opamps', onPage.opamps, o.opampCount], ['stage out', onPage.stage.out, d.postGain?.outputAmplitude ?? c.carrierOut]], 1e-12).map((x) => `${label}: ${x}`));
		const own = jfetRule(a, m, r.resistors, r.capacitors);
		note(JFET, "the file's own parts follow its rule (the rule written again in JavaScript)", partsDiffer(r.own_parts, own).map((x) => `${label}: ${x}`));
		note(JFET, "the file's own parts are from its stock", Object.entries(r.own_parts).every(([k, v]) => (k === 'C' ? r.capacitors.includes(v) : (k === 'Rdt' && v === 0) || r.resistors.includes(v))) ? [] : [`${label}: ${JSON.stringify(r.own_parts)}`]);
		const js = steps.evaluate(r.own_parts);
		const oc = r.own_check;
		const ownRows = ['gain', 'bias', 'depth', 'fc', 'x', 'n', 'k0', 'k_min', 'k_max', 'r_min', 'limit', 'ac', 'out', 'env_max', 'env_min', 'current', 'tone_2fp', 'n_eff', 'n_peaks', 'thd', 'gbw_ratio', 'slew', 'opamps'].map((k) => [k, oc[k], js[k]]);
		ownRows.push(...[0, 1, 2].map((i) => [`noise ${i}`, oc.noise[i], js.noise[i]]));
		if (oc.stage) ownRows.push(...['k', 'kept', 'out', 'peak'].map((k) => [`stage ${k}`, oc.stage[k], js.stage[k]]));
		note(JFET, "the file's own parts' check equals the same steps in JavaScript (1e-12)", differ(ownRows, 1e-12).map((x) => `${label}: ${x}`));
		{
			// (the page shows its own design's count, the oscillator in it when its Wien bridge gives the carrier)
			const want = `${r.own_check.opamps + (a.wien ? 1 : 0)} op-amps in the modulator (the gate-drive summer${a.wien ? ' and the Wien oscillator' : ''} included)`;
			const page = o.opampCount + (pg.oscillator && works(pg.oscillator) ? 1 : 0);
			note(JFET, "the op-amps it counts are the page's, the gate-drive summer and the Wien oscillator in them", run.stdout.includes(want) && (r.own_check.opamps !== r.page_check.opamps || run.stdout.includes(`${page} op-amps`)) ? [] : [`${label}: ${want} against the page's ${page}`]);
		}
		note(JFET, 'each check a set misses is followed by what the page says of it, once', adviceProblems(code, run.stdout, r).map((x) => `${label}: ${x}`));
		if (opts.guards) guards(JFET, label, code, opts.guards);
		const rows4 = a.mode === 'measured' ? a.text.split('\n').map((l) => l.trim().split(/[\s,;]+/).length) : [];
		cover('jfet mode', a.mode === 'measured' ? `measured ${rows4.every((k) => k >= 4) ? 'divider' : rows4.every((k) => k === 2) ? 'direct' : 'mixed'}` : a.mode);
		cover('jfet topology', a.topology);
		cover('jfet output stage', a.topology === 'inverting' || a.outputStage ? (a.page.Rtop ? 'a stage' : 'no stage needed') : 'none');
		if (a.topology === 'inverting') cover('jfet follower', a.carrierBuffer === false ? 'without' : 'with');
		cover('jfet carrier', a.wien ? (pg.oscillator?.stockShortfall ? 'Wien on E24' : 'Wien') : 'generator');
		cover('jfet stock', a.stock.kind);
		if (a.stock.pairs) cover('jfet pairs', `${a.stock.pairLimit === null ? 'pairs' : 'a pair limit'} on ${a.stock.kind}`);
		if (a.page.Rdt === 0) cover('jfet divider', 'none');
		return { pg, a, code, r, stdout: run.stdout };
	}

	/** One diode design of the page. */
	function diodeCase(label, inputs, opts = {}) {
		const pg = diodePage(inputs);
		if (!opts.sweep) note(DIODE, 'the page designs every case of the matrix', pg.design ? [] : [label]);
		if (!pg.design) return null;
		const a = pg.args;
		const code = generateDiodePython(a);
		const run = common(DIODE, label, code, opts);
		if (opts.default) lengths.diode = run.lines;
		if (run.read.stop !== null) return null;
		const { r } = run;
		const d = pg.design;
		note(DIODE, "the tank, its band and R_b are the page's (1e-12), the bias with the least distortion too (1e-9)", [...differ([['c_target', r.c_target, d.cTarget], ['tank_c', r.tank_c, d.capacitors], ['f0', r.f0, d.f0Actual], ['band_needed', r.band_needed, d.bandwidthNeeded], ['r_eff', r.r_eff, d.rEffTarget], ['rs', r.rs, d.rs], ['rt', r.rt, d.rt], ['rb', r.rb, d.summer.rb]], 1e-12), ...differ([['vb_best', r.vb_best, d.summer.vbBest]], 1e-9)].map((x) => `${label}: ${x}`));
		note(DIODE, "its stock is the page's, value for value", stockProblems(r, a.stock, 'e12').map((x) => `${label}: ${x}`));
		note(DIODE, "the page's parts, as the page shows them", partsDiffer(r.page_parts, a.page, 1e-12).map((x) => `${label}: ${x}`));
		note(DIODE, "the page's note on its limit of pairs, when it has one, above its parts", noteProblems(code, a.limitNote).map((x) => `${label}: ${x}`));
		const { block, said } = pageBlock(code);
		const written = pairsWritten(block);
		const want = a.shortfall ? {} : pairsOf(a.page, a.stock);
		note(DIODE, "each resistor the page builds of two in series written as the stock's two parts and named, no other, within the page's limit", [...(samePairs(written, want) ? [] : [`${label}: ${JSON.stringify(written)} against ${JSON.stringify(want)}`]), ...Object.keys(want).filter((k) => !said.includes(k)).map((k) => `${label}: ${k} not named`), ...(a.stock.pairLimit !== null && Object.keys(written).length > a.stock.pairLimit ? [`${label}: ${Object.keys(written).length} pairs`] : [])]);
		const pc = r.page_check;
		const pageRows = [
			['n', pc.n, d.modulationIndex], ['mean', pc.mean, d.carrierOut], ['thd', pc.thd, d.thd], ['max', pc.max, d.envelopeMax], ['min', pc.min, d.envelopeMin], ['peak', pc.peak, d.peakCurrent], ['r_source', pc.r_source, d.rSource], ['r_loaded', pc.r_loaded, d.rEff], ['bw', pc.bw, d.bwLoaded], ['q', pc.q, d.qLoaded],
			['sideband', pc.sideband, d.sidebandGain], ['index_fm', pc.index_fm, d.indexAtFmMax], ['thd_fm', pc.thd_fm, d.thdAtFmMax], ['peak_out', pc.peak_out, d.summer.peak], ['current', pc.current, d.summerCurrent], ['leak', pc.leak, d.messageLeak], ['noise', pc.noise, d.summer.noiseGain], ['ideal_n', pc.ideal_n, d.idealIndex], ['ideal_out', pc.ideal_out, d.idealCarrier],
			['index ok', pc.checks.index, d.indexOk], ['tune', pc.checks.tune, d.tuneOk], ['range', pc.checks.range, d.rangeOk], ['diode C', pc.checks['diode C'], d.cjOk], ['sidebands', pc.checks.sidebands, d.sidebandsInBand], ['current ok', pc.checks.current, d.currentOk], ['leak ok', pc.checks.leak, d.leakOk], ['summer swing', pc.checks['summer swing'], d.summer.swingOk], ['gbw rule', pc.checks['gbw rule'], d.summer.gbwOk], ['slope', pc.checks.slope, d.sidebandGain >= 0.9]
		];
		note(DIODE, "the page's parts' check equals the page's own design (1e-7, the cycle solve's)", differ(pageRows, 1e-7).map((x) => `${label}: ${x}`));
		const onPage = diodeEval(a, a.page);
		note(DIODE, "the evaluation in JavaScript (the library's solvers), on the page's parts, is the library's design (1e-12)", differ([['n', onPage.n, d.modulationIndex], ['mean', onPage.mean, d.carrierOut], ['thd', onPage.thd, d.thd], ['r_source', onPage.r_source, d.rSource], ['thd_fm', onPage.thd_fm, d.thdAtFmMax], ['leak', onPage.leak, d.messageLeak]], 1e-12).map((x) => `${label}: ${x}`));
		const rule = diodeRule(a, r, r.resistors);
		note(DIODE, "the message drive for the index is the library's (1e-9)", rule.umWanted !== null && rel(r.um_wanted, rule.umWanted, 1e-9) ? [] : [`${label}: ${r.um_wanted} against ${rule.umWanted}`]);
		note(DIODE, "the file's own parts follow its rule (the rule written again in JavaScript)", partsDiffer(r.own_parts, rule.parts).map((x) => `${label}: ${x}`));
		note(DIODE, "the file's own parts are from its stock", Object.entries(r.own_parts).every(([k, v]) => (k === 'C' ? v.every((x) => r.capacitors.includes(x)) : v === null || r.resistors.includes(v))) ? [] : [`${label}: ${JSON.stringify(r.own_parts)}`]);
		const js = diodeEval(a, r.own_parts);
		note(DIODE, "the file's own parts' check equals the library's evaluation of them (1e-7)", differ(Object.keys(js).map((k) => [k, r.own_check[k], js[k]]), 1e-7).map((x) => `${label}: ${x}`));
		note(DIODE, 'each check a set misses is followed by what the page says of it, once', adviceProblems(code, run.stdout, r).map((x) => `${label}: ${x}`));
		if (opts.guards) guards(DIODE, label, code, opts.guards);
		cover('diode', a.diode);
		cover('diode stock', a.shortfall ? 'E24 fallback' : a.stock.kind);
		if (a.stock.pairs) cover('diode pairs', `${a.stock.pairLimit === null ? 'pairs' : 'a pair limit'} on ${a.stock.kind}`);
		cover('diode bias', a.page.Rb ? 'R_b' : 'no R_b');
		return { pg, a, code, r, stdout: run.stdout };
	}

	/** One demodulator design of the page. */
	function demodCase(label, inputs, opts = {}) {
		const pg = demodPage(inputs);
		if (!opts.sweep) note(DEMOD, 'the page designs every case of the matrix', pg.envelope ? [] : [label]);
		if (!pg.envelope) return null;
		const a = pg.args;
		const code = generateDemodPython(a);
		const run = common(DEMOD, label, code, opts);
		if (opts.default) lengths.demod = run.lines;
		if (run.read.stop !== null) return null;
		const { r } = run;
		const e = pg.envelope;
		const rows = [['k', r.k, e.k], ['fs', r.fs, e.fs], ['n_exact', r.n_exact, e.minOrder], ['n', r.n, e.n], ['stage count', r.stages.length, e.stages.length], ...e.stages.flatMap((st, i) => [[`stage ${i + 1} w0`, r.stages[i]?.w0, st.wn], [`stage ${i + 1} q`, r.stages[i]?.q, st.q]])];
		note(DEMOD, "the template, the order and the stage targets are the page's (1e-12)", differ(rows, 1e-12).map((x) => `${label}: ${x}`));
		note(DEMOD, "its stock is the page's, value for value", stockProblems(r, a.stock, 'e6').map((x) => `${label}: ${x}`));
		note(DEMOD, "the page's parts, as the page shows them", [...partsDiffer({ R: r.page_parts.R, Cout: r.page_parts.Cout ?? null }, { R: a.page.R, Cout: a.page.Cout }, 1e-12), ...(r.page_parts.stages.length === a.page.stages.length ? [] : ['the stages']), ...a.page.stages.flatMap((st, i) => partsDiffer(r.page_parts.stages[i], st.parts, 1e-12).map((x) => `stage ${i + 1} ${x}`))].map((x) => `${label}: ${x}`));
		note(DEMOD, "the page's note on its limit of pairs, when it has one, above its parts", noteProblems(code, a.limitNote).map((x) => `${label}: ${x}`));
		{
			// stage by stage: the page's pairs written as two parts and said above the stage, none on a stage it builds from E24
			const { block } = pageBlock(code);
			const parts = block.split(/\n {4}(?=\{)/).slice(1);
			const problems = [];
			let count = 0;
			a.page.stages.forEach((st, i) => {
				const written = pairsWritten(parts[i] ?? '');
				const want = st.shortfall ? {} : pairsOf(st.parts, a.stock);
				count += Object.keys(written).length;
				if (!samePairs(written, want)) problems.push(`stage ${i + 1}: ${JSON.stringify(written)} against ${JSON.stringify(want)}`);
				if (Object.keys(want).length && !block.includes(`# stage ${i + 1}: ${Object.keys(want).length > 1 ? '' : Object.keys(want)[0]}`)) problems.push(`stage ${i + 1}: its pairs not said`);
				if (st.shortfall && !block.includes(`# stage ${i + 1}: the parts on hand cannot build it`)) problems.push(`stage ${i + 1}: its fallback not said`);
			});
			if (a.stock.pairLimit !== null && count > a.stock.pairLimit) problems.push(`${count} pairs`);
			note(DEMOD, "each resistor the page builds of two in series written as the stock's two parts and said, stage by stage, no other, within the page's limit", problems.map((x) => `${label}: ${x}`));
		}
		const pc = r.page_check;
		const tol = a.rectifierType === 'half' ? 1e-9 : 1e-10;
		const pageRows = [['span', pc.span, pg.verdict.span], ['at_fs', pc.at_fs, pg.verdict.atSideband], ['sharpest q', Math.max(...pc.figures.map((f) => f.q)), pg.verdict.maxQ], ['mean', pc.mean, pg.out.mean], ['tone', pc.tone, pg.out.tone], ['needed', pc.needed, pg.swing.needed], ['passband ok', pc.checks.passband, pg.verdict.spanOk], ['stopband ok', pc.checks.stopband, pg.verdict.stopOk], ['sharpest Q ok', pc.checks['sharpest Q'], pg.verdict.maxQ <= 4], ['swing ok', pc.checks.swing, pg.swing.ok]];
		if (a.rectifierType === 'half') pageRows.push(['ideal', pc.ideal, pg.out.ideal.tone]);
		if (pg.coupling) pageRows.push(['fc', pc.fc, pg.coupling.fc], ['band_span', pc.band_span, pg.band.span], ['tone_load', pc.tone_load, pg.coupling.toneAtLoad], ['current', pc.current, pg.coupling.peakCurrent], ['power', pc.power, pg.coupling.power], ['band ok', pc.checks.band, pg.band.ok], ['current ok', pc.checks.current, pg.coupling.currentOk], ['power ok', pc.checks.power, pg.coupling.powerOk]);
		note(DEMOD, "the page's parts' check equals the page's own (1e-10, the bare diode's 1e-9)", differ(pageRows, tol).map((x) => `${label}: ${x}`));
		const own = demodRule(a, r.stages, r.resistors, r.capacitors, code.includes('Q falls short'));
		if (own === null) {
			note(DEMOD, "a stage no pair of the stock builds leaves no parts of its own, the page's checked alone", r.own_parts === null && r.own_check === null && /no pair of the stock builds it/.test(run.stdout) ? [] : [`${label}: ${JSON.stringify(r.own_parts)}`]);
			cover('demod own', 'none');
		} else {
			note(DEMOD, "the file's own parts follow its rule (the rule written again in JavaScript)", own.flatMap((st, i) => partsDiffer(r.own_parts?.stages?.[i], st).map((x) => `${label}: stage ${i + 1} ${x}`)));
			note(DEMOD, "the file's own parts are from its stock (the rectifier's and C_out the page's way)", r.own_parts.stages.every((st) => Object.entries(st).every(([k, v]) => (k[0] === 'R' ? r.resistors.includes(v) : r.capacitors.includes(v)))) && r.own_parts.R === a.page.R && (r.own_parts.Cout ?? null) === a.page.Cout ? [] : [`${label}: ${JSON.stringify(r.own_parts)}`]);
			const js = demodEval(a, r.own_parts);
			const ownRows = ['span', 'at_fs', 'mean', 'tone', 'needed', ...(a.rectifierType === 'half' ? ['ideal'] : []), ...(a.outputCoupling ? ['fc', 'band_span', 'tone_load', 'current', 'power'] : [])].map((k) => [k, r.own_check[k], js[k]]);
			ownRows.push(['checks', r.own_check.checks, js.checks]);
			ownRows.push(...js.figures.flatMap((f, i) => [[`stage ${i + 1} w0`, r.own_check.figures[i].w0, f.w0], [`stage ${i + 1} q`, r.own_check.figures[i].q, f.q]]));
			note(DEMOD, "the file's own parts' check equals the library's evaluation of them (1e-10, the bare diode's 1e-9)", differ(ownRows, tol).map((x) => `${label}: ${x}`));
			cover('demod own', 'parts');
		}
		note(DEMOD, 'each check a set misses is followed by what the page says of it, once', adviceProblems(code, run.stdout, r).map((x) => `${label}: ${x}`));
		if (opts.guards) guards(DEMOD, label, code, opts.guards);
		cover('demod rectifier', a.rectifierType);
		cover('demod response', a.response);
		cover('demod topology', a.topology);
		cover('demod order', a.order === null ? 'minimum' : 'set');
		cover('demod coupling', a.outputCoupling ? 'on' : 'off');
		cover('demod stock', a.stock.kind);
		if (a.stock.pairs) cover('demod pairs', `${a.stock.pairLimit === null ? 'pairs' : 'a pair limit'} on ${a.stock.kind}`);
		if (a.page.stages.some((st) => st.shortfall)) cover('demod fallback', 'a stage from E24 and E6');
		if (code.includes('Q falls short')) cover('demod fallback', 'Sallen-Key pairs short of 4 Q^2');
		if (a.outputCoupling && a.stock.capacitors && !a.stock.capacitors.some((v) => v >= pg.coupling.cTarget * (1 - 1e-9))) cover('demod fallback', 'C_out from E6');
		return { pg, a, code, r, stdout: run.stdout };
	}

	/* the matrix */
	const custom = (r, c) => ({ stock: 'custom', resistorText: r, capacitorText: c });
	const labList = LAB_KIT.resistors.join(' ');
	const kitCaps = '10p 20p 30p 47p 56p 68p 100p 220p 330p 680p 1n 4.7n 10n 47n 100n 10u';
	// a list on hand that builds every circuit, some of its resistors only as pairs
	const onHand = '1k 2.2k 3.3k 4.7k 5.6k 6.8k 8.2k 10k 15k 22k 33k 47k 68k 100k 220k 470k 1M';
	const onHandCaps = '470p 820p 1n 2.2n 4.7n 10n 15n 22n 47n 100n';
	// the bench: the measured line, the window -7 V to 0 V, the lab kit with a 10 uF capacitor, a 0.6 V generator
	const BENCH = { windowLow: -7, targetN: 0.7, carrierFrom: 'source', carrierSourceAmplitude: 0.6, ...custom(labList, kitCaps) };
	const files = {};
	files.jfet = jfetCase("the page's default", {}, { plot: true, default: true, guards: [['fp', '60000.0', /Wien bridge gives for wien_built_for/], ['gbw', '3e6', /Wien bridge gives for wien_built_for/], ['slew_rate', '13e6', /Wien bridge gives for wien_built_for/], ['opamp_swing', '12.0', /Wien bridge gives for wien_built_for/], ['target_n', '0.95', /target_n has to stay under the depth/], ['window', '(-0.6, -0.4)', /Fewer than two gate voltages/]] });
	jfetCase('inverting, the follower', { topology: 'inverting' });
	jfetCase('inverting, no follower', { topology: 'inverting', carrierBuffer: false });
	jfetCase('inverting, the cell reaches the level', { topology: 'inverting', targetOutputAmplitude: 0.3 });
	jfetCase('an output stage to 2 V', { outputStage: true, targetOutputAmplitude: 2 });
	jfetCase('V_P and I_DSS, a generator, E96', { jfetMode: 'idss', carrierFrom: 'source', stock: 'E96' }, { guards: [['vp', '1.0', /vp has to be negative/]] });
	jfetCase('J111 limits, the lab kit, pairs', { jfetMode: 'rdson', vp: -6.5, rdsOn: 30, stock: 'lab', pairs: true });
	jfetCase('a fixed V_DS, the lab resistors', { jfetMode: 'fixedvds', targetN: 0.4, stock: 'labR' });
	jfetCase('a fixed V_DS through 5 ohm, inverting', { jfetMode: 'fixedvds', seriesR: 5, targetN: 0.3, topology: 'inverting' });
	jfetCase('resistances read directly, a list on hand', { measurementText: '-3 280\n-2 140\n-1 90\n-0.5 70', windowLow: -3.5, targetN: 0.5, ...custom('1k 2.2k 4.7k 10k 22k 47k 100k 220k 470k 1M 47 100 150 220', '1u 2.2u 4.7u') });
	jfetCase('divider and direct rows mixed', { measurementText: '-3 280\n-2.0  0.2  0.0034  1000\n-1 90\n-0.5  0.2  0.0026  1000', windowLow: -3.5, targetN: 0.4 });
	jfetCase('the bench, pairs, an output stage to 2 V', { ...BENCH, pairs: true, outputStage: true, targetOutputAmplitude: 2 });
	jfetCase('the lab kit, at most 2 pairs with the Wien bridge', { stock: 'lab', pairs: true, pairLimit: 2 });
	jfetCase('the lab kit, at most 1 pair, a 5 V generator', { stock: 'lab', pairs: true, pairLimit: 1, carrierFrom: 'source', carrierSourceAmplitude: 5 });
	jfetCase('large capacitors only: the Wien bridge on E24 and E6', custom(labList, '1u 2.2u 4.7u 10u'));
	jfetCase('no divider', { carrierFrom: 'source', carrierSourceAmplitude: 0.05 });
	jfetCase('the lab resistors, pairs', { stock: 'labR', pairs: true });
	files.diode = diodeCase("the page's default", {}, { plot: true, default: true, guards: [['fp', '2000.0', /The carrier has to sit above/], ['target_n', '1.5', /target_n in \(0, 1\]/]] });
	diodeCase('BAT54, E96', { diodePart: 'BAT54', stock: 'E96' });
	diodeCase('the lab kit, pairs', { stock: 'lab', pairs: true, targetNDiode: 0.93, carrierDrive: 1.7 });
	diodeCase('the lab kit, at most 1 pair', { stock: 'lab', pairs: true, pairLimit: 1, targetNDiode: 0.93, carrierDrive: 1.7 });
	diodeCase('the lab resistors', { stock: 'labR' });
	diodeCase('a list that reaches no index: E24 and E12', custom('1k 10k 100k 1M', '1n 10n 100n'));
	diodeCase('a narrow tank', { sidebandMargin: 1.2 });
	diodeCase('a fast carrier', { fpDiode: 455000, fmMaxDiode: 5000, inductanceMh: 0.1 });
	diodeCase('a large coil', { inductanceMh: 100, sidebandMargin: 0.7 });
	diodeCase('a list on hand, pairs', { ...custom(onHand, onHandCaps), pairs: true });
	diodeCase('the lab resistors, pairs', { stock: 'labR', pairs: true });
	files.demod = demodCase("the page's default", {}, { plot: true, default: true, guards: [['amin', '0.5', /0 < amax < amin/], ['order', '10', /more than 8 poles/], ['load', '0.0', /The load has to be over 0 ohm/]] });
	demodCase('MFB, inverted', { envelopeTopology: 'mfb' });
	demodCase('half-wave, Chebyshev, MFB', { rectifierType: 'half', envelopeTopology: 'mfb', response: 'chebyshev', fpCarrierDemod: 40000 }, { plot: true });
	demodCase('half-wave, Butterworth, Sallen-Key, no load, E96', { rectifierType: 'half', outputCoupling: false, stock: 'E96' });
	demodCase('Chebyshev, the lab resistors, pairs, no load', { response: 'chebyshev', outputCoupling: false, stock: 'labR', pairs: true });
	demodCase('order 6, MFB, the lab kit, at most 4 pairs', { envelopeTopology: 'mfb', orderOverride: 6, aminDb: 60, stock: 'lab', pairs: true, pairLimit: 4 });
	demodCase('order 4, the lab kit', { orderOverride: 4, stock: 'lab' });
	demodCase('MFB on one capacitor: a stage from E24 and E6', { envelopeTopology: 'mfb', ...custom('1k 10k 100k', '10n') });
	demodCase('Sallen-Key on two close capacitors', custom('1k 2.2k 4.7k 10k 22k 47k 100k', '10n 15n'));
	demodCase('a 4 V carrier, MFB', { envelopeTopology: 'mfb', demodAmplitude: 4 });
	demodCase('a list on hand, pairs', { ...custom(onHand, onHandCaps), pairs: true });

	/* a sweep: random designs through every check above */
	{
		let seed = 20261122;
		const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
		const pick = (list) => list[Math.floor(rand() * list.length)];
		const stocks = [{ stock: 'E24' }, { stock: 'E96' }, { stock: 'labR' }, { stock: 'lab', pairs: true }, { stock: 'lab', pairs: true, pairLimit: 2 }];
		let built = 0;
		for (let i = 0; i < 10; i++) {
			const vp = -(1 + 7 * rand());
			const mode = pick(['idss', 'rdson', 'measured']);
			const inputs = { jfetMode: mode, vp, idssMa: 2 + 20 * rand(), rdsOn: 20 + 300 * rand(), topology: i % 3 === 1 ? 'inverting' : 'noninverting', outputStage: i % 2 === 0, targetOutputAmplitude: 0.5 + 2 * rand(), swingFraction: 0.5 + 0.45 * rand(), targetN: 0.3 + 0.3 * rand(), fp: 20000 + 60000 * rand(), vcc: 12 + 3 * rand(), carrierFrom: pick(['wien', 'source']), carrierSourceAmplitude: 0.3 + 2 * rand(), ...pick(stocks) };
			if (jfetCase(`sweep ${i + 1}`, inputs, { sweep: true })) built++;
		}
		for (let i = 0; i < 5; i++) {
			const fp = 20000 + 100000 * rand();
			const inputs = { fpDiode: fp, fmMaxDiode: fp / (15 + 40 * rand()), sidebandMargin: 1 + 3 * rand(), inductanceMh: pick([0.3, 1, 3]), targetNDiode: 0.5 + 0.45 * rand(), carrierDrive: 1 + 2 * rand(), diodePart: pick(['1N4148', '1N4148', 'BAT54']), ...pick(stocks.slice(0, 4)) };
			if (diodeCase(`sweep ${i + 1}`, inputs, { sweep: true })) built++;
		}
		for (let i = 0; i < 10; i++) {
			const fm = 300 + 3000 * rand();
			const inputs = { rectifierType: pick(['full', 'half']), response: pick(['butterworth', 'chebyshev']), envelopeTopology: pick(['sallenKey', 'mfb']), fmMaxDemod: fm, fpCarrierDemod: fm * (20 + 60 * rand()), amaxDb: 0.5 + rand(), aminDb: 30 + 30 * rand(), outputCoupling: i % 2 === 0, loadOhms: pick([16, 32, 10000]), fmMinDemod: fm / (5 + 10 * rand()), demodAmplitude: 0.5 + 3 * rand(), ...pick(stocks) };
			if (demodCase(`sweep ${i + 1}`, inputs, { sweep: true })) built++;
		}
		check(`python: a random sweep, ${built} of 25 random designs the page builds, each through every check of its file below`, built >= 15, `${built}`);
	}

	/* the properties the JavaScript scripts' checks held, now on the .py files */
	// (d) the scripts ran with RESISTOR_PAIRS true and printed each pair, none with it false: the files
	// write the pairs the page builds as the stock's two parts and check them as the page has them
	{
		const on = jfetCase('the bench, pairs', { ...BENCH, pairs: true });
		const off = jfetCase('the bench, single parts', BENCH);
		const dOn = diodeCase('the lab kit, pairs, the default index', { stock: 'lab', pairs: true });
		const eOn = demodCase('Chebyshev, the lab kit, pairs', { response: 'chebyshev', fpCarrierDemod: 40000, demoModIndex: 0.9, stock: 'lab', pairs: true });
		const sumOf = (o) => Object.values(pairsWritten(pageBlock(o.code).block));
		const problems = [];
		if (!on || !off || !dOn || !eOn) problems.push('a design missing');
		else {
			const { block, said } = pageBlock(on.code);
			if (!block.includes('"Rbias": 56e3 + 8.2e3')) problems.push(`written ${block.match(/"Rbias": [^,]+/)?.[0]}`);
			if (!/Rbias\b.*\btwo\s+(# )?resistors in series/s.test(said)) problems.push('R_bias not said to be two resistors');
			if (!(rel(on.r.page_check.bias, on.pg.design.conditioning.summer.biasActual, 1e-12) && Math.abs(on.r.page_check.bias + 3.505) < 0.001)) problems.push(`bias ${on.r.page_check.bias}`);
			if (!rel(on.r.page_check.n, on.pg.design.modulationIndex, 1e-12)) problems.push(`n ${on.r.page_check.n}`);
			if (!/# The page may also make a resistor of two of these in series/.test(on.code)) problems.push('the stock says nothing of pairs');
			if (sumOf(off).length || /two of these in series/.test(off.code)) problems.push('pairs with single parts');
			if (!sumOf(dOn).some((_, i) => ['Rp', 'Rm'].includes(Object.keys(pairsWritten(pageBlock(dOn.code).block))[i]))) problems.push('the diode: no R_p or R_m of two');
			if (!/"R1": [\d.e+-]+ \+ [\d.e+-]+, "R2": [\d.e+-]+ \+ /.test(pageBlock(eOn.code).block)) problems.push('the demodulator: no stage of two-part R');
		}
		check(
			'python: the bench JFET with pairs writes R_bias = 56 k + 8.2 k (the bias on -3.505 V, n the page\'s), the diode its R_p or R_m as two parts, the demodulator both R of a stage; with single parts, no pair',
			problems.length === 0,
			problems.join('; ') || `bias ${on.r.page_check.bias.toFixed(4)} V, n ${on.r.page_check.n.toFixed(4)}`
		);
	}
	// (f) the script designed the output stage with OUTPUT_STAGE true and printed it with its pairs
	{
		const st = jfetCase('the bench, pairs, an output stage to 2 V, again', { ...BENCH, pairs: true, outputStage: true, targetOutputAmplitude: 2 });
		const pg = st?.pg.design.postGain;
		check(
			'python: the output stage after the bench cell: section 6, the page\'s R_top = 2 k + 390 and the divider\'s top as pairs, its K and output the page\'s, 3 op-amps',
			Boolean(st) && /# --- 6 The output stage/.test(st.code) && pageBlock(st.code).block.includes('"Rtop": 2e3 + 390.0') && /"Rdt": [\d.e+-]+ \+ /.test(pageBlock(st.code).block) && rel(st.r.page_check.stage.k, pg.kActual, 1e-12) && rel(st.r.page_check.stage.out, pg.outputAmplitude, 1e-10) && st.r.page_check.opamps === 3 && /3 op-amps in the modulator/.test(st.stdout),
			st ? `K ${st.r.page_check.stage.k.toFixed(3)}, ${st.r.page_check.stage.out.toFixed(3)} V, ${st.r.page_check.opamps} op-amps` : 'no design'
		);
	}
	// (g) the script ran the MFB filter and printed R1 = R3, R2, C1, C2, the pairs and the negative mean
	{
		const mfb = demodCase('MFB, the lab resistors', { envelopeTopology: 'mfb', stock: 'labR' });
		const mfbPairs = demodCase('MFB, the lab resistors, pairs', { envelopeTopology: 'mfb', stock: 'labR', pairs: true });
		const sk = files.demod;
		const problems = [];
		if (!mfb || !mfbPairs || !sk) problems.push('a design missing');
		else {
			if (!pageBlock(mfb.code).block.includes('{"R1": 10e3, "R2": 10e3, "R3": 10e3, "C1": 22e-9, "C2": 4.7e-9}')) problems.push('the parts on the lab resistors');
			if (!(Math.abs(mfb.r.page_check.mean + 0.6366) < 1e-4 && /upside down, its level negative/.test(mfb.stdout))) problems.push(`the MFB mean ${mfb.r.page_check.mean}`);
			if (!(Math.abs(sk.r.page_check.mean - 0.6366) < 1e-4 && !/upside down/.test(sk.stdout))) problems.push(`the Sallen-Key mean ${sk.r.page_check.mean}`);
			const st = mfbPairs.r.page_parts.stages[0];
			if (!(st.R1 === st.R3 && /\{"R1": [\d.e+-]+ \+ [\d.e+-]+, "R2": [^,]+, "R3": [\d.e+-]+ \+ /.test(pageBlock(mfbPairs.code).block))) problems.push('with pairs, R1 = R3 not two in series');
		}
		check('python: the MFB demodulator on the lab resistors writes R1 = R3 = 10 k, R2 = 10 k, C1 = 22 nF, C2 = 4.7 nF and checks a mean of -0.6366 V, upside down; with pairs R1 = R3 of two in series; the Sallen-Key one +0.6366 V', problems.length === 0, problems.join('; ') || `${mfb.r.page_check.mean.toFixed(4)} V and ${sk.r.page_check.mean.toFixed(4)} V`);
	}
	// (g) the script sized C_out with OUTPUT_COUPLING true, said which way round and what the load draws
	{
		const on = demodCase('MFB into 32 ohm', { envelopeTopology: 'mfb' });
		const off = demodCase('MFB, no load', { envelopeTopology: 'mfb', outputCoupling: false });
		const problems = [];
		if (!on || !off) problems.push('a design missing');
		else {
			if (!(on.r.page_parts.Cout === 100e-6 && /C_out at least 97\.74 uF -> 100 uF/.test(on.stdout))) problems.push(`C_out ${on.r.page_parts.Cout}`);
			if (!/\+ plate toward the load/.test(on.stdout)) problems.push('its + plate');
			if (!(Math.abs(on.r.page_check.fc - 49.74) < 0.01)) problems.push(`the corner ${on.r.page_check.fc}`);
			if (!(/tone, current at the load, at most 10 mA/.test(on.stdout) && on.r.page_check.checks.current === false && /The current: past 10 mA a TL08x distorts/.test(on.stdout))) problems.push('the current past 10 mA');
			if (/C_out|Cout|at the load/.test(off.code)) problems.push('C_out with the output off');
		}
		check('python: with the output on, C_out = 100 uF, its + plate toward the load after one MFB stage, the corner 49.74 Hz, the current at the load past 10 mA and what to do; with it off, nothing of C_out or the load', problems.length === 0, problems.join('; ') || `C_out ${on.r.page_parts.Cout} F, corner ${on.r.page_check.fc.toFixed(2)} Hz, ${(1000 * on.r.page_check.current).toFixed(1)} mA`);
	}
	// (f) the script took the carrier asked for and printed the mean, the swing it needs and the power in the earphones
	{
		const four = demodCase('a 4 V carrier, MFB, again', { envelopeTopology: 'mfb', demodAmplitude: 4 });
		const problems = [];
		if (!four) problems.push('no design');
		else {
			if (!/\namplitude = 4\.0 /.test(four.code)) problems.push('amplitude in SETTINGS');
			if (!(Math.abs(four.r.page_check.mean + 2.5465) < 1e-4)) problems.push(`the mean ${four.r.page_check.mean}`);
			if (!(Math.abs(four.r.page_check.needed - 7.7) < 1e-9 && four.r.page_check.checks.swing)) problems.push(`the swing ${four.r.page_check.needed}`);
			if (!(/power, at most 1 mW in earphones/.test(four.stdout) && four.r.page_check.checks.power === false && /The power: earphones play loud from 1 mW/.test(four.stdout))) problems.push('the power in the earphones');
		}
		check('python: a 4 V carrier: amplitude = 4.0 in SETTINGS, a mean of -2.5465 V, 7.7 V of swing for U1A within 13.5 V, the power in the earphones past 1 mW and what to do', problems.length === 0, problems.join('; ') || `${four.r.page_check.mean.toFixed(4)} V, ${four.r.page_check.needed} V, ${(1000 * four.r.page_check.power).toFixed(1)} mW`);
	}
	// a limit on the pairs: the scripts redid the page's choice from RESISTOR_PAIR_LIMIT (and RESISTOR_PAIRS as a
	// whitelist, the modulator's share of the limit its Wien bridge leaves); the .py files take the page's parts
	// as data, so that is gone: they are held to the parts the page chose under the limit, the pairs it kept,
	// its note on what it kept and left single, and a limit past the count gives what no limit gives
	{
		const problems = [];
		const shown = [];
		const keptOf = (o) => Object.keys(pairsWritten(pageBlock(o.code).block)).sort();
		const jfetLimited = (label, inputs, n) => {
			const f = jfetCase(label, inputs);
			if (!f) {
				problems.push(`${label}: no design`);
				return null;
			}
			const kept = keptOf(f);
			const want = f.pg.section.kept.slice().sort();
			if (JSON.stringify(kept) !== JSON.stringify(want)) problems.push(`${label}: ${kept} written against ${want} kept`);
			if (kept.length + f.pg.section.carrierCount > n) problems.push(`${label}: ${kept.length} + ${f.pg.section.carrierCount} pairs`);
			if (f.pg.section.limited !== Boolean(f.a.limitNote) || noteProblems(f.code, f.a.limitNote).length) problems.push(`${label}: the note`);
			return f;
		};
		for (const n of [1, 2, 3]) {
			const f = jfetLimited(`the lab kit, at most ${n} pairs with the Wien bridge`, { stock: 'lab', pairs: true, pairLimit: n }, n);
			if (f) shown.push(`N=${n}: ${keptOf(f).join('+') || 'none'}, Wien ${f.pg.section.carrierCount}`);
		}
		// the sparse list at 80 kHz under 4 pairs: the oscillator holds Rf1 and Rf2, and the modulator does best
		// with R_bias and R_b, more than its own pairs where they help (R_b alone): the scripts' whitelist
		const sparse = jfetLimited('the sparse list at 80 kHz, at most 4 pairs', { windowLow: -7, targetN: 0.5, fp: 80000, carrierSourceAmplitude: 2, ...custom('10 22 47 100 220 470 1k 2.2k 4.7k 10k 22k 47k 100k 220k 470k 1M', kitCaps), pairs: true, pairLimit: 4 }, 4);
		if (sparse) {
			if (JSON.stringify(keptOf(sparse)) !== JSON.stringify(['Rb', 'Rbias']) || JSON.stringify(sparse.pg.section.scriptPairs) !== JSON.stringify(['Rbias', 'Rb']) || JSON.stringify(sparse.pg.section.carrierKept) !== JSON.stringify(['Rf1', 'Rf2'])) problems.push(`the sparse list: ${keptOf(sparse)}, the oscillator ${sparse.pg.section.carrierKept}`);
			shown.push(`sparse N=4: ${keptOf(sparse).join('+')}, the oscillator ${sparse.pg.section.carrierKept.join('+')}`);
		}
		const d1 = diodeCase('the lab kit, at most 1 pair, again', { stock: 'lab', pairs: true, pairLimit: 1, targetNDiode: 0.93, carrierDrive: 1.7 });
		if (!d1?.pg.limited?.limited || JSON.stringify(keptOf(d1)) !== JSON.stringify([...d1.pg.limited.kept].sort()) || !d1.a.limitNote || noteProblems(d1.code, d1.a.limitNote).length) problems.push('diode 1');
		else shown.push(`diode N=1: ${keptOf(d1).join('+')}`);
		const e4 = demodCase('order 6, MFB, at most 4 pairs, again', { envelopeTopology: 'mfb', orderOverride: 6, aminDb: 60, stock: 'lab', pairs: true, pairLimit: 4 });
		const eKept = e4 ? e4.a.page.stages.flatMap((st, k) => Object.keys(pairsOf(st.parts, e4.a.stock)).map((name) => `${name}${k + 1}`)).sort() : [];
		if (!e4?.pg.limited?.limited || JSON.stringify(eKept) !== JSON.stringify([...e4.pg.limited.kept].sort()) || eKept.length > 4 || !e4.a.limitNote || noteProblems(e4.code, e4.a.limitNote).length) problems.push(`demod 4: ${eKept}`);
		else shown.push(`demod N=4: ${eKept.join('+')}`);
		const past = jfetCase('the lab kit, at most 9 pairs', { stock: 'lab', pairs: true, pairLimit: 9 });
		const none = jfetCase('the lab kit, pairs where they help', { stock: 'lab', pairs: true });
		if (!past || !none || past.stdout !== none.stdout || JSON.stringify(past.r.page_parts) !== JSON.stringify(none.r.page_parts)) problems.push('a limit past the count prints something else than no limit');
		check(`python: under a limit on the pairs the files write the parts the page chose, the pairs it kept and no more, and its note on them (the JFET modulator with its Wien bridge at 1, 2 and 3 and on a sparse list at 4, the diode at 1, the demodulator at 4), and a limit past the count prints what no limit prints`, problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : shown.join('; '));
	}

	/* edited settings: an order the page's stages no longer fit, lists in any order */
	{
		const problems = [];
		const code = generateDemodPython(demodPage({}).args);
		for (const [setting, value] of [['order', '4'], ['amin', '80.0']]) {
			const edited = editSetting(code, setting, value);
			const run = runFile(edited);
			const read = readResults(edited);
			const r = read.results ?? {};
			if (!(run.status === 0 && run.stderr === '' && r.page_check === null && r.page_parts === null && r.own_check && r.n === 4 && /the page's parts hold the stages of its own settings, not these: left out/.test(run.stdout))) problems.push(`${setting} = ${value}: ${run.stderr.slice(-200) || `n ${r.n}, page_check ${JSON.stringify(r.page_check)?.slice(0, 40)}`}`);
		}
		check("python: the demodulator edited to another order (order = 4, or amin = 80) leaves the page's stages out with one line and checks its own, the order said as set", problems.length === 0 && /n >= [\d.]+ would do; the order set gives n = 4/.test(runFile(editSetting(code, 'order', '4')).stdout), problems.join('; '));
	}
	{
		// each file's lists reversed in SETTINGS give the same parts and checks as the page's order
		const problems = [];
		const reversed = (code) => code.replace(/\nresistors, capacitors = sorted/, '\nresistors, capacitors = resistors[::-1], capacitors[::-1]\nresistors, capacitors = sorted');
		for (const [file, code] of [[JFET, generateJfetPython(jfetPage({ stock: 'lab', pairs: true }).args)], [DIODE, generateDiodePython(diodePage({ stock: 'lab', pairs: true }).args)], [DEMOD, generateDemodPython(demodPage({ stock: 'lab', pairs: true, envelopeTopology: 'mfb' }).args)]]) {
			const a = readResults(code);
			const b = readResults(reversed(code));
			if (!/resistors\[::-1\]/.test(reversed(code))) problems.push(`${file}: no sort line`);
			else if (a.stop || b.stop || JSON.stringify(a.results.own_parts) !== JSON.stringify(b.results.own_parts) || JSON.stringify(a.results.page_check) !== JSON.stringify(b.results.page_check)) problems.push(`${file}: ${b.stop ?? 'another result'}`);
		}
		// the list as the review edited it: the lab kit's 680 ohm moved to the end, R_t still 1.5 kohm
		const lab = generateDiodePython(diodePage({ stock: 'lab', pairs: true }).args);
		const moved = lab.replace('510.0, 680.0, 1e3,', '510.0, 1e3,').replace(/(\nresistors = \[[^\]]*?),?\s*\]/, '$1, 680.0]');
		const rt = (code) => readResults(code).results?.rt;
		if (moved === lab || rt(moved) !== rt(lab) || rt(lab) !== 1500) problems.push(`the moved 680 ohm: R_t ${rt(moved)} against ${rt(lab)}`);
		check('python: the stock lists may be in any order: each file sorts them where SETTINGS ends (reversed, the same parts and checks; the review\'s moved 680 ohm, R_t still 1.5 kohm)', problems.length === 0, problems.join('; '));
	}

	/* a control: a file whose page parts are not the page's is told apart */
	{
		const pg = jfetPage({});
		const wrong = { ...pg.args, page: { ...pg.args.page, Rb: 180 } };
		const r = readResults(generateJfetPython(wrong)).results;
		const d = pg.design;
		const told = differ([['n', r.page_check.n, d.modulationIndex], ['n_eff', r.page_check.n_eff, d.opamp.effectiveModulationIndex]], 1e-10);
		check('python: a control: a file given an R_b of 180 ohm where the page shows 160 ohm is told apart by its check of the page\'s parts', told.length === 2, told.join('; ') || 'not told apart');
	}

	// every file and property, over the matrix, the sweep and the cases above
	for (const [key, t] of tally) check(`${key} (${t.designs} design${t.designs === 1 ? '' : 's'})`, t.problems.length === 0, t.problems.slice(0, 3).join('; '));

	/* the matrix covered */
	{
		const WANT = {
			'jfet mode': ['idss', 'rdson', 'measured divider', 'measured direct', 'measured mixed', 'fixedvds'],
			'jfet topology': ['noninverting', 'inverting'],
			'jfet output stage': ['none', 'a stage', 'no stage needed'],
			'jfet follower': ['with', 'without'],
			'jfet carrier': ['Wien', 'generator', 'Wien on E24'],
			'jfet stock': ['E24', 'E96', 'lab', 'labR', 'custom'],
			'jfet pairs': ['pairs on lab', 'pairs on labR', 'pairs on custom', 'a pair limit on lab', 'a pair limit on custom'],
			'jfet divider': ['none'],
			diode: ['1N4148', 'BAT54'],
			'diode stock': ['E24', 'E96', 'lab', 'labR', 'custom', 'E24 fallback'],
			'diode pairs': ['pairs on lab', 'pairs on labR', 'pairs on custom', 'a pair limit on lab'],
			'diode bias': ['R_b', 'no R_b'],
			'demod rectifier': ['full', 'half'],
			'demod response': ['butterworth', 'chebyshev'],
			'demod topology': ['sallenKey', 'mfb'],
			'demod order': ['minimum', 'set'],
			'demod coupling': ['on', 'off'],
			'demod stock': ['E24', 'E96', 'lab', 'labR', 'custom'],
			'demod pairs': ['pairs on lab', 'pairs on labR', 'pairs on custom', 'a pair limit on lab'],
			'demod fallback': ['a stage from E24 and E6', 'Sallen-Key pairs short of 4 Q^2', 'C_out from E6'],
			'demod own': ['parts', 'none']
		};
		const missing = Object.entries(WANT).flatMap(([dim, values]) => values.filter((v) => !covered.get(dim)?.has(v)).map((v) => `${dim}: ${v}`));
		check(`python: the matrix covers every option of the page (${Object.values(WANT).flat().length} values: the JFET's modes, cells, output stage, follower and carriers, the diodes, the rectifiers, responses, filter topologies, the order set, the coupling on and off, every stock, pairs and a limit, the stock fallbacks)`, missing.length === 0, missing.join(', '));
		// (the rough target 250 to 500; the diode's holds every figure its panels show and the page's word on each of its ten checks)
		check(`python: the default files are ${lengths.jfet}, ${lengths.diode} and ${lengths.demod} lines, within 250 to 500, the diode's to 520`, lengths.jfet >= 250 && lengths.jfet <= 500 && lengths.demod >= 250 && lengths.demod <= 500 && lengths.diode >= 250 && lengths.diode <= 520);
	}
	cleanup();
	console.log(`python: ${((performance.now() - started) / 1000).toFixed(0)} s`);
}

console.log(fails === 0 ? 'am checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
