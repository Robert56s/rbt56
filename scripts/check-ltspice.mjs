// Runs every LTspice export through LTspice itself, when it is installed.
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-ltspice.mjs
//
// For each oscillator and modulator export: LTspice's own netlister is
// run on the .asc and its result compared with the .cir (same elements,
// same values, same partition of pins into nets); then the .cir is
// simulated and the waveform measured: the frequency from zero
// crossings, the amplitude, whether it is still growing, the distortion
// at the measured frequency, and for the modulator the index read from
// the carrier peaks. Each is held against what the page predicts. The
// filter exports are netlisted the same way, and their .cir run through an
// AC sweep whose .meas points must match the page's response. Skips
// (exit 0) when no LTspice executable is found; set LTSPICE to its path
// to point at another install.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { combinerChoice, magnitudePhaseAt, magnitudePhaseAtParallelSum } from '../src/lib/filter/bode.js';
import { designFirstOrderLowPass } from '../src/lib/filter/firstOrder.js';
import { designFirstOrderHighPass } from '../src/lib/filter/firstOrderHighPass.js';
import { designMfbLowPass } from '../src/lib/filter/mfb.js';
import { designMfbHighPass } from '../src/lib/filter/mfbHighPass.js';
import { designSallenKeyLowPass } from '../src/lib/filter/sallenKey.js';
import { designSallenKeyHighPass } from '../src/lib/filter/sallenKeyHighPass.js';
import { generateNetlist as filterNetlist, generateSchematic as filterSchematic } from '../src/lib/filter/spice.js';
import { designBandPass, designBandStop, designHighPass, designLowPass } from '../src/lib/filter/stages.js';
import { designTowThomasHighPass, designTowThomasLowPass } from '../src/lib/filter/towThomas.js';
import { designJfetModulator } from '../src/lib/modulation/jfetModulator.js';
import { generateNetlist as modNetlist, generateSchematic as modSchematic } from '../src/lib/modulation/spice.js';
import { generateNetlist as oscNetlist, generateSchematic as oscSchematic, probeNode } from '../src/lib/oscillator/spice.js';
import { designOscillator, TOPOLOGIES } from '../src/lib/oscillator/topologies.js';

const candidates = [process.env.LTSPICE, join(process.env.LOCALAPPDATA ?? '', 'Programs', 'ADI', 'LTspice', 'LTspice.exe'), 'C:\\Program Files\\ADI\\LTspice\\LTspice.exe', 'C:\\Program Files\\LTC\\LTspiceXVII\\XVIIx64.exe'].filter(Boolean);
const LT = candidates.find((p) => existsSync(p));
if (!LT) {
	console.log('LTspice not found: skipped (set LTSPICE=<path to LTspice.exe> to run this check)');
	process.exit(0);
}
const dir = join(tmpdir(), 'rbt56-ltspice');
mkdirSync(dir, { recursive: true });

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};
const rel = (a, b, tol) => Math.abs(a / b - 1) <= tol;

function run(args, timeout = 300000) {
	try {
		execFileSync(LT, args, { timeout, stdio: 'ignore', windowsHide: true });
	} catch {
		// LTspice's exit code is not informative; the files it wrote are
	}
}

/* ------------------------------------------ LTspice's netlist vs ours */
const clean = (s) => s.replace(/µ/g, 'u').replace(/[^\x20-\x7e]/g, '').replace(/\s+;.*$/, '').trim();
function parseNetlist(text, isLtspice) {
	const out = [];
	for (const raw of text.split(/\r?\n/)) {
		const l = clean(raw);
		if (!/^[RCDJXBV]/i.test(l) || /^(E1|E2|R1 e f|C1 f 0)\b/.test(l)) continue;
		const p = l.split(/\s+/);
		const name = p[0].replace(/^X/i, '').toLowerCase();
		if (p[0].toLowerCase().startsWith('x')) {
			// LTspice lists invin noninvin out; our subcircuit takes noninv inv out
			const nodes = isLtspice ? [p[2], p[1], p[3]] : [p[1], p[2], p[3]];
			out.push({ name, nodes: nodes.map((n) => n.toLowerCase()), value: 'opamp' });
		} else {
			const nNodes = /^j/i.test(p[0]) ? 3 : 2;
			out.push({ name, nodes: p.slice(1, 1 + nNodes).map((n) => n.toLowerCase()), value: p.slice(1 + nNodes).join(' ').toLowerCase() });
		}
	}
	return out;
}
function sameCircuit(cirText, netText) {
	const cir = parseNetlist(cirText, false);
	const net = parseNetlist(netText, true);
	const problems = [];
	if (cir.length !== net.length) problems.push(`${net.length} elements for ${cir.length}`);
	const map = new Map();
	const back = new Map();
	for (const c of cir) {
		const n = net.find((e) => e.name === c.name);
		if (!n) {
			problems.push(`${c.name} missing`);
			continue;
		}
		if (n.value !== c.value && c.value !== 'opamp') problems.push(`${c.name}: ${n.value} vs ${c.value}`);
		n.nodes.forEach((nn, i) => {
			const cn = c.nodes[i];
			if (map.has(nn) && map.get(nn) !== cn) problems.push(`${c.name}: net ${nn} is both ${map.get(nn)} and ${cn}`);
			if (back.has(cn) && back.get(cn) !== nn) problems.push(`${c.name}: node ${cn} split`);
			map.set(nn, cn);
			back.set(cn, nn);
			// LTspice names its unlabelled nets N001.., and a net made of two pins touching P001..
			if (!/^[np]\d{3}$/.test(nn) && nn !== cn) problems.push(`${c.name}: LTspice says ${nn}, we say ${cn}`);
		});
	}
	return problems;
}

/* --------------------------------------------------- the ASCII .raw */
function readRaw(file) {
	const text = readFileSync(file, 'latin1');
	const head = text.slice(0, text.indexOf('Values:'));
	const nVars = Number(/No\. Variables:\s*(\d+)/.exec(head)[1]);
	const names = head.slice(head.indexOf('\nVariables:') + 12).trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/)[1]);
	const offset = Number((/Offset:\s*([-+0-9.e]+)/.exec(head) || [0, 0])[1]);
	const body = text.slice(text.indexOf('Values:') + 7).trim().split(/\r?\n/);
	const t = [];
	const cols = names.map(() => []);
	for (let i = 0; i + nVars - 1 < body.length; i += nVars) {
		t.push(Number(body[i].trim().split(/\s+/)[1]) + offset);
		for (let k = 1; k < nVars; k++) cols[k].push(Number(body[i + k].trim()));
	}
	return { t, trace: (name) => cols[names.findIndex((n) => n.toLowerCase() === name.toLowerCase())] };
}
function interp(t, v, tt) {
	let lo = 0;
	let hi = t.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (t[mid] <= tt) lo = mid;
		else hi = mid;
	}
	const f = (tt - t[lo]) / (t[hi] - t[lo] || 1);
	return v[lo] + f * (v[hi] - v[lo]);
}
function measureOscillator(t, v) {
	const cross = [];
	for (let i = 1; i < t.length; i++) if (v[i - 1] < 0 && v[i] >= 0) cross.push(t[i - 1] + ((0 - v[i - 1]) * (t[i] - t[i - 1])) / (v[i] - v[i - 1]));
	const K = Math.min(10, cross.length - 1);
	const f = K > 0 ? K / (cross[cross.length - 1] - cross[cross.length - 1 - K]) : NaN;
	const T = 1 / f;
	const peakIn = (a, b) => {
		let m = 0;
		for (let i = 0; i < t.length; i++) if (t[i] >= a && t[i] <= b) m = Math.max(m, Math.abs(v[i]));
		return m;
	};
	const first = peakIn(t[0], t[0] + 2 * T);
	const last = peakIn(t[t.length - 1] - 2 * T, t[t.length - 1]);
	const S = 4096;
	const P = 5;
	const t0 = t[t.length - 1] - P * T;
	const samples = Array.from({ length: S }, (_, s) => interp(t, v, t0 + (s / S) * P * T));
	const amp = [];
	for (let h = 1; h <= 9; h++) {
		let re = 0;
		let im = 0;
		for (let s = 0; s < S; s++) {
			const ph = (2 * Math.PI * h * P * s) / S;
			re += samples[s] * Math.cos(ph);
			im += samples[s] * Math.sin(ph);
		}
		amp.push((2 * Math.hypot(re, im)) / S);
	}
	return { f, first, last, growth: last / first - 1, thd: Math.sqrt(amp.slice(1).reduce((a, b) => a + b * b, 0)) / amp[0] };
}
function measureAm(t, v, fp, fm) {
	const tEnd = t[t.length - 1];
	const env = [];
	for (let tc = tEnd - 1 / fm; tc + 1 / fp <= tEnd; tc += 1 / fp) {
		let mx = 0;
		for (let s = 0; s < 40; s++) mx = Math.max(mx, Math.abs(interp(t, v, tc + s / 40 / fp)));
		env.push(mx);
	}
	const eMax = Math.max(...env);
	const eMin = Math.min(...env);
	const cross = [];
	for (let i = 1; i < t.length; i++) if (t[i] > tEnd - 1 / fm && v[i - 1] < 0 && v[i] >= 0) cross.push(t[i]);
	return { index: (eMax - eMin) / (eMax + eMin), crest: eMax, carrier: cross.length > 2 ? (cross.length - 1) / (cross[cross.length - 1] - cross[0]) : NaN };
}

/* --------------------------------------------------------- oscillators */
for (const f of [1000, 55000]) {
	for (const topo of TOPOLOGIES) {
		for (const s of topo.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
			const amplitude = f >= 20000 ? 1 : s === 'jfet' ? 4 : 3;
			const d = designOscillator({ topology: topo.id, stabilizer: s, frequency: f, amplitude });
			const stem = `osc-${topo.id}-${s}-${f}`;
			if (!d || (d.limiter.kind === 'jfet' && !d.limiter.regulates)) {
				console.log(`skip ${stem}: no realizable design`);
				continue;
			}
			const asc = join(dir, `${stem}.asc`);
			const cir = join(dir, `${stem}.cir`);
			writeFileSync(asc, oscSchematic(d));
			writeFileSync(cir, oscNetlist(d));
			run(['-netlist', asc], 60000);
			const netFile = join(dir, `${stem}.net`);
			const problems = existsSync(netFile) ? sameCircuit(readFileSync(cir, 'utf8'), readFileSync(netFile, 'latin1')) : ['LTspice wrote no netlist'];
			check(`${stem}: LTspice netlists the drawn .asc into our .cir`, problems.length === 0, problems.slice(0, 3).join('; '));
			run(['-b', '-ascii', cir]);
			const rawFile = join(dir, `${stem}.raw`);
			const logText = existsSync(join(dir, `${stem}.log`)) ? readFileSync(join(dir, `${stem}.log`), 'latin1') : '';
			if (!existsSync(rawFile) || /error|undefined/i.test(logText.replace(/\.model .*/gi, ''))) {
				check(`${stem}: simulates`, false, (logText.match(/.*(error|undefined).*/i) || ['no raw'])[0].trim().slice(0, 100));
				continue;
			}
			const { t, trace } = readRaw(rawFile);
			const m = measureOscillator(t, trace(`V(${probeNode(d)})`));
			const predicted = d.limiter.amplitudeActual ?? amplitude;
			if (!d.starts) {
				check(`${stem}: predicted not to start, and the waveform decays`, m.last < m.first, `${m.first.toFixed(3)} -> ${m.last.toFixed(3)} V`);
				continue;
			}
			if (!d.opamp.opampOk) {
				// the page says the op-amp cannot be trusted here; the file must still run, and that is all it promises
				console.log(`note ${stem}: flagged as untrusted on the page (lag ${d.opamp.lagDeg.toFixed(0)} degrees); LTspice runs it at ${m.f.toFixed(0)} Hz, ${m.last.toFixed(2)} V`);
				continue;
			}
			check(`${stem}: runs at the predicted frequency (${d.f0.toFixed(0)} Hz)`, rel(m.f, d.f0, 0.015), `${m.f.toFixed(1)} Hz, ${(100 * (m.f / d.f0 - 1)).toFixed(2)} %`);
			check(`${stem}: settled (growth under 3 % over the last cycles)`, Math.abs(m.growth) < 0.03, `${(100 * m.growth).toFixed(2)} %`);
			// the describing function is exact for the diode, not for the loop around it: at large lag the ladder limiters land further off
			const ampTol = s === 'jfet' ? 0.03 : topo.ladder && f >= 20000 ? 0.2 : 0.12;
			check(`${stem}: amplitude near the predicted ${predicted.toFixed(2)} V`, rel(m.last, predicted, ampTol), `${m.last.toFixed(3)} V`);
			const thdBound = d.limiter.kind === 'diodes' ? Math.max(0.01, 2 * d.thd) : d.limiter.kind === 'clamp' ? 0.012 : 0.005;
			check(`${stem}: distortion within the page's figure (${(100 * d.thd).toFixed(2)} %)`, m.thd <= thdBound, `${(100 * m.thd).toFixed(2)} %`);
		}
	}
}

/* ----------------------------------------------------------- modulator */
const base = { vp: -4, idss: 5e-3, swingFraction: 0.9, targetModulationIndex: 0.85, sourceAmplitude: 1, fmMin: 100, vcc: 12, fp: 55000 };
const osc = designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: 55000, amplitude: 1 });
const amCases = [
	['am-noninverting-source', { design: designJfetModulator(base), fmPreview: 1000, oscillator: null }],
	['am-noninverting-wien', { design: designJfetModulator({ ...base, carrierSourceAmplitude: osc.limiter.amplitudeActual }), fmPreview: 1000, oscillator: osc }],
	['am-inverting-source', { design: designJfetModulator({ ...base, topology: 'inverting' }), fmPreview: 1000, oscillator: null }],
	['am-inverting-wien', { design: designJfetModulator({ ...base, topology: 'inverting', carrierSourceAmplitude: osc.limiter.amplitudeActual }), fmPreview: 1000, oscillator: osc }],
	['am-inverting-nobuffer', { design: designJfetModulator({ ...base, topology: 'inverting', carrierBuffer: false }), fmPreview: 1000, oscillator: null }]
];
for (const [stem, opts] of amCases) {
	const asc = join(dir, `${stem}.asc`);
	const cir = join(dir, `${stem}.cir`);
	writeFileSync(asc, modSchematic(opts));
	writeFileSync(cir, modNetlist(opts));
	run(['-netlist', asc], 60000);
	const netFile = join(dir, `${stem}.net`);
	const problems = existsSync(netFile) ? sameCircuit(readFileSync(cir, 'utf8'), readFileSync(netFile, 'latin1')) : ['LTspice wrote no netlist'];
	check(`${stem}: LTspice netlists the drawn .asc into our .cir`, problems.length === 0, problems.slice(0, 3).join('; '));
	run(['-b', '-ascii', cir]);
	const rawFile = join(dir, `${stem}.raw`);
	if (!existsSync(rawFile)) {
		check(`${stem}: simulates`, false);
		continue;
	}
	const { t, trace } = readRaw(rawFile);
	const m = measureAm(t, trace('V(vout)'), 55000, 1000);
	const d = opts.design;
	check(`${stem}: index read from the peaks near the page's ${d.opamp.peakModulationIndex.toFixed(3)}`, Math.abs(m.index - d.opamp.peakModulationIndex) < 0.025, `${m.index.toFixed(3)}`);
	check(`${stem}: carrier at ${opts.oscillator ? 'the oscillator\'s' : 'the source\'s'} frequency`, rel(m.carrier, opts.oscillator ? opts.oscillator.f0 : 55000, opts.oscillator ? 0.02 : 0.002), `${m.carrier.toFixed(0)} Hz`);
}

/* ------------------------------------------------------------- filters */
// The drawn filter must netlist into the .cir, and the .cir, run with an
// op-amp too fast to matter, must give the response the page plots at
// every .meas point, so what is checked is the wiring and the values.
const secondOrder = {
	mfb: (s) => (s.filterType === 'highpass' ? designMfbHighPass(s.wn, s.q) : designMfbLowPass(s.wn, s.q)),
	sallenKey: (s) => (s.filterType === 'highpass' ? designSallenKeyHighPass(s.wn, s.q) : designSallenKeyLowPass(s.wn, s.q)),
	towThomas: (s) => (s.filterType === 'highpass' ? designTowThomasHighPass(s.wn, s.q) : designTowThomasLowPass(s.wn, s.q))
};
const realize = (t) => (s) => (s.order === 1 ? (s.filterType === 'highpass' ? designFirstOrderHighPass(s.tau) : designFirstOrderLowPass(s.tau)) : secondOrder[t](s));
const filterSpecs = [
	{ filterType: 'lowpass', response: 'chebyshev', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 },
	{ filterType: 'highpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 3000 },
	{ filterType: 'bandpass', response: 'chebyshev', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 },
	{ filterType: 'bandstop', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 },
	{ filterType: 'bandstop', response: 'chebyshev', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 }
];
for (const spec of filterSpecs) {
	for (const topology of Object.keys(secondOrder)) {
		let design;
		if (spec.filterType === 'bandpass') design = designBandPass({ ...spec, orderLow: null, orderHigh: null });
		else if (spec.filterType === 'bandstop') design = designBandStop({ ...spec, orderLow: null, orderHigh: null });
		else if (spec.filterType === 'highpass') design = designHighPass({ ...spec, order: null });
		else design = designLowPass({ ...spec, order: null });
		const realized = design.stages.map(realize(topology));
		const lpCount = spec.filterType === 'bandstop' ? design.lp.stages.length : 0;
		let combinerMode = 'sum';
		let predicted = (f) => magnitudePhaseAt(realized, f).db;
		if (spec.filterType === 'bandstop') {
			const branches = [realized.slice(0, lpCount), realized.slice(lpCount)];
			const choice = combinerChoice(branches, spec.fsl, spec.fsh);
			combinerMode = choice.mode;
			predicted = (f) => magnitudePhaseAtParallelSum(branches, f, choice.signs).db;
		}
		const opts = { realizedStages: realized, topology, lpCount, combinerMode, combinerR: 10000, ...spec };
		const stem = `flt-${spec.filterType}-${spec.response}-${topology}`;
		const asc = join(dir, `${stem}.asc`);
		const cir = join(dir, `${stem}.cir`);
		writeFileSync(asc, filterSchematic(opts));
		writeFileSync(cir, filterNetlist(opts));
		run(['-netlist', asc], 60000);
		const netFile = join(dir, `${stem}.net`);
		const problems = existsSync(netFile) ? sameCircuit(readFileSync(cir, 'utf8'), readFileSync(netFile, 'latin1')) : ['LTspice wrote no netlist'];
		check(`${stem}: LTspice netlists the drawn .asc into our .cir`, problems.length === 0, problems.slice(0, 3).join('; '));
		const fast = `${stem}-fast`;
		writeFileSync(join(dir, `${fast}.cir`), filterNetlist({ ...opts, gbw: '100g' }));
		run(['-b', join(dir, `${fast}.cir`)]);
		const logFile = join(dir, `${fast}.log`);
		const log = existsSync(logFile) ? readFileSync(logFile, 'latin1') : '';
		const meas = [...log.matchAll(/^v_(\w+): V\(vout\)\s*=\(([-+0-9.e]+)dB,[^)]*\) at ([-+0-9.e]+)/gim)].map((m) => ({ name: m[1], db: Number(m[2]), f: Number(m[3]) }));
		const worst = meas.reduce((w, m) => Math.max(w, Math.abs(m.db - predicted(m.f))), 0);
		check(`${stem}: LTspice gives the page's response at the band edges`, meas.length >= 2 && worst < 0.05, meas.length ? `${meas.map((m) => `${m.name} ${m.db.toFixed(2)} dB`).join(', ')}; worst ${worst.toFixed(3)} dB off` : 'no .meas in the log');
	}
}

console.log(fails === 0 ? 'LTspice agrees with every export' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
