import { KHN_R0 } from '../khnBandPass';
import { MFB_BP_CAP_RATIO, MFB_BP_LOOP_MIN } from '../mfbBandPass';
import { NARROW_GAIN_SPEED, NARROW_MAX_GAIN_STAGES } from '../narrowBand';
import { GYRATOR_R1, GYRATOR_R2_TOP } from '../rlcBandPass';
import { TT_INVERTER_R } from '../towThomas';
import { pyEng, pyNum } from './emit';

/**
 * The circuits of a narrow band-pass file (narrow.js), one stage each, as
 * the page builds them (narrowBand.js and the designers it calls:
 * rlcBandPass.js, sallenKeyBandPass.js, mfbBandPass.js, khnBandPass.js,
 * towThomas.js), and the gain stage that makes up what a circuit's own form
 * leaves of K. Each circuit, by its Python name:
 *   topology   the library's topology of its realized stage
 *   label      the printout's name of a stage
 *   one, many  the docstring's words for one stage and for several
 *   field      the names of the capacitor fields typed on the page for it
 *              ({ C } for every circuit but the MFB one, { C1, C2 } there)
 *   exempt     resistors rule b leaves out (the gyrator's series loss)
 *   short      whether its own form can leave the chain under K, so that
 *              the file writes the gain stages: (ctx) => boolean
 *   describe   (ctx) => the comment that says what the circuit is
 *   code       (ctx) => the Python of its H(s), its rule a (choices) and
 *              the figures rule c reads, and their helpers
 *   rounding   the Python of a rule c of its own (the Sallen-Key's), else
 *              the shared one
 * ctx: { gbw (the op-amp the MFB stage is built for, null for an ideal
 * one), caps(name) (the Python of the capacitors to try for a field),
 * params (the choices' parameters: 'st', or 'st, typed_here') }.
 *
 * The rule is the spec's (a to d), adapted to each circuit where its own
 * structure asks for it: the gyrator's series loss stays small and rule b
 * leaves it out, the RLC and the Sallen-Key take a gain under their own
 * with an input divider, the MFB stage past its gain ceiling is built at
 * gain 1, and the Sallen-Key's K, which Q follows some 2 sqrt(2) Q - 1
 * times over, is solved last against the parts already rounded. The H(s)
 * are the textbook ones with ideal op-amps, the MFB stage built for an
 * op-amp with that single-pole op-amp (as bode.js reads every one of them).
 */

const py = (lines) => lines.join('\n');

/** The input divider's helper, Ra || Rb and alpha, written once for the RLC and Sallen-Key files. */
const THEVENIN = py([
	'def thevenin(p):',
	'    """The input as the stage sees it: R = Ra || Rb, with alpha = Rb / (Ra + Rb) of the input',
	'    behind it (R = Ra and alpha = 1 with no Rb)."""',
	'    if "Rb" not in p:',
	'        return p["Ra"], 1.0',
	'    return p["Ra"] * p["Rb"] / (p["Ra"] + p["Rb"]), p["Rb"] / (p["Ra"] + p["Rb"])'
]);

const rlcGyrator = {
	topology: 'rlcGyrator',
	label: 'RLC band-pass, gyrator inductor',
	one: 'RLC band-pass stage, its inductor a gyrator',
	many: 'RLC band-pass stages, their inductors gyrators',
	field: ['C'],
	exempt: ['R1'],
	short: () => true,
	describe: () =>
		[
			'Each stage is an RLC band-pass: R from the input to the tank, C and an inductor L in parallel from the tank to ground, so that f0 = 1 / (2 pi sqrt(L C)) and Q = R sqrt(C / L). There is no coil: L is a gyrator, one op-amp as a follower with R1 from the tank to its output, Cg from the tank to its + input and R2 from there to ground, about L = R1 R2 Cg with R1 a series loss. A follower takes the tank to the output, or the + input of the gain stage after it does.',
			'The loss keeps the stage under a gain of 1 at f0: a gain under its own divides the input (Ra from the input, Rb from the tank to ground, Ra || Rb = R), and above it a gain stage adds the rest. The page also weighs how far a TL082\'s lag in the follower moves f0 down, about 1 / (2 wt R1 C); its run on a TL082 shows it.'
		].join('\n'),
	code: (ctx) =>
		[
			THEVENIN,
			py([
				'def rlc_gyrator_h(p, s):',
				'    """RLC band-pass, its inductor a gyrator: the input through R into the tank, C in parallel',
				"    with the gyrator's input impedance:",
				'        Zin = R1 (1 + s R2 Cg) / (1 + s R1 Cg),   H = alpha / (1 + R (s C + 1 / Zin))"""',
				'    r, alpha = thevenin(p)',
				'    zin = p["R1"] * (1 + s * p["R2"] * p["Cg"]) / (1 + s * p["R1"] * p["Cg"])',
				'    return alpha / (1 + r * (s * p["C"] + 1 / zin))'
			]),
			py([
				`def rlc_gyrator_choices(${ctx.params}):`,
				'    """The gyrator stage for each capacitor C of the stock (Cg = C): with w0 = 2 pi f0 and',
				'    X = 1 / (w0 C), the series loss R1 = max(50 ohm, X^2 / 1 Mohm), as small as the follower',
				'    drives; then h = 1/R2 and g = 1/R put f0 and Q on target, the loss included,',
				'        w0^2 C Cg = (1/R1 + g) h,   w0 / Q = g / C + h (1/C + 1/Cg)',
				'    a quadratic in h, C k h^2 - (1/R1 + C w0 / Q) h + w0^2 C Cg = 0 with k = 1/C + 1/Cg, its',
				'    smaller root (the larger R2, the less loss). A gain under the stage\'s own divides the',
				'    input: Ra = R / alpha and Rb = R / (1 - alpha), alpha = gain / own."""',
				'    w0 = 2 * math.pi * st["f0"]',
				`    for c in ${ctx.caps('C')}:`,
				'        x = 1 / (w0 * c)',
				`        r1 = max(${pyNum(GYRATOR_R1)}, x * x / ${pyEng(GYRATOR_R2_TOP)})`,
				'        k = 2 / c',
				'        b = 1 / r1 + c * w0 / st["q"]',
				'        disc = b * b - 4 * c * k * w0 * w0 * c * c',
				'        if disc < 0:',
				'            continue  # (the loss alone takes more than w0 / Q)',
				'        h = (b - math.sqrt(disc)) / (2 * c * k)',
				'        g = c * (w0 / st["q"] - h * k)',
				'        if h <= 0 or g <= 0:',
				'            continue',
				'        p = {"Ra": 1 / g, "C": c, "R1": r1, "R2": 1 / h, "Cg": c}',
				'        own = abs(rlc_gyrator_h(p, 1j * w0))',
				'        if st["gain"] < own:',
				'            alpha = st["gain"] / own',
				'            divider = {"Ra": 1 / g / alpha, "Rb": 1 / g / (1 - alpha)}',
				'            p = {**divider, "C": c, "R1": r1, "R2": 1 / h, "Cg": c}',
				'        yield p'
			]),
			py([
				'def rlc_gyrator_figures(p):',
				'    """f0, Q and, with a divider, the gain at f0 of a gyrator stage (R = Ra || Rb):',
				'        w0^2 = (1 + R1/R) / (R1 R2 C Cg),   w0 / Q = 1/(R C) + 1/(R2 C) + 1/(R2 Cg)',
				'    Without one the gain counts for nothing here: the gain stage takes it up."""',
				'    r = thevenin(p)[0]',
				'    w0 = math.sqrt((1 + p["R1"] / r) / (p["R1"] * p["R2"] * p["C"] * p["Cg"]))',
				'    a = 1 / (r * p["C"]) + 1 / (p["R2"] * p["C"]) + 1 / (p["R2"] * p["Cg"])',
				'    out = {"f0": w0 / (2 * math.pi), "q": w0 / a}',
				'    if "Rb" in p:',
				'        out["gain"] = abs(rlc_gyrator_h(p, 1j * w0))',
				'    return out'
			])
		].join('\n\n\n')
};

const rlcGic = {
	topology: 'rlcGic',
	label: 'RLC band-pass, GIC inductor',
	one: "RLC band-pass stage, its inductor Antoniou's GIC",
	many: "RLC band-pass stages, their inductors Antoniou's GIC",
	field: ['C'],
	exempt: [],
	short: (ctx) => ctx.stageGain > 1,
	describe: (ctx) =>
		[
			`Each stage is an RLC band-pass: R from the input to the tank, C and an inductor L in parallel from the tank to ground, so that f0 = 1 / (2 pi sqrt(L C)) and Q = R sqrt(C / L). There is no coil: L is Antoniou's generalized impedance converter, two op-amps around the chain R1, R2, R3, Cg, R4 from the tank to ground, an exact grounded inductor L = Cg R1 R3 R4 / R2. A follower takes the tank to the output${ctx.short ? ', or the + input of the gain stage after it does' : ''}.`,
			`A passive RLC passes at most 1 at f0: a gain under 1 divides the input (Ra from the input, Rb from the tank to ground, Ra || Rb = R)${ctx.short ? ', and above it a gain stage adds the rest' : ''}.`
		].join('\n'),
	code: (ctx) =>
		[
			THEVENIN,
			py([
				'def rlc_gic_h(p, s):',
				'    """RLC band-pass, its inductor a GIC: the input through R into C in parallel with',
				'    L = Cg R1 R3 R4 / R2,   H = alpha / (1 + R (s C + 1 / (s L)))"""',
				'    r, alpha = thevenin(p)',
				'    inductance = p["Cg"] * p["R1"] * p["R3"] * p["R4"] / p["R2"]',
				'    return alpha / (1 + r * (s * p["C"] + 1 / (s * inductance)))'
			]),
			py([
				`def rlc_gic_choices(${ctx.params}):`,
				'    """The GIC stage for each capacitor C of the stock (Cg = C): with X = 1 / (w0 C),',
				'    R1 = R2 = R3 = R4 = X make L = X / w0, and R = Q X sets Q. A gain under 1 divides the',
				'    input: Ra = R / gain and Rb = R / (1 - gain)."""',
				'    w0 = 2 * math.pi * st["f0"]',
				`    for c in ${ctx.caps('C')}:`,
				'        x = 1 / (w0 * c)',
				'        r = st["q"] * x',
				'        divider = {"Ra": r}',
				'        if st["gain"] < 1:',
				'            divider = {"Ra": r / st["gain"], "Rb": r / (1 - st["gain"])}',
				'        yield {**divider, "C": c, "R1": x, "R2": x, "R3": x, "R4": x, "Cg": c}'
			]),
			py([
				'def rlc_gic_figures(p):',
				'    """f0, Q and, with a divider, the gain at f0 (alpha) of a GIC stage:',
				'        L = Cg R1 R3 R4 / R2,   f0 = 1 / (2 pi sqrt(L C)),   Q = R sqrt(C / L)"""',
				'    r, alpha = thevenin(p)',
				'    inductance = p["Cg"] * p["R1"] * p["R3"] * p["R4"] / p["R2"]',
				'    out = {"f0": 1 / (2 * math.pi * math.sqrt(inductance * p["C"])),',
				'           "q": r * math.sqrt(p["C"] / inductance)}',
				'    if "Rb" in p:',
				'        out["gain"] = alpha',
				'    return out'
			])
		].join('\n\n\n')
};

const sallenKeyBp = {
	topology: 'sallenKeyBp',
	label: 'Sallen-Key band-pass',
	one: 'Sallen-Key band-pass stage',
	many: 'Sallen-Key band-pass stages',
	field: ['C'],
	exempt: [],
	short: (ctx) => ctx.stageGain > 2 * Math.SQRT2 * ctx.stageQ - 1,
	describe: (ctx) =>
		[
			'Each stage is a Sallen-Key band-pass, its op-amp a non-inverting amplifier of gain A = 1 + Rf/Rg: Ra from the input to node X (and Rb from X to ground, a divider), C1 from X to ground, C2 from X to the + input, R2 from there to ground and R3 from X back to the output. With every R and both C equal, f0 = sqrt(2) / (2 pi R C), Q = sqrt(2) / (4 - A) and the centre gain is A / (4 - A) = 2 sqrt(2) Q - 1.',
			`A gain under the circuit's own divides the input${ctx.short ? ', and above it a gain stage adds the rest' : ''}. Q follows A some 2 sqrt(2) Q - 1 times over, so A is solved last, against the parts already rounded.`
		].join('\n'),
	code: (ctx) =>
		[
			THEVENIN,
			py([
				'def sallen_key_terms(p):',
				'    """A = 1 + Rf/Rg, and a = w0 / Q and b = w0^2 of a Sallen-Key band-pass (G1 = 1/Ra + 1/Rb):',
				'        b = (G1 + 1/R3) / (C1 C2 R2),   a = (G1 + (1 - A)/R3) / C1 + 1/(C2 R2) + 1/(C1 R2)"""',
				'    g1 = 1 / p["Ra"] + (1 / p["Rb"] if "Rb" in p else 0)',
				'    a_amp = 1 + p["Rf"] / p["Rg"]',
				'    b = (g1 + 1 / p["R3"]) / (p["C1"] * p["C2"] * p["R2"])',
				'    a = (g1 + (1 - a_amp) / p["R3"]) / p["C1"] + 1 / (p["C2"] * p["R2"]) + 1 / (p["C1"] * p["R2"])',
				'    return a_amp, a, b'
			]),
			py([
				'def sallen_key_bandpass_h(p, s):',
				'    """Sallen-Key band-pass: H = (A s / (Ra C1)) / (s^2 + a s + b), its terms above."""',
				'    a_amp, a, b = sallen_key_terms(p)',
				'    return a_amp * s / (p["Ra"] * p["C1"]) / (s * s + a * s + b)'
			]),
			py([
				`def sallen_key_bandpass_choices(${ctx.params}):`,
				'    """The Sallen-Key stage for each capacitor C of the stock (C1 = C2 = C): with',
				'    w0 = 2 pi f0, every R = sqrt(2) / (w0 C) and A = 4 - sqrt(2) / Q (Q over sqrt(2)/3), its',
				'    own gain A / (4 - A). A gain under it divides the input: Ra = R own / gain and',
				'    Rb = R / (1 - gain / own). Rg = R and Rf = (A - 1) R."""',
				'    w0 = 2 * math.pi * st["f0"]',
				'    a_amp = 4 - math.sqrt(2) / st["q"]',
				'    if a_amp <= 1:',
				'        return',
				'    own = a_amp / (4 - a_amp)',
				`    for c in ${ctx.caps('C')}:`,
				'        r = math.sqrt(2) / (w0 * c)',
				'        divider = {"Ra": r}',
				'        if st["gain"] < own:',
				'            divider = {"Ra": r * own / st["gain"], "Rb": r / (1 - st["gain"] / own)}',
				'        yield {**divider, "C1": c, "C2": c, "R2": r, "R3": r, "Rg": r, "Rf": (a_amp - 1) * r}'
			]),
			py([
				'def sallen_key_bandpass_figures(p):',
				'    """f0, Q and, with a divider, the gain at f0, A / (Ra C1) / a, of a Sallen-Key stage."""',
				'    a_amp, a, b = sallen_key_terms(p)',
				'    out = {"f0": math.sqrt(b) / (2 * math.pi), "q": math.sqrt(b) / a}',
				'    if "Rb" in p:',
				'        out["gain"] = a_amp / (p["Ra"] * p["C1"]) / a',
				'    return out'
			]),
			py([
				'def sallen_key_a(p):',
				'    """The A that puts Q on stage_q exactly with the parts as they are (C1 = C2 = C):',
				'        A = 1 + R3 (G1 + 2 / R2 - C w0 / Q),   w0 = sqrt((G1 + 1/R3) / (C^2 R2))"""',
				'    g1 = 1 / p["Ra"] + (1 / p["Rb"] if "Rb" in p else 0)',
				'    w0 = math.sqrt((g1 + 1 / p["R3"]) / (p["C1"] * p["C2"] * p["R2"]))',
				'    return 1 + p["R3"] * (g1 + 2 / p["R2"] - p["C1"] * w0 / stage_q)'
			])
		].join('\n\n\n'),
	rounding: py([
		'def rounded(p, figures):',
		'    """Rule c for the Sallen-Key: Ra, Rb, R2 and R3 each to its stocked neighbour below or',
		'    above, and with each combination A solved again for the exact Q (sallen_key_a), the',
		"    combination whose figures land closest to the exact parts' kept (fit); its Rf / Rg is",
		'    then the stocked pair closest to A - 1. None when no A stays between 1 and 4."""',
		'    target = figures(p)',
		'    names = [name for name in p if name[0] == "R" and name not in ("Rg", "Rf")]',
		'    best, best_fit = None, math.inf',
		'    for values in itertools.product(*(neighbours(p[name]) for name in names)):',
		'        trial = {**p, **dict(zip(names, values))}',
		'        a_amp = sallen_key_a(trial)',
		'        if not 1 < a_amp < 4:',
		'            continue',
		'        trial["Rf"] = (a_amp - 1) * trial["Rg"]',
		'        miss = fit(figures(trial), target)',
		'        if miss < best_fit:',
		'            best, best_fit = trial, miss',
		'    pair = ratio_pair(sallen_key_a(best) - 1) if best else None',
		'    return {**best, "Rg": pair[0], "Rf": pair[1]} if pair else None'
	])
};

const mfbBp = {
	topology: 'mfbBp',
	label: 'MFB band-pass',
	one: 'multiple feedback (MFB) band-pass stage',
	many: 'multiple feedback (MFB) band-pass stages',
	field: ['C1', 'C2'],
	exempt: [],
	short: (ctx) => ctx.stageGain > 1,
	describe: (ctx) =>
		[
			`Each stage is a multiple feedback (MFB) band-pass, one op-amp: R1 from the input to node A, R2 from A to ground, C2 from A to the inverting input, C1 from the output back to A and R3 from the output to the inverting input. R3 with the capacitors sets the bandwidth, R1 the gain, R2 moves f0 alone, and the stage inverts. ${ctx.short ? 'The gain has a ceiling, Q^2 (1 + C2/C1): past it the stage is built at gain 1, and a gain stage adds the rest' : 'The gain must stay under its ceiling, Q^2 (1 + C2/C1)'}.`,
			...(ctx.gbw
				? [
						`The page builds it for the op-amp picked on its menu "Design the MFB stages for", ${ctx.opampWords}. Such an op-amp lowers f0 by about 1 / sqrt(1 + k) and raises Q by about sqrt(1 + k), k = Q (1 + C2/C1) f0 / GBW, so the circuit alone is solved for a higher f0 and a lower Q that the op-amp brings onto the target (circuit_alone), and the check reads it with that op-amp.`
					]
				: [])
		].join('\n'),
	code: (ctx) => {
		const blocks = [];
		if (ctx.gbw) {
			blocks.push(
				py([
					'def mfb_bandpass_h(p, s):',
					'    """MFB band-pass. With a = (C1 + C2) / (R3 C1 C2) and b = (1/R1 + 1/R2) / (R3 C1 C2), an ideal',
					'    op-amp gives H = -(s / (R1 C1)) / (s^2 + a s + b); the single-pole op-amp it is built for,',
					'    A(s) = wt / s with wt = 2 pi gbw, makes the denominator a cubic:',
					'        H = -wt s / (R1 C1) / (s^3 + (wt + a + (1/R1 + 1/R2) / C1) s^2 + (wt a + b) s + wt b)"""',
					'    a = (p["C1"] + p["C2"]) / (p["R3"] * p["C1"] * p["C2"])',
					'    b = (1 / p["R1"] + 1 / p["R2"]) / (p["R3"] * p["C1"] * p["C2"])',
					'    if gbw is None:',
					'        return -s / (p["R1"] * p["C1"]) / (s * s + a * s + b)',
					'    wt = 2 * math.pi * gbw',
					'    c2 = wt + a + (1 / p["R1"] + 1 / p["R2"]) / p["C1"]',
					'    return -wt * s / (p["R1"] * p["C1"]) / (s * s * s + c2 * s * s + (wt * a + b) * s + wt * b)'
				]),
				py([
					'def circuit_alone(st, ratio):',
					'    """The f0, Q and gain the MFB circuit alone is solved for, so that the op-amp (gbw) brings',
					"    it onto st's. Its denominator is then (s + p) (s^2 + A s + B), A = w0 / Q and B = w0^2 the",
					"    target's and p the third, real pole the op-amp's finite gain adds to the loop, so the",
					"    circuit's a = w0c / Qc and b = w0c^2 are",
					'        b = p B / wt,   a = (p A + B - b) / wt',
					'    where p solves wt + a + (1 + C2/C1) b / a = p + A, its one root past wt (bisection). The',
					'    gain then asks for K A sqrt(p^2 + w0^2) / (wt a). None when the op-amp is too slow for any',
					'    circuit to land on the target."""',
					'    wt = 2 * math.pi * gbw',
					'    w0 = 2 * math.pi * st["f0"]',
					'    big_a, big_b = w0 / st["q"], w0 * w0',
					'    if not (big_a > big_b / wt and wt * wt - big_a * wt + big_b > 0):',
					'        return None  # (A must lie between B / wt and wt + B / wt for p past wt to solve it)',
					'',
					'    def miss(p):',
					'        b = p * big_b / wt',
					'        a = (p * big_a + big_b - b) / wt',
					'        return wt + a + (1 + ratio) * b / a - p - big_a',
					'',
					'    lo, hi = wt, 2 * wt',
					'    while miss(hi) > 0:',
					'        lo, hi = hi, 2 * hi',
					'    while hi - lo > 1e-15 * hi:',
					'        mid = (lo + hi) / 2',
					'        lo, hi = (mid, hi) if miss(mid) > 0 else (lo, mid)',
					'    p = (lo + hi) / 2',
					'    b = p * big_b / wt',
					'    a = (p * big_a + big_b - b) / wt',
					'    k = st["gain"] * big_a * math.hypot(p, w0) / (wt * a)',
					'    return {"f0": math.sqrt(b) / (2 * math.pi), "q": math.sqrt(b) / a, "gain": k}'
				]),
				py([
					`def mfb_bandpass_choices(${ctx.params}):`,
					`    """The MFB stage for each pair of the stock with C2/C1 from 1/${MFB_BP_CAP_RATIO} to ${MFB_BP_CAP_RATIO}, at the targets of its`,
					'    circuit alone (circuit_alone) and under its gain ceiling: with w0 = 2 pi f0,',
					'        R3 = Q (C1 + C2) / (w0 C1 C2),   R1 = Q / (K w0 C1),',
					'        1/R2 = (w0 / Q) (Q^2 (C1 + C2) - K C1)',
					`    A pair that leaves the op-amp a loop gain under ${MFB_BP_LOOP_MIN} at f0, GBW / ((1 + Q^2 (1 + C2/C1)) f0), is`,
					'    skipped: the correction is not trusted there."""',
					`    for c1, c2 in itertools.product(${ctx.caps('C1')}, ${ctx.caps('C2')}):`,
					'        ratio = c2 / c1',
					'        if not 1 / RATIO <= ratio <= RATIO:',
					'            continue',
					'        t = circuit_alone(st, ratio) if gbw is not None else st',
					'        if t is None:',
					'            continue',
					`        if gbw is not None and gbw / ((1 + t["q"] ** 2 * (1 + ratio)) * t["f0"]) < ${MFB_BP_LOOP_MIN}:`,
					'            continue',
					'        w0 = 2 * math.pi * t["f0"]',
					'        g2 = (w0 / t["q"]) * (t["q"] * t["q"] * (c1 + c2) - t["gain"] * c1)',
					'        if g2 > 0:',
					'            r1, r3 = t["q"] / (t["gain"] * w0 * c1), t["q"] * (c1 + c2) / (w0 * c1 * c2)',
					'            yield {"R1": r1, "R2": 1 / g2, "R3": r3, "C1": c1, "C2": c2}'
				])
			);
		} else {
			blocks.push(
				py([
					'def mfb_bandpass_h(p, s):',
					'    """MFB band-pass, an ideal op-amp: with a = (C1 + C2) / (R3 C1 C2) and',
					'    b = (1/R1 + 1/R2) / (R3 C1 C2),   H = -(s / (R1 C1)) / (s^2 + a s + b)"""',
					'    a = (p["C1"] + p["C2"]) / (p["R3"] * p["C1"] * p["C2"])',
					'    b = (1 / p["R1"] + 1 / p["R2"]) / (p["R3"] * p["C1"] * p["C2"])',
					'    return -s / (p["R1"] * p["C1"]) / (s * s + a * s + b)'
				]),
				py([
					`def mfb_bandpass_choices(${ctx.params}):`,
					'    """The MFB stage for each pair of the stock with C2/C1 from 1/10 to 10, under the gain',
					'    ceiling: with w0 = 2 pi f0,',
					'        R3 = Q (C1 + C2) / (w0 C1 C2),   R1 = Q / (K w0 C1),',
					'        1/R2 = (w0 / Q) (Q^2 (C1 + C2) - K C1)"""',
					'    w0 = 2 * math.pi * st["f0"]',
					`    for c1, c2 in itertools.product(${ctx.caps('C1')}, ${ctx.caps('C2')}):`,
					'        if not 1 / RATIO <= c2 / c1 <= RATIO:',
					'            continue',
					'        g2 = (w0 / st["q"]) * (st["q"] * st["q"] * (c1 + c2) - st["gain"] * c1)',
					'        if g2 > 0:',
					'            r1, r3 = st["q"] / (st["gain"] * w0 * c1), st["q"] * (c1 + c2) / (w0 * c1 * c2)',
					'            yield {"R1": r1, "R2": 1 / g2, "R3": r3, "C1": c1, "C2": c2}'
				])
			);
		}
		blocks.push(
			py([
				'def mfb_bandpass_figures(p):',
				`    """f0, Q and the gain at f0 of an MFB circuit alone${ctx.gbw ? ', an ideal op-amp (circuit_alone aims it)' : ''}:`,
				'        w0^2 = (1/R1 + 1/R2) / (R3 C1 C2),   w0 / Q = (C1 + C2) / (R3 C1 C2),',
				'        gain = R3 C2 / (R1 (C1 + C2))"""',
				'    b = (1 / p["R1"] + 1 / p["R2"]) / (p["R3"] * p["C1"] * p["C2"])',
				'    a = (p["C1"] + p["C2"]) / (p["R3"] * p["C1"] * p["C2"])',
				'    gain_at = p["R3"] * p["C2"] / (p["R1"] * (p["C1"] + p["C2"]))',
				'    return {"f0": math.sqrt(b) / (2 * math.pi), "q": math.sqrt(b) / a, "gain": gain_at}'
			])
		);
		return blocks.join('\n\n\n');
	}
};

const khnBp = {
	topology: 'khnBp',
	label: 'state-variable (KHN) band-pass',
	one: 'state-variable (KHN) band-pass stage',
	many: 'state-variable (KHN) band-pass stages',
	field: ['C'],
	exempt: [],
	short: () => false,
	describe: () =>
		'Each stage is a state-variable (KHN) band-pass, three op-amps: a summer (R3 from the input, R4 from the low-pass output, R7 its feedback, R5 from the band-pass output and R6 to ground on its + input) and two integrators, R1 and C1 then R2 and C2; the first integrator gives the band-pass. R1 and R2 set f0, R5/R6 the Q and R3 the gain, each on its own.',
	code: (ctx) =>
		[
			py([
				'def khn_bandpass_h(p, s):',
				'    """State-variable band-pass, D = 1 + R4/R3 + R4/R7:',
				'        H = (R2 R4 C2 / R3) s / ((R1 R2 R4 C1 C2 / R7) s^2 + R2 C2 D s / (1 + R5/R6) + 1)"""',
				'    d = 1 + p["R4"] / p["R3"] + p["R4"] / p["R7"]',
				'    s2 = p["R1"] * p["R2"] * p["R4"] * p["C1"] * p["C2"] / p["R7"]',
				'    s1 = p["R2"] * p["C2"] * d / (1 + p["R5"] / p["R6"])',
				'    return p["R2"] * p["R4"] * p["C2"] / p["R3"] * s / (s2 * s * s + s1 * s + 1)'
			]),
			py([
				`def khn_bandpass_choices(${ctx.params}):`,
				'    """The KHN stage for each capacitor C of the stock (C1 = C2 = C): with w0 = 2 pi f0,',
				'    R1 = R2 = 1 / (w0 C) set f0, R4 = R7 = R6 = 10 kohm (any equal value works), then',
				'    R3 = Q R4 / gain sets the gain and R5 = (2 Q + gain - 1) R6 the Q."""',
				'    w0 = 2 * math.pi * st["f0"]',
				'    if 2 * st["q"] + st["gain"] <= 1:',
				'        return',
				`    r0 = ${pyEng(KHN_R0)}  # R4 = R7 = R6`,
				'    r3, r5 = st["q"] * r0 / st["gain"], (2 * st["q"] + st["gain"] - 1) * r0',
				`    for c in ${ctx.caps('C')}:`,
				'        r = 1 / (w0 * c)',
				'        yield {"R1": r, "R2": r, "R3": r3, "R4": r0, "R5": r5, "R6": r0, "R7": r0,',
				'               "C1": c, "C2": c}'
			]),
			py([
				'def khn_bandpass_figures(p):',
				'    """f0, Q and the gain at f0 of a KHN stage, D = 1 + R4/R3 + R4/R7:',
				'        w0 = sqrt(R7 / (R1 R2 R4 C1 C2)),   Q = (1 + R5/R6) / D sqrt(R1 R4 C1 / (R2 R7 C2)),',
				'        gain = (R4/R3) (1 + R5/R6) / D"""',
				'    d = 1 + p["R4"] / p["R3"] + p["R4"] / p["R7"]',
				'    big = 1 + p["R5"] / p["R6"]',
				'    w0 = math.sqrt(p["R7"] / (p["R1"] * p["R2"] * p["R4"] * p["C1"] * p["C2"]))',
				'    q_at = big / d * math.sqrt(p["R1"] * p["R4"] * p["C1"] / (p["R2"] * p["R7"] * p["C2"]))',
				'    return {"f0": w0 / (2 * math.pi), "q": q_at, "gain": p["R4"] / p["R3"] * big / d}'
			])
		].join('\n\n\n')
};

const towThomasBp = {
	topology: 'towThomasBp',
	label: 'Tow-Thomas band-pass',
	one: 'Tow-Thomas band-pass stage',
	many: 'Tow-Thomas band-pass stages',
	field: ['C'],
	exempt: [],
	short: () => false,
	describe: () =>
		'Each stage is a Tow-Thomas band-pass, three op-amps: a damped integrator (R1 from the input, Ra from the inverter, C1 with Rd across it; its output is the band-pass), an integrator (Rb and C2) and a unity inverter, its two equal resistors r. Ra and Rb set f0, Rd the Q and R1 the gain, each on its own, and the stage inverts.',
	code: (ctx) =>
		[
			py([
				'def tow_thomas_bandpass_h(p, s):',
				'    """Tow-Thomas band-pass, read at the damped integrator:',
				'        H = -(s / (C1 R1)) / (s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb))"""',
				'    den = s * s + s / (p["C1"] * p["Rd"]) + 1 / (p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
				'    return -s / (p["C1"] * p["R1"]) / den'
			]),
			py([
				`def tow_thomas_bandpass_choices(${ctx.params}):`,
				'    """The Tow-Thomas stage for each capacitor C of the stock (C1 = C2 = C): with w0 = 2 pi f0,',
				'    Ra = Rb = 1 / (w0 C) set f0, Rd = Q Ra the Q, R1 = Rd / gain the gain; the inverter\'s two',
				'    equal resistors r = 10 kohm."""',
				'    w0 = 2 * math.pi * st["f0"]',
				`    for c in ${ctx.caps('C')}:`,
				'        r = 1 / (w0 * c)',
				'        rd = st["q"] * r',
				`        yield {"R1": rd / st["gain"], "Ra": r, "Rb": r, "Rd": rd, "C1": c, "C2": c, "r": ${pyEng(TT_INVERTER_R)}}`
			]),
			py([
				'def tow_thomas_bandpass_figures(p):',
				'    """f0, Q and the gain at f0 of a Tow-Thomas stage:',
				'        w0 = 1 / sqrt(C1 C2 Ra Rb),   Q = w0 C1 Rd,   gain = Rd / R1"""',
				'    w0 = 1 / math.sqrt(p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
				'    return {"f0": w0 / (2 * math.pi), "q": w0 * p["C1"] * p["Rd"], "gain": p["Rd"] / p["R1"]}'
			])
		].join('\n\n\n')
};

/** The six circuits by Python name, in the page's order (NARROW_CIRCUITS). */
export const NARROW_PY_CIRCUITS = {
	rlc_gyrator: rlcGyrator,
	rlc_gic: rlcGic,
	sallen_key_bandpass: sallenKeyBp,
	mfb_bandpass: mfbBp,
	khn_bandpass: khnBp,
	tow_thomas_bandpass: towThomasBp
};

/** The Python circuit of a library topology of a narrow chain, the gain stage's included. */
export const NARROW_PY_NAME = {
	...Object.fromEntries(Object.entries(NARROW_PY_CIRCUITS).map(([name, c]) => [c.topology, name])),
	gainNonInv: 'amplifier'
};

/** The gain stage: its H(s), ratio_pair and the split over up to three amplifiers. */
export const AMPLIFIER = {
	label: 'non-inverting gain stage',
	code: py([
		'def amplifier_h(p, s):',
		'    """Non-inverting gain stage, R1 from the - input to ground, R2 from there to the output:',
		'    H = 1 + R2/R1 (s does not enter it)."""',
		'    return 1 + p["R2"] / p["R1"]'
	])
};

/** nearest() and ratio_pair(), for a gain set by a ratio of two resistors (the gain stage, the Sallen-Key's K). */
export const RATIO_HELPERS = py([
	'def nearest(r):',
	'    """The stocked resistor nearest r, by ratio (the lower one on a tie)."""',
	'    return min(neighbours(r), key=lambda v: abs(math.log(v / r)))',
	'',
	'',
	'def ratio_pair(x):',
	'    """Two stocked resistors in the ratio x, (base, other) with other / base closest to x: every',
	'    stocked base from 1 kohm to 100 kohm tried, other the stocked value nearest x base (over',
	'    10 ohm, under 2 Mohm), the base nearest 10 kohm on a tie. None when no base gives one."""',
	'    best = None',
	'    for base in resistors:',
	'        if not 1e3 <= base <= 100e3:',
	'            continue',
	'        other = nearest(x * base)',
	'        if not 10 < other < 2e6:',
	'            continue',
	'        miss, lean = abs(math.log(other / base / x)), abs(math.log(base / 10e3))',
	'        if best is None or miss < best[0] - 1e-12:',
	'            best = (miss, lean, base, other)',
	'        elif abs(miss - best[0]) <= 1e-12 and lean < best[1]:',
	'            best = (miss, lean, base, other)  # (as close: the base nearer 10 kohm)',
	'    return best[2:] if best else None'
]);

/** gain_stages(): the split of what the chain leaves of K over up to three amplifiers sized for the TL082. */
export const GAIN_STAGES = py([
	'def gain_stages(total):',
	'    """The non-inverting stages that bring the chain up by `total` at f0. An amplifier of gain g',
	"    on a single-pole op-amp keeps g / sqrt(1 + (g f0 / GBW)^2) of it, so the gain is split over",
	'    m identical ones, each total^(1/m), the fewest (up to 3) that keep every g f0 within a tenth',
	"    of gain_gbw (a TL082's gain-bandwidth); with none, the count that loses least,",
	'    m ln(sqrt(1 + (g f0 / GBW)^2)). Each is the stocked pair R2 / R1 closest to g - 1, the last',
	'    taking what the rounding of the others leaves."""',
	'    best = None',
	`    for m in range(1, ${NARROW_MAX_GAIN_STAGES + 1}):`,
	'        g = total ** (1 / m)',
	'        made, amps = 1.0, []',
	'        for k in range(m):',
	'            x = (total / made if k == m - 1 else g) - 1',
	'            pair = ratio_pair(x) if x > 0 else None',
	'            if pair is None:',
	'                break',
	'            amps.append({"R1": pair[0], "R2": pair[1]})',
	'            made *= 1 + pair[1] / pair[0]',
	'        if len(amps) < m:',
	'            continue  # (no stocked pair for one of them)',
	`        quick = g * f0 <= ${pyNum(NARROW_GAIN_SPEED)} * gain_gbw`,
	'        rank = (0, m) if quick else (1, m * math.log(math.hypot(1, g * f0 / gain_gbw)))',
	'        if best is None or rank < best[0]:',
	'            best = (rank, amps)',
	'        if quick:',
	'            break',
	'    if best is None:',
	'        raise SystemExit("No stocked pair of resistors gives the gain stage its gain.")',
	'    return best[1]'
]);
