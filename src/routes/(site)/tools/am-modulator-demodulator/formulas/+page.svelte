<script>
	import Equation from '$lib/components/Equation.svelte';
</script>

<svelte:head>
	<title>Formula sheet · AM Modulator/Demodulator Design · rbt56</title>
	<meta
		name="description"
		content="Every formula the AM Modulator/Demodulator Design tool uses, grouped by circuit, each derived from the one before it, with what it is and how to use it."
	/>
</svelte:head>

<article>
	<p class="eyebrow"><a href="/tools/am-modulator-demodulator/">&larr; AM Modulator/Demodulator Design</a></p>
	<h1>Formula sheet</h1>
	<p class="lead">
		Every formula this tool uses, grouped by circuit: AM basics shared by everything, the JFET
		modulator, the diode-and-tank modulator, and the envelope demodulator. Each one is derived from
		the one before it, in the same order as the tool's own "show the math" panels.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">1</span>
			<h2>AM basics</h2>
		</div>

		<div class="formula">
			<h3>The AM signal</h3>
			<p class="note">
				A carrier A_p cos(omega_p t) whose amplitude follows the message m(t), scaled to stay
				between -1 and +1. The bracket is the envelope; n, the modulation index, is how far the
				message may push the amplitude away from A_p.
			</p>
			<Equation tex={`x_{AM}(t) = A_p\\left[1 + n\\,m(t)\\right]\\cos(\\omega_p t)`} />
			<p class="note"><strong>How to use:</strong> every circuit in this tool either produces this form (modulators) or undoes it (demodulator).</p>
		</div>

		<div class="formula">
			<h3>Spectrum: where the sidebands come from</h3>
			<p class="note">
				For a single-tone message m(t) = cos(omega_m t), multiplying out with the product-to-sum
				identity splits the signal into three sinusoids: the carrier, untouched, and two shifted
				copies of the message, the sidebands, each of amplitude nA_p/2. The message never appears
				at its own frequency.
			</p>
			<Equation tex={`\\cos\\alpha\\,\\cos\\beta = \\dfrac{\\cos(\\alpha-\\beta) + \\cos(\\alpha+\\beta)}{2}`} />
			<Equation
				tex={`x_{AM}(t) = A_p\\cos(\\omega_p t) + \\dfrac{nA_p}{2}\\cos\\big((\\omega_p-\\omega_m)t\\big) + \\dfrac{nA_p}{2}\\cos\\big((\\omega_p+\\omega_m)t\\big)`}
			/>
			<p class="note"><strong>How to use:</strong> the signal occupies a band 2 f_m wide around f_p; that is the bandwidth the tank modulator's filter has to pass.</p>
		</div>

		<div class="formula">
			<h3>Modulation index from the envelope</h3>
			<p class="note">
				The envelope peaks at A_p(1+n) where m = +1 and dips to A_p(1-n) where m = -1; subtracting
				and adding the two removes A_p.
			</p>
			<Equation tex={`V_{max} = A_p(1+n),\\quad V_{min} = A_p(1-n) \\ \\Rightarrow\\ n = \\dfrac{V_{max} - V_{min}}{V_{max} + V_{min}}`} />
			<p class="note">
				<strong>How to use:</strong> read V_max and V_min off a scope. n &gt; 1 folds the envelope
				(the carrier flips phase) and an envelope detector then recovers a distorted message; n
				&lt; 0.7 wastes most of the power on the carrier. Target 0.7 &le; n &le; 1.
			</p>
		</div>

		<div class="formula">
			<h3>Power efficiency</h3>
			<p class="note">
				The average power of a sinusoid of amplitude A is A²/2. The carrier carries A_p²/2, each
				sideband (nA_p/2)²/2, and only the sidebands carry the message; the efficiency is the
				sideband share of the total.
			</p>
			<Equation
				tex={`\\eta = \\dfrac{P_{sidebands}}{P_{carrier} + P_{sidebands}} = \\dfrac{2 \\times \\dfrac{n^2 A_p^2}{8}}{\\dfrac{A_p^2}{2} + \\dfrac{n^2 A_p^2}{4}} = \\dfrac{n^2}{2 + n^2}`}
			/>
			<p class="note">
				<strong>How to use:</strong> n = 1 gives 33%, n = 0.33 gives about 5%. The carrier is kept
				anyway because it lets a rectifier plus a low-pass filter recover the envelope.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">2</span>
			<h2>JFET modulator</h2>
		</div>

		<div class="formula">
			<h3>Channel conductance (ohmic region, small V_DS)</h3>
			<p class="note">
				In the ohmic region the gate controls the width of the channel. The standard drain-current
				model there is quadratic in V_DS; for a small V_DS the squared term is negligible and what
				remains is Ohm's law with a conductance that depends on the gate only. V_P is the pinch-off
				voltage (negative for N-channel), I_DSS the current at V_GS = 0.
			</p>
			<Equation tex={`I_D = \\dfrac{2 I_{DSS}}{V_P^2}\\left[(V_{GS}-V_P)\\,V_{DS} - \\dfrac{V_{DS}^2}{2}\\right] \\ \\approx\\ G(V_{GS})\\,V_{DS}`} />
			<Equation tex={`G(V_{GS}) = \\dfrac{1}{r_{DS}} = \\dfrac{2 I_{DSS}}{V_P^2}\\,(V_{GS} - V_P)`} />
			<p class="note">
				<strong>How to use:</strong> valid for V_P &le; V_GS &le; 0 and |V_DS| well below 2(V_GS -
				V_P). G is a straight line: 0 at V_GS = V_P, 2 I_DSS/|V_P| at V_GS = 0. Measure I_DSS and
				V_P on the actual part; both vary a lot between individual JFETs.
			</p>
		</div>

		<div class="formula">
			<h3>Bias point</h3>
			<p class="note">Halfway along the gate range is halfway up the conductance line, leaving equal room to swing both ways.</p>
			<Equation tex={`V_C = \\dfrac{V_P}{2}, \\qquad G(V_C) = \\dfrac{I_{DSS}}{|V_P|}, \\qquad r_{DS}(V_C) = \\dfrac{|V_P|}{I_{DSS}}`} />
			<p class="note"><strong>How to use:</strong> the DC level the conditioning chain must deliver to the gate.</p>
		</div>

		<div class="formula">
			<h3>Gain cell</h3>
			<p class="note">
				Non-inverting amplifier with the JFET channel as the bottom leg of the feedback divider
				(drain at the - input, source grounded) and R_b as the top leg. The - input follows the +
				input, so the channel current equals the R_b current.
			</p>
			<Equation tex={`\\dfrac{x_p}{r_{DS}} = \\dfrac{V_{out} - x_p}{R_b} \\ \\Rightarrow\\ V_{out} = x_p\\big[1 + R_b\\,G(V_{GS})\\big]`} />
			<p class="note"><strong>How to use:</strong> the carrier x_p(t) drives the + input, the gate voltage V_GS(t) carries the message.</p>
		</div>

		<div class="formula">
			<h3>Message on the gate, modulation index</h3>
			<p class="note">
				With V_GS = V_C + x_m(t) and the gate swinging by a fraction s of the |V_P|/2 room, the
				linear conductance becomes G(V_C)[1 + s m(t)]; x is R_b in units of the channel resistance
				at bias. The output is then exactly the AM form.
			</p>
			<Equation tex={`G(V_C + x_m) = G(V_C)\\big[1 + s\\,m(t)\\big], \\qquad x = \\dfrac{R_b}{r_{DS}(V_C)}`} />
			<Equation tex={`V_{out}(t) = x_p(t)\\,(1+x)\\left[1 + \\dfrac{x\\,s}{1+x}\\,m(t)\\right] \\ \\Rightarrow\\ K_0 = 1 + x, \\qquad n = s\\,\\dfrac{x}{1+x}`} />
			<p class="note">
				<strong>How to use:</strong> n can never reach s (the swing fraction is its ceiling); a
				bigger R_b gives both more gain and deeper modulation. For a target n, invert:
			</p>
			<Equation tex={`x = \\dfrac{n}{s - n}, \\qquad R_b = r_{DS}(V_C)\\,x`} />
		</div>

		<div class="formula">
			<h3>Signal-conditioning chain</h3>
			<p class="note">
				Four small stages turn a small bipolar source into V_C + x_m(t) at the gate. Gain stage:
				same non-inverting amplifier with a fixed bottom resistor. High-pass: a divider between
				1/(sC) and R, corner a decade below the lowest message frequency (0.04 dB loss there).
				Divider: series current times R_bottom. Summer: currents into a virtual ground, unity
				weights with equal resistors; its minus sign turns the positive tap into the negative
				V_C and merely inverts the message.
			</p>
			<Equation tex={`\\dfrac{V_{in}}{R_{bottom}} = \\dfrac{V_{out} - V_{in}}{R_{top}} \\ \\Rightarrow\\ \\text{gain} = 1+\\dfrac{R_{top}}{R_{bottom}} = \\dfrac{V_{swing}}{V_{source}}`} />
			<Equation tex={`H_{HPF}(s) = \\dfrac{R}{R + 1/(sC)} = \\dfrac{sRC}{1 + sRC}, \\qquad f_c = \\dfrac{1}{2\\pi R C} = \\dfrac{f_{m,min}}{10}`} />
			<Equation tex={`V_{tap} = V_{cc}\\,\\dfrac{R_{bottom}}{R_{top}+R_{bottom}} = |V_C| \\ \\Rightarrow\\ R_{top} = R_{bottom}\\,\\dfrac{V_{cc} - |V_C|}{|V_C|}`} />
			<Equation tex={`\\dfrac{V_{ac}}{R} + \\dfrac{V_{tap}}{R} = -\\dfrac{V_{out}}{R} \\ \\Rightarrow\\ V_{out} = -(V_{ac} + V_{tap}) = V_C - V_{ac}`} />
			<p class="note">
				<strong>How to use:</strong> gain from the source amplitude and the wanted swing; C from
				f_c with R fixed; R_top of the divider from |V_C| with R_bottom fixed; every resistor
				rounded to E24 and the actual values recomputed.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">3</span>
			<h2>Diode + resonant-tank modulator</h2>
		</div>

		<div class="formula">
			<h3>Nonlinear mixing (Taylor expansion)</h3>
			<p class="note">
				A diode's smooth, strongly curved current-voltage law can be approximated around the bias
				point by a polynomial. The linear term only scales; the squared term creates new
				frequencies. Feeding it the sum of carrier and message and squaring, with cos² x = (1 +
				cos 2x)/2 and the product-to-sum identity, sorts the result into DC, harmonics and the
				wanted sidebands.
			</p>
			<Equation tex={`i = I_S\\left(e^{v/(\\eta V_T)} - 1\\right) \\approx I_0 + a\\,v + b\\,v^2 + \\cdots, \\qquad v = A_p\\cos(\\omega_p t) + A_m\\cos(\\omega_m t)`} />
			<Equation
				tex={`b\\,v^2 = \\underbrace{\\tfrac{b}{2}(A_p^2 + A_m^2)}_{\\text{DC}} + \\underbrace{\\tfrac{b}{2}A_p^2\\cos(2\\omega_p t) + \\tfrac{b}{2}A_m^2\\cos(2\\omega_m t)}_{\\text{harmonics}} + \\underbrace{bA_pA_m\\big[\\cos((\\omega_p-\\omega_m)t) + \\cos((\\omega_p+\\omega_m)t)\\big]}_{\\text{sidebands}}`}
			/>
			<p class="note">
				<strong>How to use:</strong> the diode current holds DC, omega_m, omega_p, 2 omega_m,
				2 omega_p and omega_p &plusmn; omega_m all at once; the tank keeps only omega_p and its
				two sidebands. The depth of modulation, n = 2bA_m/a, depends on the diode's curvature and
				is set on the bench, not designed.
			</p>
		</div>

		<div class="formula">
			<h3>Resonant tank (parallel RLC)</h3>
			<p class="note">
				Parallel branches add as admittances. The imaginary part vanishes where the capacitor and
				the inductor cancel: that is the resonance, where the tank is just R. The impedance falls
				to R/sqrt(2) where the imaginary part equals 1/R; those two frequencies are 1/(RC) apart,
				which defines the bandwidth and Q.
			</p>
			<Equation tex={`Y = \\dfrac{1}{R} + j\\left(\\omega C - \\dfrac{1}{\\omega L}\\right) \\ \\Rightarrow\\ \\omega_0 = \\dfrac{1}{\\sqrt{LC}}, \\qquad f_0 = \\dfrac{1}{2\\pi\\sqrt{LC}}`} />
			<Equation tex={`\\omega C - \\dfrac{1}{\\omega L} = \\pm\\dfrac{1}{R} \\ \\Rightarrow\\ \\Delta\\omega = \\dfrac{1}{RC}, \\qquad Q = \\omega_0 R C = R\\sqrt{\\dfrac{C}{L}}, \\qquad BW = \\dfrac{f_0}{Q}`} />
			<p class="note">
				<strong>How to use:</strong> BW = 2 &times; margin &times; f_m,max (margin &ge; 1) so both
				sidebands pass; Q = f_p / BW; pick a practical L, then C = 1/(omega_0² L) and R = Q /
				(omega_0 C), each rounded to a preferred value, then recompute the actual f_0, Q and BW.
			</p>
		</div>

		<div class="formula">
			<h3>Bias margin</h3>
			<p class="note">The polynomial only describes a conducting diode: the summed voltage must stay above the forward threshold even when the carrier and the message peak together.</p>
			<Equation tex={`V_{DC} \\geq A_p + A_m + V_f + \\text{margin}`} />
			<p class="note"><strong>How to use:</strong> size the DC-bias input of the summer to at least this value.</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">4</span>
			<h2>Envelope demodulator</h2>
		</div>

		<div class="formula">
			<h3>Absolute value keeps the envelope</h3>
			<p class="note">
				The envelope is the size of the fast oscillation; the absolute value keeps the size and
				drops the sign. For n &le; 1 the bracket is never negative, so it acts on the carrier only.
			</p>
			<Equation tex={`\\left|x_{AM}(t)\\right| = A_p\\big[1 + n\\,m(t)\\big]\\,\\left|\\cos(\\omega_p t)\\right|`} />
		</div>

		<div class="formula">
			<h3>Fourier series of the rectified carrier</h3>
			<p class="note">
				A rectified cosine is periodic, hence a sum of sinusoids. Full-wave: average 2/pi, first
				ripple at 2 f_p. Half-wave: average 1/pi and a ripple term at f_p itself, twice as close to
				the message. Multiplied by the envelope, the constant term is the message and the rest is
				ripple the low-pass filter removes.
			</p>
			<Equation tex={`\\left|\\cos\\theta\\right| = \\dfrac{2}{\\pi} + \\dfrac{4}{\\pi}\\left[\\dfrac{\\cos 2\\theta}{3} - \\dfrac{\\cos 4\\theta}{15} + \\dfrac{\\cos 6\\theta}{35} - \\cdots\\right]`} />
			<Equation tex={`\\max(\\cos\\theta, 0) = \\dfrac{1}{\\pi} + \\dfrac{1}{2}\\cos\\theta + \\dfrac{2}{\\pi}\\left[\\dfrac{\\cos 2\\theta}{3} - \\dfrac{\\cos 4\\theta}{15} + \\cdots\\right]`} />
			<Equation
				tex={`\\left|x_{AM}(t)\\right| = \\underbrace{\\dfrac{2A_p}{\\pi}\\big[1 + n\\,m(t)\\big]}_{\\text{message + DC}} + \\underbrace{\\dfrac{4A_p}{3\\pi}\\big[1 + n\\,m(t)\\big]\\cos(2\\omega_p t) - \\cdots}_{\\text{ripple at } 2f_p \\text{ and above}}`}
			/>
			<p class="note">
				<strong>How to use:</strong> the ripple frequency (2 f_p full-wave, f_p half-wave) is the
				stopband edge of the envelope filter; the message band f_m,max is its passband edge.
			</p>
		</div>

		<div class="formula">
			<h3>Precision full-wave rectifier</h3>
			<p class="note">
				Two op-amps, two diodes, R1 = R2 = R3 (any equal value). The diodes sit inside feedback
				loops, so their forward drop is corrected. Positive input: D2 conducts, D1 is off, no
				current in R1/R2, both op-amps are followers. Negative input: D1 conducts, D2 is off, U1B
				is an inverting amplifier fed through R1 with R2 as feedback.
			</p>
			<Equation tex={`V_{out} = V_{in}\\ (V_{in} > 0), \\qquad V_{out} = -\\dfrac{R_2}{R_1}V_{in} = -V_{in}\\ (V_{in} < 0) \\ \\Rightarrow\\ V_{out} = |V_{in}|`} />
			<p class="note"><strong>How to use:</strong> checked against Texas Instruments TIDU030; use it whenever a single diode's ripple and 0.7 V loss are not acceptable.</p>
		</div>

		<div class="formula">
			<h3>Envelope low-pass filter</h3>
			<p class="note">
				Same design as the Active Filter Design tool, reused directly: fp = f_m,max is the passband
				edge, fs = the ripple frequency the stopband edge. n is rounded up to the next even integer
				(every stage is a 2nd-order Sallen-Key, no leftover 1st-order stage). The full derivation
				of the response, the order formula, the poles and the cutoff factor is on the
				<a href="/tools/filter-design/formulas/">Active Filter Design formula sheet</a>.
			</p>
			<Equation tex={`k = \\dfrac{f_p}{f_s}, \\qquad n \\geq \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)}\\ \\text{(Butterworth)}, \\qquad n \\geq \\dfrac{\\operatorname{acosh}\\sqrt{\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}}}{\\operatorname{acosh}(1/k)}\\ \\text{(Chebyshev)}`} />
			<Equation tex={`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 \\left(\\dfrac{\\omega}{\\omega_p}\\right)^{2n}}, \\qquad \\varepsilon = \\sqrt{10^{A_{max}/10} - 1}`} />
			<Equation
				tex={`\\varepsilon^2 \\left(\\dfrac{\\omega_0}{\\omega_p}\\right)^{2n} = 1 \\ \\Rightarrow\\ \\omega_c = \\omega_0 = 2\\pi f_p\\, \\varepsilon^{-1/n}\\ \\text{(Butterworth)}, \\qquad \\omega_c = 2\\pi f_p\\ \\text{(Chebyshev)}`}
			/>
			<p class="note">
				<strong>How to use:</strong> Butterworth loses exactly Amax dB at fp only when its pole
				circle sits at fp times epsilon^(-1/n); that factor is 1 only for Amax = 3.0103 dB. Every
				stage is scaled by this omega_c.
			</p>
		</div>

		<div class="formula">
			<h3>Sallen-Key low-pass (unity gain)</h3>
			<p class="note">
				Two equal resistors R in series to the + input, C_bottom from the + input to ground, C_top
				from the output back to the R-R junction X; the op-amp is a follower. Two current balances,
				at X and at the + input, give the transfer function.
			</p>
			<Equation
				tex={`\\text{at X:}\\ \\dfrac{V_{in} - V_X}{R} = \\dfrac{V_X - V_{out}}{R} + sC_{top}(V_X - V_{out}), \\qquad \\text{at (+):}\\ \\dfrac{V_X - V_{out}}{R} = sC_{bottom}V_{out}`}
			/>
			<Equation tex={`H(s) = \\dfrac{1}{s^2R^2C_{top}C_{bottom} + 2sRC_{bottom} + 1} \\ \\Rightarrow\\ \\omega_n = \\dfrac{1}{R\\sqrt{C_{top}C_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{C_{top}}{C_{bottom}}}`} />
			<p class="note">
				<strong>How to use:</strong> pick C_bottom from a preferred series, C_top = 4Q&sup2;
				C_bottom rounded to E12, then solve R from omega_n with the two capacitor values actually
				used, and round R to E24.
			</p>
		</div>
	</section>
</article>

<style>
	.formula {
		margin-bottom: 1.6rem;
	}

	.formula:last-child {
		margin-bottom: 0;
	}

	.formula h3 {
		margin-bottom: 0.4rem;
	}
</style>
