import { anyPairAllowed, capacitorCandidates, pairAllowed, ratioPair, smallCapPenalty, stockBetween, stockResistor } from './eseries';

/**
 * Sallen-Key band-pass, the equal-R equal-C form: Ra from the input to
 * node X, C1 from X to ground, C2 from X to the + input P, R2 from P to
 * ground, R3 from X back to the output, and the op-amp a non-inverting
 * amplifier of gain K = 1 + Rf/Rg (Rg from its - input to ground, Rf from
 * there to the output). KCL at P and at X give, for any parts (G1 = 1/Ra,
 * plus 1/Rb when an Rb runs from X to ground),
 *
 *   H(s) = (K s / (Ra C1)) / (s^2 + s omega0/Q + omega0^2)
 *   omega0^2 = (G1 + 1/R3) / (C1 C2 R2)
 *   omega0/Q = (G1 + (1 - K)/R3) / C1 + 1/(C2 R2) + 1/(C1 R2)
 *
 * and with every R equal and both C equal, tau = R C,
 *   H(s) = K tau s / ((tau s)^2 + tau (4 - K) s + 2)
 *   omega0 = sqrt(2) / tau,   Q = sqrt(2) / (4 - K),
 *   centre gain K / (4 - K) = 2 sqrt(2) Q - 1,
 * so K = 4 - sqrt(2)/Q, under 4 (at 4 the circuit oscillates). The price is
 * the sensitivity: S^Q_K = K / (4 - K), the centre gain itself (13 at Q =
 * 5), and through K the gain resistors carry (K - 1)/(4 - K) each.
 *
 * Gain: the input resistor split into Ra and Rb (Rb from X to ground)
 * with Ra || Rb = R feeds X from Rb/(Ra + Rb) of the input through R, so
 * the centre gain comes down to any value under the circuit's own;
 * above it the circuit keeps its own and a gain stage after it adds the
 * rest.
 *
 * Rounding, against the parts already rounded: R3, then the input (Ra,
 * or Ra for the gain and Rb for Ra || Rb), then R2 for the exact f0, then
 * K for the exact Q, Rf/Rg the stocked pair closest to K - 1 (ratioPair):
 * the steep S^Q_K makes the ratio, not either resistor, what counts. Q
 * moves nearly as steeply with R3 and with the input resistors, so each
 * of them is tried at the few stocked values around its target, the rest
 * solved again every time, and the closest result is kept.
 */

const SKBP_R_MIN = 200;
const SKBP_R_MAX = 2_000_000;
const SKBP_R_SWEET = 10_000;

const skbpF0Weight = (q) => Math.max(1, 2 * q);
/**
 * The largest Q miss (as a log, 25 %) a stage may keep: with S^Q_K over 10
 * a stock with few ratios can land Q anywhere, and such a stage is refused.
 */
const SKBP_Q_LIMIT = Math.log(1.25);
/** How far from its target a neighbour of the nearest value may lie and still be tried. */
const SKBP_SPAN = 1.5;

/** The input conductance G1 (1/Ra + 1/Rb) and the K of a set of parts. */
function skbpInput({ Ra, Rb, Rf, Rg }) {
	return { G1: 1 / Ra + (Number.isFinite(Rb) && Rb > 0 ? 1 / Rb : 0), K: 1 + Rf / Rg };
}

/** omega0, omega0/Q and the numerator K/(Ra C1) of a set of parts. */
function skbpCoefficients(c) {
	const { G1, K } = skbpInput(c);
	const { Ra, C1, C2, R2, R3 } = c;
	const b = (G1 + 1 / R3) / (C1 * C2 * R2);
	const a = (G1 + (1 - K) / R3) / C1 + 1 / (C2 * R2) + 1 / (C1 * R2);
	return { a, b, n: K / (Ra * C1), K };
}

/** What a set of parts gives: f0, Q, the centre gain (positive) and K. A circuit with omega0/Q at or under zero is unstable: q is then Infinity or negative. */
export function sallenKeyBpActual(components) {
	const { a, b, n, K } = skbpCoefficients(components);
	const wn = Math.sqrt(b);
	return { wn, q: wn / a, gain: n / a, K };
}

/** H(j 2 pi f) of a stage, exact, as { re, im }. */
export function sallenKeyBpResponse(components, f) {
	const { a, b, n } = skbpCoefficients(components);
	const w = 2 * Math.PI * f;
	const den = { re: b - w * w, im: a * w };
	const d = den.re * den.re + den.im * den.im;
	return { re: (n * w * den.im) / d, im: (n * w * den.re) / d };
}

/**
 * The op-amp gain K at which a set of parts oscillates: omega0/Q falls to
 * zero there, at K = 1 + R3 G1 + (R3/R2)(1 + C1/C2), G1 = 1/Ra (+ 1/Rb).
 * That is 4 with every part equal; with the parts as rounded it can sit
 * closer. Returns { K (the limit), margin (how far Rf/Rg may grow before
 * it, as a fraction), sensitivity (S^Q_K = K/(Klimit - K) on these parts) }.
 */
export function sallenKeyBpLimit(components) {
	const { G1, K } = skbpInput(components);
	const { C1, C2, R2, R3 } = components;
	const limit = 1 + R3 * G1 + (R3 / R2) * (1 + C1 / C2);
	return { K: limit, margin: (limit - 1) / (K - 1) - 1, sensitivity: K / (limit - K) };
}

/** The circuit's own centre gain at a Q, 2 sqrt(2) Q - 1, with K = 4 - sqrt(2)/Q. */
export function sallenKeyBpOwnGain(q) {
	return 2 * Math.SQRT2 * q - 1;
}

/**
 * The stage on capacitor C (C1 = C2 = C) with R3 and the input given (Ra,
 * and Rb or null): R2 solved for the exact f0 and rounded, then K for the
 * exact Q, Rf/Rg the stocked pair closest to it. Null when K falls out of
 * (1, 4) or no stocked pair gives it.
 */
function skbpWith(wn, q, C, R3, Ra, Rb, resistorSeries, pairs) {
	const G1 = 1 / Ra + (Rb ? 1 / Rb : 0);
	const R2Target = (G1 + 1 / R3) / (wn * wn * C * C);
	const R2 = stockResistor(R2Target, resistorSeries, pairAllowed(pairs, 'R2'));
	const wnBuilt = Math.sqrt((G1 + 1 / R3) / (C * C * R2));
	// K for the exact Q with the parts as rounded
	const KTarget = 1 + R3 * (G1 + 2 / R2 - (C * wnBuilt) / q);
	if (!(KTarget > 1 && KTarget < 4)) return null;
	const pair = ratioPair(KTarget - 1, resistorSeries, { pairs, other: 'Rf' });
	if (!pair) return null;
	return { parts: { Ra, ...(Rb ? { Rb } : {}), C1: C, C2: C, R2, R3, Rg: pair.base, Rf: pair.other }, R2Target, KTarget };
}

/** The stocked values to try for a part: the nearest to its target and the stocked values either side of it. */
function skbpNear(target, resistorSeries, pairs, name) {
	const nearest = stockResistor(target, resistorSeries, pairAllowed(pairs, name));
	const near = stockBetween(target / SKBP_SPAN, target * SKBP_SPAN, resistorSeries);
	const i = near.indexOf(nearest);
	// the nearest value and its two neighbours (a pair has none)
	return i < 0 ? [nearest] : near.slice(Math.max(0, i - 1), i + 2);
}

/**
 * The stage on capacitor C (C1 = C2 = C). `gain` is the centre gain asked
 * for: under the circuit's own it sets the input divider. Q follows K - 1
 * some 10 times over (S^Q_K), and nearly as steeply R3 and the input, so
 * R3, Ra and Rb are each tried at the stocked values around their
 * targets, R2 and K solved again every time, and the combination whose
 * parts land closest is kept. Null when Q is out of the circuit's reach
 * (K must stay over 1, so Q over sqrt(2)/3), when no stocked pair gives K,
 * or when the closest still misses Q by more than SKBP_Q_LIMIT.
 */
function skbpRealize(wn, q, C, gain, resistorSeries, pairs) {
	const R = Math.SQRT2 / (wn * C);
	const KIdeal = 4 - Math.SQRT2 / q;
	if (!(KIdeal > 1)) return null;
	const own = KIdeal / (4 - KIdeal);
	const divide = gain < own * (1 - 1e-9);
	const RaTarget = divide ? (R * own) / gain : R;
	const RbTarget = divide ? R / (1 - gain / own) : null;
	const RaList = skbpNear(RaTarget, resistorSeries, pairs, 'Ra');
	const RbList = divide ? skbpNear(RbTarget, resistorSeries, pairs, 'Rb') : [null];
	let best = null;
	for (const R3 of skbpNear(R, resistorSeries, pairs, 'R3')) {
		for (const Ra of RaList) {
			for (const Rb of RbList) {
				const r = skbpWith(wn, q, C, R3, Ra, Rb, resistorSeries, pairs);
				if (!r) continue;
				const actual = sallenKeyBpActual(r.parts);
				if (!(actual.q > 0 && Number.isFinite(actual.q))) continue;
				const miss = skbpMiss(actual, wn, q, divide ? gain : null);
				if (best === null || miss < best.miss - 1e-12) best = { r, miss };
			}
		}
	}
	// past SKBP_Q_LIMIT the stock has no ratio close enough: refused rather than built that far off
	if (!best || !(Math.abs(Math.log(sallenKeyBpActual(best.r.parts).q / q)) <= SKBP_Q_LIMIT)) return null;
	const { parts, R2Target, KTarget } = best.r;
	const theoretical = divide ? { Ra: RaTarget, Rb: RbTarget, C1: C, C2: C, R2: R, R3: R, Rg: parts.Rg, Rf: (KIdeal - 1) * parts.Rg } : { Ra: R, C1: C, C2: C, R2: R, R3: R, Rg: parts.Rg, Rf: (KIdeal - 1) * parts.Rg };
	return { parts, theoretical, steps: { C, R, KIdeal, ownGain: own, gainTarget: gain, divider: divide, RaTarget, RbTarget, R2Target, KTarget, sensitivityK: KIdeal / (4 - KIdeal), resistorSeries } };
}

function skbpMiss(actual, wn, q, gain) {
	const m = Math.max(skbpF0Weight(q) * Math.abs(Math.log(actual.wn / wn)), Math.abs(Math.log(actual.q / q)));
	return gain === null ? m : Math.max(m, Math.abs(Math.log(actual.gain / gain)));
}

function skbpScore(wn, q, gain, r) {
	const p = r.parts;
	const actual = sallenKeyBpActual(p);
	if (!(actual.q > 0 && Number.isFinite(actual.q))) return Infinity;
	const miss = skbpMiss(actual, wn, q, r.steps.divider ? gain : null);
	const inRange = [p.Ra, p.R2, p.R3, ...(p.Rb ? [p.Rb] : [])].every((v) => v > SKBP_R_MIN && v < SKBP_R_MAX);
	return 1000 * miss * miss + Math.log(p.R3 / SKBP_R_SWEET) ** 2 + smallCapPenalty(p.C1) + (inRange ? 0 : 1000);
}

function skbpResult(wn, q, r, manual = false) {
	const p = r.parts;
	const outOfRange = ![p.Ra, p.R2, p.R3, ...(p.Rb ? [p.Rb] : [])].every((v) => v > SKBP_R_MIN && v < SKBP_R_MAX);
	return {
		topology: 'sallenKeyBp',
		order: 2,
		theoretical: r.theoretical,
		components: p,
		actual: sallenKeyBpActual(p),
		steps: { ...r.steps, wn, q },
		...(manual ? { ok: true, manual: true, outOfRange } : {})
	};
}

/**
 * A narrow band-pass stage on the Sallen-Key band-pass, from the automatic
 * capacitor search: R near 10 kilo-ohm, scored on what the rounded parts
 * give. `gain` (its size) under the circuit's own centre gain sets the
 * input divider; at or above it the stage keeps its own and actual.gain
 * says what is left for a gain stage. Null when no capacitor builds it.
 */
export function designSallenKeyBandPass(wn, q, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size].every((v) => Number.isFinite(v) && v > 0)) return null;
	const search = (p) => {
		let best = null;
		for (const C of capacitorCandidates(capacitors)) {
			const R = Math.SQRT2 / (wn * C);
			if (!(R > SKBP_R_MIN && R < SKBP_R_MAX)) continue;
			const r = skbpRealize(wn, q, C, size, resistorSeries, p);
			if (!r) continue;
			const score = skbpScore(wn, q, size, r);
			if (!Number.isFinite(score)) continue;
			if (best === null || score < best.score) best = { r, score };
		}
		return best;
	};
	const single = search(false);
	const paired = anyPairAllowed(pairs) ? search(pairs) : null;
	const pick = paired && (!single || paired.score <= single.score) ? paired : single;
	return pick ? skbpResult(wn, q, pick.r) : null;
}

/** The same stage from a capacitor chosen by hand (C1 = C2 = C). { ok: false } when the Q is out of reach, or no stocked pair brings it within SKBP_Q_LIMIT. */
export function designSallenKeyBandPassFromCap(wn, q, C, { gain = 1, resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const size = Math.abs(gain);
	if (![wn, q, size, C].every((v) => Number.isFinite(v) && v > 0)) return { ok: false };
	const single = skbpRealize(wn, q, C, size, resistorSeries, false);
	const paired = anyPairAllowed(pairs) ? skbpRealize(wn, q, C, size, resistorSeries, pairs) : null;
	const r = paired && (!single || skbpScore(wn, q, size, paired) <= skbpScore(wn, q, size, single)) ? paired : single;
	if (!r) return { ok: false };
	return skbpResult(wn, q, r, true);
}
