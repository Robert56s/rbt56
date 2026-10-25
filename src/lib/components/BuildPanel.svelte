<script>
	// "Build your own active filter": the page's current spec designed by
	// hand with the table method (src/lib/filter/handDesign.js), one step
	// at a time. Each step explains itself, takes the numbers the reader
	// works out on paper and checks them, gives two hints and the solution
	// on request, and a Python snippet with the reader's numbers where the
	// arithmetic is long. The realized stages are the automatic tool's own
	// shape, so the Bode plot, the drawings and the LTspice file are the
	// page's. Progress is kept in this browser per spec (and per response);
	// the panel works the same without storage.

	import { untrack } from 'svelte';
	import BodePlot from './BodePlot.svelte';
	import CircuitDiagram from './CircuitDiagram.svelte';
	import Equation from './Equation.svelte';
	import * as hd from '$lib/filter/handDesign';
	import { generateSchematic } from '$lib/filter/spice';
	import { SERIES, seriesValues } from '$lib/filter/eseries';
	import { formatFarads, formatHz } from '$lib/filter/format';

	let {
		filterType,
		fp,
		fs,
		fl,
		fh,
		fsl,
		fsh,
		amaxDb,
		aminDb,
		amaxAtFl = null,
		amaxAtFh = null,
		aminAtFsl = null,
		aminAtFsh = null,
		pageResponse = 'butterworth',
		componentOpts = { resistorSeries: 'E24', capacitors: null, pairs: false },
		stockPhrase = 'the E24 series',
		spiceOpamp = 'ideal'
	} = $props();

	const spec = $derived(hd.handSpec({ filterType, fp, fs, fl, fh, fsl, fsh, amaxDb, aminDb, amaxAtFl, amaxAtFh, aminAtFsl, aminAtFsh }));
	const key = $derived(hd.storageKey(spec));

	/* ------------------------------------------------- the reader's work */

	const RESPONSE_KEYS = ['butterworth', 'chebyshev'];
	const freshWork = () => ({ v: {}, hint: {}, shown: {}, tried: {}, passed: {}, row: null, kinds: {}, topo: {}, gain: null });
	const freshStore = (response) => ({ response, butterworth: freshWork(), chebyshev: freshWork() });
	const startResponse = () => (pageResponse === 'chebyshev' ? 'chebyshev' : 'butterworth');

	let store = $state(freshStore('butterworth'));
	let loadedKey = $state(null);
	// 'restart' or 'back' after the spec above changed, null otherwise
	let specNote = $state(null);
	// the work "Start this response over" cleared, until the reader types again
	let undo = $state(null);

	const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
	/** A stored record read back only if it has the shape this panel writes. */
	function sanitize(saved) {
		if (!isPlain(saved) || !RESPONSE_KEYS.includes(saved.response)) return null;
		const out = freshStore(saved.response);
		for (const r of RESPONSE_KEYS) {
			const s = saved[r];
			if (!isPlain(s)) continue;
			for (const k of ['v', 'hint', 'shown', 'tried', 'passed', 'kinds', 'topo']) if (isPlain(s[k])) out[r][k] = s[k];
			if (Number.isInteger(s.row)) out[r].row = s.row;
			if (typeof s.gain === 'string') out[r].gain = s.gain;
		}
		return out;
	}
	const hasProgress = (st) => RESPONSE_KEYS.some((r) => Object.values(st[r].v).some((x) => String(x).trim() !== '') || Object.keys(st[r].shown).length > 0);
	/** Anything the reader did, a response picked included: a record without it is not stored. */
	const worthKeeping = (st) =>
		st.response !== startResponse() ||
		RESPONSE_KEYS.some((r) => {
			const x = st[r];
			return Object.values(x.v).some((y) => String(y).trim() !== '') || x.row !== null || x.gain !== null || ['hint', 'shown', 'tried', 'kinds', 'topo'].some((k) => Object.keys(x[k]).length > 0);
		});
	// the same records for this page's life, so that going back to a spec
	// brings its work back even where the browser keeps nothing
	const memory = new Map();

	// A new spec loads its own work (or starts afresh), and says so when
	// the old one had some. Switching the filter type passes through a spec
	// or two on the way (the page resets the edges after the type): the note
	// holds across those, and goes when the reader types again.
	$effect(() => {
		const k = key;
		if (k === loadedKey) return;
		untrack(() => {
			const first = loadedKey === null;
			const had = !first && hasProgress(store);
			let saved = null;
			try {
				const raw = localStorage.getItem(k) ?? memory.get(k);
				saved = raw ? JSON.parse(raw) : null;
			} catch {
				try {
					saved = memory.has(k) ? JSON.parse(memory.get(k)) : null;
				} catch {
					saved = null;
				}
			}
			const next = sanitize(saved) ?? freshStore(startResponse());
			const back = hasProgress(next);
			if (first) specNote = null;
			else if (had || specNote) specNote = back ? 'back' : 'restart';
			store = next;
			loadedKey = k;
			undo = null;
		});
	});

	$effect(() => {
		const text = JSON.stringify(store);
		const k = loadedKey;
		if (!k) return;
		const keep = untrack(() => worthKeeping(store));
		if (keep) memory.set(k, text);
		else memory.delete(k);
		try {
			if (keep) localStorage.setItem(k, text);
			else localStorage.removeItem(k);
		} catch {
			// blocked storage: the work lives in memory as long as the page
		}
	});

	const w = $derived(store[store.response]);
	const work = () => store[store.response];
	const val = (id) => w.v[id] ?? '';
	// the steps with a Check that opens the next one
	const GATED = ['s1', 's2', 's4', 's5'];
	function setVal(id, x) {
		work().v[id] = x;
		specNote = null;
		undo = null;
		// once checked, a step passes as soon as its numbers are right, so the
		// "Right" under it and the next step open together
		const step = id.split('.')[0];
		if (GATED.includes(step) && work().tried[step]) check(step);
	}
	/** The typed values under a prefix, keyed by the rest of their id. */
	function under(prefix) {
		const out = {};
		for (const [k, x] of Object.entries(w.v)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = x;
		return out;
	}

	const kindsList = $derived(Array.from({ length: 16 }, (_, i) => w.kinds[i]));
	const ctx = $derived(spec.valid ? hd.solveAll(spec, store.response, { kinds: kindsList }) : null);

	/* ------------------------------------------------------------ checks */

	const res = $derived.by(() => {
		if (!ctx) return {};
		const v1 = under('s1.');
		const r = { s1: hd.checkSpec(ctx, v1), s2: hd.checkOrder(ctx, under('s2.'), { v1 }) };
		if (ctx.s3) {
			r.s3 = hd.checkTable(ctx, w.row);
			const v4 = under('s4.');
			r.s4 = hd.checkDenorm(ctx, v4, hd.factorRows(ctx.s4, v4), { v1 });
			r.s5 = hd.checkStages(ctx, under('s5.'), { v1, v4 });
		}
		return r;
	});

	function leaves(x, out = []) {
		if (!x || typeof x !== 'object') return out;
		if ('state' in x && 'message' in x) {
			out.push(x);
			return out;
		}
		for (const y of Object.values(x)) leaves(y, out);
		return out;
	}
	const stepOk = (id) => {
		const l = leaves(res[id]);
		return l.length > 0 && l.every((j) => j.state === 'ok');
	};
	const done = (id) => !!(w.passed[id] || w.shown[id]);

	function check(id, ok = () => stepOk(id)) {
		work().tried[id] = true;
		if (ok()) work().passed[id] = true;
	}
	function nextHint(id) {
		work().hint[id] = Math.min(2, (work().hint[id] ?? 0) + 1);
	}
	function reveal(id) {
		work().shown[id] = true;
	}
	/** Step 3 asks for the row alone: the right one passes the step and shows Hn(s). */
	function pickRow(n) {
		work().row = n;
		if (ctx?.s2 && n === ctx.s2.n) work().passed.s3 = true;
	}
	function pickResponse(r) {
		store.response = r;
	}
	function restart() {
		undo = { response: store.response, work: $state.snapshot(store[store.response]) };
		store[store.response] = freshWork();
	}
	function undoRestart() {
		if (!undo) return;
		store[undo.response] = undo.work;
		store.response = undo.response;
		undo = null;
	}

	// how far the walk is open: a step opens once the one before is right or shown
	const reach = $derived.by(() => {
		if (!ctx) return 0;
		if (ctx.s1.blocked || !done('s1')) return 1;
		if (ctx.stop || !done('s2')) return 2;
		if (!done('s3')) return 3;
		if (!done('s4')) return 4;
		if (!done('s5')) return 5;
		return 6;
	});

	/* ------------------------------------------------------------- texts */

	const t1 = $derived(ctx ? hd.specTexts(ctx) : null);
	const t2 = $derived(ctx ? hd.orderTexts(ctx) : null);
	const t3 = $derived(ctx?.s3 ? hd.tableTexts(ctx) : null);
	const t4 = $derived(ctx?.s3 ? hd.denormTexts(ctx) : null);
	const t5 = $derived(ctx?.s3 ? hd.stagesTexts(ctx) : null);
	const tK = $derived(ctx?.s3 ? hd.gainTexts(ctx) : null);
	// one division for a low-pass or a high-pass: Python only for a band's longer arithmetic
	const py1 = $derived(ctx && spec.band ? hd.pythonSpec(ctx) : '');
	const py2 = $derived(ctx ? hd.pythonOrder(ctx) : '');
	const py4 = $derived(ctx?.s3 ? hd.pythonDenorm(ctx) : '');
	const py5 = $derived(ctx?.s3 ? hd.pythonStages(ctx) : '');
	const table = hd.denormTable();
	const band = $derived(filterType === 'bandpass' || filterType === 'bandstop');

	/* ------------------------------------------------------- the circuits */

	const stageCards = $derived.by(() => {
		if (!ctx?.s5 || filterType === 'bandstop') return [];
		return ctx.s5.stages.map((st, i) => {
			const choices = hd.topologyChoices(st);
			const topo = choices.includes(w.topo[i]) ? w.topo[i] : choices[0];
			const t = hd.TOPOLOGIES[topo];
			const prefix = `s6.${i}.${topo}.`;
			const typed = under(prefix);
			const caps = {};
			for (const nm of t.caps) {
				const x = hd.parseValue(typed[nm]);
				if (Number.isFinite(x) && x > 0) caps[nm] = x;
			}
			const capsReady = t.caps.every((nm) => caps[nm] !== undefined);
			const suggested = capsReady ? null : hd.suggestCaps(topo, st, componentOpts);
			const solveCaps = capsReady ? caps : suggested;
			const solution = solveCaps ? hd.solveParts(topo, st, solveCaps, typed) : null;
			const parts = hd.readParts(topo, typed);
			const result = parts ? hd.stageResult(topo, st, parts) : null;
			// equal resistors on a Sallen-Key whose capacitor ratio is not 4Q²: Q follows the ratio
			const ratioBound = topo === 'sallenKey' && capsReady && !!solution?.ok && solution.variant === 'equal' && solution.notes.length > 0;
			return {
				ratioBound,
				i,
				st,
				id: `s6.${i}`,
				choices,
				topo,
				t,
				prefix,
				capsReady,
				suggested,
				solveCaps,
				solution,
				parts,
				result,
				texts: hd.topologyTexts(topo, st),
				python: solveCaps ? hd.pythonComponents(topo, st, solveCaps) : ''
			};
		});
	});

	const GAIN_CIRCUITS = ['gainInv', 'gainDivider', 'gainNonInv'];
	const gainCard = $derived.by(() => {
		if (!ctx?.s5 || filterType === 'bandstop' || !ctx.s5.kindsOk) return null;
		const K = ctx.s5.K;
		const circuitDefault = hd.gainCircuitFor(K);
		if (!circuitDefault) return null;
		const circuit = GAIN_CIRCUITS.includes(w.gain) ? w.gain : circuitDefault;
		const prefix = `s6.g.${circuit}.`;
		const typed = under(prefix);
		const R1 = hd.parseValue(typed.R1);
		const solution = hd.solveGain(circuit, K, Number.isFinite(R1) && R1 > 0 ? R1 : 10000);
		const parts = hd.readParts(circuit, typed);
		return { K, circuit, prefix, solution, parts, result: parts ? hd.gainResult(circuit, K, parts) : null, texts: hd.gainStageTexts(K, ctx.s5.stages.filter((st) => st.kind === 'bandpass').length) };
	});

	const realized = $derived.by(() => {
		if (!stageCards.length) return null;
		const entries = [];
		const missing = [];
		for (const c of stageCards) {
			if (!c.parts) {
				missing.push(`stage ${c.i + 1}`);
				continue;
			}
			const theoretical = c.capsReady && c.solution?.ok ? { ...c.solveCaps, ...c.solution.parts } : null;
			entries.push({ label: `Stage ${c.i + 1}`, topology: c.topo, parts: c.parts, theoretical });
		}
		if (gainCard) {
			if (!gainCard.parts) missing.push('the gain stage');
			else entries.push({ label: 'Gain stage', topology: gainCard.circuit, parts: gainCard.parts, theoretical: gainCard.solution.ok ? gainCard.solution.parts : null });
		}
		return { entries, missing, stages: entries.map((e) => hd.realizeStage(e.topology, e.parts, e.theoretical)) };
	});

	const view = $derived.by(() => {
		if (!realized || realized.missing.length) return null;
		const stages = realized.stages;
		const v = hd.verdict(spec, stages);
		// the exact design's own losses: rounding is blamed only where it sits on a limit
		const ideal = hd.verdict(spec, hd.idealStages(ctx));
		return { stages, verdict: v, flags: hd.verdictTexts(spec, v, ideal), points: hd.bodePoints(spec, stages), frame: hd.filterFrame(spec), python: hd.pythonBode(spec, stages) };
	});

	const limitLines = $derived.by(() => {
		if (!view || !band) return null;
		const top = view.verdict.peakDb;
		const lines = [];
		if (spec.amaxLow === spec.amaxHigh) lines.push({ db: spec.amaxLow - top });
		else lines.push({ to: spec.fl, db: spec.amaxLow - top }, { from: spec.fl, to: spec.fh, db: spec.amaxLow - top, db2: spec.amaxHigh - top }, { from: spec.fh, db: spec.amaxHigh - top });
		if (spec.aminLow === spec.aminHigh) lines.push({ db: spec.aminLow - top });
		else lines.push({ to: spec.fsl, db: spec.aminLow - top }, { from: spec.fsh, db: spec.aminHigh - top });
		return lines;
	});

	const reportRows = $derived(realized && !realized.missing.length ? hd.reportRows(realized.entries) : []);
	const sensitivities = $derived(
		realized && !realized.missing.length
			? realized.entries
					.map((e) => ({ label: e.label, topology: e.topology, s: hd.sensitivityOf(e.topology, e.parts) }))
					.filter((x) => x.s)
			: []
	);

	/** A capacitor as it would be typed: 10n, 2.2n, 100p. */
	const capText = (c) => hd.partText(c, 'F', 3).replace(/\s|F$/g, '');
	// capacitor values offered while typing: the list on hand, else E12 from 10 pF to 1 uF
	const capOptions = $derived(
		(Array.isArray(componentOpts?.capacitors) && componentOpts.capacitors.length ? componentOpts.capacitors : seriesValues(SERIES.E12, -11, -7).filter((c) => c <= 1.0001e-6)).map(capText)
	);

	/* --------------------------------------------------------- utilities */

	let copied = $state('');
	async function copy(text, tag) {
		let ok = false;
		try {
			await navigator.clipboard.writeText(text);
			ok = true;
		} catch {
			const before = document.activeElement;
			try {
				const area = document.createElement('textarea');
				area.value = text;
				area.style.position = 'fixed';
				area.style.opacity = '0';
				document.body.appendChild(area);
				area.select();
				ok = document.execCommand('copy');
				area.remove();
			} catch {
				ok = false;
			}
			if (before instanceof HTMLElement) before.focus();
		}
		copied = ok ? tag : `${tag}:failed`;
		setTimeout(() => {
			if (copied.startsWith(tag)) copied = '';
		}, 1800);
	}

	function downloadAsc() {
		if (!view || !ctx) return;
		const text = generateSchematic(hd.schematicOptions(spec, ctx, view.stages, spiceOpamp));
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'filter-by-hand.asc';
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}

	/** Table cells are typeset as display maths, so fractions keep their size. */
	const DISPLAY = String.raw`\displaystyle `;
	const pct = (x) => {
		const t = hd.fixed(100 * x, 2);
		return `${t.startsWith('-') || t === '0.00' ? '' : '+'}${t} %`;
	};
	const copyLabel = (tag, label) => (copied === tag ? 'Copied' : copied === `${tag}:failed` ? 'Copy failed: select and copy' : label);
	const gradeWord = { ok: 'on target', close: 'close', bad: 'off target' };
	const flagClass = { ok: 'ok', close: 'warn', bad: 'bad' };
</script>

{#snippet blocks(list)}
	{#each list ?? [] as b, k (k)}
		{#if b.p}
			<p>{b.p}</p>
		{:else if b.eq}
			<Equation tex={b.eq} />
		{:else if b.caution}
			<p class="caution"><strong>Caution.</strong> {b.caution}</p>
		{:else if b.warn}
			<p class="flag warn">{b.warn}</p>
		{:else if b.table}
			<div class="tableScroll">
				<table class="grid-table">
					<thead>
						<tr>{#each b.table.head as h, c (c)}<th>{h}</th>{/each}</tr>
					</thead>
					<tbody>
						{#each b.table.rows as row, r (r)}
							<tr>{#each row as cell, c (c)}<td>{#if b.table.tex}<Equation tex={DISPLAY + cell} display={false} />{:else}{cell}{/if}</td>{/each}</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/each}
{/snippet}

{#snippet field(id, label, result, tried, placeholder = '')}
	<div class="field">
		<label for="byo-{id}">{label}</label>
		<input
			id="byo-{id}"
			type="text"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			{placeholder}
			value={val(id)}
			oninput={(e) => setVal(id, e.currentTarget.value)}
			class:good={tried && result?.state === 'ok'}
			class:wrong={tried && result && result.state !== 'ok'}
			aria-invalid={tried && result ? result.state !== 'ok' : undefined}
			aria-describedby={tried && result ? `byo-${id}-mark` : undefined}
		/>
		{#if tried && result}
			{#if result.state === 'ok'}
				<span class="mark ok" id="byo-{id}-mark">Right.</span>
			{:else}
				<span class="mark bad" id="byo-{id}-mark">{result.message}</span>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet controls(id, texts, okNow, okText = 'Right: on to the next step.')}
	<div class="controls">
		<button type="button" class="small" onclick={() => check(id)}>Check</button>
		<button type="button" class="ghost small" onclick={() => nextHint(id)} disabled={(w.hint[id] ?? 0) >= 2}>{(w.hint[id] ?? 0) === 0 ? 'Hint 1' : 'Hint 2'}</button>
		<button type="button" class="ghost small" onclick={() => reveal(id)} disabled={w.shown[id]}>Show the solution</button>
	</div>
	<div aria-live="polite">
		{#if w.tried[id]}
			{#if okNow}
				<p class="flag ok">{okText}</p>
			{:else}
				<p class="flag warn">Not yet: see the notes under the fields.</p>
			{/if}
		{/if}
	</div>
	{#if (w.hint[id] ?? 0) >= 1}
		<div class="hint-box">
			<p class="tag">Hint 1</p>
			{@render blocks(texts.hint1)}
		</div>
	{/if}
	{#if (w.hint[id] ?? 0) >= 2}
		<div class="hint-box">
			<p class="tag">Hint 2</p>
			{@render blocks(texts.hint2)}
		</div>
	{/if}
	{#if w.shown[id] && texts.solution}
		<div class="hint-box solution">
			<p class="tag">Solution</p>
			{@render blocks(texts.solution)}
		</div>
	{/if}
{/snippet}

{#snippet python(id, code)}
	{#if code}
		<details class="py">
			<summary>Python for this step</summary>
			<div class="py-body">
				<button type="button" class="ghost small copy" onclick={() => copy(code, id)}>{copyLabel(id, 'Copy')}</button>
				<pre><code>{code}</code></pre>
			</div>
		</details>
	{/if}
{/snippet}

<section class="panel build">
	<div class="panel-head">
		<span class="num">by hand</span>
		<h2>Build your own active filter</h2>
		<span class="hint">about an hour, paper and a calculator</span>
	</div>
	<details class="intro">
		<summary>Design this spec by hand with the table method, step by step, every number checked</summary>
		<div class="content">
			{#if !spec.valid}
				<p class="flag warn">Fix the spec above first: the steps start from it.</p>
			{:else if ctx}
				<p>
					The automatic design above does all of this at once. Here the same spec is worked out by hand, the
					classical way: the order from a formula, the normalized transfer function from a table, denormalization,
					one stage per factor, then the parts of each stage. Type each number to check it; the hints teach the
					step, and the solution stays hidden until asked for. Work typed here is kept in this browser for this
					spec: the page opens on its default spec, and typing the same spec again brings the work back.
				</p>
				{#if specNote === 'restart'}
					<p class="flag warn">The spec above changed, so the steps start over for the new spec. Going back to the old spec brings its work back.</p>
				{:else if specNote === 'back'}
					<p class="flag warn">The spec above changed: here is the work saved for this spec.</p>
				{/if}

				<!-- step 1 ------------------------------------------------------------------ -->
				<div class="step">
					<h3><span class="step-num">1</span> The spec, and the response</h3>
					<div class="choice" role="group" aria-label="Response">
						{#each RESPONSE_KEYS as r (r)}
							<button type="button" class="ghost small" class:on={store.response === r} aria-pressed={store.response === r} onclick={() => pickResponse(r)}>{hd.RESPONSE_LABEL[r]}</button>
						{/each}
						{#if undo && undo.response === store.response}
							<button type="button" class="ghost small restart" onclick={undoRestart}>Undo: bring the work back</button>
						{:else}
							<button type="button" class="ghost small restart" onclick={restart}>Start this response over</button>
						{/if}
					</div>
					{#if undo && undo.response === store.response}
						<p class="note" aria-live="polite">The work on {hd.RESPONSE_LABEL[undo.response]} is cleared. Undo brings it back, until something is typed.</p>
					{/if}
					{@render blocks(t1.intro)}
					{#if !ctx.s1.blocked}
						<div class="tableScroll">
							<table class="grid-table denorm">
								<thead>
									<tr>{#each table.head as h, c (c)}<th class:here={table.keys[c - 1] === filterType}>{h}</th>{/each}</tr>
								</thead>
								<tbody>
									{#each table.rows.slice(0, 3) as row, r (r)}
										<tr>
											{#each row as cell, c (c)}
												<td class:here={table.keys[c - 1] === filterType}>{#if cell}<Equation tex={DISPLAY + cell} display={false} />{/if}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<div class="inputs">
							{#if band}
								{#if ctx.s1.sym.moved}
									{@render field('s1.edge', `${ctx.s1.sym.moved}' (Hz), the moved edge`, res.s1?.edge, w.tried.s1)}
								{/if}
								{@render field('s1.wc', 'ωc (rad/s)', res.s1?.wc, w.tried.s1)}
								{@render field('s1.B', 'B (rad/s)', res.s1?.B, w.tried.s1)}
							{/if}
							{@render field('s1.k', 'k', res.s1?.k, w.tried.s1)}
						</div>
						{@render controls('s1', t1, stepOk('s1'))}
						{@render python('py1', py1)}
					{/if}
				</div>

				<!-- step 2 ------------------------------------------------------------------ -->
				{#if reach >= 2}
					<div class="step">
						<h3><span class="step-num">2</span> The order</h3>
						{@render blocks(t2.intro)}
						<div class="inputs">
							{@render field('s2.value', 'Value of the formula', res.s2?.value, w.tried.s2)}
							{@render field('s2.n', 'Order n', res.s2?.n, w.tried.s2)}
						</div>
						{@render controls('s2', t2, stepOk('s2'), ctx.stop === 'order' ? 'Right, but the walk stops here:' : undefined)}
						{#if ctx.stop === 'order' && done('s2')}
							{#each hd.beyondText(ctx) as b, k (k)}<p class="flag warn">{b.p}</p>{/each}
						{/if}
						{@render python('py2', py2)}
					</div>
				{/if}

				<!-- step 3 ------------------------------------------------------------------ -->
				{#if reach >= 3 && ctx.s3}
					<div class="step">
						<h3><span class="step-num">3</span> <span>The normalized transfer function H<sub>n</sub>(s)</span></h3>
						{@render blocks(t3.intro)}
						<div class="tableScroll">
							<table class="grid-table poly">
								<thead>
									<tr><th>n</th><th>Denominator of H<sub>n</sub>(s), {hd.RESPONSE_LABEL[store.response]}</th></tr>
								</thead>
								<tbody>
									{#each hd.tableFor(store.response) as row (row.n)}
										<tr class:picked={w.row === row.n} class:right={w.row === row.n && row.n === ctx.s2.n}>
											<td>
												<button type="button" class="ghost small" aria-pressed={w.row === row.n} onclick={() => pickRow(row.n)}>n = {row.n}</button>
											</td>
											<td><Equation tex={row.tex} display={false} /></td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{#if w.row !== null && res.s3?.row.state !== 'ok'}
							<p class="flag warn">{res.s3.row.message}</p>
						{:else if w.row === ctx.s2.n}
							<p class="flag ok">Right: the row of order {ctx.s2.n}, so</p>
							{@render blocks(t3.after)}
						{/if}
					</div>
				{/if}

				<!-- step 4 ------------------------------------------------------------------ -->
				{#if reach >= 4 && ctx.s4}
					<div class="step">
						<h3><span class="step-num">4</span> Denormalization</h3>
						<div class="tableScroll">
							<table class="grid-table denorm">
								<thead>
									<tr>{#each table.head as h, c (c)}<th class:here={table.keys[c - 1] === filterType}>{h}</th>{/each}</tr>
								</thead>
								<tbody>
									<tr>
										{#each table.rows[3] as cell, c (c)}
											<td class:here={table.keys[c - 1] === filterType}><Equation tex={DISPLAY + cell} display={false} /></td>
										{/each}
									</tr>
								</tbody>
							</table>
						</div>
						{@render blocks(t4.intro)}
						<div class="inputs">
							{@render field('s4.w', band ? 'Bd (rad/s), B scaled if Butterworth' : 'ωc (rad/s), scaled if Butterworth', res.s4?.w, w.tried.s4)}
							{@render field('s4.num', 'Numerator coefficient of Hd(s)', res.s4?.num, w.tried.s4)}
						</div>
						<p class="sub">The {ctx.s4.factors.length} factor{ctx.s4.factors.length === 1 ? '' : 's'} of the denominator{ctx.s4.factors.length > 1 ? ', in any order' : ''}:</p>
						{#each ctx.s4.factors as f, i (i)}
							{@const from = ctx.s3.factors[f.from]}
							<div class="factor-row">
								<span class="factor-label">
									{#if band}
										Factor {i + 1}
									{:else}
										from <Equation tex={hd.tableFactorTex(from)} display={false} />
									{/if}
								</span>
								{#if f.kind === 'real'}
									{@render field(`s4.f${i}.p`, 'p in s + p', res.s4?.factors[i]?.p, w.tried.s4)}
								{:else}
									{@render field(`s4.f${i}.a`, 'a in s² + a s + b', res.s4?.factors[i]?.a, w.tried.s4)}
									{@render field(`s4.f${i}.b`, 'b', res.s4?.factors[i]?.b, w.tried.s4)}
								{/if}
							</div>
						{/each}
						{@render controls('s4', t4, stepOk('s4'))}
						{@render python('py4', py4)}
					</div>
				{/if}

				<!-- step 5 ------------------------------------------------------------------ -->
				{#if reach >= 5 && ctx.s5}
					<div class="step">
						<h3><span class="step-num">5</span> One stage per factor, and the gain</h3>
						{@render blocks(t5.intro)}
						{#each ctx.s5.stages as st, i (i)}
							<div class="stage-row">
								<div class="stage-head">
									<strong>Stage {i + 1}</strong>
									{#if filterType === 'bandpass'}
										<select aria-label="Kind of stage {i + 1}" value={st.kind} onchange={(e) => (work().kinds[i] = e.currentTarget.value)}>
											{#each hd.BAND_KINDS as k (k)}<option value={k}>{k === 'bandpass' ? 'band-pass' : k === 'lowpass' ? 'low-pass' : 'high-pass'}</option>{/each}
										</select>
									{:else}
										<span class="kind">{hd.stageKindWord(st)}</span>
									{/if}
								</div>
								<Equation tex={hd.stageTex(st)} />
								<div class="inputs">
									{#if st.order === 1}
										{@render field(`s5.${i}.p`, 'Corner p (rad/s), or in Hz', res.s5?.stages[i]?.p, w.tried.s5)}
									{:else}
										{@render field(`s5.${i}.wn`, 'ωn (rad/s) or f0 (Hz)', res.s5?.stages[i]?.wn, w.tried.s5)}
										{@render field(`s5.${i}.q`, 'Q', res.s5?.stages[i]?.q, w.tried.s5)}
									{/if}
								</div>
							</div>
						{/each}
						{#if !ctx.s5.kindsOk}
							<p class="flag bad">These stages bring s{hd.sup(ctx.s5.power)} on top, and Hd(s) has s{hd.sup(ctx.s5.need)}: change a kind (a band-pass stage brings one s, a high-pass stage two, a low-pass stage none).</p>
						{/if}
						<div class="inputs">
							{@render field('s5.K', 'Gain K of the gain stage', res.s5?.K, w.tried.s5)}
						</div>
						{@render controls('s5', { ...t5, hint1: [...t5.hint1, ...tK.hint1], hint2: [...t5.hint2, ...tK.hint2] }, stepOk('s5'))}
						{@render python('py5', py5)}
					</div>
				{/if}

				<!-- step 6 ------------------------------------------------------------------ -->
				{#if reach >= 6 && ctx.s5}
					<div class="step">
						<h3><span class="step-num">6</span> The circuit of each stage</h3>
						{#if filterType === 'bandstop'}
							{@render blocks(hd.notchStopTexts())}
						{:else}
							<p>
								Each stage now gets a circuit. Pick the capacitors first, from the stock ({stockPhrase}), then
								solve the circuit's equations for the resistors and type the values to be built. The check computes
								what those parts give, with the general formulas, so unequal parts are fine.
							</p>
							<datalist id="byo-caps">
								{#each capOptions as c (c)}<option value={c}></option>{/each}
							</datalist>
							{#each stageCards as c (c.i)}
								<div class="stage-card">
									<div class="stage-head">
										<strong>Stage {c.i + 1}</strong>
										<span class="kind">{hd.stageKindWord(c.st)}, {c.st.order === 1 ? `p = ${hd.fmt(c.st.p, 5)} rad/s (${formatHz(c.st.p / (2 * Math.PI))})` : `ωn = ${hd.fmt(c.st.wn, 5)} rad/s (${formatHz(c.st.wn / (2 * Math.PI))}), Q = ${hd.fmt(c.st.q, 4)}`}</span>
										{#if c.choices.length > 1}
											<select aria-label="Circuit of stage {c.i + 1}" value={c.topo} onchange={(e) => (work().topo[c.i] = e.currentTarget.value)}>
												{#each c.choices as k (k)}<option value={k}>{hd.TOPOLOGIES[k].label}</option>{/each}
											</select>
										{:else}
											<span class="kind">{c.t.label}</span>
										{/if}
									</div>
									{@render blocks(c.texts.form)}
									<p class="sub">Matched to the stage:</p>
									{@render blocks(c.texts.design)}
									{#if c.st.order === 1}<p class="note">{hd.FOLLOWER_NOTE}</p>{/if}
									<div class="inputs parts">
										{#each c.t.caps as nm (nm)}
											<div class="field">
												<label for="byo-{c.prefix}{nm}">{nm} (F)</label>
												<input id="byo-{c.prefix}{nm}" type="text" list="byo-caps" autocomplete="off" spellcheck="false" placeholder={c.suggested ? capText(c.suggested[nm]) : ''} value={val(c.prefix + nm)} oninput={(e) => setVal(c.prefix + nm, e.currentTarget.value)} />
											</div>
										{/each}
										{#each c.t.resistors as nm (nm)}
											<div class="field">
												<label for="byo-{c.prefix}{nm}">{nm} (Ω)</label>
												<input id="byo-{c.prefix}{nm}" type="text" autocomplete="off" spellcheck="false" value={val(c.prefix + nm)} oninput={(e) => setVal(c.prefix + nm, e.currentTarget.value)} />
											</div>
										{/each}
									</div>
									{#if c.solution && !c.solution.ok && c.capsReady}
										<p class="flag bad">{c.solution.text}</p>
									{/if}
									<div class="controls">
										<button type="button" class="small" onclick={() => check(c.id, () => !!c.result && hd.grade(c.result.worst) !== 'bad')}>Check</button>
										<button type="button" class="ghost small" onclick={() => nextHint(c.id)} disabled={(w.hint[c.id] ?? 0) >= 2}>{(w.hint[c.id] ?? 0) === 0 ? 'Hint 1' : 'Hint 2'}</button>
										<button type="button" class="ghost small" onclick={() => reveal(c.id)} disabled={w.shown[c.id]}>Show the solution</button>
									</div>
									<div aria-live="polite">
										{#if w.tried[c.id]}
											{#if !c.result}
												<p class="flag warn">Type every part first: {c.t.caps.concat(c.t.resistors).join(', ')}.</p>
											{:else}
												{@const g = hd.grade(c.result.worst)}
												<p class="flag {flagClass[g]}">
													{gradeWord[g][0].toUpperCase() + gradeWord[g].slice(1)}:
													{#if c.st.order === 1}
														corner {hd.fmt(1 / c.result.actual.tau, 5)} rad/s, {pct(c.result.errors.corner)}.
													{:else}
														ωn {hd.fmt(c.result.actual.wn, 5)} rad/s ({pct(c.result.errors.wn)}), Q {hd.fmt(c.result.actual.q, 4)} ({pct(c.result.errors.q)}), gain {hd.fmt(c.result.actual.gain, 4)} ({pct(c.result.errors.gain)} in size){c.result.actual.gain < 0 ? ', inverting' : ''}.
													{/if}
													{g === 'ok' ? 'Within what rounding to stock gives.' : c.ratioBound ? 'With equal resistors the capacitor ratio sets Q: see the note below.' : g === 'close' ? 'A closer part would help: the biggest error leads.' : 'The biggest error says which equation to look at again.'}
												</p>
												{#each c.solution?.ok ? c.solution.notes : [] as note, k (k)}<p class="flag warn">{note}</p>{/each}
											{/if}
										{/if}
									</div>
									{#if (w.hint[c.id] ?? 0) >= 1}
										<div class="hint-box"><p class="tag">Hint 1</p>{@render blocks(c.texts.hint1)}</div>
									{/if}
									{#if (w.hint[c.id] ?? 0) >= 2}
										<div class="hint-box"><p class="tag">Hint 2</p>{@render blocks(c.texts.hint2)}</div>
									{/if}
									{#if w.shown[c.id]}
										<div class="hint-box solution">
											<p class="tag">Solution</p>
											{#if !c.solveCaps}
												<p>No capacitor from the stock suits this stage: type capacitors above, and the solution here follows them.</p>
											{:else if !c.solution.ok}
												<p>{c.solution.text}</p>
											{:else}
												<p>
													{c.capsReady ? 'With the capacitors typed' : 'With capacitors picked from the stock'}
													({c.t.caps.map((nm) => `${nm} = ${formatFarads(c.solveCaps[nm])}`).join(', ')}), the exact {c.t.resistors.length > 1 ? 'resistors are' : 'resistor is'}
													{c.t.resistors.map((nm) => `${nm} = ${hd.partText(c.solution.parts[nm], 'Ω', 5)}`).join(', ')}{c.solution.other ? `; the other root gives ${c.t.resistors.map((nm) => `${nm} = ${hd.partText(c.solution.other[nm], 'Ω', 5)}`).join(', ')}` : ''}.
													Round each to the stock, then check.
												</p>
												{#each c.solution.notes as note, k (k)}<p class="note">{note}</p>{/each}
											{/if}
										</div>
									{/if}
									{@render python(`py6.${c.i}`, c.python)}
									{#if c.parts}
										<div class="diagram">
											<CircuitDiagram design={hd.realizeStage(c.topo, c.parts)} />
										</div>
									{/if}
								</div>
							{/each}

							{#if gainCard}
								<div class="stage-card">
									<div class="stage-head">
										<strong>Gain stage</strong>
										<span class="kind">K = {hd.fmt(gainCard.K, 5)}</span>
										<select aria-label="Gain circuit" value={gainCard.circuit} onchange={(e) => (work().gain = e.currentTarget.value)}>
											{#each GAIN_CIRCUITS as k (k)}<option value={k}>{hd.TOPOLOGIES[k].label}</option>{/each}
										</select>
									</div>
									{@render blocks(gainCard.texts.form)}
									<div class="inputs parts">
										{#each ['R1', 'R2'] as nm (nm)}
											<div class="field">
												<label for="byo-{gainCard.prefix}{nm}">{nm} (Ω)</label>
												<input id="byo-{gainCard.prefix}{nm}" type="text" autocomplete="off" spellcheck="false" value={val(gainCard.prefix + nm)} oninput={(e) => setVal(gainCard.prefix + nm, e.currentTarget.value)} />
											</div>
										{/each}
									</div>
									{#if !gainCard.solution.ok}
										<p class="flag bad">{gainCard.solution.text}</p>
									{/if}
									<div class="controls">
										<button type="button" class="small" onclick={() => check('s6.g', () => !!gainCard.result && hd.grade(gainCard.result.worst) !== 'bad')}>Check</button>
										<button type="button" class="ghost small" onclick={() => nextHint('s6.g')} disabled={(w.hint['s6.g'] ?? 0) >= 2}>{(w.hint['s6.g'] ?? 0) === 0 ? 'Hint 1' : 'Hint 2'}</button>
										<button type="button" class="ghost small" onclick={() => reveal('s6.g')} disabled={w.shown['s6.g']}>Show the solution</button>
									</div>
									<div aria-live="polite">
										{#if w.tried['s6.g']}
											{#if !gainCard.result}
												<p class="flag warn">Type R1 and R2 first.</p>
											{:else}
												{@const g = hd.grade(gainCard.result.worst)}
												<p class="flag {flagClass[g]}">{gradeWord[g][0].toUpperCase() + gradeWord[g].slice(1)}: gain {hd.fmt(gainCard.result.actual.gain, 5)}, {pct(gainCard.result.errors.gain)} in size against K = {hd.fmt(gainCard.K, 5)}.</p>
											{/if}
										{/if}
									</div>
									{#if (w.hint['s6.g'] ?? 0) >= 1}
										<div class="hint-box"><p class="tag">Hint 1</p>{@render blocks(gainCard.texts.hint1)}</div>
									{/if}
									{#if (w.hint['s6.g'] ?? 0) >= 2}
										<div class="hint-box"><p class="tag">Hint 2</p>{@render blocks(gainCard.texts.hint2)}</div>
									{/if}
									{#if w.shown['s6.g'] && gainCard.solution.ok}
										<div class="hint-box solution">
											<p class="tag">Solution</p>
											<p>With R1 = {hd.partText(gainCard.solution.parts.R1, 'Ω', 5)}, R2 = {hd.partText(gainCard.solution.parts.R2, 'Ω', 5)}; round R2 to the stock.</p>
										</div>
									{/if}
									{#if gainCard.parts}
										<div class="diagram">
											<CircuitDiagram design={hd.realizeStage(gainCard.circuit, gainCard.parts)} />
										</div>
									{/if}
								</div>
							{/if}
						{/if}
					</div>

					<!-- step 7 ------------------------------------------------------------------ -->
					{#if filterType !== 'bandstop'}
						<div class="step">
							<h3><span class="step-num">7</span> The whole filter</h3>
							{#if !view}
								<p class="note">Type the parts of {realized?.missing.join(', ') || 'every stage'} in step 6 to see the whole filter here.</p>
							{:else}
								<p>The response of the stages typed above, in cascade, against the spec of the page: the amber lines are the limits, measured from the top of the passband.</p>
								<BodePlot points={view.points} passbandFreqs={view.frame.pass} stopbandFreqs={view.frame.stop} amaxDb={spec.amaxDb - view.verdict.peakDb} aminDb={spec.aminDb - view.verdict.peakDb} limits={limitLines} />
								{#each view.flags as f, k (k)}
									<p class={f.cls === 'note' ? 'note' : `flag ${f.cls}`}>{f.text}</p>
								{/each}
								<div class="controls">
									<button type="button" class="small" onclick={downloadAsc}>Download the LTspice schematic (.asc)</button>
								</div>
								<p class="note">The file holds these stages as typed, with the op-amp chosen for the LTspice file further down the page.</p>
								{@render python('py7', view.python)}
							{/if}
						</div>

						<!-- step 8 ------------------------------------------------------------------ -->
						{#if view}
							<div class="step">
								<h3><span class="step-num">8</span> Report</h3>
								<p>Each part: the exact value the equations give for the capacitors chosen, the part typed, and the gap between them.</p>
								<div class="tableScroll">
									<table class="grid-table report">
										<thead>
											<tr>{#each hd.REPORT_COLUMNS as h (h)}<th>{h}</th>{/each}</tr>
										</thead>
										<tbody>
											{#each reportRows as r (r.part)}
												<tr>{#each hd.reportRowCells(r) as cell, c (c)}<td>{cell}</td>{/each}</tr>
											{/each}
										</tbody>
									</table>
								</div>
								<div class="controls">
									<button type="button" class="ghost small" onclick={() => copy(hd.reportTsv(reportRows), 'tsv')}>{copyLabel('tsv', 'Copy as a table')}</button>
									<button type="button" class="ghost small" onclick={() => copy(hd.reportMarkdown(reportRows), 'md')}>{copyLabel('md', 'Copy as Markdown')}</button>
								</div>
								<p class="note">"Copy as a table" pastes into a word processor or a spreadsheet as a table.</p>
								{#if sensitivities.length}
									<details class="py">
										<summary>Sensitivity of Q to each part</summary>
										<div class="py-body">
											{@render blocks(hd.sensitivityTexts())}
											<div class="tableScroll">
												<table class="grid-table">
													<thead><tr><th>Stage</th><th>Part</th><th>S<sup>Q</sup></th><th>Q moves for 5 % on the part</th></tr></thead>
													<tbody>
														{#each sensitivities as s (s.label)}
															{#each Object.entries(s.s) as [part, value] (part)}
																<tr><td>{s.label}</td><td>{part}</td><td>{value.toFixed(3)}</td><td>{(5 * value).toFixed(2)} %</td></tr>
															{/each}
														{/each}
													</tbody>
												</table>
											</div>
										</div>
									</details>
								{/if}
							</div>
						{/if}
					{/if}
				{/if}
			{/if}
		</div>
	</details>
</section>

<style>
	.build {
		background: color-mix(in srgb, var(--surface) 94%, var(--green) 6%);
	}

	.build .num {
		color: var(--green);
		background: color-mix(in srgb, var(--surface) 80%, var(--green) 20%);
	}

	summary {
		cursor: pointer;
		font-family: var(--mono);
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--blue);
		user-select: none;
		width: fit-content;
		max-width: 100%;
	}

	summary:hover {
		color: var(--blueLight);
	}

	.content {
		margin-top: 0.9rem;
		display: grid;
		gap: 0.55rem;
		min-width: 0;
	}

	.content p,
	.step p {
		font-size: 0.92rem;
		line-height: 1.55;
		max-width: 78ch;
		margin-bottom: 0;
	}

	.step {
		border-top: 1px solid var(--line);
		padding-top: 1rem;
		margin-top: 0.6rem;
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}

	.step h3 {
		font-size: 1rem;
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.step-num {
		display: inline-grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 999px;
		background: var(--blue);
		color: #fff;
		font-size: 0.8rem;
		flex: none;
	}

	.choice {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.choice button.on {
		background: var(--blue);
		color: #fff;
		border-color: var(--blue);
	}

	.choice .restart {
		margin-left: auto;
	}

	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 0.7rem 1rem;
		align-items: start;
	}

	.inputs .field {
		margin-bottom: 0;
		min-width: 0;
	}

	.inputs input {
		font-family: var(--mono);
	}

	input.good {
		border-color: var(--green);
	}

	input.wrong {
		border-color: var(--amber);
	}

	.mark {
		display: block;
		font-size: 0.8rem;
		margin-top: 0.3rem;
		line-height: 1.4;
	}

	.mark.ok {
		color: var(--green);
	}

	.mark.bad {
		color: var(--amber);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	/* the site's ghost buttons keep their look when disabled: these must not */
	button.ghost:disabled {
		background: var(--surfaceHover);
		color: var(--textFaint);
		border-color: var(--line);
	}

	.flag {
		margin-top: 0;
	}

	.caution {
		border-left: 3px solid var(--amber);
		padding-left: 0.7rem;
		color: var(--text);
	}

	.hint-box {
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		background: var(--surface);
		padding: 0.7rem 0.9rem;
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}

	.hint-box.solution {
		border-color: color-mix(in srgb, var(--green) 45%, var(--line));
	}

	.tag {
		font-family: var(--mono);
		font-size: 0.75rem !important;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--textDim);
	}

	.sub {
		font-weight: 500;
	}

	.factor-row {
		display: grid;
		grid-template-columns: minmax(0, 14rem) repeat(2, minmax(0, 1fr));
		gap: 0.6rem 1rem;
		align-items: start;
	}

	.factor-row .field {
		margin-bottom: 0;
		min-width: 0;
	}

	.factor-label {
		font-size: 0.85rem;
		color: var(--textDim);
		padding-top: 1.8rem;
		overflow-x: auto;
	}

	.stage-row,
	.stage-card {
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		padding: 0.8rem 0.9rem;
		display: grid;
		gap: 0.55rem;
		background: var(--surface);
		min-width: 0;
	}

	.stage-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.8rem;
	}

	.stage-head select {
		width: auto;
		max-width: 100%;
	}

	.kind {
		font-size: 0.85rem;
		color: var(--textDim);
	}

	.diagram {
		max-width: 560px;
	}

	.grid-table th,
	.grid-table td {
		vertical-align: middle;
	}

	.grid-table td :global(.katex) {
		font-size: 1.12em;
	}

	.grid-table.denorm td {
		padding-top: 0.6rem;
		padding-bottom: 0.6rem;
	}

	.grid-table th.here,
	.grid-table td.here {
		background: color-mix(in srgb, var(--surface) 85%, var(--blue) 15%);
	}

	.grid-table.poly tr.picked td {
		background: color-mix(in srgb, var(--surface) 88%, var(--amber) 12%);
	}

	.grid-table.poly tr.right td {
		background: color-mix(in srgb, var(--surface) 85%, var(--green) 15%);
	}

	.grid-table.poly button[aria-pressed='true'] {
		border-color: var(--blue);
	}

	details.py summary {
		font-size: 0.78rem;
	}

	.py-body {
		margin-top: 0.5rem;
		position: relative;
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}

	.py-body .copy {
		justify-self: start;
	}

	pre {
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		padding: 0.7rem 0.9rem;
		overflow-x: auto;
		font-size: 0.78rem;
		line-height: 1.45;
		max-width: 100%;
	}

	pre code {
		background: none;
		border: 0;
		padding: 0;
		font-size: inherit;
	}

	@media (max-width: 620px) {
		.factor-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.factor-label {
			grid-column: 1 / -1;
			padding-top: 0;
		}

		.choice .restart {
			margin-left: 0;
		}
	}
</style>
