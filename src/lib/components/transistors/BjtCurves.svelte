<script>
	// The output curves of an NPN, the way a curve tracer draws them: the
	// collector current against V_CE for a few fixed base currents. A
	// collector resistor R_C on a supply V_CC adds the load line, and the
	// operating point is where the load line crosses the curve of the base
	// current chosen with the slider. Sliding the base current up walks the
	// point along the line from cutoff, through the active region, into
	// saturation, where the curve can no longer reach the line and I_C / I_B
	// falls below beta.
	//   vcc, rc, ib   starting values (V, ohms, A)
	import RichText from '../guides/RichText.svelte';
	import Slider from '../basics/Slider.svelte';
	import XYPlot from '../basics/XYPlot.svelte';
	import { bjtOperatingPoint, icForIb, SMALL_NPN } from '$lib/transistors/models';

	let { vcc: vcc0 = 10, rc: rc0 = 1000, ib: ib0 = 20e-6 } = $props();

	let ibUa = $state(ib0 * 1e6);
	let vcc = $state(vcc0);
	let rc = $state(rc0);

	const FAMILY = [10, 20, 40, 60, 80, 100];
	const N = 160;
	const xMax = $derived(Math.max(1, vcc) * 1.05);
	const vces = $derived(Array.from({ length: N }, (_, i) => (xMax * i) / (N - 1)));
	const curve = (ua) => vces.map((v) => 1000 * icForIb(ua * 1e-6, v));
	const family = $derived(FAMILY.map((ua) => ({ ua, ys: curve(ua) })));
	const chosen = $derived(curve(ibUa));
	const op = $derived(bjtOperatingPoint(ibUa * 1e-6, vcc, rc));
	const yMax = $derived(Math.max(...family[family.length - 1].ys, 1000 * op.ic, 0.1) * 1.12);
	// the load line, drawn only where it lies inside the plot
	const line = $derived.by(() => {
		const v0 = Math.max(0, vcc - (yMax / 1000) * rc);
		const xs = [v0, vcc];
		return { xs, ys: xs.map((v) => (1000 * (vcc - v)) / rc) };
	});
	const beta = SMALL_NPN.betaF;
	const ratio = $derived(ibUa > 0 ? op.ic / (ibUa * 1e-6) : 0);
	const mA = (a) => (a >= 1e-3 ? `${(a * 1000).toFixed(2)} mA` : `${(a * 1e6).toFixed(1)} µA`);
	const ohms = (r) => (r >= 1000 ? `${(r / 1000).toFixed(2)} kΩ` : `${r.toFixed(0)} Ω`);
	const REGION = { cutoff: 'cutoff', active: 'active', saturation: 'saturation' };
	const reading = $derived(
		op.region === 'cutoff'
			? 'No base current, no collector current: the transistor is an open switch and the whole supply sits across it, $V_{CE} = V_{CC}$.'
			: op.region === 'active'
				? `The base current picks a curve and the curve is nearly flat: $I_C$ is about $\\beta I_B$ ($\\beta$ about ${beta} here) whatever $V_{CE}$ does. The resistor turns that current into a voltage, which is how the transistor amplifies.`
				: `The load line ends at $I_C = V_{CC} / R_C$ = ${mA(vcc / rc)}. More base current cannot push the collector current past it, so the point slides into the knee near $V_{CE}$ = 0.1 V, and $I_C / I_B$ drops to ${ratio.toFixed(0)}, well under $\\beta$. That is the closed switch. A switch design asks for this on purpose, with $I_B$ about $I_C / 10$.`
	);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={ibUa} label={'Base current $I_B$'} min={0} max={150} step={1} fmt={(v) => `${v.toFixed(0)} µA`} />
		<Slider bind:value={vcc} label={'Supply $V_{CC}$'} min={1} max={15} step={0.5} fmt={(v) => `${v.toFixed(1)} V`} />
		<Slider bind:value={rc} label={'Collector resistor $R_C$'} min={100} max={10000} log fmt={ohms} />
	</div>
	<XYPlot
		xs={vces}
		series={[
			...family.map((f) => ({ ys: f.ys, color: 'var(--lineStrong)', width: 1.2, endLabel: `${f.ua} µA` })),
			{ ys: chosen, color: 'var(--blue)', width: 2.2 },
			{ xs: line.xs, ys: line.ys, color: 'var(--red)', width: 1.5, dash: [6, 4] }
		]}
		points={[{ x: op.vce, y: 1000 * op.ic, label: REGION[op.region], color: op.region === 'saturation' ? 'var(--amber)' : op.region === 'cutoff' ? 'var(--textDim)' : 'var(--green)' }]}
		xLabel="V_CE (V)"
		yLabel="I_C (mA)"
		yMin={0}
		yMax={yMax}
		height={230}
	/>
	<p class="mono">
		{REGION[op.region]}: V_CE = {op.vce.toFixed(2)} V, I_C = {mA(op.ic)}, V_BE = {op.vbe.toFixed(3)} V{#if ibUa > 0}, I_C / I_B = {ratio.toFixed(0)}{/if}, P = {(1000 * op.vce * op.ic).toFixed(1)} mW
	</p>
	<p class="read"><RichText text={reading} /></p>
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
