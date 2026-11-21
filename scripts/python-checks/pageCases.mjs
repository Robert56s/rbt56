// The designs the page's checks ran through its JavaScript download, the
// script filter-design.py replaced (check-filter.mjs's "downloadable
// script" checks), each now through the Python file and every check of
// check-python.mjs; what those checks said of the page itself (its parts
// meet the template, a stage it cannot build, the op-amp its stages are
// built for) stays in check-filter.mjs, which reads the page alone. Each
// group says which check it comes from; where one asked more of the script
// than the page's parts, opts.expect holds what still means something for
// the Python file. The circuits are the other families' (no rule of its own).

import { LAB_KIT } from '../../src/lib/filter/eseries.js';
import { transitionRatio } from '../../src/lib/filter/order.js';
import { SOURCE_R_DEFAULT } from '../../src/lib/filter/partSearch.js';
import { minimumOrder } from '../../src/lib/filter/stages.js';
import { OPAMP_GBW } from '../../src/lib/spice/opamps.js';
import { BAND_SPECS } from '../lib-band.mjs';
import { PAGE_CASES, pageParts } from '../lib-parts.mjs';

const KIT = { resistorStock: LAB_KIT.resistors, capacitorStock: LAB_KIT.capacitors };
const out = [];
const add = (label, args, opts = {}) => out.push([label, args, opts]);
const zeros = (r) => r === 'elliptic' || r === 'inverseChebyshev';

// (1) the new responses, centred, a band filter's side with zeros on Tow-Thomas and its other on MFB
// (or Sallen-Key): the page's parts meet the template there (check-filter.mjs keeps that). The script
// also stopped on a side with zeros on MFB or Sallen-Key; the page designs nothing there (its menus
// wait for Tow-Thomas or Boctor), so it offers no file to check.
{
	const base = { fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {}, placement: 'centred' };
	const band = (s) => s.filterType === 'bandpass' || s.filterType === 'bandstop';
	const wiring = (s, other = 'mfb') => (band(s) ? { topology: 'mfb', topologyHp: zeros(s.responseHp) ? 'towThomas' : other, topologyLp: zeros(s.responseLp) ? 'towThomas' : other } : { topology: zeros(s.response) ? 'towThomas' : other });
	const specs = [
		['elliptic low-pass', { filterType: 'lowpass', response: 'elliptic', amaxDb: 1, aminDb: 40, fp: 10000, fs: 20000 }],
		['inverse Chebyshev high-pass', { filterType: 'highpass', response: 'inverseChebyshev', amaxDb: 1, aminDb: 40, fp: 10000, fs: 4000 }],
		['Bessel low-pass', { filterType: 'lowpass', response: 'bessel', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 }],
		['Legendre low-pass', { filterType: 'lowpass', response: 'legendre', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 }],
		['band-stop of two branches, a Butterworth high-pass and an elliptic low-pass branch', { filterType: 'bandstop', response: 'elliptic', responseHp: 'butterworth', responseLp: 'elliptic', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 }],
		['band-pass cascade, a Legendre high-pass and an inverse Chebyshev low-pass section', { filterType: 'bandpass', response: 'legendre', responseHp: 'legendre', responseLp: 'inverseChebyshev', amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 }]
	];
	for (const [label, s] of specs) add(`a new response, centred: ${label}, E24`, { ...base, ...s, ...wiring(s) });
	const bp = specs[5][1];
	add('a new response, centred: the band-pass cascade with its Legendre section on Sallen-Key', { ...base, ...bp, ...wiring(bp, 'sallenKey') });
}

// (2) a band filter's limits side by side: a band-pass with an Amax and an Amin per side, a band-stop
// with an Amax per branch and one Amin, and the band-pass's low-pass side held to an order built for 30
// dB, read against its own 60 dB
{
	const base = { fp: 10000, fs: 35000, order: null, orderHp: null, orderLp: null, capOverrides: {}, response: 'butterworth', responseHp: 'butterworth', responseLp: 'butterworth', topology: 'mfb', amaxDb: 3, aminDb: 40 };
	const edgesBp = { fl: 1000, fh: 10000, fsl: 300, fsh: 30000 };
	const edgesBs = { fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 };
	const sides = { amaxDbHp: 1, aminDbHp: 30, amaxDbLp: 0.5, aminDbLp: 60 };
	const limits = (c) => (c?.sides ?? []).map((s) => s.limit).join(' and ');
	add('limits side by side: a band-pass cascade, Amax 1 and 0.5 dB, Amin 30 and 60 dB', { ...base, filterType: 'bandpass', ...edgesBp, ...sides }, {
		expect: [
			'each side read against its own limits: 1 dB at fl and 0.5 dB at fh, 30 dB below the band and 60 dB above',
			(r, stdout) => [
				...(stdout.includes('passband 1 kHz to 10 kHz: at most 1 dB of loss at fl, 0.5 dB at fh') ? [] : ['the template line of the passband']),
				...(limits(r.page_check) === '30 and 60' && limits(r.own_check) === '30 and 60' ? [] : [`the stopband limits ${limits(r.page_check)}`])
			]
		]
	});
	add('limits side by side: a band-stop of two branches, Amax 0.5 and 1 dB, one Amin of 50 dB', { ...base, filterType: 'bandstop', ...edgesBs, ...sides, aminDb: 50 }, {
		expect: [
			'each branch read against its own Amax, the stopband against the one Amin',
			(r, stdout) =>
				['passband 10 Hz to 1 kHz: at most 0.5 dB of loss', 'passband 30 kHz to 3 MHz: at most 1 dB of loss', 'stopband 3 kHz to 10 kHz: at least 50 dB of loss'].filter((line) => !stdout.includes(line)).concat(r.page_check?.stop.limit === 50 ? [] : [`the stopband limit ${r.page_check?.stop.limit}`])
		]
	});
	const nFor30 = minimumOrder('butterworth', 0.5, 30, transitionRatio(10000, 30000)).n;
	add(`limits side by side: the band-pass with its low-pass side of order ${nFor30}, built for 30 dB`, { ...base, filterType: 'bandpass', ...edgesBp, ...sides, orderLp: nFor30 }, {
		expect: ['the low-pass side read against its own 60 dB, and short of it', (r) => (r.page_check?.sides?.[1]?.limit === 60 && r.page_check.sides[1].margin < 0 && r.page_check.meets === false ? [] : [`above the band: ${JSON.stringify(r.page_check?.sides?.[1])}`])]
	});
}

// (3) pairs on (RESISTOR_PAIRS): an MFB low-pass and a Chebyshev high-pass on Tow-Thomas, the lab kit
// with pairs, on the edge and centred (the pairs as the stock's two parts: every design's check (d))
{
	const base = { amaxDb: 3, aminDb: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {}, ...KIT, resistorPairs: true };
	for (const placement of ['edge', 'centred']) {
		add(`pairs: Butterworth low-pass, MFB, lab kit, ${placement}`, { ...base, filterType: 'lowpass', response: 'butterworth', topology: 'mfb', fp: 10000, fs: 35000, placement });
		add(`pairs: Chebyshev high-pass, Tow-Thomas, lab kit, ${placement}`, { ...base, filterType: 'highpass', response: 'chebyshev', topology: 'towThomas', fp: 10000, fs: 3000, placement });
	}
}

// (4) Boctor: the inverse Chebyshev and the elliptic low-pass on E24
for (const response of ['inverseChebyshev', 'elliptic']) add(`Boctor ${response} low-pass, E24`, { filterType: 'lowpass', response, topology: 'boctor', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, capOverrides: {} });

// (5) transformed: the narrow band-pass on MFB band-pass stages with Boctor notches and on Tow-Thomas
// for an elliptic response, the default band-stop on Boctor notches, centred and on the edge, and the
// narrow band-pass held to order 2, short of its 50 dB
{
	const sideOf = (response) => (zeros(response) ? 'towThomas' : 'mfb');
	const args = (spec, response, topologyBand, topologyNotch, orderBand = null, placement = 'centred') => ({
		filterType: spec.filterType,
		response,
		responseHp: response,
		responseLp: response,
		topology: sideOf(response),
		topologyHp: sideOf(response),
		topologyLp: sideOf(response),
		amaxDb: spec.amaxDb,
		amaxDbHp: spec.amaxDb,
		amaxDbLp: spec.amaxDb,
		aminDb: spec.aminDb ?? spec.aminDbHigh,
		aminDbHp: spec.aminDbLow ?? spec.aminDb,
		aminDbLp: spec.aminDbHigh ?? spec.aminDb,
		fl: spec.fl,
		fh: spec.fh,
		fsl: spec.fsl,
		fsh: spec.fsh,
		fp: 10000,
		fs: 35000,
		order: null,
		orderHp: null,
		orderLp: null,
		capOverrides: {},
		bandMethod: 'transformed',
		topologyBand,
		topologyNotch,
		orderBand,
		placement
	});
	for (const placement of ['centred', 'edge']) {
		add(`transformed: the narrow band-pass, Butterworth, MFB with Boctor notches, ${placement}`, args(BAND_SPECS.narrowBp, 'butterworth', 'mfb', 'boctor', null, placement));
		add(`transformed: the narrow band-pass, elliptic, Tow-Thomas with Tow-Thomas notches, ${placement}`, args(BAND_SPECS.narrowBp, 'elliptic', 'towThomas', 'towThomas', null, placement));
		add(`transformed: the default band-stop, Butterworth, Boctor notches, ${placement}`, args(BAND_SPECS.defaultBs, 'butterworth', 'mfb', 'boctor', null, placement));
	}
	add('transformed: the narrow band-pass held to order 2', args(BAND_SPECS.narrowBp, 'butterworth', 'mfb', 'boctor', 2));
}

// (6) the op-amp (OPAMP_GBW): the narrow band-pass transformed, its MFB band-pass stages built for the
// TL082, for the LM741 (which leaves a stage a loop gain under 2: the page cannot build it) and for an
// ideal op-amp
{
	const spec = BAND_SPECS.narrowBp;
	const args = { amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, order: null, orderHp: null, orderLp: null, filterType: 'bandpass', response: 'butterworth', responseHp: 'butterworth', responseLp: 'butterworth', topology: 'mfb', amaxDbHp: spec.amaxDb, amaxDbLp: spec.amaxDb, aminDbHp: spec.aminDbLow, aminDbLp: spec.aminDbHigh, fl: spec.fl, fh: spec.fh, fsl: spec.fsl, fsh: spec.fsh, capOverrides: {}, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor' };
	add('the op-amp: the narrow band-pass transformed, MFB for the TL082', { ...args, opampGbw: OPAMP_GBW.TL082, mfbOpamp: 'TL082' });
	add('the op-amp: the narrow band-pass transformed, MFB for the LM741 (a stage the page cannot build)', { ...args, opampGbw: OPAMP_GBW.LM741, mfbOpamp: 'LM741' });
	add('the op-amp: the narrow band-pass transformed, MFB for an ideal op-amp', { ...args, opampGbw: null, mfbOpamp: 'ideal' });
}

// (7) a limit on the pairs (RESISTOR_PAIR_LIMIT): four filters on the lab kit with pairs, the page's
// parts under N = 1 (on the edge), 2 (centred) and 3 (on the edge), and with no limit (centred); then a
// list too short for some stages, the stages it cannot build on the full E24 and E6 grids, N = 1 and
// one under the count of pairs where they help
{
	const base = { amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {}, ...KIT, resistorPairs: true };
	const filters = [
		['Butterworth low-pass, MFB', { filterType: 'lowpass', response: 'butterworth', topology: 'mfb', amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000 }],
		['Chebyshev low-pass, Tow-Thomas', { filterType: 'lowpass', response: 'chebyshev', topology: 'towThomas', amaxDb: 1, aminDb: 60, fp: 10000, fs: 20000 }],
		['elliptic low-pass, Boctor', { filterType: 'lowpass', response: 'elliptic', topology: 'boctor', amaxDb: 0.5, aminDb: 60, fp: 10000, fs: 13000 }],
		['the narrow band-pass transformed, MFB for the TL082', { filterType: 'bandpass', response: 'butterworth', topology: 'mfb', amaxDb: 3, aminDb: 40, amaxDbHp: 3, amaxDbLp: 3, aminDbHp: BAND_SPECS.narrowBp.aminDbLow, aminDbLp: BAND_SPECS.narrowBp.aminDbHigh, fl: BAND_SPECS.narrowBp.fl, fh: BAND_SPECS.narrowBp.fh, fsl: BAND_SPECS.narrowBp.fsl, fsh: BAND_SPECS.narrowBp.fsh, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.TL082 }]
	];
	for (const [label, spec] of filters) {
		for (const n of [1, 2, 3]) add(`pair limit: ${label}, lab kit, up to ${n} pair${n > 1 ? 's' : ''}`, { ...base, ...spec, resistorPairLimit: n, placement: n === 2 ? 'centred' : 'edge' });
		add(`pair limit: ${label}, lab kit, pairs where they help, centred`, { ...base, ...spec, placement: 'centred' });
	}
	const short = { filterType: 'bandpass', response: 'chebyshev', topology: 'mfb', amaxDb: 3, aminDb: 40, amaxDbHp: 3, amaxDbLp: 3, aminDbHp: 40, aminDbLp: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, fp: 10000, fs: 35000, order: null, orderHp: null, orderLp: null, capOverrides: {}, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.TL082, resistorStock: [1000, 2200, 4700, 10000, 22000, 47000], capacitorStock: [1e-9, 1e-8, 1e-7], resistorPairs: true };
	const total = pageParts({ ...short, resistorPairLimit: 1 }).result.pairPlan?.total ?? 2;
	for (const n of [...new Set([1, Math.max(1, total - 1)])]) add(`pair limit, a short list: Chebyshev band-pass transformed, MFB for the TL082, up to ${n} of ${total} pairs`, { ...short, resistorPairLimit: n });
}

// (8) the narrow band-pass: the rule's pick and the menu's circuits, Q or B, gains under and over
// one, capacitors typed, the MFB stages for the TL082, and a limit of one pair
{
	const E24 = { resistorStock: 'E24', capacitorStock: null };
	const narrow = (label, spec, circuitMenu, capOverrides, stock, opampGbw, more = {}) =>
		add(`narrow band-pass: ${label}`, { filterType: 'narrowband', f0: spec.f0, narrowBy: spec.q ? 'q' : 'b', q: spec.q ?? null, bandwidth: spec.bandwidth ?? null, gain: spec.gain, stages: spec.stages, circuitMenu, opampGbw, capOverrides, ...stock, resistorPairs: false, ...more });
	narrow('the reference, auto', { f0: 10000, q: 5, gain: 1, stages: 1 }, 'auto', {}, E24, null);
	narrow('gyrator, K 4 over three stages', { f0: 10000, q: 5, gain: 4, stages: 3 }, 'rlcGyrator', {}, E24, null);
	narrow('state variable by B, K 0.2', { f0: 2000, bandwidth: 250, gain: 0.2, stages: 2 }, 'khnBp', {}, { resistorStock: 'E96', capacitorStock: null }, null);
	narrow('GIC, 10 nF typed for stage 1', { f0: 10000, q: 5, gain: 1, stages: 2 }, 'rlcGic', { 0: { C: 1e-8 } }, E24, null);
	narrow('MFB built for the TL082, the lab kit', { f0: 10000, q: 8, gain: 1, stages: 1 }, 'mfbBp', {}, KIT, OPAMP_GBW.TL082);
	narrow('Sallen-Key, Q 20, 100 kHz', { f0: 100000, q: 20, gain: 1, stages: 1 }, 'sallenKeyBp', {}, E24, null);
	narrow('Sallen-Key, lab kit, up to 1 pair', { f0: 10000, q: 5, gain: 1, stages: 2 }, 'sallenKeyBp', {}, KIT, null, { resistorPairs: true, resistorPairLimit: 1 });
	narrow('auto, lab resistors, up to 1 pair', { f0: 10000, q: 5, gain: 1, stages: 1 }, 'auto', {}, { resistorStock: LAB_KIT.resistors, capacitorStock: null }, null, { resistorPairs: true, resistorPairLimit: 1 });
}

// (9) the page's parts, word for word: every type, both band methods, both placements, the stocks,
// pairs under a limit, capacitors typed, the op-amp of a transformed band-pass, a source resistance
// (the band-stop's shared node among them), the set past the limits and the op-amps the alerts name
{
	const base = { amaxDb: 3, aminDb: 40, fp: 10000, fs: 35000, fl: 1000, fh: 10000, fsl: 300, fsh: 30000, order: null, orderHp: null, orderLp: null, capOverrides: {}, response: 'butterworth', topology: 'mfb' };
	const cases = [
		['low-pass, lab kit', { filterType: 'lowpass', ...KIT }],
		['high-pass, Sallen-Key, E24', { filterType: 'highpass', fs: 3000, topology: 'sallenKey' }],
		['band-pass cascade, Tow-Thomas, lab resistors', { filterType: 'bandpass', topology: 'towThomas', resistorStock: LAB_KIT.resistors }],
		['band-stop of two branches, lab kit', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, ...KIT }],
		['narrow band-pass transformed, TL082, lab kit, 2 pairs', { filterType: 'bandpass', fl: 40000, fh: 60000, fsl: 10000, fsh: 100000, aminDbHp: 50, aminDbLp: 30, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.TL082, ...KIT, resistorPairs: true, resistorPairLimit: 2 }],
		['band-stop transformed, Boctor, E96', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', resistorStock: 'E96' }],
		['elliptic low-pass, Tow-Thomas, lab kit, 10 nF typed', { filterType: 'lowpass', response: 'elliptic', amaxDb: 1, fs: 20000, topology: 'towThomas', ...KIT, capOverrides: { 0: { C: 1e-8 } } }],
		['low-pass, lab kit, capacitors typed, LTspice on a TL082', { filterType: 'lowpass', ...KIT, capOverrides: { 0: { C1: 1e-7, C2: 4.7e-9 }, 1: { C1: 4.7e-8, C2: 1e-9 } }, spiceOpamp: 'TL082' }],
		['Chebyshev high-pass, Tow-Thomas, lab kit, 1 pair', { filterType: 'highpass', response: 'chebyshev', amaxDb: 1, fp: 3000, fs: 1000, topology: 'towThomas', ...KIT, resistorPairs: true, resistorPairLimit: 1 }],
		['the default band-pass, transformed, MFB for the LM741, lab kit, 50 ohm source', { filterType: 'bandpass', bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.LM741, mfbOpamp: 'LM741', spiceOpamp: 'TL082', ...KIT, sourceR: SOURCE_R_DEFAULT }],
		['low-pass, Sallen-Key, E24, 600 ohm source', { filterType: 'lowpass', response: 'chebyshev', amaxDb: 1, fs: 25000, topology: 'sallenKey', sourceR: 600, spiceOpamp: 'LM741' }],
		['band-stop of two branches, MFB, E24, 600 ohm source', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, sourceR: 600 }],
		['band-stop transformed, Boctor, lab kit, 50 ohm source, past the limits', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', ...KIT, sourceR: SOURCE_R_DEFAULT, pastLimits: true, spiceOpamp: 'LM741' }],
		['band-stop transformed, Boctor, lab kit, 50 ohm source, within the limits', { filterType: 'bandstop', fl: 1000, fh: 30000, fsl: 3000, fsh: 10000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', ...KIT, sourceR: SOURCE_R_DEFAULT, spiceOpamp: 'ideal' }],
		// (centred only: on the edge an LM741 leaves a stage a loop gain under 2, and the page refuses it)
		['Chebyshev band-pass transformed, MFB for the LM741, lab resistors, past the limits', { filterType: 'bandpass', response: 'chebyshev', amaxDb: 1, fl: 10000, fh: 40000, fsl: 3000, fsh: 120000, bandMethod: 'transformed', topologyBand: 'mfb', topologyNotch: 'boctor', opampGbw: OPAMP_GBW.LM741, mfbOpamp: 'LM741', spiceOpamp: 'TL082', resistorStock: LAB_KIT.resistors, pastLimits: true }, ['centred']]
	];
	for (const [label, spec, placements = ['edge', 'centred']] of cases) for (const placement of placements) add(`the page's parts: ${label}, ${placement}`, { ...base, ...spec, placement });
}

// (10) the design shown of the "Next design" list (DESIGN_INDEX): designs 1, 2 and the last of five of
// the page's cases (lib-parts.mjs), both placements, and on the edge the first design with a stage the
// centred design's search rounded (fromCentred), where the list holds one; past the end of the list,
// the page shows design 1
{
	const picked = ['low-pass, Sallen-Key, lab kit, pairs', 'narrow band-pass transformed, TL082, lab kit, 2 pairs', 'the default band-pass, transformed, MFB for the LM741, lab kit, 50 ohm source', 'band-stop of two branches, Tow-Thomas, lab resistors, 600 ohm source', 'band-stop transformed, Boctor, lab kit, 50 ohm source, past the limits'];
	for (const label of picked) {
		const spec = PAGE_CASES.find(([l]) => l === label)?.[1];
		if (!spec) throw new Error(`pageCases.mjs: no page case "${label}"`);
		for (const placement of ['edge', 'centred']) {
			const args = { order: null, orderHp: null, orderLp: null, capOverrides: {}, ...spec, placement };
			const found = pageParts(args).found;
			const count = found.designs.count();
			const centredAt = placement === 'edge' ? Array.from({ length: count }, (_, i) => i).find((i) => found.designs.at(i)?.fromCentred?.some(Boolean)) : undefined;
			const indices = [...new Set([0, 1, count - 1, ...(centredAt === undefined ? [] : [centredAt])])];
			if (label === picked[0] && placement === 'edge') indices.push(count + 1);
			for (const designIndex of indices) add(`design ${designIndex + 1} of ${count}: ${label}, ${placement}`, { ...args, designIndex });
		}
	}
}

export default { name: "the JavaScript script's designs", key: 'page', strict: true, circuits: {}, cases: out };
