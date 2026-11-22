import { comment, pyRaise, pyStr, section } from '../../filter/python/emit';
import { CONTROL_WORDS, TOPOLOGY_WORDS } from './settings';
import { bodyRaise, pyDef } from './write';

/**
 * Sections 1 and 2 of the oscillator's file: the loop by Barkhausen's
 * condition (w0 R C and the gain the network asks, `k` and
 * `gain_textbook`), and the op-amp in the loop (loop_gain, zero_phase,
 * balance and retuned; the quadrature loop's det_m, pole and retuned), with
 * the textbook R C's frequency on this op-amp (`f_textbook`), the page's
 * test on it (`textbook_ok`: no more than 20 % low) and the R C that lands
 * on target (`rc_target`).
 *
 * The loop with the op-amp is the page's (loop.js): the op-amp a single
 * pole, the loop opened where the amplifier's output feeds the network.
 * The Wien bridge's L(s) is the network's beta times the stage's gain; a
 * ladder's is found by walking its node equations back from the output
 * (walk_back: the same equations the page solves by elimination); the
 * quadrature loop's pole is where the determinant of its three node
 * equations, written out, is zero. The searches are the page's: Newton's
 * method with its steps, limits and tolerances, the balance gain and the
 * retune by fixed points, three rounds of the retune at the start gain.
 */

/** The sentence every file's loop opens with. */
const BARKHAUSEN = "An amplifier fed back to its input through a network oscillates where the signal comes back in step and exactly as large: A beta = 1, Barkhausen's condition.";

/** The guards on the settings the file's code is written for: the topology and control, and the page's inputs above 0. */
function guard(ctx) {
	const words = `${TOPOLOGY_WORDS[ctx.topology].name} with ${CONTROL_WORDS[ctx.control].title}`;
	const start = ctx.control === 'clamp' ? 'growth' : 'excess';
	return [
		`if topology != ${pyStr(ctx.topology)} or stabilizer != ${pyStr(ctx.design.stabilizer)}:`,
		pyRaise(`This file holds the ${words} only.`, '    '),
		`if not min(frequency, amplitude, ${start}, gbw, slew_rate, swing) > 0:  # (the page's guard)`,
		pyRaise(`The frequency, amplitude, ${start} and op-amp figures must all be above 0.`, '    ')
	].join('\n');
}

/** walk_back(), the ladder's node equations solved from its last node back to its input. */
function walkBack(ctx) {
	if (!ctx.ladder.buffered) {
		return pyDef(
			'walk_back(p, v_last, vm)',
			"The input v_0 the ladder needs for v_last on its last node and vm past its last R: each node's equation solved for the node before it, from the last node back (p = s R C).",
			[
				'v = [v_last, ((1 + p) * v_last - vm) / p]  # v_n, then v_(n-1) from the last node',
				'for _ in range(SECTIONS - 1):  # each node before: p v_(k-1) = (1 + 2 p) v_k - p v_(k+1)',
				'    v.append(((1 + 2 * p) * v[-1] - p * v[-2]) / p)',
				'return v[-1]'
			]
		);
	}
	return pyDef(
		'walk_back(p, v_last, vm, follower)',
		"The input v_0 the ladder needs for v_last on its last node and vm past its last R: each node's equation solved for the node before it, from the last node back (p = s R C; follower, the buffers' gain).",
		[
			'v = ((1 + p) * v_last - vm) / (p * follower)  # v_(n-1), from the last node',
			'for _ in range(SECTIONS - 2):  # nodes n-1 to 2, each driven through a buffer',
			'    v = (1 + p) * v / (p * follower)',
			'return (1 + p) * v / p  # v_0, from node 1, driven by the input itself'
		]
	);
}

/** Section 1, the loop. */
export function loopSection(file, ctx) {
	const title = section(`${ctx.numbers.loop} The loop`);
	if (ctx.kind === 'wien') {
		file.add(
			[
				title,
				comment(
					[
						`${BARKHAUSEN} The Wien network, R and C in series from the output into R and C in parallel to ground, passes`,
						'    beta(j w) = 1 / (3 + j (w R C - 1 / (w R C)))',
						'real at w R C = 1, where a third comes back: f0 = 1 / (2 pi R C), and the non-inverting amplifier must make up A = 1 + Rf / Rg = 3.'
					].join('\n')
				),
				guard(ctx),
				'k = 1.0  # w0 R C, where the network comes back in phase',
				'gain_textbook = 3.0  # 1 / beta there, the gain the amplifier must supply',
				'print(f"  w0 R C = {k:g}, beta = 1/{gain_textbook:g} there: the amplifier needs a gain of 3")'
			].join('\n')
		);
		return;
	}
	if (ctx.kind === 'quadrature') {
		file.add(
			[
				title,
				comment(
					[
						`${BARKHAUSEN} Here two integrators each turn a sine by a quarter cycle at every frequency and the inverter turns it by half a cycle, so the loop is in phase everywhere, and it runs where the two integrators pass exactly 1: 1 / (w R C)^2 = 1, w0 R C = 1 and A = 1. Its poles sit on the j w axis whatever the inverter's gain g, (s R C)^2 + g = 0, so gain neither starts nor stops it: damping does. A resistor Rn from the inverter's output into integrator 2 is a negative damping that starts it,`,
						'    (s R C)^2 - (R / Rn) (s R C) + 1 = 0,   growth per cycle about exp(pi R / Rn) - 1',
						'(for R / Rn small), and the clamp of section 4 is a damping that grows with the amplitude and stops it.'
					].join('\n')
				),
				guard(ctx),
				'k = 1.0  # w0 R C, where the two integrators pass exactly 1',
				'gain_textbook = 1.0  # the inverter\'s gain',
				'rho_start = math.log(1 + growth) / math.pi  # R / Rn for the growth asked',
				'print(f"  w0 R C = 1, A = 1; {100 * growth:g} % a cycle takes R / Rn = {rho_start:.4f}")'
			].join('\n')
		);
		return;
	}
	const { sections, buffered } = ctx.ladder;
	const inverts = `Here the amplifier inverts, half a cycle, and a ladder of ${sections} high-pass sections, C in series and R to ground, turns the other half.`;
	if (buffered) {
		file.add(
			[
				title,
				comment(
					[
						`${BARKHAUSEN} ${inverts} A buffer after each section but the last stops it loading the one before, so each just passes p / (1 + p), p = j w R C: it turns 90 - atan(w R C) degrees and passes the cosine of that. ${sections} sections turn ${180 / sections} degrees each at`,
						`    w0 R C = tan(90 - 180 / ${sections}),   |beta| = cos(180 / ${sections})^${sections}`,
						"and the amplifier must make up A = Rf / R = 1 / |beta| (the last R is the amplifier's input resistor, its far end the virtual ground)."
					].join('\n')
				),
				guard(ctx),
				`SECTIONS = ${sections}  # RC sections, a buffer after each but the last`,
				'k = math.tan(math.radians(90 - 180 / SECTIONS))  # w0 R C',
				'gain_textbook = 1 / math.cos(math.radians(180 / SECTIONS)) ** SECTIONS  # 1 / |beta|',
				'print(f"  w0 R C = {k:.6f}, |beta| = 1/{gain_textbook:.4g}: the amplifier needs a gain of "',
				'      f"{gain_textbook:.4g}")'
			].join('\n')
		);
		return;
	}
	file.add(
		[
			title,
			comment(
				[
					`${BARKHAUSEN} ${inverts} The sections load each other, so the ladder is solved as one network: with p = j w R C and v_k its node voltages from the input v_0,`,
					'    p v_(k-1) - (1 + 2 p) v_k + p v_(k+1) = 0',
					'    p v_(n-1) - (1 + p) v_n = 0   at the last node',
					"(the last R is the amplifier's input resistor, its far end the virtual ground). It comes back in phase where beta = v_n / v_0 is real: with v_n = 1 and an ideal virtual ground, where the v_0 walk_back() finds is real, by bisection on its imaginary part; the amplifier must make up A = Rf / R = 1 / |beta| = |v_0| there."
				].join('\n')
			),
			guard(ctx),
			`SECTIONS = ${sections}  # RC sections, no buffers`
		].join('\n')
	);
	file.add(walkBack(ctx));
	file.add(
		[
			'lo, hi = 1e-3, 100.0  # w R C (Im v_0 changes sign once between them)',
			'for _ in range(200):',
			'    mid = math.sqrt(lo * hi)',
			'    if walk_back(1j * lo, 1.0, 0.0).imag * walk_back(1j * mid, 1.0, 0.0).imag <= 0:',
			'        hi = mid',
			'    else:',
			'        lo = mid',
			'k = math.sqrt(lo * hi)  # w0 R C',
			'gain_textbook = abs(walk_back(1j * k, 1.0, 0.0))  # 1 / |beta| there',
			'print(f"  solved: w0 R C = {k:.6f} = 1 / sqrt({1 / k ** 2:.4g}), beta = -1/{gain_textbook:.4g}: "',
			'      f"the amplifier needs a gain of {gain_textbook:.4g}")'
		].join('\n')
	);
}

/**
 * The diodes' capacitance as a parameter of the loop's functions (diode
 * limiters only): `diode_cap`, the reference resistor, Rf2's share of the
 * string and the capacitance across it, or None while the parts are not
 * known. In a signature, its first parameter's and a later one's; in a call.
 */
const capOf = (ctx) => (ctx.control === 'diodes' ? { first: 'diode_cap=None', sig: ', diode_cap=None', call: ', diode_cap' } : { first: '', sig: '', call: '' });

/**
 * The lines of loop_gain() that set y, the feedback string's admittance in
 * units of the reference resistor (Rg, or a ladder's R): Zf = (gain - 1) Rg
 * or gain R, and with the diodes' capacitance across their Rf2 part.
 */
function stringLines(ctx) {
	if (ctx.kind === 'wien' && ctx.control !== 'diodes') return ['y = 1 / (gain - 1)  # Rg / Zf, the feedback string Zf = (gain - 1) Rg'];
	const wien = ctx.kind === 'wien';
	const ref = wien ? 'Rg' : 'R';
	return [
		wien ? 'y = 1 / (gain - 1)  # Rg / Zf, the feedback string Zf = (gain - 1) Rg' : 'y = 1 / gain  # R / Zf, the feedback string Zf = gain R',
		`if diode_cap:  # (${ref}, Rf2 / (Rf1 + Rf2), the diodes' capacitance): across Rf2`,
		'    r_ref, share, cd = diode_cap',
		wien ? '    rf = (gain - 1) * r_ref' : '    rf = gain * r_ref',
		'    rf2 = share * rf',
		'    y = r_ref / ((1 - share) * rf + rf2 / (1 + s * rf2 * cd))'
	];
}

/** loop_gain(), L(s) of the loop opened at the network's input. */
function loopGainFn(ctx) {
	const cap = capOf(ctx);
	if (ctx.kind === 'wien') {
		return pyDef(`loop_gain(s, rc, gain${cap.sig})`, "L(s): the Wien network's beta, times the stage's vout / v+ with the op-amp's pole in it.", ['p = s * rc', ...stringLines(ctx), 'return 1 / (3 + p + 1 / p) / (s / wt + y / (1 + y))']);
	}
	const follower = ctx.ladder.buffered ? ', 1 / (1 + s / wt)' : '';
	return pyDef(
		`loop_gain(s, rc, gain${cap.sig})`,
		`L(s): vout = 1, the - input at vm = -(s / wt) vout, the last node from the - input's equation, and the ladder walked back to the input it needs${ctx.ladder.buffered ? ' (each buffer a follower of gain 1 / (1 + s / wt))' : ''}.`,
		[...stringLines(ctx), 'vm = -s / wt', `return 1 / walk_back(s * rc, (1 + y) * vm - y, vm${follower})`]
	);
}

/** zero_phase(), balance() and retuned() of a Wien bridge or a ladder. */
function searchFns(ctx) {
	const cap = capOf(ctx);
	return [
		pyDef(
			`zero_phase(rc, gain, w${cap.sig})`,
			'Where the loop comes back in phase, from w (rad/s): Newton\'s method on Im L(j w), a numerical slope, steps of at most w / 4, to 1e-10 of w. Returns w and L(j w), or None.',
			[
				'for _ in range(80):',
				`    f = loop_gain(1j * w, rc, gain${cap.call}).imag`,
				'    dw = w * 1e-6',
				`    slope = (loop_gain(1j * (w + dw), rc, gain${cap.call}).imag - f) / dw`,
				'    if slope == 0 or not math.isfinite(slope):',
				'        return None',
				'    step = max(-0.25 * w, min(0.25 * w, -f / slope))',
				'    w += step',
				'    if w <= 0:',
				'        return None',
				'    if abs(step) < 1e-10 * w:',
				`        back = loop_gain(1j * w, rc, gain${cap.call})`,
				'        return (w, back) if back.real > 0 else None',
				'return None'
			]
		),
		pyDef(
			`balance(rc${cap.sig})`,
			'The gain at which the loop comes back exactly as large: the gain over |L| where it is in phase, again and again until it moves less than 1e-9. None where it does not settle.',
			[
				'g, w = gain_textbook, 2 * math.pi * frequency',
				'for _ in range(40):',
				`    found = zero_phase(rc, g, w${cap.call})`,
				'    if found is None:',
				'        return None',
				'    w, back = found',
				'    g_next = g / abs(back)',
				'    if abs(g_next / g - 1) < 1e-9:',
				'        return g_next',
				'    g = g_next',
				'return None'
			]
		),
		pyDef(
			`retuned(${cap.first})`,
			'R C on target at the start gain: R C times w / w_target to within 1e-8, then the start gain found again at the new balance; three rounds, as on the page.',
			[
				'w_target = 2 * math.pi * frequency',
				'start = gain_textbook * (1 + excess)',
				'for _ in range(3):',
				'    rc = k / w_target',
				'    for _ in range(16):',
				`        found = zero_phase(rc, start, k / rc${cap.call})`,
				'        if found is None:',
				'            break',
				'        ratio = found[0] / w_target',
				'        rc *= ratio',
				'        if abs(ratio - 1) < 1e-8:',
				'            break',
				`    g = balance(rc${cap.call}) if found else None`,
				'    if g is None:',
				bodyRaise('No balance on this op-amp: a faster one or a lower frequency.', '        '),
				'    start = g * (1 + excess)',
				'return rc'
			]
		)
	];
}

/** The quadrature loop's det_m(), pole() and retuned(). */
function quadratureFns() {
	return [
		pyDef('det_m(s, rc, rho)', "det M(s) of the loop's three node equations, 0 at its poles.", ['p, e = s * rc, s / wt', 'return ((1 + p) * e + p) * (((1 + rho + p) * e + p) * (1 + 2 * e) - rho) + 1']),
		pyDef(
			'pole(rc, rho)',
			'The pole near j / (R C), s = sigma + j w: Newton\'s method on det M, a numerical slope along j, each step at most a quarter of 1 / (R C), until it moves less than 1e-9 of it. Returns s and whether it settled.',
			[
				'w0 = 1 / rc',
				's = 1j * w0',
				'for _ in range(80):',
				'    f = det_m(s, rc, rho)',
				'    ds = 1j * w0 * 1e-6',
				'    slope = (det_m(s + ds, rc, rho) - f) / ds',
				'    if slope == 0:',
				'        break',
				'    step = f / slope',
				'    if abs(step) > 0.25 * w0:',
				'        step *= 0.25 * w0 / abs(step)',
				'    if not (math.isfinite((s - step).real) and math.isfinite((s - step).imag)):',
				'        break',
				'    s -= step',
				'    if abs(step) < 1e-9 * w0:',
				'        return s, s.imag != 0',
				'return s, False'
			]
		),
		pyDef(
			'retuned()',
			"The R C whose pole runs at the frequency asked, Rn's growth in the loop: R C times w / w_target from 1 / w_target, until the ratio is within 1e-8 of 1.",
			[
				'w_target = 2 * math.pi * frequency',
				'rc = 1 / w_target',
				'for _ in range(16):',
				'    s, settled = pole(rc, rho_start)',
				'    if not settled:',
				bodyRaise('No pole on this op-amp: a faster one or a lower frequency.', '        '),
				'    ratio = abs(s.imag) / w_target',
				'    rc *= ratio',
				'    if abs(ratio - 1) < 1e-8:',
				'        break',
				'return rc'
			]
		)
	];
}

/** Section 2, the op-amp in the loop. */
export function opampSection(file, ctx) {
	const lead = 'A real op-amp is a single pole, A(s) = wt / s with wt = 2 pi gbw, so';
	const tail = 'It runs where L(j w) is real and positive (zero_phase) and holds where L = 1 (balance); R C is retuned until it runs at the frequency asked (retuned).';
	const later = {
		diodes: " The diodes' capacitance joins Zf in section 5.",
		lamp: ' R C is retuned at the balance gain times 1 + excess, as the page does, but the lamp holds the loop at balance itself, a little off that frequency.',
		jfet: ' R C is retuned at the balance gain times 1 + excess, as the page does, but the AGC holds the loop at balance itself, a little off that frequency.'
	}[ctx.control];
	const trust = 'The page trusts this model while the textbook R C lands within 20 % (textbook_ok).';
	let intro;
	if (ctx.kind === 'wien') {
		intro = [
			`${lead} the amplifier answers late: the loop comes back in phase a little off 1 / (2 pi R C) and needs another gain. Opened where the output feeds the series arm, with p = s R C and Zf the feedback string,`,
			'    L(s) = beta(s) / (s / wt + Rg / (Rg + Zf)),   beta(s) = 1 / (3 + p + 1 / p)',
			`${tail}${later} ${trust}`
		].join('\n');
	} else if (ctx.kind === 'ladder') {
		intro = `${lead} the amplifier answers late, and its - input is no perfect virtual ground: vm = -(s / wt) vout. The loop is opened where the output feeds the first capacitor. With vout = 1, the - input's node gives the last node v_n = (1 + y) vm - y, y = R / Zf (Zf the feedback string), and walk_back() the input v_0 the ladder needs: L(s) = 1 / v_0.${ctx.ladder.buffered ? ' Each buffer is an op-amp too, a follower of gain 1 / (1 + s / wt).' : ''} ${tail}${later} ${trust}`;
	} else {
		intro = [
			`${lead} each one answers late: its - input sits at -(s / wt) times its output. With p = s R C and e = s / wt, integrator 1, integrator 2 with Rn into it as well (rho = R / Rn) and the inverter give three node equations in the sine, the cosine and the inverter's output:`,
			'    ((1 + p) e + p) v_sin + v_inv = 0',
			'    v_sin + ((1 + rho + p) e + p) v_cos + rho v_inv = 0',
			'    v_cos + (1 + 2 e) v_inv = 0',
			'and the loop runs at its pole, where their determinant is zero:',
			'    det M = ((1 + p) e + p) (((1 + rho + p) e + p) (1 + 2 e) - rho) + 1 = 0',
			`The lag is a little negative damping of its own. R C is retuned until the pole runs at the frequency asked. ${trust}`
		].join('\n');
	}
	file.add([section(`${ctx.numbers.opamp} The op-amp in the loop`), comment(intro), 'wt = 2 * math.pi * gbw  # rad/s'].join('\n'));
	const textbook = 'textbook_ok = f_textbook is not None and f_textbook / frequency - 1 > -0.2  # the page\'s test';
	if (ctx.kind === 'quadrature') {
		for (const fn of quadratureFns()) file.add(fn);
		file.add(
			[
				'rc_textbook = k / (2 * math.pi * frequency)  # s',
				's, settled = pole(rc_textbook, rho_start)',
				'f_textbook = abs(s.imag) / (2 * math.pi) if settled else None  # Hz, the textbook R C here',
				textbook,
				'rc_target = retuned()  # s'
			].join('\n')
		);
	} else {
		if (ctx.kind === 'ladder' && ctx.ladder.buffered) file.add(walkBack(ctx));
		file.add(loopGainFn(ctx));
		for (const fn of searchFns(ctx)) file.add(fn);
		file.add(
			[
				'rc_textbook = k / (2 * math.pi * frequency)  # s',
				'found = zero_phase(rc_textbook, gain_textbook * (1 + excess), k / rc_textbook)',
				'f_textbook = found[0] / (2 * math.pi) if found else None  # Hz, the textbook R C here',
				textbook,
				'rc_target = retuned()  # s'
			].join('\n')
		);
	}
	const none = ctx.kind === 'quadrature' ? 'finds no pole' : 'finds no balance';
	const prints = [
		`runs = (f"runs at {eng(f_textbook, 'Hz')} ({100 * (f_textbook / frequency - 1):+.2f} %)"`,
		`        if f_textbook else "${none}")`,
		`print(f"  the textbook R C, {eng(rc_textbook, 's')}, {runs} with this op-amp")`,
		'if not textbook_ok:',
		'    print("  more than 20 % low: the page does not trust its single-pole model this far")'
	];
	if (ctx.control === 'lamp' || ctx.control === 'jfet') {
		const who = ctx.control === 'lamp' ? 'the lamp' : 'the AGC';
		prints.push(
			'print(f"  retuned by {100 * (rc_target / rc_textbook - 1):+.3f} % to {eng(rc_target, \'s\')}, it "',
			'      f"runs at {eng(frequency, \'Hz\')} at {1 + excess:g} times the balance gain")',
			'g_balance = balance(rc_target)',
			'held_at = zero_phase(rc_target, g_balance, 2 * math.pi * frequency) if g_balance else None',
			'if held_at:',
			`    print(f"  held at balance, as ${who} holds it, at {eng(held_at[0] / (2 * math.pi), 'Hz')}")`
		);
	} else {
		prints.push('print(f"  retuned by {100 * (rc_target / rc_textbook - 1):+.3f} % to {eng(rc_target, \'s\')}")');
	}
	file.follow(prints.join('\n'));
}
