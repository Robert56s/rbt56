<script>
	// "In plain words": what the tool is doing, for someone who has not met
	// the vocabulary yet. The blocks follow the configuration chosen above
	// it, so the story changes with the topology or the mode. Content comes
	// from a basics.js next to each tool's engine.
	//   { h: 'heading' }            a small heading
	//   { p: 'paragraph' }          prose
	//   { terms: [[word, what it means], ...] }   a short glossary

	let { blocks, title = 'In plain words' } = $props();
</script>

<section class="panel basics">
	<div class="panel-head">
		<span class="num">00</span>
		<h2>{title}</h2>
		<span class="hint">no maths, no jargon</span>
	</div>
	<div class="content">
		{#each blocks as block, i (i)}
			{#if block.h}
				<h3>{block.h}</h3>
			{:else if block.p}
				<p>{block.p}</p>
			{:else if block.terms}
				<dl>
					{#each block.terms as [word, meaning] (word)}
						<dt>{word}</dt>
						<dd>{meaning}</dd>
					{/each}
				</dl>
			{/if}
		{/each}
	</div>
</section>

<style>
	.basics {
		background: color-mix(in srgb, var(--surface) 92%, var(--blue) 8%);
	}

	.content {
		display: grid;
		gap: 0.55rem;
		max-width: 74ch;
	}

	h3 {
		font-size: 0.92rem;
		margin: 0.5rem 0 0;
	}

	.content > h3:first-child {
		margin-top: 0;
	}

	p {
		font-size: 0.92rem;
		line-height: 1.55;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.3rem 0.9rem;
		font-size: 0.88rem;
		margin-top: 0.3rem;
	}

	dt {
		font-family: var(--mono);
		font-weight: 500;
		color: var(--blue);
	}

	dd {
		color: var(--textDim);
	}

	@media (max-width: 620px) {
		dl {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}

		dd {
			margin-bottom: 0.4rem;
		}
	}
</style>
