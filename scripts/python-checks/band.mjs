// The band filters of filter-design.py (src/lib/filter/python/band.js,
// transform.js and bandPass.js): the cascade band-pass, the band-stop of two
// branches and its summing amplifier, the transformations into band-pass and
// notch stages, and the band-pass stages themselves (the MFB band-pass built
// for an op-amp among them). check-python.mjs runs their designs as any
// other family's, a band file's two sides, summing amplifier and shared
// input node included (bandCases and one design in eight of sweepCases;
// the whole sweep with CHECK_PYTHON_SWEEP=band).
//   circuits    the band-pass stages' rule in JavaScript (choices, figures,
//               as rule.mjs runs them) and the library's stage of a set of
//               their parts; mfbBandPass(gbw) the MFB band-pass's for an
//               op-amp of that gain-bandwidth (null: ideal)
//   bandCases   [label, args, opts]: opts as python-checks/index.mjs says
//   sweepCases  more designs over every method, response, menu, stock,
//               placement, source, typed capacitors and design index

import { LAB_KIT } from '../../src/lib/filter/eseries.js';
import { mfbBandPassActual, mfbBandPassEffective } from '../../src/lib/filter/mfbBandPass.js';
import { pageDesign } from '../lib-parts.mjs';
import { capsFor } from './rule.mjs';

/** The largest ratio of an MFB band-pass's capacitors, either way (MFB_BP_CAP_RATIO). */
const RATIO = 10;

/**
 * The circuit's own targets of an MFB band-pass built for a single-pole
 * op-amp of gain-bandwidth gbw, as the file's circuit_targets writes them
 * (the library's mfbBandPassPredistorted, the same bisection): [w0, q, gain]
 * or null.
 */
function circuitTargets(st, ratio, gbw) {
	const wt = 2 * Math.PI * gbw;
	const wn = 2 * Math.PI * st.f0;
	const bigA = wn / st.q;
	const bigB = wn * wn;
	if (!(bigA > bigB / wt && wt * wt - bigA * wt + bigB > 0)) return null;
	const circuit = (p) => {
		const b = (p * bigB) / wt;
		return [(p * bigA + bigB - b) / wt, b];
	};
	const miss = (p) => {
		const [a, b] = circuit(p);
		return wt + a + ((1 + ratio) * b) / a - p - bigA;
	};
	let lo = wt;
	let hi = 2 * wt;
	let bracketed = false;
	for (let i = 0; i < 61; i++) {
		if (miss(hi) <= 0) {
			bracketed = true;
			break;
		}
		lo = hi;
		hi = 2 * hi;
	}
	if (!bracketed) return null;
	for (let i = 0; i < 200; i++) {
		if (hi - lo <= 1e-15 * hi) break;
		const mid = (lo + hi) / 2;
		if (miss(mid) > 0) lo = mid;
		else hi = mid;
	}
	const p = (lo + hi) / 2;
	const [a, b] = circuit(p);
	const w0 = Math.sqrt(b);
	return [w0, w0 / a, (st.gain * bigA * Math.hypot(p, wn)) / wt / a];
}

/** The MFB band-pass's rule and library stage, ideal (gbw null) or built for an op-amp of gbw Hz. */
export function mfbBandPass(gbw = null) {
	return {
		*choices(st, rs, typed, capacitors) {
			const targets = new Map();
			for (const c1 of capsFor(typed, 'C1', capacitors)) {
				for (const c2 of capsFor(typed, 'C2', capacitors)) {
					let w0 = 2 * Math.PI * st.f0;
					let q = st.q;
					let g = st.gain;
					if (gbw === null) {
						if (Math.max(c1 / c2, c2 / c1) > RATIO * (1 + 1e-9) || g >= q * q * (1 + c2 / c1)) continue;
					} else {
						const ratio = c2 / c1;
						if (Math.max(c1 / c2, ratio) > RATIO * (1 + 1e-9)) continue;
						if (!targets.has(ratio)) targets.set(ratio, circuitTargets(st, ratio, gbw));
						const t = targets.get(ratio);
						if (t === null) continue;
						[w0, q, g] = t;
						if (g >= q * q * (1 + ratio) || gbw / (((1 + q * q * (1 + ratio)) * w0) / (2 * Math.PI)) < 2) continue;
					}
					const r1 = q / (g * w0 * c1);
					if (r1 > rs) {
						const r2 = 1 / ((w0 / q) * (q * q * (c1 + c2) - g * c1));
						const r3 = (q * (c1 + c2)) / (w0 * c1 * c2);
						yield { R1: r1 - rs, R2: r2, R3: r3, C1: c1, C2: c2 };
					}
				}
			}
		},
		figures(p, rs) {
			const r1 = rs + p.R1;
			const a = (p.C1 + p.C2) / (p.R3 * p.C1 * p.C2);
			const w0 = Math.sqrt((1 / r1 + 1 / p.R2) / (p.R3 * p.C1 * p.C2));
			const gain = (-p.R3 * p.C2) / (r1 * (p.C1 + p.C2));
			return { f0: w0 / (2 * Math.PI), q: w0 / a, gain };
		},
		// (the library reads a stage built for an op-amp from its parts with that op-amp, mfbBandPassResponse)
		stage: (p) => ({ topology: 'mfbBp', order: 2, components: { ...p }, actual: gbw === null ? mfbBandPassActual(p) : { ...mfbBandPassEffective(p, gbw), gbw } })
	};
}

export const circuits = {
	mfb_bandpass: mfbBandPass(null),
	tow_thomas_bandpass: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			for (const c of capsFor(typed, 'C', capacitors)) {
				const r = 1 / (w0 * c);
				const rd = st.q * r;
				const r1 = rd / st.gain;
				if (r1 > rs) yield { R1: r1 - rs, Ra: r, Rb: r, Rd: rd, C1: c, C2: c, r: 10e3 };
			}
		},
		figures(p, rs) {
			const w0 = 1 / Math.sqrt(p.Ra * p.Rb * p.C1 * p.C2);
			const q = w0 * p.C1 * p.Rd;
			return { f0: w0 / (2 * Math.PI), q, gain: -p.Rd / (rs + p.R1) };
		},
		// (Ra and Rb rounded apart: the library's figures of the loop, 1 / sqrt(Ra Rb C1 C2), wn C1 Rd)
		stage(p) {
			const wn = 1 / Math.sqrt(p.Ra * p.Rb * p.C1 * p.C2);
			return { topology: 'towThomasBp', order: 2, components: { ...p }, actual: { wn, q: wn * p.C1 * p.Rd, gain: -p.Rd / p.R1 } };
		}
	}
};

/* ------------------------------------------------------------- the designs */

const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
const LAB_R = { resistorStock: LAB_KIT.resistors, capacitorStock: null };
const E24 = { resistorStock: 'E24', capacitorStock: null };
const E96 = { resistorStock: 'E96', capacitorStock: null };
const CUSTOM = { resistorStock: [1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3, 220e3, 470e3], capacitorStock: [100e-12, 1e-9, 10e-9, 100e-9] };
const STOCKS = { 'lab kit': KIT, 'lab resistors': LAB_R, E24, E96, 'a list on hand': CUSTOM };

/** The page's band-pass and band-stop of panel 01 (lib-parts.mjs fills the sides' fields from these). */
export const BP = { filterType: 'bandpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, orderHp: null, orderLp: null, topology: 'mfb', ...KIT, sourceR: 50 };
export const BS = { filterType: 'bandstop', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, orderHp: null, orderLp: null, topology: 'mfb', ...KIT, sourceR: 50 };
const NARROW = { ...BP, fl: 40000, fh: 60000, fsl: 10000, fsh: 100000, aminDbHp: 50, aminDbLp: 30 };
const TRANSFORMED = { bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor' };
/** A transformed band-pass whose minimum order is lowered (bandEquirippleFit), its order set one over it on the page. */
const LOWERED = { ...BP, ...E24, ...TRANSFORMED, response: 'inverseChebyshev', amaxDb: 0.25, aminDbHp: 55.9, aminDbLp: 14.8, fl: 12500, fh: 124000, fsl: 1290, fsh: 304000, topologyBand: 'towThomas', topologyNotch: 'towThomas', sourceR: 0, orderBand: 5 };
const OPAMPS = { TL082: { opampGbw: 3450000, mfbOpamp: 'TL082' }, LM741: { opampGbw: 1000000, mfbOpamp: 'LM741' }, ideal: { mfbOpamp: 'ideal' }, other: { opampGbw: 8000000, mfbOpamp: 'other' } };

/**
 * The designs the band block runs: [label, args, opts], args as the page's
 * downloadScript passes them (lib-parts.mjs fills in the rest). opts.guards
 * edits the file and expects its message, opts.plot runs it with matplotlib.
 */
export const bandCases = [
	['the default band-pass: cascade, Butterworth, MFB, lab kit, 50 ohm', BP, { plot: true, guards: [['order_hp', '5', /odd order needs a first-order stage/]] }],
	['band-pass cascade centred, E24, ideal source', { ...BP, ...E24, sourceR: 0, placement: 'centred' }],
	['band-pass cascade, Chebyshev 1 dB high-pass and Bessel low-pass', { ...BP, responseHp: 'chebyshev', responseLp: 'bessel', amaxDbHp: 1, amaxDbLp: 3, aminDbLp: 20 }, { guards: [['amax_lp', '1.0', /Bessel losses here are the page's/]] }],
	['band-pass cascade, a low-pass section of order 1', { ...BP, fsh: 300000, aminDbLp: 20 }, { guards: [['order_lp', '3', /An order over 1 needs second-order stages/]] }],
	['band-pass cascade, two Amax (the sloped limit), E96', { ...BP, ...E96, amaxDbHp: 1, amaxDbLp: 3 }],
	['band-pass cascade, Legendre, lab resistors, design 2', { ...BP, ...LAB_R, response: 'legendre', designIndex: 1 }],
	['band-pass cascade, odd orders, a list on hand, pairs', { ...BP, ...CUSTOM, fsl: 200, aminDbHp: 50, resistorPairs: true }],
	['band-pass cascade, 10 nF typed for stage 1', { ...BP, capOverrides: { 0: { C: 10e-9 } } }],
	['band-pass cascade, Sallen-Key sides', { ...BP, topology: 'sallenKey', response: 'chebyshev', amaxDb: 1 }],
	['band-pass cascade, Tow-Thomas sides, lab resistors', { ...BP, ...LAB_R, topology: 'towThomas' }],
	['band-pass cascade, elliptic sides on Boctor, E24', { ...BP, ...E24, response: 'elliptic', amaxDb: 1, topology: 'boctor' }],
	// (one side's prototype with zeros, the other's without: one loss_db reads both shapes)
	['band-pass cascade, an elliptic high-pass and a Legendre low-pass section', { ...BP, responseHp: 'elliptic', responseLp: 'legendre', amaxDb: 1, topologyHp: 'towThomas', topologyLp: 'mfb' }],
	['band-stop of two branches, a Bessel low-pass and an inverse Chebyshev high-pass branch, 600 ohm, centred', { ...BS, responseLp: 'bessel', responseHp: 'inverseChebyshev', aminDb: 30, topologyLp: 'sallenKey', topologyHp: 'boctor', sourceR: 600, placement: 'centred' }],
	// (an order edited in SETTINGS: the page's parts split into their own branches, page_lp_count, checked as before)
	['the default band-stop of two branches, lab kit, 50 ohm', BS, { plot: true, guards: [['order_lp', '7', null, { samePage: true }], ['order_lp', '3', null, { samePage: true }], ['amin', '30.0', null]] }],
	['band-stop of two branches, 600 ohm on the shared node', { ...BS, sourceR: 600 }],
	['band-stop of two branches centred, E24, ideal source', { ...BS, ...E24, sourceR: 0, placement: 'centred' }],
	['band-stop of two branches, Bessel, Sallen-Key, E96', { ...BS, ...E96, response: 'bessel', aminDb: 30, topology: 'sallenKey' }],
	['band-stop of two branches, Tow-Thomas, lab resistors, 600 ohm', { ...BS, ...LAB_R, topology: 'towThomas', sourceR: 600 }],
	['band-stop of two branches, elliptic on Boctor, a stage the page leaves unbuilt', { ...BS, ...E24, response: 'elliptic', amaxDb: 1, topology: 'boctor' }],
	['band-stop of two branches, inverse Chebyshev on both Boctor forms, 600 ohm', { ...BS, ...E24, response: 'inverseChebyshev', aminDb: 30, topology: 'boctor', sourceR: 600 }],
	['band-stop of two branches, the last design of the list', { ...BS, designIndex: 'last' }],
	[
		"the page's default transformed band-pass: MFB for the LM741, lab kit",
		{ ...BP, ...TRANSFORMED, ...OPAMPS.LM741, spiceOpamp: 'TL082' },
		{
			plot: true,
			// (an op-amp too slow for the rule: the file goes on with the page's parts alone, read on that op-amp; None, an ideal one)
			guards: [['gbw', '1e7', null], ['gbw', '1e5', null, { says: /no stock choice builds it; the page's parts are checked alone/ }], ['gbw', 'None', null]]
		}
	],
	['transformed band-pass, MFB for the TL082, E24, centred', { ...BP, ...E24, ...TRANSFORMED, ...OPAMPS.TL082, placement: 'centred' }],
	['transformed band-pass, MFB for an ideal op-amp, E96, 0 ohm', { ...BP, ...E96, ...TRANSFORMED, sourceR: 0 }],
	['transformed band-pass, MFB for another op-amp, C1 and C2 typed', { ...BP, ...TRANSFORMED, ...OPAMPS.other, capOverrides: { 1: { C1: 1e-9, C2: 1e-9 } } }],
	['transformed band-pass, Tow-Thomas band-pass, lab resistors', { ...BP, ...LAB_R, ...TRANSFORMED, topologyBand: 'towThomas' }],
	['narrow band-pass transformed, TL082, lab kit, 2 pairs', { ...NARROW, ...TRANSFORMED, ...OPAMPS.TL082, resistorPairs: true, resistorPairLimit: 2 }],
	['transformed band-pass, Chebyshev centred, MFB ideal', { ...NARROW, ...E24, ...TRANSFORMED, response: 'chebyshev', amaxDb: 0.5, placement: 'centred' }],
	['transformed band-pass, Bessel, Tow-Thomas', { ...NARROW, ...E24, ...TRANSFORMED, topologyBand: 'towThomas', response: 'bessel', aminDbHp: 20, aminDbLp: 15 }, { guards: [['amax', '2.0', /Bessel losses here are the page's/]] }],
	['transformed band-pass, elliptic, Tow-Thomas notches', { ...NARROW, ...KIT, ...TRANSFORMED, response: 'elliptic', topologyBand: 'towThomas', topologyNotch: 'towThomas' }, { guards: [['order', '4', /elliptic poles here are the page's|circuits written here/], ['amax', '2.0', /elliptic poles/], ['placement', '"centred"', /elliptic poles here are the page's for n = \d+ and k = [\d.]+, a ripple of [\d.]+ dB \(amax, the edge placement\): for another order, k, amax or placement/]] }],
	['transformed band-pass, inverse Chebyshev, Boctor notches, centred', { ...NARROW, ...E24, ...TRANSFORMED, response: 'inverseChebyshev', placement: 'centred' }],
	['transformed band-stop, Boctor, E96', { ...BS, ...E96, ...TRANSFORMED }, { guards: [['order', '5', /circuits written here are the page's/]] }],
	['transformed band-stop, Boctor, lab kit, past the limits', { ...BS, ...TRANSFORMED, pastLimits: true }],
	['transformed band-stop, Chebyshev, Tow-Thomas notches, centred', { ...BS, ...E24, ...TRANSFORMED, response: 'chebyshev', amaxDb: 1, topologyNotch: 'towThomas', placement: 'centred' }],
	['transformed band-stop, elliptic, Boctor, design 2', { ...BS, ...E24, ...TRANSFORMED, response: 'elliptic', amaxDb: 1, designIndex: 1 }],
	// (an order set on the page over a lowered minimum: the page fits the stopband edge again for it; None, the
	// minimum with its own fit, until the circuits written for the page's order stop it)
	[
		'transformed band-pass, inverse Chebyshev, Tow-Thomas, E24, the order set one over its lowered minimum',
		LOWERED,
		{ guards: [['order', 'None', /circuits written here are the page's for n = 5/, { says: new RegExp(`the page's search: n = 4, the stopband edge at Omega = ${(1 / pageDesign({ ...LOWERED, orderBand: null }).orderInfo.k).toFixed(4)}`) }]] }
	],
	// (a stage at the MFB band-pass's gain ceiling, which the page builds with R2 at the stock's top: the file
	// goes on without parts of its own and checks the page's)
	['transformed band-pass, MFB for the TL082, lab kit, centred: a stage no stock choice builds', { ...BP, ...KIT, ...TRANSFORMED, ...OPAMPS.TL082, amaxDb: 3, aminDbHp: 45, aminDbLp: 65.3, fsl: 457, fl: 4390, fh: 53400, fsh: 661000, sourceR: 0, placement: 'centred' }],
	// (an elliptic prototype whose nearer stopband edge sits in its transition band, centred: the page's ripple,
	// written in, hangs on amin and the edges too)
	[
		'transformed band-stop, elliptic, Boctor, lab kit, centred, order 4: the ripple written in',
		{ ...BS, ...KIT, ...TRANSFORMED, response: 'elliptic', amaxDb: 1, aminDb: 61.5, fl: 3950, fsl: 40000, fsh: 51000, fh: 272000, orderBand: 4, placement: 'centred' },
		{ guards: [['amin', '65.5', /elliptic poles in 3 are the page's for amax = 1 dB, these band edges and limits/]] }
	]
];

/**
 * The sweep: every method with every response, menu, stock, placement and
 * source, and the typed capacitors, pairs and design indices where they
 * apply, [label, args, opts] as bandCases.
 */
export function sweepCases() {
	const out = [];
	const responses = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];
	// per response: limits the page builds within its 16 orders for the edges here
	const limits = {
		butterworth: { amaxDb: 3, aminDb: 40 },
		chebyshev: { amaxDb: 1, aminDb: 40 },
		legendre: { amaxDb: 3, aminDb: 40 },
		bessel: { amaxDb: 3, aminDb: 20 },
		inverseChebyshev: { amaxDb: 3, aminDb: 40 },
		elliptic: { amaxDb: 1, aminDb: 40 }
	};
	const stocks = Object.entries(STOCKS);
	let s = 0;
	const nextStock = () => stocks[s++ % stocks.length];
	for (const response of responses) {
		const zeros = response === 'inverseChebyshev' || response === 'elliptic';
		const sideMenus = zeros ? ['towThomas', 'boctor'] : ['mfb', 'sallenKey', 'towThomas', 'boctor'];
		for (const placement of ['edge', 'centred']) {
			for (const menu of sideMenus) {
				for (const rs of [0, 50]) {
					const [stockName, stock] = nextStock();
					const base = { ...limits[response], response, topology: menu, placement, sourceR: rs, ...stock };
					out.push([`cascade band-pass, ${response}, ${menu}, ${placement}, ${stockName}, ${rs} ohm`, { ...BP, ...base }]);
					out.push([`band-stop of two branches, ${response}, ${menu}, ${placement}, ${stockName}, ${rs === 0 ? 0 : 600} ohm`, { ...BS, ...base, sourceR: rs === 0 ? 0 : 600 }]);
				}
			}
			const bandMenus = ['mfb', 'towThomas'];
			for (const band of bandMenus) {
				for (const notch of zeros ? ['boctor', 'towThomas'] : ['boctor']) {
					for (const [opName, op] of band === 'mfb' ? Object.entries(OPAMPS) : [['', {}]]) {
						const [stockName, stock] = nextStock();
						const rs = out.length % 2 ? 50 : 0;
						const base = { ...limits[response], response, placement, sourceR: rs, ...stock, ...TRANSFORMED, topologyBand: band, topologyNotch: notch, ...op };
						const words = `${response}, ${band}${opName ? ` for ${opName}` : ''}${zeros ? `, ${notch} notches` : ''}, ${placement}, ${stockName}, ${rs} ohm`;
						out.push([`transformed band-pass, ${words}`, { ...BP, ...base }]);
						out.push([`transformed narrow band-pass, ${words}`, { ...NARROW, ...base, aminDbHp: limits[response].aminDb, aminDbLp: Math.max(limits[response].amaxDb + 10, limits[response].aminDb - 10) }]);
						if (band === 'mfb' && opName === 'ideal') out.push([`transformed band-stop, ${response}, ${notch} notches, ${placement}, ${stockName}, ${rs} ohm`, { ...BS, ...base, topologyNotch: notch }]);
					}
				}
			}
		}
	}
	// typed capacitors, pairs under a limit, the design list and the parts past the limits
	for (const [label, args] of [
		['cascade band-pass', BP],
		['band-stop of two branches', BS],
		['transformed band-pass, LM741', { ...BP, ...TRANSFORMED, ...OPAMPS.LM741 }],
		['transformed band-stop', { ...BS, ...TRANSFORMED }]
	]) {
		const mfbBp = args.bandMethod === 'transformed' && args.filterType === 'bandpass';
		const notch = args.bandMethod === 'transformed' && args.filterType === 'bandstop';
		out.push([`${label}, a capacitor typed for stage 1`, { ...args, capOverrides: { 0: mfbBp ? { C1: 10e-9, C2: 10e-9 } : notch ? { C: 10e-9 } : { C: 10e-9 } } }]);
		out.push([`${label}, a capacitor typed for stage 2`, { ...args, capOverrides: { 1: mfbBp ? { C1: 1e-9 } : { C: 1e-9 } } }]);
		out.push([`${label}, pairs`, { ...args, resistorPairs: true }]);
		out.push([`${label}, up to 1 pair`, { ...args, resistorPairs: true, resistorPairLimit: 1 }]);
		out.push([`${label}, a list on hand, up to 3 pairs`, { ...args, ...CUSTOM, resistorPairs: true, resistorPairLimit: 3 }]);
		out.push([`${label}, design 2`, { ...args, designIndex: 1 }]);
		out.push([`${label}, design 3, centred`, { ...args, designIndex: 2, placement: 'centred' }]);
		out.push([`${label}, the last design`, { ...args, designIndex: 'last' }]);
		out.push([`${label}, the parts past the limits`, { ...args, pastLimits: true }]);
		out.push([`${label}, orders set on the page`, args.bandMethod ? { ...args, orderBand: 5 } : { ...args, orderHp: 5, orderLp: 6 }]);
	}
	return out;
}

// (strict: the file's H(s) are the page's figures to rounding, so both measures agree to 1e-6 dB, not only
// 0.01. Every run: bandCases, and of the sweep one design in eight and the first of each method and
// response; CHECK_PYTHON_SWEEP=band the rest of it too)
const SWEEP = sweepCases().map(([label, args, opts]) => [`sweep: ${label}`, args, opts]);
const kinds = new Set();
const sampled = SWEEP.map(([, args], i) => {
	const kind = `${args.filterType} ${args.bandMethod ?? 'cascade'} ${args.response}`;
	const first = !kinds.has(kind);
	kinds.add(kind);
	return i % 8 === 0 || first;
});
export default {
	name: 'band filters',
	key: 'band',
	strict: true,
	circuits,
	cases: [...bandCases, ...SWEEP.filter((_, i) => sampled[i])],
	sweep: SWEEP.filter((_, i) => !sampled[i])
};
