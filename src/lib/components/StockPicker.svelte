<script>
	// Which values the part pickers may use (src/lib/stock.js): a series, the
	// lab drawer, or the user's own lists, with the two boxes for those. With
	// a list, the button beside it lets the parts that set the result be two
	// resistors in series (pairedResistor in the eseries modules).
	import { isRestricted, parseStock, STOCK_CHOICES } from '$lib/stock';

	let { id = 'stock', stock = $bindable(), resistorText = $bindable(), capacitorText = $bindable(), pairs = $bindable(false) } = $props();

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
	{#if isRestricted(stock)}
		<button type="button" class="pairs" class:on={pairs} aria-pressed={pairs} onclick={() => (pairs = !pairs)}>
			Two resistors in series
		</button>
	{/if}
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
{#if pairs && isRestricted(stock)}
	<p class="note">
		Two in series is on: where the closest single resistor misses a part that sets the result (a
		frequency, a Q, a gain, a bias) by more than 2 %, two resistors in series stand in for it, as
		long as the pair at least halves the miss and the circuit as a whole comes out no worse.
		Capacitors stay single parts. The tables give both values, such as 64.2 kΩ (56.0 kΩ + 8.20 kΩ).
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

	.pairs {
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--blue);
		border-radius: var(--radiusSmall);
		background: var(--surface);
		color: var(--blue);
		cursor: pointer;
	}

	.pairs.on {
		background: var(--blue);
		color: #fff;
	}

	.pairs:focus-visible {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}
</style>
