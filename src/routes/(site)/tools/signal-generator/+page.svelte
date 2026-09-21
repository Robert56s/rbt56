<script>
	import { onDestroy } from 'svelte';
	import GeneratorChannel from '$lib/components/GeneratorChannel.svelte';
	import ScopeView from '$lib/components/ScopeView.svelte';
	import { formatHz } from '$lib/audio/format';
	import { LiveGenerator } from '$lib/audio/liveGenerator';

	// The audio side lives outside the reactive state: an AudioContext is
	// not data, and it only exists after the first click.
	const generator = new LiveGenerator();
	let running = $state(false);
	let starting = $state(false);
	let sampleRate = $state(null); // what the browser actually runs at, once started
	let latency = $state(null);
	let requestedRate = $state(0); // 0 = device default
	let error = $state('');

	function channelDefaults(frequency) {
		return {
			enabled: true,
			wave: { type: 'sine', frequency, amplitude: 0.5, offset: 0, phase: 0, symmetry: 50, ideal: false },
			modulation: { kind: 'none', depth: 50, deviation: 100, source: 'wave', wave: { type: 'sine', frequency: 100, phase: 0, symmetry: 50 } }
		};
	}
	let left = $state(channelDefaults(1000));
	let right = $state({ ...channelDefaults(1000), enabled: false });

	// Before the output is open the sample rate is unknown; 48 kHz is what
	// most devices run at, and the real figure replaces it on start.
	const nyquist = $derived((sampleRate ?? 48000) / 2);

	// what the worklet receives: the modulation object only when one is on,
	// and the frequency clamped to what the output can hold
	function settingsOf(ch) {
		const snap = $state.snapshot(ch);
		const wave = { ...snap.wave, frequency: Math.min(Number(snap.wave.frequency) || 0, nyquist) };
		const modulation = snap.modulation.kind === 'none' ? null : { ...snap.modulation, source: 'wave' };
		return { wave, modulation, enabled: snap.enabled };
	}

	// every knob change goes straight to the audio thread
	$effect(() => {
		generator.update(0, settingsOf(left));
	});
	$effect(() => {
		generator.update(1, settingsOf(right));
	});

	async function start() {
		starting = true;
		error = '';
		try {
			await generator.start({ sampleRate: requestedRate || null });
			if (generator.error) {
				error = generator.error;
				return;
			}
			sampleRate = generator.sampleRate;
			latency = generator.latency;
			running = generator.running;
			generator.update(0, settingsOf(left));
			generator.update(1, settingsOf(right));
		} catch (e) {
			error = e?.message || String(e);
		} finally {
			starting = false;
		}
	}

	async function stop() {
		await generator.stop();
		running = generator.running;
	}

	onDestroy(() => {
		generator.close();
	});

	const referenceHz = $derived(left.enabled ? Number(left.wave.frequency) || 1000 : Number(right.wave.frequency) || 1000);
</script>

<svelte:head>
	<title>Signal Generator · rbt56</title>
	<meta
		name="description"
		content="A live two-channel signal generator on the computer's audio output: sine, square, triangle, ramps, noise, AM and FM, on the left and right channels, up to what the sound card can hold."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 05</p>
	<h1>Signal Generator</h1>
	<p class="lead">
		A function generator on the computer's headphone or line output, live: two independent channels
		on left and right, each a sine, square, triangle, ramp, DC or noise, with an optional AM or FM
		by a second waveform. The frequency goes as high as the sound card's sample rate allows, and a
		scope shows what is being sent.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>Output</h2>
			<span class="hint">{running ? 'running' : sampleRate ? 'stopped' : 'not started'}</span>
		</div>
		<div class="row controls">
			{#if running}
				<button type="button" onclick={stop}>Stop</button>
			{:else}
				<button type="button" onclick={start} disabled={starting}>{starting ? 'Opening the output...' : sampleRate ? 'Resume' : 'Start'}</button>
			{/if}
			<div class="field">
				<label for="rate">Sample rate to ask the browser for</label>
				<select id="rate" bind:value={requestedRate} disabled={sampleRate !== null}>
					<option value={0}>Device default</option>
					<option value={44100}>44.1 kHz</option>
					<option value={48000}>48 kHz</option>
					<option value={96000}>96 kHz</option>
					<option value={192000}>192 kHz</option>
				</select>
			</div>
		</div>
		<table class="status">
			<tbody>
				<tr><td>Sample rate in use</td><td>{sampleRate ? formatHz(sampleRate) : 'unknown until started (48 kHz assumed)'}</td></tr>
				<tr><td>Highest frequency the output can hold</td><td>{formatHz(nyquist)} (half the sample rate)</td></tr>
				<tr><td>Output latency reported</td><td>{latency !== null ? `${(latency * 1000).toFixed(1)} ms` : 'unknown until started'}</td></tr>
			</tbody>
		</table>
		{#if error}
			<p class="flag bad">{error}</p>
		{/if}
		<p class="note">
			Browsers open the audio output only after a click, hence the button. The rate shown is what
			the browser runs at; a request the hardware cannot meet is resampled by the browser, and
			nothing above the hardware's own half rate survives that. The rate can only be chosen before
			the first start; reload the page to change it afterwards.
		</p>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">02</span>
			<h2>Channels</h2>
			<span class="hint">left and right, independent</span>
		</div>
		<div class="channels">
			<GeneratorChannel channel={left} label="Left channel" letter="L" tone="var(--blue)" {nyquist} />
			<GeneratorChannel channel={right} label="Right channel" letter="R" tone="#d9480f" {nyquist} />
		</div>
		<p class="note">
			Amplitude and offset are fractions of full scale (1 = 0 dBFS, the loudest the output can
			produce; what that is in volts depends on the sound card and the volume setting, usually
			around 1 V peak at maximum). Square, ramps and triangles are anti-aliased so they stay clean
			at high frequencies; "ideal edges" switches that off.
		</p>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">03</span>
			<h2>Scope</h2>
			<span class="hint">what the output is sending</span>
		</div>
		<ScopeView {generator} {running} {referenceHz} colors={['#2f6fed', '#d9480f']} />
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">04</span>
			<h2>What a sound card can and cannot do</h2>
		</div>
		<ul class="notes">
			<li>
				The digital limit is half the sample rate: {formatHz(nyquist)} here. The analog output adds its
				own: the reconstruction filter and the output stage of a typical card roll off above about
				20 kHz whatever the sample rate, so a tone set to 30 kHz at 96 kHz may come out much weaker
				than expected, or not at all.
			</li>
			<li>
				Outputs are AC-coupled. A DC offset, or the DC shape, is produced in the digital signal but
				a capacitor in the output path removes it before the jack, and very low frequencies (under
				about 20 Hz) are attenuated the same way.
			</li>
			<li>
				The output is a line or headphone level, a volt or so at most, from an impedance of a few
				ohms to a few tens of ohms. For a circuit that needs more, an amplifier stage follows; for
				a carrier above the audio band, a real function generator is the right instrument.
			</li>
			<li>
				The same shapes and modulation can be rendered to a file, with a music track as the
				modulating signal, in the <a href="/tools/stereo/">Stereo L/R</a> tool.
			</li>
		</ul>
	</section>
</article>

<style>
	.controls {
		align-items: flex-end;
		gap: 1.2rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.controls button {
		min-width: 9rem;
		padding: 0.7rem 1.2rem;
		font-size: 1rem;
	}

	.controls .field {
		margin-bottom: 0;
		min-width: 220px;
	}

	.status td:first-child {
		color: var(--textDim);
	}

	.channels {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.notes {
		margin: 0;
		padding-left: 1.2rem;
		color: var(--textDim);
		line-height: 1.55;
	}

	.notes li + li {
		margin-top: 0.5rem;
	}
</style>
