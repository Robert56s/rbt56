import { formatFarads, formatHz, formatOhms, formatVolts } from '../modulation/format';
import { DIODES, JFETS } from './limiter';

/**
 * "Show the math" content for the sine-wave oscillators, same p()/eq()
 * block format as the other tools: plain words first, then the equation,
 * then this design's own numbers.
 */

const n1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const n3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '-');
const pct = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(100 * x).toFixed(d)}\\%` : '-');
const pctText = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(100 * x).toFixed(d)} percent` : '-');

function p(text) {
	return { type: 'p', text };
}
function eq(tex) {
	return { type: 'eq', tex };
}

/** What makes a loop oscillate at all, and why an oscillator needs two contradictory things. */
export function explainBarkhausen(design) {
	const { requiredGain, idealGain, startGain, f0, kind } = design;
	const blocks = [
		p(
			'An oscillator is an amplifier whose output is fed back to its own input through a network, arranged so that the signal comes back exactly in step with itself and exactly as large. There is no input: whatever noise is already there at that frequency goes round the loop, arrives back in phase, and grows.'
		),
		p('Write A for the amplifier gain and beta for what survives the trip back. Going once round the loop multiplies the signal by A times beta, so the two conditions are:'),
		eq('A\\,\\beta = 1 \\quad\\Longleftrightarrow\\quad |A\\,\\beta| = 1 \\ \\text{ and } \\ \\angle(A\\beta) = 0^\\circ \\ (\\text{mod } 360^\\circ)'),
		p(
			'The phase condition is what picks the frequency: only at one frequency does the network turn the signal by the right amount. The magnitude condition then says how much gain the amplifier must supply to make up exactly what the network lost there. Both come from the same network, which is why the two cannot be chosen separately.'
		)
	];
	if (kind === 'quadrature') {
		blocks.push(
			eq(`\\text{here } A = 1 \\ \\text{ at } f_0 = ${formatHz(f0)}`),
			p(
				'A two-integrator loop is the odd one out: its gain condition is met by construction, and raising the gain would only raise its frequency, not start it. What starts it is a small deliberate negative damping, and what stops it is damping that grows with amplitude; both are in section 03.'
			)
		);
		return blocks;
	}
	blocks.push(
		eq(`\\text{here } \\beta(f_0) = \\dfrac{1}{${n2(requiredGain)}} \\ \\text{ at } f_0 = ${formatHz(f0)} \\ \\Rightarrow\\ A = ${n2(requiredGain)}${Math.abs(requiredGain - idealGain) > 0.005 ? ` \\quad (\\text{textbook } ${n2(idealGain)}\\text{: the op-amp's lag moves the balance point, section 04})` : ''}`),
		p(
			`A gain of exactly ${n2(requiredGain)} is a knife edge: a hair under and any oscillation dies away, a hair over and it grows until something stops it. Nothing in a real circuit sits on a knife edge, so the amplifier is deliberately set a little high, here ${n2(startGain)} with the parts chosen, and a nonlinearity is added to pull the gain back down once the amplitude is where it should be. That nonlinearity is what sets the distortion, and it is the real design problem in an oscillator.`
		)
	);
	return blocks;
}

/** Where this topology's phase comes from, and what it costs in gain. */
export function explainTopology(design) {
	const { topology, topo, r, c, rg, f0, frequency, f0Error, requiredGain, fIdeal, retunePercent } = design;
	const blocks = [];

	if (topology === 'wien') {
		blocks.push(
			p(
				'The Wien network is a resistor and capacitor in series feeding a resistor and capacitor in parallel to ground. The series arm blocks low frequencies and the parallel arm shorts high ones, so what gets through peaks somewhere in between, and only at that peak is the output exactly in phase with the input.'
			),
			eq('\\beta(s) = \\dfrac{Z_p}{Z_s + Z_p}, \\qquad Z_s = R + \\dfrac{1}{sC}, \\qquad Z_p = \\dfrac{R}{1 + sRC}'),
			p('Substituting and collecting, with s = j omega:'),
			eq('\\beta(j\\omega) = \\dfrac{1}{3 + j\\left(\\omega RC - \\dfrac{1}{\\omega RC}\\right)}'),
			p(
				'The imaginary part vanishes when omega RC = 1, and there the whole thing is a real 1/3: the network passes a third of the signal with no phase shift at all. That is the entire design.'
			),
			eq('\\omega_0 = \\dfrac{1}{RC}, \\qquad f_0 = \\dfrac{1}{2\\pi RC}, \\qquad \\beta(f_0) = \\dfrac{1}{3} \\ \\Rightarrow\\ A = 3'),
			p(
				'A gain of 3 is the smallest of any of these topologies, which matters more than it looks: the amplifier only has to be three times faster than the oscillation, where a phase-shift ladder would need it twenty-nine times faster. A non-inverting amplifier of gain 3 means the feedback resistor is twice the lower one.'
			),
			eq('A = 1 + \\dfrac{R_f}{R_g} = 3 \\ \\Rightarrow\\ R_f = 2\\,R_g')
		);
	} else if (topology === 'quadrature') {
		blocks.push(
			p(
				'An integrator turns a sine into a negative cosine: it delays it by exactly a quarter cycle, at every frequency. Put two in a loop and the signal comes back half a cycle late, which is a sign flip; an inverter flips it again and the loop is closed in phase. The frequency is then set by where the two integrators together have a gain of exactly 1.'
			),
			eq('\\text{integrator: } \\dfrac{V_{out}}{V_{in}} = -\\dfrac{1}{sRC} \\ \\Rightarrow\\ \\text{two of them: } \\dfrac{1}{(sRC)^2} = -\\dfrac{1}{(\\omega RC)^2} \\ \\text{ at } s = j\\omega'),
			p('The inverter contributes its own minus sign and a gain of 1, so the loop gain is real and positive, and equals 1 when:'),
			eq('\\dfrac{1}{(\\omega_0 RC)^2} = 1 \\ \\Rightarrow\\ \\omega_0 = \\dfrac{1}{RC}, \\qquad f_0 = \\dfrac{1}{2\\pi RC}, \\qquad A = 1'),
			p(
				'Because the two integrator outputs are a quarter cycle apart by construction, this circuit hands out a sine and a cosine of the same amplitude for free, which no amount of trimming will give from a single-output oscillator. It is the same two-integrator loop as a Tow-Thomas filter, with the damping resistor taken out so the poles sit exactly on the axis instead of just inside it.'
			),
			p(
				'That exactness has a consequence worth knowing before building one: with the inverter at any gain g, the poles are at s = plus or minus j times the square root of g over RC, still on the axis. Extra gain does not make the amplitude grow; it only raises the frequency by the square root of g. Starting and stopping a quadrature oscillator is a matter of damping, not gain, which is what section 03 is about.'
			),
			eq('(sRC)^2 + g = 0 \\ \\Rightarrow\\ s = \\pm j\\,\\dfrac{\\sqrt{g}}{RC}: \\ \\text{purely imaginary for any } g')
		);
	} else {
		const n = topo.ladder.sections;
		const perSection = 180 / n;
		blocks.push(
			p(
				`An inverting amplifier already turns the signal by 180 degrees, so the network only has to supply another 180 for the loop to close in phase. A single RC section can approach 90 degrees but never reach it, so at least three are needed; here there are ${n}, each contributing ${perSection} degrees at the oscillation frequency.`
			),
			eq(`\\text{one high-pass section: } \\dfrac{j\\omega RC}{1 + j\\omega RC}, \\qquad \\angle = 90^\\circ - \\arctan(\\omega RC) = ${perSection}^\\circ \\ \\Rightarrow\\ \\omega RC = \\tan(${90 - perSection}^\\circ)`),
			p(
				topo.ladder.buffered
					? 'A unity-gain buffer after each section stops it from loading the one before, so the sections really do behave independently and each one just multiplies its own transfer:'
					: 'Without buffers the sections load each other, and the ladder has to be solved as one network rather than as a product of three transfers. The tool does exactly that, numerically, which is why the numbers below are the real ones and not the ones the quick per-section formula gives.'
			),
			eq(
				topo.ladder.buffered
					? `|\\beta| = \\left(\\cos ${perSection}^\\circ\\right)^{${n}} = \\dfrac{1}{${n2(topo.gain)}} \\ \\Rightarrow\\ A = ${n2(topo.gain)}`
					: `\\text{solving the loaded ladder: } \\omega_0 RC = ${n3(topo.k)} = \\dfrac{1}{\\sqrt{6}}, \\qquad \\beta(f_0) = -\\dfrac{1}{${n2(topo.gain)}} \\ \\Rightarrow\\ A = ${n2(topo.gain)}`
			),
			eq(`f_0 = \\dfrac{${n3(topo.k)}}{2\\pi RC}, \\qquad A = \\dfrac{R_f}{R_g} = ${n2(topo.gain)}`),
			p(
				`One detail that is easy to get wrong: the last shunt resistor of the ladder is the amplifier's own input resistor R_g, and its far end is the virtual ground. That is why the ladder is not loaded by anything beyond itself, and why R_g is not a free choice here: R_g = R = ${formatOhms(rg)}. Hanging a separate R_g on the end instead would load the last section and push the gain needed from ${n2(topo.gain)} to nearly 40.`
			)
		);
		if (topology === 'bubba') {
			blocks.push(
				p(
					'Spreading the phase over four sections instead of three has a second effect worth the extra op-amp: the loop phase then changes faster with frequency, so a given drift in phase moves the frequency less. That is what makes this the most frequency-stable of the group. And because the sections are 45 degrees apart, taking a tap every other one gives outputs 90 degrees apart.'
				)
			);
		}
	}

	blocks.push(
		p(
			`Solving for the parts: C is picked from a preferred series so that R lands in a comfortable range and the rounding costs as little frequency as possible. The product R C is not the textbook one, though: the op-amp's own lag (section 04) would put the loop's zero-phase frequency ${pctText(design.uncompensatedError)} off, so R C is retuned by ${pctText(retunePercent)} first and the parts are chosen for that.`
		),
		eq(
			`RC_{textbook} = \\dfrac{${n3(topo.k)}}{2\\pi \\times ${formatHz(frequency)}} \\ \\rightarrow\\ RC = ${(1 + retunePercent).toFixed(4)} \\times RC_{textbook} \\ \\Rightarrow\\ R = \\dfrac{RC}{C} = ${formatOhms(design.rTarget)} \\rightarrow ${formatOhms(r)}, \\quad C = ${formatFarads(c)}`
		),
		eq(`\\text{these parts alone would give } \\dfrac{${n3(topo.k)}}{2\\pi RC} = ${formatHz(fIdeal)}\\text{; with the op-amp in the loop, } f_0 = ${formatHz(f0)} \\quad (${pct(f0Error, 2)} \\text{ from the target})`)
	);
	if (topology !== 'quadrature' && Math.abs(requiredGain - topo.gain) > 0.005) {
		blocks.push(p(`At that point the network attenuates a little differently from its textbook figure, so the gain the loop needs is ${n2(requiredGain)} rather than ${n2(topo.gain)}; the parts in section 03 are sized for that.`));
	}
	return blocks;
}

/** Why the amplitude has to be held, and what this design holds it with. */
export function explainStabilizer(design) {
	const { limiter, requiredGain, startGain, amplitude, thd, kind, rg, r, c, f0 } = design;
	const diode = DIODES[design.diode] ?? DIODES['1N4148'];
	const blocks = [];

	if (kind === 'quadrature') {
		const { rn, rho, rd1, rd2, growthPerCycle, amplitudeActual, gTarget } = limiter;
		blocks.push(
			p(
				'Gain compression cannot hold this loop, so its amplitude control is built from damping. A resistor Rn from the inverter output into the second integrator input puts a conductance across that integrator\'s capacitor whose sign is negative, because the inverter output is minus the integrator output: the poles move into the right half plane and the amplitude grows. Writing the characteristic equation with it:'
			),
			eq('(sRC)^2 - \\dfrac{R}{R_n}\\,(sRC) + 1 = 0 \\ \\Rightarrow\\ \\sigma = \\dfrac{1}{2 R_n C}, \\qquad \\text{growth per cycle} = e^{\\pi R / R_n} - 1'),
			eq(`R_n = ${formatOhms(rn)} = ${n1(1 / rho)}\\,R \\ \\Rightarrow\\ e^{\\pi / ${n1(1 / rho)}} - 1 = ${pct(growthPerCycle)} \\ \\text{ per cycle (with the op-amps' own lag included)}`),
			p(
				'What stops it is a positive conductance in the same place that only appears above a threshold: a divider from the cosine output brings the signal down, and anti-parallel diodes from the divider tap into the integrator input conduct once the tap reaches a diode drop. Averaged over a cycle, the current they draw is a conductance G that rises steeply with amplitude, and the amplitude parks where it cancels Rn together with the small extra growth the op-amps\' lag contributes:'
			),
			eq(`G_{clamp}(A) = \\dfrac{1}{R_n} + 2\\,\\sigma_{lag}\\,C = ${gTarget.toExponential(2)}\\ \\text{S}`),
			eq(`R_{d1} = ${formatOhms(rd1)}, \\quad R_{d2} = ${formatOhms(rd2)} \\ \\Rightarrow\\ \\text{threshold near } ${n2(0.4 * (rd1 + rd2) / rd2)}\\ \\text{V, parks at about } ${formatVolts(amplitudeActual ?? NaN)}\\ \\text{peak (wanted } ${formatVolts(amplitude)})`),
			p(
				`The conductance is a describing function: the fundamental component of the clamp current for a sinusoid of amplitude A, divided by A, computed with the diode's real exponential curve (${diode.label}). Because the clamp's threshold is a resistor ratio and a diode drop, the amplitude does not hang on the exact value of Rn or on part tolerances, which a plain series resistor would make it do. And because the clamp current is integrated before it reaches either output, its harmonics arrive divided by their order: about ${(100 * thd).toFixed(2)} percent of distortion at the sine output, less at the cosine.`
			)
		);
		return blocks;
	}

	blocks.push(
		p(
			`Left alone, an amplifier set above the gain the loop needs makes the amplitude grow until the op-amp runs into its supply rails. It then clips, which is a gain of less than 1 for the peaks, so the circuit does settle: it settles into a rounded square wave. TI measured 2.8 percent distortion on a Wien bridge doing exactly that. Something gentler has to take the gain down from ${n2(startGain)} to ${n2(requiredGain)} before the rails do.`
		)
	);

	if (limiter.kind === 'lamp') {
		blocks.push(
			p(
				`A small filament lamp in the lower feedback leg does it with heat. Its resistance rises as more current warms the filament, so a larger output means a larger R_g, and A = 1 + R_f / R_g comes down. Nothing clips and nothing has a kink in it, which is why this is the cleanest of the three: TI measured under 0.1 percent.`
			),
			eq(`A = 1 + \\dfrac{R_f}{R_{lamp}} = ${n2(requiredGain)} \\ \\Rightarrow\\ R_{lamp} = \\dfrac{R_f}{${n2(requiredGain - 1)}} = ${formatOhms(limiter.rHot)} \\ \\text{ once hot, with } ${formatVolts(amplitude / requiredGain)} \\text{ peak across it}`),
			p(
				'The amplitude is whatever output makes the lamp that hot: the design cannot set it, only state what the lamp must do. The LTspice file carries a lamp that does exactly that, so the simulation is meaningful: its resistance rises with a temperature that the dissipated power drives into a thermal capacitance and that leaks away through a thermal resistance.'
			),
			eq(`R = R_{cold}\\,(1 + \\alpha\\,\\theta), \\qquad C_{th}\\,\\dfrac{d\\theta}{dt} = \\dfrac{V^2}{R} - \\dfrac{\\theta}{R_{th}}, \\qquad R_{cold} = \\dfrac{R_{hot}}{3} = ${formatOhms(limiter.rCold)}`),
			eq(`\\theta_{hot} = \\dfrac{2}{\\alpha} = ${n1(limiter.thetaHot)}\\ \\text{K}, \\quad P_{hot} = \\dfrac{(A/${n2(requiredGain)})^2}{2 R_{hot}} = ${(1e6 * limiter.pHot).toFixed(1)}\\ \\mu\\text{W}, \\quad R_{th} = \\dfrac{\\theta_{hot}}{P_{hot}}, \\quad C_{th} = \\dfrac{\\tau}{R_{th}}, \\ \\tau = ${(1000 * limiter.tau).toFixed(1)}\\ \\text{ms}`),
			p(
				'The catch on a bench is that the control is thermal. The amplitude drifts with room temperature, the loop takes a second or so to settle and can overshoot on switch-on, and at low frequencies (where a cycle is not short next to the filament time constant) the resistance follows the waveform itself and distortion climbs. Lamps of a suitable rating are also no longer easy to buy.'
			)
		);
		return blocks;
	}

	if (limiter.kind === 'jfet') {
		const jfet = JFETS[design.jfet] ?? JFETS.generic;
		if (!limiter.regulates) {
			blocks.push(
				p(
					`A JFET operated with a small drain-source voltage is a resistor whose value the gate sets: r = 1 / (2 beta (V_GS - V_P)). To close the channel enough to hold the gain at balance, the gate needs a definite negative voltage, and the only voltage available is the detector's, which is the output's negative peak less a diode drop. With V_P = ${n1(jfet.vto)} V this JFET needs at least ${formatVolts(limiter.minAmplitude)} of output to be controlled at all; ${formatVolts(amplitude)} is not enough.`
				),
				eq(`r_{DS} = \\dfrac{1}{2\\beta\\,(V_{GS} - V_P)}, \\qquad V_{GS,available} = -\\dfrac{A - V_f}{2} \\ \\text{(after the averaging resistors)}`)
			);
			return blocks;
		}
		blocks.push(
			p(
				'A JFET in the lower feedback leg does it electrically. Operated with a small drain-source voltage the channel is a resistor whose value the gate sets, in series with a fixed resistor: closing the channel raises the leg and lowers the gain, all the way to 1 when it is pinched off, and opening it takes the gain above balance so the loop starts.'
			),
			eq(`r_{DS} = \\dfrac{1}{2\\beta\\,(V_{GS} - V_P)}, \\qquad A = 1 + \\dfrac{R_f}{R_{ser} + r_{DS}}`),
			eq(`\\text{at balance: } R_{ser} + r_{DS} = \\dfrac{R_f}{${n2(requiredGain - 1)}} = ${formatOhms(limiter.rf / (requiredGain - 1))}, \\quad r_{DS} = ${formatOhms(limiter.rBalance)} \\ \\Rightarrow\\ V_{GS} = ${n2(limiter.vgsNeeded)}\\ \\text{V}`),
			p(
				'The channel is kept small next to the series resistor so it sees only a fraction of the leg voltage, and two equal resistors average the drain voltage with the control voltage into the gate. That last trick cancels the channel\'s square-law term exactly, because the term in V_DS squared drops out when the gate follows half of V_DS, so the channel is a genuinely linear resistor set by the control voltage alone:'
			),
			eq('I_D = 2\\beta\\left[(V_{GS} - V_P)V_{DS} - \\dfrac{V_{DS}^2}{2}\\right], \\qquad V_{GS} = \\dfrac{V_c + V_{DS}}{2} \\ \\Rightarrow\\ I_D = 2\\beta\\left(\\dfrac{V_c}{2} - V_P\\right)V_{DS}'),
			p(
				`The control voltage comes from a peak detector: a diode charges Cdet to the output's negative peak, a divider Ra Rb scales it to what the gate needs, and the same divider bleeds the capacitor slowly. Here it delivers ${n2(-limiter.vPeak)} V at the peak node for a ${formatVolts(amplitude)} output and the divider passes ${(100 * limiter.rb / (limiter.ra + limiter.rb)).toFixed(0)} percent of it; the loop settles where the gain is exactly ${n2(requiredGain)}, which the rounded parts put at about ${formatVolts(limiter.amplitudeActual ?? NaN)} peak.`
			),
			eq(`\\tau_{det} = (R_a + R_b)\\,C_{det} = ${(1000 * limiter.tau).toFixed(1)}\\ \\text{ms} = ${Math.round(limiter.cyclesPerTau)} \\text{ cycles at } ${formatHz(f0)}`),
			p(
				'The detector has to average over many cycles, or the gate follows the waveform and modulates the gain within each cycle, which is distortion of exactly the kind this was meant to avoid. Fifty cycles is the usual compromise: long enough not to follow the waveform, short enough that the amplitude settles in a reasonable time. Nothing in the signal path ever clips, and TI measured under 0.2 percent.'
			)
		);
		return blocks;
	}

	// diodes across part of the feedback resistor
	const fraction = design.topology === 'wien' ? (requiredGain - 1) / requiredGain : 1;
	const rt = design.topology === 'wien' ? (requiredGain - 1) * rg : requiredGain * rg;
	blocks.push(
		p(
			'Two diodes back to back across part of the feedback resistor do it with a threshold. While the voltage across that part is under a diode drop they are open circuits and the gain is the high one; once the output is large enough to push them into conduction they shunt that part away and the gain falls below what the loop needs. The amplitude parks itself where the two balance.'
		),
		design.topology === 'wien'
			? eq(`V_{R_{f2}} = \\dfrac{${n2(requiredGain - 1)}\\,V_{out}}{${n2(requiredGain)}} \\cdot \\dfrac{R_{f2}}{R_{f1}+R_{f2}}, \\qquad A_{start} = 1 + \\dfrac{R_{f1}+R_{f2}}{R_g} = ${n2(limiter.gainStart)}, \\quad A_{limited} = 1 + \\dfrac{R_{f1}}{R_g} = ${n2(limiter.gainLimited)}`)
			: eq(`V_{R_{f2}} = V_{out}\\,\\dfrac{R_{f2}}{R_{f1}+R_{f2}}, \\qquad A_{start} = \\dfrac{R_{f1}+R_{f2}}{R_g} = ${n2(limiter.gainStart)}, \\quad A_{limited} = \\dfrac{R_{f1}}{R_g} = ${n2(limiter.gainLimited)}`),
		p(
			`A diode is not a switch at 0.6 V, though, and at the tens of microamps a limiter runs it the difference matters: a ${diode.label.split(' (')[0]} drops 0.48 V at 100 uA and 0.38 V at 10 uA. So the parts are sized from the diode's real curve. For a sinusoid of amplitude V across the pair, the current it draws averages to a conductance (its describing function), and the amplitude the loop settles at is the one where that conductance brings the effective feedback down to exactly what balance needs:`
		),
		eq(`i(v) = I_s\\left(e^{v/nV_T} - e^{-v/nV_T}\\right), \\qquad G(V) = \\dfrac{1}{\\pi V}\\int_0^{2\\pi} i(V\\sin\\theta)\\,\\sin\\theta\\,d\\theta`),
		eq(`\\dfrac{1}{R_{f2}} + G(V_2) = \\dfrac{1}{R_t - R_{f1}}, \\qquad R_t = ${formatOhms(rt)} \\text{ (the feedback string at balance)}, \\quad V_2 = ${n3(fraction)}\\,V_{out}\\,\\dfrac{R_t - R_{f1}}{R_t}`),
		eq(
			`R_{f1} = ${formatOhms(limiter.rf1)}, \\ R_{f2} = ${formatOhms(limiter.rf2)} \\ \\Rightarrow\\ V_{out} \\approx ${formatVolts(limiter.amplitudeActual ?? NaN)} \\ \\text{peak} \\quad (\\text{wanted } ${formatVolts(amplitude)}; \\ I_s = ${diode.Is.toExponential(2)}\\ \\text{A}, \\ n = ${n2(diode.N)})`
		),
		p(
			`The pair of values is picked among the stock neighbours of the exact solution so that the amplitude lands closest while the start gain stays above balance, since rounding both resistors independently can move the amplitude by twenty percent. The gain has to straddle ${n2(requiredGain)}: ${n2(limiter.gainStart)} before the diodes conduct, ${n2(limiter.gainLimited)} with them fully on${limiter.regulates ? ', and it does' : ', and it does NOT, so the output would clip on the rails'}.`
		),
		p(
			`The diodes do not switch cleanly, they bend: the gain starts dropping before the peak and keeps dropping through it, which rounds the tips of the sine slightly. The harder they have to work, the more they bend it, so the distortion follows the excess loop gain they must absorb: about ${pctText(design.loopExcess)} here, worth around ${(100 * thd).toFixed(2)} percent of third harmonic in LTspice runs of this circuit. Two diodes and one resistor buy that; a lamp or a JFET does better only because its control sits outside the signal path.`
		),
		p(
			`One thing to expect when simulating: the frequency is read off the settled waveform, and a diode-limited loop settles a hair below the zero-phase frequency of its start gain, because the diodes' conduction near the peaks adds a little lag of its own. The export starts the run at the design amplitude so the limiter only has to hold it, and its log reports the realized frequency next to the .four distortion.`
		)
	);
	return blocks;
}

/** What the op-amp's own lag does to the loop, and how the design absorbs it. */
export function explainOpampLimit(design) {
	const { opamp, f0, startGain, topo, amplitude, kind, requiredGain, idealGain, uncompensatedError, retunePercent, fUncompensated, growthPerCycle, loopExcess } = design;
	const wt = 2 * Math.PI * opamp.gbw;
	const lagRad = (opamp.lagDeg * Math.PI) / 180;
	const blocks = [
		p(
			`A real op-amp is a single pole: its open-loop gain is A(s) = 2 pi GBW / s, so a stage built on it with noise gain N has a closed-loop pole at GBW / N and lags by atan(f N / GBW) at frequency f. Ask for gain ${n2(startGain)} at ${formatHz(f0)} from a part with a gain-bandwidth of ${formatHz(opamp.gbw)} and what comes back is a little late.`
		),
		eq(`f_{-3dB} = \\dfrac{GBW}{N} = \\dfrac{${formatHz(opamp.gbw)}}{${n2(opamp.noiseGain)}} = ${formatHz(opamp.closedLoopBw)}, \\qquad \\phi = \\arctan\\dfrac{f_0 N}{GBW} = ${n1(opamp.lagDeg)}^\\circ`),
		p(
			'The lag is what matters, not the loss of gain. The loop oscillates where its total phase is zero, so any phase the amplifier adds is phase the network must now supply, and it does so by moving off its own zero-phase point: the frequency shifts, and the network attenuates a little differently there, so the gain needed shifts too. A closed form is only available for the Wien bridge; in the ladder oscillators the network is part of the amplifier\'s own input impedance, so the two cannot be separated and the loop is solved as one nodal system with the op-amp model inside it.'
		)
	];
	if (kind === 'wien') {
		const k = (f0 * opamp.noiseGain) / opamp.gbw;
		blocks.push(
			p('For the Wien bridge the phase condition with the lag included is a quadratic in x = omega RC, and the solution shows how quickly a small lag becomes a large frequency error, because the Wien network has a Q of only a third:'),
			eq(`\\dfrac{x - 1/x}{3} = -\\tan\\phi \\ \\Rightarrow\\ x = \\dfrac{-3k + \\sqrt{9k^2 + 4}}{2}, \\quad k = \\dfrac{f N}{GBW} = ${n3(k)} \\ \\Rightarrow\\ x = ${n3((-3 * k + Math.sqrt(9 * k * k + 4)) / 2)}`)
		);
	}
	blocks.push(
		p(
			`With the textbook R C values, this op-amp would put the loop's zero-phase frequency at ${formatHz(fUncompensated)}, ${pctText(uncompensatedError)} from the target. So the design solves the loop first and retunes R C by ${pctText(retunePercent)} before picking parts, and then solves it again with the rounded parts, the limiter diodes' junction capacitance across R_f2 included, to predict where the built circuit runs:`
		),
		eq(`f_{0,textbook\\ RC} = ${formatHz(fUncompensated)} \\ (${pct(uncompensatedError)}) \\quad\\rightarrow\\quad RC \\times ${(1 + retunePercent).toFixed(4)} \\quad\\rightarrow\\quad f_0 = ${formatHz(f0)} \\ (${pct(design.f0Error, 2)})`)
	);
	if (kind !== 'quadrature') {
		blocks.push(
			p(
				`The same solve gives the gain the loop needs at that point, ${n2(requiredGain)} against the textbook ${n2(idealGain)}, and, with the amplifier at its start gain, how much the loop returns per cycle: ${n2(1 + loopExcess)} times the signal, which is ${pctText(loopExcess)} of excess and a growth of ${pctText(growthPerCycle)} per cycle from a real pole solve. That growth is what a start-up transient looks like in LTspice.`
			)
		);
	} else {
		blocks.push(
			p(
				`For the quadrature loop the lag itself is a small negative damping (its poles sit exactly on the axis without it), which is why the designed start-up growth of ${pctText(growthPerCycle)} per cycle already includes it, and why the clamp is sized for both together.`
			)
		);
	}
	blocks.push(
		p(
			`Where this stops working: the single-pole picture, and the retune with it, is trustworthy while the lag stays modest. The tool marks the frequency at which the textbook values would land 10 percent low with this op-amp, ${Number.isFinite(opamp.fMax) ? formatHz(opamp.fMax) : 'beyond 1 GHz'} for this topology, as the point past which the part's spread in gain-bandwidth starts to matter as much as its nominal value. Slew rate is the other ceiling, and the one that bites at large amplitudes rather than small ones: a sine of ${formatVolts(amplitude)} peak at ${formatHz(f0)} has a steepest slope of 2 pi f0 times that amplitude.`
		),
		eq(
			`2\\pi f_0 V_{pk} = ${(opamp.slewNeeded / 1e6).toFixed(3)}\\ \\text{V/us} ${opamp.slewOk ? '\\le' : '>'} \\dfrac{SR}{2} = ${(opamp.slewRate / 2e6).toFixed(1)}\\ \\text{V/us}`
		)
	);
	if (topo.opamps > 1) {
		blocks.push(
			p(
				`This topology uses ${topo.opamps} op-amps${topo.opamps === 4 ? ', so a quad package covers it' : ''}. The buffers run at unity gain, where they have the full gain-bandwidth available, but their lag is in the loop too and the solve includes it.`
			)
		);
	}
	void wt;
	void lagRad;
	return blocks;
}
