// Correctness check of the Karnaugh engine and of karnaugh-solver.py, the
// page's Python download (src/lib/karnaugh/python.js).
//
//   npm run check:karnaugh   (node --import ./scripts/resolve-ext.mjs scripts/check-karnaugh.mjs)
//
// 1. Known textbook cases must give the expected minimal expressions.
// 2. Random functions (with don't-cares) of 2 to 4 variables: the returned
//    SOP and POS covers must agree with the truth table on every minterm that
//    is not a don't-care, and no cheaper cover may exist (checked by brute
//    force over subsets of the prime implicants).
// 3. The page's greedy fallback never runs: every function of 2 to 4
//    variables has 13 primes at most, so Petrick's options (subsets of them)
//    stay under minimize.js's PETRICK_LIMIT. The file has no fallback.
// 4. karnaugh-solver.py through the harness scripts/lib-python.mjs, on a
//    matrix of functions: the page on opening, every example of the page, 2,
//    3 and 4 variables with and without don't cares, the constants (0, 1,
//    every cell a don't care), Petrick's method with ties, with more than 6
//    options and where the page's text order of options picks another cover
//    than a numeric order would, primes that hold only don't cares, the
//    variable names edited (and names the file cannot write: not ASCII, a ',
//    a name twice):
//    (a) the text: ASCII, parses for Python 3.8, no library API newer than
//        3.8, imports itertools and textwrap only, no function defined twice,
//        lines of 100 characters at most, no tab, no trailing space, the word
//        rules (no you/your, no word of a class, no placeholders)
//    (b) the run: python -W error on a strict cp1252 console, to its end,
//        its printout in lines of 88 characters at most
//    (c) the results, read through runpy: the SETTINGS the page's (its names,
//        or A, B, C, D where it cannot write them, its cells), the ones, zeros
//        and don't cares, and for each form the primes in the page's order,
//        the essential primes, the cells left, Petrick's options, the cover
//        and its terms equal to minimize.js minimizeBoth's; the page's forms
//        written as its own terms; the file's check of both forms equal to an
//        evaluation of their terms in JavaScript, to the library's own
//        evaluation of the same covers (covers()) and to the page's counts
//        (terms, literals, gateCount's gates)
//    (d) the printout, line for line, built here from the page's engine: the
//        map (kmap.js), each round of Quine-McCluskey, each prime with its
//        term and cells, the chart, the essential primes, Petrick's sums and
//        options and the cheapest, both forms with their counts (the texts
//        sopText and posText), the gates, the check's table and sentences
//    (e) the guards: names that are not 2 to 4 distinct names without ', a
//        cell off the map, and names that the page's forms no longer use stop
//        the file with their messages; names renamed with the page's forms
//        still run
//    (f) edited settings: another function in SETTINGS gives that function's
//        forms (minimizeBoth's), and the page's forms checked against it, with
//        the sentence that says why they differ (wrong, not minimal, another
//        form as cheap)
// 5. A sweep of random functions (with random names) run in one Python
//    process: (c) and (d) for each, its covers minimal by brute force, and
//    the same file run again with another function in its SETTINGS.
// 6. The page: the "Download karnaugh-solver.py" button under the paragraph
//    presenting the file, the file of the function on the map, no trace of
//    the JavaScript script on the page or its method sheet, codegen.js gone.
// Then the matrix covered. Exits non-zero on any failure.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gateCount } from '../src/lib/karnaugh/circuit.js';
import { implicantPattern, literals, posText, productText, sopText, sumText } from '../src/lib/karnaugh/expression.js';
import { cellMinterm, codeBits, implicantPieces, layout } from '../src/lib/karnaugh/kmap.js';
import { covers, implicantMinterms, literalCount, minimize, minimizeBoth, popcount, primeImplicants } from '../src/lib/karnaugh/minimize.js';
import { fileNames, generateKarnaughPython } from '../src/lib/karnaugh/python.js';
import { editSetting, cleanup, inspect, readResults, runFile } from './lib-python.mjs';

const started = Date.now();
let failures = 0;
let passes = 0;
const fail = (msg) => {
	failures++;
	console.log('FAIL', msg);
};
/** One check of parts 3 to 6: counted, and printed when it fails. */
const check = (label, ok, detail) => {
	if (ok) passes++;
	else fail(`${label}${detail ? `  (${detail})` : ''}`);
	return ok;
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

/* ------------------------------------------------ 3. the page's greedy fallback */
// minimize.js falls back to a greedy cover when Petrick's options pass PETRICK_LIMIT. The options are
// sets of primes that are not essential, so 2^(the most primes a function has) bounds them; the primes
// depend on the ones and the don't cares together only, so every function of n variables, read as its
// ones, has them all.
let mostPrimes = 0;
{
	const source = readFileSync(new URL('../src/lib/karnaugh/minimize.js', import.meta.url), 'utf8');
	const limit = Number(/const PETRICK_LIMIT = (\d+);/.exec(source)?.[1]);
	for (const n of [2, 3, 4]) {
		for (let f = 1; f < 1 << (1 << n); f++) {
			const cells = [];
			for (let m = 0; m < 1 << n; m++) if (f & (1 << m)) cells.push(m);
			mostPrimes = Math.max(mostPrimes, primeImplicants(n, cells, []).primes.length);
		}
	}
	check(
		`the page's greedy fallback never runs: every function of 2 to 4 variables has ${mostPrimes} primes at most, so at most ${2 ** mostPrimes} options, under PETRICK_LIMIT ${limit}`,
		mostPrimes === 13 && 2 ** mostPrimes < limit
	);
}

/* --------------------------------------------------- 4. karnaugh-solver.py */

{
	const v = spawnSync('python', ['--version'], { encoding: 'utf8' });
	if (v.error || v.status !== 0) {
		console.log('check:karnaugh needs Python 3.8 or newer on PATH as `python` for karnaugh-solver.py.');
		process.exit(1);
	}
	console.log(v.stdout.trim());
}

const YOU = /\b(you|your|yours|yourself)\b/i;
const PLACEHOLDER = /\bundefined\b|\bNaN\b|\bnull\b|\bInfinity\b|\[object/;
const COURSE = /\b(course|courses|cours|school|professors?|prof|slides?|diapos?|labs?|lectures?|ELE\s?2003|polytechnique|experiments?|moodle|homework|assignments?|teachers?|instructors?)\b/i;
const IMPORTS = new Set(['itertools', 'textwrap']);
const RESULTS = ['n', 'ones', 'zeros', 'dcs', 'sop', 'pos', 'page_sop', 'page_pos', 'own_check', 'page_check'];
const SETTINGS = ['names', 'minterms', 'dont_cares'];
const PRINT_WIDTH = 88;

/*
 * The sweep's driver, run by python -I -W error: `batch.py <list.json> <names>` runs each file of the
 * list through runpy, its printout captured and encoded as cp1252, and prints one line of JSON: for each
 * file its stop (SystemExit's message, or an error's type and message), the names listed read back, its
 * printout.
 */
const BATCH = `import contextlib
import io
import json
import runpy
import sys

names = sys.argv[2].split(",")
with open(sys.argv[1], encoding="utf-8") as f:
    paths = json.load(f)
out = []
for path in paths:
    buf = io.StringIO()
    entry = {"stop": None, "results": {}}
    try:
        with contextlib.redirect_stdout(buf):
            g = runpy.run_path(path, run_name="__main__")
        entry["results"] = {k: g[k] for k in names if k in g}
    except (SystemExit, Exception) as e:
        entry["stop"] = str(e.code) if isinstance(e, SystemExit) else f"{type(e).__name__}: {e}"
    entry["stdout"] = buf.getvalue()
    try:
        entry["stdout"].encode("cp1252")
    except UnicodeEncodeError as e:
        entry["stop"] = f"the printout is not cp1252: {e}"
    out.append(entry)
print(json.dumps(out))
`;

/** Where the text of a file breaks a rule of (a), [] when it keeps them all. */
function textProblems(code) {
	const out = [];
	code.split('\n').forEach((line, i) => {
		if (line.length > 100) out.push(`line ${i + 1} has ${line.length} characters`);
		if (/\t/.test(line)) out.push(`line ${i + 1} has a tab`);
		if (/\s$/.test(line)) out.push(`line ${i + 1} ends in a space`);
	});
	for (const [name, re] of [['you/your', YOU], ['a placeholder', PLACEHOLDER], ['a word of a class', COURSE]]) {
		const m = re.exec(code);
		if (m) out.push(`${name}: "${code.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')}"`);
	}
	return out;
}

const literalTextOf = (l) => (l.negated ? `${l.name}'` : l.name);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The cost of a form's terms (lists of literals, ' a complement), as the file and the page count them: gateCount's rule. */
function costOf(terms) {
	const inverters = new Set(terms.flatMap((t) => t.filter((v) => v.endsWith("'")).map((v) => v.slice(0, -1)))).size;
	const first = terms.filter((t) => t.length >= 2).length;
	const second = terms.length >= 2 ? 1 : 0;
	return { terms: terms.filter((t) => t.length).length, literals: terms.reduce((s, t) => s + t.length, 0), inverters, first, second, gates: inverters + first + second };
}

/** The cells a form's terms get wrong on the truth table, read in JavaScript: a sum of products, or a product of sums. */
function wrongOf(key, terms, names, ones, dcs) {
	const n = names.length;
	const literal = (v, m) => {
		const negated = v.endsWith("'");
		const i = names.indexOf(negated ? v.slice(0, -1) : v);
		const bit = (m >> (n - 1 - i)) & 1;
		return negated ? bit === 0 : bit === 1;
	};
	const value = (m) => (key === 'sop' ? terms.some((t) => t.every((v) => literal(v, m))) : terms.every((t) => t.some((v) => literal(v, m))));
	const wrong = [];
	for (let m = 0; m < 1 << n; m++) if (!dcs.includes(m) && value(m) !== ones.includes(m)) wrong.push(m);
	return wrong;
}

/**
 * The page for a function: its names as the file writes them, the cells,
 * minimizeBoth's result, and each form as the page shows it (its terms as
 * the file writes them, its text, its counts and gateCount's gates).
 */
function viewOf(pageNames, ones, dcs) {
	const n = pageNames.length;
	const result = minimizeBoth(n, ones, dcs);
	const { names, replaced } = fileNames(pageNames);
	const forms = ['sop', 'pos'].map((key) => {
		const r = result[key];
		const complement = key === 'pos';
		const constant = r.constant !== null;
		const lits = r.cover.map((imp) => literals(imp, n, names, { complement }));
		return {
			key,
			r,
			constant,
			name: complement ? 'product of sums' : 'sum of products',
			word: complement ? 'zeros' : 'ones',
			terms: lits.map((ls) => ls.map(literalTextOf)),
			text: complement ? posText(r.cover, n, names) : sopText(r.cover, n, names),
			count: { terms: constant ? 0 : r.cover.length, literals: constant ? 0 : literalCount(r.cover) },
			gates: gateCount(constant ? [] : lits, names, key),
			termText: (imp) => (complement ? sumText(literals(imp, n, names, { complement })) : productText(literals(imp, n, names)))
		};
	});
	return { n, pageNames, names, replaced, ones: result.sop.ones, zeros: result.pos.ones, dcs: result.sop.dontCares, result, forms };
}

/** The page's forms of a view as the file writes them, { sop, pos } lists of terms, and the covers they come from (covers.sop, covers.pos). */
const pageFormsOf = (view) => ({ sop: view.forms[0].terms, pos: view.forms[1].terms, covers: { sop: view.result.sop.cover, pos: view.result.pos.cover } });

/** The cells a cover gets wrong on the truth table, by the library's own evaluation (evalSop, evalPos: covers()). */
function libraryWrong(key, cover, ones, dcs, n) {
	const wrong = [];
	for (let m = 0; m < 1 << n; m++) if (!dcs.includes(m) && (key === 'sop' ? evalSop(cover, m) : evalPos(cover, m)) !== ones.includes(m)) wrong.push(m);
	return wrong;
}

/**
 * The file's results against the page's view, [] when they agree. `page`
 * is the page's forms written in the file (another function's when the
 * SETTINGS were edited).
 */
function resultProblems(r, view, page) {
	const out = [];
	const n = view.n;
	if (r.n !== n) out.push(`n ${r.n} against ${n}`);
	for (const key of ['ones', 'zeros', 'dcs']) if (!same(r[key], view[key])) out.push(`${key} ${JSON.stringify(r[key])} against ${JSON.stringify(view[key])}`);
	for (const f of view.forms) {
		const got = r[f.key] ?? {};
		const want = {
			constant: f.constant,
			primes: f.constant ? [] : f.r.primes.map((p) => implicantPattern(p, n)),
			essential: f.constant ? [] : f.r.essentialIdx,
			left: f.constant ? [] : f.r.remaining,
			options: f.r.petrick ? f.r.petrick.options : null,
			chosen: f.constant ? [] : f.r.coverIdx,
			cover: f.r.cover.map((p) => implicantPattern(p, n)),
			terms: f.terms
		};
		for (const [k, v] of Object.entries(want)) if (!same(got[k], v)) out.push(`${f.key}.${k} ${JSON.stringify(got[k])} against ${JSON.stringify(v)}`);
		// the file's check of its own form: right everywhere, the page's counts and gates
		const own = r.own_check?.[f.key];
		const wantOwn = { wrong: wrongOf(f.key, f.terms, view.names, view.ones, view.dcs), ...f.count, inverters: f.gates.inverters, first: f.gates.first, second: f.gates.second, gates: f.gates.total };
		if (wantOwn.wrong.length) out.push(`${f.key}: the page's engine's own form is wrong on ${wantOwn.wrong}`);
		if (!same(own, wantOwn)) out.push(`own_check.${f.key} ${JSON.stringify(own)} against ${JSON.stringify(wantOwn)}`);
		// the file's check of the page's form: an evaluation of its terms in JavaScript, and their cost
		const terms = page[f.key];
		const wantPage = { wrong: wrongOf(f.key, terms, view.names, view.ones, view.dcs), ...costOf(terms) };
		if (!same(r.page_check?.[f.key], wantPage)) out.push(`page_check.${f.key} ${JSON.stringify(r.page_check?.[f.key])} against ${JSON.stringify(wantPage)}`);
		// both checks against the library's own evaluation of the same covers
		const libOwn = libraryWrong(f.key, f.r.cover, view.ones, view.dcs, n);
		const libPage = libraryWrong(f.key, page.covers[f.key], view.ones, view.dcs, n);
		if (!same(own?.wrong, libOwn) || !same(r.page_check?.[f.key]?.wrong, libPage)) out.push(`${f.key}: the cells wrong ${JSON.stringify([own?.wrong, r.page_check?.[f.key]?.wrong])} against the library's ${JSON.stringify([libOwn, libPage])}`);
		if (!same(r[`page_${f.key}`], terms)) out.push(`page_${f.key} ${JSON.stringify(r[`page_${f.key}`])} against ${JSON.stringify(terms)}`);
	}
	return out;
}

/** The printout's lines with the ones say() broke joined again (a line 4 spaces deeper than the one it goes on from). */
function unwrapped(stdout) {
	const out = [];
	let depth = -1;
	for (const line of stdout.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) {
		const lead = /^ */.exec(line)[0].length;
		if (out.length && lead === depth + 4) out[out.length - 1] += ` ${line.trim()}`;
		else {
			out.push(line);
			depth = lead;
		}
	}
	return out;
}

/**
 * The printout the file must give for a view, line for line, built from the
 * page's engine: `page` the page's forms written in the file.
 */
function expectedPrintout(view, page) {
	const { n, names, ones, zeros, dcs, forms } = view;
	const L = [];
	const list = (xs) => xs.join(', ') || 'none';
	const P = (i) => `P${i + 1}`;
	L.push('1 The function', `  ${'ones'.padEnd(13)}${list(ones)}`, `  ${'zeros'.padEnd(13)}${list(zeros)}`, `  ${"don't cares".padEnd(13)}${list(dcs)}`);
	const lay = layout(n);
	L.push(`  the map, ${lay.rowVars.map((i) => names[i]).join('')} down the side and ${lay.colVars.map((i) => names[i]).join('')} across:`);
	L.push(' '.repeat(8) + lay.cols.map((c) => codeBits(c, lay.colBits).padStart(4)).join(''));
	lay.rows.forEach((code, r) => {
		const cells = lay.cols.map((_, c) => cellMinterm(lay, r, c)).map((m) => (ones.includes(m) ? '1' : dcs.includes(m) ? 'X' : '0').padStart(4));
		L.push(codeBits(code, lay.rowBits).padStart(8) + cells.join(''));
	});
	L.push('2 The prime implicants (Quine-McCluskey)');
	for (const f of forms) {
		if (f.constant) {
			L.push(`  ${f.name}: F = ${f.text}, a constant`);
			continue;
		}
		L.push(`  ${f.name}, from the ${f.word}${dcs.length ? " and the don't cares" : ''}:`, '    size  groups  new groups  primes');
		for (const r of f.r.rounds) L.push(`    ${String(r.size).padStart(4)}${String(r.candidates.length).padStart(8)}${String(r.merges.length).padStart(12)}${String(r.kept.length).padStart(8)}`);
		f.r.primes.forEach((imp, i) => L.push(`    ${P(i).padEnd(4)}${implicantPattern(imp, n)}  ${f.termText(imp)}, cells ${implicantMinterms(imp, n).join(', ')}`));
	}
	L.push('3 The prime implicant chart and the essential primes');
	for (const f of forms) {
		if (f.constant) {
			L.push(`  ${f.name}: a constant, no chart`);
			continue;
		}
		L.push(`  ${f.name}, an x where a prime holds the cell:`, ' '.repeat(8) + f.r.ones.map((m) => String(m).padStart(3)).join(''));
		f.r.primes.forEach((imp, i) => L.push(`    ${P(i).padEnd(4)}${f.r.ones.map((m) => (covers(imp, m) ? '  x' : '   ')).join('')}`.trimEnd()));
		for (const i of f.r.essentialIdx) L.push(`    ${P(i)} is essential, alone on ${f.r.chart.filter(({ by }) => by.length === 1 && by[0] === i).map(({ m }) => m).join(', ')}`);
		if (!f.r.essentialIdx.length) L.push('    no prime is essential: every cell is held by two primes or more');
		L.push(`    left: ${list(f.r.remaining)}`);
	}
	L.push("4 The cover of what is left (Petrick's method)");
	for (const f of forms) {
		if (f.constant) L.push(`  ${f.name}: a constant, nothing left`);
		else if (!f.r.remaining.length) L.push(`  ${f.name}: no cell left, the essential primes are the cover`);
		else {
			const { primes, essentialIdx, remaining, petrick } = f.r;
			const sums = remaining.map((m) => primes.map((_, i) => i).filter((i) => !essentialIdx.includes(i) && covers(primes[i], m)));
			const lits = (o) => o.reduce((s, i) => s + popcount(primes[i].mask), 0);
			const best = petrick.best;
			const ties = petrick.options.filter((o) => o.length === best.length && lits(o) === lits(best)).length;
			L.push(`  ${f.name}, the primes each cell left needs, then the options:`);
			L.push(`    ${sums.map((s) => `(${s.map(P).join(' + ')})`).join('')}`);
			L.push(`    = ${petrick.options.slice(0, 6).map((o) => o.map(P).join('')).join(' + ')}${petrick.options.length > 6 ? ' + ...' : ''}`);
			L.push(`    the cheapest: ${best.map(P).join('')}, primes ${best.length}, literals ${lits(best)}${ties > 1 ? `, the first of ${ties} as cheap` : ''}`);
		}
	}
	L.push('5 The minimal sum of products and product of sums');
	for (const f of forms) {
		L.push(`  ${f.name}, ${f.constant ? 'a constant' : f.r.coverIdx.map(P).join(' + ')}: terms ${f.count.terms}, literals ${f.count.literals}`);
		if (f.key === 'pos' && !f.constant) L.push(`    F' = ${sopText(f.r.cover, n, names)}`);
		L.push(`    F = ${f.text}`);
	}
	L.push('6 The two-level circuits', `${' '.repeat(19)}inverters  first level  second level  gates`);
	for (const f of forms) {
		const g = f.gates;
		L.push(`  ${f.name.padEnd(15)}${String(g.inverters).padStart(11)}${`${g.first} ${g.firstType}`.padStart(13)}${`${g.second} ${g.secondType}`.padStart(14)}${String(g.total).padStart(7)}`);
	}
	L.push('7 The check', `${' '.repeat(33)}truth table  terms  literals  gates`);
	const checks = forms.map((f) => {
		const own = { wrong: wrongOf(f.key, f.terms, names, ones, dcs), ...costOf(f.terms) };
		const theirs = { wrong: wrongOf(f.key, page[f.key], names, ones, dcs), ...costOf(page[f.key]) };
		return { f, own, theirs };
	});
	for (const { f, own, theirs } of checks) {
		for (const [who, c] of [["the file's", own], ["the page's", theirs]]) {
			const verdict = c.wrong.length ? `${c.wrong.length} wrong` : 'right';
			L.push(`  ${`${f.name}, ${who}`.padEnd(31)}${verdict.padEnd(11)}${String(c.terms).padStart(7)}${String(c.literals).padStart(10)}${String(c.gates).padStart(7)}`);
		}
	}
	for (const { f, own, theirs } of checks) L.push(`  The page's ${f.name} ${outcomeOf(f, own, theirs, page).why}.`);
	return L;
}

/** How the page's form of `f` fares against the file's: 'same', 'wrong', 'not minimal' or 'as cheap', and the file's words for it. */
function outcomeOf(f, own, theirs, page) {
	if (same(page[f.key], f.terms)) return { kind: 'same', why: "is the file's, term for term" };
	if (theirs.wrong.length) return { kind: 'wrong', why: `is wrong on ${theirs.wrong.join(', ')}: not a form of this function` };
	if (theirs.terms > own.terms || (theirs.terms === own.terms && theirs.literals > own.literals)) return { kind: 'not minimal', why: 'is right but not minimal for this function' };
	return { kind: 'as cheap', why: 'is another minimal form, as cheap' };
}

/** The first difference between a printout and the lines it must hold, [] when they agree. */
function printoutProblems(stdout, view, page) {
	const got = unwrapped(stdout);
	const want = expectedPrintout(view, page);
	for (let i = 0; i < Math.max(got.length, want.length); i++) {
		if (got[i] !== want[i]) return [`line ${i + 1}: "${got[i] ?? '(none)'}" against "${want[i] ?? '(none)'}"`];
	}
	return [];
}

/** The file's covers are minimal: no set of its primes covers its cells with fewer terms, or as few with fewer literals. */
function minimalProblems(r, view) {
	const out = [];
	for (const f of view.forms) {
		if (f.constant) continue;
		const b = bruteMinimum(f.r.n, f.r.ones, f.r);
		const lits = r[f.key].cover.reduce((s, p) => s + p.replace(/-/g, '').length, 0);
		if (b.bestCount < r[f.key].cover.length || (b.bestCount === r[f.key].cover.length && b.bestLits < lits)) out.push(`${f.key}: ${r[f.key].cover.length} terms and ${lits} literals, brute force ${b.bestCount} and ${b.bestLits}`);
	}
	return out;
}

/** What the designs cover of the matrix, by dimension. */
const covered = new Map();
const cover = (dimension, value) => (covered.get(dimension) ?? covered.set(dimension, new Set()).get(dimension)).add(value);

/** The dimensions one function covers. */
function record(view, label) {
	const { n, ones, zeros, dcs, forms, replaced, pageNames } = view;
	cover('variables', `${n} variables, ${dcs.length ? 'with' : 'without'} don't cares`);
	if (forms[0].constant) cover('constant', !ones.length && !zeros.length ? 'every cell a don\'t care' : !ones.length ? `F = 0${dcs.length ? ", don't cares" : ''}` : `F = 1${dcs.length ? ", don't cares" : ''}`);
	if (replaced) cover('names', /[^\x20-\x7e]/.test(pageNames.join('')) ? 'not ASCII, replaced' : pageNames.some((v) => v.includes("'")) ? "a ', replaced" : 'a name twice, replaced');
	else if (!same(pageNames, NAMES.slice(0, n))) cover('names', pageNames.some((v) => v.length > 1) ? 'edited, longer than one letter' : 'edited, one letter each');
	else cover('names', 'the page\'s defaults');
	for (const f of forms) {
		if (f.constant) continue;
		const p = f.r.petrick;
		if (!p) cover('petrick', 'nothing left after the essential primes');
		else {
			const lits = (o) => o.reduce((s, i) => s + popcount(f.r.primes[i].mask), 0);
			const ties = p.options.filter((o) => o.length === p.best.length && lits(o) === lits(p.best)).length;
			cover('petrick', ties > 1 ? 'ties at the cheapest' : 'one cheapest option');
			if (p.options.length > 6) cover('petrick', 'more than 6 options');
		}
		if (f.r.primes.some((imp) => !f.r.ones.some((m) => covers(imp, m)))) cover('primes', "a prime that holds don't cares only");
		if (!f.r.essentialIdx.length) cover('primes', 'no essential prime');
	}
	if (label) cover('label', label);
}

/** The page's examples, read from the page (EXAMPLES in +page.svelte). */
const PAGE = readFileSync(new URL('../src/routes/(site)/tools/karnaugh/+page.svelte', import.meta.url), 'utf8');
const EXAMPLES = [...PAGE.matchAll(/\{ label: '([^']+)', n: (\d), ones: (\[[\d, ]*\]), dcs: (\[[\d, ]*\]) \}/g)].map((m) => ({ label: m[1], n: Number(m[2]), ones: JSON.parse(m[3]), dcs: JSON.parse(m[4]) }));
check(`the page's examples read from the page: ${EXAMPLES.length}`, EXAMPLES.length === 4);

/** The cases where the page's text order of options ("0,10" before "0,9") picks another cover than a numeric order: the first few among the 4-variable functions with 11 primes or more, split into ones and don't cares. */
function textOrderCases(count) {
	const out = [];
	for (let f = 1; f < 1 << 16 && out.length < count; f++) {
		const g = [];
		for (let m = 0; m < 16; m++) if (f & (1 << m)) g.push(m);
		if (primeImplicants(4, g, []).primes.length < 11) continue;
		for (let s = 1; s < 1 << g.length && out.length < count; s++) {
			const ones = g.filter((_, k) => s & (1 << k));
			const dcs = g.filter((_, k) => !(s & (1 << k)));
			for (const r of Object.values(minimizeBoth(4, ones, dcs))) {
				if (r.constant !== null || !r.petrick) continue;
				const lits = (o) => o.reduce((sum, i) => sum + popcount(r.primes[i].mask), 0);
				const ties = r.petrick.options.filter((o) => o.length === r.petrick.best.length && lits(o) === lits(r.petrick.best));
				// (the ties in numeric order, prime by prime: 9 before 10)
				const byNumber = (a, b) => {
					const i = a.findIndex((x, k) => x !== b[k]);
					return i < 0 ? 0 : a[i] - b[i];
				};
				const numeric = [...ties].sort(byNumber)[0];
				if (numeric.join() !== r.petrick.best.join()) {
					out.push({ ones, dcs });
					break;
				}
			}
		}
	}
	return out;
}

const N3 = NAMES.slice(0, 3);
const N2 = NAMES.slice(0, 2);
const ALL = (k) => Array.from({ length: 1 << k }, (_, i) => i);
const MATRIX = [
	["the page on opening, an empty map", NAMES, [], []],
	...EXAMPLES.map((e) => [`the page's example ${e.label}`, NAMES.slice(0, e.n), e.ones, e.dcs]),
	['2 variables, XOR', N2, [1, 2], []],
	["2 variables, AB with a don't care", N2, [3], [0]],
	['2 variables, F = 1', N2, ALL(2), []],
	["2 variables, every cell a don't care", N2, [], ALL(2)],
	["3 variables, with a don't care", N3, [1, 5], [3]],
	["3 variables, F = 1 with don't cares", N3, [0, 1, 2, 3], [4, 5, 6, 7]],
	["3 variables, F = 0 with don't cares", N3, [], [1, 2]],
	['4 variables, XOR, 8 terms of 4 literals', NAMES, [1, 2, 4, 7, 8, 11, 13, 14], []],
	['4 variables, F = 1', NAMES, ALL(4), []],
	['4 variables, more than 6 options', NAMES, [1, 2, 4, 15], []],
	['4 variables, ties at the cheapest', NAMES, [1, 2, 4, 5, 6, 7, 8, 10, 11], []],
	["4 variables, a prime of don't cares only", NAMES, [0, 1, 2, 3, 5, 7, 8, 15], [6, 9, 10, 11, 12, 13, 14]],
	...textOrderCases(3).map((c, i) => [`4 variables, the page's text order of options decides (${i + 1})`, NAMES, c.ones, c.dcs]),
	['names edited, one letter each', ['X', 'Y', 'Z', 'W'], [0, 2, 5, 7, 8, 10, 13, 15], []],
	['names edited, x1 to x3', ['x1', 'x2', 'x3'], [0, 1, 2, 5, 6, 7], []],
	['names edited, two letters', ['in', 'en'], [1, 2], []],
	['names edited, three letters, long lines broken', ['abc', 'def', 'ghi', 'jkl'], [1, 2, 4, 7, 8, 11, 13, 14], []],
	['names edited, a quote, a backslash and a space', ['p"q', 'r\\s', 'u v'], [1, 3, 4, 6], [7]],
	['names not ASCII, replaced', ['α', 'β', 'C', 'D'], [1, 3, 7, 11, 15], [0, 2, 5]],
	['a name twice, replaced', ['A', 'A', 'C'], [0, 1, 2, 5, 6, 7], []],
	["a name with a ', replaced", ["A'", 'B'], [1, 2], []]
];

let defaultLines = null;
let matrixRuns = 0;

/** Every check of one function of the matrix: (a) to (d). Returns the file, or null. */
function checkFunction([label, pageNames, ones, dcs]) {
	const view = viewOf(pageNames, ones, dcs);
	const name = `karnaugh-solver.py, ${label}`;
	let code;
	try {
		code = generateKarnaughPython({ names: pageNames, ones, dcs, result: view.result });
	} catch (e) {
		check(`${name}: the generator writes the file`, false, e.message);
		return null;
	}
	matrixRuns++;
	record(view, label.startsWith("the page's example") ? 'every example of the page' : label.startsWith('the page on opening') ? 'the page on opening' : label.includes('text order') ? "the page's text order of options" : null);
	if (label.startsWith('the page on opening')) defaultLines = code.split('\n').length - 1;
	// (a) the text
	const shape = inspect(code);
	check(`${name}: ASCII`, shape.ascii);
	check(`${name}: parses for Python 3.8`, shape.parse38 === null, shape.parse38);
	check(`${name}: no library API newer than 3.8`, shape.newer.length === 0, shape.newer.join(', '));
	check(`${name}: imports itertools and textwrap only`, shape.imports.every((m) => IMPORTS.has(m)), shape.imports.join(', '));
	check(`${name}: no function defined twice`, shape.twice.length === 0, shape.twice.join(', '));
	const text = textProblems(code);
	check(`${name}: lines and words`, text.length === 0, text.slice(0, 3).join('; '));
	// (b) the run
	const run = runFile(code);
	check(`${name}: runs with python -W error`, run.status === 0 && run.stderr === '', run.stderr.slice(-600));
	const wide = run.stdout.split(/\r?\n/).filter((l) => l.length > PRINT_WIDTH);
	check(`${name}: printout lines of ${PRINT_WIDTH} characters or less`, wide.length === 0, wide[0]);
	// (c) the results
	const read = readResults(code, SETTINGS);
	const r = read.results;
	check(`${name}: every result read`, read.stop === null && read.missing.length === 0, read.stop ?? read.missing.join(', '));
	const settings = [];
	if (!same(r.names, view.names)) settings.push(`names ${JSON.stringify(r.names)} against ${JSON.stringify(view.names)}`);
	if (!same(r.minterms, ones) || !same(r.dont_cares, dcs)) settings.push(`cells ${JSON.stringify([r.minterms, r.dont_cares])} against ${JSON.stringify([ones, dcs])}`);
	if (view.replaced !== /The page's names cannot all be written here/.test(code)) settings.push(`the names replaced ${view.replaced}, said ${!view.replaced}`);
	check(`${name}: its settings the page's (names${view.replaced ? ', replaced by A, B, C, D' : ''}, cells)`, settings.length === 0, settings.join('; '));
	const results = resultProblems(r, view, pageFormsOf(view));
	check(`${name}: results the page's (cells, primes, essentials, cells left, options, covers, terms, both checks)`, results.length === 0, results.slice(0, 3).join('; '));
	// (d) the printout
	const printout = printoutProblems(run.stdout, view, pageFormsOf(view));
	check(`${name}: printout, line for line, the page's method`, printout.length === 0, printout[0]);
	return { code, view };
}

const runs = MATRIX.map(checkFunction);

// (e) the guards, on the page's first example: names that are not 2 to 4 distinct names without ', a cell
// off the map, names its page forms no longer use; names renamed with the page's forms still run
{
	const first = runs[1];
	const GUARDS = [
		['names', '["A", "B", "C", "D", "E"]', /^names needs 2 to 4 variables, each its own name with no ' in it\.$/],
		['names', '["A", "B", "B", "D"]', /^names needs 2 to 4 variables/],
		['names', `["A'", "B", "C", "D"]`, /^names needs 2 to 4 variables/],
		['minterms', '[0, 2, 16]', /^Cell 16 is not on a map of 4 variables \(0 to 15\)\.$/],
		['dont_cares', '[-1]', /^Cell -1 is not on a map of 4 variables/],
		['names', '["W", "X", "Y", "Z"]', /^The page's forms use B, which names no longer has: edit page_sop and page_pos to match\.$/]
	];
	for (const [setting, value, message] of GUARDS) {
		const edited = readResults(editSetting(first.code, setting, value));
		check(`guards: ${setting} = ${value} stops the file with its message`, edited.stop !== null && message.test(edited.stop), edited.stop ?? 'it ran on');
		cover('guards', setting === 'names' && value.startsWith('["W"') ? "names the page's forms no longer use" : setting === 'names' ? 'names' : 'a cell off the map');
	}
	// (names and the page's forms renamed together: the same function, the same forms under the new names)
	let renamed = editSetting(first.code, 'names', '["W", "X", "Y", "Z"]');
	renamed = editSetting(renamed, 'page_sop', `[["X'", "Z'"], ["X", "Z"]]  # products, summed`);
	renamed = editSetting(renamed, 'page_pos', `[["X", "Z'"], ["X'", "Z"]]  # sums, multiplied`);
	const run = runFile(renamed);
	const view = viewOf(['W', 'X', 'Y', 'Z'], first.view.ones, first.view.dcs);
	const problems = run.status === 0 ? printoutProblems(run.stdout, view, pageFormsOf(view)) : [run.stderr.slice(-300)];
	check("guards: names renamed with the page's forms run on, the page's forms the file's under the new names", problems.length === 0, problems[0]);
	cover('guards', "names renamed with the page's forms");
}

// (f) edited settings: another function in SETTINGS gives that function's forms and the page's forms checked
// against it, with the sentence saying why they differ. The edits: a cell more (the page's forms wrong), and
// the first single don't care added to an example that makes its forms not minimal, or leaves another form
// as cheap.
{
	const outcomes = new Set();
	const tryEdit = (base, ones, dcs, label) => {
		const view = viewOf(base.view.pageNames, ones, dcs);
		const page = pageFormsOf(base.view);
		let code = editSetting(base.code, 'minterms', JSON.stringify(ones).replace(/,/g, ', '));
		code = editSetting(code, 'dont_cares', JSON.stringify(dcs).replace(/,/g, ', '));
		const run = runFile(code);
		const read = readResults(code);
		const problems = [...(run.status === 0 ? [] : [run.stderr.slice(-300)]), ...resultProblems(read.results, view, page), ...printoutProblems(run.stdout, view, page)];
		const kinds = view.forms.map((f) => outcomeOf(f, { ...costOf(f.terms) }, { wrong: wrongOf(f.key, page[f.key], view.names, view.ones, view.dcs), ...costOf(page[f.key]) }, page).kind);
		check(`edited settings: ${label}: that function's forms, and the page's checked against it (${kinds.join(', ')})`, problems.length === 0, problems[0]);
		for (const k of kinds) outcomes.add(k);
		return kinds;
	};
	const ex1 = runs[1];
	tryEdit(ex1, [...ex1.view.ones, 1].sort((a, b) => a - b), ex1.view.dcs, `example ${EXAMPLES[0].label} with cell 1 a one`);
	for (const wanted of ['not minimal', 'as cheap']) {
		let found = false;
		for (const base of runs.slice(1, 1 + EXAMPLES.length)) {
			for (const m of base.view.zeros) {
				const view = viewOf(base.view.pageNames, base.view.ones, [...base.view.dcs, m].sort((a, b) => a - b));
				const page = pageFormsOf(base.view);
				const kinds = view.forms.map((f) => outcomeOf(f, costOf(f.terms), { wrong: wrongOf(f.key, page[f.key], view.names, view.ones, view.dcs), ...costOf(page[f.key]) }, page).kind);
				if (kinds.includes(wanted)) {
					tryEdit(base, base.view.ones, [...base.view.dcs, m].sort((a, b) => a - b), `example ${EXAMPLES[runs.indexOf(base) - 1].label} with cell ${m} a don't care`);
					found = true;
					break;
				}
			}
			if (found) break;
		}
		check(`edited settings: an edit of an example found that leaves the page's form ${wanted}`, found);
	}
	for (const k of outcomes) cover('outcome', k);
}

/* ------------------------------------------------------------- 5. the sweep */
// Random functions of 2 to 4 variables, with and without don't cares, with random names, each file run in
// one Python process (python -I -W error, runpy, the printout captured and encoded as cp1252): its results
// and its printout the page's, its covers minimal by brute force; and the same file run again with another
// function of as many variables in its SETTINGS, its forms that function's and the page's checked against it.
const SWEEP = 500;
{
	const pool = [NAMES, ['P', 'Q', 'R', 'S'], ['x0', 'x1', 'x2', 'x3'], ['in', 'clk', 'en', 'rst'], ['a-b', 'c-d', 'e f', 'g'], ['A', 'B', 'A', 'C'], ['é', 'B', 'C', 'D']];
	const randomFunction = (n) => {
		const pOne = 0.15 + rnd() * 0.7;
		const pDc = rnd() < 0.4 ? 0 : rnd() * 0.35;
		const ones = [];
		const dcs = [];
		for (let m = 0; m < 1 << n; m++) {
			const x = rnd();
			if (x < pOne) ones.push(m);
			else if (x < pOne + pDc) dcs.push(m);
		}
		return { ones, dcs };
	};
	const dir = mkdtempSync(join(tmpdir(), 'rbt56-karnaugh-'));
	const cases = [];
	for (let k = 0; k < SWEEP; k++) {
		const n = 2 + Math.floor(rnd() * 3);
		const names = pool[Math.floor(rnd() * pool.length)].slice(0, n);
		const { ones, dcs } = randomFunction(n);
		const view = viewOf(names, ones, dcs);
		const code = generateKarnaughPython({ names, ones, dcs, result: view.result });
		const other = randomFunction(n);
		const edited = editSetting(editSetting(code, 'minterms', JSON.stringify(other.ones).replace(/,/g, ', ')), 'dont_cares', JSON.stringify(other.dcs).replace(/,/g, ', '));
		const otherView = viewOf(names, other.ones, other.dcs);
		writeFileSync(join(dir, `f${k}.py`), code);
		writeFileSync(join(dir, `e${k}.py`), edited);
		cases.push({ view, page: pageFormsOf(view), file: `f${k}.py` }, { view: otherView, page: pageFormsOf(view), file: `e${k}.py`, edited: true });
		record(view, null);
	}
	writeFileSync(join(dir, 'list.json'), JSON.stringify(cases.map((c) => join(dir, c.file))));
	writeFileSync(join(dir, 'batch.py'), BATCH);
	const t0 = Date.now();
	const run = spawnSync('python', ['-I', '-W', 'error', join(dir, 'batch.py'), join(dir, 'list.json'), RESULTS.join(',')], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
	const seconds = (Date.now() - t0) / 1000;
	let entries = [];
	if (check('the sweep: the batch runs', run.status === 0, run.stderr?.slice(-600))) entries = JSON.parse(run.stdout);
	const tally = { files: 0, edited: 0, stops: [], results: [], printout: [], minimal: [], wide: [] };
	entries.forEach((e, i) => {
		const c = cases[i];
		const where = `${c.file} (${c.view.n} variables, ones ${c.view.ones}, don't cares ${c.view.dcs}, names ${c.view.pageNames})`;
		if (c.edited) tally.edited++;
		else tally.files++;
		if (e.stop !== null) return tally.stops.push(`${where}: ${e.stop}`);
		const rp = resultProblems(e.results, c.view, c.page);
		if (rp.length) tally.results.push(`${where}: ${rp[0]}`);
		const pp = printoutProblems(e.stdout, c.view, c.page);
		if (pp.length) tally.printout.push(`${where}: ${pp[0]}`);
		const mp = minimalProblems(e.results, c.view);
		if (mp.length) tally.minimal.push(`${where}: ${mp[0]}`);
		const wide = e.stdout.split('\n').find((l) => l.length > PRINT_WIDTH);
		if (wide) tally.wide.push(`${where}: ${wide}`);
	});
	const count = `${tally.files} files and ${tally.edited} edited`;
	check(`the sweep: ${count} run to their end, the printout cp1252`, entries.length === cases.length && tally.stops.length === 0, tally.stops[0] ?? `${entries.length} of ${cases.length} run`);
	check(`the sweep: ${count}, results the page's (primes, essentials, options, covers, terms; both forms through the truth table)`, tally.results.length === 0, `${tally.results.length}: ${tally.results[0]}`);
	check(`the sweep: ${count}, printout line for line the page's method (the printed counts among it)`, tally.printout.length === 0, `${tally.printout.length}: ${tally.printout[0]}`);
	check(`the sweep: ${count}, covers minimal by brute force over the primes`, tally.minimal.length === 0, `${tally.minimal.length}: ${tally.minimal[0]}`);
	check(`the sweep: ${count}, printout lines of ${PRINT_WIDTH} characters or less`, tally.wide.length === 0, tally.wide[0]);
	console.log(`the sweep: ${cases.length} files in one Python process, ${seconds.toFixed(1)} s`);
	rmSync(dir, { recursive: true, force: true });
}

/* -------------------------------------------------------------- 6. the page */
{
	const sheet = readFileSync(new URL('../src/routes/(site)/tools/karnaugh/method/+page.svelte', import.meta.url), 'utf8');
	const markup = PAGE.slice(PAGE.lastIndexOf('</script>'));
	const problems = [];
	const buttons = [...markup.matchAll(/<button type="button" onclick=\{(\w+)\}>Download ([^<]+)<\/button>/g)].map((m) => [m[1], m[2]]);
	if (!same(buttons, [['downloadScript', 'karnaugh-solver.py']])) problems.push(`the buttons: ${JSON.stringify(buttons)}`);
	const at = markup.indexOf('>Download karnaugh-solver.py</button>');
	const before = markup.slice(0, at);
	const note = before.slice(before.lastIndexOf('<p class="note">')).replace(/\s+/g, ' ');
	if (!/^<p class="note"> A Python file that works the method through for this function/.test(note) || !/checks its forms and the page's against the truth table/.test(note) || !/Python 3\.8 or newer, nothing to install: <code class="command">python karnaugh-solver\.py<\/code>/.test(note)) problems.push('the paragraph presenting the file');
	if (!/code\.command \{\s*white-space: nowrap;\s*\}/.test(PAGE)) problems.push('code.command kept on one line');
	const from = PAGE.indexOf('\tfunction downloadScript() {');
	const body = from < 0 ? '' : PAGE.slice(from, PAGE.indexOf('\n\t}\n', from));
	if (!body.includes('generateKarnaughPython({ names: cleanNames, ones, dcs, result })') || !body.includes("anchor.download = 'karnaugh-solver.py';") || !body.includes("type: 'text/x-python'")) problems.push('downloadScript');
	if (!/import \{ generateKarnaughPython \} from '\$lib\/karnaugh\/python';/.test(PAGE)) problems.push('the import of the generator');
	const sheetMarkup = sheet.slice(sheet.lastIndexOf('</script>') + '</script>'.length);
	if (/codegen|generateScript|karnaugh-solver\.js|\bnode karnaugh|standalone script|text\/javascript/.test(PAGE) || /karnaugh-solver|\bscripts?\b|\bdownload|\bnode\b/i.test(sheetMarkup)) problems.push('a trace of the JavaScript script');
	if (existsSync(new URL('../src/lib/karnaugh/codegen.js', import.meta.url))) problems.push('codegen.js is still there');
	check('the page: a "Download karnaugh-solver.py" button under the paragraph presenting the file, saving the file of the function on the map; no trace of the JavaScript script on the page or its method sheet, codegen.js gone', problems.length === 0, problems.join('; '));
}

/* ------------------------------------------------------- the matrix covered */
{
	const want = {
		variables: [2, 3, 4].flatMap((n) => [`${n} variables, with don't cares`, `${n} variables, without don't cares`]),
		constant: ['F = 0', "F = 0, don't cares", 'F = 1', "F = 1, don't cares", "every cell a don't care"],
		names: ["the page's defaults", 'edited, one letter each', 'edited, longer than one letter', 'not ASCII, replaced', "a ', replaced", 'a name twice, replaced'],
		petrick: ['nothing left after the essential primes', 'one cheapest option', 'ties at the cheapest', 'more than 6 options'],
		primes: ["a prime that holds don't cares only", 'no essential prime'],
		label: ['the page on opening', 'every example of the page', "the page's text order of options"],
		guards: ['names', 'a cell off the map', "names the page's forms no longer use", "names renamed with the page's forms"],
		outcome: ['same', 'wrong', 'not minimal', 'as cheap']
	};
	const counts = [];
	for (const [dimension, values] of Object.entries(want)) {
		const missing = values.filter((v) => !covered.get(dimension)?.has(v));
		check(`the matrix covered: ${dimension} (${values.length - missing.length} of ${values.length})`, missing.length === 0, `missing ${missing.join(', ')}`);
		counts.push(`${dimension} ${values.length - missing.length}/${values.length}`);
	}
	console.log(`the matrix covered: ${counts.join(', ')}`);
	check(`the default file (the page on opening) has ${defaultLines} lines`, defaultLines !== null);
}

cleanup();
const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(`karnaugh-solver.py: ${matrixRuns} functions of the matrix, ${SWEEP} of the sweep (and as many edited), ${defaultLines} lines for the default file`);
console.log(failures === 0 ? `karnaugh engine and karnaugh-solver.py clean: ${passes} checks passed, ${seconds} s` : `${failures} failure(s), ${passes} checks passed, ${seconds} s`);
process.exit(failures === 0 ? 0 : 1);
