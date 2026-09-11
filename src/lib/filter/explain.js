import { formatFarads, formatHz, formatOhms, formatSeconds } from './format';

/**
 * Builds the "show the math" content for the Stages and Components panels:
 * an ordered list of blocks, each either prose (explains what a step does,
 * why, and what every symbol in it means) or a LaTeX equation (rendered by
 * Equation.svelte / KaTeX) - first the general formula, then the same
 * formula with this design's actual numbers substituted in, as its own
 * line rather than crammed into a sentence. Every block is meant to be
 * readable on its own, without having read the source code.
 */

const n4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : '-');
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const exp4 = (x) => (Number.isFinite(x) ? x.toExponential(4).replace('e+', ' \\times 10^{').replace('e-', ' \\times 10^{-') + '}' : '-');

function p(text) {
	return { type: 'p', text };
}
function eq(tex) {
	return { type: 'eq', tex };
}

/** The leftover real pole's abstract position b_real, shared by low-pass and high-pass (odd n). */
function realPoleBlocks(design, stage) {
	const blocks = [
		p(
			'A filter of order n is built from n poles: pairs of poles become second-order stages, and if n is odd, one pole is left over with no partner. That leftover pole has no imaginary part, so instead of the usual two-resistor, two-capacitor stage it becomes a plain single-pole RC stage, with one number, tau (its "time constant"), setting its corner frequency.'
		)
	];
	if (design.response === 'chebyshev') {
		blocks.push(
			p(
				'For a Chebyshev response, every stage (including this leftover one) is built from the same two numbers, epsilon and beta, which come from the ripple spec Amax and the order n alone (derived in the second-order stages of this filter). The leftover pole sits at angle theta = 90 degrees on the same ellipse as every other pole, which simplifies its position to just sinh(beta):'
			),
			eq(`\\sinh(\\beta) = \\sinh(${n4(design.beta)}) = ${n4(stage.normalized.breal)}`),
			eq(`b_{\\text{real}} = ${n4(stage.normalized.breal)}`)
		);
	} else {
		blocks.push(
			p(
				'For a Butterworth response, this leftover pole always sits at exactly s = -1 in the normalized (omega_c = 1 rad/s) plane, no matter the order: the unit circle only crosses the real axis at one point.'
			),
			eq('b_{\\text{real}} = 1')
		);
	}
	return blocks;
}

/** Pole-placement math (a, b) for one second-order stage, shared by low-pass and high-pass. */
function poleBlocks(design, stageIndex) {
	const stage = design.stages[stageIndex];
	const s = stage.normalized;
	const blocks = [
		p(
			'Every second-order stage in this filter is built to realize the same shape of transfer function in its abstract, "normalized" form (omega_c = 1 rad/s, so frequencies are in units of the cutoff rather than Hz):'
		),
		eq('H(s) = \\dfrac{1}{s^2 + as + b}'),
		p(
			'a and b are just the two numbers - the coefficients of that denominator - that this step needs to find; once they are known, this stage is fully specified. Where they land depends on where this stage\'s pair of poles sits in the s-plane.'
		)
	];

	if (design.response === 'chebyshev') {
		blocks.push(
			p(
				'For a Chebyshev response the poles sit on an ellipse instead of a circle: epsilon controls how deep the passband ripple is allowed to go (bigger epsilon, more ripple), and beta controls how squashed the ellipse is. Both come from the ripple spec Amax and the order n, and are the same for every stage of this filter.'
			),
			eq(`\\varepsilon = \\sqrt{10^{A_{max}/10} - 1} = \\sqrt{10^{${design.amaxDb}/10} - 1} = ${n4(design.eps)}`),
			eq(
				`\\beta = \\dfrac{\\operatorname{asinh}(1/\\varepsilon)}{n} = \\dfrac{\\operatorname{asinh}(1/${n4(design.eps)})}{${design.n}} = ${n4(design.beta)}`
			),
			p(
				`This filter's n poles are spread evenly around that ellipse, one pair per stage. Stage ${stageIndex + 1} is the pair at angle theta, one of n equally spaced angles:`
			),
			eq(`\\theta = \\dfrac{(2 \\times ${stageIndex} + 1)\\pi}{2 \\times ${design.n}} = ${n4(s.theta)}\\ \\text{rad}`),
			p(
				'sigma and omega are that pole\'s real and imaginary parts (a pole is a point sigma + j*omega in the s-plane; its distance from the imaginary axis, sigma, is what damps the response, and omega is roughly where its resonance sits):'
			),
			eq(
				`\\sigma = -\\sinh(\\beta)\\sin(\\theta) = -${n4(Math.sinh(design.beta))} \\times \\sin(${n4(s.theta)}) = ${n4(s.sigma)}`
			),
			eq(
				`\\omega = \\cosh(\\beta)\\cos(\\theta) = ${n4(Math.cosh(design.beta))} \\times \\cos(${n4(s.theta)}) = ${n4(s.omega)}`
			),
			p(
				'A pole never comes alone: sigma + j*omega always pairs with its mirror image sigma - j*omega (a real circuit cannot have just one), and multiplying out (s - pole)(s - conjugate) gives exactly the s^2 + as + b this stage is trying to build:'
			),
			eq(`(s-\\sigma-j\\omega)(s-\\sigma+j\\omega) = s^2 -2\\sigma s + (\\sigma^2+\\omega^2)`),
			eq(`a = -2\\sigma = ${n4(s.a)}`),
			eq(`b = \\sigma^2 + \\omega^2 = ${n4(s.b)}`)
		);
	} else {
		blocks.push(
			p(
				`For a Butterworth response, every pole of the filter sits exactly on the unit circle (radius 1, centered at the origin) - that is the entire defining property of a Butterworth filter. This filter's n poles are spread evenly around that circle, one pair per stage; stage ${stageIndex + 1} is the pair at angle theta, one of n equally spaced angles:`
			),
			eq(`\\theta = \\dfrac{(2 \\times ${stageIndex} + 1)\\pi}{2 \\times ${design.n}} = ${n4(s.theta)}\\ \\text{rad}`),
			p(
				"Because the pole sits exactly on the unit circle, its distance from the origin is always 1 - so b (which turns out to be that distance squared) is always exactly 1, no matter the stage or the order. Only a (twice how far the pole sits below the real axis, i.e. how damped this stage is) changes from stage to stage:"
			),
			eq(`a = 2\\sin(\\theta) = 2\\sin(${n4(s.theta)}) = ${n4(s.a)}`),
			eq(`b = 1`)
		);
	}
	return blocks;
}

/** Pole placement + denormalization for one second-order low-pass stage. */
export function explainStage(design, stageIndex) {
	const stage = design.stages[stageIndex];

	if (stage.order === 1) {
		return [
			...realPoleBlocks(design, stage),
			p(
				'For a low-pass, denormalizing turns that abstract, unitless pole into a real corner frequency by substituting s -> s / omega_c, where omega_c is this filter\'s cutoff in radians per second:'
			),
			eq('H(s) = \\dfrac{1}{\\tau s + 1}'),
			eq(`\\omega_c = 2\\pi f_p = 2\\pi \\times ${design.fp} = ${n2(design.wc)}\\ \\text{rad/s}`),
			eq(
				`\\tau = \\dfrac{1}{\\omega_c \\, b_{\\text{real}}} = \\dfrac{1}{${n2(design.wc)} \\times ${n4(stage.normalized.breal)}} = ${formatSeconds(stage.tau)}`
			)
		];
	}

	const s = stage.normalized;
	return [
		...poleBlocks(design, stageIndex),
		p(
			"Denormalizing turns that abstract prototype into the real filter by substituting s -> s / omega_c, where omega_c is this filter's cutoff in radians per second. That turns s^2 + as + b into a stage with a real corner frequency omega_n and a real quality factor Q - the standard form the Components step below actually builds:"
		),
		eq('H(s) = \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}'),
		eq(`\\omega_c = 2\\pi f_p = 2\\pi \\times ${design.fp} = ${n2(design.wc)}\\ \\text{rad/s}`),
		eq(
			`\\omega_n = \\omega_c \\sqrt{b} = ${n2(design.wc)} \\times \\sqrt{${n4(s.b)}} = ${n2(stage.wn)}\\ \\text{rad/s}\\ \\ (f_0 = ${formatHz(stage.wn / (2 * Math.PI))})`
		),
		eq(`Q = \\dfrac{\\sqrt{b}}{a} = \\dfrac{\\sqrt{${n4(s.b)}}}{${n4(s.a)}} = ${n4(stage.q)}`)
	];
}

/**
 * Pole placement + LP-to-HP transform + denormalization for one high-pass
 * stage. The pole placement itself (a, b) is identical to the low-pass
 * case above - a high-pass filter starts from the exact same prototype -
 * the only difference is an extra step, substituting s -> 1/s in the
 * normalized prototype before denormalizing, which turns (a, b) into a
 * new pair (a_hp, b_hp). That substitution leaves Q unchanged (it cancels
 * out algebraically) and only moves where each stage's corner frequency
 * sits relative to the cutoff.
 */
export function explainHpStage(design, stageIndex) {
	const stage = design.stages[stageIndex];

	if (stage.order === 1) {
		const brealHp = stage.normalized.brealHp;
		return [
			...realPoleBlocks(design, stage),
			p(
				"For a high-pass, that pole first gets inverted (s -> 1/s in the normalized prototype) before denormalizing: a real pole at b_real becomes a real pole at 1/b_real. Denormalizing then substitutes s -> s / omega_c, where omega_c is this filter's cutoff in radians per second:"
			),
			eq('H(s) = \\dfrac{\\tau s}{\\tau s + 1}'),
			eq(`b_{\\text{real,hp}} = \\dfrac{1}{b_{\\text{real}}} = \\dfrac{1}{${n4(stage.normalized.breal)}} = ${n4(brealHp)}`),
			eq(`\\omega_c = 2\\pi f_p = 2\\pi \\times ${design.fp} = ${n2(design.wc)}\\ \\text{rad/s}`),
			eq(
				`\\tau = \\dfrac{1}{\\omega_c \\, b_{\\text{real,hp}}} = \\dfrac{1}{${n2(design.wc)} \\times ${n4(brealHp)}} = ${formatSeconds(stage.tau)}`
			)
		];
	}

	const s = stage.normalized;
	return [
		...poleBlocks(design, stageIndex),
		p(
			'A high-pass filter starts from this exact same pole placement, then applies one extra step before denormalizing: substituting s -> 1/s turns the normalized low-pass stage into a high-pass one, with a new pair of coefficients:'
		),
		eq(
			'H_{lp}(s) = \\dfrac{1}{s^2+as+b} \\ \\ \\xrightarrow{s \\to 1/s} \\ \\ H_{hp}(s) = \\dfrac{s^2/b}{s^2 + \\frac{a}{b}s + \\frac{1}{b}}'
		),
		eq(`a_{hp} = \\dfrac{a}{b} = \\dfrac{${n4(s.a)}}{${n4(s.b)}} = ${n4(s.aHp)}`),
		eq(`b_{hp} = \\dfrac{1}{b} = \\dfrac{1}{${n4(s.b)}} = ${n4(s.bHp)}`),
		p(
			"Denormalizing substitutes s -> s / omega_c the same way as low-pass. Q comes out identical to what the low-pass version of this same stage would have had (sqrt(b_hp)/a_hp reduces algebraically back to sqrt(b)/a) - only the corner frequency omega_n moves, to the other side of omega_c from where the low-pass stage's would have sat:"
		),
		eq('H(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}'),
		eq(`\\omega_c = 2\\pi f_p = 2\\pi \\times ${design.fp} = ${n2(design.wc)}\\ \\text{rad/s}`),
		eq(
			`\\omega_n = \\omega_c \\sqrt{b_{hp}} = ${n2(design.wc)} \\times \\sqrt{${n4(s.bHp)}} = ${n2(stage.wn)}\\ \\text{rad/s}\\ \\ (f_0 = ${formatHz(stage.wn / (2 * Math.PI))})`
		),
		eq(`Q = \\dfrac{\\sqrt{b_{hp}}}{a_{hp}} = \\dfrac{\\sqrt{${n4(s.bHp)}}}{${n4(s.aHp)}} = ${n4(stage.q)}`)
	];
}

/** MFB component derivation for one realized stage. */
export function explainMfb(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'The MFB (multiple-feedback) circuit is one resistor from the input (R1), one resistor down to the inverting input (R2), one resistor and one capacitor both in feedback from the output back to the R1/R2 junction (R3 and C2), and one capacitor from the inverting input to ground (C1). Working through that circuit with normal op-amp analysis gives its transfer function:'
		),
		eq(
			'H(s) = \\dfrac{c}{s^2 + as + b},\\quad a = \\dfrac{1}{C_1}\\!\\left(\\dfrac{1}{R_1}+\\dfrac{1}{R_2}+\\dfrac{1}{R_3}\\right),\\quad b = \\dfrac{1}{R_2 R_3 C_1 C_2},\\quad c = -\\dfrac{1}{R_1 R_2 C_1 C_2}'
		),
		p(
			`So a and b here play the same role as the a and b already found for this stage above - they are just now expressed in terms of R1, R2, R3, C1 and C2 instead of pole positions. This stage's target is f0 = ${formatHz(targetWn / (2 * Math.PI))} (omega_n = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)}; matching a and b to that target is what picks the component values:`
		),
		eq(`a = \\dfrac{\\omega_n}{Q} = \\dfrac{${n2(targetWn)}}{${n4(targetQ)}} = ${n2(st.a)}`),
		eq(`b = \\omega_n^2 = ${n2(targetWn)}^2 = ${exp4(st.b)}`),
		p(
			'Choosing R1 = R3 forces the DC gain c/b to exactly -1 (the stage inverts, which does not matter for a low-pass magnitude response) and leaves two equations - matching a and b - in two unknowns, R1 and R2, once C1 and C2 are picked. Substituting x = 1/R1 = 1/R3 turns those two equations into one quadratic in x:'
		),
		eq('2x^2 - (aC_1)x + bC_1C_2 = 0'),
		p(
			stageDesign.manual
				? 'which only has a real solution when C1/C2 >= 8Q^2. C1 and C2 below were entered by hand instead of searched for; the resistors are solved directly from them:'
				: 'which only has a real solution when C1/C2 >= 8Q^2. This tool searches a preferred capacitor series for a pair that clears that bar and lands both resistors in a sane 200 ohm to 2 megohm range:'
		),
		eq(
			`C_1 = ${formatFarads(st.C1)},\\ \\ C_2 = ${formatFarads(st.C2)}\\ \\ \\left(\\text{ratio } ${(st.C1 / st.C2).toFixed(1)}\\text{:1, needs} \\geq 8Q^2 = ${(8 * targetQ * targetQ).toFixed(1)}\\text{:1}\\right)`
		),
		eq(`\\Delta = (aC_1)^2 - 8bC_1C_2 = ${exp4(st.discriminant)}`),
		eq(
			`x = \\dfrac{aC_1 + \\sqrt{\\Delta}}{4} = ${exp4(st.x)}\\ \\ \\Rightarrow\\ \\ R_1 = R_3 = \\dfrac{1}{x} = ${formatOhms(stageDesign.theoretical.R1)}`
		),
		eq(`R_2 = \\dfrac{1}{aC_1 - 2x} = ${formatOhms(stageDesign.theoretical.R2)}`),
		p(
			`Real resistors only come in standard values, so R1 and R2 get rounded to the nearest ${st.resistorSeries} value: ${formatOhms(stageDesign.components.R1)} and ${formatOhms(stageDesign.components.R2)}. Plugging those rounded values back into a and b (not the target ones) gives what this stage will actually do, which is what the "actual" row above and the Bode plot further down are built from:`
		),
		eq(
			`f_0' = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = ${stageDesign.actual.q.toFixed(4)}`
		)
	];
	return blocks;
}

/** Sallen-Key component derivation for one realized stage. */
export function explainSallenKey(stageDesign, targetQ) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			"The unity-gain Sallen-Key circuit is two equal resistors R in series from the input to the op-amp's non-inverting input, a capacitor C_bottom from the R-R junction to ground, and a feedback capacitor C_top from the output back to that same junction (the op-amp itself is just wired as a follower, output tied straight to its inverting input). Working through that circuit gives:"
		),
		eq('\\omega_n = \\dfrac{1}{R\\sqrt{C_{top} C_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{C_{top}}{C_{bottom}}}'),
		p(
			'Unlike MFB, this topology has only three components to place (R is forced equal on both resistors), and Q depends on nothing but the ratio of the two capacitors - so that ratio is fixed the moment Q is known, before any component gets picked:'
		),
		eq(
			stageDesign.manual
				? `\\dfrac{C_{top}}{C_{bottom}} = 4Q^2 = 4 \\times ${targetQ.toFixed(4)}^2 = ${(4 * targetQ * targetQ).toFixed(2)}\\quad\\text{(target - the entered pair gives } ${st.ratio.toFixed(2)}\\text{ instead)}`
				: `\\dfrac{C_{top}}{C_{bottom}} = 4Q^2 = 4 \\times ${targetQ.toFixed(4)}^2 = ${st.ratio.toFixed(2)}`
		),
		...(stageDesign.manual
			? [
					p(
						'C_top and C_bottom below were entered by hand instead of following that ratio exactly - the actual Q above already reflects whatever ratio the chosen pair happens to have, not the target Q. R is solved from the general omega_n equation for those two values:'
					),
					eq(
						`R = \\dfrac{1}{\\omega_n\\sqrt{C_{top}C_{bottom}}} = ${formatOhms(st.Rtarget)}`
					)
				]
			: [
					p(
						'That leaves only one free choice: C_bottom. Once it is picked (from a preferred series), C_top is whatever the ratio above says it has to be, and R follows from the omega_n equation:'
					),
					eq(`C_{bottom} = ${formatFarads(st.Cbottom)}\\ \\ \\Rightarrow\\ \\ C_{top} = \\text{ratio} \\times C_{bottom} = ${formatFarads(st.Ctarget)}`),
					eq(`R = \\dfrac{1}{2Q\\,\\omega_n\\,C_{bottom}} = ${formatOhms(st.Rtarget)}`)
				]),
		p(
			`Rounded to the nearest preferred values: R = ${formatOhms(stageDesign.components.R1)}, C_top = ${formatFarads(stageDesign.components.Ctop)}. Recomputing omega_n and Q from those rounded values (not the targets) gives what this stage will actually do:`
		),
		eq(
			`f_0' = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = ${stageDesign.actual.q.toFixed(4)}`
		)
	];
	return blocks;
}

/** First-order RC derivation for one realized stage. */
export function explainFirstOrder(stageDesign) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'A first-order low-pass needs nothing more than one resistor and one capacitor in series, output taken across the capacitor. The product RC is called tau, the time constant, and it alone sets where this stage rolls off (its corner frequency is 1/(2*pi*tau)). The target tau for this stage was already computed in the Stages step above:'
		),
		eq('H(s) = \\dfrac{1}{RCs + 1}, \\qquad \\tau = RC'),
		eq(`\\tau = ${formatSeconds(st.tau)}`),
		p(
			stageDesign.manual
				? 'C below was entered by hand instead of picked from a preferred series; R is solved from it the same way, then rounded in turn:'
				: 'C is picked from a preferred capacitor series first, and R is solved from it; R then gets rounded in turn, same as every other stage in this design:'
		),
		eq(`C = ${formatFarads(st.C)}\\ \\ \\Rightarrow\\ \\ R = \\dfrac{\\tau}{C} = ${formatOhms(st.Rtarget)}`),
		p(`Rounded to R = ${formatOhms(stageDesign.components.R)}.`),
		eq(`\\tau' = RC = ${formatSeconds(stageDesign.actual.tau)}`)
	];
	return blocks;
}

/** MFB high-pass component derivation for one realized stage. */
export function explainMfbHp(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'The MFB high-pass circuit is the same idea as the low-pass version with every resistor and capacitor swapped: C1 from the input to the summing node, R1 from that node to ground, C2 from the summing node to the inverting input, and two separate feedback paths back to the output - C3 from the summing node, R2 from the inverting input. Working through that circuit gives:'
		),
		eq(
			'H(s) = \\dfrac{-c\\,s^2}{s^2 + as + b},\\quad a = \\dfrac{C_1+C_2+C_3}{R_2 C_2 C_3},\\quad b = \\dfrac{1}{R_1 R_2 C_2 C_3},\\quad c = \\dfrac{C_1}{C_3}'
		),
		p(
			`So a and b here play the same role as a_hp and b_hp already found for this stage above - they are just now expressed in terms of R1, R2, C1, C2 and C3 instead of pole positions. This stage's target is f0 = ${formatHz(targetWn / (2 * Math.PI))} (omega_n = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)}; matching a and b to that target is what picks the component values:`
		),
		eq(`a = \\dfrac{\\omega_n}{Q} = \\dfrac{${n2(targetWn)}}{${n4(targetQ)}} = ${n2(st.a)}`),
		eq(`b = \\omega_n^2 = ${n2(targetWn)}^2 = ${exp4(st.b)}`),
		p(
			'Setting C1 = C2 = C3 = C forces the passband gain c to exactly 1 (so the stage output magnitude matches the input at high frequency, up to the sign) and, unlike the low-pass version, always has a real solution regardless of Q - there is no capacitor ratio to clear. With C fixed, a and b reduce to two direct formulas for the two resistors:'
		),
		eq(`R_2 = \\dfrac{3}{aC} = ${formatOhms(stageDesign.theoretical.R2)}`),
		eq(`R_1 = \\dfrac{1}{bR_2C^2} = ${formatOhms(stageDesign.theoretical.R1)}`),
		p(
			stageDesign.manual
				? `C below was entered by hand instead of searched for: ${formatFarads(st.C)}.`
				: `This tool searches a preferred capacitor series for a C that lands both resistors in a sane 200 ohm to 2 megohm range: ${formatFarads(st.C)}.`
		),
		p(
			`Real resistors only come in standard values, so R1 and R2 get rounded to the nearest ${st.resistorSeries} value: ${formatOhms(stageDesign.components.R1)} and ${formatOhms(stageDesign.components.R2)}. Plugging those rounded values back into a and b (not the target ones) gives what this stage will actually do, which is what the "actual" row above and the Bode plot further down are built from:`
		),
		eq(
			`f_0' = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = ${stageDesign.actual.q.toFixed(4)}`
		)
	];
	return blocks;
}

/** Sallen-Key high-pass component derivation for one realized stage. */
export function explainSallenKeyHp(stageDesign, targetQ) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			"The unity-gain Sallen-Key high-pass circuit is the R-C dual of the low-pass version: two equal capacitors C in series from the input to the op-amp's non-inverting input, a resistor R_bottom from the C-C junction to ground, and a feedback resistor R_top from the output back to that same junction (the op-amp is again just a follower). Working through that circuit gives:"
		),
		eq('\\omega_n = \\dfrac{1}{C\\sqrt{R_{top} R_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{R_{bottom}}{R_{top}}}'),
		p(
			'Just like the low-pass version, Q depends on nothing but a ratio - here the resistor ratio instead of a capacitor one - so that ratio is fixed the moment Q is known:'
		),
		eq(
			stageDesign.manual
				? `\\dfrac{R_{bottom}}{R_{top}} = 4Q^2 = 4 \\times ${targetQ.toFixed(4)}^2 = ${(4 * targetQ * targetQ).toFixed(2)}\\quad\\text{(target - the entered value gives } ${st.ratio.toFixed(2)}\\text{ instead)}`
				: `\\dfrac{R_{bottom}}{R_{top}} = 4Q^2 = 4 \\times ${targetQ.toFixed(4)}^2 = ${st.ratio.toFixed(2)}`
		),
		p(
			stageDesign.manual
				? 'C below was entered by hand instead of searched for; both resistors are solved directly from it and the target:'
				: 'Unlike low-pass, both resistors follow directly from the one free choice, C (the two capacitors are equal by design, so there is nothing to derive a ratio for):'
		),
		eq(`R_{top} = \\dfrac{1}{2Q\\,\\omega_n\\,C} = ${formatOhms(st.RtopTarget)}`),
		eq(`R_{bottom} = 4Q^2 \\times R_{top} = ${formatOhms(st.RbottomTarget)}`),
		p(
			`Rounded to the nearest preferred values: R_top = ${formatOhms(stageDesign.components.Rtop)}, R_bottom = ${formatOhms(stageDesign.components.Rbottom)}, C = ${formatFarads(stageDesign.components.C1)}. Recomputing omega_n and Q from those rounded values (not the targets) gives what this stage will actually do:`
		),
		eq(
			`f_0' = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = ${stageDesign.actual.q.toFixed(4)}`
		)
	];
	return blocks;
}

/** First-order high-pass RC derivation for one realized stage. */
export function explainFirstOrderHp(stageDesign) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'A first-order high-pass is the same series RC as the low-pass version, just with the output taken across the resistor instead of the capacitor. The product RC is still called tau, and it still alone sets where this stage rolls off (its corner frequency is 1/(2*pi*tau)). The target tau for this stage was already computed in the Stages step above:'
		),
		eq('H(s) = \\dfrac{RCs}{RCs + 1}, \\qquad \\tau = RC'),
		eq(`\\tau = ${formatSeconds(st.tau)}`),
		p(
			stageDesign.manual
				? 'C below was entered by hand instead of picked from a preferred series; R is solved from it the same way, then rounded in turn:'
				: 'C is picked from a preferred capacitor series first, and R is solved from it; R then gets rounded in turn, same as every other stage in this design:'
		),
		eq(`C = ${formatFarads(st.C)}\\ \\ \\Rightarrow\\ \\ R = \\dfrac{\\tau}{C} = ${formatOhms(st.Rtarget)}`),
		p(`Rounded to R = ${formatOhms(stageDesign.components.R)}.`),
		eq(`\\tau' = RC = ${formatSeconds(stageDesign.actual.tau)}`)
	];
	return blocks;
}

/**
 * Explains the summing amplifier that combines a band-stop design's
 * low-pass and high-pass branches into the final notch output.
 */
export function explainSummingAmp(R) {
	return [
		p(
			'The low-pass branch and the high-pass branch above run in parallel from the same input, each producing its own output. A plain inverting summing amplifier adds those two outputs together to get the final notch:'
		),
		eq('V_{out} = -\left(\dfrac{R_f}{R_a}V_{lp} + \dfrac{R_f}{R_b}V_{hp}\right)'),
		p(
			'Every stage in this design has an exactly known gain in its own passband - MFB is always exactly -1 (forced by R1 = R3), Sallen-Key is always exactly +1, a unity-gain follower - regardless of how the resistors get rounded. So making Ra, Rb and Rf all equal gives an exact, rounding-proof unity-magnitude sum:'
		),
		eq(`R_a = R_b = R_f = ${formatOhms(R)}\ \ \Rightarrow\ \ V_{out} = -(V_{lp} + V_{hp})`),
		p(
			'Far below the stopband, the low-pass branch passes at full strength while the high-pass branch is already deep in its own stopband, so the sum is essentially just the low-pass branch (and the mirror image far above the stopband). Inside the stopband, both branches are attenuated at once, so the sum drops too - that drop is the notch, and how deep it gets is set by the same Amax/Amin order search used for every other filter type in this tool, not by matching any component pair precisely.'
		)
	];
}
