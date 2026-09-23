<script>
	// The network that picks the frequency: how much of the signal it
	// passes and how far it turns it, against frequency. The loop can only
	// run where the turn is exactly what the amplifier needs (none for the
	// Wien bridge, half a cycle for a ladder), and the height of the curve
	// there is what the amplifier must make up. The quadrature loop is the
	// other way round: its two integrators turn the wave by half a cycle at
	// every frequency, so the turn picks nothing and the size does, where
	// the whole wave comes back (0 dB). The slider walks a probe frequency
	// along the curves.
	//   kind       'wien' | 'ladder' | 'quadrature'
	//   sections   ladder sections
	//   buffered   ladder with a follower between sections
	//   k          omega0 R C of the design (1 for Wien, 1/sqrt(6) for the plain ladder)
	//   f0         the design frequency, only used to label the axis in hertz
	//   gain       the gain the amplifier must supply at f0
	import { formatHz } from '$lib/modulation/format';
	import { ladderTransfer, wienTransfer } from '$lib/oscillator/loop';
	import Slider from './Slider.svelte';
	import XYPlot from './XYPlot.svelte';

	let { kind = 'wien', sections = 3, buffered = false, k = 1, f0 = 1000, gain = 3 } = $props();

	let probe = $state(1); // f / f0

	// a missing or zero value falls back to the defaults, so nothing divides by zero
	const K = $derived(Number.isFinite(k) && k > 0 ? k : 1);
	const F0 = $derived(Number.isFinite(f0) && f0 > 0 ? f0 : 1000);
	const G = $derived(Number.isFinite(gain) ? gain : 1);
	const needPhase = $derived(kind === 'wien' ? 0 : 180);
	const quadrature = $derived(kind === 'quadrature');

	function transfer(r) {
		// two integrators in a row: 1 / (j omega R C) squared, a flip at every frequency
		if (kind === 'quadrature') return { re: -1 / (r * K) ** 2, im: 0 };
		const p = { re: 0, im: r * K }; // omega R C at this frequency
		return kind === 'wien' ? wienTransfer(p) : ladderTransfer(sections, p, { buffered });
	}

	const M = 240;
	const curves = $derived.by(() => {
		const xs = new Array(M);
		const mag = new Array(M);
		const phase = new Array(M);
		let prev = null;
		for (let i = 0; i < M; i++) {
			const r = 10 ** (-1.5 + (3 * i) / (M - 1)); // f / f0 from 0.03 to 30
			const b = transfer(r);
			xs[i] = r * F0;
			mag[i] = 20 * Math.log10(Math.hypot(b.re, b.im));
			// keep the turn continuous: a ladder passes through half a cycle
			// exactly at f0, where atan2 alone would jump between +180 and -180
			let ph = (180 / Math.PI) * Math.atan2(b.im, b.re);
			if (prev !== null) {
				while (ph - prev > 180) ph -= 360;
				while (ph - prev < -180) ph += 360;
			}
			phase[i] = ph;
			prev = ph;
		}
		// shift the whole curve by whole cycles so that the turn at f0 reads
		// as the turn the loop needs (0 or 180), not an alias of it
		const mid = phase[Math.round(((0 + 1.5) / 3) * (M - 1))];
		const shift = 360 * Math.round((needPhase - mid) / 360);
		for (let i = 0; i < M; i++) phase[i] += shift;
		const b0 = transfer(1);
		const atF0 = Math.hypot(b0.re, b0.im);
		return { xs, mag, phase, atF0, dbF0: 20 * Math.log10(atF0), lo: Math.min(...phase), hi: Math.max(...phase) };
	});

	const at = $derived.by(() => {
		const b = transfer(probe);
		const m = Math.hypot(b.re, b.im);
		// the probe's turn, aligned to the continuous curve so it reads the
		// same as the plot instead of an alias of it
		const i = Math.max(0, Math.min(M - 1, Math.round(((Math.log10(probe) + 1.5) / 3) * (M - 1))));
		const raw = (180 / Math.PI) * Math.atan2(b.im, b.re);
		const phase = raw + 360 * Math.round((curves.phase[i] - raw) / 360);
		return { mag: m, db: 20 * Math.log10(m), phase };
	});
	const dividedBy = $derived(1 / curves.atF0);
</script>

<div class="demo">
	<Slider bind:value={probe} label="Probe frequency f / f0" min={0.03} max={30} log={true} fmt={(v) => `${v.toFixed(2)} f0`} />
	<XYPlot
		xs={curves.xs}
		series={[{ ys: curves.mag, color: 'var(--blue)' }]}
		markers={[{ x: F0, label: 'f0', color: 'var(--textDim)' }, { x: probe * F0, label: 'probe', color: 'var(--green)' }]}
		hlines={[{ y: curves.dbF0, label: quadrature ? '0 dB: the whole wave comes back' : `1/${dividedBy.toFixed(dividedBy < 10 ? 1 : 0)} at f0`, color: 'var(--textDim)' }]}
		xLog={true}
		xLabel="frequency (Hz)"
		yLabel="how much survives (dB)"
		height={170}
	/>
	<XYPlot
		xs={curves.xs}
		series={[{ ys: curves.phase, color: 'var(--blue)' }]}
		markers={[{ x: F0, color: 'var(--textDim)' }, { x: probe * F0, color: 'var(--green)' }]}
		hlines={[{ y: needPhase, label: `${needPhase} degrees: what the loop needs`, color: 'var(--textDim)' }]}
		xLog={true}
		xLabel="frequency (Hz)"
		yLabel="turn (degrees)"
		yMin={curves.lo - 25}
		yMax={curves.hi + 25}
		height={150}
	/>
	{#if quadrature}
		<p class="read">
			At {formatHz(probe * F0)} the two integrators {at.mag >= 1 ? `multiply the wave by ${at.mag.toFixed(at.mag < 10 ? 2 : 0)}` : `pass ${(100 * at.mag).toFixed(1)} percent of the wave`} ({at.db.toFixed(1)} dB) and turn it by {at.phase.toFixed(0)} degrees.
			The turn is 180 degrees at every frequency, so it picks nothing: the whole wave comes back only at f0, and there the inverter needs a gain of {G.toFixed(1)}.
		</p>
	{:else}
		<p class="read">
			At {formatHz(probe * F0)} the network passes {(100 * at.mag).toFixed(1)} percent of the signal ({at.db.toFixed(1)} dB) and turns it by {at.phase.toFixed(0)} degrees.
			The loop needs a turn of exactly {needPhase} degrees, and the curve crosses that value only at f0: that is how the network picks the frequency.
			There it passes 1/{dividedBy.toFixed(dividedBy < 10 ? 1 : 0)} of the signal, so the amplifier has to supply a gain of {G.toFixed(1)} for the trip round the loop to add up to exactly 1.
		</p>
	{/if}
</div>

<style>
	.demo {
		display: grid;
		gap: 0.6rem;
		margin: 0.4rem 0 0.8rem;
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}
</style>
