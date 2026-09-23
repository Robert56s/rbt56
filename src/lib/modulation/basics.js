import { powerEfficiency } from './amMath';
import { designPrecisionRectifier } from './rectifier';

/**
 * The AM tool introduced from the beginning. A whistle on a scope first,
 * then the same wave riding a carrier, the formula only once the picture
 * is there, the index read off the envelope, and the sidebands after the
 * spectrum. Then the circuit of the mode chosen, grown from one part, and
 * what the numbers on the page mean. Every number in the prose and in the
 * second line of each equation is the page's own live value; when one is
 * missing the prose falls back to a general sentence and the equation to
 * its symbolic line.
 *   mode            'jfet' | 'diode' | 'demod'
 *   topology        'noninverting' | 'inverting' (JFET mode)
 *   carrierFrom     'source' | 'wien' (JFET mode)
 *   rectifierType   'full' | 'half' (demodulator)
 *   design          designJfetModulator's result, or null
 *   jfetModel       the straight line G(VGS) the page built (vp, beta, idss, rdsOn, mode)
 *   swingFraction, targetN   the JFET form's swing and target index
 *   fp, fm          the carrier and message frequencies of the mode shown
 *   diodeDesign     designDiodeMixerModulator's result, with carrierAmp and modAmp
 *   envelopeDesign  designEnvelopeLowPass's result, with demoModIndex,
 *                   rippleHz, amaxDb and aminDb
 */

const h = (text) => ({ h: text });
const p = (text) => ({ p: text });
const eq = (tex, intro) => ({ eq: tex, intro });
const widget = (name, props) => ({ widget: name, props });
const terms = (list) => ({ terms: list });

/* ------------------------------------------------------------ numbers */

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const all = (...v) => v.every(fin);
const pos = (...v) => v.every((x) => fin(x) && x > 0);

// n significant figures, trailing zeros dropped
function sig(v, n = 3) {
	if (v === 0) return '0';
	return String(Number(v.toPrecision(n)));
}
const fix2 = (v) => v.toFixed(2);
const pct = (x, n = 2) => sig(100 * x, n);

function hz(f) {
	const a = Math.abs(f);
	if (a >= 1e6) return `${sig(f / 1e6)} MHz`;
	if (a >= 1e3) return `${sig(f / 1e3)} kHz`;
	return `${sig(f)} Hz`;
}
function texHz(f) {
	const a = Math.abs(f);
	if (a >= 1e6) return `${sig(f / 1e6)}\\ \\text{MHz}`;
	if (a >= 1e3) return `${sig(f / 1e3)}\\ \\text{kHz}`;
	return `${sig(f)}\\ \\text{Hz}`;
}
// a whole number with thin spaces between groups of three digits
function texInt(v) {
	const s = String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '\\,');
	return v < 0 ? `-${s}` : s;
}
function volts(v) {
	if (v !== 0 && Math.abs(v) < 0.1) return `${sig(v * 1000, 2)} mV`;
	return `${sig(v)} V`;
}
function texVolts(v) {
	if (v !== 0 && Math.abs(v) < 0.1) return `${sig(v * 1000, 2)}\\ \\text{mV}`;
	return `${sig(v)}\\ \\text{V}`;
}
function ohms(r) {
	if (r >= 1e6) return `${sig(r / 1e6)} M`;
	if (r >= 1e3) return `${sig(r / 1e3)} k`;
	return `${sig(r)} ohms`;
}
function texOhms(r) {
	if (r >= 1e6) return `${sig(r / 1e6)}\\ \\text{M}\\Omega`;
	if (r >= 1e3) return `${sig(r / 1e3)}\\ \\text{k}\\Omega`;
	return `${sig(r)}\\ \\Omega`;
}
const PREFIXES = [
	[1e6, 'M'],
	[1e3, 'k'],
	[1, ''],
	[1e-3, 'm'],
	[1e-6, 'μ'],
	[1e-9, 'n'],
	[1e-12, 'p']
];
function prefixOf(v) {
	const a = Math.abs(v);
	return PREFIXES.find(([s]) => a >= s * 0.9995) ?? PREFIXES[PREFIXES.length - 1];
}
function si(v, unit) {
	const [s, pre] = prefixOf(v);
	return `${sig(v / s)} ${pre}${unit}`;
}
function texSI(v, unit) {
	const [s, pre] = prefixOf(v);
	return `${sig(v / s)}\\ ${pre === 'μ' ? `\\mu\\text{${unit}}` : `\\text{${pre}${unit}}`}`;
}
// props for a figure: only the values that are there (the figure has its own defaults)
function present(props) {
	const out = {};
	for (const [k, v] of Object.entries(props)) {
		if (typeof v === 'string' || fin(v)) out[k] = v;
	}
	return out;
}

/* ------------------------------------------------- the common sections */

// the carrier height and index the formulas of the common sections use, per mode
const DIODE_N = 0.8; // the diode circuit's index is set on the bench, not by the tool
const DEMOD_AP = 1; // the demodulator preview draws a 1 V carrier

function waveFor(ctx) {
	const { mode, design, targetN, carrierAmp, demoModIndex } = ctx;
	if (mode === 'diode') return { ap: carrierAmp, n: DIODE_N };
	if (mode === 'demod') return { ap: DEMOD_AP, n: demoModIndex };
	const ap = design?.postGain?.outputAmplitude ?? design?.carrier?.carrierOut;
	return { ap, n: design ? design.modulationIndex : targetN };
}

function hook({ fp, fm }) {
	if (pos(fp, fm) && fp > fm) {
		return p(
			`A ${hz(fm)} whistle on a scope is one slow wave. Ridden on a ${hz(fp)} carrier, it becomes a fast wave whose height rises and falls with the whistle. Every circuit on this page either writes a message onto a carrier's height that way, or reads it back off.`
		);
	}
	return p(
		"A whistle on a scope is one slow wave. Ridden on a much faster carrier, it becomes a fast wave whose height rises and falls with the whistle. Every circuit on this page either writes a message onto a carrier's height that way, or reads it back off."
	);
}

function noteOnAScope({ fp, fm }) {
	const known = pos(fp, fm) && fp > fm;
	return [
		h('A note on a scope'),
		p(
			known
				? `A steady ${hz(fm)} whistle into a microphone shows on a scope as one smooth wave, ${sig(fm, 4)} cycles a second. That is the message. The carrier is another sine wave, much faster: ${hz(fp)} here, ${sig(fp / fm)} cycles for every one of the message${fp > 20000 ? ', above what the ear hears' : ''}. The carrier frequency field on the page sets it.`
				: 'A steady whistle into a microphone shows on a scope as one smooth wave. That is the message. The carrier is another sine wave, many times faster, set by the carrier frequency field on the page.'
		),
		p(
			"A wave as slow as the message cannot leave an antenna of any sensible size, and two messages sent as they are would land on top of each other. Riding the message on a carrier moves it up to a frequency of the designer's choosing, where it can be picked out again and shared with others. Amplitude modulation is the simplest way to do the riding: the message sets the height of the carrier."
		)
	];
}

function carrierCopies(ctx) {
	const { mode, fp, fm, diodeDesign } = ctx;
	const { ap, n } = waveFor(ctx);
	const props = present({
		n0: fin(n) ? n : undefined,
		fp: pos(fp) ? fp : undefined,
		fm: pos(fm) ? fm : undefined,
		ap0: pos(ap) ? ap : 1
	});
	if (mode === 'diode' && pos(diodeDesign?.f0Actual, diodeDesign?.bwActual)) {
		props.f0 = diodeDesign.f0Actual;
		props.bw = diodeDesign.bwActual;
	}
	return [
		h('The carrier copies the message'),
		p(
			'In the figure below, blue is the carrier once the message has taken charge of its height: tall where the message is high, short where it is low. Green is the message alone. The dashed line drawn along the peaks is the envelope, and it has the shape of the message. How deep the envelope dips is the modulation index, written n.'
		),
		p(
			"At n = 0 the carrier is untouched. At n = 1 the envelope touches zero once per message cycle. Past 1 the outline crosses zero and folds back, the tops of the trace stop copying the message, and a receiver that only reads heights gets it wrong. Under the wave is the same signal sorted by frequency instead of by time; a later section comes back to it. The sliders start from this page's numbers and can be moved freely."
		),
		widget('am-wave', props)
	];
}

function formulaSection(ctx) {
	const { mode, fp } = ctx;
	const { ap, n } = waveFor(ctx);
	const live = pos(ap, fp) && fin(n) && n >= 0;
	let tail;
	if (mode === 'diode') tail = live ? `On the second line A_p is the carrier amplitude entered on the page. The index n is set on the bench, not by the tool, and ${DIODE_N} stands in for it.` : 'In this circuit n is set on the bench, not by the tool.';
	else if (mode === 'demod') tail = live ? `On the second line n is the preview index entered on the page, and the carrier is taken as ${volts(DEMOD_AP)}, as in the preview.` : 'In the demodulator n is whatever the incoming wave carries.';
	else tail = live ? 'On the second line A_p is the carrier this design delivers at its output and n its modulation index, so the line matches the tables further down.' : 'Once the design on the page is complete, its own carrier and index fill in this formula.';
	const sym = 'x(t) = A_p\\,\\big[1 + n\\,m(t)\\big]\\cos(2\\pi f_p t)';
	return [
		h('The same picture written down'),
		p(
			"The trace has a formula, and the formula reads like the picture. Call the carrier's height with no message A_p, and the message m(t), scaled to swing between -1 and +1. The height at any instant is A_p times one plus a slice of the message, and the size of the slice is n. Multiplying that height by a plain cosine at the carrier frequency f_p gives the whole signal. The bracket is the envelope; the cosine is the fast wiggle inside it."
		),
		p(tail),
		live
			? eq(`\\begin{aligned} x(t) &= A_p\\,\\big[1 + n\\,m(t)\\big]\\cos(2\\pi f_p t) \\\\ &= ${texVolts(ap)}\\,\\big[1 + ${fix2(n)}\\,m(t)\\big]\\cos(2\\pi \\cdot ${texInt(fp)}\\,t) \\end{aligned}`, "Height times carrier, then with this page's values:")
			: eq(sym, 'Height times carrier:')
	];
}

function readingN(ctx) {
	const { mode, design, topology } = ctx;
	const { ap, n } = waveFor(ctx);
	let vmax;
	let vmin;
	let intro;
	if (mode === 'jfet') {
		vmax = design?.carrier?.envelopeMax;
		vmin = design?.carrier?.envelopeMin;
		intro = "From the two extremes of the envelope, then with this design's envelope:";
	} else if (pos(ap) && fin(n) && n >= 0 && n <= 1) {
		vmax = ap * (1 + n);
		vmin = ap * (1 - n);
		intro = 'From the two extremes of the envelope, then with the envelope of the line above:';
	}
	const live = all(vmax, vmin) && vmax + vmin > 0;
	let where = 'The figure above prints the same two values for its sliders. ';
	if (mode === 'jfet' && live) {
		const post = design?.postGain;
		// the figure is drawn at the final output: after the post-gain stage when there is one
		where =
			topology === 'inverting' && post?.needed && pos(post.envelopeMax)
				? `The carrier path table lists this envelope maximum and minimum at the cell's output. The post-gain stage scales both alike and leaves the ratio alone, so the figure above, drawn at the final output, peaks at ${volts(post.envelopeMax)} as the post-gain table does, with the same n. `
				: 'The carrier path table lists this envelope maximum and minimum for the design, and the figure above prints the same two values for its sliders. ';
	}
	const nShown = fin(n) && n > 0 && n <= 1.5 ? n : null;
	const sym = 'n = \\dfrac{V_{max} - V_{min}}{V_{max} + V_{min}}';
	return [
		h('Reading n off a scope'),
		p(
			'On the bench n is not known in advance; it is read from the envelope. The envelope is highest where the message peaks, at A_p (1 + n), and lowest where it troughs, at A_p (1 - n). Subtracting the two leaves 2 n A_p, adding them leaves 2 A_p, and the ratio is n with A_p gone. Two cursor readings on a scope are enough.'
		),
		p(
			where +
				`A useful n sits between 0.7 and 1. Lower, and the sidebands, the two copies of the message described below, are small next to the carrier, which carries none of it${nShown !== null ? `: at n = ${fix2(nShown)} the sidebands hold ${pct(powerEfficiency(nShown))} % of the power` : ''}. Higher, and the envelope folds.`
		),
		live
			? eq(`\\begin{aligned} n &= \\dfrac{V_{max} - V_{min}}{V_{max} + V_{min}} \\\\ &= \\dfrac{${sig(vmax)} - ${sig(vmin)}}{${sig(vmax)} + ${sig(vmin)}} = ${fix2((vmax - vmin) / (vmax + vmin))} \\end{aligned}`, intro)
			: eq(sym, 'From the two extremes of the envelope:')
	];
}

function whereItWent(ctx) {
	const { mode, fp, fm } = ctx;
	const known = pos(fp, fm) && fp > fm;
	let tail = '';
	if (mode === 'diode') tail = ' The tank of this circuit is tuned to pass just that width.';
	else if (mode === 'demod') tail = ' The detector relies on the wide gap between f_m and f_p to tell the message from the carrier.';
	else tail = ' The JFET cell only ever handles this narrow band around the carrier, so its op-amp has to be fast at f_p, not at f_m.';
	const product = 'n A_p\\cos(2\\pi f_m t)\\cos(2\\pi f_p t) &= \\dfrac{n A_p}{2}\\cos\\big(2\\pi (f_p - f_m)\\,t\\big) + \\dfrac{n A_p}{2}\\cos\\big(2\\pi (f_p + f_m)\\,t\\big)';
	return [
		h('Where the message went'),
		p(
			`A spectrum analyser sorts a signal by frequency instead of by time. The whistle alone is one line at ${known ? hz(fm) : 'the message frequency f_m'}. Once modulated, that line is gone. Three lines stand in its place: the carrier at f_p, untouched, and two smaller copies of the message just beside it, at f_p - f_m and f_p + f_m${known ? `, ${hz(fp - fm)} and ${hz(fp + fm)}` : ''}. These are the sidebands, and they are where the message travels; each is n / 2 as tall as the carrier.`
		),
		p(
			`The reason is a trigonometric identity: the product of two cosines is two cosines at the sum and the difference of their frequencies. The whole signal is only 2 f_m wide${known ? `, ${hz(2 * fm)} here` : ''}, next to the carrier and far from where the message started. The lower ruler of the figure shows the move.` + tail
		),
		known
			? eq(`\\begin{aligned} ${product} \\\\ f_p \\pm f_m &= ${texInt(fp)} \\pm ${texInt(fm)} = ${texInt(fp - fm)}\\ \\text{Hz and}\\ ${texInt(fp + fm)}\\ \\text{Hz} \\end{aligned}`, "The message term of the AM wave multiplied out, then the two sideband frequencies with this page's carrier and message:")
			: eq(`\\begin{aligned} ${product} \\end{aligned}`, 'The message term of the AM wave multiplied out:')
	];
}

/* --------------------------------------------------------- JFET modulator */

function volumeKnob(ctx) {
	const { design, jfetModel: m, topology, swingFraction, fm } = ctx;
	const model = m && all(m.vp, m.beta) && m.vp < 0 && m.beta > 0 ? m : null;
	const measured = model?.mode === 'measured';
	const vg = model ? (fin(design?.vc) ? design.vc : model.vp / 2) : NaN;
	const g = model ? model.beta * (vg - model.vp) : NaN;
	// beta written the way the page's model was built: from I_DSS, from r_DS(on), or fitted,
	// on the symbolic line and on the numeric one alike
	const line = 'G(V_{GS}) &= \\dfrac{1}{r_{DS}} = \\beta\\,(V_{GS} - V_P)';
	let betaTex = '';
	let sym = `${line}, \\qquad \\beta = \\dfrac{2\\,I_{DSS}}{V_P^{\\,2}}`;
	if (model && !measured && model.mode === 'rdson' && pos(model.rdsOn)) {
		betaTex = `\\dfrac{1}{${texOhms(model.rdsOn)} \\times ${sig(-model.vp)}\\ \\text{V}}`;
		sym = `${line}, \\qquad \\beta = \\dfrac{1}{r_{DS(on)}\\,\\lvert V_P \\rvert}`;
	} else if (model && !measured && pos(model.idss)) {
		betaTex = `\\dfrac{2 \\times ${sig(model.idss * 1000)}\\ \\text{mA}}{(${sig(-model.vp)}\\ \\text{V})^2}`;
	} else if (model) {
		betaTex = `${sig(model.beta * 1000)}\\ \\text{mS/V}`;
		sym = line;
	}
	const where = design ? "at the gate's bias point" : 'in the middle of the line';
	const intro = measured
		? `The channel's conductance against the gate voltage, a straight line of slope beta, then with the line fitted to the measured points, ${where}:`
		: `The channel's conductance against the gate voltage, from the two numbers on a datasheet, then for the part set on this page, ${where}:`;
	const s0 = design && pos(design.vgsPeakSwing) && model ? Math.min(1, design.vgsPeakSwing / (Math.abs(model.vp) / 2)) : swingFraction;
	const props = present({
		vp: model?.vp,
		beta: model?.beta,
		topology: topology === 'inverting' ? 'inverting' : 'noninverting',
		feedback: pos(design?.feedback) ? design.feedback : 10000,
		ac: pos(design?.carrier?.ac) ? design.carrier.ac : 0.1,
		s0: fin(s0) && s0 >= 0 ? Math.min(1, s0) : undefined,
		vc: model && fin(vg) ? vg : undefined
	});
	return [
		h('A transistor used as a volume knob'),
		p(
			"The message has to turn the carrier's height up and down, so the circuit needs a volume knob that a voltage can turn. An op-amp with two resistors is the simplest amplifier there is; the two resistors set its gain and nothing else does. Make one of them change and the gain changes with it. The changing resistor is a JFET."
		),
		p(
			model && pos(model.rdsOn)
				? `For small signals across it, the channel between drain and source behaves as a resistor whose value the gate voltage sets: open at the pinch-off voltage V_P, ${volts(model.vp)} for the part set on this page, about ${ohms(model.rdsOn)} at 0 V. In between, its conductance G, one over its resistance, runs on a straight line. That line is the whole model the tool needs.`
				: 'For small signals across it, the channel between drain and source behaves as a resistor whose value the gate voltage sets: open at the pinch-off voltage V_P, lowest at 0 V. In between, its conductance G, one over its resistance, runs on a straight line. That line is the whole model the tool needs.'
		),
		p(
			`Feed the carrier into the amplifier and the message onto the gate, and the carrier comes out with the message written on its height. The message never passes through the amplifier as a signal; it only turns the knob, ${pos(fm) ? `${sig(fm, 4)} times a second` : 'once every message cycle'}.`
		),
		model && pos(g)
			? eq(`\\begin{aligned} ${sym} \\\\ G(${sig(vg)}\\ \\text{V}) &= ${betaTex}\\,(${sig(vg)} + ${sig(-model.vp)})\\ \\text{V} = ${sig(g * 1000)}\\ \\text{mS}, \\qquad r_{DS} = ${texOhms(1 / g)} \\end{aligned}`, intro)
			: eq(`\\begin{aligned} ${sym} \\end{aligned}`, "The channel's conductance against the gate voltage, from the two numbers on a datasheet:"),
		p(
			'In the figure the green marker is the gate of the moment, and the grey ones are where the message takes it at its trough and its crest.'
		),
		widget('jfet-knob', props)
	];
}

function nonInvertingCell({ design, fp }) {
	const d = design && all(design.carrier?.ac, design.carrier?.carrierOut, design.gDepth, design.gainMin, design.gainMax, design.feedback, design.r1AtCenter, design.nominalGain, design.vc) ? design : null;
	const kCrest = d?.opamp?.kCrest;
	return [
		h('The non-inverting cell'),
		p(
			'The JFET is the lower leg of the divider that sets the gain, under the feedback resistor R_b, and the carrier goes into the + input. One chip does the whole job.' +
				(d
					? ` The ${volts(d.carrier.ac)} of carrier that the divider delivers comes out as ${volts(d.carrier.carrierOut)} at rest. The message swings the gate ${pct(d.gDepth)} % of the way to each end of its line, so the gain swings from ${sig(d.gainMin)} to ${sig(d.gainMax)} and the envelope follows.`
					: ' The message swings the gate along its line, so the gain swings with it and the envelope follows.')
		),
		p(
			'The gain is 1 plus R_b over the channel, as the formula below shows, and the fixed 1 never moves, which dilutes the depth. ' +
				(d && fin(kCrest) && pos(fp)
					? `That is why R_b comes out ${sig(d.feedback / d.r1AtCenter, 2)} times the channel's resistance, ${ohms(d.feedback)} against ${ohms(d.r1AtCenter)}, and why the tool checks that the chip is still fast enough at a gain of ${sig(kCrest)} at ${hz(fp)}.`
					: "That is why R_b comes out many times the channel's resistance, and why the tool checks that the chip is still fast enough at the crest of the envelope.") +
				' The gain cell panel on the page is this one op-amp and this one resistor.'
		),
		d
			? eq(`K = 1 + \\dfrac{R_b}{r_{DS}} = 1 + \\dfrac{${texOhms(d.feedback)}}{${texOhms(d.r1AtCenter)}} = ${sig(d.nominalGain)}`, `The cell's gain with the gate at its bias point, V_C = ${volts(d.vc)}, where the channel is ${ohms(d.r1AtCenter)}:`)
			: eq('K = 1 + \\dfrac{R_b}{r_{DS}} = 1 + R_b\\,G(V_{GS})', "The cell's gain, with r_DS the channel's resistance at the gate voltage of the moment:")
	];
}

function invertingCell({ design }) {
	const d = design && all(design.modulationIndex, design.feedback, design.carrier?.carrierOut, design.r1AtCenter, design.nominalGain, design.vc) ? design : null;
	let follower = 'A follower, an op-amp that copies its input, drives the JFET from almost no resistance, so the crests of the envelope are not squashed.';
	if (d?.buffer && !d.buffer.enabled && pos(d.buffer.dividerImpedance)) follower = `Without the follower, the divider's ${ohms(d.buffer.dividerImpedance)} add to the channel and squash the crests of the envelope; the page flags it.`;
	let post = ' A small extra stage brings the output up to the level asked for.';
	if (d?.postGain?.needed && all(d.postGain.kActual, d.postGain.target)) post = ` A small extra stage, gain ${sig(d.postGain.kActual)}, brings the output up to the ${volts(d.postGain.target)} asked for.`;
	else if (d?.postGain && !d.postGain.needed) post = ' The cell already reaches the output level asked for, so no extra stage follows it.';
	let cost = ' It costs more op-amps than the non-inverting cell and usually gives a cleaner envelope.';
	if (fin(d?.opamp?.opampCount)) {
		const extra = d.opamp.opampCount - 2;
		const count = ['one more op-amp', 'two more op-amps', 'three more op-amps'][extra - 1] ?? `${extra} more op-amps`;
		cost = extra > 0 ? ` It costs ${count} than the non-inverting cell and usually gives a cleaner envelope.` : ' It needs no more op-amps than the non-inverting cell here, and usually gives a cleaner envelope.';
	}
	return [
		h('The inverting cell'),
		p(
			'The JFET is the input resistor of an amplifier that flips the signal, and R_2 is the feedback. No 1 is added, so the gain is the ratio alone and n equals the conductance depth s, how far the JFET swings along its line' +
				(d
					? `: ${fix2(d.modulationIndex)} here, whatever R_2 is. R_2 then only sets the size, ${ohms(d.feedback)} for ${volts(d.carrier.carrierOut)} of carrier at the output of the cell.`
					: ', whatever R_2 is. R_2 then only sets the size.')
		),
		p(follower + post + cost + ' The comparison table further down puts the two side by side.'),
		d
			? eq(`K = \\dfrac{R_2}{r_{DS}} = \\dfrac{${texOhms(d.feedback)}}{${texOhms(d.r1AtCenter)}} = ${sig(d.nominalGain)}`, `The cell's gain with the gate at its bias point, V_C = ${volts(d.vc)}, where the channel is ${ohms(d.r1AtCenter)}:`)
			: eq('K = \\dfrac{R_2}{r_{DS}} = R_2\\,G(V_{GS})', "The cell's gain, with r_DS the channel's resistance at the gate voltage of the moment:")
	];
}

function feedingTheGate({ design, carrierFrom, fp }) {
	const sm = design?.conditioning?.summer;
	const drive =
		design && all(design.conditioning?.sourceAmplitude, design.vgsPeakSwing, sm?.biasActual, design.conditioning?.fmMin)
			? `It scales the message from its ${volts(design.conditioning.sourceAmplitude)} source to a ${volts(design.vgsPeakSwing)} swing, adds the ${volts(sm.biasActual)} bias from the supply, and blocks any offset the source might carry with a capacitor sized so that the lowest message frequency, ${hz(design.conditioning.fmMin)}, still passes.`
			: 'It scales the message, adds a negative bias from the supply, and blocks any offset the source might carry with a capacitor sized so that the lowest message frequency still passes.';
	const c = design?.carrier;
	const known = c && all(c.ac, c.sourceAmplitude, c.divider?.top, c.divider?.bottom);
	let carrier;
	if (carrierFrom === 'wien') {
		carrier = `With the carrier from the on-board Wien oscillator: the board makes its own ${pos(fp) ? hz(fp) : 'carrier'} with a small self-feeding loop that runs at one frequency, designed with the Sine Oscillator tool's method for this op-amp.`;
		if (known) carrier += c.divider.top > 0 ? ` A divider brings its ${volts(c.sourceAmplitude)} down to the ${volts(c.ac)} the JFET can take.` : ` Its ${volts(c.sourceAmplitude)} is already small enough for the JFET.`;
		else carrier += ' A divider brings its output down to the small size the JFET can take.';
		carrier += ' The carrier oscillator panel shows it.';
	} else if (known) {
		carrier =
			c.divider.top > 0
				? `With the carrier from a generator: a ${ohms(c.divider.top)} over ${ohms(c.divider.bottom)} divider brings the carrier down from ${volts(c.sourceAmplitude)} to ${volts(c.ac)}, because the JFET only behaves as a plain resistor while the voltage across it stays small.`
				: `With the carrier from a generator: the ${volts(c.sourceAmplitude)} source is already small enough, so no divider is needed. The JFET only behaves as a plain resistor while the voltage across it stays small.`;
		carrier += c.limit === 'opamp' ? " Here the op-amp's output swing at the crest gain sets a tighter limit than the JFET does; the carrier path panel shows both." : ' The tool sets that limit from V_P and the gate swing, and the carrier path panel shows the divider.';
	} else {
		carrier = 'With the carrier from a generator: a divider brings the carrier down to a small fraction of a volt, because the JFET only behaves as a plain resistor while the voltage across it stays small. The carrier path panel shows it.';
	}
	return [
		h('Feeding the gate, finding a carrier'),
		p('The gate wants the message in a particular form: sitting on a steady negative voltage, the middle of the line, and neither too large nor too small. The gate drive panel on the page does that with one op-amp. ' + drive),
		p(carrier)
	];
}

function jfetNumbers({ design, fp }) {
	const o = design?.opamp;
	const c = design?.carrier;
	const live = design && o && c && all(design.modulationIndex, o.gbw, o.kCrest, o.bwCrest, o.factorCrest, o.effectiveModulationIndex, o.peakModulationIndex, o.thd, c.tone2fpDbc) && pos(fp);
	if (!live) {
		return [
			h('What the numbers on the page mean'),
			p(
				'Once the design is complete, the op-amp limits panel compares the index asked for with the one the circuit delivers. Two things pull them apart. The op-amp cannot hold a large gain at a fast carrier, which squashes the crests. The JFET adds a small tone at twice the carrier, which lifts every peak.'
			),
			eq('f_B = \\dfrac{\\text{GBW}}{K_{crest}}', 'The frequency up to which the op-amp holds the crest gain, gain and speed trading against each other:')
		];
	}
	const fast = o.gbwOk === true;
	// an inverting stage works its op-amp at one more than its own gain
	const crest =
		design.topology === 'inverting' && fin(design.gainMax)
			? `At the crest of the envelope the cell's gain is ${sig(design.gainMax)}, and an inverting stage asks its op-amp for one more than its gain, ${sig(o.kCrest)}. The op-amp holds that flat only well below ${hz(o.bwCrest)}`
			: `At the crest of the envelope the cell asks the op-amp for a gain of ${sig(o.kCrest)}, which it holds flat only well below ${hz(o.bwCrest)}`;
	return [
		h('What the numbers on the page mean'),
		p(
			`The design aims for n = ${fix2(design.modulationIndex)}. Two things pull the real figure away from it. The op-amp is not infinitely fast: its gain-bandwidth product, ${hz(o.gbw)} for the part set on the page, is the gain it can hold times the frequency it holds it at. ${crest}${fast ? `, and ${hz(fp)} is far enough below it` : `, and ${hz(fp)} is not well below it`}. The crests come out ${pct(1 - o.factorCrest)} % low, so the effective index is ${fix2(o.effectiveModulationIndex)}.`
		),
		p(
			`The JFET is not a perfect resistor either: it bends slightly and adds a small tone at twice the carrier, ${sig(-c.tone2fpDbc, 2)} dB below it (${sig(10 ** (-c.tone2fpDbc / 20), 2)} times smaller in voltage), which lifts every peak, so the index read from the peaks is ${fix2(o.peakModulationIndex)}. The THD figure, for total harmonic distortion, is ${pct(o.thd)} % here. It says how far the envelope's shape strays from the message: below 1 % is clean${o.thd < 0.01 ? ', and this design is there.' : ', and the comparison table shows how the other cell does on the same parts.'}`
		),
		eq(`f_B = \\dfrac{\\text{GBW}}{K_{crest}} = \\dfrac{${texHz(o.gbw)}}{${sig(o.kCrest)}} = ${texHz(o.bwCrest)}`, 'The frequency up to which the op-amp holds the crest gain, gain and speed trading against each other:')
	];
}

function jfetRest({ design, topology, carrierFrom }) {
	const post = topology === 'inverting' && design?.postGain?.needed ? ' and its post-gain stage' : '';
	const osc = carrierFrom === 'wien' ? ', the carrier oscillator' : '';
	return [
		h('Reading the rest of the page'),
		p(
			`The panels below follow the circuit from the part to the output. JFET characteristics sets the straight line, from datasheet numbers or from measured points. Sources and op-amp holds the message, the carrier, the supply and the op-amp. Then come the gain cell${post}, the carrier path, the op-amp limits with both cells side by side${osc}, the gate drive and a preview of the output.`
		),
		p('Each result panel has a Show the math section, and the formula sheet collects every formula. The download gives a script, an LTspice schematic and a netlist of the whole modulator.')
	];
}

/* --------------------------------------------------- diode and tank modulator */

function diodeBend({ fp, fm, diodeDesign: dd, carrierAmp, modAmp }) {
	const known = pos(fp, fm) && fp > fm;
	const vf = fin(dd?.diodeVf) ? dd.diodeVf : null;
	const square = 'i &= a_1 v + a_2 v^2 + \\dots, \\qquad v = x_p + x_m \\\\ a_2 v^2 &= a_2 x_p^2 + 2 a_2\\,x_p\\,x_m + a_2 x_m^2';
	const live = known && pos(carrierAmp, modAmp);
	const props = present({
		fp: known ? fp : undefined,
		fm: known ? fm : undefined,
		f0: pos(dd?.f0Actual) ? dd.f0Actual : undefined,
		q0: pos(dd?.qActual) ? dd.qActual : undefined,
		ap: pos(carrierAmp) ? carrierAmp : undefined,
		am: pos(modAmp) ? modAmp : undefined
	});
	return [
		h('Add them, then bend the sum through one diode'),
		p(
			`Add the carrier and the message in a summing amplifier and nothing new appears: the sum still contains only ${known ? `${hz(fp)} and ${hz(fm)}` : 'the carrier and the message'}. Push the sum through one diode and something new does. A diode lets current through one way only and bends what it lets through, so its output is roughly the input plus the input squared.`
		),
		p(
			`Squaring a sum of two cosines makes their product, and a product, as the section on where the message went showed, is two new cosines at the sum and the difference of the frequencies${known ? `, ${hz(fp + fm)} and ${hz(fp - fm)}` : ''}. The rest is unwanted. The plain term passes the message itself${known ? ` at ${hz(fm)}` : ''}, and the squared term adds twice the carrier${known ? ` at ${hz(2 * fp)}` : ''}, twice the message and a steady offset.`
		),
		p(
			`The diode only bends near its knee, about ${vf !== null ? volts(vf) : '0.7 V'}, so the sum is lifted by a DC bias that keeps it there through the whole cycle. The figure below does the bending; the grey curve is the tank of the next section.`
		),
		live
			? eq(`\\begin{aligned} ${square} \\\\ 2 a_2\\,x_p\\,x_m &= 2 a_2 \\cdot ${texVolts(carrierAmp)} \\cdot ${texVolts(modAmp)}\\,\\cos(2\\pi \\cdot ${texInt(fp)}\\,t)\\cos(2\\pi \\cdot ${texInt(fm)}\\,t) \\end{aligned}`, "The diode's curve written as a series in v, the sum of the carrier x_p and the message x_m. The squared term holds their product, written out on the last line with this page's two amplitudes and frequencies:")
			: eq(`\\begin{aligned} ${square} \\end{aligned}`, "The diode's curve written as a series in v, the sum of the carrier x_p and the message x_m. The squared term holds their product:"),
		widget('diode-bend', props)
	];
}

function tankSection({ fp, fm, diodeDesign: dd }) {
	const known = pos(fp, fm) && fp > fm;
	const live = known && dd && pos(dd.inductance, dd.capacitance, dd.f0Actual, dd.sidebandMargin, dd.q, dd.bandwidth);
	const sym = 'f_0 &= \\dfrac{1}{2\\pi\\sqrt{LC}} \\\\ Q &= \\dfrac{f_p}{\\text{BW}} = \\dfrac{f_p}{2 \\cdot \\text{margin} \\cdot f_{m,max}}';
	return [
		h('One coil and one capacitor keep the wanted part'),
		p(
			`A coil and a capacitor in parallel pass energy back and forth between them at one frequency only, f_0. Loaded with them, the diode's output is a large voltage near f_0 and almost nothing elsewhere. The tank rings with the carrier and its two sidebands, and lets the message, the offset and ${known ? `the ${hz(2 * fp)} tone` : 'twice the carrier'} fall away. What is left is the AM wave of the first figure.`
		),
		p(
			'How narrowly it selects is Q, f_0 divided by the width of the band it passes. Q must be high enough to drop the unwanted parts, but not so high that the sidebands fall outside the band.' +
				(live
					? ` The page asks the band to be ${sig(dd.sidebandMargin)} times the ${hz(2 * fm)} the sidebands need, ${hz(dd.bandwidth)}, and a resistor across the tank sets Q.`
					: ' The page asks the band to be a margin wider than the sidebands need, and a resistor across the tank sets Q.')
		),
		p('It is the oldest modulator: one diode does the mixing, and nothing has to be fast. But it needs a real coil, bulky and hard to make accurate, which is why the JFET modulator on this page exists.'),
		live
			? eq(
					`\\begin{aligned} f_0 &= \\dfrac{1}{2\\pi\\sqrt{LC}} = \\dfrac{1}{2\\pi\\sqrt{${texSI(dd.inductance, 'H')} \\times ${texSI(dd.capacitance, 'F')}}} = ${texHz(dd.f0Actual)} \\\\ Q &= \\dfrac{f_p}{\\text{BW}} = \\dfrac{f_p}{2 \\cdot \\text{margin} \\cdot f_{m,max}} = \\dfrac{${texInt(fp)}}{2 \\times ${sig(dd.sidebandMargin)} \\times ${texInt(fm)}} = ${sig(dd.q)} \\end{aligned}`,
					"Where the tank rings, and how sharply it must ring to pass both sidebands with the margin asked for, with this page's coil, capacitor and message band:"
				)
			: eq(`\\begin{aligned} ${sym} \\end{aligned}`, 'Where the tank rings, and how sharply it must ring to pass both sidebands with the margin asked for:')
	];
}

// the tank's response at f, relative to its peak
const tankGain = (f, f0, q) => 1 / Math.sqrt(1 + q * q * (f / f0 - f0 / f) ** 2);

function diodeNumbers({ fp, fm, diodeDesign: dd, carrierAmp, modAmp }) {
	const known = pos(fp, fm) && fp > fm;
	const live = known && dd && pos(dd.capacitance, dd.inductance, dd.f0Actual, dd.resistance, dd.qActual, dd.bwActual);
	if (!live) {
		return [
			h('What the numbers on the page mean'),
			p(
				'Resonant frequency f_0: the tank capacitor is made from stock values, so the tank lands close to the carrier, if not exactly on it. Q and bandwidth: the resistor across the tank sets how wide a band passes. Required DC bias: what keeps the diode conducting through the deepest trough of the sum. Sideband margin: the slack between the band the tank passes and the band the sidebands need.'
			),
			eq('V_{bias} = A_p + A_m + V_F + V_{margin}', 'The bias that keeps the diode past its knee at the bottom of the sum, with V_margin the bias margin field:')
		];
	}
	const shift = Math.abs(dd.f0Actual - fp) / fp;
	const lo = dd.f0Actual - dd.bwActual / 2;
	const hi = dd.f0Actual + dd.bwActual / 2;
	const lowOut = fp - fm < lo;
	const highOut = fp + fm > hi;
	let band = ' Both sidebands fall inside that band.';
	if (lowOut && highOut) band = ' Even so, both sidebands sit outside it: the band is narrower than the sidebands need.';
	else if (lowOut || highOut) {
		const hLow = tankGain(fp - fm, dd.f0Actual, dd.qActual);
		const hHigh = tankGain(fp + fm, dd.f0Actual, dd.qActual);
		const ratio = lowOut ? hLow / hHigh : hHigh / hLow;
		band = ` The shift of f_0 is larger than the margin, though: the ${lowOut ? 'lower' : 'upper'} sideband, at ${hz(lowOut ? fp - fm : fp + fm)}, sits outside the band and comes out at ${pct(ratio)} % of the other one. A capacitor closer to the target, or a coil value that suits the stock ones, centres the band again.`;
	}
	const bias = dd.requiredBias;
	const vf = dd.diodeVf;
	const margin = all(bias, carrierAmp, modAmp, vf) ? bias - carrierAmp - modAmp - vf : NaN;
	const biasLive = all(bias, carrierAmp, modAmp, vf, margin);
	// the tank capacitor: one stock part, or a stock pair in parallel that lands closer
	const pair = Array.isArray(dd.capacitors) && dd.capacitors.length === 2 && pos(...dd.capacitors) ? dd.capacitors : null;
	const cText = pair
		? `two stock capacitors in parallel, ${si(pair[0], 'F')} and ${si(pair[1], 'F')}, make ${si(dd.capacitance, 'F')} for a ${si(dd.inductance, 'H')} coil`
		: `the capacitor is picked from stock values, ${si(dd.capacitance, 'F')} for a ${si(dd.inductance, 'H')} coil`;
	// a stock resistor rounded down gives a lower Q and a wider band, the safe side
	const qBand =
		pos(dd.q) && dd.qActual < dd.q
			? `Q = ${sig(dd.qActual)}, a little under the ${sig(dd.q)} asked for, so the band is a little wider: ${hz(dd.bwActual)}`
			: `Q = ${sig(dd.qActual)}${pos(dd.q) ? ` where ${sig(dd.q)} was asked for` : ''}, and a band ${hz(dd.bwActual)} wide`;
	return [
		h('What the numbers on the page mean'),
		p(`Resonant frequency f_0: ${cText}, so the tank lands at ${hz(dd.f0Actual)}${shift < 0.005 ? `, right on the ${hz(fp)} carrier.` : ` rather than ${hz(fp)}.`}`),
		p(`Q and bandwidth: the ${ohms(dd.resistance)} stock resistor across the tank gives ${qBand}, against the ${hz(2 * fm)} the two sidebands span.` + band),
		p(
			(biasLive
				? `Required DC bias: what keeps the diode conducting through the deepest trough of the sum, both amplitudes plus the knee plus the bias margin field, ${volts(bias)} here.`
				: 'Required DC bias: what keeps the diode conducting through the deepest trough of the sum, both amplitudes plus the knee plus the bias margin field.') +
				' Sideband margin: the slack between the band the tank passes and the band the sidebands need. The Q slider of the figure above shows what happens when Q takes it away.'
		),
		biasLive
			? eq(`V_{bias} = A_p + A_m + V_F + V_{margin} = ${sig(carrierAmp)} + ${sig(modAmp)} + ${sig(vf)} + ${sig(margin)} = ${texVolts(bias)}`, "The bias that keeps the diode past its knee at the bottom of the sum, with this page's amplitudes, diode and bias margin:")
			: eq('V_{bias} = A_p + A_m + V_F + V_{margin}', 'The bias that keeps the diode past its knee at the bottom of the sum, with V_margin the bias margin field:')
	];
}

function diodeRest() {
	return [
		h('Reading the rest of the page'),
		p(
			'The first panel holds the carrier, the message band, the sideband margin, the coil, the two amplitudes and the diode. The second draws the summer and the diode with its tank, lists the parts, and has a Show the math section that derives each one. The download hands back a script that holds the whole design, and the formula sheet collects every formula.'
		)
	];
}

/* ------------------------------------------------------------ demodulator */

function rippleOf({ rectifierType, rippleHz, fp }) {
	if (pos(rippleHz)) return rippleHz;
	if (pos(fp)) return rectifierType === 'half' ? fp : 2 * fp;
	return NaN;
}

function rectifierSection(ctx) {
	const { rectifierType, demoModIndex: n } = ctx;
	const full = rectifierType !== 'half';
	const ripple = rippleOf(ctx);
	const second = full
		? `The page is set to full-wave: two op-amps and two diodes go one better and flip the bottom half upward instead of dropping it, so every crest, top and bottom, points the same way. What is left is a train of bumps at twice the carrier rate${pos(ripple) ? `, ${hz(ripple)},` : ''} whose heights follow the envelope: the message plus a fast ripple.`
		: `The page is set to half-wave: a single diode simply drops the bottom half, so only the top crests remain. What is left is a train of bumps at the carrier rate${pos(ripple) ? `, ${hz(ripple)},` : ''} whose heights follow the envelope: the message plus a fast ripple, with twice the gap between bumps that a full-wave rectifier would leave.`;
	const lhs = full ? '\\big|x(t)\\big|' : '\\max\\big(x(t),\\,0\\big)';
	const avg = full ? '\\dfrac{2 A_p}{\\pi}' : '\\dfrac{A_p}{\\pi}';
	const harmonics = full ? '2 f_p,\\ 4 f_p,\\ \\dots' : 'f_p,\\ 2 f_p,\\ \\dots';
	const sym = `${lhs} &= ${avg}\\,\\big[1 + n\\,m(t)\\big] + \\text{ripple at } ${harmonics}`;
	const live = pos(ripple) && fin(n) && n >= 0;
	const scale = (full ? 2 : 1) / Math.PI;
	const what = full ? 'A full-wave' : 'A half-wave';
	return [
		h('One diode cuts the wave in half'),
		p(
			'The detector has to turn the envelope back into a voltage, and the envelope is only the height of the wave, never its sign. So the first step is to get rid of the sign. One diode does it: it passes the top half of each carrier cycle and blocks the bottom half.'
		),
		p(second),
		p('Averaged over one carrier cycle, the bumps are the envelope scaled by a constant. The rest of the detector is about removing the ripple without touching the message.'),
		live
			? eq(`\\begin{aligned} ${sym} \\\\ &= ${texVolts(DEMOD_AP * scale)}\\,\\big[1 + ${fix2(n)}\\,m(t)\\big] + \\text{ripple at } ${texInt(ripple)}\\ \\text{Hz} \\end{aligned}`, `${what} rectified AM wave: the envelope scaled by the average of a rectified cosine, plus the ripple the filter removes, then with the preview's ${volts(DEMOD_AP)} carrier and index:`)
			: eq(`\\begin{aligned} ${sym} \\end{aligned}`, `${what} rectified AM wave: the envelope scaled by the average of a rectified cosine, plus the ripple the filter removes:`)
	];
}

// the spec in decibels is spelled out in the smoothing section when the page has one
const specKnown = ({ amaxDb, aminDb, fm }, ripple) => pos(amaxDb, aminDb, fm, ripple) && ripple > fm;

// the envelope figure draws the page's own ratio of carrier to message,
// kept between 4 and 80 carrier cycles per message cycle
const drawnAsPage = ({ fp, fm }) => pos(fp, fm) && fp / fm >= 4 && fp / fm <= 80;

function smoothingSection(ctx) {
	const { fp, fm, rectifierType, demoModIndex, amaxDb, aminDb } = ctx;
	const ripple = rippleOf(ctx);
	const rc = pos(fp) ? 3 / fp : NaN;
	const fc = pos(rc) ? 1 / (2 * Math.PI * rc) : NaN;
	const known = pos(fm, ripple, fc) && ripple > fm;
	let second = 'Between the message and the ripple there is room, but one RC falls slowly, ten times for every tenfold in frequency. The figure shows the trade on one slider.';
	if (known) {
		const att = Math.sqrt(1 + (ripple / fc) ** 2);
		const loss = 1 - 1 / Math.sqrt(1 + (fm / fc) ** 2);
		second = `Between ${hz(fm)} and ${hz(ripple)} there is room, but one RC falls slowly, ten times for every tenfold in frequency. With the corner at ${hz(fc)} it turns the ${hz(ripple)} ripple down by a factor of about ${sig(att, 2)}, and at ${hz(fm)} it already takes ${pct(loss)} % off the message. The figure shows the trade on one slider.`;
	}
	let third = 'The tool asks for both at once, the message flat within Amax and the ripple down by Amin, which one resistor and one capacitor rarely give.';
	if (specKnown(ctx, ripple)) {
		// one RC set to lose exactly Amax at the top of the message band
		const fcNeed = fm / Math.sqrt(10 ** (amaxDb / 10) - 1);
		const attNeed = 10 * Math.log10(1 + (ripple / fcNeed) ** 2);
		third = `The tool asks for both at once, in decibels, a ratio worth 20 dB for each factor of ten in voltage: the message flat within ${sig(amaxDb)} dB and the ripple down ${sig(aminDb)} dB, a factor of ${sig(10 ** (aminDb / 20))}.`;
		third +=
			attNeed >= aminDb
				? ` Here one RC could just manage it, set to lose ${sig(amaxDb)} dB at ${hz(fm)}; the designed filter does it with room to spare.`
				: ` One resistor and one capacitor cannot give that: set to lose exactly ${sig(amaxDb)} dB at ${hz(fm)}, the corner sits at ${hz(fcNeed)} and the ripple comes down only ${sig(attNeed)} dB.`;
	}
	const props = present({
		n0: fin(demoModIndex) ? demoModIndex : undefined,
		fp: pos(fp) ? fp : undefined,
		fm: pos(fm) ? fm : undefined,
		rectifier: rectifierType === 'half' ? 'half' : 'full'
	});
	return [
		h('One resistor and one capacitor smooth the bumps'),
		p(
			'Put a resistor and a capacitor after the diode and the bumps are averaged into a smooth line. A capacitor charging through a resistor cannot follow fast changes: that is a low-pass filter, and its corner f_c, the frequency where it starts to cut, has to sit between the message and the ripple. Too low and the message itself is smeared: the line lags the envelope and its dips round off. Too high and the ripple survives.'
		),
		p(second),
		p(third),
		pos(rc, fc)
			? eq(`f_c = \\dfrac{1}{2\\pi RC} = \\dfrac{1}{2\\pi \\times ${texSI(rc, 's')}} = ${texHz(fc)}`, `The corner of one RC, with RC set to three carrier periods${drawnAsPage(ctx) ? ', where the figure starts' : ''}:`)
			: eq('f_c = \\dfrac{1}{2\\pi RC}', 'The corner of one RC:'),
		widget('envelope', props)
	];
}

function realDetector(ctx) {
	const { fp, fm, rectifierType, envelopeDesign: ed, amaxDb, aminDb } = ctx;
	const full = rectifierType !== 'half';
	const ripple = rippleOf(ctx);
	const r = designPrecisionRectifier().r1;
	const first = full
		? `Two upgrades turn the sketch into the circuit on the page. A plain diode loses the first 0.7 V or so of every crest and mangles small signals. Putting the diodes inside an op-amp's feedback makes the amplifier correct for their drop: the precision full-wave rectifier of the rectifier panel, two op-amps and three equal ${ohms(r)} resistors.`
		: "One upgrade turns the sketch into the circuit on the page, and it is in the filter. A plain diode loses the first 0.7 V or so of every crest and mangles small signals. The half-wave choice keeps that single diode anyway: cheaper, and good enough while the signal stays large next to its drop. The full-wave choice would put the diodes inside an op-amp's feedback, where the amplifier corrects for their drop.";
	const spec = pos(fm, ripple, amaxDb, aminDb);
	const second =
		'The smoothing RC becomes a designed low-pass, built with the same method as the Active Filter Design tool. ' +
		(specKnown(ctx, ripple) ? '' : 'A decibel is a ratio: 20 dB for each factor of ten in voltage. ') +
		(spec
			? `The message band up to ${hz(fm)} is the passband, allowed to vary by Amax = ${sig(amaxDb)} dB. The ripple at ${hz(ripple)} is the stopband, to be cut by at least Amin = ${sig(aminDb)} dB.`
			: 'The message band is the passband, allowed to vary by Amax. The ripple is the stopband, to be cut by at least Amin.');
	let third = 'The tool finds the smallest order that meets both, and the preview draws the recovered message at the index set on the page.';
	if (ed && fin(ed.n) && Array.isArray(ed.realized)) {
		const stages = ed.realized.length;
		const shape = ed.response === 'chebyshev' ? 'Chebyshev' : 'Butterworth';
		third = `The tool finds the smallest order that meets both, the order being how steeply the filter falls: each step of order adds another tenfold of cut per tenfold in frequency. It rounds the order up to an even number, since each Sallen-Key stage, one op-amp with two resistors and two capacitors, is order 2: order ${ed.n} here, ${stages === 1 ? 'one stage' : `${stages} stages`} of stock parts with a ${shape} response. The preview draws the recovered message at the index set on the page.`;
	}
	const rc = pos(fp) ? 3 / fp : NaN;
	const fc = pos(rc) ? 1 / (2 * Math.PI * rc) : NaN;
	const oneRc = pos(ripple, fc) && ripple > fc ? 20 * Math.log10(ripple / fc) : NaN;
	const live = pos(aminDb, oneRc);
	return [
		h('Growing it into the real detector'),
		p(first),
		p(second),
		p(third),
		live
			? eq(
					`\\begin{aligned} A_{min} &= 20\\log_{10}\\dfrac{V_{in}}{V_{out}} = 20\\log_{10}(${sig(10 ** (aminDb / 20))}) = ${sig(aminDb)}\\ \\text{dB} \\\\ A_{RC} &\\approx 20\\log_{10}\\dfrac{f_{\\text{ripple}}}{f_c} = 20\\log_{10}\\dfrac{${texInt(ripple)}}{${texInt(fc)}} = ${sig(oneRc)}\\ \\text{dB} \\end{aligned}`,
					`What the stopband figure asks for as a ratio of voltages, then what one RC with its corner at ${hz(fc)} manages at this page's ripple, far above that corner${oneRc < aminDb ? ', short of it' : ''}:`
				)
			: eq('A_{min} = 20\\log_{10}\\dfrac{V_{in}}{V_{out}}', 'What the stopband figure asks for, as a ratio of voltages:')
	];
}

function demodRest({ rectifierType }) {
	const full = rectifierType !== 'half';
	return [
		h('Reading the rest of the page'),
		p(
			`The first panel holds the rectifier choice, the carrier, the highest message frequency, Amax, Amin, the response and the preview index. The rectifier panel ${full ? 'draws the precision rectifier and its parts' : 'names the single diode'}; the envelope low-pass panel lists each stage with its parts; the preview shows the wave before and after the rectifier. The rectifier and filter panels each have a Show the math section, the download gives a script that holds the whole design, and the formula sheet collects every formula.`
		)
	];
}

/* ---------------------------------------------------------- glossary */

function glossary({ mode, fp }) {
	const list = [
		['carrier', pos(fp) ? `the fast sine wave that does the carrying; ${hz(fp)} here, set by the carrier frequency field` : 'the fast sine wave that does the carrying, set by the carrier frequency field'],
		['message', 'the slow signal to be carried, audio here; also called the modulating signal, m(t)'],
		['envelope', "the outline along the carrier's peaks; the message plus a constant"],
		['modulation index n', 'how deep the envelope dips: 0 is no message, 1 touches zero, above 1 the envelope folds'],
		['sidebands', 'the two copies of the message at f_p - f_m and f_p + f_m; the only places the message exists after modulation'],
		['gain', `how many times an amplifier enlarges its input${mode === 'jfet' ? '; in the JFET modulator the message changes it cycle by cycle' : ''}`],
		['op-amp', 'the amplifier chip the circuits are built around; two resistors set its gain']
	];
	if (mode === 'diode') list.push(['tank', 'a coil and a capacitor that ring at one frequency; Q says how narrowly']);
	else if (mode === 'demod') list.push(['rectifier', 'a circuit that makes a wave all positive, by flipping (full-wave) or removing (half-wave) its negative half; what is left carries ripple at 2 f_p or f_p']);
	else list.push(['JFET', 'a transistor used here as a resistor set by its gate voltage; V_P and I_DSS describe one']);
	return [h('Words used on this page'), terms(list)];
}

/* ------------------------------------------------------------- entry */

export function modulationBasics({
	mode = 'jfet',
	topology = 'noninverting',
	carrierFrom = 'source',
	rectifierType = 'full',
	design = null,
	jfetModel = null,
	swingFraction,
	targetN,
	fp,
	fm,
	diodeDesign = null,
	carrierAmp,
	modAmp,
	envelopeDesign = null,
	demoModIndex,
	rippleHz,
	amaxDb,
	aminDb
} = {}) {
	const ctx = { mode, topology, carrierFrom, rectifierType, design, jfetModel, swingFraction, targetN, fp, fm, diodeDesign, carrierAmp, modAmp, envelopeDesign, demoModIndex, rippleHz, amaxDb, aminDb };
	const common = [hook(ctx), ...noteOnAScope(ctx), ...carrierCopies(ctx), ...formulaSection(ctx), ...readingN(ctx), ...whereItWent(ctx)];
	let circuit;
	if (mode === 'diode') circuit = [...diodeBend(ctx), ...tankSection(ctx), ...diodeNumbers(ctx), ...diodeRest()];
	else if (mode === 'demod') circuit = [...rectifierSection(ctx), ...smoothingSection(ctx), ...realDetector(ctx), ...demodRest(ctx)];
	else circuit = [...volumeKnob(ctx), ...(topology === 'inverting' ? invertingCell(ctx) : nonInvertingCell(ctx)), ...feedingTheGate(ctx), ...jfetNumbers(ctx), ...jfetRest(ctx)];
	return [...common, ...circuit, ...glossary(ctx)];
}
