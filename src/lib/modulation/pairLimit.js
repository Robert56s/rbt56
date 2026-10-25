import { DIODE_CHECKS, designDiodeMixerModulator } from './diodeMixerModulator';
import { designEnvelopeLowPass, designEnvelopeStage } from './envelopeFilter';
import { allocatePairs, limitPairs, pairCountTable, pairedNames, pairSubsets, seriesPair } from './eseries';
import { designJfetModulator } from './jfetModulator';

/**
 * "Up to N pairs" for the AM tool's three circuits, each on its own: the
 * JFET modulator (with the carrier oscillator when that is built on the
 * same board), the diode modulator, and the demodulator, whose pairs are
 * all in its envelope low-pass (the rectifier's matched resistors are
 * always single). Each designer takes a whitelist of the resistors that may
 * pair (pairAllowed in eseries.js), so every candidate is a real design,
 * the designer rerun with that whitelist, and limitPairs keeps the best.
 *
 * Every resistor counts once: an equal pair of parts that pair together
 * (a Sallen-Key stage's R1 = R2, an MFB stage's R1 = R3, the Wien bridge's
 * two R) counts as two.
 *
 * How a design is measured, lower being better: the figures its designer
 * aims at, as logs of what the rounded parts give over the target.
 *   JFET modulator   the squares of the misses of the gate drive's gain and
 *                    bias, of n (the non-inverting cell solving R_b for a
 *                    target n), of the carrier on the channel against its
 *                    limit (the divider) and of the post-gain level, summed;
 *                    plus PAIR_CHECK_COST for each check of the summer lost
 *                    (the gate swing inside the op-amp's reach, the coupling
 *                    corner), the checks the designer keeps a pair by
 *   carrier          the squares of the misses of its frequency, of the
 *                    amplitude its limiter holds and of its start gain
 *                    (against balance plus the 5 % excess it is designed
 *                    with), plus PAIR_CHECK_COST when it does not start and
 *                    hold
 *   diode modulator  the miss its own search minimizes, |n - target| plus
 *                    0.02 |ln(A_d / A_d asked)|, plus PAIR_CHECK_COST for
 *                    each check the page makes that it fails
 *   envelope         per stage the squares of the misses of f0 and of Q,
 *                    summed over the stages. Not the larger of the two that
 *                    the stage designers keep a pair by: a Sallen-Key
 *                    stage's pair moves f0 alone, and where its capacitors
 *                    leave Q further off, the larger miss would not see it
 * A carrier or a filter stage the list cannot build with the pairs it is
 * given is shown on E24 and E6 instead (stockShortfall), and adds
 * PAIR_SHORTFALL_COST: those finer grids would otherwise land it closer
 * than the list can, and win over a design the list builds.
 */

/** What a lost check adds to a measure: more than any rounding miss does. */
const PAIR_CHECK_COST = 1;

/** What a design shown on E24 and E6 instead of the list adds: more than every check together, so one built from the list wins whenever one fits. */
const PAIR_SHORTFALL_COST = 10;

/** Results kept across reruns of the page, which redoes its designs on every input. */
const pairLimitMemo = new Map();
function pairLimitRemember(key, make) {
	if (pairLimitMemo.has(key)) return pairLimitMemo.get(key);
	const value = make();
	if (pairLimitMemo.size >= 160) pairLimitMemo.delete(pairLimitMemo.keys().next().value);
	pairLimitMemo.set(key, value);
	return value;
}

/**
 * Designs already made with a whitelist, by their inputs: the limits of a
 * page's rerun, the cells of both topologies and every share an oscillator
 * leaves ask for the same ones again. The oldest goes first once full.
 */
const pairBuildMemo = new Map();
function pairBuildRemember(key, make) {
	if (pairBuildMemo.has(key)) {
		const hit = pairBuildMemo.get(key);
		pairBuildMemo.delete(key);
		pairBuildMemo.set(key, hit);
		return hit;
	}
	const value = make();
	pairBuildMemo.set(key, value);
	if (pairBuildMemo.size > 600) pairBuildMemo.delete(pairBuildMemo.keys().next().value);
	return value;
}

/**
 * The names of `order` that a circuit has a resistor for, in that order:
 * those `parts` gives for any of `designs`. These are the whitelists a
 * limit tries, every subset of them, not only the subsets of the pairs
 * where they help: a part solved from one given up can call for two in
 * series where it did not before (the JFET modulator's R_ac, from the gate
 * drive's other half).
 */
function pairCandidateNames(order, parts, designs) {
	const has = new Set(designs.flatMap((d) => parts(d).map(([name]) => name)));
	return order.filter((name) => has.has(name));
}

/**
 * One circuit under the limit: `build` (pairs) => its design for true or
 * a whitelist, `parts` (design) => its resistors that may pair as [name,
 * ohms], `order` every name its whitelist takes, as the tool lists them.
 * With `open`, the design with pairs where they help is not the answer
 * when it fits: the best whitelist of at most `limit` names is, whatever
 * it holds. Returns the design, the `pairs` to redo it with (true, or the
 * whitelist kept), the names that pair with pairs where they help, the
 * ones the design keeps and drops of those, the ones it adds that pairs
 * where they help leave single, the count kept, the measure and whether
 * the limit took pairs away.
 */
function pairLimitCircuit(build, parts, measure, list, limit, order, open = false) {
	const made = new Map();
	const make = (allowed) => {
		const key = JSON.stringify(allowed);
		if (!made.has(key)) made.set(key, build(allowed));
		return made.get(key);
	};
	const full = make(true);
	const names = pairedNames(parts(full), list);
	const limited = limit !== null && limit !== undefined && (open || names.length > limit);
	const candidates = limited ? pairCandidateNames(order, parts, [full, make([])]) : undefined;
	let stage;
	let result;
	if (open && limited) {
		const table = pairCountTable(candidates, make, measure, undefined, limit);
		stage = table[allocatePairs([table], limit)[0]];
		result = { limited: true };
	} else {
		result = limitPairs([{ names, candidates, full, build: make, measure }], limit);
		stage = result.stages[0];
	}
	const kept = pairedNames(parts(stage.design), list);
	return {
		design: stage.design,
		pairs: result.limited ? stage.allowed : true,
		names,
		kept,
		dropped: names.filter((name) => !kept.includes(name)),
		added: kept.filter((name) => !names.includes(name)),
		count: kept.length,
		measure: stage.measure,
		limited: result.limited
	};
}

/** The same for a circuit with pairs off, or a full series: the design as it is, nothing to limit. */
function pairLimitNone(design, measure) {
	return { design, pairs: false, names: [], kept: [], dropped: [], added: [], count: 0, measure: measure(design), limited: false };
}

/* ------------------------------------------------------- JFET modulator */

/** Every name the JFET modulator's `pairs` whitelist takes, in the order the page lists the parts. */
const JFET_PAIR_ORDER = ['Rac', 'Rbias', 'Rb', 'Rdt', 'Rtop'];

/** The JFET modulator's resistors that may be two in series, as [name, ohms], by the names its `pairs` whitelist takes. */
export function jfetPairParts(design) {
	if (!design) return [];
	const s = design.conditioning.summer;
	return [
		['Rac', s.rac],
		['Rbias', s.rbias],
		['Rb', design.rb],
		['Rdt', design.carrier.divider.top],
		['Rtop', design.postGain?.rtop]
	].filter(([, v]) => v > 0);
}

/** How far a JFET modulator lands from its targets (see the top of this file); Infinity for no design. */
export function jfetPairMeasure(design) {
	if (!design) return Infinity;
	const s = design.conditioning.summer;
	const sq = (actual, target) => Math.log(actual / target) ** 2;
	let m = sq(s.gainActual, s.gainTarget) + sq(-s.biasActual, s.biasTarget);
	// x_target = n / (s - n), so n's target is s x / (1 + x) at x_target
	if (design.xTarget !== null) m += sq(design.modulationIndex, (design.gDepth * design.xTarget) / (1 + design.xTarget));
	if (design.carrier.divider.top > 0) m += sq(design.carrier.ac, design.carrier.acMax);
	if (design.postGain?.needed) m += sq(design.postGain.kActual, design.postGain.kTarget);
	return m + PAIR_CHECK_COST * (Number(!s.headroomOk) + Number(!s.fcOk));
}

/**
 * The JFET modulator under "up to `limit` pairs" (null: no limit).
 * params are designJfetModulator's, `pairs` on with a list for the limit
 * to mean anything.
 */
export function limitJfetPairs(params, limit) {
	return jfetUnderLimit(params, limit, false);
}

/**
 * The JFET modulator with at most `budget` of its resistors allowed to
 * pair, the best of every whitelist that fits, even when the design with
 * pairs where they help fits too (limitJfetWithCarrier weighs that one on
 * its own).
 */
export function jfetCellWithin(params, budget) {
	return jfetUnderLimit(params, budget, true);
}

function jfetUnderLimit(params, limit, open) {
	const { onFail, pairs, ...rest } = params;
	void onFail;
	if (!pairs || !Array.isArray(rest.resistorSeries)) return pairLimitNone(designJfetModulator({ ...rest, pairs }), jfetPairMeasure);
	const base = JSON.stringify(rest);
	const build = (allowed) => pairBuildRemember(`jfet ${JSON.stringify(allowed)} ${base}`, () => designJfetModulator({ ...rest, pairs: allowed }));
	return pairLimitRemember(`jfet ${open ? 'within ' : ''}${limit} ${base}`, () => pairLimitCircuit(build, jfetPairParts, jfetPairMeasure, rest.resistorSeries, limit, JFET_PAIR_ORDER, open));
}

/* --------------------------------------------- the carrier oscillator */

/**
 * The Wien carrier's resistors that may be two in series, by the names its
 * `pairs` whitelist takes, each with the values it sets: R (the series and
 * the shunt arm, two resistors of one value), Rf1 and Rf2. None for one
 * shown from the E24 fallback.
 */
export function carrierPairSlots(osc) {
	if (!osc || osc.stockShortfall) return [];
	return [
		['R', [osc.r, osc.r]],
		['Rf1', [osc.parts.rf1]],
		['Rf2', [osc.parts.rf2]]
	];
}

const carrierSlotsPaired = (osc, list) => carrierPairSlots(osc).filter(([, values]) => values.some((v) => seriesPair(v, list))).map(([slot]) => slot);
const carrierPairCount = (osc, list) => carrierPairSlots(osc).reduce((n, [, values]) => n + values.filter((v) => seriesPair(v, list)).length, 0);

/**
 * How far a carrier oscillator lands from its frequency, its amplitude and
 * its start gain, PAIR_CHECK_COST more when it does not start and hold,
 * PAIR_SHORTFALL_COST more when it is shown on E24 and E6 instead of the
 * list; Infinity for none. `excessGain` is the one it was designed with.
 */
export function carrierPairMeasure(osc, excessGain = 0.05) {
	if (!osc) return Infinity;
	const works = Boolean(osc.starts && osc.limiter.regulates && osc.opamp.swingOk);
	const sq = (ratio) => (ratio > 0 && Number.isFinite(ratio) ? Math.log(ratio) ** 2 : 0);
	const start = osc.limiter.kind === 'diodes' ? sq(osc.startGain / (osc.requiredGain * (1 + excessGain))) : 0;
	return sq(osc.f0 / osc.frequency) + sq(osc.amplitudeHeld / osc.amplitude) + start + PAIR_CHECK_COST * Number(!works) + PAIR_SHORTFALL_COST * Number(Boolean(osc.stockShortfall));
}

/**
 * The carrier oscillator's choices under a limit, one per subset of its
 * slots (none first, all last), each from designCarrier(pairs): false, a
 * whitelist, or true. Every slot of an oscillator built from the list is
 * tried, not only those that are pairs with pairs where they help: with R
 * single the frequency moves and the limiter is solved again, and then Rf2
 * can call for two in series where it did not before. A design that pairs
 * a slot it was not allowed is no choice, so an oscillator designer that
 * takes no whitelist leaves only none and all.
 * Each: { pairs, slots (paired), dropped and added (against pairs where
 * they help), oscillator, count, cost, measure }: count is the resistors
 * that come out as pairs, cost what the choice takes from the limit, the
 * resistors its whitelist lets pair (as the oscillator tool counts them),
 * or for pairs where they help the count. The names are the oscillator
 * designer's own (PAIR_PARTS in oscillator/topologies.js), R counting twice.
 */
export function carrierPairOptions(designCarrier, list) {
	const full = designCarrier(true);
	const paired = carrierSlotsPaired(full, list);
	const slots = carrierPairSlots(full).map(([slot]) => slot);
	const options = [];
	for (let m = 0; m <= slots.length; m++) {
		for (const subset of pairSubsets(slots, m)) {
			const pairs = m === slots.length ? true : m === 0 ? false : subset;
			const oscillator = m === slots.length ? full : designCarrier(pairs);
			const realized = carrierSlotsPaired(oscillator, list);
			if (!realized.every((slot) => subset.includes(slot))) continue;
			options.push({
				pairs,
				slots: realized,
				dropped: paired.filter((slot) => !realized.includes(slot)),
				added: realized.filter((slot) => !paired.includes(slot)),
				oscillator,
				count: carrierPairCount(oscillator, list),
				cost: m === slots.length ? carrierPairCount(oscillator, list) : subset.reduce((n, slot) => n + (slot === 'R' ? 2 : 1), 0),
				measure: carrierPairMeasure(oscillator)
			});
		}
	}
	return options;
}

/** Whether measure a is clearly below b, a relative 1e-9 counting as a tie. */
function pairLimitLess(a, b) {
	if (a === b || a === Infinity) return false;
	if (b === Infinity) return true;
	return a < b - 1e-9 * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * The JFET modulator and its carrier oscillator on one board, under one
 * limit for both. `options` from carrierPairOptions (the one with every
 * slot last), carrierOf(oscillator) the amplitude the divider then gets.
 * When both full designs hold `limit` pairs or fewer, they are the answer.
 * Otherwise every choice of the oscillator whose cost fits is tried with
 * the best modulator the pairs it leaves allow, on the carrier it gives,
 * and the lowest sum of the two measures is kept; a tie goes to fewer pairs
 * in all, then to the oscillator holding fewer, the modulator's parts
 * being listed first. The best modulator is what limitJfetPairs gives for
 * some share up to what is left, the full one included: alone it gives the
 * full one as soon as that fits, and that one can miss by more than a
 * whitelist short of it, so a larger limit could end worse than a smaller
 * one. `budget` is the modulator's share as a downloaded script takes it:
 * with that limit and that carrier the script makes the same modulator
 * (one under the modulator's own count where a whitelist short of it beats
 * its full design). Where the best modulator holds as many names as its
 * full design or more, and is not that design, no limit gives it: budget
 * is then null and `scriptPairs` the whitelist the script designs with.
 */
export function limitJfetWithCarrier(params, limit, options, carrierOf) {
	const fullOption = options[options.length - 1];
	const pack = (option, cell, budget, limited) => {
		const carrier = carrierOf(option.oscillator);
		return {
			...cell,
			oscillator: option.oscillator,
			carrier,
			carrierPairs: option.pairs,
			carrierKept: option.slots,
			carrierDropped: fullOption.slots.filter((slot) => !option.slots.includes(slot)),
			carrierAdded: option.slots.filter((slot) => !fullOption.slots.includes(slot)),
			carrierCount: option.count,
			cellCount: cell.count,
			count: option.count + cell.count,
			measure: option.measure + cell.measure,
			budget,
			limited
		};
	};
	const cellOn = (option, budget) => limitJfetPairs({ ...params, carrierSourceAmplitude: carrierOf(option.oscillator) }, budget);
	const budgetOf = (option) => (limit === null ? null : Math.max(0, limit - option.count));
	const full = pack(fullOption, cellOn(fullOption, null), budgetOf(fullOption), false);
	if (limit === null || full.count <= limit) return full;
	// the modulator on this carrier with at most `left` pairs, and what a
	// script needs to make it, each taken only where it does clearly better
	// than the one before: the best whitelist short of its count of pairs
	// (a limit that low), the full design where it fits (a limit at the
	// count or above), then any whitelist that fits, which no limit gives
	// once the full design fits: the script then gets that whitelist itself
	const bestCell = (option, left) => {
		const whole = cellOn(option, null);
		const count = whole.names.length;
		let pick = count > 0 ? { cell: cellOn(option, Math.min(left, count - 1)), budget: Math.min(left, count - 1), scriptPairs: null } : null;
		if (count <= left) {
			if (!pick || pairLimitLess(whole.measure, pick.cell.measure)) pick = { cell: whole, budget: left, scriptPairs: null };
			const within = jfetCellWithin({ ...params, carrierSourceAmplitude: carrierOf(option.oscillator) }, left);
			if (pairLimitLess(within.measure, pick.cell.measure)) pick = { cell: within, budget: null, scriptPairs: within.pairs };
		}
		return pick;
	};
	const cellFull = full.names;
	let best = null;
	for (const option of options) {
		const cost = option.cost ?? option.count;
		if (cost > limit) continue;
		const { cell, budget, scriptPairs } = bestCell(option, limit - cost);
		const candidate = pack(option, cell, budget, true);
		candidate.scriptPairs = scriptPairs;
		// the modulator's names against the design with pairs where they help on the full carrier
		const against = [...new Set([...cellFull, ...cell.names])];
		candidate.dropped = against.filter((name) => !cell.kept.includes(name));
		candidate.added = cell.kept.filter((name) => !against.includes(name));
		if (!best || pairLimitLess(candidate.measure, best.measure) || (!pairLimitLess(best.measure, candidate.measure) && candidate.count < best.count)) best = candidate;
	}
	return best ?? full;
}

/* ------------------------------------------------------ diode modulator */

/** The diode modulator's resistors that may be two in series: R_p and R_m. */
export function diodePairParts(design) {
	return design ? [['Rp', design.summer.rp], ['Rm', design.summer.rm]] : [];
}

/** How far a diode modulator lands from its targets (see the top of this file); Infinity for no design. */
export function diodePairMeasure(design) {
	if (!design) return Infinity;
	const lost = DIODE_CHECKS.filter((ok) => !ok(design)).length + Number(design.modulationIndex > 1);
	return Math.abs(design.modulationIndex - design.targetModulationIndex) + 0.02 * Math.abs(Math.log(design.summer.drive / design.summer.driveTarget)) + PAIR_CHECK_COST * lost;
}

/** The diode modulator under "up to `limit` pairs": params are designDiodeMixerModulator's. */
export function limitDiodePairs(params, limit) {
	const { pairs, ...rest } = params;
	const list = rest.resistorSeries;
	if (!pairs || !Array.isArray(list)) return pairLimitNone(designDiodeMixerModulator({ ...rest, pairs }), diodePairMeasure);
	return pairLimitRemember(`diode ${limit} ${JSON.stringify(rest)}`, () =>
		pairLimitCircuit((allowed) => designDiodeMixerModulator({ ...rest, pairs: allowed }), diodePairParts, diodePairMeasure, list, limit, ['Rp', 'Rm'])
	);
}

/* ------------------------------------------------- envelope low-pass */

/** A stage's resistors that may be two in series, by the filter's names (R1k, R2k, R3k for stage k from 1); none for a stage from the E24 fallback. */
export function envelopePairParts(stage, k) {
	if (!stage || stage.stockShortfall) return [];
	const c = stage.components;
	return [[`R1${k + 1}`, c.R1], [`R2${k + 1}`, c.R2], ...(stage.topology === 'mfb' ? [[`R3${k + 1}`, c.R3]] : [])];
}

/** How far a stage lands from `target` ({ wn, q }): the squares of its f0 and Q misses, as logs, summed, PAIR_SHORTFALL_COST more for a stage shown on E24 instead of the list. */
export function envelopeStageMeasure(target, stage) {
	if (!stage) return Infinity;
	return Math.log(stage.actual.wn / target.wn) ** 2 + Math.log(stage.actual.q / target.q) ** 2 + PAIR_SHORTFALL_COST * Number(Boolean(stage.stockShortfall));
}

/**
 * The envelope low-pass under "up to `limit` pairs", over all its stages:
 * each stage's best design for every count of its pairs, then the counts
 * shared out by limitPairs. spec is designEnvelopeLowPass's.
 */
export function limitEnvelopePairs(spec, limit) {
	const { pairs, ...rest } = spec;
	const list = rest.resistorSeries;
	const none = (design) => ({ design, pairs: Boolean(pairs) && Array.isArray(list), names: [], kept: [], dropped: [], added: [], count: 0, measure: 0, limited: false });
	if (!pairs || !Array.isArray(list)) return none(designEnvelopeLowPass(spec));
	return pairLimitRemember(`envelope ${limit} ${JSON.stringify(rest)}`, () => {
		const full = designEnvelopeLowPass({ ...rest, pairs: true });
		if (full.tooHigh) return none(full);
		const stages = full.realized.map((stage, k) => ({
			names: pairedNames(envelopePairParts(stage, k), list),
			// every resistor of a stage built from the list, paired or not with pairs where they help
			candidates: envelopePairParts(stage, k).map(([name]) => name),
			full: stage,
			build: (allowed) => designEnvelopeStage(full.stages[k], k, { topology: rest.topology, resistorSeries: list, capacitors: rest.capacitors, pairs: allowed }),
			measure: (design) => envelopeStageMeasure(full.stages[k], design)
		}));
		const result = limitPairs(stages, limit);
		const allowed = result.stages.flatMap((s) => s.allowed);
		const design = result.limited ? designEnvelopeLowPass({ ...rest, pairs: allowed }) : full;
		const names = stages.flatMap((s) => s.names);
		const kept = design.realized.flatMap((stage, k) => pairedNames(envelopePairParts(stage, k), list));
		return { design, pairs: result.limited ? allowed : true, names, kept, dropped: names.filter((name) => !kept.includes(name)), added: kept.filter((name) => !names.includes(name)), count: kept.length, measure: result.measure, limited: result.limited };
	});
}

/* ------------------------------------------------------- what is said */

const PAIR_NAME_LABELS = {
	Rac: 'R_ac',
	Rbias: 'R_bias',
	Rb: 'R_b',
	Rdt: "the carrier divider's top",
	Rtop: "the post-gain stage's R_top",
	Rp: 'R_p',
	Rm: 'R_m',
	'carrier R': "the oscillator's two R",
	'carrier Rf1': "the oscillator's Rf1",
	'carrier Rf2': "the oscillator's Rf2"
};

/** a, a and b, a, b and c */
function pairListText(items) {
	return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Names as a sentence gives them: the labels above, and the filter's
 * R1k, R2k, R3k grouped by stage ("R1 and R2 of stage 1").
 */
export function pairNamesText(names) {
	const groups = new Map();
	const out = [];
	for (const name of names) {
		const m = /^R([123])(\d+)$/.exec(name);
		if (!m) {
			out.push(PAIR_NAME_LABELS[name] ?? name);
			continue;
		}
		let group = groups.get(m[2]);
		if (!group) {
			group = { stage: m[2], parts: [] };
			groups.set(m[2], group);
			out.push(group);
		}
		group.parts.push(`R${m[1]}`);
	}
	return pairListText(out.map((item) => (typeof item === 'string' ? item : `${pairListText(item.parts)} of stage ${item.stage}`)));
}

/** Whether names stand for more than one resistor: more than one name, or the oscillator's two R. */
const pairNamesPlural = (names) => names.length > 1 || names.includes('carrier R');

/**
 * The sentences that say what a limit kept, when it took pairs away (null
 * otherwise). `kept` and `dropped` are names as the results above give
 * them, the carrier's slots as 'carrier R' and so on; `added` those of
 * `kept` that pairs where they help leave single (a part solved after one
 * given up can call for two in series). `together` adds that equal
 * resistors pair together or not at all, for a limit left partly unused
 * because of that.
 */
export function pairLimitNote({ limit, kept, dropped, added = [], together = false }) {
	if (!(limit >= 0) || !dropped.length) return null;
	const head = `At most ${limit} ${limit === 1 ? 'pair' : 'pairs'}: `;
	const stay = kept.filter((name) => !added.includes(name));
	const fresh = kept.filter((name) => added.includes(name));
	const said = [];
	if (stay.length) said.push(`${pairNamesText(stay)} ${pairNamesPlural(stay) ? 'stay' : 'stays'} two in series`);
	if (fresh.length) said.push(`${pairNamesText(fresh)} ${pairNamesPlural(fresh) ? 'become' : 'becomes'} two in series${stay.length ? ' too' : ''}`);
	const first = kept.length ? `${head}${said.join(', and ')}.` : `${head}every resistor is a single part here.`;
	const rest = pairNamesText(dropped);
	const many = pairNamesPlural(dropped);
	const second = `${rest[0].toUpperCase()}${rest.slice(1)} ${many ? 'are single parts' : 'is a single part'}, though two in series would bring ${many ? 'them' : 'it'} closer.`;
	return `${first} ${second}${together ? ' Equal resistors pair together or not at all, and each one counts.' : ''}`;
}
