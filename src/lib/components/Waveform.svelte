<script lang="ts">
	interface Props {
		buffer: AudioBuffer | null;
		colors: string[];
		height?: number;
		empty?: string;
	}

	let { buffer, colors, height = 72, empty = '' }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let width = $state(600);

	function measure(node: HTMLElement) {
		const observer = new ResizeObserver((entries) => {
			width = Math.max(80, Math.round(entries[0].contentRect.width));
		});
		observer.observe(node);
		width = Math.max(80, Math.round(node.clientWidth));
		return { destroy: () => observer.disconnect() };
	}

	/** Canvas does not understand CSS variables, it needs the resolved color. */
	function resolveColor(node: HTMLElement, color: string): string {
		const match = /^var\((--[\w-]+)\)$/.exec(color.trim());
		if (!match) return color;
		return getComputedStyle(node).getPropertyValue(match[1]).trim() || '#17150f';
	}

	function draw(node: HTMLCanvasElement, source: AudioBuffer, w: number, h: number) {
		const dpr = window.devicePixelRatio || 1;
		node.width = Math.round(w * dpr);
		node.height = Math.round(h * dpr);
		const g = node.getContext('2d');
		if (!g) return;
		g.scale(dpr, dpr);
		g.clearRect(0, 0, w, h);

		const lanes = source.numberOfChannels;
		const laneHeight = h / lanes;
		const frames = source.length;
		const step = frames / w;

		for (let lane = 0; lane < lanes; lane++) {
			const data = source.getChannelData(lane);
			const middle = lane * laneHeight + laneHeight / 2;
			const scale = (laneHeight / 2) * 0.92;

			g.strokeStyle = 'rgba(23, 21, 15, 0.25)';
			g.lineWidth = 1;
			g.beginPath();
			g.moveTo(0, Math.round(middle) + 0.5);
			g.lineTo(w, Math.round(middle) + 0.5);
			g.stroke();

			g.fillStyle = resolveColor(node, colors[lane] ?? colors[0]);
			for (let x = 0; x < w; x++) {
				const from = Math.floor(x * step);
				const to = Math.min(frames, Math.floor((x + 1) * step));
				let min = 0;
				let max = 0;
				for (let i = from; i < to; i++) {
					const v = data[i];
					if (v < min) min = v;
					else if (v > max) max = v;
				}
				const top = middle - max * scale;
				const bottom = middle - min * scale;
				g.fillRect(x, top, 1, Math.max(1, bottom - top));
			}

			if (lane > 0) {
				g.strokeStyle = 'rgba(23, 21, 15, 0.35)';
				g.beginPath();
				g.moveTo(0, Math.round(lane * laneHeight) + 0.5);
				g.lineTo(w, Math.round(lane * laneHeight) + 0.5);
				g.stroke();
			}
		}
	}

	$effect(() => {
		if (canvas && buffer) draw(canvas, buffer, width, height);
	});
</script>

<div class="waveform" style="height: {height}px" use:measure>
	{#if buffer}
		<canvas bind:this={canvas} style="width: 100%; height: {height}px"></canvas>
	{:else}
		<span class="empty">{empty}</span>
	{/if}
</div>

<style>
	.waveform {
		position: relative;
		border: 2px solid var(--ink);
		background: #fffdf8;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	canvas {
		display: block;
	}

	.empty {
		font-family: var(--mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(23, 21, 15, 0.35);
	}
</style>
