/**
 * The multiple feedback (MFB) stages of a low-pass and a high-pass, as the
 * page builds them (mfb.js, mfbHighPass.js): its rule (section 5) and its
 * H(s) (section 6). The layout of both, five parts around one op-amp:
 *   Y1 from the input to the summing node A, Y2 from A to ground, Y3 from A
 *   to the inverting input, Y4 from the output back to A, Y5 from the
 *   output to the inverting input, which is held at 0 V; KCL at A and at the
 *   inverting input gives
 *     H = -Y1 Y3 / (Y5 (Y1 + Y2 + Y3 + Y4) + Y3 Y4)
 *   low-pass   R1, C1, R2, R3, C2 (R3 = R1 sets a gain of -1)
 *   high-pass  C1, R1, C2, C3, R2 (C1 = C2 = C3 = C, a gain of -1)
 * The source resistance rs is in series with Y1.
 */

const RULES = {
	mfb_lowpass: (ctx) =>
		[
			`def mfb_lowpass_choices(${ctx.params}):`,
			'    """MFB low-pass of gain -1, for each pair of the stock with C1 >= 8 Q^2 C2 (real resistors):',
			'    x = 1/R3 and y = 1/R2 solve 2x + y = a C1 and x y = w0^2 C1 C2, a = w0 / Q, both roots;',
			'    R1 = R3 - rs keeps the gain at -1 with the source in series with R1."""',
			'    w0 = 2 * math.pi * st["f0"]',
			'    a = w0 / st["q"]',
			`    for c1, c2 in itertools.product(${ctx.caps('C1')}, ${ctx.caps('C2')}):`,
			'        disc = (a * c1) ** 2 - 8 * w0 * w0 * c1 * c2',
			'        if disc < 0:',
			'            continue',
			'        for x in ((a * c1 + math.sqrt(disc)) / 4, (a * c1 - math.sqrt(disc)) / 4):',
			'            r3 = 1 / x',
			'            if r3 > rs:  # (an R3 under rs leaves no R1)',
			'                yield {"R1": r3 - rs, "R2": 1 / (a * c1 - 2 * x), "R3": r3, "C1": c1, "C2": c2}',
			'',
			'',
			'def mfb_lowpass_figures(p, rs):',
			'    """f0, Q and the gain of an MFB low-pass, the source in series with R1."""',
			'    r1 = rs + p["R1"]',
			'    w0 = 1 / math.sqrt(p["R2"] * p["R3"] * p["C1"] * p["C2"])',
			'    a = (1 / r1 + 1 / p["R2"] + 1 / p["R3"]) / p["C1"]',
			'    return {"f0": w0 / (2 * math.pi), "q": w0 / a, "gain": -p["R3"] / r1}'
		].join('\n'),
	mfb_highpass: (ctx) =>
		[
			`def mfb_highpass_choices(${ctx.params}):`,
			'    """MFB high-pass of gain -1, C1 = C2 = C3 = C for each capacitor of the stock: with',
			'    a = w0 / Q, R2 = 3 / (a C) and R1 = 1 / (w0^2 R2 C^2). Its input is C1: the source adds to',
			'    no resistor."""',
			'    w0 = 2 * math.pi * st["f0"]',
			'    a = w0 / st["q"]',
			`    for c in ${ctx.caps('C')}:`,
			'        r2 = 3 / (a * c)',
			'        yield {"R1": 1 / (w0 * w0 * r2 * c * c), "R2": r2, "C1": c, "C2": c, "C3": c}',
			'',
			'',
			'def mfb_highpass_figures(p, rs):',
			'    """f0, Q and the gain of an MFB high-pass (the source ahead of C1 is in the check, 6)."""',
			'    w0 = 1 / math.sqrt(p["R1"] * p["R2"] * p["C2"] * p["C3"])',
			'    a = (p["C1"] + p["C2"] + p["C3"]) / (p["R2"] * p["C2"] * p["C3"])',
			'    return {"f0": w0 / (2 * math.pi), "q": w0 / a, "gain": -p["C1"] / p["C3"]}'
		].join('\n')
};

const RESPONSES = {
	mfb_lowpass: [
		'def mfb_lowpass_h(p, s, rs):',
		'    """MFB low-pass: H = -Y1 Y3 / (Y5 (Y1 + Y2 + Y3 + Y4) + Y3 Y4), with Y1 = 1 / (rs + R1)',
		'    from the input, Y2 = s C1 to ground, Y3 = 1 / R2 to the inverting input, Y4 = 1 / R3 back',
		'    from the output and Y5 = s C2 across the op-amp."""',
		'    y1, y2, y3, y4, y5 = 1 / (rs + p["R1"]), s * p["C1"], 1 / p["R2"], 1 / p["R3"], s * p["C2"]',
		'    return -y1 * y3 / (y5 * (y1 + y2 + y3 + y4) + y3 * y4)'
	].join('\n'),
	mfb_highpass: [
		'def mfb_highpass_h(p, s, rs):',
		'    """MFB high-pass: H = -Y1 Y3 / (Y5 (Y1 + Y2 + Y3 + Y4) + Y3 Y4), with',
		'    Y1 = 1 / (rs + 1 / (s C1)) from the input, Y2 = 1 / R1 to ground, Y3 = s C2 to the',
		'    inverting input, Y4 = s C3 back from the output and Y5 = 1 / R2 across the op-amp."""',
		'    y1 = 1 / (rs + 1 / (s * p["C1"]))',
		'    y2, y3, y4, y5 = 1 / p["R1"], s * p["C2"], s * p["C3"], 1 / p["R2"]',
		'    return -y1 * y3 / (y5 * (y1 + y2 + y3 + y4) + y3 * y4)'
	].join('\n')
};

/**
 * The input admittance Y(s) of each, the current it takes from its input
 * per volt (an ideal source, rs left out): for a band-stop of two branches
 * (band.js), whose first stages share the input node behind rs. The
 * inverting input held at 0 V gives V_out = -Y3 V_A / Y5, and KCL at A
 *   V_A / V_in = Y1 / (Y1 + Y2 + Y3 + Y4 + Y3 Y4 / Y5),  Y = Y1 (1 - V_A / V_in)
 * (psInputY in partSearch.js).
 */
const ADMITTANCES = {
	mfb_lowpass: [
		'def mfb_lowpass_y(p, s):',
		'    """The current an MFB low-pass takes from its input per volt: Y1 (1 - V_A), node A at',
		'    V_A = Y1 / (Y1 + Y2 + Y3 + Y4 + Y3 Y4 / Y5) (the inverting input held at 0 V)."""',
		'    y1, y2, y3, y4, y5 = 1 / p["R1"], s * p["C1"], 1 / p["R2"], 1 / p["R3"], s * p["C2"]',
		'    return y1 * (1 - y1 / (y1 + y2 + y3 + y4 + y3 * y4 / y5))'
	].join('\n'),
	mfb_highpass: [
		'def mfb_highpass_y(p, s):',
		'    """The current an MFB high-pass takes from its input per volt, as for the low-pass:',
		'    Y1 (1 - V_A), V_A = Y1 / (Y1 + Y2 + Y3 + Y4 + Y3 Y4 / Y5), with Y1 = s C1."""',
		'    y1, y2, y3, y4, y5 = s * p["C1"], 1 / p["R1"], s * p["C2"], s * p["C3"], 1 / p["R2"]',
		'    return y1 * (1 - y1 / (y1 + y2 + y3 + y4 + y3 * y4 / y5))'
	].join('\n')
};

export default {
	family: 'multiple feedback (MFB)',
	circuits: { mfb: 'mfb_lowpass', mfbHp: 'mfb_highpass' },
	label: { mfb_lowpass: 'MFB low-pass', mfb_highpass: 'MFB high-pass' },
	figures: { mfb_lowpass: ['f0', 'q', 'gain'], mfb_highpass: ['f0', 'q', 'gain'] },
	rule: (circuit, ctx) => RULES[circuit](ctx),
	response: (circuit) => RESPONSES[circuit],
	admittance: (circuit) => ADMITTANCES[circuit]
};
