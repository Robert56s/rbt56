<script>
	import { onMount } from 'svelte';
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
	import { generateScript, NEXT_STEPS } from '$lib/filter/codegen';
	import { generateSchematic } from '$lib/filter/spice';
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
	import { butterworthOrder, chebyshevOrder, transitionRatio } from '$lib/filter/order';
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
		designTowThomasLowPassFromCap
	} from '$lib/filter/towThomas';
	import {
		mfbSensitivity,
		MFB_HP_SENSITIVITY,
		SALLEN_KEY_SENSITIVITY,
		SALLEN_KEY_HP_SENSITIVITY,
		TOW_THOMAS_SENSITIVITY,
		TOW_THOMAS_HP_SENSITIVITY,
		worstCaseQError
	} from '$lib/filter/sensitivity';
	import { designLowPass, designHighPass, designBandPass, designBandStop } from '$lib/filter/stages';
	import { branchOrder, branchSign, combinerChoice, magnitudePhaseAt, sweep, magnitudePhaseAtParallelSum, sweepParallelSum } from '$lib/filter/bode';
	import { buildDifferenceAmpDiagram, buildSummingAmpDiagram } from '$lib/filter/circuits';
	import { LAB_KIT, nearestResistor } from '$lib/filter/eseries';

	const SUMMING_R = 10_000; // ohms, the summing amplifier's three equal resistors

	const MAX_ORDER = 8;

	let amaxDb = $state(3);
	let aminDb = $state(40);
	let fp = $state(10000);
	let fs = $state(35000);
	let fl = $state(1000);
	let fh = $state(10000);
	let fsl = $state(300);
	let fsh = $state(30000);
	let filterType = $state('lowpass');
	let response = $state('butterworth');
	let topology = $state('mfb');

	// Which values the component search is allowed to pick from: a preferred
	// series, the lab drawer, or a list pasted in below. Restricting the
	// stock does not change the design, only what it can round to, so the
	// cost shows up in the f0/Q error columns rather than in the maths.
	const STOCK_KEY = 'rbt56.filter.stock';
	let stock = $state('E24'); // 'E24' | 'E96' | 'lab' | 'custom'
	let resistorText = $state(formatStock(LAB_KIT.resistors, 'resistor'));
	let capacitorText = $state(formatStock(LAB_KIT.capacitors, 'capacitor'));
	let stockLoaded = $state(false);

	const UNIT = { p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
	function trimNum(x) {
		return Number(x.toPrecision(4)).toString();
	}

	/** Reads "1k, 4.7k, 10k" or "10p 20p 1n" into absolute values. */
	function parseStock(text, kind) {
		const out = [];
		for (const raw of String(text).split(/[\s,;]+/)) {
			if (!raw) continue;
			let token = raw.replace(/ohms?/gi, '').replace(/[ΩΩ]/g, '');
			if (kind === 'capacitor') token = token.replace(/[fF]$/, '');
			const m = /^([0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)(meg|[pnumkKMG])?$/.exec(token);
			if (!m) continue;
			const mult = !m[2] ? 1 : m[2] === 'meg' ? 1e6 : (UNIT[m[2]] ?? 1);
			const value = Number(m[1]) * mult;
			if (Number.isFinite(value) && value > 0) out.push(value);
		}
		return [...new Set(out)].sort((a, b) => a - b);
	}

	/** The inverse, so the boxes can be prefilled and round-tripped. */
	function formatStock(values, kind) {
		return values
			.map((v) => {
				if (kind === 'capacitor') {
					if (v >= 1e-6) return trimNum(v * 1e6) + 'u';
					if (v >= 1e-9) return trimNum(v * 1e9) + 'n';
					return trimNum(v * 1e12) + 'p';
				}
				if (v >= 1e6) return trimNum(v / 1e6) + 'M';
				if (v >= 1e3) return trimNum(v / 1e3) + 'k';
				return trimNum(v);
			})
			.join(', ');
	}

	const customResistors = $derived(parseStock(resistorText, 'resistor'));
	const customCapacitors = $derived(parseStock(capacitorText, 'capacitor'));
	const restrictedStock = $derived(stock === 'lab' || stock === 'custom');
	const componentOpts = $derived.by(() => {
		if (stock === 'lab') return { resistorSeries: LAB_KIT.resistors, capacitors: LAB_KIT.capacitors };
		if (stock === 'custom')
			return {
				resistorSeries: customResistors.length ? customResistors : LAB_KIT.resistors,
				capacitors: customCapacitors.length ? customCapacitors : LAB_KIT.capacitors
			};
		return { resistorSeries: stock, capacitors: null };
	});
	const combinerR = $derived(restrictedStock ? nearestResistor(SUMMING_R, componentOpts.resistorSeries) : SUMMING_R);

	// the drawer is worth remembering between visits; blocked storage just
	// means the defaults come back
	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STOCK_KEY) ?? 'null');
			if (saved && typeof saved === 'object') {
				if (typeof saved.stock === 'string') stock = saved.stock;
				if (typeof saved.resistorText === 'string') resistorText = saved.resistorText;
				if (typeof saved.capacitorText === 'string') capacitorText = saved.capacitorText;
			}
		} catch {
			// nothing saved, or storage unavailable
		}
		stockLoaded = true;
	});

	$effect(() => {
		const payload = JSON.stringify({ stock, resistorText, capacitorText });
		if (!stockLoaded) return;
		try {
			localStorage.setItem(STOCK_KEY, payload);
		} catch {
			// private window or storage blocked: the setting is simply not kept
		}
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
	const edgesOk = $derived(
		filterType === 'highpass'
			? fp > fs
			: filterType === 'bandpass'
				? fsl > 0 && fl > fsl && fh > fl && fsh > fh
				: filterType === 'bandstop'
					? fl > 0 && fl < fsl && fsl < fsh && fsh < fh
					: fs > fp
	);
	const valid = $derived(
		isBandType ? edgesOk && amaxDb > 0 && aminDb > amaxDb : fp > 0 && fs > 0 && edgesOk && amaxDb > 0 && aminDb > amaxDb
	);

	const k = $derived(
		valid && !isBandType
			? filterType === 'highpass'
				? transitionRatio(fs, fp)
				: transitionRatio(fp, fs)
			: null
	);
	const minOrder = $derived(
		k !== null
			? response === 'chebyshev'
				? chebyshevOrder(amaxDb, aminDb, k)
				: butterworthOrder(amaxDb, aminDb, k)
			: null
	);
	const minOrderCeil = $derived(minOrder !== null ? Math.max(1, Math.ceil(minOrder)) : null);
	const order = $derived(
		orderOverride !== null ? Math.min(MAX_ORDER, Math.max(1, orderOverride)) : minOrderCeil
	);
	const orderTooHigh = $derived(minOrderCeil !== null && minOrderCeil > MAX_ORDER);

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
	const minOrderHp = $derived(
		kHp !== null
			? response === 'chebyshev'
				? chebyshevOrder(amaxDb, aminDb, kHp)
				: butterworthOrder(amaxDb, aminDb, kHp)
			: null
	);
	const minOrderHpCeil = $derived(minOrderHp !== null ? Math.max(1, Math.ceil(minOrderHp)) : null);
	const orderHp = $derived(
		orderOverrideHp !== null ? Math.min(MAX_ORDER, Math.max(1, orderOverrideHp)) : minOrderHpCeil
	);
	const orderHpTooHigh = $derived(minOrderHpCeil !== null && minOrderHpCeil > MAX_ORDER);

	const kLp = $derived(valid && isBandType ? transitionRatio(lpFp, lpFs) : null);
	const minOrderLp = $derived(
		kLp !== null
			? response === 'chebyshev'
				? chebyshevOrder(amaxDb, aminDb, kLp)
				: butterworthOrder(amaxDb, aminDb, kLp)
			: null
	);
	const minOrderLpCeil = $derived(minOrderLp !== null ? Math.max(1, Math.ceil(minOrderLp)) : null);
	const orderLp = $derived(
		orderOverrideLp !== null ? Math.min(MAX_ORDER, Math.max(1, orderOverrideLp)) : minOrderLpCeil
	);
	const orderLpTooHigh = $derived(minOrderLpCeil !== null && minOrderLpCeil > MAX_ORDER);

	const design = $derived.by(() => {
		if (!valid) return null;
		if (isBandType) {
			if (orderHpTooHigh || orderLpTooHigh) return null;
			const args = { response, amaxDb, aminDb, fl, fh, fsl, fsh, orderHigh: orderHp, orderLow: orderLp };
			return filterType === 'bandstop' ? designBandStop(args) : designBandPass(args);
		}
		if (orderTooHigh) return null;
		return filterType === 'highpass'
			? designHighPass({ response, amaxDb, aminDb, fp, fs, order })
			: designLowPass({ response, amaxDb, aminDb, fp, fs, order });
	});

	function buildStage(stage, i, opts) {
		const ov = capOverrides[i];

		if (stage.filterType === 'highpass') {
			if (stage.order === 1) {
				if (ov?.C > 0) {
					const r = designFirstOrderHighPassFromCap(stage.tau, ov.C * 1e-9, opts);
					if (r.ok) return r;
				}
				return designFirstOrderHighPass(stage.tau, opts);
			}
			if (topology === 'towThomas') {
				if (ov?.C > 0) {
					const r = designTowThomasHighPassFromCap(stage.wn, stage.q, ov.C * 1e-9, opts);
					if (r.ok) return r;
				}
				return designTowThomasHighPass(stage.wn, stage.q, opts);
			}
			if (topology === 'sallenKey') {
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

		if (topology === 'towThomas') {
			if (ov?.C > 0) {
				const r = designTowThomasLowPassFromCap(stage.wn, stage.q, ov.C * 1e-9, opts);
				if (r.ok) return r;
			}
			return designTowThomasLowPass(stage.wn, stage.q, opts);
		}
		if (topology === 'sallenKey') {
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

	const realizedStages = $derived.by(() => {
		if (!design) return [];
		return design.stages
			.map((stage, i) => {
				const built = buildStage(stage, i, componentOpts);
				if (built) return built;
				// the chosen stock cannot realize this stage at all: fall back to
				// the full E24/E6 grid and flag it, rather than dropping the stage
				const fallback = buildStage(stage, i, { resistorSeries: 'E24', capacitors: null });
				return fallback && { ...fallback, stockShortfall: true };
			})
			.filter(Boolean);
	});

	const shortfallStages = $derived(realizedStages.flatMap((r, i) => (r.stockShortfall ? [i + 1] : [])));

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
	const combineSigns = $derived(combiner ? combiner.signs : null);
	const combinerMode = $derived(combiner ? combiner.mode : 'sum');

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
	// So for a Chebyshev the reference is the highest gain in the passband.
	const passbandPeakDb = $derived.by(() => {
		if (!design || realizedStages.length === 0 || response !== 'chebyshev') return 0;
		const gainDb = (f) =>
			filterType === 'bandstop' ? magnitudePhaseAtParallelSum(bandStopBranches, f, combineSigns).db : magnitudePhaseAt(realizedStages, f).db;
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
		let peak = 0;
		for (const [a, b] of ranges) {
			if (!(a > 0 && b > a)) continue;
			for (let i = 0; i <= 400; i++) peak = Math.max(peak, gainDb(a * (b / a) ** (i / 400)));
		}
		return peak;
	});

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
		return null;
	}

	function explainComponents(stageDesign, i) {
		if (stageDesign.topology === 'mfb') return explainMfb(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKey') return explainSallenKey(stageDesign, design.stages[i].q);
		if (stageDesign.topology === 'mfbHp') return explainMfbHp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKeyHp') return explainSallenKeyHp(stageDesign, design.stages[i].q);
		if (stageDesign.topology === 'towThomas') return explainTowThomas(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'towThomasHp') return explainTowThomasHp(stageDesign, design.stages[i].wn, design.stages[i].q);
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
			fp,
			fs,
			fl,
			fh,
			fsl,
			fsh,
			filterType,
			response,
			topology,
			order,
			orderHp,
			orderLp,
			capOverrides: capOverridesFarads,
			resistorStock: componentOpts.resistorSeries,
			capacitorStock: componentOpts.capacitors
		});
		saveFile(code, 'filter-design.js', 'text/javascript');
	}

	function downloadSchematic() {
		if (!design || realizedStages.length === 0) return;
		const schematic = generateSchematic({
			realizedStages,
			filterType,
			response,
			amaxDb,
			aminDb,
			fp,
			fs,
			fl,
			fh,
			fsl,
			fsh,
			topology,
			lpCount: filterType === 'bandstop' ? design.lp.stages.length : 0,
			combinerMode,
			combinerR: combinerR
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
				{:else if filterType === 'bandpass'}
					high-pass side + low-pass side, see below
				{:else if filterType === 'bandstop'}
					low-pass branch + high-pass branch, see below
				{:else}
					k = {k.toFixed(4)}
				{/if}
			</span>
		</div>

		<div class="grid">
			<div class="field">
				<label for="filterType">Filter type</label>
				<select id="filterType" bind:value={filterType}>
					<option value="lowpass">Low-pass</option>
					<option value="highpass">High-pass</option>
					<option value="bandpass">Band-pass</option>
					<option value="bandstop">Band-stop</option>
				</select>
			</div>
			<div class="field">
				<label for="amax">Amax - passband ripple (dB)</label>
				<input id="amax" type="number" min="0.01" step="0.1" bind:value={amaxDb} />
			</div>
			<div class="field">
				<label for="amin">Amin - stopband attenuation (dB)</label>
				<input id="amin" type="number" min="0.01" step="1" bind:value={aminDb} />
			</div>
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
			{:else if filterType === 'bandstop'}
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
			{:else}
				<div class="field">
					<label for="fp">fp - passband edge (Hz)</label>
					<input id="fp" type="number" min="1" step="100" bind:value={fp} />
				</div>
				<div class="field">
					<label for="fs">fs - stopband edge (Hz)</label>
					<input id="fs" type="number" min="1" step="100" bind:value={fs} />
				</div>
			{/if}
			<div class="field">
				<label for="response">Response</label>
				<select id="response" bind:value={response}>
					<option value="butterworth">Butterworth</option>
					<option value="chebyshev">Chebyshev I</option>
				</select>
			</div>
			<div class="field">
				<label for="topology">Topology</label>
				<select id="topology" bind:value={topology}>
					<option value="mfb">Multiple feedback (MFB)</option>
					<option value="sallenKey">Sallen-Key (unity gain)</option>
					<option value="towThomas">Tow-Thomas biquad (3 op-amps)</option>
				</select>
			</div>
		</div>

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

		{#if !valid}
			<p class="flag bad">
				{#if filterType === 'highpass'}
					fp must be greater than fs, and Amin must be greater than Amax.
				{:else if filterType === 'bandpass'}
					Frequencies must satisfy fsl &lt; fl &lt; fh &lt; fsh, and Amin must be greater than
					Amax.
				{:else if filterType === 'bandstop'}
					Frequencies must satisfy fl &lt; fsl &lt; fsh &lt; fh, and Amin must be greater than
					Amax.
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
			response,
			topology,
			order: isBandType ? (orderLp ?? 0) + (orderHp ?? 0) : order,
			stages: realizedStages.length,
			fp,
			fs,
			amaxDb,
			aminDb,
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
			stock
		})}
		widgets={{ 'two-tones': TwoTonesDemo, 'rc-on-spec': RcOnSpecDemo, 'order-on-spec': OrderOnSpecDemo, 'stages-multiply': StagesMultiplyDemo }}
	/>

	{#if valid}
		{#if isBandType}
			<section class="panel">
				<div class="panel-head">
					<span class="num">02</span>
					<h2>Order</h2>
					<span class="hint">n = {orderLp} + {orderHp}</span>
				</div>

				{#if filterType === 'bandstop'}
					<h3 class="subhead">Low-pass branch (fl = {fl} Hz, fsl = {fsl} Hz)</h3>
					<Equation tex={`k = \\dfrac{f_l}{f_{sl}} = \\dfrac{${fl}}{${fsl}} = ${kLp.toFixed(4)}`} />
				{:else}
					<h3 class="subhead">High-pass side (fl = {fl} Hz, fsl = {fsl} Hz)</h3>
					<Equation tex={`k = \\dfrac{f_{sl}}{f_l} = \\dfrac{${fsl}}{${fl}} = ${kHp.toFixed(4)}`} />
				{/if}
				{#if response === 'butterworth'}
					<Equation
						tex={`n \\geq \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)} = ${(filterType === 'bandstop' ? minOrderLp : minOrderHp).toFixed(4)}`}
					/>
				{:else}
					<Equation
						tex={`n \\geq \\dfrac{\\operatorname{acosh}\\!\\sqrt{\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}}}{\\operatorname{acosh}(1/k)} = ${(filterType === 'bandstop' ? minOrderLp : minOrderHp).toFixed(4)}`}
					/>
				{/if}
				<MathPanel
					summary="Show where this formula comes from"
					blocks={filterType === 'bandstop'
						? explainOrder({ response, amaxDb, aminDb, k: kLp, minOrder: minOrderLp, filterType: 'lowpass' })
						: explainOrder({ response, amaxDb, aminDb, k: kHp, minOrder: minOrderHp, filterType: 'highpass' })}
				/>

				{#if filterType === 'bandstop' ? orderLpTooHigh : orderHpTooHigh}
					<p class="flag bad">
						That needs order {filterType === 'bandstop' ? minOrderLpCeil : minOrderHpCeil}, past
						this tool's limit of {MAX_ORDER}. Loosen Amax, Amin or the fl/fsl edges.
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
					<h3 class="subhead">High-pass branch (fh = {fh} Hz, fsh = {fsh} Hz)</h3>
					<Equation tex={`k = \\dfrac{f_{sh}}{f_h} = \\dfrac{${fsh}}{${fh}} = ${kHp.toFixed(4)}`} />
				{:else}
					<h3 class="subhead">Low-pass side (fh = {fh} Hz, fsh = {fsh} Hz)</h3>
					<Equation tex={`k = \\dfrac{f_h}{f_{sh}} = \\dfrac{${fh}}{${fsh}} = ${kLp.toFixed(4)}`} />
				{/if}
				{#if response === 'butterworth'}
					<Equation
						tex={`n \\geq \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)} = ${(filterType === 'bandstop' ? minOrderHp : minOrderLp).toFixed(4)}`}
					/>
				{:else}
					<Equation
						tex={`n \\geq \\dfrac{\\operatorname{acosh}\\!\\sqrt{\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}}}{\\operatorname{acosh}(1/k)} = ${(filterType === 'bandstop' ? minOrderHp : minOrderLp).toFixed(4)}`}
					/>
				{/if}
				<MathPanel
					summary="Show where this formula comes from"
					blocks={filterType === 'bandstop'
						? explainOrder({ response, amaxDb, aminDb, k: kHp, minOrder: minOrderHp, filterType: 'highpass' })
						: explainOrder({ response, amaxDb, aminDb, k: kLp, minOrder: minOrderLp, filterType: 'lowpass' })}
				/>

				{#if filterType === 'bandstop' ? orderHpTooHigh : orderLpTooHigh}
					<p class="flag bad">
						That needs order {filterType === 'bandstop' ? minOrderHpCeil : minOrderLpCeil}, past
						this tool's limit of {MAX_ORDER}. Loosen Amax, Amin or the fh/fsh edges.
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
							the summing amplifier. Each stage is its own unity-gain block, so the sum meets both
							halves of the spec with a predictable notch depth.
						{:else}
							{orderHp} high-pass stage{orderHp === 1 ? '' : 's'} cascaded with {orderLp} low-pass
							stage{orderLp === 1 ? '' : 's'} - {orderHp + orderLp} stages total. Each stage is its
							own unity-gain block, so the product meets both halves of the spec with no extra gain
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

				{#if response === 'butterworth'}
					<Equation
						tex={`n \\geq \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)} = ${minOrder.toFixed(4)}`}
					/>
				{:else}
					<Equation
						tex={`n \\geq \\dfrac{\\operatorname{acosh}\\!\\sqrt{\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}}}{\\operatorname{acosh}(1/k)} = ${minOrder.toFixed(4)}`}
					/>
				{/if}

				<MathPanel
					summary="Show where this formula comes from"
					blocks={explainOrder({ response, amaxDb, aminDb, k, minOrder, filterType })}
				/>

				{#if orderTooHigh}
					<p class="flag bad">
						That needs order {minOrderCeil}, past this tool's limit of {MAX_ORDER}. Loosen Amax,
						Amin or k.
					</p>
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
							: ''}, cascaded. Each stage is built as its own unity-DC-gain block, so the
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
						Denormalized with s → s/ωc (high-pass; ωc = 2π·fp·ε^(+1/n) for Butterworth, 2π·fp for Chebyshev, derived below). Each row is
						one realizable second-order block:
					</p>
					<Equation tex={`H(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
				{:else}
					<p class="note">
						Denormalized with s → s/ωc (low-pass; ωc = 2π·fp·ε^(-1/n) for Butterworth, 2π·fp for Chebyshev, derived below). Each row is one realizable
						second-order block:
					</p>
					<Equation tex={`H(s) = \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
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

				<table>
					<thead>
						<tr>
							<th>Stage</th>
							<th>f0 = ωn/2π</th>
							<th>Q</th>
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
							</tr>
						{/each}
					</tbody>
				</table>

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
						{topology === 'mfb' ? 'multiple feedback' : topology === 'sallenKey' ? 'Sallen-Key' : 'Tow-Thomas biquad'}{filterType === 'highpass'
							? ', high-pass'
							: filterType === 'bandpass'
								? ', band-pass'
								: filterType === 'bandstop'
									? ', band-stop'
									: ''}
					</span>
				</div>

				<div class="stock">
					<div class="field">
						<label for="stock">Values the search may use</label>
						<select id="stock" bind:value={stock}>
							<option value="E24">E24 series (standard, 5 %)</option>
							<option value="E96">E96 series (1 %)</option>
							<option value="lab">Lab kit ({LAB_KIT.resistors.length} R, {LAB_KIT.capacitors.length} C)</option>
							<option value="custom">My own list</option>
						</select>
					</div>
					{#if stock === 'custom'}
						<div class="field grow">
							<label for="stockR">Resistors on hand</label>
							<textarea id="stockR" rows="2" bind:value={resistorText}></textarea>
						</div>
						<div class="field grow">
							<label for="stockC">Capacitors on hand</label>
							<textarea id="stockC" rows="2" bind:value={capacitorText}></textarea>
						</div>
					{/if}
				</div>

				{#if stock === 'custom'}
					<p class="note">
						Commas or spaces between values: <code>1k, 4.7k, 10k</code> for resistors,
						<code>10p, 1n, 47n</code> for capacitors. The suffixes k, M, p, n and u are understood,
						and the list is kept in this browser for next time. Reading
						{customResistors.length} resistor{customResistors.length === 1 ? '' : 's'} and
						{customCapacitors.length} capacitor{customCapacitors.length === 1 ? '' : 's'} right now.
					</p>
				{/if}

				{#if restrictedStock}
					<p class="note">
						The search now rounds to those values only, so the f0 and Q error columns below grow.
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

				{#if topology === 'sallenKey'}
					<p class="flag warn">
						{#if isBandType}
							Sallen-Key needs a component ratio of 4·Q² on each stage: a capacitor ratio on the
							low-pass side, a resistor ratio on the high-pass side. Either way, component
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
				{:else if topology === 'towThomas'}
					<p class="note">
						Tow-Thomas: three op-amps per second-order stage (a damped integrator, an integrator and an
						inverter in a loop). f0, Q and gain are each set by one part, any Q is buildable with equal
						capacitors (Rd = Q R), and the sensitivities are fixed at 1/2 or 1. The cost is the extra
						op-amps and their bandwidth: the loop raises the realized Q by roughly 2 Q f0 / f_T, so the
						op-amp gain-bandwidth should be a few hundred times Q times f0. See each stage's math for
						the comparison with MFB and Sallen-Key.
					</p>
				{/if}

				{#each realizedStages as stageDesign, i (i)}
					{@const sens = sensitivityFor(stageDesign)}
					<div class="stage-block">
						<h3>Stage {i + 1}</h3>
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
												<td>{name.startsWith('R') || name.startsWith('r') ? formatOhms(value) : formatFarads(value)}</td>
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
											{/if}
										</tbody>
									</table>

									{#if sens}
										<p class="note">
											1% error on any one component moves Q by roughly
											{worstCaseQError(sens, 1).toFixed(2)}% (root-sum-square across all of them).
										</p>
									{/if}
								{/if}
							</div>
							<CircuitDiagram design={stageDesign} />
							<div class="math-full cap-picker">
								<p class="note">
									{#if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp' || stageDesign.topology === 'towThomas' || stageDesign.topology === 'towThomasHp'}
										Pick a different C value if the one above does not match what is in stock; the
										resistors above are recalculated to fit.
									{:else}
										Pick different {stageDesign.topology === 'sallenKey' ? 'C_top and C_bottom' : 'C1 and C2'}
										values if the ones above do not match what is in stock; the resistors above are
										recalculated to fit.
									{/if}
								</p>
								<div class="row">
									{#if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp' || stageDesign.topology === 'towThomas' || stageDesign.topology === 'towThomasHp'}
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
										<tr>
											<td>Ra</td>
											<td>{formatOhms(combinerR)}</td>
										</tr>
										<tr>
											<td>Rb</td>
											<td>{formatOhms(combinerR)}</td>
										</tr>
										<tr>
											<td>Rf</td>
											<td>{formatOhms(combinerR)}</td>
										</tr>
									</tbody>
								</table>
								<p class="note">
									Combines the low-pass and high-pass branches above into the final band-stop
									output. Any equal resistor value works exactly - there is nothing to search or
									round here.
								</p>
							</div>
							<svg
								viewBox={(combinerMode === 'difference' ? buildDifferenceAmpDiagram(combinerR) : buildSummingAmpDiagram(combinerR)).viewBox}
								role="img"
								aria-label="{combinerMode} amplifier schematic"
								class="summing-svg"
							>
								{@html (combinerMode === 'difference' ? buildDifferenceAmpDiagram(combinerR) : buildSummingAmpDiagram(combinerR)).svg}
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
									differenceDb: combiner ? combiner.differenceDb : 0
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
				/>
				{#if passbandPeakDb > 0.05}
					<p class="note">
						The passband rises to +{passbandPeakDb.toFixed(2)} dB: a Chebyshev built from stages of unity gain ripples above 0 dB
						{isBandType ? 'where the ripples of its two sides meet' : 'when its order is even'}. The spec's limits are measured from
						that top, so the amber Amax and Amin lines and the figures below sit {passbandPeakDb.toFixed(2)} dB higher than they would
						from 0 dB.
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
						{#if attenuationAtFsl >= aminDb && attenuationAtFsh >= aminDb}
							<p class="flag ok">
								Meets the spec: {attenuationAtFsl.toFixed(1)} dB at fsl and {attenuationAtFsh.toFixed(
									1
								)} dB at fsh, at least {aminDb} dB required{filterType === 'bandstop'
									? ' across the stopband'
									: ' on both sides'}.
							</p>
						{:else}
							<p class="flag bad">
								Falls short after rounding: {attenuationAtFsl.toFixed(1)} dB at fsl, {attenuationAtFsh.toFixed(
									1
								)} dB at fsh, {aminDb} dB required on both. Try a higher order on whichever side
								is short, or a tighter resistor series.
							</p>
						{/if}
					{/if}
				{:else if attenuationAtFs !== null}
					{#if attenuationAtFs >= aminDb}
						<p class="flag ok">
							Meets the spec: {attenuationAtFs.toFixed(1)} dB of attenuation at fs, at least
							{aminDb} dB required.
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
							{#if attenuationAtFl <= amaxDb + PASSBAND_SLACK_DB && attenuationAtFh <= amaxDb + PASSBAND_SLACK_DB}
								<p class="flag ok">
									Passband edges: {attenuationAtFl.toFixed(2)} dB at fl and {attenuationAtFh.toFixed(2)}
									dB at fh, at most {amaxDb} dB allowed.
								</p>
							{:else if attenuationAtFl <= amaxDb + PASSBAND_ROUNDING_DB && attenuationAtFh <= amaxDb + PASSBAND_ROUNDING_DB}
								<p class="flag warn">
									Passband edges with rounded parts: {attenuationAtFl.toFixed(2)} dB at fl and
									{attenuationAtFh.toFixed(2)} dB at fh, against Amax = {amaxDb} dB. The ideal design
									sits exactly at Amax; the excess is E24 rounding, smaller than the shift the parts'
									own 5% tolerance produces on a real board.
								</p>
							{:else if restrictedStock}
								<p class="flag warn">
									Passband edges: {attenuationAtFl.toFixed(2)} dB at fl, {attenuationAtFh.toFixed(2)}
									dB at fh, against Amax = {amaxDb} dB. More than rounding explains, and the limited
									value list is the likely reason: the search had nothing closer to pick. Add values,
									loosen Amax, or accept the wider passband if the stopband still holds above.
								</p>
							{:else}
								<p class="flag bad">
									Passband edges miss: {attenuationAtFl.toFixed(2)} dB at fl, {attenuationAtFh.toFixed(2)}
									dB at fh, against Amax = {amaxDb} dB. That is more than rounding explains: check
									any capacitor override above, or switch to the E96 series.
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
								{amaxDb} dB. The ideal design sits exactly at Amax; the excess is E24 rounding,
								smaller than the shift the parts' own 5% tolerance produces on a real board.
							</p>
						{:else if restrictedStock}
							<p class="flag warn">
								Passband edge: {attenuationAtFp.toFixed(2)} dB at fp, against Amax = {amaxDb} dB.
								More than rounding explains, and the limited value list is the likely reason: the
								search had nothing closer to pick. Add values, loosen Amax, or accept the wider
								passband if the stopband above still holds.
							</p>
						{:else}
							<p class="flag bad">
								Passband edge misses: {attenuationAtFp.toFixed(2)} dB at fp, against Amax = {amaxDb}
								dB. That is more than rounding explains: check any capacitor override above, or
								switch to the E96 series.
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

				<div class="row downloads">
					<button type="button" onclick={downloadScript}>Download filter-design.js</button>
					<button type="button" onclick={downloadSchematic}>Download filter-design.asc (LTspice)</button>
				</div>

				<p class="note">
					An LTspice schematic with the same component values as the tables above and the AC
					analysis already set up: open it, press Run, plot V(vout). Each stage is drawn wire by
					wire, the way a textbook draws it. Each op-amp is LTspice's ideal
					single-pole model with its gain-bandwidth as an editable attribute (3Meg for a TL07x,
					10Meg for an NE5532), so the simulation shows what a real part does to the response,
					which the ideal maths on this page cannot.
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

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.1rem;
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

	.stock {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 0.9rem;
	}

	.stock .field {
		margin-bottom: 0;
		min-width: 190px;
	}

	.stock textarea {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.8rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		background: var(--surface);
		color: var(--text);
		resize: vertical;
	}

	.stock textarea:focus {
		outline: none;
		border-color: var(--blue);
	}

	.downloads {
		gap: 0.7rem;
		flex-wrap: wrap;
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
