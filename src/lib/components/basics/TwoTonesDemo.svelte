<script>
	// Two test tones through the filter designed on the page. The input is a
	// tone of size 1 plus a tone of size 0.6; the output is each tone scaled
	// and shifted by the page's own circuit, evaluated from the rounded parts
	// of panel 04 exactly as panel 05 does (magnitudePhaseAt on the cascade,
	// or the two summed branches of a band-stop), so the figure shows what
	// the page built, phase included. The sliders are the two frequencies,
	// over the Bode plot's window. They follow the page's edges until moved,
	// then hold, and a link puts them back.
	//   filterType          'lowpass' | 'highpass' | 'bandpass' | 'bandstop'
	//   fp, fs              edges of a low-pass or a high-pass, Hz
	//   fl, fh, fsl, fsh    edges of a band type, Hz
	//   stages              the realized stages, as panel 04 lists them
	//   branches, signs     band-stop only: the two branches and the combiner's signs
	// With no stages (the page has no valid design) the figure uses an ideal
	// fourth-order Butterworth low-pass at 10 kHz and says so.
	import { magnitudePhaseAt, magnitudePhaseAtParallelSum } from '$lib/filter/bode';
	import { butterworthStages } from '$lib/filter/order';
	import TimePlot from '../TimePlot.svelte';
	import Slider from './Slider.svelte';
	import { dbText, hzText, pctText } from './bodeFigure.js';

	let { filterType = 'lowpass', fp = 10000, fs = 35000, fl = 1000, fh = 10000, fsl = 300, fsh = 30000, stages = null, branches = null, signs = null } = $props();

	// the stand-in design, shaped like realized stages so bode.js takes it as is
	const DEFAULT_STAGES = butterworthStages(4).stages.map((s) => ({
		order: 2,
		topology: 'ideal',
		actual: { wn: 2 * Math.PI * 10000 * Math.sqrt(s.b), q: Math.sqrt(s.b) / s.a, gain: 1 }
	}));
	const AMPLITUDE = [1, 0.6];

	const fallback = $derived(
		filterType === 'bandstop'
			? !(Array.isArray(branches) && branches.length === 2 && branches.every((b) => Array.isArray(b) && b.length > 0))
			: !(Array.isArray(stages) && stages.length > 0)
	);
	const type = $derived(fallback ? 'lowpass' : filterType);
	const edges = $derived(fallback ? { fp: 10000, fs: 35000 } : { fp, fs, fl, fh, fsl, fsh });

	function respond(f) {
		if (fallback) return magnitudePhaseAt(DEFAULT_STAGES, f);
		if (filterType === 'bandstop') return magnitudePhaseAtParallelSum(branches, f, signs);
		return magnitudePhaseAt(stages, f);
	}

	// the window of panel 05, and the starting tones: tone 1 in the passband, tone 2 in the stopband
	const frame = $derived.by(() => {
		const e = edges;
		if (type === 'bandpass') return { lo: e.fsl / 10, hi: e.fsh * 10, f1: Math.sqrt(e.fl * e.fh), f2: 3 * e.fsh };
		if (type === 'bandstop') return { lo: e.fl / 10, hi: e.fh * 10, f1: e.fl / 3, f2: Math.sqrt(e.fsl * e.fsh) };
		if (type === 'highpass') return { lo: Math.min(e.fp / 50, e.fs / 10), hi: Math.max(e.fs * 10, e.fp * 3), f1: 3 * e.fp, f2: e.fs / 3 };
		return { lo: e.fp / 50, hi: e.fs * 10, f1: e.fp / 4, f2: 2 * e.fs };
	});

	// null: the slider follows the page; a number: moved by hand, held
	let own1 = $state(null);
	let own2 = $state(null);
	const f1 = $derived(own1 ?? frame.f1);
	const f2 = $derived(own2 ?? frame.f2);

	const tones = $derived(
		[f1, f2].map((f) => {
			const r = respond(f);
			return { f, db: r.db, gain: 10 ** (r.db / 20), phase: (r.deg * Math.PI) / 180 };
		})
	);

	// two periods of the lower tone, sampled finely enough for the faster one
	const traces = $derived.by(() => {
		const lo = Math.min(f1, f2);
		const hi = Math.max(f1, f2);
		const tEnd = 2 / lo;
		const n = Math.max(1200, Math.min(20000, Math.ceil((24 * hi) / lo)));
		const t = new Float64Array(n);
		const input = new Float64Array(n);
		const output = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			const tt = (i / (n - 1)) * tEnd;
			t[i] = tt;
			for (let k = 0; k < 2; k++) {
				const w = 2 * Math.PI * tones[k].f * tt;
				input[i] += AMPLITUDE[k] * Math.sin(w);
				output[i] += AMPLITUDE[k] * tones[k].gain * Math.sin(w + tones[k].phase);
			}
		}
		return { t, input, output, unit: tEnd < 1e-3 ? 'us' : tEnd < 2 ? 'ms' : 's' };
	});

	function region(f) {
		const e = edges;
		if (type === 'highpass') return f >= e.fp ? 'pass' : f <= e.fs ? 'stop' : 'between';
		if (type === 'bandpass') return f >= e.fl && f <= e.fh ? 'pass' : f <= e.fsl || f >= e.fsh ? 'stop' : 'between';
		if (type === 'bandstop') return f <= e.fl || f >= e.fh ? 'pass' : f >= e.fsl && f <= e.fsh ? 'stop' : 'between';
		return f <= e.fp ? 'pass' : f >= e.fs ? 'stop' : 'between';
	}

	const notice = $derived.by(() => {
		const [r1, r2] = [region(f1), region(f2)];
		const between = r1 === 'between' ? 0 : r2 === 'between' ? 1 : -1;
		if (between >= 0) {
			return `Tone ${between + 1} sits in the transition band, where the filter is free to slide: it still comes out at ${pctText(tones[between].gain)} %, less the closer it gets to the stopband. There is no single frequency where the filter switches.`;
		}
		if (r1 === 'pass' && r2 === 'stop') {
			const kept = Math.abs(tones[0].db) < 0.5 ? 'comes through untouched' : `comes through at ${pctText(tones[0].gain)} % of its size`;
			const cut = tones[1].gain < 0.01 ? 'is gone from the output' : `is cut to ${pctText(tones[1].gain)} %`;
			return `Tone 1 sits in the passband and ${kept}; tone 2 sits in the stopband and ${cut}.`;
		}
		if (r1 === 'stop' && r2 === 'pass') {
			const cut = tones[0].gain < 0.01 ? 'is gone' : `is cut to ${pctText(tones[0].gain)} %`;
			return `The tones have swapped roles: tone 1 now sits in the stopband and ${cut}, tone 2 passes.`;
		}
		if (r1 === 'pass') return 'Both tones sit in the passband, so the output is the input again, only a little late.';
		return 'Both tones sit in the stopband, so almost nothing comes out.';
	});
</script>

<div class="demo">
	<div class="controls">
		<Slider bind:value={() => f1, (v) => (own1 = v)} label="Tone 1, size 1" min={frame.lo} max={frame.hi} log={true} fmt={hzText} />
		<Slider bind:value={() => f2, (v) => (own2 = v)} label="Tone 2, size 0.6" min={frame.lo} max={frame.hi} log={true} fmt={hzText} />
	</div>
	<TimePlot
		series={[
			{ t: traces.t, y: traces.input, color: 'var(--textDim)', width: 1.2 },
			{ t: traces.t, y: traces.output, color: 'var(--blue)', width: 2 }
		]}
		unit={traces.unit}
		height={170}
		yRange={[-1.8, 1.8]}
	/>
	<p class="mono">
		{#each tones as tone, i (i)}
			<span>{hzText(tone.f)}: {dbText(tone.db)} dB, comes out at {pctText(tone.gain)} %</span>
		{/each}
	</p>
	<p class="read">
		Grey: the two tones going in. Blue: what comes out. {notice}
		{#if fallback}
			The page has no valid design yet, so the figure is using the default design: a fourth-order Butterworth low-pass at 10 kHz.
		{/if}
	</p>
	{#if own1 !== null || own2 !== null}
		<button
			type="button"
			class="reset"
			onclick={() => {
				own1 = null;
				own2 = null;
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
