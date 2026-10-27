<script>
	// Magnitude Bode plot: log-frequency x axis, dB y axis, with optional
	// marker lines for the passband and stopband edges. passbandFreqs and
	// stopbandFreqs each take one frequency (low-pass, high-pass) or two
	// (band-pass: low and high edge of each). amaxDb and aminDb draw one
	// level each across the plot; `limits` replaces them with segments, for a
	// band filter whose two sides ask for different limits: { from, to, db,
	// db2 } in Hz and dB of loss, from or to left out at the plot's edge, db2
	// the loss at `to` when the segment slopes from one side's limit to the
	// other's.

	// Three options, off unless given (the narrow band-pass uses them):
	// `fineTicks` labels the 2 and 5 of each decade too, for a view of
	// about a decade; `markers` names marker lines, [{ freq, text }], their
	// labels stacked where they would overlap; `extra` is a second curve,
	// drawn dashed in the dim text colour (points like `points`).
	let { points, passbandFreqs = [], stopbandFreqs = [], amaxDb = null, aminDb = null, limits = null, height = 260, fineTicks = false, markers = null, extra = null } = $props();

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
		const match = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?))?\s*\)$/.exec(color.trim());
		if (!match) return color;
		return getComputedStyle(node).getPropertyValue(match[1]).trim() || match[2] || '#16181d';
	}

	function draw(node, pts, w, h) {
		const dpr = window.devicePixelRatio || 1;
		node.width = Math.round(w * dpr);
		node.height = Math.round(h * dpr);
		const g = node.getContext('2d');
		if (!g) return;
		g.scale(dpr, dpr);
		g.clearRect(0, 0, w, h);
		if (!pts || pts.length === 0) return;

		const pad = { left: 46, right: 12, top: 12, bottom: 24 };
		const plotW = w - pad.left - pad.right;
		const plotH = h - pad.top - pad.bottom;

		const freqs = pts.map((p) => p.freq);
		const logMin = Math.log10(Math.min(...freqs));
		const logMax = Math.log10(Math.max(...freqs));

		const dbs = pts.map((p) => p.db);
		let dbMin = Math.min(-60, Math.floor(Math.min(...dbs) / 10) * 10);
		let dbMax = Math.max(10, Math.ceil(Math.max(...dbs) / 10) * 10);

		const x = (freq) => pad.left + ((Math.log10(freq) - logMin) / (logMax - logMin)) * plotW;
		const y = (db) => pad.top + (1 - (db - dbMin) / (dbMax - dbMin)) * plotH;

		const line = resolveColor(node, 'var(--line)');
		const textDim = resolveColor(node, 'var(--textDim)');
		const blue = resolveColor(node, 'var(--blue)');
		const amber = resolveColor(node, 'var(--amber)');

		// horizontal grid at each 10 dB step, with axis labels
		g.strokeStyle = line;
		g.fillStyle = textDim;
		g.font = '10px ui-monospace, monospace';
		g.textAlign = 'right';
		g.textBaseline = 'middle';
		for (let db = Math.ceil(dbMin / 10) * 10; db <= dbMax; db += 10) {
			const yy = Math.round(y(db)) + 0.5;
			g.beginPath();
			g.moveTo(pad.left, yy);
			g.lineTo(w - pad.right, yy);
			g.stroke();
			g.fillText(String(db), pad.left - 6, yy);
		}

		// vertical grid at each decade
		g.textAlign = 'center';
		g.textBaseline = 'top';
		for (let d = Math.ceil(logMin); d <= Math.floor(logMax); d++) {
			const xx = Math.round(x(10 ** d)) + 0.5;
			g.beginPath();
			g.moveTo(xx, pad.top);
			g.lineTo(xx, h - pad.bottom);
			g.stroke();
			const freq = 10 ** d;
			const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
			g.fillText(label, xx, h - pad.bottom + 4);
		}
		// the 2 and 5 of each decade, labelled, for a view too short for its decades alone
		if (fineTicks) {
			const tickText = (f) => (f >= 1e6 ? `${Number((f / 1e6).toPrecision(3))}M` : f >= 1000 ? `${Number((f / 1000).toPrecision(3))}k` : `${Number(f.toPrecision(3))}`);
			g.setLineDash([2, 4]);
			for (let d = Math.floor(logMin); d <= Math.ceil(logMax); d++) {
				for (const m of [2, 5]) {
					const f = m * 10 ** d;
					if (Math.log10(f) < logMin || Math.log10(f) > logMax) continue;
					const xx = Math.round(x(f)) + 0.5;
					g.beginPath();
					g.moveTo(xx, pad.top);
					g.lineTo(xx, h - pad.bottom);
					g.stroke();
					g.fillText(tickText(f), xx, h - pad.bottom + 4);
				}
			}
			g.setLineDash([]);
		}

		// passband / stopband markers
		g.setLineDash([4, 3]);
		g.strokeStyle = amber;
		for (const f of [...passbandFreqs, ...stopbandFreqs]) {
			if (!f) continue;
			const xx = x(f);
			g.beginPath();
			g.moveTo(xx, pad.top);
			g.lineTo(xx, h - pad.bottom);
			g.stroke();
		}
		// the loss a segment asks for at x, straight between its two ends
		const lossAt = (s, xx) => (s.from && s.to && Number.isFinite(s.db2) ? s.db + (s.db2 - s.db) * ((xx - x(s.from)) / (x(s.to) - x(s.from))) : s.db);
		for (const s of limits ?? [{ db: amaxDb }, { db: aminDb }]) {
			if (!Number.isFinite(s.db)) continue;
			const x0 = s.from ? Math.max(pad.left, x(s.from)) : pad.left;
			const x1 = s.to ? Math.min(w - pad.right, x(s.to)) : w - pad.right;
			if (!(x1 > x0)) continue;
			g.beginPath();
			g.moveTo(x0, Math.round(y(-lossAt(s, x0))) + 0.5);
			g.lineTo(x1, Math.round(y(-lossAt(s, x1))) + 0.5);
			g.stroke();
		}
		g.setLineDash([]);

		// the marker lines named at the foot of the plot, clear of a peak, each label in the first row free of the one before it
		if (markers?.length) {
			g.fillStyle = amber;
			g.textAlign = 'center';
			g.textBaseline = 'bottom';
			const rows = [];
			for (const mk of [...markers].filter((m) => m.freq).sort((a, b) => a.freq - b.freq)) {
				const xx = x(mk.freq);
				const half = g.measureText(mk.text).width / 2 + 3;
				let row = rows.findIndex((end) => end < xx - half);
				if (row < 0) row = rows.length;
				rows[row] = xx + half;
				g.fillText(mk.text, xx, h - pad.bottom - 3 - 12 * row);
			}
			g.fillStyle = textDim;
		}

		// a second curve, dashed
		if (extra?.length) {
			g.strokeStyle = textDim;
			g.lineWidth = 1.5;
			g.setLineDash([5, 4]);
			g.beginPath();
			extra.forEach((p, i) => {
				const xx = x(p.freq);
				const yy = Math.max(pad.top, Math.min(h - pad.bottom, y(p.db)));
				if (i === 0) g.moveTo(xx, yy);
				else g.lineTo(xx, yy);
			});
			g.stroke();
			g.setLineDash([]);
		}

		// response curve
		g.strokeStyle = blue;
		g.lineWidth = 2;
		g.beginPath();
		pts.forEach((p, i) => {
			const xx = x(p.freq);
			const yy = Math.max(pad.top, Math.min(h - pad.bottom, y(p.db)));
			if (i === 0) g.moveTo(xx, yy);
			else g.lineTo(xx, yy);
		});
		g.stroke();
	}

	$effect(() => {
		if (canvas && points) draw(canvas, points, width, height);
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
