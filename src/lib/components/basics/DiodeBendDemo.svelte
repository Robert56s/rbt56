<script>
	// How one bent curve makes sidebands. The carrier and the message are
	// added, and the sum goes through a curve modelled as v + b v^2, with v
	// the sum above the bias. The top plot is one message period of the sum
	// and of the bent output. The spectrum below it, on a log axis, has a
	// stem for every frequency the bend creates; the grey curve is the tank,
	// scaled to the carrier's height. A second, linear view zooms on the
	// carrier and its two sidebands, where the tank's width matters. The
	// "after the tank" switch multiplies every stem by the tank's response.
	//   fp, fm   the carrier and the highest message frequency
	//   f0, q0   the tank's resonant frequency and Q as the page designed them
	//   ap, am   the carrier and message amplitudes entered on the page
	import Slider from './Slider.svelte';
	import TimePlot from '../TimePlot.svelte';
	import XYPlot from './XYPlot.svelte';

	let { fp = 40000, fm = 1000, f0 = null, q0 = 16, ap = 1, am = 1 } = $props();

	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	const seedRel = () => (ap > 0 && am >= 0 ? clamp(am / ap, 0, 1) : 1);
	const seedQ = () => clamp(Number.isFinite(q0) ? q0 : 16, 2, 40);
	const seedKey = () => `${fp}|${fm}|${f0}|${q0}|${ap}|${am}`;
	let rel = $state(seedRel()); // A_m / A_p
	let b = $state(0.5); // per volt
	let q = $state(seedQ());
	let tank = $state(false);
	// when the page changes its values, start again from them
	let seeded = seedKey();
	$effect.pre(() => {
		const key = seedKey();
		if (key === seeded) return;
		seeded = key;
		rel = seedRel();
		q = seedQ();
	});

	const P = $derived(ap > 0 ? ap : 1);
	const M = $derived(rel * P);
	const fr = $derived(Number.isFinite(f0) && f0 > 0 ? f0 : fp);
	// the tank's complex response, relative to its peak
	const response = (f) => {
		const x = q * (f / fr - fr / f);
		return { mag: 1 / Math.sqrt(1 + x * x), phase: -Math.atan(x) };
	};

	// every component of v + b v^2, v = P cos(2 pi fp t) + M cos(2 pi fm t)
	const parts = $derived([
		{ f: fm, h: M, label: 'message', color: 'var(--textDim)' },
		{ f: 2 * fm, h: (b * M * M) / 2, label: '2 f_m', color: 'var(--amber)' },
		{ f: fp - fm, h: b * P * M, label: '', color: 'var(--green)' },
		{ f: fp, h: P, label: 'carrier and sidebands', color: 'var(--blue)' },
		{ f: fp + fm, h: b * P * M, label: '', color: 'var(--green)' },
		{ f: 2 * fp, h: (b * P * P) / 2, label: '2 f_p', color: 'var(--amber)' }
	]);
	const offset = $derived((b * (P * P + M * M)) / 2);
	const yTop = $derived(1.2 * Math.max(P, M, b * P * M, (b * P * P) / 2, (b * M * M) / 2));

	// one message period, sum and bent output, and what the tank leaves
	const waves = $derived.by(() => {
		const ratio = fp / fm;
		const N = Math.min(20000, Math.max(1200, Math.round(ratio * 30)));
		const t = new Float64Array(N);
		const sum = new Float64Array(N);
		const bent = new Float64Array(N);
		const after = new Float64Array(N);
		const kept = parts.map((c) => ({ ...c, ...response(c.f) }));
		for (let i = 0; i < N; i++) {
			const tt = i / (N - 1) / fm;
			const v = P * Math.cos(2 * Math.PI * fp * tt) + M * Math.cos(2 * Math.PI * fm * tt);
			t[i] = tt;
			sum[i] = v;
			bent[i] = v + b * v * v;
			let y = 0;
			for (const c of kept) y += c.h * c.mag * Math.cos(2 * Math.PI * c.f * tt + c.phase);
			after[i] = y;
		}
		return { t, sum, bent, after };
	});

	// log spectrum, 100 Hz to 200 kHz, widened when the page's frequencies need it
	const span = $derived({ lo: Math.min(100, fm / 2), hi: Math.max(200000, 2.5 * fp) });
	const curve = $derived.by(() => {
		const K = 400;
		const xs = new Array(K);
		const ys = new Array(K);
		for (let i = 0; i < K; i++) {
			xs[i] = span.lo * (span.hi / span.lo) ** (i / (K - 1));
			ys[i] = P * response(xs[i]).mag;
		}
		return { xs, ys };
	});
	const zoom = $derived.by(() => {
		const K = 200;
		const xs = new Array(K);
		const ys = new Array(K);
		for (let i = 0; i < K; i++) {
			xs[i] = fp - 3 * fm + (6 * fm * i) / (K - 1);
			ys[i] = P * response(xs[i]).mag;
		}
		return { xs, ys };
	});
	const stems = $derived(parts.map((c) => ({ x: c.f, h: tank ? c.h * response(c.f).mag : c.h, label: c.label, color: c.color })));

	const hLow = $derived(response(fp - fm).mag);
	const hHigh = $derived(response(fp + fm).mag);
	const hCar = $derived(response(fp).mag);
	// the three surviving stems as an AM wave: each sideband is n / 2 of the carrier
	const nAfter = $derived((b * M * (hLow + hHigh)) / hCar);
	const band = $derived(fr / q);
	const qEdge = $derived(fr / (2 * fm));
	const weak = $derived(Math.min(hLow, hHigh));
	const kHz = (f) => `${Number((f / 1000).toPrecision(3))} kHz`;
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={rel} label="Message size A_m / A_p" min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} />
		<Slider bind:value={b} label="Bend b (per volt)" min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} />
		<Slider bind:value={q} label="Tank Q" min={2} max={40} log={true} fmt={(v) => v.toFixed(1)} />
		<label class="toggle"><input type="checkbox" bind:checked={tank} /> after the tank</label>
	</div>
	<TimePlot
		series={tank
			? [
					{ t: waves.t, y: waves.bent, color: 'var(--blue)', width: 1 },
					{ t: waves.t, y: waves.after, color: 'var(--green)', width: 1.6 }
				]
			: [
					{ t: waves.t, y: waves.sum, color: 'var(--textDim)', width: 1 },
					{ t: waves.t, y: waves.bent, color: 'var(--blue)', width: 1.4 }
				]}
		unit="ms"
		height={150}
	/>
	<XYPlot
		xs={curve.xs}
		series={[{ ys: curve.ys, color: 'var(--textDim)', width: 1.5 }]}
		bars={stems}
		xLog={true}
		yMin={0}
		yMax={yTop}
		xLabel="frequency (Hz)"
		yLabel="amplitude (V)"
		height={170}
	/>
	<XYPlot
		xs={zoom.xs}
		series={[{ ys: zoom.ys, color: 'var(--textDim)', width: 1.5 }]}
		bars={[
			{ x: fp - fm, h: tank ? b * P * M * hLow : b * P * M, label: 'lower', color: 'var(--green)' },
			{ x: fp, h: tank ? P * hCar : P, label: 'carrier', color: 'var(--blue)' },
			{ x: fp + fm, h: tank ? b * P * M * hHigh : b * P * M, label: 'upper', color: 'var(--green)' }
		]}
		yMin={0}
		yMax={yTop}
		xLabel="near the carrier (Hz)"
		height={120}
	/>
	<p class="mono">
		DC offset b (A_p^2 + A_m^2) / 2 = {offset.toFixed(2)} V, not drawn: zero has no place on a log axis
		<br />
		tank: f_0 = {kHz(fr)}, Q = {q.toFixed(1)}, band f_0 / Q = {band.toFixed(0)} Hz; the sidebands span 2 f_m = {(2 * fm).toFixed(0)} Hz
		{#if tank}
			<br />
			after the tank: carrier {(P * hCar).toFixed(2)} V, sidebands {(b * P * M * hLow).toFixed(2)} V and {(b * P * M * hHigh).toFixed(2)} V, an AM wave of index n = b A_m (|H(f_p - f_m)| + |H(f_p + f_m)|) / |H(f_p)| = {nAfter.toFixed(2)}
		{/if}
	</p>
	<p class="read">
		{tank ? 'Blue: the bent output. Green: what the tank leaves of it, the AM wave.' : b === 0 ? 'Grey and blue: the sum of carrier and message, unbent, one on top of the other.' : 'Grey: the sum of carrier and message. Blue: the same sum bent, its top half fatter than its bottom.'}
		{#if b === 0 || M === 0}
			With {b === 0 ? 'no bend' : 'no message'} there is nothing new: no sidebands, only {b === 0 ? 'the carrier and the message' : 'the carrier and its harmonic'}.
		{:else}
			The bend has made new stems at exactly f_p - f_m and f_p + f_m, {kHz(fp - fm)} and {kHz(fp + fm)}, along with unwanted ones at 2 f_m, 2 f_p and DC.
		{/if}
		{#if tank}
			The tank keeps the three stems around f_p and drops the rest.
			{#if b > 0 && M > 0 && weak < 0.7}
				It is eating a sideband, though: the {hLow < hHigh ? 'lower' : 'upper'} one keeps only {(100 * weak).toFixed(0)} % of its height.
			{/if}
		{:else}
			The switch shows what the tank keeps.
		{/if}
		Past Q = f_0 / (2 f_m), about {qEdge.toFixed(0)} here, the band gets narrower than the sidebands: that is what the sideband margin on the page protects.
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

	.toggle {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		font-size: 0.85rem;
		color: var(--textDim);
		width: fit-content;
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
