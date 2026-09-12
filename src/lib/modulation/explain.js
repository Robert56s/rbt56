import { formatFarads, formatHenries, formatHz, formatOhms, formatVolts } from './format';
import { explainApproximation, explainOrder, explainSallenKey, explainStage } from '../filter/explain';

/**
 * Builds "show the math" content for the AM tool: an ordered list of
 * blocks, each either prose or a LaTeX equation (rendered by
 * Equation.svelte / KaTeX). Same p()/eq() pattern as the filter-design
 * tool's explain.js, and the same rule: every formula is derived from the
 * one before it, in plain words first, then as an equation, then with this
 * design's own numbers. The envelope filter reuses the filter tool's
 * derivations directly instead of restating them.
 */

const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const n3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '-');
const n4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : '-');

function p(text) {
	return { type: 'p', text };
}
function eq(tex) {
	return { type: 'eq', tex };
}
function head(text) {
	return { type: 'p', text, cls: 'stageHead' };
}

/* ------------------------------------------------------------------------ */
/* AM basics: what the signal is, what it contains, how much of it is message */
/* ------------------------------------------------------------------------ */

export function explainAmBasics(n = null) {
	const blocks = [
		p(
			'A message such as audio lives at low frequencies. Sent as it is, it cannot be radiated (the antenna would need to be kilometres long) and two senders could never share the air. Modulation moves the message up to a carrier frequency of the sender\'s choosing. Amplitude modulation is the simplest way to do it: let the message set the size, the amplitude, of a fast carrier wave.'
		),
		p(
			'Write the carrier as A_p cos(ω_p t) and the message as m(t), scaled so that it stays between -1 and +1. Amplitude modulation multiplies the carrier by a factor that follows the message:'
		),
		eq('x_{AM}(t) = A_p\\left[1 + n\\,m(t)\\right]\\cos(\\omega_p t)'),
		p(
			'The bracket is the envelope, the slowly varying outline of the fast oscillation, and n is the modulation index: how far the message is allowed to push the amplitude away from A_p. Nothing in the bracket is invented; it reads "amplitude A_p, plus a bit proportional to the message".'
		),
		p(
			'What frequencies does that contain? Take the simplest message, a single tone m(t) = cos(ω_m t), and multiply out. The product of two cosines is where new frequencies appear:'
		),
		eq('\\cos\\alpha\\,\\cos\\beta = \\dfrac{\\cos(\\alpha-\\beta) + \\cos(\\alpha+\\beta)}{2}'),
		eq(
			'x_{AM}(t) = A_p\\cos(\\omega_p t) + \\dfrac{nA_p}{2}\\cos\\big((\\omega_p-\\omega_m)t\\big) + \\dfrac{nA_p}{2}\\cos\\big((\\omega_p+\\omega_m)t\\big)'
		),
		p(
			'So an AM signal is three sinusoids: the carrier itself, untouched, plus two copies of the message shifted to either side of it, the lower and upper sidebands, each of amplitude nA_p/2. The message never appears at its own frequency ω_m; only the sidebands carry it, and the whole signal fits in a band 2 f_m wide around the carrier.'
		),
		p(
			'On a scope the envelope is read directly: its highest value is A_p(1+n), where m = +1, and its lowest is A_p(1-n), where m = -1. Subtracting and adding the two removes A_p:'
		),
		eq('V_{max} = A_p(1+n),\\quad V_{min} = A_p(1-n) \\ \\Rightarrow\\ n = \\dfrac{V_{max} - V_{min}}{V_{max} + V_{min}}'),
		p(
			'n cannot usefully exceed 1: past that the bracket goes negative during part of the cycle, the carrier flips phase there and the envelope folds back on itself. An envelope detector only sees the size of the signal, never its sign, so it recovers a distorted message. Below about 0.7 the sidebands become small next to the carrier and most of the transmitted power is wasted, as the next lines show.'
		),
		p(
			'The average power of a sinusoid of amplitude A (into 1 ohm) is A²/2. Applied to the three lines above: the carrier carries A_p²/2, each sideband (nA_p/2)²/2, and only the two sidebands carry the message. The fraction of the total power that is actually message is therefore:'
		),
		eq(
			'\\eta = \\dfrac{P_{sidebands}}{P_{carrier} + P_{sidebands}} = \\dfrac{2 \\times \\dfrac{n^2 A_p^2}{8}}{\\dfrac{A_p^2}{2} + \\dfrac{n^2 A_p^2}{4}} = \\dfrac{n^2}{2 + n^2}'
		)
	];
	if (Number.isFinite(n)) {
		const eta = (n * n) / (2 + n * n);
		blocks.push(eq(`\\eta = \\dfrac{${n3(n)}^2}{2 + ${n3(n)}^2} = ${n4(eta)} = ${(100 * eta).toFixed(1)}\\%`));
	}
	blocks.push(
		p(
			'Even at n = 1 only a third of the power is message. The carrier is kept anyway because it is what lets a receiver recover the envelope with nothing more than a rectifier and a low-pass filter (see the Demodulator mode).'
		)
	);
	return blocks;
}

/* ------------------------------------------------------------------------ */
/* JFET modulator                                                            */
/* ------------------------------------------------------------------------ */

export function explainJfetPhysics(design) {
	const { vp, idss, vc, r1AtCenter, vgsMin } = design;
	const gc = idss / Math.abs(vp);
	const vdsLimit = 2 * (vgsMin - vp);
	return [
		p(
			'An AM modulator needs a gain that follows the message. The trick used here: a JFET operated with a small drain-source voltage behaves like a resistor whose value is set by its gate voltage, so it can be dropped in wherever a resistor sets an amplifier\'s gain.'
		),
		p(
			'Why a resistor: in the ohmic (triode) region, where V_DS is small, the JFET channel is a conducting path whose width the gate controls. A more negative gate narrows it, until at V_GS = V_P (the pinch-off voltage, negative for an N-channel part) it closes completely. The standard model for the drain current there is:'
		),
		eq('I_D = \\dfrac{2 I_{DSS}}{V_P^2}\\left[(V_{GS}-V_P)\\,V_{DS} - \\dfrac{V_{DS}^2}{2}\\right]'),
		p(
			'I_DSS is the current at V_GS = 0 with the channel fully open. For a small V_DS the squared term is negligible next to the first one, and what is left is Ohm\'s law, I = G V, with a conductance that depends on the gate only:'
		),
		eq('I_D \\approx G(V_{GS})\\,V_{DS}, \\qquad G(V_{GS}) = \\dfrac{1}{r_{DS}} = \\dfrac{2 I_{DSS}}{V_P^2}\\,(V_{GS} - V_P)'),
		p(
			'That conductance is a straight line in V_GS: zero at V_GS = V_P (channel closed, infinite resistance) and 2 I_DSS/|V_P| at V_GS = 0 (channel wide open). Biasing the gate exactly halfway, at V_C = V_P/2, lands exactly halfway up that line, which leaves the same room to swing in both directions:'
		),
		eq(
			`V_C = \\dfrac{V_P}{2} = ${n2(vc)}\\ \\text{V}, \\qquad G(V_C) = \\dfrac{I_{DSS}}{|V_P|} = \\dfrac{${(idss * 1000).toFixed(2)}\\ \\text{mA}}{${n2(Math.abs(vp))}\\ \\text{V}} = ${(gc * 1000).toFixed(3)}\\ \\text{mS}, \\qquad r_{DS}(V_C) = \\dfrac{|V_P|}{I_{DSS}} = ${formatOhms(r1AtCenter)}`
		),
		p(
			`One condition to respect: dropping the squared term needs |V_DS| well below 2(V_GS - V_P). In this circuit V_DS is the carrier voltage at the op-amp's inverting input, and the tightest moment is the most negative gate swing, V_GS = ${n2(vgsMin)} V, where 2(V_GS - V_P) = ${n2(vdsLimit)} V. Keeping the carrier amplitude several times smaller than that keeps the JFET a clean resistor; a larger carrier bends the gain within each carrier cycle and distorts the output.`
		)
	];
}

export function explainJfetGainCell(design) {
	const { r1AtCenter, rb, x, swingFraction, modulationIndex, nominalGain, gainMin, gainMax, vgsPeakSwing } = design;
	return [
		p(
			'The gain cell is a non-inverting amplifier with the JFET channel in place of the bottom resistor: the carrier x_p(t) drives the + input, the channel goes from the - input to ground, and R_b feeds the output back to the - input. With negative feedback an ideal op-amp keeps its two inputs at the same voltage and draws no input current, so the - input sits at x_p(t), and the current through the channel must also flow through R_b:'
		),
		eq(
			'\\dfrac{x_p}{r_{DS}} = \\dfrac{V_{out} - x_p}{R_b} \\ \\Rightarrow\\ V_{out} = x_p\\left(1 + \\dfrac{R_b}{r_{DS}}\\right) = x_p\\big[1 + R_b\\,G(V_{GS})\\big]'
		),
		p(
			'So the gain is 1 + R_b G, and G is set by the gate. Now put the message on the gate on top of the bias, V_GS(t) = V_C + x_m(t). Because G is a straight line in V_GS, adding x_m to the gate adds a proportional amount to G. Writing the gate swing as a fraction s of the room between V_C and V_P (that room is |V_P|/2), x_m(t) = s (|V_P|/2) m(t) with m between -1 and +1:'
		),
		eq(
			'G(V_C + x_m) = \\dfrac{2I_{DSS}}{V_P^2}\\left(\\dfrac{|V_P|}{2} + s\\,\\dfrac{|V_P|}{2}\\,m(t)\\right) = \\dfrac{I_{DSS}}{|V_P|}\\big[1 + s\\,m(t)\\big] = G(V_C)\\big[1 + s\\,m(t)\\big]'
		),
		p(
			'Substitute that into the gain and call x = R_b G(V_C) = R_b / r_DS(V_C), the feedback resistor measured in units of the channel resistance at bias:'
		),
		eq('V_{out}(t) = x_p(t)\\big[1 + x + x\\,s\\,m(t)\\big] = x_p(t)\\,(1+x)\\left[1 + \\dfrac{x\\,s}{1+x}\\,m(t)\\right]'),
		p(
			'That is exactly the AM form A_p[1 + n m(t)] cos(ω_p t) from the basics, with the carrier amplitude multiplied by a constant gain and the message riding on it:'
		),
		eq('K_0 = 1 + x, \\qquad n = s\\,\\dfrac{x}{1+x}'),
		p(
			'Two things to read off. n can never reach s, because x/(1+x) is always below 1: the swing fraction is the ceiling of the modulation index. And a bigger R_b raises both the gain and the depth of modulation, which is what a scope shows when R_b is changed on the same JFET. To hit a target n, invert the relation:'
		),
		eq('x = \\dfrac{n}{s - n}, \\qquad R_b = r_{DS}(V_C)\\, x'),
		eq(
			`x = \\dfrac{${n3(modulationIndex)}}{${n2(swingFraction)} - ${n3(modulationIndex)}} = ${n3(x)}, \\qquad R_b = ${formatOhms(r1AtCenter)} \\times ${n3(x)} = ${formatOhms(rb)}`
		),
		eq(`K_0 = 1 + ${n3(x)} = ${n3(nominalGain)}, \\qquad n = ${n2(swingFraction)} \\times \\dfrac{${n3(x)}}{1 + ${n3(x)}} = ${n3(modulationIndex)}`),
		p(
			`Over one message cycle the gate swings by ±${formatVolts(vgsPeakSwing)} around V_C and the gain moves between ${n3(gainMin)} and ${n3(gainMax)}: the carrier comes out ${n2(gainMax / gainMin)} times larger at the crest of the message than in its trough, which is the ratio (1+n)/(1-n) of the envelope.`
		)
	];
}

export function explainConditioningChain(design) {
	const { conditioning, vc, vgsPeakSwing } = design;
	const { sourceAmplitude, gain, hpf, divider, summer } = conditioning;
	const fmMin = hpf.cutoffTarget * 10;
	return [
		p(
			`The gate needs V_C + x_m(t): a DC level of ${formatVolts(vc)} with the message swinging ±${formatVolts(vgsPeakSwing)} on top of it. A signal generator delivers something else, typically ±${formatVolts(sourceAmplitude)} centered on 0 V. Three small stages bridge the gap: amplify to the right swing, strip any DC the amplifier may add, then add back exactly the DC wanted, taken from a resistor divider off the supply.`
		),
		p(
			'1. Gain stage. The same non-inverting amplifier as the gain cell, with a fixed resistor instead of the JFET. The - input sits at V_in (ideal op-amp with feedback), and the current through R_bottom equals the current through R_top:'
		),
		eq('\\dfrac{V_{in}}{R_{bottom}} = \\dfrac{V_{out} - V_{in}}{R_{top}} \\ \\Rightarrow\\ \\text{gain} = \\dfrac{V_{out}}{V_{in}} = 1 + \\dfrac{R_{top}}{R_{bottom}}'),
		eq(
			`\\text{gain needed} = \\dfrac{V_{swing}}{V_{source}} = \\dfrac{${formatVolts(vgsPeakSwing)}}{${formatVolts(sourceAmplitude)}} = ${n3(gain.target)} \\ \\Rightarrow\\ R_{top} = (\\text{gain} - 1)\\,R_{bottom} = ${formatOhms((gain.target - 1) * gain.rbottom)} \\rightarrow \\text{E24: } ${formatOhms(gain.rtop)}`
		),
		eq(`\\text{gain actual} = 1 + \\dfrac{${formatOhms(gain.rtop)}}{${formatOhms(gain.rbottom)}} = ${n3(gain.actual)}`),
		p(
			'2. DC-blocking high-pass. A capacitor in series, then a resistor to ground, is a voltage divider between the capacitor\'s impedance 1/(sC) and R. At DC the capacitor is an open circuit and nothing gets through; well above the corner it is a short and everything does:'
		),
		eq(
			'H(s) = \\dfrac{R}{R + \\dfrac{1}{sC}} = \\dfrac{sRC}{1 + sRC}, \\qquad \\left|H(jf)\\right| = \\dfrac{1}{\\sqrt{1 + (f_c/f)^2}}, \\quad f_c = \\dfrac{1}{2\\pi RC}'
		),
		p(
			`Putting f_c a decade below the lowest message frequency (${formatHz(fmMin)}) costs the message almost nothing: at f = 10 f_c the loss is 10 log(1 + 0.01) = 0.04 dB and the phase shift under 6 degrees. R is fixed at ${formatOhms(hpf.r)}, C is solved from f_c and rounded to a stock value:`
		),
		eq(
			`f_c = \\dfrac{f_{m,min}}{10} = ${formatHz(hpf.cutoffTarget)} \\ \\Rightarrow\\ C = \\dfrac{1}{2\\pi R f_c} = ${formatFarads(1 / (2 * Math.PI * hpf.r * hpf.cutoffTarget))} \\rightarrow ${formatFarads(hpf.c)}, \\qquad f_c\\text{ actual} = ${formatHz(hpf.cutoffActual)}`
		),
		p(
			'3. Bias divider. Two resistors in series across the supply carry the same current, so the tap voltage is that current times the bottom resistor. The tap has to sit at |V_C|; with R_bottom fixed, R_top follows:'
		),
		eq('V_{tap} = V_{cc}\\,\\dfrac{R_{bottom}}{R_{top} + R_{bottom}} \\ \\Rightarrow\\ R_{top} = R_{bottom}\\,\\dfrac{V_{cc} - V_{tap}}{V_{tap}}'),
		eq(
			`R_{top} = ${formatOhms(divider.bottom)} \\times \\dfrac{${n2(divider.vcc)} - ${n3(divider.target)}}{${n3(divider.target)}} = ${formatOhms((divider.bottom * (divider.vcc - divider.target)) / divider.target)} \\rightarrow \\text{E24: } ${formatOhms(divider.top)}, \\qquad V_{tap} = ${formatVolts(divider.actual)}\\ (\\text{target } ${formatVolts(divider.target)})`
		),
		p(
			'4. Summer. An inverting amplifier with two inputs through equal resistors R. The - input is a virtual ground (0 V), so each input pushes a current V/R into that node, the op-amp pulls the sum back out through the feedback resistor, and with all three resistors equal the weights are exactly 1:'
		),
		eq(`\\dfrac{V_{ac}}{R} + \\dfrac{V_{tap}}{R} = -\\dfrac{V_{out}}{R} \\ \\Rightarrow\\ V_{out} = -(V_{ac} + V_{tap}), \\qquad R = ${formatOhms(summer.r)}`),
		p(
			`The minus sign is useful, not a nuisance: it turns the positive tap +${formatVolts(divider.target)} into the negative V_C = ${formatVolts(vc)} an N-channel gate needs, and it merely inverts the message, a 180 degree phase shift that changes nothing in the AM envelope. The gate now sits at V_C + x_m(t), which is what the gain cell was derived for.`
		)
	];
}

/* ------------------------------------------------------------------------ */
/* Diode + resonant tank modulator                                           */
/* ------------------------------------------------------------------------ */

export function explainDiodeModulator(design) {
	const { fp, fmMax, sidebandMargin, bandwidth, q, inductance, capacitance, resistance, f0Actual, qActual, bwActual, requiredBias, diodeVf } = design;
	const w0 = 2 * Math.PI * fp;
	return [
		p(
			'This modulator has no amplifier with a variable gain. It relies on a fact about any curved (nonlinear) component: push two frequencies through it together and new frequencies come out. A diode is strongly curved, and its curve is smooth, so around the bias point it can be approximated by a polynomial (a Taylor expansion):'
		),
		eq('i = I_S\\left(e^{v/(\\eta V_T)} - 1\\right) \\ \\approx\\ I_0 + a\\,v + b\\,v^2 + \\cdots'),
		p(
			'The linear term a v cannot create anything new: it only scales what goes in. The squared term can. Feed the diode the sum of the carrier and the message (plus a DC bias, discussed at the end) and square it:'
		),
		eq('v = A_p\\cos(\\omega_p t) + A_m\\cos(\\omega_m t)'),
		eq('v^2 = A_p^2\\cos^2(\\omega_p t) + A_m^2\\cos^2(\\omega_m t) + 2A_pA_m\\cos(\\omega_p t)\\cos(\\omega_m t)'),
		p('Each piece is rewritten with two identities, cos² x = (1 + cos 2x)/2 and cos α cos β = [cos(α-β) + cos(α+β)]/2:'),
		eq(
			'b\\,v^2 = \\underbrace{\\tfrac{b}{2}(A_p^2 + A_m^2)}_{\\text{DC}} + \\underbrace{\\tfrac{b}{2}A_p^2\\cos(2\\omega_p t) + \\tfrac{b}{2}A_m^2\\cos(2\\omega_m t)}_{\\text{harmonics}} + \\underbrace{bA_pA_m\\big[\\cos((\\omega_p-\\omega_m)t) + \\cos((\\omega_p+\\omega_m)t)\\big]}_{\\text{sidebands}}'
		),
		p(
			'The last bracket is the pair of sidebands from the AM basics, and the linear term supplies the carrier line a A_p cos(ω_p t) next to them. So the diode current contains everything at once: DC, the message at ω_m, the carrier at ω_p, harmonics at 2ω_m and 2ω_p, the wanted sidebands at ω_p ± ω_m, and weaker higher-order products. An AM signal is only the carrier plus its two sidebands, so the rest has to be filtered out, and that is the tank\'s job.'
		),
		p(
			'A parallel RLC tank is a frequency-selective load: at one frequency it looks like a large resistor, everywhere else like a small impedance that shorts the unwanted terms to ground. Add the three branch admittances (admittance is 1/impedance, so parallel branches simply add):'
		),
		eq('Y = \\dfrac{1}{R} + j\\omega C + \\dfrac{1}{j\\omega L} = \\dfrac{1}{R} + j\\left(\\omega C - \\dfrac{1}{\\omega L}\\right)'),
		p(
			'The imaginary part vanishes where the capacitor and the inductor cancel each other; there the tank is just R, its maximum impedance. That frequency is the resonance:'
		),
		eq('\\omega_0 C = \\dfrac{1}{\\omega_0 L} \\ \\Rightarrow\\ \\omega_0 = \\dfrac{1}{\\sqrt{LC}}, \\qquad f_0 = \\dfrac{1}{2\\pi\\sqrt{LC}}'),
		p(
			'How selective it is: the impedance has dropped to R/sqrt(2) (half power) where the imaginary part equals 1/R. Solving ωC - 1/(ωL) = ±1/R gives two frequencies whose spacing is exactly 1/(RC). That spacing is the bandwidth, and its ratio to f_0 defines Q:'
		),
		eq('\\Delta\\omega = \\dfrac{1}{RC} \\ \\Rightarrow\\ BW = \\dfrac{f_0}{Q}, \\qquad Q = \\omega_0 R C = R\\sqrt{\\dfrac{C}{L}}'),
		p(
			`Design: the tank must let both sidebands through, so its bandwidth must cover ±f_m,max around f_p, with some margin (${n2(sidebandMargin)} here) so the sideband edges are not already attenuated. That fixes Q. A practical inductor is chosen, C follows from the resonance, R from Q, each rounded to a preferred value:`
		),
		eq(`BW = 2 \\times ${n2(sidebandMargin)} \\times ${formatHz(fmMax)} = ${formatHz(bandwidth)}, \\qquad Q = \\dfrac{f_p}{BW} = \\dfrac{${formatHz(fp)}}{${formatHz(bandwidth)}} = ${n2(q)}`),
		eq(
			`C = \\dfrac{1}{\\omega_0^2 L} = \\dfrac{1}{(2\\pi \\times ${fp})^2 \\times ${formatHenries(inductance)}} = ${formatFarads(1 / (w0 * w0 * inductance))} \\rightarrow ${formatFarads(capacitance)}`
		),
		eq(
			`R = \\dfrac{Q}{\\omega_0 C} = \\dfrac{${n2(q)}}{2\\pi \\times ${fp} \\times ${formatFarads(capacitance)}} = ${formatOhms(q / (w0 * capacitance))} \\rightarrow ${formatOhms(resistance)}`
		),
		eq(`f_0\\text{ actual} = ${formatHz(f0Actual)}, \\qquad Q\\text{ actual} = \\omega_0 R C = ${n2(qActual)}, \\qquad BW\\text{ actual} = ${formatHz(bwActual)}`),
		p(
			'The DC bias is what keeps the diode on its curve: if the summed voltage ever dropped below the forward threshold, the diode would switch off and the polynomial would no longer describe it. The worst instant is when the carrier and the message peak together:'
		),
		eq(
			Number.isFinite(requiredBias)
				? `V_{DC} \\ge A_p + A_m + V_f + \\text{margin} = ${formatVolts(requiredBias)} \\quad (V_f = ${formatVolts(diodeVf)})`
				: 'V_{DC} \\ge A_p + A_m + V_f + \\text{margin}'
		),
		p(
			'Unlike the JFET modulator, the depth of modulation here is not designed in: the sidebands are b A_p A_m tall and the carrier a A_p, so n = 2 b A_m / a depends on how curved the diode is at the bias point. It is set on the bench by adjusting A_m and the bias while watching the envelope.'
		)
	];
}

/* ------------------------------------------------------------------------ */
/* Demodulator: rectifier, then the envelope low-pass filter                 */
/* ------------------------------------------------------------------------ */

export function explainRectifier(type, fp = null) {
	const rippleNote = (mult) => (Number.isFinite(fp) ? ` = ${formatHz(mult * fp)}` : '');
	if (type === 'half') {
		return [
			p(
				'The receiver has the AM signal and wants the envelope back. The envelope is the size of the fast oscillation, so the first step is to get rid of the sign. A single diode does the crudest version: it lets only the positive half of each carrier cycle through. As long as n stays at or below 1 the bracket is never negative, so the clipping acts on the carrier only:'
			),
			eq('y(t) = \\max\\big(x_{AM}(t), 0\\big) = A_p\\big[1 + n\\,m(t)\\big]\\,\\max\\big(\\cos(\\omega_p t), 0\\big)'),
			p(
				'A half-rectified cosine is a periodic wave, so it is a sum of sinusoids (its Fourier series). Its average is 1/π, and its first ripple term sits at the carrier frequency itself:'
			),
			eq('\\max(\\cos\\theta, 0) = \\dfrac{1}{\\pi} + \\dfrac{1}{2}\\cos\\theta + \\dfrac{2}{\\pi}\\left[\\dfrac{\\cos 2\\theta}{3} - \\dfrac{\\cos 4\\theta}{15} + \\cdots\\right]'),
			p(
				`Multiplied by the envelope, the 1/π term becomes the message (scaled by 1/π, with a constant added) and everything else is ripple, starting at f_p${rippleNote(1)}. Compared with the full-wave rectifier, the message comes out half as large and the ripple sits twice as close to it, so the envelope filter has to block f_p instead of 2 f_p: same Amin, half the frequency ratio, a higher order. A bare diode also subtracts its forward drop (about 0.7 V) from every half cycle, which distorts small signals; the precision circuit avoids that.`
			)
		];
	}
	return [
		p(
			'The receiver has the AM signal and wants the envelope back. The envelope is the size of the fast oscillation, and taking the absolute value keeps the size while throwing away the sign. As long as n stays at or below 1 the bracket is never negative, so the absolute value acts on the carrier only:'
		),
		eq('\\left|x_{AM}(t)\\right| = A_p\\big[1 + n\\,m(t)\\big]\\,\\left|\\cos(\\omega_p t)\\right|'),
		p(
			'|cos| is a periodic wave, so it is a sum of sinusoids (its Fourier series). It repeats twice per carrier cycle, so its lowest component sits at 2 f_p, and its average is 2/π:'
		),
		eq('\\left|\\cos\\theta\\right| = \\dfrac{2}{\\pi} + \\dfrac{4}{\\pi}\\left[\\dfrac{\\cos 2\\theta}{3} - \\dfrac{\\cos 4\\theta}{15} + \\dfrac{\\cos 6\\theta}{35} - \\cdots\\right]'),
		p('Multiplying through by the envelope sorts the rectified signal into two groups:'),
		eq(
			'\\left|x_{AM}(t)\\right| = \\underbrace{\\dfrac{2A_p}{\\pi}\\big[1 + n\\,m(t)\\big]}_{\\text{message, plus a DC offset}} + \\underbrace{\\dfrac{4A_p}{3\\pi}\\big[1 + n\\,m(t)\\big]\\cos(2\\omega_p t) - \\cdots}_{\\text{ripple at } 2f_p \\text{ and above}}'
		),
		p(
			`The first group is the message (scaled by 2/π, with a constant added) and lives below f_m,max. The second group is centered on 2 f_p${rippleNote(2)} and above, far from the message. A low-pass filter that passes f_m,max and blocks 2 f_p separates them; that filter is designed in the next panel.`
		),
		p(
			'A bare diode would subtract its forward drop (about 0.7 V) from every half cycle and distort small signals. The precision circuit puts the diodes inside op-amp feedback loops, so the op-amp supplies whatever voltage the diode needs and the output is the exact absolute value. Two op-amps (U1A, U1B), two diodes (D1, D2) and three equal resistors (R1 = R2 = R3; the value itself does not matter, only the ratio):'
		),
		p(
			'Positive input: U1A\'s output goes positive, D2 conducts and D1 is off. No current flows through R1 and R2, so U1B, fed on its + input through D2 and with no current in its feedback resistor, is a plain follower of U1A, and U1A itself is a follower of the input:'
		),
		eq('V_{out} = V_{in} \\qquad (V_{in} > 0)'),
		p(
			'Negative input: U1A\'s output goes negative, D1 conducts and D2 is off. Through D1, U1A holds its own - input node at V_in, R3 ties U1B\'s + input to ground, and U1B becomes a standard inverting amplifier fed through R1 with R2 as feedback:'
		),
		eq('V_{out} = -\\dfrac{R_2}{R_1}\\,V_{in} = -V_{in} \\qquad (V_{in} < 0,\\ R_1 = R_2)'),
		p(
			'Both halves together give V_out = |V_in| with no diode drop anywhere in the result (the circuit is checked against Texas Instruments\' TIDU030 design). The rectified signal then goes to the envelope low-pass filter.'
		)
	];
}

export function explainEnvelopeFilter(design) {
	const { fp, fs, n, response, amaxDb, aminDb, minOrder, k, stages, realized } = design;
	return [
		p(
			'After the rectifier the message sits below f_m,max and the unwanted ripple starts at the ripple frequency (2 f_p for full-wave, f_p for half-wave), with nothing in between. Separating them is exactly the low-pass problem the Active Filter Design tool solves, so the same design is reused here, step by step. The spec: pass everything up to fp = f_m,max losing at most Amax dB, block everything from fs = the ripple frequency by at least Amin dB.'
		),
		eq(`f_p = f_{m,max} = ${formatHz(fp)}, \\qquad f_s = ${formatHz(fs)}, \\qquad k = \\dfrac{f_p}{f_s} = ${n4(k)}`),
		head('Order'),
		...explainOrder({ response, amaxDb, aminDb, k, minOrder, filterType: 'lowpass', nUsed: n, evenOnly: true }),
		head('Where the response formula and the poles come from'),
		...explainApproximation(design),
		...stages.flatMap((s, i) => [
			head(`Stage ${i + 1}: pole pair and denormalization`),
			...explainStage(design, i),
			head(`Stage ${i + 1}: Sallen-Key components`),
			...explainSallenKey(realized[i], s.q)
		])
	];
}
