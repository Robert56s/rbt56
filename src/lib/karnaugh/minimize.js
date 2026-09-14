/**
 * Boolean minimization for a Karnaugh-map sized function: Quine-McCluskey
 * to find every prime implicant, then Petrick's method for an exact
 * minimum cover. Sizes here are tiny (2 to 6 variables), so exactness is
 * affordable; the point is that the result is provably minimal (fewest
 * terms, then fewest literals), not a heuristic pick.
 *
 * Conventions: n variables, variable 0 is the most significant bit of a
 * minterm number (so with A, B, C, D the minterm 0b1010 = 10 means A=1,
 * B=0, C=1, D=0). An implicant is { mask, value }: a bit set in mask means
 * that variable is kept, fixed to the matching bit of value; a bit clear
 * means the variable was eliminated by grouping. Bits are indexed exactly
 * as in minterm numbers, and value bits outside the mask are always 0.
 */

export function popcount(x) {
	let c = 0;
	while (x) {
		x &= x - 1;
		c++;
	}
	return c;
}

/** True when the implicant covers minterm m. */
export function covers(imp, m) {
	return (m & imp.mask) === (imp.value & imp.mask);
}

/** Number of minterms (map cells) an implicant covers: 2^(eliminated variables). */
export function implicantSize(imp, n) {
	return 1 << (n - popcount(imp.mask));
}

/** Every minterm an implicant covers, ascending. */
export function implicantMinterms(imp, n) {
	const out = [];
	for (let m = 0; m < 1 << n; m++) if (covers(imp, m)) out.push(m);
	return out;
}

export function implicantKey(imp) {
	return `${imp.mask}:${imp.value}`;
}

/**
 * Every prime implicant of the function whose ones are `ones` and whose
 * don't-cares are `dcs` (arrays of minterm numbers). Don't-cares take part
 * in the grouping (they may be used as ones to make bigger groups) but no
 * group is required to cover them.
 *
 * Classic tabulation: start from every single minterm, repeatedly combine
 * pairs that differ in exactly one variable into a group twice as large,
 * and keep whatever could not be combined any further. Each round also
 * records which pairs merged into what, for the "show the method" panel.
 */
export function primeImplicants(n, ones, dcs = []) {
	const full = (1 << n) - 1;
	const start = [...new Set([...ones, ...dcs])].sort((a, b) => a - b).map((m) => ({ mask: full, value: m }));
	const primes = [];
	const rounds = [];
	let current = start;
	while (current.length) {
		const used = new Array(current.length).fill(false);
		const next = [];
		const seen = new Map();
		const merges = [];
		for (let i = 0; i < current.length; i++) {
			for (let j = i + 1; j < current.length; j++) {
				const a = current[i];
				const b = current[j];
				if (a.mask !== b.mask) continue;
				const diff = a.value ^ b.value;
				if (diff === 0 || (diff & (diff - 1)) !== 0) continue; // exactly one bit apart
				used[i] = true;
				used[j] = true;
				const merged = { mask: a.mask & ~diff, value: a.value & ~diff };
				const key = implicantKey(merged);
				if (!seen.has(key)) {
					seen.set(key, merged);
					next.push(merged);
					merges.push({ from: [a, b], to: merged, bit: diff });
				}
			}
		}
		const kept = [];
		for (let i = 0; i < current.length; i++) if (!used[i]) kept.push(current[i]);
		primes.push(...kept);
		rounds.push({ size: implicantSize(current[0], n), candidates: current, merges, kept });
		current = next;
	}
	// biggest groups first, then by position
	primes.sort((a, b) => popcount(a.mask) - popcount(b.mask) || a.value - b.value);
	return { primes, rounds };
}

/** Remove duplicates and any product that strictly contains another (absorption: X + XY = X). */
function absorb(products) {
	const uniq = new Map();
	for (const p of products) uniq.set(p.join(','), p);
	const list = [...uniq.values()].sort((a, b) => a.length - b.length);
	const out = [];
	for (const p of list) {
		const set = new Set(p);
		if (out.some((q) => q.every((i) => set.has(i)))) continue; // q ⊆ p: p is absorbed
		out.push(p);
	}
	return out;
}

const PETRICK_LIMIT = 40000;

/**
 * Petrick's method: each uncovered minterm needs at least one of the primes
 * that cover it (a sum); all of them are needed at once (a product of those
 * sums). Multiplying the product out and simplifying with absorption lists
 * every irredundant way of finishing the cover; the cheapest one wins.
 * `sums` is one array of prime indices per uncovered minterm.
 */
export function petrick(sums, primes) {
	let products = [[]];
	let exact = true;
	for (const sum of sums) {
		const next = [];
		for (const prod of products) {
			for (const i of sum) {
				next.push(prod.includes(i) ? prod : [...prod, i].sort((a, b) => a - b));
			}
		}
		products = absorb(next);
		if (products.length > PETRICK_LIMIT) {
			exact = false;
			break;
		}
	}
	if (!exact) return { exact, best: greedy(sums, primes), options: null };
	const cost = (p) => [p.length, p.reduce((s, i) => s + popcount(primes[i].mask), 0)];
	products.sort((a, b) => {
		const [ca, la] = cost(a);
		const [cb, lb] = cost(b);
		return ca - cb || la - lb || a.join(',').localeCompare(b.join(','));
	});
	return { exact, best: products[0], options: products };
}

/** Fallback for pathological sizes: repeatedly take the prime that covers the most still-uncovered minterms. */
function greedy(sums, primes) {
	const remaining = sums.map((s, k) => ({ k, s })).filter(({ s }) => s.length);
	const chosen = [];
	let left = new Set(remaining.map(({ k }) => k));
	while (left.size) {
		const score = new Map();
		for (const { k, s } of remaining) if (left.has(k)) for (const i of s) score.set(i, (score.get(i) || 0) + 1);
		let best = -1;
		let bestScore = -1;
		for (const [i, sc] of score) {
			if (sc > bestScore || (sc === bestScore && popcount(primes[i].mask) < popcount(primes[best].mask))) {
				best = i;
				bestScore = sc;
			}
		}
		chosen.push(best);
		for (const { k, s } of remaining) if (s.includes(best)) left.delete(k);
	}
	return chosen.sort((a, b) => a - b);
}

/**
 * Minimum sum-of-products cover of the function with the given ones and
 * don't-cares. Returns everything the map and the method panel need: the
 * prime implicants, which ones are essential and why, the minterms left
 * after the essentials, Petrick's result and the final cover.
 */
export function minimize(n, ones, dcs = []) {
	const total = 1 << n;
	const onesSet = new Set(ones.filter((m) => m >= 0 && m < total));
	const dcList = [...new Set(dcs.filter((m) => m >= 0 && m < total && !onesSet.has(m)))].sort((a, b) => a - b);
	const oneList = [...onesSet].sort((a, b) => a - b);

	const base = { n, ones: oneList, dontCares: dcList, primes: [], rounds: [], chart: [], essentialIdx: [], remaining: [], petrick: null, coverIdx: [], cover: [], constant: null };
	if (oneList.length === 0) return { ...base, constant: 0 };
	if (oneList.length + dcList.length === total) {
		const all = { mask: 0, value: 0 };
		return { ...base, constant: 1, primes: [all], coverIdx: [0], cover: [all] };
	}

	const { primes, rounds } = primeImplicants(n, oneList, dcList);
	const chart = oneList.map((m) => ({ m, by: primes.map((p, i) => (covers(p, m) ? i : -1)).filter((i) => i >= 0) }));

	const essentialIdx = [];
	for (const { by } of chart) if (by.length === 1 && !essentialIdx.includes(by[0])) essentialIdx.push(by[0]);
	essentialIdx.sort((a, b) => a - b);
	const coveredByEssential = new Set();
	for (const i of essentialIdx) for (const m of oneList) if (covers(primes[i], m)) coveredByEssential.add(m);
	const remaining = oneList.filter((m) => !coveredByEssential.has(m));

	let petrickResult = null;
	let extra = [];
	if (remaining.length) {
		const sums = remaining.map((m) => primes.map((p, i) => i).filter((i) => !essentialIdx.includes(i) && covers(primes[i], m)));
		petrickResult = petrick(sums, primes);
		extra = petrickResult.best;
	}
	const coverIdx = [...essentialIdx, ...extra].sort((a, b) => a - b);
	return { ...base, primes, rounds, chart, essentialIdx, remaining, petrick: petrickResult, coverIdx, cover: coverIdx.map((i) => primes[i]) };
}

/**
 * Both minimal forms at once: the sum-of-products from the ones, and the
 * product-of-sums from the zeros (minimize the complement, then De Morgan
 * turns each product of the complement into a sum of the function).
 */
export function minimizeBoth(n, ones, dcs = []) {
	const total = 1 << n;
	const onesSet = new Set(ones);
	const dcSet = new Set(dcs);
	const zeros = [];
	for (let m = 0; m < total; m++) if (!onesSet.has(m) && !dcSet.has(m)) zeros.push(m);
	return { sop: minimize(n, ones, dcs), pos: minimize(n, zeros, dcs) };
}

/** Number of literals in a cover (the usual second cost after the number of terms). */
export function literalCount(cover) {
	return cover.reduce((s, imp) => s + popcount(imp.mask), 0);
}
