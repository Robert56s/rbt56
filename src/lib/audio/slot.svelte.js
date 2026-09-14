import { DecodeError, decodeFile } from './decode';
import { PREVIEW_RATE, defaultModulation, defaultWave, fileToModulator } from './wavegen';

/**
 * One side of the output: what the signal is (a decoded file, a generated
 * waveform, or a modulated carrier) and what happens to it afterwards
 * (gain, trim, delay, normalize, invert), which is the same for all three.
 */
export class Slot {
	/** 'file', 'wave' or 'modulated'. */
	source = $state('file');

	file = $state(null);
	buffer = $state(null);
	/** 'empty', 'reading', 'ready' or 'error'. */
	status = $state('empty');
	error = $state('');

	/** Generator settings; for a modulated source this is the carrier. */
	wave = $state(defaultWave());
	modulation = $state(defaultModulation());
	/** Length of a generated signal, seconds (a file modulator sets the length itself). */
	seconds = $state(10);

	downmix = $state('mix');
	gainDb = $state(0);
	normalize = $state(false);
	invert = $state(false);
	trimSec = $state(0);
	delaySec = $state(0);

	/** True when this side will put something on its channel. */
	get active() {
		if (this.source === 'wave') return true;
		if (this.source === 'modulated') return this.modulation.source === 'wave' || this.modulation.buffer !== null;
		return this.buffer !== null;
	}

	async load(file) {
		this.file = file;
		this.buffer = null;
		this.error = '';
		this.status = 'reading';
		try {
			const buffer = await decodeFile(file);
			// Another file may have been dropped while this one was decoding.
			if (this.file !== file) return;
			this.buffer = buffer;
			this.trimSec = 0;
			this.delaySec = 0;
			this.downmix = 'mix';
			this.status = 'ready';
		} catch (err) {
			if (this.file !== file) return;
			this.status = 'error';
			this.error = err instanceof DecodeError ? err.message : 'Unreadable file.';
		}
	}

	/** Loads the audio file that modulates the carrier. */
	async loadModulator(file) {
		const mod = this.modulation;
		mod.file = file;
		mod.buffer = null;
		mod.mono = null;
		mod.error = '';
		mod.status = 'reading';
		try {
			const buffer = await decodeFile(file);
			if (mod.file !== file) return;
			mod.buffer = buffer;
			// a preview-rate copy, so the card can draw the modulated signal synchronously
			mod.mono = await fileToModulator(buffer, PREVIEW_RATE, Math.ceil(Math.min(buffer.duration, 3) * PREVIEW_RATE), { normalize: true });
			if (mod.file !== file) return;
			mod.status = 'ready';
			this.trimSec = 0;
		} catch (err) {
			if (mod.file !== file) return;
			mod.status = 'error';
			mod.error = err instanceof DecodeError ? err.message : 'Unreadable file.';
		}
	}

	clearModulator() {
		const mod = this.modulation;
		mod.file = null;
		mod.buffer = null;
		mod.mono = null;
		mod.status = 'empty';
		mod.error = '';
	}

	clear() {
		this.source = 'file';
		this.file = null;
		this.buffer = null;
		this.status = 'empty';
		this.error = '';
		this.wave = defaultWave();
		this.modulation = defaultModulation();
		this.seconds = 10;
		this.gainDb = 0;
		this.normalize = false;
		this.invert = false;
		this.trimSec = 0;
		this.delaySec = 0;
	}

	/** Everything the renderer needs, as plain data (buffers included). */
	get settings() {
		return {
			source: this.source,
			buffer: this.buffer,
			wave: { ...this.wave },
			modulation: { ...this.modulation, wave: { ...this.modulation.wave } },
			seconds: this.seconds,
			downmix: this.downmix,
			gainDb: this.gainDb,
			normalize: this.normalize,
			invert: this.invert,
			trimSec: this.trimSec,
			delaySec: this.delaySec
		};
	}

	/** Serializable fingerprint of the settings, to know when a render is out of date. */
	get fingerprint() {
		const s = this.settings;
		return {
			...s,
			buffer: this.file?.name ?? null,
			modulation: { ...s.modulation, buffer: this.modulation.file?.name ?? null, mono: null, file: this.modulation.file?.name ?? null }
		};
	}
}
