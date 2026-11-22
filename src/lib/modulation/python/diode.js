import { comment, header, pyEng, pyNum, pyPrints, pyRaise, PyFile, section } from '../../filter/python/emit';
import { diodeCurrentHelper, diodeModel, diodeSettings } from './diodeLaw';
import { adviceCode, docstring, engHelper, flow, nearestCode, neighboursHelper, pageParts, resultsComment, sayHelper, settingsHeader, stockOf, stockSettings, tableCode } from './shared';

/**
 * diode-tank-am-modulator.py: the page's switching modulator, a summer that
 * adds the carrier, the message and a bias, a diode through R_s, and a
 * parallel tank tuned to the carrier. The sections:
 *   1 the tank           C for the carrier with the coil given (a stocked
 *                        pair in parallel, as the page builds it), f0
 *   2 the band           the band the sidebands ask, R_s and R_t
 *   3 the diode          the diode law tabulated, one carrier cycle solved
 *                        with the tank's answer, the envelope over a
 *                        message cycle: what the page works out
 *   4 the summer         the bias with the least distortion at the target
 *                        index (as the page searches it), R_b, the message
 *                        drive the index asks, and the file's own R_p and
 *                        R_m (rounded down or up, the four tried)
 *   5 the check          both sets of parts through the page's evaluation
 *                        and its checks, side by side
 *   then the AM wave a fm_max tone gives.
 * args (diodeArgs below): what the page's downloadDiode passes.
 */

/**
 * The arguments, filled in:
 *   fp, fmMax, sidebandMargin, inductance (H), carrierAmplitude,
 *   modAmplitude, targetModulationIndex, carrierDrive, vcc, diode ('1N4148'
 *   or 'BAT54')
 *   stock      { kind, resistors, capacitors, pairs, pairLimit }: the one
 *              the page's design took (E24 and E12 when it fell back)
 *   shortfall  whether the page fell back to E24 and E12, the parts on hand
 *              reaching no design
 *   page       the page's parts: Rf, Rp, Rm, Rb (null for none), Rs, Rt, and
 *              C, the tank's one or two capacitors
 *   limitNote  the page's note on its limit of pairs (pairLimitNote), or null
 */
function diodeArgs(raw) {
	return { ...raw, stock: stockOf(raw.stock) };
}

function settings(a) {
	const lines = [
		settingsHeader(),
		`fp = ${pyNum(a.fp)}  # Hz, the carrier: the tank sits on it`,
		`fm_max = ${pyNum(a.fmMax)}  # Hz, the highest message frequency`,
		`sideband_margin = ${pyNum(a.sidebandMargin)}  # the tank's band over the 2 fm_max the sidebands span`,
		`inductance = ${pyEng(a.inductance)}  # H, the tank's coil`,
		`carrier_amplitude = ${pyNum(a.carrierAmplitude)}  # V, the carrier source`,
		`mod_amplitude = ${pyNum(a.modAmplitude)}  # V, the message source`,
		`target_n = ${pyNum(a.targetModulationIndex)}  # the modulation index asked for a slow message`,
		`carrier_drive = ${pyNum(a.carrierDrive)}  # V, the carrier wanted at the diode`,
		`vcc = ${pyNum(a.vcc)}  # V, the supply (the bias comes from -vcc)`,
		'opamp_swing = max(0.5, vcc - 1.5)  # V, what the summer\'s op-amp, a TL08x, reaches on it',
		'gbw = 3e6  # Hz, its gain-bandwidth',
		'',
		diodeSettings(a.diode, { cjo: true })
	];
	const note = a.shortfall ? 'No set of the parts on hand reaches the index, so the page took E24 and E12, as the file does.' : '';
	const results = ['c_target', 'tank_c', 'f0', 'band_needed', 'r_eff', 'rs', 'rt', 'vb_best', 'rb', 'um_wanted', 'own_parts', 'own_check', 'page_parts', 'page_check'];
	return [lines.join('\n'), stockSettings(a.stock, { caps: 'e12', pairsWhere: 'in the whole modulator', note }), resultsComment(results)].join('\n\n');
}

function tankSection(file) {
	file.add(
		[
			comment(
				'The tank is a parallel R L C to ground, tuned to the carrier: there L and C cancel and it is R alone,\n    f0 = 1 / (2 pi sqrt(L C)),  C = 1 / ((2 pi fp)^2 L)\nOne stocked capacitor can miss by several percent and drop a sideband, so C is a stocked capacitor with a smaller one in parallel, or none: the pair whose sum lands closest, as the page builds it.'
			),
			'if not (fp > 0 and fm_max > 0 and inductance > 0 and sideband_margin > 0',
			'        and fp - sideband_margin * fm_max > fm_max and 0 < target_n <= 1 and carrier_amplitude > 0',
			'        and mod_amplitude > 0 and carrier_drive > 0 and vcc > 0):',
			pyRaise('The carrier has to sit above (sideband_margin + 1) fm_max, target_n in (0, 1], the rest over 0: see SETTINGS.', '    '),
			'w0 = 2 * math.pi * fp',
			'c_target = 1 / (w0 * w0 * inductance)',
			'best = None',
			'for c1 in [v for v in capacitors if v <= c_target * 1.0005] or capacitors[:1]:',
			'    for c2 in [0.0] + capacitors:',
			'        if c2 > c1:',
			'            break',
			'        err = abs(math.log((c1 + c2) / c_target))',
			'        if best is None or err < best[0] - 1e-9:',
			'            best = (err, c1, c2)',
			'tank_c = [best[1], best[2]] if best[2] > 0 else [best[1]]',
			'c = sum(tank_c)',
			'f0 = 1 / (2 * math.pi * math.sqrt(inductance * c))',
			'print(f"  C = 1 / ((2 pi fp)^2 L) = {eng(c_target, \'F\')} -> "',
			'      + " + ".join(eng(v, "F") for v in tank_c) + f" = {eng(c, \'F\')}")',
			'print(f"  f0 = {eng(f0, \'Hz\')}, {100 * (f0 / fp - 1):+.2f} % from the carrier")'
		].join('\n')
	);
}

function bandSection(file) {
	file.add(
		[
			comment(
				"The tank passes a band f0 / Q around the carrier, Q = 2 pi f0 R C, which has to hold both sidebands, fp +- fm_max, with sideband_margin times their span, widened by any detuning the capacitors left. Through the switching diode R_s is connected for half of each cycle, so the tank sees a source of about 2 R_s, in parallel with its own R_t. R_s is taken at twice the band's resistance R_eff = 1 / (2 pi BW C), and R_t so that the two in parallel give R_eff (rounded down: a lower R_t only widens the band)."
			),
			'band_needed = 2 * sideband_margin * fm_max + 2 * abs(f0 - fp)  # Hz',
			'r_eff = 1 / (2 * math.pi * band_needed * c)',
			'tank_range = [v for v in resistors if 10 * (1 - 1e-9) <= v < 1e8]  # (from 10 ohm, as the page)',
			'rs = min(tank_range, key=lambda v: abs(math.log(v / (2 * r_eff))))',
			'rt_target = 1 / (1 / r_eff - 1 / (2 * rs))',
			'below = [v for v in tank_range if v <= rt_target * (1 + 1e-9)]',
			'floor = min(tank_range)  # (the smallest resistor the band may take)',
			'rt = max(below) if below else floor',
			'print(f"  the band asked {eng(band_needed, \'Hz\')}: R_eff = 1 / (2 pi BW C) = {eng(r_eff, \'ohm\')}")',
			'print(f"  R_s = 2 R_eff -> {eng(rs, \'ohm\')}, R_t = {eng(rt_target, \'ohm\')} -> {eng(rt, \'ohm\')}")'
		].join('\n')
	);
}

function diodeSection(file) {
	file.add(
		comment(
			"At a volt or so the diode is a switch, on for half of each carrier cycle, but a soft one: its current grows exponentially over its last few tenths of a volt. So the circuit is worked out as the page works it: for one value of the message, one carrier cycle of the diode's current, solved with the tank's answer to its carrier component, which subtracts from the drive; repeated over a message cycle, that traces the envelope, whose mean is the carrier out, whose fundamental over the mean gives the index and whose harmonics the distortion."
		)
	);
	diodeCurrentHelper(file);
	file.add(
		[
			'def current_table(r, reach, size=8192):',
			'    """The diode\'s current through r against the drive, tabulated from -reach to reach: between',
			'    two entries the line through them, past the end the resistive slope it tends to."""',
			'    step = (2 * reach) / (size - 1)',
			'    table = [diode_current(-reach + k * step, r) for k in range(size)]',
			'    slope = 1 / (r + diode_rs)',
			'',
			'    def current(v):',
			'        x = (v + reach) / step',
			'        if x <= 0:',
			'            return table[0]',
			'        if x >= size - 1:',
			'            return table[-1] + (v - reach) * slope',
			'        k = int(x)',
			'        return table[k] + (x - k) * (table[k + 1] - table[k])',
			'',
			'    return current',
			'',
			'',
			'def tank_z(f, r, c):',
			'    """The impedance of the tank r, inductance, c in parallel at f, complex: 1 / Y with',
			'    Y = 1 / r + j (w c - 1 / (w L)); at 0 Hz the coil shorts it."""',
			'    w = 2 * math.pi * abs(f)',
			'    if w == 0:',
			'        return 0j',
			'    g, b = 1 / r, w * c - 1 / (w * inductance)',
			'    return complex(g / (g * g + b * b), -b / (g * g + b * b))',
			'',
			'',
			'def fundamental(current, a, u, v1, points):',
			'    """The carrier component of the diode\'s current over one carrier cycle of the drive',
			'    a cos(th) + u less the tank\'s v1 (complex, cosine-referenced), and its peak."""',
			'    re = im = peak = 0.0',
			'    for cos, sin in points:',
			'        i = current(a * cos + u - (v1.real * cos - v1.imag * sin))',
			'        re += i * cos',
			'        im += i * sin',
			'        peak = max(peak, i)',
			'    return complex((2 * re) / len(points), (-2 * im) / len(points)), peak',
			'',
			'',
			'def carrier_cycle(current, a, u, z, relax, points, v1=0j):',
			'    """One carrier cycle with the drive a cos(th) + u: the tank answers the current\'s carrier',
			'    component I1 with V1 = z I1, solved by a fixed point relaxed by relax = 1 / (1 + R_t / 2 R_s),',
			'    as the tank takes back part of what it gets. Returns V1 and the peak."""',
			'    v = v1',
			'    i1, peak = fundamental(current, a, u, v, points)',
			'    for _ in range(100):',
			'        step = z * i1 - v',
			'        v += relax * step',
			'        i1, peak = fundamental(current, a, u, v, points)',
			'        if abs(step) < 1e-9:',
			'            break',
			'    return v, peak',
			'',
			'',
			'def envelope(current, a, um, vb, z, relax, count, points):',
			'    """The carrier\'s height over a message cycle (count points): its mean, the index, the',
			'    harmonics 1 to 5 and their distortion, the extremes and the largest diode current."""',
			'    heights, peak, v1 = [], 0.0, 0j',
			'    for k in range(count):',
			'        v1, i_max = carrier_cycle(current, a, um * math.cos((2 * math.pi * k) / count) + vb, z,',
			'                                  relax, points, v1)',
			'        heights.append(abs(v1))',
			'        peak = max(peak, i_max)',
			'    mean = sum(heights) / count',
			'    harmonics = []',
			'    for h in range(1, 6):',
			'        re = im = 0.0',
			'        for k, x in enumerate(heights):',
			'            re += x * math.cos((2 * math.pi * h * k) / count)',
			'            im += x * math.sin((2 * math.pi * h * k) / count)',
			'        harmonics.append((2 * math.hypot(re, im)) / count)',
			'    rest = math.sqrt(sum(x * x for x in harmonics[1:]))',
			'    return {"mean": mean, "n": harmonics[0] / mean, "harmonics": harmonics,',
			'            "thd": rest / harmonics[0] if harmonics[0] > 0 else 0.0, "max": max(heights),',
			'            "min": min(heights), "peak": peak}'
		].join('\n')
	);
	file.add(
		[
			'reach = 3 * carrier_drive + 2  # V, past every drive the circuit sees',
			'current = current_table(rs, reach)',
			'z = tank_z(fp, rt, c)',
			'relax = 1 / (1 + rt / (2 * rs))',
			'# cos and sin at each point of a carrier cycle: the search\'s grid, and the check\'s',
			'COARSE = [(math.cos(2 * math.pi * s / 64), math.sin(2 * math.pi * s / 64)) for s in range(64)]',
			'FINE = [(math.cos(2 * math.pi * s / 128), math.sin(2 * math.pi * s / 128)) for s in range(128)]',
			'print(f"  the diode law tabulated over +-{reach:g} V; the tank is {eng(abs(z), \'ohm\')} at fp")'
		].join('\n')
	);
}

function summerSection(file) {
	file.add(
		comment(
			"The summer adds the carrier, the message and a small bias V_B (from -vcc through R_b) that sets where the switch flips:\n    v_s = A_d cos(w_p t) + u_m m(t) + V_B,  A_d = (R_f / R_p) A_c,  u_m = (R_f / R_m) A_m,  V_B = (R_f / R_b) vcc\nToo little bias and the diode conducts for less than half a cycle, too much and for more: either bends the envelope. The bias is the one with the least distortion at the target index, found as the page finds it: a sweep of 0 to 0.8 V in five steps, then six steps of a golden-section search around the best; at each, the message drive that gives the index, by a bracketed secant."
		)
	);
	file.add(
		[
			'def drive_for_index(vb, target):',
			'    """The message drive u_m that gives the index target at the bias vb: the index rises with',
			'    u_m, so a bracketed secant (Illinois) finds it; None when 1.5 carrier_drive falls short."""',
			'    def miss(um):',
			'        return envelope(current, carrier_drive, um, vb, z, relax, 12, COARSE)["n"] - target',
			'',
			'    a, fa, b = 0.0, -target, 1.5 * carrier_drive',
			'    fb = miss(b)',
			'    if fb < 0:',
			'        return None',
			'    side = 0',
			'    for _ in range(40):',
			'        um = (a * fb - b * fa) / (fb - fa)',
			'        f = miss(um)',
			'        if abs(f) < 1e-5:',
			'            return um',
			'        if f < 0:',
			'            a, fa = um, f',
			'            fb = fb / 2 if side == -1 else fb',
			'            side = -1',
			'        else:',
			'            b, fb = um, f',
			'            fa = fa / 2 if side == 1 else fa',
			'            side = 1',
			'        if b - a < 1e-6 * carrier_drive:',
			'            break',
			'    return (a + b) / 2',
			'',
			'',
			'def distortion_at(vb):',
			'    """(V_B, the drive u_m for target_n there, the envelope\'s distortion), inf where none."""',
			'    um = drive_for_index(vb, target_n)',
			'    if um is None:',
			'        return (vb, None, math.inf)',
			'    return (vb, um, envelope(current, carrier_drive, um, vb, z, relax, 12, COARSE)["thd"])'
		].join('\n')
	);
	file.add(
		[
			'best = None',
			'for k in range(5):',
			'    t = distortion_at((0.8 * k) / 4)',
			'    if best is None or t[2] < best[2]:',
			'        best = t',
			'if best[2] == math.inf:',
			pyRaise('No bias and message drive reach target_n at this carrier_drive: raise carrier_drive or lower target_n.', '    '),
			'lo, hi, g = max(0.0, best[0] - 0.8 / 4), min(0.8, best[0] + 0.8 / 4), (math.sqrt(5) - 1) / 2',
			'x1, x2 = hi - g * (hi - lo), lo + g * (hi - lo)',
			't1, t2 = distortion_at(x1), distortion_at(x2)',
			'for _ in range(6):',
			'    if t1[2] < t2[2]:',
			'        hi, x2, t2 = x2, x1, t1',
			'        x1 = hi - g * (hi - lo)',
			'        t1 = distortion_at(x1)',
			'    else:',
			'        lo, x1, t1 = x1, x2, t2',
			'        x2 = lo + g * (hi - lo)',
			'        t2 = distortion_at(x2)',
			'for t in (t1, t2):',
			'    if t[2] < best[2]:',
			'        best = t',
			'vb_best = best[0]',
			`rf = ${nearestCode('10e3')}  # the summer's feedback`,
			comment("R_b from -vcc, the stocked value nearest R_f vcc / V_B (none where the bias is next to nothing, as for a Schottky); then the drive for the index at its bias:"),
			'rb = None',
			'if vb_best >= 0.02:',
			'    rb_exact = (rf * vcc) / vb_best',
			`    rb = ${nearestCode('rb_exact')}`,
			'vb = (rf * vcc) / rb if rb else 0.0',
			'um_wanted = drive_for_index(vb, target_n) or best[1]',
			'print(f"  the least distortion at V_B = {vb_best:.4g} V: R_b = "',
			'      + (f"{eng(rb, \'ohm\')}, V_B = {vb:.4g} V" if rb else "none"))',
			'print(f"  u_m = {um_wanted:.4g} V gives n = {target_n:g} there")'
		].join('\n')
	);
	file.add(
		[
			comment(
				"The file's own rule for R_p and R_m: R_p = R_f A_c / A_d rounded down or up; for each, the drive A_d it gives, and R_m = R_f A_m / u_m with u_m scaled as A_d (the index follows u_m / A_d), rounded down or up; of the four, the one whose index lands closest, worked out with the diode on the search's grid. R_f, R_b, R_s, R_t and C are worked out the page's way, from the tank and the bias."
			)
		].join('\n')
	);
	neighboursHelper(file);
	file.add(
		[
			'def index_of(rp, rm):',
			'    """The index a slow message gets with R_p and R_m, on the search\'s grid."""',
			'    return envelope(current, (rf / rp) * carrier_amplitude, (rf / rm) * mod_amplitude, vb, z, relax,',
			'                    12, COARSE)["n"]'
		].join('\n')
	);
	file.add(
		[
			'tried = []  # (how far the index lands, R_p, R_m)',
			'for rp in neighbours((rf * carrier_amplitude) / carrier_drive):',
			'    drive = (rf / rp) * carrier_amplitude',
			'    for rm in neighbours((rf * mod_amplitude) / (um_wanted * (drive / carrier_drive))):',
			'        tried.append((abs(math.log(index_of(rp, rm) / target_n)), rp, rm))',
			'_, rp, rm = min(tried)',
			'own_parts = {"Rf": rf, "Rp": rp, "Rm": rm, "Rb": rb, "Rs": rs, "Rt": rt, "C": tank_c}',
			'print(f"  R_p = {eng(rf * carrier_amplitude / carrier_drive, \'ohm\')} -> {eng(rp, \'ohm\')},"',
			'      f" R_m -> {eng(rm, \'ohm\')}: n = {index_of(rp, rm):.4f} on the search\'s grid")'
		].join('\n')
	);
}

function checkSection(file, a) {
	const page = { Rf: a.page.Rf, Rp: a.page.Rp, Rm: a.page.Rm, Rb: a.page.Rb ?? null, Rs: a.page.Rs, Rt: a.page.Rt };
	const checks = [
		'"index": abs(env["n"] - target_n) <= 0.05 and env["n"] <= 1',
		'"tune": abs(f0_got / fp - 1) <= 0.03',
		'"range": rt_asked >= floor * (1 - 1e-9) and 2 * r_asked >= floor * 0.95',
		'"diode C": 2 * math.pi * fp * diode_cjo * p["Rs"] <= 0.05',
		'"sidebands": fp - fm_max >= low - 1e-9 * fp and fp + fm_max <= high + 1e-9 * fp',
		'"current": summer_current <= 0.02',
		'"leak": leak <= 0.03',
		'"summer swing": summer_peak <= opamp_swing',
		'"gbw rule": (fp * noise) / gbw <= 0.2',
		'"slope": sideband >= 0.9'
	];
	const cells = [
		'f"{env[\'n\']:.4f}"',
		'eng(env["mean"], "V")',
		'f"{ideal_n:.4f}, {eng(ideal_out, \'V\')}"',
		'f"{env[\'n\'] * sideband:.4f}"',
		'f"{100 * env[\'thd\']:.2f} %, {100 * thd_fm:.2f} %"',
		'f"{eng(env[\'max\'], \'V\')} / {eng(env[\'min\'], \'V\')}"',
		'f"{eng(f0_got, \'Hz\')}, {100 * (f0_got / fp - 1):+.2f} %"',
		'f"{eng(bw, \'Hz\')} of {eng(band_asked, \'Hz\')}"',
		'f"{f0_got / bw:.3g}"',
		'eng(r_source, "ohm")',
		'eng(summer_peak, "V")',
		'eng(summer_current, "A")',
		'f"{(fp * noise) / gbw:.3f}"',
		'f"{100 * leak:.2f} %"',
		'"meets" if not misses else f"misses {len(misses)}"'
	];
	const rows = [
		'f"index n, target {target_n:g}"',
		'"carrier at the output"',
		'"an ideal switch: index, carrier"',
		'f"index for a {eng(fm_max, \'Hz\')} tone"',
		'"THD: slow, and that tone"',
		'"envelope max / min"',
		'"f0, off the carrier"',
		'"band, of the band asked"',
		'"Q with the source"',
		'"source through the diode"',
		'f"summer peak, within {opamp_swing:g} V"',
		'"summer current, at most 20 mA"',
		'"fp x noise gain / gbw, at most 0.2"',
		'"message leak, at most 3 %"',
		'"verdict"'
	];
	const advice = [
		['index', 'The index: values closer to the ones R_p and R_m need would bring it back.'],
		['tune', 'The tune: a coil that suits the capacitors, or more capacitors, centres the tank.'],
		['range', "The range: a larger L raises the tank's resistance into the stock's reach."],
		['diode C', "The diode C: a smaller L brings R_s down, so the diode's capacitance passes less."],
		['sidebands', 'The sidebands: a larger sideband_margin widens the band the tank passes.'],
		['current', 'The current: a TL08x gives about 20 mA; a larger L raises R_s and brings it down.'],
		['leak', 'The leak: a higher carrier or a smaller sideband_margin narrows the tank.'],
		['summer swing', "The summer's swing: a lower carrier_drive or a higher vcc brings it back."],
		['gbw rule', 'The gbw rule: the carrier comes out smaller and late; a faster op-amp fixes it.'],
		['slope', 'The slope: a larger sideband_margin flattens the tank over the sidebands.']
	];
	const why = a.stock.pairs
		? 'the page tries two values either side of R_p and R_m and may build one of two in series, the file\'s rule one either side'
		: 'the page tries two values either side of R_p and R_m and weighs the drive\'s miss too, the file\'s rule one either side';
	file.add(
		comment(
			"Each set of parts goes through the page's evaluation: its envelope on a finer grid (32 message points, 128 carrier points), the source the tank sees through the diode (from how the carrier current gives way when the tank's voltage rises), the loaded band, the sidebands on its slope, and the checks the page makes, those of the table and: the index at most 1, f0 within 3 % of the carrier (tune), the R_t and 2 R_eff the band asks at or over the smallest stocked resistor from 10 ohm (range), 2 pi fp Cjo R_s at most 0.05 (diode C), both sidebands in the band, and the sidebands at 90 % of the carrier or more (slope)."
		)
	);
	const capsText = `[${a.page.C.map(pyEng).join(', ')}]`;
	file.add(pageParts(page, a.stock, { raw: { C: capsText }, note: a.limitNote }));
	file.add(
		[
			'def check(name, p):',
			'    """A set of parts through the page\'s evaluation: its figures, its checks (True when met),',
			'    the verdict and its cells in the table below."""',
			'    c_got = sum(p["C"])',
			'    f0_got = 1 / (2 * math.pi * math.sqrt(inductance * c_got))',
			'    band_asked = 2 * sideband_margin * fm_max + 2 * abs(f0_got - fp)',
			'    r_asked = 1 / (2 * math.pi * band_asked * c_got)',
			'    rt_asked = 1 / (1 / r_asked - 1 / (2 * p["Rs"]))',
			'    cur = current_table(p["Rs"], reach)',
			'    drive, um = (p["Rf"] / p["Rp"]) * carrier_amplitude, (p["Rf"] / p["Rm"]) * mod_amplitude',
			'    vb = (p["Rf"] * vcc) / p["Rb"] if p["Rb"] else 0.0',
			'    zt, rel = tank_z(fp, p["Rt"], c_got), 1 / (1 + p["Rt"] / (2 * p["Rs"]))',
			'    env = envelope(cur, drive, um, vb, zt, rel, 32, FINE)',
			'    v1, _ = carrier_cycle(cur, drive, vb, zt, rel, FINE)',
			'    dv = 1e-3 * max(1e-3, abs(v1))',
			'    di = (fundamental(cur, drive, vb, v1, FINE)[0].real',
			'          - fundamental(cur, drive, vb, v1 + dv, FINE)[0].real)',
			'    r_source = dv / di if di > 0 else 2 * p["Rs"]',
			'    r_loaded = 1 / (1 / p["Rt"] + 1 / r_source)',
			'    bw = 1 / (2 * math.pi * r_loaded * c_got)',
			'    low, high = f0_got - bw / 2, f0_got + bw / 2',
			'    zc = abs(tank_z(fp, r_loaded, c_got))',
			'',
			'    def kept(f):',
			'        """What the loaded tank passes of the pair of sidebands f away, against the carrier."""',
			'        pair = abs(tank_z(fp - f, r_loaded, c_got)) + abs(tank_z(fp + f, r_loaded, c_got))',
			'        return pair / (2 * zc)',
			'',
			'    sideband = kept(fm_max)  # the sidebands of a fm_max tone, against the carrier',
			'    h_out = [x * kept((h + 1) * fm_max) for h, x in enumerate(env["harmonics"])]',
			'    thd_fm = math.sqrt(sum(x * x for x in h_out[1:])) / h_out[0] if h_out[0] > 0 else 0.0',
			'    summer_peak = drive + um + vb  # V, the summer\'s output at its crest',
			'    summer_current = env["peak"] + summer_peak / p["Rf"]  # A, into the diode and R_f',
			'    ideal_n, ideal_out = (4 * um) / (math.pi * drive), (drive * r_loaded) / (2 * p["Rs"])',
			'    leak = (abs(tank_z(fm_max, r_loaded, c_got)) * (um / (2 * p["Rs"]))) / max(1e-12, env["mean"])',
			'    noise = 1 + p["Rf"] * (1 / p["Rp"] + 1 / p["Rm"] + (1 / p["Rb"] if p["Rb"] else 0))',
			flow('    checks = {', checks, '}'),
			'    misses = [key for key, ok in checks.items() if not ok]',
			flow('    cells = [', cells, ']'),
			'    return {**env, "drive": drive, "um": um, "vb": vb, "f0": f0_got, "band_asked": band_asked,',
			'            "r_source": r_source, "r_loaded": r_loaded, "bw": bw, "q": f0_got / bw,',
			'            "sideband": sideband, "index_fm": env["n"] * sideband, "thd_fm": thd_fm,',
			'            "peak_out": summer_peak, "current": summer_current, "leak": leak, "noise": noise,',
			'            "ideal_n": ideal_n, "ideal_out": ideal_out, "checks": checks, "misses": misses,',
			'            "meets": not misses, "cells": cells}'
		].join('\n')
	);
	sayHelper(file);
	file.add(
		[
			'own_check = check("the file\'s parts", own_parts)',
			'page_check = check("the page\'s parts", page_parts)',
			'sets = [("the file\'s parts", own_check), ("the page\'s parts", page_check)]',
			'for name, p in [("the file\'s parts", own_parts), ("the page\'s parts", page_parts)]:',
			'    say(f"  {name}:", [f"{key} {eng(v, \'ohm\')}" for key, v in p.items() if key != "C" and v]',
			'        + ["C " + " + ".join(eng(v, "F") for v in p["C"])])',
			tableCode(rows, 36),
			'if own_check["meets"] and page_check["meets"]:',
			'    print("  Both sets meet every check.")',
			'elif own_check["meets"]:',
			'    print("  The file\'s parts meet every check where the page\'s miss "',
			'          + ", ".join(page_check["misses"]) + ": its R_p and R_m land the index closer.")',
			'elif page_check["meets"]:',
			'    print("  The file\'s parts miss " + ", ".join(own_check["misses"]) + " where the page\'s meet:")',
			pyPrints(`${why}.`, '    '),
			'missed = own_check["misses"] + page_check["misses"]',
			adviceCode(advice)
		].join('\n')
	);
}

function plotSection(file) {
	file.add(comment('A fm_max tone at the carrier and index the tank hands on, as the page previews it: drawn only when matplotlib is installed, otherwise a short table of the envelope.'));
	file.add(
		[
			'def envelope_at(chk, t):',
			'    """The envelope of the set chk at time t: its carrier, moved by its index at fm_max."""',
			'    return chk["mean"] * (1 + chk["index_fm"] * math.cos(2 * math.pi * fm_max * t))'
		].join('\n')
	);
	file.add(
		[
			'try:',
			'    import matplotlib.pyplot as plt',
			'except ImportError:',
			'    plt = None',
			'if plt is None:',
			'    print("The envelope over one message cycle, in V (pip install matplotlib draws the wave):")',
			'    print("        t (ms)" + "".join(f"{name:>19}" for name, _ in sets))',
			'    for i in range(5):',
			'        t = i / (4 * fm_max)',
			'        print(f"  {1e3 * t:12.4g}" + "".join(f"{envelope_at(chk, t):19.4f}" for _, chk in sets))',
			'else:',
			'    t = [4 / fm_max * i / 3999 for i in range(4000)]',
			'    fig, axes = plt.subplots(len(sets), 1, sharex=True)',
			'    for ax, (name, chk) in zip(axes, sets):',
			'        wave = [envelope_at(chk, x) * math.cos(2 * math.pi * fp * x) for x in t]',
			'        ax.plot([1e3 * x for x in t], wave, linewidth=0.6)',
			'        ax.set_title(f"{name}: n = {chk[\'index_fm\']:.3f} at fm_max", fontsize=10)',
			'        ax.set_ylabel("output (V)")',
			'    axes[-1].set_xlabel("time (ms)")',
			'    plt.show()'
		].join('\n')
	);
}

/** diode-tank-am-modulator.py for the design on the page (see the header above). */
export function diodeFile(raw) {
	const a = diodeArgs(raw);
	const file = new PyFile();
	file.imports.add('math');
	file.add(
		docstring({
			what: `Diode AM modulator: a switching ${diodeModel(a.diode).id} diode and a resonant tank, with its summer.`,
			steps: 'from the tank and its band to the diode worked out cycle by cycle',
			name: 'diode-tank-am-modulator.py',
			plot: 'the AM wave'
		})
	);
	file.add(settings(a));
	engHelper(file);
	file.add(section('1 The tank'));
	tankSection(file);
	file.add(section('2 The band'));
	bandSection(file);
	file.add(section('3 The diode, cycle by cycle'));
	diodeSection(file);
	file.add(section('4 The summer'));
	summerSection(file);
	file.add(section('5 The check'));
	checkSection(file, a);
	file.add(header('AM wave'));
	plotSection(file);
	return file.text();
}
