<script>
	import DiagramView from '$lib/components/DiagramView.svelte';
	import MathPanel from '$lib/components/MathPanel.svelte';
	import { formatFarads, formatHz, formatOhms, formatVolts } from '$lib/modulation/format';
	import { buildAgcDiagram, buildLimiterDiagram, buildOscillatorDiagram, hasLimiterDiagram } from '$lib/oscillator/circuits';
	import { explainBarkhausen, explainOpampLimit, explainStabilizer, explainTopology } from '$lib/oscillator/explain';
	import { generateNetlist, generateSchematic } from '$lib/oscillator/spice';
	import { compareOscillators, designOscillator, STABILIZERS, TOPOLOGIES } from '$lib/oscillator/topologies';

	let topology = $state('wien');
	let stabilizer = $state('diodes');
	let frequency = $state(1000);
	let amplitude = $state(3);
	let diodeVf = $state(0.6);
	let excessPercent = $state(5);
	let gbwMhz = $state(3);
	let slewRateVus = $state(13);
	let opampSwing = $state(10.5);

	const valid = $derived(frequency > 0 && amplitude > 0 && gbwMhz > 0 && slewRateVus > 0 && opampSwing > 0 && diodeVf > 0);
	const params = $derived({
		frequency,
		amplitude,
		stabilizer,
		diodeVf,
		excessGain: excessPercent / 100,
		gbw: gbwMhz * 1e6,
		slewRate: slewRateVus * 1e6,
		opampSwing
	});
	const design = $derived(valid ? designOscillator({ ...params, topology }) : null);
	const rows = $derived(valid ? compareOscillators(params) : []);
	const wienRow = $derived(rows.find((r) => r.id === 'wien'));
	const currentRow = $derived(rows.find((r) => r.id === topology));

	function save(text, filename) {
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}
	const stem = $derived(`${topology}-oscillator`);
</script>

<svelte:head>
	<title>Sine Oscillator Design · rbt56</title>
	<meta
		name="description"
		content="Design an op-amp sine-wave oscillator: Wien bridge, phase shift, buffered phase shift, Bubba and quadrature, with amplitude stabilization, component values, distortion, the gain-bandwidth limit and an LTspice download."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 06</p>
	<h1>Sine Oscillator Design</h1>
	<p class="lead">
		Five ways to make a sine wave out of op-amps, resistors and capacitors, with the component
		values, the amplitude stabilization that each one needs, the distortion to expect and whether
		the op-amp is fast enough. The comparison says which to build and why.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>Specification</h2>
			<span class="hint">{design ? `f0 = ${formatHz(design.f0)}` : 'check the values'}</span>
		</div>
		<div class="grid">
			<div class="field">
				<label for="topo">Topology</label>
				<select id="topo" bind:value={topology}>
					{#each TOPOLOGIES as t (t.id)}
						<option value={t.id}>{t.label}</option>
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="freq">Frequency (Hz)</label>
				<input id="freq" type="number" min="1" step="10" bind:value={frequency} />
			</div>
			<div class="field">
				<label for="amp">Output amplitude (V peak)</label>
				<input id="amp" type="number" min="0.1" step="0.1" bind:value={amplitude} />
			</div>
			{#if topology === 'wien'}
				<div class="field">
					<label for="stab">Amplitude stabilization</label>
					<select id="stab" bind:value={stabilizer}>
						{#each STABILIZERS as s (s.id)}
							<option value={s.id}>{s.label}</option>
						{/each}
					</select>
				</div>
			{/if}
			<div class="field">
				<label for="vf">Diode forward drop (V)</label>
				<input id="vf" type="number" min="0.1" step="0.05" bind:value={diodeVf} />
			</div>
			<div class="field">
				<label for="excess">Excess gain to start (%)</label>
				<input id="excess" type="number" min="1" max="50" step="1" bind:value={excessPercent} />
			</div>
			<div class="field">
				<label for="gbw">Op-amp gain-bandwidth (MHz)</label>
				<input id="gbw" type="number" min="0.1" step="0.5" bind:value={gbwMhz} />
			</div>
			<div class="field">
				<label for="sr">Op-amp slew rate (V/us)</label>
				<input id="sr" type="number" min="0.1" step="1" bind:value={slewRateVus} />
			</div>
			<div class="field">
				<label for="swing">Op-amp output swing (V)</label>
				<input id="swing" type="number" min="0.5" step="0.5" bind:value={opampSwing} />
			</div>
		</div>
		<p class="note">{TOPOLOGIES.find((t) => t.id === topology)?.summary}</p>
		{#if !valid}
			<p class="flag bad">Frequency, amplitude, diode drop and the op-amp figures all have to be positive.</p>
		{:else if !design}
			<p class="flag bad">No sensible component pair for this frequency: the resistors would fall outside 1 k to 1 M. Try another frequency.</p>
		{/if}
	</section>

	{#if design}
		<section class="panel">
			<div class="panel-head">
				<span class="num">02</span>
				<h2>Circuit</h2>
				<span class="hint">{design.opamps} op-amp{design.opamps === 1 ? '' : 's'}, gain {design.requiredGain.toFixed(2)} needed</span>
			</div>
			<DiagramView diagram={buildOscillatorDiagram(design)} label="{design.topo.label} oscillator" />
			<table>
				<tbody>
					<tr><td>Frequency: target / realized</td><td>{formatHz(frequency)} / {formatHz(design.f0)} ({design.f0Error >= 0 ? '+' : ''}{(100 * design.f0Error).toFixed(2)} %)</td></tr>
					<tr><td>R (each)</td><td>{formatOhms(design.r)}</td></tr>
					<tr><td>C (each)</td><td>{formatFarads(design.c)}</td></tr>
					<tr><td>Gain the loop needs</td><td>{design.requiredGain.toFixed(2)}, set to {design.startGain.toFixed(2)} so it starts</td></tr>
					{#if design.topology === 'wien'}
						<tr><td>Rg (lower feedback leg)</td><td>{formatOhms(design.rg)}</td></tr>
					{:else}
						<tr><td>Rg (also the last ladder resistor)</td><td>{formatOhms(design.rg)}</td></tr>
					{/if}
					<tr><td>Output amplitude</td><td>about {formatVolts(design.limiter.amplitudeActual ?? amplitude)} peak{design.outputs === 'quadrature' ? ', sine and cosine' : ''}</td></tr>
					{#if design.sectionLoss < 1}
						<tr><td>Cleanest tap (after the ladder)</td><td>{formatVolts(design.tapAmplitude)} peak, lower distortion than the amplifier output</td></tr>
					{/if}
					<tr><td>Expected distortion</td><td>{(100 * design.thd).toFixed(2)} % ({design.thdNote})</td></tr>
				</tbody>
			</table>
			<MathPanel blocks={[...explainBarkhausen(design), ...explainTopology(design)]} summary="Show the math for the loop" />
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">03</span>
				<h2>Amplitude stabilization</h2>
				<span class="hint">{design.topology === 'wien' ? STABILIZERS.find((s) => s.id === stabilizer)?.label : 'diode limiting'}</span>
			</div>
			{#if hasLimiterDiagram(design)}
				<DiagramView diagram={buildLimiterDiagram(design)} label="diode amplitude limiter" />
			{:else if stabilizer === 'jfet'}
				<DiagramView diagram={buildAgcDiagram(design)} label="JFET automatic gain control" />
			{/if}
			{#if design.limiter.regulates === false}
				<p class="flag bad">
					With these values the gain never falls below {design.requiredGain.toFixed(2)} even with the diodes fully
					conducting, so nothing brings the amplitude back and the output will clip on the rails instead.
					Lower the excess gain or the target amplitude.
				</p>
			{:else if design.limiter.regulates}
				<p class="flag ok">
					The gain straddles what the loop needs ({design.limiter.gainStart.toFixed(2)} before the diodes conduct,
					{design.limiter.gainLimited.toFixed(2)} with them fully on, against {design.requiredGain.toFixed(2)} needed), so the
					amplitude settles instead of clipping.
				</p>
			{/if}
			{#if design.topology === 'wien'}
				<p class="note">{STABILIZERS.find((s) => s.id === stabilizer)?.summary}</p>
			{/if}
			<MathPanel blocks={explainStabilizer(design)} summary="Show the math for the limiter" />
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">04</span>
				<h2>Is the op-amp fast enough</h2>
				<span class="hint">f0 A / GBW = {design.opamp.gbwRatio.toFixed(3)}</span>
			</div>
			<table>
				<tbody>
					<tr><td>Closed-loop bandwidth at this gain</td><td>{formatHz(design.opamp.closedLoopBw)}</td></tr>
					<tr><td>Highest frequency this topology reaches with this op-amp</td><td>{formatHz(design.opamp.fMax)}</td></tr>
					<tr><td>Slew needed / available</td><td>{(design.opamp.slewNeeded / 1e6).toFixed(2)} V/us / {(design.opamp.slewRate / 1e6).toFixed(0)} V/us</td></tr>
					<tr><td>Output swing needed / available</td><td>{formatVolts(amplitude)} / {formatVolts(design.opamp.opampSwing)}</td></tr>
				</tbody>
			</table>
			{#if design.opamp.gbwOk}
				<p class="flag ok">Within the rule of thumb (f0 times the gain, at or under a tenth of the gain-bandwidth).</p>
			{:else}
				<p class="flag warn">
					Over the rule: this op-amp cannot hold a gain of {design.startGain.toFixed(2)} at {formatHz(design.f0)}, so the
					frequency will land off target. Use a faster part, drop to {formatHz(design.opamp.fMax)}, or pick a topology
					that needs less gain.
				</p>
			{/if}
			{#if !design.opamp.slewOk}
				<p class="flag bad">Slew rate: the output needs more than half of what this op-amp can do. Lower the amplitude or the frequency.</p>
			{/if}
			{#if !design.opamp.swingOk}
				<p class="flag bad">The amplitude asked for is beyond the op-amp's output swing on this supply.</p>
			{/if}
			<MathPanel blocks={explainOpampLimit(design)} summary="Show the math for the op-amp limit" />
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">05</span>
				<h2>Which one to build</h2>
				<span class="hint">same frequency, amplitude and op-amp</span>
			</div>
			<table class="compare">
				<thead>
					<tr>
						<th>Topology</th>
						<th>Gain needed</th>
						<th>Op-amps</th>
						<th>Outputs</th>
						<th>Distortion</th>
						<th>f0 error</th>
						<th>Ceiling with this op-amp</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.id)}
						<tr class:current={r.id === topology}>
							<td>{r.label}</td>
							<td>{r.ok ? r.gain.toFixed(2) : '-'}</td>
							<td>{r.ok ? r.opamps : '-'}</td>
							<td>{r.ok ? (r.outputs === 'quadrature' ? 'sine and cosine' : 'one') : '-'}</td>
							<td>{r.ok ? `${(100 * r.thd).toFixed(2)} %` : '-'}</td>
							<td>{r.ok ? `${(100 * r.f0Error).toFixed(2)} %` : '-'}</td>
							<td class:bad={r.ok && !r.gbwOk}>{r.ok ? `${formatHz(r.fMax)}${r.gbwOk ? '' : ' (below f0)'}` : 'not realizable'}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<h3>The verdict</h3>
			<p class="note">
				<strong>Build the Wien bridge unless you have a specific reason not to.</strong> It needs a gain
				of 3, the lowest here by a wide margin, which is the single number that decides how fast the op-amp
				has to be: at {formatHz(frequency)} it works up to {wienRow ? formatHz(wienRow.fMax) : ''} with this part,
				where the single-op-amp phase shift version gives up at {rows.find((r) => r.id === 'phaseShift') ? formatHz(rows.find((r) => r.id === 'phaseShift').fMax) : ''}.
				It is also the only one whose distortion you can genuinely drive down, because its amplitude control
				sits in a leg of its own: a lamp or a JFET AGC there measures under 0.2 percent, where the others
				limit inside the signal path and sit near one percent whatever you do. One op-amp, four passive parts,
				and one resistor pair to tune.
			</p>
			<p class="note">
				<strong>Two reasons to pick something else.</strong> If you need a sine and a cosine at once, the
				quadrature oscillator gives them by construction and asks for a gain of only 1, so it reaches the
				highest frequency of the group; the price is three op-amps and about 0.85 percent distortion. If the
				frequency has to hold still against drift, the Bubba spreads its phase over four sections, which makes
				the loop phase change fastest with frequency and so pins the frequency down best, and it also gives
				quadrature taps.
			</p>
			<p class="note">
				<strong>The two phase-shift versions are here mainly to be understood, not built.</strong> The
				single-op-amp one is the classic textbook circuit and uses the fewest parts, but a gain of 29 at the
				oscillation frequency is a hard demand: it runs out of op-amp roughly thirty times sooner than the Wien
				bridge, and its frequency moves with the amplifier's phase error. The buffered version fixes the
				accuracy and drops the gain to 8, but by then it costs four op-amps, which buys a Bubba with better
				stability and quadrature outputs for the same package.
			</p>
			{#if currentRow && !currentRow.gbwOk}
				<p class="flag warn">
					The topology selected above is one the op-amp cannot support at this frequency. The table shows which ones can.
				</p>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">06</span>
				<h2>Download</h2>
			</div>
			<div class="row downloads">
				<button type="button" onclick={() => save(generateSchematic(design), `${stem}.asc`)}>Download {stem}.asc (LTspice)</button>
				<button type="button" onclick={() => save(generateNetlist(design), `${stem}.cir`)}>Download {stem}.cir (netlist)</button>
			</div>
			<p class="note">
				The schematic carries these component values with a transient analysis already set up, plus the
				nudge an oscillator needs to start: SPICE would otherwise sit in its perfectly balanced operating
				point forever, so an initial condition on one node stands in for the circuit noise that starts a
				real one. The run discards the start-up while the amplitude settles against the limiter, then a
				Fourier directive reports the harmonics, which is the distortion figure predicted above. The op-amp
				is the ideal single-pole model with its gain-bandwidth set to the value entered here, so lowering it
				shows the frequency drifting exactly as the op-amp section describes.
			</p>
			<p class="note formula-link">
				Every formula this design used: <a href="/tools/oscillator/formulas/">Formula sheet</a>.
			</p>
		</section>
	{/if}
</article>

<style>
	.downloads {
		gap: 0.7rem;
		flex-wrap: wrap;
	}

	.compare th {
		text-align: left;
		font-weight: 600;
		color: var(--textDim);
		font-size: 0.78rem;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}

	.compare tr.current td {
		background: color-mix(in srgb, var(--blue) 8%, transparent);
		font-weight: 500;
	}

	.compare td.bad {
		color: var(--red, #c92a2a);
	}

	h3 {
		font-size: 0.95rem;
		margin: 1.3rem 0 0.5rem;
	}

	.formula-link {
		margin-top: 0.6rem;
	}
</style>
