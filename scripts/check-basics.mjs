// Checks for the beginner sections ("Start here") of the three analog
// tools. For every configuration a page can produce, the content modules
// must return blocks that:
//   1. render under strict KaTeX (every eq block),
//   2. carry no placeholders (undefined, NaN, null) in their prose,
//   3. use no typographic dashes and never address the reader as "you",
//   4. give every widget block finite, defined props.
// Run with: npm run check:basics

import katex from 'katex';
import { filterBasics } from '../src/lib/filter/basics.js';
import { modulationBasics } from '../src/lib/modulation/basics.js';
import { designJfetModulator } from '../src/lib/modulation/jfetModulator.js';
import { oscillatorBasics } from '../src/lib/oscillator/basics.js';
import { designOscillator, TOPOLOGIES } from '../src/lib/oscillator/topologies.js';

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
	if (ok) passes++;
	else failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
}

const DASHES = /[\u2013\u2014]/;
const YOU = /\b(you|your|yours|yourself)\b/i;
const PLACEHOLDER = /\bundefined\b|\bNaN\b|\bnull\b/;

const counts = { blocks: 0, equations: 0, widgets: 0, paragraphs: 0, terms: 0 };
const problems = [];

function inspect(where, blocks) {
	if (!Array.isArray(blocks) || blocks.length === 0) {
		problems.push(`${where}: no blocks`);
		return;
	}
	const widgetsHere = new Set();
	for (const b of blocks) {
		counts.blocks++;
		if (b.eq !== undefined) {
			counts.equations++;
			try {
				katex.renderToString(b.eq, { throwOnError: true, strict: 'error' });
			} catch (e) {
				problems.push(`${where}: KaTeX ${e.message.slice(0, 80)} in ${b.eq.slice(0, 60)}`);
			}
			if (PLACEHOLDER.test(b.eq)) problems.push(`${where}: placeholder in equation ${b.eq.slice(0, 60)}`);
			if (b.intro !== undefined) checkText(where, b.intro);
		} else if (b.widget !== undefined) {
			counts.widgets++;
			widgetsHere.add(b.widget);
			for (const [k, v] of Object.entries(b.props ?? {})) {
				if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) problems.push(`${where}: widget ${b.widget} prop ${k} is ${v}`);
			}
		} else if (b.terms !== undefined) {
			counts.terms += b.terms.length;
			for (const [term, gloss] of b.terms) {
				checkText(where, term);
				checkText(where, gloss);
			}
		} else if (b.h !== undefined) {
			checkText(where, b.h);
		} else if (b.p !== undefined) {
			counts.paragraphs++;
			checkText(where, b.p);
		} else {
			problems.push(`${where}: unknown block ${JSON.stringify(b).slice(0, 60)}`);
		}
	}
	return widgetsHere;
}

function checkText(where, text) {
	if (typeof text !== 'string') {
		problems.push(`${where}: text is ${typeof text}`);
		return;
	}
	if (PLACEHOLDER.test(text)) problems.push(`${where}: placeholder in "${text.slice(0, 70)}"`);
	if (DASHES.test(text)) problems.push(`${where}: dash in "${text.slice(0, 70)}"`);
	if (YOU.test(text)) problems.push(`${where}: reader-directed in "${text.slice(0, 70)}"`);
}

/* ------------------------------------------------------------ oscillator */
{
	const before = problems.length;
	let configs = 0;
	const widgets = new Set();
	// the longest paragraph, in words: the prose is meant to stay near 130
	let longestOsc = { words: 0, where: '' };
	for (const f of [200, 1000, 20000, 55000]) {
		for (const t of TOPOLOGIES) {
			for (const s of t.id === 'wien' ? ['diodes', 'lamp', 'jfet'] : ['diodes']) {
				const d = designOscillator({ topology: t.id, stabilizer: s, frequency: f, amplitude: f >= 20000 ? 1 : s === 'jfet' ? 4 : 3 });
				configs++;
				const where = `oscillator ${t.id}/${s}/${f}`;
				const blocks = oscillatorBasics(d);
				for (const w of inspect(where, blocks) ?? []) widgets.add(w);
				for (const b of blocks ?? []) {
					const words = b.p === undefined ? 0 : b.p.split(/\s+/).filter(Boolean).length;
					if (words > longestOsc.words) longestOsc = { words, where };
				}
			}
		}
	}
	check(`oscillator basics: ${configs} configurations clean`, problems.length === before, `${problems.length - before} problems`);
	check('oscillator basics: no paragraph much over 130 words', longestOsc.words <= 135, `${longestOsc.words} words at ${longestOsc.where}`);
	// every figure the blocks name: the loop, one RC pair in time, the
	// network's curves and the op-amp's lag
	const required = ['loop', 'rc-pair', 'network', 'opamp-lag'];
	const missing = required.filter((w) => !widgets.has(w));
	check(`oscillator basics: the ${required.join(', ')} figures are used`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : [...widgets].join(', '));
	// and the page registers every one of them: a name missing from its
	// widgets map would leave a silent gap in the panel
	const { readFileSync } = await import('node:fs');
	const page = readFileSync(new URL('../src/routes/(site)/tools/oscillator/+page.svelte', import.meta.url), 'utf8');
	const map = /widgets=\{\{([^}]*)\}\}/.exec(page)?.[1] ?? '';
	const registered = new Set([...map.matchAll(/'?([\w-]+)'?\s*:/g)].map((m) => m[1]));
	const unregistered = [...widgets].filter((w) => !registered.has(w));
	check('oscillator basics: the page registers every figure the blocks use', unregistered.length === 0, unregistered.length ? `not registered: ${unregistered.join(', ')}` : [...registered].join(', '));
}

/* ---------------------------------------------------------------- filter */
{
	const before = problems.length;
	let configs = 0;
	const widgets = new Set();
	const FILTER_FIGURES = ['two-tones', 'rc-on-spec', 'order-on-spec', 'stages-multiply'];
	// the longest paragraph, in words: the prose is meant to stay near 130
	let longest = { words: 0, where: '' };
	function inspectFilter(where, blocks) {
		for (const b of blocks) {
			if (typeof b.p !== 'string') continue;
			const words = b.p.split(/\s+/).filter(Boolean).length;
			if (words > longest.words) longest = { words, where };
		}
		return inspect(where, blocks) ?? [];
	}

	// bare configurations: the menus alone, with and without numbers
	for (const filterType of ['lowpass', 'highpass', 'bandpass', 'bandstop']) {
		for (const response of ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic']) {
			// the exact values of the page's Topology menu: a key the module
			// does not know would throw at render time
			for (const topology of ['mfb', 'sallenKey', 'towThomas']) {
				for (const order of [2, 4, 5, NaN]) {
					const stages = Number.isFinite(order) ? Math.ceil(order / 2) : 0;
					const fp = Number.isFinite(order) ? 1000 : NaN;
					configs++;
					for (const w of inspectFilter(`filter ${filterType}/${response}/${topology}/${order}`, filterBasics({ filterType, response, topology, order, stages, fp, fs: 4000, amaxDb: 1, aminDb: 40 }))) widgets.add(w);
				}
			}
		}
	}
	configs++;
	for (const w of inspectFilter('filter no arguments', filterBasics())) widgets.add(w);

	// real designs, built with the tool's own library the way the page
	// builds them, so that the figures' props (the realized stages, the
	// band-stop branches and signs, the flags of panel 05) are exercised
	const { designBandPass, designBandStop, designHighPass, designLowPass, minimumOrder } = await import('../src/lib/filter/stages.js');
	const { butterworthOrder, chebyshevOrder, transitionRatio } = await import('../src/lib/filter/order.js');
	const { combinerChoice, magnitudePhaseAt, magnitudePhaseAtParallelSum } = await import('../src/lib/filter/bode.js');
	const { LAB_KIT } = await import('../src/lib/filter/eseries.js');
	const { designMfbLowPass } = await import('../src/lib/filter/mfb.js');
	const { designMfbHighPass } = await import('../src/lib/filter/mfbHighPass.js');
	const { designSallenKeyLowPass } = await import('../src/lib/filter/sallenKey.js');
	const { designSallenKeyHighPass } = await import('../src/lib/filter/sallenKeyHighPass.js');
	const { designTowThomasHighPass, designTowThomasLowPass, designTowThomasNotch } = await import('../src/lib/filter/towThomas.js');
	const { designFirstOrderLowPass } = await import('../src/lib/filter/firstOrder.js');
	const { designFirstOrderHighPass } = await import('../src/lib/filter/firstOrderHighPass.js');

	const SECOND = {
		mfb: [designMfbLowPass, designMfbHighPass],
		sallenKey: [designSallenKeyLowPass, designSallenKeyHighPass],
		towThomas: [designTowThomasLowPass, designTowThomasHighPass]
	};
	const STOCK = {
		E24: { resistorSeries: 'E24', capacitors: null },
		E96: { resistorSeries: 'E96', capacitors: null },
		lab: { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors }
	};
	const buildStage = (stage, topology, opts) =>
		Number.isFinite(stage.wz)
			? designTowThomasNotch(stage.wn, stage.q, stage.wz, { ...opts, lowSide: stage.filterType === 'lowpass' })
			: stage.order === 1
			? (stage.filterType === 'highpass' ? designFirstOrderHighPass : designFirstOrderLowPass)(stage.tau, opts)
			: SECOND[topology][stage.filterType === 'highpass' ? 1 : 0](stage.wn, stage.q, opts);

	// what the page computes before it calls filterBasics
	function pageValues(spec, response, topology, stock, orderOverride = null) {
		const { filterType, amaxDb, aminDb } = spec;
		const band = filterType === 'bandpass' || filterType === 'bandstop';
		// the page's count: null when a searched response never gets there, which counts as past the limit
		const count = (k) => minimumOrder(response, amaxDb, aminDb, k).n ?? 99;
		// the page keeps every edge in its state, whatever the filter type
		const e = { fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, ...spec };
		const lpFp = filterType === 'bandstop' ? e.fl : e.fh;
		const lpFs = filterType === 'bandstop' ? e.fsl : e.fsh;
		let design = null;
		let k = null;
		let order;
		if (band) {
			const nLp = count(transitionRatio(lpFp, lpFs));
			const nHp = count(transitionRatio(filterType === 'bandstop' ? e.fsh : e.fsl, filterType === 'bandstop' ? e.fh : e.fl));
			order = nLp + nHp;
			if (nLp <= 8 && nHp <= 8) {
				const args = { response, amaxDb, aminDb, fl: e.fl, fh: e.fh, fsl: e.fsl, fsh: e.fsh, orderLow: nLp, orderHigh: nHp };
				design = filterType === 'bandstop' ? designBandStop(args) : designBandPass(args);
			}
		} else {
			k = filterType === 'highpass' ? transitionRatio(e.fs, e.fp) : transitionRatio(e.fp, e.fs);
			const min = count(k);
			order = orderOverride ?? min;
			if (min <= 8) design = (filterType === 'highpass' ? designHighPass : designLowPass)({ response, amaxDb, aminDb, fp: e.fp, fs: e.fs, order });
		}
		const realizedStages = design
			? design.stages
					.map((s) => {
						const built = buildStage(s, topology, STOCK[stock]);
						if (built) return built;
						const fallback = buildStage(s, topology, STOCK.E24);
						return fallback && { ...fallback, stockShortfall: true };
					})
					.filter(Boolean)
			: [];
		const lpCount = design && filterType === 'bandstop' ? design.lp.stages.length : 0;
		const bandStopBranches = lpCount && realizedStages.length ? [realizedStages.slice(0, lpCount), realizedStages.slice(lpCount)] : null;
		const combineSigns = bandStopBranches ? combinerChoice(bandStopBranches, e.fsl, e.fsh).signs : null;
		const loss = (f) => {
			if (!design || realizedStages.length === 0) return null;
			return bandStopBranches ? -magnitudePhaseAtParallelSum(bandStopBranches, f, combineSigns).db : -magnitudePhaseAt(realizedStages, f).db;
		};
		return {
			filterType,
			response,
			topology,
			order,
			stages: realizedStages.length,
			...e,
			amaxDb,
			aminDb,
			lpFp,
			lpFs,
			k,
			design,
			realizedStages,
			bandStopBranches,
			combineSigns,
			attenuationAtFs: band ? null : loss(e.fs),
			attenuationAtFp: band ? null : loss(e.fp),
			attenuationAtFsl: band ? loss(e.fsl) : null,
			attenuationAtFsh: band ? loss(e.fsh) : null,
			attenuationAtFl: band ? loss(e.fl) : null,
			attenuationAtFh: band ? loss(e.fh) : null,
			stock
		};
	}

	const SPECS = [
		{ label: 'default low-pass', filterType: 'lowpass', fp: 10000, fs: 35000, amaxDb: 3, aminDb: 40 },
		{ label: 'loose low-pass, order 1', filterType: 'lowpass', fp: 10000, fs: 100000, amaxDb: 3, aminDb: 15 },
		{ label: 'low-pass, small Amax', filterType: 'lowpass', fp: 1000, fs: 4000, amaxDb: 0.5, aminDb: 50 },
		{ label: 'low-pass past order 8', filterType: 'lowpass', fp: 10000, fs: 11000, amaxDb: 0.5, aminDb: 60 },
		{ label: 'default high-pass', filterType: 'highpass', fp: 10000, fs: 3000, amaxDb: 3, aminDb: 40 },
		{ label: 'default band-pass', filterType: 'bandpass', fl: 1000, fh: 10000, fsl: 300, fsh: 30000, amaxDb: 3, aminDb: 40 },
		{ label: 'default band-stop', filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, amaxDb: 3, aminDb: 40 }
	];
	let designs = 0;
	for (const spec of SPECS) {
		for (const response of ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic']) {
			for (const topology of ['mfb', 'sallenKey', 'towThomas']) {
				for (const stock of Object.keys(STOCK)) {
					const values = pageValues(spec, response, topology, stock);
					configs++;
					if (values.design) designs++;
					for (const w of inspectFilter(`filter ${spec.label}/${response}/${topology}/${stock}`, filterBasics(values))) widgets.add(w);
				}
			}
		}
	}
	// an order raised past the minimum on panel 02's slider: stages 3 and 4 are drawn fixed
	for (const orderOverride of [5, 6, 8]) {
		configs++;
		designs++;
		for (const w of inspectFilter(`filter default low-pass/order ${orderOverride}`, filterBasics(pageValues(SPECS[0], 'butterworth', 'mfb', 'E24', orderOverride)))) widgets.add(w);
	}

	check(`filter basics: ${configs} configurations clean, ${designs} of them with a real design`, problems.length === before, `${problems.length - before} problems`);
	check('filter basics: no paragraph much over 130 words', longest.words <= 135, `${longest.words} words at ${longest.where}`);
	check('filter basics: the four figures are used', FILTER_FIGURES.every((w) => widgets.has(w)), [...widgets].join(', '));
	{
		// the page's own default, a full low-pass design: all four figures, fed by it
		const blocks = filterBasics(pageValues(SPECS[0], 'butterworth', 'mfb', 'E24'));
		const used = blocks.filter((b) => b.widget !== undefined);
		const byName = Object.fromEntries(used.map((b) => [b.widget, b.props]));
		check('filter basics: a full low-pass design uses the four figures', FILTER_FIGURES.every((w) => w in byName) && used.length === 4, used.map((b) => b.widget).join(', '));
		check(
			'filter basics: the figures get the design (realized stages, spec, stage table)',
			Array.isArray(byName['two-tones']?.stages) &&
				byName['two-tones'].stages.length === 2 &&
				byName['rc-on-spec']?.live === true &&
				byName['order-on-spec']?.n0 === 4 &&
				byName['stages-multiply']?.stages?.length === 2,
			`two-tones ${byName['two-tones']?.stages?.length} stages, order-on-spec n0 ${byName['order-on-spec']?.n0}, stages-multiply ${byName['stages-multiply']?.stages?.length} stages`
		);
	}
}

/* ------------------------------------------------------------ modulation */
{
	// the engines the AM page runs, loaded here so the section stands alone
	const { fitModel, modelFromIdss, modelFromRdsOn, parseMeasurements } = await import('../src/lib/modulation/jfetModel.js');
	const { designDiodeMixerModulator } = await import('../src/lib/modulation/diodeMixerModulator.js');
	const { designEnvelopeLowPass } = await import('../src/lib/modulation/envelopeFilter.js');
	const before = problems.length;
	let configs = 0;
	const widgets = new Set();
	const byMode = { jfet: new Set(), diode: new Set(), demod: new Set() };
	const texts = {};
	const run = (label, args) => {
		configs++;
		const blocks = modulationBasics(args);
		texts[label] = blocks;
		for (const w of inspect(`am ${label}`, blocks) ?? []) {
			widgets.add(w);
			byMode[args.mode ?? 'jfet']?.add(w);
		}
		// paragraphs stay short: about 130 words at most
		for (const b of blocks) if (b.p !== undefined && b.p.split(/\s+/).length > 140) problems.push(`am ${label}: paragraph of ${b.p.split(/\s+/).length} words, "${b.p.slice(0, 50)}"`);
		return blocks;
	};

	// JFET modulator: the page's defaults on every model it can build, both
	// cells, both carrier sources, with and without a design
	const measured = parseMeasurements(['-0.5  0.2  0.0627  1000', '-1.0  0.2  0.0695  1000', '-1.5  0.2  0.0780  1000', '-2.0  0.2  0.0889  1000', '-2.5  0.2  0.1032  1000', '-3.0  0.2  0.1231  1000', '-3.5  0.2  0.1524  1000'].join('\n'));
	const models = [
		['idss', modelFromIdss(-4, 5e-3), 0.85],
		['rdson', modelFromRdsOn(-4, 400), 0.85],
		['J111', modelFromRdsOn(-6.5, 30), 0.85],
		['measured', fitModel(measured, { low: -3.5, high: -0.5 }), 0.6]
	];
	const page = { swingFraction: 0.9, sourceAmplitude: 1, fmMin: 100, vcc: 12, fp: 55000, targetOutputAmplitude: 1, carrierSourceAmplitude: 1, carrierMargin: 0.5, opampSwing: 10.5, gbw: 3e6, slewRate: 13e6 };
	for (const [name, model, targetN] of models) {
		for (const topology of ['noninverting', 'inverting']) {
			for (const carrierFrom of ['source', 'wien']) {
				for (const carrierBuffer of topology === 'inverting' ? [true, false] : [true]) {
					const design = designJfetModulator({ ...page, model, topology, carrierBuffer, targetModulationIndex: targetN });
					for (const d of [design, null]) {
						run(`jfet/${name}/${topology}/${carrierFrom}/${carrierBuffer ? 'follower' : 'bare'}/${d ? 'design' : 'no design'}`, { mode: 'jfet', topology, carrierFrom, rectifierType: 'full', design: d, jfetModel: model, swingFraction: 0.9, targetN, fp: 55000, fm: 1000 });
					}
				}
			}
		}
	}
	// designs that take the other branches: within the GBW rule, no divider, no post-gain
	const idss = modelFromIdss(-4, 5e-3);
	run('jfet/rb within the rule', { mode: 'jfet', topology: 'noninverting', carrierFrom: 'source', design: designJfetModulator({ ...page, model: idss, rb: 3900 }), jfetModel: idss, swingFraction: 0.9, targetN: 0.85, fp: 55000, fm: 1000 });
	run('jfet/no divider', { mode: 'jfet', topology: 'noninverting', carrierFrom: 'source', design: designJfetModulator({ ...page, model: idss, carrierSourceAmplitude: 0.05, targetModulationIndex: 0.85 }), jfetModel: idss, swingFraction: 0.9, targetN: 0.85, fp: 55000, fm: 1000 });
	run('jfet/no post-gain', { mode: 'jfet', topology: 'inverting', carrierFrom: 'wien', design: designJfetModulator({ ...page, model: idss, topology: 'inverting', targetOutputAmplitude: 0.3 }), jfetModel: idss, swingFraction: 0.9, targetN: 0.85, fp: 55000, fm: 1000 });
	// bare configurations: nothing designed, fields emptied
	run('jfet/bare', { mode: 'jfet', topology: 'noninverting', carrierFrom: 'source', design: null, fp: 55000, fm: 1000 });
	run('jfet/empty fields', { mode: 'jfet', topology: 'inverting', carrierFrom: 'wien', design: null, jfetModel: null, swingFraction: null, targetN: null, fp: null, fm: NaN });
	run('jfet/nothing', {});

	// diode and tank: the page's defaults, a faster carrier, a tank that
	// lands on the carrier, and nothing designed
	const diodePage = { sidebandMargin: 3, targetModulationIndex: 0.8, carrierDrive: 2, vcc: 12 };
	for (const [fp, fm, amp, mod, inductance] of [
		[40000, 1000, 1, 1, 1e-3],
		[55000, 1500, 1, 0.5, 1e-3],
		[41093.6, 1000, 2, 1, 1e-3],
		[10000, 300, 0.5, 0.5, 10e-3]
	]) {
		const diodeDesign = designDiodeMixerModulator({ ...diodePage, fp, fmMax: fm, carrierAmplitude: amp, modAmplitude: mod, inductance });
		run(`diode/${fp}/${fm}`, { mode: 'diode', fp, fm, diodeDesign, carrierAmp: amp, modAmp: mod });
	}
	run('diode/no design', { mode: 'diode', fp: 40000, fm: 1000, diodeDesign: null, carrierAmp: 1, modAmp: 1 });
	run('diode/empty fields', { mode: 'diode', fp: null, fm: null, diodeDesign: null, carrierAmp: null, modAmp: NaN });

	// demodulator: both rectifiers, both responses, a few specs, and nothing designed
	for (const rectifierType of ['full', 'half']) {
		for (const response of ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic']) {
			for (const [fp, fm, amaxDb, aminDb, demoModIndex] of [
				[40000, 1000, 1, 40, 0.9],
				[55000, 2000, 0.5, 60, 0.5],
				[100000, 500, 3, 20, 1]
			]) {
				const rippleHz = rectifierType === 'full' ? 2 * fp : fp;
				const envelopeDesign = designEnvelopeLowPass({ response, amaxDb, aminDb, fp: fm, fs: rippleHz });
				run(`demod/${rectifierType}/${response}/${fp}/${fm}`, { mode: 'demod', rectifierType, fp, fm, envelopeDesign, demoModIndex, rippleHz, amaxDb, aminDb });
			}
		}
		run(`demod/${rectifierType}/no design`, { mode: 'demod', rectifierType, fp: 40000, fm: 1000, envelopeDesign: null, demoModIndex: 0.9, rippleHz: rectifierType === 'full' ? 80000 : 40000, amaxDb: 1, aminDb: 40 });
		run(`demod/${rectifierType}/empty fields`, { mode: 'demod', rectifierType, fp: null, fm: null, envelopeDesign: null, demoModIndex: null, rippleHz: NaN, amaxDb: null, aminDb: null });
	}

	check(`modulation basics: ${configs} configurations clean`, problems.length === before, `${problems.length - before} problems`);
	check('modulation basics: the wave, knob, bend and envelope figures are all used', ['am-wave', 'jfet-knob', 'diode-bend', 'envelope'].every((w) => widgets.has(w)), [...widgets].join(', '));
	check(
		'modulation basics: each mode shows its own two figures',
		byMode.jfet.has('am-wave') && byMode.jfet.has('jfet-knob') && byMode.diode.has('am-wave') && byMode.diode.has('diode-bend') && byMode.demod.has('am-wave') && byMode.demod.has('envelope') && !byMode.jfet.has('diode-bend') && !byMode.diode.has('envelope'),
		Object.entries(byMode)
			.map(([m, s]) => `${m}: ${[...s].join(' ')}`)
			.join('; ')
	);

	// the numbers come from the engines, not from the text: the defaults
	// reproduce the design's figures, and moving an input moves them
	const eqs = (label) => texts[label].filter((b) => b.eq !== undefined).map((b) => b.eq).join(' ');
	const words = (label) => texts[label].map((b) => b.p ?? '').join(' ');
	const jfetDefault = 'jfet/idss/noninverting/source/follower/design';
	check('modulation basics: the non-inverting defaults give K = 15.4, f_B = 105 kHz and n = 0.85', eqs(jfetDefault).includes('= 15.4') && eqs(jfetDefault).includes('105\\ \\text{kHz}') && eqs(jfetDefault).includes('= 0.85'));
	check('modulation basics: the inverting defaults give K = 4.88 and n = 0.91', eqs('jfet/idss/inverting/source/follower/design').includes('= 4.88') && words('jfet/idss/inverting/source/follower/design').includes('0.91 here'));
	{
		// f_0 is whatever the engine's stock capacitor (or pair) gives: taken from the engine, not typed here
		const dd = designDiodeMixerModulator({ ...diodePage, fp: 40000, fmMax: 1000, carrierAmplitude: 1, modAmplitude: 1, inductance: 1e-3 });
		const f0k = String(Number((dd.f0Actual / 1000).toPrecision(3)));
		const ideal = dd.idealIndex.toFixed(2);
		check(`modulation basics: the diode defaults give the engine's f_0 = ${f0k} kHz, Q = 6.67 and the ideal-switch index ${ideal}`, eqs('diode/40000/1000').includes(`${f0k}\\ \\text{kHz}`) && eqs('diode/40000/1000').includes('= 6.67') && eqs('diode/40000/1000').includes(`= ${ideal}`) && words('diode/40000/1000').includes(`n = ${dd.modulationIndex.toFixed(2)}`));
	}
	check('modulation basics: the demodulator defaults give f_c = 2.12 kHz and order 2', eqs('demod/full/butterworth/40000/1000').includes('2.12\\ \\text{kHz}') && words('demod/full/butterworth/40000/1000').includes('order 2 here'));
	{
		const moved = modulationBasics({ mode: 'jfet', topology: 'noninverting', carrierFrom: 'source', design: designJfetModulator({ ...page, model: idss, fp: 60000, targetModulationIndex: 0.8 }), jfetModel: idss, swingFraction: 0.9, targetN: 0.8, fp: 60000, fm: 1500 });
		const tex = moved.filter((b) => b.eq !== undefined).map((b) => b.eq).join(' ');
		check('modulation basics: a 60 kHz carrier and a 1.5 kHz message move the equations', tex.includes('60\\,000') && tex.includes('58\\,500') && tex.includes('= 0.80') && !tex.includes('55\\,000'));
	}
	// the symbolic line of the conductance equation defines beta the way the page's model was built
	{
		const knob = (label) => texts[label].find((b) => b.eq?.includes('G(V_{GS})'))?.eq ?? '';
		const idssEq = knob('jfet/idss/noninverting/source/follower/design');
		const rdsonEq = knob('jfet/rdson/noninverting/source/follower/design');
		const fitEq = knob('jfet/measured/noninverting/source/follower/design');
		check('modulation basics: the conductance equation defines beta from I_DSS, from r_DS(on), or not at all for a fit', idssEq.includes('I_{DSS}') && rdsonEq.includes('r_{DS(on)}') && !rdsonEq.includes('I_{DSS}') && !fitEq.includes('I_{DSS}') && fitEq.includes('mS/V'));
	}
	// the inverting cell's figure is drawn after the post-gain stage, so the text must not claim it shows the cell's values
	check('modulation basics: the inverting cell with post-gain says the figure peaks at the output value', words('jfet/idss/inverting/source/follower/design').includes('peaks at 1.95 V') && !words('jfet/idss/inverting/source/follower/design').includes('prints the same two values'));
	// the demodulator explains the decibel before its first dB in the prose
	check(
		'modulation basics: the demodulator explains decibels before the first dB',
		Object.keys(texts)
			.filter((label) => label.startsWith('demod/'))
			.every((label) => {
				const text = words(label);
				const first = text.search(/\d dB\b/);
				return first < 0 || (text.indexOf('decibel') >= 0 && text.indexOf('decibel') < first);
			})
	);
}

for (const p of problems.slice(0, 40)) console.log('   - ' + p);
console.log(`\n${counts.blocks} blocks, ${counts.equations} equations, ${counts.widgets} figures, ${counts.paragraphs} paragraphs, ${counts.terms} glossary entries`);
console.log(failures === 0 ? 'basics checks clean' : `${failures} basics check(s) failed (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
