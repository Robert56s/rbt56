import { anyPairAllowed, capacitorCandidates, pairAllowed, ratioPair, smallCapPenalty, stockBetween, stockResistor } from './eseries';

/**
 * The passive RLC band-pass with its inductor simulated by op-amps: a
 * series resistor R from the input to the output node P, a capacitor C
 * and an inductor L in parallel from P to ground,
 *
 *   H(s) = (s L / R) / (s^2 L C + s L / R + 1)
 *   omega0 = 1 / sqrt(L C),   Q = R sqrt(C / L)  (so R = Q sqrt(L / C)),
 *
 * gain 1 at omega0. With C = 1 / (omega0 X), X its reactance at omega0,
 * L = X / omega0 and R = Q X. No real inductor is used: L is one of the
 * two circuits below, and the output node, a high impedance, is followed
 * by a unity-gain follower (or by the gain stage that comes after it).
 *
 * The input resistor may be split into Ra from the input to P and Rb from
 * P to ground: the tank then sees alpha Vin behind Ra || Rb, alpha =
 * Rb / (Ra + Rb), so with Ra || Rb = R the response keeps its f0 and Q and
 * its centre gain is alpha. That is how a gain under the circuit's own
 * comes out without an op-amp.
 *
 * Gyrator (rlcGyrator), one op-amp as a follower: R1 from P to the
 * follower's output O, Cg from P to its + input X, R2 from X to ground.
 * The follower holds O at V_X = V_P s R2 Cg / (1 + s R2 Cg), so
 *   Z_in = R1 (1 + s R2 Cg) / (1 + s R1 Cg),
 * about R1 + s R1 R2 Cg when R2 >> R1: an inductor L = R1 R2 Cg with a
 * series loss. The exact filter is still second order, with a zero:
 *   H(s) = alpha R1 (1 + s R2 Cg) / (s^2 C R R1 R2 Cg + s (R1 R2 Cg + R R1 Cg + C R R1) + R1 + R)
 *   omega0^2 = (1 + R1/R) / (R1 R2 C Cg)
 *   omega0/Q = 1/(R C) + 1/(R2 C) + 1/(R2 Cg)
 * The two terms in 1/R2 are the loss: on its own the textbook values
 * (L = R1 R2 Cg, R = Q sqrt(L/C)) give a lower Q, the peak moves up and
 * falls short of 1 (R1 = 50 ohm, C = Cg = 10 nF at 10 kHz, Q = 5: Q 3.8 and
 * -2.4 dB). So R2 and R are solved here against the exact expression,
 * which puts f0 and Q on target; the centre gain then stays under 1,
 *   |H(j omega0)| = alpha sqrt((1/(R C))^2 + (1/(omega0 R R2 C Cg))^2) / (omega0/Q),
 * and the gain stage after the circuit makes up the rest. The loss shrinks
 * with R1 / X and X / R2 (about 2 Q R1 / X with C = Cg), so the search
 * takes the capacitor whose reactance lets R1 stay at GYRATOR_R1 with R2
 * at most GYRATOR_R2_TOP: X near sqrt(GYRATOR_R1 GYRATOR_R2_TOP).
 * A real op-amp undoes part of that: the follower's lag, about f / GBW,
 * works in Z_in as a capacitance 1/(2 pi GBW R1) across the tank, so the
 * small R1 (and large R2) that lowers the loss also moves f0 further down
 * with a slow op-amp (rlcGyratorLag). Given `gbw`, the search weighs that
 * shift too (the narrow band-pass passes the TL082's), and nodal.js
 * measures what is left for the comparison.
 *
 * Antoniou's generalized impedance converter (rlcGic), two op-amps: from
 * P the chain R1, R2, R3, Cg, R4 to ground, op-amp 1 with its + input on
 * P, its - input between R2 and R3 and its output between R3 and Cg,
 * op-amp 2 with its + input between Cg and R4, its - input on the same
 * node as op-amp 1's and its output between R1 and R2. Ideal op-amps hold
 * every node at V_P, which gives
 *   Z_in = s Cg R1 R3 R4 / R2,
 * an exact grounded inductor L = Cg R1 R3 R4 / R2. With Cg = C and the four
 * resistors equal to X, L = X / omega0: the RLC above exactly. As built,
 * R1 = R3 and R4/R2 is the stocked ratio closest to the one L asks for.
 */

const RLC_R_MIN = 200;
const RLC_R_MAX = 2_000_000;
const RLC_R_SWEET = 10_000;
/** The gyrator's series loss R1, in ohms: as small as the follower drives comfortably. */
export const GYRATOR_R1 = 50;
/** The largest R2 the gyrator search aims for; past it R1 grows instead. */
export const GYRATOR_R2_TOP = 1_000_000;
/** R1 is tried from a little under its target (1/GYRATOR_R1_BELOW) to GYRATOR_R1_SPAN times it, for the product R1 R2 that sets f0. */
const GYRATOR_R1_BELOW = 1.1;
const GYRATOR_R1_SPAN = 1.6;
/** R2 of the GIC is tried within this factor of X either way, R4 following it in the ratio L sets. */
const GIC_PAIR_SPAN = 1.5;
/** Weight of the GIC resistors' spread around X (ln^2 each) in its search: a tie goes to four near-equal resistors. */
const GIC_SPREAD_WEIGHT = 0.01;
/** Weight of ln^2 of the gyrator's own centre gain in its search: a lossier capacitor needs a larger gain stage. */
const GYRATOR_LOSS_WEIGHT = 30;

/** The input as the resonator sees it: Ra || Rb, and alpha = Rb / (Ra + Rb) (1 with no Rb). */
function rlcThevenin({ Ra, Rb }) {
	if (!(Number.isFinite(Rb) && Rb > 0)) return { R: Ra, alpha: 1 };
	return { R: (Ra * Rb) / (Ra + Rb), alpha: Rb / (Ra + Rb) };
}

/** The f0 weight of a narrow stage's miss: near its band edges a stage moves about 2Q times as much for 1 % of f0 as for 1 % of Q. */
const rlcF0Weight = (q) => Math.max(1, 2 * q);

/** How far a stage lands from its targets: the largest of its log misses, f0 counted 2Q times. */
function rlcMiss(actual, wn, q, gain) {
	const m = Math.max(rlcF0Weight(q) * Math.abs(Math.log(actual.wn / wn)), Math.abs(Math.log(actual.q / q)));
	return gain === null ? m : Math.max(m, Math.abs(Math.log(actual.gain / gain)));
}

/**
 * How far a single-pole op-amp of gain-bandwidth gbw (Hz) moves a gyrator
 * stage's f0 down, as a fraction, about. The follower's output lags its
 * input by about s/omega_t, and in Z_in that lag works as a capacitance
 * 1/(omega_t R1) across the tank, so f0 falls by about
 * 1/(2 omega_t R1 C), C the tank's: a small R1 on a small C moves it the
 * most. 0 with no gbw.
 */
export function rlcGyratorLag({ R1, C }, gbw) {
	return Number.isFinite(gbw) && gbw > 0 ? 1 / (2 * (2 * Math.PI * gbw) * R1 * C) : 0;
}

/** rlcMiss of a gyrator stage, and with gbw the worse of it and the miss of the f0 the op-amp moves it to. */
function gyratorMiss(actual, parts, wn, q, gain, gbw) {
	const m = rlcMiss(actual, wn, q, gain);
	const lag = rlcGyratorLag(parts, gbw);
	return lag > 0 && lag < 1 ? Math.max(m, rlcMiss({ ...actual, wn: actual.wn * (1 - lag) }, wn, q, gain)) : m;
}

/* -------------------------------------------------------------- gyrator */

/** H(j 2 pi f) of a gyrator stage, exact, as { re, im }. */
export function rlcGyratorResponse(components, f) {
	const { C, R1, R2, Cg } = components;
	const { R, alpha } = rlcThevenin(components);
	const w = 2 * Math.PI * f;
	const num = { re: alpha * R1, im: alpha * R1 * w * R2 * Cg };
	const den = { re: R1 + R - w * w * C * R * R1 * R2 * Cg, im: w * (R1 * R2 * Cg + R * R1 * Cg + C * R * R1) };
	const d = den.re * den.re + den.im * den.im;
	return { re: (num.re * den.re + num.im * den.im) / d, im: (num.im * den.re - num.re * den.im) / d };
}

/**
 * What a gyrator stage's parts give: the f0 and Q of its exact
 * denominator, its gain at that f0, |H(j omega0)|, and the zero
 * 1/(R2 Cg) (rad/s) that leaks R1/(R + R1) through at DC.
 */
export function rlcGyratorActual(components) {
	const { C, R1, R2, Cg } = components;
	const { R } = rlcThevenin(components);
	const wn = Math.sqrt((R + R1) / (C * R * R1 * R2 * Cg));
	const a = 1 / (R * C) + 1 / (R2 * C) + 1 / (R2 * Cg);
	const h = rlcGyratorResponse(components, wn / (2 * Math.PI));
	return { wn, q: wn / a, gain: Math.hypot(h.re, h.im), wz: 1 / (R2 * Cg) };
}

/**
 * The exact 1/R and 1/R2 for f0 and Q on target, from C, Cg and R1:
 * with g = 1/R and h = 1/R2,
 *   omega0^2 C Cg = (1/R1 + g) h,   omega0/Q = g/C + h (1/C + 1/Cg),
 * so C k h^2 - (1/R1 + C omega0/Q) h + omega0^2 C Cg = 0, k = 1/C + 1/Cg,
 * whose smaller root (the larger R2, the smaller loss) is taken. Null when
 * the loss alone already exceeds omega0/Q.
 */
function gyratorSolve(wn, q, C, Cg, R1) {
	const k = 1 / C + 1 / Cg;
	const b = 1 / R1 + (C * wn) / q;
	const disc = b * b - 4 * C * k * wn * wn * C * Cg;
	if (!(disc >= 0)) return null;
	const h = (b - Math.sqrt(disc)) / (2 * C * k);
	const g = C * (wn / q - h * k);
	if (!(h > 0 && g > 0)) return null;
	return { R: 1 / g, R2: 1 / h };
}

/**
 * The 1/R that puts Q on target once R1 and R2 are rounded (f0 then
 * follows R1 R2, which g barely moves): q^2 (g/C + h k)^2 = (g + 1/R1) h / (C Cg),
 * a quadratic in g, its positive root.
 */
function gyratorSolveR(q, C, Cg, R1, R2) {
	const h = 1 / R2;
	const k = 1 / C + 1 / Cg;
	const A = (q * q) / (C * C);
	const B = (2 * q * q * h * k) / C - h / (C * Cg);
	const Cc = q * q * h * h * k * k - h / (R1 * C * Cg);
	const disc = B * B - 4 * A * Cc;
	if (!(disc >= 0)) return null;
	const g = (-B + Math.sqrt(disc)) / (2 * A);
	return g > 0 ? 1 / g : null;
}

/** The stocked values to try for a part: the nearest to its target and the stocked values either side of it. */
function rlcNear(target, resistorSeries, pairs, name) {
	const nearest = stockResistor(target, resistorSeries, pairAllowed(pairs, name));
	const near = stockBetween(target / 1.5, target * 1.5, resistorSeries);
	const i = near.indexOf(nearest);
	return i < 0 ? [nearest] : near.slice(Math.max(0, i - 1), i + 2);
}

/**
 * The input divider for a centre gain alpha: Ra = R / alpha and Rb = R /
 * (1 - alpha), so Ra || Rb = R. Each is tried at the stocked values around
 * its target, and the pair whose alpha and Ra || Rb land closest is kept
 * (Q follows Ra || Rb about one for one). Null for an alpha not under 1.
 */
function rlcDivider(R, alpha, resistorSeries, pairs) {
	if (!(alpha > 0 && alpha < 1)) return null;
	const RaTarget = R / alpha;
	const RbTarget = R / (1 - alpha);
	let best = null;
	for (const Ra of rlcNear(RaTarget, resistorSeries, pairs, 'Ra')) {
		for (const Rb of rlcNear(RbTarget, resistorSeries, pairs, 'Rb')) {
			const miss = Math.max(Math.abs(Math.log(Rb / (Ra + Rb) / alpha)), Math.abs(Math.log((Ra * Rb) / (Ra + Rb) / R)));
			if (best === null || miss < best.miss - 1e-12) best = { Ra, Rb, miss };
		}
	}
	return { Ra: best.Ra, Rb: best.Rb, RaTarget, RbTarget };
}

/**
 * The gyrator stage on capacitor C (the tank and the gyrator take the same
 * value). f0 rests on the product R1 R2, so R1 is tried at each stocked
 * value from a little under its target up to GYRATOR_R1_SPAN times it, R2
 * solved against it (exactly, see gyratorSolve) and rounded, R solved
 * against both for the exact Q and rounded with the input, and the R1
 * whose parts land closest for their loss is kept.
 * `gain` is the centre gain asked for, or null for the circuit's own;
 * under the circuit's own it sets the input divider. Returns null when no
 * R1 reaches the Q (the loss alone exceeds it).
 */
function gyratorRealize(wn, q, C, gain, resistorSeries, pairs, gbw = null) {
	const Cg = C;
	const X = 1 / (wn * C);
	const L = X / wn;
	const R1Target = Math.max(GYRATOR_R1, (X * X) / GYRATOR_R2_TOP);
	const exactIdeal = gyratorSolve(wn, q, C, Cg, R1Target);
	if (!exactIdeal) return null;
	const R1s = stockBetween(R1Target / GYRATOR_R1_BELOW, R1Target * GYRATOR_R1_SPAN, resistorSeries);
	if (!R1s.length) R1s.push(stockResistor(R1Target, resistorSeries));
	let best = null;
	for (const R1 of R1s) {
		const exact = gyratorSolve(wn, q, C, Cg, R1);
		if (!exact) continue;
		const R2 = stockResistor(exact.R2, resistorSeries, pairAllowed(pairs, 'R2'));
		const RTarget = gyratorSolveR(q, C, Cg, R1, R2);
		if (!RTarget) continue;
		// the circuit's own centre gain, with the input undivided
		const own = rlcGyratorActual({ Ra: RTarget, C, R1, R2, Cg }).gain;
		// a gain so close to the circuit's own that Ra rounds to R or below needs no divider
		const d = gain !== null && gain < own * (1 - 1e-9) ? rlcDivider(RTarget, gain / own, resistorSeries, pairs) : null;
		const parts = d ? { Ra: d.Ra, Rb: d.Rb, C, R1, R2, Cg } : { Ra: stockResistor(RTarget, resistorSeries, pairAllowed(pairs, 'Ra')), C, R1, R2, Cg };
		const miss = gyratorMiss(rlcGyratorActual(parts), parts, wn, q, d ? gain : null, gbw);
		// a larger R1 is a larger loss: it has to buy a closer f0 (with gbw, on that op-amp too)
		const score = 1000 * miss * miss + GYRATOR_LOSS_WEIGHT * Math.log(own) ** 2;
		if (best === null || score < best.score - 1e-12) best = { parts, d, own, R2Target: exact.R2, RTarget, score };
	}
	if (!best) return null;
	const { parts, d, own, RTarget } = best;
	const ownIdeal = rlcGyratorActual({ Ra: exactIdeal.R, C, R1: R1Target, R2: exactIdeal.R2, Cg }).gain;
	const alphaIdeal = gain !== null ? gain / ownIdeal : 1;
	const theoretical = alphaIdeal < 1 ? { Ra: exactIdeal.R / alphaIdeal, Rb: exactIdeal.R / (1 - alphaIdeal), C, R1: R1Target, R2: exactIdeal.R2, Cg } : { Ra: exactIdeal.R, C, R1: R1Target, R2: exactIdeal.R2, Cg };
	// what the textbook values alone give: L = R1 R2 Cg, R = Q sqrt(L / C)
	const textbook = { L, R: q * X, R1: R1Target, R2: L / (R1Target * Cg), Cg, C };
	const textbookActual = rlcGyratorActual({ Ra: textbook.R, C, R1: textbook.R1, R2: textbook.R2, Cg });
	return {
		parts,
		theoretical,
		own,
		steps: {
			C,
			Cg,
			X,
			L,
			R1Target,
			R2Target: best.R2Target,
			RTarget,
			RaTarget: d ? d.RaTarget : RTarget,
			RbTarget: d ? d.RbTarget : null,
			ownGain: own,
			gainTarget: gain,
			divider: d !== null,
			textbook: { ...textbook, actual: textbookActual },
			resistorSeries
		}
	};
}

function gyratorResult(wn, q, r, { manual = false } = {}) {
	const actual = rlcGyratorActual(r.parts);
	const outOfRange = ![r.parts.Ra, r.parts.R2, ...(r.parts.Rb ? [r.parts.Rb] : [])].every((v) => v > RLC_R_MIN && v < RLC_R_MAX);
	return {
		topology: 'rlcGyrator',
		order: 2,
		buffered: true,
		theoretical: r.theoretical,
		components: r.parts,
		actual,
		steps: { ...r.steps, wn, q },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
}

/** The search's score for one realized candidate: its miss, its own loss, the level of R and a tiny capacitor. */
function gyratorScore(wn, q, gain, r, gbw = null) {
	const actual = rlcGyratorActual(r.parts);
	const miss = gyratorMiss(actual, r.parts, wn, q, r.steps.divider ? gain : null, gbw);
	const inRange = [r.parts.Ra, r.parts.R2, ...(r.parts.Rb ? [r.parts.Rb] : [])].every((v) => v > RLC_R_MIN && v < RLC_R_MAX);
	return 1000 * miss * miss + GYRATOR_LOSS_WEIGHT * Math.log(r.own) ** 2 + 0.25 * Math.log(r.parts.Ra / RLC_R_SWEET) ** 2 + smallCapPenalty(r.parts.C) + (inRange ? 0 : 1000);
}

/**
 * A narrow band-pass stage on an RLC with a gyrator inductor, from the
 * automatic capacitor search: each capacitor (both take one value) is
 * realized as gyratorRealize does and scored on what its rounded parts
 * give, exactly. `gain` is the centre gain wanted (its size): under the
 * circuit's own (under 1, see the loss above) it sets the input divider,
 * at or above it the circuit keeps its own and actual.gain says how much
 * a gain stage has to add. With `pairs` a stage keeps its pairs only when
 * that lands it no further off. With `gbw` (Hz) the search also weighs
 * where a single-pole op-amp of that gain-bandwidth moves f0
 * (rlcGyratorLag), the worse of the two misses counting: the large R2
 * that lowers the loss moves f0 the most. Null when no capacitor builds
 * the stage.
 */
export function designRlcGyrator(wn, q, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false, gbw = null } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size].every((v) => Number.isFinite(v) && v > 0)) return null;
	const search = (p) => {
		let best = null;
		for (const C of capacitorCandidates(capacitors)) {
			const r = gyratorRealize(wn, q, C, size, resistorSeries, p, gbw);
			if (!r) continue;
			const score = gyratorScore(wn, q, size, r, gbw);
			if (!Number.isFinite(score)) continue;
			if (best === null || score < best.score) best = { r, score };
		}
		return best;
	};
	const single = search(false);
	const paired = anyPairAllowed(pairs) ? search(pairs) : null;
	const pick = paired && (!single || paired.score <= single.score) ? paired : single;
	return pick ? gyratorResult(wn, q, pick.r) : null;
}

/** The same stage from a capacitor chosen by hand (the tank and the gyrator). { ok: false } when the loss alone exceeds the Q. */
export function designRlcGyratorFromCap(wn, q, C, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false, gbw = null } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size, C].every((v) => Number.isFinite(v) && v > 0)) return { ok: false };
	const single = gyratorRealize(wn, q, C, size, resistorSeries, false, gbw);
	const paired = anyPairAllowed(pairs) ? gyratorRealize(wn, q, C, size, resistorSeries, pairs, gbw) : null;
	const r = paired && (!single || gyratorScore(wn, q, size, paired, gbw) <= gyratorScore(wn, q, size, single, gbw)) ? paired : single;
	if (!r) return { ok: false };
	return gyratorResult(wn, q, r, { manual: true });
}

/* ------------------------------------------------------------------ GIC */

/** H(j 2 pi f) of a GIC stage, as { re, im }: the RLC with L = Cg R1 R3 R4 / R2. */
export function rlcGicResponse(components, f) {
	const { C, R1, R2, R3, R4, Cg } = components;
	const { R, alpha } = rlcThevenin(components);
	const L = (Cg * R1 * R3 * R4) / R2;
	const w = 2 * Math.PI * f;
	const num = { re: 0, im: (alpha * w * L) / R };
	const den = { re: 1 - w * w * L * C, im: (w * L) / R };
	const d = den.re * den.re + den.im * den.im;
	return { re: (num.re * den.re + num.im * den.im) / d, im: (num.im * den.re - num.re * den.im) / d };
}

/** What a GIC stage's parts give: f0, Q and the centre gain alpha. */
export function rlcGicActual(components) {
	const { C, R1, R2, R3, R4, Cg } = components;
	const { R, alpha } = rlcThevenin(components);
	const L = (Cg * R1 * R3 * R4) / R2;
	return { wn: 1 / Math.sqrt(L * C), q: R * Math.sqrt(C / L), gain: alpha, L };
}

/**
 * The GIC stage on capacitor C (Cg = C): R1 = R3 at each stocked value
 * near X, R4 and R2 the stocked pair whose ratio R4/R2 gives the exact L
 * (ratioPair, R2 near X), then R for the exact Q against the L built and
 * rounded, the closest result kept. A gain under 1 sets the input
 * divider. Null when no pair fits.
 */
function gicRealize(wn, q, C, gain, resistorSeries, pairs) {
	const Cg = C;
	const X = 1 / (wn * C);
	const LTarget = X / wn;
	const divideAsked = gain !== null && gain < 1 - 1e-9;
	// R1 = R3 at each stocked value near X, R4/R2 the stocked ratio for the
	// exact L, R for the exact Q; the parts that land closest are kept, the
	// four near X on a tie
	const Rgs = stockBetween(X / GIC_PAIR_SPAN, X * GIC_PAIR_SPAN, resistorSeries);
	if (!Rgs.length) Rgs.push(stockResistor(X, resistorSeries));
	let best = null;
	for (const Rg of Rgs) {
		const ratio = LTarget / (Cg * Rg * Rg);
		const pair = ratioPair(ratio, resistorSeries, { pairs, other: 'R4', low: X / GIC_PAIR_SPAN, high: X * GIC_PAIR_SPAN, min: RLC_R_MIN, max: RLC_R_MAX, near: X });
		if (!pair) continue;
		const R2 = pair.base;
		const R4 = pair.other;
		const L = (Cg * Rg * Rg * R4) / R2;
		const RTarget = q * Math.sqrt(L / C);
		const d = divideAsked ? rlcDivider(RTarget, gain, resistorSeries, pairs) : null;
		const base = { C, R1: Rg, R2, R3: Rg, R4, Cg };
		const parts = d ? { Ra: d.Ra, Rb: d.Rb, ...base } : { Ra: stockResistor(RTarget, resistorSeries, pairAllowed(pairs, 'Ra')), ...base };
		const miss = rlcMiss(rlcGicActual(parts), wn, q, d ? gain : null);
		const spread = Math.log(Rg / X) ** 2 + Math.log(R2 / X) ** 2 + Math.log(R4 / X) ** 2;
		const score = 1000 * miss * miss + GIC_SPREAD_WEIGHT * spread;
		if (best === null || score < best.score - 1e-12) best = { parts, d, ratio, L, RTarget, score };
	}
	if (!best) return null;
	const { parts, d, L, RTarget } = best;
	const R = q * X;
	const theoretical = divideAsked ? { Ra: R / gain, Rb: R / (1 - gain), C, R1: X, R2: X, R3: X, R4: X, Cg } : { Ra: R, C, R1: X, R2: X, R3: X, R4: X, Cg };
	return { parts, theoretical, steps: { C, Cg, X, LTarget, L, RgTarget: X, R4R2Target: best.ratio, RTarget, RaTarget: d ? d.RaTarget : RTarget, RbTarget: d ? d.RbTarget : null, gainTarget: gain, divider: d !== null, resistorSeries } };
}

function gicResult(wn, q, r, { manual = false } = {}) {
	const p = r.parts;
	const outOfRange = ![p.Ra, p.R1, p.R2, ...(p.Rb ? [p.Rb] : [])].every((v) => v > RLC_R_MIN && v < RLC_R_MAX);
	return {
		topology: 'rlcGic',
		order: 2,
		buffered: true,
		theoretical: r.theoretical,
		components: p,
		actual: rlcGicActual(p),
		steps: { ...r.steps, wn, q },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
}

function gicScore(wn, q, gain, r) {
	const p = r.parts;
	const miss = rlcMiss(rlcGicActual(p), wn, q, r.steps.divider ? gain : null);
	const inRange = [p.Ra, p.R1, p.R2, ...(p.Rb ? [p.Rb] : [])].every((v) => v > RLC_R_MIN && v < RLC_R_MAX);
	return 1000 * miss * miss + Math.log(p.R1 / RLC_R_SWEET) ** 2 + 0.25 * Math.log(p.Ra / RLC_R_SWEET) ** 2 + smallCapPenalty(p.C) + (inRange ? 0 : 1000);
}

/**
 * A narrow band-pass stage on an RLC with Antoniou's GIC for L, from the
 * automatic capacitor search (the tank and the GIC take one value), the
 * GIC's resistors near 10 kilo-ohm. `gain` under 1 sets the input
 * divider; at 1 or above the stage keeps its gain of 1. Null when no
 * capacitor keeps the parts in range.
 */
export function designRlcGic(wn, q, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size].every((v) => Number.isFinite(v) && v > 0)) return null;
	const search = (p) => {
		let best = null;
		for (const C of capacitorCandidates(capacitors)) {
			const X = 1 / (wn * C);
			if (!(X > RLC_R_MIN && X < RLC_R_MAX && q * X > RLC_R_MIN && q * X < RLC_R_MAX)) continue;
			const r = gicRealize(wn, q, C, size, resistorSeries, p);
			if (!r) continue;
			const score = gicScore(wn, q, size, r);
			if (best === null || score < best.score) best = { r, score };
		}
		return best;
	};
	const single = search(false);
	const paired = anyPairAllowed(pairs) ? search(pairs) : null;
	const pick = paired && (!single || paired.score <= single.score) ? paired : single;
	return pick ? gicResult(wn, q, pick.r) : null;
}

/** The same stage from a capacitor chosen by hand. Always realizable; { ok: false } only for figures that are not positive numbers. */
export function designRlcGicFromCap(wn, q, C, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size, C].every((v) => Number.isFinite(v) && v > 0)) return { ok: false };
	const single = gicRealize(wn, q, C, size, resistorSeries, false);
	const paired = anyPairAllowed(pairs) ? gicRealize(wn, q, C, size, resistorSeries, pairs) : null;
	const r = paired && (!single || gicScore(wn, q, size, paired) <= gicScore(wn, q, size, single)) ? paired : single;
	if (!r) return { ok: false };
	return gicResult(wn, q, r, { manual: true });
}
