<script>
	import BodePlot from '$lib/components/BodePlot.svelte';
	import CircuitDiagram from '$lib/components/CircuitDiagram.svelte';
	import Equation from '$lib/components/Equation.svelte';
	import MathPanel from '$lib/components/MathPanel.svelte';
	import { generateScript, NEXT_STEPS } from '$lib/filter/codegen';
	import {
		explainFirstOrder,
		explainFirstOrderHp,
		explainHpStage,
		explainMfb,
		explainMfbHp,
		explainSallenKey,
		explainSallenKeyHp,
		explainStage,
		explainSummingAmp
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
		mfbSensitivity,
		MFB_HP_SENSITIVITY,
		SALLEN_KEY_SENSITIVITY,
		SALLEN_KEY_HP_SENSITIVITY,
		worstCaseQError
	} from '$lib/filter/sensitivity';
	import { designLowPass, designHighPass, designBandPass, designBandStop } from '$lib/filter/stages';
	import { magnitudePhaseAt, sweep, magnitudePhaseAtParallelSum, sweepParallelSum } from '$lib/filter/bode';
	import { buildSummingAmpDiagram } from '$lib/filter/circuits';

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

	const realizedStages = $derived.by(() => {
		if (!design) return [];
		return design.stages.map((stage, i) => {
			const ov = capOverrides[i];

			if (stage.filterType === 'highpass') {
				if (stage.order === 1) {
					if (ov?.C > 0) {
						const r = designFirstOrderHighPassFromCap(stage.tau, ov.C * 1e-9);
						if (r.ok) return r;
					}
					return designFirstOrderHighPass(stage.tau);
				}
				if (topology === 'sallenKey') {
					if (ov?.C > 0) {
						const r = designSallenKeyHighPassFromCap(stage.wn, stage.q, ov.C * 1e-9);
						if (r.ok) return r;
					}
					return designSallenKeyHighPass(stage.wn, stage.q);
				}
				if (ov?.C > 0) {
					const r = designMfbHighPassFromCap(stage.wn, stage.q, ov.C * 1e-9);
					if (r.ok) return r;
				}
				return designMfbHighPass(stage.wn, stage.q);
			}

			if (stage.order === 1) {
				if (ov?.C > 0) {
					const r = designFirstOrderLowPassFromCap(stage.tau, ov.C * 1e-9);
					if (r.ok) return r;
				}
				return designFirstOrderLowPass(stage.tau);
			}

			if (topology === 'sallenKey') {
				const auto = designSallenKeyLowPass(stage.wn, stage.q);
				if (ov?.Ctop > 0 || ov?.Cbottom > 0) {
					const Ctop = ov?.Ctop > 0 ? ov.Ctop * 1e-9 : auto.components.Ctop;
					const Cbottom = ov?.Cbottom > 0 ? ov.Cbottom * 1e-9 : auto.components.Cbottom;
					const r = designSallenKeyLowPassFromCaps(stage.wn, stage.q, Ctop, Cbottom);
					if (r.ok) return r;
				}
				return auto;
			}

			const auto = designMfbLowPass(stage.wn, stage.q);
			if (ov?.C1 > 0 || ov?.C2 > 0) {
				const C1 = ov?.C1 > 0 ? ov.C1 * 1e-9 : auto.components.C1;
				const C2 = ov?.C2 > 0 ? ov.C2 * 1e-9 : auto.components.C2;
				const r = designMfbLowPassFromCaps(stage.wn, stage.q, C1, C2);
				if (r.ok) return r;
				return {
					...auto,
					manualError: `C1/C2 = ${(C1 / C2).toFixed(2)}:1 cannot realize Q = ${stage.q.toFixed(4)} for this stage (needs at least 8Q² = ${(8 * stage.q * stage.q).toFixed(1)}:1, i.e. C1 at least that many times C2). Showing the automatic values below instead.`
				};
			}
			return auto;
		});
	});

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

	const bodePoints = $derived.by(() => {
		if (!design || realizedStages.length === 0) return [];
		if (filterType === 'bandpass') return sweep(realizedStages, fsl / 10, fsh * 10, 240);
		if (filterType === 'bandstop') return sweepParallelSum(bandStopBranches, fl / 10, fh * 10, 240);
		return sweep(realizedStages, fp / 50, fs * 10, 240);
	});

	const attenuationAtFs = $derived.by(() => {
		if (!design || realizedStages.length === 0 || isBandType) return null;
		return -magnitudePhaseAt(realizedStages, fs).db;
	});

	const attenuationAtFsl = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (filterType === 'bandstop') return -magnitudePhaseAtParallelSum(bandStopBranches, fsl).db;
		return -magnitudePhaseAt(realizedStages, fsl).db;
	});

	const attenuationAtFsh = $derived.by(() => {
		if (!design || realizedStages.length === 0 || !isBandType) return null;
		if (filterType === 'bandstop') return -magnitudePhaseAtParallelSum(bandStopBranches, fsh).db;
		return -magnitudePhaseAt(realizedStages, fsh).db;
	});

	function sensitivityFor(stageDesign) {
		if (stageDesign.topology === 'mfb') return mfbSensitivity(stageDesign.components);
		if (stageDesign.topology === 'sallenKey') return { ...SALLEN_KEY_SENSITIVITY };
		if (stageDesign.topology === 'mfbHp') return { ...MFB_HP_SENSITIVITY };
		if (stageDesign.topology === 'sallenKeyHp') return { ...SALLEN_KEY_HP_SENSITIVITY };
		return null;
	}

	function explainComponents(stageDesign, i) {
		if (stageDesign.topology === 'mfb') return explainMfb(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKey') return explainSallenKey(stageDesign, design.stages[i].q);
		if (stageDesign.topology === 'mfbHp') return explainMfbHp(stageDesign, design.stages[i].wn, design.stages[i].q);
		if (stageDesign.topology === 'sallenKeyHp') return explainSallenKeyHp(stageDesign, design.stages[i].q);
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
			capOverrides: capOverridesFarads
		});
		const blob = new Blob([code], { type: 'text/javascript' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'filter-design.js';
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
							ωc,hp = 2π·fl = {(design.hp.wc / 1000).toFixed(1)}k, ωc,lp = 2π·fh = {(
								design.lp.wc / 1000
							).toFixed(1)}k rad/s
						{:else if filterType === 'bandstop'}
							ωc,lp = 2π·fl = {(design.lp.wc / 1000).toFixed(1)}k, ωc,hp = 2π·fh = {(
								design.hp.wc / 1000
							).toFixed(1)}k rad/s
						{:else}
							ωc = 2π·fp = {(design.wc / 1000).toFixed(1)}k rad/s
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
						Denormalized with s → s/ωc (high-pass: ωc = ωmin = fp, the passband edge). Each row is
						one realizable second-order block:
					</p>
					<Equation tex={`H(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
				{:else}
					<p class="note">
						Denormalized with s → s/ωc (low-pass: ωc = ωmax = fp). Each row is one realizable
						second-order block:
					</p>
					<Equation tex={`H(s) = \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
				{/if}

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
						{topology === 'mfb' ? 'multiple feedback' : 'Sallen-Key'}{filterType === 'highpass'
							? ', high-pass'
							: filterType === 'bandpass'
								? ', band-pass'
								: filterType === 'bandstop'
									? ', band-stop'
									: ''}
					</span>
				</div>

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
												<td>{name.startsWith('R') ? formatOhms(value) : formatFarads(value)}</td>
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
									{#if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp'}
										Pick a different C value if the one above does not match what is in stock; the
										resistors above are recalculated to fit.
									{:else}
										Pick different {stageDesign.topology === 'sallenKey' ? 'C_top and C_bottom' : 'C1 and C2'}
										values if the ones above do not match what is in stock; the resistors above are
										recalculated to fit.
									{/if}
								</p>
								<div class="row">
									{#if stageDesign.topology === 'firstOrder' || stageDesign.topology === 'firstOrderHp' || stageDesign.topology === 'mfbHp' || stageDesign.topology === 'sallenKeyHp'}
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
						<h3>Summing amplifier</h3>
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
											<td>{formatOhms(SUMMING_R)}</td>
										</tr>
										<tr>
											<td>Rb</td>
											<td>{formatOhms(SUMMING_R)}</td>
										</tr>
										<tr>
											<td>Rf</td>
											<td>{formatOhms(SUMMING_R)}</td>
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
								viewBox={buildSummingAmpDiagram(SUMMING_R).viewBox}
								role="img"
								aria-label="summing amplifier schematic"
								class="summing-svg"
							>
								{@html buildSummingAmpDiagram(SUMMING_R).svg}
							</svg>
							<div class="math-full">
								<MathPanel
									summary="Show the math for the summing amplifier"
									blocks={explainSummingAmp(SUMMING_R)}
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
					{amaxDb}
					{aminDb}
				/>
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

				<button type="button" onclick={downloadScript}>Download filter-design.js</button>

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
