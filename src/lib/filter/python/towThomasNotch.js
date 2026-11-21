/**
 * The Tow-Thomas notch stage (towThomas.js: designTowThomasNotch,
 * realizeNotch): a stage with a zero on the Tow-Thomas menu (inverse
 * Chebyshev, elliptic), and a notch stage of a transformation where Boctor
 * cannot build it or the menu says Tow-Thomas. Its rule (section 5), its
 * H(s) (section 6) and the admittance of its input (for a node two branches
 * share). The Tow-Thomas loop of the high-pass (towThomas.js in this
 * folder) plus one resistor Rz from the input into A2:
 *   A1  sums the input through Cin and the loop through Ra (from A3) into
 *       C1 in parallel with the damping Rd; its output is the stage's
 *   A2  integrates A1's output through Rb, and the input through Rz, into C2
 *   A3  inverts A2's output with two equal resistors r (any value)
 * KCL at the three virtual grounds gives
 *   H = -(s^2 Cin / C1 + 1 / (C1 C2 Ra Rz)) / D(s)
 *   D(s) = s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb)
 * so w0 = 1 / sqrt(C1 C2 Ra Rb), Q = w0 C1 Rd, wz^2 = 1 / (Cin C2 Ra Rz),
 * -Cin / C1 far above the zero and -Rb / Rz at DC. The page's rule, the
 * file's too: C1 = C2 = C for each capacitor, Ra = Rb = R = 1 / (w0 C),
 * Rd = Q R, Cin = gain C rounded to the stock (C itself for a gain of 1),
 * then Rz for the zero with that Cin (the rounding of Cin moves the gain,
 * never the zero).
 * The stage's target carries `gain`, the size of the gain far above the
 * zero it is built for (notchOptions in stages.js): 1 on a high-pass,
 * (f0 / fz)^2 on a low-pass and on a band-stop's transformation (their gain
 * of 1 at DC), the page's hfGain on a band-pass's transformation (its gain
 * of 1 at f0). targets.js writes it for a low-pass and a high-pass; a band
 * layout writes it for its own notch stages.
 * The input feeds two virtual grounds, through Cin and Rz: the source
 * resistance adds to no single resistor, and H(s) carries it through the
 * input's admittance y = s Cin + 1 / Rz, the input node at 1 / (1 + rs y) of
 * the source (the page's measure, psInputY in partSearch.js).
 */

const RULE = [
	'def nearest_capacitor(c):',
	'    """The stocked capacitor nearest c, on a log scale."""',
	'    return min(capacitors, key=lambda x: abs(math.log(x / c)))'
].join('\n');

const RULES = {
	tow_thomas_notch: (ctx) =>
		[
			RULE,
			'',
			'',
			`def tow_thomas_notch_choices(${ctx.params}):`,
			'    """Tow-Thomas notch, C1 = C2 = C for each capacitor of the stock: with Ra = Rb = R,',
			'    w0 = 1 / (R C) gives R and Q = Rd / R gives Rd. Its gain far above the zero is -Cin / C,',
			'    so Cin = gain C (the target\'s gain), the stocked capacitor nearest it (C itself for a gain',
			'    of 1), and Rz then puts the zero on fz with that Cin: wz^2 = 1 / (C Cin R Rz). The',
			'    inverter\'s two equal resistors r: 10 kohm. Its input feeds Cin and Rz: the source adds',
			'    to no resistor."""',
			'    w0, wz = 2 * math.pi * st["f0"], 2 * math.pi * st["fz"]',
			`    for c in ${ctx.caps('C')}:`,
			'        r = 1 / (w0 * c)',
			'        cin = c if st["gain"] == 1 else nearest_capacitor(st["gain"] * c)',
			'        yield {"Cin": cin, "Rz": 1 / (c * cin * r * wz * wz), "Ra": r, "Rb": r, "Rd": st["q"] * r,',
			'               "C1": c, "C2": c, "r": 10e3}',
			'',
			'',
			'def tow_thomas_notch_figures(p, rs):',
			'    """f0, Q and fz of a Tow-Thomas notch (its gains follow from Cin / C1, f0 and fz)."""',
			'    w0 = 1 / math.sqrt(p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
			'    wz = 1 / math.sqrt(p["Cin"] * p["C2"] * p["Ra"] * p["Rz"])',
			'    return {"f0": w0 / (2 * math.pi), "q": w0 * p["C1"] * p["Rd"], "fz": wz / (2 * math.pi)}'
		].join('\n')
};

const RESPONSES = {
	tow_thomas_notch: [
		'def tow_thomas_notch_h(p, s, rs):',
		'    """Tow-Thomas notch, read at A1\'s output. A1 sums Cin from the input and Ra from the',
		'    inverter, C1 and the damping Rd across it; A2 integrates A1\'s output through Rb and the',
		'    input through Rz into C2; A3 inverts A2 with its two equal r back to Ra. KCL at the three',
		'    virtual grounds gives',
		'        H = -(s^2 Cin / C1 + 1 / (C1 C2 Ra Rz)) / D(s)',
		'        D(s) = s^2 + s / (C1 Rd) + 1 / (C1 C2 Ra Rb)',
		'    (the inverter\'s two r give -1, whatever their value). The input takes y = s Cin + 1 / Rz',
		'    per volt (both into virtual grounds), so behind rs the input node sees 1 / (1 + rs y) of',
		'    the source\'s voltage."""',
		'    d = s * s + s / (p["C1"] * p["Rd"]) + 1 / (p["C1"] * p["C2"] * p["Ra"] * p["Rb"])',
		'    h = -(s * s * p["Cin"] / p["C1"] + 1 / (p["C1"] * p["C2"] * p["Ra"] * p["Rz"])) / d',
		'    return h / (1 + rs * (s * p["Cin"] + 1 / p["Rz"]))'
	].join('\n')
};

/** The admittance of the input, from an ideal source, for a node two branches share. */
const ADMITTANCES = {
	tow_thomas_notch: [
		'def tow_thomas_notch_y(p, s):',
		'    """The admittance of the input of a Tow-Thomas notch: Cin and Rz into virtual grounds."""',
		'    return s * p["Cin"] + 1 / p["Rz"]'
	].join('\n')
};

export default {
	family: 'Tow-Thomas notch',
	circuits: { towThomasNotch: 'tow_thomas_notch' },
	label: { tow_thomas_notch: 'Tow-Thomas notch' },
	figures: { tow_thomas_notch: ['f0', 'q', 'fz'] },
	rule: (circuit, ctx) => RULES[circuit](ctx),
	response: (circuit) => RESPONSES[circuit],
	admittance: (circuit) => ADMITTANCES[circuit]
};
