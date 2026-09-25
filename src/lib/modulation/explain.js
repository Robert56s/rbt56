import { buildJfetTestDiagram } from './circuits';
import { DIODE_MODELS } from './diodeLaw';
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

const n1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
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
function table(headRow, rows) {
	return { type: 'table', head: headRow, rows };
}
function steps(items) {
	return { type: 'steps', items };
}
function figure(diagram, label) {
	return { type: 'figure', diagram, label };
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

/**
 * The guide under the JFET fields: which figures a datasheet prints, which
 * the page works out from them, and how to measure the part in hand. The
 * same for every design, so it takes no arguments.
 */
export function explainJfetSourcing() {
	return [
		head('1. Read on the datasheet'),
		p('Three lines of the electrical characteristics table fill the fields above. Makers print limits (a minimum, a maximum or a range), never the value of the part in hand.'),
		table(
			['Field here', 'Datasheet line', 'Maker\'s test condition'],
			[
				['V_P', 'Gate-source cutoff voltage V_GS(off), also called pinch-off voltage', 'a tiny drain current, 1 nA to 1 µA'],
				['I_DSS', 'Zero-gate-voltage drain current I_DSS', 'V_GS = 0, V_DS about 15 V, often a short pulse'],
				['r_DS(on)', 'Drain-source on-resistance r_DS(on), on switching JFETs (J111 to J113)', 'V_GS = 0, V_DS of 0.1 V or less'],
				['r_DS(on) ≈ 1/|y_fs|', 'Forward transfer admittance |y_fs| or g_fs, on amplifier JFETs (2N5457, 2N3819) that print no r_DS(on)', 'V_GS = 0, V_DS about 15 V, 1 kHz']
			]
		),
		p('Enter V_P and one of the other two. For V_P take the middle of the V_GS(off) range, as the presets do. r_DS(on) is printed as a maximum and I_DSS as a minimum, so both describe the weakest part the maker will ship, not a typical one.'),
		head('2. Worked out on this page'),
		p('The design needs one straight line: the channel conductance G against the gate voltage. Its zero is V_P and its slope is beta. No datasheet prints beta; it follows from V_P and either of the other two figures, which is also why either one gives the other:'),
		eq('G(V_{GS}) = \\beta\\,(V_{GS} - V_P), \\qquad \\beta = \\dfrac{2 I_{DSS}}{V_P^2} = \\dfrac{1}{r_{DS(on)}\\,|V_P|}'),
		p('The same model says the channel conductance at V_GS = 0 equals the transconductance there, the figure amplifier datasheets print, hence the last row of the table:'),
		eq('r_{DS(on)} = \\dfrac{|V_P|}{2 I_{DSS}} = \\dfrac{1}{g_{fs0}}, \\qquad g_{fs0} = \\dfrac{2 I_{DSS}}{|V_P|}'),
		p('Everything after that is computed too: the bias V_C = V_P/2, the channel resistance there, and the JFET model of the LTspice export, whose Beta is half this page\'s beta because SPICE writes the square law as Beta (V_GS - V_P)²:'),
		eq('\\text{SPICE: } V_{to} = V_P, \\qquad \\text{Beta} = \\dfrac{I_{DSS}}{V_P^2} = \\dfrac{\\beta}{2}'),
		head('3. Measure it in the lab'),
		p('Two JFETs with the same part number can differ by a factor of three or more, so the part that goes on the board is worth measuring. The safest way is also the one the Measured points mode reads: the channel as a resistor with a small voltage across it, exactly how the modulator uses it.'),
		figure(buildJfetTestDiagram(), 'JFET channel measurement: V_in through R_series into the drain, source grounded, gate at an adjustable V_GS, a voltmeter on the drain and one on the gate'),
		steps([
			'Ground the source. Feed the drain from a small V_in, 0.1 V to 0.2 V, through R_series of about twice the expected r_DS(on), the channel\'s value at the bias point. V_D can never exceed V_in, which keeps the channel ohmic everywhere but in the last few tenths of a volt before V_P.',
			'Drive the gate from an adjustable negative voltage, for instance a potentiometer across a negative supply. The gate draws almost no current.',
			'Start at V_GS = 0 and step towards V_P in about ten steps. At each step read V_GS at the gate, V_in at the top of R_series and V_D at the drain.',
			'Stop when V_D is almost V_in: the channel is nearly closed.',
			'Choose Measured points above and enter one row per step: V_GS V_in V_D R_series, with R_series as measured on an ohmmeter. The page turns each row into a conductance and fits the line.',
			'Set the fit window on the straight stretch, leaving out the last points near V_P, where a real channel closes gradually rather than at once.'
		]),
		eq('r_{DS} = R_{series}\\,\\dfrac{V_D}{V_{in} - V_D}, \\qquad G = \\dfrac{1}{r_{DS}} = a\\,V_{GS} + b \\ \\Rightarrow\\ V_P = -\\dfrac{b}{a}, \\quad \\beta = a'),
		p('The fitted V_P lands a little closer to 0 V than a V_GS(off) reading, which is taken at a tiny current, out in that gradual tail. The design runs on the line, so the fitted value is the one to keep.'),
		head('Quick readings without the fit'),
		steps([
			'V_P, any JFET: gate to ground, 1 MΩ from source to ground, drain at +15 V. The source rises until the channel is almost closed, so a 10 MΩ voltmeter on the source reads about |V_P| (V_GS(off) at a few microamps, like a datasheet).',
			'I_DSS, low-current parts only: gate tied to source, V_DS about 10 V (more than |V_P|), read the drain current briefly. 10 V x 5 mA = 50 mW is fine for a 2N5457; a J111 passes 20 mA or more, so measure it the ohmic way instead.'
		]),
		p('Both go into the V_P and I_DSS mode.')
	];
}

/** Where the JFET's numbers came from: the datasheet pair, or a line fitted to measurements. */
export function explainJfetModel(model) {
	if (!model) return [];
	const { mode, vp, beta, idss, rdsOn } = model;
	const common = [
		p(
			'Everything the gain cell needs from the JFET is one straight line, the conductance against the gate voltage. Its slope is called beta and its zero is the pinch-off voltage V_P. Any two facts about the part fix that line.'
		),
		eq('G(V_{GS}) = \\dfrac{1}{r_{DS}} = \\beta\\,(V_{GS} - V_P)')
	];
	if (mode === 'idss') {
		return [
			...common,
			p('From the datasheet pair (V_P, I_DSS): I_DSS is the saturation current with the gate at 0 V, and the square-law model ties the slope of the ohmic line to it:'),
			eq(`\\beta = \\dfrac{2 I_{DSS}}{V_P^2} = \\dfrac{2 \\times ${(idss * 1000).toFixed(2)}\\ \\text{mA}}{(${n2(vp)})^2} = ${(beta * 1000).toFixed(4)}\\ \\text{mS/V}, \\qquad r_{DS}(0) = \\dfrac{1}{\\beta |V_P|} = ${formatOhms(rdsOn)}`),
			p(
				'A word of caution with parts like the J111: measuring I_DSS the obvious way, gate shorted and a large V_DS, puts V_DS x I_DSS into a TO-92, and 20 mA or more at 10 V is beyond what it dissipates. The ohmic-region measurement below is safer and is what the design actually uses.'
			)
		];
	}
	if (mode === 'rdson') {
		return [
			...common,
			p('From the datasheet pair (V_P, r_DS(on)): r_DS(on) is the channel resistance with the gate at 0 V, the top of the line, so the slope follows directly. The I_DSS it implies is shown for comparison with the other datasheet figure:'),
			eq(`\\beta = \\dfrac{1}{r_{DS(on)}\\,|V_P|} = \\dfrac{1}{${formatOhms(rdsOn)} \\times ${n2(Math.abs(vp))}} = ${(beta * 1000).toFixed(4)}\\ \\text{mS/V}, \\qquad I_{DSS} = \\dfrac{\\beta V_P^2}{2} = ${(idss * 1000).toFixed(2)}\\ \\text{mA}`),
			p(
				'Datasheet presets fill this mode with LIMITS, not typicals: the largest r_DS(on) and the middle of the V_P range the maker guarantees. A real part is usually better, and V_P in particular varies by a factor of three across the range, so a measurement replaces the preset as soon as one is available.'
			)
		];
	}
	const f = model.fit;
	return [
		...common,
		p(
			`From measurements: each row gives the channel resistance at one gate voltage, either read directly or from a divider (V_in through R_series into the drain, V_D at the drain, source grounded, so r_DS = R_series V_D / (V_in - V_D)). Turned into conductances, the ${f.count} points inside the chosen window (${n2(f.low)} V to ${n2(f.high)} V) are fitted with a least-squares line:`
		),
		eq(`G = a\\,V_{GS} + b \\ \\Rightarrow\\ \\beta = a = ${(f.a * 1000).toFixed(4)}\\ \\text{mS/V}, \\qquad V_P = -\\dfrac{b}{a} = ${n3(vp)}\\ \\text{V}`),
		p(
			`How straight the part really is over that window: R^2 = ${n4(f.r2)}, and the largest gap between a point and the line is ${(100 * f.maxDev).toFixed(1)}% at V_GS = ${n2(f.maxDevAt)} V. ${f.maxDev > 0.05 ? 'That is more than the design should trust: narrow the window to the straight part of the curve, or check the measurement at that point.' : 'A few percent is normal; the design stays inside this window, so it never relies on the line where it was not checked.'}`
		),
		p(
			`The bias point is the middle of the window and the swing is a fraction of its half-width, instead of the V_P/2 and |V_P|/2 the datasheet modes assume. The I_DSS and r_DS(on) the fitted line implies, ${(idss * 1000).toFixed(2)} mA and ${formatOhms(rdsOn)}, are shown only for comparison with a datasheet.`
		)
	];
}

export function explainJfetPhysics(design) {
	const { vp, idss, beta, vc, r1AtCenter, vgsMin, carrier, model } = design;
	const gc = beta * (vc - vp);
	const measured = model.mode === 'measured';
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
			`That conductance is a straight line in V_GS with slope beta: zero at V_GS = V_P (channel closed, infinite resistance) and beta |V_P| = 2 I_DSS/|V_P| = 1/r_DS(on) at V_GS = 0 (channel wide open). ${
				measured
					? `Here the line was fitted to measured points (see the characterization panel), which gives beta = ${(beta * 1000).toFixed(4)} mS/V and V_P = ${n3(vp)} V directly, and the bias sits at the middle of the measured window, V_C = ${n2(vc)} V, so the design never leaves the stretch of the curve that was checked:`
					: 'Biasing the gate exactly halfway, at V_C = V_P/2, lands exactly halfway up that line, which leaves the same room to swing in both directions:'
			}`
		),
		eq(
			measured
				? `V_C = ${n2(vc)}\\ \\text{V}, \\qquad G(V_C) = \\beta\\,(V_C - V_P) = ${(gc * 1000).toFixed(3)}\\ \\text{mS}, \\qquad r_{DS}(V_C) = ${formatOhms(r1AtCenter)}`
				: `V_C = \\dfrac{V_P}{2} = ${n2(vc)}\\ \\text{V}, \\qquad G(V_C) = \\dfrac{I_{DSS}}{|V_P|} = \\dfrac{${(idss * 1000).toFixed(2)}\\ \\text{mA}}{${n2(Math.abs(vp))}\\ \\text{V}} = ${(gc * 1000).toFixed(3)}\\ \\text{mS}, \\qquad r_{DS}(V_C) = \\dfrac{|V_P|}{I_{DSS}} = ${formatOhms(r1AtCenter)}`
		),
		p(
			`Two separate conditions govern how large V_DS may be, and in this circuit V_DS is the carrier itself: the op-amp's feedback holds its inverting input, where the drain sits, at the carrier voltage. First, the triode formula only holds while V_DS stays below V_GS - V_P; past that point the channel pinches off at the drain end and the current stops growing (saturation). The tightest moment is the most negative gate swing, V_GS = ${n2(vgsMin)} V, where V_GS - V_P = ${n3(carrier.vdsSat)} V. A carrier larger than that saturates the JFET on every carrier peak while the message is in its trough, and the envelope is clipped there.`
		),
		eq(
			measured
				? `V_{DS} \\le V_{GS,min} - V_P = ${n3(carrier.vdsSat)}\\ \\text{V}`
				: `V_{DS} \\le V_{GS,min} - V_P = \\dfrac{(1-s)|V_P|}{2} = ${n3(carrier.vdsSat)}\\ \\text{V}`
		),
		p(
			'Second, within the triode region the squared term is not a problem for the envelope at all, and it is worth seeing why rather than just keeping V_DS small. Put the carrier in and write out the op-amp output (the current through R_b is the drain current, so V_out = V_DS + R_b I_D):'
		),
		eq(
			'V_{DS} = A_c\\cos\\omega_p t \\ \\Rightarrow\\ V_{out} = A_c\\cos\\omega_p t\\,[1 + R_b G(V_{GS})] - \\dfrac{R_b\\beta A_c^2}{4}\\,(1 + \\cos 2\\omega_p t), \\qquad \\beta = \\dfrac{2 I_{DSS}}{V_P^2}'
		),
		p(
			`The first term is the wanted AM signal, gain set by the gate. The second term does not contain V_GS: it is a fixed DC offset plus a tone at twice the carrier frequency, both of amplitude R_b beta A_c^2/4, whatever the message is doing. It cannot distort the envelope; it only adds a spectral line at 2 f_p, which any band-limiting after the modulator removes. With the carrier amplitude designed below (A_c = ${formatVolts(carrier.ac)}) that line is ${(carrier.tone2fp * 1000).toFixed(1)} mV, ${n1(carrier.tone2fpDbc)} dBc below the output carrier, at ${formatHz(carrier.tone2fpHz)}.`
		)
	];
}

export function explainJfetGainCell(design) {
	const { r1AtCenter, rb, x, swingFraction, gDepth, modulationIndex, nominalGain, gainMin, gainMax, vgsPeakSwing, vc, vp, model } = design;
	const measured = model.mode === 'measured';
	return [
		p(
			'The gain cell is a non-inverting amplifier with the JFET channel in place of the bottom resistor: the carrier x_p(t) drives the + input, the channel goes from the - input to ground, and R_b feeds the output back to the - input. With negative feedback an ideal op-amp keeps its two inputs at the same voltage and draws no input current, so the - input sits at x_p(t), and the current through the channel must also flow through R_b:'
		),
		eq(
			'\\dfrac{x_p}{r_{DS}} = \\dfrac{V_{out} - x_p}{R_b} \\ \\Rightarrow\\ V_{out} = x_p\\left(1 + \\dfrac{R_b}{r_{DS}}\\right) = x_p\\big[1 + R_b\\,G(V_{GS})\\big]'
		),
		p(
			measured
				? `So the gain is 1 + R_b G, and G is set by the gate. Now put the message on the gate on top of the bias, V_GS(t) = V_C + x_m(t). Because G is a straight line in V_GS, adding x_m to the gate adds a proportional amount to G. The swing here is a fraction ${n2(swingFraction)} of the measured window's half-width, ±${formatVolts(vgsPeakSwing)}; as a fraction of the room between V_C and V_P (${n2(vc - vp)} V) that is s = ${n3(gDepth)}, and s is what sets how far G moves:`
				: 'So the gain is 1 + R_b G, and G is set by the gate. Now put the message on the gate on top of the bias, V_GS(t) = V_C + x_m(t). Because G is a straight line in V_GS, adding x_m to the gate adds a proportional amount to G. Writing the gate swing as a fraction s of the room between V_C and V_P (that room is |V_P|/2), x_m(t) = s (|V_P|/2) m(t) with m between -1 and +1:'
		),
		eq(
			measured
				? 'G(V_C + x_m) = \\beta\\,(V_C - V_P + x_m) = G(V_C)\\left[1 + \\dfrac{x_m}{V_C - V_P}\\right] = G(V_C)\\big[1 + s\\,m(t)\\big]'
				: 'G(V_C + x_m) = \\dfrac{2I_{DSS}}{V_P^2}\\left(\\dfrac{|V_P|}{2} + s\\,\\dfrac{|V_P|}{2}\\,m(t)\\right) = \\dfrac{I_{DSS}}{|V_P|}\\big[1 + s\\,m(t)\\big] = G(V_C)\\big[1 + s\\,m(t)\\big]'
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
			`x = \\dfrac{${n3(modulationIndex)}}{${n3(gDepth)} - ${n3(modulationIndex)}} = ${n3(x)}, \\qquad R_b = ${formatOhms(r1AtCenter)} \\times ${n3(x)} = ${formatOhms(rb)}`
		),
		eq(`K_0 = 1 + ${n3(x)} = ${n3(nominalGain)}, \\qquad n = ${n3(gDepth)} \\times \\dfrac{${n3(x)}}{1 + ${n3(x)}} = ${n3(modulationIndex)}`),
		p(
			`Over one message cycle the gate swings by ±${formatVolts(vgsPeakSwing)} around V_C and the gain moves between ${n3(gainMin)} and ${n3(gainMax)}: the carrier comes out ${n2(gainMax / gainMin)} times larger at the crest of the message than in its trough, which is the ratio (1+n)/(1-n) of the envelope.`
		)
	];
}

export function explainConditioningChain(design) {
	const { conditioning, vc, vgsPeakSwing, vgsMin } = design;
	const { sourceAmplitude, fmMin, vcc, summer: s } = conditioning;
	return [
		p(
			`The gate needs V_C + x_m(t): a DC level of ${formatVolts(vc)} with the message swinging ±${formatVolts(vgsPeakSwing)} on top of it. A signal generator delivers something else, typically ±${formatVolts(sourceAmplitude)} centered on 0 V. One inverting summer does the whole job: the source comes in through a capacitor and a resistor R_ac, the supply comes in through a resistor R_bias, and R_f feeds back. Because the op-amp's - input is a virtual ground, each input's current is set by its own resistor alone, nothing loads anything, and the three numbers that matter (gain, bias, high-pass corner) are exactly what the formulas below say.`
		),
		p('Currents into the virtual ground add up and flow out through R_f:'),
		eq(
			'\\dfrac{x_m}{R_{ac}} + \\dfrac{V_{cc}}{R_{bias}} = -\\dfrac{V_{out}}{R_f} \\ \\Rightarrow\\ V_{out} = -\\dfrac{R_f}{R_{ac}}\\,x_m(t) - \\dfrac{R_f}{R_{bias}}\\,V_{cc}'
		),
		p(
			'The message term needs the gain V_swing / V_source, so R_ac follows from R_f; the DC term has to equal -|V_C|, so R_bias follows from R_f and V_cc. The minus signs are useful: they turn the positive supply into the negative bias an N-channel gate needs, and merely invert the message, a 180 degree phase shift that changes nothing in the AM envelope.'
		),
		eq(
			`R_{ac} = \\dfrac{R_f}{\\text{gain}} = \\dfrac{${formatOhms(s.rf)}}{${n3(s.gainTarget)}} = ${formatOhms(s.racTarget)} \\rightarrow \\text{E24: } ${formatOhms(s.rac)}, \\qquad \\text{gain actual} = \\dfrac{R_f}{R_{ac}} = ${n3(s.gainActual)}`
		),
		eq(
			`R_{bias} = \\dfrac{R_f\\,V_{cc}}{|V_C|} = \\dfrac{${formatOhms(s.rf)} \\times ${n1(vcc)}}{${n3(s.biasTarget)}} = ${formatOhms(s.rbiasTarget)} \\rightarrow \\text{E24: } ${formatOhms(s.rbias)}, \\qquad V_{bias} = -\\dfrac{R_f}{R_{bias}}\\,V_{cc} = ${formatVolts(s.biasActual)}`
		),
		p(
			`The capacitor in series with R_ac blocks any DC the source might carry, so the bias is set by R_bias alone. Seen from the source, C and R_ac form a high-pass whose corner is 1/(2 pi R_ac C), and since R_ac ends on a virtual ground nothing sits in parallel with it to move that corner. Putting it a decade below the lowest message frequency (${formatHz(fmMin)}) costs the message almost nothing: at f = 10 f_c the loss is 10 log(1 + 0.01) = 0.04 dB.`
		),
		eq(
			`f_c = \\dfrac{f_{m,min}}{10} = ${formatHz(s.fcTarget)} \\ \\Rightarrow\\ C = \\dfrac{1}{2\\pi R_{ac} f_c} = ${formatFarads(s.cTarget)} \\rightarrow ${formatFarads(s.c)}, \\qquad f_c\\text{ actual} = \\dfrac{1}{2\\pi R_{ac} C} = ${formatHz(s.fcActual)}`
		),
		p(
			`Two practical checks. The source has to drive R_ac = ${formatOhms(s.rac)} (a generator or a sound card does that without trouble). And the op-amp has to reach the most negative gate voltage, V_bias minus the full swing: ${formatVolts(s.outMin)} here, against an output swing of ±${formatVolts(s.opampSwing)} on this supply.${s.headroomOk ? ' That fits.' : ' THAT DOES NOT FIT: raise the supply, or use a JFET with a smaller |V_P| so the gate needs less voltage.'} With a J111, whose V_P can reach -10 V, this check is the one that bites first.`
		),
		p(
			'Why one stage instead of three: an earlier version amplified, then high-passed, then summed with a bias divider. Each stage loaded the one before it, so the divider actually delivered about half the intended bias and the high-pass corner moved up by a factor of ten. With everything meeting at one virtual ground there is nothing to load.'
		)
	];
}

/** The inverting cell: JFET as the input resistor, follower in front, post-gain behind. */
export function explainInvertingCell(design) {
	const { r1AtCenter, r2, x, gDepth, modulationIndex, gainMin, gainMax, vgsPeakSwing, buffer, postGain, carrier, r1Min, opamp } = design;
	const g0 = 1 / r1AtCenter;
	const blocks = [
		p(
			'Same JFET, same gate drive, but the channel moves from the feedback divider to the input. The follower copies the carrier onto the drain; the source sits on the - input of the second op-amp, a virtual ground; R_2 runs from that op-amp\'s output back to the same node. The current through the channel is x_p / r_DS, and all of it has to come through R_2:'
		),
		eq('I = x_p\\,G(V_{GS}), \\qquad V_{out} = -R_2\\,I = -R_2\\,G(V_{GS})\\,x_p'),
		p(
			'Put the message on the gate, G = G(V_C)[1 + s m(t)], and call x = R_2 G(V_C) as before. There is no "1 +" in front this time, and that changes everything about the modulation index:'
		),
		eq('V_{out}(t) = -x\\,\\big[1 + s\\,m(t)\\big]\\,x_p(t) \\ \\Rightarrow\\ K_0 = x, \\qquad n = s'),
		p(
			`n equals the swing fraction s directly, whatever x is. In the non-inverting cell n = s x/(1+x) only approaches s when x is large, and a large x means a large gain for the op-amp to follow at the carrier frequency. Here x is free, so it is chosen for the op-amp's sake: the largest value the gain-bandwidth rule allows (the op-amp's noise gain is still 1 + R_2/r_DS, see below), capped at 10.`
		),
		eq(
			`x = ${n3(x)} \\ \\Rightarrow\\ R_2 = x\\,r_{DS}(V_C) = ${n3(x)} \\times ${formatOhms(r1AtCenter)} = ${formatOhms(r2)}, \\qquad n = s = ${n3(modulationIndex)}, \\qquad \\text{gain } ${n3(gainMin)} \\text{ to } ${n3(gainMax)}`
		),
		p(
			`Why the follower is not optional. The channel is the input resistor, so whatever impedance feeds it adds to r_DS: the gain becomes R_2/(r_DS + Z_s). At the crest r_DS is at its smallest, ${formatOhms(r1Min)}, and the bare carrier divider presents ${formatOhms(buffer.dividerImpedance)}, which is ${(100 * buffer.crestErrorWithout).toFixed(0)}% of it: the crest is compressed while the trough hardly is, and the envelope bends. A follower brings Z_s down to a few ohms.`
		),
		eq(
			`\\text{gain} = \\dfrac{R_2}{r_{DS} + Z_s} = \\dfrac{x\\,(1 + s m)}{1 + Z_s\\,G(V_C)\\,(1 + s m)}: \\quad Z_s = ${formatOhms(buffer.dividerImpedance)} \\Rightarrow n_{eff} = ${n3(buffer.withoutBuffer.effectiveModulationIndex)},\\ THD = ${(100 * buffer.withoutBuffer.thd).toFixed(1)}\\%; \\qquad Z_s = ${formatOhms(buffer.zOut)} \\Rightarrow n_{eff} = ${n3(buffer.withBuffer.effectiveModulationIndex)},\\ THD = ${(100 * buffer.withBuffer.thd).toFixed(2)}\\%`
		),
		p(
			`The price of a small x is a small output: K_0 A_c = ${n3(x)} times ${formatVolts(carrier.ac)} is ${formatVolts(carrier.carrierOut)}. ${
				postGain.needed
					? `A fixed non-inverting stage after the cell brings that to the ${formatVolts(postGain.target)} wanted. Its gain does not move with the message, so its own loss at the carrier frequency is the same at the crest and in the trough: it lowers the level, it cannot bend the envelope.`
					: `That already reaches the ${formatVolts(postGain.target)} wanted, so no stage follows.`
			}`
		),
		...(postGain.needed
			? [
					eq(
						`K_{post} = \\dfrac{${formatVolts(postGain.target)}}{${formatVolts(carrier.carrierOut)}} = ${n2(postGain.kTarget)} \\ \\Rightarrow\\ R_{top} = (K_{post} - 1)\\,R_{bottom} = ${formatOhms((postGain.kTarget - 1) * postGain.rbottom)} \\rightarrow ${formatOhms(postGain.rtop)}, \\quad K_{post} = 1 + \\dfrac{${formatOhms(postGain.rtop)}}{${formatOhms(postGain.rbottom)}} = ${n2(postGain.kActual)}`
					),
					eq(
						`|H_{post}(f_p)| = \\dfrac{1}{\\sqrt{1 + (f_p K_{post}/GBW)^2}} = ${n4(postGain.factor)}, \\qquad \\text{output } ${formatVolts(postGain.outputAmplitude)}, \\quad \\text{envelope up to } ${formatVolts(postGain.envelopeMax)}${postGain.swingOk ? '' : ' \\ (\\text{OVER the op-amp swing})'}`
					)
				]
			: []),
		p(
			`Count of op-amps: the gate-drive summer, the follower, the cell${postGain.needed ? ', the post-gain stage' : ''}: ${opamp.opampCount}, against 2 for the non-inverting cell. The output is inverted, which changes nothing for an AM envelope. The triode limit on the carrier is the same as before, since V_DS is still the carrier: the channel sits between the drain at x_p and the source at 0 V.`
		)
	];
	return blocks;
}

export function explainCarrierPath(design) {
	const { carrier: c, gainMax, gainMin, nominalGain, vgsMin, vp, swingFraction, r1Min } = design;
	const inverting = design.topology === 'inverting';
	return [
		p(
			inverting
				? 'The carrier, through the follower, sits on the JFET\'s drain; the source is held at 0 V by the cell\'s op-amp. So the carrier amplitude A_c is the drain-source voltage, and two limits decide how large it may be.'
				: 'The carrier goes into the op-amp\'s + input, and the op-amp\'s feedback copies it onto the - input, which is the JFET\'s drain. So the carrier amplitude A_c is the drain-source voltage, and two limits decide how large it may be.'
		),
		p(
			`(a) Triode region. The channel saturates once V_DS exceeds V_GS - V_P, and the message drives V_GS as low as ${n2(vgsMin)} V, so the carrier must stay under ${n3(c.vdsSat)} V. A margin factor k keeps it comfortably inside, where the conductance is still the straight line the whole design rests on:`
		),
		eq(
			`A_{c,triode} = k\\,(V_{GS,min} - V_P) = ${n2(c.margin)} \\times ${n3(c.vdsSat)} = ${formatVolts(c.acTriode)}`
		),
		p(
			`(b) Op-amp output. At the crest of the message the gain is K_max = ${inverting ? 'x(1+s)' : '1 + x(1+s)'} = ${n2(gainMax)}, and K_max A_c has to fit inside the output swing:`
		),
		eq(`A_{c,opamp} = \\dfrac{V_{out,max}}{K_{max}} = \\dfrac{${formatVolts(design.opamp.opampSwing)}}{${n2(gainMax)}} = ${formatVolts(c.acOpamp)}`),
		p(
			`The smaller of the two wins: A_c = ${formatVolts(c.acMax)}, set by the ${c.limit === 'triode' ? 'triode region' : 'op-amp swing'}. The source delivers ${formatVolts(c.sourceAmplitude)}, so a resistive divider brings it down. ${
				inverting
					? 'It feeds the follower\'s + input, which draws no current, so its ratio is exact; the follower then drives the channel from a few ohms (the cell\'s math shows what happens without it):'
					: 'It feeds the op-amp\'s + input, which draws no current, so the divider needs no buffer and its ratio is exact:'
			}`
		),
		eq(
			c.divider.top > 0
				? `\\dfrac{R_{bot}}{R_{top} + R_{bot}} = \\dfrac{A_c}{A_{src}} \\ \\Rightarrow\\ R_{top} = R_{bot}\\left(\\dfrac{A_{src}}{A_c} - 1\\right) = ${formatOhms(c.divider.topTarget)} \\rightarrow \\text{E24: } ${formatOhms(c.divider.top)}, \\quad A_c = ${formatVolts(c.sourceAmplitude)} \\times \\dfrac{${formatOhms(c.divider.bottom)}}{${formatOhms(c.divider.top + c.divider.bottom)}} = ${formatVolts(c.ac)}`
				: `A_{src} \\le A_{c,max}: \\text{ no divider needed, } A_c = ${formatVolts(c.ac)}`
		),
		p('What comes out, from the gain at the bias point and at the two extremes of the message:'),
		eq(
			`K_0 A_c = ${n2(nominalGain)} \\times ${formatVolts(c.ac)} = ${formatVolts(c.carrierOut)}, \\qquad \\text{envelope from } K_{min}A_c = ${formatVolts(c.envelopeMin)} \\text{ to } K_{max}A_c = ${formatVolts(c.envelopeMax)}`
		),
		p(
			`Current: at the crest the channel is at its lowest resistance, r_DS = ${formatOhms(r1Min)}, and carries A_c / r_DS = ${(c.jfetPeakCurrent * 1000).toFixed(2)} mA peak. That current comes out of the ${inverting ? 'cell\'s op-amp through R_2 (and the follower supplies it into the drain)' : 'op-amp through R_b'}, so it is the op-amp's output current too${c.jfetPeakCurrent > 0.01 ? ', and it is above the 10 mA or so a small op-amp delivers cleanly: lower the carrier, or use a JFET with a smaller I_DSS.' : '; well under the 10 mA or so a small op-amp delivers cleanly.'}`
		)
	];
}

export function explainOpampLimits(design) {
	const { opamp: o, x, gDepth: swingFraction, modulationIndex, carrier, rb, r1AtCenter } = design;
	const inverting = design.topology === 'inverting';
	const pct = (f) => (100 * (1 - f)).toFixed(1);
	return [
		p(
			inverting
				? 'Nothing so far has asked whether the op-amp can follow. What a real op-amp\'s gain-bandwidth product GBW limits is the noise gain, 1 + (feedback resistor)/(input resistor), which for this cell is 1 + R_2/r_DS even though the signal gain is only R_2/r_DS: the "1 +" the inverting cell removed from the modulation index comes back here. That noise gain moves with the message, so the bandwidth moves with it too.'
				: 'Nothing so far has asked whether the op-amp can follow. The gain cell is a non-inverting amplifier, and a real op-amp\'s gain-bandwidth product GBW means a non-inverting stage of gain K only reaches GBW/K before it rolls off. Here the gain is not fixed: it moves with the message, so the bandwidth moves with it too.'
		),
		eq('K(m) = 1 + x\\,(1 + s\\,m), \\qquad f_{-3dB}(m) = \\dfrac{GBW}{K(m)}, \\qquad |H(f_p)| = \\dfrac{1}{\\sqrt{1 + \\left(\\dfrac{f_p K(m)}{GBW}\\right)^2}}'),
		...(inverting
			? [
					p(
						`With x = ${n3(x)} chosen for exactly this purpose, K stays small even at the crest, which is the whole point of the topology: the same n as a non-inverting cell with a large x, at a fraction of the noise gain.`
					)
				]
			: []),
		p(
			`At the carrier frequency f_p = ${formatHz(carrier.fp)}, with GBW = ${formatHz(o.gbw)}, the gain and the loss at the three points that matter:`
		),
		eq(
			`\\text{trough } (m=-1):\\ K = ${n2(o.kTrough)},\\ f_{-3dB} = ${formatHz(o.bwTrough)},\\ |H| = ${n4(o.factorTrough)}\\ (${pct(o.factorTrough)}\\% \\text{ lost})`
		),
		eq(
			`\\text{bias } (m=0):\\ K = ${n2(o.kNominal)},\\ f_{-3dB} = ${formatHz(o.bwNominal)},\\ |H| = ${n4(o.factorNominal)}\\ (${pct(o.factorNominal)}\\% \\text{ lost})`
		),
		eq(
			`\\text{crest } (m=+1):\\ K = ${n2(o.kCrest)},\\ f_{-3dB} = ${formatHz(o.bwCrest)},\\ |H| = ${n4(o.factorCrest)}\\ (${pct(o.factorCrest)}\\% \\text{ lost})`
		),
		p(
			`The loss is largest exactly where the gain is largest, at the crest. That flattens the top of the envelope more than its bottom, which is a distortion of the message itself, not just a smaller signal. Reading the modulation index off the compressed envelope gives the value a scope would show:`
		),
		eq(
			`n_{eff} = \\dfrac{K_{max}|H|_{crest} - K_{min}|H|_{trough}}{K_{max}|H|_{crest} + K_{min}|H|_{trough}} = ${n3(o.effectiveModulationIndex)} \\quad (\\text{designed } ${n3(modulationIndex)})`
		),
		p(
			`Applying that gain-dependent loss to a full sine-wave message and taking the harmonics of the resulting envelope gives the distortion a perfect demodulator would recover: THD = ${(100 * o.thd).toFixed(2)}%. The rule of thumb used here is to keep f_p K_max / GBW at or below 0.2, where the crest loses about 2% and the THD stays well under 1%.`
		),
		eq(`\\dfrac{f_p K_{max}}{GBW} = \\dfrac{${formatHz(carrier.fp)} \\times ${n2(o.kCrest)}}{${formatHz(o.gbw)}} = ${n2(o.gbwRatio)}${o.gbwOk ? '\\ \\le 0.2' : '\\ > 0.2'}`),
		...(o.gbwOk
			? [p('Within the rule of thumb: this op-amp keeps up with this carrier at this gain.')]
			: o.rbLimit
				? inverting
					? [
							p(
								`Over the limit. K_max = 1 + x(1+s) is set by R_2 through x = R_2 / r_DS(V_C), and here n does not depend on x at all, so R_2 can simply come down. The largest R_2 that lands on 0.2, rounded down to a stock value:`
							),
							eq(`K_{max} \\le \\dfrac{0.2\\,GBW}{f_p} \\ \\Rightarrow\\ x \\le \\dfrac{K_{max} - 1}{1 + s} \\ \\Rightarrow\\ R_2 \\le ${formatOhms(o.rbLimit)}, \\qquad n = s = ${n3(o.nAtLimit)} \\text{ unchanged}`),
							p('The post-gain stage makes up the level. Set R_2 to that value (the "feedback resistor" field) or clear it to let the tool pick.')
						]
					: [
							p(
								`Over the limit. K_max is what has to come down, and K_max = 1 + x(1+s) is set by R_b through x = R_b / r_DS(V_C). The largest R_b that lands on 0.2, rounded down to a stock value, and the modulation index it leaves (n = s x / (1 + x), so a smaller x costs some n):`
							),
							eq(
								`K_{max} \\le \\dfrac{0.2\\,GBW}{f_p} \\ \\Rightarrow\\ x \\le \\dfrac{K_{max} - 1}{1 + s} \\ \\Rightarrow\\ R_b \\le ${formatOhms(o.rbLimit)}, \\qquad n = ${n3(o.nAtLimit)}`
							),
							p(
								'Set R_b to that value in the gain cell (the "feedback resistor" field) to trade a little modulation depth for a clean envelope. The other ways out are a faster op-amp, a lower carrier frequency, or the inverting cell topology, where n does not depend on x and a small x is enough.'
							)
						]
				: [p(`Over the limit, and no value of ${inverting ? 'R_2' : 'R_b'} brings K_max under it at this carrier frequency with this op-amp: a faster op-amp or a lower carrier is needed.`)]),
		p(
			`Slew rate is the other limit: the ${inverting ? "cell's" : ''} output is a sine of amplitude up to K_max A_c = ${formatVolts(carrier.envelopeMax)} at ${formatHz(carrier.fp)}, whose steepest slope is 2 pi f_p times that amplitude. Keeping it under half the op-amp's slew rate leaves the waveform undistorted${inverting && design.postGain?.needed ? ` (the post-gain stage, at ${formatVolts(design.postGain.envelopeMax)}, needs ${(design.postGain.slewNeeded / 1e6).toFixed(2)} V/us, ${design.postGain.slewOk ? 'also fine' : 'TOO MUCH'})` : ''}:`
		),
		eq(
			`2\\pi f_p \\, K_{max} A_c = ${(o.slewNeeded / 1e6).toFixed(3)}\\ \\text{V/us} ${o.slewOk ? '\\le' : '>'} \\dfrac{SR}{2} = ${(o.slewRate / 2e6).toFixed(1)}\\ \\text{V/us}`
		)
	];
}

/* ------------------------------------------------------------------------ */
/* Diode + resonant tank modulator                                           */
/* ------------------------------------------------------------------------ */

/** A current in TeX, nA or uA. */
function texCurrent(i) {
	if (!Number.isFinite(i)) return '-';
	return i >= 1e-6 ? `${Number((i * 1e6).toPrecision(3))}\\,\\mu\\text{A}` : `${Number((i * 1e9).toPrecision(3))}\\,\\text{nA}`;
}

export function explainDiodeModulator(design) {
	const { fp, fmMax, sidebandMargin, bandwidthNeeded, inductance, capacitance, capacitors, cTarget, f0Actual, summer: s, rs, rt, rSource, rEff, bwLoaded, bandLow, bandHigh, sidebandsInBand, idealIndex, idealCarrier, modulationIndex, thd, thdAtFmMax, carrierOut, peakCurrent, sidebandGain, indexAtFmMax, carrierAmplitude, modAmplitude, targetModulationIndex, vcc } = design;
	const dm = DIODE_MODELS[design.diode] ?? DIODE_MODELS['1N4148'];
	const w0 = 2 * Math.PI * fp;
	const capPair = Array.isArray(capacitors) && capacitors.length === 2 ? `${formatFarads(capacitors[0])} \\parallel ${formatFarads(capacitors[1])}` : formatFarads(capacitance);
	// one equation per resistor, so none runs off a narrow screen
	const gains = [
		`A_d = \\dfrac{R_f}{R_p}\\,A_c = \\dfrac{${formatOhms(s.rf)}}{${formatOhms(s.rp)}} \\times ${formatVolts(carrierAmplitude)} = ${formatVolts(s.drive)}`,
		`u_m = \\dfrac{R_f}{R_m}\\,A_m = \\dfrac{${formatOhms(s.rf)}}{${formatOhms(s.rm)}} \\times ${formatVolts(modAmplitude)} = ${formatVolts(s.um)}`,
		...(s.rb ? [`V_B = \\dfrac{R_f}{R_b}\\,V_{cc} = \\dfrac{${formatOhms(s.rf)}}{${formatOhms(s.rb)}} \\times ${formatVolts(vcc)} = ${formatVolts(s.vb)}`] : [])
	];
	return [
		head('Why a diode makes sidebands'),
		p(
			"This modulator has no amplifier with a variable gain. It relies on a curved component: push the sum of two frequencies through it and new frequencies come out. For small signals a diode's curve can be written as a polynomial, and its squared term holds the product of the carrier and the message, which is the pair of sidebands:"
		),
		eq('i \\approx a\\,v + b\\,v^2, \\qquad v = A\\cos(\\omega_p t) + u\\cos(\\omega_m t) \\ \\Rightarrow\\ b\\,v^2 \\ni b\\,A\\,u\\,\\big[\\cos((\\omega_p-\\omega_m)t) + \\cos((\\omega_p+\\omega_m)t)\\big]'),
		p(
			"The signals here are a volt or so, many times the 45 mV or so that changes a diode's current by a factor of e. At that size the diode does not bend gently: it switches, conducting while its drive is above its knee and blocking below it. Driven mostly by the carrier, it conducts for half of every carrier cycle, so its current is the drive through R_s, turned on and off by a square wave at the carrier. A square wave that is on half the time is this sum of cosines:"
		),
		eq('s(t) = \\dfrac{1}{2} + \\dfrac{2}{\\pi}\\cos(\\omega_p t) - \\dfrac{2}{3\\pi}\\cos(3\\omega_p t) + \\cdots'),
		head('The switching modulator'),
		p(
			"The summer adds the carrier, the message and a small bias V_B that puts the switching point on the carrier's zero crossings. It inverts, which only turns the carrier and the message over and changes nothing in AM:"
		),
		eq('v_s(t) = A_d\\cos(\\omega_p t) + u_m\\,m(t) + V_B'),
		p(
			"Multiply the drive by the square wave and keep what lands on the carrier: the carrier times the constant half, and the message times the square wave's own cosine at the carrier. The rest, the message itself, a DC level and the harmonics, falls outside the tank's band:"
		),
		eq('i_p(t) = \\dfrac{1}{R_s}\\left[\\dfrac{A_d}{2} + \\dfrac{2}{\\pi}\\,u_m\\,m(t)\\right]\\cos(\\omega_p t) = \\dfrac{A_d}{2R_s}\\left[1 + \\dfrac{4\\,u_m}{\\pi A_d}\\,m(t)\\right]\\cos(\\omega_p t)'),
		p("That is an AM wave, and its bracket gives the index an ideal switch would reach, with this design's drive:"),
		eq(`n_{ideal} = \\dfrac{4\\,u_m}{\\pi A_d} = \\dfrac{4 \\times ${n3(s.um)}}{\\pi \\times ${n3(s.drive)}} = ${n3(idealIndex)}`),
		head('The real diode, cycle by cycle'),
		p(
			'A real diode switches softly: its current grows exponentially over its last few tenths of a volt, so the ideal figure is only a guide. The page works the circuit out instead. For one value of the message it takes one carrier cycle and finds, at every instant, the current the drive pushes through R_s and the diode, then keeps the carrier component of that current. The tank answers that component with a voltage that subtracts from the drive, so the cycle is solved together with it. The diode is the same model the LTspice files carry:'
		),
		eq(`i = I_S\\left(e^{v_D/(N V_T)} - 1\\right), \\qquad v_s(\\theta) = R_s\\,i + v_D + v_{tank}(\\theta), \\qquad I_S = ${texCurrent(dm.Is)},\\ N = ${dm.N}`),
		p(
			"Repeated over one message cycle, that traces the envelope. Its average is the carrier at the output, its swing gives the index, and its harmonics are the distortion that would come back out of a demodulator:"
		),
		eq(`A_{out} = ${formatVolts(carrierOut)}, \\qquad n = ${n3(modulationIndex)}\\ (\\text{target } ${n2(targetModulationIndex)}), \\qquad \\text{THD} = ${n2(100 * thd)}\\,\\%, \\qquad i_{max} = ${texCurrent(peakCurrent)}`),
		p(
			`The bias decides where the switch flips. Too little and the diode conducts for less than half a cycle, too much and for more; either bends the envelope. The page takes the bias with the least distortion at the target index, then the stock resistors: R_p and R_m set the two gains${s.rb ? ' and R_b, from -V_cc, sets the bias' : ', and no R_b: the best bias is next to nothing here, as it is for a Schottky diode'}.${Math.abs(modulationIndex - targetModulationIndex) > 0.005 ? ' The index lands a little off the target because the resistors are stock values.' : ''}`
		),
		...gains.map((tex) => eq(tex)),
		head('The tank'),
		p(
			'A parallel RLC tank is a frequency-selective load: at one frequency it looks like a large resistor, everywhere else like a small impedance that shorts the unwanted terms to ground. Add the three branch admittances (admittance is 1/impedance, so parallel branches simply add):'
		),
		eq('Y = \\dfrac{1}{R} + j\\omega C + \\dfrac{1}{j\\omega L} = \\dfrac{1}{R} + j\\left(\\omega C - \\dfrac{1}{\\omega L}\\right)'),
		p('The imaginary part vanishes where the capacitor and the inductor cancel each other; there the tank is just R, its maximum impedance. That frequency is the resonance:'),
		eq('\\omega_0 C = \\dfrac{1}{\\omega_0 L} \\ \\Rightarrow\\ \\omega_0 = \\dfrac{1}{\\sqrt{LC}}, \\qquad f_0 = \\dfrac{1}{2\\pi\\sqrt{LC}}'),
		p('How selective it is: the impedance has dropped to R/sqrt(2) (half power) where the imaginary part equals 1/R. Solving ωC - 1/(ωL) = ±1/R gives two frequencies whose spacing is exactly 1/(RC). That spacing is the bandwidth, and its ratio to f_0 defines Q:'),
		eq('\\Delta\\omega = \\dfrac{1}{RC} \\ \\Rightarrow\\ BW = \\dfrac{f_0}{Q}, \\qquad Q = \\omega_0 R C = R\\sqrt{\\dfrac{C}{L}}'),
		p('The capacitor comes from the resonance. One stock part can miss by a few percent, enough to push a sideband out of the band, so it is built as two stock capacitors in parallel:'),
		eq(`C = \\dfrac{1}{\\omega_0^2 L} = \\dfrac{1}{(2\\pi \\times ${fp})^2 \\times ${formatHenries(inductance)}} = ${formatFarads(cTarget ?? 1 / (w0 * w0 * inductance))} \\rightarrow ${capPair} = ${formatFarads(capacitance)}, \\qquad f_0 = ${formatHz(f0Actual)}`),
		p(
			`R in those formulas is everything across the tank. Through the switching diode, R_s is connected for half of each cycle, so the tank sees it as a source of about 2 R_s, in parallel with its own R_t. The page measures that source on the computed cycle and sizes R_t so that the pair gives the band asked for, the sideband margin (${n2(sidebandMargin)}) times the two sidebands' span, widened by any detuning. R_s itself is taken at twice the band's resistance, so R_t stays in charge:`
		),
		eq(`R_{eff} = R_t \\parallel R_{src} = ${formatOhms(rt)} \\parallel ${formatOhms(rSource)} = ${formatOhms(rEff)}, \\qquad BW = \\dfrac{1}{2\\pi R_{eff} C} = ${formatHz(bwLoaded)}\\ (\\text{asked } ${formatHz(bandwidthNeeded)})`),
		p("An ideal switch would give the carrier below at the output, the carrier current of the switching modulator across R_eff; the diode's soft knee takes some off:"),
		eq(`A_{out,ideal} = \\dfrac{A_d\\,R_{eff}}{2R_s} = \\dfrac{${formatVolts(s.drive)} \\times ${formatOhms(rEff)}}{2 \\times ${formatOhms(rs)}} = ${formatVolts(idealCarrier)}, \\qquad A_{out} = ${formatVolts(carrierOut)}`),
		head("The sidebands on the tank's slope"),
		p(
			"The sidebands sit f_m away from the carrier, on the slope of the tank's response, so the tank passes them a little less than the carrier. A tone near the top of the message band therefore modulates less deeply than a slow one:"
		),
		eq(`|H(f_m)| = \\dfrac{1}{\\sqrt{1 + (2f_m/BW)^2}} = ${n3(sidebandGain)}\\ \\text{at } ${formatHz(fmMax)}, \\qquad n(f_{m,max}) = ${n3(modulationIndex)} \\times ${n3(sidebandGain)} = ${n3(indexAtFmMax)}`),
		p(
			sidebandsInBand
				? `Both sidebands, ${formatHz(fp - fmMax)} and ${formatHz(fp + fmMax)}, sit inside the band the tank passes, ${formatHz(bandLow)} to ${formatHz(bandHigh)}. A larger sideband margin flattens the slope but lets more of the carrier's harmonics through; ${n2(sidebandMargin)} is the trade made here. A ${formatHz(fmMax)} tone also comes out a little cleaner than a slow one, ${n2(100 * thdAtFmMax)} % THD, since its harmonics sit further out on the slope still.`
				: `The band the tank passes, ${formatHz(bandLow)} to ${formatHz(bandHigh)}, does not hold both sidebands at ${formatHz(fp - fmMax)} and ${formatHz(fp + fmMax)}: a larger sideband margin fixes it.`
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
