<script>
	import { buildBoctorDiagram } from '$lib/filter/boctorDiagram';
	// Renders the schematic for one realized stage using real component
	// shapes from the `schematic-symbols` library (resistor zigzags,
	// capacitor plates, an op-amp triangle), wired up by src/lib/filter/circuits.js.
	// `ohms` (optional) writes a resistor's value on the drawing, formatOhms
	// when left out: the filter page passes one that names the two parts of
	// a resistor built from two in series ("2.2k + 2k").

	import {
		buildFirstOrderDiagram,
		buildFirstOrderHpDiagram,
		buildGainDividerDiagram,
		buildGainInvDiagram,
		buildGainNonInvDiagram,
		buildKhnBpDiagram,
		buildMfbBpDiagram,
		buildMfbDiagram,
		buildMfbHpDiagram,
		buildRlcGicDiagram,
		buildRlcGyratorDiagram,
		buildSallenKeyBpDiagram,
		buildSallenKeyDiagram,
		buildSallenKeyHpDiagram,
		buildTowThomasBpDiagram,
		buildTowThomasDiagram,
		buildTowThomasHpDiagram,
		buildTowThomasNotchDiagram
	} from '$lib/filter/circuits';

	let { design, ohms } = $props();

	const diagram = $derived.by(() => {
		// an undefined ohms leaves each builder on its formatOhms default
		const opts = { ohms };
		if (design.topology === 'boctor' || design.topology === 'boctorHp') return buildBoctorDiagram(design.components, { ...opts, highPass: design.topology === 'boctorHp' });
		if (design.topology === 'towThomas') return buildTowThomasDiagram(design.components, opts);
		if (design.topology === 'towThomasHp') return buildTowThomasHpDiagram(design.components, opts);
		if (design.topology === 'towThomasNotch') return buildTowThomasNotchDiagram(design.components, opts);
		if (design.topology === 'towThomasBp') return buildTowThomasBpDiagram(design.components, opts);
		if (design.topology === 'mfb') return buildMfbDiagram(design.components, opts);
		if (design.topology === 'sallenKey') return buildSallenKeyDiagram(design.components, opts);
		if (design.topology === 'firstOrder') return buildFirstOrderDiagram(design.components, design.actual.tau, opts);
		if (design.topology === 'mfbHp') return buildMfbHpDiagram(design.components, opts);
		if (design.topology === 'mfbBp') return buildMfbBpDiagram(design.components, opts);
		if (design.topology === 'sallenKeyHp') return buildSallenKeyHpDiagram(design.components, opts);
		if (design.topology === 'firstOrderHp') return buildFirstOrderHpDiagram(design.components, design.actual.tau, opts);
		// the gain stages of a filter designed by hand
		if (design.topology === 'gainInv') return buildGainInvDiagram(design.components, opts);
		if (design.topology === 'gainNonInv') return buildGainNonInvDiagram(design.components, opts);
		if (design.topology === 'gainDivider') return buildGainDividerDiagram(design.components, opts);
		// the narrow band-pass stages; an RLC stage drops its output follower when the gain stage after it buffers it
		if (design.topology === 'rlcGyrator') return buildRlcGyratorDiagram(design.components, { ...opts, buffered: design.buffered !== false });
		if (design.topology === 'rlcGic') return buildRlcGicDiagram(design.components, { ...opts, buffered: design.buffered !== false });
		if (design.topology === 'sallenKeyBp') return buildSallenKeyBpDiagram(design.components, opts);
		if (design.topology === 'khnBp') return buildKhnBpDiagram(design.components, opts);
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
