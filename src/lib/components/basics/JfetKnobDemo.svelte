<script>
	// The JFET as a volume knob turned by a voltage. The plot is the
	// channel's conductance against gate voltage, a straight line from zero
	// at the pinch-off voltage V_P. One slider moves the gate by hand, the
	// way the message does on every cycle; the green marker follows it. The
	// other is the message swing s, a fraction of the half line |V_P| / 2:
	// the two grey markers are where the message takes the gate at its
	// trough and at its crest, either side of the bias point. The readout
	// turns the green marker into the cell's gain and output, and the grey
	// ones into K_min, K_max and the modulation index they give.
	//   vp, beta   the straight line G = beta (V_GS - V_P); idss is used when beta is absent
	//   topology   'noninverting' (JFET under R_b) or 'inverting' (JFET as the input resistor)
	//   feedback   R_b or R_2, ohms
	//   ac         the carrier's size at the channel, V peak
	//   s0         the swing the page's gate drive delivers, as a fraction of |V_P| / 2
	//   vc         the gate's bias point, V (V_P / 2 when absent)
	import Slider from './Slider.svelte';
	import XYPlot from './XYPlot.svelte';

	let { vp = -4, beta = null, idss = 5e-3, topology = 'noninverting', feedback = 10000, ac = 0.1, s0 = 0.9, vc = null } = $props();

	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	const slope = $derived(Number.isFinite(beta) && beta > 0 ? beta : (2 * idss) / (vp * vp));
	const half = $derived(Math.abs(vp) / 2);
	const bias = $derived(Number.isFinite(vc) && vc > vp && vc < 0 ? vc : vp / 2);
	const inverting = $derived(topology === 'inverting');

	const seedGate = () => (Number.isFinite(vc) && vc > vp && vc < 0 ? vc : vp / 2);
	const seedSwing = () => clamp(Number.isFinite(s0) ? s0 : 0.9, 0, 1);
	const seedKey = () => `${vp}|${beta}|${idss}|${s0}|${vc}`;
	let gate = $state(seedGate());
	let s = $state(seedSwing());
	// when the page changes the part or the design, start again from its values
	let seeded = seedKey();
	$effect.pre(() => {
		const key = seedKey();
		if (key === seeded) return;
		seeded = key;
		gate = seedGate();
		s = seedSwing();
	});

	const conductance = (v) => Math.max(0, slope * (Math.min(0, v) - vp));
	const cellGain = (g) => (inverting ? feedback * g : 1 + feedback * g);
	const g = $derived(conductance(gate));
	const k = $derived(cellGain(g));
	// the message takes the gate this far either side of the bias
	const swingV = $derived(s * half);
	const trough = $derived(bias - swingV);
	const crest = $derived(bias + swingV);
	const gMin = $derived(conductance(trough));
	const gMax = $derived(conductance(crest));
	const kMin = $derived(cellGain(gMin));
	const kMax = $derived(cellGain(gMax));
	const index = $derived(kMax + kMin > 0 ? (kMax - kMin) / (kMax + kMin) : 0);
	// how far the conductance itself swings: the index with nothing added to it
	const depth = $derived(gMax + gMin > 0 ? (gMax - gMin) / (gMax + gMin) : 0);
	const pastEnd = $derived(trough < vp || crest > 0);

	const M = 120;
	const line = $derived.by(() => {
		const xs = new Array(M);
		const ys = new Array(M);
		for (let i = 0; i < M; i++) {
			xs[i] = vp + ((0 - vp) * i) / (M - 1);
			ys[i] = 1000 * slope * (xs[i] - vp);
		}
		return { xs, ys };
	});
	const ohms = (x) => (x === Infinity ? 'open' : x >= 1000 ? `${(x / 1000).toFixed(2)} k` : `${x.toFixed(0)} ohm`);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={gate} label="Gate voltage V_GS" min={vp} max={0} step={0.01} fmt={(v) => `${v.toFixed(2)} V`} />
		<Slider bind:value={s} label="Message swing s (of |V_P| / 2)" min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} />
	</div>
	<XYPlot
		xs={line.xs}
		series={[{ ys: line.ys, color: 'var(--blue)' }]}
		boxes={[{ x0: Math.max(vp, trough), x1: Math.min(0, crest), y0: 0, y1: 1000 * slope * -vp, color: 'var(--green)' }]}
		markers={[
			{ x: gate, label: 'gate', color: 'var(--green)' },
			{ x: Math.max(vp, trough), label: 'trough', color: 'var(--textDim)' },
			{ x: Math.min(0, crest), label: 'crest', color: 'var(--textDim)' }
		]}
		xLabel="V_GS (V)"
		yLabel="conductance G (mS)"
		yMin={0}
		height={160}
	/>
	<p class="mono">
		gate {gate.toFixed(2)} V: G = {(1000 * g).toFixed(3)} mS, r_DS = {ohms(g > 0 ? 1 / g : Infinity)}, K = {inverting ? 'R_2 G' : '1 + R_b G'} = {k.toFixed(2)}, carrier out K A_c = {(k * ac).toFixed(2)} V
		<br />
		trough {trough.toFixed(2)} V, crest {crest.toFixed(2)} V: K_min = {kMin.toFixed(2)}, K_max = {kMax.toFixed(2)}, n = (K_max - K_min) / (K_max + K_min) = {index.toFixed(2)}
	</p>
	<p class="read">
		Moving the gate by hand is what the message does on every cycle. The line is straight, so equal steps of gate voltage give equal steps of conductance, and the gain follows the message without bending it.
		{#if inverting}
			With no 1 added, n equals the conductance depth, {depth.toFixed(2)}, whatever R_2 is: R_2 = {ohms(feedback)} only sets the size.
		{:else}
			The fixed 1 in K = 1 + R_b G keeps K_min above 1, so n = {index.toFixed(2)} stays below the conductance depth {depth.toFixed(2)}, even at full swing. The larger R_b is next to the channel, the less the 1 counts: R_b = {ohms(feedback)} here.
		{/if}
		{#if pastEnd}
			Here the swing runs off the end of the line: {trough < vp ? 'past V_P the channel is simply open' : 'past 0 V the gate starts to conduct'}, so the envelope flattens on that side. The page keeps the swing inside the line.
		{/if}
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
