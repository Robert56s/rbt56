// Shared by the check scripts: a drawing made with a real op-amp (TL082,
// LM741) held against the same design drawn with the ideal one. The
// five-pin drawing must wire every part exactly as the ideal drawing does
// (the same partition of pins into nets, the same names where names are
// drawn), put every op-amp on v++ and v--, add the two rail sources and
// nothing else, carry the part's subcircuit in place of LTspice's ideal
// op-amp library, and pass the audit.

import { parseSchematic } from '../src/lib/spice/core.js';
import { audit } from '../src/lib/spice/geometry.js';

export function realOpampProblems(idealAsc, realAsc, part) {
	const a = parseSchematic(idealAsc);
	const b = parseSchematic(realAsc);
	const problems = [...b.clashes, ...b.dangling];
	const extra = b.elements
		.filter((e) => !a.elements.some((x) => x.name === e.name))
		.map((e) => e.name)
		.sort()
		.join(',');
	if (extra !== 'VNEG,VPOS') problems.push(`parts added: ${extra || 'none'}`);
	const vpos = b.elements.find((e) => e.name === 'VPOS');
	const vneg = b.elements.find((e) => e.name === 'VNEG');
	if (!vpos || vpos.nodes.join(' ') !== 'v++ 0' || vpos.value !== '15') problems.push('VPOS is not +15 V on v++');
	if (!vneg || vneg.nodes.join(' ') !== 'v-- 0' || vneg.value !== '-15') problems.push('VNEG is not -15 V on v--');
	const map = new Map();
	const back = new Map();
	for (const x of a.elements) {
		const y = b.elements.find((e) => e.name === x.name);
		if (!y) {
			problems.push(`${x.name} missing`);
			continue;
		}
		if (x.kind !== y.kind) problems.push(`${x.name} is a ${y.kind}, not a ${x.kind}`);
		if (x.kind === 'OP') {
			if (y.value !== part) problems.push(`${x.name} is a ${y.value}, not a ${part}`);
			if (!y.rails || y.rails[0] !== 'v++' || y.rails[1] !== 'v--') problems.push(`${x.name} on ${y.rails ? y.rails.join(' and ') : 'no rails'}`);
		} else if (x.value !== y.value) problems.push(`${x.name} reads ${y.value}, not ${x.value}`);
		x.nodes.forEach((n, i) => {
			const m = y.nodes[i];
			if (map.has(n) && map.get(n) !== m) problems.push(`${x.name} pin ${i}: two nets of the ideal drawing joined`);
			if (back.has(m) && back.get(m) !== n) problems.push(`${x.name} pin ${i}: a net of the ideal drawing split`);
			map.set(n, m);
			back.set(m, n);
			if (!n.startsWith('_n') && n !== m) problems.push(`${x.name} pin ${i}: ${n} became ${m}`);
		});
	}
	if (!b.directives.some((d) => new RegExp(`^\\.SUBCKT ${part}\\b`, 'i').test(d))) problems.push(`no ${part} subcircuit`);
	if (b.directives.includes('.lib opamp.sub')) problems.push('still loads opamp.sub');
	return { problems, issues: audit(realAsc) };
}
