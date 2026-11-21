/**
 * The band-pass stages of a transformed band-pass (transform.js), each held
 * at its own centre gain (the target's `gain`, the size: both circuits
 * invert), as the page builds them:
 *   mfb_bandpass         the multiple feedback (Delyiannis-Friend) band-pass
 *                        of mfbBandPass.js: R1 from the input to node A, R2
 *                        from A to ground, C2 from A to the inverting input,
 *                        C1 from the output back to A, R3 across the op-amp
 *   tow_thomas_bandpass  the Tow-Thomas band-pass of towThomas.js
 *                        (designTowThomasBandPass): the low-pass form read at
 *                        A1's output, C1 = C2 = C, Ra = Rb = R
 * The MFB band-pass built for the op-amp of panel 01 (ctx.opamp: `gbw` in
 * SETTINGS) is designed for its single-pole model A(s) = wt / s: each pair
 * of capacitors is solved for the circuit's own targets that land it on the
 * stage's with that op-amp (mfbBandPassPredistorted, a bisection), a pair
 * leaving the op-amp a loop gain under 2 at f0 skipped (mfbBpFitsWith), and
 * its H(s) in the check takes the same model, as the page measures it: the
 * only stage whose check does not take an ideal op-amp. `gbw = None` in
 * SETTINGS reads as an ideal op-amp: the circuit's targets are then the
 * stage's own and its H(s) the ideal one. The source rs adds to R1, the
 * input resistor, in both circuits.
 */

/** The ratio of the two capacitors of an MFB band-pass, at most this either way (MFB_BP_CAP_RATIO). */
const MFB_RATIO = 10;

const MFB_IDEAL = (ctx) =>
	[
		`def mfb_bandpass_choices(${ctx.params}):`,
		'    """MFB band-pass of centre gain -G (G = st["gain"]), for each pair of the stock with C2/C1',
		`    within ${MFB_RATIO} either way: with w0 = 2 pi f0,`,
		'        R3 = Q (C1 + C2) / (w0 C1 C2),  R1 = Q / (G w0 C1),  1/R2 = (w0 / Q) (Q^2 (C1 + C2) - G C1)',
		'    so G must stay under Q^2 (1 + C2/C1), where R2 runs off to infinity; R1 - rs keeps the gain',
		'    with the source in series with R1."""',
		'    w0 = 2 * math.pi * st["f0"]',
		'    q, g = st["q"], st["gain"]',
		`    for c1, c2 in itertools.product(${ctx.caps('C1')}, ${ctx.caps('C2')}):`,
		`        if max(c1 / c2, c2 / c1) > ${MFB_RATIO} * (1 + 1e-9) or g >= q * q * (1 + c2 / c1):`,
		'            continue',
		'        r1 = q / (g * w0 * c1)',
		'        if r1 > rs:',
		'            r2 = 1 / ((w0 / q) * (q * q * (c1 + c2) - g * c1))',
		'            r3 = q * (c1 + c2) / (w0 * c1 * c2)',
		'            yield {"R1": r1 - rs, "R2": r2, "R3": r3, "C1": c1, "C2": c2}'
	].join('\n');

const MFB_OPAMP = (ctx) =>
	[
		'def circuit_targets(st, ratio):',
		'    """The circuit\'s own targets w_c (rad/s), Q_c and centre gain G_c for an MFB band-pass built',
		'    for the op-amp of gain-bandwidth gbw, A(s) = wt / s with wt = 2 pi gbw, such that with it the',
		"    stage's main pole pair lands on st's f0 and Q, and its gain there on st's. Its denominator is",
		'    the cubic (s + p)(s^2 + A s + B), A = wn / Q and B = wn^2 the target\'s and p the third, real',
		"    pole the op-amp's finite gain adds to the loop, so the circuit's a = w_c / Q_c and b = w_c^2",
		'    are',
		'        b = p B / wt,  a = (p A + B - b) / wt',
		'    and p solves wt + a + (1 + C2/C1) b / a = p + A, its one root past wt (by bisection, as the',
		'    page finds it). The gain at wn is then wt / (R1 C1) / (A sqrt(p^2 + wn^2)), which sets G_c.',
		'    None when the op-amp is too slow for any circuit to land there; the target itself for an',
		'    ideal op-amp (gbw None)."""',
		'    wn = 2 * math.pi * st["f0"]',
		'    if gbw is None:',
		'        return wn, st["q"], st["gain"]',
		'    wt = 2 * math.pi * gbw',
		'    big_a, big_b = wn / st["q"], wn * wn',
		'    if not (big_a > big_b / wt and wt * wt - big_a * wt + big_b > 0):',
		'        return None  # (A must lie between B / wt and wt + B / wt for p past wt to solve it)',
		'',
		'    def circuit(p):',
		'        b = p * big_b / wt',
		'        return (p * big_a + big_b - b) / wt, b',
		'',
		'    def miss(p):',
		'        a, b = circuit(p)',
		'        return wt + a + (1 + ratio) * b / a - p - big_a',
		'',
		'    lo, hi = wt, 2 * wt',
		'    for _ in range(61):',
		'        if miss(hi) <= 0:',
		'            break',
		'        lo, hi = hi, 2 * hi',
		'    else:',
		'        return None',
		'    for _ in range(200):',
		'        if hi - lo <= 1e-15 * hi:',
		'            break',
		'        mid = (lo + hi) / 2',
		'        lo, hi = (mid, hi) if miss(mid) > 0 else (lo, mid)',
		'    p = (lo + hi) / 2',
		'    a, b = circuit(p)',
		'    w_c = math.sqrt(b)',
		'    return w_c, w_c / a, st["gain"] * big_a * math.hypot(p, wn) / wt / a',
		'',
		'',
		`def mfb_bandpass_choices(${ctx.params}):`,
		'    """MFB band-pass of centre gain -G built for the op-amp, for each pair of the stock with C2/C1',
		`    within ${MFB_RATIO} either way: the circuit's own targets w_c, Q_c, G_c (circuit_targets), then`,
		'        R3 = Q_c (C1 + C2) / (w_c C1 C2),  R1 = Q_c / (G_c w_c C1),',
		'        1/R2 = (w_c / Q_c) (Q_c^2 (C1 + C2) - G_c C1)',
		'    G_c under Q_c^2 (1 + C2/C1); a pair that leaves the op-amp a loop gain under 2 at f0,',
		'    gbw / ((1 + Q_c^2 (1 + C2/C1)) f_c), is skipped, as the page skips it (too little to correct',
		'    for). R1 - rs keeps the gain with the source in series with R1."""',
		'    targets = {}  # the circuit\'s own targets by C2/C1, which alone they depend on',
		`    for c1, c2 in itertools.product(${ctx.caps('C1')}, ${ctx.caps('C2')}):`,
		'        ratio = c2 / c1',
		`        if max(c1 / c2, ratio) > ${MFB_RATIO} * (1 + 1e-9):`,
		'            continue',
		'        if ratio not in targets:',
		'            targets[ratio] = circuit_targets(st, ratio)',
		'        if targets[ratio] is None:',
		'            continue',
		'        w_c, q_c, g_c = targets[ratio]',
		'        if g_c >= q_c * q_c * (1 + ratio):',
		'            continue',
		'        if gbw is not None and gbw / ((1 + q_c * q_c * (1 + ratio)) * w_c / (2 * math.pi)) < 2:',
		'            continue',
		'        r1 = q_c / (g_c * w_c * c1)',
		'        if r1 > rs:',
		'            r2 = 1 / ((w_c / q_c) * (q_c * q_c * (c1 + c2) - g_c * c1))',
		'            r3 = q_c * (c1 + c2) / (w_c * c1 * c2)',
		'            yield {"R1": r1 - rs, "R2": r2, "R3": r3, "C1": c1, "C2": c2}'
	].join('\n');

const MFB_FIGURES = (ctx) =>
	[
		'def mfb_bandpass_figures(p, rs):',
		ctx.opamp
			? '    """f0, Q and the centre gain of the MFB band-pass circuit alone, the source in series with R1:\n    the op-amp moves the rounded parts as it moves the exact ones."""'
			: '    """f0, Q and the centre gain of an MFB band-pass, the source in series with R1."""',
		'    r1 = rs + p["R1"]',
		'    a = (p["C1"] + p["C2"]) / (p["R3"] * p["C1"] * p["C2"])',
		'    w0 = math.sqrt((1 / r1 + 1 / p["R2"]) / (p["R3"] * p["C1"] * p["C2"]))',
		'    gain = -p["R3"] * p["C2"] / (r1 * (p["C1"] + p["C2"]))',
		'    return {"f0": w0 / (2 * math.pi), "q": w0 / a, "gain": gain}'
	].join('\n');

const RULES = {
	mfb_bandpass: (ctx) => [ctx.opamp ? MFB_OPAMP(ctx) : MFB_IDEAL(ctx), '', '', MFB_FIGURES(ctx)].join('\n'),
	tow_thomas_bandpass: (ctx) =>
		[
			`def tow_thomas_bandpass_choices(${ctx.params}):`,
			'    """Tow-Thomas band-pass of centre gain -G, C1 = C2 = C for each capacitor of the stock:',
			'    R = 1 / (w0 C) for Ra and Rb (f0), Rd = Q R (Q), R1 = Rd / G (the gain; R1 - rs, the',
			'    source in series with R1 into a virtual ground), and the inverter\'s two equal resistors r,',
			'    10 kohm."""',
			'    w0 = 2 * math.pi * st["f0"]',
			`    for c in ${ctx.caps('C')}:`,
			'        r = 1 / (w0 * c)',
			'        rd = st["q"] * r',
			'        r1 = rd / st["gain"]',
			'        if r1 > rs:',
			'            yield {"R1": r1 - rs, "Ra": r, "Rb": r, "Rd": rd, "C1": c, "C2": c, "r": 10e3}',
			'',
			'',
			'def tow_thomas_bandpass_figures(p, rs):',
			'    """f0, Q and the centre gain of a Tow-Thomas band-pass, the source in series with R1."""',
			'    w0 = 1 / math.sqrt(p["Ra"] * p["Rb"] * p["C1"] * p["C2"])',
			'    q = w0 * p["C1"] * p["Rd"]',
			'    return {"f0": w0 / (2 * math.pi), "q": q, "gain": -p["Rd"] / (rs + p["R1"])}'
		].join('\n')
};

const RESPONSES = {
	mfb_bandpass: (ctx) =>
		ctx.opamp
			? [
					'def mfb_bandpass_h(p, s, rs):',
					'    """MFB band-pass with the single-pole op-amp A(s) = wt / s, wt = 2 pi gbw, as the page measures',
					'    it: with Y1 = 1 / (rs + R1) from the input to A, Y2 = 1 / R2 to ground, Y3 = s C2 to the',
					'    inverting input, Y4 = s C1 back from the output and Y5 = 1 / R3 across the op-amp, KCL at A',
					'    and at the inverting input (at -V_out / A) give',
					'        H = -Y1 Y3 / ((Y1 + Y2 + Y3 + Y4) (Y5 + (Y3 + Y5) / A) + Y3 Y4 - Y3^2 / A)',
					'    which an ideal op-amp (1 / A = 0) takes to -Y1 Y3 / (Y5 (Y1 + Y2 + Y3 + Y4) + Y3 Y4)."""',
					'    y1, y2, y3, y4, y5 = 1 / (rs + p["R1"]), 1 / p["R2"], s * p["C2"], s * p["C1"], 1 / p["R3"]',
					'    inv_a = 0.0 if gbw is None else s / (2 * math.pi * gbw)  # 1 / A (0 for an ideal op-amp)',
					'    total = y1 + y2 + y3 + y4',
					'    return -y1 * y3 / (total * (y5 + (y3 + y5) * inv_a) + y3 * y4 - y3 * y3 * inv_a)'
				].join('\n')
			: [
					'def mfb_bandpass_h(p, s, rs):',
					'    """MFB band-pass: H = -Y1 Y3 / (Y5 (Y1 + Y2 + Y3 + Y4) + Y3 Y4), with Y1 = 1 / (rs + R1) from',
					'    the input to A, Y2 = 1 / R2 to ground, Y3 = s C2 to the inverting input, Y4 = s C1 back from',
					'    the output and Y5 = 1 / R3 across the op-amp."""',
					'    y1, y2, y3, y4, y5 = 1 / (rs + p["R1"]), 1 / p["R2"], s * p["C2"], s * p["C1"], 1 / p["R3"]',
					'    return -y1 * y3 / (y5 * (y1 + y2 + y3 + y4) + y3 * y4)'
				].join('\n'),
	tow_thomas_bandpass: () =>
		[
			'def tow_thomas_bandpass_h(p, s, rs):',
			'    """Tow-Thomas band-pass, read at A1\'s output: H = -(s / (C1 (rs + R1))) / D(s) with',
			'    D(s) = s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb), the inverter\'s two resistors r giving -1."""',
			'    d = s * s + s / (p["C1"] * p["Rd"]) + 1 / (p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
			'    return -s / (p["C1"] * (rs + p["R1"])) / d'
		].join('\n')
};

export default {
	family: 'band-pass',
	circuits: { mfbBp: 'mfb_bandpass', towThomasBp: 'tow_thomas_bandpass' },
	label: { mfb_bandpass: 'MFB band-pass', tow_thomas_bandpass: 'Tow-Thomas band-pass' },
	figures: { mfb_bandpass: ['f0', 'q', 'gain'], tow_thomas_bandpass: ['f0', 'q', 'gain'] },
	rule: (circuit, ctx) => RULES[circuit](ctx),
	response: (circuit, ctx) => RESPONSES[circuit](ctx)
};
