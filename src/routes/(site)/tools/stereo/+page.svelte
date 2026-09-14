<script>
	import { gainToDb, peakOf } from '$lib/audio/decode';
	import {
		baseName,
		formatBytes,
		formatDb,
		formatDuration,
		formatHz,
		safeFileName
	} from '$lib/audio/format';
	import { MP3_BITRATES, encodeMp3 } from '$lib/audio/mp3';
	import { renderStereo, sideDuration } from '$lib/audio/render';
	import { describeSource, sideWarnings } from '$lib/audio/wavegen';
	import { Slot } from '$lib/audio/slot.svelte';
	import { encodeWav } from '$lib/audio/wav';
	import SideCard from '$lib/components/SideCard.svelte';
	import Waveform from '$lib/components/Waveform.svelte';

	const MAX_SECONDS = 60 * 30;
	const RATES = [48000, 44100, 32000, 22050];

	const left = new Slot();
	const right = new Slot();

	let lengthMode = $state('longest');
	let customSec = $state(30);
	let rateMode = $state('auto');
	let fadeMs = $state(5);

	let format = $state('wav16');
	let mp3Kbps = $state(192);

	let rendering = $state(false);
	let exporting = $state(false);
	let progress = $state(0);
	let problem = $state('');

	let result = $state(null);
	let previewUrl = $state('');
	let renderedFrom = $state('');

	const durLeft = $derived(sideDuration(left.settings));
	const durRight = $derived(sideDuration(right.settings));
	const longest = $derived(Math.max(durLeft, durRight));
	const shortest = $derived.by(() => {
		const both = [durLeft, durRight].filter((v) => v > 0);
		return both.length > 0 ? Math.min(...both) : 0;
	});

	const duration = $derived(
		lengthMode === 'custom'
			? Math.max(0.1, customSec || 0)
			: lengthMode === 'shortest'
				? shortest
				: longest
	);

	const autoRate = $derived.by(() => {
		const rates = [left.buffer?.sampleRate, right.buffer?.sampleRate].filter(
			(r) => typeof r === 'number'
		);
		if (rates.length === 0) return left.source !== 'file' || right.source !== 'file' ? 48000 : 44100;
		const top = Math.max(...rates);
		if (RATES.includes(top)) return top;
		return top > 44100 ? 48000 : 44100;
	});

	const sampleRate = $derived(rateMode === 'auto' ? autoRate : rateMode);
	const ready = $derived((left.active || right.active) && duration > 0);
	const tooLong = $derived(duration > MAX_SECONDS);

	// Fingerprint of the settings: if it moves, the rendered result is out of date.
	const signature = $derived(
		JSON.stringify([left.fingerprint, right.fingerprint, duration, sampleRate, fadeMs])
	);

	const stale = $derived(result !== null && signature !== renderedFrom);

	const warnings = $derived([
		...sideWarnings(left.settings, sampleRate, 'Left'),
		...sideWarnings(right.settings, sampleRate, 'Right')
	]);

	const peaks = $derived.by(() => {
		if (!result) return null;
		return {
			left: gainToDb(peakOf(result.getChannelData(0))),
			right: gainToDb(peakOf(result.getChannelData(1)))
		};
	});

	const clipping = $derived(peaks !== null && (peaks.left > -0.01 || peaks.right > -0.01));

	const estimatedSize = $derived.by(() => {
		if (format === 'mp3') return (mp3Kbps * 1000 * duration) / 8;
		const bytes = format === 'wav24' ? 3 : 2;
		return 44 + Math.round(duration * sampleRate) * 2 * bytes;
	});

	const outputName = $derived.by(() => {
		const name = (side) => {
			if (!side.active) return 'silence';
			if (side.source === 'file') return baseName(side.file.name);
			return describeSource(side.settings);
		};
		return safeFileName(name(left) + ' [L] + ' + name(right) + ' [R]');
	});

	function snapshot(side) {
		return {
			source: side.source,
			file: side.file,
			buffer: side.buffer,
			status: side.status,
			error: side.error,
			wave: { ...side.wave },
			modulation: { ...side.modulation, wave: { ...side.modulation.wave } },
			seconds: side.seconds,
			downmix: side.downmix,
			gainDb: side.gainDb,
			normalize: side.normalize,
			invert: side.invert,
			trimSec: side.trimSec,
			delaySec: side.delaySec
		};
	}

	function swap() {
		const held = snapshot(left);
		Object.assign(left, snapshot(right));
		Object.assign(right, held);
	}

	function dropResult() {
		result = null;
		renderedFrom = '';
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = '';
		}
	}

	function reset() {
		left.clear();
		right.clear();
		dropResult();
		problem = '';
	}

	async function generate() {
		if (!ready || rendering) return;
		if (tooLong) {
			problem = `The output would be ${formatDuration(duration)}, past the 30 minute limit.`;
			return;
		}

		problem = '';
		rendering = true;
		dropResult();
		// Let the browser paint the busy state before the thread gets blocked.
		await new Promise((resolve) => setTimeout(resolve, 30));

		try {
			const buffer = await renderStereo(left.settings, right.settings, {
				sampleRate,
				duration,
				fadeMs
			});
			result = buffer;
			renderedFrom = signature;
			previewUrl = URL.createObjectURL(encodeWav(buffer, 16));
		} catch (err) {
			problem = err instanceof Error ? err.message : 'Rendering failed.';
		} finally {
			rendering = false;
		}
	}

	async function download() {
		if (!result || exporting) return;
		problem = '';
		exporting = true;
		progress = 0;

		try {
			let blob;
			let extension;
			if (format === 'mp3') {
				blob = await encodeMp3(result, mp3Kbps, (ratio) => (progress = ratio));
				extension = 'mp3';
			} else {
				blob = encodeWav(result, format === 'wav24' ? 24 : 16);
				extension = 'wav';
			}

			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `${outputName}.${extension}`;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			setTimeout(() => URL.revokeObjectURL(url), 10000);
		} catch (err) {
			problem = err instanceof Error ? err.message : 'Export failed.';
		} finally {
			exporting = false;
			progress = 0;
		}
	}
</script>

<svelte:head>
	<title>Stereo L/R · rbt56</title>
	<meta name="description" content="Two audio tracks into one stereo file, one per channel." />
</svelte:head>

<article>
	<p class="eyebrow">Tool 01</p>
	<h1>Stereo L/R</h1>
	<p class="lead">
		One source on the left channel, another on the right, exported as a single stereo file.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>Sources</h2>
			<span class="hint">file, waveform or modulated carrier</span>
		</div>

		<div class="sides">
			<SideCard channel={left} label="Left channel" letter="L" tone="var(--blue)" />
			<SideCard channel={right} label="Right channel" letter="R" tone="var(--red)" />
		</div>

		{#each warnings as w (w)}
			<p class="flag warn">{w}</p>
		{/each}

		<div class="row actions">
			<button type="button" class="ghost small" onclick={swap}>Swap sides</button>
			<button
				type="button"
				class="ghost small"
				onclick={reset}
				disabled={!left.active && !right.active && !left.file && !right.file}
			>
				Clear all
			</button>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">02</span>
			<h2>Mix</h2>
			<span class="hint">{ready ? formatDuration(duration) : 'waiting'}</span>
		</div>

		<div class="grid">
			<div class="field">
				<label for="length">Output length</label>
				<select id="length" bind:value={lengthMode}>
					<option value="longest">Longest side ({formatDuration(longest)})</option>
					<option value="shortest">Shortest side ({formatDuration(shortest)})</option>
					<option value="custom">Fixed</option>
				</select>
			</div>

			<div class="field">
				<label for="custom">Fixed length (s)</label>
				<input
					id="custom"
					type="number"
					min="0.1"
					max={MAX_SECONDS}
					step="0.5"
					bind:value={customSec}
					disabled={lengthMode !== 'custom'}
				/>
			</div>

			<div class="field">
				<label for="rate">Sample rate</label>
				<select id="rate" bind:value={rateMode}>
					<option value="auto">Automatic ({formatHz(autoRate)})</option>
					{#each RATES as rate (rate)}
						<option value={rate}>{formatHz(rate)}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label for="fade">
					Edge fade
					<span class="value">{fadeMs} ms</span>
				</label>
				<input id="fade" type="range" min="0" max="200" step="1" bind:value={fadeMs} />
			</div>
		</div>

		<p class="note">
			The fade removes the click when a track starts or gets cut. Zero keeps the signal exact, for
			measurements.
		</p>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">03</span>
			<h2>Output</h2>
			<span class="hint">{result ? 'rendered' : 'nothing yet'}</span>
		</div>

		<div class="row actions">
			<button type="button" onclick={generate} disabled={!ready || rendering}>
				{rendering ? 'Rendering' : result ? 'Render again' : 'Render'}
			</button>
			{#if stale}
				<span class="flag warn">Settings changed since this render.</span>
			{/if}
			{#if tooLong}
				<span class="flag warn">Over 30 minutes, past the limit.</span>
			{/if}
		</div>

		{#if problem}
			<p class="flag bad">{problem}</p>
		{/if}

		<div class="result">
			<Waveform
				buffer={result}
				colors={['var(--blue)', 'var(--red)']}
				height={110}
				empty={ready ? 'not rendered yet' : 'no source loaded'}
			/>
			<div class="legend">
				<span><i style="background: var(--blue)"></i>top: left channel</span>
				<span><i style="background: var(--red)"></i>bottom: right channel</span>
			</div>
		</div>

		{#if result && previewUrl}
			<audio controls src={previewUrl} preload="metadata"></audio>

			<table>
				<tbody>
					<tr>
						<th scope="row">Length</th>
						<td>{formatDuration(result.duration)}</td>
					</tr>
					<tr>
						<th scope="row">Sample rate</th>
						<td>{formatHz(result.sampleRate)}, 2 channels</td>
					</tr>
					<tr>
						<th scope="row">Left peak</th>
						<td>{peaks ? formatDb(peaks.left) : ''}</td>
					</tr>
					<tr>
						<th scope="row">Right peak</th>
						<td>{peaks ? formatDb(peaks.right) : ''}</td>
					</tr>
					<tr>
						<th scope="row">Estimated size</th>
						<td>{formatBytes(estimatedSize)}</td>
					</tr>
				</tbody>
			</table>

			{#if clipping}
				<p class="flag warn spaced">
					The signal hits full scale, so it is probably clipping. Lower one side or turn on
					normalization.
				</p>
			{/if}

			<div class="export">
				<div class="field">
					<label for="format">Format</label>
					<select id="format" bind:value={format}>
						<option value="wav16">WAV 16 bit</option>
						<option value="wav24">WAV 24 bit</option>
						<option value="mp3">MP3</option>
					</select>
				</div>

				<div class="field">
					<label for="kbps">MP3 bitrate</label>
					<select id="kbps" bind:value={mp3Kbps} disabled={format !== 'mp3'}>
						{#each MP3_BITRATES as rate (rate)}
							<option value={rate}>{rate} kbps</option>
						{/each}
					</select>
				</div>

				<button type="button" onclick={download} disabled={exporting}>
					{exporting ? `Encoding ${Math.round(progress * 100)}%` : 'Download'}
				</button>
			</div>

			{#if exporting}
				<div class="bar"><span style="width: {progress * 100}%"></span></div>
			{/if}

			<p class="note filename">
				File name: <code>{outputName}.{format === 'mp3' ? 'mp3' : 'wav'}</code>
			</p>
		{/if}
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">04</span>
			<h2>Notes</h2>
		</div>

		<ul class="notes">
			<li>
				Each side is folded to mono, since one channel carries one signal. A stereo source can
				contribute its mix, its left channel or its right channel.
			</li>
			<li>Video files work too. Only the audio track is read.</li>
			<li>
				<strong>Waveform</strong> and <strong>Modulated</strong> sources are generated at the output sample rate, WaveGen style: shape, frequency, amplitude and offset as fractions of full scale, phase, symmetry, then AM or FM by a second waveform or by an audio file. Square and ramp edges are anti-aliased unless ideal edges are asked for; every frequency has to stay under half the sample rate.
			</li>
			<li>
				<strong>Invert phase</strong> flips one side, so the two channels cancel when summed. Useful
				for spotting a speaker wired backwards.
			</li>
			<li>WAV 16 bit is the safest for unknown gear. MP3 is compressed, so not for measurements.</li>
		</ul>
	</section>
</article>

<style>
	h1 {
		font-size: clamp(1.9rem, 5vw, 2.5rem);
		margin-bottom: 0.5rem;
	}

	.lead {
		font-size: 1.05rem;
		color: var(--textDim);
		margin-bottom: 1.8rem;
	}

	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: start;
	}

	@media (max-width: 780px) {
		.sides {
			grid-template-columns: 1fr;
		}
	}

	.actions {
		margin-top: 1.1rem;
		align-items: center;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 1.1rem;
		margin-bottom: 1.1rem;
	}

	.result {
		margin-bottom: 1.1rem;
	}

	.legend {
		display: flex;
		gap: 1.2rem;
		margin-top: 0.55rem;
		font-size: 0.82rem;
		color: var(--textDim);
	}

	.legend span {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.legend i {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 0.2rem;
	}

	audio {
		width: 100%;
		display: block;
		margin-bottom: 1.1rem;
		border-radius: 999px;
		background: var(--surfaceSunk);
	}

	.export {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-top: 1.2rem;
	}

	.export .field {
		margin-bottom: 0;
		min-width: 150px;
	}

	.bar {
		height: 0.5rem;
		border-radius: 999px;
		background: var(--surfaceHover);
		overflow: hidden;
		margin-top: 0.9rem;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--blue);
		border-radius: 999px;
		transition: width 0.2s;
	}

	.flag {
		font-size: 0.85rem;
		border-radius: var(--radiusSmall);
		padding: 0.4rem 0.75rem;
		max-width: none;
	}

	.flag.warn {
		color: var(--amber);
		background: var(--amberSoft);
		border: 1px solid #f0dfae;
	}

	.flag.spaced {
		margin-top: 1rem;
	}

	.flag.bad {
		color: #fff;
		background: var(--red);
		margin-top: 0.9rem;
	}

	.filename {
		margin-top: 1rem;
	}

	.notes {
		display: grid;
		gap: 0.65rem;
		padding-left: 1.1rem;
		max-width: 74ch;
		color: var(--textDim);
	}

	.notes li {
		font-size: 0.93rem;
	}

	.notes strong {
		color: var(--text);
	}
</style>
