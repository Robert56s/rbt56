/**
 * The elements of every realized stage, format-independent: the netlist
 * (spice.js), the drawn schematic (sheet.js) and the nodal solver
 * (nodal.js) all read them. No imports, so the downloadable script can
 * carry it as it is.
 */

/**
 * The elements of one realized stage, wired from `nIn` to `nOut`. `i` makes
 * every internal node and reference designator unique. An op-amp's nodes
 * are always listed [non-inverting, inverting, output]; each renderer maps
 * that onto its own convention.
 */
export function stageElements(stage, i, nIn, nOut) {
	const c = stage.components;
	const n = (suffix) => `s${i}${suffix}`;
	const R = (tag, a, b, value) => ({ kind: 'R', name: `R${tag}${i}`, nodes: [a, b], value });
	const C = (tag, a, b, value) => ({ kind: 'C', name: `C${tag}${i}`, nodes: [a, b], value });
	const op = (tag, p, m, out) => ({ kind: 'OP', name: `U${tag}${i}`, nodes: [p, m, out] });

	switch (stage.topology) {
		case 'boctor': {
			const X = n('x'), M = n('m'), P = n('p');
			return [C('2', nIn, X, c.C2), R('6', X, M, c.R6), C('1', M, nOut, c.C1), R('2', X, '0', c.R2), R('1', M, '0', c.R1), R('4', X, nOut, c.R4), R('3', nIn, P, c.R3), R('5', P, '0', c.R5), op('', P, M, nOut)];
		}
		case 'boctorHp': {
			const X = n('x'), M = n('m'), P = n('p');
			return [C('2', nIn, X, c.C2), R('2', X, M, c.R2), C('1', nIn, P, c.C1), R('4', M, '0', c.R4), R('5', M, nOut, c.R5), R('1', nIn, P, c.R1), R('3', P, nOut, c.R3), R('6', P, '0', c.R6), op('', P, M, nOut)];
		}
		case 'mfb': {
			// R1 in to summing node A, C1 A to ground, R2 A to the virtual
			// ground, R3 feedback to A, C2 feedback from the virtual ground.
			const A = n('a');
			const M = n('n');
			return [R('1', nIn, A, c.R1), C('1', A, '0', c.C1), R('2', A, M, c.R2), R('3', nOut, A, c.R3), C('2', M, nOut, c.C2), op('', '0', M, nOut)];
		}
		case 'mfbHp': {
			const A = n('a');
			const M = n('n');
			return [C('1', nIn, A, c.C1), R('1', A, '0', c.R1), C('2', A, M, c.C2), C('3', nOut, A, c.C3), R('2', M, nOut, c.R2), op('', '0', M, nOut)];
		}
		case 'sallenKey': {
			// two equal R to the + input, Cbottom to ground, Ctop from the
			// output back to the R-R junction, op-amp as a follower
			const X = n('x');
			const P = n('p');
			return [R('1', nIn, X, c.R1), R('2', X, P, c.R2), C('b', P, '0', c.Cbottom), C('t', nOut, X, c.Ctop), op('', P, nOut, nOut)];
		}
		case 'sallenKeyHp': {
			const X = n('x');
			const P = n('p');
			return [C('1', nIn, X, c.C1), C('2', X, P, c.C2), R('b', P, '0', c.Rbottom), R('t', nOut, X, c.Rtop), op('', P, nOut, nOut)];
		}
		case 'towThomas': {
			// A1 damped integrator (output = band-pass), A2 integrator
			// (output = low-pass, the stage output), A3 unity inverter
			const N1 = n('n1');
			const N2 = n('n2');
			const B = n('bp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				R('1', nIn, N1, c.R1),
				R('a', N3, N1, c.Ra),
				C('1', N1, B, c.C1),
				R('d', N1, B, c.Rd),
				op('a', '0', N1, B),
				R('b', B, N2, c.Rb),
				C('2', N2, nOut, c.C2),
				op('b', '0', N2, nOut),
				R('r1', nOut, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'towThomasHp': {
			// same loop, input through Cin: A1's output is the high-pass
			const N1 = n('n1');
			const N2 = n('n2');
			const L = n('lp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				C('in', nIn, N1, c.Cin),
				R('a', N3, N1, c.Ra),
				C('1', N1, nOut, c.C1),
				R('d', N1, nOut, c.Rd),
				op('a', '0', N1, nOut),
				R('b', nOut, N2, c.Rb),
				C('2', N2, L, c.C2),
				op('b', '0', N2, L),
				R('r1', L, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'towThomasNotch': {
			// the high-pass loop plus Rz from the input into A2: A1's output is the notch
			const N1 = n('n1');
			const N2 = n('n2');
			const B = n('bp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				C('in', nIn, N1, c.Cin),
				R('z', nIn, N2, c.Rz),
				R('a', N3, N1, c.Ra),
				C('1', N1, nOut, c.C1),
				R('d', N1, nOut, c.Rd),
				op('a', '0', N1, nOut),
				R('b', nOut, N2, c.Rb),
				C('2', N2, B, c.C2),
				op('b', '0', N2, B),
				R('r1', B, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'mfbBp': {
			// Delyiannis-Friend: R1 in to A and R2 A to ground (the input
			// attenuator), C2 A to the virtual ground, C1 output back to A, R3
			// output back to the virtual ground. The order of mfbHp, so drawMfb
			// draws it.
			const A = n('a');
			const M = n('n');
			return [R('1', nIn, A, c.R1), R('2', A, '0', c.R2), C('2', A, M, c.C2), C('1', nOut, A, c.C1), R('3', M, nOut, c.R3), op('', '0', M, nOut)];
		}
		case 'towThomasBp': {
			// the low-pass loop with its output taken at A1 (the band-pass):
			// towThomasHp with R1 in place of Cin
			const N1 = n('n1');
			const N2 = n('n2');
			const L = n('lp');
			const N4 = n('n4');
			const N3 = n('inv');
			return [
				R('1', nIn, N1, c.R1),
				R('a', N3, N1, c.Ra),
				C('1', N1, nOut, c.C1),
				R('d', N1, nOut, c.Rd),
				op('a', '0', N1, nOut),
				R('b', nOut, N2, c.Rb),
				C('2', N2, L, c.C2),
				op('b', '0', N2, L),
				R('r1', L, N4, c.r),
				R('r2', N4, N3, c.r),
				op('c', '0', N4, N3)
			];
		}
		case 'firstOrder': {
			// passive RC then the unity-gain buffer the schematic shows
			const A = n('a');
			return [R('', nIn, A, c.R), C('', A, '0', c.C), op('', A, nOut, nOut)];
		}
		case 'firstOrderHp': {
			const A = n('a');
			return [C('', nIn, A, c.C), R('', A, '0', c.R), op('', A, nOut, nOut)];
		}
		// The gain stages of a filter designed by hand (handDesign.js), each
		// R1 and R2 as the method names them:
		case 'gainInv': {
			// inverting amplifier, -R2/R1: R1 in to the virtual ground, R2 back from the output
			const M = n('n');
			return [R('1', nIn, M, c.R1), R('2', M, nOut, c.R2), op('', '0', M, nOut)];
		}
		case 'gainDivider': {
			// R2 in series, R1 to ground, then a follower: R1/(R1 + R2), the
			// order of a first-order stage, so drawFirstOrder draws it
			const A = n('a');
			return [R('2', nIn, A, c.R2), R('1', A, '0', c.R1), op('', A, nOut, nOut)];
		}
		case 'gainNonInv': {
			// non-inverting amplifier, 1 + R2/R1: R1 from the - input to ground, R2 back from the output
			const M = n('n');
			return [R('1', M, '0', c.R1), R('2', M, nOut, c.R2), op('', nIn, M, nOut)];
		}
		// The narrow band-pass stages (rlcBandPass.js, sallenKeyBandPass.js,
		// khnBandPass.js). An RLC stage's output node P is the tank itself,
		// a high impedance: a follower takes it to the next stage, unless the
		// stage is built unbuffered (buffered false), its next stage then a
		// non-inverting amplifier whose + input is P.
		case 'rlcGyrator': {
			// Ra in to P (Rb from P to ground for a divider), C from P to
			// ground, and the gyrator for L: R1 from P to the follower's
			// output O, Cg from P to its + input X, R2 from X to ground
			const buffered = stage.buffered !== false;
			const P = buffered ? n('p') : nOut;
			const X = n('x');
			const O = n('o');
			return [
				R('a', nIn, P, c.Ra),
				...(c.Rb ? [R('b', P, '0', c.Rb)] : []),
				C('', P, '0', c.C),
				R('1', P, O, c.R1),
				C('g', P, X, c.Cg),
				R('2', X, '0', c.R2),
				op('g', X, O, O),
				...(buffered ? [op('', P, nOut, nOut)] : [])
			];
		}
		case 'rlcGic': {
			// Ra in to P (Rb for a divider), C from P to ground, and Antoniou's
			// converter for L: P, R1, A, R2, B, R3, D, Cg, E, R4 to ground,
			// op-amp 1 (+ on P, - on B, out on D), op-amp 2 (+ on E, - on B, out on A)
			const buffered = stage.buffered !== false;
			const P = buffered ? n('p') : nOut;
			const A = n('a');
			const B = n('b');
			const D = n('d');
			const E = n('e');
			return [
				R('a', nIn, P, c.Ra),
				...(c.Rb ? [R('b', P, '0', c.Rb)] : []),
				C('', P, '0', c.C),
				R('1', P, A, c.R1),
				R('2', A, B, c.R2),
				R('3', B, D, c.R3),
				C('g', D, E, c.Cg),
				R('4', E, '0', c.R4),
				op('1', P, B, D),
				op('2', E, B, A),
				...(buffered ? [op('', P, nOut, nOut)] : [])
			];
		}
		case 'sallenKeyBp': {
			// Ra in to X (Rb from X to ground for a divider), C1 from X to
			// ground, C2 from X to the + input P, R2 from P to ground, R3 from
			// X to the output; the op-amp amplifies by 1 + Rf/Rg
			const X = n('x');
			const P = n('p');
			const M = n('n');
			return [
				R('a', nIn, X, c.Ra),
				...(c.Rb ? [R('b', X, '0', c.Rb)] : []),
				C('1', X, '0', c.C1),
				C('2', X, P, c.C2),
				R('2', P, '0', c.R2),
				R('3', X, nOut, c.R3),
				R('g', M, '0', c.Rg),
				R('f', M, nOut, c.Rf),
				op('', P, M, nOut)
			];
		}
		case 'khnBp': {
			// A3 the summer (its output the high-pass H), A1 an integrator from
			// H (its output the band-pass, the stage output), A2 an integrator
			// from the band-pass (its output the low-pass L)
			const H = n('hp');
			const L = n('lp');
			const M = n('m');
			const P = n('p');
			const N1 = n('n1');
			const N2 = n('n2');
			return [
				R('3', nIn, M, c.R3),
				R('4', L, M, c.R4),
				R('7', M, H, c.R7),
				R('5', P, nOut, c.R5),
				R('6', P, '0', c.R6),
				op('c', P, M, H),
				R('1', H, N1, c.R1),
				C('1', N1, nOut, c.C1),
				op('a', '0', N1, nOut),
				R('2', nOut, N2, c.R2),
				C('2', N2, L, c.C2),
				op('b', '0', N2, L)
			];
		}
		default:
			return [];
	}
}
