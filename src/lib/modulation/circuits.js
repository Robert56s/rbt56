import { placeSymbol, label, createNet, portPoints } from '../filter/schematic';
import { formatFarads, formatHenries, formatOhms } from './format';

const SCALE = 48;
const MARGIN = 24;

/** Places a symbol so that its port `key` lands exactly on `p`, which keeps every wire to it straight. */
function placeAt(name, key, p, opts = {}) {
	const off = placeSymbol(name, 0, 0, SCALE, opts).ports[key];
	return placeSymbol(name, p.x - off.x, p.y - off.y, SCALE, opts);
}

/**
 * A voltmeter centred on (cx, cy), leads on top ('1') and below ('2').
 * Drawn here because the schematic-symbols vertical meter turns its V on
 * its side; it describes its own ports and body the way the logic gates
 * do, so the schematic audit checks the wiring around it.
 */
function voltmeter(cx, cy) {
	const r = 14;
	const ports = { 1: { x: cx, y: cy - r }, 2: { x: cx, y: cy + r } };
	const inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.6" /><text x="${cx}" y="${cy + 4.5}" text-anchor="middle" class="glyph">V</text>`;
	return { svg: `<g data-symbol="voltmeter" data-ports="${cx},${cy - r};${cx},${cy + r}" data-bbox="${cx - r},${cy - r},${cx + r},${cy + r}">${inner}</g>`, ports };
}

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

/**
 * The diode modulator's summer: the carrier through R_p, the message
 * through R_m and, when the diode wants a bias, -Vcc through R_b, into
 * one inverting op-amp with R_f; its output v_s drives the diode through
 * R_s. The op-amp's - input sits level with the carrier's row, so that
 * row runs straight in and the bus hangs below it: one junction where
 * the rows meet, and R_f rises from a tap of its own. The op-amp is
 * drawn with its - input on top, so the + input's ground drops clear of
 * everything.
 */
export function buildDiodeSummerDiagram({ rp, rm, rb, rf }) {
	const inputs = [
		{ name: 'x_p(t)', text: `R_p ${formatOhms(rp)}` },
		{ name: 'x_m(t)', text: `R_m ${formatOhms(rm)}` },
		...(rb ? [{ name: '-Vcc', text: `R_b ${formatOhms(rb)}` }] : [])
	];
	const spacing = 70;
	const top = 120;
	const opamp = placeAt('opamp_no_power_right', 'inp2', { x: MARGIN + 330, y: top }, { flipY: true });
	const negNode = opamp.ports.inp2;
	const sumX = negNode.x - 110;
	const gndPlus = placeAt('ground_down', '1', { x: opamp.ports.inp1.x - 20, y: opamp.ports.inp1.y + 30 });
	const rows = inputs.map((inp, i) => {
		const y = top + i * spacing;
		return { ...inp, y, R: placeAt('resistor_right', '1', { x: sumX - 124, y }) };
	});
	const Vout = { x: opamp.ports.out.x + 80, y: opamp.ports.out.y };
	const railY = top - 70;
	const tap = { x: sumX + 30, y: top };
	const Rf = placeAt('resistor_right', '1', { x: Math.round((tap.x + Vout.x) / 2 - 24), y: railY });

	const net = createNet();
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	for (const { R, y } of rows) {
		net.wire({ x: MARGIN, y }, R.ports['1']);
		net.wire(R.ports['2'], { x: sumX, y });
	}
	for (let k = 1; k < rows.length; k++) net.wire({ x: sumX, y: rows[k - 1].y }, { x: sumX, y: rows[k].y });
	net.wire({ x: sumX, y: top }, tap);
	net.wire(tap, negNode);
	net.wire(tap, { x: tap.x, y: railY });
	net.wire({ x: tap.x, y: railY }, Rf.ports['1']);
	net.wire(Rf.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });

	const parts = [
		opamp.svg,
		gndPlus.svg,
		Rf.svg,
		...rows.map((r) => r.R.svg),
		net.svg(),
		net.dots(portPoints(opamp, gndPlus, Rf, ...rows.map((r) => r.R))),
		...rows.map((r) => label(r.name, MARGIN, r.y - 10, { anchor: 'start' })),
		...rows.map((r) => label(r.text, r.R.ports['1'].x, r.y - 14, { anchor: 'start' })),
		label('v_s', Vout.x + 34, Vout.y + 5, { anchor: 'start' }),
		label(`R_f ${formatOhms(rf)}`, Rf.ports['1'].x, railY - 12, { anchor: 'start' })
	];

	const width = Vout.x + 30 + 60;
	const bottom = Math.max(gndPlus.ports['1'].y + 40, rows[rows.length - 1].y + 40);
	return { svg: parts.join(''), viewBox: `0 ${railY - 30} ${width} ${bottom - (railY - 30)}` };
}

/**
 * The diode and its tank: v_s through R_s and the diode into the tank,
 * whose parts (L, the capacitor or the stock pair that makes it, and R_t)
 * hang side by side from one rail; the rail is the output.
 */
export function buildDiodeTankDiagram({ rs, l, capacitors, r }) {
	const y0 = 170;
	const Vin = { x: MARGIN, y: y0 };
	const Rs = placeAt('resistor_right', '1', { x: Vin.x + 50, y: y0 });
	const diode = placeAt('diode_right', 'pos', { x: Rs.ports['2'].x + 50, y: y0 });
	const node = diode.ports.neg;
	const topY = node.y - 60;
	const caps = capacitors.length > 1 ? capacitors.map((c, k) => ['capacitor_down', `C${k + 1} ${formatFarads(c)}`]) : [['capacitor_down', `C ${formatFarads(capacitors[0])}`]];
	const specs = [['inductor_down', `L ${formatHenries(l)}`], ...caps, ['resistor_down', `R_t ${formatOhms(r)}`]];
	// each hangs by its port '1' on the rail, whatever the symbol's own offset
	const hung = specs.map(([name, text], k) => {
		const sym = placeAt(name, '1', { x: node.x + 60 + 90 * k, y: topY });
		const gnd = placeSymbol('ground_down', sym.ports['2'].x - 0.01 * SCALE, sym.ports['2'].y + 0.29 * SCALE, SCALE);
		return { sym, gnd, text };
	});
	const last = hung[hung.length - 1].sym;
	const Vout = { x: last.ports['1'].x + 70, y: topY };

	const net = createNet();
	net.wire(Vin, Rs.ports['1']);
	net.wire(Rs.ports['2'], diode.ports.pos);
	net.wire(node, { x: node.x, y: topY });
	let prev = { x: node.x, y: topY };
	for (const h of hung) {
		net.wire(prev, h.sym.ports['1']);
		net.wire(h.sym.ports['2'], h.gnd.ports['1']);
		prev = h.sym.ports['1'];
	}
	net.wire(prev, Vout);

	const parts = [
		Rs.svg,
		diode.svg,
		...hung.flatMap((h) => [h.sym.svg, h.gnd.svg]),
		net.svg(),
		net.dots(portPoints(Rs, diode, ...hung.flatMap((h) => [h.sym, h.gnd]))),
		label('v_s', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label(`R_s ${formatOhms(rs)}`, Rs.ports['1'].x, y0 - 14, { anchor: 'start' }),
		label('D', (diode.ports.pos.x + diode.ports.neg.x) / 2, y0 + 26, { anchor: 'middle' }),
		label('Vout', Vout.x + 6, Vout.y - 10, { anchor: 'start' }),
		...hung.map((h) => label(h.text, h.sym.ports['1'].x, topY - 12, { anchor: 'middle' }))
	];

	const width = Vout.x + 60;
	const bottom = Math.max(y0 + 40, ...hung.map((h) => h.gnd.ports['1'].y + 30));
	return { svg: parts.join(''), viewBox: `0 ${topY - 30} ${width} ${bottom - (topY - 30)}` };
}

/**
 * Precision full-wave rectifier (absolute-value circuit), verified against
 * TI TIDU030 ("Precision Full-Wave Rectifier, Dual-Supply"), Figure 2, and
 * in LTspice, and drawn the way TI draws it: both op-amps with the -
 * input on top. A top rail joins U1A's - input (node F), D1's anode and
 * R1; D1 points down from it into U1A's output P; D2 runs from P along the
 * output line into U1B's + input, with R3 from there to ground; R1 and R2
 * run along the rail, G drops into U1B's - input, and R2 comes down into
 * U1B's output. With R1 = R2 = R3, Vout = |Vin|. (With D1 the other way
 * up, both anodes on P, the circuit gives no full-wave output at all.)
 * Every part is placed by its pins, so every wire is straight, and
 * nothing crosses.
 */
export function buildPrecisionRectifierDiagram({ r1, r2, r3 }) {
	const mainY = 230;
	const u1a = placeAt('opamp_no_power_right', 'inp1', { x: MARGIN + 130, y: mainY }, { flipY: true });
	const Vin = { x: MARGIN, y: mainY };
	const P = { x: u1a.ports.out.x + 50, y: u1a.ports.out.y };
	const railY = u1a.ports.inp2.y - 110;
	const F = { x: P.x, y: railY };
	const d1 = placeAt('diode_down', 'pos', { x: P.x, y: railY + 22 });
	const d2 = placeAt('diode_right', 'pos', { x: P.x + 50, y: P.y });
	const H = { x: d2.ports.neg.x + 34, y: P.y };
	const R3 = placeAt('resistor_down', '1', { x: H.x, y: H.y + 28 });
	const gndR3 = placeAt('ground_down', '1', { x: H.x, y: R3.ports['2'].y + 14 });
	const R1 = placeAt('resistor_right', '1', { x: F.x + 44, y: railY });
	const G = { x: H.x + 44, y: railY };
	const R2 = placeAt('resistor_right', '1', { x: G.x + 34, y: railY });
	const u1b = placeAt('opamp_no_power_right', 'inp1', { x: G.x + 60, y: P.y }, { flipY: true });
	const Vout = { x: u1b.ports.out.x + 40, y: u1b.ports.out.y };
	const fX = u1a.ports.inp2.x - 24;

	const net = createNet();
	net.wire(Vin, u1a.ports.inp1);
	// U1A's - input up to the rail, from its left, and along to F
	net.wire(u1a.ports.inp2, { x: fX, y: u1a.ports.inp2.y });
	net.wire({ x: fX, y: u1a.ports.inp2.y }, { x: fX, y: railY });
	net.wire({ x: fX, y: railY }, F);
	// D1 from the rail down into U1A's output line
	net.wire(F, d1.ports.pos);
	net.wire(d1.ports.neg, P);
	net.wire(u1a.ports.out, P);
	// D2 along the output line to H, R3 from H to ground, H on into U1B's +
	net.wire(P, d2.ports.pos);
	net.wire(d2.ports.neg, H);
	net.wire(H, R3.ports['1']);
	net.wire(R3.ports['2'], gndR3.ports['1']);
	net.wire(H, u1b.ports.inp1);
	// R1 and R2 along the rail, G down into U1B's - input
	net.wire(F, R1.ports['1']);
	net.wire(R1.ports['2'], G);
	net.wire(G, R2.ports['1']);
	net.wire(G, { x: G.x, y: u1b.ports.inp2.y });
	net.wire({ x: G.x, y: u1b.ports.inp2.y }, u1b.ports.inp2);
	// R2 on to the output's column and down into it
	net.wire(R2.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(u1b.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });

	const middle = (o) => (o.ports.inp1.x + o.ports.out.x) / 2;
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
		label('U1A', middle(u1a), mainY + 32, { anchor: 'middle' }),
		label('U1B', middle(u1b), P.y + 38, { anchor: 'middle' }),
		label('D1', P.x + 12, (d1.ports.pos.y + d1.ports.neg.y) / 2 + 4, { anchor: 'start' }),
		label('D2', (d2.ports.pos.x + d2.ports.neg.x) / 2, P.y - 12, { anchor: 'middle' }),
		label(`R1 ${formatOhms(r1)}`, R1.ports['1'].x, railY - 12, { anchor: 'start' }),
		label(`R2 ${formatOhms(r2)}`, R2.ports['1'].x, railY - 12, { anchor: 'start' }),
		label(`R3 ${formatOhms(r3)}`, R3.ports['1'].x + 14, (R3.ports['1'].y + R3.ports['2'].y) / 2 + 4, { anchor: 'start' })
	];

	const width = Vout.x + 30 + 60;
	const top = railY - 40;
	const bottom = gndR3.ports['1'].y + 36;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${bottom - top}` };
}

/**
 * Half-wave rectifier: one diode from the AM input, and the load resistor
 * from its cathode to ground that gives the diode somewhere to send its
 * current (the envelope filter after it takes no DC).
 */
export function buildHalfWaveDiagram({ rl }) {
	const y0 = 120;
	const Vin = { x: MARGIN, y: y0 };
	const d = placeAt('diode_right', 'pos', { x: Vin.x + 90, y: y0 });
	const N = { x: d.ports.neg.x + 70, y: y0 };
	const R = placeAt('resistor_down', '1', { x: N.x, y: N.y + 30 });
	const gnd = placeSymbol('ground_down', R.ports['2'].x - 0.01 * SCALE, R.ports['2'].y + 0.29 * SCALE, SCALE);
	const Vout = { x: N.x + 110, y: y0 };

	const net = createNet();
	net.wire(Vin, d.ports.pos);
	net.wire(d.ports.neg, N);
	net.wire(N, R.ports['1']);
	net.wire(R.ports['2'], gnd.ports['1']);
	net.wire(N, Vout);

	const parts = [
		d.svg,
		R.svg,
		gnd.svg,
		net.svg(),
		net.dots(portPoints(d, R, gnd)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 6, Vout.y - 10, { anchor: 'start' }),
		label('D1', (d.ports.pos.x + d.ports.neg.x) / 2, y0 - 18, { anchor: 'middle' }),
		label(`R_L ${formatOhms(rl)}`, R.ports['1'].x + 14, (R.ports['1'].y + R.ports['2'].y) / 2 + 4, { anchor: 'start' })
	];

	const width = Vout.x + 60;
	return { svg: parts.join(''), viewBox: `0 ${y0 - 40} ${width} ${gnd.ports['1'].y + 36 - (y0 - 40)}` };
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
 * Bench setup for characterizing a JFET in its ohmic region, the way the
 * Measured points mode reads it: a small V_in through R_series into the
 * drain, the source grounded, the gate at an adjustable negative V_GS, a
 * voltmeter on the drain and one on the gate.
 */
export function buildJfetTestDiagram() {
	const railY = 90;
	const D = { x: 300, y: railY };
	const jfet = placeAt('njfet_transistor_horz', 'drain', { x: D.x, y: railY + 60 });
	const rser = placeAt('resistor_right', '2', { x: D.x - 50, y: railY });
	const vin = { x: MARGIN, y: railY };
	const vd = voltmeter(D.x + 90, railY + 60);
	const vdCorner = { x: vd.ports[1].x, y: railY };
	const vdGnd = placeAt('ground_down', '1', { x: vd.ports[2].x, y: vd.ports[2].y + 16 });
	const sGnd = placeAt('ground_down', '1', { x: jfet.ports.source.x, y: jfet.ports.source.y + 20 });
	const G = { x: jfet.ports.gate.x - 110, y: jfet.ports.gate.y };
	const vg = voltmeter(G.x, G.y + 50);
	const vgGnd = placeAt('ground_down', '1', { x: vg.ports[2].x, y: vg.ports[2].y + 16 });
	const supply = { x: MARGIN + 30, y: G.y };

	const net = createNet();
	net.wire(vin, rser.ports['1']);
	net.wire(rser.ports['2'], D);
	net.wire(D, jfet.ports.drain);
	net.wire(D, vdCorner);
	net.wire(vdCorner, vd.ports[1]);
	net.wire(vd.ports[2], vdGnd.ports['1']);
	net.wire(jfet.ports.source, sGnd.ports['1']);
	net.wire(supply, G);
	net.wire(G, jfet.ports.gate);
	net.wire(G, vg.ports[1]);
	net.wire(vg.ports[2], vgGnd.ports['1']);

	const meterMid = (m) => (m.ports[1].y + m.ports[2].y) / 2;
	const parts = [
		rser.svg,
		jfet.svg,
		vd.svg,
		vdGnd.svg,
		sGnd.svg,
		vg.svg,
		vgGnd.svg,
		net.svg(),
		net.dots(portPoints(rser, jfet, vd, vdGnd, sGnd, vg, vgGnd)),
		label('V_in, 0.1 to 0.2 V', vin.x, railY - 12, { anchor: 'start' }),
		label('R_series', (rser.ports['1'].x + rser.ports['2'].x) / 2, railY - 16, { anchor: 'middle' }),
		label('V_D', vd.ports[1].x + 22, meterMid(vd) + 4, { anchor: 'start' }),
		label('V_GS', vg.ports[1].x + 22, meterMid(vg) + 4, { anchor: 'start' }),
		label('adjustable, 0 V to V_P', supply.x, supply.y - 12, { anchor: 'start' }),
		label('D', jfet.ports.drain.x + 8, jfet.ports.drain.y - 4, { anchor: 'start' }),
		label('S', jfet.ports.source.x + 8, jfet.ports.source.y + 4, { anchor: 'start' }),
		label('G', jfet.ports.gate.x - 8, jfet.ports.gate.y - 6, { anchor: 'end' })
	];

	const width = vd.ports[1].x + 70;
	const bottom = vgGnd.ports['1'].y + 30;
	return { svg: parts.join(''), viewBox: `0 50 ${width} ${bottom - 50}` };
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
