/**
 * Designing the page's filter by hand with the table method: the
 * polynomial tables (Butterworth, Chebyshev with 0.5 dB of ripple, orders 1
 * to 6), denormalization by s*, one stage per factor, then the parts of a
 * Sallen-Key, multiple feedback or first-order circuit for each stage and a
 * gain stage for what the stage numerators leave over. The panel built on
 * it (BuildPanel.svelte) lets the reader type each number and checks it.
 *
 * Every function here returns plain data: the solutions of the steps, the
 * checkers with their tolerances, the texts (blocks of prose and TeX), the
 * Python snippets filled with the reader's numbers, the stage formulas for
 * any parts (unequal ones included), the realized stages bode.js, spice.js
 * and CircuitDiagram take, the report rows and the Q sensitivities.
 *
 * Four classical slips are corrected where they arise, each as the right
 * formula and one line of caution: the Butterworth order with its ratio
 * the right way up, the Sallen-Key Q (the s coefficient divided by the s^2
 * one), the Butterworth table's -3 dB normalization when Amax is not 3 dB
 * (eps^(-1/n) and its mirror images), and the band k, valid only once the
 * band spec is made geometrically symmetric.
 *
 * Units: frequencies in rad/s once the spec is read (the edges come in Hz),
 * resistors in ohms, capacitors in farads.
 */

import { butterworthOrder, chebyshevOrder } from './order';
import { designFirstOrderLowPass } from './firstOrder';
import { designMfbLowPass } from './mfb';
import { designMfbHighPass } from './mfbHighPass';
import { designMfbBandPass, mfbBandPassActual } from './mfbBandPass';
import { designSallenKeyLowPass } from './sallenKey';
import { designSallenKeyHighPass } from './sallenKeyHighPass';
import { mfbSensitivity } from './sensitivity';
import { magnitudePhaseAt, sweep } from './bode';
import { SERIES, capacitorCandidates, seriesValues, smallCapPenalty } from './eseries';

const T = String.raw;
const TWO_PI = 2 * Math.PI;

/** The ripple the Chebyshev table is written for, in dB. */
export const TABLE_RIPPLE_DB = 0.5;
/** The tables stop at this order. */
export const TABLE_MAX_ORDER = 6;
/** How close a typed number must come to be right: 0.5 %. */
export const TOLERANCE = 0.005;
/** A stage built from typed parts is on target within this (stock rounding), close within the next. */
export const STAGE_OK = 0.025;
export const STAGE_CLOSE = 0.1;

export const RESPONSE_LABEL = { butterworth: 'Butterworth', chebyshev: 'Chebyshev 0.5 dB' };
const TYPE_WORD = { lowpass: 'low-pass', highpass: 'high-pass', bandpass: 'band-pass', bandstop: 'band-stop' };

/* ------------------------------------------------------------- tables */

const SQRT2 = Math.SQRT2;
const SQRT5 = Math.sqrt(5);
const SQRT3 = Math.sqrt(3);

/**
 * Butterworth, normalized at -3 dB (w = 1 is the -3 dB point): the
 * classical table, exact. A factor is { a, b } for s^2 + a s + b or { p }
 * for s + p.
 */
export const BUTTERWORTH_TABLE = [
	{ n: 1, factors: [{ p: 1 }], tex: 's + 1' },
	{ n: 2, factors: [{ a: SQRT2, b: 1 }], tex: T`s^2 + \sqrt{2}\,s + 1` },
	{ n: 3, factors: [{ a: 1, b: 1 }, { p: 1 }], tex: T`\left(s^2 + s + 1\right)(s + 1)` },
	{
		n: 4,
		factors: [
			{ a: Math.sqrt(2 - SQRT2), b: 1 },
			{ a: Math.sqrt(2 + SQRT2), b: 1 }
		],
		tex: T`\left(s^2 + \sqrt{2 - \sqrt{2}}\,s + 1\right)\left(s^2 + \sqrt{2 + \sqrt{2}}\,s + 1\right)`
	},
	{
		n: 5,
		factors: [{ a: 2 / (1 + SQRT5), b: 1 }, { a: (1 + SQRT5) / 2, b: 1 }, { p: 1 }],
		tex: T`\left(s^2 + \tfrac{2}{1 + \sqrt{5}}\,s + 1\right)\left(s^2 + \tfrac{1 + \sqrt{5}}{2}\,s + 1\right)(s + 1)`
	},
	{
		n: 6,
		factors: [
			{ a: Math.sqrt(2 - SQRT3), b: 1 },
			{ a: SQRT2, b: 1 },
			{ a: Math.sqrt(2 + SQRT3), b: 1 }
		],
		tex: T`\left(s^2 + \sqrt{2 - \sqrt{3}}\,s + 1\right)\left(s^2 + \sqrt{2}\,s + 1\right)\left(s^2 + \sqrt{2 + \sqrt{3}}\,s + 1\right)`
	}
];

/** Chebyshev with 0.5 dB of ripple, normalized at the ripple edge (w = 1 is where the loss leaves the ripple band), as printed. */
export const CHEBYSHEV_TABLE = [
	{ n: 1, factors: [{ p: 2.862775 }] },
	{ n: 2, factors: [{ a: 1.425625, b: 1.516203 }] },
	{ n: 3, factors: [{ a: 0.626456, b: 1.142448 }, { p: 0.626456 }] },
	{
		n: 4,
		factors: [
			{ a: 0.350706, b: 1.063519 },
			{ a: 0.84668, b: 0.356412 }
		]
	},
	{ n: 5, factors: [{ a: 0.223926, b: 1.035784 }, { a: 0.586245, b: 0.476767 }, { p: 0.36232 }] },
	{
		n: 6,
		factors: [
			{ a: 0.1553, b: 1.023023 },
			{ a: 0.424288, b: 0.59001 },
			{ a: 0.579588, b: 0.156997 }
		]
	}
].map((row) => ({ ...row, tex: row.factors.map((f) => factorTex(f, 6, row.factors.length > 1)).join('') }));

/** One table factor in TeX, its coefficients with `places` decimals; `wrap` puts it in brackets. */
function factorTex(f, places, wrap) {
	const body = f.p !== undefined ? `s + ${f.p.toFixed(places)}` : `s^2 + ${f.a.toFixed(places)}\\,s + ${f.b.toFixed(places)}`;
	return wrap ? T`\left(${body}\right)` : body;
}

export function tableFor(response) {
	return response === 'chebyshev' ? CHEBYSHEV_TABLE : BUTTERWORTH_TABLE;
}

/* ------------------------------------------------------------ numbers */

const PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

/**
 * A comma before exactly three digits (10,000, 8,875, 1,234,567) reads two
 * ways, a thousands separator or a decimal comma: such a value is not read.
 */
export function ambiguousComma(text) {
	return /^[+-]?[1-9]\d{0,2}(,\d{3})+(?![\d,.eE])/.test(String(text ?? '').replace(/\s+/g, ''));
}

/**
 * A typed value: plain or scientific (1.5e-9, 6.283e5), with an SI prefix
 * (1.5n, 10k, 2.2u, 100p, 1M or 1meg), the prefix as the decimal point
 * (4k7, 1n5), a decimal comma (4,7k, 0,125), and a trailing unit (F, Hz,
 * ohm, the ohm sign, rad/s) ignored. NaN when it cannot be read, and for a
 * comma that could be a thousands separator (ambiguousComma).
 */
export function parseValue(text) {
	if (typeof text === 'number') return text;
	let t = String(text ?? '')
		.replace(/\s+/g, '')
		.replace(/(rad\/s|ohms?|[ΩΩ]|Hz)$/i, '');
	if (!t) return NaN;
	if (ambiguousComma(t)) return NaN;
	if (!t.includes('.') && /^[+-]?\d*,\d+/.test(t)) t = t.replace(',', '.');
	// a farad sign after a prefix or a digit (2.2uF, 100pF, 10F)
	t = t.replace(/([0-9pnuµμmkKMG])[fF]$/, '$1');
	const split = /^([+-]?\d+)(meg|MEG|Meg|[pnuµμmkKMG])(\d+)$/.exec(t);
	if (split) return Number(`${split[1]}.${split[3]}`) * (split[2].toLowerCase() === 'meg' ? 1e6 : PREFIX[split[2]]);
	const m = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(meg|MEG|Meg|[pnuµμmkKMG])?$/.exec(t);
	if (!m) return NaN;
	const mult = !m[2] ? 1 : m[2].toLowerCase() === 'meg' ? 1e6 : PREFIX[m[2]];
	return Number(m[1]) * mult;
}

/** x to `digits` significant figures in plain text: 0.2857, 6.283e5, 1.5e-9. */
export function fmt(x, digits = 4) {
	if (!Number.isFinite(x)) return '-';
	if (x === 0) return '0';
	const a = Math.abs(x);
	if (a >= 1e-3 && a < 1e4) return String(Number(x.toPrecision(digits)));
	const [m, e] = x.toExponential(digits - 1).split('e');
	return `${Number(m)}e${Number(e)}`;
}

/** The same in TeX, a power of ten written out past the plain range. */
export function texNum(x, digits = 4) {
	if (!Number.isFinite(x)) return T`\text{-}`;
	if (x === 0) return '0';
	const a = Math.abs(x);
	if (a >= 1e-3 && a < 1e4) return String(Number(x.toPrecision(digits)));
	const [m, e] = x.toExponential(digits - 1).split('e');
	return T`${Number(m)} \times 10^{${Number(e)}}`;
}

/**
 * A number for a Python snippet: 15 significant figures, so that the
 * floating-point noise of a product (4.7 times 1e-9 is 4.700000000000001e-9)
 * does not show.
 */
const py = (x) => String(Number(Number(x).toPrecision(15)));

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
/** An exponent written as superscript characters, for prose: s⁴, 10⁻⁹. */
export function sup(n) {
	return String(n)
		.split('')
		.map((c) => SUPERSCRIPT[c] ?? c)
		.join('');
}

/** A power in prose: s for 1, s⁴ for 4. */
const powerText = (base, n) => (n === 1 ? base : `${base}${sup(n)}`);

/** A number for prose: 0.2857, or 6.3 × 10⁸ past the plain range. */
export function proseNum(x, digits = 4) {
	if (!Number.isFinite(x)) return '-';
	const a = Math.abs(x);
	if (x === 0 || (a >= 1e-3 && a < 1e4)) return String(Number(x.toPrecision(digits)));
	const [m, e] = x.toExponential(digits - 1).split('e');
	return `${Number(m)} × 10${sup(Number(e))}`;
}

const SI = [
	[1e9, 'G'],
	[1e6, 'M'],
	[1e3, 'k'],
	[1, ''],
	[1e-3, 'm'],
	[1e-6, 'u'],
	[1e-9, 'n'],
	[1e-12, 'p']
];

/** A part's value with an SI prefix and `digits` significant figures: 11.25 kΩ, 10 nF. */
export function partText(value, unit, digits = 4) {
	if (!Number.isFinite(value)) return '-';
	const rounded = Number(value.toPrecision(digits));
	const entry = SI.find(([f]) => Math.abs(rounded) >= f * 0.9999) ?? SI[SI.length - 1];
	return `${Number((rounded / entry[0]).toPrecision(digits))} ${entry[1]}${unit}`;
}

const isResistor = (name) => /^[Rr]/.test(name);
/** A part by its name: R... in ohms, everything else in farads. */
export function partValueText(name, value, digits = 4) {
	return partText(value, isResistor(name) ? 'Ω' : 'F', digits);
}

const rel = (x, want) => (x - want) / Math.abs(want);
const close = (x, want, tol = TOLERANCE) => Math.abs(rel(x, want)) <= tol;

/* -------------------------------------------------------------- checks */

/**
 * Judges one typed number against the right one. `mistakes` lists the
 * values a common slip gives, each with what to say about it; `also` the
 * values that count as right too (f0 in Hz for wn in rad/s, or the value
 * the reader's own accepted numbers of an earlier step give). A wrong value
 * only learns its direction and a rough size (within 5 %, or a power of ten
 * off), never a figure the answer could be worked back from. Returns
 * { state: 'empty' | 'unread' | 'ok' | 'bad', value, message }.
 */
export function judge(typed, want, { tol = TOLERANCE, mistakes = [], integer = false, also = [] } = {}) {
	if (typed === undefined || typed === null || String(typed).trim() === '') return { state: 'empty', value: NaN, message: 'Type a value first.' };
	if (ambiguousComma(typed)) return { state: 'unread', value: NaN, message: 'A comma before three digits reads two ways: write 10000 or 10k without it, and a decimal with a point.' };
	const x = parseValue(typed);
	if (!Number.isFinite(x)) return { state: 'unread', value: NaN, message: 'This value cannot be read: write it as 0.25, 6.28e5, 10k, 4k7 or 1.5n.' };
	if (integer ? x === want : close(x, want, tol)) return { state: 'ok', value: x, message: '' };
	if (also.some((a) => Number.isFinite(a) && (integer ? x === a : close(x, a, tol)))) return { state: 'ok', value: x, message: '' };
	for (const m of mistakes) {
		if (Number.isFinite(m.value) && (integer ? x === m.value : close(x, m.value, tol))) return { state: 'bad', value: x, message: m.text };
	}
	if (integer) return { state: 'bad', value: x, message: 'Not this one.' };
	if (x !== 0 && Math.sign(x) !== Math.sign(want)) return { state: 'bad', value: x, message: 'Not yet: the sign is wrong.' };
	const ratio = x / want;
	const dir = ratio > 1 ? 'too high' : 'too low';
	const message =
		Math.abs(ratio - 1) <= 0.05 ? `Close, but ${dir}: check the arithmetic and the rounding.` : ratio > 0.1 && ratio < 10 ? `Not yet: ${dir}.` : `Not yet: far ${dir}. Check the units and the powers of ten.`;
	return { state: 'bad', value: x, message };
}

const HZ_SLIP = (w) => ({ value: w / TWO_PI, text: 'That is the frequency in Hz: in rad/s, ω = 2πf.' });

/** Several judgements in one: ok when every one is. */
export function allOk(results) {
	return results.length > 0 && results.every((r) => r.state === 'ok');
}

/* ---------------------------------------------------------------- spec */

/**
 * The spec as this method takes it, from the page's numbers. A band filter
 * may hold a limit per edge on the page: the method takes one Amax, the
 * smaller, and one Amin, the larger. `valid` is false when the edges are
 * out of order or Amin is not above Amax.
 */
export function handSpec({ filterType, fp, fs, fl, fh, fsl, fsh, amaxDb, aminDb, amaxAtFl, amaxAtFh, aminAtFsl, aminAtFsh }) {
	const band = filterType === 'bandpass' || filterType === 'bandstop';
	const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : NaN);
	if (!band) {
		const s = { filterType, band, fp: num(fp), fs: num(fs), amaxDb: num(amaxDb), aminDb: num(aminDb), amaxSplit: false, aminSplit: false };
		const edges = filterType === 'highpass' ? s.fs > 0 && s.fp > s.fs : s.fp > 0 && s.fs > s.fp;
		return { ...s, valid: edges && s.amaxDb > 0 && s.aminDb > s.amaxDb };
	}
	const amaxLow = num(amaxAtFl ?? amaxDb);
	const amaxHigh = num(amaxAtFh ?? amaxDb);
	const aminLow = num(aminAtFsl ?? aminDb);
	const aminHigh = num(aminAtFsh ?? aminDb);
	const s = {
		filterType,
		band,
		fl: num(fl),
		fh: num(fh),
		fsl: num(fsl),
		fsh: num(fsh),
		amaxDb: Math.min(amaxLow, amaxHigh),
		aminDb: Math.max(aminLow, aminHigh),
		amaxLow,
		amaxHigh,
		aminLow,
		aminHigh,
		amaxSplit: amaxLow !== amaxHigh,
		aminSplit: aminLow !== aminHigh
	};
	const edges = filterType === 'bandpass' ? s.fsl > 0 && s.fl > s.fsl && s.fh > s.fl && s.fsh > s.fh : s.fl > 0 && s.fsl > s.fl && s.fsh > s.fsl && s.fh > s.fsh;
	return { ...s, valid: edges && s.amaxDb > 0 && Math.min(aminLow, aminHigh) > Math.max(amaxLow, amaxHigh) };
}

/** The key the reader's progress is kept under in this browser: the spec, so another spec starts afresh. */
export function storageKey(spec) {
	const nums = spec.band ? [spec.fl, spec.fh, spec.fsl, spec.fsh, spec.amaxLow, spec.amaxHigh, spec.aminLow, spec.aminHigh] : [spec.fp, spec.fs, spec.amaxDb, spec.aminDb];
	return `rbt56.filter.byHand.v1|${spec.filterType}|${nums.join('|')}`;
}

/**
 * A band spec made geometrically symmetric (fsl fsh = fl fh) by moving one
 * stopband edge towards the passband, so the stopband only gets stricter:
 * band-pass, fsl up when fsl fsh < fl fh, else fsh down; band-stop, fsl
 * down when fsl fsh > fl fh, else fsh up. `moved` names the edge, `from`
 * is where it was.
 */
export function symmetricEdges({ filterType, fl, fh, fsl, fsh }) {
	const target = fl * fh;
	const product = fsl * fsh;
	if (Math.abs(product / target - 1) < 1e-9) return { product, target, moved: null, from: null, fsl, fsh };
	const lowEdge = filterType === 'bandpass' ? product < target : product > target;
	return lowEdge ? { product, target, moved: 'fsl', from: fsl, fsl: target / fsh, fsh } : { product, target, moved: 'fsh', from: fsh, fsl, fsh: target / fsl };
}

/* --------------------------------------------------------------- steps */

/**
 * Step 1: the numbers the method starts from. The Chebyshev table holds
 * 0.5 dB of ripple only: blocked when the page asks for less.
 */
export function specStep(spec, response) {
	const cheb = response === 'chebyshev';
	const rippleNote = !cheb ? null : spec.amaxDb < TABLE_RIPPLE_DB - 1e-9 ? 'tooStrict' : spec.amaxDb > TABLE_RIPPLE_DB + 1e-9 ? 'stricter' : 'equal';
	const base = { filterType: spec.filterType, response, amaxDb: cheb ? TABLE_RIPPLE_DB : spec.amaxDb, aminDb: spec.aminDb, rippleNote, blocked: rippleNote === 'tooStrict' };
	if (spec.filterType === 'lowpass') return { ...base, wmax: TWO_PI * spec.fp, wmin: TWO_PI * spec.fs, k: spec.fp / spec.fs };
	if (spec.filterType === 'highpass') return { ...base, wmax: TWO_PI * spec.fp, wmin: TWO_PI * spec.fs, k: spec.fs / spec.fp };
	const sym = symmetricEdges(spec);
	const k = spec.filterType === 'bandpass' ? (spec.fh - spec.fl) / (sym.fsh - sym.fsl) : (sym.fsh - sym.fsl) / (spec.fh - spec.fl);
	// k from the raw edges, the slip the symmetric fix avoids
	const rawK = spec.filterType === 'bandpass' ? (spec.fh - spec.fl) / (spec.fsh - spec.fsl) : (spec.fsh - spec.fsl) / (spec.fh - spec.fl);
	return { ...base, sym, f0: Math.sqrt(spec.fl * spec.fh), wc: TWO_PI * Math.sqrt(spec.fl * spec.fh), B: TWO_PI * (spec.fh - spec.fl), k, rawK };
}

/** The order formula of a response, unrounded. */
export function orderValue(response, amaxDb, aminDb, k) {
	return response === 'chebyshev' ? chebyshevOrder(amaxDb, aminDb, k) : butterworthOrder(amaxDb, aminDb, k);
}

/** Step 2: the order, unrounded and rounded up; past the tables when n > 6. */
export function orderStep(s1) {
	const value = orderValue(s1.response, s1.amaxDb, s1.aminDb, s1.k);
	const n = Math.max(1, Math.ceil(value));
	return { value, n, beyond: !(n <= TABLE_MAX_ORDER) };
}

/** Step 3: the table's row and the numerator that gives H_n(0) = 1 (the product of the constant terms). */
export function tableStep(response, n) {
	const row = tableFor(response)[n - 1];
	const numerator = row.factors.reduce((acc, f) => acc * (f.p ?? f.b), 1);
	return { row, factors: row.factors, numerator };
}

export function rippleFactor(amaxDb) {
	return Math.sqrt(10 ** (amaxDb / 10) - 1);
}

function csqrt(re, im) {
	const m = Math.hypot(re, im);
	if (re >= 0) {
		const r = Math.sqrt((m + re) / 2);
		return { re: r, im: r > 0 ? im / (2 * r) : 0 };
	}
	const i = (im < 0 ? -1 : 1) * Math.sqrt((m - re) / 2);
	return { re: im / (2 * i), im: i };
}

/**
 * The two roots of s^2 + c1 s + c0 = 0 (c1 complex, c0 real), each turned
 * into the real factor it makes with its conjugate: s^2 - 2 Re(r) s + |r|^2.
 * The larger root first from the formula, the other from the product, so
 * no digits cancel. Lower wn first.
 */
function splitComplex(c1re, c1im, c0) {
	const d = csqrt(c1re * c1re - c1im * c1im - 4 * c0, 2 * c1re * c1im);
	const sign = c1re * d.re + c1im * d.im >= 0 ? 1 : -1;
	const q = { re: -(c1re + sign * d.re) / 2, im: -(c1im + sign * d.im) / 2 };
	const qq = q.re * q.re + q.im * q.im;
	const other = { re: (c0 * q.re) / qq, im: (-c0 * q.im) / qq };
	return [q, other].map((r) => ({ kind: 'quadratic', a: -2 * r.re, b: r.re * r.re + r.im * r.im })).sort((x, y) => x.b - y.b);
}

/**
 * Step 4: H_d(s) = H_n(s*). For a Butterworth response the table's w = 1
 * is the -3 dB point, so the frequency (or the bandwidth) it lands on is
 * scaled by eps^(-1/n) (low-pass, band-pass) or eps^(1/n) (high-pass,
 * band-stop), eps = sqrt(10^(Amax/10) - 1): then exactly Amax is lost at
 * the passband edge(s). Chebyshev's table is normalized at its ripple edge
 * and needs no such scaling. Returns the denormalization frequency `wd`
 * (low-pass, high-pass) or the scaled bandwidth `Bd` with the centre `wc`
 * (band types), the factors in the order the table gives them (each band
 * factor's pair lower first), and the numerator: coef s^power, times
 * (s^2 + wc^2)^n for a band-stop.
 */
export function denormStep(s1, s2, s3) {
	const n = s2.n;
	const eps = rippleFactor(s1.amaxDb);
	const butter = s1.response === 'butterworth';
	const down = butter ? eps ** (-1 / n) : 1;
	const up = butter ? eps ** (1 / n) : 1;
	const t = s1.filterType;
	const out = { eps, n, scaled: butter };
	if (t === 'lowpass' || t === 'highpass') {
		const wd = s1.wmax * (t === 'lowpass' ? down : up);
		return { ...out, factors: denormFactors(t, s3.factors, wd, null), wd, scale: t === 'lowpass' ? down : up, numerator: t === 'lowpass' ? { coef: s3.numerator * wd ** n, power: 0 } : { coef: 1, power: n } };
	}
	const wc = s1.wc;
	const Bd = s1.B * (t === 'bandpass' ? down : up);
	return { ...out, factors: denormFactors(t, s3.factors, Bd, wc), wc, Bd, scale: t === 'bandpass' ? down : up, numerator: t === 'bandpass' ? { coef: s3.numerator * Bd ** n, power: n } : { coef: 1, power: 0, notch: wc } };
}

/**
 * The table's factors denormalized at `w`: the frequency s* = s/w or w/s
 * takes (low-pass, high-pass), or the bandwidth of s* (band types, centre
 * wc). The order is always the same for a given table row, so the factors
 * from a slightly different w line up with the exact ones.
 */
function denormFactors(t, factors, w, wc) {
	const out = [];
	for (const [i, f] of factors.entries()) {
		if (t === 'lowpass' || t === 'highpass') {
			if (f.p !== undefined) out.push({ kind: 'real', p: t === 'lowpass' ? f.p * w : w / f.p, from: i });
			else out.push(t === 'lowpass' ? { kind: 'quadratic', a: f.a * w, b: f.b * w * w, from: i } : { kind: 'quadratic', a: (f.a * w) / f.b, b: (w * w) / f.b, from: i });
			continue;
		}
		if (f.p !== undefined) {
			out.push({ kind: 'quadratic', a: t === 'bandpass' ? f.p * w : w / f.p, b: wc * wc, from: i });
			continue;
		}
		// the upper pole P of s^2 + a s + b, then the roots of s^2 - P B s + wc^2
		// (band-pass) or s^2 - (B / P) s + wc^2 (band-stop)
		const im = Math.sqrt(Math.max(0, 4 * f.b - f.a * f.a)) / 2;
		const c1 = t === 'bandpass' ? { re: (f.a / 2) * w, im: -im * w } : { re: (w * f.a) / (2 * f.b), im: (w * im) / f.b };
		for (const q of splitComplex(c1.re, c1.im, wc * wc)) out.push({ ...q, from: i });
	}
	return out;
}

/** The numerator coefficient a stage of this kind carries in the standard form. */
function stageNumerator(stage) {
	if (stage.order === 1) return stage.kind === 'lowpass' ? stage.p : 1;
	if (stage.kind === 'lowpass') return stage.wn * stage.wn;
	if (stage.kind === 'bandpass') return stage.wn / stage.q;
	return 1;
}

/** Powers of s a stage's numerator brings: what a band-pass needs n of. */
function stagePower(stage) {
	if (stage.kind === 'lowpass' || stage.kind === 'notch') return 0;
	if (stage.kind === 'bandpass') return 1;
	return stage.order;
}

/** The stage kinds a band-pass quadratic may be, and a low-pass, high-pass or band-stop has (fixed). */
export const BAND_KINDS = ['bandpass', 'lowpass', 'highpass'];

/**
 * Step 5: one stage per factor in the standard form, and the gain K that
 * the product of the stage numerators leaves over (the rule of three on
 * the numerators). A band-pass quadratic is a band-pass stage unless
 * `kinds[i]` says low-pass or high-pass; the powers of s must then add up
 * to n (kindsOk).
 */
export function stagesStep(s1, s4, kinds = []) {
	const t = s1.filterType;
	const stages = s4.factors.map((f, i) => {
		if (f.kind === 'real') return { index: i, order: 1, kind: t, p: f.p, factor: f };
		const wn = Math.sqrt(f.b);
		const kind = t === 'bandstop' ? 'notch' : t === 'bandpass' ? (BAND_KINDS.includes(kinds[i]) ? kinds[i] : 'bandpass') : t;
		return { index: i, order: 2, kind, wn, q: wn / f.a, factor: f, ...(kind === 'notch' ? { wz: s4.wc } : {}) };
	});
	for (const st of stages) st.numerator = stageNumerator(st);
	const product = stages.reduce((acc, st) => acc * st.numerator, 1);
	const power = stages.reduce((acc, st) => acc + stagePower(st), 0);
	const need = s4.numerator.power;
	return { stages, product, power, need, kindsOk: power === need, K: s4.numerator.coef / product };
}

/** Every step's solution for a spec and a response; later steps are left out when an earlier one stops the walk. */
export function solveAll(spec, response, { kinds = [] } = {}) {
	const s1 = specStep(spec, response);
	const s2 = orderStep(s1);
	if (s1.blocked || s2.beyond) return { spec, response, s1, s2, stop: s1.blocked ? 'ripple' : 'order' };
	const s3 = tableStep(response, s2.n);
	const s4 = denormStep(s1, s2, s3);
	const s5 = stagesStep(s1, s4, kinds);
	return { spec, response, s1, s2, s3, s4, s5, stop: null };
}

/* ------------------------------------------------------- step checkers */

/** Step 1: k, and for a band the moved edge, wc and B. `v` holds the typed strings. */
export function checkSpec(ctx, v) {
	const { s1, spec } = ctx;
	const out = {};
	const kSlips = [{ value: 1 / s1.k, text: 'That is upside down: k compares the narrower span with the wider one, so it is below 1.' }];
	if (spec.band) {
		if (Math.abs(s1.rawK / s1.k - 1) > TOLERANCE) kSlips.push({ value: s1.rawK, text: 'That k comes from the edges as given. Make the spec symmetric first, then take k.' });
		if (s1.sym.moved) {
			const want = s1.sym[s1.sym.moved];
			const other = s1.sym.moved === 'fsl' ? s1.sym.target / spec.fsl : s1.sym.target / spec.fsh;
			out.edge = judge(v.edge, want, { mistakes: [{ value: other, text: `That moves the other edge away from the passband, which loosens the spec. Move ${s1.sym.moved} instead.` }] });
		}
		out.wc = judge(v.wc, s1.wc, { mistakes: [HZ_SLIP(s1.wc), { value: Math.PI * (spec.fl + spec.fh), text: 'That is the arithmetic mean. The centre of a band is the geometric mean, the square root of the product.' }] });
		out.B = judge(v.B, s1.B, { mistakes: [HZ_SLIP(s1.B)] });
	}
	out.k = judge(v.k, s1.k, { mistakes: kSlips });
	return out;
}

/**
 * A value typed in an earlier step, when its check passes: the reader's
 * own number, which the next step may carry instead of the exact one.
 */
function accepted(typed, want, opts) {
	const r = judge(typed, want, opts);
	return r.state === 'ok' ? r.value : NaN;
}

/**
 * Step 2: the unrounded order and n. `prev.v1` holds what step 1 took: the
 * value the formula gives with the reader's own accepted k counts as right
 * too (k near 1 makes the order very sensitive to its last digits).
 */
export function checkOrder(ctx, v, prev = {}) {
	const { s1, s2, spec } = ctx;
	const slips = [];
	// for a Chebyshev a negative n cannot come up: acosh never is
	if (s1.response === 'butterworth') slips.push({ value: -s2.value, text: 'Written with the ratio upside down, this gives a negative n: the Amin term goes on top, and 1/k, above 1, in the denominator.' });
	if (s1.response === 'chebyshev' && Math.abs(spec.amaxDb - TABLE_RIPPLE_DB) > 1e-9) {
		slips.push({ value: orderValue('chebyshev', spec.amaxDb, s1.aminDb, s1.k), text: `That uses Amax = ${spec.amaxDb} dB. The table is for 0.5 dB of ripple, so Amax = 0.5 dB here.` });
	}
	const amplitude = (A) => 10 ** (A / 20) - 1;
	const r20 = amplitude(s1.aminDb) / amplitude(s1.amaxDb);
	slips.push({
		value: s1.response === 'chebyshev' ? Math.acosh(Math.sqrt(r20)) / Math.acosh(1 / s1.k) : Math.log10(r20) / (2 * Math.log10(1 / s1.k)),
		text: 'The losses go in as power ratios: 10^(A/10), not 10^(A/20).'
	});
	const n = s2.n;
	const nTyped = parseValue(v.n);
	let nResult = judge(v.n, n, { integer: true });
	if (nResult.state === 'bad' && Number.isFinite(nTyped)) {
		if (!Number.isInteger(nTyped)) nResult = { ...nResult, message: 'The order is a whole number: round the value above to one.' };
		else if (nTyped < n) nResult = { ...nResult, message: `Round up, never down: order ${nTyped} falls short of Amin at the stopband edge.` };
		else nResult = { ...nResult, message: `Order ${nTyped} meets the spec too, but it is not the smallest that does, and the next steps are built on the smallest.` };
	}
	const kTyped = accepted(prev.v1?.k, s1.k);
	const carried = Number.isFinite(kTyped) && kTyped > 0 && kTyped < 1 ? [orderValue(s1.response, s1.amaxDb, s1.aminDb, kTyped)] : [];
	return { value: judge(v.value, s2.value, { mistakes: slips, also: carried }), n: nResult };
}

/** Step 3: the row picked (the panel then shows Hn(s) with its numerator). */
export function checkTable(ctx, row) {
	const { s2 } = ctx;
	const rowResult =
		row === null || row === undefined
			? { state: 'empty', message: 'Pick a row of the table first.' }
			: Number(row) === s2.n
				? { state: 'ok', message: '' }
				: { state: 'bad', message: `That row is order ${row}; the order from step 2 is ${s2.n}.` };
	return { row: rowResult };
}

/**
 * Matches typed factors to the solution's in any order: each typed row
 * goes to the closest solution factor of its kind not taken yet (in log
 * distance over its coefficients), then is judged against it. `rows` is
 * [{ a, b } | { p }] of typed strings (a row is first-order when it has a
 * p key, typed or not). `alt`, when given, is the same list of factors from
 * the reader's own accepted numbers of an earlier step: a coefficient that
 * matches its factor there counts as right too.
 */
export function matchFactors(solution, rows, alt = null) {
	const quads = solution.map((f, i) => ({ f, i })).filter((x) => x.f.kind === 'quadratic');
	const reals = solution.map((f, i) => ({ f, i })).filter((x) => x.f.kind === 'real');
	const taken = new Set();
	return rows.map((row) => {
		const isReal = 'p' in row;
		const pool = (isReal ? reals : quads).filter((x) => !taken.has(x.i));
		const typed = isReal ? [parseValue(row.p)] : [parseValue(row.a), parseValue(row.b)];
		if (!typed.every(Number.isFinite) || pool.length === 0) {
			// a blank or unreadable coefficient says so; a readable one waits for the other, or is one factor too many
			const one = (text) => {
				if (String(text ?? '').trim() === '' || !Number.isFinite(parseValue(text))) return judge(text, 1);
				return { state: 'bad', value: parseValue(text), message: pool.length === 0 ? 'One factor too many of this kind.' : 'Type the other coefficient too.' };
			};
			const result = isReal ? { p: one(row.p) } : { a: one(row.a), b: one(row.b) };
			return { ...result, state: Object.values(result).every((r) => r.state === 'empty') ? 'empty' : 'bad' };
		}
		const dist = (f) => (isReal ? Math.abs(Math.log(Math.abs(typed[0] / f.p))) : Math.abs(Math.log(Math.abs(typed[0] / f.a))) + Math.abs(Math.log(Math.abs(typed[1] / f.b))));
		const best = pool.reduce((m, x) => (dist(x.f) < dist(m.f) ? x : m));
		const other = alt?.[best.i];
		const also = (key) => (other && Number.isFinite(other[key]) ? [other[key]] : []);
		const result = isReal ? { p: judge(row.p, best.f.p, { also: also('p') }) } : { a: judge(row.a, best.f.a, { also: also('a') }), b: judge(row.b, best.f.b, { also: also('b') }) };
		const ok = Object.values(result).every((r) => r.state === 'ok');
		if (ok) taken.add(best.i);
		return { ...result, state: ok ? 'ok' : 'bad', match: best.i };
	});
}

/**
 * Step 4: the denormalization frequency (or bandwidth), the numerator
 * coefficient and the factors. `prev.v1` holds what step 1 took. The
 * numbers the reader's own accepted values give count as right too: Bd
 * from the B typed in step 1, and the numerator and the factors from the
 * ωc or Bd typed here (the numerator holds it to the power n, so a small
 * rounding grows n times).
 */
export function checkDenorm(ctx, v, rows, prev = {}) {
	const { s1, s2, s4, s3 } = ctx;
	const t = s1.filterType;
	const n = s2.n;
	const out = {};
	if (t === 'lowpass' || t === 'highpass') {
		const slips = [HZ_SLIP(s4.wd)];
		if (s4.scaled && Math.abs(s4.scale - 1) > TOLERANCE) {
			slips.push({ value: s1.wmax, text: 'That is ωmax itself. This Butterworth table loses 3 dB at ω = 1, not Amax: scale ωmax as the correction above says.' });
			slips.push({ value: s1.wmax / s4.scale, text: `The exponent goes the other way for a ${TYPE_WORD[t]}: ${t === 'lowpass' ? 'ε^(-1/n)' : 'ε^(1/n)'}.` });
		}
		out.w = judge(v.w, s4.wd, { mistakes: slips });
		const numSlips = t === 'lowpass' && Math.abs(s3.numerator - 1) > 1e-6 ? [{ value: s4.wd ** n, text: 'Keep the table numerator Kn in front of ωcⁿ.' }] : [];
		const wTyped = out.w.state === 'ok' ? out.w.value : NaN;
		out.num = judge(v.num, s4.numerator.coef, { mistakes: numSlips, also: t === 'lowpass' ? [s3.numerator * wTyped ** n] : [] });
		out.factors = matchFactors(s4.factors, rows, Number.isFinite(wTyped) ? denormFactors(t, s3.factors, wTyped, null) : null);
		return out;
	}
	const slips = [HZ_SLIP(s4.Bd)];
	if (s4.scaled && Math.abs(s4.scale - 1) > TOLERANCE) {
		slips.push({ value: s1.B, text: 'That is B itself. This Butterworth table loses 3 dB at ω = 1, not Amax: scale B as the correction above says.' });
		slips.push({ value: s1.B / s4.scale, text: `The exponent goes the other way for a ${TYPE_WORD[t]}: ${t === 'bandpass' ? 'ε^(-1/n)' : 'ε^(1/n)'}.` });
	}
	const bTyped = accepted(prev.v1?.B, s1.B, { mistakes: [HZ_SLIP(s1.B)] });
	out.w = judge(v.w, s4.Bd, { mistakes: slips, also: [bTyped * s4.scale] });
	const numSlips = t === 'bandpass' && Math.abs(s3.numerator - 1) > 1e-6 ? [{ value: s4.Bd ** n, text: 'Keep the table numerator Kn in front of Bdⁿ.' }] : [];
	const wTyped = out.w.state === 'ok' ? out.w.value : NaN;
	out.num = judge(v.num, s4.numerator.coef, { mistakes: numSlips, also: t === 'bandpass' ? [s3.numerator * wTyped ** n] : [] });
	out.factors = matchFactors(s4.factors, rows, Number.isFinite(wTyped) ? denormFactors(t, s3.factors, wTyped, s4.wc) : null);
	return out;
}

/** The typed rows step 4 expects, one per factor of the solution, in its shape. */
export function factorRows(s4, v = {}) {
	return s4.factors.map((f, i) => (f.kind === 'real' ? { p: v[`f${i}.p`] } : { a: v[`f${i}.a`], b: v[`f${i}.b`] }));
}

/**
 * Step 5: wn and Q (or the corner of a first-order stage) of each stage,
 * and K. `prev` holds what steps 1 and 4 took ({ v1, v4 }): the values the
 * reader's own accepted factors give count as right too, and so does the K
 * their accepted numerator and stage numbers give (K divides by a product
 * of n numbers, so small roundings add up).
 */
export function checkStages(ctx, v, prev = {}) {
	const { s4, s5 } = ctx;
	// the factor of step 4 the reader typed for each stage, when it was accepted
	const typed = [];
	let numTyped = s4.numerator.coef;
	if (prev.v4) {
		const d = checkDenorm(ctx, prev.v4, factorRows(s4, prev.v4), { v1: prev.v1 });
		if (d.num.state === 'ok') numTyped = d.num.value;
		d.factors.forEach((r) => {
			if (r.state === 'ok') typed[r.match] = r.p ? { p: r.p.value } : { a: r.a.value, b: r.b.value };
		});
	}
	const stages = s5.stages.map((st, i) => {
		const own = typed[i];
		// in rad/s, or as a frequency in Hz
		if (st.order === 1) {
			const p = own?.p;
			return { p: judge(v[`${i}.p`], st.p, { also: [st.p / TWO_PI, p, p / TWO_PI], mistakes: [{ value: 1 / st.p, text: 'That is the time constant 1/p. The corner is p itself, in rad/s.' }] }) };
		}
		const wn = own ? Math.sqrt(own.b) : NaN;
		return {
			wn: judge(v[`${i}.wn`], st.wn, { also: [st.wn / TWO_PI, wn, wn / TWO_PI], mistakes: [{ value: st.wn * st.wn, text: 'That is ωn², the constant term itself: ωn is its square root.' }, { value: st.wn * TWO_PI, text: 'That is ωn times 2π: ωn is already in rad/s, f0 = ωn/2π.' }] }),
			q: judge(v[`${i}.q`], st.q, { also: own ? [wn / own.a] : [], mistakes: [{ value: 1 / st.q, text: 'That is upside down: Q = ωn divided by the s coefficient.' }, { value: st.factor.a, text: 'That is the s coefficient itself, ωn/Q.' }] })
		};
	});
	if (!s5.kindsOk) return { stages, K: { state: 'bad', message: 'Fix the stage kinds first.' } };
	// the stage numerators from the reader's own numbers: the factors of step 4,
	// or the ωn, Q and p typed here (ωn and p in rad/s or in Hz)
	const fromFactors = s5.stages.map((st, i) => {
		const own = typed[i];
		if (!own) return st.numerator;
		if (st.order === 1) return st.kind === 'lowpass' ? own.p : 1;
		return st.kind === 'lowpass' ? own.b : st.kind === 'bandpass' ? own.a : 1;
	});
	const radians = (x, ...rads) => (rads.some((r) => close(x, r)) ? x : x * TWO_PI);
	const fromHere = s5.stages.map((st, i) => {
		const r = stages[i];
		if (st.order === 1) return st.kind === 'lowpass' && r.p.state === 'ok' ? radians(r.p.value, st.p, typed[i]?.p) : st.numerator;
		if (r.wn.state !== 'ok' || (st.kind === 'bandpass' && r.q.state !== 'ok')) return st.numerator;
		const wn = radians(r.wn.value, st.wn, typed[i] ? Math.sqrt(typed[i].b) : NaN);
		return st.kind === 'lowpass' ? wn * wn : st.kind === 'bandpass' ? wn / r.q.value : 1;
	});
	const product = (list) => list.reduce((acc, x) => acc * x, 1);
	const K = judge(v.K, s5.K, { also: [numTyped / product(fromFactors), numTyped / product(fromHere)], mistakes: [{ value: 1 / s5.K, text: 'That is upside down: K = (numerator of Hd) / (product of the stage numerators).' }] });
	return { stages, K };
}

/* ---------------------------------------------------------- topologies */

/**
 * The circuits a stage can be built with, by its kind and order. A
 * band-pass stage is a multiple feedback band-pass; a notch has none here.
 */
export function topologyChoices(stage) {
	if (stage.order === 1) return stage.kind === 'highpass' ? ['firstOrderHp'] : ['firstOrder'];
	if (stage.kind === 'lowpass') return ['sallenKey', 'mfb'];
	if (stage.kind === 'highpass') return ['sallenKeyHp', 'mfbHp'];
	if (stage.kind === 'bandpass') return ['mfbBp'];
	return [];
}

/**
 * The circuits, each with the part names of the automatic tool's own
 * topology (so a realized stage reuses its Bode, drawings and LTspice
 * export), its transfer function in its own form, and `actual`: what any
 * parts give, unequal ones included (checked against the nodal solution
 * of the netlist by scripts/check-hand.mjs).
 */
export const TOPOLOGIES = {
	sallenKey: {
		label: 'Sallen-Key low-pass (unity gain)',
		short: 'Sallen-Key',
		order: 2,
		caps: ['Ctop', 'Cbottom'],
		resistors: ['R1', 'R2'],
		actual: ({ R1, R2, Ctop, Cbottom }) => {
			const a = R1 * R2 * Ctop * Cbottom;
			const b = (R1 + R2) * Cbottom;
			return { wn: 1 / Math.sqrt(a), q: Math.sqrt(a) / b, gain: 1 };
		}
	},
	mfb: {
		label: 'Multiple feedback low-pass',
		short: 'multiple feedback',
		order: 2,
		caps: ['C1', 'C2'],
		resistors: ['R1', 'R2', 'R3'],
		actual: ({ R1, R2, R3, C1, C2 }) => {
			const a = (1 / C1) * (1 / R1 + 1 / R2 + 1 / R3);
			const b = 1 / (R2 * R3 * C1 * C2);
			return { wn: Math.sqrt(b), q: Math.sqrt(b) / a, gain: -R3 / R1 };
		}
	},
	sallenKeyHp: {
		label: 'Sallen-Key high-pass (unity gain)',
		short: 'Sallen-Key',
		order: 2,
		caps: ['C1', 'C2'],
		resistors: ['Rtop', 'Rbottom'],
		actual: ({ Rtop, Rbottom, C1, C2 }) => {
			const a = (C1 + C2) / (C1 * C2 * Rbottom);
			const b = 1 / (C1 * C2 * Rbottom * Rtop);
			return { wn: Math.sqrt(b), q: Math.sqrt(b) / a, gain: 1 };
		}
	},
	mfbHp: {
		label: 'Multiple feedback high-pass',
		short: 'multiple feedback',
		order: 2,
		caps: ['C1', 'C2', 'C3'],
		resistors: ['R1', 'R2'],
		actual: ({ R1, R2, C1, C2, C3 }) => {
			const a = (C1 + C2 + C3) / (R2 * C2 * C3);
			const b = 1 / (R1 * R2 * C2 * C3);
			return { wn: Math.sqrt(b), q: Math.sqrt(b) / a, gain: -C1 / C3 };
		}
	},
	mfbBp: {
		label: 'Multiple feedback band-pass',
		short: 'multiple feedback band-pass',
		order: 2,
		caps: ['C1', 'C2'],
		resistors: ['R1', 'R2', 'R3'],
		actual: (c) => mfbBandPassActual(c)
	},
	firstOrder: {
		label: 'First-order RC low-pass, then a follower',
		short: 'RC',
		order: 1,
		caps: ['C'],
		resistors: ['R'],
		actual: ({ R, C }) => ({ tau: R * C })
	},
	firstOrderHp: {
		label: 'First-order CR high-pass, then a follower',
		short: 'CR',
		order: 1,
		caps: ['C'],
		resistors: ['R'],
		actual: ({ R, C }) => ({ tau: R * C })
	},
	gainInv: {
		label: 'Inverting amplifier',
		short: 'inverting amplifier',
		order: 0,
		caps: [],
		resistors: ['R1', 'R2'],
		actual: ({ R1, R2 }) => ({ gain: -R2 / R1 })
	},
	gainDivider: {
		label: 'Divider and follower',
		short: 'divider and follower',
		order: 0,
		caps: [],
		resistors: ['R1', 'R2'],
		actual: ({ R1, R2 }) => ({ gain: R1 / (R1 + R2) })
	},
	gainNonInv: {
		label: 'Non-inverting amplifier',
		short: 'non-inverting amplifier',
		order: 0,
		caps: [],
		resistors: ['R1', 'R2'],
		actual: ({ R1, R2 }) => ({ gain: 1 + R2 / R1 })
	}
};

/** The parts a topology needs, capacitors first. */
export function partNames(topology) {
	const t = TOPOLOGIES[topology];
	return [...t.caps, ...t.resistors];
}

/** Typed part strings read into numbers; null unless every part is a positive number. */
export function readParts(topology, typed = {}) {
	const out = {};
	for (const name of partNames(topology)) {
		const x = parseValue(typed[name]);
		if (!(Number.isFinite(x) && x > 0)) return null;
		out[name] = x;
	}
	return out;
}

/**
 * The exact resistors for the chosen capacitors: what the equations give,
 * before any rounding to stock. `typed` (the reader's parts, may be
 * partial) picks between two exact answers where there are two: the
 * Sallen-Key with equal or with unequal resistors, the multiple feedback
 * low-pass's two roots. Returns { ok: true, parts, notes } or
 * { ok: false, reason, need, have, text }.
 */
export function solveParts(topology, stage, caps, typed = {}) {
	const has = (names) => names.every((nm) => Number.isFinite(caps[nm]) && caps[nm] > 0);
	const t = TOPOLOGIES[topology];
	if (!has(t.caps)) return { ok: false, reason: 'caps', text: 'Pick the capacitors first.' };
	const typedR = (nm) => parseValue(typed[nm]);
	const { wn, q } = stage;
	const notes = [];
	switch (topology) {
		case 'sallenKey': {
			const { Ctop, Cbottom } = caps;
			const ratio = Ctop / Cbottom;
			const need = 4 * q * q;
			const R = 1 / (wn * Math.sqrt(Ctop * Cbottom));
			const r1 = typedR('R1');
			const r2 = typedR('R2');
			const both = Number.isFinite(r1) && Number.isFinite(r2);
			const typedUnequal = both && Math.abs(Math.log(r1 / r2)) > 0.02;
			// above 4Q² two different resistors reach Q exactly: the answer unless
			// the reader typed equal ones, or the ratio is 4Q² already
			const nearExact = Math.abs(ratio / need - 1) <= TOLERANCE;
			if (ratio >= need * (1 - 1e-9) && (typedUnequal || (!both && !nearExact))) {
				const S = 1 / (wn * q * Cbottom);
				const P = 1 / (wn * wn * Ctop * Cbottom);
				const big = (S + Math.sqrt(Math.max(0, S * S - 4 * P))) / 2;
				const small = P / big;
				return { ok: true, variant: 'unequal', parts: r1 >= r2 ? { R1: big, R2: small } : { R1: small, R2: big }, notes };
			}
			if (!nearExact) {
				notes.push(`Ctop/Cbottom = ${fmt(ratio)} where 4Q² = ${fmt(need)}: with R1 = R2 the Q follows the ratio, Q = ½√(Ctop/Cbottom) = ${fmt(0.5 * Math.sqrt(ratio))} for a target of ${fmt(q)}.${ratio > need ? ' With this ratio above 4Q², two different resistors reach the Q exactly.' : ''}`);
			}
			return { ok: true, variant: 'equal', parts: { R1: R, R2: R }, notes };
		}
		case 'mfb': {
			const { C1, C2 } = caps;
			const a = wn / q;
			const b = wn * wn;
			const disc = (a * C1) ** 2 - 8 * b * C1 * C2;
			if (disc < 0) return { ok: false, reason: 'ratio', need: 8 * q * q, have: C1 / C2, text: `C1/C2 = ${fmt(C1 / C2)}, under 8Q² = ${fmt(8 * q * q)}: no real resistors give this Q with a gain of 1. Take a larger C1 or a smaller C2.` };
			const roots = [1, -1].map((sg) => {
				const x = (a * C1 + sg * Math.sqrt(disc)) / 4;
				return { R1: 1 / x, R2: 1 / (a * C1 - 2 * x), R3: 1 / x };
			});
			const r1 = typedR('R1');
			const pick = Number.isFinite(r1) ? (x) => Math.abs(Math.log(x.R1 / r1)) : (x) => Math.log(x.R1 / 1e4) ** 2 + Math.log(x.R2 / 1e4) ** 2;
			const [best, other] = pick(roots[0]) <= pick(roots[1]) ? roots : [roots[1], roots[0]];
			return { ok: true, parts: best, other, notes };
		}
		case 'sallenKeyHp': {
			const { C1, C2 } = caps;
			const Rbottom = (q * (C1 + C2)) / (wn * C1 * C2);
			return { ok: true, parts: { Rtop: 1 / (wn * wn * C1 * C2 * Rbottom), Rbottom }, notes };
		}
		case 'mfbHp': {
			const { C1, C2, C3 } = caps;
			const R2 = (q * (C1 + C2 + C3)) / (wn * C2 * C3);
			if (Math.abs(C1 / C3 - 1) > TOLERANCE) notes.push(`C1 and C3 differ: the passband gain is -C1/C3 = ${fmt(-C1 / C3)}, not -1.`);
			return { ok: true, parts: { R1: 1 / (wn * wn * R2 * C2 * C3), R2 }, notes };
		}
		case 'mfbBp': {
			const { C1, C2 } = caps;
			const g2 = (wn / q) * (q * q * (C1 + C2) - C1);
			if (!(g2 > 0)) return { ok: false, reason: 'gain', need: 1 / (q * q) - 1, have: C2 / C1, text: `At Q = ${fmt(q)} a gain of 1 needs C2/C1 above 1/Q² - 1 = ${fmt(1 / (q * q) - 1)}; here C2/C1 = ${fmt(C2 / C1)}. Take a larger C2.` };
			return { ok: true, parts: { R1: q / (wn * C1), R2: 1 / g2, R3: (q * (C1 + C2)) / (wn * C1 * C2) }, notes };
		}
		case 'firstOrder':
		case 'firstOrderHp':
			return { ok: true, parts: { R: 1 / (stage.p * caps.C) }, notes };
		default:
			return { ok: false, reason: 'topology', text: 'No circuit for this stage.' };
	}
}

/**
 * The gain stage for |K|: R2 from the R1 chosen. Inverting, -R2/R1 = -|K|;
 * divider and follower, R1/(R1 + R2) = K (K under 1); non-inverting,
 * 1 + R2/R1 = K (K over 1).
 */
export function solveGain(circuit, K, R1) {
	const k = Math.abs(K);
	if (!(Number.isFinite(R1) && R1 > 0)) return { ok: false, text: 'Pick R1 first.' };
	if (circuit === 'gainInv') return { ok: true, parts: { R1, R2: k * R1 } };
	if (circuit === 'gainDivider') return k < 1 ? { ok: true, parts: { R1, R2: R1 * (1 / k - 1) } } : { ok: false, text: 'A divider only lowers the level: its gain stays under 1.' };
	if (circuit === 'gainNonInv') return k > 1 ? { ok: true, parts: { R1, R2: (k - 1) * R1 } } : { ok: false, text: 'A non-inverting amplifier gives at least 1.' };
	return { ok: false, text: 'Pick a circuit.' };
}

/** The gain circuit that suits K: none for 1, a divider under 1, a non-inverting amplifier over 1. */
export function gainCircuitFor(K) {
	const k = Math.abs(K);
	if (Math.abs(k - 1) < 1e-9) return null;
	return k < 1 ? 'gainDivider' : 'gainNonInv';
}

/** What a stage's parts give, and how far that is from its target: errors as fractions. */
export function stageResult(topology, stage, parts) {
	const actual = TOPOLOGIES[topology].actual(parts);
	if (stage.order === 1) {
		const err = rel(1 / actual.tau, stage.p);
		return { actual, errors: { corner: err }, worst: Math.abs(err) };
	}
	const errors = { wn: rel(actual.wn, stage.wn), q: rel(actual.q, stage.q), gain: rel(Math.abs(actual.gain), 1) };
	return { actual, errors, worst: Math.max(...Object.values(errors).map(Math.abs)) };
}

/** The gain stage's result against |K|. */
export function gainResult(circuit, K, parts) {
	const actual = TOPOLOGIES[circuit].actual(parts);
	const err = rel(Math.abs(actual.gain), Math.abs(K));
	return { actual, errors: { gain: err }, worst: Math.abs(err) };
}

/** 'ok' within stock rounding, 'close' a little further, else 'bad'. */
export function grade(worst) {
	return worst <= STAGE_OK ? 'ok' : worst <= STAGE_CLOSE ? 'close' : 'bad';
}

/**
 * A stage built from the reader's parts, in the shape the automatic tool's
 * realized stages have: bode.js, spice.js (netlist and .asc) and
 * CircuitDiagram take it as it is. `theoretical` holds the exact solution.
 */
export function realizeStage(topology, parts, theoretical = null) {
	const t = TOPOLOGIES[topology];
	return { topology, order: t.order, components: { ...parts }, actual: t.actual(parts), theoretical, hand: true };
}

/**
 * Capacitors to start from when none are typed: the automatic search's own
 * pick for this stage with the page's stock (componentOpts), or null.
 */
export function suggestCaps(topology, stage, componentOpts = {}) {
	const opts = { resistorSeries: componentOpts.resistorSeries ?? 'E24', capacitors: componentOpts.capacitors ?? null, pairs: false };
	if (topology === 'sallenKey') {
		const pair = sallenKeyCaps(stage, opts.capacitors);
		if (pair) return pair;
	}
	let d = null;
	try {
		if (topology === 'sallenKey') d = designSallenKeyLowPass(stage.wn, stage.q, opts);
		else if (topology === 'mfb') d = designMfbLowPass(stage.wn, stage.q, opts);
		else if (topology === 'sallenKeyHp') d = designSallenKeyHighPass(stage.wn, stage.q, opts);
		else if (topology === 'mfbHp') d = designMfbHighPass(stage.wn, stage.q, opts);
		else if (topology === 'mfbBp') d = designMfbBandPass(stage.wn, stage.q, { ...opts, gain: 1 });
		else if (topology === 'firstOrder' || topology === 'firstOrderHp') d = designFirstOrderLowPass(1 / stage.p, opts);
	} catch {
		d = null;
	}
	if (!d) return null;
	return Object.fromEntries(TOPOLOGIES[topology].caps.map((nm) => [nm, d.components[nm]]));
}

/**
 * A Sallen-Key pair from the stock with Ctop/Cbottom at or just above 4Q²,
 * so that two resistors reach the stage's Q exactly (with equal ones the Q
 * would follow the stock's ratio): Cbottom from the capacitors a search
 * tries, Ctop the smallest stock value at or above 4Q² Cbottom, and of
 * those the pair whose two resistors sit nearest 10 kΩ. Null when no pair
 * keeps both resistors between 200 Ω and 2 MΩ.
 */
function sallenKeyCaps(stage, capacitors) {
	const need = 4 * stage.q * stage.q;
	const tops = (Array.isArray(capacitors) && capacitors.length ? capacitorCandidates(capacitors) : seriesValues(SERIES.E12, -12, -6)).slice().sort((x, y) => x - y);
	let best = null;
	for (const Cbottom of capacitorCandidates(capacitors)) {
		const Ctop = tops.find((c) => c >= need * Cbottom * (1 - 1e-9));
		if (!Ctop) continue;
		const S = 1 / (stage.wn * stage.q * Cbottom);
		const P = 1 / (stage.wn * stage.wn * Ctop * Cbottom);
		const big = (S + Math.sqrt(Math.max(0, S * S - 4 * P))) / 2;
		const small = P / big;
		if (!(small > 200 && big < 2e6)) continue;
		const score = Math.log(big / 1e4) ** 2 + Math.log(small / 1e4) ** 2 + smallCapPenalty(Cbottom, Ctop);
		if (!best || score < best.score) best = { Ctop, Cbottom, score };
	}
	return best ? { Ctop: best.Ctop, Cbottom: best.Cbottom } : null;
}

/* ---------------------------------------------------------- the filter */

/** The edges, the Bode range and the limits the reader's filter is judged on: the page's own spec. */
export function filterFrame(spec) {
	const t = spec.filterType;
	if (t === 'lowpass' || t === 'highpass') {
		const lo = Math.min(spec.fp, spec.fs);
		const hi = Math.max(spec.fp, spec.fs);
		return { fMin: lo / 10, fMax: hi * 10, pass: [spec.fp], stop: [spec.fs] };
	}
	return { fMin: Math.min(spec.fsl, spec.fl) / 10, fMax: Math.max(spec.fsh, spec.fh) * 10, pass: [spec.fl, spec.fh], stop: [spec.fsl, spec.fsh] };
}

/** A passband edge may lose this much over its limit (the page's own slack), a stopband edge fall this much short. */
export const PASS_SLACK_DB = 0.05;
export const STOP_SLACK_DB = 0.005;

/**
 * Where the top of the passband is looked for: 401 points across each
 * passband range, and the far end (DC, or far above) where a passband runs
 * on, which a sweep only comes near.
 */
export function peakFrequencies(spec) {
	const out = [];
	for (const [a, b] of peakRanges(spec)) for (let i = 0; i <= 400; i++) out.push(a * (b / a) ** (i / 400));
	return [...out, ...peakEnds(spec)];
}

/** The passband ranges the top is looked for in, in Hz. */
function peakRanges(spec) {
	const t = spec.filterType;
	return t === 'lowpass' ? [[spec.fp / 100, spec.fp]] : t === 'highpass' ? [[spec.fp, spec.fp * 100]] : t === 'bandpass' ? [[spec.fl, spec.fh]] : [[spec.fl / 100, spec.fl], [spec.fh, spec.fh * 100]];
}

/** The far ends of a passband that runs on: near DC, far above. */
function peakEnds(spec) {
	const t = spec.filterType;
	const out = [];
	if (t === 'lowpass' || t === 'bandstop') out.push((t === 'lowpass' ? spec.fp : spec.fl) * 1e-6);
	if (t === 'highpass' || t === 'bandstop') out.push((t === 'highpass' ? spec.fp : spec.fh) * 1e6);
	return out;
}

/**
 * How the reader's filter does against the page's spec, measured from the
 * top of its passband as the page measures (an even Chebyshev ripples
 * above 0 dB, and a gain stage may leave the whole level off 0 dB): the
 * loss at each edge and whether it holds.
 */
export function verdict(spec, stages) {
	const gainDb = (f) => magnitudePhaseAt(stages, f).db;
	const t = spec.filterType;
	const peak = Math.max(...peakFrequencies(spec).map(gainDb));
	const edge = (name, f, limit, kind) => {
		const loss = peak - gainDb(f);
		return { name, f, loss, limit, kind, ok: kind === 'pass' ? loss <= limit + PASS_SLACK_DB : loss >= limit - STOP_SLACK_DB };
	};
	const edges =
		t === 'lowpass' || t === 'highpass'
			? [edge('fp', spec.fp, spec.amaxDb, 'pass'), edge('fs', spec.fs, spec.aminDb, 'stop')]
			: [edge('fsl', spec.fsl, spec.aminLow, 'stop'), edge('fl', spec.fl, spec.amaxLow, 'pass'), edge('fh', spec.fh, spec.amaxHigh, 'pass'), edge('fsh', spec.fsh, spec.aminHigh, 'stop')];
	return { peakDb: peak, edges, ok: edges.every((e) => e.ok) };
}

/**
 * The exact design of step 5 as stages bode.js reads (ideal parts): each
 * stage in its standard form with its numerator coefficient, then K.
 */
export function idealStages(ctx) {
	const out = ctx.s5.stages.map((st) => {
		if (st.order === 1) return { topology: st.kind === 'highpass' ? 'idealHp' : 'ideal', order: 1, actual: { tau: 1 / st.p } };
		if (st.kind === 'notch') return { topology: 'ideal', order: 2, actual: { wn: st.wn, q: st.q, wz: st.wz, gain: 1 } };
		const topology = st.kind === 'highpass' ? 'idealHp' : st.kind === 'bandpass' ? 'idealBp' : 'ideal';
		return { topology, order: 2, actual: { wn: st.wn, q: st.q, gain: 1 } };
	});
	if (Math.abs(ctx.s5.K - 1) > 1e-12) out.push({ topology: 'gain', order: 0, actual: { gain: ctx.s5.K } });
	return out;
}

/** What spice.js's generateSchematic takes for the reader's stages: the page's spec, one chain, the op-amp picked. */
export function schematicOptions(spec, ctx, stages, opamp = 'ideal') {
	const bp = spec.filterType === 'bandpass';
	return {
		opamp,
		realizedStages: stages,
		filterType: spec.filterType,
		response: ctx.response,
		amaxDb: ctx.s1.amaxDb,
		aminDb: spec.aminDb,
		aminDbLow: spec.aminLow,
		aminDbHigh: spec.aminHigh,
		fp: spec.fp,
		fs: spec.fs,
		fl: spec.fl,
		fh: spec.fh,
		fsl: spec.fsl,
		fsh: spec.fsh,
		topology: 'by hand',
		structure: 'cascade',
		// a band-pass by the table method is one prototype turned into band
		// stages: the file measures it at f0 too
		method: bp ? 'transformed' : undefined,
		f0: bp ? ctx.s1.f0 : undefined,
		B: bp ? spec.fh - spec.fl : undefined
	};
}

/** The Bode points of the reader's filter, over the same span the Python snippet plots. */
export function bodePoints(spec, stages) {
	const { fMin, fMax } = filterFrame(spec);
	return sweep(stages, fMin, fMax, 240);
}

/* -------------------------------------------------------------- report */

/**
 * One row per part: the exact value for the chosen capacitors, the part
 * typed, and the relative error in %. `entries` is
 * [{ label, topology, parts, theoretical }].
 */
export function reportRows(entries) {
	const rows = [];
	for (const e of entries) {
		for (const name of partNames(e.topology)) {
			const actual = e.parts[name];
			const theory = e.theoretical?.[name];
			const known = Number.isFinite(theory) && theory > 0;
			rows.push({ part: `${e.label} ${name}`, name, theoretical: known ? theory : null, actual, error: known ? rel(actual, theory) * 100 : null });
		}
	}
	return rows;
}

/** x with `places` decimals, never a signed zero: -0.001 shows as 0.00. */
export function fixed(x, places = 2) {
	const s = x.toFixed(places);
	return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

const REPORT_HEAD = ['Component', 'Theoretical value', 'Actual value', 'Relative error (%)'];
const reportCells = (r) => [r.part, r.theoretical === null ? '-' : partValueText(r.name, r.theoretical), partValueText(r.name, r.actual), r.error === null ? '-' : fixed(r.error, 2)];

/** The report's column heads, and a row as the four cells the table and its copies show. */
export const REPORT_COLUMNS = REPORT_HEAD;
export function reportRowCells(r) {
	return reportCells(r);
}

/** The report as tab-separated text: it pastes into a word processor or a spreadsheet as a table. */
export function reportTsv(rows) {
	return [REPORT_HEAD, ...rows.map(reportCells)].map((cells) => cells.join('\t')).join('\n');
}

/** The report as a Markdown table. */
export function reportMarkdown(rows) {
	const line = (cells) => `| ${cells.join(' | ')} |`;
	return [line(REPORT_HEAD), line(REPORT_HEAD.map(() => '---')), ...rows.map((r) => line(reportCells(r)))].join('\n');
}

/**
 * Sensitivity of Q to each part, S_x^Q = (x/Q) dQ/dx, with the reader's
 * values: the Sallen-Key low-pass and the multiple feedback low-pass.
 * Sallen-Key, Q = sqrt(R1 R2 Ctop Cbottom) / ((R1 + R2) Cbottom):
 * S_R1 = (R2 - R1)/(2(R1 + R2)), S_R2 the mirror image (both 0 for equal
 * resistors), S_Ctop = 1/2, S_Cbottom = -1/2. Multiple feedback: as in
 * sensitivity.js. null for any other circuit.
 */
export function sensitivityOf(topology, parts) {
	if (topology === 'sallenKey') {
		const { R1, R2 } = parts;
		return { R1: (R2 - R1) / (2 * (R1 + R2)), R2: (R1 - R2) / (2 * (R1 + R2)), Ctop: 0.5, Cbottom: -0.5 };
	}
	if (topology === 'mfb') return mfbSensitivity(parts);
	return null;
}

/* --------------------------------------------------------------- texts */
/*
 * A block is { p: text }, { eq: tex }, { caution: text } (a slip and its
 * correction, one line), { warn: text } (where the walk stops, shown as a
 * flag) or { table: { head, rows } } with TeX cells.
 */

const p = (text) => ({ p: text });
const eq = (tex) => ({ eq: stack(tex) });

/**
 * Formulas joined by ", \quad" or ", \qquad" at the top level, each put
 * on a line of its own: a phone then shows each one whole.
 */
function stack(tex) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < tex.length; i++) {
		const c = tex[i];
		if (c === '{') depth++;
		else if (c === '}') depth--;
		else if (depth === 0 && c === ',') {
			const m = /^,\s*\\q?quad\s*/.exec(tex.slice(i));
			if (m) {
				parts.push(tex.slice(start, i));
				start = i + m[0].length;
				i = start - 1;
			}
		}
	}
	parts.push(tex.slice(start));
	return parts.length > 1 ? T`\begin{gathered}${parts.join(T` \\ `)}\end{gathered}` : tex;
}
const caution = (text) => ({ caution: text });
/** A block the panel shows as a warning flag: where the walk stops. */
const warn = (text) => ({ warn: text });

const hz = (f) => {
	const a = Math.abs(f);
	if (a >= 1e6) return `${Number((f / 1e6).toPrecision(4))} MHz`;
	if (a >= 1e3) return `${Number((f / 1e3).toPrecision(4))} kHz`;
	return `${Number(f.toPrecision(4))} Hz`;
};
const db = (x) => `${Number(Number(x).toPrecision(4))} dB`;

/** The denormalization table, one column per filter type: TeX cells. */
export function denormTable() {
	return {
		head: ['', 'low-pass', 'high-pass', 'band-pass', 'band-stop'],
		keys: ['lowpass', 'highpass', 'bandpass', 'bandstop'],
		tex: true,
		rows: [
			[T`\omega_c`, T`\omega_{max}`, T`\omega_{max}`, T`\sqrt{\omega_{max,1}\,\omega_{max,2}}`, T`\sqrt{\omega_{max,1}\,\omega_{max,2}}`],
			['k', T`\frac{\omega_{max}}{\omega_{min}}`, T`\frac{\omega_{min}}{\omega_{max}}`, T`\frac{\omega_{max,2} - \omega_{max,1}}{\omega_{min,2} - \omega_{min,1}}`, T`\frac{\omega_{min,2} - \omega_{min,1}}{\omega_{max,2} - \omega_{max,1}}`],
			['B', '', '', T`\omega_{max,2} - \omega_{max,1}`, T`\omega_{max,2} - \omega_{max,1}`],
			[T`s^*`, T`\frac{s}{\omega_c}`, T`\frac{\omega_c}{s}`, T`\frac{s^2 + \omega_c^2}{B\,s}`, T`\frac{B\,s}{s^2 + \omega_c^2}`]
		]
	};
}

/** The spec in one sentence, as the method reads it. */
function specSentence(spec) {
	if (spec.filterType === 'lowpass') return `This low-pass passes up to fp = ${hz(spec.fp)} with at most Amax = ${db(spec.amaxDb)} of loss, and stops from fs = ${hz(spec.fs)} with at least Amin = ${db(spec.aminDb)}.`;
	if (spec.filterType === 'highpass') return `This high-pass passes from fp = ${hz(spec.fp)} up with at most Amax = ${db(spec.amaxDb)} of loss, and stops below fs = ${hz(spec.fs)} with at least Amin = ${db(spec.aminDb)}.`;
	if (spec.filterType === 'bandpass') return `This band-pass passes from fl = ${hz(spec.fl)} to fh = ${hz(spec.fh)} and stops below fsl = ${hz(spec.fsl)} and above fsh = ${hz(spec.fsh)}.`;
	return `This band-stop passes below fl = ${hz(spec.fl)} and above fh = ${hz(spec.fh)}, and stops from fsl = ${hz(spec.fsl)} to fsh = ${hz(spec.fsh)}.`;
}

/** Step 1: the explanation, the hints and the solution. */
export function specTexts(ctx) {
	const { spec, s1 } = ctx;
	const t = spec.filterType;
	const intro = [p('The method starts from three numbers: Amax, the most loss allowed in the passband, Amin, the least loss required in the stopband, and k, how sharp the transition from one to the other is. Together they set the order.'), p(specSentence(spec))];
	if (spec.band) {
		if (spec.amaxSplit) intro.push(p(`The two passband edges allow ${db(spec.amaxLow)} and ${db(spec.amaxHigh)}: the method takes one Amax, the smaller, ${db(spec.amaxDb)}.`));
		else intro.push(p(`Amax = ${db(spec.amaxDb)} at both passband edges.`));
		if (spec.aminSplit) intro.push(p(`The two stopband edges ask for ${db(spec.aminLow)} and ${db(spec.aminHigh)}: the method takes one Amin, the larger, ${db(spec.aminDb)}, which meets both.`));
		else intro.push(p(`Amin = ${db(spec.aminDb)} at both stopband edges.`));
	}
	if (s1.response === 'butterworth') intro.push(p('Butterworth: the flattest passband, no ripple, a gentle transition.'));
	else {
		intro.push(p('Chebyshev 0.5 dB: a sharper transition for the same order, paid for with 0.5 dB of ripple in the passband. The table holds that ripple only, so here Amax = 0.5 dB.'));
		if (s1.rippleNote === 'stricter') intro.push(p(`The spec allows ${db(spec.amaxDb)}; 0.5 dB of ripple is stricter, so it still meets the spec.`));
		// the walk stops here: the rest of step 1 would ask for numbers no step uses
		if (s1.rippleNote === 'tooStrict') return { intro: [...intro, warn(`The spec allows only ${db(spec.amaxDb)}, less than the 0.5 dB this table holds: it cannot meet it. Pick Butterworth, or loosen Amax to 0.5 dB.`)], hint1: [], hint2: [], solution: [] };
	}
	if (!spec.band) {
		const kTex = t === 'lowpass' ? T`k = \frac{\omega_{max}}{\omega_{min}} = \frac{f_p}{f_s}` : T`k = \frac{\omega_{min}}{\omega_{max}} = \frac{f_s}{f_p}`;
		intro.push(p('The table below gives k for each type of filter (ωmax is the passband edge, ωmin the stopband edge). The 2π cancels in a ratio, so Hz work as well as rad/s.'), eq(kTex));
		const hint1 = [p(`k compares the two edges of the transition so that it comes out below 1: for a ${TYPE_WORD[t]}, the ${t === 'lowpass' ? 'passband edge over the stopband edge' : 'stopband edge over the passband edge'}.`)];
		const hint2 = [eq(t === 'lowpass' ? T`k = \frac{${fmt(spec.fp, 6)}}{${fmt(spec.fs, 6)}}` : T`k = \frac{${fmt(spec.fs, 6)}}{${fmt(spec.fp, 6)}}`)];
		const solution = [eq(T`k = ${texNum(s1.k, 6)}`)];
		return { intro, hint1, hint2, solution };
	}
	const { sym } = s1;
	intro.push(
		p('The band formulas for k hold only for a geometrically symmetric spec: on a log scale, the two stopband edges sit symmetric about the centre √(fl fh), as the passband edges do. In numbers:'),
		eq(T`f_{sl}\,f_{sh} = f_l\,f_h`),
		caution('With edges that are not symmetric, the k of the table matches neither stopband edge: make the spec symmetric first, by moving the stopband edge that makes it stricter.')
	);
	const hz2 = (x) => `${proseNum(x)} Hz²`;
	if (!sym.moved) intro.push(p(`Here fsl × fsh = fl × fh = ${hz2(sym.target)}: the spec is already symmetric, and no edge moves.`));
	else if (t === 'bandpass') intro.push(p(sym.moved === 'fsl' ? `Here fsl × fsh = ${hz2(sym.product)}, under fl × fh = ${hz2(sym.target)}: move fsl up to fl fh / fsh. The lower stopband then starts closer to the passband, which only makes the spec stricter.` : `Here fsl × fsh = ${hz2(sym.product)}, over fl × fh = ${hz2(sym.target)}: move fsh down to fl fh / fsl. The upper stopband then starts closer to the passband, which only makes the spec stricter.`));
	else intro.push(p(sym.moved === 'fsl' ? `Here fsl × fsh = ${hz2(sym.product)}, over fl × fh = ${hz2(sym.target)}: move fsl down to fl fh / fsh. The stopband then grows, which only makes the spec stricter.` : `Here fsl × fsh = ${hz2(sym.product)}, under fl × fh = ${hz2(sym.target)}: move fsh up to fl fh / fsl. The stopband then grows, which only makes the spec stricter.`));
	intro.push(
		p(
			t === 'bandpass'
				? 'Then, from the table below, ωc is the geometric centre of the passband and B its width, both in rad/s, and k compares the widths of the two bands.'
				: 'Then, from the table below, ωc is the geometric centre of the band from fl to fh and B its width, both in rad/s (the stopband sits inside that band), and k compares the widths of the two bands.'
		)
	);
	const kTex = t === 'bandpass' ? T`k = \frac{f_h - f_l}{f_{sh} - f_{sl}}` : T`k = \frac{f_{sh} - f_{sl}}{f_h - f_l}`;
	const hint1 = [p(`${sym.moved ? `Move ${sym.moved} so that fsl × fsh = fl × fh, then` : 'The spec is symmetric as it stands, so'} take ωc = 2π√(fl fh), B = 2π(fh - fl), and k with the symmetric edges.`)];
	const hint2 = [];
	if (sym.moved) hint2.push(eq(sym.moved === 'fsl' ? T`f_{sl}' = \frac{f_l\,f_h}{f_{sh}} = \frac{${fmt(spec.fl, 6)} \times ${fmt(spec.fh, 6)}}{${fmt(spec.fsh, 6)}}` : T`f_{sh}' = \frac{f_l\,f_h}{f_{sl}} = \frac{${fmt(spec.fl, 6)} \times ${fmt(spec.fh, 6)}}{${fmt(spec.fsl, 6)}}`));
	hint2.push(eq(T`\omega_c = 2\pi\sqrt{${fmt(spec.fl, 6)} \times ${fmt(spec.fh, 6)}}, \quad B = 2\pi\,(${fmt(spec.fh, 6)} - ${fmt(spec.fl, 6)})`), eq(kTex));
	const solution = [];
	if (sym.moved) solution.push(eq(T`${sym.moved === 'fsl' ? "f_{sl}'" : "f_{sh}'"} = ${texNum(sym[sym.moved], 6)}\ \text{Hz}`));
	solution.push(eq(T`\omega_c = ${texNum(s1.wc, 6)}\ \text{rad/s}, \quad B = ${texNum(s1.B, 6)}\ \text{rad/s}, \quad k = ${texNum(s1.k, 6)}`));
	return { intro, hint1, hint2, solution };
}

const ORDER_TEX = {
	butterworth: T`n \ge \frac{\log\left(\dfrac{10^{A_{min}/10} - 1}{10^{A_{max}/10} - 1}\right)}{2\,\log(1/k)}`,
	chebyshev: T`n \ge \frac{\cosh^{-1}\sqrt{\dfrac{10^{A_{min}/10} - 1}{10^{A_{max}/10} - 1}}}{\cosh^{-1}(1/k)}`
};

/** Step 2. */
export function orderTexts(ctx) {
	const { s1, s2 } = ctx;
	const butter = s1.response === 'butterworth';
	const intro = [p('The order is the number of poles: the smallest whole n that reaches Amin at the stopband edge.'), eq(ORDER_TEX[s1.response])];
	if (butter) intro.push(caution('Written with the ratio upside down, this gives a negative n.'));
	intro.push(p(`Here Amax = ${db(s1.amaxDb)}, Amin = ${db(s1.aminDb)} and k = ${fmt(s1.k, 6)} from step 1. Type the value the formula gives, then n.`));
	const band = s1.filterType === 'bandpass' || s1.filterType === 'bandstop';
	if (band) intro.push(p(`For a ${s1.filterType === 'bandpass' ? 'band-pass' : 'band-stop'}, n is the order of the low-pass prototype. The substitution in step 4 doubles it: the filter has order 2n, built as n second-order stages.`));
	const ratio = (10 ** (s1.aminDb / 10) - 1) / (10 ** (s1.amaxDb / 10) - 1);
	const hint1 = [p(`Work out the ratio inside first, then the ${butter ? 'log' : 'cosh⁻¹ of its square root'}; the denominator takes 1/k, which is above 1${butter ? ', and any base of log works as long as it is the same on top and bottom' : ''}.`)];
	const hint2 = [
		eq(T`\frac{10^{${fmt(s1.aminDb, 6)}/10} - 1}{10^{${fmt(s1.amaxDb, 6)}/10} - 1} = ${texNum(ratio, 6)}, \qquad \frac{1}{k} = ${texNum(1 / s1.k, 6)}`),
		eq(butter ? T`n \ge \frac{\log(${texNum(ratio, 6)})}{2\,\log(${texNum(1 / s1.k, 6)})}` : T`n \ge \frac{\cosh^{-1}\sqrt{${texNum(ratio, 6)}}}{\cosh^{-1}(${texNum(1 / s1.k, 6)})}`)
	];
	const solution = [eq(band ? T`n \ge ${texNum(s2.value, 6)} \quad\Rightarrow\quad n = ${s2.n} \quad\Rightarrow\quad \text{filter order } 2n = ${2 * s2.n}` : T`n \ge ${texNum(s2.value, 6)} \quad\Rightarrow\quad n = ${s2.n}`)];
	return { intro, hint1, hint2, solution };
}

/** What to say when the order is past the tables. */
export function beyondText(ctx) {
	const { s1, s2, spec } = ctx;
	const other = s1.response === 'butterworth' && spec.amaxDb >= TABLE_RIPPLE_DB - 1e-9 ? orderStep(specStep(spec, 'chebyshev')) : null;
	const out = [p(`Order ${s2.n} is past the tables, which stop at ${TABLE_MAX_ORDER}. Loosen the spec (a smaller Amin, a wider transition) or use the automatic design above, which goes much further.`)];
	if (other && !other.beyond) out.push(p(`Chebyshev 0.5 dB needs only n = ${other.n} here: pick it in step 1 to go on with the tables.`));
	return out;
}

/** The normalized H_n(s) of a row, with its numerator. */
export function hnTex(response, n) {
	const s3 = tableStep(response, n);
	const den = s3.row.tex;
	const num = response === 'chebyshev' ? fmt(s3.numerator, 6) : '1';
	return T`H_n(s) = \frac{${num}}{${den}}`;
}

/** Step 3. */
export function tableTexts(ctx) {
	const { s1, s2, s3 } = ctx;
	const butter = s1.response === 'butterworth';
	const intro = [
		p(`The table gives the denominator of the normalized low-pass Hn(s), with ω = 1 rad/s as its reference frequency, already split into second-order factors s² + a s + b and, for an odd order, one first-order factor s + p.`),
		p(butter ? 'This Butterworth table is normalized at -3 dB: ω = 1 is the -3 dB point.' : 'This Chebyshev table is normalized at the ripple edge: ω = 1 is where the loss leaves the 0.5 dB ripple band.'),
		p(`Pick the row for the order of step 2.`)
	];
	// shown once the right row is picked: Hn(s) with the numerator that gives it a gain of 1 at DC
	const after = [
		eq(hnTex(s1.response, s2.n)),
		p(
			butter
				? 'The numerator is 1: every constant term of the table is 1, so Hn(0) = 1, a gain of 1 at DC.'
				: 'The numerator Kn is the product of the constant terms, so that Hn(0) = 1, a gain of 1 at DC: at s = 0 each factor reduces to its constant term.'
		),
		...(butter ? [] : [eq(T`K_n = ${s3.factors.map((f) => fmt(f.p ?? f.b, 7)).join(T` \times `)} = ${fmt(s3.numerator, 6)}`)]),
		...(!butter && s2.n % 2 === 0 ? [p('With this numerator an even order ripples between 0 and +0.5 dB: DC sits at the bottom of a ripple.')] : [])
	];
	return { intro, after };
}

/** A denormalized factor in TeX. */
export function denormFactorTex(f) {
	return f.kind === 'real' ? T`s + ${texNum(f.p, 5)}` : T`s^2 + ${texNum(f.a, 5)}\,s + ${texNum(f.b, 5)}`;
}

/** H_d(s) in full. */
export function hdTex(ctx) {
	const { s1, s2, s4 } = ctx;
	const den = s4.factors.map((f) => T`\left(${denormFactorTex(f)}\right)`).join('');
	const t = s1.filterType;
	const n = s2.n;
	const sn = n === 1 ? 's' : `s^{${n}}`;
	const num = t === 'lowpass' ? texNum(s4.numerator.coef, 5) : t === 'highpass' ? sn : t === 'bandpass' ? T`${texNum(s4.numerator.coef, 5)}\,${sn}` : T`\left(s^2 + ${texNum(s4.wc * s4.wc, 5)}\right)${n === 1 ? '' : `^{${n}}`}`;
	return T`H_d(s) = \frac{${num}}{${den}}`;
}

/** Step 4. */
export function denormTexts(ctx) {
	const { s1, s2, s3, s4 } = ctx;
	const t = s1.filterType;
	const n = s2.n;
	const band = t === 'bandpass' || t === 'bandstop';
	const intro = [p('Denormalizing puts the filter at its real frequencies: Hd(s) = Hn(s*), with s* from the last row of the table in step 1.')];
	const exp = t === 'lowpass' || t === 'bandpass' ? '-1/n' : '1/n';
	if (s4.scaled) {
		intro.push(
			p(`The Butterworth table loses 3 dB at ω = 1, and this spec allows Amax = ${db(s1.amaxDb)} at the passband edge${band ? 's' : ''}. So the ${band ? 'bandwidth' : 'frequency'} ω = 1 lands on is scaled${band ? ': s* then takes Bd in place of B.' : ':'}`),
			eq(T`\varepsilon = \sqrt{10^{A_{max}/10} - 1}, \qquad ${band ? T`B_d = B\,\varepsilon^{${exp}}` : T`\omega_c = \omega_{max}\,\varepsilon^{${exp}}`}`),
			caution('Denormalizing at the passband edge itself loses 3 dB there instead of Amax; at Amax = 3.0103 dB, ε = 1 and nothing changes.')
		);
	} else intro.push(p(`The Chebyshev table is normalized at its ripple edge, so ${band ? 's* takes B as it is, Bd = B' : 'ωc = ωmax'}: no scaling.`));
	if (band) {
		const quads = s3.factors.filter((f) => f.p === undefined).length;
		const reals = s3.factors.length - quads;
		const parts = [];
		if (quads) parts.push(`${quads > 1 ? 'each second-order factor of the table turns' : 'the second-order factor of the table turns'} into a fourth-order polynomial that splits into two second-order factors`);
		if (reals) parts.push('the first-order factor turns into one second-order factor');
		const sentence = parts.join(', and ');
		intro.push(p(`ωc = ${proseNum(s4.wc, 6)} rad/s from step 1 stays. ${sentence[0].toUpperCase()}${sentence.slice(1)}: ${n} second-order factor${n > 1 ? 's' : ''} in all. The Python below does the substitution${quads ? ' and the split' : ''}.`));
	} else intro.push(p('Put s* in each factor, then scale the factor so that its highest power of s keeps the coefficient 1. Type ωc, the coefficients of each factor, and the numerator of Hd(s).'));
	intro.push(p(t === 'lowpass' ? 'Numerator: the constant that keeps a gain of 1 at DC.' : t === 'highpass' ? `Numerator: ${powerText('s', n)} times a coefficient; the table's Kn cancels against the factors' constants.` : t === 'bandpass' ? `Numerator: Kn ${powerText('Bd', n)} ${powerText('s', n)}.` : `Numerator: ${powerText('(s² + ωc²)', n)} times a coefficient.`));
	const hint1 = [];
	const hint2 = [];
	if (t === 'lowpass') {
		hint1.push(p('Put s/ωc in place of s in each factor and multiply the factor by ωc² (by ωc for s + p): the s² term keeps its coefficient 1. The numerator picks up the same powers of ωc.'));
		hint2.push(eq(T`s^2 + a\,s + b \;\to\; s^2 + a\,\omega_c\,s + b\,\omega_c^2, \qquad s + p \;\to\; s + p\,\omega_c, \qquad K_n \to K_n\,\omega_c^{${n}}`));
	} else if (t === 'highpass') {
		hint1.push(p('Put ωc/s in place of s, multiply by s² (by s for s + p), then divide by the constant term so that s² keeps the coefficient 1. The constants divided out cancel Kn.'));
		hint2.push(eq(T`s^2 + a\,s + b \;\to\; s^2 + \frac{a\,\omega_c}{b}\,s + \frac{\omega_c^2}{b}, \qquad s + p \;\to\; s + \frac{\omega_c}{p}`));
	} else {
		hint1.push(p(`Each pole r of a table factor gives two poles of Hd: the roots of ${t === 'bandpass' ? 's² - r Bd s + ωc² = 0' : 's² - (Bd/r) s + ωc² = 0'}. A root and its conjugate make one real factor s² - 2 Re(root) s + |root|². The Python below does exactly that.`));
		hint2.push(
			eq(t === 'bandpass' ? T`s + p \;\to\; s^2 + p\,B_d\,s + \omega_c^2` : T`s + p \;\to\; s^2 + \frac{B_d}{p}\,s + \omega_c^2`),
			eq(t === 'bandpass' ? T`s^2 + a\,s + b \;\to\; \left(s^2 + \omega_c^2\right)^2 + a\,B_d\,s\left(s^2 + \omega_c^2\right) + b\,B_d^2 s^2` : T`s^2 + a\,s + b \;\to\; \left(s^2 + \omega_c^2\right)^2 + \frac{a\,B_d}{b}\,s\left(s^2 + \omega_c^2\right) + \frac{B_d^2}{b}\,s^2`),
			p('The constant term of each quartic is ωc⁴, so its two factors have constants that multiply to ωc⁴: one below ωc², one above.')
		);
	}
	const solution = [];
	if (band) solution.push(eq(T`B_d = ${texNum(s4.Bd, 6)}\ \text{rad/s}${s4.scaled ? T` \quad (\varepsilon = ${texNum(s4.eps, 5)})` : ''}`));
	else solution.push(eq(T`\omega_c = ${texNum(s4.wd, 6)}\ \text{rad/s}${s4.scaled ? T` \quad (\varepsilon = ${texNum(s4.eps, 5)})` : ''}`));
	solution.push(eq(hdTex(ctx)));
	return { intro, hint1, hint2, solution };
}

const STANDARD_TEX = {
	lowpass: T`\frac{\omega_n^2}{s^2 + \frac{\omega_n}{Q}\,s + \omega_n^2}`,
	highpass: T`\frac{s^2}{s^2 + \frac{\omega_n}{Q}\,s + \omega_n^2}`,
	bandpass: T`\frac{\frac{\omega_n}{Q}\,s}{s^2 + \frac{\omega_n}{Q}\,s + \omega_n^2}`,
	notch: T`\frac{s^2 + \omega_z^2}{s^2 + \frac{\omega_n}{Q}\,s + \omega_n^2}`
};

/** A stage of step 5 in the standard form, with its numbers. */
export function stageTex(st) {
	if (st.order === 1) return st.kind === 'lowpass' ? T`H(s) = \frac{${texNum(st.p, 5)}}{s + ${texNum(st.p, 5)}}` : T`H(s) = \frac{s}{s + ${texNum(st.p, 5)}}`;
	const den = T`s^2 + ${texNum(st.factor.a, 5)}\,s + ${texNum(st.factor.b, 5)}`;
	const num = st.kind === 'lowpass' ? texNum(st.factor.b, 5) : st.kind === 'highpass' ? 's^2' : st.kind === 'bandpass' ? T`${texNum(st.factor.a, 5)}\,s` : T`s^2 + ${texNum(st.wz * st.wz, 5)}`;
	return T`H(s) = \frac{${num}}{${den}}`;
}

const KIND_WORD = { lowpass: 'low-pass', highpass: 'high-pass', bandpass: 'band-pass', notch: 'notch' };
export function stageKindWord(st) {
	return st.order === 1 ? `first-order ${KIND_WORD[st.kind]}` : KIND_WORD[st.kind];
}

/** Step 5. */
export function stagesTexts(ctx) {
	const { s1, s2, s4, s5 } = ctx;
	const t = s1.filterType;
	const n = s2.n;
	const intro = [p('Each second-order factor becomes one stage in the standard form, and each first-order factor a first-order stage. The denominators are already there; only ωn and Q are left to read off.')];
	if (t === 'bandpass') {
		intro.push(
			p(
				n === 1
					? 'The numerator of Hd holds s: a band-pass stage brings one s, a high-pass stage s², a low-pass stage none, so the one stage here is a band-pass stage.'
					: `A band-pass quadratic can be a band-pass, a low-pass or a high-pass stage. The numerator of Hd holds s${sup(n)}: a band-pass stage brings one s, a high-pass stage s², a low-pass stage none, so the stages must bring ${n} in all. Making all ${n} band-pass stages is the usual choice; pairs of low-pass and high-pass stages work as well.`
			),
			eq(T`\text{band-pass: } ${STANDARD_TEX.bandpass}, \qquad \text{low-pass: } ${STANDARD_TEX.lowpass}, \qquad \text{high-pass: } ${STANDARD_TEX.highpass}`)
		);
	} else if (t === 'bandstop') intro.push(p(`Every stage is a notch with its zero at ωc = ${proseNum(s4.wc, 6)} rad/s:`), eq(STANDARD_TEX.notch));
	else intro.push(eq(STANDARD_TEX[t]), ...(s5.stages.some((st) => st.order === 1) ? [p(`The first-order factor s + p is a first-order ${TYPE_WORD[t]} with its corner at ω = p: ${t === 'lowpass' ? 'p/(s + p)' : 's/(s + p)'}.`)] : []));
	intro.push(p('The stage numerators then multiply to a constant (times powers of s), and Hd(s) needs its own: a gain stage K makes up the difference, a rule of three.'));
	const hint1 = [p('Line up s² + a s + b with s² + (ωn/Q) s + ωn²: the constant term is ωn², the s coefficient is ωn/Q.')];
	const hint2 = [eq(T`\omega_n = \sqrt{b}, \qquad Q = \frac{\sqrt{b}}{a}`), p('K = (numerator of Hd) / (product of the stage numerators): ωn² for a low-pass stage, ωn/Q for a band-pass stage, 1 for a high-pass or a notch stage, p for a first-order low-pass and 1 for a first-order high-pass.')];
	const nums = s5.stages.map((st) => texNum(st.numerator, 5));
	const solution = [
		{
			table: {
				head: ['Stage', 'Kind', 'ωn or p (rad/s)', 'Q', 'f0 (Hz)'],
				rows: s5.stages.map((st, i) => [String(i + 1), stageKindWord(st), fmt(st.order === 1 ? st.p : st.wn, 6), st.order === 1 ? '-' : fmt(st.q, 5), fmt((st.order === 1 ? st.p : st.wn) / TWO_PI, 5)])
			}
		},
		eq(T`K = \frac{${texNum(s4.numerator.coef, 5)}}{${nums.join(T` \times `)}} = ${texNum(s5.K, 5)}`)
	];
	if (Math.abs(s5.K - 1) < 1e-9) solution.push(p('K = 1: the stages alone give the gain, and no gain stage is needed.'));
	return { intro, hint1, hint2, solution };
}

/** The stage's K hint: the rule of three with this design's numerators. */
export function gainTexts(ctx) {
	const { s4, s5 } = ctx;
	const parts = s5.stages.map((st) => (st.order === 1 ? (st.kind === 'lowpass' ? 'p' : '1') : st.kind === 'lowpass' ? T`\omega_n^2` : st.kind === 'bandpass' ? T`\frac{\omega_n}{Q}` : '1'));
	return {
		hint1: [p('The product of the stage numerators must equal the numerator of Hd(s); K makes up the difference.')],
		hint2: [eq(T`K = \frac{${texNum(s4.numerator.coef, 5)}}{${parts.join(T` \cdot `)}}`)]
	};
}

/* -------------------------------------------- step 6, per topology */

/** The topology's transfer function in its own form, and how its coefficients match a stage. */
export function topologyTexts(topology, stage) {
	const out = { form: [], design: [], hint1: [], hint2: [] };
	const w = texNum(stage.wn ?? stage.p, 5);
	const qq = stage.q !== undefined ? texNum(stage.q, 5) : '';
	switch (topology) {
		case 'sallenKey':
			out.form.push(
				p('Sallen-Key low-pass, unity gain: R1 then R2 in series to the + input, Cbottom from the + input to ground, Ctop from the R1-R2 node back to the output. Its own form is c/(a s² + b s + 1):'),
				eq(T`H(s) = \frac{1}{R_1 R_2 C_{top} C_{bottom}\,s^2 + (R_1 + R_2)\,C_{bottom}\,s + 1}`),
				p('The simplified form takes R1 = R2 = R, Ctop = mC and Cbottom = qC, with τ = RC:'),
				eq(T`H(s) = \frac{1}{m q\,(\tau s)^2 + 2 q\,\tau s + 1}, \qquad \omega_n = \frac{1}{\tau\sqrt{m q}}, \qquad Q = \frac{1}{2}\sqrt{\frac{m}{q}} = \frac{1}{2}\sqrt{\frac{C_{top}}{C_{bottom}}}`),
				caution('ωn/Q is the s coefficient divided by the s² coefficient; skipping that division gives S_R^Q = -2, which is wrong.')
			);
			out.design.push(eq(T`\frac{1}{\omega_n^2} = R_1 R_2 C_{top} C_{bottom} = \frac{1}{(${w})^2}, \qquad \frac{1}{\omega_n Q} = (R_1 + R_2)\,C_{bottom} = \frac{1}{(${w})\,(${qq})}`));
			out.hint1.push(p('Q depends on the capacitors alone when R1 = R2: pick Cbottom, make Ctop as close to 4Q² Cbottom as the stock allows, then solve the ωn equation for R.'));
			out.hint2.push(eq(T`\frac{C_{top}}{C_{bottom}} = 4Q^2 = ${texNum(4 * stage.q * stage.q, 5)}, \qquad R = \frac{1}{\omega_n\sqrt{C_{top}\,C_{bottom}}}`), p('With Ctop/Cbottom above 4Q², two different resistors reach Q exactly: R1 + R2 = 1/(ωn Q Cbottom) and R1 R2 = 1/(ωn² Ctop Cbottom).'));
			break;
		case 'mfb':
			out.form.push(
				p('Multiple feedback low-pass: R1 from the input to node A, C1 from A to ground, R2 from A to the - input, R3 from the output back to A, C2 from the - input to the output, + input grounded. Its own form is c/(s² + a s + b):'),
				eq(T`H(s) = \frac{c}{s^2 + a\,s + b}, \quad a = \frac{1}{C_1}\left(\frac{1}{R_1} + \frac{1}{R_2} + \frac{1}{R_3}\right), \quad b = \frac{1}{R_2 R_3 C_1 C_2}, \quad c = -\frac{1}{R_1 R_2 C_1 C_2}`),
				p('Its DC gain is c/b = -R3/R1, so R1 = R3 gives a gain of -1 (the stage inverts).')
			);
			out.design.push(eq(T`a = \frac{\omega_n}{Q} = ${texNum(stage.wn / stage.q, 5)}, \qquad b = \omega_n^2 = ${texNum(stage.wn * stage.wn, 5)}, \qquad R_1 = R_3`));
			out.hint1.push(p('Three equations, five unknowns: pick C1 and C2 from the stock first, set R1 = R3 for a gain of -1, then solve for R1 and R2.'));
			out.hint2.push(eq(T`x = \frac{1}{R_1} = \frac{1}{R_3}: \quad 2x^2 - a C_1\,x + b\,C_1 C_2 = 0, \qquad \frac{1}{R_2} = a C_1 - 2x`), p(`Real only when C1/C2 ≥ 8Q² = ${fmt(8 * stage.q * stage.q)}: a DC gain of -K needs C1/C2 ≥ 4(K + 1)Q², and K = 1 here. Of the two roots, either works; the one with resistors nearer 10 kΩ is the easier to buy.`));
			break;
		case 'sallenKeyHp':
			out.form.push(
				p('Sallen-Key high-pass, unity gain: C1 then C2 in series to the + input, Rbottom from the + input to ground, Rtop from the C1-C2 node back to the output.'),
				eq(T`H(s) = \frac{s^2}{s^2 + \frac{C_1 + C_2}{C_1 C_2 R_{bottom}}\,s + \frac{1}{C_1 C_2 R_{bottom} R_{top}}}`),
				p('With C1 = C2 = C: ωn = 1/(C√(Rtop Rbottom)) and Q = ½√(Rbottom/Rtop).')
			);
			out.design.push(eq(T`\frac{C_1 + C_2}{C_1 C_2 R_{bottom}} = \frac{\omega_n}{Q} = ${texNum(stage.wn / stage.q, 5)}, \qquad \frac{1}{C_1 C_2 R_{bottom} R_{top}} = \omega_n^2 = ${texNum(stage.wn * stage.wn, 5)}`));
			out.hint1.push(p('Pick C1 = C2 = C from the stock; the s coefficient then gives Rbottom, and the constant term Rtop.'));
			out.hint2.push(eq(T`R_{bottom} = \frac{Q\,(C_1 + C_2)}{\omega_n C_1 C_2}, \qquad R_{top} = \frac{1}{\omega_n^2 C_1 C_2 R_{bottom}}`));
			break;
		case 'mfbHp':
			out.form.push(
				p('Multiple feedback high-pass: C1 from the input to node A, R1 from A to ground, C2 from A to the - input, C3 from the output back to A, R2 from the - input to the output, + input grounded.'),
				eq(T`H(s) = \frac{-\frac{C_1}{C_3}\,s^2}{s^2 + \frac{C_1 + C_2 + C_3}{R_2 C_2 C_3}\,s + \frac{1}{R_1 R_2 C_2 C_3}}`),
				p('Its gain far above ωn is -C1/C3: C1 = C3 gives -1.')
			);
			out.design.push(eq(T`\frac{C_1 + C_2 + C_3}{R_2 C_2 C_3} = \frac{\omega_n}{Q} = ${texNum(stage.wn / stage.q, 5)}, \qquad \frac{1}{R_1 R_2 C_2 C_3} = \omega_n^2 = ${texNum(stage.wn * stage.wn, 5)}`));
			out.hint1.push(p('Pick C1 = C2 = C3 = C from the stock: the s coefficient gives R2, then the constant term gives R1.'));
			out.hint2.push(eq(T`R_2 = \frac{Q\,(C_1 + C_2 + C_3)}{\omega_n C_2 C_3}, \qquad R_1 = \frac{1}{\omega_n^2 R_2 C_2 C_3}`));
			break;
		case 'mfbBp':
			out.form.push(
				p('Multiple feedback band-pass: R1 from the input to node A, R2 from A to ground, C2 from A to the - input, C1 from the output back to A, R3 from the - input to the output, + input grounded.'),
				eq(T`H(s) = \frac{-\frac{1}{R_1 C_1}\,s}{s^2 + \frac{C_1 + C_2}{R_3 C_1 C_2}\,s + \frac{1/R_1 + 1/R_2}{R_3 C_1 C_2}}, \qquad H(j\omega_n) = -\frac{R_3 C_2}{R_1 (C_1 + C_2)}`),
				p('The stage in the standard form has a gain of 1 at its own ωn; this one gives -1 there with the parts below.')
			);
			out.design.push(eq(T`\frac{C_1 + C_2}{R_3 C_1 C_2} = \frac{\omega_n}{Q} = ${texNum(stage.wn / stage.q, 5)}, \quad \frac{1/R_1 + 1/R_2}{R_3 C_1 C_2} = \omega_n^2 = ${texNum(stage.wn * stage.wn, 5)}, \quad \frac{R_3 C_2}{R_1 (C_1 + C_2)} = 1`));
			out.hint1.push(p('Pick C1 and C2 (equal is simplest): the s coefficient gives R3, the gain then R1, and the constant term R2.'));
			out.hint2.push(eq(T`R_3 = \frac{Q\,(C_1 + C_2)}{\omega_n C_1 C_2}, \quad R_1 = \frac{Q}{\omega_n C_1}, \quad \frac{1}{R_2} = \frac{\omega_n}{Q}\left(Q^2 (C_1 + C_2) - C_1\right)`), p(`R2 must come out positive: with Q = ${fmt(stage.q)}, C2/C1 must exceed 1/Q² - 1 = ${fmt(1 / (stage.q * stage.q) - 1)}.`));
			break;
		case 'firstOrder':
		case 'firstOrderHp': {
			const hp = topology === 'firstOrderHp';
			out.form.push(
				p(hp ? 'First-order high-pass: C in series, R to ground, then a unity-gain follower so that the next stage does not load it.' : 'First-order low-pass: R in series, C to ground, then a unity-gain follower so that the next stage does not load it.'),
				eq(hp ? T`H(s) = \frac{RCs}{RCs + 1} = \frac{s}{s + \frac{1}{RC}}` : T`H(s) = \frac{1}{RCs + 1} = \frac{1/(RC)}{s + \frac{1}{RC}}`)
			);
			out.design.push(eq(T`\frac{1}{RC} = p = ${w}`));
			out.hint1.push(p('Pick C from the stock, then R from RC = 1/p.'));
			out.hint2.push(eq(T`R = \frac{1}{p\,C}`));
			break;
		}
		default:
			break;
	}
	return out;
}

/**
 * The gain stage's three circuits. `bandStages` (the number of band-pass
 * stages) adds, for a K far from 1, how to spread it over those stages:
 * a multiple feedback band-pass with a gain H0 at its centre takes
 * R1 = Q/(H0 ωn C1), R3 as for a gain of 1, and R2 from
 * 1/R2 = (ωn/Q)(Q²(C1 + C2) - H0 C1), real only while H0 < Q²(1 + C2/C1).
 */
export function gainStageTexts(K, bandStages = 0) {
	const k = Math.abs(K);
	const h0 = bandStages > 0 ? k ** (1 / bandStages) : 1;
	const spread =
		bandStages > 0 && (k > 4 || k < 0.25)
			? [
					p(
						`A K this far from 1 can also be spread over the band-pass stages: a multiple feedback band-pass built for a gain H0 at its own centre brings H0 into the product. With H0 = K^(1/${bandStages}) = ${fmt(h0, 4)} on each of the ${bandStages}, no gain stage is needed and the signal keeps its level from stage to stage. The steps here keep each stage at 1 and K apart.`
					),
					eq(T`R_1 = \frac{Q}{H_0\,\omega_n C_1}, \qquad \frac{1}{R_2} = \frac{\omega_n}{Q}\left(Q^2 (C_1 + C_2) - H_0\,C_1\right), \qquad R_3 = \frac{Q\,(C_1 + C_2)}{\omega_n C_1 C_2}`),
					p(
						`R2 is real only while H0 < Q²(1 + C2/C1)${h0 > 1 ? `: with C1 = C2 that is 2Q², so a stage with Q under √(H0/2) = ${fmt(Math.sqrt(h0 / 2), 4)} needs C2 larger than C1` : ''}.`
					)
				]
			: [];
	return {
		form: [
			p(`The stages leave a factor K = ${fmt(k, 5)} to make up. Three circuits give a plain gain:`),
			eq(T`\text{inverting: } H = -\frac{R_2}{R_1}, \qquad \text{divider: } H = \frac{1}{1 + R_2/R_1}, \qquad \text{non-inverting: } H = 1 + \frac{R_2}{R_1}`),
			p(`The divider (R2 in series to the + input of a follower, R1 to ground) gives a gain under 1, the non-inverting amplifier a gain over 1, and the inverting amplifier any size, with a change of sign. The sign only flips the phase, not the magnitude: an inverting gain stage can undo the sign of one inverting stage.`),
			...spread
		],
		hint1: [p('Pick R1 near 10 kΩ, then R2 from the gain.')],
		hint2: [eq(T`\text{inverting: } R_2 = ${texNum(k, 5)}\,R_1, \qquad \text{divider: } R_2 = R_1\left(\frac{1}{${texNum(k, 5)}} - 1\right), \qquad \text{non-inverting: } R_2 = (${texNum(k, 5)} - 1)\,R_1`)]
	};
}

/** Why a band-stop stops after step 5. */
export function notchStopTexts() {
	return [
		p('A notch stage needs a zero on the jω axis, the s² + ωz² on top, which neither Sallen-Key nor multiple feedback can place: their numerators are a constant, s or s². The automatic design above builds these notches as Tow-Thomas or Boctor stages, so this walk stops here for a band-stop.')
	];
}

/** A factor of the table as step 4 labels a row with it: s^2 + 0.765367 s + 1. */
export function tableFactorTex(f) {
	return f.p !== undefined ? `s + ${fmt(f.p, 6)}` : T`s^2 + ${fmt(f.a, 6)}\,s + ${fmt(f.b, 6)}`;
}

/** Step 8's block on the sensitivity of Q, with the correct Sallen-Key figures. */
export function sensitivityTexts() {
	return [
		eq(T`S_x^Q = \frac{x}{Q}\,\frac{\partial Q}{\partial x}`),
		p('How many percent Q moves when part x is 1 % off.'),
		eq(T`\text{Sallen-Key: } Q = \frac{\sqrt{R_1 R_2 C_{top} C_{bottom}}}{(R_1 + R_2)\,C_{bottom}}, \qquad S_{R_1}^Q = \frac{R_2 - R_1}{2(R_1 + R_2)}, \quad S_{R_2}^Q = \frac{R_1 - R_2}{2(R_1 + R_2)}, \quad S_{C_{top}}^Q = \tfrac{1}{2}, \quad S_{C_{bottom}}^Q = -\tfrac{1}{2}`),
		eq(T`\text{multiple feedback: } S_{R_1}^Q = \frac{R_2 R_3}{R_1 R_2 + R_1 R_3 + R_2 R_3}, \quad S_{R_2}^Q = \frac{R_1 R_3}{R_1 R_2 + R_1 R_3 + R_2 R_3} - \frac{1}{2}`),
		eq(T`S_{R_3}^Q = \frac{R_1 R_2}{R_1 R_2 + R_1 R_3 + R_2 R_3} - \frac{1}{2}, \quad S_{C_1}^Q = \tfrac{1}{2}, \quad S_{C_2}^Q = -\tfrac{1}{2}`),
		caution('ωn/Q is the s coefficient divided by the s² coefficient; skipping that division gives S_R^Q = -2 for the Sallen-Key, which is wrong: with equal resistors it is 0, so a resistor error barely moves Q.')
	];
}

/**
 * The page's stock picker value in this panel's words: a series by its
 * name, a list of parts by what it holds.
 */
export function stockWords(stock, pairs = false) {
	const base = stock === 'E96' ? 'the E96 series' : stock === 'lab' ? 'the kit on hand' : stock === 'labR' ? 'the resistors on hand' : stock === 'custom' ? 'the list on hand' : 'the E24 series';
	return base + (pairs ? ' (two in series allowed)' : '');
}

/** The note under a first-order stage: the follower. */
export const FOLLOWER_NOTE = 'The drawing and the LTspice file put a unity-gain follower after the RC: without it the next stage loads the RC and moves its corner.';

/**
 * What step 7 says about the result. `ideal` is the verdict of the exact
 * design (idealStages): rounding the parts is blamed for a passband edge
 * only where the exact design itself sits on that edge's limit.
 */
export function verdictTexts(spec, v, ideal = null) {
	const flags = [];
	const pass = v.edges.filter((e) => e.kind === 'pass');
	const stop = v.edges.filter((e) => e.kind === 'stop');
	const list = (edges) => edges.map((e) => `${fixed(e.loss, e.kind === 'pass' ? 2 : 1)} dB at ${e.name}`).join(', ');
	const limits = (edges, word) => {
		const vals = [...new Set(edges.map((e) => e.limit))];
		return vals.length === 1 ? `${word} ${vals[0]} dB` : edges.map((e) => `${word} ${e.limit} dB at ${e.name}`).join(', ');
	};
	if (stop.every((e) => e.ok)) flags.push({ cls: 'ok', text: `Meets the stopband: ${list(stop)}, ${limits(stop, 'at least')} required.` });
	else flags.push({ cls: 'bad', text: `Falls short in the stopband: ${list(stop)}, ${limits(stop, 'at least')} required. Check the stage that misses most in step 6, or the order.` });
	const plural = pass.length > 1 ? 's' : '';
	const missed = pass.filter((e) => !e.ok);
	const exactAt = (e) => ideal?.edges.find((x) => x.name === e.name)?.loss;
	// the exact design loses (nearly) the whole limit at every edge that misses
	const onLimit = !ideal || missed.every((e) => Number.isFinite(exactAt(e)) && exactAt(e) >= e.limit - PASS_SLACK_DB);
	if (pass.every((e) => e.ok)) flags.push({ cls: 'ok', text: `Passband edge${plural}: ${list(pass)}, ${limits(pass, 'at most')} allowed.` });
	else if (pass.every((e) => e.loss <= e.limit + 1) && onLimit) flags.push({ cls: 'warn', text: `Passband edge${plural} with the parts typed: ${list(pass)}, against ${limits(pass, 'at most')}. The exact design sits on the limit; the excess comes from rounding the parts.` });
	else if (pass.every((e) => e.loss <= e.limit + 1) && missed.every((e) => Number.isFinite(exactAt(e)))) {
		const exact = missed.map((e) => `${fixed(exactAt(e), 2)} dB at ${e.name}`).join(', ');
		flags.push({ cls: 'warn', text: `Passband edge${plural} with the parts typed: ${list(pass)}, against ${limits(pass, 'at most')}. The exact design loses only ${exact}, so the parts move a stage off target: compare each stage's ωn and Q in step 6 with its target.` });
	} else flags.push({ cls: 'bad', text: `Passband edge${plural} miss: ${list(pass)}, against ${limits(pass, 'at most')}. More than rounding explains: compare each stage's ωn and Q in step 6 with its target.` });
	if (Math.abs(v.peakDb) > 0.05) flags.push({ cls: 'note', text: `The top of the passband is at ${v.peakDb > 0 ? '+' : ''}${v.peakDb.toFixed(2)} dB; the losses above are measured from it, as on the rest of the page.` });
	void spec;
	return flags;
}

/* -------------------------------------------------------------- python */

/** Step 1 in Python. */
export function pythonSpec(ctx) {
	const { spec, s1 } = ctx;
	if (!spec.band) {
		return [
			'import math',
			'',
			`fp = ${py(spec.fp)}  # Hz, passband edge`,
			`fs = ${py(spec.fs)}  # Hz, stopband edge`,
			spec.filterType === 'lowpass' ? 'k = fp / fs  # low-pass: passband edge over stopband edge' : 'k = fs / fp  # high-pass: stopband edge over passband edge',
			'print("k =", k)',
			''
		].join('\n');
	}
	const bp = spec.filterType === 'bandpass';
	return [
		'import math',
		'',
		`fl, fh = ${py(spec.fl)}, ${py(spec.fh)}  # Hz, passband edges`,
		`fsl, fsh = ${py(spec.fsl)}, ${py(spec.fsh)}  # Hz, stopband edges`,
		'',
		'# make the spec geometrically symmetric, moving the edge that makes it stricter',
		bp ? 'if fsl * fsh < fl * fh:' : 'if fsl * fsh > fl * fh:',
		'    fsl = fl * fh / fsh',
		bp ? 'elif fsl * fsh > fl * fh:' : 'elif fsl * fsh < fl * fh:',
		'    fsh = fl * fh / fsl',
		'print("fsl =", fsl)',
		'print("fsh =", fsh)',
		'',
		'wc = 2 * math.pi * math.sqrt(fl * fh)  # rad/s, centre',
		'B = 2 * math.pi * (fh - fl)  # rad/s, bandwidth',
		bp ? 'k = (fh - fl) / (fsh - fsl)' : 'k = (fsh - fsl) / (fh - fl)',
		'print("wc =", wc)',
		'print("B =", B)',
		'print("k =", k)',
		''
	].join('\n');
	void s1;
}

/** Step 2 in Python. */
export function pythonOrder(ctx) {
	const { s1 } = ctx;
	const butter = s1.response === 'butterworth';
	return [
		'import math',
		'',
		`Amax = ${py(s1.amaxDb)}  # dB${butter ? '' : ', the ripple of the Chebyshev table'}`,
		`Amin = ${py(s1.aminDb)}  # dB`,
		`k = ${py(s1.k)}`,
		'',
		'ratio = (10 ** (Amin / 10) - 1) / (10 ** (Amax / 10) - 1)',
		butter ? 'n_exact = math.log10(ratio) / (2 * math.log10(1 / k))  # Butterworth' : 'n_exact = math.acosh(math.sqrt(ratio)) / math.acosh(1 / k)  # Chebyshev',
		'print("n_exact =", n_exact)',
		'print("n =", math.ceil(n_exact))',
		''
	].join('\n');
}

/** A table factor as a sympy expression in s. */
function sympyFactor(f) {
	return f.p !== undefined ? `s + ${py(f.p)}` : `s**2 + ${py(f.a)}*s + ${py(f.b)}`;
}

/** Step 4 in Python: the substitution, and for a band filter the split into second-order factors. */
export function pythonDenorm(ctx) {
	const { s1, s2, s3, s4 } = ctx;
	const t = s1.filterType;
	const n = s2.n;
	const head = ['import math', ''];
	const eps = [`Amax = ${py(s1.amaxDb)}  # dB`, `n = ${n}`, 'eps = math.sqrt(10 ** (Amax / 10) - 1)'];
	if (t === 'lowpass' || t === 'highpass') {
		const lp = t === 'lowpass';
		return [
			...head,
			...eps,
			`wmax = ${py(s1.wmax)}  # rad/s, passband edge`,
			s4.scaled ? `wc = wmax * eps ** (${lp ? '-1' : '1'} / n)  # Butterworth: the table loses 3 dB at w = 1` : 'wc = wmax  # Chebyshev: the table is normalized at the ripple edge',
			'print("wc =", wc)',
			'',
			'# the factors of the table: (a, b) for s^2 + a s + b, (p,) for s + p',
			`factors = [${s3.factors.map((f) => (f.p !== undefined ? `(${py(f.p)},)` : `(${py(f.a)}, ${py(f.b)})`)).join(', ')}]`,
			`Kn = ${py(s3.numerator)}  # the table numerator, H_n(0) = 1`,
			'for f in factors:',
			'    if len(f) == 1:',
			lp ? '        print("s + p: p =", f[0] * wc)' : '        print("s + p: p =", wc / f[0])',
			'    else:',
			'        a, b = f',
			lp ? '        print("s^2 + a s + b: a =", a * wc, " b =", b * wc ** 2)' : '        print("s^2 + a s + b: a =", a * wc / b, " b =", wc ** 2 / b)',
			lp ? 'print("numerator =", Kn * wc ** n)' : 'print("numerator =", 1.0, "* s **", n)',
			''
		].join('\n');
	}
	const bp = t === 'bandpass';
	return [
		'import math',
		'import numpy as np',
		'import sympy as sp',
		'',
		...eps,
		`wc = ${py(s1.wc)}  # rad/s, centre of the band`,
		`B0 = ${py(s1.B)}  # rad/s, width of the band`,
		s4.scaled ? `B = B0 * eps ** (${bp ? '-1' : '1'} / n)  # Butterworth: the table loses 3 dB at w = 1` : 'B = B0  # Chebyshev: the table is normalized at the ripple edge',
		'print("B =", B)',
		'',
		's = sp.symbols("s")',
		`Kn = ${py(s3.numerator)}  # the table numerator, H_n(0) = 1`,
		`table = [${s3.factors.map(sympyFactor).join(', ')}]`,
		bp ? 'sstar = (s**2 + wc**2) / (B*s)' : 'sstar = B*s / (s**2 + wc**2)',
		'',
		'quadratics = []',
		'for f in table:',
		'    deg = sp.degree(f, s)',
		'    # substitute, then put it over one denominator: the numerator is the polynomial',
		bp ? '    # (the denominator is (B s)^deg)' : '    # (the denominator is (s^2 + wc^2)^deg)',
		'    num, den = sp.fraction(sp.together(f.subs(s, sstar)))',
		'    poly = sp.Poly(sp.expand(num), s)',
		'    c = [float(x) for x in poly.all_coeffs()]',
		'    c = [x / c[0] for x in c]  # s^2 or s^4 with coefficient 1',
		'    if len(c) == 3:',
		'        quadratics.append((c[1], c[2]))',
		'        continue',
		'    # the roots in units of wc keep the numbers near 1',
		'    roots = np.roots([x / wc**i for i, x in enumerate(c)]) * wc',
		'    for r in roots:',
		'        if r.imag > 0:  # one of each conjugate pair',
		'            quadratics.append((-2 * r.real, abs(r) ** 2))',
		'',
		'for a, b in quadratics:',
		'    print("s^2 + a s + b: a =", a, " b =", b)',
		bp ? 'print("numerator =", Kn * B ** n, "* s **", n)' : 'print("numerator =", 1.0, "* (s^2 + wc^2) **", n)',
		''
	].join('\n');
}

/** Step 5 in Python: wn and Q of each factor, and K. */
export function pythonStages(ctx) {
	const { s4, s5 } = ctx;
	return [
		'import math',
		'',
		`numerator = ${py(s4.numerator.coef)}  # the coefficient on top of H_d(s)`,
		'# each stage: kind, then (a, b) for s^2 + a s + b or (p,) for s + p',
		'stages = [',
		...s5.stages.map((st) => `    ("${st.kind}", ${st.order === 1 ? `(${py(st.p)},)` : `(${py(st.factor.a)}, ${py(st.factor.b)})`}),`),
		']',
		'',
		'product = 1.0',
		'for i, (kind, f) in enumerate(stages, start=1):',
		'    if len(f) == 1:',
		'        p = f[0]',
		'        print(f"stage {i}: p =", p)',
		'        product *= p if kind == "lowpass" else 1.0',
		'        continue',
		'    a, b = f',
		'    wn = math.sqrt(b)',
		'    Q = wn / a',
		'    print(f"stage {i}: wn =", wn, " Q =", Q)',
		'    # the stage numerator in the standard form',
		'    product *= {"lowpass": wn**2, "bandpass": wn / Q}.get(kind, 1.0)',
		'',
		'print("K =", numerator / product)',
		''
	].join('\n');
}

/** Step 6 in Python: sympy solves the topology's equations for the chosen capacitors. */
export function pythonComponents(topology, stage, caps) {
	const c = (nm) => py(caps[nm]);
	const head = ['import sympy as sp', ''];
	const target = stage.order === 1 ? [`p = ${py(stage.p)}  # rad/s, the corner`] : [`wn = ${py(stage.wn)}  # rad/s`, `Q = ${py(stage.q)}`];
	// `none`: what to print when these capacitors leave no real solution
	const show = (names, none = null) => [
		`sols = sp.solve(eqs, [${names.join(', ')}], dict=True)`,
		'for sol in sols:',
		`    print(${names.map((nm) => `"${nm} =", float(sol[${nm}])`).join(', ')})`,
		...(none ? ['if not sols:', `    print(${none})`] : [])
	];
	switch (topology) {
		case 'sallenKey':
			return [
				...head,
				...target,
				`Ctop, Cbottom = ${c('Ctop')}, ${c('Cbottom')}  # F, the capacitors chosen`,
				'R1, R2 = sp.symbols("R1 R2", positive=True)',
				'',
				'# 1 / (a s^2 + b s + 1) against 1 / (s^2/wn^2 + s/(wn Q) + 1)',
				'eqs = [sp.Eq(R1*R2*Ctop*Cbottom, 1/wn**2), sp.Eq((R1 + R2)*Cbottom, 1/(wn*Q))]',
				'sols = sp.solve(eqs, [R1, R2], dict=True)',
				'for sol in sols:',
				'    print("R1 =", float(sol[R1]), "R2 =", float(sol[R2]))',
				'if not sols:',
				'    # Ctop/Cbottom under 4 Q^2: equal resistors set wn, and Q follows the ratio',
				'    R = 1 / (wn * (Ctop*Cbottom) ** 0.5)',
				'    print("R1 =", R, "R2 =", R, "Q =", 0.5 * (Ctop/Cbottom) ** 0.5)',
				''
			].join('\n');
		case 'mfb':
			return [
				...head,
				...target,
				`C1, C2 = ${c('C1')}, ${c('C2')}  # F, the capacitors chosen`,
				'R1, R2, R3 = sp.symbols("R1 R2 R3", positive=True)',
				'',
				'a = (1/C1) * (1/R1 + 1/R2 + 1/R3)',
				'b = 1 / (R2*R3*C1*C2)',
				'c = -1 / (R1*R2*C1*C2)',
				'# s coefficient, constant term, and a DC gain c/b of -1',
				'eqs = [sp.Eq(a, wn/Q), sp.Eq(b, wn**2), sp.Eq(R3, R1)]',
				...show(['R1', 'R2', 'R3'], '"no real resistors: C1/C2 is", C1/C2, "and must reach 8 Q^2 =", 8*Q**2'),
				''
			].join('\n');
		case 'sallenKeyHp':
			return [
				...head,
				...target,
				`C1, C2 = ${c('C1')}, ${c('C2')}  # F, the capacitors chosen`,
				'Rtop, Rbottom = sp.symbols("Rtop Rbottom", positive=True)',
				'',
				'eqs = [sp.Eq((C1 + C2) / (C1*C2*Rbottom), wn/Q), sp.Eq(1 / (C1*C2*Rbottom*Rtop), wn**2)]',
				...show(['Rtop', 'Rbottom']),
				''
			].join('\n');
		case 'mfbHp':
			return [
				...head,
				...target,
				`C1, C2, C3 = ${c('C1')}, ${c('C2')}, ${c('C3')}  # F, the capacitors chosen`,
				'R1, R2 = sp.symbols("R1 R2", positive=True)',
				'',
				'eqs = [sp.Eq((C1 + C2 + C3) / (R2*C2*C3), wn/Q), sp.Eq(1 / (R1*R2*C2*C3), wn**2)]',
				...show(['R1', 'R2']),
				'print("gain far above wn =", -C1/C3)',
				''
			].join('\n');
		case 'mfbBp':
			return [
				...head,
				...target,
				`C1, C2 = ${c('C1')}, ${c('C2')}  # F, the capacitors chosen`,
				'R1, R2, R3 = sp.symbols("R1 R2 R3", positive=True)',
				'',
				'eqs = [',
				'    sp.Eq((C1 + C2) / (R3*C1*C2), wn/Q),',
				'    sp.Eq((1/R1 + 1/R2) / (R3*C1*C2), wn**2),',
				'    sp.Eq(R3*C2 / (R1*(C1 + C2)), 1),  # a gain of -1 at wn',
				']',
				...show(['R1', 'R2', 'R3'], '"no real resistors: C2/C1 is", C2/C1, "and must exceed 1/Q^2 - 1 =", 1/Q**2 - 1'),
				''
			].join('\n');
		case 'firstOrder':
		case 'firstOrderHp':
			return [...head, ...target, `C = ${c('C')}  # F, the capacitor chosen`, 'R = sp.symbols("R", positive=True)', '', 'eqs = [sp.Eq(1 / (R*C), p)]', ...show(['R']), ''].join('\n');
		default:
			return '';
	}
}

/** One realized stage as numpy polynomials, coefficients from s^2 (or s) down, written from its parts. */
function pythonStagePoly(stage, i) {
	const c = stage.components;
	const v = (nm) => py(c[nm]);
	const names = (list) => `${list.join(', ')} = ${list.map(v).join(', ')}`;
	const tag = i + 1;
	switch (stage.topology) {
		case 'sallenKey':
			return [`# stage ${tag}: Sallen-Key low-pass`, names(['R1', 'R2', 'Ctop', 'Cbottom']), `stages.append(([1.0], [R1*R2*Ctop*Cbottom, (R1 + R2)*Cbottom, 1.0]))`];
		case 'mfb':
			return [`# stage ${tag}: multiple feedback low-pass`, names(['R1', 'R2', 'R3', 'C1', 'C2']), 'stages.append(([-1/(R1*R2*C1*C2)], [1.0, (1/C1)*(1/R1 + 1/R2 + 1/R3), 1/(R2*R3*C1*C2)]))'];
		case 'sallenKeyHp':
			return [`# stage ${tag}: Sallen-Key high-pass`, names(['Rtop', 'Rbottom', 'C1', 'C2']), 'stages.append(([1.0, 0.0, 0.0], [1.0, (C1 + C2)/(C1*C2*Rbottom), 1/(C1*C2*Rbottom*Rtop)]))'];
		case 'mfbHp':
			return [`# stage ${tag}: multiple feedback high-pass`, names(['R1', 'R2', 'C1', 'C2', 'C3']), 'stages.append(([-C1/C3, 0.0, 0.0], [1.0, (C1 + C2 + C3)/(R2*C2*C3), 1/(R1*R2*C2*C3)]))'];
		case 'mfbBp':
			return [`# stage ${tag}: multiple feedback band-pass`, names(['R1', 'R2', 'R3', 'C1', 'C2']), 'stages.append(([-1/(R1*C1), 0.0], [1.0, (C1 + C2)/(R3*C1*C2), (1/R1 + 1/R2)/(R3*C1*C2)]))'];
		case 'firstOrder':
			return [`# stage ${tag}: RC low-pass and follower`, names(['R', 'C']), 'stages.append(([1.0], [R*C, 1.0]))'];
		case 'firstOrderHp':
			return [`# stage ${tag}: CR high-pass and follower`, names(['R', 'C']), 'stages.append(([R*C, 0.0], [R*C, 1.0]))'];
		case 'gainInv':
			return [`# stage ${tag}: inverting amplifier`, names(['R1', 'R2']), 'stages.append(([-R2/R1], [1.0]))'];
		case 'gainDivider':
			return [`# stage ${tag}: divider and follower`, names(['R1', 'R2']), 'stages.append(([R1/(R1 + R2)], [1.0]))'];
		case 'gainNonInv':
			return [`# stage ${tag}: non-inverting amplifier`, names(['R1', 'R2']), 'stages.append(([1 + R2/R1], [1.0]))'];
		default:
			return [];
	}
}

/** Step 7 in Python: the Bode of the reader's filter with scipy.signal.freqs, and its gain at the edges. */
export function pythonBode(spec, stages) {
	const frame = filterFrame(spec);
	const edges = spec.band ? [['fsl', spec.fsl], ['fl', spec.fl], ['fh', spec.fh], ['fsh', spec.fsh]] : [['fp', spec.fp], ['fs', spec.fs]];
	return [
		'import numpy as np',
		'import matplotlib.pyplot as plt',
		'from scipy import signal',
		'',
		'stages = []  # (numerator, denominator), coefficients from the highest power of s down',
		...stages.flatMap((st, i) => [...pythonStagePoly(st, i), '']),
		'num, den = np.array([1.0]), np.array([1.0])',
		'for b, a in stages:',
		'    num, den = np.polymul(num, b), np.polymul(den, a)',
		'',
		`f = np.logspace(np.log10(${py(frame.fMin)}), np.log10(${py(frame.fMax)}), 2000)  # Hz`,
		'w, h = signal.freqs(num, den, worN=2 * np.pi * f)',
		'gain_db = 20 * np.log10(np.abs(h))',
		'',
		'def gain_at(fe):',
		'    _, he = signal.freqs(num, den, worN=2 * np.pi * np.atleast_1d(fe))',
		'    return 20 * np.log10(np.abs(he))',
		'',
		'# the top of the passband, which the losses are measured from (as on the page)',
		`f_pass = np.concatenate([${[...peakRanges(spec).map(([a, b]) => `np.logspace(np.log10(${py(a)}), np.log10(${py(b)}), 401)`), ...peakEnds(spec).map((fe) => `[${py(fe)}]`)].join(', ')}])`,
		'top = gain_at(f_pass).max()',
		'print("top of the passband =", top, "dB")',
		'',
		'# the loss at each edge of the spec, from that top',
		`for name, fe in [${edges.map(([nm, fe]) => `("${nm}", ${py(fe)})`).join(', ')}]:`,
		'    print("loss at", name, "=", top - gain_at(fe)[0], "dB")',
		'',
		'plt.semilogx(f, gain_db)',
		...[...frame.pass, ...frame.stop].map((fe) => `plt.axvline(${py(fe)}, color="0.6", linestyle=":")`),
		'plt.xlabel("frequency (Hz)")',
		'plt.ylabel("gain (dB)")',
		'plt.grid(True, which="both", alpha=0.3)',
		'plt.savefig("bode.png", dpi=150)',
		'plt.show()',
		''
	].join('\n');
}
