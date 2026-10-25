import { anyPairAllowed, capacitorCandidates, nearestResistor, pairAllowed, pairedResistor, pairSubsets, seriesPair } from '../filter/eseries';
import { ladderTransfer, retune, retuneQuadrature, solveBalance, solvePole, stageLagDeg, TWO_PI, zeroPhase } from './loop';
import { agcAmplitude, DIODES, dividerClampAmplitude, feedbackLimiterAmplitude, JFETS, lampModel, sizeAgc, sizeDividerClamp, sizeFeedbackLimiter } from './limiter';

/**
 * Sine-wave oscillator design. Every topology here is a loop with exactly
 * enough gain to sustain itself: Barkhausen's condition, |A*beta| = 1 with
 * zero net phase around the loop. What separates them is which network
 * supplies the phase, how much gain that network costs, and therefore how
 * hard the amplifier has to work at the oscillation frequency.
 *
 * Reference for the measured distortion figures: Texas Instruments
 * SLOA060, "Sine-Wave Oscillator" (Mancini and Palmer, 2001), which builds
 * and measures all of these. Where that note's own analysis assumes the RC
 * sections do not load each other, the exact loaded result is used instead
 * and the difference is explained (see PHASE_SHIFT below).
 */

const CAP_MIN = 100e-12;
const CAP_MAX = 1e-6;
const R_MIN = 1_000;
const R_MAX = 1_000_000;
const R_SWEET = 10_000;

export const TOPOLOGIES = [
	{
		id: 'wien',
		label: 'Wien bridge',
		short: 'Wien',
		opamps: 1,
		/** f0 = k / (2 pi R C) */
		k: 1,
		/** gain the amplifier must supply */
		gain: 3,
		outputs: 'one',
		summary: 'One op-amp, an RC series and an RC parallel arm. The loop loses only 1/3 at f0, so the amplifier needs a gain of just 3: the lowest of any of these, which is why it is the least demanding on the op-amp and the easiest to make clean.'
	},
	{
		id: 'phaseShift',
		label: 'Phase shift, single op-amp',
		short: 'Phase shift',
		opamps: 1,
		ladder: { sections: 3, buffered: false },
		outputs: 'one',
		summary: 'One inverting op-amp and a three-section RC ladder that supplies the missing 180 degrees. Fewest parts of all, but the ladder throws away 29/30 of the signal, so the amplifier needs a gain of 29.'
	},
	{
		id: 'bufferedPhaseShift',
		label: 'Buffered phase shift',
		short: 'Buffered',
		opamps: 3,
		ladder: { sections: 3, buffered: true },
		outputs: 'one',
		summary: 'The same ladder with a unity-gain buffer between the sections, so they stop loading each other. The frequency then lands where the simple formula says and the gain drops to 8, at the cost of two more op-amps.'
	},
	{
		id: 'bubba',
		label: 'Bubba',
		short: 'Bubba',
		opamps: 4,
		ladder: { sections: 4, buffered: true },
		outputs: 'quadrature',
		summary: 'Four buffered sections of 45 degrees each. Spreading the phase over four sections makes the loop phase change fastest with frequency, which is what pins the frequency down best, and taps 45 degrees apart give quadrature outputs.'
	},
	{
		id: 'quadrature',
		label: 'Quadrature (two integrators)',
		short: 'Quadrature',
		opamps: 3,
		k: 1,
		gain: 1,
		outputs: 'quadrature',
		summary: 'Two integrators and an inverter in a loop, the same loop as a Tow-Thomas filter with its damping removed. Each integrator turns the signal by 90 degrees, so the two outputs are a true sine and cosine pair.'
	}
];

export const TOPOLOGY_BY_ID = Object.fromEntries(TOPOLOGIES.map((t) => [t.id, t]));

/**
 * Amplitude stabilization. An oscillator needs loop gain above 1 to start
 * and exactly 1 to stay put; something has to pull it back, and what that
 * something is decides the distortion.
 */
export const STABILIZERS = [
	{
		id: 'diodes',
		label: 'Diode limiting',
		thd: 0.01,
		parts: 'two diodes and one resistor',
		summary: 'Two diodes back to back across part of the feedback resistor. Below their forward drop they do nothing and the loop gain sits above 1; as the output grows they conduct and shunt that part away, dropping the gain under 1. Cheap, reliable, starts every time. The diodes bend the peaks a little, hence about a percent of distortion.'
	},
	{
		id: 'lamp',
		label: 'Incandescent lamp',
		thd: 0.001,
		parts: 'one small lamp',
		summary: 'A small filament lamp in the lower feedback leg. Its resistance rises as it heats, so more output means less gain, with no kink anywhere in the waveform: the cleanest of the three (TI measured under 0.1 percent). The catch is that the control is thermal, so the amplitude drifts with room temperature, the loop takes a second to settle, and lamps of the right rating are hard to buy now.'
	},
	{
		id: 'jfet',
		label: 'JFET automatic gain control',
		thd: 0.002,
		parts: 'a JFET, a diode, two resistors and a capacitor',
		summary: 'A JFET used as a voltage-controlled resistor in the lower feedback leg, its gate driven by a rectified sample of the output. Nothing in the signal path ever clips, so distortion stays under about 0.2 percent, and unlike the lamp every part is still sold. The cost is the extra parts and a loop that can overshoot on start-up if the detector capacitor is too small.'
	}
];

export const STABILIZER_BY_ID = Object.fromEntries(STABILIZERS.map((s) => [s.id, s]));

/**
 * Measured total harmonic distortion from SLOA060, used as the reference
 * figure for each topology. The Wien bridge's depends entirely on the
 * stabilizer, so it is taken from STABILIZERS instead.
 */
const MEASURED_THD = {
	phaseShift: { main: 0.0046, note: 'measured 0.46 %' },
	bufferedPhaseShift: { main: 0.012, note: 'measured 1.2 %' },
	bubba: { main: 0.011, second: 0.001, note: 'measured 1.1 % at the sine tap, 0.1 % at the cosine tap' },
	quadrature: { main: 0.0085, second: 0.0046, note: 'measured 0.85 % at the sine output, 0.46 % at the cosine' }
};

/* ------------------------------------------------- the RC ladder, exactly */

/**
 * Where the ladder turns the signal by exactly 180 degrees with an ideal
 * amplifier, and how much of it survives there. Returns x0 = omega0 R C
 * and the gain the amplifier must supply, 1 / |beta|. The ladder itself
 * lives in loop.js so the same code serves the real-op-amp analysis.
 */
export function solveLadder(n, { buffered = false, loadRatio = Infinity } = {}) {
	const imag = (x) => ladderTransfer(n, { re: 0, im: x }, { buffered, loadRatio }).im;
	let lo = 1e-3;
	let hi = 100;
	if (imag(lo) * imag(hi) > 0) return null;
	for (let i = 0; i < 200; i++) {
		const mid = Math.sqrt(lo * hi);
		if (imag(lo) * imag(mid) <= 0) hi = mid;
		else lo = mid;
	}
	const x0 = Math.sqrt(lo * hi);
	const beta = ladderTransfer(n, { re: 0, im: x0 }, { buffered, loadRatio });
	return { x0, gain: 1 / Math.hypot(beta.re, beta.im), betaSign: Math.sign(beta.re) };
}

// The three ladder topologies get their frequency constant and required
// gain from the exact solver rather than from a quoted formula. The last
// resistor of the ladder is the amplifier's input resistor Rg, whose far
// end is the virtual ground, so the ladder is unloaded: that is why the
// textbook values (sqrt 6 and 29, sqrt 3 and 8, 1 and 4) are exact here,
// and why an arrangement that hangs an extra Rg on the end instead needs
// far more gain.
for (const t of TOPOLOGIES) {
	if (!t.ladder) continue;
	const solved = solveLadder(t.ladder.sections, { buffered: t.ladder.buffered, loadRatio: Infinity });
	t.k = solved.x0;
	t.gain = solved.gain;
	t.solved = solved;
}

/**
 * Picks C from a preferred series so that R lands near 10 kohm, for a wanted
 * R C product. R sets the frequency, so with `pairs` on (and a list of parts
 * on hand), or a whitelist naming 'R', it may then be two resistors in
 * series for the same C.
 */
function pickRC(rcTarget, capacitors, resistorSeries, pairs = false) {
	let best = null;
	for (const c of capacitorCandidates(capacitors)) {
		if (c < CAP_MIN || c > CAP_MAX) continue;
		const rTarget = rcTarget / c;
		if (!(rTarget > R_MIN && rTarget < R_MAX)) continue;
		const r = nearestResistor(rTarget, resistorSeries);
		// accuracy first: the frequency error this pair leaves after R is
		// rounded, then, far behind, how close R sits to a comfortable value
		const score = 100 * Math.log(r / rTarget) ** 2 + 0.05 * Math.log(r / R_SWEET) ** 2;
		if (best === null || score < best.score) best = { c, r, rTarget, score };
	}
	// pairedResistor keeps the single value unless two in series at least
	// halve its miss, so the frequency can only come closer
	if (best && pairAllowed(pairs, 'R')) best = { ...best, r: pairedResistor(best.rTarget, resistorSeries, true) };
	return best;
}

/** Nearest stocked capacitor to a target. */
function pickCapacitor(target, capacitors) {
	const all = capacitorCandidates(capacitors);
	return all.reduce((best, cc) => (Math.abs(Math.log(cc / target)) < Math.abs(Math.log(best / target)) ? cc : best), all[0]);
}

/**
 * Distortion of a diode limiter, per unit of excess loop gain, measured
 * on LTspice runs of the circuits this tool exports (the diodes have to
 * bend the peaks harder the more gain they must remove, and the ladder
 * topologies sit behind a network that filters the amplifier's harmonics
 * before they reach the tap). These are estimates of the third harmonic
 * mostly; the hardware figures TI measured (MEASURED_THD) are kept as
 * the reference for what a built one does.
 */
const THD_PER_EXCESS = { wien: 0.62, phaseShift: 0.1, bufferedPhaseShift: 0.1, bubba: 0.1 };

/**
 * The frequency at which the textbook RC values, with this op-amp, would
 * land 10 % low: the point past which the retune is doing real work and
 * a slower part than expected would show up at once. Bisection on log f.
 */
function frequencyCeiling(kind, base, { k, gain, rho, fStart }) {
	const errorAt = (f) => {
		const rc = k / (TWO_PI * f);
		const r = kind === 'quadrature' ? solvePole('quadrature', { ...base, rc, rho }, { omega0: 1 / rc }) : zeroPhase(kind, { ...base, rc, gain }, { omega0: k / rc });
		return r.converged ? r.omega / (TWO_PI * f) - 1 : -1;
	};
	// walk up from well below the target until the shift passes 10 %, then bisect
	let lo = Math.min(fStart, 10);
	if (errorAt(lo) <= -0.1) return lo;
	let hi = lo;
	for (let i = 0; i < 80; i++) {
		hi *= 1.3;
		if (errorAt(hi) <= -0.1) break;
		lo = hi;
		if (hi > 1e9) return Infinity;
	}
	for (let i = 0; i < 40; i++) {
		const mid = Math.sqrt(lo * hi);
		if (errorAt(mid) > -0.1) lo = mid;
		else hi = mid;
	}
	return Math.sqrt(lo * hi);
}

/**
 * The parts that set the loop gain and hold the amplitude, for a Wien
 * bridge with any of its three stabilizers or for a ladder with its
 * inverting stage and diode limiter. Returns { parts, limiter }.
 *
 * With `pairs` on, the resistors that set the start gain and the amplitude
 * may be two in series: Rf1 and Rf2 of a diode limiter, and the AGC's
 * divider Ra (and its series resistor, when no single value fits). A lamp's
 * or an AGC's Rf only scales the rest of the leg, so it stays one part.
 */
function sizeStabilizer({ topology, stabilizer, requiredGain, excessGain, r, c, rg, amplitude, frequency, diode, jfet, resistorSeries, capacitors, pairs = false }) {
	const gStartTarget = requiredGain * (1 + excessGain);
	let parts = { r, c, rg };
	let limiter;
	if (topology === 'wien') {
		const stab = STABILIZER_BY_ID[stabilizer] ?? STABILIZER_BY_ID.diodes;
		const rfBalance = (requiredGain - 1) * rg;
		if (stab.id === 'diodes') {
			const fraction = (requiredGain - 1) / requiredGain;
			const rs = (gStartTarget - 1) * rg;
			const sz = sizeFeedbackLimiter({ rt: rfBalance, rs, amplitude, fraction, diode, resistorSeries, pairs });
			const rf1 = sz ? sz.rf1 : pairedResistor(0.1 * rs, resistorSeries, pairAllowed(pairs, 'Rf1'));
			const rf2 = sz ? sz.rf2 : pairedResistor(0.9 * rs, resistorSeries, pairAllowed(pairs, 'Rf2'));
			const gainStart = 1 + (rf1 + rf2) / rg;
			const gainLimited = 1 + rf1 / rg;
			const amplitudeActual = feedbackLimiterAmplitude({ rf1, rf2, rt: rfBalance, fraction, diode });
			parts = { ...parts, rf1, rf2 };
			limiter = {
				kind: 'diodes',
				rf1,
				rf2,
				rf1Target: sz?.rf1Target ?? null,
				rf2Target: sz?.rf2Target ?? null,
				gainStart,
				gainLimited,
				amplitudeActual,
				sized: !!sz,
				regulates: amplitudeActual !== null && gainStart > requiredGain
			};
		} else if (stab.id === 'lamp') {
			const rf = nearestResistor(rfBalance, resistorSeries);
			const rHot = rf / (requiredGain - 1);
			const lamp = lampModel({ rHot, vLampPeak: amplitude / requiredGain, f0: frequency });
			parts = { ...parts, rf };
			limiter = { kind: 'lamp', rf, ...lamp, lampHot: rHot, lampCold: lamp.rCold, gainStart: 1 + rf / lamp.rCold, gainLimited: 1, amplitudeActual: amplitude, regulates: true };
		} else {
			const rf = nearestResistor(rfBalance, resistorSeries);
			const agc = sizeAgc({ rf, gBalance: requiredGain, amplitude, jfet, diode, resistorSeries, pairs });
			if (!agc.ok) {
				parts = { ...parts, rf };
				limiter = { kind: 'jfet', rf, gainStart: NaN, gainLimited: 1, amplitudeActual: null, regulates: false, minAmplitude: agc.minAmplitude, rdsOn: agc.rdsOn, jfet: jfet.id };
			} else {
				const settle = agcAmplitude({ rf, rSeries: agc.rSeries, ra: agc.ra, rb: agc.rb, rx: agc.rx, gBalance: requiredGain, jfet, diode });
				// the detector's time constant must be long next to one cycle
				const tauTarget = 50 / frequency;
				const cDet = pickCapacitor(tauTarget / (agc.ra + agc.rb), capacitors);
				const tau = cDet * (agc.ra + agc.rb);
				parts = { ...parts, rf, rSeries: agc.rSeries, ra: agc.ra, rb: agc.rb, rx: agc.rx, cDet };
				limiter = {
					kind: 'jfet',
					rf,
					rSeries: agc.rSeries,
					ra: agc.ra,
					rb: agc.rb,
					rx: agc.rx,
					cDet,
					tau,
					cyclesPerTau: tau * frequency,
					rBalance: agc.rBalance,
					rdsOn: agc.rdsOn,
					vgsNeeded: agc.vgsNeeded,
					vPeak: agc.vPeak,
					minAmplitude: agc.minAmplitude,
					jfet: jfet.id,
					gainStart: settle ? settle.gainStart : NaN,
					gainLimited: 1,
					amplitudeActual: settle ? settle.amplitude : null,
					regulates: !!settle && settle.gainStart > requiredGain
				};
			}
		}
	} else {
		// every ladder sets its loop gain with one inverting stage whose
		// input is a virtual ground, so the whole output sits across the
		// feedback string
		const rt = requiredGain * rg;
		const rs = gStartTarget * rg;
		const sz = sizeFeedbackLimiter({ rt, rs, amplitude, fraction: 1, diode, resistorSeries, pairs });
		const rf1 = sz ? sz.rf1 : pairedResistor(0.1 * rs, resistorSeries, pairAllowed(pairs, 'Rf1'));
		const rf2 = sz ? sz.rf2 : pairedResistor(0.9 * rs, resistorSeries, pairAllowed(pairs, 'Rf2'));
		const rf = rf1 + rf2;
		const gainStart = rf / rg;
		const gainLimited = rf1 / rg;
		const amplitudeActual = feedbackLimiterAmplitude({ rf1, rf2, rt, fraction: 1, diode });
		parts = { ...parts, rf, rf1, rf2 };
		limiter = {
			kind: 'diodes',
			rf,
			rf1,
			rf2,
			rf1Target: sz?.rf1Target ?? null,
			rf2Target: sz?.rf2Target ?? null,
			gainStart,
			gainLimited,
			amplitudeActual,
			sized: !!sz,
			regulates: amplitudeActual !== null && gainStart > requiredGain
		};
	}
	return { parts, limiter };
}

/**
 * Designs one oscillator, with the op-amp in the loop from the start.
 *   frequency    Hz wanted at the output
 *   amplitude    V peak wanted at the output
 *   topology     an id from TOPOLOGIES
 *   stabilizer   an id from STABILIZERS (Wien bridge only; the ladders
 *                limit in the amplifier that sets the loop gain and the
 *                quadrature loop is damped, see limiter.js)
 *   diode, jfet  ids from DIODES and JFETS in limiter.js
 *   excessGain   how far above balance the amplifier is set to start
 *   quadGrowth   growth per cycle designed into the quadrature loop
 *   gbw, slewRate, opampSwing   the op-amp
 *   resistorSeries, capacitors  the values on hand (src/lib/stock.js)
 *   pairs        with a list of resistors, let the ones that set the
 *                frequency, the start and the amplitude be two in series
 *                (R, Rf1 and Rf2, Rn, Rd1, the AGC's Ra and its series
 *                resistor Rser); the reference values (Rg, Rd2, Rb, Rx)
 *                and matched pairs stay single. Besides true and false, a
 *                whitelist (an array or a Set of those names, PAIR_PARTS)
 *                lets only the resistors it names pair.
 *   pairLimit    with pairs true, the most resistors of the circuit that may
 *                be two in series (null: as many as help); see
 *                limitedOscillator below
 *
 * Two in series are only kept where they do no harm. At high frequencies
 * the op-amp's lag depends on the start gain, and a limiter that now lands
 * the amplitude closely may land the start gain elsewhere, which moves the
 * frequency; so the oscillator is also designed with one resistor per part,
 * and the pairs version must start and hold its amplitude whenever that
 * one does, and land no further from the frequency asked for (pairsDoNoHarm
 * below). When it does not, the single-part design is returned.
 */
export function designOscillator(options = {}) {
	const limit = pairLimitOf(options);
	if (limit !== null) return limitedOscillator(options, limit);
	const single = designCached({ ...options, pairs: false });
	if (!(anyPairAllowed(options.pairs) && Array.isArray(options.resistorSeries))) return single;
	const paired = designCached({ ...options, pairs: options.pairs });
	return pairsDoNoHarm(paired, single) ? paired : single;
}

/* ------------------------------------------ a limit on the number of pairs */

/**
 * The resistors two in series may stand in for, in the order the page lists
 * them, with where each sits in a design. R is one value for several
 * resistors: both arms of the Wien bridge, both integrators of the
 * quadrature loop, every section of a ladder (its last one is Rg, the
 * amplifier's input resistor). Built from two in series, it is a pair in
 * each of them, so it counts that many times against a limit (pairCost).
 */
export const PAIR_PARTS = [
	{ name: 'R', value: (d) => d.r },
	{ name: 'Rf1', value: (d) => (d.limiter.kind === 'diodes' ? d.parts.rf1 : null) },
	{ name: 'Rf2', value: (d) => (d.limiter.kind === 'diodes' ? d.parts.rf2 : null) },
	{ name: 'Rser', value: (d) => (d.limiter.kind === 'jfet' ? d.parts.rSeries : null) },
	{ name: 'Ra', value: (d) => (d.limiter.kind === 'jfet' ? d.parts.ra : null) },
	{ name: 'Rn', value: (d) => (d.limiter.kind === 'clamp' ? d.parts.rn : null) },
	{ name: 'Rd1', value: (d) => (d.limiter.kind === 'clamp' ? d.parts.rd1 : null) }
];

/** How many resistors the name stands for in this topology: R several, the rest one each. */
export function pairCost(topology, name) {
	if (name !== 'R') return 1;
	const topo = TOPOLOGY_BY_ID[topology];
	return topo?.ladder ? topo.ladder.sections : 2;
}

/** The names of a design's resistors that are two in series, in PAIR_PARTS order. */
export function oscillatorPairNames(design) {
	if (!design?.pairs || !Array.isArray(design.resistorSeries)) return [];
	return PAIR_PARTS.filter((p) => {
		const v = p.value(design);
		return typeof v === 'number' && v > 0 && seriesPair(v, design.resistorSeries) !== null;
	}).map((p) => p.name);
}

/** How many resistors of a design are two in series, each R counted where it sits. */
export function oscillatorPairCount(design) {
	return oscillatorPairNames(design).reduce((n, name) => n + pairCost(design.topology, name), 0);
}

/**
 * What a design misses by, the figure "up to N pairs" ranks designs with
 * (lower is better). It is made of what the designer aims its parts at:
 * the frequency, ln(f0 / f); the amplitude the limiter holds, ln(A held /
 * A asked); and the start the parts set, the start gain against the
 * excess asked for (a diode limiter) or the start-up growth Rn designs in,
 * its rho against ln(1 + growth) / pi (the quadrature loop). A lamp or an
 * AGC starts far above balance by design, so only whether it starts counts
 * there. Each miss is taken in units of what the tool lets pass, squared,
 * and the squares are summed, the way the filter tool sums its stages:
 * 2 % for the frequency (MEASURE_FREQUENCY_SCALE: a single resistor that
 * misses by more is what two in series are for, and every design is
 * checked to land within it), a tenth for the amplitude and the start
 * (MEASURE_AMPLITUDE_SCALE: past it the page flags the amplitude, and the
 * limiter's sizing weighs the start the same as the amplitude). So a
 * 6 % frequency error costs as much as a 30 % amplitude error, and a pair
 * that only fixes the amplitude still counts. A design that does not
 * start, or does not hold its amplitude inside the op-amp's swing, adds a
 * million for each, more than any set of misses, so a working design
 * always ranks first; one that cannot be built is Infinity.
 */
export const MEASURE_FREQUENCY_SCALE = 0.02;
export const MEASURE_AMPLITUDE_SCALE = 0.1;
export function oscillatorMeasure(design, { excessGain = 0.05, quadGrowth = 0.1 } = {}) {
	if (!design) return Infinity;
	const sq = (ratio, scale) => (ratio > 0 && Number.isFinite(ratio) ? (Math.log(ratio) / scale) ** 2 : 0);
	const holds = design.limiter.regulates !== false && design.opamp.swingOk;
	let m = (design.starts ? 0 : 1e6) + (holds ? 0 : 1e6);
	m += sq(design.f0 / design.frequency, MEASURE_FREQUENCY_SCALE);
	if (design.limiter.amplitudeActual > 0) m += sq(design.limiter.amplitudeActual / design.amplitude, MEASURE_AMPLITUDE_SCALE);
	if (design.limiter.kind === 'diodes') m += sq(design.startGain / (design.requiredGain * (1 + excessGain)), MEASURE_AMPLITUDE_SCALE);
	if (design.limiter.kind === 'clamp') m += sq(design.limiter.rho / (Math.log(1 + quadGrowth) / Math.PI), MEASURE_AMPLITUDE_SCALE);
	return m;
}

/** The limit a call asks for: a whole number with `pairs` true and a list, otherwise null (no limit). */
function pairLimitOf(options) {
	const v = options.pairLimit;
	if (options.pairs !== true || !Array.isArray(options.resistorSeries)) return null;
	return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
}

/**
 * Designs already made, by their options, and the designs made under a
 * limit: the page asks for the same design again for its comparison table
 * and on every rerun, a limit tries several whitelists, each a whole
 * design, and the AM tool's carrier tries every whitelist of its R, Rf1 and
 * Rf2 against the same single parts. The oldest goes first once the memo is
 * full. A design is never changed once made, so one object serves every call.
 */
const limitMemo = new Map();
const LIMIT_MEMO_SIZE = 600;
function memoized(key, make) {
	if (limitMemo.has(key)) {
		const hit = limitMemo.get(key);
		limitMemo.delete(key);
		limitMemo.set(key, hit);
		return hit;
	}
	const value = make();
	limitMemo.set(key, value);
	if (limitMemo.size > LIMIT_MEMO_SIZE) limitMemo.delete(limitMemo.keys().next().value);
	return value;
}

/**
 * Whether designOscillator(options) is a design already made under a limit,
 * so asking for it again costs nothing: the page then shows it at once
 * instead of waiting for the typing to pause. False without a limit.
 */
export function oscillatorIsMemoized(options = {}) {
	const limit = pairLimitOf(options);
	if (limit === null) {
		// no limit: designOscillator reads the single design and, where pairs
		// may help, the paired one, both through designCached
		const key = (pairs) => {
			const { pairLimit, ...rest } = { ...options, pairs };
			return `design ${JSON.stringify({ ...rest, pairs: rest.pairs instanceof Set ? [...rest.pairs] : rest.pairs })}`;
		};
		const paired = anyPairAllowed(options.pairs) && Array.isArray(options.resistorSeries);
		return limitMemo.has(key(false)) && (!paired || limitMemo.has(key(options.pairs)));
	}
	const { pairLimit, ...rest } = options;
	return limitMemo.has(`${JSON.stringify(rest)}|limit ${limit}`);
}

/** designWith, kept in the memo by its options (a whitelist as a Set is keyed as the array of its names; pairLimit is not read). */
function designCached(options) {
	const { pairLimit, ...rest } = options;
	const key = { ...rest, pairs: rest.pairs instanceof Set ? [...rest.pairs] : rest.pairs };
	return memoized(`design ${JSON.stringify(key)}`, () => designWith(rest));
}

/** Measures this close, relative to the larger, are a tie, so rounding noise never decides. */
const MEASURE_TIE = 1e-9;
function clearlyBelow(a, b) {
	if (a === b || a === Infinity) return false;
	if (b === Infinity) return true;
	return a < b - MEASURE_TIE * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * The resistors of this oscillator that two in series may stand in for, in
 * PAIR_PARTS order: those its limiter has (Rf1 and Rf2 for diodes, Rser and
 * Ra for an AGC, Rn and Rd1 for the clamp), with R, whether or not pairs
 * where they help made them pairs.
 */
function pairCandidates(designs) {
	return PAIR_PARTS.filter((p) =>
		designs.some((d) => {
			const v = d ? p.value(d) : null;
			return typeof v === 'number' && v > 0;
		})
	).map((p) => p.name);
}

/**
 * "Up to N pairs" for one oscillator. It starts from the design with pairs
 * where they help (designOscillator with pairs true): when that one holds N
 * pairs or fewer, each R counted where it sits, it is the answer as it
 * stands. Otherwise every whitelist of the resistors that may pair
 * (pairCandidates) that fits in N is designed again with it (a real design:
 * the parts that follow are solved again from the ones kept), kept only
 * where it does no harm against one resistor per part (pairsDoNoHarm), and
 * the one that misses least by oscillatorMeasure wins; one resistor per
 * part is in the running too. The whitelists are not only the subsets of
 * the pairs where they help: with R single, the frequency moves and the
 * limiter is solved again, and then Rf2 can call for two in series where it
 * did not before (a 1 kHz phase shift on the lab kit holds its amplitude
 * with Rf1 and Rf2 as pairs, and with no subset of R and Rf1). A tie goes to
 * fewer pairs, then to the whitelist that holds the parts listed first
 * (PAIR_PARTS). The design returned then carries pairLimit: { limit,
 * allowed, kept, dropped, added, count, fullCount }: the whitelist it was
 * designed with (designOscillator with pairs set to it gives it back), the
 * names that are pairs in it, the pairs where they help it gives up, those
 * it adds that pairs where they help leave single, and how many resistors
 * are pairs with the limit and without it. Null when nothing within the
 * limit can be built (one resistor per part cannot either).
 */
function limitedOscillator(options, limit) {
	const { pairLimit, ...rest } = options;
	const base = JSON.stringify(rest);
	const build = (pairs) => designCached({ ...rest, pairs });
	return memoized(`${base}|limit ${limit}`, () => {
		const single = build(false);
		const paired = build(true);
		const full = pairsDoNoHarm(paired, single) ? paired : single;
		const names = oscillatorPairNames(full);
		const fullCount = oscillatorPairCount(full);
		if (fullCount <= limit) return full;
		const topology = rest.topology ?? 'wien';
		const measure = (d) => oscillatorMeasure(d, rest);
		const pool = pairCandidates([single, paired]);
		let best = { design: single, measure: measure(single), count: 0, allowed: [] };
		for (let size = 1; size <= pool.length; size++) {
			for (const allowed of pairSubsets(pool, size)) {
				if (allowed.reduce((n, name) => n + pairCost(topology, name), 0) > limit) continue;
				const design = build(allowed);
				if (!design || !pairsDoNoHarm(design, single)) continue;
				const m = measure(design);
				const count = oscillatorPairCount(design);
				if (clearlyBelow(m, best.measure) || (!clearlyBelow(best.measure, m) && count < best.count)) best = { design, measure: m, count, allowed };
			}
		}
		if (!best.design) return null;
		const kept = oscillatorPairNames(best.design);
		return { ...best.design, pairLimit: { limit, allowed: best.allowed, kept, dropped: names.filter((n) => !kept.includes(n)), added: kept.filter((n) => !names.includes(n)), count: best.count, fullCount } };
	});
}

/**
 * How much further from the frequency, as |ln(f0 / f)|, a pairs design may
 * land and still be kept: 0.05 %. The limiter's parts move the predicted
 * frequency a hair through the op-amp's lag (0.001 % at 50 Hz, a few
 * hundredths of a percent at 7 kHz), far below what a 1 % resistor or
 * LTspice would show, and a strict comparison would throw away pairs that
 * bring the amplitude from 40 % off to within 1 % for that alone.
 */
export const PAIRS_FREQUENCY_SLACK = 5e-4;

/**
 * Whether the design with two resistors in series may replace the one with
 * a single resistor per part: it must start whenever that one starts and
 * hold its amplitude whenever that one does (inside the op-amp's swing: an
 * amplitude past it is a clipped output, not a held one); one that does
 * better there (starts, or holds, where the other does not) is taken;
 * otherwise it must land no further from the frequency, |ln(f0 / f)|, the
 * rule the filter and AM tools use too, give or take PAIRS_FREQUENCY_SLACK.
 */
function pairsDoNoHarm(paired, single) {
	if (!paired) return false;
	if (!single) return true;
	const outcome = (d) => [d.starts, d.limiter.regulates !== false && d.opamp.swingOk];
	const s = outcome(single);
	const p = outcome(paired);
	if ((s[0] && !p[0]) || (s[1] && !p[1])) return false;
	if ((p[0] && !s[0]) || (p[1] && !s[1])) return true;
	const miss = (d) => Math.abs(Math.log(d.f0 / d.frequency));
	return miss(paired) <= miss(single) + PAIRS_FREQUENCY_SLACK;
}

/** One design, with or without pairs: designOscillator above. */
function designWith({
	topology = 'wien',
	frequency = 1000,
	amplitude = 3,
	stabilizer = 'diodes',
	diode: diodeId = '1N4148',
	jfet: jfetId = 'generic',
	excessGain = 0.05,
	quadGrowth = 0.1,
	gbw = 3e6,
	slewRate = 13e6,
	opampSwing = 10.5,
	resistorSeries = 'E24',
	capacitors = null,
	pairs = false
} = {}) {
	const topo = TOPOLOGY_BY_ID[topology];
	if (!topo || !(frequency > 0) || !(amplitude > 0) || !(gbw > 0)) return null;
	const diode = DIODES[diodeId] ?? DIODES['1N4148'];
	const jfet = JFETS[jfetId] ?? JFETS.generic;
	const kind = topology === 'wien' ? 'wien' : topology === 'quadrature' ? 'quadrature' : 'ladder';
	const wt = TWO_PI * gbw;
	const base = { wt, n: topo.ladder?.sections, buffered: topo.ladder?.buffered };
	const k = topo.k;
	const rcIdeal = k / (TWO_PI * frequency);
	const idealStart = topo.gain * (1 + excessGain);

	/* ---- where the textbook values would land with this op-amp, and the
	   R C product that lands on target instead. The limiter diodes' junction
	   capacitance sits across part of the feedback resistor and lags the
	   loop too (8 pF across 50 k is 8 degrees at 55 kHz), so a diode-limited
	   design is made twice: once to learn the parts, then again with their
	   capacitance in the loop. */
	const rho0 = Math.log(1 + quadGrowth) / Math.PI;
	let fUncompensated = NaN;
	let rcTarget;
	let pick;
	let loopParams = { ...base };
	let rg;
	let requiredGain;
	let parts;
	let limiter;
	let startGain;
	let f0;
	let loopExcess;
	let growthPerCycle;
	let starts;

	if (kind === 'quadrature') {
		const un = solvePole('quadrature', { ...base, rc: rcIdeal, rho: rho0 }, { omega0: 1 / rcIdeal });
		fUncompensated = un.converged ? un.omega / TWO_PI : NaN;
		const rt = retuneQuadrature({ ...base, rho: rho0 }, { fTarget: frequency });
		if (!rt.converged) return null;
		rcTarget = rt.rc;
		pick = pickRC(rcTarget, capacitors, resistorSeries, pairs);
		if (!pick) return null;
		const { c, r } = pick;
		const rc = r * c;
		// the inverter's matched pair is the reference; Rn sets the start-up growth
		rg = nearestResistor(10_000, resistorSeries);
		const rn = pairedResistor(r / rho0, resistorSeries, pairAllowed(pairs, 'Rn'));
		const rho = r / rn;
		const pole = solvePole('quadrature', { ...base, rc, rho }, { omega0: 1 / rc });
		const pole0 = solvePole('quadrature', { ...base, rc, rho: 0 }, { omega0: 1 / rc });
		f0 = pole.omega / TWO_PI;
		growthPerCycle = pole.growthPerCycle;
		starts = pole.converged && pole.sigma > 0;
		// the clamp has to absorb the deliberate negative damping and what
		// the op-amps' lag adds on top
		const gTarget = 1 / rn + 2 * Math.max(0, pole0.sigma) * c;
		const clamp = sizeDividerClamp({ gTarget, amplitude, diode, resistorSeries, pairs });
		const amplitudeActual = clamp ? dividerClampAmplitude({ rd1: clamp.rd1, rd2: clamp.rd2, gTarget, diode }) : null;
		requiredGain = 1;
		startGain = 1;
		loopExcess = 0;
		parts = { r, c, rg, ra: rg, rb: rg, rn, rd1: clamp?.rd1 ?? null, rd2: clamp?.rd2 ?? null };
		limiter = {
			kind: 'clamp',
			rn,
			rho,
			rd1: clamp?.rd1 ?? null,
			rd2: clamp?.rd2 ?? null,
			rd1Target: clamp?.rd1Target ?? null,
			gTarget,
			sigmaLag: pole0.sigma,
			growthPerCycle,
			gainStart: 1,
			gainLimited: 1,
			amplitudeActual,
			regulates: amplitudeActual !== null && starts
		};
	} else {
		const un = zeroPhase(kind, { ...base, rc: rcIdeal, gain: idealStart }, { omega0: k / rcIdeal });
		fUncompensated = un.converged ? un.omega / TWO_PI : NaN;
		for (let pass = 0; pass < 2; pass++) {
			// retune, carrying the balance gain found on the way
			let gStart = idealStart;
			let rt = null;
			for (let round = 0; round < 3; round++) {
				rt = retune(kind, { ...loopParams, gain: gStart }, { fTarget: frequency, k });
				if (!rt.converged) return null;
				const bal = solveBalance(kind, { ...loopParams, rc: rt.rc }, { omega0: TWO_PI * frequency, gain0: topo.gain });
				if (!bal.converged) return null;
				gStart = bal.gain * (1 + excessGain);
			}
			rcTarget = rt.rc;
			pick = pickRC(rcTarget, capacitors, resistorSeries, pairs);
			if (!pick) return null;
			// a ladder's last resistor IS the amplifier's input resistor, so
			// Rg is not free there: it is R
			rg = topo.ladder ? pick.r : nearestResistor(10_000, resistorSeries);
			const bal = solveBalance(kind, { ...loopParams, rc: pick.r * pick.c }, { omega0: TWO_PI * frequency, gain0: topo.gain });
			if (!bal.converged) return null;
			requiredGain = bal.gain;
			({ parts, limiter } = sizeStabilizer({
				topology,
				stabilizer,
				requiredGain,
				excessGain,
				r: pick.r,
				c: pick.c,
				rg,
				amplitude,
				frequency,
				diode,
				jfet,
				resistorSeries,
				capacitors,
				pairs
			}));
			if (limiter.kind !== 'diodes' || !(diode.cjo > 0)) break;
			loopParams = { ...base, rAbs: rg, f2: parts.rf2 / (parts.rf1 + parts.rf2), cd: 2 * diode.cjo };
		}
		const rc = pick.r * pick.c;
		if (limiter.kind === 'diodes' && diode.cjo > 0) loopParams = { ...loopParams, f2: parts.rf2 / (parts.rf1 + parts.rf2) };
		startGain = limiter.gainStart;
		// where it oscillates: a diode limiter is off for most of every
		// cycle, so the loop's phase is that of the start gain; a lamp or
		// an AGC is linear and sits exactly at balance
		const settledGain = limiter.kind === 'diodes' ? startGain : requiredGain;
		const zp = zeroPhase(kind, { ...loopParams, rc, gain: settledGain }, { omega0: TWO_PI * frequency });
		f0 = zp.converged ? zp.omega / TWO_PI : k / (TWO_PI * rc);
		const atStart = Number.isFinite(startGain) ? zeroPhase(kind, { ...loopParams, rc, gain: startGain }, { omega0: TWO_PI * frequency }) : null;
		loopExcess = atStart?.converged ? atStart.magnitude - 1 : NaN;
		if (limiter.kind === 'diodes') {
			const pole = solvePole(kind, { ...loopParams, rc, gain: startGain }, { omega0: TWO_PI * frequency });
			growthPerCycle = pole.converged ? pole.growthPerCycle : NaN;
			starts = Number.isFinite(growthPerCycle) && growthPerCycle > 0;
		} else {
			// a lamp starts cold and an AGC starts with the channel wide open:
			// the gain is then far above balance (a Wien bridge above 5 has
			// real poles and simply ramps up), so the pole says little and the
			// start is judged by the gain alone
			growthPerCycle = NaN;
			starts = Number.isFinite(startGain) && startGain > requiredGain;
		}
	}
	const { c, r, rTarget } = pick;
	const rc = r * c;
	const fIdeal = k / (TWO_PI * rc);
	const retunePercent = rcTarget / rcIdeal - 1;

	// where the useful outputs sit, and how big they are there: each RC
	// section of a phase-shift loop attenuates, so a tap after one is
	// smaller than the amplifier's own output
	const sectionLoss = { phaseShift: 1 / 29, bufferedPhaseShift: 1 / 8, bubba: 1 / 4, quadrature: 1, wien: 1 }[topology];
	// the wave that really comes out: the limiter's rounded parts hold an
	// amplitude of their own, a few percent from the one asked with a full
	// series and sometimes far from it with a short list of parts, and what
	// the taps carry and the op-amp has to swing and slew is that one
	const amplitudeHeld = limiter.amplitudeActual > 0 ? limiter.amplitudeActual : amplitude;
	const tapAmplitude = amplitudeHeld * sectionLoss;

	/* ---- what the op-amp is asked for, and what it does to the loop */
	// the gain the stage runs at once the wave has settled: a lamp or a JFET
	// starts far above it (a cold lamp at 7) and the lag that sets the
	// frequency is the one at the running gain; the diode string's start
	// gain is within a few percent of it and is kept as the worst case
	const running = limiter?.kind === 'lamp' || limiter?.kind === 'jfet';
	const gainForLag = !running && Number.isFinite(startGain) ? startGain : requiredGain;
	const noiseGain = kind === 'wien' ? gainForLag : kind === 'ladder' ? 1 + gainForLag : 2;
	const closedLoopBw = gbw / noiseGain;
	const gbwRatio = (f0 * noiseGain) / gbw;
	const lagDeg = stageLagDeg(f0, noiseGain, gbw);
	const uncompensatedError = Number.isFinite(fUncompensated) ? fUncompensated / frequency - 1 : NaN;
	const fMax = frequencyCeiling(kind, base, { k, gain: idealStart, rho: rho0, fStart: frequency });
	// trusted while the lag stays modest: past about 25 degrees the
	// single-pole model, and the retune built on it, drift from what LTspice
	// and a real part do (a single phase shift at 55 kHz on a 3 MHz op-amp
	// lands 4.5 % high and 40 % large in LTspice)
	const opampOk = Number.isFinite(uncompensatedError) && uncompensatedError > -0.2 && starts && lagDeg <= 25;
	const slewNeeded = TWO_PI * f0 * amplitudeHeld;
	const slewOk = slewNeeded <= slewRate / 2;
	const swingOk = amplitudeHeld <= opampSwing;

	/* ---- distortion */
	const measured = MEASURED_THD[topology];
	let thd;
	let thdNote;
	if (limiter.kind === 'diodes') {
		thd = Math.max(0.001, THD_PER_EXCESS[topology] * Math.max(0, loopExcess));
		thdNote = `diode limiting absorbing ${(100 * Math.max(0, loopExcess)).toFixed(1)} % of excess gain, from LTspice runs of this circuit`;
	} else if (limiter.kind === 'lamp') {
		thd = 0.001;
		thdNote = 'lamp stabilized, under 0.1 % (TI measured)';
	} else if (limiter.kind === 'jfet') {
		thd = 0.002;
		thdNote = 'JFET gain control, about 0.2 % (TI measured)';
	} else {
		// the clamp current is integrated before it reaches the outputs;
		// LTspice runs of this export give 0.25 % at 1 kHz and 0.75 % at 55 kHz
		thd = 0.003 + 0.005 * Math.min(1, f0 / 55000);
		thdNote = `damped by the clamp, from LTspice runs of this circuit; TI ${measured.note}`;
	}

	return {
		topology,
		kind,
		topo,
		stabilizer: topology === 'wien' ? stabilizer : topology === 'quadrature' ? 'clamp' : 'diodes',
		diode: diode.id,
		jfet: jfet.id,
		frequency,
		amplitude,
		amplitudeHeld,
		f0,
		f0Error: f0 / frequency - 1,
		fIdeal,
		fUncompensated,
		uncompensatedError,
		retunePercent,
		rcIdeal,
		rcTarget,
		r,
		c,
		rTarget,
		rg,
		parts,
		limiter,
		// what the parts were picked from, so a table or an export can tell
		// two resistors in series from one part (seriesPair in eseries.js)
		resistorSeries,
		pairs: anyPairAllowed(pairs) && Array.isArray(resistorSeries),
		startGain,
		requiredGain,
		idealGain: topo.gain,
		loopExcess,
		growthPerCycle,
		starts,
		opamps: topo.opamps,
		outputs: topo.outputs,
		tapAmplitude,
		sectionLoss,
		thd,
		thdNote,
		opamp: { gbw, slewRate, opampSwing, noiseGain, closedLoopBw, gbwRatio, lagDeg, gbwOk: opampOk, opampOk, slewNeeded, slewOk, swingOk, fMax }
	};
}

/** Every topology at the same frequency and amplitude, for the comparison table. */
export function compareOscillators(params) {
	return TOPOLOGIES.map((t) => {
		const d = designOscillator({ ...params, topology: t.id });
		return d
			? {
					id: t.id,
					label: t.label,
					ok: true,
					f0: d.f0,
					f0Error: d.f0Error,
					uncompensatedError: d.uncompensatedError,
					retunePercent: d.retunePercent,
					gain: d.requiredGain,
					idealGain: d.idealGain,
					growthPerCycle: d.growthPerCycle,
					starts: d.starts,
					// a JFET control that cannot be sized at this amplitude stops the
					// loop, not the op-amp: the row says so instead of "does not start"
					jfetMinAmplitude: d.limiter.kind === 'jfet' && !d.limiter.regulates ? d.limiter.minAmplitude : null,
					opamps: d.opamps,
					outputs: d.outputs,
					thd: d.thd,
					gbwRatio: d.opamp.gbwRatio,
					lagDeg: d.opamp.lagDeg,
					gbwOk: d.opamp.opampOk,
					opampOk: d.opamp.opampOk,
					fMax: d.opamp.fMax,
					r: d.r,
					c: d.c
				}
			: { id: t.id, label: t.label, ok: false };
	});
}

/**
 * Which one to build. The answer is not a matter of taste: the Wien
 * bridge asks the least of the amplifier (gain 3 against 8, 29 or a loop
 * of integrators), and with a proper stabilizer it also measures the
 * cleanest. The cases where something else wins are specific and few.
 */
export function recommendation(params) {
	const rows = compareOscillators(params);
	const wien = rows.find((r) => r.id === 'wien');
	const usable = rows.filter((r) => r.ok && r.opampOk);
	return {
		best: 'wien',
		wienOk: !!wien && wien.opampOk,
		usable: usable.map((r) => r.id),
		rows
	};
}
