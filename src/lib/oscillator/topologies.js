import { capacitorCandidates, nearestResistor } from '../filter/eseries';
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

/** Picks C from a preferred series so that R lands near 10 kohm, for a wanted R C product. */
function pickRC(rcTarget, capacitors, resistorSeries) {
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
	return best;
}

/** Nearest stocked capacitor to a target. */
function pickCapacitor(target, capacitors) {
	return capacitorCandidates(capacitors).reduce((best, cc) => (Math.abs(Math.log(cc / target)) < Math.abs(Math.log(best / target)) ? cc : best), 1e-7);
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
 */
function sizeStabilizer({ topology, stabilizer, requiredGain, excessGain, r, c, rg, amplitude, frequency, diode, jfet, resistorSeries, capacitors }) {
	const gStartTarget = requiredGain * (1 + excessGain);
	let parts = { r, c, rg };
	let limiter;
	if (topology === 'wien') {
		const stab = STABILIZER_BY_ID[stabilizer] ?? STABILIZER_BY_ID.diodes;
		const rfBalance = (requiredGain - 1) * rg;
		if (stab.id === 'diodes') {
			const fraction = (requiredGain - 1) / requiredGain;
			const rs = (gStartTarget - 1) * rg;
			const sz = sizeFeedbackLimiter({ rt: rfBalance, rs, amplitude, fraction, diode, resistorSeries });
			const rf1 = sz ? sz.rf1 : nearestResistor(0.1 * rs, resistorSeries);
			const rf2 = sz ? sz.rf2 : nearestResistor(0.9 * rs, resistorSeries);
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
			const agc = sizeAgc({ rf, gBalance: requiredGain, amplitude, jfet, diode, resistorSeries });
			if (!agc.ok) {
				parts = { ...parts, rf };
				limiter = { kind: 'jfet', rf, gainStart: NaN, gainLimited: 1, amplitudeActual: null, regulates: false, minAmplitude: agc.minAmplitude, rdsOn: agc.rdsOn, jfet: jfet.id };
			} else {
				const settle = agcAmplitude({ rf, rSeries: agc.rSeries, ra: agc.ra, rb: agc.rb, gBalance: requiredGain, jfet, diode });
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
		const sz = sizeFeedbackLimiter({ rt, rs, amplitude, fraction: 1, diode, resistorSeries });
		const rf1 = sz ? sz.rf1 : nearestResistor(0.1 * rs, resistorSeries);
		const rf2 = sz ? sz.rf2 : nearestResistor(0.9 * rs, resistorSeries);
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
 */
export function designOscillator({
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
	capacitors = null
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
		pick = pickRC(rcTarget, capacitors, resistorSeries);
		if (!pick) return null;
		const { c, r } = pick;
		const rc = r * c;
		rg = 10_000;
		const rn = nearestResistor(r / rho0, resistorSeries);
		const rho = r / rn;
		const pole = solvePole('quadrature', { ...base, rc, rho }, { omega0: 1 / rc });
		const pole0 = solvePole('quadrature', { ...base, rc, rho: 0 }, { omega0: 1 / rc });
		f0 = pole.omega / TWO_PI;
		growthPerCycle = pole.growthPerCycle;
		starts = pole.converged && pole.sigma > 0;
		// the clamp has to absorb the deliberate negative damping and what
		// the op-amps' lag adds on top
		const gTarget = 1 / rn + 2 * Math.max(0, pole0.sigma) * c;
		const clamp = sizeDividerClamp({ gTarget, amplitude, diode, resistorSeries });
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
			pick = pickRC(rcTarget, capacitors, resistorSeries);
			if (!pick) return null;
			// a ladder's last resistor IS the amplifier's input resistor, so
			// Rg is not free there: it is R
			rg = topo.ladder ? pick.r : 10_000;
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
				capacitors
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
	const tapAmplitude = amplitude * sectionLoss;

	/* ---- what the op-amp is asked for, and what it does to the loop */
	const gainForLag = Number.isFinite(startGain) ? startGain : requiredGain;
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
	const slewNeeded = TWO_PI * f0 * amplitude;
	const slewOk = slewNeeded <= slewRate / 2;
	const swingOk = amplitude <= opampSwing;

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
