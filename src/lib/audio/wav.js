function writeAscii(view, offset, text) {
	for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function clamp(value) {
	return value > 1 ? 1 : value < -1 ? -1 : value;
}

/** Integer PCM WAV at 16 or 24 bit, canonical 44 byte header. */
export function encodeWav(buffer, depth = 16) {
	const channels = buffer.numberOfChannels;
	const frames = buffer.length;
	const bytesPerSample = depth / 8;
	const blockAlign = channels * bytesPerSample;
	const dataSize = frames * blockAlign;

	const out = new ArrayBuffer(44 + dataSize);
	const view = new DataView(out);

	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, depth, true);
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	const data = [];
	for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

	let offset = 44;
	if (depth === 16) {
		for (let i = 0; i < frames; i++) {
			for (let c = 0; c < channels; c++) {
				const s = clamp(data[c][i]);
				view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
				offset += 2;
			}
		}
	} else {
		for (let i = 0; i < frames; i++) {
			for (let c = 0; c < channels; c++) {
				const s = clamp(data[c][i]);
				const value = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
				view.setUint8(offset, value & 0xff);
				view.setUint8(offset + 1, (value >> 8) & 0xff);
				view.setUint8(offset + 2, (value >> 16) & 0xff);
				offset += 3;
			}
		}
	}

	return new Blob([out], { type: 'audio/wav' });
}
