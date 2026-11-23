import { implicantMinterms, implicantSize, popcount } from './minimize';
import { literals, posTex, productTex, sopTex, sumTex } from './expression';

/**
 * "Show the method" content for the Karnaugh tool: the same p()/eq() blocks
 * as the other tools' explain modules, walking through why the map works,
 * every prime implicant on it, which ones are essential and why, how the
 * leftover cells are covered, and how the result becomes gates. Written to
 * be readable on its own, with this map's actual cells and terms in it.
 */

function p(text) {
	return { type: 'p', text };
}
function eq(tex) {
	return { type: 'eq', tex };
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

export function explainSolution({ n, names, form, result, gates }) {
	const active = form === 'sop' ? result.sop : result.pos;
	const oneWord = form === 'sop' ? '1' : '0';
	const complement = form === 'pos';
	const termOf = (imp) => (form === 'sop' ? productTex(literals(imp, n, names)) : sumTex(literals(imp, n, names, { complement: true })));
	const cellsOf = (imp) => implicantMinterms(imp, n).join(', ');
	const P = (i) => `P_{${i + 1}}`;

	const blocks = [
		p(
			`A Karnaugh map is the truth table folded so that neighbours differ by one variable. Each cell is one minterm, one row of the truth table; its number is the binary value of the variables read in order, so with ${names.join(', ')} the cell numbered ${Math.min(6, (1 << n) - 1)} is ${codeWord(Math.min(6, (1 << n) - 1), n, names)}. Rows and columns are numbered in Gray code (00, 01, 11, 10), where consecutive codes differ in exactly one bit and the sequence closes on itself: the last column is next to the first, the last row next to the first. So two cells that touch, including across the outer edges, differ in exactly one variable.`
		),
		p('That is what makes grouping legal. Two touching ones share every variable but one, and that one takes both of its values inside the pair, so it drops out:'),
		eq('XY + X\\overline{Y} = X\\,(Y + \\overline{Y}) = X'),
		p(
			'A rectangle of 4 touching ones repeats the trick twice and drops two variables, 8 drops three, and so on: a group of 2^k cells is one product term of the n - k variables that keep the same value everywhere in it. Bigger groups mean fewer literals, groups may overlap, and they may wrap around the edges. A don\'t-care cell (X) may be counted as a one or a zero, whichever makes a group bigger, and never has to be covered.'
		)
	];
	if (complement) {
		blocks.push(
			p(
				'For a product of sums the same is done on the zeros: a group of zeros is a product term of the complement of F, and De Morgan turns each such product into one sum term of F itself (every literal flipped, products becoming sums). The steps below therefore group the zeros.'
			)
		);
	}

	if (active.constant !== null) {
		const value = complement ? 1 - active.constant : active.constant;
		blocks.push(
			p(
				value === 1
					? 'Every cell of the map is a one or a don\'t-care, so the whole map is a single group with no variable kept: the function is the constant 1 and needs no gate at all.'
					: 'No cell of the map is a one, so there is nothing to group: the function is the constant 0 and needs no gate at all.'
			),
			eq(`F = ${value}`)
		);
		return blocks;
	}

	// --- step 1: prime implicants
	blocks.push(
		p(
			`Step 1, the prime implicants: every group of ${oneWord}s (and Xs) that cannot be made any bigger. A group that is not prime sits inside a bigger one costing fewer literals, so only primes are worth considering. Pairing single cells that differ in one variable, then pairs into quads, quads into octets, and keeping whatever cannot pair any further (the Quine-McCluskey tabulation) finds all of them. On this map there ${active.primes.length === 1 ? 'is one' : `are ${active.primes.length}`}:`
		)
	);
	active.primes.forEach((imp, i) => {
		blocks.push(eq(`${P(i)} = ${termOf(imp)} \\qquad \\text{cells } ${cellsOf(imp)}\\ \\ (${implicantSize(imp, n)}\\text{ cell${implicantSize(imp, n) > 1 ? 's' : ''}, } ${popcount(imp.mask)}\\text{ literal${popcount(imp.mask) === 1 ? '' : 's'})}`));
	});

	// --- step 2: essentials
	if (active.essentialIdx.length) {
		blocks.push(
			p(
				`Step 2, the essential primes: a ${oneWord} that only one prime covers forces that prime into the answer, because nothing else could ever cover that cell. Here:`
			)
		);
		for (const i of active.essentialIdx) {
			const only = active.chart.filter(({ by }) => by.length === 1 && by[0] === i).map(({ m }) => m);
			blocks.push(eq(`${P(i)} = ${termOf(active.primes[i])} \\text{ is essential: it alone covers cell${only.length > 1 ? 's' : ''} } ${only.join(', ')}`));
		}
	} else {
		blocks.push(p(`Step 2, the essential primes: none here. Every ${oneWord} is covered by at least two primes, so the whole choice is made in step 3.`));
	}

	// --- step 3: leftovers and Petrick
	if (active.remaining.length === 0) {
		blocks.push(
			p(`Step 3: the essential primes already cover every ${oneWord}, so they are the whole answer. Adding any other prime would only add literals without covering anything new.`)
		);
	} else {
		const sums = active.remaining.map((m) =>
			active.primes
				.map((imp, i) => ({ imp, i }))
				.filter(({ imp, i }) => !active.essentialIdx.includes(i) && (m & imp.mask) === (imp.value & imp.mask))
				.map(({ i }) => i)
		);
		const product = sums.map((s) => `(${s.map(P).join(' + ')})`).join('');
		blocks.push(
			p(
				`Step 3: cell${active.remaining.length > 1 ? 's' : ''} ${active.remaining.join(', ')} ${active.remaining.length > 1 ? 'are' : 'is'} still uncovered. Each one needs at least one of the primes that cover it, and all of those conditions must hold at the same time, which reads as a product of sums over the primes (Petrick's method). Multiplying it out and dropping any option that contains another lists every way to finish the cover:`
			),
			eq(product + (active.petrick && active.petrick.options ? ` = ${active.petrick.options.slice(0, 6).map((opt) => opt.map(P).join('')).join(' + ')}${active.petrick.options.length > 6 ? ' + \\cdots' : ''}` : ''))
		);
		const chosen = active.petrick ? active.petrick.best : [];
		blocks.push(
			p(
				active.petrick && active.petrick.exact
					? `Every option is a valid finish; the cheapest one, fewest primes first and fewest literals as the tie-break, is ${chosen.map((i) => `P${i + 1}`).join(' with ')}${chosen.length > 1 ? '' : ' alone'}.`
					: `The options list grew too large to enumerate here, so the leftover cells were covered greedily (largest group first): ${chosen.map((i) => `P${i + 1}`).join(', ')}. The result is valid, though minimality is not guaranteed in that case.`
			)
		);
	}

	// --- result
	const sop = sopTex(result.sop.cover, n, names);
	if (form === 'sop') {
		blocks.push(
			p(`Putting the chosen primes together, ${active.coverIdx.map((i) => `P${i + 1}`).join(' + ')}, gives the minimal sum of products:`),
			eq(`F = ${sop}`)
		);
	} else {
		blocks.push(
			p(`Putting the chosen primes together gives the minimal sum of products of the complement:`),
			eq(`\\overline{F} = ${sopTex(result.pos.cover, n, names)}`),
			p('De Morgan, applied to the whole expression, turns the sum of products into a product of sums with every literal flipped:'),
			eq(`F = \\overline{\\overline{F}} = ${posTex(result.pos.cover, n, names)}`)
		);
	}

	// --- circuit
	if (gates) blocks.push(p(circuitText(active.cover.map((imp) => literals(imp, n, names, { complement })), gates, form)));
	return blocks;
}

/** "1 gate", "2 gates", "0 inverters": a count and its word. */
const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;

/**
 * The circuit paragraph of the method, for every shape the form can take:
 * two terms or more (a first-level gate for each term of two literals or
 * more, into the second-level gate, a single-literal term wired straight to
 * it), one term of several literals (its first-level gate is F, no second
 * level), one single literal (F itself, or the output of its inverter).
 * `terms` the form's terms as literals ({ name, negated }), `gates`
 * gateCount's count of them.
 */
function circuitText(terms, gates, form) {
	const [term, whole, level1, level2, only] = form === 'sop' ? ['product', 'sum', 'AND', 'OR', 'NAND'] : ['sum', 'product', 'OR', 'AND', 'NOR'];
	const lead = 'Reading the expression as a circuit:';
	if (terms.length === 1 && terms[0].length === 1) {
		const l = terms[0][0];
		return l.negated
			? `${lead} F is the single literal ${l.name}', which needs no AND or OR gate, only the inverter that makes it from ${l.name}: 1 gate in total.`
			: `${lead} F is the single literal ${l.name}, the input itself, which needs no gate at all: 0 gates in total.`;
	}
	const inverters = gates.inverters ? [`${plural(gates.inverters, 'inverter')} (one per variable that appears complemented, shared by every term that needs it)`] : [];
	if (terms.length === 1) {
		return `${lead} the single ${term} term is an ${level1} gate whose output is F; with one term there is no second level. This one needs ${[...inverters, `1 ${level1} gate`].join(', ')}: ${plural(gates.total, 'gate')} in total.`;
	}
	const singles = terms.some((t) => t.length === 1);
	const parts = [...inverters, ...(gates.first ? [`${plural(gates.first, `${level1} gate`)} (one per term with two or more literals)`] : []), `1 ${level2} gate combining the terms`];
	const needs = `This one needs ${parts.join(', ')}: ${plural(gates.total, 'gate')} in total.`;
	const after = gates.inverters ? ' after the inverters' : '';
	// (every term a single literal: no first level, the second-level gate alone is F)
	if (!gates.first) {
		return `${lead} every term is a single literal, a wire straight to the ${level2} gate that makes the ${whole}, whose output is F: one level of logic${after}. ${needs} The same circuit can be built from one ${only} gate fed with every literal complemented.`;
	}
	return `${lead} each ${term} term of two literals or more is an ${level1} gate and the ${whole} is an ${level2} gate, two levels of logic${after}${singles ? `; a single-literal term is a wire straight to the ${level2} gate` : ''}. ${needs} The same circuit can be built from ${only} gates only by adding a bubble at every first-level output and every second-level input, which cancel in pairs${singles ? '; a single-literal term, having no first-level gate, then goes to the second level complemented' : ''}.`;
}

/**
 * The note under the circuit (panel 04), for every shape the form can take
 * (as circuitText): `gates` gateCount's count, `terms` the form's terms as
 * literals ({ name, negated }, [] for a constant), `constant` F's value when
 * the form is a constant, else null.
 */
export function circuitNote({ gates, terms, constant }) {
	if (constant !== null) return `A constant output needs no gate: tie F to ${constant === 1 ? 'the supply' : 'ground'}.`;
	const dots = 'A dot is a connection; wires that merely cross are not connected.';
	if (terms.length === 1 && terms[0].length === 1) {
		const l = terms[0][0];
		return `${l.negated ? `1 inverter and no other gate: F is ${l.name}', the inverter's output.` : `No gate: F is the input ${l.name} itself.`} ${dots}`;
	}
	const inverters = plural(gates.inverters, 'inverter');
	if (terms.length === 1) return `${inverters}, 1 ${gates.firstType} gate, whose output is F. ${dots}`;
	const singles = terms.some((t) => t.length === 1) ? ` Single-literal terms go straight to the ${gates.secondType} gate.` : '';
	return `${inverters}, ${plural(gates.first, `${gates.firstType} gate`)}, 1 ${gates.secondType} gate. ${dots}${singles}`;
}

/** "0110 = A'BCD'" style reading of a minterm number. */
function codeWord(m, n, names) {
	const bits = m.toString(2).padStart(n, '0');
	const term = bits
		.split('')
		.map((b, i) => (b === '1' ? names[i] : `${names[i]}'`))
		.join('');
	return `${bits} = ${term}`;
}
