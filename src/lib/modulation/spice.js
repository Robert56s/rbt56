import { chainElements } from '../filter/spice';
import { buildElements as buildOscillatorElements, paramLines as oscillatorParamLines } from '../oscillator/spice';
import { renderNetlist } from '../spice/core';
import { opampModel, opampPhrase } from '../spice/opamps';
import { DIODE_MODELS } from './diodeLaw';
import { recoveredEnvelope } from './rectifier';
import { drawDemodulator, drawDiodeModulator, drawModulator } from './schematic';

/**
 * LTspice export for the JFET AM modulator: the gate-drive summer, the
 * carrier path, and the gain cell in whichever topology was chosen, with
 * the JFET as a real SPICE device rather than the straight-line model the
 * page designs against. That is the point of exporting it: the page
 * assumes the channel conductance is exactly linear in V_GS and that the
 * op-amps are ideal, and a transient run with the full square-law device
 * and a gain-bandwidth-limited amplifier shows what those assumptions
 * cost.
 *
 * SPICE's NJF model writes the triode current as
 *   I_D = Beta * V_DS * (2 (V_GS - Vto) - V_DS)
 * against this tool's
 *   I_D = beta * [(V_GS - V_P) V_DS - V_DS^2 / 2]
 * so Vto = V_P and Beta = beta / 2 = I_DSS / V_P^2.
 */

/**
 * Renames an oscillator's nodes so it can be dropped into a larger
 * circuit. The oscillator export starts its own run from an initial
 * condition with uic; here the modulator needs its operating point, so
 * the capacitor's initial condition is dropped and a .ic on the Wien
 * node gives the loop its nudge instead (see analysis()).
 */
function embedOscillator(design, outputNode) {
	return buildOscillatorElements(design).map((e) => {
		if (e.kind === 'LABEL') return { ...e, text: `carrier oscillator: ${e.text}` };
		const { ic, ...rest } = e;
		void ic;
		return {
			...rest,
			name: `${e.name}O`,
			nodes: e.nodes.map((n) => (n === '0' ? '0' : n === 'vout' ? outputNode : `osc_${n}`))
		};
	});
}

/**
 * The whole modulator as a flat element list.
 *   design       from designJfetModulator
 *   fmPreview    Hz, the message tone the transient run uses
 *   oscillator   a design from designOscillator, or null for a plain source
 */
export function buildElements({ design, fmPreview = 1000, oscillator = null }) {
	const { conditioning, carrier, topology, vc } = design;
	const s = conditioning.summer;
	const out = [];

	out.push({ kind: 'LABEL', text: 'supply rail, used only by the gate-drive summer to make the negative bias' });
	out.push({ kind: 'V', name: 'VCC', nodes: ['vcc', '0'], spice: `${conditioning.vcc}` });

	out.push({ kind: 'LABEL', text: 'message source, and the summer that gives it the right level and DC' });
	out.push({ kind: 'V', name: 'VM', nodes: ['vm', '0'], spice: `SIN(0 ${conditioning.sourceAmplitude} ${fmPreview})` });
	out.push({ kind: 'C', name: 'CIN', nodes: ['vm', 'nac'], value: s.c });
	out.push({ kind: 'R', name: 'RAC', nodes: ['nac', 'nsum'], value: s.rac });
	out.push({ kind: 'R', name: 'RBIAS', nodes: ['vcc', 'nsum'], value: s.rbias });
	out.push({ kind: 'R', name: 'RF', nodes: ['nsum', 'vgate'], value: s.rf });
	out.push({ kind: 'OP', name: 'US', nodes: ['0', 'nsum', 'vgate'] });

	if (oscillator) {
		out.push({ kind: 'LABEL', text: `carrier: a ${oscillator.topo.label} oscillator, then the divider that brings it down` });
		out.push(...embedOscillator(oscillator, 'vcar'));
	} else {
		out.push({ kind: 'LABEL', text: 'carrier source, and the divider that brings it down to what the JFET can take' });
		out.push({ kind: 'V', name: 'VC', nodes: ['vcar', '0'], spice: `SIN(0 ${carrier.sourceAmplitude} ${carrier.fp})` });
	}
	if (carrier.divider.top > 0) {
		out.push({ kind: 'R', name: 'RDT', nodes: ['vcar', 'vac'], value: carrier.divider.top });
		out.push({ kind: 'R', name: 'RDB', nodes: ['vac', '0'], value: carrier.divider.bottom });
	} else {
		out.push({ kind: 'R', name: 'RDB', nodes: ['vcar', 'vac'], value: 1 });
	}

	if (topology === 'inverting') {
		let drive = 'vac';
		if (design.buffer?.enabled !== false) {
			// the follower, with the few ohms of output impedance the page assumes for it
			out.push({ kind: 'LABEL', text: 'the follower that drives the channel from a few ohms (RZS is its output impedance), then the cell' });
			out.push({ kind: 'OP', name: 'UB', nodes: ['vac', 'vbuf', 'vbuf'] });
			out.push({ kind: 'R', name: 'RZS', nodes: ['vbuf', 'vdrv'], value: design.buffer?.zOut ?? 5 });
			drive = 'vdrv';
		} else {
			out.push({ kind: 'LABEL', text: 'no follower: the divider drives the channel through its own source impedance, which is what compresses the crest' });
		}
		out.push({ kind: 'J', name: 'J1', nodes: [drive, 'vgate', 'ncell'], model: 'JMOD' });
		out.push({ kind: 'R', name: 'R2', nodes: ['vcell', 'ncell'], value: design.r2 });
		out.push({ kind: 'OP', name: 'UC', nodes: ['0', 'ncell', 'vcell'] });
		if (design.postGain?.needed) {
			out.push({ kind: 'LABEL', text: 'fixed post-gain: brings the small cell output up to line level' });
			out.push({ kind: 'R', name: 'RPB', nodes: ['npg', '0'], value: design.postGain.rbottom });
			out.push({ kind: 'R', name: 'RPT', nodes: ['vout', 'npg'], value: design.postGain.rtop });
			out.push({ kind: 'OP', name: 'UP', nodes: ['vcell', 'npg', 'vout'] });
		} else {
			out.push({ kind: 'R', name: 'RLINK', nodes: ['vcell', 'vout'], value: 1 });
		}
	} else {
		out.push({ kind: 'LABEL', text: 'the gain cell: the channel is the lower leg of the feedback divider' });
		out.push({ kind: 'J', name: 'J1', nodes: ['ncell', 'vgate', '0'], model: 'JMOD' });
		out.push({ kind: 'R', name: 'RB', nodes: ['vout', 'ncell'], value: design.rb });
		out.push({ kind: 'OP', name: 'UC', nodes: ['vac', 'ncell', 'vout'] });
	}
	return out;
}

function meta(design, oscillator, opampChoice = 'ideal') {
	const { carrier, opamp, modulationIndex, topology } = design;
	const parts = opampModel(opampChoice).real ? `the op-amps are ${opampPhrase(opampChoice)}` : 'the op-amps';
	return {
		title: `JFET AM modulator (${topology === 'inverting' ? 'inverting cell' : 'non-inverting cell'}), generated by rbt56.com/tools/am-modulator-demodulator/`,
		comments: [
			`carrier ${(carrier.fp / 1000).toFixed(1)} kHz at ${carrier.ac.toFixed(3)} V, modulation index ${modulationIndex.toFixed(3)} by design`,
			`V_P = ${design.vp.toFixed(2)} V, I_DSS = ${(design.idss * 1000).toFixed(2)} mA, bias V_C = ${design.vc.toFixed(2)} V`,
			oscillator ? `carrier from a ${oscillator.topo.label} oscillator built into the same sheet` : 'carrier from an external generator',
			'',
			'The page designs against a straight-line channel conductance and ideal',
			...(opampModel(opampChoice).real
				? [`op-amps. Here the JFET is the full square-law device and ${parts},`, 'so this run shows what those assumptions cost: plot V(vout) and compare', 'the envelope crest with the trough.']
				: ['op-amps. Here the JFET is the full square-law device and the op-amps', 'have a real gain-bandwidth, so this run shows what those assumptions', 'cost: plot V(vout) and compare the envelope crest with the trough.']),
			`The design predicts an effective modulation index of ${opamp.effectiveModulationIndex.toFixed(3)} on the envelope and`,
			`${opamp.peakModulationIndex.toFixed(3)} read from the carrier peaks (the V_DS^2 term lifts every peak alike),`,
			`with ${(100 * opamp.thd).toFixed(2)} % audio distortion.`
		]
	};
}

function params(design, oscillator) {
	const beta = design.idss / (design.vp * design.vp);
	const lines = [
		`.param AOL=1meg GBW=${(design.opamp.gbw / 1e6).toPrecision(3)}meg`,
		`.model JMOD NJF(Vto=${design.vp.toPrecision(4)} Beta=${beta.toPrecision(4)} Lambda=1m)`
	];
	// whatever models and parameters the embedded oscillator's own export
	// carries, minus its op-amp line, which this sheet already has
	if (oscillator) lines.push(...oscillatorParamLines(oscillator).filter((l) => !l.startsWith('.param AOL')));
	return lines;
}

/**
 * The run: four message periods, saved after the carrier oscillator (if
 * any) has settled. Two initial conditions keep the start clean: the
 * coupling capacitor holds the charge a sine starting at phase 0 leaves
 * on it in steady state, so the gate bias does not drift through the
 * run, and the Wien node of an embedded oscillator starts at its
 * full-amplitude value so the carrier is there from the first cycle.
 */
function analysis(design, fmPreview, oscillator) {
	const periods = 4;
	const settle = oscillator ? 60 / oscillator.f0 : 0;
	const stop = settle + periods / fmPreview;
	const step = 1 / (design.carrier.fp * 100);
	const s = design.conditioning.summer;
	const lines = [
		`.tran 0 ${stop.toPrecision(4)} ${settle.toPrecision(4)} ${step.toPrecision(4)}`,
		`.ic V(nac)=${((design.conditioning.sourceAmplitude * s.fcActual) / fmPreview).toPrecision(4)}`
	];
	if (oscillator && oscillator.topology === 'wien') {
		const amp = oscillator.limiter.amplitudeActual ?? oscillator.amplitude;
		lines.push(`.ic V(osc_wp)=${(amp / oscillator.requiredGain).toPrecision(4)}`);
	}
	lines.push('.options plotwinsize=0');
	return lines;
}

export function generateNetlist({ design, fmPreview = 1000, oscillator = null, ideal = false, opamp = 'ideal' }) {
	const { title, comments } = meta(design, oscillator, opamp);
	return renderNetlist({
		elements: buildElements({ design, fmPreview, oscillator }),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run,', 'then plot V(vout) for the modulated carrier and V(vgate) for the gate drive.'],
		params: params(design, oscillator),
		directives: analysis(design, fmPreview, oscillator),
		ideal,
		opamp
	});
}

/**
 * The note on the drawn schematic, in two lines: what it is and what to
 * plot (the .cir carries the longer explanation).
 */
function schematicNotes(design, oscillator) {
	const { carrier, modulationIndex, topology } = design;
	const cell = topology === 'inverting' ? 'inverting cell' : 'non-inverting cell';
	const source = oscillator ? `carrier from the ${oscillator.topo.label} oscillator drawn below` : 'carrier from a generator';
	return [
		`JFET AM modulator, ${cell} (rbt56.com/tools/am-modulator-demodulator): ${(carrier.fp / 1000).toFixed(1)} kHz carrier, n = ${modulationIndex.toFixed(2)}, ${source}`,
		'Run, then plot V(vout) for the modulated carrier and V(vgate) for the gate drive.'
	];
}

export function generateSchematic({ design, fmPreview = 1000, oscillator = null, opamp = 'ideal' }) {
	return drawModulator({ design, fmPreview, oscillator }, {
		comments: schematicNotes(design, oscillator),
		directives: ['.lib opamp.sub', ...params(design, oscillator).filter((l) => !l.startsWith('.param AOL')), ...analysis(design, fmPreview, oscillator)],
		gbw: `${(design.opamp.gbw / 1e6).toPrecision(3)}Meg`,
		opamp
	});
}

/* ------------------------------------------------------- demodulator */

/**
 * LTspice export of the envelope demodulator: an AM test wave from a
 * behavioural source (its carrier, tone and index on one .param line), the
 * rectifier the page chose, and the envelope low-pass stages exactly as
 * the page realized them, drawn with the Active Filter Design tool's own
 * Sallen-Key stage.
 *   rectifierType  'full' | 'half'
 *   rectifier      designPrecisionRectifier's or designHalfWaveRectifier's result
 *   envelope       designEnvelopeLowPass's result
 *   fp, fm, index  the test wave: carrier, tone and modulation index, 1 V carrier
 */
const DEMOD_AMPLITUDE = 1;

/**
 * What the run should show at the output: its mean and the recovered
 * tone's amplitude (exact for the precision rectifier, worked out with the
 * diode law for the bare diode). See recoveredEnvelope.
 */
export function demodExpectation({ rectifierType, rectifier, envelope, fm, index }) {
	return recoveredEnvelope({ rectifierType, rectifier, envelope, fm, index, amplitude: DEMOD_AMPLITUDE });
}

export function buildDemodElements({ rectifierType, rectifier, envelope }) {
	const out = [];
	out.push({ kind: 'LABEL', text: 'test signal: the AM wave Ac (1 + idx sin(2 pi fm t)) sin(2 pi fc t), set on the .param line' });
	out.push({ kind: 'BV', name: 'BAM', nodes: ['vam', '0'], spice: 'V=Ac*(1+idx*sin(2*pi*fm*time))*sin(2*pi*fc*time)' });
	if (rectifierType === 'half') {
		out.push({ kind: 'LABEL', text: 'half-wave rectifier: one diode, and RL to give it a path to ground' });
		out.push({ kind: 'D', name: 'D1', nodes: ['vam', 'vrect'], model: 'DX' });
		out.push({ kind: 'R', name: 'RL', nodes: ['vrect', '0'], value: rectifier.rl });
	} else {
		out.push({ kind: 'LABEL', text: 'precision full-wave rectifier (TI TIDU030): D1 conducts on the negative half, D2 on the positive' });
		out.push({ kind: 'OP', name: 'U1A', nodes: ['vam', 'nf', 'np'] });
		out.push({ kind: 'D', name: 'D1', nodes: ['nf', 'np'], model: 'DX' });
		out.push({ kind: 'D', name: 'D2', nodes: ['np', 'nh'], model: 'DX' });
		out.push({ kind: 'R', name: 'R3', nodes: ['nh', '0'], value: rectifier.r3 });
		out.push({ kind: 'R', name: 'R1', nodes: ['nf', 'ng'], value: rectifier.r1 });
		out.push({ kind: 'R', name: 'R2', nodes: ['ng', 'vrect'], value: rectifier.r2 });
		out.push({ kind: 'OP', name: 'U1B', nodes: ['nh', 'ng', 'vrect'] });
	}
	out.push({ kind: 'LABEL', text: `envelope low-pass: ${envelope.realized.length} unity-gain Sallen-Key stage${envelope.realized.length === 1 ? '' : 's'}` });
	out.push(...chainElements(envelope.realized, 'vrect', 'vout', 1));
	return out;
}

function demodParams(opts) {
	const { fp, fm, index } = opts;
	return [
		'.param AOL=1meg GBW=3meg',
		`.param Ac=${DEMOD_AMPLITUDE} idx=${Number(index.toPrecision(4))} fm=${Number(fm.toPrecision(6))} fc=${Number(fp.toPrecision(6))}`,
		(DIODE_MODELS[opts.rectifier?.diode] ?? DIODE_MODELS['1N4148']).spice
	];
}

/**
 * The run: the filter settles for six tone periods (its slowest poles sit
 * near the tone), then four periods are saved and measured. The .meas
 * lines take no window: they cover what is saved, exactly those four
 * periods (LTspice counts a window's times from the start of the saved
 * data, so a FROM/TO in absolute time would miss it). The step resolves
 * the carrier fifty times a cycle so the rectifier's corners are drawn.
 */
function demodAnalysis({ fp, fm }) {
	const start = 6 / fm;
	const stop = 10 / fm;
	const p = (x) => x.toPrecision(4);
	return [`.tran 0 ${p(stop)} ${p(start)} ${p(1 / (50 * fp))}`, '.meas TRAN vavg AVG V(vout)', '.meas TRAN vpp PP V(vout)', '.options plotwinsize=0'];
}

const RESPONSE_NAME = { butterworth: 'Butterworth', chebyshev: 'Chebyshev' };

function demodMeta(opts) {
	const { rectifierType, envelope, fp, fm, index } = opts;
	const full = rectifierType !== 'half';
	const ex = demodExpectation(opts);
	const ripple = full ? 2 * fp : fp;
	const kind = full ? 'precision full-wave rectifier' : 'half-wave rectifier';
	return {
		title: `AM envelope demodulator (${kind}, order-${envelope.n} ${RESPONSE_NAME[envelope.response] ?? envelope.response} low-pass), generated by rbt56.com/tools/am-modulator-demodulator/`,
		comments: [
			`test wave: ${DEMOD_AMPLITUDE} V carrier at ${(fp / 1000).toFixed(1)} kHz carrying a ${fm} Hz tone at index ${index}, set on the .param line`,
			`op-amps: ${opampPhrase(opts.opamp ?? 'ideal', '3meg')}`,
			`ripple at ${(ripple / 1000).toFixed(1)} kHz; the low-pass keeps up to ${fm} Hz within ${envelope.amaxDb} dB and cuts the ripple by ${envelope.aminDb} dB or more`,
			'',
			...(full
				? [
						`After the filter the message rides on a DC level of 2 Ac/pi = ${ex.mean.toFixed(3)} V (vavg in the log),`,
						`and the ${fm} Hz tone should read ${ex.tone.toFixed(3)} V in amplitude, so vpp near ${(2 * ex.tone).toFixed(3)} V:`,
						`2/pi of the wave, times the index, times the filter's ${ex.gainDb.toFixed(2)} dB at ${fm} Hz.`
					]
				: [
						'A single diode loses its forward drop on every crest and stops conducting where the envelope dips',
						`below it. Worked out with the diode law, the output's mean should read about ${ex.mean.toFixed(3)} V (vavg) and the`,
						`tone about ${ex.tone.toFixed(3)} V (vpp near ${(2 * ex.tone).toFixed(3)} V), where an ideal rectifier would give ${ex.ideal.mean.toFixed(3)} V and ${ex.ideal.tone.toFixed(3)} V:`,
						'that is what the half-wave choice costs next to the precision rectifier.'
					])
		]
	};
}

export function generateDemodNetlist(opts) {
	const { title, comments } = demodMeta(opts);
	return renderNetlist({
		elements: buildDemodElements(opts),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run,', 'then plot V(vam), V(vrect) after the rectifier and V(vout) for the recovered message.'],
		params: demodParams(opts),
		directives: demodAnalysis(opts),
		ideal: opts.ideal ?? false,
		opamp: opts.opamp ?? 'ideal'
	});
}

function demodNotes(opts) {
	const { rectifierType, envelope, fp, fm, index } = opts;
	const full = rectifierType !== 'half';
	return [
		`AM envelope demodulator, ${full ? 'precision full-wave' : 'half-wave'} rectifier and order-${envelope.n} ${RESPONSE_NAME[envelope.response] ?? envelope.response} low-pass (rbt56.com/tools/am-modulator-demodulator): ${(fp / 1000).toFixed(1)} kHz carrier, ${fm} Hz tone, index ${index}`,
		'Run, then plot V(vam), V(vrect) and V(vout); the .meas lines print the mean and the peak-to-peak of the recovered tone.'
	];
}

export function generateDemodSchematic(opts) {
	return drawDemodulator(opts, {
		comments: demodNotes(opts),
		directives: ['.lib opamp.sub', ...demodParams(opts).filter((l) => !l.startsWith('.param AOL')), ...demodAnalysis(opts)],
		gbw: '3Meg',
		opamp: opts.opamp ?? 'ideal'
	});
}

/* ------------------------------------------------- diode + tank modulator */

/**
 * LTspice export of the diode + tank modulator: the carrier and message
 * sources, the summer that adds them with the bias from -Vcc, the series
 * resistor and the diode, and the tank. The diode is the same SPICE model
 * the page's cycle-by-cycle design runs, so the run checks the design, not
 * a different part. The message tone is the highest one the tank has to
 * pass, where its slope takes the most off the index.
 *   design  designDiodeMixerModulator's result
 */
export function buildDiodeElements({ design }) {
	const { summer: s, carrierAmplitude, modAmplitude, fp, fmMax } = design;
	const out = [];
	if (s.rb) {
		out.push({ kind: 'LABEL', text: 'negative supply, used only to bias the diode through RB' });
		out.push({ kind: 'V', name: 'VEE', nodes: ['vee', '0'], spice: `${-design.vcc}` });
	}
	out.push({ kind: 'LABEL', text: 'carrier and message sources' });
	out.push({ kind: 'V', name: 'VC', nodes: ['vcar', '0'], spice: `SIN(0 ${carrierAmplitude} ${fp})` });
	out.push({ kind: 'V', name: 'VM', nodes: ['vm', '0'], spice: `SIN(0 ${modAmplitude} ${fmMax})` });
	out.push({ kind: 'LABEL', text: `the summer: vs = -(RF/RP) vcar - (RF/RM) vm${s.rb ? ' + (RF/RB) Vcc' : ''}` });
	out.push({ kind: 'R', name: 'RP', nodes: ['vcar', 'nsum'], value: s.rp });
	out.push({ kind: 'R', name: 'RM', nodes: ['vm', 'nsum'], value: s.rm });
	if (s.rb) out.push({ kind: 'R', name: 'RB', nodes: ['vee', 'nsum'], value: s.rb });
	out.push({ kind: 'R', name: 'RF', nodes: ['nsum', 'vs'], value: s.rf });
	out.push({ kind: 'OP', name: 'US', nodes: ['0', 'nsum', 'vs'] });
	out.push({ kind: 'LABEL', text: 'the switch: RS and the diode, into the tank' });
	out.push({ kind: 'R', name: 'RS', nodes: ['vs', 'na'], value: design.rs });
	out.push({ kind: 'D', name: 'D1', nodes: ['na', 'vout'], model: 'DX' });
	out.push({ kind: 'LABEL', text: 'the tank, tuned to the carrier: its voltage is the AM output' });
	out.push({ kind: 'L', name: 'L1', nodes: ['vout', '0'], value: design.inductance });
	design.capacitors.forEach((c, k) => out.push({ kind: 'C', name: `C${k + 1}`, nodes: ['vout', '0'], value: c }));
	out.push({ kind: 'R', name: 'RT', nodes: ['vout', '0'], value: design.rt });
	return out;
}

function diodeParams(design) {
	return ['.param AOL=1meg GBW=3meg', (DIODE_MODELS[design.diode] ?? DIODE_MODELS['1N4148']).spice];
}

/**
 * The run: the tank settles (its envelope time constant is 1 / (pi BW),
 * well under a millisecond), then three message periods are saved. The
 * step resolves the carrier a hundred times a cycle.
 */
function diodeAnalysis(design) {
	const tau = 1 / (Math.PI * design.bwLoaded);
	const start = Math.max(2 / design.fmMax, 20 * tau);
	const stop = start + 3 / design.fmMax;
	const p = (x) => x.toPrecision(4);
	return [`.tran 0 ${p(stop)} ${p(start)} ${p(1 / (100 * design.fp))}`, '.options plotwinsize=0'];
}

function diodeMeta(design, opamp = 'ideal') {
	const { fp, fmMax } = design;
	return {
		title: `Diode + tank AM modulator (switching modulator, ${design.diode}), generated by rbt56.com/tools/am-modulator-demodulator/`,
		comments: [
			`carrier ${(fp / 1000).toFixed(1)} kHz, tank at ${(design.f0Actual / 1000).toFixed(2)} kHz with a loaded band of ${design.bwLoaded.toFixed(0)} Hz, message tone ${fmMax} Hz`,
			`summer: carrier ${design.summer.drive.toFixed(2)} V and message ${design.summer.um.toFixed(2)} V at the diode, bias ${design.summer.vb.toFixed(3)} V`,
			`op-amp: ${opampPhrase(opamp, '3meg')}`,
			'',
			'The page works the diode out cycle by cycle with this same model. It predicts, at the output,',
			`a carrier of ${design.carrierOut.toFixed(3)} V, an index of ${design.modulationIndex.toFixed(3)} for a slow message and ${design.indexAtFmMax.toFixed(3)} for this ${fmMax} Hz tone`,
			`(the tank passes its sidebands at ${(100 * design.sidebandGain).toFixed(1)} % of the carrier), and ${(100 * design.thd).toFixed(1)} % distortion on the envelope.`,
			'Read the index from the envelope, n = (Vmax - Vmin) / (Vmax + Vmin), or from the sidebands in an FFT.'
		]
	};
}

export function generateDiodeNetlist({ design, ideal = false, opamp = 'ideal' }) {
	const { title, comments } = diodeMeta(design, opamp);
	return renderNetlist({
		elements: buildDiodeElements({ design }),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run,', 'then plot V(vout) for the AM wave and V(vs) for the summed drive.'],
		params: diodeParams(design),
		directives: diodeAnalysis(design),
		ideal,
		opamp
	});
}

function diodeNotes(design) {
	return [
		`Diode + tank AM modulator (rbt56.com/tools/am-modulator-demodulator): ${(design.fp / 1000).toFixed(1)} kHz carrier, ${design.fmMax} Hz tone, n = ${design.indexAtFmMax.toFixed(2)} expected at this tone (${design.modulationIndex.toFixed(2)} for a slow message)`,
		'Run, then plot V(vout) for the AM wave and V(vs) for the summed drive.'
	];
}

export function generateDiodeSchematic({ design, opamp = 'ideal' }) {
	return drawDiodeModulator({ design }, {
		comments: diodeNotes(design),
		directives: ['.lib opamp.sub', ...diodeParams(design).filter((l) => !l.startsWith('.param AOL')), ...diodeAnalysis(design)],
		gbw: '3Meg',
		opamp
	});
}
