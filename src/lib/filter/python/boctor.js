import { comment, pyRaise } from './emit';

/**
 * The Boctor notch stages, low-pass and high-pass (boctor.js:
 * designBoctorNotch, boctorIdeal, boctorActual, boctorFeasible), for a
 * stage with a zero on the Boctor menu and the notch stages of a
 * transformation on either side of their notch: its rule (section 5), its
 * H(s) (section 6) and the admittance of its input (for a node two branches
 * share). One op-amp, six resistors and two capacitors (Analog Devices,
 * Basic Linear Design, figures 8.78 and 8.79), the op-amp holding its
 * inverting input M at its + input P:
 *   low-pass   C2 from the input to X, R2 from X to ground, R6 from X to M,
 *              R4 from X to the output; R1 from M to ground, C1 from M to
 *              the output; R3 and R5 divide the input onto P
 *   high-pass  C2 and R2 in series from the input to M, R4 from M to
 *              ground, R5 from M to the output; C1 and R1 from the input to
 *              P, R3 from the output to P, R6 from P to ground
 * KCL at M and at X (at M and at P for the high-pass) gives H(s) = (b2 s^2
 * + b1 s + b0) / (s^2 + a s + b), a zero at wz^2 = b0 / b2 when b1 = 0.
 * The page's rule, the file's too, from the library's own designer:
 *   low-pass   for each pair C1, C2: kd = R5 / (R3 + R5) = (f0 / fz)^2 (R5 =
 *              10 kohm), which holds the gain at DC at 1; G6 = t w0 C1 with
 *              t a root of the zero's condition, G4 from f0, G2 from Q, G1
 *              from b1 = 0 (it needs f0 < fz)
 *   high-pass  C1 = C2 = C for each capacitor: the parallel of R1, R3 and R6
 *              and the sum R2 + R4 || R5 from f0, Q and fz, R2 from b1 = 0,
 *              R1 from the zero, and the gain far above the zero (1 + R5 /
 *              R4) free over the designer's steps (it needs fz < f0 and
 *              Q (1 - (fz / f0)^2) < 1)
 * Rounding leaves a little s term in the numerator, so the figures rule c
 * reads hold it too (s_term, 1 + |b1| / (b2 wz), 1 for a zero on the j w
 * axis), as the designer's own miss does. The input feeds two branches, so
 * the source resistance adds to no single resistor: H(s) carries it
 * through the input's admittance y, the input node then at 1 / (1 + rs y)
 * of the source (the page's measure, psInputY in partSearch.js).
 */

/**
 * Whether some pair of `caps` builds the low-pass form of a stage (wn, q,
 * wz in rad/s): the conditions of boctor_lowpass_notch_pairs below, the
 * arithmetic the file's.
 */
function lowPassPairsExist({ wn, q, wz }, caps) {
	const kd = (wn / wz) ** 2;
	if (!(kd < 1)) return false;
	return caps.some((c1) =>
		caps.some((c2) => {
			const u = c2 / c1;
			const disc = (u / (kd * q)) ** 2 - 4 * u * (1 / kd + 1 / q ** 2);
			if (disc < 0) return false;
			return [(u / (kd * q) + Math.sqrt(disc)) / 2, (u / (kd * q) - Math.sqrt(disc)) / 2].some((t) => {
				const g6 = t * wn * c1;
				const g4 = (wn * wn * c1 * c2) / g6;
				return (wn * c2) / q - g4 - g6 > 0 && g6 * (1 / kd - 1) - (wn * c1) / q > 0;
			});
		})
	);
}

/** The design's stages the low-pass form builds: those the page shows on it, or a zero above the pole where it shows none (design.stages and shown.stages line up, band designs too). */
const lowPassStages = (ctx) => (ctx.design?.stages ?? []).filter((s, i) => (ctx.shown?.stages?.[i] ? ctx.shown.stages[i].topology === 'boctor' : Number.isFinite(s.wz) && s.wz > s.wn));

/**
 * The low-pass form's choices. Its pairs need C2 / C1 over about Q^4 (fz /
 * f0)^2, so a short list of capacitors may build none for a high Q: the
 * page then takes its full grid, the E6 series from 1 pF to 6.8 uF
 * (designerStage in partSearch.js, stockShortfall), and so does the file,
 * saying so, where a stage of the design needs it. Otherwise (and with the
 * E6 series as the stock: E24, E96, the lab resistors) the choices are the
 * pairs of the stock alone.
 */
function boctorLowPassChoices(ctx) {
	const head = [
		'    """Boctor low-pass notch, for each pair C1, C2 of the stock. R3 and R5 divide the input',
		'    onto the + input by kd = R5 / (R3 + R5) = (f0 / fz)^2, which holds the gain at DC at 1',
		'    (R5 = 10 kohm). With Gi = 1/Ri, t = G6 / (w0 C1) and u = C2 / C1, its H(s) (in 6) lands on',
		'    the target when',
		'        f0                     G4 = w0^2 C1 C2 / G6',
		'        Q                      G2 = w0 C2 / Q - G4 - G6',
		'        no s in the numerator  G1 = G6 (1/kd - 1) - w0 C1 / Q',
		'        the zero on fz         t^2 - u t / (kd Q) + u (1/kd + 1/Q^2) = 0, both roots,',
		'    each kept where G1 and G2 come out positive.'
	];
	const last = head.length - 1;
	const short = Array.isArray(ctx.stock.capacitors) && lowPassStages(ctx).some((s) => !lowPassPairsExist(s, ctx.stock.capacitors));
	if (!short) {
		const doc = [...head.slice(0, last), `${head[last]} Its input feeds C2 and R3: the source`, '    adds to no resistor."""'];
		return [`def boctor_lowpass_notch_choices(${ctx.params}):`, ...doc, ...boctorLowPassPairs(ctx.caps('C'), 'capacitors')];
	}
	const typed = ctx.params.endsWith('typed');
	const doc = head.map((l, i) => (i === 0 ? '    """Boctor low-pass notch, for each pair C1 of c1s, C2 of c2s. R3 and R5 divide the input' : i === last ? `${l}"""` : l));
	return [
		comment("The page's own capacitors, the E6 series from 1 pF to 6.8 uF: the pairs a Boctor low-pass notch tries where none of the stock builds it, as the page does."),
		'E6_CAPACITORS = [m * 10 ** d for d in range(-12, -5) for m in (1.0, 1.5, 2.2, 3.3, 4.7, 6.8)]',
		'',
		'',
		'def boctor_lowpass_notch_pairs(st, c1s, c2s):',
		...doc,
		...boctorLowPassPairs('c1s', 'c2s'),
		'',
		'',
		`def boctor_lowpass_notch_choices(${ctx.params}):`,
		...(typed
			? [
					'    """The pairs of the stock, C1 the one typed on the page if any; where none builds the',
					'    stage (a high Q wants C2 / C1 over about Q^4 (fz / f0)^2), those of E6_CAPACITORS, as the',
					'    page does. Its input feeds C2 and R3: the source adds to no resistor."""'
				]
			: [
					'    """The pairs of the stock; where none builds the stage (a high Q wants C2 / C1 over about',
					'    Q^4 (fz / f0)^2), those of E6_CAPACITORS, as the page does. Its input feeds C2 and R3: the',
					'    source adds to no resistor."""'
				]),
		`    choices = list(boctor_lowpass_notch_pairs(st, ${ctx.caps('C')}, capacitors))`,
		typed ? '    if not choices and not typed:' : '    if not choices:',
		'        print(f"  no pair of the stock builds the stage at f0 = {eng(st[\'f0\'], \'Hz\')}:")',
		'        print("  the E6 series from 1 pF to 6.8 uF is tried, as the page does")',
		'        choices = list(boctor_lowpass_notch_pairs(st, E6_CAPACITORS, E6_CAPACITORS))',
		'    return choices'
	];
}

/** The body of the low-pass form's pairs: C1 from `c1s`, C2 from `c2s` (Python expressions). */
function boctorLowPassPairs(c1s, c2s) {
	return [
		'    w0, q = 2 * math.pi * st["f0"], st["q"]',
		'    kd = (st["f0"] / st["fz"]) ** 2',
		'    if not kd < 1:',
		pyRaise("A Boctor low-pass notch needs its zero above f0; the page's Tow-Thomas menu builds this stage.", '        '),
		`    for c1, c2 in itertools.product(${c1s}, ${c2s}):`,
		'        u = c2 / c1',
		'        disc = (u / (kd * q)) ** 2 - 4 * u * (1 / kd + 1 / q ** 2)',
		'        if disc < 0:',
		'            continue',
		'        for t in ((u / (kd * q) + math.sqrt(disc)) / 2, (u / (kd * q) - math.sqrt(disc)) / 2):',
		'            g6 = t * w0 * c1',
		'            g4 = w0 * w0 * c1 * c2 / g6',
		'            g2 = w0 * c2 / q - g4 - g6',
		'            g1 = g6 * (1 / kd - 1) - w0 * c1 / q',
		'            if g1 > 0 and g2 > 0:',
		'                yield {"R1": 1 / g1, "R2": 1 / g2, "R3": 10e3 * (1 / kd - 1), "R4": 1 / g4,',
		'                       "R5": 10e3, "R6": 1 / g6, "C1": c1, "C2": c2}'
	];
}

const RULES = {
	boctor_lowpass_notch: (ctx) =>
		[
			...boctorLowPassChoices(ctx),
			'',
			'',
			'def boctor_lowpass_notch_figures(p, rs):',
			'    """f0, Q, fz, the gain at DC and s_term of a Boctor low-pass notch, from the coefficients',
			'    of its H(s) = (b2 s^2 + b1 s + b0) / (s^2 + a s + b) (in 6), b2 = kd: s_term is',
			'    1 + |b1| / (b2 wz) = 1 + 1/Qz, Qz the Q of the zero pair, 1 when the numerator has no s',
			'    term (the zero right on the j w axis, the deepest notch)."""',
			'    g1, g2, g3, g4, g5, g6 = (1 / p[name] for name in ("R1", "R2", "R3", "R4", "R5", "R6"))',
			'    c1, c2 = p["C1"], p["C2"]',
			'    kd, g = g3 / (g3 + g5), g2 + g4 + g6',
			'    a, b = g / c2, g4 * g6 / (c1 * c2)',
			'    b1 = kd * ((g6 + g1) / c1 + a) - g6 / c1',
			'    b0 = kd * (g1 * g + g6 * (g2 + g4)) / (c1 * c2)',
			'    wz = math.sqrt(b0 / kd)',
			'    return {"f0": math.sqrt(b) / (2 * math.pi), "q": math.sqrt(b) / a, "fz": wz / (2 * math.pi),',
			'            "dc_gain": b0 / b, "s_term": 1 + abs(b1) / (kd * wz)}'
		].join('\n'),
	boctor_highpass_notch: (ctx) =>
		[
			`def boctor_highpass_notch_choices(${ctx.params}):`,
			'    """Boctor high-pass notch, C1 = C2 = C for each capacitor of the stock. With',
			'    rho = (fz / f0)^2 and Gi = 1/Ri, its H(s) (in 6) lands on the target when',
			'        R1, R3 and R6 in parallel  rp = Q (1 - rho) / (w0 C)',
			'        R2 and R4 || R5 in series  rx = 1 / (Q (1 - rho) w0 C)',
			'        no s in the numerator      R2 = (rx - rp) / (1 + rho)',
			'        the zero on fz             R1 = 1 / (wz^2 C^2 R2)',
			'    and the gain far above the zero, gain = 1 + R5 / R4, is free: R5 = gain (rx - R2),',
			'    R4 = R5 / (gain - 1), R3 = gain rp rx / (rx - R2) and G6 = 1 / rp - G1 - G3, which stays',
			'    positive for a gain over k_least = (rx - R2) / (rp rx (1 / rp - G1)); the page takes',
			'    gain = t max(2, 1.5 k_least) for t from 1 to 4. Its input feeds C1, R1 and C2: the source',
			'    adds to no resistor."""',
			'    w0, wz, q = 2 * math.pi * st["f0"], 2 * math.pi * st["fz"], st["q"]',
			'    rho = (st["fz"] / st["f0"]) ** 2',
			'    if not (rho < 1 and q * (1 - rho) < 1):',
			pyRaise("A Boctor high-pass notch needs its zero under f0 and Q (1 - (fz/f0)^2) under 1; the page's Tow-Thomas menu builds this stage.", '        '),
			`    for c in ${ctx.caps('C')}:`,
			'        rp = q * (1 - rho) / (w0 * c)',
			'        rx = 1 / (q * (1 - rho) * w0 * c)',
			'        r2 = (rx - rp) / (1 + rho)',
			'        r1 = 1 / (wz * wz * c * c * r2)',
			'        k_least = (rx - r2) / (rp * rx * (1 / rp - 1 / r1))',
			'        for t in (1, 1.125, 1.25, 1.5, 2, 3, 4):',
			'            gain = t * max(2, 1.5 * k_least)',
			'            r3 = gain * rp * rx / (rx - r2)',
			'            r5 = gain * (rx - r2)',
			'            yield {"R1": r1, "R2": r2, "R3": r3, "R4": r5 / (gain - 1), "R5": r5,',
			'                   "R6": 1 / (1 / rp - 1 / r1 - 1 / r3), "C1": c, "C2": c}',
			'',
			'',
			'def boctor_highpass_notch_figures(p, rs):',
			'    """f0, Q, fz and s_term of a Boctor high-pass notch, as for the low-pass, from its H(s)',
			'    (in 6) multiplied through by 1 + s C2 R2 and divided by d = G5 C1 C2 R2. Its gain far above',
			'    the zero is free and counts for nothing; parts that leave no pole pair miss by everything."""',
			'    g1, g3, g4, g5, g6 = (1 / p[name] for name in ("R1", "R3", "R4", "R5", "R6"))',
			'    c1, c2, r2 = p["C1"], p["C2"], p["R2"]',
			'    sm, sp = g4 + g5, g1 + g3 + g6  # the conductances on M and on P',
			'    d = g5 * c1 * c2 * r2',
			'    a = (g5 * (c1 + sp * c2 * r2) - g3 * (c2 + sm * c2 * r2)) / d',
			'    b = (g5 * sp - g3 * sm) / d',
			'    b2, b1, b0 = sm / g5, (g1 * sm * c2 * r2 + c1 * sm - c2 * (g3 + g6)) / d, g1 * sm / d',
			'    if a <= 0 or b <= 0:',
			'        return {"f0": math.inf, "q": math.inf, "fz": math.inf, "s_term": math.inf}',
			'    wz = math.sqrt(b0 / b2)',
			'    return {"f0": math.sqrt(b) / (2 * math.pi), "q": math.sqrt(b) / a, "fz": wz / (2 * math.pi),',
			'            "s_term": 1 + abs(b1) / (b2 * wz)}'
		].join('\n')
};

const RESPONSES = {
	boctor_lowpass_notch: [
		'def boctor_lowpass_notch_h(p, s, rs):',
		'    """Boctor low-pass notch: the op-amp holds M at its + input, kd = R5 / (R3 + R5) of the',
		'    input. KCL at M (R6 from X, R1 to ground, C1 to the output) and at X (C2 from the input, R2',
		'    to ground, R6 to M, R4 to the output), with Gi = 1/Ri and G = G2 + G4 + G6, gives',
		'        H = (kd (s C1 + G1 + G6) (s C2 + G) - G6 (s C2 + kd G6)) / (s C1 (s C2 + G) + G4 G6)',
		'    The input takes y = s C2 (1 - Vx) + 1 / (R3 + R5) per volt (into C2, and down R3 and R5),',
		'    so behind rs the input node sees 1 / (1 + rs y) of the source\'s voltage."""',
		'    g1, g2, g4, g6 = (1 / p[name] for name in ("R1", "R2", "R4", "R6"))',
		'    c1, c2 = p["C1"], p["C2"]',
		'    kd, g = p["R5"] / (p["R3"] + p["R5"]), g2 + g4 + g6',
		'    num = kd * (s * c1 + g1 + g6) * (s * c2 + g) - g6 * (s * c2 + kd * g6)',
		'    h = num / (s * c1 * (s * c2 + g) + g4 * g6)',
		'    vx = kd + (kd * (g1 + s * c1) - s * c1 * h) / g6  # X, from KCL at M',
		'    y = s * c2 * (1 - vx) + 1 / (p["R3"] + p["R5"])',
		'    return h / (1 + rs * y)'
	].join('\n'),
	boctor_highpass_notch: [
		'def boctor_highpass_notch_h(p, s, rs):',
		'    """Boctor high-pass notch: the op-amp holds M and P at one voltage v. C2 and R2 in series',
		'    feed M from the input (gm = s C2 / (1 + s C2 R2)), R4 takes it to ground and R5 to the',
		'    output; C1 and R1 feed P from the input (y1 = s C1 + G1), R3 comes back from the output and',
		'    R6 goes to ground. KCL at M and at P, with Gi = 1/Ri, gives',
		'        H = ((G4 + G5) y1 - (G3 + G6) gm) / (G5 (y1 + G3 + G6) - G3 (G4 + G5 + gm))',
		'    The input takes y = (1 - v) (y1 + gm) per volt, so behind rs the input node sees',
		'    1 / (1 + rs y) of the source\'s voltage."""',
		'    g1, g3, g4, g5, g6 = (1 / p[name] for name in ("R1", "R3", "R4", "R5", "R6"))',
		'    y1 = s * p["C1"] + g1',
		'    gm = s * p["C2"] / (1 + s * p["C2"] * p["R2"])',
		'    den = g5 * (y1 + g3 + g6) - g3 * (g4 + g5 + gm)',
		'    h = ((g4 + g5) * y1 - (g3 + g6) * gm) / den',
		'    v = (g5 * y1 - g3 * gm) / den  # M and P, from the same two equations',
		'    return h / (1 + rs * (1 - v) * (y1 + gm))'
	].join('\n')
};

/** The admittance each circuit's input takes from an ideal source, for a node two branches share. */
const ADMITTANCES = {
	boctor_lowpass_notch: [
		'def boctor_lowpass_notch_y(p, s):',
		'    """The admittance of the input of a Boctor low-pass notch: into C2, and down R3 and R5."""',
		'    g1, g6 = 1 / p["R1"], 1 / p["R6"]',
		'    kd = p["R5"] / (p["R3"] + p["R5"])',
		'    h = boctor_lowpass_notch_h(p, s, 0.0)',
		'    vx = kd + (kd * (g1 + s * p["C1"]) - s * p["C1"] * h) / g6  # X, from KCL at M',
		'    return s * p["C2"] * (1 - vx) + 1 / (p["R3"] + p["R5"])'
	].join('\n'),
	boctor_highpass_notch: [
		'def boctor_highpass_notch_y(p, s):',
		'    """The admittance of the input of a Boctor high-pass notch: into C1 and R1, and into C2."""',
		'    g1, g3, g4, g5, g6 = (1 / p[name] for name in ("R1", "R3", "R4", "R5", "R6"))',
		'    y1 = s * p["C1"] + g1',
		'    gm = s * p["C2"] / (1 + s * p["C2"] * p["R2"])',
		'    v = (g5 * y1 - g3 * gm) / (g5 * (y1 + g3 + g6) - g3 * (g4 + g5 + gm))  # M and P',
		'    return (1 - v) * (y1 + gm)'
	].join('\n')
};

export default {
	family: 'Boctor notch',
	circuits: { boctor: 'boctor_lowpass_notch', boctorHp: 'boctor_highpass_notch' },
	label: { boctor_lowpass_notch: 'Boctor low-pass notch', boctor_highpass_notch: 'Boctor high-pass notch' },
	figures: { boctor_lowpass_notch: ['f0', 'q', 'fz', 'dc_gain', 's_term'], boctor_highpass_notch: ['f0', 'q', 'fz', 's_term'] },
	rule: (circuit, ctx) => RULES[circuit](ctx),
	response: (circuit) => RESPONSES[circuit],
	admittance: (circuit) => ADMITTANCES[circuit]
};
