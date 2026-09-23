<script>
	// One resistor and one capacitor, seen in time: a sine goes in (grey)
	// and the pair's output comes out (blue), smaller and shifted. With the
	// capacitor in the signal path and the resistor to ground, the pair
	// passes fast waves and moves them earlier; with the capacitor to
	// ground it passes slow waves and moves them later. At the corner,
	// 1 / (2 pi R C), either kind passes 71 percent and turns 45 degrees.
	// The sliders hold ratios to the design's own corner and R, so the
	// figure follows the design when the Specification changes.
	//   r0   the design's R, ohms: the R slider starts here
	//   c0   the design's C, farads: held fixed and quoted in the readout
	import { formatFarads, formatHz, formatOhms } from '$lib/modulation/format';
	import TimePlot from '../TimePlot.svelte';
	import Slider from './Slider.svelte';

	let { r0 = 16000, c0 = 10e-9 } = $props();

	let probe = $state(1); // f / fc0, the design's corner
	let rScale = $state(1); // R / r0
	let where = $state('path'); // 'path': capacitor in the signal path; 'ground': capacitor to ground

	// a missing or zero part falls back to the defaults, so nothing divides by zero
	const R0 = $derived(Number.isFinite(r0) && r0 > 0 ? r0 : 16000);
	const C0 = $derived(Number.isFinite(c0) && c0 > 0 ? c0 : 10e-9);
	const fc0 = $derived(1 / (2 * Math.PI * R0 * C0));
	const f = $derived(probe * fc0);
	const r = $derived(rScale * R0);
	const fc = $derived(1 / (2 * Math.PI * r * C0));

	const response = $derived.by(() => {
		const x = 2 * Math.PI * f * r * C0; // f / fc
		const inPath = where === 'path';
		const mag = inPath ? x / Math.sqrt(1 + x * x) : 1 / Math.sqrt(1 + x * x);
		const phase = inPath ? 90 - (180 / Math.PI) * Math.atan(x) : -(180 / Math.PI) * Math.atan(x);
		return { mag, phase };
	});

	const N = 600;
	const traces = $derived.by(() => {
		const t = new Float64Array(N);
		const vin = new Float64Array(N);
		const vout = new Float64Array(N);
		const tEnd = 3 / f; // three cycles of the probe
		const phi = (response.phase * Math.PI) / 180;
		for (let i = 0; i < N; i++) {
			const tt = (i / (N - 1)) * tEnd;
			t[i] = tt;
			vin[i] = Math.sin(2 * Math.PI * f * tt);
			vout[i] = response.mag * Math.sin(2 * Math.PI * f * tt + phi);
		}
		return { t, vin, vout, unit: tEnd >= 1e-3 ? 'ms' : 'us' };
	});

	const shift = $derived(Math.abs(response.phase) < 0.5 ? 'hardly shifts it' : `shifts it ${Math.abs(response.phase).toFixed(0)} degrees ${response.phase > 0 ? 'earlier' : 'later'}`);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={probe} label="Probe frequency" min={1 / 30} max={30} log={true} fmt={(v) => formatHz(v * fc0)} />
		<Slider bind:value={rScale} label="R" min={0.1} max={10} log={true} fmt={(v) => formatOhms(v * R0)} />
		<div class="switch" role="radiogroup" aria-label="Where the capacitor sits">
			<label><input type="radio" bind:group={where} value="path" /> capacitor in the path</label>
			<label><input type="radio" bind:group={where} value="ground" /> capacitor to ground</label>
		</div>
	</div>
	<TimePlot series={[{ t: traces.t, y: traces.vin, color: 'var(--textDim)', width: 1.2 }, { t: traces.t, y: traces.vout, color: 'var(--blue)', width: 2 }]} unit={traces.unit} height={170} yRange={[-1.15, 1.15]} />
	<p class="read">
		Grey: the wave going in. Blue: what the pair passes. At {formatHz(f)} this pair passes {(100 * response.mag).toFixed(1)} percent of the wave and {shift}.
		Its corner, 1 / (2π R C) with R = {formatOhms(r)} and C = {formatFarads(C0)}, is {formatHz(fc)}: the probe sits at {(f / fc).toFixed(2)} times the corner.
	</p>
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

	.switch {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
		font-size: 0.85rem;
		color: var(--textDim);
	}

	.switch label {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}
</style>
