<script>
	import { CATEGORIES, tools, toolsIn, toolNumber } from '$lib/tools';

	const groups = CATEGORIES.map((c) => ({ ...c, items: toolsIn(c.id) })).filter(
		(g) => g.items.length > 0
	);
	const loose = tools.filter((t) => !CATEGORIES.some((c) => c.id === t.category));
</script>

<svelte:head>
	<title>rbt56</title>
	<meta name="description" content="Small homemade tools that run in the browser." />
</svelte:head>

<section class="hero">
	<h1>rbt56</h1>
	<p class="lead">
		Small tools built for school or for a side project.
	</p>
</section>

{#each groups as group (group.id)}
	<section class="group">
		<p class="eyebrow">{group.name}</p>
		<p class="blurb">{group.blurb}</p>
		<ol class="list">
			{#each group.items as tool (tool.href)}
				<li>
					<span class="num">{String(toolNumber(tool)).padStart(2, '0')}</span>
					<div class="body">
						<h2>{tool.name}</h2>
						<p>{tool.summary}</p>
						<ul class="tags">
							{#each tool.tags as tag (tag)}
								<li>{tag}</li>
							{/each}
							<li class="state">{tool.state}</li>
						</ul>
					</div>
					<a class="btn" href={tool.href}>Open</a>
				</li>
			{/each}
		</ol>
	</section>
{/each}

{#if loose.length > 0}
	<section class="group">
		<p class="eyebrow">Other</p>
		<ol class="list">
			{#each loose as tool (tool.href)}
				<li>
					<span class="num">{String(toolNumber(tool)).padStart(2, '0')}</span>
					<div class="body">
						<h2>{tool.name}</h2>
						<p>{tool.summary}</p>
						<ul class="tags">
							{#each tool.tags as tag (tag)}
								<li>{tag}</li>
							{/each}
							<li class="state">{tool.state}</li>
						</ul>
					</div>
					<a class="btn" href={tool.href}>Open</a>
				</li>
			{/each}
		</ol>
	</section>
{/if}

<p class="note">More to come.</p>

<section class="misc">
	<p class="eyebrow">Misc</p>
	<a class="btn ghostLink" href="/hpr/" data-sveltekit-reload>hprEDI</a>
</section>

<style>
	.hero {
		margin-bottom: 2.5rem;
	}

	.hero h1 {
		font-size: clamp(2.4rem, 7vw, 3.4rem);
		letter-spacing: -0.03em;
		margin-bottom: 0.6rem;
	}

	.lead {
		font-size: 1.1rem;
		color: var(--textDim);
		max-width: 46ch;
	}

	.group {
		margin-bottom: 2.2rem;
	}

	.blurb {
		font-size: 0.95rem;
		color: var(--textDim);
		max-width: 62ch;
		margin: -0.5rem 0 1rem;
	}

	.list {
		list-style: none;
		display: grid;
		gap: 0.9rem;
	}

	.list > li {
		display: flex;
		align-items: center;
		gap: 1.1rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 1.1rem 1.25rem;
		transition: border-color 0.3s, transform 0.3s;
	}

	.list > li:hover {
		border-color: var(--lineStrong);
		transform: translateY(-2px);
	}

	.num {
		font-family: var(--mono);
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--blue);
		background: #e3eff6;
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
		align-self: flex-start;
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.body h2 {
		margin-bottom: 0.25rem;
	}

	.body p {
		margin-bottom: 0.7rem;
		font-size: 0.95rem;
		color: var(--textDim);
	}

	.tags {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.tags li {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--textDim);
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.1rem 0.6rem;
	}

	.tags li.state {
		color: var(--green);
		background: #e6f4ec;
		border-color: #c6e5d4;
	}

	.misc {
		margin-top: 2.5rem;
		padding-top: 1.6rem;
		border-top: 1px solid var(--line);
	}

	.ghostLink {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--lineStrong);
	}

	.ghostLink:hover {
		background: var(--surfaceHover);
		color: var(--text);
	}

	@media (max-width: 620px) {
		.list > li {
			flex-wrap: wrap;
		}

		.list .btn {
			width: 100%;
			text-align: center;
		}
	}
</style>
