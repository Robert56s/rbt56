// Runs the guide simulations inside Falstad's simulator and checks what it
// reports. Open https://www.falstad.com/circuit/circuitjs.html in a browser,
// paste this file into the console (it defines window.falstadSuite), then
// call  await falstadSuite(<the JSON from scripts/falstad-suite.mjs>).
// Each variant is loaded with CircuitJS1.importCircuit, run, and read back
// with getElements() / getInfo(), the simulator's own API for embedding.
// Returns one line per variant: ok, or what failed.
//
// Expectations (see src/lib/transistors/circuits.js):
//   { tag, has }                 a word of the element's info, e.g. its region
//   { tag, field, near, tol }    a reading within tol (relative) of near
//   { tag, field, below }        a reading under `below` in size
//   sampled over about a second of running (`samples` readings 9 ms
//   apart, 120 by default), from the reading `sample` (default V):
//   { tag, mean, tol }           the mean, within tol (absolute)
//   { tag, swing, tol }          half the peak-to-peak, within tol (relative)
//   { tag, reach: [lo, hi] }     goes under lo and over hi at some point
//   { tag, maxBelow } { tag, maxAbove }   the largest value seen
(() => {
	// CircuitJS writes micro with the Greek letter mu (U+03BC), not the micro sign
	const PREFIX = { p: 1e-12, n: 1e-9, 'μ': 1e-6, 'µ': 1e-6, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 };
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	// "Ic = 9.552 mA" -> 0.009552; returns null when the field is absent
	function reading(info, field) {
		for (const line of info) {
			const m = new RegExp(`^${field} = (-?[0-9.]+(?:e-?[0-9]+)?) ?([pnμµumkMG]?)`).exec(line);
			if (m) return Number(m[1]) * (PREFIX[m[2]] ?? 1);
		}
		return null;
	}

	// nodes that only one post touches: a part left hanging
	function dangling(els) {
		const seen = new Map();
		els.forEach((e, i) => {
			(e.nodes || []).forEach((n, k) => {
				if (!seen.has(n)) seen.set(n, []);
				seen.get(n).push(`${e.getType().replace('Elm', '')}#${i}.${k}`);
			});
		});
		const out = [];
		for (const [n, posts] of seen) if (!n.internal && n.links_0.arrayList.array.length < 2) out.push(posts.join(' '));
		return out;
	}

	const SAMPLED = ['mean', 'swing', 'reach', 'maxBelow', 'maxAbove'];

	window.falstadSuite = async (suite) => {
		const sim = window.CircuitJS1;
		const results = [];
		for (const item of suite) {
			// a simulator that stopped on an error stays stopped through an
			// import, so stop it cleanly first
			sim.setSimRunning(false);
			sim.importCircuit(item.text, false);
			sim.setSimRunning(true);
			await sleep(item.settle ?? 1500);
			const els = sim.getElements();
			const fails = [];
			if (!sim.isRunning()) fails.push('the simulation stopped (an error in the circuit)');
			const hang = dangling(els);
			if (hang.length) fails.push(`dangling: ${hang.join(', ')}`);
			for (const ex of item.expect) {
				const el = els[item.tags[ex.tag]];
				if (!el) {
					fails.push(`no element ${ex.tag}`);
					continue;
				}
				if (ex.has) {
					const info = el.getInfo();
					if (!info.some((l) => l.toLowerCase().includes(ex.has.toLowerCase()))) fails.push(`${ex.tag} is not "${ex.has}": ${info.join(' | ')}`);
				}
				if (ex.field && ex.near !== undefined) {
					const v = reading(el.getInfo(), ex.field);
					if (v === null || Math.abs(v - ex.near) > Math.abs(ex.near) * ex.tol) fails.push(`${ex.tag} ${ex.field} = ${v}, wanted ${ex.near} +/- ${100 * ex.tol} %`);
				}
				if (ex.field && ex.below !== undefined) {
					const v = reading(el.getInfo(), ex.field);
					if (v === null || Math.abs(v) > ex.below) fails.push(`${ex.tag} ${ex.field} = ${v}, wanted under ${ex.below}`);
				}
				if (SAMPLED.some((k) => ex[k] !== undefined)) {
					const field = ex.sample ?? 'V';
					const vs = [];
					for (let i = 0; i < (ex.samples ?? 120); i++) {
						vs.push(reading(el.getInfo(), field));
						await sleep(9);
					}
					const ok = vs.filter((v) => v !== null);
					if (!ok.length) {
						fails.push(`${ex.tag} has no reading ${field}: ${el.getInfo().join(' | ')}`);
						continue;
					}
					const lo = Math.min(...ok);
					const hi = Math.max(...ok);
					const mean = ok.reduce((a, b) => a + b, 0) / ok.length;
					const half = (hi - lo) / 2;
					const at = `${ex.tag} ${field}`;
					if (ex.mean !== undefined && Math.abs(mean - ex.mean) > ex.tol) fails.push(`${at} mean ${mean.toFixed(3)}, wanted ${ex.mean} +/- ${ex.tol}`);
					if (ex.swing !== undefined && Math.abs(half - ex.swing) > ex.swing * ex.tol) fails.push(`${at} swing ${half.toFixed(4)}, wanted ${ex.swing} +/- ${100 * ex.tol} %`);
					if (ex.reach && !(lo <= ex.reach[0] && hi >= ex.reach[1])) fails.push(`${at} spans ${lo.toPrecision(3)} to ${hi.toPrecision(3)}, wanted past ${ex.reach[0]} and ${ex.reach[1]}`);
					if (ex.maxBelow !== undefined && !(hi < ex.maxBelow)) fails.push(`${at} peaks at ${hi.toPrecision(4)}, wanted under ${ex.maxBelow}`);
					if (ex.maxAbove !== undefined && !(hi > ex.maxAbove)) fails.push(`${at} peaks at ${hi.toPrecision(4)}, wanted over ${ex.maxAbove}`);
				}
			}
			results.push(`${fails.length ? 'FAIL' : 'ok  '} ${item.id}[${item.variant}] ${JSON.stringify(item.set)}${fails.length ? ': ' + fails.join('; ') : ''}`);
		}
		return results.join('\n');
	};
	return 'falstadSuite ready';
})();
