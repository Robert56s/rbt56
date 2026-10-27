import { createSheet, groundInput, hang, run, series } from '../spice/draw';
import { stageElements } from './stageElements';

/**
 * The filter drawn as an LTspice schematic, stage after stage along one
 * line, each stage the way a textbook draws it: an MFB or a Tow-Thomas
 * with its inverting input on top and its feedback over the top, a
 * Sallen-Key or a first-order section as a follower with its + input on
 * top. A band-stop built as two branches runs them on two rows from the
 * same input and joins them in the combiner on the right; a transformed
 * band-stop (structure 'cascade') is one line of notch stages like any
 * other filter, and a transformed band-pass one line of band-pass and
 * notch stages. Parts are joined by wires, never pin to pin, and every
 * label is horizontal; the check scripts audit the sheet for overlaps and
 * read it back against the netlist.
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

/** MFB low-pass, high-pass or band-pass: [series1, shunt, series2, outer, inner, U]. */
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

/**
 * Non-inverting amplifier: [R1 (- input to ground), R2 (- input to the
 * output), U]. The op-amp sits as a follower does, its + input on the
 * line; the - input's node drops under the body, R2 runs from it across
 * to the output's column and R1 hangs from it to ground.
 */
function drawNonInverting(sheet, [R1, R2, U], p) {
	const inPlus = run(sheet, p, 'right', 128);
	const u = sheet.placeOpamp(U, { x: inPlus.x + 64, y: inPlus.y + 16 }, { flip: true, labels: 'above' });
	const OUT = run(sheet, u.pins[2], 'right', 64);
	const inMinus = u.pins[1];
	const M = { x: inMinus.x - 64, y: inMinus.y + 96 };
	sheet.route(inMinus, { x: M.x, y: inMinus.y }, M);
	shunt(sheet, R1, M);
	const r2End = series(sheet, R2, M, 'right', { labels: 'below' });
	sheet.route(r2End, { x: OUT.x, y: M.y }, OUT);
	return run(sheet, OUT, 'right', 48);
}

/** Inverting amplifier: [R1 (input), R2 (feedback), U], an integrator's layout with R2 over the top. */
function drawInverting(sheet, [R1, R2, U], p) {
	return run(sheet, integrator(sheet, R1, [R2], U, p).OUT, 'right', 48);
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
 * (output after the first). The band-pass form is drawn as the high-pass,
 * its output after the first integrator, with R1 in place of Cin.
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

function drawBoctor(sheet, parts, p, hp = false) {
	const [C2, Rlink, C1, Rground1, Rfeedback, Rextra, Rinput, Rground2, U] = hp ? parts : [parts[0], parts[1], parts[2], parts[3], parts[5], parts[4], parts[6], parts[7], parts[8]];
	p = run(sheet, p, 'right', 64);
	const x = p.x, y = p.y;
	if (!hp) {
		const X = run(sheet, series(sheet, C2, run(sheet, p, 'right', 64), 'right'), 'right', 64);
		const P = run(sheet, run(sheet, series(sheet, Rlink, run(sheet, run(sheet, X, 'right', 32), 'right', 32), 'right'), 'right', 32), 'right', 32);
		const capEnd = series(sheet, C1, run(sheet, P, 'right', 64), 'right');
		const O = { x: capEnd.x + 128, y };
		sheet.wire(capEnd, O);
		const u = sheet.placeOpamp(U, { x: P.x + 64, y: y + 176 });
		sheet.route(P, {x:P.x-32,y:P.y}, {x:P.x-32,y:u.pins[1].y}, u.pins[1]);
		sheet.route(u.pins[2], { x: O.x, y: u.pins[2].y }, O);
		for (const [e,n] of [[Rground1,X],[Rextra,P]]) {
			const end = sheet.placeFrom(e,run(sheet,n,'up',48),'up',{labels:'left'}).pins[1];
			sheet.flag(run(sheet,end,'up',64),'0');
		}
		const tap = run(sheet, X, 'right', 32), top = { x: tap.x, y: y - 288 };
		sheet.wire(tap, top);
		const fb = series(sheet,Rfeedback,run(sheet,top,'right',48),'right');
		sheet.route(fb,{x:O.x,y:top.y},O);
		const M = { x: P.x - 64, y: y + 288 };
		const inputEnd = series(sheet,Rinput,run(sheet,{x,y:M.y},'right',128),'right');
		sheet.wire(p,{x,y:M.y}); sheet.wire(inputEnd,M);
		sheet.route(M,{x:M.x,y:u.pins[0].y},u.pins[0]);
		shunt(sheet,Rground2,M);
		return run(sheet,O,'right',64);
	}
	const X = run(sheet,series(sheet,C2,run(sheet,p,'right',64),'right'),'right',48);
	const M = run(sheet,series(sheet,Rlink,X,'right'),'right',64);
	const u = sheet.placeOpamp(U,{x:M.x+128,y:y+16});
	const O = run(sheet,u.pins[2],'right',96);
	// Main row into the upper, inverting input.
	sheet.wire(M,{x:M.x+32,y:M.y}); sheet.wire({x:M.x+32,y:M.y},u.pins[1]);
	const top = run(sheet,run(sheet,M,'right',32),'up',192);
	const fb = series(sheet,Rfeedback,run(sheet,top,'right',64),'right');
	sheet.route(fb,{x:O.x,y:top.y},O);
	const rg = sheet.placeFrom(Rground1,run(sheet,M,'up',48),'up',{labels:'left'}).pins[1]; sheet.flag(run(sheet,rg,'up',64),'0');
	const P = {x:M.x,y:y+192};
	const capEnd = series(sheet,C1,{x:x+128,y:P.y},'right');
	sheet.route(p,{x,y:P.y},{x:x+128,y:P.y}); sheet.wire(capEnd,P);
	sheet.route(P,{x:u.pins[0].x-32,y:P.y},{x:u.pins[0].x-32,y:u.pins[0].y},u.pins[0]);
	const r3End = series(sheet,Rinput,run(sheet,run(sheet,P,'right',32),'right',32),'right');
	sheet.route(r3End,{x:O.x,y:P.y},O);
	const bottom={x,y:y+320}; sheet.wire({x,y:P.y},bottom);
	const r1End=series(sheet,Rextra,run(sheet,bottom,'right',128),'right');
	const foot={x:P.x,y:bottom.y}; sheet.wire(r1End,foot); sheet.wire(foot,P); shunt(sheet,Rground2,foot);
	return run(sheet,O,'right',64);
}

/*
 * The narrow band-pass stages. An element list may hold an input
 * divider's Rb right after Ra (an R where the capacitor would be next),
 * and an RLC stage its output follower last (absent when the stage is
 * unbuffered and the gain stage after it is its buffer).
 */

/** [Ra, Rb or null, ...the rest] of a stage whose Rb is optional. */
function takeDivider(parts) {
	const [Ra, ...rest] = parts;
	const Rb = rest[0].kind === 'R' ? rest.shift() : null;
	return [Ra, Rb, rest];
}

/**
 * The RLC tank on the main line: Ra in, then C (and Rb) hanging to
 * ground. Returns the tap T on the line, right of the shunts, where the
 * simulated inductor hangs.
 */
function drawTank(sheet, Ra, Rb, C, p) {
	const P = run(sheet, series(sheet, Ra, p, 'right'), 'right', 48);
	shunt(sheet, C, P);
	let at = P;
	if (Rb) {
		at = run(sheet, at, 'right', 128);
		shunt(sheet, Rb, at);
	}
	return run(sheet, at, 'right', 128);
}

/**
 * The main line on past a block that hangs below it: to a follower whose
 * + input sits right of the block (column `past`), or, unbuffered, on to
 * that column alone.
 */
function pastBlock(sheet, T, past, Uo) {
	const inPlus = { x: Math.max(T.x + 128, past + 96), y: T.y };
	sheet.wire(T, inPlus);
	if (!Uo) return inPlus;
	return run(sheet, follower(sheet, Uo, inPlus), 'right', 48);
}

/**
 * RLC with a gyrator inductor: [Ra, (Rb), C, R1, Cg, R2, Ug, (Uo)]. The
 * tank on the main line; under it, from the tap, R1 on one row to the
 * gyrator follower's output, and Cg on the row below to its + input, R2
 * hanging from there to ground; then the output follower on the main
 * line past the gyrator.
 */
function drawRlcGyrator(sheet, parts, p) {
	const [Ra, Rb, [C, R1, Cg, R2, Ug, Uo]] = takeDivider(parts);
	const T = drawTank(sheet, Ra, Rb, C, p);
	const row1 = { x: T.x, y: T.y + 192 };
	const row2 = { x: T.x, y: row1.y + 160 };
	sheet.wire(T, row1);
	sheet.wire(row1, row2);
	const r1End = series(sheet, R1, row1, 'right');
	const X = run(sheet, series(sheet, Cg, row2, 'right'), 'right', 48);
	shunt(sheet, R2, X);
	const O = follower(sheet, Ug, run(sheet, X, 'right', 128));
	sheet.route(r1End, { x: O.x, y: row1.y }, O);
	return pastBlock(sheet, T, O.x, Uo);
}

/**
 * RLC with Antoniou's GIC: [Ra, (Rb), C, R1, R2, R3, Cg, R4, U1, U2, (Uo)].
 * The tank on the main line; under it, from the tap, the converter's
 * chain on one row (R1, A, R2, B, R3, D, Cg, E, R4 hanging to ground),
 * op-amp 2 above the row facing left (output to A, - from B, + from E),
 * op-amp 1 below it facing right (- from B, output to D, + fed from the
 * tap along a lane under the row); then the output follower on the main
 * line past the converter.
 */
function drawRlcGic(sheet, parts, p) {
	const [Ra, Rb, [C, R1, R2, R3, Cg, R4, U1, U2, Uo]] = takeDivider(parts);
	const T = drawTank(sheet, Ra, Rb, C, p);
	const row = { x: T.x, y: T.y + 256 };
	sheet.wire(T, row);
	const A = run(sheet, series(sheet, R1, row, 'right'), 'right', 48);
	const B = run(sheet, series(sheet, R2, A, 'right'), 'right', 48);
	const D = run(sheet, series(sheet, R3, B, 'right'), 'right', 48);
	const E = run(sheet, series(sheet, Cg, D, 'right'), 'right', 48);
	shunt(sheet, R4, E);
	// op-amp 2 above the row, facing left, its + input on top
	const u2 = sheet.placeOpamp(U2, { x: A.x + 32, y: row.y - 96 }, { mirror: true, flip: true });
	sheet.route(u2.pins[2], { x: A.x, y: u2.pins[2].y }, A);
	sheet.route(B, { x: B.x, y: u2.pins[1].y }, u2.pins[1]);
	sheet.route(E, { x: E.x, y: u2.pins[0].y }, u2.pins[0]);
	// op-amp 1 below the row, facing right, its - input on top
	const u1 = sheet.placeOpamp(U1, { x: D.x - 32, y: row.y + 96 });
	sheet.route(B, { x: B.x, y: u1.pins[1].y }, u1.pins[1]);
	sheet.route(u1.pins[2], { x: D.x, y: u1.pins[2].y }, D);
	sheet.route(row, { x: row.x, y: u1.pins[0].y }, u1.pins[0]);
	return pastBlock(sheet, T, E.x + 64, Uo);
}

/**
 * Sallen-Key band-pass: [Ra, (Rb), C1, C2, R2, R3, Rg, Rf, U]. Ra in to X
 * with C1 (and Rb) hanging, C2 on to the + input with R2 hanging, the
 * op-amp a non-inverting amplifier as drawNonInverting draws it, and R3
 * over the top from X to the output.
 */
function drawSallenKeyBp(sheet, parts, p) {
	const [Ra, Rb, [C1, C2, R2, R3, Rg, Rf, U]] = takeDivider(parts);
	const X = run(sheet, series(sheet, Ra, p, 'right'), 'right', 48);
	shunt(sheet, C1, X);
	let at = X;
	if (Rb) {
		at = run(sheet, at, 'right', 128);
		shunt(sheet, Rb, at);
	}
	const P = run(sheet, series(sheet, C2, at, 'right'), 'right', 48);
	shunt(sheet, R2, P);
	// far enough on that the - input's node clears R2's labels
	const inPlus = run(sheet, P, 'right', 192);
	const u = sheet.placeOpamp(U, { x: inPlus.x + 64, y: inPlus.y + 16 }, { flip: true, labels: 'above' });
	const OUT = run(sheet, u.pins[2], 'right', 64);
	const inMinus = u.pins[1];
	const M = { x: inMinus.x - 64, y: inMinus.y + 96 };
	sheet.route(inMinus, { x: M.x, y: inMinus.y }, M);
	shunt(sheet, Rg, M);
	const rfEnd = series(sheet, Rf, M, 'right', { labels: 'below' });
	sheet.route(rfEnd, { x: OUT.x, y: M.y }, OUT);
	overTop(sheet, R3, X, OUT, 128, 'right');
	return run(sheet, OUT, 'right', 48);
}

/**
 * State-variable band-pass: [R3, R4, R7, R5, R6, Uc, R1, C1, Ua, R2, C2,
 * Ub]. On the main line the summer A3 (R3 in, R7 over the top, its +
 * input on R5 and R6), then the integrator A1 whose output is the stage
 * output; the main line runs on past the rest. A2 sits on a row below,
 * fed from the output, and its output returns along the bottom and up
 * through R4 into A3's summing node. R6 hangs from A3's + input and R5
 * runs from there along a lane under A3 and A1 up to the output.
 */
function drawKhnBp(sheet, parts, p) {
	const [R3, R4, R7, R5, R6, Uc, R1, C1, Ua, R2, C2, Ub] = parts;
	// A3, the summer: integrator()'s layout with its + input on R5 and R6
	const N = run(sheet, series(sheet, R3, p, 'right'), 'right', 48);
	const inMinus = run(sheet, N, 'right', 96);
	const u3 = sheet.placeOpamp(Uc, { x: inMinus.x + 64, y: inMinus.y + 16 });
	const H = run(sheet, u3.pins[2], 'right', 64);
	const rung = { x: N.x, y: N.y - 112 };
	sheet.wire(N, rung);
	sheet.wire(H, { x: H.x, y: rung.y });
	const r7End = series(sheet, R7, rung, 'right', { gap: Math.round((H.x - N.x - 80) / 32) * 16 });
	sheet.wire(r7End, { x: H.x, y: rung.y });
	const P = run(sheet, u3.pins[0], 'left', 32);
	shunt(sheet, R6, P);
	// A1, the integrator from H: its output is the stage output
	const first = integrator(sheet, R1, [C1], Ua, H);
	const BP = first.OUT;
	const lane = { x: P.x - 32, y: P.y + 176 };
	sheet.route(P, { x: lane.x, y: P.y }, lane);
	const r5End = series(sheet, R5, lane, 'right');
	sheet.route(r5End, { x: BP.x, y: lane.y }, BP);
	// A2 on a row below, right of the lane's rise, fed from the output
	const loopFrom = run(sheet, BP, 'right', 48);
	const down = { x: loopFrom.x, y: p.y + 336 };
	sheet.wire(loopFrom, down);
	const second = integrator(sheet, R2, [C2], Ub, down);
	// back along the bottom to under A3's summing node, up through R4
	const bottom = second.OUT.y + 176;
	const foot = { x: N.x, y: bottom };
	sheet.route(second.OUT, { x: second.OUT.x, y: bottom }, foot);
	sheet.wire(sheet.placeFrom(R4, foot, 'up', { labels: 'left' }).pins[1], N);
	const cont = { x: second.OUT.x + 96, y: loopFrom.y };
	sheet.wire(loopFrom, cont);
	return cont;
}

const DRAW = {
	boctor: (sheet, parts, p) => drawBoctor(sheet, parts, p),
	boctorHp: (sheet, parts, p) => drawBoctor(sheet, parts, p, true),
	mfb: drawMfb,
	mfbHp: drawMfb,
	mfbBp: drawMfb,
	sallenKey: drawSallenKey,
	sallenKeyHp: drawSallenKey,
	firstOrder: drawFirstOrder,
	firstOrderHp: drawFirstOrder,
	towThomas: (sheet, parts, p) => drawTowThomas(sheet, parts, p, false),
	towThomasHp: (sheet, parts, p) => drawTowThomas(sheet, parts, p, true),
	towThomasBp: (sheet, parts, p) => drawTowThomas(sheet, parts, p, true),
	towThomasNotch: drawTowThomasNotch,
	gainInv: drawInverting,
	gainDivider: drawFirstOrder,
	gainNonInv: drawNonInverting,
	rlcGyrator: drawRlcGyrator,
	rlcGic: drawRlcGic,
	sallenKeyBp: drawSallenKeyBp,
	khnBp: drawKhnBp
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
 * realizedStages exactly as the netlist numbers them. `structure` is
 * buildElements' own: 'cascade' draws a band-stop as one chain.
 */
export function drawFilter({ elements, realizedStages, filterType, method, structure = method === 'transformed' ? 'cascade' : 'parallel', lpCount = 0, combinerMode = 'sum' }, { comments = [], directives = [], gbw = '3Meg', opamp = 'ideal' }) {
	const E = Object.fromEntries(elements.filter((e) => e.kind !== 'LABEL').map((e) => [e.name, e]));
	const sheet = createSheet({ gbw, opamp });
	const RAIL = 384;
	const vin = source(sheet, E.V1, RAIL);
	let vout;
	if (filterType === 'bandstop' && structure !== 'cascade') {
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
