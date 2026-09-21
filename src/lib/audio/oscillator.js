/**
 * The waveform engine proper: shapes, anti-aliased edges, and a generator
 * that keeps its phase between calls so it can stream. No imports on
 * purpose: this file is also inlined verbatim into the live signal
 * generator's AudioWorklet (see liveGenerator.js), where nothing from the
 * page is reachable. wavegen.js builds the file-rendering helpers on top
 * of it.
 */

export function clamp(v, lo, hi) {
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
export function polyBlep(t, dt) {
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

/** Turns the page's wave/modulation objects into the numbers the loop needs. */
function compile(wave, modulation, sampleRate) {
	const mw = modulation && modulation.source === 'wave' ? modulation.wave : null;
	const useFile = !!modulation && modulation.source === 'file';
	const useMod = !!modulation && (useFile || mw);
	return {
		type: wave.type,
		ideal: !!wave.ideal,
		amp: Number(wave.amplitude) || 0,
		off: Number(wave.offset) || 0,
		sym: clamp((Number(wave.symmetry) || 50) / 100, 0.01, 0.99),
		phaseOffset: ((((Number(wave.phase) || 0) / 360) % 1) + 1) % 1,
		baseF: Number(wave.frequency) || 0,
		useFile,
		mw,
		modDt: mw ? (Number(mw.frequency) || 0) / sampleRate : 0,
		modSym: mw ? clamp((Number(mw.symmetry) || 50) / 100, 0.01, 0.99) : 0.5,
		modPhaseOffset: mw ? ((((Number(mw.phase) || 0) / 360) % 1) + 1) % 1 : 0,
		am: useMod && modulation.kind === 'am' ? (Number(modulation.depth) || 0) / 100 : 0,
		fm: useMod && modulation.kind === 'fm' ? Number(modulation.deviation) || 0 : 0
	};
}

/**
 * A generator with memory: its phase (and the modulator's) carries over
 * from one fill() to the next, so a stream of blocks is one continuous
 * waveform, and set() changes frequency, shape or level without a jump in
 * phase. `smoothing` (seconds) slews amplitude and offset toward their new
 * values instead of stepping them, which is what keeps a live output from
 * clicking on every knob change; 0 applies changes at once. `gate` scales
 * the level (0 mutes, 1 plays) through the same slew, so switching a
 * channel on or off fades over the smoothing time too.
 *
 *   wave        { type, frequency, amplitude, offset, phase (deg), symmetry (%), ideal }
 *   modulation  null, or { kind: 'am'|'fm', depth (%), deviation (Hz), source, wave }
 * AM: y = offset + amplitude * shape * (1 + depth * m). FM: the phase
 * advances at frequency + deviation * m, sample by sample.
 */
export function createGenerator({ wave, modulation = null, sampleRate, smoothing = 0, gate = 1 }) {
	let cfg = compile(wave, modulation, sampleRate);
	let phase = 0;
	let modPhase = 0;
	let curAmp = cfg.amp * gate;
	let curOff = cfg.off * gate;
	let targetGate = gate;
	const k = smoothing > 0 ? 1 - Math.exp(-1 / (smoothing * sampleRate)) : 1;

	return {
		/** New settings, same phase. Any of wave, modulation, gate may be given. */
		set(next = {}) {
			if (next.wave) wave = next.wave;
			if (next.modulation !== undefined) modulation = next.modulation;
			if (next.gate !== undefined) targetGate = next.gate;
			cfg = compile(wave, modulation, sampleRate);
		},
		/**
		 * Writes `count` samples into out[start..]. modSamples, when given,
		 * is the modulating audio (Float32Array in [-1, 1]) read from
		 * modOffset; past its end the modulator is 0.
		 */
		fill(out, start = 0, count = out.length - start, modSamples = null, modOffset = 0) {
			const c = cfg;
			const tAmp = c.amp * targetGate;
			const tOff = c.off * targetGate;
			for (let i = 0; i < count; i++) {
				let m = 0;
				if (c.useFile) {
					const j = modOffset + i;
					m = modSamples && j < modSamples.length ? modSamples[j] : 0;
				} else if (c.mw) {
					m = naiveShape(c.mw.type, (modPhase + c.modPhaseOffset) % 1, c.modSym);
					modPhase += c.modDt;
					modPhase -= Math.floor(modPhase);
				}
				const dt = (c.baseF + c.fm * m) / sampleRate;
				const t = (phase + c.phaseOffset) % 1;
				let v;
				if (c.type === 'dc') v = 1;
				else if (c.type === 'noise') v = Math.random() * 2 - 1;
				else v = c.ideal ? naiveShape(c.type, t, c.sym) : bandLimitedShape(c.type, t, c.sym, Math.abs(dt));
				if (c.am) v *= 1 + c.am * m;
				curAmp += (tAmp - curAmp) * k;
				curOff += (tOff - curOff) * k;
				out[start + i] = curOff + curAmp * v;
				phase += dt;
				phase -= Math.floor(phase);
			}
		},
		get phase() {
			return phase;
		}
	};
}
