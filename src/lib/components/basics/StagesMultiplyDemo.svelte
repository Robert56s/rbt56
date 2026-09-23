<script>
	// Two stages multiply: each second-order stage of panel 03 as a thin
	// curve, their product (the whole filter) as the thick one, on a
	// frequency axis from f0/10 to 10 f0 around stage 1. The sliders are the
	// Q of stages 1 and 2, starting at the table's values, each stage's f0
	// held at its table value. A third and fourth stage and the first-order
	// stage of an odd order are drawn fixed and counted in the product.
	// Guides: fp and the -Amax line, in amber.
	//   kind        'lowpass' | 'highpass' (a band type passes its low-pass side)
	//   fp          the passband edge, Hz
	//   amaxDb      the passband limit
	//   stages      the second-order stages, [{ f0, q }], in the table's order
	//   fc          the first-order stage's corner, Hz, present for an odd order
	//   order       the order n
	//   live        true for the page's design, false for the default one
	//   side        'bandpass' | 'bandstop' when the stages are a band type's low-pass side
	import Slider from './Slider.svelte';
	import XYPlot from './XYPlot.svelte';
	import { AMBER, dbText, hzText, logSpace, plain } from './bodeFigure.js';

	let { kind = 'lowpass', fp = 10000, amaxDb = 3, stages = [], fc = null, order = 4, live = false, side = '' } = $props();

	const high = $derived(kind === 'highpass');
	const table = $derived(Array.isArray(stages) ? stages.filter((s) => s && s.f0 > 0 && s.q > 0) : []);
	const hasFirst = $derived(Number.isFinite(fc) && fc > 0);
	const qMax = $derived(Math.max(5, 2 * Math.max(0, ...table.map((s) => s.q))));

	// null: following the table; a number: moved by hand
	let ownQ1 = $state(null);
	let ownQ2 = $state(null);
	const qs = $derived(table.map((s, i) => (i === 0 && ownQ1 !== null ? ownQ1 : i === 1 && ownQ2 !== null ? ownQ2 : s.q)));

	function secondOrder(f, f0, q) {
		const u = f / f0;
		const m = 1 / Math.sqrt((1 - u * u) ** 2 + (u / q) ** 2);
		return high ? m * u * u : m;
	}
	function firstOrder(f) {
		const u = f / fc;
		const m = 1 / Math.sqrt(1 + u * u);
		return high ? m * u : m;
	}
	const toDb = (m) => 20 * Math.log10(Math.max(m, 1e-9));
	function productDb(f) {
		let db = hasFirst ? toDb(firstOrder(f)) : 0;
		table.forEach((s, i) => (db += toDb(secondOrder(f, s.f0, qs[i]))));
		return db;
	}

	const f0 = $derived(table.length ? table[0].f0 : fp);
	const x0 = $derived(f0 / 10);
	const x1 = $derived(f0 * 10);
	const xs = $derived(logSpace(x0, x1, 300));
	const series = $derived.by(() => {
		const out = table.map((s, i) => ({ ys: xs.map((f) => toDb(secondOrder(f, s.f0, qs[i]))), color: 'var(--textDim)', width: 1.2 }));
		if (hasFirst) out.push({ ys: xs.map((f) => toDb(firstOrder(f))), color: 'var(--textDim)', width: 1.2, dash: [4, 3] });
		out.push({ ys: xs.map(productDb), color: 'var(--blue)', width: 2.5 });
		return out;
	});

	// the largest bump inside the passband: walking from deep in the band
	// toward its edge, the highest rise above the lowest point met so far.
	// A high Q lifts the curve above 0 dB; a Chebyshev ripple dips and comes
	// back up; a flat product only ever falls, so it scores 0.
	const bump = $derived.by(() => {
		const lo = high ? fp : Math.min(x0, fp / 10);
		const hi = high ? Math.max(x1, fp * 10) : fp;
		const walk = logSpace(lo, hi, 400);
		if (high) walk.reverse();
		let lowest = 0;
		let top = 0;
		for (const f of walk) {
			const db = productDb(f);
			lowest = Math.min(lowest, db);
			top = Math.max(top, db - lowest);
		}
		return top;
	});
	const lossFp = $derived(-productDb(fp));
	const passOk = $derived(Number(lossFp.toFixed(1)) <= amaxDb);
	const atTable = $derived(ownQ1 === null && ownQ2 === null);
	const parts = $derived(table.length + (hasFirst ? 1 : 0));
	const edgeWay = $derived(high ? 'down to' : 'up to');

	const notice = $derived.by(() => {
		if (atTable) {
			if (bump > 0.05) return `With the table's values the product ripples inside the passband by up to ${dbText(bump)} dB: those bumps are the Chebyshev ripple, kept on purpose to buy a steeper drop.`;
			if (parts >= 2) return `With the table's values the product is flat right ${edgeWay} the edge, and ${parts === 2 ? 'neither stage' : 'no single stage'} is flat alone.`;
			return `With the table's value this one stage is already flat right ${edgeWay} the edge: Q = ${table[0].q.toFixed(2)} is the flattest a stage can be.`;
		}
		if (!passOk) return `The passband sags early: the loss at fp is over the limit of ${plain(amaxDb)} dB.`;
		if (bump > 0.05) return `The product now has a bump of ${dbText(bump)} dB before the edge: a high Q does that, and Chebyshev does it on purpose.`;
		return 'Still flat, and within the limit at fp.';
	});

	const caption = $derived.by(() => {
		const out = [];
		if (!live) out.push('The page has no valid design yet, so the figure uses the default one: a fourth-order Butterworth low-pass at 10 kHz.');
		if (side === 'bandpass') out.push('For a band-pass these are the stages of the low-pass side, and fp here is fh.');
		if (side === 'bandstop') out.push('For a band-stop these are the stages of the low-pass branch, and fp here is fl.');
		if (table.length > 3) out.push("Stages 3 and 4 are drawn at the table's values and counted in the product.");
		else if (table.length === 3) out.push("Stage 3 is drawn at the table's values and counted in the product.");
		if (hasFirst) out.push(`The dashed curve is the first-order stage at ${hzText(fc)}: it has no Q, so no slider.`);
		return out.join(' ');
	});

	const markers = $derived(fp >= x0 && fp <= x1 ? [{ x: fp, label: 'fp', color: AMBER }] : []);
</script>

<div class="demo">
	{#if order === 1 || table.length === 0}
		<p class="read">A first-order filter has no Q; raise the order in panel 02 to see this figure.</p>
	{:else}
		<div class="controls">
			<Slider bind:value={() => qs[0], (v) => (ownQ1 = v)} label="Q of stage 1, f0 = {hzText(table[0].f0)}" min={0.3} max={qMax} log={true} fmt={(v) => v.toFixed(2)} />
			{#if table.length > 1}
				<Slider bind:value={() => qs[1], (v) => (ownQ2 = v)} label="Q of stage 2, f0 = {hzText(table[1].f0)}" min={0.3} max={qMax} log={true} fmt={(v) => v.toFixed(2)} />
			{/if}
		</div>
		<XYPlot
			{xs}
			{series}
			{markers}
			hlines={[{ y: -amaxDb, label: `-${plain(amaxDb)} dB`, color: AMBER }]}
			xLog={true}
			xLabel="frequency (Hz)"
			yLabel="gain (dB)"
			yMin={-60}
			yMax={10}
			yStep={10}
			height={200}
		/>
		<p class="mono">
			<span>largest bump in the passband: {dbText(bump)} dB</span>
			<span>loss at fp: <span class={passOk ? 'ok' : 'bad'}>{dbText(lossFp)} dB</span> (limit {plain(amaxDb)})</span>
		</p>
		<p class="read">
			Thin: each stage alone. Thick: their product, the whole filter. {notice}
			{caption}
		</p>
		{#if !atTable}
			<button
				type="button"
				class="reset"
				onclick={() => {
					ownQ1 = null;
					ownQ2 = null;
				}}>back to the table's values</button
			>
		{/if}
	{/if}
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

	.mono {
		display: grid;
		gap: 0.1rem;
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.ok {
		color: var(--green);
	}

	.bad {
		color: var(--red, #c92a2a);
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}

	.reset {
		justify-self: start;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.8rem;
		color: var(--blue);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
