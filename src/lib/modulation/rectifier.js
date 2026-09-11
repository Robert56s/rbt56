/**
 * Precision full-wave rectifier (absolute-value circuit): two op-amps, two
 * diodes, verified against Texas Instruments TIDU030 ("Precision Full-Wave
 * Rectifier, Dual-Supply"). U1A buffers the input and biases D1/D2 so the
 * signal path changes with input polarity; U1B either follows (positive
 * input: D1 reverse-biased, D2 forward-biased, unity-gain buffer) or
 * inverts (negative input: D1 forward-biased, D2 reverse-biased, gain
 * -R2/R1). With R1 = R2 = R3, both halves combine to Vout = |Vin|.
 *
 * Any equal value works exactly (the R1=R2=R3 constraint sets the gain
 * magnitude to unity on both halves; it does not depend on the absolute
 * value), so there is nothing to search for - this returns a sensible
 * general-purpose default, matching the resistor value TI itself used.
 */
export function designPrecisionRectifier({ r = 10_000, diode = '1N4148' } = {}) {
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
 * Half-wave rectifier: a single diode. Simpler, but the residual ripple
 * sits at the carrier frequency fp (average value of a half-wave rectified
 * sine is Ap/pi) instead of 2*fp for the full-wave case (average 2*Ap/pi),
 * so the envelope low-pass filter after it needs a lower stopband edge for
 * the same attenuation - see envelopeFilter.js.
 */
export function designHalfWaveRectifier({ diode = '1N4148' } = {}) {
	return { diode };
}

/** Average value and ripple fundamental of a rectified sinusoid of peak amplitude Ap. */
export function rectifiedEnvelopeStats(ap, fp, type) {
	if (type === 'full') return { average: (2 * ap) / Math.PI, rippleFundamentalHz: 2 * fp };
	return { average: ap / Math.PI, rippleFundamentalHz: fp };
}
