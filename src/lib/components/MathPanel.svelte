<script>
	// Collapsible "show the math" block: a mix of prose (what a step does
	// and why) and LaTeX formulas, rendered with KaTeX (general form, then
	// the same form with this design's actual numbers substituted in, each
	// on its own line rather than crammed into a sentence). Content comes
	// from the tools' explain.js. A guide can also hold a small table
	// ({ type: 'table', head, rows }), numbered steps ({ type: 'steps',
	// items }) and a circuit ({ type: 'figure', diagram, label }).

	import DiagramView from './DiagramView.svelte';
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
			{:else if block.type === 'table'}
				<div class="tableScroll">
					<table class="guide">
						<thead>
							<tr>
								{#each block.head as cell, c (c)}<th>{cell}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each block.rows as row, r (r)}
								<tr>
									{#each row as cell, c (c)}<td>{cell}</td>{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if block.type === 'steps'}
				<ol class="steps">
					{#each block.items as item, k (k)}<li>{item}</li>{/each}
				</ol>
			{:else if block.type === 'figure'}
				<div class="figure"><DiagramView diagram={block.diagram} label={block.label} /></div>
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

	/* a guide's table holds words, so its cells wrap, unlike a table of numbers */
	.guide th,
	.guide td {
		white-space: normal;
		vertical-align: top;
	}

	.guide td {
		font-family: inherit;
		color: var(--textDim);
	}

	.guide td:first-child {
		font-family: var(--mono);
		color: var(--text);
		white-space: nowrap;
	}

	.steps {
		margin: 0;
		padding-left: 1.3rem;
		display: grid;
		gap: 0.35rem;
		font-size: 0.88rem;
		color: var(--textDim);
		max-width: 74ch;
	}

	.figure {
		max-width: 560px;
	}
</style>
