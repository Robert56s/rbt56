// Correctness check of the Karnaugh engine.
//
//   node --import ./scripts/resolve-ext.mjs scripts/check-karnaugh.mjs
//
// 1. Known textbook cases must give the expected minimal expressions.
// 2. Random functions (with don't-cares) of 2 to 4 variables: the returned
//    SOP and POS covers must agree with the truth table on every minterm that
//    is not a don't-care, and no cheaper cover may exist (checked by brute
//    force over subsets of the prime implicants).
// Exits non-zero on the first failure.

import { covers, literalCount, minimize, minimizeBoth, popcount } from '../src/lib/karnaugh/minimize.js';
import { literals, posText, sopText } from '../src/lib/karnaugh/expression.js';
import { implicantPieces, layout } from '../src/lib/karnaugh/kmap.js';

let failures = 0;
const fail = (msg) => {
	failures++;
	console.log('FAIL', msg);
};

const NAMES = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------- known cases
const KNOWN = [
	{ n: 4, ones: [0, 2, 5, 7, 8, 10, 13, 15], dcs: [], sop: "B'D' + BD" },
	{ n: 4, ones: [1, 3, 7, 11, 15], dcs: [0, 2, 5], sop: "A'B' + CD" },
	{ n: 3, ones: [0, 1, 2, 5, 6, 7], dcs: [], sop: "A'B' + BC' + AC" },
	{ n: 2, ones: [1, 2], dcs: [], sop: "A'B + AB'" },
	{ n: 4, ones: [0, 2, 3, 5, 6, 7, 8, 9], dcs: [10, 11, 12, 13, 14, 15], terms: 4 },
	{ n: 4, ones: [], dcs: [], constant: 0 },
	{ n: 4, ones: Array.from({ length: 16 }, (_, i) => i), dcs: [], constant: 1 },
	{ n: 3, ones: [0, 1, 2, 3], dcs: [4, 5, 6, 7], constant: 1 }
];
for (const k of KNOWN) {
	const res = minimize(k.n, k.ones, k.dcs);
	const text = res.constant !== null ? String(res.constant) : sopText(res.cover, k.n, NAMES.slice(0, k.n));
	if (k.constant !== undefined) {
		if (res.constant !== k.constant) fail(`constant case ${JSON.stringify(k.ones)}: got ${text}`);
		else console.log('ok   constant', k.constant, 'for', k.n, 'vars');
		continue;
	}
	if (k.sop && text !== k.sop) fail(`known case ${JSON.stringify(k.ones)} d${JSON.stringify(k.dcs)}: got "${text}", expected "${k.sop}"`);
	else if (k.terms && res.cover.length !== k.terms) fail(`known case ${JSON.stringify(k.ones)}: ${res.cover.length} terms, expected ${k.terms}`);
	else console.log('ok  ', text);
}

// ------------------------------------------------------- random brute force
function evalSop(cover, m) {
	return cover.some((imp) => covers(imp, m));
}
function evalPos(complementCover, m) {
	// F = product over complement implicants of (NOT implicant covers m)
	return complementCover.every((imp) => !covers(imp, m));
}
function bruteMinimum(n, ones, res) {
	// smallest number of primes covering all ones, then fewest literals
	const primes = res.primes;
	const target = res.cover.length;
	const targetLits = literalCount(res.cover);
	const idx = primes.map((_, i) => i);
	let bestCount = Infinity;
	let bestLits = Infinity;
	const search = (start, chosen) => {
		if (chosen.length > target) return;
		if (chosen.length > bestCount) return;
		if (ones.every((m) => chosen.some((i) => covers(primes[i], m)))) {
			const lits = chosen.reduce((s, i) => s + popcount(primes[i].mask), 0);
			if (chosen.length < bestCount || (chosen.length === bestCount && lits < bestLits)) {
				bestCount = chosen.length;
				bestLits = lits;
			}
			return;
		}
		for (let i = start; i < idx.length; i++) search(i + 1, [...chosen, i]);
	};
	search(0, []);
	return { bestCount, bestLits, target, targetLits };
}

let seed = 12345;
const rnd = () => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed / 0x7fffffff;
};
let checked = 0;
for (let trial = 0; trial < 400; trial++) {
	const n = 2 + Math.floor(rnd() * 3);
	const total = 1 << n;
	const pOne = 0.2 + rnd() * 0.6;
	const pDc = rnd() * 0.25;
	const ones = [];
	const dcs = [];
	for (let m = 0; m < total; m++) {
		const r = rnd();
		if (r < pOne) ones.push(m);
		else if (r < pOne + pDc) dcs.push(m);
	}
	const { sop, pos } = minimizeBoth(n, ones, dcs);
	const names = NAMES.slice(0, n);
	// 1. functional correctness on every non-don't-care minterm
	for (let m = 0; m < total; m++) {
		if (dcs.includes(m)) continue;
		const want = ones.includes(m);
		const gotSop = sop.constant !== null ? sop.constant === 1 : evalSop(sop.cover, m);
		const gotPos = pos.constant !== null ? pos.constant === 0 : evalPos(pos.cover, m);
		if (gotSop !== want) fail(`SOP wrong at m=${m} for n=${n} ones=${ones} dcs=${dcs}: ${sopText(sop.cover, n, names)}`);
		if (gotPos !== want) fail(`POS wrong at m=${m} for n=${n} ones=${ones} dcs=${dcs}: ${posText(pos.cover, n, names)}`);
	}
	// 2. every cover member is a prime, and no cheaper cover exists
	if (sop.constant === null) {
		if (!sop.cover.every((imp) => sop.primes.includes(imp))) fail('cover contains a non-prime');
		if (sop.primes.length <= 18) {
			const b = bruteMinimum(n, ones, sop);
			if (b.bestCount < b.target || (b.bestCount === b.target && b.bestLits < b.targetLits)) {
				fail(`not minimal for n=${n} ones=${ones} dcs=${dcs}: got ${b.target} terms/${b.targetLits} lits, brute force ${b.bestCount}/${b.bestLits}`);
			}
		}
		// 3. map pieces: every covered cell lies in exactly one piece of its group
		const lay = layout(n);
		for (const imp of sop.cover) {
			const { cells, pieces } = implicantPieces(lay, imp);
			const inPieces = new Set();
			for (const pc of pieces) for (let r = pc.r0; r <= pc.r1; r++) for (let c = pc.c0; c <= pc.c1; c++) inPieces.add((lay.rows[r] << lay.colBits) | lay.cols[c]);
			if (inPieces.size !== cells.length || !cells.every((m) => inPieces.has(m))) fail(`pieces do not tile the group ${JSON.stringify(imp)} on n=${n}`);
		}
		// 4. literals never repeat a variable
		for (const imp of sop.cover) {
			const l = literals(imp, n, names);
			if (new Set(l.map((x) => x.index)).size !== l.length) fail('repeated variable in a term');
		}
	}
	checked++;
}
console.log(`random functions checked: ${checked} (truth table, minimality, map pieces)`);
console.log(failures === 0 ? 'karnaugh engine clean' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
