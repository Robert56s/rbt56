import { allocatePairs, pairSubsets, seriesPair } from './eseries';

/**
 * "Up to N pairs" for a whole filter: the stock picker's cap on how many
 * resistors may be two in series (pairedResistor and limitPairs in
 * eseries.js). The count is of resistors as they are built: an MFB
 * low-pass whose R1 is a pair has R3 paired too (one value), so it counts
 * two, and a Tow-Thomas R counts its two or three equal parts.
 *
 * Every designer takes, besides true and false, a list of the names
 * allowed to pair. A name is the first of the parts one value sets, as
 * filterPairGroups lists them below.
 *
 * The plan starts from the design with pairs where they help. With N or
 * fewer pairs in all, that design is the answer as it stands. Otherwise,
 * stage by stage, every subset of the names it may pair is built (the
 * designer rerun with that list, so every part is solved again as the
 * designer does): every group of its topology, whether or not pairs where
 * they help made it a pair (filterPairCandidates). The stage keeps, for each
 * number of pairs, the subset that lands it closest to its targets.
 * allocatePairs then shares the N pairs out over the stages. A tie goes to
 * fewer pairs, then to the earlier stage, then to the parts the stage lists
 * first.
 *
 * The measure is the one each designer already uses to keep its pairs or
 * drop them (filterStageMiss): the largest of the log misses of f0, Q, a
 * zero, the gain a stage is held at, or tau, squared and summed over the
 * stages. A stage the list builds with pairs where they help, but not with
 * the pairs it is given, is shown on the full E24 and E6 grids
 * (stockShortfall), and that costs more than any miss
 * (FILTER_SHORTFALL_COST): its finer grid would otherwise land it closer
 * than the list ever can, and win. So the pairs go first to the stages that
 * need them to be built from the list at all. A stage the list cannot build
 * even then is on the grids whatever the limit, and costs its miss alone.
 */

/** The resistors one value sets, by topology, in the order the component table lists them: name is the one a `pairs` list holds. */
const FILTER_PAIR_GROUPS = {
	firstOrder: [{ name: 'R', parts: ['R'] }],
	firstOrderHp: [{ name: 'R', parts: ['R'] }],
	mfb: [{ name: 'R1', parts: ['R1', 'R3'] }, { name: 'R2', parts: ['R2'] }],
	mfbHp: [{ name: 'R1', parts: ['R1'] }, { name: 'R2', parts: ['R2'] }],
	sallenKey: [{ name: 'R1', parts: ['R1', 'R2'] }],
	sallenKeyHp: [{ name: 'Rtop', parts: ['Rtop'] }, { name: 'Rbottom', parts: ['Rbottom'] }],
	towThomas: [{ name: 'Ra', parts: ['R1', 'Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
	towThomasHp: [{ name: 'Ra', parts: ['Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
	towThomasNotch: [{ name: 'Rz', parts: ['Rz'] }, { name: 'Ra', parts: ['Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
	towThomasBp: [{ name: 'R1', parts: ['R1'] }, { name: 'Ra', parts: ['Ra', 'Rb'] }, { name: 'Rd', parts: ['Rd'] }],
	mfbBp: ['R1', 'R2', 'R3'].map((n) => ({ name: n, parts: [n] })),
	boctor: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map((n) => ({ name: n, parts: [n] })),
	boctorHp: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map((n) => ({ name: n, parts: [n] })),
	// the narrow band-pass stages: the parts their designers may pair
	rlcGyrator: ['Ra', 'Rb', 'R2'].map((n) => ({ name: n, parts: [n] })),
	rlcGic: ['Ra', 'Rb', 'R4'].map((n) => ({ name: n, parts: [n] })),
	sallenKeyBp: ['Ra', 'Rb', 'R2', 'R3', 'Rf'].map((n) => ({ name: n, parts: [n] })),
	khnBp: [{ name: 'R2', parts: ['R2'] }, { name: 'R3', parts: ['R3'] }, { name: 'R4', parts: ['R4', 'R7'] }, { name: 'R5', parts: ['R5'] }],
	gainNonInv: [{ name: 'R2', parts: ['R2'] }]
};

/** The groups of a built stage whose value is two in series, each { name, parts }. A stage that fell back to the full series has none. */
export function filterPairGroups(design, option) {
	if (!design || !design.components || design.stockShortfall) return [];
	return (FILTER_PAIR_GROUPS[design.topology] ?? []).filter((g) => g.parts.some((p) => seriesPair(design.components[p], option)));
}

/**
 * The groups a limit tries as pairs on a built stage: every group its
 * topology has, not only those pairs where they help made pairs. A part is
 * solved from the ones rounded before it, and a stage keeps its pairs only
 * when they leave it no worse as a whole, so with one group given up another
 * can call for two in series that did not before (a Tow-Thomas Rd, solved
 * from Ra), and a stage with no pair at all can gain from one alone. A
 * Boctor stage keeps to the groups that are pairs where they help: its six
 * resistors would make up to 64 lists, each a search over every capacitor,
 * which more than doubles the plan's time (three seconds for an inverse
 * Chebyshev low-pass on E6 capacitors), for 6 plans in 2,635 of a sweep
 * that came out closer that way. None for a stage on the full grids.
 */
const FILTER_WIDE_MAX_GROUPS = 3;
function filterPairCandidates(design, paired) {
	if (!design || !design.components || design.stockShortfall) return [];
	const all = FILTER_PAIR_GROUPS[design.topology] ?? [];
	return all.length <= FILTER_WIDE_MAX_GROUPS ? all : paired;
}

/** How many resistors of a built stage are two in series, as its table shows them. */
export function filterPairCount(design, option) {
	if (!design || !design.components || design.stockShortfall) return 0;
	return Object.entries(design.components).filter(([name, v]) => /^R/.test(name) && seriesPair(v, option)).length;
}

/**
 * How far a built stage lands from its target stage, as its designer
 * judges it: the largest log miss of f0 and Q, and by topology of the
 * zero (a notch), the gain the stage is held at (a band-pass stage at its
 * centre, a Boctor low-pass notch at DC) or tau (first order). A Boctor
 * notch also counts the s term rounding leaves in its numerator, and an
 * MFB band-pass stage built for an op-amp its f0 miss 2Q times, as
 * mfbBandPass.js does. Infinity for a stage that is not built.
 */
export function filterStageMiss(stage, design) {
	if (!design || !design.actual) return Infinity;
	const a = design.actual;
	const off = (value, target) => Math.abs(Math.log(value / target));
	let miss;
	if (design.order === 1) miss = off(a.tau, stage.tau);
	else {
		const f0Weight = design.topology === 'mfbBp' && Number.isFinite(a.gbw) ? Math.max(1, 2 * stage.q) : 1;
		miss = Math.max(f0Weight * off(a.wn, stage.wn), off(a.q, stage.q));
		if (design.topology === 'towThomasNotch') miss = Math.max(miss, off(a.wz, stage.wz));
		if (design.topology === 'towThomasBp' || design.topology === 'mfbBp') miss = Math.max(miss, off(Math.abs(a.gain), stage.gain));
		if (design.topology === 'boctor' || design.topology === 'boctorHp') {
			miss = Math.max(miss, off(a.wz, stage.wz), Math.abs(a.numeratorS / (a.gain * stage.wz)), design.lowSide ? Math.abs(Math.log(a.dcGain)) : 0);
		}
	}
	return Number.isFinite(miss) ? miss : Infinity;
}

/**
 * What a stage shown on the full grids instead of the list adds to its
 * measure: more than any built stage misses by (a log miss of 30 is a
 * factor of 10^13), and small enough that the misses beside it still count.
 */
const FILTER_SHORTFALL_COST = 1000;

/**
 * A stage's share of the plan's measure: its miss squared, plus
 * FILTER_SHORTFALL_COST when it is on the full grids though the list
 * builds `full`, the stage with pairs where they help.
 */
export function filterStageMeasure(stage, design, full = null) {
	const miss = filterStageMiss(stage, design) ** 2;
	return design && design.stockShortfall && full && !full.stockShortfall ? FILTER_SHORTFALL_COST + miss : miss;
}

/** Measures closer than this, relative to the larger, are a tie, as in eseries.js. */
const FILTER_PAIR_TIE = 1e-9;
const filterPairLess = (a, b) => a !== b && a !== Infinity && (b === Infinity || a < b - FILTER_PAIR_TIE * Math.max(Math.abs(a), Math.abs(b)));

/**
 * The plan for a whole filter.
 *   stages   its target stages (design.stages)
 *   build    (i, pairs) => stage i as it will be shown, built with that
 *            `pairs` option (true or a list of names), or null
 *   option   the list of resistor values
 *   limit    the most pairs in the whole filter, or null for no limit
 * Returns { limited, limit, total, count, measure, stages }: total is what
 * pairs where they help would use, count what the plan keeps, measure the
 * stage measures summed (filterStageMeasure); stages[i] = { option, design,
 * count, kept, dropped, short }, option being what to build stage i with
 * (true where the stage keeps every pair, else its list of names), kept and
 * dropped its paired groups, and short whether the stage is on the full
 * grids only for want of pairs (the list builds it with pairs where they
 * help).
 */
export function planFilterPairs(stages, build, option, limit) {
	const full = stages.map((_, i) => build(i, true));
	const groups = full.map((d) => filterPairGroups(d, option));
	const counts = full.map((d) => filterPairCount(d, option));
	const total = counts.reduce((n, c) => n + c, 0);
	const measureOf = (i, d) => filterStageMeasure(stages[i], d, full[i]);
	const result = (rows, limited) => ({
		limited,
		limit,
		total,
		count: rows.reduce((n, r) => n + r.count, 0),
		measure: rows.reduce((n, r, i) => n + (r.measure ?? measureOf(i, r.design)), 0),
		stages: rows.map((r, i) => {
			const kept = filterPairGroups(r.design, option);
			const short = Boolean(r.design && r.design.stockShortfall && full[i] && !full[i].stockShortfall);
			return { option: r.option, design: r.design, count: r.count, kept, dropped: groups[i].filter((g) => !kept.some((k) => k.name === g.name)), short };
		})
	});
	if (limit === null || limit === undefined || total <= limit) return result(full.map((design, i) => ({ option: true, design, count: counts[i] })), false);

	// a stage with no group to try has one way to be built, and no say in the sharing
	const pools = full.map((d, i) => filterPairCandidates(d, groups[i]));
	const open = pools.map((p, i) => (p.length ? i : -1)).filter((i) => i >= 0);
	const tables = open.map((i) => {
		const pool = pools[i];
		const names = pool.map((g) => g.name);
		const size = Object.fromEntries(pool.map((g) => [g.name, g.parts.length]));
		const single = build(i, []);
		// rows by the number of resistors that are pairs; 0 is single parts
		const rows = [{ count: 0, option: [], design: single, measure: measureOf(i, single) }];
		const consider = (row) => {
			if (row.count > 0 && row.count <= limit && (!rows[row.count] || filterPairLess(row.measure, rows[row.count].measure))) rows[row.count] = row;
		};
		for (let m = 1; m <= names.length; m++) {
			for (const allowed of pairSubsets(names, m)) {
				if (m === names.length) {
					consider({ count: counts[i], option: true, design: full[i], measure: measureOf(i, full[i]) });
					continue;
				}
				// a list whose parts already pass the limit cannot be kept
				if (allowed.reduce((n, name) => n + size[name], 0) > limit) continue;
				const design = build(i, allowed);
				consider({ count: filterPairCount(design, option), option: allowed, design, measure: measureOf(i, design) });
			}
		}
		return rows;
	});
	const chosen = allocatePairs(tables, limit);
	const rows = full.map((design, i) => ({ option: true, design, count: 0, measure: measureOf(i, design) }));
	open.forEach((i, k) => {
		rows[i] = tables[k][chosen[k]];
	});
	return result(rows, true);
}

/** Names of resistors as a sentence lists them: R1, R3 and R2. */
function filterPairNames(groups) {
	const names = groups.flatMap((g) => g.parts);
	return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
}

/** What the plan did, in two or three sentences, or '' without a plan. */
export function filterPairPlanSummary(plan) {
	if (!plan) return '';
	const resistors = (n) => `${n} resistor${n === 1 ? '' : 's'}`;
	if (!plan.limited) {
		return plan.total
			? `Pairs where they help make ${resistors(plan.total)} two in series here, within the limit of ${plan.limit}, so every one stays.`
			: `No resistor here needs two in series, so the limit of ${plan.limit} changes nothing.`;
	}
	const head = `Pairs where they help would make ${resistors(plan.total)} two in series here, more than the limit of ${plan.limit}.`;
	const kept = plan.stages.flatMap((s, i) => (s.kept.length ? [`${filterPairNames(s.kept)} of stage ${i + 1}`] : []));
	// stages the list builds only with more pairs than the limit leaves them
	const short = plan.stages.flatMap((s, i) => (s.short ? [i + 1] : []));
	const shortText = short.length
		? ` ${short.length > 1 ? `Stages ${short.slice(0, -1).join(', ')} and ${short[short.length - 1]} need` : `Stage ${short[0]} needs`} more pairs than that to be built from the list, so ${short.length > 1 ? 'they are' : 'it is'} shown with the full E24 and E6 grids.`
		: '';
	if (!kept.length) {
		return short.length ? `${head}${shortText} Every other resistor is a single part.` : `${head} None that fits the limit brings the filter closer to its targets, so every resistor is a single part.`;
	}
	return `${head} ${plan.count === 1 ? 'The one kept brings' : `The ${plan.count} kept bring`} the filter closest to its targets: ${kept.join(', ')}.${shortText} Every other resistor is a single part.`;
}

/** The sentence for a stage whose pairs the limit cut, or '' when it kept them all. */
export function filterPairLimitSentence(planStage, limit) {
	if (!planStage || !planStage.dropped.length) return '';
	const cap = `The limit of ${limit} pair${limit === 1 ? '' : 's'} for the whole filter`;
	const several = planStage.dropped.flatMap((g) => g.parts).length > 1;
	if (planStage.short) return `${cap} leaves this stage too few pairs to be built from the list, so it is shown with the full E24 and E6 grids: ${filterPairNames(planStage.dropped)} would otherwise be two in series.`;
	if (!planStage.kept.length) return `${cap} leaves this stage on single parts: ${filterPairNames(planStage.dropped)} would otherwise be two in series.`;
	return `${cap} keeps ${filterPairNames(planStage.kept)} as two in series here, and ${filterPairNames(planStage.dropped)} ${several ? 'are single parts' : 'is a single part'}.`;
}
