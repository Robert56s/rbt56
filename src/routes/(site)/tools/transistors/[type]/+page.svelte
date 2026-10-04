<script>
	import FalstadEmbed from '$lib/components/guides/FalstadEmbed.svelte';
	import GuideBlocks from '$lib/components/guides/GuideBlocks.svelte';
	import PartCard from '$lib/components/guides/PartCard.svelte';
	import RichText from '$lib/components/guides/RichText.svelte';
	import SymbolView from '$lib/components/guides/SymbolView.svelte';
	import TypeNav from '$lib/components/guides/TypeNav.svelte';
	import { WIDGETS } from '$lib/components/transistors/widgets';
	import { sim } from '$lib/transistors/circuits';
	import { PARTS } from '$lib/transistors/parts';
	import { FAMILIES, TYPES, typeBySlug } from '$lib/transistors/types';

	let { data } = $props();

	const type = $derived(typeBySlug(data.slug));
	const family = $derived(FAMILIES.find((f) => f.id === type.family));
	const index = $derived(TYPES.indexOf(type));
	const prev = $derived(index > 0 ? TYPES[index - 1] : null);
	const next = $derived(index < TYPES.length - 1 ? TYPES[index + 1] : null);
	const parts = $derived((type.parts ?? []).map((id) => PARTS[id]).filter(Boolean));
	const related = $derived((type.related ?? []).map(typeBySlug).filter(Boolean));

	// the page's sections, numbered in the order they exist for this type
	const sections = $derived(
		[
			['how', 'How it works'],
			type.curves && ['curves', 'The curves'],
			type.sims?.length && ['sims', 'Circuits to try'],
			type.rules?.length && ['rules', 'Design rules'],
			parts.length && ['parts', 'Real parts and their datasheets'],
			type.bench?.length && ['bench', 'On the bench'],
			type.mistakes?.length && ['mistakes', 'Common traps'],
			type.quiz?.length && ['quiz', 'Check yourself']
		].filter(Boolean)
	);
	const num = (id) => String(sections.findIndex(([s]) => s === id) + 1).padStart(2, '0');
	// the description of the page, from the one-liner without its formula marks
	const plain = (s) => String(s ?? '').replace(/\$([^$]*)\$/g, (_, tex) => tex.replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}_^]/g, ''));
</script>

<svelte:head>
	<title>{type.name} · Transistor Guide · rbt56</title>
	<meta name="description" content={`${type.name}: ${plain(type.oneLiner)} How it works, its curves, circuits to run in a simulator, design rules and real datasheets.`} />
</svelte:head>

<article>
	<p class="eyebrow"><a href="/tools/transistors/">Tool 07 · Transistor Guide</a> · {family.name}</p>
	<TypeNav current={type.slug} />

	<header class="id">
		<div class="sym">
			<SymbolView symbol={type.symbol} height={120} label={`${type.name} symbol`} />
		</div>
		<div class="who">
			<h1>{type.name}</h1>
			<p class="lead"><RichText text={type.oneLiner} /></p>
		</div>
	</header>

	<dl class="card">
		<dt>Controlled by</dt>
		<dd><RichText text={type.control} /></dd>
		<dt>With no drive</dt>
		<dd>{type.normally === 'on' ? 'On: it conducts until the control turns it off' : 'Off: it conducts only when driven'}</dd>
		<dt>Fully on</dt>
		<dd><RichText text={type.fullyOn} /></dd>
		<dt>Terminals</dt>
		<dd>{type.terminals.map(([l, n]) => `${l} ${n}`).join(', ')}</dd>
		<dt>Used for</dt>
		<dd>{type.usedFor.join('; ')}</dd>
	</dl>

	<section class="panel">
		<div class="panel-head">
			<span class="num">{num('how')}</span>
			<h2>How it works</h2>
		</div>
		<GuideBlocks blocks={type.howItWorks} widgets={WIDGETS} simFor={sim} />
		{#if type.variants?.length}
			<h3 class="sub">Relatives</h3>
			<GuideBlocks blocks={type.variants} widgets={WIDGETS} simFor={sim} />
		{/if}
	</section>

	{#if type.curves}
		{@const Widget = WIDGETS[type.curves.widget]}
		<section class="panel">
			<div class="panel-head">
				<span class="num">{num('curves')}</span>
				<h2>The curves</h2>
				<span class="hint">interactive</span>
			</div>
			{#if type.curves.caption}
				<p class="caption"><RichText text={type.curves.caption} /></p>
			{/if}
			{#if Widget}
				<Widget {...type.curves.props ?? {}} />
			{/if}
		</section>
	{/if}

	{#if type.sims?.length}
		<section class="panel">
			<div class="panel-head">
				<span class="num">{num('sims')}</span>
				<h2>Circuits to try</h2>
				<span class="hint">Falstad's simulator, one at a time</span>
			</div>
			<p class="note">
				Each circuit runs in Paul Falstad's CircuitJS, loaded only on request. The sliders are in
				the panel on the right of the simulator, switches toggle with a click, and hovering a part
				shows its voltages, currents and state at the bottom right.
			</p>
			{#each type.sims as id (id)}
				<FalstadEmbed sim={sim(id)} />
			{/each}
		</section>
	{/if}

	{#if type.rules?.length}
		<section class="panel">
			<div class="panel-head">
				<span class="num">{num('rules')}</span>
				<h2>Design rules</h2>
			</div>
			<div class="rules">
				{#each type.rules as rule, i (i)}
					<div class="rule">
						<h3><RichText text={rule.title} /></h3>
						<GuideBlocks blocks={rule.body} widgets={WIDGETS} simFor={sim} />
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if parts.length}
		<section class="panel">
			<div class="panel-head">
				<span class="num">{num('parts')}</span>
				<h2>Real parts and their datasheets</h2>
			</div>
			<p class="note">
				Pinouts as seen from the front, legs down. Every value comes with the condition it is
				measured at: a number from a datasheet means nothing without it.
			</p>
			<div class="parts">
				{#each parts as part (part.id)}
					<PartCard {part} />
				{/each}
			</div>
		</section>
	{/if}

	{#if type.bench?.length}
		<section class="panel">
			<div class="panel-head">
				<span class="num">{num('bench')}</span>
				<h2>On the bench</h2>
			</div>
			<GuideBlocks blocks={type.bench} widgets={WIDGETS} simFor={sim} />
		</section>
	{/if}

	{#if type.mistakes?.length}
		<section class="panel">
			<div class="panel-head">
				<span class="num">{num('mistakes')}</span>
				<h2>Common traps</h2>
			</div>
			<ul class="traps">
				{#each type.mistakes as [myth, truth], i (i)}
					<li>
						<p class="myth"><RichText text={myth} /></p>
						<p class="truth"><RichText text={truth} /></p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if type.quiz?.length}
		<section class="panel">
			<div class="panel-head">
				<span class="num">{num('quiz')}</span>
				<h2>Check yourself</h2>
				<span class="hint">answers fold out</span>
			</div>
			<ol class="quiz">
				{#each type.quiz as [question, answer], i (i)}
					<li>
						<p><RichText text={question} /></p>
						<details>
							<summary>Answer</summary>
							<p class="answer"><RichText text={answer} /></p>
						</details>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<nav class="pager" aria-label="Previous and next type">
		{#if prev}
			<a href={`/tools/transistors/${prev.slug}/`}><span>Previous</span>{prev.name}</a>
		{:else}
			<span></span>
		{/if}
		{#if next}
			<a class="next" href={`/tools/transistors/${next.slug}/`}><span>Next</span>{next.name}</a>
		{/if}
	</nav>
	{#if related.length}
		<p class="related">
			Related:
			{#each related as t, i (t.slug)}<a href={`/tools/transistors/${t.slug}/`}>{t.name}</a>{i < related.length - 1 ? ', ' : ''}{/each}
		</p>
	{/if}
</article>

<style>
	.eyebrow a {
		color: var(--textDim);
	}

	.eyebrow a:hover {
		color: var(--blue);
	}

	.id {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1.6rem;
		align-items: center;
		margin-bottom: 1.1rem;
	}

	.sym {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.9rem 1.1rem;
		box-shadow: var(--shadow);
	}

	.who h1 {
		margin-bottom: 0.5rem;
	}

	.lead {
		font-size: 1.08rem;
		color: var(--textDim);
		max-width: 60ch;
		margin: 0;
	}

	.card {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem 1.2rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.9rem 1.2rem;
		margin-bottom: 1.1rem;
		box-shadow: var(--shadow);
		font-size: 0.92rem;
	}

	.card dt {
		color: var(--textDim);
	}

	.sub {
		font-size: 0.98rem;
		margin: 1.3rem 0 0.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}

	.caption {
		font-size: 0.9rem;
		color: var(--textDim);
		max-width: 78ch;
	}

	.rules {
		display: grid;
		gap: 1.1rem;
	}

	.rule + .rule {
		border-top: 1px solid var(--line);
		padding-top: 1rem;
	}

	.rule h3 {
		font-size: 0.98rem;
		margin-bottom: 0.5rem;
	}

	.parts {
		display: grid;
		gap: 0.9rem;
		margin-top: 0.8rem;
	}

	.traps {
		list-style: none;
		display: grid;
		gap: 0.8rem;
	}

	.traps li {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) 2fr;
		gap: 1rem;
		border-bottom: 1px solid var(--line);
		padding-bottom: 0.8rem;
	}

	.traps li:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}

	.myth {
		font-size: 0.9rem;
		color: var(--red);
		margin: 0;
	}

	.myth::before {
		content: 'Not so: ';
		font-weight: 700;
	}

	.truth {
		font-size: 0.9rem;
		margin: 0;
		max-width: none;
	}

	.quiz {
		padding-left: 1.3rem;
		display: grid;
		gap: 0.9rem;
		font-size: 0.92rem;
	}

	.quiz p {
		margin: 0;
		max-width: 75ch;
	}

	.quiz summary {
		cursor: pointer;
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--blue);
		width: fit-content;
		margin-top: 0.3rem;
	}

	.answer {
		margin-top: 0.4rem !important;
		color: var(--textDim);
		border-left: 2px solid var(--line);
		padding-left: 0.8rem;
	}

	.pager {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: 1.6rem 0 0.6rem;
	}

	.pager a {
		display: grid;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.6rem 1rem;
		font-weight: 500;
		transition: background 0.3s;
	}

	.pager a:hover {
		background: var(--surfaceHover);
	}

	.pager a span {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--textDim);
	}

	.pager .next {
		text-align: right;
		margin-left: auto;
	}

	.related {
		font-size: 0.88rem;
		color: var(--textDim);
	}

	@media (max-width: 720px) {
		.id {
			grid-template-columns: 1fr;
			gap: 0.8rem;
		}

		.sym {
			justify-self: start;
		}

		.traps li {
			grid-template-columns: 1fr;
			gap: 0.3rem;
		}
	}

	@media (max-width: 520px) {
		.card {
			grid-template-columns: 1fr;
			gap: 0.1rem;
		}

		.card dd {
			margin-bottom: 0.4rem;
		}
	}
</style>
