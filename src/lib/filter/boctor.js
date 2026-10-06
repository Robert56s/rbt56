import { capacitorCandidates, pairedResistor, smallCapPenalty } from './eseries';

// Boctor networks, Analog Devices Basic Linear Design, figures 8.78 and
// 8.79. Coefficients below are independently derived from nodal equations.
// Stock rounding generally introduces a numerator s term: keep it in the
// response rather than pretending the rounded circuit has an exact null.
export function boctorActual(c, lowSide = true) {
	const g = (i) => 1 / c[`R${i}`];
	let a, b, gain, n1, n0;
	if (lowSide) {
		const k = g(3) / (g(3) + g(5));
		const G = g(2) + g(4) + g(6);
		a = G / c.C2;
		b = g(4) * g(6) / (c.C1 * c.C2);
		gain = k;
		n1 = k * ((g(6) + g(1)) / c.C1 + a) - g(6) / c.C1;
		n0 = k * (g(1) * G + g(6) * (g(2) + g(4))) / (c.C1 * c.C2);
	} else {
		const S = g(4) + g(5), G = g(1) + g(3) + g(6);
		const d2 = g(5) * c.C1 * c.C2 * c.R2;
		a = (g(5) * (c.C1 + G * c.C2 * c.R2) - g(3) * (c.C2 + S * c.C2 * c.R2)) / d2;
		b = (g(5) * G - g(3) * S) / d2;
		gain = S / g(5);
		n1 = (g(1) * S * c.C2 * c.R2 + c.C1 * S - c.C2 * (g(3) + g(6))) / d2;
		n0 = g(1) * S / d2;
	}
	return { wn: Math.sqrt(b), q: Math.sqrt(b) / a, wz: Math.sqrt(n0 / gain), gain, dcGain: n0 / b, numeratorS: n1 };
}

export function boctorFeasible(wn, q, wz, lowSide = true) {
	return [wn, q, wz].every(v => Number.isFinite(v) && v > 0) && (lowSide ? wz > wn : wz < wn && q * (1 - (wz / wn) ** 2) < 1);
}

function boctorIdeal(wn, q, wz, C1, C2, t, lowSide) {
	const rho = (lowSide ? wn / wz : wz / wn) ** 2;
	if (lowSide) {
		const g6 = t * wn * C1, g4 = wn * wn * C1 * C2 / g6;
		const g2 = C2 * wn / q - g6 - g4;
		const g1 = g6 * (1 / rho - 1) - C1 * wn / q;
		return { R1: 1 / g1, R2: 1 / g2, R3: 10000 * (1 / rho - 1), R4: 1 / g4, R5: 10000, R6: 1 / g6, C1, C2 };
	}
	const h = (1 - rho) * q / (wn * C1), j = 1 / (wn * wn * C1 * C1 * h);
	const R2 = (j - h) / (1 + rho), R1 = h * j / (rho * R2);
	const T = 1 / h - 1 / R1;
	const K = t * Math.max(2, 1.5 * (j - R2) / (h * j * T));
	const S = 1 / (j - R2), g3 = (j - R2) / (h * j * K);
	return { R1, R2, R3: 1 / g3, R4: 1 / (S * (1 - 1 / K)), R5: K / S, R6: 1 / (T - g3), C1, C2: C1 };
}

function boctorMiss(a, wn, q, wz, lowSide) {
	if (![a.wn, a.q, a.wz].every(v => Number.isFinite(v) && v > 0)) return Infinity;
	return Math.max(Math.abs(Math.log(a.wn / wn)), Math.abs(Math.log(a.q / q)), Math.abs(Math.log(a.wz / wz)), Math.abs(a.numeratorS / (a.gain * wz)), lowSide ? Math.abs(Math.log(a.dcGain)) : 0);
}

function boctorSearch(wn, q, wz, { lowSide = true, resistorSeries = 'E24', capacitors = null, pairs = false } = {}, manualC = null) {
	if (!boctorFeasible(wn, q, wz, lowSide)) return null;
	const caps = capacitorCandidates(capacitors);
	let best = null;
	for (const C1 of manualC ? [manualC] : caps) {
		for (const C2 of lowSide ? caps : [C1]) {
			const u = C2 / C1, rho = (wn / wz) ** 2;
			// Gain is a free parameter in the high-pass form. Search it too:
			// near the Q limit the rounded feedback ratios dominate the error.
			let ts = [1, 1.125, 1.25, 1.5, 2, 3, 4];
			if (lowSide) {
				const disc = (u / q) ** 2 - 4 * u;
				if (disc <= 0) continue;
				const lo = Math.max((u / q - Math.sqrt(disc)) / 2, rho / (q * (1 - rho)));
				const hi = (u / q + Math.sqrt(disc)) / 2;
				if (!(hi > lo)) continue;
				const zeroDisc = 1 / (rho * q) ** 2 - 4 * (1 / rho + 1 / q ** 2) / u;
				if (zeroDisc < 0) continue;
				ts = [-1, 1].map(sign => u / 2 * (1 / (rho * q) + sign * Math.sqrt(zeroDisc))).filter(t => t > lo && t < hi);
			}
			for (const t of ts) {
				const theoretical = boctorIdeal(wn, q, wz, C1, C2, t, lowSide);
				if (!Object.entries(theoretical).filter(([k]) => k.startsWith('R')).every(([,v]) => v >= 200 && v <= 2e6)) continue;
				const round = p => Object.fromEntries(Object.entries(theoretical).map(([k,v]) => [k, k.startsWith('R') ? pairedResistor(v, resistorSeries, p) : v]));
				const single = round(false), paired = pairs ? round(true) : single;
				const components = boctorMiss(boctorActual(paired, lowSide), wn, q, wz, lowSide) <= boctorMiss(boctorActual(single, lowSide), wn, q, wz, lowSide) ? paired : single;
				const actual = boctorActual(components, lowSide), miss = boctorMiss(actual, wn, q, wz, lowSide);
				if (!Number.isFinite(miss)) continue;
				const score = 1000 * miss ** 2 + smallCapPenalty(C1, C2) + Object.entries(components).filter(([k]) => k.startsWith('R')).reduce((sum,[,v]) => sum + Math.log(v / 10000) ** 2, 0) / 6;
				if (!best || score < best.score) best = { topology: lowSide ? 'boctor' : 'boctorHp', order: 2, lowSide, theoretical, components, actual, score, steps: { C: C1, resistorSeries }, ...(manualC ? { ok: true, manual: true } : {}) };
			}
		}
	}
	return best;
}

export function designBoctorNotch(wn, q, wz, opts = {}) {
	const single = boctorSearch(wn, q, wz, { ...opts, pairs: false });
	if (!opts.pairs) return single;
	const paired = boctorSearch(wn, q, wz, opts);
	if (!single || !paired) return paired ?? single;
	return boctorMiss(paired.actual, wn, q, wz, opts.lowSide !== false) <= boctorMiss(single.actual, wn, q, wz, opts.lowSide !== false) ? paired : single;
}

export function designBoctorNotchFromCap(wn, q, wz, C, opts = {}) {
	return C > 0 ? boctorSearch(wn, q, wz, opts, C) : null;
}
