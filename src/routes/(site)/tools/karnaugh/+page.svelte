<script>
	import DiagramView from '$lib/components/DiagramView.svelte';
	import Equation from '$lib/components/Equation.svelte';
	import KarnaughMap from '$lib/components/KarnaughMap.svelte';
	import MathPanel from '$lib/components/MathPanel.svelte';
	import { buildTwoLevelDiagram, gateCount } from '$lib/karnaugh/circuit';
	import { generateScript } from '$lib/karnaugh/codegen';
	import { explainSolution } from '$lib/karnaugh/explain';
	import { literals, posTex, posText, productText, sopTex, sopText, sumText } from '$lib/karnaugh/expression';
	import { implicantPieces, layout } from '$lib/karnaugh/kmap';
	import { literalCount, minimizeBoth } from '$lib/karnaugh/minimize';

	const DEFAULT_NAMES = ['A', 'B', 'C', 'D'];
	const PALETTE = ['#2f6fed', '#d97706', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
	const EXAMPLES = [
		{ label: 'Σm(0,2,5,7,8,10,13,15)', n: 4, ones: [0, 2, 5, 7, 8, 10, 13, 15], dcs: [] },
		{ label: 'Σm(1,3,7,11,15) + d(0,2,5)', n: 4, ones: [1, 3, 7, 11, 15], dcs: [0, 2, 5] },
		{ label: 'Σm(0,1,2,5,6,7), 3 variables', n: 3, ones: [0, 1, 2, 5, 6, 7], dcs: [] },
		{ label: 'BCD to 7-segment, segment a', n: 4, ones: [0, 2, 3, 5, 6, 7, 8, 9], dcs: [10, 11, 12, 13, 14, 15] }
	];

	let n = $state(4);
	let names = $state([...DEFAULT_NAMES]);
	let cells = $state(new Array(16).fill(0));
	let form = $state('sop');
	let mintermText = $state('');
	let dontCareText = $state('');

	const cleanNames = $derived(names.map((s, i) => (String(s ?? '').trim() || DEFAULT_NAMES[i]).slice(0, 3)));
	const lay = $derived(layout(n));
	const ones = $derived(cells.flatMap((v, m) => (v === 1 ? [m] : [])));
	const dcs = $derived(cells.flatMap((v, m) => (v === 2 ? [m] : [])));
	const result = $derived(minimizeBoth(n, ones, dcs));
	const active = $derived(form === 'sop' ? result.sop : result.pos);
	const constant = $derived(form === 'sop' ? result.sop.constant : result.pos.constant === null ? null : 1 - result.pos.constant);
	const groups = $derived(
		active.constant !== null
			? []
			: active.cover.map((imp, i) => ({
					...implicantPieces(lay, imp),
					imp,
					color: PALETTE[i % PALETTE.length],
					essential: active.essentialIdx.includes(active.coverIdx[i])
				}))
	);
	const terms = $derived(constant !== null ? [] : active.cover.map((imp) => literals(imp, n, cleanNames, { complement: form === 'pos' })));
	const expressionTex = $derived(
		constant !== null ? `F = ${constant}` : `F = ${form === 'sop' ? sopTex(result.sop.cover, n, cleanNames) : posTex(result.pos.cover, n, cleanNames)}`
	);
	const otherText = $derived(
		form === 'sop'
			? result.pos.constant !== null
				? String(1 - result.pos.constant)
				: posText(result.pos.cover, n, cleanNames)
			: result.sop.constant !== null
				? String(result.sop.constant)
				: sopText(result.sop.cover, n, cleanNames)
	);
	const gates = $derived(gateCount(terms, cleanNames, form));
	const diagram = $derived(buildTwoLevelDiagram({ names: cleanNames, terms, form, constant }));
	const blocks = $derived(explainSolution({ n, names: cleanNames, form, result, gates }));

	function termLabel(imp) {
		return form === 'sop' ? productText(literals(imp, n, cleanNames)) : sumText(literals(imp, n, cleanNames, { complement: true }));
	}

	function syncText() {
		mintermText = ones.join(', ');
		dontCareText = dcs.join(', ');
	}

	function toggle(m) {
		cells[m] = (cells[m] + 1) % 3;
		syncText();
	}

	function setSize(size) {
		n = size;
		names = DEFAULT_NAMES.slice(0, size);
		cells = new Array(1 << size).fill(0);
		syncText();
	}

	function parseList(text) {
		return [...new Set((String(text).match(/\d+/g) || []).map(Number).filter((m) => m < 1 << n))];
	}

	function applyText() {
		const o = parseList(mintermText);
		const d = parseList(dontCareText).filter((m) => !o.includes(m));
		cells = cells.map((_, m) => (o.includes(m) ? 1 : d.includes(m) ? 2 : 0));
		syncText();
	}

	function loadExample(ex) {
		n = ex.n;
		names = DEFAULT_NAMES.slice(0, ex.n);
		cells = Array.from({ length: 1 << ex.n }, (_, m) => (ex.ones.includes(m) ? 1 : ex.dcs.includes(m) ? 2 : 0));
		syncText();
	}

	function clearMap() {
		cells = new Array(1 << n).fill(0);
		syncText();
	}

	function downloadScript() {
		const code = generateScript({ names: cleanNames, ones, dcs });
		const blob = new Blob([code], { type: 'text/javascript' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'karnaugh-solver.js';
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}
</script>

<svelte:head>
	<title>Karnaugh Map Solver · rbt56</title>
	<meta
		name="description"
		content="Minimize a Boolean function of 2 to 4 variables on a Karnaugh map: groups, prime implicants, the minimal sum-of-products or product-of-sums expression with every step, and the two-level gate circuit."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 04</p>
	<h1>Karnaugh Map Solver</h1>
	<p class="lead">
		Fill in a map of 2, 3 or 4 variables with ones, zeros and don't-cares. The tool draws the groups,
		derives the minimal sum-of-products or product-of-sums expression with every step of the method
		shown, and builds the two-level gate circuit that implements it.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>Function</h2>
			<span class="hint">{ones.length} one{ones.length === 1 ? '' : 's'}, {dcs.length} don't-care{dcs.length === 1 ? '' : 's'}</span>
		</div>
		<div class="grid">
			<div class="field">
				<label for="nvars">Variables</label>
				<select id="nvars" value={n} onchange={(e) => setSize(Number(e.currentTarget.value))}>
					<option value="2">2</option>
					<option value="3">3</option>
					<option value="4">4</option>
				</select>
			</div>
			{#each cleanNames as _, i (i)}
				<div class="field">
					<label for="name{i}">Variable {i + 1} name</label>
					<input id="name{i}" type="text" maxlength="3" bind:value={names[i]} />
				</div>
			{/each}
		</div>
		<div class="grid lists">
			<div class="field">
				<label for="minterms">Minterms where F = 1 (Σm)</label>
				<input id="minterms" type="text" placeholder="e.g. 0, 2, 5, 7" bind:value={mintermText} onchange={applyText} />
			</div>
			<div class="field">
				<label for="dontcares">Don't-cares (d)</label>
				<input id="dontcares" type="text" placeholder="e.g. 10, 11" bind:value={dontCareText} onchange={applyText} />
			</div>
		</div>
		<div class="actions">
			<button type="button" class="ghost small" onclick={clearMap}>Clear</button>
			{#each EXAMPLES as ex (ex.label)}
				<button type="button" class="ghost small" onclick={() => loadExample(ex)}>{ex.label}</button>
			{/each}
		</div>
		<p class="note">
			Cell numbers read the variables in order, first variable as the most significant bit: with A, B,
			C, D the cell 6 = 0110 is A'BCD'. Click a cell to cycle it 0, 1, X.
		</p>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">02</span>
			<h2>Karnaugh map</h2>
			<span class="hint">{groups.length} group{groups.length === 1 ? '' : 's'}</span>
		</div>
		<div class="modeSwitch">
			<button type="button" class:active={form === 'sop'} onclick={() => (form = 'sop')}>Sum of products (group the 1s)</button>
			<button type="button" class:active={form === 'pos'} onclick={() => (form = 'pos')}>Product of sums (group the 0s)</button>
		</div>
		<div class="mapRow">
			<KarnaughMap {n} names={cleanNames} {cells} {groups} onToggle={toggle} />
			<ul class="groups">
				{#each groups as g, i (i)}
					<li>
						<span class="chip" style="background: {g.color}"></span>
						<code>{termLabel(g.imp)}</code>
						<span class="dim">cells {g.cells.join(', ')}{g.essential ? ', essential' : ''}</span>
					</li>
				{:else}
					<li class="dim">
						{#if constant !== null}
							Constant function, nothing to group.
						{:else}
							No {form === 'sop' ? 'ones' : 'zeros'} to group yet.
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">03</span>
			<h2>Minimal expression</h2>
			<span class="hint">{form === 'sop' ? 'sum of products' : 'product of sums'}</span>
		</div>
		<Equation tex={expressionTex} />
		<table>
			<tbody>
				<tr><td>Terms</td><td>{constant !== null ? 0 : active.cover.length}</td></tr>
				<tr><td>Literals</td><td>{constant !== null ? 0 : literalCount(active.cover)}</td></tr>
				<tr><td>Prime implicants found</td><td>{active.constant !== null ? 0 : active.primes.length}</td></tr>
				<tr><td>Essential</td><td>{active.constant !== null ? 0 : active.essentialIdx.length}</td></tr>
				<tr><td>Other form ({form === 'sop' ? 'product of sums' : 'sum of products'})</td><td>{otherText}</td></tr>
			</tbody>
		</table>
		<MathPanel summary="Show the method, step by step" {blocks} />
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">04</span>
			<h2>Simplified circuit</h2>
			<span class="hint">{gates.total} gate{gates.total === 1 ? '' : 's'}</span>
		</div>
		<DiagramView {diagram} label="two-level gate circuit" />
		<p class="note">
			{#if constant !== null}
				A constant output needs no gate: tie F to {constant === 1 ? 'the supply' : 'ground'}.
			{:else}
				{gates.inverters} inverter{gates.inverters === 1 ? '' : 's'}, {gates.first} {gates.firstType}
				gate{gates.first === 1 ? '' : 's'}{gates.second ? `, 1 ${gates.secondType} gate` : ''}. A dot is a
				connection; wires that merely cross are not connected. Single-literal terms go straight to
				the {gates.secondType} gate.
			{/if}
		</p>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">05</span>
			<h2>Download</h2>
		</div>
		<p class="note">A standalone script with this exact function, runnable with <code>node karnaugh-solver.js</code>: prime implicants, essentials, cover, both forms.</p>
		<button type="button" onclick={downloadScript}>Download karnaugh-solver.js</button>
		<p class="note formula-link">
			The method in full, with the identities it rests on: <a href="/tools/karnaugh/method/">Method sheet</a>.
		</p>
	</section>
</article>

<style>
	.lead {
		font-size: 1.05rem;
		color: var(--textDim);
		margin-bottom: 1.8rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1.1rem;
	}

	.grid.lists {
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		margin-top: 1rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.modeSwitch {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 1.2rem;
		flex-wrap: wrap;
	}

	.modeSwitch button {
		flex: 1;
		min-width: 200px;
		padding: 0.6rem 1rem;
		border-radius: var(--radiusSmall);
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--textDim);
		font-weight: 500;
		cursor: pointer;
		transition: 0.3s;
	}

	.modeSwitch button:hover {
		border-color: var(--lineStrong);
	}

	.modeSwitch button.active {
		background: var(--blue);
		border-color: var(--blue);
		color: white;
	}

	.mapRow {
		display: grid;
		grid-template-columns: minmax(260px, 440px) 1fr;
		gap: 1.4rem;
		align-items: start;
	}

	@media (max-width: 720px) {
		.mapRow {
			grid-template-columns: 1fr;
		}
	}

	.groups {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.groups li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.groups code {
		font-family: var(--mono);
		font-size: 0.95rem;
		color: var(--text);
	}

	.chip {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 4px;
		flex: none;
	}

	.dim {
		color: var(--textDim);
		font-size: 0.85rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin: 0.8rem 0;
		font-size: 0.9rem;
	}

	table td {
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--line);
	}

	table td:first-child {
		color: var(--textDim);
	}

	table td:last-child {
		font-family: var(--mono);
		text-align: right;
	}

	.formula-link {
		margin-top: 0.6rem;
	}
</style>
