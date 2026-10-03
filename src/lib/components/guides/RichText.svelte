<script>
	// A sentence with formulas in it: every $...$ is set inline with KaTeX,
	// the rest is plain text, so a guide writes "the current $I_C$" and gets
	// a real subscript instead of I_C.
	import katex from 'katex';
	import 'katex/dist/katex.min.css';

	let { text = '' } = $props();

	const parts = $derived.by(() => {
		const out = [];
		const s = String(text);
		let i = 0;
		while (i < s.length) {
			const a = s.indexOf('$', i);
			if (a < 0) {
				out.push({ text: s.slice(i) });
				break;
			}
			const b = s.indexOf('$', a + 1);
			if (b < 0) {
				out.push({ text: s.slice(i) });
				break;
			}
			if (a > i) out.push({ text: s.slice(i, a) });
			let html;
			try {
				html = katex.renderToString(s.slice(a + 1, b), { displayMode: false, throwOnError: false, strict: 'ignore' });
			} catch {
				html = s.slice(a + 1, b);
			}
			out.push({ html });
			i = b + 1;
		}
		return out;
	});
</script>

{#each parts as part, i (i)}{#if part.html}<span class="m">{@html part.html}</span>{:else}{part.text}{/if}{/each}

<style>
	.m :global(.katex) {
		font-size: 1.04em;
	}
</style>
