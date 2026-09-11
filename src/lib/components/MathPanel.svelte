<script>
	// Collapsible "show the math" block: a mix of prose (what a step does
	// and why) and LaTeX formulas, rendered with KaTeX (general form, then
	// the same form with this design's actual numbers substituted in, each
	// on its own line rather than crammed into a sentence). Content comes
	// from src/lib/filter/explain.js.

	import Equation from './Equation.svelte';

	let { blocks, summary = 'Show the math' } = $props();
</script>

<details class="math">
	<summary>{summary}</summary>
	<div class="content">
		{#each blocks as block, i (i)}
			{#if block.cls === 'stageHead'}
				<p class="stageHead">{block.text}</p>
			{:else if block.type === 'p'}
				<p class="prose">{block.text}</p>
			{:else}
				<Equation tex={block.tex} />
			{/if}
		{/each}
	</div>
</details>

<style>
	.math {
		margin-top: 0.9rem;
	}

	summary {
		cursor: pointer;
		font-family: var(--mono);
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--blue);
		user-select: none;
		width: fit-content;
	}

	summary:hover {
		color: var(--blueLight);
	}

	.content {
		margin-top: 0.8rem;
		display: grid;
		gap: 0.6rem;
	}

	.prose {
		font-size: 0.88rem;
		color: var(--textDim);
		max-width: 74ch;
	}

	.stageHead {
		font-family: var(--mono);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text);
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
	}

	.content > .stageHead:first-child {
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}
</style>
