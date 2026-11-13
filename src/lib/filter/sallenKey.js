import { SERIES, anyPairAllowed, capacitorCandidates, nearestCapacitor, pairAllowed, pairedResistor, seriesValues, smallCapPenalty, stockNeighbours } from './eseries';

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
 * for a 36:1 capacitor ratio. The sensitivities themselves are mild: with
 * equal resistors Q does not depend on R at all, and moves by half of any
 * capacitor error (see sensitivity.js).
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
 * Here a pair is always kept: Q is set by the capacitors alone. A list of
 * names in `pairs` (pairAllowed in eseries.js) takes 'R1' for both
 * resistors, which are one value.
 */
function roundSallenKey(Rtarget, Ctop, Cbottom, wn, q, resistorSeries, pairs) {
	const round = (p) => {
		const R = pairedResistor(Rtarget, resistorSeries, pairAllowed(p, 'R1'));
		return { R, wn: 1 / (R * Math.sqrt(Ctop * Cbottom)), q: 0.5 * Math.sqrt(Ctop / Cbottom) };
	};
	const single = round(false);
	if (!anyPairAllowed(pairs)) return single;
	const paired = round(pairs);
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
		const score = Math.log(Rtarget / SK_R_SWEET) ** 2 + smallCapPenalty(Cbottom, Ctarget);
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

/* ------------------------------------------------- candidates for a joint search */

/**
 * Every way the stock builds this stage, each judged on its rounded parts
 * (partSearch.js): every C_bottom, C_top the two stocked capacitors on each
 * side of 4 Q^2 C_bottom (from the list, or the E12 grid without one), and
 * R rounded to the stocked values just below and above the one those two
 * capacitors ask for (stockNeighbours: two in series too where `pairs`
 * lets them). `caps` fixes Ctop, Cbottom or both, as typed by hand. R stays
 * in [rMin, rMax).
 * Returns light records { miss, wn, q, pairs, small, level, parts }, parts
 * = { Ctop, Cbottom, Rtarget, R }, unsorted; sallenKeyLowPassFromParts
 * builds one. `rs`, the resistance of the source driving the stage, adds to
 * the first R: the misses are of R + rs and R, and R is rounded around the
 * value whose (R + rs) R is Rtarget^2 too.
 */
export function sallenKeyLowPassCandidates(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = SK_R_MIN, rMax = SK_R_MAX, rs = 0 } = {}) {
	const ratio = capRatio(q);
	const grid = Array.isArray(capacitors) ? capacitorCandidates(capacitors) : seriesValues(SERIES.E12, -12, -3);
	const pairR = pairAllowed(pairs, 'R1');
	const out = [];
	for (const Cbottom of caps?.Cbottom > 0 ? [caps.Cbottom] : capacitorCandidates(capacitors)) {
		let tops = [caps?.Ctop];
		if (!(caps?.Ctop > 0)) {
			const target = ratio * Cbottom;
			let i = 0;
			while (i < grid.length && grid[i] < target) i++;
			tops = grid.slice(Math.max(0, i - 2), i + 2);
		}
		for (const Ctop of tops) {
			const Rtarget = 1 / (wn * Math.sqrt(Ctop * Cbottom));
			if (Rtarget < rMin / 2 || Rtarget > rMax * 2) continue;
			const qA0 = 0.5 * Math.sqrt(Ctop / Cbottom);
			const small = smallCapPenalty(Ctop, Cbottom) > 0;
			let rList = stockNeighbours(Rtarget, resistorSeries, pairR);
			if (rs > 0) {
				const seen = new Set(rList.map((r) => r.value));
				rList = [...rList, ...stockNeighbours((Math.sqrt(rs * rs + 4 * Rtarget * Rtarget) - rs) / 2, resistorSeries, pairR).filter((r) => !seen.has(r.value) && seen.add(r.value))];
			}
			for (const r of rList) {
				if (!(r.value >= rMin * (1 - 1e-9) && r.value < rMax)) continue;
				// (with a source, R1 = R + rs and R2 = R: wn = 1 / sqrt(R1 R2 Ctop Cbottom), Q = sqrt(R1 R2 Ctop Cbottom) / (Cbottom (R1 + R2)))
				const wnA = rs > 0 ? 1 / Math.sqrt((r.value + rs) * r.value * Ctop * Cbottom) : 1 / (r.value * Math.sqrt(Ctop * Cbottom));
				const qA = rs > 0 ? 1 / (wnA * Cbottom * (2 * r.value + rs)) : qA0;
				const miss = Math.max(Math.abs(Math.log(wnA / wn)), Math.abs(Math.log(qA / q)));
				out.push({ miss, wn: wnA, q: qA, pairs: r.pair ? 2 : 0, small, level: Math.log(r.value / SK_R_SWEET) ** 2, parts: { Ctop, Cbottom, Rtarget, R: r.value } });
			}
		}
	}
	return out;
}

/** The stage a record of sallenKeyLowPassCandidates stands for, in the shape designSallenKeyLowPass returns (with ok, manual and outOfRange for capacitors typed by hand). */
export function sallenKeyLowPassFromParts(wn, q, parts, { resistorSeries = 'E24', manual = false } = {}) {
	const { Ctop, Cbottom, Rtarget, R } = parts;
	const ratio = capRatio(q);
	return {
		topology: 'sallenKey',
		order: 2,
		theoretical: { R: Rtarget, Ctop: manual ? Ctop : ratio * Cbottom, Cbottom, ratio: manual ? Ctop / Cbottom : ratio },
		components: { R1: R, R2: R, Ctop, Cbottom },
		actual: { wn: 1 / (R * Math.sqrt(Ctop * Cbottom)), q: 0.5 * Math.sqrt(Ctop / Cbottom), gain: 1 },
		steps: manual ? { ratio: Ctop / Cbottom, Cbottom, Ctarget: Ctop, Rtarget, resistorSeries } : { ratio, Cbottom, Ctarget: ratio * Cbottom, CtopRounded: Ctop, Rtarget, resistorSeries },
		...(manual ? { ok: true, manual: true, outOfRange: !(R > SK_R_MIN && R < SK_R_MAX) } : {})
	};
}
