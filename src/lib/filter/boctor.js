import { anyPairAllowed, capacitorCandidates, pairAllowed, pairedResistor, seriesPair, smallCapPenalty, stockNeighbours } from './eseries';

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

// Every capacitor choice that builds the stage, with its ideal parts and
// its resistors rounded to single parts (single, and the miss they leave)
// and, once asked for, to pairs where they help (paired): whatever names a
// call lets pair, its parts mix the two, so the many lists a pair limit
// asks one stage for share the rounding.
function boctorChoices(wn, q, wz, lowSide, resistorSeries, capacitors, manualC) {
	const caps = capacitorCandidates(capacitors);
	const out = [];
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
				const single = Object.fromEntries(Object.entries(theoretical).map(([k,v]) => [k, k.startsWith('R') ? pairedResistor(v, resistorSeries, false) : v]));
				out.push({ C1, C2, theoretical, single, singleMiss: boctorMiss(boctorActual(single, lowSide), wn, q, wz, lowSide), paired: null });
			}
		}
	}
	return out;
}

// `pairs` may also be a list of the names allowed to pair (pairAllowed in
// eseries.js), 'R1' to 'R6'.
function boctorSearch(wn, q, wz, { lowSide = true, resistorSeries = 'E24', capacitors = null, pairs = false } = {}, manualC = null) {
	if (!boctorFeasible(wn, q, wz, lowSide)) return null;
	const choices = manualC ? boctorChoices(wn, q, wz, lowSide, resistorSeries, capacitors, manualC) : boctorChoicesKept(wn, q, wz, lowSide, resistorSeries, capacitors);
	const anyPair = anyPairAllowed(pairs);
	let best = null;
	for (const choice of choices) {
		const { C1, C2, theoretical, single, singleMiss } = choice;
		let paired = single;
		if (anyPair) {
			choice.paired ??= Object.fromEntries(Object.entries(theoretical).map(([k,v]) => [k, k.startsWith('R') ? pairedResistor(v, resistorSeries, true) : v]));
			paired = Object.fromEntries(Object.entries(theoretical).map(([k,v]) => [k, k.startsWith('R') ? (pairAllowed(pairs, k) ? choice.paired : single)[k] : v]));
		}
		const components = (paired === single ? singleMiss : boctorMiss(boctorActual(paired, lowSide), wn, q, wz, lowSide)) <= singleMiss ? paired : single;
		const actual = boctorActual(components, lowSide), miss = boctorMiss(actual, wn, q, wz, lowSide);
		if (!Number.isFinite(miss)) continue;
		const score = 1000 * miss ** 2 + smallCapPenalty(C1, C2) + Object.entries(components).filter(([k]) => k.startsWith('R')).reduce((sum,[,v]) => sum + Math.log(v / 10000) ** 2, 0) / 6;
		if (!best || score < best.score) best = { topology: lowSide ? 'boctor' : 'boctorHp', order: 2, lowSide, theoretical, components, actual, score, steps: { C: C1, resistorSeries }, ...(manualC ? { ok: true, manual: true } : {}) };
	}
	// (the parts of the choices kept are shared: the result gets its own)
	return best && { ...best, theoretical: { ...best.theoretical }, components: { ...best.components } };
}

// The single-part search is the same whatever pairs a call allows, and the
// pair limits ask for one stage with many lists: it is kept, by stock.
// (a list of values is a key by itself, held weakly: a typed stock makes a new one on every edit)
// The capacitor choices (boctorChoices) are kept the same way, fewer of them.
const BOCTOR_SINGLE_SIZE = 512;
const BOCTOR_CHOICES_SIZE = 48;
const boctorSlot = () => ({ named: new Map(), lists: new WeakMap(), found: new Map(), choices: new Map() });
const BOCTOR_SINGLE = boctorSlot();
function boctorSlotOf(slot, k) {
	const m = k !== null && typeof k === 'object' ? slot.lists : slot.named;
	if (!m.has(k)) m.set(k, boctorSlot());
	return m.get(k);
}
function boctorChoicesKept(wn, q, wz, lowSide, resistorSeries, capacitors) {
	const kept = boctorSlotOf(boctorSlotOf(BOCTOR_SINGLE, resistorSeries), capacitors).choices;
	const key = `${wn} ${q} ${wz} ${lowSide}`;
	if (!kept.has(key)) {
		if (kept.size >= BOCTOR_CHOICES_SIZE) kept.delete(kept.keys().next().value);
		kept.set(key, boctorChoices(wn, q, wz, lowSide, resistorSeries, capacitors, null));
	}
	return kept.get(key);
}
function boctorSingle(wn, q, wz, opts) {
	const { lowSide = true, resistorSeries = 'E24', capacitors = null } = opts;
	const found = boctorSlotOf(boctorSlotOf(BOCTOR_SINGLE, resistorSeries), capacitors).found;
	const key = `${wn} ${q} ${wz} ${lowSide}`;
	if (!found.has(key)) {
		if (found.size >= BOCTOR_SINGLE_SIZE) found.delete(found.keys().next().value);
		found.set(key, boctorSearch(wn, q, wz, { ...opts, pairs: false }));
	}
	const single = found.get(key);
	return single && { ...single };
}

export function designBoctorNotch(wn, q, wz, opts = {}) {
	const single = boctorSingle(wn, q, wz, opts);
	if (!anyPairAllowed(opts.pairs)) return single;
	const paired = boctorSearch(wn, q, wz, opts);
	if (!single || !paired) return paired ?? single;
	return boctorMiss(paired.actual, wn, q, wz, opts.lowSide !== false) <= boctorMiss(single.actual, wn, q, wz, opts.lowSide !== false) ? paired : single;
}

export function designBoctorNotchFromCap(wn, q, wz, C, opts = {}) {
	return C > 0 ? boctorSearch(wn, q, wz, opts, C) : null;
}

// ------------------------------------------- candidates for a joint search

// How many partial roundings of one capacitor choice are carried from one
// resistor to the next (the closest ones, the rest solved exactly), and as
// many more without a pair, half as many with one or two pairs.
const BOCTOR_BEAM = 4;
// The resistors by index (R1 is 0), and the order they are rounded in, each
// solved against the ones already rounded (boctorTarget).
const BOCTOR_NAMES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
const BOCTOR_ORDER = { low: [5, 3, 1, 0, 4, 2], high: [1, 0, 4, 2, 3, 5] };

// The resistance step s of the rounding aims at, from the parts v (by
// index) already rounded: the low-pass form sets f0 with R6 and R4, Q with
// R2, the zero with R1, and R3 against R5 cancels the s term of the
// numerator (which leaves the gain at DC near 1); the high-pass form
// (C1 = C2) sets the zero with R2 and R1, then R3 against R5 for Q, R4 for
// f0, and R6 for the s term or, with `second`, for f0 (the stocked values
// around either are tried). x = { wn, q, wz, C1, C2, th }, th the ideal
// parts by index. Not a positive number when the parts so far leave none.
function boctorTarget(v, s, lowSide, x, second = false) {
	const { wn, q, wz, C1, C2, th } = x;
	if (lowSide) {
		if (s === 0) return th[5];
		if (s === 1) return 1 / (wn * wn * C1 * C2 * v[5]);
		if (s === 2) return 1 / ((C2 * wn) / q - 1 / v[5] - 1 / v[3]);
		const G = 1 / v[1] + 1 / v[3] + 1 / v[5];
		if (s === 3) return G / (wz * wz * C1 * C2 - (1 / v[5]) * (1 / v[1] + 1 / v[3]));
		const k = 1 / v[5] / (1 / v[5] + 1 / v[0] + (G / C2) * C1);
		// (only R3 / R5 sets k: with `second`, R5 scaled so that R3 lands on R5's own ideal value instead, where
		// R3 would sit far under it: a zero close to f0 leaves k near 1)
		if (s === 4) return second ? (th[4] * k) / (1 - k) : th[4];
		return (v[4] * (1 - k)) / k;
	}
	const C = C1;
	if (s === 0) return th[1];
	if (s === 1) return 1 / (wz * wz * C * C * v[1]);
	if (s === 2) return th[4];
	if (s === 3) return v[4] / (1 + wn * wn * C * C * v[1] * v[1] - (wn / q) * C * v[1]);
	const g1 = 1 / v[0];
	const p = 1 + g1 * v[1];
	if (s === 4) return 1 / ((wn * wn * C * C * v[1] - g1) / (p - v[4] / v[2]) - 1 / v[4]);
	const S = 1 / v[3] + 1 / v[4];
	return second ? 1 / (wn * wn * C * C * v[1] - g1 - 1 / v[2] + (v[4] / v[2]) * S) : 1 / (S * p - 1 / v[2]);
}

// R5 of the low-pass form: its ideal value, and where that leaves R3 (R5
// (1 - k) / k) under half of it, also the value that puts R3 there.
function boctorR5Aims(v, x) {
	const own = boctorTarget(v, 4, true, x);
	const scaled = boctorTarget(v, 4, true, x, true);
	return scaled > 2 * own ? [own, scaled] : [own];
}

// boctorActual and boctorMiss of the parts v (by index) at once, without
// the objects: { miss, wn, q, wz }, miss Infinity for parts that are not
// all positive or that leave no real f0, Q or zero.
function boctorJudge(v, C1, C2, lowSide, wn, q, wz) {
	for (let k = 0; k < 6; k++) if (!(v[k] > 0 && v[k] < Infinity)) return { miss: Infinity };
	const g1 = 1 / v[0], g2 = 1 / v[1], g3 = 1 / v[2], g4 = 1 / v[3], g5 = 1 / v[4], g6 = 1 / v[5];
	let a, b, gain, n1, n0;
	if (lowSide) {
		const k = g3 / (g3 + g5);
		const G = g2 + g4 + g6;
		a = G / C2;
		b = g4 * g6 / (C1 * C2);
		gain = k;
		n1 = k * ((g6 + g1) / C1 + a) - g6 / C1;
		n0 = k * (g1 * G + g6 * (g2 + g4)) / (C1 * C2);
	} else {
		const S = g4 + g5, G = g1 + g3 + g6;
		const d2 = g5 * C1 * C2 * v[1];
		a = (g5 * (C1 + G * C2 * v[1]) - g3 * (C2 + S * C2 * v[1])) / d2;
		b = (g5 * G - g3 * S) / d2;
		gain = S / g5;
		n1 = (g1 * S * C2 * v[1] + C1 * S - C2 * (g3 + g6)) / d2;
		n0 = g1 * S / d2;
	}
	const wnA = Math.sqrt(b), qA = wnA / a, wzA = Math.sqrt(n0 / gain);
	if (![wnA, qA, wzA].every((y) => Number.isFinite(y) && y > 0)) return { miss: Infinity };
	const miss = Math.max(Math.abs(Math.log(wnA / wn)), Math.abs(Math.log(qA / q)), Math.abs(Math.log(wzA / wz)), Math.abs(n1 / (gain * wz)), lowSide ? Math.abs(Math.log(n0 / b)) : 0);
	return { miss, wn: wnA, q: qA, wz: wzA };
}

/**
 * Every way the stock builds this notch, each judged on its rounded parts,
 * for a search over the whole filter (partSearch.js): every capacitor
 * choice boctorChoices makes (C1 the one typed by hand, `caps.C`, when there
 * is one; C2 every capacitor for the low-pass form, C1 itself for the
 * high-pass one; the free gain of the high-pass form over its usual
 * steps), its resistors rounded one after another to the stocked values
 * just below and just above the value that holds the stage's figures with
 * the ones already rounded (boctorTarget; stockNeighbours: two in series
 * too where `pairs` lets them; R5 of the low-pass form also scaled with R3,
 * whose ratio alone counts, where R3 would land far under it), the closest
 * partial roundings carried on
 * (BOCTOR_BEAM), and the designer's own rounding of each part to its
 * nearest value. Every resistor stays in [rMin, rMax).
 * Returns light records { miss, wn, q, wz, pairs, small, level, parts },
 * parts = { C1, C2, theoretical, R1n, ..., R6n }, unsorted; boctorFromParts
 * builds one. miss is the designer's (boctorMiss: f0, Q, the zero, the s
 * term left in the numerator and, for the low-pass form, the gain at DC),
 * level how far the resistors sit from 10 kohm.
 */
export function boctorCandidates(wn, q, wz, { lowSide = true, resistorSeries = 'E24', capacitors = null, pairs = false, caps = null, rMin = 200, rMax = 2e6 } = {}) {
	if (!boctorFeasible(wn, q, wz, lowSide)) return [];
	const all = capacitorCandidates(capacitors);
	const far = (R) => !(R >= rMin / 2 && R <= rMax * 2);
	const allowed = BOCTOR_NAMES.map((name) => pairAllowed(pairs, name));
	const near = (target, k) => (far(target) ? [] : stockNeighbours(target, resistorSeries, allowed[k]).filter((r) => r.value >= rMin * (1 - 1e-9) && r.value < rMax));
	const order = lowSide ? BOCTOR_ORDER.low : BOCTOR_ORDER.high;
	const full = new Float64Array(6);
	const out = [];
	for (const C1 of caps?.C > 0 ? [caps.C] : all) {
		for (const C2 of lowSide ? all : [C1]) {
			const u = C2 / C1, rho = (wn / wz) ** 2;
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
			const small = smallCapPenalty(C1, C2) > 0;
			for (const t of ts) {
				const theoretical = boctorIdeal(wn, q, wz, C1, C2, t, lowSide);
				const th = BOCTOR_NAMES.map((k) => theoretical[k]);
				if (th.some(far)) continue;
				const x = { wn, q, wz, C1, C2, th };
				let states = [{ v: new Float64Array(6).fill(NaN), pairs: 0, miss: 0 }];
				for (let s = 0; s < 6 && states.length; s++) {
					const k = order[s];
					const next = [];
					for (const st of states) {
						const targets = lowSide ? (s === 4 ? boctorR5Aims(st.v, x) : [boctorTarget(st.v, s, true, x)]) : s < 5 ? [boctorTarget(st.v, s, false, x)] : [boctorTarget(st.v, s, false, x), boctorTarget(st.v, s, false, x, true)];
						let seen = null;
						for (const target of targets) {
							for (const r of near(target, k)) {
								if (seen?.has(r.value)) continue;
								(seen ??= new Set()).add(r.value);
								const v = st.v.slice();
								v[k] = r.value;
								next.push({ v, pairs: st.pairs + (r.pair ? 1 : 0), miss: 0 });
							}
						}
					}
					if (s === 5) {
						states = next;
						break;
					}
					// the parts so far, the rest solved exactly: how close the stage can still land
					for (const st of next) {
						full.set(st.v);
						for (let w = s + 1; w < 6; w++) full[order[w]] = boctorTarget(full, w, lowSide, x);
						st.miss = boctorJudge(full, C1, C2, lowSide, wn, q, wz).miss;
					}
					// the closest ones, and the closest with no pair, one or two, so that a limit on pairs still finds some
					const sorted = next.filter((y) => Number.isFinite(y.miss)).sort((a, b) => a.miss - b.miss);
					const kept = new Map();
					states = sorted.filter((y, j) => {
						const m = kept.get(y.pairs) ?? 0;
						kept.set(y.pairs, m + 1);
						return j < BOCTOR_BEAM || m < (y.pairs === 0 ? BOCTOR_BEAM : y.pairs <= 2 ? BOCTOR_BEAM / 2 : 0);
					});
				}
				// the designer's own rounding too, each part to its nearest stocked value (pairs where they help)
				for (const p of anyPairAllowed(pairs) ? [false, pairs] : [false]) {
					const v = Float64Array.from(BOCTOR_NAMES, (name, k) => pairedResistor(th[k], resistorSeries, pairAllowed(p, name)));
					if (v.some((y) => !(y >= rMin * (1 - 1e-9) && y < rMax)) || states.some((st) => st.v.every((y, j) => y === v[j]))) continue;
					states.push({ v, pairs: v.filter((y) => seriesPair(y, resistorSeries)).length, miss: 0 });
				}
				for (const st of states) {
					const judged = boctorJudge(st.v, C1, C2, lowSide, wn, q, wz);
					if (!Number.isFinite(judged.miss)) continue;
					let level = 0;
					for (let j = 0; j < 6; j++) level += Math.log(st.v[j] / 10000) ** 2;
					const [R1n, R2n, R3n, R4n, R5n, R6n] = st.v;
					out.push({ miss: judged.miss, wn: judged.wn, q: judged.q, wz: judged.wz, pairs: st.pairs, small, level: level / 6, parts: { C1, C2, theoretical, R1n, R2n, R3n, R4n, R5n, R6n } });
				}
			}
		}
	}
	return out;
}

/** The stage a record of boctorCandidates stands for, in the shape designBoctorNotch returns (with ok and manual for a capacitor typed by hand). */
export function boctorFromParts(wn, q, wz, parts, { lowSide = true, resistorSeries = 'E24', manual = false } = {}) {
	const { C1, C2, theoretical, R1n, R2n, R3n, R4n, R5n, R6n } = parts;
	const components = { R1: R1n, R2: R2n, R3: R3n, R4: R4n, R5: R5n, R6: R6n, C1, C2 };
	return { topology: lowSide ? 'boctor' : 'boctorHp', order: 2, lowSide, theoretical: { ...theoretical }, components, actual: boctorActual(components, lowSide), steps: { C: C1, resistorSeries }, ...(manual ? { ok: true, manual: true } : {}) };
}
