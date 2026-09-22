import { placeSymbol, label, createNet, portPoints } from '../filter/schematic';
import { formatFarads, formatOhms } from '../modulation/format';

const SCALE = 48;
const MARGIN = 24;
const HANG = { resistor_down: 0.51, capacitor_down: 0.3 };

/**
 * Drawing rules kept throughout this file, because the geometry harness
 * checks them: every wire runs between real port coordinates (a symbol's
 * ports sit a pixel or two off its placement point, so a rail's height is
 * read back from a port rather than assumed), and a rail crossing several
 * nodes is drawn as one segment per span rather than one long line, which
 * is what keeps wires out of component bodies.
 */

/** A vertical drop from `from` to the height of `to`, then across. */
function elbowV(net, from, to) {
	const corner = { x: from.x, y: to.y };
	net.wire(from, corner);
	net.wire(corner, to);
}

/** Across to `to`'s column, then vertically. */
function elbowH(net, from, to) {
	const corner = { x: to.x, y: from.y };
	net.wire(from, corner);
	net.wire(corner, to);
}

/** Resistor hanging from a node down to ground; returns its parts. */
function shuntResistor(net, node, value, side = 'right') {
	const R = placeSymbol('resistor_down', node.x, node.y + HANG.resistor_down * SCALE, SCALE);
	const g = placeSymbol('ground_down', R.ports['2'].x - 0.01 * SCALE, R.ports['2'].y + 0.29 * SCALE, SCALE);
	net.wire(node, R.ports['1']);
	net.wire(R.ports['2'], g.ports['1']);
	const mid = (R.ports['1'].y + R.ports['2'].y) / 2;
	return {
		svgs: [R.svg, g.svg],
		symbols: [R, g],
		label: label(`R ${formatOhms(value)}`, side === 'right' ? R.ports['1'].x + 14 : R.ports['1'].x - 14, mid, { anchor: side === 'right' ? 'start' : 'end' }),
		bottom: g.ports['1']
	};
}

/**
 * Wien bridge. The op-amp sits on the right. Along the bottom, the Wien
 * network runs from the output back to the + input: a resistor and a
 * capacitor in series, then a resistor and a capacitor in parallel to
 * ground. Along the top, the negative feedback runs from the output back
 * to the - input through Rf, with the lower leg Rg to ground. What sits
 * in that lower leg is what holds the amplitude, and it is drawn on its
 * own by buildLimiterDiagram.
 */
export function buildWienDiagram(design) {
	const { parts, limiter, stabilizer } = design;
	const y0 = 240;
	const net = createNet();
	const opamp = placeSymbol('opamp_no_power_right', MARGIN + 520, y0, SCALE);
	const plus = opamp.ports.inp1;
	const minus = opamp.ports.inp2;
	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	// --- Wien network, bottom rail
	const wienY = y0 + 170;
	const Rs = placeSymbol('resistor_right', MARGIN + 110, wienY, SCALE);
	const rail = Rs.ports['1'].y;
	const Cs = placeSymbol('capacitor_right', Rs.ports['2'].x + 70, wienY, SCALE);
	const wp = { x: Cs.ports['2'].x + 80, y: rail };
	const Rp = shuntResistor(net, wp, design.r, 'right');
	const cpNode = { x: wp.x + 110, y: rail };
	const Cp = placeSymbol('capacitor_down', cpNode.x, cpNode.y + HANG.capacitor_down * SCALE, SCALE);
	const gndCp = placeSymbol('ground_down', Cp.ports['2'].x - 0.01 * SCALE, Cp.ports['2'].y + 0.29 * SCALE, SCALE);

	// the output comes back on a rail below everything, then rises into the
	// left end of the series arm: that way nothing crosses the parts above
	const returnY = gndCp.ports['1'].y + 70;
	net.wire(Vout, { x: Vout.x, y: returnY });
	net.wire({ x: Vout.x, y: returnY }, { x: Rs.ports['1'].x - 60, y: returnY });
	net.wire({ x: Rs.ports['1'].x - 60, y: returnY }, { x: Rs.ports['1'].x - 60, y: rail });
	net.wire({ x: Rs.ports['1'].x - 60, y: rail }, Rs.ports['1']);
	net.wire(Rs.ports['2'], Cs.ports['1']);
	net.wire(Cs.ports['2'], wp);
	net.wire(wp, cpNode);
	net.wire(cpNode, Cp.ports['1']);
	net.wire(Cp.ports['2'], gndCp.ports['1']);
	// and up into the + input, entering from its own left
	const upX = cpNode.x + 80;
	net.wire(cpNode, { x: upX, y: rail });
	net.wire({ x: upX, y: rail }, { x: upX, y: plus.y });
	net.wire({ x: upX, y: plus.y }, plus);

	// --- negative feedback, top rail
	const Rf = placeSymbol('resistor_right', minus.x - 130, y0 - 150, SCALE);
	const fbRail = Rf.ports['1'].y;
	const legTop = { x: Rf.ports['1'].x - 90, y: minus.y };
	net.wire(Vout, { x: Vout.x, y: fbRail });
	net.wire({ x: Vout.x, y: fbRail }, Rf.ports['2']);
	net.wire(Rf.ports['1'], { x: legTop.x, y: fbRail });
	net.wire({ x: legTop.x, y: fbRail }, legTop);
	net.wire(legTop, minus);

	// --- lower feedback leg, always drawn as one element: what really sits
	// there (diodes across part of Rf, a lamp, or a JFET under control of a
	// peak detector) gets its own diagram, where there is room to show it
	const Rg = placeSymbol('resistor_down', legTop.x, legTop.y + HANG.resistor_down * SCALE, SCALE);
	const gndRg = placeSymbol('ground_down', Rg.ports['2'].x - 0.01 * SCALE, Rg.ports['2'].y + 0.29 * SCALE, SCALE);
	net.wire(legTop, Rg.ports['1']);
	net.wire(Rg.ports['2'], gndRg.ports['1']);
	const legParts = [Rg.svg, gndRg.svg];
	const legSymbols = [Rg, gndRg];
	const legLabels = [
		label(
			stabilizer === 'lamp' ? `lamp, hot ${formatOhms(limiter.lampHot)}` : stabilizer === 'jfet' ? `Rg1 ${formatOhms(parts.rg1)} (with the AGC leg)` : `Rg ${formatOhms(design.rg)}`,
			Rg.ports['1'].x + 14,
			(Rg.ports['1'].y + Rg.ports['2'].y) / 2,
			{ anchor: 'start' }
		)
	];
	const legBottomY = gndRg.ports['1'].y;

	const all = [
		opamp.svg,
		Rs.svg,
		Cs.svg,
		...Rp.svgs,
		Cp.svg,
		gndCp.svg,
		Rf.svg,
		...legParts,
		net.svg(),
		net.dots(portPoints(opamp, Rs, Cs, ...Rp.symbols, Cp, gndCp, Rf, ...legSymbols)),
		label('Vout', Vout.x + 46, Vout.y + 5, { anchor: 'start' }),
		label(`R ${formatOhms(design.r)}`, Rs.ports['1'].x, rail - 16, { anchor: 'start' }),
		label(`C ${formatFarads(design.c)}`, Cs.ports['1'].x, rail - 16, { anchor: 'start' }),
		Rp.label,
		label(`C ${formatFarads(design.c)}`, Cp.ports['1'].x + 14, (Cp.ports['1'].y + Cp.ports['2'].y) / 2, { anchor: 'start' }),
		label(
			stabilizer === 'diodes' ? `Rf1 + Rf2 = ${formatOhms(parts.rf1 + parts.rf2)}` : `Rf ${formatOhms(parts.rf)}`,
			Rf.ports['1'].x,
			fbRail - 14,
			{ anchor: 'start' }
		),
		...legLabels
	];
	const top = fbRail - 60;
	const width = Vout.x + 40 + 90;
	return { svg: all.join(''), viewBox: `0 ${top} ${width} ${Math.max(gndCp.ports['1'].y + 140, legBottomY + 70) - top}` };
}

/**
 * The phase-shift family: n high-pass RC sections feeding an inverting
 * amplifier, with a unity buffer after each section when the topology
 * calls for one. The last shunt resistor is the amplifier's own input
 * resistor, which is why nothing else loads the ladder.
 */
export function buildLadderDiagram(design) {
	const n = design.topo.ladder.sections;
	const buffered = design.topo.ladder.buffered;
	const y0 = 220;
	const net = createNet();
	const svgs = [];
	const symbols = [];
	const labels = [];

	const startX = MARGIN + 40;
	let src = { x: startX, y: y0 };
	let railY = y0;
	for (let k = 1; k <= n; k++) {
		const C = placeSymbol('capacitor_right', src.x + 70, railY, SCALE);
		if (k === 1) railY = C.ports['1'].y;
		const node = C.ports['2'];
		net.wire({ x: src.x, y: railY }, C.ports['1']);
		svgs.push(C.svg);
		symbols.push(C);
		labels.push(label(`C ${formatFarads(design.c)}`, C.ports['1'].x, railY - 16, { anchor: 'start' }));
		if (k === n) {
			src = node;
			break;
		}
		const sh = shuntResistor(net, node, design.r, 'left');
		svgs.push(...sh.svgs);
		symbols.push(...sh.symbols);
		labels.push(sh.label);
		if (buffered) {
			const buf = placeSymbol('opamp_no_power_right', node.x + 110, node.y + 0.18 * SCALE, SCALE);
			net.wire(node, buf.ports.inp1);
			const loopY = buf.ports.out.y + 70;
			const backX = buf.ports.inp2.x - 34;
			net.wire(buf.ports.out, { x: buf.ports.out.x, y: loopY });
			net.wire({ x: buf.ports.out.x, y: loopY }, { x: backX, y: loopY });
			net.wire({ x: backX, y: loopY }, { x: backX, y: buf.ports.inp2.y });
			net.wire({ x: backX, y: buf.ports.inp2.y }, buf.ports.inp2);
			svgs.push(buf.svg);
			symbols.push(buf);
			labels.push(label(`x${k}`, buf.ports.out.x + 8, buf.ports.out.y - 12, { anchor: 'start', cls: 'lbl note' }));
			// the buffer output carries on at the buffer's own output height
			net.wire(buf.ports.out, { x: buf.ports.out.x + 40, y: buf.ports.out.y });
			src = { x: buf.ports.out.x + 40, y: buf.ports.out.y };
			railY = buf.ports.out.y;
		} else {
			src = node;
		}
	}

	// the last shunt resistor is Rg, straight into the virtual ground
	const Rg = placeSymbol('resistor_right', src.x + 70, railY, SCALE);
	net.wire(src, Rg.ports['1']);
	svgs.push(Rg.svg);
	symbols.push(Rg);
	labels.push(label(`Rg ${formatOhms(design.rg)}`, Rg.ports['1'].x, railY - 16, { anchor: 'start' }));

	const opamp = placeSymbol('opamp_no_power_right', Rg.ports['2'].x + 170, railY - 0.09 * SCALE, SCALE);
	const minus = opamp.ports.inp2;
	const gndPlus = placeSymbol('ground_down', opamp.ports.inp1.x - 35 - 0.01 * SCALE, opamp.ports.inp1.y + 46 + 0.29 * SCALE, SCALE);
	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const fbX = minus.x - 100;
	const fbTee = { x: fbX, y: minus.y };
	net.wire(Rg.ports['2'], fbTee);
	net.wire(fbTee, minus);
	elbowH(net, opamp.ports.inp1, gndPlus.ports['1']);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });
	svgs.push(opamp.svg, gndPlus.svg);
	symbols.push(opamp, gndPlus);

	// feedback resistor on a rail above
	const Rf = placeSymbol('resistor_right', (minus.x + Vout.x) / 2, y0 - 150, SCALE);
	const fbRail = Rf.ports['1'].y;
	net.wire(fbTee, { x: fbX, y: fbRail });
	net.wire({ x: fbX, y: fbRail }, Rf.ports['1']);
	net.wire(Rf.ports['2'], { x: Vout.x, y: fbRail });
	net.wire({ x: Vout.x, y: fbRail }, Vout);
	svgs.push(Rf.svg);
	symbols.push(Rf);
	labels.push(label(`Rf ${formatOhms(design.limiter.rf)}`, Rf.ports['1'].x, fbRail - 14, { anchor: 'start' }));

	// the loop closes under the row
	const backY = Math.max(...symbols.map((s) => Math.max(...Object.values(s.ports).map((p) => p.y)))) + 90;
	net.wire(Vout, { x: Vout.x, y: backY });
	net.wire({ x: Vout.x, y: backY }, { x: startX, y: backY });
	net.wire({ x: startX, y: backY }, { x: startX, y: railY === y0 ? y0 : y0 });
	labels.push(label('Vout', Vout.x + 46, Vout.y + 5, { anchor: 'start' }), label('the loop closes here', startX + 12, backY - 14, { anchor: 'start', cls: 'lbl note' }));

	const all = [...svgs, net.svg(), net.dots(portPoints(...symbols)), ...labels];
	const top = fbRail - 50;
	return { svg: all.join(''), viewBox: `0 ${top} ${Vout.x + 40 + 90} ${backY + 60 - top}` };
}

/**
 * Quadrature: two integrators and an inverter in a loop. Each integrator
 * turns the signal by 90 degrees, so the two integrator outputs are a
 * sine and a cosine of the same amplitude, and the inverter supplies the
 * remaining 180 degrees to close the loop.
 */
export function buildQuadratureDiagram(design) {
	const y0 = 200;
	const net = createNet();
	const svgs = [];
	const symbols = [];
	const labels = [];
	const startX = MARGIN + 30;
	let src = { x: startX, y: y0 };
	let rail = y0;
	const outs = [];

	for (let k = 1; k <= 2; k++) {
		const R = placeSymbol('resistor_right', src.x + 70, rail, SCALE);
		if (k === 1) rail = R.ports['1'].y;
		const node = R.ports['2'];
		net.wire({ x: src.x, y: rail }, R.ports['1']);
		const amp = placeSymbol('opamp_no_power_right', node.x + 120, rail - 0.09 * SCALE, SCALE);
		const gnd = placeSymbol('ground_down', amp.ports.inp1.x - 45 - 0.01 * SCALE, amp.ports.inp1.y + 46 + 0.29 * SCALE, SCALE);
		const out = { x: amp.ports.out.x + 70, y: amp.ports.out.y };
		net.wire(node, amp.ports.inp2);
		elbowH(net, amp.ports.inp1, gnd.ports['1']);
		net.wire(amp.ports.out, out);
		// the integrating capacitor on a rail above
		const C = placeSymbol('capacitor_right', (node.x + out.x) / 2, y0 - 120, SCALE);
		const cRail = C.ports['1'].y;
		net.wire(node, { x: node.x, y: cRail });
		net.wire({ x: node.x, y: cRail }, C.ports['1']);
		net.wire(C.ports['2'], { x: out.x, y: cRail });
		net.wire({ x: out.x, y: cRail }, out);
		svgs.push(R.svg, amp.svg, gnd.svg, C.svg);
		symbols.push(R, amp, gnd, C);
		labels.push(
			label(`R ${formatOhms(design.r)}`, R.ports['1'].x, rail + 26, { anchor: 'start' }),
			label(`C ${formatFarads(design.c)}`, C.ports['1'].x, cRail - 14, { anchor: 'start' }),
			label(k === 1 ? 'sine' : 'cosine', out.x + 8, out.y - 14, { anchor: 'start' })
		);
		outs.push(out);
		src = out;
		rail = out.y;
	}

	// the inverter, on its own row below, closing the loop back to the start
	const invRowY = y0 + 250;
	const Ra = placeSymbol('resistor_right', outs[1].x - 190, invRowY, SCALE);
	const invRail = Ra.ports['1'].y;
	const inv = placeSymbol('opamp_no_power_left', Ra.ports['1'].x - 130, invRail - 0.09 * SCALE, SCALE);
	const gndI = placeSymbol('ground_down', inv.ports.inp1.x + 45 - 0.01 * SCALE, inv.ports.inp1.y + 46 + 0.29 * SCALE, SCALE);
	const nm = Ra.ports['1'];
	net.wire(outs[1], { x: outs[1].x, y: invRail });
	net.wire({ x: outs[1].x, y: invRail }, Ra.ports['2']);
	net.wire(nm, inv.ports.inp2);
	elbowH(net, inv.ports.inp1, gndI.ports['1']);
	// Rb on a rail below the inverter
	const Rb = placeSymbol('resistor_right', (inv.ports.out.x + nm.x) / 2, invRowY + 110, SCALE);
	const rbRail = Rb.ports['1'].y;
	net.wire(nm, { x: nm.x, y: rbRail });
	net.wire({ x: nm.x, y: rbRail }, Rb.ports['2']);
	net.wire(Rb.ports['1'], { x: inv.ports.out.x, y: rbRail });
	net.wire({ x: inv.ports.out.x, y: rbRail }, inv.ports.out);
	// and back to the first integrator
	const backY = rbRail + 90;
	net.wire(inv.ports.out, { x: inv.ports.out.x, y: backY });
	net.wire({ x: inv.ports.out.x, y: backY }, { x: startX, y: backY });
	net.wire({ x: startX, y: backY }, { x: startX, y: y0 });

	svgs.push(Ra.svg, inv.svg, gndI.svg, Rb.svg);
	symbols.push(Ra, inv, gndI, Rb);
	labels.push(
		label(`Ra ${formatOhms(design.rg)}`, Ra.ports['1'].x, invRail - 16, { anchor: 'start' }),
		label(`Rb ${formatOhms(design.limiter.rf)}`, Rb.ports['1'].x, rbRail + 26, { anchor: 'start' }),
		label('inverter, closing the loop', inv.ports.out.x - 10, invRail - 70, { anchor: 'start', cls: 'lbl note' })
	);

	const all = [...svgs, net.svg(), net.dots(portPoints(...symbols)), ...labels];
	const top = y0 - 180;
	return { svg: all.join(''), viewBox: `0 ${top} ${outs[1].x + 120} ${backY + 60 - top}` };
}

/**
 * The amplitude limiter on its own: the feedback resistor split in two
 * with a pair of diodes across the lower part. Below a diode drop they do
 * nothing and the loop gain sits above 1; once the output is large enough
 * they conduct, shunt Rf2 away and drop the gain below 1, which is what
 * holds the amplitude where the design put it.
 */
export function buildLimiterDiagram(design) {
	const { limiter } = design;
	const rf1 = limiter.kind === 'diodes' && design.topology === 'wien' ? design.parts.rf1 : limiter.rf - limiter.rf2;
	const rf2 = limiter.rf2;
	const y0 = 150;
	const net = createNet();
	const R1 = placeSymbol('resistor_right', MARGIN + 110, y0, SCALE);
	const rail = R1.ports['1'].y;
	const R2 = placeSymbol('resistor_right', R1.ports['2'].x + 160, y0, SCALE);
	const left = { x: MARGIN + 20, y: rail };
	const right = { x: R2.ports['2'].x + 130, y: rail };
	// the bridge points sit clear of R2 on either side, so the diode bodies
	// between them never sit under the verticals that reach them
	const a = { x: R2.ports['1'].x - 45, y: rail };
	const b = { x: R2.ports['2'].x + 45, y: rail };
	net.wire(left, R1.ports['1']);
	net.wire(R1.ports['2'], a);
	net.wire(a, R2.ports['1']);
	net.wire(R2.ports['2'], b);
	net.wire(b, right);
	const cx = (a.x + b.x) / 2;
	const upY = rail - 90;
	const dnY = rail + 90;
	const D1 = placeSymbol('diode_right', cx, upY, SCALE);
	const D2 = placeSymbol('diode_left', cx, dnY, SCALE);
	net.wire(a, { x: a.x, y: upY });
	net.wire({ x: a.x, y: upY }, D1.ports['1']);
	net.wire(D1.ports['2'], { x: b.x, y: upY });
	net.wire({ x: b.x, y: upY }, b);
	net.wire(a, { x: a.x, y: dnY });
	net.wire({ x: a.x, y: dnY }, D2.ports['2']);
	net.wire(D2.ports['1'], { x: b.x, y: dnY });
	net.wire({ x: b.x, y: dnY }, b);

	const all = [
		R1.svg,
		R2.svg,
		D1.svg,
		D2.svg,
		net.svg(),
		net.dots(portPoints(R1, R2, D1, D2)),
		label(design.topology === 'wien' ? 'from Vout' : 'from the - input', left.x, rail - 16, { anchor: 'start' }),
		label(design.topology === 'wien' ? 'to the - input' : 'to Vout', right.x + 8, rail + 4, { anchor: 'start' }),
		label(`Rf1 ${formatOhms(rf1)}`, R1.ports['1'].x, rail + 26, { anchor: 'start' }),
		label(`Rf2 ${formatOhms(rf2)}`, R2.ports['1'].x, rail + 26, { anchor: 'start' }),
		label(`clamps at about ${limiter.amplitudeActual.toFixed(2)} V peak`, D2.ports['2'].x - 30, dnY + 34, { anchor: 'start', cls: 'lbl note' })
	];
	return { svg: all.join(''), viewBox: `0 ${upY - 60} ${right.x + 60} ${dnY + 80 - (upY - 60)}` };
}

/** Picks the right drawing for a design. */
export function buildOscillatorDiagram(design) {
	if (design.topology === 'wien') return buildWienDiagram(design);
	if (design.topology === 'quadrature') return buildQuadratureDiagram(design);
	return buildLadderDiagram(design);
}

/** Whether this design has a diode limiter worth drawing on its own. */
export function hasLimiterDiagram(design) {
	return design.limiter?.kind === 'diodes';
}

/**
 * The JFET automatic gain control, on its own. The channel sits in the
 * lower feedback leg in series with Rg2, in parallel with Rg1, so opening
 * or closing it moves the amplifier's gain. What opens and closes it is
 * the peak detector on the left: the output's negative swings pull the
 * gate down through D1 and charge Cdet, so a larger output means a more
 * negative gate, a narrower channel and less gain. Nothing in the signal
 * path ever clips, which is why this measures cleaner than diode limiting.
 */
export function buildAgcDiagram(design) {
	const { parts } = design;
	const y0 = 200;
	const net = createNet();

	// peak detector: Rdet and D1 from the output to the gate, Cdet and the
	// bleed resistor holding it
	const Rdet = placeSymbol('resistor_right', MARGIN + 120, y0, SCALE);
	const rail = Rdet.ports['1'].y;
	const src = { x: MARGIN + 30, y: rail };
	const gateNode = { x: Rdet.ports['2'].x + 90, y: rail };
	net.wire(src, Rdet.ports['1']);
	net.wire(Rdet.ports['2'], gateNode);
	// D1 bridges the same pair on a rail above, its body clear of both drops
	const dY = rail - 90;
	const D1 = placeSymbol('diode_left', (src.x + gateNode.x) / 2, dY, SCALE);
	net.wire(src, { x: src.x, y: dY });
	net.wire({ x: src.x, y: dY }, D1.ports['2']);
	net.wire(D1.ports['1'], { x: gateNode.x, y: dY });
	net.wire({ x: gateNode.x, y: dY }, gateNode);
	const Cdet = placeSymbol('capacitor_down', gateNode.x, gateNode.y + HANG.capacitor_down * SCALE, SCALE);
	const gC = placeSymbol('ground_down', Cdet.ports['2'].x - 0.01 * SCALE, Cdet.ports['2'].y + 0.29 * SCALE, SCALE);
	net.wire(gateNode, Cdet.ports['1']);
	net.wire(Cdet.ports['2'], gC.ports['1']);

	// the controlled leg: Rg2 down into the channel, source to ground
	const legX = gateNode.x + 230;
	const legTop = { x: legX, y: rail - 70 };
	const Rg2 = placeSymbol('resistor_down', legX, legTop.y + HANG.resistor_down * SCALE, SCALE);
	net.wire(legTop, Rg2.ports['1']);
	const jfet = placeSymbol('njfet_transistor_horz', Rg2.ports['2'].x - 0.28 * SCALE, Rg2.ports['2'].y + 70 + 0.55 * SCALE, SCALE);
	net.wire(Rg2.ports['2'], jfet.ports.drain);
	const gS = placeSymbol('ground_down', jfet.ports.source.x - 0.01 * SCALE, jfet.ports.source.y + 0.29 * SCALE, SCALE);
	net.wire(jfet.ports.source, gS.ports['1']);
	// gate across from the detector
	const gateX = gateNode.x + 70;
	net.wire(gateNode, { x: gateX, y: rail });
	net.wire({ x: gateX, y: rail }, { x: gateX, y: jfet.ports.gate.y });
	net.wire({ x: gateX, y: jfet.ports.gate.y }, jfet.ports.gate);

	const all = [
		Rdet.svg,
		D1.svg,
		Cdet.svg,
		gC.svg,
		Rg2.svg,
		jfet.svg,
		gS.svg,
		net.svg(),
		net.dots(portPoints(Rdet, D1, Cdet, gC, Rg2, jfet, gS)),
		label('from Vout', src.x, rail + 26, { anchor: 'start' }),
		label(`Rdet ${formatOhms(parts.rDet)}`, Rdet.ports['1'].x, rail - 16, { anchor: 'start' }),
		label('D1', D1.ports['1'].x + 10, dY - 14, { anchor: 'start' }),
		label(`Cdet ${formatFarads(parts.cDet)}`, Cdet.ports['1'].x - 14, (Cdet.ports['1'].y + Cdet.ports['2'].y) / 2, { anchor: 'end' }),
		label('to the - input', legTop.x - 10, legTop.y - 14, { anchor: 'start' }),
		label(`Rg2 ${formatOhms(parts.rg2)}`, Rg2.ports['1'].x + 14, (Rg2.ports['1'].y + Rg2.ports['2'].y) / 2, { anchor: 'start' }),
		label('channel resistance follows the gate', jfet.ports.drain.x + 20, jfet.ports.drain.y + 20, { anchor: 'start', cls: 'lbl note' })
	];
	const top = dY - 60;
	return { svg: all.join(''), viewBox: `0 ${top} ${legX + 320} ${gS.ports['1'].y + 70 - top}` };
}
