import { Mp3Encoder } from '@breezystack/lamejs';

/** Sample rates the MP3 encoder accepts. */
const RATES = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];

export const MP3_BITRATES = [96, 128, 160, 192, 256, 320];

function toInt16(data, frames, from, into) {
	for (let i = 0; i < frames; i++) {
		const s = data[from + i];
		const v = s > 1 ? 1 : s < -1 ? -1 : s;
		into[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
	}
}

/**
 * Encodes to MP3 block by block, yielding between blocks so the page stays
 * responsive and the progress bar actually moves.
 */
export async function encodeMp3(buffer, kbps, onProgress) {
	if (!RATES.includes(buffer.sampleRate)) {
		throw new Error(
			`The MP3 encoder does not support ${buffer.sampleRate} Hz. 44.1 kHz, 48 kHz or a WAV export will work.`
		);
	}

	const channels = Math.min(2, buffer.numberOfChannels);
	const encoder = new Mp3Encoder(channels, buffer.sampleRate, kbps);
	const left = buffer.getChannelData(0);
	const right = channels > 1 ? buffer.getChannelData(1) : left;

	const block = 1152 * 40;
	const bufL = new Int16Array(block);
	const bufR = new Int16Array(block);
	const chunks = [];
	const total = buffer.length;

	for (let offset = 0; offset < total; offset += block) {
		const frames = Math.min(block, total - offset);
		toInt16(left, frames, offset, bufL);
		toInt16(right, frames, offset, bufR);
		const slabL = frames === block ? bufL : bufL.subarray(0, frames);
		const slabR = frames === block ? bufR : bufR.subarray(0, frames);
		const encoded = channels > 1 ? encoder.encodeBuffer(slabL, slabR) : encoder.encodeBuffer(slabL);
		if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
		onProgress?.(Math.min(1, (offset + frames) / total));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	const tail = encoder.flush();
	if (tail.length > 0) chunks.push(new Uint8Array(tail));
	onProgress?.(1);

	return new Blob(chunks, { type: 'audio/mpeg' });
}
