<script>
	// The signal generator's frequency sweep, made for checking a filter with
	// a multimeter. A stepped sweep holds each frequency for a while (or until
	// "Next"), long enough for a meter to settle; next to each step goes the
	// reading at the filter's input and at its output, and the gain they give
	// builds the filter's response as it is measured. A continuous sweep
	// glides from one end to the other, for a scope or for the ear.
	//   sweep         the page's sweep state (bindable): what to play and where it is
	//   running       whether the output is open
	//   nyquist       the highest frequency the output can hold
	//   sweepTimes    seconds into the continuous sweep, per channel, from the worklet
	//   ensureRunning opens the output if needed (a click is the only way to)
	import { onMount } from 'svelte';
	import XYPlot from '$lib/components/basics/XYPlot.svelte';
	import { formatHz } from '$lib/audio/format';
	import { readResponse, responseCsv, STEPS_PER_DECADE, sweepSteps } from '$lib/audio/sweep';
	import { sweepFrequency } from '$lib/audio/oscillator';

	let { sweep = $bindable(), running, nyquist, sweepTimes = [null, null], ensureRunning } = $props();

	const steps = $derived(sweepSteps(sweep));
	const playable = $derived(steps.filter((f) => f <= nyquist));
	const tooHigh = $derived(steps.length - playable.length);
	const stepHz = $derived(playable[Math.min(sweep.index, playable.length - 1)] ?? null);

	// continuous: the frequency the worklet reports playing now
	const channelIndex = $derived(sweep.channel === 'right' ? 1 : 0);
	const glideHz = $derived.by(() => {
		const t = sweepTimes[channelIndex];
		if (t === null || t === undefined) return Number(sweep.from) || null;
		return sweepFrequency({ ...sweep, from: sweep.from, to: Math.min(Number(sweep.to), nyquist) }, t);
	});
	const nowHz = $derived(!sweep.active ? null : sweep.mode === 'stepped' ? stepHz : glideHz);
	$effect(() => {
		sweep.nowHz = nowHz;
	});

	// ---------------------------------------------------------------- readings
	// kept in this browser, per frequency, so a measurement survives a reload
	const KEY = 'rbt56.signalgen.readings';
	let readings = $state({});
	let reference = $state('');
	let loaded = false;
	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
			if (saved) {
				readings = saved.readings ?? {};
				reference = saved.reference ?? '';
			}
		} catch {
			// no storage: the readings simply last as long as the page
		}
		loaded = true;
	});
	$effect(() => {
		const data = JSON.stringify({ readings, reference });
		if (!loaded) return;
		try {
			localStorage.setItem(KEY, data);
		} catch {
			// private window or storage off: nothing to keep
		}
	});
	// a reading written in a step's field (getter and setter for bind:value)
	function setReading(f, key, v) {
		readings[f] = { ...(readings[f] ?? { vin: '', vout: '' }), [key]: v };
	}
	const rows = $derived(playable.map((f) => ({ f, vin: readings[f]?.vin ?? '', vout: readings[f]?.vout ?? '' })));
	const refV = $derived(Number(reference) > 0 ? Number(reference) : null);
	const response = $derived(readResponse(rows, refV));
	const plot = $derived({
		xs: response.points.map((p) => p.f),
		ys: response.points.map((p) => p.db - response.peak)
	});
	function clearReadings() {
		readings = {};
		reference = '';
	}
	function download() {
		const blob = new Blob([responseCsv(rows, refV)], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'filter-response.csv';
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}

	// ---------------------------------------------------------------- playing
	let left = $state(0); // seconds left on the current step
	async function start() {
		await ensureRunning();
		sweep.index = 0;
		sweep.paused = false;
		sweep.id = (sweep.id ?? 0) + 1;
		sweep.active = true;
	}
	function stop() {
		sweep.active = false;
		sweep.paused = false;
	}
	function go(delta) {
		const n = playable.length;
		if (!n) return;
		sweep.index = Math.max(0, Math.min(n - 1, sweep.index + delta));
		left = Number(sweep.dwell) || 0;
	}
	// the dwell clock of an automatic stepped sweep, ticking in tenths
	$effect(() => {
		if (!sweep.active || sweep.mode !== 'stepped' || sweep.advance !== 'auto' || sweep.paused || !running) return;
		left = Number(sweep.dwell) || 0;
		const index = sweep.index;
		const timer = setInterval(() => {
			left = Math.max(0, left - 0.1);
			if (left > 0) return;
			if (index < playable.length - 1) sweep.index = index + 1;
			else if (sweep.repeat) sweep.index = 0;
			else stop();
		}, 100);
		return () => clearInterval(timer);
	});
	// a new range never leaves the step pointer past its end
	$effect(() => {
		if (sweep.index > playable.length - 1) sweep.index = Math.max(0, playable.length - 1);
	});

	// a step's frequency as written next to a reading: 125 Hz, 3.15 kHz
	function fmt(f) {
		if (f === null || f === undefined || !Number.isFinite(f)) return '';
		if (f < 1000) return `${Number(f.toPrecision(f < 100 ? 3 : 4))} Hz`;
		return `${Number((f / 1000).toPrecision(4))} kHz`;
	}
	const db = (v) => (v === null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`);
</script>

<div class="grid">
	<div class="field">
		<label for="sw-mode">Sweep</label>
		<select id="sw-mode" bind:value={sweep.mode} disabled={sweep.active}>
			<option value="stepped">In steps (multimeter)</option>
			<option value="continuous">Continuous (scope, ear)</option>
		</select>
	</div>
	<div class="field">
		<label for="sw-ch">On</label>
		<select id="sw-ch" bind:value={sweep.channel} disabled={sweep.active}>
			<option value="left">Left channel</option>
			<option value="right">Right channel</option>
			<option value="both">Both channels</option>
		</select>
	</div>
	<div class="field">
		<label for="sw-from">From (Hz)</label>
		<input id="sw-from" type="number" min="1" step="1" bind:value={sweep.from} disabled={sweep.active} />
	</div>
	<div class="field">
		<label for="sw-to">To (Hz), up to {formatHz(nyquist)}</label>
		<input id="sw-to" type="number" min="1" step="1" bind:value={sweep.to} disabled={sweep.active} />
	</div>
	<div class="field">
		<label for="sw-space">Spacing</label>
		<select id="sw-space" bind:value={sweep.spacing} disabled={sweep.active}>
			<option value="log">Logarithmic</option>
			<option value="linear">Linear</option>
		</select>
	</div>
	{#if sweep.mode === 'stepped'}
		{#if sweep.spacing === 'log'}
			<div class="field">
				<label for="sw-per">Steps per decade</label>
				<select id="sw-per" bind:value={sweep.perDecade} disabled={sweep.active}>
					{#each STEPS_PER_DECADE as n (n)}
						<option value={n}>{n}{n === 3 ? ' (1, 2, 5)' : ''}</option>
					{/each}
				</select>
			</div>
		{:else}
			<div class="field">
				<label for="sw-step">Step (Hz)</label>
				<input id="sw-step" type="number" min="1" step="1" bind:value={sweep.step} disabled={sweep.active} />
			</div>
		{/if}
		<div class="field">
			<label for="sw-adv">Next step</label>
			<select id="sw-adv" bind:value={sweep.advance}>
				<option value="auto">After a fixed time</option>
				<option value="manual">On Next, by hand</option>
			</select>
		</div>
		{#if sweep.advance === 'auto'}
			<div class="field">
				<label for="sw-dwell">Time on each step (s)</label>
				<input id="sw-dwell" type="number" min="0.5" step="0.5" bind:value={sweep.dwell} />
			</div>
		{/if}
	{:else}
		<div class="field">
			<label for="sw-dur">Time for the whole sweep (s)</label>
			<input id="sw-dur" type="number" min="0.1" step="0.5" bind:value={sweep.duration} disabled={sweep.active} />
		</div>
	{/if}
	<div class="field">
		<label class="check" for="sw-rep">
			<input id="sw-rep" type="checkbox" bind:checked={sweep.repeat} disabled={sweep.active && sweep.mode === 'continuous'} />
			Start over at the end
		</label>
	</div>
</div>

<div class="play">
	{#if sweep.active}
		<button type="button" onclick={stop}>Stop the sweep</button>
		{#if sweep.mode === 'stepped'}
			<button type="button" class="ghost" onclick={() => go(-1)} disabled={sweep.index === 0}>Previous</button>
			{#if sweep.advance === 'auto'}
				<button type="button" class="ghost" onclick={() => (sweep.paused = !sweep.paused)}>{sweep.paused ? 'Resume' : 'Hold here'}</button>
			{/if}
			<button type="button" class="ghost" onclick={() => go(1)} disabled={sweep.index >= playable.length - 1}>Next</button>
		{/if}
	{:else}
		<button type="button" onclick={start} disabled={sweep.mode === 'stepped' ? !playable.length : !(Number(sweep.from) > 0 && Number(sweep.to) > 0)}>Start the sweep</button>
	{/if}
	<div class="now">
		<span class="hz">{sweep.active && nowHz ? fmt(nowHz) : 'stopped'}</span>
		{#if sweep.active && sweep.mode === 'stepped'}
			<span class="dim">step {sweep.index + 1} of {playable.length}{#if sweep.advance === 'auto' && !sweep.paused}, next in {left.toFixed(1)} s{:else if sweep.paused}, held{/if}</span>
		{:else if !sweep.active && sweep.mode === 'stepped'}
			<span class="dim">{playable.length} steps from {fmt(playable[0])} to {fmt(playable[playable.length - 1])}</span>
		{/if}
	</div>
</div>
{#if sweep.active && sweep.mode === 'stepped' && sweep.advance === 'auto' && !sweep.paused}
	<div class="bar"><i style="width: {100 * (1 - left / (Number(sweep.dwell) || 1))}%"></i></div>
{/if}
{#if tooHigh > 0}
	<p class="flag warn">{tooHigh} step{tooHigh > 1 ? 's are' : ' is'} above {formatHz(nyquist)}, half the sample rate: left out.</p>
{/if}
<p class="note">
	The sweep plays a sine at the amplitude set for the channel, whatever its shape, and replaces
	the channel's frequency until it stops.
</p>

{#if sweep.mode === 'stepped'}
	<h3>Readings</h3>
	<p class="note">
		At each step, the AC voltage at the filter's input and at its output go in the two columns,
		both read with the same meter on the same range (in volts, or any unit used for both). The
		gain is output over input, so the meter's own fall-off with frequency and the sound card's
		cancel out. A single input reading, given once below, stands for every step left blank.
	</p>
	<div class="ref field">
		<label for="sw-refv">Input reading used when a step has none</label>
		<input id="sw-refv" type="number" min="0" step="any" bind:value={reference} placeholder="e.g. 0.707" />
	</div>
	<div class="tableScroll">
		<table class="readings">
			<thead>
				<tr><th>Frequency</th><th>Input</th><th>Output</th><th>Gain</th></tr>
			</thead>
			<tbody>
				{#each rows as row, i (row.f)}
					{@const point = response.points.find((p) => p.f === row.f)}
					<tr class:current={sweep.active && i === sweep.index}>
						<td>{fmt(row.f)}</td>
						<td><input type="number" min="0" step="any" aria-label={`input at ${fmt(row.f)}`} bind:value={() => readings[row.f]?.vin ?? '', (v) => setReading(row.f, 'vin', v)} placeholder={refV ? String(refV) : ''} /></td>
						<td><input type="number" min="0" step="any" aria-label={`output at ${fmt(row.f)}`} bind:value={() => readings[row.f]?.vout ?? '', (v) => setReading(row.f, 'vout', v)} /></td>
						<td>{point ? db(point.db) : ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if response.points.length >= 2}
		<XYPlot
			xs={plot.xs}
			series={[{ ys: plot.ys, color: 'var(--blue)', width: 2 }]}
			points={response.points.map((p) => ({ x: p.f, y: p.db - response.peak, color: 'var(--blue)' }))}
			hlines={[{ y: -3, label: '-3 dB', color: 'var(--amber)' }]}
			markers={response.crossings.map((c) => ({ x: c.f, label: fmt(c.f), color: 'var(--amber)' }))}
			xLog
			xLabel="frequency (Hz)"
			yLabel="gain, relative to the highest (dB)"
			yStep={10}
			yMax={5}
			height={220}
		/>
		<p class="mono">
			highest gain {db(response.peak)} at {fmt(response.peakF)}{#each response.crossings as c (c.f)}; -3 dB {c.rising ? 'rising' : 'falling'} at {fmt(c.f)}{/each}
		</p>
	{/if}
	<div class="row actions">
		<button type="button" class="ghost small" onclick={download} disabled={!response.points.length}>Download the readings (CSV)</button>
		<button type="button" class="ghost small" onclick={clearReadings}>Clear the readings</button>
	</div>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 0.7rem 1rem;
	}

	.grid .field {
		margin-bottom: 0;
	}

	.grid .check {
		margin-top: 1.75rem;
	}

	.play {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin: 1rem 0 0.6rem;
	}

	.now {
		display: grid;
		margin-left: 0.6rem;
	}

	.hz {
		font-family: var(--mono);
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1.1;
	}

	.dim {
		font-size: 0.8rem;
		color: var(--textDim);
	}

	.bar {
		height: 0.3rem;
		background: var(--surfaceHover);
		border-radius: 999px;
		overflow: hidden;
		margin-bottom: 0.6rem;
	}

	.bar i {
		display: block;
		height: 100%;
		background: var(--blue);
		transition: width 0.1s linear;
	}

	h3 {
		margin: 1.2rem 0 0.4rem;
		font-size: 0.98rem;
	}

	.ref {
		max-width: 320px;
		margin: 0.6rem 0;
	}

	.readings {
		width: auto;
	}

	.readings td {
		padding-top: 0.2rem;
		padding-bottom: 0.2rem;
	}

	.readings td:first-child,
	.readings td:last-child {
		min-width: 6.5rem;
	}

	.readings input {
		width: 7rem;
		padding: 0.25rem 0.45rem;
		font-family: var(--mono);
		font-size: 0.82rem;
	}

	tr.current td {
		background: #e3eff6;
	}

	.mono {
		font-family: var(--mono);
		font-size: 0.8rem;
		margin-top: 0.4rem;
		max-width: none;
	}

	.actions {
		margin-top: 0.8rem;
	}
</style>
