<script>
	import Equation from '$lib/components/Equation.svelte';
</script>

<svelte:head>
	<title>Formula sheet · Active Filter Design · rbt56</title>
	<meta
		name="description"
		content="Every formula the Active Filter Design tool uses, grouped by step, each with what it is and how to use it."
	/>
</svelte:head>

<article>
	<p class="eyebrow"><a href="/tools/filter-design/">&larr; Active Filter Design</a></p>
	<h1>Formula sheet</h1>
	<p class="lead">
		Every formula this tool uses, in the same order as its own sections: from a spec down to
		real component values and a frequency response. Each one has what it is and how to use it,
		not just the equation on its own.
	</p>

	<section class="panel">
		<p class="note">
			Symbols that recur through every section below: A<sub>max</sub> is the passband ripple or
			attenuation limit (dB), A<sub>min</sub> the stopband attenuation requirement (dB), f<sub>p</sub>
			the passband edge (Hz), f<sub>s</sub> the stopband edge (Hz), n the filter order, and k the
			transition ratio. They all come from the Specification step of the tool.
		</p>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">1</span>
			<h2>Specification and order</h2>
		</div>

		<div class="formula">
			<h3>Transition ratio</h3>
			<p class="note">
				How close the stopband edge sits to the passband edge. Closer to 1, the harder the
				filter has to work to transition from passing to blocking.
			</p>
			<Equation tex={`k = \\dfrac{f_p}{f_s}`} />
			<p class="note">
				<strong>How to use:</strong> compute this first; every order formula below needs it.
			</p>
		</div>

		<div class="formula">
			<h3>Butterworth minimum order</h3>
			<p class="note">
				The smallest integer order n that meets the Amax/Amin/fp/fs spec with a Butterworth
				response: the flattest possible passband, at the cost of a slower rolloff than
				Chebyshev at the same order.
			</p>
			<Equation
				tex={`n \\geq \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)}`}
			/>
			<p class="note">
				<strong>How to use:</strong> plug in Amax, Amin and k, then round the result up to the
				next integer. That integer is n: half of it (rounded down) is the number of
				second-order stages, plus one leftover first-order stage if n is odd.
			</p>
		</div>

		<div class="formula">
			<h3>Chebyshev minimum order</h3>
			<p class="note">
				The same minimum-order calculation for a Chebyshev Type I response, which allows up to
				Amax dB of ripple inside the passband in exchange for a steeper rolloff than Butterworth
				at the same order.
			</p>
			<Equation
				tex={`n \\geq \\dfrac{\\operatorname{acosh}\\!\\sqrt{\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}}}{\\operatorname{acosh}(1/k)}`}
			/>
			<p class="note"><strong>How to use:</strong> same rounding as the Butterworth case above.</p>
		</div>

		<div class="formula">
			<h3>Where both order formulas come from</h3>
			<p class="note">
				Every design here is built on one magnitude response (section 3 and section 4 say where
				each comes from). At fp it loses exactly Amax dB by the definition of epsilon; the only
				condition left is the stopband, at least Amin dB at fs, and that condition contains n.
				At fs the frequency ratio is 1/k.
			</p>
			<Equation
				tex={`\\text{Butterworth:}\\ 10\\log_{10}\\!\\left(1 + \\varepsilon^2 \\left(\\tfrac{1}{k}\\right)^{2n}\\right) \\ge A_{min} \\ \\Rightarrow\\ 2n\\log\\!\\left(\\tfrac{1}{k}\\right) \\ge \\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{\\varepsilon^2}\\right]`}
			/>
			<Equation
				tex={`\\text{Chebyshev:}\\ 10\\log_{10}\\!\\left(1 + \\varepsilon^2 \\cosh^2\\!\\left(n\\,\\operatorname{acosh}\\tfrac{1}{k}\\right)\\right) \\ge A_{min} \\ \\Rightarrow\\ \\cosh\\!\\left(n\\,\\operatorname{acosh}\\tfrac{1}{k}\\right) \\ge \\sqrt{\\dfrac{10^{A_{min}/10}-1}{\\varepsilon^2}}`}
			/>
			<p class="note">
				<strong>How to use:</strong> isolate n (divide by 2 log(1/k), or take acosh of both sides
				and divide by acosh(1/k)) and substitute epsilon squared = 10^(Amax/10) - 1: that is
				exactly the two formulas above. Rounding n up is what puts the stopband margin in.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">2</span>
			<h2>Pole placement, both responses</h2>
		</div>

		<div class="formula">
			<h3>Where the poles come from</h3>
			<p class="note">
				A magnitude formula is not a circuit; a circuit is built from poles. Replacing omega by
				s/j turns |H(j omega)| squared into H(s) times H(-s). For Butterworth (normalized so
				that the pole circle has radius 1) its 2n poles are the 2n-th roots of a single number:
				all the same size, angles spaced pi/n apart, mirrored about both axes. The stable half
				(negative real part) belongs to H(s). Measuring the angle from the imaginary axis gives
				the theta formula below; n = 4, for example, puts poles at 22.5 and 67.5 degrees.
			</p>
			<Equation
				tex={`H(s)H(-s) = \\dfrac{1}{1 + (-1)^n s^{2n}} \\ \\Rightarrow\\ s^{2n} = (-1)^{n+1} \\ \\Rightarrow\\ s_i = -\\sin\\theta_i + j\\cos\\theta_i`}
			/>
			<p class="note">
				For Chebyshev the same substitution into 1 + epsilon squared C_n squared gives cos(n phi)
				= plus or minus j / epsilon with a complex angle phi = theta + j beta; its real part
				forces the same theta values, its imaginary part gives beta (section 4).
			</p>
		</div>
		<div class="formula">
			<h3>Pole angle</h3>
			<p class="note">
				The n poles of the filter sit evenly spaced by this angle around a curve in the
				normalized (omega_c = 1 rad/s) s-plane: a circle for Butterworth, an ellipse for
				Chebyshev. Each second-order stage of the filter is built from one of these angles.
			</p>
			<Equation
				tex={`\\theta_i = \\dfrac{(2i+1)\\pi}{2n}, \\qquad i = 0, 1, \\dots, \\left\\lfloor \\dfrac{n}{2} \\right\\rfloor - 1`}
			/>
			<p class="note">
				<strong>How to use:</strong> i is the stage index, starting at 0. Compute one theta per
				second-order stage; a leftover real pole (odd n) does not need one, it sits at a fixed
				spot instead (see the response-specific sections below).
			</p>
		</div>

		<div class="formula">
			<h3>Pole coordinates</h3>
			<p class="note">
				The real part (sigma) and imaginary part (omega) of the pole at that angle: its
				coordinates in the s-plane. sh and ch scale the circle into an ellipse for Chebyshev.
			</p>
			<Equation tex={`\\sigma = -\\text{sh}\\sin(\\theta), \\qquad \\omega = \\text{ch}\\cos(\\theta)`} />
			<p class="note">
				<strong>How to use:</strong> for Butterworth, sh = ch = 1. For Chebyshev, sh = sinh(beta)
				and ch = cosh(beta) (section 4 below). Compute sigma and omega for a stage's theta, then
				a and b follow directly.
			</p>
		</div>

		<div class="formula">
			<h3>Stage coefficients a, b</h3>
			<p class="note">
				The two coefficients of the stage's normalized quadratic denominator s^2 + as + b,
				found by multiplying the pole by its complex conjugate: a real circuit always produces
				both, or the stage's output would not be real-valued.
			</p>
			<Equation tex={`a = -2\\sigma, \\qquad b = \\sigma^2 + \\omega^2`} />
			<p class="note">
				<strong>How to use:</strong> feed a and b into the denormalization formulas in section 5
				to get a real corner frequency and Q for this stage.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">3</span>
			<h2>Butterworth specifics</h2>
		</div>

		<div class="formula">
			<h3>Unit-circle simplification</h3>
			<p class="note">
				Because every Butterworth pole sits exactly on the unit circle (sh = ch = 1), b
				collapses to exactly 1 for every stage: only a changes from stage to stage.
			</p>
			<Equation tex={`a = 2\\sin(\\theta), \\qquad b = 1`} />
			<p class="note">
				<strong>How to use:</strong> equivalent to the general sigma/omega formula in section 2,
				but needs only one trig call. Use this directly for a Butterworth design.
			</p>
		</div>

		<div class="formula">
			<h3>Leftover real pole (odd n)</h3>
			<p class="note">
				The one pole with no partner when n is odd. For Butterworth it always sits at exactly
				s = -1 in the normalized plane, no matter the order: the unit circle only crosses the
				real axis at one point.
			</p>
			<Equation tex={`b_{\\text{real}} = 1`} />
			<p class="note">
				<strong>How to use:</strong> used only when n is odd, as the b value for the first-order
				denormalization formula in section 5.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">4</span>
			<h2>Chebyshev specifics</h2>
		</div>

		<div class="formula">
			<h3>Epsilon</h3>
			<p class="note">
				Controls how deep the passband ripple is allowed to go: a bigger epsilon means more
				ripple. It comes directly from the Amax spec alone, exactly as for Butterworth. The
				Chebyshev magnitude response, with C_n the order-n Chebyshev polynomial (which swings
				between -1 and 1 below the ripple edge and grows like a hyperbolic cosine above it):
			</p>
			<Equation
				tex={`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2\\, C_n^2\\!\\left(\\dfrac{\\omega}{\\omega_p}\\right)}, \\qquad C_n(x) = \\begin{cases} \\cos(n \\arccos x) & |x| \\le 1 \\\\ \\cosh(n\\, \\operatorname{acosh} x) & |x| > 1 \\end{cases}`}
			/>
			<p class="note">
				At the ripple edge C_n is 1, so exactly Amax dB is lost there and epsilon follows the same
				way as for Butterworth:
			</p>
			<Equation tex={`\\varepsilon = \\sqrt{10^{A_{max}/10} - 1}`} />
			<p class="note">
				<strong>How to use:</strong> compute once per design, before beta.
			</p>
		</div>

		<div class="formula">
			<h3>Beta</h3>
			<p class="note">
				Controls how squashed the pole ellipse is compared to the unit circle: it folds epsilon
				and the order n together into the number the ellipse's half-axes need.
			</p>
			<Equation tex={`\\beta = \\dfrac{\\operatorname{asinh}(1/\\varepsilon)}{n}`} />
			<p class="note">
				Where it comes from: the poles solve 1 + epsilon squared C_n squared (s/j) = 0. Writing
				s/j = cos(phi) with a complex angle phi = theta + j beta turns C_n into cos(n phi), and
				expanding the cosine of a complex angle splits the equation in two:
			</p>
			<Equation
				tex={`\\cos(n\\theta)\\cosh(n\\beta) - j\\sin(n\\theta)\\sinh(n\\beta) = \\pm\\dfrac{j}{\\varepsilon} \\ \\Rightarrow\\ \\cos(n\\theta) = 0,\\quad \\sinh(n\\beta) = \\dfrac{1}{\\varepsilon}`}
			/>
			<p class="note">
				The first part gives the same theta angles as Butterworth (section 2); the second is the
				beta formula above.
			</p>
			<p class="note">
				<strong>How to use:</strong> compute once per design, right after epsilon. sinh(beta) and
				cosh(beta) are the sh and ch scale factors used in every stage's pole coordinates
				(section 2).
			</p>
		</div>

		<div class="formula">
			<h3>Leftover real pole (odd n)</h3>
			<p class="note">
				Same idea as the Butterworth leftover pole, but on the ellipse: at theta = 90 degrees
				its position simplifies to just sinh(beta).
			</p>
			<Equation tex={`b_{\\text{real}} = \\sinh(\\beta)`} />
			<p class="note">
				<strong>How to use:</strong> used only when n is odd, as the b value for the first-order
				denormalization formula below.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">5</span>
			<h2>Denormalization</h2>
		</div>

		<div class="formula">
			<h3>Cutoff</h3>
			<p class="note">
				Converts the passband edge from Hz to radians per second and places the pole circle. The
				Butterworth magnitude response (low-pass; a high-pass swaps the fraction to omega_p over
				omega):
			</p>
			<Equation tex={`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 \\left(\\dfrac{\\omega}{\\omega_p}\\right)^{2n}}`} />
			<p class="note">At the passband edge the fraction is 1, so losing exactly Amax dB there fixes the ripple factor:</p>
			<Equation
				tex={`A(\\omega_p) = 10\\log_{10}\\!\\left(1 + \\varepsilon^2\\right) = A_{max} \\ \\Rightarrow\\ \\varepsilon = \\sqrt{10^{A_{max}/10} - 1}`}
			/>
			<p class="note">
				The n poles sit on a circle of radius omega_0, the frequency where the bracket equals one
				over epsilon squared, which is also where exactly 3 dB is lost. That circle sits at omega_p
				only when Amax = 3.0103 dB (epsilon = 1); for a smaller Amax the poles move past fp so that
				only Amax dB is lost there (inward for a high-pass). Every normalized stage is scaled by this
				omega_c. A Chebyshev prototype is already normalized to its ripple edge, so it needs no
				factor.
			</p>
			<Equation
				tex={`\\varepsilon^2 \\left(\\dfrac{\\omega_0}{\\omega_p}\\right)^{2n} = 1 \\ \\Rightarrow\\ \\omega_c = \\omega_0 = 2\\pi f_p\\, \\varepsilon^{-1/n}\\ \\text{(Butterworth low-pass)}, \\qquad \\omega_c = 2\\pi f_p\\, \\varepsilon^{+1/n}\\ \\text{(Butterworth high-pass)}`}
			/>
			<Equation tex={`\\omega_c = 2\\pi f_p \\ \\text{(Chebyshev, either type)}`} />
			<p class="note">
				<strong>How to use:</strong> compute once per design, then reuse it below. With the common
				Amax = 3 dB the Butterworth factor is within 0.1% of 1, which is why fp is so often called
				the 3 dB cutoff; at Amax = 1 dB and n = 5 it is already 1.145.
			</p>
		</div>

		<div class="formula">
			<h3>Second-order stage</h3>
			<p class="note">
				Turns a stage's normalized a and b into a real corner frequency omega_n (rad/s) and
				quality factor Q, the two numbers a real second-order circuit stage is built around.
			</p>
			<Equation tex={`\\omega_n = \\omega_c\\sqrt{b}, \\qquad Q = \\dfrac{\\sqrt{b}}{a}`} />
			<p class="note">
				<strong>How to use:</strong> f0 = omega_n / (2 pi) is the corner frequency in Hz. Both
				omega_n and Q feed directly into the MFB or Sallen-Key formulas in sections 6 and 7.
			</p>
		</div>

		<div class="formula">
			<h3>First-order stage</h3>
			<p class="note">The time constant of the leftover real-pole stage, in seconds.</p>
			<Equation tex={`\\tau = \\dfrac{1}{\\omega_c\\, b_{\\text{real}}}`} />
			<p class="note">
				<strong>How to use:</strong> feeds directly into the first-order RC formula in section 8;
				the stage's corner frequency is 1 / (2 pi tau).
			</p>
		</div>

		<div class="formula">
			<h3>Standard second-order form</h3>
			<p class="note">
				The form every second-order stage of this filter is built to realize once denormalized:
				a unity-DC-gain low-pass with corner omega_n and quality factor Q.
			</p>
			<Equation tex={`H(s) = \\dfrac{\\omega_n^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
			<p class="note">
				<strong>How to use:</strong> this is the target the MFB or Sallen-Key component search
				matches against.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">6</span>
			<h2>MFB components</h2>
		</div>

		<div class="formula">
			<h3>Transfer function</h3>
			<p class="note">
				The multiple-feedback (MFB) topology's transfer function in terms of its five
				components: R1 from the input to the summing node S, C1 from S to ground, R2 from S to the inverting input, R3 from the output back to S, C2 from the inverting input to the output. Two current balances describe it, at S and at the virtual-ground inverting input:
			</p>
			<Equation
				tex={`\\text{at S:}\\ \\dfrac{V_{in} - V_S}{R_1} = sC_1 V_S + \\dfrac{V_S}{R_2} + \\dfrac{V_S - V_{out}}{R_3}, \\qquad \\text{at (-):}\\ \\dfrac{V_S}{R_2} = -sC_2 V_{out}`}
			/>
			<p class="note">Eliminating V_S and collecting powers of s gives the transfer function:</p>
			<Equation
				tex={`H(s) = \\dfrac{c}{s^2+as+b},\\quad a = \\dfrac{1}{C_1}\\!\\left(\\dfrac{1}{R_1}+\\dfrac{1}{R_2}+\\dfrac{1}{R_3}\\right),\\quad b = \\dfrac{1}{R_2R_3C_1C_2},\\quad c = -\\dfrac{1}{R_1R_2C_1C_2}`}
			/>
			<p class="note">
				<strong>How to use:</strong> match a and b against the stage's target (a = omega_n / Q,
				b = omega_n squared) to solve for the components.
			</p>
		</div>

		<div class="formula">
			<h3>Gain-forcing and the resistor quadratic</h3>
			<p class="note">
				Choosing R1 = R3 fixes the DC gain c/b to exactly -1 and reduces the two equations in a
				and b to one quadratic in x = 1/R1 = 1/R3.
			</p>
			<Equation tex={`2x^2 - (aC_1)x + bC_1C_2 = 0`} />
			<p class="note">
				<strong>How to use:</strong> pick C1 and C2 from a preferred series first (subject to the
				ratio constraint below), then solve this quadratic for x: R1 = R3 = 1/x, and R2 follows
				from a.
			</p>
		</div>

		<div class="formula">
			<h3>Capacitor ratio constraint</h3>
			<p class="note">
				The quadratic above only has a real solution when this holds. It is the practical limit
				on how high a Q an MFB stage can realize with a given capacitor pair.
			</p>
			<Equation tex={`\\dfrac{C_1}{C_2} \\geq 8Q^2`} />
			<p class="note">
				<strong>How to use:</strong> when searching capacitor values, discard any C1/C2 pair that
				fails this before attempting to solve for resistors.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">7</span>
			<h2>Sallen-Key components</h2>
		</div>

		<div class="formula">
			<h3>Defining equations</h3>
			<p class="note">
				The unity-gain Sallen-Key topology's two defining equations, in terms of its three free
				components: two equal resistors R, a grounded capacitor Cbottom, and a feedback
				capacitor Ctop from the output back to the R-R junction.
			</p>
			<Equation
				tex={`\\omega_n = \\dfrac{1}{R\\sqrt{C_{top}C_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{C_{top}}{C_{bottom}}}`}
			/>
			<p class="note">
				<strong>How to use:</strong> Q depends only on the capacitor ratio, so pick that first
				(below), then R follows from the omega_n equation once both capacitors are known.
			</p>
		</div>

		<div class="formula">
			<h3>Capacitor ratio</h3>
			<p class="note">
				Because Q depends only on this ratio, it is fixed the moment the target Q is known,
				before any component value is chosen.
			</p>
			<Equation tex={`\\dfrac{C_{top}}{C_{bottom}} = 4Q^2`} />
			<p class="note">
				<strong>How to use:</strong> pick Cbottom from a preferred series, multiply by this ratio
				to get Ctop, then solve R from the equation below.
			</p>
		</div>

		<div class="formula">
			<h3>Resistor value</h3>
			<p class="note">
				The value used for both equal resistors, that makes the pair meet the target omega_n
				once Cbottom and the ratio-derived Ctop are fixed.
			</p>
			<Equation tex={`R = \\dfrac{1}{2Q\\,\\omega_n\\,C_{bottom}}`} />
			<p class="note">
				<strong>How to use:</strong> round R and Ctop to the nearest preferred values afterward;
				recompute the actual omega_n and Q the built stage gives from those rounded values, not
				the targets.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">8</span>
			<h2>First-order RC</h2>
		</div>

		<div class="formula">
			<h3>Single-pole low-pass</h3>
			<p class="note">
				The circuit used for the leftover real pole of an odd-order filter: one resistor, one
				capacitor, output taken across the capacitor. tau is the time constant found in section
				5.
			</p>
			<Equation tex={`H(s) = \\dfrac{1}{RCs+1}, \\qquad \\tau = RC`} />
			<p class="note">
				<strong>How to use:</strong> pick C from a preferred series, solve R = tau / C, then round
				R to the nearest preferred value.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">9</span>
			<h2>Sensitivity</h2>
		</div>

		<div class="formula">
			<h3>Definition</h3>
			<p class="note">
				How many percent Q moves for every 1 percent a single component x is off by. Lower
				magnitude is better: less sensitive to real-world component tolerance.
			</p>
			<Equation tex={`S_x^Q = \\dfrac{x}{Q}\\dfrac{dQ}{dx}`} />
			<p class="note">
				<strong>How to use:</strong> look up (or compute) one sensitivity per component, then
				combine them with the root-sum-square formula below.
			</p>
		</div>

		<div class="formula">
			<h3>Sallen-Key sensitivities (fixed)</h3>
			<p class="note">
				Fixed values for the unity-gain, equal-R Sallen-Key form: they do not depend on the
				actual component values, only on the topology.
			</p>
			<Equation
				tex={`S_R^Q = -2, \\qquad S_{C_{top}}^Q = -\\dfrac{1}{2}, \\qquad S_{C_{bottom}}^Q = -\\dfrac{3}{2}`}
			/>
			<p class="note">
				<strong>How to use:</strong> multiply each by the component tolerance (in percent) and
				combine with the root-sum-square formula. The resistor sensitivity dominates, which is
				why Sallen-Key gets impractical at high Q.
			</p>
		</div>

		<div class="formula">
			<h3>MFB sensitivities</h3>
			<p class="note">
				Depends on the stage's actual resistor values, but stays under 1/2 in magnitude for
				every component as long as no single resistor dominates the other two, which is why MFB
				is the safer default at higher orders.
			</p>
			<Equation
				tex={`S_{R1}^Q = \\dfrac{R_2R_3}{R_1R_2+R_1R_3+R_2R_3}, \\qquad S_{R2}^Q = \\dfrac{R_1R_3}{R_1R_2+R_1R_3+R_2R_3} - \\dfrac{1}{2}`}
			/>
			<Equation
				tex={`S_{R3}^Q = \\dfrac{R_1R_2}{R_1R_2+R_1R_3+R_2R_3} - \\dfrac{1}{2}, \\qquad S_{C1}^Q = \\dfrac{1}{2}, \\qquad S_{C2}^Q = -\\dfrac{1}{2}`}
			/>
			<p class="note">
				<strong>How to use:</strong> compute from the stage's actual (rounded) R1, R2, R3, then
				combine with C1 and C2's fixed +-1/2 using the root-sum-square formula.
			</p>
		</div>

		<div class="formula">
			<h3>Root-sum-square</h3>
			<p class="note">
				Combines every component's individual sensitivity and tolerance into one worst-case
				estimate of how far Q can realistically drift, assuming the errors are independent.
			</p>
			<Equation tex={`\\Delta Q_{\\%} = \\sqrt{\\sum_x \\left(S_x^Q \\cdot \\text{tol}_x\\right)^2}`} />
			<p class="note">
				<strong>How to use:</strong> use a tolerance of 1 percent for typical E24/E12 resistors
				and E6 capacitors, unless the actual parts on hand are known to be tighter or looser.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">10</span>
			<h2>Frequency response (Bode)</h2>
		</div>

		<div class="formula">
			<h3>Per-stage gain, second order</h3>
			<p class="note">
				The complex gain of one second-order stage at a real frequency omega = 2 pi f, evaluated
				from its actual (rounded) omega_n, Q and DC gain g, not the ideal targets: this is what
				would actually show up on a bench.
			</p>
			<Equation
				tex={`H(j\\omega) = \\dfrac{g\\,\\omega_n^2}{(\\omega_n^2-\\omega^2) + j\\dfrac{\\omega_n}{Q}\\omega}`}
			/>
			<p class="note">
				<strong>How to use:</strong> multiply, as complex numbers, the per-stage gains of every
				stage in the cascade to get the full filter's response at that frequency.
			</p>
		</div>

		<div class="formula">
			<h3>Per-stage gain, first order</h3>
			<p class="note">The complex gain of the leftover first-order stage, from its actual (rounded) tau.</p>
			<Equation tex={`H(j\\omega) = \\dfrac{1}{1+j\\omega\\tau}`} />
			<p class="note">
				<strong>How to use:</strong> multiplies into the same cascade product as the second-order
				stages above.
			</p>
		</div>

		<div class="formula">
			<h3>Magnitude and phase</h3>
			<p class="note">
				Converts the cascade's complex response at one frequency into the two numbers a Bode
				plot actually shows.
			</p>
			<Equation
				tex={`|H|_{dB} = 20\\log_{10}|H(j\\omega)|, \\qquad \\angle H = \\operatorname{atan2}(\\operatorname{Im}H,\\ \\operatorname{Re}H) \\times \\dfrac{180}{\\pi}`}
			/>
			<p class="note">
				<strong>How to use:</strong> sweep omega (or f) log-spaced from below fp to above fs to
				trace the full curve, and check that the dB value at fs meets Amin. The angle formula
				gives degrees; drop the 180/pi factor for radians.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">11</span>
			<h2>Low-pass to high-pass transform</h2>
		</div>

		<div class="formula">
			<h3>Prototype substitution</h3>
			<p class="note">
				A high-pass filter starts from the exact same pole placement as a low-pass one (sections
				2 to 4 above are shared by both) and applies one extra step before denormalizing:
				substituting s with 1/s in the normalized prototype.
			</p>
			<Equation
				tex={`H_{lp}(s) = \\dfrac{1}{s^2+as+b} \\ \\ \\xrightarrow{s \\to 1/s} \\ \\ H_{hp}(s) = \\dfrac{s^2/b}{s^2 + \\frac{a}{b}s + \\frac{1}{b}}`}
			/>
			<p class="note">
				<strong>How to use:</strong> read the new coefficients directly off the denominator on the
				right.
			</p>
		</div>

		<div class="formula">
			<h3>New coefficients</h3>
			<p class="note">
				a_hp and b_hp replace a and b for every step downstream (denormalization, component
				synthesis). Q comes out identical to what the low-pass version of this same stage would
				have had - sqrt(b_hp)/a_hp reduces algebraically back to sqrt(b)/a - only the corner
				frequency moves, to the other side of the cutoff.
			</p>
			<Equation tex={`a_{hp} = \\dfrac{a}{b}, \\qquad b_{hp} = \\dfrac{1}{b}`} />
			<p class="note">
				<strong>How to use:</strong> feed a_hp and b_hp into the same denormalization formulas as
				section 5, in place of a and b.
			</p>
		</div>

		<div class="formula">
			<h3>Leftover real pole (odd n)</h3>
			<p class="note">
				The same 1/s substitution applied to the leftover real-pole stage (odd n): a real pole at
				b_real becomes a real pole at 1/b_real.
			</p>
			<Equation tex={`b_{\\text{real,hp}} = \\dfrac{1}{b_{\\text{real}}}`} />
			<p class="note">
				<strong>How to use:</strong> use b_real,hp in place of b_real in the first-order
				denormalization formula (section 5), then in the first-order high-pass RC formula
				(section 14).
			</p>
		</div>

		<div class="formula">
			<h3>Standard second-order high-pass form</h3>
			<p class="note">
				The high-pass counterpart of section 5's standard low-pass form: same denominator, a
				numerator that scales with s^2 instead of being constant, so H(0) = 0 and H(infinity) is
				what is finite.
			</p>
			<Equation tex={`H(s) = \\dfrac{s^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
			<p class="note">
				<strong>How to use:</strong> this is the target the MFB or Sallen-Key high-pass component
				search in sections 12 and 13 matches against.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">12</span>
			<h2>MFB high-pass components</h2>
		</div>

		<div class="formula">
			<h3>Transfer function</h3>
			<p class="note">
				The R-C dual of the low-pass MFB circuit (section 6): C1 from the input to the summing
				node, R1 from that node to ground, C2 from the summing node to the inverting input, and
				two separate feedback paths back to the output - C3 from the summing node, R2 from the
				inverting input.
			</p>
			<Equation
				tex={`H(s) = \\dfrac{-c\\,s^2}{s^2+as+b},\\quad a = \\dfrac{C_1+C_2+C_3}{R_2C_2C_3},\\quad b = \\dfrac{1}{R_1R_2C_2C_3},\\quad c = \\dfrac{C_1}{C_3}`}
			/>
			<p class="note">
				<strong>How to use:</strong> match a and b against the stage's target (a = omega_n / Q,
				b = omega_n squared) to solve for the components.
			</p>
		</div>

		<div class="formula">
			<h3>Equal-capacitor resistor formulas</h3>
			<p class="note">
				Setting C1 = C2 = C3 = C forces the gain c to exactly 1 (so the stage's magnitude matches
				the input at high frequency) and, unlike the low-pass version, always has a real solution
				regardless of Q - there is no capacitor ratio to clear. With C fixed, a and b reduce to
				two direct formulas for the two resistors.
			</p>
			<Equation tex={`R_2 = \\dfrac{3}{aC}, \\qquad R_1 = \\dfrac{1}{bR_2C^2}`} />
			<p class="note">
				<strong>How to use:</strong> pick C from a preferred series, then solve directly for R2 and
				R1 in that order (R2 needs only a and C, R1 needs R2 too).
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">13</span>
			<h2>Sallen-Key high-pass components</h2>
		</div>

		<div class="formula">
			<h3>Defining equations</h3>
			<p class="note">
				The R-C dual of the low-pass Sallen-Key circuit (section 7): two equal capacitors C in
				series from the input to the non-inverting input, a resistor R_bottom from the C-C
				junction to ground, and a feedback resistor R_top from the output back to that junction.
			</p>
			<Equation
				tex={`\\omega_n = \\dfrac{1}{C\\sqrt{R_{top}R_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{R_{bottom}}{R_{top}}}`}
			/>
			<p class="note">
				<strong>How to use:</strong> Q depends only on the resistor ratio, so pick that first
				(below), then both resistors follow directly once C is known.
			</p>
		</div>

		<div class="formula">
			<h3>Resistor ratio</h3>
			<p class="note">
				Because Q depends only on this ratio, it is fixed the moment the target Q is known, before
				any component value is chosen - the resistor-ratio dual of section 7's capacitor ratio.
			</p>
			<Equation tex={`\\dfrac{R_{bottom}}{R_{top}} = 4Q^2`} />
			<p class="note">
				<strong>How to use:</strong> pick C from a preferred series, then solve R_top and R_bottom
				directly from the equations below - unlike low-pass, there is nothing left to search once
				C is chosen.
			</p>
		</div>

		<div class="formula">
			<h3>Resistor values</h3>
			<p class="note">The two resistor values that meet the target Q and omega_n for the chosen C.</p>
			<Equation
				tex={`R_{top} = \\dfrac{1}{2Q\\,\\omega_n\\,C}, \\qquad R_{bottom} = 4Q^2 \\times R_{top}`}
			/>
			<p class="note">
				<strong>How to use:</strong> round both resistors to the nearest preferred values
				afterward; recompute the actual omega_n and Q from those rounded values, not the targets.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">14</span>
			<h2>First-order high-pass RC</h2>
		</div>

		<div class="formula">
			<h3>Single-pole high-pass</h3>
			<p class="note">
				The same series RC as the low-pass version (section 8), just with the output taken across
				the resistor instead of the capacitor. tau is still RC, computed the same way (section 11,
				using b_real,hp in place of b_real).
			</p>
			<Equation tex={`H(s) = \\dfrac{RCs}{RCs+1}, \\qquad \\tau = RC`} />
			<p class="note">
				<strong>How to use:</strong> pick C from a preferred series, solve R = tau / C, then round
				R to the nearest preferred value - identical procedure to the low-pass case.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">15</span>
			<h2>High-pass sensitivity</h2>
		</div>

		<div class="formula">
			<h3>MFB high-pass sensitivities</h3>
			<p class="note">
				With C1 = C2 = C3 fixed by design, Q works out to a pure power-law in the two resistors
				alone (no C dependence) - fixed constants, unlike the low-pass MFB's value-dependent ones.
				C1, C2 and C3 do still drift independently in a real build, so each keeps its own term
				(they sum to exactly 0, since moving all three together by the same percent leaves Q
				unchanged).
			</p>
			<Equation
				tex={`S_{R1}^Q = -\\dfrac{1}{2}, \\qquad S_{R2}^Q = +\\dfrac{1}{2}, \\qquad S_{C1}^Q = -\\dfrac{1}{3}, \\qquad S_{C2}^Q = S_{C3}^Q = +\\dfrac{1}{6}`}
			/>
			<p class="note">
				<strong>How to use:</strong> combine all five with the root-sum-square formula (section 9)
				the same way as low-pass MFB's.
			</p>
		</div>

		<div class="formula">
			<h3>Sallen-Key high-pass sensitivities (fixed)</h3>
			<p class="note">
				The R-C dual of section 9's low-pass Sallen-Key sensitivities: the equal input capacitors
				take over the equal resistors' role (and, like them, turn out to have zero sensitivity by
				symmetry), while the two resistors get the direct power-law exponents from Q's
				sqrt(Rbottom/Rtop) factor.
			</p>
			<Equation
				tex={`S_{C1}^Q = S_{C2}^Q = 0, \\qquad S_{R_{bottom}}^Q = +\\dfrac{1}{2}, \\qquad S_{R_{top}}^Q = -\\dfrac{1}{2}`}
			/>
			<p class="note">
				<strong>How to use:</strong> component tolerance barely moves Q for this topology either
				way - the practical limit on Q is the resistor ratio itself getting impractically large,
				not sensitivity.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">16</span>
			<h2>High-pass frequency response (Bode)</h2>
		</div>

		<div class="formula">
			<h3>Per-stage gain, second order</h3>
			<p class="note">
				The high-pass counterpart of section 10's low-pass per-stage gain: same denominator, a
				numerator proportional to -omega^2 (from s^2 with s purely imaginary) instead of constant.
			</p>
			<Equation
				tex={`H(j\\omega) = \\dfrac{-g\\,\\omega^2}{(\\omega_n^2-\\omega^2) + j\\dfrac{\\omega_n}{Q}\\omega}`}
			/>
			<p class="note">
				<strong>How to use:</strong> multiply into the same cascade product as any other stage to
				get the full filter's response at that frequency.
			</p>
		</div>

		<div class="formula">
			<h3>Per-stage gain, first order</h3>
			<p class="note">The complex gain of a leftover first-order high-pass stage, from its actual (rounded) tau.</p>
			<Equation tex={`H(j\\omega) = \\dfrac{j\\omega\\tau}{1+j\\omega\\tau}`} />
			<p class="note">
				<strong>How to use:</strong> multiplies into the cascade product the same way as the
				low-pass first-order gain in section 10.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">17</span>
			<h2>Band-pass (cascaded low-pass + high-pass)</h2>
		</div>

		<div class="formula">
			<h3>Two independent order calculations</h3>
			<p class="note">
				This tool builds a band-pass by cascading a high-pass section (passband edge fl, stopband
				edge fsl) with a low-pass section (passband edge fh, stopband edge fsh) - the standard
				approach when the two edges are well separated (more than about 2 octaves apart). Each
				section gets its own transition ratio and minimum order, from the exact same formulas as
				sections 1 and 11, just with fl/fsl or fh/fsh in place of fp/fs.
			</p>
			<Equation tex={`k_{hp} = \\dfrac{f_{sl}}{f_l}, \\qquad k_{lp} = \\dfrac{f_h}{f_{sh}}`} />
			<p class="note">
				<strong>How to use:</strong> plug each k into the same Butterworth or Chebyshev order
				formula from section 1 to get that section's own minimum order, independently of the
				other section.
			</p>
		</div>

		<div class="formula">
			<h3>Everything else is unchanged</h3>
			<p class="note">
				Every stage in either section is an ordinary low-pass or high-pass second-order (or
				leftover first-order) block, denormalized, synthesized into components and evaluated in
				the Bode response exactly as sections 2 through 16 already describe. Cascading the two
				sections - each one's output feeding the next one's input, exactly like stacking more
				low-pass or high-pass stages - is what turns two separate responses into one band-pass
				response; there is no new per-stage math to learn.
			</p>
			<p class="note">
				<strong>How to use:</strong> design and build the high-pass section and the low-pass
				section as two completely independent filters, then wire the first section's output into
				the second section's input.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">18</span>
			<h2>Band-stop (summed low-pass + high-pass)</h2>
		</div>

		<div class="formula">
			<h3>Two independent order calculations</h3>
			<p class="note">
				This tool builds a band-stop (notch) by summing a low-pass branch (passband edge fl,
				stopband edge fsl) with a high-pass branch (passband edge fh, stopband edge fsh) - the
				mirror image of band-pass's edge order: fl &lt; fsl &lt; fsh &lt; fh, stopband sitting
				inside the two passband edges instead of outside them.
			</p>
			<Equation tex={`k_{lp} = \\dfrac{f_l}{f_{sl}}, \\qquad k_{hp} = \\dfrac{f_{sh}}{f_h}`} />
			<p class="note">
				<strong>How to use:</strong> plug each k into the same order formula as section 1 to get
				that branch's own minimum order, independently of the other branch.
			</p>
		</div>

		<div class="formula">
			<h3>Why summing works</h3>
			<p class="note">
				Every stage this tool builds has an exactly known, rounding-independent gain in its own
				passband - MFB is always exactly -1 (forced by R1 = R3), Sallen-Key is always exactly +1,
				a unity-gain follower. Summing a fully-passing branch with a fully-attenuated one
				reliably reconstructs the original signal outside the stopband; the notch depth in between
				is set by the same Amin-driven order search as everywhere else in this tool, not by
				matching any component pair precisely (unlike, say, a Twin-T notch).
			</p>
			<p class="note">
				<strong>How to use:</strong> design the low-pass branch and the high-pass branch as two
				completely independent filters running in parallel from the same input, each feeding its
				own output into the summing amplifier below - never cascaded in series.
			</p>
		</div>

		<div class="formula">
			<h3>Summing amplifier</h3>
			<p class="note">
				A plain inverting summing amplifier combines the two branch outputs into the final notch
				output. Making all three resistors equal gives an exact, rounding-proof unity-magnitude
				sum - any equal value works, there is nothing to search for here.
			</p>
			<Equation
				tex={`V_{out} = -\\left(\\dfrac{R_f}{R_a}V_{lp} + \\dfrac{R_f}{R_b}V_{hp}\\right), \\qquad R_a = R_b = R_f \\ \\Rightarrow\\ V_{out} = -(V_{lp}+V_{hp})`}
			/>
			<p class="note">
				<strong>How to use:</strong> wire the low-pass branch's output through Ra, the high-pass
				branch's output through Rb, both into the same summing node, with Rf in feedback around
				the op-amp.
			</p>
		</div>

		<div class="formula">
			<h3>Parallel-sum frequency response</h3>
			<p class="note">
				Unlike every other filter type in this tool (where stage gains multiply in a single
				cascade), a band-stop's two branches must be evaluated as separate cascades and then
				added, not multiplied - matching what the summing amplifier physically does.
			</p>
			<Equation
				tex={`H(j\\omega) = H_{lp,\\text{branch}}(j\\omega) + H_{hp,\\text{branch}}(j\\omega)`}
			/>
			<p class="note">
				<strong>How to use:</strong> compute each branch's own cascade product (section 10 or 16,
				stage by stage within that branch only) at a given frequency, then add the two complex
				results together before converting to dB - never multiply the two branches together.
			</p>
		</div>
	</section>
	<section class="panel">
		<div class="panel-head">
			<span class="num">19</span>
			<h2>Tow-Thomas biquad</h2>
		</div>

		<div class="formula">
			<h3>Transfer functions</h3>
			<p class="note">
				Two integrators in a loop with one damping resistor: A1 is an inverting integrator with Rd
				across its capacitor, fed by R1 from the input and by Ra from the inverter; A2 is an
				inverting integrator (Rb, C2); A3 is a unity inverter (r, r) that closes the loop. KCL at
				the two virtual grounds, with V3 = -V2, gives one denominator for every output.
			</p>
			<Equation
				tex={`\\dfrac{V_{in}}{R_1} + \\dfrac{V_3}{R_a} + V_1\\left(sC_1 + \\dfrac{1}{R_d}\\right) = 0, \\qquad \\dfrac{V_1}{R_b} + sC_2V_2 = 0, \\qquad V_3 = -V_2`}
			/>
			<Equation
				tex={`D(s) = s^2 + \\dfrac{s}{C_1R_d} + \\dfrac{1}{C_1C_2R_aR_b}, \\qquad V_{bp} = V_1 = -\\dfrac{s/(C_1R_1)}{D(s)}V_{in}, \\qquad V_{lp} = V_2 = \\dfrac{1/(C_1C_2R_1R_b)}{D(s)}V_{in}`}
			/>
			<Equation tex={`\\omega_n = \\dfrac{1}{\\sqrt{C_1C_2R_aR_b}}, \\qquad Q = R_d\\sqrt{\\dfrac{C_1}{C_2R_aR_b}}, \\qquad \\text{DC gain} = \\dfrac{R_a}{R_1}`} />
		</div>

		<div class="formula">
			<h3>Design with equal parts</h3>
			<p class="note">
				C1 = C2 = C and Ra = Rb = R make the three knobs independent: R sets the corner, Rd alone
				sets Q, R1 alone sets the gain (unity for R1 = R). No ratio grows with Q, unlike the
				8Q&sup2; capacitor ratio of MFB or the 4Q&sup2; ratio of Sallen-Key.
			</p>
			<Equation tex={`\\omega_n = \\dfrac{1}{RC}, \\qquad Q = \\dfrac{R_d}{R}, \\qquad R = \\dfrac{1}{\\omega_n C}, \\qquad R_d = Q\\,R, \\qquad R_1 = R`} />
			<p class="note">
				<strong>How to use:</strong> pick C from a preferred series so R lands near 10 kilo-ohm, round
				R, then solve Rd against the rounded R and round it; the realized Q is exactly Rd/R and the
				gain exactly 1.
			</p>
		</div>

		<div class="formula">
			<h3>High-pass form (feedforward)</h3>
			<p class="note">
				Feed the input into A1's node through a capacitor Cin instead of R1: the input term gains a
				factor s, A1's output becomes the high-pass and A2's the band-pass. Cin = C gives unity
				magnitude, inverting.
			</p>
			<Equation tex={`V_{hp} = V_1 = -\\dfrac{C_{in}}{C_1}\\,\\dfrac{s^2}{D(s)}V_{in}, \\qquad V_{bp} = V_2 = \\dfrac{C_{in}}{C_1C_2R_b}\\,\\dfrac{s}{D(s)}V_{in}`} />
		</div>

		<div class="formula">
			<h3>Sensitivities</h3>
			<p class="note">
				Q is a product of powers of the parts, so every sensitivity is a fixed exponent, independent
				of Q and of the values. The input element and the inverter's matched pair do not enter Q.
			</p>
			<Equation tex={`S^Q_{R_d} = 1, \\quad S^Q_{C_1} = \\tfrac{1}{2}, \\quad S^Q_{C_2} = -\\tfrac{1}{2}, \\quad S^Q_{R_a} = S^Q_{R_b} = -\\tfrac{1}{2}, \\qquad S^{\\omega_n}_{C_1,C_2,R_a,R_b} = -\\tfrac{1}{2}`} />
		</div>

		<div class="formula">
			<h3>Compared with MFB and Sallen-Key</h3>
			<p class="note">
				Better: independent tuning of f0, Q and gain; any Q with standard values (Rd = Q R); fixed
				sensitivities of magnitude 1/2 or 1; low-pass, band-pass and high-pass outputs from one
				circuit; a non-inverting low-pass. Worse: three op-amps per stage instead of one (parts,
				supply current, noise, board space), and the loop's extra phase lag raises the realized Q
				above the design value when the op-amps are slow (Q enhancement), so the gain-bandwidth
				product has to be well above Q times f0.
			</p>
			<Equation tex={`\\dfrac{Q_{real} - Q}{Q} \\approx 2\\,Q\\,\\dfrac{f_0}{f_T} \\qquad \\Rightarrow \\qquad f_T \\gtrsim 200\\,Q\\,f_0 \\ \\text{ for a 1\\% error}`} />
			<p class="note">
				<strong>How to use:</strong> reach for the Tow-Thomas when Q is high (past about 5 the
				one-op-amp ratios stop being buildable), when the filter has to be tuned on the bench, or
				when the band-pass or notch output is wanted too. For an ordinary low-Q stage, MFB or
				Sallen-Key does the same job with one op-amp.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">20</span>
			<h2>Legendre (optimum L)</h2>
		</div>

		<div class="formula">
			<h3>Response</h3>
			<p class="note">
				Butterworth's form with the power (ω/ωp)^(2n) replaced by a polynomial L_n of the same degree
				that starts at 0, reaches 1 at the edge, never decreases (its derivative is a perfect square)
				and has the largest slope at the edge of all such polynomials: the steepest roll-off without
				ripple. ε is Butterworth's, so exactly Amax is lost at fp.
			</p>
			<Equation tex={`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 L_n\\!\\left(\\omega^2/\\omega_p^2\\right)}, \\qquad \\varepsilon = \\sqrt{10^{A_{max}/10} - 1}`} />
			<Equation tex={`L_n(w) = \\dfrac{1}{2(k+1)^2}\\int_{-1}^{2w-1}\\left[\\sum_{i=0}^{k}(2i+1)\\,P_i(x)\\right]^2 dx \\quad (n = 2k+1)`} />
			<Equation tex={`L_n(w) = \\dfrac{1}{(k+1)(k+2)}\\int_{-1}^{2w-1}(x+1)\\left[\\sum_{i \\equiv k\\ (\\mathrm{mod}\\ 2)}(2i+1)\\,P_i(x)\\right]^2 dx \\quad (n = 2k+2)`} />
			<Equation tex={`L_3 = 3\\omega^6 - 3\\omega^4 + \\omega^2, \\qquad L_4 = 6\\omega^8 - 8\\omega^6 + 3\\omega^4 \\quad (\\omega \\text{ in units of } \\omega_p)`} />
			<p class="note">
				<strong>How to use:</strong> the poles are the stable roots of 1 + ε² L_n(-s²/ωp²), found
				numerically. There is no closed order formula: the loss at fs is computed for n = 1, 2, ...
				until it reaches Amin.
			</p>
			<Equation tex={`A_n = 10\\log_{10}\\!\\left(1 + \\varepsilon^2 L_n\\!\\left(\\tfrac{1}{k^2}\\right)\\right) \\ge A_{min}`} />
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">21</span>
			<h2>Bessel (Thomson)</h2>
		</div>

		<div class="formula">
			<h3>Response</h3>
			<p class="note">
				The delay -dφ/dω made as flat as possible at DC, so a pulse keeps its shape. The denominator is
				the reverse Bessel polynomial; this H(s) delays by exactly 1 s at DC.
			</p>
			<Equation tex={`H(s) = \\dfrac{\\theta_n(0)}{\\theta_n(s)}, \\qquad \\theta_n(s) = \\sum_{k=0}^{n} \\dfrac{(2n-k)!}{2^{\\,n-k}\\,k!\\,(n-k)!}\\, s^k`} />
			<Equation tex={`\\theta_2 = s^2 + 3s + 3, \\qquad \\theta_3 = s^3 + 6s^2 + 15s + 15`} />
			<p class="note">
				<strong>How to use:</strong> the poles are the roots of θ_n, found numerically, then scaled
				in frequency until exactly Amax is lost at fp. The order is counted like Legendre's, from the
				loss at fs. As n grows the response tends to a Gaussian, whose loss in dB grows with the square
				of the frequency, so a sharp spec may be out of reach at any order.
			</p>
			<Equation tex={`A_n = -20\\log_{10}\\left|H_n\\!\\left(j\\,\\tfrac{1}{k}\\right)\\right| \\ge A_{min}, \\qquad \\lim_{n\\to\\infty} A(2\\,\\omega_{A}) = 4\\,A_{max}`} />
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">22</span>
			<h2>Inverse Chebyshev (Chebyshev II)</h2>
		</div>

		<div class="formula">
			<h3>Response, zeros and poles</h3>
			<p class="note">
				Flat passband, ripple in the stopband between zeros of transmission. Written with the stopband
				edge ωs as the reference; the poles are Chebyshev I poles for ε = 1/εs, inverted.
			</p>
			<Equation tex={`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\dfrac{1}{\\varepsilon_s^2\\, C_n^2(\\omega_s/\\omega)}}, \\qquad \\omega_{z,i} = \\dfrac{\\omega_s}{\\cos\\theta_i}, \\qquad p_i = \\dfrac{1}{s_i}`} />
			<Equation tex={`s_i = -\\sinh(\\beta)\\sin\\theta_i + j\\cosh(\\beta)\\cos\\theta_i, \\qquad \\beta = \\dfrac{\\operatorname{asinh}(\\varepsilon_s)}{n}, \\qquad \\theta_i = \\dfrac{(2i+1)\\pi}{2n}`} />
		</div>

		<div class="formula">
			<h3>Order and stopband ripple</h3>
			<p class="note">
				The same order formula as Chebyshev I. With ωs placed at fs and exactly Amax lost at fp, the
				stopband ripple follows; rounding n up makes it deeper than Amin.
			</p>
			<Equation tex={`n \\ge \\dfrac{\\operatorname{acosh}(\\varepsilon_s/\\varepsilon_p)}{\\operatorname{acosh}(1/k)}, \\qquad \\varepsilon_s = \\varepsilon_p\\,C_n(1/k) = \\varepsilon_p\\cosh\\!\\left(n\\operatorname{acosh}\\tfrac{1}{k}\\right), \\qquad A_{min}' = 10\\log_{10}(1 + \\varepsilon_s^2)`} />
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">23</span>
			<h2>Elliptic (Cauer)</h2>
		</div>

		<div class="formula">
			<h3>Response and order</h3>
			<p class="note">
				Equal ripple in both bands, zeros in the stopband: the steepest transition for a given order.
				R_n is the elliptic rational function; k = ωp/ωs is the selectivity and k1 = εp/εs the
				discrimination. K is the complete elliptic integral of the first kind, K'(k) = K(√(1-k²)).
			</p>
			<Equation tex={`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon_p^2 R_n^2(\\omega/\\omega_p)}, \\qquad n \\ge \\dfrac{K(k)\\,K'(k_1)}{K'(k)\\,K(k_1)}`} />
			<Equation tex={`K(k) = \\int_0^{\\pi/2}\\dfrac{d\\phi}{\\sqrt{1 - k^2\\sin^2\\phi}} = \\dfrac{\\pi}{2\\,\\operatorname{AGM}\\!\\left(1, \\sqrt{1-k^2}\\right)}`} />
			<p class="note">
				<strong>How to use:</strong> with n rounded up, the degree equation is solved for k1 at the
				spec's k, through the nomes q = exp(-πK'/K): q1 = q^n. The stopband then loses Amin' ≥ Amin.
			</p>
			<Equation tex={`q_1 = q^n, \\qquad k_1^2 = 16\\,q_1\\left(\\dfrac{\\sum_{j\\ge0} q_1^{\\,j(j+1)}}{1 + 2\\sum_{j\\ge1} q_1^{\\,j^2}}\\right)^4, \\qquad A_{min}' = 10\\log_{10}\\!\\left(1 + \\dfrac{\\varepsilon_p^2}{k_1^2}\\right)`} />
		</div>

		<div class="formula">
			<h3>Zeros and poles</h3>
			<p class="note">
				From the Jacobi elliptic functions sn, cn, dn at n equally spaced points of the quarter
				period, the poles shifted off the axis by v0, which carries Amax (F is the incomplete integral
				of the first kind).
			</p>
			<Equation tex={`\\omega_{z,i} = \\dfrac{\\omega_p}{k\\,\\operatorname{sn}(u_i K/n,\\ k)}, \\qquad u_i = n-1,\\ n-3,\\ \\ldots`} />
			<Equation tex={`p_i = -\\dfrac{c\\,d\\,s_v c_v + j\\,s\\,d_v}{1 - (d\\,s_v)^2}, \\qquad v_0 = \\dfrac{K(k)\\,F\\!\\left(\\arctan(1/\\varepsilon_p),\\ k_1'\\right)}{n\\,K(k_1)}`} />
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">24</span>
			<h2>Stages with zeros (notch stages)</h2>
		</div>

		<div class="formula">
			<h3>Stage and denormalization</h3>
			<p class="note">
				Each pole pair of an elliptic or inverse Chebyshev prototype carries a pair of zeros ±j√z. The
				stage has gain 1 at DC (low-pass) or far above the zero (high-pass); s → s/ωc denormalizes
				it, and s → 1/s moves a low-pass zero z to 1/z for a high-pass.
			</p>
			<Equation tex={`H(s) = \\dfrac{b}{z}\\,\\dfrac{s^2 + z}{s^2 + as + b}, \\qquad \\omega_z = \\omega_c\\sqrt{z}, \\qquad z_{hp} = \\dfrac{1}{z}`} />
			<Equation tex={`H(s) = K\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2}`} />
		</div>

		<div class="formula">
			<h3>Tow-Thomas notch (feed-forward)</h3>
			<p class="note">
				The Tow-Thomas high-pass (Cin into A1) plus Rz from the input into A2: an s² term and a
				constant on top, no s term, so the zeros sit on the jω axis. Output at A1.
			</p>
			<Equation tex={`\\dfrac{V_{out}}{V_{in}} = -\\dfrac{\\frac{C_{in}}{C}\\,s^2 + \\frac{1}{C^2 R R_z}}{s^2 + \\frac{s}{C R_d} + \\frac{1}{C^2 R^2}}, \\qquad \\omega_z^2 = \\dfrac{1}{C\\,C_{in} R R_z}, \\qquad H(\\infty) = -\\dfrac{C_{in}}{C},\\ \\ H(0) = -\\dfrac{R}{R_z}`} />
			<Equation tex={`\\text{low-pass side: } R_z = R,\\ C_{in} = C\\left(\\dfrac{\\omega_n}{\\omega_z}\\right)^2; \\qquad \\text{high-pass side: } C_{in} = C,\\ R_z = R\\left(\\dfrac{\\omega_n}{\\omega_z}\\right)^2`} />
			<p class="note">
				<strong>How to use:</strong> on the low-pass side round Cin to a stocked capacitor, then solve
				Rz = 1/(C Cin R ωz²) against the parts used: the zero stays put and the rounding becomes a
				small DC gain error, R/Rz. The zero's sensitivity is -1/2 to each of C, Cin, R and Rz; Q's
				are the Tow-Thomas's (section 19).
			</p>
		</div>

		<div class="formula">
			<h3>Checking the spec, and the band-stop combiner</h3>
			<p class="note">
				Amax and Amin are measured from the top of the passband, and the stopband over its whole
				width, since an elliptic or inverse Chebyshev response comes back up between its zeros. In a
				band-stop, a low-pass branch whose DC gain is G gets its combiner input resistor scaled by G.
			</p>
			<Equation tex={`A(f) = \\max_{\\text{passband}} \\left|H\\right|_{dB} - \\left|H(f)\\right|_{dB}, \\qquad \\min_{f\\,\\in\\,\\text{stopband}} A(f) \\ge A_{min}, \\qquad R_a = G\\,R_f`} />
		</div>
	</section>
</article>

<style>
	h1 {
		font-size: clamp(1.9rem, 5vw, 2.5rem);
		margin-bottom: 0.5rem;
	}

	.eyebrow a {
		font-size: 0.85rem;
		font-weight: 500;
	}

	.lead {
		font-size: 1.05rem;
		color: var(--textDim);
		margin-bottom: 1.8rem;
	}

	.formula {
		border-top: 1px solid var(--line);
		padding-top: 1.1rem;
		margin-top: 1.1rem;
	}

	.formula:first-of-type {
		border-top: 0;
		padding-top: 0;
		margin-top: 0;
	}

	.formula h3 {
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}

	.formula .note {
		max-width: 74ch;
		margin-bottom: 0.7rem;
	}

	.formula .note:last-child {
		margin-bottom: 0;
	}
</style>
