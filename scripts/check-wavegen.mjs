// Numeric checks of the waveform generator behind the stereo tool's
// Waveform / Modulated sources (src/lib/audio/wavegen.js).
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-wavegen.mjs
//
// Amplitude, offset and phase of a sine; duty of a square; band-limited
// square staying within bounds; ramp and triangle statistics; DC; AM depth
// read back off the envelope; FM frequency read back from zero crossings;
// a file modulator that ends before the signal does; the pre-render
// warnings. Exits non-zero on any failure.

import { defaultModulation, defaultWave, describeSource, sideWarnings, synthesize } from '../src/lib/audio/wavegen.js';

const fs = 48000;
let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};
const stats = (d) => {
	let min = Infinity;
	let max = -Infinity;
	let sum = 0;
	let sq = 0;
	for (const v of d) {
		if (v < min) min = v;
		if (v > max) max = v;
		sum += v;
		sq += v * v;
	}
	return { min, max, mean: sum / d.length, rms: Math.sqrt(sq / d.length) };
};
const zeroCrossings = (d) => {
	let c = 0;
	for (let i = 1; i < d.length; i++) if (d[i - 1] < 0 !== d[i] < 0) c++;
	return c;
};

let d = synthesize({ wave: defaultWave({ frequency: 1000, amplitude: 0.5 }), sampleRate: fs, frames: fs });
let st = stats(d);
check('sine: peak 0.5', Math.abs(st.max - 0.5) < 2e-3 && Math.abs(st.min + 0.5) < 2e-3, `${st.max.toFixed(4)} / ${st.min.toFixed(4)}`);
check('sine: rms 0.5/sqrt2', Math.abs(st.rms - 0.5 / Math.SQRT2) < 2e-3, st.rms.toFixed(4));
check('sine 1 kHz: about 2000 zero crossings per second', Math.abs(zeroCrossings(d) - 2000) <= 2, String(zeroCrossings(d)));

d = synthesize({ wave: defaultWave({ frequency: 1000, amplitude: 0.5, offset: 0.2 }), sampleRate: fs, frames: fs });
check('offset 0.2 -> mean 0.2', Math.abs(stats(d).mean - 0.2) < 2e-3, stats(d).mean.toFixed(4));

d = synthesize({ wave: defaultWave({ frequency: 1000, amplitude: 1, phase: 90 }), sampleRate: fs, frames: 10 });
check('phase 90 degrees starts at the peak', Math.abs(d[0] - 1) < 1e-6, d[0].toFixed(4));

d = synthesize({ wave: defaultWave({ type: 'square', frequency: 1000, amplitude: 1, symmetry: 25, ideal: true }), sampleRate: fs, frames: fs });
let high = 0;
for (const v of d) if (v > 0) high++;
check('ideal square: 25% duty', Math.abs(high / d.length - 0.25) < 0.01, (high / d.length).toFixed(3));

d = synthesize({ wave: defaultWave({ type: 'square', frequency: 1000, amplitude: 1, symmetry: 50 }), sampleRate: fs, frames: fs });
st = stats(d);
high = 0;
for (const v of d) if (v > 0) high++;
check('band-limited square: bounded, zero mean, 50% duty', st.max <= 1.15 && st.min >= -1.15 && Math.abs(st.mean) < 0.01 && Math.abs(high / d.length - 0.5) < 0.01, `max ${st.max.toFixed(3)} mean ${st.mean.toFixed(4)}`);

d = synthesize({ wave: defaultWave({ type: 'rampup', frequency: 100, amplitude: 1 }), sampleRate: fs, frames: fs });
st = stats(d);
check('ramp: zero mean, rms 1/sqrt3', Math.abs(st.mean) < 0.01 && Math.abs(st.rms - 1 / Math.sqrt(3)) < 0.01, `rms ${st.rms.toFixed(3)}`);

d = synthesize({ wave: defaultWave({ type: 'triangle', frequency: 100, amplitude: 1, symmetry: 50 }), sampleRate: fs, frames: fs });
st = stats(d);
check('triangle: peak 1, zero mean, rms 1/sqrt3', Math.abs(st.max - 1) < 0.01 && Math.abs(st.mean) < 0.01 && Math.abs(st.rms - 1 / Math.sqrt(3)) < 0.01, `rms ${st.rms.toFixed(3)}`);

d = synthesize({ wave: defaultWave({ type: 'dc', amplitude: 0.3, offset: 0.1 }), sampleRate: fs, frames: 100 });
check('dc = offset + amplitude', d.every((v) => Math.abs(v - 0.4) < 1e-6));

// AM: 4.8 kHz carrier (10 samples per cycle), 100 Hz sine modulator, 60% depth
const am = defaultModulation();
am.kind = 'am';
am.depth = 60;
am.wave.frequency = 100;
d = synthesize({ wave: defaultWave({ frequency: 4800, amplitude: 0.5 }), modulation: am, sampleRate: fs, frames: fs });
const env = [];
for (let i = 0; i + 10 <= d.length; i += 10) {
	let m = 0;
	for (let j = i; j < i + 10; j++) m = Math.max(m, Math.abs(d[j]));
	env.push(m);
}
const eMax = Math.max(...env);
const eMin = Math.min(...env);
const n = (eMax - eMin) / (eMax + eMin);
check('AM: 60% depth read back off the envelope', Math.abs(n - 0.6) < 0.03, `n = ${n.toFixed(3)}`);

// FM with a constant modulator (as a "file"): +1 -> 1500 Hz, -1 -> 500 Hz
const fm = defaultModulation();
fm.kind = 'fm';
fm.deviation = 500;
fm.source = 'file';
d = synthesize({ wave: defaultWave({ frequency: 1000, amplitude: 1 }), modulation: fm, modSamples: new Float32Array(fs).fill(1), sampleRate: fs, frames: fs });
check('FM: m = +1 gives 1500 Hz', Math.abs(zeroCrossings(d) - 3000) <= 2, String(zeroCrossings(d)));
d = synthesize({ wave: defaultWave({ frequency: 1000, amplitude: 1 }), modulation: fm, modSamples: new Float32Array(fs).fill(-1), sampleRate: fs, frames: fs });
check('FM: m = -1 gives 500 Hz', Math.abs(zeroCrossings(d) - 1000) <= 2, String(zeroCrossings(d)));

// AM by a file modulator that ends halfway: full depth while it lasts, bare carrier after
// (4 kHz carrier = 12 samples per cycle, so the sampled peaks land exactly on the crest)
const amFile = defaultModulation();
amFile.kind = 'am';
amFile.depth = 100;
amFile.source = 'file';
d = synthesize({ wave: defaultWave({ frequency: 4000, amplitude: 0.5 }), modulation: amFile, modSamples: new Float32Array(fs / 2).fill(1), sampleRate: fs, frames: fs });
const first = stats(d.subarray(0, fs / 2));
const second = stats(d.subarray(fs / 2));
check('file modulator: 1.0 while it lasts, 0.5 carrier after it ends', Math.abs(first.max - 1) < 0.01 && Math.abs(second.max - 0.5) < 0.01, `${first.max.toFixed(3)} then ${second.max.toFixed(3)}`);

const side = { source: 'wave', wave: defaultWave({ frequency: 30000, amplitude: 0.8, offset: 0.5 }), modulation: defaultModulation(), seconds: 1 };
const warn = sideWarnings(side, 48000, 'Left');
check('warnings: above Nyquist and clipping both flagged', warn.length === 2 && /half the sample rate/.test(warn[0]) && /clip/.test(warn[1]), `${warn.length} warnings`);
check('describeSource', describeSource(side) === 'sine 30000 Hz', describeSource(side));

// ---------------------------------------------------------------- sweeps
// a continuous log sweep: the frequency heard at each moment, read from the
// zero crossings of a short window, follows from * (to / from)^(t / T)
const { createGenerator, sweepFrequency } = await import('../src/lib/audio/oscillator.js');
const swept = { id: 1, from: 100, to: 10000, duration: 2, spacing: 'log', repeat: false };
d = new Float32Array(fs * 2);
createGenerator({ wave: { ...defaultWave({ amplitude: 1 }), sweep: swept }, sampleRate: fs }).fill(d);
let worst = 0;
for (const t of [0.25, 0.75, 1.25, 1.75]) {
	const w = d.subarray(Math.round((t - 0.05) * fs), Math.round((t + 0.05) * fs));
	const heard = zeroCrossings(w) / 2 / 0.1;
	const want = sweepFrequency(swept, t);
	worst = Math.max(worst, Math.abs(heard / want - 1));
}
check('sweep: log glide 100 Hz to 10 kHz in 2 s heard at the right frequency', worst < 0.03, `worst ${(100 * worst).toFixed(2)} %`);
// no step in the waveform anywhere: a sine at f changes by at most 2 pi f / fs per sample
let jump = 0;
for (let i = 1; i < d.length; i++) jump = Math.max(jump, Math.abs(d[i] - d[i - 1]));
check('sweep: continuous, no jump in phase', jump <= (2 * Math.PI * 10000) / fs + 1e-6, `largest step ${jump.toFixed(4)}`);
check('sweep: linear spacing halfway is the middle', sweepFrequency({ ...swept, spacing: 'linear' }, 1) === 5050);
check('sweep: once, it stays at the top', sweepFrequency(swept, 5) === 10000);
check('sweep: repeating, it starts over', Math.abs(sweepFrequency({ ...swept, repeat: true }, 2.5) - sweepFrequency(swept, 0.5)) < 1e-9);
// a new sweep id starts the glide over, an unchanged one carries on
const gen = createGenerator({ wave: { ...defaultWave(), sweep: swept }, sampleRate: fs });
gen.fill(new Float32Array(fs));
gen.set({ wave: { ...defaultWave({ amplitude: 0.3 }), sweep: swept } });
const kept = gen.sweepTime;
gen.set({ wave: { ...defaultWave(), sweep: { ...swept, id: 2 } } });
check('sweep: same id carries on, a new id restarts', Math.abs(kept - 1) < 1e-6 && gen.sweepTime === 0, `${kept.toFixed(3)} s, then ${gen.sweepTime}`);

// the stepped sweep's list and the reading of a measured response
const { readResponse, sweepSteps } = await import('../src/lib/audio/sweep.js');
const r10 = sweepSteps({ from: 100, to: 10000, perDecade: 10 });
check('steps: R10 from 100 Hz to 10 kHz is 21 preferred values', r10.length === 21 && r10[1] === 125 && r10[5] === 315 && r10[20] === 10000, r10.join(' '));
check('steps: ends kept even off the series', sweepSteps({ from: 150, to: 3000, perDecade: 3 }).join(' ') === '150 200 500 1000 2000 3000');
check('steps: linear', sweepSteps({ from: 1000, to: 4000, spacing: 'linear', step: 1000 }).join(' ') === '1000 2000 3000 4000');
check('steps: a nonsense range gives none', sweepSteps({ from: 0, to: 1000 }).length === 0 && sweepSteps({ from: 10, to: 1e9, spacing: 'linear', step: 1 }).length === 400);
// a 4th-order Butterworth low-pass at 1 kHz read at R20 steps: the -3 dB point
// interpolated between steps lands on 1 kHz
const rows = sweepSteps({ from: 100, to: 10000, perDecade: 20 }).map((f) => ({ f, vin: 0.7, vout: 0.7 / Math.sqrt(1 + (f / 1000) ** 8) }));
const resp = readResponse(rows);
check('response: Butterworth -3 dB found at 1 kHz', resp.crossings.length === 1 && Math.abs(resp.crossings[0].f / 1000 - 1) < 0.01 && !resp.crossings[0].rising, resp.crossings.map((c) => c.f.toFixed(1)).join(' '));
const bp = sweepSteps({ from: 100, to: 10000, perDecade: 20 }).map((f) => ({ f, vout: 0.5 / Math.sqrt(1 + ((f / 1000 - 1000 / f) / 0.5) ** 2) }));
const bpr = readResponse(bp, 0.5);
check('response: a band-pass read with one reference input crosses -3 dB twice', bpr.crossings.length === 2 && bpr.crossings[0].rising && !bpr.crossings[1].rising, bpr.crossings.map((c) => c.f.toFixed(0)).join(' '));

console.log(fails === 0 ? 'wavegen clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
