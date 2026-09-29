import { capacitorCandidates, nearestCapacitor, pairedResistor } from './eseries';

/**
 * Sallen-Key low-pass, unity-gain simplified form: two equal resistors R, a
 * capacitor C_bottom from the R-R junction to ground, and a feedback
 * capacitor C_top from the output back to that junction.
 *
 *   wn = 1 / (R * sqrt(C_top * C_bottom))
 *   Q  = (1/2) * sqrt(C_top / C_bottom)   =>   C_top = 4*Q^2 * C_bottom
 *
 * The capacitor ratio is fixed by Q alone, which is the practical reason
 * this topology is discouraged past a low order: a Q of just 3 already asks
 * for a 36:1 capacitor ratio, on top of the Q sensitivity to R (S_R^Q = -2)
 * being four times worse than MFB's.
 */

const SK_R_MIN = 200;
const SK_R_MAX = 2_000_000;
const SK_R_SWEET = 10_000;

export function capRatio(q) {
	return 4 * q * q;
}

/**
 * R (both of them) rounded to stock, and the f0 and Q the stage then has.
 * With `pairs` R may be two resistors in series, kept only when that leaves
 * the stage no further off than a single part, as in roundMfb (mfb.js).
 * Here a pair is always kept: Q is set by the capacitors alone.
 */
function roundSallenKey(Rtarget, Ctop, Cbottom, wn, q, resistorSeries, pairs) {
	const round = (p) => {
		const R = pairedResistor(Rtarget, resistorSeries, p);
		return { R, wn: 1 / (R * Math.sqrt(Ctop * Cbottom)), q: 0.5 * Math.sqrt(Ctop / Cbottom) };
	};
	const single = round(false);
	if (!pairs) return single;
	const paired = round(true);
	const miss = (r) => Math.max(Math.abs(Math.log(r.wn / wn)), Math.abs(Math.log(r.q / q)));
	return miss(paired) <= miss(single) ? paired : single;
}

export function designSallenKeyLowPass(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const ratio = capRatio(q);
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const Cbottom of caps) {
		const Ctarget = ratio * Cbottom;
		const Rtarget = 1 / (wn * Cbottom * 2 * q);
		const score = Math.log(Rtarget / SK_R_SWEET) ** 2;
		if (!(Rtarget > SK_R_MIN && Rtarget < SK_R_MAX)) continue;
		if (best === null || score < best.score) best = { Cbottom, Ctarget, Rtarget, score };
	}
	if (!best) return null;

	// C_top isn't freely chosen (it falls out of the ratio), so it gets
	// rounded onto whatever capacitor values are available: the finer E12
	// grid by default, or the caller's own kit when one is given.
	const Ctop = nearestCapacitor(best.Ctarget, capacitors);
	// R sits on the fine resistor grid, so it is solved AFTER the coarse
	// capacitor rounding, from the pair that will actually be used. Solving
	// it from the ideal C_top instead (as this used to) let C_top's E12
	// rounding, up to 10%, land squarely in f0 on top of R's own rounding:
	// a 1.40 kHz target came out at 1.31 kHz where 1.43 kHz was available.
	const Rsolved = 1 / (wn * Math.sqrt(Ctop * best.Cbottom));
	const r = roundSallenKey(Rsolved, Ctop, best.Cbottom, wn, q, resistorSeries, pairs);

	return {
		topology: 'sallenKey',
		order: 2,
		theoretical: { R: Rsolved, Ctop: best.Ctarget, Cbottom: best.Cbottom, ratio },
		components: { R1: r.R, R2: r.R, Ctop, Cbottom: best.Cbottom },
		actual: { wn: r.wn, q: r.q, gain: 1 },
		steps: { ratio, Cbottom: best.Cbottom, Ctarget: best.Ctarget, CtopRounded: Ctop, Rtarget: Rsolved, resistorSeries }
	};
}

/**
 * Solves for R from a Ctop/Cbottom pair chosen by hand (e.g. to match what
 * is actually in stock) instead of deriving Ctop from the 4*Q^2 ratio. The
 * actual Q this gives depends on whatever ratio the chosen pair happens to
 * have, which will not generally be exactly the target Q.
 */
export function designSallenKeyLowPassFromCaps(wn, q, Ctop, Cbottom, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const Rtarget = 1 / (wn * Math.sqrt(Ctop * Cbottom));
	const r = roundSallenKey(Rtarget, Ctop, Cbottom, wn, q, resistorSeries, pairs);
	const outOfRange = !(r.R > SK_R_MIN && r.R < SK_R_MAX);

	return {
		ok: true,
		manual: true,
		topology: 'sallenKey',
		order: 2,
		theoretical: { R: Rtarget, Ctop, Cbottom, ratio: Ctop / Cbottom },
		components: { R1: r.R, R2: r.R, Ctop, Cbottom },
		actual: { wn: r.wn, q: r.q, gain: 1 },
		steps: { ratio: Ctop / Cbottom, Cbottom, Ctarget: Ctop, Rtarget, resistorSeries },
		outOfRange
	};
}
