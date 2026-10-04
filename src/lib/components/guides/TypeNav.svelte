<script>
	// The strip of every transistor type at the top of a type page, grouped
	// by family, the current one marked: one click to the next page.
	import { FAMILIES, typesIn } from '$lib/transistors/types';

	let { current = '' } = $props();
</script>

<nav class="types" aria-label="Transistor types">
	<a class="hub" href="/tools/transistors/">All types</a>
	{#each FAMILIES as family (family.id)}
		<span class="fam">{family.name}</span>
		{#each typesIn(family.id) as t (t.slug)}
			<a href={`/tools/transistors/${t.slug}/`} class:on={t.slug === current} aria-current={t.slug === current ? 'page' : undefined}>{t.short}</a>
		{/each}
	{/each}
</nav>

<style>
	.types {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		margin: 0 0 1.4rem;
	}

	a {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.18rem 0.65rem;
		transition: background 0.3s, border-color 0.3s;
	}

	a:hover {
		background: var(--surfaceHover);
		color: var(--text);
	}

	a.on {
		background: var(--blue);
		border-color: var(--blue);
		color: #fff;
	}

	a.hub {
		color: var(--blue);
	}

	.fam {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--textFaint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0.1rem 0 0.5rem;
	}
</style>
