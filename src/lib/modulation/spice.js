import { buildElements as buildOscillatorElements, paramLines as oscillatorParamLines } from '../oscillator/spice';
import { renderNetlist } from '../spice/core';
import { drawModulator } from './schematic';

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

function meta(design, oscillator) {
	const { carrier, opamp, modulationIndex, topology } = design;
	return {
		title: `JFET AM modulator (${topology === 'inverting' ? 'inverting cell' : 'non-inverting cell'}), generated by rbt56.com/tools/am-modulator-demodulator/`,
		comments: [
			`carrier ${(carrier.fp / 1000).toFixed(1)} kHz at ${carrier.ac.toFixed(3)} V, modulation index ${modulationIndex.toFixed(3)} by design`,
			`V_P = ${design.vp.toFixed(2)} V, I_DSS = ${(design.idss * 1000).toFixed(2)} mA, bias V_C = ${design.vc.toFixed(2)} V`,
			oscillator ? `carrier from a ${oscillator.topo.label} oscillator built into the same sheet` : 'carrier from an external generator',
			'',
			'The page designs against a straight-line channel conductance and ideal',
			'op-amps. Here the JFET is the full square-law device and the op-amps',
			'have a real gain-bandwidth, so this run shows what those assumptions',
			'cost: plot V(vout) and compare the envelope crest with the trough.',
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

export function generateNetlist({ design, fmPreview = 1000, oscillator = null, ideal = false }) {
	const { title, comments } = meta(design, oscillator);
	return renderNetlist({
		elements: buildElements({ design, fmPreview, oscillator }),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run,', 'then plot V(vout) for the modulated carrier and V(vgate) for the gate drive.'],
		params: params(design, oscillator),
		directives: analysis(design, fmPreview, oscillator),
		ideal
	});
}

export function generateSchematic({ design, fmPreview = 1000, oscillator = null }) {
	const { title, comments } = meta(design, oscillator);
	return drawModulator({ design, fmPreview, oscillator }, {
		title,
		comments: [...comments, 'Plot V(vout) after Run; V(vgate) is the gate drive.'],
		directives: ['.lib opamp.sub', ...params(design, oscillator).filter((l) => !l.startsWith('.param AOL')), ...analysis(design, fmPreview, oscillator)],
		gbw: `${(design.opamp.gbw / 1e6).toPrecision(3)}Meg`
	});
}
