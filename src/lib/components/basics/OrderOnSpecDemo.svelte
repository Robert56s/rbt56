<script>
	// The whole family of orders on the spec's Bode axes, same frame and
	// zones as the RC figure. Thin grey: n = 1 to 8. Blue: the order picked
	// on the slider, red where it enters a zone. The magnitude is the one the
	// tool designs to: Butterworth 1 / (1 + eps^2 (f/fp)^(2n)), Chebyshev
	// 1 / (1 + eps^2 Cn(f/fp)^2), with eps^2 = 10^(Amax/10) - 1 so that the
	// loss at fp is exactly Amax (fp/f in place of f/fp for a high-pass);
	// the other responses come from their prototypes (approximations.js),
	// measured from the top of their passband as the page measures them.
	// The fs and Amin sliders move the stopband zone; the answer line is the
	// tool's own count, minimumOrder from stages.js. The sliders follow the
	// page until moved.
	//   kind              'lowpass' | 'highpass' (a band type passes its low-pass side)
	//   response          any key of RESPONSES
	//   fp, fs            the two edges, Hz
	//   amaxDb, aminDb    the two limits
	//   n0                the order the page uses for this side
	//   live, side        as in the RC figure
	import { prototypeFor, prototypeLossDb, RESPONSES, SEARCH_LIMIT } from '$lib/filter/approximations';
	import { minimumOrder } from '$lib/filter/stages';
	import Slider from './Slider.svelte';
	import XYPlot from './XYPlot.svelte';
	import { dbText, frameBottom, hzText, logSpace, plain, specFrame, specZones } from './bodeFigure.js';

	let { kind = 'lowpass', response = 'butterworth', fp = 10000, fs = 35000, amaxDb = 3, aminDb = 40, n0 = 4, live = false, side = '' } = $props();

	const MAX_N = 8;
	const Y_MAX = 10;
	const high = $derived(kind === 'highpass');
	const cheby = $derived(response === 'chebyshev');

	let ownN = $state(null);
	let ownFs = $state(null);
	let ownAmin = $state(null);
	const n = $derived(ownN ?? Math.min(MAX_N, Math.max(1, Math.round(Number.isFinite(n0) ? n0 : 4))));
	const fsSel = $derived(ownFs ?? fs);
	const aminSel = $derived(ownAmin ?? aminDb);
	// the fs slider spans 1.1 to 20 times fp, on the stopband's side of it,
	// widened to take in the page's own fs when that lies outside
	const fsMin = $derived(high ? Math.min(fp / 20, fs) : Math.min(fp * 1.1, fs));
	const fsMax = $derived(high ? Math.max(fp / 1.1, fs) : Math.max(fp * 20, fs));
	// the Amin slider stays above Amax (a stopband limit below the passband one
	// asks nothing) and takes in the page's own Amin
	const aminLo = $derived(Math.max(Math.floor(amaxDb) + 1, Math.min(10, Math.floor(aminDb))));
	const aminHi = $derived(Math.max(80, Math.ceil(aminDb)));

	const eps2 = $derived(10 ** (amaxDb / 10) - 1);
	const chebPoly = (m, x) => (x <= 1 ? Math.cos(m * Math.acos(x)) : Math.cosh(m * Math.acosh(x)));
	const closedForm = $derived(response === 'butterworth' || response === 'chebyshev');
	// the other responses, one prototype per order, each shifted so that the
	// top of its passband is 0 dB (an even-order elliptic peaks above its DC value)
	const prototypes = $derived.by(() => {
		if (closedForm) return [];
		const kSel = high ? fsSel / fp : fp / fsSel;
		return Array.from({ length: MAX_N }, (_, i) => {
			const proto = prototypeFor(response, i + 1, amaxDb, aminSel, kSel);
			let top = -Infinity;
			for (let j = 0; j <= 200; j++) top = Math.max(top, -prototypeLossDb(proto, 10 ** (-3 + (3 * j) / 200)));
			return { proto, top };
		});
	});
	function dbAt(m, f) {
		const x = high ? fp / f : f / fp;
		if (!closedForm) {
			const { proto, top } = prototypes[m - 1];
			return -prototypeLossDb(proto, x) - top;
		}
		const c = cheby ? chebPoly(m, x) : x ** m;
		return -10 * Math.log10(1 + eps2 * c * c);
	}

	// the frame is the page's, so the zone moves and the axes stay put
	const frame = $derived(specFrame(kind, fp, fs));
	const yMin = $derived(frameBottom(aminSel));
	const xs = $derived(logSpace(frame.x0, frame.x1, 240));
	const zones = $derived(specZones({ kind, fp, fs: fsSel, amaxDb, aminDb: aminSel, x0: frame.x0, x1: frame.x1, yMin, yMax: Y_MAX }));
	const series = $derived.by(() => {
		const family = [];
		for (let m = 1; m <= MAX_N; m++) {
			if (m !== n) family.push({ ys: xs.map((f) => dbAt(m, f)), color: 'var(--textFaint)', width: 1 });
		}
		return [...family, { ys: xs.map((f) => dbAt(n, f)), color: 'var(--blue)', width: 2, altWhen: zones.inZone }];
	});

	const lossFs = $derived(-dbAt(n, fsSel));
	const lossFp = $derived(-dbAt(n, fp));
	const stopOk = $derived(Number(lossFs.toFixed(1)) >= aminSel);
	const passOk = $derived(Number(lossFp.toFixed(1)) <= amaxDb);
	const clears = $derived(stopOk && passOk);
	// the tool's own count for the sliders' spec: k = fp/fs (fs/fp for a high-pass), always below 1
	const k = $derived(high ? fsSel / fp : fp / fsSel);
	// the tool's own count; it is not a number when Amin sits at or below Amax (any order then
	// does), and a searched response returns no order at all when none up to its limit gets there
	const counted = $derived(aminSel > amaxDb ? minimumOrder(response, amaxDb, aminSel, k) : null);
	const unreachable = $derived(counted !== null && counted.n === null);
	const answer = $derived(counted && Number.isFinite(counted.value) ? Math.max(1, Math.ceil(counted.value)) : 1);
	const specUntouched = $derived(ownFs === null && ownAmin === null);

	const SECOND = {
		butterworth: 'Pulling fs toward fp or raising Amin moves the answer one whole step at a time, never smoothly.',
		chebyshev: 'The Chebyshev curve wobbles inside the passband but never drops below the Amax line.',
		legendre: 'The Legendre curve never wobbles, and falls faster than a Butterworth curve of the same order.',
		bessel: 'The Bessel curves bend over gently: they keep the delay flat, and pay in steepness.',
		inverseChebyshev: 'The inverse Chebyshev curve is flat in the passband and bounces between its zeros past fs, never above the Amin line.',
		elliptic: 'The elliptic curve wobbles in both bands: within Amax up to fp, and between its zeros past fs, never above the Amin line.'
	};
	const notice = $derived.by(() => {
		let first;
		if (unreachable) first = `A ${RESPONSES[response].label} filter never reaches this spec, even at order ${SEARCH_LIMIT}: moving fs away from fp or lowering Amin brings it back within reach.`;
		else if (answer > MAX_N) first = `This spec needs order ${answer}, past the tool's limit of ${MAX_N}: moving fs away from fp or lowering Amin brings it back within reach.`;
		else if (n < answer) first = `${answer - n === 1 ? 'One order' : `${answer - n} orders`} short: n = ${n} still enters the stopband zone, and n = ${answer} clears it.`;
		else if (n === answer) first = `n = ${n} is the smallest order that clears both zones${specUntouched && live ? ', the number in panel 02' : ' for these slider values'}.`;
		else first = `n = ${n} clears both zones with room to spare: ${n - answer === 1 ? 'the extra order is' : `the ${n - answer} extra orders are`} margin beyond the minimum of ${answer}.`;
		return `${first} ${SECOND[response] ?? SECOND.butterworth}`;
	});
	const hasZeros = $derived(RESPONSES[response]?.zeros ?? false);

	const caption = $derived(
		!live
			? 'The page has no valid spec yet, so the figure uses the default one: 10 kHz, 35 kHz, 3 dB and 40 dB.'
			: side === 'bandpass'
				? 'For a band-pass the figure shows the low-pass side: fp here is fh and fs is fsh.'
				: side === 'bandstop'
					? 'For a band-stop the figure shows the low-pass branch: fp here is fl and fs is fsl.'
					: ''
	);
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={() => n, (v) => (ownN = Math.round(v))} label="Order n" min={1} max={MAX_N} step={1} fmt={(v) => String(Math.round(v))} />
		<Slider bind:value={() => fsSel, (v) => (ownFs = v)} label="fs, stopband edge" min={fsMin} max={fsMax} log={true} fmt={hzText} />
		<Slider bind:value={() => aminSel, (v) => (ownAmin = v)} label="Amin, stopband loss" min={aminLo} max={aminHi} step={1} fmt={(v) => `${plain(v)} dB`} />
	</div>
	<XYPlot
		{xs}
		{series}
		boxes={zones.boxes}
		markers={zones.markers}
		hlines={zones.hlines}
		xLog={true}
		xLabel="frequency (Hz)"
		yLabel="gain (dB)"
		{yMin}
		yMax={Y_MAX}
		yStep={10}
		height={210}
	/>
	<p class="mono">
		<span class={clears ? 'ok' : 'bad'}>n = {n}: loss at fs {dbText(lossFs)} dB, needs {plain(aminSel)}, {clears ? 'clears both zones' : stopOk ? 'enters the passband zone' : 'enters the stopband zone'}</span>
		<span>the tool's answer for this spec: {unreachable ? `none up to n = ${SEARCH_LIMIT}` : `n = ${answer}`}{!unreachable && answer > MAX_N ? `, past its limit of ${MAX_N}` : ''}</span>
		<span>{hasZeros ? `far out: zeros of transmission, then ${n % 2 === 0 ? 'a floor at the stopband ripple' : '20 dB per decade'}` : `slope far out: ${20 * n} dB per decade`}</span>
	</p>
	<p class="read">
		{RESPONSES[response]?.label ?? 'Butterworth'}, as chosen in panel 01. {notice}
		{caption}
	</p>
	{#if ownN !== null || ownFs !== null || ownAmin !== null}
		<button
			type="button"
			class="reset"
			onclick={() => {
				ownN = null;
				ownFs = null;
				ownAmin = null;
			}}>back to the page's values</button
		>
	{/if}
</div>

<style>
	.demo {
		display: grid;
		gap: 0.6rem;
		margin: 0.4rem 0 0.8rem;
	}

	.controls {
		display: grid;
		gap: 0.3rem;
	}

	.mono {
		display: grid;
		gap: 0.1rem;
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.ok {
		color: var(--green);
	}

	.bad {
		color: var(--red, #c92a2a);
	}

	.read {
		font-size: 0.85rem;
		color: var(--textDim);
	}

	.reset {
		justify-self: start;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.8rem;
		color: var(--blue);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
