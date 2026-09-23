<script>
	// Getting the message back: rectify the modulated carrier (flip or
	// remove its negative half), then smooth the bumps with one RC. The
	// smoothing slider is RC in carrier periods: too short and the carrier
	// ripple survives, too long and the message itself is smeared. The wave
	// is computed over three message periods and only the last two are
	// drawn, so the filter's start-up stays out of sight. The carrier runs at
	// the page's own ratio to the message, so the corner and the ripple the
	// readout gives are the ones drawn.
	//   n0, fp, fm   the page's preview index, carrier and highest message frequency
	//   rectifier    'full' or 'half', the page's choice
	//   tau0         the starting RC, in carrier periods
	import Slider from './Slider.svelte';
	import TimePlot from '../TimePlot.svelte';

	let { n0 = 0.9, fp = 40000, fm = 1000, rectifier = 'full', tau0 = 3 } = $props();

	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	const seedN = () => clamp(Number.isFinite(n0) ? n0 : 0.9, 0, 1);
	const seedTau = () => clamp(Number.isFinite(tau0) ? tau0 : 3, 0.3, 40);
	const seedMode = () => (rectifier === 'half' ? 'half' : 'full');
	const seedKey = () => `${n0}|${fp}|${fm}|${rectifier}|${tau0}`;
	let n = $state(seedN());
	let tau = $state(seedTau()); // carrier periods
	let mode = $state(seedMode());
	// when the page changes its values, start again from them
	let seeded = seedKey();
	$effect.pre(() => {
		const key = seedKey();
		if (key === seeded) return;
		seeded = key;
		n = seedN();
		tau = seedTau();
		mode = seedMode();
	});

	// carrier cycles per message cycle: the page's own ratio, kept drawable
	const pageRatio = $derived(fp > 0 && fm > 0 ? fp / fm : 40);
	const ratio = $derived(clamp(pageRatio, 4, 80));
	const clamped = $derived(Math.abs(ratio - pageRatio) > 1e-9);
	const fpDraw = $derived(ratio * fm);
	const rc = $derived(tau / fpDraw); // seconds
	const fc = $derived(1 / (2 * Math.PI * rc));
	const ripple = $derived(mode === 'full' ? 2 * fpDraw : fpDraw);
	// what a perfect detector gives: the envelope times the average of a rectified cosine
	const scale = $derived(mode === 'full' ? 2 / Math.PI : 1 / Math.PI);

	const waves = $derived.by(() => {
		const perCycle = 32;
		const N = 3 * Math.round(ratio * perCycle);
		const dx = 3 / N; // in message periods
		const decay = 1 - Math.exp(-dx / (tau / ratio)); // first-order low-pass, exact for a step per sample
		const start = N / 3;
		const M = N - start;
		const t = new Float64Array(M);
		const am = new Float64Array(M);
		const rect = new Float64Array(M);
		const smooth = new Float64Array(M);
		const ideal = new Float64Array(M);
		let y = scale * (1 + n); // the message starts at its crest
		for (let i = 0; i < N; i++) {
			const x = i * dx;
			const env = 1 + n * Math.cos(2 * Math.PI * x);
			const v = env * Math.cos(2 * Math.PI * ratio * x);
			const r = mode === 'full' ? Math.abs(v) : Math.max(0, v);
			y += decay * (r - y);
			if (i < start) continue;
			const j = i - start;
			t[j] = (x - 1) / fm;
			am[j] = v;
			rect[j] = r;
			smooth[j] = y;
			ideal[j] = env * scale;
		}
		return { t, am, rect, smooth, ideal, dx, start };
	});

	// ripple left: the wobble of the green line over one carrier period at
	// the message crest (x = 2), against the recovered swing
	const measure = $derived.by(() => {
		const { smooth, dx, start } = waves;
		let lo = Infinity;
		let hi = -Infinity;
		for (const v of smooth) {
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		const at = (x) => Math.round(x / dx) - start;
		const half = Math.max(1, Math.round(0.5 / ratio / dx));
		const around = (x) => {
			let a = Infinity;
			let b = -Infinity;
			let count = 0;
			for (let j = at(x) - half; j <= at(x) + half; j++) {
				if (j < 0 || j >= smooth.length) continue;
				a = Math.min(a, smooth[j]);
				b = Math.max(b, smooth[j]);
				count++;
			}
			return { wobble: count ? b - a : 0 };
		};
		const crestW = around(2);
		const swing = hi - lo;
		// the recovered message: the green line's component at f_m over the two
		// drawn periods, against the n scale a perfect detector gives
		let re = 0;
		let im = 0;
		for (let j = 0; j < smooth.length; j++) {
			const th = 2 * Math.PI * (j * dx);
			re += smooth[j] * Math.cos(th);
			im += smooth[j] * Math.sin(th);
		}
		const amp = (2 * Math.hypot(re, im)) / smooth.length;
		return {
			ripplePct: swing > 1e-9 ? (100 * crestW.wobble) / swing : 0,
			wobble: crestW.wobble,
			kept: n * scale > 1e-9 ? amp / (n * scale) : 1
		};
	});
	const kHz = (f) => `${Number((f / 1000).toPrecision(3))} kHz`;
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={n} label="Modulation index n" min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} />
		<Slider bind:value={tau} label="Smoothing RC (carrier periods)" min={0.3} max={40} step={0.1} log={true} fmt={(v) => v.toFixed(1)} />
		<div class="ctl">
			<span class="name">Rectifier</span>
			<span class="choice">
				<label><input type="radio" value="full" bind:group={mode} /> full-wave (flip the negative half)</label>
				<label><input type="radio" value="half" bind:group={mode} /> half-wave (drop it)</label>
			</span>
		</div>
	</div>
	<TimePlot series={[{ t: waves.t, y: waves.am, color: 'var(--blue)', width: 1.2 }]} unit="ms" height={130} />
	<TimePlot
		series={[
			{ t: waves.t, y: waves.rect, color: 'var(--textDim)', width: 1 },
			{ t: waves.t, y: waves.smooth, color: 'var(--green)', width: 2 },
			{ t: waves.t, y: waves.ideal, color: 'var(--text)', width: 1.4, dash: [5, 4] }
		]}
		unit="ms"
		height={160}
	/>
	<p class="mono">
		RC = {(rc * 1e6).toFixed(rc < 1e-5 ? 2 : 0)} us, f_c = 1 / (2 pi RC) = {kHz(fc)}; message at {kHz(fm)}, ripple at {kHz(ripple)}; ripple left at the crest: {n > 0.05 ? `${measure.ripplePct.toFixed(0)} % of the recovered swing` : `${measure.wobble.toFixed(3)} V peak to peak`}
	</p>
	<p class="read">
		Top: the modulated carrier. Bottom, grey: after the rectifier, bumps whose heights follow the envelope. Green: after one RC. Dashed: what a perfect detector gives, the envelope times {mode === 'full' ? '2 / pi' : '1 / pi'}.
		{#if clamped}
			The page's carrier runs {Number(pageRatio.toPrecision(3))} cycles per message cycle; the figure draws {ratio.toFixed(0)} so the bumps stay visible, which puts its carrier at {kHz(fpDraw)}.
		{/if}
		{#if n <= 0.05}
			With n this small there is almost no message to recover: the green line settles on the average of the bumps, with the ripple left on it.
		{:else if measure.ripplePct > 10}
			The green line is still hairy with ripple: the corner sits too close to the ripple.
		{:else if n > 0.05 && measure.kept < 0.9}
			The ripple is gone, but the recovered message is only {(100 * measure.kept).toFixed(0)} % of what a perfect detector gives, and it lags and rounds the dips: the corner sits too close to the message.
		{:else}
			Here both are modest: {measure.ripplePct.toFixed(0)} % of ripple, and the message keeps {(100 * measure.kept).toFixed(0)} % of its size. The page's spec asks for far better on both at once.
		{/if}
		{#if mode === 'half'}
			Half-wave puts the ripple at f_p, twice as close to the message, and halves the output.
		{/if}
		One RC cannot remove the ripple and keep the message shape at once, which is why the page's filter is designed to a spec instead.
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

	.ctl {
		display: grid;
		grid-template-columns: minmax(9rem, 14rem) 1fr;
		gap: 0.6rem;
		font-size: 0.85rem;
		align-items: center;
	}

	.name {
		color: var(--textDim);
	}

	.choice {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.choice label {
		display: flex;
		gap: 0.3rem;
		align-items: center;
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
