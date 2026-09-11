<script>
	import DiagramView from '$lib/components/DiagramView.svelte';
	import Equation from '$lib/components/Equation.svelte';
	import MathPanel from '$lib/components/MathPanel.svelte';
	import TimePlot from '$lib/components/TimePlot.svelte';
	import { modulationIndexFromEnvelope, modulationQuality, powerEfficiency } from '$lib/modulation/amMath';
	import {
		buildDiodeTankDiagram,
		buildDividerDiagram,
		buildEnvelopeLowPassDiagram,
		buildGainStageDiagram,
		buildHighPassDiagram,
		buildJfetGainCellDiagram,
		buildPrecisionRectifierDiagram,
		buildSummerDiagram
	} from '$lib/modulation/circuits';
	import { generateDemodScript, generateDiodeScript, generateJfetScript } from '$lib/modulation/codegen';
	import {
		explainAmBasics,
		explainConditioningChain,
		explainDiodeModulator,
		explainEnvelopeFilter,
		explainJfetGainCell,
		explainJfetPhysics,
		explainRectifier
	} from '$lib/modulation/explain';
	import { designDiodeMixerModulator } from '$lib/modulation/diodeMixerModulator';
	import { designEnvelopeLowPass } from '$lib/modulation/envelopeFilter';
	import { formatFarads, formatHenries, formatHz, formatOhms, formatVolts } from '$lib/modulation/format';
	import { designJfetModulator } from '$lib/modulation/jfetModulator';
	import { designHalfWaveRectifier, designPrecisionRectifier, rectifiedEnvelopeStats } from '$lib/modulation/rectifier';
	import { amSignal, envelope as envelopeWave, rectify } from '$lib/modulation/waveform';

	let mode = $state('jfet'); // 'jfet' | 'diode' | 'demod'

	// ------------------------------------------------------------------
	// JFET modulator
	// ------------------------------------------------------------------
	let vp = $state(-4);
	let idssMa = $state(5);
	let swingFraction = $state(0.9);
	let targetN = $state(0.85);
	let sourceAmplitude = $state(1);
	let fmMin = $state(100);
	let vcc = $state(12);
	let fpPreview = $state(40000);
	let fmPreview = $state(1000);

	const idss = $derived(idssMa / 1000);
	const jfetValid = $derived(vp < 0 && idss > 0 && swingFraction > 0 && swingFraction <= 1 && targetN > 0 && targetN < swingFraction);
	const jfetDesign = $derived.by(() =>
		jfetValid
			? designJfetModulator({ vp, idss, swingFraction, targetModulationIndex: targetN, sourceAmplitude, fmMin, vcc })
			: null
	);

	const jfetPreview = $derived.by(() => {
		if (!jfetDesign || !(fmPreview > 0) || !(fpPreview > 0)) return null;
		const duration = 4 / fmPreview;
		return amSignal(fpPreview, fmPreview, jfetDesign.nominalGain, jfetDesign.modulationIndex, duration);
	});

	function downloadJfet() {
		if (!jfetDesign) return;
		download(
			generateJfetScript({
				vp,
				idss,
				swingFraction,
				targetModulationIndex: targetN,
				rb: null,
				sourceAmplitude,
				fmMin,
				vcc
			}),
			'jfet-am-modulator.js'
		);
	}

	// ------------------------------------------------------------------
	// Diode + resonant-tank modulator
	// ------------------------------------------------------------------
	let fpDiode = $state(40000);
	let fmMaxDiode = $state(1000);
	let sidebandMargin = $state(1.2);
	let carrierAmp = $state(1);
	let modAmp = $state(1);
	let diodeVf = $state(0.7);
	let biasMargin = $state(0.3);
	let inductanceMh = $state(1);

	const inductance = $derived(inductanceMh / 1000);
	const diodeValid = $derived(fpDiode > 0 && fmMaxDiode > 0 && fmMaxDiode < fpDiode / 2 && inductance > 0);
	const diodeDesign = $derived.by(() =>
		diodeValid
			? designDiodeMixerModulator({
					fp: fpDiode,
					fmMax: fmMaxDiode,
					sidebandMargin,
					carrierAmplitude: carrierAmp,
					modAmplitude: modAmp,
					diodeVf,
					biasMargin,
					inductance
				})
			: null
	);

	function downloadDiode() {
		if (!diodeDesign) return;
		download(
			generateDiodeScript({
				fp: fpDiode,
				fmMax: fmMaxDiode,
				sidebandMargin,
				carrierAmplitude: carrierAmp,
				modAmplitude: modAmp,
				diodeVf,
				biasMargin,
				inductance
			}),
			'diode-tank-am-modulator.js'
		);
	}

	// ------------------------------------------------------------------
	// Demodulator (rectifier + envelope low-pass)
	// ------------------------------------------------------------------
	let rectifierType = $state('full');
	let fpCarrierDemod = $state(40000);
	let fmMaxDemod = $state(1000);
	let amaxDb = $state(1);
	let aminDb = $state(40);
	let response = $state('butterworth');
	let orderOverride = $state(null);
	let demoModIndex = $state(0.9);

	const rippleHz = $derived(rectifierType === 'full' ? 2 * fpCarrierDemod : fpCarrierDemod);
	const demodValid = $derived(fmMaxDemod > 0 && rippleHz > fmMaxDemod && amaxDb > 0 && aminDb > amaxDb);
	const envelopeDesign = $derived.by(() =>
		demodValid
			? designEnvelopeLowPass({ response, amaxDb, aminDb, fp: fmMaxDemod, fs: rippleHz, order: orderOverride })
			: null
	);
	const rectifierInfo = $derived(rectifierType === 'full' ? designPrecisionRectifier({}) : designHalfWaveRectifier({}));
	const rectStats = $derived(rectifiedEnvelopeStats(1, fpCarrierDemod, rectifierType));

	const demodPreview = $derived.by(() => {
		const duration = 4 / fmMaxDemod;
		const source = amSignal(fpCarrierDemod, fmMaxDemod, 1, demoModIndex, duration, 6000);
		const rectified = rectify(source, rectifierType);
		const env = envelopeWave(fmMaxDemod, rectStats.average, demoModIndex, duration, 6000);
		const envNeg = envelopeWave(fmMaxDemod, rectStats.average, demoModIndex, duration, 6000, -1);
		return { source, rectified, env, envNeg };
	});

	function downloadDemod() {
		if (!envelopeDesign) return;
		download(
			generateDemodScript({
				rectifierType,
				fpCarrier: fpCarrierDemod,
				fmMax: fmMaxDemod,
				amaxDb,
				aminDb,
				order: orderOverride,
				response
			}),
			'am-demodulator.js'
		);
	}

	function download(code, filename) {
		const blob = new Blob([code], { type: 'text/javascript' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}
</script>

<svelte:head>
	<title>AM Modulator/Demodulator Design · rbt56</title>
	<meta
		name="description"
		content="Design AM modulator and demodulator circuits: a JFET voltage-controlled-resistor modulator, a diode plus resonant-tank modulator, and a precision-rectifier envelope demodulator."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 03</p>
	<h1>AM Modulator / Demodulator Design</h1>
	<p class="lead">
		Three real circuits for amplitude modulation: a JFET used as a voltage-controlled resistor to
		build a variable-gain modulator, a diode plus a resonant tank exploiting nonlinear mixing, and
		a precision-rectifier envelope detector to recover the modulating signal.
	</p>

	<div class="modeSwitch">
		<button type="button" class:active={mode === 'jfet'} onclick={() => (mode = 'jfet')}>JFET modulator</button>
		<button type="button" class:active={mode === 'diode'} onclick={() => (mode = 'diode')}>Diode + tank modulator</button>
		<button type="button" class:active={mode === 'demod'} onclick={() => (mode = 'demod')}>Demodulator</button>
	</div>

	{#if mode === 'jfet'}
		<section class="panel">
			<div class="panel-head">
				<span class="num">01</span>
				<h2>JFET characteristics</h2>
				<span class="hint">measured or datasheet</span>
			</div>
			<div class="grid">
				<div class="field">
					<label for="vp">VP - pinch-off voltage (V)</label>
					<input id="vp" type="number" step="0.1" max="-0.01" bind:value={vp} />
				</div>
				<div class="field">
					<label for="idss">IDSS - drain current at VGS=0 (mA)</label>
					<input id="idss" type="number" step="0.1" min="0.01" bind:value={idssMa} />
				</div>
				<div class="field">
					<label for="swing">Swing fraction (of the |VP|/2 range)</label>
					<input id="swing" type="number" step="0.05" min="0.05" max="1" bind:value={swingFraction} />
				</div>
				<div class="field">
					<label for="n">Target modulation index n</label>
					<input id="n" type="number" step="0.05" min="0.05" max="1" bind:value={targetN} />
				</div>
			</div>
			<p class="note">
				Characterizing the actual JFET first (I_DS vs V_GS at fixed V_D, and I_DS vs V_D at fixed
				V_GS) beats trusting a datasheet's typical value - JFET parameters vary a lot between
				individual parts.
			</p>
			{#if !jfetValid}
				<p class="flag bad">VP must be negative, IDSS positive, and the target modulation index must be below the swing fraction.</p>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">02</span>
				<h2>Source and conditioning</h2>
			</div>
			<div class="grid">
				<div class="field">
					<label for="src">Source amplitude (V)</label>
					<input id="src" type="number" step="0.1" min="0.01" bind:value={sourceAmplitude} />
				</div>
				<div class="field">
					<label for="fmMin">Lowest modulating frequency (Hz)</label>
					<input id="fmMin" type="number" step="10" min="1" bind:value={fmMin} />
				</div>
				<div class="field">
					<label for="vcc">Supply rail Vcc (V)</label>
					<input id="vcc" type="number" step="1" min="1" bind:value={vcc} />
				</div>
			</div>
		</section>

		{#if jfetDesign}
			<section class="panel">
				<div class="panel-head">
					<span class="num">03</span>
					<h2>Gain cell</h2>
					<span class="hint">n = {jfetDesign.modulationIndex.toFixed(3)}</span>
				</div>
				<DiagramView diagram={buildJfetGainCellDiagram({ rb: jfetDesign.rb })} label="JFET gain cell" />
				<table>
					<tbody>
						<tr><td>Bias point V_C = V_P/2</td><td>{formatVolts(jfetDesign.vc)}</td></tr>
						<tr><td>Channel resistance at V_C</td><td>{formatOhms(jfetDesign.r1AtCenter)}</td></tr>
						<tr><td>Feedback resistor R_b</td><td>{formatOhms(jfetDesign.rb)}</td></tr>
						<tr><td>Gate swing V_GS</td><td>{formatVolts(jfetDesign.vgsMin)} to {formatVolts(jfetDesign.vgsMax)}</td></tr>
						<tr><td>Channel resistance range</td><td>{formatOhms(jfetDesign.r1Min)} to {formatOhms(jfetDesign.r1Max)}</td></tr>
						<tr><td>Nominal (unmodulated) gain K0</td><td>{jfetDesign.nominalGain.toFixed(3)}</td></tr>
						<tr><td>Modulation index n</td><td>{jfetDesign.modulationIndex.toFixed(3)} ({modulationQuality(jfetDesign.modulationIndex)})</td></tr>
					</tbody>
				</table>
				<MathPanel blocks={[...explainJfetPhysics(), ...explainJfetGainCell(jfetDesign)]} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">04</span>
					<h2>Signal conditioning chain</h2>
					<span class="hint">source -&gt; gain -&gt; HPF -&gt; summer -&gt; gate</span>
				</div>
				<div class="diagramGrid">
					<div>
						<p class="note">1. Gain stage</p>
						<DiagramView diagram={buildGainStageDiagram(jfetDesign.conditioning.gain)} label="gain stage" />
					</div>
					<div>
						<p class="note">2. DC-blocking high-pass</p>
						<DiagramView diagram={buildHighPassDiagram(jfetDesign.conditioning.hpf)} label="high-pass filter" />
					</div>
					<div>
						<p class="note">3. Bias divider (off Vcc)</p>
						<DiagramView diagram={buildDividerDiagram(jfetDesign.conditioning.divider)} label="bias divider" />
					</div>
					<div>
						<p class="note">4. Summer (AC signal + DC bias)</p>
						<DiagramView diagram={buildSummerDiagram({ inputs: ['x_m(t) (AC)', 'V_bias (DC)'], r: jfetDesign.conditioning.summer.r })} label="summer" />
					</div>
				</div>
				<MathPanel blocks={explainConditioningChain(jfetDesign)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">05</span>
					<h2>Preview</h2>
				</div>
				<div class="grid">
					<div class="field">
						<label for="fpPrev">Carrier frequency (Hz, preview only)</label>
						<input id="fpPrev" type="number" step="1000" min="1" bind:value={fpPreview} />
					</div>
					<div class="field">
						<label for="fmPrev">Modulating frequency (Hz, preview only)</label>
						<input id="fmPrev" type="number" step="100" min="1" bind:value={fmPreview} />
					</div>
				</div>
				{#if jfetPreview}
					<TimePlot series={[{ t: jfetPreview.t, y: jfetPreview.y, color: 'var(--blue)' }]} unit="ms" />
				{/if}
				<p class="note">Power efficiency at this modulation index: eta = {(powerEfficiency(jfetDesign.modulationIndex) * 100).toFixed(2)}%.</p>
				<MathPanel blocks={explainAmBasics()} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">06</span>
					<h2>Download</h2>
				</div>
				<p class="note">A standalone script with this exact design, parameterized at the top, runnable with <code>node jfet-am-modulator.js</code>.</p>
				<button type="button" onclick={downloadJfet}>Download jfet-am-modulator.js</button>
				<p class="note formula-link">
					Every formula this design used: <a href="/tools/am-modulator-demodulator/formulas/">Formula sheet</a>.
				</p>
			</section>
		{/if}
	{:else if mode === 'diode'}
		<section class="panel">
			<div class="panel-head">
				<span class="num">01</span>
				<h2>Carrier and modulating band</h2>
			</div>
			<div class="grid">
				<div class="field">
					<label for="fpd">Carrier frequency fp (Hz)</label>
					<input id="fpd" type="number" step="1000" min="1" bind:value={fpDiode} />
				</div>
				<div class="field">
					<label for="fmd">Highest modulating frequency (Hz)</label>
					<input id="fmd" type="number" step="10" min="1" bind:value={fmMaxDiode} />
				</div>
				<div class="field">
					<label for="margin">Sideband margin (&gt;= 1)</label>
					<input id="margin" type="number" step="0.1" min="1" bind:value={sidebandMargin} />
				</div>
				<div class="field">
					<label for="ind">Tank inductor L (mH)</label>
					<input id="ind" type="number" step="0.1" min="0.001" bind:value={inductanceMh} />
				</div>
				<div class="field">
					<label for="ap">Carrier amplitude (V)</label>
					<input id="ap" type="number" step="0.1" min="0.01" bind:value={carrierAmp} />
				</div>
				<div class="field">
					<label for="am">Modulating amplitude (V)</label>
					<input id="am" type="number" step="0.1" min="0.01" bind:value={modAmp} />
				</div>
				<div class="field">
					<label for="vf">Diode forward voltage Vf (V)</label>
					<input id="vf" type="number" step="0.05" min="0.1" bind:value={diodeVf} />
				</div>
				<div class="field">
					<label for="bm">Bias margin (V)</label>
					<input id="bm" type="number" step="0.05" min="0" bind:value={biasMargin} />
				</div>
			</div>
			{#if !diodeValid}
				<p class="flag bad">fp and the modulating frequency must be positive, with fp &gt; 2 x fmMax (carrier well above the modulating band).</p>
			{/if}
		</section>

		{#if diodeDesign}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Summer and resonant tank</h2>
					<span class="hint">Q = {diodeDesign.q.toFixed(2)}</span>
				</div>
				<DiagramView diagram={buildSummerDiagram({ inputs: ['x_p(t)', 'x_m(t)', 'V_DC (bias)'], r: 10000 })} label="carrier + modulant + bias summer" />
				<DiagramView diagram={buildDiodeTankDiagram({ l: diodeDesign.inductance, c: diodeDesign.capacitance, r: diodeDesign.resistance })} label="diode and resonant tank" />
				<table>
					<tbody>
						<tr><td>Resonant frequency f0 (actual)</td><td>{formatHz(diodeDesign.f0Actual)}</td></tr>
						<tr><td>Tank bandwidth (target)</td><td>{formatHz(diodeDesign.bandwidth)}</td></tr>
						<tr><td>Q (target / actual)</td><td>{diodeDesign.q.toFixed(2)} / {diodeDesign.qActual.toFixed(2)}</td></tr>
						<tr><td>L</td><td>{formatHenries(diodeDesign.inductance)}</td></tr>
						<tr><td>C</td><td>{formatFarads(diodeDesign.capacitance)}</td></tr>
						<tr><td>R (sets Q)</td><td>{formatOhms(diodeDesign.resistance)}</td></tr>
						{#if diodeDesign.requiredBias}
							<tr><td>Required DC bias</td><td>{formatVolts(diodeDesign.requiredBias)}</td></tr>
						{/if}
					</tbody>
				</table>
				<MathPanel blocks={explainDiodeModulator(diodeDesign)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">03</span>
					<h2>Download</h2>
				</div>
				<p class="note">A standalone script with this exact design, runnable with <code>node diode-tank-am-modulator.js</code>.</p>
				<button type="button" onclick={downloadDiode}>Download diode-tank-am-modulator.js</button>
				<p class="note formula-link">
					Every formula this design used: <a href="/tools/am-modulator-demodulator/formulas/">Formula sheet</a>.
				</p>
			</section>
		{/if}
	{:else}
		<section class="panel">
			<div class="panel-head">
				<span class="num">01</span>
				<h2>Rectifier and spec</h2>
			</div>
			<div class="grid">
				<div class="field">
					<label for="rtype">Rectifier</label>
					<select id="rtype" bind:value={rectifierType}>
						<option value="full">Precision full-wave (2 op-amps)</option>
						<option value="half">Half-wave (1 diode)</option>
					</select>
				</div>
				<div class="field">
					<label for="fpc">Carrier frequency fp (Hz)</label>
					<input id="fpc" type="number" step="1000" min="1" bind:value={fpCarrierDemod} />
				</div>
				<div class="field">
					<label for="fmc">Highest modulating frequency (Hz)</label>
					<input id="fmc" type="number" step="10" min="1" bind:value={fmMaxDemod} />
				</div>
				<div class="field">
					<label for="damax">Amax - passband ripple (dB)</label>
					<input id="damax" type="number" step="0.1" min="0.01" bind:value={amaxDb} />
				</div>
				<div class="field">
					<label for="damin">Amin - carrier-ripple attenuation (dB)</label>
					<input id="damin" type="number" step="1" min="0.01" bind:value={aminDb} />
				</div>
				<div class="field">
					<label for="dresponse">Response</label>
					<select id="dresponse" bind:value={response}>
						<option value="butterworth">Butterworth</option>
						<option value="chebyshev">Chebyshev I</option>
					</select>
				</div>
				<div class="field">
					<label for="dn">Modulation index (preview only)</label>
					<input id="dn" type="number" step="0.05" min="0.05" max="1" bind:value={demoModIndex} />
				</div>
			</div>
			<p class="note">Residual ripple sits at {formatHz(rippleHz)} ({rectifierType === 'full' ? '2 x fp, full-wave' : 'fp, half-wave'}).</p>
			{#if !demodValid}
				<p class="flag bad">Need fmMax &gt; 0, the ripple frequency above fmMax, and Amin &gt; Amax &gt; 0.</p>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">02</span>
				<h2>Rectifier</h2>
			</div>
			{#if rectifierType === 'full'}
				<DiagramView diagram={buildPrecisionRectifierDiagram(rectifierInfo)} label="precision full-wave rectifier" />
				<table>
					<tbody>
						<tr><td>R1 = R2 = R3</td><td>{formatOhms(rectifierInfo.r1)}</td></tr>
						<tr><td>Diode</td><td>{rectifierInfo.diode}</td></tr>
					</tbody>
				</table>
			{:else}
				<p class="note">Single diode ({rectifierInfo.diode}) from the modulated signal to the envelope low-pass filter below: y(t) = max(x(t), 0).</p>
			{/if}
			<MathPanel blocks={explainRectifier(rectifierType)} />
		</section>

		{#if envelopeDesign}
			<section class="panel">
				<div class="panel-head">
					<span class="num">03</span>
					<h2>Envelope low-pass filter</h2>
					<span class="hint">order {envelopeDesign.n}</span>
				</div>
				{#each envelopeDesign.realized as stage, i (i)}
					<p class="note">Stage {i + 1}: f0 = {formatHz(stage.actual.wn / (2 * Math.PI))}, Q = {stage.actual.q.toFixed(3)}</p>
					<DiagramView diagram={buildEnvelopeLowPassDiagram(stage.components)} label="envelope low-pass stage {i + 1}" />
					<table>
						<tbody>
							<tr><td>R</td><td>{formatOhms(stage.components.R1)}</td></tr>
							<tr><td>C_top</td><td>{formatFarads(stage.components.Ctop)}</td></tr>
							<tr><td>C_bottom</td><td>{formatFarads(stage.components.Cbottom)}</td></tr>
						</tbody>
					</table>
				{/each}
				<MathPanel blocks={explainEnvelopeFilter(envelopeDesign)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">04</span>
					<h2>Preview</h2>
				</div>
				{#if demodPreview}
					<TimePlot
						series={[
							{ t: demodPreview.source.t, y: demodPreview.source.y, color: 'var(--textFaint)', width: 1 },
							{ t: demodPreview.rectified.t, y: demodPreview.rectified.y, color: 'var(--blue)', width: 1 },
							{ t: demodPreview.env.t, y: demodPreview.env.y, color: 'var(--amber)', width: 2 },
							{ t: demodPreview.envNeg.t, y: demodPreview.envNeg.y, color: 'var(--amber)', width: 2, dash: [4, 3] }
						]}
						unit="ms"
					/>
				{/if}
				<p class="note">Faint: modulated input. Blue: rectified. Amber: recovered envelope (before the low-pass filter smooths the ripple away).</p>
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">05</span>
					<h2>Download</h2>
				</div>
				<p class="note">A standalone script with this exact design, runnable with <code>node am-demodulator.js</code>.</p>
				<button type="button" onclick={downloadDemod}>Download am-demodulator.js</button>
				<p class="note formula-link">
					Every formula this design used: <a href="/tools/am-modulator-demodulator/formulas/">Formula sheet</a>.
				</p>
			</section>
		{/if}
	{/if}
</article>

<style>
	.modeSwitch {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 1.4rem;
		flex-wrap: wrap;
	}

	.modeSwitch button {
		flex: 1;
		min-width: 160px;
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

	.modeSwitch button:active {
		transform: scale(0.95);
	}

	.modeSwitch button.active {
		background: var(--blue);
		border-color: var(--blue);
		color: white;
	}

	.diagramGrid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
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

	.flag {
		padding: 0.6rem 0.9rem;
		border-radius: var(--radiusSmall);
		font-size: 0.9rem;
	}

	.flag.bad {
		background: #fbe9e9;
		color: #9a2f2f;
	}

	.formula-link {
		margin-top: 0.6rem;
	}
</style>
