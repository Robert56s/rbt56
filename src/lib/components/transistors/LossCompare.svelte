<script>
	// Conduction loss of a MOSFET against an IGBT as the current grows. A
	// MOSFET fully on is a resistor, so its loss is I^2 R_DS(on) and climbs
	// as the square; an IGBT drops a knee voltage plus a little resistance,
	// so its loss climbs about linearly. Past the current where the two meet
	// the IGBT wastes less: that crossing is why high-current, high-voltage
	// switches are IGBTs. Sliders set both parts and the operating current.
	//   rds    the MOSFET's R_DS(on) when hot, ohms
	//   v0     the IGBT's knee voltage, V
	//   r      the IGBT's slope resistance, ohms
	//   imax   the end of the current axis, A
	import Slider from '../basics/Slider.svelte';
	import XYPlot from '../basics/XYPlot.svelte';

	let { rds: rds0 = 0.08, v0: v00 = 0.9, r: r0 = 0.025, imax = 40 } = $props();

	let rds = $state(rds0);
	let v0 = $state(v00);
	let current = $state(imax / 3);

	const N = 120;
	const xs = $derived(Array.from({ length: N }, (_, i) => (imax * i) / (N - 1)));
	const mos = (i) => i * i * rds;
	const igbt = (i) => (v0 + r0 * i) * i;
	// where I^2 R = (V0 + r I) I, that is I = V0 / (R - r), when R > r
	const cross = $derived(rds > r0 ? v0 / (rds - r0) : Infinity);
	const better = $derived(mos(current) <= igbt(current) ? 'MOSFET' : 'IGBT');
	const w = (p) => (p >= 10 ? p.toFixed(0) : p.toFixed(1));
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={current} label="Current" min={0} max={imax} step={0.5} fmt={(v) => `${v.toFixed(1)} A`} />
		<Slider bind:value={rds} label={'MOSFET $R_{DS(on)}$, hot'} min={0.005} max={0.5} log fmt={(v) => `${(1000 * v).toFixed(0)} mΩ`} />
		<Slider bind:value={v0} label="IGBT knee voltage" min={0.5} max={1.5} step={0.05} fmt={(v) => `${v.toFixed(2)} V`} />
	</div>
	<XYPlot
		{xs}
		series={[
			{ ys: xs.map(mos), color: 'var(--blue)', width: 2, endLabel: 'MOSFET' },
			{ ys: xs.map(igbt), color: '#d9480f', width: 2, endLabel: 'IGBT' }
		]}
		markers={[{ x: current, label: 'now', color: 'var(--textDim)' }, ...(cross < imax ? [{ x: cross, label: 'equal loss', color: 'var(--amber)' }] : [])]}
		points={[
			{ x: current, y: mos(current), color: 'var(--blue)' },
			{ x: current, y: igbt(current), color: '#d9480f' }
		]}
		xLabel="current (A)"
		yLabel="conduction loss (W)"
		yMin={0}
		height={220}
	/>
	<p class="mono">
		at {current.toFixed(1)} A: MOSFET {w(mos(current))} W, IGBT {w(igbt(current))} W (voltage across it {(v0 + r0 * current).toFixed(2)} V){#if cross < Infinity}; equal at {cross.toFixed(1)} A{/if}
	</p>
	<p class="read">
		{better === 'MOSFET'
			? 'Below the crossing the MOSFET wins: a resistor drops less than any junction at small current.'
			: 'Above the crossing the IGBT wins: its drop stays near one junction voltage while the resistor of a MOSFET drops more and more.'}
		Switching losses come on top of these and favour the MOSFET, more so as the frequency rises.
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
