<script>
	import { ACCEPT, gainToDb } from '$lib/audio/decode';
	import { formatBytes, formatDb, formatDuration, formatHz } from '$lib/audio/format';
	import { sourceLength } from '$lib/audio/render';
	import { MOD_WAVE_TYPES, WAVE_TYPES, hasEdges, hasSymmetry, previewBuffer } from '$lib/audio/wavegen';
	import Waveform from './Waveform.svelte';

	let { channel, label, letter, tone } = $props();

	let input = $state(null);
	let modInput = $state(null);
	let hovering = $state(false);
	let modHovering = $state(false);

	const duration = $derived(sourceLength(channel.settings));
	const preview = $derived(channel.source === 'file' ? channel.buffer : previewBuffer(channel.settings));
	const carrierLabel = $derived(channel.source === 'modulated' ? 'Carrier' : 'Waveform');
	const usesFileModulator = $derived(channel.source === 'modulated' && channel.modulation.source === 'file');

	function pick(files) {
		const file = files?.[0];
		if (file) channel.load(file);
	}

	function onDrop(event) {
		event.preventDefault();
		hovering = false;
		pick(event.dataTransfer?.files ?? null);
	}

	function pickModulator(files) {
		const file = files?.[0];
		if (file) channel.loadModulator(file);
	}

	function onModDrop(event) {
		event.preventDefault();
		modHovering = false;
		pickModulator(event.dataTransfer?.files ?? null);
	}

	function amplitudeDb(a) {
		const v = Math.abs(Number(a) || 0);
		return v > 0 ? formatDb(gainToDb(v)) : 'silence';
	}
</script>

<section class="side" style="--tone: {tone}">
	<header>
		<span class="letter">{letter}</span>
		<h3>{label}</h3>
		<span class="state">
			{#if channel.source === 'file'}
				{channel.status}
			{:else if channel.source === 'wave'}
				generated
			{:else}
				{channel.modulation.kind.toUpperCase()}{usesFileModulator ? `, ${channel.modulation.status}` : ''}
			{/if}
		</span>
	</header>

	<div class="tabs" role="tablist" aria-label="Signal source for {label}">
		<button type="button" role="tab" aria-selected={channel.source === 'file'} class:active={channel.source === 'file'} onclick={() => (channel.source = 'file')}>Audio file</button>
		<button type="button" role="tab" aria-selected={channel.source === 'wave'} class:active={channel.source === 'wave'} onclick={() => (channel.source = 'wave')}>Waveform</button>
		<button type="button" role="tab" aria-selected={channel.source === 'modulated'} class:active={channel.source === 'modulated'} onclick={() => (channel.source = 'modulated')}>Modulated</button>
	</div>

	{#if channel.source === 'file'}
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
			<input bind:this={input} type="file" accept={ACCEPT} onchange={(e) => pick(e.currentTarget.files)} hidden />

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
	{:else}
		<div class="gen">
			<p class="genTitle">{carrierLabel}</p>
			<div class="row split">
				<div class="field grow">
					<label for="wtype-{letter}">Shape</label>
					<select id="wtype-{letter}" bind:value={channel.wave.type}>
						{#each WAVE_TYPES as t (t.id)}
							<option value={t.id}>{t.label}</option>
						{/each}
					</select>
				</div>
				{#if channel.wave.type !== 'dc' && channel.wave.type !== 'noise'}
					<div class="field grow">
						<label for="wfreq-{letter}">Frequency (Hz)</label>
						<input id="wfreq-{letter}" type="number" min="0.01" step="1" bind:value={channel.wave.frequency} />
					</div>
				{/if}
			</div>
			<div class="row split">
				<div class="field grow">
					<label for="wamp-{letter}">
						Amplitude (of full scale)
						<span class="value">{amplitudeDb(channel.wave.amplitude)}</span>
					</label>
					<input id="wamp-{letter}" type="number" min="0" max="1" step="0.01" bind:value={channel.wave.amplitude} />
				</div>
				<div class="field grow">
					<label for="woff-{letter}">Offset</label>
					<input id="woff-{letter}" type="number" min="-1" max="1" step="0.01" bind:value={channel.wave.offset} />
				</div>
			</div>
			<div class="row split">
				{#if channel.wave.type !== 'dc' && channel.wave.type !== 'noise'}
					<div class="field grow">
						<label for="wphase-{letter}">Phase (degrees)</label>
						<input id="wphase-{letter}" type="number" min="0" max="360" step="1" bind:value={channel.wave.phase} />
					</div>
				{/if}
				{#if hasSymmetry(channel.wave.type)}
					<div class="field grow">
						<label for="wsym-{letter}">{channel.wave.type === 'square' ? 'Duty cycle (%)' : 'Symmetry (% rise)'}</label>
						<input id="wsym-{letter}" type="number" min="1" max="99" step="1" bind:value={channel.wave.symmetry} />
					</div>
				{/if}
				{#if !usesFileModulator}
					<div class="field grow">
						<label for="wlen-{letter}">Length (s)</label>
						<input id="wlen-{letter}" type="number" min="0.1" max="1800" step="0.5" bind:value={channel.seconds} />
					</div>
				{/if}
			</div>
			{#if hasEdges(channel.wave.type)}
				<label class="check">
					<input type="checkbox" bind:checked={channel.wave.ideal} />
					Ideal edges (no anti-aliasing)
				</label>
			{/if}

			{#if channel.source === 'modulated'}
				<p class="genTitle spaced">Modulation</p>
				<div class="row split">
					<div class="field grow">
						<label for="mkind-{letter}">Type</label>
						<select id="mkind-{letter}" bind:value={channel.modulation.kind}>
							<option value="am">AM (amplitude)</option>
							<option value="fm">FM (frequency)</option>
						</select>
					</div>
					{#if channel.modulation.kind === 'am'}
						<div class="field grow">
							<label for="mdepth-{letter}">Depth, index n (%)</label>
							<input id="mdepth-{letter}" type="number" min="0" max="200" step="1" bind:value={channel.modulation.depth} />
						</div>
					{:else}
						<div class="field grow">
							<label for="mdev-{letter}">Peak deviation (Hz)</label>
							<input id="mdev-{letter}" type="number" min="0" step="1" bind:value={channel.modulation.deviation} />
						</div>
					{/if}
					<div class="field grow">
						<label for="msrc-{letter}">Modulating signal</label>
						<select id="msrc-{letter}" bind:value={channel.modulation.source}>
							<option value="wave">Waveform</option>
							<option value="file">Audio file</option>
						</select>
					</div>
				</div>
				{#if channel.modulation.source === 'wave'}
					<div class="row split">
						<div class="field grow">
							<label for="mtype-{letter}">Shape</label>
							<select id="mtype-{letter}" bind:value={channel.modulation.wave.type}>
								{#each MOD_WAVE_TYPES as t (t.id)}
									<option value={t.id}>{t.label}</option>
								{/each}
							</select>
						</div>
						{#if channel.modulation.wave.type !== 'noise'}
							<div class="field grow">
								<label for="mfreq-{letter}">Frequency (Hz)</label>
								<input id="mfreq-{letter}" type="number" min="0.01" step="1" bind:value={channel.modulation.wave.frequency} />
							</div>
						{/if}
						{#if hasSymmetry(channel.modulation.wave.type)}
							<div class="field grow">
								<label for="msym-{letter}">{channel.modulation.wave.type === 'square' ? 'Duty (%)' : 'Symmetry (%)'}</label>
								<input id="msym-{letter}" type="number" min="1" max="99" step="1" bind:value={channel.modulation.wave.symmetry} />
							</div>
						{/if}
					</div>
				{:else}
					<div
						class="drop compact"
						class:hovering={modHovering}
						class:filled={channel.modulation.status === 'ready'}
						role="group"
						aria-label="Drop zone for the modulating file of {label}"
						ondragover={(e) => {
							e.preventDefault();
							modHovering = true;
						}}
						ondragleave={() => (modHovering = false)}
						ondrop={onModDrop}
					>
						<input bind:this={modInput} type="file" accept={ACCEPT} onchange={(e) => pickModulator(e.currentTarget.files)} hidden />
						{#if channel.modulation.status === 'empty'}
							<p class="prompt">Drop the modulating file here</p>
							<button type="button" class="small" onclick={() => modInput?.click()}>Choose file</button>
							<p class="formats">mp3, wav, m4a, flac, ogg. The carrier follows this file's envelope (AM) or pitch shifts with it (FM).</p>
						{:else if channel.modulation.status === 'reading'}
							<p class="prompt">Decoding</p>
							<p class="formats">{channel.modulation.file?.name}</p>
						{:else if channel.modulation.status === 'error'}
							<p class="prompt bad">{channel.modulation.error}</p>
							<button type="button" class="small" onclick={() => modInput?.click()}>Try another file</button>
						{:else}
							<p class="filename" title={channel.modulation.file?.name}>{channel.modulation.file?.name}</p>
							<p class="formats">{formatDuration(channel.modulation.buffer?.duration ?? 0)}, sets the length of this side.</p>
							<div class="row">
								<button type="button" class="small ghost" onclick={() => modInput?.click()}>Replace</button>
								<button type="button" class="small ghost" onclick={() => channel.clearModulator()}>Remove</button>
							</div>
						{/if}
					</div>
					<label class="check">
						<input type="checkbox" bind:checked={channel.modulation.normalize} />
						Scale the file so its peak drives full depth
					</label>
				{/if}
			{/if}
		</div>
	{/if}

	<Waveform
		buffer={preview}
		colors={[tone, tone]}
		height={preview && preview.numberOfChannels > 1 ? 84 : 56}
		empty={channel.source === 'file' ? 'no signal' : usesFileModulator ? 'load a modulating file' : 'no signal'}
	/>
	{#if channel.source !== 'file' && preview}
		<p class="formats zoom">preview: first {preview.duration >= 1 ? `${preview.duration.toFixed(1)} s` : `${(preview.duration * 1000).toFixed(0)} ms`}</p>
	{/if}

	{#if channel.active}
		<table>
			<tbody>
				<tr>
					<th scope="row">Length</th>
					<td>{formatDuration(duration)}</td>
				</tr>
				{#if channel.source === 'file'}
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
				{:else}
					<tr>
						<th scope="row">Rendered at</th>
						<td>the output sample rate</td>
					</tr>
				{/if}
			</tbody>
		</table>

		<div class="controls">
			{#if channel.source === 'file' && channel.buffer.numberOfChannels > 1}
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
				<input id="gain-{letter}" type="range" min="-30" max="12" step="0.5" bind:value={channel.gainDb} />
			</div>

			<div class="row split">
				<div class="field grow">
					<label for="trim-{letter}">Trim start (s)</label>
					<input id="trim-{letter}" type="number" min="0" max={duration.toFixed(2)} step="0.1" bind:value={channel.trimSec} />
				</div>
				<div class="field grow">
					<label for="delay-{letter}">Silence before (s)</label>
					<input id="delay-{letter}" type="number" min="0" max="600" step="0.1" bind:value={channel.delaySec} />
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
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 0 1rem 1rem;
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0 -1rem;
		padding: 0.65rem 1rem;
		background: var(--tone);
		color: #fff;
	}

	.letter {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.4rem;
		background: rgba(255, 255, 255, 0.22);
		font-size: 0.85rem;
		font-weight: 700;
	}

	header h3 {
		font-size: 0.95rem;
		font-weight: 500;
	}

	.state {
		margin-left: auto;
		font-size: 0.78rem;
		background: rgba(255, 255, 255, 0.18);
		border-radius: 999px;
		padding: 0.05rem 0.55rem;
	}

	.tabs {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.9rem;
	}

	.tabs button {
		flex: 1;
		padding: 0.4rem 0.5rem;
		font-size: 0.82rem;
		border-radius: var(--radiusSmall);
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--textDim);
		cursor: pointer;
		transition: 0.25s;
	}

	.tabs button:hover {
		border-color: var(--lineStrong);
	}

	.tabs button.active {
		background: var(--tone);
		border-color: var(--tone);
		color: #fff;
	}

	.drop {
		border: 1px dashed var(--lineStrong);
		border-radius: var(--radiusSmall);
		background: var(--surfaceSunk);
		padding: 1.1rem 0.9rem;
		text-align: center;
		transition: border-color 0.3s, background 0.3s;
	}

	.drop.compact {
		padding: 0.8rem 0.9rem;
		margin-top: 0.2rem;
	}

	.drop.hovering {
		border-color: var(--tone);
		background: #fff;
	}

	.drop.filled {
		border-style: solid;
		border-color: var(--line);
		background: var(--surfaceSunk);
		text-align: left;
		padding: 0.75rem 0.9rem;
	}

	.prompt {
		font-size: 0.92rem;
		color: var(--textDim);
		margin-bottom: 0.7rem;
		max-width: none;
	}

	.prompt.bad {
		color: var(--red);
		font-size: 0.85rem;
		line-height: 1.45;
	}

	.formats {
		font-size: 0.72rem;
		color: var(--textFaint);
		margin: 0.7rem 0 0;
		max-width: none;
		word-break: break-word;
	}

	.formats.zoom {
		margin: -0.5rem 0 0;
	}

	.filename {
		font-size: 0.9rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
		max-width: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.gen {
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		background: var(--surfaceSunk);
		padding: 0.8rem 0.9rem 0.5rem;
	}

	.genTitle {
		font-family: var(--mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--textDim);
		margin: 0 0 0.5rem;
		max-width: none;
	}

	.genTitle.spaced {
		margin-top: 0.8rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--line);
	}

	.gen .check {
		margin: 0.2rem 0 0.5rem;
		font-size: 0.85rem;
	}

	.controls {
		border-top: 1px solid var(--line);
		padding-top: 0.9rem;
	}

	.row.split {
		gap: 0.6rem;
		flex-wrap: nowrap;
	}

	/* .row aligns on flex-end, so a leftover margin would offset one field */
	.row.split .field {
		margin-bottom: 0;
	}

	.gen .row.split {
		margin-bottom: 0.6rem;
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
		gap: 1.1rem;
		margin-top: 0.3rem;
	}
</style>
