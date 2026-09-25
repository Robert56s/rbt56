<script>
	// Renders the schematic for one realized stage using real component
	// shapes from the `schematic-symbols` library (resistor zigzags,
	// capacitor plates, an op-amp triangle), wired up by src/lib/filter/circuits.js.

	import {
		buildFirstOrderDiagram,
		buildFirstOrderHpDiagram,
		buildMfbDiagram,
		buildMfbHpDiagram,
		buildSallenKeyDiagram,
		buildSallenKeyHpDiagram,
		buildTowThomasDiagram,
		buildTowThomasHpDiagram,
		buildTowThomasNotchDiagram
	} from '$lib/filter/circuits';

	let { design } = $props();

	const diagram = $derived.by(() => {
		if (design.topology === 'towThomas') return buildTowThomasDiagram(design.components);
		if (design.topology === 'towThomasHp') return buildTowThomasHpDiagram(design.components);
		if (design.topology === 'towThomasNotch') return buildTowThomasNotchDiagram(design.components);
		if (design.topology === 'mfb') return buildMfbDiagram(design.components);
		if (design.topology === 'sallenKey') return buildSallenKeyDiagram(design.components);
		if (design.topology === 'firstOrder') return buildFirstOrderDiagram(design.components, design.actual.tau);
		if (design.topology === 'mfbHp') return buildMfbHpDiagram(design.components);
		if (design.topology === 'sallenKeyHp') return buildSallenKeyHpDiagram(design.components);
		if (design.topology === 'firstOrderHp') return buildFirstOrderHpDiagram(design.components, design.actual.tau);
		return null;
	});
</script>

{#if diagram}
	<svg viewBox={diagram.viewBox} role="img" aria-label="{design.topology} stage schematic">
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
