<script>
	// A transistor's symbol with its terminals named, at a given height.
	//   symbol   { name, labels, flipY, light } (see src/lib/guides/symbol.js)
	import { symbolDrawing } from '$lib/guides/symbol';

	let { symbol, height = 84, label = 'schematic symbol' } = $props();

	const drawing = $derived(symbolDrawing(symbol.name, symbol));
</script>

<svg viewBox={drawing.viewBox} style="height: {height}px" role="img" aria-label={label}>
	{@html drawing.svg}
</svg>

<style>
	svg {
		display: block;
		width: auto;
		max-width: 100%;
		color: var(--text);
		overflow: visible;
	}

	svg :global(.pin) {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 700;
		fill: var(--blue);
	}
</style>
