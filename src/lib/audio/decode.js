/** Extensions offered in the file picker. */
export const ACCEPT = [
	'audio/*',
	'video/*',
	'.mp3',
	'.wav',
	'.m4a',
	'.aac',
	'.ogg',
	'.oga',
	'.opus',
	'.flac',
	'.aif',
	'.aiff',
	'.mp4',
	'.m4v',
	'.mov',
	'.webm'
].join(',');

let shared = null;

/** Shared context, created on first use so it never runs during SSR. */
function audioContext() {
	if (!shared) shared = new AudioContext();
	return shared;
}

export class DecodeError extends Error {}

/**
 * Decodes anything the browser can read, including the audio track of a video.
 * The decoder is the browser's own, so exotic formats depend on the machine.
 */
export async function decodeFile(file) {
	const bytes = await file.arrayBuffer();
	try {
		return await audioContext().decodeAudioData(bytes);
	} catch {
		throw new DecodeError(
			`The browser cannot decode “${file.name}”. Chrome handles more video formats, otherwise the audio track has to be extracted first.`
		);
	}
}

/** Highest absolute value of a signal, linear. */
export function peakOf(data) {
	let max = 0;
	for (let i = 0; i < data.length; i++) {
		const v = data[i] < 0 ? -data[i] : data[i];
		if (v > max) max = v;
	}
	return max;
}

export function dbToGain(db) {
	return Math.pow(10, db / 20);
}

export function gainToDb(gain) {
	return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}
