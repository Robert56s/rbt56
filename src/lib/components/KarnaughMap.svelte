<script>
	// Interactive Karnaugh map: Gray-coded headers, one clickable cell per
	// minterm (0 -> 1 -> X -> 0), and the chosen groups drawn as rounded
	// loops, with a small overhang past the edge wherever a group wraps
	// around to the other side of the map.

	import { cellMinterm, codeBits, layout } from '$lib/karnaugh/kmap';

	let { n, names, cells, groups = [], onToggle } = $props();

	const S = 46; // cell size
	const HX = 46; // row-header width
	const HY = 46; // column-header height
	const OVER = 9; // wrap overhang

	const lay = $derived(layout(n));
	const R = $derived(lay.rows.length);
	const C = $derived(lay.cols.length);
	const width = $derived(HX + C * S + 14);
	const height = $derived(HY + R * S + 14);
	const rowNames = $derived(lay.rowVars.map((i) => names[i]).join(''));
	const colNames = $derived(lay.colVars.map((i) => names[i]).join(''));

	function valueText(v) {
		return v === 2 ? 'X' : String(v);
	}

	function handleKey(e, m) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onToggle?.(m);
		}
	}
</script>

<svg viewBox="0 0 {width} {height}" role="grid" aria-label="Karnaugh map">
	<!-- headers -->
	<text class="vars" x={HX + (C * S) / 2} y="14" text-anchor="middle">{colNames}</text>
	<text class="vars" x="14" y={HY + (R * S) / 2} text-anchor="middle" transform="rotate(-90 14 {HY + (R * S) / 2})">{rowNames}</text>
	{#each lay.cols as code, c (c)}
		<text class="code" x={HX + c * S + S / 2} y={HY - 12} text-anchor="middle">{codeBits(code, lay.colBits)}</text>
	{/each}
	{#each lay.rows as code, r (r)}
		<text class="code" x={HX - 12} y={HY + r * S + S / 2 + 4} text-anchor="end">{codeBits(code, lay.rowBits)}</text>
	{/each}

	<!-- cells -->
	{#each lay.rows as _, r (r)}
		{#each lay.cols as _, c (c)}
			{@const m = cellMinterm(lay, r, c)}
			{@const v = cells[m]}
			<g
				class="cell v{v}"
				role="button"
				tabindex="0"
				aria-label="minterm {m}, value {valueText(v)}"
				onclick={() => onToggle?.(m)}
				onkeydown={(e) => handleKey(e, m)}
			>
				<rect x={HX + c * S} y={HY + r * S} width={S} height={S} />
				<text class="value" x={HX + c * S + S / 2} y={HY + r * S + S / 2 + 6} text-anchor="middle">{valueText(v)}</text>
				<text class="index" x={HX + c * S + S - 5} y={HY + r * S + 11} text-anchor="end">{m}</text>
			</g>
		{/each}
	{/each}

	<!-- groups -->
	{#each groups as g, gi (gi)}
		{#each g.pieces as pc, pi (pi)}
			{@const left = HX + pc.c0 * S + 4 - (g.wrapCols && pc.c0 === 0 ? OVER : 0)}
			{@const right = HX + (pc.c1 + 1) * S - 4 + (g.wrapCols && pc.c1 === C - 1 ? OVER : 0)}
			{@const top = HY + pc.r0 * S + 4 - (g.wrapRows && pc.r0 === 0 ? OVER : 0)}
			{@const bottom = HY + (pc.r1 + 1) * S - 4 + (g.wrapRows && pc.r1 === R - 1 ? OVER : 0)}
			<rect
				class="loop"
				x={left + gi * 1.5}
				y={top + gi * 1.5}
				width={right - left - gi * 3}
				height={bottom - top - gi * 3}
				rx="11"
				style="stroke: {g.color}; fill: {g.color}"
			/>
		{/each}
	{/each}
</svg>

<style>
	svg {
		width: 100%;
		max-width: 440px;
		height: auto;
		display: block;
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		font-family: var(--mono);
		user-select: none;
	}

	.vars {
		font-size: 12px;
		font-weight: 700;
		fill: var(--text);
	}

	.code {
		font-size: 11px;
		fill: var(--textDim);
	}

	.cell rect {
		fill: var(--surface);
		stroke: var(--line);
		stroke-width: 1;
		transition: fill 0.15s;
	}

	.cell {
		cursor: pointer;
		outline: none;
	}

	.cell:hover rect,
	.cell:focus-visible rect {
		stroke: var(--blue);
		stroke-width: 1.5;
	}

	.cell.v1 rect {
		fill: #e3ecfd;
	}

	.cell.v2 rect {
		fill: var(--amberSoft);
	}

	.value {
		font-size: 17px;
		font-weight: 600;
		fill: var(--text);
		pointer-events: none;
	}

	.cell.v0 .value {
		fill: var(--textFaint);
	}

	.cell.v2 .value {
		fill: var(--amber);
	}

	.index {
		font-size: 8.5px;
		fill: var(--textFaint);
		pointer-events: none;
	}

	.loop {
		fill-opacity: 0.12;
		stroke-width: 2.4;
		pointer-events: none;
	}
</style>
