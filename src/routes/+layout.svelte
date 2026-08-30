<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';

	let { children } = $props();

	const links = [
		{ href: '/', text: 'Home' },
		{ href: '/tools/stereo/', text: 'Stereo L/R' }
	];

	const path = $derived(page.url.pathname);
</script>

<header class="site">
	<div class="wrap bar">
		<a class="brand" href="/">
			<span class="mark"><i class="l"></i><i class="r"></i></span>
			rbt56
		</a>
		<nav>
			{#each links as link (link.href)}
				<a href={link.href} class:current={path === link.href}>{link.text}</a>
			{/each}
		</nav>
	</div>
</header>

<main class="wrap">
	{@render children()}
</main>

<footer class="site">
	<div class="wrap foot">
		<p>rbt56. Everything runs in the browser, no file leaves the machine.</p>
		<a href="https://github.com/Robert56s/" target="_blank" rel="noreferrer">github.com/Robert56s</a>
	</div>
</footer>

<style>
	.site {
		border-bottom: 3px solid var(--ink);
		background: var(--card);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.7rem 0;
		flex-wrap: wrap;
	}

	.brand {
		font-family: var(--mono);
		font-weight: 700;
		font-size: 1.15rem;
		letter-spacing: 0.02em;
		text-decoration: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.brand:hover {
		background: transparent;
		color: var(--ink);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}

	.mark {
		display: inline-flex;
		gap: 2px;
		border: 2px solid var(--ink);
		padding: 2px;
		background: var(--ink);
	}

	.mark i {
		width: 7px;
		height: 16px;
		display: block;
	}

	.mark .l {
		background: var(--left);
	}

	.mark .r {
		background: var(--right);
	}

	nav {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
	}

	nav a {
		font-family: var(--mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		text-decoration: none;
		padding: 0.35rem 0.6rem;
		border: 2px solid transparent;
	}

	nav a:hover {
		background: var(--ink);
		color: var(--paper);
	}

	nav a.current {
		border-color: var(--ink);
	}

	nav a.current:hover {
		background: var(--ink);
		color: var(--paper);
	}

	main {
		padding: 2.2rem 0 3rem;
		display: block;
	}

	footer.site {
		border-bottom: 0;
		border-top: 3px solid var(--ink);
		padding: 1.2rem 0;
	}

	.foot {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
	}

	footer p {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--muted);
		margin: 0;
		max-width: none;
	}

	footer a {
		margin-left: auto;
		font-family: var(--mono);
		font-size: 0.72rem;
		text-decoration: none;
		border-bottom: 2px solid var(--ink);
		padding-bottom: 1px;
	}

	footer a:hover {
		background: var(--ink);
		color: var(--paper);
	}
</style>
