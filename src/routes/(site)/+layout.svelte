<script>
	import { page } from '$app/state';
	import '../../app.css';

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
	header.site {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--bar);
		box-shadow: 0 1px 12px rgba(16, 24, 40, 0.18);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		height: 3.5rem;
		flex-wrap: wrap;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #fff;
	}

	.brand:hover {
		color: #fff;
	}

	.mark {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		background: var(--barLight);
		border-radius: 0.4rem;
	}

	.mark i {
		width: 6px;
		height: 16px;
		display: block;
		border-radius: 2px;
	}

	.mark .l {
		background: var(--blueLight);
	}

	.mark .r {
		background: var(--redLight);
	}

	nav {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
	}

	nav a {
		font-size: 0.9rem;
		font-weight: 500;
		color: #b9bec6;
		padding: 0.4rem 0.85rem;
		border-radius: var(--radiusSmall);
		transition: background 0.3s, color 0.3s;
	}

	nav a:hover {
		background: var(--barLight);
		color: #fff;
	}

	nav a.current {
		background: var(--blue);
		color: #fff;
	}

	nav a.current:hover {
		background: var(--blueLight);
	}

	main {
		padding: 2.2rem 0 3rem;
		display: block;
	}

	footer.site {
		border-top: 1px solid var(--line);
		padding: 1.4rem 0;
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	footer p {
		font-size: 0.85rem;
		color: var(--textDim);
		max-width: none;
	}

	footer a {
		margin-left: auto;
		font-size: 0.85rem;
		font-weight: 500;
	}
</style>
