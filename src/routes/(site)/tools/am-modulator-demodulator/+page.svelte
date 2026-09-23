<script>
	import BasicsPanel from '$lib/components/BasicsPanel.svelte';
	import AmWaveDemo from '$lib/components/basics/AmWaveDemo.svelte';
	import DiodeBendDemo from '$lib/components/basics/DiodeBendDemo.svelte';
	import EnvelopeDetectorDemo from '$lib/components/basics/EnvelopeDetectorDemo.svelte';
	import JfetKnobDemo from '$lib/components/basics/JfetKnobDemo.svelte';
	import ConductancePlot from '$lib/components/ConductancePlot.svelte';
	import DiagramView from '$lib/components/DiagramView.svelte';
	import { modulationBasics } from '$lib/modulation/basics';
	import Equation from '$lib/components/Equation.svelte';
	import MathPanel from '$lib/components/MathPanel.svelte';
	import TimePlot from '$lib/components/TimePlot.svelte';
	import { modulationIndexFromEnvelope, modulationQuality, powerEfficiency } from '$lib/modulation/amMath';
	import {
		buildBiasSummerDiagram,
		buildCarrierDividerDiagram,
		buildDiodeTankDiagram,
		buildEnvelopeLowPassDiagram,
		buildGainStageDiagram,
		buildJfetGainCellDiagram,
		buildJfetInvertingCellDiagram,
		buildPrecisionRectifierDiagram,
		buildSummerDiagram
	} from '$lib/modulation/circuits';
	import { generateDemodScript, generateDiodeScript, generateJfetScript } from '$lib/modulation/codegen';
	import {
		explainAmBasics,
		explainCarrierPath,
		explainConditioningChain,
		explainInvertingCell,
		explainDiodeModulator,
		explainEnvelopeFilter,
		explainJfetGainCell,
		explainJfetModel,
		explainJfetPhysics,
		explainOpampLimits,
		explainRectifier
	} from '$lib/modulation/explain';
	import { designDiodeMixerModulator } from '$lib/modulation/diodeMixerModulator';
	import { designEnvelopeLowPass } from '$lib/modulation/envelopeFilter';
	import { formatFarads, formatHenries, formatHz, formatOhms, formatVolts } from '$lib/modulation/format';
	import { compareTopologies, conductanceDepth, designJfetModulator } from '$lib/modulation/jfetModulator';
	import { generateNetlist as generateModNetlist, generateSchematic as generateModSchematic } from '$lib/modulation/spice';
	import { buildOscillatorDiagram } from '$lib/oscillator/circuits';
	import { designOscillator } from '$lib/oscillator/topologies';
	import { fitModel, IDSS_WARNING, JFET_PRESETS, modelFromIdss, modelFromRdsOn, parseMeasurements } from '$lib/modulation/jfetModel';
	import { designHalfWaveRectifier, designPrecisionRectifier, rectifiedEnvelopeStats } from '$lib/modulation/rectifier';
	import { amSignal, envelope as envelopeWave, rectify } from '$lib/modulation/waveform';

	let mode = $state('jfet'); // 'jfet' | 'diode' | 'demod'

	// ------------------------------------------------------------------
	// JFET modulator
	// ------------------------------------------------------------------
	let jfetMode = $state('idss'); // 'idss' | 'rdson' | 'measured'
	let vp = $state(-4);
	let idssMa = $state(5);
	let rdsOn = $state(400);
	let measurementText = $state(
		['-0.5  0.2  0.0627  1000', '-1.0  0.2  0.0695  1000', '-1.5  0.2  0.0780  1000', '-2.0  0.2  0.0889  1000', '-2.5  0.2  0.1032  1000', '-3.0  0.2  0.1231  1000', '-3.5  0.2  0.1524  1000'].join(String.fromCharCode(10))
	);
	let windowLow = $state(-3.5);
	let windowHigh = $state(-0.5);
	let presetNote = $state('');
	let swingFraction = $state(0.9);
	let targetN = $state(0.85);
	let sourceAmplitude = $state(1);
	let fmMin = $state(100);
	let vcc = $state(12);
	// carrier and op-amp: these decide whether the cell works at all, so
	// they are design inputs, not preview settings
	let fp = $state(55000);
	// which cell: the JFET in the feedback divider (one op-amp, n diluted by
	// 1/(1+x)) or as the input resistor (n = s exactly, small x, more op-amps)
	let topology = $state('noninverting');
	let targetOutputAmplitude = $state(1);
	let carrierBuffer = $state(true);
	// the carrier can come from a generator on the bench, or from an
	// oscillator built onto the same board; the Wien bridge is the one that
	// asks least of the op-amp, which is what matters at a fast carrier
	let carrierFrom = $state('source'); // 'source' | 'wien'
	let carrierSourceAmplitude = $state(1);
	let carrierMargin = $state(0.5);
	let opampSwing = $state(10.5);
	let gbwMhz = $state(3);
	let slewRateVus = $state(13);
	let fmPreview = $state(1000);

	const idss = $derived(idssMa / 1000);
	const measuredPoints = $derived(jfetMode === 'measured' ? parseMeasurements(measurementText) : []);
	// one straight line G(VGS), whatever it was built from
	const jfetModel = $derived.by(() => {
		if (jfetMode === 'idss') return modelFromIdss(vp, idss);
		if (jfetMode === 'rdson') return modelFromRdsOn(vp, rdsOn);
		return fitModel(measuredPoints, { low: windowLow, high: windowHigh });
	});
	// the ceiling of n for this line and swing; null when the swing pinches the channel off
	const depthCeiling = $derived(jfetModel ? conductanceDepth(jfetModel, swingFraction) : null);
	const jfetValid = $derived(
		jfetModel !== null && depthCeiling !== null && swingFraction > 0 && swingFraction <= 1 && targetN > 0 && targetN < depthCeiling && fp > 0 && gbwMhz > 0 && slewRateVus > 0 && opampSwing > 0
	);

	function applyPreset(name) {
		const pr = JFET_PRESETS[name];
		jfetMode = 'rdson';
		vp = (pr.vpRange[0] + pr.vpRange[1]) / 2;
		rdsOn = pr.rdsOnMax;
		presetNote = `${name} datasheet limits: V_P between ${pr.vpRange[0]} V and ${pr.vpRange[1]} V (set to the middle, ${vp} V), I_DSS at least ${pr.idssMin * 1000} mA, r_DS(on) at most ${pr.rdsOnMax} Ω (set to that maximum). A real part is usually better than these limits, and V_P in particular has to be measured.`;
	}

	const jfetDesign = $derived.by(() =>
		jfetValid
			? designJfetModulator({
					model: jfetModel,
					topology,
					targetOutputAmplitude,
					carrierBuffer,
					swingFraction,
					targetModulationIndex: targetN,
					sourceAmplitude,
					fmMin,
					vcc,
					fp,
					// an on-board oscillator delivers what its limiter settles at, not the target
					carrierSourceAmplitude: carrierFrom === 'wien' && carrierOscillator?.limiter.amplitudeActual ? carrierOscillator.limiter.amplitudeActual : carrierSourceAmplitude,
					carrierMargin,
					opampSwing,
					gbw: gbwMhz * 1e6,
					slewRate: slewRateVus * 1e6
				})
			: null
	);

	// when the carrier is generated on board, it is designed at the same
	// frequency and amplitude the modulator expects to be fed
	const carrierOscillator = $derived.by(() =>
		carrierFrom === 'wien' && jfetValid
			? designOscillator({
					topology: 'wien',
					stabilizer: 'diodes',
					frequency: fp,
					amplitude: carrierSourceAmplitude,
					gbw: gbwMhz * 1e6,
					slewRate: slewRateVus * 1e6,
					opampSwing
				})
			: null
	);

	// both cells on the same JFET, carrier and op-amp, for the side-by-side table
	const topologyRows = $derived.by(() =>
		jfetValid
			? compareTopologies({
					model: jfetModel,
					targetOutputAmplitude,
					carrierBuffer,
					swingFraction,
					targetModulationIndex: targetN,
					sourceAmplitude,
					fmMin,
					vcc,
					fp,
					// an on-board oscillator delivers what its limiter settles at, not the target
					carrierSourceAmplitude: carrierFrom === 'wien' && carrierOscillator?.limiter.amplitudeActual ? carrierOscillator.limiter.amplitudeActual : carrierSourceAmplitude,
					carrierMargin,
					opampSwing,
					gbw: gbwMhz * 1e6,
					slewRate: slewRateVus * 1e6
				})
			: []
	);

	// the preview shows what the last op-amp actually delivers: the carrier
	// amplitude at the output, and the modulation index after the crest loss
	const jfetPreview = $derived.by(() => {
		if (!jfetDesign || !(fmPreview > 0)) return null;
		const duration = 4 / fmPreview;
		const amplitude = jfetDesign.postGain ? jfetDesign.postGain.outputAmplitude : jfetDesign.carrier.carrierOut;
		return amSignal(fp, fmPreview, amplitude, jfetDesign.opamp.effectiveModulationIndex, duration);
	});

	function saveFile(text, filename) {
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

	function downloadJfet() {
		if (!jfetDesign) return;
		download(
			generateJfetScript({
				mode: jfetMode,
				vp: jfetModel.vp,
				idss: jfetModel.idss,
				rdsOn: jfetModel.rdsOn,
				measurements: jfetMode === 'measured' ? measuredPoints.map((pt) => [pt.vgs, pt.rds]) : null,
				windowLow,
				windowHigh,
				topology,
				targetOutputAmplitude,
				carrierBuffer,
				swingFraction,
				targetModulationIndex: targetN,
				rb: null,
				sourceAmplitude,
				fmMin,
				vcc,
				fp,
				carrierSourceAmplitude,
				carrierMargin,
				opampSwing,
				gbw: gbwMhz * 1e6,
				slewRate: slewRateVus * 1e6
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

	<BasicsPanel
		blocks={modulationBasics({
			mode,
			topology,
			carrierFrom,
			rectifierType,
			design: jfetDesign,
			jfetModel,
			swingFraction,
			targetN,
			fp: mode === 'jfet' ? fp : mode === 'diode' ? fpDiode : fpCarrierDemod,
			fm: mode === 'jfet' ? fmPreview : mode === 'diode' ? fmMaxDiode : fmMaxDemod,
			diodeDesign,
			carrierAmp,
			modAmp,
			envelopeDesign,
			demoModIndex,
			rippleHz,
			amaxDb,
			aminDb
		})}
		widgets={{ 'am-wave': AmWaveDemo, 'jfet-knob': JfetKnobDemo, 'diode-bend': DiodeBendDemo, envelope: EnvelopeDetectorDemo }}
		minutes={7}
	/>

	{#if mode === 'jfet'}
		<section class="panel">
			<div class="panel-head">
				<span class="num">01</span>
				<h2>JFET characteristics</h2>
				<span class="hint">{jfetMode === 'measured' ? 'fitted to measurements' : 'datasheet or measured pair'}</span>
			</div>
			<div class="grid">
				<div class="field">
					<label for="jmode">Where the numbers come from</label>
					<select id="jmode" bind:value={jfetMode}>
						<option value="idss">V_P and I_DSS</option>
						<option value="rdson">V_P and r_DS(on)</option>
						<option value="measured">Measured points (fit a line)</option>
					</select>
				</div>
				<div class="field">
					<label for="preset">Datasheet preset (limits, not typicals)</label>
					<div class="row presets">
						{#each Object.keys(JFET_PRESETS) as name (name)}
							<button type="button" class="small" onclick={() => applyPreset(name)}>{name}</button>
						{/each}
					</div>
				</div>
				{#if jfetMode !== 'measured'}
					<div class="field">
						<label for="vp">VP - pinch-off voltage (V)</label>
						<input id="vp" type="number" step="0.1" max="-0.01" bind:value={vp} />
					</div>
				{/if}
				{#if jfetMode === 'idss'}
					<div class="field">
						<label for="idss">IDSS - drain current at VGS=0 (mA)</label>
						<input id="idss" type="number" step="0.1" min="0.01" bind:value={idssMa} />
					</div>
				{:else if jfetMode === 'rdson'}
					<div class="field">
						<label for="rdson">r_DS(on) - channel at VGS=0 (Ω)</label>
						<input id="rdson" type="number" step="1" min="0.1" bind:value={rdsOn} />
					</div>
				{/if}
				<div class="field">
					<label for="swing">Swing fraction {jfetMode === 'measured' ? '(of the window half-width)' : '(of the |VP|/2 range)'}</label>
					<input id="swing" type="number" step="0.05" min="0.05" max="1" bind:value={swingFraction} />
				</div>
				<div class="field">
					<label for="n">Target modulation index n</label>
					<input id="n" type="number" step="0.05" min="0.05" max="1" bind:value={targetN} />
				</div>
			</div>

			{#if presetNote}
				<p class="note">{presetNote}</p>
			{/if}

			{#if jfetMode === 'measured'}
				<div class="measure">
					<div class="field grow">
						<label for="meas">Measured rows: <code>VGS rDS</code> (V, Ω) or <code>VGS Vin VD Rseries</code> (V, V, V, Ω)</label>
						<textarea id="meas" rows="6" bind:value={measurementText}></textarea>
					</div>
					<div class="grid narrow">
						<div class="field">
							<label for="wlo">Fit window, low VGS (V)</label>
							<input id="wlo" type="number" step="0.1" bind:value={windowLow} />
						</div>
						<div class="field">
							<label for="whi">Fit window, high VGS (V)</label>
							<input id="whi" type="number" step="0.1" bind:value={windowHigh} />
						</div>
					</div>
				</div>
				<p class="note">
					Four columns describe the divider measurement: V_in through R_series into the drain,
					V_D read at the drain, source grounded, gate at V_GS; the tool computes r_DS = R_series
					V_D / (V_in - V_D). Keep V_D small (a few tenths of a volt at most) so the part stays in
					the ohmic region. The window picks the straight stretch the design is allowed to use:
					its middle becomes the bias point, its half-width the maximum swing.
				</p>
				{#if measuredPoints.length > 0}
					<ConductancePlot points={measuredPoints} fit={jfetModel?.fit ?? null} vp={jfetModel?.vp ?? null} />
				{/if}
				{#if jfetModel?.fit}
					<table>
						<tbody>
							<tr><td>Points used / read</td><td>{jfetModel.fit.count} / {measuredPoints.length}</td></tr>
							<tr><td>Fitted V_P (line crosses zero)</td><td>{formatVolts(jfetModel.vp)}</td></tr>
							<tr><td>Slope beta</td><td>{(jfetModel.beta * 1000).toFixed(4)} mS/V</td></tr>
							<tr><td>Implied I_DSS / r_DS(on)</td><td>{(jfetModel.idss * 1000).toFixed(2)} mA / {formatOhms(jfetModel.rdsOn)}</td></tr>
							<tr><td>R² / largest deviation from the line</td><td>{jfetModel.fit.r2.toFixed(4)} / {(100 * jfetModel.fit.maxDev).toFixed(1)} % at {formatVolts(jfetModel.fit.maxDevAt)}</td></tr>
							<tr><td>Bias point (window middle) / max swing</td><td>{formatVolts(jfetModel.vc)} / ±{formatVolts(jfetModel.halfRange)}</td></tr>
						</tbody>
					</table>
					{#if jfetModel.fit.crossesZero}
						<p class="flag bad">The window's low edge ({formatVolts(jfetModel.fit.low)}) is at or past the fitted V_P ({formatVolts(jfetModel.vp)}): the line says the channel is closed there. Raise the low edge.</p>
					{/if}
					{#if jfetModel.fit.maxDev > 0.05}
						<p class="flag warn">The conductance is not straight over this window ({(100 * jfetModel.fit.maxDev).toFixed(0)} % off at {formatVolts(jfetModel.fit.maxDevAt)}): narrow the window to the straight part, or check that point.</p>
					{/if}
				{:else if measuredPoints.length > 0}
					<p class="flag bad">Fewer than two points inside the window, or the conductance does not rise with V_GS: widen the window or check the rows.</p>
				{:else}
					<p class="flag bad">No readable rows yet. One measurement per line, numbers separated by spaces or commas.</p>
				{/if}
			{/if}

			<p class="note">
				{IDSS_WARNING} JFET parameters vary a lot between individual parts, so a measured line beats
				any datasheet figure.
			</p>
			{#if jfetModel && !jfetValid}
				<p class="flag bad">
					{#if depthCeiling === null}
						The swing pinches the channel off: lower the swing fraction or narrow the window.
					{:else if targetN >= depthCeiling}
						The target modulation index cannot exceed {depthCeiling.toFixed(3)} with this swing (n never reaches the conductance depth s): lower n, or widen the swing.
					{:else}
						Check the carrier frequency and the op-amp figures below: all must be positive.
					{/if}
				</p>
			{:else if !jfetModel && jfetMode !== 'measured'}
				<p class="flag bad">VP must be negative and {jfetMode === 'idss' ? 'IDSS' : 'r_DS(on)'} positive.</p>
			{/if}
			<MathPanel blocks={explainJfetModel(jfetModel)} summary="Show the math for the characterization" />
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">02</span>
				<h2>Sources and op-amp</h2>
				<span class="hint">TL08x: 3 MHz, 13 V/us</span>
			</div>
			<div class="grid">
				<div class="field">
					<label for="src">Message source amplitude (V)</label>
					<input id="src" type="number" step="0.1" min="0.01" bind:value={sourceAmplitude} />
				</div>
				<div class="field">
					<label for="fmMin">Lowest modulating frequency (Hz)</label>
					<input id="fmMin" type="number" step="10" min="1" bind:value={fmMin} />
				</div>
				<div class="field">
					<label for="fp">Carrier frequency fp (Hz)</label>
					<input id="fp" type="number" step="1000" min="1" bind:value={fp} />
				</div>
				<div class="field">
					<label for="cfrom">Carrier comes from</label>
					<select id="cfrom" bind:value={carrierFrom}>
						<option value="source">An external generator</option>
						<option value="wien">A Wien bridge oscillator on the board</option>
					</select>
				</div>
				<div class="field">
					<label for="csrc">Carrier source amplitude (V)</label>
					<input id="csrc" type="number" step="0.1" min="0.01" bind:value={carrierSourceAmplitude} />
				</div>
				<div class="field">
					<label for="vcc">Supply rail Vcc (V)</label>
					<input id="vcc" type="number" step="1" min="1" bind:value={vcc} />
				</div>
				<div class="field">
					<label for="swingOut">Op-amp output swing (V)</label>
					<input id="swingOut" type="number" step="0.5" min="0.5" bind:value={opampSwing} />
				</div>
				<div class="field">
					<label for="gbw">Op-amp gain-bandwidth (MHz)</label>
					<input id="gbw" type="number" step="0.5" min="0.1" bind:value={gbwMhz} />
				</div>
				<div class="field">
					<label for="sr">Op-amp slew rate (V/us)</label>
					<input id="sr" type="number" step="1" min="0.1" bind:value={slewRateVus} />
				</div>
				<div class="field">
					<label for="kmargin">Carrier margin k (fraction of the triode limit)</label>
					<input id="kmargin" type="number" step="0.05" min="0.05" max="1" bind:value={carrierMargin} />
				</div>
				<div class="field">
					<label for="topo">Gain cell topology</label>
					<select id="topo" bind:value={topology}>
						<option value="noninverting">Non-inverting: JFET in the feedback (1 op-amp)</option>
						<option value="inverting">Inverting: JFET as input resistor (follower + cell + post-gain)</option>
					</select>
				</div>
				{#if topology === 'inverting'}
					<div class="field">
						<label for="vtarget">Target output amplitude (V)</label>
						<input id="vtarget" type="number" step="0.1" min="0.05" bind:value={targetOutputAmplitude} />
					</div>
					<div class="field">
						<label for="buf">Carrier follower before the channel</label>
						<select id="buf" bind:value={carrierBuffer}>
							<option value={true}>Yes (recommended)</option>
							<option value={false}>No, divider drives the channel</option>
						</select>
					</div>
				{/if}
			</div>
			<p class="note">
				The output swing is what the op-amp reaches on this supply, about Vcc minus 1.5 V for a
				TL08x. The carrier frequency is a design input here, not a preview setting: it is what the
				op-amp has to keep up with, at the highest gain the message drives the cell to. The
				non-inverting cell needs a large x to reach a deep modulation, which is what the op-amp
				struggles with at a fast carrier; the inverting cell reaches n = s with a small x, at the
				cost of two more op-amps. The comparison table below puts the two side by side.
			</p>
		</section>

		{#if jfetDesign}
			<section class="panel">
				<div class="panel-head">
					<span class="num">03</span>
					<h2>Gain cell</h2>
					<span class="hint">{jfetDesign.topology === 'inverting' ? 'inverting, n = s' : 'non-inverting'}, n = {jfetDesign.modulationIndex.toFixed(3)}</span>
				</div>
				{#if jfetDesign.topology === 'inverting'}
					<DiagramView diagram={buildJfetInvertingCellDiagram({ r2: jfetDesign.r2 })} label="JFET inverting gain cell with its carrier follower" />
				{:else}
					<DiagramView diagram={buildJfetGainCellDiagram({ rb: jfetDesign.rb })} label="JFET gain cell" />
				{/if}
				<table>
					<tbody>
						<tr><td>Bias point V_C</td><td>{formatVolts(jfetDesign.vc)}</td></tr>
						<tr><td>Channel resistance at V_C</td><td>{formatOhms(jfetDesign.r1AtCenter)}</td></tr>
						<tr><td>Feedback resistor {jfetDesign.topology === 'inverting' ? 'R_2' : 'R_b'}</td><td>{formatOhms(jfetDesign.feedback)} (x = {jfetDesign.x.toFixed(3)})</td></tr>
						<tr><td>Gate swing V_GS</td><td>{formatVolts(jfetDesign.vgsMin)} to {formatVolts(jfetDesign.vgsMax)}</td></tr>
						<tr><td>Channel resistance range</td><td>{formatOhms(jfetDesign.r1Min)} to {formatOhms(jfetDesign.r1Max)}</td></tr>
						<tr><td>Signal gain: trough / bias / crest</td><td>{jfetDesign.gainMin.toFixed(2)} / {jfetDesign.nominalGain.toFixed(2)} / {jfetDesign.gainMax.toFixed(2)}</td></tr>
						{#if jfetDesign.topology === 'inverting'}
							<tr><td>Noise gain the op-amp sees: trough / crest</td><td>{jfetDesign.opamp.kTrough.toFixed(2)} / {jfetDesign.opamp.kCrest.toFixed(2)}</td></tr>
						{/if}
						<tr><td>Modulation index n</td><td>{jfetDesign.modulationIndex.toFixed(3)} ({modulationQuality(jfetDesign.modulationIndex)}){jfetDesign.topology === 'inverting' ? ', equal to the conductance depth s' : ''}</td></tr>
					</tbody>
				</table>
				{#if jfetDesign.topology === 'inverting'}
					<p class="flag {jfetDesign.buffer.enabled ? 'ok' : 'bad'}">
						{#if jfetDesign.buffer.enabled}
							With the follower the channel is driven from {formatOhms(jfetDesign.buffer.zOut)}: n effective {jfetDesign.buffer.withBuffer.effectiveModulationIndex.toFixed(3)}, THD {(100 * jfetDesign.buffer.withBuffer.thd).toFixed(2)} % from the source impedance alone. Without it the divider's {formatOhms(jfetDesign.buffer.dividerImpedance)} would give n {jfetDesign.buffer.withoutBuffer.effectiveModulationIndex.toFixed(3)} and {(100 * jfetDesign.buffer.withoutBuffer.thd).toFixed(1)} % THD.
						{:else}
							The divider's {formatOhms(jfetDesign.buffer.dividerImpedance)} adds to the channel ({(100 * jfetDesign.buffer.crestErrorWithout).toFixed(0)} % of r_DS at the crest): n effective {jfetDesign.buffer.withoutBuffer.effectiveModulationIndex.toFixed(3)} and {(100 * jfetDesign.buffer.withoutBuffer.thd).toFixed(1)} % THD. Add the follower.
						{/if}
					</p>
				{/if}
				<MathPanel blocks={[...explainJfetPhysics(jfetDesign), ...(jfetDesign.topology === 'inverting' ? explainInvertingCell(jfetDesign) : explainJfetGainCell(jfetDesign))]} />
			</section>

			{#if jfetDesign.postGain?.needed}
				<section class="panel">
					<div class="panel-head">
						<span class="num">03b</span>
						<h2>Post-gain stage</h2>
						<span class="hint">fixed gain {jfetDesign.postGain.kActual.toFixed(2)}, level only</span>
					</div>
					<DiagramView diagram={buildGainStageDiagram({ rtop: jfetDesign.postGain.rtop, rbottom: jfetDesign.postGain.rbottom })} label="post-gain stage" />
					<table>
						<tbody>
							<tr><td>Cell output carrier K_0 A_c</td><td>{formatVolts(jfetDesign.carrier.carrierOut)}</td></tr>
							<tr><td>Gain needed for {formatVolts(jfetDesign.postGain.target)}</td><td>{jfetDesign.postGain.kTarget.toFixed(2)}, R_top {formatOhms(jfetDesign.postGain.rtop)} / R_bottom {formatOhms(jfetDesign.postGain.rbottom)} gives {jfetDesign.postGain.kActual.toFixed(2)}</td></tr>
							<tr><td>Loss at f_p (constant, no envelope effect)</td><td>{jfetDesign.postGain.factor.toFixed(4)}, f_p K / GBW = {jfetDesign.postGain.gbwRatio.toFixed(2)}</td></tr>
							<tr><td>Output carrier / envelope max</td><td>{formatVolts(jfetDesign.postGain.outputAmplitude)} / {formatVolts(jfetDesign.postGain.envelopeMax)}</td></tr>
							<tr><td>Slew needed</td><td>{(jfetDesign.postGain.slewNeeded / 1e6).toFixed(2)} V/us</td></tr>
						</tbody>
					</table>
					{#if !jfetDesign.postGain.swingOk}
						<p class="flag bad">The envelope crest exceeds the op-amp swing: lower the target output amplitude.</p>
					{/if}
					{#if !jfetDesign.postGain.slewOk}
						<p class="flag bad">The post-gain stage needs more than half the op-amp's slew rate: lower the target output amplitude or the carrier.</p>
					{/if}
				</section>
			{/if}

			<section class="panel">
				<div class="panel-head">
					<span class="num">04</span>
					<h2>Carrier path</h2>
					<span class="hint">A_c = {formatVolts(jfetDesign.carrier.ac)}, set by the {jfetDesign.carrier.limit === 'triode' ? 'triode region' : 'op-amp swing'}</span>
				</div>
				<DiagramView diagram={buildCarrierDividerDiagram(jfetDesign.carrier.divider)} label="carrier attenuator" />
				<table>
					<tbody>
						<tr><td>Triode limit V_GS,min - V_P</td><td>{formatVolts(jfetDesign.carrier.vdsSat)} (carrier at most {formatVolts(jfetDesign.carrier.acTriode)} with margin k = {jfetDesign.carrier.margin})</td></tr>
						<tr><td>Op-amp limit V_out,max / K_max</td><td>{formatVolts(jfetDesign.carrier.acOpamp)}</td></tr>
						<tr><td>Carrier amplitude A_c delivered</td><td>{formatVolts(jfetDesign.carrier.ac)} from {formatVolts(jfetDesign.carrier.sourceAmplitude)}{jfetDesign.carrier.divider.top > 0 ? `, divider ${formatOhms(jfetDesign.carrier.divider.top)} / ${formatOhms(jfetDesign.carrier.divider.bottom)}` : ', no divider needed'}</td></tr>
						<tr><td>Output carrier K_0 A_c</td><td>{formatVolts(jfetDesign.carrier.carrierOut)}</td></tr>
						<tr><td>Envelope min / max</td><td>{formatVolts(jfetDesign.carrier.envelopeMin)} / {formatVolts(jfetDesign.carrier.envelopeMax)}</td></tr>
						<tr><td>JFET and op-amp peak current</td><td>{(jfetDesign.carrier.jfetPeakCurrent * 1000).toFixed(2)} mA</td></tr>
						<tr><td>V_DS² term: DC offset and tone at 2 f_p</td><td>{(jfetDesign.carrier.tone2fp * 1000).toFixed(1)} mV, {jfetDesign.carrier.tone2fpDbc.toFixed(1)} dBc at {formatHz(jfetDesign.carrier.tone2fpHz)}</td></tr>
					</tbody>
				</table>
				{#if jfetDesign.carrier.jfetPeakCurrent > 0.01}
					<p class="flag warn">Peak output current above 10 mA: lower the carrier margin or use a JFET with a smaller I_DSS.</p>
				{/if}
				<MathPanel blocks={explainCarrierPath(jfetDesign)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">05</span>
					<h2>Op-amp limits at the carrier</h2>
					<span class="hint">f_p K_max / GBW = {jfetDesign.opamp.gbwRatio.toFixed(2)}</span>
				</div>
				<table>
					<tbody>
						<tr><td>Closed-loop bandwidth: trough / bias / crest</td><td>{formatHz(jfetDesign.opamp.bwTrough)} / {formatHz(jfetDesign.opamp.bwNominal)} / {formatHz(jfetDesign.opamp.bwCrest)}</td></tr>
						<tr><td>Gain factor at f_p: trough / bias / crest</td><td>{jfetDesign.opamp.factorTrough.toFixed(4)} / {jfetDesign.opamp.factorNominal.toFixed(3)} / {jfetDesign.opamp.factorCrest.toFixed(3)}</td></tr>
						<tr><td>Modulation index: designed / effective / read from the peaks</td><td>{jfetDesign.modulationIndex.toFixed(3)} / {jfetDesign.opamp.effectiveModulationIndex.toFixed(3)} / {jfetDesign.opamp.peakModulationIndex.toFixed(3)}</td></tr>
						<tr><td>Audio distortion from the crest loss (THD)</td><td>{(100 * jfetDesign.opamp.thd).toFixed(2)} %</td></tr>
						<tr><td>Slew needed / available</td><td>{(jfetDesign.opamp.slewNeeded / 1e6).toFixed(2)} V/us / {(jfetDesign.opamp.slewRate / 1e6).toFixed(0)} V/us</td></tr>
						<tr><td>Op-amps in the modulator</td><td>{jfetDesign.opamp.opampCount} (gate-drive summer included)</td></tr>
					</tbody>
				</table>
				{#if jfetDesign.opamp.gbwOk}
					<p class="flag ok">Within the gain-bandwidth rule of thumb (f_p K_max / GBW at or below 0.2): the crest loses {(100 * (1 - jfetDesign.opamp.factorCrest)).toFixed(1)} %.</p>
				{:else if jfetDesign.opamp.rbLimit}
					<p class="flag warn">
						At {formatHz(fp)} this op-amp cannot follow a noise gain of {jfetDesign.opamp.kCrest.toFixed(1)}: the crest loses
						{(100 * (1 - jfetDesign.opamp.factorCrest)).toFixed(0)} % and the recovered audio carries
						{(100 * jfetDesign.opamp.thd).toFixed(1)} % THD. Set {jfetDesign.topology === 'inverting' ? 'R_2' : 'R_b'} to {formatOhms(jfetDesign.opamp.rbLimit)}
						({jfetDesign.topology === 'inverting' ? 'n stays at' : 'n becomes'} {jfetDesign.opamp.nAtLimit.toFixed(3)}), or use a faster op-amp or a lower carrier.
					</p>
				{:else}
					<p class="flag bad">At {formatHz(fp)} no feedback resistor brings the noise gain under the gain-bandwidth limit with this op-amp: a faster op-amp or a lower carrier is needed.</p>
				{/if}
				{#if topologyRows.length === 2}
					<h3>Both cells on this JFET, carrier and op-amp</h3>
					<table class="compare">
						<thead>
							<tr>
								<th></th>
								<th>Non-inverting</th>
								<th>Inverting</th>
							</tr>
						</thead>
						<tbody>
							{#each [['Modulation index n (designed)', (r) => (r.ok ? r.n.toFixed(3) : 'not realizable')], ['n effective after the crest loss', (r) => (r.ok ? r.nEffective.toFixed(3) : '')], ['Noise gain at the crest K_max', (r) => (r.ok ? r.kCrest.toFixed(1) : '')], ['Closed-loop bandwidth at the crest', (r) => (r.ok ? formatHz(r.bwCrest) : '')], ['f_p K_max / GBW', (r) => (r.ok ? r.gbwRatio.toFixed(2) + (r.gbwRatio > 0.2 ? ' (over)' : '') : '')], ['Audio THD from the envelope', (r) => (r.ok ? (100 * r.thd).toFixed(2) + ' %' : '')], ['Output carrier amplitude', (r) => (r.ok ? formatVolts(r.carrierOut) : '')], ['Feedback resistor', (r) => (r.ok ? formatOhms(r.feedback) : '')], ['Op-amps', (r) => (r.ok ? String(r.opampCount) : '')]] as [name, cell] (name)}
								<tr>
									<td>{name}</td>
									<td>{cell(topologyRows[0])}</td>
									<td>{cell(topologyRows[1])}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<p class="note">
						Same JFET line, same swing, same carrier and op-amp. The non-inverting row uses the
						target n above; the inverting row's n is the conductance depth s itself, since that
						cell cannot dilute it. Where the non-inverting cell exceeds the gain-bandwidth rule,
						its R_b suggestion above trades n for a clean envelope; the inverting cell keeps n and
						pays in op-amps.
					</p>
				{/if}
				{#if !jfetDesign.opamp.slewOk}
					<p class="flag bad">Slew rate: the output needs {(jfetDesign.opamp.slewNeeded / 1e6).toFixed(2)} V/us, more than half of the {(jfetDesign.opamp.slewRate / 1e6).toFixed(0)} V/us available. Lower the carrier amplitude or frequency.</p>
				{/if}
				<MathPanel blocks={explainOpampLimits(jfetDesign)} />
			</section>

			{#if carrierOscillator}
				<section class="panel">
					<div class="panel-head">
						<span class="num">05b</span>
						<h2>Carrier oscillator</h2>
						<span class="hint">Wien bridge at {formatHz(carrierOscillator.f0)}</span>
					</div>
					<DiagramView diagram={buildOscillatorDiagram(carrierOscillator)} label="Wien bridge carrier oscillator" />
					<table>
						<tbody>
							<tr><td>Frequency: wanted / predicted with this op-amp</td><td>{formatHz(fp)} / {formatHz(carrierOscillator.f0)} ({(100 * carrierOscillator.f0Error).toFixed(2)} %)</td></tr>
							<tr><td>R and C (two of each)</td><td>{formatOhms(carrierOscillator.r)}, {formatFarads(carrierOscillator.c)}</td></tr>
							<tr><td>Feedback: Rf1 / Rf2 / Rg</td><td>{formatOhms(carrierOscillator.parts.rf1)} / {formatOhms(carrierOscillator.parts.rf2)} / {formatOhms(carrierOscillator.rg)}</td></tr>
							<tr><td>Output amplitude</td><td>about {formatVolts(carrierOscillator.limiter.amplitudeActual)} peak, into the divider above</td></tr>
							<tr><td>Gain needed / set / limited</td><td>{carrierOscillator.requiredGain.toFixed(2)} / {carrierOscillator.startGain.toFixed(2)} / {carrierOscillator.limiter.gainLimited.toFixed(2)}</td></tr>
							<tr><td>Distortion on the carrier</td><td>about {(100 * carrierOscillator.thd).toFixed(1)} %</td></tr>
							<tr><td>Op-amp lag at the carrier, and what it does</td><td>{carrierOscillator.opamp.lagDeg.toFixed(1)} degrees: the textbook RC would land {(100 * carrierOscillator.uncompensatedError).toFixed(1)} % off, so RC is retuned {(100 * carrierOscillator.retunePercent).toFixed(1)} %</td></tr>
						</tbody>
					</table>
					{#if carrierOscillator.opamp.opampOk}
						<p class="flag ok">
							The Wien bridge is the right choice here for one reason: it needs a gain of only 3, so at
							{formatHz(fp)} this op-amp lags it by only {carrierOscillator.opamp.lagDeg.toFixed(1)} degrees, which the retuned RC absorbs.
							A phase-shift oscillator would need a gain of 29 and would not start at this frequency at all.
						</p>
					{:else}
						<p class="flag warn">
							At {formatHz(fp)} even a Wien bridge is past what this op-amp holds{Number.isFinite(carrierOscillator.opamp.fMax) ? ` (the textbook values would land 10 % low at ${formatHz(carrierOscillator.opamp.fMax)})` : ''}.
							Use a faster part for the oscillator, or feed the carrier from a generator.
						</p>
					{/if}
					<p class="note">
						Carrier distortion is not the same problem as message distortion: the harmonics of the carrier
						land at 2 f_p and above, far from the sidebands, and the demodulator's low-pass removes them.
						A percent or so here is harmless, which is why diode limiting is enough and the oscillator
						needs nothing more elaborate. The <a href="/tools/oscillator/">Sine Oscillator Design</a> tool
						has the other topologies and the reasoning behind that choice.
					</p>
				</section>
			{/if}

			<section class="panel">
				<div class="panel-head">
					<span class="num">06</span>
					<h2>Gate drive</h2>
					<span class="hint">one inverting summer: gain, DC block and bias</span>
				</div>
				<DiagramView diagram={buildBiasSummerDiagram(jfetDesign.conditioning.summer)} label="gate-drive summer" />
				<table>
					<tbody>
						<tr><td>R_f</td><td>{formatOhms(jfetDesign.conditioning.summer.rf)}</td></tr>
						<tr><td>R_ac (sets the gain R_f / R_ac)</td><td>{formatOhms(jfetDesign.conditioning.summer.rac)}, gain {jfetDesign.conditioning.summer.gainActual.toFixed(3)} (target {jfetDesign.conditioning.summer.gainTarget.toFixed(3)})</td></tr>
						<tr><td>R_bias (from +Vcc, sets the bias)</td><td>{formatOhms(jfetDesign.conditioning.summer.rbias)}, bias {formatVolts(jfetDesign.conditioning.summer.biasActual)} (target {formatVolts(-jfetDesign.conditioning.summer.biasTarget)})</td></tr>
						<tr><td>C (blocks DC, high-pass with R_ac)</td><td>{formatFarads(jfetDesign.conditioning.summer.c)}, corner {formatHz(jfetDesign.conditioning.summer.fcActual)} (target {formatHz(jfetDesign.conditioning.summer.fcTarget)})</td></tr>
						<tr><td>Most negative gate voltage delivered</td><td>{formatVolts(jfetDesign.conditioning.summer.outMin)} (op-amp swing ±{formatVolts(jfetDesign.conditioning.summer.opampSwing)})</td></tr>
					</tbody>
				</table>
				{#if !jfetDesign.conditioning.summer.headroomOk}
					<p class="flag bad">The summer cannot reach {formatVolts(jfetDesign.conditioning.summer.outMin)} on this supply: raise Vcc or use a JFET with a smaller |V_P|.</p>
				{/if}
				<MathPanel blocks={explainConditioningChain(jfetDesign)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">07</span>
					<h2>Preview</h2>
					<span class="hint">what the op-amp delivers, crest loss included</span>
				</div>
				<div class="grid">
					<div class="field">
						<label for="fmPrev">Modulating frequency (Hz, preview only)</label>
						<input id="fmPrev" type="number" step="100" min="1" bind:value={fmPreview} />
					</div>
				</div>
				{#if jfetPreview}
					<TimePlot series={[{ t: jfetPreview.t, y: jfetPreview.y, color: 'var(--blue)' }]} unit="ms" />
				{/if}
				<p class="note">Power efficiency at the effective modulation index: eta = {(powerEfficiency(jfetDesign.opamp.effectiveModulationIndex) * 100).toFixed(2)}%.</p>
				<MathPanel blocks={explainAmBasics(jfetDesign.opamp.effectiveModulationIndex)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">08</span>
					<h2>Download</h2>
				</div>
				<p class="note">A standalone script with this exact design, parameterized at the top, runnable with <code>node jfet-am-modulator.js</code>.</p>
				<div class="row downloads">
					<button type="button" onclick={downloadJfet}>Download jfet-am-modulator.js</button>
					<button type="button" onclick={() => saveFile(generateModSchematic({ design: jfetDesign, fmPreview, oscillator: carrierOscillator }), 'jfet-am-modulator.asc')}>Download .asc (LTspice)</button>
					<button type="button" onclick={() => saveFile(generateModNetlist({ design: jfetDesign, fmPreview, oscillator: carrierOscillator }), 'jfet-am-modulator.cir')}>Download .cir (netlist)</button>
				</div>
				<p class="note">
					The LTspice files carry the whole modulator: the gate-drive summer, the carrier path{carrierOscillator ? ' with its oscillator' : ''},
					and the gain cell, with a transient run at {formatHz(fmPreview)} already set up. The JFET goes in as a
					real SPICE device rather than the straight line this page designs against (Vto = V_P, Beta = I_DSS / V_P&sup2;
					give the same curve), and the op-amps carry the gain-bandwidth entered above. That is the point of
					simulating it: the crest compression and the distortion predicted in section 05 come from those two
					departures from the ideal, and the transient shows them directly. Plot V(vout), and V(vgate) for the gate drive.
					The .asc is drawn wire by wire{carrierOscillator ? ', the oscillator as its own block underneath, joined to the divider by the label vcar' : ''}. The run holds the coupling capacitor at
					its steady-state charge so the gate bias is right from the first cycle, and, with the oscillator on board, starts
					the carrier at full amplitude and saves the four message periods after it has settled. The index measured from
					the carrier peaks in that run should read about {jfetDesign.opamp.peakModulationIndex.toFixed(3)}: the V_DS squared term lifts every
					peak by the same amount, crest and trough alike, which is why it sits a little under the envelope's own figure.
				</p>
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
						<tr><td>Resonant frequency f0 (actual)</td><td>{formatHz(diodeDesign.f0Actual)} ({diodeDesign.detuning >= 0 ? '+' : ''}{((100 * diodeDesign.detuning) / diodeDesign.fp).toFixed(2)} % from the carrier)</td></tr>
						<tr><td>Tank bandwidth (target / actual)</td><td>{formatHz(diodeDesign.bandwidth)} / {formatHz(diodeDesign.bwActual)}</td></tr>
						<tr><td>Band actually passed</td><td>{formatHz(diodeDesign.bandLow)} to {formatHz(diodeDesign.bandHigh)}</td></tr>
						<tr><td>Q (target / actual)</td><td>{diodeDesign.q.toFixed(2)} / {diodeDesign.qActual.toFixed(2)}</td></tr>
						<tr><td>L</td><td>{formatHenries(diodeDesign.inductance)}</td></tr>
						<tr><td>C</td><td>{diodeDesign.capacitors.length === 2 ? `${formatFarads(diodeDesign.capacitors[0])} in parallel with ${formatFarads(diodeDesign.capacitors[1])} = ${formatFarads(diodeDesign.capacitance)}` : formatFarads(diodeDesign.capacitance)}</td></tr>
						<tr><td>R (sets the bandwidth)</td><td>{formatOhms(diodeDesign.resistance)}</td></tr>
						{#if diodeDesign.requiredBias}
							<tr><td>Required DC bias</td><td>{formatVolts(diodeDesign.requiredBias)}</td></tr>
						{/if}
					</tbody>
				</table>
				{#if diodeDesign.sidebandsInBand}
					<p class="flag ok">Both sidebands, {formatHz(diodeDesign.fp - diodeDesign.fmMax)} and {formatHz(diodeDesign.fp + diodeDesign.fmMax)}, sit inside the band the tank passes.</p>
				{:else}
					<p class="flag bad">The band the tank passes does not hold both sidebands at {formatHz(diodeDesign.fp - diodeDesign.fmMax)} and {formatHz(diodeDesign.fp + diodeDesign.fmMax)}. A larger sideband margin widens it.</p>
				{/if}
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
			<MathPanel blocks={explainRectifier(rectifierType, fpCarrierDemod)} />
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

	.compare th {
		text-align: left;
		font-weight: 600;
		color: var(--textDim);
		font-size: 0.8rem;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}

	h3 {
		font-size: 0.95rem;
		margin: 1.2rem 0 0.5rem;
	}

	.downloads {
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-bottom: 0.9rem;
	}

	.presets {
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.measure {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1rem;
		align-items: start;
		margin-bottom: 0.9rem;
	}

	.measure textarea {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.8rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		background: var(--surface);
		color: var(--text);
		resize: vertical;
	}

	.measure textarea:focus {
		outline: none;
		border-color: var(--blue);
	}

	.grid.narrow {
		grid-template-columns: 1fr;
	}

	@media (max-width: 720px) {
		.measure {
			grid-template-columns: 1fr;
		}
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
