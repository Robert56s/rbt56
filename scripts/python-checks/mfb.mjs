// The multiple feedback and first-order stages of filter-design.py
// (src/lib/filter/python/mfb.js and firstOrder.js): their rule written again
// in JavaScript (choices, figures, as rule.mjs runs them), the library's
// stage of a set of their parts (for the library's measure of the file's
// own parts), and the designs the check runs them on.

import { LAB_KIT } from '../../src/lib/filter/eseries.js';
import { firstOrderFromParts } from '../../src/lib/filter/firstOrder.js';
import { firstOrderHighPassFromParts } from '../../src/lib/filter/firstOrderHighPass.js';
import { mfbLowPassFromParts } from '../../src/lib/filter/mfb.js';
import { mfbHighPassFromParts } from '../../src/lib/filter/mfbHighPass.js';
import { capsFor } from './rule.mjs';

/** The time constant 1 / (2 pi f0) of a first-order target. */
const tauOf = (st) => 1 / (2 * Math.PI * st.f0);

/** An RC stage's rule, the low-pass and the high-pass alike: (rs + R) C = 1 / (2 pi f0). */
const rc = {
	*choices(st, rs, typed, capacitors) {
		for (const c of capsFor(typed, 'C', capacitors)) {
			const r = 1 / (2 * Math.PI * st.f0 * c) - rs;
			if (r > 0) yield { R: r, C: c };
		}
	},
	figures: (p, rs) => ({ f0: 1 / (2 * Math.PI * (rs + p.R) * p.C) })
};

export const circuits = {
	mfb_lowpass: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			const a = w0 / st.q;
			for (const c1 of capsFor(typed, 'C1', capacitors)) {
				for (const c2 of capsFor(typed, 'C2', capacitors)) {
					const disc = (a * c1) ** 2 - 8 * w0 * w0 * c1 * c2;
					if (disc < 0) continue;
					for (const x of [(a * c1 + Math.sqrt(disc)) / 4, (a * c1 - Math.sqrt(disc)) / 4]) {
						const r3 = 1 / x;
						if (r3 > rs) yield { R1: r3 - rs, R2: 1 / (a * c1 - 2 * x), R3: r3, C1: c1, C2: c2 };
					}
				}
			}
		},
		figures(p, rs) {
			const r1 = rs + p.R1;
			const w0 = 1 / Math.sqrt(p.R2 * p.R3 * p.C1 * p.C2);
			const a = (1 / r1 + 1 / p.R2 + 1 / p.R3) / p.C1;
			return { f0: w0 / (2 * Math.PI), q: w0 / a, gain: -p.R3 / r1 };
		},
		// (the library's MFB low-pass keeps R3 = R1; the file's first stage takes R3 = R1 + rs, so the
		// stage is built from the textbook figures of its five parts, and checked against the library's
		// own where R3 = R1)
		stage(p, st) {
			const wn = 1 / Math.sqrt(p.R2 * p.R3 * p.C1 * p.C2);
			const A = (1 / p.R1 + 1 / p.R2 + 1 / p.R3) / p.C1;
			const built = { topology: 'mfb', order: 2, components: { ...p }, actual: { wn, q: wn / A, gain: -p.R3 / p.R1 } };
			if (p.R1 === p.R3) {
				const lib = mfbLowPassFromParts(2 * Math.PI * st.f0, st.q, { C1: p.C1, C2: p.C2, R1: p.R1, R2: p.R2, R1n: p.R1, R2n: p.R2, root: 1 });
				for (const key of ['wn', 'q', 'gain']) if (Math.abs(lib.actual[key] / built.actual[key] - 1) > 1e-12) throw new Error(`mfb_lowpass: ${key} ${built.actual[key]} against the library's ${lib.actual[key]}`);
			}
			return built;
		}
	},
	mfb_highpass: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			const a = w0 / st.q;
			for (const c of capsFor(typed, 'C', capacitors)) {
				const r2 = 3 / (a * c);
				yield { R1: 1 / (w0 * w0 * r2 * c * c), R2: r2, C1: c, C2: c, C3: c };
			}
		},
		figures(p) {
			const w0 = 1 / Math.sqrt(p.R1 * p.R2 * p.C2 * p.C3);
			const a = (p.C1 + p.C2 + p.C3) / (p.R2 * p.C2 * p.C3);
			return { f0: w0 / (2 * Math.PI), q: w0 / a, gain: -p.C1 / p.C3 };
		},
		stage(p, st) {
			if (!(p.C1 === p.C2 && p.C2 === p.C3)) throw new Error('mfb_highpass: three different capacitors');
			return mfbHighPassFromParts(2 * Math.PI * st.f0, st.q, { C: p.C1, R1: p.R1, R2: p.R2, R1n: p.R1, R2n: p.R2 });
		}
	},
	rc_lowpass: { ...rc, stage: (p, st) => firstOrderFromParts(tauOf(st), { C: p.C, Rtarget: p.R, R: p.R }) },
	rc_highpass: { ...rc, stage: (p, st) => firstOrderHighPassFromParts(tauOf(st), { C: p.C, Rtarget: p.R, R: p.R }) }
};

const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
const CUSTOM = { resistorStock: [1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3, 220e3, 470e3], capacitorStock: [100e-12, 1e-9, 10e-9, 100e-9] };
const LP = { filterType: 'lowpass', response: 'butterworth', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, topology: 'mfb', ...KIT, sourceR: 50 };
const HP = { ...LP, filterType: 'highpass', fs: 3000 };

/**
 * The designs: [label, args, opts], args as the page's downloadScript passes
 * them; opts.guards [[setting, Python value, the stop's message]] edits the
 * file and expects it to stop, opts.plot runs it with matplotlib too,
 * opts.lines [min, max] holds its length (about 200 to 350 lines; 370 since
 * rule b rounds every choice, closest() and miss(), 366 on Nov 21 2026).
 */
export const cases = [
	['the default low-pass: Butterworth, MFB, lab kit, 50 ohm', LP, { lines: [200, 370], plot: true, guards: [['order', '5', /odd order needs a first-order stage/]] }],
	['the default low-pass centred', { ...LP, placement: 'centred' }],
	['low-pass, E24, ideal source', { ...LP, resistorStock: 'E24', capacitorStock: null, sourceR: 0 }],
	['low-pass, E96, centred', { ...LP, resistorStock: 'E96', capacitorStock: null, placement: 'centred' }],
	['low-pass, lab resistors', { ...LP, resistorStock: LAB_KIT.resistors, capacitorStock: null }],
	['low-pass, a list on hand', { ...LP, ...CUSTOM }],
	['low-pass, lab kit, pairs', { ...LP, resistorPairs: true }],
	['low-pass, lab kit, up to 1 pair', { ...LP, resistorPairs: true, resistorPairLimit: 1 }],
	['low-pass, 10 nF typed for C1', { ...LP, capOverrides: { 0: { C1: 10e-9 } } }],
	['low-pass, C1 and C2 typed for stage 2', { ...LP, capOverrides: { 1: { C1: 4.7e-9, C2: 1e-9 } } }],
	['low-pass, capacitors typed that cannot build stage 1', { ...LP, capOverrides: { 0: { C1: 100e-12, C2: 100e-12 } } }],
	['low-pass, design 2 of the list', { ...LP, designIndex: 1 }],
	['low-pass, the last design of the list', { ...LP, designIndex: 'last' }],
	['low-pass of order 5 (an RC stage)', { ...LP, fs: 25000, aminDb: 45 }, { guards: [['order', '6', null]] }],
	['low-pass, order 5 set on the page', { ...LP, order: 5 }],
	['Chebyshev low-pass, 1 dB', { ...LP, response: 'chebyshev', amaxDb: 1 }],
	['Chebyshev low-pass centred, E24', { ...LP, response: 'chebyshev', amaxDb: 1, placement: 'centred', resistorStock: 'E24', capacitorStock: null }],
	['Bessel low-pass', { ...LP, response: 'bessel', aminDb: 20 }, { guards: [['order', '5', /Bessel poles here are the page's/], ['amax', '2.0', /Bessel losses here are the page's/]] }],
	['Bessel low-pass centred', { ...LP, response: 'bessel', aminDb: 20, placement: 'centred' }],
	['Bessel low-pass, order 4 set on the page', { ...LP, response: 'bessel', aminDb: 20, order: 4 }, { guards: [['order', 'None', /Bessel poles here are the page's for n = 4/]] }],
	['Legendre low-pass, 0 ohm', { ...LP, response: 'legendre', sourceR: 0 }, { guards: [['amin', '90.0', /None of the \d+ orders written here/]] }],
	['high-pass, MFB, lab kit', HP, { plot: true }],
	['high-pass at 100 Hz, lab kit, the parts past the limits', { ...HP, amaxDb: 1, fp: 100, fs: 33, pastLimits: true }],
	['high-pass, E24, ideal source, centred', { ...HP, resistorStock: 'E24', capacitorStock: null, sourceR: 0, placement: 'centred' }],
	['high-pass, 1 nF typed', { ...HP, capOverrides: { 0: { C: 1e-9 } } }],
	['high-pass, a list on hand, up to 2 pairs', { ...HP, ...CUSTOM, resistorPairs: true, resistorPairLimit: 2 }],
	['high-pass of order 5 (an RC stage), E96', { ...HP, fs: 3500, aminDb: 45, resistorStock: 'E96', capacitorStock: null }],
	['Chebyshev high-pass centred', { ...HP, response: 'chebyshev', amaxDb: 0.5, placement: 'centred' }],
	['Legendre high-pass centred, lab resistors', { ...HP, response: 'legendre', placement: 'centred', resistorStock: LAB_KIT.resistors, capacitorStock: null }],
	['Bessel high-pass of order 5, list on hand', { ...HP, response: 'bessel', aminDb: 25, fs: 2000, ...CUSTOM }],
	// (capacitors typed on both stages, as the page's fields take nF: the SETTINGS line of them, one stage a line)
	['low-pass, C1 and C2 typed for both stages', { ...LP, capOverrides: { 0: { C1: 4.7 * 1e-9, C2: 0.33 * 1e-9 }, 1: { C1: 1 * 1e-9, C2: 0.33 * 1e-9 } } }],
	// (a stage no choice of the stock builds by the file's rule, which the page builds from its full grid, or a
	// list too short for any: the file goes on without parts of its own and checks the page's)
	['Chebyshev low-pass at Q 50, lab kit: no stock choice builds stage 1', { ...LP, response: 'chebyshev', amaxDb: 1, aminDb: 45, fp: 1000, fs: 1100 }],
	['low-pass, R 4.7k, 15k, 47k and C 1 nF on hand: no stock choice builds it', { ...LP, amaxDb: 1, aminDb: 40, fp: 10000, fs: 20000, resistorStock: [4.7e3, 15e3, 47e3], capacitorStock: [1e-9] }]
];

// (strict: the file's H(s) are the page's figures to rounding, so both measures agree to 1e-6 dB, not only 0.01)
export default { name: 'MFB and first-order stages', key: 'mfb', strict: true, circuits, cases };
