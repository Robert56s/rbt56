import { drawOscillatorInto } from '../oscillator/schematic';
import { createSheet } from '../spice/draw';
import { buildElements } from './spice';

/**
 * The JFET AM modulator drawn as an LTspice schematic: the gate-drive
 * summer along the top, the carrier source (or the carrier oscillator,
 * drawn in full below everything) and its divider in the middle, and the
 * gain cell on the right, with the follower and the post-gain stage when
 * the design has them. The three signals that cross the sheet, vgate,
 * vac and vcar, travel by net label, as they would on any LTspice sheet
 * of this size; everything else is wired.
 */

const byName = (elements) => Object.fromEntries(elements.filter((e) => e.kind !== 'LABEL').map((e) => [e.name, e]));

function groundInput(sheet, pin, dx = -32) {
	const corner = { x: pin.x + dx, y: pin.y };
	sheet.wire(pin, corner);
	sheet.ground(corner);
}

/** The inverting summer: message through CIN and RAC, bias through RBIAS, RF feedback, vgate out. */
function drawSummer(sheet, E) {
	const vcc = sheet.placeFrom(E.VCC, { x: 64, y: 48 }, 'down');
	sheet.ground(vcc.pins[1]);
	sheet.flag(vcc.pins[0], 'vcc');
	const rbias = sheet.placeFrom(E.RBIAS, { x: 288, y: 144 }, 'down'); // vcc end on top, nsum end at (288, 224)
	sheet.route(vcc.pins[0], { x: 64, y: 16 }, { x: 288, y: 16 }, rbias.pins[0]);

	const vm = sheet.placeFrom(E.VM, { x: 64, y: 224 }, 'down');
	sheet.ground(vm.pins[1]);
	sheet.flag(vm.pins[0], 'vm');
	const cin = sheet.placeFrom(E.CIN, { x: 96, y: 224 }, 'right');
	sheet.wire(vm.pins[0], cin.pins[0]);
	sheet.flag(cin.pins[1], 'nac');
	const rac = sheet.placeFrom(E.RAC, cin.pins[1], 'right'); // nsum end at (240, 224)
	// the input wire into the - input, split where RF and RBIAS join it
	const nsum = { x: 256, y: 224 };
	sheet.wire(rac.pins[1], nsum);
	sheet.wire(nsum, rbias.pins[1]);
	const US = sheet.placeOpamp(E.US, { x: 368, y: 240 }); // in- (304, 224), in+ (304, 256)
	sheet.wire(rbias.pins[1], US.pins[1]);
	sheet.flag(nsum, 'nsum');
	groundInput(sheet, US.pins[0]);
	// feedback below the op-amp
	const rfLeft = { x: nsum.x, y: 352 };
	sheet.wire(nsum, rfLeft);
	const rf = sheet.placeFrom(E.RF, rfLeft, 'right'); // vgate end at (336, 352)
	const vgate = { x: 416, y: 240 };
	sheet.route(rf.pins[1], { x: vgate.x, y: 352 }, vgate);
	sheet.wire(US.pins[2], vgate);
	sheet.flag(vgate, 'vgate');
}

/** The carrier source (or the label the oscillator feeds) and its divider. */
function drawCarrier(sheet, E, { hasOscillator }) {
	const rail = 480;
	const start = { x: 96, y: rail };
	if (hasOscillator) {
		sheet.flag(start, 'vcar');
	} else {
		const vc = sheet.placeFrom(E.VC, { x: 64, y: rail }, 'down');
		sheet.ground(vc.pins[1]);
		sheet.flag(vc.pins[0], 'vcar');
		sheet.wire(vc.pins[0], start);
	}
	if (E.RDT) {
		const rdt = sheet.placeFrom(E.RDT, start, 'right'); // vac at (176, 480)
		const rdb = sheet.placeFrom(E.RDB, rdt.pins[1], 'down');
		sheet.ground(rdb.pins[1]);
		sheet.flag(rdt.pins[1], 'vac');
	} else {
		const link = sheet.placeFrom(E.RDB, start, 'right');
		sheet.flag(link.pins[1], 'vac');
	}
}

/** Non-inverting cell: the channel is the lower leg of the feedback divider. */
function drawNonInvertingCell(sheet, E) {
	const UC = sheet.placeOpamp(E.UC, { x: 640, y: 448 }); // in- (576, 432), in+ (576, 464)
	const vacIn = { x: 544, y: 464 };
	sheet.wire(UC.pins[0], vacIn);
	sheet.flag(vacIn, 'vac');
	const j = sheet.place(E.J1, 480, 352, 'R0'); // D (528, 352), G (480, 416), S (528, 448)
	sheet.ground(j.pins[2]);
	const tee = { x: 576, y: 336 };
	sheet.route(j.pins[0], { x: j.pins[0].x, y: tee.y }, tee);
	sheet.wire(tee, UC.pins[1]);
	const gate = { x: 448, y: 416 };
	sheet.wire(j.pins[1], gate);
	sheet.flag(gate, 'vgate');
	const vout = { x: 704, y: 448 };
	sheet.wire(UC.pins[2], vout);
	sheet.flag(vout, 'vout');
	const rb = sheet.placeFrom(E.RB, { x: vout.x, y: 272 }, 'left'); // ncell end at (624, 272)
	sheet.wire(vout, { x: vout.x, y: 272 });
	sheet.route(rb.pins[1], { x: tee.x, y: 272 }, tee);
}

/** Inverting cell: the channel is the input resistor, driven by the follower or straight from the divider. */
function drawInvertingCell(sheet, E, design) {
	const j = sheet.place(E.J1, 544, 336, 'R0'); // D (592, 336), G (544, 400), S (592, 432)
	if (E.UB) {
		const UB = sheet.placeOpamp(E.UB, { x: 512, y: 320 }); // in- (448, 304), in+ (448, 336)
		// 16 clear of the summer's vgate column at x = 416, which runs down to y = 352
		const vacIn = { x: 432, y: 336 };
		sheet.wire(UB.pins[0], vacIn);
		sheet.flag(vacIn, 'vac');
		sheet.route(UB.pins[2], { x: 512, y: 272 }, { x: 448, y: 272 }, UB.pins[1]);
		const rzs = sheet.placeFrom(E.RZS, UB.pins[2], 'right'); // vdrv at (592, 320)
		sheet.wire(rzs.pins[1], j.pins[0]);
	} else {
		const vacIn = { x: 560, y: 304 };
		sheet.route(j.pins[0], { x: j.pins[0].x, y: 304 }, vacIn);
		sheet.flag(vacIn, 'vac');
	}
	const gate = { x: 512, y: 400 };
	sheet.wire(j.pins[1], gate);
	sheet.flag(gate, 'vgate');

	const UC = sheet.placeOpamp(E.UC, { x: 720, y: 464 }); // in- (656, 448), in+ (656, 480)
	groundInput(sheet, UC.pins[0]);
	const tee = { x: 640, y: 448 };
	sheet.route(j.pins[2], { x: j.pins[2].x, y: tee.y }, tee);
	sheet.wire(tee, UC.pins[1]);
	const vcell = { x: 784, y: 464 };
	sheet.wire(UC.pins[2], vcell);
	sheet.flag(vcell, 'vcell');
	const r2 = sheet.placeFrom(E.R2, { x: vcell.x, y: 384 }, 'left'); // ncell end at (704, 384)
	sheet.wire(vcell, { x: vcell.x, y: 384 });
	sheet.route(r2.pins[1], { x: tee.x, y: 384 }, tee);

	if (design.postGain?.needed) {
		// flipped, so the + input is on top and vcell runs straight into it
		const UP = sheet.placeOpamp(E.UP, { x: 976, y: 480 }, { flip: true }); // in+ (912, 464), in- (912, 496)
		sheet.wire(vcell, UP.pins[0]);
		const npg = { x: 880, y: 496 };
		sheet.wire(UP.pins[1], npg);
		const rpb = sheet.placeFrom(E.RPB, npg, 'down');
		sheet.ground(rpb.pins[1]);
		const vout = { x: 1040, y: 480 };
		sheet.wire(UP.pins[2], vout);
		sheet.flag(vout, 'vout');
		// the feedback resistor below everything, back into the npg hub from the left
		const rpt = sheet.placeFrom(E.RPT, { x: vout.x, y: 656 }, 'left'); // npg end at (960, 656)
		sheet.wire(vout, { x: vout.x, y: 656 });
		sheet.route(rpt.pins[1], { x: 848, y: 656 }, { x: 848, y: npg.y }, npg);
	} else {
		const link = sheet.placeFrom(E.RLINK, vcell, 'right');
		sheet.flag(link.pins[1], 'vout');
	}
}

/**
 * The drawn schematic. `oscillator` is the carrier oscillator design when
 * one is embedded; its elements carry the 'O' suffix and renamed nodes
 * that buildElements gave them.
 */
export function drawModulator({ design, fmPreview, oscillator }, { title, comments = [], directives = [], gbw = '3Meg' }) {
	const elements = buildElements({ design, fmPreview, oscillator });
	const E = byName(elements);
	const sheet = createSheet({ gbw });
	drawSummer(sheet, E);
	drawCarrier(sheet, E, { hasOscillator: !!oscillator });
	if (design.topology === 'inverting') drawInvertingCell(sheet, E, design);
	else drawNonInvertingCell(sheet, E);
	if (oscillator) {
		// the oscillator's own layout, below, with its nodes renamed the way
		// the element list renamed them
		const EO = Object.fromEntries(Object.entries(E).filter(([name]) => name.endsWith('O') && name !== 'RLINKO').map(([name, e]) => [name.slice(0, -1), e]));
		sheet.block({ dx: 0, dy: 640, names: (n) => (n === 'vout' ? 'vcar' : `osc_${n}`) }, () => {
			drawOscillatorInto(sheet, oscillator, EO);
		});
	}
	const box = sheet.bounds();
	let textY = box.maxY + 48;
	sheet.text(64, textY, [title, ...comments]);
	textY += 16 * (comments.length + 2);
	sheet.text(64, textY, directives, { directive: true });
	return sheet.render();
}
