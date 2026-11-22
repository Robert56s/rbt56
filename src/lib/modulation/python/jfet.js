import { comment, header, pyEng, pyNum, pyPrints, pyRaise, PyFile, section } from '../../filter/python/emit';
import { adviceCode, docstring, engHelper, engText, flow, nearestCode, pageParts, resultsComment, roundingHelpers, sayHelper, settingsHeader, stockOf, stockSettings, tableCode } from './shared';

/**
 * jfet-am-modulator.py: the JFET modulator of the page, one topology (the
 * channel as the bottom resistor of a non-inverting cell, or as the input
 * resistor of an inverting one), the JFET from its datasheet pair or from
 * readings fitted with a line. The sections follow the order the page
 * designs in, each from the rounded parts before it:
 *   1 the JFET's line      the datasheet pair, or the least-squares fit
 *   2 the window           the bias, the swing, the depth s
 *   3 the gate drive       R_f, R_ac, R_bias, C (rules a and b), gate()
 *   4 the gain cell        R_b (rule c) or R_2 (as the page), cell()
 *   5 the carrier path     the divider (rule d), carrier(); the follower
 *   6 the output stage     R_top (rule e), stage(): when the page has one
 *   then the op-amp at the carrier (opamp()), the check of both sets
 *   (check()), and the AM wave.
 * args (jfetArgs below says each): what the page's downloadJfet passes.
 */

/** The text rows of a measured mode as the page reads them: numbers split on spaces, commas or semicolons. */
function numberRows(text) {
	return String(text ?? '')
		.split(/\r?\n/)
		.map((raw) =>
			raw
				.split(/[\s,;]+/)
				.filter(Boolean)
				.map(Number)
		)
		.filter((nums) => nums.length >= 2 && nums.every(Number.isFinite));
}

/**
 * The rows the page's fit takes, as typed, in its order (by V_GS, stable),
 * and how many it read and left out: parseMeasurements' rows for the
 * divider or the resistance read directly (a row of four numbers V_GS V_in
 * V_D R_series, needing R_series > 0 and V_in > V_D > 0; of two, V_GS r_DS,
 * r_DS > 0), parseFixedVds' for a fixed V_DS (V_GS I_DS in mA, a current
 * over 0 and an r_DS over 0 once rs is taken off).
 */
function jfetReadings(mode, text, { vds = 0.2, rs = 0 } = {}) {
	const rows = [];
	let skipped = 0;
	for (const nums of numberRows(text)) {
		let row = null;
		if (mode === 'fixedvds') {
			const [vgs, idsMa] = nums;
			if (idsMa > 0 && vds / (idsMa / 1000) - (rs > 0 ? rs : 0) > 0) row = [vgs, idsMa];
		} else if (nums.length >= 4) {
			const [vgs, vin, vd, r] = nums;
			if (r > 0 && vin > vd && vd > 0) row = [vgs, vin, vd, r];
		} else if (nums[1] > 0) row = [nums[0], nums[1]];
		if (row) rows.push(row);
		else skipped++;
	}
	return { rows: rows.map((row, i) => [row, i]).sort((p, q) => p[0][0] - q[0][0] || p[1] - q[1]).map(([row]) => row), skipped };
}

/**
 * The arguments, filled in:
 *   mode        'idss', 'rdson', 'measured' or 'fixedvds'
 *   vp, idssMa, rdsOn            the datasheet pair (V, mA, ohm)
 *   text, vds, rs, window        a measured mode: the rows as typed on the
 *               page, the fixed V_DS and its series resistance, the window
 *               [low, high] the fit took (the page's model's fit.low, high)
 *   topology    'noninverting' or 'inverting'; carrierBuffer, outputStage,
 *               targetOutputAmplitude
 *   swingFraction, targetModulationIndex, sourceAmplitude, fmMin, vcc, fp,
 *   carrierAmplitude (the carrier the divider gets), wien (the page's Wien
 *   bridge when it gives that carrier: { r, c, rf1, rf2, rg }, else null),
 *   carrierMargin, opampSwing, gbw, slewRate (V/s), fmPreview
 *   stock       { kind, resistors, capacitors, pairs, pairLimit } (shared.js)
 *   page        the page's parts: Rf, Rac, Rbias, C, Rb or R2, Rdt, Rdb, and
 *               Rtop, Rbottom when it has an output stage
 *   limitNote   the page's note on its limit of pairs (pairLimitNote), or null
 */
function jfetArgs(raw) {
	const a = { ...raw };
	a.inverting = a.topology === 'inverting';
	a.fitted = a.mode === 'measured' || a.mode === 'fixedvds';
	a.stock = stockOf(a.stock);
	a.stage = a.inverting || Boolean(a.outputStage);
	if (a.fitted) {
		const read = jfetReadings(a.mode, a.text, { vds: a.vds, rs: a.rs });
		a.rows = read.rows;
		a.skipped = read.skipped;
		a.shape = a.mode === 'fixedvds' ? 'fixed' : a.rows.every((r) => r.length === 4) ? 'divider' : a.rows.every((r) => r.length === 2) ? 'direct' : 'mixed';
	}
	return a;
}

/** A Python tuple of numbers. */
const tuple = (values) => `(${values.map(pyNum).join(', ')})`;

/* ---------------------------------------------------------------- SETTINGS */

function modelSettings(a) {
	if (a.mode === 'idss') return [comment('The JFET from its datasheet: V_P and I_DSS.'), `vp = ${pyNum(a.vp)}  # V, the pinch-off voltage`, `idss_ma = ${pyNum(a.idssMa)}  # mA, the drain current at V_GS = 0`];
	if (a.mode === 'rdson') return [comment('The JFET from its datasheet: V_P and r_DS(on).'), `vp = ${pyNum(a.vp)}  # V, the pinch-off voltage`, `rds_on = ${pyNum(a.rdsOn)}  # ohm, the channel's resistance at V_GS = 0`];
	const lines = [];
	const left = a.skipped ? ` The page read ${a.skipped} more ${a.skipped === 1 ? 'row' : 'rows'} that ${a.skipped === 1 ? 'gives' : 'give'} no conductance${a.mode === 'fixedvds' ? ' (no current, or r_DS at or under 0 once rs is taken off)' : ''}, left out here.` : '';
	if (a.shape === 'fixed') {
		lines.push(
			comment(`The JFET, measured at a fixed V_DS: the drain held at vds through an ammeter, the source grounded, the gate at V_GS. One row per gate voltage.${left}`),
			`vds = ${pyNum(a.vds)}  # V, held on the drain`,
			`rs = ${pyNum(a.rs > 0 ? a.rs : 0)}  # ohm, in series with the channel and counted in vds (ammeter, source)`
		);
	} else if (a.shape === 'divider') lines.push(comment(`The JFET, measured with a divider: V_in through R_series into the drain, V_D read at the drain, the source grounded, the gate at V_GS. One row per gate voltage.${left}`));
	else if (a.shape === 'direct') lines.push(comment(`The JFET, measured: the channel's resistance r_DS at each gate voltage.${left}`));
	else lines.push(comment(`The JFET, measured: one row per gate voltage, (V_GS, r_DS) read directly or (V_GS, V_in, V_D, R_series) from a divider: V_in through R_series into the drain, V_D at the drain.${left}`));
	const unit = { fixed: '(V_GS in V, I_DS in mA)', divider: '(V_GS in V, V_in in V, V_D in V, R_series in ohm)', direct: '(V_GS in V, r_DS in ohm)', mixed: '(V_GS in V, r_DS in ohm) or (V_GS, V_in, V_D in V, R_series in ohm)' }[a.shape];
	lines.push(`readings = [  # ${unit}`, ...a.rows.map((r) => `    ${tuple(r)},`), ']');
	lines.push(`window = ${tuple(a.window)}  # V, the stretch of V_GS the fit and the design keep to`);
	return lines;
}

function settings(a) {
	const lines = [settingsHeader(), ...modelSettings(a)];
	lines.push(`swing_fraction = ${pyNum(a.swingFraction)}  # the gate's swing, a fraction of ${a.fitted ? "the window's half-width" : '|V_P| / 2'}`);
	if (!a.inverting) lines.push(`target_n = ${pyNum(a.targetModulationIndex)}  # the modulation index asked for`);
	lines.push(
		`source_amplitude = ${pyNum(a.sourceAmplitude)}  # V, the message source`,
		`fm_min = ${pyNum(a.fmMin)}  # Hz, the lowest message frequency`,
		`vcc = ${pyNum(a.vcc)}  # V, the supply (the gate's bias comes from +vcc)`,
		`fp = ${pyNum(a.fp)}  # Hz, the carrier`,
		`carrier_amplitude = ${pyNum(a.carrierAmplitude)}  # V, the carrier source${a.wien ? ' (see below)' : ''}`,
		`carrier_margin = ${pyNum(a.carrierMargin)}  # k, the share of the triode limit the carrier may take`
	);
	if (a.inverting) lines.push(`carrier_buffer = ${a.carrierBuffer === false ? 'False' : 'True'}  # a follower between the divider and the channel`);
	if (a.stage) lines.push(`target_output = ${pyNum(a.targetOutputAmplitude)}  # V, the carrier the output stage brings it up to`);
	lines.push(
		`opamp_swing = ${pyNum(a.opampSwing)}  # V, what the op-amps reach on their rails`,
		`gbw = ${pyEng(a.gbw)}  # Hz, the op-amps' gain-bandwidth`,
		`slew_rate = ${pyEng(a.slewRate)}  # V/s, their slew rate`,
		`fm_preview = ${pyNum(a.fmPreview)}  # Hz, the message tone the plot draws`
	);
	if (a.wien) {
		const w = a.wien;
		lines.push(
			'',
			comment(
				`The carrier comes from the page's Wien bridge (R ${engText(w.r, 'ohm')}, C ${engText(w.c, 'F')}, Rf1 ${engText(w.rf1, 'ohm')}, Rf2 ${engText(w.rf2, 'ohm')}, Rg ${engText(w.rg, 'ohm')}), whose diodes hold it at carrier_amplitude. The bridge is built for these settings, (fp, gbw, slew_rate, opamp_swing); None for a generator of that amplitude:`
			),
			`wien_built_for = (${pyNum(a.fp)}, ${pyEng(a.gbw)}, ${pyEng(a.slewRate)}, ${pyNum(a.opampSwing)})`
		);
	}
	const results = ['vp', 'beta', 'vc', 'half_range', ...(a.fitted ? ['fit'] : []), 'swing', 'depth', 'gain_target', 'bias_target', 'own_parts', 'own_check', 'page_parts', 'page_check'];
	return [lines.join('\n'), stockSettings(a.stock, { caps: 'usual', pairsWhere: a.wien ? 'for the modulator and its Wien bridge together' : 'in the whole modulator' }), resultsComment(results)].join('\n\n');
}

/* --------------------------------------------------------- 1 the JFET's line */

function modelSection(file, a) {
	if (a.mode === 'idss' || a.mode === 'rdson') {
		const idss = a.mode === 'idss';
		file.add(
			[
				comment(
					`In the ohmic region the channel conducts G = 1 / r_DS = beta (V_GS - V_P), a straight line in V_GS that closes at V_P. ${idss ? 'The square law ties its slope to I_DSS: beta = 2 I_DSS / V_P^2.' : 'r_DS(on) is the channel at V_GS = 0, the top of the line: beta = 1 / (r_DS(on) |V_P|).'} With no window measured, the bias sits halfway along it, V_C = V_P / 2, with |V_P| / 2 of room either side.`
				),
				`if not (vp < 0 and ${idss ? 'idss_ma' : 'rds_on'} > 0):`,
				pyRaise(`vp has to be negative and ${idss ? 'idss_ma' : 'rds_on'} positive: see SETTINGS.`, '    '),
				idss ? 'beta = (2 * (idss_ma / 1000)) / (vp * vp)  # S/V' : 'beta = 1 / (rds_on * abs(vp))  # S/V',
				'vc = vp / 2',
				'half_range = abs(vp) / 2',
				`print(f"  beta = ${idss ? '2 I_DSS / V_P^2' : '1 / (r_DS(on) |V_P|)'} = {1000 * beta:.4f} mS/V, V_P = {vp:g} V")`,
				idss
					? 'print(f"  r_DS(on) = 1 / (beta |V_P|) = {eng(1 / (beta * abs(vp)), \'ohm\')}")'
					: 'print(f"  the line implies I_DSS = beta V_P^2 / 2 = {eng(beta * vp * vp / 2, \'A\')}")',
				'print(f"  bias V_C = V_P / 2 = {vc:g} V, half-range {half_range:g} V")'
			].join('\n')
		);
		return;
	}
	const conversion = {
		fixed: [
			'r_DS = vds / I_DS - rs',
			'for vgs, ids_ma in sorted(readings, key=lambda row: row[0]):',
			'    if not ids_ma > 0:',
			'        raise SystemExit(f"The row at V_GS = {vgs} V needs I_DS > 0.")',
			'    rds = vds / (ids_ma / 1000) - rs',
			'    if not rds > 0:',
			'        raise SystemExit(f"The row at V_GS = {vgs} V gives r_DS at or under 0: lower rs.")'
		],
		divider: ['r_DS = R_series V_D / (V_in - V_D)', 'for vgs, vin, vd, r_series in sorted(readings, key=lambda row: row[0]):', '    if not (vin > vd > 0 and r_series > 0):', '        raise SystemExit(f"The row at V_GS = {vgs} V needs V_in > V_D > 0 and R_series > 0.")', '    rds = (r_series * vd) / (vin - vd)'],
		direct: ['r_DS as read', 'for vgs, rds in sorted(readings, key=lambda row: row[0]):', '    if not rds > 0:', '        raise SystemExit(f"The row at V_GS = {vgs} V needs r_DS > 0.")'],
		mixed: [
			'r_DS as read, or R_series V_D / (V_in - V_D) from a divider',
			'for row in sorted(readings, key=lambda row: row[0]):',
			'    vgs = row[0]',
			'    rds = row[1] if len(row) == 2 else (row[3] * row[2]) / (row[1] - row[2])',
			'    if not rds > 0:',
			'        raise SystemExit(f"The row at V_GS = {vgs} V gives no r_DS over 0.")'
		]
	}[a.shape];
	const [formula, ...loop] = conversion;
	file.add(
		[
			comment(
				`Each row gives the channel's resistance, ${formula}, and so its conductance G = 1 / r_DS. In the ohmic region G is a straight line in V_GS,\n    G = beta (V_GS - V_P)\nfitted here by least squares, G = a V_GS + b, over the rows inside the window: beta = a, and V_P = -b / a where the line crosses zero. The design keeps to the window: its middle is the bias V_C, its half-width the most the gate may swing.`
			),
			'low, high = window',
			'points = []  # (V_GS, G) of each row inside the window',
			...loop,
			'    if low <= vgs <= high:',
			'        points.append((vgs, 1 / rds))',
			'count = len(points)',
			'sx = sy = sxx = sxy = 0.0',
			'for v, cond in points:',
			'    sx += v',
			'    sy += cond',
			'    sxx += v * v',
			'    sxy += v * cond',
			'denom = count * sxx - sx * sx',
			'if count < 2 or abs(denom) < 1e-18:',
			pyRaise('Fewer than two gate voltages inside the window: widen it (see SETTINGS).', '    '),
			'a = (count * sxy - sx * sy) / denom',
			'b = (sy - a * sx) / count',
			'if not a > 0:',
			pyRaise('The conductance does not rise with V_GS over the window: check the rows.', '    '),
			'beta, vp = a, -b / a',
			'vc = (low + high) / 2',
			'half_range = (high - low) / 2'
		].join('\n')
	);
	file.add(
		[
			comment('How straight the part is there: R^2, and the largest gap between a row and the line.'),
			'ss_res = ss_tot = max_dev = 0.0',
			'max_dev_at = None',
			'for v, cond in points:',
			'    line = a * v + b',
			'    ss_res += (cond - line) ** 2',
			'    ss_tot += (cond - sy / count) ** 2',
			'    dev = abs(cond - line) / line if line > 0 else 1.0  # (a row the line closes off is all off)',
			'    if dev > max_dev:',
			'        max_dev, max_dev_at = dev, v',
			'fit = {"a": a, "b": b, "r2": 1 - ss_res / ss_tot if ss_tot > 0 else 1.0, "max_dev": max_dev,',
			'       "max_dev_at": max_dev_at, "count": count, "low": low, "high": high}',
			'print(f"  {count} rows inside the window {low:g} V to {high:g} V")',
			'print(f"  G = a V_GS + b: beta = a = {1000 * a:.4f} mS/V, V_P = -b / a = {vp:.4f} V")',
			'print(f"  R^2 = {fit[\'r2\']:.4f}, the largest gap {100 * max_dev:.1f} %"',
			'      + (f" at V_GS = {max_dev_at:g} V" if max_dev_at is not None else ""))',
			'print(f"  implied: I_DSS = beta V_P^2 / 2 = {eng(beta * vp * vp / 2, \'A\')},"',
			'      f" r_DS(on) = 1 / (beta |V_P|) = {eng(1 / (beta * abs(vp)), \'ohm\')}")',
			'print(f"  bias V_C = {vc:g} V, the middle of the window; half-range {half_range:g} V")',
			'if low <= vp:',
			'    print("  the window\'s low edge is at or past V_P: the line says the channel is closed there")',
			'if max_dev > 0.05:',
			'    print("  the conductance is not straight over this window: narrow it, or check that row")'
		].join('\n')
	);
}

/* ------------------------------------------------------ 2 the operating window */

function windowSection(file, a) {
	file.add(
		[
			comment(
				`The gate sits at V_C and swings by swing around it, and G follows:\n    G(V_C + x) = G(V_C) (1 + x / (V_C - V_P))\nso swing / (V_C - V_P) is how far G moves, the depth s${a.inverting ? ': the inverting cell gives n = s.' : ', the ceiling of the modulation index.'}`
			),
			'swing = swing_fraction * half_range  # V',
			'if not vc - swing > vp:',
			pyRaise(`The swing pinches the channel off: lower swing_fraction${a.fitted ? ' or narrow the window' : ''}.`, '    '),
			'depth = swing / (vc - vp)',
			...(a.inverting
				? []
				: ['if not 0 < target_n < depth:', '    raise SystemExit(f"target_n has to stay under the depth s = {depth:.3f}: lower it, or widen "', '                     "the swing.")']),
			'print(f"  swing = {swing_fraction:g} x {half_range:g} V = {swing:.4g} V, V_GS from"',
			'      f" {vc - swing:.4g} V to {vc + swing:.4g} V")',
			a.inverting ? 'print(f"  depth s = swing / (V_C - V_P) = {depth:.4f}")' : 'print(f"  depth s = swing / (V_C - V_P) = {depth:.4f}, over the target n = {target_n:g}")'
		].join('\n')
	);
}

/* --------------------------------------------------------- 3 the gate drive */

function gateSection(file, a) {
	const rules = [
		"The file's own rule for the parts, in the page's order, each from what the parts before it give:",
		`  a. R_f: every stocked value from 4.7 kohm to 47 kohm (the page's range for it); R_ac = R_f / gain and R_bias = R_f vcc / bias, each rounded down or up to the stock, whichever lands its figure closer; of the R_f whose gate drive keeps the channel open${a.inverting ? '' : ' and the depth over the target n'}, the one whose rounded parts land closest (the worse of the two misses), the R_f nearest 10 kohm breaking a tie;`,
		'  b. C: the smallest stocked capacitor at or above 1 / (2 pi R_ac fm_min / 10), the largest when none is (a larger C only lowers the corner);',
		a.inverting ? '  c. R_2: the largest stocked value at or under its ceiling, as the page takes it;' : '  c. R_b: rounded down or up, whichever lands n closer to the target, by ratio as every rounding here (the check then holds n to within 0.05 of it);',
		`  d. the divider: its foot the stocked value nearest 1 kohm, its top rounded up, so that the carrier stays at or under its limit${a.stage ? ';' : '.'}`,
		...(a.stage ? ['  e. R_top: its R_bottom the stocked value nearest 1 kohm, R_top rounded down or up, whichever lands K closer to its target.'] : [])
	];
	file.add(
		[
			comment(
				'One inverting summer drives the gate: the message through C and R_ac, the bias from +vcc through R_bias, R_f in feedback. Its - input is a virtual ground, so nothing loads anything:\n    V_gate = -(R_f / R_ac) x_m(t) - (R_f / R_bias) vcc\nThe swing sets the gain R_f / R_ac, the bias |V_C| sets R_f vcc / R_bias, and C with R_ac is a high-pass whose corner sits a decade under fm_min.'
			),
			'gain_target = swing / source_amplitude',
			'bias_target = abs(vc)  # V',
			'print(f"  gain = swing / source_amplitude = {gain_target:.4g}, bias |V_C| = {bias_target:g} V")',
			comment(rules.join('\n'))
		].join('\n')
	);
	roundingHelpers(file);
	file.add(
		[
			'def gate(p):',
			'    """What the summer of parts p gives the gate: its gain and bias, V_GS\'s range, the depth s and',
			'    the channel\'s resistance at the bias."""',
			'    gain = p["Rf"] / p["Rac"]',
			'    bias = -(p["Rf"] * vcc) / p["Rbias"]',
			'    swing = gain * source_amplitude',
			'    return {"gain": gain, "bias": bias, "vgs_min": bias - swing, "vgs_max": bias + swing,',
			'            "depth": swing / (bias - vp), "r_vc": 1 / (beta * (bias - vp))}'
		].join('\n')
	);
	const open = a.inverting ? 'g["vgs_min"] > vp' : 'g["vgs_min"] > vp and g["depth"] > target_n';
	file.add(
		[
			'tried = [v for v in resistors if 4.7e3 <= v <= 47e3]',
			'choices = []  # (how far the rounded gain and bias land, R_f, R_ac, R_bias)',
			`for rf in tried or [${nearestCode('10e3')}]:`,
			'    rac = closer(rf / gain_target, lambda r: rf / r, gain_target)',
			'    rbias = closer(rf * vcc / bias_target, lambda r: rf * vcc / r, bias_target)',
			'    g = gate({"Rf": rf, "Rac": rac, "Rbias": rbias})',
			`    if ${open}:`,
			'        off = max(abs(math.log(g["gain"] / gain_target)), abs(math.log(-g["bias"] / bias_target)))',
			'        choices.append((off, rf, rac, rbias))',
			'if not choices:',
			pyRaise(`No R_f of the stock gives a gate drive that keeps the channel open${a.inverting ? '' : ' with a depth over target_n'}: lower ${a.inverting ? 'swing_fraction' : 'target_n or swing_fraction'}.`, '    '),
			'least = min(choice[0] for choice in choices)',
			'_, rf, rac, rbias = min((choice for choice in choices if choice[0] <= least + 1e-9),',
			'                        key=lambda choice: abs(math.log(choice[1] / 10e3)))',
			'c_exact = 1 / (2 * math.pi * rac * (fm_min / 10))',
			'c = min((v for v in capacitors if v >= c_exact * (1 - 1e-9)), default=max(capacitors))',
			'own_parts = {"Rf": rf, "Rac": rac, "Rbias": rbias, "C": c}',
			'g = gate(own_parts)',
			'print(f"  R_f = {eng(rf, \'ohm\')}, the closest of {len(choices)} choices:")',
			'print(f"    R_ac = {eng(rf / gain_target, \'ohm\')} -> {eng(rac, \'ohm\')},"',
			'      f" R_bias = {eng(rf * vcc / bias_target, \'ohm\')} -> {eng(rbias, \'ohm\')}")',
			'print(f"  C = {eng(c_exact, \'F\')} -> {eng(c, \'F\')},"',
			'      f" the corner {eng(1 / (2 * math.pi * rac * c), \'Hz\')}")',
			'print(f"  the gate gets gain {g[\'gain\']:.4g} ({100 * (g[\'gain\'] / gain_target - 1):+.1f} %),"',
			'      f" bias {g[\'bias\']:.4g} V ({100 * (-g[\'bias\'] / bias_target - 1):+.1f} %)")',
			'print(f"  V_GS from {g[\'vgs_min\']:.4g} V to {g[\'vgs_max\']:.4g} V, depth s = {g[\'depth\']:.4f},"',
			'      f" r_DS(V_C) = {eng(g[\'r_vc\'], \'ohm\')}")'
		].join('\n')
	);
}

/* ---------------------------------------------------------- 4 the gain cell */

function cellSection(file, a) {
	if (a.inverting) {
		file.add(
			comment(
				`The channel is the input resistor of an inverting amplifier: ${a.carrierBuffer === false ? 'the divider drives the drain with the carrier' : 'the follower copies the carrier onto the drain'}, the source sits on the op-amp's virtual ground and R_2 feeds back, so all the channel's current flows on through R_2:\n    V_out = -R_2 G(V_GS) x_p = -x (1 + s m(t)) x_p,  x = R_2 / r_DS(V_C)\nNo "1 +": n = s whatever x is, and K0 = x. So x is chosen for the op-amp, the largest the gbw rule allows (fp K_max / gbw at most 0.2, K_max = 1 + x (1 + s)), from 0.5 to 10.`
			)
		);
		file.add(
			[
				'def cell(p, g):',
				'    """The gain cell on that gate: x, n, the gain at the bias, the trough and the crest, and the',
				'    channel\'s resistance at the crest."""',
				'    x = p["R2"] / g["r_vc"]',
				'    return {"x": x, "n": g["depth"], "k0": x, "r_min": 1 / (beta * (g["vgs_max"] - vp)),',
				'            "k_min": x * (1 - g["depth"]), "k_max": x * (1 + g["depth"])}'
			].join('\n')
		);
		file.add(
			[
				'x_rule = ((0.2 * gbw) / fp - 1) / (1 + g["depth"])',
				'x_auto = min(10, x_rule if x_rule > 0.5 else 0.5)',
				'r2_max = x_auto * g["r_vc"]',
				'below = [v for v in resistors if v <= r2_max * (1 + 1e-9)]',
				`own_parts["R2"] = max(below) if below else ${nearestCode('r2_max')}`,
				'k = cell(own_parts, g)',
				'print(f"  x = {x_auto:.4g}: R_2 at most {eng(r2_max, \'ohm\')} -> {eng(own_parts[\'R2\'], \'ohm\')}")',
				'print(f"  x = {k[\'x\']:.4f}: n = s = {k[\'n\']:.4f}, K0 = {k[\'k0\']:.4g}, the gain from"',
				'      f" {k[\'k_min\']:.4g} (trough) to {k[\'k_max\']:.4g} (crest)")'
			].join('\n')
		);
		return;
	}
	file.add(
		comment(
				'The channel is the bottom resistor of a non-inverting amplifier, R_b in feedback: the - input follows the carrier x_p, and the channel\'s current flows on through R_b, so\n    V_out = x_p (1 + R_b G(V_GS)),  G = G(V_C) (1 + s m(t))\nWith x = R_b / r_DS(V_C), K0 = 1 + x and n = s x / (1 + x); a target n asks for\n    x = n / (s - n),  R_b = x r_DS(V_C)'
		)
	);
	file.add(
		[
			'def cell(p, g):',
			'    """The gain cell on that gate: x, n, the gain at the bias, the trough and the crest, and the',
			'    channel\'s resistance at the crest."""',
			'    x = p["Rb"] / g["r_vc"]',
			'    r_min = 1 / (beta * (g["vgs_max"] - vp))',
			'    return {"x": x, "n": (g["depth"] * x) / (1 + x), "k0": 1 + x, "r_min": r_min,',
			'            "k_min": 1 + p["Rb"] / (1 / (beta * (g["vgs_min"] - vp))), "k_max": 1 + p["Rb"] / r_min}'
		].join('\n')
	);
	file.add(
		[
			'x_target = target_n / (g["depth"] - target_n)',
			'rb_exact = x_target * g["r_vc"]',
			'own_parts["Rb"] = closer(rb_exact, lambda r: cell({"Rb": r}, g)["n"], target_n)',
			'k = cell(own_parts, g)',
			'print(f"  x = n / (s - n) = {x_target:.4f}, R_b = {eng(rb_exact, \'ohm\')}"',
			'      f" -> {eng(own_parts[\'Rb\'], \'ohm\')}")',
			'print(f"  x = {k[\'x\']:.4f}: n = {k[\'n\']:.4f}, K0 = {k[\'k0\']:.4g}, the gain from {k[\'k_min\']:.4g}"',
			'      f" (trough) to {k[\'k_max\']:.4g} (crest)")'
		].join('\n')
	);
}

/* ------------------------------------------------------- 5 the carrier path */

function carrierSection(file, a) {
	const fb = a.inverting ? 'R2' : 'Rb';
	const limits = "Two limits: the triode region, V_DS under V_GS - V_P at the gate's lowest (k of it), and the op-amp's swing at the crest, K_max A_c. A divider brings the source down to the lower one";
	file.add(
		comment(
			a.inverting
				? `The carrier sits on the drain and the source at 0 V, so the carrier A_c is the channel's V_DS. ${limits}; ${a.carrierBuffer === false ? 'it drives the drain itself (see below).' : "it drives the follower's + input, which draws no current, so its ratio is exact."}`
				: `The op-amp copies the carrier onto the - input, where the drain sits, so the carrier A_c is the channel's V_DS. ${limits}; it drives the + input, which draws no current, so its ratio is exact.`
		)
	);
	file.add(
		[
			'def carrier_limit(g, k):',
			'    """The most carrier the channel takes: k of V_GS,min - V_P, or opamp_swing / K_max."""',
			'    return min(carrier_margin * (g["vgs_min"] - vp), opamp_swing / k["k_max"])',
			'',
			'',
			'def carrier(p, g, k):',
			'    """The carrier the divider of p puts on the channel, its limit, and what comes out of the',
			'    cell: the carrier at the bias, the envelope\'s two ends, the current through the channel at',
			'    the crest and the V_DS^2 term\'s tone at 2 fp."""',
			'    ac = (carrier_amplitude * p["Rdb"]) / (p["Rdt"] + p["Rdb"])',
			'    return {"limit": carrier_limit(g, k), "ac": ac, "out": k["k0"] * ac, "env_max": k["k_max"] * ac,',
			'            "env_min": k["k_min"] * ac, "current": ac / k["r_min"],',
			`            "tone_2fp": (p["${fb}"] * beta * ac * ac) / 4}`
		].join('\n')
	);
	file.add(
		[
			'limit = carrier_limit(g, k)',
			'ratio = min(1.0, limit / carrier_amplitude)',
			`foot = ${nearestCode('1e3')}`,
			'top = 0.0  # (no divider when the source is already under the limit)',
			'if ratio < 1:',
			'    top_exact = foot * (1 / ratio - 1)',
			'    top = min((v for v in resistors if v >= top_exact * (1 - 1e-9)), default=max(resistors))',
			'    if top < top_exact * (1 - 1e-9):  # (nothing that large: a smaller foot under the largest)',
			'        foot = max((v for v in resistors if v <= top / (1 / ratio - 1) * (1 + 1e-9)), default=foot)',
			'own_parts.update({"Rdt": top, "Rdb": foot})',
			'car = carrier(own_parts, g, k)',
			'print(f"  the limit: k (V_GS,min - V_P) = {eng(carrier_margin * (g[\'vgs_min\'] - vp), \'V\')},"',
			'      f" the op-amp\'s {opamp_swing:g} V / K_max = {eng(opamp_swing / k[\'k_max\'], \'V\')}")',
			'if top:',
			'    print(f"  the divider: {eng(top, \'ohm\')} over {eng(foot, \'ohm\')} (its top at least"',
			'          f" {eng(foot * (1 / ratio - 1), \'ohm\')})")',
			'print(f"  A_c = {eng(car[\'ac\'], \'V\')} on the channel, {eng(car[\'out\'], \'V\')} out; the envelope from"',
			'      f" {eng(car[\'env_min\'], \'V\')} to {eng(car[\'env_max\'], \'V\')}")',
			'print(f"  {eng(car[\'current\'], \'A\')} through the channel at the crest; the V_DS^2 term adds"',
			'      f" {eng(car[\'tone_2fp\'], \'V\')} at 2 fp")'
		].join('\n')
	);
	if (a.inverting) {
		file.add(
			comment(
				"The channel is the input resistor, so whatever drives it adds to r_DS: the gain becomes R_2 / (r_DS + Z_s), which presses the crest down. The follower drives it from about 5 ohm; without it, the divider's own resistance does."
			)
		);
		file.add(
			[
				'def source_z(p, follower):',
				'    """What drives the channel: the follower\'s 5 ohm, or without it the divider of p."""',
				'    if follower:',
				'        return 5.0',
				'    return (p["Rdt"] * p["Rdb"]) / (p["Rdt"] + p["Rdb"]) if p["Rdt"] > 0 else 0.0'
			].join('\n')
		);
	}
}

/** loss(), the single-pole op-amp's share of the carrier at a noise gain, written once. */
function lossHelper(file) {
	file.once(
		'loss',
		[
			'def loss(gain):',
			'    """What a stage of noise gain `gain` keeps of the carrier, its op-amp a single pole."""',
			'    r = (fp * gain) / gbw',
			'    return 1 / math.sqrt(1 + r * r)'
		].join('\n')
	);
}

/* ------------------------------------------------------- 6 the output stage */

function stageSection(file, a) {
	file.add(
		comment(
				`A fixed non-inverting stage after the cell brings the carrier up to target_output, K = 1 + R_top / R_bottom, when it is more than 5 % short. Its gain does not move with the message, so its loss at the carrier is the same at the crest and in the trough: it sets the level and leaves the envelope alone. ${a.inverting ? 'The inverting cell has one whenever its small output needs it.' : ''}`.trim()
		)
	);
	lossHelper(file);
	file.add(
		[
			'def stage(p, car):',
			'    """The output stage of p (none when p has no R_top): its gain, what it keeps at the carrier,',
			'    the carrier it gives and the envelope\'s peak."""',
			'    if "Rtop" not in p:',
			'        return {"k": 1.0, "kept": 1.0, "out": car["out"], "peak": car["env_max"]}',
			'    k = 1 + p["Rtop"] / p["Rbottom"]',
			'    return {"k": k, "kept": loss(k), "out": k * car["out"] * loss(k), "peak": k * car["env_max"]}'
		].join('\n')
	);
	file.add(
		[
			'k_target = target_output / car["out"]',
			'if k_target > 1.05:',
			`    rbottom = ${nearestCode('1e3')}`,
			'    rtop = closer((k_target - 1) * rbottom, lambda r: 1 + r / rbottom, k_target)',
			'    own_parts.update({"Rtop": rtop, "Rbottom": rbottom})',
			'    st = stage(own_parts, car)',
			'    print(f"  K = target_output / {eng(car[\'out\'], \'V\')} = {k_target:.4g}: R_top ="',
			'          f" {eng((k_target - 1) * rbottom, \'ohm\')} -> {eng(rtop, \'ohm\')}"',
			'          f" over {eng(rbottom, \'ohm\')}")',
			'    print(f"  K = {st[\'k\']:.4g}, {st[\'kept\']:.4f} of it kept at fp: {eng(st[\'out\'], \'V\')} out, the"',
			'          f" envelope up to {eng(st[\'peak\'], \'V\')}")',
			'else:',
			'    print(f"  the cell already gives {eng(car[\'out\'], \'V\')}, near enough target_output: no stage")'
		].join('\n')
	);
}

/* ------------------------------------------------------ the op-amp at the carrier */

function opampSection(file, a) {
	file.add(
		comment(
			`The cell's noise gain moves with the message, K(m) = 1 + x (1 + s m), and a stage of noise gain K keeps 1 / sqrt(1 + (fp K / gbw)^2) of the carrier: least at the crest, which flattens the envelope.${a.inverting ? ' The source impedance presses the crest too, so both go into the envelope.' : ''} Its harmonics give the index a scope reads and the distortion a demodulator gets back.`
		)
	);
	lossHelper(file);
	file.add(
		[
			'def envelope_stats(envelope):',
			'    """The index a scope reads off envelope(m), m = cos(theta) over one message cycle, and the',
			'    distortion a perfect demodulator recovers: harmonics 2 to 10 over the fundamental."""',
			'    e = [envelope(math.cos((2 * math.pi * i) / 512)) for i in range(512)]',
			'',
			'    def harmonic(h):',
			'        re = im = 0.0',
			'        for i, v in enumerate(e):',
			'            re += v * math.cos((2 * math.pi * h * i) / 512)',
			'            im -= v * math.sin((2 * math.pi * h * i) / 512)',
			'        return math.hypot(re, im) / 512',
			'',
			'    rest = 0.0',
			'    for h in range(2, 11):',
			'        rest += harmonic(h) ** 2',
			'    crest, trough = envelope(1), envelope(-1)',
			'    return {"n": (crest - trough) / (crest + trough), "crest": crest, "trough": trough,',
			'            "thd": math.sqrt(rest) / harmonic(1)}',
			'',
			'',
			'def opamp(p, g, k, car):',
			'    """The cell\'s op-amp at the carrier: its noise gain at the trough, the bias and the crest,',
			'    what it keeps of each, the envelope it delivers (its index, read off the envelope and off the',
			'    peaks the V_DS^2 term lifts, and its distortion), fp K_max / gbw and the slew it asks."""',
			'    s, x = g["depth"], k["x"]',
			...(a.inverting
				? [
						'    z_g = source_z(p, carrier_buffer) * beta * (g["bias"] - vp)',
						'    stats = envelope_stats(lambda m: (x * (1 + s * m)) / (1 + z_g * (1 + s * m))',
						'                           * loss(1 + x * (1 + s * m)))'
					]
				: ['    stats = envelope_stats(lambda m: (1 + x * (1 + s * m)) * loss(1 + x * (1 + s * m)))']),
			'    noise = [1 + x * (1 + s * m) for m in (-1, 0, 1)]',
			'    lifted = (4 * car["tone_2fp"]) / car["ac"]',
			// (the summer and the cell, the follower where there is one, the output stage where p has one)
			`    count = 2${a.inverting ? ' + carrier_buffer' : ''}${a.stage ? ' + ("Rtop" in p)' : ''}  # the summer, the cell${a.inverting ? ', the follower' : ''}${a.stage ? ', the stage' : ''}`,
			'    return {"noise": noise, "kept": [loss(gain) for gain in noise], "n_eff": stats["n"],',
			'            "n_peaks": (stats["crest"] - stats["trough"])',
			'            / (stats["crest"] + stats["trough"] + lifted), "thd": stats["thd"],',
			'            "gbw_ratio": (fp * noise[2]) / gbw, "slew": 2 * math.pi * fp * car["env_max"],',
			'            "opamps": count}'
		].join('\n')
	);
	file.add(
		[
			...(a.inverting
				? [
						's, x = g["depth"], k["x"]',
						'for follower in (True, False):  # (the source impedance alone, as the page compares them)',
						'    z_g = source_z(own_parts, follower) * beta * (g["bias"] - vp)',
						'    alone = envelope_stats(lambda m: (x * (1 + s * m)) / (1 + z_g * (1 + s * m)))',
						'    print(f"  driven {\'by the follower\' if follower else \'by the divider\'} from"',
						'          f" {eng(source_z(own_parts, follower), \'ohm\')}: n effective {alone[\'n\']:.4f},"',
						'          f" THD {100 * alone[\'thd\']:.2f} %")'
					]
				: []),
			'op = opamp(own_parts, g, k, car)',
			'print("  K = " + " / ".join(f"{v:.4g}" for v in op["noise"]) + " (trough / bias / crest), keeping "',
			'      + " / ".join(f"{v:.4f}" for v in op["kept"]))',
			'print(f"  n effective {op[\'n_eff\']:.4f} (designed {k[\'n\']:.4f}), read off the peaks"',
			'      f" {op[\'n_peaks\']:.4f}; THD {100 * op[\'thd\']:.2f} %")',
			'print(f"  fp K_max / gbw = {op[\'gbw_ratio\']:.3f}; the slew {op[\'slew\'] / 1e6:.3g} V/us of"',
			'      f" {slew_rate / 1e6:g} V/us")',
			...(a.wien
				? [
						'wien = 0 if wien_built_for is None else 1  # (the Wien oscillator, when it gives the carrier)',
						'print(f"  {op[\'opamps\'] + wien} op-amps in the modulator (the gate-drive summer"',
						'      + (" and the Wien oscillator" if wien else "") + " included)")'
					]
				: ['print(f"  {op[\'opamps\']} op-amps in the modulator (the gate-drive summer included)")'])
		].join('\n')
	);
}

/* ------------------------------------------------------------------ the check */

function checkSection(file, a, last) {
	const fb = a.inverting ? 'R2' : 'Rb';
	const parts = ['Rf', 'Rac', 'Rbias', 'C', fb, 'Rdt', 'Rdb', ...(a.page.Rtop ? ['Rtop', 'Rbottom'] : [])];
	const page = Object.fromEntries(parts.map((name) => [name, a.page[name]]));
	const words = [
		'the carrier at or under its limit',
		"the gate's lowest voltage within the op-amp's swing",
		'the corner at most fm_min / 3',
		'fp K_max / gbw at most 0.2',
		"the slew at most half the op-amp's",
		'at most 10 mA through the channel',
		...(a.inverting ? ['the follower in place where a divider drives the channel'] : []),
		...(a.stage ? ["the output stage's envelope within the swing, its slew at most half the op-amp's"] : [])
	];
	const checks = [
		...(a.inverting ? [] : ['"n": abs(k["n"] - target_n) <= 0.05']),
		'"carrier": car["ac"] <= car["limit"] * (1 + 1e-9)',
		'"gate swing": abs(g["vgs_min"]) <= opamp_swing',
		'"corner": fc <= fm_min / 3',
		'"gbw rule": op["gbw_ratio"] <= 0.2',
		'"slew": op["slew"] <= slew_rate / 2',
		'"current": car["current"] <= 0.01',
		...(a.inverting ? ['"follower": carrier_buffer or p["Rdt"] == 0'] : []),
		...(a.stage ? ['"stage swing": st["peak"] <= opamp_swing', '"stage slew": 2 * math.pi * fp * st["peak"] <= slew_rate / 2'] : [])
	];
	const cells = [
		'f"{g[\'gain\']:.4g}"',
		'eng(g["bias"], "V")',
		'eng(fc, "Hz")',
		'f"{k[\'n\']:.4f}"',
		'f"{eng(car[\'ac\'], \'V\')} of {eng(car[\'limit\'], \'V\')}"',
		'eng(car["out"], "V")',
		...(a.stage ? ['f"{st[\'k\']:.4g}"', 'eng(st["out"], "V")'] : []),
		'f"{op[\'n_eff\']:.4f}, {100 * op[\'thd\']:.2f} %"',
		'f"{op[\'gbw_ratio\']:.3f}"',
		'f"{op[\'slew\'] / 1e6:.3g} V/us"',
		'eng(g["vgs_min"], "V")',
		'eng(car["current"], "A")',
		'"meets" if not misses else f"misses {len(misses)}"'
	];
	const rows = [
		'f"gate gain, target {gain_target:.4g}"',
		'f"gate bias, target {-bias_target:g} V"',
		'f"corner, at most {eng(fm_min / 3, \'Hz\')}"',
		a.inverting ? '"n = s"' : 'f"n, target {target_n:g}"',
		'"A_c on the channel"',
		'"carrier out of the cell"',
		...(a.stage ? ['f"output stage K, for {target_output:g} V"', '"carrier at the output"'] : []),
		'"n effective, THD"',
		'"fp K_max / gbw, at most 0.2"',
		'f"slew, at most {slew_rate / 2e6:g} V/us"',
		'f"lowest gate voltage, within {opamp_swing:g} V"',
		'"peak current, at most 10 mA"',
		'"verdict"'
	];
	const advice = [
		...(a.inverting ? [] : [['n', 'n: a finer stock lands R_b, and so n, closer to the target.']]),
		['carrier', 'The carrier: a larger R_dt or a smaller carrier_amplitude keeps it in its limit.'],
		['gate swing', 'The gate swing: wider rails or a JFET of smaller |V_P| let the summer reach it.'],
		['corner', 'The corner: a larger capacitor brings it under fm_min / 3.'],
		['gbw rule', a.inverting ? 'The gbw rule: a faster op-amp or a lower carrier meets it.' : 'The gbw rule: a lower target n, a faster op-amp or a lower carrier meets it.'],
		['slew', 'The slew: a lower carrier amplitude or frequency brings it back.'],
		['current', 'The current: a smaller carrier_margin, or a JFET of lower I_DSS, lowers it.'],
		...(a.inverting ? [['follower', 'The follower: carrier_buffer = True drives the channel from 5 ohm.']] : []),
		...(a.stage ? [['stage swing', "The stage's swing: a lower target_output keeps its crest within the swing."], ['stage slew', "The stage's slew: a lower target_output or carrier brings it back."]] : [])
	];
	const why = a.stock.pairs
		? 'the page builds some resistors of two in series, the file\'s rule keeps to single values'
		: 'the page rounds each resistor to its nearest value and picks R_f on the sum of the two roundings, the file\'s rule on the worse one';
	file.add(
		comment(
			`Each set of parts goes through the same steps, 3 to ${last}, and the checks the page makes: ${words.join(', ')}.${a.inverting ? '' : " The file adds its own check of n, within 0.05 of the target, the tolerance the page holds the diode modulator's index to."}`
		)
	);
	file.add(pageParts(page, a.stock, { note: a.limitNote }));
	file.add(
		[
			'def check(name, p):',
			'    """A set of parts through the steps above: its figures, its checks (True when met), the',
			'    verdict and its cells in the table below."""',
			'    g = gate(p)',
			'    if not g["vgs_min"] > vp:',
			'        raise SystemExit(f"With these settings {name} pinch the channel off: get the file again.")',
			'    k = cell(p, g)',
			'    car = carrier(p, g, k)',
			...(a.stage ? ['    st = stage(p, car)'] : []),
			'    op = opamp(p, g, k, car)',
			'    fc = 1 / (2 * math.pi * p["Rac"] * p["C"])',
			flow('    checks = {', checks, '}'),
			'    misses = [key for key, ok in checks.items() if not ok]',
			flow('    cells = [', cells, ']'),
			'    return {"gain": g["gain"], "bias": g["bias"], "depth": g["depth"], "fc": fc, **k, **car,',
			`            **op,${a.stage ? ' "stage": st,' : ''} "checks": checks, "misses": misses, "meets": not misses,`,
			'            "cells": cells}'
		].join('\n')
	);
	sayHelper(file);
	file.add(
		[
			'own_check = check("the file\'s parts", own_parts)',
			'page_check = check("the page\'s parts", page_parts)',
			'sets = [("the file\'s parts", own_check), ("the page\'s parts", page_check)]',
			'for name, p in [("the file\'s parts", own_parts), ("the page\'s parts", page_parts)]:',
			'    say(f"  {name}:", [f"{key} {eng(v, \'F\' if key == \'C\' else \'ohm\')}" for key, v in p.items()])',
			tableCode(rows, 36),
			'if own_check["meets"] and page_check["meets"]:',
			'    print("  Both sets meet every check.")',
			'elif own_check["meets"]:',
			'    print("  The file\'s parts meet every check where the page\'s miss "',
			'          + ", ".join(page_check["misses"]) + ": the two rules round the parts apart.")',
			'elif page_check["meets"]:',
			'    print("  The file\'s parts miss " + ", ".join(own_check["misses"]) + " where the page\'s meet:")',
			pyPrints(`${why}.`, '    '),
			'missed = own_check["misses"] + page_check["misses"]',
			adviceCode(advice)
		].join('\n')
	);
}

/* ------------------------------------------------------------------- the plot */

function plotSection(file, a) {
	const out = a.stage ? 'chk["stage"]["out"]' : 'chk["out"]';
	file.add(comment('What the modulator delivers for a fm_preview tone, the crest loss included: drawn only when matplotlib is installed, otherwise a short table of the envelope.'));
	file.add(
		[
			'def envelope_at(chk, t):',
			'    """The envelope of the set checked as chk at time t: its carrier, moved by n effective."""',
			`    return ${out} * (1 + chk["n_eff"] * math.cos(2 * math.pi * fm_preview * t))`,
			'',
			'',
			'try:',
			'    import matplotlib.pyplot as plt',
			'except ImportError:',
			'    plt = None',
			'if plt is None:',
			'    print("The envelope over one message cycle, in V (pip install matplotlib draws the wave):")',
			'    print("        t (ms)" + "".join(f"{name:>19}" for name, _ in sets))',
			'    for i in range(5):',
			'        t = i / (4 * fm_preview)',
			'        print(f"  {1e3 * t:12.4g}" + "".join(f"{envelope_at(chk, t):19.4f}" for _, chk in sets))',
			'else:',
			'    t = [4 / fm_preview * i / 3999 for i in range(4000)]',
			'    fig, axes = plt.subplots(len(sets), 1, sharex=True)',
			'    for ax, (name, chk) in zip(axes, sets):',
			'        wave = [envelope_at(chk, x) * math.cos(2 * math.pi * fp * x) for x in t]',
			'        ax.plot([1e3 * x for x in t], wave, linewidth=0.6)',
			'        ax.set_title(f"{name}: n = {chk[\'n_eff\']:.3f}", fontsize=10)',
			'        ax.set_ylabel("output (V)")',
			'    axes[-1].set_xlabel("time (ms)")',
			'    plt.show()'
		].join('\n')
	);
}

/** jfet-am-modulator.py for the design on the page (see the header above). */
export function jfetFile(raw) {
	const a = jfetArgs(raw);
	const file = new PyFile();
	file.imports.add('math');
	file.add(
		docstring({
			what: a.inverting ? "JFET AM modulator: the JFET's channel as the input resistor of an inverting gain cell." : "JFET AM modulator: the JFET's channel as the bottom resistor of a non-inverting gain cell.",
			steps: "from the JFET's line to the op-amp's limits at the carrier",
			name: 'jfet-am-modulator.py',
			plot: 'the AM wave'
		})
	);
	file.add(settings(a));
	engHelper(file);
	if (a.wien) {
		file.add(
			[
				'if wien_built_for is not None and wien_built_for != (fp, gbw, slew_rate, opamp_swing):',
				'    raise SystemExit("carrier_amplitude is what the page\'s Wien bridge gives for wien_built_for: "',
				'                     "get the file again from the page, or set wien_built_for = None.")'
			].join('\n')
		);
	}
	file.add(section("1 The JFET's line"));
	modelSection(file, a);
	file.add(section('2 The operating window'));
	windowSection(file, a);
	file.add(section('3 The gate drive'));
	gateSection(file, a);
	file.add(section('4 The gain cell'));
	cellSection(file, a);
	file.add(section('5 The carrier path'));
	carrierSection(file, a);
	let at = 6;
	if (a.stage) {
		file.add(section(`${at++} The output stage`));
		stageSection(file, a);
	}
	file.add(section(`${at++} The op-amp at the carrier`));
	opampSection(file, a);
	file.add(section(`${at} The check`));
	checkSection(file, a, at - 1);
	file.add(header('AM wave'));
	plotSection(file, a);
	return file.text();
}
