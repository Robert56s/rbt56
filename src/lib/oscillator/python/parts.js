import { comment, pyRaise, section } from '../../filter/python/emit';
import { pyDef } from './write';

/**
 * Section 3 of the oscillator's file, R and C from the stock: the file's
 * own rule, the filter's rule where R and C are free (every capacitor of
 * the stock tried, R from R C, rounded to the stock, the closest kept from
 * those within the page's limits, CAP_MIN to CAP_MAX and R_MIN to R_MAX of
 * topologies.js, else from all, flagged, the R nearest 10 kohm breaking a
 * tie to 1e-9), then Rg as the page takes it (the stocked resistor nearest
 * 10 kohm, or R itself on a ladder; the quadrature loop's inverter pair Ra
 * = Rb the same way) and, but for the quadrature loop, the gain the loop
 * needs with them (`required_gain`). nearest() is the rounding every later
 * section uses too; pick_rc() prints what it keeps, so a diode limiter's
 * section 5, which calls it again, prints its new R and C as well.
 */

/** What Rg is, in the comment, by loop and control. */
function rgWords(ctx) {
	if (ctx.kind === 'ladder') return "Rg is R itself: the ladder's last R is the amplifier's input resistor.";
	if (ctx.kind === 'quadrature') return "The inverter's pair, Ra = Rb, is the stocked resistor nearest 10 kohm, as on the page.";
	if (ctx.control === 'lamp') return 'The lamp is the lower leg here; Rf is sized against Rg, the stocked resistor nearest 10 kohm, as on the page (section 4).';
	if (ctx.control === 'jfet') return "The JFET's leg is the lower leg here; Rf is sized against Rg, the stocked resistor nearest 10 kohm, as on the page (section 4).";
	return 'Rg, the lower leg of the feedback, is the stocked resistor nearest 10 kohm, as on the page.';
}

/** Section 3. */
export function partsSection(file, ctx) {
	const n = ctx.numbers.parts;
	file.add(
		[
			section(`${n} R and C from the stock`),
			comment(
				[
					"The file's own rule:",
					'  a. every capacitor of the stock is tried, R = R C / C;',
					'  b. R is rounded to its stocked neighbour that lands R C closest, the nearer by ratio;',
					"  c. the capacitor whose R lands closest is kept, of those within the page's limits (C 100 pF to 1 uF, R 1 kohm to 1 Mohm), else of all, flagged; the R nearest 10 kohm breaks a tie (two choices a decade apart).",
					rgWords(ctx)
				].join('\n')
			)
		].join('\n')
	);
	file.add(pyDef('nearest(x, stock)', 'The stocked value nearest x by ratio, the lower one of a tie.', ['return min(stock, key=lambda v: abs(math.log(v / x)))']));
	file.add(
		pyDef('pick_rc(rc)', 'Rules a to c for a target R C: R and C, printed with how far they land.', [
			'choices = []',
			'for c in capacitors:',
			'    exact = rc / c',
			'    r = nearest(exact, resistors)',
			'    choices.append({"R": r, "C": c, "miss": abs(math.log(r / exact)),',
			'                    "within": 100e-12 <= c <= 1e-6 and 1e3 < exact < 1e6})  # (rule c\'s limits)',
			'kept = [choice for choice in choices if choice["within"]] or choices',
			'least = min(choice["miss"] for choice in kept)',
			'closest = [choice for choice in kept if choice["miss"] <= least + 1e-9]',
			'best = min(closest, key=lambda choice: math.log(rc / choice["C"] / 10e3) ** 2)',
			'flag = "" if best["within"] else " (none keeps the limits: the closest of all, flagged)"',
			'print(f"  C = {eng(best[\'C\'], \'F\')}, R = {eng(rc / best[\'C\'], \'ohm\')} rounded to "',
			'      f"{eng(best[\'R\'], \'ohm\')} ({100 * (best[\'R\'] * best[\'C\'] / rc - 1):+.2f} % on R C){flag}")',
			'return best["R"], best["C"]'
		])
	);
	const lines = ['r, c = pick_rc(rc_target)'];
	if (ctx.kind === 'ladder') lines.push('rg = r  # ohm');
	else if (ctx.kind === 'quadrature') lines.push("ra = rb = nearest(10e3, resistors)  # ohm, the inverter's pair");
	else lines.push('rg = nearest(10e3, resistors)  # ohm');
	if (ctx.kind !== 'quadrature') {
		lines.push('required_gain = balance(r * c)', 'if required_gain is None:', pyRaise('The loop finds no balance with these R and C on this op-amp.', '    '));
	}
	if (ctx.kind === 'quadrature') lines.push('print(f"  Ra = Rb = {eng(ra, \'ohm\')}, the inverter\'s gain exactly 1")');
	else lines.push(`print(f"  Rg = {eng(rg, 'ohm')}; with these R and C the loop needs a gain of {required_gain:.4f}")`);
	file.add(lines.join('\n'));
}
