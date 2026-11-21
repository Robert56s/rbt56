/**
 * The Tow-Thomas biquad stages of a low-pass and a high-pass, without a
 * zero (towThomas.js: designTowThomasLowPass, designTowThomasHighPass), the
 * all-pole stages of the Tow-Thomas and the Boctor menus: its rule (section
 * 5), its H(s) (section 6) and the admittance of its input (for a node two
 * branches share). Three op-amps, two integrators in a loop:
 *   A1  sums the input (through R1, or Cin for a high-pass) and the loop
 *       (through Ra, from A3) into C1 in parallel with the damping Rd; its
 *       output is the high-pass's
 *   A2  integrates A1's output through Rb into C2; its output is the
 *       low-pass's
 *   A3  inverts A2's output with two equal resistors r (any value: the
 *       page takes the stocked one nearest 10 kohm)
 * KCL at the three virtual grounds, with Y the admittance from the input
 * into A1 (1 / (rs + R1), or 1 / (rs + 1 / (s Cin))), gives
 *   D(s) = s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb)
 *   low-pass   H = (Y / (C1 C2 Rb)) / D(s)       gain Ra / (rs + R1) at DC
 *   high-pass  H = -(s Y / C1) / D(s)            gain -Cin / C1 far above
 * so w0 = 1 / sqrt(C1 C2 Ra Rb) and Q = w0 C1 Rd. The page's rule, the
 * file's too: C1 = C2 = C (= Cin) for each capacitor, Ra = Rb = R =
 * 1 / (w0 C), Rd = Q R, and R1 = R less the source, so the low-pass keeps
 * its gain of 1 with it. The input feeds a virtual ground: its admittance
 * is Y with rs = 0.
 */

const RULES = {
	tow_thomas_lowpass: (ctx) =>
		[
			`def tow_thomas_lowpass_choices(${ctx.params}):`,
			'    """Tow-Thomas low-pass of gain 1, C1 = C2 = C for each capacitor of the stock: with',
			'    Ra = Rb = R, w0 = 1 / (R C) gives R and Q = Rd / R gives Rd; R1 = R - rs holds the gain',
			'    Ra / (rs + R1) at 1 with the source. The inverter\'s two equal resistors r: 10 kohm."""',
			'    w0 = 2 * math.pi * st["f0"]',
			`    for c in ${ctx.caps('C')}:`,
			'        r = 1 / (w0 * c)',
			'        if r > rs:  # (an R under rs leaves no R1)',
			'            yield {"R1": r - rs, "Ra": r, "Rb": r, "Rd": st["q"] * r, "C1": c, "C2": c, "r": 10e3}',
			'',
			'',
			'def tow_thomas_lowpass_figures(p, rs):',
			'    """f0, Q and the gain of a Tow-Thomas low-pass, the source in series with R1."""',
			'    w0 = 1 / math.sqrt(p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
			'    gain = p["Ra"] / (rs + p["R1"])',
			'    return {"f0": w0 / (2 * math.pi), "q": w0 * p["C1"] * p["Rd"], "gain": gain}'
		].join('\n'),
	tow_thomas_highpass: (ctx) =>
		[
			`def tow_thomas_highpass_choices(${ctx.params}):`,
			'    """Tow-Thomas high-pass of gain -1, Cin = C1 = C2 = C for each capacitor of the stock:',
			'    Ra = Rb = R = 1 / (w0 C) and Rd = Q R, as for the low-pass. Its input is Cin: the source',
			'    adds to no resistor. The inverter\'s two equal resistors r: 10 kohm."""',
			'    w0 = 2 * math.pi * st["f0"]',
			`    for c in ${ctx.caps('C')}:`,
			'        r = 1 / (w0 * c)',
			'        yield {"Cin": c, "Ra": r, "Rb": r, "Rd": st["q"] * r, "C1": c, "C2": c, "r": 10e3}',
			'',
			'',
			'def tow_thomas_highpass_figures(p, rs):',
			'    """f0, Q and the gain of a Tow-Thomas high-pass (the source ahead of Cin is in the',
			'    check, 6)."""',
			'    w0 = 1 / math.sqrt(p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
			'    return {"f0": w0 / (2 * math.pi), "q": w0 * p["C1"] * p["Rd"], "gain": -p["Cin"] / p["C1"]}'
		].join('\n')
};

const RESPONSES = {
	tow_thomas_lowpass: [
		'def tow_thomas_lowpass_h(p, s, rs):',
		'    """Tow-Thomas low-pass, two integrators in a loop: A1 takes the input through R1 and the',
		'    loop through Ra into C1 and the damping Rd in parallel; A2 integrates its output through Rb',
		'    into C2 and gives the stage\'s; A3 inverts that with two equal r (any value) back to Ra.',
		'    KCL at their virtual grounds: H = (Y / (C1 C2 Rb)) / D(s), with',
		'    D(s) = s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb) and Y = 1 / (rs + R1) from the input to A1."""',
		'    y = 1 / (rs + p["R1"])',
		'    d = s * s + s / (p["C1"] * p["Rd"]) + 1 / (p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
		'    return y / (p["C1"] * p["C2"] * p["Rb"]) / d'
	].join('\n'),
	tow_thomas_highpass: [
		'def tow_thomas_highpass_h(p, s, rs):',
		'    """Tow-Thomas high-pass, two integrators in a loop: A1 takes the input through Cin and the',
		'    loop through Ra into C1 and the damping Rd in parallel, and gives the stage\'s output; A2',
		'    integrates it through Rb into C2; A3 inverts that with two equal r (any value) back to Ra.',
		'    KCL at their virtual grounds: H = -(s Y / C1) / D(s), with',
		'    D(s) = s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb) and Y = 1 / (rs + 1 / (s Cin)) from the',
		'    input to A1."""',
		'    y = 1 / (rs + 1 / (s * p["Cin"]))',
		'    d = s * s + s / (p["C1"] * p["Rd"]) + 1 / (p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
		'    return -s * y / p["C1"] / d'
	].join('\n')
};

/** The admittance each circuit's input takes from an ideal source, for a node two branches share. */
const ADMITTANCES = {
	tow_thomas_lowpass: [
		'def tow_thomas_lowpass_y(p, s):',
		'    """The admittance of the input of a Tow-Thomas low-pass: R1 into a virtual ground."""',
		'    return 1 / p["R1"]'
	].join('\n'),
	tow_thomas_highpass: [
		'def tow_thomas_highpass_y(p, s):',
		'    """The admittance of the input of a Tow-Thomas high-pass: Cin into a virtual ground."""',
		'    return s * p["Cin"]'
	].join('\n')
};

export default {
	family: 'Tow-Thomas biquad',
	circuits: { towThomas: 'tow_thomas_lowpass', towThomasHp: 'tow_thomas_highpass' },
	label: { tow_thomas_lowpass: 'Tow-Thomas low-pass', tow_thomas_highpass: 'Tow-Thomas high-pass' },
	figures: { tow_thomas_lowpass: ['f0', 'q', 'gain'], tow_thomas_highpass: ['f0', 'q', 'gain'] },
	rule: (circuit, ctx) => RULES[circuit](ctx),
	response: (circuit) => RESPONSES[circuit],
	admittance: (circuit) => ADMITTANCES[circuit]
};
