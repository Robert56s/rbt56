// The notch stages of filter-design.py, Boctor's and the Tow-Thomas notch
// (src/lib/filter/python/boctor.js, towThomasNotch.js): their rule written
// again in JavaScript (choices, figures, as rule.mjs runs them, operation
// for operation the file's), the library's stage of a set of their parts
// (for the library's measure of the file's own parts), and the designs the
// check runs them on: the elliptic and inverse Chebyshev low-passes and
// high-passes of both menus, every stock, both placements, an ideal source
// and 50 ohm, capacitors typed, pairs, the "Next design" list and the parts
// past the limits, and transformed band-stops (their notch stages Boctor on
// both sides of the notch, Tow-Thomas where Boctor cannot hold the stage).
//   circuits   the rule in JavaScript and the library's stage, by circuit
//   cases      the designs every run checks: four with their guards and
//              the plot, a spread of the matrix, the extras, those whose
//              Boctor low-pass stage the rule builds from the E6 series
//              (opts.e6, the stages), a spread of those with a stage the page
//              leaves unbuilt (opts.unbuilt: Boctor's high-pass form past its
//              Q limit; the file stops at that stage's rule with the reason,
//              or runs on with page_parts None) and the band-stops
//   sweep      the rest of the matrix (CHECK_PYTHON_SWEEP=notch): every
//              response, filter type, menu, stock, placement and source of
//              SPECS, the page building it whole or not
//   responseChecks  each notch circuit's H(s) and input admittance alone
//              against its netlist

import { plannedTopology } from '../../src/lib/filter/bandMethod.js';
import { boctorActual, boctorFromParts } from '../../src/lib/filter/boctor.js';
import { LAB_KIT } from '../../src/lib/filter/eseries.js';
import { nodalResponse, nodalSolve } from '../../src/lib/filter/nodal.js';
import boctorFamily from '../../src/lib/filter/python/boctor.js';
import towThomasNotchFamily from '../../src/lib/filter/python/towThomasNotch.js';
import { stageElements } from '../../src/lib/filter/stageElements.js';
import { towThomasNotchFromParts } from '../../src/lib/filter/towThomas.js';
import { pageDesign, pageMenus } from '../lib-parts.mjs';
import { capsFor } from './rule.mjs';

/** Throws unless two sets of figures agree to 1e-12 on the keys given. */
function sameFigures(what, got, want, keys) {
	for (const key of keys) if (!(Math.abs(got[key] / want[key] - 1) <= 1e-12)) throw new Error(`${what}: ${key} ${got[key]} against the library's ${want[key]}`);
}

/** The library's Boctor stage of the file's parts (boctorFromParts: boctorActual of the parts), its figures checked against the file's. */
function boctorStage(p, st, lowSide, figures) {
	const parts = { C1: p.C1, C2: p.C2, theoretical: { ...p }, R1n: p.R1, R2n: p.R2, R3n: p.R3, R4n: p.R4, R5n: p.R5, R6n: p.R6 };
	const lib = boctorFromParts(2 * Math.PI * st.f0, st.q, 2 * Math.PI * st.fz, parts, { lowSide });
	if (JSON.stringify(lib.components) !== JSON.stringify(p)) throw new Error(`boctor: parts ${JSON.stringify(p)} against the library's ${JSON.stringify(lib.components)}`);
	// (the file's figures are boctorActual's, written out: one formula, two copies)
	const a = boctorActual(lib.components, lowSide);
	const f = figures(p, 0);
	const mine = { wn: 2 * Math.PI * f.f0, q: f.q, wz: 2 * Math.PI * f.fz, ...(lowSide ? { dcGain: f.gain } : {}) };
	if (Number.isFinite(mine.wn)) sameFigures(lowSide ? 'boctor_lowpass_notch' : 'boctor_highpass_notch', mine, a, lowSide ? ['wn', 'q', 'wz', 'dcGain'] : ['wn', 'q', 'wz']);
	return lib;
}

const boctorLowFigures = (p) => {
	const [g1, g2, g3, g4, g5, g6] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map((name) => 1 / p[name]);
	const c1 = p.C1;
	const c2 = p.C2;
	const kd = g3 / (g3 + g5);
	const g = g2 + g4 + g6;
	const a = g / c2;
	const b = (g4 * g6) / (c1 * c2);
	const b1 = kd * ((g6 + g1) / c1 + a) - g6 / c1;
	const b0 = (kd * (g1 * g + g6 * (g2 + g4))) / (c1 * c2);
	const wz = Math.sqrt(b0 / kd);
	return { f0: Math.sqrt(b) / (2 * Math.PI), q: Math.sqrt(b) / a, fz: wz / (2 * Math.PI), gain: b0 / b, s_term: 1 + Math.abs(b1) / (kd * wz) };
};

const boctorHighFigures = (p) => {
	const [g1, g3, g4, g5, g6] = ['R1', 'R3', 'R4', 'R5', 'R6'].map((name) => 1 / p[name]);
	const c1 = p.C1;
	const c2 = p.C2;
	const r2 = p.R2;
	const sm = g4 + g5;
	const sp = g1 + g3 + g6;
	const d = g5 * c1 * c2 * r2;
	const a = (g5 * (c1 + sp * c2 * r2) - g3 * (c2 + sm * c2 * r2)) / d;
	const b = (g5 * sp - g3 * sm) / d;
	const b2 = sm / g5;
	const b1 = (g1 * sm * c2 * r2 + c1 * sm - c2 * (g3 + g6)) / d;
	const b0 = (g1 * sm) / d;
	if (a <= 0 || b <= 0) return { f0: Infinity, q: Infinity, fz: Infinity, s_term: Infinity };
	const wz = Math.sqrt(b0 / b2);
	return { f0: Math.sqrt(b) / (2 * Math.PI), q: Math.sqrt(b) / a, fz: wz / (2 * Math.PI), s_term: 1 + Math.abs(b1) / (b2 * wz) };
};

/** The stocked capacitor nearest c on a log scale, the first of a tie in the stock's order (Python's min). */
function nearestCapacitor(c, capacitors) {
	let best = null;
	let bestKey = Infinity;
	for (const x of capacitors) {
		const key = Math.abs(Math.log(x / c));
		if (key < bestKey) {
			best = x;
			bestKey = key;
		}
	}
	return best;
}

const towThomasNotchFigures = (p) => {
	const w0 = 1 / Math.sqrt(p.C1 * p.C2 * p.Ra * p.Rb);
	const wz = 1 / Math.sqrt(p.Cin * p.C2 * p.Ra * p.Rz);
	return { f0: w0 / (2 * Math.PI), q: w0 * p.C1 * p.Rd, fz: wz / (2 * Math.PI) };
};

/** The page's own capacitors, E6 from 1 pF to 6.8 uF, as the file writes E6_CAPACITORS. */
export const E6_CAPACITORS = [];
for (let d = -12; d <= -6; d++) for (const m of [1.0, 1.5, 2.2, 3.3, 4.7, 6.8]) E6_CAPACITORS.push(m * 10 ** d);

/** The low-pass form's exact parts for each pair C1 of c1s, C2 of c2s (boctor_lowpass_notch_pairs). */
function* boctorLowPairs(st, c1s, c2s) {
	const w0 = 2 * Math.PI * st.f0;
	const q = st.q;
	const kd = (st.f0 / st.fz) ** 2;
	if (!(kd < 1)) return;
	for (const c1 of c1s) {
		for (const c2 of c2s) {
			const u = c2 / c1;
			const disc = (u / (kd * q)) ** 2 - 4 * u * (1 / kd + 1 / q ** 2);
			if (disc < 0) continue;
			for (const t of [(u / (kd * q) + Math.sqrt(disc)) / 2, (u / (kd * q) - Math.sqrt(disc)) / 2]) {
				const g6 = t * w0 * c1;
				const g4 = (w0 * w0 * c1 * c2) / g6;
				const g2 = (w0 * c2) / q - g4 - g6;
				const g1 = g6 * (1 / kd - 1) - (w0 * c1) / q;
				if (g1 > 0 && g2 > 0) yield { R1: 1 / g1, R2: 1 / g2, R3: 10e3 * (1 / kd - 1), R4: 1 / g4, R5: 10e3, R6: 1 / g6, C1: c1, C2: c2 };
			}
		}
	}
}

/**
 * Whether the low-pass form's rule leaves the stock for the E6 series on
 * this target: no pair of the stock builds it (no capacitor was typed, or
 * the one typed cannot build it either).
 */
export const boctorLowFallsBack = (st, capacitors) => boctorLowPairs(st, capacitors, capacitors).next().done;

export const circuits = {
	boctor_lowpass_notch: {
		// (where no pair of the stock builds it, the page's E6 series: with E6 as the stock, the same pairs again)
		choices(st, rs, typed, capacitors) {
			const choices = [...boctorLowPairs(st, capsFor(typed, 'C', capacitors), capacitors)];
			if (choices.length || Object.keys(typed).length) return choices;
			return [...boctorLowPairs(st, E6_CAPACITORS, E6_CAPACITORS)];
		},
		// (the capacitors the rule draws on: the E6 series where neither the one typed nor the stock builds the stage)
		capacitors: (st, capacitors, typed) => ('C' in typed && !boctorLowPairs(st, [typed.C], capacitors).next().done) || !boctorLowFallsBack(st, capacitors) ? capacitors : E6_CAPACITORS,
		figures: boctorLowFigures,
		stage: (p, st) => boctorStage(p, st, true, boctorLowFigures)
	},
	boctor_highpass_notch: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			const wz = 2 * Math.PI * st.fz;
			const q = st.q;
			const rho = (st.fz / st.f0) ** 2;
			if (!(rho < 1 && q * (1 - rho) < 1)) return;
			for (const c of capsFor(typed, 'C', capacitors)) {
				const rp = (q * (1 - rho)) / (w0 * c);
				const rx = 1 / (q * (1 - rho) * w0 * c);
				const r2 = (rx - rp) / (1 + rho);
				const r1 = 1 / (wz * wz * c * c * r2);
				const kLeast = (rx - r2) / (rp * rx * (1 / rp - 1 / r1));
				for (const t of [1, 1.125, 1.25, 1.5, 2, 3, 4]) {
					const gain = t * Math.max(2, 1.5 * kLeast);
					const r3 = (gain * rp * rx) / (rx - r2);
					const r5 = gain * (rx - r2);
					yield { R1: r1, R2: r2, R3: r3, R4: r5 / (gain - 1), R5: r5, R6: 1 / (1 / rp - 1 / r1 - 1 / r3), C1: c, C2: c };
				}
			}
		},
		figures: boctorHighFigures,
		stage: (p, st) => boctorStage(p, st, false, boctorHighFigures)
	},
	tow_thomas_notch: {
		*choices(st, rs, typed, capacitors) {
			const w0 = 2 * Math.PI * st.f0;
			const wz = 2 * Math.PI * st.fz;
			for (const c of capsFor(typed, 'C', capacitors)) {
				const r = 1 / (w0 * c);
				const cin = st.gain === 1 ? c : nearestCapacitor(st.gain * c, capacitors);
				yield { Cin: cin, Rz: 1 / (c * cin * r * wz * wz), Ra: r, Rb: r, Rd: st.q * r, C1: c, C2: c, r: 10e3 };
			}
		},
		figures: towThomasNotchFigures,
		// (the library's Tow-Thomas notch keeps Ra = Rb and C1 = C2; the file rounds Ra and Rb apart, so the
		// stage is built from the textbook figures of its parts, and checked against the library's own
		// towThomasNotchFromParts where they have its form)
		stage(p, st) {
			const wn = 1 / Math.sqrt(p.C1 * p.C2 * p.Ra * p.Rb);
			const actual = { wn, q: wn * p.C1 * p.Rd, wz: 1 / Math.sqrt(p.Cin * p.C2 * p.Ra * p.Rz), gain: -p.Cin / p.C1, dcGain: -p.Rb / p.Rz };
			const built = { topology: 'towThomasNotch', order: 2, lowSide: actual.wz > wn, components: { ...p }, actual };
			if (p.C1 === p.C2 && p.Ra === p.Rb) {
				const lib = towThomasNotchFromParts(2 * Math.PI * st.f0, st.q, 2 * Math.PI * st.fz, { C: p.C1, Cin: p.Cin, CinIdeal: p.Cin, Rtarget: p.Ra, RdIdeal: p.Rd, R: p.Ra, Rd: p.Rd, RzTarget: p.Rz, Rz: p.Rz }, { resistorSeries: [p.r] });
				sameFigures('tow_thomas_notch', actual, lib.actual, ['wn', 'q', 'wz', 'gain', 'dcGain']);
				if (JSON.stringify(lib.components) !== JSON.stringify(p)) throw new Error(`tow_thomas_notch: parts ${JSON.stringify(p)} against the library's ${JSON.stringify(lib.components)}`);
			}
			return built;
		}
	}
};

/* ------------------------------------------------------------ the designs */

const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
const STOCKS = {
	E24: { resistorStock: 'E24', capacitorStock: null },
	E96: { resistorStock: 'E96', capacitorStock: null },
	kit: KIT,
	labR: { resistorStock: LAB_KIT.resistors, capacitorStock: null },
	list: { resistorStock: [1e3, 1.5e3, 2.2e3, 3.3e3, 4.7e3, 6.8e3, 10e3, 15e3, 22e3, 33e3, 47e3, 68e3, 100e3, 150e3, 220e3, 330e3, 470e3, 680e3, 1e6], capacitorStock: [100e-12, 220e-12, 470e-12, 1e-9, 2.2e-9, 4.7e-9, 10e-9, 22e-9, 47e-9, 100e-9] }
};

/**
 * The specs of the matrix: a low-pass each (fp, fs), its high-pass the same
 * k mirrored about fp (fs = fp^2 / fs of the low-pass). Orders 2 to 7, odd
 * ones with their first-order stage, Q from under 1 to above 7; the last
 * three keep Q low enough for Boctor's high-pass form (Q (1 - (fz/f0)^2) <
 * 1), which the others' high-passes mostly break.
 */
const SPECS = [
	{ response: 'elliptic', amaxDb: 1, aminDb: 40, fp: 10000, fs: 20000 },
	{ response: 'elliptic', amaxDb: 1, aminDb: 30, fp: 5000, fs: 12000 },
	{ response: 'elliptic', amaxDb: 0.5, aminDb: 50, fp: 1000, fs: 1600 },
	{ response: 'elliptic', amaxDb: 2, aminDb: 20, fp: 2000, fs: 6000 },
	{ response: 'elliptic', amaxDb: 0.2, aminDb: 60, fp: 3000, fs: 4500 },
	{ response: 'inverseChebyshev', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 },
	{ response: 'inverseChebyshev', amaxDb: 1, aminDb: 40, fp: 400, fs: 1000 },
	{ response: 'inverseChebyshev', amaxDb: 1, aminDb: 50, fp: 1000, fs: 2500 },
	{ response: 'inverseChebyshev', amaxDb: 3, aminDb: 60, fp: 20000, fs: 50000 },
	{ response: 'inverseChebyshev', amaxDb: 0.5, aminDb: 70, fp: 2000, fs: 5000 },
	{ response: 'inverseChebyshev', amaxDb: 3, aminDb: 20, fp: 1000, fs: 3000 },
	{ response: 'inverseChebyshev', amaxDb: 2, aminDb: 35, fp: 2000, fs: 8000 },
	{ response: 'elliptic', amaxDb: 2, aminDb: 18, fp: 1000, fs: 2500 }
];

/** The low-pass of a spec, or its high-pass mirrored about fp. */
const typeOf = (spec, type) => ({ filterType: type, ...spec, ...(type === 'highpass' ? { fs: (spec.fp * spec.fp) / spec.fs } : {}), order: null });

/** Each group's ten variants: every stock, each on both placements, the source 50 ohm or none. */
const VARIANTS = [
	['E24', 'edge', 50],
	['E24', 'centred', 0],
	['E96', 'edge', 0],
	['E96', 'centred', 50],
	['kit', 'edge', 50],
	['kit', 'centred', 0],
	['labR', 'edge', 0],
	['labR', 'centred', 50],
	['list', 'edge', 50],
	['list', 'centred', 0]
];

const NAMES = { elliptic: 'elliptic', inverseChebyshev: 'inverse Chebyshev' };

/** Whether the page leaves a stage of these args unbuilt (Boctor's high-pass form past its Q limit): each stage's plan, as the page's designers build it. */
function unbuilt(args) {
	const design = pageDesign(args);
	const menus = pageMenus(args);
	return design.stages.some((s) => plannedTopology(s, menus).unavailable);
}

/**
 * The stages (from 1) whose Boctor low-pass notch the file's rule builds
 * from the E6 series, no pair of the stock building it (boctorLowFallsBack
 * on the page's targets), [] for none.
 */
export function shortfallStages(args) {
	const design = pageDesign(args);
	const menus = pageMenus(args);
	const capacitors = Array.isArray(args.capacitorStock) ? args.capacitorStock : E6_CAPACITORS;
	return design.stages.flatMap((s, i) => (plannedTopology(s, menus).topology === 'boctor' && boctorLowFallsBack({ f0: s.wn / (2 * Math.PI), q: s.q, fz: s.wz / (2 * Math.PI) }, capacitors) ? [i + 1] : []));
}

/** The whole matrix, [label, args], the order of each spec in its label. */
const MATRIX = [];
for (const spec of SPECS) {
	for (const type of ['lowpass', 'highpass']) {
		const n = pageDesign({ ...typeOf(spec, type), topology: 'towThomas' }).n;
		for (const topology of ['boctor', 'towThomas']) {
			for (const [stock, placement, rs] of VARIANTS) {
				const label = `${NAMES[spec.response]} ${type === 'lowpass' ? 'low-pass' : 'high-pass'} n ${n} (k ${(spec.fp / spec.fs).toFixed(3)}, ${spec.amaxDb}/${spec.aminDb} dB), ${topology === 'boctor' ? 'Boctor' : 'Tow-Thomas'}, ${stock}, ${placement}, ${rs} ohm`;
				MATRIX.push([label, { ...typeOf(spec, type), topology, ...STOCKS[stock], placement, sourceR: rs }]);
			}
		}
	}
}

/**
 * The matrix's designs the page builds whole and the file's rule from its
 * stock; those with a stage the page leaves unbuilt (opts.unbuilt); and
 * those whose Boctor low-pass stage the rule builds from the E6 series
 * (opts.e6, the stages it does that for, from 1).
 */
const whole = (args) => !unbuilt(args) && !shortfallStages(args).length;
const SWEEP = MATRIX.filter(([, args]) => whole(args));
const UNBUILT = MATRIX.filter(([, args]) => unbuilt(args)).map(([label, args]) => [`a stage unbuilt: ${label}`, args, { unbuilt: true }]);
const SHORTFALL = [
	...MATRIX.filter(([, args]) => !unbuilt(args) && shortfallStages(args).length),
	['elliptic low-pass n 6, Boctor, list, 220 pF typed for stage 1 (neither it nor the stock builds it)', { ...typeOf(SPECS[4], 'lowpass'), topology: 'boctor', ...STOCKS.list, sourceR: 50, capOverrides: { 0: { C: 220e-12 } } }]
].map(([label, args]) => [`E6 for a stage: ${label}`, args, { e6: shortfallStages(args) }]);

const ELL = typeOf(SPECS[0], 'lowpass');
const ELL_HP = typeOf(SPECS[12], 'highpass');
const IC = typeOf(SPECS[5], 'lowpass');
const IC_HP = typeOf(SPECS[11], 'highpass');

/** The extras: capacitors typed, pairs and their limit, the "Next design" list, the parts past the limits, an order set on the page. */
const EXTRAS = [
	['elliptic low-pass, Boctor, lab kit, 1 nF typed for stage 1', { ...ELL, topology: 'boctor', ...KIT, sourceR: 50, capOverrides: { 0: { C: 1e-9 } } }],
	['elliptic low-pass, Tow-Thomas, E24, 4.7 nF typed for stage 2', { ...ELL, topology: 'towThomas', ...STOCKS.E24, sourceR: 50, capOverrides: { 1: { C: 4.7e-9 } } }],
	['inverse Chebyshev high-pass, Boctor, lab kit, 10 nF typed', { ...IC_HP, topology: 'boctor', ...KIT, sourceR: 50, capOverrides: { 0: { C: 10e-9 } } }],
	['inverse Chebyshev high-pass, Tow-Thomas, E96, 2.2 nF typed', { ...IC_HP, topology: 'towThomas', ...STOCKS.E96, sourceR: 0, capOverrides: { 0: { C: 2.2e-9 } } }],
	['elliptic low-pass, Boctor, lab kit, 10 pF typed (cannot build it)', { ...ELL, topology: 'boctor', ...KIT, sourceR: 50, capOverrides: { 0: { C: 10e-12 } } }],
	['elliptic low-pass, Boctor, lab kit, pairs', { ...ELL, topology: 'boctor', ...KIT, sourceR: 50, resistorPairs: true }],
	['elliptic low-pass, Boctor, lab kit, up to 1 pair', { ...ELL, topology: 'boctor', ...KIT, sourceR: 50, resistorPairs: true, resistorPairLimit: 1 }],
	['elliptic low-pass, Tow-Thomas, a list on hand, up to 2 pairs', { ...ELL, topology: 'towThomas', ...STOCKS.list, sourceR: 50, resistorPairs: true, resistorPairLimit: 2 }],
	['inverse Chebyshev low-pass, Boctor, lab resistors, pairs, centred', { ...IC, topology: 'boctor', ...STOCKS.labR, sourceR: 0, resistorPairs: true, placement: 'centred' }],
	['inverse Chebyshev high-pass, Tow-Thomas, lab kit, pairs', { ...IC_HP, topology: 'towThomas', ...KIT, sourceR: 50, resistorPairs: true }],
	['inverse Chebyshev low-pass, Boctor, lab kit, design 2 of the list', { ...IC, topology: 'boctor', ...KIT, sourceR: 50, designIndex: 1 }],
	['inverse Chebyshev low-pass, Boctor, lab kit, the last design', { ...IC, topology: 'boctor', ...KIT, sourceR: 50, designIndex: 'last' }],
	['inverse Chebyshev low-pass, Tow-Thomas, E24, design 2 of the list', { ...IC, topology: 'towThomas', ...STOCKS.E24, sourceR: 50, designIndex: 1 }],
	['inverse Chebyshev low-pass, Tow-Thomas, E24, the last design', { ...IC, topology: 'towThomas', ...STOCKS.E24, sourceR: 50, designIndex: 'last' }],
	['elliptic high-pass n 2 centred, Boctor, lab kit, design 2 of the list', { ...ELL_HP, topology: 'boctor', ...KIT, sourceR: 50, placement: 'centred', designIndex: 1 }],
	['elliptic low-pass, Boctor, lab kit, the parts past the limits', { ...ELL, topology: 'boctor', ...KIT, sourceR: 50, pastLimits: true }],
	['elliptic low-pass, Tow-Thomas, lab kit, the parts past the limits', { ...ELL, topology: 'towThomas', ...KIT, sourceR: 50, pastLimits: true }],
	['inverse Chebyshev low-pass, Boctor, order 4 set on the page', { ...IC, topology: 'boctor', ...KIT, sourceR: 50, order: 4 }],
	['elliptic low-pass, Tow-Thomas, order 5 set on the page, E96', { ...ELL, topology: 'towThomas', ...STOCKS.E96, sourceR: 50, order: 5 }],
	['inverse Chebyshev high-pass, Tow-Thomas, order 5 set on the page, E24', { ...IC_HP, topology: 'towThomas', ...STOCKS.E24, sourceR: 0, order: 5 }]
].filter(([, args]) => whole(args));

/** Four designs with their guards and the plot. */
const GUARDED = [
	[
		'elliptic low-pass, Boctor, lab kit, 50 ohm',
		{ ...ELL, topology: 'boctor', ...KIT, sourceR: 50 },
		{
			plot: true,
			guards: [
				['order', '5', /elliptic poles here are the page's/],
				// (on the passband edge the ripple is amax: section 3's guard holds it with the placement)
				['amax', '0.5', /elliptic poles here are the page's for n = \d+ and k = [\d.]+, a ripple of [\d.]+ dB \(amax, the edge placement\): for another order, k, amax or placement/]
			]
		}
	],
	['elliptic low-pass, Tow-Thomas, lab kit, 50 ohm', { ...ELL, topology: 'towThomas', ...KIT, sourceR: 50 }, { plot: true, guards: [['placement', '"centred"', /elliptic poles here are the page's for n = \d+ and k = [\d.]+, a ripple of [\d.]+ dB \(amax, the edge placement\): for another order, k, amax or placement/]] }],
	// (inverse Chebyshev's poles are formulas: another order still runs, until Boctor's high-pass form meets its Q limit)
	['inverse Chebyshev low-pass, Boctor, lab kit, 50 ohm', { ...IC, topology: 'boctor', ...KIT, sourceR: 50 }, { guards: [['order', '4', null]] }],
	['inverse Chebyshev high-pass, Boctor, lab kit, 50 ohm', { ...IC_HP, topology: 'boctor', ...KIT, sourceR: 50 }, { plot: true, guards: [['order', '4', /Boctor high-pass notch needs its zero under f0 and Q/]] }]
];

/* ------------------------------------------- the notch stages of a band-stop */

const BS = { filterType: 'bandstop', bandMethod: 'transformed', response: 'butterworth', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, orderHp: null, orderLp: null, topology: 'mfb', topologyBand: 'mfb' };

/**
 * Transformed band-stops, every notch menu: Boctor's both forms, Tow-Thomas's at DC gain 1, the
 * symmetric notch of an odd order, each through the whole band file (transform.js).
 */
const BANDSTOPS = [
	['Butterworth, Boctor, lab kit, 50 ohm', { ...BS, topologyNotch: 'boctor', ...KIT, sourceR: 50 }],
	['Butterworth, Boctor, E96, ideal source', { ...BS, topologyNotch: 'boctor', ...STOCKS.E96, sourceR: 0 }],
	['Butterworth, Boctor, E24, centred, 50 ohm', { ...BS, topologyNotch: 'boctor', ...STOCKS.E24, sourceR: 50, placement: 'centred' }],
	['Butterworth, Tow-Thomas, lab kit, 50 ohm', { ...BS, topologyNotch: 'towThomas', ...KIT, sourceR: 50 }],
	['Butterworth, Tow-Thomas, lab resistors, centred', { ...BS, topologyNotch: 'towThomas', ...STOCKS.labR, sourceR: 0, placement: 'centred' }],
	['Butterworth of order 3 (a symmetric notch), Boctor, E24', { ...BS, topologyNotch: 'boctor', ...STOCKS.E24, sourceR: 50, aminDb: 30 }],
	['Chebyshev 1 dB, Boctor, lab kit, past the limits', { ...BS, response: 'chebyshev', amaxDb: 1, topologyNotch: 'boctor', ...KIT, sourceR: 50, pastLimits: true }],
	['elliptic 1 dB, Boctor, E24, 50 ohm', { ...BS, response: 'elliptic', amaxDb: 1, topologyNotch: 'boctor', ...STOCKS.E24, sourceR: 50 }],
	['elliptic 1 dB, Tow-Thomas, a list on hand', { ...BS, response: 'elliptic', amaxDb: 1, topologyNotch: 'towThomas', ...STOCKS.list, sourceR: 0 }],
	['inverse Chebyshev, Boctor, lab kit, centred, 50 ohm', { ...BS, response: 'inverseChebyshev', topologyNotch: 'boctor', ...KIT, sourceR: 50, placement: 'centred' }],
	['inverse Chebyshev, Tow-Thomas, E96, 10 nF typed for stage 1', { ...BS, response: 'inverseChebyshev', topologyNotch: 'towThomas', ...STOCKS.E96, sourceR: 50, capOverrides: { 0: { C: 10e-9 } } }],
	['Butterworth, Boctor, lab kit, pairs, design 2 of the list', { ...BS, topologyNotch: 'boctor', ...KIT, sourceR: 50, resistorPairs: true, designIndex: 1 }]
];

/* ------------------------------------------- the H(s) and admittances alone */

/** Designs whose page parts give every notch circuit to read: both Boctor forms and the Tow-Thomas notch held at DC, far above its zero, and at f0 (a band-pass's transformation). */
const RESPONSE_DESIGNS = [
	{ ...ELL, topology: 'boctor', ...KIT, sourceR: 50 },
	{ ...ELL, topology: 'towThomas', ...STOCKS.E24, sourceR: 50 },
	{ ...IC_HP, topology: 'boctor', ...STOCKS.E96, sourceR: 50 },
	{ ...IC_HP, topology: 'towThomas', ...KIT, sourceR: 50 },
	{ ...BS, topologyNotch: 'boctor', ...STOCKS.E24, sourceR: 50 },
	{ ...BS, response: 'elliptic', amaxDb: 1, topologyNotch: 'towThomas', ...KIT, sourceR: 50 },
	{ filterType: 'bandpass', bandMethod: 'transformed', response: 'elliptic', amaxDb: 1, aminDb: 40, fl: 40000, fh: 60000, fsl: 30000, fsh: 80000, orderHp: null, orderLp: null, topology: 'mfb', topologyBand: 'towThomas', topologyNotch: 'towThomas', ...KIT, sourceR: 50 }
];

/**
 * Each notch circuit's Python functions alone, on the page's notch stages of
 * RESPONSE_DESIGNS (pageParts), against the nodal solution of its netlist
 * (stageElements): <circuit>_h(p, s, 0) against V(out) / V(in),
 * <circuit>_h(p, s, 600) against the netlist behind a 600 ohm resistor from
 * the source, and <circuit>_y(p, s) against the current the 1 V source
 * delivers into the input, at seven frequencies about f0 and the zero.
 * `run` is lib-python.mjs's runFile. Returns [label, ok, detail] rows.
 */
export function responseChecks({ run, pageParts: page, circuitOf }) {
	const families = [boctorFamily, towThomasNotchFamily];
	const stages = RESPONSE_DESIGNS.flatMap((args) => page(args).result.stages.filter((s) => s && families.includes(circuitOf(s.topology).family)));
	const RS = 600;
	const rows = stages.map((stage) => {
		const f0 = stage.actual.wn / (2 * Math.PI);
		const fz = stage.actual.wz / (2 * Math.PI);
		return { circuit: circuitOf(stage.topology).circuit, stage, freqs: [0.05 * f0, 0.3 * f0, f0, 3 * f0, 20 * f0, 0.999 * fz, 1.001 * fz] };
	});
	const used = [...new Set(rows.map((r) => r.circuit))];
	const fns = used.flatMap((c) => {
		const family = families.find((f) => Object.values(f.circuits).includes(c));
		return [family.response(c), family.admittance(c)];
	});
	const code = [
		'import json',
		'import math',
		'',
		'',
		fns.join('\n\n\n'),
		'',
		'',
		`CASES = [${rows.map((r) => `(${JSON.stringify(r.circuit)}, ${JSON.stringify(r.stage.components)}, ${JSON.stringify(r.freqs)})`).join(',\n         ')}]`,
		'out = []',
		'for circuit, p, freqs in CASES:',
		'    h_of, y_of = globals()[circuit + "_h"], globals()[circuit + "_y"]',
		'    row = []',
		'    for f in freqs:',
		'        s = 2j * math.pi * f',
		`        h0, hs, y = h_of(p, s, 0.0), h_of(p, s, ${RS}.0), y_of(p, s)`,
		'        row.append([h0.real, h0.imag, hs.real, hs.imag, y.real, y.imag])',
		'    out.append(row)',
		'print(json.dumps(out))',
		''
	].join('\n');
	const r = run(code);
	if (r.status !== 0) return [['notch stages: the H(s) and admittance functions run', false, r.stderr.slice(-600)]];
	const got = JSON.parse(r.stdout);
	const out = [];
	rows.forEach(({ circuit, stage, freqs }, k) => {
		const els = stageElements(stage, 0, 'vin', 'vout');
		const behind = [...els, { kind: 'R', name: 'Rsource', nodes: ['vs', 'vin'], value: RS }];
		const problems = [];
		const scale = { h: 0, hs: 0, y: 0 };
		const want = freqs.map((f) => {
			const h = nodalResponse(els, f);
			const hs = nodalResponse(behind, f, { input: 'vs' });
			const y = nodalSolve(els, f).source;
			scale.h = Math.max(scale.h, Math.hypot(h.re, h.im));
			scale.hs = Math.max(scale.hs, Math.hypot(hs.re, hs.im));
			scale.y = Math.max(scale.y, Math.hypot(y.re, y.im));
			return { h, hs, y };
		});
		freqs.forEach((f, j) => {
			const [h0r, h0i, hsr, hsi, yr, yi] = got[k][j];
			const w = want[j];
			const off = (a, b, ref) => Math.hypot(a[0] - b.re, a[1] - b.im) > 1e-9 * Math.max(Math.hypot(b.re, b.im), 1e-6 * ref);
			if (off([h0r, h0i], w.h, scale.h)) problems.push(`H at ${f.toPrecision(5)} Hz: ${h0r} ${h0i} against ${w.h.re} ${w.h.im}`);
			if (off([hsr, hsi], w.hs, scale.hs)) problems.push(`H behind ${RS} ohm at ${f.toPrecision(5)} Hz`);
			if (off([yr, yi], w.y, scale.y)) problems.push(`Y at ${f.toPrecision(5)} Hz: ${yr} ${yi} against ${w.y.re} ${w.y.im}`);
		});
		out.push([`notch stages: ${circuit} ${k + 1} (${JSON.stringify(stage.components)}): H(s), H(s) behind ${RS} ohm and Y(s) against its netlist`, problems.length === 0, problems.slice(0, 3).join('; ')]);
	});
	return out;
}

// (strict: the file's H(s) are the page's figures to rounding, so both measures agree to 1e-6 dB, not only
// 0.01. Every run: one in twelve of the matrix built whole, one in fifteen of those with a stage unbuilt;
// CHECK_PYTHON_SWEEP=notch the rest of both too)
const spread = (list, every, at) => list.filter((_, i) => i % every === at);
const rest = (list, every, at) => list.filter((_, i) => i % every !== at);
export default {
	name: 'notch stages',
	key: 'notch',
	strict: true,
	circuits,
	cases: [...GUARDED, ...spread(SWEEP, 12, 5), ...EXTRAS, ...SHORTFALL, ...spread(UNBUILT, 15, 0), ...BANDSTOPS.map(([label, args]) => [`a transformed band-stop: ${label}`, args, {}])],
	sweep: [...rest(SWEEP, 12, 5), ...rest(UNBUILT, 15, 0)]
};
