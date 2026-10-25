<script module>
	// The N of "up to N pairs" while another way is chosen: shared by every
	// picker of the page (the AM tool remounts one when its section changes)
	// and kept in this browser, so leaving the mode and coming back, or a
	// reload, finds the same N. The setting itself (stock.js) holds no N then.
	const LAST_LIMIT_KEY = 'rbt56.stock.lastPairLimit';
	let rememberedLimit = null;

	function recallLimit() {
		if (rememberedLimit !== null) return rememberedLimit;
		try {
			const n = Number(localStorage.getItem(LAST_LIMIT_KEY));
			if (Number.isInteger(n) && n >= 1) rememberedLimit = n;
		} catch {
			// private window or storage blocked
		}
		return rememberedLimit;
	}

	function keepLimit(n) {
		rememberedLimit = n;
		try {
			localStorage.setItem(LAST_LIMIT_KEY, String(n));
		} catch {
			// private window or storage blocked
		}
	}
</script>

<script>
	// Which values the part pickers may use (src/lib/stock.js): a series, the
	// lab drawer, or the user's own lists, with the two boxes for those. With
	// a list, the choice beside it says how many resistors may be two in
	// series (pairedResistor and limitPairs in the eseries modules): none,
	// up to N in the whole circuit, or every one where a pair helps.
	import { onMount, tick } from 'svelte';
	import { isRestricted, PAIR_LIMIT_MAX, parseStock, STOCK_CHOICES } from '$lib/stock';

	let { id = 'stock', stock = $bindable(), resistorText = $bindable(), capacitorText = $bindable(), pairs = $bindable(false), pairLimit = $bindable(null) } = $props();

	const resistorCount = $derived(parseStock(resistorText, 'resistor').length);
	const capacitorCount = $derived(parseStock(capacitorText, 'capacitor').length);

	// pairs false: single; pairs true with no cap: where they help; with a cap: up to N
	const mode = $derived(!pairs ? 'single' : pairLimit === null || pairLimit === undefined ? 'help' : 'limit');
	const clampLimit = (n) => Math.min(PAIR_LIMIT_MAX, Math.max(1, Math.round(n)));

	// the N of "up to N pairs", kept while another way is chosen (recallLimit
	// above); read from storage once mounted, so the page renders the same on
	// the server and in the browser
	let lastLimit = $state(rememberedLimit ?? 1);
	const shownLimit = $derived(mode === 'limit' ? pairLimit : lastLimit);
	onMount(() => {
		const n = recallLimit();
		if (n !== null) lastLimit = clampLimit(n);
	});
	$effect(() => {
		if (mode === 'limit' && Number.isInteger(pairLimit)) keepLimit(pairLimit);
	});

	function setLast(n) {
		lastLimit = n;
		keepLimit(n);
	}

	function choose(next) {
		if (mode === 'limit') setLast(pairLimit);
		pairs = next !== 'single';
		pairLimit = next === 'limit' ? lastLimit : null;
	}

	// a click on the greyed segment picks "up to N" and puts the cursor in N, ready to type
	let countField = $state();
	async function pickLimit(event) {
		event.preventDefault();
		choose('limit');
		await tick();
		countField?.focus();
		countField?.select();
	}

	// a whole number in range takes effect while typing; anything else waits for the field to be left
	function typed(event) {
		const n = Number(event.currentTarget.value);
		if (event.currentTarget.value.trim() === '' || !Number.isInteger(n) || n < 1 || n > PAIR_LIMIT_MAX) return;
		setLast(n);
		if (mode === 'limit') pairLimit = n;
	}

	function settled(event) {
		const n = Number(event.currentTarget.value);
		const value = event.currentTarget.value.trim() !== '' && Number.isFinite(n) ? clampLimit(n) : shownLimit;
		setLast(value);
		if (mode === 'limit') pairLimit = value;
		event.currentTarget.value = String(value);
	}

	const plural = (n) => (n === 1 ? 'pair' : 'pairs');
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
		<div class="field">
			<span class="groupLabel" id="{id}PairsLabel">Two resistors in series</span>
			<div class="pairMode" role="radiogroup" aria-labelledby="{id}PairsLabel">
				<label class="seg" class:on={mode === 'single'}>
					<input type="radio" name="{id}Pairs" value="single" checked={mode === 'single'} onchange={() => choose('single')} />
					Single resistors
				</label>
				<div class="seg limit" class:on={mode === 'limit'}>
					<label for="{id}PairsLimit">
						<input type="radio" id="{id}PairsLimit" name="{id}Pairs" value="limit" checked={mode === 'limit'} aria-label="Up to {shownLimit} {plural(shownLimit)}" onchange={() => choose('limit')} />
						Up to
					</label>
					<input
						bind:this={countField}
						type="number"
						class="count"
						min="1"
						max={PAIR_LIMIT_MAX}
						step="1"
						value={shownLimit}
						disabled={mode !== 'limit'}
						aria-label="Most pairs in the circuit"
						oninput={typed}
						onchange={settled}
					/>
					<label for="{id}PairsLimit" class="tail">{plural(shownLimit)}</label>
					{#if mode !== 'limit'}
						<!-- while another way is chosen, a click anywhere on the segment, the greyed field included, picks this one -->
						<label for="{id}PairsLimit" class="cover" aria-hidden="true" onclick={pickLimit}></label>
					{/if}
				</div>
				<label class="seg" class:on={mode === 'help'}>
					<input type="radio" name="{id}Pairs" value="help" checked={mode === 'help'} onchange={() => choose('help')} />
					Pairs where they help
				</label>
			</div>
		</div>
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
{#if isRestricted(stock)}
	<p class="note">
		{#if mode === 'single'}
			Each resistor is a single value from the list.
		{:else if mode === 'help'}
			Where the closest single resistor misses a part that sets the result (a frequency, a Q, a
			gain, a bias) by more than 2 %, two resistors in series stand in for it, as long as the pair
			at least halves the miss and the circuit as a whole comes out no worse. Capacitors stay
			single parts. The tables give both values, such as 64.2 kΩ (56.0 kΩ + 8.20 kΩ).
		{:else}
			Two resistors in series stand in where the closest single one misses a part that sets the
			result by more than 2 %. The whole circuit holds at most {pairLimit} {plural(pairLimit)}, and each
			resistor built from two counts as one pair. When more would help, the {pairLimit === 1 ? 'one that brings' : `${pairLimit} that bring`} the
			circuit closest to its targets {pairLimit === 1 ? 'stays' : 'stay'} and every other resistor is a single part.
			Capacitors are never paired.
		{/if}
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

	.groupLabel {
		display: block;
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--textDim);
		margin-bottom: 0.35rem;
	}

	.pairMode {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.seg {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		min-height: 2.35rem;
		padding: 0.35rem 0.85rem;
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		background: var(--surface);
		color: var(--textDim);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: border-color 0.2s, background 0.2s, color 0.2s;
	}

	.seg:hover {
		border-color: var(--lineStrong);
	}

	.seg.on {
		background: var(--blue);
		border-color: var(--blue);
		color: #fff;
	}

	.seg:has(input[type='radio']:focus-visible) {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}

	.seg label {
		display: flex;
		align-items: center;
		margin: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	/* the radio itself stays in the page for the keyboard and screen readers, the segment shows the choice */
	.seg input[type='radio'] {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
		pointer-events: none;
	}

	.seg .count {
		width: 3.6rem;
		padding: 0.2rem 0.35rem;
		font-size: 0.85rem;
		text-align: center;
	}

	.seg.on .count {
		border-color: #fff;
	}

	.seg .count:disabled {
		cursor: pointer;
	}

	.seg .cover {
		position: absolute;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
</style>
