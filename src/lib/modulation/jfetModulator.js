import { nearestInSeries, SERIES } from './eseries';

/**
 * JFET as a voltage-controlled resistor, ohmic (triode) region, small V_DS.
 * Reference: the standard MOSFET/JFET triode-region drain current,
 *   I_D = (2*IDSS/VP^2) * [(VGS - VP)*VDS - VDS^2/2]   (VP < 0 for N-channel)
 * so the small-signal channel resistance as VDS -> 0 is
 *   1/r_DS = I_D/VDS = (2*IDSS/VP^2) * (VGS - VP)
 * i.e. the CONDUCTANCE 1/r_DS is exactly linear in VGS (no VDS-dependent
 * nonlinearity to correct for, unlike the general triode-region formula)
 * as long as VDS stays negligible. In this circuit the JFET's drain sits at
 * the op-amp's inverting-input node (held near a fixed bias by feedback,
 * see below) and its source is grounded, which keeps VDS small without an
 * extra linearization network. Valid for VP <= VGS <= 0 (N-channel JFET
 * ohmic region).
 */
export function channelResistance(vgs, vp, idss) {
	if (!(idss > 0) || !(vp < 0)) return NaN;
	const denom = 2 * idss * (vgs - vp);
	if (denom <= 0) return Infinity;
	return (vp * vp) / denom;
}

export function channelConductance(vgs, vp, idss) {
	return (2 * idss * (vgs - vp)) / (vp * vp);
}

/**
 * The gain cell is a NON-inverting amplifier: the carrier xp(t) drives the
 * op-amp's + input, the JFET channel (drain at the - input node, source
 * grounded) plays the role of the bottom resistor of the feedback divider,
 * and Rb is the top (feedback) resistor from Vout back to the - input.
 *   Vout(t) = xp(t) * [1 + Rb / r_DS(VGS(t))] = xp(t) * [1 + Rb*G(VGS(t))]
 * With VGS(t) = VC + xm(t) and G(.) exactly linear (see above), and biasing
 * at the middle of the ohmic region VC = VP/2 (which is also exactly the
 * midpoint of the conductance range, G(VP)=0 to G(0)=2*IDSS/|VP|, so
 * G(VC) = IDSS/|VP|):
 *   Vout(t) = xp(t) * K0 * [1 + n*cos(wm t)]
 *   K0 = 1 + Rb*IDSS/|VP|                      (nominal/DC gain)
 *   n  = swingFraction * x / (1 + x),  x = Rb*IDSS/|VP| = Rb/R1(VC)
 * where swingFraction is the fraction of the full |VP|/2 gate swing used.
 * Unlike a pure inverting gain-controlled cell, n here depends on Rb too
 * (through x): a larger Rb pushes n toward swingFraction as its ceiling,
 * a smaller Rb dilutes it - matching the swing-amplitude vs Rb trade-off
 * the source material demonstrates directly (Rb = 1 kOhm vs 500 Ohm
 * changing both the output amplitude and the modulation index).
 */
export function designJfetModulator({
	vp,
	idss,
	swingFraction = 0.9,
	targetModulationIndex = 0.9,
	rb, // optional: if given, n is derived from it instead of solved from targetModulationIndex
	sourceAmplitude = 1,
	fmMin = 20,
	vcc = 12,
	resistorSeries = 'E24'
} = {}) {
	if (!(vp < 0) || !(idss > 0)) return null;
	if (!(swingFraction > 0 && swingFraction <= 1)) return null;

	const vc = vp / 2; // bias point: middle of the ohmic region
	const vgsPeakSwing = swingFraction * (Math.abs(vp) / 2);
	const vgsMin = vc - vgsPeakSwing; // closest to VP (largest R1)
	const vgsMax = vc + vgsPeakSwing; // closest to 0 (smallest R1)

	const r1AtCenter = channelResistance(vc, vp, idss); // = |VP| / IDSS
	const r1Min = channelResistance(vgsMax, vp, idss);
	const r1Max = channelResistance(vgsMin, vp, idss);

	let rbActual = rb;
	if (!(rbActual > 0)) {
		if (!(targetModulationIndex > 0 && targetModulationIndex < swingFraction)) return null;
		const x = targetModulationIndex / (swingFraction - targetModulationIndex);
		rbActual = x * r1AtCenter;
	}
	const x = rbActual / r1AtCenter;
	const modulationIndex = (swingFraction * x) / (1 + x);
	const nominalGain = 1 + x; // K0, gain at the unmodulated bias point

	const gainMin = 1 + rbActual / r1Max; // at vgsMin
	const gainMax = 1 + rbActual / r1Min; // at vgsMax

	// --- signal conditioning chain: source -> gain stage -> HPF -> summer -> gate ---
	const series = SERIES[resistorSeries];

	// 1. Non-inverting gain stage: amplify the source to the needed gate swing.
	const gainNeeded = vgsPeakSwing / sourceAmplitude;
	const gainRbottom = 10_000;
	const gainRtopTarget = (gainNeeded - 1) * gainRbottom;
	const gainRtop = gainRtopTarget > 0 ? nearestInSeries(gainRtopTarget, series) : 0;
	const gainActual = 1 + gainRtop / gainRbottom;

	// 2. High-pass DC blocker: cutoff a decade below the lowest modulating
	// frequency, well clear of the audio/modulating band it must pass.
	const hpfCutoff = fmMin / 10;
	const hpfR = 100_000;
	const hpfCTarget = 1 / (2 * Math.PI * hpfR * hpfCutoff);
	const hpfCCandidates = [1e-6, 4.7e-7, 2.2e-7, 1e-7, 4.7e-8, 2.2e-8, 1e-8, 4.7e-9, 2.2e-9, 1e-9];
	const hpfC = hpfCCandidates.reduce((best, c) =>
		Math.abs(Math.log(c / hpfCTarget)) < Math.abs(Math.log(best / hpfCTarget)) ? c : best
	);
	const hpfCutoffActual = 1 / (2 * Math.PI * hpfR * hpfC);

	// 3. DC bias summer: inverting unity-gain summer adds a DC reference
	// (from a resistor divider off Vcc) to the AC-coupled gate drive so the
	// combined signal sits at VC. Divider output magnitude must equal |VC|.
	const sumR = 10_000; // equal-weight summing resistors, unity gain per input
	const dividerBottom = 10_000;
	const dividerTopTarget = (dividerBottom * (vcc - Math.abs(vc))) / Math.abs(vc);
	const dividerTop = nearestInSeries(dividerTopTarget, series);
	const dividerOutput = (vcc * dividerBottom) / (dividerTop + dividerBottom);

	return {
		vp,
		idss,
		swingFraction,
		vc,
		vgsMin,
		vgsMax,
		r1AtCenter,
		r1Min,
		r1Max,
		rb: rbActual,
		x,
		modulationIndex,
		nominalGain,
		gainMin,
		gainMax,
		conditioning: {
			sourceAmplitude,
			gain: { rbottom: gainRbottom, rtop: gainRtop, target: gainNeeded, actual: gainActual },
			hpf: { r: hpfR, c: hpfC, cutoffTarget: hpfCutoff, cutoffActual: hpfCutoffActual },
			summer: { r: sumR },
			divider: { top: dividerTop, bottom: dividerBottom, vcc, target: Math.abs(vc), actual: dividerOutput }
		}
	};
}
