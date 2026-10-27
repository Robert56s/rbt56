// Geometry audit of every generated circuit schematic.
//
// Runs the real diagram builders (src/lib/filter/circuits.js and
// src/lib/modulation/circuits.js), parses the SVG they return, and checks:
//
//   body      a wire runs through a component's drawn body (not just its pin)
//   pin       a wire passes through a pin it is not connected to
//   overlap   two wires of DIFFERENT nets lie on the same line (read as one wire)
//   crossing  two wires of different nets cross (needs a routing change)
//   dot       a real junction (3+ things meeting) has no dot, or a dot sits
//             where nothing branches
//   label     label text is drawn over a wire, a component's ink or another label
//   diagonal  a wire is neither horizontal nor vertical
//   viewbox   something is drawn outside the diagram's viewBox
//
// Usage:  node --import ./scripts/resolve-ext.mjs scripts/check-schematics.mjs
// Exits non-zero when any bug-level issue is found.

import { checkDiagram } from './lib-diagram-audit.mjs';
import * as filter from '../src/lib/filter/circuits.js';
import { buildBoctorDiagram } from '../src/lib/filter/boctorDiagram.js';
import { designBoctorNotch } from '../src/lib/filter/boctor.js';
import * as modulation from '../src/lib/modulation/circuits.js';
import { designTowThomasBandPass, designTowThomasHighPass, designTowThomasLowPass, designTowThomasNotch } from '../src/lib/filter/towThomas.js';
import { designMfbBandPass } from '../src/lib/filter/mfbBandPass.js';
import { designNarrowBand, realizeNarrow } from '../src/lib/filter/narrowBand.js';
import { buildAgcDiagram, buildClampDiagram, buildLimiterDiagram, buildOscillatorDiagram } from '../src/lib/oscillator/circuits.js';
import { designOscillator, TOPOLOGIES } from '../src/lib/oscillator/topologies.js';
import { buildTwoLevelDiagram } from '../src/lib/karnaugh/circuit.js';
import { literals } from '../src/lib/karnaugh/expression.js';
import { minimizeBoth } from '../src/lib/karnaugh/minimize.js';

/** Gate circuit for a minimized function, exactly as the Karnaugh page builds it. */
function karnaughCase(n, ones, dcs, form) {
	const names = ['A', 'B', 'C', 'D'].slice(0, n);
	const { sop, pos } = minimizeBoth(n, ones, dcs);
	const res = form === 'sop' ? sop : pos;
	const constant = form === 'sop' ? sop.constant : pos.constant === null ? null : 1 - pos.constant;
	const terms = constant !== null ? [] : res.cover.map((imp) => literals(imp, n, names, { complement: form === 'pos' }));
	return buildTwoLevelDiagram({ names, terms, form, constant });
}

// ------------------------------------------------------------------ cases

/** One stage of a narrow band-pass at 10 kHz, Q 5, gain K, built on a circuit as the page builds it. */
const narrowStage = (circuit, gain) => realizeNarrow(designNarrowBand({ f0: 10000, q: 5, gain, stages: 1 }), circuit).resonators[0];

const CASES = [
	['filter/buildMfbDiagram', () => filter.buildMfbDiagram({ R1: 11000, R2: 5600, R3: 11000, C1: 1e-8, C2: 1e-9 })],
	['filter/buildSallenKeyDiagram', () => filter.buildSallenKeyDiagram({ R1: 11000, R2: 11000, Ctop: 2.2e-8, Cbottom: 1e-8 })],
	['filter/buildMfbHpDiagram', () => filter.buildMfbHpDiagram({ C1: 1e-9, C2: 1e-9, C3: 1e-9, R1: 75000, R2: 336000 })],
	['filter/buildSallenKeyHpDiagram', () => filter.buildSallenKeyHpDiagram({ C1: 1e-8, C2: 1e-8, Rtop: 22000, Rbottom: 11000 })],
	['filter/buildFirstOrderHpDiagram', () => filter.buildFirstOrderHpDiagram({ R: 16000, C: 1e-8 }, 1.6e-4)],
	['filter/buildFirstOrderDiagram', () => filter.buildFirstOrderDiagram({ R: 16000, C: 1e-8 }, 1.6e-4)],
	['filter/buildSummingAmpDiagram', () => filter.buildSummingAmpDiagram(10000)],
	['filter/buildDifferenceAmpDiagram', () => filter.buildDifferenceAmpDiagram(10000)],
	['filter/Boctor LP', () => buildBoctorDiagram(designBoctorNotch(2 * Math.PI * 10000, 0.8, 2 * Math.PI * 20000).components)],
	['filter/Boctor HP', () => buildBoctorDiagram(designBoctorNotch(2 * Math.PI * 10000, 0.8, 2 * Math.PI * 5000, { lowSide: false }).components, { highPass: true })],
	['filter/Boctor LP pair labels', () => buildBoctorDiagram(designBoctorNotch(2 * Math.PI * 10000, 0.8, 2 * Math.PI * 20000).components, { ohms: () => '1.00M + 1.00M' })],
	['filter/Boctor HP pair labels', () => buildBoctorDiagram(designBoctorNotch(2 * Math.PI * 10000, 0.8, 2 * Math.PI * 5000, { lowSide: false }).components, { highPass: true, ohms: () => '1.00M + 1.00M' })],
	['filter/buildTowThomasDiagram', () => filter.buildTowThomasDiagram(designTowThomasLowPass(2 * Math.PI * 10000, 0.7071).components)],
	['filter/buildTowThomasHpDiagram', () => filter.buildTowThomasHpDiagram(designTowThomasHighPass(2 * Math.PI * 10000, 1.3066).components)],
	['filter/buildTowThomasNotchDiagram (low side)', () => filter.buildTowThomasNotchDiagram(designTowThomasNotch(2 * Math.PI * 10000, 1.5, 2 * Math.PI * 21000, { lowSide: true }).components)],
	['filter/buildTowThomasNotchDiagram (high side)', () => filter.buildTowThomasNotchDiagram(designTowThomasNotch(2 * Math.PI * 10000, 1.5, 2 * Math.PI * 4700, { lowSide: false }).components)],
	// the band-pass stages of a transformed design: the narrow band-pass's
	// lower stage on MFB, its centre stage on Tow-Thomas, and each with the
	// longest pair label a resistor can carry
	['filter/buildMfbBpDiagram', () => filter.buildMfbBpDiagram(designMfbBandPass(2 * Math.PI * 41047, 4.9719, { gain: 2.0314 }).components)],
	['filter/buildMfbBpDiagram pair labels', () => filter.buildMfbBpDiagram(designMfbBandPass(2 * Math.PI * 48990, 3).components, { ohms: () => '12.1k + 3.32k' })],
	['filter/buildTowThomasBpDiagram', () => filter.buildTowThomasBpDiagram(designTowThomasBandPass(2 * Math.PI * 48990, 2.4476).components)],
	['filter/buildTowThomasBpDiagram pair labels', () => filter.buildTowThomasBpDiagram(designTowThomasBandPass(2 * Math.PI * 41047, 4.9719, { gain: 2.0314 }).components, { ohms: () => '12.1k + 3.32k' })],
	// the narrow band-pass stages at 10 kHz, Q 5: the RLC with a gyrator and
	// with a GIC (an input divider, and the tank left to the gain stage
	// after it, no follower of its own), the Sallen-Key band-pass with and
	// without its divider, the state-variable circuit, the gain stage, and
	// each with the longest pair label a resistor can carry
	['filter/buildRlcGyratorDiagram (divider)', () => filter.buildRlcGyratorDiagram(narrowStage('rlcGyrator', 0.3).components)],
	['filter/buildRlcGyratorDiagram (no follower)', () => filter.buildRlcGyratorDiagram(narrowStage('rlcGyrator', 1).components, { buffered: false })],
	['filter/buildRlcGicDiagram', () => filter.buildRlcGicDiagram(narrowStage('rlcGic', 1).components)],
	['filter/buildRlcGicDiagram (divider, no follower)', () => filter.buildRlcGicDiagram(narrowStage('rlcGic', 0.3).components, { buffered: false })],
	['filter/buildSallenKeyBpDiagram', () => filter.buildSallenKeyBpDiagram(narrowStage('sallenKeyBp', 20).components)],
	['filter/buildSallenKeyBpDiagram (divider)', () => filter.buildSallenKeyBpDiagram(narrowStage('sallenKeyBp', 1).components)],
	['filter/buildKhnBpDiagram', () => filter.buildKhnBpDiagram(narrowStage('khnBp', 1).components)],
	['filter/buildGainNonInvDiagram (narrow gain stage)', () => filter.buildGainNonInvDiagram(realizeNarrow(designNarrowBand({ f0: 10000, q: 5, gain: 1, stages: 1 }), 'rlcGyrator').gainStage.components)],
	['filter/buildRlcGyratorDiagram pair labels', () => filter.buildRlcGyratorDiagram(narrowStage('rlcGyrator', 0.3).components, { ohms: () => '12.1k + 3.32k' })],
	['filter/buildRlcGicDiagram pair labels', () => filter.buildRlcGicDiagram(narrowStage('rlcGic', 0.3).components, { ohms: () => '12.1k + 3.32k', buffered: false })],
	['filter/buildSallenKeyBpDiagram pair labels', () => filter.buildSallenKeyBpDiagram(narrowStage('sallenKeyBp', 1).components, { ohms: () => '12.1k + 3.32k' })],
	['filter/buildKhnBpDiagram pair labels', () => filter.buildKhnBpDiagram(narrowStage('khnBp', 1).components, { ohms: () => '12.1k + 3.32k' })],
	['modulation/buildJfetGainCellDiagram', () => modulation.buildJfetGainCellDiagram({ rb: 13600 })],
	['modulation/buildGainStageDiagram', () => modulation.buildGainStageDiagram({ rtop: 8200, rbottom: 10000 })],
	['modulation/buildHighPassDiagram', () => modulation.buildHighPassDiagram({ r: 100000, c: 2.2e-7 })],
	['modulation/buildSummerDiagram(n=2)', () => modulation.buildSummerDiagram({ inputs: ['x_m(t) (AC)', 'V_bias (DC)'], r: 10000 })],
	['oscillator/wien', () => buildOscillatorDiagram(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3 }))],
	// the AM page's carrier: a fast Wien bridge, its limiter drawn in place
	['oscillator/wien-am-carrier', () => buildOscillatorDiagram(designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: 55000, amplitude: 1, gbw: 3e6, slewRate: 13e6, opampSwing: 10.5 }))],
	['oscillator/phaseShift', () => buildOscillatorDiagram(designOscillator({ topology: 'phaseShift', frequency: 1000, amplitude: 3 }))],
	['oscillator/bufferedPhaseShift', () => buildOscillatorDiagram(designOscillator({ topology: 'bufferedPhaseShift', frequency: 1000, amplitude: 3 }))],
	['oscillator/bubba', () => buildOscillatorDiagram(designOscillator({ topology: 'bubba', frequency: 1000, amplitude: 3 }))],
	['oscillator/quadrature', () => buildOscillatorDiagram(designOscillator({ topology: 'quadrature', frequency: 1000, amplitude: 3 }))],
	['oscillator/wien-lamp', () => buildOscillatorDiagram(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3, stabilizer: 'lamp' }))],
	['oscillator/wien-jfet', () => buildOscillatorDiagram(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3, stabilizer: 'jfet' }))],
	['oscillator/agc', () => buildAgcDiagram(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3, stabilizer: 'jfet' }))],
	['oscillator/limiter', () => buildLimiterDiagram(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3 }))],
	['oscillator/clamp', () => buildClampDiagram(designOscillator({ topology: 'quadrature', frequency: 1000, amplitude: 3 }))],
	['oscillator/limiter-ladder', () => buildLimiterDiagram(designOscillator({ topology: 'bubba', frequency: 1000, amplitude: 3 }))],
	['modulation/buildJfetInvertingCellDiagram', () => modulation.buildJfetInvertingCellDiagram({ r2: 3900 })],
	['modulation/buildJfetInvertingCellDiagram(no follower)', () => modulation.buildJfetInvertingCellDiagram({ r2: 3900, follower: false })],
	['modulation/buildJfetTestDiagram', () => modulation.buildJfetTestDiagram()],
	['modulation/buildBiasSummerDiagram', () => modulation.buildBiasSummerDiagram({ c: 2.2e-6, rac: 5600, rbias: 62000, rf: 10000 })],
	['modulation/buildCarrierDividerDiagram', () => modulation.buildCarrierDividerDiagram({ top: 9100, bottom: 1000 })],
	// the names the AM page gives the two ends, the longest ones included
	['modulation/buildCarrierDividerDiagram(from the oscillator)', () => modulation.buildCarrierDividerDiagram({ top: 5100, bottom: 1000, from: 'from the Wien oscillator', to: 'to + input' })],
	['modulation/buildCarrierDividerDiagram(to the follower)', () => modulation.buildCarrierDividerDiagram({ top: 1.2e6, bottom: 1000, from: 'carrier source', to: 'to the follower' })],
	['modulation/buildCarrierDividerDiagram(no divider)',() => modulation.buildCarrierDividerDiagram({ top: 0, bottom: 1000, from: 'from the Wien oscillator', to: 'to the drain' })],
	['modulation/buildSummerDiagram(n=3)', () => modulation.buildSummerDiagram({ inputs: ['x_p(t)', 'x_m(t)', 'V_DC (bias)'], r: 10000 })],
	['modulation/buildDividerDiagram', () => modulation.buildDividerDiagram({ top: 51000, bottom: 10000, vcc: 12 })],
	['modulation/buildDiodeTankDiagram(pair)', () => modulation.buildDiodeTankDiagram({ rs: 3300, l: 1e-3, capacitors: [15e-9, 820e-12], r: 2200 })],
	['modulation/buildDiodeTankDiagram(single)', () => modulation.buildDiodeTankDiagram({ rs: 8200, l: 1e-3, capacitors: [15e-9], r: 5100 })],
	['modulation/buildDiodeSummerDiagram(bias)', () => modulation.buildDiodeSummerDiagram({ rp: 4700, rm: 8200, rb: 510000, rf: 10000 })],
	['modulation/buildDiodeSummerDiagram(no bias)', () => modulation.buildDiodeSummerDiagram({ rp: 4700, rm: 7500, rb: null, rf: 10000 })],
	['modulation/buildPrecisionRectifierDiagram', () => modulation.buildPrecisionRectifierDiagram({ r1: 10000, r2: 10000, r3: 10000 })],
	['modulation/buildHalfWaveDiagram', () => modulation.buildHalfWaveDiagram({ rl: 1000 })],
	['modulation/buildEnvelopeLowPassDiagram', () => modulation.buildEnvelopeLowPassDiagram({ R1: 11000, R2: 11000, Ctop: 2.2e-8, Cbottom: 1e-8 })],
	['modulation/buildEnvelopeMfbDiagram', () => modulation.buildEnvelopeMfbDiagram({ R1: 10000, R2: 10000, R3: 10000, C1: 2.2e-8, C2: 4.7e-9 })],
	['modulation/buildOutputCouplingDiagram(+ to the load)', () => modulation.buildOutputCouplingDiagram({ c: 1e-4, rLoad: 32, plusToward: 'load' })],
	['modulation/buildOutputCouplingDiagram(+ to the filter)', () => modulation.buildOutputCouplingDiagram({ c: 3.3e-7, rLoad: 10000, plusToward: 'filter' })],
	['karnaugh/sop 2 terms (B\'D\' + BD)', () => karnaughCase(4, [0, 2, 5, 7, 8, 10, 13, 15], [], 'sop')],
	['karnaugh/pos 2 terms', () => karnaughCase(4, [0, 2, 5, 7, 8, 10, 13, 15], [], 'pos')],
	['karnaugh/sop with don\'t-cares', () => karnaughCase(4, [1, 3, 7, 11, 15], [0, 2, 5], 'sop')],
	['karnaugh/sop 3 vars 3 terms', () => karnaughCase(3, [0, 1, 2, 5, 6, 7], [], 'sop')],
	['karnaugh/sop single literals + terms (7-seg a)', () => karnaughCase(4, [0, 2, 3, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15], 'sop')],
	['karnaugh/pos 7-seg a', () => karnaughCase(4, [0, 2, 3, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15], 'pos')],
	['karnaugh/sop single minterm (one AND4)', () => karnaughCase(4, [5], [], 'sop')],
	['karnaugh/sop single literal only', () => karnaughCase(4, [8, 9, 10, 11, 12, 13, 14, 15], [], 'sop')],
	['karnaugh/sop 2 vars xor', () => karnaughCase(2, [1, 2], [], 'sop')],
	['karnaugh/sop 8 terms (checkerboard-ish)', () => karnaughCase(4, [0, 3, 5, 6, 9, 10, 12, 15], [], 'sop')],
	['karnaugh/constant 1', () => karnaughCase(4, Array.from({ length: 16 }, (_, i) => i), [], 'sop')]
];

let bugs = 0;
for (const [name, build] of CASES) {
	const result = checkDiagram(name, build());
	const bad = result.issues.filter((i) => i.level === 'bug');
	bugs += bad.length;
	const c = result.counts;
	console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'}  ${name}  (${c.symbols} symbols, ${c.wires} wire segments, ${c.dots} dots, ${c.labels} labels)`);
	for (const i of result.issues) console.log(`      ${i.level === 'bug' ? '!' : '-'} [${i.kind}] ${i.msg}`);
}
console.log();

// Every diagram the AM and oscillator pages draw, built the way the pages
// build them, with the page's own end labels and each stock: a label that
// only collides for one configuration (a long 'from the Wien oscillator'
// under a short lead) is caught here, not by the fixed cases above.
{
	const { designJfetModulator } = await import('../src/lib/modulation/jfetModulator.js');
	const { modelFromIdss, modelFromRdsOn } = await import('../src/lib/modulation/jfetModel.js');
	const { designDiodeMixerModulator } = await import('../src/lib/modulation/diodeMixerModulator.js');
	const { designEnvelopeLowPass } = await import('../src/lib/modulation/envelopeFilter.js');
	const { designPrecisionRectifier, designHalfWaveRectifier } = await import('../src/lib/modulation/rectifier.js');
	const { componentOptions } = await import('../src/lib/stock.js');
	const { hasLimiterDiagram } = await import('../src/lib/oscillator/circuits.js');
	const { pairDiagramLabel } = await import('../src/lib/modulation/eseries.js');
	const { formatOhms } = await import('../src/lib/modulation/format.js');
	const STOCKS = [
		...['E24', 'E96', 'lab', 'labR'].map((s) => [s, componentOptions(s)]),
		// two resistors in series: the drawings label a pair by its two parts,
		// longer than a single value (the oscillator's own drawings read the
		// pair from the design, the AM ones get the page's label function)
		['lab+pairs', componentOptions('lab', '', '', true)],
		['labR+pairs', componentOptions('labR', '', '', true)],
		// a list of 3-digit values gives the longest pair labels ("49.9k + 24.9k")
		['custom3+pairs', componentOptions('custom', '1.02k 2.49k 4.99k 10.2k 24.9k 49.9k 102k 249k 499k 1.02M', '', true)]
	];
	const seen = new Set();
	const SWEEP = [];
	const add = (name, build) => {
		let d;
		try {
			d = build();
		} catch (e) {
			SWEEP.push([name + ' THROWS ' + e.message, () => ({ svg: '', viewBox: '0 0 1 1' })]);
			return;
		}
		if (!d || seen.has(d.svg)) return;
		seen.add(d.svg);
		SWEEP.push([name, () => d]);
	};
	for (const [sn, parts] of STOCKS) {
		// the resistor labels the AM page passes: a pair by its two parts, never for an E24 fallback (own false)
		const ohmsFor = (own = true) => (v) => pairDiagramLabel(v, parts.resistorSeries, formatOhms, parts.pairs && own);
		const ohms = ohmsFor();
		for (const model of [modelFromIdss(-4, 5e-3), modelFromRdsOn(-6.5, 30), modelFromIdss(-1.5, 2e-3)]) {
			for (const topology of ['noninverting', 'inverting']) {
				for (const carrierBuffer of [true, false]) {
					for (const fp of [10000, 55000, 200000]) {
						for (const wien of [false, true]) {
							for (const amp of [0.05, 1, 5]) {
								const osc = wien ? designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: fp, amplitude: amp, ...parts }) : null;
								const cin = osc?.limiter.amplitudeActual ?? amp;
								// n = 0.6, and the page's default 0.85, which asks for a larger R_b and longer pairs
								for (const targetN of [0.6, 0.85]) {
									// the non-inverting cell with its optional output stage, so that drawing is swept too
									const d = designJfetModulator({ model, topology, carrierBuffer, targetModulationIndex: targetN, swingFraction: 0.9, sourceAmplitude: 1, fmMin: 100, vcc: 12, fp, carrierSourceAmplitude: cin, targetOutputAmplitude: topology === 'inverting' ? 1 : 2, outputStage: true, ...parts });
									if (!d) continue;
									const tag = `${sn} ${topology} buf=${carrierBuffer} ${fp} ${wien ? 'wien' : 'gen'} ${amp}V n=${targetN}`;
									if (topology === 'inverting') add(`am/inverting cell ${tag}`, () => modulation.buildJfetInvertingCellDiagram({ r2: d.r2, follower: d.buffer.enabled, ohms }));
									else add(`am/gain cell ${tag}`, () => modulation.buildJfetGainCellDiagram({ rb: d.rb, ohms }));
									if (d.postGain?.needed) add(`am/post-gain ${tag}`, () => modulation.buildGainStageDiagram({ rtop: d.postGain.rtop, rbottom: d.postGain.rbottom, ohms }));
									add(`am/divider ${tag}`, () =>
										modulation.buildCarrierDividerDiagram({ ...d.carrier.divider, from: osc ? 'from the Wien oscillator' : 'carrier source', to: topology === 'inverting' ? (d.buffer.enabled ? 'to the follower' : 'to the drain') : 'to + input', ohms })
									);
									add(`am/gate summer ${tag}`, () => modulation.buildBiasSummerDiagram(d.conditioning.summer, { ohms }));
									if (osc) add(`am/wien ${tag}`, () => buildOscillatorDiagram(osc));
								}
							}
						}
					}
				}
			}
		}
		for (const [fp, fmMax, L] of [[40000, 1000, 1e-3], [455000, 5000, 100e-6], [10000, 500, 10e-3], [40000, 1000, 0.1], [100000, 2000, 1e-3]]) {
			for (const diode of ['1N4148', 'BAT54']) {
				const dd = designDiodeMixerModulator({ fp, fmMax, inductance: L, diode, ...parts });
				if (!dd) continue;
				const tag = `${sn} ${fp}/${fmMax}/${L} ${diode}`;
				add(`am/diode summer ${tag}`, () => modulation.buildDiodeSummerDiagram(dd.summer, { ohms: ohmsFor(!dd.stockShortfall) }));
				add(`am/diode tank ${tag}`, () => modulation.buildDiodeTankDiagram({ rs: dd.rs, l: dd.inductance, capacitors: dd.capacitors, r: dd.rt }));
			}
		}
		add(`am/precision rectifier ${sn}`, () => modulation.buildPrecisionRectifierDiagram(designPrecisionRectifier({ resistorSeries: parts.resistorSeries })));
		add(`am/half-wave ${sn}`, () => modulation.buildHalfWaveDiagram(designHalfWaveRectifier({ resistorSeries: parts.resistorSeries })));
		for (const topology of ['sallenKey', 'mfb']) {
			for (const response of ['butterworth', 'chebyshev']) {
				for (const [fm, fs] of [[1000, 79000], [1000, 99000], [5000, 35000], [300, 9700]]) {
					const env = designEnvelopeLowPass({ response, amaxDb: 1, aminDb: 40, fp: fm, fs, order: null, maxOrder: 8, topology, ...parts });
					if (env.tooHigh) continue;
					const build = topology === 'mfb' ? modulation.buildEnvelopeMfbDiagram : modulation.buildEnvelopeLowPassDiagram;
					env.realized.forEach((s, i) => add(`am/envelope ${topology} ${sn} ${response} ${fm}/${fs} stage ${i + 1}`, () => build(s.components, { ohms: ohmsFor(!s.stockShortfall) })));
				}
			}
		}
		// the output into a load: either way round, from earphones to an amplifier's input
		for (const plusToward of ['filter', 'load']) {
			for (const rLoad of [8, 32, 600, 10000, 47000]) {
				for (const c of [1e-6, 100e-6, 2.2e-3]) add(`am/output ${plusToward} ${rLoad} ${c}`, () => modulation.buildOutputCouplingDiagram({ c, rLoad, plusToward }));
			}
		}
		for (const t of TOPOLOGIES) {
			for (const stabilizer of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
				for (const f of [50, 1000, 55000, 350000]) {
					for (const amplitude of [0.2, 3, 5]) {
						let od;
						try {
							od = designOscillator({ topology: t.id, stabilizer, frequency: f, amplitude, ...parts });
						} catch {
							continue;
						}
						if (!od) continue;
						const tag = `${sn} ${t.id}/${stabilizer} ${f} Hz ${amplitude} V`;
						add(`osc/${tag}`, () => buildOscillatorDiagram(od));
						if (hasLimiterDiagram(od)) add(`osc/limiter ${tag}`, () => buildLimiterDiagram(od));
						if (od.limiter.kind === 'jfet' && od.limiter.regulates) add(`osc/agc ${tag}`, () => buildAgcDiagram(od));
						if (od.limiter.kind === 'clamp') add(`osc/clamp ${tag}`, () => buildClampDiagram(od));
					}
				}
			}
		}
	}
	// the named cases above print one line each; the sweep prints its failures and a count
	let sweepBugs = 0;
	for (const [name, build] of SWEEP) {
		const result = checkDiagram(name, build());
		const bad = result.issues.filter((i) => i.level === 'bug');
		if (/ THROWS /.test(name)) {
			sweepBugs++;
			console.log(`FAIL  ${name}`);
			continue;
		}
		if (!bad.length) continue;
		sweepBugs += bad.length;
		console.log(`FAIL  ${name}`);
		for (const i of bad) console.log(`      ! [${i.kind}] ${i.msg}`);
	}
	console.log(`${sweepBugs === 0 ? 'PASS' : 'FAIL'}  sweep: ${SWEEP.length} distinct diagrams the AM and oscillator pages draw, with their own labels and every stock`);
	bugs += sweepBugs;
}

// Every stage diagram the filter page draws, from real designs with two
// resistors in series allowed: a resistor built from a pair is labelled with
// its two parts ("R1 56k + 8.2k"), longer than a single value, so a label
// that only collides with pairs on is caught here. Each stock is swept over
// f0 and Q (and the notch zeros), its own list naming the parts; the
// 3-digit list gives the longest pair labels a list can ("12.1k + 3.32k").
{
	const { designMfbLowPass } = await import('../src/lib/filter/mfb.js');
	const { designMfbHighPass } = await import('../src/lib/filter/mfbHighPass.js');
	const { designSallenKeyLowPass } = await import('../src/lib/filter/sallenKey.js');
	const { designSallenKeyHighPass } = await import('../src/lib/filter/sallenKeyHighPass.js');
	const { designFirstOrderLowPass } = await import('../src/lib/filter/firstOrder.js');
	const { designFirstOrderHighPass } = await import('../src/lib/filter/firstOrderHighPass.js');
	const { LAB_KIT, pairDiagramLabel } = await import('../src/lib/filter/eseries.js');
	const { formatOhms } = await import('../src/lib/filter/format.js');
	const { componentOptions } = await import('../src/lib/stock.js');
	const STOCKS = [
		['lab', { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors, pairs: true }],
		['labR', { resistorSeries: LAB_KIT.resistors, capacitors: null, pairs: true }],
		['3-digit list', componentOptions('custom', '1.21k 3.32k 12.1k 33.2k 121k 332k 1.21M', '1n 4.7n 22n 100n', true)]
	];
	const draw = (d, opts) => {
		const c = d.components;
		if (d.topology === 'mfb') return filter.buildMfbDiagram(c, opts);
		if (d.topology === 'mfbHp') return filter.buildMfbHpDiagram(c, opts);
		if (d.topology === 'sallenKey') return filter.buildSallenKeyDiagram(c, opts);
		if (d.topology === 'sallenKeyHp') return filter.buildSallenKeyHpDiagram(c, opts);
		if (d.topology === 'towThomas') return filter.buildTowThomasDiagram(c, opts);
		if (d.topology === 'towThomasHp') return filter.buildTowThomasHpDiagram(c, opts);
		if (d.topology === 'towThomasNotch') return filter.buildTowThomasNotchDiagram(c, opts);
		if (d.topology === 'mfbBp') return filter.buildMfbBpDiagram(c, opts);
		if (d.topology === 'towThomasBp') return filter.buildTowThomasBpDiagram(c, opts);
		if (d.topology === 'firstOrder') return filter.buildFirstOrderDiagram(c, d.actual.tau, opts);
		if (d.topology === 'firstOrderHp') return filter.buildFirstOrderHpDiagram(c, d.actual.tau, opts);
		throw new Error(`no diagram for ${d.topology}`);
	};
	const F0 = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
	const QS = [0.5, 0.5412, 0.7071, 1, 1.3066, 2, 3, 5];
	// a transformed design's stages reach the Q of a narrow band
	const QS_BAND = [0.5, 0.7071, 1, 2, 3, 5, 8, 12, 20];
	const seen = new Set();
	const SWEEP = [];
	let withPairs = 0;
	const add = (name, build) => {
		let d;
		try {
			d = build();
		} catch (e) {
			SWEEP.push([name + ' THROWS ' + e.message, () => ({ svg: '', viewBox: '0 0 1 1' })]);
			return;
		}
		if (!d || seen.has(d.svg)) return;
		seen.add(d.svg);
		if (/<text[^>]*>[^<]* \+ [^<]*<\/text>/.test(d.svg)) withPairs++;
		SWEEP.push([name, () => d]);
	};
	for (const [sn, parts] of STOCKS) {
		const ohms = (v) => pairDiagramLabel(v, parts.resistorSeries, formatOhms, true);
		const stage = (name, design) => design && add(`filter/${name} ${sn}`, () => draw(design, { ohms }));
		for (const f0 of F0) {
			const wn = 2 * Math.PI * f0;
			stage(`firstOrder ${f0} Hz`, designFirstOrderLowPass(1 / wn, parts));
			stage(`firstOrderHp ${f0} Hz`, designFirstOrderHighPass(1 / wn, parts));
			for (const q of QS) {
				const tag = `${f0} Hz Q ${q}`;
				stage(`mfb ${tag}`, designMfbLowPass(wn, q, parts));
				stage(`mfbHp ${tag}`, designMfbHighPass(wn, q, parts));
				stage(`sallenKey ${tag}`, designSallenKeyLowPass(wn, q, parts));
				stage(`sallenKeyHp ${tag}`, designSallenKeyHighPass(wn, q, parts));
				stage(`towThomas ${tag}`, designTowThomasLowPass(wn, q, parts));
				stage(`towThomasHp ${tag}`, designTowThomasHighPass(wn, q, parts));
				for (const k of [1.1, 1.5, 2.5, 5]) stage(`notch (low side) ${tag} fz ${k} f0`, designTowThomasNotch(wn, q, k * wn, { lowSide: true, ...parts }));
				for (const k of [0.2, 0.4, 0.67, 0.9]) stage(`notch (high side) ${tag} fz ${k} f0`, designTowThomasNotch(wn, q, k * wn, { lowSide: false, ...parts }));
			}
			// the transformation's stages: band-pass stages at their centre gain,
			// and notches held at a gain (their input capacitor scaled by it)
			for (const q of QS_BAND) {
				for (const gain of [1, 2]) {
					const tag = `${f0} Hz Q ${q} gain ${gain}`;
					stage(`mfbBp ${tag}`, designMfbBandPass(wn, q, { ...parts, gain }));
					stage(`towThomasBp ${tag}`, designTowThomasBandPass(wn, q, { ...parts, gain }));
				}
			}
			for (const q of [2, 8, 20]) {
				stage(`notch at a gain (zero above) ${f0} Hz Q ${q}`, designTowThomasNotch(wn, q, 1.5 * wn, { ...parts, gain: 0.4 }));
				stage(`notch at a gain (zero below) ${f0} Hz Q ${q}`, designTowThomasNotch(wn, q, 0.67 * wn, { ...parts, gain: 2 }));
			}
		}
	}
	let sweepBugs = 0;
	for (const [name, build] of SWEEP) {
		const result = checkDiagram(name, build());
		const bad = result.issues.filter((i) => i.level === 'bug');
		if (/ THROWS /.test(name)) {
			sweepBugs++;
			console.log(`FAIL  ${name}`);
			continue;
		}
		if (!bad.length) continue;
		sweepBugs += bad.length;
		console.log(`FAIL  ${name}`);
		for (const i of bad) console.log(`      ! [${i.kind}] ${i.msg}`);
	}
	console.log(`${sweepBugs === 0 ? 'PASS' : 'FAIL'}  sweep: ${SWEEP.length} distinct stage diagrams the filter page draws with two in series allowed (${withPairs} with a pair label)`);
	bugs += sweepBugs;
}

// Every stage the narrow band-pass draws, built as the page builds it
// (realizeNarrow, one stage, on each of the six circuits, the gain stage
// after one included) over f0, Q and K, on a full series and on two lists
// with two resistors in series allowed, and drawn as the page draws it: a
// pair labelled by its two parts, an RLC tank without its follower when the
// gain stage after it buffers it.
{
	const { LAB_KIT, pairDiagramLabel } = await import('../src/lib/filter/eseries.js');
	const { formatOhms } = await import('../src/lib/filter/format.js');
	const { componentOptions } = await import('../src/lib/stock.js');
	const { NARROW_CIRCUITS } = await import('../src/lib/filter/narrowBand.js');
	const STOCKS = [
		['E24', { resistorSeries: 'E24', capacitors: null, pairs: false }],
		['kit', { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors, pairs: true }],
		['3-digit list', componentOptions('custom', '1.21k 3.32k 12.1k 33.2k 121k 332k 1.21M', '1n 4.7n 22n 100n', true)]
	];
	// as CircuitDiagram.svelte picks the builder
	const draw = (s, opts) => {
		const c = s.components;
		if (s.topology === 'rlcGyrator') return filter.buildRlcGyratorDiagram(c, { ...opts, buffered: s.buffered !== false });
		if (s.topology === 'rlcGic') return filter.buildRlcGicDiagram(c, { ...opts, buffered: s.buffered !== false });
		if (s.topology === 'sallenKeyBp') return filter.buildSallenKeyBpDiagram(c, opts);
		if (s.topology === 'khnBp') return filter.buildKhnBpDiagram(c, opts);
		if (s.topology === 'mfbBp') return filter.buildMfbBpDiagram(c, opts);
		if (s.topology === 'towThomasBp') return filter.buildTowThomasBpDiagram(c, opts);
		if (s.topology === 'gainNonInv') return filter.buildGainNonInvDiagram(c, opts);
		throw new Error(`no diagram for ${s.topology}`);
	};
	const seen = new Set();
	const SWEEP = [];
	const kinds = new Map();
	let withPairs = 0;
	for (const [sn, parts] of STOCKS) {
		for (const f0 of [50, 500, 5000, 20000, 100000]) {
			for (const q of [0.7071, 2, 5, 10, 20]) {
				for (const gain of [0.3, 1, 4]) {
					const d = designNarrowBand({ f0, q, gain, stages: 1 });
					for (const circuit of NARROW_CIRCUITS) {
						const r = realizeNarrow(d, circuit, parts);
						if (!r.ok) continue;
						for (const s of r.stages) {
							const name = `narrow/${s.topology}${s.buffered === false ? ' (no follower)' : ''} ${sn} ${f0} Hz Q ${q} K ${gain}`;
							let diagram;
							try {
								diagram = draw(s, { ohms: (v) => pairDiagramLabel(v, parts.resistorSeries, formatOhms, parts.pairs && !s.stockShortfall) });
							} catch (e) {
								SWEEP.push([`${name} THROWS ${e.message}`, () => ({ svg: '', viewBox: '0 0 1 1' })]);
								continue;
							}
							if (seen.has(diagram.svg)) continue;
							seen.add(diagram.svg);
							if (/<text[^>]*>[^<]* \+ [^<]*<\/text>/.test(diagram.svg)) withPairs++;
							// an input divider: Rb of an RLC or Sallen-Key stage (a Tow-Thomas Rb is one of its integrators)
							const kind = `${s.topology}${s.buffered === false ? ' (no follower)' : ''}${s.components.Rb && /^(rlc|sallenKeyBp)/.test(s.topology) ? ' (divider)' : ''}`;
							kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
							SWEEP.push([name, () => diagram]);
						}
					}
				}
			}
		}
	}
	let sweepBugs = 0;
	for (const [name, build] of SWEEP) {
		const result = checkDiagram(name, build());
		const bad = result.issues.filter((i) => i.level === 'bug');
		if (/ THROWS /.test(name)) {
			sweepBugs++;
			console.log(`FAIL  ${name}`);
			continue;
		}
		if (!bad.length) continue;
		sweepBugs += bad.length;
		console.log(`FAIL  ${name}`);
		for (const i of bad) console.log(`      ! [${i.kind}] ${i.msg}`);
	}
	console.log(`${sweepBugs === 0 ? 'PASS' : 'FAIL'}  sweep: ${SWEEP.length} distinct stage diagrams the narrow band-pass draws (${withPairs} with a pair label; ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')})`);
	bugs += sweepBugs;
}

console.log(bugs === 0 ? 'all schematics clean' : `${bugs} issue(s) found`);
process.exit(bugs === 0 ? 0 : 1);
