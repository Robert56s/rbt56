<script>
	import { designBoctorNotch, designBoctorNotchFromCap, boctorFeasible } from '$lib/filter/boctor';
	import { explainBoctor } from '$lib/filter/explainBoctor';
	import { onMount, untrack } from 'svelte';
	import BasicsPanel from '$lib/components/BasicsPanel.svelte';
	import BuildPanel from '$lib/components/BuildPanel.svelte';
	import { stockWords } from '$lib/filter/handDesign';
	import OrderOnSpecDemo from '$lib/components/basics/OrderOnSpecDemo.svelte';
	import RcOnSpecDemo from '$lib/components/basics/RcOnSpecDemo.svelte';
	import StagesMultiplyDemo from '$lib/components/basics/StagesMultiplyDemo.svelte';
	import TwoTonesDemo from '$lib/components/basics/TwoTonesDemo.svelte';
	import BodePlot from '$lib/components/BodePlot.svelte';
	import CircuitDiagram from '$lib/components/CircuitDiagram.svelte';
	import { filterBasics } from '$lib/filter/basics';
	import Equation from '$lib/components/Equation.svelte';
	import MathPanel from '$lib/components/MathPanel.svelte';
	import OpampPicker from '$lib/components/OpampPicker.svelte';
	import StockPicker from '$lib/components/StockPicker.svelte';
	import { generateScript, narrowNextSteps as narrowNextStepsOf, nextSteps } from '$lib/filter/codegen';
	import { generateSchematic } from '$lib/filter/spice';
	import { DEFAULT_OPAMP, OPAMP_GBW, OPAMP_MODELS } from '$lib/spice/opamps';
	import {
		explainApproximation,
		explainBandTransform,
		explainFirstOrder,
		explainFirstOrderHp,
		explainHpStage,
		explainMfb,
		explainMfbBp,
		explainMfbHp,
		explainNarrowBandCircuit,
		explainNarrowBandOrder,
		explainNarrowBandStage,
		explainOrder,
		explainSallenKey,
		explainSallenKeyHp,
		explainStage,
		explainSummingAmp,
		explainTowThomas,
		explainTowThomasBp,
		explainTowThomasHp,
		explainTransformedOrder,
		explainTransformedStage
	} from '$lib/filter/explain';
	import { designFirstOrderLowPass, designFirstOrderLowPassFromCap } from '$lib/filter/firstOrder';
	import { designFirstOrderHighPass, designFirstOrderHighPassFromCap } from '$lib/filter/firstOrderHighPass';
	import { formatFarads, formatHz, formatOhms, formatPercent, relativeErrorPercent } from '$lib/filter/format';
	import { designMfbLowPass, designMfbLowPassFromCaps } from '$lib/filter/mfb';
	import { designMfbHighPass, designMfbHighPassFromCap } from '$lib/filter/mfbHighPass';
	import { designMfbBandPass, designMfbBandPassFromCaps, mfbBandPassEffective } from '$lib/filter/mfbBandPass';
	import { bandBoctorDesign, chooseBandMethod, mfbBandPassFeasible, opampCount, plannedTopology } from '$lib/filter/bandMethod';
	import { transitionRatio } from '$lib/filter/order';
	import { RESPONSES, SEARCH_LIMIT } from '$lib/filter/approximations';
	import { explainTowThomasNotch, orderSummaryTex } from '$lib/filter/explainResponses';
	import { designSallenKeyLowPass, designSallenKeyLowPassFromCaps, capRatio } from '$lib/filter/sallenKey';
	import {
		designSallenKeyHighPass,
		designSallenKeyHighPassFromCap,
		resistorRatioHp as capRatioHp
	} from '$lib/filter/sallenKeyHighPass';
	import {
		designTowThomasBandPass,
		designTowThomasBandPassFromCap,
		designTowThomasHighPass,
		designTowThomasHighPassFromCap,
		designTowThomasLowPass,
		designTowThomasLowPassFromCap,
		designTowThomasNotch,
		designTowThomasNotchFromCap
	} from '$lib/filter/towThomas';
	import {
		mfbBpSensitivity,
		mfbSensitivity,
		MFB_HP_SENSITIVITY,
		SALLEN_KEY_SENSITIVITY,
		SALLEN_KEY_HP_SENSITIVITY,
		TOW_THOMAS_BP_SENSITIVITY,
		TOW_THOMAS_SENSITIVITY,
		TOW_THOMAS_HP_SENSITIVITY,
		TOW_THOMAS_NOTCH_SENSITIVITY,
		worstCaseQError
	} from '$lib/filter/sensitivity';
	import {
		designLowPass,
		designHighPass,
		designBandPass,
		designBandStop,
		designBandPassTransformed,
		designBandStopTransformed,
		bandCentre,
		minimumOrder,
		notchOptions
	} from '$lib/filter/stages';
	import { branchDcGain, branchOrder, branchSign, combinerChoice, combinerDesign, magnitudePhaseAt, sweep, magnitudePhaseAtParallelSum, sweepParallelSum, responseAt } from '$lib/filter/bode';
	import { buildDifferenceAmpDiagram, buildSummingAmpDiagram } from '$lib/filter/circuits';
	import { C_FLOOR, nearestResistor, pairDiagramLabel, pairLabel } from '$lib/filter/eseries';
	import { filterPairLimitSentence, filterPairPlanSummary, planFilterPairs } from '$lib/filter/pairPlan';
	import { compareNarrowCircuits, designNarrowBand, narrowDefaultCircuit, narrowFigures, narrowFit, narrowLabelInText, narrowLimitPairs, narrowNetlistResponse, narrowStability, narrowStageSensitivity, realizeNarrow, NARROW_CIRCUITS, NARROW_GAIN_SPEED, NARROW_LABELS, NARROW_MAX_STAGES, NARROW_REAL_GBW, NARROW_RULE, NARROW_RULE_TEXT } from '$lib/filter/narrowBand';
	import { sallenKeyBpLimit } from '$lib/filter/sallenKeyBandPass';
	import { componentOptions, defaultStock, isRestricted, loadStock, saveStock } from '$lib/stock';

	const SUMMING_R = 10_000; // ohms, the summing amplifier's three equal resistors

	const MAX_ORDER = 16;

	let amaxDb = $state(3);
	let aminDb = $state(40);
	// a band-pass or band-stop is two filters, so each side has its own
	// limits too: Amax for either, and Amin for a band-pass's two sides (a
	// band-stop keeps one Amin, see aminSideHp below)
	let amaxDbHp = $state(3);
	let aminDbHp = $state(40);
	let amaxDbLp = $state(3);
	let aminDbLp = $state(40);
	let fp = $state(10000);
	let fs = $state(35000);
	let fl = $state(1000);
	let fh = $state(10000);
	let fsl = $state(300);
	let fsh = $state(30000);
	let filterType = $state('lowpass');
	let response = $state('butterworth');
	// a band-pass or band-stop is two independent filters, so each side can
	// have its own response
	let responseHp = $state('butterworth');
	let responseLp = $state('butterworth');
	let topology = $state('mfb');
	// a band-pass or band-stop has one topology per side too, so a side with
	// zeros can be Tow-Thomas while the other stays MFB or Sallen-Key
	let topologyHp = $state('mfb');
	let topologyLp = $state('mfb');
	// A band filter can also be built the other way: one low-pass prototype
	// turned into band-pass stages (notch stages for a band-stop) around f0,
	// which builds a narrow band with far fewer op-amps. 'auto' takes the
	// method with fewer op-amps, and a tie keeps the cascade.
	let bandMethod = $state('auto'); // 'auto' | 'cascade' | 'transformed'
	let topologyBand = $state('mfb'); // band-pass stages: 'mfb' | 'towThomas'
	let topologyNotch = $state('boctor'); // notch stages: 'boctor' (Tow-Thomas where Boctor cannot) | 'towThomas'
	// The op-amp a transformed band-pass's MFB band-pass stages are built
	// for (mfbBandPass.js): each stage's circuit is designed at a higher f0
	// and a lower Q, so that this op-amp brings it onto its target. 'TL082'
	// and 'LM741' take the single-pole figure measured on their models
	// (OPAMP_GBW), 'other' the gain-bandwidth typed in MHz, 'ideal' none.
	let mfbOpamp = $state('TL082'); // 'TL082' | 'LM741' | 'ideal' | 'other'
	let mfbGbwMHz = $state(OPAMP_GBW.TL082 / 1e6);
	/** The gain-bandwidth (Hz) picked for the MFB band-pass stages, or null for an ideal op-amp. */
	const mfbGbwChosen = $derived(
		mfbOpamp === 'ideal' ? null : mfbOpamp === 'other' ? (Number(mfbGbwMHz) > 0 && Number.isFinite(Number(mfbGbwMHz)) ? Number(mfbGbwMHz) * 1e6 : null) : OPAMP_GBW[mfbOpamp]
	);
	/** The same where it applies: the MFB band-pass stages of a band-pass (a transformed design's only), else null. */
	const mfbGbw = $derived(filterType === 'bandpass' && topologyBand === 'mfb' ? mfbGbwChosen : null);
	/** The op-amp picked, as a sentence names it: a part with its figure, or a single-pole op-amp of the typed one. */
	const mfbOpampLabel = $derived(
		mfbOpamp === 'TL082' || mfbOpamp === 'LM741'
			? `the ${mfbOpamp === 'TL082' ? 'TL082 / TL072' : 'LM741'} (${formatHz(mfbGbwChosen)}, single pole)`
			: `a single-pole op-amp of ${formatHz(mfbGbwChosen ?? 0)}`
	);
	// what selecting the transformation merged, shown until the next change
	let mergeNote = $state('');
	const RESPONSE_KEYS = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];

	// A narrow band-pass picks out one frequency with one second-order
	// band-pass stage, or N identical ones in series (narrowBand.js). Its
	// spec: f0, Q or the -3 dB bandwidth B (Q = f0 / B: the one typed, the
	// other shown), the gain K at f0 and N. Six circuits can build a stage:
	// the table in panel 04 builds the spec on each, and the Circuit menu
	// takes the one its rule finds best unless another one is picked.
	let narrowF0 = $state(10000);
	let narrowBy = $state('q'); // 'q' | 'b': which of Q and B is typed
	let narrowQ = $state(5);
	let narrowB = $state(2000);
	let narrowK = $state(1);
	let narrowN = $state(1);
	let narrowCircuit = $state('auto'); // 'auto' | one of NARROW_CIRCUITS
	const isNarrow = $derived(filterType === 'narrowband');
	const posNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
	/** The overall Q, typed or from B, or NaN. */
	const narrowQValue = $derived(narrowBy === 'q' ? Number(narrowQ) : posNum(narrowB) ? narrowF0 / narrowB : NaN);
	const narrowValid = $derived(posNum(narrowF0) && posNum(narrowQValue) && posNum(narrowK) && Number.isInteger(narrowN) && narrowN >= 1 && narrowN <= NARROW_MAX_STAGES);
	/** Q or B typed: the other one follows, rounded to four figures, so switching back and forth keeps the band. */
	function selectNarrowBy(value) {
		if (value === 'b' && posNum(narrowF0) && posNum(narrowQ)) narrowB = Number((narrowF0 / narrowQ).toPrecision(4));
		if (value === 'q' && posNum(narrowF0) && posNum(narrowB)) narrowQ = Number((narrowF0 / narrowB).toPrecision(4));
		narrowBy = value;
	}

	// Which values the component search is allowed to pick from: a preferred
	// series, the lab drawer, or a list pasted in below. Restricting the
	// stock does not change the design, only what it can round to, so the
	// cost shows up in the f0/Q error columns rather than in the maths. The
	// setting is the site's (src/lib/stock.js): the AM tool shares it, and it
	// is kept in this browser. With a list, `pairs` lets the resistors that
	// set f0, Q or a zero be two in series (pairedResistor in eseries.js),
	// and `pairLimit` caps how many in the whole filter (null: no cap).
	const initialStock = defaultStock();
	let stock = $state(initialStock.stock); // 'E24' | 'E96' | 'lab' | 'labR' | 'custom'
	let resistorText = $state(initialStock.resistorText);
	let capacitorText = $state(initialStock.capacitorText);
	let pairs = $state(initialStock.pairs);
	let pairLimit = $state(initialStock.pairLimit);
	let stockLoaded = $state(false);
	const restrictedStock = $derived(isRestricted(stock));
	const componentOpts = $derived(componentOptions(stock, resistorText, capacitorText, pairs, pairLimit));
	const stockPhrase = $derived(
		(stock === 'E96' ? 'the E96 series' : stock === 'lab' ? 'the lab kit' : stock === 'labR' ? 'the lab resistors' : stock === 'custom' ? 'the list on hand' : 'the E24 series') +
			(componentOpts.pairs
				? componentOpts.pairLimit !== null
					? ` (two in series for up to ${componentOpts.pairLimit} resistor${componentOpts.pairLimit === 1 ? '' : 's'})`
					: ' (two in series allowed)'
				: '')
	);
	const combinerR = $derived(restrictedStock ? nearestResistor(SUMMING_R, componentOpts.resistorSeries) : SUMMING_R);

	// the drawer is worth remembering between visits; blocked storage just
	// means the defaults come back
	onMount(() => {
		const saved = loadStock();
		if (saved) {
			if (saved.stock) stock = saved.stock;
			if (saved.resistorText !== undefined) resistorText = saved.resistorText;
			if (saved.capacitorText !== undefined) capacitorText = saved.capacitorText;
			if (saved.pairs !== undefined) pairs = saved.pairs;
			if (saved.pairLimit !== undefined) pairLimit = saved.pairLimit;
		}
		stockLoaded = true;
	});

	$effect(() => {
		const state = { stock, resistorText, capacitorText, pairs, pairLimit };
		if (stockLoaded) saveStock(state);
	});

	let orderOverride = $state(null);
	let orderOverrideHp = $state(null);
	let orderOverrideLp = $state(null);
	let orderOverrideBand = $state(null);

	// Each filter type needs its edges in a different order (high-pass
	// wants fp > fs; band-pass wants fsl < fl < fh < fsh; band-stop wants
	// fl < fsl < fsh < fh - the reverse of band-pass despite sharing the
	// same four state variables), so switching the dropdown resets to a
	// working example for that type instead of carrying over values that
	// satisfied a different ordering and now trip the validation error.
	$effect(() => {
		if (filterType === 'lowpass') {
			fp = 10000;
			fs = 35000;
		} else if (filterType === 'highpass') {
			fp = 10000;
			fs = 3000;
		} else if (filterType === 'bandpass') {
			fl = 1000;
			fh = 10000;
			fsl = 300;
			fsh = 30000;
		} else if (filterType === 'bandstop') {
			fl = 1000;
			fh = 30000;
			fsl = 3000;
			fsh = 10000;
		}
		// entering a band type starts both sides on the response, the
		// topology and the limits already chosen
		if (filterType === 'bandpass' || filterType === 'bandstop') {
			const single = untrack(() => response);
			responseHp = single;
			responseLp = single;
			const wiring = untrack(() => topology);
			topologyHp = wiring;
			topologyLp = wiring;
			// the transformation's stages follow it too: Tow-Thomas stays
			// Tow-Thomas, anything else takes the one op-amp circuits
			topologyBand = wiring === 'towThomas' ? 'towThomas' : 'mfb';
			topologyNotch = wiring === 'towThomas' ? 'towThomas' : 'boctor';
			const [amax, amin] = untrack(() => [amaxDb, aminDb]);
			amaxDbHp = amax;
			amaxDbLp = amax;
			aminDbHp = amin;
			aminDbLp = amin;
		}
		// the stages of another type are other stages
		orderOverrideBand = null;
		capOverrides = {};
		mergeNote = '';
	});

	// Manual capacitor values, in nanofarads, keyed by stage index. A stage
	// only switches to its manual solve once every field its topology needs
	// is filled in (both C1/C2 for MFB, both Ctop/Cbottom for Sallen-Key, C
	// for first order); otherwise it keeps using the automatic search.
	let capOverrides = $state({});

	function setCapOverride(i, field, rawValue) {
		const nF = Number(rawValue);
		const current = capOverrides[i] ?? {};
		const next = { ...current };
		if (rawValue === '' || !Number.isFinite(nF) || nF <= 0) {
			delete next[field];
		} else {
			next[field] = nF;
		}
		if (Object.keys(next).length === 0) {
			const { [i]: _removed, ...rest } = capOverrides;
			capOverrides = rest;
		} else {
			capOverrides = { ...capOverrides, [i]: next };
		}
	}

	function clearCapOverride(i) {
		const { [i]: _removed, ...rest } = capOverrides;
		capOverrides = rest;
	}

	const isBandType = $derived(filterType === 'bandpass' || filterType === 'bandstop');
	// Inverse Chebyshev and Elliptic put zeros in the stopband, and only the
	// Tow-Thomas biquad builds a stage with zeros (its notch form), so a
	// filter, or a side of a band filter, with either one is Tow-Thomas:
	// nothing is designed until its Topology menu says so too
	// a narrow band-pass has no response menu, so nothing waits on Tow-Thomas
	const zeroResponses = $derived(isNarrow ? [] : [...new Set(isBandType ? [responseHp, responseLp] : [response])].filter((r) => RESPONSES[r]?.zeros));
	const needsTowThomas = $derived(zeroResponses.length > 0);
	const zerosHp = $derived(isBandType && !!RESPONSES[responseHp]?.zeros);
	const zerosLp = $derived(isBandType && !!RESPONSES[responseLp]?.zeros);
	/**
	 * The menu a stage answers to: in a transformed design the band-pass or
	 * the notch menu by the kind of stage, in a cascade the menu of the side
	 * it belongs to, otherwise the one menu.
	 */
	const topologyFor = (stage) =>
		transformed
			? stage.filterType === 'bandpass'
				? topologyBand
				: topologyNotch
			: isBandType
				? stage.filterType === 'highpass'
					? topologyHp
					: topologyLp
				: topology;
	// the sides still waiting for Tow-Thomas, by name
	const blockedSides = $derived(
		isBandType
			? [zerosHp && !['towThomas', 'boctor'].includes(topologyHp) ? 'high-pass' : null, zerosLp && !['towThomas', 'boctor'].includes(topologyLp) ? 'low-pass' : null].filter(Boolean)
			: needsTowThomas && !['towThomas', 'boctor'].includes(topology)
				? ['filter']
				: []
	);
	const topologyBlocked = $derived(blockedSides.length > 0);
	// a transformed design mixes its circuits stage by stage (a notch Boctor
	// cannot build goes to Tow-Thomas), so it answers from what was built
	const usesTopology = (t) =>
		transformed ? realizedStages.some((s) => s.topology.startsWith(t)) : isBandType ? topologyHp === t || topologyLp === t : topology === t;
	const TOPOLOGY_WORD = { mfb: 'multiple feedback', sallenKey: 'Sallen-Key', towThomas: 'Tow-Thomas biquad', boctor: 'Boctor biquad' };
	// the transformation's two menus in words, for the Components hint
	const BAND_WORD = { mfb: 'multiple feedback band-pass', towThomas: 'Tow-Thomas band-pass' };
	const NOTCH_WORD = { boctor: 'Boctor notch', towThomas: 'Tow-Thomas notch' };
	// the circuits a transformed design was built with, which differ from the
	// Notch stages menu where Boctor falls back (the menus until it is built)
	const BUILT_WORD = { mfbBp: BAND_WORD.mfb, towThomasBp: BAND_WORD.towThomas, boctor: NOTCH_WORD.boctor, boctorHp: NOTCH_WORD.boctor, towThomasNotch: NOTCH_WORD.towThomas };
	const transformedHint = $derived.by(() => {
		const words = realizedStages.length
			? Object.keys(BUILT_WORD).filter((t) => realizedStages.some((s) => s.topology === t)).map((t) => BUILT_WORD[t])
			: filterType === 'bandstop'
				? [NOTCH_WORD[topologyNotch]]
				: [BAND_WORD[topologyBand], ...(hasZeros ? [NOTCH_WORD[topologyNotch]] : [])];
		return [...new Set(words)].map((w) => `${w} stages`).join(', ');
	});
	// the circuit each stage heading names, so a band filter shows which menu drives it
	const CIRCUIT_WORD = {
		boctor: 'Boctor low-pass notch',
		boctorHp: 'Boctor high-pass notch',
		firstOrder: 'first-order RC, same for every topology',
		firstOrderHp: 'first-order RC, same for every topology',
		mfb: 'multiple feedback',
		mfbBp: 'multiple feedback band-pass',
		mfbHp: 'multiple feedback',
		sallenKey: 'Sallen-Key',
		sallenKeyHp: 'Sallen-Key',
		towThomas: 'Tow-Thomas biquad',
		towThomasBp: 'Tow-Thomas biquad, band-pass output',
		towThomasHp: 'Tow-Thomas biquad',
		towThomasNotch: 'Tow-Thomas notch, for the zeros'
	};
	// where a stage of a transformed design sits, for its row and its card
	const ROLE_WORD = { lower: 'below f0', upper: 'above f0', centre: 'at f0' };
	function roleLabel(stage) {
		if (stage.filterType === 'bandpass') return `band-pass, ${ROLE_WORD[stage.role]}`;
		if (stage.notch === 'symmetric') return 'notch, at f0';
		return `${stage.notch === 'low' ? 'low-pass' : 'high-pass'} notch, ${ROLE_WORD[stage.role]}`;
	}
	const zeroResponsesText = $derived(
		zeroResponses.length > 1
			? `${zeroResponses.map((r) => RESPONSES[r].short ?? RESPONSES[r].label).join(' and ')} responses put`
			: zeroResponses.length === 1
				? `An ${RESPONSES[zeroResponses[0]].short ?? RESPONSES[zeroResponses[0]].label} response puts`
				: ''
	);
	const edgesOk = $derived(
		filterType === 'highpass'
			? fp > fs
			: filterType === 'bandpass'
				? fsl > 0 && fl > fsl && fh > fl && fsh > fh
				: filterType === 'bandstop'
					? fl > 0 && fl < fsl && fsl < fsh && fsh < fh
					: fs > fp
	);
	// A band-stop's one stopband takes one Amin: both branches leak into all
	// of it, so neither could be held to more than the other lets through.
	const aminSideHp = $derived(filterType === 'bandstop' ? aminDb : aminDbHp);
	const aminSideLp = $derived(filterType === 'bandstop' ? aminDb : aminDbLp);
	const limitsOk = (amax, amin) => amax > 0 && amin > amax;
	const valid = $derived(
		isNarrow ? narrowValid : isBandType ? edgesOk && limitsOk(amaxDbHp, aminSideHp) && limitsOk(amaxDbLp, aminSideLp) : fp > 0 && fs > 0 && edgesOk && limitsOk(amaxDb, aminDb)
	);
	const sideWord = $derived(filterType === 'bandstop' ? 'branch' : 'side');
	const sideWords = $derived(filterType === 'bandstop' ? 'branches' : 'sides');
	// The limits each edge answers to. A band-pass's lower edges (fsl, fl)
	// belong to its high-pass side and its upper ones (fh, fsh) to its
	// low-pass side; a band-stop's lower edges (fl, fsl) belong to its
	// low-pass branch and its upper ones (fsh, fh) to its high-pass branch.
	// A transformed design holds one Amax, the smaller one, at both edges.
	const amaxAtFl = $derived(transformed ? amaxBand : filterType === 'bandstop' ? amaxDbLp : amaxDbHp);
	const aminAtFsl = $derived(filterType === 'bandstop' ? aminDb : aminDbHp);
	const amaxAtFh = $derived(transformed ? amaxBand : filterType === 'bandstop' ? amaxDbHp : amaxDbLp);
	const aminAtFsh = $derived(filterType === 'bandstop' ? aminDb : aminDbLp);
	// a band filter's limits in words, one figure when both sides share it
	const amaxBandText = $derived(amaxAtFl === amaxAtFh ? `${amaxAtFl} dB` : `${amaxAtFl} dB at fl and ${amaxAtFh} dB at fh`);
	const aminBandText = $derived(aminAtFsl === aminAtFsh ? `${aminAtFsl} dB` : `${aminAtFsl} dB at fsl and ${aminAtFsh} dB at fsh`);

	const k = $derived(
		valid && !isBandType && !isNarrow
			? filterType === 'highpass'
				? transitionRatio(fs, fp)
				: transitionRatio(fp, fs)
			: null
	);
	// the order: a formula for most responses, a count for Bessel and Legendre
	// (minimumOrder returns n = null when no order up to SEARCH_LIMIT gets there)
	const orderInfo = $derived(k !== null ? minimumOrder(response, amaxDb, aminDb, k) : null);
	const minOrder = $derived(orderInfo ? orderInfo.value : null);
	const minOrderCeil = $derived(orderInfo ? orderInfo.n : null);
	const order = $derived(
		orderOverride !== null ? Math.min(MAX_ORDER, Math.max(1, orderOverride)) : minOrderCeil
	);
	const orderTooHigh = $derived(orderInfo !== null && (minOrderCeil === null || minOrderCeil > MAX_ORDER));

	// Band-pass: a high-pass section (fl/fsl) cascaded with a low-pass
	// section (fh/fsh) - see designBandPass in stages.js. Band-stop: a
	// low-pass branch (fl/fsl) and a high-pass branch (fh/fsh) summed
	// instead of cascaded - see designBandStop. Either way, "the section
	// built with designHighPass" and "the section built with
	// designLowPass" each get their own independent order calculation;
	// which two edges feed which section just flips between the two.
	const hpFp = $derived(filterType === 'bandstop' ? fh : fl);
	const hpFs = $derived(filterType === 'bandstop' ? fsh : fsl);
	const lpFp = $derived(filterType === 'bandstop' ? fl : fh);
	const lpFs = $derived(filterType === 'bandstop' ? fsl : fsh);

	const kHp = $derived(valid && isBandType ? transitionRatio(hpFs, hpFp) : null);
	const orderInfoHp = $derived(kHp !== null ? minimumOrder(responseHp, amaxDbHp, aminSideHp, kHp) : null);
	const minOrderHp = $derived(orderInfoHp ? orderInfoHp.value : null);
	const minOrderHpCeil = $derived(orderInfoHp ? orderInfoHp.n : null);
	const orderHp = $derived(
		orderOverrideHp !== null ? Math.min(MAX_ORDER, Math.max(1, orderOverrideHp)) : minOrderHpCeil
	);
	const orderHpTooHigh = $derived(orderInfoHp !== null && (minOrderHpCeil === null || minOrderHpCeil > MAX_ORDER));

	const kLp = $derived(valid && isBandType ? transitionRatio(lpFp, lpFs) : null);
	const orderInfoLp = $derived(kLp !== null ? minimumOrder(responseLp, amaxDbLp, aminSideLp, kLp) : null);
	const minOrderLp = $derived(orderInfoLp ? orderInfoLp.value : null);
	const minOrderLpCeil = $derived(orderInfoLp ? orderInfoLp.n : null);
	const orderLp = $derived(
		orderOverrideLp !== null ? Math.min(MAX_ORDER, Math.max(1, orderOverrideLp)) : minOrderLpCeil
	);
	const orderLpTooHigh = $derived(orderInfoLp !== null && (minOrderLpCeil === null || minOrderLpCeil > MAX_ORDER));

	/** The one-line reason a side cannot be built: its order past the limit, or a response that never gets there. */
	function tooHighText(info, resp, edges, whose = '') {
		if (info?.n === null) {
			const last = info.tried?.[info.tried.length - 1];
			return `${RESPONSES[resp].label} never gets there: even at order ${SEARCH_LIMIT} it loses only ${last ? last.loss.toFixed(1) : '?'} dB at the stopband edge. Loosen ${whose}Amax, Amin or ${edges}, or pick a steeper response.`;
		}
		return `That needs order ${info?.n}, past this tool's limit of ${MAX_ORDER}. Loosen ${whose}Amax, Amin or ${edges}, or pick a steeper response.`;
	}

	/** Every response in one list, with what it is best at. */
	const responseOptions = RESPONSE_KEYS.map((key) => ({ key, label: RESPONSES[key].short ?? RESPONSES[key].label, best: RESPONSES[key].best }));

	/* -------------------------------------------- a band filter's two methods */

	// The cascade: today's two sections, at their minimum orders for the
	// comparison and at the orders used for the design shown. A side past
	// the order limit, or one still waiting for a notch topology, leaves the
	// cascade out without holding back the transformation.
	const cascadeArgs = (orderHigh, orderLow) => ({ responseHp, responseLp, amaxDbHp, aminDbHp: aminSideHp, amaxDbLp, aminDbLp: aminSideLp, fl, fh, fsl, fsh, orderHigh, orderLow });
	const designCascadeFor = (args) => (filterType === 'bandstop' ? designBandStop(args) : designBandPass(args));
	const designCascadeMin = $derived(
		isBandType && valid && !orderHpTooHigh && !orderLpTooHigh ? designCascadeFor(cascadeArgs(minOrderHpCeil, minOrderLpCeil)) : null
	);
	const designCascade = $derived(
		!designCascadeMin || topologyBlocked
			? null
			: orderHp === minOrderHpCeil && orderLp === minOrderLpCeil
				? designCascadeMin
				: designCascadeFor(cascadeArgs(orderHp, orderLp))
	);

	// The transformation: one response, one Amax (the smaller of the two
	// sides) and the Amin of each stopband edge, which the order is counted
	// against edge by edge.
	const bandResponse = $derived(responseHp === responseLp ? responseLp : null);
	const amaxBand = $derived(Math.min(amaxDbHp, amaxDbLp));
	const bandEdges = $derived(isBandType && edgesOk ? bandCentre(fl, fh) : null);
	const transformedSpec = $derived(
		!isBandType || !valid || !bandResponse || !limitsOk(amaxBand, aminAtFsl) || !limitsOk(amaxBand, aminAtFsh)
			? null
			: filterType === 'bandstop'
				? { response: bandResponse, amaxDb: amaxBand, aminDb, fl, fh, fsl, fsh }
				: { response: bandResponse, amaxDb: amaxBand, aminDbLow: aminAtFsl, aminDbHigh: aminAtFsh, fl, fh, fsl, fsh }
	);
	const designTransformedFor = (spec, order = null) =>
		filterType === 'bandstop' ? designBandStopTransformed({ ...spec, order }) : designBandPassTransformed({ ...spec, order });
	const designTransformedMin = $derived(transformedSpec ? designTransformedFor(transformedSpec) : null);
	const orderInfoBand = $derived(designTransformedMin ? designTransformedMin.orderInfo : null);
	const minOrderBand = $derived(orderInfoBand ? orderInfoBand.n : null);
	// a slider order the spec has since outgrown is lifted to the new minimum
	const orderBand = $derived(orderOverrideBand !== null ? Math.min(MAX_ORDER, Math.max(minOrderBand ?? 1, orderOverrideBand)) : minOrderBand);
	const orderBandTooHigh = $derived(orderInfoBand !== null && (minOrderBand === null || minOrderBand > MAX_ORDER));
	const designTransformed = $derived(
		!designTransformedMin || orderBandTooHigh
			? null
			: orderBand === minOrderBand
				? designTransformedMin
				: designTransformedFor(transformedSpec, orderBand)
	);

	// Op-amps per method, each at its minimum order with the menus as set,
	// so moving an order slider never flips the method under the mouse.
	const cascadeMenus = $derived({ method: 'cascade', highpass: topologyHp, lowpass: topologyLp });
	const transformedMenus = $derived({ method: 'transformed', bandpass: topologyBand, notch: topologyNotch, ...(mfbGbw !== null ? { gbw: mfbGbw } : {}) });
	const cascadeCount = $derived(designCascadeMin && !topologyBlocked ? opampCount(designCascadeMin, cascadeMenus) : null);
	const transformedCount = $derived(designTransformedMin && !orderBandTooHigh ? opampCount(designTransformedMin, transformedMenus) : null);
	const autoMethod = $derived(chooseBandMethod({ cascade: cascadeCount, transformed: transformedCount }));
	/** The method the page shows: the one selected, or in auto the one with fewer op-amps. null for a low-pass or high-pass. */
	const method = $derived(!isBandType ? null : bandMethod === 'auto' ? autoMethod : bandMethod);
	const transformed = $derived(method === 'transformed');
	// a band-stop built the classic way runs two branches into a summing
	// amplifier; a transformed one is a plain cascade of notch stages
	const parallelSum = $derived(filterType === 'bandstop' && !transformed);
	// the topology gate belongs to the cascade and the single filter only
	const blocked = $derived(topologyBlocked && !transformed);

	const methodName = (m) =>
		m === 'transformed'
			? filterType === 'bandstop'
				? 'band-stop transformation'
				: 'band-pass transformation'
			: filterType === 'bandstop'
				? 'low-pass + high-pass, summed'
				: 'high-pass + low-pass, cascaded';
	const methodShort = (m) => (m === 'transformed' ? 'the transformation' : filterType === 'bandstop' ? 'the summed branches' : 'the cascade');
	const highestQ = (d) => d.stages.reduce((q, s) => (s.order === 2 ? Math.max(q, s.q) : q), 0);
	const opampsText = (n) => `${n} op-amp${n === 1 ? '' : 's'}`;

	/** Why the cascade cannot be built, in a few words, or null. */
	const cascadeReason = $derived.by(() => {
		if (!isBandType) return null;
		if (!valid) return 'the spec above needs fixing';
		const tooHigh = [
			[orderHpTooHigh, orderInfoHp, responseHp, 'high-pass'],
			[orderLpTooHigh, orderInfoLp, responseLp, 'low-pass']
		].filter(([high]) => high);
		if (tooHigh.length === 2 && responseHp === responseLp && orderInfoHp.n === null && orderInfoLp.n === null) {
			return `${RESPONSES[responseLp].short ?? RESPONSES[responseLp].label} never gets there on either ${sideWord}`;
		}
		if (tooHigh.length) {
			return tooHigh
				.map(([, info, resp, side]) => (info.n === null ? `${RESPONSES[resp].short ?? RESPONSES[resp].label} never gets there on the ${side} ${sideWord}` : `the ${side} ${sideWord} needs order ${info.n}, past ${MAX_ORDER}`))
				.join(', and ');
		}
		if (topologyBlocked) {
			const need = `the ${blockedSides.join(' and the ')} ${blockedSides.length > 1 ? `${sideWords} need Tow-Thomas or Boctor for their zeros` : `${sideWord} needs Tow-Thomas or Boctor for its zeros`}`;
			// the transformation selected outright hides the sides' menus
			return bandMethod === 'transformed' ? `${need} (their Topology menus show under the other two Method choices)` : need;
		}
		return cascadeCount?.unavailable ?? null;
	});
	/** Why the transformation cannot be built, in a few words, or null. */
	const transformedReason = $derived.by(() => {
		if (!isBandType) return null;
		if (!valid) return 'the spec above needs fixing';
		if (!bandResponse) return 'the two sides use different responses, and the transformation takes one';
		if (!transformedSpec) return 'Amin must be greater than the smaller Amax';
		if (minOrderBand === null) return `${RESPONSES[bandResponse].short ?? RESPONSES[bandResponse].label} never gets there`;
		if (minOrderBand > MAX_ORDER) return `the prototype needs order ${minOrderBand}, past ${MAX_ORDER}`;
		return transformedCount?.unavailable ?? null;
	});

	// One row per method for the comparison in panel 02 and the line under the edges.
	const methodRows = $derived.by(() => {
		if (!isBandType) return [];
		const cascadeOk = !cascadeReason && !!cascadeCount;
		const transformedOk = !transformedReason && !!transformedCount;
		return [
			{
				key: 'cascade',
				label: methodName('cascade'),
				available: cascadeOk,
				reason: cascadeReason,
				order: designCascadeMin ? `${minOrderHpCeil + minOrderLpCeil} (${filterType === 'bandstop' ? `${minOrderLpCeil} + ${minOrderHpCeil}` : `${minOrderHpCeil} + ${minOrderLpCeil}`})` : '-',
				stages: designCascadeMin ? designCascadeMin.stages.length : null,
				opamps: cascadeOk ? cascadeCount.opamps : null,
				highestQ: designCascadeMin ? highestQ(designCascadeMin) : null,
				note: filterType === 'bandstop' && cascadeOk ? 'counts the summing amplifier' : ''
			},
			{
				key: 'transformed',
				label: methodName('transformed'),
				available: transformedOk,
				reason: transformedReason,
				order: designTransformedMin && minOrderBand !== null ? `${2 * minOrderBand} (prototype ${minOrderBand})` : '-',
				stages: designTransformedMin && minOrderBand !== null ? designTransformedMin.stages.length : null,
				opamps: transformedOk ? transformedCount.opamps : null,
				highestQ: designTransformedMin && minOrderBand !== null ? highestQ(designTransformedMin) : null,
				note:
					transformedOk && transformedCount.fallbacks.length
						? `stage${transformedCount.fallbacks.length > 1 ? 's' : ''} ${transformedCount.fallbacks.join(', ')} on Tow-Thomas, not Boctor`
						: ''
			}
		];
	});

	/** The line under the band edges: which method is used, and why. */
	const methodLine = $derived.by(() => {
		if (!isBandType || !valid || methodRows.length < 2) return '';
		const used = methodRows.find((r) => r.key === method);
		const other = methodRows.find((r) => r.key !== method);
		const otherName = methodShort(other.key).replace(/^./, (c) => c.toUpperCase());
		if (!used.available) {
			return `Method ${bandMethod === 'auto' ? 'used' : 'selected'}: ${methodName(method)}, which cannot be built here: ${used.reason}.${other.available ? ` ${otherName} would take ${opampsText(other.opamps)}.` : other.reason ? ` ${otherName} cannot be built either: ${other.reason}.` : ''}`;
		}
		const head = `Method used: ${methodName(method)}${bandMethod === 'auto' ? '' : ' (selected)'}, ${opampsText(used.opamps)}`;
		if (!other.available) return `${head}. ${otherName} cannot be built here: ${other.reason}.`;
		if (bandMethod === 'auto' && used.opamps === other.opamps) return `${head}, as many as ${methodShort(other.key)}: a tie keeps ${methodShort('cascade')}.`;
		return `${head} against ${other.opamps} for ${methodShort(other.key)}.`;
	});

	// Selecting the transformation outright gives the two sides one response
	// and one Amax, the inputs it then shows; say so when they differed.
	function selectBandMethod(value) {
		bandMethod = value;
		mergeNote = '';
		if (value !== 'transformed') return;
		const merged = [];
		if (responseHp !== responseLp) {
			responseHp = responseLp;
			merged.push(`the response is the low-pass ${sideWord}'s, ${RESPONSES[responseLp].short ?? RESPONSES[responseLp].label}`);
		}
		if (amaxDbHp !== amaxDbLp) {
			const amax = Math.min(amaxDbHp, amaxDbLp);
			amaxDbHp = amax;
			amaxDbLp = amax;
			merged.push(`Amax is the smaller one, ${amax} dB`);
		}
		if (merged.length) mergeNote = `The two ${sideWords} differed, so ${merged.join(', and ')}.`;
	}

	// Manual capacitors belong to the stages of one design: another method
	// has other stages under the same numbers, and in a transformed design
	// another menu other circuits, another prototype order other stages.
	$effect(() => {
		void method;
		if (transformed) void [topologyBand, topologyNotch, orderBand];
		untrack(() => {
			if (Object.keys(capOverrides).length) capOverrides = {};
		});
	});

	const design = $derived.by(() => {
		// a narrow band-pass has its own design and realization (narrowDesign, narrowBuild below)
		if (isNarrow) return null;
		if (isBandType) return transformed ? designTransformed : designCascade;
		if (!valid || topologyBlocked || orderTooHigh) return null;
		return filterType === 'highpass'
			? designHighPass({ response, amaxDb, aminDb, fp, fs, order })
			: designLowPass({ response, amaxDb, aminDb, fp, fs, order });
	});

	// the full E24 / E6 grid, the one bandBoctorDesign has already searched
	const fullGrid = (opts) => opts.resistorSeries === 'E24' && !opts.capacitors && !opts.pairs;

	function buildStage(stage, i, opts) {
		const ov = capOverrides[i];

		// A finite zero uses the selected notch network. notchOptions says
		// which end it holds at gain 1 (or, in a transformed band-pass, its
		// gain far above the zero) and which Boctor form its zero needs.
		if (Number.isFinite(stage.wz)) {
			const plan = notchOptions(stage);
			// a transformed design sends a notch Boctor cannot build to Tow-Thomas, stage by stage
			const planned = transformed ? plannedTopology(stage, transformedMenus) : null;
			const boctor = planned ? planned.topology === 'boctor' || planned.topology === 'boctorHp' : topologyFor(stage) === 'boctor';
			if (boctor) {
				const notchOpts = { ...opts, lowSide: plan.boctorLowSide };
				// the op-amp count already searched the full grid: a copy of that design, not a second search
				const found = fullGrid(opts) ? bandBoctorDesign(stage.wn, stage.q, stage.wz, plan.boctorLowSide) : designBoctorNotch(stage.wn, stage.q, stage.wz, notchOpts);
				const auto = found && { ...found };
				if (!ov?.C) return auto;
				return designBoctorNotchFromCap(stage.wn, stage.q, stage.wz, ov.C * 1e-9, notchOpts) ?? (auto && { ...auto, manualError: 'This capacitor cannot realize the Boctor section with positive resistors in range. Showing the automatic values.' });
			}
			const notchOpts = { ...opts, ...plan.towThomas };
			// why Boctor left this stage (plannedTopology): its zero on its own f0,
			// the high-pass form's Q limit, no parts, or its own gain off target
			const mark = (r) => (r && planned?.fallback ? { ...r, boctorFallback: planned.why } : r);
			if (ov?.C > 0) {
				const r = designTowThomasNotchFromCap(stage.wn, stage.q, stage.wz, ov.C * 1e-9, notchOpts);
				if (r.ok) return mark(r);
			}
			return mark(designTowThomasNotch(stage.wn, stage.q, stage.wz, notchOpts));
		}

		// A band-pass stage of a transformed design, held at its own centre
		// gain so that it passes f0 at gain 1.
		if (stage.filterType === 'bandpass') {
			const bpOpts = { ...opts, gain: stage.gain };
			if (topologyBand === 'towThomas') {
				if (ov?.C > 0) {
					const r = designTowThomasBandPassFromCap(stage.wn, stage.q, ov.C * 1e-9, bpOpts);
					if (r.ok) return r;
				}
				return designTowThomasBandPass(stage.wn, stage.q, bpOpts);
			}
			// built for the op-amp picked for these stages, when one is
			const mfbOpts = mfbGbw !== null ? { ...bpOpts, gbw: mfbGbw } : bpOpts;
			const auto = designMfbBandPass(stage.wn, stage.q, mfbOpts);
			if (ov?.C1 > 0 || ov?.C2 > 0) {
				const C1 = ov?.C1 > 0 ? ov.C1 * 1e-9 : auto?.components.C1;
				const C2 = ov?.C2 > 0 ? ov.C2 * 1e-9 : auto?.components.C2;
				const r = designMfbBandPassFromCaps(stage.wn, stage.q, C1, C2, mfbOpts);
				if (r.ok) return r;
				// built for an op-amp, the circuit's own gain and Q set the ceiling
				const circuit = r.predistorted ?? { gain: stage.gain, q: stage.q };
				const why =
					r.why === 'opamp'
						? 'With this op-amp no circuit lands on this stage, whatever the capacitors: it is too slow at f0 to correct for.'
						: r.why === 'loop'
							? `With C2/C1 = ${(C2 / C1).toFixed(2)} the op-amp is left a loop gain of ${r.loopGain.toFixed(2)} at f0, under 2: too little to correct for. A smaller C2/C1 lowers the noise gain.`
							: circuit.gain >= r.maxGain
								? `C2/C1 = ${(C2 / C1).toFixed(2)} cannot give this stage its gain of ${circuit.gain.toFixed(3)} at Q = ${circuit.q.toFixed(4)}: the most it reaches is Q²(1 + C2/C1) = ${r.maxGain.toFixed(3)}, so C2/C1 must be above ${r.neededRatio.toFixed(2)}.`
								: 'These capacitors need a resistor outside what the stock can give.';
				return auto && { ...auto, manualError: `${why} Showing the automatic values below instead.` };
			}
			return auto;
		}

		const wiring = topologyFor(stage);
		if (stage.filterType === 'highpass') {
			if (stage.order === 1) {
				if (ov?.C > 0) {
					const r = designFirstOrderHighPassFromCap(stage.tau, ov.C * 1e-9, opts);
					if (r.ok) return r;
				}
				return designFirstOrderHighPass(stage.tau, opts);
			}
			if (wiring === 'towThomas' || wiring === 'boctor') {
				if (ov?.C > 0) {
					const r = designTowThomasHighPassFromCap(stage.wn, stage.q, ov.C * 1e-9, opts);
					if (r.ok) return r;
				}
				return designTowThomasHighPass(stage.wn, stage.q, opts);
			}
			if (wiring === 'sallenKey') {
				if (ov?.C > 0) {
					const r = designSallenKeyHighPassFromCap(stage.wn, stage.q, ov.C * 1e-9, opts);
					if (r.ok) return r;
				}
				return designSallenKeyHighPass(stage.wn, stage.q, opts);
			}
			if (ov?.C > 0) {
				const r = designMfbHighPassFromCap(stage.wn, stage.q, ov.C * 1e-9, opts);
				if (r.ok) return r;
			}
			return designMfbHighPass(stage.wn, stage.q, opts);
		}

		if (stage.order === 1) {
			if (ov?.C > 0) {
				const r = designFirstOrderLowPassFromCap(stage.tau, ov.C * 1e-9, opts);
				if (r.ok) return r;
			}
			return designFirstOrderLowPass(stage.tau, opts);
		}

		if (wiring === 'towThomas' || wiring === 'boctor') {
			if (ov?.C > 0) {
				const r = designTowThomasLowPassFromCap(stage.wn, stage.q, ov.C * 1e-9, opts);
				if (r.ok) return r;
			}
			return designTowThomasLowPass(stage.wn, stage.q, opts);
		}
		if (wiring === 'sallenKey') {
			const auto = designSallenKeyLowPass(stage.wn, stage.q, opts);
			if (ov?.Ctop > 0 || ov?.Cbottom > 0) {
				const Ctop = ov?.Ctop > 0 ? ov.Ctop * 1e-9 : auto.components.Ctop;
				const Cbottom = ov?.Cbottom > 0 ? ov.Cbottom * 1e-9 : auto.components.Cbottom;
				const r = designSallenKeyLowPassFromCaps(stage.wn, stage.q, Ctop, Cbottom, opts);
				if (r.ok) return r;
			}
			return auto;
		}

		const auto = designMfbLowPass(stage.wn, stage.q, opts);
		if (ov?.C1 > 0 || ov?.C2 > 0) {
			const C1 = ov?.C1 > 0 ? ov.C1 * 1e-9 : auto.components.C1;
			const C2 = ov?.C2 > 0 ? ov.C2 * 1e-9 : auto.components.C2;
			const r = designMfbLowPassFromCaps(stage.wn, stage.q, C1, C2, opts);
			if (r.ok) return r;
			return {
				...auto,
				manualError: `C1/C2 = ${(C1 / C2).toFixed(2)}:1 cannot realize Q = ${stage.q.toFixed(4)} for this stage (needs at least 8Q² = ${(8 * stage.q * stage.q).toFixed(1)}:1, i.e. C1 at least that many times C2). Showing the automatic values below instead.`
			};
		}
		return auto;
	}

	// a cascade notch Boctor cannot build at all (a transformed design moves
	// such a stage to Tow-Thomas instead)
	const boctorUnavailable = $derived(
		transformed ? [] : (design?.stages.flatMap((s, i) => (topologyFor(s) === 'boctor' && Number.isFinite(s.wz) && !boctorFeasible(s.wn, s.q, s.wz, s.filterType === 'lowpass') ? [i + 1] : [])) ?? [])
	);
	/** A stage as the page shows it: built from the stock, or from the full grid, flagged, when the stock cannot build it. */
	function realizeStage(stage, i, opts) {
		const built = buildStage(stage, i, opts);
		if (built) return built;
		// the chosen stock cannot realize this stage at all: fall back to
		// the full E24/E6 grid and flag it, rather than dropping the stage
		const fallback = buildStage(stage, i, { resistorSeries: 'E24', capacitors: null });
		return fallback && { ...fallback, stockShortfall: true };
	}

	// "Up to N pairs" builds each stage again for every subset of its pairs
	// (pairPlan.js). The stages stay the same objects until the spec moves,
	// so those builds are kept per stage, keyed by everything else
	// buildStage reads: changing N, or going back to an earlier stock, only
	// shares the pairs out again.
	const pairBuilds = new WeakMap();
	function realizeCached(stage, i, opts) {
		let memo = pairBuilds.get(stage);
		if (!memo) pairBuilds.set(stage, (memo = new Map()));
		const key = JSON.stringify([i, capOverrides[i] ?? null, topologyFor(stage), transformed, topologyBand, topologyNotch, mfbGbw, opts.resistorSeries, opts.capacitors, opts.pairs]);
		if (!memo.has(key)) {
			if (memo.size >= 2000) memo.clear();
			memo.set(key, realizeStage(stage, i, opts));
		}
		return memo.get(key);
	}
	/** The pairs the cap keeps, stage by stage (planFilterPairs), or null without a cap. */
	const pairPlan = $derived.by(() => {
		if (!design || !componentOpts.pairs || componentOpts.pairLimit === null) return null;
		const opts = componentOpts;
		return planFilterPairs(design.stages, (i, pairs) => realizeCached(design.stages[i], i, { ...opts, pairs }), opts.resistorSeries, opts.pairLimit);
	});
	const stageResults = $derived.by(() => {
		if (!design) return [];
		if (pairPlan) return pairPlan.stages.map((s) => s.design);
		return design.stages.map((stage, i) => realizeStage(stage, i, componentOpts));
	});
	const realizationFailures = $derived(stageResults.flatMap((s, i) => s ? [] : [i + 1]));
	const realizedStages = $derived(realizationFailures.length ? [] : stageResults);
	// what stops the build: Boctor in a cascade, a multiple feedback band-pass
	// stage in a transformed design (its notches fall back on their own)
	const failureText = $derived.by(() => {
		if (!realizationFailures.length) return '';
		const list = realizationFailures.join(', ');
		const several = realizationFailures.length > 1;
		const tail = 'No incomplete cascade is exported.';
		if (transformed) {
			const mfb = realizationFailures.every((n) => design.stages[n - 1].filterType === 'bandpass') && topologyBand === 'mfb';
			if (mfb) {
				const worst = design.stages[realizationFailures[0] - 1];
				// the op-amp alone can be what stops them: too little loop gain to correct for
				if (mfbGbw !== null && realizationFailures.every((n) => mfbBandPassFeasible(design.stages[n - 1].wn, design.stages[n - 1].q, design.stages[n - 1].gain))) {
					return `Built for ${mfbOpampLabel}, the multiple feedback band-pass stage${several ? 's' : ''} ${list} would leave the op-amp a loop gain under 2 at f0 (Q = ${worst.q.toFixed(3)}${several ? ' for the first' : ''}), too little to correct for. Pick a faster op-amp or Tow-Thomas for the band-pass stages, or widen the band. ${tail}`;
				}
				return `The multiple feedback band-pass cannot reach the Q and gain of stage${several ? 's' : ''} ${list} (Q = ${worst.q.toFixed(3)}, gain ${worst.gain.toFixed(3)}${several ? ' for the first' : ''}) with resistors in range and capacitors at most 10:1 apart. Select Tow-Thomas for the band-pass stages, or change the specification. ${tail}`;
			}
			return `Stage${several ? 's' : ''} ${list} cannot be built with the available capacitor range and positive resistors. Change the specification or the stage topology. ${tail}`;
		}
		if (!usesTopology('boctor')) return `Stage${several ? 's' : ''} ${list} cannot be built with the available capacitor range and positive resistors. Change the topology or the specification. ${tail}`;
		return `Boctor cannot realize stage ${list} with the available capacitor range and positive resistors. ${boctorUnavailable.length ? 'The high-pass form needs Q < 1 / (1 - (fz/f0)²).' : 'The capacitor ratio or resistor range is insufficient.'} Select Tow-Thomas for this side, or change the specification. ${tail}`;
	});

	// Panel 02 of a transformed design: where each stopband edge lands on
	// the prototype, and the order each one asks for.
	const omegaTex = $derived.by(() => {
		if (!orderInfoBand) return '';
		const ratio = (edge) =>
			filterType === 'bandstop' ? `\\dfrac{f_{${edge}} B}{|f_0^2 - f_{${edge}}^2|}` : `\\dfrac{|f_{${edge}}^2 - f_0^2|}{f_{${edge}} B}`;
		return `\\Omega_{sl} = ${ratio('sl')} = ${orderInfoBand.omegaLow.toFixed(4)}, \\qquad \\Omega_{sh} = ${ratio('sh')} = ${orderInfoBand.omegaHigh.toFixed(4)}`;
	});
	const orderTex = $derived.by(() => {
		const info = orderInfoBand;
		if (!info || info.n === null) return '';
		if (info.equiripple) {
			const closed = info.lowered ?? info;
			const start = `\\Omega_s = \\min(\\Omega_{sl}, \\Omega_{sh}) = ${(1 / closed.k).toFixed(4)},\\ A_{min} = ${closed.aminDb}\\ \\text{dB}: \\quad n \\geq ${closed.value.toFixed(4)}`;
			// n counts the prototype's poles; the band filter has twice as many
			const order = `\\ \\Rightarrow\\ \\text{filter order } 2n = ${2 * info.n}`;
			return info.lowered ? `${start} \\ \\Rightarrow\\ ${info.lowered.from}, \\ \\text{and } n = ${info.n} \\text{ already meets both edges} ${order}` : `${start} \\ \\Rightarrow\\ n = ${info.n} ${order}`;
		}
		// a searched order (Bessel, Legendre) is already a whole number
		const bound = (v) => (Number.isInteger(v) ? `= ${v}` : `\\geq ${v.toFixed(4)}`);
		const [low, high] = info.edges;
		return `n_{sl} ${bound(low.value)}, \\qquad n_{sh} ${bound(high.value)} \\ \\Rightarrow\\ n = ${info.n} \\ \\Rightarrow\\ \\text{filter order } 2n = ${2 * info.n}`;
	});

	// stages on the full grids: those the list cannot build at all, and
	// those it builds only with more pairs than a limit leaves them
	const limitShortStages = $derived(pairPlan?.limited && realizedStages.length ? pairPlan.stages.flatMap((s, i) => (s.short ? [i + 1] : [])) : []);
	const shortfallStages = $derived(realizedStages.flatMap((r, i) => (r.stockShortfall && !limitShortStages.includes(i + 1) ? [i + 1] : [])));
	// what to look at when the passband misses by more than rounding
	const missCause = $derived(
		(Object.keys(capOverrides).length > 0
			? 'check the capacitor overrides above'
			: usesTopology('sallenKey')
				? "a Sallen-Key stage's capacitor ratio lands on the coarse E12 grid, which moves its Q"
				: 'the rounding of a sharp stage adds up') + (stock === 'E24' ? ', and the E96 series narrows it' : '')
	);
	const hasZeros = $derived(!!design && design.stages.some((s) => Number.isFinite(s.wz)));

	// Band-stop only: the two branches (low-pass, high-pass) that run in
	// parallel and get summed, split back out of the flat realizedStages
	// list using design.lp.stages.length as the boundary (see
	// designBandStop in stages.js for why this split - not a cascade - is
	// the correct way to evaluate a band-stop's response).
	const bandStopBranches = $derived.by(() => {
		if (!design || !parallelSum || realizedStages.length === 0) return null;
		const lpCount = design.lp.stages.length;
		return [realizedStages.slice(0, lpCount), realizedStages.slice(lpCount)];
	});

	// The two branches must reach the combiner with the same sign; when they
	// do not, the combiner is a difference amplifier (see combinerSigns).
	const combiner = $derived(bandStopBranches ? combinerChoice(bandStopBranches, fsl, fsh) : null);
	const combinerMode = $derived(combiner ? combiner.mode : 'sum');
	// a low-pass notch stage passes DC at a rounded capacitor ratio; the
	// combiner's low-pass input resistor takes that factor out again
	const lpBranchGain = $derived(bandStopBranches ? Math.abs(branchDcGain(bandStopBranches[0])) : 1);
	const combinerParts = $derived(
		combiner ? combinerDesign(combinerMode, combinerR, lpBranchGain, (v) => nearestResistor(v, componentOpts.resistorSeries)) : null
	);
	const combineSigns = $derived(combinerParts ? combinerParts.weights : null);
	const COMBINER_NAMES = { RCA: 'Ra (low-pass in)', RCB: 'Rb (high-pass in)', RCF: 'Rf (feedback)', RCH: 'R (high-pass in)', RCG: 'Rg (to ground)', RCL: 'Rl (low-pass in)' };
	const combinerRows = $derived(combinerParts ? Object.entries(combinerParts.resistors).map(([key, value]) => ({ name: COMBINER_NAMES[key], value })) : []);
	const combinerDiagram = $derived(
		combinerMode === 'difference' ? buildDifferenceAmpDiagram(combinerR, combinerParts?.resistors) : buildSummingAmpDiagram(combinerR, combinerParts?.resistors)
	);

	const bodePoints = $derived.by(() => {
		if (!design || realizedStages.length === 0) return [];
		if (filterType === 'bandpass') return sweep(realizedStages, fsl / 10, fsh * 10, 240);
		if (filterType === 'bandstop') return parallelSum ? sweepParallelSum(bandStopBranches, fl / 10, fh * 10, 240, combineSigns) : sweep(realizedStages, fl / 10, fh * 10, 240);
		return sweep(realizedStages, fp / 50, fs * 10, 240);
	});

	// Amax and Amin are measured from the top of the passband. For a
	// Butterworth that top is the DC gain, 0 dB. A Chebyshev is built from
	// stages of unity DC gain, so an even-order one ripples between 0 dB and
	// +Amax (and a band type can stack the ripple of its two sides): measured
	// from 0 dB its stopband would look Amax short when it meets the spec.
	// The same holds for an even-order elliptic, and a notch stage's rounded
	// Cin moves the whole passband a little. So the reference is always the
	// highest gain found in the passband.
	const gainDbAt = (f) =>
		parallelSum ? magnitudePhaseAtParallelSum(bandStopBranches, f, combineSigns).db : magnitudePhaseAt(realizedStages, f).db;
	const passbandPeakDb = $derived.by(() => {
		if (!design || realizedStages.length === 0) return 0;
		const gainDb = gainDbAt;
		const ranges =
			filterType === 'lowpass'
				? [[fp / 100, fp]]
				: filterType === 'highpass'
					? [[fp, fp * 100]]
					: filterType === 'bandpass'
						? [[fl, fh]]
						: [
								[fl / 100, fl],
								[fh, fh * 100]
							];
		let peak = -Infinity;
		for (const [a, b] of ranges) {
			if (!(a > 0 && b > a)) continue;
			for (let i = 0; i <= 400; i++) peak = Math.max(peak, gainDb(a * (b / a) ** (i / 400)));
		}
		return Number.isFinite(peak) ? peak : 0;
	});

	// The stopband over its whole width, not just at its edge: an elliptic or
	// inverse Chebyshev response comes back up between its zeros, and with
	// rounded parts those bumps are where the spec is missed first. The
	// least attenuation found across the stopband, and where.
	const stopbandWorst = $derived.by(() => {
		if (!design || realizedStages.length === 0) return null;
		// each stretch of stopband against its own Amin (a band-pass's two
		// sides may ask for different ones), so the point that counts is the
		// one with the least margin
		const ranges =
			filterType === 'lowpass'
				? [[fs, fs * 100, aminDb]]
				: filterType === 'highpass'
					? [[fs / 100, fs, aminDb]]
					: filterType === 'bandpass'
						? [
								[fsl / 100, fsl, aminAtFsl],
								[fsh, fsh * 100, aminAtFsh]
							]
						: [[fsl, fsh, aminDb]];
		let worst = { db: Infinity, freq: null, required: null, margin: Infinity };
		for (const [a, b, required] of ranges) {
			for (let i = 0; i <= 800; i++) {
				const f = a * (b / a) ** (i / 800);
				const att = passbandPeakDb - gainDbAt(f);
				if (att - required < worst.margin) worst = { db: att, freq: f, required, margin: att - required };
			}
		}
		return worst;
	});
	const stopbandHolds = $derived((stopbandWorst?.margin ?? Infinity) >= -1e-6);

	// The Bode plot's amber limits for a band filter whose sides differ: each
	// side's figure over the stretch it answers for, straight from one Amax
	// to the other across a band-pass's passband, which both sides share.
	// Counted from the top of the passband, like the figures in the flags.
	const limitLines = $derived.by(() => {
		if (!isBandType) return null;
		const top = passbandPeakDb;
		const pass = filterType === 'bandpass';
		const lines = [];
		if (amaxAtFl === amaxAtFh) lines.push({ db: amaxAtFl - top });
		else if (pass) lines.push({ to: fl, db: amaxAtFl - top }, { from: fl, to: fh, db: amaxAtFl - top, db2: amaxAtFh - top }, { from: fh, db: amaxAtFh - top });
		else lines.push({ to: fl, db: amaxAtFl - top }, { from: fh, db: amaxAtFh - top });
		if (aminAtFsl === aminAtFsh) lines.push({ db: aminAtFsl - top });
		else lines.push({ to: fsl, db: aminAtFsl - top }, { from: fsh, db: aminAtFsh - top });
		return lines;
	});
	// a response with zeros can dip below Amin inside the band while its edges are fine
	const stopbandDipsInside = $derived(
		stopbandWorst !== null &&
			(isBandType
				? stopbandWorst.margin < Math.min((attenuationAtFsl ?? Infinity) - aminAtFsl, (attenuationAtFsh ?? Infinity) - aminAtFsh) - 0.05
				: stopbandWorst.margin < (attenuationAtFs ?? Infinity) - aminDb - 0.05)
	);

	const attenuationAtFs = $derived.by(() => {
		if (!design || realizedStages.length === 0 || isBandType) return null;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fs).db;
	});

	const attenuationAtFsl = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (parallelSum) return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fsl, combineSigns).db;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fsl).db;
	});

	const attenuationAtFsh = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (parallelSum) return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fsh, combineSigns).db;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fsh).db;
	});

	// Passband side of the spec: the realized filter may lose at most Amax dB
	// at the passband edge(s). For Butterworth this is exactly what the
	// eps^(-1/n) cutoff scaling in stages.js is there to guarantee.
	const attenuationAtFp = $derived.by(() => {
		if (!design || realizedStages.length === 0 || isBandType) return null;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fp).db;
	});

	const attenuationAtFl = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (parallelSum) return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fl, combineSigns).db;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fl).db;
	});

	const attenuationAtFh = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (parallelSum) return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fh, combineSigns).db;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fh).db;
	});

	// The ideal Butterworth design sits exactly at Amax at fp, so any excess
	// in the realized filter is E24 rounding: measured across low/high-pass,
	// MFB and Sallen-Key, it scatters the edge by up to about 0.75 dB either
	// way, less than the parts' own 5% tolerance moves it on a real board.
	// Below PASSBAND_SLACK_DB the edge is reported as on spec; up to
	// PASSBAND_ROUNDING_DB it is reported as rounding; beyond that something
	// is genuinely off (a capacitor override, say) and it is flagged.
	const PASSBAND_SLACK_DB = 0.05;
	const PASSBAND_ROUNDING_DB = 1.0;

	// A transformed design is held at gain 1 at f0 (band-pass) or at DC
	// (band-stop). Boctor stages keep their own gain and rounding moves the
	// rest, so the level actually reached is reported when it strays.
	const PASSBAND_LEVEL_DB = 0.5;
	const passbandLevelDb = $derived.by(() => {
		if (!transformed || !design || realizedStages.length === 0) return null;
		return magnitudePhaseAt(realizedStages, filterType === 'bandstop' ? fl / 1000 : design.f0).db;
	});

	/* ------------------------------------------ the narrow band-pass, built */

	const narrowDesign = $derived(
		isNarrow && narrowValid
			? designNarrowBand({ f0: narrowF0, q: narrowBy === 'q' ? narrowQ : null, bandwidth: narrowBy === 'b' ? narrowB : null, gain: narrowK, stages: narrowN })
			: null
	);
	// the multiple feedback circuit is built for the op-amp picked under
	// "Design the MFB stages for", as the transformed band-pass's stages are
	const narrowGbw = $derived(isNarrow ? mfbGbwChosen : null);
	const narrowOpts = $derived({ resistorSeries: componentOpts.resistorSeries, capacitors: componentOpts.capacitors, pairs: componentOpts.pairs, gbw: narrowGbw });
	// "Up to N pairs": every circuit of the table is built within it, as the one shown below
	const narrowPairLimit = $derived(componentOpts.pairs && componentOpts.pairLimit !== null ? componentOpts.pairLimit : null);
	// every circuit built from the stock and measured, ideal and on a TL082
	const narrowRows = $derived(narrowDesign ? compareNarrowCircuits(narrowDesign, { ...narrowOpts, realGbw: NARROW_REAL_GBW, pairLimit: narrowPairLimit }) : []);
	const narrowAuto = $derived(narrowRows.length ? narrowDefaultCircuit(narrowRows) : null);
	const narrowChosen = $derived(narrowCircuit === 'auto' ? narrowAuto : narrowCircuit);
	const narrowRow = $derived(narrowRows.find((r) => r.circuit === narrowChosen) ?? null);

	// manual capacitors belong to one circuit and one count of stages
	$effect(() => {
		void [narrowChosen, narrowN];
		untrack(() => {
			if (isNarrow && Object.keys(capOverrides).length) capOverrides = {};
		});
	});

	/** The capacitors typed for stage i, in farads, for realizeNarrow: { C }, or { C1, C2 } for the multiple feedback circuit (a field left empty keeps the automatic value). */
	function narrowCapFor(i, auto) {
		const ov = capOverrides[i];
		if (!ov) return null;
		if (narrowChosen === 'mfbBp') {
			const C1 = ov.C1 > 0 ? ov.C1 * 1e-9 : auto?.components.C1;
			const C2 = ov.C2 > 0 ? ov.C2 * 1e-9 : auto?.components.C2;
			return C1 > 0 && C2 > 0 ? { C1, C2 } : null;
		}
		return ov.C > 0 ? { C: ov.C * 1e-9 } : null;
	}

	/** Why capacitors typed for a stage cannot build it, from the designer's own answer. */
	function narrowCapError(failure) {
		if (narrowChosen === 'mfbBp' && failure?.why === 'opamp') return 'With this op-amp no multiple feedback circuit lands on this stage, whatever the capacitors: it is too slow at f0 to correct for.';
		if (narrowChosen === 'mfbBp' && failure?.why === 'loop') return `These capacitors leave the op-amp a loop gain of ${failure.loopGain.toFixed(2)} at f0, under 2: too little to correct for. A smaller C2/C1 lowers the noise gain.`;
		if (narrowChosen === 'mfbBp' && Number.isFinite(failure?.maxGain)) return `These capacitors cannot give this stage its gain: the most it reaches is Q²(1 + C2/C1) = ${failure.maxGain.toFixed(3)}, so C2/C1 must be above ${failure.neededRatio.toFixed(2)}.`;
		if (narrowChosen === 'rlcGyrator') return "With this capacitor the gyrator's series loss alone takes the stage below its Q, or a resistor falls out of range.";
		if (narrowChosen === 'sallenKeyBp') return 'With this capacitor no stocked pair of gain resistors brings Q close enough to its target.';
		if (narrowChosen === 'khnBp') return 'With this capacitor no stocked pair gives the ratio R5/R6 this Q needs.';
		return 'This capacitor cannot build the stage with resistors in range.';
	}

	// The relative errors of measured figures against the design (as narrowBand.js measures them).
	const narrowErrorsOf = (fig, d) => ({ f0: fig.f0 / d.f0 - 1, q: fig.q === null ? null : fig.q / d.q - 1, gain: Math.abs(fig.gain) / d.gain - 1 });
	const narrowIdealFigures = (stages, d) => narrowFigures((f) => responseAt(stages, f), d.f0);

	/**
	 * The chosen circuit as panel 04 shows it: the table's own build, or
	 * built again with the capacitors typed (a stage they cannot build keeps
	 * its automatic ones and says why) and the cap on pairs.
	 */
	const narrowBuild = $derived.by(() => {
		if (!narrowDesign || !narrowRow) return null;
		const auto = narrowRow.realized;
		if (!narrowRow.ok) return { realized: auto, capErrors: {}, plan: null };
		const typed = narrowDesign.stages.map((_, i) => i).filter((i) => narrowCapFor(i, auto.resonators[i]));
		const capsOf = (list) => narrowDesign.stages.map((_, i) => (list.includes(i) ? narrowCapFor(i, auto.resonators[i]) : null));
		const realize = (list, pairs = narrowOpts.pairs) => realizeNarrow(narrowDesign, narrowChosen, { ...narrowOpts, pairs, caps: capsOf(list) });
		const capErrors = {};
		let kept = typed;
		if (typed.length) {
			const all = realize(typed);
			if (!all.ok) {
				for (const i of typed) {
					const alone = realize([i]);
					if (!alone.ok) capErrors[i] = narrowCapError(alone.failure);
				}
				kept = typed.filter((i) => !(i in capErrors));
				if (kept.length && !realize(kept).ok) {
					for (const i of kept) capErrors[i] = narrowCapError(null);
					kept = [];
				}
			}
		}
		// the table's row is already built within the limit; capacitors typed are built again within it
		const limit = narrowPairLimit;
		if (limit !== null) {
			const plan = kept.length ? narrowLimitPairs((pairs) => realize(kept, pairs), limit, narrowDesign, componentOpts.resistorSeries) : narrowRow.plan;
			return { realized: plan.realized, capErrors, plan };
		}
		return { realized: kept.length ? realize(kept) : auto, capErrors, plan: null };
	});
	const narrowStages = $derived(narrowBuild?.realized?.ok ? narrowBuild.realized.stages : []);
	const narrowGainStages = $derived(narrowBuild?.realized?.ok ? narrowBuild.realized.gainStages : []);
	// the figures of the built chain: from its parts (bode.js, as plotted) and on a TL082 single pole (its netlist)
	const narrowIdealFig = $derived(narrowStages.length ? narrowIdealFigures(narrowStages, narrowDesign) : null);
	const narrowRealFig = $derived(narrowStages.length ? narrowFigures(narrowNetlistResponse(narrowStages, { gbw: NARROW_REAL_GBW }), narrowDesign.f0) : null);
	const narrowIdealErr = $derived(narrowIdealFig ? narrowErrorsOf(narrowIdealFig, narrowDesign) : null);
	const narrowRealErr = $derived(narrowRealFig ? narrowErrorsOf(narrowRealFig, narrowDesign) : null);
	// the poles of the built chain on that TL082: a pole pair past the axis oscillates, whatever |H| shows
	const narrowRealStability = $derived(narrowStages.length ? narrowStability(narrowStages, { gbw: NARROW_REAL_GBW, f0: narrowDesign.f0 }) : null);
	const narrowOscillates = $derived(Boolean(narrowRealStability?.oscillates));
	// a multiple feedback stage built for its op-amp: the LTspice model takes that gain-bandwidth
	const narrowCorrected = $derived(narrowStages.some((s) => s.topology === 'mfbBp' && Number.isFinite(s.actual.gbw)));
	/**
	 * The op-amp's speed, when it is what breaks the rule: on a TL082 the
	 * built filter moves past a limit by more than its parts alone put it.
	 */
	const narrowOpampAlert = $derived.by(() => {
		if (!narrowIdealFig || !narrowRealFig || !narrowRealErr) return '';
		const d = narrowDesign;
		if (narrowOscillates) {
			return `Op-amp speed: on a TL082 (${formatHz(NARROW_REAL_GBW)}, single pole) this circuit oscillates, near ${formatHz(narrowRealStability.freq)}. The op-amps' lag adds to the loop of its integrators and undoes its damping: a pole pair crosses into the right half plane. A response on paper still shows a peak, which hides it. A faster op-amp, a lower f0·Q, more stages of lower Q, or another circuit in the table keeps it stable.`;
		}
		if (narrowWithin(narrowRealErr)) return '';
		const f0Shift = narrowRealFig.f0 / narrowIdealFig.f0 - 1;
		const qShift = narrowRealFig.q && narrowIdealFig.q ? narrowRealFig.q / narrowIdealFig.q - 1 : null;
		const gainShift = Math.abs(narrowRealFig.gain) / Math.abs(narrowIdealFig.gain) - 1;
		const broken = [
			Math.abs(f0Shift) > NARROW_RULE.f0Share / d.q ? `f0 by ${narrowPct(f0Shift, 2)}, past a tenth of the bandwidth (${narrowPct(NARROW_RULE.f0Share / d.q, 2).replace('+', '')})` : null,
			qShift !== null && Math.abs(qShift) > NARROW_RULE.qTolerance ? `Q by ${narrowPct(qShift)}` : null,
			Math.abs(gainShift) > NARROW_RULE.gainTolerance ? `the gain by ${narrowPct(gainShift)}` : null
		].filter(Boolean);
		if (!broken.length) return '';
		// a gain stage past the op-amp's reach at f0: g f0 against GBW
		const slow = narrowGainStages.filter((s) => s.actual.gain * d.f0 > NARROW_GAIN_SPEED * NARROW_REAL_GBW);
		const loss = narrowGainStages.reduce((acc, s) => acc * Math.hypot(1, (s.actual.gain * d.f0) / NARROW_REAL_GBW), 1);
		const many = narrowGainStages.length > 1;
		const gainWhy = slow.length
			? ` The gain stage${many ? 's take' : ' takes'} part of it: an amplifier of gain g closes its loop at GBW/g, ${formatHz(NARROW_REAL_GBW / slow[0].actual.gain)} for g = ${slow[0].actual.gain.toFixed(2)}, and keeps 1/√(1 + (g·f0/GBW)²) of its gain at f0: ${narrowPct(1 / loss - 1)} in all here, ${many ? `with the gain already split over ${narrowGainStages.length} amplifiers` : 'and more amplifiers would lose more'}. A lower K or a faster op-amp keeps it.`
			: '';
		const why =
			narrowChosen === 'rlcGyrator'
				? " The gyrator's inductor leans on its follower, and the large R2 that keeps its loss low makes it the more sensitive to the op-amp's lag at f0."
				: narrowChosen === 'mfbBp' && narrowGbw === null
					? ' Designing the MFB stages for the TL082 (panel 01) corrects it.'
					: '';
		return `Op-amp speed: on a TL082 (${formatHz(NARROW_REAL_GBW)}, single pole) the built filter moves ${broken.join(', ')} from what its parts give with an ideal op-amp.${why}${gainWhy} A faster op-amp, a lower f0·Q or another circuit in the table above keeps it closer; the LTspice download runs the real part.`;
	});
	// the closing steps of a narrow band-pass: swept around f0, the op-amp's lag and stability first
	const narrowNextSteps = $derived(narrowNextStepsOf(narrowCorrected ? narrowGbw : null));
	const narrowShortfall = $derived(narrowStages.flatMap((s, i) => (s.stockShortfall ? [i + 1] : [])));

	const narrowBodePoints = $derived.by(() => {
		if (!narrowStages.length) return [];
		const { f0, f1, f2, q } = narrowDesign;
		// f0/span to f0·span: the narrower the band, the closer the view, 3 to 10 times either side
		const span = Math.min(10, Math.max(3, 20 / q));
		const freqs = [];
		for (let i = 0; i < 240; i++) freqs.push((f0 / span) * (span * span) ** (i / 239));
		// the peak drawn point by point, whatever its width
		const lo = Math.min(f1, narrowIdealFig?.f1 ?? f1) / 1.15;
		const hi = Math.max(f2, narrowIdealFig?.f2 ?? f2) * 1.15;
		for (let i = 0; i < 160; i++) freqs.push(lo * (hi / lo) ** (i / 159));
		return freqs.sort((a, b) => a - b).map((freq) => ({ freq, ...magnitudePhaseAt(narrowStages, freq) }));
	});
	// the same sweep on a TL082 single pole, from the netlist; none when it oscillates (no response settles)
	const narrowRealPoints = $derived.by(() => {
		if (!narrowBodePoints.length || narrowOscillates) return null;
		const H = narrowNetlistResponse(narrowStages, { gbw: NARROW_REAL_GBW });
		return narrowBodePoints.map(({ freq }) => {
			const h = H(freq);
			return { freq, db: 20 * Math.log10(Math.hypot(h.re, h.im)) };
		});
	});

	/** A fraction as a signed percent, +0.16%, and 0.0% for what rounds to nothing (no -0.0). */
	function narrowPct(x, digits = 1, unit = '%') {
		if (!Number.isFinite(x)) return '-';
		const v = Number((100 * x).toFixed(digits));
		return `${v > 0 ? '+' : ''}${v === 0 ? (0).toFixed(digits) : v.toFixed(digits)}${unit}`;
	}
	/** f0, Q and K errors in one cell, in percent: +0.16 / +0.4 / 0.0. */
	const narrowTriple = (e) => (e ? `${narrowPct(e.f0, 2, '')} / ${e.q === null ? '-' : narrowPct(e.q, 1, '')} / ${narrowPct(e.gain, 1, '')}` : '-');
	/** Whether figures stay within the rule's limits. */
	const narrowWithin = (e) => !!e && narrowFit(e, narrowDesign) <= 1;
	/** Decibels to two decimals, 0.00 for what rounds to nothing (no -0.00). */
	const narrowDb = (x) => (Math.abs(x) < 0.005 ? '0.00' : x.toFixed(2));
	/** A circuit's name inside a sentence: the multiple feedback band-pass, the RLC, gyrator inductor. */
	const narrowName = narrowLabelInText;
	/** Names as a sentence lists them: Ra, Rb and R2. */
	const listText = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(''));
	const ratioText = (x) => (x >= 1e4 ? Math.round(x).toLocaleString('en-US') : x >= 10 ? x.toFixed(0) : x.toFixed(1));

	const NARROW_STAGE_WORD = {
		rlcGyrator: 'RLC, its inductor a gyrator',
		rlcGic: "RLC, its inductor Antoniou's GIC",
		sallenKeyBp: 'Sallen-Key band-pass',
		mfbBp: 'multiple feedback band-pass',
		khnBp: 'state variable (KHN), band-pass output',
		towThomasBp: 'Tow-Thomas biquad, band-pass output',
		gainNonInv: 'non-inverting gain stage'
	};
	// the circuits whose capacitor field sets both capacitors (the tank and the inductor's, or C1 = C2)
	const NARROW_ONE_CAP = ['rlcGyrator', 'rlcGic', 'sallenKeyBp', 'khnBp', 'towThomasBp'];

	/**
	 * The flags under one resonator stage: its Q against what one stage
	 * holds well, its spread, tiny capacitors, its Q sensitivity, a fragile
	 * op-amp correction. The stages share one Q, so that flag is stage 1's
	 * alone, and a later stage built like stage 1 repeats none of them.
	 */
	function narrowStageAlerts(stageDesign, target, i) {
		const out = [];
		const q = target.q;
		const width = 100 / q;
		const first = narrowStages[0];
		if (i > 0 && first && JSON.stringify(first.components) === JSON.stringify(stageDesign.components)) return out;
		if (q > 10 && i === 0) {
			out.push({
				level: q > 20 ? 'bad' : 'warn',
				text: `Q = ${q.toFixed(1)} for this stage, above the 5 to 10 that one stage holds well. Its peak is f0/Q wide, ${width.toFixed(1)} % of f0, and a 1 % part moves f0 by about 0.5 %, ${(50 / width).toFixed(0)} % of that width${q > 20 ? ': the built stage can miss its own band, so plan on trimming one part' : ''}. ${narrowN < NARROW_MAX_STAGES ? 'More identical stages (N) give each a lower Q for the same overall Q.' : 'A wider band lowers it.'}`
			});
		}
		const rs = Object.entries(stageDesign.components).filter(([name, v]) => /^R/.test(name) && v > 0).map(([, v]) => v);
		const spread = rs.length > 1 ? Math.max(...rs) / Math.min(...rs) : 1;
		if (spread > R_SPREAD) {
			out.push({
				level: 'warn',
				text: `The resistors of this stage span ${ratioText(spread)}:1, past about ${R_SPREAD}:1: the largest picks up stray capacitance and leakage, the smallest loads its op-amp.${stageDesign.topology === 'rlcGyrator' ? ' The gyrator needs it: its series loss R1 must stay small against the R2 = L/(R1 C) that makes the inductor.' : ''}`
			});
		}
		const caps = Object.entries(stageDesign.components).filter(([name, v]) => /^C/.test(name) && Number.isFinite(v) && v > 0);
		const tiny = caps.filter(([, v]) => v < C_TINY);
		if (tiny.length) {
			out.push({
				level: 'warn',
				text: `${tiny.map(([name, v]) => `${name} = ${formatFarads(v)}`).join(', ')}: a few picofarads of stray capacitance from a breadboard row or the op-amp's input pins add to ${tiny.length > 1 ? 'these values' : 'this value'}, so the built stage will not match. Above about 47 pF it holds: pick a larger value in the field below and the resistors are recalculated.`
			});
		}
		const sens = narrowStageSensitivity(stageDesign) ?? {};
		const worst = Object.entries(sens).reduce((w, [part, value]) => (w === null || Math.abs(value) > Math.abs(w.value) ? { part, value } : w), null);
		if (worst && Math.abs(worst.value) > NARROW_RULE.sensitivityMax) {
			// K_a = 1 + Rf/Rg: Q's sensitivity to K_a, K_a/(K_lim - K_a), K_lim the gain these parts oscillate at
			const lim = stageDesign.topology === 'sallenKeyBp' ? sallenKeyBpLimit(stageDesign.components) : null;
			const ka = stageDesign.actual.K;
			out.push({
				level: 'warn',
				text: `Q moves ${Math.abs(worst.value).toFixed(1)} % for 1 % off on ${worst.part}${lim ? `, and ${lim.sensitivity.toFixed(1)} % for 1 % on the circuit's own gain K_a = ${ka.toFixed(3)}, which is K_a/(K_lim - K_a). With these parts the stage oscillates at K_lim = ${lim.K.toFixed(3)}, not the 4 of equal parts: Rf/Rg ${lim.margin * 100 < 0.05 ? 'is already past it' : `has only ${(100 * lim.margin).toFixed(1)} % of margin before it`}` : ''}. Parts of 1 % tolerance can move Q by several percent: a circuit with lower sensitivities in the table above holds it better.`
			});
		}
		if (stageDesign.topology === 'mfbBp' && Number.isFinite(stageDesign.actual.gbw) && stageDesign.steps.loopGain < LOOP_FRAGILE) {
			const slower = mfbBandPassEffective(stageDesign.components, 0.9 * stageDesign.actual.gbw);
			out.push({
				level: 'warn',
				text: `The op-amp is left a loop gain of only ${stageDesign.steps.loopGain.toFixed(2)} at this stage's f0 (GBW / (noise gain × f0), noise gain ${stageDesign.steps.noiseGain.toFixed(1)}). The correction holds for exactly ${formatHz(stageDesign.actual.gbw)}: a part with 10 % less gain-bandwidth moves f0 by ${formatPercent(relativeErrorPercent(slower.wn, stageDesign.actual.wn))} and Q by ${formatPercent(relativeErrorPercent(slower.q, stageDesign.actual.q))}. A faster op-amp or a lower Q leaves more margin.`
			});
		}
		return out;
	}

	// panel 02 and 03 of a narrow band-pass, its numbers in place
	const sig = (x, digits = 4) => String(Number(x.toPrecision(digits)));
	const narrowWidthTex = $derived(
		!narrowDesign
			? ''
			: narrowDesign.by === 'q'
				? `B = \\dfrac{f_0}{Q} = \\dfrac{${sig(narrowDesign.f0, 6)}}{${sig(narrowDesign.q, 6)}} = ${sig(narrowDesign.B, 5)}\\ \\text{Hz}`
				: `Q = \\dfrac{f_0}{B} = \\dfrac{${sig(narrowDesign.f0, 6)}}{${sig(narrowDesign.B, 6)}} = ${sig(narrowDesign.q, 5)}`
	);
	// each a short line, so that a phone shows it whole
	const narrowEdgesTex = $derived(
		!narrowDesign
			? []
			: [
					`f_{1,2} = f_0\\left(\\sqrt{1 + \\dfrac{1}{4Q^2}} \\mp \\dfrac{1}{2Q}\\right), \\qquad f_2 - f_1 = B, \\quad f_1 f_2 = f_0^2`,
					`f_1 = ${sig(narrowDesign.f1, 5)}\\ \\text{Hz}, \\qquad f_2 = ${sig(narrowDesign.f2, 5)}\\ \\text{Hz}`
				]
	);
	const narrowShrinkTex = $derived(
		!narrowDesign
			? []
			: [
					`B = B_s\\sqrt{2^{1/N} - 1} \\;\\Rightarrow\\; Q_s = Q\\sqrt{2^{1/N} - 1}`,
					`Q_s = ${sig(narrowDesign.q)} \\cdot \\sqrt{2^{1/${narrowDesign.n}} - 1} = ${sig(narrowDesign.q)} \\cdot ${narrowDesign.shrink.toFixed(5)} = ${sig(narrowDesign.stageQ, 5)}`,
					`K_s = K^{1/N} = ${sig(narrowDesign.gain)}^{1/${narrowDesign.n}} = ${sig(narrowDesign.stageGain, 5)}\\ \\ (${(20 * Math.log10(narrowDesign.stageGain)).toFixed(2)}\\ \\text{dB})`
				]
	);
	const narrowHsTex = $derived.by(() => {
		if (!narrowDesign) return [];
		const d = narrowDesign;
		const a = d.w0 / d.stageQ;
		const sci = (x) => {
			const e = Math.floor(Math.log10(x));
			return e >= 5 ? `${(x / 10 ** e).toFixed(4)} \\times 10^{${e}}` : sig(x, 5);
		};
		const num = d.stageGain === 1 ? sci(a) : sci(d.stageGain * a);
		return [`\\omega_0 = 2\\pi f_0 = ${sig(d.w0, 6)}\\ \\text{rad/s}`, `H_s(s) = \\dfrac{${num}\\, s}{s^2 + ${sci(a)}\\, s + ${sci(d.w0 * d.w0)}}`];
	});
	const formatHenry = (l) => formatOhms(l).replace('Ω', 'H');

	/** The gain stages after a chain, in a few words: ', and a gain stage', ', and 2 gain stages'. */
	const narrowGainWords = (n) => (n === 0 ? '' : n === 1 ? ', and a gain stage' : `, and ${n} gain stages`);
	/** Whether a row's multiple feedback stages are built for the TL082 itself: its shift is then zero by design. */
	const narrowCorrectedRow = (row) => row.circuit === 'mfbBp' && row.realized.stages.some((s) => s.topology === 'mfbBp' && s.actual.gbw === NARROW_REAL_GBW);
	/** The f0, Q and gain a real op-amp moves a circuit by, as errors: the gain from its dB. */
	const narrowShiftErrors = (shift) => (shift ? { f0: shift.f0, q: shift.q, gain: 10 ** (shift.gainDb / 20) - 1 } : null);
	/** The rule's column of the table: the default, qualifies, or what keeps it out. */
	function narrowRuleText(row) {
		if (!row.ok) return `cannot be built: ${row.why}`;
		const isDefault = row.circuit === narrowAuto;
		if (row.qualifies) return isDefault ? 'qualifies: the default' : 'qualifies';
		return `${isDefault ? 'the default, as the closest; ' : ''}${row.reasons.join('; ')}`;
	}
	/** Why the chosen circuit needs the gain stage after it, in a few words. */
	function narrowGainWhy(circuit, first) {
		const own = first?.steps?.ownGain;
		if (circuit === 'rlcGic') return 'a passive RLC passes at most 1 at f0';
		if (circuit === 'rlcGyrator') return `its tank passes at most ${Number.isFinite(own) ? own.toFixed(3) : 'under 1'} at f0, the gyrator's series loss taking the rest`;
		if (circuit === 'sallenKeyBp') return `its own gain at f0 is 2√2·Q - 1 = ${Number.isFinite(own) ? own.toFixed(3) : '?'}`;
		if (circuit === 'mfbBp') return 'its gain at f0 cannot pass Q²(1 + C2/C1), so it is built at gain 1';
		return 'its own gain is under K';
	}
	/** The math of one stage: the explanation's blocks, or for the gain stage, when it has none, its one equation. */
	function narrowExplain(stageDesign, i) {
		const target = stageDesign.topology === 'gainNonInv' ? null : narrowDesign.stages[i];
		const blocks = explainNarrowBandCircuit(stageDesign, target, narrowContext(i)) ?? [];
		if (blocks.length || stageDesign.topology !== 'gainNonInv') return blocks;
		const { R1, R2 } = stageDesign.components;
		return [
			{ type: 'p', text: 'A non-inverting amplifier: R1 from the - input to ground, R2 from there to the output. Its gain is set by the ratio alone, so R1 is kept near 10 kΩ and R2 is the stocked value closest to (K - 1)·R1.' },
			{ type: 'tex', tex: `K = 1 + \\dfrac{R_2}{R_1} = 1 + \\dfrac{${sig(R2, 4)}}{${sig(R1, 4)}} = ${stageDesign.actual.gain.toFixed(4)}, \\qquad \\text{target } ${stageDesign.steps.gainTarget.toFixed(4)}` }
		];
	}

	/** What the explanation of a narrow stage is told besides the stage and its target. */
	const narrowContext = (i) => ({
		design: narrowDesign,
		realized: narrowBuild?.realized ?? null,
		index: i,
		circuit: narrowChosen,
		stages: narrowStages,
		gainStages: narrowGainStages,
		oscillates: narrowOscillates ? narrowRealStability : null,
		gbw: narrowGbw,
		realGbw: NARROW_REAL_GBW,
		resistorSeries: componentOpts.resistorSeries,
		pairs: componentOpts.pairs
	});

	function sensitivityFor(stageDesign) {
		if (stageDesign.topology === 'mfb') return mfbSensitivity(stageDesign.components);
		if (stageDesign.topology === 'mfbBp') return mfbBpSensitivity(stageDesign.components);
		if (stageDesign.topology === 'towThomasBp') return { ...TOW_THOMAS_BP_SENSITIVITY };
		if (stageDesign.topology === 'sallenKey') return { ...SALLEN_KEY_SENSITIVITY };
		if (stageDesign.topology === 'mfbHp') return { ...MFB_HP_SENSITIVITY };
		if (stageDesign.topology === 'sallenKeyHp') return { ...SALLEN_KEY_HP_SENSITIVITY };
		if (stageDesign.topology === 'towThomas') return { ...TOW_THOMAS_SENSITIVITY };
		if (stageDesign.topology === 'towThomasHp') return { ...TOW_THOMAS_HP_SENSITIVITY };
		if (stageDesign.topology === 'towThomasNotch') return { ...TOW_THOMAS_NOTCH_SENSITIVITY };
		return null;
	}

	// A stage the numbers allow but a breadboard does not: past these, the
	// stage gets a flag under its values. Q_SHARP: the resonance is so narrow
	// that ordinary tolerances move it across a large part of its own width.
	// C_TINY: down where a few picofarads of stray capacitance (a breadboard
	// row, the op-amp's input pins) change the value; the searches avoid
	// it whenever another capacitor works (smallCapPenalty in eseries.js). C_SPREAD: a ratio no
	// stock of capacitors covers well, and a sign the topology is strained.
	const Q_SHARP = 20;
	const C_TINY = C_FLOOR;
	const C_SPREAD = 1000;
	// R_SPREAD: the same limit for the resistors of a multiple feedback
	// band-pass, whose R3/R2 grows as 4Q². GBW_TYPICAL: a TL082's gain-
	// bandwidth as its model measures it (OPAMP_GBW, the figure the op-amp
	// menu offers). With it a multiple feedback band-pass stage keeps its peak
	// gain but its f0 falls by 1/sqrt(1 + k) and its Q rises by sqrt(1 + k),
	// k = Q (1 + C2/C1) f0 / GBW; that shift counts against the stage's own
	// width f0/Q, so the alert weighs shift * Q: DETUNE_WARN and DETUNE_BAD.
	// LOOP_FRAGILE: a stage built for its op-amp whose loop gain at f0 is
	// under this leans on that op-amp's exact gain-bandwidth.
	const R_SPREAD = 1000;
	const GBW_TYPICAL = OPAMP_GBW.TL082;
	const LOOP_FRAGILE = 3;
	const DETUNE_WARN = 0.05;
	const DETUNE_BAD = 0.2;

	function stageAlerts(stageDesign, target) {
		if (stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp') return [];
		const out = [];
		const q = target.q;
		if (q > Q_SHARP) {
			// f0 goes as 1/sqrt(R1 R2 C1 C2): each part moves it by half its own error
			const width = 100 / q;
			out.push({
				level: q > 2.5 * Q_SHARP ? 'bad' : 'warn',
				text: `Q = ${q.toFixed(1)}: the peak of this stage is only f0/Q wide, ${width.toFixed(1)} % of f0. A 1 % resistor or capacitor moves f0 by about 0.5 %, ${(50 / width).toFixed(0)} % of that width, so the built filter can miss its passband by several dB, and the op-amp's finite speed adds an error that grows with Q. ${
					target.role
						? 'In a transformed design Q grows with f0/B and with the order: a wider band or a lower order keeps it lower'
						: 'Meeting the spec at a lower order keeps Q lower (an elliptic response needs the fewest stages)'
				}, and a Tow-Thomas stage is the easiest to trim.`
			});
		}
		if (stageDesign.topology === 'mfbBp') {
			const values = ['R1', 'R2', 'R3'].map((name) => stageDesign.components[name]);
			const spread = Math.max(...values) / Math.min(...values);
			if (spread > R_SPREAD) {
				out.push({
					level: 'warn',
					text: `The resistors of this stage span ${spread >= 1e4 ? Math.round(spread).toLocaleString('en-US') : spread.toFixed(0)}:1. This circuit needs a ratio that grows with Q² (R3/R2 is about 4Q² with equal capacitors), and past about ${R_SPREAD}:1 it no longer suits this topology: a Tow-Thomas band-pass reaches the same Q with equal parts.`
				});
			}
			if (Number.isFinite(stageDesign.actual.gbw)) {
				// built for its op-amp: no shift to report, but a low loop gain makes the correction fragile
				const loop = stageDesign.steps.loopGain;
				if (loop < LOOP_FRAGILE) {
					const slower = mfbBandPassEffective(stageDesign.components, 0.9 * stageDesign.actual.gbw);
					out.push({
						level: 'warn',
						text: `The op-amp is left a loop gain of only ${loop.toFixed(2)} at this stage's f0 (GBW / (noise gain × f0), noise gain ${stageDesign.steps.noiseGain.toFixed(1)}). The correction holds for exactly ${formatHz(stageDesign.actual.gbw)}: a part with 10 % less gain-bandwidth moves f0 by ${formatPercent(relativeErrorPercent(slower.wn, stageDesign.actual.wn))} and Q by ${formatPercent(relativeErrorPercent(slower.q, stageDesign.actual.q))}, so the band edges this stage sets move with it. A faster op-amp, Tow-Thomas band-pass stages or a wider band leave more margin.`
					});
				}
			}
			// the op-amp sees its largest noise gain, 1 + Q²(1 + C2/C1), at the stage's own f0
			const { C1, C2 } = stageDesign.components;
			const f0Stage = stageDesign.actual.wn / (2 * Math.PI);
			const k = (stageDesign.actual.q * (1 + C2 / C1) * f0Stage) / GBW_TYPICAL;
			const drop = 1 - 1 / Math.sqrt(1 + k);
			const detune = drop * stageDesign.actual.q;
			if (!Number.isFinite(stageDesign.actual.gbw) && detune > DETUNE_WARN) {
				out.push({
					level: detune > DETUNE_BAD ? 'bad' : 'warn',
					text: `At its f0 the op-amp of this stage works at a noise gain of ${stageDesign.steps.noiseGain.toFixed(1)}. With a TL082 (${formatHz(GBW_TYPICAL)} on its model) that pulls f0 down by about ${(100 * drop).toFixed(1)} % and Q up by about ${(100 * (Math.sqrt(1 + k) - 1)).toFixed(1)} % (k = Q(1 + C2/C1)·f0/GBW = ${k.toFixed(3)}), ${(100 * detune).toFixed(0)} % of the stage's own width f0/Q, so the band edges this stage sets move${detune > DETUNE_BAD ? ' by several dB' : ''}. The shift falls as 1/GBW, so a faster op-amp or a wider band (lower Q) keeps it small. A Tow-Thomas stage is no cure here: its f0 holds, but its Q rises as Q/(1 - 4Q·f0/f_T), more than this one's. The LTspice download shows the real part's effect, and picking the op-amp under Design the MFB stages for corrects it.`
				});
			}
		}
		const caps = Object.entries(stageDesign.components).filter(([name, v]) => /^C/.test(name) && Number.isFinite(v) && v > 0);
		const tiny = caps.filter(([, v]) => v < C_TINY);
		if (tiny.length) {
			out.push({
				level: 'warn',
				text: `${tiny.map(([name, v]) => `${name} = ${formatFarads(v)}`).join(', ')}: a few picofarads of stray capacitance from a breadboard row or the op-amp's input pins add to ${tiny.length > 1 ? 'these values' : 'this value'}, so the built stage will not match. Above about 47 pF it holds: pick larger values in the fields below and the resistors are recalculated.`
			});
		}
		if (caps.length > 1 && (stageDesign.topology === 'mfb' || stageDesign.topology === 'sallenKey')) {
			const values = caps.map(([, v]) => v);
			const spread = Math.max(...values) / Math.min(...values);
			if (spread > C_SPREAD) {
				out.push({
					level: 'warn',
					text: `The capacitors of this stage span ${spread >= 1e4 ? Math.round(spread).toLocaleString('en-US') : spread.toFixed(0)}:1. The ratio this circuit needs grows with Q², and past about ${C_SPREAD}:1 it no longer suits this topology: a Tow-Thomas stage reaches the same Q with equal capacitors.`
				});
			}
		}
		return out;
	}

	// a notch of a transformed design is held at another gain than a cascade's
	const notchContext = $derived(transformed && design ? { method: 'transformed', filterType, w0: design.w0 } : undefined);

	/** A stage's math, with a sentence on the pairs the cap took away from it. */
	function explainComponentsLimited(stageDesign, i) {
		const blocks = explainComponents(stageDesign, i);
		const text = pairPlan?.limited ? filterPairLimitSentence(pairPlan.stages[i], pairPlan.limit) : '';
		return text ? [...blocks, { type: 'p', text }] : blocks;
	}

	function explainComponents(stageDesign, i) {
		if (stageDesign.topology === 'boctor' || stageDesign.topology === 'boctorHp') return explainBoctor(stageDesign, notchContext);
		if (stageDesign.topology === 'mfbBp') return explainMfbBp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'towThomasBp') return explainTowThomasBp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'mfb') return explainMfb(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKey') return explainSallenKey(stageDesign, design.stages[i].q);
		if (stageDesign.topology === 'mfbHp') return explainMfbHp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKeyHp') return explainSallenKeyHp(stageDesign, design.stages[i].q);
		if (stageDesign.topology === 'towThomas') return explainTowThomas(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'towThomasHp') return explainTowThomasHp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'towThomasNotch') return explainTowThomasNotch(stageDesign, design.stages[i].wn, design.stages[i].q, design.stages[i].wz, notchContext);
		if (stageDesign.topology === 'firstOrderHp') return explainFirstOrderHp(stageDesign);
		return explainFirstOrder(stageDesign);
	}

	function explainStageFor(fullDesign, i) {
		if (fullDesign.method === 'transformed') return explainTransformedStage(fullDesign, i);
		if (filterType === 'bandpass') {
			const hpCount = fullDesign.hp.stages.length;
			return i < hpCount ? explainHpStage(fullDesign.hp, i) : explainStage(fullDesign.lp, i - hpCount);
		}
		if (filterType === 'bandstop') {
			const lpCount = fullDesign.lp.stages.length;
			return i < lpCount ? explainStage(fullDesign.lp, i) : explainHpStage(fullDesign.hp, i - lpCount);
		}
		return fullDesign.stages[i].filterType === 'highpass' ? explainHpStage(fullDesign, i) : explainStage(fullDesign, i);
	}

	function downloadScript() {
		if (!design) return;
		const capOverridesFarads = Object.fromEntries(
			Object.entries(capOverrides).map(([i, caps]) => [
				i,
				Object.fromEntries(Object.entries(caps).map(([field, nF]) => [field, nF * 1e-9]))
			])
		);
		const code = generateScript({
			// a transformed design takes one Amax, the smaller side's
			amaxDb: transformed ? amaxBand : amaxDb,
			aminDb,
			amaxDbHp,
			aminDbHp: aminSideHp,
			amaxDbLp,
			aminDbLp: aminSideLp,
			fp,
			fs,
			fl,
			fh,
			fsl,
			fsh,
			filterType,
			response: transformed ? bandResponse : response,
			responseHp,
			responseLp,
			topology,
			topologyHp,
			topologyLp,
			order,
			orderHp,
			orderLp,
			// the method the page shows, so the script rebuilds the same design
			bandMethod: isBandType ? method : undefined,
			topologyBand,
			topologyNotch,
			orderBand: transformed ? orderBand : null,
			// the op-amp a transformed band-pass's MFB band-pass stages are built for
			...(transformed && filterType === 'bandpass' ? { opampGbw: mfbGbwChosen } : {}),
			capOverrides: capOverridesFarads,
			resistorStock: componentOpts.resistorSeries,
			resistorPairs: componentOpts.pairs,
			// the cap on pairs, when one is set: the script shares them out as the page does
			...(componentOpts.pairs && componentOpts.pairLimit !== null ? { resistorPairLimit: componentOpts.pairLimit } : {}),
			capacitorStock: componentOpts.capacitors
		});
		saveFile(code, 'filter-design.js', 'text/javascript');
	}

	// the op-amp the LTspice file uses: the ideal single-pole model, or a
	// real part on +/-15 V rails
	let spiceOpamp = $state(DEFAULT_OPAMP);
	// MFB band-pass stages built for an op-amp: the single-pole model in the
	// file then takes that gain-bandwidth, so the run matches the page
	const correctedStages = $derived(realizedStages.some((s) => s.topology === 'mfbBp' && Number.isFinite(s.actual.gbw)));
	// every stage is one of them: the page then models every op-amp in the file
	const allCorrected = $derived(correctedStages && realizedStages.every((s) => s.topology === 'mfbBp' && Number.isFinite(s.actual.gbw)));
	const ltspiceGbw = (hz) => `${Number((hz / 1e6).toPrecision(4))}Meg`;
	// the closing steps: with stages built for an op-amp, the first says their numbers include it
	const nextStepsShown = $derived(nextSteps(correctedStages ? mfbGbw : null));
	// a real part whose figure is not the one the stages are built for
	const spiceOpampDiffers = $derived(correctedStages && OPAMP_MODELS[spiceOpamp]?.real && OPAMP_GBW[spiceOpamp] !== mfbGbw);

	function downloadSchematic() {
		if (!design || realizedStages.length === 0) return;
		const schematic = generateSchematic({
			opamp: spiceOpamp,
			// the stages built for an op-amp: the single-pole model takes its gain-bandwidth
			...(correctedStages ? { correctedGbw: mfbGbw } : {}),
			realizedStages,
			filterType,
			response: isBandType ? (responseHp === responseLp ? responseLp : null) : response,
			responseHp,
			responseLp,
			amaxDb: transformed ? amaxBand : amaxDb,
			aminDb,
			amaxDbHp: transformed ? amaxBand : isBandType ? amaxDbHp : null,
			aminDbHp: isBandType ? aminSideHp : null,
			amaxDbLp: transformed ? amaxBand : isBandType ? amaxDbLp : null,
			aminDbLp: isBandType ? aminSideLp : null,
			fp,
			fs,
			fl,
			fh,
			fsl,
			fsh,
			topology: transformed ? (filterType === 'bandstop' ? topologyNotch : topologyBand) : isBandType ? (topologyHp === topologyLp ? topologyHp : null) : topology,
			topologyHp: isBandType && !transformed ? topologyHp : null,
			topologyLp: isBandType && !transformed ? topologyLp : null,
			// a transformed band-stop is one chain of notch stages, no combiner
			structure: parallelSum ? 'parallel' : 'cascade',
			method: transformed ? 'transformed' : undefined,
			f0: transformed ? design.f0 : undefined,
			B: transformed ? design.B : undefined,
			lpCount: parallelSum ? design.lp.stages.length : 0,
			combinerMode,
			combinerR: combinerR,
			combinerResistors: combinerParts?.resistors ?? null,
			// the file keeps each pair's sum; its notes name the two parts
			resistorStock: componentOpts.resistorSeries,
			pairs: componentOpts.pairs
		});
		saveFile(schematic, 'filter-design.asc', 'text/plain');
	}

	/** The capacitors typed, stage by stage, in farads. */
	const capOverridesInFarads = () =>
		Object.fromEntries(Object.entries(capOverrides).map(([i, caps]) => [i, Object.fromEntries(Object.entries(caps).map(([field, nF]) => [field, nF * 1e-9]))]));

	// the narrow band-pass as the page shows it: the script rebuilds the same circuit
	function downloadNarrowScript() {
		if (!narrowDesign) return;
		const code = generateScript({
			filterType: 'narrowband',
			f0: narrowF0,
			narrowBy,
			q: narrowBy === 'q' ? narrowQ : null,
			bandwidth: narrowBy === 'b' ? narrowB : null,
			gain: narrowK,
			stages: narrowN,
			// the circuit shown, and whether the menu left it to the rule
			circuit: narrowChosen,
			circuitMenu: narrowCircuit,
			opampGbw: narrowGbw,
			capOverrides: capOverridesInFarads(),
			resistorStock: componentOpts.resistorSeries,
			resistorPairs: componentOpts.pairs,
			...(componentOpts.pairs && componentOpts.pairLimit !== null ? { resistorPairLimit: componentOpts.pairLimit } : {}),
			capacitorStock: componentOpts.capacitors
		});
		saveFile(code, 'filter-design.js', 'text/javascript');
	}

	function downloadNarrowSchematic() {
		if (!narrowStages.length) return;
		const d = narrowDesign;
		const schematic = generateSchematic({
			opamp: spiceOpamp,
			// a multiple feedback stage built for an op-amp: the single-pole model takes its gain-bandwidth
			...(narrowCorrected ? { correctedGbw: narrowGbw } : {}),
			realizedStages: narrowStages,
			filterType: 'narrowband',
			circuit: narrowChosen,
			f0: d.f0,
			B: d.B,
			q: d.q,
			gain: d.gain,
			n: d.n,
			f1: d.f1,
			f2: d.f2,
			// the -3 dB edges, measured and swept around by a sheet that reads fp and fs
			fp: d.f1,
			fs: d.f2,
			resistorStock: componentOpts.resistorSeries,
			pairs: componentOpts.pairs
		});
		saveFile(schematic, 'filter-design.asc', 'text/plain');
	}

	function saveFile(text, filename, mime) {
		const blob = new Blob([text], { type: mime });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}
</script>

<svelte:head>
	<title>Active Filter Design · rbt56</title>
	<meta
		name="description"
		content="Design a low-pass, high-pass, band-pass, band-stop or narrow band-pass active filter: order, transfer function, component values and a Bode plot."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 02</p>
	<h1>Active Filter Design</h1>
	<p class="lead">
		Low-pass, high-pass, band-pass, band-stop and narrow band-pass. Enter a passband/stopband spec,
		pick a response and a topology, and get the order, the transfer function, real component values
		and a simulated Bode plot.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>Specification</h2>
			<span class="hint">
				{#if !valid}
					fix the values below
				{:else if isNarrow && narrowDesign}
					f0 = {formatHz(narrowDesign.f0)}, Q = {Number(narrowDesign.q.toPrecision(4))}, B = {formatHz(narrowDesign.B)}, K = {Number(narrowDesign.gain.toPrecision(4))}
				{:else if blocked}
					select Tow-Thomas or Boctor in Topology
				{:else if transformed && bandEdges}
					f0 = {formatHz(bandEdges.f0)}, B = {formatHz(bandEdges.B)}, {methodName('transformed')}
				{:else if filterType === 'bandpass'}
					high-pass side + low-pass side, see below
				{:else if filterType === 'bandstop'}
					low-pass branch + high-pass branch, see below
				{:else}
					k = {k.toFixed(4)}
				{/if}
			</span>
		</div>

		<div class="grid" class:fill={isBandType || isNarrow}>
			<div class="field">
				<label for="filterType">Filter type</label>
				<select id="filterType" bind:value={filterType}>
					<option value="lowpass">Low-pass</option>
					<option value="highpass">High-pass</option>
					<option value="bandpass">Band-pass</option>
					<option value="bandstop">Band-stop</option>
					<option value="narrowband">Narrow band-pass</option>
				</select>
			</div>
			{#if isNarrow}
				<!-- one frequency: f0, Q or B (the other one follows), the gain at f0, the identical stages, the circuit -->
				<div class="field wide">
					<label for="narrowCircuit">Circuit</label>
					<select id="narrowCircuit" bind:value={narrowCircuit}>
						<option value="auto">Auto{narrowAuto ? `: ${NARROW_LABELS[narrowAuto]}` : ', by the rule in panel 04'}</option>
						{#each NARROW_CIRCUITS as c (c)}<option value={c}>{NARROW_LABELS[c]}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="narrowF0">f0 - centre frequency (Hz)</label>
					<input id="narrowF0" type="number" min="1" step="100" bind:value={narrowF0} />
				</div>
				<div class="field">
					<label for="narrowBy">Width set by</label>
					<select id="narrowBy" bind:value={() => narrowBy, selectNarrowBy}>
						<option value="q">Q, the quality factor</option>
						<option value="b">B, the -3 dB bandwidth</option>
					</select>
				</div>
				{#if narrowBy === 'q'}
					<div class="field">
						<label for="narrowQ">Q = f0 / B{posNum(narrowQValue) && posNum(narrowF0) ? `, so B = ${formatHz(narrowF0 / narrowQValue)}` : ''}</label>
						<input id="narrowQ" type="number" min="0.1" step="0.5" bind:value={narrowQ} />
					</div>
				{:else}
					<div class="field">
						<label for="narrowB">B - bandwidth (Hz){posNum(narrowQValue) ? `, so Q = ${Number(narrowQValue.toPrecision(4))}` : ''}</label>
						<input id="narrowB" type="number" min="1" step="100" bind:value={narrowB} />
					</div>
				{/if}
				<div class="field">
					<label for="narrowK">K - gain at f0 (V/V){posNum(narrowK) ? `, ${(20 * Math.log10(narrowK)).toFixed(2)} dB` : ''}</label>
					<input id="narrowK" type="number" min="0.01" step="0.1" bind:value={narrowK} />
				</div>
				<div class="field">
					<label for="narrowN">N - identical stages</label>
					<select id="narrowN" bind:value={narrowN}>
						{#each Array.from({ length: NARROW_MAX_STAGES }, (_, i) => i + 1) as n (n)}<option value={n}>{n}</option>{/each}
					</select>
				</div>
				<div class="field wide">
					<label for="mfbOpamp">Design the MFB stages for</label>
					<select id="mfbOpamp" bind:value={mfbOpamp}>
						<option value="TL082">TL082 / TL072 ({OPAMP_GBW.TL082 / 1e6} MHz, on its model)</option>
						<option value="LM741">LM741 ({OPAMP_GBW.LM741 / 1e6} MHz)</option>
						<option value="ideal">Ideal op-amp (no correction)</option>
						<option value="other">Other gain-bandwidth</option>
					</select>
				</div>
				{#if mfbOpamp === 'other'}
					<div class="field">
						<label for="mfbGbw">Gain-bandwidth (MHz)</label>
						<input id="mfbGbw" type="number" min="0.01" step="0.1" bind:value={mfbGbwMHz} />
					</div>
				{/if}
			{:else}
			{#if isBandType}
				<div class="field">
					<label for="bandMethod">Method</label>
					<select id="bandMethod" bind:value={() => bandMethod, selectBandMethod}>
						<option value="auto">Fewest op-amps (auto)</option>
						<option value="cascade">{methodName('cascade').replace(/^./, (c) => c.toUpperCase())}</option>
						<option value="transformed">{methodName('transformed').replace(/^./, (c) => c.toUpperCase())}</option>
					</select>
				</div>
			{/if}
			{#if !isBandType}
				<div class="field">
					<label for="amax">Amax - passband ripple (dB)</label>
					<input id="amax" type="number" min="0.01" step="0.1" bind:value={amaxDb} />
				</div>
			{/if}
			{#if filterType !== 'bandpass'}
				<div class="field">
					<label for="amin">Amin - stopband attenuation (dB)</label>
					<input id="amin" type="number" min="0.01" step="1" bind:value={aminDb} />
				</div>
			{/if}
			{#if !isBandType}
				<div class="field">
					<label for="fp">fp - passband edge (Hz)</label>
					<input id="fp" type="number" min="1" step="100" bind:value={fp} />
				</div>
				<div class="field">
					<label for="fs">fs - stopband edge (Hz)</label>
					<input id="fs" type="number" min="1" step="100" bind:value={fs} />
				</div>
			{/if}
			{#if !isBandType}
				<div class="field">
					<label for="response">Response</label>
					<select id="response" bind:value={response}>
						{#each responseOptions as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="topology">Topology</label>
					<select id="topology" bind:value={topology}>
						<option value="mfb" disabled={needsTowThomas}>Multiple feedback (MFB)</option>
						<option value="sallenKey" disabled={needsTowThomas}>Sallen-Key (unity gain)</option>
						<option value="towThomas">Tow-Thomas (3 op-amps)</option>
						<option value="boctor" disabled={!needsTowThomas}>Boctor notch (1 op-amp)</option>
					</select>
				</div>
			{/if}
			{/if}
		</div>

		{#if isBandType}
			<div class="grid fill">
				{#if filterType === 'bandpass'}
					<div class="field">
						<label for="fl">fl - lower passband edge (Hz)</label>
						<input id="fl" type="number" min="1" step="100" bind:value={fl} />
					</div>
					<div class="field">
						<label for="fh">fh - upper passband edge (Hz)</label>
						<input id="fh" type="number" min="1" step="100" bind:value={fh} />
					</div>
					<div class="field">
						<label for="fsl">fsl - lower stopband edge (Hz)</label>
						<input id="fsl" type="number" min="1" step="100" bind:value={fsl} />
					</div>
					<div class="field">
						<label for="fsh">fsh - upper stopband edge (Hz)</label>
						<input id="fsh" type="number" min="1" step="100" bind:value={fsh} />
					</div>
				{:else}
					<div class="field">
						<label for="fl">fl - upper edge of lower passband (Hz)</label>
						<input id="fl" type="number" min="1" step="100" bind:value={fl} />
					</div>
					<div class="field">
						<label for="fsl">fsl - lower edge of stopband (Hz)</label>
						<input id="fsl" type="number" min="1" step="100" bind:value={fsl} />
					</div>
					<div class="field">
						<label for="fsh">fsh - upper edge of stopband (Hz)</label>
						<input id="fsh" type="number" min="1" step="100" bind:value={fsh} />
					</div>
					<div class="field">
						<label for="fh">fh - lower edge of upper passband (Hz)</label>
						<input id="fh" type="number" min="1" step="100" bind:value={fh} />
					</div>
				{/if}
			</div>
			{#if methodLine}
				<p class="note method-line">{methodLine}</p>
			{/if}
		{/if}

		<!-- a band filter is two filters: each side has its own response,
		     topology and Amax (and Amin, on a band-pass), listed from the
		     lower frequencies up -->
		{#snippet hpSide()}
			<h3 class="subhead side-head">High-pass {sideWord} <span class="edges">{filterType === 'bandstop' ? 'fsh to fh' : 'fsl to fl'}</span></h3>
			<div class="grid fill">
				<div class="field">
					<label for="responseHp">Response</label>
					<select id="responseHp" bind:value={responseHp}>
						{#each responseOptions as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="topologyHp">Topology</label>
					<select id="topologyHp" bind:value={topologyHp}>
						<option value="mfb" disabled={zerosHp}>Multiple feedback (MFB)</option>
						<option value="sallenKey" disabled={zerosHp}>Sallen-Key (unity gain)</option>
						<option value="towThomas">Tow-Thomas (3 op-amps)</option>
						<option value="boctor" disabled={!zerosHp}>Boctor notch (1 op-amp)</option>
					</select>
				</div>
				<div class="field">
					<label for="amaxHp">Amax - passband ripple (dB)</label>
					<input id="amaxHp" type="number" min="0.01" step="0.1" bind:value={amaxDbHp} />
				</div>
				{#if filterType === 'bandpass'}
					<div class="field">
						<label for="aminHp">Amin - stopband attenuation (dB)</label>
						<input id="aminHp" type="number" min="0.01" step="1" bind:value={aminDbHp} />
					</div>
				{/if}
			</div>
		{/snippet}
		{#snippet lpSide()}
			<h3 class="subhead side-head">Low-pass {sideWord} <span class="edges">{filterType === 'bandstop' ? 'fl to fsl' : 'fh to fsh'}</span></h3>
			<div class="grid fill">
				<div class="field">
					<label for="responseLp">Response</label>
					<select id="responseLp" bind:value={responseLp}>
						{#each responseOptions as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="topologyLp">Topology</label>
					<select id="topologyLp" bind:value={topologyLp}>
						<option value="mfb" disabled={zerosLp}>Multiple feedback (MFB)</option>
						<option value="sallenKey" disabled={zerosLp}>Sallen-Key (unity gain)</option>
						<option value="towThomas">Tow-Thomas (3 op-amps)</option>
						<option value="boctor" disabled={!zerosLp}>Boctor notch (1 op-amp)</option>
					</select>
				</div>
				<div class="field">
					<label for="amaxLp">Amax - passband ripple (dB)</label>
					<input id="amaxLp" type="number" min="0.01" step="0.1" bind:value={amaxDbLp} />
				</div>
				{#if filterType === 'bandpass'}
					<div class="field">
						<label for="aminLp">Amin - stopband attenuation (dB)</label>
						<input id="aminLp" type="number" min="0.01" step="1" bind:value={aminDbLp} />
					</div>
				{/if}
			</div>
		{/snippet}
		<!-- the transformation: one prototype for the whole band, so one
		     response and one Amax (the shared fields when it is selected
		     outright), and a menu for each kind of stage it makes -->
		{#snippet transformBlock()}
			<h3 class="subhead side-head">
				Transformation
				{#if bandEdges}<span class="edges">f0 = {formatHz(bandEdges.f0)}, B = {formatHz(bandEdges.B)}</span>{/if}
			</h3>
			<div class="grid fill">
				{#if bandMethod === 'transformed'}
					<div class="field">
						<label for="responseBand">Response</label>
						<select
							id="responseBand"
							bind:value={
								() => responseLp,
								(v) => {
									responseHp = v;
									responseLp = v;
									mergeNote = '';
								}
							}
						>
							{#each responseOptions as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
						</select>
					</div>
				{/if}
				{#if filterType === 'bandpass'}
					<div class="field">
						<label for="topologyBand">Band-pass stages</label>
						<select id="topologyBand" bind:value={topologyBand}>
							<option value="mfb">MFB band-pass (1 op-amp)</option>
							<option value="towThomas">Tow-Thomas (3 op-amps)</option>
						</select>
					</div>
					{#if topologyBand === 'mfb'}
						<div class="field wide">
							<label for="mfbOpamp">Design the MFB stages for</label>
							<select id="mfbOpamp" bind:value={mfbOpamp}>
								<option value="TL082">TL082 / TL072 ({OPAMP_GBW.TL082 / 1e6} MHz, on its model)</option>
								<option value="LM741">LM741 ({OPAMP_GBW.LM741 / 1e6} MHz)</option>
								<option value="ideal">Ideal op-amp (no correction)</option>
								<option value="other">Other gain-bandwidth</option>
							</select>
						</div>
						{#if mfbOpamp === 'other'}
							<div class="field">
								<label for="mfbGbw">Gain-bandwidth (MHz)</label>
								<input id="mfbGbw" type="number" min="0.01" step="0.1" bind:value={mfbGbwMHz} />
							</div>
						{/if}
					{/if}
				{/if}
				{#if filterType === 'bandstop' || RESPONSES[responseHp]?.zeros || RESPONSES[responseLp]?.zeros}
					<div class="field">
						<label for="topologyNotch">Notch stages</label>
						<select id="topologyNotch" bind:value={topologyNotch}>
							<option value="boctor">Boctor, else Tow-Thomas (1 or 3 op-amps)</option>
							<option value="towThomas">Tow-Thomas (3 op-amps)</option>
						</select>
					</div>
				{/if}
				{#if bandMethod === 'transformed'}
					<div class="field">
						<label for="amaxBand">Amax - passband ripple (dB)</label>
						<input
							id="amaxBand"
							type="number"
							min="0.01"
							step="0.1"
							bind:value={
								() => (amaxDbHp === amaxDbLp ? amaxDbLp : Math.min(amaxDbHp, amaxDbLp)),
								(v) => {
									amaxDbHp = v;
									amaxDbLp = v;
									mergeNote = '';
								}
							}
						/>
					</div>
					{#if filterType === 'bandpass'}
						<div class="field">
							<label for="aminLow">Amin - attenuation below fsl (dB)</label>
							<input id="aminLow" type="number" min="0.01" step="1" bind:value={aminDbHp} />
						</div>
						<div class="field">
							<label for="aminHigh">Amin - attenuation above fsh (dB)</label>
							<input id="aminHigh" type="number" min="0.01" step="1" bind:value={aminDbLp} />
						</div>
					{/if}
				{/if}
			</div>
			{#if filterType === 'bandpass' && topologyBand === 'mfb'}
				<p class="note">
					{#if !transformed}
						The cascade in use has no MFB band-pass stage, so nothing is corrected for the op-amp.
					{:else}
						{mfbGbw !== null
							? 'Each MFB band-pass stage is designed at a higher f0 and a lower Q, so that this op-amp brings it onto its target.'
							: mfbOpamp === 'other'
								? 'No gain-bandwidth above 0 is entered, so the MFB band-pass stages are designed for an ideal op-amp.'
								: 'The MFB band-pass stages are designed for an ideal op-amp.'}
						{#if mfbOpamp === 'TL082'}
							The {formatHz(OPAMP_GBW.TL082)} comes from TI's model of the part. The datasheet gives 3 MHz typical and real parts vary, so the LTspice run and a bench test still decide.
						{/if}
						Notch, Tow-Thomas and cascade stages are not corrected.
					{/if}
				</p>
			{/if}
			{#if mergeNote}
				<p class="note">{mergeNote}</p>
			{:else if bandMethod !== 'transformed' && amaxDbHp !== amaxDbLp}
				<p class="note">The transformation takes one Amax for the whole band, the smaller one: {amaxBand} dB.</p>
			{/if}
		{/snippet}
		<!-- the layout follows the method selected, not the one auto picks,
		     so typing a value never swaps the field being typed in -->
		{#if isBandType && bandMethod === 'transformed'}
			{@render transformBlock()}
		{:else if filterType === 'bandpass'}
			{@render hpSide()}
			{@render lpSide()}
			{#if bandMethod === 'auto'}{@render transformBlock()}{/if}
		{:else if filterType === 'bandstop'}
			{@render lpSide()}
			{@render hpSide()}
			{#if bandMethod === 'auto'}{@render transformBlock()}{/if}
		{/if}

		<p class="note">
			{#if isNarrow}
				A narrow band-pass picks out one frequency: one second-order band-pass stage centred on f0,
				or N identical ones in series. Q = f0 / B sets how narrow its -3 dB band is, and K its gain
				at f0 (an inverting circuit gives -K, the same size). One stage holds a Q of 5 to 10 well;
				N stages share a higher one.
			{:else if filterType === 'highpass'}
				For a high-pass, fp is the passband edge above which the filter passes, and fs the
				stopband edge below it (fp &gt; fs).
			{:else if transformed && filterType === 'bandpass'}
				This builds the band-pass from one low-pass prototype: each of its poles becomes band-pass
				stages around the centre f0 = √(fl·fh), so the response keeps the prototype's shape, mirrored
				about f0. A narrow band needs far fewer stages this way than with a high-pass and a low-pass
				in series. Needs fsl &lt; fl &lt; fh &lt; fsh.
			{:else if transformed}
				This builds the band-stop from one low-pass prototype turned into notch stages in series,
				each passing DC and high frequencies at gain 1, so no summing amplifier is needed. Needs
				fl &lt; fsl &lt; fsh &lt; fh.
			{:else if filterType === 'bandpass'}
				This builds a band-pass by cascading a high-pass section (passes above fl, blocked below
				fsl) with a low-pass section (passes below fh, blocked above fsh) - the standard approach
				when the two edges are well separated. Needs fsl &lt; fl &lt; fh &lt; fsh.
			{:else if filterType === 'bandstop'}
				This builds a band-stop by summing a low-pass branch (passes below fl, blocked above fsl)
				and a high-pass branch (passes above fh, blocked below fsh) with a summing amplifier -
				passing both outer bands and rejecting the gap between them. Needs
				fl &lt; fsl &lt; fsh &lt; fh.
			{:else}
				For a low-pass, fp is the passband edge below which the filter passes, and fs the
				stopband edge above it (fs &gt; fp).
			{/if}
		</p>

		{#if isNarrow}
			<p class="note">
				{narrowGbw !== null
					? 'The multiple feedback circuit is designed at a higher f0 and a lower Q, so that this op-amp brings it onto its target.'
					: mfbOpamp === 'other'
						? 'No gain-bandwidth above 0 is entered, so the multiple feedback circuit is designed for an ideal op-amp.'
						: 'The multiple feedback circuit is designed for an ideal op-amp.'}
				{#if mfbOpamp === 'TL082'}
					The {formatHz(OPAMP_GBW.TL082)} comes from TI's model of the part. The datasheet gives 3 MHz typical and real parts vary, so the LTspice run and a bench test still decide.
				{/if}
				The other five circuits are designed for an ideal op-amp, and the comparison in panel 04 shows what a TL082 does to each.
			</p>
			{#if narrowDesign && narrowDesign.q < 1}
				<p class="flag warn">
					Q = {Number(narrowDesign.q.toPrecision(3))}: the band is wider than f0 itself, which is not narrow. The Band-pass type, a high-pass and a low-pass side with their own edges, shapes a wide band better.
				</p>
			{/if}
		{/if}

		{#if !isNarrow}
		<p class="note">
			{#if transformed}
				{RESPONSES[responseLp].label}: {RESPONSES[responseLp].best}.
				{#if RESPONSES[responseLp].zeros}
					{zeroResponsesText} zeros in the stopband{filterType === 'bandpass'
						? ': each pole pair with a zero becomes two notch stages, built with the Notch stages menu'
						: ', which spread the zeros of the notch stages across the stopband instead of all at f0'}.
				{/if}
				{#if responseLp === 'bessel'}
					The transformation keeps the Bessel magnitude, not its flat delay: across the band the delay is no
					longer constant.
				{/if}
			{:else if isBandType}
				High-pass {filterType === 'bandstop' ? 'branch' : 'side'}: {RESPONSES[responseHp].label}, {RESPONSES[responseHp].best}.
				Low-pass {filterType === 'bandstop' ? 'branch' : 'side'}: {RESPONSES[responseLp].label}, {RESPONSES[responseLp].best}.
			{:else}
				{RESPONSES[response].label}: {RESPONSES[response].best}.
			{/if}
			{#if needsTowThomas && !topologyBlocked && !transformed}
				{zeroResponsesText} zeros in the stopband. Tow-Thomas and Boctor can
				build a stage with zeros (its notch form), so every second-order stage {isBandType
					? zerosHp && zerosLp
						? 'uses the selected notch topology on each side'
						: `of the ${zerosHp ? 'high' : 'low'}-pass ${filterType === 'bandstop' ? 'branch' : 'side'} uses its selected notch topology, while the other ${filterType === 'bandstop' ? 'branch' : 'side'} keeps its own topology`
					: 'uses the selected notch topology'}; an odd order adds one first-order RC stage.
			{/if}
		</p>
		{/if}

		{#if blocked}
			<p class="flag bad">
				{#if isBandType}
					{#each blockedSides as side (side)}
						The {side} {filterType === 'bandstop' ? 'branch' : 'side'} is {RESPONSES[side === 'high-pass' ? responseHp : responseLp].short ??
							RESPONSES[side === 'high-pass' ? responseHp : responseLp].label}, which needs a notch section: select Tow-Thomas or Boctor in its Topology menu to continue.
					{/each}
				{:else}
					{zeroResponses.map((r) => RESPONSES[r].short ?? RESPONSES[r].label).join(' and ')} needs notch sections: select Tow-Thomas or Boctor in Topology to continue.
				{/if}
			</p>
		{/if}

		{#if !valid}
			<p class="flag bad">
				{#if isNarrow}
					f0, {narrowBy === 'q' ? 'Q' : 'B'} and K must be numbers above 0.
				{:else if filterType === 'highpass'}
					fp must be greater than fs, and Amin must be greater than Amax.
				{:else if filterType === 'bandpass' && bandMethod === 'transformed'}
					Frequencies must satisfy fsl &lt; fl &lt; fh &lt; fsh, and both Amin must be greater than
					Amax.
				{:else if filterType === 'bandpass'}
					Frequencies must satisfy fsl &lt; fl &lt; fh &lt; fsh, and on each side Amin must be
					greater than Amax.
				{:else if filterType === 'bandstop'}
					Frequencies must satisfy fl &lt; fsl &lt; fsh &lt; fh, and Amin must be greater than
					{bandMethod === 'transformed' ? 'Amax' : "each branch's Amax"}.
				{:else}
					fs must be greater than fp, and Amin must be greater than Amax.
				{/if}
			</p>
		{/if}
	</section>

	<BasicsPanel
		title="Start here"
		summary="New to filters: what this page is about, with a little maths and four figures to move"
		minutes={5}
		blocks={isNarrow
			? // a narrow band-pass gets a line of its own, then the basics told on a low-pass
				filterBasics({ filterType: 'narrowband', design: narrowDesign, stock, pairs: componentOpts.pairs, pairLimit: componentOpts.pairLimit })
			: filterBasics({
			filterType,
			// the transformation's figures: one response and Amax, order 2n,
			// its two stage menus
			method: isBandType ? method : null,
			response: isBandType ? responseLp : response,
			topology: transformed ? topologyBand : isBandType ? topologyLp : topology,
			topologyNotch,
			order: transformed ? 2 * (orderBand ?? 0) : isBandType ? (orderLp ?? 0) + (orderHp ?? 0) : order,
			stages: realizedStages.length,
			fp,
			fs,
			amaxDb: transformed ? amaxBand : isBandType ? amaxDbLp : amaxDb,
			aminDb: isBandType ? aminSideLp : aminDb,
			bandLimits: isBandType ? { hp: { amaxDb: amaxDbHp, aminDb: aminSideHp }, lp: { amaxDb: amaxDbLp, aminDb: aminSideLp }, amaxAtFl, amaxAtFh, aminAtFsl, aminAtFsh } : null,
			fl,
			fh,
			fsl,
			fsh,
			lpFp,
			lpFs,
			k,
			design,
			realizedStages,
			bandStopBranches,
			combineSigns,
			attenuationAtFs,
			attenuationAtFp,
			attenuationAtFsl,
			attenuationAtFsh,
			attenuationAtFl,
			attenuationAtFh,
			stock,
			// every stage of a transformed band-stop is a notch
			needsTowThomas: transformed ? hasZeros : needsTowThomas,
			pairs: componentOpts.pairs,
			pairLimit: componentOpts.pairLimit
		})}
		widgets={{ 'two-tones': TwoTonesDemo, 'rc-on-spec': RcOnSpecDemo, 'order-on-spec': OrderOnSpecDemo, 'stages-multiply': StagesMultiplyDemo }}
	/>

	<!-- the same spec designed by hand with the table method, every number checked;
	     the table method has no narrow band-pass, which is one stage designed below -->
	{#if isNarrow}
		<p class="note build-note">The build-by-hand panel follows the table method of the four other types. A narrow band-pass is one stage, or N identical ones, and its math blocks below go through it by hand.</p>
	{:else}
	<BuildPanel
		{filterType}
		{fp}
		{fs}
		{fl}
		{fh}
		{fsl}
		{fsh}
		{amaxDb}
		{aminDb}
		amaxAtFl={filterType === 'bandstop' ? amaxDbLp : amaxDbHp}
		amaxAtFh={filterType === 'bandstop' ? amaxDbHp : amaxDbLp}
		{aminAtFsl}
		{aminAtFsh}
		pageResponse={isBandType ? (responseHp === responseLp ? responseLp : 'butterworth') : response}
		{componentOpts}
		stockPhrase={stockWords(stock, componentOpts.pairs)}
		{spiceOpamp}
	/>
	{/if}

	{#if realizationFailures.length}
		<p class="flag bad">{failureText}</p>
	{/if}
	{#if !isNarrow && usesTopology('boctor') && !realizationFailures.length}
		<p class="note">Boctor uses one op-amp, six resistors and two capacitors per notch section. The high-pass form has gain above one. Resistor rounding can leave a finite notch minimum; the response plot includes it. {transformed ? `${filterType === 'bandpass' ? "Band-pass stages keep the band-pass menu's circuit, and a" : 'A'} notch Boctor cannot build (its zero on its own f0, past the high-pass form's Q limit, or no parts for it) is a Tow-Thomas notch, and so is one where Boctor's own gain would move the passband by more than 1 dB or leave its zero off target. Both are judged on the full E24 and E6 grids, so a smaller stock only rounds the parts of the stages Boctor keeps.` : 'Sections without finite zeros keep the Tow-Thomas circuit, and an odd order keeps its first-order RC section.'} <a href="https://www.analog.com/media/en/training-seminars/design-handbooks/Basic-Linear-Design/Chapter8.pdf" target="_blank" rel="noreferrer">Derivation reference: Analog Devices, figures 8.78 and 8.79.</a></p>
	{/if}
	{#if isNarrow}
		{#if narrowDesign}
			{@const d = narrowDesign}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Stages</h2>
					<span class="hint">{d.n === 1 ? `one second-order stage, Q = ${sig(d.stageQ)}` : `${d.n} identical stages, Q = ${sig(d.stageQ)} each`}</span>
				</div>

				<Equation tex={narrowWidthTex} />
				{#each narrowEdgesTex as tex (tex)}<Equation {tex} />{/each}
				{#if d.n > 1}
					<p class="note">
						{d.n} identical stages in series multiply their responses, so the -3 dB points of the whole
						sit where each stage is only {(3 / d.n).toFixed(2)} dB down: the band of the cascade is
						narrower than one stage's by a shrink factor, the square root below. Each stage therefore gets a lower Q than the
						filter's, all of them centred on f0, and an equal share of the gain:
					</p>
					{#each narrowShrinkTex as tex (tex)}<Equation {tex} />{/each}
				{:else}
					<p class="note">One stage takes the Q and the gain of the whole filter: Q_s = Q = {sig(d.q)} and K_s = K = {sig(d.gain)}.</p>
				{/if}
				<p class="note">
					{#if d.n > 1}
						The cost: {d.n} times the op-amps and parts of one stage. In return, far from f0 the response
						falls at {d.skirtDbPerDecade} dB per decade on each side, against -20 for one stage, and the
						lower Q of each stage is easier to hold with real parts.
					{:else}
						Far from f0 one stage falls at 20 dB per decade on each side. N identical stages fall
						N times faster, -20N dB per decade, for N times the op-amps, and each needs a lower Q.
					{/if}
				</p>
				<MathPanel summary="Show where these numbers come from" blocks={explainNarrowBandOrder(d)} />
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">03</span>
					<h2>Transfer function</h2>
					<span class="hint">ω0 = {(d.w0 / 1000).toFixed(2)}k rad/s, Q_s = {sig(d.stageQ)}, K_s = {sig(d.stageGain)}</span>
				</div>
				<p class="note">
					Each stage is the second-order band-pass: its numerator s makes it pass nothing at DC and at
					high frequencies, and at s = jω0 the s² and ω0² terms cancel, which leaves exactly K_s.
					{d.n > 1 ? `The ${d.n} stages in series multiply:` : 'One stage is the whole filter:'}
				</p>
				<Equation tex={`H_s(s) = K_s\\,\\dfrac{\\frac{\\omega_0}{Q_s}s}{s^2 + \\frac{\\omega_0}{Q_s}s + \\omega_0^2}`} />
				<Equation tex={`H(s) = ${d.n > 1 ? `H_s(s)^{${d.n}}` : 'H_s(s)'}, \\qquad |H_s(j\\omega_0)| = K_s`} />
				{#each narrowHsTex as tex (tex)}<Equation {tex} />{/each}
				<div class="tableScroll">
					<table>
						<thead>
							<tr>
								<th>Stage</th>
								<th>f0 = ω0/2π</th>
								<th>Q</th>
								<th>Gain at f0</th>
								<th>B of the stage</th>
							</tr>
						</thead>
						<tbody>
							{#each d.stages as stage, i (i)}
								<tr>
									<td>{i + 1}</td>
									<td>{formatHz(stage.wn / (2 * Math.PI))}</td>
									<td>{sig(stage.q, 5)}</td>
									<td>{stage.gain.toFixed(4)} ({narrowDb(20 * Math.log10(stage.gain))} dB)</td>
									<td>{formatHz(d.stageB)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="note">
					The whole filter: f0 = {formatHz(d.f0)}, Q = {sig(d.q)}, B = {formatHz(d.B)} between
					{formatHz(d.f1)} and {formatHz(d.f2)}, K = {sig(d.gain)} ({narrowDb(d.gainDb)} dB) at f0.
				</p>
				<MathPanel
					summary="Show the math for every stage"
					blocks={d.n === 1 ? explainNarrowBandStage(d, 0) : [{ type: 'p', text: d.n === 2 ? 'Stages 1 and 2, the same' : `Stages 1 to ${d.n}, all the same`, cls: 'stageHead' }, ...explainNarrowBandStage(d, 0)]}
				/>
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">04</span>
					<h2>Components</h2>
					<span class="hint">
						{narrowChosen ? NARROW_LABELS[narrowChosen] : 'no circuit'}{d.n > 1 ? `, ${d.n} stages` : ''}{narrowGainWords(narrowGainStages.length)}
					</span>
				</div>

				<StockPicker id="stock" bind:stock bind:resistorText bind:capacitorText bind:pairs bind:pairLimit />

				{#if restrictedStock}
					<p class="note">
						The search now rounds {stock === 'labR' ? 'every resistor to the lab resistors, the capacitors staying on the usual series,' : 'to those values only,'} so the errors below grow{componentOpts.pairs ? ', less so with two in series' : ''}.
						Everything downstream is computed from the rounded values, so the Bode plot already shows
						whether the result still holds.
					</p>
				{/if}

				<h3 class="subhead">Six circuits for this spec</h3>
				<div class="tableScroll">
					<table class="methods narrow-table">
						<thead>
							<tr>
								<th>Circuit</th>
								<th>Op-amps</th>
								<th>Parts</th>
								<th>After rounding<br />f0 / Q / K, %</th>
								<th>Shift on a TL082<br />f0 / Q / K, %</th>
								<th>R spread</th>
								<th>Worst S<sup>Q</sup></th>
								<th>Rule</th>
							</tr>
						</thead>
						<tbody>
							{#each narrowRows as row (row.circuit)}
								<tr class:chosen={row.circuit === narrowChosen}>
									<td>{row.label}{row.ok ? narrowGainWords(row.realized.gainStages.length) : ''}</td>
									<td>{row.ok ? row.opamps : '-'}</td>
									<td>{row.ok ? `${row.parts.resistors} R, ${row.parts.capacitors} C` : '-'}</td>
									<td>{row.ok ? narrowTriple(row.ideal.errors) : '-'}</td>
									<td>
										{#if !row.ok}-{:else if row.stability?.oscillates}oscillates near {formatHz(row.stability.freq)}{:else}{narrowTriple(narrowShiftErrors(row.shift))}{#if narrowCorrectedRow(row)}<br /><span class="err">built for it</span>{/if}{/if}
									</td>
									<td>{row.ok ? `${ratioText(row.spread.resistors)}:1` : '-'}</td>
									<td>{row.ok && row.sensitivity?.worst ? `${Math.abs(row.sensitivity.worst.value).toFixed(2)} (${row.sensitivity.worst.part})` : '-'}</td>
									<td>{narrowRuleText(row)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="note">
					Errors in percent of the target, each circuit built from {stockPhrase} with its capacitors
					found automatically. After rounding: from the parts, ideal op-amps{narrowGbw !== null ? ' (the multiple feedback circuit with the op-amp it is designed for)' : ''}. The shift: what a
					single-pole op-amp of the TL082's measured {formatHz(NARROW_REAL_GBW)} adds, solved from each
					circuit's netlist, and its poles checked for an oscillation.{narrowGbw === NARROW_REAL_GBW
						? ' The multiple feedback circuit is built for that op-amp, so its shift is zero by design; its stage below says how much loop gain the correction leaves.'
						: ''} Worst S<sup>Q</sup>: Q moves that many percent for 1 % off on that part.
				</p>
				<p class="note">
					{NARROW_RULE_TEXT}
					{#if narrowAuto}
						Here that is the {narrowName(narrowAuto)}{narrowRows.some((r) => r.qualifies) ? '' : ', as none qualifies'}{narrowCircuit === 'auto' ? '; the Circuit menu in panel 01 picks another one.' : `, and the Circuit menu has the ${narrowName(narrowCircuit)} selected instead.`}
					{/if}
				</p>
				{#if componentOpts.pairs && componentOpts.pairLimit !== null}
					<p class="note">
						Every circuit of the table is built within the limit of {componentOpts.pairLimit} resistor{componentOpts.pairLimit === 1 ? '' : 's'} of two in series, as the one built below.
						{#if narrowBuild?.plan}
							{@const plan = narrowBuild.plan}
							{plan.limited
								? `Pairs where they help would make ${plan.total} resistors two in series, more than the limit.${d.n > 1 ? ' The stages are identical, so they share one set of pairs.' : ''} ${plan.kept.length ? `${listText(plan.kept)} ${plan.kept.length > 1 ? 'stay' : 'stays'} two in series and ${listText(plan.dropped)} ${plan.dropped.length > 1 ? 'are single parts' : 'is a single part'}` : 'Every resistor is a single part'}: of the sets within the limit, the one that lands closest.`
								: plan.total
									? `Pairs where they help make ${plan.total} resistor${plan.total === 1 ? '' : 's'} two in series, within the limit, so every one stays.`
									: 'No resistor here needs two in series, so the limit changes nothing.'}
						{/if}
					</p>
				{/if}

				{#if !narrowRow}
					<p class="flag bad">No circuit builds this spec with parts in range. Change f0, Q, K or the stock.</p>
				{:else if !narrowRow.ok}
					<p class="flag bad">The {narrowName(narrowRow.circuit)} cannot be built here: {narrowRow.why}. Pick another circuit in the Circuit menu, or change the spec.</p>
				{/if}

				{#if narrowShortfall.length > 0}
					<p class="flag warn">
						Stage{narrowShortfall.length > 1 ? 's' : ''}
						{narrowShortfall.join(', ')}
						cannot be built from those values at all, so {narrowShortfall.length > 1 ? 'they are' : 'it is'}
						shown with the full E24 and E6 grids instead. Add values, or lower the Q.
					</p>
				{/if}
				{#if narrowOpampAlert}
					<p class="flag warn">{narrowOpampAlert}</p>
				{/if}
				{#if narrowGainStages.length}
					{@const gs = narrowGainStages}
					<p class="note">
						The {narrowName(narrowChosen)} cannot reach K = {sig(d.gain)} by its own form ({narrowGainWhy(narrowChosen, narrowStages[0])}), so {gs.length === 1
							? `a non-inverting stage after the last one adds the rest, its rounding included: 1 + R2/R1 = ${gs[0].actual.gain.toFixed(3)}.`
							: `${gs.length} non-inverting stages after the last one add the rest, its rounding included: 1 + R2/R1 = ${gs.map((g) => g.actual.gain.toFixed(3)).join(', ')}. One amplifier of gain ${gs.reduce((acc, g) => acc * g.actual.gain, 1).toFixed(1)} would close its loop at ${formatHz(NARROW_REAL_GBW / gs.reduce((acc, g) => acc * g.actual.gain, 1))} on a TL082, too close to f0; each of these keeps g·f0 within a tenth of its gain-bandwidth.`}{narrowChosen === 'rlcGyrator' || narrowChosen === 'rlcGic'
							? ` The + input of the first buffers the tank, so the RLC stage before it needs no follower of its own.`
							: ''}
					</p>
				{/if}

				{#each narrowStages as stageDesign, i (i)}
					{@const target = stageDesign.topology === 'gainNonInv' ? null : d.stages[i]}
					{@const sens = target ? narrowStageSensitivity(stageDesign) : null}
					{@const mathBlocks = narrowExplain(stageDesign, i)}
					<div class="stage-block">
						<h3>Stage {i + 1} · {NARROW_STAGE_WORD[stageDesign.topology] ?? stageDesign.topology}</h3>
						<div class="stage-grid">
							<div>
								<table>
									<thead>
										<tr>
											<th>Component</th>
											<th>Value</th>
										</tr>
									</thead>
									<tbody>
										{#each Object.entries(stageDesign.components) as [name, value] (name)}
											<tr>
												<td>{name}</td>
												<td>{name.startsWith('R') || name.startsWith('r') ? pairLabel(value, componentOpts.resistorSeries, formatOhms, componentOpts.pairs && !stageDesign.stockShortfall) : formatFarads(value)}</td>
											</tr>
										{/each}
									</tbody>
								</table>

								<table class="actual">
									<tbody>
										{#if target}
											<tr>
												<th>f0 actual</th>
												<td>
													{formatHz(stageDesign.actual.wn / (2 * Math.PI))}
													<span class="err">({formatPercent(relativeErrorPercent(stageDesign.actual.wn, target.wn))})</span>
												</td>
											</tr>
											<tr>
												<th>Q actual</th>
												<td>
													{stageDesign.actual.q.toFixed(4)}
													<span class="err">({formatPercent(relativeErrorPercent(stageDesign.actual.q, target.q))})</span>
												</td>
											</tr>
											<tr>
												<th>Gain at its f0</th>
												<td>
													{Math.abs(stageDesign.actual.gain).toFixed(3)}{stageDesign.actual.gain < 0 ? ', inverting' : ''}
													<span class="err"
														>({narrowGainStages.length
															? `the gain stage${narrowGainStages.length > 1 ? 's add' : ' adds'} the rest`
															: formatPercent(relativeErrorPercent(Math.abs(stageDesign.actual.gain), target.gain))})</span
													>
												</td>
											</tr>
											{#if stageDesign.topology === 'rlcGyrator'}
												<tr>
													<th>Inductor</th>
													<td>
														{formatHenry(stageDesign.components.R1 * stageDesign.components.R2 * stageDesign.components.Cg)}
														<span class="err">(R1·R2·Cg, with R1 = {formatOhms(stageDesign.components.R1)} in series)</span>
													</td>
												</tr>
											{:else if stageDesign.topology === 'rlcGic' && Number.isFinite(stageDesign.actual.L)}
												<tr>
													<th>Inductor</th>
													<td>{formatHenry(stageDesign.actual.L)} <span class="err">(Cg·R1·R3·R4 / R2, exact)</span></td>
												</tr>
											{:else if stageDesign.topology === 'sallenKeyBp' && Number.isFinite(stageDesign.actual.K)}
												{@const lim = sallenKeyBpLimit(stageDesign.components)}
												<tr>
													<th>K_a = 1 + Rf/Rg</th>
													<td>{stageDesign.actual.K.toFixed(4)} <span class="err">(these parts oscillate at {lim.K.toFixed(3)}, {(100 * lim.margin).toFixed(1)} % more on Rf/Rg)</span></td>
												</tr>
											{:else if stageDesign.topology === 'mfbBp' && stageDesign.ideal}
												<tr>
													<th>Circuit alone</th>
													<td>
														{formatHz(stageDesign.ideal.wn / (2 * Math.PI))}, Q {stageDesign.ideal.q.toFixed(4)}, gain {Math.abs(stageDesign.ideal.gain).toFixed(3)}
														<span class="err">(ideal op-amp)</span>
													</td>
												</tr>
											{/if}
										{:else}
											<tr>
												<th>Gain actual</th>
												<td>
													{stageDesign.actual.gain.toFixed(4)}
													<span class="err">({formatPercent(relativeErrorPercent(stageDesign.actual.gain, stageDesign.steps.gainTarget))})</span>
												</td>
											</tr>
										{/if}
									</tbody>
								</table>
								{#if sens}
									<p class="note">
										1% error on any one component moves Q by roughly
										{worstCaseQError(sens, 1).toFixed(2)}% (root-sum-square across all of them).
									</p>
								{/if}
								{#if target}
									{#each narrowStageAlerts(stageDesign, target, i) as alert, k (k)}
										<p class="flag {alert.level}">{alert.text}</p>
									{/each}
								{/if}
								{#if stageDesign.topology === 'mfbBp' && Number.isFinite(stageDesign.actual.gbw)}
									<p class="note">
										Built for {mfbOpampLabel}: f0, Q and gain above are with that op-amp. Another op-amp needs another correction.
									</p>
								{/if}
							</div>
							<!-- a pair is drawn as its two parts, R1 56k + 8.2k; a stage that fell back to E24 has none -->
							<CircuitDiagram
								design={stageDesign}
								ohms={(v) => pairDiagramLabel(v, componentOpts.resistorSeries, formatOhms, componentOpts.pairs && !stageDesign.stockShortfall)}
							/>
							{#if target}
								<div class="math-full cap-picker">
									<p class="note">
										{#if NARROW_ONE_CAP.includes(stageDesign.topology)}
											{stageDesign.topology === 'rlcGyrator' || stageDesign.topology === 'rlcGic'
												? 'C sets the tank capacitor and the one of the inductor circuit, the same value.'
												: 'C sets both equal capacitors.'}
											Pick a different value if the one above is not in stock; the resistors above are recalculated to fit.
										{:else}
											Pick different C1 and C2 values if the ones above are not in stock; the resistors above are
											recalculated to fit.
										{/if}
									</p>
									<div class="row">
										{#if NARROW_ONE_CAP.includes(stageDesign.topology)}
											<div class="field">
												<label for={`cap-C-${i}`}>C (nF)</label>
												<input
													id={`cap-C-${i}`}
													type="number"
													step="any"
													min="0"
													placeholder={((stageDesign.components.C ?? stageDesign.components.C1) * 1e9).toPrecision(4)}
													value={capOverrides[i]?.C ?? ''}
													oninput={(e) => setCapOverride(i, 'C', e.currentTarget.value)}
												/>
											</div>
										{:else}
											<div class="field">
												<label for={`cap-c1-${i}`}>C1 (nF)</label>
												<input
													id={`cap-c1-${i}`}
													type="number"
													step="any"
													min="0"
													placeholder={(stageDesign.components.C1 * 1e9).toPrecision(4)}
													value={capOverrides[i]?.C1 ?? ''}
													oninput={(e) => setCapOverride(i, 'C1', e.currentTarget.value)}
												/>
											</div>
											<div class="field">
												<label for={`cap-c2-${i}`}>C2 (nF)</label>
												<input
													id={`cap-c2-${i}`}
													type="number"
													step="any"
													min="0"
													placeholder={(stageDesign.components.C2 * 1e9).toPrecision(4)}
													value={capOverrides[i]?.C2 ?? ''}
													oninput={(e) => setCapOverride(i, 'C2', e.currentTarget.value)}
												/>
											</div>
										{/if}
										{#if capOverrides[i]}
											<button type="button" class="ghost small" onclick={() => clearCapOverride(i)}>Use suggested</button>
										{/if}
									</div>
									{#if narrowBuild?.capErrors[i]}
										<p class="flag bad">{narrowBuild.capErrors[i]} Showing the automatic values instead.</p>
									{/if}
									{#if stageDesign.outOfRange}
										<p class="flag warn">
											A resistor falls outside the range this circuit is designed for with these capacitors; consider
											different values.
										</p>
									{/if}
								</div>
							{/if}
							{#if mathBlocks.length}
								<div class="math-full">
									<MathPanel summary="Show the math for this stage's components" blocks={mathBlocks} />
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</section>

			{#if narrowStages.length}
				<section class="panel">
					<div class="panel-head">
						<span class="num">05</span>
						<h2>Bode plot</h2>
						<span class="hint">
							{#if narrowIdealFig}
								peak {Math.abs(narrowIdealFig.gain).toFixed(3)} at {formatHz(narrowIdealFig.f0)}, B = {narrowIdealFig.B ? formatHz(narrowIdealFig.B) : '-'}
							{/if}
						</span>
					</div>

					<BodePlot
						points={narrowBodePoints}
						passbandFreqs={[d.f1, d.f2]}
						stopbandFreqs={[d.f0]}
						limits={[{ db: -d.gainDb }, { db: 3 - d.gainDb }]}
						fineTicks
						markers={[
							{ freq: d.f1, text: 'f1' },
							{ freq: d.f0, text: 'f0' },
							{ freq: d.f2, text: 'f2' }
						]}
						extra={narrowRealPoints}
					/>
					<div class="legend wrap">
						<span><i class="line blue"></i>simulated response (rounded components{narrowCorrected ? `, the MFB stages with the ${formatHz(narrowGbw)} op-amp model` : ''})</span>
						{#if narrowRealPoints}<span><i class="line dim"></i>the same on a TL082 ({formatHz(NARROW_REAL_GBW)}, single pole)</span>{/if}
						<span><i class="line amber"></i>f0, the -3 dB edges f1 and f2, the gain K and K - 3 dB</span>
					</div>

					{#if narrowIdealFig}
						{@const fig = narrowIdealFig}
						{@const atF0 = magnitudePhaseAt(narrowStages, d.f0).db}
						<p class="flag {narrowWithin(narrowIdealErr) ? 'ok' : 'warn'}">
							Built from these parts: the peak at {formatHz(fig.f0)} ({narrowPct(narrowIdealErr.f0, 2)}), gain
							{Math.abs(fig.gain).toFixed(3)} there ({narrowDb(fig.gainDb)} dB, {narrowPct(narrowIdealErr.gain)}), the -3 dB edges at
							{fig.f1 ? formatHz(fig.f1) : '-'} and {fig.f2 ? formatHz(fig.f2) : '-'}: B = {fig.B ? formatHz(fig.B) : '-'}, Q = {fig.q ? fig.q.toFixed(3) : '-'}
							({narrowIdealErr.q === null ? '-' : narrowPct(narrowIdealErr.q)}). At f0 = {formatHz(d.f0)} itself the gain is {(10 ** (atF0 / 20)).toFixed(3)} ({narrowDb(atF0)} dB).
							{narrowWithin(narrowIdealErr)
								? 'Within the limits of the rule above.'
								: `More than the rule allows: ${Object.keys(capOverrides).length ? 'the capacitors typed above and the rounding to ' + stockPhrase + ' move it' : 'the rounding to ' + stockPhrase + ' moves it'}${stock === 'E24' ? '; the E96 series narrows it' : ''}.`}
						</p>
					{/if}
					{#if narrowRealFig}
						{@const fig = narrowRealFig}
						{#if narrowOscillates}
							<p class="flag bad">
								On a TL082 ({formatHz(NARROW_REAL_GBW)}, single pole) this circuit oscillates, near {formatHz(narrowRealStability.freq)}: a pole pair of the chain sits in the right half plane. Its response on paper would read a peak at {formatHz(fig.f0)} with Q = {fig.q ? fig.q.toFixed(1) : '-'}, but no such filter settles. Another circuit in the table, more stages of lower Q, or a faster op-amp keeps it stable.
							</p>
						{:else}
						<p class="flag {narrowWithin(narrowRealErr) ? 'ok' : 'warn'}">
							On a TL082 ({formatHz(NARROW_REAL_GBW)}, single pole): the peak at {formatHz(fig.f0)} ({narrowPct(narrowRealErr.f0, 2)}), gain
							{Math.abs(fig.gain).toFixed(3)} ({narrowPct(narrowRealErr.gain)}), Q = {fig.q ? fig.q.toFixed(3) : '-'} ({narrowRealErr.q === null ? '-' : narrowPct(narrowRealErr.q)}).
							{narrowWithin(narrowRealErr)
								? 'Within the limits of the rule above.'
								: narrowWithin(narrowIdealErr)
									? `The op-amp's finite speed moves it past the limits of the rule above: a faster op-amp, ${narrowChosen === 'mfbBp' ? 'the MFB stages designed for this one (panel 01)' : 'another circuit in the table'}, or a lower f0·Q keeps it closer. The LTspice download runs the real part.`
									: `Past the limits of the rule above, as the parts alone already are${narrowOpampAlert ? ', and the op-amp moves it further' : ''}.`}
						</p>
						{/if}
					{/if}
				</section>

				<section class="panel">
					<div class="panel-head">
						<span class="num">06</span>
						<h2>Download</h2>
					</div>

					<p class="note">
						A standalone JavaScript file with this exact design: the same stage calculation and
						component search as this page, parameterized at the top so it can be edited and rerun with
						<code>node filter-design.js</code>. It also prints the same report shown above, plus notes on
						simulating, building and testing the result.
					</p>

					<OpampPicker id="spiceOpamp" label="Op-amp in the LTspice file" bind:value={spiceOpamp} />

					<div class="row downloads">
						<button type="button" onclick={downloadNarrowScript}>Download filter-design.js</button>
						<button type="button" onclick={downloadNarrowSchematic}>Download filter-design.asc (LTspice)</button>
					</div>

					<p class="note">
						An LTspice schematic with the same component values as the tables above and the AC analysis
						already set up: open it, press Run, plot V(vout). Each stage is drawn wire by wire, the
						inductor as its op-amp circuit, never a coil.
						{#if OPAMP_MODELS[spiceOpamp]?.real}
							Each op-amp is the {spiceOpamp} with its supply pins showing, on +15 V and -15 V rails (the two
							sources under the drawing, nets v++ and v--); its model is written into the file, so it runs
							with no library to install. The simulation shows what the part does to the response, which
							the page's single-pole figure only approximates.
						{:else if narrowCorrected}
							Each op-amp is LTspice's ideal single-pole model with its gain-bandwidth as an editable
							attribute, set to {ltspiceGbw(narrowGbw)}, the op-amp the multiple feedback stages are built for, so the run
							gives the response above.
						{:else}
							Each op-amp is LTspice's ideal single-pole model with its gain-bandwidth as an editable
							attribute (3Meg for a TL07x by its datasheet, 10Meg for an NE5532), so the simulation shows
							what the gain-bandwidth alone does to the response.
						{/if}
					</p>

					<p class="note formula-link">
						Every formula this design used, on its own reference page with what each one is and how to
						use it: <a href="/tools/filter-design/formulas/">Formula sheet</a>.
					</p>
				</section>

				<section class="panel">
					<div class="panel-head">
						<span class="num">07</span>
						<h2>Next steps</h2>
					</div>

					<p class="note">This tool only gets to a paper design. Before trusting it on a bench:</p>

					<ol class="steps">
						{#each narrowNextSteps as step, i (i)}
							<li><strong>{step.title}.</strong> {step.detail}</li>
						{/each}
					</ol>
				</section>
			{/if}
		{/if}
	{:else if valid && !blocked && !realizationFailures.length}
		{#snippet methodTable()}
			<h3 class="subhead">Two ways to build it</h3>
			<div class="tableScroll">
				<table class="methods">
					<thead>
						<tr>
							<th>Method</th>
							<th>Order</th>
							<th>Stages</th>
							<th>Op-amps</th>
							<th>Highest Q</th>
							<th>Note</th>
						</tr>
					</thead>
					<tbody>
						{#each methodRows as row (row.key)}
							<tr class:chosen={row.key === method}>
								<td>{row.label.replace(/^./, (c) => c.toUpperCase())}</td>
								<td>{row.order}</td>
								<td>{row.stages ?? '-'}</td>
								<td>{row.available ? row.opamps : '-'}</td>
								<td>{row.highestQ ? row.highestQ.toFixed(2) : '-'}</td>
								<td>
									{#if !row.available}
										cannot be built: {row.reason}
									{:else}
										{row.key === method ? 'used' : ''}{row.key === method && row.note ? '; ' : ''}{row.note}
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="note">
				Both counted at their minimum orders with the topologies selected above, including Boctor
				stages that fall back to Tow-Thomas. {bandMethod === 'auto'
					? `Auto uses the one with fewer op-amps${methodRows.every((r) => r.available) && methodRows[0].opamps === methodRows[1].opamps ? ', and a tie keeps ' + methodShort('cascade') : ''}.`
					: 'The Method menu above picks one outright.'}
				The transformation trades op-amps for Q: its stages get sharper as the band narrows.
			</p>
		{/snippet}
		{#if transformed}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Order</h2>
					<span class="hint">{orderBand !== null && !orderBandTooHigh ? `order ${2 * orderBand}: ${orderBand} second-order stage${orderBand === 1 ? '' : 's'} (prototype n = ${orderBand})` : ''}</span>
				</div>

				{@render methodTable()}

				<h3 class="subhead">
					Low-pass prototype <span class="edges">f0 = {bandEdges ? formatHz(bandEdges.f0) : '-'}, B = {bandEdges ? formatHz(bandEdges.B) : '-'}, Amax = {amaxBand} dB, Amin = {aminBandText}</span>
				</h3>
				{#if bandEdges}
					<Equation tex={`f_0 = \\sqrt{f_l f_h} = \\sqrt{${fl} \\cdot ${fh}} = ${bandEdges.f0.toFixed(1)}\\ \\text{Hz}, \\qquad B = f_h - f_l = ${fh - fl}\\ \\text{Hz}`} />
				{/if}
				{#if orderInfoBand}
					<Equation tex={omegaTex} />
					{#if orderTex}<Equation tex={orderTex} />{/if}
				{/if}
				{#if designTransformedMin}
					<MathPanel summary="Show where this order comes from" blocks={explainTransformedOrder(design ?? designTransformedMin)} />
				{/if}

				{#if !bandResponse}
					<p class="flag bad">The transformation takes one response for the whole band: give both sides the same one.</p>
				{:else if orderBandTooHigh}
					<p class="flag bad">{tooHighText(orderInfoBand, bandResponse, 'the edges')}</p>
				{:else if orderBand !== null}
					<div class="field order-field">
						<label for="orderBand">
							Filter order used
							<span class="value">{2 * orderBand} (prototype n = {orderBand}{orderBand === minOrderBand ? ', minimum' : ''})</span>
						</label>
						<input
							id="orderBand"
							type="range"
							min={minOrderBand}
							max={MAX_ORDER}
							step="1"
							value={orderBand}
							oninput={(e) => (orderOverrideBand = Number(e.currentTarget.value))}
						/>
					</div>
					<p class="note">
						{#if filterType === 'bandstop'}
							Each pole pair of the prototype becomes two notch stages, one with its poles below f0 and
							one above, and the real pole of an odd order one notch at f0: {orderBand} notch stage{orderBand === 1 ? '' : 's'}
							in series, a band-stop of order {2 * orderBand} with no summing amplifier. Each stage
							passes DC at gain 1, so the cascade does too.
						{:else}
							Each pole pair of the prototype becomes two stages, one below f0 and one above, and the
							real pole of an odd order one stage at f0: {orderBand} stage{orderBand === 1 ? '' : 's'} in
							series, a band-pass of order {2 * orderBand}. Each stage is held at gain 1 at f0, so the
							cascade needs no extra gain stage.
						{/if}
					</p>
				{/if}
			</section>
		{:else if isBandType}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Order</h2>
					<span class="hint">n = {orderLp} + {orderHp}</span>
				</div>

				{@render methodTable()}

				{#if filterType === 'bandstop'}
					<h3 class="subhead">Low-pass branch <span class="edges">fl = {fl} Hz, fsl = {fsl} Hz, Amax = {amaxDbLp} dB, Amin = {aminSideLp} dB</span></h3>
					<Equation tex={`k = \\dfrac{f_l}{f_{sl}} = \\dfrac{${fl}}{${fsl}} = ${kLp.toFixed(4)}`} />
				{:else}
					<h3 class="subhead">High-pass side <span class="edges">fl = {fl} Hz, fsl = {fsl} Hz, Amax = {amaxDbHp} dB, Amin = {aminSideHp} dB</span></h3>
					<Equation tex={`k = \\dfrac{f_{sl}}{f_l} = \\dfrac{${fsl}}{${fl}} = ${kHp.toFixed(4)}`} />
				{/if}
				{#if filterType === 'bandstop'}
					<Equation tex={orderSummaryTex({ response: responseLp, minOrder: minOrderLp, tried: orderInfoLp?.tried, aminDb: aminSideLp })} />
				{:else}
					<Equation tex={orderSummaryTex({ response: responseHp, minOrder: minOrderHp, tried: orderInfoHp?.tried, aminDb: aminSideHp })} />
				{/if}
				<MathPanel
					summary="Show where this order comes from"
					blocks={filterType === 'bandstop'
						? explainOrder({ response: responseLp, amaxDb: amaxDbLp, aminDb: aminSideLp, k: kLp, minOrder: minOrderLp, filterType: 'lowpass', tried: orderInfoLp?.tried })
						: explainOrder({ response: responseHp, amaxDb: amaxDbHp, aminDb: aminSideHp, k: kHp, minOrder: minOrderHp, filterType: 'highpass', tried: orderInfoHp?.tried })}
				/>

				{#if filterType === 'bandstop' ? orderLpTooHigh : orderHpTooHigh}
					<p class="flag bad">
						{filterType === 'bandstop' ? tooHighText(orderInfoLp, responseLp, 'the fl/fsl edges', "this branch's ") : tooHighText(orderInfoHp, responseHp, 'the fl/fsl edges', "this side's ")}
					</p>
				{:else}
					<div class="field order-field">
						<label for={filterType === 'bandstop' ? 'orderLp' : 'orderHp'}>
							Order used
							<span class="value">
								{filterType === 'bandstop' ? orderLp : orderHp}
								{(filterType === 'bandstop' ? orderLp === minOrderLpCeil : orderHp === minOrderHpCeil)
									? '(minimum)'
									: ''}
							</span>
						</label>
						{#if filterType === 'bandstop'}
							<input
								id="orderLp"
								type="range"
								min={minOrderLpCeil}
								max={MAX_ORDER}
								step="1"
								value={orderLp}
								oninput={(e) => (orderOverrideLp = Number(e.currentTarget.value))}
							/>
						{:else}
							<input
								id="orderHp"
								type="range"
								min={minOrderHpCeil}
								max={MAX_ORDER}
								step="1"
								value={orderHp}
								oninput={(e) => (orderOverrideHp = Number(e.currentTarget.value))}
							/>
						{/if}
					</div>
				{/if}

				{#if filterType === 'bandstop'}
					<h3 class="subhead">High-pass branch <span class="edges">fh = {fh} Hz, fsh = {fsh} Hz, Amax = {amaxDbHp} dB, Amin = {aminSideHp} dB</span></h3>
					<Equation tex={`k = \\dfrac{f_{sh}}{f_h} = \\dfrac{${fsh}}{${fh}} = ${kHp.toFixed(4)}`} />
				{:else}
					<h3 class="subhead">Low-pass side <span class="edges">fh = {fh} Hz, fsh = {fsh} Hz, Amax = {amaxDbLp} dB, Amin = {aminSideLp} dB</span></h3>
					<Equation tex={`k = \\dfrac{f_h}{f_{sh}} = \\dfrac{${fh}}{${fsh}} = ${kLp.toFixed(4)}`} />
				{/if}
				{#if filterType === 'bandstop'}
					<Equation tex={orderSummaryTex({ response: responseHp, minOrder: minOrderHp, tried: orderInfoHp?.tried, aminDb: aminSideHp })} />
				{:else}
					<Equation tex={orderSummaryTex({ response: responseLp, minOrder: minOrderLp, tried: orderInfoLp?.tried, aminDb: aminSideLp })} />
				{/if}
				<MathPanel
					summary="Show where this order comes from"
					blocks={filterType === 'bandstop'
						? explainOrder({ response: responseHp, amaxDb: amaxDbHp, aminDb: aminSideHp, k: kHp, minOrder: minOrderHp, filterType: 'highpass', tried: orderInfoHp?.tried })
						: explainOrder({ response: responseLp, amaxDb: amaxDbLp, aminDb: aminSideLp, k: kLp, minOrder: minOrderLp, filterType: 'lowpass', tried: orderInfoLp?.tried })}
				/>

				{#if filterType === 'bandstop' ? orderHpTooHigh : orderLpTooHigh}
					<p class="flag bad">
						{filterType === 'bandstop' ? tooHighText(orderInfoHp, responseHp, 'the fh/fsh edges', "this branch's ") : tooHighText(orderInfoLp, responseLp, 'the fh/fsh edges', "this side's ")}
					</p>
				{:else}
					<div class="field order-field">
						<label for={filterType === 'bandstop' ? 'orderHp' : 'orderLp'}>
							Order used
							<span class="value">
								{filterType === 'bandstop' ? orderHp : orderLp}
								{(filterType === 'bandstop' ? orderHp === minOrderHpCeil : orderLp === minOrderLpCeil)
									? '(minimum)'
									: ''}
							</span>
						</label>
						{#if filterType === 'bandstop'}
							<input
								id="orderHp"
								type="range"
								min={minOrderHpCeil}
								max={MAX_ORDER}
								step="1"
								value={orderHp}
								oninput={(e) => (orderOverrideHp = Number(e.currentTarget.value))}
							/>
						{:else}
							<input
								id="orderLp"
								type="range"
								min={minOrderLpCeil}
								max={MAX_ORDER}
								step="1"
								value={orderLp}
								oninput={(e) => (orderOverrideLp = Number(e.currentTarget.value))}
							/>
						{/if}
					</div>
				{/if}

				{#if !orderHpTooHigh && !orderLpTooHigh}
					<p class="note">
						{#if filterType === 'bandstop'}
							{orderLp} low-pass stage{orderLp === 1 ? '' : 's'} summed with {orderHp} high-pass
							stage{orderHp === 1 ? '' : 's'} - {orderLp + orderHp} filtering stages total, plus
							the summing amplifier. The ideal branches are normalized to unity passband gain, so the sum meets both
							halves of the spec with a predictable notch depth.
						{:else}
							{orderHp} high-pass stage{orderHp === 1 ? '' : 's'} cascaded with {orderLp} low-pass
							stage{orderLp === 1 ? '' : 's'} - {orderHp + orderLp} stages total. Each stage is its
							own normalized block, so the ideal product meets both halves of the spec with no extra gain
							stage needed.
						{/if}
					</p>
				{/if}
			</section>
		{:else}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Order</h2>
					<span class="hint">n = {order}</span>
				</div>

				{#if filterType === 'highpass'}
					<Equation tex={`k = \\dfrac{f_s}{f_p} = \\dfrac{${fs}}{${fp}} = ${k.toFixed(4)}`} />
				{:else}
					<Equation tex={`k = \\dfrac{f_p}{f_s} = \\dfrac{${fp}}{${fs}} = ${k.toFixed(4)}`} />
				{/if}

				<Equation tex={orderSummaryTex({ response, minOrder, tried: orderInfo?.tried, aminDb })} />

				<MathPanel
					summary="Show where this order comes from"
					blocks={explainOrder({ response, amaxDb, aminDb, k, minOrder, filterType, tried: orderInfo?.tried })}
				/>

				{#if orderTooHigh}
					<p class="flag bad">{tooHighText(orderInfo, response, 'the edges')}</p>
				{:else}
					<div class="field order-field">
						<label for="order">
							Order used
							<span class="value">{order} {order === minOrderCeil ? '(minimum)' : ''}</span>
						</label>
						<input
							id="order"
							type="range"
							min={minOrderCeil}
							max={MAX_ORDER}
							step="1"
							value={order}
							oninput={(e) => (orderOverride = Number(e.currentTarget.value))}
						/>
					</div>
					<p class="note">
						{Math.floor(order / 2)} second-order stage{Math.floor(order / 2) === 1 ? '' : 's'}{order %
						2 ===
						1
							? ' plus one first-order stage'
							: ''}, cascaded. The ideal response is normalized to unity passband gain, so the
						product of the stages meets the spec with no extra gain stage needed.
					</p>
				{/if}
			</section>
		{/if}

		{#if design}
			<section class="panel">
				<div class="panel-head">
					<span class="num">03</span>
					<h2>Stages</h2>
					<span class="hint">
						{#if transformed}
							f0 = {formatHz(design.f0)}, B = {formatHz(design.B)}, f0/B = {(design.f0 / design.B).toFixed(3)}
						{:else if filterType === 'bandpass'}
							ωc,hp = {(design.hp.wc / 1000).toFixed(1)}k, ωc,lp = {(design.lp.wc / 1000).toFixed(1)}k rad/s
						{:else if filterType === 'bandstop'}
							ωc,lp = {(design.lp.wc / 1000).toFixed(1)}k, ωc,hp = {(design.hp.wc / 1000).toFixed(1)}k rad/s
						{:else}
							ωc = {(design.wc / 1000).toFixed(1)}k rad/s
						{/if}
					</span>
				</div>

				{#if transformed && filterType === 'bandpass'}
					{#if hasZeros}
						<!-- with zeros the pole pairs become notch stages, and only the real pole a band-pass stage -->
						<p class="note">
							Every stage below comes from one low-pass prototype of order {design.n} with its passband
							edge at B. The substitution maps that edge onto both fl and fh. Each pole pair of the
							prototype splits into two notch stages whose f0 multiply to f0², with the same Q, and its
							zero splits into one above f0 and one below. The real pole of an odd order, at -p in units
							of B, lands at f0 as a band-pass stage with Q = f0 / (p·B). Each stage has its gain set so
							that it passes f0 at gain 1: K∞ far above the zero of a notch stage{design.stages.some((s) => s.filterType === 'bandpass') ? ', K at the centre of the band-pass stage' : ''}.
						</p>
					{:else}
						<p class="note">
							Every stage below comes from one low-pass prototype of order {design.n} with its passband
							edge at B. The substitution maps that edge onto both fl and fh: each pole pair of the
							prototype splits into two band-pass stages whose f0 multiply to f0², with the same Q, and
							the real pole of an odd order, at -p in units of B, lands at f0 with Q = f0 / (p·B). Each band-pass stage has
							its gain K set so that it passes f0 at gain 1:
						</p>
					{/if}
					<Equation
						tex={!hasZeros || design.stages.some((s) => s.filterType === 'bandpass')
							? `s_{lp} = \\dfrac{s^2 + \\omega_0^2}{s}, \\qquad H(s) = K\\,\\dfrac{\\frac{\\omega_n}{Q}s}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}, \\qquad K = \\sqrt{1 + Q^2\\left(\\dfrac{\\omega_n}{\\omega_0} - \\dfrac{\\omega_0}{\\omega_n}\\right)^2}`
							: `s_{lp} = \\dfrac{s^2 + \\omega_0^2}{s}`}
					/>
				{:else if transformed}
					<p class="note">
						Every stage below comes from one low-pass prototype of order {design.n} with its passband
						edge at B. The substitution maps that edge onto both fl and fh and the prototype's
						stopband onto the gap between them: each pole pair splits into two notch stages whose f0
						multiply to f0², with the same Q, and the real pole of an odd order becomes a notch at f0.
						Every stage passes DC at gain 1, so no summing amplifier is needed:
					</p>
					<Equation tex={`s_{lp} = \\dfrac{(2\\pi B)^2\\, s}{s^2 + \\omega_0^2}, \\qquad \\omega_0 = 2\\pi f_0`} />
				{:else if filterType === 'bandpass'}
					<p class="note">
						Each stage below is denormalized from whichever half of the spec it belongs to: the
						first {design.hp.stages.length} come from the high-pass side (s → s/ωc,hp), the rest
						from the low-pass side (s → s/ωc,lp). Every stage is still just an ordinary low-pass
						or high-pass second-order block - cascading the two halves is what makes the overall
						response a band-pass:
					</p>
					<Equation
						tex={`H_{hp}(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}, \\qquad H_{lp}(s) = \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`}
					/>
				{:else if filterType === 'bandstop'}
					<p class="note">
						Each stage below is denormalized from whichever branch it belongs to: the first
						{design.lp.stages.length} come from the low-pass branch (s → s/ωc,lp), the rest from
						the high-pass branch (s → s/ωc,hp). Every stage is still just an ordinary low-pass or
						high-pass second-order block - it is the summing amplifier at the end of section 04
						that turns the two branches into a band-stop:
					</p>
					<Equation
						tex={`H_{lp}(s) = \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}, \\qquad H_{hp}(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`}
					/>
				{:else if filterType === 'highpass'}
					<p class="note">
						Denormalized with s → s/ωc (high-pass; ωc = 2π·fp·ε^(+1/n) for Butterworth, 2π·fp for the other responses, derived below). Each row is
						one realizable second-order block:
					</p>
					<Equation tex={`H(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
				{:else}
					<p class="note">
						Denormalized with s → s/ωc (low-pass; ωc = 2π·fp·ε^(-1/n) for Butterworth, 2π·fp for the other responses, derived below). Each row is one realizable
						second-order block:
					</p>
					<Equation tex={`H(s) = \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
				{/if}
				{#if hasZeros}
					<p class="note">
						{#if transformed && filterType === 'bandstop'}
							Each row is a notch stage: the ideal numerator blocks fz completely, and K holds the
							stage at gain 1 at DC, whichever side of f0 its poles sit on.
						{:else if transformed}
							A row with a zero fz is a notch stage: the ideal numerator blocks fz completely, and K
							is set so that the stage passes f0 at gain 1, like the band-pass stages.
						{:else}
							A row with a zero fz is a notch stage: the ideal numerator blocks fz completely, with
							gain 1 at DC on a low-pass side and far above the zero on a high-pass side.
						{/if}
					</p>
					<Equation tex={`H(s) = K\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}, \\qquad \\omega_z = 2\\pi f_z`} />
				{/if}

				<MathPanel
					summary="Show where the response formula and the poles come from"
					blocks={transformed
						? [
								{ type: 'p', text: 'Low-pass prototype', cls: 'stageHead' },
								// a lowered order's Amin is the floor it reaches, printed to 0.01 dB (as in basics.js)
								...explainApproximation({ ...design.lowpass, aminDb: Math.floor(design.lowpass.aminDb * 100 + 1e-9) / 100 }),
								{ type: 'p', text: `From the prototype to the ${filterType === 'bandstop' ? 'band-stop' : 'band-pass'}`, cls: 'stageHead' },
								...explainBandTransform(design)
							]
						: isBandType
						? [
								{ type: 'p', text: filterType === 'bandstop' ? 'Low-pass branch' : 'High-pass side', cls: 'stageHead' },
								...explainApproximation(filterType === 'bandstop' ? design.lp : design.hp),
								{ type: 'p', text: filterType === 'bandstop' ? 'High-pass branch' : 'Low-pass side', cls: 'stageHead' },
								...explainApproximation(filterType === 'bandstop' ? design.hp : design.lp)
							]
						: explainApproximation(design)}
				/>

				<div class="tableScroll">
					<table>
						<thead>
							<tr>
								<th>Stage</th>
								<th>f0 = ωn/2π</th>
								<th>Q</th>
								{#if hasZeros}<th>fz (zero)</th>{/if}
								{#if transformed}<th>From the prototype</th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each design.stages as stage, i (i)}
								<tr>
									<td>
										{i + 1}{stage.order === 1 ? ' (1st order)' : ''}{transformed
											? ` (${roleLabel(stage)})`
											: isBandType
												? stage.filterType === 'highpass'
													? ' (HP side)'
													: ' (LP side)'
												: ''}
									</td>
									<td>{stage.order === 1 ? '-' : formatHz(stage.wn / (2 * Math.PI))}</td>
									<td>{stage.order === 1 ? '-' : stage.q.toFixed(4)}</td>
									{#if hasZeros}<td>{Number.isFinite(stage.wz) ? formatHz(stage.wz / (2 * Math.PI)) : '-'}</td>{/if}
									{#if transformed}<td>{design.lowpass.stages[stage.pole]?.order === 1 ? 'real pole' : `pole pair ${stage.pole + 1}`}</td>{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<MathPanel
					summary="Show the math for every stage"
					blocks={design.stages.flatMap((s, i) => [
						{ type: 'p', text: `Stage ${i + 1}${s.order === 1 ? ' (first order)' : ''}`, cls: 'stageHead' },
						...explainStageFor(design, i)
					])}
				/>
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">04</span>
					<h2>Components</h2>
					<span class="hint">
						{transformed
							? transformedHint
							: isBandType && topologyHp !== topologyLp
							? `${TOPOLOGY_WORD[topologyHp]} high-pass, ${TOPOLOGY_WORD[topologyLp]} low-pass`
							: TOPOLOGY_WORD[isBandType ? topologyLp : topology]}{filterType === 'highpass'
							? ', high-pass'
							: filterType === 'bandpass'
								? ', band-pass'
								: filterType === 'bandstop'
									? ', band-stop'
									: ''}
					</span>
				</div>

				<StockPicker id="stock" bind:stock bind:resistorText bind:capacitorText bind:pairs bind:pairLimit />

				{#if restrictedStock}
					<p class="note">
						The search now rounds {stock === 'labR' ? 'every resistor to the lab resistors, the capacitors staying on the usual series,' : 'to those values only,'} so the f0 and Q error columns below grow{componentOpts.pairs ? ', less so with two in series' : ''}.
						Everything downstream is computed from the rounded values, so the Bode plot and the
						spec check at the end already show whether the result still meets the spec.
					</p>
				{/if}
				{#if pairPlan && realizedStages.length}
					<!-- the cap on pairs: how many where they help would take, and which the limit keeps -->
					<p class="note">{filterPairPlanSummary(pairPlan)}</p>
				{/if}

				{#if shortfallStages.length > 0}
					<p class="flag warn">
						Stage{shortfallStages.length > 1 ? 's' : ''}
						{shortfallStages.join(', ')}
						cannot be built from those values at all, so {shortfallStages.length > 1 ? 'they are' : 'it is'}
						shown with the full E24 and E6 grids instead. Add values, or lower the order or the Q.
					</p>
				{/if}
				{#if limitShortStages.length > 0}
					<p class="flag warn">
						Stage{limitShortStages.length > 1 ? 's' : ''}
						{limitShortStages.join(', ')}
						cannot be built from those values with at most {pairPlan.limit} {pairPlan.limit === 1 ? 'pair' : 'pairs'}, so {limitShortStages.length > 1 ? 'they are' : 'it is'}
						shown with the full E24 and E6 grids instead. Allow more pairs, or add values.
					</p>
				{/if}

				{#if usesTopology('sallenKey')}
					<p class="flag warn">
						{#if isBandType}
							Sallen-Key needs a component ratio of 4·Q² on each of its stages: {topologyHp === 'sallenKey' && topologyLp === 'sallenKey'
								? 'a capacitor ratio on the low-pass side, a resistor ratio on the high-pass side'
								: topologyHp === 'sallenKey'
									? 'a resistor ratio, on the high-pass side'
									: 'a capacitor ratio, on the low-pass side'}. Either way, component
							tolerance barely moves Q for this topology (S^Q ≈ 0 at the equal-R or equal-C design
							point) - the real limit is the ratio itself getting impractically large. Past a Q of
							about 5 this gets impractical. MFB is the safer default for higher orders.
						{:else if filterType === 'highpass'}
							Sallen-Key high-pass needs a resistor ratio of 4·Q² between R_top and R_bottom.
							Component tolerance barely moves Q for this topology (S_R^Q ≈ 0 at the equal-C
							design point) - the real limit is the ratio itself getting impractically large.
							Past a Q of about 5 this gets impractical. MFB is the safer default for higher
							orders.
						{:else}
							Sallen-Key needs a capacitor ratio of 4·Q² between its two capacitors. Component
							tolerance barely moves Q for this topology (S_R^Q ≈ 0 at the equal-R design point)
							- the real limit is the ratio itself getting impractically large. Past a Q of about
							5 this gets impractical. MFB is the safer default for higher orders.
						{/if}
					</p>
				{/if}
				{#if usesTopology('towThomas')}
					<p class="note">
						Tow-Thomas: three op-amps per second-order stage (a damped integrator, an integrator and an
						inverter in a loop). f0, Q and gain are each set by one part, any Q is buildable with equal
						capacitors (Rd = Q R), and the sensitivities are fixed at 1/2 or 1. The cost is the extra
						op-amps and their bandwidth: the loop raises the realized Q to Q / (1 - 4 Q f0 / f_T), so the
						op-amp gain-bandwidth should be at least 400 times Q times f0 for a 1 % error. See each stage's math for
						the comparison with MFB and Sallen-Key.
					</p>
				{/if}
				{#if transformed && realizedStages.some((s) => s.topology === 'towThomasNotch')}
					<p class="note">
						The Tow-Thomas notch stages are the Tow-Thomas high-pass (input capacitor Cin into A1) plus
						a resistor Rz from the input into A2, which together put a pair of zeros exactly at fz.
						{filterType === 'bandstop'
							? 'Each holds DC at gain 1: Cin is rounded to a stocked capacitor and Rz solved against it, so the zero stays put and the rounding shows as a small level error.'
							: 'Cin sets the gain far above the zero, chosen so that the stage passes f0 at gain 1; Rz is solved against the rounded Cin, so the zero stays put and the rounding shows as a small level error at f0.'}
					</p>
				{:else if hasZeros && usesTopology('towThomas') && !transformed}
					<p class="note">
						The stages with a zero are Tow-Thomas notch stages: the Tow-Thomas high-pass (input
						capacitor Cin into A1) plus a resistor Rz from the input into A2, which together put a pair
						of zeros exactly at fz. On a low-pass side Cin is rounded to a stocked capacitor and Rz
						solved against it, so the zero stays put and the rounding shows as a small DC gain error.
					</p>
				{/if}

				{#each realizedStages as stageDesign, i (i)}
					{@const sens = sensitivityFor(stageDesign)}
					<div class="stage-block">
						<h3>
							Stage {i + 1} ·{transformed
								? ` ${roleLabel(design.stages[i])},`
								: isBandType
									? ` ${design.stages[i].filterType === 'highpass' ? 'high-pass' : 'low-pass'} ${filterType === 'bandstop' ? 'branch' : 'side'},`
									: ''}
							{CIRCUIT_WORD[stageDesign.topology] ?? stageDesign.topology}
						</h3>
						<div class="stage-grid">
							<div>
								<table>
									<thead>
										<tr>
											<th>Component</th>
											<th>Value</th>
										</tr>
									</thead>
									<tbody>
										{#each Object.entries(stageDesign.components) as [name, value] (name)}
											<tr>
												<td>{name}</td>
												<!-- a pair reads 64.2 kΩ (56.0 kΩ + 8.20 kΩ); a stage that fell back to E24 has none -->
												<td>{name.startsWith('R') || name.startsWith('r') ? pairLabel(value, componentOpts.resistorSeries, formatOhms, componentOpts.pairs && !stageDesign.stockShortfall) : formatFarads(value)}</td>
											</tr>
										{/each}
									</tbody>
								</table>

								{#if stageDesign.topology !== 'firstOrder' && stageDesign.topology !== 'firstOrderHp'}
									<table class="actual">
										<tbody>
											<tr>
												<th>f0 actual</th>
												<td>
													{formatHz(stageDesign.actual.wn / (2 * Math.PI))}
													<span class="err"
														>({formatPercent(
															relativeErrorPercent(
																stageDesign.actual.wn,
																design.stages[i].wn
															)
														)})</span
													>
												</td>
											</tr>
											<tr>
												<th>Q actual</th>
												<td>
													{stageDesign.actual.q.toFixed(4)}
													<span class="err"
														>({formatPercent(
															relativeErrorPercent(stageDesign.actual.q, design.stages[i].q)
														)})</span
													>
												</td>
											</tr>
											{#if stageDesign.topology === 'sallenKey'}
												<tr>
													<th>Cap ratio needed</th>
													<td>{capRatio(design.stages[i].q).toFixed(1)}:1</td>
												</tr>
											{:else if stageDesign.topology === 'sallenKeyHp'}
												<tr>
													<th>Resistor ratio needed</th>
													<td>{capRatioHp(design.stages[i].q).toFixed(1)}:1</td>
												</tr>
											{:else if ['towThomasNotch', 'boctor', 'boctorHp'].includes(stageDesign.topology)}
												<tr>
													<th>fz actual</th>
													<td>
														{formatHz(stageDesign.actual.wz / (2 * Math.PI))}
														<span class="err">({formatPercent(relativeErrorPercent(stageDesign.actual.wz, design.stages[i].wz))})</span>
													</td>
												</tr>
												<tr>
													<th>{stageDesign.lowSide ? 'DC gain' : 'Gain above fz'}</th>
													<td>
														{(stageDesign.lowSide ? stageDesign.actual.dcGain : stageDesign.actual.gain).toFixed(3)}
														<span class="err">({(20 * Math.log10(Math.abs(stageDesign.lowSide ? stageDesign.actual.dcGain : stageDesign.actual.gain))).toFixed(2)} dB)</span>
													</td>
												</tr>
											{:else if stageDesign.topology === 'mfbBp' || stageDesign.topology === 'towThomasBp'}
												<tr>
													<th>Peak gain</th>
													<td>
														{Math.abs(stageDesign.actual.gain).toFixed(3)}
														<span class="err">({formatPercent(relativeErrorPercent(Math.abs(stageDesign.actual.gain), design.stages[i].gain))})</span>
													</td>
												</tr>
												{#if stageDesign.ideal}
													<!-- the rows above are the stage with its op-amp; the same parts alone sit higher and wider -->
													<tr>
														<th>Circuit alone</th>
														<td>
															{formatHz(stageDesign.ideal.wn / (2 * Math.PI))}, Q {stageDesign.ideal.q.toFixed(4)}, gain {Math.abs(stageDesign.ideal.gain).toFixed(3)}
															<span class="err">(ideal op-amp)</span>
														</td>
													</tr>
												{/if}
											{/if}
											{#if transformed && filterType === 'bandpass'}
												{@const atF0 = magnitudePhaseAt([stageDesign], design.f0).db}
												<!-- what the stage passes at the band's centre, which the design holds at 1 -->
												<tr>
													<th>Gain at {formatHz(design.f0)}</th>
													<td>
														{(10 ** (atF0 / 20)).toFixed(3)}
														<span class="err">({atF0 >= 0 ? '+' : ''}{atF0.toFixed(2)} dB)</span>
													</td>
												</tr>
											{/if}
										</tbody>
									</table>
									{#if stageDesign.boctorFallback}
										<p class="note">
											{stageDesign.boctorFallback === 'symmetric'
												? 'Boctor cannot build a notch whose zero sits on its own f0 (its two forms need fz above or below it), so this stage is a Tow-Thomas notch.'
												: stageDesign.boctorFallback === 'limit'
													? 'The Boctor high-pass form cannot reach this Q with the zero this far below f0 (it needs Q < 1 / (1 - (fz/f0)²)), so this stage is a Tow-Thomas notch.'
													: stageDesign.boctorFallback === 'level'
														? 'Boctor sets its own gain, and here it would move the passband by more than 1 dB or leave the zero off target, so this stage is a Tow-Thomas notch, whose gain is set to the target.'
														: 'Boctor finds no parts for this notch on the full E24 and E6 grids, so this stage is a Tow-Thomas notch.'}
										</p>
									{/if}

									{#if sens}
										<p class="note">
											1% error on any one component moves Q by roughly
											{worstCaseQError(sens, 1).toFixed(2)}% (root-sum-square across all of them).
										</p>
									{/if}
									{#each stageAlerts(stageDesign, design.stages[i]) as alert, k (k)}
										<p class="flag {alert.level}">{alert.text}</p>
									{/each}
									{#if stageDesign.topology === 'mfbBp' && Number.isFinite(stageDesign.actual.gbw)}
										<p class="note">
											Built for {mfbOpampLabel}: f0, Q and gain above are with that op-amp. Another op-amp needs another correction.
										</p>
									{/if}
								{/if}
							</div>
							<!-- a pair is drawn as its two parts, R1 56k + 8.2k; a stage that fell back to E24 has none -->
							<CircuitDiagram
								design={stageDesign}
								ohms={(v) => pairDiagramLabel(v, componentOpts.resistorSeries, formatOhms, componentOpts.pairs && !stageDesign.stockShortfall)}
							/>
							<div class="math-full cap-picker">
								<p class="note">
									{#if stageDesign.topology === 'boctor'}
										C1 can be chosen below. C2 is selected from stock and the resistors are recalculated to balance the notch.
									{:else if stageDesign.topology === 'boctorHp'}
										C sets both equal capacitors. The resistors and gain are recalculated to fit.
									{:else if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp' || stageDesign.topology === 'towThomas' || stageDesign.topology === 'towThomasHp' || stageDesign.topology === 'towThomasNotch' || stageDesign.topology === 'towThomasBp'}
										Pick a different C value if the one above does not match what is in stock; the
										resistors above are recalculated to fit.
									{:else}
										Pick different {stageDesign.topology === 'sallenKey' ? 'C_top and C_bottom' : 'C1 and C2'}
										values if the ones above do not match what is in stock; the resistors above are
										recalculated to fit.
									{/if}
								</p>
								<div class="row">
									{#if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp' || stageDesign.topology === 'towThomas' || stageDesign.topology === 'towThomasHp' || ['towThomasNotch', 'towThomasBp', 'boctor', 'boctorHp'].includes(stageDesign.topology)}
										<div class="field">
											<label for={`cap-C-${i}`}>{stageDesign.topology === 'boctor' ? 'C1' : 'C'} (nF)</label>
											<input
												id={`cap-C-${i}`}
												type="number"
												step="any"
												min="0"
												placeholder={((stageDesign.components.C ?? stageDesign.components.C1) * 1e9).toPrecision(4)}
												value={capOverrides[i]?.C ?? ''}
												oninput={(e) => setCapOverride(i, 'C', e.currentTarget.value)}
											/>
										</div>
									{:else if stageDesign.topology === 'sallenKey'}
										<div class="field">
											<label for={`cap-top-${i}`}>C_top (nF)</label>
											<input
												id={`cap-top-${i}`}
												type="number"
												step="any"
												min="0"
												placeholder={(stageDesign.components.Ctop * 1e9).toPrecision(4)}
												value={capOverrides[i]?.Ctop ?? ''}
												oninput={(e) => setCapOverride(i, 'Ctop', e.currentTarget.value)}
											/>
										</div>
										<div class="field">
											<label for={`cap-bottom-${i}`}>C_bottom (nF)</label>
											<input
												id={`cap-bottom-${i}`}
												type="number"
												step="any"
												min="0"
												placeholder={(stageDesign.components.Cbottom * 1e9).toPrecision(4)}
												value={capOverrides[i]?.Cbottom ?? ''}
												oninput={(e) => setCapOverride(i, 'Cbottom', e.currentTarget.value)}
											/>
										</div>
									{:else}
										<div class="field">
											<label for={`cap-c1-${i}`}>C1 (nF)</label>
											<input
												id={`cap-c1-${i}`}
												type="number"
												step="any"
												min="0"
												placeholder={(stageDesign.components.C1 * 1e9).toPrecision(4)}
												value={capOverrides[i]?.C1 ?? ''}
												oninput={(e) => setCapOverride(i, 'C1', e.currentTarget.value)}
											/>
										</div>
										<div class="field">
											<label for={`cap-c2-${i}`}>C2 (nF)</label>
											<input
												id={`cap-c2-${i}`}
												type="number"
												step="any"
												min="0"
												placeholder={(stageDesign.components.C2 * 1e9).toPrecision(4)}
												value={capOverrides[i]?.C2 ?? ''}
												oninput={(e) => setCapOverride(i, 'C2', e.currentTarget.value)}
											/>
										</div>
									{/if}
									{#if capOverrides[i]}
										<button type="button" class="ghost small" onclick={() => clearCapOverride(i)}>
											Use suggested
										</button>
									{/if}
								</div>
								{#if stageDesign.manualError}
									<p class="flag bad">{stageDesign.manualError}</p>
								{/if}
								{#if stageDesign.outOfRange}
									<p class="flag warn">
										The resulting resistor value falls outside a realistic 200 ohm to 2 megohm
										range for these capacitors; consider different values.
									</p>
								{/if}
							</div>
							<div class="math-full">
								<MathPanel
									summary="Show the math for this stage's components"
									blocks={explainComponentsLimited(stageDesign, i)}
								/>
							</div>
						</div>
					</div>
				{/each}

				{#if parallelSum}
					<div class="stage-block">
						<h3>{combinerMode === 'difference' ? 'Difference amplifier' : 'Summing amplifier'}</h3>
						<div class="stage-grid">
							<div>
								<table>
									<thead>
										<tr>
											<th>Component</th>
											<th>Value</th>
										</tr>
									</thead>
									<tbody>
										{#each combinerRows as row (row.name)}
											<tr>
												<td>{row.name}</td>
												<td>{formatOhms(row.value)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
								<p class="note">
									Combines the low-pass and high-pass branches above into the final band-stop
									output.
									{#if Math.abs(lpBranchGain - 1) > 1e-6}
										The low-pass branch passes DC at {lpBranchGain.toFixed(3)} (its notch stages'
										rounded Cin), so its input resistor is scaled by that factor and both passbands
										come out at the same level; the other resistors can be any equal value.
									{:else}
										Any equal resistor value works exactly - there is nothing to search or round here.
									{/if}
								</p>
							</div>
							<svg
								viewBox={combinerDiagram.viewBox}
								role="img"
								aria-label="{combinerMode} amplifier schematic"
								class="summing-svg"
							>
								{@html combinerDiagram.svg}
							</svg>
							<div class="math-full">
								<MathPanel
									summary="Show the math for the {combinerMode === 'difference' ? 'difference' : 'summing'} amplifier"
									blocks={explainSummingAmp(combinerR, {
									mode: combinerMode,
									lpSign: bandStopBranches ? branchSign(bandStopBranches[0]) : 1,
									hpSign: bandStopBranches ? branchSign(bandStopBranches[1]) : 1,
									lpOrder: bandStopBranches ? branchOrder(bandStopBranches[0]) : 2,
									hpOrder: bandStopBranches ? branchOrder(bandStopBranches[1]) : 2,
									centreHz: combiner ? combiner.centreHz : 0,
									sumDb: combiner ? combiner.sumDb : 0,
									differenceDb: combiner ? combiner.differenceDb : 0,
									lpGain: lpBranchGain,
									resistors: combinerParts?.resistors ?? null
								})}
								/>
							</div>
						</div>
					</div>
				{/if}
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">05</span>
					<h2>Bode plot</h2>
					<span class="hint">
						{#if isBandType}
							{attenuationAtFsl !== null ? `${attenuationAtFsl.toFixed(1)} dB at fsl` : ''}{attenuationAtFsh !==
							null
								? `, ${attenuationAtFsh.toFixed(1)} dB at fsh`
								: ''}
						{:else}
							{attenuationAtFs !== null ? `${attenuationAtFs.toFixed(1)} dB at fs` : ''}
						{/if}
					</span>
				</div>

				<BodePlot
					points={bodePoints}
					passbandFreqs={isBandType ? [fl, fh] : [fp]}
					stopbandFreqs={isBandType ? [fsl, fsh] : [fs]}
					amaxDb={amaxDb - passbandPeakDb}
					aminDb={aminDb - passbandPeakDb}
					limits={limitLines}
				/>
				{#if Math.abs(passbandPeakDb) > 0.05}
					<p class="note">
						The top of the passband is at {passbandPeakDb > 0 ? '+' : ''}{passbandPeakDb.toFixed(2)} dB:
						{#if transformed && realizedStages.some((s) => s.topology.startsWith('boctor'))}
							Boctor stages keep their own gain, and component rounding also shifts the passband level.
						{:else if realizedStages.some(s => s.topology === 'boctorHp')}
							Boctor high-pass sections have gain above one, and component rounding also shifts the passband level.
						{:else if transformed && !(['chebyshev', 'elliptic'].includes(design.response) && design.n % 2 === 0)}
							<!-- the ideal stages hold f0 (or DC) at the top of the passband: what is left is rounding -->
							rounding the parts of the stages moves the passband level a little.
						{:else if passbandPeakDb > 0}
							a response with passband ripple (Chebyshev, elliptic) built from stages of unity gain ripples above 0 dB
							{isBandType && !transformed ? 'where the ripples of its two sides meet' : 'when its order is even'}{hasZeros ? ', and rounding the notch components also shifts the gain' : ''}.
						{:else}
							rounding the notch components moves the passband level a little.
						{/if}
						The spec's limits are measured from that top, so the amber Amax and Amin lines and the figures below
						sit {Math.abs(passbandPeakDb).toFixed(2)} dB {passbandPeakDb > 0 ? 'higher' : 'lower'} than they would from 0 dB.
					</p>
				{/if}
				{#if passbandLevelDb !== null && Math.abs(passbandLevelDb) > PASSBAND_LEVEL_DB}
					<p class="note">
						The gain {filterType === 'bandstop' ? 'at DC' : `at f0 = ${formatHz(design.f0)}`} is {passbandLevelDb > 0 ? '+' : ''}{passbandLevelDb.toFixed(2)} dB,
						where the ideal design gives 0 dB: {realizedStages.some((s) => s.topology.startsWith('boctor'))
							? 'the Boctor stages keep their own gain, which this circuit cannot set, and the rounded parts move it too'
							: 'the rounded parts move it'}. It is a shift of the whole passband: the limits are measured from its top.
					</p>
				{/if}
				<div class="legend">
					<span><i class="line blue"></i>simulated response (rounded components{correctedStages ? `, the MFB band-pass stages with the ${formatHz(mfbGbw)} op-amp model` : ''})</span>
					<span
						><i class="line amber"></i>Amax / Amin / {isBandType
							? 'fl / fh / fsl / fsh'
							: 'fp / fs'} targets</span
					>
				</div>

				{#if isBandType}
					{#if attenuationAtFsl !== null && attenuationAtFsh !== null}
						{#if attenuationAtFsl >= aminAtFsl && attenuationAtFsh >= aminAtFsh && stopbandHolds}
							<p class="flag ok">
								Meets the spec: {attenuationAtFsl.toFixed(1)} dB at fsl and {attenuationAtFsh.toFixed(1)} dB at fsh{stopbandDipsInside
									? aminAtFsl === aminAtFsh
										? `, and at least ${stopbandWorst.db.toFixed(1)} dB anywhere in the stopband (the least at ${formatHz(stopbandWorst.freq)}, between two zeros)`
										: `, and ${stopbandWorst.db.toFixed(1)} dB at ${formatHz(stopbandWorst.freq)}, between two zeros, where ${Number(stopbandWorst.required.toFixed(1))} dB is required`
									: ''}, {aminAtFsl === aminAtFsh
									? `at least ${aminAtFsl} dB required${filterType === 'bandstop' ? ' across the stopband' : ' on both sides'}`
									: `at least ${aminAtFsl} dB required below fsl and ${aminAtFsh} dB above fsh`}.
							</p>
						{:else if attenuationAtFsl >= aminAtFsl && attenuationAtFsh >= aminAtFsh}
							<p class="flag bad">
								Both stopband edges hold ({attenuationAtFsl.toFixed(1)} dB at fsl, {attenuationAtFsh.toFixed(1)} dB at fsh),
								but between two zeros the loss comes back up to only {stopbandWorst.db.toFixed(1)} dB at
								{formatHz(stopbandWorst.freq)}, under the {Number(stopbandWorst.required.toFixed(1))} dB required there. The rounded parts moved a zero or a
								pole: try a higher order or the E96 series.
							</p>
						{:else}
							<p class="flag bad">
								Falls short after rounding: {attenuationAtFsl.toFixed(1)} dB at fsl, {attenuationAtFsh.toFixed(1)} dB at fsh,
								{aminAtFsl === aminAtFsh ? `${aminAtFsl} dB required on both` : `${aminAtFsl} dB required at fsl and ${aminAtFsh} dB at fsh`}. Try a higher
								{transformed ? 'prototype order' : `order on whichever ${sideWord} is short`}, or a tighter resistor series.
							</p>
						{/if}
					{/if}
				{:else if attenuationAtFs !== null}
					{#if attenuationAtFs >= aminDb && stopbandHolds}
						<p class="flag ok">
							Meets the spec: {attenuationAtFs.toFixed(1)} dB of attenuation at fs{stopbandDipsInside
								? `, and at least ${stopbandWorst.db.toFixed(1)} dB anywhere past it (the least at ${formatHz(stopbandWorst.freq)}, between two zeros)`
								: ''}, at least {aminDb} dB required.
						</p>
					{:else if attenuationAtFs >= aminDb}
						<p class="flag bad">
							At fs the loss is {attenuationAtFs.toFixed(1)} dB, but between two zeros further on it comes
							back up to only {stopbandWorst.db.toFixed(1)} dB at {formatHz(stopbandWorst.freq)}, under
							Amin = {aminDb} dB. The rounded parts moved a zero or a pole: try a higher order or the E96
							series.
						</p>
					{:else}
						<p class="flag bad">
							Falls short after rounding: only {attenuationAtFs.toFixed(1)} dB at fs, {aminDb} dB
							required. Try a higher order or a tighter resistor series.
						</p>
					{/if}
				{/if}

					{#if isBandType}
						{#if attenuationAtFl !== null && attenuationAtFh !== null}
							{#if attenuationAtFl <= amaxAtFl + PASSBAND_SLACK_DB && attenuationAtFh <= amaxAtFh + PASSBAND_SLACK_DB}
								<p class="flag ok">
									Passband edges: {attenuationAtFl.toFixed(2)} dB at fl and {attenuationAtFh.toFixed(2)}
									dB at fh, {amaxAtFl === amaxAtFh ? `at most ${amaxAtFl} dB allowed` : `at most ${amaxAtFl} dB allowed at fl and ${amaxAtFh} dB at fh`}.
								</p>
							{:else if attenuationAtFl <= amaxAtFl + PASSBAND_ROUNDING_DB && attenuationAtFh <= amaxAtFh + PASSBAND_ROUNDING_DB}
								<p class="flag warn">
									Passband edges with rounded parts: {attenuationAtFl.toFixed(2)} dB at fl and
									{attenuationAtFh.toFixed(2)} dB at fh, against Amax = {amaxBandText}. The ideal design
									sits exactly at Amax; the excess is the rounding to {stockPhrase}, smaller than the
									shift the parts' own tolerance produces on a real board.
								</p>
							{:else if restrictedStock}
								<p class="flag warn">
									Passband edges: {attenuationAtFl.toFixed(2)} dB at fl, {attenuationAtFh.toFixed(2)}
									dB at fh, against Amax = {amaxBandText}. More than rounding explains, and the limited
									value list is the likely reason: the search had nothing closer to pick. Add values,
									{componentOpts.pairs ? '' : 'try two resistors in series, '}loosen Amax, or accept the wider passband if the stopband still holds above.
								</p>
							{:else}
								<p class="flag bad">
									Passband edges miss: {attenuationAtFl.toFixed(2)} dB at fl, {attenuationAtFh.toFixed(2)}
									dB at fh, against Amax = {amaxBandText}. That is more than rounding explains: {missCause}.
								</p>
							{/if}
						{/if}
					{:else if attenuationAtFp !== null}
						{#if attenuationAtFp <= amaxDb + PASSBAND_SLACK_DB}
							<p class="flag ok">
								Passband edge: {attenuationAtFp.toFixed(2)} dB at fp, at most {amaxDb} dB allowed.
							</p>
						{:else if attenuationAtFp <= amaxDb + PASSBAND_ROUNDING_DB}
							<p class="flag warn">
								Passband edge with rounded parts: {attenuationAtFp.toFixed(2)} dB at fp, against Amax =
								{amaxDb} dB. The ideal design sits exactly at Amax; the excess is the rounding to
								{stockPhrase}, smaller than the shift the parts' own tolerance produces on a real board.
							</p>
						{:else if restrictedStock}
							<p class="flag warn">
								Passband edge: {attenuationAtFp.toFixed(2)} dB at fp, against Amax = {amaxDb} dB.
								More than rounding explains, and the limited value list is the likely reason: the
								search had nothing closer to pick. Add values, {componentOpts.pairs ? '' : 'try two resistors in series, '}loosen
								Amax, or accept the wider passband if the stopband above still holds.
							</p>
						{:else}
							<p class="flag bad">
								Passband edge misses: {attenuationAtFp.toFixed(2)} dB at fp, against Amax = {amaxDb}
								dB. That is more than rounding explains: {missCause}.
							</p>
						{/if}
					{/if}
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">06</span>
					<h2>Download</h2>
				</div>

				<p class="note">
					A standalone JavaScript file with this exact design: the same order, pole-placement,
					denormalization and component-search code as this page, parameterized at the top so it
					can be edited and rerun with <code>node filter-design.js</code>. It also prints the same
					report shown above, plus notes on simulating, building and testing the result.
				</p>

				<OpampPicker id="spiceOpamp" label="Op-amp in the LTspice file" bind:value={spiceOpamp} />

				<div class="row downloads">
					<button type="button" onclick={downloadScript}>Download filter-design.js</button>
					<button type="button" onclick={downloadSchematic}>Download filter-design.asc (LTspice)</button>
				</div>

				<p class="note">
					An LTspice schematic with the same component values as the tables above and the AC
					analysis already set up: open it, press Run, plot V(vout). Each stage is drawn wire by
					wire, the way a textbook draws it.
					{#if OPAMP_MODELS[spiceOpamp]?.real}
						Each op-amp is the {spiceOpamp} with its supply pins showing, on +15 V and -15 V rails
						(the two sources under the drawing, nets v++ and v--); its model is written into the
						file, so it runs with no library to install. The simulation shows what the part does to
						the response, which {correctedStages ? "the page's single-pole model only approximates" : 'the ideal maths on this page cannot'}.
					{:else if correctedStages}
						Each op-amp is LTspice's ideal single-pole model with its gain-bandwidth as an editable
						attribute, set to {ltspiceGbw(mfbGbw)}, the op-amp the MFB band-pass stages are built
						for, so {allCorrected
							? 'the run gives the response above.'
							: 'the run gives those stages as above. The other stages are designed for an ideal op-amp, and the run also shows what this one does to them.'}
					{:else}
						Each op-amp is LTspice's ideal single-pole model with its gain-bandwidth as an editable
						attribute (3Meg for a TL07x by its datasheet, 10Meg for an NE5532), so the simulation shows what the
						gain-bandwidth alone does to the response.
					{/if}
				</p>
				{#if spiceOpampDiffers}
					<p class="note">
						The MFB band-pass stages are built for {mfbOpampLabel}, not the {spiceOpamp} in this file: the run shows the difference.
					</p>
				{/if}

				<p class="note formula-link">
					Every formula this design used, on its own reference page with what each one is and
					how to use it: <a href="/tools/filter-design/formulas/">Formula sheet</a>.
				</p>
			</section>

			<section class="panel">
				<div class="panel-head">
					<span class="num">07</span>
					<h2>Next steps</h2>
				</div>

				<p class="note">This tool only gets to a paper design. Before trusting it on a bench:</p>

				<ol class="steps">
					{#each nextStepsShown as step, i (i)}
						<li><strong>{step.title}.</strong> {step.detail}</li>
					{/each}
				</ol>
			</section>
		{/if}
	{/if}
</article>

<style>
	h1 {
		font-size: clamp(1.9rem, 5vw, 2.5rem);
		margin-bottom: 0.5rem;
	}

	.lead {
		font-size: 1.05rem;
		color: var(--textDim);
		margin-bottom: 1.8rem;
	}

	/* the inputs of a row in line at the bottom when a label runs to two lines */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.1rem;
		align-items: end;
	}

	/* a band filter's rows: the same four tracks however few fields a row
	   has, so the columns line up from one row to the next */
	.grid.fill {
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	}

	/* the last field keeps its margin too, so what follows the grid sits the
	   same distance under it however full the last row is */
	.grid > .field:last-child {
		margin-bottom: 0.9rem;
	}

	/* a field whose choices read long takes two tracks where there is room for them */
	@media (min-width: 720px) {
		.grid.fill > .field.wide {
			grid-column: span 2;
		}
	}

	.order-field {
		margin: 1rem 0;
		max-width: 420px;
	}

	.summing-svg {
		width: 100%;
		height: auto;
		display: block;
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		color: var(--text);
	}

	.summing-svg :global(.lbl) {
		font-family: var(--mono);
		font-size: 11px;
		fill: var(--blue);
	}

	.subhead {
		font-size: 0.85rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--textDim);
		margin: 1.1rem 0 0.6rem;
	}

	.subhead:first-of-type {
		margin-top: 0;
	}

	/* a band side's name sits as far under the row above as the next one,
	   first of its kind or not */
	.subhead.side-head {
		margin-top: 1.1rem;
	}

	/* a band side's edges, next to its name */
	.subhead .edges {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		margin-left: 0.35rem;
	}

	.stage-block {
		border-top: 1px solid var(--line);
		padding-top: 1.2rem;
		margin-top: 1.2rem;
	}

	.stage-block:first-of-type {
		border-top: 0;
		padding-top: 0;
		margin-top: 0;
	}

	.stage-block h3 {
		font-size: 0.95rem;
		margin-bottom: 0.7rem;
	}

	.stage-grid {
		display: grid;
		grid-template-columns: minmax(220px, 320px) 1fr;
		gap: 1.2rem;
		align-items: start;
	}

	.stage-grid .math-full {
		grid-column: 1 / -1;
	}

	.cap-picker .row {
		align-items: flex-end;
	}

	.cap-picker .row .field {
		margin-bottom: 0;
	}

	@media (max-width: 700px) {
		.stage-grid {
			grid-template-columns: 1fr;
		}
	}

	table.actual {
		margin-top: 0.8rem;
	}

	/* the method in use, in the comparison of the two */
	table.methods tr.chosen td {
		font-weight: 600;
		color: var(--text);
	}

	/* the note wraps rather than widen the table past the panel */
	table.methods td:last-child {
		white-space: normal;
		min-width: 9rem;
	}

	/* the six narrow band-pass circuits: the names and the rule's reasons
	   wrap, so the figures between them fit the panel on a wide screen */
	table.narrow-table td:first-child {
		white-space: normal;
		min-width: 9rem;
	}

	table.narrow-table td:last-child {
		min-width: 11rem;
	}

	/* the shift on a TL082: an oscillation or a note wraps under the figures */
	table.narrow-table td:nth-child(5) {
		white-space: normal;
		min-width: 9.5rem;
	}

	/* the line that stands in for the build-by-hand panel, spaced like a panel */
	.build-note {
		margin: 1.1rem 0;
	}

	.steps {
		display: grid;
		gap: 0.7rem;
		margin: 0;
		padding-left: 1.2rem;
		max-width: 74ch;
	}

	.steps li {
		font-size: 0.93rem;
		color: var(--textDim);
	}

	.steps strong {
		color: var(--text);
	}

	.err {
		color: var(--textFaint);
		font-size: 0.85em;
	}

	.downloads {
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-bottom: 0.9rem;
	}

	.formula-link {
		margin-top: 0.9rem;
	}

	.legend {
		display: flex;
		gap: 1.2rem;
		margin-top: 0.6rem;
		font-size: 0.82rem;
		color: var(--textDim);
	}

	/* a legend whose entries run long goes to two lines on a phone */
	.legend.wrap {
		flex-wrap: wrap;
		row-gap: 0.4rem;
	}

	.legend span {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.line {
		width: 1.1rem;
		height: 2px;
		display: inline-block;
	}

	.line.blue {
		background: var(--blue);
	}

	.line.amber {
		background: var(--amber);
	}

	/* the dashed curve of the narrow band-pass on a TL082 */
	.line.dim {
		background: repeating-linear-gradient(90deg, var(--textDim) 0 5px, transparent 5px 9px);
	}

	.flag {
		font-size: 0.85rem;
		border-radius: var(--radiusSmall);
		padding: 0.5rem 0.8rem;
		max-width: none;
		margin-top: 0.8rem;
	}

	.flag.warn {
		color: var(--amber);
		background: var(--amberSoft);
		border: 1px solid #f0dfae;
	}

	.flag.bad {
		color: #fff;
		background: var(--red);
	}

	.flag.ok {
		color: var(--green);
		background: #e6f4ec;
		border: 1px solid #c6e5d4;
	}
</style>
