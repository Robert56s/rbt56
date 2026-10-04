<script>
	// One real part: its pinout as it sits on a breadboard, the lines of its
	// datasheet that matter, each with the condition it is measured at, and
	// a link to the manufacturer's PDF.
	//   part   an entry of src/lib/transistors/parts.js
	import Pinout from './Pinout.svelte';
	import RichText from './RichText.svelte';

	let { part } = $props();

	const host = $derived.by(() => {
		try {
			return new URL(part.url).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	});
</script>

<article class="part" id={`part-${part.id}`}>
	<div class="side">
		{#if part.pinout?.legs?.length}
			<Pinout pkg={part.pinout.package} legs={part.pinout.legs} tab={part.pinout.tab ?? ''} />
		{:else if part.pinout?.text}
			<p class="pintext"><b>{part.pinout.package}</b><br /><RichText text={part.pinout.text} /></p>
		{/if}
		{#if part.pinout?.note}
			<p class="pinnote"><RichText text={part.pinout.note} /></p>
		{/if}
	</div>
	<div class="main">
		<header>
			<h4>{part.part}</h4>
			<span class="kind">{part.kind}</span>
		</header>
		<p class="maker">
			{part.maker}, {part.package}.
			<a href={part.url} target="_blank" rel="noreferrer">Datasheet{part.url.endsWith('.pdf') ? ' (PDF)' : ''}, {host}</a>
		</p>
		{#if part.values?.length}
			<div class="tableScroll">
				<table class="vals">
					<thead>
						<tr><th>Line</th><th>Value</th><th>Measured at</th></tr>
					</thead>
					<tbody>
						{#each part.values as [name, value, condition], i (i)}
							<tr>
								<td><RichText text={name} /></td>
								<td><RichText text={value} /></td>
								<td><RichText text={condition ?? ''} /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if part.read}
			<p class="read"><b>What to read first.</b> <RichText text={part.read} /></p>
		{/if}
	</div>
</article>

<style>
	.part {
		display: grid;
		grid-template-columns: 8rem 1fr;
		gap: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.9rem 1rem;
		background: var(--surface);
	}

	/* a grid item never grows past its column, so a long note or a wide
	   table wraps or scrolls inside the card instead of widening the page */
	.part > * {
		min-width: 0;
	}

	.side {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 0.3rem;
	}

	.pintext {
		overflow-wrap: anywhere;
		font-size: 0.78rem;
		color: var(--textDim);
		margin: 0;
	}

	.pintext b {
		color: var(--text);
	}

	.pinnote {
		overflow-wrap: anywhere;
		max-width: 100%;
		font-size: 0.72rem;
		color: var(--textDim);
		text-align: center;
		margin: 0;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	h4 {
		font-family: var(--mono);
		font-size: 1.02rem;
	}

	.kind {
		font-size: 0.8rem;
		color: var(--textDim);
	}

	.maker {
		overflow-wrap: anywhere;
		font-size: 0.85rem;
		margin: 0.15rem 0 0.5rem;
		max-width: none;
	}

	.vals th,
	.vals td {
		white-space: normal;
		vertical-align: top;
		font-size: 0.82rem;
		padding-top: 0.3rem;
		padding-bottom: 0.3rem;
	}

	.vals td {
		font-family: inherit;
	}

	.vals td:nth-child(2) {
		white-space: nowrap;
		font-family: var(--mono);
	}

	.vals td:nth-child(3) {
		color: var(--textDim);
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
		margin: 0.6rem 0 0;
		max-width: none;
	}

	.read b {
		color: var(--text);
		font-weight: 500;
	}

	@media (max-width: 620px) {
		.part {
			grid-template-columns: 1fr;
		}
	}
</style>
