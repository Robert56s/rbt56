import { placeSymbol, label, createNet, portPoints } from './schematic';
import { formatFarads, formatOhms, formatSeconds } from './format';

const SCALE = 48;
const MARGIN = 24;

// Local port-1 offsets (from schematic-symbols) used to hang a vertical
// component so its TOP port lands exactly on a target node - otherwise the
// component's body pokes past the node and a rail wired to that node runs
// through it.
const HANG = { resistor_down: 0.51, capacitor_down: 0.3 };

/**
 * MFB low-pass, the standard (Rauch) layout that mfb.js's transfer function
 * describes: R1 from Vin to the summing node S, C1 from S to ground, R2 from
 * S to the inverting input, R3 from Vout back to S (feedback, over a top
 * rail), C2 from the inverting input to Vout (feedback, under the triangle),
 * non-inverting input grounded (its lead offset sideways so it never runs
 * down the same line as the inverting-input pin).
 *
 * An earlier version drew C1 from the inverting input to ground and C2 from
 * S to Vout. With an ideal op-amp that circuit is only first order (C1 sits
 * across a virtual ground and does nothing), so it did not realize the
 * formula the components were solved from.
 */
export function buildMfbDiagram(components) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const R1 = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const S = R1.ports['2']; // summing node: R1, C1, R2, R3

	const C1 = placeSymbol('capacitor_down', S.x, S.y + HANG.capacitor_down * SCALE, SCALE);
	const gndC1 = placeSymbol('ground_down', C1.ports['2'].x - 0.01 * SCALE, C1.ports['2'].y + 0.29 * SCALE, SCALE);

	const R2 = placeSymbol('resistor_right', S.x + 90, y0, SCALE);
	const X = R2.ports['2']; // inverting-input node: R2, C2, opamp inp2

	// op-amp placed so its inverting input sits at X's height, so R2 feeds it
	// with a plain horizontal wire
	const opamp = placeSymbol('opamp_no_power_right', X.x + 90, y0 - 0.09 * SCALE, SCALE);
	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const railY = 110;
	const R3 = placeSymbol('resistor_right', (S.x + Vout.x) / 2, railY, SCALE);
	const loopY = gndPlus.ports['1'].y + 60;
	const C2 = placeSymbol('capacitor_right', (X.x + Vout.x) / 2, loopY, SCALE);

	const net = createNet();
	net.wire(Vin, R1.ports['1']);
	net.wire(S, R2.ports['1']);
	net.wire(X, opamp.ports.inp2);
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	net.wire(C1.ports['2'], gndC1.ports['1']);
	// R3 feedback: S up to the rail, across, down into Vout
	net.wire(S, { x: S.x, y: railY });
	net.wire({ x: S.x, y: railY }, R3.ports['1']);
	net.wire(R3.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	// C2 feedback: X down under the triangle, across, up into Vout
	net.wire(X, { x: X.x, y: loopY });
	net.wire({ x: X.x, y: loopY }, C2.ports['1']);
	net.wire(C2.ports['2'], { x: Vout.x, y: loopY });
	net.wire({ x: Vout.x, y: loopY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		R1.svg,
		C1.svg,
		gndC1.svg,
		R2.svg,
		opamp.svg,
		gndPlus.svg,
		R3.svg,
		C2.svg,
		net.svg(),
		net.dots(portPoints(R1, C1, gndC1, R2, opamp, gndPlus, R3, C2)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`R1 ${formatOhms(components.R1)}`, S.x - 10, y0 - 22, { anchor: 'end' }),
		label(`R2 ${formatOhms(components.R2)}`, R2.ports['1'].x, y0 - 22, { anchor: 'start' }),
		label(`C1 ${formatFarads(components.C1)}`, C1.ports['1'].x + 12, (C1.ports['1'].y + C1.ports['2'].y) / 2 + 8, { anchor: 'start' }),
		label(`R3 ${formatOhms(components.R3)}`, R3.ports['1'].x, railY - 12, { anchor: 'start' }),
		label(`C2 ${formatFarads(components.C2)}`, C2.ports['1'].x, loopY + 26, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	const top = railY - 32;
	const height = loopY + 44 - top;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${height}` };
}

/**
 * Sallen-Key low-pass, unity-gain follower: two equal resistors in series to
 * the + input, a feedback capacitor from Vout to the first junction, a
 * grounded capacitor at the second, the op-amp's follower loop routed below
 * the triangle. The op-amp is placed so its + input lines up with the second
 * junction's height, so nothing runs vertically past the - input pin.
 */
export function buildSallenKeyDiagram(components) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const R1 = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const J1 = R1.ports['2'];
	const R2 = placeSymbol('resistor_right', J1.x + 100, y0, SCALE);
	const J2 = R2.ports['2'];

	const Cbottom = placeSymbol('capacitor_down', J2.x, J2.y + HANG.capacitor_down * SCALE, SCALE);
	const gndBottom = placeSymbol('ground_down', Cbottom.ports['2'].x - 0.01 * SCALE, Cbottom.ports['2'].y + 0.29 * SCALE, SCALE);

	const opamp = placeSymbol('opamp_no_power_right', J2.x + 140, J2.y + 0.18 * SCALE, SCALE);
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
 * MFB high-pass: C1 from the input to the summing node A, R1 from A to
 * ground, C2 from A to the inverting input X, and two feedback paths back to
 * Vout - C3 from A, R2 from X. R1 hangs so its top pin sits exactly on A.
 */
export function buildMfbHpDiagram(components) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const C1 = placeSymbol('capacitor_right', Vin.x + 90, y0, SCALE);
	const A = C1.ports['2'];

	const R1 = placeSymbol('resistor_down', A.x, A.y + HANG.resistor_down * SCALE, SCALE);
	const gndR1 = placeSymbol('ground_down', R1.ports['2'].x - 0.01 * SCALE, R1.ports['2'].y + 0.29 * SCALE, SCALE);

	const C2 = placeSymbol('capacitor_right', A.x + 100, y0, SCALE);
	const X = C2.ports['2'];

	const opamp = placeSymbol('opamp_no_power_right', X.x + 140, X.y - 0.09 * SCALE, SCALE);
	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const railY1 = 90;
	const railY2 = 130;
	const C3 = placeSymbol('capacitor_right', (A.x + Vout.x) / 2, railY1, SCALE);
	const R2 = placeSymbol('resistor_right', (X.x + Vout.x) / 2, railY2, SCALE);

	const net = createNet();
	net.wire(Vin, C1.ports['1']);
	net.wire(C2.ports['1'], A);
	net.elbow(X, opamp.ports.inp2, 'h');
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	net.wire(R1.ports['2'], gndR1.ports['1']);
	net.wire(A, { x: A.x, y: railY1 });
	net.wire({ x: A.x, y: railY1 }, C3.ports['1']);
	net.wire(C3.ports['2'], { x: Vout.x, y: railY1 });
	net.wire({ x: Vout.x, y: railY1 }, { x: Vout.x, y: railY2 });
	net.wire(X, { x: X.x, y: railY2 });
	net.wire({ x: X.x, y: railY2 }, R2.ports['1']);
	net.wire(R2.ports['2'], { x: Vout.x, y: railY2 });
	net.wire({ x: Vout.x, y: railY2 }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		C1.svg,
		R1.svg,
		gndR1.svg,
		C2.svg,
		opamp.svg,
		gndPlus.svg,
		C3.svg,
		R2.svg,
		net.svg(),
		net.dots(portPoints(C1, R1, gndR1, C2, opamp, gndPlus, C3, R2)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`C1 ${formatFarads(components.C1)}`, A.x - 8, C1.ports['1'].y - 24, { anchor: 'end' }),
		label(`R1 ${formatOhms(components.R1)}`, R1.ports['1'].x + 12, (R1.ports['1'].y + R1.ports['2'].y) / 2, { anchor: 'start' }),
		label(`C2 ${formatFarads(components.C2)}`, X.x - 8, C2.ports['1'].y - 24, { anchor: 'end' }),
		label(`C3 ${formatFarads(components.C3)}`, C3.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(`R2 ${formatOhms(components.R2)}`, R2.ports['1'].x, railY2 + 24, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 320` };
}

/**
 * Sallen-Key high-pass, unity-gain follower: the R-C dual of the low-pass -
 * two equal capacitors in series to the + input, a feedback resistor from
 * Vout to the first junction, a grounded resistor at the second (hung so its
 * top pin sits on the junction).
 */
export function buildSallenKeyHpDiagram(components) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const C1 = placeSymbol('capacitor_right', Vin.x + 90, y0, SCALE);
	const J1 = C1.ports['2'];
	const C2 = placeSymbol('capacitor_right', J1.x + 100, y0, SCALE);
	const J2 = C2.ports['2'];

	const Rbottom = placeSymbol('resistor_down', J2.x, J2.y + HANG.resistor_down * SCALE, SCALE);
	const gndBottom = placeSymbol('ground_down', Rbottom.ports['2'].x - 0.01 * SCALE, Rbottom.ports['2'].y + 0.29 * SCALE, SCALE);

	const opamp = placeSymbol('opamp_no_power_right', J2.x + 140, J2.y + 0.18 * SCALE, SCALE);
	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const railY = 90;
	const Rtop = placeSymbol('resistor_right', (J1.x + Vout.x) / 2, railY, SCALE);
	const loopY = opamp.ports.out.y + 70;

	const net = createNet();
	net.wire(Vin, C1.ports['1']);
	net.wire(C1.ports['2'], C2.ports['1']);
	net.wire(C2.ports['2'], Rbottom.ports['1']);
	net.wire(Rbottom.ports['2'], gndBottom.ports['1']);
	net.elbow(J2, opamp.ports.inp1, 'h');
	net.wire(opamp.ports.out, { x: opamp.ports.out.x, y: loopY });
	net.wire({ x: opamp.ports.out.x, y: loopY }, { x: opamp.ports.inp2.x, y: loopY });
	net.wire({ x: opamp.ports.inp2.x, y: loopY }, opamp.ports.inp2);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });
	net.wire(J1, { x: J1.x, y: railY });
	net.wire({ x: J1.x, y: railY }, Rtop.ports['1']);
	net.wire(Rtop.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);

	const parts = [
		C1.svg,
		C2.svg,
		Rbottom.svg,
		gndBottom.svg,
		opamp.svg,
		Rtop.svg,
		net.svg(),
		net.dots(portPoints(C1, C2, Rbottom, gndBottom, opamp, Rtop)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`C ${formatFarads(components.C1)}`, J1.x - 8, C1.ports['1'].y - 24, { anchor: 'end' }),
		label(`C ${formatFarads(components.C2)}`, C2.ports['1'].x, C2.ports['1'].y - 24, { anchor: 'start' }),
		label(`R_top ${formatOhms(components.Rtop)}`, Rtop.ports['1'].x, railY - 20, { anchor: 'start' }),
		label(`R_bottom ${formatOhms(components.Rbottom)}`, Rbottom.ports['1'].x - 40, gndBottom.ports['1'].y + 35, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 300` };
}

/** First-order high-pass, H(s) = RCs / (RCs + 1): series C, R to ground. */
export function buildFirstOrderHpDiagram(components, actualTau) {
	const y0 = 160;
	const Vin = { x: MARGIN, y: y0 };
	const C = placeSymbol('capacitor_right', Vin.x + 90, y0, SCALE);
	const node = C.ports['2'];
	const R = placeSymbol('resistor_down', node.x, node.y + HANG.resistor_down * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', R.ports['2'].x - 0.01 * SCALE, R.ports['2'].y + 0.29 * SCALE, SCALE);
	const Vout = { x: node.x + 90, y: node.y };

	const net = createNet();
	net.wire(Vin, C.ports['1']);
	net.wire(R.ports['2'], gnd.ports['1']);
	net.wire(node, Vout);

	const parts = [
		C.svg,
		R.svg,
		gnd.svg,
		net.svg(),
		net.dots(portPoints(C, R, gnd)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 8, Vout.y - 12, { anchor: 'start' }),
		label(`C ${formatFarads(components.C)}`, C.ports['1'].x, C.ports['1'].y - 24, { anchor: 'start' }),
		label(`R ${formatOhms(components.R)}`, R.ports['1'].x + 12, (R.ports['1'].y + R.ports['2'].y) / 2, { anchor: 'start' }),
		label(`τ = RC = ${formatSeconds(actualTau)}`, C.ports['1'].x, R.ports['2'].y + 40, { cls: 'lbl note' })
	];

	const width = Vout.x + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 220` };
}

/** First-order low-pass, H(s) = 1 / (RCs + 1): series R, C to ground. */
export function buildFirstOrderDiagram(components, actualTau) {
	const y0 = 160;
	const Vin = { x: MARGIN, y: y0 };
	const R = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const node = R.ports['2'];
	const C = placeSymbol('capacitor_down', node.x, node.y + HANG.capacitor_down * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', C.ports['2'].x - 0.01 * SCALE, C.ports['2'].y + 0.29 * SCALE, SCALE);
	const Vout = { x: node.x + 90, y: node.y };

	const net = createNet();
	net.wire(Vin, R.ports['1']);
	net.wire(C.ports['2'], gnd.ports['1']);
	net.wire(node, Vout);

	const parts = [
		R.svg,
		C.svg,
		gnd.svg,
		net.svg(),
		net.dots(portPoints(R, C, gnd)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 8, Vout.y - 12, { anchor: 'start' }),
		label(`R ${formatOhms(components.R)}`, R.ports['1'].x, R.ports['1'].y - 24, { anchor: 'start' }),
		label(`C ${formatFarads(components.C)}`, C.ports['1'].x + 12, (C.ports['1'].y + C.ports['2'].y) / 2, { anchor: 'start' }),
		label(`τ = RC = ${formatSeconds(actualTau)}`, R.ports['1'].x, C.ports['2'].y + 40, { cls: 'lbl note' })
	];

	const width = Vout.x + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 220` };
}

/**
 * Tow-Thomas biquad (towThomas.js). Main row: Vin through the input element
 * (R1, or Cin for the high-pass form) into A1's summing node N1, A1 with C1
 * and Rd in parallel on two rails above it, then Rb into A2's summing node
 * N2 with C2 on a rail above. Below the row, the inverter A3 (drawn facing
 * left) takes A2's output through r, feeds back through r, and returns
 * through Ra up into N1 to close the loop. Low-pass at A2's output, band-
 * pass at A1's; the high-pass form takes its output at A1 and A2's output
 * is then the band-pass.
 */
function towThomasCore(components, highPass) {
	const y0 = 300;
	const Vin = { x: MARGIN, y: y0 };
	const input = highPass
		? placeSymbol('capacitor_right', Vin.x + 90, y0, SCALE)
		: placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const N1 = input.ports['2']; // A1 summing node: input, Ra (loop), C1 and Rd rails, A1 -

	const A1 = placeSymbol('opamp_no_power_right', N1.x + 110, y0 - 0.09 * SCALE, SCALE);
	const gnd1X = A1.ports.inp1.x - 35;
	const gnd1 = placeSymbol('ground_down', gnd1X - 0.01 * SCALE, A1.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);
	const B = A1.ports.out; // A1 output: band-pass (low-pass form) or the high-pass output

	const Rb = placeSymbol('resistor_right', B.x + 90, B.y, SCALE);
	const N2 = Rb.ports['2'];
	const A2 = placeSymbol('opamp_no_power_right', N2.x + 110, B.y - 0.09 * SCALE, SCALE);
	const gnd2X = A2.ports.inp1.x - 35;
	const gnd2 = placeSymbol('ground_down', gnd2X - 0.01 * SCALE, A2.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);
	const L = A2.ports.out; // A2 output: low-pass (or band-pass in the high-pass form)

	const railY1 = y0 - 120;
	const railY2 = y0 - 76;
	const C1 = placeSymbol('capacitor_right', (N1.x + B.x) / 2, railY1, SCALE);
	const Rd = placeSymbol('resistor_right', (N1.x + B.x) / 2, railY2, SCALE);
	const C2 = placeSymbol('capacitor_right', (N2.x + L.x) / 2, railY1, SCALE);

	// inverter in the return path, facing left, under the gap between A1 and A2
	const yA3 = y0 + 130;
	const xA3 = B.x + 20;
	const A3 = placeSymbol('opamp_no_power_left', xA3, yA3, SCALE);
	const r1 = placeSymbol('resistor_right', A3.ports.inp2.x + 60, A3.ports.inp2.y, SCALE);
	const loopY = yA3 + 60;
	const r2 = placeSymbol('resistor_right', (A3.ports.out.x + A3.ports.inp2.x) / 2, loopY, SCALE);
	const gnd3X = A3.ports.inp1.x + 20;
	const gnd3 = placeSymbol('ground_down', gnd3X - 0.01 * SCALE, A3.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);
	const Ra = placeSymbol('resistor_down', N1.x, N1.y + HANG.resistor_down * SCALE, SCALE);

	const net = createNet();
	net.wire(Vin, input.ports['1']);
	net.wire(N1, A1.ports.inp2);
	net.elbow(A1.ports.inp1, gnd1.ports['1'], 'h');
	net.wire(B, Rb.ports['1']);
	net.wire(N2, A2.ports.inp2);
	net.elbow(A2.ports.inp1, gnd2.ports['1'], 'h');
	// A1 feedback: C1 on the top rail, Rd on the rail under it
	net.wire(N1, { x: N1.x, y: railY2 });
	net.wire({ x: N1.x, y: railY2 }, { x: N1.x, y: railY1 });
	net.wire({ x: N1.x, y: railY1 }, C1.ports['1']);
	net.wire({ x: N1.x, y: railY2 }, Rd.ports['1']);
	net.wire(C1.ports['2'], { x: B.x, y: railY1 });
	net.wire(Rd.ports['2'], { x: B.x, y: railY2 });
	net.wire({ x: B.x, y: railY1 }, { x: B.x, y: railY2 });
	net.wire({ x: B.x, y: railY2 }, B);
	// A2 feedback: C2 on the top rail
	net.wire(N2, { x: N2.x, y: railY1 });
	net.wire({ x: N2.x, y: railY1 }, C2.ports['1']);
	net.wire(C2.ports['2'], { x: L.x, y: railY1 });
	net.wire({ x: L.x, y: railY1 }, L);
	// the loop: A2 output down to the inverter, inverter output back up into N1 through Ra
	net.wire(L, { x: L.x, y: r1.ports['2'].y });
	net.wire({ x: L.x, y: r1.ports['2'].y }, r1.ports['2']);
	net.wire(r1.ports['1'], A3.ports.inp2);
	net.elbow(A3.ports.inp1, gnd3.ports['1'], 'h');
	net.wire(A3.ports.inp2, { x: A3.ports.inp2.x, y: loopY });
	net.wire({ x: A3.ports.inp2.x, y: loopY }, r2.ports['2']);
	net.wire(r2.ports['1'], { x: A3.ports.out.x, y: loopY });
	net.wire({ x: A3.ports.out.x, y: loopY }, A3.ports.out);
	net.wire(A3.ports.out, { x: N1.x, y: A3.ports.out.y });
	net.wire({ x: N1.x, y: A3.ports.out.y }, Ra.ports['2']);
	// a tap on A1's output: the band-pass (low-pass form) or the output (high-pass form)
	const tap = { x: B.x + 30, y: B.y };
	const tapEnd = { x: tap.x, y: y0 + 44 };
	net.wire(tap, tapEnd);
	// right end: the stage output (low-pass form) or the band-pass (high-pass form)
	const end = { x: L.x + (highPass ? 40 : 90), y: L.y };
	net.wire(L, end);
	if (!highPass) net.wire(end, { x: end.x + 40, y: end.y });

	const c = components;
	const parts = [
		input.svg,
		A1.svg,
		gnd1.svg,
		Rb.svg,
		A2.svg,
		gnd2.svg,
		C1.svg,
		Rd.svg,
		C2.svg,
		A3.svg,
		r1.svg,
		r2.svg,
		gnd3.svg,
		Ra.svg,
		net.svg(),
		net.dots(portPoints(input, A1, gnd1, Rb, A2, gnd2, C1, Rd, C2, A3, r1, r2, gnd3, Ra)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label(highPass ? `Cin ${formatFarads(c.Cin)}` : `R1 ${formatOhms(c.R1)}`, N1.x - 10, y0 - 22, { anchor: 'end' }),
		label(`Rb ${formatOhms(c.Rb)}`, N2.x - 8, B.y - 22, { anchor: 'end' }),
		label(`C1 ${formatFarads(c.C1)}`, C1.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(`Rd ${formatOhms(c.Rd)}`, Rd.ports['1'].x, railY2 - 12, { anchor: 'start' }),
		label(`C2 ${formatFarads(c.C2)}`, C2.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(`Ra ${formatOhms(c.Ra)}`, N1.x - 12, (Ra.ports['1'].y + Ra.ports['2'].y) / 2 + 4, { anchor: 'end' }),
		label(`r ${formatOhms(c.r)}`, r1.ports['1'].x, r1.ports['1'].y - 12, { anchor: 'start' }),
		label(`r ${formatOhms(c.r)}`, r2.ports['1'].x, loopY + 24, { anchor: 'start' }),
		label('A1', A1.ports.out.x - 24, y0 + 24, { anchor: 'middle' }),
		label('A2', A2.ports.out.x - 24, B.y + 24, { anchor: 'middle' }),
		label('A3', A3.ports.out.x + 24, yA3 - 22, { anchor: 'middle' }),
		label(highPass ? 'Vout (HP)' : 'V_bp', tapEnd.x + 6, tapEnd.y + 2, { anchor: 'start' }),
		label(highPass ? 'V_bp' : 'Vout (LP)', end.x + (highPass ? 6 : 48), end.y + 5, { anchor: 'start' })
	];

	const width = Math.max(end.x + 40, r1.ports['2'].x + 30) + 70;
	const top = railY1 - 30;
	const height = loopY + 44 - top;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${height}` };
}

export function buildTowThomasDiagram(components) {
	return towThomasCore(components, false);
}

export function buildTowThomasHpDiagram(components) {
	return towThomasCore(components, true);
}

/**
 * Unity-gain difference amplifier: used in place of the summing amplifier
 * when a band-stop's two branches arrive with opposite signs (one of them
 * has an odd number of inverting stages, the other an even number). V_hp
 * goes into the + input through R with R to ground, V_lp into the - input
 * through R with R as feedback, so Vout = V_hp - V_lp: with opposite signs
 * that is the sum of the two magnitudes, and the notch is preserved.
 */
export function buildDifferenceAmpDiagram(R) {
	const opamp = placeSymbol('opamp_no_power_right', MARGIN + 260, 200, SCALE);
	const yTop = opamp.ports.inp1.y; // + input row carries V_hp
	const yBot = opamp.ports.inp2.y + 110; // - input row carries V_lp

	const VinHp = { x: MARGIN, y: yTop };
	const Rh = placeSymbol('resistor_right', MARGIN + 90, yTop, SCALE);
	const P = { x: opamp.ports.inp1.x - 60, y: yTop }; // + node: Rh in, Rg down, pin to the right
	const Rg = placeSymbol('resistor_down', P.x, P.y + HANG.resistor_down * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', Rg.ports['2'].x - 0.01 * SCALE, Rg.ports['2'].y + 0.29 * SCALE, SCALE);

	const VinLp = { x: MARGIN, y: yBot };
	const Rl = placeSymbol('resistor_right', MARGIN + 90, yBot, SCALE);
	const M = { x: opamp.ports.inp2.x - 30, y: yBot }; // - node corner: Rl in, up to the pin, down to Rf
	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const railY = yBot + 50;
	const Rf = placeSymbol('resistor_right', (M.x + Vout.x) / 2, railY, SCALE);

	const net = createNet();
	net.wire(VinHp, Rh.ports['1']);
	net.wire(Rh.ports['2'], P);
	net.wire(P, opamp.ports.inp1);
	net.wire(Rg.ports['2'], gnd.ports['1']);
	net.wire(VinLp, Rl.ports['1']);
	net.wire(Rl.ports['2'], M);
	net.wire(M, { x: M.x, y: opamp.ports.inp2.y });
	net.wire({ x: M.x, y: opamp.ports.inp2.y }, opamp.ports.inp2);
	net.wire(M, { x: M.x, y: railY });
	net.wire({ x: M.x, y: railY }, Rf.ports['1']);
	net.wire(Rf.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		Rh.svg,
		Rg.svg,
		gnd.svg,
		Rl.svg,
		opamp.svg,
		Rf.svg,
		net.svg(),
		net.dots(portPoints(Rh, Rg, gnd, Rl, opamp, Rf)),
		label('V_hp', VinHp.x, VinHp.y - 12, { anchor: 'start' }),
		label('V_lp', VinLp.x, VinLp.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`R ${formatOhms(R)}`, Rh.ports['1'].x, yTop - 24, { anchor: 'start' }),
		label(`R ${formatOhms(R)}`, Rl.ports['1'].x, yBot - 24, { anchor: 'start' }),
		label(`Rg ${formatOhms(R)}`, P.x - 12, (Rg.ports['1'].y + Rg.ports['2'].y) / 2 + 4, { anchor: 'end' }),
		label(`Rf ${formatOhms(R)}`, Rf.ports['1'].x, railY + 24, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	const top = yTop - 40;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${railY + 44 - top}` };
}

/**
 * Unity-gain inverting summing amplifier: sums the low-pass and high-pass
 * branch outputs of a band-stop design. Ra and Rb into the summing node, Rf
 * in feedback from Vout, + input grounded (lead offset sideways).
 */
export function buildSummingAmpDiagram(R) {
	const yTop = 140;
	const yBottom = 260;
	const yMid = (yTop + yBottom) / 2;
	const inputX = MARGIN + 90;

	const VinLp = { x: MARGIN, y: yTop };
	const Ra = placeSymbol('resistor_right', inputX, yTop, SCALE);
	const VinHp = { x: MARGIN, y: yBottom };
	const Rb = placeSymbol('resistor_right', inputX, yBottom, SCALE);

	const busX = Ra.ports['2'].x; // vertical bus joining both input resistors

	const opamp = placeSymbol('opamp_no_power_right', busX + 170, yMid - 0.09 * SCALE, SCALE);
	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	// Summing node taps off the bus and runs right to a point left of the
	// op-amp; the feedback rises from THERE, not from the bus, so it never
	// runs back up across the input resistors' outputs.
	const S = { x: busX, y: yMid };
	const T = { x: opamp.ports.inp2.x - 40, y: yMid };
	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const railY = 90;
	const Rf = placeSymbol('resistor_right', (T.x + Vout.x) / 2, railY, SCALE);

	const net = createNet();
	net.wire(VinLp, Ra.ports['1']);
	net.wire(VinHp, Rb.ports['1']);
	net.wire(Ra.ports['2'], { x: busX, y: yTop });
	net.wire({ x: busX, y: yTop }, { x: busX, y: yBottom });
	net.wire(Rb.ports['2'], { x: busX, y: yBottom });
	net.wire(S, T);
	net.elbow(T, opamp.ports.inp2, 'h');
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	net.elbow(T, Rf.ports['1'], 'v');
	net.wire(Rf.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		Ra.svg,
		Rb.svg,
		opamp.svg,
		gndPlus.svg,
		Rf.svg,
		net.svg(),
		net.dots(portPoints(Ra, Rb, opamp, gndPlus, Rf)),
		label('V_lp', VinLp.x, VinLp.y - 12, { anchor: 'start' }),
		label('V_hp', VinHp.x, VinHp.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`Ra ${formatOhms(R)}`, Ra.ports['1'].x, Ra.ports['1'].y - 24, { anchor: 'start' }),
		label(`Rb ${formatOhms(R)}`, Rb.ports['1'].x, Rb.ports['1'].y + 30, { anchor: 'start' }),
		label(`Rf ${formatOhms(R)}`, Rf.ports['1'].x, railY - 12, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 60 ${width} 280` };
}
