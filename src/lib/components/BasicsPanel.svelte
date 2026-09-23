<script>
	// "Start here": the subject of the tool introduced from the beginning,
	// with a little maths and the vocabulary the rest of the page uses,
	// collapsed by default like the "Show the math" blocks, since not every
	// reader needs it. The blocks follow the configuration chosen above
	// it, so the story changes with the topology or the mode.
	//   { h: 'heading' }                  a small heading
	//   { p: 'paragraph' }                prose
	//   { eq: 'tex', intro: '...' }       a formula, with the phrase that introduces it
	//   { widget: 'name', props: {...} }  an interactive figure from the `widgets` map
	//   { terms: [[word, meaning], ...] } a short glossary

	import Equation from './Equation.svelte';

	let { blocks, widgets = {}, title = 'Start here', summary = 'Read the introduction: what this is about, with a little maths and the words used on this page', minutes = 5 } = $props();
</script>

<section class="panel basics">
	<div class="panel-head">
		<span class="num">00</span>
		<h2>{title}</h2>
		<span class="hint">about {minutes} minutes, interactive</span>
	</div>
	<details class="intro">
		<summary>{summary}</summary>
		<div class="content">
			{#each blocks as block, i (i)}
				{#if block.h}
					<h3>{block.h}</h3>
				{:else if block.p}
					<p>{block.p}</p>
				{:else if block.eq}
					{#if block.intro}
						<p class="intro-line">{block.intro}</p>
					{/if}
					<Equation tex={block.eq} />
				{:else if block.widget}
					{@const Widget = widgets[block.widget]}
					{#if Widget}
						<div class="figure">
							<Widget {...block.props ?? {}} />
						</div>
					{/if}
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
	</details>
</section>

<style>
	.basics {
		background: color-mix(in srgb, var(--surface) 92%, var(--blue) 8%);
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
		margin-top: 0.9rem;
		display: grid;
		gap: 0.55rem;
		max-width: 78ch;
	}

	h3 {
		font-size: 0.95rem;
		margin: 0.7rem 0 0;
	}

	.content > h3:first-child {
		margin-top: 0;
	}

	p {
		font-size: 0.92rem;
		line-height: 1.55;
	}

	.intro-line {
		margin-bottom: -0.2rem;
	}

	.figure {
		margin: 0.2rem 0 0.4rem;
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
