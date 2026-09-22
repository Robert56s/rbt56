import { renderNetlist, renderSchematic } from '../spice/core';

/**
 * LTspice export for the sine-wave oscillators. An oscillator has no
 * input, so the analysis is a transient run, and it needs a nudge to
 * start: SPICE's operating point is a perfectly balanced equilibrium and
 * would sit there forever. An .ic on one node provides the nudge, exactly
 * as circuit noise does on a bench.
 *
 * The run discards the first stretch while the amplitude settles against
 * the limiter, then .four reports the harmonics of what is left, which is
 * the distortion figure the tool predicts.
 */

const DIODE_MODEL = '.model DX D(Is=2.5n N=1.7 Rs=0.6 Cjo=4p)';
const JFET_MODEL = '.model JX NJF(Vto=-2 Beta=1m Lambda=1m)';

/** Diodes back to back across a resistor, for the amplitude limiter. */
function antiParallelDiodes(a, b, i = 1) {
	return [
		{ kind: 'D', name: `D${i}`, nodes: [a, b], model: 'DX' },
		{ kind: 'D', name: `D${i + 1}`, nodes: [b, a], model: 'DX' }
	];
}

/**
 * The circuit of one design as a flat element list. Node names say what
 * they are: vout is the amplifier output, vsin and vcos the quadrature
 * pair, nm an inverting input held at virtual ground.
 */
export function buildElements(design) {
	const { topology, r, c, rg, parts, limiter } = design;
	const out = [];

	if (topology === 'wien') {
		out.push({ kind: 'LABEL', text: 'Wien network: series R-C from the output, parallel R-C to ground' });
		out.push({ kind: 'R', name: 'RS', nodes: ['vout', 'ws'], value: r });
		out.push({ kind: 'C', name: 'CS', nodes: ['ws', 'wp'], value: c });
		out.push({ kind: 'R', name: 'RP', nodes: ['wp', '0'], value: r });
		out.push({ kind: 'C', name: 'CP', nodes: ['wp', '0'], value: c });
		out.push({ kind: 'LABEL', text: 'negative feedback: gain 3 at balance, and what pulls it back there' });
		if (limiter.kind === 'diodes') {
			out.push({ kind: 'R', name: 'RF1', nodes: ['vout', 'wm'], value: parts.rf1 });
			out.push({ kind: 'R', name: 'RF2', nodes: ['wm', 'nm'], value: parts.rf2 });
			out.push(...antiParallelDiodes('wm', 'nm'));
			out.push({ kind: 'R', name: 'RG', nodes: ['nm', '0'], value: rg });
		} else if (design.stabilizer === 'lamp') {
			out.push({ kind: 'R', name: 'RF', nodes: ['vout', 'nm'], value: parts.rf });
			out.push({ kind: 'LABEL', text: 'RLAMP stands in for the lamp at its hot resistance; a real lamp raises it with temperature, which is the whole control loop and cannot be modelled by a plain resistor' });
			out.push({ kind: 'R', name: 'RLAMP', nodes: ['nm', '0'], value: limiter.lampHot });
		} else {
			out.push({ kind: 'R', name: 'RF', nodes: ['vout', 'nm'], value: parts.rf });
			out.push({ kind: 'R', name: 'RG1', nodes: ['nm', '0'], value: parts.rg1 });
			out.push({ kind: 'R', name: 'RG2', nodes: ['nm', 'jd'], value: parts.rg2 });
			out.push({ kind: 'J', name: 'J1', nodes: ['jd', 'jg', 'js'], model: 'JX' });
			out.push({ kind: 'R', name: 'RSRC', nodes: ['js', '0'], value: parts.rs });
			out.push({ kind: 'LABEL', text: 'peak detector: the negative swings charge CDET, which sets the gate' });
			out.push({ kind: 'R', name: 'RDET', nodes: ['vout', 'jg'], value: parts.rDet });
			out.push({ kind: 'D', name: 'D1', nodes: ['jg', 'vout'], model: 'DX' });
			out.push({ kind: 'C', name: 'CDET', nodes: ['jg', '0'], value: parts.cDet });
			out.push({ kind: 'R', name: 'RBLEED', nodes: ['jg', '0'], value: parts.rDet });
		}
		out.push({ kind: 'OP', name: 'U1', nodes: ['wp', 'nm', 'vout'] });
		return out;
	}

	if (topology === 'quadrature') {
		out.push({ kind: 'LABEL', text: 'integrator 1: its output is the sine' });
		out.push({ kind: 'R', name: 'R1', nodes: ['vinv', 'n1'], value: r });
		out.push({ kind: 'C', name: 'C1', nodes: ['n1', 'vsin'], value: c });
		out.push({ kind: 'OP', name: 'U1', nodes: ['0', 'n1', 'vsin'] });
		out.push({ kind: 'LABEL', text: 'integrator 2: one more 90 degrees, so its output is the cosine' });
		out.push({ kind: 'R', name: 'R2', nodes: ['vsin', 'n2'], value: r });
		out.push({ kind: 'C', name: 'C2', nodes: ['n2', 'vcos'], value: c });
		out.push({ kind: 'OP', name: 'U2', nodes: ['0', 'n2', 'vcos'] });
		out.push({ kind: 'LABEL', text: 'inverter closing the loop, with a little excess gain to start and diodes to stop' });
		out.push({ kind: 'R', name: 'RA', nodes: ['vcos', 'n3'], value: rg });
		out.push({ kind: 'R', name: 'RB1', nodes: ['n3', 'fm'], value: limiter.rf - limiter.rf2 });
		out.push({ kind: 'R', name: 'RB2', nodes: ['fm', 'vinv'], value: limiter.rf2 });
		out.push(...antiParallelDiodes('fm', 'vinv'));
		out.push({ kind: 'OP', name: 'U3', nodes: ['0', 'n3', 'vinv'] });
		return out;
	}

	// the three ladder topologies: n high-pass sections, the last shunt
	// resistor being the amplifier's input resistor
	const n = design.topo.ladder.sections;
	const buffered = design.topo.ladder.buffered;
	out.push({ kind: 'LABEL', text: `${n} high-pass RC sections${buffered ? ', each followed by a unity buffer' : ', hanging on each other'}` });
	let src = 'vout';
	for (let k = 1; k <= n; k++) {
		const node = k === n ? 'nlast' : `n${k}`;
		out.push({ kind: 'C', name: `C${k}`, nodes: [src, node], value: c });
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
	out.push({ kind: 'LABEL', text: 'inverting amplifier: supplies the gain the ladder threw away, diodes set the amplitude' });
	out.push({ kind: 'R', name: 'RF1', nodes: ['vout', 'fm'], value: limiter.rf - limiter.rf2 });
	out.push({ kind: 'R', name: 'RF2', nodes: ['fm', 'nm'], value: limiter.rf2 });
	out.push(...antiParallelDiodes('fm', 'nm'));
	out.push({ kind: 'OP', name: 'U1', nodes: ['0', 'nm', 'vout'] });
	return out;
}

function needsDiodes(design) {
	return !(design.topology === 'wien' && design.stabilizer !== 'diodes');
}

function meta(design) {
	const { topo, f0, amplitude, thd, opamp } = design;
	const stab = design.stabilizer ? `, ${design.stabilizer} limiting` : '';
	return {
		title: `${topo.label} sine oscillator${stab}, generated by rbt56.com/tools/oscillator/`,
		comments: [
			`f0 = ${f0.toFixed(1)} Hz, output about ${amplitude.toFixed(2)} V peak`,
			`the loop needs a gain of ${design.requiredGain.toFixed(2)}; the amplifier is set to ${design.startGain.toFixed(2)} so it starts`,
			`expected distortion around ${(100 * thd).toFixed(2)} %, op-amp gain-bandwidth ${(opamp.gbw / 1e6).toFixed(1)} MHz`,
			'',
			'An oscillator has no input: SPICE would sit in its perfectly balanced',
			'operating point forever, so the .ic below nudges one node the way',
			'circuit noise does on a bench. The run throws away the start-up while',
			'the amplitude settles against the limiter, then .four measures the',
			'harmonics of what is left.'
		]
	};
}

function analysisLines(design, { forNetlist }) {
	const { f0 } = design;
	const cycles = 60;
	const settle = 40;
	const stop = cycles / f0;
	const start = settle / f0;
	const step = 1 / (f0 * 400);
	const probe = design.outputs === 'quadrature' && design.topology === 'quadrature' ? 'vsin' : 'vout';
	const kick = design.topology === 'quadrature' ? 'vsin' : design.topology === 'wien' ? 'wp' : 'n1';
	return [
		`.ic V(${kick})=0.1`,
		`.tran 0 ${stop.toPrecision(4)} ${start.toPrecision(4)} ${step.toPrecision(4)}`,
		`.four ${f0.toPrecision(6)} 9 V(${probe})`,
		'.options plotwinsize=0',
		...(forNetlist ? [`* plot V(${probe})${design.outputs === 'quadrature' ? ' and the second output' : ''}; the .four result is in the error log (Ctrl+L)` ] : [])
	];
}

function paramLines(design) {
	const lines = [`.param AOL=1meg GBW=${(design.opamp.gbw / 1e6).toPrecision(3)}meg`];
	if (needsDiodes(design)) lines.push(DIODE_MODEL);
	if (design.stabilizer === 'jfet') lines.push(JFET_MODEL);
	return lines;
}

export function generateNetlist(design, { ideal = false } = {}) {
	const { title, comments } = meta(design);
	return renderNetlist({
		elements: buildElements(design),
		title,
		comments: [...comments, '', 'Open in LTspice (File > Open, set the filter to All Files) and Run.'],
		params: paramLines(design),
		directives: analysisLines(design, { forNetlist: true }),
		ideal
	});
}

export function generateSchematic(design) {
	const { title, comments } = meta(design);
	return renderSchematic({
		elements: buildElements(design),
		title,
		comments,
		directives: ['.lib opamp.sub', ...paramLines(design).filter((l) => l.startsWith('.model')), ...analysisLines(design, { forNetlist: false })],
		gbw: `${(design.opamp.gbw / 1e6).toPrecision(3)}Meg`
	});
}
