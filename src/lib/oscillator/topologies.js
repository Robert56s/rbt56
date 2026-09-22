import { capacitorCandidates, nearestResistor } from '../filter/eseries';

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
		opamps: 4,
		ladder: { sections: 3, buffered: true },
		outputs: 'one',
		summary: 'The same ladder with a unity-gain buffer after each section, so the sections stop loading each other. The frequency then lands where the simple formula says and the gain drops to 8, at the cost of three more op-amps.'
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

const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cDiv = (a, b) => {
	const d = b.re * b.re + b.im * b.im;
	return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

/**
 * Transfer of a ladder of `n` high-pass RC sections (series C, shunt R)
 * driven by the amplifier output, in units of x = omega R C. The last
 * shunt resistor is the amplifier's own input resistor R_G, whose far end
 * is the virtual ground, so it is already counted here and the ladder
 * needs no separate load; `loadRatio` adds one only for the comparison
 * that shows what an extra resistor on the end would cost.
 *
 * `buffered` true means a unity follower sits between every section, so
 * the sections stop loading each other. That loading is exactly what the
 * usual quick formula ignores, and the reason the buffered and unbuffered
 * versions need such different gains from the same ladder.
 */
function ladderBeta(n, x, { buffered, loadRatio }) {
	const yl = Number.isFinite(loadRatio) ? 1 / loadRatio : 0;
	if (buffered) {
		let beta = { re: 1, im: 0 };
		for (let k = 1; k <= n; k++) {
			// one high-pass section: jx / (jx + g), g the shunt conductance
			const g = 1 + (k === n ? yl : 0);
			beta = cMul(beta, cDiv({ re: 0, im: x }, { re: g, im: x }));
		}
		return beta;
	}
	// unbuffered: solve the whole tridiagonal ladder at once, v0 = 1.
	// Node k: series C to k-1 and to k+1 (admittance jx each), shunt R to
	// ground (admittance 1, plus the extra load on the last node).
	const A = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ re: 0, im: 0 })));
	const b = Array.from({ length: n }, () => ({ re: 0, im: 0 }));
	for (let k = 0; k < n; k++) {
		const last = k === n - 1;
		A[k][k] = { re: 1 + (last ? yl : 0), im: x * (last ? 1 : 2) };
		if (k > 0) A[k][k - 1] = { re: 0, im: -x };
		if (!last) A[k][k + 1] = { re: 0, im: -x };
	}
	b[0] = { re: 0, im: x }; // the jx * v0 term with v0 = 1
	for (let col = 0; col < n; col++) {
		for (let row = col + 1; row < n; row++) {
			const f = cDiv(A[row][col], A[col][col]);
			for (let c2 = col; c2 < n; c2++) {
				const m = cMul(f, A[col][c2]);
				A[row][c2] = { re: A[row][c2].re - m.re, im: A[row][c2].im - m.im };
			}
			const m = cMul(f, b[col]);
			b[row] = { re: b[row].re - m.re, im: b[row].im - m.im };
		}
	}
	const v = Array.from({ length: n }, () => ({ re: 0, im: 0 }));
	for (let row = n - 1; row >= 0; row--) {
		let s = b[row];
		for (let c2 = row + 1; c2 < n; c2++) {
			const m = cMul(A[row][c2], v[c2]);
			s = { re: s.re - m.re, im: s.im - m.im };
		}
		v[row] = cDiv(s, A[row][row]);
	}
	return v[n - 1];
}

/**
 * Where the ladder turns the signal by exactly 180 degrees, and how much
 * of it survives there. Returns x0 = omega0 R C and the gain the amplifier
 * must supply, 1 / |beta|.
 */
export function solveLadder(n, { buffered = false, loadRatio = Infinity } = {}) {
	// the imaginary part of beta crosses zero once between these bounds
	const imag = (x) => ladderBeta(n, x, { buffered, loadRatio }).im;
	let lo = 1e-3;
	let hi = 100;
	if (imag(lo) * imag(hi) > 0) return null;
	for (let i = 0; i < 200; i++) {
		const mid = Math.sqrt(lo * hi);
		if (imag(lo) * imag(mid) <= 0) hi = mid;
		else lo = mid;
	}
	const x0 = Math.sqrt(lo * hi);
	const beta = ladderBeta(n, x0, { buffered, loadRatio });
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

/** Picks C from a preferred series so that R lands near 10 kohm. */
function pickRC(frequency, k, capacitors, resistorSeries) {
	let best = null;
	for (const c of capacitorCandidates(capacitors)) {
		if (c < CAP_MIN || c > CAP_MAX) continue;
		// f0 = k / (2 pi R C)  =>  R = k / (2 pi f0 C)
		const rTarget = k / (2 * Math.PI * frequency * c);
		if (!(rTarget > R_MIN && rTarget < R_MAX)) continue;
		const r = nearestResistor(rTarget, resistorSeries);
		// accuracy first: the frequency error this pair leaves after R is
		// rounded, then, far behind, how close R sits to a comfortable value
		const score = 100 * Math.log(r / rTarget) ** 2 + 0.05 * Math.log(r / R_SWEET) ** 2;
		if (best === null || score < best.score) best = { c, r, rTarget, score };
	}
	return best;
}

/**
 * The Wien bridge's diode limiter. The output peak is reached when the
 * voltage across the shunted part of the feedback resistor equals a diode
 * drop. With the loop at its balance point the amplifier's gain is 3, so
 * the voltage across the whole feedback resistor is 2/3 of the output and
 * the part the diodes sit across sees that in proportion:
 *   Vf = (2 Vout / 3) * Rf2 / (Rf1 + Rf2),  with Rf1 + Rf2 = 2 Rg
 *   =>  Rf2 = 3 Rg Vf / Vout
 * Rf1 takes the rest, sized so the small-signal gain is `startGain` and
 * the circuit reliably starts.
 */
function wienDiodeLimiter({ rg, amplitude, diodeVf, startGain, resistorSeries }) {
	const rfTotal = (startGain - 1) * rg;
	// Vf = (2 Vout / 3) * Rf2 / (Rf1 + Rf2)  =>  Rf2 = 1.5 * Rf * Vf / Vout
	const rf2Target = (1.5 * rfTotal * diodeVf) / amplitude;
	const rf2 = nearestResistor(Math.min(rf2Target, rfTotal * 0.8), resistorSeries);
	const rf1 = nearestResistor(Math.max(rfTotal - rf2, rg), resistorSeries);
	const gainStart = 1 + (rf1 + rf2) / rg;
	const gainLimited = 1 + rf1 / rg;
	return {
		kind: 'diodes',
		rf1,
		rf2,
		rf2Target,
		gainStart,
		gainLimited,
		// the same equation read back off the rounded parts
		amplitudeActual: (1.5 * (rf1 + rf2) * diodeVf) / rf2,
		regulates: gainStart > 3 && gainLimited < 3
	};
}

/**
 * Diode limiting on an inverting gain stage, which is how every topology
 * other than the Wien bridge sets its loop gain. The stage's - input is a
 * virtual ground, so the whole output voltage sits across Rf: diodes
 * across the part Rf2 conduct when Vout * Rf2 / Rf reaches a diode drop.
 *   Rf2 = Vf * Rf / Vout
 * With Rf2 shunted the gain falls to (Rf - Rf2) / Rg, which has to land
 * below the gain the loop needs, or nothing brings the amplitude back.
 */
function invertingDiodeLimiter({ rg, rf, amplitude, diodeVf, requiredGain, resistorSeries }) {
	const rf2Target = (diodeVf * rf) / amplitude;
	const rf2 = nearestResistor(Math.min(rf2Target, rf * 0.8), resistorSeries);
	const gainStart = rf / rg;
	const gainLimited = (rf - rf2) / rg;
	return {
		kind: 'diodes',
		rf,
		rf2,
		rf2Target,
		gainStart,
		gainLimited,
		amplitudeActual: (diodeVf * rf) / rf2,
		regulates: gainStart > requiredGain && gainLimited < requiredGain
	};
}

/**
 * Designs one oscillator.
 *   frequency   Hz
 *   amplitude   V peak wanted at the output
 *   topology    an id from TOPOLOGIES
 *   stabilizer  an id from STABILIZERS (Wien bridge only; the others
 *               limit in the amplifier that sets the loop gain)
 *   vcc, gbw, slewRate, opampSwing   the op-amp and its supply
 */
export function designOscillator({
	topology = 'wien',
	frequency = 1000,
	amplitude = 3,
	stabilizer = 'diodes',
	diodeVf = 0.6,
	excessGain = 0.05,
	gbw = 3e6,
	slewRate = 13e6,
	opampSwing = 10.5,
	resistorSeries = 'E24',
	capacitors = null
} = {}) {
	const topo = TOPOLOGY_BY_ID[topology];
	if (!topo || !(frequency > 0) || !(amplitude > 0)) return null;

	const pick = pickRC(frequency, topo.k, capacitors, resistorSeries);
	if (!pick) return null;
	const { c, r, rTarget } = pick;
	const f0 = topo.k / (2 * Math.PI * r * c);

	// gain-setting resistors, and whatever limits the amplitude. For a
	// ladder the last section's resistor IS the amplifier's input resistor,
	// so Rg is not free: it is R.
	const rg = topo.ladder ? r : 10_000;
	let parts = { r, c, rg };
	let limiter = null;
	let startGain = topo.gain * (1 + excessGain);

	if (topology === 'wien') {
		const stab = STABILIZER_BY_ID[stabilizer] ?? STABILIZER_BY_ID.diodes;
		if (stab.id === 'diodes') {
			limiter = wienDiodeLimiter({ rg, amplitude, diodeVf, startGain, resistorSeries });
			parts = { ...parts, rf1: limiter.rf1, rf2: limiter.rf2 };
		} else if (stab.id === 'lamp') {
			// the lamp replaces Rg and settles at Rf/2; Rf is the free choice
			const rf = nearestResistor(2 * rg, resistorSeries);
			limiter = { rf, lampCold: rf / 6, lampHot: rf / 2 };
			parts = { ...parts, rf };
		} else {
			// JFET AGC: Rg is split, the JFET shunting the lower part through Rs
			const rf = nearestResistor(2 * rg * (1 + excessGain), resistorSeries);
			const rg1 = rg;
			const rg2 = nearestResistor(rg, resistorSeries);
			const rs = nearestResistor(rg, resistorSeries);
			const rDet = nearestResistor(10 * rg, resistorSeries);
			// the detector's time constant must be long next to one cycle
			const cDetTarget = 50 / (2 * Math.PI * f0 * rDet);
			const cDet = capacitorCandidates(capacitors).reduce((best, cc) => (Math.abs(Math.log(cc / cDetTarget)) < Math.abs(Math.log(best / cDetTarget)) ? cc : best), 1e-7);
			limiter = { rf, rg1, rg2, rs, rDet, cDet, tau: rDet * cDet, cyclesPerTau: rDet * cDet * f0 };
			parts = { ...parts, rf, rg1, rg2, rs, rDet, cDet };
		}
	} else {
		// every other topology sets its loop gain with one inverting stage
		const rfTarget = topo.gain * (1 + excessGain) * rg;
		const rf = nearestResistor(rfTarget, resistorSeries);
		limiter = invertingDiodeLimiter({ rg, rf, amplitude, diodeVf, requiredGain: topo.gain, resistorSeries });
		limiter.rfTarget = rfTarget;
		limiter.marginPercent = 100 * (limiter.gainStart / topo.gain - 1);
		parts = { ...parts, rf, rf2: limiter.rf2 };
		startGain = limiter.gainStart;
	}
	// where the useful outputs sit, and how big they are there: each RC
	// section of a phase-shift loop attenuates, so a tap after one is
	// smaller than the amplifier's own output
	const sectionLoss = { phaseShift: 1 / 29, bufferedPhaseShift: 1 / 8, bubba: 1 / 4, quadrature: 1, wien: 1 }[topology];
	const tapAmplitude = amplitude * sectionLoss;

	// what the op-amp is asked for at f0
	const noiseGain = topology === 'wien' ? startGain : topo.gain * (1 + excessGain);
	const closedLoopBw = gbw / noiseGain;
	const gbwRatio = (f0 * noiseGain) / gbw;
	const gbwOk = gbwRatio <= 0.1;
	const slewNeeded = 2 * Math.PI * f0 * amplitude;
	const slewOk = slewNeeded <= slewRate / 2;
	const swingOk = amplitude <= opampSwing;
	// the largest frequency this op-amp supports for this topology
	const fMax = (0.1 * gbw) / noiseGain;

	const measured = MEASURED_THD[topology];
	const thd = topology === 'wien' ? (STABILIZER_BY_ID[stabilizer] ?? STABILIZER_BY_ID.diodes).thd : measured.main;

	return {
		topology,
		topo,
		stabilizer: topology === 'wien' ? stabilizer : null,
		frequency,
		amplitude,
		f0,
		f0Error: f0 / frequency - 1,
		r,
		c,
		rTarget,
		rg,
		parts,
		limiter,
		startGain,
		requiredGain: topo.gain,
		opamps: topo.opamps,
		outputs: topo.outputs,
		tapAmplitude,
		sectionLoss,
		thd,
		thdNote: topology === 'wien' ? `${(STABILIZER_BY_ID[stabilizer] ?? STABILIZER_BY_ID.diodes).label}, ${(thd * 100).toFixed(thd < 0.005 ? 2 : 1)} % typical` : measured.note,
		opamp: { gbw, slewRate, opampSwing, noiseGain, closedLoopBw, gbwRatio, gbwOk, slewNeeded, slewOk, swingOk, fMax }
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
					gain: d.requiredGain,
					opamps: d.opamps,
					outputs: d.outputs,
					thd: d.thd,
					gbwRatio: d.opamp.gbwRatio,
					gbwOk: d.opamp.gbwOk,
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
	const usable = rows.filter((r) => r.ok && r.gbwOk);
	return {
		best: 'wien',
		wienOk: !!wien && wien.gbwOk,
		usable: usable.map((r) => r.id),
		rows
	};
}
