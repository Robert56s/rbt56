<script>
	// The text of a guide, written as data (src/lib/transistors/types/*.js)
	// and laid out here. Every string may hold inline formulas between $...$.
	//   { h: 'heading' }                       a small heading
	//   { p: 'paragraph' }                     prose
	//   { eq: 'tex', intro: '...' }            a formula on its own line, with the phrase before it
	//   { list: ['...', ...] }                 bullet points
	//   { steps: ['...', ...] }                numbered steps
	//   { terms: [[word, meaning], ...] }      a short glossary
	//   { table: { head: [...], rows: [[...], ...] } }
	//   { note: '...', tone: 'info' | 'warn' | 'ok' }   a boxed remark
	//   { widget: 'name', props: {...} }       an interactive figure from `widgets`
	//   { sim: 'id' }                          a Falstad simulation, looked up with `simFor`
	//   { more: [blocks], summary: '...' }     a collapsed block, for a derivation
	import Equation from '../Equation.svelte';
	import FalstadEmbed from './FalstadEmbed.svelte';
	import GuideBlocks from './GuideBlocks.svelte';
	import RichText from './RichText.svelte';

	// `widgets` maps a figure's name to its component, `simFor` an id to a
	// simulation card ({ id, title, what, steps, watch, text }): each guide
	// brings its own, so this component knows nothing about transistors
	let { blocks = [], widgets = {}, simFor = () => null } = $props();
</script>

<div class="blocks">
	{#each blocks as block, i (i)}
		{#if block.h}
			<h3>{block.h}</h3>
		{:else if block.p}
			<p><RichText text={block.p} /></p>
		{:else if block.eq}
			{#if block.intro}
				<p class="intro-line"><RichText text={block.intro} /></p>
			{/if}
			<Equation tex={block.eq} />
		{:else if block.list}
			<ul class="list">
				{#each block.list as item, k (k)}
					<li><RichText text={item} /></li>
				{/each}
			</ul>
		{:else if block.steps}
			<ol class="list">
				{#each block.steps as item, k (k)}
					<li><RichText text={item} /></li>
				{/each}
			</ol>
		{:else if block.terms}
			<dl>
				{#each block.terms as [word, meaning] (word)}
					<dt><RichText text={word} /></dt>
					<dd><RichText text={meaning} /></dd>
				{/each}
			</dl>
		{:else if block.table}
			<div class="tableScroll">
				<table class="words">
					<thead>
						<tr>
							{#each block.table.head as cell, c (c)}<th><RichText text={cell} /></th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each block.table.rows as row, r (r)}
							<tr>
								{#each row as cell, c (c)}<td><RichText text={cell} /></td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if block.note}
			<p class="note-box {block.tone ?? 'info'}"><RichText text={block.note} /></p>
		{:else if block.widget}
			{@const Widget = widgets[block.widget]}
			{#if Widget}
				<div class="figure"><Widget {...block.props ?? {}} /></div>
			{/if}
		{:else if block.sim}
			{@const card = simFor(block.sim)}
			{#if card}
				<FalstadEmbed sim={card} />
			{/if}
		{:else if block.more}
			<details class="more">
				<summary>{block.summary ?? 'Show the derivation'}</summary>
				<div class="more-body"><GuideBlocks blocks={block.more} {widgets} {simFor} /></div>
			</details>
		{/if}
	{/each}
</div>

<style>
	.blocks {
		display: grid;
		gap: 0.6rem;
		max-width: 78ch;
	}

	h3 {
		font-size: 0.98rem;
		margin: 0.8rem 0 0;
	}

	.blocks > h3:first-child {
		margin-top: 0;
	}

	p {
		font-size: 0.93rem;
		line-height: 1.6;
		max-width: none;
		margin: 0;
	}

	.intro-line {
		margin-bottom: -0.25rem;
	}

	.list {
		font-size: 0.93rem;
		line-height: 1.55;
		padding-left: 1.3rem;
		display: grid;
		gap: 0.3rem;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.35rem 0.9rem;
		font-size: 0.9rem;
	}

	dt {
		font-weight: 500;
		color: var(--blue);
	}

	dd {
		color: var(--textDim);
	}

	.words th,
	.words td {
		white-space: normal;
		vertical-align: top;
		font-family: inherit;
		font-size: 0.86rem;
	}

	.words td {
		color: var(--textDim);
	}

	.words td:first-child {
		color: var(--text);
		font-weight: 500;
	}

	.note-box {
		font-size: 0.88rem;
		border-radius: var(--radiusSmall);
		padding: 0.6rem 0.85rem;
		border: 1px solid var(--line);
		background: var(--surfaceSunk);
	}

	.note-box.warn {
		color: #7a5413;
		background: var(--amberSoft);
		border-color: #f0dfae;
	}

	.note-box.ok {
		color: #1f5d3d;
		background: #e6f4ec;
		border-color: #c6e5d4;
	}

	.figure {
		margin: 0.2rem 0 0.3rem;
	}

	.more summary {
		cursor: pointer;
		font-family: var(--mono);
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--blue);
		user-select: none;
		width: fit-content;
	}

	.more summary:hover {
		color: var(--blueLight);
	}

	.more-body {
		margin-top: 0.7rem;
		padding-left: 0.9rem;
		border-left: 2px solid var(--line);
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
