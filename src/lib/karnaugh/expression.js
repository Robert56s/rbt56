/**
 * Turning implicants into readable expressions: plain text (A'B + C) for
 * tables and downloads, KaTeX (\overline{A}B + C) for the page.
 *
 * A sum-of-products term comes from an implicant of the function itself: a
 * variable fixed to 1 is a plain literal, fixed to 0 a complemented one. A
 * product-of-sums term comes from an implicant of the COMPLEMENT: De Morgan
 * turns that product into a sum with every literal flipped, so there a
 * variable fixed to 1 becomes the complemented literal.
 */

function bitOf(n, i) {
	return 1 << (n - 1 - i);
}

/** The literals an implicant keeps, in variable order: [{ index, name, negated }]. */
export function literals(imp, n, names, { complement = false } = {}) {
	const out = [];
	for (let i = 0; i < n; i++) {
		const bit = bitOf(n, i);
		if (!(imp.mask & bit)) continue;
		const one = (imp.value & bit) !== 0;
		out.push({ index: i, name: names[i], negated: complement ? one : !one });
	}
	return out;
}

export function literalText(l) {
	return l.negated ? `${l.name}'` : l.name;
}

export function literalTex(l) {
	return l.negated ? `\\overline{${l.name}}` : l.name;
}

/** One product term: A'BC (text) or \overline{A}BC (tex). An implicant with no literal is the constant 1. */
export function productText(lits) {
	return lits.length ? lits.map(literalText).join('') : '1';
}
export function productTex(lits) {
	return lits.length ? lits.map(literalTex).join('') : '1';
}

/** One sum term: (A + B') / (A + \overline{B}). A term with no literal is the constant 0. */
export function sumText(lits) {
	return lits.length ? `(${lits.map(literalText).join(' + ')})` : '0';
}
export function sumTex(lits) {
	return lits.length ? `(${lits.map(literalTex).join(' + ')})` : '0';
}

/** Sum-of-products expression of a cover of the function's ones. */
export function sopText(cover, n, names) {
	if (cover.length === 0) return '0';
	return cover.map((imp) => productText(literals(imp, n, names))).join(' + ');
}
export function sopTex(cover, n, names) {
	if (cover.length === 0) return '0';
	return cover.map((imp) => productTex(literals(imp, n, names))).join(' + ');
}

/** Product-of-sums expression from a cover of the function's ZEROS (the complement's minimal SOP, De Morganed). */
export function posText(complementCover, n, names) {
	if (complementCover.length === 0) return '1';
	const terms = complementCover.map((imp) => literals(imp, n, names, { complement: true }));
	if (terms.some((t) => t.length === 0)) return '0';
	return terms.map(sumText).join('');
}
export function posTex(complementCover, n, names) {
	if (complementCover.length === 0) return '1';
	const terms = complementCover.map((imp) => literals(imp, n, names, { complement: true }));
	if (terms.some((t) => t.length === 0)) return '0';
	return terms.map(sumTex).join('');
}

/** Implicant as a pattern of 0/1/- over the variables, e.g. "1-0-" (the usual Quine-McCluskey notation). */
export function implicantPattern(imp, n) {
	let s = '';
	for (let i = 0; i < n; i++) {
		const bit = bitOf(n, i);
		s += imp.mask & bit ? ((imp.value & bit) !== 0 ? '1' : '0') : '-';
	}
	return s;
}

/** "Σm(1, 3, 5)" style list. */
export function mintermList(ms, symbol = 'm') {
	return ms.length ? `${symbol}(${ms.join(', ')})` : `${symbol}()`;
}
