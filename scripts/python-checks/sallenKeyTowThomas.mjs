// The Sallen-Key and Tow-Thomas stages of a low-pass and a high-pass, without
// a zero (src/lib/filter/python/sallenKey.js, towThomas.js), with the
// first-order stage of an odd order (mfb.mjs's rc circuits): their rule
// written again in JavaScript (choices, figures, as rule.mjs runs them), the
// library's stage of a set of their parts (for the library's measure of the
// file's own parts), the designs the check runs them on, and bandChecks(),
// the family's H(s) and input admittances alone on the page's parts of band
// filters built with them (check-python.mjs runs it in a block of its own).

import { responseAtParallelSum } from '../../src/lib/filter/bode.js';
import { LAB_KIT } from '../../src/lib/filter/eseries.js';
import { realizeStage, TOPOLOGIES } from '../../src/lib/filter/handDesign.js';
import { nodalResponse, nodalSolve } from '../../src/lib/filter/nodal.js';
import { pythonRegistry } from '../../src/lib/filter/python/index.js';
import { sallenKeyLowPassFromParts } from '../../src/lib/filter/sallenKey.js';
import { sallenKeyHighPassFromParts } from '../../src/lib/filter/sallenKeyHighPass.js';
import { stageElements } from '../../src/lib/filter/stageElements.js';
import { towThomasFromParts } from '../../src/lib/filter/towThomas.js';
import { pageDesign, pageParts } from '../lib-parts.mjs';
import { runFile } from '../lib-python.mjs';
import { capsFor } from './rule.mjs';

/** Throws unless two stages' figures (wn, q, gain) agree to 1e-12. */
function sameFigures(what, got, want) {
	for (const key of ['wn', 'q', 'gain']) if (Math.abs(got[key] / want[key] - 1) > 1e-12) throw new Error(`${what}: ${key} ${got[key]} against the library's ${want[key]}`);
}

/**
 * A Tow-Thomas stage of the file's parts, from the textbook figures of its
 * loop (Ra and Rb may differ, R1 too), checked against the library's own
 * towThomasFromParts where the parts have its form (R1 = Ra = Rb).
 */
function towThomasStage(p, st, highPass) {
	const wn = 1 / Math.sqrt(p.C1 * p.C2 * p.Ra * p.Rb);
	const actual = { wn, q: wn * p.C1 * p.Rd, gain: highPass ? -p.Cin / p.C1 : p.Ra / p.R1 };
	const built = { topology: highPass ? 'towThomasHp' : 'towThomas', order: 2, components: { ...p }, actual };
	const libraryForm = p.C1 === p.C2 && p.Ra === p.Rb && (highPass ? p.Cin === p.C1 : p.R1 === p.Ra);
	if (libraryForm) {
		const w = 2 * Math.PI * st.f0;
		const lib = towThomasFromParts(w, st.q, { C: p.C1, Rtarget: p.Ra, RdIdeal: p.Rd, R: p.Ra, Rd: p.Rd }, { highPass, resistorSeries: [p.r] });
		sameFigures(built.topology, actual, lib.actual);
		if (JSON.stringify(lib.components) !== JSON.stringify(p)) throw new Error(`${built.topology}: parts ${JSON.stringify(p)} against the library's ${JSON.stringify(lib.components)}`);
	}
	return built;
}

export const circuits = {
	sallen_key_lowpass: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			const pairs = capsFor(typed, 'Ctop', capacitors).flatMap((ctop) => capsFor(typed, 'Cbottom', capacitors).map((cbottom) => [ctop, cbottom]));
			let exact = false;
			for (const [ctop, cbottom] of pairs) {
				const total = 1 / (w0 * st.q * cbottom);
				const product = 1 / (w0 * w0 * ctop * cbottom);
				const disc = total * total - 4 * product;
				if (disc < 0) continue;
				for (const r of [(total + Math.sqrt(disc)) / 2, (total - Math.sqrt(disc)) / 2]) {
					if (!(r > rs)) continue;
					exact = true;
					yield { R1: r - rs, R2: total - r, Ctop: ctop, Cbottom: cbottom };
				}
			}
			if (exact) return;
			// (no pair at 4 Q^2: the pairs of the highest ratio, equal resistors, Q short)
			const top = Math.max(...pairs.map(([ctop, cbottom]) => ctop / cbottom));
			for (const [ctop, cbottom] of pairs) {
				const r = 1 / (w0 * Math.sqrt(ctop * cbottom));
				if (ctop / cbottom === top && r > rs) yield { R1: r - rs, R2: r, Ctop: ctop, Cbottom: cbottom };
			}
		},
		figures(p, rs) {
			const r1 = rs + p.R1;
			const w0 = 1 / Math.sqrt(r1 * p.R2 * p.Ctop * p.Cbottom);
			return { f0: w0 / (2 * Math.PI), q: 1 / (w0 * (r1 + p.R2) * p.Cbottom) };
		},
		// (the page's Sallen-Key low-pass keeps R1 = R2; the file's takes two different ones, so the
		// stage is the hand method's realizeStage of its four parts, and checked against the library's
		// own where R1 = R2)
		stage(p, st) {
			const built = realizeStage('sallenKey', p);
			if (p.R1 === p.R2) sameFigures('sallen_key_lowpass', built.actual, sallenKeyLowPassFromParts(2 * Math.PI * st.f0, st.q, { Ctop: p.Ctop, Cbottom: p.Cbottom, Rtarget: p.R1, R: p.R1 }).actual);
			return built;
		}
	},
	sallen_key_highpass: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			for (const c of capsFor(typed, 'C', capacitors)) {
				const rtop = 1 / (2 * st.q * w0 * c);
				yield { Rtop: rtop, Rbottom: 4 * st.q * st.q * rtop, C1: c, C2: c };
			}
		},
		figures(p) {
			const w0 = 1 / Math.sqrt(p.Rtop * p.Rbottom * p.C1 * p.C2);
			return { f0: w0 / (2 * Math.PI), q: (w0 * p.C1 * p.C2 * p.Rbottom) / (p.C1 + p.C2) };
		},
		stage(p, st) {
			if (p.C1 !== p.C2) throw new Error('sallen_key_highpass: two different capacitors');
			const lib = sallenKeyHighPassFromParts(2 * Math.PI * st.f0, st.q, { C: p.C1, Rtop: p.Rtop, Rbottom: p.Rbottom, RtopN: p.Rtop, RbottomN: p.Rbottom });
			sameFigures('sallen_key_highpass', lib.actual, TOPOLOGIES.sallenKeyHp.actual(p));
			return lib;
		}
	},
	tow_thomas_lowpass: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			for (const c of capsFor(typed, 'C', capacitors)) {
				const r = 1 / (w0 * c);
				if (r > rs) yield { R1: r - rs, Ra: r, Rb: r, Rd: st.q * r, C1: c, C2: c, r: 10e3 };
			}
		},
		figures(p, rs) {
			const w0 = 1 / Math.sqrt(p.C1 * p.C2 * p.Ra * p.Rb);
			return { f0: w0 / (2 * Math.PI), q: w0 * p.C1 * p.Rd, gain: p.Ra / (rs + p.R1) };
		},
		stage: (p, st) => towThomasStage(p, st, false)
	},
	tow_thomas_highpass: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			for (const c of capsFor(typed, 'C', capacitors)) {
				const r = 1 / (w0 * c);
				yield { Cin: c, Ra: r, Rb: r, Rd: st.q * r, C1: c, C2: c, r: 10e3 };
			}
		},
		figures(p) {
			const w0 = 1 / Math.sqrt(p.C1 * p.C2 * p.Ra * p.Rb);
			return { f0: w0 / (2 * Math.PI), q: w0 * p.C1 * p.Rd, gain: -p.Cin / p.C1 };
		},
		stage: (p, st) => towThomasStage(p, st, true)
	}
};

const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };

/**
 * The stocks of the page's stock picker: the two series, the lab kit, its
 * resistors with the E6 capacitors, and two lists on hand, the second
 * without 10 kohm (the inverter of a Tow-Thomas then takes its neighbour).
 */
const STOCKS = [
	['E24', { resistorStock: 'E24', capacitorStock: null }],
	['E96', { resistorStock: 'E96', capacitorStock: null }],
	['lab kit', KIT],
	['lab resistors', { resistorStock: LAB_KIT.resistors, capacitorStock: null }],
	['a list on hand', { resistorStock: [1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3, 220e3, 470e3], capacitorStock: [100e-12, 1e-9, 10e-9, 100e-9] }],
	['a list without 10 kohm', { resistorStock: [1.5e3, 3.3e3, 6.8e3, 15e3, 33e3, 68e3, 150e3, 330e3, 680e3], capacitorStock: [220e-12, 470e-12, 2.2e-9, 4.7e-9, 22e-9, 47e-9] }]
];
const [E24, E96, LAB, LABR, LIST, LIST2] = STOCKS;

/** Specs [fs / fp (fp / fs for a high-pass), amax, amin] of each response, their minimum orders 2 to 7 in that order. */
const SPECS = {
	butterworth: [[5, 3, 20], [2.5, 3, 20], [3, 3, 30], [3, 1, 40], [2.5, 1, 40], [2.5, 2, 50]],
	chebyshev: [[2.5, 3, 20], [3, 1, 30], [2.5, 1, 30], [2, 1, 40], [2, 0.5, 50], [1.5, 1, 40]],
	bessel: [[5, 3, 20], [3.5, 3, 20], [5, 2, 30], [3.5, 3, 30], [5, 3, 50], [3.5, 3, 40]],
	legendre: [[3.5, 3, 20], [3, 2, 30], [2.5, 3, 30], [2, 3, 40], [2, 1, 40], [2, 0.5, 50]]
};
const RESPONSES = Object.keys(SPECS);
const FREQS = [30, 200, 1000, 4700, 10000, 33000, 120000];
const TYPES = ['lowpass', 'highpass'];
const MENU = { sallenKey: 'Sallen-Key', towThomas: 'Tow-Thomas', boctor: 'Tow-Thomas (Boctor menu)' };

/** A design's arguments, as the page's downloadScript passes them, and its label: [label, args]. */
function design(type, topology, response, [stockName, stock], { spec = 0, fp = 1000, placement = 'edge', sourceR = 50, ...more } = {}) {
	const [ratio, amaxDb, aminDb] = SPECS[response][spec];
	const lp = type === 'lowpass';
	const args = { filterType: type, response, amaxDb, aminDb, fp, fs: lp ? fp * ratio : fp / ratio, order: null, topology, ...stock, sourceR, placement, ...more };
	return [`${MENU[topology]} ${lp ? 'low' : 'high'}-pass, ${response} ${amaxDb}/${aminDb} dB at ${ratio}:1, fp ${fp} Hz, ${stockName}, ${placement}, ${sourceR} ohm`, args];
}

/** The same design with more arguments, its label saying what they are. */
const also = ([label, args], more, words) => [`${label}, ${words}`, { ...args, ...more }];

const out = [];

// (1) every type, menu, response and stock, twice: on the edge and centred, the source 0 and
// 50 ohm the other way round the second time, the orders 2 to 7 and fp from 30 Hz to 120 kHz
// turning at their own rates; a quarter of the Tow-Thomas designs on the Boctor menu, whose
// stages without a zero are Tow-Thomas
let j = 0;
for (const type of TYPES) {
	for (const family of ['sallenKey', 'towThomas']) {
		for (const response of RESPONSES) {
			for (const stock of STOCKS) {
				const topology = family === 'towThomas' && j % 4 === 3 ? 'boctor' : family;
				for (const pass of [0, 1]) {
					out.push(design(type, topology, response, stock, { spec: (j + 3 * pass) % 6, fp: FREQS[(3 * j + 5 * pass) % 7], placement: pass ? 'centred' : 'edge', sourceR: (j + pass) % 2 ? 50 : 0 }));
				}
				j++;
			}
		}
	}
}

// (2) pairs of resistors in series on every list: no limit, a limit of 1 and of 2
j = 0;
for (const type of TYPES) {
	for (const family of ['sallenKey', 'towThomas']) {
		for (const stock of [LAB, LABR, LIST, LIST2]) {
			for (const limit of [null, 1, 2]) {
				const base = design(type, family, RESPONSES[j % 4], stock, { spec: (j + 1) % 6, fp: FREQS[(2 * j + 1) % 7], placement: j % 3 ? 'edge' : 'centred', sourceR: j % 2 ? 0 : 50 });
				out.push(also(base, { resistorPairs: true, resistorPairLimit: limit }, limit === null ? 'pairs' : `up to ${limit} pair${limit > 1 ? 's' : ''}`));
				j++;
			}
		}
	}
}

// (3) capacitors typed on the page: Ctop and Cbottom of a Sallen-Key low-pass (both, one alone,
// a pair under 4 Q^2 that its rule cannot use), C of the other circuits and of an RC stage, on
// one stage or several, values off the stock too
const typed = (base, capOverrides, words) => also(base, { capOverrides }, words);
out.push(
	typed(design('lowpass', 'sallenKey', 'butterworth', LAB, { spec: 2 }), { 0: { Ctop: 100e-9, Cbottom: 10e-9 } }, 'Ctop and Cbottom typed for stage 1'),
	typed(design('lowpass', 'sallenKey', 'butterworth', LAB, { spec: 2, placement: 'centred', sourceR: 0 }), { 0: { Ctop: 47e-9 } }, 'Ctop typed for stage 1'),
	typed(design('lowpass', 'sallenKey', 'chebyshev', E24, { spec: 2 }), { 0: { Cbottom: 1e-9 } }, 'Cbottom typed for stage 1'),
	typed(design('lowpass', 'sallenKey', 'chebyshev', E24, { spec: 2, fp: 4700, sourceR: 0 }), { 0: { Ctop: 10e-9, Cbottom: 10e-9 } }, 'Ctop and Cbottom typed under 4 Q^2'),
	typed(design('lowpass', 'sallenKey', 'legendre', LABR, { spec: 3, fp: 10000 }), { 1: { Ctop: 10e-9, Cbottom: 1e-9 } }, 'Ctop and Cbottom typed for stage 2'),
	typed(design('lowpass', 'sallenKey', 'bessel', LAB, { spec: 1, fp: 200, placement: 'centred' }), { 0: { Ctop: 3.9e-9, Cbottom: 1e-9 }, 1: { C: 10e-9 } }, 'Ctop off the stock for stage 1, C for the RC stage'),
	typed(design('highpass', 'sallenKey', 'butterworth', LAB, { spec: 2 }), { 0: { C: 10e-9 } }, 'C typed for stage 1'),
	typed(design('highpass', 'sallenKey', 'chebyshev', E24, { spec: 3, fp: 33000, placement: 'centred', sourceR: 0 }), { 1: { C: 1e-9 } }, 'C typed for the RC stage'),
	typed(design('highpass', 'sallenKey', 'legendre', LABR, { spec: 2, fp: 200 }), { 0: { C: 39e-9 }, 1: { C: 100e-9 } }, 'C off the stock for stage 1, C for stage 2'),
	typed(design('highpass', 'sallenKey', 'bessel', LAB, { spec: 1, fp: 4700, sourceR: 0 }), { 0: { C: 1e-9 }, 1: { C: 4.7e-9 } }, 'C typed for both stages'),
	typed(design('lowpass', 'towThomas', 'butterworth', LAB, { spec: 2 }), { 0: { C: 10e-9 } }, 'C typed for stage 1'),
	typed(design('lowpass', 'towThomas', 'chebyshev', E24, { spec: 3, fp: 4700, placement: 'centred', sourceR: 0 }), { 1: { C: 2.2e-9 }, 2: { C: 2.2e-9 } }, 'C typed for stage 2 and the RC stage'),
	typed(design('lowpass', 'towThomas', 'legendre', LABR, { spec: 2, fp: 33000 }), { 0: { C: 390e-12 } }, 'C off the stock for stage 1'),
	typed(design('lowpass', 'boctor', 'bessel', LAB, { spec: 2, fp: 200, sourceR: 0 }), { 0: { C: 100e-9 }, 1: { C: 47e-9 } }, 'C typed for both stages'),
	typed(design('highpass', 'towThomas', 'butterworth', LAB, { spec: 2 }), { 0: { C: 10e-9 } }, 'C typed for stage 1'),
	typed(design('highpass', 'towThomas', 'chebyshev', E24, { spec: 1, fp: 10000, placement: 'centred' }), { 1: { C: 3.3e-9 } }, 'C typed for the RC stage'),
	typed(design('highpass', 'towThomas', 'legendre', LABR, { spec: 3, fp: 120000, sourceR: 0 }), { 0: { C: 150e-12 }, 1: { C: 220e-12 } }, 'C typed for both stages'),
	typed(design('highpass', 'boctor', 'bessel', LAB, { spec: 4, fp: 30 }), { 2: { C: 100e-9 } }, 'C typed for stage 3'),
	typed(design('lowpass', 'sallenKey', 'butterworth', LIST, { spec: 3, fp: 4700, resistorPairs: true }), { 0: { Ctop: 100e-9, Cbottom: 1e-9 } }, 'pairs, Ctop and Cbottom typed for stage 1'),
	typed(design('highpass', 'towThomas', 'butterworth', LIST2, { spec: 3, fp: 4700, resistorPairs: true, resistorPairLimit: 1 }), { 0: { C: 4.7e-9 } }, 'up to 1 pair, C typed for stage 1')
);

// (4) the "Next design" list: its second design and its last
j = 0;
for (const type of TYPES) {
	for (const family of ['sallenKey', 'towThomas']) {
		for (const index of [1, 'last']) {
			for (const k of [0, 1, 2]) {
				const base = design(type, family, RESPONSES[(j + k) % 4], [E24, E96, LABR, LAB, LIST][(j + k) % 5], { spec: (j + 2 * k) % 6, fp: FREQS[(j + 3 * k) % 7], placement: (j + k) % 2 ? 'centred' : 'edge', sourceR: k === 1 ? 0 : 50 });
				out.push(also(base, { designIndex: index }, index === 1 ? 'design 2 of the list' : 'the last design of the list'));
			}
			j++;
		}
	}
}

// (5) the parts past the limits, where the best set within them misses the template and the page
// offers a set past them that meets it
const past = (type, topology, response, amaxDb, aminDb, fp, fs, [stockName, stock], sourceR, placement) => [
	`${MENU[topology]} ${type === 'lowpass' ? 'low' : 'high'}-pass, ${response} ${amaxDb}/${aminDb} dB, fp ${fp} Hz, fs ${fs} Hz, ${stockName}, ${placement}, ${sourceR} ohm, the parts past the limits`,
	{ filterType: type, response, amaxDb, aminDb, fp, fs, order: null, topology, ...stock, sourceR, placement, pastLimits: true }
];
out.push(
	past('highpass', 'towThomas', 'butterworth', 3, 30, 1000, 400, E24, 0, 'centred'),
	past('lowpass', 'towThomas', 'legendre', 0.5, 40, 1000, 2500, LAB, 50, 'edge'),
	past('lowpass', 'sallenKey', 'butterworth', 0.5, 20, 1e6, 2.5e6, E96, 0, 'edge'),
	past('lowpass', 'towThomas', 'legendre', 3, 20, 1e6, 2.5e6, LABR, 50, 'centred'),
	past('highpass', 'sallenKey', 'butterworth', 0.5, 30, 1e6, 5e5, LABR, 50, 'edge'),
	past('lowpass', 'towThomas', 'chebyshev', 1, 40, 1e6, 2e6, LAB, 0, 'centred'),
	past('highpass', 'sallenKey', 'legendre', 3, 30, 1e6, 5e5, LABR, 0, 'centred'),
	past('highpass', 'towThomas', 'chebyshev', 1, 40, 2, 0.8, E24, 0, 'centred'),
	past('lowpass', 'sallenKey', 'legendre', 0.5, 40, 1e6, 2e6, LAB, 0, 'centred'),
	past('lowpass', 'towThomas', 'chebyshev', 3, 40, 1e5, 2e5, LAB, 0, 'edge'),
	past('lowpass', 'sallenKey', 'chebyshev', 0.5, 40, 3e5, 7.5e5, E96, 0, 'edge'),
	past('lowpass', 'towThomas', 'bessel', 3, 40, 0.5, 2.5, LAB, 0, 'edge')
);

// (6) the order set on the page, odd and even, and a 600 ohm source
const ordered = (base, order) => also(base, { order }, `order ${order} set on the page`);
out.push(
	ordered(design('lowpass', 'sallenKey', 'butterworth', LAB, { spec: 2 }), 5),
	ordered(design('highpass', 'sallenKey', 'chebyshev', E24, { spec: 1, fp: 4700, sourceR: 0 }), 4),
	ordered(design('lowpass', 'towThomas', 'legendre', LABR, { spec: 2, fp: 10000, placement: 'centred' }), 5),
	ordered(design('highpass', 'towThomas', 'bessel', LAB, { spec: 1, fp: 200 }), 4),
	ordered(design('lowpass', 'boctor', 'chebyshev', E96, { spec: 0, fp: 33000, sourceR: 0 }), 3),
	ordered(design('highpass', 'sallenKey', 'bessel', LIST, { spec: 0 }), 3),
	design('lowpass', 'sallenKey', 'chebyshev', LAB, { spec: 2, sourceR: 600 }),
	design('highpass', 'sallenKey', 'butterworth', E24, { spec: 3, fp: 4700, sourceR: 600, placement: 'centred' }),
	design('lowpass', 'towThomas', 'butterworth', LABR, { spec: 3, fp: 10000, sourceR: 600 }),
	design('highpass', 'towThomas', 'legendre', LAB, { spec: 2, fp: 200, sourceR: 600 }),
	// (Chebyshev centred far over its minimum order: a ripple of 4e-15 dB, the poles built from it as the page builds them)
	['Sallen-Key high-pass, Chebyshev 0.34/41.7 dB, fp 1.7 kHz, fs 334 Hz, order 16 set on the page, lab resistors, pairs up to 3, centred, 0 ohm', { filterType: 'highpass', response: 'chebyshev', amaxDb: 0.34, aminDb: 41.7, fp: 1700, fs: 334, order: 16, topology: 'sallenKey', ...LABR[1], resistorPairs: true, resistorPairLimit: 3, sourceR: 0, placement: 'centred' }]
);

/**
 * The designs: [label, args, opts], opts as mfb.mjs says. The guards, once
 * for each menu, type and response on a design of the grid (1): its order
 * edited to the next one (an odd order with no RC stage stops, an even one
 * past an odd runs on, Bessel's and Legendre's written-in poles stop), and
 * amax or amin edited where the order search's written-in losses hang on
 * it; the plot on the first Sallen-Key and the first Tow-Thomas design.
 */
export const cases = out.map(([label, args]) => [label, args, {}]);
const guarded = new Set();
for (const c of cases.slice(0, 192)) {
	const a = c[1];
	const key = `${a.topology} ${a.filterType} ${a.response}`;
	if (guarded.has(key)) continue;
	guarded.add(key);
	const n = pageDesign(a).n;
	const named = { bessel: 'Bessel', legendre: 'Legendre' }[a.response];
	const guards = [['order', String(n + 1), named ? new RegExp(`${named} poles here are the page's`) : n % 2 ? null : /odd order needs a first-order stage/]];
	if (named && a.filterType === 'lowpass') guards.push(['amax', '2.5', new RegExp(`${named} losses here are the page's`)]);
	if (named && a.filterType === 'highpass') guards.push(['amin', '95.0', /None of the \d+ orders written here/]);
	c[2] = { guards };
}
cases[0][2].plot = true;
cases.find(([, a]) => a.topology === 'towThomas')[2].plot = true;

/* ------------------------------------------------------------ band filters */

const BP = { filterType: 'bandpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, orderHp: null, orderLp: null, ...KIT, sourceR: 50 };
const BS = { filterType: 'bandstop', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, orderHp: null, orderLp: null, ...KIT, sourceR: 50 };

/** The band filters bandChecks reads: both methods, each side on either circuit, the sources 0, 50 and 600 ohm. */
const BANDS = [
	['band-pass, Sallen-Key both sections, lab kit, 50 ohm', { ...BP, topology: 'sallenKey' }],
	['band-pass, Tow-Thomas both sections, E24, 0 ohm', { ...BP, topology: 'towThomas', ...E24[1], sourceR: 0 }],
	['band-pass, Chebyshev, a Sallen-Key high-pass and a Tow-Thomas low-pass section, E96, 600 ohm', { ...BP, response: 'chebyshev', amaxDb: 1, topologyHp: 'sallenKey', topologyLp: 'towThomas', ...E96[1], sourceR: 600 }],
	['band-pass, Legendre, a Tow-Thomas high-pass and a Sallen-Key low-pass section, lab resistors, centred', { ...BP, response: 'legendre', topologyHp: 'towThomas', topologyLp: 'sallenKey', ...LABR[1], placement: 'centred' }],
	['band-pass, Bessel, Sallen-Key both sections, E24, 50 ohm', { ...BP, response: 'bessel', aminDb: 20, fsl: 100, fsh: 100000, topology: 'sallenKey', ...E24[1] }],
	['band-stop of two branches, Sallen-Key, lab kit, 600 ohm', { ...BS, topology: 'sallenKey', sourceR: 600 }],
	['band-stop of two branches, Tow-Thomas, E24, 600 ohm, centred', { ...BS, topology: 'towThomas', ...E24[1], sourceR: 600, placement: 'centred' }],
	['band-stop of two branches, a Tow-Thomas low-pass and a Sallen-Key high-pass branch, lab kit, 600 ohm', { ...BS, topologyLp: 'towThomas', topologyHp: 'sallenKey', sourceR: 600 }],
	['band-stop of two branches, Chebyshev, a Sallen-Key low-pass and a Tow-Thomas high-pass branch, E96, 50 ohm', { ...BS, response: 'chebyshev', amaxDb: 1, topologyLp: 'sallenKey', topologyHp: 'towThomas', ...E96[1] }]
];

/**
 * The family's Python functions alone, on the page's parts of the band
 * filters of BANDS, which the band layouts (band.js) build from them:
 *   each <circuit>_h(p, s, rs) of a stage of the family, at five points
 *   around its f0, with no source and behind 50 ohm, against the nodal
 *   solution of its netlist with the source resistor ahead of it
 *   each <circuit>_y(p, s) against the current that netlist takes from a
 *   1 V source (nodalSolve's)
 *   each design's response at 25 points over its span, the file's way (the
 *   stages multiplied, rs on the first one; a band-stop's two branches
 *   weighted by the page's summing amplifier, added, and times
 *   F = 1 / (1 + rs (Y_lp + Y_hp)) on the node they share), against the
 *   page's own (measureFilter's responseAt)
 * One python run for every value. Returns [label, ok, detail] triples.
 */
export function bandChecks() {
	const mine = new Set(Object.keys(circuits));
	const evals = [];
	const ask = (e) => (evals.push(e), e);
	const pages = BANDS.map(([label, args]) => {
		const { design, result } = pageParts(args);
		const stages = result.stages.map((stage) => ({ stage, circuit: pythonRegistry.circuitOf(stage.topology).circuit }));
		const own = [];
		stages.forEach(({ stage, circuit }) => {
			if (!mine.has(circuit)) return;
			for (const x of [0.1, 0.5, 1, 2, 10]) {
				const f = (x * stage.actual.wn) / (2 * Math.PI);
				for (const rs of [0, 50]) own.push({ stage, e: ask({ kind: 'h', circuit, p: stage.components, f, rs }) });
				own.push({ stage, e: ask({ kind: 'y', circuit, p: stage.components, f, rs: 0 }) });
			}
		});
		const lo = Math.min(design.fl, design.fsl) / 10;
		const hi = Math.max(design.fh, design.fsh) * 10;
		const lpCount = design.method === 'parallel' ? design.lp.stages.length : null;
		const rs = args.sourceR > 0 ? args.sourceR : 0;
		const points = Array.from({ length: 25 }, (_, k) => {
			const f = lo * (hi / lo) ** (k / 24);
			// (a cascade's first stage behind rs; a band-stop's branches from an ideal source, and the
			// admittances of their first stages)
			const h = stages.map(({ stage, circuit }, i) => ask({ kind: 'h', circuit, p: stage.components, f, rs: lpCount === null && i === 0 ? rs : 0 }));
			const y = lpCount === null ? [] : [0, lpCount].map((i) => ask({ kind: 'y', circuit: stages[i].circuit, p: stages[i].stage.components, f, rs: 0 }));
			return { f, h, y };
		});
		return { label, rs, result, lpCount, own, points };
	});
	const used = [...new Set(evals.map((e) => e.circuit))];
	const code = [
		'import json',
		'import math',
		'',
		'',
		...used.flatMap((c) => {
			const family = pythonRegistry.familyOf(c);
			return [family.response(c), '', '', ...(evals.some((e) => e.kind === 'y' && e.circuit === c) ? [family.admittance(c), '', ''] : [])];
		}),
		`EVALS = json.loads(${JSON.stringify(JSON.stringify(evals.map(({ kind, circuit, p, f, rs }) => ({ kind, circuit, p, f, rs }))))})`,
		'out = []',
		'for e in EVALS:',
		'    s = 2j * math.pi * e["f"]',
		'    if e["kind"] == "y":',
		'        v = complex(globals()[e["circuit"] + "_y"](e["p"], s))',
		'    else:',
		'        v = complex(globals()[e["circuit"] + "_h"](e["p"], s, float(e["rs"])))',
		'    out.append([v.real, v.imag])',
		'print(json.dumps(out))'
	].join('\n');
	const run = runFile(code);
	const out = [['Sallen-Key and Tow-Thomas on band filters: their H(s) and admittances run', run.status === 0 && run.stderr === '', run.stderr.slice(-600)]];
	if (run.status !== 0) return out;
	const values = JSON.parse(run.stdout);
	const value = (e) => {
		const [re, im] = values[evals.indexOf(e)];
		return { re, im };
	};
	const close = (a, b) => Math.hypot(a.re - b.re, a.im - b.im) <= 1e-9 * Math.hypot(b.re, b.im);
	const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
	const bad = { h: [], y: [] };
	for (const { label, own } of pages) {
		for (const { stage, e } of own) {
			const where = `${label}, ${e.circuit} at ${e.f.toPrecision(4)} Hz`;
			if (e.kind === 'h') {
				const els = e.rs > 0 ? [{ kind: 'R', name: 'Rsource', nodes: ['vin', 'src'], value: e.rs }, ...stageElements(stage, 0, 'src', 'vout')] : stageElements(stage, 0, 'vin', 'vout');
				if (!close(value(e), nodalResponse(els, e.f))) bad.h.push(`${where}, rs ${e.rs}`);
			} else if (!close(value(e), nodalSolve(stageElements(stage, 0, 'vin', 'vout'), e.f).source)) bad.y.push(where);
		}
	}
	out.push(['Sallen-Key and Tow-Thomas on band filters: each H(s) behind rs equals the nodal solution of its netlist', bad.h.length === 0, bad.h.slice(0, 3).join('; ')]);
	out.push(['Sallen-Key and Tow-Thomas on band filters: each input admittance equals the current its netlist takes', bad.y.length === 0, bad.y.slice(0, 3).join('; ')]);
	for (const { label, rs, result, lpCount, points } of pages) {
		const misses = [];
		for (const { f, h, y } of points) {
			let total;
			if (lpCount === null) total = h.map(value).reduce(mul);
			else {
				const [wl, wh] = result.measure.combiner.weights;
				const lp = h.slice(0, lpCount).map(value).reduce(mul);
				const hp = h.slice(lpCount).map(value).reduce(mul);
				const sum = { re: wl * lp.re + wh * hp.re, im: wl * lp.im + wh * hp.im };
				const [a, b] = y.map(value);
				const d = { re: 1 + rs * (a.re + b.re), im: rs * (a.im + b.im) };
				const n = d.re * d.re + d.im * d.im;
				total = mul(sum, { re: d.re / n, im: -d.im / n });
				if (!close(sum, responseAtParallelSum([result.stages.slice(0, lpCount), result.stages.slice(lpCount)], f, result.measure.combiner.weights))) misses.push(`the branches at ${f.toPrecision(4)} Hz`);
			}
			if (!close(total, result.measure.responseAt(f))) misses.push(`${f.toPrecision(4)} Hz`);
		}
		out.push([`Sallen-Key and Tow-Thomas on band filters: ${label}: the page's parts through the family's H(s)${lpCount === null ? '' : ' and admittances'} give the page's response`, misses.length === 0, misses.slice(0, 3).join('; ')]);
	}
	return out;
}

// (strict: the file's H(s) are the page's figures to rounding, so both measures agree to 1e-6 dB, not only 0.01)
export default { name: 'Sallen-Key and Tow-Thomas stages', key: 'sk-tt', strict: true, circuits, cases };
