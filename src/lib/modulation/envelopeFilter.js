import { butterworthOrder, butterworthStages, chebyshevOrder, chebyshevStages, transitionRatio } from './order';
import { designSallenKeyLowPass } from './sallenKeyLowPass';

/**
 * Envelope-recovery low-pass filter after the rectifier: same Butterworth /
 * Chebyshev order search as the active-filter-design tool, low-pass only,
 * cascaded unity-gain Sallen-Key stages. fp is the passband edge (just
 * above the highest modulating frequency to recover) and fs is the
 * stopband edge (the residual carrier ripple frequency - fp_carrier for a
 * half-wave rectifier, 2*fp_carrier for a full-wave one).
 */
export function designEnvelopeLowPass({ response, amaxDb, aminDb, fp, fs, order, resistorSeries = 'E24' }) {
	const k = transitionRatio(fp, fs);
	const minOrder = response === 'chebyshev' ? chebyshevOrder(amaxDb, aminDb, k) : butterworthOrder(amaxDb, aminDb, k);
	const n = order ?? Math.max(2, 2 * Math.ceil(minOrder / 2)); // even order: only 2nd-order Sallen-Key stages, no leftover 1st-order stage

	const proto = response === 'chebyshev' ? chebyshevStages(n, amaxDb) : butterworthStages(n);
	const wc = 2 * Math.PI * fp;

	const stages = proto.stages.map((s) => ({
		wn: wc * Math.sqrt(s.b),
		q: Math.sqrt(s.b) / s.a,
		normalized: s
	}));

	const realized = stages.map((stage) => designSallenKeyLowPass(stage.wn, stage.q, { resistorSeries }));

	return { k, minOrder, n, wc, stages, realized, response, amaxDb, aminDb, fp, fs };
}
