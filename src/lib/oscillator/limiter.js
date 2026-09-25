/**
 * Amplitude control, described by the parts that actually do it.
 *
 * A diode is not a switch at 0.6 V: its current is exponential in its
 * voltage, i = Is (exp(v / n Vt) - 1), and at the tens of microamps an
 * op-amp limiter runs it, a 1N4148 drops nearer 0.45 V than 0.6 V. The
 * amplitude an oscillator settles at is where the diodes shunt exactly
 * enough of the feedback resistor to bring the loop gain back to 1
 * averaged over a cycle, so everything here works with the describing
 * function of the diode pair: the conductance a sinusoid of amplitude V
 * sees, averaged the way the loop averages it. The same describing
 * function, run backwards, sizes the parts for a wanted amplitude, and
 * LTspice (whose diode is exactly this exponential) then lands within a
 * few percent of the figure, where the 0.6 V switch model was 15 % off.
 *
 * The three controls in this tool:
 *   - anti-parallel diodes across part of a feedback resistor (Wien
 *     bridge and the inverting stages of the ladder oscillators)
 *   - a divider and anti-parallel diodes from an integrator output into
 *     its own virtual ground (the quadrature loop, where gain
 *     compression does nothing and only damping holds the amplitude)
 *   - a JFET used as a resistor in the Wien bridge's lower leg, driven by
 *     a peak detector (AGC), and an incandescent lamp in the same place
 */

import { nearestResistor } from '../filter/eseries';

/** kT/q at SPICE's default 27 C. */
const VT = 0.025852;

export const DIODES = {
	'1N4148': {
		id: '1N4148',
		label: '1N4148 / 1N914 (silicon)',
		Is: 2.52e-9,
		N: 1.752,
		cjo: 4e-12,
		spice: '.model DX D(Is=2.52n Rs=.568 N=1.752 Cjo=4p M=.4 tt=20n)'
	},
	BAT54: {
		id: 'BAT54',
		label: 'BAT54 (Schottky, 0.3 V)',
		Is: 1e-7,
		N: 1,
		cjo: 12e-12,
		spice: '.model DX D(Is=.1u Rs=2.2 N=1 Cjo=12p M=.3 Eg=.69 Xti=2)'
	}
};

export const JFETS = {
	generic: {
		id: 'generic',
		label: 'Generic JFET (-2 V, 4 mA)',
		vto: -2,
		beta: 1e-3,
		spice: '.model JX NJF(Vto=-2 Beta=1m Lambda=1m)'
	},
	J111: {
		id: 'J111',
		label: 'J111 (-6.5 V, 30 Ω)',
		vto: -6.5,
		beta: 1 / (2 * 30 * 6.5),
		spice: `.model JX NJF(Vto=-6.5 Beta=${(1 / (2 * 30 * 6.5)).toPrecision(4)} Lambda=1m)`
	}
};

/* -------------------------------------------------- diode describing function */

/** The forward drop of one diode carrying current i. */
export function diodeDrop(i, d) {
	return d.N * VT * Math.log(1 + i / d.Is);
}

/** Current through an anti-parallel pair at voltage v (either sign). */
function pairCurrent(v, d) {
	const a = v / (d.N * VT);
	return d.Is * (Math.exp(a) - Math.exp(-a));
}

/**
 * Current through a resistor Rz in series with an anti-parallel pair, at
 * total voltage v: solve v = Rz i + n Vt asinh(i / 2 Is) for i.
 */
function clampCurrent(v, rz, d) {
	if (v === 0) return 0;
	const sign = Math.sign(v);
	const va = Math.abs(v);
	// bracket: the pair alone, or the resistor alone, whichever is smaller
	let lo = 0;
	let hi = Math.min(va / (rz || Infinity), pairCurrent(va, d));
	if (!(hi > 0)) hi = va / (rz || 1);
	for (let k = 0; k < 80; k++) {
		const mid = 0.5 * (lo + hi);
		const vm = rz * mid + d.N * VT * Math.asinh(mid / (2 * d.Is));
		if (vm < va) lo = mid;
		else hi = mid;
		if (hi - lo < 1e-12 * hi) break;
	}
	return sign * 0.5 * (lo + hi);
}

/** Simpson's rule over one cycle for the fundamental component. */
function fundamental(iOf, amplitude) {
	const K = 256;
	let sum = 0;
	for (let k = 0; k <= K; k++) {
		const th = (2 * Math.PI * k) / K;
		const w = k === 0 || k === K ? 1 : k % 2 ? 4 : 2;
		sum += w * iOf(amplitude * Math.sin(th)) * Math.sin(th);
	}
	return (sum * (2 * Math.PI)) / (3 * K) / Math.PI; // (1/pi) integral
}

/**
 * The conductance a sinusoid of amplitude V sees across an anti-parallel
 * pair: the fundamental of the pair's current divided by V.
 */
export function pairConductance(V, d) {
	if (!(V > 0)) return 0;
	return fundamental((v) => pairCurrent(v, d), V) / V;
}

/** Same for a resistor in series with the pair. */
export function clampConductance(V, rz, d) {
	if (!(V > 0)) return 0;
	return fundamental((v) => clampCurrent(v, rz, d), V) / V;
}

/** Amplitude at which the pair presents conductance G (G increases with V). */
function pairAmplitudeFor(G, d) {
	let lo = 1e-4;
	let hi = 1;
	while (pairConductance(hi, d) < G && hi < 1e3) hi *= 2;
	for (let k = 0; k < 80; k++) {
		const mid = 0.5 * (lo + hi);
		if (pairConductance(mid, d) < G) lo = mid;
		else hi = mid;
	}
	return 0.5 * (lo + hi);
}

/* ------------------------------------------- diodes across a feedback resistor */

/**
 * Diodes across the part Rf2 of a feedback string Rf1 + Rf2. At balance
 * the string must present Rt (what the loop needs); with the diodes off
 * it presents Rs = Rf1 + Rf2 (the start gain). The voltage across the
 * string is `fraction` of the output: (g-1)/g for a non-inverting stage,
 * 1 for an inverting stage whose input is a virtual ground.
 *
 * Sizing: choose the effective Rf2 at balance, x, so that the diode
 * conductance the amplitude produces across Rf2 brings Rf2 down to x:
 *   G(V2) = 1/x - 1/(x + Rs - Rt),   V2 = A fraction x / Rt
 * The left side rises with x (through V2) and the right side falls, so
 * one bisection finds it.
 */
export function sizeFeedbackLimiter({ rt, rs, amplitude, fraction, diode, resistorSeries = 'E24' }) {
	const delta = rs - rt;
	if (!(delta > 0)) return null;
	const h = (x) => pairConductance((amplitude * fraction * x) / rt, diode) - (1 / x - 1 / (x + delta));
	let lo = 1e-3 * rt;
	let hi = rt * 0.999;
	if (h(hi) < 0) return null; // even Rf1 = 0 cannot get the diodes to conduct enough
	for (let k = 0; k < 100; k++) {
		const mid = 0.5 * (lo + hi);
		if (h(mid) < 0) lo = mid;
		else hi = mid;
	}
	const x = 0.5 * (lo + hi);
	const rf2Target = x + delta;
	const rf1Target = rt - x;
	// The amplitude hangs on Rt - Rf1, a small difference of two large
	// numbers, so an E24 step in Rf1 can move it by a factor of two; Rf1
	// is therefore a 1 % (E96) value while Rf2 stays in the series asked
	// for. Even so, try the neighbours of each rounded value and keep the
	// pair closest to the wanted amplitude among those that keep the start
	// gain above balance by at least a third of the excess asked for.
	const around = (target, series, steps) => [...new Set(steps.map((m) => nearestResistor(target * m, series)))];
	const excessWanted = rs / rt - 1;
	let best = null;
	for (const rf2 of around(rf2Target, resistorSeries, [0.8, 0.9, 1, 1.12, 1.25])) {
		for (const rf1 of rf1Target < 0.02 * rs ? [0] : around(rf1Target, 'E96', [0.95, 0.975, 0.99, 1, 1.01, 1.025, 1.05])) {
			const excess = (rf1 + rf2) / rt - 1;
			if (excess < excessWanted / 3 || excess > 2.5 * excessWanted) continue;
			const a = feedbackLimiterAmplitude({ rf1, rf2, rt, fraction, diode });
			if (a === null) continue;
			// the amplitude and the excess weigh the same: a few percent of
			// either is a few percent of distortion or of margin
			const score = Math.log(a / amplitude) ** 2 + Math.log((1 + excess) / (1 + excessWanted)) ** 2;
			if (!best || score < best.score) best = { rf1, rf2, score };
		}
	}
	if (!best) return { rf1: nearestResistor(rf1Target, 'E96'), rf2: nearestResistor(rf2Target, resistorSeries), rf1Target, rf2Target };
	return { rf1: best.rf1, rf2: best.rf2, rf1Target, rf2Target };
}

/**
 * The amplitude a given Rf1, Rf2 settle at: the diodes must bring Rf2
 * down to Rt - Rf1, which takes a definite conductance and therefore a
 * definite voltage across Rf2, hence a definite output. Returns null
 * when no amplitude can do it (the gain never falls to what the loop
 * needs, so the output clips on the rails instead).
 */
export function feedbackLimiterAmplitude({ rf1, rf2, rt, fraction, diode }) {
	const x = rt - rf1;
	if (!(x > 0) || !(x < rf2)) return null;
	const G = 1 / x - 1 / rf2;
	const V2 = pairAmplitudeFor(G, diode);
	return (V2 * rt) / x / fraction;
}

/* ------------------------------------------------- damping clamp (quadrature) */

/**
 * The quadrature loop is two integrators and an inverter, and its poles
 * sit exactly on the imaginary axis whatever the inverter's gain: gain
 * compression shifts its frequency and does nothing to its amplitude.
 * What moves the poles is damping across an integrator capacitor. So a
 * resistor Rn from the inverter output into the second integrator's
 * input puts a negative conductance across C2 (the loop starts, growing
 * exp(pi R / Rn) per cycle), and a clamp from that integrator's output
 * into the same input puts a positive one that appears only above a
 * threshold: a divider Rd1/Rd2 scales the output down, and anti-parallel
 * diodes from the divider's tap into the virtual ground conduct once the
 * tap reaches a diode drop. The amplitude parks just above the threshold,
 * where the clamp cancels the negative damping and what the op-amps'
 * own lag adds:
 *   Gclamp(A) = 1/Rn + 2 sigma0 C
 * with sigma0 the real part of the loop's pole without Rn. Because the
 * threshold is a resistor ratio and a diode drop, the amplitude does not
 * hang on the exact value of Rn or of the diode current, which a plain
 * series resistor would make it do.
 */

/** Current the clamp draws from the integrator input at output voltage v. */
function dividerClampCurrent(v, rd1, rd2, d) {
	if (v === 0) return 0;
	const sign = Math.sign(v);
	const va = Math.abs(v);
	// tap voltage u: (v - u)/Rd1 = u/Rd2 + i_pair(u); the right side rises with u
	let lo = 0;
	let hi = (va * rd2) / (rd1 + rd2);
	for (let k = 0; k < 80; k++) {
		const mid = 0.5 * (lo + hi);
		const lhs = (va - mid) / rd1;
		const rhs = mid / rd2 + pairCurrent(mid, d);
		if (rhs < lhs) lo = mid;
		else hi = mid;
		if (hi - lo < 1e-12 * va) break;
	}
	const u = 0.5 * (lo + hi);
	return sign * pairCurrent(u, d);
}

/** The conductance the clamp presents across the integrator capacitor at amplitude V. */
export function dividerClampConductance(V, rd1, rd2, d) {
	if (!(V > 0)) return 0;
	return fundamental((v) => dividerClampCurrent(v, rd1, rd2, d), V) / V;
}

/**
 * Sizes the clamp for a wanted amplitude: Rd2 is a round 1 k so the slope
 * above threshold is steep, and Rd1 is solved so the describing function
 * meets the target conductance exactly at the wanted amplitude, before
 * rounding.
 */
export function sizeDividerClamp({ gTarget, amplitude, diode, resistorSeries = 'E24' }) {
	const rd2 = 1000;
	// conductance at the wanted amplitude falls as Rd1 grows: bisect on log Rd1
	let lo = 100;
	let hi = 1e8;
	if (dividerClampConductance(amplitude, lo, rd2, diode) < gTarget) return null;
	if (dividerClampConductance(amplitude, hi, rd2, diode) > gTarget) return null;
	for (let k = 0; k < 100; k++) {
		const mid = Math.sqrt(lo * hi);
		if (dividerClampConductance(amplitude, mid, rd2, diode) > gTarget) lo = mid;
		else hi = mid;
	}
	const rd1Target = Math.sqrt(lo * hi);
	return { rd1: nearestResistor(rd1Target, resistorSeries), rd2, rd1Target };
}

/** The amplitude a given clamp settles at against a target conductance. */
export function dividerClampAmplitude({ rd1, rd2, gTarget, diode }) {
	let lo = 1e-3;
	let hi = 1;
	while (dividerClampConductance(hi, rd1, rd2, diode) < gTarget && hi < 1e3) hi *= 2;
	if (hi >= 1e3) return null;
	for (let k = 0; k < 80; k++) {
		const mid = 0.5 * (lo + hi);
		if (dividerClampConductance(mid, rd1, rd2, diode) < gTarget) lo = mid;
		else hi = mid;
	}
	return 0.5 * (lo + hi);
}

/* ---------------------------------------------------------------- lamp */

/**
 * A filament lamp for the simulation: resistance rising with its own
 * temperature, R = Rcold (1 + alpha theta), the temperature rise theta
 * driven by the dissipated power into a thermal capacitance and leaking
 * through a thermal resistance. Tuned so that the hot resistance is what
 * the loop needs at the design amplitude and cold is a third of it, with
 * a thermal time constant of `cycles` periods so a run settles quickly.
 * A real lamp is slower (tenths of a second) and its numbers are its own;
 * this one shows the mechanism with the right steady state.
 */
export function lampModel({ rHot, vLampPeak, f0, cycles = 40, alpha = 0.005 }) {
	const rCold = rHot / 3;
	const thetaHot = 2 / alpha; // Rcold (1 + alpha theta) = 3 Rcold
	const pHot = (vLampPeak * vLampPeak) / 2 / rHot;
	const rTh = thetaHot / pHot;
	const tau = cycles / f0;
	const cTh = tau / rTh;
	return { rCold, rHot, alpha, thetaHot, pHot, rTh, cTh, tau };
}

/* ----------------------------------------------------------------- AGC */

/**
 * The JFET automatic gain control in the Wien bridge's lower leg.
 *
 * The leg is a series resistor and the channel. A peak detector (D1 into
 * Cdet, held by the divider Ra/Rb) turns the output's negative peaks
 * into a steady negative voltage; the divider scales it and two equal
 * resistors Rx average it with the drain voltage into the gate. Adding
 * half the drain-source voltage to the gate cancels the channel's
 * square-law term exactly, so the channel is a linear resistor set by the
 * detector alone: r = 1 / (2 beta (Vc/2 - Vto)) with Vc the divider's
 * output. The loop settles where that resistor gives the balance gain.
 *
 * Sizing picks the channel resistance at balance small next to the leg
 * (the channel then sees a small voltage, which is what keeps it clean)
 * while staying reachable with the detector voltage this amplitude gives.
 */
/**
 * The series resistor of the AGC leg for a given output amplitude, or null
 * when no standard value works there. The channel left over at balance
 * must allow the start (at least rChannelMin) and stay reachable by the
 * detector (under 0.95 rMax); among the values that allow both, the one
 * closest to the target, from the series asked for and then from E96,
 * whose steps are finer.
 */
/**
 * The detector: D1 charges Cdet to the output's negative peak less the
 * diode's drop, and Ra + Rb bleed it. With the detector's time constant at
 * 50 cycles the capacitor droops about 2 % between peaks, so the diode
 * conducts for only a fifteenth of each cycle and its current then is some
 * 30 times the average. The drop is the diode's at that current: LTspice
 * shows 0.48 V at 3.26 V out, where the average current alone would give
 * 0.29 V and put the amplitude 9 % above the prediction.
 */
const DETECTOR_PULSE = 30;
function detectorPeak(amplitude, rLoad, diode) {
	return amplitude - diodeDrop((DETECTOR_PULSE * amplitude) / rLoad, diode);
}
/**
 * The gate: the divider's output, loaded by the two averaging resistors
 * (its Thevenin resistance against 2 Rx), then averaged with the drain,
 * whose mean is about 0 V.
 */
function gateFromPeak(vPeak, ra, rb, rx) {
	const ratio = rb / (ra + rb);
	const rth = (ra * rb) / (ra + rb);
	return (-vPeak * ratio) / (1 + rth / (2 * rx)) / 2;
}
const AGC_RB = 1e6;
const AGC_RX = 1e6;

function agcSeries({ amplitude, legBalance, rdsOn, rChannelMin, vto, beta, diode, resistorSeries }) {
	// with Ra = 0 the detector gives its most: the whole peak, less the drop
	const vPeak = detectorPeak(amplitude, AGC_RB, diode);
	const drop = amplitude - vPeak;
	// the most negative gate the detector can give is -vPeak/2; the channel
	// needed then must be reachable: |Vgs| = |Vto| - 1/(2 beta r) <= vPeak/2
	const rMax = -vto - vPeak / 2 > 0 ? 1 / (2 * beta * (-vto - vPeak / 2)) : Infinity;
	if (!(rMax > rChannelMin)) return { rSeries: null, vPeak, drop, rMax };
	const rBalanceTarget = Math.max(rChannelMin, Math.min(0.1 * legBalance, 0.9 * rMax));
	const rSeriesTarget = legBalance - rBalanceTarget;
	const fits = (v) => legBalance - v >= rChannelMin && legBalance - v <= 0.95 * rMax;
	for (const series of [resistorSeries, 'E96']) {
		const around = [0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 1, 1.03, 1.05, 1.1].map((f) => nearestResistor(rSeriesTarget * f, series));
		const usable = [...new Set(around)].filter(fits).sort((a, b) => Math.abs(a - rSeriesTarget) - Math.abs(b - rSeriesTarget));
		if (usable.length) return { rSeries: usable[0], rSeriesTarget, rBalanceTarget, vPeak, drop, rMax };
	}
	return { rSeries: null, vPeak, drop, rMax };
}

export function sizeAgc({ rf, gBalance, amplitude, jfet, diode, resistorSeries = 'E24' }) {
	const { vto, beta } = jfet;
	const rdsOn = 1 / (2 * beta * -vto);
	const legBalance = rf / (gBalance - 1);
	// Start-up: with the channel wide open the leg must be at least 3 % short
	// of the balance value, so the channel at balance is at least rdsOn plus
	// 3 % of the leg. The smallest output whose detector can squeeze the
	// channel that far is the least amplitude this JFET can hold.
	const rChannelMin = rdsOn + 0.03 * legBalance;
	const common = { legBalance, rdsOn, rChannelMin, vto, beta, diode, resistorSeries };
	const pick = agcSeries({ amplitude, ...common });
	if (pick.rSeries === null) {
		// just above the bare minimum no standard resistor may fit yet: the
		// least amplitude this JFET can really hold is the first one where
		// one does, searched upwards in 1 % steps
		let minAmplitude = 2 * Math.max(0, -vto - 1 / (2 * beta * rChannelMin)) + pick.drop;
		for (let a = Math.max(minAmplitude, 0.1); a < 4 * Math.max(minAmplitude, amplitude); a *= 1.01) {
			if (agcSeries({ amplitude: a, ...common }).rSeries !== null) {
				minAmplitude = a;
				break;
			}
		}
		return { ok: false, minAmplitude: Math.max(minAmplitude, amplitude * 1.01), rdsOn, rChannelMin };
	}
	const { rSeries, rSeriesTarget, rBalanceTarget, vPeak } = pick;
	const minAmplitude = 2 * Math.max(0, -vto - 1 / (2 * beta * rChannelMin)) + pick.drop;
	// the channel the loop actually settles at, with the rounded series
	// resistor: the divider is sized for this one, not for the target
	const rBalance = legBalance - rSeries;
	const vgsNeeded = vto + 1 / (2 * beta * rBalance);
	const rb = AGC_RB;
	const rx = AGC_RX;
	// Ra from the detector model: the gate this amplitude produces through
	// Ra, Rb and the averaging resistors must be the gate needed. The gate
	// shrinks as Ra grows, so a bisection finds it.
	const gateAt = (ra) => gateFromPeak(detectorPeak(amplitude, ra + rb, diode), ra, rb, rx);
	let raTarget = 0;
	if (gateAt(0) < vgsNeeded) {
		let lo = 0;
		let hi = 50e6;
		for (let k = 0; k < 80; k++) {
			const mid = 0.5 * (lo + hi);
			if (gateAt(mid) < vgsNeeded) lo = mid;
			else hi = mid;
		}
		raTarget = 0.5 * (lo + hi);
	}
	// the divider sets the amplitude almost in proportion, so an E24 step
	// can move it by a few percent: take E96 when that costs more than 1 %
	// of the gate's distance from pinch-off
	const miss = (ra) => Math.abs((gateAt(ra) - vto) / (vgsNeeded - vto) - 1);
	let ra = raTarget < 1e3 ? 0 : nearestResistor(raTarget, resistorSeries);
	if (ra > 0 && miss(ra) > 0.01) ra = nearestResistor(raTarget, 'E96');
	return { ok: true, rdsOn, rChannelMin, legBalance, rBalance, rBalanceTarget, rSeries, rSeriesTarget, ra, rb, rx, ratio: rb / (ra + rb), vgsNeeded, vPeak: detectorPeak(amplitude, ra + rb, diode), minAmplitude };
}

/**
 * The amplitude an AGC settles at with its rounded parts: the gate
 * voltage the detector produces at amplitude A sets the channel, hence
 * the gain; the loop sits where that gain is the balance gain.
 */
export function agcAmplitude({ rf, rSeries, ra, rb, rx = AGC_RX, gBalance, jfet, diode }) {
	const { vto, beta } = jfet;
	const gainAt = (A) => {
		const vPeak = Math.max(0, detectorPeak(A, ra + rb, diode));
		const vgs = Math.min(0, gateFromPeak(vPeak, ra, rb, rx));
		if (vgs <= vto) return 1; // pinched off: the leg is open
		const r = 1 / (2 * beta * (vgs - vto));
		return 1 + rf / (rSeries + r);
	};
	let lo = 0.05;
	let hi = 50;
	if (gainAt(lo) < gBalance) return null; // never above balance: cannot start
	if (gainAt(hi) > gBalance) return null; // never below: cannot regulate
	for (let k = 0; k < 80; k++) {
		const mid = 0.5 * (lo + hi);
		if (gainAt(mid) > gBalance) lo = mid;
		else hi = mid;
	}
	const A = 0.5 * (lo + hi);
	return { amplitude: A, gainStart: gainAt(0.05), gainAt };
}
