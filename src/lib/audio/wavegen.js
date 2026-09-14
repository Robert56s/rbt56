import { gainToDb, peakOf } from './decode';

/**
 * Waveform generator in the spirit of a bench WaveGen instrument: sine,
 * square, triangle, ramps, DC and noise with amplitude, offset, phase and
 * symmetry, plus AM or FM modulation by a second waveform or by an audio
 * file. Everything is rendered as ordinary audio samples, so a generated
 * signal can take either channel of the stereo file exactly like a decoded
 * file would, and goes through the same gain, trim, delay and fade.
 *
 * Amplitude and offset are fractions of full scale (1 = 0 dBFS), since a
 * file has no volts. Square and ramp edges are anti-aliased with PolyBLEP
 * unless "ideal" is asked for; the triangle's harmonics fall off fast enough
 * (1/n^2) that its naive form is used as is.
 */

export const WAVE_TYPES = [
	{ id: 'sine', label: 'Sine' },
	{ id: 'square', label: 'Square' },
	{ id: 'triangle', label: 'Triangle' },
	{ id: 'rampup', label: 'Ramp up (sawtooth)' },
	{ id: 'rampdown', label: 'Ramp down' },
	{ id: 'dc', label: 'DC' },
	{ id: 'noise', label: 'White noise' }
];

/** Modulating waveforms: a DC modulator would change nothing. */
export const MOD_WAVE_TYPES = WAVE_TYPES.filter((t) => t.id !== 'dc');

export const PREVIEW_RATE = 48000;

export function hasSymmetry(type) {
	return type === 'square' || type === 'triangle';
}

export function hasEdges(type) {
	return type === 'square' || type === 'rampup' || type === 'rampdown';
}

export function waveLabel(type) {
	return WAVE_TYPES.find((t) => t.id === type)?.label ?? type;
}

export function defaultWave(overrides = {}) {
	return { type: 'sine', frequency: 1000, amplitude: 0.5, offset: 0, phase: 0, symmetry: 50, ideal: false, ...overrides };
}

export function defaultModulation() {
	return {
		kind: 'am', // 'am' | 'fm'
		depth: 50, // AM index, percent
		deviation: 100, // FM peak deviation, Hz
		source: 'wave', // 'wave' | 'file'
		wave: { type: 'sine', frequency: 100, phase: 0, symmetry: 50 },
		file: null,
		buffer: null,
		mono: null, // Float32Array at PREVIEW_RATE, for the card's preview
		status: 'empty',
		error: '',
		normalize: true
	};
}

function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

/** Plain shapes at phase t in [0, 1); s is the symmetry (duty for square, rise fraction for triangle). */
export function naiveShape(type, t, s) {
	switch (type) {
		case 'sine':
			return Math.sin(2 * Math.PI * t);
		case 'square':
			return t < s ? 1 : -1;
		case 'triangle':
			return t < s ? -1 + (2 * t) / s : 1 - (2 * (t - s)) / (1 - s);
		case 'rampup':
			return 2 * t - 1;
		case 'rampdown':
			return 1 - 2 * t;
		case 'dc':
			return 1;
		case 'noise':
			return Math.random() * 2 - 1;
		default:
			return 0;
	}
}

/**
 * PolyBLEP residual: a two-sample polynomial that, added around a
 * discontinuity, removes the aliasing a hard step would spray across the
 * band. t is the phase, dt the phase advance per sample.
 */
function polyBlep(t, dt) {
	if (t < dt) {
		t /= dt;
		return t + t - t * t - 1;
	}
	if (t > 1 - dt) {
		t = (t - 1) / dt;
		return t * t + t + t + 1;
	}
	return 0;
}

/** Shapes with their edges anti-aliased; falls back to the naive shape when the frequency is degenerate. */
export function bandLimitedShape(type, t, s, dt) {
	if (!(dt > 0) || dt >= 0.5) return naiveShape(type, t, s);
	switch (type) {
		case 'rampup':
			return naiveShape('rampup', t, s) - polyBlep(t, dt);
		case 'rampdown':
			return naiveShape('rampdown', t, s) + polyBlep(t, dt);
		case 'square': {
			let v = naiveShape('square', t, s);
			v += polyBlep(t, dt);
			v -= polyBlep((t - s + 1) % 1, dt);
			return v;
		}
		default:
			return naiveShape(type, t, s);
	}
}

/**
 * Renders `frames` samples of a wave, optionally modulated.
 *   wave        { type, frequency, amplitude, offset, phase (deg), symmetry (%), ideal }
 *   modulation  null, or { kind: 'am'|'fm', depth (%), deviation (Hz), source, wave }
 *   modSamples  Float32Array in [-1, 1] at sampleRate when the modulator is
 *               an audio file (null otherwise); past its end the modulator is 0
 * AM: y = offset + amplitude * shape * (1 + depth * m). FM: the phase advances
 * at frequency + deviation * m, sample by sample.
 */
export function synthesize({ wave, modulation = null, modSamples = null, sampleRate, frames }) {
	const out = new Float32Array(frames);
	const amp = Number(wave.amplitude) || 0;
	const off = Number(wave.offset) || 0;
	const sym = clamp((Number(wave.symmetry) || 50) / 100, 0.01, 0.99);
	let phase = (((Number(wave.phase) || 0) / 360) % 1) + 1;
	phase -= Math.floor(phase);

	const useFile = !!modulation && modulation.source === 'file' && modSamples;
	const mw = modulation && modulation.source === 'wave' ? modulation.wave : null;
	const useMod = !!modulation && (useFile || mw);
	let modPhase = mw ? ((((Number(mw.phase) || 0) / 360) % 1) + 1) % 1 : 0;
	const modDt = mw ? (Number(mw.frequency) || 0) / sampleRate : 0;
	const modSym = mw ? clamp((Number(mw.symmetry) || 50) / 100, 0.01, 0.99) : 0.5;
	const am = useMod && modulation.kind === 'am' ? (Number(modulation.depth) || 0) / 100 : 0;
	const fm = useMod && modulation.kind === 'fm' ? Number(modulation.deviation) || 0 : 0;
	const baseF = Number(wave.frequency) || 0;

	for (let i = 0; i < frames; i++) {
		let m = 0;
		if (useFile) {
			m = i < modSamples.length ? modSamples[i] : 0;
		} else if (mw) {
			m = naiveShape(mw.type, modPhase, modSym);
			modPhase += modDt;
			modPhase -= Math.floor(modPhase);
		}
		const dt = (baseF + fm * m) / sampleRate;
		let v;
		if (wave.type === 'dc') v = 1;
		else if (wave.type === 'noise') v = Math.random() * 2 - 1;
		else v = wave.ideal ? naiveShape(wave.type, phase, sym) : bandLimitedShape(wave.type, phase, sym, Math.abs(dt));
		if (am) v *= 1 + am * m;
		out[i] = off + amp * v;
		phase += dt;
		phase -= Math.floor(phase);
	}
	return out;
}

/** Mixes a decoded buffer down to one Float32Array (mode 'mix', 'ch0' or 'ch1'). */
export function monoData(buffer, mode = 'mix') {
	const frames = buffer.length;
	const channels = buffer.numberOfChannels;
	const out = new Float32Array(frames);
	if (channels === 1 || mode === 'ch0') out.set(buffer.getChannelData(0));
	else if (mode === 'ch1') out.set(buffer.getChannelData(Math.min(1, channels - 1)));
	else {
		for (let c = 0; c < channels; c++) {
			const data = buffer.getChannelData(c);
			for (let i = 0; i < frames; i++) out[i] += data[i];
		}
		for (let i = 0; i < frames; i++) out[i] /= channels;
	}
	return out;
}

/**
 * An audio file as a modulating signal: mono, resampled to `sampleRate`
 * with the browser's own resampler, scaled so its peak is 1 (optional),
 * cut to at most `frames` samples.
 */
export async function fileToModulator(buffer, sampleRate, frames, { normalize = true } = {}) {
	const mono = monoData(buffer, 'mix');
	const src = new AudioBuffer({ length: mono.length, sampleRate: buffer.sampleRate, numberOfChannels: 1 });
	src.copyToChannel(mono, 0);
	const outFrames = Math.max(1, Math.min(frames, Math.ceil(buffer.duration * sampleRate)));
	const ctx = new OfflineAudioContext(1, outFrames, sampleRate);
	const node = ctx.createBufferSource();
	node.buffer = src;
	node.connect(ctx.destination);
	node.start(0);
	const rendered = await ctx.startRendering();
	const data = new Float32Array(rendered.getChannelData(0));
	if (normalize) {
		const peak = peakOf(data);
		if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak;
	}
	return data;
}

/** Seconds a generated side lasts before trim and delay (a file modulator sets it, otherwise the chosen length). */
export function generatedLength(side) {
	if (side.source === 'wave') return Math.max(0, Number(side.seconds) || 0);
	if (side.source === 'modulated') {
		if (side.modulation.source === 'file') return side.modulation.buffer ? side.modulation.buffer.duration : 0;
		return Math.max(0, Number(side.seconds) || 0);
	}
	return side.buffer ? side.buffer.duration : 0;
}

/** Window worth showing in the card preview: a few cycles of whatever is slowest. */
export function previewSeconds(side) {
	if (side.source === 'wave') {
		if (side.wave.type === 'dc' || side.wave.type === 'noise') return 0.05;
		return clamp(4 / Math.max(1e-3, Number(side.wave.frequency) || 0), 0.004, 0.25);
	}
	if (side.modulation.source === 'file') {
		return side.modulation.mono ? clamp(side.modulation.mono.length / PREVIEW_RATE, 0.05, 3) : 0.05;
	}
	return clamp(3 / Math.max(1e-3, Number(side.modulation.wave.frequency) || 0), 0.01, 2);
}

/** A short synthesized AudioBuffer for the card's waveform preview (null during SSR). */
export function previewBuffer(side) {
	if (typeof AudioBuffer === 'undefined') return null;
	const frames = Math.max(64, Math.round(previewSeconds(side) * PREVIEW_RATE));
	const modSamples = side.source === 'modulated' && side.modulation.source === 'file' ? side.modulation.mono : null;
	if (side.source === 'modulated' && side.modulation.source === 'file' && !modSamples) return null;
	const data = synthesize({
		wave: side.wave,
		modulation: side.source === 'modulated' ? side.modulation : null,
		modSamples,
		sampleRate: PREVIEW_RATE,
		frames
	});
	const buffer = new AudioBuffer({ length: frames, sampleRate: PREVIEW_RATE, numberOfChannels: 1 });
	buffer.copyToChannel(data, 0);
	return buffer;
}

/** Short name of a side's signal, for the output file name. */
export function describeSource(side) {
	const f = Number(side.wave?.frequency) || 0;
	if (side.source === 'wave') return `${waveLabel(side.wave.type).split(' ')[0].toLowerCase()} ${f} Hz`;
	if (side.source === 'modulated') return `${side.modulation.kind.toUpperCase()} ${f} Hz`;
	return null;
}

/** Things worth flagging before rendering a generated side at `sampleRate`. */
export function sideWarnings(side, sampleRate, label) {
	if (side.source === 'file') return [];
	const out = [];
	const nyquist = sampleRate / 2;
	const f = Number(side.wave.frequency) || 0;
	const amp = Math.abs(Number(side.wave.amplitude) || 0);
	const off = Math.abs(Number(side.wave.offset) || 0);
	if (side.wave.type !== 'dc' && side.wave.type !== 'noise' && f >= nyquist) {
		out.push(`${label}: ${f} Hz is at or above half the sample rate (${nyquist} Hz), which a ${sampleRate} Hz file cannot hold. Raise the sample rate or lower the frequency.`);
	}
	if (side.source === 'modulated') {
		if (side.modulation.kind === 'fm' && f + Math.abs(Number(side.modulation.deviation) || 0) >= nyquist) {
			out.push(`${label}: carrier plus FM deviation reaches ${f + Math.abs(Number(side.modulation.deviation) || 0)} Hz, above half the sample rate (${nyquist} Hz).`);
		}
		if (side.modulation.kind === 'am' && (Number(side.modulation.depth) || 0) > 100) {
			out.push(`${label}: AM depth above 100% over-modulates; the envelope folds over and a simple detector will not recover it cleanly.`);
		}
		if (side.modulation.kind === 'am' && side.modulation.source === 'file' && !side.modulation.buffer) {
			out.push(`${label}: no modulating file loaded yet, the carrier will be rendered unmodulated.`);
		}
	}
	const peak = amp * (side.source === 'modulated' && side.modulation.kind === 'am' ? 1 + (Number(side.modulation.depth) || 0) / 100 : 1) + off;
	if (peak > 1.0001) {
		out.push(`${label}: amplitude plus offset reaches ${peak.toFixed(2)} of full scale (${gainToDb(peak).toFixed(1)} dBFS); the signal will clip. Keep amplitude + |offset| at or under 1.`);
	}
	return out;
}
