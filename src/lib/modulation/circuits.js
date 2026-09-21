import { placeSymbol, label, createNet, portPoints } from '../filter/schematic';
import { formatFarads, formatHenries, formatOhms } from './format';

const SCALE = 48;
const MARGIN = 24;

/**
 * JFET modulator gain cell: non-inverting amplifier where the carrier
 * xp(t) drives the + input, the JFET channel (drain at the - input node,
 * source grounded) is the bottom leg of the feedback divider, and Rb is
 * the top (feedback) leg. The gate is driven by the conditioned, biased
 * modulating signal from the signal-conditioning chain. Rb's feedback loop
 * is routed below the triangle so it never crosses the carrier wire that
 * feeds the + input at a height between the JFET and any top rail.
 */
export function buildJfetGainCellDiagram({ rb }) {
	const y0 = 220;
	const opampX = MARGIN + 260;
	const opamp = placeSymbol('opamp_no_power_right', opampX, y0, SCALE);
	const Vin = { x: MARGIN, y: opamp.ports.inp1.y };
	const negNode = opamp.ports.inp2;

	const jfet = placeSymbol('njfet_transistor_horz', negNode.x - 90, negNode.y + 70, SCALE);
	const gndSource = placeSymbol('ground_down', jfet.ports.source.x - 0.01 * SCALE, jfet.ports.source.y + 0.29 * SCALE, SCALE);

	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const loopY = jfet.ports.source.y + 40;
	const Rb = placeSymbol('resistor_right', (negNode.x + Vout.x) / 2, loopY, SCALE);
	const gateNode = { x: jfet.ports.gate.x - 70, y: jfet.ports.gate.y };

	const net = createNet();
	net.wire(Vin, opamp.ports.inp1);
	net.wire(jfet.ports.drain, { x: jfet.ports.drain.x, y: negNode.y });
	net.elbow({ x: jfet.ports.drain.x, y: negNode.y }, negNode, 'h');
	net.wire(jfet.ports.source, gndSource.ports['1']);
	net.wire(gateNode, jfet.ports.gate);
	net.elbow(negNode, Rb.ports['1'], 'v');
	net.wire(Rb.ports['2'], { x: Vout.x, y: loopY });
	net.wire({ x: Vout.x, y: loopY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		opamp.svg,
		jfet.svg,
		gndSource.svg,
		Rb.svg,
		net.svg(),
		net.dots(portPoints(opamp, jfet, gndSource, Rb)),
		label('xp(t)', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('xm(t)', gateNode.x - 6, gateNode.y - 10, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`Rb ${formatOhms(rb)}`, Rb.ports['1'].x, loopY - 12, { anchor: 'start' }),
		label('S', jfet.ports.source.x + 8, jfet.ports.source.y + 4, { anchor: 'start' }),
		label('D', jfet.ports.drain.x + 8, jfet.ports.drain.y - 4, { anchor: 'start' }),
		label('G', jfet.ports.gate.x - 8, jfet.ports.gate.y - 6, { anchor: 'end' })
	];

	const width = Vout.x + 40 + 60;
	const height = Math.max(340, loopY + 60);
	return { svg: parts.join(''), viewBox: `0 20 ${width} ${height}` };
}

/**
 * Non-inverting gain stage: Rbottom from the - input to ground, Rtop from
 * the - input back to the output (gain = 1 + Rtop/Rbottom). The feedback
 * resistor's rail is routed below the triangle, so nothing crosses the Vin
 * wire that enters the + input above it.
 */
export function buildGainStageDiagram({ rtop, rbottom }) {
	const y0 = 160;
	const opamp = placeSymbol('opamp_no_power_right', MARGIN + 160, y0, SCALE);
	const Vin = { x: MARGIN, y: opamp.ports.inp1.y };
	const negNode = opamp.ports.inp2;

	const Rbottom = placeSymbol('resistor_down', negNode.x - 50, negNode.y + 80, SCALE);
	const gnd = placeSymbol('ground_down', Rbottom.ports['2'].x - 0.01 * SCALE, Rbottom.ports['2'].y + 0.29 * SCALE, SCALE);

	const Vout = { x: opamp.ports.out.x + 80, y: opamp.ports.out.y };
	const loopY = Rbottom.ports['2'].y + 40;
	const Rtop = placeSymbol('resistor_right', (negNode.x + Vout.x) / 2, loopY, SCALE);

	const net = createNet();
	net.wire(Vin, opamp.ports.inp1);
	// Rbottom up its own column then across into the - input node
	net.wire(Rbottom.ports['1'], { x: Rbottom.ports['1'].x, y: negNode.y });
	net.wire({ x: Rbottom.ports['1'].x, y: negNode.y }, negNode);
	net.wire(Rbottom.ports['2'], gnd.ports['1']);
	// Rtop feedback: down from the - input node, along a rail below the
	// triangle, up to the output
	net.elbow(negNode, Rtop.ports['1'], 'v');
	net.wire(Rtop.ports['2'], { x: Vout.x, y: loopY });
	net.wire({ x: Vout.x, y: loopY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });

	const parts = [
		opamp.svg,
		Rbottom.svg,
		gnd.svg,
		Rtop.svg,
		net.svg(),
		net.dots(portPoints(opamp, Rbottom, gnd, Rtop)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 34, Vout.y + 5, { anchor: 'start' }),
		label(`Rtop ${formatOhms(rtop)}`, Rtop.ports['1'].x, loopY - 12, { anchor: 'start' }),
		label(`Rbottom ${formatOhms(rbottom)}`, Rbottom.ports['1'].x - 12, (Rbottom.ports['1'].y + Rbottom.ports['2'].y) / 2, { anchor: 'end' })
	];

	const width = Vout.x + 30 + 60;
	const height = Math.max(260, loopY + 60);
	return { svg: parts.join(''), viewBox: `-16 20 ${width + 16} ${height}` };
}

/** Passive RC high-pass: series C, then R to ground (cutoff = 1/(2*pi*R*C)). */
export function buildHighPassDiagram({ r, c }) {
	const y0 = 100;
	const Vin = { x: MARGIN, y: y0 };
	const C = placeSymbol('capacitor_right', Vin.x + 90, y0, SCALE);
	const node = C.ports['2'];
	const R = placeSymbol('resistor_down', node.x, node.y + 60, SCALE);
	const gnd = placeSymbol('ground_down', R.ports['2'].x - 0.01 * SCALE, R.ports['2'].y + 0.29 * SCALE, SCALE);
	const Vout = { x: node.x + 90, y: node.y };

	const net = createNet();
	net.wire(Vin, C.ports['1']);
	net.wire(C.ports['2'], R.ports['1']);
	net.wire(R.ports['2'], gnd.ports['1']);
	net.wire(node, Vout);

	const parts = [
		C.svg,
		R.svg,
		gnd.svg,
		net.svg(),
		net.dots(portPoints(C, R, gnd)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 6, Vout.y - 8, { anchor: 'start' }),
		label(`C ${formatFarads(c)}`, C.ports['1'].x, C.ports['1'].y - 14, { anchor: 'start' }),
		label(`R ${formatOhms(r)}`, R.ports['1'].x + 12, (R.ports['1'].y + R.ports['2'].y) / 2, { anchor: 'start' })
	];

	const width = Vout.x + 60;
	return { svg: parts.join(''), viewBox: `0 20 ${width} 200` };
}

/**
 * Inverting summer with N labeled inputs, each through its own resistor R,
 * feedback resistor R (unity gain per input), + input grounded. The +
 * input's ground lead is offset sideways so it never runs down the same
 * line as the - input pin.
 */
export function buildSummerDiagram({ inputs, r }) {
	const n = inputs.length;
	const spacing = 56;
	const y0 = 140;
	const top = y0 - ((n - 1) * spacing) / 2;

	const opamp = placeSymbol('opamp_no_power_right', MARGIN + 220, y0, SCALE);
	const negNode = opamp.ports.inp2;
	const sumNode = { x: negNode.x - 70, y: negNode.y };

	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	const resistors = inputs.map((inp, i) => {
		const y = top + i * spacing;
		return { R: placeSymbol('resistor_right', sumNode.x - 90, y, SCALE), y, label: inp };
	});

	const Vout = { x: opamp.ports.out.x + 80, y: opamp.ports.out.y };
	const railY = negNode.y - 80;
	const Rf = placeSymbol('resistor_right', (sumNode.x + Vout.x) / 2, railY, SCALE);

	const net = createNet();
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	for (const { R, y } of resistors) {
		net.wire({ x: MARGIN, y }, R.ports['1']);
		net.wire(R.ports['2'], { x: sumNode.x, y });
		net.wire({ x: sumNode.x, y }, { x: sumNode.x, y: negNode.y });
	}
	net.elbow(sumNode, negNode, 'h');
	net.elbow(sumNode, Rf.ports['1'], 'v');
	net.wire(Rf.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });

	const parts = [
		opamp.svg,
		gndPlus.svg,
		Rf.svg,
		...resistors.map((rr) => rr.R.svg),
		net.svg(),
		net.dots(portPoints(opamp, gndPlus, Rf, ...resistors.map((rr) => rr.R))),
		...resistors.map((rr) => label(rr.label, MARGIN, rr.y - 10, { anchor: 'start' })),
		label('Vout', Vout.x + 34, Vout.y + 5, { anchor: 'start' }),
		label(`Rf ${formatOhms(r)}`, Rf.ports['1'].x, railY - 12, { anchor: 'start' })
	];

	const width = Vout.x + 30 + 60;
	const height = Math.max(260, top + (n - 1) * spacing + 80);
	return { svg: parts.join(''), viewBox: `0 0 ${width} ${height}` };
}

/** Resistor divider from +Vcc to ground, tap feeding the summer's DC reference input. */
export function buildDividerDiagram({ top, bottom, vcc }) {
	const x0 = MARGIN + 40;
	const y0 = 50;

	const Rtop = placeSymbol('resistor_down', x0, y0, SCALE);
	const supply = { x: Rtop.ports['1'].x, y: Rtop.ports['1'].y - 20 };
	const tap = Rtop.ports['2'];
	const Rbottom = placeSymbol('resistor_down', x0, tap.y + 60, SCALE);
	const gnd = placeSymbol('ground_down', Rbottom.ports['2'].x - 0.01 * SCALE, Rbottom.ports['2'].y + 0.29 * SCALE, SCALE);
	const out = { x: tap.x + 70, y: tap.y };

	const net = createNet();
	net.wire(Rtop.ports['1'], supply);
	net.wire(tap, Rbottom.ports['1']);
	net.wire(Rbottom.ports['2'], gnd.ports['1']);
	net.wire(tap, out);

	const parts = [
		Rtop.svg,
		Rbottom.svg,
		gnd.svg,
		net.svg(),
		net.dots(portPoints(Rtop, Rbottom, gnd)),
		label('+Vcc', supply.x, supply.y - 6, { anchor: 'middle' }),
		label(`${formatOhms(top)}`, Rtop.ports['1'].x + 20, (Rtop.ports['1'].y + Rtop.ports['2'].y) / 2, { anchor: 'start' }),
		label(`${formatOhms(bottom)}`, Rbottom.ports['1'].x + 20, (Rbottom.ports['1'].y + Rbottom.ports['2'].y) / 2, { anchor: 'start' }),
		label('to summer', out.x + 6, out.y - 8, { anchor: 'start' })
	];

	const width = out.x + 90;
	return { svg: parts.join(''), viewBox: `0 -16 ${width} 210` };
}

/** Diode + parallel RLC tank: summer output -> diode -> tank (L, C, R all in parallel) -> Vout. */
export function buildDiodeTankDiagram({ l, c, r }) {
	const y0 = 170;
	const Vin = { x: MARGIN, y: y0 };
	const diode = placeSymbol('diode_right', Vin.x + 90, y0, SCALE);
	const node = diode.ports.neg;

	// Each symbol's port '1' sits at a different local offset from its own
	// placement point (inductor_down 0.504, capacitor_down 0.3, resistor_down
	// 0.51, all * SCALE) - compensating per symbol lands every port '1' on the
	// same topY so the shared top rail is a straight line, not a zigzag.
	const topY = node.y - 60;
	const L = placeSymbol('inductor_down', node.x + 60, topY + 0.5040157954121098 * SCALE, SCALE);
	const C = placeSymbol('capacitor_down', node.x + 130, topY + 0.3 * SCALE, SCALE);
	const R = placeSymbol('resistor_down', node.x + 200, topY + 0.51 * SCALE, SCALE);
	const gndL = placeSymbol('ground_down', L.ports['2'].x - 0.01 * SCALE, L.ports['2'].y + 0.29 * SCALE, SCALE);
	const gndC = placeSymbol('ground_down', C.ports['2'].x - 0.01 * SCALE, C.ports['2'].y + 0.29 * SCALE, SCALE);
	const gndR = placeSymbol('ground_down', R.ports['2'].x - 0.01 * SCALE, R.ports['2'].y + 0.29 * SCALE, SCALE);
	const Vout = { x: R.ports['1'].x + 70, y: topY };

	const net = createNet();
	net.wire(Vin, diode.ports.pos);
	net.wire(node, { x: node.x, y: topY });
	net.wire({ x: node.x, y: topY }, L.ports['1']);
	net.wire(L.ports['1'], C.ports['1']);
	net.wire(C.ports['1'], R.ports['1']);
	net.wire(R.ports['1'], Vout);
	net.wire(L.ports['2'], gndL.ports['1']);
	net.wire(C.ports['2'], gndC.ports['1']);
	net.wire(R.ports['2'], gndR.ports['1']);

	const parts = [
		diode.svg,
		L.svg,
		C.svg,
		R.svg,
		gndL.svg,
		gndC.svg,
		gndR.svg,
		net.svg(),
		net.dots(portPoints(diode, L, C, R, gndL, gndC, gndR)),
		label('sum(t)', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 6, Vout.y - 10, { anchor: 'start' }),
		label(`L ${formatHenries(l)}`, L.ports['1'].x, topY - 12, { anchor: 'middle' }),
		label(`C ${formatFarads(c)}`, C.ports['1'].x, topY - 12, { anchor: 'middle' }),
		label(`R ${formatOhms(r)}`, R.ports['1'].x, topY - 12, { anchor: 'middle' })
	];

	const width = Vout.x + 60;
	return { svg: parts.join(''), viewBox: `0 ${topY - 30} ${width} 220` };
}

/**
 * Precision full-wave rectifier (absolute-value circuit), verified against
 * TI TIDU030 ("Precision Full-Wave Rectifier, Dual-Supply"), Figure 2/3/4.
 * D1 and D2 anodes both sit at U1A's output; D1's cathode (node F) drives
 * U1A's own - input and continues into R1; R1/R2 meet at node G = U1B's -
 * input; D2's cathode drives U1B's + input with R3 biasing it to ground;
 * R2 is U1B's feedback resistor from Vout. With R1 = R2 = R3, Vout = |Vin|.
 *
 * The two op-amps' - input feedback nets are routed along a top rail and
 * dropped into each - input from just left of that op-amp, so no wire runs
 * through a diode or an op-amp triangle.
 */
export function buildPrecisionRectifierDiagram({ r1, r2, r3 }) {
	const mainY = 220;

	const u1a = placeSymbol('opamp_no_power_right', MARGIN + 120, mainY, SCALE);
	const Vin = { x: MARGIN, y: u1a.ports.inp1.y };
	const P = { x: u1a.ports.out.x + 46, y: u1a.ports.out.y }; // both diode anodes

	const d1 = placeSymbol('diode_up', P.x, P.y - 110, SCALE);
	const nodeF = d1.ports.neg; // cathode; the whole top rail sits at its height
	const railY = nodeF.y;

	const R1 = placeSymbol('resistor_right', nodeF.x + 70, railY, SCALE);
	const nodeG = R1.ports['2'];
	const R2 = placeSymbol('resistor_right', nodeG.x + 90, railY, SCALE);

	const u1b = placeSymbol('opamp_no_power_right', R2.ports['2'].x + 90, mainY, SCALE);
	// D2 sits at U1B's + input height so its cathode wire is a clean
	// horizontal; R3 biases that same + node to ground (there is no separate
	// ground on the + input - D2 and R3 share it).
	const d2 = placeSymbol('diode_right', u1b.ports.inp1.x - 96, u1b.ports.inp1.y, SCALE);
	const R3 = placeSymbol('resistor_down', d2.ports.neg.x, d2.ports.neg.y + 56, SCALE);
	const gndR3 = placeSymbol('ground_down', R3.ports['2'].x - 0.01 * SCALE, R3.ports['2'].y + 0.29 * SCALE, SCALE);

	const Vout = { x: u1b.ports.out.x + 80, y: u1b.ports.out.y };

	const net = createNet();
	net.wire(Vin, u1a.ports.inp1);
	net.wire(u1a.ports.out, P);
	net.wire(P, d1.ports.pos);
	net.elbow(P, d2.ports.pos, 'h');

	// node F -> R1 along the rail, and F down into U1A's - input from just
	// left of U1A (never through the diode or the triangle)
	net.wire(nodeF, R1.ports['1']);
	const fDropX = u1a.ports.inp2.x - 24;
	net.wire(nodeF, { x: fDropX, y: railY });
	net.wire({ x: fDropX, y: railY }, { x: fDropX, y: u1a.ports.inp2.y });
	net.wire({ x: fDropX, y: u1a.ports.inp2.y }, u1a.ports.inp2);

	// node G -> R2 along the rail, and G straight down (left of R2) into
	// U1B's - input
	net.wire(nodeG, R2.ports['1']);
	net.wire(nodeG, { x: nodeG.x, y: u1b.ports.inp2.y });
	net.wire({ x: nodeG.x, y: u1b.ports.inp2.y }, u1b.ports.inp2);

	// R2 feedback down to Vout (past U1B, then in)
	net.wire(R2.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(u1b.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });

	// D2 cathode -> U1B + input (horizontal), and R3 down to ground
	net.wire(d2.ports.neg, u1b.ports.inp1);
	net.wire(d2.ports.neg, R3.ports['1']);
	net.wire(R3.ports['2'], gndR3.ports['1']);

	const uCenter = (o) => (o.ports.inp1.x + o.ports.out.x) / 2;
	const parts = [
		u1a.svg,
		u1b.svg,
		d1.svg,
		d2.svg,
		R1.svg,
		R2.svg,
		R3.svg,
		gndR3.svg,
		net.svg(),
		net.dots(portPoints(u1a, u1b, d1, d2, R1, R2, R3, gndR3)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 34, Vout.y + 5, { anchor: 'start' }),
		label('U1A', uCenter(u1a), mainY + 40, { anchor: 'middle' }),
		label('U1B', uCenter(u1b), mainY + 40, { anchor: 'middle' }),
		label('D1', d1.ports.pos.x + 12, (d1.ports.pos.y + d1.ports.neg.y) / 2, { anchor: 'start' }),
		label('D2', d2.ports.pos.x + 4, d2.ports.pos.y - 12, { anchor: 'start' }),
		label(`R1 ${formatOhms(r1)}`, R1.ports['1'].x, railY - 12, { anchor: 'start' }),
		label(`R2 ${formatOhms(r2)}`, R2.ports['1'].x, railY - 12, { anchor: 'start' }),
		label(`R3 ${formatOhms(r3)}`, R3.ports['1'].x + 12, (R3.ports['1'].y + R3.ports['2'].y) / 2, { anchor: 'start' })
	];

	const width = Vout.x + 30 + 60;
	const height = mainY + 120 - (railY - 40);
	return { svg: parts.join(''), viewBox: `0 ${railY - 40} ${width} ${height}` };
}

/** Envelope-recovery low-pass: unity-gain Sallen-Key, same topology as the filter-design tool. */
export function buildEnvelopeLowPassDiagram(components) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const R1 = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const J1 = R1.ports['2'];
	const R2 = placeSymbol('resistor_right', J1.x + 100, y0, SCALE);
	const J2 = R2.ports['2'];

	const Cbottom = placeSymbol('capacitor_down', J2.x, J2.y + 0.3 * SCALE, SCALE);
	const gndBottom = placeSymbol('ground_down', Cbottom.ports['2'].x - 0.01 * SCALE, Cbottom.ports['2'].y + 0.29 * SCALE, SCALE);

	const opampX = J2.x + 140;
	// +0.18*SCALE lines the + input up with J2's height, so the incoming
	// signal wire needs no vertical stub that would share a line with the
	// feedback loop reaching the - input.
	const opamp = placeSymbol('opamp_no_power_right', opampX, J2.y + 0.18 * SCALE, SCALE);
	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };

	const railY = 90;
	const Ctop = placeSymbol('capacitor_right', (J1.x + Vout.x) / 2, railY, SCALE);
	const loopY = opamp.ports.out.y + 70;

	const net = createNet();
	net.wire(Vin, R1.ports['1']);
	net.wire(R1.ports['2'], R2.ports['1']);
	net.wire(R2.ports['2'], Cbottom.ports['1']);
	net.wire(Cbottom.ports['2'], gndBottom.ports['1']);
	net.elbow(J2, opamp.ports.inp1, 'h');
	net.wire(opamp.ports.out, { x: opamp.ports.out.x, y: loopY });
	net.wire({ x: opamp.ports.out.x, y: loopY }, { x: opamp.ports.inp2.x, y: loopY });
	net.wire({ x: opamp.ports.inp2.x, y: loopY }, opamp.ports.inp2);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });
	net.wire(J1, { x: J1.x, y: railY });
	net.wire({ x: J1.x, y: railY }, Ctop.ports['1']);
	net.wire(Ctop.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);

	const parts = [
		R1.svg,
		R2.svg,
		Cbottom.svg,
		gndBottom.svg,
		opamp.svg,
		Ctop.svg,
		net.svg(),
		net.dots(portPoints(R1, R2, Cbottom, gndBottom, opamp, Ctop)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`R ${formatOhms(components.R1)}`, R1.ports['1'].x - 20, R1.ports['1'].y - 24, { anchor: 'start' }),
		label(`R ${formatOhms(components.R2)}`, R2.ports['1'].x, R2.ports['1'].y - 24, { anchor: 'start' }),
		label(`C_top ${formatFarads(components.Ctop)}`, Ctop.ports['1'].x, railY - 20, { anchor: 'start' }),
		label(`C_bottom ${formatFarads(components.Cbottom)}`, Cbottom.ports['1'].x - 40, gndBottom.ports['1'].y + 35, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 300` };
}

/**
 * The gate-drive summer: one inverting op-amp that amplifies the message,
 * blocks its DC and adds the gate bias in a single stage. Top row: the
 * source through C and Rac into the summing node. Bottom row: +Vcc through
 * Rbias into the same node. Rf on a rail above. Every input ends on the
 * virtual ground, so nothing loads anything (which is the reason this
 * replaced a three-stage chain).
 */
export function buildBiasSummerDiagram({ c, rac, rbias, rf }) {
	const yTop = 120;
	const yBot = 200;
	const opamp = placeSymbol('opamp_no_power_right', MARGIN + 330, (yTop + yBot) / 2, SCALE);
	const negNode = opamp.ports.inp2;
	const sumX = negNode.x - 70;

	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	const Vin = { x: MARGIN, y: yTop };
	const C = placeSymbol('capacitor_right', Vin.x + 70, yTop, SCALE);
	const Rac = placeSymbol('resistor_right', C.ports['2'].x + 70, yTop, SCALE);
	const supply = { x: MARGIN + 30, y: yBot };
	const Rbias = placeSymbol('resistor_right', Rac.ports['1'].x, yBot, SCALE);

	const Vout = { x: opamp.ports.out.x + 80, y: opamp.ports.out.y };
	const railY = yTop - 60;
	const Rf = placeSymbol('resistor_right', (sumX + Vout.x) / 2, railY, SCALE);

	const net = createNet();
	net.wire(Vin, C.ports['1']);
	net.wire(C.ports['2'], Rac.ports['1']);
	net.wire(Rac.ports['2'], { x: sumX, y: yTop });
	net.wire(supply, Rbias.ports['1']);
	net.wire(Rbias.ports['2'], { x: sumX, y: yBot });
	net.wire({ x: sumX, y: yTop }, { x: sumX, y: yBot });
	net.elbow({ x: sumX, y: negNode.y }, negNode, 'h');
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	net.wire({ x: sumX, y: yTop }, { x: sumX, y: railY });
	net.wire({ x: sumX, y: railY }, Rf.ports['1']);
	net.wire(Rf.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });

	const parts = [
		C.svg,
		Rac.svg,
		Rbias.svg,
		opamp.svg,
		gndPlus.svg,
		Rf.svg,
		net.svg(),
		net.dots(portPoints(C, Rac, Rbias, opamp, gndPlus, Rf)),
		label('x_m(t)', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('+Vcc', supply.x, supply.y - 12, { anchor: 'middle' }),
		label(`C ${formatFarads(c)}`, C.ports['1'].x, yTop - 14, { anchor: 'start' }),
		label(`Rac ${formatOhms(rac)}`, Rac.ports['1'].x, yTop - 14, { anchor: 'start' }),
		label(`Rbias ${formatOhms(rbias)}`, Rbias.ports['1'].x, yBot + 26, { anchor: 'start' }),
		label(`Rf ${formatOhms(rf)}`, Rf.ports['1'].x, railY - 12, { anchor: 'start' }),
		label('to gate', Vout.x + 34, Vout.y + 5, { anchor: 'start' })
	];

	const width = Vout.x + 30 + 60;
	return { svg: parts.join(''), viewBox: `0 30 ${width} 260` };
}

/**
 * Carrier attenuator: a plain divider from the carrier source down to the
 * amplitude the JFET can take. It drives the gain cell's + input, which
 * draws no current, so the ratio is exact and no buffer is needed.
 */
export function buildCarrierDividerDiagram({ top, bottom }) {
	const y0 = 90;
	const Vin = { x: MARGIN, y: y0 };
	const Rtop = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const node = Rtop.ports['2'];
	const Rbot = placeSymbol('resistor_down', node.x, node.y + 0.51 * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', Rbot.ports['2'].x - 0.01 * SCALE, Rbot.ports['2'].y + 0.29 * SCALE, SCALE);
	const out = { x: node.x + 90, y: node.y };

	const net = createNet();
	net.wire(Vin, Rtop.ports['1']);
	net.wire(Rbot.ports['2'], gnd.ports['1']);
	net.wire(node, out);

	const parts = [
		Rtop.svg,
		Rbot.svg,
		gnd.svg,
		net.svg(),
		net.dots(portPoints(Rtop, Rbot, gnd)),
		label('carrier source', Vin.x, Vin.y + 22, { anchor: 'start' }),
		label('to + input', out.x + 6, out.y - 8, { anchor: 'start' }),
		label(`${formatOhms(top)}`, Rtop.ports['1'].x, y0 - 24, { anchor: 'start' }),
		label(`${formatOhms(bottom)}`, Rbot.ports['1'].x + 12, (Rbot.ports['1'].y + Rbot.ports['2'].y) / 2, { anchor: 'start' })
	];

	const width = out.x + 90;
	return { svg: parts.join(''), viewBox: `0 30 ${width} 190` };
}

/**
 * JFET modulator, inverting cell: the channel is the input resistor. A
 * follower copies the (attenuated) carrier onto the drain, the source sits
 * on the virtual ground of the second op-amp, and R2 feeds its output back
 * to that node, so Vout = -R2 G(VGS) xp. The follower is part of the cell:
 * without it the divider's impedance adds to the channel and bends the
 * envelope, which is why it is drawn rather than assumed.
 */
export function buildJfetInvertingCellDiagram({ r2 }) {
	const y0 = 150;
	const follower = placeSymbol('opamp_no_power_right', MARGIN + 150, y0, SCALE);
	const Vin = { x: MARGIN, y: follower.ports.inp1.y };
	const loopA = follower.ports.out.y + 50;
	const loopAx = follower.ports.inp2.x - 30;

	const drainY = y0 + 80;
	const drainX = follower.ports.out.x + 70;
	const jfet = placeSymbol('njfet_transistor_horz', drainX - 0.28 * SCALE, drainY + 0.55 * SCALE, SCALE);
	const gateNode = { x: jfet.ports.gate.x - 50, y: jfet.ports.gate.y };

	const cell = placeSymbol('opamp_no_power_right', jfet.ports.source.x + 170, jfet.ports.source.y + 40 - 0.09 * SCALE, SCALE);
	const N = { x: jfet.ports.source.x, y: cell.ports.inp2.y };
	const gndPlusX = cell.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, cell.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);
	const Vout = { x: cell.ports.out.x + 90, y: cell.ports.out.y };
	const loopB = N.y + 70;
	const R2 = placeSymbol('resistor_right', (N.x + Vout.x) / 2, loopB, SCALE);

	const net = createNet();
	net.wire(Vin, follower.ports.inp1);
	net.wire(follower.ports.out, { x: follower.ports.out.x, y: loopA });
	net.wire({ x: follower.ports.out.x, y: loopA }, { x: loopAx, y: loopA });
	net.wire({ x: loopAx, y: loopA }, { x: loopAx, y: follower.ports.inp2.y });
	net.wire({ x: loopAx, y: follower.ports.inp2.y }, follower.ports.inp2);
	net.wire(follower.ports.out, { x: drainX, y: follower.ports.out.y });
	net.wire({ x: drainX, y: follower.ports.out.y }, jfet.ports.drain);
	net.wire(gateNode, jfet.ports.gate);
	net.wire(jfet.ports.source, N);
	net.wire(N, cell.ports.inp2);
	net.elbow(cell.ports.inp1, gndPlus.ports['1'], 'h');
	net.wire(N, { x: N.x, y: loopB });
	net.wire({ x: N.x, y: loopB }, R2.ports['1']);
	net.wire(R2.ports['2'], { x: Vout.x, y: loopB });
	net.wire({ x: Vout.x, y: loopB }, Vout);
	net.wire(cell.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		follower.svg,
		jfet.svg,
		cell.svg,
		gndPlus.svg,
		R2.svg,
		net.svg(),
		net.dots(portPoints(follower, jfet, cell, gndPlus, R2)),
		label('xp(t)', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('follower', follower.ports.out.x - 24, y0 - 32, { anchor: 'middle', cls: 'lbl note' }),
		label('xm(t)', gateNode.x - 6, gateNode.y - 10, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`R2 ${formatOhms(r2)}`, R2.ports['1'].x, loopB - 12, { anchor: 'start' }),
		label('S', jfet.ports.source.x + 8, jfet.ports.source.y + 4, { anchor: 'start' }),
		label('D', jfet.ports.drain.x + 8, jfet.ports.drain.y - 4, { anchor: 'start' }),
		label('G', jfet.ports.gate.x - 8, jfet.ports.gate.y - 6, { anchor: 'end' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} ${loopB + 50 - 40}` };
}
