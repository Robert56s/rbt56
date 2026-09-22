<script>
	import Equation from '$lib/components/Equation.svelte';
</script>

<svelte:head>
	<title>Formula sheet · Sine Oscillator Design · rbt56</title>
	<meta
		name="description"
		content="Every formula the Sine Oscillator Design tool uses: Barkhausen's condition, the Wien bridge, the RC phase-shift ladder solved exactly, the quadrature loop and why only damping controls it, the op-amp's lag in the loop and the retune that absorbs it, and amplitude control sized from the diode's real curve."
	/>
</svelte:head>

<article>
	<p class="eyebrow"><a href="/tools/oscillator/">&larr; Sine Oscillator Design</a></p>
	<h1>Formula sheet</h1>
	<p class="lead">
		Every formula this tool uses, in the order the tool applies them: what makes a loop oscillate at
		all, then where each topology gets its phase and what that costs in gain, then what the op-amp's
		own lag does to the loop and how the component values are retuned for it, then the amplitude
		control. Each one is derived from the one before it, and the ones that matter were checked
		against LTspice running the exported circuits.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">1</span>
			<h2>What makes a loop oscillate</h2>
		</div>

		<div class="formula">
			<h3>Barkhausen's condition</h3>
			<p class="note">
				An oscillator is an amplifier of gain A whose output is fed back to its own input through a
				network that returns a fraction beta. There is no input signal: whatever noise is already
				present goes once round the loop and comes back multiplied by A beta. It grows only if what
				comes back is at least as large as what left, and in step with it.
			</p>
			<Equation tex={`A\\,\\beta = 1 \\quad\\Longleftrightarrow\\quad |A\\,\\beta| = 1 \\ \\text{ and } \\ \\angle(A\\beta) = 0^\\circ \\ (\\text{mod } 360^\\circ)`} />
			<p class="note">
				<strong>How to use:</strong> the phase half picks the frequency, because only at one
				frequency does the network turn the signal by the right amount. The magnitude half then says
				what gain the amplifier must supply at that frequency. Both come out of the same network, so
				the two cannot be chosen independently: pick the network, and the required gain is decided.
			</p>
			<Equation tex={`\\beta(f_0) = \\dfrac{1}{A} \\ \\Rightarrow\\ A = \\dfrac{1}{|\\beta(f_0)|}`} />
		</div>

		<div class="formula">
			<h3>Excess gain, and why it is needed</h3>
			<p class="note">
				A gain of exactly 1/beta is a knife edge: a hair under and any oscillation decays, a hair
				over and it grows without bound. No real circuit holds a knife edge, so the amplifier is set
				deliberately high by a small excess, and a nonlinearity pulls the gain back down once the
				amplitude has arrived. The growth that excess buys depends on the network's sharpness: a
				Wien bridge, whose network has a Q of only a third, grows fast on a small excess.
			</p>
			<Equation tex={`A_{start} = (1 + \\epsilon)\\,A_{required}, \\qquad \\text{Wien bridge: } (sRC)^2 + (3 - A)\\,sRC + 1 = 0 \\ \\Rightarrow\\ \\text{growth per cycle} = e^{\\pi (A - 3)} - 1`} />
			<p class="note">
				<strong>How to use:</strong> the excess is what guarantees start-up over part tolerance and
				temperature; the nonlinearity that removes it again is what sets the distortion, and is the
				real design problem in an oscillator. Section 6 is where that happens. The tool reports the
				excess the rounded parts really give, not the one asked for.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">2</span>
			<h2>Wien bridge</h2>
		</div>

		<div class="formula">
			<h3>The Wien network</h3>
			<p class="note">
				A resistor and capacitor in series feeding a resistor and capacitor in parallel to ground.
				The series arm blocks low frequencies and the parallel arm shorts high ones, so what gets
				through peaks in between; the network is a voltage divider between the two impedances.
			</p>
			<Equation tex={`\\beta(s) = \\dfrac{Z_p}{Z_s + Z_p}, \\qquad Z_s = R + \\dfrac{1}{sC}, \\qquad Z_p = \\dfrac{R}{1 + sRC}`} />
			<p class="note">Substituting both and collecting terms, with s = j omega:</p>
			<Equation tex={`\\beta(j\\omega) = \\dfrac{1}{3 + j\\left(\\omega RC - \\dfrac{1}{\\omega RC}\\right)}`} />
			<p class="note">
				<strong>How to use:</strong> the imaginary part is the whole design. It vanishes when omega RC
				= 1, and only there is the output exactly in phase with the input.
			</p>
		</div>

		<div class="formula">
			<h3>Frequency and gain</h3>
			<p class="note">
				At omega RC = 1 the denominator is a real 3, so the network passes exactly a third of the
				signal with no phase shift at all.
			</p>
			<Equation tex={`\\omega_0 = \\dfrac{1}{RC}, \\qquad f_0 = \\dfrac{1}{2\\pi RC}, \\qquad \\beta(f_0) = \\dfrac{1}{3} \\ \\Rightarrow\\ A = 3`} />
			<p class="note">
				A gain of 3 is the lowest of any topology here, and it is a non-inverting gain because the
				network adds no phase, so the amplifier is the ordinary non-inverting pair:
			</p>
			<Equation tex={`A = 1 + \\dfrac{R_f}{R_g} = 3 \\ \\Rightarrow\\ R_f = 2\\,R_g`} />
			<p class="note">
				<strong>How to use:</strong> R_g is a free choice here (10 k in this tool), unlike the ladder
				topologies where it is forced. Section 7 shows why a gain of 3 rather than 29 is the single
				most useful number on this page.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">3</span>
			<h2>RC phase-shift ladder</h2>
		</div>

		<div class="formula">
			<h3>What the ladder has to supply</h3>
			<p class="note">
				An inverting amplifier already turns the signal by 180 degrees, so the network only has to
				find another 180 for the loop to close in phase. One high-pass RC section approaches 90
				degrees but never reaches it, so at least three sections are needed; n sections share the
				180 degrees equally.
			</p>
			<Equation tex={`\\text{one high-pass section: } \\dfrac{j\\omega RC}{1 + j\\omega RC}, \\qquad \\angle = 90^\\circ - \\arctan(\\omega RC)`} />
			<Equation tex={`n \\ \\text{sections} \\Rightarrow \\ \\angle_{each} = \\dfrac{180^\\circ}{n} \\ \\Rightarrow\\ \\omega_0 RC = \\tan\\!\\left(90^\\circ - \\dfrac{180^\\circ}{n}\\right)`} />
			<p class="note">
				<strong>How to use:</strong> high-pass sections, not low-pass. That choice is what lets the
				last shunt element be a resistor, which is the point of the block after next.
			</p>
		</div>

		<div class="formula">
			<h3>Buffered: the sections multiply</h3>
			<p class="note">
				A unity-gain follower between the sections stops each from loading the one before, so the
				sections really are independent and the ladder transfer is the product of n identical ones.
				Each contributes a magnitude of cos(180/n) at the phase-correct frequency.
			</p>
			<Equation tex={`|\\beta| = \\left[\\cos\\!\\left(\\dfrac{180^\\circ}{n}\\right)\\right]^{n} \\ \\Rightarrow\\ A = \\dfrac{1}{|\\beta|}`} />
			<Equation tex={`n = 3:\\ \\omega_0 RC = \\tan 30^\\circ = \\dfrac{1}{\\sqrt{3}},\\ A = 8 \\qquad n = 4 \\ (\\text{Bubba}):\\ \\omega_0 RC = 1,\\ A = 4`} />
			<p class="note">
				<strong>How to use:</strong> three buffered sections cost three op-amps (two followers and the
				gain stage) for a gain of 8; four sections cost four op-amps for a gain of 4, better
				frequency stability and quadrature taps, which is why the Bubba is the better of the two
				buffered versions.
			</p>
		</div>

		<div class="formula">
			<h3>Unbuffered: the ladder has to be solved as one network</h3>
			<p class="note">
				Without buffers each section loads the one before, and the product of three transfers is
				simply wrong. The ladder is a tridiagonal network: with x = omega RC, every node has a
				series capacitor of admittance jx to each neighbour and a shunt resistor of admittance 1 to
				ground. This tool solves that system numerically at every frequency rather than quoting a
				per-section result.
			</p>
			<Equation tex={`\\text{node } k: \\quad -jx\\,v_{k-1} + \\big(1 + jx\\,m_k\\big)v_k - jx\\,v_{k+1} = 0, \\qquad m_k = \\begin{cases} 2 & k < n \\\\ 1 & k = n \\end{cases}`} />
			<Equation tex={`v_0 = 1, \\qquad \\beta(x) = v_n, \\qquad \\Im\\{\\beta(x_0)\\} = 0 \\ \\Rightarrow\\ x_0 = \\omega_0 RC, \\quad A = \\dfrac{1}{|\\beta(x_0)|}`} />
			<p class="note">Solved for three unbuffered sections, that comes out exactly at:</p>
			<Equation tex={`n = 3 \\ \\text{unbuffered}: \\quad x_0 = \\dfrac{1}{\\sqrt{6}} \\approx 0.408, \\qquad \\beta(x_0) = -\\dfrac{1}{29} \\ \\Rightarrow\\ A = 29`} />
			<p class="note">
				<strong>How to use:</strong> Texas Instruments SLOA060 analyses this circuit as though the
				sections did not load each other and predicts a gain of 8, then measures 27. The exact solve
				above gives 29, which is the number to build to. Where a source's simplification and its own
				measurement disagree, the measurement is the one to trust.
			</p>
		</div>

		<div class="formula">
			<h3>R_g is the last ladder resistor</h3>
			<p class="note">
				The detail that is easiest to get wrong. The last shunt resistor of the ladder is the
				inverting amplifier's own input resistor R_g, and its far end sits at the virtual ground,
				which is why the ladder above needs no load term and why the textbook constants come out
				exact.
			</p>
			<Equation tex={`R_g = R, \\qquad A = \\dfrac{R_f}{R_g} = \\dfrac{R_f}{R} \\ \\Rightarrow\\ R_f = A\\,R`} />
			<p class="note">
				<strong>How to use:</strong> hanging a separate R_g on the end of a complete ladder instead
				adds a shunt conductance to the last node, and the required gain for three unbuffered
				sections climbs from 29 to nearly 40. Setting the load admittance to zero in the node
				equation above is exactly the statement that R_g is the ladder's own last resistor.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">4</span>
			<h2>Quadrature loop</h2>
		</div>

		<div class="formula">
			<h3>Two integrators and an inverter</h3>
			<p class="note">
				An integrator delays a sine by exactly a quarter cycle at every frequency, not just at one.
				Two in series make half a cycle, which is a sign flip; an inverter flips it back and the loop
				is closed in phase at any frequency at all. What picks the frequency here is the magnitude
				condition alone.
			</p>
			<Equation tex={`\\text{integrator: } \\dfrac{V_{out}}{V_{in}} = -\\dfrac{1}{sRC} \\ \\Rightarrow\\ \\text{two of them: } \\dfrac{1}{(sRC)^2} = -\\dfrac{1}{(\\omega RC)^2} \\ \\text{ at } s = j\\omega`} />
			<Equation tex={`\\dfrac{1}{(\\omega_0 RC)^2} = 1 \\ \\Rightarrow\\ \\omega_0 = \\dfrac{1}{RC}, \\qquad f_0 = \\dfrac{1}{2\\pi RC}, \\qquad A = 1`} />
			<p class="note">
				<strong>How to use:</strong> a gain of 1 is the least any topology here asks of the op-amp, so
				this reaches the highest frequency of the group, and the two integrator outputs are a true
				sine and cosine pair by construction rather than by trimming. It is the Tow-Thomas
				two-integrator loop with the damping resistor removed, so the poles sit on the imaginary axis
				instead of just inside it. The price is three op-amps.
			</p>
		</div>

		<div class="formula">
			<h3>Why gain does nothing here, and damping does everything</h3>
			<p class="note">
				Give the inverter a gain g instead of 1 and the characteristic equation still has purely
				imaginary roots: the frequency rises as the square root of g, and the amplitude neither grows
				nor decays. So "excess gain to start" is meaningless for this loop, and a limiter that only
				compresses gain (diodes across the inverter's feedback resistor) cannot hold its amplitude
				either: LTspice shows it climbing without end. The only thing that moves these poles off the
				axis is damping across an integrator capacitor.
			</p>
			<Equation tex={`(sRC)^2 + g = 0 \\ \\Rightarrow\\ s = \\pm j\\,\\dfrac{\\sqrt{g}}{RC} \\quad \\text{(purely imaginary for any } g)`} />
			<p class="note">
				A resistor R_n from the inverter output into the second integrator's input puts a conductance
				across that capacitor whose sign is negative, because the inverter output is minus the
				integrator output. That is a designed start-up growth:
			</p>
			<Equation tex={`(sRC)^2 - \\dfrac{R}{R_n}\\,(sRC) + 1 = 0 \\ \\Rightarrow\\ \\sigma = \\dfrac{1}{2 R_n C}, \\qquad \\text{growth per cycle} = e^{\\pi R / R_n} - 1 \\ \\Rightarrow\\ R_n = \\dfrac{\\pi R}{\\ln(1 + \\text{growth})}`} />
			<p class="note">
				<strong>How to use:</strong> 10 percent per cycle wants R_n about 33 R. The clamp that stops
				the growth is a positive conductance in the same place that appears only above a threshold;
				it is in section 6, and the op-amps' own lag, which is a small negative damping of its own,
				is folded into the same balance.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">5</span>
			<h2>From frequency to components</h2>
		</div>

		<div class="formula">
			<h3>One constant per topology, then the retune</h3>
			<p class="note">
				Every topology above ends with the same shape of answer: a dimensionless constant k = omega_0
				RC that the network fixes, and a required gain. That gives the textbook R C product. The
				tool then retunes it for the op-amp's lag (section 7) before choosing any part, so the
				product it actually uses is a few percent smaller at high frequency.
			</p>
			<Equation tex={`RC_{textbook} = \\dfrac{k}{2\\pi f_0}, \\qquad k = \\begin{cases} 1 & \\text{Wien, quadrature, Bubba} \\\\ 1/\\sqrt{6} & \\text{3 sections, unbuffered} \\\\ 1/\\sqrt{3} & \\text{3 sections, buffered} \\end{cases}, \\qquad RC = (1 + r)\\,RC_{textbook}`} />
			<p class="note">
				<strong>How to use:</strong> r is the retune, negative, found by solving the loop with the
				op-amp model in it until its zero-phase frequency lands on the target. It is a few tenths of a
				percent at 1 kHz with a 3 MHz op-amp, and about minus 8 percent for a Wien bridge at 55 kHz.
			</p>
		</div>

		<div class="formula">
			<h3>Picking C, then solving for R</h3>
			<p class="note">
				Capacitors come in far fewer values than resistors, so C is chosen first from whatever series
				is stocked and R is solved from it, then rounded to the nearest available resistor. Every
				candidate capacitor is tried and the pair scored, with the frequency error that the rounding
				leaves weighted far above how comfortable R is to buy.
			</p>
			<Equation tex={`R_{target} = \\dfrac{RC}{C}, \\qquad 1\\,\\text{k} < R_{target} < 1\\,\\text{M}, \\qquad 100\\,\\text{pF} \\le C \\le 1\\,\\mu\\text{F}`} />
			<Equation tex={`\\text{score} = 100\\ln^2\\!\\left(\\dfrac{R}{R_{target}}\\right) + 0.05\\ln^2\\!\\left(\\dfrac{R}{10\\,\\text{k}}\\right) \\ \\rightarrow\\ \\text{minimize}`} />
			<p class="note">
				<strong>How to use:</strong> the two logarithms are ratios, so the score does not care about
				absolute size, and the factor of 2000 between them means a comfortable R is only ever a
				tie-breaker. The loop is then solved once more with the rounded parts, and the frequency the
				tool prints is that one, not the textbook value of the parts.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">6</span>
			<h2>Amplitude control</h2>
		</div>

		<div class="formula">
			<h3>Why something has to hold the amplitude</h3>
			<p class="note">
				An amplifier set above the gain the loop needs makes the amplitude grow until the op-amp
				reaches its supply rails. It then clips, and clipping is a gain below 1 for the peaks, so the
				circuit does settle: it settles into a rounded square wave. SLOA060 measured 2.8 percent
				distortion on a Wien bridge doing exactly that. Something gentler has to take the gain from
				A_start back to A_required before the rails do.
			</p>
			<Equation tex={`A_{start} > A_{required} > A_{limited} \\quad \\text{(the gain must straddle what the loop needs)}`} />
			<p class="note">
				<strong>How to use:</strong> this inequality is the one test that decides whether an amplitude
				control works at all. If A_limited is still above A_required with the limiter fully engaged,
				nothing brings the amplitude back and the output clips on the rails instead.
			</p>
		</div>

		<div class="formula">
			<h3>The diode is a curve, not a switch: its describing function</h3>
			<p class="note">
				Every diode limiter here is sized from the diode's real exponential curve, because at the
				tens of microamps a limiter runs it a 1N4148 drops 0.48 V at 100 uA and 0.38 V at 10 uA, not
				0.6 V, and the hard-switch picture put the settled amplitude 15 to 70 percent off in LTspice.
				For a sinusoid of amplitude V across an anti-parallel pair, the current it draws, averaged the
				way the loop averages it, is a conductance: the fundamental of the current divided by V.
			</p>
			<Equation tex={`i(v) = I_s\\left(e^{v/nV_T} - e^{-v/nV_T}\\right), \\qquad G(V) = \\dfrac{1}{\\pi V}\\int_0^{2\\pi} i(V\\sin\\theta)\\,\\sin\\theta\\,d\\theta`} />
			<p class="note">
				<strong>How to use:</strong> G rises steeply with V once V passes a drop or so, which is what
				makes the amplitude definite. The tool integrates this numerically with the same I_s and n it
				writes into the LTspice model, so the simulation and the page agree to a few percent.
			</p>
		</div>

		<div class="formula">
			<h3>Diodes across part of the feedback resistor (Wien bridge and the ladders)</h3>
			<p class="note">
				The feedback string is R_f1 + R_f2 with the pair across R_f2. With the diodes off it presents
				R_s = R_f1 + R_f2, which sets the start gain; at balance it must present R_t, what the loop
				needs; so the diodes' conductance has to bring R_f2 down to x = R_t - R_f1. The voltage
				across R_f2 is a fixed fraction of the output: (A-1)/A of it for the non-inverting Wien
				stage, all of it for an inverting stage whose input is a virtual ground.
			</p>
			<Equation tex={`\\dfrac{1}{R_{f2}} + G(V_2) = \\dfrac{1}{x}, \\qquad V_2 = \\text{fraction} \\times V_{out} \\times \\dfrac{x}{R_t}, \\qquad x = R_t - R_{f1}`} />
			<Equation tex={`\\text{Wien: } R_t = (A_{req} - 1)R_g, \\ \\text{fraction} = \\dfrac{A_{req}-1}{A_{req}}; \\qquad \\text{ladder: } R_t = A_{req}\\,R, \\ \\text{fraction} = 1`} />
			<p class="note">
				<strong>How to use:</strong> to size the parts, solve for x at the wanted amplitude (one
				bisection: the left side rises with x through V_2, the right side falls), then R_f2 = x +
				(R_s - R_t) and R_f1 = R_t - x. To predict the amplitude of given parts, run it backwards:
				G(V_2) = 1/x - 1/R_f2 fixes V_2, hence V_out. Because the amplitude hangs on R_t - R_f1, a
				small difference of two large numbers, R_f1 is taken from the 1 percent series and the pair
				is chosen among stock neighbours for the closest amplitude.
			</p>
		</div>

		<div class="formula">
			<h3>The clamp on the quadrature loop</h3>
			<p class="note">
				A divider R_d1 R_d2 from the cosine output, with the pair from its tap into the second
				integrator's input. Above the divider's threshold the diodes conduct into the virtual ground,
				and averaged over a cycle that is a positive conductance across the integrator capacitor. It
				has to cancel the negative one from R_n and the small extra growth the op-amps' lag
				contributes:
			</p>
			<Equation tex={`G_{clamp}(A) = \\dfrac{1}{R_n} + 2\\,\\sigma_{lag}\\,C, \\qquad G_{clamp}(A) = \\dfrac{1}{\\pi A}\\int_0^{2\\pi} i_{clamp}(A\\sin\\theta)\\,\\sin\\theta\\,d\\theta`} />
			<p class="note">
				<strong>How to use:</strong> R_d2 is a round 1 k so the conductance rises steeply above the
				threshold, and R_d1 is solved so the balance lands on the wanted amplitude. Because the
				threshold is a resistor ratio and a diode drop, the amplitude does not hang on the exact value
				of R_n or of the diode current, which a plain series resistor would make it do. The clamp
				current is integrated before it reaches either output, so its harmonics arrive divided by
				their order: under a percent of distortion in LTspice.
			</p>
		</div>

		<div class="formula">
			<h3>Incandescent lamp</h3>
			<p class="note">
				A small filament lamp in the lower feedback leg does the same job with heat: its resistance
				rises as the current warms the filament, so a larger output means a larger R_g and a smaller
				gain. Nothing clips and nothing has a kink in it anywhere, which is why this is the cleanest
				of the three, under 0.1 percent measured.
			</p>
			<Equation tex={`A = 1 + \\dfrac{R_f}{R_{lamp}} = A_{req} \\ \\Rightarrow\\ R_{lamp,hot} = \\dfrac{R_f}{A_{req} - 1}, \\quad \\text{with } \\dfrac{V_{out}}{A_{req}} \\text{ across it}`} />
			<p class="note">
				The design cannot set the amplitude, only state what the lamp must do; the exported circuit
				carries a lamp that does exactly that, so the simulation means something:
			</p>
			<Equation tex={`R = R_{cold}(1 + \\alpha\\theta), \\qquad C_{th}\\dfrac{d\\theta}{dt} = \\dfrac{V^2}{R} - \\dfrac{\\theta}{R_{th}}, \\qquad R_{cold} = \\dfrac{R_{hot}}{3}, \\ \\theta_{hot} = \\dfrac{2}{\\alpha}, \\ R_{th} = \\dfrac{\\theta_{hot}}{P_{hot}}, \\ C_{th} = \\dfrac{\\tau}{R_{th}}`} />
			<p class="note">
				<strong>How to use:</strong> the catch on a bench is thermal: the amplitude drifts with room
				temperature, the loop takes about a second to settle and can overshoot on switch-on, and at
				frequencies low enough that one cycle is not short next to the filament time constant the
				resistance follows the waveform itself and distortion climbs. Lamps of a suitable rating are
				also no longer easy to buy.
			</p>
		</div>

		<div class="formula">
			<h3>JFET automatic gain control</h3>
			<p class="note">
				A JFET with a small drain-source voltage is a resistor whose value the gate sets, in series
				with a fixed resistor as the lower leg: closing the channel raises the leg and lowers the
				gain all the way to 1, opening it takes the gain above balance so the loop starts. A peak
				detector turns the output's negative peaks into a steady negative voltage, a divider scales
				it, and two equal resistors average it with the drain voltage into the gate, which cancels
				the channel's curvature exactly.
			</p>
			<Equation tex={`r_{DS} = \\dfrac{1}{2\\beta\\,(V_{GS} - V_P)}, \\qquad A = 1 + \\dfrac{R_f}{R_{ser} + r_{DS}}, \\qquad V_{GS} = \\dfrac{V_c + V_{DS}}{2} \\ \\Rightarrow\\ I_D = 2\\beta\\left(\\dfrac{V_c}{2} - V_P\\right)V_{DS}`} />
			<Equation tex={`\\text{at balance: } R_{ser} + r_{DS} = \\dfrac{R_f}{A_{req} - 1}, \\qquad V_c = -(V_{pk} - V_f)\\,\\dfrac{R_b}{R_a + R_b}, \\qquad \\tau_{det} = (R_a + R_b)\\,C_{det} \\approx 50 \\text{ cycles}`} />
			<p class="note">
				<strong>How to use:</strong> the channel at balance is kept to about a tenth of the leg so it
				sees little voltage, the divider is solved so the gate reaches the V_GS that gives that
				channel, and the amplitude the loop settles at is where the gain is exactly A_req. The
				detector's voltage is the only one available, so a JFET whose pinch-off is large next to the
				output cannot be controlled at all: a J111 needs about 9 V of output, a small generic part
				about 3 V. The tool says so instead of sizing a leg that cannot work.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">7</span>
			<h2>The op-amp in the loop</h2>
		</div>

		<div class="formula">
			<h3>The single-pole op-amp and the lag of a stage</h3>
			<p class="note">
				A real op-amp is a single pole: its open-loop gain is A(s) = wt / s with wt = 2 pi GBW, so a
				stage built on it with noise gain N has a closed-loop pole at GBW / N and lags by atan(f N /
				GBW) at frequency f. The loss of gain is small; the lag is what matters.
			</p>
			<Equation tex={`f_{-3dB} = \\dfrac{GBW}{N}, \\qquad \\phi = \\arctan\\dfrac{f\\,N}{GBW}, \\qquad N = \\begin{cases} 1 + R_f/R_g & \\text{non-inverting} \\\\ 1 + R_f/R_g & \\text{inverting} \\\\ 1 & \\text{follower} \\end{cases}`} />
			<p class="note">
				<strong>How to use:</strong> the loop oscillates where its total phase is zero, so any phase
				the amplifier adds is phase the network must now supply, and it does so by moving off its own
				zero-phase point. The frequency shifts, the network attenuates differently there, and the
				gain needed shifts too.
			</p>
		</div>

		<div class="formula">
			<h3>Wien bridge: the closed form</h3>
			<p class="note">
				For the Wien bridge the phase condition with the lag included is a quadratic in x = omega RC,
				and the answer shows how a small lag becomes a large frequency error, because the Wien
				network's Q is only a third: one degree of lag moves the frequency by about 1.2 percent.
			</p>
			<Equation tex={`\\dfrac{x - 1/x}{3} = -\\tan\\phi \\ \\Rightarrow\\ x = \\dfrac{-3k + \\sqrt{9k^2 + 4}}{2}, \\quad k = \\dfrac{f\\,N}{GBW} \\quad (\\approx 1 - 1.5k \\text{ for small } k)`} />
			<p class="note">
				<strong>How to use:</strong> 55 kHz, N = 3.15 and a 3 MHz op-amp give k = 0.058 and x =
				0.918: the textbook values run 8 percent low, which LTspice confirms. The Wien bridge's saving
				grace is that N is 3; a phase-shift ladder's amplifier runs at N of 30 and lags ten times as
				much at the same frequency.
			</p>
		</div>

		<div class="formula">
			<h3>Every loop, exactly: the nodal solve</h3>
			<p class="note">
				In the ladder oscillators the network is part of the amplifier's own input impedance (the
				last capacitor and R_g feed the virtual ground), so the amplifier's lag depends on the network
				and no closed form separates them. The tool writes each loop as a homogeneous nodal system in
				its node voltages, every conductance in units of 1/R so that p = sRC, with the op-amp as its
				single-pole model, and opens it where the amplifier output feeds the network, the amplifier's
				own feedback left intact. The limiter diodes' junction capacitance, 8 pF across R_f2, is in
				it too; across a 50 k R_f2 that is 8 degrees at 55 kHz.
			</p>
			<Equation tex={`\\text{op-amp row: } \\dfrac{s}{\\omega_t}\\,v_{out} - v_+ + v_- = 0, \\qquad L(s) = \\dfrac{v_{out}}{v_{in}}\\Big|_{\\text{loop opened at the network input}}`} />
			<Equation tex={`\\text{zero-phase frequency: } \\Im\\{L(j\\omega_z)\\} = 0, \\quad \\text{balance gain: } |L(j\\omega_z)| = 1, \\quad \\text{pole: } \\det M(s) = 0, \\ s = \\sigma + j\\omega, \\ \\text{growth per cycle} = e^{2\\pi\\sigma/\\omega} - 1`} />
			<p class="note">
				<strong>How to use:</strong> the zero-phase frequency at the start gain is where a
				diode-limited loop runs (the diodes are off for most of every cycle); the balance gain is what
				the parts are sized to; the pole's real part says whether it starts. This solve reproduces
				LTspice's own AC analysis of the open loop to four figures on every topology, which is the
				check script's job to keep true.
			</p>
		</div>

		<div class="formula">
			<h3>Retune, and where the model stops</h3>
			<p class="note">
				The R C product is scaled until the zero-phase frequency lands on the target (a fixed-point
				iteration, since the frequency scales almost exactly as 1/RC), the parts are rounded, and the
				loop is solved once more with them. The tool trusts the result while the amplifier's lag stays
				under about 25 degrees; past that the single-pole picture drifts from what LTspice and a real
				part do, and it says so.
			</p>
			<Equation tex={`RC \\leftarrow RC \\cdot \\dfrac{\\omega_z}{\\omega_{target}} \\ \\text{ until } \\omega_z = \\omega_{target}, \\qquad \\text{trusted while } \\phi \\le 25^\\circ`} />
			<p class="note">
				<strong>How to use:</strong> the "10 percent point" in the comparison is the frequency at
				which the textbook values would land 10 percent low with this op-amp, a fair measure of how
				hard the retune is working. Slew rate is the other ceiling, and the one that bites at large
				amplitudes rather than small ones:
			</p>
			<Equation tex={`\\left.\\dfrac{dV}{dt}\\right|_{max} = 2\\pi f_0 V_{pk} \\ \\le \\ \\dfrac{SR}{2}, \\qquad V_{pk} \\le V_{swing}`} />
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">8</span>
			<h2>Distortion and output taps</h2>
		</div>

		<div class="formula">
			<h3>Where the distortion figures come from</h3>
			<p class="note">
				A diode limiter bends the peaks in proportion to the excess loop gain it has to absorb, so
				the tool reports the distortion as a rate per unit of excess, measured on LTspice runs of the
				exported circuits: about 0.6 percent of third harmonic per percent of excess for the Wien
				bridge, about 0.1 for the ladders, whose limiter sits behind a network that filters the
				amplifier's harmonics. The lamp and the JFET control sit outside the signal path and measure
				0.1 and 0.2 percent (TI SLOA060, and LTspice agrees); the quadrature clamp's current is
				integrated before it reaches the outputs, about 0.25 percent at 1 kHz.
			</p>
			<Equation tex={`\\text{THD}_{diodes} \\approx \\kappa \\times \\text{excess}, \\qquad \\kappa \\approx 0.6 \\ (\\text{Wien}), \\ 0.1 \\ (\\text{ladders})`} />
			<p class="note">
				<strong>How to use:</strong> only the Wien bridge's distortion can genuinely be driven down,
				because its amplitude control sits in a leg of its own rather than inside the signal path.
			</p>
		</div>

		<div class="formula">
			<h3>Taking the output after a section</h3>
			<p class="note">
				In a phase-shift loop each RC section attenuates, so a tap further along the ladder is
				smaller than the amplifier's output and also cleaner: the limiter's kink is at the amplifier,
				and every section after it is a filter.
			</p>
			<Equation tex={`V_{tap} = \\dfrac{V_{out}}{A} \\qquad \\left(\\dfrac{1}{29},\\ \\dfrac{1}{8},\\ \\dfrac{1}{4} \\ \\text{for the three ladders}\\right)`} />
			<p class="note">
				<strong>How to use:</strong> the export reports the distortion at the last ladder node as well
				as at the output, and names the Bubba's quadrature tap. When distortion matters more than
				amplitude, take the later tap and make up the level with a fixed gain stage after it.
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
