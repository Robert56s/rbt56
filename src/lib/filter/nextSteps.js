/**
 * What's left after this tool: simulate, build, measure. The page's own
 * "Next steps" section (panel 07) lists these, the narrow band-pass's
 * told for its peak.
 */
export const NEXT_STEPS = [
	{
		title: 'Simulate before building',
		detail:
			"Every number above comes from an ideal op-amp: infinite gain-bandwidth, no slew rate limit. The LTspice download runs the design with the op-amp picked next to it (a TL082 or LM741 model, or the single-pole one), so run its AC sweep with the part that will be built. That part's gain-bandwidth should be well above the sharpest stage's needs: at least 100 times its Q times its f0 as a rule, 400 times for a Tow-Thomas stage, whose Q rises as Q / (1 - 4 Q f0 / f_T) (the topology note in panel 04 gives the figure for this design). Below that it rolls off before the filter does, and the passband and stopband figures stop holding."
	},
	{
		title: 'Build and test one stage at a time',
		detail:
			"Confirm each stage's measured f0 and Q against this design's actual values before wiring the next stage on, instead of assembling the whole cascade and hoping."
	},
	{
		title: 'Match impedances between stages',
		detail:
			'The output impedance of one stage should stay well below the input impedance of the next (Zout << Zin), otherwise the second stage loads the first and both f0 and Q drift from what was computed. This matters most between the last filter stage and whatever it feeds.'
	},
	{
		title: 'Measure a real Bode plot',
		detail:
			'Compare it to the simulated response above: a handful of points swept from fp/10 to fs*10 with a function generator and a scope (or an audio analyzer) is enough to catch a wiring mistake or a component that is the wrong value.'
	},
	{
		title: 'If the measured response drifts, check sensitivity first',
		detail:
			'The sensitivity numbers above say how much a single component being off by 1% moves Q: that is usually the first place to look before assuming the design itself is wrong.'
	}
];

/**
 * NEXT_STEPS for a design whose MFB band-pass stages are built for a
 * single-pole op-amp of gbw Hz: their numbers then include it, so the first
 * step says so. With gbw null (or not a positive number) it is NEXT_STEPS.
 */
export function nextSteps(gbw = null) {
	if (!(Number.isFinite(gbw) && gbw > 0)) return NEXT_STEPS;
	const mhz = Number((gbw / 1e6).toPrecision(4));
	return [
		{
			...NEXT_STEPS[0],
			detail: `The multiple feedback band-pass stages are built for a single-pole op-amp of ${mhz} MHz, so their numbers above include it. Every other number comes from an ideal op-amp: infinite gain-bandwidth, no slew rate limit. The LTspice download runs the design with the op-amp picked next to it (a TL082 or LM741 model, or the single-pole one), so run its AC sweep with the part that will be built. A real part is not a single pole, and its gain-bandwidth varies from part to part: a corrected stage with a low loop gain at f0 moves the most. For any other stage, the part's gain-bandwidth should be well above the stage's needs: at least 100 times its Q times its f0 as a rule, 400 times for a Tow-Thomas stage, whose Q rises as Q / (1 - 4 Q f0 / f_T). Below that it rolls off before the filter does, and the passband and stopband figures stop holding.`
		},
		...NEXT_STEPS.slice(1)
	];
}

/**
 * The closing steps of a narrow band-pass, the page's: the same five as
 * NEXT_STEPS, the first and fourth told for a peak a few percent wide
 * around f0 (the op-amp's lag, stability, a sweep around f0). gbw: the
 * op-amp its multiple feedback stages are built for, or null.
 */
export function narrowNextSteps(gbw = null) {
	const built = Number.isFinite(gbw) && gbw > 0 ? ` The multiple feedback stages are built for a single-pole op-amp of ${Number((gbw / 1e6).toPrecision(4))} MHz, so their figures include it.` : '';
	return [
		{
			title: 'Simulate before building',
			detail: `The figures from the parts assume ideal op-amps; the comparison also runs every circuit on a single-pole TL082, and checks its poles for an oscillation.${built} A real part is not a single pole: the higher f0 times Q, the further the TL082 model moves Q past the single pole's figure. The LTspice download runs the design with the op-amp picked next to it (a TL082 or LM741 model, or the single-pole one): run its AC sweep with the part that will be built, then a time-domain run with an input at f0, which shows whether the output settles or grows. The part's gain-bandwidth should be well above the stage's needs: at least 100 times its Q times its f0 as a rule, 400 times for a Tow-Thomas or state-variable stage, whose Q rises as Q / (1 - 4 Q f0 / f_T) until it oscillates.`
		},
		NEXT_STEPS[1],
		NEXT_STEPS[2],
		{
			title: 'Measure a real Bode plot',
			detail: 'Compare it to the simulated response above: a sweep from f0/10 to 10·f0, with points close together around f0, where the peak is only f0/Q wide, taken with a function generator and a scope (or an audio analyzer), is enough to catch a wiring mistake or a component that is the wrong value. Read f0 at the peak and B between the two points 3 dB below it.'
		},
		NEXT_STEPS[4]
	];
}
