import { capacitorCandidates, nearestInSeries, SERIES } from './eseries';

/**
 * Sallen-Key low-pass, unity-gain simplified form: two equal resistors R, a
 * capacitor C_bottom from the R-R junction to ground, and a feedback
 * capacitor C_top from the output back to that junction.
 *
 *   wn = 1 / (R * sqrt(C_top * C_bottom))
 *   Q  = (1/2) * sqrt(C_top / C_bottom)   =>   C_top = 4*Q^2 * C_bottom
 *
 * Used here as the envelope-recovery low-pass after the precision
 * rectifier: unity DC gain keeps the recovered envelope at the same scale
 * as the rectified signal feeding it, with no inversion to track.
 */

const SK_R_MIN = 200;
const SK_R_MAX = 2_000_000;
const SK_R_SWEET = 10_000;

export function capRatio(q) {
	return 4 * q * q;
}

export function designSallenKeyLowPass(wn, q, { resistorSeries = 'E24' } = {}) {
	const ratio = capRatio(q);
	const caps = capacitorCandidates();

	let best = null;
	for (const Cbottom of caps) {
		const Ctarget = ratio * Cbottom;
		const Rtarget = 1 / (wn * Cbottom * 2 * q);
		const score = Math.log(Rtarget / SK_R_SWEET) ** 2;
		if (!(Rtarget > SK_R_MIN && Rtarget < SK_R_MAX)) continue;
		if (best === null || score < best.score) best = { Cbottom, Ctarget, Rtarget, score };
	}
	if (!best) return null;

	const series = SERIES[resistorSeries];
	const R = nearestInSeries(best.Rtarget, series);
	const Ctop = nearestInSeries(best.Ctarget, SERIES.E12, -12, -3);
	const wnActual = 1 / (R * Math.sqrt(Ctop * best.Cbottom));
	const qActual = 0.5 * Math.sqrt(Ctop / best.Cbottom);

	return {
		topology: 'sallenKey',
		order: 2,
		theoretical: { R: best.Rtarget, Ctop: best.Ctarget, Cbottom: best.Cbottom, ratio },
		components: { R1: R, R2: R, Ctop, Cbottom: best.Cbottom },
		actual: { wn: wnActual, q: qActual, gain: 1 },
		steps: { ratio, Cbottom: best.Cbottom, Ctarget: best.Ctarget, Rtarget: best.Rtarget, resistorSeries }
	};
}
