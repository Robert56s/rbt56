import { stageKind } from './filter';
import { pyPrints } from './emit';

/**
 * The report under the check: what the file leaves to the page (the
 * op-amps' output loads), and one plain sentence on how the two sets came
 * out, whichever way:
 *   both meet           said so
 *   the file's alone    the page also holds the output loads, which the file
 *                       does not check
 *   the page's alone    the file builds and rounds each stage on its own, the
 *                       page chooses its parts for the whole filter; where
 *                       the source drives a capacitor of the first stage, the
 *                       rule leaves it out; on the passband edge the ideal
 *                       design keeps no room for the rounding, which the
 *                       centred placement gives (with no promise: rounding
 *                       may use it up; for poles written in, the page writes
 *                       the file again for it)
 *   neither             the page found no set within the limits that meets
 *                       the template (when it shows its best), and offers
 *                       the parts past the limits when those meet it
 * Without the file's own parts (a stage the rule cannot build: section 5
 * says so) or the page's (it cannot build every stage), only the loads.
 */

/** The circuits whose input is a capacitor, or feeds one: the rule takes the source off no resistor there. */
const CAPACITOR_INPUT = new Set(['mfb_highpass', 'sallen_key_highpass', 'tow_thomas_highpass', 'tow_thomas_notch', 'boctor_lowpass_notch', 'boctor_highpass_notch']);

/**
 * The stages the source drives, [{ circuit, words }]: the first stage, or each branch's first of a
 * band-stop of two branches (`words` its name in a sentence).
 */
function sourceStages(ctx) {
	if (ctx.stageCircuits) return [{ circuit: ctx.stageCircuits[0], words: "the first stage's" }];
	const sides = ctx.sides ?? [ctx.side];
	const parallel = ctx.type === 'bandstop' && Boolean(ctx.sides);
	return (parallel ? sides : sides.slice(0, 1)).map((side) => ({ circuit: side.circuits[stageKind(side.design.stages[0])], words: parallel ? `the ${side.tag}'s` : "the first stage's" }));
}

export function report(file, ctx) {
	const loads = pyPrints('Output loads are not computed here; the page checks them (2 kohm or more each).');
	if (!ctx.pageComplete) {
		file.follow(loads);
		return;
	}
	const shown = ctx.shown ?? {};
	const best = !shown.pastLimits && shown.withinLimits !== false && !(shown.designIndex > 0);
	const offer = best && shown.alternative?.measure?.meets;
	// (an elliptic prototype's poles are written in for the page's placement: another stops the file)
	const ellip = [ctx.response, ctx.design?.response, ...(ctx.sides ?? []).map((s) => s.response)].includes('elliptic');
	const capacitor = sourceStages(ctx).find((s) => CAPACITOR_INPUT.has(s.circuit));
	const lines = [
		loads,
		'if own_check and own_check["meets"] and page_check["meets"]:',
		pyPrints('Both sets meet the template.', '    '),
		'elif own_check and own_check["meets"]:',
		pyPrints(`The file's parts meet it where the page's miss; the page holds every load to 2 kohm.${offer ? " Its parts past the limits meet it too." : ''}`, '    '),
		'elif own_check and page_check["meets"]:',
		pyPrints("The file's own parts miss the template: its rule builds and rounds each stage alone, where the page chooses its parts for the whole filter, the source too.", '    ')
	];
	if (capacitor) lines.push('    if rs > 0:', pyPrints(`The rule also leaves out rs ahead of ${capacitor.words} input capacitor.`, '        '));
	lines.push(
		'    if placement == "edge":',
		pyPrints(
			ellip
				? 'On the passband edge the ideal design keeps no room for rounding: the centred placement leaves some (the page writes the file again for it), though rounding may still use it up.'
				: 'On the passband edge the ideal design keeps no room for rounding: placement = "centred" in SETTINGS leaves some, though rounding may still use it up.',
			'        '
		),
		'elif own_check:',
		pyPrints(
			best
				? `Neither set meets the template: the page found none within the limits on this stock${offer ? ', and offers its parts past the limits, which do' : ''}.`
				: 'Neither set meets the template.',
			'    '
		)
	);
	file.follow(lines.join('\n'));
}
