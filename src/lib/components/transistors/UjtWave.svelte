<script>
	// The capacitor voltage of a UJT relaxation oscillator: it charges
	// through R toward the supply, and when it reaches the peak point
	// V_P = eta V_BB + V_D the emitter conducts and dumps it down to the
	// valley voltage, over and over. The sawtooth is drawn exactly from those
	// two thresholds; the readout compares the period with the textbook
	// approximation R C ln(1 / (1 - eta)), which ignores V_D and the valley.
	//   r, c       charging resistor (ohms) and capacitor (farads)
	//   eta        intrinsic stand-off ratio
	//   vbb        supply, V
	//   vv, vd     valley voltage and emitter diode drop, V
	import Slider from '../basics/Slider.svelte';
	import XYPlot from '../basics/XYPlot.svelte';

	let { r: r0 = 47000, c: c0 = 100e-9, eta: eta0 = 0.65, vbb = 12, vv = 2, vd = 0.6 } = $props();

	let r = $state(r0);
	let c = $state(c0);
	let eta = $state(eta0);

	const vp = $derived(eta * vbb + vd);
	const tau = $derived(r * c);
	// charging from the valley to the peak point
	const period = $derived(tau * Math.log((vbb - vv) / (vbb - vp)));
	const approx = $derived(tau * Math.log(1 / (1 - eta)));
	const wave = $derived.by(() => {
		const n = 3;
		const xs = [];
		const ys = [];
		// the first charge starts from 0 V, the next ones from the valley
		const first = tau * Math.log(vbb / (vbb - vp));
		const steps = 60;
		let t0 = 0;
		for (let k = 0; k <= n; k++) {
			const from = k === 0 ? 0 : vv;
			const span = k === 0 ? first : period;
			for (let i = 0; i <= steps; i++) {
				const t = (span * i) / steps;
				xs.push(1000 * (t0 + t));
				ys.push(vbb - (vbb - from) * Math.exp(-t / tau));
			}
			t0 += span;
			// the discharge, fast enough to draw as a vertical drop
			xs.push(1000 * t0);
			ys.push(vv);
		}
		return { xs, ys };
	});
	const ms = (s) => (s >= 1 ? `${s.toFixed(2)} s` : s >= 1e-3 ? `${(1000 * s).toFixed(2)} ms` : `${(1e6 * s).toFixed(0)} µs`);
	const kohm = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)} MΩ` : `${(v / 1000).toFixed(1)} kΩ`);
	const nf = (v) => (v >= 1e-6 ? `${(v * 1e6).toFixed(2)} µF` : `${(v * 1e9).toFixed(0)} nF`);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={r} label="Charging resistor R" min={2200} max={1e6} log fmt={kohm} />
		<Slider bind:value={c} label="Capacitor C" min={1e-9} max={10e-6} log fmt={nf} />
		<Slider bind:value={eta} label={'Stand-off ratio $\\eta$'} min={0.5} max={0.85} step={0.01} fmt={(v) => v.toFixed(2)} />
	</div>
	<XYPlot
		xs={wave.xs}
		series={[{ ys: wave.ys, color: 'var(--blue)', width: 2 }]}
		hlines={[
			{ y: vp, label: `peak point ${vp.toFixed(2)} V`, color: 'var(--amber)' },
			{ y: vv, label: `valley ${vv} V`, color: 'var(--textDim)' }
		]}
		xLabel="time (ms)"
		yLabel="capacitor (V)"
		yMin={0}
		yMax={vbb}
		height={200}
	/>
	<p class="mono">
		period {ms(period)}, {(1 / period).toFixed(period > 0.1 ? 2 : 0)} Hz; R C ln(1 / (1 - eta)) gives {ms(approx)}
	</p>
	<p class="read">
		The period scales with R C. The supply hardly matters, because the peak point is a fixed fraction of it: that is what made the UJT a timing part. The approximation drops the diode drop and the valley voltage, so it misses by some percent.
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
		overflow-wrap: anywhere;
	}
</style>
