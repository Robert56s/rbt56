import { DecodeError, decodeFile } from './decode';
import type { Downmix, SideSettings } from './render';

export type SlotStatus = 'empty' | 'reading' | 'ready' | 'error';

/** One side of the output: the loaded file and what happens to it. */
export class Slot {
	file = $state<File | null>(null);
	buffer = $state<AudioBuffer | null>(null);
	status = $state<SlotStatus>('empty');
	error = $state('');

	downmix = $state<Downmix>('mix');
	gainDb = $state(0);
	normalize = $state(false);
	invert = $state(false);
	trimSec = $state(0);
	delaySec = $state(0);

	async load(file: File): Promise<void> {
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

	clear(): void {
		this.file = null;
		this.buffer = null;
		this.status = 'empty';
		this.error = '';
		this.gainDb = 0;
		this.normalize = false;
		this.invert = false;
		this.trimSec = 0;
		this.delaySec = 0;
	}

	get settings(): SideSettings {
		return {
			buffer: this.buffer,
			downmix: this.downmix,
			gainDb: this.gainDb,
			normalize: this.normalize,
			invert: this.invert,
			trimSec: this.trimSec,
			delaySec: this.delaySec
		};
	}
}
