<script>
	// One RC section drawn on the spec's Bode axes. The shaded corners are
	// the two forbidden zones the four numbers of panel 01 draw: too much
	// loss before fp, not enough loss from fs on (mirrored for a high-pass).
	// R and C set the corner fc = 1/(2 pi R C); the curve turns red where it
	// enters a zone. It starts with C = 10 nF and R unrounded so that the
	// corner sits exactly on fp, and follows fp until a slider is moved.
	//   kind              'lowpass' | 'highpass' (a band type passes its low-pass side)
	//   fp, fs            the two edges, Hz
	//   amaxDb, aminDb    the two limits
	//   live              true when the numbers come from the page, false for the default spec
	//   side              'bandpass' | 'bandstop' when the figure stands for a band type's low-pass side
	import { formatFarads, formatOhms } from '$lib/filter/format';
	import { butterworthOrder } from '$lib/filter/order';
	import Slider from './Slider.svelte';
	import XYPlot from './XYPlot.svelte';
	import { dbText, frameBottom, hzText, logSpace, plain, specFrame, specZones } from './bodeFigure.js';

	let { kind = 'lowpass', fp = 10000, fs = 35000, amaxDb = 3, aminDb = 40, live = false, side = '' } = $props();

	const C0 = 10e-9;
	const R_MIN = 100;
	const R_MAX = 1e6;
	const Y_MAX = 10;
	const high = $derived(kind === 'highpass');

	// the corner exactly on the passband edge, unrounded: the nearest E24
	// value would already put the loss at fp a hair over Amax
	const rPage = $derived(Math.min(R_MAX, Math.max(R_MIN, 1 / (2 * Math.PI * fp * C0))));
	let ownR = $state(null);
	let ownC = $state(null);
	const R = $derived(ownR ?? rPage);
	const C = $derived(ownC ?? C0);
	const fc = $derived(1 / (2 * Math.PI * R * C));

	const dbAt = (f) => -10 * Math.log10(1 + (high ? fc / f : f / fc) ** 2);
	const frame = $derived(specFrame(kind, fp, fs));
	const yMin = $derived(frameBottom(aminDb));
	const xs = $derived(logSpace(frame.x0, frame.x1, 240));
	const ys = $derived(xs.map(dbAt));
	const zones = $derived(specZones({ kind, fp, fs, amaxDb, aminDb, x0: frame.x0, x1: frame.x1, yMin, yMax: Y_MAX }));

	const lossFp = $derived(-dbAt(fp));
	const lossFs = $derived(-dbAt(fs));
	// judged at the precision the readout shows, 0.1 dB
	const passOk = $derived(Number(lossFp.toFixed(1)) <= amaxDb);
	const stopOk = $derived(Number(lossFs.toFixed(1)) >= aminDb);
	// some corner clears both zones only when one slope is enough: order 1
	const oneEnough = $derived(butterworthOrder(amaxDb, aminDb, high ? fs / fp : fp / fs) <= 1);

	const notice = $derived.by(() => {
		let first;
		if (passOk && stopOk) first = 'This corner clears both zones: one RC section is enough for this spec, and the tool then builds a single first-order stage.';
		else if (passOk) first = `The passband is safe, but fs gets only ${dbText(lossFs)} dB of the ${plain(aminDb)} dB it needs: the curve is red over the stopband.`;
		else if (stopOk) first = `The stopband is deep enough, but fp already loses ${dbText(lossFp)} dB, more than the ${plain(amaxDb)} dB allowed: the curve is red over the passband.`;
		else first = 'The curve is red at both ends: too much loss at fp and not enough at fs.';
		// the corner on screen is judged first, so the two sentences never disagree
		// when the readout's 0.1 dB rounding lets a borderline spec through
		let second;
		if (passOk && stopOk) second = 'R and C only slide the corner; the slope stays 20 dB per decade.';
		else if (!oneEnough) second = 'R and C only slide the corner and the slope stays 20 dB per decade, so with this spec no corner position clears both zones.';
		else second = 'This spec is loose enough that some corner position does clear both zones.';
		return `${first} ${second}`;
	});

	const caption = $derived(
		!live
			? 'The page has no valid spec yet, so the figure uses the default one: 10 kHz, 35 kHz, 3 dB and 40 dB.'
			: side === 'bandpass'
				? 'For a band-pass the figure shows the low-pass side: fp here is fh and fs is fsh.'
				: side === 'bandstop'
					? 'For a band-stop the figure shows the low-pass branch: fp here is fl and fs is fsl.'
					: ''
	);
	const markers = $derived([...(fc >= frame.x0 && fc <= frame.x1 ? [{ x: fc, label: `fc = ${hzText(fc)}`, color: 'var(--blue)' }] : []), ...zones.markers]);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={() => R, (v) => (ownR = v)} label="R" min={R_MIN} max={R_MAX} log={true} fmt={formatOhms} />
		<Slider bind:value={() => C, (v) => (ownC = v)} label="C" min={100e-12} max={1e-6} log={true} fmt={formatFarads} />
	</div>
	<XYPlot
		{xs}
		series={[{ ys, color: 'var(--blue)', width: 2, altWhen: zones.inZone }]}
		boxes={zones.boxes}
		{markers}
		hlines={zones.hlines}
		xLog={true}
		xLabel="frequency (Hz)"
		yLabel="gain (dB)"
		{yMin}
		yMax={Y_MAX}
		yStep={10}
		height={200}
	/>
	<p class="mono">
		corner {hzText(fc)}. loss at fp <span class={passOk ? 'ok' : 'bad'}>{dbText(lossFp)} dB</span> (limit {plain(amaxDb)}). loss at fs
		<span class={stopOk ? 'ok' : 'bad'}>{dbText(lossFs)} dB</span> (needs {plain(aminDb)})
	</p>
	<p class="read">
		Shaded: the two forbidden zones, drawn from Amax, Amin, fp and fs. {notice}
		{caption}
	</p>
	{#if ownR !== null || ownC !== null}
		<button
			type="button"
			class="reset"
			onclick={() => {
				ownR = null;
				ownC = null;
			}}>back to the page's values</button
		>
	{/if}
</div>

<style>
	.demo {
		display: grid;
		gap: 0.6rem;
		margin: 0.4rem 0 0.8rem;
	}

	.controls {
		display: grid;
		gap: 0.3rem;
	}

	.mono {
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.ok {
		color: var(--green);
	}

	.bad {
		color: var(--red, #c92a2a);
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}

	.reset {
		justify-self: start;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.8rem;
		color: var(--blue);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
