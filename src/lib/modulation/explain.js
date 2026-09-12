import { formatFarads, formatHenries, formatHz, formatOhms, formatSeconds, formatVolts } from './format';

/**
 * Builds "show the math" content: an ordered list of blocks, each either
 * prose or a LaTeX equation (rendered by Equation.svelte / KaTeX). Same
 * p()/eq() pattern as the filter-design tool's explain.js.
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

export function explainAmBasics() {
	return [
		p(
			'Multiplying a fast carrier x_p(t) = sin(w_p t) by a slower modulating signal x_m(t) = sin(w_m t) does not just scale the carrier - it shifts its energy to new frequencies. Expanding the product with the product-to-sum identity:'
		),
		eq('\\sin\\alpha\\sin\\beta = \\frac{\\cos(\\alpha-\\beta) - \\cos(\\alpha+\\beta)}{2}'),
		eq('x_p(t)\\,x_m(t) = \\frac{\\cos((\\omega_p-\\omega_m)t) - \\cos((\\omega_p+\\omega_m)t)}{2}'),
		p(
			'so the product contains no energy at w_p or w_m at all - only at the sum and difference frequencies w_p +- w_m, the two sidebands either side of the carrier. In practice the carrier itself needs to survive too (so a simple envelope detector can recover the modulating signal without a local oscillator), which is why every circuit below works with x_p(t)*(A0 + x_m(t)) rather than a pure product: the A0 term keeps a carrier line at w_p alongside the two sidebands.'
		),
		p('The modulation index measures how deep that variation is, read directly off the envelope:'),
		eq('n = \\frac{V_{max} - V_{min}}{V_{max} + V_{min}}'),
		p(
			'n < 0.7 (under-modulation) wastes most of the transmitted power on a carrier that carries no information; n > 1 (over-modulation) clips the envelope and the demodulator loses signal; the practical target is 0.7 < n <= 1.'
		),
		p('The fraction of total transmitted power that actually carries the modulating signal:'),
		eq('\\eta = \\frac{P_m}{P_p+P_m} = \\frac{n^2}{2+n^2}'),
		p('n = 1 (ideal) gives eta = 1/3 = 33%; n = 0.33 gives only eta ~= 5.16% - most of the power is spent on the carrier, not the message.')
	];
}

export function explainJfetPhysics() {
	return [
		p(
			'A JFET biased in its ohmic (triode) region, with the drain-source voltage kept small, behaves as a resistor whose value is set by the gate-source voltage. The general triode-region drain current is'
		),
		eq('I_D = \\frac{2 I_{DSS}}{V_P^2}\\left[(V_{GS}-V_P)V_{DS} - \\frac{V_{DS}^2}{2}\\right]'),
		p('so as V_DS -> 0 the small-signal channel conductance is exactly linear in V_GS, with no V_DS-dependent nonlinearity left to correct for:'),
		eq('\\frac{1}{r_{DS}} = \\lim_{V_{DS}\\to0}\\frac{I_D}{V_{DS}} = \\frac{2I_{DSS}}{V_P^2}(V_{GS}-V_P)'),
		p(
			'valid for V_P <= V_GS <= 0 (N-channel). In this circuit the JFET drain sits at the op-amp\'s inverting-input node, which feedback holds near a fixed bias, and the source is grounded - that alone keeps V_DS small, without needing the extra resistor-divider linearization network some references add for the general case (where V_DS is not otherwise pinned down).'
		)
	];
}

export function explainJfetGainCell(design) {
	const { vp, idss, vc, r1AtCenter, rb, x, swingFraction, modulationIndex, nominalGain } = design;
	return [
		p(
			'The gain cell is a NON-inverting amplifier: the carrier x_p(t) drives the + input, and the JFET channel plays the role of the bottom leg of the feedback divider (drain at the - input node, source grounded), with R_b as the top (feedback) leg:'
		),
		eq('V_{out}(t) = x_p(t)\\left[1 + \\frac{R_b}{r_{DS}(V_{GS}(t))}\\right] = x_p(t)\\big[1 + R_b\\,G(V_{GS}(t))\\big]'),
		p('Biasing at the middle of the ohmic region, V_C = V_P / 2, lands exactly at the middle of the conductance range too (G(V_P) = 0, G(0) = 2*IDSS/|V_P|), since G is linear in V_GS:'),
		eq(`V_C = \\frac{V_P}{2} = ${n2(vc)}\\text{ V}, \\qquad G(V_C) = \\frac{I_{DSS}}{|V_P|} = \\frac{1}{r_{DS}(V_C)}`),
		eq(`r_{DS}(V_C) = ${formatOhms(r1AtCenter)}`),
		p('Writing V_GS(t) = V_C + x_m(t), with x_m(t) swinging to a fraction (swingFraction) of the available |V_P|/2 range, the gain cell output takes the exact AM form:'),
		eq('V_{out}(t) = x_p(t)\\cdot K_0\\cdot[1 + n\\cos(\\omega_m t)]'),
		eq('K_0 = 1 + R_b\\,G(V_C) = 1 + \\frac{R_b}{r_{DS}(V_C)}, \\qquad x = \\frac{R_b}{r_{DS}(V_C)}'),
		eq('n = \\text{swingFraction}\\cdot\\frac{x}{1+x}'),
		p(
			'so unlike a pure inverting gain-controlled cell, the modulation index here depends on R_b too: a larger R_b pushes n toward swingFraction (its ceiling as R_b -> infinity), a smaller R_b dilutes it - a larger R_b gives both a bigger output and deeper modulation, matching what a scope shows comparing two R_b values on the same JFET.'
		),
		eq(`x = \\frac{${formatOhms(rb)}}{${formatOhms(r1AtCenter)}} = ${n3(x)}`),
		eq(`n = ${n2(swingFraction)}\\cdot\\frac{${n3(x)}}{1+${n3(x)}} = ${n3(modulationIndex)}`),
		eq(`K_0 = 1 + ${n3(x)} = ${n3(nominalGain)}`)
	];
}

export function explainConditioningChain(design) {
	const { conditioning, vc, vgsPeakSwing } = design;
	const { sourceAmplitude, gain, hpf, divider } = conditioning;
	return [
		p(
			'The modulating source (e.g. a function generator limited to a small bipolar swing with no DC offset) rarely already sits at the bias point and swing the JFET gate needs, so three stages condition it: a gain stage sets the swing amplitude, a high-pass filter strips any DC drift the gain stage adds, and a summer adds the DC bias back in - deliberately, at a controlled level, from a resistor divider off the supply rail.'
		),
		p('Gain stage (non-inverting, Rbottom to ground, Rtop feedback) needed to reach the target gate swing from the source amplitude:'),
		eq(`\\text{gain} = 1+\\frac{R_{top}}{R_{bottom}} = \\frac{V_{swing}}{${formatVolts(sourceAmplitude)}} = \\frac{${formatVolts(vgsPeakSwing)}}{${formatVolts(sourceAmplitude)}} = ${n2(gain.target)}`),
		eq(`R_{top} = ${formatOhms(gain.rtop)},\\qquad R_{bottom} = ${formatOhms(gain.rbottom)} \\;\\Rightarrow\\; \\text{gain actual} = ${n3(gain.actual)}`),
		p('High-pass DC blocker, cutoff set a decade below the lowest modulating frequency to pass so it only removes DC/drift, not signal:'),
		eq(`f_c = \\frac{1}{2\\pi R C} = ${formatHz(hpf.cutoffActual)}\\quad (R=${formatOhms(hpf.r)},\\ C=${formatFarads(hpf.c)})`),
		p('DC-bias divider off the supply rail, tapped to feed the summer\'s reference input at |V_C|:'),
		eq(`V_{tap} = V_{cc}\\cdot\\frac{R_{bottom}}{R_{top}+R_{bottom}} = ${formatVolts(divider.actual)} \\;\\approx\\; |V_C| = ${formatVolts(Math.abs(vc))}`),
		p('Summer: an inverting unity-gain summing amplifier (equal resistors on every input and in feedback) adds the AC-coupled, amplified modulating signal to this DC reference, landing the gate at V_C + x_m(t).')
	];
}

export function explainDiodeModulator(design) {
	const { fp, fmMax, bandwidth, q, inductance, capacitance, resistance, f0Actual, qActual, requiredBias, diodeVf } = design;
	return [
		p(
			'A diode\'s current is a nonlinear (near-exponential) function of its voltage. Expanding that nonlinearity in a power series around the operating point, i(v) ~= a\\,v + b\\,v^2 + ..., and feeding it v(t) = V_{DC} + A_p\\cos(\\omega_p t) + A_m\\cos(\\omega_m t) (carrier + modulating signal + a DC bias that keeps v(t) always forward), the quadratic term produces a cross-product:'
		),
		eq('b\\,[A_p\\cos(\\omega_p t)][A_m\\cos(\\omega_m t)]\\cdot 2 = b A_p A_m\\big[\\cos((\\omega_p-\\omega_m)t)+\\cos((\\omega_p+\\omega_m)t)\\big]'),
		p(
			'exactly the sum/difference-frequency sidebands a real multiplier would produce - alongside the unwanted linear term (carrier and modulating tone, unmixed), the quadratic self-terms (2*w_p, 2*w_m, and a DC shift), and higher harmonics from the rest of the diode\'s nonlinearity. A resonant tank tuned to the carrier, with just enough bandwidth to admit the first-order sidebands, keeps the carrier + wanted sidebands and rejects the rest.'
		),
		p('Tank design: resonant frequency and quality factor of a parallel RLC,'),
		eq('f_0 = \\frac{1}{2\\pi\\sqrt{LC}}, \\qquad Q = R\\sqrt{\\frac{C}{L}} = \\omega_0 R C, \\qquad BW = \\frac{f_0}{Q}'),
		eq(`Q = \\frac{f_p}{BW} = \\frac{${formatHz(fp)}}{${formatHz(bandwidth)}} = ${n2(q)}\\quad(BW = 2\\times\\text{margin}\\times f_{m,max} = ${formatHz(bandwidth)})`),
		eq(`C = \\frac{1}{(2\\pi f_p)^2 L} = ${formatFarads(capacitance)}\\quad(L = ${formatHenries(inductance)}\\text{ chosen})`),
		eq(`R = \\frac{Q}{\\omega_0 C} = ${formatOhms(resistance)}`),
		eq(`f_0\\text{ actual} = ${formatHz(f0Actual)},\\qquad Q\\text{ actual} = ${n2(qActual)}`),
		p(
			Number.isFinite(requiredBias)
				? `Bias: the summer output must clear the diode's forward threshold at every instant, so V_{DC} >= A_p + A_m + V_f + margin = ${formatVolts(requiredBias)} (V_f ~= ${formatVolts(diodeVf)}).`
				: "Bias: the summer output must clear the diode's forward threshold (~0.7 V) at every instant, so V_DC must exceed the sum of the carrier and modulating amplitudes plus that threshold, with margin - otherwise the diode stops conducting during part of the cycle and the output distorts."
		)
	];
}

export function explainRectifier(type) {
	if (type === 'full') {
		return [
			p(
				'A single diode only rectifies half the waveform, which throws away half the envelope information and leaves ripple at the carrier frequency itself. A precision full-wave rectifier (verified against Texas Instruments\' TIDU030 dual-supply design) uses two op-amps and two diodes so the signal path itself changes with input polarity, giving Vout = |Vin| with no diode-drop error:'
			),
			p('Positive input: D1 reverse-biased, D2 forward-biased. No current flows into U1A\'s inverting input, so R1/R2 carry no current and U1B is a plain buffer - U1A must be a buffer too, so'),
			eq('V_{out} = V_{in}\\quad(V_{in}>0)'),
			p('Negative input: D1 forward-biased, D2 reverse-biased. U1A now drives U1B as a standard inverting amplifier, with R3 biasing U1B\'s + input to ground:'),
			eq('V_{out} = -\\frac{R_2}{R_1}V_{in} = -V_{in}\\quad(V_{in}<0,\\ R_1=R_2)'),
			p('Combined, both halves give V_out = |V_in|, with R1 = R2 = R3 (any equal value works exactly - the constraint is the ratio, not the absolute value).'),
			p('A full-wave rectified sinusoid of peak amplitude A_p has average value 2*A_p/pi and its ripple sits at TWICE the input frequency (the |cos| Fourier series has no fundamental term at the input frequency itself) - which is why full-wave rectification halves the roll-off the envelope filter afterward needs, compared to half-wave.')
		];
	}
	return [
		p('A single diode passes only the positive half of the waveform (y(t) = max(x(t), 0)). Simple, but the residual ripple sits at the carrier frequency itself, and the average value is lower:'),
		eq('\\text{average} = \\frac{A_p}{\\pi}\\quad\\text{(half-wave)}\\qquad\\text{vs.}\\qquad\\frac{2A_p}{\\pi}\\quad\\text{(full-wave)}'),
		p('The envelope low-pass filter after it must attenuate ripple at the carrier frequency f_p itself, not 2*f_p - a steeper requirement than the full-wave case for the same modulating bandwidth.')
	];
}

export function explainEnvelopeFilter(design) {
	const { fp, fs, n, response, amaxDb, aminDb, minOrder, eps, wcScale, wc } = design;
	const blocks = [
		p(
			'After rectification, the envelope sits in the low frequencies (up to the highest modulating frequency to recover) and the unwanted carrier ripple sits much higher (f_p for a half-wave rectifier, 2*f_p for full-wave). This is exactly the low-pass filter design problem: same order search and cascaded Sallen-Key stages as the active-filter-design tool, reused here rather than re-derived.'
		),
		eq(`k = \\frac{f_p}{f_s} = \\frac{${formatHz(fp)}}{${formatHz(fs)}} = ${n4(fp / fs)}`),
		p(`Minimum ${response} order meeting Amax = ${amaxDb} dB / Amin = ${aminDb} dB: ${n2(minOrder)} -> using n = ${n} (rounded up to an even number, so every stage is a plain 2nd-order Sallen-Key with no leftover 1st-order stage).`)
	];
	if (response === 'butterworth') {
		blocks.push(
			p('Amax then sets where the poles go. The Butterworth magnitude response is:'),
			eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 \\left(\\dfrac{\\omega}{\\omega_p}\\right)^{2n}}'),
			p('Losing exactly Amax dB at fp fixes epsilon:'),
			eq(
				`A(\\omega_p) = 10\\log_{10}\\!\\left(1 + \\varepsilon^2\\right) = A_{max} \\ \\Rightarrow\\ \\varepsilon = \\sqrt{10^{A_{max}/10} - 1} = \\sqrt{10^{${amaxDb}/10} - 1} = ${n4(eps)}`
			),
			p(
				'Epsilon fixes the radius omega_0 of the pole circle, which is also the -3 dB frequency. That factor is 1 only for Amax = 3.0103 dB; for a smaller Amax the poles move out past fp so that only Amax dB is lost there. Every stage below is scaled by this omega_c:'
			),
			eq('\\varepsilon^2 \\left(\\dfrac{\\omega_0}{\\omega_p}\\right)^{2n} = 1 \\ \\Rightarrow\\ \\omega_0 = \\omega_p\\, \\varepsilon^{-1/n}'),
			eq(
				`\\omega_c = \\omega_0 = 2\\pi f_p\\, \\varepsilon^{-1/n} = 2\\pi \\times ${fp} \\times ${n4(eps)}^{-1/${n}} = ${n2(2 * Math.PI * fp)} \\times ${n4(wcScale)} = ${n2(wc)}\\ \\text{rad/s}\\ \\ (f_{3\\,dB} = ${formatHz(wc / (2 * Math.PI))})`
			)
		);
	} else {
		blocks.push(
			p('For a Chebyshev response fp is the ripple edge itself: the response ripples between 0 and Amax dB up to fp, then falls.'),
			eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2\\, C_n^2\\!\\left(\\dfrac{\\omega}{\\omega_p}\\right)}'),
			p('Epsilon is already inside the pole ellipse, so the prototype is scaled straight to fp:'),
			eq(`\\omega_c = 2\\pi f_p = ${n2(wc)}\\ \\text{rad/s}`)
		);
	}
	return blocks;
}
