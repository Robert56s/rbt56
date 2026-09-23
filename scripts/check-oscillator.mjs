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
// Exits non-zero on any failure. LTspice itself is run by check-ltspice.mjs.

import { readFileSync } from 'node:fs';
import katex from 'katex';
import { explainBarkhausen, explainOpampLimit, explainStabilizer, explainTopology } from '../src/lib/oscillator/explain.js';
import { DIODES, feedbackLimiterAmplitude } from '../src/lib/oscillator/limiter.js';
import { openLoop, retune, solveBalance, solvePole, zeroPhase } from '../src/lib/oscillator/loop.js';
import { buildElements, generateNetlist, generateSchematic } from '../src/lib/oscillator/spice.js';
import { compareOscillators, designOscillator, solveLadder, TOPOLOGIES } from '../src/lib/oscillator/topologies.js';
import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';

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
				check(`export ${label}: the run starts from an initial condition and reports fosc and vpk`, /\.tran .* uic/.test(cir) && /IC=/.test(cir) && /\.meas TRAN fosc/.test(cir) && /\.meas TRAN vpk/.test(cir));
			}
		}
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

console.log(fails === 0 ? 'oscillator checks clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
