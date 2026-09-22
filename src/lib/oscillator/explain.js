import { formatFarads, formatHz, formatOhms, formatVolts } from '../modulation/format';

/**
 * "Show the math" content for the sine-wave oscillators, same p()/eq()
 * block format as the other tools: plain words first, then the equation,
 * then this design's own numbers.
 */

const n1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const n3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '-');
const pct = (x) => `${(100 * x).toFixed(x < 0.005 ? 2 : 1)} %`;

function p(text) {
	return { type: 'p', text };
}
function eq(tex) {
	return { type: 'eq', tex };
}

/** What makes a loop oscillate at all, and why an oscillator needs two contradictory things. */
export function explainBarkhausen(design) {
	const { requiredGain, startGain, f0 } = design;
	return [
		p(
			'An oscillator is an amplifier whose output is fed back to its own input through a network, arranged so that the signal comes back exactly in step with itself and exactly as large. There is no input: whatever noise is already there at that frequency goes round the loop, arrives back in phase, and grows.'
		),
		p('Write A for the amplifier gain and beta for what survives the trip back. Going once round the loop multiplies the signal by A times beta, so the two conditions are:'),
		eq('A\\,\\beta = 1 \\quad\\Longleftrightarrow\\quad |A\\,\\beta| = 1 \\ \\text{ and } \\ \\angle(A\\beta) = 0^\\circ \\ (\\text{mod } 360^\\circ)'),
		p(
			'The phase condition is what picks the frequency: only at one frequency does the network turn the signal by the right amount. The magnitude condition then says how much gain the amplifier must supply to make up exactly what the network lost there. Both come from the same network, which is why the two cannot be chosen separately.'
		),
		eq(`\\text{here } \\beta(f_0) = \\dfrac{1}{${n2(requiredGain)}} \\ \\text{ at } f_0 = ${formatHz(f0)} \\ \\Rightarrow\\ A = ${n2(requiredGain)}`),
		p(
			`A gain of exactly ${n2(requiredGain)} is a knife edge: a hair under and any oscillation dies away, a hair over and it grows until something stops it. Nothing in a real circuit sits on a knife edge, so the amplifier is deliberately set a little high, here ${n2(startGain)}, and a nonlinearity is added to pull the gain back down to ${n2(requiredGain)} once the amplitude is where it should be. That nonlinearity is what sets the distortion, and it is the real design problem in an oscillator.`
		)
	];
}

/** Where this topology's phase comes from, and what it costs in gain. */
export function explainTopology(design) {
	const { topology, topo, r, c, rg, f0, frequency, f0Error, requiredGain } = design;
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
				'Because the two integrator outputs are a quarter cycle apart by construction, this circuit hands you a sine and a cosine of the same amplitude for free, which no amount of trimming will give you from a single-output oscillator. It is the same two-integrator loop as a Tow-Thomas filter, with the damping resistor taken out so the poles sit exactly on the axis instead of just inside it.'
			)
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
					? `|\\beta| = \\left(\\cos ${perSection}^\\circ\\right)^{${n}} = \\dfrac{1}{${n2(requiredGain)}} \\ \\Rightarrow\\ A = ${n2(requiredGain)}`
					: `\\text{solving the loaded ladder: } \\omega_0 RC = ${n3(topo.k)} = \\dfrac{1}{\\sqrt{6}}, \\qquad \\beta(f_0) = -\\dfrac{1}{${n2(requiredGain)}} \\ \\Rightarrow\\ A = ${n2(requiredGain)}`
			),
			eq(`f_0 = \\dfrac{${n3(topo.k)}}{2\\pi RC}, \\qquad A = \\dfrac{R_f}{R_g} = ${n2(requiredGain)}`),
			p(
				`One detail that is easy to get wrong: the last shunt resistor of the ladder is the amplifier's own input resistor R_g, and its far end is the virtual ground. That is why the ladder is not loaded by anything beyond itself, and why R_g is not a free choice here: R_g = R = ${formatOhms(rg)}. Hanging a separate R_g on the end instead would load the last section and push the gain needed from ${n2(requiredGain)} to nearly 40.`
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
		p(`Solving for the parts, with C picked from a preferred series so that R lands in a comfortable range and the rounding costs as little frequency as possible:`),
		eq(
			`R = \\dfrac{${n3(topo.k)}}{2\\pi f_0 C} = \\dfrac{${n3(topo.k)}}{2\\pi \\times ${formatHz(frequency)} \\times ${formatFarads(c)}} = ${formatOhms(design.rTarget)} \\rightarrow ${formatOhms(r)}`
		),
		eq(`f_0' = \\dfrac{${n3(topo.k)}}{2\\pi RC} = ${formatHz(f0)} \\quad (${f0Error >= 0 ? '+' : ''}${(100 * f0Error).toFixed(2)}\\% \\text{ from the target})`)
	);
	return blocks;
}

/** Why the amplitude has to be held, and what this design holds it with. */
export function explainStabilizer(design) {
	const { limiter, stabilizer, topology, requiredGain, startGain, amplitude, thd } = design;
	const blocks = [
		p(
			`Left alone, an amplifier set above the gain the loop needs makes the amplitude grow until the op-amp runs into its supply rails. It then clips, which is a gain of less than 1 for the peaks, so the circuit does settle: it settles into a rounded square wave. TI measured 2.8 percent distortion on a Wien bridge doing exactly that. Something gentler has to take the gain down from ${n2(startGain)} to ${n2(requiredGain)} before the rails do.`
		)
	];

	if (stabilizer === 'lamp') {
		blocks.push(
			p(
				`A small filament lamp in the lower feedback leg does it with heat. Its resistance rises as more current warms the filament, so a larger output means a larger R_g, and A = 1 + R_f / R_g comes down. Nothing clips and nothing has a kink in it, which is why this is the cleanest of the three: TI measured under 0.1 percent.`
			),
			eq(`A = 1 + \\dfrac{R_f}{R_{lamp}} = 3 \\ \\Rightarrow\\ R_{lamp} = \\dfrac{R_f}{2} = ${formatOhms(limiter.lampHot)} \\ \\text{ once hot}`),
			p(
				'The catch is that the control is thermal. The amplitude drifts with room temperature, the loop takes a second or so to settle and can overshoot on switch-on, and at low frequencies (where a cycle is not short next to the filament time constant) the resistance follows the waveform itself and distortion climbs. Lamps of a suitable rating are also no longer easy to buy.'
			)
		);
	} else if (stabilizer === 'jfet') {
		blocks.push(
			p(
				'A JFET in the lower feedback leg does it electrically. Operated with a small drain-source voltage the channel is a resistor whose value the gate sets, so a peak detector that makes the gate more negative as the output grows closes the channel, raises the lower leg and lowers the gain. Nothing in the signal path ever clips, and TI measured under 0.2 percent.'
			),
			eq(`A = 1 + \\dfrac{R_f}{R_{g1} \\parallel (R_{g2} + r_{DS})}: \\quad r_{DS} \\text{ small at switch-on gives } A > 3, \\quad r_{DS} \\text{ large at balance gives } A = 3`),
			p(
				`The detector has to average over many cycles, or the gate follows the waveform and modulates the gain within each cycle, which is distortion of exactly the kind this was meant to avoid. Here R_det C_det = ${(1000 * limiter.tau).toFixed(1)} ms, about ${Math.round(limiter.cyclesPerTau)} cycles at ${formatHz(design.f0)}, which is the usual compromise: long enough not to follow the waveform, short enough that the amplitude settles in a reasonable time.`
			)
		);
	} else {
		const rfTotal = topology === 'wien' ? design.parts.rf1 + design.parts.rf2 : limiter.rf;
		blocks.push(
			p(
				'Two diodes back to back across part of the feedback resistor do it with a threshold. While the voltage across that part is under a diode drop they are open circuits and the gain is the high one; once the output is large enough to push them into conduction they shunt that part away and the gain falls below what the loop needs. The amplitude parks itself where the two balance.'
			),
			topology === 'wien'
				? eq(
						`V_{R_{f2}} = \\dfrac{2 V_{out}}{3} \\cdot \\dfrac{R_{f2}}{R_{f1}+R_{f2}} = V_f \\ \\Rightarrow\\ V_{out} = \\dfrac{3\\,V_f\\,(R_{f1}+R_{f2})}{2\\,R_{f2}}`
					)
				: eq(`V_{R_{f2}} = V_{out}\\,\\dfrac{R_{f2}}{R_f} = V_f \\ \\Rightarrow\\ V_{out} = \\dfrac{V_f\\,R_f}{R_{f2}}`),
			p(`Choosing R_f2 for the amplitude wanted, and reading the result back off the rounded parts:`),
			eq(
				`R_{f2} = ${formatOhms(limiter.rf2Target)} \\rightarrow ${formatOhms(limiter.rf2)} \\ \\Rightarrow\\ V_{out} \\approx ${formatVolts(limiter.amplitudeActual)} \\ \\text{peak} \\quad (\\text{wanted } ${formatVolts(amplitude)})`
			),
			eq(
				`\\text{gain before the diodes conduct: } ${n2(limiter.gainStart)}, \\quad \\text{with them fully on: } ${n2(limiter.gainLimited)} \\quad (\\text{needs to straddle } ${n2(requiredGain)}${limiter.regulates ? ', and it does' : ', and it does NOT'})`
			),
			p(
				`The diodes do not switch cleanly, they bend: the gain starts dropping before the peak and keeps dropping through it, which rounds the tips of the sine slightly. That is worth about ${pct(thd)} of distortion, more than a lamp or an AGC loop but with two diodes and one resistor instead of a thermal element or five more parts. For most purposes it is the right trade, which is why it is the default here.`
			),
			p(
				`One thing to expect when simulating this: while the amplitude is still building, the diodes are not conducting yet, so the loop is running with its full excess gain and its poles sit slightly off the imaginary axis. An oscillation growing that way does not run at f0 exactly. The frequency settles onto f0 only once the limiter has brought the loop gain back to ${n2(requiredGain)}, so read the frequency at the end of a transient run, not at the start. The effect is small here but not always: a two-integrator loop started with ${n1(100 * (startGain / requiredGain - 1))} percent excess gain begins about ${n1(100 * (Math.sqrt(startGain / requiredGain) - 1))} percent high, because its loop gain goes as the square of the frequency.`
			)
		);
	}
	return blocks;
}

/** Whether the op-amp is fast enough, and what happens when it is not. */
export function explainOpampLimit(design) {
	const { opamp, f0, startGain, topo, amplitude } = design;
	return [
		p(
			`An oscillator asks its amplifier for a specific gain at a specific frequency, and a real op-amp can only deliver a gain of A up to GBW / A. Ask for gain ${n2(startGain)} at ${formatHz(f0)} from a part with a gain-bandwidth of ${formatHz(opamp.gbw)} and what comes back is not quite that gain, and not quite in phase either.`
		),
		eq(`f_{-3dB} = \\dfrac{GBW}{A} = \\dfrac{${formatHz(opamp.gbw)}}{${n2(startGain)}} = ${formatHz(opamp.closedLoopBw)}`),
		p(
			'The phase error is the part that bites. The loop oscillates where the total phase is zero, so any phase the amplifier adds is phase the network no longer has to supply, and the frequency shifts until the books balance. Keeping the amplifier an order of magnitude faster than the oscillation keeps that shift small:'
		),
		eq(
			`\\dfrac{f_0\\,A}{GBW} = \\dfrac{${formatHz(f0)} \\times ${n2(startGain)}}{${formatHz(opamp.gbw)}} = ${n3(opamp.gbwRatio)} ${opamp.gbwOk ? '\\le 0.1' : '> 0.1'}`
		),
		p(
			opamp.gbwOk
				? `Comfortably inside the rule, so the frequency lands where the RC values put it. With this op-amp and this topology the ceiling is about ${formatHz(opamp.fMax)}.`
				: `Over the rule: at ${formatHz(f0)} this op-amp cannot hold a gain of ${n2(startGain)}, so the frequency will sit off target and the amplitude may not even build. With this op-amp this topology tops out around ${formatHz(opamp.fMax)}. A faster part, a lower frequency, or a topology that asks for less gain fixes it, and the Wien bridge asks for the least of any here.`
		),
		p(
			`Slew rate is the other ceiling, and the one that bites at large amplitudes rather than small ones: a sine of ${formatVolts(amplitude)} peak at ${formatHz(f0)} has a steepest slope of 2 pi f0 times that amplitude.`
		),
		eq(
			`2\\pi f_0 V_{pk} = ${(opamp.slewNeeded / 1e6).toFixed(3)}\\ \\text{V/us} ${opamp.slewOk ? '\\le' : '>'} \\dfrac{SR}{2} = ${(opamp.slewRate / 2e6).toFixed(1)}\\ \\text{V/us}`
		),
		...(topo.opamps > 1
			? [
					p(
						`This topology uses ${topo.opamps} op-amps, so a quad package covers it. The buffers only ever run at unity gain, where they have the full gain-bandwidth available, so it is the gain stage that sets the limit above.`
					)
				]
			: [])
	];
}
