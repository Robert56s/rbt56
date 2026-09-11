<script>
	// Magnitude Bode plot: log-frequency x axis, dB y axis, with optional
	// marker lines for the passband and stopband edges. passbandFreqs and
	// stopbandFreqs each take one frequency (low-pass, high-pass) or two
	// (band-pass: low and high edge of each).

	let { points, passbandFreqs = [], stopbandFreqs = [], amaxDb = null, aminDb = null, height = 260 } = $props();

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
		if (Number.isFinite(amaxDb)) {
			const yy = Math.round(y(-amaxDb)) + 0.5;
			g.beginPath();
			g.moveTo(pad.left, yy);
			g.lineTo(w - pad.right, yy);
			g.stroke();
		}
		if (Number.isFinite(aminDb)) {
			const yy = Math.round(y(-aminDb)) + 0.5;
			g.beginPath();
			g.moveTo(pad.left, yy);
			g.lineTo(w - pad.right, yy);
			g.stroke();
		}
		g.setLineDash([]);

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
