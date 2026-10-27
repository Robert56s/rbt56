import { pairLabel, seriesPair } from './eseries';
import { explainModernApproximation, explainModernOrder, isClassic, modernRealPoleBlocks, modernStageBlocks } from './explainResponses';
import { formatFarads, formatHz, formatOhms, formatSeconds } from './format';
import { narrowStageSensitivity, narrowTextbook, NARROW_GAIN_SPEED } from './narrowBand';
import { sallenKeyBpLimit } from './sallenKeyBandPass';

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

/** A rounded resistor as the component table prints it: 64.2 kΩ (56.0 kΩ + 8.20 kΩ) when it is two in series. */
const ohms = (value, series) => pairLabel(value, series, formatOhms);
/** What the resistors were rounded to: a series by name, or the values on hand. */
const stockValue = (series) => (Array.isArray(series) ? 'value on hand' : `${series} value`);
/** ', or two in series ...' when any of these values is a pair, '' otherwise. */
const pairedTail = (series, values) => (values.some((v) => seriesPair(v, series)) ? ', or two in series where no single one comes within 2 %' : '');
/** The sentence naming the resistors built from two in series ([name, value] rows), or '' when there is none. */
function pairsSentence(parts, series) {
	const paired = parts.filter(([, v]) => seriesPair(v, series));
	if (paired.length === 0) return '';
	return `${paired.map(([name, v]) => `${name} = ${ohms(v, series)}`).join(' and ')} ${paired.length > 1 ? 'are each' : 'is'} two resistors in series, since no single value on hand comes within 2 %.`;
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
			isClassic(design.response)
				? 'The a coefficients are the only freedom left, and the two classic responses are two different ways of spending it.'
				: 'The a coefficients are the only freedom left, and each response is a different way of spending it (two of them also add a numerator, zeros, to spend some more).'
		)
	];

	if (!isClassic(design.response)) return [...blocks, ...explainModernApproximation(design)];

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
export function explainOrder({ response, amaxDb, aminDb, k, minOrder, filterType = 'lowpass', nUsed = null, evenOnly = false, tried = null }) {
	if (!isClassic(response)) return explainModernOrder({ response, amaxDb, aminDb, k, minOrder, tried, filterType, nUsed });
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
	if (!isClassic(design.response)) return stage.order === 1 ? modernRealPoleBlocks(design, stage) : modernStageBlocks(design, stageIndex);

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
	if (!isClassic(design.response)) return stage.order === 1 ? modernRealPoleBlocks(design, stage) : modernStageBlocks(design, stageIndex);

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

/**
 * MFB low-pass component derivation for one realized stage. `shownIn` says
 * where the page shows what the rounded stage does (this tool's "actual"
 * row and Bode plot by default; the AM tool passes its own).
 */
export function explainMfb(stageDesign, targetWn, targetQ, { shownIn = 'which is what the "actual" row above and the Bode plot further down are built from' } = {}) {
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
			`Real resistors only come in standard values, so R1 and R2 get rounded to the nearest ${stockValue(st.resistorSeries)}${pairedTail(st.resistorSeries, [stageDesign.components.R1, stageDesign.components.R2])}: ${ohms(stageDesign.components.R1, st.resistorSeries)} and ${ohms(stageDesign.components.R2, st.resistorSeries)}. Plugging those rounded values back into a and b (not the target ones) gives what this stage will actually do, ${shownIn}:`
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
			`Rounded to the nearest preferred values: R = ${ohms(stageDesign.components.R1, st.resistorSeries)}, C_top = ${formatFarads(stageDesign.components.Ctop)}. Recomputing ωn and Q from those rounded values (not the targets) gives what this stage will actually do:`
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
		p(`Rounded to R = ${ohms(stageDesign.components.R, st.resistorSeries)}.`),
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
			`Real resistors only come in standard values, so R1 and R2 get rounded to the nearest ${stockValue(st.resistorSeries)}${pairedTail(st.resistorSeries, [stageDesign.components.R1, stageDesign.components.R2])}: ${ohms(stageDesign.components.R1, st.resistorSeries)} and ${ohms(stageDesign.components.R2, st.resistorSeries)}. Plugging those rounded values back into a and b (not the target ones) gives what this stage will actually do, which is what the "actual" row above and the Bode plot further down are built from:`
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
			`Rounded to the nearest preferred values: R_top = ${ohms(stageDesign.components.Rtop, st.resistorSeries)}, R_bottom = ${ohms(stageDesign.components.Rbottom, st.resistorSeries)}, C = ${formatFarads(stageDesign.components.C1)}. Recomputing ωn and Q from those rounded values (not the targets) gives what this stage will actually do:`
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
		p(`Rounded to R = ${ohms(stageDesign.components.R, st.resistorSeries)}.`),
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
			`Where it is worse. Three op-amps per stage instead of one: more parts, more supply current, more noise, more board space, and the third op-amp's phase lag inside the loop raises the realized Q above the designed one (Q enhancement: Q_real = Q / (1 - 4 Q f0/f_T) for op-amps of gain-bandwidth f_T, which oscillates once 4 Q f0 reaches f_T), so f_T should be at least 400 times Q times f0 for a 1% error (the check below puts a number on it). For a plain low-Q stage where a single op-amp does the job, MFB or Sallen-Key stays the cheaper choice; the Tow-Thomas earns its op-amps when Q is high, when a filter has to be tuned, or when the band-pass or notch output is wanted too.`
		)
	];
}

/** Tow-Thomas low-pass component derivation for one realized stage. */
export function explainTowThomas(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const paired = pairsSentence([['R', c.Ra], ['Rd', c.Rd]], st.resistorSeries);
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
		p(`${paired} Recomputing from the rounded values gives what the stage will actually do (the gain is exactly 1, since R1 and R are the same part value):`.trim()),
		eq(
			`f_0' = \\dfrac{1}{2\\pi R C} = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = \\dfrac{R_d}{R} = \\dfrac{${formatOhms(c.Rd)}}{${formatOhms(c.Ra)}} = ${stageDesign.actual.q.toFixed(4)}`
		),
		...towThomasComparison(targetQ),
		p(
			`Gain-bandwidth check for this stage: with Q = ${targetQ.toFixed(2)} and f0 = ${formatHz(f0)}, an op-amp with f_T = 3 MHz (a TL08x) ${4 * targetQ * f0 < 3e6 ? `raises Q by roughly ${(100 * (1 / (1 - (4 * targetQ * f0) / 3e6) - 1)).toFixed(1)}% (Q_real = Q / (1 - 4 Q f0 / f_T))` : 'makes the loop oscillate (4 Q f0 reaches f_T)'}; keeping that under 1% needs f_T above ${formatHz(400 * targetQ * f0)}.`
		)
	];
	return blocks;
}

/** Tow-Thomas high-pass (feedforward input capacitor) derivation for one realized stage. */
export function explainTowThomasHp(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const paired = pairsSentence([['R', c.Ra], ['Rd', c.Rd]], st.resistorSeries);
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
		...(paired ? [p(paired)] : []),
		eq(
			`f_0' = \\dfrac{1}{2\\pi R C} = ${formatHz(stageDesign.actual.wn / (2 * Math.PI))},\\quad Q' = \\dfrac{R_d}{R} = ${stageDesign.actual.q.toFixed(4)}, \\quad H(\\infty) = -1`
		),
		p(
			'Against the one-op-amp high-pass stages: MFB high-pass uses three equal capacitors and two resistors with fixed sensitivities, Sallen-Key high-pass needs a 4Q^2 resistor ratio. Here the high-pass is the low-pass circuit with one resistor swapped for a capacitor, so a board laid out for one form does both, and the band-pass comes out of A2 at the same time.'
		),
		...towThomasComparison(targetQ),
		p(
			`Gain-bandwidth check for this stage: with Q = ${targetQ.toFixed(2)} and f0 = ${formatHz(f0)}, an op-amp with f_T = 3 MHz (a TL08x) ${4 * targetQ * f0 < 3e6 ? `raises Q by roughly ${(100 * (1 / (1 - (4 * targetQ * f0) / 3e6) - 1)).toFixed(1)}% (Q_real = Q / (1 - 4 Q f0 / f_T))` : 'makes the loop oscillate (4 Q f0 reaches f_T)'}; keeping that under 1% needs f_T above ${formatHz(400 * targetQ * f0)}.`
		)
	];
}

/**
 * Explains the summing amplifier that combines a band-stop design's
 * low-pass and high-pass branches into the final notch output.
 */
export function explainSummingAmp(R, { mode = 'sum', lpSign = 1, hpSign = 1, lpOrder = 2, hpOrder = 2, centreHz = 0, sumDb = 0, differenceDb = 0, lpGain = 1, resistors = null } = {}) {
	const signWord = (s) => (s > 0 ? '+1' : '-1');
	const scaled = Math.abs(Math.abs(lpGain) - 1) > 1e-6;
	const intro = p(
		`The low-pass branch and the high-pass branch above run in parallel from the same input, each producing its own output, and one op-amp combines them into the notch. Far from the notch only one branch is alive, so the output is that branch alone whatever the combiner does. Inside the notch both branches are down to their tails, and the tails have known phases: a low-pass of order n falls like 1/s^n, which is a phase of -n times 90 degrees, and a high-pass of order m rises like s^m, +m times 90 degrees, each multiplied by the branch's passband sign (every second-order stage has a known gain: MFB, the Tow-Thomas high-pass and the notch stages -1, Sallen-Key and the Tow-Thomas low-pass +1, first-order stages +1, whatever the rounding). Here the low-pass branch has order ${lpOrder} and sign ${signWord(lpSign)}, the high-pass branch order ${hpOrder} and sign ${signWord(hpSign)}.`
	);
	const trim = scaled
		? [
				p(
					`One gain is not exactly 1 here: a notch stage on the low-pass side passes DC at R/Rz, and its Cin had to be rounded to a stocked capacitor, so the low-pass branch comes out with a DC gain of ${Math.abs(lpGain).toFixed(4)} (${(20 * Math.log10(Math.abs(lpGain))).toFixed(2)} dB). The combiner evens it out: the resistor that brings the low-pass branch in is scaled by the same factor, so both passbands still come out at the same level.`
				),
				eq(
					mode === 'difference'
						? `R_{l} = R_{g} = ${Math.abs(lpGain).toFixed(4)} \\times ${formatOhms(R)} \\rightarrow ${formatOhms(resistors?.RCL ?? R * Math.abs(lpGain))}, \\qquad R = R_f = ${formatOhms(R)}`
						: `R_a = ${Math.abs(lpGain).toFixed(4)} \\times ${formatOhms(R)} \\rightarrow ${formatOhms(resistors?.RCA ?? R * Math.abs(lpGain))}, \\qquad R_b = R_f = ${formatOhms(R)}`
				)
			]
		: [];
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
			eq(`R = R_l = R_g = R_f = ${formatOhms(R)}\\ \\ \\Rightarrow\\ \\ V_{out} = V_{hp} - V_{lp}`),
			...(scaled
				? [
						p('With the low-pass input resistor R_l and the ground resistor R_g both scaled by the branch gain G, the same balance gives:'),
						eq('V_{out} = \\left(1 + \\dfrac{R_f}{R_l}\\right)\\dfrac{R_g}{R + R_g}\\,V_{hp} - \\dfrac{R_f}{R_l}\\,V_{lp} = V_{hp} - \\dfrac{V_{lp}}{G}'),
						...trim
					]
				: []),
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
		...trim,
		p(
			'Far below the stopband, the low-pass branch passes at full strength while the high-pass branch is already deep in its own stopband, so the sum is essentially just the low-pass branch (and the mirror image far above the stopband). Inside the stopband, both branches are attenuated at once, so the sum drops too: that drop is the notch, and how deep it gets is set by the same Amax/Amin order search used for every other filter type in this tool, not by matching any component pair precisely.'
		)
	];
}

/* ------------------------------------------------------------------------ */
/* 5. Band-pass and band-stop by transformation of a low-pass prototype      */
/* ------------------------------------------------------------------------ */

const TWO_PI = 2 * Math.PI;
/** A frequency in Hz as a plain number inside a formula: 48989.8, 10000. */
const hzNum = (f) => (Number.isFinite(f) ? String(Number(f.toPrecision(6))) : '-');
/** An angular frequency as the Hz the page prints. */
const hzOf = (w) => formatHz(w / TWO_PI);
/** a + j b as TeX, with the sign of b written out. */
const complexTex = (re, im) => `${n2(re)} ${im < 0 ? '-' : '+'} j\\,${n2(Math.abs(im))}`;
/** A gain in dB with its sign. */
const signedDb = (g) => {
	const d = 20 * Math.log10(Math.abs(g));
	return Number.isFinite(d) ? `${d >= 0 ? '+' : ''}${d.toFixed(2)}` : '-';
};
/** The upper pole -wn/(2Q) + j wn sqrt(1 - 1/(4Q^2)) of a second-order stage, rad/s. */
function upperPole(wn, q) {
	return { re: -wn / (2 * q), im: wn * Math.sqrt(Math.max(0, 1 - 1 / (4 * q * q))) };
}
const bandWord = (design) => (design.filterType === 'bandstop' ? 'band-stop' : 'band-pass');
const stageCount = (design) => `${design.stages.length} second-order stage${design.stages.length === 1 ? '' : 's'}`;
/** A response's name inside a sentence. */
const RESPONSE_NAME = { butterworth: 'Butterworth', chebyshev: 'Chebyshev', legendre: 'Legendre', bessel: 'Bessel', inverseChebyshev: 'inverse Chebyshev', elliptic: 'elliptic' };

/**
 * How the band edges turn into one low-pass prototype and how its poles
 * and zeros turn into band stages (shown once, in the Stages panel, next
 * to the prototype's own response). Every number comes from the design.
 */
export function explainBandTransform(design) {
	const stop = design.filterType === 'bandstop';
	const { fl, fh, fsl, fsh, f0, B, w0, bw } = design;
	const proto = design.lowpass;
	const pairIndex = proto.stages.findIndex((s) => s.order === 2);
	const realIndex = proto.stages.findIndex((s) => s.order === 1);
	const zeroIndex = proto.stages.findIndex((s) => Number.isFinite(s.wz));
	const blocks = [
		p(
			`A ${bandWord(design)} can also be built from a single low-pass, the prototype, moved onto the band by a change of variable, instead of from two filters ${stop ? 'added together' : 'in a row'}. The band is described by two numbers: its centre f0, the geometric mean of the passband edges (not the arithmetic one), and its width B:`
		),
		eq(`f_0 = \\sqrt{f_l f_h} = \\sqrt{${hzNum(fl)} \\times ${hzNum(fh)}} = ${formatHz(f0)}, \\qquad B = f_h - f_l = ${formatHz(B)}`),
		p(
			stop
				? 'The prototype is an ordinary low-pass whose passband edge is B. Every s in its transfer function is replaced by a function of s that is zero at DC and far above the band, and infinite at f0: the passband of the prototype, around its DC, lands on both outer passbands, and its stopband folds into the middle of the band:'
				: 'The prototype is an ordinary low-pass whose passband edge is B. Every s in its transfer function is replaced by a function of s that is zero at f0 and grows on both sides of it: the DC of the prototype lands on the centre of the band, and its stopband on both sides:'
		),
		eq(
			stop
				? 's \\ \\longrightarrow\\ \\dfrac{\\omega_B\\, s}{s^2 + \\omega_0^2}, \\qquad \\omega_0 = 2\\pi f_0,\\ \\ \\omega_B = 2\\pi B \\qquad \\Longrightarrow \\qquad \\Omega(f) = \\dfrac{f\\,B}{f_0^2 - f^2}'
				: 's \\ \\longrightarrow\\ \\dfrac{s^2 + \\omega_0^2}{\\omega_B\\, s}, \\qquad \\omega_0 = 2\\pi f_0,\\ \\ \\omega_B = 2\\pi B \\qquad \\Longrightarrow \\qquad \\Omega(f) = \\dfrac{f^2 - f_0^2}{f\\,B}'
		),
		p(
			'On the frequency axis, s = jω, the substitution gives jΩ: the band filter does at the frequency f what the prototype does at Ω, counted in units of its passband edge. Since f0^2 = fl fh, both passband edges land on Ω = ±1, where the prototype loses exactly Amax:'
		),
		eq(
			stop
				? '\\Omega(f_l) = \\dfrac{f_l B}{f_l f_h - f_l^2} = \\dfrac{B}{f_h - f_l} = 1, \\qquad \\Omega(f_h) = \\dfrac{f_h B}{f_l f_h - f_h^2} = -1'
				: '\\Omega(f_h) = \\dfrac{f_h^2 - f_l f_h}{f_h B} = \\dfrac{f_h - f_l}{B} = 1, \\qquad \\Omega(f_l) = \\dfrac{f_l^2 - f_l f_h}{f_l B} = -1'
		),
		p(
			'A magnitude only depends on the size of Ω, so the band filter is geometrically symmetric: f and f0^2/f lose the same. The stopband edges land beyond 1, each at its own Ω, and panel 02 counts the order from these two numbers:'
		),
		eq(
			stop
				? `\\Omega_{sl} = \\dfrac{${hzNum(fsl)} \\times ${hzNum(B)}}{|${hzNum(f0)}^2 - ${hzNum(fsl)}^2|} = ${n4(design.omegaLow)}, \\qquad \\Omega_{sh} = \\dfrac{${hzNum(fsh)} \\times ${hzNum(B)}}{|${hzNum(f0)}^2 - ${hzNum(fsh)}^2|} = ${n4(design.omegaHigh)}`
				: `\\Omega_{sl} = \\dfrac{|${hzNum(fsl)}^2 - ${hzNum(f0)}^2|}{${hzNum(fsl)} \\times ${hzNum(B)}} = ${n4(design.omegaLow)}, \\qquad \\Omega_{sh} = \\dfrac{|${hzNum(fsh)}^2 - ${hzNum(f0)}^2|}{${hzNum(fsh)} \\times ${hzNum(B)}} = ${n4(design.omegaHigh)}`
		),
		p(
			`With n = ${design.n} the prototype is designed like any low-pass of this tool, with its passband edge at B and Amax = ${design.amaxDb} dB, so Amax lands exactly on fl and fh whatever the response.`
		)
	];

	if (pairIndex >= 0) {
		const ps = proto.stages[pairIndex];
		const P = upperPole(ps.wn, ps.q);
		const [lo, hi] = design.stages.filter((s) => s.pole === pairIndex);
		const size2 = P.re * P.re + P.im * P.im;
		const split = stop ? `\\dfrac{\\omega_B^2}{p} = ${complexTex((bw * bw * P.re) / size2, (-bw * bw * P.im) / size2)}, \\quad ` : '';
		blocks.push(
			p(
				stop
					? 'At the scale of the prototype itself (passband edge ω_B instead of 1) the substitution reads s_lp = ω_B^2 s/(s^2 + ω0^2), and each prototype pole p turns into the two roots of one quadratic:'
					: 'At the scale of the prototype itself (passband edge ω_B instead of 1) the factor ω_B drops out, s_lp = (s^2 + ω0^2)/s, and each prototype pole p turns into the two roots of one quadratic:'
			),
			eq(
				stop
					? '\\dfrac{\\omega_B^2\\, s}{s^2 + \\omega_0^2} = p \\ \\Longrightarrow\\ s^2 - \\dfrac{\\omega_B^2}{p}\\, s + \\omega_0^2 = 0, \\qquad s_1 s_2 = \\omega_0^2'
					: '\\dfrac{s^2 + \\omega_0^2}{s} = p \\ \\Longrightarrow\\ s^2 - p\\, s + \\omega_0^2 = 0, \\qquad s_1 s_2 = \\omega_0^2'
			),
			p(
				'The pole p is complex, so the two roots are not a mirror pair: the mirror image of each one comes from the conjugate pole p*. One prototype pole pair therefore becomes two second-order stages. Their roots multiply to ω0^2, so the two stages sit on either side of f0, symmetric on a log axis (fn1 fn2 = f0^2), and they share one Q: with s2 = ω0^2/s1, |s2| = ω0^2/|s1| and Re s2 = ω0^2 Re s1/|s1|^2, so |s|/(-2 Re s) is the same for both. For the first pole pair of this design:'
			),
			eq(
				`p = ${complexTex(P.re, P.im)}\\ \\text{rad/s}, \\quad ${split}f_{n1} = ${hzOf(lo.wn)},\\ \\ f_{n2} = ${hzOf(hi.wn)},\\ \\ Q = ${n4(lo.q)}, \\qquad \\sqrt{f_{n1} f_{n2}} = ${hzOf(Math.sqrt(lo.wn * hi.wn))} = f_0`
			)
		);
	}

	if (realIndex >= 0) {
		const tau = proto.stages[realIndex].tau;
		const centre = design.stages.find((s) => s.pole === realIndex);
		blocks.push(
			p(`The real pole p = -1/τ of an odd order has no partner. Its quadratic has real coefficients, so it gives a single stage, centred exactly on f0${stop ? ', with its zeros there too: a symmetric notch' : ''}:`),
			eq(
				stop
					? `\\dfrac{\\omega_B^2\\, s}{s^2 + \\omega_0^2} = -\\dfrac{1}{\\tau} \\ \\Longrightarrow\\ s^2 + \\tau\\,\\omega_B^2\\, s + \\omega_0^2 = 0, \\qquad \\omega_n = \\omega_0,\\ \\ Q = \\dfrac{\\omega_0}{\\omega_B^2\\,\\tau} = \\dfrac{${n2(w0)}}{${n2(bw)}^2 \\times ${formatSeconds(tau)}} = ${n4(centre.q)}`
					: `\\dfrac{s^2 + \\omega_0^2}{s} = -\\dfrac{1}{\\tau} \\ \\Longrightarrow\\ s^2 + \\dfrac{s}{\\tau} + \\omega_0^2 = 0, \\qquad \\omega_n = \\omega_0,\\ \\ Q = \\omega_0\\,\\tau = ${n2(w0)} \\times ${formatSeconds(tau)} = ${n4(centre.q)}`
			)
		);
	}

	// zeros: where the prototype's zeros at infinity and its finite zeros land
	if (zeroIndex >= 0) {
		const wz = proto.stages[zeroIndex].wz;
		const [lo, hi] = design.stages.filter((s) => s.pole === zeroIndex);
		blocks.push(
			p(
				stop
					? 'Zeros. A prototype zero at ±jωz turns into two zeros on the jω axis with product ω0^2, from the same kind of quadratic with r = ω_B^2/ωz in its place; the lower zero goes with the lower stage of the pair, the upper one with the upper stage. The zero at infinity left over by an odd order lands on f0, so the stage of the real pole is a symmetric notch:'
					: 'Zeros. A prototype zero at ±jωz turns into two zeros on the jω axis with product ω0^2. The upper one goes with the upper stage of the pair, whose zero then sits above its poles (a low-pass notch); the lower one goes with the lower stage, a high-pass notch. The real pole of an odd order brings no finite zero and stays a plain band-pass stage:'
			),
			eq(
				stop
					? '\\dfrac{\\omega_B^2\\, s}{s^2 + \\omega_0^2} = j\\omega_z \\ \\Longrightarrow\\ \\omega_{z\\pm} = \\sqrt{\\dfrac{r^2}{4} + \\omega_0^2} \\pm \\dfrac{r}{2},\\ \\ r = \\dfrac{\\omega_B^2}{\\omega_z}, \\qquad \\omega_{z+}\\,\\omega_{z-} = \\omega_0^2'
					: '\\dfrac{s^2 + \\omega_0^2}{s} = j\\omega_z \\ \\Longrightarrow\\ \\omega_{z\\pm} = \\sqrt{\\dfrac{\\omega_z^2}{4} + \\omega_0^2} \\pm \\dfrac{\\omega_z}{2}, \\qquad \\omega_{z+}\\,\\omega_{z-} = \\omega_0^2'
			),
			eq(`f_z = ${hzOf(wz)} \\ \\Longrightarrow\\ f_{z+} = ${hzOf(hi.wz)},\\ \\ f_{z-} = ${hzOf(lo.wz)}, \\qquad \\sqrt{f_{z+} f_{z-}} = ${hzOf(Math.sqrt(hi.wz * lo.wz))} = f_0`)
		);
	} else {
		blocks.push(
			p(
				stop
					? 'Zeros. The prototype has all its zeros at infinity, and they land where the substitution is infinite, s^2 + ω0^2 = 0: every stage has its zeros at ±jω0, a notch exactly at f0. The lower stage of each pair has its poles below f0, so its zero sits above them (a low-pass notch); the upper stage is a high-pass notch.'
					: 'Zeros. The prototype has all its zeros at infinity, and the substitution is infinite at both s = 0 and s = ∞: every stage gets one zero at DC and one at infinity, the numerator s of a band-pass stage.'
			)
		);
	}

	if (stop) {
		const product = design.stages.reduce((acc, s) => acc * (s.wn / s.wz) ** 2, 1);
		blocks.push(
			p(
				'Gains. Every notch stage is set for gain 1 at DC, whichever side of its poles the zero sits on. Far above the band a stage then passes (ωn/ωz)^2, and each pair has poles and zeros whose products are both ω0^2, so these factors cancel pair by pair: the whole filter passes exactly 1 at DC and far above the band, with no summing amplifier.'
			),
			eq(
				`H(s) = \\dfrac{\\omega_n^2}{\\omega_z^2}\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}\\,s + \\omega_n^2}, \\qquad H(0) = 1,\\ \\ H(\\infty) = \\dfrac{\\omega_n^2}{\\omega_z^2}, \\qquad \\prod_i \\dfrac{\\omega_{n,i}^2}{\\omega_{z,i}^2} = ${n4(product)}`
			)
		);
	} else {
		const first = design.stages.find((s) => s.filterType === 'bandpass' && s.role !== 'centre');
		const detune = first ? first.wn / w0 - w0 / first.wn : NaN;
		const evenRipple = design.n % 2 === 0 && (design.response === 'chebyshev' || design.response === 'elliptic');
		blocks.push(
			// band-pass stages off f0 come only from pole pairs without zeros
			...(first
				? [
						p(
							'Gains. A band-pass stage peaks at its own centre fn, and each stage here is set so that the whole filter has gain exactly 1 at f0. A stage centred off f0 has already lost some gain by f0, so its gain K at its own centre is raised by just that much; both stages of a pair need the same K:'
						),
						eq(
							'H(s) = K\\,\\dfrac{\\frac{\\omega_n}{Q}\\,s}{s^2 + \\frac{\\omega_n}{Q}\\,s + \\omega_n^2}, \\qquad |H(j\\omega_0)| = 1 \\ \\Longrightarrow\\ K = \\sqrt{1 + Q^2\\left(\\dfrac{\\omega_n}{\\omega_0} - \\dfrac{\\omega_0}{\\omega_n}\\right)^2}'
						),
						eq(`K = \\sqrt{1 + ${n4(first.q)}^2 \\times (${n4(detune)})^2} = ${n4(first.gain)}`)
					]
				: [p('Gains. Each stage here is set so that the whole filter has gain exactly 1 at f0.')]),
			...(zeroIndex >= 0
				? [
						p('A notch stage has no single peak. It is set for gain 1 at f0 through its gain far above the zero, K∞:'),
						eq(
							'H(s) = K_\\infty\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}\\,s + \\omega_n^2}, \\qquad K_\\infty = \\dfrac{|\\omega_n^2 - \\omega_0^2 + j\\,\\omega_n\\omega_0/Q|}{|\\omega_z^2 - \\omega_0^2|}'
						)
					]
				: []),
			p(
				`${realIndex >= 0 ? 'The stage of the real pole sits on f0 and keeps K = 1. ' : ''}The product of all the stages is then exactly 1 at f0.${evenRipple ? ' With an even order of a rippled response f0 sits in a ripple trough, as the DC of the prototype does, so the passband peaks Amax above that level; the spec is measured from the peak.' : ''}`
			)
		);
	}

	if (design.response === 'bessel') {
		blocks.push(
			p(
				'Bessel is used here for its magnitude only. Its flat delay does not survive the substitution: Ω is not proportional to f, so the delay of the band filter changes across the band, and a pulse does not keep its shape the way it does through a Bessel low-pass.'
			)
		);
	}
	blocks.push(p(`So the ${bandWord(design)} has order 2n = ${2 * design.n}, in ${stageCount(design)}; the math of each stage starts from the prototype stage it comes from.`));
	return blocks;
}

/**
 * The order of a transformed design: the prototype counted once per
 * stopband edge (k = 1/Omega of that edge, its own Amin), then the larger
 * count; for a response with zeros, the closer edge with the larger Amin,
 * and an order lowered by fitting the prototype's stopband edge.
 */
export function explainTransformedOrder(design) {
	const oi = design.orderInfo;
	const stop = design.filterType === 'bandstop';
	const { response, amaxDb } = design;
	const [low, high] = oi.edges;
	const label = RESPONSE_NAME[response] ?? response;
	const edgeName = (e) => (e.edge === 'low' ? 'fsl' : 'fsh');
	const same = Math.abs(low.omega - high.omega) <= 1e-9 * Math.abs(low.omega) && low.aminDb === high.aminDb;
	const count = (e, aminDb, k, minOrder, nUsed, tried) =>
		e.omega > 1 ? explainOrder({ response, amaxDb, aminDb, k, minOrder, filterType: 'lowpass', nUsed, tried }) : [p(`The edge ${edgeName(e)} does not lie beyond the passband edges, so no order can meet it.`)];
	const blocks = [
		p(
			`In the terms of the prototype the passband edge is ωp, where fl and fh land, and a stopband edge at Ω lands at ωs = Ω ωp: for the prototype ωs/ωp = Ω, and k = 1/Ω. So each stopband edge of the ${bandWord(design)} is one low-pass spec for the prototype, with its own Ω and ${stop ? 'the one Amin of the band-stop' : 'its own Amin'}:`
		),
		eq(`f_{sl}:\\ \\Omega_{sl} = ${n4(low.omega)},\\ \\ A_{min} = ${low.aminDb}\\ \\text{dB}, \\qquad f_{sh}:\\ \\Omega_{sh} = ${n4(high.omega)},\\ \\ A_{min} = ${high.aminDb}\\ \\text{dB}`)
	];

	if (!oi.equiripple) {
		if (same) {
			blocks.push(p('Both edges give the same Ω and the same Amin here (the spec is geometrically symmetric), so one count serves both:'), ...count(low, low.aminDb, 1 / low.omega, low.value, low.n, low.tried));
		} else {
			for (const e of [low, high]) {
				blocks.push(p(`Counted for ${edgeName(e)} alone (Ω = ${n4(e.omega)}, Amin = ${e.aminDb} dB), as if it were the only stopband edge:`), ...count(e, e.aminDb, 1 / e.omega, e.value, e.n, e.tried));
			}
		}
		if (oi.n === null) {
			blocks.push(p(`At least one edge is out of reach for the ${label} response at any order tried, so this method has no order for the spec.`));
		} else {
			blocks.push(
				p(`A ${label} prototype loses more and more past its passband edge, so an order that meets the harder edge meets the other one too. The prototype takes the larger of the two counts:`),
				eq(`n = \\max(n_{sl},\\ n_{sh}) = \\max(${low.n},\\ ${high.n}) = ${oi.n} \\ \\Rightarrow\\ \\text{filter order } 2n = ${2 * oi.n}`)
			);
		}
	} else {
		// the closed-form rule; a lowered order keeps it in `lowered`
		const rule = oi.lowered ? { n: oi.lowered.from, value: oi.lowered.value, k: oi.lowered.k, aminDb: oi.lowered.aminDb } : { n: oi.n, value: oi.value, k: oi.k, aminDb: oi.aminDb };
		const ruleN = rule.n ?? (Number.isFinite(rule.value) ? Math.max(1, Math.ceil(rule.value)) : null);
		if (ruleN === null) {
			blocks.push(p('A stopband edge does not lie beyond the passband edges, so no order can meet the spec.'));
		} else if (same) {
			blocks.push(p('Both edges give the same Ω and the same Amin here (the spec is geometrically symmetric), so one count serves both:'));
		} else if (oi.binding !== 'both') {
			// the closer edge asks for no less Amin than the far one: its own count is the larger one
			blocks.push(
				p('Counted for each edge alone, as for a response without zeros, the two edges ask for:'),
				eq(`n_{sl} \\ge ${n4(low.value)}, \\qquad n_{sh} \\ge ${n4(high.value)}`),
				p(
					`For the ${label} response the count must take the closer edge (the smaller Ω). Its stopband does not keep falling: from the stopband edge of the prototype on, the loss bounces down to one floor, and that floor starts where the edge is put. Here the closer edge also asks for ${low.aminDb === high.aminDb ? 'the same Amin as the far one' : 'the larger Amin'}, so its own count is the one used, Ω = ${n4(1 / rule.k)} and Amin = ${rule.aminDb} dB:`
				)
			);
		} else {
			blocks.push(
				p('Counted for each edge alone, as for a response without zeros, the two edges would ask for:'),
				eq(`n_{sl} \\ge ${n4(low.value)}, \\qquad n_{sh} \\ge ${n4(high.value)}`),
				p(
					`For the ${label} response the larger of these can fall short. Its stopband does not keep falling: from the stopband edge of the prototype on, the loss bounces down to one floor, and that floor starts where the edge is put. A prototype counted for the far edge alone puts its edge there, and the closer edge then falls in its transition band, short of its Amin. So the count takes the closer edge (the smaller Ω)${low.aminDb !== high.aminDb ? ' and the larger Amin together' : ''}, Ω = ${n4(1 / rule.k)} and Amin = ${rule.aminDb} dB:`
				)
			);
		}
		if (ruleN !== null) blocks.push(...explainOrder({ response, amaxDb, aminDb: rule.aminDb, k: rule.k, minOrder: rule.value, filterType: 'lowpass', nUsed: ruleN, tried: null }));
		if (oi.lowered) {
			const L = oi.lowered;
			blocks.push(
				p(
					`That count always holds, but here it is more than needed: the closer edge asks for less Amin than the far one, so the stopband edge of the prototype need not sit on the closer edge. Order ${oi.n} is tried with its stopband edge moved to where both edges keep the most room, Ωs = ${n4(L.omegaS)}. The least loss it keeps from each stopband edge outward still meets that edge's Amin, so the order drops from ${L.from} to ${oi.n}:`
				),
				eq(
					`\\Omega_s = ${n4(L.omegaS)}: \\quad A_{least}(f_{sl}) = ${n2(L.lossLow)}\\ \\text{dB} \\ge ${low.aminDb}\\ \\text{dB}, \\qquad A_{least}(f_{sh}) = ${n2(L.lossHigh)}\\ \\text{dB} \\ge ${high.aminDb}\\ \\text{dB} \\ \\Longrightarrow\\ n = ${oi.n}`
				)
			);
		}
	}

	if (Number.isFinite(oi.n) && design.n !== oi.n) blocks.push(p(`The order slider sets n = ${design.n} instead of ${oi.n}.`));
	// with no order for the spec, design.n is only a placeholder
	if (oi.n !== null) {
		blocks.push(
			p(
				`Each prototype pole pair becomes two stages and the real pole of an odd order one, so n = ${design.n} gives the ${bandWord(design)} ${2 * design.n} poles in ${stageCount(design)}.`
			)
		);
	}
	return blocks;
}

/**
 * One stage of a transformed design: the prototype stage it comes from
 * (from design.lowpass, never from the stage index), the quadratic that
 * splits it, its corner and Q, its zero, and the gain it is set for.
 */
export function explainTransformedStage(design, i) {
	const st = design.stages[i];
	const stop = design.filterType === 'bandstop';
	const { w0, bw } = design;
	const ps = design.lowpass.stages[st.pole];
	const partnerIndex = design.stages.findIndex((s, j) => j !== i && s.pole === st.pole);
	const partner = partnerIndex >= 0 ? design.stages[partnerIndex] : null;
	const notch = Number.isFinite(st.wz);
	const where = st.role === 'lower' ? 'below f0' : st.role === 'upper' ? 'above f0' : 'on f0';
	let kind;
	if (!notch) kind = `It is a band-pass stage centred ${where}.`;
	else if (st.notch === 'symmetric') kind = 'It is a symmetric notch: poles and zero both on f0.';
	else kind = `It is a notch stage with its poles ${where} and its zero ${st.notch === 'low' ? 'above them: a low-pass notch' : 'below them: a high-pass notch'}.`;
	const blocks = [
		p(
			`Stage ${i + 1} comes from prototype stage ${st.pole + 1}, ${ps.order === 1 ? 'its real pole' : 'a pole pair'}${partner ? `, which it shares with stage ${partnerIndex + 1}` : ''}. ${kind}`
		)
	];

	if (ps.order === 2) {
		const P = upperPole(ps.wn, ps.q);
		const root = upperPole(st.wn, st.q);
		const size2 = P.re * P.re + P.im * P.im;
		blocks.push(
			p(`The prototype stage has fn = ${hzOf(ps.wn)} and Q = ${n4(ps.q)}, so its upper pole, at the real scale of the prototype, is:`),
			eq(`p = -\\dfrac{\\omega_{n,p}}{2Q_p} + j\\,\\omega_{n,p}\\sqrt{1 - \\dfrac{1}{4Q_p^2}} = ${complexTex(P.re, P.im)}\\ \\text{rad/s}`),
			eq(
				stop
					? `\\dfrac{\\omega_B^2}{p} = ${complexTex((bw * bw * P.re) / size2, (-bw * bw * P.im) / size2)}, \\qquad s^2 - \\dfrac{\\omega_B^2}{p}\\, s + \\omega_0^2 = 0, \\qquad \\omega_B = ${n2(bw)},\\ \\ \\omega_0 = ${n2(w0)}\\ \\text{rad/s}`
					: `s^2 - p\\, s + \\omega_0^2 = 0, \\qquad \\omega_0 = ${n2(w0)}\\ \\text{rad/s}`
			),
			p(`Of its two roots this stage takes the ${st.role === 'lower' ? 'smaller' : 'larger'} one; its mirror image comes from the conjugate pole. Its size is ωn and its angle gives Q:`),
			eq(
				`s = ${n2(root.re)} \\pm j\\,${n2(root.im)} \\ \\Longrightarrow\\ \\omega_n = |s| = ${n2(st.wn)}\\ \\text{rad/s}\\ \\ (f_n = ${hzOf(st.wn)}), \\qquad Q = \\dfrac{|s|}{-2\\,\\mathrm{Re}\\,s} = ${n4(st.q)}`
			)
		);
		if (partner) {
			blocks.push(eq(`\\sqrt{f_n\\, f_n'} = \\sqrt{${hzNum(st.wn / TWO_PI)} \\times ${hzNum(partner.wn / TWO_PI)}} = ${hzOf(Math.sqrt(st.wn * partner.wn))} = f_0, \\qquad Q' = Q`));
		}
	} else {
		blocks.push(
			p(`The prototype's real pole has τ = ${formatSeconds(ps.tau)}. Its quadratic has real coefficients, so it gives this one stage, exactly on f0:`),
			eq(
				stop
					? `s^2 + \\tau\\,\\omega_B^2\\, s + \\omega_0^2 = 0 \\ \\Longrightarrow\\ \\omega_n = \\omega_0 = ${n2(w0)}\\ \\text{rad/s}, \\qquad Q = \\dfrac{\\omega_0}{\\omega_B^2\\,\\tau} = ${n4(st.q)}`
					: `s^2 + \\dfrac{s}{\\tau} + \\omega_0^2 = 0 \\ \\Longrightarrow\\ \\omega_n = \\omega_0 = ${n2(w0)}\\ \\text{rad/s}, \\qquad Q = \\omega_0\\,\\tau = ${n4(st.q)}`
			)
		);
	}

	if (notch) {
		if (Number.isFinite(ps.wz)) {
			const sign = st.role === 'lower' ? '-' : '+';
			blocks.push(
				p(`Its zero comes from the prototype zero at fz = ${hzOf(ps.wz)}, which splits the same way into two zeros with product ω0^2; this stage takes the ${st.role === 'lower' ? 'lower' : 'upper'} one:`),
				eq(
					stop
						? `r = \\dfrac{\\omega_B^2}{\\omega_{z,p}} = ${n2((bw * bw) / ps.wz)}, \\qquad \\omega_z = \\sqrt{\\dfrac{r^2}{4} + \\omega_0^2} ${sign} \\dfrac{r}{2} = ${n2(st.wz)}\\ \\text{rad/s}\\ \\ (f_z = ${hzOf(st.wz)})`
						: `\\omega_z = \\sqrt{\\dfrac{\\omega_{z,p}^2}{4} + \\omega_0^2} ${sign} \\dfrac{\\omega_{z,p}}{2} = ${n2(st.wz)}\\ \\text{rad/s}\\ \\ (f_z = ${hzOf(st.wz)})`
				)
			);
		} else {
			blocks.push(p(`Its zeros come from the prototype's zeros at infinity, which land where the substitution is infinite: at ±jω0, a notch exactly at f0 = ${hzOf(w0)}.`));
		}
	}

	if (!notch) {
		const detune = st.wn / w0 - w0 / st.wn;
		blocks.push(
			p(st.role === 'centre' ? 'It sits on f0, so the gain it is set for, at its own centre, is simply 1:' : 'The gain it is set for, at its own centre, is the one that leaves it at exactly 1 at f0:'),
			eq(
				`H(s) = K\\,\\dfrac{\\frac{\\omega_n}{Q}\\,s}{s^2 + \\frac{\\omega_n}{Q}\\,s + \\omega_n^2}, \\qquad K = \\sqrt{1 + Q^2\\left(\\dfrac{\\omega_n}{\\omega_0} - \\dfrac{\\omega_0}{\\omega_n}\\right)^2} = \\sqrt{1 + ${n4(st.q)}^2 \\times (${n4(detune)})^2} = ${n4(st.gain)}`
			)
		);
	} else if (st.gainAt === 'f0') {
		blocks.push(
			p('A notch stage of a band-pass is set for gain 1 at f0 through its gain far above the zero:'),
			eq(
				`H(s) = K_\\infty\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}\\,s + \\omega_n^2}, \\qquad K_\\infty = \\dfrac{|\\omega_n^2 - \\omega_0^2 + j\\,\\omega_n\\omega_0/Q|}{|\\omega_z^2 - \\omega_0^2|} = ${n4(st.hfGain)}`
			)
		);
	} else {
		blocks.push(
			p('A notch stage of a band-stop is set for gain 1 at DC, so far above the band it passes (ωn/ωz)^2:'),
			eq(
				`H(s) = \\dfrac{\\omega_n^2}{\\omega_z^2}\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}\\,s + \\omega_n^2}, \\qquad H(0) = 1, \\quad H(\\infty) = \\dfrac{\\omega_n^2}{\\omega_z^2} = ${n4((st.wn / st.wz) ** 2)}`
			)
		);
	}
	return blocks;
}

/** Multiple-feedback (Delyiannis-Friend) band-pass derivation for one realized stage. */
export function explainMfbBp(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const t = stageDesign.theoretical;
	const a = stageDesign.actual;
	const f0 = targetWn / TWO_PI;
	const paired = pairsSentence([['R1', c.R1], ['R2', c.R2], ['R3', c.R3]], st.resistorSeries);
	const noise = st.noiseGain;
	// built for a single-pole op-amp: the circuit is solved for its own, predistorted targets
	const pre = Number.isFinite(st.gbw) ? st.predistorted : null;
	return [
		p(
			'The multiple-feedback band-pass (Delyiannis-Friend) needs one op-amp. R1 runs from the input to a node A, R2 from A to ground, C2 from A to the inverting input M, C1 from the output back to A, and R3 from M to the output; the non-inverting input is grounded, so M is a virtual ground. R1 and R2 form an attenuator at the input. Two current balances describe the circuit:'
		),
		eq('\\text{at M:}\\ \\ sC_2 V_A = -\\dfrac{V_{out}}{R_3}, \\qquad \\text{at A:}\\ \\ \\dfrac{V_{in} - V_A}{R_1} = \\dfrac{V_A}{R_2} + sC_2 V_A + sC_1\\left(V_A - V_{out}\\right)'),
		p('The first gives V_A = -V_out/(s C2 R3). Substituting it into the second and collecting the powers of s gives a band-pass, s on top over the standard second-order denominator:'),
		eq('H(s) = -\\dfrac{s/(R_1 C_1)}{s^2 + s\\,\\dfrac{C_1 + C_2}{R_3 C_1 C_2} + \\dfrac{1/R_1 + 1/R_2}{R_3 C_1 C_2}}'),
		p('Matching the denominator to s^2 + (ω0/Q)s + ω0^2, and reading H at s = jω0, where the s^2 term and the constant cancel:'),
		eq('\\omega_0^2 = \\dfrac{1/R_1 + 1/R_2}{R_3 C_1 C_2}, \\qquad \\dfrac{\\omega_0}{Q} = \\dfrac{C_1 + C_2}{R_3 C_1 C_2}, \\qquad H_0 = H(j\\omega_0) = -\\dfrac{R_3 C_2}{R_1 (C_1 + C_2)}'),
		p('Three targets and five parts. With the two capacitors chosen, R3 alone sets the bandwidth ω0/Q, R1 then sets the centre gain, and R2 only moves ω0. Solved in that order:'),
		eq('R_3 = \\dfrac{Q\\,(C_1 + C_2)}{\\omega_0 C_1 C_2}, \\qquad R_1 = \\dfrac{Q}{|H_0|\\,\\omega_0 C_1}, \\qquad \\dfrac{1}{R_2} = \\dfrac{\\omega_0}{Q}\\left(Q^2 (C_1 + C_2) - |H_0|\\,C_1\\right)'),
		p(
			'R2 must stay positive, which caps the gain: |H0| < Q^2 (1 + C2/C1), so 2Q^2 with equal capacitors. At that ceiling R2 is open and the circuit is the plain MFB band-pass; below it R2 attenuates the input. A stage with Q under about 0.7 cannot reach gain 1 with equal capacitors, so the search then makes C2 the larger one.'
		),
		...(pre
			? mfbBpOpampBlocks(stageDesign, targetWn, targetQ)
			: [
					p(
						`This stage's target is f0 = ${formatHz(f0)} (ω0 = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)} and a gain of ${n4(st.gainTarget)} at its centre. ${
							stageDesign.manual
								? 'C1 and C2 below were entered by hand.'
								: 'C1 and C2 come from a search of the capacitor series, equal values preferred and a ratio up to 10:1 allowed, for the pair whose rounded resistors land closest to the targets with the resistors near 10 kilo-ohm.'
						} The ideal resistors:`
					)
				]),
		eq(`C_1 = ${formatFarads(c.C1)},\\ \\ C_2 = ${formatFarads(c.C2)}, \\qquad |H_0| < Q^2\\left(1 + \\dfrac{C_2}{C_1}\\right) = ${n2(st.maxGain)}`),
		eq(`R_3 = ${formatOhms(t.R3)}, \\qquad R_1 = ${formatOhms(t.R1)}, \\qquad R_2 = ${formatOhms(t.R2)}`),
		p(
			`A narrow band moves with every percent of f0, so the rounding goes in steps, each part solved against the ones already rounded: R3 to the nearest ${stockValue(st.resistorSeries)}${pairedTail(st.resistorSeries, [c.R1, c.R2, c.R3])}, then R1 for the gain against the rounded R3, then R2 for ω0 against both (when the nearest values leave no room for R2, R3 and R1 both take the next value up):`
		),
		eq(
			`R_3 \\rightarrow ${formatOhms(c.R3)}, \\qquad R_1 = \\dfrac{R_3 C_2}{|H_0|\\,(C_1 + C_2)} = ${formatOhms(st.R1Target)} \\rightarrow ${formatOhms(c.R1)}, \\qquad R_2 = \\dfrac{1}{\\omega_0^2 R_3 C_1 C_2 - 1/R_1} = ${formatOhms(st.R2Target)} \\rightarrow ${formatOhms(c.R2)}`
		),
		...(paired ? [p(paired)] : []),
		...(pre
			? mfbBpOpampResult(stageDesign, targetWn, targetQ)
			: [
					p('Recomputing from the rounded parts gives what the stage will actually do:'),
					eq(`f_0' = ${formatHz(a.wn / TWO_PI)}, \\quad Q' = ${a.q.toFixed(4)}, \\quad H_0' = ${a.gain.toFixed(4)}\\ \\ (${signedDb(a.gain)}\\ \\text{dB})`),
					p(
						`The price of the single op-amp is in the ratios. R3/R2 grows like 4Q^2 (here ${(c.R3 / c.R2).toFixed(1)}:1), and at f0 the op-amp works with a noise gain of 1 + Q^2 (1 + C2/C1) = ${n2(noise)}. Its gain-bandwidth has to sit well above ${n2(noise)} × f0 = ${formatHz(noise * f0)}: ten times that, ${formatHz(10 * noise * f0)}, keeps the shift in f0 and Q small${10 * noise * f0 > 3e6 ? ', more than a TL08x (about 3 MHz) offers' : ', which a TL08x (about 3 MHz) covers'}. With a single-pole op-amp of gain-bandwidth f_T the peak gain holds, but f0 falls by 1/sqrt(1 + k) and Q rises by sqrt(1 + k), k = Q (1 + C2/C1) f0 / f_T: at 3 MHz, k = ${n2((a.q * (1 + c.C2 / c.C1) * (a.wn / TWO_PI)) / 3e6)} moves f0 by ${n2(100 * (1 - 1 / Math.sqrt(1 + (a.q * (1 + c.C2 / c.C1) * (a.wn / TWO_PI)) / 3e6)))} %. Where Q is high, the Tow-Thomas band-pass keeps every ratio small for three op-amps.`
					)
				])
	];
}

/**
 * A multiple-feedback band-pass stage built for a single-pole op-amp:
 * what the op-amp does to it, and the circuit-alone targets it is solved
 * for (mfbBandPassPredistorted in mfbBandPass.js).
 */
function mfbBpOpampBlocks(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const pre = st.predistorted;
	const f0 = targetWn / TWO_PI;
	const x = Math.sqrt(1 + st.k);
	return [
		p(
			`This stage is built for a real op-amp, modelled with a single pole: A(s) = ω_t/s, ω_t = 2π × ${formatHz(st.gbw)}. The output is then -A(s) times the voltage at M, which is no longer zero. Solving the two current balances with that op-amp, the denominator becomes a cubic:`
		),
		eq('D(s) = \\left(1 + \\dfrac{s}{\\omega_t}\\right)\\left(s^2 + \\dfrac{\\omega_0}{Q}\\,s + \\omega_0^2\\right) + \\dfrac{s^2}{\\omega_t}\\,\\omega_0 Q\\left(1 + \\dfrac{C_2}{C_1}\\right)'),
		p(
			'Its roots are one fast real pole near ω_t and a pole pair, the one the band sees. The last term pulls that pair down and sharpens it. To first order its f0 falls by 1/sqrt(1 + k) and its Q rises by sqrt(1 + k), while the peak gain holds:'
		),
		eq(`k = \\dfrac{Q\\left(1 + C_2/C_1\\right) f_0}{\\text{GBW}} = ${n4(st.k)}, \\qquad f_0 \\rightarrow \\dfrac{f_0}{\\sqrt{1 + k}}, \\qquad Q \\rightarrow Q\\sqrt{1 + k}`),
		p(
			`So the circuit alone is designed ahead of the op-amp, at a higher f0 and a lower Q: about f0 sqrt(1 + k) = ${formatHz(f0 * x)} and Q/sqrt(1 + k) = ${n4(targetQ / x)}. The exact values split the cubic into (s + p)(s^2 + s ωn/q + ωn^2), with ωn and q the stage's target. The op-amp's pole p is then the one unknown. Matching the constant and the s terms gives the circuit's ω0^2 = p ωn^2/ω_t and ω0/Q = (p ωn/q + ωn^2 - ω0^2)/ω_t, and matching the s^2 terms leaves one equation in p, with one root past ω_t. The gain at ωn then fixes R1. For this stage:`
		),
		eq(`f_{0,c} = ${formatHz(pre.wn / TWO_PI)}, \\qquad Q_c = ${n4(pre.q)}, \\qquad |H_{0,c}| = ${n4(pre.gain)}`),
		p(
			`With the op-amp, these land on the target f0 = ${formatHz(f0)}, Q = ${targetQ.toFixed(4)} and a gain of ${n4(st.gainTarget)} at its centre. The parts below are solved for the circuit's values, f_0,c, Q_c and |H_0,c|. ${
				stageDesign.manual
					? 'C1 and C2 below were entered by hand.'
					: 'C1 and C2 come from a search of the capacitor series, equal values preferred and a ratio up to 10:1 allowed, among the pairs that leave the op-amp a loop gain of at least 2 at f0, for the pair whose rounded resistors, with the op-amp, land closest to the targets with the resistors near 10 kilo-ohm. An f0 miss counts 2Q times there: near its band edges the stage moves about 2Q times as much for 1 % of f0 as for 1 % of Q.'
			} The ideal resistors:`
		)
	];
}

/** What the rounded parts of a stage built for an op-amp do, alone and with it, and how far the correction can be trusted. */
function mfbBpOpampResult(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const a = stageDesign.actual;
	const alone = stageDesign.ideal;
	const f0 = targetWn / TWO_PI;
	return [
		p('Recomputing from the rounded parts: the circuit alone, then with the op-amp (the pole pair of the cubic, and the gain at its f0):'),
		eq(`f_0' = ${formatHz(alone.wn / TWO_PI)}, \\quad Q' = ${alone.q.toFixed(4)}, \\quad H_0' = ${alone.gain.toFixed(4)}`),
		eq(`f_0'' = ${formatHz(a.wn / TWO_PI)}, \\quad Q'' = ${a.q.toFixed(4)}, \\quad H'' = ${a.gain.toFixed(4)}\\ \\ (${signedDb(a.gain)}\\ \\text{dB})`),
		p(
			`Against the target f0 = ${formatHz(f0)} and Q = ${targetQ.toFixed(4)}, what is left is the rounding of the parts. R3/R2 grows like 4Q^2 (here ${(c.R3 / c.R2).toFixed(1)}:1). At f0 the op-amp works at a noise gain of 1 + Q^2 (1 + C2/C1) = ${n2(st.noiseGain)}, so its loop gain there is GBW/(noise gain × f0) = ${n2(st.loopGain)}. ${
				st.loopGain < 3
					? 'That is under 3: the correction then leans on the op-amp having this exact gain-bandwidth, and a part a little slower or faster moves f0 and Q again.'
					: 'That leaves some margin, but the correction still holds only for this gain-bandwidth.'
			} Another op-amp needs another correction. Where Q is high, the Tow-Thomas band-pass keeps every ratio small for three op-amps.`
		)
	];
}

/** Tow-Thomas band-pass (the output of A1) derivation for one realized stage. */
export function explainTowThomasBp(stageDesign, targetWn, targetQ) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const a = stageDesign.actual;
	const f0 = targetWn / TWO_PI;
	const paired = pairsSentence([['R', c.Ra], ['Rd', c.Rd], ['R1', c.R1]], st.resistorSeries);
	return [
		p(
			'The same two-integrator loop as the Tow-Thomas low-pass: A1 is an inverting integrator with Rd across its capacitor C1, fed by R1 from the input and by Ra from the end of the loop; A2 is a plain inverting integrator (Rb in, C2 across); A3 is a unity-gain inverter (two equal resistors r). The low-pass comes out of A2; the band-pass is already there one step earlier, at the output of A1. The node balances:'
		),
		eq('\\text{at N1:}\\ \\dfrac{V_{in}}{R_1} + \\dfrac{V_3}{R_a} + V_1\\left(sC_1 + \\dfrac{1}{R_d}\\right) = 0, \\qquad \\text{at N2:}\\ \\dfrac{V_1}{R_b} + sC_2 V_2 = 0, \\qquad V_3 = -V_2'),
		p('Eliminating V_2 and V_3 leaves V_1 over the denominator D(s) shared by every output of the loop, with s on top: a band-pass.'),
		eq('D(s) = s^2 + \\dfrac{s}{C_1 R_d} + \\dfrac{1}{C_1 C_2 R_a R_b}, \\qquad V_{bp} = V_1 = -\\dfrac{s/(C_1 R_1)}{D(s)}\\,V_{in}'),
		p('At ω0 the s^2 term and the constant of D cancel, and the gain at the centre is a ratio of two resistors:'),
		eq('H_0 = H(j\\omega_0) = -\\dfrac{j\\omega_0/(C_1 R_1)}{j\\omega_0/(C_1 R_d)} = -\\dfrac{R_d}{R_1}'),
		p('With C1 = C2 = C and Ra = Rb = R the three knobs are independent: R sets ω0, Rd alone sets Q, R1 alone sets the centre gain.'),
		eq('\\omega_0 = \\dfrac{1}{RC}, \\qquad Q = \\dfrac{R_d}{R}, \\qquad |H_0| = \\dfrac{R_d}{R_1} \\ \\Longrightarrow\\ R_1 = \\dfrac{R_d}{|H_0|}'),
		p(
			`This stage's target is f0 = ${formatHz(f0)} (ω0 = ${n2(targetWn)} rad/s), Q = ${targetQ.toFixed(4)} and a gain of ${n4(st.gainTarget)} at its centre. ${
				stageDesign.manual ? 'C below was entered by hand; both capacitors take that value.' : 'C is picked from a preferred series so that R lands near 10 kilo-ohm and the rounding of R, Rd and R1 costs least.'
			} Each resistor is then solved against the ones already rounded:`
		),
		eq(`C = ${formatFarads(st.C)}\\ \\ \\Rightarrow\\ \\ R = \\dfrac{1}{\\omega_0 C} = ${formatOhms(st.Rtarget)} \\rightarrow ${formatOhms(st.Rrounded)}`),
		eq(
			`R_d = Q\\,R = ${formatOhms(st.RdTarget)} \\rightarrow ${formatOhms(c.Rd)}, \\qquad R_1 = \\dfrac{R_d}{|H_0|} = ${formatOhms(st.R1Target)} \\rightarrow ${formatOhms(c.R1)}, \\qquad r = ${formatOhms(c.r)}`
		),
		...(paired ? [p(paired)] : []),
		p('Recomputing from the rounded values:'),
		eq(
			`f_0' = \\dfrac{1}{2\\pi R C} = ${formatHz(a.wn / TWO_PI)},\\quad Q' = \\dfrac{R_d}{R} = ${a.q.toFixed(4)},\\quad H_0' = -\\dfrac{R_d}{R_1} = ${a.gain.toFixed(4)}\\ \\ (${signedDb(a.gain)}\\ \\text{dB})`
		),
		p(
			'Against the multiple-feedback band-pass: three op-amps instead of one, but no ratio grows with Q (there R3/R2 grows like 4Q^2), the sensitivities stay at 1/2 and 1 whatever the Q, and the gain is one resistor ratio. It earns its op-amps on narrow bands, where the stage Q is high.'
		),
		p(
			`Gain-bandwidth check for this stage: with Q = ${targetQ.toFixed(2)} and f0 = ${formatHz(f0)}, an op-amp with f_T = 3 MHz (a TL08x) ${4 * targetQ * f0 < 3e6 ? `raises Q by roughly ${(100 * (1 / (1 - (4 * targetQ * f0) / 3e6) - 1)).toFixed(1)}% (Q_real = Q / (1 - 4 Q f0 / f_T))` : 'makes the loop oscillate (4 Q f0 reaches f_T)'}; keeping that under 1% needs f_T above ${formatHz(400 * targetQ * f0)}.`
		)
	];
}

/* ------------------------------------------------------------------------ */
/* 6. Narrow band-pass: one peak, one stage or N identical ones              */
/* ------------------------------------------------------------------------ */

/**
 * A value with its unit, as formatHz, formatOhms or formatFarads print it,
 * set in TeX: the number and prefix as text (upright, its space kept), an
 * ohm or a micro as their symbols (text mode has neither).
 */
const tu = (text) => `\\text{${String(text).replace(/ u(?=[FHs])/g, ' }\\mu\\text{').replace(/Ω/g, '}\\Omega\\text{')}}`.replace(/\\text\{\}/g, '');
/** A number to four decimals without trailing zeros, as plain text or TeX: 8, 3.2184, 0.6436. */
const n4t = (x) => (Number.isFinite(x) ? String(Number(x.toFixed(4))) : '-');
/** A number to four significant figures, as plain text: 3.218, 0.6436, 25.33. */
const sig4 = (x) => (Number.isFinite(x) ? String(Number(x.toPrecision(4))) : '-');
/** An inductance in TeX: 25.3\ mH. */
const henryTex = (L) => {
	if (!Number.isFinite(L)) return '-';
	if (L >= 1) return `${sig4(L)}\\ \\text{H}`;
	if (L >= 1e-3) return `${sig4(L * 1e3)}\\ \\text{mH}`;
	return `${sig4(L * 1e6)}\\ \\mu\\text{H}`;
};
/** A part as the component table prints it, a pair of two in series included. */
const narrowOhms = (sd, name) => ohms(sd.components[name], sd.steps?.resistorSeries ?? 'E24');
/** A relative miss in percent, signed: +0.16, -1.27. */
const missPct = (actual, target) => {
	const x = 100 * (actual / target - 1);
	return Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(2)}` : '-';
};
/** A part's name in TeX: R1 -> R_{1}, Cg -> C_{g}, r -> r. */
const partTexName = (name) => name.replace(/^([A-Za-z])(.+)$/, (m, a, b) => `${a}_{${b}}`);
/** 20 log10 of a gain, signed, two decimals. */
const dbText = (g) => signedDb(g);
/** The loss of N identical stages of stage Q qs, x times off f0 (x f0 or f0 / x), in dB. */
const narrowLossAt = (n, qs, x) => 10 * n * Math.log10(1 + (qs * (x - 1 / x)) ** 2);

/**
 * The N identical stages and the bandwidth they share (panel 02): Q from
 * B or B from Q, the -3 dB edges, why N stages are narrower than one, the
 * stage Q and gain that follow, and what the extra stages cost and buy.
 */
export function explainNarrowBandOrder(design) {
	if (!design || !Number.isFinite(design.f0)) return [];
	const { f0, q, B, n, shrink, stageQ, stageB, gain, stageGain, f1, f2 } = design;
	const blocks = [
		p(
			'A narrow band-pass picks out one frequency, f0, and lets through a band of width B around it. B is measured between the two points where the response is 3 dB below its peak. The sharpness of the band is Q, the centre over the width:'
		),
		eq(
			design.by === 'b'
				? `Q = \\dfrac{f_0}{B} = \\dfrac{${hzNum(f0)}}{${hzNum(B)}} = ${n4t(q)}`
				: `Q = \\dfrac{f_0}{B} \\ \\Rightarrow\\ B = \\dfrac{f_0}{Q} = \\dfrac{${hzNum(f0)}}{${n4t(q)}} = ${tu(formatHz(B))}`
		),
		p('The two edges are not symmetric about f0 in hertz. They are symmetric on a log axis: their product is f0 squared and their difference is B, which puts them at:'),
		eq(
			`f_{1,2} = f_0\\left(\\sqrt{1 + \\dfrac{1}{4Q^2}} \\mp \\dfrac{1}{2Q}\\right): \\qquad f_1 = ${tu(formatHz(f1))}, \\quad f_2 = ${tu(formatHz(f2))}, \\qquad f_1 f_2 = f_0^2`
		),
		p(
			'One second-order band-pass stage does the whole job when N = 1: its own Q is the Q asked for. N identical stages in a row multiply their responses. One stage of Q_s and gain K_s gives the expression below, where x is ±1 at its own -3 dB edges:'
		),
		eq('|H_s(j\\omega)|^2 = \\dfrac{K_s^2}{1 + x^2}, \\qquad x = Q_s\\left(\\dfrac{f}{f_0} - \\dfrac{f_0}{f}\\right)'),
		p('The chain of N stages is 3 dB below its peak where N such factors multiply to 1/2:'),
		eq('(1 + x^2)^N = 2 \\ \\Rightarrow\\ x = \\pm\\sqrt{2^{1/N} - 1}'),
		p(
			'With u = f/f0, the two edges solve u - 1/u = ±sqrt(2^(1/N) - 1)/Q_s. The two positive roots multiply to 1 and differ by the right side, so the chain keeps f0 at the geometric centre and its bandwidth is that of one stage times a shrink factor:'
		),
		eq('f_1 f_2 = f_0^2, \\qquad B = f_2 - f_1 = \\dfrac{f_0}{Q_s}\\sqrt{2^{1/N} - 1} = B_s\\sqrt{2^{1/N} - 1}'),
		p(
			n === 1
				? 'With N = 1 the shrink factor is exactly 1 and the stage is the filter. With more stages each one gets a lower Q, all on the same f0, so that the chain lands on the Q asked for:'
				: `So ${n} stages make a band narrower than one of them alone. For the Q asked for, each stage gets a lower Q, all on the same f0:`
		),
		eq(
			`Q_s = Q\\sqrt{2^{1/N} - 1} = ${n4t(q)} \\times \\sqrt{2^{1/${n}} - 1} = ${n4t(q)} \\times ${n4t(shrink)} = ${n4t(stageQ)}, \\qquad B_s = \\dfrac{f_0}{Q_s} = ${tu(formatHz(stageB))}`
		),
		p(`The gain is shared the same way: each stage gives the Nth root of K at f0, so that the chain multiplies back to K.`),
		eq(
			`K_s = K^{1/N} = ${sig4(gain)}^{1/${n}} = ${n4t(stageGain)}\\ \\ (${dbText(stageGain)}\\ \\text{dB}), \\qquad K = ${sig4(gain)}\\ \\ (${dbText(gain)}\\ \\text{dB})`
		)
	];
	// what more stages cost and buy, on this spec's own numbers
	const one = narrowLossAt(1, q, 2);
	const chain = narrowLossAt(n, stageQ, 2);
	if (n > 1) {
		blocks.push(
			p(
				`The cost: ${n} times the op-amps and parts of one stage. The gain: far from f0 each stage falls 20 dB per decade, so the chain falls ${20 * n} dB per decade, and the skirts are steeper for the same bandwidth. An octave off, at 2 f0 or f0/2, the chain is ${chain.toFixed(1)} dB down where one stage of the same Q would be ${one.toFixed(1)} dB down:`
			),
			eq(
				`A(2f_0) = 10N\\log_{10}\\!\\left(1 + Q_s^2\\left(2 - \\tfrac{1}{2}\\right)^2\\right) = 10 \\times ${n}\\log_{10}\\!\\left(1 + (1.5 \\times ${n4t(stageQ)})^2\\right) = ${n2(chain)}\\ \\text{dB}`
			)
		);
	} else {
		const two = narrowLossAt(2, q * narrowShrink2, 2);
		blocks.push(
			p(
				`One stage falls 20 dB per decade on each side, far from f0. More stages cost op-amps and buy steeper skirts for the same bandwidth: an octave off, at 2 f0 or f0/2, this single stage is ${one.toFixed(1)} dB down, where two stages of Q_s = ${n4t(q * narrowShrink2)} each would be ${two.toFixed(1)} dB down.`
			)
		);
	}
	blocks.push(
		p(
			stageQ > 10
				? `A stage Q of ${n2(stageQ)} is ${stageQ > 20 ? 'high' : 'on the high side'}. The band of each stage is only ${(100 / stageQ).toFixed(1)} % of f0 wide, and a part 1 % off moves f0 by about 0.5 %, a share of the band that grows with Q; tolerances also lower the peak. A stage Q between 5 and 10 builds reliably, and more stages bring the stage Q down.`
				: 'Part tolerances move f0 and lower Q, more so the higher the Q. A stage Q between 5 and 10 builds reliably; the comparison in panel 04 says how far each circuit lands.'
		)
	);
	return blocks;
}

/** The shrink factor of two stages, sqrt(sqrt(2) - 1). */
const narrowShrink2 = Math.sqrt(Math.SQRT2 - 1);

/**
 * One stage of a narrow band-pass (panel 03): its H(s) in the standard
 * band-pass form, its f0, Q, bandwidth and gain, and for N stages the
 * chain they make. Stage i > 0 is a copy of stage 1 and says so briefly.
 */
export function explainNarrowBandStage(design, i) {
	const st = design?.stages?.[i];
	if (!st) return [];
	const { f0, w0, n, stageQ, stageGain, stageB } = design;
	const chain = [
		eq(
			`H(s) = \\left[K_s\\,\\dfrac{\\frac{\\omega_0}{Q_s}\\,s}{s^2 + \\frac{\\omega_0}{Q_s}\\,s + \\omega_0^2}\\right]^{${n}}, \\qquad H(j\\omega_0) = K_s^{${n}} = ${n4t(stageGain)}^{${n}} = ${n4t(design.gain)}`
		),
		eq(`f_1 = ${tu(formatHz(design.f1))}, \\quad f_2 = ${tu(formatHz(design.f2))}, \\quad B = f_2 - f_1 = ${tu(formatHz(design.B))}, \\quad Q = \\dfrac{f_0}{B} = ${n4t(design.q)}`)
	];
	if (i > 0) {
		return [
			p(`Stage ${i + 1} is a copy of stage 1: the same f0 = ${formatHz(f0)}, Q_s = ${n4t(stageQ)} and K_s = ${n4t(stageGain)}. The chain of all ${n} multiplies them:`),
			...chain
		];
	}
	const half = 1 / (2 * stageQ);
	const blocks = [
		p(
			'Each stage is a second-order band-pass centred on f0. Its denominator is the standard second-order one, with the damping ξ = 1/(2Q). Its numerator is proportional to s, which is what makes it a band-pass: zero gain at DC and far above f0.'
		),
		eq(
			'H_s(s) = K_s\\,\\dfrac{\\frac{\\omega_0}{Q_s}\\,s}{s^2 + \\frac{\\omega_0}{Q_s}\\,s + \\omega_0^2} = K_s\\,\\dfrac{2\\xi\\omega_0\\, s}{s^2 + 2\\xi\\omega_0\\, s + \\omega_0^2}, \\qquad \\xi = \\dfrac{1}{2Q_s}'
		),
		p('A caution on the form: with ω0^2 on top instead of 2ξω0 s, the same denominator is a low-pass, not a band-pass. The two are not the same function.'),
		p(
			'At s = jω0 the s^2 term and the constant cancel, and what is left of the denominator equals the numerator over K_s. So the stage gives exactly K_s at f0, with no phase shift. Below f0 the phase leads, up to +90°; above it lags, down to -90°. Far from f0 the stage falls 20 dB per decade on each side. With this design\'s numbers:'
		),
		eq(
			`\\omega_0 = 2\\pi \\times ${hzNum(f0)} = ${n2(w0)}\\ \\text{rad/s}, \\qquad \\dfrac{\\omega_0}{Q_s} = \\dfrac{${n2(w0)}}{${n4t(stageQ)}} = ${n2(w0 / stageQ)}\\ \\text{rad/s}, \\qquad K_s = ${n4t(stageGain)}\\ \\ (${dbText(stageGain)}\\ \\text{dB})`
		),
		p('Its own -3 dB edges follow from its own Q, by the same formula as the whole filter\'s:'),
		eq(
			`f_{1,2} = f_0\\left(\\sqrt{1 + \\dfrac{1}{4Q_s^2}} \\mp \\dfrac{1}{2Q_s}\\right) = ${tu(formatHz(f0 * (Math.sqrt(1 + half * half) - half)))},\\ ${tu(formatHz(f0 * (Math.sqrt(1 + half * half) + half)))}, \\qquad B_s = \\dfrac{f_0}{Q_s} = ${tu(formatHz(stageB))}`
		)
	];
	if (n > 1) {
		blocks.push(p(`The ${n} stages are identical, so the whole filter is this H_s(s) to the power ${n}: gain K at f0, and the narrower band of panel 02:`), ...chain);
	} else {
		blocks.push(p('With N = 1 this stage is the whole filter: K, Q and B are the spec\'s own.'));
	}
	return blocks;
}

/* ---------------------------------------- 6b. the six circuits, one by one */

/** The plain RLC the two simulated inductors start from, on this stage's capacitor. */
function rlcPrincipleBlocks(sd, wn, q) {
	const C = sd.components.C;
	const X = 1 / (wn * C);
	return [
		p(
			'The idea starts from a passive circuit. A resistor R runs from the input to the output node P, and a capacitor C and an inductor L both run from P to ground. At f0 the currents in L and C cancel: their parallel impedance becomes very large and P follows the input. Away from f0 one of the two shorts P to ground.'
		),
		p('L and C in parallel have the impedance sL/(1 + s^2 LC), and the divider it forms with R gives a band-pass:'),
		eq('H(s) = \\dfrac{sL/R}{s^2 LC + sL/R + 1} = \\dfrac{\\frac{1}{RC}\\,s}{s^2 + \\frac{1}{RC}\\,s + \\frac{1}{LC}}'),
		p('Matching the standard form gives f0 and Q. At f0 the numerator equals the middle term of the denominator, so the gain there is exactly 1:'),
		eq('\\omega_0 = \\dfrac{1}{\\sqrt{LC}}, \\qquad Q = \\omega_0 RC = R\\sqrt{\\dfrac{C}{L}} \\ \\Rightarrow\\ R = Q\\sqrt{\\dfrac{L}{C}}, \\qquad H(j\\omega_0) = 1'),
		p('A caution: R = Q sqrt(C/L) is a slip that is easy to make. sqrt(C/L) is a conductance, so that product is not even in ohms. The resistor is Q sqrt(L/C).'),
		p(`With C chosen first, X = 1/(ω0 C) is its reactance at f0 and both other parts follow from it. On this stage's ${formatFarads(C)}:`),
		eq(`X = \\dfrac{1}{\\omega_0 C} = ${tu(formatOhms(X))}, \\qquad L = \\dfrac{X}{\\omega_0} = ${henryTex(X / wn)}, \\qquad R = Q\\,X = ${n4t(q)} \\times ${tu(formatOhms(X))} = ${tu(formatOhms(q * X))}`),
		p(
			'An inductor of that size is bulky and lossy, and it picks up hum. So no real inductor is used: an op-amp circuit takes its place, seen from P as an impedance to ground. P itself is a high impedance, so the stage ends in a follower, or in the gain stage when one comes after it, whose + input buffers P just as well.'
		)
	];
}

/** The input divider of an RLC or Sallen-Key stage: Ra || Rb = R, alpha = Rb / (Ra + Rb). */
function dividerBlocks(what) {
	return [
		p(
			`The gain asked for is under the circuit's own, so the input resistor is split in two: Ra from the input to ${what}, Rb from ${what} to ground. ${what} then sees αV_in behind Ra || Rb. With Ra || Rb equal to the R found above, f0 and Q stay where they are and the centre gain is scaled by α:`
		),
		eq('R_a \\parallel R_b = R, \\qquad \\alpha = \\dfrac{R_b}{R_a + R_b} \\ \\Rightarrow\\ R_a = \\dfrac{R}{\\alpha}, \\quad R_b = \\dfrac{R}{1 - \\alpha}')
	];
}

/** What the rounded parts of a stage give, as one equation. */
function narrowActualEq(a, wn, q, gain) {
	return eq(
		`f_0' = ${tu(formatHz(a.wn / TWO_PI))}\\ (${missPct(a.wn, wn)}\\ \\%), \\quad Q' = ${n4t(a.q)}\\ (${missPct(a.q, q)}\\ \\%), \\quad |H_0'| = ${n4t(Math.abs(a.gain))}\\ \\ (${dbText(a.gain)}\\ \\text{dB}${Number.isFinite(gain) ? `, \\text{ asked } ${n4t(gain)}` : ''})`
	);
}

/** RLC with a gyrator for L (rlcGyrator). */
function gyratorBlocks(sd, wn, q, gain, context) {
	const c = sd.components;
	const st = sd.steps;
	const tb = st.textbook;
	const divided = Number.isFinite(c.Rb);
	const blocks = [
		...rlcPrincipleBlocks(sd, wn, q),
		p(
			'The gyrator takes the inductor\'s place with one op-amp wired as a follower. R1 runs from P to the follower\'s output O. Cg runs from P to its + input X, and R2 from X to ground. The follower copies V_X to O and draws no current from X:'
		),
		eq('V_O = V_X = V_P\\,\\dfrac{sR_2C_g}{1 + sR_2C_g}, \\qquad I_P = \\dfrac{V_P - V_O}{R_1} + sC_g\\left(V_P - V_X\\right)'),
		p('Dividing V_P by that current gives the impedance seen from P. For R2 much larger than R1, and below the frequency 1/(2π R1 Cg), it is close to an inductor:'),
		eq('Z_{in} = R_1\\,\\dfrac{1 + sR_2C_g}{1 + sR_1C_g} \\approx R_1 + s\\,R_1R_2C_g, \\qquad L = R_1R_2C_g'),
		p(
			'So the gyrator is an inductor L = R1 R2 Cg in series with a loss, R1. The loss is the catch. The plain recipe sets L = R1 R2 Cg and R = Q sqrt(L/C), and then the exact Z_in moves the peak and lowers it. On this stage\'s capacitor, with C = Cg:'
		),
		eq(
			`R_1 = ${tu(formatOhms(tb.R1))}, \\quad R_2 = \\dfrac{L}{R_1 C_g} = ${tu(formatOhms(tb.R2))}, \\quad R = ${tu(formatOhms(tb.R))} \\ \\Rightarrow\\ f_0' = ${Number((tb.actual.wn / TWO_PI).toPrecision(5))}\\ \\text{Hz}\\ (${missPct(tb.actual.wn, wn)}\\ \\%),\\ \\ Q' = ${n4t(tb.actual.q)},\\ \\ |H_0'| = ${dbText(tb.actual.gain)}\\ \\text{dB}`
		),
		p(
			'This tool keeps the exact Z_in instead. The whole stage is still second order, with one zero at 1/(R2 Cg), far below f0. That zero is also why the stage does not fall to zero at DC: there Cg is open, Z_in is R1 alone, and the stage passes R1/(R + R1) of its input, so below 1/(2π R2 Cg) its skirt stops falling at that level:'
		),
		eq('H(s) = \\alpha\\,\\dfrac{R_1\\left(1 + sR_2C_g\\right)}{s^2\\,CRR_1R_2C_g + s\\left(R_1R_2C_g + RR_1C_g + CRR_1\\right) + R_1 + R}, \\qquad H(0) = \\alpha\\,\\dfrac{R_1}{R + R_1}'),
		eq('\\omega_0^2 = \\dfrac{1 + R_1/R}{R_1R_2CC_g}, \\qquad \\dfrac{\\omega_0}{Q} = \\dfrac{1}{RC} + \\dfrac{1}{R_2C} + \\dfrac{1}{R_2C_g}'),
		p(
			'The two terms in 1/R2 are the loss. With g = 1/R and h = 1/R2 the two targets are two equations in g and h. Eliminating g leaves a quadratic in h, and its smaller root, the larger R2, keeps the loss smallest:'
		),
		eq('Ck\\,h^2 - \\left(\\dfrac{1}{R_1} + \\dfrac{C\\omega_0}{Q}\\right)h + \\omega_0^2\\,CC_g = 0, \\qquad k = \\dfrac{1}{C} + \\dfrac{1}{C_g}, \\qquad g = C\\left(\\dfrac{\\omega_0}{Q} - hk\\right)'),
		p(
			`The loss shrinks as R1 gets small next to X and R2 large next to it, so R1 starts from ${formatOhms(st.R1Target)}: ${st.R1Target > 50.5 ? 'the smallest value that keeps R2 within 1 megohm' : '50 ohm, as small as the follower drives with ease'}. f0 rests on the product R1 R2, so R1 is tried at the stocked values from a little under that up to 1.6 times it, R2 solved for each and rounded, then R solved against both for the exact Q. The closest is kept:`
		),
		eq(
			`${sd.manual ? '' : `C = C_g = ${tu(formatFarads(c.C))}, \\qquad `}R_1 = ${tu(formatOhms(c.R1))}, \\qquad R_2 = ${tu(formatOhms(st.R2Target))} \\rightarrow ${tu(formatOhms(c.R2))}, \\qquad R = ${tu(formatOhms(st.RTarget))}`
		),
		...(sd.manual ? [p(`C and Cg take the ${formatFarads(c.C)} entered by hand.`)] : [])
	];
	if (divided) {
		blocks.push(...dividerBlocks('P'), eq(`\\alpha = ${n4t(st.gainTarget / st.ownGain)}: \\quad R_a = ${tu(formatOhms(st.RaTarget))} \\rightarrow ${tu(narrowOhms(sd, 'Ra'))}, \\qquad R_b = ${tu(formatOhms(st.RbTarget))} \\rightarrow ${tu(narrowOhms(sd, 'Rb'))}`));
	} else {
		blocks.push(p(`R is rounded to Ra = ${narrowOhms(sd, 'Ra')}.`));
	}
	blocks.push(
		p('Even on target, the loss leaves the centre gain under α. At ω0 the denominator is jω0 times ω0/Q, and the zero adds a small term to the numerator:'),
		eq('|H(j\\omega_0)| = \\alpha\\,\\dfrac{\\sqrt{\\left(\\frac{1}{RC}\\right)^2 + \\left(\\frac{1}{\\omega_0 RR_2CC_g}\\right)^2}}{\\omega_0/Q}'),
		p('What the rounded parts give, from the exact expressions:'),
		narrowActualEq(sd.actual, wn, q, gain),
		p(
			`${context.realized?.gainStages?.length ? `The gain stage${context.realized.gainStages.length > 1 ? 's' : ''} after the chain make${context.realized.gainStages.length > 1 ? '' : 's'} up the ${dbText(sd.actual.gain)} dB. ` : ''}A real op-amp moves this stage more than most. The follower lags by about f/GBW, and inside Z_in that lag works as a capacitance 1/(2π GBW R1) across the tank: f0 falls by about 1/(2 ω_T R1 C), ω_T = 2π GBW, and the small R1 that lowers the loss moves it the most. So the search weighs both: of the parts it tries, it keeps those whose worse miss, from the parts or on a TL082, is the smallest. The comparison table measures the result on the TL082.`
		)
	);
	return blocks;
}

/** RLC with Antoniou's generalized impedance converter for L (rlcGic). */
function gicBlocks(sd, wn, q, gain) {
	const c = sd.components;
	const st = sd.steps;
	const divided = Number.isFinite(c.Rb);
	const blocks = [
		...rlcPrincipleBlocks(sd, wn, q),
		p(
			"Antoniou's generalized impedance converter, the GIC, makes an exact grounded inductor from two op-amps. A chain runs from P to ground: R1, R2, R3, Cg, R4. Op-amp 1 has its + input on P, its - input between R2 and R3, and its output V1 between R3 and Cg. Op-amp 2 has its + input between Cg and R4, its - input on the same node as op-amp 1's, and its output V2 between R1 and R2."
		),
		p('With ideal op-amps both inputs of each op-amp sit at the same voltage, so every input node is at V_P. The currents then follow one another up the chain, from R4 to R1, since no current enters an op-amp input:'),
		eq(
			'I_{R_4} = \\dfrac{V_P}{R_4} \\ \\Rightarrow\\ V_1 = V_P\\left(1 + \\dfrac{1}{sC_gR_4}\\right) \\ \\Rightarrow\\ V_2 = V_P\\left(1 - \\dfrac{R_2}{sC_gR_3R_4}\\right) \\ \\Rightarrow\\ I_{in} = \\dfrac{V_P - V_2}{R_1} = \\dfrac{R_2\\,V_P}{sC_gR_1R_3R_4}'
		),
		eq('Z_{in} = \\dfrac{V_P}{I_{in}} = s\\,\\dfrac{C_gR_1R_3R_4}{R_2} = sL, \\qquad L = \\dfrac{C_gR_1R_3R_4}{R_2}'),
		p(
			'No approximation and no loss: with ideal op-amps it is an inductor, grounded at one end, which is all the RLC needs. With Cg = C and all four resistors equal to X, L is X/ω0 exactly. As built, R1 = R3 at a stocked value near X, and R4/R2 is the stocked ratio closest to the one L asks for:'
		),
		eq(
			`${sd.manual ? '' : `C = C_g = ${tu(formatFarads(c.C))}, \\qquad `}R_1 = R_3 = ${tu(narrowOhms(sd, 'R1'))}, \\qquad \\dfrac{R_4}{R_2} = \\dfrac{L}{C_gR_1^2} = ${n4t(st.R4R2Target)} \\rightarrow \\dfrac{${tu(narrowOhms(sd, 'R4'))}}{${tu(narrowOhms(sd, 'R2'))}} = ${n4t(c.R4 / c.R2)}`
		),
		...(sd.manual ? [p(`C and Cg take the ${formatFarads(c.C)} entered by hand.`)] : []),
		p('R is then solved for the exact Q against the L that the rounded parts build, so the rounding of L moves f0 only:'),
		eq(`L = ${henryTex(sd.actual.L)}\\ \\ (\\text{asked } ${henryTex(st.LTarget)}), \\qquad R = Q\\sqrt{\\dfrac{L}{C}} = ${tu(formatOhms(st.RTarget))}`)
	];
	if (divided) {
		blocks.push(...dividerBlocks('P'), eq(`\\alpha = ${n4t(gain)}: \\quad R_a = ${tu(formatOhms(st.RaTarget))} \\rightarrow ${tu(narrowOhms(sd, 'Ra'))}, \\qquad R_b = ${tu(formatOhms(st.RbTarget))} \\rightarrow ${tu(narrowOhms(sd, 'Rb'))}`));
	} else {
		blocks.push(p(`R is rounded to Ra = ${narrowOhms(sd, 'Ra')}.`));
	}
	blocks.push(
		p('What the rounded parts give:'),
		narrowActualEq(sd.actual, wn, q, gain),
		p(
			'Every part of the converter enters L as a plain power, so its sensitivities are fixed: 1/2 for each of them and the tank capacitor, 1 for R. Real op-amps move it little, since each one works at a modest gain. The cost is three op-amps with the follower.'
		)
	);
	return blocks;
}

/** The equal-R, equal-C Sallen-Key band-pass (sallenKeyBp). */
function sallenKeyBpBlocks(sd, wn, q, gain) {
	const c = sd.components;
	const st = sd.steps;
	const own = st.ownGain;
	const lim = sallenKeyBpLimit(c);
	const blocks = [
		p(
			'The Sallen-Key band-pass has one op-amp wired as a non-inverting amplifier of gain K = 1 + Rf/Rg, Rg from its - input to ground and Rf from there to the output. Ra runs from the input to a node X. C1 runs from X to ground, C2 from X to the + input P, R2 from P to ground, and R3 from X back to the output. The op-amp holds V_P = V_out/K, and two current balances describe the circuit:'
		),
		eq('\\text{at P:}\\ \\ sC_2(V_X - V_P) = \\dfrac{V_P}{R_2}, \\qquad \\text{at X:}\\ \\ \\dfrac{V_{in} - V_X}{R_a} = sC_1V_X + \\dfrac{V_P}{R_2} + \\dfrac{V_X - V_{out}}{R_3}'),
		p('The first gives V_X in terms of V_out. Substituting it into the second and collecting powers of s gives a band-pass, with G1 = 1/Ra (plus 1/Rb when there is one):'),
		eq(
			'H(s) = \\dfrac{\\frac{K}{R_aC_1}\\,s}{s^2 + \\frac{\\omega_0}{Q}\\,s + \\omega_0^2}, \\qquad \\omega_0^2 = \\dfrac{G_1 + 1/R_3}{C_1C_2R_2}, \\qquad \\dfrac{\\omega_0}{Q} = \\dfrac{G_1 + (1 - K)/R_3}{C_1} + \\dfrac{1}{C_2R_2} + \\dfrac{1}{C_1R_2}'
		),
		p('With every resistor equal to R and both capacitors equal to C, τ = RC, it takes a simple form:'),
		eq('H(s) = \\dfrac{K\\tau s}{(\\tau s)^2 + \\tau(4 - K)\\,s + 2}, \\qquad \\omega_0 = \\dfrac{\\sqrt{2}}{\\tau}, \\qquad Q = \\dfrac{\\sqrt{2}}{4 - K}, \\qquad H(j\\omega_0) = \\dfrac{K}{4 - K} = 2\\sqrt{2}\\,Q - 1'),
		p(
			'K alone sets Q, and with equal parts K must stay under 4: at 4 the damping term vanishes and the circuit oscillates. Note the K here is the op-amp\'s gain, not the gain at f0, which is K/(4 - K). The price of the one op-amp is the sensitivity. Q moves K/(4 - K) times as fast as K, the same number as the centre gain:'
		),
		eq(`K = 4 - \\dfrac{\\sqrt{2}}{Q} = ${n4t(st.KIdeal)}, \\qquad S^Q_K = \\dfrac{K}{Q}\\,\\dfrac{\\partial Q}{\\partial K} = \\dfrac{K}{4 - K} = ${n2(st.sensitivityK)}`),
		p(
			`So 1 % on K moves Q by ${n2(st.sensitivityK)} %, and Rf and Rg act through K - 1, with a sensitivity of about ${n2((st.KIdeal - 1) / (4 - st.KIdeal))} each. The circuit's own centre gain, ${n2(own)} here (${dbText(own)} dB), is far above 1 at any useful Q.`
		),
		eq(`R = \\dfrac{\\sqrt{2}}{\\omega_0 C} = ${tu(formatOhms(st.R))}${sd.manual ? '' : `, \\qquad C = C_1 = C_2 = ${tu(formatFarads(c.C1))}`}`),
		...(sd.manual ? [p(`C1 and C2 take the ${formatFarads(c.C1)} entered by hand.`)] : [])
	];
	if (st.divider) {
		blocks.push(
			p(
				`The gain asked for, ${n4t(gain)}, is under the circuit's own, so the input resistor is split in two: Ra from the input to X, Rb from X to ground. With Ra || Rb = R, f0 and Q stay where they are, and the centre gain is scaled by R/Ra:`
			),
			eq(`R_a = \\dfrac{R \\cdot ${n2(own)}}{K_0} = ${tu(formatOhms(st.RaTarget))}, \\qquad R_b = \\dfrac{R}{1 - K_0/${n2(own)}} = ${tu(formatOhms(st.RbTarget))}, \\qquad K_0 = ${n4t(gain)}`)
		);
	}
	blocks.push(
		p(
			`Rounding goes in steps, each part against the ones already rounded: R3, then the input resistors, then R2 for the exact f0, then K for the exact Q, Rf/Rg the stocked pair closest to K - 1. Q moves nearly as steeply with R3 and the input as with K, so each of those is tried at the stocked values around its target and the closest result is kept. A stage that would still miss Q by more than 25 % is refused.`
		),
		eq(
			`R_3 = ${tu(narrowOhms(sd, 'R3'))}, \\quad R_a = ${tu(narrowOhms(sd, 'Ra'))}${Number.isFinite(c.Rb) ? `, \\quad R_b = ${tu(narrowOhms(sd, 'Rb'))}` : ''}, \\quad R_2 = ${tu(formatOhms(st.R2Target))} \\rightarrow ${tu(narrowOhms(sd, 'R2'))}, \\quad K = ${n4t(st.KTarget)} \\rightarrow 1 + \\dfrac{${tu(narrowOhms(sd, 'Rf'))}}{${tu(narrowOhms(sd, 'Rg'))}} = ${n4t(sd.actual.K)}`
		),
		p('What the rounded parts give:'),
		narrowActualEq(sd.actual, wn, q, gain),
		p(
			`As rounded, the parts are not quite equal, so the limit is not quite 4 either: the damping term vanishes where K reaches the value below. For this stage Rf/Rg has ${(100 * lim.margin).toFixed(1)} % of margin before the circuit oscillates, and Q follows K ${n2(lim.sensitivity)} times over:`
		),
		eq(`K_{lim} = 1 + R_3G_1 + \\dfrac{R_3}{R_2}\\left(1 + \\dfrac{C_1}{C_2}\\right) = ${n4t(lim.K)}, \\qquad S^Q_K = \\dfrac{K}{K_{lim} - K} = ${n2(lim.sensitivity)}`),
		p(
			`One op-amp and no ratio past K, but a Q that follows K ${n2(lim.sensitivity)} times over: 1 % on Rf alone moves Q by about ${n2(Math.abs(narrowStageSensitivity(sd).Rf))} %. It suits a low Q better than a narrow band.`
		)
	);
	return blocks;
}

/** The state-variable (KHN) band-pass (khnBp). */
function khnBlocks(sd, wn, q, gain) {
	const c = sd.components;
	const st = sd.steps;
	return [
		p(
			'The state-variable circuit, KHN, builds the second-order response from two integrators and a summer: three op-amps. A1 integrates, R1 in from A3\'s output and C1 across it; its output is the band-pass, the stage output. A2 integrates again, R2 in from A1\'s output and C2 across it. A3 is the summer: its - input takes R3 from the input, R4 from A2\'s output and R7 from its own output, and its + input takes R5 from the band-pass output and R6 to ground.'
		),
		p(
			'Mind the labels. A2 integrates the band-pass once more, so its output is the low-pass. A3\'s output is the high-pass. Swapped, the two outputs would make no sense at DC and far above f0.'
		),
		eq(
			'V_{bp} = -\\dfrac{V_{hp}}{sR_1C_1}, \\qquad V_{lp} = -\\dfrac{V_{bp}}{sR_2C_2}, \\qquad \\dfrac{V_{in} - V_-}{R_3} + \\dfrac{V_{lp} - V_-}{R_4} + \\dfrac{V_{hp} - V_-}{R_7} = 0, \\qquad V_- = \\dfrac{V_{bp}}{1 + R_5/R_6}'
		),
		p('Writing V_hp and V_lp in terms of V_bp and collecting powers of s:'),
		eq(
			'\\dfrac{V_{bp}}{V_{in}} = \\dfrac{\\frac{R_2R_4C_2}{R_3}\\,s}{\\frac{R_1R_2R_4C_1C_2}{R_7}\\,s^2 + \\frac{R_2C_2}{1 + R_5/R_6}\\left(1 + \\frac{R_4}{R_3} + \\frac{R_4}{R_7}\\right)s + 1}'
		),
		eq(
			'\\omega_0 = \\sqrt{\\dfrac{R_7}{R_1R_2R_4C_1C_2}}, \\qquad Q = \\dfrac{1 + R_5/R_6}{1 + R_4/R_3 + R_4/R_7}\\sqrt{\\dfrac{R_1R_4C_1}{R_2R_7C_2}}, \\qquad K = \\dfrac{R_4}{R_3}\\,\\dfrac{1 + R_5/R_6}{1 + R_4/R_3 + R_4/R_7}'
		),
		p('K is the gain at f0, and it is positive: the band-pass output does not invert. The design takes C1 = C2 = C, R1 = R2 = R and R4 = R7 = R0. Then R sets f0, R3 the gain and R5/R6 the Q, and no ratio grows past 2Q + K:'),
		eq('\\omega_0 = \\dfrac{1}{RC}, \\qquad Q = \\dfrac{1 + R_5/R_6}{2 + R_0/R_3}, \\qquad K = \\dfrac{R_0}{R_3}\\,Q \\ \\Rightarrow\\ R_3 = \\dfrac{Q\\,R_0}{K}, \\qquad \\dfrac{R_5}{R_6} = 2Q + K - 1'),
		p(
			`Another way to unity gain is R5/R6 = 2 with R3 = R4 = R7: K is then 1 and Q = sqrt(R1/R2) with equal capacitors, so R1/R2 = Q^2, ${n2(q * q)}:1 here. The form above keeps R1 = R2 and puts Q in R5/R6 instead. For this stage, with R0 = ${formatOhms(st.R0)}:`
		),
		eq(
			`${sd.manual ? '' : `C = ${tu(formatFarads(c.C1))}, \\qquad `}R = \\dfrac{1}{\\omega_0 C} = ${tu(formatOhms(st.R))}, \\qquad R_3 = \\dfrac{Q\\,R_0}{K} = ${tu(formatOhms((q * st.R0) / gain))}, \\qquad \\dfrac{R_5}{R_6} = 2Q + K - 1 = ${n4t(st.ratioIdeal)}`
		),
		...(sd.manual ? [p(`C1 and C2 take the ${formatFarads(c.C1)} entered by hand.`)] : []),
		p(
			'Rounding, each part against the ones before it: R1 and R2 as the stocked pair whose product comes closest to 1/(ω0 C)^2, which sets f0. Then R3/R0, R0 being R4 = R7, as the stocked pair closest to the ratio that sets the gain, Q sqrt(R2/R1)/K: only the ratio counts, and R1 and R2 unequal carry sqrt(R2/R1) into it. Then R5/R6 as the stocked pair closest to the ratio that puts Q on target:'
		),
		eq(
			`R_1 = ${tu(narrowOhms(sd, 'R1'))},\\ R_2 = ${tu(narrowOhms(sd, 'R2'))}, \\quad R_3 = ${tu(formatOhms(st.R3Target))} \\rightarrow ${tu(narrowOhms(sd, 'R3'))}, \\quad \\dfrac{R_5}{R_6} = ${n4t(st.ratioTarget)} \\rightarrow \\dfrac{${tu(narrowOhms(sd, 'R5'))}}{${tu(narrowOhms(sd, 'R6'))}}, \\quad R_4 = R_7 = ${tu(narrowOhms(sd, 'R4'))}`
		),
		p('What the rounded parts give:'),
		narrowActualEq(sd.actual, wn, q, gain),
		p(
			'Three op-amps for one stage, but every sensitivity stays at 1 or under, the three outputs come at once, and the knobs barely interact. Of the six circuits it is one of the easiest to trim on the bench.'
		)
	];
}

/** What the two-resistor form of the multiple feedback band-pass gives: the ceiling of the gain. */
function mfbTwoResistorBlocks(sd, wn, q) {
	const { C1, C2 } = sd.components;
	const C = C1;
	const tb = narrowTextbook(wn, q, C);
	const equal = Math.abs(C2 / C1 - 1) < 1e-9;
	return [
		p(
			"The ceiling of the gain is the two-resistor form of this circuit: no R2 to ground, R1 in and R3 across, the gain then fixed by f0, Q and the two capacitors. On this stage's own capacitors it is:"
		),
		eq(`|H_0|_{max} = Q^2\\left(1 + \\dfrac{C_2}{C_1}\\right) = ${n4t(q)}^2\\left(1 + \\dfrac{${tu(formatFarads(C2))}}{${tu(formatFarads(C1))}}\\right) = ${n2(q * q * (1 + C2 / C1))}`),
		p(
			equal
				? 'With equal capacitors, as here, that is 2Q^2, and two equations in two unknowns give both resistors of the two-resistor form:'
				: `With equal capacitors it would be 2Q^2, and two equations in two unknowns give both resistors of the two-resistor form. For comparison, on two capacitors of ${formatFarads(C)}:`
		),
		eq('\\omega_0 = \\dfrac{1}{C\\sqrt{R_1R_3}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{R_3}{R_1}} \\ \\Rightarrow\\ R_1 = \\dfrac{1}{2Q\\,\\omega_0 C}, \\quad R_3 = \\dfrac{2Q}{\\omega_0 C}, \\quad H_0 = -\\dfrac{R_3}{2R_1} = -2Q^2'),
		eq(`C = ${tu(formatFarads(C))}: \\qquad R_1 = ${tu(formatOhms(tb.mfbTwoResistor.R1))}, \\quad R_3 = ${tu(formatOhms(tb.mfbTwoResistor.R3))}, \\quad H_0 = ${n2(tb.mfbTwoResistor.gain)}\\ \\ (${dbText(tb.mfbTwoResistor.gain)}\\ \\text{dB})`),
		p(
			'That form cannot give any other gain. The three-resistor form above brings the gain down from the ceiling with R2, which divides the input with R1. A gain past the ceiling is out of the circuit\'s reach: the stage is then built for gain 1 and the gain stage after the chain adds the rest.'
		)
	];
}

/** The non-inverting gain stage that makes up what the chain's own gain leaves short (gainNonInv). */
function narrowGainStageBlocks(sd, context) {
	const st = sd.steps;
	const realized = context.realized;
	const rlc = realized && (realized.circuit === 'rlcGyrator' || realized.circuit === 'rlcGic');
	const product = Array.isArray(realized?.stageGains) && realized.stageGains.length ? realized.stageGains.reduce((acc, g) => acc * g, 1) : null;
	const asked = context.design?.gain;
	const all = Array.isArray(realized?.gainStages) ? realized.gainStages : [];
	if (all.length > 1) return narrowGainStagesBlocks(sd, context, all, product);
	return [
		p(
			`The stages alone cannot reach the gain asked for${product !== null ? `: their gains at f0 multiply to ${n4t(product)} (${dbText(product)} dB)` : ''}. So a non-inverting amplifier follows the last stage. R1 runs from its - input to ground and R2 from there to the output:`
		),
		eq(
			`K_g = 1 + \\dfrac{R_2}{R_1}, \\qquad K_g = ${Number.isFinite(asked) && product !== null ? `\\dfrac{${n4t(asked)}}{${n4t(product)}} = ` : ''}${n4t(st.gainTarget)} \\ \\Rightarrow\\ \\dfrac{R_2}{R_1} = K_g - 1 = ${n4t(st.gainTarget - 1)}`
		),
		p(`R1 sits near 10 kilo-ohm and R2/R1 is the stocked ratio closest to K_g - 1. The rounding of every stage before it is included in K_g, so the whole chain lands on K:`),
		eq(`R_1 = ${tu(narrowOhms(sd, 'R1'))}, \\quad R_2 = ${tu(narrowOhms(sd, 'R2'))} \\ \\Rightarrow\\ K_g' = 1 + \\dfrac{R_2}{R_1} = ${n4t(sd.actual.gain)}`),
		...(rlc ? [p('Its + input draws no current, so it also buffers the RLC tank before it: that stage needs no follower of its own, and the op-amp count does not grow.')] : [])
	];
}

/**
 * Several gain stages (narrowBand.js, designNarrowGainStages): why the
 * gain is split, then the first in full, a middle one as its copy, the
 * last with the rounding it takes up.
 */
function narrowGainStagesBlocks(sd, context, all, product) {
	const st = sd.steps;
	const rlc = context.realized && (context.realized.circuit === 'rlcGyrator' || context.realized.circuit === 'rlcGic');
	const asked = context.design?.gain;
	const f0 = context.design?.f0;
	const gbw = context.realGbw;
	const total = Number.isFinite(asked) && product !== null ? asked / product : null;
	const at = all.indexOf(sd) >= 0 ? all.indexOf(sd) : all.findIndex((g) => JSON.stringify(g.components) === JSON.stringify(sd.components));
	const parts = eq(`R_1 = ${tu(narrowOhms(sd, 'R1'))}, \\quad R_2 = ${tu(narrowOhms(sd, 'R2'))} \\ \\Rightarrow\\ K_g' = 1 + \\dfrac{R_2}{R_1} = ${n4t(sd.actual.gain)}`);
	if (at > 0) {
		const made = all.slice(0, at).reduce((acc, g) => acc * g.actual.gain, 1);
		return at === all.length - 1
			? [p(`The last of the ${all.length} gain stages, wired like the first. It takes what the rounding of the ones before it leaves${total !== null ? `: ${n4t(total)} / ${n4t(made)} = ${n4t(st.gainTarget)}` : ''}, so the whole chain lands on K:`), parts]
			: [p(`Gain stage ${at + 1} of ${all.length}, a copy of the first:`), parts];
	}
	const one = total !== null && Number.isFinite(f0) && Number.isFinite(gbw) ? ` One amplifier alone would run at g·f0 = ${n2((total * f0) / gbw)} GBW on a TL082.` : '';
	return [
		p(
			`The stages alone cannot reach the gain asked for${product !== null ? `: their gains at f0 multiply to ${n4t(product)} (${dbText(product)} dB)` : ''}, which leaves ${total !== null ? n4t(total) : 'the rest'} to add. An amplifier of gain g on an op-amp of gain-bandwidth GBW closes its loop at GBW/g, and at f0 it keeps 1/sqrt(1 + (g f0/GBW)^2) of its gain. So the gain is split over ${all.length} identical non-inverting amplifiers, the fewest that keep each g·f0 within ${NARROW_GAIN_SPEED} GBW on a TL082.${one} In each, R1 runs from the - input to ground and R2 from there to the output:`
		),
		eq(`K_g = ${total !== null ? `\\sqrt[${all.length}]{${n4t(total)}}` : `K_{rest}^{1/${all.length}}`} = ${n4t(st.gainTarget)}, \\qquad \\dfrac{R_2}{R_1} = K_g - 1 = ${n4t(st.gainTarget - 1)}`),
		p('R1 sits near 10 kilo-ohm and R2/R1 is the stocked ratio closest to K_g - 1:'),
		parts,
		...(rlc ? [p('Its + input draws no current, so it also buffers the RLC tank before it: that stage needs no follower of its own.')] : [])
	];
}

/** Where the circuit stands against the other five, in one paragraph. */
const NARROW_STANDING = {
	rlcGyrator: 'Against the others: the fewest op-amps of the two RLC forms, but a lossy inductor and a strong pull from the op-amp; it suits a low f0 or a fast op-amp.',
	rlcGic: 'Against the others: three op-amps with the follower, but an exact inductor and sensitivities of 1/2 and 1 whatever the Q; among the steadiest of the six on a real op-amp.',
	mfbBp: 'Against the others: one op-amp and sensitivities at or under 1, but a resistor spread that grows like 4Q^2 and an op-amp that works at a noise gain of 1 + Q^2 (1 + C2/C1) at f0.',
	towThomasBp: 'In a narrow band-pass the Tow-Thomas competes with the state-variable circuit: both take three op-amps and keep every ratio small, and here the gain is one resistor ratio and inverts.'
};

/**
 * The chosen circuit for one stage, from its equations to its rounded parts
 * (panel 04). stageDesign: one stage of realizeNarrow's `stages` (a
 * resonator, or the gainNonInv gain stage). target: the design's stage it
 * builds (design.stages[i]: wn, q, gain), or null for the gain stage.
 * context (all optional): { design (designNarrowBand), realized
 * (realizeNarrow's result), gbw (Hz, the op-amp the MFB stages are built
 * for, or null) }.
 */
export function explainNarrowBandCircuit(stageDesign, target, context = {}) {
	const sd = stageDesign;
	if (!sd || !sd.components) return [];
	const ctx = context ?? {};
	if (sd.topology === 'gainNonInv') return narrowGainStageBlocks(sd, ctx);
	const wn = target?.wn ?? sd.steps?.wn ?? ctx.design?.w0;
	const q = target?.q ?? sd.steps?.q ?? ctx.design?.stageQ;
	const gain = target?.gain ?? sd.steps?.gainTarget ?? ctx.design?.stageGain ?? 1;
	if (!(Number.isFinite(wn) && Number.isFinite(q))) return [];
	// a later stage built exactly like the first: say so instead of repeating the derivation
	const first = ctx.realized?.stages?.[0];
	if (Number.isInteger(target?.index) && target.index > 0 && first && first !== sd && first.topology === sd.topology && JSON.stringify(first.components) === JSON.stringify(sd.components)) {
		return [
			p(`Stage ${target.index + 1} is built exactly like stage 1, with the same parts and the same derivation${first.buffered !== sd.buffered ? ', except that the gain stage after it buffers its output instead of a follower of its own' : ''}. What its parts give:`),
			narrowActualEq(sd.actual, wn, q, gain)
		];
	}
	let blocks;
	switch (sd.topology) {
		case 'rlcGyrator':
			blocks = gyratorBlocks(sd, wn, q, gain, ctx);
			break;
		case 'rlcGic':
			blocks = gicBlocks(sd, wn, q, gain);
			break;
		case 'sallenKeyBp':
			blocks = sallenKeyBpBlocks(sd, wn, q, gain);
			break;
		case 'khnBp':
			blocks = khnBlocks(sd, wn, q, gain);
			break;
		case 'mfbBp':
			blocks = [...explainMfbBp(sd, wn, q), ...mfbTwoResistorBlocks(sd, wn, q)];
			break;
		case 'towThomasBp':
			blocks = explainTowThomasBp(sd, wn, q);
			break;
		default:
			return [];
	}
	// the part Q follows most, and all of them at 1 % at once
	const sens = narrowStageSensitivity(sd);
	if (sens) {
		let worst = null;
		for (const [part, value] of Object.entries(sens)) if (worst === null || Math.abs(value) > Math.abs(worst.value)) worst = { part, value };
		const rss = Math.sqrt(Object.values(sens).reduce((acc, s) => acc + s * s, 0));
		blocks.push(
			p(
				`Sensitivity, from the exact expression of Q on these parts: Q moves ${Math.abs(worst.value).toFixed(2)} % for 1 % on ${worst.part}, the most of any part. With every part 1 % off in a random direction, Q moves about ${rss.toFixed(2)} % (root-sum-square).`
			),
			eq(`S^Q_{${partTexName(worst.part)}} = \\dfrac{${partTexName(worst.part)}}{Q}\\,\\dfrac{\\partial Q}{\\partial ${partTexName(worst.part)}} = ${n2(worst.value)}`)
		);
	}
	const standing = NARROW_STANDING[sd.topology];
	if (standing) blocks.push(p(standing));
	// an oscillation on the TL082 (the page's poles of the chain), said in this circuit's words
	if (Number.isFinite(ctx.oscillates?.freq)) {
		blocks.push(
			p(
				`On a TL082, though, this chain oscillates, near ${formatHz(ctx.oscillates.freq)}. Each op-amp lags by about f/GBW times its noise gain. Around a loop that sets a sharp peak, those lags eat into the damping: in the loop of two integrators Q rises as about Q/(1 - 4Q f0/GBW) where every part runs near unity gain, and faster where one runs at a higher gain. Where the damping reaches zero, a pole pair crosses into the right half plane. A magnitude response cannot show it, since a pole pair and its mirror image give the same |H(jω)|; the poles of the netlist do. Another circuit, more stages of lower Q, or a faster op-amp keeps it stable.`
			)
		);
	}
	const n = ctx.design?.n;
	if (Number.isFinite(n) && n > 1) blocks.push(p(`The other ${n - 1 === 1 ? 'stage is a copy' : `${n - 1} stages are copies`} of this one, unless capacitors were entered by hand for ${n - 1 === 1 ? 'it' : 'them'}.`));
	return blocks;
}
