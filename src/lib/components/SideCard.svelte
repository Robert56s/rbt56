<script lang="ts">
	import { ACCEPT } from '$lib/audio/decode';
	import { formatBytes, formatDb, formatDuration, formatHz } from '$lib/audio/format';
	import type { Slot } from '$lib/audio/slot.svelte';
	import Waveform from './Waveform.svelte';

	interface Props {
		channel: Slot;
		label: string;
		letter: string;
		tone: string;
	}

	let { channel, label, letter, tone }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);
	let hovering = $state(false);

	const duration = $derived(channel.buffer?.duration ?? 0);

	function pick(files: FileList | null) {
		const file = files?.[0];
		if (file) channel.load(file);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		hovering = false;
		pick(event.dataTransfer?.files ?? null);
	}
</script>

<section class="side" style="--tone: {tone}">
	<header>
		<span class="letter">{letter}</span>
		<h3>{label}</h3>
		<span class="state">{channel.status}</span>
	</header>

	<div
		class="drop"
		class:hovering
		class:filled={channel.status === 'ready'}
		role="group"
		aria-label="Drop zone for {label}"
		ondragover={(e) => {
			e.preventDefault();
			hovering = true;
		}}
		ondragleave={() => (hovering = false)}
		ondrop={onDrop}
	>
		<input
			bind:this={input}
			type="file"
			accept={ACCEPT}
			onchange={(e) => pick(e.currentTarget.files)}
			hidden
		/>

		{#if channel.status === 'empty'}
			<p class="prompt">Drop a file here</p>
			<button type="button" onclick={() => input?.click()}>Choose file</button>
			<p class="formats">mp3, wav, m4a, flac, ogg, mp4, mov, webm</p>
		{:else if channel.status === 'reading'}
			<p class="prompt">Decoding</p>
			<p class="formats">{channel.file?.name}</p>
		{:else if channel.status === 'error'}
			<p class="prompt bad">{channel.error}</p>
			<button type="button" onclick={() => input?.click()}>Try another file</button>
		{:else}
			<p class="filename" title={channel.file?.name}>{channel.file?.name}</p>
			<div class="row">
				<button type="button" class="small ghost" onclick={() => input?.click()}>Replace</button>
				<button type="button" class="small ghost" onclick={() => channel.clear()}>Remove</button>
			</div>
		{/if}
	</div>

	<Waveform
		buffer={channel.buffer}
		colors={[tone, tone]}
		height={channel.buffer && channel.buffer.numberOfChannels > 1 ? 84 : 56}
		empty="no signal"
	/>

	{#if channel.buffer}
		<table>
			<tbody>
				<tr>
					<th scope="row">Length</th>
					<td>{formatDuration(duration)}</td>
				</tr>
				<tr>
					<th scope="row">Channels</th>
					<td>
						{channel.buffer.numberOfChannels === 1
							? 'mono'
							: channel.buffer.numberOfChannels === 2
								? 'stereo'
								: `${channel.buffer.numberOfChannels} channels`}
					</td>
				</tr>
				<tr>
					<th scope="row">Decoded at</th>
					<td>{formatHz(channel.buffer.sampleRate)}</td>
				</tr>
				<tr>
					<th scope="row">File</th>
					<td>{formatBytes(channel.file?.size ?? 0)}</td>
				</tr>
			</tbody>
		</table>

		<div class="controls">
			{#if channel.buffer.numberOfChannels > 1}
				<div class="field">
					<label for="mix-{letter}">Source channel</label>
					<select id="mix-{letter}" bind:value={channel.downmix}>
						<option value="mix">Mix of all channels</option>
						<option value="ch0">Left only</option>
						<option value="ch1">Right only</option>
					</select>
				</div>
			{/if}

			<div class="field">
				<label for="gain-{letter}">
					Volume
					<span class="value">{formatDb(channel.gainDb)}</span>
				</label>
				<input
					id="gain-{letter}"
					type="range"
					min="-30"
					max="12"
					step="0.5"
					bind:value={channel.gainDb}
				/>
			</div>

			<div class="row split">
				<div class="field grow">
					<label for="trim-{letter}">Trim start (s)</label>
					<input
						id="trim-{letter}"
						type="number"
						min="0"
						max={duration.toFixed(2)}
						step="0.1"
						bind:value={channel.trimSec}
					/>
				</div>
				<div class="field grow">
					<label for="delay-{letter}">Silence before (s)</label>
					<input
						id="delay-{letter}"
						type="number"
						min="0"
						max="600"
						step="0.1"
						bind:value={channel.delaySec}
					/>
				</div>
			</div>

			<div class="row checks">
				<label class="check">
					<input type="checkbox" bind:checked={channel.normalize} />
					Normalize to -1 dB
				</label>
				<label class="check">
					<input type="checkbox" bind:checked={channel.invert} />
					Invert phase
				</label>
			</div>
		</div>
	{/if}
</section>

<style>
	.side {
		border: 2px solid var(--ink);
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 0 0.9rem 0.9rem;
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0 -0.9rem;
		padding: 0.5rem 0.9rem;
		background: var(--tone);
		color: #fffdf8;
		border-bottom: 2px solid var(--ink);
	}

	.letter {
		font-family: var(--mono);
		font-weight: 700;
		font-size: 1.1rem;
		width: 1.6rem;
		height: 1.6rem;
		display: grid;
		place-items: center;
		background: #fffdf8;
		color: var(--tone);
	}

	header h3 {
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.state {
		margin-left: auto;
		font-family: var(--mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		opacity: 0.85;
	}

	.drop {
		border: 2px dashed rgba(23, 21, 15, 0.4);
		background: #fffdf8;
		padding: 0.9rem;
		text-align: center;
		margin-top: 0.9rem;
	}

	.drop.hovering {
		border-color: var(--tone);
		border-style: solid;
		background: #fff;
	}

	.drop.filled {
		border-style: solid;
		border-color: rgba(23, 21, 15, 0.4);
		text-align: left;
	}

	.prompt {
		font-family: var(--mono);
		font-size: 0.8rem;
		margin: 0 0 0.6rem;
		max-width: none;
	}

	.prompt.bad {
		color: var(--right);
		text-transform: none;
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.formats {
		font-family: var(--mono);
		font-size: 0.66rem;
		color: var(--muted);
		margin: 0.6rem 0 0;
		max-width: none;
		word-break: break-word;
	}

	.filename {
		font-family: var(--mono);
		font-size: 0.82rem;
		margin: 0 0 0.5rem;
		max-width: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.controls {
		border-top: 2px solid var(--ink);
		padding-top: 0.85rem;
	}

	.row.split {
		gap: 0.6rem;
		flex-wrap: nowrap;
	}

	@media (max-width: 460px) {
		.row.split {
			flex-wrap: wrap;
		}

		.row.split .grow {
			flex-basis: 100%;
		}
	}

	.grow {
		flex: 1;
		min-width: 0;
	}

	.checks {
		gap: 1rem;
		margin-top: 0.2rem;
	}
</style>
