import { createSheet, groundInput, hang, run, series } from '../spice/draw';
import { buildElements } from './spice';

/**
 * The oscillators drawn as LTspice schematics, laid out the way a
 * textbook draws them: signal left to right, every op-amp pointing
 * right with its inverting input on top, negative feedback over the
 * top, the frequency network along the bottom, grounds hanging down.
 * Parts are joined by wires, never pin to pin, and every label is
 * horizontal (draw.js writes the windows LTspice's editor would), so the
 * sheet reads cleanly once opened; the check scripts audit it for
 * overlaps and read it back against the netlist.
 *
 * Only the nets a directive or a value refers to carry a name: vout (or
 * vsin and vcos), nlast, wp (which the AM sheet's .ic uses on its
 * carrier oscillator), and nm and theta for the lamp's model.
 */

const byName = (elements) => Object.fromEntries(elements.filter((e) => e.kind !== 'LABEL').map((e) => [e.name, e]));

const GAP = 48;

/**
 * Diodes back to back across a resistor on a horizontal rail, drawn as
 * three parallel branches between two columns: the resistor on the rail,
 * the diodes on rungs above it. `right` is the node the current comes
 * from, `resistor` runs right to left. Returns the left column's foot.
 */
function limiterGroup(sheet, { resistor, dLeft, dRight }, right) {
	const y = right.y;
	const xR = right.x;
	const xL = xR - 176;
	const r = sheet.placeFrom(resistor, { x: xR - 48, y }, 'left');
	sheet.wire(right, r.pins[0]);
	sheet.wire(r.pins[1], { x: xL, y });
	// dLeft conducts right to left, dRight left to right
	const y1 = y - 112;
	const y2 = y - 224;
	const d1 = sheet.placeFrom(dLeft, { x: xR - 56 + 8, y: y1 }, 'left');
	sheet.wire({ x: xR, y: y1 }, d1.pins[0]);
	sheet.wire(d1.pins[1], { x: xL, y: y1 });
	const d2 = sheet.placeFrom(dRight, { x: xL + 64, y: y2 }, 'right');
	sheet.wire({ x: xL, y: y2 }, d2.pins[0]);
	sheet.wire(d2.pins[1], { x: xR, y: y2 });
	sheet.route(right, { x: xR, y: y1 }, { x: xR, y: y2 });
	sheet.route({ x: xL, y }, { x: xL, y: y1 }, { x: xL, y: y2 });
	return { x: xL, y };
}

/* --------------------------------------------------------------- Wien */

function drawWien(sheet, design, E) {
	const { limiter } = design;
	const O = { x: 720, y: 512 };
	const U1 = sheet.placeOpamp(E.U1, O);
	const inp = U1.pins[0];
	const inm = U1.pins[1];
	// the output: A feeds the negative feedback, B the Wien network
	const A = { x: 784, y: O.y };
	const B = { x: 880, y: O.y };
	// split at A + 64, where the JFET's detector diode comes down
	sheet.route(O, A, { x: A.x + 64, y: O.y }, B);
	sheet.label(B, 'vout', 'right');

	// ---- negative feedback over the top, from A back to the - input
	const FB = 336;
	sheet.wire(A, { x: A.x, y: FB });
	let left;
	if (limiter.kind === 'diodes') {
		const fm = series(sheet, E.RF1, { x: A.x, y: FB }, 'left');
		const xR = run(sheet, fm, 'left', 32);
		left = limiterGroup(sheet, { resistor: E.RF2, dLeft: E.D1, dRight: E.D2 }, xR);
	} else {
		const end = series(sheet, E.RF, { x: A.x, y: FB }, 'left', { gap: 96 });
		left = run(sheet, end, 'left', 208);
	}
	const N = { x: left.x, y: inm.y };
	sheet.route(left, N, inm);

	// ---- the Wien network along the bottom, back into the + input
	const NET = inp.y + 144;
	const WP = { x: 592, y: NET };
	const Bdown = { x: B.x, y: NET };
	sheet.wire(B, Bdown);
	const ws = series(sheet, E.RS, Bdown, 'left');
	const wpEnd = series(sheet, E.CS, ws, 'left');
	sheet.wire(wpEnd, WP);
	const tap = { x: WP.x, y: NET - 64 };
	sheet.route(inp, { x: WP.x, y: inp.y }, tap, WP);
	sheet.label(tap, 'wp', 'left');
	const R2 = NET + 96;
	const rpTop = { x: WP.x + 64, y: R2 };
	const cpTop = { x: WP.x + 192, y: R2 };
	sheet.route(WP, { x: WP.x, y: R2 }, rpTop, cpTop);
	sheet.ground(sheet.placeFrom(E.RP, rpTop, 'down').pins[1]);
	sheet.ground(sheet.placeFrom(E.CP, cpTop, 'down').pins[1]);

	// ---- the lower leg at N: what holds the amplitude
	if (limiter.kind === 'diodes') {
		sheet.ground(sheet.placeFrom(E.RG, N, 'down').pins[1]);
	} else if (limiter.kind === 'lamp') {
		// the lamp's model reads V(nm) and V(theta), so both nets are named
		sheet.ground(sheet.placeFrom(E.RLAMP, N, 'down', { labels: 'left' }).pins[1]);
		sheet.label(left, 'nm', 'left');
		// the thermal network on its own along the bottom: BTH pours the
		// lamp's power into CTH and RTH, V(theta) is the filament's heat
		// (each part stands clear of the labels on its left neighbour's right,
		// whose values change with the design)
		const T = R2 + 224;
		const snap = (v) => Math.ceil(v / 16) * 16;
		const rth = { x: 160, y: T };
		const cth = { x: snap(rth.x + 20 + sheet.labelWidth(E.RTH) + 32), y: T };
		const bth = { x: snap(cth.x + 8 + sheet.labelWidth(E.CTH) + 48), y: T };
		sheet.route(rth, cth, bth);
		sheet.label(rth, 'theta', 'left');
		sheet.ground(hang(sheet, E.RTH, rth).pins[1]);
		sheet.ground(hang(sheet, E.CTH, cth).pins[1]);
		// BTH is [0, theta]: its + pin (ground) at the bottom, theta on top
		const b = sheet.placeFrom(E.BTH, { x: bth.x, y: bth.y + 80 }, 'up');
		sheet.ground(b.pins[0]);
	} else {
		// the JFET AGC: the channel in series with RSER as the lower leg,
		// its gate the average of the drain and the detector's divider
		const jd = sheet.placeFrom(E.RSER, N, 'down').pins[1];
		const j = sheet.place(E.J1, jd.x - 48, jd.y + 48, 'R0'); // D (jd.x, jd.y+48), G (jd.x-48, jd.y+112), S (jd.x, jd.y+144)
		sheet.wire(jd, j.pins[0]);
		sheet.ground(j.pins[2]);
		const gate = j.pins[1];
		const jg = run(sheet, gate, 'left', 96);
		// RX1 from the gate node up to the drain node's level, then across
		const rx1 = sheet.placeFrom(E.RX1, run(sheet, jg, 'up', 32), 'up');
		sheet.wire(rx1.pins[1], jd);
		// RX2 left to the divider node VD
		const vdiv = series(sheet, E.RX2, jg, 'left');
		const VD = run(sheet, vdiv, 'left', 48);
		sheet.ground(sheet.placeFrom(E.RB, VD, 'down').pins[1]);
		// RA from the peak node down to VD
		const pk = { x: VD.x, y: VD.y - 128 };
		sheet.wire(sheet.placeFrom(E.RA, pk, 'down').pins[1], VD);
		// CDET on the left of the peak node, D1 up from it to vout
		const cdetRail = run(sheet, pk, 'left', 112);
		sheet.ground(hang(sheet, E.CDET, cdetRail, { labels: 'left' }).pins[1]);
		const cathode = sheet.placeFrom(E.D1, run(sheet, pk, 'up', 48), 'up').pins[1];
		const over = FB - 128;
		sheet.route(cathode, { x: cathode.x, y: over }, { x: A.x + 64, y: over }, { x: A.x + 64, y: A.y });
	}
}

/* ------------------------------------------------------------ ladders */

function drawLadder(sheet, design, E) {
	const n = design.topo.ladder.sections;
	const buffered = design.topo.ladder.buffered;
	const RAIL = 512;
	const S = { x: 128, y: RAIL };
	let p = S;
	for (let k = 1; k <= n; k++) {
		const node = run(sheet, series(sheet, E[`C${k}`], p, 'right'), 'right', GAP);
		if (k === n) {
			p = node;
			break;
		}
		sheet.ground(sheet.placeFrom(E[`R${k}`], node, 'down').pins[1]);
		if (!buffered) {
			p = node;
			continue;
		}
		// the follower: + input on the rail, output looped to the - input
		const inPlus = run(sheet, node, 'right', 48);
		const buf = sheet.placeOpamp(E[`UB${k}`], { x: inPlus.x + 64, y: inPlus.y - 16 }, { labels: 'below' });
		const out = buf.pins[2];
		const J = run(sheet, out, 'right', 32);
		const top = J.y - 96;
		sheet.route(buf.pins[1], { x: buf.pins[1].x - 32, y: buf.pins[1].y }, { x: buf.pins[1].x - 32, y: top }, { x: J.x, y: top }, J);
		p = run(sheet, J, 'down', 16);
	}
	// nlast: the cleanest tap, named on a short branch above the rail
	const nlast = p;
	const probe = run(sheet, nlast, 'up', 64);
	sheet.label(probe, 'nlast', 'right');
	const rgEnd = series(sheet, E.RG, nlast, 'right');
	const N = run(sheet, rgEnd, 'right', 32);
	const inMinus = run(sheet, N, 'right', 48);
	const U1 = sheet.placeOpamp(E.U1, { x: inMinus.x + 64, y: inMinus.y + 16 });
	groundInput(sheet, U1.pins[0]);
	const O = U1.pins[2];
	// 112 to the tap puts the limiter group's left column right over N
	const T1 = run(sheet, O, 'right', 112);
	const V = run(sheet, T1, 'right', 64);
	sheet.label(V, 'vout', 'right');

	// the feedback: RF1 up from the output tap, then RF2 and the diodes
	// back across to the - input column
	const FB = RAIL - 176;
	const rf1Foot = run(sheet, T1, 'up', 32);
	const fm = sheet.placeFrom(E.RF1, rf1Foot, 'up').pins[1];
	const xR = { x: T1.x, y: FB };
	sheet.wire(fm, xR);
	const groupRight = run(sheet, xR, 'left', 48);
	const left = limiterGroup(sheet, { resistor: E.RF2, dLeft: E.D1, dRight: E.D2 }, groupRight);
	// the - input column: from the group down to N
	sheet.route(left, { x: left.x, y: N.y - 0 }, N);

	// the loop closes under the row, back to the start
	const below = RAIL + 256;
	sheet.route(V, { x: V.x, y: below }, { x: S.x, y: below }, S);
}

/* --------------------------------------------------------- quadrature */

/**
 * Two integrators and the inverter in one row, left to right, the
 * inverter's output coming back along the bottom to the vinv column.
 * RN runs over the top from vinv into the n2 column; the clamp's divider
 * rises from vcos to zt, and the two diodes span zt and n2 on rungs above
 * the second integrator.
 */
function drawQuadrature(sheet, design, E) {
	const RAIL = 512;
	const VINV = { x: 128, y: RAIL };
	// integrator 1
	const n1 = run(sheet, series(sheet, E.R1, VINV, 'right'), 'right', GAP);
	const in1 = run(sheet, n1, 'right', 48);
	const U1 = sheet.placeOpamp(E.U1, { x: in1.x + 64, y: in1.y + 16 });
	groundInput(sheet, U1.pins[0]);
	const c1Left = run(sheet, n1, 'up', 112);
	const c1End = series(sheet, E.C1, c1Left, 'right');
	const VS = { x: U1.pins[2].x + 64, y: U1.pins[2].y };
	sheet.wire(U1.pins[2], VS);
	sheet.route(c1End, { x: VS.x, y: c1End.y }, VS);
	sheet.label(run(sheet, VS, 'down', 64), 'vsin', 'right');

	// integrator 2
	const n2 = run(sheet, series(sheet, E.R2, VS, 'right'), 'right', GAP);
	const in2 = run(sheet, n2, 'right', 48);
	const U2 = sheet.placeOpamp(E.U2, { x: in2.x + 64, y: in2.y + 16 });
	groundInput(sheet, U2.pins[0]);
	const c2Left = run(sheet, n2, 'up', 112);
	const c2End = series(sheet, E.C2, c2Left, 'right');
	const VC = { x: U2.pins[2].x + 64, y: U2.pins[2].y };
	sheet.wire(U2.pins[2], VC);
	sheet.route(c2End, { x: VC.x, y: c2End.y }, VC);
	const VC2 = run(sheet, VC, 'right', 176);
	sheet.label(run(sheet, VC2, 'down', 64), 'vcos', 'right');

	// the clamp: RD1 up from vcos to zt, RD2 from zt to ground on the right
	const zt = sheet.placeFrom(E.RD1, run(sheet, VC2, 'up', 48), 'up').pins[1];
	const y1 = c2Left.y - 112;
	const y2 = y1 - 112;
	const ztRd2 = { x: zt.x, y: zt.y - 48 };
	sheet.route(zt, ztRd2, { x: zt.x, y: y1 }, { x: zt.x, y: y2 });
	sheet.ground(hang(sheet, E.RD2, run(sheet, ztRd2, 'left', 80), { stub: 16 }).pins[1]);
	// the diodes on two rungs between the n2 column and the zt column
	const mid = (n2.x + zt.x) / 2;
	const d1 = sheet.placeFrom(E.D1, { x: Math.round((mid + 32) / 16) * 16, y: y1 }, 'left'); // zt -> n2
	sheet.wire({ x: zt.x, y: y1 }, d1.pins[0]);
	sheet.wire(d1.pins[1], { x: n2.x, y: y1 });
	const d2 = sheet.placeFrom(E.D2, { x: Math.round((mid - 32) / 16) * 16, y: y2 }, 'right'); // n2 -> zt
	sheet.wire({ x: n2.x, y: y2 }, d2.pins[0]);
	sheet.wire(d2.pins[1], { x: zt.x, y: y2 });

	// RN over the top, from the vinv column into the top of the n2 column
	const rnY = y2 - 112;
	sheet.route(c2Left, { x: n2.x, y: y1 }, { x: n2.x, y: y2 }, { x: n2.x, y: rnY });
	const rnStart = { x: Math.round((VINV.x + n2.x) / 32) * 16 - 32, y: rnY };
	const vinvTop = { x: VINV.x, y: rnY };
	sheet.wire(vinvTop, rnStart);
	sheet.wire(sheet.placeFrom(E.RN, rnStart, 'right').pins[1], { x: n2.x, y: rnY });

	// the inverter: RA from vcos, RB over the top of U3
	const n3 = run(sheet, series(sheet, E.RA, VC2, 'right'), 'right', GAP);
	const in3 = run(sheet, n3, 'right', 48);
	const U3 = sheet.placeOpamp(E.U3, { x: in3.x + 64, y: in3.y + 16 });
	groundInput(sheet, U3.pins[0]);
	const rbLeft = run(sheet, n3, 'up', 112);
	const rbEnd = series(sheet, E.RB, rbLeft, 'right');
	const VI = { x: U3.pins[2].x + 64, y: U3.pins[2].y };
	sheet.wire(U3.pins[2], VI);
	sheet.route(rbEnd, { x: VI.x, y: rbEnd.y }, VI);

	// back to the start along the bottom, and up the vinv column
	const below = RAIL + 256;
	sheet.route(VI, { x: VI.x, y: below }, { x: VINV.x, y: below }, VINV, vinvTop);
}

/**
 * Draws a design into an existing sheet, from an element table (name to
 * element) that may carry another circuit's naming. This is how the AM
 * modulator's sheet gets its carrier oscillator: the same layout, shifted
 * and with its nets renamed by the sheet's block().
 */
export function drawOscillatorInto(sheet, design, E) {
	if (design.topology === 'wien') drawWien(sheet, design, E);
	else if (design.topology === 'quadrature') drawQuadrature(sheet, design, E);
	else drawLadder(sheet, design, E);
}

/** The drawn schematic of a design, with a short note and the directives under it. */
export function drawOscillator(design, { comments = [], directives = [], gbw = '3Meg' }) {
	const elements = buildElements(design);
	const E = byName(elements);
	const sheet = createSheet({ gbw });
	drawOscillatorInto(sheet, design, E);
	sheet.notes({ comments, directives });
	return sheet.render();
}
