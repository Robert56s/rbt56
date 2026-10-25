// Verifies the generated LTspice netlists by simulating them.
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-spice.mjs
//
// The netlist is parsed and solved with complex modified nodal analysis
// (op-amps as ideal nullors), then compared against the response the tool
// itself predicts from the same realized stages. Any miswired node,
// swapped component or wrong op-amp pin shows up immediately as a
// mismatch, which a netlist that merely "looks right" would hide.
// A band filter is checked built both ways the page offers: the cascade
// (or a band-stop's two branches and their summing amplifier) and the
// transformation of one low-pass prototype, a plain chain of band-pass or
// notch stages. A transformed band-pass whose MFB band-pass stages are
// built for a single-pole op-amp is solved with that op-amp, as the
// netlist's own subcircuit has it.
//
// Exits non-zero on any mismatch.

import { branchDcGain, combinerChoice, combinerDesign, magnitudePhaseAt, magnitudePhaseAtParallelSum } from '../src/lib/filter/bode.js';
import { nearestResistor } from '../src/lib/filter/eseries.js';
import { designFirstOrderLowPass } from '../src/lib/filter/firstOrder.js';
import { designFirstOrderHighPass } from '../src/lib/filter/firstOrderHighPass.js';
import { designMfbLowPass } from '../src/lib/filter/mfb.js';
import { designMfbHighPass } from '../src/lib/filter/mfbHighPass.js';
import { designSallenKeyLowPass } from '../src/lib/filter/sallenKey.js';
import { designSallenKeyHighPass } from '../src/lib/filter/sallenKeyHighPass.js';
import { buildElements, generateNetlist, generateSchematic } from '../src/lib/filter/spice.js';
import { parseSchematic, spiceValue } from '../src/lib/spice/core.js';
import { audit } from '../src/lib/spice/geometry.js';
import { designBandPass, designBandStop, designHighPass, designLowPass, notchOptions } from '../src/lib/filter/stages.js';
import { designTowThomasHighPass, designTowThomasLowPass, designTowThomasNotch } from '../src/lib/filter/towThomas.js';
import { opampCount } from '../src/lib/filter/bandMethod.js';
import { realOpampProblems } from './lib-real-opamp.mjs';
import { abs, ascParity, opampParams, parseNetlist, parseValue, solveAt, sub } from './lib-nodal.mjs';
import { designTransformed, hasZeros, realizeBandStage, transformedMenus, transformedNetlistOpts } from './lib-band.mjs';
import { designBoctorNotch, boctorActual } from '../src/lib/filter/boctor.js';
import { designMfbBandPass, mfbBandPassResponse } from '../src/lib/filter/mfbBandPass.js';
import { OPAMP_GBW } from '../src/lib/spice/opamps.js';

let fails = 0;
const check = (label, ok, detail) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? `  (${detail})` : ''));
	if (!ok) fails++;
};

/* ----------------------------------------------------------- the cases */
const second = {
	mfb: (s) => (s.filterType === 'highpass' ? designMfbHighPass(s.wn, s.q) : designMfbLowPass(s.wn, s.q)),
	sallenKey: (s) => (s.filterType === 'highpass' ? designSallenKeyHighPass(s.wn, s.q) : designSallenKeyLowPass(s.wn, s.q)),
	towThomas: (s) => (s.filterType === 'highpass' ? designTowThomasHighPass(s.wn, s.q) : designTowThomasLowPass(s.wn, s.q))
};
// A transformed design's stage (it carries the band's w0) follows the
// page's plan under its two menus: a band-pass stage on MFB or Tow-Thomas
// at its centre gain, a notch with notchOptions on Tow-Thomas, or on Boctor
// where that menu asks and Boctor holds the stage (bandMethod.js). The
// three menu pairs a transformed case runs on, by name:
const BAND_MENUS = { mfb: transformedMenus('mfb', 'towThomas'), towThomas: transformedMenus('towThomas', 'towThomas'), boctor: transformedMenus('mfb', 'boctor') };
// otherwise a stage with zeros is always a Tow-Thomas notch, as on the page
const realize = (t) => (s) =>
	Number.isFinite(s.w0)
		? realizeBandStage(s, BAND_MENUS[t])
		: Number.isFinite(s.wz)
		? designTowThomasNotch(s.wn, s.q, s.wz, notchOptions(s).towThomas)
		: s.order === 1
			? s.filterType === 'highpass'
				? designFirstOrderHighPass(s.tau)
				: designFirstOrderLowPass(s.tau)
			: second[t](s);

const SPECS = [
	{ filterType: 'lowpass', amaxDb: 0.2, aminDb: 40, fp: 10000, fs: 35000 },
	{ filterType: 'lowpass', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 },
	{ filterType: 'highpass', amaxDb: 3, aminDb: 40, fp: 10000, fs: 3000 },
	// gentle enough for a Bessel high-pass to be built too
	{ filterType: 'highpass', amaxDb: 3, aminDb: 25, fp: 10000, fs: 1500 },
	{ filterType: 'bandpass', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 },
	{ filterType: 'bandstop', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 },
	// narrow bands, where the transformation pays: 3 op-amps against 7 for
	// the band-pass, whose Amin differs per side; as two branches the narrow
	// band-stop is past the order limit for every response but elliptic
	{ filterType: 'bandpass', amaxDb: 3, aminDbHp: 50, aminDbLp: 30, fl: 40000, fh: 60000, fsl: 10000, fsh: 100000 },
	{ filterType: 'bandstop', amaxDb: 1, aminDb: 30, fl: 9000, fh: 11500, fsl: 9800, fsh: 10300 }
];
const NARROW = new Set(SPECS.slice(-2));
const RESPONSE_KEYS = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];
const MIXED = [
	['bessel', 'elliptic'],
	['elliptic', 'butterworth'],
	['inverseChebyshev', 'chebyshev'],
	['legendre', 'inverseChebyshev']
];
const isBand = (t) => t === 'bandpass' || t === 'bandstop';
// a band filter both ways; the transformation takes one response and has
// no Sallen-Key stage: its band-pass stages on MFB or Tow-Thomas, its
// notches on Tow-Thomas or Boctor ('boctor', band-pass stages on MFB, run
// where there are notches: a band-stop, or a response with zeros)
const methodsFor = (spec) => (isBand(spec.filterType) ? ['cascade', 'transformed'] : ['cascade']);
const topologiesFor = (spec, method, response) =>
	method === 'cascade' ? Object.keys(second) : spec.filterType === 'bandstop' ? ['towThomas', 'boctor'] : ['mfb', 'towThomas', ...(hasZeros(response) ? ['boctor'] : [])];
/** The design of a case, as the page computes it for that method. */
function designOf(spec, method, args) {
	if (method === 'transformed') return designTransformed(spec, args.response);
	if (spec.filterType === 'bandpass') return designBandPass({ ...args, orderLow: null, orderHigh: null });
	if (spec.filterType === 'bandstop') return designBandStop({ ...args, orderLow: null, orderHigh: null });
	if (spec.filterType === 'highpass') return designHighPass({ ...args, order: null });
	return designLowPass({ ...args, order: null });
}
// what the page would refuse: past its order limit, or a response that never gets there
const tooHigh = (spec, method, design) => (isBand(spec.filterType) && method === 'cascade' ? [design.lp, design.hp] : [design]).some((d) => !Number.isFinite(d.minOrder) || d.n > 8);
// what spice.js takes for a transformed design on top of the spec: one chain, no combiner
const methodOpts = (method, design) => (method === 'transformed' ? transformedNetlistOpts(design) : {});
const CASES = [];
for (const spec of SPECS) {
	for (const topology of Object.keys(second)) {
		for (const response of RESPONSE_KEYS) CASES.push({ spec, topology, responseHp: response, responseLp: response, method: 'cascade' });
		if (isBand(spec.filterType)) for (const [responseHp, responseLp] of MIXED) CASES.push({ spec, topology, responseHp, responseLp, method: 'cascade' });
	}
}
for (const spec of SPECS.filter((x) => isBand(x.filterType))) {
	for (const response of RESPONSE_KEYS) for (const topology of topologiesFor(spec, 'transformed', response)) CASES.push({ spec, topology, responseHp: response, responseLp: response, method: 'transformed' });
}
let skipped = 0;
// transformed cases the page cannot build (a stage its plan refuses, as an
// MFB band-pass past its Q and gain), and the ones that ran, by name
const refused = [];
const transformedRan = new Set();

for (const { spec, topology, responseHp, responseLp, method } of CASES) {
	{
		{
			const response = responseLp;
			const args = { response, responseHp, responseLp, ...spec };
			const design = designOf(spec, method, args);
			if (tooHigh(spec, method, design)) {
				skipped++;
				continue;
			}

			const realized = design.stages.map(realize(topology));
			const transformed = method === 'transformed';
			if (transformed && realized.some((r) => !r)) {
				refused.push(`${NARROW.has(spec) ? 'narrow ' : ''}${spec.filterType} ${response} ${topology}`);
				continue;
			}
			// a transformed band-stop is one chain of notches: no branches, no combiner
			const parallel = spec.filterType === 'bandstop' && !transformed;
			const lpCount = parallel ? design.lp.stages.length : 0;
			let combinerMode = 'sum';
			let combinerResistors = null;
			let expected;
			if (parallel) {
				const branches = [realized.slice(0, lpCount), realized.slice(lpCount)];
				const choice = combinerChoice(branches, spec.fsl, spec.fsh);
				combinerMode = choice.mode;
				// the combiner evens out a low-pass notch stage's DC gain, as on the page
				const parts = combinerDesign(choice.mode, 10000, Math.abs(branchDcGain(branches[0])), (v) => nearestResistor(v, 'E24'));
				combinerResistors = parts.resistors;
				expected = (f) => magnitudePhaseAtParallelSum(branches, f, parts.weights).db;
			} else {
				expected = (f) => magnitudePhaseAt(realized, f).db;
			}

			const netlist = generateNetlist({
				realizedStages: realized,
				topology,
				lpCount,
				combinerMode,
				combinerR: 10000,
				combinerResistors,
				ideal: true,
				...args,
				...methodOpts(method, design)
			});
			const elements = parseNetlist(netlist);

			const lo = spec.filterType === 'bandpass' || spec.filterType === 'bandstop' ? spec.fsl / 5 : Math.min(spec.fp, spec.fs) / 5;
			const hi = spec.filterType === 'bandpass' || spec.filterType === 'bandstop' ? spec.fsh * 5 : Math.max(spec.fp, spec.fs) * 5;
			let worst = 0;
			let worstAt = 0;
			for (let i = 0; i <= 24; i++) {
				const f = lo * (hi / lo) ** (i / 24);
				const sim = 20 * Math.log10(Math.max(abs(solveAt(elements, f)), 1e-15));
				const want = expected(f);
				// a transformed band-stop's notches all sit on f0, the middle of this
				// grid: there both are far below anything measurable, and bode.js
				// stops at -240 dB
				if (sim < -200 && want < -200) continue;
				const err = Math.abs(sim - want);
				if (err > worst) {
					worst = err;
					worstAt = f;
				}
			}
			const respText = responseHp === responseLp ? responseLp : `${responseHp}/${responseLp}`;
			const label = `${spec.filterType.padEnd(8)}${NARROW.has(spec) ? ' narrow' : ''} ${topology.padEnd(10)} ${respText.padEnd(16)} n=${design.n ?? `${design.lp.n}+${design.hp.n}`}${transformed ? ' transformed' : parallel ? ` ${combinerMode}` : ''}`;
			check(label, worst < 0.02, `ecart max ${worst.toFixed(4)} dB a ${worstAt.toFixed(0)} Hz, ${elements.length} elements`);
			if (transformed) {
				// one chain from vin to vout, as many op-amps as the page counts, and a
				// band-pass measured at f0 too, where it passes gain 1
				transformedRan.add(`${NARROW.has(spec) ? 'narrow ' : ''}${spec.filterType} ${response} ${topology}`);
				const count = opampCount(design, BAND_MENUS[topology]);
				const opamps = elements.filter((e) => e.kind === 'OP').length;
				const f0Line = /^\.meas AC v_f0 FIND V\(vout\) AT /m.test(netlist);
				check(
					`  one chain, ${count.opamps} op-amps as counted, ${spec.filterType === 'bandpass' ? 'measured at f0' : 'no combiner'}`,
					opamps === count.opamps && !elements.some((e) => /^(XUC|RC[A-Z])$/.test(e.name)) && f0Line === (spec.filterType === 'bandpass'),
					`${opamps} op-amps in the .cir, ${realized.map((r) => r.topology).join(', ')}`
				);
			}

			// the .asc has to describe exactly the same circuit. It is drawn, so
			// most of its nets carry no name: what must match is which pins
			// share a net, every name that is drawn, the values and the
			// directives
			const opts = { realizedStages: realized, topology, lpCount, combinerMode, combinerR: 10000, combinerResistors, ...args, ...methodOpts(method, design) };
			const asc = generateSchematic(opts);
			const wanted = buildElements({ realizedStages: realized, filterType: spec.filterType, method: transformed ? 'transformed' : undefined, lpCount, combinerMode, combinerR: 10000, combinerResistors }).filter((e) => e.kind !== 'LABEL');
			const { problems, symbols } = ascParity(asc, wanted, generateNetlist(opts));
			check(`  .asc same circuit`, problems.length === 0, problems.length ? problems.slice(0, 3).join('; ') : `${symbols} symbols`);
			const issues = audit(asc);
			check(`  .asc drawn clean`, issues.length === 0, issues.length ? issues.slice(0, 3).map((i) => `${i.kind}: ${i.detail}`).join('; ') : 'no overlap, no crossing');
		}
	}
}

// the transformed cases the page builds by default, and the ones the
// tool's comparison rests on, all ran (none refused, none past the limit)
{
	const wanted = ['narrow bandpass butterworth mfb', 'narrow bandpass butterworth towThomas', 'narrow bandpass elliptic towThomas', 'narrow bandpass elliptic boctor', 'bandstop butterworth towThomas', 'bandstop butterworth boctor', 'narrow bandstop chebyshev towThomas', 'narrow bandstop chebyshev boctor'];
	const missing = wanted.filter((w) => !transformedRan.has(w));
	check(
		`transformed band filters: ${transformedRan.size} cases ran (the narrow band-pass on MFB and Tow-Thomas band-pass stages, notches on Tow-Thomas and Boctor)`,
		missing.length === 0,
		missing.length ? `missing: ${missing.join(', ')}` : `refused by the page's plan: ${refused.join(', ') || 'none'}`
	);
}

// values change length with the frequency (470p, 1.5u, 180k): the drawing
// has to stay clean from a few hertz to a few hundred kilohertz, both ways
// of building a band filter
{
	let drawn = 0;
	const messy = [];
	for (const k of [0.001, 0.1, 30]) {
		for (const spec of SPECS) {
			const scaled = Object.fromEntries(Object.entries(spec).map(([key, v]) => [key, /^f(p|s|l|h|sl|sh)$/.test(key) ? v * k : v]));
			for (const method of methodsFor(spec)) {
				for (const topology of topologiesFor(spec, method)) {
					for (const response of ['butterworth', 'chebyshev']) {
						const args = { response, ...scaled };
						const design = designOf(scaled, method, args);
						if (tooHigh(scaled, method, design)) continue;
						const realized = design.stages.map(realize(topology));
						// a stage the page cannot build at this scale is refused there, not drawn
						if (realized.some((r) => !r)) continue;
						const parallel = scaled.filterType === 'bandstop' && method === 'cascade';
						const lpCount = parallel ? design.lp.stages.length : 0;
						const combinerMode = parallel ? combinerChoice([realized.slice(0, lpCount), realized.slice(lpCount)], scaled.fsl, scaled.fsh).mode : 'sum';
						const issues = audit(generateSchematic({ realizedStages: realized, topology, lpCount, combinerMode, combinerR: 10000, ...args, ...methodOpts(method, design) }));
						drawn++;
						if (issues.length) messy.push(`${scaled.filterType} ${method} ${topology} ${response} x${k}: ${issues[0].kind}: ${issues[0].detail}`);
					}
				}
			}
		}
	}
	check('every drawing from a few hertz to a few hundred kilohertz is clean', messy.length === 0, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
}

// the same drawings with a real op-amp: the five-pin symbol on v++ and
// v--, the rail sources, the part's subcircuit, and the same wiring
{
	let drawn = 0;
	const messy = [];
	for (const spec of SPECS) {
		for (const method of methodsFor(spec)) {
			for (const response of ['butterworth', 'chebyshev', 'elliptic']) {
				for (const topology of topologiesFor(spec, method, response)) {
					const args = { response, ...spec };
					const design = designOf(spec, method, args);
					if (tooHigh(spec, method, design)) continue;
					const realized = design.stages.map(realize(topology));
					if (realized.some((r) => !r)) continue;
					const parallel = spec.filterType === 'bandstop' && method === 'cascade';
					const lpCount = parallel ? design.lp.stages.length : 0;
					const combinerMode = parallel ? combinerChoice([realized.slice(0, lpCount), realized.slice(lpCount)], spec.fsl, spec.fsh).mode : 'sum';
					const opts = { realizedStages: realized, topology, lpCount, combinerMode, combinerR: 10000, ...args, ...methodOpts(method, design) };
					const ideal = generateSchematic(opts);
					for (const part of ['TL082', 'LM741']) {
						const { problems, issues } = realOpampProblems(ideal, generateSchematic({ ...opts, opamp: part }), part);
						drawn++;
						if (problems.length || issues.length) messy.push(`${spec.filterType} ${method} ${topology} ${response} ${part}: ${problems[0] ?? `${issues[0].kind}: ${issues[0].detail}`}`);
					}
					if (drawn === 2) {
						const cir = generateNetlist({ ...opts, opamp: 'TL082' });
						check('real op-amps: the .cir carries the TL082 subcircuit, the rails and five-node op-amps', /^\.SUBCKT TL082/m.test(cir) && /^VPOS v\+\+ 0 15$/m.test(cir) && /^VNEG v-- 0 -15$/m.test(cir) && /^X\S+ \S+ \S+ v\+\+ v-- \S+ TL082$/m.test(cir) && !/OPAMP/.test(cir.replace(/OPERATIONAL AMPLIFIER/g, '')));
					}
				}
			}
		}
	}
	check('real op-amps: every drawing wired as the ideal one, on v++ and v--, drawn clean', messy.length === 0, messy.length ? messy.slice(0, 3).join('; ') : `${drawn} drawings`);
}

// MFB band-pass stages built for a single-pole op-amp (mfbBandPass.js):
// the netlist written for that design carries the same GBW in its
// subcircuit, and solved with that op-amp it gives the page's response
// (bode.js, each such stage with its op-amp) within 0.02 dB; the .asc's
// op-amps carry the GBW too. One MFB band-pass stage alone first, solved
// against the exact response.
{
	const stage = designMfbBandPass(2 * Math.PI * 41047, 4.972, { gain: 2.031, gbw: OPAMP_GBW.TL082 });
	const elements = parseNetlist(generateNetlist({ realizedStages: [stage], filterType: 'bandpass', method: 'transformed', response: 'butterworth', amaxDb: 3, aminDbLow: 50, aminDbHigh: 30, fl: 40000, fh: 60000, fsl: 10000, fsh: 100000, correctedGbw: OPAMP_GBW.TL082 }));
	let worst = 0;
	for (const f of [1000, 20000, 41000, 45000, 100000, 1e6]) {
		const sim = solveAt(elements, f, { aol: Infinity, gbw: OPAMP_GBW.TL082 });
		const h = mfbBandPassResponse(stage.components, f, OPAMP_GBW.TL082);
		worst = Math.max(worst, abs(sub(sim, h)) / abs(h));
	}
	check('single-pole op-amp in the nodal solver: one MFB band-pass stage gives the exact response with that op-amp, sign included', worst < 1e-9, `worst ${worst.toExponential(1)}`);

	const scale = (spec, k) => Object.fromEntries(Object.entries(spec).map(([key, v]) => [key, /^f(l|h|sl|sh)$/.test(key) ? v * k : v]));
	const narrow = SPECS.find((x) => NARROW.has(x) && x.filterType === 'bandpass');
	const bands = [['narrow', narrow], ['narrow at 5 kHz', scale(narrow, 0.1)], ['default', SPECS.find((x) => x.filterType === 'bandpass')]];
	let ran = 0;
	const refusedHere = [];
	for (const [name, spec] of bands) {
		for (const response of ['butterworth', 'chebyshev', 'bessel', 'legendre']) {
			for (const [part, gbw] of Object.entries(OPAMP_GBW)) {
				const design = designTransformed(spec, response);
				if (design.orderInfo.n === null || design.n > 8) continue;
				const realized = design.stages.map((s) => designMfbBandPass(s.wn, s.q, { gain: s.gain, gbw }));
				if (realized.some((r) => !r)) {
					refusedHere.push(`${name} ${response} ${part}`);
					continue;
				}
				const opts = { realizedStages: realized, topology: 'mfb', ...spec, response, ...transformedNetlistOpts(design), correctedGbw: gbw };
				const netlist = generateNetlist(opts);
				const model = opampParams(netlist);
				const elements = parseNetlist(netlist);
				let worstDb = 0;
				let worstAt = 0;
				for (let i = 0; i <= 48; i++) {
					const f = (spec.fsl / 5) * ((spec.fsh * 25) / spec.fsl) ** (i / 48);
					const err = Math.abs(20 * Math.log10(abs(solveAt(elements, f, model))) - magnitudePhaseAt(realized, f).db);
					if (err > worstDb) {
						worstDb = err;
						worstAt = f;
					}
				}
				const asc = generateSchematic(opts);
				const attributes = (asc.match(/^SYMATTR SpiceLine2 GBW=(\S+)$/gm) ?? []).map((l) => l.split('=')[1]);
				const tagged = model && model.gbw === parseValue(spiceValue(gbw)) && attributes.length === realized.length && attributes.every((a) => parseValue(a) === parseValue(spiceValue(gbw))) && /built for a single-pole op-amp of/.test(netlist) && /built for a single-pole op-amp of/.test(asc);
				ran++;
				check(`  ${name} band-pass, ${response}, MFB stages built for the ${part}: netlist with its op-amp equals the page`, worstDb < 0.02 && tagged, `ecart max ${worstDb.toFixed(4)} dB a ${worstAt.toFixed(0)} Hz, GBW ${model?.gbw}${tagged ? '' : ', GBW or note missing from the files'}`);
			}
		}
	}
	check(`MFB band-pass stages built for their op-amp: ${ran} band-pass netlists solved with the single-pole op-amp`, ran >= 12, `not buildable (loop gain under 2): ${refusedHere.join(', ') || 'none'}`);
}

for (const lowSide of [true, false]) for (const q of [0.6, 0.9, 1.2]) for (const pairs of [false, true]) {
	const wn = 2 * Math.PI * 1000, wz = wn * (lowSide ? 2 : 0.5);
	const d = designBoctorNotch(wn, q, wz, { lowSide, pairs });
	const label = `Boctor ${lowSide ? 'LP' : 'HP'} Q=${q} pairs=${pairs}`;
	check(`${label} realized`, !!d);
	if (!d) continue;
	const ideal = boctorActual(d.theoretical, lowSide);
	check(`${label} ideal synthesis`, Math.abs(ideal.wn / wn - 1) < 1e-10 && Math.abs(ideal.q / q - 1) < 1e-10 && Math.abs(ideal.wz / wz - 1) < 1e-10 && Math.abs(ideal.numeratorS / wn) < 1e-10);
	const opts = { filterType: lowSide ? 'lowpass' : 'highpass', response: 'elliptic', fp: 1000, fs: lowSide ? 3000 : 300, topology: 'boctor', realizedStages: [d], ideal: true };
	const elements = parseNetlist(generateNetlist(opts));
	let worst = 0;
	for (const f of [10, 100, 500, 1000, wz / (2 * Math.PI), 3000, 10000, 100000]) worst = Math.max(worst, Math.abs(20 * Math.log10(Math.max(abs(solveAt(elements, f)),1e-15)) - magnitudePhaseAt([d],f).db));
	check(`${label} nodal response`, worst < 1e-6, `${worst} dB`);
	const asc = generateSchematic(opts), parsed = parseSchematic(asc);
	const wanted = buildElements(opts).filter(e=>e.kind !== 'LABEL');
	const amp = wanted.find(e => e.kind === 'OP');
	const feedbackGround = wanted.find(e => e.name === (lowSide ? 'R11' : 'R41'));
	check(`${label} feedback returns to the inverting input`, amp.nodes[1] === feedbackGround.nodes[0]);
	const netOf = new Map(), nodeOf = new Map(), problems = [...parsed.clashes,...parsed.dangling];
	for (const w of wanted) {
		const got = parsed.elements.find(e=>e.name===w.name);
		if (!got) { problems.push(w.name+' missing'); continue; }
		got.nodes.forEach((net,i)=>{
			const node=w.nodes[i];
			if (netOf.has(net) && netOf.get(net)!==node) problems.push(w.name+' joins '+netOf.get(net)+' and '+node);
			if (nodeOf.has(node) && nodeOf.get(node)!==net) problems.push(node+' split');
			netOf.set(net,node);nodeOf.set(node,net);
		});
	}
	check(`${label} schematic connectivity`, problems.length===0,problems.slice(0,3).join('; '));
	const issues=audit(asc);
	check(`${label} schematic geometry`,issues.length===0,issues.slice(0,3).map(e=>e.detail).join('; '));
	const realIssues = audit(generateSchematic({ ...opts, ideal: false, opamp: 'TL082' }));
	check(`${label} powered TL082 schematic geometry`, realIssues.length === 0, realIssues.slice(0, 2).map(e => e.detail).join('; '));
}

console.log(fails === 0 ? 'netlists LTspice conformes au modele de l outil' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
