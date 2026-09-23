<script>
	// A small general plot for the beginner figures: lines against a linear
	// or logarithmic x axis, optional vertical bars (a spectrum), optional
	// labelled markers, and a y axis that can be plain or in dB.
	//   xs        shared x values of the lines
	//   series    [{ ys, color, dash, width, label, xs, altWhen, altColor }]
	//             xs: the series' own x values; altWhen(x, y): true where the
	//             line takes altColor (red by default), e.g. inside a forbidden zone
	//   bars      [{ x, h, label, color }]     drawn as stems from 0
	//   markers   [{ x, label, color }]        vertical guide lines
	//   hlines    [{ y, label, color }]        horizontal guide lines
	//   boxes     [{ x0, x1, y0, y1, label, color }]  shaded regions, drawn first
	//   xLog, xLabel, yLabel, yMin, yMax, height
	//   yStep     optional spacing of the horizontal grid lines

	let { xs = [], series = [], bars = [], markers = [], hlines = [], boxes = [], xLog = false, xLabel = '', yLabel = '', yMin = null, yMax = null, yStep = null, height = 190 } = $props();

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
		// var(--name) or var(--name, fallback): a canvas cannot read CSS
		// variables itself, so resolve them here, fallback included
		const match = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?))?\s*\)$/.exec((color ?? '').trim());
		if (!match) return color ?? '#16181d';
		return getComputedStyle(node).getPropertyValue(match[1]).trim() || match[2] || '#16181d';
	}

	function draw(node, w, h) {
		const dpr = window.devicePixelRatio || 1;
		node.width = Math.round(w * dpr);
		node.height = Math.round(h * dpr);
		const g = node.getContext('2d');
		if (!g) return;
		g.scale(dpr, dpr);
		g.clearRect(0, 0, w, h);
		const pad = { left: 46, right: 14, top: 14, bottom: 26 };
		const plotW = w - pad.left - pad.right;
		const plotH = h - pad.top - pad.bottom;

		const allX = [...xs, ...bars.map((b) => b.x), ...markers.map((m) => m.x)].filter((v) => Number.isFinite(v) && (!xLog || v > 0));
		let x0 = Math.min(...allX);
		let x1 = Math.max(...allX);
		if (!(x1 > x0)) {
			x0 = xLog ? 1 : 0;
			x1 = xLog ? 10 : 1;
		}
		let lo = yMin;
		let hi = yMax;
		if (lo === null || hi === null) {
			const allY = [...series.flatMap((s) => Array.from(s.ys)), ...bars.map((b) => b.h), 0].filter(Number.isFinite);
			lo ??= Math.min(...allY);
			hi ??= Math.max(...allY);
			if (!(hi > lo)) {
				lo -= 1;
				hi += 1;
			}
			const p = (hi - lo) * 0.08;
			if (yMin === null) lo -= p;
			if (yMax === null) hi += p;
		}
		const X = (v) => pad.left + ((xLog ? Math.log(v / x0) / Math.log(x1 / x0) : (v - x0) / (x1 - x0)) * plotW);
		const Y = (v) => pad.top + (1 - (v - lo) / (hi - lo)) * plotH;

		const line = resolveColor(node, 'var(--line)');
		const textDim = resolveColor(node, 'var(--textDim)');
		g.font = '10px ui-monospace, monospace';

		// x ticks
		g.textAlign = 'center';
		g.textBaseline = 'top';
		const ticks = [];
		if (xLog) {
			for (let d = Math.floor(Math.log10(x0)); d <= Math.ceil(Math.log10(x1)); d++) {
				const v = 10 ** d;
				if (v >= x0 * 0.999 && v <= x1 * 1.001) ticks.push(v);
			}
		} else {
			for (let i = 0; i <= 5; i++) ticks.push(x0 + ((x1 - x0) * i) / 5);
		}
		for (const t of ticks) {
			const xx = Math.round(X(t)) + 0.5;
			g.strokeStyle = 'rgba(22, 24, 29, 0.08)';
			g.beginPath();
			g.moveTo(xx, pad.top);
			g.lineTo(xx, h - pad.bottom);
			g.stroke();
			g.fillStyle = textDim;
			g.fillText(fmt(t), xx, h - pad.bottom + 4);
		}
		// y ticks: zero line and the extremes, or every yStep when one is given
		// (a dB axis reads best with a line every 10 dB)
		g.textAlign = 'right';
		g.textBaseline = 'middle';
		const zeroY = 0 >= lo && 0 <= hi ? Y(0) : null;
		const yTicks = [];
		if (yStep > 0 && (hi - lo) / yStep <= 40) {
			for (let v = Math.ceil(lo / yStep) * yStep; v <= hi + 1e-9; v += yStep) yTicks.push(Math.abs(v) < 1e-9 ? 0 : v);
		} else {
			yTicks.push(lo, 0, hi);
		}
		for (const v of yTicks.filter((v) => v >= lo && v <= hi)) {
			const yy = Math.round(Y(v)) + 0.5;
			g.strokeStyle = v === 0 ? line : 'rgba(22, 24, 29, 0.08)';
			g.beginPath();
			g.moveTo(pad.left, yy);
			g.lineTo(w - pad.right, yy);
			g.stroke();
			// an extreme too close to the zero line keeps its line but not its label
			if (v !== 0 && zeroY !== null && Math.abs(yy - zeroY) < 12) continue;
			g.fillStyle = textDim;
			g.fillText(fmt(v), pad.left - 6, yy);
		}
		if (xLabel) {
			g.textAlign = 'right';
			g.textBaseline = 'bottom';
			g.fillText(xLabel, w - pad.right, h - pad.bottom - 3);
		}
		if (yLabel) {
			g.textAlign = 'left';
			g.textBaseline = 'top';
			g.fillText(yLabel, pad.left + 4, pad.top + 2);
		}

		for (const b of boxes) {
			const cx0 = Math.max(x0, Math.min(x1, b.x0));
			const cx1 = Math.max(x0, Math.min(x1, b.x1));
			const cy0 = Math.max(lo, Math.min(hi, b.y0));
			const cy1 = Math.max(lo, Math.min(hi, b.y1));
			if (!(cx1 > cx0) || !(cy1 > cy0)) continue;
			const color = resolveColor(node, b.color ?? 'var(--blue)');
			g.globalAlpha = 0.1;
			g.fillStyle = color;
			g.fillRect(X(cx0), Y(cy1), X(cx1) - X(cx0), Y(cy0) - Y(cy1));
			g.globalAlpha = 1;
			if (b.label) {
				g.fillStyle = color;
				g.textAlign = 'left';
				g.textBaseline = 'top';
				g.fillText(b.label, X(cx0) + 4, Y(cy1) + 3);
			}
		}
		for (const l of hlines) {
			if (!(l.y >= lo && l.y <= hi)) continue;
			const yy = Math.round(Y(l.y)) + 0.5;
			g.strokeStyle = resolveColor(node, l.color ?? 'var(--textDim)');
			g.setLineDash([4, 3]);
			g.beginPath();
			g.moveTo(pad.left, yy);
			g.lineTo(w - pad.right, yy);
			g.stroke();
			g.setLineDash([]);
			if (l.label) {
				g.fillStyle = g.strokeStyle;
				g.textAlign = 'right';
				g.textBaseline = 'bottom';
				g.fillText(l.label, w - pad.right - 3, yy - 2);
			}
		}
		markers.forEach((m, i) => {
			if (xLog && m.x <= 0) return;
			const xx = Math.round(X(m.x)) + 0.5;
			g.strokeStyle = resolveColor(node, m.color ?? 'var(--textDim)');
			g.setLineDash([4, 3]);
			g.beginPath();
			g.moveTo(xx, pad.top);
			g.lineTo(xx, h - pad.bottom);
			g.stroke();
			g.setLineDash([]);
			if (m.label) {
				// each marker's label sits one line lower than the previous one,
				// so two markers can stand at the same frequency and stay readable
				g.fillStyle = g.strokeStyle;
				g.textAlign = 'left';
				g.textBaseline = 'top';
				g.fillText(m.label, xx + 3, pad.top + 2 + 12 * i);
			}
		});
		for (const b of bars) {
			const xx = Math.round(X(b.x)) + 0.5;
			g.strokeStyle = resolveColor(node, b.color ?? 'var(--blue)');
			g.lineWidth = 3;
			g.beginPath();
			g.moveTo(xx, Y(0));
			g.lineTo(xx, Y(b.h));
			g.stroke();
			if (b.label) {
				g.fillStyle = g.strokeStyle;
				g.textAlign = 'center';
				g.textBaseline = 'bottom';
				g.fillText(b.label, xx, Y(b.h) - 3);
			}
		}
		for (const s of series) {
			const sx = s.xs ?? xs;
			const main = resolveColor(node, s.color ?? 'var(--blue)');
			// a series may name a second colour for the points where altWhen(x, y)
			// holds, e.g. the part of a response that enters a forbidden zone
			const alt = s.altWhen ? resolveColor(node, s.altColor ?? 'var(--red, #c92a2a)') : null;
			g.lineWidth = s.width ?? 2;
			if (s.dash) g.setLineDash(s.dash);
			let current = null;
			let started = false;
			for (let i = 0; i < sx.length; i++) {
				const v = s.ys[i];
				if (!Number.isFinite(v) || (xLog && sx[i] <= 0)) {
					if (started) g.stroke();
					started = false;
					continue;
				}
				const xx = X(sx[i]);
				const yy = Math.max(pad.top, Math.min(h - pad.bottom, Y(v)));
				const color = alt && s.altWhen(sx[i], v) ? alt : main;
				if (!started) {
					g.strokeStyle = color;
					current = color;
					g.beginPath();
					g.moveTo(xx, yy);
					started = true;
					continue;
				}
				if (color !== current) {
					// close the run in the old colour at this point, start the new one here
					g.lineTo(xx, yy);
					g.stroke();
					g.strokeStyle = color;
					current = color;
					g.beginPath();
					g.moveTo(xx, yy);
					continue;
				}
				g.lineTo(xx, yy);
			}
			if (started) g.stroke();
			g.setLineDash([]);
		}
	}

	function fmt(v) {
		const a = Math.abs(v);
		if (a >= 1e6) return `${(v / 1e6).toPrecision(3)}M`;
		if (a >= 1e3) return `${(v / 1e3).toPrecision(3)}k`;
		if (a === 0) return '0';
		if (a < 0.01) return v.toExponential(1);
		return Number(v.toPrecision(3)).toString();
	}

	$effect(() => {
		if (canvas) draw(canvas, width, height);
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
