import { placeSymbol, label, createNet, portPoints } from './schematic';
import { formatFarads, formatOhms, formatSeconds } from './format';

const SCALE = 48;
const MARGIN = 24;

// Local port-1 offsets (from schematic-symbols) used to hang a vertical
// component so its TOP port lands exactly on a target node - otherwise the
// component's body pokes past the node and a rail wired to that node runs
// through it.
const HANG = { resistor_down: 0.51, capacitor_down: 0.3 };

// Every stage builder below takes an optional last argument { ohms }: how a
// resistor's value is written on the drawing. It defaults to formatOhms
// ("4.20 kΩ"); the filter page passes one that names the two parts of a
// resistor built from two in series ("2.2k + 2k", pairDiagramLabel in
// eseries.js). Capacitors are always written with formatFarads.
//
// Such a label is longer than a single value ("R1 12.1k + 3.32k" against
// "R1 10.0 kΩ"), so where one would run into a wire or another label, the
// builder makes room: it moves the label, or lengthens a lead so the parts
// after it move right. Only a label that no longer fits does that: every
// label that fits stays exactly where it always was.

// Labels are 11px monospace (CircuitDiagram.svelte), about 6.6px a
// character: the width scripts/check-schematics.mjs measures them with.
const CHAR_W = 6.6;
// Baseline to baseline for two labels, one just clear above the other.
const LINE = 15;
const textWidth = (text) => text.length * CHAR_W;
// Every stage has its Vin label at the left margin, over the input lead.
const VIN_END = MARGIN + textWidth('Vin');
const BUFFER_NOTE = 'unity-gain buffer';

/**
 * How far to move a label, or whatever it runs into, when the two overlap
 * by `overlap` px (a negative overlap: they are clear by that much).
 * Nothing when they are at least 1px clear, otherwise enough to leave a
 * character's space between them.
 */
function clearance(overlap) {
	return overlap <= -1 ? 0 : overlap + CHAR_W;
}

/**
 * Places a horizontal part with `place(dx)` (dx = 0: its usual place),
 * moved right just enough for its label, right-aligned `gap` px short of
 * the part's right pin, to start clear of `limit`: the Vin label, or a
 * riser to the left. Moving the part lengthens its lead, and every part
 * placed from it moves right too.
 */
function placeClear(place, text, gap, limit) {
	const end = place(0).ports['2'].x - gap;
	return place(clearance(limit - (end - textWidth(text))));
}

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
export function buildMfbDiagram(components, { ohms = formatOhms } = {}) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	// R1's label ends 10px short of S; a long one moves R1 right
	const r1Text = `R1 ${ohms(components.R1)}`;
	const R1 = placeClear((dx) => placeSymbol('resistor_right', Vin.x + 90 + dx, y0, SCALE), r1Text, 10, VIN_END);
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
		label(r1Text, S.x - 10, y0 - 22, { anchor: 'end' }),
		label(`R2 ${ohms(components.R2)}`, R2.ports['1'].x, y0 - 22, { anchor: 'start' }),
		label(`C1 ${formatFarads(components.C1)}`, C1.ports['1'].x + 12, (C1.ports['1'].y + C1.ports['2'].y) / 2 + 8, { anchor: 'start' }),
		label(`R3 ${ohms(components.R3)}`, R3.ports['1'].x, railY - 12, { anchor: 'start' }),
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
export function buildSallenKeyDiagram(components, { ohms = formatOhms } = {}) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	// R1's label starts 20px left of R1 and ends short of J1's riser; a long
	// one ends a character short of it instead, and moves R1 right when it
	// would then reach the Vin label
	const r1Text = `R ${ohms(components.R1)}`;
	const R1 = placeClear((dx) => placeSymbol('resistor_right', Vin.x + 90 + dx, y0, SCALE), r1Text, CHAR_W, VIN_END);
	const J1 = R1.ports['2'];
	const r1X = R1.ports['1'].x - 20;
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
		label(r1Text, r1X - clearance(r1X + textWidth(r1Text) - J1.x), R1.ports['1'].y - 24, { anchor: 'start' }),
		label(`R ${ohms(components.R2)}`, R2.ports['1'].x, R2.ports['1'].y - 24, { anchor: 'start' }),
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
export function buildMfbHpDiagram(components, { ohms = formatOhms } = {}) {
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
		label(`R1 ${ohms(components.R1)}`, R1.ports['1'].x + 12, (R1.ports['1'].y + R1.ports['2'].y) / 2, { anchor: 'start' }),
		label(`C2 ${formatFarads(components.C2)}`, X.x - 8, C2.ports['1'].y - 24, { anchor: 'end' }),
		label(`C3 ${formatFarads(components.C3)}`, C3.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(`R2 ${ohms(components.R2)}`, R2.ports['1'].x, railY2 + 24, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 320` };
}

/**
 * MFB band-pass (Delyiannis-Friend, mfbBandPass.js), laid out like the MFB
 * high-pass: R1 from the input to A, R2 hung from A to ground (with R1 the
 * input attenuator), C2 from A to the inverting input X, and two feedback
 * paths back to Vout: C1 from A over the top rail, R3 from X on the rail
 * under it.
 */
export function buildMfbBpDiagram(components, { ohms = formatOhms } = {}) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	// R1's label ends 10px short of A; a long one moves R1 right
	const r1Text = `R1 ${ohms(components.R1)}`;
	const R1 = placeClear((dx) => placeSymbol('resistor_right', Vin.x + 90 + dx, y0, SCALE), r1Text, 10, VIN_END);
	const A = R1.ports['2'];

	const R2 = placeSymbol('resistor_down', A.x, A.y + HANG.resistor_down * SCALE, SCALE);
	const gndR2 = placeSymbol('ground_down', R2.ports['2'].x - 0.01 * SCALE, R2.ports['2'].y + 0.29 * SCALE, SCALE);

	const C2 = placeSymbol('capacitor_right', A.x + 100, y0, SCALE);
	const X = C2.ports['2'];

	const opamp = placeSymbol('opamp_no_power_right', X.x + 140, X.y - 0.09 * SCALE, SCALE);
	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	const Vout = { x: opamp.ports.out.x + 90, y: opamp.ports.out.y };
	const railY1 = 90;
	const railY2 = 130;
	const C1 = placeSymbol('capacitor_right', (A.x + Vout.x) / 2, railY1, SCALE);
	const R3 = placeSymbol('resistor_right', (X.x + Vout.x) / 2, railY2, SCALE);

	const net = createNet();
	net.wire(Vin, R1.ports['1']);
	net.wire(C2.ports['1'], A);
	net.elbow(X, opamp.ports.inp2, 'h');
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	net.wire(R2.ports['2'], gndR2.ports['1']);
	net.wire(A, { x: A.x, y: railY1 });
	net.wire({ x: A.x, y: railY1 }, C1.ports['1']);
	net.wire(C1.ports['2'], { x: Vout.x, y: railY1 });
	net.wire({ x: Vout.x, y: railY1 }, { x: Vout.x, y: railY2 });
	net.wire(X, { x: X.x, y: railY2 });
	net.wire({ x: X.x, y: railY2 }, R3.ports['1']);
	net.wire(R3.ports['2'], { x: Vout.x, y: railY2 });
	net.wire({ x: Vout.x, y: railY2 }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		R1.svg,
		R2.svg,
		gndR2.svg,
		C2.svg,
		opamp.svg,
		gndPlus.svg,
		C1.svg,
		R3.svg,
		net.svg(),
		net.dots(portPoints(R1, R2, gndR2, C2, opamp, gndPlus, C1, R3)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(r1Text, A.x - 10, y0 - 22, { anchor: 'end' }),
		label(`R2 ${ohms(components.R2)}`, R2.ports['1'].x + 12, (R2.ports['1'].y + R2.ports['2'].y) / 2, { anchor: 'start' }),
		label(`C2 ${formatFarads(components.C2)}`, X.x - 8, C2.ports['1'].y - 24, { anchor: 'end' }),
		label(`C1 ${formatFarads(components.C1)}`, C1.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(`R3 ${ohms(components.R3)}`, R3.ports['1'].x, railY2 + 24, { anchor: 'start' })
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
export function buildSallenKeyHpDiagram(components, { ohms = formatOhms } = {}) {
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
		label(`R_top ${ohms(components.Rtop)}`, Rtop.ports['1'].x, railY - 20, { anchor: 'start' }),
		label(`R_bottom ${ohms(components.Rbottom)}`, Rbottom.ports['1'].x - 40, gndBottom.ports['1'].y + 35, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} 300` };
}

/**
 * The passive RC node of a first-order stage feeds a unity-gain follower.
 * Without it the stage's output is the resistor itself (tens of kilo-ohms
 * of source impedance): anything but a high-impedance input loads it down
 * and the signal disappears, which is exactly what happens when a
 * headphone or a speaker is hung on it. The follower costs one op-amp and
 * changes nothing in the transfer function.
 */
function followerOpamp(node, dx = 0) {
	// + input lined up with the RC node's height, so the node feeds it with a
	// plain wire; `dx` further right when a long label needs the room
	return placeSymbol('opamp_no_power_right', node.x + 110 + dx, node.y + 0.18 * SCALE, SCALE);
}

function followerAfter(net, node, parts, ports, dx = 0) {
	const opamp = followerOpamp(node, dx);
	const out = opamp.ports.out;
	const loopY = out.y + 60;
	const Vout = { x: out.x + 60, y: out.y };
	net.wire(node, opamp.ports.inp1);
	net.wire(out, { x: out.x, y: loopY });
	net.wire({ x: out.x, y: loopY }, { x: opamp.ports.inp2.x, y: loopY });
	net.wire({ x: opamp.ports.inp2.x, y: loopY }, opamp.ports.inp2);
	net.wire(out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });
	parts.push(opamp.svg);
	ports.push(...portPoints(opamp));
	return { opamp, Vout, loopY };
}

/** First-order high-pass, H(s) = RCs / (RCs + 1): series C, R to ground, then a follower. */
export function buildFirstOrderHpDiagram(components, actualTau, { ohms = formatOhms } = {}) {
	const y0 = 160;
	const Vin = { x: MARGIN, y: y0 };
	const C = placeSymbol('capacitor_right', Vin.x + 90, y0, SCALE);
	const node = C.ports['2'];
	const R = placeSymbol('resistor_down', node.x, node.y + HANG.resistor_down * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', R.ports['2'].x - 0.01 * SCALE, R.ports['2'].y + 0.29 * SCALE, SCALE);

	const net = createNet();
	const parts = [C.svg, R.svg, gnd.svg];
	const ports = portPoints(C, R, gnd);
	net.wire(Vin, C.ports['1']);
	net.wire(R.ports['2'], gnd.ports['1']);
	// R's label, beside it, has to end short of the buffer's input; a long
	// one moves the buffer right
	const rText = `R ${ohms(components.R)}`;
	const rX = R.ports['1'].x + 12;
	const dx = clearance(rX + textWidth(rText) - followerOpamp(node).ports.inp2.x);
	const { opamp, Vout, loopY } = followerAfter(net, node, parts, ports, dx);

	parts.push(
		net.svg(),
		net.dots(ports),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 36, Vout.y + 5, { anchor: 'start' }),
		label(`C ${formatFarads(components.C)}`, C.ports['1'].x, C.ports['1'].y - 24, { anchor: 'start' }),
		label(rText, rX, (R.ports['1'].y + R.ports['2'].y) / 2, { anchor: 'start' }),
		label(`τ = RC = ${formatSeconds(actualTau)}`, C.ports['1'].x, R.ports['2'].y + 40, { cls: 'lbl note' }),
		label(BUFFER_NOTE, opamp.ports.out.x - 24, node.y - 26, { anchor: 'middle', cls: 'lbl note' })
	);

	const width = Vout.x + 30 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} ${loopY + 34 - 40}` };
}

/** First-order low-pass, H(s) = 1 / (RCs + 1): series R, C to ground, then a follower. */
export function buildFirstOrderDiagram(components, actualTau, { ohms = formatOhms } = {}) {
	const y0 = 160;
	const Vin = { x: MARGIN, y: y0 };
	const R = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const node = R.ports['2'];
	const C = placeSymbol('capacitor_down', node.x, node.y + HANG.capacitor_down * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', C.ports['2'].x - 0.01 * SCALE, C.ports['2'].y + 0.29 * SCALE, SCALE);

	const net = createNet();
	const parts = [R.svg, C.svg, gnd.svg];
	const ports = portPoints(R, C, gnd);
	net.wire(Vin, R.ports['1']);
	net.wire(C.ports['2'], gnd.ports['1']);
	// R's label, over it, has to end short of the note over the buffer; a
	// long one moves the buffer right
	const rText = `R ${ohms(components.R)}`;
	const noteStart = followerOpamp(node).ports.out.x - 24 - textWidth(BUFFER_NOTE) / 2;
	const dx = clearance(R.ports['1'].x + textWidth(rText) - noteStart);
	const { opamp, Vout, loopY } = followerAfter(net, node, parts, ports, dx);

	parts.push(
		net.svg(),
		net.dots(ports),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 36, Vout.y + 5, { anchor: 'start' }),
		label(rText, R.ports['1'].x, R.ports['1'].y - 24, { anchor: 'start' }),
		label(`C ${formatFarads(components.C)}`, C.ports['1'].x + 12, (C.ports['1'].y + C.ports['2'].y) / 2, { anchor: 'start' }),
		label(`τ = RC = ${formatSeconds(actualTau)}`, R.ports['1'].x, C.ports['2'].y + 40, { cls: 'lbl note' }),
		label(BUFFER_NOTE, opamp.ports.out.x - 24, node.y - 26, { anchor: 'middle', cls: 'lbl note' })
	);

	const width = Vout.x + 30 + 60;
	return { svg: parts.join(''), viewBox: `0 40 ${width} ${loopY + 34 - 40}` };
}

/**
 * Tow-Thomas biquad (towThomas.js). Main row: Vin through the input element
 * (R1, or Cin for the high-pass form) into A1's summing node N1, A1 with C1
 * and Rd in parallel on two rails above it, then Rb into A2's summing node
 * N2 with C2 on a rail above. Below the row, the inverter A3 (drawn facing
 * left) takes A2's output through r, feeds back through r, and returns
 * through Ra up into N1 to close the loop. Low-pass at A2's output, band-
 * pass at A1's; the high-pass form takes its output at A1 and A2's output
 * is then the band-pass. The band-pass form (`bandPass`) is the low-pass
 * circuit with its output taken at A1.
 */
function towThomasCore(components, highPass, ohms, bandPass = false) {
	const c = components;
	const atA1 = highPass || bandPass;
	const y0 = 300;
	const Vin = { x: MARGIN, y: y0 };
	// the input element's label ends 10px short of N1; a long one moves the
	// input element, and the whole stage after it, right
	const inputText = highPass ? `Cin ${formatFarads(c.Cin)}` : `R1 ${ohms(c.R1)}`;
	const input = placeClear((dx) => placeSymbol(highPass ? 'capacitor_right' : 'resistor_right', Vin.x + 90 + dx, y0, SCALE), inputText, 10, VIN_END);
	const N1 = input.ports['2']; // A1 summing node: input, Ra (loop), C1 and Rd rails, A1 -

	const A1 = placeSymbol('opamp_no_power_right', N1.x + 110, y0 - 0.09 * SCALE, SCALE);
	const gnd1X = A1.ports.inp1.x - 35;
	const gnd1 = placeSymbol('ground_down', gnd1X - 0.01 * SCALE, A1.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);
	const B = A1.ports.out; // A1 output: band-pass (low-pass form) or the high-pass output

	// Rb's label ends 8px short of N2 and has to start clear of B's riser; a
	// long one moves Rb, and A2 after it, right
	const rbText = `Rb ${ohms(c.Rb)}`;
	const Rb = placeClear((dx) => placeSymbol('resistor_right', B.x + 90 + dx, B.y, SCALE), rbText, 8, B.x);
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
	// a tap on A1's output: the band-pass (low-pass form) or the output (high-pass and band-pass forms)
	const tap = { x: B.x + 30, y: B.y };
	const tapEnd = { x: tap.x, y: y0 + 44 };
	net.wire(tap, tapEnd);
	// right end: the stage output (low-pass form), the band-pass (high-pass
	// form) or the low-pass (band-pass form)
	const end = { x: L.x + (atA1 ? 40 : 90), y: L.y };
	net.wire(L, end);
	if (!atA1) net.wire(end, { x: end.x + 40, y: end.y });

	// Rd's label starts at Rd and has to end short of B's riser; a long one
	// ends a character short of it instead
	const rdText = `Rd ${ohms(c.Rd)}`;
	const rdX = Rd.ports['1'].x - clearance(Rd.ports['1'].x + textWidth(rdText) - B.x);
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
		label(inputText, N1.x - 10, y0 - 22, { anchor: 'end' }),
		label(rbText, N2.x - 8, B.y - 22, { anchor: 'end' }),
		label(`C1 ${formatFarads(c.C1)}`, C1.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(rdText, rdX, railY2 - 12, { anchor: 'start' }),
		label(`C2 ${formatFarads(c.C2)}`, C2.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(`Ra ${ohms(c.Ra)}`, N1.x - 12, (Ra.ports['1'].y + Ra.ports['2'].y) / 2 + 4, { anchor: 'end' }),
		label(`r ${ohms(c.r)}`, r1.ports['1'].x, r1.ports['1'].y - 12, { anchor: 'start' }),
		label(`r ${ohms(c.r)}`, r2.ports['1'].x, loopY + 24, { anchor: 'start' }),
		label('A1', A1.ports.out.x - 24, y0 + 24, { anchor: 'middle' }),
		label('A2', A2.ports.out.x - 24, B.y + 24, { anchor: 'middle' }),
		label('A3', A3.ports.out.x + 24, yA3 - 22, { anchor: 'middle' }),
		label(highPass ? 'Vout (HP)' : bandPass ? 'Vout (BP)' : 'V_bp', tapEnd.x + 6, tapEnd.y + 2, { anchor: 'start' }),
		label(highPass ? 'V_bp' : bandPass ? 'V_lp' : 'Vout (LP)', end.x + (atA1 ? 6 : 48), end.y + 5, { anchor: 'start' })
	];

	const width = Math.max(end.x + 40, r1.ports['2'].x + 30) + 70;
	const top = railY1 - 30;
	const height = loopY + 44 - top;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${height}` };
}

export function buildTowThomasDiagram(components, { ohms = formatOhms } = {}) {
	return towThomasCore(components, false, ohms);
}

export function buildTowThomasHpDiagram(components, { ohms = formatOhms } = {}) {
	return towThomasCore(components, true, ohms);
}

export function buildTowThomasBpDiagram(components, { ohms = formatOhms } = {}) {
	return towThomasCore(components, false, ohms, true);
}

/** Places a symbol so that its port `key` lands exactly on `p`. */
function atPort(name, key, p) {
	const off = placeSymbol(name, 0, 0, SCALE).ports[key];
	return placeSymbol(name, p.x - off.x, p.y - off.y, SCALE);
}

/**
 * Tow-Thomas notch (the feed-forward form, towThomas.js): the stage of an
 * elliptic or inverse Chebyshev filter. Drawn as one loop with nothing
 * crossing it: A1 on top (Cin in, C1 and Rd across it, output on the
 * right), Rb down the right side into A2's summing node, A2 and A3 along
 * the bottom facing left, Ra up the left side into A1's summing node, and
 * Rz along the very bottom from the input to A2's summing node.
 */
export function buildTowThomasNotchDiagram(components, { ohms = formatOhms } = {}) {
	const c = components;
	const y0 = 190;
	const Vin = { x: MARGIN, y: y0 };
	const J0 = { x: MARGIN + 40, y: y0 };
	// Cin's label ends 10px short of N1; a long one moves Cin, and the whole
	// loop after it, right
	const cinText = `Cin ${formatFarads(c.Cin)}`;
	const Cin = placeClear((dx) => atPort('capacitor_right', '1', { x: J0.x + 40 + dx, y: y0 }), cinText, 10, VIN_END);
	const N1 = Cin.ports['2'];
	const A1 = atPort('opamp_no_power_right', 'inp2', { x: N1.x + 90, y: y0 });
	const gnd1 = atPort('ground_down', '1', { x: A1.ports.inp1.x - 35, y: A1.ports.inp1.y + 40 });
	// A1's feedback closes right after its output; the output then runs on
	// far enough for the bottom row to fit under it
	const FB = { x: A1.ports.out.x + 24, y: A1.ports.out.y };
	const V1 = { x: N1.x + 430, y: FB.y };
	const railY1 = y0 - 120;
	const railY2 = y0 - 76;
	const C1 = placeSymbol('capacitor_right', (N1.x + FB.x) / 2, railY1, SCALE);
	const Rd = atPort('resistor_right', '1', { x: (N1.x + FB.x) / 2 - 22.56, y: railY2 });
	const out = { x: V1.x + 70, y: V1.y };

	// right side: Rb down from the output into A2's summing node
	const Rb = atPort('resistor_down', '1', { x: V1.x, y: V1.y + 40 });
	const yB = y0 + 170;
	const N2 = { x: V1.x, y: yB };
	// bottom row, facing left: A2 (integrator) then A3 (inverter)
	const N2a = { x: N2.x - 30, y: yB };
	const A2 = atPort('opamp_no_power_left', 'inp2', { x: N2.x - 60, y: yB });
	const gnd2 = atPort('ground_down', '1', { x: A2.ports.inp1.x + 16, y: A2.ports.inp1.y + 40 });
	const V2 = { x: A2.ports.out.x - 36, y: A2.ports.out.y };
	const loop2Y = yB - 64;
	const C2 = placeSymbol('capacitor_right', (N2a.x + V2.x) / 2, loop2Y, SCALE);
	const r1 = atPort('resistor_right', '2', { x: V2.x - 24, y: V2.y });
	const N3 = { x: r1.ports['1'].x - 24, y: V2.y };
	const N3a = { x: N3.x - 20, y: V2.y };
	const A3 = atPort('opamp_no_power_left', 'inp2', { x: N3.x - 44, y: V2.y });
	const gnd3 = atPort('ground_down', '1', { x: A3.ports.inp1.x + 16, y: A3.ports.inp1.y + 40 });
	const V3 = { x: A3.ports.out.x - 30, y: A3.ports.out.y };
	const loop3Y = V2.y - 64;
	const r2 = atPort('resistor_right', '1', { x: (N3a.x + V3.x) / 2 - 22.56, y: loop3Y });
	// left side: Ra up into N1
	const Ra = atPort('resistor_down', '1', { x: N1.x, y: y0 + 50 });
	const raFoot = { x: N1.x, y: V3.y };
	// the feed-forward lane along the bottom
	const laneY = yB + 90;
	const Rz = atPort('resistor_right', '1', { x: (J0.x + N2.x) / 2 - 22.56, y: laneY });

	const net = createNet();
	net.wire(Vin, J0);
	net.wire(J0, Cin.ports['1']);
	net.wire(N1, A1.ports.inp2);
	net.elbow(A1.ports.inp1, gnd1.ports['1'], 'h');
	net.wire(A1.ports.out, FB);
	net.wire(FB, V1);
	net.wire(V1, out);
	// A1 feedback: C1 on the top rail, Rd on the rail under it
	net.wire(N1, { x: N1.x, y: railY2 });
	net.wire({ x: N1.x, y: railY2 }, { x: N1.x, y: railY1 });
	net.wire({ x: N1.x, y: railY1 }, C1.ports['1']);
	net.wire({ x: N1.x, y: railY2 }, Rd.ports['1']);
	net.wire(C1.ports['2'], { x: FB.x, y: railY1 });
	net.wire(Rd.ports['2'], { x: FB.x, y: railY2 });
	net.wire({ x: FB.x, y: railY1 }, { x: FB.x, y: railY2 });
	net.wire({ x: FB.x, y: railY2 }, FB);
	// Rb down into N2
	net.wire(V1, Rb.ports['1']);
	net.wire(Rb.ports['2'], N2);
	// A2 with C2 over it
	net.wire(N2, N2a);
	net.wire(N2a, A2.ports.inp2);
	net.elbow(A2.ports.inp1, gnd2.ports['1'], 'h');
	net.wire(A2.ports.out, V2);
	net.wire(N2a, { x: N2a.x, y: loop2Y });
	net.wire({ x: N2a.x, y: loop2Y }, C2.ports['2']);
	net.wire(C2.ports['1'], { x: V2.x, y: loop2Y });
	net.wire({ x: V2.x, y: loop2Y }, V2);
	// A3 inverter with r2 over it
	net.wire(V2, r1.ports['2']);
	net.wire(r1.ports['1'], N3);
	net.wire(N3, N3a);
	net.wire(N3a, A3.ports.inp2);
	net.elbow(A3.ports.inp1, gnd3.ports['1'], 'h');
	net.wire(A3.ports.out, V3);
	net.wire(N3, { x: N3.x, y: loop3Y });
	net.wire({ x: N3.x, y: loop3Y }, r2.ports['2']);
	net.wire(r2.ports['1'], { x: V3.x, y: loop3Y });
	net.wire({ x: V3.x, y: loop3Y }, V3);
	// back to N1 through Ra
	net.wire(V3, raFoot);
	net.wire(raFoot, Ra.ports['2']);
	net.wire(Ra.ports['1'], N1);
	// Rz from the input, along the bottom, up into N2
	net.wire(J0, { x: J0.x, y: laneY });
	net.wire({ x: J0.x, y: laneY }, Rz.ports['1']);
	net.wire(Rz.ports['2'], { x: N2.x, y: laneY });
	net.wire({ x: N2.x, y: laneY }, N2);

	// Rd's label starts at Rd and has to end short of the riser at FB; a
	// long one ends a character short of it instead
	const rdText = `Rd ${ohms(c.Rd)}`;
	const rdX = Rd.ports['1'].x - clearance(Rd.ports['1'].x + textWidth(rdText) - FB.x);
	// Ra's label, beside it, is level with the label over r2; a long one
	// would run into that one, so it moves up just clear of it
	const raText = `Ra ${ohms(c.Ra)}`;
	const raX = N1.x + 12;
	const raMid = (Ra.ports['1'].y + Ra.ports['2'].y) / 2 + 4;
	const r2Y = loop3Y - 12;
	const raY = clearance(raX + textWidth(raText) - r2.ports['1'].x) > 0 ? Math.min(raMid, r2Y - LINE) : raMid;

	const parts = [
		Cin.svg,
		A1.svg,
		gnd1.svg,
		C1.svg,
		Rd.svg,
		Rb.svg,
		A2.svg,
		gnd2.svg,
		C2.svg,
		r1.svg,
		A3.svg,
		gnd3.svg,
		r2.svg,
		Ra.svg,
		Rz.svg,
		net.svg(),
		net.dots(portPoints(Cin, A1, gnd1, C1, Rd, Rb, A2, gnd2, C2, r1, A3, gnd3, r2, Ra, Rz)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label(cinText, N1.x - 10, y0 - 22, { anchor: 'end' }),
		label(`C1 ${formatFarads(c.C1)}`, C1.ports['1'].x, railY1 - 12, { anchor: 'start' }),
		label(rdText, rdX, railY2 - 12, { anchor: 'start' }),
		label(`Rb ${ohms(c.Rb)}`, V1.x + 12, (Rb.ports['1'].y + Rb.ports['2'].y) / 2 + 4, { anchor: 'start' }),
		label(`C2 ${formatFarads(c.C2)}`, C2.ports['1'].x - 10, loop2Y - 14, { anchor: 'start' }),
		label(`r ${ohms(c.r)}`, r1.ports['1'].x, V2.y + 22, { anchor: 'start' }),
		label(`r ${ohms(c.r)}`, r2.ports['1'].x, r2Y, { anchor: 'start' }),
		label(raText, raX, raY, { anchor: 'start' }),
		label(`Rz ${ohms(c.Rz)}`, Rz.ports['1'].x, laneY + 22, { anchor: 'start' }),
		label('A1', A1.ports.out.x - 24, y0 + 26, { anchor: 'middle' }),
		label('A2', A2.ports.out.x + 24, yB + 26, { anchor: 'middle' }),
		label('A3', A3.ports.out.x + 24, V2.y + 26, { anchor: 'middle' }),
		label('Vout', out.x + 6, out.y + 4, { anchor: 'start' })
	];

	const width = out.x + 60;
	const top = railY1 - 30;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${laneY + 36 - top}` };
}

/**
 * Unity-gain difference amplifier: used in place of the summing amplifier
 * when a band-stop's two branches arrive with opposite signs (one of them
 * has an odd number of inverting stages, the other an even number). V_hp
 * goes into the + input through R with R to ground, V_lp into the - input
 * through R with R as feedback, so Vout = V_hp - V_lp: with opposite signs
 * that is the sum of the two magnitudes, and the notch is preserved.
 */
export function buildDifferenceAmpDiagram(R, values = {}) {
	const v = { RCH: R, RCG: R, RCL: R, RCF: R, ...values };
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
		label(`R ${formatOhms(v.RCH)}`, Rh.ports['1'].x, yTop - 24, { anchor: 'start' }),
		label(`Rl ${formatOhms(v.RCL)}`, Rl.ports['1'].x, yBot - 24, { anchor: 'start' }),
		label(`Rg ${formatOhms(v.RCG)}`, P.x - 12, (Rg.ports['1'].y + Rg.ports['2'].y) / 2 + 4, { anchor: 'end' }),
		label(`Rf ${formatOhms(v.RCF)}`, Rf.ports['1'].x, railY + 24, { anchor: 'start' })
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
export function buildSummingAmpDiagram(R, values = {}) {
	const v = { RCA: R, RCB: R, RCF: R, ...values };
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
		label(`Ra ${formatOhms(v.RCA)}`, Ra.ports['1'].x, Ra.ports['1'].y - 24, { anchor: 'start' }),
		label(`Rb ${formatOhms(v.RCB)}`, Rb.ports['1'].x, Rb.ports['1'].y + 30, { anchor: 'start' }),
		label(`Rf ${formatOhms(v.RCF)}`, Rf.ports['1'].x, railY - 12, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	return { svg: parts.join(''), viewBox: `0 60 ${width} 280` };
}

/*
 * The gain stages of a filter designed by hand (handDesign.js), with R1
 * and R2 named as the method names them.
 */

/**
 * Inverting amplifier, H = -R2/R1: R1 from the input to the inverting
 * input X, R2 from X back to Vout over a rail above the triangle, the
 * non-inverting input grounded. The op-amp sits so its inverting input is
 * at X's height, as in the MFB low-pass.
 */
export function buildGainInvDiagram(components, { ohms = formatOhms } = {}) {
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	// R1's label ends 10px short of X; a long one moves R1 right
	const r1Text = `R1 ${ohms(components.R1)}`;
	const R1 = placeClear((dx) => placeSymbol('resistor_right', Vin.x + 90 + dx, y0, SCALE), r1Text, 10, VIN_END);
	const X = R1.ports['2'];

	const opamp = placeSymbol('opamp_no_power_right', X.x + 90, y0 - 0.09 * SCALE, SCALE);
	const gndPlusX = opamp.ports.inp1.x - 35;
	const gndPlus = placeSymbol('ground_down', gndPlusX - 0.01 * SCALE, opamp.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);

	// R2's label starts over its left pin; a long one pushes the output column right
	const r2Text = `R2 ${ohms(components.R2)}`;
	const half = placeSymbol('resistor_right', 0, 0, SCALE).ports['2'].x;
	const Vout = { x: Math.max(opamp.ports.out.x + 90, X.x + 2 * (textWidth(r2Text) + 8 - half)), y: opamp.ports.out.y };
	const railY = 130;
	const R2 = placeSymbol('resistor_right', (X.x + Vout.x) / 2, railY, SCALE);

	const net = createNet();
	net.wire(Vin, R1.ports['1']);
	net.wire(X, opamp.ports.inp2);
	net.elbow(opamp.ports.inp1, gndPlus.ports['1'], 'h');
	net.wire(X, { x: X.x, y: railY });
	net.wire({ x: X.x, y: railY }, R2.ports['1']);
	net.wire(R2.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });

	const parts = [
		R1.svg,
		opamp.svg,
		gndPlus.svg,
		R2.svg,
		net.svg(),
		net.dots(portPoints(R1, opamp, gndPlus, R2)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' }),
		label(r1Text, X.x - 10, y0 - 22, { anchor: 'end' }),
		label(r2Text, R2.ports['1'].x, railY - 12, { anchor: 'start' })
	];

	const width = Vout.x + 40 + 60;
	const top = railY - 40;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${gndPlus.ports['1'].y + 50 - top}` };
}

/**
 * Non-inverting amplifier, H = 1 + R2/R1: the input straight into the
 * non-inverting input, R1 from the inverting input to ground, R2 from it
 * back to Vout along a rail under the triangle.
 */
export function buildGainNonInvDiagram(components, { ohms = formatOhms } = {}) {
	const y0 = 160;
	const opamp = placeSymbol('opamp_no_power_right', MARGIN + 160, y0, SCALE);
	const Vin = { x: MARGIN, y: opamp.ports.inp1.y };
	const negNode = opamp.ports.inp2;

	const R1 = placeSymbol('resistor_down', negNode.x - 50, negNode.y + 80, SCALE);
	const gnd = placeSymbol('ground_down', R1.ports['2'].x - 0.01 * SCALE, R1.ports['2'].y + 0.29 * SCALE, SCALE);

	// R2 sits midway along the feedback rail with its label starting over
	// its left pin; a long label pushes the output column right
	const r2Text = `R2 ${ohms(components.R2)}`;
	const half = placeSymbol('resistor_right', 0, 0, SCALE).ports['2'].x;
	const Vout = { x: Math.max(opamp.ports.out.x + 80, negNode.x + 2 * (textWidth(r2Text) + 5 - half)), y: opamp.ports.out.y };
	const loopY = R1.ports['2'].y + 40;
	const R2 = placeSymbol('resistor_right', (negNode.x + Vout.x) / 2, loopY, SCALE);

	const net = createNet();
	net.wire(Vin, opamp.ports.inp1);
	// R1 up its own column then across into the - input node
	net.wire(R1.ports['1'], { x: R1.ports['1'].x, y: negNode.y });
	net.wire({ x: R1.ports['1'].x, y: negNode.y }, negNode);
	net.wire(R1.ports['2'], gnd.ports['1']);
	// R2: down from the - input node, along the rail, up to the output
	net.elbow(negNode, R2.ports['1'], 'v');
	net.wire(R2.ports['2'], { x: Vout.x, y: loopY });
	net.wire({ x: Vout.x, y: loopY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 30, y: Vout.y });

	const parts = [
		opamp.svg,
		R1.svg,
		gnd.svg,
		R2.svg,
		net.svg(),
		net.dots(portPoints(opamp, R1, gnd, R2)),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 34, Vout.y + 5, { anchor: 'start' }),
		label(r2Text, R2.ports['1'].x, loopY - 12, { anchor: 'start' }),
		label(`R1 ${ohms(components.R1)}`, R1.ports['1'].x - 12, (R1.ports['1'].y + R1.ports['2'].y) / 2, { anchor: 'end' })
	];

	const width = Vout.x + 30 + 60;
	// from just over the Vin label to just under R2's rail
	const top = Vin.y - 40;
	const height = loopY + 30 - top;
	// the R1 label reads left of its resistor, so the box starts left of the margin
	const left = Math.min(-16, Math.floor(R1.ports['1'].x - 12 - textWidth(`R1 ${ohms(components.R1)}`) - 8));
	return { svg: parts.join(''), viewBox: `${left} ${top} ${width - left} ${height}` };
}

/**
 * Divider and follower, H = R1/(R1 + R2) = 1/(1 + R2/R1): R2 in series,
 * R1 from the node to ground, then the unity-gain follower that keeps the
 * next stage from loading the divider.
 */
export function buildGainDividerDiagram(components, { ohms = formatOhms } = {}) {
	const y0 = 160;
	const Vin = { x: MARGIN, y: y0 };
	const r2Text = `R2 ${ohms(components.R2)}`;
	const R2 = placeSymbol('resistor_right', Vin.x + 90, y0, SCALE);
	const node = R2.ports['2'];
	const R1 = placeSymbol('resistor_down', node.x, node.y + HANG.resistor_down * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', R1.ports['2'].x - 0.01 * SCALE, R1.ports['2'].y + 0.29 * SCALE, SCALE);

	const net = createNet();
	const parts = [R2.svg, R1.svg, gnd.svg];
	const ports = portPoints(R2, R1, gnd);
	net.wire(Vin, R2.ports['1']);
	net.wire(R1.ports['2'], gnd.ports['1']);
	// R1's label, beside it, and R2's, over it, both end short of the
	// buffer and its note; a long one moves the buffer right
	const r1Text = `R1 ${ohms(components.R1)}`;
	const r1X = R1.ports['1'].x + 12;
	const noteStart = followerOpamp(node).ports.out.x - 24 - textWidth(BUFFER_NOTE) / 2;
	const dx = Math.max(clearance(r1X + textWidth(r1Text) - followerOpamp(node).ports.inp2.x), clearance(R2.ports['1'].x + textWidth(r2Text) - noteStart));
	const { opamp, Vout, loopY } = followerAfter(net, node, parts, ports, dx);

	parts.push(
		net.svg(),
		net.dots(ports),
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 36, Vout.y + 5, { anchor: 'start' }),
		label(r2Text, R2.ports['1'].x, R2.ports['1'].y - 24, { anchor: 'start' }),
		label(r1Text, r1X, (R1.ports['1'].y + R1.ports['2'].y) / 2, { anchor: 'start' }),
		label(BUFFER_NOTE, opamp.ports.out.x - 24, node.y - 26, { anchor: 'middle', cls: 'lbl note' })
	);

	const width = Vout.x + 30 + 60;
	// from just over the labels above the line to just under the ground and the follower's loop
	const top = y0 - 50;
	return { svg: parts.join(''), viewBox: `0 ${top} ${width} ${Math.max(loopY, gnd.ports['1'].y + 20) + 34 - top}` };
}

/*
 * The narrow band-pass stages (rlcBandPass.js, sallenKeyBandPass.js,
 * khnBandPass.js). An input divider's Rb, when the design has one, hangs
 * from a node right of the part already hung from the input node.
 */

/** A part hung from `node` so that its top pin lands on it, with its ground under it. */
function hangWithGround(name, node) {
	const part = placeSymbol(name, node.x, node.y + HANG[name] * SCALE, SCALE);
	const gnd = placeSymbol('ground_down', part.ports['2'].x - 0.01 * SCALE, part.ports['2'].y + 0.29 * SCALE, SCALE);
	return { part, gnd };
}

/** The label of a hung part, beside it on the right. */
function sideLabel(text, part) {
	return label(text, part.ports['1'].x + 12, (part.ports['1'].y + part.ports['2'].y) / 2 + 4, { anchor: 'start' });
}

/**
 * The RLC tank: Ra from Vin to P, C hung from P (and Rb from a node right
 * of it, past C's label). Returns the net, the parts and their ports, the
 * labels, the last node on the line and where the last label ends.
 */
function tankAt(c, y0, ohms) {
	const Vin = { x: MARGIN, y: y0 };
	const raText = `Ra ${ohms(c.Ra)}`;
	const Ra = placeClear((dx) => placeSymbol('resistor_right', Vin.x + 90 + dx, y0, SCALE), raText, 10, VIN_END);
	const P = Ra.ports['2'];
	const tank = hangWithGround('capacitor_down', P);
	const cText = `C ${formatFarads(c.C)}`;
	const net = createNet();
	net.wire(Vin, Ra.ports['1']);
	net.wire(tank.part.ports['2'], tank.gnd.ports['1']);
	const parts = [Ra.svg, tank.part.svg, tank.gnd.svg];
	const ports = portPoints(Ra, tank.part, tank.gnd);
	const labels = [label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }), label(raText, P.x - 10, y0 - 22, { anchor: 'end' }), sideLabel(cText, tank.part)];
	let last = P;
	let labelEnd = P.x + 12 + textWidth(cText);
	if (Number.isFinite(c.Rb) && c.Rb > 0) {
		const Pb = { x: labelEnd + 3 * CHAR_W, y: P.y };
		const rb = hangWithGround('resistor_down', Pb);
		const rbText = `Rb ${ohms(c.Rb)}`;
		net.wire(P, Pb);
		net.wire(rb.part.ports['2'], rb.gnd.ports['1']);
		parts.push(rb.part.svg, rb.gnd.svg);
		ports.push(...portPoints(rb.part, rb.gnd));
		labels.push(sideLabel(rbText, rb.part));
		last = Pb;
		labelEnd = Pb.x + 12 + textWidth(rbText);
	}
	return { net, parts, ports, labels, last, labelEnd };
}

/**
 * The output follower of an RLC stage on the main line, its + input at
 * column `x` (wired from `from`), or with `buffered` false the line run on
 * to that column alone (the gain stage after it is the buffer). Returns
 * the right end, the bottom and the labels.
 */
function rlcOutput(net, parts, ports, from, x, buffered) {
	const node = { x, y: from.y };
	net.wire(from, node);
	if (!buffered) {
		net.wire(node, { x: node.x + 40, y: node.y });
		return { right: node.x + 40, bottom: node.y, labels: [label('Vout', node.x + 46, node.y + 5, { anchor: 'start' })] };
	}
	const { opamp, Vout, loopY } = followerAfter(net, node, parts, ports);
	return {
		right: Vout.x + 30,
		bottom: loopY,
		labels: [label('Vout', Vout.x + 36, Vout.y + 5, { anchor: 'start' }), label(BUFFER_NOTE, opamp.ports.out.x - 24, node.y - 26, { anchor: 'middle', cls: 'lbl note' })]
	};
}

const GYRATOR_NOTE = 'gyrator: L = R1 R2 Cg';
const GIC_NOTE = 'GIC: L = R1 R3 R4 Cg / R2';

/**
 * RLC band-pass with a gyrator inductor (rlcGyrator): the tank on the main
 * line, and under it, from a tap, R1 on one row to the gyrator follower's
 * output O, Cg on the row below to its + input X with R2 hung from X; the
 * main line runs on past the gyrator to the output follower (none when
 * `buffered` is false).
 */
export function buildRlcGyratorDiagram(components, { ohms = formatOhms, buffered = true } = {}) {
	const c = components;
	const y0 = 160;
	const t = tankAt(c, y0, ohms);
	const { net, parts, ports } = t;
	const labels = [...t.labels];
	const T = { x: Math.max(t.last.x + 60, t.labelEnd + 2 * CHAR_W), y: t.last.y };
	net.wire(t.last, T);
	const row1 = { x: T.x, y: y0 + 110 };
	const row2 = { x: T.x, y: y0 + 200 };
	net.wire(T, row1);
	net.wire(row1, row2);
	// R1 on the first row, its label over it
	const r1Text = `R1 ${ohms(c.R1)}`;
	const R1 = placeSymbol('resistor_right', row1.x + 40 + 22.56, row1.y + 1.92, SCALE);
	net.wire(row1, R1.ports['1']);
	// Cg on the second row to X, R2 hung from X
	const cgText = `Cg ${formatFarads(c.Cg)}`;
	const Cg = placeSymbol('capacitor_right', row2.x + 40 + 14.4, row2.y, SCALE);
	net.wire(row2, Cg.ports['1']);
	const X = { x: Math.max(Cg.ports['2'].x + 30, Cg.ports['1'].x - 10 + textWidth(cgText) + CHAR_W), y: row2.y };
	net.wire(Cg.ports['2'], X);
	const r2 = hangWithGround('resistor_down', X);
	net.wire(r2.part.ports['2'], r2.gnd.ports['1']);
	const r2Text = `R2 ${ohms(c.R2)}`;
	// the gyrator's follower, right of R2's label
	const dx = clearance(X.x + 12 + textWidth(r2Text) - followerOpamp(X).ports.inp2.x);
	const g = followerOpamp(X, dx);
	const out = g.ports.out;
	const loopY = out.y + 60;
	net.wire(X, g.ports.inp1);
	net.wire(out, { x: out.x, y: loopY });
	net.wire({ x: out.x, y: loopY }, { x: g.ports.inp2.x, y: loopY });
	net.wire({ x: g.ports.inp2.x, y: loopY }, g.ports.inp2);
	const O = { x: Math.max(out.x + 40, R1.ports['1'].x + textWidth(r1Text) + CHAR_W), y: out.y };
	net.wire(out, O);
	net.wire(O, { x: O.x, y: R1.ports['2'].y });
	net.wire({ x: O.x, y: R1.ports['2'].y }, R1.ports['2']);
	parts.push(R1.svg, Cg.svg, r2.part.svg, r2.gnd.svg, g.svg);
	ports.push(...portPoints(R1, Cg, r2.part, r2.gnd, g));
	const noteY = Math.max(loopY, r2.gnd.ports['1'].y + 20) + 26;
	labels.push(
		label(r1Text, R1.ports['1'].x, R1.ports['1'].y - 12, { anchor: 'start' }),
		label(cgText, Cg.ports['1'].x - 10, row2.y - 14, { anchor: 'start' }),
		sideLabel(r2Text, r2.part),
		label(GYRATOR_NOTE, row2.x, noteY, { anchor: 'start', cls: 'lbl note' })
	);
	const right = Math.max(O.x, row2.x + textWidth(GYRATOR_NOTE)) + 50;
	const end = rlcOutput(net, parts, ports, T, right, buffered);
	parts.push(net.svg(), net.dots(ports), ...labels, ...end.labels);
	const top = y0 - 50;
	return { svg: parts.join(''), viewBox: `0 ${top} ${end.right + 60} ${noteY + 14 - top}` };
}

/**
 * RLC band-pass with Antoniou's GIC (rlcGic): the tank on the main line;
 * under it, from a tap, the converter's chain on one row (R1, A, R2, B,
 * R3, D, Cg, E, R4 hung to ground), op-amp 2 above the row facing left
 * (output to A, - from B, + from E), op-amp 1 under it facing right with
 * its - input on top (- from B, output to D, + from the tap along a lane
 * under the row); the main line runs on past it to the output follower
 * (none when `buffered` is false).
 */
export function buildRlcGicDiagram(components, { ohms = formatOhms, buffered = true } = {}) {
	const c = components;
	const y0 = 150;
	const t = tankAt(c, y0, ohms);
	const { net, parts, ports } = t;
	const labels = [...t.labels];
	const T = { x: Math.max(t.last.x + 60, t.labelEnd + 2 * CHAR_W), y: t.last.y };
	net.wire(t.last, T);
	const yr = y0 + 150;
	const row = { x: T.x, y: yr };
	net.wire(T, row);
	const texts = { R1: `R1 ${ohms(c.R1)}`, R2: `R2 ${ohms(c.R2)}`, R3: `R3 ${ohms(c.R3)}`, Cg: `Cg ${formatFarads(c.Cg)}`, R4: `R4 ${ohms(c.R4)}` };
	// the row's nodes spaced so each label, centred over (or under) its part, clears the columns either side
	const A = { x: row.x + Math.max(100, textWidth(texts.R1) + 24), y: yr };
	const B = { x: A.x + Math.max(100, textWidth(texts.R2) + 24), y: yr };
	const D = { x: B.x + Math.max(100, textWidth(texts.R3) + 24), y: yr };
	const E = { x: D.x + Math.max(90, textWidth(texts.Cg) + 24), y: yr };
	const between = (name, a, b) => placeSymbol(name, (a.x + b.x) / 2, yr + (name === 'resistor_right' ? 1.92 : 0), SCALE);
	const R1 = between('resistor_right', row, A);
	const R2 = between('resistor_right', A, B);
	const R3 = between('resistor_right', B, D);
	const Cg = between('capacitor_right', D, E);
	for (const [a, part, b] of [[row, R1, A], [A, R2, B], [B, R3, D], [D, Cg, E]]) {
		net.wire(a, part.ports['1']);
		net.wire(part.ports['2'], b);
	}
	const r4 = hangWithGround('resistor_down', E);
	net.wire(r4.part.ports['2'], r4.gnd.ports['1']);
	// op-amp 2 above the row facing left: output over A, inputs short of B
	const U2 = placeSymbol('opamp_no_power_left', A.x + 20 + 27.36, yr - 50, SCALE);
	net.wire(U2.ports.out, { x: A.x, y: U2.ports.out.y });
	net.wire({ x: A.x, y: U2.ports.out.y }, A);
	net.wire(B, { x: B.x, y: U2.ports.inp2.y });
	net.wire({ x: B.x, y: U2.ports.inp2.y }, U2.ports.inp2);
	net.wire(E, { x: E.x, y: U2.ports.inp1.y });
	net.wire({ x: E.x, y: U2.ports.inp1.y }, U2.ports.inp1);
	// op-amp 1 under the row facing right, its - input on top
	const U1 = placeSymbol('opamp_no_power_right', B.x + 30 + 27.36, yr + 50, SCALE, { flipY: true });
	net.wire(B, { x: B.x, y: U1.ports.inp2.y });
	net.wire({ x: B.x, y: U1.ports.inp2.y }, U1.ports.inp2);
	net.wire(U1.ports.out, { x: D.x, y: U1.ports.out.y });
	net.wire({ x: D.x, y: U1.ports.out.y }, D);
	net.wire(row, { x: row.x, y: U1.ports.inp1.y });
	net.wire({ x: row.x, y: U1.ports.inp1.y }, U1.ports.inp1);
	parts.push(R1.svg, R2.svg, R3.svg, Cg.svg, r4.part.svg, r4.gnd.svg, U2.svg, U1.svg);
	ports.push(...portPoints(R1, R2, R3, Cg, r4.part, r4.gnd, U2, U1));
	const mid = (part) => (part.ports['1'].x + part.ports['2'].x) / 2;
	const noteY = Math.max(U1.ports.inp1.y + 40, r4.gnd.ports['1'].y + 30);
	labels.push(
		label(texts.R1, mid(R1), yr + 20, { anchor: 'middle' }),
		label(texts.R2, mid(R2), yr - 14, { anchor: 'middle' }),
		label(texts.R3, mid(R3), yr - 14, { anchor: 'middle' }),
		label(texts.Cg, mid(Cg), yr - 14, { anchor: 'middle' }),
		sideLabel(texts.R4, r4.part),
		label('A2', U2.ports.out.x + 24, U2.ports.out.y - 16, { anchor: 'middle' }),
		label('A1', U1.ports.out.x - 24, U1.ports.out.y + 26, { anchor: 'middle' }),
		label(GIC_NOTE, row.x, noteY, { anchor: 'start', cls: 'lbl note' })
	);
	const right = Math.max(E.x + 12 + textWidth(texts.R4), row.x + textWidth(GIC_NOTE)) + 50;
	const end = rlcOutput(net, parts, ports, T, right, buffered);
	parts.push(net.svg(), net.dots(ports), ...labels, ...end.labels);
	const top = y0 - 50;
	return { svg: parts.join(''), viewBox: `0 ${top} ${end.right + 60} ${noteY + 14 - top}` };
}

/**
 * Sallen-Key band-pass (sallenKeyBp): Ra from Vin to X with C1 (and Rb)
 * hung from it, C2 on to the + input P with R2 hung from P, the op-amp a
 * non-inverting amplifier (Rg from its - input to ground, Rf to Vout on a
 * rail under it), and R3 over a rail above from X to Vout.
 */
export function buildSallenKeyBpDiagram(components, { ohms = formatOhms } = {}) {
	const c = components;
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const raText = `Ra ${ohms(c.Ra)}`;
	const Ra = placeClear((dx) => placeSymbol('resistor_right', Vin.x + 90 + dx, y0, SCALE), raText, 10, VIN_END);
	const X = Ra.ports['2'];
	const net = createNet();
	net.wire(Vin, Ra.ports['1']);
	const c1 = hangWithGround('capacitor_down', X);
	net.wire(c1.part.ports['2'], c1.gnd.ports['1']);
	const c1Text = `C1 ${formatFarads(c.C1)}`;
	const parts = [Ra.svg, c1.part.svg, c1.gnd.svg];
	const ports = portPoints(Ra, c1.part, c1.gnd);
	const labels = [label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }), label(raText, X.x - 10, y0 - 22, { anchor: 'end' }), sideLabel(c1Text, c1.part)];
	let at = X;
	let labelEnd = X.x + 12 + textWidth(c1Text);
	if (Number.isFinite(c.Rb) && c.Rb > 0) {
		const Xb = { x: labelEnd + 3 * CHAR_W, y: X.y };
		const rb = hangWithGround('resistor_down', Xb);
		const rbText = `Rb ${ohms(c.Rb)}`;
		net.wire(X, Xb);
		net.wire(rb.part.ports['2'], rb.gnd.ports['1']);
		parts.push(rb.part.svg, rb.gnd.svg);
		ports.push(...portPoints(rb.part, rb.gnd));
		labels.push(sideLabel(rbText, rb.part));
		at = Xb;
		labelEnd = Xb.x + 12 + textWidth(rbText);
	}
	// C2 on to P, its label over it, clear of the label before it
	const c2Text = `C2 ${formatFarads(c.C2)}`;
	const C2 = placeSymbol('capacitor_right', Math.max(at.x + 60, labelEnd + 2 * CHAR_W + 14.4), X.y, SCALE);
	net.wire(at, C2.ports['1']);
	const P = { x: Math.max(C2.ports['2'].x + 30, C2.ports['1'].x + textWidth(c2Text) + CHAR_W), y: X.y };
	net.wire(C2.ports['2'], P);
	const r2 = hangWithGround('resistor_down', P);
	net.wire(r2.part.ports['2'], r2.gnd.ports['1']);
	const r2Text = `R2 ${ohms(c.R2)}`;
	// the op-amp, + input on P's level, far enough right that Rg and its label (left of it) clear R2's
	const rgText = `Rg ${ohms(c.Rg)}`;
	const rgX = Math.max(P.x + 12 + textWidth(r2Text) + 2 * CHAR_W, P.x + 12 + textWidth(rgText) + 24);
	const opamp = placeSymbol('opamp_no_power_right', rgX + 50 + 27.36, P.y + 0.18 * SCALE, SCALE);
	net.wire(P, opamp.ports.inp1);
	const negNode = opamp.ports.inp2;
	const Rg = placeSymbol('resistor_down', negNode.x - 50, negNode.y + 80, SCALE);
	const gndRg = placeSymbol('ground_down', Rg.ports['2'].x - 0.01 * SCALE, Rg.ports['2'].y + 0.29 * SCALE, SCALE);
	net.wire(Rg.ports['1'], { x: Rg.ports['1'].x, y: negNode.y });
	net.wire({ x: Rg.ports['1'].x, y: negNode.y }, negNode);
	net.wire(Rg.ports['2'], gndRg.ports['1']);
	const rfText = `Rf ${ohms(c.Rf)}`;
	const r3Text = `R3 ${ohms(c.R3)}`;
	const half = placeSymbol('resistor_right', 0, 0, SCALE).ports['2'].x;
	const Vout = { x: Math.max(opamp.ports.out.x + 80, negNode.x + 2 * (textWidth(rfText) + 5 - half)), y: opamp.ports.out.y };
	const loopY = Rg.ports['2'].y + 40;
	const Rf = placeSymbol('resistor_right', (negNode.x + Vout.x) / 2, loopY, SCALE);
	net.elbow(negNode, Rf.ports['1'], 'v');
	net.wire(Rf.ports['2'], { x: Vout.x, y: loopY });
	net.wire({ x: Vout.x, y: loopY }, Vout);
	net.wire(opamp.ports.out, Vout);
	net.wire(Vout, { x: Vout.x + 40, y: Vout.y });
	// R3 over the top from X to Vout
	const railY = y0 - 110;
	const R3 = placeSymbol('resistor_right', (X.x + Vout.x) / 2, railY, SCALE);
	net.wire(X, { x: X.x, y: railY });
	net.wire({ x: X.x, y: railY }, R3.ports['1']);
	net.wire(R3.ports['2'], { x: Vout.x, y: railY });
	net.wire({ x: Vout.x, y: railY }, Vout);
	parts.push(C2.svg, r2.part.svg, r2.gnd.svg, opamp.svg, Rg.svg, gndRg.svg, Rf.svg, R3.svg);
	ports.push(...portPoints(C2, r2.part, r2.gnd, opamp, Rg, gndRg, Rf, R3));
	labels.push(
		label(c2Text, C2.ports['1'].x, y0 - 24, { anchor: 'start' }),
		sideLabel(r2Text, r2.part),
		label(rgText, Rg.ports['1'].x - 12, (Rg.ports['1'].y + Rg.ports['2'].y) / 2, { anchor: 'end' }),
		label(rfText, Rf.ports['1'].x, loopY - 12, { anchor: 'start' }),
		label(r3Text, R3.ports['1'].x, railY - 12, { anchor: 'start' }),
		label('Vout', Vout.x + 48, Vout.y + 5, { anchor: 'start' })
	);
	parts.push(net.svg(), net.dots(ports), ...labels);
	const top = railY - 32;
	return { svg: parts.join(''), viewBox: `0 ${top} ${Vout.x + 100} ${loopY + 30 - top}` };
}

/**
 * State-variable band-pass (khnBp). Main row: R3 from Vin into the
 * summer A3's - input M (A3 drawn with its - input on top, R7 over it
 * from M to its output H), R1 from H into the integrator A1 (C1 over it),
 * whose output is the band-pass, Vout; R2 from Vout into the integrator
 * A2 (C2 over it), whose output L returns along the bottom and up through
 * R4 into M. A3's + input P has R6 hung from it to ground, and R5 hangs
 * from a node left of P down to a lane under the row and on up to Vout.
 */
export function buildKhnBpDiagram(components, { ohms = formatOhms } = {}) {
	const c = components;
	const y0 = 220;
	const Vin = { x: MARGIN, y: y0 };
	const r3Text = `R3 ${ohms(c.R3)}`;
	const R3 = placeClear((dx) => placeSymbol('resistor_right', Vin.x + 90 + dx, y0, SCALE), r3Text, 10, VIN_END);
	const M = R3.ports['2'];
	const net = createNet();
	net.wire(Vin, R3.ports['1']);
	// A3 with its - input on top, at M's level; P left of its + input, P5 further left
	const r4Text = `R4 ${ohms(c.R4)}`;
	const r5Text = `R5 ${ohms(c.R5)}`;
	const r6Text = `R6 ${ohms(c.R6)}`;
	const p5 = M.x + 30;
	const pX = p5 + 12 + textWidth(r5Text) + 2 * CHAR_W;
	const A3 = placeSymbol('opamp_no_power_right', pX + 30 + 27.36, M.y + 0.09 * SCALE, SCALE, { flipY: true });
	net.wire(M, A3.ports.inp2);
	const P = { x: pX, y: A3.ports.inp1.y };
	const P5 = { x: p5, y: P.y };
	net.wire(A3.ports.inp1, P);
	net.wire(P, P5);
	const r6 = hangWithGround('resistor_down', P);
	net.wire(r6.part.ports['2'], r6.gnd.ports['1']);
	const R5 = placeSymbol('resistor_down', P5.x, P5.y + HANG.resistor_down * SCALE, SCALE);
	// R4 hung from M, down to the return lane
	const R4 = placeSymbol('resistor_down', M.x, M.y + HANG.resistor_down * SCALE, SCALE);
	const H = { x: A3.ports.out.x + 30, y: A3.ports.out.y };
	net.wire(A3.ports.out, H);
	// A1, the integrator from H, as in the Tow-Thomas drawing
	const r1Text = `R1 ${ohms(c.R1)}`;
	const R1 = placeClear((dx) => placeSymbol('resistor_right', H.x + 90 + dx, H.y, SCALE), r1Text, 8, Math.max(H.x, P.x + 12 + textWidth(r6Text)));
	net.wire(H, R1.ports['1']);
	const N1 = R1.ports['2'];
	const A1 = placeSymbol('opamp_no_power_right', N1.x + 110, N1.y - 0.09 * SCALE, SCALE);
	const gnd1 = placeSymbol('ground_down', A1.ports.inp1.x - 35 - 0.01 * SCALE, A1.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);
	net.wire(N1, A1.ports.inp2);
	net.elbow(A1.ports.inp1, gnd1.ports['1'], 'h');
	const BP = { x: A1.ports.out.x + 30, y: A1.ports.out.y };
	net.wire(A1.ports.out, BP);
	// A2, the integrator from the band-pass
	const r2Text = `R2 ${ohms(c.R2)}`;
	const R2 = placeClear((dx) => placeSymbol('resistor_right', BP.x + 90 + dx, BP.y, SCALE), r2Text, 8, BP.x + 40 + textWidth('Vout (BP)'));
	net.wire(BP, R2.ports['1']);
	const N2 = R2.ports['2'];
	const A2 = placeSymbol('opamp_no_power_right', N2.x + 110, N2.y - 0.09 * SCALE, SCALE);
	const gnd2 = placeSymbol('ground_down', A2.ports.inp1.x - 35 - 0.01 * SCALE, A2.ports.inp1.y + 40 + 0.29 * SCALE, SCALE);
	net.wire(N2, A2.ports.inp2);
	net.elbow(A2.ports.inp1, gnd2.ports['1'], 'h');
	const L = { x: A2.ports.out.x + 30, y: A2.ports.out.y };
	net.wire(A2.ports.out, L);
	// the feedback rails over the three op-amps
	const railY = y0 - 80;
	const R7 = placeSymbol('resistor_right', (M.x + H.x) / 2, railY, SCALE);
	const C1 = placeSymbol('capacitor_right', (N1.x + BP.x) / 2, railY, SCALE);
	const C2 = placeSymbol('capacitor_right', (N2.x + L.x) / 2, railY, SCALE);
	for (const [a, part, b] of [[M, R7, H], [N1, C1, BP], [N2, C2, L]]) {
		net.wire(a, { x: a.x, y: railY });
		net.wire({ x: a.x, y: railY }, part.ports['1']);
		net.wire(part.ports['2'], { x: b.x, y: railY });
		net.wire({ x: b.x, y: railY }, b);
	}
	// the R5 lane from under R5 to Vout, and the return from L up through R4
	const laneY = y0 + 110;
	const bottomY = laneY + 50;
	net.wire(R5.ports['2'], { x: P5.x, y: laneY });
	net.wire({ x: P5.x, y: laneY }, { x: BP.x, y: laneY });
	net.wire({ x: BP.x, y: laneY }, BP);
	net.wire(L, { x: L.x, y: bottomY });
	net.wire({ x: L.x, y: bottomY }, { x: M.x, y: bottomY });
	net.wire({ x: M.x, y: bottomY }, R4.ports['2']);
	// the output: a tap on the band-pass line
	const tap = { x: BP.x + 30, y: BP.y };
	const tapEnd = { x: tap.x, y: BP.y + 44 };
	net.wire(tap, tapEnd);
	const parts = [R3.svg, A3.svg, r6.part.svg, r6.gnd.svg, R5.svg, R4.svg, R1.svg, A1.svg, gnd1.svg, R2.svg, A2.svg, gnd2.svg, R7.svg, C1.svg, C2.svg];
	const ports = portPoints(R3, A3, r6.part, r6.gnd, R5, R4, R1, A1, gnd1, R2, A2, gnd2, R7, C1, C2);
	const labels = [
		label('Vin', Vin.x, Vin.y - 12, { anchor: 'start' }),
		label(r3Text, M.x - 10, y0 - 22, { anchor: 'end' }),
		label(r4Text, M.x - 12, (R4.ports['1'].y + R4.ports['2'].y) / 2 + 4, { anchor: 'end' }),
		label(r5Text, P5.x + 12, (R5.ports['1'].y + R5.ports['2'].y) / 2 + 4, { anchor: 'start' }),
		sideLabel(r6Text, r6.part),
		label(`R7 ${ohms(c.R7)}`, R7.ports['1'].x, railY - 12, { anchor: 'start' }),
		label(r1Text, N1.x - 8, H.y - 22, { anchor: 'end' }),
		label(`C1 ${formatFarads(c.C1)}`, C1.ports['1'].x, railY - 12, { anchor: 'start' }),
		label(r2Text, N2.x - 8, BP.y - 22, { anchor: 'end' }),
		label(`C2 ${formatFarads(c.C2)}`, C2.ports['1'].x, railY - 12, { anchor: 'start' }),
		label('A3', A3.ports.out.x - 24, A3.ports.out.y - 22, { anchor: 'middle' }),
		label('A1', A1.ports.out.x - 24, y0 + 30, { anchor: 'middle' }),
		label('A2', A2.ports.out.x - 24, y0 + 30, { anchor: 'middle' }),
		label('Vout (BP)', tapEnd.x + 6, tapEnd.y + 2, { anchor: 'start' }),
		label('Vlp (LP)', L.x + 6, L.y - 8, { anchor: 'start' })
	];
	parts.push(net.svg(), net.dots(ports), ...labels);
	const top = railY - 30;
	return { svg: parts.join(''), viewBox: `0 ${top} ${L.x + 60} ${bottomY + 24 - top}` };
}
