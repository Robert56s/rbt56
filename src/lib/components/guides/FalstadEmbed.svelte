<script>
	// One circuit from a guide, running in Falstad's simulator. Nothing loads
	// until the reader asks for it: the card shows what the circuit is and
	// what to try, and the button swaps in the simulator. Starting one stops
	// any other on the page (src/lib/guides/activeSim.svelte.js), so a page
	// with twenty circuits still runs one simulator at a time.
	//   sim   { id, title, what, steps: [...], watch, text, height, preview }
	//         preview: optional SVG markup of the circuit, shown before it runs
	import { sims } from '$lib/guides/activeSim.svelte.js';
	import { falstadUrl } from '$lib/guides/falstad';

	let { sim } = $props();

	const running = $derived(sims.active === sim.id);
	const src = $derived(falstadUrl(sim.text));
	const full = $derived(falstadUrl(sim.text, { embed: false }));
	const height = $derived(sim.height ?? 420);

	function start() {
		sims.active = sim.id;
	}
	function stop() {
		if (sims.active === sim.id) sims.active = null;
	}
</script>

<figure class="sim" id={`sim-${sim.id}`}>
	<figcaption>
		<span class="tag">Simulation</span>
		<h4>{sim.title}</h4>
	</figcaption>
	<p class="what">{sim.what}</p>
	{#if running}
		<div class="frame" style="height: {height}px">
			<iframe {src} title={`${sim.title}, Falstad circuit simulator`} allow="fullscreen" referrerpolicy="no-referrer"></iframe>
		</div>
	{:else}
		<button type="button" class="stage" style="min-height: {sim.preview ? 0 : 7}rem" onclick={start} aria-label={`Run the simulation: ${sim.title}`}>
			{#if sim.preview}
				<span class="preview">{@html sim.preview}</span>
			{/if}
			<span class="play">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
				Run the simulation
			</span>
		</button>
	{/if}
	{#if sim.steps?.length}
		<ol class="steps">
			{#each sim.steps as step, i (i)}
				<li>{step}</li>
			{/each}
		</ol>
	{/if}
	{#if sim.watch}
		<p class="watch"><b>What to see.</b> {sim.watch}</p>
	{/if}
	<div class="foot">
		{#if running}
			<button type="button" class="ghost small" onclick={stop}>Stop</button>
		{/if}
		<a href={full} target="_blank" rel="noreferrer">Open in the full simulator</a>
		<span class="src">CircuitJS by Paul Falstad, loaded from falstad.com</span>
	</div>
</figure>

<style>
	.sim {
		margin: 0.9rem 0 1.2rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		padding: 0.9rem 1rem 0.8rem;
		display: grid;
		gap: 0.55rem;
	}

	figcaption {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex-wrap: wrap;
	}

	.tag {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--green);
		background: #e6f4ec;
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
	}

	h4 {
		font-size: 0.98rem;
		font-weight: 700;
	}

	.what {
		font-size: 0.9rem;
		margin: 0;
		max-width: 70ch;
	}

	.frame {
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		overflow: hidden;
		background: #fff;
	}

	iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}

	.stage {
		position: relative;
		display: grid;
		place-items: center;
		width: 100%;
		background: var(--surfaceSunk);
		color: var(--text);
		border: 1px dashed var(--lineStrong);
		border-radius: var(--radiusSmall);
		padding: 0.8rem;
		cursor: pointer;
	}

	.stage:hover:not(:disabled) {
		background: var(--surfaceHover);
		color: var(--text);
	}

	.preview {
		display: block;
		width: 100%;
		max-height: 18rem;
		opacity: 0.55;
	}

	.preview :global(svg) {
		width: 100%;
		max-height: 18rem;
		height: auto;
	}

	.play {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 500;
		color: #fff;
		background: var(--blue);
		border-radius: var(--radiusSmall);
		padding: 0.55rem 1rem;
		transition: background 0.3s;
	}

	.preview + .play {
		position: absolute;
	}

	.stage:hover .play {
		background: var(--blueLight);
	}

	.play svg {
		width: 1rem;
		height: 1rem;
	}

	.steps {
		font-size: 0.88rem;
		padding-left: 1.3rem;
		display: grid;
		gap: 0.2rem;
		max-width: 72ch;
	}

	.watch {
		font-size: 0.88rem;
		color: var(--textDim);
		margin: 0;
		max-width: 72ch;
	}

	.watch b {
		color: var(--text);
		font-weight: 500;
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
		font-size: 0.82rem;
	}

	.src {
		color: var(--textFaint);
		margin-left: auto;
	}
</style>
