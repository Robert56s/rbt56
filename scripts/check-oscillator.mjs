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
// 8. A limit on the pairs (up to N): never more than N, each R counted
//    where it sits; N at or above the count of pairs where they help is
//    that design, N = 0 single parts; the measure never worsens as N
//    grows below the count; each limited design is the real design of the
//    whitelist it names; the exports and sentences follow the parts kept.
//    The whitelists tried are every subset of the resistors that may pair,
//    not only of the pairs where they help: the result is the one an
//    exhaustive search over them finds.
// 9. The Python download ({stem}.py, src/lib/oscillator/python) on a matrix
//    of designs: its text and its run, its results against the page's, its
//    own parts against its rule written again here, its check of both sets
//    against the library's evaluation, its guards (needs Python 3.8 or
//    newer as `python`; about 80 s of the whole).
// Exits non-zero on any failure. LTspice itself is run by check-ltspice.mjs.

import { readFileSync } from 'node:fs';
import katex from 'katex';
import { LAB_KIT, pairSubsets, seriesPair } from '../src/lib/filter/eseries.js';
import { AMPLITUDE_TOLERANCE, amplitudeRemark, explainBarkhausen, explainOpampLimit, explainStabilizer, explainTopology, pairLimitNote } from '../src/lib/oscillator/explain.js';
import { DIODES, feedbackLimiterAmplitude } from '../src/lib/oscillator/limiter.js';
import { openLoop, retune, solveBalance, solvePole, zeroPhase } from '../src/lib/oscillator/loop.js';
import { buildElements, generateNetlist, generateSchematic, pairNotes } from '../src/lib/oscillator/spice.js';
import { compareOscillators, designOscillator, oscillatorMeasure, oscillatorPairCount, oscillatorPairNames, pairCost, PAIR_PARTS, PAIRS_FREQUENCY_SLACK, solveLadder, TOPOLOGIES } from '../src/lib/oscillator/topologies.js';
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

/* ------------------------------ a limit on the number of pairs (up to N) */
// The stock picker's "Up to N pairs": the design with pairs where they help
// when it holds N or fewer, otherwise the subset of its pairs that misses
// least by oscillatorMeasure. R counts once for each resistor it is (both
// Wien arms, both integrators, every ladder section), so the count is the
// resistors on the board built from two in series.
{
	const { componentOptions } = await import('../src/lib/stock.js');
	const json = (d) => JSON.stringify(d);
	const strip = (d) => {
		if (!d) return d;
		const { pairLimit, ...rest } = d;
		return rest;
	};
	const SHORT_PARTS = { resistorSeries: [1000, 2200, 4700, 10000, 22000, 47000, 100000], capacitors: [1e-9, 10e-9, 100e-9] };
	const stocks = { lab: componentOptions('lab', '', '', true), labR: componentOptions('labR', '', '', true), short: { ...SHORT_PARTS, pairs: true } };
	const limitCases = [];
	for (const t of TOPOLOGIES) {
		for (const stabilizer of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
			for (const [frequency, amplitude] of [[1000, 3], [55000, 1], [200, 5], [7300, 4], [20000, 3]]) limitCases.push({ topology: t.id, stabilizer, frequency, amplitude });
		}
	}
	// the resistors of the exported circuit that are two in series: what a
	// limit counts, read off the netlist rather than off the designer's names
	const boardPairs = (d) => {
		try {
			return buildElements(d).filter((e) => e.kind === 'R' && typeof e.value === 'number' && seriesPair(e.value, d.resistorSeries)).length;
		} catch {
			return null;
		}
	};
	const plainText = (text) => !/[–—]|\byou\b|\byour\b|undefined|NaN|\bnull\b/i.test(text);

	// no limit, or a limit where nothing can pair, changes nothing
	{
		const moved = [];
		for (const c of limitCases) {
			const tag = `${c.topology}/${c.stabilizer} ${c.frequency} Hz`;
			const lab = stocks.lab;
			if (json(designOscillator({ ...c, ...lab, pairLimit: null })) !== json(designOscillator({ ...c, ...lab }))) moved.push(`null ${tag}`);
			if (json(designOscillator({ ...c, ...lab, pairs: false, pairLimit: 1 })) !== json(designOscillator({ ...c, ...lab, pairs: false }))) moved.push(`pairs off ${tag}`);
			if (json(designOscillator({ ...c, resistorSeries: 'E24', capacitors: null, pairs: true, pairLimit: 1 })) !== json(designOscillator({ ...c, resistorSeries: 'E24', capacitors: null }))) moved.push(`E24 ${tag}`);
		}
		check('pair limit: none (null), pairs off or a series instead of a list leave every design as it was', moved.length === 0, moved.length ? moved.slice(0, 3).join('; ') : `${limitCases.length} cases each`);
	}

	// the designers take a whitelist: every name is pairs on, none is pairs off
	{
		const moved = [];
		const every = PAIR_PARTS.map((p) => p.name);
		for (const c of limitCases) {
			const tag = `${c.topology}/${c.stabilizer} ${c.frequency} Hz`;
			const parts = stocks.lab;
			const on = json(designOscillator({ ...c, ...parts, pairs: true }));
			if (json(designOscillator({ ...c, ...parts, pairs: every })) !== on) moved.push(`array ${tag}`);
			if (json(designOscillator({ ...c, ...parts, pairs: new Set(every) })) !== on) moved.push(`Set ${tag}`);
			if (json(designOscillator({ ...c, ...parts, pairs: [] })) !== json(designOscillator({ ...c, ...parts, pairs: false }))) moved.push(`empty ${tag}`);
		}
		check('pair limit: a whitelist of every name is pairs on, an empty one pairs off, as an array or a Set', moved.length === 0, moved.length ? moved.slice(0, 3).join('; ') : `${limitCases.length} cases`);
	}

	// every N from 0 to one past the count of the design with pairs where
	// they help, on three lists, with the exports and the words of each
	{
		const over = [];
		const notFull = [];
		const notSingle = [];
		const rising = [];
		const unreal = [];
		const harm = [];
		const stray = [];
		const counted = [];
		const exported = [];
		const words = [];
		let limited = 0;
		let keeping = 0;
		let cases = 0;
		let nulls = 0;
		let drawn = 0;
		for (const [sname, parts] of Object.entries(stocks)) {
			const list = parts.resistorSeries;
			for (const c of limitCases) {
				const tag = `${sname} ${c.topology}/${c.stabilizer} ${c.frequency} Hz`;
				const full = designOscillator({ ...c, ...parts });
				const single = designOscillator({ ...c, ...parts, pairs: false });
				if (!full) continue;
				cases++;
				const total = oscillatorPairCount(full);
				const fullBoard = boardPairs(full);
				if (fullBoard !== null && fullBoard !== total) counted.push(`${tag}: ${fullBoard} on the board, ${total} counted`);
				let previous = Infinity;
				for (let n = 0; n <= total + 1; n++) {
					const d = designOscillator({ ...c, ...parts, pairLimit: n });
					const at = `${tag} N=${n}`;
					if (!d) {
						// nothing within the limit can be built: one resistor per part cannot either
						nulls++;
						if (single || n >= total) unreal.push(`${at}: no design`);
						previous = Infinity;
						continue;
					}
					const count = oscillatorPairCount(d);
					const board = boardPairs(d);
					if (count > n) over.push(`${at}: ${count} pairs`);
					if (board !== null && board !== count) counted.push(`${at}: ${board} on the board, ${count} counted`);
					if (n >= total) {
						if (json(d) !== json(full)) notFull.push(at);
						continue;
					}
					limited++;
					if (count > 0) keeping++;
					if (!d.pairLimit || d.pairLimit.count !== count || d.pairLimit.fullCount !== total || d.pairLimit.limit !== n) unreal.push(`${at}: ${json(d.pairLimit)}`);
					if (n === 0 && json(strip(d)) !== json(single)) notSingle.push(at);
					// the measure never gets worse as N grows, below the count
					const m = oscillatorMeasure(d, c);
					if (m > previous * (1 + 1e-9)) rising.push(`${at}: ${previous.toExponential(3)} -> ${m.toExponential(3)}`);
					previous = m;
					// a real design: the whitelist it names gives it back, and its
					// figures are those of its parts
					const lim = d.pairLimit ?? { allowed: [], kept: [], dropped: [] };
					const rebuilt = lim.allowed.length ? designOscillator({ ...c, ...parts, pairs: lim.allowed }) : single;
					if (json(rebuilt) !== json(strip(d))) unreal.push(`${at}: not the design of [${lim.allowed}]`);
					if (!lim.kept.every((name) => lim.allowed.includes(name))) unreal.push(`${at}: kept ${lim.kept} outside [${lim.allowed}]`);
					// dropped: the pairs of the full design given up; added: the pairs it leaves single that this one gains
					const fullNames = oscillatorPairNames(full);
					if (json(lim.dropped) !== json(fullNames.filter((x) => !lim.kept.includes(x))) || json(lim.added ?? []) !== json(lim.kept.filter((x) => !fullNames.includes(x)))) unreal.push(`${at}: dropped and added are not the pairs of the full design given up and gained`);
					const topo = TOPOLOGIES.find((t) => t.id === d.topology);
					if (!rel(d.fIdeal, topo.k / (2 * Math.PI * d.r * d.c), 1e-12)) unreal.push(`${at}: fIdeal is not k / (2 pi R C)`);
					if (d.limiter.kind === 'diodes') {
						const p = d.parts;
						const wien = d.topology === 'wien';
						const start = wien ? 1 + (p.rf1 + p.rf2) / d.rg : (p.rf1 + p.rf2) / d.rg;
						const g = d.requiredGain;
						const a = feedbackLimiterAmplitude({ rf1: p.rf1, rf2: p.rf2, rt: wien ? (g - 1) * d.rg : g * d.rg, fraction: wien ? (g - 1) / g : 1, diode: DIODES[d.diode] });
						if (!rel(d.startGain, start, 1e-12) || (a === null ? d.limiter.amplitudeActual !== null : !rel(d.limiter.amplitudeActual, a, 1e-12))) unreal.push(`${at}: start gain or amplitude not those of Rf1 and Rf2`);
					}
					// never worse than one resistor per part, the rule pairs where they help keep
					if (single) {
						const s = [single.starts, single.limiter.regulates !== false && single.opamp.swingOk];
						const q = [d.starts, d.limiter.regulates !== false && d.opamp.swingOk];
						const miss = (x) => Math.abs(Math.log(x.f0 / c.frequency));
						if ((s[0] && !q[0]) || (s[1] && !q[1])) harm.push(`${at}: starts ${s[0]} -> ${q[0]}, holds ${s[1]} -> ${q[1]}`);
						else if (q[0] === s[0] && q[1] === s[1] && miss(d) > miss(single) + PAIRS_FREQUENCY_SLACK) harm.push(`${at}: ${(100 * miss(single)).toFixed(3)} % -> ${(100 * miss(d)).toFixed(3)} %`);
					}
					const p = d.parts;
					for (const [k, v] of Object.entries({ r: d.r, rg: d.rg, rf1: p.rf1, rf2: p.rf2, rf: p.rf1 ? null : p.rf, rSeries: p.rSeries, ra: p.ra, rb: p.rb, rx: p.rx, rn: p.rn, rd1: p.rd1, rd2: p.rd2 })) {
						if (v && !seriesPair(v, list) && !list.some((x) => Math.abs(x / v - 1) < 1e-9)) stray.push(`${at} ${k} ${v}`);
					}
					// the words: the limit's sentence, and the amplitude remark never
					// asks for pairs that are on
					const note = pairLimitNote(d);
					if (!note || !plainText(note)) words.push(`${at}: ${note}`);
					const remark = amplitudeRemark(d);
					if (remark && (!plainText(remark.text) || /two resistors in series get closer/.test(remark.text))) words.push(`${at}: ${remark.text}`);
					// the exports (N = 0 is single parts: nothing more to see there)
					if (n === 0) continue;
					let cir;
					let asc;
					try {
						cir = generateNetlist(d);
						asc = generateSchematic(d);
					} catch {
						continue;
					}
					drawn++;
					const lines = pairNotes(d);
					const named = lines.flatMap((l) => l.split(' = ')[0].split(', ')).sort();
					const wanted = buildElements(d).filter((e) => e.kind === 'R' && typeof e.value === 'number' && seriesPair(e.value, list)).map((e) => e.name).sort();
					if (json(named) !== json(wanted)) exported.push(`${at}: notes name ${named} for ${wanted}`);
					if (!cir.includes(`* ${note}\n`)) exported.push(`${at}: the .cir lacks the limit line`);
					if (!lines.every((l) => asc.includes(l.replace('their sum is used below', 'the drawing above carries their sum')))) exported.push(`${at}: the .asc lacks a pair line`);
					const { elements: got, clashes, dangling } = parseSchematic(asc);
					if (clashes.length || dangling.length) exported.push(`${at}: ${[...clashes, ...dangling][0]}`);
					for (const w of buildElements(d).filter((e) => (e.kind === 'R' || e.kind === 'C') && typeof e.value === 'number')) {
						const g = got.find((e) => e.name === w.name);
						if (!g || g.value !== spiceValue(w.value)) exported.push(`${at}: ${w.name} reads ${g?.value}`);
					}
					const issues = audit(asc);
					if (issues.length) exported.push(`${at}: ${issues[0].kind}: ${issues[0].detail}`);
				}
			}
		}
		check('pair limit: never more pairs than N, every R counted where it sits, the count the netlist shows', over.length === 0 && counted.length === 0 && limited > 100, over.length || counted.length ? [...over, ...counted].slice(0, 3).join('; ') : `${limited} limited designs of ${cases} oscillators, ${keeping} keeping some pairs`);
		check('pair limit: N at or above the count of pairs where they help gives exactly that design', notFull.length === 0, notFull.length ? notFull.slice(0, 3).join('; ') : `${2 * cases} designs`);
		check('pair limit: N = 0 is one resistor per part', notSingle.length === 0, notSingle.slice(0, 3).join('; '));
		check('pair limit: the measure never gets worse as N grows, up to the count', rising.length === 0, rising.slice(0, 3).join('; '));
		check('pair limit: each limited design is the real design of the whitelist it names, its figures those of its parts', unreal.length === 0, unreal.length ? unreal.slice(0, 3).join('; ') : `${limited} designs rebuilt${nulls ? `, ${nulls} with nothing buildable inside the limit, as with single parts` : ''}`);
		check('pair limit: never worse than one resistor per part (starts, holds, frequency)', harm.length === 0, harm.slice(0, 3).join('; '));
		check('pair limit: every resistor a value on hand or two of them in series', stray.length === 0, stray.slice(0, 3).join('; '));
		check('pair limit: the exports name the pairs kept, carry the limit line, and the drawings stay the netlist, drawn clean', exported.length === 0 && drawn > 50, exported.length ? exported.slice(0, 3).join('; ') : `${drawn} limited exports`);
		check('pair limit: the sentences read cleanly and never ask for pairs that are on', words.length === 0, words.slice(0, 2).join(' | '));
	}

	// the case to read: a 1 kHz, 3 V Wien bridge on the lab kit holds R (both
	// arms), Rf1 and Rf2 as pairs, 4 in all; each step of N buys the next best
	{
		const c = { topology: 'wien', stabilizer: 'diodes', frequency: 1000, amplitude: 3, ...stocks.lab };
		const at = [0, 1, 2, 3, 4].map((n) => designOscillator({ ...c, pairLimit: n }));
		const names = at.map((d) => oscillatorPairNames(d).join('+') || '-');
		const measures = at.map((d) => oscillatorMeasure(d, c));
		check(
			'pair limit: Wien 1 kHz on the lab kit keeps nothing, Rf1, R, R and Rf1, then all of R, Rf1 and Rf2 as N goes 0 to 4',
			names.join(' ') === '- Rf1 R R+Rf1 R+Rf1+Rf2' && at[1].parts.rf1 === 15510 && at[1].r === 33000 && at[2].r === 33680 && measures.every((m, i) => i === 0 || m < measures[i - 1]),
			names.map((n, i) => `${i}: ${n} ${measures[i].toFixed(3)}`).join(', ')
		);
		const cir1 = generateNetlist(at[1]);
		check(
			'pair limit: its N = 1 netlist names the one pair kept and says which went back to single parts',
			/^\* RF1 = 15k \+ 510 in series \(their sum is used below\)$/m.test(cir1) && !/^\* RS, RP = /m.test(cir1) && cir1.includes(`* ${pairLimitNote(at[1])}\n`) && pairLimitNote(at[1]) === 'With at most 1 pair, Rf1 stays two resistors in series; R (both arms) and Rf2 are single parts.',
			pairLimitNote(at[1])
		);
		check('pair limit: the design with no limit says nothing of one', pairLimitNote(at[4]) === null && !generateNetlist(at[4]).includes('With at most'));
		// the page asks again for its comparison table: the same design, at once
		check('pair limit: the same limited design asked again comes from the memo', designOscillator({ ...c, pairLimit: 1 }) === at[1]);
	}

	// a limit that gives up a pair on the amplitude's resistors says a higher
	// one gets closer: a 200 Hz, 3 V phase shift on the lab kit with one pair
	{
		const one = designOscillator({ topology: 'phaseShift', stabilizer: 'diodes', frequency: 200, amplitude: 3, ...stocks.lab, pairLimit: 1 });
		const r = amplitudeRemark(one);
		check(
			'pair limit: the amplitude remark of a design that gave up Rf2 asks for more pairs, not for pairs',
			json(one.pairLimit?.kept) === '["Rf1"]' && json(one.pairLimit?.dropped) === '["Rf2"]' && /allowing more pairs gets closer\.$/.test(r?.text ?? ''),
			r?.text
		);
	}

	// a limit that keeps no pair says why: on a 7.3 kHz, 4 V phase shift,
	// Rf1 or Rf2 alone fits in one pair, but neither does better than single
	// parts, so "only helps with more pairs" would be wrong
	{
		const shift = (n, frequency = 7300, amplitude = 4) => designOscillator({ topology: 'phaseShift', stabilizer: 'diodes', frequency, amplitude, ...stocks.lab, pairLimit: n });
		const notes = [1, 2, 3].map((n) => pairLimitNote(shift(n)));
		const kept = [1, 2, 3].map((n) => shift(n).pairLimit?.kept.length ?? -1);
		const fits = notes.every((t) => /every resistor is a single part: none of the pairs that fit brings the oscillator closer to its targets\.$/.test(t ?? ''));
		check(
			'pair limit: a limit that keeps no pair says the pairs that fit do no better, never that each one needs more pairs',
			kept.every((k) => k === 0) && fits && notes.every((t) => plainText(t)),
			notes[0]
		);
	}

	// the whitelists a limit tries are every subset of the resistors the
	// oscillator may pair, not only of the pairs where they help: with R
	// single the frequency moves and the limiter is solved again, and then Rf2
	// can call for two in series where it did not before
	{
		const lab = stocks.lab;
		const held = (d) => Boolean(d && d.starts && d.limiter.regulates !== false && d.opamp.swingOk);
		// a 1 kHz, 3 V phase shift: R (3 resistors) and Rf1 where they help;
		// with two pairs the parts hold the amplitude only with Rf1 and Rf2
		const shiftCase = { topology: 'phaseShift', stabilizer: 'diodes', frequency: 1000, amplitude: 3 };
		const shift = [2, 3].map((n) => designOscillator({ ...shiftCase, ...lab, pairLimit: n }));
		const shiftSingle = designOscillator({ ...shiftCase, ...lab, pairs: false });
		check(
			'pair limit: a 1 kHz, 3 V phase shift on the lab kit holds its amplitude with up to 2 or 3 pairs (Rf1 and Rf2), which single parts do not',
			shift.every((d) => held(d) && json(d.pairLimit?.kept) === '["Rf1","Rf2"]' && json(d.pairLimit?.added) === '["Rf2"]' && rel(d.limiter.amplitudeActual, 0.996, 0.01) && oscillatorMeasure(d, shiftCase) < 1000) && !held(shiftSingle),
			shift.map((d) => `${d.pairLimit?.kept.join('+')}: ${d.limiter.amplitudeActual?.toFixed(3)} V, measure ${oscillatorMeasure(d, shiftCase).toFixed(1)}`).join('; ')
		);
		check(
			'pair limit: its note says Rf1 stays a pair and Rf2 becomes one, in the netlist too',
			pairLimitNote(shift[0]) === 'With at most 2 pairs, Rf1 stays two resistors in series and Rf2 becomes two in series too; R (all 3 sections) is a single part.' && generateNetlist(shift[0]).includes(`* ${pairLimitNote(shift[0])}\n`),
			pairLimitNote(shift[0])
		);
		// a 1 kHz, 3 V Bubba: R (4 resistors) and Rf1 where they help; with 2
		// or 3 pairs, Rf1 and Rf2 land closer than Rf1 alone
		const bubbaCase = { topology: 'bubba', stabilizer: 'diodes', frequency: 1000, amplitude: 3 };
		const rf1Only = designOscillator({ ...bubbaCase, ...lab, pairs: ['Rf1'] });
		const bubba = [2, 3].map((n) => designOscillator({ ...bubbaCase, ...lab, pairLimit: n }));
		check(
			'pair limit: a 1 kHz, 3 V Bubba on the lab kit keeps Rf1 and Rf2 with 2 or 3 pairs, closer than Rf1 alone',
			bubba.every((d) => json(d.pairLimit?.kept) === '["Rf1","Rf2"]' && oscillatorMeasure(d, bubbaCase) < oscillatorMeasure(rf1Only, bubbaCase) - 0.1),
			`Rf1 alone ${oscillatorMeasure(rf1Only, bubbaCase).toFixed(3)}; ${bubba.map((d, i) => `N=${i + 2} ${d.pairLimit?.kept.join('+')} ${oscillatorMeasure(d, bubbaCase).toFixed(3)}`).join(', ')}`
		);

		// on a sweep, the design a limit gives is the one an exhaustive search
		// finds: every whitelist of the resistors that may pair whose cost (R
		// counted where it sits) fits in N, kept where it does no harm against
		// single parts, the lowest measure, a tie to fewer pairs and then to
		// the whitelist holding the parts listed first; and the measure never
		// gets worse as N grows from 0 to one below the count
		const off = [];
		const rising = [];
		let searched = 0;
		let gained = 0;
		const outcome = (d) => [d.starts, d.limiter.regulates !== false && d.opamp.swingOk];
		const noHarm = (p, s) => {
			if (!p) return false;
			if (!s) return true;
			const [a, b] = [outcome(s), outcome(p)];
			if ((a[0] && !b[0]) || (a[1] && !b[1])) return false;
			if ((b[0] && !a[0]) || (b[1] && !a[1])) return true;
			const miss = (d) => Math.abs(Math.log(d.f0 / d.frequency));
			return miss(p) <= miss(s) + PAIRS_FREQUENCY_SLACK;
		};
		const clearlyBelow = (a, b) => a !== b && a !== Infinity && (b === Infinity || a < b - 1e-9 * Math.max(Math.abs(a), Math.abs(b)));
		for (const [sname, parts] of Object.entries(stocks)) {
			for (const c of limitCases) {
				const full = designOscillator({ ...c, ...parts });
				const single = designOscillator({ ...c, ...parts, pairs: false });
				if (!full) continue;
				const total = oscillatorPairCount(full);
				if (total === 0) continue;
				const fullNames = oscillatorPairNames(full);
				const paired = designOscillator({ ...c, ...parts, pairs: PAIR_PARTS.map((p) => p.name) });
				const names = PAIR_PARTS.filter((p) => [single, paired].some((d) => d && typeof p.value(d) === 'number' && p.value(d) > 0)).map((p) => p.name);
				const every = [];
				for (let size = 1; size <= names.length; size++) {
					for (const w of pairSubsets(names, size)) {
						const d = designOscillator({ ...c, ...parts, pairs: w });
						every.push({ w, d, cost: w.reduce((n, name) => n + pairCost(c.topology, name), 0), m: oscillatorMeasure(d, c), count: d ? oscillatorPairCount(d) : 0 });
					}
				}
				let previous = Infinity;
				for (let n = 0; n < total; n++) {
					const got = designOscillator({ ...c, ...parts, pairLimit: n });
					let best = { d: single, m: oscillatorMeasure(single, c), count: 0 };
					for (const o of every) {
						if (o.cost > n || !noHarm(o.d, single)) continue;
						if (clearlyBelow(o.m, best.m) || (!clearlyBelow(best.m, o.m) && o.count < best.count)) best = o;
					}
					searched++;
					const at = `${sname} ${c.topology}/${c.stabilizer} ${c.frequency} Hz N=${n}`;
					if (json(strip(got)) !== json(best.d)) off.push(`${at}: [${got ? oscillatorPairNames(got) : 'none'}] ${oscillatorMeasure(got, c).toPrecision(4)} against [${best.d ? oscillatorPairNames(best.d) : 'none'}] ${best.m.toPrecision(4)}`);
					if (got && oscillatorPairNames(got).some((name) => !fullNames.includes(name))) gained++;
					const m = oscillatorMeasure(got, c);
					if (m > previous * (1 + 1e-9)) rising.push(`${at}: ${previous.toPrecision(4)} -> ${m.toPrecision(4)}`);
					previous = m;
				}
			}
		}
		check('pair limit: on a sweep of three lists, every limit below the count gives the design an exhaustive search over every whitelist of the resistors that may pair finds', off.length === 0 && searched > 200, off.length ? off.slice(0, 3).join('; ') : `${searched} limits, ${gained} with a pair that pairs where they help leave single`);
		check('pair limit: on that sweep the measure never gets worse as N grows from 0 to one below the count', rising.length === 0, rising.slice(0, 3).join('; '));
	}
}

/* ---------------------------------------- 9. the Python download ({stem}.py) */
// The page's "Download {stem}.py" (src/lib/oscillator/python, the harness
// scripts/lib-python.mjs) over a matrix of designs: every topology and
// control, frequencies from 10 Hz to 100 kHz, amplitudes, op-amps, both
// diodes and both JFETs, the excess and the growth, every stock (E24, E96,
// the lab kit, the lab resistors, a short list), pairs and a pair limit,
// the E24 fallback, and the designs the page refuses to export. Each file:
// its text (ASCII, Python 3.8, math only, no function twice, the line and
// word rules), its run (python -W error on a cp1252 console, printout
// lines of 92 characters), its results through runpy against the page (the
// settings and the stock, the derived figures, the page's parts and the
// page's figures and op-amp tests of them, to a relative 1e-9), its own
// parts against the rules written again here in JavaScript (the flow of
// topologies.js designWith with R and C by rules a to c, a diode limiter's
// Rf1 and Rf2 by rules d and e, single parts; the same flow with a copy of
// pickRC, the page's limiter sizing and the page's pairs gives
// designOscillator's design exactly), its check of both sets against the
// library's evaluation of the same parts (loop.js, limiter.js), and its
// guards (the topology and control, the inputs above 0, the models, and a
// run at other settings, which says they are no longer the page's). One
// known difference: the page finds a diode limiter's balance gain in its
// second pass at the split of its first parts; where that pass moves Rf1 or
// Rf2, the gain, the amplitude, whether it holds and the slew differ from
// the page's, the file says so with what the page shows (page_gain,
// page_amplitude, page_verdict), and the count is printed.
{
	const { capacitorCandidates, nearestResistor, pairAllowed, pairedResistor } = await import('../src/lib/filter/eseries.js');
	const { pyPart } = await import('../src/lib/filter/python/emit.js');
	const { agcAmplitude, dividerClampAmplitude, JFETS, lampModel, pairConductance, sizeAgc, sizeDividerClamp, sizeFeedbackLimiter } = await import('../src/lib/oscillator/limiter.js');
	const { retuneQuadrature, stageLagDeg, TWO_PI } = await import('../src/lib/oscillator/loop.js');
	const { generateOscillatorPython } = await import('../src/lib/oscillator/python/index.js');
	const { componentOptions, defaultStock, isRestricted } = await import('../src/lib/stock.js');
	const { cleanup, editSetting, inspect, readResults, runFile } = await import('./lib-python.mjs');
	const started = Date.now();

	/* ---- the page: its inputs, designFor and its refusal (oscillator/+page.svelte) */
	const PAGE = { frequency: 1000, amplitude: 3, stabilizer: 'diodes', diode: '1N4148', jfet: 'generic', excessGain: 0.05, quadGrowth: 0.1, gbw: 3e6, slewRate: 13e6, opampSwing: 10.5 };
	const works = (d) => d && d.starts && d.limiter.regulates !== false && d.opamp.swingOk;
	const designFor = ({ params, topology, restricted }) => {
		const own = designOscillator({ ...params, topology });
		if (!restricted || works(own)) return own;
		const fallback = designOscillator({ ...params, topology, resistorSeries: 'E24', capacitors: null, pairs: false });
		if (!fallback) return own;
		if (own && !works(fallback)) return own;
		return { ...fallback, stockShortfall: true };
	};
	const texts = defaultStock();
	const pageOf = ({ topology, stock = 'E24', pairs = false, pairLimit = null, resistorText, capacitorText, ...spec }) => {
		const parts = componentOptions(stock, resistorText ?? texts.resistorText, capacitorText ?? texts.capacitorText, pairs, pairLimit);
		const params = { ...PAGE, ...spec, ...parts };
		const design = designFor({ params, topology, restricted: isRestricted(stock) });
		let refused = null;
		try {
			if (design) generateNetlist(design);
		} catch (e) {
			refused = e.message;
		}
		return { args: { ...params, topology }, design, refused };
	};

	/* ---- the stock the file must hold, and the file's rule for R and C, from its description */
	const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
	const E96 = Array.from({ length: 96 }, (_, i) => Math.round(10 ** (i / 96) * 100) / 100);
	const decades = (base) => [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((d) => base.map((m) => m * 10 ** d));
	const stockOf = (args, design) => {
		if (design.stockShortfall) return { series: 'E24', resistors: decades(E24), capacitors: capacitorCandidates(null), list: null };
		const list = Array.isArray(args.resistorSeries) ? [...new Set(args.resistorSeries)].sort((a, b) => a - b) : null;
		const series = list ? args.resistorSeries : args.resistorSeries === 'E96' ? 'E96' : 'E24';
		return { series, resistors: list ?? decades(series === 'E96' ? E96 : E24), capacitors: capacitorCandidates(args.capacitors), list };
	};
	const nearestOf = (x, stock) => {
		let best = stock[0];
		let miss = Infinity;
		for (const v of stock) {
			const m = Math.abs(Math.log(v / x));
			if (m < miss) [best, miss] = [v, m];
		}
		return best;
	};
	// rule a to c: every capacitor, R = R C / C rounded to the stock; the closest within the
	// page's limits (else of all), the R nearest 10 kohm on a tie to 1e-9
	const ruleRc = (rc, stock) => {
		const choices = stock.capacitors.map((c) => {
			const exact = rc / c;
			const r = nearestOf(exact, stock.resistors);
			return { r, c, miss: Math.abs(Math.log(r / exact)), level: Math.log(exact / 10e3) ** 2, within: c >= 100e-12 && c <= 1e-6 && exact > 1e3 && exact < 1e6 };
		});
		const kept = choices.filter((x) => x.within);
		const pool = kept.length ? kept : choices;
		const least = Math.min(...pool.map((x) => x.miss));
		let best = null;
		for (const x of pool) if (x.miss <= least + 1e-9 && (best === null || x.level < best.level)) best = x;
		return best;
	};
	// the page's pickRC (topologies.js), for the flow's own check against designOscillator
	const pagePick = (rc, stock, pairs) => {
		let best = null;
		for (const c of stock.capacitors) {
			if (c < 100e-12 || c > 1e-6) continue;
			const rTarget = rc / c;
			if (!(rTarget > 1e3 && rTarget < 1e6)) continue;
			const r = nearestResistor(rTarget, stock.series);
			const score = 100 * Math.log(r / rTarget) ** 2 + 0.05 * Math.log(r / 10e3) ** 2;
			if (best === null || score < best.score) best = { c, r, rTarget, score };
		}
		if (best && pairAllowed(pairs, 'R')) best = { ...best, r: pairedResistor(best.rTarget, stock.series, true) };
		return best;
	};
	// the file's own Rf1 and Rf2 (control.js size_limiter, rules d and e): the exact pair as the
	// page finds it, then of each part's stocked neighbours below and above the pair whose
	// amplitude lands closest, the first of a tie, else the nearest of each; the page's 1 to 9
	// split where the diodes cannot conduct enough
	const neighboursOf = (value, list) => {
		const below = list.filter((v) => v <= value);
		const above = list.filter((v) => v >= value);
		return [...new Set([...(below.length ? [Math.max(...below)] : []), ...(above.length ? [Math.min(...above)] : [])])];
	};
	const ruleLimiter = ({ rt, rs, amplitude, fraction, diode, stock }) => {
		const delta = rs - rt;
		const shortfall = (x) => pairConductance((amplitude * fraction * x) / rt, diode) - (1 / x - 1 / (x + delta));
		let lo = 1e-3 * rt;
		let hi = 0.999 * rt;
		if (shortfall(hi) < 0) return { Rf1: nearestOf(0.1 * rs, stock.resistors), Rf2: nearestOf(0.9 * rs, stock.resistors) };
		for (let k = 0; k < 100; k++) {
			const mid = 0.5 * (lo + hi);
			if (shortfall(mid) < 0) lo = mid;
			else hi = mid;
		}
		const x = 0.5 * (lo + hi);
		const rf1Stock = stock.series === 'E24' ? decades(E96) : stock.resistors;
		let out = { Rf1: nearestOf(rt - x, rf1Stock), Rf2: nearestOf(x + delta, stock.resistors) };
		let closest = Infinity;
		for (const rf1 of neighboursOf(rt - x, rf1Stock)) {
			for (const rf2 of neighboursOf(x + delta, stock.resistors)) {
				const held = feedbackLimiterAmplitude({ rf1, rf2, rt, fraction, diode });
				if (held !== null && Math.abs(Math.log(held / amplitude)) < closest) {
					closest = Math.abs(Math.log(held / amplitude));
					out = { Rf1: rf1, Rf2: rf2 };
				}
			}
		}
		return out;
	};

	/**
	 * topologies.js designWith's flow, from the library's loop and limiter
	 * functions, with `pick` for R and C and `pairs` for the rest: the
	 * retune at the start gain in three rounds, the stabilizer sized as
	 * sizeStabilizer does it (a diode limiter's Rf1 and Rf2 by the file's
	 * rules d and e when `own`), a diode limiter's second pass with its
	 * capacitance. Returns { rcTarget, requiredGain, first, parts } with the
	 * file's names, or null where the flow stops.
	 */
	const flow = (args, design, stock, pick, pairs, own = false) => {
		const topo = TOPOLOGIES.find((t) => t.id === design.topology);
		const kind = design.kind;
		const control = design.limiter.kind;
		const diode = DIODES[design.diode];
		const jfet = JFETS[design.jfet];
		const series = stock.series;
		const { frequency, amplitude, excessGain, quadGrowth, gbw } = args;
		const base = { wt: TWO_PI * gbw, n: topo.ladder?.sections, buffered: topo.ladder?.buffered };
		if (kind === 'quadrature') {
			const rho0 = Math.log(1 + quadGrowth) / Math.PI;
			const rt = retuneQuadrature({ ...base, rho: rho0 }, { fTarget: frequency });
			const p = rt.converged && pick(rt.rc, stock, pairs);
			if (!p) return null;
			const rg = nearestResistor(10_000, series);
			const rn = pairedResistor(p.r / rho0, series, pairAllowed(pairs, 'Rn'));
			const rc = p.r * p.c;
			const pole0 = solvePole('quadrature', { ...base, rc, rho: 0 }, { omega0: 1 / rc });
			const clamp = sizeDividerClamp({ gTarget: 1 / rn + 2 * Math.max(0, pole0.sigma) * p.c, amplitude, diode, resistorSeries: series, pairs });
			return { rcTarget: rt.rc, parts: { R: p.r, C: p.c, Ra: rg, Rb: rg, Rn: rn, Rd1: clamp?.rd1 ?? null, Rd2: clamp?.rd2 ?? null } };
		}
		let loop = { ...base };
		let out = null;
		let first = null;
		for (let pass = 0; pass < 2; pass++) {
			let gStart = topo.gain * (1 + excessGain);
			let rt = null;
			for (let round = 0; round < 3; round++) {
				rt = retune(kind, { ...loop, gain: gStart }, { fTarget: frequency, k: topo.k });
				const bal = rt.converged ? solveBalance(kind, { ...loop, rc: rt.rc }, { omega0: TWO_PI * frequency, gain0: topo.gain }) : null;
				if (!bal?.converged) return null;
				gStart = bal.gain * (1 + excessGain);
			}
			const p = pick(rt.rc, stock, pairs);
			if (!p) return null;
			const rg = topo.ladder ? p.r : nearestResistor(10_000, series);
			const bal = solveBalance(kind, { ...loop, rc: p.r * p.c }, { omega0: TWO_PI * frequency, gain0: topo.gain });
			if (!bal.converged) return null;
			const g = bal.gain;
			let sized;
			if (control === 'diodes') {
				const wien = kind === 'wien';
				const rtg = wien ? (g - 1) * rg : g * rg;
				const rs = wien ? (g * (1 + excessGain) - 1) * rg : g * (1 + excessGain) * rg;
				const fraction = wien ? (g - 1) / g : 1;
				if (own) sized = ruleLimiter({ rt: rtg, rs, amplitude, fraction, diode, stock });
				else {
					const sz = sizeFeedbackLimiter({ rt: rtg, rs, amplitude, fraction, diode, resistorSeries: series, pairs });
					sized = { Rf1: sz ? sz.rf1 : pairedResistor(0.1 * rs, series, pairAllowed(pairs, 'Rf1')), Rf2: sz ? sz.rf2 : pairedResistor(0.9 * rs, series, pairAllowed(pairs, 'Rf2')) };
				}
			} else if (control === 'lamp') sized = { Rf: nearestResistor((g - 1) * rg, series) };
			else {
				const rf = nearestResistor((g - 1) * rg, series);
				const agc = sizeAgc({ rf, gBalance: g, amplitude, jfet, diode, resistorSeries: series, pairs });
				if (!agc.ok) return null;
				sized = { Rf: rf, Rser: agc.rSeries, Ra: agc.ra, Rb: agc.rb, Rx: agc.rx, Cdet: nearestOf(50 / frequency / (agc.ra + agc.rb), stock.capacitors) };
			}
			const parts = { R: p.r, C: p.c, ...(kind === 'wien' && control === 'diodes' ? { Rg: rg } : {}), ...sized };
			out = { rcTarget: rt.rc, requiredGain: g, parts };
			if (control !== 'diodes') break;
			if (pass === 0) first = parts;
			loop = { ...base, rAbs: rg, f2: sized.Rf2 / (sized.Rf1 + sized.Rf2), cd: 2 * diode.cjo };
		}
		return { ...out, first };
	};

	/** The page's parts with the file's names (python/check.js pagePartsOf). */
	const pageParts = (design) => {
		const p = design.parts;
		if (design.limiter.kind === 'diodes') return { R: design.r, C: design.c, ...(design.kind === 'wien' ? { Rg: design.rg } : {}), Rf1: p.rf1, Rf2: p.rf2 };
		if (design.limiter.kind === 'lamp') return { R: design.r, C: design.c, Rf: p.rf };
		if (design.limiter.kind === 'jfet') return { R: design.r, C: design.c, Rf: p.rf, Rser: p.rSeries, Ra: p.ra, Rb: p.rb, Rx: p.rx, Cdet: p.cDet };
		return { R: design.r, C: design.c, Ra: p.ra, Rb: p.rb, Rn: p.rn, Rd1: p.rd1, Rd2: p.rd2 };
	};

	/** The library's figures of a set of parts, the names of the file's evaluate(), with the page's op-amp tests (topologies.js opampOk, slewOk). */
	const libEvaluate = (args, design, p) => {
		const textbookOk = Number.isFinite(design.uncompensatedError) && design.uncompensatedError > -0.2;
		const figures = libFigures(args, design, p);
		return { ...figures, opamp_ok: textbookOk && figures.starts && figures.lag <= 25, slew_ok: figures.slew <= args.slewRate / 2 };
	};
	const libFigures = (args, design, p) => {
		const topo = TOPOLOGIES.find((t) => t.id === design.topology);
		const kind = design.kind;
		const control = design.limiter.kind;
		const diode = DIODES[design.diode];
		const { frequency, amplitude, gbw, opampSwing } = args;
		const base = { wt: TWO_PI * gbw, n: topo.ladder?.sections, buffered: topo.ladder?.buffered };
		const rc = p.R * p.C;
		const w0 = TWO_PI * frequency;
		if (control === 'clamp') {
			const pole = solvePole('quadrature', { ...base, rc, rho: p.R / p.Rn }, { omega0: 1 / rc });
			const pole0 = solvePole('quadrature', { ...base, rc, rho: 0 }, { omega0: 1 / rc });
			const f0 = pole.omega / TWO_PI;
			const gTarget = 1 / p.Rn + 2 * Math.max(0, pole0.sigma) * p.C;
			const held = dividerClampAmplitude({ rd1: p.Rd1, rd2: p.Rd2, gTarget, diode });
			const starts = pole.converged && pole.sigma > 0;
			return { f0, growth: Number.isFinite(pole.growthPerCycle) ? pole.growthPerCycle : null, g_target: gTarget, amplitude: held, lag: stageLagDeg(f0, 2, gbw), slew: TWO_PI * f0 * (held || amplitude), starts, holds: held !== null && starts && held <= opampSwing };
		}
		if (control === 'diodes') {
			const wien = kind === 'wien';
			const ref = wien ? p.Rg : p.R;
			const loop = { ...base, rAbs: ref, f2: p.Rf2 / (p.Rf1 + p.Rf2), cd: 2 * diode.cjo, rc };
			const bal = solveBalance(kind, loop, { omega0: w0, gain0: topo.gain });
			const g = bal.converged ? bal.gain : null;
			const start = wien ? 1 + (p.Rf1 + p.Rf2) / p.Rg : (p.Rf1 + p.Rf2) / p.R;
			const zp = zeroPhase(kind, { ...loop, gain: start }, { omega0: w0 });
			const f0 = zp.converged ? zp.omega / TWO_PI : topo.k / (TWO_PI * rc);
			const pole = solvePole(kind, { ...loop, gain: start }, { omega0: w0 });
			const growth = pole.converged && Number.isFinite(pole.growthPerCycle) ? pole.growthPerCycle : null;
			const held = g ? feedbackLimiterAmplitude({ rf1: p.Rf1, rf2: p.Rf2, rt: wien ? (g - 1) * ref : g * ref, fraction: wien ? (g - 1) / g : 1, diode }) : null;
			return { f0, gain: g, start, loop: zp.converged ? zp.magnitude : null, growth, amplitude: held, lag: stageLagDeg(f0, wien ? start : 1 + start, gbw), slew: TWO_PI * f0 * (held || amplitude), starts: growth !== null && growth > 0, holds: held !== null && start > g && held <= opampSwing };
		}
		const g = solveBalance(kind, { ...base, rc }, { omega0: w0, gain0: topo.gain }).gain;
		const zp = zeroPhase(kind, { ...base, rc, gain: g }, { omega0: w0 });
		const f0 = zp.converged ? zp.omega / TWO_PI : topo.k / (TWO_PI * rc);
		if (control === 'lamp') {
			const lamp = lampModel({ rHot: p.Rf / (g - 1), vLampPeak: amplitude / g, f0: frequency });
			const start = 1 + p.Rf / lamp.rCold;
			const at = zeroPhase(kind, { ...base, rc, gain: start }, { omega0: w0 });
			return { f0, gain: g, start, loop: at.converged ? at.magnitude : null, hot: lamp.rHot, cold: lamp.rCold, amplitude, lag: stageLagDeg(f0, g, gbw), slew: TWO_PI * f0 * amplitude, starts: start > g, holds: amplitude <= opampSwing };
		}
		const settle = agcAmplitude({ rf: p.Rf, rSeries: p.Rser, ra: p.Ra, rb: p.Rb, rx: p.Rx, gBalance: g, jfet: JFETS[design.jfet], diode });
		const start = settle ? settle.gainStart : null;
		const at = settle ? zeroPhase(kind, { ...base, rc, gain: start }, { omega0: w0 }) : null;
		const held = settle ? settle.amplitude : null;
		return { f0, gain: g, start, loop: at?.converged ? at.magnitude : null, amplitude: held, cycles: p.Cdet * (p.Ra + p.Rb) * frequency, lag: stageLagDeg(f0, g, gbw), slew: TWO_PI * f0 * (held || amplitude), starts: !!settle && start > g, holds: !!settle && start > g && held <= opampSwing };
	};

	/** The page's figures of its own parts, with the names of the file's evaluate() (those the page has). */
	const pageFigures = (design) => {
		const l = design.limiter;
		const out = { f0: design.f0, amplitude: l.amplitudeActual, starts: design.starts, holds: l.regulates !== false && design.opamp.swingOk, lag: design.opamp.lagDeg, slew: design.opamp.slewNeeded, opamp_ok: design.opamp.opampOk, slew_ok: design.opamp.slewOk };
		if (l.kind === 'clamp') return { ...out, growth: design.growthPerCycle, g_target: l.gTarget };
		Object.assign(out, { gain: design.requiredGain, start: Number.isFinite(design.startGain) ? design.startGain : null, loop: Number.isFinite(design.loopExcess) ? 1 + design.loopExcess : null });
		if (l.kind === 'diodes') out.growth = Number.isFinite(design.growthPerCycle) ? design.growthPerCycle : null;
		if (l.kind === 'lamp') Object.assign(out, { hot: l.rHot, cold: l.rCold });
		if (l.kind === 'jfet') out.cycles = l.cyclesPerTau;
		return out;
	};

	const TOL = 1e-9;
	const same = (a, b, tol = TOL) => {
		if (a === null || a === undefined || b === null || b === undefined) return a == b;
		if (typeof a !== 'number' || typeof b !== 'number') return a === b;
		return a === b || Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));
	};
	const figuresOff = (got, want, keys = Object.keys(want)) => keys.filter((k) => !same(got?.[k], want[k])).map((k) => `${k} ${got?.[k]} against ${want[k]}`);
	const partsOff = (got, want, tol = 1e-12) => {
		const out = JSON.stringify(Object.keys(got ?? {})) === JSON.stringify(Object.keys(want)) ? [] : [`names ${Object.keys(got ?? {})}`];
		for (const [name, v] of Object.entries(want)) if (!same(got?.[name], v, tol)) out.push(`${name} ${got?.[name]} against ${v}`);
		return out;
	};
	const YOU = /\b(you|your|yours|yourself)\b/i;
	const PLACEHOLDER = /\bundefined\b|\bNaN\b|\bnull\b|\bInfinity\b|\[object/;
	const COURSE = /\b(course|courses|cours|school|professors?|prof|slides?|diapos?|labs?|lectures?|ELE\s?2003|polytechnique|experiments?|moodle|homework|assignments?|teachers?|instructors?)\b/i;
	const textOff = (code) => {
		const out = [];
		code.split('\n').forEach((line, i) => {
			if (line.length > 100 || /\t|\s$|[–—]/.test(line)) out.push(`line ${i + 1}`);
		});
		const prose = code.replace(/\blab kit\b|\blab resistors\b/gi, '');
		for (const re of [YOU, PLACEHOLDER, COURSE]) {
			const m = re.exec(prose);
			if (m) out.push(`"${prose.slice(Math.max(0, m.index - 25), m.index + 25).replace(/\n/g, ' ')}"`);
		}
		return out;
	};

	/* ---- the matrix */
	const SHORT = { stock: 'custom', resistorText: '1k, 2.2k, 4.7k, 10k, 22k, 47k, 100k', capacitorText: '1n, 10n, 100n' };
	const cases = [];
	const add = (label, input, opts = {}) => cases.push({ label, input, opts });
	add('wien/diodes as the page opens', { topology: 'wien' }, { lines: [250, 450], guards: true });
	add('wien/lamp', { topology: 'wien', stabilizer: 'lamp' }, { guards: true });
	add('wien/jfet 4 V', { topology: 'wien', stabilizer: 'jfet', amplitude: 4 }, { guards: true });
	for (const t of ['phaseShift', 'bufferedPhaseShift', 'bubba', 'quadrature']) add(`${t} as the page opens`, { topology: t }, { guards: true });
	for (const t of TOPOLOGIES) {
		for (const stabilizer of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
			for (const [frequency, amplitude, gbw] of [[10, 5, 1e6], [200, 1, 3e6], [7300, 4, 3e6], [20000, 3, 10e6], [55000, 1, 3e6], [100000, 0.5, 10e6]]) {
				add(`${t.id}/${stabilizer} ${frequency} Hz ${amplitude} V ${gbw / 1e6} MHz`, { topology: t.id, stabilizer, frequency, amplitude: stabilizer === 'jfet' ? Math.max(amplitude, 4) : amplitude, gbw });
			}
			const a = stabilizer === 'jfet' ? 5 : 3;
			add(`${t.id}/${stabilizer} on E96`, { topology: t.id, stabilizer, amplitude: a, stock: 'E96', frequency: 2000 });
			add(`${t.id}/${stabilizer} on the lab kit`, { topology: t.id, stabilizer, amplitude: a, stock: 'lab' });
			add(`${t.id}/${stabilizer} on the lab kit, pairs`, { topology: t.id, stabilizer, amplitude: a, stock: 'lab', pairs: true, frequency: 5000 });
			add(`${t.id}/${stabilizer} on the lab resistors, up to 1 pair`, { topology: t.id, stabilizer, amplitude: a, stock: 'labR', pairs: true, pairLimit: 1, frequency: 1500 });
			add(`${t.id}/${stabilizer} on a short list`, { topology: t.id, stabilizer, amplitude: a, ...SHORT, frequency: 800 });
		}
	}
	add('wien/diodes, BAT54', { topology: 'wien', diode: 'BAT54', amplitude: 2 });
	add('bubba, BAT54, 12 % excess', { topology: 'bubba', diode: 'BAT54', excessGain: 0.12 });
	add('wien/jfet J111 13 V on a 15 V swing', { topology: 'wien', stabilizer: 'jfet', jfet: 'J111', amplitude: 13, opampSwing: 15 });
	add('wien/jfet, BAT54 detector', { topology: 'wien', stabilizer: 'jfet', diode: 'BAT54', amplitude: 5 });
	add('quadrature, 25 % growth, BAT54 clamp', { topology: 'quadrature', quadGrowth: 0.25, diode: 'BAT54' });
	add('phaseShift 20 kHz on 1 MHz, lag past 25 degrees', { topology: 'phaseShift', frequency: 20000, gbw: 1e6 });
	add('wien 12 V, past the swing', { topology: 'wien', amplitude: 12 });
	add('wien 50 kHz 0.2 V, the lab kit and 10 uF, pairs', { topology: 'wien', frequency: 50000, amplitude: 0.2, gbw: 4e6, slewRate: 16e6, opampSwing: 13.5, stock: 'custom', resistorText: texts.resistorText, capacitorText: `${texts.capacitorText}, 10u`, pairs: true });
	add('phaseShift 0.4 V on the lab kit, its E24 fallback', { topology: 'phaseShift', amplitude: 0.4, stock: 'lab' }, { shortfall: true });
	add('wien/jfet generic 3 V, refused', { topology: 'wien', stabilizer: 'jfet', amplitude: 3 }, { refused: true });
	add('wien/jfet J111 3 V, refused', { topology: 'wien', stabilizer: 'jfet', jfet: 'J111', amplitude: 3 }, { refused: true });
	add('quadrature 0.1 V, refused', { topology: 'quadrature', amplitude: 0.1 }, { refused: true });
	add('phaseShift 200 kHz, no design', { topology: 'phaseShift', frequency: 200000 }, { none: true });

	const bad = {};
	const note = (key, text) => (bad[key] ??= []).push(text);
	const tally = { files: 0, shortfall: 0, refused: 0, none: 0, picksPage: 0, pageFigures: 0, kept: 0, moved: 0, worstMoved: 0, guards: 0, lines: null };
	const extra = ['page_gain', 'frequency', 'amplitude', 'excess', 'growth', 'gbw', 'slew_rate', 'swing', 'diode', 'jfet', 'topology', 'stabilizer', 'resistors', 'resistors_e96', 'capacitors'];
	for (const { label, input, opts } of cases) {
		const { args, design, refused } = pageOf(input);
		let code = null;
		let thrown = null;
		try {
			code = generateOscillatorPython({ args, design });
		} catch (e) {
			thrown = e.message;
		}
		if (!design || refused) {
			// the page shows no design (no panel), or refuses the export (its buttons disabled): no file either
			if (!design) tally.none++;
			else tally.refused++;
			if ((!design) !== !!opts.none || !!refused !== !!opts.refused) note('refusals', `${label}: the page ${design ? `refuses with ${refused}` : 'shows no design'}`);
			if (code !== null || (refused && thrown !== refused)) note('refusals', `${label}: the generator ${code !== null ? 'wrote a file' : `says ${thrown}`}`);
			continue;
		}
		if (opts.none || opts.refused || thrown !== null) {
			note('writes', `${label}: ${thrown ?? 'the page builds and exports it'}`);
			continue;
		}
		if (opts.shortfall && !design.stockShortfall) note('writes', `${label}: the page does not fall back to E24`);
		tally.files++;
		if (design.stockShortfall) tally.shortfall++;
		const shape = inspect(code);
		if (!(shape.ascii && shape.parse38 === null && shape.newer.length === 0 && shape.imports.every((m) => m === 'math') && shape.twice.length === 0)) note('shape', `${label}: ${JSON.stringify(shape)}`);
		const text = textOff(code);
		if (text.length) note('text', `${label}: ${text.slice(0, 2).join(', ')}`);
		if (opts.lines) {
			tally.lines = code.split('\n').length - 1;
			if (tally.lines < opts.lines[0] || tally.lines > opts.lines[1]) note('lines', `${label}: ${tally.lines} lines`);
		}
		const run = runFile(code);
		if (run.status !== 0 || run.stderr !== '') note('run', `${label}: ${run.stderr.slice(-300)}`);
		const wide = run.stdout.split(/\r?\n/).find((l) => l.length > 92);
		if (wide) note('printout', `${label}: ${wide}`);
		const read = readResults(code, extra);
		const r = read.results;
		if (read.stop !== null || read.missing.length) {
			note('results', `${label}: ${read.stop ?? read.missing.join(', ')}`);
			continue;
		}
		// the settings and the stock, the figures derived before any part
		const want = { frequency: args.frequency, amplitude: args.amplitude, gbw: args.gbw, slew_rate: args.slewRate, swing: args.opampSwing, topology: design.topology, stabilizer: design.stabilizer };
		if (design.limiter.kind === 'clamp') want.growth = args.quadGrowth;
		else want.excess = args.excessGain;
		if (design.limiter.kind !== 'lamp') want.diode = design.diode;
		if (design.limiter.kind === 'jfet') want.jfet = design.jfet;
		const stock = stockOf(args, design);
		const settings = Object.entries(want).filter(([k, v]) => r[k] !== v).map(([k]) => k);
		if (JSON.stringify(r.resistors) !== JSON.stringify(stock.resistors)) settings.push('resistors');
		if (JSON.stringify(r.capacitors) !== JSON.stringify(stock.capacitors)) settings.push('capacitors');
		if (stock.series === 'E24' && (design.limiter.kind === 'diodes' || design.limiter.kind === 'jfet') && JSON.stringify(r.resistors_e96) !== JSON.stringify(decades(E96))) settings.push('resistors_e96');
		if (settings.length) note('settings', `${label}: ${settings.join(', ')}`);
		const topo = TOPOLOGIES.find((t) => t.id === design.topology);
		const textbookOk = Number.isFinite(design.uncompensatedError) && design.uncompensatedError > -0.2;
		const derived = figuresOff({ k: r.k, gain: r.gain_textbook, rc: r.rc_textbook, f: r.f_textbook, ok: r.textbook_ok, asPage: r.as_page }, { k: topo.k, gain: topo.gain, rc: design.rcIdeal, f: Number.isFinite(design.fUncompensated) ? design.fUncompensated : null, ok: textbookOk, asPage: true });
		if (derived.length) note('derived', `${label}: ${derived.join('; ')}`);
		// the flow with the page's pick and pairs is the page's design; with the file's rule, the file's
		const pairs = design.pairLimit ? design.pairLimit.allowed : design.pairs;
		const page = flow(args, design, stock, pagePick, pairs);
		const pageOff = page ? [...partsOff(page.parts, pageParts(design), 0), ...figuresOff({ rc: page.rcTarget, g: page.requiredGain ?? null }, { rc: design.rcTarget, g: design.kind === 'quadrature' ? null : design.requiredGain })] : ['no design'];
		if (pageOff.length) note('flow', `${label}: ${pageOff.slice(0, 2).join('; ')}`);
		const own = flow(args, design, stock, ruleRc, false, true);
		if (!own) {
			note('own', `${label}: the JavaScript rule finds no design`);
			continue;
		}
		const ownOff = [...figuresOff({ rc: r.rc_target, g: r.required_gain ?? null }, { rc: own.rcTarget, g: own.requiredGain ?? null }), ...partsOff(r.own_parts, own.parts), ...(own.first ? partsOff(r.first_parts, own.first) : [])];
		if (ownOff.length) note('own', `${label}: ${ownOff.slice(0, 2).join('; ')}`);
		const e96 = stock.series === 'E24' ? decades(E96) : [];
		const stray = Object.entries(r.own_parts).filter(([name, v]) => v !== 0 && !(name[0] === 'C' ? stock.capacitors : ['Rf1', 'Rser', 'Ra'].includes(name) ? [...stock.resistors, ...e96] : stock.resistors).includes(v));
		if (stray.length) note('stock', `${label}: ${stray.map(([n, v]) => `${n} ${v}`).join(', ')}`);
		// where the file's rule picks the page's parts in both passes, its figures are the page's own
		if (page && partsOff(own.parts, page.parts, 0).length === 0 && (!own.first || partsOff(own.first, page.first, 0).length === 0)) {
			tally.picksPage++;
			const off = figuresOff({ rc: r.rc_target, g: r.required_gain ?? null }, { rc: design.rcTarget, g: design.kind === 'quadrature' ? null : design.requiredGain });
			if (off.length || !run.stdout.includes("The file's rule picks the page's parts.")) note('picks', `${label}: ${off.join('; ') || 'no sentence'}`);
		}
		// the page's parts as data: values, and a pair as the sum of the stock's two
		const pp = partsOff(r.page_parts, pageParts(design));
		for (const [name, v] of Object.entries(pageParts(design))) {
			const pair = design.pairs ? seriesPair(v, design.resistorSeries) : null;
			if (pair && !code.includes(`"${name}": ${pyPart(pair[0])} + ${pyPart(pair[1])}`)) pp.push(`${name} not written as ${pair.join(' + ')}`);
		}
		if (pp.length) note('page parts', `${label}: ${pp.slice(0, 2).join('; ')}`);
		// both sets through the library's evaluation, and the page's parts against the page's figures
		const oc = figuresOff(r.own_check, libEvaluate(args, design, r.own_parts));
		if (oc.length) note('own check', `${label}: ${oc.slice(0, 2).join('; ')}`);
		const pc = figuresOff(r.page_check, libEvaluate(args, design, r.page_parts));
		if (pc.length) note('page check', `${label}: ${pc.slice(0, 2).join('; ')}`);
		const figures = pageFigures(design);
		const split = design.limiter.kind === 'diodes' ? ['gain', 'amplitude', 'holds', 'slew', 'slew_ok'] : [];
		const moved = split.length > 0 && !same(r.page_check.gain, design.requiredGain);
		const pf = figuresOff(r.page_check, figures, Object.keys(figures).filter((k) => !moved || !split.includes(k)));
		if (pf.length) note('page figures', `${label}: ${pf.slice(0, 2).join('; ')}`);
		else tally.pageFigures++;
		if (split.length) {
			const says = run.stdout.includes("it finds them at its first parts' split");
			if (r.page_gain !== design.requiredGain || says !== moved || (moved && !(Math.abs(r.page_check.gain / design.requiredGain - 1) > 1e-6))) note('page gain', `${label}: page_gain ${r.page_gain}, moved ${moved}, says ${says}`);
			// what the page shows for its parts beside its gain: the amplitude held and its verdict (+page.svelte panel 04)
			const shown = Number.isFinite(design.limiter.amplitudeActual) ? design.limiter.amplitudeActual : null;
			const verdict = !design.starts ? 'do not start' : !(design.limiter.regulates !== false && design.opamp.swingOk) ? 'start, then clip' : !(design.opamp.opampOk && design.opamp.slewOk) ? 'start, op-amp too slow' : 'start and hold';
			if (r.page_amplitude !== shown || r.page_verdict !== verdict) note('page gain', `${label}: page_amplitude ${r.page_amplitude} against ${shown}, page_verdict ${r.page_verdict} against ${verdict}`);
			if (moved) {
				tally.moved++;
				tally.worstMoved = Math.max(tally.worstMoved, Math.abs(r.page_check.gain / design.requiredGain - 1));
			} else tally.kept++;
		}
		if (opts.guards) {
			const guards = [['topology', '"none"', /This file holds the/], ['stabilizer', '"none"', /This file holds the/], ['amplitude', '0.0', /must all be above 0/], ['gbw', '-1.0', /must all be above 0/]];
			if (design.limiter.kind !== 'lamp') guards.push(['diode', '"1N914"', /No model for this diode/]);
			if (design.limiter.kind === 'jfet') guards.push(['jfet', '"2N5457"', /No model for this JFET/]);
			for (const [name, value, message] of guards) {
				tally.guards++;
				const edited = readResults(editSetting(code, name, value));
				if (!(edited.stop !== null && message.test(edited.stop))) note('guards', `${label}: ${name} = ${value}: ${edited.stop ?? 'it ran on'}`);
			}
			const twice = readResults(editSetting(code, 'frequency', `${2 * args.frequency}.0`));
			if (twice.stop !== null || Math.abs(twice.results.rc_target / r.rc_target - 0.5) > 0.05) note('again', `${label}: ${twice.stop ?? twice.results.rc_target / r.rc_target}`);
			// (and it says the settings are no longer the page's, instead of comparing the rules)
			else if (twice.results.as_page !== false || !twice.stdout.includes("The settings are no longer the page's") || twice.stdout.includes("The file's rule picks")) note('again', `${label}: as_page ${twice.results.as_page}`);
		}
	}
	cleanup();
	const show = (key, ok) => check(`python: ${ok}`, !bad[key], bad[key]?.slice(0, 2).join(' | '));
	show('writes', `the generator writes a file for every design the page exports (${tally.files} files, ${tally.shortfall} of them the page's E24 fallback)`);
	show('refusals', `it writes none where the page shows no design or refuses the export, with the page's reason (${tally.none} without a design, ${tally.refused} refused)`);
	show('shape', 'every file is ASCII, parses for Python 3.8, uses no library API newer, imports math only and defines no function twice');
	show('text', 'its lines hold 100 characters, no tab, no trailing space, no dash, no second person, no course word, no placeholder');
	show('lines', `the default file holds ${tally.lines} lines, 250 to 450`);
	show('run', 'every file runs to its end with python -W error on a cp1252 console, matplotlib hidden');
	show('printout', 'its printout keeps to lines of 92 characters');
	show('results', 'every result its comment lists reads back through runpy');
	show('settings', "its settings and stock are the page's (the E24 series and E96 by their rules, a list as it is)");
	show('derived', "w0 R C, the gain the network asks, the textbook R C, its frequency on the op-amp and the page's 20 % test on it are the page's (1e-9), and as_page holds");
	show('flow', "the JavaScript flow below, with a copy of pickRC and the page's pairs, gives designOscillator's parts, R C target and gain exactly");
	show('own', "the file's own parts follow its rules: that flow with rules a to c for R and C, d and e for a diode limiter's Rf1 and Rf2, single parts (R C target, gain, both passes)");
	show('stock', "the file's own parts are values of its stock (Rf1, Rser and Ra of E96 beside an E24 stock)");
	show('picks', `where its rule picks the page's parts (${tally.picksPage} designs), its R C target and gain are the page's and it says so`);
	show('page parts', "the page's parts are written as the page has them, a pair as the stock's two parts");
	show('own check', "its check of its own parts equals the library's evaluation of them, the page's op-amp tests with it (loop.js, limiter.js, 1e-9)");
	show('page check', "its check of the page's parts equals the library's evaluation of them (1e-9)");
	show('page figures', `its check of the page's parts gives the page's own figures and tests (${tally.pageFigures} designs; a diode limiter whose second pass moved the split, all but its gain, amplitude, hold and slew)`);
	show('page gain', `page_gain, page_amplitude and page_verdict are the page's, and the file says why exactly where the parts' own split moves the gain (${tally.moved} of ${tally.kept + tally.moved} diode limiters, the balance gain up to ${(100 * tally.worstMoved).toFixed(1)} % apart)`);
	show('guards', `editing the topology, the control, an input to 0 or below, the diode or the JFET stops it with its message (${tally.guards} edits)`);
	show('again', "run again at twice the frequency, it retunes R C to about half and says the settings are no longer the page's");
	console.log(`     (the Python download: ${cases.length} cases in ${((Date.now() - started) / 1000).toFixed(0)} s)`);
}

console.log(fails === 0 ? 'oscillator checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
