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

		// the comparison table and the script follow
		const rowsOn = compareTopologies({ ...bench, pairs: true, outputStage: true, targetOutputAmplitude: 2 });
		check('output stage: the comparison row gives the final output and the op-amp count', near(rowsOn[0].carrierOut, pg.outputAmplitude, 1e-12) && rowsOn[0].opampCount === 3);
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-am-stage-'));
		const file = join(dir, 'jfet-stage.js');
		writeFileSync(
			file,
			generateJfetScript({ mode: 'measured', vp: measured.vp, idss: measured.idss, rdsOn: measured.rdsOn, measurements: measured.points.map((pt) => [pt.vgs, pt.rds]), windowLow: -7, windowHigh: 0, topology: 'noninverting', targetOutputAmplitude: 2, outputStage: true, carrierBuffer: true, swingFraction: 0.9, targetModulationIndex: 0.7, rb: null, sourceAmplitude: 1, fmMin: 100, vcc: 15, fp: 50000, carrierSourceAmplitude: 0.6, carrierMargin: 0.15, opampSwing: 13.5, gbw: 4e6, slewRate: 16e6, resistorSeries: LAB_KIT.resistors, capacitors: kit, pairs: true })
		);
		let out;
		try {
			out = execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
		} catch (e) {
			out = `CRASH ${String(e.stderr || e.message).split(String.fromCharCode(10)).slice(0, 3).join(' / ')}`;
		}
		check(
			'output stage: the downloaded script designs it with OUTPUT_STAGE = true and prints the stage and the divider with their pairs',
			out.includes(`post-gain stage: K = ${pg.kActual.toFixed(2)} (Rtop ${pg.rtop} ohm (${topPair[0]} + ${topPair[1]} in series), Rbottom 1000 ohm)`) && out.includes(`carrier divider: ${on.carrier.divider.top} ohm (`) && out.includes('at or under the limit') && out.includes('op-amps in the modulator: 3'),
			out.startsWith('CRASH') ? out : out.split(String.fromCharCode(10)).find((l) => l.startsWith('post-gain stage')) ?? 'no post-gain line'
		);

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
	const { generateDemodScript } = await import('../src/lib/modulation/codegen.js');
	const { execFileSync } = await import('node:child_process');
	const { mkdtempSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
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

	// (g) the downloaded script builds the MFB filter and says the output is inverted
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-am-mfb-'));
		const run = (name, code) => {
			const file = join(dir, name);
			writeFileSync(file, code);
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return `CRASH ${String(e.stderr || e.message).split(String.fromCharCode(10)).slice(0, 3).join(' / ')}`;
			}
		};
		const script = (pairs) => generateDemodScript({ rectifierType: 'full', fpCarrier: 50000, fmMax: 1000, amaxDb: 1, aminDb: 40, order: null, response: 'butterworth', topology: 'mfb', index: 0.75, resistorSeries: LAB_KIT.resistors, capacitors: null, pairs });
		const off = run('mfb-off.js', script(false));
		const on = run('mfb-on.js', script(true));
		const sk = run('sk.js', generateDemodScript({ rectifierType: 'full', fpCarrier: 50000, fmMax: 1000, amaxDb: 1, aminDb: 40, order: null, response: 'butterworth', index: 0.75 }));
		check(
			'mfb: the downloaded script runs with FILTER_TOPOLOGY = mfb, prints R1 = R3, R2, C1, C2, the pairs, and the negative mean',
			script(false).includes('const FILTER_TOPOLOGY = "mfb";') &&
				off.includes('stage 1 (MFB, DC gain -1)') &&
				/R1 = R3 = 10000 ohm, R2 = 10000 ohm, C1 = 2\.2000e-8 F, C2 = 4\.7000e-9 F/.test(off) &&
				off.includes('output mean -0.6366 V') &&
				off.includes('upside down') &&
				/R1 = R3 = \d+ ohm \(\d+ \+ \d+ in series\)/.test(on) &&
				sk.includes('stage 1 (Sallen-Key, unity gain)') &&
				sk.includes('output mean 0.6366 V') &&
				!sk.includes('upside down'),
			[off, on, sk].find((o) => o.startsWith('CRASH')) ?? off.split(String.fromCharCode(10)).find((l) => l.includes('R1 = R3')) ?? 'no R1 = R3 line'
		);
	}

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
	const { generateDemodScript } = await import('../src/lib/modulation/codegen.js');
	const { execFileSync } = await import('node:child_process');
	const { mkdtempSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
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

	// (g) the downloaded script prints the output, and nothing of it when it is off
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-am-output-'));
		const run = (name, code) => {
			const file = join(dir, name);
			writeFileSync(file, code);
			try {
				return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
			} catch (e) {
				return `CRASH ${String(e.stderr || e.message).split(String.fromCharCode(10)).slice(0, 3).join(' / ')}`;
			}
		};
		const params = { rectifierType: 'full', fpCarrier: 50000, fmMax: 1000, amaxDb: 1, aminDb: 40, order: null, response: 'butterworth', topology: 'mfb', index: 0.75, loadOhms: 32, fmMin: 100 };
		const on = run('on.js', generateDemodScript({ ...params, outputCoupling: true }));
		const off = run('off.js', generateDemodScript({ ...params, outputCoupling: false }));
		check(
			'output: the downloaded script sizes C_out with OUTPUT_COUPLING = true, says which way round it goes and what the load draws',
			on.includes('C_out = 1.000e-4 F, an electrolytic') && on.includes('its + plate toward the load') && on.includes('corner 49.74 Hz') && on.includes('past the 10 mA') && !off.includes('C_out') && !off.startsWith('CRASH'),
			[on, off].find((o) => o.startsWith('CRASH')) ?? on.split(String.fromCharCode(10)).find((l) => l.startsWith('C_out')) ?? 'no C_out line'
		);
	}

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
	const { generateDemodScript } = await import('../src/lib/modulation/codegen.js');
	const { execFileSync } = await import('node:child_process');
	const { mkdtempSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
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

	// (f) the downloaded script takes the carrier and the swing
	{
		const dir = mkdtempSync(join(tmpdir(), 'rbt56-am-carrier-'));
		const file = join(dir, 'demod.js');
		writeFileSync(file, generateDemodScript({ rectifierType: 'full', fpCarrier: 50000, fmMax: 1000, amaxDb: 1, aminDb: 40, order: null, response: 'butterworth', topology: 'mfb', index: 0.75, amplitude: 4, opampSwing: 13.5, outputCoupling: true, loadOhms: 32, fmMin: 100 }));
		let out;
		try {
			out = execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: 'pipe' });
		} catch (e) {
			out = `CRASH ${String(e.stderr || e.message).split(String.fromCharCode(10)).slice(0, 3).join(' / ')}`;
		}
		check(
			'carrier: the script runs with CARRIER_AMPLITUDE = 4, prints the mean, the swing it needs and the power in the earphones',
			out.includes('WHAT COMES OUT (a 4 V carrier') && out.includes('output mean -2.5465 V') && out.includes('op-amp swing needed 7.700 V') && out.includes('fits') && out.includes('power in the earphones') && !out.startsWith('CRASH'),
			out.startsWith('CRASH') ? out : out.split(String.fromCharCode(10)).find((l) => l.startsWith('op-amp swing')) ?? 'no swing line'
		);
	}
}

console.log(fails === 0 ? 'am checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
