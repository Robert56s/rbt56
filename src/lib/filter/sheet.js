import { createSheet, groundInput, hang, run, series } from '../spice/draw';
import { stageElements } from './spice';

/**
 * The filter drawn as an LTspice schematic, stage after stage along one
 * line, each stage the way a textbook draws it: an MFB or a Tow-Thomas
 * with its inverting input on top and its feedback over the top, a
 * Sallen-Key or a first-order section as a follower with its + input on
 * top. A band-stop runs its two branches on two rows from the same input
 * and joins them in the combiner on the right. Parts are joined by wires,
 * never pin to pin, and every label is horizontal; the check scripts
 * audit the sheet for overlaps and read it back against the netlist.
 *
 * Each stage drawer takes the point its input arrives at and returns the
 * point its output leaves from (16 lower, since an op-amp's output sits
 * between its inputs).
 */

/** Hangs a two-pin part below a node and grounds its foot. */
function shunt(sheet, e, at) {
	sheet.ground(hang(sheet, e, at).pins[1]);
}

/** A part over the top of a stage, from column `from` up `rise`, across to column `to` and down. */
function overTop(sheet, e, from, to, rise, dir) {
	const top = run(sheet, from, 'up', rise);
	const end = series(sheet, e, top, dir);
	sheet.route(end, { x: to.x, y: top.y }, to);
}

/** MFB low-pass or high-pass: [series1, shunt, series2, outer, inner, U]. */
function drawMfb(sheet, [s1, sh, s2, outer, inner, U], p) {
	const A = run(sheet, series(sheet, s1, p, 'right'), 'right', 48);
	shunt(sheet, sh, A);
	const M = run(sheet, series(sheet, s2, A, 'right'), 'right', 48);
	const inMinus = run(sheet, M, 'right', 48);
	const u = sheet.placeOpamp(U, { x: inMinus.x + 64, y: inMinus.y + 16 });
	groundInput(sheet, u.pins[0]);
	const OUT = run(sheet, u.pins[2], 'right', 64);
	// inner feedback: M to the output, one rung up; outer: output to A, two rungs up
	const innerTop = run(sheet, M, 'up', 112);
	const innerEnd = series(sheet, inner, innerTop, 'right');
	const tap = { x: OUT.x, y: innerTop.y };
	sheet.wire(innerEnd, tap);
	sheet.wire(OUT, tap);
	const outerTop = { x: OUT.x, y: innerTop.y - 112 };
	sheet.wire(tap, outerTop);
	const outerEnd = series(sheet, outer, outerTop, 'left');
	sheet.route(outerEnd, { x: A.x, y: outerTop.y }, A);
	return run(sheet, OUT, 'right', 48);
}

/**
 * A follower with its + input on top at `inPlus`, the - input tied to
 * the output under the body. Returns the output node.
 */
function follower(sheet, U, inPlus) {
	const u = sheet.placeOpamp(U, { x: inPlus.x + 64, y: inPlus.y + 16 }, { flip: true, labels: 'above' });
	const OUT = run(sheet, u.pins[2], 'right', 64);
	const inMinus = u.pins[1];
	sheet.route(inMinus, { x: inMinus.x - 32, y: inMinus.y }, { x: inMinus.x - 32, y: inMinus.y + 48 }, { x: OUT.x, y: inMinus.y + 48 }, OUT);
	return OUT;
}

/** Sallen-Key low-pass or high-pass: [series1, series2, shunt, over, U]. */
function drawSallenKey(sheet, [s1, s2, sh, over, U], p) {
	const X = run(sheet, series(sheet, s1, p, 'right'), 'right', 48);
	const P = run(sheet, series(sheet, s2, X, 'right'), 'right', 48);
	shunt(sheet, sh, P);
	const OUT = follower(sheet, U, run(sheet, P, 'right', 128));
	overTop(sheet, over, OUT, X, 128, 'left');
	return run(sheet, OUT, 'right', 48);
}

/** First-order low-pass or high-pass: [series, shunt, U]. */
function drawFirstOrder(sheet, [s, sh, U], p) {
	const A = run(sheet, series(sheet, s, p, 'right'), 'right', 48);
	shunt(sheet, sh, A);
	const OUT = follower(sheet, U, run(sheet, A, 'right', 128));
	return run(sheet, OUT, 'right', 48);
}

/**
 * The inverting integrator stage of a Tow-Thomas loop: input part, the
 * summing node, the op-amp, and its feedback over the top (one part or
 * two in parallel), drawn towards `dir` ('right', or 'left' with the
 * op-amp mirrored). Returns { N, OUT }.
 */
function integrator(sheet, input, feedback, U, p, { room = 48, dir = 'right' } = {}) {
	const s = dir === 'left' ? -1 : 1;
	const N = run(sheet, series(sheet, input, p, dir), dir, 48);
	const inMinus = run(sheet, N, dir, room);
	const u = sheet.placeOpamp(U, { x: inMinus.x + 64 * s, y: inMinus.y + 16 }, { mirror: s < 0 });
	groundInput(sheet, u.pins[0], 32, s < 0 ? 'right' : 'left');
	const OUT = run(sheet, u.pins[2], dir, 64);
	// feedback rungs over the op-amp, between the N column and the OUT column
	let prev = N;
	let prevOut = OUT;
	feedback.forEach((e, k) => {
		const y = N.y - 112 * (k + 1);
		const near = { x: N.x, y };
		const far = { x: OUT.x, y };
		sheet.wire(prev, near);
		sheet.wire(prevOut, far);
		const span = Math.abs(far.x - near.x);
		const len = e.kind === 'C' ? 64 : 80;
		const start = { x: near.x + s * Math.round((span - len) / 32) * 16, y };
		sheet.wire(near, start);
		sheet.wire(sheet.placeFrom(e, start, dir).pins[1], far);
		prev = near;
		prevOut = far;
	});
	return { N, OUT };
}

/**
 * Tow-Thomas low-pass (output after the second integrator) or high-pass
 * (output after the first).
 *
 * Low-pass: both integrators on the main line and the inverter under
 * them pointing back, so the loop is one ring: along the top, down the
 * right, back along the bottom, up through Ra into the first summing
 * node. The next stage carries on from the ring's top right corner.
 *
 * High-pass: the output is the first integrator's, so the rest of the
 * loop goes on a row below, right of it, its inverter's output coming
 * back along the bottom and up through Ra.
 */
function drawTowThomas(sheet, parts, p, highPass) {
	const [input, Ra, C1, Rd, Ua, Rb, C2, Ub, Rr1, Rr2, Uc] = parts;
	const first = integrator(sheet, input, [C1, Rd], Ua, p, { room: 96 });
	if (!highPass) {
		const second = integrator(sheet, Rb, [C2], Ub, first.OUT);
		const corner = run(sheet, second.OUT, 'right', 48);
		const inv = integrator(sheet, Rr1, [Rr2], Uc, run(sheet, corner, 'down', 256), { room: 64, dir: 'left' });
		const raFoot = { x: first.N.x, y: inv.OUT.y };
		sheet.wire(inv.OUT, raFoot);
		sheet.wire(sheet.placeFrom(Ra, raFoot, 'up', { labels: 'left' }).pins[1], first.N);
		return corner;
	}
	const out = first.OUT;
	const loopFrom = run(sheet, out, 'right', 48);
	// the rest of the loop on a row below, the second integrator first
	const row = p.y + 336;
	const down = { x: loopFrom.x, y: row };
	sheet.wire(loopFrom, down);
	const from = integrator(sheet, Rb, [C2], Ub, down).OUT;
	const inv = integrator(sheet, Rr1, [Rr2], Uc, from);
	// back along the bottom to under the first summing node, up through Ra
	const bottom = inv.OUT.y + 176;
	const raFoot = { x: first.N.x, y: bottom };
	sheet.route(inv.OUT, { x: inv.OUT.x, y: bottom }, raFoot);
	const raTop = sheet.placeFrom(Ra, raFoot, 'up').pins[1];
	sheet.wire(raTop, first.N);
	// the next stage starts past the loop's row, so nothing of it drops
	// through the row below
	const cont = { x: inv.OUT.x + 96, y: loopFrom.y };
	sheet.wire(loopFrom, cont);
	return cont;
}

/**
 * Tow-Thomas notch (a stage of an elliptic or inverse Chebyshev filter):
 * one ring, with A1 on the main line and both A2 and A3 on the bottom row
 * facing back. The input splits at once: Cin on to A1 along the main
 * line, and Rz down, along the very bottom and up into A2's summing node,
 * outside the ring, so nothing crosses it. The output is A1's; the main
 * line runs on far enough for the bottom row to fit under it, and Rb
 * drops from its end into A2's summing node.
 */
function drawTowThomasNotch(sheet, parts, p) {
	const [Cin, Rz, Ra, C1, Rd, Ua, Rb, C2, Ub, Rr1, Rr2, Uc] = parts;
	const split = run(sheet, p, 'right', 48);
	const first = integrator(sheet, Cin, [C1, Rd], Ua, split, { room: 96 });
	// the bottom row is 768 wide (Rb, A2, the inverter), plus room for Ra's column
	const corner = run(sheet, first.OUT, 'right', 640);
	const second = integrator(sheet, Rb, [C2], Ub, run(sheet, corner, 'down', 256), { room: 96, dir: 'left' });
	const inv = integrator(sheet, Rr1, [Rr2], Uc, second.OUT, { room: 64, dir: 'left' });
	const raFoot = { x: first.N.x, y: inv.OUT.y };
	sheet.wire(inv.OUT, raFoot);
	sheet.wire(sheet.placeFrom(Ra, raFoot, 'up', { labels: 'left' }).pins[1], first.N);
	// Rz: down from the split, along the bottom, up into A2's summing node
	const laneY = second.N.y + 176;
	const rzEnd = series(sheet, Rz, run(sheet, split, 'down', laneY - split.y), 'right');
	sheet.route(rzEnd, { x: second.N.x, y: laneY }, second.N);
	return corner;
}

const DRAW = {
	mfb: drawMfb,
	mfbHp: drawMfb,
	sallenKey: drawSallenKey,
	sallenKeyHp: drawSallenKey,
	firstOrder: drawFirstOrder,
	firstOrderHp: drawFirstOrder,
	towThomas: (sheet, parts, p) => drawTowThomas(sheet, parts, p, false),
	towThomasHp: (sheet, parts, p) => drawTowThomas(sheet, parts, p, true),
	towThomasNotch: drawTowThomasNotch
};

/**
 * A chain of stages from `p`; `index` numbers the first stage as the
 * netlist does. Returns the chain's output point. Exported so another
 * tool can draw the same stages behind its own front end.
 */
export function drawChain(sheet, stages, p, index) {
	let at = p;
	stages.forEach((stage, k) => {
		const parts = stageElements(stage, index + k, 'in', 'out');
		const draw = DRAW[stage.topology];
		if (!draw) throw new Error(`no drawing for stage topology ${stage.topology}`);
		at = draw(sheet, parts, at);
	});
	return at;
}

/** The source V1 standing at x = 96 with its + pin tied up to the rail at y; returns the rail point. */
function source(sheet, V1, y) {
	// its long value reads on the left, clear of the first stage
	const src = sheet.place(V1, 96, y + 32, 'R0', { labels: 'left' });
	sheet.ground(src.pins[1]);
	return run(sheet, src.pins[0], 'up', 48);
}

/** The band-stop combiner: sum (inverting) or difference, right of both branches. */
function drawCombiner(sheet, E, lp, hp, mode) {
	const x0 = Math.max(lp.x, hp.x) + 48;
	sheet.wire(lp, { x: x0, y: lp.y });
	sheet.wire(hp, { x: x0, y: hp.y });
	if (mode === 'difference') {
		// - input from the low-pass row through RCL, + input from the
		// high-pass row through RCH with RCG to ground, RCF over the top
		const cmm = run(sheet, series(sheet, E.RCL, { x: x0, y: lp.y }, 'right'), 'right', 48);
		const inMinus = run(sheet, cmm, 'right', 96);
		const u = sheet.placeOpamp(E.UC, { x: inMinus.x + 64, y: inMinus.y + 16 });
		const cmpFoot = run(sheet, series(sheet, E.RCH, { x: x0, y: hp.y }, 'right'), 'right', 96);
		const cmpUp = { x: cmpFoot.x, y: u.pins[0].y };
		sheet.route(cmpFoot, cmpUp, u.pins[0]);
		shunt(sheet, E.RCG, run(sheet, cmpFoot, 'down', 16));
		const VO = run(sheet, u.pins[2], 'right', 64);
		overTop(sheet, E.RCF, cmm, VO, 112, 'right');
		return VO;
	}
	// sum: both branches into the summing node, RCF over the top
	const top = run(sheet, series(sheet, E.RCA, { x: x0, y: lp.y }, 'right'), 'right', 48);
	const bottom = run(sheet, series(sheet, E.RCB, { x: x0, y: hp.y }, 'right'), 'right', 48);
	const xs = Math.max(top.x, bottom.x);
	const S1 = { x: xs, y: lp.y };
	const S2 = { x: xs, y: hp.y };
	sheet.wire(top, S1);
	sheet.wire(bottom, S2);
	const mid = { x: xs, y: lp.y + 96 };
	sheet.route(S1, mid, S2);
	// far enough right that the + input's ground clears the column
	const inMinus = run(sheet, mid, 'right', 96);
	const u = sheet.placeOpamp(E.UC, { x: inMinus.x + 64, y: inMinus.y + 16 });
	groundInput(sheet, u.pins[0]);
	const VO = run(sheet, u.pins[2], 'right', 64);
	overTop(sheet, E.RCF, VO, S1, 112, 'left');
	return VO;
}

/**
 * The drawn schematic of a realized design. `elements` is buildElements'
 * list (for the source and the combiner parts), the stages come from
 * realizedStages exactly as the netlist numbers them.
 */
export function drawFilter({ elements, realizedStages, filterType, lpCount = 0, combinerMode = 'sum' }, { comments = [], directives = [], gbw = '3Meg', opamp = 'ideal' }) {
	const E = Object.fromEntries(elements.filter((e) => e.kind !== 'LABEL').map((e) => [e.name, e]));
	const sheet = createSheet({ gbw, opamp });
	const RAIL = 384;
	const vin = source(sheet, E.V1, RAIL);
	let vout;
	if (filterType === 'bandstop') {
		const lpStages = realizedStages.slice(0, lpCount);
		const hpStages = realizedStages.slice(lpCount);
		const split = run(sheet, vin, 'right', 48);
		const lpOut = drawChain(sheet, lpStages, split, 1);
		// the high-pass row goes under everything the low-pass row put below
		// its rail, far enough that its own feedback clears it
		const probe = createSheet({ gbw, opamp });
		const probeOut = drawChain(probe, hpStages, { x: split.x, y: RAIL }, 1 + lpStages.length);
		void probeOut;
		const above = RAIL - probe.bounds().minY;
		const row = Math.ceil((sheet.bounds().maxY + 64 + above) / 16) * 16;
		const hpStart = { x: split.x, y: row };
		sheet.wire(split, hpStart);
		const hpOut = drawChain(sheet, hpStages, hpStart, 1 + lpStages.length);
		vout = drawCombiner(sheet, E, lpOut, hpOut, combinerMode);
	} else {
		vout = drawChain(sheet, realizedStages, vin, 1);
	}
	sheet.label(vout, 'vout', 'right');
	sheet.notes({ comments, directives });
	return sheet.render();
}
