<script>
	// What amplitude modulation looks like: a carrier whose height follows
	// the message. Three sliders: the modulation index, how many carrier
	// cycles fit in one message cycle, and the carrier size. The envelope is
	// drawn dashed. Below the wave, the same signal sorted by frequency: the
	// carrier and its two sidebands, then a ruler from 0 Hz that shows the
	// message moved from near zero up to the carrier. In the diode mode the
	// band the tank passes is shaded on the spectrum.
	//   n0, fp, fm, ap0   the page's index, carrier, message and carrier size
	//   f0, bw            the tank's centre and bandwidth, diode mode only
	import Slider from './Slider.svelte';
	import TimePlot from '../TimePlot.svelte';
	import XYPlot from './XYPlot.svelte';

	let { n0 = 0.85, fp = 55000, fm = 1000, ap0 = 1, f0 = null, bw = null } = $props();

	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	// the page's own ratio of carrier to message, when it has one
	const pageRatio = () => (fp > 0 && fm > 0 && Number.isFinite(fp / fm) ? Math.round(fp / fm) : 40);
	// the cycles slider reaches the page's ratio, up to 80 cycles per message cycle
	const ratioMax = $derived(clamp(pageRatio(), 40, 80));
	const seedKey = () => `${n0}|${fp}|${fm}|${ap0}`;

	const seedN = () => clamp(Number.isFinite(n0) ? n0 : 0.85, 0, 1.3);
	const seedRatio = () => clamp(pageRatio(), 6, 80);
	const seedAp = () => clamp(Number.isFinite(ap0) ? ap0 : 1, 0.2, 2);

	let n = $state(seedN());
	let ratio = $state(seedRatio());
	let ap = $state(seedAp());
	// when the page changes the seeds (another mode, other values), start again from them
	let seeded = seedKey();
	$effect.pre(() => {
		const key = seedKey();
		if (key === seeded) return;
		seeded = key;
		n = seedN();
		ratio = seedRatio();
		ap = seedAp();
	});

	// the carrier stays at fp; the message follows the cycles slider
	const fmFig = $derived(fp / ratio);
	const waves = $derived.by(() => {
		const N = Math.max(1500, ratio * 2 * 24);
		const t = new Float64Array(N);
		const carrier = new Float64Array(N);
		const envUp = new Float64Array(N);
		const envDown = new Float64Array(N);
		const message = new Float64Array(N);
		// two message cycles across the window
		for (let i = 0; i < N; i++) {
			const x = (2 * i) / (N - 1);
			const m = Math.cos(2 * Math.PI * x);
			const env = ap * (1 + n * m);
			t[i] = x / fmFig;
			message[i] = ap * n * m;
			envUp[i] = env;
			envDown[i] = -env;
			carrier[i] = env * Math.cos(2 * Math.PI * ratio * x);
		}
		return { t, carrier, envUp, envDown, message };
	});
	const vmax = $derived(ap * (1 + n));
	const vmin = $derived(ap * Math.abs(1 - n));
	const nRead = $derived((vmax - vmin) / (vmax + vmin));
	const side = $derived((n * ap) / 2);
	const kHz = (f) => `${Number((f / 1000).toPrecision(3))} kHz`;

	// the tank band, diode mode only
	const tank = $derived(Number.isFinite(f0) && Number.isFinite(bw) && f0 > 0 && bw > 0 ? { lo: f0 - bw / 2, hi: f0 + bw / 2 } : null);
	const lowOut = $derived(tank ? fp - fmFig < tank.lo : false);
	const highOut = $derived(tank ? fp + fmFig > tank.hi : false);
	const tankLine = $derived.by(() => {
		if (!tank) return '';
		if (lowOut && highOut) return 'Both side stems sit outside the shaded band: the tank would shrink them both, which is what the sideband margin on the page guards against.';
		if (lowOut || highOut) {
			// a band off the carrier pushes one side out even with the margin
			const off = Math.abs(f0 - fp) > 0.05 * bw ? ` The band is centred on ${kHz(f0)}, not on the ${kHz(fp)} carrier, which pushes that side out.` : '';
			return `The ${lowOut ? 'lower' : 'upper'} side stem sits outside the shaded band: the tank shrinks it.${off} The sideband margin on the page is there to keep both inside.`;
		}
		return 'Both side stems sit inside the shaded band the tank passes. Fewer carrier cycles per message cycle push them out.';
	});
	const specMax = $derived(ap * 1.3);
	const rulerMax = $derived(ap * 1.5);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={n} label="Modulation index n" min={0} max={1.3} step={0.01} fmt={(v) => v.toFixed(2)} />
		<Slider bind:value={ratio} label="Carrier cycles per message cycle" min={6} max={ratioMax} step={1} fmt={(v) => String(v)} />
		<Slider bind:value={ap} label="Carrier size A_p" min={0.2} max={2} step={0.01} fmt={(v) => `${v.toFixed(2)} V`} />
	</div>
	<TimePlot
		series={[
			{ t: waves.t, y: waves.carrier, color: 'var(--blue)', width: 1.2 },
			{ t: waves.t, y: waves.envUp, color: 'var(--text)', width: 1.6, dash: [5, 4] },
			{ t: waves.t, y: waves.envDown, color: 'var(--text)', width: 1.6, dash: [5, 4] },
			{ t: waves.t, y: waves.message, color: 'var(--green)', width: 1.4 }
		]}
		unit="ms"
		height={200}
	/>
	<p class="mono">
		V_max = A_p (1 + n) = {vmax.toFixed(2)} V, V_min = A_p |1 - n| = {vmin.toFixed(2)} V, n read back = (V_max - V_min) / (V_max + V_min) = {nRead.toFixed(2)}
	</p>
	<p class="read">
		Blue: the modulated carrier. Dashed: its envelope. Green: the message alone.
		{#if n > 1}
			Past n = 1 the envelope has folded: the carrier flips phase at the dips and the peaks give back {nRead.toFixed(2)}, not {n.toFixed(2)}. A detector that reads heights cannot undo that.
		{:else}
			The envelope keeps the shape of the message, so the two cursor readings give n straight back.
		{/if}
	</p>
	<XYPlot
		xs={[fp - 3 * fmFig, fp + 3 * fmFig]}
		bars={[
			{ x: fp - fmFig, h: side, label: `lower ${kHz(fp - fmFig)}`, color: 'var(--green)' },
			{ x: fp, h: ap, label: `carrier ${kHz(fp)}`, color: 'var(--blue)' },
			{ x: fp + fmFig, h: side, label: `upper ${kHz(fp + fmFig)}`, color: 'var(--green)' }
		]}
		markers={[{ x: fp - 2 * fmFig }, { x: fp + 2 * fmFig }]}
		boxes={tank ? [{ x0: tank.lo, x1: tank.hi, y0: 0, y1: specMax, label: 'tank passes', color: 'var(--textDim)' }] : []}
		yMin={0}
		yMax={specMax}
		xLabel="frequency (Hz)"
		yLabel="amplitude (V)"
		height={150}
	/>
	<XYPlot
		xs={[0, 1.2 * fp]}
		series={[
			{ xs: [fmFig, 0.975 * fp], ys: [0.5 * ap, 0.5 * ap], color: 'var(--textDim)', width: 1.5, dash: [2, 3] },
			{ xs: [0.945 * fp, 0.975 * fp], ys: [0.75 * ap, 0.5 * ap], color: 'var(--textDim)', width: 1.5 },
			{ xs: [0.945 * fp, 0.975 * fp], ys: [0.25 * ap, 0.5 * ap], color: 'var(--textDim)', width: 1.5 }
		]}
		bars={[
			{ x: fmFig, h: n * ap, label: 'message before', color: 'var(--textDim)' },
			{ x: fp, h: ap, label: 'after', color: 'var(--blue)' }
		]}
		yMin={0}
		yMax={rulerMax}
		height={84}
	/>
	<p class="mono">
		sidebands n A_p / 2 = {side.toFixed(3)} V each, at {kHz(fp - fmFig)} and {kHz(fp + fmFig)}; width 2 f_m = {kHz(2 * fmFig)}
	</p>
	<p class="read">
		The carrier stem stays at {ap.toFixed(2)} V whatever n is: n only grows the two side stems. Nothing stands at f_m = {kHz(fmFig)} on the upper axis; the ruler below it, a frequency axis starting at 0 Hz, shows the whole message moved from near zero up to the carrier.
		{#if pageRatio() > ratioMax}
			The page's message, {kHz(fm)}, fits {pageRatio()} carrier cycles, too many to draw: the figure stops at {ratioMax}.
		{/if}
		{tankLine}
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

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}

	.mono {
		font-family: var(--mono);
		font-size: 0.78rem;
		color: var(--text);
		overflow-wrap: anywhere;
	}
</style>
