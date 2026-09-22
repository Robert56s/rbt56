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
			stabilizer === 'lamp' ? `lamp, hot ${formatOhms(limiter.lampHot)}` : stabilizer === 'jfet' ? (limiter.regulates ? `Rser ${formatOhms(parts.rSeries)} + channel` : 'Rser + channel') : `Rg ${formatOhms(design.rg)}`,
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
 * remaining 180 degrees to close the loop. Rn, from the inverter output
 * into the second integrator's input, is what makes the loop start; the
 * clamp that stops it is drawn on its own by buildClampDiagram.
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
	const nodes = [];

	for (let k = 1; k <= 2; k++) {
		const R = placeSymbol('resistor_right', src.x + 70, rail, SCALE);
		if (k === 1) rail = R.ports['1'].y;
		const node = R.ports['2'];
		nodes.push(node);
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

	// Rn: from the loop's return (the inverter output) up a column above
	// the second integrator's input node, then down into it
	const n2 = nodes[1];
	const cRail2 = symbols[7].ports['1'].y;
	const Rn = placeSymbol('resistor_down', n2.x, cRail2 - 150 + HANG.resistor_down * SCALE, SCALE);
	const topRail = Rn.ports['1'].y - 40;
	net.wire(Rn.ports['2'], { x: n2.x, y: cRail2 });
	net.wire(Rn.ports['1'], { x: n2.x, y: topRail });
	net.wire({ x: n2.x, y: topRail }, { x: startX, y: topRail });
	net.wire({ x: startX, y: topRail }, { x: startX, y: y0 });
	svgs.push(Rn.svg);
	symbols.push(Rn);
	labels.push(label(`Rn ${formatOhms(design.parts.rn)}`, Rn.ports['1'].x + 14, (Rn.ports['1'].y + Rn.ports['2'].y) / 2, { anchor: 'start' }), label('starts the loop', Rn.ports['1'].x + 14, (Rn.ports['1'].y + Rn.ports['2'].y) / 2 + 16, { anchor: 'start', cls: 'lbl note' }));

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
		label(`Ra ${formatOhms(design.parts.ra)}`, Ra.ports['1'].x, invRail - 16, { anchor: 'start' }),
		label(`Rb ${formatOhms(design.parts.rb)}`, Rb.ports['1'].x, rbRail + 26, { anchor: 'start' }),
		label('inverter, gain exactly 1, closing the loop', inv.ports.out.x - 10, invRail - 70, { anchor: 'start', cls: 'lbl note' })
	);

	const all = [...svgs, net.svg(), net.dots(portPoints(...symbols)), ...labels];
	const top = topRail - 40;
	return { svg: all.join(''), viewBox: `0 ${top} ${outs[1].x + 120} ${backY + 60 - top}` };
}

/**
 * The clamp that holds the quadrature loop's amplitude, around its second
 * integrator: Rn brings in the negative damping that starts the loop, and
 * a divider from the integrator output with anti-parallel diodes into the
 * same input adds positive damping once the tap reaches a diode drop. The
 * amplitude parks where the two cancel, and since the diode current is
 * integrated before it reaches either output, what little distortion it
 * makes is filtered on the way.
 */
export function buildClampDiagram(design) {
	const { parts } = design;
	const y0 = 160;
	const net = createNet();
	const R2 = placeSymbol('resistor_right', MARGIN + 110, y0, SCALE);
	const rail = R2.ports['1'].y;
	const vsin = { x: MARGIN + 30, y: rail };
	const n2 = R2.ports['2'];
	net.wire(vsin, R2.ports['1']);
	const amp = placeSymbol('opamp_no_power_right', n2.x + 150, rail - 0.09 * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', amp.ports.inp1.x - 45 - 0.01 * SCALE, amp.ports.inp1.y + 46 + 0.29 * SCALE, SCALE);
	const vcos = { x: amp.ports.out.x + 70, y: amp.ports.out.y };
	// the input wire is split where the diode column joins it
	const tee = { x: n2.x + 45, y: rail };
	net.wire(n2, tee);
	net.wire(tee, amp.ports.inp2);
	elbowH(net, amp.ports.inp1, gnd.ports['1']);
	net.wire(amp.ports.out, vcos);
	const C = placeSymbol('capacitor_right', (n2.x + vcos.x) / 2, y0 - 110, SCALE);
	const cRail = C.ports['1'].y;
	net.wire(n2, { x: n2.x, y: cRail });
	net.wire({ x: n2.x, y: cRail }, C.ports['1']);
	net.wire(C.ports['2'], { x: vcos.x, y: cRail });
	net.wire({ x: vcos.x, y: cRail }, vcos);

	// the divider hangs from the cosine output; the tap feeds the diodes
	const Rd1 = placeSymbol('resistor_down', vcos.x, vcos.y + 60 + HANG.resistor_down * SCALE, SCALE);
	net.wire(vcos, Rd1.ports['1']);
	const tap = Rd1.ports['2'];
	const Rd2 = placeSymbol('resistor_down', tap.x, tap.y + 50 + HANG.resistor_down * SCALE, SCALE);
	const gndD = placeSymbol('ground_down', Rd2.ports['2'].x - 0.01 * SCALE, Rd2.ports['2'].y + 0.29 * SCALE, SCALE);
	net.wire(tap, Rd2.ports['1']);
	net.wire(Rd2.ports['2'], gndD.ports['1']);
	// two diode rails between the column under the input tee and a column
	// next to the divider tap; the bridge sits below the op-amp's ground
	const leftX = tee.x;
	const rightX = tap.x - 45;
	const upY = tap.y - 10;
	const dnY = tap.y + 50;
	net.wire(tap, { x: rightX, y: tap.y });
	net.wire({ x: rightX, y: tap.y }, { x: rightX, y: upY });
	net.wire({ x: rightX, y: tap.y }, { x: rightX, y: dnY });
	const D1 = placeSymbol('diode_left', (leftX + rightX) / 2, upY, SCALE); // tap -> input node
	const D2 = placeSymbol('diode_right', (leftX + rightX) / 2, dnY, SCALE); // input node -> tap
	net.wire({ x: rightX, y: upY }, D1.ports['1']);
	net.wire(D1.ports['2'], { x: leftX, y: upY });
	net.wire({ x: rightX, y: dnY }, D2.ports['2']);
	net.wire(D2.ports['1'], { x: leftX, y: dnY });
	net.wire({ x: leftX, y: upY }, tee);
	net.wire({ x: leftX, y: upY }, { x: leftX, y: dnY });
	// Rn continues down the same column to the inverter output
	const Rn = placeSymbol('resistor_down', leftX, dnY + 40 + HANG.resistor_down * SCALE, SCALE);
	net.wire({ x: leftX, y: dnY }, Rn.ports['1']);
	const rnBottom = { x: leftX, y: Rn.ports['2'].y + 40 };
	net.wire(Rn.ports['2'], rnBottom);

	const all = [
		R2.svg,
		amp.svg,
		gnd.svg,
		C.svg,
		Rn.svg,
		Rd1.svg,
		Rd2.svg,
		gndD.svg,
		D1.svg,
		D2.svg,
		net.svg(),
		net.dots(portPoints(R2, amp, gnd, C, Rn, Rd1, Rd2, gndD, D1, D2)),
		label('sine in', vsin.x, rail - 14, { anchor: 'start' }),
		label(`R ${formatOhms(design.r)}`, R2.ports['1'].x - 10, rail + 26, { anchor: 'start' }),
		label(`C ${formatFarads(design.c)}`, C.ports['1'].x, cRail - 14, { anchor: 'start' }),
		label('cosine out', vcos.x + 8, vcos.y - 14, { anchor: 'start' }),
		label(`Rn ${formatOhms(parts.rn)}`, Rn.ports['1'].x + 14, (Rn.ports['1'].y + Rn.ports['2'].y) / 2, { anchor: 'start' }),
		label('from the inverter output', rnBottom.x + 10, rnBottom.y + 6, { anchor: 'start' }),
		label(`Rd1 ${formatOhms(parts.rd1)}`, Rd1.ports['1'].x + 14, (Rd1.ports['1'].y + Rd1.ports['2'].y) / 2, { anchor: 'start' }),
		label(`Rd2 ${formatOhms(parts.rd2)}`, Rd2.ports['1'].x + 14, (Rd2.ports['1'].y + Rd2.ports['2'].y) / 2, { anchor: 'start' }),
		label(`parks at about ${(design.limiter.amplitudeActual ?? 0).toFixed(2)} V peak`, leftX + 14, rnBottom.y - 30, { anchor: 'start', cls: 'lbl note' })
	];
	const top = cRail - 40;
	return { svg: all.join(''), viewBox: `0 ${top} ${vcos.x + 140} ${rnBottom.y + 60 - top}` };
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
	const rf1 = limiter.rf1;
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
		label(limiter.amplitudeActual === null ? 'cannot regulate with these parts' : `settles at about ${limiter.amplitudeActual.toFixed(2)} V peak`, D2.ports['2'].x - 30, dnY + 34, { anchor: 'start', cls: 'lbl note' })
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
 * The JFET automatic gain control, on its own. The channel sits in
 * series with Rser as the amplifier's lower feedback leg, so closing it
 * raises the gain and opening it lowers the gain all the way to 1. What
 * sets it is the peak detector on the left: D1 charges Cdet to the
 * output's negative peak, the divider Ra Rb scales that, and the two
 * equal resistors Rx average it with the drain voltage into the gate,
 * which cancels the channel's curvature so it behaves as a plain
 * resistor. Nothing in the signal path ever clips.
 */
export function buildAgcDiagram(design) {
	const { parts } = design;
	const y0 = 220;
	const net = createNet();
	const svgs = [];
	const symbols = [];
	const labels = [];

	// detector rail: vout on the left, D1 pointing at it (current leaves the
	// peak node on negative swings), the peak node, Ra to the divider tap
	const src = { x: MARGIN + 30, y: y0 };
	const D1 = placeSymbol('diode_left', src.x + 90, y0, SCALE);
	const rail = D1.ports['1'].y;
	net.wire({ x: src.x, y: rail }, D1.ports['2']);
	const pk = { x: D1.ports['1'].x + 50, y: rail };
	net.wire(D1.ports['1'], pk);
	const Cdet = placeSymbol('capacitor_down', pk.x, pk.y + HANG.capacitor_down * SCALE, SCALE);
	const gC = placeSymbol('ground_down', Cdet.ports['2'].x - 0.01 * SCALE, Cdet.ports['2'].y + 0.29 * SCALE, SCALE);
	net.wire(pk, Cdet.ports['1']);
	net.wire(Cdet.ports['2'], gC.ports['1']);
	svgs.push(D1.svg, Cdet.svg, gC.svg);
	symbols.push(D1, Cdet, gC);
	labels.push(label('from Vout', src.x, rail - 16, { anchor: 'start' }), label('D1', D1.ports['2'].x + 6, rail - 16, { anchor: 'start' }), label(`Cdet ${formatFarads(parts.cDet)}`, Cdet.ports['1'].x + 14, rail + 46, { anchor: 'start' }));

	let tapNode = pk;
	if (parts.ra > 0) {
		const Ra = placeSymbol('resistor_right', pk.x + 80, y0, SCALE);
		net.wire(pk, Ra.ports['1']);
		tapNode = { x: Ra.ports['2'].x + 50, y: rail };
		net.wire(Ra.ports['2'], tapNode);
		svgs.push(Ra.svg);
		symbols.push(Ra);
		labels.push(label(`Ra ${formatOhms(parts.ra)}`, Ra.ports['1'].x, rail - 16, { anchor: 'start' }));
	} else {
		tapNode = { x: pk.x + 130, y: rail };
		net.wire(pk, tapNode);
	}
	const Rb = placeSymbol('resistor_down', tapNode.x, tapNode.y + HANG.resistor_down * SCALE, SCALE);
	const gB = placeSymbol('ground_down', Rb.ports['2'].x - 0.01 * SCALE, Rb.ports['2'].y + 0.29 * SCALE, SCALE);
	net.wire(tapNode, Rb.ports['1']);
	net.wire(Rb.ports['2'], gB.ports['1']);
	svgs.push(Rb.svg, gB.svg);
	symbols.push(Rb, gB);
	labels.push(label(`Rb ${formatOhms(parts.rb)}`, Rb.ports['1'].x + 14, (Rb.ports['1'].y + Rb.ports['2'].y) / 2 + 8, { anchor: 'start' }));

	// Rx2 on to the gate node; the JFET to its right with its gate on the rail
	const Rx2 = placeSymbol('resistor_right', tapNode.x + 100, y0, SCALE);
	net.wire(tapNode, Rx2.ports['1']);
	const gateNode = { x: Rx2.ports['2'].x + 50, y: rail };
	net.wire(Rx2.ports['2'], gateNode);
	const probe = placeSymbol('njfet_transistor_horz', 0, 0, SCALE);
	const jfet = placeSymbol('njfet_transistor_horz', gateNode.x + 45 - probe.ports.gate.x, rail - probe.ports.gate.y, SCALE);
	net.wire(gateNode, jfet.ports.gate);
	const gS = placeSymbol('ground_down', jfet.ports.source.x - 0.01 * SCALE, jfet.ports.source.y + 0.29 * SCALE, SCALE);
	net.wire(jfet.ports.source, gS.ports['1']);
	// the drain node sits well above the JFET: Rser goes on up to the
	// amplifier's - input, and Rx1 comes across from the gate column
	const drain = jfet.ports.drain;
	const drainTop = { x: drain.x, y: rail - 130 };
	net.wire(drain, drainTop);
	const Rser = placeSymbol('resistor_down', drain.x, drainTop.y - 110 + HANG.resistor_down * SCALE, SCALE);
	net.wire(Rser.ports['2'], drainTop);
	const legTop = { x: drain.x, y: Rser.ports['1'].y - 30 };
	net.wire(Rser.ports['1'], legTop);
	const Rx1 = placeSymbol('resistor_down', gateNode.x, rail - 110 + HANG.resistor_down * SCALE, SCALE);
	net.wire(Rx1.ports['2'], gateNode);
	net.wire(Rx1.ports['1'], { x: gateNode.x, y: drainTop.y });
	net.wire({ x: gateNode.x, y: drainTop.y }, drainTop);
	svgs.push(Rx2.svg, jfet.svg, gS.svg, Rser.svg, Rx1.svg);
	symbols.push(Rx2, jfet, gS, Rser, Rx1);
	labels.push(
		label(`Rx ${formatOhms(parts.rx)}`, Rx2.ports['1'].x, rail - 16, { anchor: 'start' }),
		label(`Rx ${formatOhms(parts.rx)}`, Rx1.ports['1'].x - 14, (Rx1.ports['1'].y + Rx1.ports['2'].y) / 2, { anchor: 'end' }),
		label(`Rser ${formatOhms(parts.rSeries)}`, Rser.ports['1'].x + 14, (Rser.ports['1'].y + Rser.ports['2'].y) / 2, { anchor: 'start' }),
		label('to the - input', legTop.x + 10, legTop.y - 6, { anchor: 'start' }),
		label('channel resistance follows the gate', drain.x + 40, rail + 6, { anchor: 'start', cls: 'lbl note' })
	);

	const all = [...svgs, net.svg(), net.dots(portPoints(...symbols)), ...labels];
	const top = legTop.y - 40;
	const bottom = Math.max(gS.ports['1'].y, gB.ports['1'].y, gC.ports['1'].y) + 70;
	return { svg: all.join(''), viewBox: `0 ${top} ${drain.x + 320} ${bottom - top}` };
}
