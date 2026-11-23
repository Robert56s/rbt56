import { comment, pyEng, pyNum, pyRaise, section } from '../../filter/python/emit';
import { DIODES, JFETS } from '../limiter';
import { needsE96 } from './settings';
import { pyDef } from './write';

/**
 * Section 4 of the oscillator's file, the amplitude control, sized and its
 * amplitude found the way limiter.js does it, in plain steps: the diode's
 * describing function by Simpson's rule over a cycle (256 steps), the
 * bisections of the page with their brackets and stops. One of:
 *   diodes   two diodes across Rf2 of the feedback string (a Wien bridge's
 *            or a ladder's): the exact Rf1, Rf2 from a bisection on x, as
 *            the page finds them, then the stocked pair by the file's own
 *            rule (d and e: each part's two stocked neighbours, the pair
 *            whose amplitude lands closest; Rf1 from E96 on an E24 stock,
 *            as on the page)
 *   lamp     a lamp as the lower leg: Rf, the lamp hot and cold
 *   jfet     a JFET AGC: Rf, Rser, the divider Ra Rb (bisection), Rx, Cdet,
 *            sized as the page sizes them
 *   clamp    the quadrature loop's Rn and its divider clamp Rd1 Rd2
 * The file's own parts keep to single values (the page's two-in-series
 * option is the page's). Section 5, for diode limiters only: the design
 * made again with the diodes' capacitance in the loop, as the page does
 * (topologies.js designWith, its second pass), its R C and limiter lines
 * printed again for the parts it makes.
 *
 * The models written in are limiter.js's: DIODES and JFETS (their .model
 * lines in the LTspice files), VT, the detector's pulse (30 times the
 * average current), the AGC's 1 Mohm Rb and Rx, the lamp cold at a third of
 * hot, Rd2 at 1 kohm.
 */

/** limiter.js's VT: kT / q at 300 K (its comment says 27 C, 300.15 K, where it is 0.025865 V). */
const VT = 0.025852;

/** The diode table of the file: Is, n (and Cjo where the loop carries the diodes' capacitance). */
function diodeTable(withCjo) {
	const items = Object.values(DIODES).map((d) => `"${d.id}": (${pyEng(d.Is)}, ${pyNum(d.N)}${withCjo ? `, ${pyEng(d.cjo)}` : ''})`);
	return [
		`# Is (A), n${withCjo ? ' and Cjo (F)' : ''} of the .model lines the page's LTspice files carry:`,
		`DIODES = {${items.join(', ')}}`,
		`VT = ${pyNum(VT)}  # V, kT / q at 300 K, the page's value (at SPICE's 27 C it is 0.025865 V)`
	].join('\n');
}

/** The guard on a diode the table does not hold. */
const diodeGuard = () => ['if diode not in DIODES:', pyRaise("No model for this diode: DIODES above has the page's two.", '    ')].join('\n');

/** pair_current(), the anti-parallel pair's current. */
const pairCurrent = () =>
	pyDef('pair_current(v)', 'The current of the two diodes back to back at v (the exponent held short of overflow).', [
		'a = min(abs(v) / (N * VT), 700.0)',
		'return math.copysign(IS * (math.exp(a) - math.exp(-a)), v)'
	]);

/** A conductance by Simpson's rule: `current` the Python of the current at v. */
function simpson(signature, doc, current, over) {
	return pyDef(signature, doc, [
		'dt = 2 * math.pi / 256',
		'total = 0.0',
		'for i in range(257):',
		'    t = i * dt',
		'    weight = 1 if i in (0, 256) else 4 if i % 2 else 2',
		`    total += weight * ${current} * math.sin(t)`,
		`return dt / 3 * total / (math.pi * ${over})`
	]);
}

/* ------------------------------------------------------------ diodes */

/** The words of a diode limiter by loop: the start gain, Rt, the fraction across the string. */
function limiterWords(ctx) {
	if (ctx.kind === 'wien') return { start: '1 + (Rf1 + Rf2) / Rg', rt: 'Rt = (g - 1) Rg', fraction: 'fraction = (g - 1) / g of the output' };
	return { start: '(Rf1 + Rf2) / R', rt: 'Rt = g R', fraction: 'fraction = 1 (the inverting input is a virtual ground: the whole output sits across the string)' };
}

function diodesSection(file, ctx) {
	const wien = ctx.kind === 'wien';
	const w = limiterWords(ctx);
	const rf1Stock = needsE96(ctx) ? 'resistors_e96' : 'resistors';
	file.add(
		[
			section(`${ctx.numbers.control} The amplitude control: diodes across Rf2`),
			comment(
				[
					`The feedback string is Rf1 + Rf2, two diodes back to back across Rf2. Off, they leave the start gain ${w.start}; as the output grows they conduct and shunt Rf2, and the amplitude parks where the string presents ${w.rt}, g the gain needed. A sine of amplitude V across the pair sees G(V), the fundamental of its current over V:`,
					'    i(v) = Is (exp(v / (n Vt)) - exp(-v / (n Vt)))',
					'    G(V) = (1 / (pi V)) * integral over a cycle of i(V sin t) sin t dt',
					`so Rf2 comes down to x = Rt - Rf1 where 1 / Rf2 + G(V2) = 1 / x, V2 = fraction * Vout * x / Rt, ${w.fraction}. The amplitude hangs on Rt - Rf1, a small difference, so the file's own rule picks the stocked pair by the amplitude it holds:`,
					`  d. ${needsE96(ctx) ? 'Rf1 (from E96, as on the page)' : 'Rf1'} and Rf2 are each tried at their stocked neighbours, below and above;`,
					'  e. of the four pairs that start and hold an amplitude (Rf1 + Rf2 above Rt, Rf1 below it), the one landing closest to the amplitude asked is kept, the first of a tie, else the nearest of each. (The page tries more values and weighs the start gain too.)'
				].join('\n')
			),
			diodeTable(true),
			diodeGuard(),
			'IS, N, CJO = DIODES[diode]'
		].join('\n')
	);
	file.add(pairCurrent());
	file.add(simpson('conductance(v)', "G(V), by Simpson's rule over one cycle in 256 steps of dt.", 'pair_current(v * math.sin(t))', 'v'));
	const rt = wien ? 'rt = (g - 1) * rg' : 'rt = g * rg';
	file.add(
		pyDef(
			'amplitude_held(rf1, rf2, g, rg)',
			'The amplitude Rf1 and Rf2 settle at for a gain g, from V2 where G(V2) = 1 / x - 1 / Rf2 (bisection); None where Rf1 + Rf2 <= Rt (no start) or Rf1 >= Rt (it clips).',
			[
				rt,
				'x = rt - rf1  # Rf2 as the diodes must bring it down',
				'if not 0 < x < rf2:',
				'    return None',
				"want = 1 / x - 1 / rf2  # S, the diodes' conductance",
				"lo, hi = 1e-4, 1.0  # V across the diodes (the page's bracket, doubled up to 1 kV)",
				'while conductance(hi) < want and hi < 1e3:',
				'    hi *= 2',
				'for _ in range(80):',
				'    mid = 0.5 * (lo + hi)',
				'    if mid in (lo, hi):  # (down to the last bit)',
				'        break',
				'    if conductance(mid) < want:',
				'        lo = mid',
				'    else:',
				'        hi = mid',
				wien ? 'return 0.5 * (lo + hi) * rt / x / ((g - 1) / g)' : 'return 0.5 * (lo + hi) * rt / x'
			]
		)
	);
	const start = wien ? '1 + (rf1 + rf2) / rg' : '(rf1 + rf2) / rg';
	const limited = wien ? '1 + rf1 / rg' : 'rf1 / rg';
	file.add(
		pyDef(
			'size_limiter(g, rg)',
			'Rf1 and Rf2 for the amplitude asked at a gain g, printed with what they hold: Rs = Rf1 + Rf2 with the diodes off, Rf2 down to x = Rt - Rf1 with them on (x by bisection, as on the page), so Rf2 = x + (Rs - Rt). Where no x does it, the page splits Rs 1 to 9, and so does the file.',
			[
				rt,
				wien ? 'rs = (g * (1 + excess) - 1) * rg  # the string at the start gain' : 'rs = g * (1 + excess) * rg  # the string at the start gain',
				wien ? 'fraction = (g - 1) / g' : null,
				'delta = rs - rt  # Rf2 - x, whatever x',
				'',
				'def shortfall(x):  # (rises with x through V2, falls through 1 / x - 1 / Rf2)',
				wien ? '    return conductance(amplitude * fraction * x / rt) - (1 / x - 1 / (x + delta))' : '    return conductance(amplitude * x / rt) - (1 / x - 1 / (x + delta))',
				'',
				'def neighbours(value, stock):  # (the stocked values next to it, below and above)',
				'    below = max((v for v in stock if v <= value), default=None)',
				'    above = min((v for v in stock if v >= value), default=None)',
				'    return [v for v in dict.fromkeys((below, above)) if v is not None]',
				'',
				"lo, hi = 1e-3 * rt, 0.999 * rt  # (the page's bracket)",
				'if shortfall(hi) < 0:',
				'    print("  the diodes barely conduct at the amplitude asked: the string split 1 to 9")',
				'    rf1, rf2 = nearest(0.1 * rs, resistors), nearest(0.9 * rs, resistors)',
				'else:',
				'    for _ in range(100):',
				'        mid = 0.5 * (lo + hi)',
				'        if shortfall(mid) < 0:',
				'            lo = mid',
				'        else:',
				'            hi = mid',
				'    x = 0.5 * (lo + hi)',
				'    print(f"  exact: Rf1 = {eng(rt - x, \'ohm\')}, Rf2 = {eng(x + delta, \'ohm\')}")',
				`    rf1, rf2 = nearest(rt - x, ${rf1Stock}), nearest(x + delta, resistors)`,
				'    closest = math.inf  # (rules d and e; the nearest of each above where none holds)',
				`    for rf1_try in neighbours(rt - x, ${rf1Stock}):`,
				'        for rf2_try in neighbours(x + delta, resistors):',
				'            held = amplitude_held(rf1_try, rf2_try, g, rg)  # (None: no start, or clipping)',
				'            if held is not None and abs(math.log(held / amplitude)) < closest:',
				'                closest = abs(math.log(held / amplitude))',
				'                rf1, rf2 = rf1_try, rf2_try',
				'held = amplitude_held(rf1, rf2, g, rg)',
				'print(f"  Rf1 = {eng(rf1, \'ohm\')}, Rf2 = {eng(rf2, \'ohm\')}: "',
				'      + (f"they hold {eng(held, \'V\')} peak" if held else "no amplitude held"))',
				`print(f"  gain {${start}:.3f} diodes off, {${limited}:.3f} on, {g:.4f} needed")`,
				'return rf1, rf2'
			]
		)
	);
	file.add('rf1, rf2 = size_limiter(required_gain, rg)');
}

/** The parts of a diode-limited design as a dict, the page's names. */
const diodeParts = (ctx) => (ctx.kind === 'wien' ? '{"R": r, "C": c, "Rg": rg, "Rf1": rf1, "Rf2": rf2}' : '{"R": r, "C": c, "Rf1": rf1, "Rf2": rf2}');

/** Section 5: the diodes' capacitance in the loop, the design made again (pick_rc and size_limiter print its parts). */
export function capacitanceSection(file, ctx) {
	const ladder = ctx.kind === 'ladder';
	file.add(
		[
			section(`${ctx.numbers.capacitance} The diodes' capacitance in the loop`),
			comment(
				"Their junction capacitance, 2 Cjo across Rf2, lags the loop a little more even while the diodes are off, so the design is made again with it in the loop, as on the page, the string split as the first pair has it; the check (section 6) works each set out with its own split."
			),
			`first_parts = ${diodeParts(ctx)}`,
			'diode_cap = (rg, rf2 / (rf1 + rf2), 2 * CJO)',
			'rc_target = retuned(diode_cap)',
			'print(f"  with 2 x {eng(CJO, \'F\')} across Rf2, R C is retuned to {eng(rc_target, \'s\')}")',
			'r, c = pick_rc(rc_target)',
			ladder ? 'rg = r' : null,
			'required_gain = balance(r * c, diode_cap)',
			'if required_gain is None:',
			pyRaise("The loop finds no balance with the diodes' capacitance in it.", '    '),
			'rf1, rf2 = size_limiter(required_gain, rg)',
			`own_parts = ${diodeParts(ctx)}`,
			'print("  the parts stay as they were" if own_parts == first_parts else "  the parts change")'
		]
			.filter((l) => l !== null)
			.join('\n')
	);
}

/* -------------------------------------------------------------- lamp */

function lampSection(file, ctx) {
	file.add(
		[
			section(`${ctx.numbers.control} The amplitude control: a lamp in the lower leg`),
			comment(
				"A small filament lamp is the lower leg of the feedback. Its resistance rises as it heats, so more output means a larger leg and a smaller gain, A = 1 + Rf / R_lamp, with no kink in the wave. Rf is the stocked resistor nearest (g - 1) Rg, so the lamp must be R_hot = Rf / (g - 1) once hot, with Vout / g across it: the amplitude is whatever output heats it that far, which the design cannot set, only say what the lamp must do. The page's LTspice lamp starts cold at a third of hot, so the gain at switch-on is 1 + Rf / R_cold; hot, it takes (Vout / g)^2 / (2 R_hot)."
			)
		].join('\n')
	);
	file.add(pyDef('lamp(rf, g)', "The lamp a gain g needs with this Rf: hot, and cold at a third of hot (the page's model).", ['hot = rf / (g - 1)', 'return hot, hot / 3']));
	file.add(
		[
			'rf = nearest((required_gain - 1) * rg, resistors)',
			'hot, cold = lamp(rf, required_gain)',
			'v_lamp = amplitude / required_gain  # V peak across the lamp',
			'print(f"  Rf = {eng(rf, \'ohm\')}: to hold {eng(amplitude, \'V\')} peak the lamp must be "',
			'      f"{eng(hot, \'ohm\')} hot,")',
			'print(f"  with {v_lamp:.4g} V peak across it, taking {eng(v_lamp ** 2 / 2 / hot, \'W\')}")',
			'print(f"  cold, {eng(cold, \'ohm\')}: it starts the loop at a gain of {1 + rf / cold:.2f}")'
		].join('\n')
	);
}

/* -------------------------------------------------------------- JFET */

/** The JFET table of the file, from limiter.js's JFETS. */
function jfetTable() {
	const rows = Object.values(JFETS).map((j) => {
		if (j.id === 'J111') return `    "J111": (${pyNum(j.vto)}, 1 / (2 * 30 * 6.5)),  # (beta from its 30 ohm channel, 1 / (2 Ron |Vto|))`;
		return `    "${j.id}": (${pyNum(j.vto)}, ${pyEng(j.beta)}),`;
	});
	return ['JFETS = {  # Vto (V) and beta (A/V^2) of the .model lines the page\'s LTspice files carry', ...rows, '}'].join('\n');
}

function jfetSection(file, ctx) {
	const e96 = needsE96(ctx);
	file.add(
		[
			section(`${ctx.numbers.control} The amplitude control: a JFET in the lower leg`),
			comment(
				[
					'A JFET with a small drain-source voltage is a resistor its gate sets,',
					'    r = 1 / (2 beta (Vgs - Vto)),',
					"here in series with Rser as the lower leg of the feedback: A = 1 + Rf / (Rser + r). Two equal resistors Rx average the drain with the control voltage into the gate, which cancels the channel's square-law term, and a peak detector makes that voltage: D1 charges Cdet to the output's negative peak less its drop, and the divider Ra Rb scales it and bleeds Cdet over 50 cycles. Rf is the stocked resistor nearest (g - 1) Rg; at balance the leg is Rf / (g - 1), the channel kept near a tenth of it (at least its open value and 3 % of the leg, so the loop starts), and Ra is solved, by bisection, for the gate that channel needs. These parts are sized as the page sizes them."
				].join('\n')
			),
			jfetTable(),
			diodeTable(false),
			comment(
				"Over 50 cycles Cdet droops about 2 % between peaks, so the detector's diode conducts for only a fifteenth of each cycle and its current then is some 30 times the average: the page's figure, which LTspice bears out (0.48 V of drop at 3.26 V out)."
			),
			'PULSE = 30',
			'if jfet not in JFETS:',
			pyRaise("No model for this JFET: JFETS above has the page's two.", '    '),
			diodeGuard(),
			'VTO, BETA = JFETS[jfet]',
			'IS, N = DIODES[diode]'
		].join('\n')
	);
	file.add(pyDef('peak(a, load)', "The detector's voltage for an output of amplitude a: a less the diode's drop at PULSE times the average current, a / load.", ['return a - N * VT * math.log(1 + PULSE * a / load / IS)']));
	file.add(
		pyDef('gate(v_peak, ra, rb, rx)', "The gate's voltage: the divider's output, loaded by the two Rx (its Thevenin resistance against 2 Rx), averaged with the drain's mean, 0 V.", [
			'rth = ra * rb / (ra + rb)',
			'return -v_peak * (rb / (ra + rb)) / (1 + rth / (2 * rx)) / 2'
		])
	);
	const pick = (stock, lead = '') => [`${lead}near = dict.fromkeys(nearest(target * f, ${stock}) for f in steps)`, `${lead}usable = [v for v in near if r_min <= leg - v <= 0.95 * r_max]`];
	file.add(
		pyDef(
			'size_agc(rf, g)',
			'Rser, Ra, Rb, Rx, the channel at balance and the gate it needs, for the amplitude asked, as the page sizes them; None where this JFET cannot hold the loop there.',
			[
				'r_on = 1 / (2 * BETA * -VTO)  # the channel wide open',
				'leg = rf / (g - 1)  # Rser + r at balance',
				'r_min = r_on + 0.03 * leg',
				"rb = rx = nearest(1e6, resistors)  # the page's 1 Mohm",
				'v_peak = peak(amplitude, rb)  # with Ra = 0, the most the detector gives',
				'r_max = 1 / (2 * BETA * (-VTO - v_peak / 2)) if -VTO - v_peak / 2 > 0 else math.inf',
				'if not r_max > r_min:',
				'    return None',
				"# The page's margins: the channel aimed at 0.9 r_max at most, kept under 0.95 r_max.",
				'target = leg - max(r_min, min(0.1 * leg, 0.9 * r_max))  # Rser',
				'steps = (0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 1, 1.03, 1.05, 1.1)',
				...(e96 ? ['usable = []', 'for stock in (resistors, resistors_e96):  # (E96 where E24 has none)', '    if not usable:', ...pick('stock', '        ')] : pick('resistors')),
				'if not usable:',
				'    return None',
				'r_ser = min(usable, key=lambda v: abs(v - target))',
				'r_bal = leg - r_ser  # the channel at balance',
				'vgs = VTO + 1 / (2 * BETA * r_bal)  # the gate it needs',
				'',
				'def gate_at(ra):  # (falls as Ra grows)',
				'    return gate(peak(amplitude, ra + rb), ra, rb, rx)',
				'',
				'ra_exact = 0.0',
				'if gate_at(0.0) < vgs:',
				"    lo, hi = 0.0, 50e6  # (the page's bracket)",
				'    for _ in range(80):',
				'        mid = 0.5 * (lo + hi)',
				'        if gate_at(mid) < vgs:',
				'            lo = mid',
				'        else:',
				'            hi = mid',
				'    ra_exact = 0.5 * (lo + hi)',
				"ra = 0.0 if ra_exact < 1e3 else nearest(ra_exact, resistors)  # (none under the page's 1 kohm)",
				...(e96 ? ['if ra > 0 and abs((gate_at(ra) - VTO) / (vgs - VTO) - 1) > 0.01:  # (off by over 1 %: E96)', '    ra = nearest(ra_exact, resistors_e96)'] : []),
				'return r_ser, ra, rb, rx, r_bal, vgs'
			]
		)
	);
	file.add(
		pyDef(
			'agc_amplitude(parts, g)',
			"The amplitude the AGC's parts settle at against a gain g, by bisection between the page's 0.05 V and 50 V, and the gain at switch-on; both None where the gain never crosses g (the loop cannot start, or cannot be held).",
			[
				'def gain_at(a):',
				'    v_peak = max(0.0, peak(a, parts["Ra"] + parts["Rb"]))',
				'    vgs = min(0.0, gate(v_peak, parts["Ra"], parts["Rb"], parts["Rx"]))',
				'    if vgs <= VTO:',
				'        return 1.0  # (pinched off: the leg is open)',
				'    return 1 + parts["Rf"] / (parts["Rser"] + 1 / (2 * BETA * (vgs - VTO)))',
				'',
				'lo, hi = 0.05, 50.0',
				'if gain_at(lo) < g or gain_at(hi) > g:',
				'    return None, None',
				'for _ in range(80):',
				'    mid = 0.5 * (lo + hi)',
				'    if gain_at(mid) > g:',
				'        lo = mid',
				'    else:',
				'        hi = mid',
				'return 0.5 * (lo + hi), gain_at(0.05)'
			]
		)
	);
	file.add(
		[
			'rf = nearest((required_gain - 1) * rg, resistors)',
			'agc = size_agc(rf, required_gain)',
			'if agc is None:',
			pyRaise('This JFET cannot hold the loop at this amplitude (the page says the least it can): a larger amplitude, or a JFET of smaller pinch-off.', '    '),
			'r_ser, ra, rb, rx, r_bal, vgs = agc',
			'c_det = nearest(50 / frequency / (ra + rb), capacitors)  # F, the detector over 50 cycles',
			'print(f"  Rf = {eng(rf, \'ohm\')}, Rser = {eng(r_ser, \'ohm\')}: the channel {eng(r_bal, \'ohm\')} at "',
			'      f"balance, the gate at {vgs:.3f} V")',
			'print(f"  Ra = {eng(ra, \'ohm\') if ra else \'none\'}, Rb = {eng(rb, \'ohm\')}, Rx = {eng(rx, \'ohm\')}, "',
			'      f"Cdet = {eng(c_det, \'F\')}")'
		].join('\n')
	);
}

/* ------------------------------------------------------------- clamp */

function clampSection(file, ctx) {
	file.add(
		[
			section(`${ctx.numbers.control} The start and the clamp`),
			comment(
				[
					"Rn, the stocked resistor nearest R / rho_start, starts the loop: the pole with it is what the loop does at switch-on. The clamp stops the growth: a divider Rd1 Rd2 from the cosine output, and two diodes back to back from its tap into integrator 2's input, which conduct once the tap reaches a diode drop, i(v) = Is (exp(v / (n Vt)) - exp(-v / (n Vt))). Over a cycle their current is a conductance across C2 that rises steeply with the amplitude (its describing function), and the amplitude parks where it cancels Rn's negative one and the little the op-amps' lag adds. A conductance G across C moves the pole left by G / (2 C), so the lag's sigma_lag, from the pole without Rn, takes 2 sigma_lag C to cancel:",
					'    G_clamp(A) = 1 / Rn + 2 sigma_lag C',
					'Rd2 is the stocked resistor nearest 1 kohm, for a steep slope, and Rd1 is solved by bisection on ln Rd1 so the balance lands on the amplitude asked, then rounded to the stock.'
				].join('\n')
			),
			diodeTable(false),
			diodeGuard(),
			'IS, N = DIODES[diode]'
		].join('\n')
	);
	file.add(pairCurrent());
	file.add(
		pyDef('clamp_current(v, rd1, rd2)', "The clamp's current at an output v: the tap's u from (v - u) / Rd1 = u / Rd2 + i(u), by bisection, then i(u).", [
			'if v == 0:',
			'    return 0.0',
			'va = abs(v)',
			'lo, hi = 0.0, va * rd2 / (rd1 + rd2)',
			'for _ in range(80):',
			'    mid = 0.5 * (lo + hi)',
			'    if mid / rd2 + pair_current(mid) < (va - mid) / rd1:',
			'        lo = mid',
			'    else:',
			'        hi = mid',
			'    if hi - lo < 1e-12 * va:',
			'        break',
			'return math.copysign(pair_current(0.5 * (lo + hi)), v)'
		])
	);
	file.add(simpson('conductance(a, rd1, rd2)', "G_clamp(A), by Simpson's rule over one cycle in 256 steps of dt.", 'clamp_current(a * math.sin(t), rd1, rd2)', 'a'));
	file.add(
		pyDef('amplitude_held(rd1, rd2, g_target)', "The amplitude the clamp settles at, where G_clamp(A) = g_target, by bisection from the page's 1 mV and 1 V, the top doubled; None past 1 kV.", [
			'lo, hi = 1e-3, 1.0',
			'while conductance(hi, rd1, rd2) < g_target and hi < 1e3:',
			'    hi *= 2',
			'if hi >= 1e3:',
			'    return None',
			'for _ in range(80):',
			'    mid = 0.5 * (lo + hi)',
			'    if mid in (lo, hi):  # (down to the last bit)',
			'        break',
			'    if conductance(mid, rd1, rd2) < g_target:',
			'        lo = mid',
			'    else:',
			'        hi = mid',
			'return 0.5 * (lo + hi)'
		])
	);
	file.add(
		pyDef('size_clamp(g_target)', "Rd1, Rd2 and the exact Rd1 for the amplitude asked; None where no Rd1 in the page's bracket, 100 ohm to 100 Mohm, reaches it.", [
			'rd2 = nearest(1e3, resistors)',
			'lo, hi = 100.0, 1e8  # (the conductance falls as Rd1 grows)',
			'if conductance(amplitude, lo, rd2) < g_target or conductance(amplitude, hi, rd2) > g_target:',
			'    return None',
			'for _ in range(100):',
			'    mid = math.sqrt(lo * hi)',
			'    if mid in (lo, hi):  # (down to the last bit)',
			'        break',
			'    if conductance(amplitude, mid, rd2) > g_target:',
			'        lo = mid',
			'    else:',
			'        hi = mid',
			'rd1_exact = math.sqrt(lo * hi)',
			'return nearest(rd1_exact, resistors), rd2, rd1_exact'
		])
	);
	growthHelper(file);
	file.add(
		[
			'rn = nearest(r / rho_start, resistors)',
			's, settled = pole(r * c, r / rn)',
			's0, _ = pole(r * c, 0.0)  # (without Rn: the op-amps\' lag alone)',
			'g_target = 1 / rn + 2 * max(0.0, s0.real) * c  # S',
			'clamp = size_clamp(g_target)',
			'if clamp is None:',
			pyRaise('No clamp divider reaches this amplitude: a larger amplitude or a smaller growth.', '    '),
			'rd1, rd2, rd1_exact = clamp',
			'growth_start = growth_of(s) if settled else None',
			'if growth_start is None:',
			'    print(f"  Rn = {eng(rn, \'ohm\')}: the loop finds no pole")',
			'else:',
			'    print(f"  Rn = {eng(rn, \'ohm\')}, R / Rn = {r / rn:.4f}: the loop grows "',
			'          f"{100 * growth_start:+.2f} % a cycle, the op-amps\' lag in it")',
			'print(f"  Rd2 = {eng(rd2, \'ohm\')}, Rd1 = {eng(rd1_exact, \'ohm\')} rounded to {eng(rd1, \'ohm\')}")'
		].join('\n')
	);
}

/** growth_of(), a pole's growth per cycle (the quadrature loop's section 4, and every check of a pole). */
export function growthHelper(file) {
	file.once(
		'growth_of',
		pyDef('growth_of(s)', 'The growth per cycle of a pole s = sigma + j w, exp(2 pi sigma / w) - 1, or None.', [
			'exponent = 2 * math.pi * s.real / abs(s.imag) if s.imag else math.inf',
			'return math.exp(exponent) - 1 if exponent < 700 else None'
		])
	);
}

/** Section 4, by the design's amplitude control. */
export function controlSection(file, ctx) {
	if (ctx.control === 'diodes') diodesSection(file, ctx);
	else if (ctx.control === 'lamp') lampSection(file, ctx);
	else if (ctx.control === 'jfet') jfetSection(file, ctx);
	else clampSection(file, ctx);
}
