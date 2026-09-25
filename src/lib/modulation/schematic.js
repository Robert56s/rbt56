import { drawChain } from '../filter/sheet';
import { drawOscillatorInto } from '../oscillator/schematic';
import { createSheet, groundInput, hang, run, series } from '../spice/draw';
import { buildDemodElements, buildDiodeElements, buildElements } from './spice';

/**
 * The JFET AM modulator drawn as an LTspice schematic, laid out so that
 * no two nets cross: the carrier comes in along the top, through its
 * divider, into the cell; the JFET hangs below the cell's input; the
 * gate-drive summer sits underneath, and its output vgate climbs straight
 * into the JFET's gate. A non-inverting stage is drawn with its +
 * input on top, the way a textbook draws one. An on-board carrier
 * oscillator is drawn in full below everything and reaches the divider
 * by its net label, vcar.
 *
 * Named nets are the ones something reads: nac (the run's .ic), vgate
 * and vout (what to plot), vcc (the supply), and vcar when the carrier is
 * the oscillator's.
 */

const byName = (elements) => Object.fromEntries(elements.filter((e) => e.kind !== 'LABEL').map((e) => [e.name, e]));

const R = 192; // the carrier's rail

/** A source standing at `x` with its + pin tied up to the rail at `y`; returns the rail point. */
function sourceUp(sheet, e, x, y) {
	const src = sheet.place(e, x, y + 32, 'R0'); // + at (x, y + 48), - at (x, y + 128)
	sheet.ground(src.pins[1]);
	return run(sheet, src.pins[0], 'up', 48);
}

/** The carrier source (or the oscillator's label) and the divider; returns the vac node. */
function drawCarrier(sheet, E, { hasOscillator }) {
	let p;
	if (hasOscillator) {
		p = { x: 144, y: R };
		sheet.label(p, 'vcar', 'left');
	} else {
		p = sourceUp(sheet, E.VC, 96, R);
	}
	if (E.RDT) {
		const vac = run(sheet, series(sheet, E.RDT, p, 'right', { gap: 112 }), 'right', 48);
		sheet.ground(sheet.placeFrom(E.RDB, vac, 'down').pins[1]);
		return vac;
	}
	// no divider: a 1 ohm link keeps the node names of the netlist
	return run(sheet, series(sheet, E.RDB, p, 'right', { gap: 112 }), 'right', 48);
}

/**
 * The gate-drive summer, its input line at y = S: the message through
 * CIN and RAC, the bias through RBIAS from below, RF over the top. The
 * output runs right to `gateX`, then up to the JFET's gate at `gate`.
 */
function drawSummer(sheet, E, S, gate) {
	const nac = run(sheet, series(sheet, E.CIN, sourceUp(sheet, E.VM, 96, S), 'right'), 'right', 48);
	sheet.label(run(sheet, nac, 'up', 64), 'nac', 'right');
	const NS = run(sheet, series(sheet, E.RAC, nac, 'right'), 'right', 48);
	const inMinus = run(sheet, NS, 'right', 160);
	const US = sheet.placeOpamp(E.US, { x: inMinus.x + 64, y: inMinus.y + 16 });
	groundInput(sheet, US.pins[0]);
	const VG = run(sheet, US.pins[2], 'right', 64);
	// RF over the top
	const rfLeft = run(sheet, NS, 'up', 112);
	const rfEnd = series(sheet, E.RF, rfLeft, 'right');
	sheet.route(rfEnd, { x: VG.x, y: rfLeft.y }, VG);
	// RBIAS up into the summing node from below, its foot on the vcc label
	const rbias = sheet.placeFrom(E.RBIAS, { x: NS.x, y: NS.y + 144 }, 'up');
	sheet.wire(rbias.pins[1], NS);
	sheet.label(rbias.pins[0], 'vcc', 'left');
	// the supply on its own, labelled vcc
	const vcc = sheet.place(E.VCC, 96, S + 272, 'R0');
	sheet.ground(vcc.pins[1]);
	sheet.label(run(sheet, vcc.pins[0], 'up', 32), 'vcc', 'right');
	// vgate: right, up the column, into the gate from its left
	const foot = { x: gate.x - 64, y: VG.y };
	sheet.route(VG, foot, { x: foot.x, y: gate.y }, gate);
	sheet.label(run(sheet, foot, 'down', 48), 'vgate', 'right');
}

/** Non-inverting cell: + on top from vac, the channel as the lower leg under RB. */
function drawNonInvertingCell(sheet, E, vac) {
	const inPlus = { x: 912, y: R };
	sheet.wire(vac, inPlus);
	const UC = sheet.placeOpamp(E.UC, { x: inPlus.x + 64, y: inPlus.y + 16 }, { flip: true, labels: 'above' });
	const VO = run(sheet, UC.pins[2], 'right', 96);
	sheet.label(VO, 'vout', 'right');
	// the - input's column: down to JN, where RB comes back and the JFET hangs
	const nc = run(sheet, UC.pins[1], 'left', 32);
	const JN = run(sheet, nc, 'down', 80);
	const rbRight = run(sheet, VO, 'down', 96);
	sheet.wire(series(sheet, E.RB, rbRight, 'left'), JN);
	const j = sheet.place(E.J1, JN.x - 48, JN.y + 48, 'R0'); // D (JN.x, JN.y+48), G (JN.x-48, JN.y+112), S (JN.x, JN.y+144)
	sheet.wire(JN, j.pins[0]);
	sheet.ground(j.pins[2]);
	return j.pins[1];
}

/** Inverting cell: the follower (if any) drives the channel, the channel is the input resistor. */
function drawInvertingCell(sheet, E, design, vac) {
	let drive;
	if (E.UB) {
		const inPlus = { x: 528, y: R };
		sheet.wire(vac, inPlus);
		const UB = sheet.placeOpamp(E.UB, { x: inPlus.x + 64, y: inPlus.y + 16 }, { flip: true, labels: 'above' });
		const out = run(sheet, UB.pins[2], 'right', 32);
		// the follower's loop, under its body into the - input
		const inMinus = UB.pins[1];
		sheet.route(out, { x: out.x, y: inMinus.y + 48 }, { x: inMinus.x - 32, y: inMinus.y + 48 }, { x: inMinus.x - 32, y: inMinus.y }, inMinus);
		drive = run(sheet, series(sheet, E.RZS, out, 'right'), 'right', 144);
	} else {
		drive = run(sheet, vac, 'right', 560);
	}
	// J1 hangs from the drive, its source is the cell's summing node
	const j = sheet.place(E.J1, drive.x - 48, drive.y + 48, 'R0');
	sheet.wire(drive, j.pins[0]);
	const src = j.pins[2];
	const NCJ = run(sheet, src, 'right', 96);
	const inMinus = run(sheet, NCJ, 'right', 48);
	const UC = sheet.placeOpamp(E.UC, { x: inMinus.x + 64, y: inMinus.y + 16 });
	groundInput(sheet, UC.pins[0]);
	const VCELL = run(sheet, UC.pins[2], 'right', 64);
	// R2 over the top of UC, back into NCJ
	const r2Right = { x: VCELL.x, y: NCJ.y - 112 };
	sheet.wire(VCELL, r2Right);
	const r2End = series(sheet, E.R2, r2Right, 'left');
	sheet.route(r2End, { x: NCJ.x, y: r2Right.y }, NCJ);
	if (design.postGain?.needed) {
		// the fixed post-gain stage, non-inverting, + on top
		const inPlus = run(sheet, VCELL, 'right', 96);
		const UP = sheet.placeOpamp(E.UP, { x: inPlus.x + 64, y: inPlus.y + 16 }, { flip: true, labels: 'above' });
		const VO = run(sheet, UP.pins[2], 'right', 96);
		sheet.label(VO, 'vout', 'right');
		const np = run(sheet, UP.pins[1], 'left', 32);
		const JP = run(sheet, np, 'down', 80);
		const rptRight = run(sheet, VO, 'down', 96);
		sheet.wire(series(sheet, E.RPT, rptRight, 'left'), JP);
		sheet.ground(sheet.placeFrom(E.RPB, JP, 'down').pins[1]);
	} else {
		sheet.label(run(sheet, series(sheet, E.RLINK, VCELL, 'right'), 'right', 48), 'vout', 'right');
	}
	return j.pins[1];
}

/**
 * The drawn schematic. `oscillator` is the carrier oscillator design when
 * one is embedded; its elements carry the 'O' suffix and renamed nodes
 * that buildElements gave them.
 */
export function drawModulator({ design, fmPreview, oscillator }, { comments = [], directives = [], gbw = '3Meg', opamp = 'ideal' }) {
	const elements = buildElements({ design, fmPreview, oscillator });
	const E = byName(elements);
	const sheet = createSheet({ gbw, opamp });
	const vac = drawCarrier(sheet, E, { hasOscillator: !!oscillator });
	const gate = design.topology === 'inverting' ? drawInvertingCell(sheet, E, design, vac) : drawNonInvertingCell(sheet, E, vac);
	const box = sheet.bounds();
	drawSummer(sheet, E, Math.ceil((box.maxY + 144) / 16) * 16, gate);
	if (oscillator) {
		// the oscillator's own layout, below everything, with its nodes
		// renamed the way the element list renamed them
		const EO = Object.fromEntries(Object.entries(E).filter(([name]) => name.endsWith('O') && name !== 'RLINKO').map(([name, e]) => [name.slice(0, -1), e]));
		const probe = createSheet({ gbw, opamp });
		drawOscillatorInto(probe, oscillator, EO);
		const own = probe.bounds();
		const here = sheet.bounds();
		const dx = Math.round((here.minX - own.minX) / 16) * 16;
		const dy = Math.ceil((here.maxY + 128 - own.minY) / 16) * 16;
		sheet.block({ dx, dy, names: (n) => (n === 'vout' ? 'vcar' : `osc_${n}`) }, () => drawOscillatorInto(sheet, oscillator, EO));
	}
	sheet.notes({ comments, directives });
	return sheet.render();
}

/**
 * The precision full-wave rectifier as TI draws it, from the rail point
 * `inp`: U1A with its + input on the rail; a top rail joining U1A's -
 * input, D1's anode and R1; D1 down from it into U1A's output line; D2 on
 * that line into U1B's + input, with R3 hanging from there; R1 and R2
 * along the top rail, G dropping into U1B's - input, R2 coming down into
 * U1B's output. Nothing crosses. Returns U1B's output node.
 */
function drawPrecisionRectifier(sheet, E, inp) {
	const T = inp.y - 176;
	const inPlus = { x: inp.x + 192, y: inp.y };
	sheet.wire(inp, inPlus);
	const ua = sheet.placeOpamp(E.U1A, { x: inPlus.x + 64, y: inPlus.y - 16 });
	const P = run(sheet, ua.pins[2], 'right', 96);
	// D1 from the top rail down into the output line, on a stub so its
	// name clears the rail
	const F = { x: P.x, y: T };
	sheet.wire(sheet.placeFrom(E.D1, run(sheet, F, 'down', 32), 'down').pins[1], P);
	// U1A's - input up to the top rail, from its left
	const inMinus = ua.pins[1];
	sheet.route(inMinus, { x: inMinus.x - 32, y: inMinus.y }, { x: inMinus.x - 32, y: T }, F);
	// D2 along the output line, R3 from its cathode to ground
	const H = run(sheet, series(sheet, E.D2, P, 'right'), 'right', 48);
	sheet.ground(hang(sheet, E.R3, H).pins[1]);
	// R1 and R2 along the top rail
	const G = run(sheet, series(sheet, E.R1, F, 'right'), 'right', 48);
	const r2End = series(sheet, E.R2, G, 'right');
	// U1B, - on top, + on the output line at H's height
	const ubPlus = { x: r2End.x - 64, y: H.y };
	const ub = sheet.placeOpamp(E.U1B, { x: ubPlus.x + 64, y: ubPlus.y - 16 });
	sheet.wire(H, ub.pins[0]);
	sheet.route(G, { x: G.x, y: ub.pins[1].y }, ub.pins[1]);
	const VO = run(sheet, ub.pins[2], 'right', 64);
	sheet.route(r2End, { x: VO.x, y: T }, VO);
	return VO;
}

/**
 * The demodulator drawn as an LTspice schematic: the AM test source on the
 * left (its long expression written on its left), the rectifier, then the
 * envelope filter's stages, drawn by the Active Filter Design tool's own
 * stage drawer so they look the same in both tools. Named nets: vam (the
 * AM wave), vrect (after the rectifier) and vout.
 */
export function drawDemodulator(opts, { comments = [], directives = [], gbw = '3Meg', opamp = 'ideal' }) {
	const E = byName(buildDemodElements(opts));
	const sheet = createSheet({ gbw, opamp });
	const R = 320;
	const src = sheet.place(E.BAM, 96, R + 32, 'R0', { labels: 'left' });
	sheet.ground(src.pins[1]);
	const A0 = run(sheet, run(sheet, src.pins[0], 'up', 48), 'right', 48);
	sheet.label(run(sheet, A0, 'up', 64), 'vam', 'right');
	let rectOut;
	if (opts.rectifierType === 'half') {
		rectOut = run(sheet, series(sheet, E.D1, A0, 'right'), 'right', 48);
		sheet.ground(hang(sheet, E.RL, rectOut).pins[1]);
	} else {
		rectOut = drawPrecisionRectifier(sheet, E, A0);
	}
	const vr = run(sheet, rectOut, 'right', 48);
	sheet.label(run(sheet, vr, 'up', 64), 'vrect', 'right');
	const out = drawChain(sheet, opts.envelope.realized, run(sheet, vr, 'right', 48), 1);
	sheet.label(out, 'vout', 'right');
	sheet.notes({ comments, directives });
	return sheet.render();
}

/**
 * The diode + tank modulator drawn as an LTspice schematic: the sources
 * stacked on the left (carrier, message, and -Vcc for the bias), each
 * through its resistor into a vertical summing bus; the summer's op-amp
 * right of the bus with RF over the top; then RS and the diode along the
 * line into the tank, whose parts hang side by side from the output rail,
 * spaced by what their labels need. Named nets: vs (the summed drive) and
 * vout.
 */
export function drawDiodeModulator({ design }, { comments = [], directives = [], gbw = '3Meg', opamp = 'ideal' }) {
	const E = byName(buildDiodeElements({ design }));
	const sheet = createSheet({ gbw, opamp });
	const S = 192;
	const XB = 400;
	const rows = [
		['VC', 'RP'],
		['VM', 'RM']
	];
	if (E.RB) rows.push(['VEE', 'RB']);
	const ends = rows.map(([src, r], k) => {
		const end = series(sheet, E[r], sourceUp(sheet, E[src], 96, S + 224 * k), 'right');
		return run(sheet, end, 'right', XB - end.x);
	});
	for (let k = 1; k < ends.length; k++) sheet.wire(ends[k - 1], ends[k]);
	// the - input line from the top of the bus, RF over the top
	const NS = run(sheet, ends[0], 'right', 48);
	const inMinus = run(sheet, NS, 'right', 96);
	const us = sheet.placeOpamp(E.US, { x: inMinus.x + 64, y: inMinus.y + 16 });
	groundInput(sheet, us.pins[0]);
	const VS = run(sheet, us.pins[2], 'right', 64);
	const rfTop = run(sheet, NS, 'up', 112);
	sheet.route(series(sheet, E.RF, rfTop, 'right'), { x: VS.x, y: rfTop.y }, VS);
	// the summed drive, named on a branch of its own
	const VS2 = run(sheet, VS, 'right', 48);
	sheet.label(run(sheet, VS2, 'down', 64), 'vs', 'right');
	// RS and the diode into the tank
	const cathode = series(sheet, E.D1, series(sheet, E.RS, VS2, 'right', { gap: 96 }), 'right');
	let at = run(sheet, cathode, 'right', 64);
	const parts = [E.L1, E.C1, E.C2, E.RT].filter(Boolean);
	parts.forEach((e, k) => {
		sheet.ground(hang(sheet, e, at).pins[1]);
		const gap = k < parts.length - 1 ? Math.max(96, Math.ceil((48 + sheet.labelWidth(e) + 24) / 16) * 16) : 96;
		at = run(sheet, at, 'right', gap);
	});
	sheet.label(at, 'vout', 'right');
	sheet.notes({ comments, directives });
	return sheet.render();
}
