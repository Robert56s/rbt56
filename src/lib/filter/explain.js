import { formatFarads, formatHz, formatOhms, formatSeconds } from './format';

/**
 * Builds the "show the math" content for the Order, Stages and Components
 * panels: an ordered list of blocks, each either prose (what a step does,
 * why, and what every symbol in it means) or a LaTeX equation (rendered by
 * Equation.svelte / KaTeX). The rule throughout: nothing is quoted from a
 * table. Every formula is either derived here from the one before it, or
 * its origin is pointed at explicitly, and each general formula is followed
 * by the same formula with this design's own numbers substituted in.
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

/** eps = sqrt(10^(Amax/10) - 1), the one number the passband spec turns into. */
function rippleFactor(amaxDb) {
	return Math.sqrt(10 ** (amaxDb / 10) - 1);
}

/* ------------------------------------------------------------------------ */
/* 1. Where the response formula comes from (shown once, top of Stages)      */
/* ------------------------------------------------------------------------ */

/**
 * Derives the magnitude response the whole design is built on, from the
 * problem statement up: why |H|^2 is a polynomial in omega^2, what
 * "maximally flat" (Butterworth) or "equiripple" (Chebyshev) means, how eps
 * enters, and where the poles land. Everything in the per-stage math below
 * refers back to this.
 */
export function explainApproximation(design) {
	const eps = design.eps ?? rippleFactor(design.amaxDb);
	const hp = design.filterType === 'highpass';
	const blocks = [
		p(
			'Every filter here starts from the same question: what does "a low-pass of order n" look like as a formula? The ideal is a brick wall, gain 1 up to fp and 0 above it. No circuit made of n capacitors and inductors (or op-amp stages) can do that, so the design has to pick the best approximation with n poles. The spec only talks about |H| in dB, so it is the magnitude that gets designed, not the phase.'
		),
		p(
			'A circuit with n energy-storing parts has a transfer function H(s) whose denominator is a polynomial of degree n. Its magnitude squared on the frequency axis is H(jω) times its mirror image H(-jω), and in that product every odd power of ω cancels, so |H|^2 is always a ratio of polynomials in ω^2. For a low-pass with no zeros (all poles, no numerator terms) and a gain of exactly 1 at DC, the most general form has n unknown positive coefficients:'
		),
		eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + a_1\\,\\omega^2 + a_2\\,\\omega^4 + \\cdots + a_n\\,\\omega^{2n}}'),
		p(
			'The a coefficients are the only freedom left, and the two classic responses are two different ways of spending it.'
		)
	];

	if (design.response === 'chebyshev') {
		blocks.push(
			p(
				'Chebyshev spends it on the passband as a whole: instead of asking for a perfectly flat response at DC, it lets the response wobble by up to Amax dB anywhere in the passband, and in exchange gets a much faster drop after fp for the same n. The polynomial that stays between -1 and +1 over the whole passband while growing as fast as possible outside it is the Chebyshev polynomial C_n:'
			),
			eq(
				'C_n(x) = \\begin{cases} \\cos\\!\\left(n\\arccos x\\right) & |x| \\le 1 \\\\[4pt] \\cosh\\!\\left(n\\,\\operatorname{acosh} x\\right) & |x| > 1 \\end{cases} \\qquad C_0 = 1,\\ \\ C_1 = x,\\ \\ C_{n+1} = 2x\\,C_n - C_{n-1}'
			),
			p('Putting C_n squared in the denominator, with x = ω/ωp so that the passband is exactly |x| ≤ 1, gives the Chebyshev response:'),
			eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2\\, C_n^2\\!\\left(\\dfrac{\\omega}{\\omega_p}\\right)}'),
			p(
				'Inside the passband C_n squared swings between 0 and 1, so |H|^2 swings between 1 and 1/(1+ε^2): that swing is the ripple, and requiring it to be exactly Amax dB fixes ε from the spec. At the edge ω = ωp, C_n is exactly 1, so the loss there is exactly Amax too:'
			),
			eq(
				`10\\log_{10}\\!\\left(1 + \\varepsilon^2\\right) = A_{max} \\ \\Rightarrow\\ \\varepsilon = \\sqrt{10^{A_{max}/10} - 1} = \\sqrt{10^{${design.amaxDb}/10} - 1} = ${n4(eps)}`
			),
			p(
				'Past ωp the cosine turns into a hyperbolic cosine and C_n grows like cosh(n acosh(ω/ωp)): that is where the acosh in the order formula of the previous panel comes from.'
			),
			p(
				'A magnitude formula is not a circuit yet: a circuit is built from poles. Replacing ω by s/j turns |H(jω)|^2 into H(s)H(-s), whose 2n poles solve 1 + ε^2 C_n^2(s/(jωp)) = 0. The trick is to write s/(jωp) = cos(φ) with a complex angle φ = θ + jβ: C_n then becomes cos(nφ) by its own definition, and the equation collapses to cos(nφ) = ± j/ε. Expanding the cosine of a complex angle splits that into a real part and an imaginary part, and each part gives one of the two numbers every stage below is built from:'
			),
			eq('\\cos(n\\theta)\\cosh(n\\beta) - j\\sin(n\\theta)\\sinh(n\\beta) = \\pm\\dfrac{j}{\\varepsilon} \\ \\Rightarrow\\ \\cos(n\\theta) = 0, \\qquad \\sinh(n\\beta) = \\dfrac{1}{\\varepsilon}'),
			p(
				'The real part says cos(nθ) = 0, which is solved by exactly the equally spaced angles θ_i = (2i+1)π/(2n): the same angles as Butterworth. The imaginary part gives one extra number, β, that depends on ε and n only:'
			),
			eq(`\\beta = \\dfrac{\\operatorname{asinh}(1/\\varepsilon)}{n} = \\dfrac{\\operatorname{asinh}(1/${n4(eps)})}{${design.n}} = ${n4(design.beta)}`),
			eq(
				's_i = -\\sinh(\\beta)\\sin\\theta_i + j\\cosh(\\beta)\\cos\\theta_i, \\qquad \\theta_i = \\dfrac{(2i+1)\\pi}{2n}, \\quad i = 0, 1, \\ldots, n-1'
			),
			p(
				`So a Chebyshev pole is a Butterworth pole with its real part shrunk by sinh(β) = ${n4(Math.sinh(design.beta))} and its imaginary part stretched by cosh(β) = ${n4(Math.cosh(design.beta))}: the unit circle turns into an ellipse, taller than it is wide. Its frequency scale is already the ripple edge ωp, which is why the Chebyshev stages below need no extra cutoff factor. Each pair of poles at ± θ_i becomes one second-order stage; for odd n the pole at θ = 90° (on the real axis) has no partner and becomes the first-order stage.`
			)
		);
		return blocks;
	}

	blocks.push(
		p(
			'Butterworth (1930) spends it on flatness at DC: make the passband as flat as possible near ω = 0. Flat means that the derivatives of |H|^2 at ω = 0 are zero. Each coefficient set to zero kills two more derivatives, so choosing a_1 = a_2 = ... = a_(n-1) = 0 makes the first 2n-1 derivatives vanish, the most an n-th degree polynomial allows. That is the "maximally flat" response, and only the last coefficient survives:'
		),
		eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + a_n\\,\\omega^{2n}}'),
		p(
			'a_n only sets the frequency scale, and the spec sets it: the passband edge fp is by definition the frequency where the loss reaches Amax, i.e. where |H|^2 = 1/(1+ε^2). Writing a_n = ε^2/ωp^(2n) makes that true by construction, and gives the formula in its final form:'
		),
		eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 \\left(\\dfrac{\\omega}{\\omega_p}\\right)^{2n}}'),
		p('ε (epsilon) is the one number the passband spec turns into. At ω = ωp the bracket is 1, so the loss there is 10log(1+ε^2), and requiring that to equal Amax gives:'),
		eq(
			`10\\log_{10}\\!\\left(1 + \\varepsilon^2\\right) = A_{max} \\ \\Rightarrow\\ \\varepsilon = \\sqrt{10^{A_{max}/10} - 1} = \\sqrt{10^{${design.amaxDb}/10} - 1} = ${n4(eps)}`
		),
		p(
			'Two sanity checks: at DC the bracket is 0 and the gain is exactly 1; far above ωp the ω^(2n) term dominates and the loss grows by 20n dB per decade, which is why a higher order gives a steeper wall.'
		),
		p(
			'A magnitude formula is not a circuit yet: a circuit is built from poles. Replacing ω by s/j turns |H(jω)|^2 back into H(s) times its mirror H(-s), and the j^(2n) becomes (-1)^n:'
		),
		eq('H(s)\\,H(-s) = \\dfrac{1}{1 + \\varepsilon^2 \\left(\\dfrac{s}{j\\omega_p}\\right)^{2n}} = \\dfrac{1}{1 + (-1)^n\\,\\varepsilon^2 \\left(\\dfrac{s}{\\omega_p}\\right)^{2n}}'),
		p(
			'Its 2n poles are the solutions of (s/ωp)^(2n) = (-1)^(n+1)/ε^2. Taking the 2n-th root of a number of size 1/ε^2 gives 2n solutions that all have the same size and angles spaced π/n apart: they sit on a circle of radius ω0, mirrored about both axes. Half of them have a negative real part (stable): those belong to H(s), the other half to H(-s). Measuring the angle θ from the imaginary axis, the stable ones are:'
		),
		eq(
			`\\omega_0 = \\omega_p\\, \\varepsilon^{-1/n}, \\qquad s_i = \\omega_0\\left(-\\sin\\theta_i + j\\cos\\theta_i\\right), \\qquad \\theta_i = \\dfrac{(2i+1)\\pi}{2n}, \\quad i = 0, 1, \\ldots, n-1`
		),
		p(
			`The radius ω0 is also the frequency where exactly 3 dB is lost (put ω = ω0 in the response: the bracket becomes ε^2 ε^(-2) = 1, so |H|^2 = 1/2). Only when Amax = 3.0103 dB is ε = 1 and ω0 = ωp; here ε = ${n4(eps)}, so the pole circle sits at ${n4(design.wcScale)} times ${hp ? 'below' : 'past'} fp. The stages below work in the normalized prototype, ω0 = 1, which is the "unit circle" they refer to; the real frequency scale is put back in by the denormalization step of each stage. Each pair of poles at ± θ_i becomes one second-order stage; for odd n the pole at θ = 90° (s = -1) has no partner and becomes the first-order stage.`
		)
	);
	if (hp) {
		blocks.push(
			p(
				'This is a high-pass design, and the tool builds it the standard way: design the low-pass prototype above, then flip it with s -> 1/s (done stage by stage below). In the magnitude formula that flip simply swaps the fraction to ωp/ω, so the high-pass loses Amax at fp and gets steeper going down instead of up.'
			)
		);
	}
	return blocks;
}

/* ------------------------------------------------------------------------ */
/* 2. Where the order formula comes from (Order panel)                       */
/* ------------------------------------------------------------------------ */

/**
 * Derives the minimum-order formula from the magnitude response: the
 * passband edge is already satisfied by how eps is defined, so the only
 * condition left is "at least Amin dB at fs", and that is the one that
 * contains n.
 */
export function explainOrder({ response, amaxDb, aminDb, k, minOrder, filterType = 'lowpass', nUsed = null, evenOnly = false }) {
	const eps = rippleFactor(amaxDb);
	const hp = filterType === 'highpass';
	const invK = 1 / k;
	const num = 10 ** (aminDb / 10) - 1;
	const den = 10 ** (amaxDb / 10) - 1;
	const ratioText = hp ? '\\dfrac{\\omega_p}{\\omega}' : '\\dfrac{\\omega}{\\omega_p}';
	const blocks = [
		p(
			`The order n is the smallest number of poles that satisfies both ends of the spec at once. The whole design is built on one magnitude formula (derived from scratch at the top of the Stages panel); ${hp ? 'for a high-pass the fraction is ωp over ω' : 'for a low-pass'}:`
		)
	];

	if (response === 'chebyshev') {
		blocks.push(
			eq(`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2\\, C_n^2\\!\\left(${ratioText}\\right)}, \\qquad \\varepsilon = \\sqrt{10^{A_{max}/10} - 1} = ${n4(eps)}`),
			p(
				`At fp it loses exactly Amax dB by construction (that is how ε is defined). The only condition left is the stopband: at fs it must lose at least Amin dB. There ${hp ? 'ωp/ωs' : 'ωs/ωp'} = 1/k is bigger than 1, so C_n is a hyperbolic cosine, and n is inside it:`
			),
			eq(
				`10\\log_{10}\\!\\left(1 + \\varepsilon^2 \\cosh^2\\!\\left(n\\,\\operatorname{acosh}\\tfrac{1}{k}\\right)\\right) \\ge A_{min}`
			),
			p('Undo the log, move ε^2 across, take the square root, then undo the cosh; each step is reversible because everything is positive:'),
			eq(
				`\\cosh\\!\\left(n\\,\\operatorname{acosh}\\tfrac{1}{k}\\right) \\ge \\sqrt{\\dfrac{10^{A_{min}/10} - 1}{\\varepsilon^2}} \\ \\Rightarrow\\ n \\ge \\dfrac{\\operatorname{acosh}\\sqrt{\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}}}{\\operatorname{acosh}(1/k)}`
			),
			eq(
				`n \\ge \\dfrac{\\operatorname{acosh}\\sqrt{\\dfrac{${n2(num)}}{${n4(den)}}}}{\\operatorname{acosh}(${n4(invK)})} = \\dfrac{${n4(Math.acosh(Math.sqrt(num / den)))}}{${n4(Math.acosh(invK))}} = ${n4(minOrder)} \\ \\Rightarrow\\ n = ${nUsed ?? Math.max(1, Math.ceil(minOrder))}`
			)
		);
	} else {
		blocks.push(
			eq(`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 \\left(${ratioText}\\right)^{2n}}, \\qquad \\varepsilon = \\sqrt{10^{A_{max}/10} - 1} = ${n4(eps)}`),
			p(
				`At fp it loses exactly Amax dB by construction (that is how ε is defined). The only condition left is the stopband: at fs it must lose at least Amin dB, and that condition contains n. There the fraction ${hp ? 'ωp/ωs' : 'ωs/ωp'} equals 1/k:`
			),
			eq(`10\\log_{10}\\!\\left(1 + \\varepsilon^2 \\left(\\tfrac{1}{k}\\right)^{2n}\\right) \\ge A_{min}`),
			p('Undo the log, move ε^2 across, then take the log again to bring n down from the exponent; each step is reversible because everything is positive:'),
			eq(
				`\\varepsilon^2 \\left(\\tfrac{1}{k}\\right)^{2n} \\ge 10^{A_{min}/10} - 1 \\ \\Rightarrow\\ 2n\\,\\log\\!\\left(\\tfrac{1}{k}\\right) \\ge \\log\\!\\left[\\dfrac{10^{A_{min}/10} - 1}{\\varepsilon^2}\\right]`
			),
			p('Dividing by 2log(1/k) and writing ε^2 out in terms of Amax gives the order formula, with this design\'s numbers:'),
			eq(
				`n \\ge \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)} = \\dfrac{\\log\\!\\left[\\dfrac{${n2(num)}}{${n4(den)}}\\right]}{2\\log(${n4(invK)})} = \\dfrac{${n4(Math.log10(num / den))}}{${n4(2 * Math.log10(invK))}} = ${n4(minOrder)} \\ \\Rightarrow\\ n = ${nUsed ?? Math.max(1, Math.ceil(minOrder))}`
			)
		);
	}
	blocks.push(
		p(
			(evenOnly
				? 'Here n is then rounded up to the next even number, because every stage of this filter is a second-order Sallen-Key section and there is no place for a leftover first-order pole. '
				: '') +
				'Rounding up is what buys the margin: with n a whole number the filter usually loses a bit more than Amin at fs, never less.' +
				(evenOnly ? '' : ' The Bode plot panel checks both edges again with the rounded components.')
		)
	);
	return blocks;
}

/* ------------------------------------------------------------------------ */
/* 3. Per-stage math: poles, cutoff, denormalization                         */
/* ------------------------------------------------------------------------ */

/** The leftover real pole's abstract position b_real, shared by low-pass and high-pass (odd n). */
function realPoleBlocks(design, stage) {
	const blocks = [
		p(
			'A filter of order n is built from n poles: pairs of poles become second-order stages, and if n is odd, one pole is left over with no partner. That leftover pole has no imaginary part, so instead of a two-resistor, two-capacitor stage it becomes a plain single-pole RC stage with one number, tau (its time constant), setting its corner frequency.'
		)
	];
	if (design.response === 'chebyshev') {
		blocks.push(
			p(
				'From the pole formula at the top of this panel, the leftover pole is the one at θ = 90°: sin θ = 1 and cos θ = 0, so it sits on the real axis at a distance sinh(β) from the origin:'
			),
			eq(`s = -\\sinh(\\beta) = -\\sinh(${n4(design.beta)}) = -${n4(stage.normalized.breal)} \\ \\Rightarrow\\ b_{\\text{real}} = ${n4(stage.normalized.breal)}`)
		);
	} else {
		blocks.push(
			p(
				'From the pole formula at the top of this panel, the leftover pole is the one at θ = 90°: sin θ = 1 and cos θ = 0, so in the normalized prototype (ω0 = 1) it sits at exactly s = -1, no matter the order.'
			),
			eq('s = -1 \\ \\Rightarrow\\ b_{\\text{real}} = 1')
		);
	}
	return blocks;
}

/**
 * omega_c, the cutoff every normalized stage of this design gets scaled by.
 * For Butterworth this is the step where Amax actually reaches the
 * component values: the pole circle sits at omega_p * eps^(-1/n) for a
 * low-pass (omega_p * eps^(+1/n) for a high-pass), which collapses to
 * omega_p only when Amax = 3.0103 dB, i.e. eps = 1.
 */
function cutoffBlocks(design) {
	const hp = design.filterType === 'highpass';
	const wp = 2 * Math.PI * design.fp;
	if (design.response === 'chebyshev') {
		return [
			p(
				'For a Chebyshev response the pole ellipse derived at the top of this panel already has the ripple edge ωp as its frequency scale, so the prototype is scaled straight to fp with no extra factor:'
			),
			eq(`\\omega_c = 2\\pi f_p = 2\\pi \\times ${design.fp} = ${n2(design.wc)}\\ \\text{rad/s}`)
		];
	}
	const sign = hp ? '+' : '-';
	return [
		p(
			`For a Butterworth response the pole circle derived at the top of this panel has radius ω0 = ωp ε^(${sign}1/n), not ωp itself (they only coincide for Amax = 3.0103 dB). That radius is what the normalized prototype gets scaled by, so this is the step where Amax reaches the component values; ${hp ? 'for a high-pass the exponent flips sign, the poles move inward' : 'for a smaller Amax the poles move outward'}:`
		),
		eq(
			`\\omega_c = \\omega_0 = 2\\pi f_p \\, \\varepsilon^{${sign}1/n} = 2\\pi \\times ${design.fp} \\times ${n4(design.eps)}^{${sign}1/${design.n}} = ${n2(wp)} \\times ${n4(design.wcScale)} = ${n2(design.wc)}\\ \\text{rad/s}\\ \\ (f_{3\\,dB} = ${formatHz(design.wc / (2 * Math.PI))})`
		)
	];
}

/** Pole-placement math (a, b) for one second-order stage, shared by low-pass and high-pass. */
function poleBlocks(design, stageIndex) {
	const stage = design.stages[stageIndex];
	const s = stage.normalized;
	const blocks = [
		p(
			'Every second-order stage realizes one pair of poles from the pole formula at the top of this panel, in the normalized prototype (frequencies in units of the cutoff rather than Hz). A pair of poles is the same thing as a second-degree denominator, so the stage has the form:'
		),
		eq('H(s) = \\dfrac{1}{s^2 + as + b}'),
		p(
			`a and b are the two numbers this step has to find. Stage ${stageIndex + 1} takes the pole pair at the ${stageIndex + 1}${['st', 'nd', 'rd'][stageIndex] ?? 'th'} angle of the formula:`
		),
		eq(`\\theta = \\dfrac{(2 \\times ${stageIndex} + 1)\\pi}{2 \\times ${design.n}} = ${n4(s.theta)}\\ \\text{rad} = ${n2((s.theta * 180) / Math.PI)}°`)
	];

	if (design.response === 'chebyshev') {
		blocks.push(
			p(
				'σ (sigma) and ω (omega) are the pole\'s real and imaginary parts, the point σ + jω in the s-plane. Its distance from the imaginary axis, σ, is what damps the stage; ω is roughly where its resonance sits. On the Chebyshev ellipse:'
			),
			eq(`\\sigma = -\\sinh(\\beta)\\sin(\\theta) = -${n4(Math.sinh(design.beta))} \\times \\sin(${n4(s.theta)}) = ${n4(s.sigma)}`),
			eq(`\\omega = \\cosh(\\beta)\\cos(\\theta) = ${n4(Math.cosh(design.beta))} \\times \\cos(${n4(s.theta)}) = ${n4(s.omega)}`)
		);
	} else {
		blocks.push(
			p(
				'σ (sigma) and ω (omega) are the pole\'s real and imaginary parts, the point σ + jω in the s-plane. Its distance from the imaginary axis, σ, is what damps the stage; ω is roughly where its resonance sits. On the Butterworth unit circle:'
			),
			eq(`\\sigma = -\\sin(\\theta) = ${n4(s.sigma)}, \\qquad \\omega = \\cos(\\theta) = ${n4(s.omega)}`)
		);
	}

	blocks.push(
		p(
			'A pole never comes alone: σ + jω always pairs with its mirror image σ - jω (a real circuit cannot have just one), and multiplying out (s - pole)(s - mirror) gives exactly the s^2 + as + b this stage is trying to build:'
		),
		eq('(s-\\sigma-j\\omega)(s-\\sigma+j\\omega) = s^2 - 2\\sigma\\, s + (\\sigma^2+\\omega^2)'),
		eq(`a = -2\\sigma = ${n4(s.a)}`),
		design.response === 'chebyshev'
			? eq(`b = \\sigma^2 + \\omega^2 = ${n4(s.b)}`)
			: eq(`b = \\sigma^2 + \\omega^2 = \\sin^2\\theta + \\cos^2\\theta = 1`)
	);
	if (design.response !== 'chebyshev') {
		blocks.push(
			p('b is the squared distance of the pole from the origin, and every Butterworth pole sits on the unit circle, so b is exactly 1 for every stage of every order; only a changes from stage to stage.')
		);
	}
	return blocks;
}

/** The s -> s/omega_c substitution written out, so omega_n and Q are read off rather than quoted. */
function denormalizeBlocks(design, s, stage) {
	return [
		p(
			'Denormalizing puts the real frequency scale back in: replacing s by s/ωc stretches the prototype so that its cutoff of 1 rad/s lands at ωc. Multiplying top and bottom by ωc^2 gives a denominator in the standard second-order form, from which the two numbers a circuit stage is built around, the corner frequency ωn and the quality factor Q, are read off by matching coefficients. (The constant on top is dropped: every stage here is built with unity gain in its passband, so only the denominator matters.)'
		),
		eq('\\dfrac{1}{\\left(\\frac{s}{\\omega_c}\\right)^2 + a\\left(\\frac{s}{\\omega_c}\\right) + b} = \\dfrac{\\omega_c^2}{s^2 + a\\,\\omega_c\\, s + b\\,\\omega_c^2} \\quad\\longleftrightarrow\\quad \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}\\, s + \\omega_n^2}'),
		eq('\\omega_n^2 = b\\,\\omega_c^2 \\ \\Rightarrow\\ \\omega_n = \\omega_c\\sqrt{b}, \\qquad \\dfrac{\\omega_n}{Q} = a\\,\\omega_c \\ \\Rightarrow\\ Q = \\dfrac{\\sqrt{b}}{a}'),
		...cutoffBlocks(design),
		eq(
			`\\omega_n = \\omega_c \\sqrt{b} = ${n2(design.wc)} \\times \\sqrt{${n4(s.b)}} = ${n2(stage.wn)}\\ \\text{rad/s}\\ \\ (f_0 = ${formatHz(stage.wn / (2 * Math.PI))})`
		),
		eq(`Q = \\dfrac{\\sqrt{b}}{a} = \\dfrac{\\sqrt{${n4(s.b)}}}{${n4(s.a)}} = ${n4(stage.q)}`)
	];
}

/** Pole placement + denormalization for one second-order low-pass stage. */
export function explainStage(design, stageIndex) {
	const stage = design.stages[stageIndex];

	if (stage.order === 1) {
		return [
			...realPoleBlocks(design, stage),
			p(
				'Denormalizing the single pole the same way (s replaced by s/ωc) turns it into a first-order low-pass with a real time constant tau:'
			),
			eq('\\dfrac{1}{\\frac{s}{\\omega_c} + b_{\\text{real}}} \\ \\longrightarrow\\ H(s) = \\dfrac{1}{\\tau s + 1}, \\qquad \\tau = \\dfrac{1}{\\omega_c\\, b_{\\text{real}}}'),
			...cutoffBlocks(design),
			eq(
				`\\tau = \\dfrac{1}{\\omega_c \\, b_{\\text{real}}} = \\dfrac{1}{${n2(design.wc)} \\times ${n4(stage.normalized.breal)}} = ${formatSeconds(stage.tau)}`
			)
		];
	}

	return [...poleBlocks(design, stageIndex), ...denormalizeBlocks(design, stage.normalized, stage)];
}

/**
 * Pole placement + LP-to-HP transform + denormalization for one high-pass
 * stage. The pole placement itself (a, b) is identical to the low-pass
 * case above; the only extra step is substituting s -> 1/s in the
 * normalized prototype before denormalizing.
 */
export function explainHpStage(design, stageIndex) {
	const stage = design.stages[stageIndex];

	if (stage.order === 1) {
		const brealHp = stage.normalized.brealHp;
		return [
			...realPoleBlocks(design, stage),
			p(
				'For a high-pass, that pole is first flipped with s -> 1/s (the substitution that swaps low and high frequencies around the cutoff, turning gain 1 at DC into gain 1 at infinity): a real pole at b_real becomes a real pole at 1/b_real. Denormalizing then replaces s by s/ωc as usual:'
			),
			eq(
				'\\dfrac{1}{\\frac{1}{s} + b_{\\text{real}}} = \\dfrac{s}{1 + b_{\\text{real}}\\, s} \\ \\longrightarrow\\ H(s) = \\dfrac{\\tau s}{\\tau s + 1}, \\qquad \\tau = \\dfrac{1}{\\omega_c\\, b_{\\text{real,hp}}}, \\quad b_{\\text{real,hp}} = \\dfrac{1}{b_{\\text{real}}}'
			),
			eq(`b_{\\text{real,hp}} = \\dfrac{1}{${n4(stage.normalized.breal)}} = ${n4(brealHp)}`),
			...cutoffBlocks(design),
			eq(
				`\\tau = \\dfrac{1}{\\omega_c \\, b_{\\text{real,hp}}} = \\dfrac{1}{${n2(design.wc)} \\times ${n4(brealHp)}} = ${formatSeconds(stage.tau)}`
			)
		];
	}

	const s = stage.normalized;
	return [
		...poleBlocks(design, stageIndex),
		p(
			'A high-pass starts from this exact same pole pair, then applies one extra step before denormalizing: substituting s -> 1/s. That substitution swaps low and high frequencies around the cutoff (what was gain 1 at DC becomes gain 1 at infinity), and multiplying top and bottom by s^2/b puts the result back in the same shape with a new pair of coefficients:'
		),
		eq(
			'\\dfrac{1}{s^2+as+b} \\ \\xrightarrow{\\ s \\to 1/s\\ } \\ \\dfrac{1}{\\frac{1}{s^2}+\\frac{a}{s}+b} = \\dfrac{s^2/b}{s^2 + \\frac{a}{b}\\,s + \\frac{1}{b}}'
		),
		eq(`a_{hp} = \\dfrac{a}{b} = \\dfrac{${n4(s.a)}}{${n4(s.b)}} = ${n4(s.aHp)}, \\qquad b_{hp} = \\dfrac{1}{b} = \\dfrac{1}{${n4(s.b)}} = ${n4(s.bHp)}`),
		p(
			'Denormalizing then works exactly as for a low-pass (s replaced by s/ωc, coefficients matched to the standard form, this time with s^2 on top). Q comes out identical to the low-pass stage\'s: sqrt(b_hp)/a_hp = (1/sqrt(b))/(a/b) = sqrt(b)/a. Only the corner frequency moves, to the other side of ωc:'
		),
		eq('H(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}\\, s + \\omega_n^2}, \\qquad \\omega_n = \\omega_c\\sqrt{b_{hp}}, \\quad Q = \\dfrac{\\sqrt{b_{hp}}}{a_{hp}}'),
		...cutoffBlocks(design),
		eq(
			`\\omega_n = \\omega_c \\sqrt{b_{hp}} = ${n2(design.wc)} \\times \\sqrt{${n4(s.bHp)}} = ${n2(stage.wn)}\\ \\text{rad/s}\\ \\ (f_0 = ${formatHz(stage.wn / (2 * Math.PI))})`
		),
		eq(`Q = \\dfrac{\\sqrt{b_{hp}}}{a_{hp}} = \\dfrac{\\sqrt{${n4(s.bHp)}}}{${n4(s.aHp)}} = ${n4(stage.q)}`)
	];
}

/* ------------------------------------------------------------------------ */
/* 4. Component derivations                                                  */
/* ------------------------------------------------------------------------ */

/** MFB low-pass component derivation for one realized stage. */
export function explainMfb(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'The MFB (multiple-feedback) low-pass has one internal node, call it S: R1 from the input to S, C1 from S to ground, R2 from S to the op-amp\'s inverting input, R3 from the output back to S, and C2 from the inverting input to the output. The non-inverting input is grounded, so with negative feedback the inverting input is a virtual ground (0 V, no current into it). Two current balances (KCL) describe the whole circuit, one at S and one at the inverting input:'
		),
		eq('\\text{at S:}\\quad \\dfrac{V_{in} - V_S}{R_1} = sC_1 V_S + \\dfrac{V_S}{R_2} + \\dfrac{V_S - V_{out}}{R_3}, \\qquad \\text{at the (-) input:}\\quad \\dfrac{V_S}{R_2} = -sC_2\\, V_{out}'),
		p(
			'The second equation gives V_S in terms of V_out; substituting it into the first and collecting powers of s gives the transfer function, already in the s^2 + as + b shape of the Stages panel:'
		),
		eq(
			'H(s) = \\dfrac{c}{s^2 + as + b},\\quad a = \\dfrac{1}{C_1}\\!\\left(\\dfrac{1}{R_1}+\\dfrac{1}{R_2}+\\dfrac{1}{R_3}\\right),\\quad b = \\dfrac{1}{R_2 R_3 C_1 C_2},\\quad c = -\\dfrac{1}{R_1 R_2 C_1 C_2}'
		),
		p(
			`So a and b play the same role as the a and b already found for this stage, just written in terms of R1, R2, R3, C1 and C2 instead of pole positions. This stage's target is f0 = ${formatHz(targetWn / (2 * Math.PI))} (ωn = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)}; matching a and b to that target is what picks the component values:`
		),
		eq(`a = \\dfrac{\\omega_n}{Q} = \\dfrac{${n2(targetWn)}}{${n4(targetQ)}} = ${n2(st.a)}`),
		eq(`b = \\omega_n^2 = ${n2(targetWn)}^2 = ${exp4(st.b)}`),
		p(
			'Five parts, two equations: three choices are free. Choosing R1 = R3 forces the DC gain c/b to exactly -1 (the stage inverts, which does not matter for a low-pass magnitude), and picking C1 and C2 leaves two equations in two unknowns, R1 and R2. Writing x = 1/R1 = 1/R3 and y = 1/R2, the a equation says 2x + y = aC1 and the b equation says xy = bC1C2; eliminating y gives one quadratic in x:'
		),
		eq('2x^2 - (aC_1)\\,x + bC_1C_2 = 0'),
		p(
			stageDesign.manual
				? 'A quadratic only has a real solution when its discriminant is positive, which here means C1/C2 >= 8Q^2. C1 and C2 below were entered by hand; the resistors are solved directly from them:'
				: 'A quadratic only has a real solution when its discriminant is positive, which here means C1/C2 >= 8Q^2. This tool searches a preferred capacitor series for a pair that clears that bar and lands both resistors in a sane 200 ohm to 2 megohm range:'
		),
		eq(
			`C_1 = ${formatFarads(st.C1)},\\ \\ C_2 = ${formatFarads(st.C2)}\\ \\ \\left(\\text{ratio } ${(st.C1 / st.C2).toFixed(1)}\\text{:1, needs} \\geq 8Q^2 = ${(8 * targetQ * targetQ).toFixed(1)}\\text{:1}\\right)`
		),
		eq(`\\Delta = (aC_1)^2 - 8bC_1C_2 = ${exp4(st.discriminant)}`),
		eq(
			`x = \\dfrac{aC_1 + \\sqrt{\\Delta}}{4} = ${exp4(st.x)}\\ \\ \\Rightarrow\\ \\ R_1 = R_3 = \\dfrac{1}{x} = ${formatOhms(stageDesign.theoretical.R1)}`
		),
		eq(`R_2 = \\dfrac{1}{y} = \\dfrac{1}{aC_1 - 2x} = ${formatOhms(stageDesign.theoretical.R2)}`),
		p(
			`Real resistors only come in standard values, so R1 and R2 get rounded to the nearest ${st.resistorSeries} value: ${formatOhms(stageDesign.components.R1)} and ${formatOhms(stageDesign.components.R2)}. Plugging those rounded values back into a and b (not the target ones) gives what this stage will actually do, which is what the "actual" row above and the Bode plot further down are built from:`
		),
		eq(
			`f_0' = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = ${stageDesign.actual.q.toFixed(4)}`
		)
	];
	return blocks;
}

/** Sallen-Key low-pass component derivation for one realized stage. */
export function explainSallenKey(stageDesign, targetQ) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'The unity-gain Sallen-Key low-pass has one internal node, call it X: two equal resistors R in series from the input to X and on to the op-amp\'s non-inverting input, C_bottom from the non-inverting input to ground, and C_top from the output back to X. The op-amp is wired as a follower (output tied to its inverting input), so V_out equals the voltage on its non-inverting input. Two current balances describe the circuit, at X and at the non-inverting input:'
		),
		eq('\\text{at X:}\\quad \\dfrac{V_{in} - V_X}{R} = \\dfrac{V_X - V_{out}}{R} + sC_{top}\\,(V_X - V_{out}), \\qquad \\text{at (+):}\\quad \\dfrac{V_X - V_{out}}{R} = sC_{bottom}\\, V_{out}'),
		p('The second equation gives V_X = V_out (1 + sRC_bottom); substituting into the first and collecting powers of s:'),
		eq('H(s) = \\dfrac{1}{s^2 R^2 C_{top} C_{bottom} + 2sRC_{bottom} + 1} \\ \\Rightarrow\\ \\omega_n = \\dfrac{1}{R\\sqrt{C_{top} C_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{C_{top}}{C_{bottom}}}'),
		p(
			'Unlike MFB, this topology has only three components to place (R is forced equal on both resistors), and Q depends on nothing but the ratio of the two capacitors, so that ratio is fixed the moment Q is known, before any component gets picked:'
		),
		eq(
			stageDesign.manual
				? `\\dfrac{C_{top}}{C_{bottom}} = 4Q^2 = 4 \\times ${targetQ.toFixed(4)}^2 = ${(4 * targetQ * targetQ).toFixed(2)}\\quad\\text{(target; the entered pair gives } ${st.ratio.toFixed(2)}\\text{ instead)}`
				: `\\dfrac{C_{top}}{C_{bottom}} = 4Q^2 = 4 \\times ${targetQ.toFixed(4)}^2 = ${st.ratio.toFixed(2)}`
		),
		...(stageDesign.manual
			? [
					p(
						'C_top and C_bottom below were entered by hand instead of following that ratio exactly; the actual Q above already reflects whatever ratio the chosen pair happens to have, not the target Q. R is solved from the ωn equation for those two values:'
					),
					eq(`R = \\dfrac{1}{\\omega_n\\sqrt{C_{top}C_{bottom}}} = ${formatOhms(st.Rtarget)}`)
				]
			: [
					p(
						'That leaves only one free choice: C_bottom. Once it is picked (from a preferred series), C_top is whatever the ratio above says it has to be, rounded to the nearest E12 value. R is then solved from the ωn equation using the two capacitor values that will actually be used, so that C_top\'s rounding cannot shift f0:'
					),
					eq(
						`C_{bottom} = ${formatFarads(st.Cbottom)}\\ \\ \\Rightarrow\\ \\ C_{top} = \\text{ratio} \\times C_{bottom} = ${formatFarads(st.Ctarget)}\\ \\rightarrow\\ \\text{E12: } ${formatFarads(st.CtopRounded)}`
					),
					eq(`R = \\dfrac{1}{\\omega_n\\sqrt{C_{top}C_{bottom}}} = ${formatOhms(st.Rtarget)}`)
				]),
		p(
			`Rounded to the nearest preferred values: R = ${formatOhms(stageDesign.components.R1)}, C_top = ${formatFarads(stageDesign.components.Ctop)}. Recomputing ωn and Q from those rounded values (not the targets) gives what this stage will actually do:`
		),
		eq(
			`f_0' = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = ${stageDesign.actual.q.toFixed(4)}`
		)
	];
	return blocks;
}

/**
 * Why a first-order stage ends in a unity-gain buffer. Unlike every other
 * stage here the RC itself is passive: its output node has the resistor's
 * own impedance behind it, so whatever is connected next becomes part of
 * the filter. H(s) as designed (and as the Bode plot draws it) is the
 * unloaded response, which is what the buffer makes true.
 */
function bufferBlocks(stageDesign, kind) {
	const R = stageDesign.components.R;
	const C = stageDesign.components.C;
	const corner = 1 / (2 * Math.PI * R * C);
	const loadedCorner = 1 / (2 * Math.PI * ((R * 32) / (R + 32)) * C);
	const intro = p(
		`One practical point the transfer function hides: this stage is passive, so it has no output driver of its own. Looking back into its output node the source impedance is the resistor itself, ${formatOhms(R)} here, so whatever is connected next becomes part of the circuit.`
	);
	const closing = p(
		'That is why the schematic ends in a unity-gain buffer, an op-amp with its output tied straight back to its inverting input. It draws no current from the RC node, so H(s) stays exactly what was designed, and it drives the next stage or the outside world from a few ohms. The second-order stages already end at an op-amp output, so they need nothing extra.'
	);
	if (kind === 'highpass') {
		return [
			intro,
			p(
				`A load R_L sits in parallel with R, so the corner moves up to 1/(2 pi (R || R_L) C): headphones (32 ohm) would push it from ${formatHz(corner)} to about ${formatHz(loadedCorner)}, leaving the whole intended passband below the corner, so the signal disappears.`
			),
			eq(
				`\\text{loaded by } R_L:\\quad \\tau \\to (R \\parallel R_L)\\,C \\qquad \\text{buffered: } R_L \\to \\infty,\\ \\tau = RC`
			),
			closing
		];
	}
	return [
		intro,
		p(
			`A load R_L forms a plain divider with R, costing 20 log(R_L/(R + R_L)) dB across the whole band, and it also pulls the corner up to 1/(2 pi (R || R_L) C). Headphones (32 ohm) would cost ${(20 * Math.log10(32 / (R + 32))).toFixed(0)} dB, which is silence; even a 10 kilo-ohm line input costs ${(20 * Math.log10(10000 / (R + 10000))).toFixed(1)} dB.`
		),
		eq(
			`\\text{loaded by } R_L:\\quad H(s) \\to \\dfrac{R_L}{R+R_L}\\cdot\\dfrac{1}{(R \\parallel R_L)Cs + 1} \\qquad \\text{buffered: } R_L \\to \\infty,\\ H(s) = \\dfrac{1}{RCs+1}`
		),
		closing
	];
}

/** First-order RC derivation for one realized stage. */
export function explainFirstOrder(stageDesign) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'A first-order low-pass needs nothing more than one resistor and one capacitor in series, output taken across the capacitor: a voltage divider between R and the capacitor\'s impedance 1/(sC). The product RC is called tau, the time constant, and it alone sets where this stage rolls off (its corner frequency is 1/(2 pi tau)). The target tau for this stage was already computed in the Stages panel:'
		),
		eq('H(s) = \\dfrac{1/(sC)}{R + 1/(sC)} = \\dfrac{1}{RCs + 1}, \\qquad \\tau = RC'),
		eq(`\\tau = ${formatSeconds(st.tau)}`),
		p(
			stageDesign.manual
				? 'C below was entered by hand instead of picked from a preferred series; R is solved from it the same way, then rounded in turn:'
				: 'C is picked from a preferred capacitor series first, and R is solved from it; R then gets rounded in turn, same as every other stage in this design:'
		),
		eq(`C = ${formatFarads(st.C)}\\ \\ \\Rightarrow\\ \\ R = \\dfrac{\\tau}{C} = ${formatOhms(st.Rtarget)}`),
		p(`Rounded to R = ${formatOhms(stageDesign.components.R)}.`),
		eq(`\\tau' = RC = ${formatSeconds(stageDesign.actual.tau)}`),
		...bufferBlocks(stageDesign, 'lowpass')
	];
	return blocks;
}

/** MFB high-pass component derivation for one realized stage. */
export function explainMfbHp(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const blocks = [
		p(
			'The MFB high-pass is the low-pass circuit with every resistor and capacitor swapped, with the same internal node S: C1 from the input to S, R1 from S to ground, C2 from S to the inverting input, C3 from the output back to S, and R2 from the inverting input to the output. The inverting input is again a virtual ground, and the same two current balances apply:'
		),
		eq('\\text{at S:}\\quad sC_1(V_{in} - V_S) = \\dfrac{V_S}{R_1} + sC_2 V_S + sC_3 (V_S - V_{out}), \\qquad \\text{at the (-) input:}\\quad sC_2 V_S = -\\dfrac{V_{out}}{R_2}'),
		p('Eliminating V_S and collecting powers of s gives the transfer function, with s^2 on top this time (a high-pass passes the high frequencies):'),
		eq(
			'H(s) = \\dfrac{-c\\,s^2}{s^2 + as + b},\\quad a = \\dfrac{C_1+C_2+C_3}{R_2 C_2 C_3},\\quad b = \\dfrac{1}{R_1 R_2 C_2 C_3},\\quad c = \\dfrac{C_1}{C_3}'
		),
		p(
			`So a and b play the same role as a_hp and b_hp already found for this stage, just written in terms of R1, R2, C1, C2 and C3 instead of pole positions. This stage's target is f0 = ${formatHz(targetWn / (2 * Math.PI))} (ωn = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)}; matching a and b to that target is what picks the component values:`
		),
		eq(`a = \\dfrac{\\omega_n}{Q} = \\dfrac{${n2(targetWn)}}{${n4(targetQ)}} = ${n2(st.a)}`),
		eq(`b = \\omega_n^2 = ${n2(targetWn)}^2 = ${exp4(st.b)}`),
		p(
			'Setting C1 = C2 = C3 = C forces the passband gain c to exactly 1 (the stage output matches the input at high frequency, up to the sign) and, unlike the low-pass version, always has a real solution regardless of Q: there is no capacitor ratio to clear. With C fixed, the a equation gives R2 directly and the b equation then gives R1:'
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
			'The unity-gain Sallen-Key high-pass is the R-C dual of the low-pass version, with the same internal node X: two equal capacitors C in series from the input to X and on to the non-inverting input, R_bottom from the non-inverting input to ground, and R_top from the output back to X. The op-amp is again a follower, so V_out equals the non-inverting input voltage, and the same two current balances apply with R and C swapped:'
		),
		eq('\\text{at X:}\\quad sC(V_{in} - V_X) = sC(V_X - V_{out}) + \\dfrac{V_X - V_{out}}{R_{top}}, \\qquad \\text{at (+):}\\quad sC(V_X - V_{out}) = \\dfrac{V_{out}}{R_{bottom}}'),
		p('Eliminating V_X and collecting powers of s:'),
		eq('H(s) = \\dfrac{s^2 C^2 R_{top} R_{bottom}}{s^2 C^2 R_{top} R_{bottom} + 2sCR_{top} + 1} \\ \\Rightarrow\\ \\omega_n = \\dfrac{1}{C\\sqrt{R_{top} R_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{R_{bottom}}{R_{top}}}'),
		p(
			'Just like the low-pass version, Q depends on nothing but a ratio, here the resistor ratio instead of the capacitor one, so that ratio is fixed the moment Q is known:'
		),
		eq(
			stageDesign.manual
				? `\\dfrac{R_{bottom}}{R_{top}} = 4Q^2 = 4 \\times ${targetQ.toFixed(4)}^2 = ${(4 * targetQ * targetQ).toFixed(2)}\\quad\\text{(target; the entered value gives } ${st.ratio.toFixed(2)}\\text{ instead)}`
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
			`Rounded to the nearest preferred values: R_top = ${formatOhms(stageDesign.components.Rtop)}, R_bottom = ${formatOhms(stageDesign.components.Rbottom)}, C = ${formatFarads(stageDesign.components.C1)}. Recomputing ωn and Q from those rounded values (not the targets) gives what this stage will actually do:`
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
			'A first-order high-pass is the same series RC as the low-pass version, just with the output taken across the resistor instead of the capacitor. The product RC is still called tau, and it still alone sets where this stage rolls off (its corner frequency is 1/(2 pi tau)). The target tau for this stage was already computed in the Stages panel:'
		),
		eq('H(s) = \\dfrac{R}{R + 1/(sC)} = \\dfrac{RCs}{RCs + 1}, \\qquad \\tau = RC'),
		eq(`\\tau = ${formatSeconds(st.tau)}`),
		p(
			stageDesign.manual
				? 'C below was entered by hand instead of picked from a preferred series; R is solved from it the same way, then rounded in turn:'
				: 'C is picked from a preferred capacitor series first, and R is solved from it; R then gets rounded in turn, same as every other stage in this design:'
		),
		eq(`C = ${formatFarads(st.C)}\\ \\ \\Rightarrow\\ \\ R = \\dfrac{\\tau}{C} = ${formatOhms(st.Rtarget)}`),
		p(`Rounded to R = ${formatOhms(stageDesign.components.R)}.`),
		eq(`\\tau' = RC = ${formatSeconds(stageDesign.actual.tau)}`),
		...bufferBlocks(stageDesign, 'highpass')
	];
	return blocks;
}

/** How the Tow-Thomas biquad compares with the one-op-amp stages, shared by its low-pass and high-pass explanations. */
function towThomasComparison(targetQ) {
	const q = targetQ;
	return [
		p(
			`How this differs from MFB and Sallen-Key. Those two make a second-order stage with one op-amp by wrapping resistors and capacitors around it, and every component then touches both f0 and Q at once. The Tow-Thomas uses three op-amps to build the response the way a textbook does: two integrators in a loop, one damping resistor. The result is that each knob turns exactly one thing: R (Ra, Rb) sets f0, Rd alone sets Q, the input element alone sets the gain, so a stage can be tuned on the bench one parameter at a time.`
		),
		p(
			`Where it is better. No component ratio grows with Q: for the Q of ${q.toFixed(2)} in this stage MFB needs a capacitor ratio of at least 8Q^2 = ${(8 * q * q).toFixed(1)}:1 and Sallen-Key exactly 4Q^2 = ${(4 * q * q).toFixed(1)}:1, while here Q is just Rd/R = ${q.toFixed(2)} with equal capacitors, so high-Q stages (well past Q = 5, where the one-op-amp ratios become unbuildable) are routine. The sensitivities are fixed constants of magnitude 1/2 (and 1 for Rd) whatever the Q, instead of growing with it. And the same circuit gives several outputs at once: low-pass at A2, band-pass at A1, high-pass by swapping the input resistor for a capacitor, a notch by feeding the input into a third node. The low-pass output is also non-inverting, where MFB inverts.`
		),
		p(
			`Where it is worse. Three op-amps per stage instead of one: more parts, more supply current, more noise, more board space, and the third op-amp's phase lag inside the loop raises the realized Q above the designed one (Q enhancement, roughly by a factor 1 + 2 Q f0/f_T for op-amps of gain-bandwidth f_T), so f_T should be at least a few hundred times Q times f0 (the check below puts a number on it). For a plain low-Q stage where a single op-amp does the job, MFB or Sallen-Key stays the cheaper choice; the Tow-Thomas earns its op-amps when Q is high, when a filter has to be tuned, or when the band-pass or notch output is wanted too.`
		)
	];
}

/** Tow-Thomas low-pass component derivation for one realized stage. */
export function explainTowThomas(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const f0 = targetWn / (2 * Math.PI);
	const blocks = [
		p(
			'The Tow-Thomas biquad builds a second-order response the way the differential equation itself does: two integrators in a loop, like a mass on a spring, plus one resistor that sets the damping. A1 is an inverting integrator with an extra resistor Rd across its capacitor (the damping), fed by R1 from the input and by Ra from the end of the loop; A2 is a plain inverting integrator (Rb in, C2 across); A3 is a unity-gain inverter (two equal resistors r) that flips the sign so the loop closes with negative feedback. The op-amp inverting inputs are virtual grounds, so each node is one current balance:'
		),
		eq(
			'\\text{at N1:}\\ \\dfrac{V_{in}}{R_1} + \\dfrac{V_3}{R_a} + V_1\\left(sC_1 + \\dfrac{1}{R_d}\\right) = 0, \\qquad \\text{at N2:}\\ \\dfrac{V_1}{R_b} + sC_2 V_2 = 0, \\qquad V_3 = -V_2'
		),
		p(
			'The second equation gives V_2 = -V_1/(s C_2 R_b), the inverter turns it into V_3 = +V_1/(s C_2 R_b), and substituting into the first collects everything on V_1. Both outputs share one denominator D(s), which is where f0 and Q live:'
		),
		eq(
			'D(s) = s^2 + \\dfrac{s}{C_1 R_d} + \\dfrac{1}{C_1 C_2 R_a R_b}, \\qquad V_{bp} = V_1 = -\\dfrac{s / (C_1 R_1)}{D(s)}\\,V_{in}, \\qquad V_{lp} = V_2 = \\dfrac{1 / (C_1 C_2 R_1 R_b)}{D(s)}\\,V_{in}'
		),
		p('Matching D(s) to the standard form s^2 + (omega_n/Q) s + omega_n^2, and reading the low-pass numerator at s = 0:'),
		eq(
			'\\omega_n = \\dfrac{1}{\\sqrt{C_1 C_2 R_a R_b}}, \\qquad Q = R_d\\sqrt{\\dfrac{C_1}{C_2 R_a R_b}}, \\qquad \\text{DC gain} = \\dfrac{R_a}{R_1}'
		),
		p(
			'Choosing equal capacitors C1 = C2 = C and equal resistors Ra = Rb = R makes the three knobs independent: R sets omega_n, Rd alone sets Q, R1 alone sets the gain. Unity gain, like every other stage in this tool, means R1 = R.'
		),
		eq('\\omega_n = \\dfrac{1}{RC}, \\qquad Q = \\dfrac{R_d}{R}, \\qquad \\text{DC gain} = \\dfrac{R}{R_1} = 1'),
		p(
			`This stage's target is f0 = ${formatHz(f0)} (omega_n = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)}. ${stageDesign.manual ? 'C below was entered by hand; both capacitors take that value.' : 'C is picked from a preferred series so that R lands near 10 kilo-ohm, then'} R follows from omega_n, Rd from Q against the ROUNDED R (so the realized Q = Rd/R lands as close as the series allows), and r is any equal pair:`
		),
		eq(`C = ${formatFarads(st.C)}\\ \\ \\Rightarrow\\ \\ R = \\dfrac{1}{\\omega_n C} = ${formatOhms(st.Rtarget)} \\rightarrow ${formatOhms(st.Rrounded)}`),
		eq(`R_d = Q \\times R = ${targetQ.toFixed(4)} \\times ${formatOhms(st.Rrounded)} = ${formatOhms(st.RdTarget)} \\rightarrow ${formatOhms(c.Rd)}, \\qquad R_1 = R_a = R_b = ${formatOhms(c.Ra)}, \\qquad r = ${formatOhms(c.r)}`),
		p('Recomputing from the rounded values gives what the stage will actually do (the gain is exactly 1, since R1 and R are the same part value):'),
		eq(
			`f_0' = \\dfrac{1}{2\\pi R C} = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = \\dfrac{R_d}{R} = \\dfrac{${formatOhms(c.Rd)}}{${formatOhms(c.Ra)}} = ${stageDesign.actual.q.toFixed(4)}`
		),
		...towThomasComparison(targetQ),
		p(
			`Gain-bandwidth check for this stage: with Q = ${targetQ.toFixed(2)} and f0 = ${formatHz(f0)}, an op-amp with f_T = 3 MHz (a TL08x) shifts Q by roughly ${(100 * 2 * targetQ * f0 / 3e6).toFixed(1)}%; keeping that under 1% needs f_T above ${formatHz(200 * targetQ * f0)}.`
		)
	];
	return blocks;
}

/** Tow-Thomas high-pass (feedforward input capacitor) derivation for one realized stage. */
export function explainTowThomasHp(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const f0 = targetWn / (2 * Math.PI);
	return [
		p(
			'The same two-integrator loop as the low-pass Tow-Thomas (A1 damped integrator, A2 integrator, A3 inverter), with one change at the input: the signal enters A1\'s summing node through a capacitor Cin instead of a resistor. A capacitor passes current proportional to s, so the input term picks up a factor s at the node balance:'
		),
		eq(
			'\\text{at N1:}\\ sC_{in}V_{in} + \\dfrac{V_3}{R_a} + V_1\\left(sC_1 + \\dfrac{1}{R_d}\\right) = 0, \\qquad \\text{at N2:}\\ \\dfrac{V_1}{R_b} + sC_2 V_2 = 0, \\qquad V_3 = -V_2'
		),
		p('Eliminating V_2 and V_3 exactly as before, the input term now carries s^2 on top after multiplying through by s, so A1\'s output is a high-pass and A2\'s output (one more integration) is a band-pass:'),
		eq(
			'D(s) = s^2 + \\dfrac{s}{C_1 R_d} + \\dfrac{1}{C_1 C_2 R_a R_b}, \\qquad V_{hp} = V_1 = -\\dfrac{C_{in}}{C_1}\\,\\dfrac{s^2}{D(s)}\\,V_{in}, \\qquad V_{bp} = V_2 = \\dfrac{C_{in}}{C_1 C_2 R_b}\\,\\dfrac{s}{D(s)}\\,V_{in}'
		),
		p('omega_n and Q are the same expressions as the low-pass form; the high-frequency gain is Cin/C1, so Cin = C gives a unity-magnitude, inverting high-pass. With equal capacitors and equal resistors:'),
		eq('\\omega_n = \\dfrac{1}{RC}, \\qquad Q = \\dfrac{R_d}{R}, \\qquad H(\\infty) = -\\dfrac{C_{in}}{C} = -1'),
		p(
			`This stage's target is f0 = ${formatHz(f0)} (omega_n = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)}. ${stageDesign.manual ? 'C below was entered by hand; all three capacitors take that value.' : 'C is picked from a preferred series so that R lands near 10 kilo-ohm, then'} R follows from omega_n and Rd from Q against the rounded R:`
		),
		eq(`C_{in} = C_1 = C_2 = ${formatFarads(st.C)}\\ \\ \\Rightarrow\\ \\ R = \\dfrac{1}{\\omega_n C} = ${formatOhms(st.Rtarget)} \\rightarrow ${formatOhms(st.Rrounded)}`),
		eq(`R_d = Q \\times R = ${targetQ.toFixed(4)} \\times ${formatOhms(st.Rrounded)} = ${formatOhms(st.RdTarget)} \\rightarrow ${formatOhms(c.Rd)}, \\qquad R_a = R_b = ${formatOhms(c.Ra)}, \\qquad r = ${formatOhms(c.r)}`),
		eq(
			`f_0' = \\dfrac{1}{2\\pi R C} = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = \\dfrac{R_d}{R} = ${stageDesign.actual.q.toFixed(4)}, \\quad H(\\infty) = -1`
		),
		p(
			'Against the one-op-amp high-pass stages: MFB high-pass uses three equal capacitors and two resistors with fixed sensitivities, Sallen-Key high-pass needs a 4Q^2 resistor ratio. Here the high-pass is the low-pass circuit with one resistor swapped for a capacitor, so a board laid out for one form does both, and the band-pass comes out of A2 at the same time.'
		),
		...towThomasComparison(targetQ),
		p(
			`Gain-bandwidth check for this stage: with Q = ${targetQ.toFixed(2)} and f0 = ${formatHz(f0)}, an op-amp with f_T = 3 MHz (a TL08x) shifts Q by roughly ${(100 * 2 * targetQ * f0 / 3e6).toFixed(1)}%; keeping that under 1% needs f_T above ${formatHz(200 * targetQ * f0)}.`
		)
	];
}

/**
 * Explains the summing amplifier that combines a band-stop design's
 * low-pass and high-pass branches into the final notch output.
 */
export function explainSummingAmp(R, { mode = 'sum', lpSign = 1, hpSign = 1, lpOrder = 2, hpOrder = 2, centreHz = 0, sumDb = 0, differenceDb = 0 } = {}) {
	const signWord = (s) => (s > 0 ? '+1' : '-1');
	const intro = p(
		`The low-pass branch and the high-pass branch above run in parallel from the same input, each producing its own output, and one op-amp combines them into the notch. Far from the notch only one branch is alive, so the output is that branch alone whatever the combiner does. Inside the notch both branches are down to their tails, and the tails have known phases: a low-pass of order n falls like 1/s^n, which is a phase of -n times 90 degrees, and a high-pass of order m rises like s^m, +m times 90 degrees, each multiplied by the branch's passband sign (every second-order stage has an exactly known gain: MFB and the Tow-Thomas high-pass -1, Sallen-Key and the Tow-Thomas low-pass +1, first-order stages +1, whatever the rounding). Here the low-pass branch has order ${lpOrder} and sign ${signWord(lpSign)}, the high-pass branch order ${hpOrder} and sign ${signWord(hpSign)}.`
	);
	const rule = p(
		`Near the centre of the notch (${formatHz(centreHz)}) the two tails are about the same size, and the notch is deepest when they arrive in antiphase and cancel. Whether adding or subtracting the branches does that depends on the two orders and signs, and on how far the realized poles sit from their asymptotes, so rather than trust a rule of thumb both combiners are evaluated with the rounded components: a plain sum gives ${sumDb.toFixed(1)} dB of attenuation at the centre, a difference ${differenceDb.toFixed(1)} dB, so the ${mode === 'difference' ? 'difference amplifier' : 'summing amplifier'} is used. Far from the centre the choice changes nothing, since only one branch is alive there.`
	);
	if (mode === 'difference') {
		return [
			intro,
			rule,
			p(
				'A unity-gain difference amplifier subtracts one branch from the other. Its + input divides V_hp by two through the R, R pair, and the - input is held at that same voltage by feedback:'
			),
			eq(
				'V_+ = \\dfrac{V_{hp}}{2}, \\qquad \\dfrac{V_{lp} - V_-}{R} = \\dfrac{V_- - V_{out}}{R},\\ \\ V_- = V_+ \\ \\Rightarrow\\ V_{out} = 2V_+ - V_{lp} = V_{hp} - V_{lp}'
			),
			eq(`R = R_g = R_f = ${formatOhms(R)}\\ \\ \\Rightarrow\\ \\ V_{out} = V_{hp} - V_{lp}`),
			p(
				'Far below the stopband, the low-pass branch passes at full strength while the high-pass branch is already deep in its own stopband, so the output is essentially the low-pass branch alone (and the mirror image far above the stopband). Inside the stopband, both branches are attenuated at once, so the output drops too: that drop is the notch, and how deep it gets is set by the same Amax/Amin order search used for every other filter type in this tool, not by matching any component pair precisely.'
			)
		];
	}
	return [
		intro,
		rule,
		p(
			'A plain inverting summing amplifier adds the two outputs together. With the inverting input a virtual ground, the currents through Ra and Rb simply add up and flow through Rf:'
		),
		eq('\\dfrac{V_{lp}}{R_a} + \\dfrac{V_{hp}}{R_b} = -\\dfrac{V_{out}}{R_f} \\ \\Rightarrow\\ V_{out} = -\\left(\\dfrac{R_f}{R_a}V_{lp} + \\dfrac{R_f}{R_b}V_{hp}\\right)'),
		p('Making Ra, Rb and Rf all equal gives an exact, rounding-proof unity-magnitude sum:'),
		eq(`R_a = R_b = R_f = ${formatOhms(R)}\\ \\ \\Rightarrow\\ \\ V_{out} = -(V_{lp} + V_{hp})`),
		p(
			'Far below the stopband, the low-pass branch passes at full strength while the high-pass branch is already deep in its own stopband, so the sum is essentially just the low-pass branch (and the mirror image far above the stopband). Inside the stopband, both branches are attenuated at once, so the sum drops too: that drop is the notch, and how deep it gets is set by the same Amax/Amin order search used for every other filter type in this tool, not by matching any component pair precisely.'
		)
	];
}
