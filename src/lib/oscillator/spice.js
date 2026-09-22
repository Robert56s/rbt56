import { renderNetlist, spiceValue } from '../spice/core';
import { DIODES, JFETS } from './limiter';
import { drawOscillator } from './schematic';

/**
 * LTspice export for the sine-wave oscillators.
 *
 * An oscillator has no input, so the analysis is a transient run, and it
 * needs a starting point: SPICE's operating point is a perfectly balanced
 * equilibrium and would sit there forever, and a tiny nudge would take
 * hundreds of cycles to grow to full amplitude. So the run starts from an
 * initial condition on one capacitor at the design amplitude (".tran ...
 * uic"), the way a real one looks a moment after switch-on, and the
 * limiter only has to hold it there. The run keeps its last cycles, a
 * .meas pair reports the realized frequency and amplitude in the log,
 * and .four reports the harmonics.
 *
 * Every part of the amplitude control is a real device here: the diodes
 * are the exponential model the design was sized against, the AGC's
 * JFET is a SPICE JFET, and the lamp is a resistor that heats up.
 */

/** Diodes back to back between two nodes. */
function antiParallelDiodes(a, b, i = 1) {
	return [
		{ kind: 'D', name: `D${i}`, nodes: [a, b], model: 'DX' },
		{ kind: 'D', name: `D${i + 1}`, nodes: [b, a], model: 'DX' }
	];
}

/** Which node the run measures. */
export function probeNode(design) {
	return design.topology === 'quadrature' ? 'vsin' : 'vout';
}

/**
 * The circuit of one design as a flat element list. Node names say what
 * they are: vout is the amplifier output, vsin and vcos the quadrature
 * pair, nm an inverting input held at virtual ground.
 */
export function buildElements(design) {
	const { topology, r, c, rg, parts, limiter, amplitude, requiredGain } = design;
	// a stabilizer that could not be sized (an AGC whose JFET needs a larger
	// output than asked for) has no parts to export
	const needed = limiter.kind === 'jfet' ? ['rSeries', 'rb', 'rx', 'cDet'] : limiter.kind === 'clamp' ? ['rn', 'rd1', 'rd2'] : limiter.kind === 'lamp' ? ['rf'] : ['rf1', 'rf2'];
	const missing = needed.filter((k) => !(parts[k] > 0));
	if (missing.length) throw new Error(`no export: ${missing.join(', ')} could not be sized for this design`);
	const out = [];

	if (topology === 'wien') {
		out.push({ kind: 'LABEL', text: 'Wien network: series R-C from the output, parallel R-C to ground' });
		out.push({ kind: 'R', name: 'RS', nodes: ['vout', 'ws'], value: r });
		out.push({ kind: 'C', name: 'CS', nodes: ['ws', 'wp'], value: c });
		out.push({ kind: 'R', name: 'RP', nodes: ['wp', '0'], value: r });
		// the starting point: the + input at what it sits at when the output is at full amplitude
		out.push({ kind: 'C', name: 'CP', nodes: ['wp', '0'], value: c, ic: amplitude / requiredGain });
		out.push({ kind: 'LABEL', text: 'negative feedback: gain 3 at balance, and what pulls it back there' });
		if (limiter.kind === 'diodes') {
			out.push({ kind: 'R', name: 'RF1', nodes: ['vout', 'wm'], value: parts.rf1 });
			out.push({ kind: 'R', name: 'RF2', nodes: ['wm', 'nm'], value: parts.rf2 });
			out.push(...antiParallelDiodes('wm', 'nm'));
			out.push({ kind: 'R', name: 'RG', nodes: ['nm', '0'], value: rg });
		} else if (limiter.kind === 'lamp') {
			out.push({ kind: 'R', name: 'RF', nodes: ['vout', 'nm'], value: parts.rf });
			out.push({ kind: 'LABEL', text: 'the lamp: a resistor that rises with its filament temperature; BTH pours the dissipated power into the thermal network CTH RTH, and V(theta) is the temperature rise in kelvin' });
			out.push({ kind: 'R', name: 'RLAMP', nodes: ['nm', '0'], value: 'R={Rcold*(1+alpha*V(theta))}' });
			out.push({ kind: 'B', name: 'BTH', nodes: ['0', 'theta'], spice: 'I=V(nm)*V(nm)/(Rcold*(1+alpha*V(theta)))' });
			// the run starts with the filament already hot, so it settles in a few cycles instead of a few hundred
			out.push({ kind: 'C', name: 'CTH', nodes: ['theta', '0'], value: limiter.cTh, ic: limiter.thetaHot });
			out.push({ kind: 'R', name: 'RTH', nodes: ['theta', '0'], value: limiter.rTh });
		} else {
			out.push({ kind: 'R', name: 'RF', nodes: ['vout', 'nm'], value: parts.rf });
			out.push({ kind: 'LABEL', text: 'the controlled leg: RSER in series with the JFET channel; RX1 and RX2 average the drain and the detector into the gate, which cancels the channel curvature' });
			out.push({ kind: 'R', name: 'RSER', nodes: ['nm', 'jd'], value: parts.rSeries });
			out.push({ kind: 'J', name: 'J1', nodes: ['jd', 'jg', '0'], model: 'JX' });
			out.push({ kind: 'R', name: 'RX1', nodes: ['jg', 'jd'], value: parts.rx });
			const div = parts.ra > 0 ? 'vdiv' : 'pk';
			out.push({ kind: 'R', name: 'RX2', nodes: ['jg', div], value: parts.rx });
			out.push({ kind: 'LABEL', text: 'peak detector: D1 charges CDET to the negative peak, RA RB scale it for the gate' });
			out.push({ kind: 'D', name: 'D1', nodes: ['pk', 'vout'], model: 'DX' });
			out.push({ kind: 'C', name: 'CDET', nodes: ['pk', '0'], value: parts.cDet });
			if (parts.ra > 0) out.push({ kind: 'R', name: 'RA', nodes: ['pk', 'vdiv'], value: parts.ra });
			out.push({ kind: 'R', name: 'RB', nodes: [div, '0'], value: parts.rb });
		}
		out.push({ kind: 'OP', name: 'U1', nodes: ['wp', 'nm', 'vout'] });
		return out;
	}

	if (topology === 'quadrature') {
		out.push({ kind: 'LABEL', text: 'integrator 1: its output is the sine; C1 starts charged so the run begins at full amplitude' });
		out.push({ kind: 'R', name: 'R1', nodes: ['vinv', 'n1'], value: r });
		out.push({ kind: 'C', name: 'C1', nodes: ['n1', 'vsin'], value: c, ic: -amplitude });
		out.push({ kind: 'OP', name: 'U1', nodes: ['0', 'n1', 'vsin'] });
		out.push({ kind: 'LABEL', text: 'integrator 2: one more 90 degrees, so its output is the cosine' });
		out.push({ kind: 'R', name: 'R2', nodes: ['vsin', 'n2'], value: r });
		out.push({ kind: 'C', name: 'C2', nodes: ['n2', 'vcos'], value: c });
		out.push({ kind: 'OP', name: 'U2', nodes: ['0', 'n2', 'vcos'] });
		out.push({ kind: 'LABEL', text: 'RN from the inverter output into integrator 2 is a negative conductance across C2: it is what makes the loop start' });
		out.push({ kind: 'R', name: 'RN', nodes: ['vinv', 'n2'], value: parts.rn });
		out.push({ kind: 'LABEL', text: 'the clamp: above the threshold the divider sets, the diodes dump current into the same input and damp the loop' });
		out.push({ kind: 'R', name: 'RD1', nodes: ['vcos', 'zt'], value: parts.rd1 });
		out.push({ kind: 'R', name: 'RD2', nodes: ['zt', '0'], value: parts.rd2 });
		out.push(...antiParallelDiodes('zt', 'n2'));
		out.push({ kind: 'LABEL', text: 'inverter closing the loop, gain exactly 1' });
		out.push({ kind: 'R', name: 'RA', nodes: ['vcos', 'n3'], value: parts.ra });
		out.push({ kind: 'R', name: 'RB', nodes: ['n3', 'vinv'], value: parts.rb });
		out.push({ kind: 'OP', name: 'U3', nodes: ['0', 'n3', 'vinv'] });
		return out;
	}

	// the three ladder topologies: n high-pass sections, the last shunt
	// resistor being the amplifier's input resistor
	const n = design.topo.ladder.sections;
	const buffered = design.topo.ladder.buffered;
	out.push({ kind: 'LABEL', text: `${n} high-pass RC sections${buffered ? ', each followed by a unity buffer' : ', hanging on each other'}; C1 starts charged so the run begins near full amplitude` });
	let src = 'vout';
	for (let k = 1; k <= n; k++) {
		const node = k === n ? 'nlast' : `n${k}`;
		out.push({ kind: 'C', name: `C${k}`, nodes: [src, node], value: c, ...(k === 1 ? { ic: amplitude } : {}) });
		if (k === n) {
			// the last shunt resistor is RG, its far end the virtual ground
			out.push({ kind: 'R', name: 'RG', nodes: [node, 'nm'], value: rg });
		} else {
			out.push({ kind: 'R', name: `R${k}`, nodes: [node, '0'], value: r });
			if (buffered) {
				out.push({ kind: 'OP', name: `UB${k}`, nodes: [node, `b${k}`, `b${k}`] });
				src = `b${k}`;
			} else {
				src = node;
			}
		}
	}
	out.push({ kind: 'LABEL', text: 'inverting amplifier: supplies the gain the ladder threw away, diodes across RF2 set the amplitude' });
	out.push({ kind: 'R', name: 'RF1', nodes: ['vout', 'fm'], value: parts.rf1 });
	out.push({ kind: 'R', name: 'RF2', nodes: ['fm', 'nm'], value: parts.rf2 });
	out.push(...antiParallelDiodes('fm', 'nm'));
	out.push({ kind: 'OP', name: 'U1', nodes: ['0', 'nm', 'vout'] });
	return out;
}

function meta(design) {
	const { topo, f0, amplitude, thd, opamp, limiter } = design;
	const stab = limiter.kind === 'diodes' ? 'diode limiting' : limiter.kind === 'lamp' ? 'lamp stabilized' : limiter.kind === 'jfet' ? 'JFET gain control' : 'damped by a diode clamp';
	const amp = limiter.amplitudeActual ?? amplitude;
	return {
		title: `${topo.label} sine oscillator, ${stab}, generated by rbt56.com/tools/oscillator/`,
		comments: [
			`should run at ${f0.toFixed(1)} Hz with a ${(opamp.gbw / 1e6).toFixed(1)} MHz op-amp (the RC values are retuned ${(100 * design.retunePercent).toFixed(1)} % for its phase lag)`,
			`output about ${amp.toFixed(2)} V peak; the loop needs a gain of ${design.requiredGain.toFixed(2)} and the amplifier is set to ${Number.isFinite(design.startGain) ? design.startGain.toFixed(2) : '?'} so it starts`,
			`expected distortion around ${(100 * thd).toFixed(2)} %`,
			...(limiter.regulates === false
				? ['', 'WARNING: with these parts the amplitude control cannot bring the loop gain back', 'to 1, so the output grows without limit here (the op-amp model has no supply', 'rails) and would clip on the rails of a real one.']
				: []),
			'',
			...outputNotes(design),
			'',
			'The run starts from an initial condition at the design amplitude (uic),',
			'so the limiter only has to hold it; the op-amp models start from zero',
			'internal state, so ignore the first few microseconds. The log (Ctrl+L)',
			'reports fosc, the realized frequency, and vpk, the amplitude. The .four',
			'distortion is only meaningful when fosc matches its frequency within',
			'about 0.1 %. The op-amp has no rails and no slew limit: over-swing shows',
			'as growth, not clipping.'
		]
	};
}

function analysisLines(design) {
	const { f0 } = design;
	// the lamp starts hot and the AGC's detector is charged within a few
	// dozen cycles, so a longer settle only matters for those two
	const settleCycles = design.limiter.kind === 'lamp' || design.limiter.kind === 'jfet' ? 120 : 40;
	const keep = 20;
	const stop = (settleCycles + keep) / f0;
	const start = settleCycles / f0;
	const step = 1 / (f0 * 400);
	const probe = probeNode(design);
	const taps = design.topo.ladder ? [`.four ${f0.toPrecision(6)} 9 1 V(nlast)`] : design.topology === 'quadrature' ? [`.four ${f0.toPrecision(6)} 9 1 V(vcos)`] : [];
	return [
		`.tran 0 ${stop.toPrecision(4)} ${start.toPrecision(4)} ${step.toPrecision(4)} uic`,
		`.meas TRAN vpk MAX V(${probe})`,
		`.meas TRAN t1 FIND time WHEN V(${probe})=0 RISE=3`,
		`.meas TRAN t2 FIND time WHEN V(${probe})=0 RISE=13`,
		'.meas TRAN fosc PARAM 10/(t2-t1)',
		`.four ${f0.toPrecision(6)} 9 1 V(${probe})`,
		...taps,
		'.options plotwinsize=0'
	];
}

/** Where the other outputs are, for the comments. */
function outputNotes(design) {
	if (design.topo.ladder) {
		const n = design.topo.ladder.sections;
		const notes = [`V(vout) is the amplifier output; V(nlast), the last ladder node, is the cleanest tap (${design.tapAmplitude.toFixed(2)} V peak, before the gain stage and its diodes).`];
		if (design.topology === 'bubba') notes.push('V(b2), two 45 degree sections from the output, is the quadrature output.');
		if (n === 3 && !design.topo.ladder.buffered) notes.push('V(n1) and V(n2) are the intermediate ladder nodes.');
		return notes;
	}
	if (design.topology === 'quadrature') return ['V(vsin) and V(vcos) are the sine and cosine outputs, V(vinv) the inverter output.'];
	return ['V(vout) is the output; V(wp) is the same signal a third as large, at the + input.'];
}

/** .param and .model lines the circuit needs. */
export function paramLines(design) {
	const lines = [`.param AOL=1meg GBW=${(design.opamp.gbw / 1e6).toPrecision(3)}meg`];
	if (design.limiter.kind === 'lamp') {
		lines.push(`.param Rcold=${spiceValue(design.limiter.rCold)} alpha=${spiceValue(design.limiter.alpha)}`);
	}
	if (design.limiter.kind !== 'lamp') lines.push((DIODES[design.diode] ?? DIODES['1N4148']).spice);
	if (design.limiter.kind === 'jfet') lines.push((JFETS[design.jfet] ?? JFETS.generic).spice);
	return lines;
}

export function generateNetlist(design, { ideal = false } = {}) {
	const { title, comments } = meta(design);
	return renderNetlist({
		elements: buildElements(design),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run.'],
		params: paramLines(design),
		directives: analysisLines(design),
		ideal
	});
}

export function generateSchematic(design) {
	const { title, comments } = meta(design);
	return drawOscillator(design, {
		title,
		comments,
		directives: ['.lib opamp.sub', ...paramLines(design).filter((l) => !l.startsWith('.param AOL')), ...analysisLines(design)],
		gbw: `${(design.opamp.gbw / 1e6).toPrecision(3)}Meg`
	});
}
