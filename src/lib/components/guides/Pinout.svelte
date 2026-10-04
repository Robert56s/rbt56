<script>
	// A package seen from the front with its legs named, the way it sits on a
	// breadboard: a TO-92 with its flat face toward the viewer, a TO-220 or
	// TO-247 with its printed face toward the viewer and the tab behind, a
	// SOT-23 from above. Legs are listed left to right.
	//   pkg    'TO-92' | 'TO-220' | 'TO-247' | 'TO-126' | 'TO-225' | 'SOT-23'
	//   legs   ['E', 'B', 'C'], left to right as seen; for a SOT-23, pins
	//          1, 2, 3 in that order (1 and 2 on one side, 3 alone opposite)
	let { pkg = 'TO-92', legs = [], tab = '' } = $props();

	const kind = $derived(/^TO-92/.test(pkg) ? 'to92' : /^SOT-23/.test(pkg) ? 'sot23' : 'to220');
	const W = 120;
</script>

<svg viewBox="0 0 {W} 118" role="img" aria-label={`${pkg} pinout, left to right: ${legs.join(', ')}`}>
	{#if kind === 'to92'}
		<!-- the flat face of a TO-92, its rounded back behind it -->
		<path d="M30 16 Q60 2 90 16 L90 62 L30 62 Z" class="body" />
		<line x1="30" y1="16" x2="90" y2="16" class="edge" />
		{#each legs as leg, i (i)}
			<line x1={40 + 20 * i} y1="62" x2={40 + 20 * i} y2="96" class="leg" />
			<text x={40 + 20 * i} y="111" class="name">{leg}</text>
		{/each}
		<text x="60" y="44" class="mark">flat face</text>
	{:else if kind === 'sot23'}
		<!-- SOT-23 from above: pins 1 and 2 at the bottom, 3 at the top -->
		<rect x="38" y="36" width="44" height="30" rx="3" class="body" />
		<line x1="60" y1="36" x2="60" y2="18" class="leg" />
		<line x1="48" y1="66" x2="48" y2="86" class="leg" />
		<line x1="72" y1="66" x2="72" y2="86" class="leg" />
		<text x="60" y="13" class="name">{legs[2] ?? ''}</text>
		<text x="48" y="101" class="name">{legs[0] ?? ''}</text>
		<text x="72" y="101" class="name">{legs[1] ?? ''}</text>
		<circle cx="45" cy="60" r="2" class="dot" />
	{:else}
		<!-- a tab package from the front: the metal tab with its hole on top -->
		<rect x="28" y="2" width="64" height="26" rx="2" class="tab" />
		<circle cx="60" cy="14" r="6" class="hole" />
		<rect x="26" y="26" width="68" height="38" rx="2" class="body" />
		{#each legs as leg, i (i)}
			<line x1={40 + 20 * i} y1="64" x2={40 + 20 * i} y2="96" class="leg" />
			<text x={40 + 20 * i} y="111" class="name">{leg}</text>
		{/each}
		<text x="60" y="49" class="mark">{pkg}</text>
	{/if}
</svg>
{#if tab}
	<p class="tabnote">tab: {tab}</p>
{/if}

<style>
	svg {
		width: 7.5rem;
		height: auto;
		display: block;
	}

	.body {
		fill: #2b2f36;
	}

	.tab {
		fill: #b8c0cc;
	}

	.hole {
		fill: var(--surface);
	}

	.edge {
		stroke: #5c6470;
		stroke-width: 1.5;
	}

	.leg {
		stroke: #8c96a3;
		stroke-width: 4;
		stroke-linecap: round;
	}

	.dot {
		fill: #8c96a3;
	}

	.name {
		font-family: var(--mono);
		font-size: 12px;
		font-weight: 700;
		fill: var(--blue);
		text-anchor: middle;
	}

	.mark {
		font-family: var(--sans);
		font-size: 8px;
		fill: #c3ccd9;
		text-anchor: middle;
	}

	.tabnote {
		font-size: 0.75rem;
		color: var(--textDim);
		text-align: center;
		width: 7.5rem;
		margin: 0;
	}
</style>
