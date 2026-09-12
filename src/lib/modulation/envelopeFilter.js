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
 */
export function designEnvelopeLowPass({ response, amaxDb, aminDb, fp, fs, order, resistorSeries = 'E24' }) {
	const k = transitionRatio(fp, fs);
	const minOrder = response === 'chebyshev' ? chebyshevOrder(amaxDb, aminDb, k) : butterworthOrder(amaxDb, aminDb, k);
	const n = order ?? Math.max(2, 2 * Math.ceil(minOrder / 2)); // even order: only 2nd-order Sallen-Key stages, no leftover 1st-order stage

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

	const realized = stages.map((stage) => designSallenKeyLowPass(stage.wn, stage.q, { resistorSeries }));

	return { k, minOrder, n, wc, wcScale, eps, beta: proto.beta, filterType: 'lowpass', stages, realized, response, amaxDb, aminDb, fp, fs };
}
