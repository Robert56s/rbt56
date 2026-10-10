<script>
	import { onMount } from 'svelte';
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
	import OpampPicker from '$lib/components/OpampPicker.svelte';
	import StockPicker from '$lib/components/StockPicker.svelte';
	import TimePlot from '$lib/components/TimePlot.svelte';
	import XYPlot from '$lib/components/basics/XYPlot.svelte';
	import { modulationIndexFromEnvelope, modulationQuality, powerEfficiency } from '$lib/modulation/amMath';
	import {
		buildBiasSummerDiagram,
		buildCarrierDividerDiagram,
		buildDiodeSummerDiagram,
		buildDiodeTankDiagram,
		buildEnvelopeLowPassDiagram,
		buildEnvelopeMfbDiagram,
		buildGainStageDiagram,
		buildHalfWaveDiagram,
		buildJfetGainCellDiagram,
		buildJfetInvertingCellDiagram,
		buildOutputCouplingDiagram,
		buildPrecisionRectifierDiagram
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
		explainJfetSourcing,
		explainOpampLimits,
		explainOutputCoupling,
		explainRectifier
	} from '$lib/modulation/explain';
	import { designDiodeMixerModulator } from '$lib/modulation/diodeMixerModulator';
	import { DIODE_MODELS } from '$lib/modulation/diodeLaw';
	import { designEnvelopeLowPass, envelopeGainDb } from '$lib/modulation/envelopeFilter';
	import { couplingGainAt, designOutputCoupling } from '$lib/modulation/outputCoupling';
	import { pairDiagramLabel, pairLabel } from '$lib/modulation/eseries';
	import { formatFarads, formatHenries, formatHz, formatOhms, formatVolts } from '$lib/modulation/format';
	import { compareTopologies, conductanceDepth, designJfetModulator } from '$lib/modulation/jfetModulator';
	import {
		demodExpectation,
		generateDemodNetlist,
		generateDemodSchematic,
		generateDiodeNetlist,
		generateDiodeSchematic,
		generateNetlist as generateModNetlist,
		generateSchematic as generateModSchematic
	} from '$lib/modulation/spice';
	import { buildOscillatorDiagram } from '$lib/oscillator/circuits';
	import { amplitudeRemark } from '$lib/oscillator/explain';
	import { DEFAULT_OPAMP, OPAMP_MODELS } from '$lib/spice/opamps';
	import { DIODES } from '$lib/oscillator/limiter';
	import { designOscillator } from '$lib/oscillator/topologies';
	import { estimateSeriesR, fitModel, IDSS_WARNING, JFET_PRESETS, modelFromIdss, modelFromRdsOn, parseFixedVds, parseMeasurements, readOutputCurves } from '$lib/modulation/jfetModel';
	import { demodSwing, designHalfWaveRectifier, designPrecisionRectifier, rectifiedEnvelopeStats } from '$lib/modulation/rectifier';
	import { amSignal, envelope as envelopeWave, rectify } from '$lib/modulation/waveform';
	import { componentOptions, defaultStock, isRestricted, loadStock, saveStock } from '$lib/stock';

	let mode = $state('jfet'); // 'jfet' | 'diode' | 'demod'
	// the op-amp the LTspice files use, shared by the three circuits: the
	// ideal single-pole model, or a real part on +/-15 V rails
	let spiceOpamp = $state(DEFAULT_OPAMP);
	const spiceReal = $derived(OPAMP_MODELS[spiceOpamp]?.real ?? false);
	// a real op-amp in the files runs on +/-15 V, whatever supply the page designs for
	const railSwing = $derived(OPAMP_MODELS[spiceOpamp]?.swing ?? Infinity);

	// Which values every part is rounded to, for the three circuits alike: a
	// series, the lab drawer or the user's own list, shared with the filter
	// tool and kept in this browser (src/lib/stock.js); with a list, the
	// parts that set a figure may be two resistors in series (pairs)
	const initialStock = defaultStock();
	let stock = $state(initialStock.stock);
	let resistorText = $state(initialStock.resistorText);
	let capacitorText = $state(initialStock.capacitorText);
	let pairs = $state(initialStock.pairs);
	let stockLoaded = $state(false);
	const parts = $derived(componentOptions(stock, resistorText, capacitorText, pairs));
	const E24_PARTS = { resistorSeries: 'E24', capacitors: null, pairs: false };
	const restricted = $derived(isRestricted(stock));
	onMount(() => {
		const saved = loadStock();
		if (saved) {
			if (saved.stock) stock = saved.stock;
			if (saved.resistorText !== undefined) resistorText = saved.resistorText;
			if (saved.capacitorText !== undefined) capacitorText = saved.capacitorText;
			if (saved.pairs !== undefined) pairs = saved.pairs;
		}
		stockLoaded = true;
	});
	$effect(() => {
		const state = { stock, resistorText, capacitorText, pairs };
		if (stockLoaded) saveStock(state);
	});
	// a resistor as the tables print it: its value, then the two in series
	// it is built from when it is a pair. `own` is false for a part shown
	// from the E24 fallback, whose values say nothing about the list
	const ohms = (value, own = true) => pairLabel(value, parts.resistorSeries, formatOhms, parts.pairs && own);
	// the schematics' version, handed to the diagram builders: a pair by its
	// two parts in short form ("56k + 8.2k"), under the same `own` rule
	const diagramOhms = (own = true) => (value) => pairDiagramLabel(value, parts.resistorSeries, formatOhms, parts.pairs && own);

	// ------------------------------------------------------------------
	// JFET modulator
	// ------------------------------------------------------------------
	// the page opens on a bench case: a low-resistance JFET read point by
	// point (about 13 to 21 ohm from -0.5 V to -3 V), a 50 kHz carrier from a
	// Wien bridge on the board, a 4 MHz, 16 V/us op-amp on +/-15 V rails
	let jfetMode = $state('measured'); // 'idss' | 'rdson' | 'measured' | 'fixedvds'
	let vp = $state(-4);
	let idssMa = $state(5);
	let rdsOn = $state(400);
	let measurementText = $state(
		['-0.5  0.2  0.0026  1000', '-1.0  0.2  0.0029  1000', '-1.5  0.2  0.0031  1000', '-2.0  0.2  0.0034  1000', '-2.5  0.2  0.0037  1000', '-3.0  0.2  0.0041  1000'].join(String.fromCharCode(10))
	);
	// the fixed-V_DS method: the drain held at a fixed V_DS, the current
	// read on an ammeter; the example rows are a J111 read at 0.2 V in 0.5 V
	// gate steps, padded so the columns line up
	let fixedVds = $state(0.2);
	let seriesR = $state(0);
	let fixedText = $state(
		[' 0.0   2.60', '-0.5   2.53', '-1.0   2.46', '-1.5   2.39', '-2.0   2.32', '-2.5   2.25', '-3.0   2.16', '-3.5   2.07', '-4.0   1.95', '-4.5   1.83', '-5.0   1.68', '-5.5   1.50', '-6.0   1.24', '-6.5   0.85', '-7.0   0.19', '-7.5   0.00'].join(String.fromCharCode(10))
	);
	// R_s found from the rows themselves (estimateSeriesR), shown with its fit
	let rsEstimate = $state(null);
	// the output curves: I_DS against V_DS at three gate voltages (the same
	// J111, the same bench), rows VGS VDS IDS
	const EXP2 = [
		[0, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6], [0, 5.61, 11.92, 17.8, 23.87, 29.71, 35.4, 41, 46.4, 51.7, 56.6, 60, 59]],
		[-0.5, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5], [0, 5.08, 10.05, 12.06, 17.17, 22.03, 26.64, 33, 39, 43.9, 48.9, 53.7, 58, 61.4]],
		[-1, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6], [0, 5.09, 7.19, 11.8, 16.88, 20.7, 24.8, 30.06, 36.5, 41.3, 46.4, 51.4, 52.1]]
	];
	let exp2Text = $state(EXP2.flatMap(([g, vs, is]) => vs.map((v, k) => `${g.toFixed(1).padStart(4)}  ${v.toFixed(1).padStart(4)}  ${is[k].toFixed(2).padStart(5)}`)).join(String.fromCharCode(10)));
	let windowLow = $state(-7.2);
	let windowHigh = $state(0);
	let presetNote = $state('');
	let presetValues = $state(null);
	// the guide to V_P, I_DSS and r_DS(on) is the same for every design
	const jfetSourcing = explainJfetSourcing();
	let swingFraction = $state(0.9);
	let targetN = $state(0.75);
	let sourceAmplitude = $state(1);
	let fmMin = $state(100);
	let vcc = $state(15);
	// carrier and op-amp: these decide whether the cell works at all, so
	// they are design inputs, not preview settings
	let fp = $state(50000);
	// which cell: the JFET in the feedback divider (one op-amp, n diluted by
	// 1/(1+x)) or as the input resistor (n = s exactly, small x, more op-amps)
	let topology = $state('noninverting');
	let targetOutputAmplitude = $state(1);
	// non-inverting cell: a fixed gain stage after the cell that brings the
	// carrier up to the target amplitude (the inverting cell has it whenever
	// its small output needs it)
	let outputStage = $state(false);
	let carrierBuffer = $state(true);
	// the carrier can come from a generator on the bench, or from an
	// oscillator built onto the same board; the Wien bridge is the one that
	// asks least of the op-amp, which is what matters at a fast carrier
	let carrierFrom = $state('wien'); // 'source' | 'wien'
	let carrierSourceAmplitude = $state(1);
	let carrierMargin = $state(0.15);
	let opampSwing = $state(13.5);
	let gbwMhz = $state(4);
	let slewRateVus = $state(16);
	let fmPreview = $state(1000);

	const idss = $derived(idssMa / 1000);
	// both bench methods end as (VGS, rDS) points and the same fitted line
	const fitted = $derived(jfetMode === 'measured' || jfetMode === 'fixedvds');
	const fixedRead = $derived(jfetMode === 'fixedvds' ? parseFixedVds(fixedText, { vds: fixedVds, rs: seriesR }) : { rows: [], dropped: 0 });
	const measuredPoints = $derived(jfetMode === 'measured' ? parseMeasurements(measurementText) : fixedRead.rows);
	// one straight line G(VGS), whatever it was built from
	const outputCurves = $derived(jfetMode === 'fixedvds' ? readOutputCurves(exp2Text, { rs: seriesR }) : []);
	const CURVE_COLORS = ['var(--blue)', 'var(--green, #2f9e44)', 'var(--amber, #b7791f)', 'var(--red, #c92a2a)', 'var(--textDim)'];

	function estimateRs() {
		const est = estimateSeriesR(fixedText, { vds: fixedVds, low: windowLow, high: windowHigh });
		rsEstimate = est ?? { failed: true };
		if (est) seriesR = Math.round(est.rs * 10) / 10;
	}

	// the fitted conductance line drawn as I_DS(V_DS) curves: the
	// square law below the knee V_GS - V_P, flat above it
	function modelCurve(vgs, vMax) {
		const m = jfetModel;
		if (!m || !(vgs > m.vp)) return null;
		const knee = vgs - m.vp;
		const xs = Array.from({ length: 41 }, (_, k) => (vMax * k) / 40);
		return { xs, ys: xs.map((v) => 1000 * m.beta * (v < knee ? knee * v - (v * v) / 2 : (knee * knee) / 2)) };
	}

	const jfetModel = $derived.by(() => {
		if (jfetMode === 'idss') return modelFromIdss(vp, idss);
		if (jfetMode === 'rdson') return modelFromRdsOn(vp, rdsOn);
		const m = fitModel(measuredPoints, { low: windowLow, high: windowHigh });
		return m && jfetMode === 'fixedvds' ? { ...m, source: 'fixedvds', vds: fixedVds, rs: seriesR > 0 ? seriesR : 0 } : m;
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
		presetValues = { vp, rdsOn };
		presetNote = `${name} datasheet limits: V_P between ${pr.vpRange[0]} V and ${pr.vpRange[1]} V (set to the middle, ${vp} V), I_DSS at least ${pr.idssMin * 1000} mA, r_DS(on) at most ${pr.rdsOnMax} Ω (set to that maximum). A real part is usually better than these limits, and V_P in particular has to be measured.`;
	}

	const jfetParams = $derived({
		model: jfetModel,
		topology,
		targetOutputAmplitude,
		outputStage,
		carrierBuffer,
		swingFraction,
		targetModulationIndex: targetN,
		sourceAmplitude,
		fmMin,
		vcc,
		fp,
		carrierSourceAmplitude: carrierIn,
		carrierMargin,
		opampSwing,
		gbw: gbwMhz * 1e6,
		slewRate: slewRateVus * 1e6,
		...parts
	});
	const jfetDesign = $derived.by(() => (jfetValid ? designJfetModulator(jfetParams) : null));
	// why the rounded parts leave no design: the gate reaching V_P, or a depth short of n
	const jfetFailure = $derived.by(() => {
		if (!jfetValid || jfetDesign) return null;
		let reason = null;
		designJfetModulator({ ...jfetParams, onFail: (r) => (reason = r) });
		return reason;
	});

	// an oscillator that starts and holds its amplitude, inside what the
	// op-amp can swing: a limiter that only takes hold past the rails holds nothing
	const oscillatorWorks = (o) => Boolean(o && o.starts && o.limiter.regulates && o.opamp.swingOk);
	// when the carrier is generated on board, it is designed at the same
	// frequency and amplitude the modulator expects to be fed; a restricted
	// stock that cannot build it falls back to E24 and E6, flagged
	const carrierOscillator = $derived.by(() => {
		if (!(carrierFrom === 'wien' && jfetValid)) return null;
		const osc = (p) => designOscillator({ topology: 'wien', stabilizer: 'diodes', frequency: fp, amplitude: carrierSourceAmplitude, gbw: gbwMhz * 1e6, slewRate: slewRateVus * 1e6, opampSwing, ...p });
		const own = osc(parts);
		if (!restricted || oscillatorWorks(own)) return own;
		const fallback = osc(E24_PARTS);
		return oscillatorWorks(fallback) || !own ? fallback && { ...fallback, stockShortfall: true } : own;
	});
	// the oscillator the files and the divider really get: one that starts and holds its amplitude
	const workingOscillator = $derived(oscillatorWorks(carrierOscillator) ? carrierOscillator : null);
	// what to say when its limiter holds another amplitude than the one asked for
	const carrierRemark = $derived(carrierOscillator ? amplitudeRemark(carrierOscillator) : null);
	// its resistors as the tables print them: never as pairs when it fell back to E24
	const oscOhms = (value) => ohms(value, !carrierOscillator?.stockShortfall);
	// the phase-shift oscillator at the same carrier, for the comparison the carrier panel makes
	const phaseShiftAtFp = $derived(carrierOscillator ? designOscillator({ topology: 'phaseShift', frequency: fp, amplitude: carrierSourceAmplitude, gbw: gbwMhz * 1e6, slewRate: slewRateVus * 1e6, opampSwing }) : null);
	// what an LM741 (1 MHz, 0.5 V/us) makes of this modulator, when it is the part picked
	// (the same R_b or R_2 as the files carry, so it is the exported circuit that is judged)
	const jfetOn741 = $derived(
		spiceOpamp === 'LM741' && jfetDesign
			? designJfetModulator({ ...jfetParams, gbw: 1e6, slewRate: 0.5e6, rb: jfetDesign.rb ?? undefined, r2: jfetDesign.r2 ?? undefined })
			: null
	);
	// the carrier the divider gets: what the on-board oscillator's limiter
	// settles at, which is not quite the amplitude asked of it, or the generator
	const carrierIn = $derived(carrierFrom === 'wien' && workingOscillator?.limiter.amplitudeActual ? workingOscillator.limiter.amplitudeActual : carrierSourceAmplitude);

	// both cells on the same JFET, carrier and op-amp, for the side-by-side table
	const topologyRows = $derived.by(() =>
		jfetValid
			? compareTopologies({
					model: jfetModel,
					targetOutputAmplitude,
					outputStage,
					carrierBuffer,
					swingFraction,
					targetModulationIndex: targetN,
					sourceAmplitude,
					fmMin,
					vcc,
					fp,
					carrierSourceAmplitude: carrierIn,
					carrierMargin,
					opampSwing,
					gbw: gbwMhz * 1e6,
					slewRate: slewRateVus * 1e6,
					...parts
				})
			: []
	);
	// the largest voltage any of the modulator's op-amps puts out
	const jfetPeakOut = $derived(
		jfetDesign ? Math.max(jfetDesign.carrier.envelopeMax, jfetDesign.postGain?.envelopeMax ?? 0, Math.abs(jfetDesign.conditioning.summer.outMin), workingOscillator?.limiter.amplitudeActual ?? 0) : 0
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
				// the fixed-V_DS rows export as measured points: they are already rDS
				mode: fitted ? 'measured' : jfetMode,
				vp: jfetModel.vp,
				idss: jfetModel.idss,
				rdsOn: jfetModel.rdsOn,
				measurements: fitted ? measuredPoints.map((pt) => [pt.vgs, pt.rds]) : null,
				windowLow,
				windowHigh,
				topology,
				targetOutputAmplitude,
				outputStage,
				carrierBuffer,
				swingFraction,
				targetModulationIndex: targetN,
				rb: null,
				sourceAmplitude,
				fmMin,
				vcc,
				fp,
				carrierSourceAmplitude: carrierIn,
				carrierMargin,
				opampSwing,
				gbw: gbwMhz * 1e6,
				slewRate: slewRateVus * 1e6,
				...parts,
				carrierNote: workingOscillator
					? `the carrier comes from the page's Wien bridge (R ${oscOhms(workingOscillator.r)}, C ${formatFarads(workingOscillator.c)}, Rf1 ${oscOhms(workingOscillator.parts.rf1)}, Rf2 ${oscOhms(workingOscillator.parts.rf2)}, Rg ${oscOhms(workingOscillator.rg)}), which settles at the CARRIER_SOURCE_AMPLITUDE below`
					: null
			}),
			'jfet-am-modulator.js'
		);
	}

	// ------------------------------------------------------------------
	// Diode + resonant-tank modulator
	// ------------------------------------------------------------------
	let fpDiode = $state(40000);
	let fmMaxDiode = $state(1000);
	let sidebandMargin = $state(3);
	let carrierAmp = $state(1);
	let modAmp = $state(1);
	let targetNDiode = $state(0.8);
	let carrierDrive = $state(2);
	let vccDiode = $state(12);
	let diodePart = $state('1N4148');
	let inductanceMh = $state(1);

	const inductance = $derived(inductanceMh / 1000);
	const diodeValid = $derived(
		fpDiode > 0 && fmMaxDiode > 0 && fpDiode - sidebandMargin * fmMaxDiode > fmMaxDiode && inductance > 0 && sidebandMargin > 0 && carrierAmp > 0 && modAmp > 0 && targetNDiode > 0 && targetNDiode <= 1 && carrierDrive > 0 && vccDiode > 0
	);
	// the op-amp's reach on this supply, as for a TL08x
	const diodeParams = $derived({
		fp: fpDiode,
		fmMax: fmMaxDiode,
		sidebandMargin,
		inductance,
		carrierAmplitude: carrierAmp,
		modAmplitude: modAmp,
		targetModulationIndex: targetNDiode,
		carrierDrive,
		vcc: vccDiode,
		opampSwing: Math.max(0.5, vccDiode - 1.5),
		diode: diodePart,
		resistorSeries: parts.resistorSeries,
		capacitorStock: parts.capacitors,
		pairs: parts.pairs
	});
	// a restricted stock that reaches no design falls back to E24 and E12, flagged
	const diodeDesign = $derived.by(() => {
		if (!diodeValid) return null;
		const own = designDiodeMixerModulator(diodeParams);
		if (!restricted || (own && own.indexOk)) return own;
		const fallback = designDiodeMixerModulator({ ...diodeParams, resistorSeries: 'E24', capacitorStock: null, pairs: false });
		// the E24 design only when it does better than the stock's own
		if (fallback && (!own || (fallback.indexOk && !own.indexOk))) return { ...fallback, stockShortfall: true };
		return own;
	});
	const diodePreview = $derived.by(() => (diodeDesign ? amSignal(fpDiode, fmMaxDiode, diodeDesign.carrierOut, diodeDesign.indexAtFmMax, 4 / fmMaxDiode) : null));
	// pairs only mean something for the design built from the list itself
	const diodePairs = $derived(parts.pairs && !diodeDesign?.stockShortfall);

	function downloadDiode() {
		if (!diodeDesign) return;
		const stockUsed = diodeDesign.stockShortfall ? { resistorSeries: 'E24', capacitorStock: null, capacitors: null, pairs: false } : { capacitors: parts.capacitors };
		download(generateDiodeScript({ ...diodeParams, ...stockUsed }), 'diode-tank-am-modulator.js');
	}

	// ------------------------------------------------------------------
	// Demodulator (rectifier + envelope low-pass)
	// ------------------------------------------------------------------
	let rectifierType = $state('full');
	let fpCarrierDemod = $state(50000);
	let fmMaxDemod = $state(1000);
	let amaxDb = $state(1);
	let aminDb = $state(40);
	let response = $state('butterworth');
	// the envelope filter's stages: unity-gain Sallen-Key, or MFB (gain -1 each)
	let envelopeTopology = $state('sallenKey');
	let orderOverride = $state(null);
	let demoModIndex = $state(0.75);
	// the carrier the demodulator receives, and what its op-amps can swing
	let demodAmplitude = $state(1);
	let demodOpampSwing = $state(13.5);
	// the output into a load (earphones, an amplifier) through a coupling capacitor
	let outputCoupling = $state(true);
	let loadOhms = $state(32);
	let fmMinDemod = $state(100);

	const rippleHz = $derived(rectifierType === 'full' ? 2 * fpCarrierDemod : fpCarrierDemod);
	// the ripple carries the message as sidebands, the nearest at the ripple
	// frequency minus fmMax: that is where the filter's stopband starts, and
	// it has to sit above the message
	const demodValid = $derived(
		fmMaxDemod > 0 && fmMaxDemod < fpCarrierDemod && rippleHz - fmMaxDemod > fmMaxDemod && amaxDb > 0 && aminDb > amaxDb && demoModIndex > 0 && demoModIndex <= 1 && demodAmplitude > 0 && demodOpampSwing > 0
	);
	const ENVELOPE_MAX_ORDER = 8;
	const envelopeRaw = $derived.by(() =>
		demodValid
			? designEnvelopeLowPass({ response, amaxDb, aminDb, fp: fmMaxDemod, fs: rippleHz - fmMaxDemod, order: orderOverride, topology: envelopeTopology, maxOrder: ENVELOPE_MAX_ORDER, ...parts })
			: null
	);
	const envelopeDesign = $derived(envelopeRaw && !envelopeRaw.tooHigh ? envelopeRaw : null);
	// what the rounded parts do at the tone and at the ripple's nearest sideband, and the sharpest stage
	const envelopeCheck = $derived.by(() => {
		if (!envelopeDesign) return null;
		const atTone = envelopeGainDb(envelopeDesign, fmMaxDemod);
		const atSideband = envelopeGainDb(envelopeDesign, rippleHz - fmMaxDemod);
		const maxQ = Math.max(...envelopeDesign.realized.map((s) => s.actual.q));
		// the whole passband, not just its edge: a rounded Chebyshev can peak well past Amax below fm
		let top = { db: -Infinity, f: 0 };
		let bottom = { db: Infinity, f: 0 };
		for (let i = 0; i <= 200; i++) {
			const f = (fmMaxDemod * i) / 200 || fmMaxDemod / 1000;
			const db = envelopeGainDb(envelopeDesign, f);
			if (db > top.db) top = { db, f };
			if (db < bottom.db) bottom = { db, f };
		}
		const span = top.db - bottom.db;
		return { atTone, atSideband, maxQ, top, bottom, span, spanOk: span <= amaxDb + 0.1, stopOk: -atSideband >= aminDb - 0.1 };
	});
	const rectifierInfo = $derived(rectifierType === 'full' ? designPrecisionRectifier({ resistorSeries: parts.resistorSeries }) : designHalfWaveRectifier({ resistorSeries: parts.resistorSeries }));
	const rectStats = $derived(rectifiedEnvelopeStats(demodAmplitude, fpCarrierDemod, rectifierType));
	// the demodulator with the test wave (the carrier and index on the page): what comes out, as the LTspice run gets it
	const demodOptions = $derived(envelopeDesign ? { rectifierType, rectifier: rectifierInfo, envelope: envelopeDesign, fp: fpCarrierDemod, fm: fmMaxDemod, index: demoModIndex, amplitude: demodAmplitude } : null);
	const demodOut = $derived(demodOptions && demoModIndex > 0 ? demodExpectation(demodOptions) : null);
	const swingCheck = $derived(demodOut ? demodSwing({ rectifierType, amplitude: demodAmplitude, index: demoModIndex, out: demodOut, swing: demodOpampSwing }) : null);
	const couplingValid = $derived(loadOhms > 0 && fmMinDemod > 0 && fmMinDemod < fmMaxDemod);
	const coupling = $derived(
		outputCoupling && couplingValid && demodOut
			? designOutputCoupling({ rLoad: loadOhms, fmMin: fmMinDemod, fm: fmMaxDemod, amaxDb, level: demodOut.mean, tone: demodOut.tone, amplitude: demodAmplitude, capacitors: parts.capacitors })
			: null
	);
	// the message band through both: the low-pass sets its top, the coupling its bottom
	const bandCheck = $derived.by(() => {
		if (!coupling || !envelopeDesign) return null;
		let top = { db: -Infinity, f: 0 };
		let bottom = { db: Infinity, f: 0 };
		for (let i = 0; i <= 200; i++) {
			const f = fmMinDemod * (fmMaxDemod / fmMinDemod) ** (i / 200);
			const db = envelopeGainDb(envelopeDesign, f) + 20 * Math.log10(couplingGainAt(coupling, f));
			if (db > top.db) top = { db, f };
			if (db < bottom.db) bottom = { db, f };
		}
		const span = top.db - bottom.db;
		return { top, bottom, span, ok: span <= amaxDb + 0.1 };
	});
	// what the LTspice files carry: the demodulator, and the load when there is one
	const demodFiles = $derived(demodOptions ? { ...demodOptions, coupling } : null);

	const demodPreview = $derived.by(() => {
		const duration = 4 / fmMaxDemod;
		const source = amSignal(fpCarrierDemod, fmMaxDemod, demodAmplitude, demoModIndex, duration, 6000);
		const rectified = rectify(source, rectifierType);
		const env = envelopeWave(fmMaxDemod, rectStats.average, demoModIndex, duration, 6000);
		return { source, rectified, env };
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
				response,
				topology: envelopeTopology,
				index: demoModIndex,
				amplitude: demodAmplitude,
				opampSwing: demodOpampSwing,
				outputCoupling,
				loadOhms,
				fmMin: fmMinDemod,
				...parts
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
			oscillatorOk: carrierFrom !== 'wien' || !jfetValid || !!carrierOscillator,
			rectifierType,
			rectifierR: rectifierInfo.r1 ?? null,
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
			demodAmp: demodAmplitude,
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
				<span class="hint">{fitted ? 'fitted to measurements' : 'datasheet or measured pair'}</span>
			</div>
			<div class="grid">
				<div class="field">
					<label for="jmode">Where the numbers come from</label>
					<select id="jmode" bind:value={jfetMode}>
						<option value="idss">V_P and I_DSS</option>
						<option value="rdson">V_P and r_DS(on)</option>
						<option value="measured">Measured points (fit a line)</option>
						<option value="fixedvds">Measured I_DS at a fixed V_DS (fit a line)</option>
					</select>
				</div>
				<div class="field" role="group" aria-labelledby="presetLabel">
					<span class="labelLike" id="presetLabel">Datasheet preset (limits, not typicals)</span>
					<div class="row presets">
						{#each Object.keys(JFET_PRESETS) as name (name)}
							<button type="button" class="small" onclick={() => applyPreset(name)}>{name}</button>
						{/each}
					</div>
				</div>
				{#if !fitted}
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
					<label for="swing">Swing fraction {fitted ? '(of the window half-width)' : '(of the |VP|/2 range)'}</label>
					<input id="swing" type="number" step="0.05" min="0.05" max="1" bind:value={swingFraction} />
				</div>
				<div class="field">
					<label for="n">Target modulation index n</label>
					<input id="n" type="number" step="0.05" min="0.05" max="1" bind:value={targetN} />
				</div>
			</div>

			<MathPanel blocks={jfetSourcing} summary="How to find V_P, I_DSS and r_DS(on): datasheet, calculation, lab" />

			{#if presetNote && presetValues && jfetMode === 'rdson' && vp === presetValues.vp && rdsOn === presetValues.rdsOn}
				<p class="note">{presetNote}</p>
			{/if}

			{#if fitted}
				<div class="measure">
					<div class="field grow">
						{#if jfetMode === 'measured'}
							<label for="meas">Measured rows: <code>VGS rDS</code> (V, Ω) or <code>VGS Vin VD Rseries</code> (V, V, V, Ω)</label>
							<textarea id="meas" rows="6" bind:value={measurementText}></textarea>
						{:else}
							<label for="meas">Measured rows: <code>VGS IDS</code> (V, mA), the drain held at V_DS</label>
							<textarea id="meas" rows="6" bind:value={fixedText}></textarea>
						{/if}
					</div>
					<div class="grid narrow">
						{#if jfetMode === 'fixedvds'}
							<div class="field">
								<label for="fvds">V_DS held on the drain (V)</label>
								<input id="fvds" type="number" step="0.05" min="0.01" bind:value={fixedVds} />
							</div>
							<div class="field">
								<label for="frs">R_s in series with the channel (Ω)</label>
								<input id="frs" type="number" step="1" min="0" bind:value={seriesR} oninput={() => (rsEstimate = null)} />
								<button type="button" class="small estimate" onclick={estimateRs}>Estimate from the rows</button>
							</div>
						{/if}
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
				{#if jfetMode === 'measured'}
					<p class="note">
						Four columns describe the divider measurement: V_in through R_series into the drain,
						V_D read at the drain, source grounded, gate at V_GS; the tool computes r_DS = R_series
						V_D / (V_in - V_D). Keep V_D small (a few tenths of a volt at most) so the part stays in
						the ohmic region. The window picks the straight stretch the design is allowed to use:
						its middle becomes the bias point, its half-width the maximum swing.
					</p>
				{:else}
					<p class="note">
						The drain held at a fixed V_DS (0.2 V for instance), the source grounded,
						I_DS read on an ammeter at each gate voltage; the tool computes r_DS = V_DS / I_DS - R_s.
						R_s is what sits in series with the channel and is counted in V_DS when V_DS is set on
						the supply: the ammeter's shunt, the output resistance of the source (50 Ω for a function
						generator), the wires. Leave it at 0 when V_DS is read with a voltmeter at the drain
						itself. A curve that flattens near V_GS = 0 is the sign of an R_s left in. The window
						picks the straight stretch the design is allowed to use.
					</p>
					{#if rsEstimate?.failed}
						<p class="flag bad">No estimate: the window holds fewer than three rows with a current, or no series resistance makes the conductance rise with V_GS.</p>
					{:else if rsEstimate}
						<p class="note">
							R_s estimated at {formatOhms(rsEstimate.rs)}: with it, a straight channel and the series
							resistance give back the currents read within {(100 * rsEstimate.err).toFixed(1)} % rms over
							the window. The estimate assumes the channel is straight there, so it moves with the window;
							a voltmeter on the drain settles it.
						</p>
					{/if}
					{#if fixedRead.dropped > 0}
						<p class="flag bad">{fixedRead.dropped} row{fixedRead.dropped > 1 ? 's give' : ' gives'} r_DS at or below zero once R_s is taken off: R_s is larger than V_DS / I_DS there. Lower R_s.</p>
					{/if}
				{/if}
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
				{#if jfetMode === 'fixedvds'}
					<details class="exp2">
						<summary>Output curves (optional): I_DS against V_DS at a fixed V_GS</summary>
						<div class="field grow">
							<label for="exp2">Rows: <code>VGS VDS IDS</code> (V, V, mA), V_DS as set on the bench; R_s above comes off it</label>
							<textarea id="exp2" rows="6" bind:value={exp2Text}></textarea>
						</div>
						{#if outputCurves.length}
							{@const vTop = Math.max(...outputCurves.map((c) => c.vMax))}
							{@const zero = outputCurves.find((c) => c.vgs === 0)}
							<XYPlot
								xs={[0, Math.ceil(vTop * 2) / 2]}
								xLabel="V_DS at the drain, V"
								yLabel="I_DS, mA"
								yMin={0}
								height={230}
								series={outputCurves.flatMap((c, k) => {
									const color = CURVE_COLORS[k % CURVE_COLORS.length];
									const model = modelCurve(c.vgs, vTop);
									return [
										{ xs: c.points.map((pt) => pt.v), ys: c.points.map((pt) => 1000 * pt.ids), color, endLabel: `V_GS ${c.vgs} V` },
										...(model ? [{ xs: model.xs, ys: model.ys, color, dash: [5, 4], width: 1.2 }] : [])
									];
								})}
							/>
							<p class="note">Solid: the rows, plotted against the drain voltage the channel really saw (V_DS minus R_s I_DS). Dashed: the fitted line above turned into the square-law curves, flat past the knee V_GS - V_P.</p>
							<div class="tableScroll">
							<table>
								<thead>
									<tr><th>V_GS</th><th>r_DS at the first step</th><th>Ohmic up to (within 10 %)</th><th>Highest V_DS at the drain</th><th>Highest I_DS</th></tr>
								</thead>
								<tbody>
									{#each outputCurves as c (c.vgs)}
										<tr><td>{formatVolts(c.vgs)}</td><td>{formatOhms(c.r0)}</td><td>{formatVolts(c.ohmicTo)}</td><td>{formatVolts(c.vMax)}</td><td>{(1000 * c.iMax).toFixed(1)} mA</td></tr>
									{/each}
								</tbody>
							</table>
							</div>
							{#if zero && jfetModel && zero.vMax < Math.abs(jfetModel.vp)}
								<p class="flag warn">
									At V_GS = 0 the drain reached only {formatVolts(zero.vMax)}, below |V_P| = {formatVolts(Math.abs(jfetModel.vp))}:
									the channel never pinched off, so the flat top at {(1000 * zero.iMax).toFixed(1)} mA is not I_DSS. The
									series resistance and the heating of the part bend the curve instead.
								</p>
							{:else if zero}
								<p class="note">At V_GS = 0 the drain passed |V_P|, so the flat top, {(1000 * zero.iMax).toFixed(1)} mA, reads I_DSS.</p>
							{/if}
							<p class="note">
								The ohmic range is where the gain cell may swing the drain: past it the channel stops acting as
								a resistor and the envelope distorts. Sweeping to the plateau puts V_DS x I_DS into the part,
								about 0.36 W at 6 V and 60 mA, more than a TO-92 J111 dissipates: keep that part of the sweep short.
							</p>
						{:else}
							<p class="flag bad">No readable rows: three numbers per line, V_GS V_DS I_DS.</p>
						{/if}
					</details>
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
			{:else if !jfetModel && !fitted}
				<p class="flag bad">VP must be negative and {jfetMode === 'idss' ? 'IDSS' : 'r_DS(on)'} positive.</p>
			{/if}
			<MathPanel blocks={explainJfetModel(jfetModel)} summary="Show the math for the characterization" />
		</section>

		<section class="panel">
			<div class="panel-head">
				<span class="num">02</span>
				<h2>Sources and op-amp</h2>
				<span class="hint">TL08x: 3 to 4 MHz, 13 to 16 V/us</span>
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
						<option value="wien">A Wien bridge on the board</option>
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
						<option value="noninverting">Non-inverting (1 or 2 op-amps)</option>
						<option value="inverting">Inverting (1 to 3 op-amps)</option>
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
							<option value={false}>No, the divider drives it</option>
						</select>
					</div>
				{:else}
					<div class="field">
						<label for="ostage">Output gain stage</label>
						<select id="ostage" bind:value={outputStage}>
							<option value={false}>No, the cell output as it is</option>
							<option value={true}>Yes, up to a target amplitude</option>
						</select>
					</div>
					{#if outputStage}
						<div class="field">
							<label for="vtarget">Target output amplitude (V)</label>
							<input id="vtarget" type="number" step="0.1" min="0.05" bind:value={targetOutputAmplitude} />
						</div>
					{/if}
				{/if}
			</div>
			<StockPicker id="stockJfet" bind:stock bind:resistorText bind:capacitorText bind:pairs />
			{#if restricted}
				<p class="note">
					{stock === 'labR'
						? `Every resistor below is rounded to the lab resistors${parts.pairs ? ' (or two of them in series)' : ''}, the capacitors to the usual values,`
						: `Every resistor and capacitor below is rounded to those values ${parts.pairs ? '(or, for a resistor, to two of them in series)' : 'only'},`} and the figures are worked out from the rounded parts.
				</p>
			{/if}
			<p class="note">
				The output swing is what the op-amp reaches on this supply, about Vcc minus 1.5 V for a
				TL08x. The carrier frequency is a design input here, not a preview setting: it is what the
				op-amp has to keep up with, at the highest gain the message drives the cell to. The
				non-inverting cell needs a large x to reach a deep modulation, which is what the op-amp
				struggles with at a fast carrier; the inverting cell reaches n = s with a small x, at the
				cost of up to two more op-amps. The comparison table below puts the two side by side.
				An output gain stage after the non-inverting cell brings the carrier up to a target amplitude
				without asking the JFET for a larger carrier, which would cost current and linearity.
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
					<DiagramView
						diagram={buildJfetInvertingCellDiagram({ r2: jfetDesign.r2, follower: jfetDesign.buffer.enabled, divided: jfetDesign.buffer.dividerImpedance > 0, ohms: diagramOhms() })}
						label={jfetDesign.buffer.enabled ? 'JFET inverting gain cell with its carrier follower' : jfetDesign.buffer.dividerImpedance > 0 ? 'JFET inverting gain cell, driven by the divider' : 'JFET inverting gain cell, driven straight from the carrier'}
					/>
				{:else}
					<DiagramView diagram={buildJfetGainCellDiagram({ rb: jfetDesign.rb, ohms: diagramOhms() })} label="JFET gain cell" />
				{/if}
				<table>
					<tbody>
						<tr><td>Bias point V_C</td><td>{formatVolts(jfetDesign.vc)}</td></tr>
						<tr><td>Channel resistance at V_C</td><td>{formatOhms(jfetDesign.r1AtCenter)}</td></tr>
						<tr><td>Feedback resistor {jfetDesign.topology === 'inverting' ? 'R_2' : 'R_b'}</td><td>{ohms(jfetDesign.feedback)} (x = {jfetDesign.x.toFixed(3)})</td></tr>
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
					<p class="flag {jfetDesign.buffer.enabled || !(jfetDesign.buffer.dividerImpedance > 0) ? 'ok' : 'bad'}">
						{#if jfetDesign.buffer.enabled}
							With the follower the channel is driven from {formatOhms(jfetDesign.buffer.zOut)}: n effective {jfetDesign.buffer.withBuffer.effectiveModulationIndex.toFixed(3)}, THD {(100 * jfetDesign.buffer.withBuffer.thd).toFixed(2)} % from the source impedance alone. Without it the divider's {formatOhms(jfetDesign.buffer.dividerImpedance)} would give n {jfetDesign.buffer.withoutBuffer.effectiveModulationIndex.toFixed(3)} and {(100 * jfetDesign.buffer.withoutBuffer.thd).toFixed(1)} % THD.
						{:else}
							The divider's {formatOhms(jfetDesign.buffer.dividerImpedance)} adds to the channel ({(100 * jfetDesign.buffer.crestErrorWithout).toFixed(0)} % of r_DS at the crest): n effective {jfetDesign.buffer.withoutBuffer.effectiveModulationIndex.toFixed(3)} and {(100 * jfetDesign.buffer.withoutBuffer.thd).toFixed(1)} % THD. Add the follower.
						{/if}
					</p>
				{/if}
				{#if jfetDesign.topology !== 'inverting' && jfetDesign.postGain && !jfetDesign.postGain.needed}
					<p class="note">
						No output stage is added: the cell already gives {formatVolts(jfetDesign.carrier.carrierOut)} of carrier, which reaches the {formatVolts(jfetDesign.postGain.target)} asked for.
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
					<DiagramView diagram={buildGainStageDiagram({ rtop: jfetDesign.postGain.rtop, rbottom: jfetDesign.postGain.rbottom, ohms: diagramOhms() })} label="post-gain stage" />
					<table>
						<tbody>
							<tr><td>Cell output carrier K_0 A_c</td><td>{formatVolts(jfetDesign.carrier.carrierOut)}</td></tr>
							<tr><td>Gain needed for {formatVolts(jfetDesign.postGain.target)}</td><td>{jfetDesign.postGain.kTarget.toFixed(2)}, R_top {ohms(jfetDesign.postGain.rtop)} / R_bottom {formatOhms(jfetDesign.postGain.rbottom)} gives {jfetDesign.postGain.kActual.toFixed(2)}</td></tr>
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
				<DiagramView
					diagram={buildCarrierDividerDiagram({
						...jfetDesign.carrier.divider,
						from: workingOscillator ? 'from the Wien oscillator' : 'carrier source',
						to: jfetDesign.topology === 'inverting' ? (jfetDesign.buffer.enabled ? 'to the follower' : 'to the drain') : 'to + input',
						ohms: diagramOhms()
					})}
					label="carrier attenuator"
				/>
				<table>
					<tbody>
						<tr><td>Triode limit V_GS,min - V_P</td><td>{formatVolts(jfetDesign.carrier.vdsSat)} (carrier at most {formatVolts(jfetDesign.carrier.acTriode)} with margin k = {jfetDesign.carrier.margin})</td></tr>
						<tr><td>Op-amp limit V_out,max / K_max</td><td>{formatVolts(jfetDesign.carrier.acOpamp)}</td></tr>
						<tr><td>Carrier amplitude A_c delivered</td><td>{formatVolts(jfetDesign.carrier.ac)} from {formatVolts(jfetDesign.carrier.sourceAmplitude)}{jfetDesign.carrier.divider.top > 0 ? `, divider ${ohms(jfetDesign.carrier.divider.top)} / ${formatOhms(jfetDesign.carrier.divider.bottom)}, rounded to stay at or under the limit` : ', no divider needed'}</td></tr>
						<tr><td>Output carrier K_0 A_c</td><td>{formatVolts(jfetDesign.carrier.carrierOut)}</td></tr>
						<tr><td>Envelope min / max</td><td>{formatVolts(jfetDesign.carrier.envelopeMin)} / {formatVolts(jfetDesign.carrier.envelopeMax)}</td></tr>
						<tr><td>JFET and op-amp peak current</td><td>{(jfetDesign.carrier.jfetPeakCurrent * 1000).toFixed(2)} mA</td></tr>
						<tr><td>V_DS² term: DC offset and tone at 2 f_p</td><td>{(jfetDesign.carrier.tone2fp * 1000).toFixed(1)} mV, {jfetDesign.carrier.tone2fpDbc.toFixed(1)} dBc at {formatHz(jfetDesign.carrier.tone2fpHz)}</td></tr>
					</tbody>
				</table>
				{#if jfetDesign.carrier.jfetPeakCurrent > 0.01}
					<p class="flag warn">
						Peak output current above 10 mA: lower the carrier margin{jfetDesign.topology === 'inverting' ? '' : ' (the output gain stage makes up the level without this current)'} or use a JFET with a smaller I_DSS.
					</p>
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
						<tr><td>Op-amps in the modulator</td><td>{jfetDesign.opamp.opampCount + (workingOscillator ? 1 : 0)} (gate-drive summer{workingOscillator ? ' and Wien oscillator' : ''} included)</td></tr>
					</tbody>
				</table>
				{#if jfetDesign.opamp.gbwOk}
					<p class="flag ok">Within the gain-bandwidth rule of thumb (f_p K_max / GBW at or below 0.2): the crest loses {(100 * (1 - jfetDesign.opamp.factorCrest)).toFixed(1)} %.</p>
				{:else if jfetDesign.opamp.rbLimit}
					<p class="flag warn">
						At {formatHz(fp)} this op-amp cannot follow a noise gain of {jfetDesign.opamp.kCrest.toFixed(1)}: the crest loses
						{(100 * (1 - jfetDesign.opamp.factorCrest)).toFixed(0)} % and the recovered audio carries
						{(100 * jfetDesign.opamp.thd).toFixed(1)} % THD.
						{jfetDesign.topology === 'inverting'
							? `Only an R_2 of ${formatOhms(jfetDesign.opamp.rbLimit)} or less would do (n stays at ${jfetDesign.opamp.nAtLimit.toFixed(3)}), below the x of 0.5 the tool keeps as a floor: a faster op-amp or a lower carrier fixes it.`
							: `Lowering the target n to about ${jfetDesign.opamp.nAtLimit.toFixed(3)} brings R_b down to ${formatOhms(jfetDesign.opamp.rbLimit)}, inside the rule; a faster op-amp or a lower carrier also fixes it.`}
					</p>
				{:else}
					<p class="flag bad">At {formatHz(fp)} no feedback resistor brings the noise gain under the gain-bandwidth limit with this op-amp: a faster op-amp or a lower carrier is needed.</p>
				{/if}
				{#if topologyRows.length === 2}
					<h3>Both cells on this JFET, carrier and op-amp</h3>
					<div class="tableScroll">
						<table class="compare">
							<thead>
								<tr>
									<th></th>
									<th>Non-inverting</th>
									<th>Inverting</th>
								</tr>
							</thead>
							<tbody>
								{#each [['Modulation index n (designed)', (r) => (r.ok ? r.n.toFixed(3) : 'not realizable')], ['n effective after the crest loss', (r) => (r.ok ? r.nEffective.toFixed(3) : '')], ['Noise gain at the crest K_max', (r) => (r.ok ? r.kCrest.toFixed(1) : '')], ['Closed-loop bandwidth at the crest', (r) => (r.ok ? formatHz(r.bwCrest) : '')], ['f_p K_max / GBW', (r) => (r.ok ? r.gbwRatio.toFixed(2) + (r.gbwRatio > 0.2 ? ' (over)' : '') : '')], ['Audio THD from the envelope', (r) => (r.ok ? (100 * r.thd).toFixed(2) + ' %' : '')], ['Output carrier amplitude', (r) => (r.ok ? formatVolts(r.carrierOut) : '')], ['Feedback resistor', (r) => (r.ok ? ohms(r.feedback) : '')], ['Op-amps', (r) => (r.ok ? String(r.opampCount) : '')]] as [name, cell] (name)}
									<tr>
										<td>{name}</td>
										<td>{cell(topologyRows[0])}</td>
										<td>{cell(topologyRows[1])}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
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
					{#if carrierOscillator.stockShortfall}
						<p class="flag warn">The parts on hand cannot build this oscillator so that it starts and holds its amplitude, so it is shown with E24 resistors and E6 capacitors instead. Add values near the ones below.</p>
					{/if}
					<DiagramView diagram={buildOscillatorDiagram(carrierOscillator)} label="Wien bridge carrier oscillator with its diode limiter" />
					<table>
						<tbody>
							<tr><td>Frequency: wanted / predicted with this op-amp</td><td>{formatHz(fp)} / {formatHz(carrierOscillator.f0)} ({(100 * carrierOscillator.f0Error).toFixed(2)} %)</td></tr>
							<tr><td>R and C (two of each)</td><td>{oscOhms(carrierOscillator.r)}, {formatFarads(carrierOscillator.c)}</td></tr>
							<tr><td>Feedback: Rf1 / Rf2 (diodes across it) / Rg</td><td>{oscOhms(carrierOscillator.parts.rf1)} / {oscOhms(carrierOscillator.parts.rf2)} / {oscOhms(carrierOscillator.rg)}</td></tr>
							<tr><td>Limiting diodes</td><td>2 x {DIODES[carrierOscillator.diode].label}, one each way</td></tr>
							<tr><td>Output amplitude</td><td>{carrierOscillator.limiter.amplitudeActual ? `about ${formatVolts(carrierOscillator.limiter.amplitudeActual)} peak, into the divider above` : 'not held by these parts'}</td></tr>
							<tr><td>Gain needed / set / limited</td><td>{carrierOscillator.requiredGain.toFixed(2)} / {carrierOscillator.startGain.toFixed(2)} / {carrierOscillator.limiter.gainLimited.toFixed(2)}</td></tr>
							<tr><td>Distortion on the carrier</td><td>about {(100 * carrierOscillator.thd).toFixed(1)} %</td></tr>
							<tr><td>Op-amp lag at the carrier, and what it does</td><td>{carrierOscillator.opamp.lagDeg.toFixed(1)} degrees: the textbook RC would land {(100 * carrierOscillator.uncompensatedError).toFixed(1)} % off, so RC is retuned {(100 * carrierOscillator.retunePercent).toFixed(1)} %</td></tr>
						</tbody>
					</table>
					{#if !carrierOscillator.starts || !carrierOscillator.limiter.regulates}
						<p class="flag bad">
							With these parts the oscillator {carrierOscillator.starts ? 'starts, but the diodes cannot hold its amplitude' : 'does not start'}: the gain
							they set does not straddle the {carrierOscillator.requiredGain.toFixed(2)} the loop needs. Until then the carrier comes from a generator in the
							figures above and in the files.
						</p>
					{:else if !carrierOscillator.opamp.swingOk}
						<p class="flag bad">
							{carrierRemark?.text ?? 'The amplitude asked of the oscillator is beyond the op-amp output swing.'}
							Until then the carrier comes from a generator in the figures above and in the files.
						</p>
					{:else if carrierOscillator.opamp.opampOk}
						<p class="flag ok">
							The Wien bridge is the right choice here for one reason: it needs a gain of only 3, so at
							{formatHz(fp)} this op-amp lags it by only {carrierOscillator.opamp.lagDeg.toFixed(1)} degrees, which the retuned RC absorbs.
							{phaseShiftAtFp && phaseShiftAtFp.starts
								? `A phase-shift oscillator would need a gain of 29, and this op-amp would lag it by ${phaseShiftAtFp.opamp.lagDeg.toFixed(0)} degrees at this frequency${phaseShiftAtFp.opamp.opampOk ? '' : ', too much to trust'}.`
								: 'A phase-shift oscillator would need a gain of 29 and would not start at this frequency at all.'}
						</p>
					{:else}
						<p class="flag warn">
							At {formatHz(fp)} even a Wien bridge is past what this op-amp holds{Number.isFinite(carrierOscillator.opamp.fMax) ? ` (the textbook values would land 10 % low at ${formatHz(carrierOscillator.opamp.fMax)})` : ''}.
							Use a faster part for the oscillator, or feed the carrier from a generator.
						</p>
					{/if}
					{#if workingOscillator && carrierRemark}
						<p class="flag warn">
							{carrierRemark.text}
							The divider above is sized for the amplitude the oscillator gives, so the carrier reaching the JFET stays the same.
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
			{:else if carrierFrom === 'wien'}
				<section class="panel">
					<div class="panel-head">
						<span class="num">05b</span>
						<h2>Carrier oscillator</h2>
						<span class="hint">none at this carrier</span>
					</div>
					<p class="flag bad">
						No Wien bridge can be sized for a {formatHz(fp)} carrier with this op-amp: either its resistors would
						fall outside 1 k to 1 M, or the op-amp's lag leaves the loop no way to balance. A faster op-amp, a lower
						carrier or a generator fixes it; until then the LTspice files take the carrier from a generator.
					</p>
				</section>
			{/if}

			<section class="panel">
				<div class="panel-head">
					<span class="num">06</span>
					<h2>Gate drive</h2>
					<span class="hint">one inverting summer: gain, DC block and bias</span>
				</div>
				<DiagramView diagram={buildBiasSummerDiagram(jfetDesign.conditioning.summer, { ohms: diagramOhms() })} label="gate-drive summer" />
				<table>
					<tbody>
						<tr><td>R_f</td><td>{formatOhms(jfetDesign.conditioning.summer.rf)}</td></tr>
						<tr><td>R_ac (sets the gain R_f / R_ac)</td><td>{ohms(jfetDesign.conditioning.summer.rac)}, gain {jfetDesign.conditioning.summer.gainActual.toFixed(3)} (target {jfetDesign.conditioning.summer.gainTarget.toFixed(3)})</td></tr>
						<tr><td>R_bias (from +Vcc, sets the bias)</td><td>{ohms(jfetDesign.conditioning.summer.rbias)}, bias {formatVolts(jfetDesign.conditioning.summer.biasActual)} (target {formatVolts(-jfetDesign.conditioning.summer.biasTarget)})</td></tr>
						<tr><td>C (blocks DC, high-pass with R_ac)</td><td>{formatFarads(jfetDesign.conditioning.summer.c)}, corner {formatHz(jfetDesign.conditioning.summer.fcActual)} (target {formatHz(jfetDesign.conditioning.summer.fcTarget)})</td></tr>
						<tr><td>Most negative gate voltage delivered</td><td>{formatVolts(jfetDesign.conditioning.summer.outMin)} (op-amp swing ±{formatVolts(jfetDesign.conditioning.summer.opampSwing)})</td></tr>
					</tbody>
				</table>
				{#if !jfetDesign.conditioning.summer.fcOk}
					<p class="flag warn">
						No capacitor on hand puts the coupling corner a decade under {formatHz(fmMin)}: at {formatHz(jfetDesign.conditioning.summer.fcActual)}
						it takes {jfetDesign.conditioning.summer.fcLossDb.toFixed(1)} dB off the lowest message tone. A larger capacitor fixes it.
					</p>
				{/if}
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
				<OpampPicker id="spiceOpampJfet" bind:value={spiceOpamp} />
				<div class="row downloads">
					<button type="button" onclick={downloadJfet}>Download jfet-am-modulator.js</button>
					<button type="button" onclick={() => saveFile(generateModSchematic({ design: jfetDesign, fmPreview, oscillator: workingOscillator, opamp: spiceOpamp, resistorSeries: parts.resistorSeries, pairs: parts.pairs }), 'jfet-am-modulator.asc')}>Download .asc (LTspice)</button>
					<button type="button" onclick={() => saveFile(generateModNetlist({ design: jfetDesign, fmPreview, oscillator: workingOscillator, opamp: spiceOpamp, resistorSeries: parts.resistorSeries, pairs: parts.pairs }), 'jfet-am-modulator.cir')}>Download .cir (netlist)</button>
				</div>
				<p class="note">
					The LTspice files carry the whole modulator: the gate-drive summer, the carrier path{workingOscillator ? ' with its oscillator' : carrierFrom === 'wien' ? ' (from a generator, since no Wien bridge holds this carrier)' : ''},
					and the gain cell, with a transient run at {formatHz(fmPreview)} already set up. The JFET goes in as a
					real SPICE device rather than the straight line this page designs against (Vto = V_P, Beta = I_DSS / V_P&sup2;
					give the same curve), and {spiceReal ? `the op-amps are the ${spiceOpamp} with its supply pins on +15 V and -15 V rails, its model written into the file` : 'the op-amps carry the gain-bandwidth entered above'}. That is the point of
					simulating it: the crest compression and the distortion predicted in section 05 come from those two
					departures from the ideal, and the transient shows them directly. Plot V(vout), and V(vgate) for the gate drive.
					The .asc is drawn wire by wire{workingOscillator ? ', the oscillator as its own block underneath, joined to the divider by the label vcar' : ''}. The run holds the coupling capacitor at
					its steady-state charge so the gate bias is right from the first cycle, and, with the oscillator on board, starts
					the carrier at full amplitude and saves the four message periods after it has settled. The index measured from
					the carrier peaks in that run should read about {jfetDesign.opamp.peakModulationIndex.toFixed(3)}: the V_DS squared term lifts every
					peak by the same amount, crest and trough alike, which is why it sits a little under the envelope's own figure.{jfetOn741 &&
					(jfetOn741.opamp.effectiveModulationIndex < 0.97 * jfetDesign.opamp.effectiveModulationIndex || !jfetOn741.opamp.slewOk)
						? ` An LM741 (1 MHz, 0.5 V/us) takes the index down to about ${jfetOn741.opamp.effectiveModulationIndex.toFixed(2)} at a ${formatHz(fp)} carrier${jfetOn741.opamp.slewOk ? '' : ', and cannot slew fast enough for it'}.`
						: ''}
				</p>
				{#if spiceReal && jfetPeakOut > railSwing}
					<p class="flag warn">
						The files run the {spiceOpamp} on +15 V and -15 V, where it reaches about {railSwing} V: this modulator's largest
						op-amp output, {formatVolts(jfetPeakOut)} peak, clips in the run. Lower the carrier or the target output.
					</p>
				{/if}
				<p class="note formula-link">
					Every formula this design used: <a href="/tools/am-modulator-demodulator/formulas/">Formula sheet</a>.
				</p>
			</section>
		{:else if jfetValid}
			<section class="panel">
				<p class="flag bad">
					{jfetFailure === 'pinchoff'
						? `With the parts rounded, the gate drive swings V_GS down to V_P or past it, which pinches the channel off: lower the swing fraction${restricted ? ', or add resistors near the ones the gate drive needs' : ''}.`
						: `With the parts rounded, the gate drive leaves the conductance depth below the target n: lower n or widen the swing${restricted ? ', or add resistors near the ones the gate drive needs' : ''}.`}
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
					<label for="margin">Sideband margin (band / 2 fm)</label>
					<input id="margin" type="number" step="0.1" min="0.1" bind:value={sidebandMargin} />
				</div>
				<div class="field">
					<label for="ind">Tank inductor L (mH)</label>
					<input id="ind" type="number" step="0.1" min="0.001" bind:value={inductanceMh} />
				</div>
				<div class="field">
					<label for="ap">Carrier source amplitude (V)</label>
					<input id="ap" type="number" step="0.1" min="0.01" bind:value={carrierAmp} />
				</div>
				<div class="field">
					<label for="am">Message source amplitude (V)</label>
					<input id="am" type="number" step="0.1" min="0.01" bind:value={modAmp} />
				</div>
				<div class="field">
					<label for="nd">Target modulation index n</label>
					<input id="nd" type="number" step="0.05" min="0.05" max="1" bind:value={targetNDiode} />
				</div>
				<div class="field">
					<label for="drive">Carrier amplitude at the diode (V)</label>
					<input id="drive" type="number" step="0.1" min="0.2" bind:value={carrierDrive} />
				</div>
				<div class="field">
					<label for="vccd">Supply rail Vcc (V)</label>
					<input id="vccd" type="number" step="1" min="1" bind:value={vccDiode} />
				</div>
				<div class="field">
					<label for="dpart">Diode</label>
					<select id="dpart" bind:value={diodePart}>
						{#each Object.values(DIODE_MODELS) as d (d.id)}
							<option value={d.id}>{d.label}</option>
						{/each}
					</select>
				</div>
			</div>
			<StockPicker id="stockDiode" bind:stock bind:resistorText bind:capacitorText bind:pairs />
			{#if !diodeValid}
				<p class="flag bad">
					The carrier has to sit far enough above the highest message frequency that the tank's band, the margin times that
					frequency on either side of the carrier, stays clear of the message itself; the amplitudes, the margin and the supply
					positive; n between 0 and 1.
				</p>
			{:else if !diodeDesign}
				<p class="flag bad">No set of stock parts reaches this index with this carrier level: lower the target n or raise the carrier at the diode.</p>
			{:else if diodeDesign.stockShortfall}
				<p class="flag warn">No set of the parts on hand reaches this index, so the design below uses E24 resistors and E12 capacitors instead.</p>
			{:else if !diodeDesign.indexOk}
				<p class="flag warn">
					With the parts on hand the index lands at {diodeDesign.modulationIndex.toFixed(2)} for the {targetNDiode} asked{diodeDesign.modulationIndex > 1 ? ', past 1: the carrier is overmodulated' : ''}.
					Values closer to the ones R_p and R_m need would bring it back.
				</p>
			{/if}
			<p class="note">
				At a volt or so the diode is not a gentle curve but a switch: the summer brings the carrier to it
				with the message and a small bias on top, and the diode passes current for half of each carrier
				cycle. The page works the diode out cycle by cycle with its real law, so the index, the carrier and
				the distortion below are the figures LTspice gives, not a rule of thumb, as long as the diode's own
				junction capacitance stays small next to R_s (the tank panel says when it does not).
			</p>
		</section>

		{#if diodeDesign}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Summer</h2>
					<span class="hint">carrier {formatVolts(diodeDesign.summer.drive)}, message {formatVolts(diodeDesign.summer.um)}{diodeDesign.summer.rb ? `, bias ${formatVolts(diodeDesign.summer.vb)}` : ''}</span>
				</div>
				<DiagramView diagram={buildDiodeSummerDiagram(diodeDesign.summer, { ohms: diagramOhms(!diodeDesign.stockShortfall) })} label="carrier, message and bias summer" />
				<table>
					<tbody>
						<tr><td>R_f</td><td>{formatOhms(diodeDesign.summer.rf)}</td></tr>
						<tr><td>R_p (carrier gain R_f / R_p)</td><td>{ohms(diodeDesign.summer.rp, !diodeDesign.stockShortfall)}, carrier at the diode {formatVolts(diodeDesign.summer.drive)} (asked {formatVolts(diodeDesign.summer.driveTarget)})</td></tr>
						<tr><td>R_m (message gain R_f / R_m)</td><td>{ohms(diodeDesign.summer.rm, !diodeDesign.stockShortfall)}, message at the diode {formatVolts(diodeDesign.summer.um)}</td></tr>
						<tr><td>R_b (bias from -Vcc)</td><td>{diodeDesign.summer.rb ? `${formatOhms(diodeDesign.summer.rb)}, bias ${formatVolts(diodeDesign.summer.vb)}` : 'none: this diode switches cleanly with no bias'}</td></tr>
						<tr><td>Peak output / op-amp swing</td><td>{formatVolts(diodeDesign.summer.peak)} / {formatVolts(diodeDesign.summer.opampSwing)}</td></tr>
					</tbody>
				</table>
				{#if !diodeDesign.summer.swingOk}
					<p class="flag bad">The summer's peak output is past what the op-amp reaches on this supply: lower the carrier at the diode or raise Vcc.</p>
				{/if}
				{#if !diodeDesign.currentOk}
					<p class="flag warn">
						At the crest the summer has to deliver about {(1000 * diodeDesign.summerCurrent).toFixed(0)} mA into R_s and the diode, past the
						20 mA or so a TL08x gives: it current-limits and the carrier comes out smaller. A larger L raises R_s and brings the
						current down.
					</p>
				{/if}
				{#if !diodeDesign.summer.gbwOk}
					<p class="flag warn">At {formatHz(diodeDesign.fp)} a TL08x (3 MHz) runs this summer at a noise gain of {diodeDesign.summer.noiseGain.toFixed(1)}, past the rule of thumb (f_p times the noise gain under 0.2 of the gain-bandwidth): the carrier comes out smaller and late. A faster op-amp fixes it.</p>
				{/if}
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">03</span>
					<h2>Diode and tank</h2>
					<span class="hint">Q = {diodeDesign.qLoaded.toFixed(2)} with the source</span>
				</div>
				<DiagramView diagram={buildDiodeTankDiagram({ rs: diodeDesign.rs, l: diodeDesign.inductance, capacitors: diodeDesign.capacitors, r: diodeDesign.rt })} label="diode and resonant tank" />
				<table>
					<tbody>
						<tr><td>R_s (series, sets the diode's current)</td><td>{formatOhms(diodeDesign.rs)}</td></tr>
						<tr><td>Diode</td><td>{diodeDesign.diodeLabel}</td></tr>
						<tr><td>L</td><td>{formatHenries(diodeDesign.inductance)}</td></tr>
						<tr><td>C</td><td>{diodeDesign.capacitors.length === 2 ? `${formatFarads(diodeDesign.capacitors[0])} in parallel with ${formatFarads(diodeDesign.capacitors[1])} = ${formatFarads(diodeDesign.capacitance)}` : formatFarads(diodeDesign.capacitance)}</td></tr>
						<tr><td>R_t (across the tank)</td><td>{formatOhms(diodeDesign.rt)}</td></tr>
						<tr><td>Resonant frequency f0</td><td>{formatHz(diodeDesign.f0Actual)} ({diodeDesign.detuning >= 0 ? '+' : ''}{((100 * diodeDesign.detuning) / diodeDesign.fp).toFixed(2)} % from the carrier)</td></tr>
						<tr><td>Source seen through the diode, and R_t in parallel with it</td><td>{formatOhms(diodeDesign.rSource)}, {formatOhms(diodeDesign.rEff)}</td></tr>
						<tr><td>Band: asked / with the source</td><td>{formatHz(diodeDesign.bandwidthNeeded)} / {formatHz(diodeDesign.bwLoaded)}</td></tr>
						<tr><td>Band actually passed</td><td>{formatHz(Math.max(0, diodeDesign.bandLow))} to {formatHz(diodeDesign.bandHigh)}</td></tr>
					</tbody>
				</table>
				{#if diodeDesign.sidebandsInBand}
					<p class="flag ok">Both sidebands, {formatHz(diodeDesign.fp - diodeDesign.fmMax)} and {formatHz(diodeDesign.fp + diodeDesign.fmMax)}, sit inside the band the tank passes.</p>
				{:else}
					<p class="flag bad">
						The band the tank passes does not hold both sidebands at {formatHz(diodeDesign.fp - diodeDesign.fmMax)} and {formatHz(diodeDesign.fp + diodeDesign.fmMax)}.
						{diodeDesign.rangeOk ? 'A larger sideband margin widens it.' : 'A larger margin cannot help here: see below.'}
					</p>
				{/if}
				{#if !diodeDesign.tuneOk}
					<p class="flag warn">
						No capacitor pair lands the tank within 3 % of the carrier: f0 is {((100 * diodeDesign.detuning) / diodeDesign.fp).toFixed(1)} % off.
						A coil value that suits the capacitors available, or more capacitor values, centres it.
					</p>
				{/if}
				{#if !diodeDesign.rangeOk}
					<p class="flag warn">
						R_s or R_t would have to go under {formatOhms(diodeDesign.resistorFloor)}, the smallest resistor the search has: with this
						coil the tank's resistance cannot be made low enough for the band asked. A larger L raises it.
					</p>
				{/if}
				{#if !diodeDesign.leakOk}
					<p class="flag warn">
						The tank is wide next to the message frequency, so it also passes the message itself: about
						{(100 * diodeDesign.messageLeak).toFixed(0)} % of the carrier at {formatHz(diodeDesign.fmMax)} rides on the output and bends the
						envelope. A higher carrier or a smaller sideband margin narrows it.
					</p>
				{/if}
				{#if !diodeDesign.cjOk}
					<p class="flag warn">
						At this R_s ({formatOhms(diodeDesign.rs)}) the diode's own junction capacitance passes the drive while the diode is off:
						at the carrier its impedance is only {(1 / diodeDesign.cjRatio).toFixed(1)} times R_s. The figures here leave that capacitance
						out, and LTspice, which keeps it, shows a larger carrier and a smaller index. A smaller L brings R_s down.
					</p>
				{/if}
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">04</span>
					<h2>What comes out</h2>
					<span class="hint">n = {diodeDesign.modulationIndex.toFixed(3)}, carrier {formatVolts(diodeDesign.carrierOut)}</span>
				</div>
				<table>
					<tbody>
						<tr><td>Carrier at the output</td><td>{formatVolts(diodeDesign.carrierOut)} (an ideal switch would give {formatVolts(diodeDesign.idealCarrier)})</td></tr>
						<tr><td>Modulation index for a slow message</td><td>{diodeDesign.modulationIndex.toFixed(3)}, target {diodeDesign.targetModulationIndex.toFixed(2)}</td></tr>
						<tr><td>Index for a {formatHz(diodeDesign.fmMax)} tone</td><td>{diodeDesign.indexAtFmMax.toFixed(3)}: the tank passes its sidebands at {(100 * diodeDesign.sidebandGain).toFixed(1)} % of the carrier</td></tr>
						<tr><td>Envelope distortion (THD): slow message / {formatHz(diodeDesign.fmMax)} tone</td><td>{(100 * diodeDesign.thd).toFixed(2)} % / {(100 * diodeDesign.thdAtFmMax).toFixed(2)} %</td></tr>
						<tr><td>Envelope max / min</td><td>{formatVolts(diodeDesign.envelopeMax)} / {formatVolts(diodeDesign.envelopeMin)}</td></tr>
						<tr><td>Peak diode current</td><td>{(diodeDesign.peakCurrent * 1000).toFixed(2)} mA</td></tr>
						<tr><td>Index of an ideal switch, 4 u_m / (pi A_d)</td><td>{diodeDesign.idealIndex.toFixed(3)}</td></tr>
					</tbody>
				</table>
				{#if diodeDesign.sidebandGain < 0.9}
					<p class="flag warn">The tank's slope takes {(100 * (1 - diodeDesign.sidebandGain)).toFixed(0)} % off the index of a {formatHz(diodeDesign.fmMax)} tone: a larger sideband margin flattens it.</p>
				{/if}
				{#if diodePreview}
					<TimePlot series={[{ t: diodePreview.t, y: diodePreview.y, color: 'var(--blue)' }]} unit="ms" />
				{/if}
				<p class="note">The preview draws a {formatHz(diodeDesign.fmMax)} tone at the carrier and index the tank hands on. Power efficiency at that index: eta = {(powerEfficiency(diodeDesign.indexAtFmMax) * 100).toFixed(2)}%.</p>
				<MathPanel blocks={explainDiodeModulator(diodeDesign)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">05</span>
					<h2>Download</h2>
				</div>
				<p class="note">A standalone script with this exact design, runnable with <code>node diode-tank-am-modulator.js</code>.</p>
				<OpampPicker id="spiceOpampDiode" bind:value={spiceOpamp} />
				<div class="row downloads">
					<button type="button" onclick={downloadDiode}>Download diode-tank-am-modulator.js</button>
					<button type="button" onclick={() => saveFile(generateDiodeSchematic({ design: diodeDesign, opamp: spiceOpamp, resistorSeries: parts.resistorSeries, pairs: diodePairs }), 'diode-tank-am-modulator.asc')}>Download .asc (LTspice)</button>
					<button type="button" onclick={() => saveFile(generateDiodeNetlist({ design: diodeDesign, opamp: spiceOpamp, resistorSeries: parts.resistorSeries, pairs: diodePairs }), 'diode-tank-am-modulator.cir')}>Download .cir (netlist)</button>
				</div>
				<p class="note">
					The LTspice files carry the whole modulator: the carrier and message sources, the summer with its
					{diodeDesign.summer.rb ? `bias from a -${diodeDesign.vcc} V supply` : 'two inputs'}, R_s, the diode and the tank, with a transient
					run of a {formatHz(diodeDesign.fmMax)} tone already set up. The diode is the same SPICE model the page
					works with (apart from its junction capacitance, which the page leaves out), so the run should show a carrier of about {formatVolts(diodeDesign.carrierOut)} and an index of about
					{diodeDesign.indexAtFmMax.toFixed(2)}, read off the envelope or from the sidebands in an FFT. Plot V(vout) for
					the AM wave and V(vs) for the summed drive.
					{spiceReal
						? `The summer's op-amp is the ${spiceOpamp} with its supply pins on +15 V and -15 V rails, its model written into the file.`
						: 'The op-amp is the same single-pole model as in the other exports, with the gain-bandwidth of a TL08x.'}
					{spiceOpamp === 'LM741' && ((diodeDesign.fp * diodeDesign.summer.noiseGain) / 1e6 > 0.2 || 2 * Math.PI * diodeDesign.fp * diodeDesign.summer.peak > 0.25e6)
						? `An LM741 (1 MHz, 0.5 V/us) cannot keep up with this summer at ${formatHz(diodeDesign.fp)}: expect the carrier to come out smaller.`
						: ''}
				</p>
				{#if diodeDesign.summer.peak > railSwing}
					<p class="flag warn">
						The files run the {spiceOpamp} on +15 V and -15 V, where it reaches about {railSwing} V: the summer's
						{formatVolts(diodeDesign.summer.peak)} peak clips in the run. Lower the carrier at the diode or the message.
					</p>
				{/if}
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
						<option value="full">Precision full-wave</option>
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
					<label for="dtopology">Filter topology</label>
					<select id="dtopology" bind:value={envelopeTopology}>
						<option value="sallenKey">Sallen-Key (unity gain)</option>
						<option value="mfb">MFB (multiple feedback, inverting)</option>
					</select>
				</div>
				<div class="field">
					<label for="dac">Carrier amplitude at the input (V)</label>
					<input id="dac" type="number" step="0.1" min="0.01" bind:value={demodAmplitude} />
				</div>
				<div class="field">
					<label for="dn">Modulation index of the test wave</label>
					<input id="dn" type="number" step="0.05" min="0.05" max="1" bind:value={demoModIndex} />
				</div>
				<div class="field">
					<label for="dswing">Op-amp output swing (V)</label>
					<input id="dswing" type="number" step="0.5" min="0.5" bind:value={demodOpampSwing} />
				</div>
				<div class="field">
					<label for="dout">Output</label>
					<select id="dout" bind:value={outputCoupling}>
						<option value={true}>Through a capacitor into a load</option>
						<option value={false}>The filter output as it is</option>
					</select>
				</div>
				{#if outputCoupling}
					<div class="field">
						<label for="dload">Load resistance (Ω)</label>
						<input id="dload" type="number" step="1" min="1" bind:value={loadOhms} />
					</div>
					<div class="field">
						<label for="dfmlo">Lowest message frequency (Hz)</label>
						<input id="dfmlo" type="number" step="10" min="1" bind:value={fmMinDemod} />
					</div>
				{/if}
			</div>
			<StockPicker id="stockDemod" bind:stock bind:resistorText bind:capacitorText bind:pairs />
			<p class="note">
				Residual ripple sits at {formatHz(rippleHz)} ({rectifierType === 'full' ? '2 x fp, full-wave' : 'fp, half-wave'}), and the
				message it carries puts its nearest sideband at {formatHz(rippleHz - fmMaxDemod)}: that is where the filter's stopband starts.
			</p>
			{#if !demodValid}
				<p class="flag bad">
					The highest message frequency has to sit below the carrier and below the ripple's nearest sideband (the ripple
					frequency minus that message frequency); Amin has to be larger than Amax, both positive; the modulation index
					between 0 and 1; the carrier amplitude and the op-amp swing above 0.
				</p>
			{:else if envelopeRaw?.tooHigh}
				<p class="flag bad">
					That needs an order-{envelopeRaw.n} filter, past {ENVELOPE_MAX_ORDER}: more stages than a demodulator should carry.
					Lower Amin, raise Amax, or move the carrier further from the message.
				</p>
			{:else if outputCoupling && !couplingValid}
				<p class="flag bad">The load has to be above 0 Ω, and the lowest message frequency between 0 and the highest one.</p>
			{/if}
			{#if outputCoupling}
				<p class="note">The load is what the output drives: earphones are 16 to 32 Ω, an amplifier's or a sound card's input about 10 kΩ.</p>
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
						{#if swingCheck}
							<tr><td>Op-amp swing needed / available</td><td>{formatVolts(swingCheck.needed)} / {formatVolts(demodOpampSwing)}{swingCheck.where === 'rectifier' ? ", at U1A: the wave's crest plus a diode's drop" : ", at the filter's output"}</td></tr>
						{/if}
					</tbody>
				</table>
				<p class="note">
					D1 points from U1A's - input into its output, D2 from that output into U1B's + input. Turned the
					other way, D1 leaves the circuit with no full-wave output at all. {rectifierInfo.r1 === 1000
						? 'R1 = R2 = R3 = 1 k is the value TI used'
						: `R1 = R2 = R3 = ${formatOhms(rectifierInfo.r1)} is the value on hand nearest the 1 k TI used`}: at a fast carrier the diode
					that is switched off still couples a few pF, and 10 k would let about 1 % of the swing through it.
				</p>
			{:else}
				<DiagramView diagram={buildHalfWaveDiagram(rectifierInfo)} label="half-wave rectifier" />
				<table>
					<tbody>
						<tr><td>Diode</td><td>{rectifierInfo.diode}</td></tr>
						<tr><td>R_L (to ground, the diode's return path)</td><td>{formatOhms(rectifierInfo.rl)}</td></tr>
						{#if swingCheck}
							<tr><td>Op-amp swing needed / available</td><td>{formatVolts(swingCheck.needed)} / {formatVolts(demodOpampSwing)}{swingCheck.where === 'rectifier' ? ", at U1A: the wave's crest plus a diode's drop" : ", at the filter's output"}</td></tr>
						{/if}
					</tbody>
				</table>
				<p class="note">
					{envelopeTopology === 'mfb'
						? "The MFB filter after it takes DC through its R1, into a node held at 0 V, so it could let the output come down on its own. R_L stays all the same, and the figures below count R1 with it."
						: 'The envelope filter after it takes no DC, so R_L is what lets the output come down again when the envelope does: without it the diode would charge the filter to the highest crest and hold it there.'}
				</p>
			{/if}
			{#if swingCheck && !swingCheck.ok}
				<p class="flag bad">
					{swingCheck.where === 'rectifier'
						? `U1A's output would reach ${formatVolts(swingCheck.needed)}, the wave's crest A_c(1 + n) = ${formatVolts(swingCheck.crest)} plus a diode's drop,`
						: `The filter's output would reach ${formatVolts(swingCheck.needed)}, its DC level plus the tone,`}
					past the {formatVolts(demodOpampSwing)} the op-amps swing: the tops of the envelope get clipped and the message comes out
					distorted. A divider before the rectifier, or wider rails, brings the wave back inside.
				</p>
			{/if}
			<MathPanel blocks={explainRectifier(rectifierType, fpCarrierDemod, rectifierInfo.r1 ?? 1000, swingCheck)} />
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
					{#if stage.topology === 'mfb'}
						<DiagramView diagram={buildEnvelopeMfbDiagram(stage.components, { ohms: diagramOhms(!stage.stockShortfall) })} label="envelope low-pass stage {i + 1}, MFB" />
						<table>
							<tbody>
								<tr><td>R1 = R3</td><td>{ohms(stage.components.R1, !stage.stockShortfall)}</td></tr>
								<tr><td>R2</td><td>{ohms(stage.components.R2, !stage.stockShortfall)}</td></tr>
								<tr><td>C1 (to ground)</td><td>{formatFarads(stage.components.C1)}</td></tr>
								<tr><td>C2 (feedback)</td><td>{formatFarads(stage.components.C2)}</td></tr>
							</tbody>
						</table>
					{:else}
						<DiagramView diagram={buildEnvelopeLowPassDiagram(stage.components, { ohms: diagramOhms(!stage.stockShortfall) })} label="envelope low-pass stage {i + 1}" />
						<table>
							<tbody>
								<tr><td>R1 = R2</td><td>{ohms(stage.components.R1, !stage.stockShortfall)}</td></tr>
								<tr><td>C_top</td><td>{formatFarads(stage.components.Ctop)}</td></tr>
								<tr><td>C_bottom</td><td>{formatFarads(stage.components.Cbottom)}</td></tr>
							</tbody>
						</table>
					{/if}
				{/each}
				{#if envelopeDesign.topology === 'mfb'}
					<p class="note">
						Each MFB stage has a DC gain of -1 (R1 = R3), the same size as a Sallen-Key's.
						{envelopeDesign.realized.length % 2 === 1
							? `With ${envelopeDesign.realized.length === 1 ? 'one stage' : `${envelopeDesign.realized.length} stages`} the message comes out upside down, on a negative DC level: the tone is the same, and an inverting amplifier with two equal resistors puts it back where a positive level is needed.`
							: `With ${envelopeDesign.realized.length} stages the inversions cancel in pairs and the message comes out upright.`}
					</p>
				{/if}
					{#if envelopeDesign.shortfallStages.length > 0}
					<p class="flag warn">
						Stage{envelopeDesign.shortfallStages.length > 1 ? 's' : ''} {envelopeDesign.shortfallStages.join(', ')} cannot be built from the
						parts on hand, so {envelopeDesign.shortfallStages.length > 1 ? 'they are' : 'it is'} shown with E24 resistors and E6/E12 capacitors.
					</p>
				{/if}
				{#if envelopeCheck && !envelopeCheck.spanOk}
					<p class="flag warn">
						With the rounded parts the passband moves by {envelopeCheck.span.toFixed(2)} dB, from {envelopeCheck.top.db.toFixed(2)} dB at
						{formatHz(envelopeCheck.top.f)} to {envelopeCheck.bottom.db.toFixed(2)} dB at {formatHz(envelopeCheck.bottom.f)}, past the {amaxDb} dB asked:
						{stock === 'E24' ? 'the E96 series or a looser Amax brings it back.' : 'a finer stock or a looser Amax brings it back.'}
					</p>
				{/if}
				{#if envelopeCheck && !envelopeCheck.stopOk}
					<p class="flag warn">
						With the rounded parts the ripple's nearest sideband, at {formatHz(rippleHz - fmMaxDemod)}, is only
						{(-envelopeCheck.atSideband).toFixed(1)} dB down, short of the {aminDb} dB asked: {stock === 'E24' ? 'the E96 series' : 'a finer stock'}, or a slightly larger Amin, which adds a stage, fixes it.
					</p>
				{/if}
				{#if envelopeCheck && envelopeCheck.maxQ > 4}
					<p class="flag warn">
						One stage has a Q of {envelopeCheck.maxQ.toFixed(1)}: a {envelopeDesign.topology === 'mfb' ? 'MFB stage' : 'unity-gain Sallen-Key'} that sharp leans on the op-amp's
						gain-bandwidth and on exact part values, so a build, and LTspice with a 3 MHz op-amp, give a smaller tone than
						the figures here. A Butterworth response, a tighter Amax, a lower Amin or a carrier further from the message brings the Q down.
					</p>
				{/if}
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
							{ t: demodPreview.env.t, y: demodPreview.env.y, color: 'var(--amber)', width: 2 }
						]}
						unit="ms"
					/>
				{/if}
				<p class="note">Faint: modulated input. Blue: rectified. Amber: recovered envelope (before the low-pass filter smooths the ripple away).</p>
				{#if demodOut}
					<table>
						<tbody>
							<tr><td>Output mean, for the {formatVolts(demodAmplitude)} carrier</td><td>{formatVolts(demodOut.mean)}{demodOut.exact ? ` (${demodOut.sign < 0 ? '-' : ''}2/pi of the carrier${demodOut.sign < 0 ? ', the MFB inverts' : ''})` : ` (an ideal diode: ${formatVolts(demodOut.ideal.mean)})`}</td></tr>
							<tr><td>Recovered tone at {formatHz(fmMaxDemod)}, index {demoModIndex}</td><td>{formatVolts(demodOut.tone)}{demodOut.exact ? '' : ` (an ideal diode: ${formatVolts(demodOut.ideal.tone)})`}, the filter's {demodOut.gainDb.toFixed(2)} dB included</td></tr>
						</tbody>
					</table>
					{#if !demodOut.exact}
						<p class="flag warn">The bare diode loses its drop on every crest and stops conducting where the envelope dips under it: the tone comes out at {((100 * demodOut.tone) / demodOut.ideal.tone).toFixed(0)} % of what an ideal diode would give, and distorted where the envelope is lowest. The precision rectifier gives twice the ideal half-wave figure, with no loss.</p>
					{/if}
				{/if}
			</section>

			{#if coupling}
				<section class="panel">
					<div class="panel-head">
						<span class="num">05</span>
						<h2>Output to the load</h2>
						<span class="hint">coupling capacitor</span>
					</div>
					<DiagramView diagram={buildOutputCouplingDiagram({ c: coupling.c, rLoad: coupling.rLoad, plusToward: coupling.plusToward })} label="coupling capacitor into the load" />
					<table>
						<tbody>
							<tr><td>C_out (electrolytic)</td><td>{formatFarads(coupling.c)}{coupling.stockShortfall ? ', not on the list: the next E6 value' : ''}, at least {formatFarads(coupling.cTarget)}</td></tr>
							<tr><td>Its + plate</td><td>{coupling.plusToward === 'load' ? 'toward the load: the filter output sits below 0 V' : 'toward the filter: its output sits above 0 V'}</td></tr>
							<tr><td>Voltage rating</td><td>16 V or more</td></tr>
							<tr><td>Corner f_c = 1/(2 pi R_L C)</td><td>{formatHz(coupling.fc)}</td></tr>
							<tr><td>Loss at {formatHz(fmMinDemod)} / at {formatHz(fmMaxDemod)}</td><td>{coupling.lossAtFmMin.toFixed(2)} dB / {(-20 * Math.log10(coupling.gainAtFm)).toFixed(2)} dB</td></tr>
							<tr><td>DC level kept off the load</td><td>{formatVolts(coupling.level)}, {(1000 * coupling.dcCurrentBlocked).toFixed(1)} mA it would have pushed through R_L</td></tr>
							<tr><td>Tone across the load</td><td>{formatVolts(coupling.toneAtLoad)} peak, {(1000 * coupling.peakCurrent).toFixed(1)} mA at its crest</td></tr>
							{#if coupling.listened}
								<tr><td>Power in the earphones</td><td>{(1000 * coupling.power).toFixed(2)} mW</td></tr>
							{/if}
						</tbody>
					</table>
					<p class="note">
						The capacitor blocks the DC level the rectifier leaves under the message and passes the message. It is sized on the
						same Amax as the low-pass: at most {amaxDb} dB lost at the lowest message frequency, then rounded up, since a larger
						C only makes the low end flatter.
					</p>
					<!-- only when the pair is the cause: a low-pass already off its spec is flagged in its own panel -->
					{#if bandCheck && !bandCheck.ok && envelopeCheck?.spanOk}
						<p class="flag warn">
							Through the low-pass and the capacitor together, the message band moves by {bandCheck.span.toFixed(2)} dB, from
							{bandCheck.top.db.toFixed(2)} dB at {formatHz(bandCheck.top.f)} to {bandCheck.bottom.db.toFixed(2)} dB at {formatHz(bandCheck.bottom.f)},
							past the {amaxDb} dB asked: the two ends sit too close for each to take all of it. A lower lowest frequency, or a looser Amax, brings it back.
						</p>
					{/if}
					{#if !coupling.currentOk}
						<p class="flag warn">
							The load takes {(1000 * coupling.peakCurrent).toFixed(1)} mA at the tone's crest:
							past about 10 mA a TL08x no longer drives it cleanly, and the sound comes out weak or distorted. A small audio
							amplifier between the two (an LM386 with a volume potentiometer, for instance) takes the current; an amplifier's
							input, about 10 kΩ, needs nothing more than the capacitor.
						</p>
					{/if}
					{#if !coupling.powerOk}
							<p class="flag warn">
								That is {(1000 * coupling.power).toFixed(1)} mW in the earphones, and most of them already play loud from 1 mW, around
								100 dB of sound{coupling.power > 0.01 ? ': this much can hurt the ears' : ''}. A volume potentiometer before them, or before
								the amplifier, brings it down: start low.
							</p>
						{/if}
						<MathPanel blocks={explainOutputCoupling(coupling)} />
				</section>
			{/if}

			<section class="panel">
				<div class="panel-head">
					<span class="num">{coupling ? '06' : '05'}</span>
					<h2>Download</h2>
				</div>
				<p class="note">A standalone script with this exact design, runnable with <code>node am-demodulator.js</code>.</p>
				<OpampPicker id="spiceOpampDemod" bind:value={spiceOpamp} />
				<div class="row downloads">
					<button type="button" onclick={downloadDemod}>Download am-demodulator.js</button>
					<button type="button" onclick={() => saveFile(generateDemodSchematic({ ...demodFiles, opamp: spiceOpamp, resistorSeries: parts.resistorSeries, pairs: parts.pairs }), 'am-demodulator.asc')}>Download .asc (LTspice)</button>
					<button type="button" onclick={() => saveFile(generateDemodNetlist({ ...demodFiles, opamp: spiceOpamp, resistorSeries: parts.resistorSeries, pairs: parts.pairs }), 'am-demodulator.cir')}>Download .cir (netlist)</button>
				</div>
				<p class="note">
					The LTspice files carry the whole demodulator behind a test source: a {formatVolts(demodAmplitude)} AM wave at
					{formatHz(fpCarrierDemod)} carrying a {formatHz(fmMaxDemod)} tone at index {demoModIndex}, all three on one .param
					line to change at will, then the {rectifierType === 'full' ? 'precision full-wave rectifier' : 'half-wave rectifier'} and the
					{envelopeDesign.realized.length === 1 ? `${envelopeDesign.topology === 'mfb' ? 'MFB' : 'Sallen-Key'} stage` : `${envelopeDesign.realized.length} ${envelopeDesign.topology === 'mfb' ? 'MFB' : 'Sallen-Key'} stages`} of the low-pass{coupling ? `, then C_out into the ${formatOhms(coupling.rLoad)} load` : ''}. Plot V(vam), V(vrect)
					and V(vout){coupling ? ', and V(vload) for what the load gets' : ''}; the .meas lines print the output's mean and peak-to-peak{demodOut ? `, which should read about ${formatVolts(demodOut.mean)} and ${formatVolts(2 * demodOut.tone)}` : ''}{envelopeCheck && envelopeCheck.maxQ > 4 ? ', the tone a little lower since one stage is sharp enough to lean on the op-amp' : ''}{coupling ? `, then for the load a mean near 0 V and ${formatVolts(2 * coupling.toneAtLoad)} peak to peak` : ''}.
					{spiceReal ? `The op-amps are the ${spiceOpamp} with its supply pins on +15 V and -15 V rails, its model written into the file.` : "The op-amps are the single-pole model with a TL08x's gain-bandwidth."}
					{rectifierType === 'full' && spiceOpamp === 'LM741' && 2.4e-6 * 2 * fpCarrierDemod > 0.1
						? `An LM741 (0.5 V/us) needs about 2.4 us to swing through the two diode drops at each zero crossing, ${(100 * 2.4e-6 * 2 * fpCarrierDemod).toFixed(0)} % of each half cycle at ${formatHz(fpCarrierDemod)}: expect the tone to come out lower.`
						: rectifierType === 'full'
							? "The op-amp takes a moment to cross the diodes' drop at each zero crossing, so the mean reads a percent or so low."
							: 'The rectifier is the bare diode; the op-amps only filter.'}
				</p>
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

	/* a heading for a group of buttons, styled as the labels around it */
	.labelLike {
		display: block;
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--textDim);
		margin-bottom: 0.35rem;
	}

	/* as tall as an input, so the row lines up with the fields beside it */
	.presets {
		gap: 0.5rem;
		flex-wrap: wrap;
		min-height: 2.25rem;
		align-items: center;
	}

	.measure {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1rem;
		align-items: stretch;
		margin-bottom: 0.9rem;
	}

	/* the rows box runs down to the last field beside it */
	.measure > .field.grow {
		display: flex;
		flex-direction: column;
		margin-bottom: 0;
	}

	.measure > .field.grow textarea {
		flex: 1;
		min-height: 8rem;
	}

	.estimate {
		margin-top: 0.45rem;
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

	/* the fields side by side, as on the filter page; auto-fill so a lone
	   field keeps a column's width instead of the whole row, columns no
	   narrower than the longest choice in a select, and the inputs of a row
	   in line at the bottom when a label runs to two lines */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1.1rem;
		align-items: end;
	}

	/* the last field keeps its margin too, so what follows the grid sits the
	   same distance under it however full the last row is */
	.grid > .field:last-child {
		margin-bottom: 0.9rem;
	}

	/* the fit window beside the measurements: one field under the other */
	.grid.narrow {
		grid-template-columns: 1fr;
		gap: 0;
	}

	.grid.narrow > .field:last-child {
		margin-bottom: 0;
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
	/* block, not grid: a details element lays its content out in an inner
	   slot, which a grid would size to the widest child */
	.exp2 {
		margin-top: 1rem;
	}

	.exp2 > :global(* + *) {
		margin-top: 0.6rem;
	}

	.exp2 summary {
		cursor: pointer;
		font-weight: 500;
	}
</style>
