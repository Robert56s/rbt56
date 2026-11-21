// The file's own rule for its parts (section 5 of filter-design.py), written
// again in JavaScript from its description, apart from the generator: the
// check runs it on the file's own stage targets and compares the parts.
//   a. each circuit's choices (the family modules: choices(st, rs, typed,
//      capacitors)) for every capacitor (pair) of the stock, or the ones typed
//   b. every choice within the limits (else every choice) rounded as c says;
//      of those whose rounded figures land within 1e-9 of the closest to
//      their exact ones (the largest log miss), the one whose resistors sit
//      nearest 10 kohm (mean of ln(R / 10 kohm)^2), then the first
//      (closest())
//   c. every resistor to its stocked neighbour below or above, every
//      combination in the order itertools.product takes them, the first one
//      whose figures land closest (the largest log miss) to the exact parts'
// The arithmetic is the file's, operation for operation, so that ties fall
// the same way.

export const R_MIN = 1e3;
export const R_MAX = 1e6;
export const C_MIN = 47e-12;

export const isResistor = (name) => /^[Rr]/.test(name);

export function within(p) {
	return Object.entries(p).every(([name, v]) => (isResistor(name) ? R_MIN <= v && v <= R_MAX : v >= C_MIN));
}

export function level(p) {
	const values = Object.entries(p)
		.filter(([name]) => isResistor(name))
		.map(([, v]) => v);
	let sum = 0;
	for (const v of values) sum += Math.log(v / 10e3) ** 2;
	return sum / values.length;
}

export function neighbours(r, resistors) {
	let below = null;
	let above = null;
	for (const v of resistors) {
		if (v <= r && (below === null || v > below)) below = v;
		if (v >= r && (above === null || v < above)) above = v;
	}
	return [...new Set([below, above].filter((v) => v !== null))].sort((a, b) => a - b);
}

/** Every combination of the lists, the last one turning fastest, as itertools.product. */
function* product(lists, at = 0, pick = []) {
	if (at === lists.length) {
		yield pick.slice();
		return;
	}
	for (const v of lists[at]) {
		pick.push(v);
		yield* product(lists, at + 1, pick);
		pick.pop();
	}
}

/** How far a stage's figures land from others: the largest |ln(got / want)| (the file's miss()). */
export function miss(got, want) {
	let out = -Infinity;
	for (const key of Object.keys(want)) out = Math.max(out, Math.abs(Math.log(got[key] / want[key])));
	return out;
}

export function rounded(p, figures, rs, resistors) {
	const target = figures(p, rs);
	const names = Object.keys(p).filter(isResistor);
	let best = null;
	let bestMiss = Infinity;
	for (const values of product(names.map((name) => neighbours(p[name], resistors)))) {
		const trial = { ...p };
		names.forEach((name, i) => (trial[name] = values[i]));
		const off = miss(figures(trial, rs), target);
		if (off < bestMiss) {
			best = trial;
			bestMiss = off;
		}
	}
	return best;
}

/**
 * Rule b (the file's closest()): every choice rounded; of those whose
 * rounded figures miss their exact ones within 1e-9 of the least miss (two
 * choices a decade apart, whose misses differ in their last bits only), the
 * one whose resistors sit nearest 10 kohm, the first of a tie, as Python's
 * min() takes it. Returns its rounded parts.
 */
export function closest(choices, figures, rs, resistors) {
	const tried = choices.map((p) => [p, rounded(p, figures, rs, resistors)]);
	const misses = tried.map(([p, parts]) => miss(figures(parts, rs), figures(p, rs)));
	let least = Infinity;
	for (const m of misses) least = Math.min(least, m);
	let best = null;
	let bestLevel = Infinity;
	tried.forEach(([p, parts], i) => {
		if (!(misses[i] <= least + 1e-9)) return;
		const l = level(p);
		if (best === null || l < bestLevel) {
			best = parts;
			bestLevel = l;
		}
	});
	return best;
}

/**
 * The parts the rule gives each stage of `stages` (the file's targets),
 * [[circuit, parts]], or a string saying where it cannot. `circuits` maps a
 * circuit to { choices, figures } (the family modules), `typed` the
 * capacitors typed by stage number (1 the first), `stock` { resistors,
 * capacitors }.
 */
export function ownParts(stages, { circuits, rs, typed = {}, stock }) {
	return stages.map((st, i) => {
		const c = circuits[st.circuit];
		if (!c?.choices) return `no JavaScript rule for ${st.circuit}`;
		const source = i === 0 ? rs : 0;
		const mine = typed[i + 1] ?? {};
		let choices = [...c.choices(st, source, mine, stock.capacitors)];
		if (!choices.length && Object.keys(mine).length) choices = [...c.choices(st, source, {}, stock.capacitors)];
		if (!choices.length) return `stage ${i + 1}: no choice`;
		const kept = choices.filter(within);
		return [st.circuit, closest(kept.length ? kept : choices, c.figures, source, stock.resistors)];
	});
}

/** The capacitors a part may take: the one typed, else the stock's. */
export const capsFor = (typed, name, capacitors) => (name in typed ? [typed[name]] : capacitors);
