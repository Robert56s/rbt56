// Writes every simulation variant of the guides as JSON, for the checks
// that run inside Falstad's simulator itself: each variant is the circuit
// text, the indices of its tagged elements, and what the running
// simulator must report. The checks are run by pasting the JSON into
// scripts/falstad-runner.js on a falstad.com page (see that file).
//   node --import ./scripts/resolve-ext.mjs scripts/falstad-suite.mjs [ids...] > suite.json
import { CIRCUITS } from '../src/lib/transistors/circuits.js';

// --previews: one entry per circuit, its starting state, for scripts/falstad-previews.js
if (process.argv.includes('--previews')) {
	process.stdout.write(JSON.stringify(Object.entries(CIRCUITS).map(([id, s]) => ({ id, text: s.build().toText() }))));
	process.exit(0);
}

const only = process.argv.slice(2);
const out = [];
for (const [id, s] of Object.entries(CIRCUITS)) {
	if (only.length && !only.includes(id)) continue;
	for (const [k, check] of (s.checks ?? []).entries()) {
		const c = s.build(check.set ?? {});
		out.push({ id, variant: k, set: check.set ?? {}, text: c.toText(), tags: c.tags, expect: check.expect, settle: check.settle ?? 1500 });
	}
}
process.stdout.write(JSON.stringify(out));
