<script>
	// Linear time-domain plot: one or more (t, y) traces on shared axes.
	// series: [{ t: Float64Array, y: Float64Array, color: 'var(--blue)', width: 2 }]

	let { series = [], height = 200, unit = 's' } = $props();

	let canvas = $state(null);
	let width = $state(600);

	function measure(node) {
		const observer = new ResizeObserver((entries) => {
			width = Math.max(200, Math.round(entries[0].contentRect.width));
		});
		observer.observe(node);
		width = Math.max(200, Math.round(node.clientWidth));
		return { destroy: () => observer.disconnect() };
	}

	function resolveColor(node, color) {
		const match = /^var\((--[\w-]+)\)$/.exec(color.trim());
		if (!match) return color;
		return getComputedStyle(node).getPropertyValue(match[1]).trim() || '#16181d';
	}

	function draw(node, allSeries, w, h) {
		const dpr = window.devicePixelRatio || 1;
		node.width = Math.round(w * dpr);
		node.height = Math.round(h * dpr);
		const g = node.getContext('2d');
		if (!g) return;
		g.scale(dpr, dpr);
		g.clearRect(0, 0, w, h);
		if (!allSeries.length) return;

		const pad = { left: 46, right: 12, top: 12, bottom: 22 };
		const plotW = w - pad.left - pad.right;
		const plotH = h - pad.top - pad.bottom;

		let tMin = Infinity;
		let tMax = -Infinity;
		let yMin = Infinity;
		let yMax = -Infinity;
		for (const s of allSeries) {
			for (let i = 0; i < s.t.length; i++) {
				if (s.t[i] < tMin) tMin = s.t[i];
				if (s.t[i] > tMax) tMax = s.t[i];
				if (s.y[i] < yMin) yMin = s.y[i];
				if (s.y[i] > yMax) yMax = s.y[i];
			}
		}
		if (yMin === yMax) {
			yMin -= 1;
			yMax += 1;
		}
		const yPad = (yMax - yMin) * 0.08;
		yMin -= yPad;
		yMax += yPad;

		const x = (t) => pad.left + ((t - tMin) / (tMax - tMin || 1)) * plotW;
		const y = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

		const line = resolveColor(node, 'var(--line)');
		const textDim = resolveColor(node, 'var(--textDim)');

		g.strokeStyle = line;
		g.fillStyle = textDim;
		g.font = '10px ui-monospace, monospace';
		g.textAlign = 'right';
		g.textBaseline = 'middle';
		const zeroY = Math.round(y(0)) + 0.5;
		g.beginPath();
		g.moveTo(pad.left, zeroY);
		g.lineTo(w - pad.right, zeroY);
		g.stroke();
		g.fillText('0', pad.left - 6, zeroY);

		g.textAlign = 'center';
		g.textBaseline = 'top';
		const steps = 4;
		for (let i = 0; i <= steps; i++) {
			const t = tMin + ((tMax - tMin) * i) / steps;
			const xx = Math.round(x(t)) + 0.5;
			g.strokeStyle = 'rgba(22, 24, 29, 0.08)';
			g.beginPath();
			g.moveTo(xx, pad.top);
			g.lineTo(xx, h - pad.bottom);
			g.stroke();
			g.fillStyle = textDim;
			g.fillText(fmtTime(t, unit), xx, h - pad.bottom + 4);
		}

		for (const s of allSeries) {
			g.strokeStyle = resolveColor(node, s.color ?? 'var(--blue)');
			g.lineWidth = s.width ?? 2;
			if (s.dash) g.setLineDash(s.dash);
			g.beginPath();
			for (let i = 0; i < s.t.length; i++) {
				const xx = x(s.t[i]);
				const yy = Math.max(pad.top, Math.min(h - pad.bottom, y(s.y[i])));
				if (i === 0) g.moveTo(xx, yy);
				else g.lineTo(xx, yy);
			}
			g.stroke();
			g.setLineDash([]);
		}
	}

	function fmtTime(t, unit) {
		if (unit === 'ms') return `${(t * 1000).toFixed(2)}ms`;
		if (unit === 'us') return `${(t * 1e6).toFixed(1)}us`;
		return `${t.toFixed(3)}s`;
	}

	$effect(() => {
		if (canvas && series) draw(canvas, series, width, height);
	});
</script>

<div class="plot" style="height: {height}px" use:measure>
	<canvas bind:this={canvas} style="width: 100%; height: {height}px"></canvas>
</div>

<style>
	.plot {
		border: 1px solid var(--line);
		border-radius: var(--radiusSmall);
		background: var(--surfaceSunk);
		overflow: hidden;
	}

	canvas {
		display: block;
	}
</style>
