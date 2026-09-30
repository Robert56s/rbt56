// Numeric checks of the sine-oscillator engine.
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-oscillator.mjs
//
// 1. The ladder solver reproduces the textbook constants exactly, and
//    shows what loading the ladder costs.
// 2. The loop solver with the single-pole op-amp reproduces LTspice's own
//    AC analysis of the open loop, to four figures, on every topology.
// 3. The limiter's describing function lands where LTspice's transient
//    settled.
// 4. Every design at four frequencies is consistent: predicted frequency
//    on target, positive start-up growth, amplitude near the target,
//    parts realizable, and the ones that cannot work say so.
// 5. The drawn .asc describes the same circuit as the .cir, carries every
//    model and directive, and the export refuses a design it cannot size.
// 6. The explanations and the formula sheet render under strict KaTeX.
// 7. Parts from the stock the page picks, and two resistors in series:
//    off changes nothing, on keeps every resistor a value on hand or a
//    pair of them, is never worse than one resistor per part, and the
//    export names each pair.
// Exits non-zero on any failure. LTspice itself is run by check-ltspice.mjs.

import { readFileSync } from 'node:fs';
import katex from 'katex';
import { LAB_KIT, seriesPair } from '../src/lib/filter/eseries.js';
import { AMPLITUDE_TOLERANCE, amplitudeRemark, explainBarkhausen, explainOpampLimit, explainStabilizer, explainTopology } from '../src/lib/oscillator/explain.js';
import { DIODES, feedbackLimiterAmplitude } from '../src/lib/oscillator/limiter.js';
import { openLoop, retune, solveBalance, solvePole, zeroPhase } from '../src/lib/oscillator/loop.js';
import { buildElements, generateNetlist, generateSchematic, pairNotes } from '../src/lib/oscillator/spice.js';
import { compareOscillators, designOscillator, PAIRS_FREQUENCY_SLACK, solveLadder, TOPOLOGIES } from '../src/lib/oscillator/topologies.js';
import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';
import { audit } from '../src/lib/spice/geometry.js';
import { realOpampProblems } from './lib-real-opamp.mjs';

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Math.abs(a / b - 1) <= tol;
const WT = 2 * Math.PI * 3e6;

/* ------------------------------------------------------ 1. the ladder */
{
	const u3 = solveLadder(3, { buffered: false });
	const b3 = solveLadder(3, { buffered: true });
	const b4 = solveLadder(4, { buffered: true });
	check('ladder: 3 unbuffered sections balance at x0 = 1/sqrt(6) with gain 29', near(u3.x0, 1 / Math.sqrt(6), 1e-9) && near(u3.gain, 29, 1e-6), `${u3.x0.toFixed(6)}, ${u3.gain.toFixed(6)}`);
	// high-pass sections: 60 degrees each means omega R C = tan(30 degrees) = 1/sqrt(3)
	check('ladder: 3 buffered sections at 1/sqrt(3) with gain 8', near(b3.x0, 1 / Math.sqrt(3), 1e-9) && near(b3.gain, 8, 1e-6), `${b3.x0.toFixed(6)}, ${b3.gain.toFixed(6)}`);
	check('ladder: 4 buffered sections (Bubba) at 1 with gain 4', near(b4.x0, 1, 1e-9) && near(b4.gain, 4, 1e-6), `${b4.x0.toFixed(6)}, ${b4.gain.toFixed(6)}`);
	const loaded = solveLadder(3, { buffered: false, loadRatio: 1 });
	check('ladder: a separate Rg equal to R on the end raises the gain needed to nearly 40', loaded.gain > 38 && loaded.gain < 41, loaded.gain.toFixed(2));
	const topo = Object.fromEntries(TOPOLOGIES.map((t) => [t.id, t]));
	check('topologies carry the solved constants', near(topo.phaseShift.gain, 29, 1e-6) && near(topo.bufferedPhaseShift.gain, 8, 1e-6) && near(topo.bubba.gain, 4, 1e-6) && topo.bufferedPhaseShift.opamps === 3 && topo.bubba.opamps === 4);
}

/* ---------------------------------- 2. the loop solver against LTspice */
// LTspice 26 .ac of the open loop (scratchpad/spice/exp/ac*.cir): the
// zero-phase frequency and the magnitude the loop returns there
{
	const cases = [
		['phase shift, 1 kHz, gain 30.45', 'ladder', { rc: 6450 * 10e-9, wt: WT, n: 3, gain: 30.45 }, 0.408248 / (6450 * 10e-9), 1005.26, 1.0482],
		['phase shift, 55 kHz, gain 30.45', 'ladder', { rc: 118.1 * 10e-9, wt: WT, n: 3, gain: 30.45 }, 0.408248 / (118.1 * 10e-9), 49533, 0.9525],
		['Bubba, 55 kHz, gain 4.3', 'ladder', { rc: 2894e-9, wt: WT, n: 4, buffered: true, gain: 4.3 }, 1 / 2894e-9, 52131, 0.99857],
		['Wien, 55 kHz, gain 3.15', 'wien', { rc: 2894e-9, wt: WT, gain: 3.15 }, 1 / 2894e-9, 50772.7, 1.047]
	];
	for (const [label, kind, params, omega0, fRef, magRef] of cases) {
		const z = zeroPhase(kind, params, { omega0 });
		check(`loop vs LTspice .ac: ${label}`, z.converged && rel(z.omega / (2 * Math.PI), fRef, 2e-4) && near(z.magnitude, magRef, 2e-3), `${(z.omega / (2 * Math.PI)).toFixed(1)} Hz, |L| ${z.magnitude.toFixed(4)}`);
	}
	// ideal op-amp: the textbook comes back
	const ideal = zeroPhase('wien', { rc: 1.6e-4, wt: 2 * Math.PI * 1e12, gain: 3.3 }, { omega0: 1 / 1.6e-4 });
	check('loop: with an infinitely fast op-amp the Wien returns g/3 at 1/(2 pi RC)', near(ideal.magnitude, 1.1, 1e-6) && rel(ideal.omega * 1.6e-4, 1, 1e-8));
	const idealPs = zeroPhase('ladder', { rc: 1.6e-4, wt: 2 * Math.PI * 1e12, n: 3, gain: 29 }, { omega0: 0.408248 / 1.6e-4 });
	check('loop: the ideal phase shift balances at x0 = 1/sqrt(6) with |L| = 1', near(idealPs.magnitude, 1, 1e-6) && near(idealPs.omega * 1.6e-4, 0.408248, 1e-5));
	// the balance gain: |L| = 1 exactly
	const bal = solveBalance('ladder', { rc: 6450 * 10e-9, wt: WT, n: 3 }, { omega0: 0.408248 / (6450 * 10e-9), gain0: 29 });
	const at = openLoop('ladder', { re: 0, im: bal.omega }, { rc: 6450 * 10e-9, wt: WT, n: 3, gain: bal.gain });
	check('loop: solveBalance returns in phase with |L| = 1', bal.converged && near(Math.hypot(at.re, at.im), 1, 1e-8) && Math.abs(at.im) < 1e-8, `gain ${bal.gain.toFixed(4)} at ${(bal.omega / 2 / Math.PI).toFixed(2)} Hz`);
	// the pole: growth sign follows the gain, and the quadrature grows only through the lag
	const grow = solvePole('wien', { rc: 1.6e-4, wt: WT, gain: 3.12 }, { omega0: 1 / 1.6e-4 });
	const decay = solvePole('wien', { rc: 1.6e-4, wt: WT, gain: 2.9 }, { omega0: 1 / 1.6e-4 });
	check('pole: a Wien bridge above 3 grows and below 3 decays', grow.sigma > 0 && decay.sigma < 0, `${(100 * grow.growthPerCycle).toFixed(1)} % and ${(100 * decay.growthPerCycle).toFixed(1)} % per cycle`);
	check('pole: 4 % excess on a Wien bridge grows about 46 % per cycle (Q of a third)', near(grow.growthPerCycle, Math.exp(2 * Math.PI * 0.06) - 1, 0.02), `${(100 * grow.growthPerCycle).toFixed(1)} %`);
	const q = solvePole('quadrature', { rc: 1.6e-4, wt: WT, rho: 0 }, { omega0: 1 / 1.6e-4 });
	const qIdeal = solvePole('quadrature', { rc: 1.6e-4, wt: 2 * Math.PI * 1e12, rho: 0 }, { omega0: 1 / 1.6e-4 });
	check('pole: the quadrature loop grows only through the op-amp lag (+0.4 %/cycle at 1 kHz, LTspice +0.4 %)', q.growthPerCycle > 0.003 && q.growthPerCycle < 0.006 && Math.abs(qIdeal.growthPerCycle) < 1e-6, `${(100 * q.growthPerCycle).toFixed(2)} %, ideal ${qIdeal.growthPerCycle.toExponential(1)}`);
	const qrho = solvePole('quadrature', { rc: 1.6e-4, wt: 2 * Math.PI * 1e12, rho: Math.log(1.1) / Math.PI }, { omega0: 1 / 1.6e-4 });
	check('pole: Rn = R pi / ln(1.1) gives 10 % growth per cycle', near(qrho.growthPerCycle, 0.1, 1e-3), `${(100 * qrho.growthPerCycle).toFixed(2)} %`);
	// retune lands the zero-phase frequency on target
	const rt = retune('wien', { wt: WT, gain: 3.15 }, { fTarget: 55000, k: 1 });
	const zr = zeroPhase('wien', { rc: rt.rc, wt: WT, gain: 3.15 }, { omega0: 1 / rt.rc });
	check('retune: the Wien at 55 kHz lands on target after an 8 % smaller RC', rt.converged && rel(zr.omega / (2 * Math.PI), 55000, 1e-6) && rt.rc * 2 * Math.PI * 55000 < 0.93 && rt.rc * 2 * Math.PI * 55000 > 0.9, `RC ratio ${(rt.rc * 2 * Math.PI * 55000).toFixed(4)}`);
}

/* ------------------------------------ 3. the limiter against LTspice */
{
	const d = DIODES['1N4148'];
	const a1 = feedbackLimiterAmplitude({ rf1: 15e3, rf2: 6.2e3, rt: 20e3, fraction: 2 / 3, diode: d });
	const a2 = feedbackLimiterAmplitude({ rf1: 10e3, rf2: 18e3, rt: 20.08e3, fraction: 2.008 / 3.008, diode: d });
	check('limiter: Wien 15k/6.2k settles near LTspice 2.63 V (the 0.6 V switch model said 3.08)', near(a1, 2.63, 0.1), `${a1.toFixed(3)} V`);
	check('limiter: Wien 10k/18k settles near LTspice 1.34 V', near(a2, 1.34, 0.08), `${a2.toFixed(3)} V`);
	check('limiter: a pair that cannot bring the gain down reports null', feedbackLimiterAmplitude({ rf1: 20e3, rf2: 2.4e3, rt: 20e3, fraction: 2 / 3, diode: d }) === null);
}

/* ------------------------------------------------ 4. every design */
{
	for (const f of [200, 1000, 20000, 55000]) {
		for (const t of TOPOLOGIES) {
			const stabs = t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes'];
			for (const s of stabs) {
				// the generic JFET holds about 3.1 V at least, so it is tried at 4 V
				const amplitude = f >= 20000 ? 1 : s === 'jfet' ? 4 : 3;
				const d = designOscillator({ topology: t.id, stabilizer: s, frequency: f, amplitude });
				const label = `${t.id}/${s} at ${f} Hz`;
				if (!d) {
					check(`design ${label} exists`, false);
					continue;
				}
				const jfetTooSmall = s === 'jfet' && amplitude < 2;
				const psTooFast = t.id === 'phaseShift' && f >= 55000;
				// a loop that cannot start has no oscillation frequency to predict
				if (!psTooFast) check(`design ${label}: predicted frequency within 2 % of the target`, rel(d.f0, f, 0.02), `${d.f0.toFixed(1)} Hz`);
				check(`design ${label}: RC retuned against the op-amp's lag`, d.retunePercent <= 0 && d.retunePercent > -0.2, `${(100 * d.retunePercent).toFixed(2)} %`);
				if (jfetTooSmall) {
					check(`design ${label}: says the JFET cannot be controlled at this amplitude`, d.limiter.regulates === false && d.limiter.minAmplitude > amplitude);
				} else if (psTooFast) {
					// the loop may start, but at 38 degrees of amplifier lag the single-pole model is past what it can promise
					check(`design ${label}: says this op-amp cannot be trusted here (lag ${d.opamp.lagDeg.toFixed(0)} degrees)`, d.opamp.opampOk === false && d.opamp.lagDeg > 25);
				} else {
					check(`design ${label}: starts and regulates`, d.starts === true && d.limiter.regulates === true && d.opamp.opampOk === true, `growth ${Number.isFinite(d.growthPerCycle) ? (100 * d.growthPerCycle).toFixed(1) + ' %' : 'n/a'}`);
					check(`design ${label}: settles within 15 % of the amplitude asked for`, d.limiter.amplitudeActual !== null && rel(d.limiter.amplitudeActual, amplitude, 0.15), `${d.limiter.amplitudeActual?.toFixed(2)} V for ${amplitude}`);
					if (d.limiter.kind === 'diodes') check(`design ${label}: excess gain between 1 and 12 %`, d.loopExcess > 0.01 && d.loopExcess < 0.12, `${(100 * d.loopExcess).toFixed(1)} %`);
				}
				check(`design ${label}: parts in stock ranges`, d.r >= 1000 && d.r <= 1e6 && d.c >= 100e-12 && d.c <= 1e-6);
			}
		}
	}
	const w55 = designOscillator({ topology: 'wien', frequency: 55000, amplitude: 1 });
	check('design: at 55 kHz the textbook Wien would run about 8 % low, which the retune removes', w55.uncompensatedError < -0.06 && w55.uncompensatedError > -0.1 && Math.abs(w55.f0Error) < 0.02, `${(100 * w55.uncompensatedError).toFixed(1)} % before, ${(100 * w55.f0Error).toFixed(2)} % after`);
	const j111 = designOscillator({ topology: 'wien', stabilizer: 'jfet', jfet: 'J111', frequency: 1000, amplitude: 3 });
	check('design: a J111 needs far more than 3 V to be controlled, and says so', j111.limiter.regulates === false && j111.limiter.minAmplitude > 8);
	// The minimum counts the start-up margin: the channel at balance must
	// leave the leg 3 % short of balance with the channel open. Below it the
	// old sizing still "regulated", but at 12.9 V whatever was asked.
	const j111min = j111.limiter.minAmplitude;
	const j111big = designOscillator({ topology: 'wien', stabilizer: 'jfet', jfet: 'J111', frequency: 1000, amplitude: Math.ceil(j111min + 0.5), opampSwing: 15 });
	check(
		`design: the same J111 holds ${Math.ceil(j111min + 0.5)} V, just above its ${j111min.toFixed(1)} V minimum, within 3 %`,
		j111big.limiter.regulates === true && Math.abs(j111big.limiter.amplitudeActual / Math.ceil(j111min + 0.5) - 1) < 0.03,
		`settles at ${j111big.limiter.amplitudeActual?.toFixed(2)} V`
	);
	// The detector's drop is the diode's at its pulse current, about 30
	// times the average (LTspice: 0.48 V at 3.26 V out). With it, and the
	// averaging resistors loading the divider, the generic JFET cannot hold
	// 3 V with a start-up margin: it asks for about 3.1 V, and at 3.5, 4,
	// 5 and 8 V LTspice settles within 0.6 % of the prediction.
	{
		const g3 = designOscillator({ topology: 'wien', stabilizer: 'jfet', frequency: 1000, amplitude: 3 });
		check('design: the generic JFET at 3 V says it needs about 3.1 V', g3.limiter.regulates === false && g3.limiter.minAmplitude > 3 && g3.limiter.minAmplitude < 3.3, `needs ${g3.limiter.minAmplitude?.toFixed(2)} V`);
	}
	// every amplitude the generic JFET accepts lands where it is asked
	{
		let worst = 0;
		let where = '';
		for (const f of [200, 1000, 20000]) {
			for (const a of [2.5, 3, 4, 5, 6, 8, 10]) {
				const d = designOscillator({ topology: 'wien', stabilizer: 'jfet', frequency: f, amplitude: a });
				if (!d.limiter.regulates) continue;
				const err = Math.abs(d.limiter.amplitudeActual / a - 1);
				if (err > worst) {
					worst = err;
					where = `${a} V at ${f} Hz -> ${d.limiter.amplitudeActual.toFixed(2)} V`;
				}
			}
		}
		check('design: the JFET control settles within 6 % of the amplitude asked', worst < 0.06, `worst ${(100 * worst).toFixed(1)} %, ${where}`);
	}
}

/* ------------------------------------------ 5. the LTspice export */
{
	for (const f of [1000, 55000]) {
		for (const t of TOPOLOGIES) {
			const stabs = t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes'];
			for (const s of stabs) {
				const d = designOscillator({ topology: t.id, stabilizer: s, frequency: f, amplitude: f >= 20000 ? 1 : s === 'jfet' ? 4 : 3 });
				const label = `${t.id}/${s} at ${f} Hz`;
				if (s === 'jfet' && f >= 20000) {
					let threw = false;
					try {
						generateNetlist(d);
					} catch {
						threw = true;
					}
					check(`export ${label}: refused, since the AGC could not be sized`, threw);
					continue;
				}
				const cir = generateNetlist(d);
				const asc = generateSchematic(d);
				const wanted = buildElements(d).filter((e) => e.kind !== 'LABEL');
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
					if (g.kind !== w.kind) problems.push(`${w.name} is a ${g.kind}`);
					g.nodes.forEach((net, i) => {
						const node = w.nodes[i];
						if (netOf.has(net) && netOf.get(net) !== node) problems.push(`${w.name}: drawn net joins ${netOf.get(net)} and ${node}`);
						if (nodeOf.has(node) && nodeOf.get(node) !== net) problems.push(`${w.name}: node ${node} split`);
						netOf.set(net, node);
						nodeOf.set(node, net);
						if (!net.startsWith('_n') && net !== node) problems.push(`${w.name}: labelled ${net}, expected ${node}`);
					});
					if ((w.kind === 'R' || w.kind === 'C') && typeof w.value === 'number' && g.value !== spiceValue(w.value)) problems.push(`${w.name} reads ${g.value}`);
					if (w.kind === 'C' && Number.isFinite(w.ic) && g.spiceLine !== `IC=${spiceValue(w.ic)}`) problems.push(`${w.name} initial condition missing`);
				}
				for (const m of new Set(wanted.filter((e) => e.model).map((e) => e.model))) if (!directives.some((l) => l.startsWith(`.model ${m} `))) problems.push(`no .model ${m}`);
				if (!directives.includes('.lib opamp.sub')) problems.push('no .lib opamp.sub');
				for (const line of cir.split('\n').filter((l) => /^\.(tran|four|meas|options|model|param R)/.test(l))) if (!directives.includes(line.trim())) problems.push(`.asc lacks ${line.trim().slice(0, 30)}`);
				check(`export ${label}: the drawn .asc is the .cir, models and directives included`, problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : `${got.length} parts`);
				const issues = audit(asc);
				check(`export ${label}: the .asc is drawn clean`, issues.length === 0, issues.length ? issues.slice(0, 3).map((i) => `${i.kind}: ${i.detail}`).join('; ') : 'no overlap, no crossing');
				check(`export ${label}: the run starts from an initial condition and reports fosc and vpk`, /\.tran .* uic/.test(cir) && /IC=/.test(cir) && /\.meas TRAN fosc/.test(cir) && /\.meas TRAN vpk/.test(cir));
			}
		}
	}
	// values change length with the design (8.012meg, 90.77p): the drawing
	// has to stay clean across the whole range, not just at the points above
	{
		let drawn = 0;
		const messy = [];
		for (const t of TOPOLOGIES) {
			for (const s of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
				for (const f of [10, 1000, 55000, 200000]) {
					for (const a of [0.5, 3, 10]) {
						let asc;
						try {
							asc = generateSchematic(designOscillator({ topology: t.id, stabilizer: s, frequency: f, amplitude: a }));
						} catch {
							continue;
						}
						drawn++;
						const issues = audit(asc);
						if (issues.length) messy.push(`${t.id}/${s} ${f} Hz ${a} V: ${issues[0].kind}: ${issues[0].detail}`);
					}
				}
			}
		}
		check('export: every drawing across the range is clean', messy.length === 0 && drawn > 50, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
	}
	// the same designs with a real op-amp: five-pin symbols on v++ and v--,
	// the rail sources, the part's subcircuit, and the same wiring
	{
		let drawn = 0;
		const messy = [];
		for (const t of TOPOLOGIES) {
			for (const s of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
				for (const f of [1000, 55000]) {
					let d;
					try {
						d = designOscillator({ topology: t.id, stabilizer: s, frequency: f, amplitude: s === 'jfet' ? 4 : 3 });
					} catch {
						continue;
					}
					if (!d) continue;
					const ideal = generateSchematic(d);
					for (const part of ['TL082', 'LM741']) {
						const { problems, issues } = realOpampProblems(ideal, generateSchematic(d, { opamp: part }), part);
						drawn++;
						if (problems.length || issues.length) messy.push(`${t.id}/${s} ${f} Hz ${part}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
					}
				}
			}
		}
		check('export: with a real op-amp, every drawing wired as the ideal one, on v++ and v--, drawn clean', messy.length === 0 && drawn >= 20, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
	}
	const lamp = generateNetlist(designOscillator({ topology: 'wien', stabilizer: 'lamp', frequency: 1000, amplitude: 3 }));
	check('export: the lamp is a resistor that heats up, started hot', /RLAMP nm 0 R=\{Rcold\*\(1\+alpha\*V\(theta\)\)\}/.test(lamp) && /BTH 0 theta I=/.test(lamp) && /CTH theta 0 .* IC=/.test(lamp) && /\.param Rcold=/.test(lamp));
	const agc = generateNetlist(designOscillator({ topology: 'wien', stabilizer: 'jfet', frequency: 1000, amplitude: 4 }));
	check('export: the AGC has its JFET model, the series leg and the averaging resistors', /\.model JX NJF/.test(agc) && /RSER nm jd/.test(agc) && /RX1 jg jd/.test(agc) && /D1 pk vout DX/.test(agc));
	const quad = generateNetlist(designOscillator({ topology: 'quadrature', frequency: 1000, amplitude: 3 }));
	check('export: the quadrature loop has Rn and the divider clamp into integrator 2', /RN vinv n2/.test(quad) && /RD1 vcos zt/.test(quad) && /D1 zt n2 DX/.test(quad) && /\.four .* V\(vcos\)/.test(quad));
}

/* -------------------------------------------- 6. explanations render */
{
	let n = 0;
	let bad = 0;
	for (const f of [1000, 55000]) {
		for (const t of TOPOLOGIES) {
			for (const s of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
				const d = designOscillator({ topology: t.id, stabilizer: s, frequency: f, amplitude: f >= 20000 ? 1 : s === 'jfet' ? 4 : 3 });
				for (const b of [...explainBarkhausen(d), ...explainTopology(d), ...explainStabilizer(d), ...explainOpampLimit(d)]) {
					if (b.type === 'eq') {
						n++;
						try {
							katex.renderToString(b.tex, { throwOnError: true, strict: 'error' });
						} catch (e) {
							bad++;
							console.log('KATEX FAIL', t.id, s, f, b.tex.slice(0, 90), e.message);
						}
					} else if (/undefined|NaN|\bnull\b/.test(b.text)) {
						bad++;
						console.log('TEXT BAD', t.id, s, f, b.text.slice(0, 110));
					}
				}
			}
		}
	}
	check(`explanations: ${n} equations render under strict KaTeX, no placeholders`, bad === 0, `${bad} failures`);
	const src = readFileSync(new URL('../src/routes/(site)/tools/oscillator/formulas/+page.svelte', import.meta.url), 'utf8');
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
	check(`formula sheet: ${found.length} equations render under strict KaTeX`, found.length > 30 && sheetBad === 0, `${sheetBad} failures`);
	for (const needle of ['sqrt{6}', 'A = 29', 'Barkhausen', 'SLOA060', 'describing function', 'R_n', 'wt', 'retune']) {
		check(`formula sheet mentions ${needle}`, src.includes(needle));
	}
}

/* --------------------------------------------- the comparison and verdict */
{
	const rows = compareOscillators({ frequency: 55000, amplitude: 1 });
	const wien = rows.find((r) => r.id === 'wien');
	const ps = rows.find((r) => r.id === 'phaseShift');
	const quad = rows.find((r) => r.id === 'quadrature');
	check('comparison: the Wien bridge asks the least of the op-amp', wien.gain < ps.gain && Math.abs(wien.uncompensatedError) < Math.abs(ps.uncompensatedError), `untuned ${(100 * wien.uncompensatedError).toFixed(1)} % vs ${(100 * ps.uncompensatedError).toFixed(1)} %`);
	check('comparison: at 55 kHz a TL08x rules the single phase shift out, not the Wien', !ps.opampOk && wien.starts && wien.opampOk, `phase shift lag ${ps.lagDeg.toFixed(0)} degrees, Wien ${wien.lagDeg.toFixed(1)}`);
	check('comparison: quadrature gives two outputs and starts', quad.outputs === 'quadrature' && quad.starts);
}

/* ------------------------------------------ parts from the stock the page picks */
{
	const { componentOptions } = await import('../src/lib/stock.js');
	const onList = (v, list) => list.some((x) => Math.abs(x / v - 1) < 1e-9);
	for (const stock of ['lab', 'labR']) {
		const parts = componentOptions(stock);
		const bad = [];
		let built = 0;
		for (const t of TOPOLOGIES) {
			for (const stabilizer of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
				for (const [frequency, amplitude] of [[1000, 3], [55000, 1], [200, 5]]) {
					const d = designOscillator({ topology: t.id, stabilizer, frequency, amplitude, ...parts });
					if (!d) continue;
					built++;
					const p = d.parts ?? {};
					// with diodes, rf is Rf1 + Rf2, not a part of its own
					const resistors = { r: d.r, rg: d.rg, rf1: p.rf1, rf2: p.rf2, rf: p.rf1 ? null : p.rf, rSeries: p.rSeries, ra: p.ra, rb: p.rb, rx: p.rx, rn: p.rn, rd1: p.rd1, rd2: p.rd2 };
					for (const [k, v] of Object.entries(resistors)) {
						if (v && !onList(v, parts.resistorSeries)) bad.push(`${t.id}/${stabilizer} ${frequency} Hz ${k} ${v}`);
					}
					if (parts.capacitors) {
						for (const [k, v] of Object.entries({ c: d.c, cDet: p.cDet })) if (v && !onList(v, parts.capacitors)) bad.push(`${t.id}/${stabilizer} ${frequency} Hz ${k} ${v}`);
					}
				}
			}
		}
		check(`stock: every oscillator part comes from the ${stock} list, every topology and control`, bad.length === 0 && built > 10, bad.length ? bad.slice(0, 4).join('; ') : `${built} designs`);
	}
	// the default is E24 and the usual capacitors, the same parts as with the option spelled out
	const same = JSON.stringify(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3 })) === JSON.stringify(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3, resistorSeries: 'E24', capacitors: null }));
	check('stock: E24 by default, the same oscillator with the option spelled out', same);

	/* ---- two resistors in series (the stock picker's option, pairedResistor) */
	const E24_PARTS = { resistorSeries: 'E24', capacitors: null };
	const LAB_PARTS = { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors };
	const pairCases = [];
	for (const t of TOPOLOGIES) {
		for (const stabilizer of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
			for (const [frequency, amplitude] of [[1000, 3], [55000, 1], [200, 5], [7300, 4], [20000, 3]]) pairCases.push({ topology: t.id, stabilizer, frequency, amplitude });
		}
	}
	const json = (d) => JSON.stringify(d);

	// off, nothing moves: the option spelled out as false is the oscillator
	// without it, on E24 and on the lab list, and a series never pairs
	{
		const moved = [];
		for (const c of pairCases) {
			const tag = `${c.topology}/${c.stabilizer} ${c.frequency} Hz`;
			const e24 = json(designOscillator({ ...c, ...E24_PARTS }));
			if (e24 !== json(designOscillator({ ...c, ...E24_PARTS, pairs: false }))) moved.push(`E24 ${tag}`);
			if (e24 !== json(designOscillator({ ...c, ...E24_PARTS, pairs: true }))) moved.push(`E24 with pairs on ${tag}`);
			if (json(designOscillator({ ...c, ...LAB_PARTS })) !== json(designOscillator({ ...c, ...LAB_PARTS, pairs: false }))) moved.push(`lab ${tag}`);
		}
		check('pairs: off, every design is the one without the option, on E24 and on the lab list; E24 never pairs', moved.length === 0, moved.length ? moved.slice(0, 3).join('; ') : `${pairCases.length} cases`);
	}
	// and these are still the parts, frequency and amplitude they had before
	// the option existed (values to six figures)
	{
		const golden = [
			['E24|wien|diodes|1000|3|3000000', '16000 1e-8 10000 15400 6200 - - - - - f0 993.07 A 2.9338'],
			['E24|wien|jfet|1000|4|3000000', '16000 1e-8 10000 - - 20000 9100 147000 - - f0 993.24 A 4.0076'],
			['E24|phaseShift|diodes|1000|3|3000000', '4300 1.5e-8 4300 110000 18000 - - - - - f0 1005.19 A 3.0415'],
			['E24|bubba|diodes|55000|1|3000000', '8200 3.3e-10 8200 23200 15000 - - - - - f0 55036.59 A 1.0063'],
			['E24|quadrature|diodes|1000|3|3000000', '16000 1e-8 10000 - - - - 10000 510000 6800 f0 994.23 A 3.0497'],
			['lab|wien|diodes|1000|3|3000000', '33000 4.7e-9 10000 15000 7500 - - - - - f0 1024.30 A 2.7540'],
			['lab|wien|lamp|1000|3|3000000', '33000 4.7e-9 10000 - - 22000 - - - - f0 1024.57 A 3.0000'],
			['lab|wien|jfet|1000|4|3000000', '33000 4.7e-9 10000 - - 22000 10000 100000 - - f0 1024.57 A 3.9327'],
			['lab|bufferedPhaseShift|diodes|1000|3|3000000', '2000 4.7e-8 2000 15000 3000 - - - - - f0 976.23 A 8.9913'],
			['lab|quadrature|diodes|1000|3|3000000', '33000 4.7e-9 10000 - - - - 10000 1000000 7500 f0 1025.62 A 3.0102'],
			['lab|wien|diodes|55000|1|3000000', '7500 3.3e-10 10000 8200 15000 - - - - - f0 56859.32 A 0.9704'],
			['lab10u|wien|diodes|50000|0.2|4000000', '3000 1e-9 10000 2200 22000 - - - - - f0 47467.99 A 0.6017']
		];
		const stocks = { E24: E24_PARTS, lab: LAB_PARTS, lab10u: { resistorSeries: LAB_KIT.resistors, capacitors: [...LAB_KIT.capacitors, 10e-6] } };
		const six = (v) => (v == null ? '-' : String(Number(v.toPrecision(6))));
		const fingerprint = (d) => {
			const p = d.parts;
			return `${[d.r, d.c, d.rg, p.rf1, p.rf2, p.rf1 ? null : p.rf, p.rSeries, p.ra, p.rn, p.rd1].map(six).join(' ')} f0 ${d.f0.toFixed(2)} A ${d.limiter.amplitudeActual == null ? '-' : d.limiter.amplitudeActual.toFixed(4)}`;
		};
		const changed = [];
		for (const [key, want] of golden) {
			const [stock, topology, stabilizer, frequency, amplitude, gbw] = key.split('|');
			const opamp = gbw === '4000000' ? { gbw: 4e6, slewRate: 16e6, opampSwing: 13.5 } : {};
			const got = fingerprint(designOscillator({ topology, stabilizer, frequency: Number(frequency), amplitude: Number(amplitude), ...opamp, ...stocks[stock], pairs: false }));
			if (got !== want) changed.push(`${key}: ${got}`);
		}
		check('pairs: off, the designs are the ones from before the option (E24 and lab, every topology)', changed.length === 0, changed.length ? changed.slice(0, 2).join('; ') : `${golden.length} fingerprints`);
	}

	// on, with the lab list: every resistor is a value on hand or two of them
	// in series, and the design is never worse than with one resistor per
	// part (designOscillator keeps that one otherwise): it starts and holds
	// its amplitude whenever that one does, and where both do the same it
	// lands no further from the frequency, |ln(f0 / f)|, give or take
	// PAIRS_FREQUENCY_SLACK (0.05 %)
	{
		const stray = [];
		const worse = [];
		let built = 0;
		let withPairs = 0;
		let closer = 0;
		for (const stock of ['lab', 'labR']) {
			const parts = componentOptions(stock, '', '', true);
			const list = parts.resistorSeries;
			for (const c of pairCases) {
				const tag = `${stock} ${c.topology}/${c.stabilizer} ${c.frequency} Hz`;
				const on = designOscillator({ ...c, ...parts });
				const off = designOscillator({ ...c, ...parts, pairs: false });
				if (!on) {
					if (off) worse.push(`${tag}: no design with pairs`);
					continue;
				}
				built++;
				const p = on.parts;
				let paired = false;
				for (const [k, v] of Object.entries({ r: on.r, rg: on.rg, rf1: p.rf1, rf2: p.rf2, rf: p.rf1 ? null : p.rf, rSeries: p.rSeries, ra: p.ra, rb: p.rb, rx: p.rx, rn: p.rn, rd1: p.rd1, rd2: p.rd2 })) {
					if (!v) continue;
					if (seriesPair(v, list)) paired = true;
					else if (!onList(v, list)) stray.push(`${tag} ${k} ${v}`);
				}
				if (parts.capacitors) {
					for (const [k, v] of Object.entries({ c: on.c, cDet: p.cDet })) if (v && !onList(v, parts.capacitors)) stray.push(`${tag} ${k} ${v}`);
				}
				if (paired) withPairs++;
				if (!off) continue;
				const s = [off.starts, off.limiter.regulates !== false];
				const q = [on.starts, on.limiter.regulates !== false];
				const miss = (d) => Math.abs(Math.log(d.f0 / c.frequency));
				if ((s[0] && !q[0]) || (s[1] && !q[1])) worse.push(`${tag}: starts ${s[0]} -> ${q[0]}, holds ${s[1]} -> ${q[1]}`);
				else if (q[0] === s[0] && q[1] === s[1] && miss(on) > miss(off) + PAIRS_FREQUENCY_SLACK) worse.push(`${tag}: ${(100 * miss(off)).toFixed(3)} % -> ${(100 * miss(on)).toFixed(3)} %`);
				if (miss(on) < miss(off) - 1e-6) closer++;
			}
		}
		check('pairs: on with the lab list, every resistor is a value on hand or two of them in series', stray.length === 0 && withPairs > 20, stray.length ? stray.slice(0, 3).join('; ') : `${withPairs} of ${built} designs use a pair`);
		check('pairs: never worse than one resistor per part: starts and holds whenever it does, and no further from the frequency', worse.length === 0 && closer > 10, worse.length ? worse.slice(0, 3).join('; ') : `${closer} of ${built} land closer`);
	}

	// the case that asked for it: a 50 kHz Wien bridge on the lab kit (plus a
	// 10 uF capacitor) takes R = 3 k and runs 5 % low; with two in series R is
	// 2.2 k + 680 on the same capacitor and lands within 2 %
	const known = { topology: 'wien', stabilizer: 'diodes', frequency: 50000, amplitude: 0.2, gbw: 4e6, slewRate: 16e6, opampSwing: 13.5, resistorSeries: LAB_KIT.resistors, capacitors: [...LAB_KIT.capacitors, 10e-6] };
	const knownSingle = designOscillator(known);
	const knownPaired = designOscillator({ ...known, pairs: true });
	check('pairs: the 50 kHz Wien on the lab kit takes R = 3 k and lands about 5 % low with one resistor per part', knownSingle.r === 3000 && knownSingle.f0Error < -0.04 && knownSingle.f0Error > -0.06, `${(100 * knownSingle.f0Error).toFixed(2)} %`);
	const knownPair = seriesPair(knownPaired.r, LAB_KIT.resistors);
	check(
		'pairs: with two in series it takes 2.88 k (2.2 k + 680) on the same capacitor and lands within 2 %',
		knownPaired.r === 2880 && knownPair?.[0] === 2200 && knownPair?.[1] === 680 && knownPaired.c === knownSingle.c && Math.abs(knownPaired.f0Error) < 0.02 && knownPaired.starts && knownPaired.limiter.regulates,
		`R ${knownPaired.r} (${knownPair?.join(' + ')}), C ${knownPaired.c}, ${(100 * knownPaired.f0Error).toFixed(2)} %`
	);

	// the export: each pair named in the header, the sum in the netlist and on
	// the drawing, and the drawing still the netlist, drawn clean
	{
		const notes = pairNotes(knownPaired);
		const cir = generateNetlist(knownPaired);
		const asc = generateSchematic(knownPaired);
		check(
			'pairs: the .cir names each pair in its header and uses the sum below',
			notes.some((l) => l.startsWith('RS, RP = 2.2k + 680 in series, each')) && notes.every((l) => cir.includes(`\n* ${l}\n`)) && /^RS vout ws 2\.88k$/m.test(cir) && /^RP wp 0 2\.88k$/m.test(cir),
			notes.join(' | ')
		);
		check('pairs: the .asc carries the same lines under the drawing', notes.every((l) => asc.includes(l.replace('their sum is used below', 'the drawing above carries their sum'))));
		const pairLine = / = [\d.]+(k|meg)? \+ [\d.]+(k|meg)? in series/;
		check('pairs: a design without a pair has no such line', !pairLine.test(generateNetlist(designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3, ...LAB_PARTS }))) && !pairLine.test(generateNetlist(designOscillator({ ...known, pairs: false }))));
		const problems = [];
		let drawn = 0;
		for (const c of pairCases) {
			const d = designOscillator({ ...c, ...LAB_PARTS, pairs: true });
			if (!d?.pairs) continue;
			// a control that could not be sized has nothing to export
			let a;
			try {
				if (!pairNotes(d).length) continue;
				a = generateSchematic(d);
			} catch {
				continue;
			}
			drawn++;
			const tag = `${c.topology}/${c.stabilizer} ${c.frequency} Hz`;
			const { elements: got, clashes, dangling } = parseSchematic(a);
			if (clashes.length || dangling.length) problems.push(`${tag}: ${[...clashes, ...dangling][0]}`);
			for (const w of buildElements(d).filter((e) => (e.kind === 'R' || e.kind === 'C') && typeof e.value === 'number')) {
				const g = got.find((e) => e.name === w.name);
				if (!g || g.value !== spiceValue(w.value)) problems.push(`${tag}: ${w.name} reads ${g?.value}`);
			}
			const issues = audit(a);
			if (issues.length) problems.push(`${tag}: ${issues[0].kind}: ${issues[0].detail}`);
		}
		check('pairs: every drawing with a pair shows the sums, wired as the netlist and drawn clean', problems.length === 0 && drawn > 10, problems.length ? problems.slice(0, 3).join('; ') : `${drawn} drawings`);
	}
}

/* ------------------------------ the amplitude that comes out, not the one asked for */
{
	const { componentOptions } = await import('../src/lib/stock.js');
	const lab = componentOptions('lab');
	const labPairs = componentOptions('lab', '', '', true);

	// the op-amp's swing and slew are judged on the amplitude the limiter holds
	const e24 = designOscillator({ topology: 'wien', frequency: 1000, amplitude: 3 });
	check(
		'amplitude: the slew and the tap follow the amplitude the limiter holds',
		e24.amplitudeHeld === e24.limiter.amplitudeActual && Math.abs(e24.opamp.slewNeeded - 2 * Math.PI * e24.f0 * e24.amplitudeHeld) < 1e-9 && e24.tapAmplitude === e24.amplitudeHeld,
		`${e24.amplitudeHeld.toFixed(3)} V held for 3 V asked`
	);
	check('amplitude: a limiter within a tenth of the amplitude asked gets no remark', amplitudeRemark(e24) === null && Math.abs(e24.amplitudeHeld / 3 - 1) <= AMPLITUDE_TOLERANCE);

	// under what the diodes can hold: the design says where it settles, and why
	const low = designOscillator({ topology: 'wien', frequency: 50000, amplitude: 0.2, gbw: 4e6, slewRate: 16e6, opampSwing: 13.5 });
	const lowRemark = amplitudeRemark(low);
	check(
		'amplitude: 0.2 V asked of a diode-limited Wien bridge is flagged as under what the diodes hold',
		low.limiter.sized === false && lowRemark?.kind === 'floor' && lowRemark.level === 'warn' && low.amplitudeHeld > 0.4 && /200 mV/.test(lowRemark.text) && lowRemark.text.includes(`${(1000 * low.amplitudeHeld).toFixed(0)} mV`),
		lowRemark?.text
	);

	// a short list of parts can leave the limiter far from the amplitude asked
	const off = designOscillator({ topology: 'wien', frequency: 1000, amplitude: 5, ...lab });
	const offRemark = amplitudeRemark(off);
	check(
		'amplitude: rounded parts that move it more than a tenth are flagged, with the exact values and the two-in-series hint',
		offRemark?.kind === 'rounding' && Math.abs(off.amplitudeHeld / 5 - 1) > AMPLITUDE_TOLERANCE && /Rf1 = .* and Rf2 = .* would land on it; two resistors in series get closer\.$/.test(offRemark.text),
		offRemark?.text
	);
	const offPaired = designOscillator({ topology: 'wien', frequency: 1000, amplitude: 5, ...labPairs });
	check('amplitude: the same oscillator with two in series lands within a tenth and gets no remark', amplitudeRemark(offPaired) === null && Math.abs(offPaired.amplitudeHeld / 5 - 1) <= AMPLITUDE_TOLERANCE, `${offPaired.amplitudeHeld.toFixed(2)} V`);

	// past the op-amp's swing the limiter holds nothing: the output clips
	const clip = designOscillator({ topology: 'phaseShift', frequency: 1000, amplitude: 0.4, ...lab });
	const clipRemark = amplitudeRemark(clip);
	check(
		'amplitude: a limiter that would only take hold past the rails fails the swing check and is flagged as clipping',
		clip.amplitudeHeld > clip.opamp.opampSwing && clip.opamp.swingOk === false && clipRemark?.kind === 'clips' && clipRemark.level === 'bad',
		`${clip.amplitudeHeld.toFixed(1)} V against ${clip.opamp.opampSwing} V`
	);
	const tooMuch = designOscillator({ topology: 'wien', frequency: 1000, amplitude: 12 });
	check('amplitude: more asked than the op-amp swings is flagged, with the advice to ask for less', tooMuch.opamp.swingOk === false && /Ask for a smaller amplitude\.$/.test(amplitudeRemark(tooMuch)?.text ?? ''));

	// the lamp and the JFET control have their own notes
	check(
		'amplitude: no remark for a lamp or a JFET control',
		amplitudeRemark(designOscillator({ topology: 'wien', stabilizer: 'lamp', frequency: 1000, amplitude: 3 })) === null &&
			amplitudeRemark(designOscillator({ topology: 'wien', stabilizer: 'jfet', frequency: 1000, amplitude: 3 })) === null
	);

	// every remark is site text: no dash, no second person, and it names both amplitudes
	{
		const bad = [];
		let seen = 0;
		const kinds = new Set();
		for (const parts of [{}, lab, labPairs]) {
			for (const t of TOPOLOGIES) {
				for (const frequency of [50, 1000, 20000, 55000]) {
					for (const amplitude of [0.1, 0.3, 1, 3, 8, 12]) {
						const d = designOscillator({ topology: t.id, stabilizer: 'diodes', frequency, amplitude, ...parts });
						const r = d && amplitudeRemark(d);
						if (!r) continue;
						seen++;
						kinds.add(r.kind);
						if (/[–—]|\byou\b|\byour\b|undefined|NaN/i.test(r.text)) bad.push(`${t.id} ${frequency} ${amplitude}: ${r.text}`);
						if (r.level !== (r.kind === 'clips' ? 'bad' : 'warn')) bad.push(`${t.id} ${frequency} ${amplitude}: level ${r.level} for ${r.kind}`);
						// the swing check and the remark agree
						if ((r.kind === 'clips') !== !d.opamp.swingOk) bad.push(`${t.id} ${frequency} ${amplitude}: ${r.kind} with swingOk ${d.opamp.swingOk}`);
					}
				}
			}
		}
		check('amplitude: the remarks read cleanly and agree with the swing check across topologies and stocks', bad.length === 0 && kinds.size === 3, bad.length ? bad.slice(0, 3).join(' | ') : `${seen} remarks, ${[...kinds].join(', ')}`);
	}

	// two in series never trade a held amplitude for a clipped one
	{
		const worse = [];
		let compared = 0;
		for (const t of TOPOLOGIES) {
			for (const frequency of [50, 1000, 5000, 55000]) {
				for (const amplitude of [0.3, 1, 3, 5, 8]) {
					const single = designOscillator({ topology: t.id, stabilizer: 'diodes', frequency, amplitude, ...lab });
					const paired = designOscillator({ topology: t.id, stabilizer: 'diodes', frequency, amplitude, ...labPairs });
					if (!single || !paired) continue;
					compared++;
					const holds = (d) => d.limiter.regulates !== false && d.opamp.swingOk;
					if (holds(single) && !holds(paired)) worse.push(`${t.id} ${frequency} Hz ${amplitude} V`);
				}
			}
		}
		check('amplitude: with two in series no oscillator clips where the single-part one holds', worse.length === 0 && compared > 50, worse.length ? worse.slice(0, 4).join('; ') : `${compared} designs`);
	}
}

console.log(fails === 0 ? 'oscillator checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
