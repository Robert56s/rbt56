<script>
	import katex from 'katex';
	import 'katex/dist/katex.min.css';

	// Renders one LaTeX formula with KaTeX. `display` (block, centered, own
	// line) is the default - pass display={false} for a formula meant to sit
	// inline in a sentence.

	let { tex, display = true } = $props();

	const html = $derived.by(() => {
		try {
			return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore' });
		} catch {
			return tex;
		}
	});
</script>

{#if display}
	<div class="eq-block">{@html html}</div>
{:else}
	<span class="eq-inline">{@html html}</span>
{/if}

<style>
	.eq-block {
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		padding: 0.7rem 0.9rem;
		margin-bottom: 0.6rem;
		overflow-x: auto;
	}

	.eq-block :global(.katex-display) {
		margin: 0;
	}

	.eq-inline :global(.katex) {
		font-size: 1em;
	}
</style>
