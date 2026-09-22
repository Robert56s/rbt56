import { createSheet } from '../spice/draw';
import { buildElements } from './spice';

/**
 * The oscillators drawn as LTspice schematics, in the same arrangement
 * as the page draws them: the amplifier on the right, the network along
 * the bottom coming back into its input, the negative feedback along the
 * top, and the amplitude control where it acts. Every part comes from
 * buildElements, so the drawing and the netlist cannot disagree about
 * values or connections; the check script reads the drawing back and
 * compares.
 *
 * Coordinates are LTspice units on its 16 grid. Rules that keep LTspice
 * happy: a wire connects only where its end lands on a pin or on another
 * wire's end, so a junction in the middle of a run is always drawn as
 * two wires meeting there; nothing sits closer than 16 units to a part
 * it does not connect to.
 */

const byName = (elements) => Object.fromEntries(elements.filter((e) => e.kind !== 'LABEL').map((e) => [e.name, e]));

/** Grounds an op-amp's + input by stepping left first, so the stub does not run down the symbol's edge. */
function groundInput(sheet, pin, dx = -32) {
	const corner = { x: pin.x + dx, y: pin.y };
	sheet.wire(pin, corner);
	sheet.ground(corner);
}

/* --------------------------------------------------------------- Wien */

function drawWien(sheet, design, E) {
	const { limiter } = design;
	const out = { x: 512, y: 256 };
	const vout = { x: 608, y: 256 };
	const U1 = sheet.placeOpamp(E.U1, out); // in- (448,240), in+ (448,272)
	const minus = U1.pins[1];
	const plus = U1.pins[0];
	sheet.wire(out, vout);
	sheet.flag(vout, 'vout');

	// ---- negative feedback along the top: from vout up, left through the
	// feedback string to the nm column at x = 448, then down into the - input
	const top = 96;
	const nmTop = { x: minus.x, y: top };
	sheet.wire(vout, { x: vout.x, y: top });
	if (limiter.kind === 'diodes') {
		const rf1 = sheet.placeFrom(E.RF1, { x: vout.x, y: top }, 'left'); // wm at (528, 96)
		const wm = rf1.pins[1];
		const rf2 = sheet.placeFrom(E.RF2, wm, 'left'); // nm at (448, 96)
		// D1 (wm -> nm) above the rail, D2 (nm -> wm) below it
		const d1 = sheet.placeFrom(E.D1, { x: wm.x, y: top - 48 }, 'left');
		sheet.wire(wm, { x: wm.x, y: top - 48 });
		sheet.route(d1.pins[1], { x: nmTop.x, y: top - 48 }, nmTop);
		const d2 = sheet.placeFrom(E.D2, { x: nmTop.x, y: top + 48 }, 'right');
		sheet.wire(nmTop, { x: nmTop.x, y: top + 48 });
		sheet.route(d2.pins[1], { x: wm.x, y: top + 48 }, wm);
		sheet.wire({ x: nmTop.x, y: top + 48 }, { x: nmTop.x, y: 192 });
		void rf2;
	} else {
		const rf = sheet.placeFrom(E.RF, { x: vout.x, y: top }, 'left'); // nm end at (528, 96)
		sheet.wire(rf.pins[1], nmTop);
		sheet.wire(nmTop, { x: nmTop.x, y: 192 });
	}
	// the - input column, with the lower leg tapped off it at y = 192
	const tap = { x: minus.x, y: 192 };
	sheet.wire(tap, minus);
	const legTop = { x: 320, y: 192 };
	sheet.wire(tap, legTop);

	// ---- the lower leg: what holds the amplitude
	if (limiter.kind === 'diodes') {
		const rg = sheet.placeFrom(E.RG, legTop, 'down');
		sheet.ground(rg.pins[1]);
	} else if (limiter.kind === 'lamp') {
		const lamp = sheet.placeFrom(E.RLAMP, legTop, 'down');
		sheet.ground(lamp.pins[1]);
		// the thermal network, on its own at the bottom left: BTH pours the
		// power into CTH and RTH, and V(theta) is the filament temperature
		const th = { x: 64, y: 432 };
		const bth = sheet.placeFrom(E.BTH, { x: th.x, y: th.y + 80 }, 'up'); // + (ground) at the bottom, theta on top
		sheet.ground(bth.pins[0]);
		const cth = sheet.placeFrom(E.CTH, { x: th.x + 64, y: th.y }, 'down');
		sheet.ground(cth.pins[1]);
		const rth = sheet.placeFrom(E.RTH, { x: th.x + 128, y: th.y }, 'down');
		sheet.ground(rth.pins[1]);
		sheet.wire(bth.pins[1], cth.pins[0]);
		sheet.wire(cth.pins[0], rth.pins[0]);
		sheet.flag(bth.pins[1], 'theta');
	} else {
		const rser = sheet.placeFrom(E.RSER, legTop, 'down'); // jd at (320, 272)
		const jd = rser.pins[1];
		// JFET with its drain 16 below RSER, source to ground
		const j = sheet.place(E.J1, jd.x - 48, jd.y + 16, 'R0'); // D (320,288) G (272,352) S (320,384)
		sheet.wire(jd, j.pins[0]);
		sheet.ground(j.pins[2]);
		const gate = j.pins[1];
		const gx = { x: gate.x - 64, y: gate.y }; // (208, 352)
		sheet.wire(gate, gx);
		// RX1 up from the gate node to the drain node, RX2 left to the detector
		const rx1 = sheet.placeFrom(E.RX1, gx, 'up'); // jd end at (208, 272)
		sheet.wire(rx1.pins[1], jd);
		const rx2 = sheet.placeFrom(E.RX2, gx, 'left'); // detector end at (128, 352)
		const det = rx2.pins[1];
		const rb = sheet.placeFrom(E.RB, det, 'down');
		sheet.ground(rb.pins[1]);
		let pk = det;
		if (E.RA) {
			// RA is [pk, vdiv]: its vdiv end on the detector node, pk 80 above
			const ra = sheet.placeFrom(E.RA, { x: det.x, y: det.y - 80 }, 'down');
			pk = ra.pins[0];
			sheet.flag(det, 'vdiv');
		}
		sheet.flag(pk, 'pk');
		// CDET to the left of the peak node, D1 above it, up and over to vout
		const cdetTop = { x: pk.x - 64, y: pk.y };
		sheet.wire(pk, cdetTop);
		const cdet = sheet.placeFrom(E.CDET, cdetTop, 'down');
		sheet.ground(cdet.pins[1]);
		const d1 = sheet.placeFrom(E.D1, pk, 'up'); // cathode 64 above pk
		sheet.route(d1.pins[1], { x: pk.x, y: 32 }, { x: vout.x, y: 32 }, { x: vout.x, y: top });
	}

	// ---- the Wien network along the bottom, from vout back to the + input
	// (lower when the AGC's JFET hangs in the way)
	const rail = limiter.kind === 'jfet' ? 464 : 368;
	const wp = { x: 416, y: rail };
	const rs = sheet.placeFrom(E.RS, { x: 272, y: rail }, 'right'); // vout end (272, 368), ws (352, 368)
	const cs = sheet.placeFrom(E.CS, rs.pins[1], 'right'); // wp at (416, 368)
	sheet.flag(wp, 'wp');
	const rp = sheet.placeFrom(E.RP, wp, 'down');
	sheet.ground(rp.pins[1]);
	const cpTop = { x: wp.x + 64, y: rail };
	sheet.wire(wp, cpTop);
	const cp = sheet.placeFrom(E.CP, cpTop, 'down');
	sheet.ground(cp.pins[1]);
	void cs;
	// up into the + input, entering from the left
	sheet.route(cpTop, { x: cpTop.x, y: plus.y + 32 }, { x: plus.x - 32, y: plus.y + 32 }, { x: plus.x - 32, y: plus.y }, plus);
	// the output comes back on a rail below everything
	const below = rail + 176;
	sheet.route(vout, { x: vout.x, y: below }, { x: 224, y: below }, { x: 224, y: rail }, rs.pins[0]);
}

/* ------------------------------------------------------------ ladders */

function drawLadder(sheet, design, E) {
	const n = design.topo.ladder.sections;
	const buffered = design.topo.ladder.buffered;
	const rail = 256;
	const start = { x: 96, y: rail };
	let src = start;
	for (let k = 1; k <= n; k++) {
		const cap = sheet.placeFrom(E[`C${k}`], src, 'right');
		const node = cap.pins[1];
		if (k === n) {
			src = node;
			break;
		}
		const r = sheet.placeFrom(E[`R${k}`], node, 'down');
		sheet.ground(r.pins[1]);
		if (buffered) {
			// follower: + input from the node, output fed back to the - input
			const out = { x: node.x + 128, y: rail };
			const buf = sheet.placeOpamp(E[`UB${k}`], out); // in- (node.x+64, 240), in+ (node.x+64, 272)
			const plus = buf.pins[0];
			const minus = buf.pins[1];
			sheet.route(node, { x: node.x + 32, y: rail }, { x: node.x + 32, y: plus.y }, plus);
			sheet.route(out, { x: out.x, y: rail - 48 }, { x: minus.x, y: rail - 48 }, minus);
			src = { x: out.x + 32, y: rail };
			sheet.wire(out, src);
			sheet.flag(src, `b${k}`);
		} else {
			src = { x: node.x + 32, y: rail };
			sheet.wire(node, src);
			sheet.flag(src, `n${k}`);
		}
	}
	// the last shunt resistor is RG, straight into the virtual ground
	const rg = sheet.placeFrom(E.RG, src, 'right');
	const nm = rg.pins[1];
	sheet.flag(src, 'nlast');
	const out = { x: nm.x + 64, y: rail + 16 };
	const U1 = sheet.placeOpamp(E.U1, out); // in- at nm, in+ 32 below
	groundInput(sheet, U1.pins[0]);
	const vout = { x: nm.x + 176, y: out.y };
	sheet.wire(out, vout);
	sheet.flag(vout, 'vout');

	// feedback string on a rail above: nm up, RF2 then RF1, down to vout
	const top = 128;
	const nmTop = { x: nm.x, y: top };
	sheet.wire(nm, { x: nm.x, y: top + 48 });
	sheet.wire({ x: nm.x, y: top + 48 }, nmTop);
	const rf2 = sheet.placeFrom(E.RF2, { x: nm.x + 80, y: top }, 'left'); // fm (nm.x+80), nm (nm.x)
	const fm = rf2.pins[0];
	const rf1 = sheet.placeFrom(E.RF1, { x: vout.x, y: top }, 'left'); // vout end, then 16 short of fm
	sheet.wire(rf1.pins[1], fm);
	sheet.wire({ x: vout.x, y: top }, vout);
	const d1 = sheet.placeFrom(E.D1, { x: fm.x, y: top - 48 }, 'left');
	sheet.wire(fm, { x: fm.x, y: top - 48 });
	sheet.route(d1.pins[1], { x: nm.x, y: top - 48 }, nmTop);
	const d2 = sheet.placeFrom(E.D2, { x: nm.x, y: top + 48 }, 'right');
	sheet.route(d2.pins[1], { x: fm.x, y: top + 48 }, fm);

	// the loop closes under the row
	const below = rail + 192;
	sheet.route(vout, { x: vout.x, y: below }, { x: start.x, y: below }, start);
}

/* --------------------------------------------------------- quadrature */

function drawQuadrature(sheet, design, E) {
	const inRail = 240;
	const vinvCol = 96;
	// integrator 1
	const r1 = sheet.placeFrom(E.R1, { x: vinvCol, y: inRail }, 'right'); // n1 at (176, 240)
	const n1 = r1.pins[1];
	const out1 = { x: n1.x + 64, y: inRail + 16 };
	const U1 = sheet.placeOpamp(E.U1, out1); // in- at n1, in+ (176, 272)
	groundInput(sheet, U1.pins[0]);
	const c1 = sheet.placeFrom(E.C1, { x: n1.x, y: 144 }, 'right');
	sheet.wire(n1, c1.pins[0]);
	sheet.wire(c1.pins[1], out1);
	const vsin = { x: out1.x + 32, y: out1.y };
	sheet.wire(out1, vsin);
	sheet.flag(vsin, 'vsin');
	// integrator 2, its input resistor back on the input rail
	const r2 = sheet.placeFrom(E.R2, { x: vsin.x, y: inRail }, 'right'); // n2 at (352, 240)
	sheet.wire(vsin, r2.pins[0]);
	const n2 = r2.pins[1];
	const out2 = { x: n2.x + 64, y: inRail + 16 };
	const U2 = sheet.placeOpamp(E.U2, out2);
	groundInput(sheet, U2.pins[0]);
	const c2 = sheet.placeFrom(E.C2, { x: n2.x, y: 144 }, 'right');
	// the n2 column is split at y = 192 where RN joins it
	const n2Tap = { x: n2.x, y: 192 };
	sheet.wire(n2, n2Tap);
	sheet.wire(n2Tap, c2.pins[0]);
	sheet.wire(c2.pins[1], out2);
	const vcos = { x: out2.x + 64, y: out2.y }; // (480, 256)
	sheet.wire(out2, vcos);
	sheet.flag(vcos, 'vcos');

	// the clamp: RD1 up from vcos to the divider tap, RD2 to ground, the
	// diodes from the tap over to the n2 node above C2
	const rd1 = sheet.placeFrom(E.RD1, vcos, 'up'); // zt at (480, 176)
	const zt = rd1.pins[1];
	sheet.flag(zt, 'zt');
	const rd2 = sheet.placeFrom(E.RD2, { x: zt.x + 64, y: zt.y }, 'down');
	sheet.wire(zt, rd2.pins[0]);
	sheet.ground(rd2.pins[1]);
	const d1 = sheet.placeFrom(E.D1, { x: zt.x, y: 80 }, 'left'); // zt -> n2, cathode at (416, 80)
	sheet.wire(zt, { x: zt.x, y: 80 });
	sheet.route(d1.pins[1], { x: n2.x, y: 80 }, { x: n2.x, y: 112 });
	const d2 = sheet.placeFrom(E.D2, { x: n2.x, y: 112 }, 'right'); // n2 -> zt, cathode at (416, 112)
	sheet.route(d2.pins[1], { x: zt.x - 16, y: 112 }, { x: zt.x - 16, y: zt.y }, zt);
	sheet.wire({ x: n2.x, y: 112 }, c2.pins[0]);

	// the inverter at the bottom, pointing left, closing the loop
	const out3 = { x: vinvCol, y: 448 };
	const U3 = sheet.placeOpamp(E.U3, out3, { mirror: true }); // in- (160, 432), in+ (160, 464)
	groundInput(sheet, U3.pins[0], 32);
	const n3 = U3.pins[1];
	const ra = sheet.placeFrom(E.RA, { x: vcos.x, y: n3.y }, 'left'); // n3 end at (400, 432)
	sheet.wire(vcos, { x: vcos.x, y: n3.y });
	sheet.wire(ra.pins[1], n3);
	const rbTop = { x: ra.pins[1].x, y: 528 };
	sheet.wire(ra.pins[1], rbTop);
	const rb = sheet.placeFrom(E.RB, rbTop, 'left'); // vinv end at (320, 528)
	sheet.route(rb.pins[1], { x: vinvCol, y: 528 }, out3);
	sheet.flag(out3, 'vinv');
	sheet.wire(out3, { x: vinvCol, y: inRail });
	// RN: from the vinv column, over the top of the first integrator, down
	// into the n2 column above R2 (the only way in that crosses nothing)
	const rnTop = { x: 304, y: 112 };
	sheet.route({ x: vinvCol, y: inRail }, { x: vinvCol, y: 48 }, { x: rnTop.x, y: 48 }, rnTop);
	const rn = sheet.placeFrom(E.RN, rnTop, 'down'); // n2 end at (304, 192)
	sheet.wire(rn.pins[1], n2Tap);
}

/**
 * Draws a design into an existing sheet, from an element table (name to
 * element) that may carry another circuit's naming. This is how the AM
 * modulator's sheet gets its carrier oscillator: the same layout, shifted
 * and with its nets renamed by the sheet's block(). Returns the layout's
 * footprint in block coordinates.
 */
export function drawOscillatorInto(sheet, design, E) {
	if (design.topology === 'wien') drawWien(sheet, design, E);
	else if (design.topology === 'quadrature') drawQuadrature(sheet, design, E);
	else drawLadder(sheet, design, E);
	return design.topology === 'wien' ? { width: 672, height: design.limiter.kind === 'jfet' ? 704 : 608 } : design.topology === 'quadrature' ? { width: 640, height: 592 } : { width: 1400, height: 512 };
}

/**
 * The drawn schematic of a design. `directives` are emitted as one SPICE
 * block, `comments` as one note.
 */
export function drawOscillator(design, { title, comments = [], directives = [], gbw = '3Meg' }) {
	const elements = buildElements(design);
	const E = byName(elements);
	const sheet = createSheet({ gbw });
	drawOscillatorInto(sheet, design, E);
	const box = sheet.bounds();
	const textX = Math.max(64, box.minX);
	let textY = box.maxY + 48;
	sheet.text(textX, textY, [title, ...comments]);
	textY += 16 * (comments.length + 2);
	sheet.text(textX, textY, directives, { directive: true });
	return sheet.render();
}
