import { capacitorCandidates, pairedResistor } from './eseries';

/**
 * Multiple-feedback (MFB) low-pass, the envelope filter's other stage: the
 * Active Filter Design tool's circuit and search (filter/mfb.js), on this
 * tool's stock. R1 from the input to the summing node S, C1 from S to
 * ground, R2 from S to the inverting input, R3 from the output back to S,
 * C2 from the inverting input to the output, the + input grounded.
 *
 *   H(s) = c / (s^2 + a*s + b)
 *   a = (1/C1) * (1/R1 + 1/R2 + 1/R3)
 *   b = 1 / (R2*R3*C1*C2)
 *   c = -1 / (R1*R2*C1*C2)
 *
 * R1 = R3 sets the DC gain c/b to exactly -1: the stage inverts. Its size
 * is the unity-gain Sallen-Key's, so a cascade passes the same magnitude
 * and only the sign of what comes out changes, once per stage
 * (envelopeSign in envelopeFilter.js). With x = 1/R1 = 1/R3 and y = 1/R2
 * the two equations 2x + y = a C1 and x y = b C1 C2 give one quadratic,
 * 2x^2 - (a C1) x + b C1 C2 = 0, real only when C1/C2 >= 8 Q^2.
 *
 * Unlike a Sallen-Key's input, which ends on capacitors, S sits at 0 V for
 * DC and slow signals (no DC flows in R2, whose far end only meets C2), so
 * the stage draws its input over R1: the half-wave rectifier counts R1 in
 * its DC load when the first stage is an MFB (rectifier.js).
 */

const MFB_R_MIN = 200; // ohms, below this the op-amp output is loaded too hard
const MFB_R_MAX = 2_000_000; // ohms, above this noise and leakage start to matter
const MFB_R_SWEET = 10_000; // ohms, center of the range the search prefers

/** Both solutions (R1 = R3, R2) for a capacitor pair, or null when C1/C2 is under 8 Q^2. */
function mfbRoots(a, b, C1, C2) {
	const disc = (a * C1) ** 2 - 8 * b * C1 * C2;
	if (disc < 0) return null;
	const sqrtDisc = Math.sqrt(disc);
	return [+1, -1].map((sign) => {
		const x = (a * C1 + sign * sqrtDisc) / 4;
		const y = a * C1 - 2 * x;
		return { R1: 1 / x, R2: 1 / y };
	});
}

/** How far both resistors sit from the sweet spot, as squared logs; Infinity outside 200 ohm .. 2 Mohm. */
function mfbScore(R1, R2) {
	if (!(R1 > MFB_R_MIN && R1 < MFB_R_MAX && R2 > MFB_R_MIN && R2 < MFB_R_MAX)) return Infinity;
	return Math.log(R1 / MFB_R_SWEET) ** 2 + Math.log(R2 / MFB_R_SWEET) ** 2;
}

/**
 * R1 (= R3) and R2 rounded to stock, and the f0 and Q they give. With
 * `pairs` and a list each may be two resistors in series, kept only when
 * the stage then lands no further from its f0 and Q than with single parts
 * (the larger of the two misses, as logs, decides), as in filter/mfb.js.
 */
function roundMfbStage(R1, R2, C1, C2, wn, q, resistorSeries, pairs) {
	const round = (p) => {
		const R1n = pairedResistor(R1, resistorSeries, p);
		const R2n = pairedResistor(R2, resistorSeries, p);
		const aActual = (1 / C1) * (2 / R1n + 1 / R2n);
		const bActual = 1 / (R1n * R2n * C1 * C2);
		return { R1n, R2n, wn: Math.sqrt(bActual), q: Math.sqrt(bActual) / aActual };
	};
	const single = round(false);
	if (!pairs) return single;
	const paired = round(true);
	const miss = (r) => Math.max(Math.abs(Math.log(r.wn / wn)), Math.abs(Math.log(r.q / q)));
	return miss(paired) <= miss(single) ? paired : single;
}

/**
 * Searches the capacitors (the list on hand, or E6 from 1 pF to 1 uF) for
 * the pair (C1, C2) whose resistors sit best in range, then rounds R1 = R3
 * and R2 to the stock. Null when no pair puts both resistors in range, so
 * the caller can fall back to the usual values, as with the Sallen-Key.
 */
export function designMfbLowPass(wn, q, { resistorSeries = 'E24', capacitors = null, pairs = false } = {}) {
	const a = wn / q;
	const b = wn * wn;
	const caps = capacitorCandidates(capacitors);

	let best = null;
	for (const C1 of caps) {
		for (const C2 of caps) {
			if (C2 > C1) continue; // C1/C2 >= 8Q^2 needs C1 the larger one
			if (C1 / C2 < 8 * q * q * 1.02) continue; // a small margin off the singular case
			const roots = mfbRoots(a, b, C1, C2);
			if (!roots) continue;
			for (const { R1, R2 } of roots) {
				const score = mfbScore(R1, R2);
				if (Number.isFinite(score) && (best === null || score < best.score)) best = { C1, C2, R1, R2, score };
			}
		}
	}
	if (!best) return null;

	const r = roundMfbStage(best.R1, best.R2, best.C1, best.C2, wn, q, resistorSeries, pairs);
	const discriminant = (a * best.C1) ** 2 - 8 * b * best.C1 * best.C2;

	return {
		topology: 'mfb',
		order: 2,
		theoretical: { R1: best.R1, R2: best.R2, R3: best.R1, C1: best.C1, C2: best.C2 },
		components: { R1: r.R1n, R2: r.R2n, R3: r.R1n, C1: best.C1, C2: best.C2 },
		actual: { wn: r.wn, q: r.q, gain: -1 },
		steps: { a, b, C1: best.C1, C2: best.C2, discriminant, x: 1 / best.R1, resistorSeries }
	};
}
