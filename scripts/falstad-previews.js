// Redraws the schematic previews of the guide's simulations
// (static/guides/transistors/<id>.svg) with Falstad's own renderer.
//
// 1. node --import ./scripts/resolve-ext.mjs scripts/falstad-suite.mjs --previews > list.json
//    (one entry per circuit: { id, text })
// 2. node scripts/falstad-receiver.mjs   (listens on localhost:7789)
// 3. Open https://www.falstad.com/circuit/circuitjs.html?whiteBackground=true,
//    paste this file into the console, then: await falstadPreviews(<list.json>)
//    The page draws each circuit (no scopes, no sliders, no voltage colours),
//    exports it with CircuitJS1.getCircuitAsSVG(), trims the SVG, and hands
//    the set to the receiver by navigating to it with the data in the
//    address (a page on falstad.com cannot post to localhost directly).
(() => {
	function compress(svg) {
		const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
		const root = doc.documentElement;
		const W = root.getAttribute('width');
		const H = root.getAttribute('height');
		root.querySelectorAll('rect').forEach((r) => {
			if (r.getAttribute('fill') === '#ffffff') r.remove();
		});
		const drop = ['paint-order', 'stroke-miterlimit', 'stroke-dasharray', 'font-style', 'font-weight', 'text-decoration', 'stroke-linecap'];
		for (const el of root.querySelectorAll('*')) {
			for (const a of drop) el.removeAttribute(a);
			if (el.getAttribute('stroke-width') === '3') el.removeAttribute('stroke-width');
			if (el.tagName === 'path' && el.getAttribute('fill') === 'none') el.removeAttribute('fill');
			if (el.getAttribute('stroke') === '#000000') el.removeAttribute('stroke');
			if (el.tagName === 'text') {
				el.removeAttribute('font-family');
				el.removeAttribute('font-size');
				el.removeAttribute('stroke');
				if (el.getAttribute('fill') === '#000000') el.removeAttribute('fill');
			}
			for (const a of ['d', 'transform', 'x', 'y']) {
				const v = el.getAttribute(a);
				if (v) el.setAttribute(a, v.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10)).replace(/\s+/g, ' ').trim());
			}
		}
		root.querySelectorAll('defs').forEach((d) => d.remove());
		let body = new XMLSerializer().serializeToString(root);
		body = body.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/ xmlns="[^"]*"/g, '').replace(/<g><text[^>]*\/><\/g>/g, '');
		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none" stroke="#1d2025" stroke-width="2.5" stroke-linecap="round" font-family="Roboto,Arial,sans-serif" font-size="12"><style>text{fill:#1d2025;stroke:none}</style>${body}</svg>`;
	}

	window.falstadPreviews = async (list, receiver = 'http://localhost:7789/') => {
		const sim = window.CircuitJS1;
		const out = {};
		for (const item of list) {
			// header flag 4 hides the voltage colours; scopes and sliders are left out
			const text = item.text
				.split('\n')
				.filter((l) => !/^(o|38) /.test(l))
				.join('\n')
				.replace(/^\$ 1 /, '$ 4 ');
			sim.setSimRunning(false);
			sim.importCircuit(text, false);
			await new Promise((r) => setTimeout(r, 300));
			let got = null;
			sim.onsvgrendered = (s, svg) => {
				got = svg;
			};
			sim.getCircuitAsSVG();
			for (let i = 0; i < 40 && !got; i++) await new Promise((r) => setTimeout(r, 100));
			if (got) out[item.id] = compress(got);
		}
		location.href = receiver + '#' + encodeURIComponent(JSON.stringify(out));
		return Object.keys(out).length;
	};
	return 'falstadPreviews ready';
})();
