<script>
	// The output curves of an N-channel FET: drain current against V_DS for
	// a few gate voltages, with the load line of a drain resistor R_D on a
	// supply V_DD and the operating point at the chosen V_GS. The dashed
	// parabola V_DS = V_GS - V_th splits the triode (ohmic) region on its
	// left from the saturation region on its right. The same plot serves the
	// three kinds: only the gate voltages that matter move.
	//   kind   'njfet', 'depletion' or 'enhancement'
	import RichText from '../guides/RichText.svelte';
	import Slider from '../basics/Slider.svelte';
	import XYPlot from '../basics/XYPlot.svelte';
	import { FET_KINDS, fetOperatingPoint } from '$lib/transistors/models';

	let { kind: kind0 = 'enhancement', vdd: vdd0 = 10, rd: rd0 = 1000 } = $props();

	// the gate range each kind is used over: from off (its threshold, or
	// pinch-off) to well on
	function rangeOf(id) {
		const k = FET_KINDS.find((x) => x.id === id) ?? FET_KINDS[2];
		const vth = k.params.vth ?? k.params.vp;
		return k.id === 'njfet' ? [vth, 0] : k.id === 'depletion' ? [vth, vth + 5] : [vth, vth + 4];
	}
	const middle = (id) => 0.5 * (rangeOf(id)[0] + rangeOf(id)[1]);

	let kindId = $state(kind0);
	const kind = $derived(FET_KINDS.find((k) => k.id === kindId) ?? FET_KINDS[2]);
	const range = $derived(rangeOf(kindId));
	const family = $derived(Array.from({ length: 5 }, (_, i) => range[0] + ((range[1] - range[0]) * (i + 1)) / 5));

	let vgs = $state(middle(kind0));
	let vdd = $state(vdd0);
	let rd = $state(rd0);
	// a new kind starts at the middle of its own range
	let seen = kind0;
	$effect.pre(() => {
		if (kindId === seen) return;
		seen = kindId;
		vgs = middle(kindId);
	});

	const model = $derived((v, d) => kind.id_(v, d, kind.params));
	const N = 160;
	const xMax = $derived(Math.max(1, vdd) * 1.05);
	const vdss = $derived(Array.from({ length: N }, (_, i) => (xMax * i) / (N - 1)));
	const curve = (v) => vdss.map((d) => 1000 * model(v, d).id);
	const curves = $derived(family.map((v) => ({ v, ys: curve(v) })));
	const chosen = $derived(curve(vgs));
	const op = $derived(fetOperatingPoint(model, vgs, vdd, rd));
	const yMax = $derived(Math.max(...curves[curves.length - 1].ys, 1000 * op.id, 0.5) * 1.12);
	const line = $derived.by(() => {
		const v0 = Math.max(0, vdd - (yMax / 1000) * rd);
		const xs = [v0, vdd];
		return { xs, ys: xs.map((d) => (1000 * (vdd - d)) / rd) };
	});
	// the edge of saturation: V_DS = V_GS - V_th, where I_D = (k / 2) V_DS^2
	const kk = $derived(kind.params.k ?? (2 * kind.params.idss) / (kind.params.vp * kind.params.vp));
	const edge = $derived(vdss.map((d) => {
		const y = 1000 * 0.5 * kk * d * d * (1 + (kind.params.lambda ?? 0) * d);
		return y > yMax ? NaN : y;
	}));
	const ohms = (r) => (r >= 1000 ? `${(r / 1000).toFixed(2)} kΩ` : `${r.toFixed(0)} Ω`);
	const regionName = { off: 'off', triode: 'triode (ohmic)', saturation: 'saturation' };
	const reading = $derived(
		op.region === 'off'
			? `The gate is past ${kind.id === 'njfet' ? 'pinch-off' : 'threshold'}: the channel is closed and the whole supply sits across it.`
			: op.region === 'saturation'
				? 'Right of the dashed edge the curves are flat: the current depends on $V_{GS}$ and hardly on $V_{DS}$. This is where a FET amplifies, and its name clashes with the BJT: FET saturation behaves like the BJT active region.'
				: 'Left of the dashed edge the channel acts as a resistor whose value the gate sets. A FET used as a switch sits here, fully on, and its datasheet gives that resistance as $R_{DS(on)}$.'
	);
</script>

<div class="demo">
	<div class="controls">
		<div class="seg" role="group" aria-label="Transistor kind">
			{#each FET_KINDS as k (k.id)}
				<button type="button" class:on={kindId === k.id} onclick={() => (kindId = k.id)}>{k.label}</button>
			{/each}
		</div>
		<Slider bind:value={vgs} label={'Gate-source voltage $V_{GS}$'} min={range[0] - 1} max={range[1] + (kind.id === 'njfet' ? 0.5 : 1)} step={0.05} fmt={(v) => `${v.toFixed(2)} V`} />
		<Slider bind:value={vdd} label={'Supply $V_{DD}$'} min={1} max={15} step={0.5} fmt={(v) => `${v.toFixed(1)} V`} />
		<Slider bind:value={rd} label={'Drain resistor $R_D$'} min={100} max={10000} log fmt={ohms} />
	</div>
	<XYPlot
		xs={vdss}
		series={[
			{ ys: edge, color: 'var(--textFaint)', width: 1, dash: [3, 3] },
			...curves.map((c) => ({ ys: c.ys, color: 'var(--lineStrong)', width: 1.2, endLabel: `${c.v.toFixed(1)} V` })),
			{ ys: chosen, color: 'var(--blue)', width: 2.2 },
			{ xs: line.xs, ys: line.ys, color: 'var(--red)', width: 1.5, dash: [6, 4] }
		]}
		points={[{ x: op.vds, y: 1000 * op.id, label: regionName[op.region], color: op.region === 'triode' ? 'var(--amber)' : op.region === 'off' ? 'var(--textDim)' : 'var(--green)' }]}
		xLabel="V_DS (V)"
		yLabel="I_D (mA)"
		yMin={0}
		yMax={yMax}
		height={230}
	/>
	<p class="mono">
		{regionName[op.region]}: V_DS = {op.vds.toFixed(2)} V, I_D = {(1000 * op.id).toFixed(2)} mA{#if op.region === 'triode' && op.vds > 0.001}, channel about {ohms(op.vds / op.id)}{/if}
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
		gap: 0.4rem;
	}

	.seg {
		display: flex;
		flex-wrap: wrap;
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
