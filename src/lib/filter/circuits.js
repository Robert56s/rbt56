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
 * MFB low-pass: R1 input, R2 to the virtual ground, R3 + C2 feedback (both
 * from the summing node to Vout), C1 from the virtual ground to ground,
 * non-inverting input grounded (its lead offset sideways so it never runs
 * down the same line as the inverting-input pin).
 */
export function buildMfbDiagram(components) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const R1 = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const S = R1.ports['2'];

	const R2 = placeSymbol('resistor_down', S.x, S.y + HANG.resistor_down * SCALE, SCALE);
	const VG = R2.ports['2'];
	const C1 = placeSymbol('capacitor_down', VG.x, VG.y + HANG.capacitor_down * SCALE, SCALE);
	const gndC1 = placeSymbol('ground_down', C1.ports['2'].x - 0.01 * SCALE, C1.ports['2'].y + 0.29 * SCALE, SCALE);

	const opamp = placeSymbol('opamp_no_power_right', S.x + 240, VG.y - 0.09 * SCALE, SCALE);
	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const railY = 100;
	const R3 = placeSymbol('resistor_right', (S.x + Vout.x) / 2, railY, SCALE);
	const C2 = placeSymbol('capacitor_right', (S.x + Vout.x) / 2, railY + 40, SCALE);

	const net = createNet();
	net.wire(Vin, R1.ports['1']);
	net.wire(R2.ports['1'], S);
	net.wire(C1.ports['1'], VG);
	net.elbow(VG, opamp.ports.inp2, 'h');
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	net.wire(C1.ports['2'], gndC1.ports['1']);
	net.wire(S, { x: S.x, y: railY });
	net.wire({ x: S.x, y: railY }, R3.ports['1']);
	net.wire({ x: S.x, y: railY }, { x: S.x, y: railY + 40 });
	net.wire({ x: S.x, y: railY + 40 }, C2.ports['1']);
	net.wire(R3.ports['2'], { x: Vout.x, y: railY });
	net.wire(C2.ports['2'], { x: Vout.x, y: railY + 40 });
	net.wire({ x: Vout.x, y: railY }, { x: Vout.x, y: railY + 40 });
	net.wire({ x: Vout.x, y: railY + 40 }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		R1.svg,
		R2.svg,
		C1.svg,
		gndC1.svg,
		opamp.svg,
		gndPlus.svg,
		R3.svg,
		C2.svg,
		net.svg(),
		net.dots(portPoints(R1, R2, C1, gndC1, opamp, gndPlus, R3, C2)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(`R1 ${formatOhms(components.R1)}`, S.x - 10, R1.ports['1'].y - 22, { anchor: 'end' }),
		label(`R2 ${formatOhms(components.R2)}`, R2.ports['1'].x + 12, (R2.ports['1'].y + R2.ports['2'].y) / 2, { anchor: 'start' }),
		label(`R3 ${formatOhms(components.R3)}`, R3.ports['1'].x, R3.ports['1'].y - 12, { anchor: 'start' }),
		label(`C2 ${formatFarads(components.C2)}`, C2.ports['1'].x, C2.ports['2'].y + 20, { anchor: 'start' }),
		label(`C1 ${formatFarads(components.C1)}`, C1.ports['1'].x + 12, (C1.ports['1'].y + C1.ports['2'].y) / 2, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 320` };
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
