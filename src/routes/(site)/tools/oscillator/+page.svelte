<script>
	import BasicsPanel from '$lib/components/BasicsPanel.svelte';
	import LoopDemo from '$lib/components/basics/LoopDemo.svelte';
	import NetworkDemo from '$lib/components/basics/NetworkDemo.svelte';
	import OpampLagDemo from '$lib/components/basics/OpampLagDemo.svelte';
	import RcPairDemo from '$lib/components/basics/RcPairDemo.svelte';
	import DiagramView from '$lib/components/DiagramView.svelte';
	import MathPanel from '$lib/components/MathPanel.svelte';
	import { formatFarads, formatHz, formatOhms, formatVolts } from '$lib/modulation/format';
	import { oscillatorBasics } from '$lib/oscillator/basics';
	import { buildAgcDiagram, buildClampDiagram, buildLimiterDiagram, buildOscillatorDiagram, hasLimiterDiagram } from '$lib/oscillator/circuits';
	import { explainBarkhausen, explainOpampLimit, explainStabilizer, explainTopology } from '$lib/oscillator/explain';
	import { DIODES, JFETS } from '$lib/oscillator/limiter';
	import { generateNetlist, generateSchematic } from '$lib/oscillator/spice';
	import { compareOscillators, designOscillator, STABILIZERS, TOPOLOGIES } from '$lib/oscillator/topologies';

	let topology = $state('wien');
	let stabilizer = $state('diodes');
	let diode = $state('1N4148');
	let jfet = $state('generic');
	let frequency = $state(1000);
	let amplitude = $state(3);
	let excessPercent = $state(5);
	let quadGrowthPercent = $state(10);
	let gbwMhz = $state(3);
	let slewRateVus = $state(13);
	let opampSwing = $state(10.5);

	const valid = $derived(frequency > 0 && amplitude > 0 && gbwMhz > 0 && slewRateVus > 0 && opampSwing > 0 && excessPercent > 0 && quadGrowthPercent > 0);
	const params = $derived({
		frequency,
		amplitude,
		stabilizer,
		diode,
		jfet,
		excessGain: excessPercent / 100,
		quadGrowth: quadGrowthPercent / 100,
		gbw: gbwMhz * 1e6,
		slewRate: slewRateVus * 1e6,
		opampSwing
	});
	const design = $derived(valid ? designOscillator({ ...params, topology }) : null);
	const rows = $derived(valid ? compareOscillators(params) : []);
	const wienRow = $derived(rows.find((r) => r.id === 'wien'));
	const currentRow = $derived(rows.find((r) => r.id === topology));
	const stabLabel = $derived(
		!design ? '' : design.limiter.kind === 'diodes' ? 'diode limiting' : design.limiter.kind === 'lamp' ? 'incandescent lamp' : design.limiter.kind === 'jfet' ? 'JFET gain control' : 'diode clamp on the second integrator'
	);
	// the export refuses a design whose amplitude control could not be sized
	const exportError = $derived.by(() => {
		if (!design) return null;
		try {
			generateNetlist(design);
			return null;
		} catch (e) {
			return e.message;
		}
	});

	const pct = (x, digits = 1) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(digits)} %`;

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
		content="Design an op-amp sine-wave oscillator: Wien bridge, phase shift, buffered phase shift, Bubba and quadrature, with the op-amp's own lag in the loop, amplitude control sized from the real diode curve, distortion, and an LTspice schematic that runs."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 06</p>
	<h1>Sine Oscillator Design</h1>
	<p class="lead">
		Five ways to make a sine wave out of op-amps, resistors and capacitors, with the component
		values, the amplitude control each one needs, the distortion to expect and what the op-amp's
		own speed does to the frequency. The loop is solved with the op-amp in it, so the RC values are
		retuned for its lag and the frequency lands where it says; the comparison says which to build
		and why, and the download is a drawn LTspice schematic that starts and settles on its own.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>Specification</h2>
			<span class="hint">{design ? `runs at ${formatHz(design.f0)}` : 'check the values'}</span>
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
			{#if topology !== 'wien' || stabilizer !== 'lamp'}
				<div class="field">
					<label for="diode">Diode</label>
					<select id="diode" bind:value={diode}>
						{#each Object.values(DIODES) as d (d.id)}
							<option value={d.id}>{d.label}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if topology === 'wien' && stabilizer === 'jfet'}
				<div class="field">
					<label for="jfet">JFET</label>
					<select id="jfet" bind:value={jfet}>
						{#each Object.values(JFETS) as j (j.id)}
							<option value={j.id}>{j.label}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if topology === 'quadrature'}
				<div class="field">
					<label for="growth">Start-up growth (% per cycle)</label>
					<input id="growth" type="number" min="1" max="50" step="1" bind:value={quadGrowthPercent} />
				</div>
			{:else}
				<div class="field">
					<label for="excess">Excess gain to start (%)</label>
					<input id="excess" type="number" min="1" max="50" step="1" bind:value={excessPercent} />
				</div>
			{/if}
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
			<p class="flag bad">Frequency, amplitude, the excess gain and the op-amp figures all have to be positive.</p>
		{:else if !design}
			<p class="flag bad">No sensible component pair for this frequency with this op-amp: either the resistors would fall outside 1 k to 1 M, or the loop cannot be made to balance at all. Try another frequency, a faster op-amp or another topology.</p>
		{/if}
	</section>

	{#if design}
		<BasicsPanel
			blocks={oscillatorBasics(design)}
			widgets={{ loop: LoopDemo, 'rc-pair': RcPairDemo, network: NetworkDemo, 'opamp-lag': OpampLagDemo }}
			summary="New to oscillators: where the sine wave comes from, with a little maths and four figures to move"
			minutes={9}
		/>

		<section class="panel">
			<div class="panel-head">
				<span class="num">02</span>
				<h2>Circuit</h2>
				<span class="hint">{design.opamps} op-amp{design.opamps === 1 ? '' : 's'}, gain {design.requiredGain.toFixed(2)} needed</span>
			</div>
			<DiagramView diagram={buildOscillatorDiagram(design)} label="{design.topo.label} oscillator" />
			<table>
				<tbody>
					<tr><td>Frequency: wanted / predicted with this op-amp</td><td>{formatHz(frequency)} / {formatHz(design.f0)} ({pct(design.f0Error, 2)})</td></tr>
					<tr><td>R (each)</td><td>{formatOhms(design.r)}</td></tr>
					<tr><td>C (each)</td><td>{formatFarads(design.c)}</td></tr>
					<tr><td>Textbook frequency of these R and C</td><td>{formatHz(design.fIdeal)}: retuned {pct(design.retunePercent)} so the op-amp's lag lands the loop on target</td></tr>
					{#if design.kind === 'quadrature'}
						<tr><td>Inverter</td><td>gain exactly 1 (Ra = Rb = {formatOhms(design.parts.ra)}); start-up from Rn = {formatOhms(design.parts.rn)}, {pct(design.growthPerCycle)} per cycle</td></tr>
					{:else}
						<tr><td>Gain the loop needs with this op-amp</td><td>{design.requiredGain.toFixed(2)} (textbook {design.idealGain.toFixed(2)}), set to {Number.isFinite(design.startGain) ? design.startGain.toFixed(2) : '?'} with the parts below</td></tr>
						{#if design.limiter.kind === 'diodes'}
							<tr><td>Loop gain at start, with the diodes off</td><td>{Number.isFinite(design.loopExcess) ? `${(1 + design.loopExcess).toFixed(3)}: ${pct(design.loopExcess)} excess, growing ${pct(design.growthPerCycle)} per cycle` : 'not available'}</td></tr>
						{/if}
					{/if}
					{#if design.topology === 'wien'}
						<tr><td>Rg (lower feedback leg)</td><td>{formatOhms(design.rg)}</td></tr>
					{:else if design.topo.ladder}
						<tr><td>Rg (also the last ladder resistor)</td><td>{formatOhms(design.rg)}</td></tr>
					{/if}
					<tr><td>Output amplitude</td><td>{design.limiter.amplitudeActual === null ? 'cannot be set with these parts' : `about ${formatVolts(design.limiter.amplitudeActual)} peak`}{design.outputs === 'quadrature' ? ', sine and cosine' : ''}</td></tr>
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
				<span class="hint">{stabLabel}</span>
			</div>
			{#if hasLimiterDiagram(design)}
				<DiagramView diagram={buildLimiterDiagram(design)} label="diode amplitude limiter" />
			{:else if design.limiter.kind === 'jfet' && design.limiter.regulates}
				<DiagramView diagram={buildAgcDiagram(design)} label="JFET automatic gain control" />
			{:else if design.limiter.kind === 'clamp'}
				<DiagramView diagram={buildClampDiagram(design)} label="damping clamp" />
			{/if}
			{#if design.limiter.kind === 'diodes'}
				<table>
					<tbody>
						<tr><td>Rf1 / Rf2 (diodes across Rf2)</td><td>{formatOhms(design.limiter.rf1)} / {formatOhms(design.limiter.rf2)}</td></tr>
						<tr><td>Gain before the diodes conduct / with them fully on</td><td>{design.limiter.gainStart.toFixed(2)} / {design.limiter.gainLimited.toFixed(2)}, against {design.requiredGain.toFixed(2)} needed</td></tr>
						<tr><td>Diode</td><td>{DIODES[design.diode].label}</td></tr>
					</tbody>
				</table>
				{#if design.limiter.regulates}
					<p class="flag ok">
						The gain straddles what the loop needs, so the amplitude settles at about {formatVolts(design.limiter.amplitudeActual)} peak
						instead of clipping. That figure comes from the diode's real exponential curve, averaged over a cycle, which is
						what LTspice sees too.
					</p>
				{:else}
					<p class="flag bad">
						With these parts the gain never falls below {design.requiredGain.toFixed(2)} even with the diodes fully conducting,
						so nothing brings the amplitude back and the output clips on the rails instead. Lower the excess gain or raise
						the amplitude.
					</p>
				{/if}
			{:else if design.limiter.kind === 'lamp'}
				<table>
					<tbody>
						<tr><td>Rf</td><td>{formatOhms(design.limiter.rf)}</td></tr>
						<tr><td>Lamp resistance needed, hot / cold</td><td>{formatOhms(design.limiter.rHot)} at {formatVolts(amplitude / design.requiredGain)} peak across it / about {formatOhms(design.limiter.rCold)}</td></tr>
						<tr><td>Gain at switch-on, cold</td><td>{design.limiter.gainStart.toFixed(1)}, falling to {design.requiredGain.toFixed(2)} as the filament warms</td></tr>
					</tbody>
				</table>
				<p class="flag ok">
					A lamp whose hot resistance is {formatOhms(design.limiter.rHot)} at {formatVolts(amplitude / design.requiredGain)} peak
					sets the amplitude to {formatVolts(amplitude)}; the LTspice file carries a lamp that heats up, tuned to exactly that,
					with a thermal time constant of {design.limiter.tau >= 1 ? `${design.limiter.tau.toFixed(1)} s` : `${(1000 * design.limiter.tau).toFixed(1)} ms`} so the run settles quickly.
				</p>
			{:else if design.limiter.kind === 'jfet'}
				{#if design.limiter.regulates}
					<table>
						<tbody>
							<tr><td>Rf / series resistor with the channel</td><td>{formatOhms(design.limiter.rf)} / {formatOhms(design.limiter.rSeries)}</td></tr>
							<tr><td>Channel at balance / gate needed</td><td>{formatOhms(design.limiter.rBalance)} / {design.limiter.vgsNeeded.toFixed(2)} V</td></tr>
							<tr><td>Detector divider Ra / Rb, Cdet</td><td>{design.limiter.ra > 0 ? formatOhms(design.limiter.ra) : 'none'} / {formatOhms(design.limiter.rb)}, {formatFarads(design.limiter.cDet)} ({Math.round(design.limiter.cyclesPerTau)} cycles)</td></tr>
							<tr><td>Gate averaging resistors</td><td>2 x {formatOhms(design.limiter.rx)}</td></tr>
							<tr><td>Gain at switch-on</td><td>{design.limiter.gainStart.toFixed(2)}, against {design.requiredGain.toFixed(2)} needed</td></tr>
						</tbody>
					</table>
					{#if Math.abs(design.limiter.amplitudeActual / amplitude - 1) > 0.03}
						<p class="flag warn">
							The amplitude settles at about {formatVolts(design.limiter.amplitudeActual)} peak rather than the {formatVolts(amplitude)} asked:
							just above this JFET's minimum, no standard series resistor leaves the channel where the detector can hold it. A slightly
							larger amplitude lands where it is asked.
						</p>
					{:else}
						<p class="flag ok">
							The channel closes as the output grows, so the amplitude settles at about {formatVolts(design.limiter.amplitudeActual)} peak
							with this {JFETS[design.jfet].label.split(' (')[0]}; nothing in the signal path clips.
						</p>
					{/if}
				{:else}
					<p class="flag bad">
						This JFET cannot be controlled at {formatVolts(amplitude)} peak. The detector only delivers the output's negative peak, and
						squeezing the channel far enough to hold the gain, while leaving the loop enough gain to start, takes at least
						{formatVolts(design.limiter.minAmplitude)} peak at the output with this part. Ask for that much, or pick a JFET with a smaller
						pinch-off voltage.
					</p>
				{/if}
			{:else}
				<table>
					<tbody>
						<tr><td>Start-up resistor Rn (inverter output into integrator 2)</td><td>{formatOhms(design.limiter.rn)}: {pct(design.limiter.growthPerCycle)} per cycle</td></tr>
						<tr><td>Clamp divider Rd1 / Rd2, diodes into the same input</td><td>{formatOhms(design.limiter.rd1)} / {formatOhms(design.limiter.rd2)}, {DIODES[design.diode].label.split(' (')[0]}</td></tr>
					</tbody>
				</table>
				{#if design.limiter.regulates}
					<p class="flag ok">
						The clamp only conducts above the divider's threshold, so the amplitude parks at about {formatVolts(design.limiter.amplitudeActual)} peak,
						where its damping cancels Rn's. Gain compression could never do this in a two-integrator loop: only damping moves its poles.
					</p>
				{:else}
					<p class="flag bad">No clamp divider reaches this amplitude. Try a larger amplitude or a smaller start-up growth.</p>
				{/if}
			{/if}
			{#if design.topology === 'wien'}
				<p class="note">{STABILIZERS.find((s) => s.id === stabilizer)?.summary}</p>
			{/if}
			<MathPanel blocks={explainStabilizer(design)} summary="Show the math for the amplitude control" />
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">04</span>
				<h2>What the op-amp does to the loop</h2>
				<span class="hint">lag {design.opamp.lagDeg.toFixed(1)} degrees at {formatHz(design.f0)}</span>
			</div>
			<table>
				<tbody>
					<tr><td>Frequency the textbook RC values would give with this op-amp</td><td>{Number.isFinite(design.uncompensatedError) ? `${formatHz(design.fUncompensated)} (${pct(design.uncompensatedError)})` : 'no balance found'}</td></tr>
					<tr><td>Retune applied to R C</td><td>{pct(design.retunePercent)}, which puts the predicted frequency at {formatHz(design.f0)} ({pct(design.f0Error, 2)} after rounding to stock values)</td></tr>
					<tr><td>Closed-loop bandwidth of the gain stage</td><td>{formatHz(design.opamp.closedLoopBw)} (noise gain {design.opamp.noiseGain.toFixed(1)})</td></tr>
					<tr><td>Where the textbook values would be 10 % low with this op-amp</td><td>{Number.isFinite(design.opamp.fMax) ? formatHz(design.opamp.fMax) : 'beyond 1 GHz'}</td></tr>
					<tr><td>Slew needed / available</td><td>{(design.opamp.slewNeeded / 1e6).toFixed(2)} V/us / {(design.opamp.slewRate / 1e6).toFixed(0)} V/us</td></tr>
					<tr><td>Output swing needed / available</td><td>{formatVolts(amplitude)} / {formatVolts(design.opamp.opampSwing)}</td></tr>
				</tbody>
			</table>
			{#if design.opamp.opampOk}
				<p class="flag ok">
					This op-amp holds the loop: the retune absorbs its lag and the amplifier still has {design.kind === 'quadrature' ? `${pct(design.growthPerCycle)} per cycle of designed growth` : `${pct(design.loopExcess)} of excess gain`} to start with.
				</p>
			{:else if design.limiter.kind === 'jfet' && !design.limiter.regulates}
				<p class="note">
					The op-amp is not what stops this design: the JFET cannot be controlled at {formatVolts(amplitude)} peak (see the amplitude
					control above), so there is no start-up gain for the op-amp to hold yet. The lag and slew figures above are what this op-amp
					would see once the amplitude is at least {formatVolts(design.limiter.minAmplitude)}.
				</p>
			{:else if !design.starts}
				<p class="flag bad">
					With this op-amp the loop does not start: at {formatHz(design.f0)} the amplifier's lag (and the limiter diodes' capacitance across
					Rf2) costs more loop gain than the excess provides{Number.isFinite(design.loopExcess) ? ` (${pct(design.loopExcess)} at start)` : ''}. Raise the excess
					gain, use a faster part, or pick a topology that asks for less gain; the Wien bridge asks for the least.
				</p>
			{:else}
				<p class="flag warn">
					The amplifier lags {design.opamp.lagDeg.toFixed(0)} degrees at this frequency, further than the single-pole model and the retune
					built on it can be trusted (about 25 degrees): the loop may well run, but expect it a few percent off in frequency and
					amplitude, and the part's gain-bandwidth spread to matter. A faster op-amp, or a topology that asks for less gain, brings
					it back inside; the Wien bridge asks for the least.
				</p>
			{/if}
			{#if !design.opamp.slewOk}
				<p class="flag bad">Slew rate: the output needs more than half of what this op-amp can do. Lower the amplitude or the frequency.</p>
			{/if}
			{#if !design.opamp.swingOk}
				<p class="flag bad">The amplitude asked for is beyond the op-amp's output swing on this supply.</p>
			{/if}
			<MathPanel blocks={explainOpampLimit(design)} summary="Show the math for the op-amp in the loop" />
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">05</span>
				<h2>Which one to build</h2>
				<span class="hint">same frequency, amplitude and op-amp</span>
			</div>
			<div class="tableScroll">
			<table class="compare">
				<thead>
					<tr>
						<th>Topology</th>
						<th>Gain needed</th>
						<th>Op-amps</th>
						<th>Outputs</th>
						<th>Distortion</th>
						<th>Untuned shift</th>
						<th>Predicted error</th>
						<th>Starts</th>
						<th>10 % point</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.id)}
						<tr class:current={r.id === topology}>
							<td>{r.label}</td>
							<td>{r.ok ? `${r.gain.toFixed(2)}${Math.abs(r.gain - r.idealGain) > 0.05 ? ` (${r.idealGain.toFixed(0)})` : ''}` : '-'}</td>
							<td>{r.ok ? r.opamps : '-'}</td>
							<td>{r.ok ? (r.outputs === 'quadrature' ? 'sine and cosine' : 'one') : '-'}</td>
							<td>{r.ok ? `${(100 * r.thd).toFixed(2)} %` : '-'}</td>
							<td>{r.ok && Number.isFinite(r.uncompensatedError) ? pct(r.uncompensatedError) : '-'}</td>
							<td>{r.ok ? pct(r.f0Error, 2) : '-'}</td>
							<td class:bad={r.ok && !r.starts}>{r.ok ? (r.starts ? (Number.isFinite(r.growthPerCycle) ? pct(r.growthPerCycle) + '/cycle' : 'yes') : r.jfetMinAmplitude ? `JFET needs ${formatVolts(r.jfetMinAmplitude)}` : 'no') : 'not realizable'}</td>
							<td>{r.ok && Number.isFinite(r.fMax) ? formatHz(r.fMax) : '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			</div>

			<h3>The verdict</h3>
			<p class="note">
				<strong>Build the Wien bridge unless there is a specific reason not to.</strong> It needs a gain of 3,
				the lowest here by a wide margin, and that number decides how much the op-amp's lag matters: with this part
				the textbook values land {wienRow && Number.isFinite(wienRow.uncompensatedError) ? pct(wienRow.uncompensatedError) : '-'} off before the retune, where the single-op-amp phase shift lands
				{rows.find((r) => r.id === 'phaseShift') && Number.isFinite(rows.find((r) => r.id === 'phaseShift').uncompensatedError) ? pct(rows.find((r) => r.id === 'phaseShift').uncompensatedError) : 'nowhere'}.
				It is also the only one whose distortion can genuinely be driven down, because its amplitude control
				sits in a leg of its own: a lamp or a JFET measures 0.1 to 0.2 percent, where diodes inside the signal path
				sit near one percent whatever is done to them. One op-amp, four passive parts, and one resistor pair to tune.
			</p>
			<p class="note">
				<strong>Two reasons to pick something else.</strong> A sine and a cosine at once come free from the
				quadrature oscillator, which asks for a gain of only 1 and holds its amplitude with a damping clamp
				that the integrators filter before it reaches either output; the price is three op-amps. Frequency that
				has to hold still against drift favours the Bubba: four sections make the loop phase change fastest
				with frequency, which pins the frequency down best, and its taps are in quadrature too.
			</p>
			<p class="note">
				<strong>The two phase-shift versions are here mainly to be understood.</strong> The single-op-amp one
				is the classic textbook circuit and uses the fewest parts, but a gain of 29 is a hard demand: its
				amplifier lags about ten times more than the Wien bridge's at the same frequency, and the limiter diodes'
				capacitance across its large feedback resistor adds to that, which is why it stops starting well below
				the others. The buffered version drops the gain to 8 for two more op-amps, at which point a Bubba costs
				one more and gives better stability and quadrature outputs.
			</p>
			{#if currentRow && currentRow.jfetMinAmplitude}
				<p class="flag warn">
					With JFET control the Wien bridge needs at least {formatVolts(currentRow.jfetMinAmplitude)} peak; at this amplitude diode limiting or
					the lamp holds it.
				</p>
			{:else if currentRow && !currentRow.starts}
				<p class="flag warn">
					The topology selected above does not start with this op-amp at this frequency. The table shows which ones do.
				</p>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">06</span>
				<h2>Download</h2>
			</div>
			<div class="row downloads">
				<button type="button" disabled={!!exportError} onclick={() => save(generateSchematic(design), `${stem}.asc`)}>Download {stem}.asc (LTspice)</button>
				<button type="button" disabled={!!exportError} onclick={() => save(generateNetlist(design), `${stem}.cir`)}>Download {stem}.cir (netlist)</button>
			</div>
			{#if exportError}
				<p class="flag bad">
					Nothing to export: {design.limiter.kind === 'jfet' && !design.limiter.regulates
						? `the JFET control cannot be sized at ${formatVolts(amplitude)} peak, so its parts do not exist yet. From ${formatVolts(design.limiter.minAmplitude)} the download is available.`
						: `the amplitude control could not be sized for this design (${exportError.replace(/^no export: /, '')}).`}
				</p>
			{/if}
			<p class="note">
				The .asc is a drawn schematic with these values and the amplitude control as real devices: the diodes are the model the design was sized against, the AGC's
				JFET is a SPICE JFET, and the lamp is a resistor that heats up. The run starts from an initial condition
				at the design amplitude, so the limiter only has to hold it, and the log (Ctrl+L after Run) reports
				fosc, the realized frequency, and vpk, the amplitude, next to the .four distortion. The op-amp is the
				ideal single-pole model with its gain-bandwidth set to the value entered here, so the frequency it
				reports is the one predicted above, and lowering the gain-bandwidth on the sheet shows the lag doing
				its work.
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
