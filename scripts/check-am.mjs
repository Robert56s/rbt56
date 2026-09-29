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
// Exits non-zero on any failure.

import katex from 'katex';
import { explainCarrierPath, explainConditioningChain, explainInvertingCell, explainJfetGainCell, explainJfetPhysics, explainOpampLimits } from '../src/lib/modulation/explain.js';
import { explainJfetModel, explainJfetSourcing } from '../src/lib/modulation/explain.js';
import { fitModel, JFET_PRESETS, modelFromIdss, modelFromRdsOn, parseMeasurements } from '../src/lib/modulation/jfetModel.js';
import { channelConductance, compareTopologies, conductanceDepth, designJfetModulator } from '../src/lib/modulation/jfetModulator.js';
import { buildDemodElements, buildDiodeElements, buildElements as buildModElements, generateDemodSchematic, generateDiodeNetlist, generateDiodeSchematic, generateNetlist as modNetlist, generateSchematic as modSchematic } from '../src/lib/modulation/spice.js';
import { designDiodeMixerModulator } from '../src/lib/modulation/diodeMixerModulator.js';
import { DIODE_MODELS } from '../src/lib/modulation/diodeLaw.js';
import { designEnvelopeLowPass } from '../src/lib/modulation/envelopeFilter.js';
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

/* --------------------------------- diode + tank modulator, demodulator */
{
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
		for (const rectifierType of ['full', 'half']) {
			for (const response of ['butterworth', 'chebyshev']) {
				for (const [fp, fm, aminDb] of [
					[40000, 1000, 40],
					[55000, 3000, 60],
					[10000, 300, 30]
				]) {
					const envelope = designEnvelopeLowPass({ response, amaxDb: 1, aminDb, fp: fm, fs: rectifierType === 'full' ? 2 * fp : fp, order: null });
					const rectifier = rectifierType === 'full' ? designPrecisionRectifier() : designHalfWaveRectifier();
					const opts = { rectifierType, rectifier, envelope, fp, fm, index: 0.9 };
					drawn++;
					const asc = generateDemodSchematic(opts);
					const problems = sameAsNetlist(buildDemodElements(opts).filter((e) => e.kind !== 'LABEL'), asc);
					const issues = audit(asc);
					if (problems.length || issues.length) messy.push(`${rectifierType} ${response} ${fp}/${fm}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
				}
			}
		}
		check('demodulator export: every .asc is its .cir, drawn clean', messy.length === 0 && drawn === 12, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} designs`);
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
		for (const rectifierType of ['full', 'half']) {
			for (const response of ['butterworth', 'chebyshev']) {
				const envelope = designEnvelopeLowPass({ response, amaxDb: 1, aminDb: 40, fp: 1000, fs: rectifierType === 'full' ? 80000 : 40000, order: null });
				const opts = { rectifierType, rectifier: rectifierType === 'full' ? designPrecisionRectifier() : designHalfWaveRectifier(), envelope, fp: 40000, fm: 1000, index: 0.9 };
				exports.push([`demod ${rectifierType} ${response}`, (opamp) => generateDemodSchematic({ ...opts, opamp })]);
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
		check('real op-amps: every AM drawing wired as the ideal one, on v++ and v--, drawn clean', messy.length === 0 && drawn === 22, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
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
	const { pairLabel, seriesPair } = await import('../src/lib/modulation/eseries.js');
	const { formatOhms } = await import('../src/lib/modulation/format.js');
	const { generateDemodScript, generateDiodeScript, generateJfetScript } = await import('../src/lib/modulation/codegen.js');
	const { generateDemodNetlist } = await import('../src/lib/modulation/spice.js');
	const { execFileSync } = await import('node:child_process');
	const { mkdtempSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
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
			for (const [k, v] of Object.entries({ rac: s1.rac, rbias: s1.rbias, rb: d1.rb })) madeOf(`jfet ${ln} ${k}`, v, list);
			for (const [k, v] of Object.entries({ rf: s1.rf, r2: d1.r2, divTop: d1.carrier.divider.top, divBottom: d1.carrier.divider.bottom, rtop: d1.postGain?.rtop, rbottom: d1.postGain?.rbottom })) single(`jfet ${ln} ${k}`, v, list);
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
		check(`pairs: ${designs} random JFET designs on three lists, every part on the list or two of it, R_f and the level parts single, bias, gain and n never further off, headroom and coupling corner never lost, no design lost`, bad.length === 0 && designs > 400, bad.length ? bad.slice(0, 3).join('; ') : `n closer in ${better}, ${rescued} designs only with pairs`);

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

	// (d) the downloaded scripts run with RESISTOR_PAIRS = true, and print the pairs
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-am-pairs-'));
		const jfetScript = (pairs) =>
			generateJfetScript({ mode: 'measured', vp: measured.vp, idss: measured.idss, rdsOn: measured.rdsOn, measurements: measured.points.map((pt) => [pt.vgs, pt.rds]), windowLow: -7, windowHigh: 0, topology: 'noninverting', targetOutputAmplitude: 1, carrierBuffer: true, swingFraction: 0.9, targetModulationIndex: 0.7, rb: null, sourceAmplitude: 1, fmMin: 100, vcc: 15, fp: 50000, carrierSourceAmplitude: 0.6, carrierMargin: 0.15, opampSwing: 13.5, gbw: 4e6, slewRate: 16e6, resistorSeries: LAB_KIT.resistors, capacitors: kit, pairs, carrierNote: null });
		const diodeScript = (pairs) => generateDiodeScript({ fp: 40000, fmMax: 1000, sidebandMargin: 3, inductance: 1e-3, carrierAmplitude: 1, modAmplitude: 1, targetModulationIndex: 0.8, carrierDrive: 2, vcc: 12, opampSwing: 10.5, diode: '1N4148', resistorSeries: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors, capacitors: LAB_KIT.capacitors, pairs });
		const demodScript = (pairs) => generateDemodScript({ rectifierType: 'full', fpCarrier: 40000, fmMax: 1000, amaxDb: 1, aminDb: 40, order: null, response: 'chebyshev', index: 0.9, resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors, pairs });
		const run = (name, code) => {
			const file = join(dir, name);
			writeFileSync(file, code);
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return `CRASH ${String(e.stderr || e.message).split(String.fromCharCode(10)).slice(0, 3).join(' / ')}`;
			}
		};
		const outs = {
			jfet: [run('jfet-off.js', jfetScript(false)), run('jfet-on.js', jfetScript(true))],
			diode: [run('diode-off.js', diodeScript(false)), run('diode-on.js', diodeScript(true))],
			demod: [run('demod-off.js', demodScript(false)), run('demod-on.js', demodScript(true))]
		};
		const constOk = /\nconst RESISTOR_PAIRS = true; /.test(jfetScript(true)) && /\nconst RESISTOR_PAIRS = false; /.test(diodeScript(false));
		const crashed = Object.entries(outs).filter(([, o]) => o.some((x) => x.startsWith('CRASH')));
		const offClean = Object.values(outs).every(([off]) => !off.includes('in series'));
		const jfetOk = outs.jfet[1].includes('Rbias = 64200 ohm (56000 + 8200 in series): bias -3.505 V (target -3.500 V)') && outs.jfet[1].includes(`modulation index n = ${designJfetModulator({ ...bench, pairs: true }).modulationIndex.toFixed(3)}`);
		const dd = designDiodeMixerModulator({ fp: 40000, fmMax: 1000, resistorSeries: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors, pairs: true });
		const diodeOk = outs.diode[1].includes(`index ${dd.modulationIndex.toFixed(4)} for a slow message`) && / in series\)/.test(outs.diode[1]);
		const demodOk = /R1 = R2 = \d+ ohm \(\d+ \+ \d+ in series\)/.test(outs.demod[1]);
		check('pairs: the downloaded scripts run with RESISTOR_PAIRS = true and print each pair, and print none with it false', constOk && crashed.length === 0 && offClean && jfetOk && diodeOk && demodOk, crashed.length ? crashed.map(([k, o]) => `${k}: ${o.find((x) => x.startsWith('CRASH'))}`).join('; ') : `jfet ${jfetOk}, diode ${diodeOk}, demod ${demodOk}, off clean ${offClean}`);
	}
}

console.log(fails === 0 ? 'am checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
