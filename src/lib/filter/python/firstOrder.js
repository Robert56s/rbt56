/**
 * The first-order stage of an odd order, the same for every topology
 * (firstOrder.js, firstOrderHighPass.js): R and C in series into a
 * follower, the output across C for a low-pass, across R for a high-pass.
 * The source resistance rs is in series with R and C, so it adds to R in
 * the time constant: (rs + R) C = 1 / (2 pi f0).
 */

const RULES = {
	rc_lowpass: (ctx) =>
		[
			`def rc_lowpass_choices(${ctx.params}):`,
			'    """RC low-pass and follower, for each capacitor of the stock: (rs + R) C = 1 / (2 pi f0)',
			'    gives R, the source in series with it."""',
			`    for c in ${ctx.caps('C')}:`,
			'        r = 1 / (2 * math.pi * st["f0"] * c) - rs',
			'        if r > 0:',
			'            yield {"R": r, "C": c}',
			'',
			'',
			'def rc_lowpass_figures(p, rs):',
			'    """f0 of an RC low-pass, the source in series with R."""',
			'    return {"f0": 1 / (2 * math.pi * (rs + p["R"]) * p["C"])}'
		].join('\n'),
	rc_highpass: (ctx) =>
		[
			`def rc_highpass_choices(${ctx.params}):`,
			'    """CR high-pass and follower, for each capacitor of the stock: (rs + R) C = 1 / (2 pi f0)',
			'    gives R, the source in series with C and R."""',
			`    for c in ${ctx.caps('C')}:`,
			'        r = 1 / (2 * math.pi * st["f0"] * c) - rs',
			'        if r > 0:',
			'            yield {"R": r, "C": c}',
			'',
			'',
			'def rc_highpass_figures(p, rs):',
			'    """f0 of a CR high-pass, the source in series with C and R."""',
			'    return {"f0": 1 / (2 * math.pi * (rs + p["R"]) * p["C"])}'
		].join('\n')
};

const RESPONSES = {
	rc_lowpass: ['def rc_lowpass_h(p, s, rs):', '    """RC low-pass and follower: H = 1 / (1 + s (rs + R) C)."""', '    return 1 / (1 + s * (rs + p["R"]) * p["C"])'].join('\n'),
	rc_highpass: ['def rc_highpass_h(p, s, rs):', '    """CR high-pass and follower: H = s R C / (1 + s (rs + R) C)."""', '    return s * p["R"] * p["C"] / (1 + s * (rs + p["R"]) * p["C"])'].join('\n')
};

/**
 * The input admittance of each, for a band-stop of two branches (band.js):
 * R and C in series into the follower, Y = s C / (1 + s R C).
 */
const ADMITTANCES = {
	rc_lowpass: ['def rc_lowpass_y(p, s):', '    """The current an RC low-pass takes from its input per volt: R and C in series."""', '    return s * p["C"] / (1 + s * p["R"] * p["C"])'].join('\n'),
	rc_highpass: ['def rc_highpass_y(p, s):', '    """The current a CR high-pass takes from its input per volt: C and R in series."""', '    return s * p["C"] / (1 + s * p["R"] * p["C"])'].join('\n')
};

export default {
	family: 'first-order RC',
	circuits: { firstOrder: 'rc_lowpass', firstOrderHp: 'rc_highpass' },
	label: { rc_lowpass: 'RC low-pass and follower', rc_highpass: 'CR high-pass and follower' },
	figures: { rc_lowpass: ['f0'], rc_highpass: ['f0'] },
	rule: (circuit, ctx) => RULES[circuit](ctx),
	response: (circuit) => RESPONSES[circuit],
	admittance: (circuit) => ADMITTANCES[circuit]
};
