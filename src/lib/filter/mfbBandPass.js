import { polyRoots } from './approximations';
import { SERIES, anyPairAllowed, capacitorCandidates, pairAllowed, pairedResistor, seriesValues, smallCapPenalty } from './eseries';

/**
 * Multiple-feedback band-pass (Delyiannis-Friend) with an input
 * attenuator: R1 from the input to node A, R2 from A to ground, C2 from A
 * to the inverting input M, C1 from the output back to A, R3 from M to the
 * output, + input grounded. KCL at M (a virtual ground) gives
 * V_A = -V_out / (s C2 R3), and KCL at A then gives
 *
 *   H(s) = -(s / (R1 C1)) / (s^2 + s (C1 + C2)/(R3 C1 C2) + (1/R1 + 1/R2)/(R3 C1 C2))
 *   omega0^2  = (1/R1 + 1/R2) / (R3 C1 C2)
 *   omega0/Q  = (C1 + C2) / (R3 C1 C2)
 *   H0 = H(j omega0) = -R3 C2 / (R1 (C1 + C2))      (-R3 / (2 R1) for C1 = C2)
 *
 * R3 alone (with the capacitors) sets the bandwidth, R1 the gain, and R2
 * only moves omega0. For a target omega0, Q and gain |H0|:
 *   R3 = Q (C1 + C2) / (omega0 C1 C2)
 *   R1 = Q / (|H0| omega0 C1)
 *   1/R2 = (omega0/Q) (Q^2 (C1 + C2) - |H0| C1)
 * so the gain has a ceiling, |H0| < Q^2 (1 + C2/C1), where R2 runs off to
 * infinity. With equal capacitors that is 2 Q^2, so a stage with Q under
 * 0.707 reaches gain 1 only with C2 larger than C1.
 * The op-amp works hardest at omega0: its noise gain there is
 * 1 + Q^2 (1 + C2/C1), so its gain-bandwidth must sit well above that times f0.
 *
 * A narrow band-pass moves with every percent of f0, so unlike the MFB
 * low-pass this search rounds inside the loop: R3 first, then R1 solved
 * against the rounded R3 for the gain, then R2 solved against both for
 * omega0, and it scores what the rounded parts give.
 *
 * A real op-amp moves the stage. With a single-pole op-amp,
 * A(s) = omega_t / s (omega_t = 2 pi GBW), the denominator becomes, up to
 * a factor omega_t, the cubic
 *   (1 + s/omega_t)(s^2 + s omega0/Q + omega0^2) + (s^2/omega_t) omega0 Q (1 + C2/C1)
 * with one fast real pole near omega_t, and a main pole pair
 * whose f0 falls by about 1/sqrt(1 + k) and whose Q rises by about
 * sqrt(1 + k), k = Q (1 + C2/C1) f0 / GBW; the peak gain holds. Given a
 * GBW, the designers can build the stage for it: the circuit alone is
 * designed at a higher f0 and a lower Q (about f0 sqrt(1 + k) and
 * Q / sqrt(1 + k)), chosen so that with that op-amp the main pole pair
 * lands on the target, and the search scores what the rounded parts give
 * with that op-amp. That score counts an f0 miss 2Q times (mfbBpMiss): near
 * its band edges a stage's gain moves about 2Q times as much for 1 % of f0
 * as for 1 % of Q.
 */

const MFB_BP_R_MIN = 200; // ohms, as for the other stages
const MFB_BP_R_MAX = 2_000_000;
const MFB_BP_R_SWEET = 10_000;
/** The two capacitors may differ by up to this factor either way. */
export const MFB_BP_CAP_RATIO = 10;
/** Weight of ln^2(C1/C2) in the score: equal capacitors win a tie. */
const MFB_BP_UNEQUAL = 0.02;
/** Added to the score when a rounded resistor lands outside the window, as smallCapPenalty does for a tiny capacitor. */
const MFB_BP_OUTSIDE = 1000;

const mfbBpInRange = (R) => R > MFB_BP_R_MIN && R < MFB_BP_R_MAX;

/** The f0, Q and signed centre gain a set of parts gives. */
export function mfbBandPassActual({ R1, R2, R3, C1, C2 }) {
	const b = (1 / R1 + 1 / R2) / (R3 * C1 * C2);
	const a = (C1 + C2) / (R3 * C1 * C2);
	const wn = Math.sqrt(b);
	return { wn, q: wn / a, gain: -(R3 * C2) / (R1 * (C1 + C2)) };
}

/** Whether a gain-bandwidth asks for the op-amp correction: a finite positive number of Hz (null or Infinity is an ideal op-amp). */
const mfbBpCorrected = (gbw) => Number.isFinite(gbw) && gbw > 0;

/**
 * H(j 2 pi f) of a stage, as { re, im }, from the exact nodal solution.
 * gbw null: an ideal op-amp, the transfer function above. gbw in Hz: a
 * single-pole op-amp, its output -A(s) times the voltage at M,
 * A(s) = omega_t / s. KCL at A and at M then give
 *   H(s) = -omega_t s/(R1 C1) / (s^3 + c2 s^2 + c1 s + c0)
 *   c2 = omega_t + (C1 + C2)/(R3 C1 C2) + (1/R1 + 1/R2)/C1
 *   c1 = omega_t (C1 + C2)/(R3 C1 C2) + omega0^2,   c0 = omega_t omega0^2
 * omega0 being the circuit's own; as omega_t grows this tends to the ideal one.
 */
export function mfbBandPassResponse({ R1, R2, R3, C1, C2 }, f, gbw = null) {
	const w = 2 * Math.PI * f;
	const g1 = 1 / (R1 * C1);
	const a = (C1 + C2) / (R3 * C1 * C2);
	const b = (1 / R1 + 1 / R2) / (R3 * C1 * C2);
	// numerator and denominator at s = jw, each as re + j im
	let num;
	let den;
	if (!mfbBpCorrected(gbw)) {
		num = { re: 0, im: -g1 * w };
		den = { re: b - w * w, im: a * w };
	} else {
		const wt = 2 * Math.PI * gbw;
		const c2 = wt + a + (1 / R1 + 1 / R2) / C1;
		num = { re: 0, im: -wt * g1 * w };
		den = { re: wt * b - c2 * w * w, im: (wt * a + b) * w - w * w * w };
	}
	const d = den.re * den.re + den.im * den.im;
	return { re: (num.re * den.re + num.im * den.im) / d, im: (num.im * den.re - num.re * den.im) / d };
}

/**
 * The real pole a single-pole op-amp adds, as a positive rate p: the root
 * of s^3 + c2 s^2 + c1 s + c0 left of the other two (with a complex pair
 * it is the one real root), polished by Newton's method.
 */
function mfbBpOpampPole(c2, c1, c0) {
	const roots = polyRoots([c0, c1, c2, 1]);
	const real = [...roots].sort((x, y) => Math.abs(x.im) - Math.abs(y.im));
	const pair = Math.abs(real[1].im) > 1e-7 * Math.hypot(real[1].re, real[1].im);
	let s = pair ? real[0].re : Math.min(...roots.map((r) => r.re));
	for (let i = 0; i < 4; i++) {
		const df = (3 * s + 2 * c2) * s + c1;
		if (df === 0) break;
		s -= (((s + c2) * s + c1) * s + c0) / df;
	}
	return -s;
}

/**
 * What a set of parts does with a single-pole op-amp of gain-bandwidth gbw
 * (Hz): the main pole pair of the cubic above, the two roots other than
 * the op-amp's own fast pole p, as { wn, q }, and the gain at that wn,
 * -|H(j wn)| (the stage inverts). Dividing the cubic by (s + p) leaves
 * s^2 + (wn/q) s + wn^2 with wn^2 = c0/p and wn/q = (c1 - wn^2)/p.
 * With gbw null it is the circuit alone, mfbBandPassActual.
 */
export function mfbBandPassEffective(components, gbw) {
	if (!mfbBpCorrected(gbw)) return mfbBandPassActual(components);
	const { R1, R2, R3, C1, C2 } = components;
	const wt = 2 * Math.PI * gbw;
	const a = (C1 + C2) / (R3 * C1 * C2);
	const b = (1 / R1 + 1 / R2) / (R3 * C1 * C2);
	const c2 = wt + a + (1 / R1 + 1 / R2) / C1;
	const c1 = wt * a + b;
	const c0 = wt * b;
	const p = mfbBpOpampPole(c2, c1, c0);
	const wn = Math.sqrt(c0 / p);
	const h = mfbBandPassResponse(components, wn / (2 * Math.PI), gbw);
	return { wn, q: (wn * p) / (c1 - (wn * wn)), gain: -Math.hypot(h.re, h.im) };
}

/** The loop gain must stay at least this at f0, or the correction for the op-amp is not trusted. */
export const MFB_BP_LOOP_MIN = 2;

/**
 * The circuit-alone targets for a stage built with a single-pole op-amp
 * of gain-bandwidth gbw (Hz) and capacitors in the ratio C2/C1: the
 * omega0, Q and centre gain the parts are solved for with an ideal
 * op-amp, such that with this op-amp the main pole pair lands exactly on
 * (wn, q) and the gain at wn is `gain`. Writing the cubic as
 * (s + p)(s^2 + A s + B), A = wn/q, B = wn^2, the circuit's a = omega0/Q
 * and b = omega0^2 follow from the op-amp's pole p,
 *   b = p B / omega_t,   a = (p A + B - b) / omega_t,
 * and p solves the s^2 coefficient, omega_t + a + (1 + C2/C1) b/a = p + A,
 * one root past omega_t (found by bisection). The gain at wn is then
 * omega_t (1/(R1 C1)) / (A sqrt(p^2 + wn^2)), which fixes R1 C1, and the
 * circuit's centre gain is (1/(R1 C1)) / a. To first order this is
 * omega0 = wn sqrt(1 + k), Q = q / sqrt(1 + k), the same gain.
 * Returns { wn, q, gain, pole } or null when no such circuit exists.
 */
export function mfbBandPassPredistorted(wn, q, gain, ratio, gbw) {
	if (![wn, q, gain, ratio, gbw].every((v) => Number.isFinite(v) && v > 0)) return null;
	const wt = 2 * Math.PI * gbw;
	const A = wn / q;
	const B = wn * wn;
	// the circuit's a stays positive for every p only while omega_t > q wn
	if (!(A > B / wt)) return null;
	// The miss below is concave in p, positive at omega_t, and its slope far
	// out is (A - B/omega_t)/omega_t - 1. So it has one root past omega_t
	// when omega_t^2 - A omega_t + B > 0 (always when GBW is above f0/q),
	// and none otherwise, whatever C2/C1: the op-amp is then too slow for
	// any circuit to land on the target.
	if (!(wt * wt - A * wt + B > 0)) return null;
	const circuit = (p) => {
		const b = (p * B) / wt;
		return { a: (p * A + B - b) / wt, b };
	};
	const miss = (p) => {
		const { a, b } = circuit(p);
		return wt + a + ((1 + ratio) * b) / a - p - A;
	};
	// miss(omega_t) = (1 + C2/C1) B / A > 0, and past the root the miss stays negative
	let lo = wt;
	let hi = 2 * wt;
	for (let i = 0; miss(hi) > 0; i++) {
		if (i > 60) return null;
		lo = hi;
		hi *= 2;
	}
	for (let i = 0; i < 200 && hi - lo > 1e-15 * hi; i++) {
		const mid = (lo + hi) / 2;
		if (miss(mid) > 0) lo = mid;
		else hi = mid;
	}
	const p = (lo + hi) / 2;
	const { a, b } = circuit(p);
	const g1 = (gain * A * Math.hypot(p, wn)) / wt;
	const w0 = Math.sqrt(b);
	return { wn: w0, q: w0 / a, gain: g1 / a, pole: p };
}

/**
 * The op-amp's loop gain at the circuit's own f0, where its noise gain
 * peaks at 1 + Q^2 (1 + C2/C1): GBW / (noise gain x f0), for a circuit
 * designed at (wn, q) with capacitors in the ratio C2/C1.
 */
export function mfbBpLoopGain(wn, q, ratio, gbw) {
	return gbw / ((1 + q * q * (1 + ratio)) * (wn / (2 * Math.PI)));
}

/**
 * Whether capacitors C1 and C2 may build the stage for a single-pole
 * op-amp of gain-bandwidth gbw: the circuit-alone targets exist, fit as
 * mfbBpFits asks, and leave a loop gain of at least MFB_BP_LOOP_MIN.
 * Returns those targets, or null.
 */
export function mfbBpFitsWith(wn, q, gain, C1, C2, gbw) {
	const pre = mfbBandPassPredistorted(wn, q, gain, C2 / C1, gbw);
	if (!pre || !mfbBpFits(pre.wn, pre.q, pre.gain, C1, C2)) return null;
	return mfbBpLoopGain(pre.wn, pre.q, C2 / C1, gbw) >= MFB_BP_LOOP_MIN ? pre : null;
}

/** The ideal parts for capacitors C1 and C2 (R2 is Infinity at or past the gain ceiling). */
function mfbBpIdeal(wn, q, gain, C1, C2) {
	const g2 = (wn / q) * (q * q * (C1 + C2) - gain * C1);
	return { R1: q / (gain * wn * C1), R2: g2 > 0 ? 1 / g2 : Infinity, R3: (q * (C1 + C2)) / (wn * C1 * C2) };
}

/** Whether capacitors C1 and C2 may build this stage: their ratio in bounds and every ideal resistor in range. */
export function mfbBpFits(wn, q, gain, C1, C2) {
	const ratio = C2 / C1;
	if (!(ratio <= MFB_BP_CAP_RATIO * (1 + 1e-9) && ratio >= 1 / (MFB_BP_CAP_RATIO * (1 + 1e-9)))) return false;
	const { R1, R2, R3 } = mfbBpIdeal(wn, q, gain, C1, C2);
	return mfbBpInRange(R1) && mfbBpInRange(R2) && mfbBpInRange(R3);
}

// Every stocked value in one sorted list, built once per series or list:
// the search rounds a few thousand resistors per stage.
const MFB_BP_SERIES_LISTS = new Map();
const MFB_BP_KIT_LISTS = new WeakMap();

function mfbBpList(resistorSeries) {
	if (Array.isArray(resistorSeries)) {
		let list = MFB_BP_KIT_LISTS.get(resistorSeries);
		if (!list) {
			list = [...new Set(resistorSeries.filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);
			MFB_BP_KIT_LISTS.set(resistorSeries, list);
		}
		return list;
	}
	const name = SERIES[resistorSeries] ? resistorSeries : 'E24';
	let list = MFB_BP_SERIES_LISTS.get(name);
	if (!list) {
		list = seriesValues(SERIES[name], -12, 12);
		MFB_BP_SERIES_LISTS.set(name, list);
	}
	return list;
}

/** Index of the first value at or above the target. */
function mfbBpIndex(list, target) {
	let lo = 0;
	let hi = list.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (list[mid] < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** The nearest stocked resistor, the same value pairedResistor gives. */
function mfbBpNearest(target, resistorSeries, pairs) {
	if (pairs && Array.isArray(resistorSeries)) return pairedResistor(target, resistorSeries, pairs);
	const list = mfbBpList(resistorSeries);
	const i = mfbBpIndex(list, target);
	if (i === 0) return list[0];
	if (i === list.length) return list[list.length - 1];
	// the lower one on a tie, as nearestInSeries keeps the first it finds
	return Math.abs(Math.log(list[i] / target)) < Math.abs(Math.log(list[i - 1] / target)) ? list[i] : list[i - 1];
}

/** The smallest stocked resistor at or above the target (Infinity past the largest). */
function mfbBpAbove(target, resistorSeries) {
	const list = mfbBpList(resistorSeries);
	const i = mfbBpIndex(list, target);
	return i < list.length ? list[i] : Infinity;
}

/** Whether rounding found a stocked value for every resistor (one past the largest stocked value is Infinity). */
const mfbBpBuilt = (parts) => [parts.R1, parts.R2, parts.R3].every(Number.isFinite);

/**
 * How far a stage lands from its targets: the largest of its f0, Q and gain
 * misses, as logs, the f0 miss counted f0Weight times.
 */
function mfbBpMiss(actual, wn, q, gain, f0Weight = 1) {
	return Math.max(f0Weight * Math.abs(Math.log(actual.wn / wn)), Math.abs(Math.log(actual.q / q)), Math.abs(Math.log(-actual.gain / gain)));
}

/**
 * The f0 weight of the search for an op-amp. Near its band edges a stage
 * of quality Q moves about 2Q times as much for 1 % of f0 as for 1 % of Q,
 * so on a sharp stage the f0 miss is what moves the band edges. Never
 * under 1, the plain designer's weight.
 */
const mfbBpF0Weight = (q) => Math.max(1, 2 * q);

/**
 * Whether a resistor target lies past either end of a list of values by
 * more than half the step there, so that rounding only clamps it to the
 * end value (the stock has no resistor that small or that large; a pair
 * reaches twice the largest value). A series never runs out.
 */
function mfbBpPastStock(target, resistorSeries, pairs) {
	if (!Array.isArray(resistorSeries)) return false;
	const list = mfbBpList(resistorSeries);
	const n = list.length;
	if (n === 0) return true;
	const lowStep = n > 1 ? list[1] / list[0] : 1.21;
	const highStep = n > 1 ? list[n - 1] / list[n - 2] : 1.21;
	const top = (pairs ? 2 : 1) * list[n - 1];
	return target < list[0] / Math.sqrt(lowStep) || target > top * Math.sqrt(highStep);
}

/** Whether rounding clamped a part of this stage to an end of the stock (mfbBpPastStock): the stock cannot build it. */
const mfbBpClamped = (ideal, parts, resistorSeries, pairs) =>
	[
		[ideal.R3, 'R3'],
		[parts.R1Target, 'R1'],
		[parts.R2Target, 'R2']
	].some(([t, name]) => mfbBpPastStock(t, resistorSeries, pairAllowed(pairs, name)));

/**
 * R3 rounded, R1 solved against it and rounded, R2 solved against both
 * and rounded. Close under the gain ceiling the nearest values can leave
 * no room for R2 (1/R2 would be negative); R3 and R1 are then both taken
 * at the next value up, which always leaves room when the ideal stage
 * has it. A part is Infinity only when the stock has no value that large,
 * and the designers below then skip the pair.
 * With `pairs` and a list of values, the paired set is kept only when it
 * lands no further off (mfbBpMiss, its f0 miss counted f0Weight times).
 * `pairs` may also be a list of the names allowed to pair (pairAllowed in
 * eseries.js): 'R1', 'R2' and 'R3'.
 */
function mfbBpRound(ideal, wn, q, gain, C1, C2, resistorSeries, pairs, f0Weight = 1) {
	const round = (p, up) => {
		const R3 = up ? mfbBpAbove(ideal.R3, resistorSeries) : mfbBpNearest(ideal.R3, resistorSeries, pairAllowed(p, 'R3'));
		const R1Target = (R3 * C2) / (gain * (C1 + C2));
		const R1 = up ? mfbBpAbove(R1Target, resistorSeries) : mfbBpNearest(R1Target, resistorSeries, pairAllowed(p, 'R1'));
		const g2 = wn * wn * R3 * C1 * C2 - 1 / R1;
		const R2Target = g2 > 0 && Number.isFinite(g2) ? 1 / g2 : Infinity;
		const R2 = Number.isFinite(R2Target) ? mfbBpNearest(R2Target, resistorSeries, pairAllowed(p, 'R2')) : Infinity;
		return { R1, R2, R3, R1Target, R2Target };
	};
	let single = round(false, false);
	if (!Number.isFinite(single.R2)) single = round(false, true);
	if (!anyPairAllowed(pairs) || !Array.isArray(resistorSeries)) return single;
	const paired = round(pairs, false);
	const missOf = (r) => (Number.isFinite(r.R2) ? mfbBpMiss(mfbBandPassActual({ ...r, C1, C2 }), wn, q, gain, f0Weight) : Infinity);
	return missOf(paired) <= missOf(single) ? paired : single;
}

function mfbBpResult(wn, q, gain, C1, C2, ideal, parts, resistorSeries) {
	const maxGain = q * q * (1 + C2 / C1);
	return {
		topology: 'mfbBp',
		order: 2,
		theoretical: { R1: ideal.R1, R2: ideal.R2, R3: ideal.R3, C1, C2 },
		components: { R1: parts.R1, R2: parts.R2, R3: parts.R3, C1, C2 },
		actual: mfbBandPassActual({ R1: parts.R1, R2: parts.R2, R3: parts.R3, C1, C2 }),
		steps: { a: wn / q, b: wn * wn, C1, C2, gainTarget: gain, maxGain, noiseGain: 1 + maxGain, R1Target: parts.R1Target, R2Target: parts.R2Target, resistorSeries }
	};
}

/**
 * A stage built for a single-pole op-amp: the parts solved for the
 * circuit-alone targets `pre`, actual = what they do with that op-amp,
 * ideal = what they do alone. steps describes the circuit's own solve
 * (a, b, maxGain, noiseGain and the resistor targets are the circuit's),
 * with the stage's gain target, the op-amp, k and the loop gain.
 */
function mfbBpCorrectedResult(wn, q, gain, gbw, pre, C1, C2, ideal, parts, resistorSeries) {
	const base = mfbBpResult(pre.wn, pre.q, pre.gain, C1, C2, ideal, parts, resistorSeries);
	const ratio = C2 / C1;
	return {
		...base,
		actual: { ...mfbBandPassEffective(base.components, gbw), gbw },
		ideal: base.actual,
		steps: {
			...base.steps,
			gainTarget: gain,
			gbw,
			k: (q * (1 + ratio) * wn) / (2 * Math.PI * gbw),
			loopGain: mfbBpLoopGain(pre.wn, pre.q, ratio, gbw),
			predistorted: { wn: pre.wn, q: pre.q, gain: pre.gain }
		}
	};
}

/**
 * The search of designMfbBandPass for a single-pole op-amp of gain-bandwidth
 * gbw: each pair solved for its own circuit-alone targets, scored with the
 * op-amp, an f0 miss counted mfbBpF0Weight times. A pair whose parts only
 * clamp to an end of a list of values is skipped (mfbBpClamped).
 */
function mfbBpSearchWith(wn, q, size, gbw, resistorSeries, capacitors, pairs) {
	const caps = capacitorCandidates(capacitors);
	const f0Weight = mfbBpF0Weight(q);
	let best = null;
	for (const C1 of caps) {
		for (const C2 of caps) {
			const pre = mfbBpFitsWith(wn, q, size, C1, C2, gbw);
			if (!pre) continue;
			const ideal = mfbBpIdeal(pre.wn, pre.q, pre.gain, C1, C2);
			const parts = mfbBpRound(ideal, pre.wn, pre.q, pre.gain, C1, C2, resistorSeries, pairs, f0Weight);
			if (!mfbBpBuilt(parts) || mfbBpClamped(ideal, parts, resistorSeries, pairs)) continue;
			const outside = [parts.R1, parts.R2, parts.R3].every(mfbBpInRange) ? 0 : MFB_BP_OUTSIDE;
			const miss = mfbBpMiss(mfbBandPassEffective({ ...parts, C1, C2 }, gbw), wn, q, size, f0Weight);
			const level = (Math.log(parts.R1 / MFB_BP_R_SWEET) ** 2 + Math.log(parts.R2 / MFB_BP_R_SWEET) ** 2 + Math.log(parts.R3 / MFB_BP_R_SWEET) ** 2) / 3;
			const score = level + 1000 * miss * miss + smallCapPenalty(C1, C2) + outside + MFB_BP_UNEQUAL * Math.log(C1 / C2) ** 2;
			if (!Number.isFinite(score)) continue;
			if (best === null || score < best.score) best = { C1, C2, pre, ideal, parts, score };
		}
	}
	if (!best) return null;
	return mfbBpCorrectedResult(wn, q, size, gbw, best.pre, best.C1, best.C2, best.ideal, best.parts, resistorSeries);
}

/**
 * Searches the capacitor pairs (equal ones preferred, a ratio up to
 * MFB_BP_CAP_RATIO allowed) for the one whose rounded parts land closest
 * to the targets with the resistors near 10 kilo-ohm. `gain` is the size
 * of the gain at the stage's own centre (the stage inverts). A pair is
 * tried when its ideal resistors are all inside (200 ohm, 2 Mohm); a part
 * that rounds onto or past an end of that window costs as much as a tiny
 * capacitor, so it is kept only when nothing else builds the stage.
 * Returns null when no pair builds.
 *
 * With `gbw` (Hz) the stage is built for a single-pole op-amp of that
 * gain-bandwidth: each pair gets its circuit-alone targets
 * (mfbBandPassPredistorted), its parts are solved for them and rounded as
 * above, and the score is the miss of what the rounded parts do with the
 * op-amp, its f0 miss counted max(1, 2Q) times. A pair that leaves the
 * op-amp a loop gain under MFB_BP_LOOP_MIN at f0 is skipped, and so is one
 * whose parts a list of values only reaches by clamping to its end, so null
 * also means no pair keeps the loop gain, or the stock has no such parts.
 */
export function designMfbBandPass(wn, q, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false, gbw = null } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size].every((v) => Number.isFinite(v) && v > 0)) return null;
	if (mfbBpCorrected(gbw)) return mfbBpSearchWith(wn, q, size, gbw, resistorSeries, capacitors, pairs);
	const caps = capacitorCandidates(capacitors);
	let best = null;
	for (const C1 of caps) {
		for (const C2 of caps) {
			if (!mfbBpFits(wn, q, size, C1, C2)) continue;
			const ideal = mfbBpIdeal(wn, q, size, C1, C2);
			const parts = mfbBpRound(ideal, wn, q, size, C1, C2, resistorSeries, pairs);
			if (!mfbBpBuilt(parts)) continue;
			const outside = [parts.R1, parts.R2, parts.R3].every(mfbBpInRange) ? 0 : MFB_BP_OUTSIDE;
			const miss = mfbBpMiss(mfbBandPassActual({ ...parts, C1, C2 }), wn, q, size);
			const level = (Math.log(parts.R1 / MFB_BP_R_SWEET) ** 2 + Math.log(parts.R2 / MFB_BP_R_SWEET) ** 2 + Math.log(parts.R3 / MFB_BP_R_SWEET) ** 2) / 3;
			const score = level + 1000 * miss * miss + smallCapPenalty(C1, C2) + outside + MFB_BP_UNEQUAL * Math.log(C1 / C2) ** 2;
			if (!Number.isFinite(score)) continue;
			if (best === null || score < best.score) best = { C1, C2, ideal, parts, score };
		}
	}
	if (!best) return null;
	return mfbBpResult(wn, q, size, best.C1, best.C2, best.ideal, best.parts, resistorSeries);
}

/**
 * The same stage from two capacitors chosen by hand. Returns
 * { ok: false, maxGain, neededRatio, actualRatio } when the pair cannot
 * reach the gain at this Q (C2/C1 must exceed gain/Q^2 - 1), when the stock
 * has no resistor large enough, or when f0, Q, the gain or a capacitor is
 * not a positive number.
 *
 * With `gbw` the stage is built for that op-amp as designMfbBandPass does,
 * and the ceiling is the circuit's: maxGain and neededRatio are for its
 * own Q and gain. A failure then also carries gbw, the loop gain and the
 * circuit-alone targets (predistorted, null when none exist), and why:
 * 'gain' (the ceiling, or f0, Q, the gain or a capacitor not a positive
 * number), 'opamp' (the op-amp is too slow for any circuit to land on the
 * target, whatever the capacitors), 'loop' (a loop gain under
 * MFB_BP_LOOP_MIN) or 'parts' (no resistor in stock, or one the list of
 * values only reaches by clamping to its end).
 */
export function designMfbBandPassFromCaps(wn, q, C1, C2, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false, gbw = null } = {}) {
	if (mfbBpCorrected(gbw)) return mfbBpFromCapsWith(wn, q, C1, C2, { gain, resistorSeries, pairs, gbw });
	const size = Math.abs(gain);
	const maxGain = q * q * (1 + C2 / C1);
	const failure = { ok: false, maxGain, neededRatio: size / (q * q) - 1, actualRatio: C2 / C1 };
	if (![wn, q, size, C1, C2].every((v) => Number.isFinite(v) && v > 0) || !(size < maxGain)) return failure;
	const ideal = mfbBpIdeal(wn, q, size, C1, C2);
	const parts = mfbBpRound(ideal, wn, q, size, C1, C2, resistorSeries, pairs);
	if (!mfbBpBuilt(parts)) return failure;
	const outOfRange = ![parts.R1, parts.R2, parts.R3].every(mfbBpInRange);
	return { ...mfbBpResult(wn, q, size, C1, C2, ideal, parts, resistorSeries), ok: true, manual: true, outOfRange };
}

/** designMfbBandPassFromCaps for a single-pole op-amp of gain-bandwidth gbw. */
function mfbBpFromCapsWith(wn, q, C1, C2, { gain, resistorSeries, pairs, gbw }) {
	const size = Math.abs(gain);
	const valid = [wn, q, size, C1, C2].every((v) => Number.isFinite(v) && v > 0);
	const pre = valid ? mfbBandPassPredistorted(wn, q, size, C2 / C1, gbw) : null;
	const circuitQ = pre ? pre.q : q;
	const circuitGain = pre ? pre.gain : size;
	const maxGain = circuitQ * circuitQ * (1 + C2 / C1);
	const loopGain = pre ? mfbBpLoopGain(pre.wn, pre.q, C2 / C1, gbw) : 0;
	const failure = (why) => ({
		ok: false,
		maxGain,
		neededRatio: circuitGain / (circuitQ * circuitQ) - 1,
		actualRatio: C2 / C1,
		gbw,
		loopGain,
		predistorted: pre && { wn: pre.wn, q: pre.q, gain: pre.gain },
		why
	});
	// valid figures with no circuit-alone targets: the op-amp is too slow (mfbBandPassPredistorted)
	if (!pre) return failure(valid ? 'opamp' : 'gain');
	if (!(circuitGain < maxGain)) return failure('gain');
	if (!(loopGain >= MFB_BP_LOOP_MIN)) return failure('loop');
	const ideal = mfbBpIdeal(pre.wn, pre.q, pre.gain, C1, C2);
	const f0Weight = mfbBpF0Weight(q);
	const parts = mfbBpRound(ideal, pre.wn, pre.q, pre.gain, C1, C2, resistorSeries, pairs, f0Weight);
	if (!mfbBpBuilt(parts) || mfbBpClamped(ideal, parts, resistorSeries, pairs)) return failure('parts');
	const outOfRange = ![parts.R1, parts.R2, parts.R3].every(mfbBpInRange);
	return { ...mfbBpCorrectedResult(wn, q, size, gbw, pre, C1, C2, ideal, parts, resistorSeries), ok: true, manual: true, outOfRange };
}
