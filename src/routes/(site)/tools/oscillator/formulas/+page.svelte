<script>
	import Equation from '$lib/components/Equation.svelte';
</script>

<svelte:head>
	<title>Formula sheet · Sine Oscillator Design · rbt56</title>
	<meta
		name="description"
		content="Every formula the Sine Oscillator Design tool uses: Barkhausen's condition, the Wien bridge, the RC phase-shift ladder solved exactly, the quadrature loop, amplitude stabilization and the op-amp limits."
	/>
</svelte:head>

<article>
	<p class="eyebrow"><a href="/tools/oscillator/">&larr; Sine Oscillator Design</a></p>
	<h1>Formula sheet</h1>
	<p class="lead">
		Every formula this tool uses, in the order the tool applies them: what makes a loop oscillate at
		all, then where each topology gets its phase and what that costs in gain, then the component
		values, then the amplitude stabilization, then whether the op-amp can keep up. Each one is
		derived from the one before it.
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
				amplitude has arrived.
			</p>
			<Equation tex={`A_{start} = (1 + \\epsilon)\\,A_{required}, \\qquad \\epsilon \\approx 0.05 \\ \\text{(5 percent)}`} />
			<p class="note">
				<strong>How to use:</strong> the excess is what guarantees start-up over part tolerance and
				temperature; the nonlinearity that removes it again is what sets the distortion, and is the
				real design problem in an oscillator. Section 6 is where that happens.
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
				last shunt element be a resistor, which is the point of the next block.
			</p>
		</div>

		<div class="formula">
			<h3>Buffered: the sections multiply</h3>
			<p class="note">
				A unity-gain follower after each section stops it from loading the one before, so the
				sections really are independent and the ladder transfer is the product of n identical ones.
				Each contributes a magnitude of cos(180/n) at the phase-correct frequency.
			</p>
			<Equation tex={`|\\beta| = \\left[\\cos\\!\\left(\\dfrac{180^\\circ}{n}\\right)\\right]^{n} \\ \\Rightarrow\\ A = \\dfrac{1}{|\\beta|}`} />
			<Equation tex={`n = 3:\\ \\omega_0 RC = \\sqrt{3},\\ A = 8 \\qquad n = 4 \\ (\\text{Bubba}):\\ \\omega_0 RC = 1,\\ A = 4`} />
			<p class="note">
				<strong>How to use:</strong> three buffered sections cost four op-amps for a gain of 8; four
				cost the same four op-amps for a gain of 4, better frequency stability and quadrature taps,
				which is why the Bubba is the better of the two buffered versions.
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
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">5</span>
			<h2>From frequency to components</h2>
		</div>

		<div class="formula">
			<h3>One constant per topology</h3>
			<p class="note">
				Every topology above ends with the same shape of answer: a dimensionless constant k = omega_0
				RC that the network fixes, and a required gain. Writing the frequency with k in it makes all
				five the same calculation.
			</p>
			<Equation tex={`f_0 = \\dfrac{k}{2\\pi RC}, \\qquad k = \\begin{cases} 1 & \\text{Wien, quadrature} \\\\ 1/\\sqrt{6} & \\text{3 sections, unbuffered} \\\\ \\sqrt{3} & \\text{3 sections, buffered} \\\\ 1 & \\text{4 sections, Bubba} \\end{cases}`} />
		</div>

		<div class="formula">
			<h3>Picking C, then solving for R</h3>
			<p class="note">
				Capacitors come in far fewer values than resistors, so C is chosen first from whatever series
				is stocked and R is solved from it, then rounded to the nearest available resistor. Every
				candidate capacitor is tried and the pair scored, with the frequency error that the rounding
				leaves weighted far above how comfortable R is to buy.
			</p>
			<Equation tex={`R_{target} = \\dfrac{k}{2\\pi f_0 C}, \\qquad 1\\,\\text{k} < R_{target} < 1\\,\\text{M}, \\qquad 100\\,\\text{pF} \\le C \\le 1\\,\\mu\\text{F}`} />
			<Equation tex={`\\text{score} = 100\\ln^2\\!\\left(\\dfrac{R}{R_{target}}\\right) + 0.05\\ln^2\\!\\left(\\dfrac{R}{10\\,\\text{k}}\\right) \\ \\rightarrow\\ \\text{minimize}`} />
			<Equation tex={`f_0' = \\dfrac{k}{2\\pi RC}, \\qquad \\text{error} = \\dfrac{f_0'}{f_0} - 1`} />
			<p class="note">
				<strong>How to use:</strong> the two logarithms are ratios, so the score does not care about
				absolute size, and the factor of 2000 between them means a comfortable R is only ever a
				tie-breaker. The realized f_0' is what the circuit will actually run at, not the target.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">6</span>
			<h2>Amplitude stabilization</h2>
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
			<h3>Diode limiting on a non-inverting stage (Wien bridge)</h3>
			<p class="note">
				Two diodes back to back across the upper part R_f2 of a split feedback resistor. While the
				voltage across R_f2 is under a diode drop they are open circuits; once the output is large
				enough to push them into conduction they shunt R_f2 away and the gain falls. At the balance
				point the gain is 3, so the voltage across the whole feedback resistor is two thirds of the
				output, and R_f2 sees that in proportion.
			</p>
			<Equation tex={`V_{R_{f2}} = \\dfrac{2 V_{out}}{3} \\cdot \\dfrac{R_{f2}}{R_{f1}+R_{f2}} = V_f \\ \\Rightarrow\\ V_{out} = \\dfrac{3\\,V_f\\,(R_{f1}+R_{f2})}{2\\,R_{f2}}`} />
			<Equation tex={`R_{f1} + R_{f2} = (A_{start}-1)R_g \\ \\Rightarrow\\ R_{f2} = \\dfrac{3\\,R_g\\,V_f}{V_{out}}, \\qquad R_{f1} = (A_{start}-1)R_g - R_{f2}`} />
			<Equation tex={`A_{start} = 1 + \\dfrac{R_{f1}+R_{f2}}{R_g}, \\qquad A_{limited} = 1 + \\dfrac{R_{f1}}{R_g}`} />
			<p class="note">
				<strong>How to use:</strong> size R_f2 for the amplitude wanted, give R_f1 the rest, then read
				the amplitude back off the rounded values with the first equation. Both gains must straddle 3.
			</p>
		</div>

		<div class="formula">
			<h3>Diode limiting on an inverting stage (every other topology)</h3>
			<p class="note">
				The inverting stage's minus input is a virtual ground, so the whole output voltage sits
				across R_f and the proportion is simpler. Diodes across the part R_f2 conduct when the
				voltage across it reaches a diode drop.
			</p>
			<Equation tex={`V_{R_{f2}} = V_{out}\\,\\dfrac{R_{f2}}{R_f} = V_f \\ \\Rightarrow\\ R_{f2} = \\dfrac{V_f R_f}{V_{out}}, \\qquad V_{out} = \\dfrac{V_f\\,R_f}{R_{f2}}`} />
			<Equation tex={`A_{start} = \\dfrac{R_f}{R_g}, \\qquad A_{limited} = \\dfrac{R_f - R_{f2}}{R_g}`} />
			<p class="note">
				<strong>How to use:</strong> R_f comes from the required gain times R_g times the excess, and
				R_f2 is capped at 0.8 R_f so the limited gain cannot go negative. This is the default in the
				tool for everything except the Wien bridge, because it is where those topologies set their
				loop gain anyway.
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
			<Equation tex={`A = 1 + \\dfrac{R_f}{R_{lamp}} = 3 \\ \\Rightarrow\\ R_{lamp,hot} = \\dfrac{R_f}{2}`} />
			<p class="note">
				<strong>How to use:</strong> pick R_f freely and the lamp settles at half of it. The catch is
				thermal: the amplitude drifts with room temperature, the loop takes about a second to settle
				and can overshoot on switch-on, and at frequencies low enough that one cycle is not short
				next to the filament time constant the resistance follows the waveform itself and distortion
				climbs. Lamps of a suitable rating are also no longer easy to buy.
			</p>
		</div>

		<div class="formula">
			<h3>JFET automatic gain control</h3>
			<p class="note">
				A JFET with a small drain-source voltage is a resistor whose value the gate sets. A peak
				detector that makes the gate more negative as the output grows closes the channel, raises
				the lower feedback leg and lowers the gain. Nothing in the signal path ever clips, so this
				measures under 0.2 percent while using only parts that are still sold.
			</p>
			<Equation tex={`A = 1 + \\dfrac{R_f}{R_{g1} \\parallel (R_{g2} + r_{DS})}: \\quad r_{DS} \\ \\text{small at switch-on} \\Rightarrow A > 3, \\quad r_{DS} \\ \\text{large at balance} \\Rightarrow A = 3`} />
			<Equation tex={`\\tau = R_{det}C_{det} = \\dfrac{N}{2\\pi f_0}, \\qquad N \\approx 50 \\ \\text{cycles}`} />
			<p class="note">
				<strong>How to use:</strong> the detector has to average over many cycles, or the gate follows
				the waveform and modulates the gain within each cycle, which is distortion of exactly the
				kind this was meant to avoid. Fifty cycles is the usual compromise: long enough not to follow
				the waveform, short enough that the amplitude settles in a reasonable time.
			</p>
		</div>

		<div class="formula">
			<h3>Start-up frequency is not the settled frequency</h3>
			<p class="note">
				While the amplitude is still building, the limiter has not engaged, so the loop is running
				with its full excess gain and its poles sit off the imaginary axis. An oscillation growing
				that way does not run at f_0. The frequency arrives at f_0 only once the limiter has brought
				the loop gain back to 1.
			</p>
			<Equation tex={`\\text{quadrature: } |A\\beta| \\propto f^{2} \\ \\Rightarrow\\ \\dfrac{f_{start}}{f_0} = \\sqrt{1+\\epsilon} \\approx 1 + \\dfrac{\\epsilon}{2}`} />
			<p class="note">
				<strong>How to use:</strong> read the frequency at the end of a transient run, not at the
				start. With 5 percent excess gain the quadrature loop begins about 2.5 percent high, which is
				larger than the component rounding error and easy to mistake for a design mistake.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">7</span>
			<h2>Whether the op-amp can keep up</h2>
		</div>

		<div class="formula">
			<h3>Closed-loop bandwidth</h3>
			<p class="note">
				An oscillator asks its amplifier for a specific gain at a specific frequency, and a
				single-pole op-amp can only deliver a gain of A up to GBW / A. Above that it delivers less
				gain, and not quite in phase either.
			</p>
			<Equation tex={`f_{-3dB} = \\dfrac{GBW}{A}`} />
		</div>

		<div class="formula">
			<h3>The rule of thumb, and the ceiling it sets</h3>
			<p class="note">
				The phase error is what bites, not the gain error. The loop oscillates where the total phase
				is zero, so any phase the amplifier adds is phase the network no longer has to supply, and
				the frequency shifts until the books balance. Keeping the amplifier an order of magnitude
				faster than the oscillation keeps that shift small.
			</p>
			<Equation tex={`\\dfrac{f_0\\,A}{GBW} \\le 0.1 \\qquad \\Longleftrightarrow \\qquad f_{0,max} = \\dfrac{0.1\\,GBW}{A}`} />
			<p class="note">
				<strong>How to use:</strong> this is where the gain each topology demands turns into a real
				limit. With a 3 MHz part, the Wien bridge's gain of 3 allows 100 kHz and the unbuffered
				phase-shift ladder's gain of 29 allows only 10 kHz, from the same op-amp. It is the strongest
				single argument for the Wien bridge.
			</p>
		</div>

		<div class="formula">
			<h3>Slew rate and output swing</h3>
			<p class="note">
				The gain-bandwidth limit bites at any amplitude; slew rate bites only at large ones. A sine
				of amplitude V_pk at f_0 is steepest as it crosses zero, and that slope is what the output
				stage has to follow.
			</p>
			<Equation tex={`\\left.\\dfrac{dV}{dt}\\right|_{max} = 2\\pi f_0 V_{pk} \\ \\le \\ \\dfrac{SR}{2}, \\qquad V_{pk} \\le V_{swing}`} />
			<p class="note">
				<strong>How to use:</strong> half the datasheet slew rate, not all of it, because the
				datasheet figure is measured on a large step and a sine that needs the full rate is already
				visibly distorted. Both this and the swing limit are amplitude limits, so lowering the
				amplitude fixes them where a faster part would be needed for the bandwidth limit.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">8</span>
			<h2>Distortion and output taps</h2>
		</div>

		<div class="formula">
			<h3>Measured distortion, not calculated</h3>
			<p class="note">
				Distortion here comes from the limiter bending the waveform, which no closed form captures
				usefully. The figures the tool reports are the ones SLOA060 measured on built circuits:
				0.46 percent for the unbuffered phase shift, 1.2 percent buffered, 1.1 percent for the
				Bubba, 0.85 percent for the quadrature loop, and for the Wien bridge whatever its stabilizer
				gives: about 1 percent with diodes, under 0.2 percent with a JFET AGC, under 0.1 percent with
				a lamp.
			</p>
			<p class="note">
				<strong>How to use:</strong> only the Wien bridge's distortion can genuinely be driven down,
				because its amplitude control sits in a leg of its own rather than inside the signal path.
				The others limit where the signal is and sit near one percent whatever is done to them.
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
				<strong>How to use:</strong> the Bubba's cosine tap measures 0.1 percent against 1.1 at its
				sine output, and the quadrature loop's cosine output 0.46 against 0.85, for the same reason.
				When distortion matters more than amplitude, take the later tap and make up the level with a
				fixed gain stage after it.
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
