<script>
	// The amplifier chip is not infinitely fast: a stage of gain N built on
	// an op-amp of gain-bandwidth GBW answers late, by atan(f N / GBW). The
	// figure draws that lag against frequency; the sliders are the frequency
	// asked for and the speed of the chip, so it shows why a faster chip or
	// a lower frequency keeps the oscillator honest, and where the page
	// starts to flag the design.
	//   gbw        the chip's gain-bandwidth, Hz
	//   noiseGain  the gain N the stage runs at (3 for a Wien bridge)
	//   f0         the design frequency, the slider's starting point
	//   limitDeg   the lag past which the page rules the design untrusted
	import Slider from './Slider.svelte';
	import XYPlot from './XYPlot.svelte';

	let { gbw = 3e6, noiseGain = 3, f0 = 1000, limitDeg = 25 } = $props();

	// a missing or zero value falls back to the defaults, so nothing divides by zero
	const finite = (x, fallback) => (Number.isFinite(x) && x > 0 ? x : fallback);
	const seedF = () => Math.min(1e6, Math.max(20, finite(f0, 1000)));
	const seedSpeed = () => Math.min(3e7, Math.max(3e5, finite(gbw, 3e6)));
	let f = $state(seedF());
	let speed = $state(seedSpeed());
	// when the page's design changes, start again from its values
	const seedKey = () => `${f0}|${gbw}`;
	let seeded = seedKey();
	$effect.pre(() => {
		const key = seedKey();
		if (key === seeded) return;
		seeded = key;
		f = seedF();
		speed = seedSpeed();
	});
	const N = $derived(finite(noiseGain, 3));
	const LIMIT = $derived(finite(limitDeg, 25));

	const lag = (freq, g) => (180 / Math.PI) * Math.atan((freq * N) / g);
	const M = 200;
	const curve = $derived.by(() => {
		const xs = new Array(M);
		const ys = new Array(M);
		for (let i = 0; i < M; i++) {
			xs[i] = 10 ** (1 + (6 * i) / (M - 1)); // 10 Hz to 10 MHz
			ys[i] = lag(xs[i], speed);
		}
		return { xs, ys };
	});
	const at = $derived(lag(f, speed));
	const bandwidth = $derived(speed / N);
	const hz = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)} MHz` : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${v.toFixed(0)} Hz`);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={f} label="Frequency asked for" min={20} max={1e6} log={true} fmt={hz} />
		<Slider bind:value={speed} label="Chip speed (gain-bandwidth)" min={3e5} max={3e7} log={true} fmt={hz} />
	</div>
	<XYPlot
		xs={curve.xs}
		series={[{ ys: curve.ys, color: 'var(--blue)' }]}
		markers={[{ x: f, label: 'asked for', color: 'var(--green)' }, { x: bandwidth, label: 'GBW / N', color: 'var(--textDim)' }]}
		hlines={[{ y: LIMIT, label: `${LIMIT} degrees: past this the page stops trusting the design`, color: 'var(--textDim)' }]}
		xLog={true}
		xLabel="frequency (Hz)"
		yLabel="lag of one stage (degrees)"
		yMin={0}
		yMax={90}
		height={170}
	/>
	<p class="read">
		A stage of gain {N.toFixed(1)} on a chip of {hz(speed)} gain-bandwidth only keeps that gain up to about {hz(bandwidth)}, and it answers late well before that:
		at {hz(f)} it lags by {at.toFixed(1)} degrees. {at < 5 ? 'That is small, and the tool corrects it exactly by retuning R and C.' : at < LIMIT ? 'The tool folds that lag into the loop and retunes R and C to land on the frequency anyway.' : 'That is more than the correction can be trusted with: a faster chip, a lower frequency or a circuit that asks less gain of each stage is the answer.'}
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
</style>
