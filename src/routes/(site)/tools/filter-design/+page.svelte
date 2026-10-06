<script>
	import { designBoctorNotch, designBoctorNotchFromCap, boctorFeasible } from '$lib/filter/boctor';
	import { explainBoctor } from '$lib/filter/explainBoctor';
	import { onMount, untrack } from 'svelte';
	import BasicsPanel from '$lib/components/BasicsPanel.svelte';
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
	import { generateScript, NEXT_STEPS } from '$lib/filter/codegen';
	import { generateSchematic } from '$lib/filter/spice';
	import { DEFAULT_OPAMP, OPAMP_MODELS } from '$lib/spice/opamps';
	import {
		explainApproximation,
		explainFirstOrder,
		explainFirstOrderHp,
		explainHpStage,
		explainMfb,
		explainMfbHp,
		explainOrder,
		explainSallenKey,
		explainSallenKeyHp,
		explainStage,
		explainSummingAmp,
		explainTowThomas,
		explainTowThomasHp
	} from '$lib/filter/explain';
	import { designFirstOrderLowPass, designFirstOrderLowPassFromCap } from '$lib/filter/firstOrder';
	import { designFirstOrderHighPass, designFirstOrderHighPassFromCap } from '$lib/filter/firstOrderHighPass';
	import { formatFarads, formatHz, formatOhms, formatPercent, relativeErrorPercent } from '$lib/filter/format';
	import { designMfbLowPass, designMfbLowPassFromCaps } from '$lib/filter/mfb';
	import { designMfbHighPass, designMfbHighPassFromCap } from '$lib/filter/mfbHighPass';
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
		designTowThomasHighPass,
		designTowThomasHighPassFromCap,
		designTowThomasLowPass,
		designTowThomasLowPassFromCap,
		designTowThomasNotch,
		designTowThomasNotchFromCap
	} from '$lib/filter/towThomas';
	import {
		mfbSensitivity,
		MFB_HP_SENSITIVITY,
		SALLEN_KEY_SENSITIVITY,
		SALLEN_KEY_HP_SENSITIVITY,
		TOW_THOMAS_SENSITIVITY,
		TOW_THOMAS_HP_SENSITIVITY,
		TOW_THOMAS_NOTCH_SENSITIVITY,
		worstCaseQError
	} from '$lib/filter/sensitivity';
	import { designLowPass, designHighPass, designBandPass, designBandStop, minimumOrder } from '$lib/filter/stages';
	import { branchDcGain, branchOrder, branchSign, combinerChoice, combinerDesign, magnitudePhaseAt, sweep, magnitudePhaseAtParallelSum, sweepParallelSum } from '$lib/filter/bode';
	import { buildDifferenceAmpDiagram, buildSummingAmpDiagram } from '$lib/filter/circuits';
	import { C_FLOOR, nearestResistor, pairDiagramLabel, pairLabel } from '$lib/filter/eseries';
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
	const RESPONSE_KEYS = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];

	// Which values the component search is allowed to pick from: a preferred
	// series, the lab drawer, or a list pasted in below. Restricting the
	// stock does not change the design, only what it can round to, so the
	// cost shows up in the f0/Q error columns rather than in the maths. The
	// setting is the site's (src/lib/stock.js): the AM tool shares it, and it
	// is kept in this browser. With a list, `pairs` lets the resistors that
	// set f0, Q or a zero be two in series (pairedResistor in eseries.js).
	const initialStock = defaultStock();
	let stock = $state(initialStock.stock); // 'E24' | 'E96' | 'lab' | 'labR' | 'custom'
	let resistorText = $state(initialStock.resistorText);
	let capacitorText = $state(initialStock.capacitorText);
	let pairs = $state(initialStock.pairs);
	let stockLoaded = $state(false);
	const restrictedStock = $derived(isRestricted(stock));
	const componentOpts = $derived(componentOptions(stock, resistorText, capacitorText, pairs));
	const stockPhrase = $derived(
		(stock === 'E96' ? 'the E96 series' : stock === 'lab' ? 'the lab kit' : stock === 'labR' ? 'the lab resistors' : stock === 'custom' ? 'the list on hand' : 'the E24 series') +
			(componentOpts.pairs ? ' (two in series allowed)' : '')
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
		}
		stockLoaded = true;
	});

	$effect(() => {
		const state = { stock, resistorText, capacitorText, pairs };
		if (stockLoaded) saveStock(state);
	});

	let orderOverride = $state(null);
	let orderOverrideHp = $state(null);
	let orderOverrideLp = $state(null);

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
			const [amax, amin] = untrack(() => [amaxDb, aminDb]);
			amaxDbHp = amax;
			amaxDbLp = amax;
			aminDbHp = amin;
			aminDbLp = amin;
		}
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
	const zeroResponses = $derived([...new Set(isBandType ? [responseHp, responseLp] : [response])].filter((r) => RESPONSES[r]?.zeros));
	const needsTowThomas = $derived(zeroResponses.length > 0);
	const zerosHp = $derived(isBandType && !!RESPONSES[responseHp]?.zeros);
	const zerosLp = $derived(isBandType && !!RESPONSES[responseLp]?.zeros);
	/** The topology a stage of this side uses: 'highpass' or 'lowpass' side of a band filter, or the one menu. */
	const topologyFor = (side) => (isBandType ? (side === 'highpass' ? topologyHp : topologyLp) : topology);
	// the sides still waiting for Tow-Thomas, by name
	const blockedSides = $derived(
		isBandType
			? [zerosHp && !['towThomas', 'boctor'].includes(topologyHp) ? 'high-pass' : null, zerosLp && !['towThomas', 'boctor'].includes(topologyLp) ? 'low-pass' : null].filter(Boolean)
			: needsTowThomas && !['towThomas', 'boctor'].includes(topology)
				? ['filter']
				: []
	);
	const topologyBlocked = $derived(blockedSides.length > 0);
	const usesTopology = (t) => (isBandType ? topologyHp === t || topologyLp === t : topology === t);
	const TOPOLOGY_WORD = { mfb: 'multiple feedback', sallenKey: 'Sallen-Key', towThomas: 'Tow-Thomas biquad', boctor: 'Boctor biquad' };
	// the circuit each stage heading names, so a band filter shows which menu drives it
	const CIRCUIT_WORD = {
		boctor: 'Boctor low-pass notch',
		boctorHp: 'Boctor high-pass notch',
		firstOrder: 'first-order RC, same for every topology',
		firstOrderHp: 'first-order RC, same for every topology',
		mfb: 'multiple feedback',
		mfbHp: 'multiple feedback',
		sallenKey: 'Sallen-Key',
		sallenKeyHp: 'Sallen-Key',
		towThomas: 'Tow-Thomas biquad',
		towThomasHp: 'Tow-Thomas biquad',
		towThomasNotch: 'Tow-Thomas notch, for the zeros'
	};
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
		isBandType ? edgesOk && limitsOk(amaxDbHp, aminSideHp) && limitsOk(amaxDbLp, aminSideLp) : fp > 0 && fs > 0 && edgesOk && limitsOk(amaxDb, aminDb)
	);
	const sideWord = $derived(filterType === 'bandstop' ? 'branch' : 'side');
	// The limits each edge answers to. A band-pass's lower edges (fsl, fl)
	// belong to its high-pass side and its upper ones (fh, fsh) to its
	// low-pass side; a band-stop's lower edges (fl, fsl) belong to its
	// low-pass branch and its upper ones (fsh, fh) to its high-pass branch.
	const amaxAtFl = $derived(filterType === 'bandstop' ? amaxDbLp : amaxDbHp);
	const aminAtFsl = $derived(filterType === 'bandstop' ? aminDb : aminDbHp);
	const amaxAtFh = $derived(filterType === 'bandstop' ? amaxDbHp : amaxDbLp);
	const aminAtFsh = $derived(filterType === 'bandstop' ? aminDb : aminDbLp);
	// a band filter's limits in words, one figure when both sides share it
	const amaxBandText = $derived(amaxAtFl === amaxAtFh ? `${amaxAtFl} dB` : `${amaxAtFl} dB at fl and ${amaxAtFh} dB at fh`);
	const aminBandText = $derived(aminAtFsl === aminAtFsh ? `${aminAtFsl} dB` : `${aminAtFsl} dB at fsl and ${aminAtFsh} dB at fsh`);

	const k = $derived(
		valid && !isBandType
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

	const design = $derived.by(() => {
		if (!valid || topologyBlocked) return null;
		if (isBandType) {
			if (orderHpTooHigh || orderLpTooHigh) return null;
			const args = { responseHp, responseLp, amaxDbHp, aminDbHp: aminSideHp, amaxDbLp, aminDbLp: aminSideLp, fl, fh, fsl, fsh, orderHigh: orderHp, orderLow: orderLp };
			return filterType === 'bandstop' ? designBandStop(args) : designBandPass(args);
		}
		if (orderTooHigh) return null;
		return filterType === 'highpass'
			? designHighPass({ response, amaxDb, aminDb, fp, fs, order })
			: designLowPass({ response, amaxDb, aminDb, fp, fs, order });
	});

	function buildStage(stage, i, opts) {
		const ov = capOverrides[i];

		// A finite zero uses the selected notch network.
		if (Number.isFinite(stage.wz)) {
			const notchOpts = { ...opts, lowSide: stage.filterType === 'lowpass' };
			if (topologyFor(stage.filterType) === 'boctor') {
				const auto = designBoctorNotch(stage.wn, stage.q, stage.wz, notchOpts);
				if (!ov?.C) return auto;
				return designBoctorNotchFromCap(stage.wn, stage.q, stage.wz, ov.C * 1e-9, notchOpts) ?? (auto && { ...auto, manualError: 'This capacitor cannot realize the Boctor section with positive resistors in range. Showing the automatic values.' });
			}
			if (ov?.C > 0) {
				const r = designTowThomasNotchFromCap(stage.wn, stage.q, stage.wz, ov.C * 1e-9, notchOpts);
				if (r.ok) return r;
			}
			return designTowThomasNotch(stage.wn, stage.q, stage.wz, notchOpts);
		}

		const wiring = topologyFor(stage.filterType);
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

	const boctorUnavailable = $derived(design?.stages.flatMap((s, i) => topologyFor(s.filterType) === 'boctor' && Number.isFinite(s.wz) && !boctorFeasible(s.wn, s.q, s.wz, s.filterType === 'lowpass') ? [i + 1] : []) ?? []);
	const stageResults = $derived.by(() => {
		if (!design) return [];
		return design.stages
			.map((stage, i) => {
				const built = buildStage(stage, i, componentOpts);
				if (built) return built;
				// the chosen stock cannot realize this stage at all: fall back to
				// the full E24/E6 grid and flag it, rather than dropping the stage
				const fallback = buildStage(stage, i, { resistorSeries: 'E24', capacitors: null });
				return fallback && { ...fallback, stockShortfall: true };
			});
	});
	const realizationFailures = $derived(stageResults.flatMap((s, i) => s ? [] : [i + 1]));
	const realizedStages = $derived(realizationFailures.length ? [] : stageResults);

	const shortfallStages = $derived(realizedStages.flatMap((r, i) => (r.stockShortfall ? [i + 1] : [])));
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
		if (!design || filterType !== 'bandstop' || realizedStages.length === 0) return null;
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
		if (filterType === 'bandstop') return sweepParallelSum(bandStopBranches, fl / 10, fh * 10, 240, combineSigns);
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
		filterType === 'bandstop' ? magnitudePhaseAtParallelSum(bandStopBranches, f, combineSigns).db : magnitudePhaseAt(realizedStages, f).db;
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
		if (filterType === 'bandstop') return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fsl, combineSigns).db;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fsl).db;
	});

	const attenuationAtFsh = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (filterType === 'bandstop') return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fsh, combineSigns).db;
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
		if (filterType === 'bandstop') return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fl, combineSigns).db;
		return passbandPeakDb - magnitudePhaseAt(realizedStages, fl).db;
	});

	const attenuationAtFh = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (filterType === 'bandstop') return passbandPeakDb - magnitudePhaseAtParallelSum(bandStopBranches, fh, combineSigns).db;
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

	function sensitivityFor(stageDesign) {
		if (stageDesign.topology === 'mfb') return mfbSensitivity(stageDesign.components);
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

	function stageAlerts(stageDesign, target) {
		if (stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp') return [];
		const out = [];
		const q = target.q;
		if (q > Q_SHARP) {
			// f0 goes as 1/sqrt(R1 R2 C1 C2): each part moves it by half its own error
			const width = 100 / q;
			out.push({
				level: q > 2.5 * Q_SHARP ? 'bad' : 'warn',
				text: `Q = ${q.toFixed(1)}: the peak of this stage is only f0/Q wide, ${width.toFixed(1)} % of f0. A 1 % resistor or capacitor moves f0 by about 0.5 %, ${(50 / width).toFixed(0)} % of that width, so the built filter can miss its passband by several dB, and the op-amp's finite speed adds an error that grows with Q. Meeting the spec at a lower order keeps Q lower (an elliptic response needs the fewest stages), and a Tow-Thomas stage is the easiest to trim.`
			});
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

	function explainComponents(stageDesign, i) {
		if (stageDesign.topology === 'boctor' || stageDesign.topology === 'boctorHp') return explainBoctor(stageDesign);
		if (stageDesign.topology === 'mfb') return explainMfb(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKey') return explainSallenKey(stageDesign, design.stages[i].q);
		if (stageDesign.topology === 'mfbHp') return explainMfbHp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKeyHp') return explainSallenKeyHp(stageDesign, design.stages[i].q);
		if (stageDesign.topology === 'towThomas') return explainTowThomas(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'towThomasHp') return explainTowThomasHp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'towThomasNotch') return explainTowThomasNotch(stageDesign, design.stages[i].wn, design.stages[i].q, design.stages[i].wz);
		if (stageDesign.topology === 'firstOrderHp') return explainFirstOrderHp(stageDesign);
		return explainFirstOrder(stageDesign);
	}

	function explainStageFor(fullDesign, i) {
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
			amaxDb,
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
			response,
			responseHp,
			responseLp,
			topology,
			topologyHp,
			topologyLp,
			order,
			orderHp,
			orderLp,
			capOverrides: capOverridesFarads,
			resistorStock: componentOpts.resistorSeries,
			resistorPairs: componentOpts.pairs,
			capacitorStock: componentOpts.capacitors
		});
		saveFile(code, 'filter-design.js', 'text/javascript');
	}

	// the op-amp the LTspice file uses: the ideal single-pole model, or a
	// real part on +/-15 V rails
	let spiceOpamp = $state(DEFAULT_OPAMP);

	function downloadSchematic() {
		if (!design || realizedStages.length === 0) return;
		const schematic = generateSchematic({
			opamp: spiceOpamp,
			realizedStages,
			filterType,
			response: isBandType ? (responseHp === responseLp ? responseLp : null) : response,
			responseHp,
			responseLp,
			amaxDb,
			aminDb,
			amaxDbHp: isBandType ? amaxDbHp : null,
			aminDbHp: isBandType ? aminSideHp : null,
			amaxDbLp: isBandType ? amaxDbLp : null,
			aminDbLp: isBandType ? aminSideLp : null,
			fp,
			fs,
			fl,
			fh,
			fsl,
			fsh,
			topology: isBandType ? (topologyHp === topologyLp ? topologyHp : null) : topology,
			topologyHp: isBandType ? topologyHp : null,
			topologyLp: isBandType ? topologyLp : null,
			lpCount: filterType === 'bandstop' ? design.lp.stages.length : 0,
			combinerMode,
			combinerR: combinerR,
			combinerResistors: combinerParts?.resistors ?? null,
			// the file keeps each pair's sum; its notes name the two parts
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
		content="Design a low-pass, high-pass, band-pass or band-stop active filter: order, transfer function, component values and a Bode plot."
	/>
</svelte:head>

<article>
	<p class="eyebrow">Tool 02</p>
	<h1>Active Filter Design</h1>
	<p class="lead">
		Low-pass, high-pass, band-pass and band-stop. Enter a passband/stopband spec, pick a response
		and a topology, and get the order, the transfer function, real component values and a
		simulated Bode plot.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">01</span>
			<h2>Specification</h2>
			<span class="hint">
				{#if !valid}
					fix the values below
				{:else if topologyBlocked}
					select Tow-Thomas or Boctor in Topology
				{:else if filterType === 'bandpass'}
					high-pass side + low-pass side, see below
				{:else if filterType === 'bandstop'}
					low-pass branch + high-pass branch, see below
				{:else}
					k = {k.toFixed(4)}
				{/if}
			</span>
		</div>

		<div class="grid" class:fill={isBandType}>
			<div class="field">
				<label for="filterType">Filter type</label>
				<select id="filterType" bind:value={filterType}>
					<option value="lowpass">Low-pass</option>
					<option value="highpass">High-pass</option>
					<option value="bandpass">Band-pass</option>
					<option value="bandstop">Band-stop</option>
				</select>
			</div>
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
		{#if filterType === 'bandpass'}
			{@render hpSide()}
			{@render lpSide()}
		{:else if filterType === 'bandstop'}
			{@render lpSide()}
			{@render hpSide()}
		{/if}

		<p class="note">
			{#if filterType === 'highpass'}
				For a high-pass, fp is the passband edge above which the filter passes, and fs the
				stopband edge below it (fp &gt; fs).
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

		<p class="note">
			{#if isBandType}
				High-pass {filterType === 'bandstop' ? 'branch' : 'side'}: {RESPONSES[responseHp].label}, {RESPONSES[responseHp].best}.
				Low-pass {filterType === 'bandstop' ? 'branch' : 'side'}: {RESPONSES[responseLp].label}, {RESPONSES[responseLp].best}.
			{:else}
				{RESPONSES[response].label}: {RESPONSES[response].best}.
			{/if}
			{#if needsTowThomas && !topologyBlocked}
				{zeroResponsesText} zeros in the stopband. Tow-Thomas and Boctor can
				build a stage with zeros (its notch form), so every second-order stage {isBandType
					? zerosHp && zerosLp
						? 'uses the selected notch topology on each side'
						: `of the ${zerosHp ? 'high' : 'low'}-pass ${filterType === 'bandstop' ? 'branch' : 'side'} uses its selected notch topology, while the other ${filterType === 'bandstop' ? 'branch' : 'side'} keeps its own topology`
					: 'uses the selected notch topology'}; an odd order adds one first-order RC stage.
			{/if}
		</p>

		{#if topologyBlocked}
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
				{#if filterType === 'highpass'}
					fp must be greater than fs, and Amin must be greater than Amax.
				{:else if filterType === 'bandpass'}
					Frequencies must satisfy fsl &lt; fl &lt; fh &lt; fsh, and on each side Amin must be
					greater than Amax.
				{:else if filterType === 'bandstop'}
					Frequencies must satisfy fl &lt; fsl &lt; fsh &lt; fh, and Amin must be greater than
					each branch's Amax.
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
		blocks={filterBasics({
			filterType,
			response: isBandType ? responseLp : response,
			topology: isBandType ? topologyLp : topology,
			order: isBandType ? (orderLp ?? 0) + (orderHp ?? 0) : order,
			stages: realizedStages.length,
			fp,
			fs,
			amaxDb: isBandType ? amaxDbLp : amaxDb,
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
			needsTowThomas,
			pairs: componentOpts.pairs
		})}
		widgets={{ 'two-tones': TwoTonesDemo, 'rc-on-spec': RcOnSpecDemo, 'order-on-spec': OrderOnSpecDemo, 'stages-multiply': StagesMultiplyDemo }}
	/>

	{#if realizationFailures.length}
		<p class="flag bad">Boctor cannot realize stage {realizationFailures.join(', ')} with the available capacitor range and positive resistors. {boctorUnavailable.length ? 'The high-pass form needs Q < 1 / (1 - (fz/f0)²).' : 'The capacitor ratio or resistor range is insufficient.'} Select Tow-Thomas for this side, or change the specification. No incomplete cascade is exported.</p>
	{/if}
	{#if usesTopology('boctor') && !realizationFailures.length}
		<p class="note">Boctor uses one op-amp, six resistors and two capacitors per notch section. The high-pass form has gain above one. Resistor rounding can leave a finite notch minimum; the response plot includes it. Sections without finite zeros keep the Tow-Thomas circuit, and an odd order keeps its first-order RC section. <a href="https://www.analog.com/media/en/training-seminars/design-handbooks/Basic-Linear-Design/Chapter8.pdf" target="_blank" rel="noreferrer">Derivation reference: Analog Devices, figures 8.78 and 8.79.</a></p>
	{/if}
	{#if valid && !topologyBlocked && !realizationFailures.length}
		{#if isBandType}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Order</h2>
					<span class="hint">n = {orderLp} + {orderHp}</span>
				</div>

				{#if filterType === 'bandstop'}
					<h3 class="subhead">Low-pass branch (fl = {fl} Hz, fsl = {fsl} Hz, Amax = {amaxDbLp} dB, Amin = {aminSideLp} dB)</h3>
					<Equation tex={`k = \\dfrac{f_l}{f_{sl}} = \\dfrac{${fl}}{${fsl}} = ${kLp.toFixed(4)}`} />
				{:else}
					<h3 class="subhead">High-pass side (fl = {fl} Hz, fsl = {fsl} Hz, Amax = {amaxDbHp} dB, Amin = {aminSideHp} dB)</h3>
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
					<h3 class="subhead">High-pass branch (fh = {fh} Hz, fsh = {fsh} Hz, Amax = {amaxDbHp} dB, Amin = {aminSideHp} dB)</h3>
					<Equation tex={`k = \\dfrac{f_{sh}}{f_h} = \\dfrac{${fsh}}{${fh}} = ${kHp.toFixed(4)}`} />
				{:else}
					<h3 class="subhead">Low-pass side (fh = {fh} Hz, fsh = {fsh} Hz, Amax = {amaxDbLp} dB, Amin = {aminSideLp} dB)</h3>
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
						{#if filterType === 'bandpass'}
							ωc,hp = {(design.hp.wc / 1000).toFixed(1)}k, ωc,lp = {(design.lp.wc / 1000).toFixed(1)}k rad/s
						{:else if filterType === 'bandstop'}
							ωc,lp = {(design.lp.wc / 1000).toFixed(1)}k, ωc,hp = {(design.hp.wc / 1000).toFixed(1)}k rad/s
						{:else}
							ωc = {(design.wc / 1000).toFixed(1)}k rad/s
						{/if}
					</span>
				</div>

				{#if filterType === 'bandpass'}
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
						A row with a zero fz is a notch stage: the ideal numerator blocks fz completely, with
						gain 1 at DC on a low-pass side and far above the zero on a high-pass side.
					</p>
					<Equation tex={`H(s) = K\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}, \\qquad \\omega_z = 2\\pi f_z`} />
				{/if}

				<MathPanel
					summary="Show where the response formula and the poles come from"
					blocks={isBandType
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
							</tr>
						</thead>
						<tbody>
							{#each design.stages as stage, i (i)}
								<tr>
									<td>
										{i + 1}{stage.order === 1 ? ' (1st order)' : ''}{isBandType
											? stage.filterType === 'highpass'
												? ' (HP side)'
												: ' (LP side)'
											: ''}
									</td>
									<td>{stage.order === 1 ? '-' : formatHz(stage.wn / (2 * Math.PI))}</td>
									<td>{stage.order === 1 ? '-' : stage.q.toFixed(4)}</td>
									{#if hasZeros}<td>{Number.isFinite(stage.wz) ? formatHz(stage.wz / (2 * Math.PI)) : '-'}</td>{/if}
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
						{isBandType && topologyHp !== topologyLp
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

				<StockPicker id="stock" bind:stock bind:resistorText bind:capacitorText bind:pairs />

				{#if restrictedStock}
					<p class="note">
						The search now rounds {stock === 'labR' ? 'every resistor to the lab resistors, the capacitors staying on the usual series,' : 'to those values only,'} so the f0 and Q error columns below grow{componentOpts.pairs ? ', less so with two in series' : ''}.
						Everything downstream is computed from the rounded values, so the Bode plot and the
						spec check at the end already show whether the result still meets the spec.
					</p>
				{/if}

				{#if shortfallStages.length > 0}
					<p class="flag warn">
						Stage{shortfallStages.length > 1 ? 's' : ''}
						{shortfallStages.join(', ')}
						cannot be built from those values at all, so {shortfallStages.length > 1 ? 'they are' : 'it is'}
						shown with the full E24 and E6 grids instead. Add values, or lower the order or the Q.
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
						op-amps and their bandwidth: the loop raises the realized Q by roughly 2 Q f0 / f_T, so the
						op-amp gain-bandwidth should be a few hundred times Q times f0. See each stage's math for
						the comparison with MFB and Sallen-Key.
					</p>
				{/if}
				{#if hasZeros && usesTopology('towThomas')}
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
							Stage {i + 1} ·{isBandType ? ` ${design.stages[i].filterType === 'highpass' ? 'high-pass' : 'low-pass'} ${filterType === 'bandstop' ? 'branch' : 'side'},` : ''}
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
											{/if}
										</tbody>
									</table>

									{#if sens}
										<p class="note">
											1% error on any one component moves Q by roughly
											{worstCaseQError(sens, 1).toFixed(2)}% (root-sum-square across all of them).
										</p>
									{/if}
									{#each stageAlerts(stageDesign, design.stages[i]) as alert, k (k)}
										<p class="flag {alert.level}">{alert.text}</p>
									{/each}
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
									{:else if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp' || stageDesign.topology === 'towThomas' || stageDesign.topology === 'towThomasHp' || stageDesign.topology === 'towThomasNotch'}
										Pick a different C value if the one above does not match what is in stock; the
										resistors above are recalculated to fit.
									{:else}
										Pick different {stageDesign.topology === 'sallenKey' ? 'C_top and C_bottom' : 'C1 and C2'}
										values if the ones above do not match what is in stock; the resistors above are
										recalculated to fit.
									{/if}
								</p>
								<div class="row">
									{#if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp' || stageDesign.topology === 'towThomas' || stageDesign.topology === 'towThomasHp' || ['towThomasNotch', 'boctor', 'boctorHp'].includes(stageDesign.topology)}
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
									blocks={explainComponents(stageDesign, i)}
								/>
							</div>
						</div>
					</div>
				{/each}

				{#if filterType === 'bandstop'}
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
						{#if realizedStages.some(s => s.topology === 'boctorHp')}
							Boctor high-pass sections have gain above one, and component rounding also shifts the passband level.
						{:else if passbandPeakDb > 0}
							a response with passband ripple (Chebyshev, elliptic) built from stages of unity gain ripples above 0 dB
							{isBandType ? 'where the ripples of its two sides meet' : 'when its order is even'}{hasZeros ? ', and rounding the notch components also shifts the gain' : ''}.
						{:else}
							rounding the notch components moves the passband level a little.
						{/if}
						The spec's limits are measured from that top, so the amber Amax and Amin lines and the figures below
						sit {Math.abs(passbandPeakDb).toFixed(2)} dB {passbandPeakDb > 0 ? 'higher' : 'lower'} than they would from 0 dB.
					</p>
				{/if}
				<div class="legend">
					<span><i class="line blue"></i>simulated response (rounded components)</span>
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
								order on whichever {sideWord} is short, or a tighter resistor series.
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
						the response, which the ideal maths on this page cannot.
					{:else}
						Each op-amp is LTspice's ideal single-pole model with its gain-bandwidth as an editable
						attribute (3Meg for a TL07x, 10Meg for an NE5532), so the simulation shows what the
						gain-bandwidth alone does to the response.
					{/if}
				</p>

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
					{#each NEXT_STEPS as step, i (i)}
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
