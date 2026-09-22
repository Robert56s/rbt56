import { nearestInSeries, seriesValues, SERIES } from './eseries';
import { modelFromIdss } from './jfetModel';

/**
 * JFET as a voltage-controlled resistor, ohmic (triode) region.
 * Reference: the standard JFET triode-region drain current,
 *   I_D = beta * [(VGS - VP)*VDS - VDS^2/2],   beta = 2*IDSS/VP^2   (VP < 0)
 * valid for 0 <= VDS <= VGS - VP; past that the channel pinches off at the
 * drain end and the current saturates. The small-signal conductance,
 *   G = 1/r_DS = beta * (VGS - VP)
 * is exactly linear in VGS. In the gain cell the JFET's drain sits at the
 * op-amp's inverting input, which feedback holds at the carrier voltage,
 * so VDS IS the carrier: it is not small by construction, it has to be
 * kept small by design (see the carrier path below). Within the triode
 * region the VDS^2/2 term does not depend on the gate, so it adds a DC
 * offset and a tone at twice the carrier frequency but leaves the
 * envelope alone.
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

/** Largest value of a series not above the target, for limits that must not be exceeded. */
function largestNotAbove(target, series) {
	const values = seriesValues(series, 0, 7).filter((v) => v <= target);
	return values.length ? Math.max(...values) : null;
}

/** Stocked values for the summer's coupling capacitor. */
const CAP_STOCK = [1e-5, 4.7e-6, 2.2e-6, 1e-6, 4.7e-7, 2.2e-7, 1e-7, 4.7e-8, 2.2e-8, 1e-8, 4.7e-9, 2.2e-9, 1e-9];
function nearestCap(target) {
	return CAP_STOCK.reduce((best, c) => (Math.abs(Math.log(c / target)) < Math.abs(Math.log(best / target)) ? c : best));
}

/**
 * How far the conductance can move around the bias, as a fraction of its
 * bias value, for a model and a swing fraction: the ceiling of the
 * modulation index. Lets the page explain a refused target instead of
 * showing nothing.
 */
export function conductanceDepth(model, swingFraction = 0.9) {
	if (!model || !(swingFraction > 0)) return null;
	const swing = swingFraction * model.halfRange;
	if (!(model.vc - swing > model.vp)) return null;
	return swing / (model.vc - model.vp);
}

/**
 * The gain cell is a NON-inverting amplifier: the carrier xp(t) drives the
 * op-amp's + input, the JFET channel (drain at the - input node, source
 * grounded) plays the bottom resistor of the feedback divider, and Rb is
 * the feedback resistor from Vout back to the - input.
 *   Vout(t) = xp(t) * [1 + Rb*G(VGS(t))]
 * With VGS(t) = VC + xm(t), G linear, and the bias at the middle of the
 * ohmic region VC = VP/2 (also the midpoint of the conductance range):
 *   Vout(t) = xp(t) * K0 * [1 + n*cos(wm t)]
 *   K0 = 1 + x,  x = Rb*IDSS/|VP| = Rb/r_DS(VC)
 *   n  = s * x / (1 + x),  s = swingFraction of the |VP|/2 gate swing
 * The instantaneous gain, which is also the op-amp's noise gain, is
 *   K(m) = 1 + x(1 + s*m),  m in [-1, +1]
 * so K_max = 1 + x(1+s) at the envelope crest: that is what the op-amp's
 * gain-bandwidth has to support at the carrier frequency.
 *
 * Three more things this design settles, because they decide whether the
 * circuit works at all:
 *  - the carrier amplitude (VDS) must stay inside the triode region at the
 *    most negative gate swing, and K_max*Ac inside the op-amp's output
 *    swing: Ac is derived from those two limits, not assumed
 *  - a single inverting summer builds V_C + xm(t) for the gate with one
 *    op-amp: series C and Rac from the source, Rbias from +Vcc, Rf as
 *    feedback. Nothing loads anything, so the delivered bias and the
 *    high-pass corner are exactly what the formulas say
 *  - the op-amp's finite gain-bandwidth lowers the gain more at the crest
 *    (large K) than in the trough (small K), which flattens the envelope:
 *    the effective n and the resulting audio distortion are computed, and
 *    a smaller Rb suggested when the carrier is too fast for the part
 */
/**
 * Harmonic content of an envelope E(m) over one message cycle m = cos(theta):
 * the modulation index a scope would read off it, and the distortion a
 * perfect demodulator would recover from it (harmonics 2 to 10 against the
 * fundamental). Both cells run their gain-dependent losses through this.
 */
function envelopeStats(envelopeOf) {
	const N = 512;
	const env = new Array(N);
	for (let i = 0; i < N; i++) env[i] = envelopeOf(Math.cos((2 * Math.PI * i) / N));
	const harmonic = (h) => {
		let re = 0;
		let im = 0;
		for (let i = 0; i < N; i++) {
			const th = (2 * Math.PI * h * i) / N;
			re += env[i] * Math.cos(th);
			im -= env[i] * Math.sin(th);
		}
		return Math.hypot(re, im) / N;
	};
	const fundamental = harmonic(1);
	let harmonicsSq = 0;
	for (let h = 2; h <= 10; h++) harmonicsSq += harmonic(h) ** 2;
	const crest = envelopeOf(1);
	const trough = envelopeOf(-1);
	return {
		effectiveModulationIndex: (crest - trough) / (crest + trough),
		crest,
		trough,
		thd: fundamental > 0 ? Math.sqrt(harmonicsSq) / fundamental : 0
	};
}

export function designJfetModulator({
	vp,
	idss,
	model = null, // from jfetModel.js; when absent, built from vp and idss
	topology = 'noninverting', // 'noninverting' (JFET in the feedback divider) or 'inverting' (JFET as the input resistor)
	swingFraction = 0.9,
	targetModulationIndex = 0.9,
	rb, // non-inverting cell: feedback resistor override (n then follows from it)
	r2, // inverting cell: feedback resistor override (x then follows from it)
	targetOutputAmplitude = 1, // inverting cell: what the post-gain stage brings the carrier up to, V
	carrierBuffer = true, // inverting cell: a follower between the carrier divider and the channel
	bufferOutputImpedance = 5, // ohm, what a small op-amp follower looks like at the carrier frequency
	sourceAmplitude = 1,
	fmMin = 20,
	vcc = 12,
	fp = 55000,
	carrierSourceAmplitude = 1,
	carrierMargin = 0.5,
	opampSwing = 10.5,
	gbw = 3e6,
	slewRate = 13e6,
	resistorSeries = 'E24'
} = {}) {
	const m = model ?? modelFromIdss(vp, idss);
	if (!m) return null;
	if (!(swingFraction > 0 && swingFraction <= 1)) return null;
	vp = m.vp;
	idss = m.idss;
	const beta = m.beta;
	const G = (v) => beta * (v - vp);

	// bias point and swing wanted: halfway along the ohmic range by
	// default, or the middle of the measured window when the line was fitted
	const vcTarget = m.vc;
	const swingTarget = swingFraction * m.halfRange;

	// --- gate drive: one inverting summer does gain, DC blocking and bias ---
	// Vout = -(Rf/Rac) xm - (Rf/Rbias) Vcc. The - input is a virtual ground,
	// so the source sees Rac, the bias weight is Rf/Rbias exactly, and the
	// coupling capacitor's corner is 1/(2 pi Rac C) with nothing in
	// parallel to move it. It is designed first because its rounded parts
	// deliver a bias and a swing a few percent off the targets, and every
	// number below (conductance depth, modulation index, triode margin) is
	// worth stating for the gate drive the circuit actually gets.
	const series = SERIES[resistorSeries];
	const gainTarget = swingTarget / sourceAmplitude;
	const biasTarget = Math.abs(vcTarget);
	// Rf is free, so it is chosen from the series (4.7 k to 47 k) as the
	// value that lets Rac and Rbias both round closest to their targets:
	// with Rf = 10 k a 2 V bias from 12 V wants 60 k, and the nearest E24
	// value 62 k costs 3 % of bias, where 20 k wants 120 k, which exists
	const pickRf = () => {
		let best = null;
		for (const cand of seriesValues(series, 3, 4)) {
			if (cand < 4700 || cand > 47_000) continue;
			const racC = nearestInSeries(cand / gainTarget, series);
			const rbiasC = nearestInSeries((cand * vcc) / biasTarget, series);
			const err = Math.abs(Math.log(cand / racC / gainTarget)) + Math.abs(Math.log((cand * vcc) / rbiasC / biasTarget));
			if (!best || err < best.err - 1e-12) best = { rf: cand, err };
		}
		return best.rf;
	};
	const rf = pickRf();
	const racTarget = rf / gainTarget;
	const rac = nearestInSeries(racTarget, series);
	const gainActual = rf / rac;
	const rbiasTarget = (rf * vcc) / biasTarget;
	const rbias = nearestInSeries(rbiasTarget, series);
	const biasActual = -(rf * vcc) / rbias;
	const fcTarget = fmMin / 10;
	const cTarget = 1 / (2 * Math.PI * rac * fcTarget);
	const c = nearestCap(cTarget);
	const fcActual = 1 / (2 * Math.PI * rac * c);
	const outMin = biasActual - gainActual * sourceAmplitude; // most negative gate voltage delivered
	const headroomOk = Math.abs(outMin) <= opampSwing;

	// what the gate really gets
	const vc = biasActual;
	const vgsPeakSwing = gainActual * sourceAmplitude;
	const vgsMin = vc - vgsPeakSwing; // closest to VP (largest R1)
	const vgsMax = vc + vgsPeakSwing; // closest to 0 (smallest R1)
	if (!(vgsMin > vp)) return null; // the swing would pinch the channel off

	const r1AtCenter = 1 / G(vc); // = |VP| / IDSS when vc = VP/2
	const r1Min = 1 / G(vgsMax);
	const r1Max = 1 / G(vgsMin);

	// how far the conductance moves, as a fraction of its bias value:
	// G(vc +- swing) = G(vc) (1 +- gDepth). Equals swingFraction when the
	// bias sits at VP/2 with the full |VP|/2 half-range; smaller when a
	// measured window keeps the design inside a checked stretch of the curve.
	const gDepth = vgsPeakSwing / (vc - vp);
	const inverting = topology === 'inverting';

	const bandwidthFactor = (k) => {
		const r = (fp * k) / gbw;
		return 1 / Math.sqrt(1 + r * r);
	};
	const kLimit = (0.2 * gbw) / fp; // noise gain the GBW rule allows at this carrier

	// --- the cell: feedback resistor, gains, modulation index ---
	let feedback; // the resistor that sets x
	let x;
	let modulationIndex;
	let nominalGain; // K0, signal gain at the bias point
	let gainMin; // signal gain magnitude at the trough
	let gainMax; // and at the crest
	let noiseGain; // (m) => what the op-amp has to support
	if (inverting) {
		// Vout = -R2 G(VGS) xp: the signal gain is x(1 + gDepth m) with no
		// "1 +", so n = gDepth whatever x is, and x is free to be small. By
		// default it takes the largest value the GBW rule allows, capped so
		// the cell does not become a big amplifier for no reason.
		let r2Actual = r2;
		if (!(r2Actual > 0)) {
			const xRule = (kLimit - 1) / (1 + gDepth);
			const xAuto = Math.min(10, xRule > 0.5 ? xRule : 0.5);
			r2Actual = largestNotAbove(xAuto * r1AtCenter, series) ?? nearestInSeries(xAuto * r1AtCenter, series);
		}
		feedback = r2Actual;
		x = r2Actual / r1AtCenter;
		modulationIndex = gDepth;
		nominalGain = x;
		gainMin = x * (1 - gDepth);
		gainMax = x * (1 + gDepth);
		noiseGain = (mm) => 1 + x * (1 + gDepth * mm);
	} else {
		let rbActual = rb;
		if (!(rbActual > 0)) {
			if (!(targetModulationIndex > 0 && targetModulationIndex < gDepth)) return null;
			const xt = targetModulationIndex / (gDepth - targetModulationIndex);
			rbActual = xt * r1AtCenter;
		}
		feedback = rbActual;
		x = rbActual / r1AtCenter;
		modulationIndex = (gDepth * x) / (1 + x);
		nominalGain = 1 + x;
		gainMin = 1 + rbActual / r1Max;
		gainMax = 1 + rbActual / r1Min;
		noiseGain = (mm) => 1 + x * (1 + gDepth * mm);
	}

	// --- carrier path: how large the carrier may be ---
	// (a) triode: VDS <= VGS - VP at the most negative gate swing. In both
	// cells the channel sits between the carrier node and a node the op-amp
	// holds at the carrier voltage (non-inverting) or at 0 V (inverting), so
	// VDS is the carrier either way.
	const vdsSat = vgsMin - vp; // = (1 - s) |VP| / 2 at the default bias
	const acTriode = carrierMargin * vdsSat;
	// (b) op-amp output: the cell's largest output, K_max * Ac, must fit the swing
	const acOpamp = opampSwing / gainMax;
	const acMax = Math.min(acTriode, acOpamp);
	const carrierLimit = acTriode <= acOpamp ? 'triode' : 'opamp';
	// resistive divider from the carrier source. Non-inverting: it drives
	// the op-amp's + input, which draws no current, so no buffer is needed.
	// Inverting: it would drive the channel itself, see the buffer below.
	const divBottom = 1_000;
	const ratio = Math.min(1, acMax / carrierSourceAmplitude);
	const divTopTarget = ratio >= 1 ? 0 : divBottom * (1 / ratio - 1);
	const divTop = divTopTarget > 0 ? nearestInSeries(divTopTarget, series) : 0;
	const ac = (carrierSourceAmplitude * divBottom) / (divTop + divBottom);
	const dividerImpedance = divTop > 0 ? (divTop * divBottom) / (divTop + divBottom) : 0;
	const carrierOut = nominalGain * ac; // the cell's output carrier amplitude
	const envelopeMax = gainMax * ac;
	const envelopeMin = gainMin * ac;
	const jfetPeakCurrent = ac / r1Min; // through the channel at the crest, supplied by the cell's op-amp
	const tone2fp = (feedback * beta * ac * ac) / 4; // also the DC offset the VDS^2 term adds
	const tone2fpDbc = 20 * Math.log10(tone2fp / carrierOut);

	// --- inverting cell only: what feeds the channel, and the post-gain stage ---
	// The channel is the input resistor, so whatever impedance sits in front
	// of it adds to r_DS and the gain becomes R2/(r_DS + Z_s): a Z_s that is
	// not negligible against r_DS(min) compresses the crest. A follower makes
	// Z_s a few ohms; the bare divider would be several hundred.
	let buffer = null;
	let postGain = null;
	let sourceImpedance = 0;
	if (inverting) {
		const zWith = bufferOutputImpedance;
		const zWithout = dividerImpedance;
		sourceImpedance = carrierBuffer ? zWith : zWithout;
		const loaded = (zs) => envelopeStats((mm) => (x * (1 + gDepth * mm)) / (1 + zs * G(vc) * (1 + gDepth * mm)));
		buffer = {
			enabled: carrierBuffer,
			zOut: zWith,
			dividerImpedance: zWithout,
			withBuffer: loaded(zWith),
			withoutBuffer: loaded(zWithout),
			crestErrorWithout: zWithout / r1Min // fraction of r_DS(min) the divider adds at the crest
		};
		// bring the small cell output up to line level with a fixed
		// non-inverting stage; its loss at fp is the same at every point of
		// the message, so it changes the level, not the envelope
		const kTarget = targetOutputAmplitude / carrierOut;
		if (kTarget > 1.05) {
			const rbottom = 1_000;
			const rtop = nearestInSeries((kTarget - 1) * rbottom, series);
			const kActual = 1 + rtop / rbottom;
			const factor = bandwidthFactor(kActual);
			const outMax = kActual * envelopeMax;
			postGain = {
				needed: true,
				target: targetOutputAmplitude,
				kTarget,
				rtop,
				rbottom,
				kActual,
				factor,
				gbwRatio: (fp * kActual) / gbw,
				outputAmplitude: kActual * carrierOut * factor,
				envelopeMax: outMax,
				swingOk: outMax <= opampSwing,
				slewNeeded: 2 * Math.PI * fp * outMax,
				slewOk: 2 * Math.PI * fp * outMax <= slewRate / 2
			};
		} else {
			postGain = { needed: false, target: targetOutputAmplitude, kTarget, kActual: 1, factor: 1, outputAmplitude: carrierOut, envelopeMax, swingOk: true };
		}
	}

	// --- op-amp limits at the carrier frequency ---
	// The cell's noise gain moves with the message, so its bandwidth does
	// too; the loss is largest at the crest, which flattens the top of the
	// envelope. For the inverting cell the source impedance adds its own
	// crest compression, so both go into the same envelope.
	const kTrough = noiseGain(-1);
	const kNominal = noiseGain(0);
	const kCrest = noiseGain(1);
	const factorTrough = bandwidthFactor(kTrough);
	const factorNominal = bandwidthFactor(kNominal);
	const factorCrest = bandwidthFactor(kCrest);
	const signalGain = inverting ? (mm) => (x * (1 + gDepth * mm)) / (1 + sourceImpedance * G(vc) * (1 + gDepth * mm)) : (mm) => 1 + x * (1 + gDepth * mm);
	const stats = envelopeStats((mm) => signalGain(mm) * bandwidthFactor(noiseGain(mm)));
	// what a scope or a peak detector reads: the V_DS^2 term adds the same
	// DC and 2 f_p component to every carrier peak, crest and trough alike,
	// so the index measured from the peaks is a little below the envelope's
	const peakModulationIndex = (stats.crest - stats.trough) / (stats.crest + stats.trough + (4 * tone2fp) / ac);
	const gbwRatio = (fp * kCrest) / gbw; // fp * K_max / GBW, keep under 0.2
	const gbwOk = gbwRatio <= 0.2;
	// non-inverting: the largest Rb that lands on the rule, and the n it leaves.
	// inverting: the largest R2, n unchanged.
	const xLimit = (kLimit - 1) / (1 + gDepth);
	const feedbackLimit = xLimit > 0 ? largestNotAbove(xLimit * r1AtCenter, series) : null;
	const xAtLimit = feedbackLimit ? feedbackLimit / r1AtCenter : null;
	const nAtLimit = xAtLimit === null ? null : inverting ? gDepth : (gDepth * xAtLimit) / (1 + xAtLimit);
	// slew rate: the cell's output is a sine of amplitude up to K_max Ac
	const slewNeeded = 2 * Math.PI * fp * envelopeMax;
	const slewOk = slewNeeded <= slewRate / 2;
	const opampCount = 1 + 1 + (inverting ? (carrierBuffer ? 1 : 0) + (postGain?.needed ? 1 : 0) : 0); // summer + cell + extras

	return {
		topology,
		vp,
		idss,
		beta,
		model: m,
		swingFraction,
		gDepth,
		vc,
		vcTarget,
		vgsPeakSwing,
		swingTarget,
		vgsMin,
		vgsMax,
		r1AtCenter,
		r1Min,
		r1Max,
		rb: inverting ? null : feedback,
		r2: inverting ? feedback : null,
		feedback,
		x,
		modulationIndex,
		nominalGain,
		gainMin,
		gainMax,
		conditioning: {
			sourceAmplitude,
			fmMin,
			vcc,
			summer: { rf, rac, racTarget, c, cTarget, rbias, rbiasTarget, gainTarget, gainActual, biasTarget, biasActual, fcTarget, fcActual, outMin, headroomOk, opampSwing }
		},
		carrier: {
			fp,
			sourceAmplitude: carrierSourceAmplitude,
			margin: carrierMargin,
			vdsSat,
			acTriode,
			acOpamp,
			acMax,
			limit: carrierLimit,
			divider: { top: divTop, bottom: divBottom, topTarget: divTopTarget, impedance: dividerImpedance },
			ac,
			carrierOut,
			envelopeMax,
			envelopeMin,
			jfetPeakCurrent,
			tone2fp,
			tone2fpDbc,
			tone2fpHz: 2 * fp
		},
		buffer,
		postGain,
		opamp: {
			gbw,
			slewRate,
			opampSwing,
			kTrough,
			kNominal,
			kCrest,
			bwTrough: gbw / kTrough,
			bwNominal: gbw / kNominal,
			bwCrest: gbw / kCrest,
			factorTrough,
			factorNominal,
			factorCrest,
			effectiveModulationIndex: stats.effectiveModulationIndex,
			peakModulationIndex,
			thd: stats.thd,
			gbwRatio,
			gbwOk,
			rbLimit: feedbackLimit,
			nAtLimit,
			slewNeeded,
			slewOk,
			opampCount
		}
	};
}

/**
 * The two cells on the same JFET, same carrier and same op-amp, side by
 * side: what each gives for the modulation index, the noise gain the
 * op-amp must follow, its bandwidth at the crest, the audio distortion,
 * the output level and the number of op-amps.
 */
export function compareTopologies(params) {
	const rows = [];
	for (const topology of ['noninverting', 'inverting']) {
		const d = designJfetModulator({ ...params, topology });
		if (!d) {
			rows.push({ topology, ok: false });
			continue;
		}
		rows.push({
			topology,
			ok: true,
			n: d.modulationIndex,
			nEffective: d.opamp.effectiveModulationIndex,
			kCrest: d.opamp.kCrest,
			bwCrest: d.opamp.bwCrest,
			gbwRatio: d.opamp.gbwRatio,
			thd: d.opamp.thd,
			carrierOut: d.postGain ? d.postGain.outputAmplitude : d.carrier.carrierOut,
			ac: d.carrier.ac,
			opampCount: d.opamp.opampCount,
			feedback: d.feedback
		});
	}
	return rows;
}
