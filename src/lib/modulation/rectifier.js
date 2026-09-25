import { DIODE_MODELS, diodeCurrent } from './diodeLaw';
import { envelopeGainAt } from './envelopeFilter';

/**
 * Precision full-wave rectifier (absolute-value circuit): two op-amps, two
 * diodes, checked against Texas Instruments TIDU030 ("Precision Full-Wave
 * Rectifier, Dual-Supply", figure 2). U1A takes the input on its +. D1
 * points from U1A's own - input (node F) into its output (anode on F,
 * cathode on the output); D2 points from that output into U1B's + input,
 * which R3 ties to ground. R1 runs from F to U1B's - input, R2 from there
 * to the output.
 *
 * Positive input: U1A's output rises, D2 conducts and D1 is reverse
 * biased. No current flows in R1 or R2, U1B follows its + input and U1A,
 * whose loop now closes through D2, U1B and R1, follows the input:
 * Vout = Vin. Negative input: the output falls, D1 conducts and holds F at
 * Vin, D2 is off so R3 holds U1B's + input at ground, and U1B is an
 * inverting amplifier, R1 in, R2 feedback: Vout = -R2/R1 Vin = -Vin. With
 * R1 = R2 the two halves give Vout = |Vin|, the diodes' drop corrected by
 * the loops. Drawn the other way round (both anodes on U1A's output) the
 * circuit gives no full-wave output at all.
 *
 * Any equal value sets the gain, but not every value keeps it clean at a
 * fast carrier: the diode that is switched off still couples a few pF, and
 * through 10 k at 40 kHz that lets about 1 % of the swing into U1B's +
 * input. 1 k, the value TI used, cuts that tenfold and is easy work for a
 * TL08x.
 */
export function designPrecisionRectifier({ r = 1000, diode = '1N4148' } = {}) {
	return {
		r1: r,
		r2: r,
		r3: r,
		r4: 49.9, // input termination, optional - matches the source impedance
		diode,
		compensationCapNote:
			'A small compensation capacitor (tens of pF) across D1 can help transient response at higher carrier frequencies; it is an empirical tweak, not something to compute from first principles - check on a scope.'
	};
}

/**
 * Half-wave rectifier: a single diode, and a load resistor from its
 * cathode to ground. The resistor is not optional: the envelope filter
 * after it takes no DC current (its input ends on capacitors), so without
 * a path to ground the diode would charge the filter up to the highest
 * crest and never let it down. rl is kept small next to the filter's own
 * resistors so it hardly moves the first stage.
 *
 * Simpler, but the residual ripple sits at the carrier frequency fp
 * (average value of a half-wave rectified sine is Ap/pi) instead of 2*fp
 * for the full-wave case (average 2*Ap/pi), so the envelope low-pass filter
 * after it needs a lower stopband edge for the same attenuation - see
 * envelopeFilter.js. And every crest loses the diode's drop.
 */
export function designHalfWaveRectifier({ diode = '1N4148', rl = 1000 } = {}) {
	return { diode, rl };
}

/** Average value and ripple fundamental of a rectified sinusoid of peak amplitude Ap. */
export function rectifiedEnvelopeStats(ap, fp, type) {
	if (type === 'full') return { average: (2 * ap) / Math.PI, rippleFundamentalHz: 2 * fp };
	return { average: ap / Math.PI, rippleFundamentalHz: fp };
}

/**
 * Average of the half-wave rectifier's output over one carrier cycle, for
 * a carrier of height e: the diode law with RL, whose DC the filter leaves
 * alone, and with the filter's first resistor r1 in parallel for the
 * carrier's own swing (at the carrier the filter's input is about r1).
 * The DC current sets the DC voltage RL Idc the diode works against, so
 * it is solved for by bisection.
 */
function halfWaveAverage(height, rl, r1, d, S = 96) {
	const e = Math.abs(height);
	const rac = Number.isFinite(r1) && r1 > 0 ? (rl * r1) / (rl + r1) : rl;
	const mean = (idc) => {
		let s = 0;
		for (let k = 0; k < S; k++) s += diodeCurrent(e * Math.cos((2 * Math.PI * k) / S) - (rl - rac) * idc, rac, d);
		return s / S;
	};
	let lo = 0;
	let hi = e / rl;
	for (let it = 0; it < 40; it++) {
		const mid = (lo + hi) / 2;
		if (mean(mid) > mid) lo = mid;
		else hi = mid;
	}
	return (rl * (lo + hi)) / 2;
}

/**
 * What the demodulator hands back for a test wave of carrier `amplitude`
 * carrying a tone at fm with index `index`: the output's mean and the
 * recovered tone's amplitude after the filter. The precision rectifier
 * is exact, 2/pi of the wave. The bare diode is worked out cycle by cycle
 * with the diode law: it loses its drop on every crest and stops
 * conducting where the envelope dips below it, which the ideal 1/pi
 * figure ignores.
 */
export function recoveredEnvelope({ rectifierType, rectifier, envelope, fm, index, amplitude = 1 }) {
	const gain = envelopeGainAt(envelope, fm);
	const full = rectifierType !== 'half';
	const scale = (full ? 2 : 1) / Math.PI;
	const ideal = { mean: scale * amplitude, tone: scale * amplitude * index * gain };
	if (full) return { ...ideal, ideal, gain, gainDb: 20 * Math.log10(gain), exact: true };
	const d = DIODE_MODELS[rectifier.diode] ?? DIODE_MODELS['1N4148'];
	const r1 = envelope.realized[0]?.components?.R1;
	const P = 48;
	let m0 = 0;
	let re = 0;
	let im = 0;
	for (let k = 0; k < P; k++) {
		const ph = (2 * Math.PI * k) / P;
		const y = halfWaveAverage(amplitude * (1 + index * Math.sin(ph)), rectifier.rl, r1, d);
		m0 += y;
		re += y * Math.cos(ph);
		im += y * Math.sin(ph);
	}
	return { mean: m0 / P, tone: ((2 * Math.hypot(re, im)) / P) * gain, ideal, gain, gainDb: 20 * Math.log10(gain), exact: false };
}
