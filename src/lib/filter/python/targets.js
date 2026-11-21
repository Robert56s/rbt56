import { comment, PY_WIDTH, pyRaise } from './emit';
import { sideLead } from './order';

/**
 * Section 4, second half: the target of every stage of one side, as the
 * page's ideal design has them (lowPassAt and designHighPass in stages.js):
 * v('stages'), a list of dicts { circuit, f0, q, fz } in Hz, highest Q
 * first, the first-order stage of an odd order last ({ circuit, f0 }, f0 =
 * 1 / (2 pi tau)). `circuit` names the Python circuit the stage is built
 * with (side.circuits: its rule in 5, its H(s) in 6). A Tow-Thomas notch
 * also takes `gain`, the size of its gain far above the zero
 * (towThomasNotch.js).
 */
export function targets(file, side) {
	const { v, circuits } = side;
	const hp = side.type === 'highpass';
	const zeros = Boolean(circuits.notch);
	const stages = v('stages');
	const wc = v('wc');
	const real = v('real');
	const { lead, heading } = sideLead(side);
	const f0 = hp ? `${wc} / math.sqrt(b) / (2 * math.pi)` : `${wc} * math.sqrt(b) / (2 * math.pi)`;
	const fz = hp ? `${wc} / math.sqrt(z) / (2 * math.pi)` : `${wc} * math.sqrt(z) / (2 * math.pi)`;
	// (a band filter's second side of the same response: its formulas alone, the words said above)
	const lead1 = side.like ? `Its stages, as for the ${side.like}` : 'Each section s^2 + a s + b becomes a stage';
	const lines = [
		comment(
			hp
				? `${lead1}, with s -> ${wc} / s${zeros ? ' (its zero z too)' : ''}:\n    f0 = ${wc} / (2 pi sqrt(b)),  Q = sqrt(b) / a${zeros ? `,  fz = ${wc} / (2 pi sqrt(z))` : ''}${circuits.real ? `\nand the real pole a first-order stage at f0 = ${wc} / (2 pi ${real}).` : ''}`
				: `${lead1}, with s -> s / ${wc}${zeros ? ' (its zero z too)' : ''}:\n    f0 = ${wc} sqrt(b) / (2 pi),  Q = sqrt(b) / a${zeros ? `,  fz = ${wc} sqrt(z) / (2 pi)` : ''}${circuits.real ? `\nand the real pole a first-order stage at f0 = ${wc} ${real} / (2 pi).` : ''}`
		),
		`${stages} = []  # the target of each stage, highest Q first`
	];
	if (zeros) {
		// (a Tow-Thomas notch also takes the size of the gain it is built for far above its zero,
		// towThomasNotch.js: 1 on a high-pass, (f0 / fz)^2 on a low-pass for its gain of 1 at DC)
		const open = `    ${stages}.append({`;
		const gain = circuits.notch === 'tow_thomas_notch' ? `,\n${' '.repeat(open.length)}"gain": ${hp ? '1.0' : '(f0 / fz) ** 2'}` : '';
		if (gain) lines[0] += `\n${comment(hp ? 'A Tow-Thomas notch holds its gain far above the zero at 1.' : 'A Tow-Thomas notch holds its gain at DC at 1: far above the zero its gain is then (f0 / fz)^2.')}`;
		// (a band side's longer names take "fz" on the next line, as "gain")
		const head = `${open}"circuit": "${circuits.notch}", "f0": f0, "q": math.sqrt(b) / a,`;
		const fits = `${head} "fz": fz${gain ? ',' : '})'}`.length <= PY_WIDTH;
		lines.push(`for a, b, z in ${v('sections')}:`, `    f0, fz = ${f0}, ${fz}`, `${head}${fits ? ' ' : `\n${' '.repeat(open.length)}`}"fz": fz${gain}})`);
	} else if (circuits.pair) {
		lines.push(`for a, b in ${v('sections')}:`, `    f0 = ${f0}`, `    ${stages}.append({"circuit": "${circuits.pair}", "f0": f0, "q": math.sqrt(b) / a})`);
	} else {
		// (an order of 1 has no pole pair, and the file no circuit for one: an order raised stops here)
		lines.push(`if ${v('sections')}:`, pyRaise('An order over 1 needs second-order stages: get the file again from the page for it.', '    '));
	}
	if (circuits.real) {
		lines.push(
			`if ${v('real')} is not None:`,
			hp ? `    ${stages}.append({"circuit": "${circuits.real}", "f0": ${wc} / ${v('real')} / (2 * math.pi)})` : `    ${stages}.append({"circuit": "${circuits.real}", "f0": ${wc} * ${v('real')} / (2 * math.pi)})`
		);
	}
	// (a side after another numbers its stages on from the other's: side.after, the name of its list; its
	// heading is placement's, just above)
	lines.push(side.after ? `for i, st in enumerate(${stages}, len(${side.after})):` : `for i, st in enumerate(${stages}):`);
	// (every pole pair of a prototype with zeros takes one: the real pole, the first-order stage, none)
	const pair = zeros
		? [`print(f"${lead}stage {i + 1}: f0 = {eng(st['f0'], 'Hz')}, Q = {st['q']:.4f},"`, `      f" fz = {eng(st['fz'], 'Hz')}")`]
		: [`print(f"${lead}stage {i + 1}: f0 = {eng(st['f0'], 'Hz')}, Q = {st['q']:.4f}")`];
	if (circuits.real) {
		lines.push('    if "q" in st:', ...pair.map((l) => `        ${l}`), '    else:', `        print(f"${lead}stage {i + 1}: first order, f0 = {eng(st['f0'], 'Hz')}")`);
	} else lines.push(...pair.map((l) => `    ${l}`));
	file.add(lines.join('\n'));
}
