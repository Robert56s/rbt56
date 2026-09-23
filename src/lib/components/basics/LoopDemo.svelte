<script>
	// A loop that feeds itself: every trip round multiplies the wave by the
	// loop gain A beta. Below 1 it dies, at exactly 1 it holds, above 1 it
	// grows. With the limiter on, the gain falls as the wave gets bigger,
	// so a loop set a little above 1 grows and then parks at a definite
	// size. The slider is the loop gain; the plot is the wave over thirty
	// trips, one cycle per trip.
	import Slider from './Slider.svelte';
	import TimePlot from '../TimePlot.svelte';

	let { excess0 = 0.05, f0 = 1000, target = 3 } = $props();

	// a missing or zero value falls back to the defaults, so nothing divides by zero
	const finite = (x, fallback) => (Number.isFinite(x) && x > 0 ? x : fallback);
	const seedGain = () => 1 + Math.min(0.15, Math.max(0.02, Number.isFinite(excess0) ? excess0 : 0.05));
	let loopGain = $state(seedGain());
	// when the page's design changes, start again from its excess gain
	const seedKey = () => excess0;
	let seeded = seedKey();
	$effect.pre(() => {
		const key = seedKey();
		if (key === seeded) return;
		seeded = key;
		loopGain = seedGain();
	});
	let limiter = $state(true);
	const cycles = 30;
	const perCycle = 48;
	const F0 = $derived(finite(f0, 1000));
	const TARGET = $derived(finite(target, 3));

	const wave = $derived.by(() => {
		const N = cycles * perCycle;
		const t = new Float64Array(N);
		const y = new Float64Array(N);
		const env = new Float64Array(N);
		let a = 0.3 * TARGET; // the size the wave starts with, 0.3 of the target
		for (let c = 0; c < cycles; c++) {
			for (let i = 0; i < perCycle; i++) {
				const k = c * perCycle + i;
				const x = c + i / perCycle;
				t[k] = x / F0;
				y[k] = a * Math.sin(2 * Math.PI * x);
				env[k] = a;
			}
			// one trip round: the limiter takes the gain down as the wave grows
			const g = limiter ? 1 + (loopGain - 1) * (1 - Math.min(1.5, (a / TARGET) ** 6)) : loopGain;
			a = Math.min(10, a * g);
		}
		return { t, y, env, last: env[N - 1] };
	});
	const verdict = $derived(loopGain < 0.995 ? 'dies away' : loopGain <= 1.005 ? 'holds its size, on a knife edge' : limiter ? `grows, then parks near ${TARGET.toFixed(1)} V where the limiter brings the gain back to 1` : 'grows without limit');
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={loopGain} label="Loop gain A beta" min={0.9} max={1.15} step={0.005} fmt={(v) => v.toFixed(3)} />
		<label class="toggle"><input type="checkbox" bind:checked={limiter} /> amplitude limiter in the loop</label>
	</div>
	<TimePlot series={[{ t: wave.t, y: wave.y, color: 'var(--blue)', width: 1.6 }, { t: wave.t, y: wave.env, color: 'var(--text)', width: 1.2, dash: [4, 4] }]} unit="ms" height={190} />
	<p class="read">
		Each trip round the loop multiplies the wave by {loopGain.toFixed(3)}: it {verdict}. After {cycles} cycles the wave is {wave.last.toFixed(2)} V.
		A real oscillator is set a few percent above 1 so that it always starts, and the limiter, not the gain, decides the size it ends up at.
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
		font-size: 0.85rem;
		color: var(--textDim);
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}
</style>
