<script>
	// Which values the part pickers may use (src/lib/stock.js): a series, the
	// lab drawer, or the user's own lists, with the two boxes for those.
	import { parseStock, STOCK_CHOICES } from '$lib/stock';

	let { id = 'stock', stock = $bindable(), resistorText = $bindable(), capacitorText = $bindable() } = $props();

	const resistorCount = $derived(parseStock(resistorText, 'resistor').length);
	const capacitorCount = $derived(parseStock(capacitorText, 'capacitor').length);
</script>

<div class="stock">
	<div class="field">
		<label for={id}>Values the search may use</label>
		<select {id} bind:value={stock}>
			{#each STOCK_CHOICES as c (c.id)}
				<option value={c.id}>{c.label}</option>
			{/each}
		</select>
	</div>
	{#if stock === 'custom'}
		<div class="field grow">
			<label for="{id}R">Resistors on hand</label>
			<textarea id="{id}R" rows="2" bind:value={resistorText}></textarea>
		</div>
		<div class="field grow">
			<label for="{id}C">Capacitors on hand</label>
			<textarea id="{id}C" rows="2" bind:value={capacitorText}></textarea>
		</div>
	{/if}
</div>

{#if stock === 'custom'}
	<p class="note">
		Commas or spaces between values: <code>1k, 4.7k, 10k</code> for resistors,
		<code>10p, 1n, 47n</code> for capacitors. The suffixes k, M, p, n and u are understood,
		and the list is kept in this browser for next time. Reading
		{resistorCount} resistor{resistorCount === 1 ? '' : 's'} and
		{capacitorCount} capacitor{capacitorCount === 1 ? '' : 's'} right now.
	</p>
{/if}

<style>
	.stock {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 0.9rem;
	}

	.stock .field {
		margin-bottom: 0;
		min-width: 190px;
	}

	.stock .grow {
		flex: 1 1 260px;
	}

	.stock textarea {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.8rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		background: var(--surface);
		color: var(--text);
		resize: vertical;
	}

	.stock textarea:focus {
		outline: none;
		border-color: var(--blue);
	}
</style>
