import { dbToGain, peakOf } from './decode';

/** What to do when the source has more than one channel. */
export type Downmix = 'mix' | 'ch0' | 'ch1';

export interface SideSettings {
	buffer: AudioBuffer | null;
	downmix: Downmix;
	gainDb: number;
	normalize: boolean;
	invert: boolean;
	/** Seconds cut from the start of the source. */
	trimSec: number;
	/** Silence inserted before the source in the output. */
	delaySec: number;
}

export interface RenderSettings {
	sampleRate: number;
	duration: number;
	fadeMs: number;
}

export const NORMALIZE_TARGET = dbToGain(-1);

export function emptySide(): SideSettings {
	return {
		buffer: null,
		downmix: 'mix',
		gainDb: 0,
		normalize: false,
		invert: false,
		trimSec: 0,
		delaySec: 0
	};
}

/**
 * Folds a source down to a single channel. That channel becomes one of the two
 * outputs, so any stereo image in the source is lost here.
 */
export function toMono(buffer: AudioBuffer, mode: Downmix, invert: boolean): AudioBuffer {
	const frames = buffer.length;
	const channels = buffer.numberOfChannels;
	const out = new Float32Array(frames);

	if (channels === 1 || mode === 'ch0') {
		out.set(buffer.getChannelData(0));
	} else if (mode === 'ch1') {
		out.set(buffer.getChannelData(Math.min(1, channels - 1)));
	} else {
		for (let c = 0; c < channels; c++) {
			const data = buffer.getChannelData(c);
			for (let i = 0; i < frames; i++) out[i] += data[i];
		}
		for (let i = 0; i < frames; i++) out[i] /= channels;
	}

	if (invert) {
		for (let i = 0; i < frames; i++) out[i] = -out[i];
	}

	const mono = new AudioBuffer({
		length: frames,
		sampleRate: buffer.sampleRate,
		numberOfChannels: 1
	});
	mono.copyToChannel(out, 0);
	return mono;
}

/** How much of the output timeline this side occupies. */
export function sideDuration(side: SideSettings): number {
	if (!side.buffer) return 0;
	const playable = Math.max(0, side.buffer.duration - Math.max(0, side.trimSec));
	return playable === 0 ? 0 : Math.max(0, side.delaySec) + playable;
}

/** Total gain applied to one side, normalization included. */
export function sideGain(side: SideSettings): number {
	let gain = dbToGain(side.gainDb);
	if (side.normalize && side.buffer) {
		const peak = peakOf(toMono(side.buffer, side.downmix, false).getChannelData(0));
		if (peak > 0) gain *= NORMALIZE_TARGET / peak;
	}
	return gain;
}

function connectSide(
	ctx: OfflineAudioContext,
	merger: ChannelMergerNode,
	side: SideSettings,
	output: number,
	settings: RenderSettings
): void {
	if (!side.buffer) return;

	const mono = toMono(side.buffer, side.downmix, side.invert);
	const trim = Math.min(Math.max(0, side.trimSec), mono.duration);
	const start = Math.max(0, side.delaySec);
	const playable = mono.duration - trim;
	const stop = Math.min(settings.duration, start + playable);
	if (playable <= 0 || stop <= start) return;

	const source = ctx.createBufferSource();
	source.buffer = mono;

	const gainNode = ctx.createGain();
	source.connect(gainNode);
	gainNode.connect(merger, 0, output);

	// The ramps kill the click when a track starts or gets cut short.
	const gain = sideGain(side);
	const fade = Math.min(settings.fadeMs / 1000, (stop - start) / 2);
	const param = gainNode.gain;
	if (fade > 0) {
		param.setValueAtTime(0, start);
		param.linearRampToValueAtTime(gain, start + fade);
		param.setValueAtTime(gain, stop - fade);
		param.linearRampToValueAtTime(0, stop);
	} else {
		param.setValueAtTime(gain, start);
	}

	source.start(start, trim);
	source.stop(stop);
}

/** Left on channel 0, right on channel 1, nothing else. */
export async function renderStereo(
	left: SideSettings,
	right: SideSettings,
	settings: RenderSettings
): Promise<AudioBuffer> {
	const frames = Math.max(1, Math.round(settings.duration * settings.sampleRate));
	const ctx = new OfflineAudioContext(2, frames, settings.sampleRate);
	const merger = ctx.createChannelMerger(2);
	merger.connect(ctx.destination);
	connectSide(ctx, merger, left, 0, settings);
	connectSide(ctx, merger, right, 1, settings);
	return ctx.startRendering();
}
