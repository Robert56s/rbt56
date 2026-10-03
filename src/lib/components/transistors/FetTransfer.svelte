<script>
	// The three kinds of field-effect transistor on one set of axes: drain
	// current against gate-source voltage, in saturation (V_DS = 10 V). One
	// slider moves the gate; each curve shows where its part sits. At
	// V_GS = 0 two of them already conduct (normally on) and one does not
	// (normally off), which is the whole difference between the symbols with
	// a solid channel line and the one with a broken line. The P switch
	// mirrors everything: negative V_GS turns a P-channel part on.
	//   channel   'n' or 'p'
	import Slider from '../basics/Slider.svelte';
	import XYPlot from '../basics/XYPlot.svelte';
	import { FET_KINDS } from '$lib/transistors/models';

	let { channel: channel0 = 'n' } = $props();
	let channel = $state(channel0);
	let vgs = $state(0);

	const VDS = 10;
	const Y_MAX = 60;
	const COLORS = { njfet: 'var(--green)', depletion: 'var(--amber)', enhancement: 'var(--blue)' };
	const sign = $derived(channel === 'p' ? -1 : 1);
	const xs = Array.from({ length: 201 }, (_, i) => -6 + (12 * i) / 200);
	// a P part is the N curve read with every voltage negated; the plot shows
	// the size of the current, which flows the other way
	const curves = $derived(
		FET_KINDS.map((k) => ({
			kind: k,
			ys: xs.map((v) => {
				const r = k.id_(sign * v, VDS, k.params);
				// past the top of the plot the line stops instead of running along the edge
				return (k.id === 'njfet' && sign * v > 0.5) || 1000 * r.id > Y_MAX ? NaN : 1000 * r.id;
			})
		}))
	);
	const readings = $derived(
		FET_KINDS.map((k) => {
			const r = k.id_(sign * vgs, VDS, k.params);
			const gateOn = k.id === 'njfet' && sign * vgs > 0.5;
			return { kind: k, id: r.id, on: r.id > 0, gateOn };
		})
	);
	const p = $derived(channel === 'p' ? 'P' : 'N');
	const label = (k) => k.label.replace('N-', `${p}-`);
</script>

<div class="demo">
	<div class="controls">
		<div class="seg" role="group" aria-label="Channel type">
			<button type="button" class:on={channel === 'n'} onclick={() => (channel = 'n')}>N-channel</button>
			<button type="button" class:on={channel === 'p'} onclick={() => (channel = 'p')}>P-channel</button>
		</div>
		<Slider bind:value={vgs} label="Gate-source voltage V_GS" min={-6} max={6} step={0.05} fmt={(v) => `${v.toFixed(2)} V`} />
	</div>
	<XYPlot
		{xs}
		series={curves.map((c) => ({ ys: c.ys, color: COLORS[c.kind.id], width: 2 }))}
		markers={[{ x: vgs, label: 'V_GS', color: 'var(--textDim)' }]}
		points={readings.filter((r) => !r.gateOn).map((r) => ({ x: vgs, y: 1000 * r.id, color: COLORS[r.kind.id] }))}
		xLabel="V_GS (V)"
		yLabel={channel === 'p' ? '|I_D| (mA)' : 'I_D (mA)'}
		yMin={0}
		yMax={Y_MAX}
		height={220}
	/>
	<ul class="legend">
		{#each readings as r (r.kind.id)}
			<li>
				<i style="background: {COLORS[r.kind.id]}"></i>
				<span class="name">{label(r.kind)}</span>
				<span class="mono">
					{#if r.gateOn}
						gate junction conducts
					{:else if r.on}
						on, {(1000 * r.id).toFixed(1)} mA
					{:else}
						off
					{/if}
				</span>
				<span class="dim">normally {r.kind.normally}</span>
			</li>
		{/each}
	</ul>
	<p class="read">
		{#if channel === 'n'}
			At V_GS = 0 the JFET and the depletion MOSFET already carry current: a negative gate voltage is needed to turn them off. The enhancement MOSFET is off at 0 V and starts only above its threshold, here +2 V. The JFET curve stops near +0.5 V because its gate is a diode junction that conducts past that point; a MOSFET gate is insulated and can go either way.
		{:else}
			Every voltage flips sign: the P-channel enhancement MOSFET turns on when the gate goes below the source, and the P-channel JFET and depletion MOSFET turn off when the gate goes above it. The shapes are the same as the N-channel ones.
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
		gap: 0.5rem;
	}

	.seg {
		display: inline-flex;
		gap: 0.3rem;
	}

	.seg button {
		font-size: 0.8rem;
		padding: 0.3rem 0.8rem;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--lineStrong);
	}

	.seg button.on {
		background: var(--blue);
		border-color: var(--blue);
		color: #fff;
	}

	.legend {
		list-style: none;
		display: grid;
		gap: 0.25rem;
		font-size: 0.85rem;
	}

	.legend li {
		display: grid;
		grid-template-columns: 0.9rem minmax(11rem, max-content) minmax(9rem, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
	}

	.legend i {
		width: 0.9rem;
		height: 0.25rem;
		border-radius: 999px;
	}

	.mono {
		font-family: var(--mono);
		font-size: 0.78rem;
	}

	.dim {
		color: var(--textDim);
		font-size: 0.8rem;
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}

	@media (max-width: 620px) {
		.legend li {
			grid-template-columns: 0.9rem 1fr;
		}

		.legend .mono,
		.legend .dim {
			grid-column: 2;
		}
	}
</style>
