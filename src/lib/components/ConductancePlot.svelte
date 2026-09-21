<script>
	// Measured channel conductance against gate voltage, with the fitted
	// straight line and the window the fit was made over. Points outside
	// the window are drawn faint: they were read but not trusted.
	let { points = [], fit = null, vp = null } = $props();

	const W = 520;
	const H = 220;
	const PAD = { l: 52, r: 16, t: 14, b: 34 };

	const view = $derived.by(() => {
		if (points.length === 0) return null;
		const xs = points.map((p) => p.vgs);
		const gs = points.map((p) => p.g);
		const xMin = Math.min(...xs, Number.isFinite(vp) ? vp : Infinity) - 0.1;
		const xMax = Math.max(...xs, 0) + 0.1;
		const gMax = Math.max(...gs) * 1.15;
		const sx = (x) => PAD.l + ((x - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
		const sy = (g) => H - PAD.b - (g / gMax) * (H - PAD.t - PAD.b);
		const line = fit ? { x1: sx(Math.max(xMin, -fit.b / fit.a)), y1: sy(Math.max(0, fit.a * Math.max(xMin, -fit.b / fit.a) + fit.b)), x2: sx(xMax), y2: sy(fit.a * xMax + fit.b) } : null;
		const ticksX = [];
		const step = xMax - xMin > 6 ? 2 : 1;
		for (let v = Math.ceil(xMin); v <= xMax; v += step) ticksX.push(v);
		const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * gMax);
		return { xMin, xMax, gMax, sx, sy, line, ticksX, ticksY };
	});
</script>

{#if view}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="channel conductance against gate voltage">
		{#if fit}
			<rect
				x={view.sx(fit.low)}
				y={PAD.t}
				width={Math.max(0, view.sx(fit.high) - view.sx(fit.low))}
				height={H - PAD.t - PAD.b}
				class="window"
			/>
		{/if}
		{#each view.ticksY as g (g)}
			<line x1={PAD.l} x2={W - PAD.r} y1={view.sy(g)} y2={view.sy(g)} class="grid" />
			<text x={PAD.l - 6} y={view.sy(g) + 4} class="tick" text-anchor="end">{(g * 1000).toFixed(g * 1000 >= 10 ? 0 : 2)}</text>
		{/each}
		{#each view.ticksX as v (v)}
			<line x1={view.sx(v)} x2={view.sx(v)} y1={PAD.t} y2={H - PAD.b} class="grid" />
			<text x={view.sx(v)} y={H - PAD.b + 16} class="tick" text-anchor="middle">{v}</text>
		{/each}
		<text x={W / 2} y={H - 4} class="axis" text-anchor="middle">V_GS (V)</text>
		<text x={12} y={H / 2} class="axis" text-anchor="middle" transform="rotate(-90 12 {H / 2})">G (mS)</text>
		{#if view.line}
			<line x1={view.line.x1} y1={view.line.y1} x2={view.line.x2} y2={view.line.y2} class="fit" />
		{/if}
		{#if Number.isFinite(vp)}
			<circle cx={view.sx(vp)} cy={view.sy(0)} r="4" class="vp" />
			<text x={view.sx(vp)} y={view.sy(0) - 8} class="tick" text-anchor="middle">V_P</text>
		{/if}
		{#each points as pt (pt.vgs)}
			<circle cx={view.sx(pt.vgs)} cy={view.sy(pt.g)} r="4" class:faint={fit && (pt.vgs < fit.low || pt.vgs > fit.high)} class="pt" />
		{/each}
	</svg>
{/if}

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
		background: var(--surfaceSunk);
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
	}
	.window {
		fill: var(--blue);
		opacity: 0.08;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.tick,
	.axis {
		font-family: var(--mono);
		font-size: 10px;
		fill: var(--textDim);
	}
	.fit {
		stroke: var(--blue);
		stroke-width: 2;
	}
	.pt {
		fill: var(--text);
	}
	.pt.faint {
		fill: var(--textDim);
		opacity: 0.45;
	}
	.vp {
		fill: none;
		stroke: var(--blue);
		stroke-width: 2;
	}
</style>
