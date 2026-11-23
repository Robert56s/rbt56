import { PyFile, comment, header, listWords, noted, pyList, pyStr, section } from '../filter/python/emit';
import { literals, posText, sopText } from './expression';

/**
 * karnaugh-solver.py, the Karnaugh page's Python download: one readable
 * file for the function on the map that works the method through step by
 * step, finds both minimal forms with it, and checks them, with the forms
 * the page shows, against the function's truth table.
 *
 *   generateKarnaughPython({ names, ones, dcs, result })
 *     names   the page's variable names (cleanNames, 2 to 4 of them)
 *     ones    the cells where F = 1, dcs the don't cares (the page's lists)
 *     result  the page's minimizeBoth(n, ones, dcs): its sop and pos covers
 *             are the page's forms, written into the file as their terms
 *   returns the file's text
 *
 * The file, in sections that follow the page's panels and its method sheet:
 *   SETTINGS  names, minterms, dont_cares
 *   1  the function: its ones, zeros and don't cares, and the map
 *   2  the prime implicants by Quine-McCluskey, a line for each round (the
 *      size of its groups, how many, the new groups they make, the primes),
 *      for the sum of products (the ones) and the product of sums (the
 *      zeros, the ones of F'); a form with nothing to choose is a constant
 *   3  the prime implicant chart and the essential primes
 *   4  the cover of what is left, Petrick's method as minimize.js applies
 *      it: the options multiplied out with absorption, the cheapest kept
 *      (fewest primes, then literals, then the page's own order)
 *   5  the minimal forms, their terms and literals
 *   6  the two-level circuits, the gates as circuit.js gateCount counts them
 *   7  the check: the page's forms (its terms, with its names) and the
 *      file's through the same truth table, with their costs, a verdict
 *      for each, and for each form a sentence: the same terms, or why not
 * The method is the page's step for step, so that the file's forms are the
 * page's: the primes in the page's order (minimize.js primeImplicants), the
 * ties broken the same way. The page's greedy fallback past 40000 options
 * has no place in the file: 4 variables give 13 primes at most, so 8192
 * options (npm run check:karnaugh proves it on every function). The code is
 * the same for every function, only the data changes: the SETTINGS may hold
 * any function of 2 to 4 variables.
 *
 * The Python, as the filter's (src/lib/filter/python/index.js): 3.8 or
 * newer, the standard library only (itertools, textwrap), ASCII only,
 * 4-space indents, lines up to 100 characters (PyFile throws past them),
 * English, short plain comments, no second person, no word of a class.
 * Every result also lives in a module-level name listed in the comment
 * "After a run, these names hold the results: ...", which the checks read.
 */

/** The names the file falls back to, the page's defaults. */
const DEFAULT_NAMES = ['A', 'B', 'C', 'D'];

/** The results comment's names. */
const RESULTS = ['n', 'ones', 'zeros', 'dcs', 'sop', 'pos', 'page_sop', 'page_pos', 'own_check', 'page_check'];

/**
 * The variable names as the file writes them: the page's, or A, B, C, D in
 * their place when one of them cannot be (a character outside printable
 * ASCII, a ', or a name given twice: the file reads its literals by name).
 */
export function fileNames(names) {
	const fit = names.every((v) => /^[\x20-\x7e]+$/.test(v) && !v.includes("'")) && new Set(names).size === names.length;
	return fit ? { names, replaced: false } : { names: DEFAULT_NAMES.slice(0, names.length), replaced: true };
}

/** A formula as comment lines, `#     F = ...`, broken at its spaces before 96 characters, the rest 4 spaces deeper. */
function formulaComment(text) {
	const lines = [];
	let line = '';
	for (const w of text.split(' ')) {
		const lead = lines.length ? '#         ' : '#     ';
		if (line && `${lead}${line} ${w}`.length > 96) {
			lines.push(`${lead}${line}`);
			line = w;
		} else line = line ? `${line} ${w}` : w;
	}
	lines.push(`${lines.length ? '#         ' : '#     '}${line}`);
	return lines.join('\n');
}

/** A term as Python data: the list of its literals, a name with ' for a complement. */
function termData(imp, n, names, complement) {
	const lits = literals(imp, n, names, { complement }).map((l) => pyStr(l.negated ? `${l.name}'` : l.name));
	return `[${lits.join(', ')}]`;
}

const DOCSTRING = `"""Karnaugh map solver: the minimal sum of products and product of sums of one function.

rbt56.com/tools/karnaugh/ wrote this file for the function on its map. It works the method
through step by step: the prime implicants by Quine-McCluskey, the chart and the essential
primes, Petrick's method for the cells left, the two minimal forms and their gate circuits.
Then it checks its own forms, and the page's, against the function's truth table.

Run it with Python 3.8 or newer, nothing to install: python karnaugh-solver.py. The SETTINGS
block can be edited and the file run again.
"""`;

const SAY = `def say(line, indent=4):
    """A line of the printout, broken at its spaces past 88 characters."""
    lead = " " * indent
    print(textwrap.fill(line, 88, initial_indent=lead, subsequent_indent=lead + "    ",
                        break_on_hyphens=False))`;

const FUNCTION = `# Cell m is the row of the truth table whose variables, read in order as a binary number, make
# m: with A, B, C, D the cell 6 = 0110 is A'BCD'. A cell in both lists is a one, as on the page.
n = len(names)
if not 2 <= n <= 4 or len(set(names)) < n or any("'" in v for v in names):
    raise SystemExit("names needs 2 to 4 variables, each its own name with no ' in it.")
outside = [m for m in minterms + dont_cares if m not in range(2 ** n)]
if outside:
    raise SystemExit(f"Cell {outside[0]} is not on a map of {n} variables (0 to {2 ** n - 1}).")
ones = sorted(set(minterms))
dcs = sorted(set(dont_cares) - set(ones))
zeros = [m for m in range(2 ** n) if m not in ones and m not in dcs]
for word, cells in [("ones", ones), ("zeros", zeros), ("don't cares", dcs)]:
    print(f"  {word:13}{', '.join(map(str, cells)) or 'none'}")`;

const GRAY = `def gray(bits):
    """The Gray code on bits bits, each code one bit away from the one before: 00 01 11 10."""
    return [i ^ (i >> 1) for i in range(2 ** bits)]`;

const MAP = `# The map: the first n // 2 variables down the side, the others across, both in Gray code, so
# that two cells that touch, across an edge too, differ in one variable.
side, across = n // 2, n - n // 2
mark = {m: "1" for m in ones}
mark.update({m: "X" for m in dcs})
print(f"  the map, {''.join(names[:side])} down the side and {''.join(names[side:])} across:")
print(" " * 8 + "".join(f"{c:0{across}b}".rjust(4) for c in gray(across)))
for r in gray(side):
    row = [mark.get(r * 2 ** across + c, "0") for c in gray(across)]
    print(f"{r:0{side}b}".rjust(8) + "".join(v.rjust(4) for v in row))`;

const GROUPS = `# A group of cells is a pattern over the variables: 1 or 0 where the variable keeps that value
# all over the group, - where it takes both and drops out. Two groups whose patterns differ in
# one place, 0 against 1, make one twice as large (XY + XY' = X). Every cell starts as a group
# of one cell; each round makes every pair it can, and a group that pairs with no other is
# prime. The don't cares join the groups of both forms.
# The sum of products groups the ones, the product of sums the zeros (the ones of F'):
sop = {"name": "sum of products", "word": "ones", "cells": ones}
pos = {"name": "product of sums", "word": "zeros", "cells": zeros}
forms = [sop, pos]`;

const PATTERN = `def pattern(m):
    """Cell m as a pattern: its number in n bits, the first variable first (6 is 0110 on 4
    variables)."""
    return f"{m:0{n}b}"`;

const COVERS = `def covers(p, m):
    """Whether the group of pattern p holds cell m."""
    return all(c in ("-", b) for c, b in zip(p, pattern(m)))`;

const MERGE = `def merge(a, b):
    """The group two patterns make, or None unless they differ in one place, 0 against 1."""
    places = [i for i in range(n) if a[i] != b[i]]
    if len(places) == 1 and "-" not in (a[places[0]], b[places[0]]):
        i = places[0]
        return a[:i] + "-" + a[i + 1:]
    return None`;

const PRIMES = `def prime_implicants(cells):
    """The prime implicants of the cells, a line for each round: the size of its groups, how
    many there are, the new groups twice as large they make, and how many pair with none, the
    primes. The biggest groups first, then by the number a pattern reads with each - as 0, as
    the page lists them."""
    groups = [pattern(m) for m in sorted(cells)]
    primes = []
    print("    size  groups  new groups  primes")
    while groups:
        bigger, paired = [], set()
        for a, b in itertools.combinations(groups, 2):
            c = merge(a, b)
            if c:
                paired.update((a, b))
                if c not in bigger:
                    bigger.append(c)
        primes += [g for g in groups if g not in paired]
        size = 2 ** groups[0].count("-")
        print(f"    {size:4}{len(groups):8}{len(bigger):12}{len(groups) - len(paired):8}")
        groups = bigger
    return sorted(primes, key=lambda p: (n - p.count("-"), int(p.replace("-", "0"), 2)))`;

const LITERALS = `# A group of ones is a product of the variables it keeps, each plain at 1 and complemented at 0
# (1-0- is AC'). A group of zeros is a product of F', which De Morgan turns into a sum of F with
# every literal flipped (1-0- is (A' + C)).
def literals(form, p):
    """The literals of a group's term in the variables' order, ' marking a complement."""
    plain = "1" if form is sop else "0"
    return [v if c == plain else v + "'" for v, c in zip(names, p) if c != "-"]`;

const TEXT = `def text(form, terms):
    """A form as it is written: products summed, or sums multiplied. No term at all is 0 as a
    sum of products, 1 as a product of sums; a term with no literal is a product 1, a sum 0."""
    if form is sop:
        return " + ".join("".join(t) or "1" for t in terms) or "0"
    return "".join("(" + " + ".join(t) + ")" if t else "0" for t in terms) or "1"`;

const FORMS = `# A form with no cell to group has no term; one whose cells and don't cares fill the map is a
# single group of all of it, keeping no variable. Either is a constant, with nothing to choose.
for form in forms:
    cells = form["cells"]
    # (empty for a constant, so that every result is there)
    form.update(primes=[], essential=[], left=[], options=None, chosen=[])
    form["constant"] = not cells or len(cells) + len(dcs) == 2 ** n
    if form["constant"]:
        form["cover"] = ["-" * n] if cells else []
        form["terms"] = [literals(form, p) for p in form["cover"]]
        print(f"  {form['name']}: F = {text(form, form['terms'])}, a constant")
        continue
    also = " and the don't cares" if dcs else ""
    print(f"  {form['name']}, from the {form['word']}{also}:")
    form["primes"] = prime_implicants(cells + dcs)
    for i, p in enumerate(form["primes"]):
        held = ", ".join(str(m) for m in range(2 ** n) if covers(p, m))
        print(f"    P{i + 1:<3}{p}  {text(form, [literals(form, p)])}, cells {held}")`;

const CHART = `# The chart marks the primes that hold each cell to cover. A cell that one prime alone holds
# makes that prime essential, since nothing else covers the cell; section 4 covers the cells
# they leave.
for form in forms:
    cells, primes = form["cells"], form["primes"]
    if form["constant"]:
        print(f"  {form['name']}: a constant, no chart")
        continue
    holders = {m: [i for i, p in enumerate(primes) if covers(p, m)] for m in cells}
    print(f"  {form['name']}, an x where a prime holds the cell:")
    print(" " * 8 + "".join(f"{m:3}" for m in cells))
    for i in range(len(primes)):
        marks = "".join("  x" if i in holders[m] else "   " for m in cells)
        print(f"    P{i + 1:<3}{marks}".rstrip())
    form["essential"] = sorted({holders[m][0] for m in cells if len(holders[m]) == 1})
    form["left"] = [m for m in cells if not set(holders[m]) & set(form["essential"])]
    for i in form["essential"]:
        alone = ", ".join(str(m) for m in cells if holders[m] == [i])
        print(f"    P{i + 1} is essential, alone on {alone}")
    if not form["essential"]:
        print("    no prime is essential: every cell is held by two primes or more")
    print(f"    left: {', '.join(map(str, form['left'])) or 'none'}")`;

const PETRICK = `# Each cell left needs one of the primes that hold it, a sum such as (P1 + P2), and all of them
# at once, the product of those sums. Multiplied out, an option that holds all the primes of
# another is dropped (absorption, X + XY = X): what stays is every way to finish the cover with
# no prime too many. The cheapest is kept: the fewest primes, then the fewest literals, then the
# primes' places in the list from 0, joined by commas and compared as text, as the page orders
# them, so that the file takes the page's form ("0,10" comes before "0,9"). No limit is needed:
# 4 variables have 13 primes at most, so 8192 options at most.`;

const MULTIPLY = `def multiply(options, s):
    """Petrick's step: every option grown by one prime of the sum s, then absorption."""
    grown = {frozenset(o) | {i} for o in options for i in s}
    return [sorted(o) for o in grown if not any(other < o for other in grown)]`;

const PRICE = `def price(primes, option):
    """An option's cost: how many primes, then how many literals they have in all."""
    return len(option), sum(n - primes[i].count("-") for i in option)`;

const NAMED = `def named(indices, joiner=""):
    """Primes by number from P1: P1P4 as a product, or P1 + P4 with the joiner " + "."""
    return joiner.join(f"P{i + 1}" for i in indices)`;

const COVER = `for form in forms:
    primes, essential, left = form["primes"], form["essential"], form["left"]
    if form["constant"]:
        print(f"  {form['name']}: a constant, nothing left")
        continue
    if not left:
        print(f"  {form['name']}: no cell left, the essential primes are the cover")
        best = []
    else:
        sums = [[i for i, p in enumerate(primes) if covers(p, m)] for m in left]
        options = [[]]
        for s in sums:
            options = multiply(options, s)
        options.sort(key=lambda o: (*price(primes, o), ",".join(map(str, o))))
        form["options"] = options
        best = options[0]
        ties = sum(price(primes, o) == price(primes, best) for o in options)
        print(f"  {form['name']}, the primes each cell left needs, then the options:")
        say("".join(f"({named(s, ' + ')})" for s in sums))
        more = " + ..." if len(options) > 6 else ""
        say("= " + " + ".join(named(o) for o in options[:6]) + more)
        tie = f", the first of {ties} as cheap" if ties > 1 else ""
        print(f"    the cheapest: {named(best)}, primes {len(best)}, literals "
              f"{price(primes, best)[1]}{tie}")
    form["chosen"] = sorted(essential + best)
    form["cover"] = [primes[i] for i in form["chosen"]]
    form["terms"] = [literals(form, p) for p in form["cover"]]`;

const FORM_TEXT = `# The chosen primes, each as its term. The product of sums is first the sum of products of F',
# its groups of zeros as products; De Morgan then turns it into F, every product into a sum.`;

const COST = `def cost(terms):
    """Terms, literals and gates as the page counts them: an inverter for each variable
    complemented somewhere, a gate for each term of two literals or more, and the second-level
    gate for two terms or more. A term with no literal (a constant) counts for nothing."""
    inverters = len({v[:-1] for t in terms for v in t if v.endswith("'")})
    first = sum(len(t) >= 2 for t in terms)
    second = 1 if len(terms) >= 2 else 0
    return {"terms": sum(1 for t in terms if t), "literals": sum(map(len, terms)),
            "inverters": inverters, "first": first, "second": second,
            "gates": inverters + first + second}`;

const MINIMAL = `for form in forms:
    c = cost(form["terms"])
    which = "a constant" if form["constant"] else named(form["chosen"], " + ")
    say(f"{form['name']}, {which}: terms {c['terms']}, literals {c['literals']}", 2)
    if form is pos and not form["constant"]:
        say(f"F' = {text(sop, [literals(sop, p) for p in form['cover']])}")
    say(f"F = {text(form, form['terms'])}")`;

const CIRCUITS = `# A sum of products is AND gates into an OR gate, a product of sums OR gates into an AND gate,
# after an inverter for each variable that appears complemented; a term of one literal needs no
# first-level gate and is a wire straight to the second level. With one term there is no second
# level: its gate is F, or F is the literal itself. A constant needs no gate: F is tied to the
# supply (1) or to ground (0).
print(" " * 19 + "inverters  first level  second level  gates")
for form, gate1, gate2 in [(sop, "AND", "OR"), (pos, "OR", "AND")]:
    c = cost(form["terms"])
    level1, level2 = f"{c['first']} {gate1}", f"{c['second']} {gate2}"
    print(f"  {form['name']:15}{c['inverters']:11}{level1:>13}{level2:>14}{c['gates']:7}")`;

const CHECK = `def check(form, terms):
    """A form through the truth table as it is written, a product 1 where every literal is, a
    sum where one is: the cells it gets wrong, and its cost."""
    wrong = []
    for m in range(2 ** n):
        value = {}  # each literal on cell m: A is 1 where A is 1, and A' where A is 0
        for v, b in zip(names, pattern(m)):
            value[v], value[v + "'"] = b == "1", b == "0"
        truth = [[value[v] for v in t] for t in terms]
        f = any(all(t) for t in truth) if form is sop else all(any(t) for t in truth)
        if m not in dcs and f != (m in ones):
            wrong.append(m)
    return {"wrong": wrong, **cost(terms)}`;

const VERDICTS = `own_check = {"sop": check(sop, sop["terms"]), "pos": check(pos, pos["terms"])}
page_check = {"sop": check(sop, page_sop), "pos": check(pos, page_pos)}
print(" " * 33 + "truth table  terms  literals  gates")
for key, form in [("sop", sop), ("pos", pos)]:
    for who, c in [("the file's", own_check[key]), ("the page's", page_check[key])]:
        verdict = f"{len(c['wrong'])} wrong" if c["wrong"] else "right"
        print(f"  {form['name'] + ', ' + who:31}{verdict:11}{c['terms']:7}{c['literals']:10}"
              f"{c['gates']:7}")
for key, form, page in [("sop", sop, page_sop), ("pos", pos, page_pos)]:
    own, theirs = own_check[key], page_check[key]
    if page == form["terms"]:
        why = "is the file's, term for term"
    elif theirs["wrong"]:
        why = f"is wrong on {', '.join(map(str, theirs['wrong']))}: not a form of this function"
    elif (theirs["terms"], theirs["literals"]) > (own["terms"], own["literals"]):
        why = "is right but not minimal for this function"
    else:
        why = "is another minimal form, as cheap"
    say(f"The page's {form['name']} {why}.", 2)`;

/** The SETTINGS block: the function as data, then the names the results end up in. */
function settings(names, replaced, ones, dcs) {
	const lines = [header('SETTINGS')];
	if (replaced) lines.push(comment(`The page's names cannot all be written here (a name outside plain ASCII, with a ' in it, or given twice): ${listWords(names)} stand for them, in their order.`));
	lines.push(
		noted(`names = [${names.map(pyStr).join(', ')}]`, '2 to 4 variables, the first the most significant bit of a cell'),
		pyList('minterms', ones.map(String), 'the cells where F = 1'),
		pyList('dont_cares', dcs.map(String), 'the cells where F may be 1 or 0 (X on the map)')
	);
	return `${lines.join('\n')}\n\n${comment(`After a run, these names hold the results: ${RESULTS.join(', ')}.`)}`;
}

/** The page's forms as data, under a comment that writes them as the page does, and the guard on their names. */
function pageForms(names, result) {
	const n = names.length;
	// (both forms of a function are constants, or neither)
	const constants = result.sop.constant !== null ? ' ([] no term, [[]] one term with no literal: the constants)' : '';
	return [
		comment(`Each form goes through the truth table as it is written: every one must give 1 and every zero 0, a don't care either. The page's minimal forms for this function (its panel 03), each term the literals it keeps, ' marking a complement${constants}:`),
		formulaComment(`F = ${sopText(result.sop.cover, n, names)}`),
		formulaComment(`F = ${posText(result.pos.cover, n, names)}`),
		pyList('page_sop', result.sop.cover.map((imp) => termData(imp, n, names, false)), 'products, summed'),
		pyList('page_pos', result.pos.cover.map((imp) => termData(imp, n, names, true)), 'sums, multiplied'),
		`unknown = [v.rstrip("'") for t in page_sop + page_pos for v in t if v.rstrip("'") not in names]`,
		'if unknown:',
		`    raise SystemExit(f"The page's forms use {unknown[0]}, which names no longer has: edit "`,
		`                     "page_sop and page_pos to match.")`
	].join('\n');
}

/** karnaugh-solver.py for the function on the page (see the header above). */
export function generateKarnaughPython({ names: pageNames, ones, dcs, result }) {
	const { names, replaced } = fileNames(pageNames);
	const file = new PyFile();
	file.imports.add('itertools');
	file.imports.add('textwrap');
	file.add(DOCSTRING);
	file.add(settings(names, replaced, ones, dcs));
	file.add(SAY);
	file.add(section('1 The function')).add(FUNCTION).add(GRAY).add(MAP);
	file.add(section('2 The prime implicants (Quine-McCluskey)')).add(GROUPS);
	file.add(PATTERN).add(COVERS).add(MERGE).add(PRIMES).add(LITERALS).add(TEXT).add(FORMS);
	file.add(section('3 The prime implicant chart and the essential primes')).add(CHART);
	file.add(section("4 The cover of what is left (Petrick's method)")).add(PETRICK);
	file.add(MULTIPLY).add(PRICE).add(NAMED).add(COVER);
	file.add(section('5 The minimal sum of products and product of sums')).add(FORM_TEXT).add(COST).add(MINIMAL);
	file.add(section('6 The two-level circuits')).add(CIRCUITS);
	file.add(section('7 The check')).add(pageForms(names, result));
	file.add(CHECK).add(VERDICTS);
	return file.text();
}
