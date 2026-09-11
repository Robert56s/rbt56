<script>
	// Generic wrapper for a pre-built {svg, viewBox} schematic (see
	// src/lib/modulation/circuits.js) - same visual treatment as
	// CircuitDiagram.svelte, just decoupled from one tool's builder set.

	let { diagram, label = 'circuit schematic' } = $props();
</script>

{#if diagram}
	<svg viewBox={diagram.viewBox} role="img" aria-label={label}>
		{@html diagram.svg}
	</svg>
{/if}

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		color: var(--text);
	}

	svg :global(.lbl) {
		font-family: var(--mono);
		font-size: 11px;
		fill: var(--blue);
	}

	svg :global(.lbl.note) {
		fill: var(--textDim);
	}
</style>
