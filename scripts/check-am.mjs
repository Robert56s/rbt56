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
import { explainJfetModel } from '../src/lib/modulation/explain.js';
import { fitModel, JFET_PRESETS, modelFromIdss, modelFromRdsOn, parseMeasurements } from '../src/lib/modulation/jfetModel.js';
import { channelConductance, compareTopologies, conductanceDepth, designJfetModulator } from '../src/lib/modulation/jfetModulator.js';
import { buildElements as buildModElements, generateNetlist as modNetlist, generateSchematic as modSchematic } from '../src/lib/modulation/spice.js';
import { designOscillator } from '../src/lib/oscillator/topologies.js';
import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';
import { audit } from '../src/lib/spice/geometry.js';

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
	check('design: measured window narrows the depth to swing/(VC - VP)', near(dM.gDepth, dM.vgsPeakSwing / (dM.vc - dM.vp), 1e-12) && near(dM.gDepth, 0.675, 0.02) && near(dM.modulationIndex, 0.6, 1e-9) && dM.vgsMin > dM.vp, `s = ${dM.gDepth.toFixed(4)}, VGS_min ${dM.vgsMin.toFixed(2)} > VP ${dM.vp.toFixed(2)}`);
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

console.log(fails === 0 ? 'am checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
