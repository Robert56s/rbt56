<script>
	import Equation from '$lib/components/Equation.svelte';
</script>

<svelte:head>
	<title>Formula sheet · AM Modulator/Demodulator Design · rbt56</title>
	<meta
		name="description"
		content="Every formula the AM Modulator/Demodulator Design tool uses, grouped by circuit, each with what it is and how to use it."
	/>
</svelte:head>

<article>
	<p class="eyebrow"><a href="/tools/am-modulator-demodulator/">&larr; AM Modulator/Demodulator Design</a></p>
	<h1>Formula sheet</h1>
	<p class="lead">
		Every formula this tool uses, grouped by circuit: AM basics shared by everything, the JFET
		modulator, the diode-and-tank modulator, and the envelope demodulator. Each one has what it is
		and how to use it, not just the equation on its own.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">1</span>
			<h2>AM basics</h2>
		</div>

		<div class="formula">
			<h3>Product-to-sum identity</h3>
			<p class="note">
				Why multiplying two sinusoids produces new frequencies instead of just scaling one of
				them: the product has no energy left at either original frequency, only at their sum and
				difference.
			</p>
			<Equation tex={`\\sin\\alpha\\sin\\beta = \\dfrac{\\cos(\\alpha-\\beta) - \\cos(\\alpha+\\beta)}{2}`} />
			<p class="note">
				<strong>How to use:</strong> substitute alpha = w_p t (carrier) and beta = w_m t
				(modulating signal) to see the two sidebands at f_p - f_m and f_p + f_m directly.
			</p>
		</div>

		<div class="formula">
			<h3>Modulation index</h3>
			<p class="note">Read directly off the envelope of the modulated signal on a scope.</p>
			<Equation tex={`n = \\dfrac{V_{max} - V_{min}}{V_{max} + V_{min}}`} />
			<p class="note">
				<strong>How to use:</strong> n &lt; 0.7 under-modulates (wastes power on the carrier), n
				&gt; 1 over-modulates (clips the envelope, the demodulator loses signal). Target
				0.7 &le; n &le; 1.
			</p>
		</div>

		<div class="formula">
			<h3>Power efficiency</h3>
			<p class="note">The fraction of total transmitted power that actually carries the modulating signal.</p>
			<Equation tex={`\\eta = \\dfrac{P_m}{P_p+P_m} = \\dfrac{n^2}{2+n^2}`} />
			<p class="note">
				<strong>How to use:</strong> a quick check on whether a given modulation index is worth
				the transmitted power - n = 1 gives 33%, n = 0.33 gives only ~5%.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">2</span>
			<h2>JFET modulator</h2>
		</div>

		<div class="formula">
			<h3>JFET channel resistance (ohmic region, small V_DS)</h3>
			<p class="note">
				A JFET biased in its triode/ohmic region with a small drain-source voltage behaves as a
				resistor set by the gate-source voltage. V_P is the pinch-off voltage (negative for
				N-channel), I_DSS the drain current at V_GS = 0.
			</p>
			<Equation tex={`r_{DS}(V_{GS}) = \\dfrac{V_P^2}{2\\,I_{DSS}\\,(V_{GS}-V_P)}`} />
			<p class="note">
				<strong>How to use:</strong> valid for V_P &le; V_GS &le; 0. Measuring the JFET's I_DSS and
				V_P experimentally beats trusting a datasheet typical value - both vary a lot between
				individual parts.
			</p>
		</div>

		<div class="formula">
			<h3>Gain-cell transfer function</h3>
			<p class="note">
				Non-inverting amplifier with the JFET channel as the bottom leg of the feedback divider
				(drain at the - input, source grounded) and R_b as the top leg.
			</p>
			<Equation tex={`V_{out}(t) = x_p(t)\\left[1 + \\dfrac{R_b}{r_{DS}(V_{GS}(t))}\\right]`} />
			<p class="note"><strong>How to use:</strong> this is the whole modulator - the carrier x_p(t) drives the + input, the gate voltage V_GS(t) carries the modulating signal.</p>
		</div>

		<div class="formula">
			<h3>Bias point and modulation index</h3>
			<p class="note">
				Biasing at the middle of the ohmic region lands exactly at the middle of the conductance
				range too, since the channel conductance is linear in V_GS. x is the feedback resistor
				expressed relative to the channel resistance at bias.
			</p>
			<Equation tex={`V_C = \\dfrac{V_P}{2}, \\qquad x = \\dfrac{R_b}{r_{DS}(V_C)}, \\qquad n = \\text{swingFraction}\\cdot\\dfrac{x}{1+x}`} />
			<p class="note">
				<strong>How to use:</strong> pick a swing fraction (how much of the available |V_P|/2 gate
				range to use, &le; 1) and a target n, then solve for R_b:
			</p>
			<Equation tex={`R_b = r_{DS}(V_C)\\cdot\\dfrac{n}{\\text{swingFraction}-n}`} />
		</div>

		<div class="formula">
			<h3>Signal-conditioning chain</h3>
			<p class="note">Three stages turn a small bipolar source into the biased gate drive the JFET needs.</p>
			<Equation tex={`\\text{gain} = 1+\\dfrac{R_{top}}{R_{bottom}} = \\dfrac{V_{swing}}{V_{source}}`} />
			<Equation tex={`f_{c,HPF} = \\dfrac{1}{2\\pi R C}`} />
			<Equation tex={`V_{tap} = V_{cc}\\cdot\\dfrac{R_{bottom}}{R_{top}+R_{bottom}}`} />
			<p class="note">
				<strong>How to use:</strong> the gain stage sets the swing amplitude from the source's
				actual amplitude; the HPF cutoff should sit a decade or more below the lowest modulating
				frequency; the divider tap should equal |V_C|, then an inverting unity-gain summer adds it
				to the AC-coupled gate drive.
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
				A diode's near-exponential current-voltage relationship, expanded as a power series
				around the bias point, produces a quadratic term that mixes the carrier and modulating
				signal into sum/difference-frequency sidebands - exactly what a real multiplier would
				produce.
			</p>
			<Equation tex={`i(v) \\approx a\\,v + b\\,v^2 + \\ldots \\;\\Rightarrow\\; 2b A_p A_m\\cos(\\omega_p t)\\cos(\\omega_m t)`} />
			<p class="note">
				<strong>How to use:</strong> this cross-term is buried alongside the un-mixed carrier and
				modulating tone (linear term) and second-harmonic products (quadratic self-terms) - the
				resonant tank below selects it out.
			</p>
		</div>

		<div class="formula">
			<h3>Resonant tank (parallel RLC)</h3>
			<p class="note">Resonant frequency, quality factor and bandwidth of the tank that selects the carrier and its first-order sidebands.</p>
			<Equation tex={`f_0 = \\dfrac{1}{2\\pi\\sqrt{LC}}, \\qquad Q = R\\sqrt{\\dfrac{C}{L}} = \\omega_0 R C, \\qquad BW = \\dfrac{f_0}{Q}`} />
			<p class="note">
				<strong>How to use:</strong> pick BW = 2 &times; margin &times; f_m,max (margin &ge; 1) so the
				tank passes the fp &plusmn; fm sidebands; tune f_0 to the carrier; pick a practical L, then
				solve C from f_0 and R from Q.
			</p>
		</div>

		<div class="formula">
			<h3>Bias margin</h3>
			<p class="note">The summer's output must stay above the diode's forward threshold at every instant, or the diode stops conducting during part of the cycle and the output distorts.</p>
			<Equation tex={`V_{DC} \\geq A_p + A_m + V_f + \\text{margin}`} />
			<p class="note"><strong>How to use:</strong> size the DC-bias divider feeding the summer to at least this value.</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">4</span>
			<h2>Envelope demodulator</h2>
		</div>

		<div class="formula">
			<h3>Precision full-wave rectifier</h3>
			<p class="note">Two op-amps, two diodes, R1 = R2 = R3 (any equal value): the signal path itself changes with input polarity, giving an exact absolute value with no diode-drop error.</p>
			<Equation tex={`V_{out} = |V_{in}|`} />
			<p class="note"><strong>How to use:</strong> verified against Texas Instruments TIDU030; use it whenever a single diode's ripple/loss is not good enough.</p>
		</div>

		<div class="formula">
			<h3>Rectified average and ripple frequency</h3>
			<p class="note">A rectified sinusoid's DC average and the frequency of its residual ripple, for a peak amplitude A_p.</p>
			<Equation tex={`\\text{half-wave: avg} = \\dfrac{A_p}{\\pi},\\ \\text{ripple at } f_p \\qquad \\text{full-wave: avg} = \\dfrac{2A_p}{\\pi},\\ \\text{ripple at } 2f_p`} />
			<p class="note">
				<strong>How to use:</strong> full-wave rectification pushes the ripple to twice the
				carrier frequency, halving the roll-off the envelope filter needs for the same modulating
				bandwidth.
			</p>
		</div>

		<div class="formula">
			<h3>Envelope low-pass filter order</h3>
			<p class="note">
				Same order search as the Active Filter Design tool, reused directly: fp is the passband
				edge (just above the highest modulating frequency), fs is the ripple frequency.
			</p>
			<Equation tex={`k = \\dfrac{f_p}{f_s}, \\qquad n \\geq \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)}\\ \\text{(Butterworth)}`} />
			<p class="note">Amax then places the poles. The Butterworth magnitude response:</p>
			<Equation tex={`\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 \\left(\\dfrac{\\omega}{\\omega_p}\\right)^{2n}}`} />
			<p class="note">Losing exactly Amax dB at fp fixes the ripple factor:</p>
			<Equation tex={`A(\\omega_p) = 10\\log_{10}\\!\\left(1 + \\varepsilon^2\\right) = A_{max} \\ \\Rightarrow\\ \\varepsilon = \\sqrt{10^{A_{max}/10} - 1}`} />
			<p class="note">
				The pole circle (also the -3 dB frequency) sits at fp only when Amax = 3.0103 dB, i.e.
				epsilon = 1; for a smaller Amax it moves out past fp. Every stage is scaled by this omega_c.
				A Chebyshev prototype is already normalized to its ripple edge and needs no factor.
			</p>
			<Equation
				tex={`\\varepsilon^2 \\left(\\dfrac{\\omega_0}{\\omega_p}\\right)^{2n} = 1 \\ \\Rightarrow\\ \\omega_c = \\omega_0 = 2\\pi f_p\\, \\varepsilon^{-1/n}\\ \\text{(Butterworth)}, \\qquad \\omega_c = 2\\pi f_p\\ \\text{(Chebyshev)}`}
			/>
			<p class="note">
				<strong>How to use:</strong> round up to the next even integer (every stage here is a
				plain 2nd-order Sallen-Key, no leftover 1st-order stage) - see the
				<a href="/tools/filter-design/formulas/">Active Filter Design formula sheet</a> for the full pole-placement derivation and the Chebyshev variant.
			</p>
		</div>

		<div class="formula">
			<h3>Sallen-Key low-pass (unity gain)</h3>
			<p class="note">Realizes each envelope-filter stage: two equal resistors R, C_bottom to ground, C_top in feedback.</p>
			<Equation tex={`\\omega_n = \\dfrac{1}{R\\sqrt{C_{top}C_{bottom}}}, \\qquad Q = \\dfrac{1}{2}\\sqrt{\\dfrac{C_{top}}{C_{bottom}}}`} />
			<p class="note"><strong>How to use:</strong> pick C_bottom, compute C_top = 4Q&sup2;C_bottom, round both to a preferred series, then solve R from the target omega_n.</p>
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
