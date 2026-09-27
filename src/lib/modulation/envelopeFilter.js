import { butterworthOrder, butterworthStages, chebyshevOrder, chebyshevStages, transitionRatio } from './order';
import { designSallenKeyLowPass } from './sallenKeyLowPass';

/**
 * Envelope-recovery low-pass filter after the rectifier: same Butterworth /
 * Chebyshev order search as the active-filter-design tool, low-pass only,
 * cascaded unity-gain Sallen-Key stages. fp is the passband edge (just
 * above the highest modulating frequency to recover) and fs is the
 * stopband edge (the residual carrier ripple frequency - fp_carrier for a
 * half-wave rectifier, 2*fp_carrier for a full-wave one).
 *
 * omega_c is 2*pi*fp scaled by the same Butterworth factor as the filter
 * tool (see cutoffScale in filter/stages.js): the pole circle sits at
 * omega_p * eps^(-1/n), eps = sqrt(10^(Amax/10) - 1), so that exactly Amax
 * dB is lost at fp. Without that factor the filter would always lose
 * 3.01 dB at fp no matter what Amax was asked for. Chebyshev's prototype is
 * already normalized to the ripple edge, so its factor is 1.
 *
 * The stages have unity gain at DC, so an even-order Chebyshev, whose DC
 * sits in a ripple valley, peaks at +Amax: its stopband is sized Amin
 * below that peak, which is Amin + Amax below DC (aminSized), so the ripple
 * ends up at least Amin under every part of the message. An order past
 * maxOrder is only reported (tooHigh), with no stages built.
 */
export function designEnvelopeLowPass({ response, amaxDb, aminDb, fp, fs, order, resistorSeries = 'E24', capacitors = null, maxOrder = Infinity }) {
	const k = transitionRatio(fp, fs);
	const aminSized = response === 'chebyshev' ? aminDb + amaxDb : aminDb;
	const minOrder = response === 'chebyshev' ? chebyshevOrder(amaxDb, aminSized, k) : butterworthOrder(amaxDb, aminDb, k);
	// even order: only 2nd-order Sallen-Key stages, no leftover 1st-order
	// stage, so an odd order asked for is rounded up rather than losing a pole
	const n = Math.max(2, 2 * Math.ceil((order ?? minOrder) / 2));
	if (n > maxOrder) return { k, minOrder, n, tooHigh: true, response, amaxDb, aminDb, aminSized, fp, fs };

	const proto = response === 'chebyshev' ? chebyshevStages(n, amaxDb) : butterworthStages(n);
	const eps = Math.sqrt(10 ** (amaxDb / 10) - 1);
	const wcScale = response === 'chebyshev' ? 1 : eps ** (-1 / n);
	const wc = 2 * Math.PI * fp * wcScale;

	// order/filterType on each stage and beta/filterType on the design let the
	// filter tool's "show the math" derivations (filter/explain.js) be reused
	// for this filter as they are.
	const stages = proto.stages.map((s) => ({
		order: 2,
		filterType: 'lowpass',
		wn: wc * Math.sqrt(s.b),
		q: Math.sqrt(s.b) / s.a,
		normalized: s
	}));

	// a stage the parts on hand cannot build is built from E24 and the E6/E12
	// capacitors instead, and flagged, rather than dropped
	const realized = stages.map((stage) => {
		const r = designSallenKeyLowPass(stage.wn, stage.q, { resistorSeries, capacitors });
		if (r) return r;
		const fallback = designSallenKeyLowPass(stage.wn, stage.q);
		return fallback && { ...fallback, stockShortfall: true };
	});
	const shortfallStages = realized.flatMap((r, i) => (r?.stockShortfall ? [i + 1] : []));

	return { k, minOrder, n, wc, wcScale, eps, beta: proto.beta, filterType: 'lowpass', stages, realized, shortfallStages, response, amaxDb, aminDb, aminSized, fp, fs };
}

/**
 * |H(j 2 pi f)| of the realized filter: each unity-gain Sallen-Key stage is
 * 1 / (1 - x^2 + j x / Q) with x = f / f0, all with their rounded parts.
 */
/** The same in dB (0 dB at DC). */
export function envelopeGainDb(design, f) {
	return 20 * Math.log10(envelopeGainAt(design, f));
}

export function envelopeGainAt(design, f) {
	const w = 2 * Math.PI * f;
	return design.realized.reduce((g, s) => {
		const x = w / s.actual.wn;
		return g / Math.hypot(1 - x * x, x / s.actual.q);
	}, 1);
}
