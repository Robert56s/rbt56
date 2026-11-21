// The narrow band-pass file (src/lib/filter/python/narrow.js and
// narrowCircuits.js): its designs, what the page shows for each, the file's
// own rule written again in JavaScript, and the library's stages of its parts.
// A narrow band-pass is judged by its own measure (narrowFigures and the
// limits of NARROW_RULE), not by a template: check-python.mjs reads its
// designs (filterType 'narrowband') with the functions below.
//   narrowPage(args)        what the page builds for the arguments its
//                           download takes: { design, chosen, auto, result },
//                           result the chain panel 04 shows (realizeNarrow's,
//                           the Circuit menu or its rule, the capacitors typed,
//                           the pair limit) with the page's measure of it, or
//                           null when that circuit cannot be built
//   narrowOwnParts(design, args, circuit)  the file's own rule, operation for
//                           operation as the Python writes it: { parts } with
//                           the gain stages last, or { stop }
//   narrowLibStage(circuit, parts, gbw)  the library's realized stage of a
//                           set of parts (bode.js and nodal.js read it)
//   narrowMeasure(stages, design)  the page's measure of a chain: its
//                           figures, their errors, the fit and the verdict
//   narrowStock(args)       the stock the rule draws on
//   cases, sweep            [label, args, opts]: args as the page's narrow
//                           download passes them (capOverrides in farads by
//                           stage), opts as python-checks/index.mjs says

import { responseAt } from '../../src/lib/filter/bode.js';
import { LAB_KIT, SERIES } from '../../src/lib/filter/eseries.js';
import { khnBpActual } from '../../src/lib/filter/khnBandPass.js';
import { mfbBandPassActual, mfbBandPassEffective } from '../../src/lib/filter/mfbBandPass.js';
import { compareNarrowCircuits, designNarrowBand, narrowDefaultCircuit, narrowFigures, narrowFit, narrowLimitPairs, realizeNarrow, NARROW_REAL_GBW } from '../../src/lib/filter/narrowBand.js';
import { rlcGicActual, rlcGyratorActual } from '../../src/lib/filter/rlcBandPass.js';
import { sallenKeyBpActual } from '../../src/lib/filter/sallenKeyBandPass.js';
import { shortValue } from '../../src/lib/filter/python/emit.js';
import { OPAMP_GBW } from '../../src/lib/spice/opamps.js';

const TWO_PI = 2 * Math.PI;

/** The Python circuit of each library topology of a narrow chain. */
export const NARROW_PY = {
	rlcGyrator: 'rlc_gyrator',
	rlcGic: 'rlc_gic',
	sallenKeyBp: 'sallen_key_bandpass',
	mfbBp: 'mfb_bandpass',
	khnBp: 'khn_bandpass',
	towThomasBp: 'tow_thomas_bandpass',
	gainNonInv: 'amplifier'
};

/* ------------------------------------------------------------ the page */

/** The stock as the page's componentOptions hands it to the narrow designers. */
function pageOpts(args) {
	const list = Array.isArray(args.resistorStock);
	return {
		resistorSeries: list ? args.resistorStock : args.resistorStock === 'E96' ? 'E96' : 'E24',
		capacitors: Array.isArray(args.capacitorStock) ? args.capacitorStock : null,
		pairs: list && Boolean(args.resistorPairs),
		gbw: Number.isFinite(args.opampGbw) && args.opampGbw > 0 ? args.opampGbw : null
	};
}

/** The page's measure of a chain (narrowIdealFig, narrowErrorsOf, narrowWithin of +page.svelte). */
export function narrowMeasure(stages, design) {
	const figures = narrowFigures((f) => responseAt(stages, f), design.f0);
	const errors = { f0: figures.f0 / design.f0 - 1, q: figures.q === null ? null : figures.q / design.q - 1, gain: Math.abs(figures.gain) / design.gain - 1 };
	const fit = narrowFit(errors, design);
	return { figures, errors, fit, within: fit <= 1 };
}

/**
 * What the page builds for the arguments of its narrow download: the design
 * (designNarrowBand), the comparison of the six circuits (compareNarrowCircuits
 * on the stock, the MFB stages built for args.opampGbw, every circuit within
 * the pair limit), the circuit of the menu or of the rule, and the chain
 * panel 04 shows (narrowBuild of +page.svelte: the table's own build, or built
 * again with the capacitors typed, a stage they cannot build keeping its
 * automatic ones, within the pair limit).
 */
export function narrowPage(args) {
	const design = designNarrowBand({ f0: args.f0, q: args.narrowBy === 'q' ? args.q : null, bandwidth: args.narrowBy === 'b' ? args.bandwidth : null, gain: args.gain, stages: args.stages });
	const opts = pageOpts(args);
	const limit = opts.pairs && Number.isInteger(args.resistorPairLimit) ? args.resistorPairLimit : null;
	const rows = compareNarrowCircuits(design, { ...opts, realGbw: NARROW_REAL_GBW, pairLimit: limit });
	const auto = narrowDefaultCircuit(rows);
	const chosen = args.circuitMenu === 'auto' ? auto : args.circuitMenu;
	const row = rows.find((r) => r.circuit === chosen) ?? null;
	if (!row || !row.ok) return { design, chosen, auto, result: null };
	const autoBuild = row.realized;
	const ov = args.capOverrides ?? {};
	const capFor = (i) => {
		const o = ov[i];
		if (!o) return null;
		if (chosen === 'mfbBp') {
			const C1 = o.C1 > 0 ? o.C1 : autoBuild.resonators[i]?.components.C1;
			const C2 = o.C2 > 0 ? o.C2 : autoBuild.resonators[i]?.components.C2;
			return C1 > 0 && C2 > 0 ? { C1, C2 } : null;
		}
		return o.C > 0 ? { C: o.C } : null;
	};
	const typed = design.stages.map((_, i) => i).filter((i) => capFor(i));
	const capsOf = (list) => design.stages.map((_, i) => (list.includes(i) ? capFor(i) : null));
	const realize = (list, pairs = opts.pairs) => realizeNarrow(design, chosen, { ...opts, pairs, caps: capsOf(list) });
	let kept = typed;
	const dropped = [];
	if (typed.length && !realize(typed).ok) {
		for (const i of typed) if (!realize([i]).ok) dropped.push(i);
		kept = typed.filter((i) => !dropped.includes(i));
		if (kept.length && !realize(kept).ok) {
			dropped.push(...kept);
			kept = [];
		}
	}
	let realized;
	if (limit !== null) realized = (kept.length ? narrowLimitPairs((pairs) => realize(kept, pairs), limit, design, opts.resistorSeries) : row.plan).realized;
	else realized = kept.length ? realize(kept) : autoBuild;
	if (!realized.ok) return { design, chosen, auto, result: null };
	return { design, chosen, auto, result: { ...realized, dropped, ...narrowMeasure(realized.stages, design) } };
}

/* ------------------------------------------------- the file's own rule */

// Written again from the Python of narrowCircuits.js and narrow.js, each
// expression in the same order, complex numbers as [re, im] with CPython's
// operations (its division is Smith's), so that the rule's choices, ties
// included, come out as the file's.

const R_MIN = 1e3;
const R_MAX = 1e6;
const C_MIN = 47e-12;
const RATIO = 10 * (1 + 1e-9);

/** The stock the rule draws on, as the file's SETTINGS write it: a series over 1 ohm to 9.1 Mohm (9.76), E6 from 1 pF. */
export function narrowStock(args) {
	const decade = (series, from, to) => {
		const out = [];
		for (let d = from; d <= to; d++) for (const m of series) out.push(m * 10 ** d);
		return out;
	};
	const r = args.resistorStock ?? 'E24';
	return {
		resistors: Array.isArray(r) ? r : decade(SERIES[r === 'E96' ? 'E96' : 'E24'], 0, 6),
		capacitors: Array.isArray(args.capacitorStock) ? args.capacitorStock : decade(SERIES.E6, -12, -6)
	};
}

// CPython's complex arithmetic: a float operand is a complex of imaginary part 0
const cx = {
	add: (a, b) => [a[0] + b[0], a[1] + b[1]],
	addr: (x, a) => [x + a[0], a[1]],
	mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
	mulr: (a, x) => [a[0] * x, a[1] * x],
	divr: (a, x) => [a[0] / x, a[1] / x],
	neg: (a) => [-a[0], -a[1]],
	div(a, b) {
		const abr = Math.abs(b[0]);
		const abi = Math.abs(b[1]);
		if (abr >= abi) {
			const ratio = b[1] / b[0];
			const denom = b[0] + b[1] * ratio;
			return [(a[0] + a[1] * ratio) / denom, (a[1] - a[0] * ratio) / denom];
		}
		const ratio = b[0] / b[1];
		const denom = b[0] * ratio + b[1];
		return [(a[0] * ratio + a[1]) / denom, (a[1] * ratio - a[0]) / denom];
	},
	abs: (a) => Math.hypot(a[0], a[1])
};
const real = (x) => [x, 0];

/** thevenin(p): Ra || Rb and alpha. */
function thevenin(p) {
	if (!('Rb' in p)) return [p.Ra, 1];
	return [(p.Ra * p.Rb) / (p.Ra + p.Rb), p.Rb / (p.Ra + p.Rb)];
}

/** sallen_key_terms(p): K, a and b. */
function skTerms(p) {
	const g1 = 1 / p.Ra + ('Rb' in p ? 1 / p.Rb : 0);
	const k = 1 + p.Rf / p.Rg;
	const b = (g1 + 1 / p.R3) / (p.C1 * p.C2 * p.R2);
	const a = (g1 + (1 - k) / p.R3) / p.C1 + 1 / (p.C2 * p.R2) + 1 / (p.C1 * p.R2);
	return [k, a, b];
}

/** Each circuit's H(s), (p, s, gbw), as the file's <circuit>_h. */
const H = {
	rlc_gyrator(p, s) {
		const [r, alpha] = thevenin(p);
		// p["R1"] * (1 + s * p["R2"] * p["Cg"]) / (1 + s * p["R1"] * p["Cg"])
		const zin = cx.div(cx.mulr(cx.addr(1, cx.mulr(cx.mulr(s, p.R2), p.Cg)), p.R1), cx.addr(1, cx.mulr(cx.mulr(s, p.R1), p.Cg)));
		// alpha / (1 + r * (s * p["C"] + 1 / zin))
		return cx.div(real(alpha), cx.addr(1, cx.mulr(cx.add(cx.mulr(s, p.C), cx.div(real(1), zin)), r)));
	},
	rlc_gic(p, s) {
		const [r, alpha] = thevenin(p);
		const l = (p.Cg * p.R1 * p.R3 * p.R4) / p.R2;
		return cx.div(real(alpha), cx.addr(1, cx.mulr(cx.add(cx.mulr(s, p.C), cx.div(real(1), cx.mulr(s, l))), r)));
	},
	sallen_key_bandpass(p, s) {
		const [k, a, b] = skTerms(p);
		// k_amp * s / (p["Ra"] * p["C1"]) / (s * s + a * s + b)
		const num = cx.divr(cx.mulr(s, k), p.Ra * p.C1);
		return cx.div(num, cx.addr(b, cx.add(cx.mul(s, s), cx.mulr(s, a))));
	},
	mfb_bandpass(p, s, gbw) {
		const a = (p.C1 + p.C2) / (p.R3 * p.C1 * p.C2);
		const b = (1 / p.R1 + 1 / p.R2) / (p.R3 * p.C1 * p.C2);
		if (gbw === null) return cx.div(cx.divr(cx.neg(s), p.R1 * p.C1), cx.addr(b, cx.add(cx.mul(s, s), cx.mulr(s, a))));
		const wt = TWO_PI * gbw;
		const c2 = wt + a + (1 / p.R1 + 1 / p.R2) / p.C1;
		// -wt * s / (R1 C1) / (s * s * s + c2 * s * s + (wt * a + b) * s + wt * b)
		const num = cx.divr(cx.mulr(s, -wt), p.R1 * p.C1);
		const s3 = cx.mul(cx.mul(s, s), s);
		const s2 = cx.mul(cx.mulr(s, c2), s);
		const den = cx.addr(wt * b, cx.add(cx.add(s3, s2), cx.mulr(s, wt * a + b)));
		return cx.div(num, den);
	},
	khn_bandpass(p, s) {
		const d = 1 + p.R4 / p.R3 + p.R4 / p.R7;
		const s2 = (p.R1 * p.R2 * p.R4 * p.C1 * p.C2) / p.R7;
		const s1 = (p.R2 * p.C2 * d) / (1 + p.R5 / p.R6);
		// p["R2"] * p["R4"] * p["C2"] / p["R3"] * s / (s2 * s * s + s1 * s + 1)
		const num = cx.mulr(s, (p.R2 * p.R4 * p.C2) / p.R3);
		return cx.div(num, cx.addr(1, cx.add(cx.mul(cx.mulr(s, s2), s), cx.mulr(s, s1))));
	},
	tow_thomas_bandpass(p, s) {
		// s * s + s / (C1 Rd) + 1 / (C1 C2 Ra Rb), then -s / (C1 R1) / den
		const den = cx.addr(1 / (p.C1 * p.C2 * p.Ra * p.Rb), cx.add(cx.mul(s, s), cx.divr(s, p.C1 * p.Rd)));
		return cx.div(cx.divr(cx.neg(s), p.C1 * p.R1), den);
	},
	amplifier: (p) => real(1 + p.R2 / p.R1)
};

/** Each circuit's <circuit>_figures. */
const FIGURES = {
	rlc_gyrator(p) {
		const [r] = thevenin(p);
		const w0 = Math.sqrt((1 + p.R1 / r) / (p.R1 * p.R2 * p.C * p.Cg));
		const a = 1 / (r * p.C) + 1 / (p.R2 * p.C) + 1 / (p.R2 * p.Cg);
		const out = { f0: w0 / TWO_PI, q: w0 / a };
		if ('Rb' in p) out.gain = cx.abs(H.rlc_gyrator(p, [0, w0]));
		return out;
	},
	rlc_gic(p) {
		const [r, alpha] = thevenin(p);
		const l = (p.Cg * p.R1 * p.R3 * p.R4) / p.R2;
		const out = { f0: 1 / (TWO_PI * Math.sqrt(l * p.C)), q: r * Math.sqrt(p.C / l) };
		if ('Rb' in p) out.gain = alpha;
		return out;
	},
	sallen_key_bandpass(p) {
		const [k, a, b] = skTerms(p);
		const out = { f0: Math.sqrt(b) / TWO_PI, q: Math.sqrt(b) / a };
		if ('Rb' in p) out.gain = k / (p.Ra * p.C1) / a;
		return out;
	},
	mfb_bandpass(p) {
		const b = (1 / p.R1 + 1 / p.R2) / (p.R3 * p.C1 * p.C2);
		const a = (p.C1 + p.C2) / (p.R3 * p.C1 * p.C2);
		return { f0: Math.sqrt(b) / TWO_PI, q: Math.sqrt(b) / a, gain: (p.R3 * p.C2) / (p.R1 * (p.C1 + p.C2)) };
	},
	khn_bandpass(p) {
		const d = 1 + p.R4 / p.R3 + p.R4 / p.R7;
		const big = 1 + p.R5 / p.R6;
		const w0 = Math.sqrt(p.R7 / (p.R1 * p.R2 * p.R4 * p.C1 * p.C2));
		const q = (big / d) * Math.sqrt((p.R1 * p.R4 * p.C1) / (p.R2 * p.R7 * p.C2));
		return { f0: w0 / TWO_PI, q, gain: ((p.R4 / p.R3) * big) / d };
	},
	tow_thomas_bandpass(p) {
		const w0 = 1 / Math.sqrt(p.C1 * p.C2 * p.Ra * p.Rb);
		return { f0: w0 / TWO_PI, q: w0 * p.C1 * p.Rd, gain: p.Rd / p.R1 };
	}
};

/** circuit_alone(st, ratio): the MFB circuit's own targets for the op-amp of gbw, or null. */
function circuitAlone(st, ratio, gbw) {
	const wt = TWO_PI * gbw;
	const w0 = TWO_PI * st.f0;
	const bigA = w0 / st.q;
	const bigB = w0 * w0;
	if (!(bigA > bigB / wt && wt * wt - bigA * wt + bigB > 0)) return null;
	const miss = (p) => {
		const b = (p * bigB) / wt;
		const a = (p * bigA + bigB - b) / wt;
		return wt + a + ((1 + ratio) * b) / a - p - bigA;
	};
	let lo = wt;
	let hi = 2 * wt;
	while (miss(hi) > 0) {
		lo = hi;
		hi = 2 * hi;
	}
	while (hi - lo > 1e-15 * hi) {
		const mid = (lo + hi) / 2;
		if (miss(mid) > 0) lo = mid;
		else hi = mid;
	}
	const p = (lo + hi) / 2;
	const b = (p * bigB) / wt;
	const a = (p * bigA + bigB - b) / wt;
	return { f0: Math.sqrt(b) / TWO_PI, q: Math.sqrt(b) / a, gain: (st.gain * bigA * Math.hypot(p, w0)) / (wt * a) };
}

/** Each circuit's <circuit>_choices, (st, caps(field), gbw). */
const CHOICES = {
	*rlc_gyrator(st, caps) {
		const w0 = TWO_PI * st.f0;
		for (const c of caps('C')) {
			const x = 1 / (w0 * c);
			const r1 = Math.max(50, (x * x) / 1e6);
			const k = 2 / c;
			const b = 1 / r1 + (c * w0) / st.q;
			const disc = b * b - 4 * c * k * w0 * w0 * c * c;
			if (disc < 0) continue;
			const h = (b - Math.sqrt(disc)) / (2 * c * k);
			const g = c * (w0 / st.q - h * k);
			if (h <= 0 || g <= 0) continue;
			let p = { Ra: 1 / g, C: c, R1: r1, R2: 1 / h, Cg: c };
			const own = cx.abs(H.rlc_gyrator(p, [0, w0]));
			if (st.gain < own) {
				const alpha = st.gain / own;
				p = { Ra: 1 / g / alpha, Rb: 1 / g / (1 - alpha), C: c, R1: r1, R2: 1 / h, Cg: c };
			}
			yield p;
		}
	},
	*rlc_gic(st, caps) {
		const w0 = TWO_PI * st.f0;
		for (const c of caps('C')) {
			const x = 1 / (w0 * c);
			const r = st.q * x;
			const divider = st.gain < 1 ? { Ra: r / st.gain, Rb: r / (1 - st.gain) } : { Ra: r };
			yield { ...divider, C: c, R1: x, R2: x, R3: x, R4: x, Cg: c };
		}
	},
	*sallen_key_bandpass(st, caps) {
		const w0 = TWO_PI * st.f0;
		const k = 4 - Math.sqrt(2) / st.q;
		if (k <= 1) return;
		const own = k / (4 - k);
		for (const c of caps('C')) {
			const r = Math.sqrt(2) / (w0 * c);
			const divider = st.gain < own ? { Ra: (r * own) / st.gain, Rb: r / (1 - st.gain / own) } : { Ra: r };
			yield { ...divider, C1: c, C2: c, R2: r, R3: r, Rg: r, Rf: (k - 1) * r };
		}
	},
	*mfb_bandpass(st, caps, gbw) {
		const w0Target = TWO_PI * st.f0;
		for (const c1 of caps('C1')) {
			for (const c2 of caps('C2')) {
				const ratio = c2 / c1;
				if (!(1 / RATIO <= ratio && ratio <= RATIO)) continue;
				const t = gbw !== null ? circuitAlone(st, ratio, gbw) : st;
				if (t === null) continue;
				if (gbw !== null && gbw / ((1 + t.q ** 2 * (1 + ratio)) * t.f0) < 2) continue;
				const w0 = gbw !== null ? TWO_PI * t.f0 : w0Target;
				const g2 = (w0 / t.q) * (t.q * t.q * (c1 + c2) - t.gain * c1);
				if (g2 > 0) yield { R1: t.q / (t.gain * w0 * c1), R2: 1 / g2, R3: (t.q * (c1 + c2)) / (w0 * c1 * c2), C1: c1, C2: c2 };
			}
		}
	},
	*khn_bandpass(st, caps) {
		const w0 = TWO_PI * st.f0;
		if (2 * st.q + st.gain <= 1) return;
		const r0 = 10e3;
		const r3 = (st.q * r0) / st.gain;
		const r5 = (2 * st.q + st.gain - 1) * r0;
		for (const c of caps('C')) {
			const r = 1 / (w0 * c);
			yield { R1: r, R2: r, R3: r3, R4: r0, R5: r5, R6: r0, R7: r0, C1: c, C2: c };
		}
	},
	*tow_thomas_bandpass(st, caps) {
		const w0 = TWO_PI * st.f0;
		for (const c of caps('C')) {
			const r = 1 / (w0 * c);
			const rd = st.q * r;
			yield { R1: rd / st.gain, Ra: r, Rb: r, Rd: rd, C1: c, C2: c, r: 10e3 };
		}
	}
};

/** The library topology of each Python circuit. */
const TOPOLOGY = Object.fromEntries(Object.entries(NARROW_PY).map(([t, c]) => [c, t]));

/** The capacitor fields typed on the page for each circuit. */
const FIELDS = { mfb_bandpass: ['C1', 'C2'] };

/**
 * The file's own parts for a design, by its rule (narrowCircuits.js), from
 * the arguments of the page's download: { parts: [[circuit, parts]], short }
 * with the gain stages after the stages, or { stop } where the file stops.
 */
export function narrowOwnParts(design, args, circuit) {
	const stock = narrowStock(args);
	const gbw = circuit === 'mfb_bandpass' && Number.isFinite(args.opampGbw) && args.opampGbw > 0 ? args.opampGbw : null;
	const loss = circuit === 'rlc_gyrator';
	const q = design.q;
	const n = design.n;
	const LIMITS = { f0: 0.1 / q, q: 0.1, gain: 0.1 };
	const stageQ = q * Math.sqrt(2 ** (1 / n) - 1);
	const stageGain = design.gain ** (1 / n);
	const f0 = design.f0;
	const fields = FIELDS[circuit] ?? ['C'];
	const typed = {};
	for (const [i, caps] of Object.entries(args.capOverrides ?? {})) {
		// (each as the file writes it: 4.7e-9 for the page's 4.700000000000001e-9, shortValue)
		const own = Object.fromEntries(
			Object.entries(caps ?? {})
				.filter(([field, c]) => fields.includes(field) && Number.isFinite(c) && c > 0)
				.map(([field, c]) => [field, shortValue(c)])
		);
		if (Object.keys(own).length) typed[Number(i) + 1] = own;
	}
	const isR = (name) => name[0] === 'R' || name[0] === 'r';
	const within = (p) =>
		Object.entries(p).every(([name, v]) => {
			if (loss && name === 'R1') return true;
			return (loss ? name[0] === 'R' : isR(name)) ? R_MIN <= v && v <= R_MAX : v >= C_MIN;
		});
	const level = (p) => {
		const values = Object.entries(p).filter(([name]) => (loss ? name[0] === 'R' && name !== 'R1' : isR(name))).map(([, v]) => v);
		return values.reduce((s, v) => s + Math.log(v / 10e3) ** 2, 0) / values.length;
	};
	const neighbours = (r) => {
		let below = null;
		let above = null;
		for (const v of stock.resistors) {
			if (v <= r && (below === null || v > below)) below = v;
			if (v >= r && (above === null || v < above)) above = v;
		}
		return [...new Set([below, above].filter((v) => v !== null))].sort((a, b) => a - b);
	};
	const fit = (got, want) => Math.max(...Object.keys(want).map((key) => Math.abs(got[key] / want[key] - 1) / LIMITS[key]));
	const nearest = (r) => {
		let best = null;
		for (const v of neighbours(r)) if (best === null || Math.abs(Math.log(v / r)) < Math.abs(Math.log(best / r))) best = v;
		return best;
	};
	const ratioPair = (x) => {
		let best = null;
		for (const base of stock.resistors) {
			if (!(1e3 <= base && base <= 100e3)) continue;
			const other = nearest(x * base);
			if (!(10 < other && other < 2e6)) continue;
			const miss = Math.abs(Math.log(other / base / x));
			const lean = Math.abs(Math.log(base / 10e3));
			if (best === null || miss < best[0] - 1e-12) best = [miss, lean, base, other];
			else if (Math.abs(miss - best[0]) <= 1e-12 && lean < best[1]) best = [miss, lean, base, other];
		}
		return best ? [best[2], best[3]] : null;
	};
	const product = function* (lists) {
		const idx = lists.map(() => 0);
		if (lists.some((l) => !l.length)) return;
		for (;;) {
			yield idx.map((k, i) => lists[i][k]);
			let k = lists.length - 1;
			while (k >= 0 && ++idx[k] === lists[k].length) idx[k--] = 0;
			if (k < 0) return;
		}
	};
	const figures = FIGURES[circuit];
	const skK = (p) => {
		const g1 = 1 / p.Ra + ('Rb' in p ? 1 / p.Rb : 0);
		const w0 = Math.sqrt((g1 + 1 / p.R3) / (p.C1 * p.C2 * p.R2));
		return 1 + p.R3 * (g1 + 2 / p.R2 - (p.C1 * w0) / stageQ);
	};
	const rounded = (p) => {
		const target = figures(p);
		const sk = circuit === 'sallen_key_bandpass';
		const names = Object.keys(p).filter((name) => (sk ? name[0] === 'R' && name !== 'Rg' && name !== 'Rf' : isR(name)));
		let best = null;
		let bestFit = Infinity;
		for (const values of product(names.map((name) => neighbours(p[name])))) {
			const trial = { ...p };
			names.forEach((name, i) => (trial[name] = values[i]));
			if (sk) {
				const k = skK(trial);
				if (!(1 < k && k < 4)) continue;
				trial.Rf = (k - 1) * trial.Rg;
			}
			const miss = fit(figures(trial), target);
			if (miss < bestFit) {
				best = trial;
				bestFit = miss;
			}
		}
		if (!sk) return best;
		const pair = best ? ratioPair(skK(best) - 1) : null;
		return pair ? { ...best, Rg: pair[0], Rf: pair[1] } : null;
	};
	// (rule b as the file's design(): of the choices whose rounded fit lands within 1e-9 of the closest, the
	// nearest 10 kohm, the first of a tie as Python's min() takes it)
	const design1 = (choices) => {
		const kept = choices.filter(within);
		const tried = [];
		for (const p of kept.length ? kept : choices) {
			const parts = rounded(p);
			if (parts !== null) tried.push([p, parts]);
		}
		if (!tried.length) return null;
		const fits = tried.map(([p, parts]) => fit(figures(parts), figures(p)));
		let least = Infinity;
		for (const f of fits) least = Math.min(least, f);
		let best = null;
		let bestLevel = Infinity;
		tried.forEach(([p, parts], i) => {
			if (!(fits[i] <= least + 1e-9)) return;
			const l = level(p);
			if (best === null || l < bestLevel) {
				best = [p, parts];
				bestLevel = l;
			}
		});
		return { exact: best[0], parts: best[1], kept: kept.length };
	};
	const capsOf = (t) => (name) => (name in t ? [t[name]] : stock.capacitors);
	const out = [];
	const atOnes = [];
	for (let i = 0; i < n; i++) {
		const st = { circuit, f0, q: stageQ, gain: stageGain };
		let here = typed[i + 1] ?? {};
		let choices = [...CHOICES[circuit](st, capsOf(here), gbw)];
		if (Object.keys(here).length && !choices.length) {
			here = {};
			choices = [...CHOICES[circuit](st, capsOf(here), gbw)];
		}
		// (the gain-1 build is written only where the file has its gain stages)
		const short = shortWritten(circuit, stageGain, stageQ);
		const atOne = circuit === 'mfb_bandpass' && short && st.gain > 1 && !choices.some(within);
		if (atOne) choices = [...CHOICES[circuit]({ ...st, gain: 1 }, capsOf(here), gbw)];
		atOnes.push(atOne);
		if (!choices.length) return { stop: 'No capacitor of the stock builds the stage' };
		const d = design1(choices);
		if (!d) return { stop: 'No choice of the stock builds the stage' };
		out.push([circuit, d.parts]);
	}
	// the gain stages: what the stages' own form leaves of K at f0
	if (shortWritten(circuit, stageGain, stageQ)) {
		let short = false;
		if (circuit === 'rlc_gyrator' || circuit === 'sallen_key_bandpass') short = out.some(([, p]) => !('Rb' in p));
		if (circuit === 'rlc_gic') short = stageGain > 1;
		if (circuit === 'mfb_bandpass') short = atOnes.some(Boolean);
		let h = real(1);
		const s = [0, TWO_PI * f0];
		for (const [c, p] of out) h = cx.mul(h, H[c](p, s, gbw));
		const total = cx.abs(h);
		if (short && design.gain / total > 1 + 1e-9) {
			const want = design.gain / total;
			let best = null;
			for (let m = 1; m <= 3; m++) {
				const g = want ** (1 / m);
				let made = 1;
				const amps = [];
				for (let k = 0; k < m; k++) {
					const x = (k === m - 1 ? want / made : g) - 1;
					const pair = x > 0 ? ratioPair(x) : null;
					if (pair === null) break;
					amps.push({ R1: pair[0], R2: pair[1] });
					made *= 1 + pair[1] / pair[0];
				}
				if (amps.length < m) continue;
				const quick = g * f0 <= 0.1 * NARROW_REAL_GBW;
				const rank = quick ? [0, m] : [1, m * Math.log(Math.hypot(1, (g * f0) / NARROW_REAL_GBW))];
				if (best === null || rank[0] < best[0][0] || (rank[0] === best[0][0] && rank[1] < best[0][1])) best = [rank, amps];
				if (quick) break;
			}
			if (!best) return { stop: 'No stocked pair of resistors gives the gain stage its gain' };
			for (const p of best[1]) out.push(['amplifier', p]);
		}
	}
	return { parts: out };
}

/** Whether the file writes the gain stages for a circuit (narrowCircuits.js `short`). */
function shortWritten(circuit, stageGain, stageQ) {
	if (circuit === 'rlc_gyrator') return true;
	if (circuit === 'rlc_gic' || circuit === 'mfb_bandpass') return stageGain > 1;
	if (circuit === 'sallen_key_bandpass') return stageGain > 2 * Math.SQRT2 * stageQ - 1;
	return false;
}

/** The chain's H at f (Hz) of a set of parts, as the file's response(). */
export function narrowResponse(parts, f, gbw = null) {
	let h = real(1);
	const s = [0, TWO_PI * f];
	for (const [c, p] of parts) h = cx.mul(h, H[c](p, s, c === 'mfb_bandpass' ? gbw : null));
	return { re: h[0], im: h[1] };
}

/* ------------------------------------------------ the library's stages */

/** The library's realized stage of a set of parts: what bode.js and nodal.js read. */
export function narrowLibStage(circuit, p, gbw = null) {
	const topology = TOPOLOGY[circuit];
	const base = { topology, order: 2, components: p };
	switch (circuit) {
		case 'rlc_gyrator':
			return { ...base, buffered: true, actual: rlcGyratorActual(p) };
		case 'rlc_gic':
			return { ...base, buffered: true, actual: rlcGicActual(p) };
		case 'sallen_key_bandpass':
			return { ...base, actual: sallenKeyBpActual(p) };
		case 'mfb_bandpass':
			return { ...base, actual: Number.isFinite(gbw) && gbw > 0 ? { ...mfbBandPassEffective(p, gbw), gbw } : mfbBandPassActual(p) };
		case 'khn_bandpass':
			return { ...base, actual: khnBpActual(p) };
		case 'tow_thomas_bandpass': {
			// (towThomas.js builds Ra = Rb and C1 = C2 only: its figures for any parts)
			const wn = 1 / Math.sqrt(p.C1 * p.C2 * p.Ra * p.Rb);
			return { ...base, actual: { wn, q: wn * p.C1 * p.Rd, gain: -p.Rd / p.R1 } };
		}
		case 'amplifier':
			return { topology, order: 0, components: p, actual: { gain: 1 + p.R2 / p.R1 } };
		default:
			throw new Error(`no library stage for ${circuit}`);
	}
}

/* ------------------------------------------------------------ the designs */

const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
const LAB_R = { resistorStock: LAB_KIT.resistors, capacitorStock: null };
// a drawer of its own: a few values per decade, and capacitors of the E3 steps
const CUSTOM = {
	resistorStock: [100, 220, 470, 1e3, 1.5e3, 2.2e3, 3.3e3, 4.7e3, 6.8e3, 10e3, 15e3, 22e3, 33e3, 47e3, 68e3, 100e3, 150e3, 220e3, 470e3, 1e6],
	capacitorStock: [100e-12, 220e-12, 470e-12, 1e-9, 2.2e-9, 4.7e-9, 10e-9, 22e-9, 47e-9, 100e-9, 220e-9, 470e-9, 1e-6]
};
const STOCKS = { E24: { resistorStock: 'E24', capacitorStock: null }, E96: { resistorStock: 'E96', capacitorStock: null }, lab: KIT, labR: LAB_R, custom: CUSTOM };
const NB = { filterType: 'narrowband', f0: 10000, narrowBy: 'q', q: 5, bandwidth: null, gain: 1, stages: 1, circuitMenu: 'auto', opampGbw: OPAMP_GBW.TL082, capOverrides: {}, resistorStock: 'E24', resistorPairs: false, capacitorStock: null };
const CIRCUITS = ['rlcGyrator', 'rlcGic', 'sallenKeyBp', 'mfbBp', 'khnBp', 'towThomasBp'];
/** A capacitor as the page's field takes it, nF times 1e-9 (capOverridesInFarads). */
const nF = (x) => x * 1e-9;

/**
 * The designs every run checks: the page's default, each circuit on each
 * stock, the op-amp menu of the MFB stages, N from 1 to 6, Q or B, gains
 * under, at and over each circuit's own (the divider, the gain stages, the
 * MFB stage at gain 1), pairs and a limit on them, capacitors typed on the
 * page (one that cannot build its stage among them). opts as the other
 * families': guards [[setting, value, RegExp | null]], plot.
 */
function buildCases() {
	const out = [];
	const add = (label, args, opts = {}) => out.push([label, { ...NB, ...args }, opts]);
	const RANGE = /A narrow band-pass needs/;
	add("the page's default: 10 kHz, Q 5, K 1, E24, the MFB stages for the TL082", {}, { plot: true, guards: [['n', '7', RANGE], ['q', '0.0', RANGE], ['gain', '2.0', null], ['gbw', 'None', null]] });
	// every circuit on every stock
	for (const [sname, stock] of Object.entries(STOCKS)) for (const circuit of CIRCUITS) add(`${circuit}, ${sname}, 10 kHz, Q 10, K 2, N 2`, { ...stock, circuitMenu: circuit, q: 10, gain: 2, stages: 2 });
	for (const circuit of CIRCUITS) add(`${circuit}, lab kit, 40 kHz, B 8 kHz, K 0.5`, { ...KIT, circuitMenu: circuit, f0: 40000, narrowBy: 'b', q: null, bandwidth: 8000, gain: 0.5 }, circuit === 'rlcGic' ? { plot: true, guards: [['bandwidth', '-1.0', RANGE], ['n', '3', null]] } : {});
	// the op-amp menu of the MFB stages: TL082, LM741, ideal, another figure
	for (const [name, gbw] of [['TL082', OPAMP_GBW.TL082], ['LM741', OPAMP_GBW.LM741], ['ideal', null], ['20 MHz', 20e6]]) {
		add(`mfbBp for ${name}, E24, 20 kHz, Q 8, K 4, N 2`, { circuitMenu: 'mfbBp', opampGbw: gbw, f0: 20000, q: 8, gain: 4, stages: 2 });
		add(`mfbBp for ${name}, lab kit, 10 kHz, Q 5`, { ...KIT, circuitMenu: 'mfbBp', opampGbw: gbw });
	}
	// N from 1 to 6
	for (const stages of [1, 2, 3, 4, 5, 6]) add(`auto, E24, N ${stages}, Q 15 at 8 kHz, K 1.5`, { f0: 8000, q: 15, gain: 1.5, stages });
	// gains past what the form gives: the MFB stage at gain 1, the gain stages split for the TL082
	for (const gain of [100, 400]) add(`mfbBp for the TL082, E24, 2 kHz, Q 2, K ${gain}: past the gain ceiling`, { circuitMenu: 'mfbBp', f0: 2000, q: 2, gain });
	add('mfbBp, ideal, E24, 1 kHz, Q 0.8, K 50: past the ceiling', { circuitMenu: 'mfbBp', opampGbw: null, f0: 1000, q: 0.8, gain: 50 });
	add('rlcGic, E24, 60 kHz, Q 5, K 80: gain stages split for the TL082', { circuitMenu: 'rlcGic', f0: 60000, gain: 80 });
	// pairs, and a limit on them
	for (const circuit of CIRCUITS) {
		add(`${circuit}, lab kit with pairs, 4 kHz, Q 6`, { ...KIT, resistorPairs: true, circuitMenu: circuit, f0: 4000, q: 6 });
		add(`${circuit}, lab kit, pairs up to 1, 4 kHz, Q 6, N 2`, { ...KIT, resistorPairs: true, resistorPairLimit: 1, circuitMenu: circuit, f0: 4000, q: 6, stages: 2 });
	}
	add('auto, lab kit with pairs, 10 kHz, Q 5', { ...KIT, resistorPairs: true });
	add('auto, custom list with pairs up to 2, 3 kHz, Q 8, K 3', { ...CUSTOM, resistorPairs: true, resistorPairLimit: 2, f0: 3000, q: 8, gain: 3 });
	// capacitors typed on the page (farads, as the page converts its nF)
	for (const circuit of ['rlcGyrator', 'rlcGic', 'sallenKeyBp', 'khnBp', 'towThomasBp']) {
		add(`${circuit}, E24, 22 nF typed on stage 1`, { circuitMenu: circuit, capOverrides: { 0: { C: nF(22) } } });
		add(`${circuit}, lab kit, N 2, 10 nF typed on stage 2`, { ...KIT, circuitMenu: circuit, stages: 2, capOverrides: { 1: { C: nF(10) } } });
		add(`${circuit}, E24, N 3, 4.7 nF on stage 1 and 1 nF on stage 3`, { circuitMenu: circuit, stages: 3, f0: 6000, q: 9, capOverrides: { 0: { C: nF(4.7) }, 2: { C: nF(1) } } });
	}
	add('mfbBp for the TL082, E24, C1 and C2 typed', { circuitMenu: 'mfbBp', capOverrides: { 0: { C1: nF(10), C2: nF(10) } } });
	add('mfbBp for the TL082, E24, C1 typed alone', { circuitMenu: 'mfbBp', capOverrides: { 0: { C1: nF(4.7) } } });
	add('mfbBp, ideal, lab kit, N 2, C2 typed on stage 2', { ...KIT, circuitMenu: 'mfbBp', opampGbw: null, stages: 2, capOverrides: { 1: { C2: nF(1) } } });
	add('mfbBp for the LM741, E24, K 3, C1 and C2 typed', { circuitMenu: 'mfbBp', opampGbw: OPAMP_GBW.LM741, gain: 3, capOverrides: { 0: { C1: nF(2.2), C2: nF(2.2) } } });
	add('rlcGyrator, E24, Q 20, 1 pF typed: too small to build it', { circuitMenu: 'rlcGyrator', q: 20, capOverrides: { 0: { C: 1e-12 } } });
	add('sallenKeyBp, E24, Q 12, 100 pF typed', { circuitMenu: 'sallenKeyBp', q: 12, capOverrides: { 0: { C: nF(0.1) } } });
	// (capacitors typed on every stage: the SETTINGS line of them stays within the width, one stage a line)
	add('rlcGic, E24, N 3, 4.7 nF typed on each stage', { circuitMenu: 'rlcGic', stages: 3, capOverrides: { 0: { C: nF(4.7) }, 1: { C: nF(4.7) }, 2: { C: nF(4.7) } } });
	// (a stage no choice of the stock builds by the file's rule, which the page builds from its full grid: the
	// file goes on without parts of its own and checks the page's)
	add('rlcGyrator, lab kit with pairs, 63.7 Hz, Q 76.2, K 0.232, N 2: no stock choice builds it', { ...KIT, resistorPairs: true, circuitMenu: 'rlcGyrator', f0: 63.7, q: 76.2, gain: 0.232, stages: 2 });
	return out;
}

/**
 * The sweep: each circuit, and the rule's pick, over f0, Q or B, K and N on
 * every stock, the ends of the range (20 Hz to 150 kHz, Q from 0.7 to 40)
 * among them. check-python.mjs runs one in four, all of them with
 * CHECK_PYTHON_SWEEP=narrow.
 */
function buildSweep() {
	const out = [];
	const add = (label, args) => out.push([label, { ...NB, ...args }, {}]);
	const specs = [
		['1 kHz, Q 5, K 1', { f0: 1000, q: 5, gain: 1 }],
		['40 kHz, B 8 kHz, K 0.5', { f0: 40000, narrowBy: 'b', q: null, bandwidth: 8000, gain: 0.5 }],
		['300 Hz, Q 3, K 6, N 3', { f0: 300, q: 3, gain: 6, stages: 3 }]
	];
	for (const [sname, stock] of Object.entries(STOCKS)) for (const circuit of CIRCUITS) for (const [what, spec] of specs) add(`${circuit}, ${sname}, ${what}`, { ...stock, circuitMenu: circuit, ...spec });
	for (const f0 of [60, 400, 3000, 20000, 90000]) for (const q of [1.5, 4, 12]) for (const [gain, stages] of [[1, 1], [8, 2], [0.3, 3]]) add(`auto, E24, ${f0} Hz, Q ${q}, K ${gain}, N ${stages}`, { f0, q, gain, stages });
	for (const f0 of [200, 2000, 15000]) for (const q of [2, 8]) for (const [gain, stages] of [[1, 1], [20, 2], [3, 4]]) add(`auto, lab kit, ${f0} Hz, Q ${q}, K ${gain}, N ${stages}`, { ...KIT, f0, q, gain, stages });
	for (const [name, gbw] of [['TL082', OPAMP_GBW.TL082], ['LM741', OPAMP_GBW.LM741], ['ideal', null], ['20 MHz', 20e6]]) {
		for (const [f0, q, gain, stages] of [[1000, 5, 1, 1], [5000, 20, 1, 3], [30000, 3, 30, 1]]) add(`mfbBp for ${name}, E24, ${f0} Hz, Q ${q}, K ${gain}, N ${stages}`, { circuitMenu: 'mfbBp', opampGbw: gbw, f0, q, gain, stages });
	}
	for (const stages of [1, 2, 3, 4, 5, 6]) {
		add(`khnBp, E96, N ${stages}, B 500 Hz at 5 kHz`, { resistorStock: 'E96', circuitMenu: 'khnBp', f0: 5000, narrowBy: 'b', q: null, bandwidth: 500, stages });
		add(`rlcGic, lab resistors, N ${stages}, Q 6 at 2 kHz, K 3`, { ...LAB_R, circuitMenu: 'rlcGic', f0: 2000, q: 6, gain: 3, stages });
	}
	for (const circuit of CIRCUITS) for (const gain of [0.2, 1, 6, 60]) add(`${circuit}, E24, 3 kHz, Q 4, K ${gain}`, { circuitMenu: circuit, f0: 3000, q: 4, gain });
	for (const circuit of CIRCUITS) add(`${circuit}, lab kit, pairs up to 3, 25 kHz, Q 3, K 2`, { ...KIT, resistorPairs: true, resistorPairLimit: 3, circuitMenu: circuit, f0: 25000, q: 3, gain: 2 });
	for (const circuit of CIRCUITS) for (const [f0, q] of [[20, 1], [150000, 2], [1500, 40], [700, 0.7]]) add(`${circuit}, E96, ${f0} Hz, Q ${q}`, { resistorStock: 'E96', circuitMenu: circuit, f0, q });
	return out;
}

const narrowCases = buildCases();
const narrowSweep = buildSweep();

// (the narrow circuits' rule is narrowOwnParts above, not rule.mjs's: no circuits here. Every run:
// narrowCases and one in four of the sweep; CHECK_PYTHON_SWEEP=narrow the rest of it too)
export default {
	name: 'narrow band-pass',
	key: 'narrow',
	circuits: {},
	cases: [...narrowCases, ...narrowSweep.filter((_, i) => i % 4 === 0).map(([label, args, opts]) => [`sweep: ${label}`, args, opts])],
	sweep: narrowSweep.filter((_, i) => i % 4 !== 0).map(([label, args, opts]) => [`sweep: ${label}`, args, opts])
};
