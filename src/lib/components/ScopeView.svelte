<script>
	// A live two-trace scope on the generator's output. Each frame reads the
	// latest samples of both channels from the analysers, triggers on the
	// first rising zero crossing of the reference channel so the trace holds
	// still, and shows a few periods of the reference frequency.
	import { onMount } from 'svelte';
	import { formatHz } from '$lib/audio/format';

	let { generator, running, referenceHz = 1000, colors = ['#2f6fed', '#d9480f'] } = $props();

	let canvas = $state(null);
	let raf = 0;
	const SIZE = 4096;
	const bufs = [new Float32Array(SIZE), new Float32Array(SIZE)];

	const windowSamples = $derived.by(() => {
		const fs = generator.sampleRate || 48000;
		const f = Math.max(0.5, Number(referenceHz) || 1000);
		return Math.max(96, Math.min(SIZE - 64, Math.round((3 * fs) / f)));
	});
	const windowMs = $derived((1000 * windowSamples) / (generator.sampleRate || 48000));

	function trigger(data, count) {
		// first rising zero crossing that leaves room for the window
		for (let i = 1; i < data.length - count; i++) if (data[i - 1] < 0 && data[i] >= 0) return i;
		return 0;
	}

	function draw() {
		raf = requestAnimationFrame(draw);
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const styles = getComputedStyle(canvas);
		ctx.fillStyle = styles.getPropertyValue('--surfaceSunk') || '#f4f6f9';
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = styles.getPropertyValue('--line') || '#ddd';
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let i = 1; i < 4; i++) {
			ctx.moveTo(0, (h * i) / 4);
			ctx.lineTo(w, (h * i) / 4);
			ctx.moveTo((w * i) / 4, 0);
			ctx.lineTo((w * i) / 4, h);
		}
		ctx.stroke();
		ctx.strokeStyle = styles.getPropertyValue('--lineStrong') || '#bbb';
		ctx.beginPath();
		ctx.moveTo(0, h / 2);
		ctx.lineTo(w, h / 2);
		ctx.stroke();

		const count = windowSamples;
		const have = [generator.readWave(0, bufs[0]), generator.readWave(1, bufs[1])];
		const start = trigger(bufs[0].some((v) => v !== 0) ? bufs[0] : bufs[1], count);
		for (let c = 0; c < 2; c++) {
			if (!have[c]) continue;
			ctx.strokeStyle = colors[c];
			ctx.lineWidth = 1.6;
			ctx.beginPath();
			for (let i = 0; i < count; i++) {
				const v = bufs[c][start + i] ?? 0;
				const x = (i / (count - 1)) * w;
				const y = h / 2 - v * (h / 2) * 0.92;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();
		}
	}

	onMount(() => {
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="scope">
	<canvas bind:this={canvas}></canvas>
	<div class="legend">
		<span><i style="background: {colors[0]}"></i> left</span>
		<span><i style="background: {colors[1]}"></i> right</span>
		<span class="dim">{windowMs.toFixed(windowMs < 10 ? 2 : 1)} ms across, triggered on {formatHz(referenceHz)}, vertical is full scale</span>
		{#if !running}
			<span class="dim">output stopped</span>
		{/if}
	</div>
</div>

<style>
	.scope {
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		overflow: hidden;
		background: var(--surfaceSunk);
	}

	canvas {
		display: block;
		width: 100%;
		height: 220px;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 0.45rem 0.7rem;
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--text);
		border-top: 1px solid var(--line);
		background: var(--surface);
	}

	.legend i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 2px;
		margin-right: 0.35rem;
		vertical-align: -1px;
	}

	.dim {
		color: var(--textDim);
	}
</style>
