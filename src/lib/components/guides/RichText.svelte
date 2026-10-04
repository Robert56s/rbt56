<script>
	// A sentence with formulas in it: every $...$ is set inline with KaTeX,
	// **...** is bold, the rest is plain text. A guide writes "the current
	// $I_C$" and gets a real subscript instead of I_C.
	import katex from 'katex';
	import 'katex/dist/katex.min.css';

	let { text = '' } = $props();

	function math(tex) {
		try {
			return katex.renderToString(tex, { displayMode: false, throwOnError: false, strict: 'ignore' });
		} catch {
			return tex;
		}
	}

	// plain text and **bold** runs of a stretch without formulas
	function words(s, out) {
		const bits = s.split('**');
		bits.forEach((b, k) => {
			if (b) out.push(k % 2 ? { bold: b } : { text: b });
		});
	}

	const parts = $derived.by(() => {
		const out = [];
		const s = String(text);
		let i = 0;
		while (i < s.length) {
			const a = s.indexOf('$', i);
			const b = a < 0 ? -1 : s.indexOf('$', a + 1);
			if (a < 0 || b < 0) {
				words(s.slice(i), out);
				break;
			}
			if (a > i) words(s.slice(i, a), out);
			out.push({ html: math(s.slice(a + 1, b)) });
			i = b + 1;
		}
		return out;
	});
</script>

{#each parts as part, i (i)}{#if part.html}<span class="m">{@html part.html}</span>{:else if part.bold}<b>{part.bold}</b>{:else}{part.text}{/if}{/each}

<style>
	.m :global(.katex) {
		font-size: 1.04em;
	}

	b {
		font-weight: 600;
	}
</style>
