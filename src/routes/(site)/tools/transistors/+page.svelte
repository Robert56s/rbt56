<script>
	import FalstadEmbed from '$lib/components/guides/FalstadEmbed.svelte';
	import GuideBlocks from '$lib/components/guides/GuideBlocks.svelte';
	import Pinout from '$lib/components/guides/Pinout.svelte';
	import RichText from '$lib/components/guides/RichText.svelte';
	import SymbolView from '$lib/components/guides/SymbolView.svelte';
	import { WIDGETS } from '$lib/components/transistors/widgets';
	import { sim } from '$lib/transistors/circuits';
	import { HUB } from '$lib/transistors/hub';
	import { PARTS } from '$lib/transistors/parts';
	import { FAMILIES, TYPES, typeBySlug, typesIn } from '$lib/transistors/types';

	let jobId = $state(HUB.jobs[0].id);
	const job = $derived(HUB.jobs.find((j) => j.id === jobId));
	const parts = Object.values(PARTS);
	// where a simulation lives: on this page, or on the page of a type
	function simHref(id) {
		if (HUB.blocksSims.includes(id)) return `#sim-${id}`;
		const t = TYPES.find((x) => x.sims?.includes(id));
		return t ? `/tools/transistors/${t.slug}/#sim-${id}` : null;
	}
	// the card of a part, on the page of the first type that lists it
	function cardHref(id) {
		const t = TYPES.find((x) => x.parts?.includes(id));
		return t ? `/tools/transistors/${t.slug}/#part-${id}` : null;
	}
</script>

<svelte:head>
	<title>Transistor Guide · rbt56</title>
	<meta
		name="description"
		content="Every kind of transistor a circuit designer meets, bipolar, JFET, MOSFET, IGBT, GaN, SiC and UJT: how each works, its curves to play with, basic circuits running in Falstad's simulator, design rules, and real datasheets with their pinouts."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 07</p>
	<h1>Transistor Guide</h1>
	<p class="lead">
		Every kind of transistor a circuit designer meets, one page each: how it works, its curves to
		play with, basic circuits running live in a simulator, the design rules with numbers, and the
		lines of a real datasheet that matter, with the pinout as it sits on a breadboard.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>What a transistor does</h2>
		</div>
		<GuideBlocks blocks={HUB.start} widgets={WIDGETS} simFor={sim} />
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">02</span>
			<h2>The family</h2>
			<span class="hint">a page for each</span>
		</div>
		{#each FAMILIES as family (family.id)}
			<div class="family">
				<h3>{family.name}</h3>
				<p class="blurb">{family.blurb}</p>
				<div class="cards">
					{#each typesIn(family.id) as t (t.slug)}
						<a class="card" href={`/tools/transistors/${t.slug}/`}>
							<span class="sym"><SymbolView symbol={{ ...t.symbol, labels: {} }} height={58} label={`${t.name} symbol`} /></span>
							<span class="body">
								<span class="name">{t.name}</span>
								<span class="one"><RichText text={t.oneLiner} /></span>
								<span class="chips">
									<span class="chip" class:on={t.normally === 'on'}>normally {t.normally}</span>
								</span>
							</span>
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">03</span>
			<h2>Normally on, normally off</h2>
			<span class="hint">interactive</span>
		</div>
		<GuideBlocks blocks={HUB.normally} widgets={WIDGETS} simFor={sim} />
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">04</span>
			<h2>Which transistor for the job</h2>
		</div>
		<div class="jobs" role="tablist" aria-label="Jobs">
			{#each HUB.jobs as j (j.id)}
				<button type="button" role="tab" aria-selected={j.id === jobId} class:on={j.id === jobId} onclick={() => (jobId = j.id)}>{j.job}</button>
			{/each}
		</div>
		<div class="answer" role="tabpanel">
			<p class="pick"><RichText text={job.pick} /></p>
			<p class="why"><RichText text={job.why} /></p>
			<p class="links">
				{#each job.types as slug (slug)}
					{@const t = typeBySlug(slug)}
					{#if t}<a class="btn small" href={`/tools/transistors/${slug}/`}>{t.name}</a>{/if}
				{/each}
				{#each job.parts as id (id)}
					{#if PARTS[id]}<span class="partchip">{PARTS[id].part}</span>{/if}
				{/each}
			</p>
			{#if job.sims?.length}
				<p class="simlinks">
					To try in the simulator:
					{#each job.sims.filter(simHref) as id, i (id)}{i > 0 ? ', ' : ''}<a href={simHref(id)}>{sim(id).title}</a>{/each}.
				</p>
			{/if}
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">05</span>
			<h2>Side by side</h2>
		</div>
		<div class="tableScroll">
			<table class="compare">
				<thead>
					<tr>
						{#each HUB.compare.head as h (h)}<th>{h}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each HUB.compare.rows as row, i (i)}
						<tr>
							{#each row as cell, c (c)}<td><RichText text={cell} /></td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">06</span>
			<h2>Reading a datasheet</h2>
		</div>
		<GuideBlocks blocks={HUB.datasheet} widgets={WIDGETS} simFor={sim} />
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">07</span>
			<h2>On the bench: pinouts and a meter check</h2>
		</div>
		<GuideBlocks blocks={HUB.bench} widgets={WIDGETS} simFor={sim} />
		<div class="wall">
			{#each parts as p (p.id)}
				<figure>
					{#if p.pinout.legs?.length}
						<Pinout pkg={p.pinout.package} legs={p.pinout.legs} tab={p.pinout.tab ?? ''} />
					{:else}
						<a class="inwords" href={cardHref(p.id)}>Pinout described in words on its card</a>
					{/if}
					<figcaption>
						<a href={p.url} target="_blank" rel="noreferrer">{p.part}</a>
						<span>{p.pinout.package}</span>
					</figcaption>
				</figure>
			{/each}
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">08</span>
			<h2>Circuits made of several transistors</h2>
			<span class="hint">Falstad's simulator, one at a time</span>
		</div>
		<GuideBlocks blocks={HUB.blocksIntro} widgets={WIDGETS} simFor={sim} />
		{#each HUB.blocksSims as id (id)}
			<FalstadEmbed sim={sim(id)} />
		{/each}
	</section>
</article>

<style>
	.lead {
		font-size: 1.08rem;
		color: var(--textDim);
		max-width: 62ch;
		margin-bottom: 1.6rem;
	}

	.family + .family {
		margin-top: 1.4rem;
	}

	.family h3 {
		font-size: 1rem;
	}

	.blurb {
		font-size: 0.88rem;
		color: var(--textDim);
		margin: 0.15rem 0 0.7rem;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(290px, 100%), 1fr));
		gap: 0.7rem;
	}

	.card {
		display: grid;
		grid-template-columns: 4.6rem 1fr;
		gap: 0.8rem;
		align-items: center;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.7rem 0.8rem;
		background: var(--surface);
		color: var(--text);
		transition: background 0.3s, border-color 0.3s, transform 0.1s;
	}

	.card:hover {
		background: var(--surfaceSunk);
		border-color: var(--lineStrong);
		color: var(--text);
	}

	.card:active {
		transform: scale(0.98);
	}

	.sym {
		display: grid;
		place-items: center;
	}

	.body {
		display: grid;
		gap: 0.2rem;
	}

	.name {
		font-weight: 700;
		font-size: 0.95rem;
	}

	.one {
		font-size: 0.82rem;
		color: var(--textDim);
		line-height: 1.45;
	}

	.chips {
		display: flex;
		gap: 0.3rem;
	}

	.chip {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--textDim);
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
	}

	.chip.on {
		color: var(--amber);
		background: var(--amberSoft);
		border-color: #f0dfae;
	}

	.jobs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
		gap: 0.45rem;
		margin-bottom: 1rem;
	}

	.jobs button {
		text-align: left;
		font-size: 0.84rem;
		font-weight: 400;
		line-height: 1.35;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--lineStrong);
		padding: 0.55rem 0.75rem;
	}

	.jobs button:hover:not(:disabled) {
		background: var(--surfaceHover);
		color: var(--text);
	}

	.jobs button.on {
		background: var(--blue);
		border-color: var(--blue);
		color: #fff;
	}

	.answer {
		border-left: 3px solid var(--blue);
		padding: 0.2rem 0 0.2rem 1rem;
	}

	.pick {
		font-weight: 700;
		font-size: 1rem;
		margin-bottom: 0.4rem;
	}

	.why {
		font-size: 0.92rem;
		color: var(--textDim);
		max-width: 75ch;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		margin-top: 0.7rem;
	}

	.partchip {
		font-family: var(--mono);
		font-size: 0.8rem;
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		padding: 0.25rem 0.55rem;
		background: var(--surfaceSunk);
	}

	.simlinks {
		font-size: 0.84rem;
		color: var(--textDim);
		margin-top: 0.5rem;
	}

	.compare th,
	.compare td {
		white-space: normal;
		vertical-align: top;
		font-family: inherit;
		font-size: 0.82rem;
		min-width: 7rem;
	}

	.compare td:first-child {
		font-weight: 700;
		min-width: 6rem;
	}

	.wall {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: 0.9rem;
		margin-top: 1rem;
	}

	.wall figure {
		display: grid;
		justify-items: center;
		gap: 0.3rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.6rem 0.4rem;
		background: var(--surface);
	}

	.inwords {
		display: grid;
		place-items: center;
		width: 100%;
		min-height: 6.5rem;
		padding: 0.5rem;
		border: 1px dashed var(--lineStrong);
		border-radius: var(--radiusSmall);
		font-size: 0.74rem;
		line-height: 1.35;
		text-align: center;
		color: var(--textDim);
	}

	figcaption {
		display: grid;
		justify-items: center;
		font-size: 0.82rem;
	}

	figcaption a {
		font-family: var(--mono);
		font-weight: 700;
	}

	figcaption span {
		font-size: 0.72rem;
		color: var(--textDim);
	}
</style>
