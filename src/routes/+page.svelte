<script lang="ts">
	import { tools } from '$lib/tools';
</script>

<svelte:head>
	<title>rbt56</title>
	<meta name="description" content="Small homemade tools that run in the browser." />
</svelte:head>

<section class="hero">
	<p class="eyebrow">Toolbox</p>
	<h1>rbt56</h1>
	<p class="lead">
		Small tools built for school or for a side project. They all run in the browser.
	</p>
</section>

<hr />

<section>
	<p class="eyebrow">Tools</p>
	<ol class="list">
		{#each tools as tool, i (tool.href)}
			<li>
				<span class="num">{String(i + 1).padStart(2, '0')}</span>
				<div class="body">
					<h2><a href={tool.href}>{tool.name}</a></h2>
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
	<p class="note">More to come.</p>
</section>

<style>
	.hero h1 {
		font-size: clamp(2.4rem, 8vw, 4rem);
		letter-spacing: -0.03em;
		margin-bottom: 0.8rem;
	}

	.lead {
		font-size: 1.05rem;
		max-width: 56ch;
	}

	.list {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		gap: 1rem;
	}

	.list li {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		border: 2px solid var(--ink);
		background: var(--card);
		padding: 1rem 1.1rem;
	}

	.num {
		font-family: var(--mono);
		font-size: 1.4rem;
		font-weight: 700;
		color: rgba(23, 21, 15, 0.3);
		line-height: 1.1;
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.body h2 {
		margin-bottom: 0.35rem;
	}

	.body p {
		margin-bottom: 0.6rem;
		font-size: 0.95rem;
	}

	.tags {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
	}

	.tags li {
		display: block;
		border: 1px solid rgba(23, 21, 15, 0.45);
		background: transparent;
		padding: 0.1rem 0.45rem;
		font-family: var(--mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}

	.tags li.state {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}

	.list .btn {
		align-self: center;
	}

	@media (max-width: 620px) {
		.list li {
			flex-wrap: wrap;
		}

		.list .btn {
			width: 100%;
			text-align: center;
		}
	}
</style>
