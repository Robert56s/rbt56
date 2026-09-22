/**
 * The oscillator loop with a real op-amp in it.
 *
 * The textbook design treats the amplifier as a pure gain. A real op-amp
 * is a single pole, open-loop A(s) = wt / s with wt = 2 pi GBW, so every
 * stage built on it lags a little at the oscillation frequency. The loop
 * can only oscillate where its total phase is zero, so the RC network has
 * to make up that lag by moving off its own zero-phase point: the
 * frequency shifts, and the network's attenuation there is no longer the
 * textbook figure, so the gain needed changes too. LTspice shows both
 * effects plainly (a Wien bridge designed for 55 kHz with a 3 MHz op-amp
 * runs at 49 kHz), and a closed-form fix is not good enough: in the
 * ladder oscillators the network is part of the amplifier's own input
 * impedance, so the amplifier's lag depends on the network and the two
 * cannot be separated. This module therefore writes each loop as its
 * exact nodal system, with the op-amp as its single-pole model, and
 * solves that:
 *
 *   openLoop     L(s), the loop opened where the amplifier output feeds
 *                the network, the amplifier's own feedback left intact
 *   zeroPhase    the real frequency where the loop returns in phase, and
 *                how much larger or smaller than 1 the signal comes back
 *   balance      the gain at which it comes back exactly as large
 *   pole         the complex natural frequency for a given gain: its real
 *                part says whether the amplitude grows (starts) or dies
 *   retune       the RC product that puts the zero-phase frequency on
 *                target
 *
 * Everything is in terms of p = s R C, so the same code serves every
 * frequency.
 */

export const TWO_PI = 2 * Math.PI;

/* ------------------------------------------------------ complex numbers */

const c = (re, im = 0) => ({ re, im });
const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a, b) => {
	const d = b.re * b.re + b.im * b.im;
	return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const scale = (a, k) => ({ re: a.re * k, im: a.im * k });
const abs = (a) => Math.hypot(a.re, a.im);
const ZERO = c(0);
const ONE = c(1);

export const complex = { c, add, sub, mul, div, scale, abs };

/** Solves M x = b for a small dense complex system (Gaussian elimination with pivoting). */
function solveLinear(M, b) {
	const n = b.length;
	const A = M.map((row, i) => [...row, b[i]]);
	for (let col = 0; col < n; col++) {
		let piv = col;
		for (let r = col + 1; r < n; r++) if (abs(A[r][col]) > abs(A[piv][col])) piv = r;
		[A[col], A[piv]] = [A[piv], A[col]];
		for (let r = col + 1; r < n; r++) {
			const f = div(A[r][col], A[col][col]);
			for (let k = col; k <= n; k++) A[r][k] = sub(A[r][k], mul(f, A[col][k]));
		}
	}
	const x = Array.from({ length: n }, () => ZERO);
	for (let r = n - 1; r >= 0; r--) {
		let s = A[r][n];
		for (let k = r + 1; k < n; k++) s = sub(s, mul(A[r][k], x[k]));
		x[r] = div(s, A[r][r]);
	}
	return x;
}

/** Determinant of a small dense complex matrix. */
function determinant(M) {
	const n = M.length;
	const A = M.map((row) => [...row]);
	let det = ONE;
	for (let col = 0; col < n; col++) {
		let piv = col;
		for (let r = col + 1; r < n; r++) if (abs(A[r][col]) > abs(A[piv][col])) piv = r;
		if (abs(A[piv][col]) === 0) return ZERO;
		if (piv !== col) {
			[A[col], A[piv]] = [A[piv], A[col]];
			det = scale(det, -1);
		}
		det = mul(det, A[col][col]);
		for (let r = col + 1; r < n; r++) {
			const f = div(A[r][col], A[col][col]);
			for (let k = col; k < n; k++) A[r][k] = sub(A[r][k], mul(f, A[col][k]));
		}
	}
	return det;
}

/* ------------------------------------------------------------ networks */

/**
 * Transfer of a ladder of n high-pass sections (series C, shunt R) at
 * p = s R C, driven by a voltage source, the last shunt resistor being
 * the amplifier's own input resistor whose far end is a perfect virtual
 * ground. This is the ideal-amplifier view, used for the textbook
 * constants; the nodal systems below keep the same ladder but let the
 * virtual ground be as imperfect as the op-amp makes it.
 */
export function ladderTransfer(n, p, { buffered = false, loadRatio = Infinity } = {}) {
	const yl = Number.isFinite(loadRatio) ? 1 / loadRatio : 0;
	if (buffered) {
		let beta = ONE;
		for (let k = 1; k <= n; k++) beta = mul(beta, div(p, add(c(1 + (k === n ? yl : 0)), p)));
		return beta;
	}
	const A = Array.from({ length: n }, () => Array.from({ length: n }, () => ZERO));
	const b = Array.from({ length: n }, () => ZERO);
	for (let k = 0; k < n; k++) {
		const last = k === n - 1;
		A[k][k] = add(c(1 + (last ? yl : 0)), scale(p, last ? 1 : 2));
		if (k > 0) A[k][k - 1] = scale(p, -1);
		if (!last) A[k][k + 1] = scale(p, -1);
	}
	b[0] = p;
	return solveLinear(A, b)[n - 1];
}

/** The Wien network, series R-C into parallel R-C: 1 / (3 + p + 1/p). */
export function wienTransfer(p) {
	return div(ONE, add(c(3), add(p, div(ONE, p))));
}

/* ------------------------------------------------------ nodal systems */

/**
 * Admittance of a feedback string of total resistance rf, normalized to
 * the reference resistance rRef: Rf1 = (1 - f2) rf in series with Rf2 =
 * f2 rf, with the limiter diodes' capacitance cd across Rf2. The diodes
 * are off, but their junction capacitance is not: 8 pF across a 50 k
 * Rf2 is 8 degrees of lag at 55 kHz, enough to stop a ladder oscillator.
 */
function feedbackAdmittance(s, rf, rRef, { f2 = 0, cd = 0 } = {}) {
	if (!(f2 > 0) || !(cd > 0)) return c(rRef / rf);
	const rf1 = (1 - f2) * rf;
	const rf2 = f2 * rf;
	const zf2 = div(c(rf2), add(ONE, scale(s, rf2 * cd)));
	return div(c(rRef), add(c(rf1), zf2));
}

/**
 * Each loop as a homogeneous linear system M(s) x = 0 in its node
 * voltages, every conductance in units of 1/R so that p = s R C. The
 * op-amp row is its single-pole model, vout = (wt / s) (v+ - v-),
 * written as (s / wt) vout - v+ + v- = 0. Returns { M, out, plus, minus,
 * cut, back }: the output node's index, the op-amp input nodes (null when
 * grounded), the matrix entry through which the output drives the
 * network (where the loop is opened), and the node that comes back.
 *
 *   wien       nodes [ws, wp, vm, vout];  gain = 1 + Rf/Rg
 *   ladder     nodes [v1 .. v(n-1), vlast, vm, vout];  gain = Rf/R, the
 *              last shunt resistor being R itself; buffered puts a
 *              unity follower F(s) = 1 / (1 + s/wt) after every section
 *              but the last
 *   Both take optional rAbs (Rg, or R for a ladder, in ohms), f2 (the
 *   fraction of Rf that the diodes sit across) and cd (their capacitance)
 *   so the limiter's capacitance is in the loop.
 *   quadrature nodes [vsin, vcos, vinv]: each op-amp's inverting input
 *              is eliminated analytically because its input network is
 *              purely resistive; rho = R / Rn is the start-up feedback
 *              from the inverter output into the second integrator
 */
export function nodalSystem(kind, s, params) {
	const { rc, wt } = params;
	const p = scale(s, rc);
	const invA = scale(s, 1 / wt);
	if (kind === 'wien') {
		const g = params.gain;
		// the feedback string, as an admittance in units of 1/Rg: Rf1 in
		// series with Rf2, the diodes' capacitance across Rf2
		const y = feedbackAdmittance(s, (g - 1) * (params.rAbs ?? 1), params.rAbs ?? 1, params);
		const M = [
			[scale(add(ONE, p), -1), p, ZERO, ONE], // node ws
			[p, scale(add(ONE, scale(p, 2)), -1), ZERO, ZERO], // node wp
			[ZERO, ZERO, scale(add(ONE, y), -1), y], // node vm: (vout - vm) y - vm = 0
			[ZERO, c(-1), ONE, invA] // op-amp
		];
		// the loop is opened where the output feeds the series arm (row ws)
		return { M, out: 3, plus: 1, minus: 2, cut: { row: 0, col: 3 }, back: 3 };
	}
	if (kind === 'ladder') {
		const { n, buffered = false, gain: g } = params;
		const F = buffered ? div(ONE, add(ONE, invA)) : ONE;
		const size = n + 2; // v1..v(n-1), vlast, vm, vout
		const iLast = n - 1;
		const iM = n;
		const iOut = n + 1;
		const M = Array.from({ length: size }, () => Array.from({ length: size }, () => ZERO));
		for (let k = 0; k < n - 1; k++) {
			// node k+1: C from its source (vout for the first, the previous
			// node through a follower when buffered), shunt R, and, when
			// unbuffered, the next capacitor loading it
			const src = k === 0 ? iOut : k - 1;
			M[k][src] = k === 0 ? p : mul(p, F);
			M[k][k] = buffered ? scale(add(ONE, p), -1) : scale(add(ONE, scale(p, 2)), -1);
			if (!buffered) M[k][k + 1] = p;
		}
		// last node: series C from the previous node (or vout for n = 1),
		// R to the inverting input
		const prev = n - 2 >= 0 ? n - 2 : iOut;
		M[iLast][prev] = n - 2 >= 0 && buffered ? mul(p, F) : p;
		M[iLast][iLast] = scale(add(ONE, p), -1);
		M[iLast][iM] = ONE;
		// inverting input: R from vlast, the feedback string from vout
		const y = feedbackAdmittance(s, g * (params.rAbs ?? 1), params.rAbs ?? 1, params);
		M[iM][iLast] = ONE;
		M[iM][iM] = scale(add(ONE, y), -1);
		M[iM][iOut] = y;
		// op-amp, + input grounded
		M[iOut][iM] = ONE;
		M[iOut][iOut] = invA;
		// the loop is opened where the output feeds the first capacitor
		return { M, out: iOut, plus: null, minus: iM, cut: { row: 0, col: iOut }, back: iOut };
	}
	if (kind === 'quadrature') {
		const rho = params.rho ?? 0;
		const M = [
			[add(mul(add(ONE, p), invA), p), ZERO, ONE],
			[ONE, add(mul(add(c(1 + rho), p), invA), p), c(rho)],
			[ZERO, ONE, add(ONE, scale(invA, 2))]
		];
		// the loop is opened where the inverter output feeds integrator 1
		return { M, out: 2, plus: null, minus: null, cut: { row: 0, col: 2 }, back: 2 };
	}
	throw new Error(`unknown loop kind ${kind}`);
}

/* ---------------------------------------------------------- loop gain */

/**
 * L(s): the loop opened where the amplifier output feeds the network,
 * with the amplifier's own feedback left intact. A unit signal is
 * injected into the network's input and the amplifier output it produces
 * is what comes back. This is exactly the measurement an AC analysis
 * makes on the open loop, and its zero-phase frequency is where the
 * closed loop oscillates.
 */
export function openLoop(kind, s, params) {
	const { M, cut, back } = nodalSystem(kind, s, params);
	const n = M.length;
	const rows = M.map((r) => [...r]);
	const b = Array.from({ length: n }, () => ZERO);
	// the entry that carried the output into the network now carries the
	// injected unit signal instead: M[row][col] * 1 moves to the right side
	b[cut.row] = scale(rows[cut.row][cut.col], -1);
	rows[cut.row][cut.col] = ZERO;
	const x = solveLinear(rows, b);
	return x[back];
}

/**
 * The real frequency near omega0 where the loop comes back in phase
 * (Im L = 0 with Re L > 0), and the magnitude it comes back with.
 * Returns { omega, magnitude, converged }.
 */
export function zeroPhase(kind, params, { omega0 }) {
	const im = (w) => openLoop(kind, c(0, w), params).im;
	let w = omega0;
	let converged = false;
	for (let i = 0; i < 80; i++) {
		const f = im(w);
		const dw = w * 1e-6;
		const d = (im(w + dw) - f) / dw;
		if (!Number.isFinite(d) || d === 0) break;
		let step = -f / d;
		const lim = 0.25 * w;
		step = Math.max(-lim, Math.min(lim, step));
		w += step;
		if (!(w > 0)) break;
		if (Math.abs(step) < 1e-10 * w) {
			converged = true;
			break;
		}
	}
	const L = openLoop(kind, c(0, w), params);
	return { omega: w, magnitude: L.re > 0 ? abs(L) : -abs(L), converged: converged && L.re > 0 };
}

/**
 * The gain at which the loop just sustains itself: iterate the gain by
 * the magnitude the loop returns at its zero-phase frequency until it
 * returns exactly 1. Returns { omega, gain, converged }.
 */
export function solveBalance(kind, params, { omega0, gain0 }) {
	let g = gain0;
	let last = null;
	for (let i = 0; i < 40; i++) {
		last = zeroPhase(kind, { ...params, gain: g }, { omega0: last ? last.omega : omega0 });
		if (!last.converged || !(last.magnitude > 0)) return { omega: last.omega, gain: g, converged: false };
		const next = g / last.magnitude;
		const done = Math.abs(next / g - 1) < 1e-9;
		g = next;
		if (done) return { omega: last.omega, gain: g, converged: true };
	}
	return { omega: last.omega, gain: g, converged: false };
}

/**
 * The complex natural frequency of the loop for a given gain: the s
 * nearest to j omega0 where det M(s) = 0. sigma > 0 means the amplitude
 * grows. Returns { sigma, omega, growthPerCycle, converged }.
 */
export function solvePole(kind, params, { omega0 }) {
	const F = (s) => determinant(nodalSystem(kind, s, params).M);
	let s = c(0, omega0);
	let converged = false;
	for (let i = 0; i < 80; i++) {
		const f = F(s);
		// complex derivative from a step along j: dF/ds = (F(s + jh) - F(s)) / (jh)
		const h = c(0, omega0 * 1e-6);
		const dFds = div(sub(F(add(s, h)), f), h);
		if (abs(dFds) === 0) break;
		let step = div(f, dFds);
		const lim = 0.25 * omega0;
		if (abs(step) > lim) step = scale(step, lim / abs(step));
		const next = sub(s, step);
		if (!Number.isFinite(next.re) || !Number.isFinite(next.im)) break;
		s = next;
		if (abs(step) < 1e-9 * omega0) {
			converged = true;
			break;
		}
	}
	const growthPerCycle = Math.exp((TWO_PI * s.re) / Math.abs(s.im)) - 1;
	return { sigma: s.re, omega: Math.abs(s.im), growthPerCycle, converged: converged && s.im !== 0 };
}

/**
 * The R C product that puts the loop's zero-phase frequency (at the gain
 * given, which for a diode-limited loop is the start gain, since the
 * diodes are off for most of every cycle) on the target. The frequency
 * scales almost exactly as 1 / RC and the lag is evaluated at the target
 * each round, so a few rounds settle it. Returns { rc, omega, magnitude,
 * converged }.
 */
export function retune(kind, params, { fTarget, k }) {
	const wTarget = TWO_PI * fTarget;
	let rc = k / wTarget;
	let last = null;
	for (let i = 0; i < 16; i++) {
		last = zeroPhase(kind, { ...params, rc }, { omega0: k / rc });
		if (!last.converged) return { rc, omega: last.omega, magnitude: last.magnitude, converged: false };
		const ratio = last.omega / wTarget;
		rc *= ratio;
		if (Math.abs(ratio - 1) < 1e-8) break;
	}
	return { rc, omega: last.omega, magnitude: last.magnitude, converged: true };
}

/**
 * Same for the quadrature loop, whose frequency is its pole's.
 * Returns { rc, omega, sigma, growthPerCycle, converged }.
 */
export function retuneQuadrature(params, { fTarget }) {
	const wTarget = TWO_PI * fTarget;
	let rc = 1 / wTarget;
	let pole = null;
	for (let i = 0; i < 16; i++) {
		pole = solvePole('quadrature', { ...params, rc }, { omega0: 1 / rc });
		if (!pole.converged) return { rc, ...pole, converged: false };
		const ratio = pole.omega / wTarget;
		rc *= ratio;
		if (Math.abs(ratio - 1) < 1e-8) break;
	}
	return { rc, ...pole, converged: true };
}

/** The lag of a stage of noise gain N at frequency f: atan(f N / GBW), in degrees. */
export function stageLagDeg(f, noiseGain, gbw) {
	return (180 / Math.PI) * Math.atan((f * noiseGain) / gbw);
}
