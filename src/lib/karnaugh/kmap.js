import { covers } from './minimize';

/**
 * Karnaugh-map geometry: which minterm sits in which cell, and how an
 * implicant (a group) lands on the grid, including groups that wrap around
 * the edges.
 *
 * The map's rows and columns are labelled in Gray code, so that any two
 * neighbouring cells (including across the outer edges) differ in exactly
 * one variable. That is the whole point of the map: a rectangle of 2^k
 * neighbouring ones is a group in which k variables take every value, so
 * those k variables cancel out (XY + XY' = X) and the group is one product
 * term of the n - k variables that stay constant across it.
 */

/** Gray code sequence for `bits` bits: 0, 1, 3, 2 for two bits (00 01 11 10). */
export function gray(bits) {
	const out = [];
	for (let i = 0; i < 1 << bits; i++) out.push(i ^ (i >> 1));
	return out;
}

/** Row/column split of n variables: the first floor(n/2) variables index the rows, the rest the columns. */
export function layout(n) {
	const rowBits = Math.floor(n / 2);
	const colBits = n - rowBits;
	return {
		n,
		rowBits,
		colBits,
		rows: gray(rowBits),
		cols: gray(colBits),
		rowVars: Array.from({ length: rowBits }, (_, i) => i),
		colVars: Array.from({ length: colBits }, (_, i) => rowBits + i)
	};
}

export function cellMinterm(lay, r, c) {
	return (lay.rows[r] << lay.colBits) | lay.cols[c];
}

export function mintermCell(lay, m) {
	const rowCode = m >> lay.colBits;
	const colCode = m & ((1 << lay.colBits) - 1);
	return { r: lay.rows.indexOf(rowCode), c: lay.cols.indexOf(colCode) };
}

/** Binary string of a code on `bits` bits, most significant first (the header text of a row or column). */
export function codeBits(code, bits) {
	return code.toString(2).padStart(bits, '0');
}

/** Maximal runs of consecutive indices in a sorted index set, e.g. {0, 3} on 4 -> [[0,0],[3,3]]. */
function runs(indices) {
	const sorted = [...indices].sort((a, b) => a - b);
	const out = [];
	for (const i of sorted) {
		const last = out[out.length - 1];
		if (last && last[1] === i - 1) last[1] = i;
		else out.push([i, i]);
	}
	return out;
}

/**
 * Where an implicant sits on the map: the covered cells always form a
 * rows-set times columns-set product, and each set is one or two runs of
 * consecutive indices (two when the group wraps around an edge). The pieces
 * are all the row-run by column-run rectangles; wrapRows/wrapCols say on
 * which axis the group continues across the outer edge.
 */
export function implicantPieces(lay, imp) {
	const rowSet = new Set();
	const colSet = new Set();
	const cells = [];
	for (let m = 0; m < 1 << lay.n; m++) {
		if (!covers(imp, m)) continue;
		const { r, c } = mintermCell(lay, m);
		rowSet.add(r);
		colSet.add(c);
		cells.push(m);
	}
	const rowRuns = runs(rowSet);
	const colRuns = runs(colSet);
	const wrapRows = rowRuns.length > 1 && rowSet.has(0) && rowSet.has(lay.rows.length - 1);
	const wrapCols = colRuns.length > 1 && colSet.has(0) && colSet.has(lay.cols.length - 1);
	const pieces = [];
	for (const [r0, r1] of rowRuns) for (const [c0, c1] of colRuns) pieces.push({ r0, r1, c0, c1 });
	return { cells, pieces, wrapRows, wrapCols };
}
