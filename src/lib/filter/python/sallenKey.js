/**
 * The Sallen-Key stages of a low-pass and a high-pass, as the page builds
 * them (sallenKey.js, sallenKeyHighPass.js): unity gain, the op-amp a
 * follower. Its rule (section 5), its H(s) (section 6) and the admittance
 * of its input (for a node two branches share). The layout of both, four
 * parts around the follower:
 *   Y1 from the input to the node X, Y2 from X to the + input P, Y3 from X
 *   back to the output, Y4 from P to ground; the output follows P, and KCL
 *   at P and at X gives
 *     H = Y1 Y2 / (Y1 Y2 + Y4 (Y1 + Y2 + Y3))
 *     Y_in = Y1 Y4 (Y2 + Y3) / (Y1 Y2 + Y4 (Y1 + Y2 + Y3))
 *   low-pass   R1 (Y1), R2 (Y2), Ctop (Y3), Cbottom (Y4)
 *   high-pass  C1 (Y1), C2 (Y2), Rtop (Y3), Rbottom (Y4)
 * The source resistance rs is in series with Y1.
 *
 * The low-pass: with R1 = R2, as the page builds it, Q = sqrt(Ctop /
 * Cbottom) / 2 follows the capacitors alone, so the page rounds Ctop to the
 * stock around 4 Q^2 Cbottom. The file's rule takes every pair of the stock
 * at or above that ratio, where two different resistors reach the Q
 * exactly (the hand method's unequal resistors, handDesign.js solveParts):
 * Q and w0 set their sum and their product. A stock none of whose pairs
 * reaches the ratio (a short list, a Q of 8 asks for 256:1), or capacitors
 * typed under it, leave the pairs of the highest ratio with equal resistors,
 * as the page builds them: f0 on target, Q short. That fallback is written
 * only where a stage of the design needs it (fallbackNeeded); a stock edited
 * in SETTINGS so that none reaches the ratio then builds no choice, and the
 * file checks the page's parts alone (parts.js). The high-pass, the dual:
 * C1 = C2 = C, Rtop = 1 / (2 Q w0 C) and Rbottom = 4 Q^2 Rtop, any Q.
 */

/** The capacitors of the stock (E6 from 1 pF to 6.8 uF without a list), as SETTINGS writes them. */
const E6_STOCK = [];
for (let d = -12; d <= -6; d++) for (const m of [1.0, 1.5, 2.2, 3.3, 4.7, 6.8]) E6_STOCK.push(m * 10 ** d);

/**
 * Whether the low-pass rule of this design needs its fallback: a stage on
 * it none of whose pairs (the ones typed for it, else the stock's) reaches
 * Ctop >= 4 Q^2 Cbottom with a root over the source it takes. The rule
 * writes the fallback only then; a pair close to the ratio counts as short,
 * so that the file's own arithmetic never falls on the other side of it.
 */
function fallbackNeeded(ctx) {
	const caps = ctx.stock?.capacitors ?? E6_STOCK;
	const sides = ctx.sides ?? (ctx.side ? [ctx.side] : []);
	const parallel = ctx.type === 'bandstop' && Boolean(ctx.sides);
	let at = 0;
	let needed = false;
	for (const side of sides) {
		side.design.stages.forEach((stage, j) => {
			const i = at + j;
			if (stage.order !== 2 || Number.isFinite(stage.wz) || side.circuits.pair !== 'sallen_key_lowpass') return;
			const rs = i === 0 || (parallel && i === sides[0].design.stages.length) ? ctx.rs : 0;
			const typed = ctx.typed?.[i] ?? {};
			const exactOf = (tops, bottoms) =>
				tops.some((ctop) =>
					bottoms.some((cbottom) => {
						const total = 1 / (stage.wn * stage.q * cbottom);
						const disc = total * total - 4 / (stage.wn * stage.wn * ctop * cbottom);
						return disc > 1e-6 * total * total && (total + Math.sqrt(disc)) / 2 > rs * (1 + 1e-6);
					})
				);
			const typedPairs = 'Ctop' in typed || 'Cbottom' in typed;
			const ok = typedPairs ? exactOf('Ctop' in typed ? [typed.Ctop] : caps, 'Cbottom' in typed ? [typed.Cbottom] : caps) : exactOf(caps, caps);
			if (!ok) needed = true;
		});
		at += side.design.stages.length;
	}
	return needed;
}

const RULES = {
	sallen_key_lowpass: (ctx) => {
		const fallback = fallbackNeeded(ctx);
		const pairs = `itertools.product(${ctx.caps('Ctop')}, ${ctx.caps('Cbottom')})`;
		return [
			`def sallen_key_lowpass_choices(${ctx.params}):`,
			'    """Sallen-Key low-pass of gain 1, for each pair of the stock with Ctop >= 4 Q^2 Cbottom.',
			'    With the source in series with R1, rs + R1 and R2 add up to 1 / (w0 Q Cbottom) and',
			'    multiply to 1 / (w0^2 Ctop Cbottom): they are the two roots of R^2 - total R + product = 0,',
			...(fallback
				? [
						'    real from that ratio up, and either one can be rs + R1. With no pair that high, the pairs',
						'    of the highest ratio take rs + R1 = R2, which sets f0, and Q falls short of its target:',
						'    sqrt(Ctop / Cbottom) / 2."""'
					]
				: ['    real from that ratio up, and either one can be rs + R1."""']),
			'    w0 = 2 * math.pi * st["f0"]',
			...(fallback ? [`    pairs = list(${pairs})`, '    exact = False', '    for ctop, cbottom in pairs:'] : [`    for ctop, cbottom in ${pairs}:`]),
			'        total = 1 / (w0 * st["q"] * cbottom)  # rs + R1 + R2',
			'        product = 1 / (w0 * w0 * ctop * cbottom)  # (rs + R1) R2',
			'        disc = total * total - 4 * product',
			'        if disc < 0:',
			'            continue',
			'        for r in ((total + math.sqrt(disc)) / 2, (total - math.sqrt(disc)) / 2):',
			'            if r > rs:  # (a root under rs leaves no R1)',
			...(fallback ? ['                exact = True'] : []),
			'                yield {"R1": r - rs, "R2": total - r, "Ctop": ctop, "Cbottom": cbottom}',
			...(fallback
				? [
						'    if not exact:',
						'        top = max(ctop / cbottom for ctop, cbottom in pairs)',
						'        need = 4 * st["q"] * st["q"]',
						'        print(f"  the stage at {eng(st[\'f0\'], \'Hz\')} needs Ctop / Cbottom >= 4 Q^2 = {need:.4g},")',
						'        print(f"  its capacitors reach {top:.4g}: rs + R1 = R2 there, and Q falls short")',
						'        for ctop, cbottom in pairs:',
						'            r = 1 / (w0 * math.sqrt(ctop * cbottom))',
						'            if ctop / cbottom == top and r > rs:',
						'                yield {"R1": r - rs, "R2": r, "Ctop": ctop, "Cbottom": cbottom}'
					]
				: []),
			'',
			'',
			'def sallen_key_lowpass_figures(p, rs):',
			'    """f0 and Q of a Sallen-Key low-pass, the source in series with R1 (the follower\'s gain',
			'    is 1)."""',
			'    r1 = rs + p["R1"]',
			'    w0 = 1 / math.sqrt(r1 * p["R2"] * p["Ctop"] * p["Cbottom"])',
			'    return {"f0": w0 / (2 * math.pi), "q": 1 / (w0 * (r1 + p["R2"]) * p["Cbottom"])}'
		].join('\n');
	},
	sallen_key_highpass: (ctx) =>
		[
			`def sallen_key_highpass_choices(${ctx.params}):`,
			'    """Sallen-Key high-pass of gain 1, C1 = C2 = C for each capacitor of the stock:',
			'    Rbottom = 4 Q^2 Rtop sets the Q, and w0^2 = 1 / (C^2 Rtop Rbottom) gives',
			'    Rtop = 1 / (2 Q w0 C). Its input is C1: the source adds to no resistor."""',
			'    w0 = 2 * math.pi * st["f0"]',
			`    for c in ${ctx.caps('C')}:`,
			'        rtop = 1 / (2 * st["q"] * w0 * c)',
			'        yield {"Rtop": rtop, "Rbottom": 4 * st["q"] * st["q"] * rtop, "C1": c, "C2": c}',
			'',
			'',
			'def sallen_key_highpass_figures(p, rs):',
			'    """f0 and Q of a Sallen-Key high-pass (the follower\'s gain is 1; the source ahead of C1 is',
			'    in the check, 6)."""',
			'    w0 = 1 / math.sqrt(p["Rtop"] * p["Rbottom"] * p["C1"] * p["C2"])',
			'    q = w0 * p["C1"] * p["C2"] * p["Rbottom"] / (p["C1"] + p["C2"])',
			'    return {"f0": w0 / (2 * math.pi), "q": q}'
		].join('\n')
};

const RESPONSES = {
	sallen_key_lowpass: [
		'def sallen_key_lowpass_h(p, s, rs):',
		'    """Sallen-Key low-pass: H = Y1 Y2 / (Y1 Y2 + Y4 (Y1 + Y2 + Y3)), with Y1 = 1 / (rs + R1)',
		'    from the input to the node X, Y2 = 1 / R2 from X to the + input, Y3 = s Ctop from X back',
		'    to the output and Y4 = s Cbottom from the + input to ground; the output follows the',
		'    + input."""',
		'    y1, y2, y3, y4 = 1 / (rs + p["R1"]), 1 / p["R2"], s * p["Ctop"], s * p["Cbottom"]',
		'    return y1 * y2 / (y1 * y2 + y4 * (y1 + y2 + y3))'
	].join('\n'),
	sallen_key_highpass: [
		'def sallen_key_highpass_h(p, s, rs):',
		'    """Sallen-Key high-pass: H = Y1 Y2 / (Y1 Y2 + Y4 (Y1 + Y2 + Y3)), with',
		'    Y1 = 1 / (rs + 1 / (s C1)) from the input to the node X, Y2 = s C2 from X to the + input,',
		'    Y3 = 1 / Rtop from X back to the output and Y4 = 1 / Rbottom from the + input to ground;',
		'    the output follows the + input."""',
		'    y1 = 1 / (rs + 1 / (s * p["C1"]))',
		'    y2, y3, y4 = s * p["C2"], 1 / p["Rtop"], 1 / p["Rbottom"]',
		'    return y1 * y2 / (y1 * y2 + y4 * (y1 + y2 + y3))'
	].join('\n')
};

/** The admittance each circuit's input takes from an ideal source, for a node two branches share. */
const ADMITTANCES = {
	sallen_key_lowpass: [
		'def sallen_key_lowpass_y(p, s):',
		'    """The admittance of the input of a Sallen-Key low-pass, the current into R1 per volt:',
		'    Y1 Y4 (Y2 + Y3) / (Y1 Y2 + Y4 (Y1 + Y2 + Y3)), the Y as in its H."""',
		'    y1, y2, y3, y4 = 1 / p["R1"], 1 / p["R2"], s * p["Ctop"], s * p["Cbottom"]',
		'    return y1 * y4 * (y2 + y3) / (y1 * y2 + y4 * (y1 + y2 + y3))'
	].join('\n'),
	sallen_key_highpass: [
		'def sallen_key_highpass_y(p, s):',
		'    """The admittance of the input of a Sallen-Key high-pass, the current into C1 per volt:',
		'    Y1 Y4 (Y2 + Y3) / (Y1 Y2 + Y4 (Y1 + Y2 + Y3)), the Y as in its H."""',
		'    y1, y2, y3, y4 = s * p["C1"], s * p["C2"], 1 / p["Rtop"], 1 / p["Rbottom"]',
		'    return y1 * y4 * (y2 + y3) / (y1 * y2 + y4 * (y1 + y2 + y3))'
	].join('\n')
};

export default {
	family: 'Sallen-Key',
	circuits: { sallenKey: 'sallen_key_lowpass', sallenKeyHp: 'sallen_key_highpass' },
	label: { sallen_key_lowpass: 'Sallen-Key low-pass', sallen_key_highpass: 'Sallen-Key high-pass' },
	figures: { sallen_key_lowpass: ['f0', 'q'], sallen_key_highpass: ['f0', 'q'] },
	rule: (circuit, ctx) => RULES[circuit](ctx),
	response: (circuit) => RESPONSES[circuit],
	admittance: (circuit) => ADMITTANCES[circuit]
};
