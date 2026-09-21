<script>
	// One channel of the live signal generator: shape, frequency, level,
	// and an optional AM/FM modulation by a second waveform. The object in
	// `channel` is the page's state; every field here writes straight into
	// it, and the page pushes it to the audio worklet on each change.
	import { gainToDb } from '$lib/audio/decode';
	import { formatDb, formatHz } from '$lib/audio/format';
	import { MOD_WAVE_TYPES, WAVE_TYPES, hasEdges, hasSymmetry } from '$lib/audio/wavegen';

	let { channel, label, letter, tone, nyquist } = $props();

	const FREQ_MIN = 1;
	const sliderMax = $derived(Math.max(FREQ_MIN * 10, nyquist));

	// log slider from FREQ_MIN to nyquist, 0..1000 steps
	const sliderPos = $derived.by(() => {
		const f = Math.max(FREQ_MIN, Math.min(sliderMax, Number(channel.wave.frequency) || FREQ_MIN));
		return Math.round((1000 * Math.log(f / FREQ_MIN)) / Math.log(sliderMax / FREQ_MIN));
	});
	function fromSlider(pos) {
		const f = FREQ_MIN * Math.pow(sliderMax / FREQ_MIN, Number(pos) / 1000);
		channel.wave.frequency = f >= 1000 ? Math.round(f) : Math.round(f * 10) / 10;
	}

	const levelDb = $derived.by(() => {
		const a = Math.abs(Number(channel.wave.amplitude) || 0);
		return a > 0 ? formatDb(gainToDb(a)) : 'silence';
	});
	const peak = $derived(Math.abs(Number(channel.wave.amplitude) || 0) + Math.abs(Number(channel.wave.offset) || 0));
	const overNyquist = $derived(Number(channel.wave.frequency) > nyquist);
	const fmTop = $derived(Number(channel.wave.frequency) + Math.abs(Number(channel.modulation.deviation) || 0));
</script>

<section class="chan" class:on={channel.enabled} style="--tone: {tone}">
	<header>
		<span class="letter">{letter}</span>
		<h3>{label}</h3>
		<label class="toggle">
			<input type="checkbox" bind:checked={channel.enabled} />
			<span>{channel.enabled ? 'on' : 'off'}</span>
		</label>
	</header>

	<div class="grid">
		<div class="field">
			<label for="shape-{letter}">Shape</label>
			<select id="shape-{letter}" bind:value={channel.wave.type}>
				{#each WAVE_TYPES as t (t.id)}
					<option value={t.id}>{t.label}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="freq-{letter}">Frequency (Hz), up to {formatHz(nyquist)}</label>
			<input id="freq-{letter}" type="number" min={FREQ_MIN} max={nyquist} step="1" bind:value={channel.wave.frequency} />
		</div>
		<div class="field">
			<label for="amp-{letter}">Amplitude (0 to 1 of full scale) <span class="dim">{levelDb}</span></label>
			<input id="amp-{letter}" type="number" min="0" max="1" step="0.01" bind:value={channel.wave.amplitude} />
		</div>
		<div class="field">
			<label for="off-{letter}">DC offset (fraction of full scale)</label>
			<input id="off-{letter}" type="number" min="-1" max="1" step="0.01" bind:value={channel.wave.offset} />
		</div>
		<div class="field">
			<label for="phase-{letter}">Phase (degrees)</label>
			<input id="phase-{letter}" type="number" step="1" bind:value={channel.wave.phase} />
		</div>
		{#if hasSymmetry(channel.wave.type)}
			<div class="field">
				<label for="sym-{letter}">{channel.wave.type === 'square' ? 'Duty cycle (%)' : 'Symmetry (%)'}</label>
				<input id="sym-{letter}" type="number" min="1" max="99" step="1" bind:value={channel.wave.symmetry} />
			</div>
		{/if}
	</div>

	<div class="slider">
		<input type="range" min="0" max="1000" step="1" value={sliderPos} oninput={(e) => fromSlider(e.currentTarget.value)} aria-label="frequency, logarithmic" />
		<div class="ticks">
			<span>{formatHz(FREQ_MIN)}</span>
			<span>{formatHz(Math.sqrt(FREQ_MIN * sliderMax))}</span>
			<span>{formatHz(sliderMax)}</span>
		</div>
	</div>

	{#if hasEdges(channel.wave.type)}
		<label class="check">
			<input type="checkbox" bind:checked={channel.wave.ideal} />
			Ideal edges (no anti-aliasing: sharper on a scope, aliases audibly at high frequencies)
		</label>
	{/if}

	<details class="mod" open={channel.modulation.kind !== 'none'}>
		<summary>Modulation: {channel.modulation.kind === 'none' ? 'none' : channel.modulation.kind.toUpperCase()}</summary>
		<div class="grid">
			<div class="field">
				<label for="mkind-{letter}">Kind</label>
				<select id="mkind-{letter}" bind:value={channel.modulation.kind}>
					<option value="none">None</option>
					<option value="am">AM (amplitude)</option>
					<option value="fm">FM (frequency)</option>
				</select>
			</div>
			{#if channel.modulation.kind === 'am'}
				<div class="field">
					<label for="mdepth-{letter}">Depth (%)</label>
					<input id="mdepth-{letter}" type="number" min="0" max="200" step="1" bind:value={channel.modulation.depth} />
				</div>
			{:else if channel.modulation.kind === 'fm'}
				<div class="field">
					<label for="mdev-{letter}">Peak deviation (Hz)</label>
					<input id="mdev-{letter}" type="number" min="0" step="1" bind:value={channel.modulation.deviation} />
				</div>
			{/if}
			{#if channel.modulation.kind !== 'none'}
				<div class="field">
					<label for="mshape-{letter}">Modulating shape</label>
					<select id="mshape-{letter}" bind:value={channel.modulation.wave.type}>
						{#each MOD_WAVE_TYPES as t (t.id)}
							<option value={t.id}>{t.label}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="mfreq-{letter}">Modulating frequency (Hz)</label>
					<input id="mfreq-{letter}" type="number" min="0.01" step="1" bind:value={channel.modulation.wave.frequency} />
				</div>
				{#if hasSymmetry(channel.modulation.wave.type)}
					<div class="field">
						<label for="msym-{letter}">{channel.modulation.wave.type === 'square' ? 'Duty cycle (%)' : 'Symmetry (%)'}</label>
						<input id="msym-{letter}" type="number" min="1" max="99" step="1" bind:value={channel.modulation.wave.symmetry} />
					</div>
				{/if}
			{/if}
		</div>
	</details>

	{#if overNyquist}
		<p class="flag bad">{formatHz(Number(channel.wave.frequency))} is above half the sample rate ({formatHz(nyquist)}): the output cannot hold it and would alias to a wrong tone. The generator clamps it.</p>
	{/if}
	{#if channel.modulation.kind === 'fm' && fmTop > nyquist}
		<p class="flag warn">Carrier plus deviation reaches {formatHz(fmTop)}, above {formatHz(nyquist)}.</p>
	{/if}
	{#if channel.modulation.kind === 'am' && Number(channel.modulation.depth) > 100}
		<p class="flag warn">Depth above 100 %: the envelope folds over (overmodulation).</p>
	{/if}
	{#if peak > 1.0001}
		<p class="flag warn">Amplitude plus offset reaches {peak.toFixed(2)} of full scale: the output will clip.</p>
	{/if}
</section>

<style>
	.chan {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1.1rem 1.2rem;
		background: var(--surface);
		border-top: 3px solid var(--line);
	}

	.chan.on {
		border-top-color: var(--tone);
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 0.9rem;
	}

	header h3 {
		margin: 0;
		font-size: 1rem;
		flex: 1;
	}

	.letter {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 50%;
		background: var(--tone);
		color: white;
		font-family: var(--mono);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--mono);
		font-size: 0.85rem;
		color: var(--textDim);
		cursor: pointer;
	}

	.toggle input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--tone);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 0.7rem 1rem;
	}

	.dim {
		color: var(--textDim);
		font-family: var(--mono);
		font-size: 0.75rem;
		margin-left: 0.4rem;
	}

	.slider {
		margin: 0.7rem 0 0.4rem;
	}

	.slider input {
		width: 100%;
		accent-color: var(--tone);
	}

	.ticks {
		display: flex;
		justify-content: space-between;
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--textDim);
	}

	.check {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
		font-size: 0.85rem;
		color: var(--textDim);
		margin: 0.5rem 0;
	}

	.check input {
		margin-top: 0.15rem;
		accent-color: var(--tone);
	}

	.mod {
		margin-top: 0.6rem;
		border-top: 1px dashed var(--line);
		padding-top: 0.6rem;
	}

	.mod summary {
		cursor: pointer;
		font-family: var(--mono);
		font-size: 0.85rem;
		color: var(--blue);
		margin-bottom: 0.6rem;
	}

	.flag {
		margin: 0.7rem 0 0;
	}
</style>
