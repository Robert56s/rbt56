import { comment, pyRaise } from '../../filter/python/emit';
import { neighboursHelper } from './shared';
import { capacitorCandidates } from '../eseries';
import { butterworthOrder, butterworthStages, chebyshevOrder, chebyshevStages, transitionRatio } from '../order';

/**
 * The demodulator's envelope low-pass (envelopeFilter.js): its order, its
 * normalized poles and stage targets (Butterworth or Chebyshev, even orders
 * only), the file's own rule for each stage's parts, and the gain of a set
 * of stages. The stages are of one topology:
 *   sallen_key  unity-gain Sallen-Key; the page builds R1 = R2 and rounds
 *               Ctop around 4 Q^2 Cbottom, the file's rule lets R1 and R2
 *               differ, which reaches the Q exactly from any pair at or past
 *               that ratio (the pairs of the highest ratio with R1 = R2 where
 *               none reaches it, written only where a stage needs them)
 *   mfb         MFB of gain -1, R1 = R3 kept equal through the rounding
 * The rule is the filter's (filter/python/parts.js): every capacitor pair
 * of the stock, the resistors from the formulas, each rounding down or up
 * tried, the choice that lands closest kept from those within the page's
 * limits (resistors over 200 ohm and under 2 Mohm), the resistors nearest
 * 10 kohm breaking a tie to 1e-9.
 */

/** The Python circuit of each page topology, and its words. */
export const CIRCUITS = { sallenKey: 'sallen_key', mfb: 'mfb' };
export const CIRCUIT_WORDS = { sallen_key: 'Sallen-Key low-pass of gain 1', mfb: 'MFB low-pass of gain -1' };

/** The stage targets the page's design has for a spec: { n, minOrder, stages: [{ wn, q }] }, as envelopeFilter.js. */
export function envelopeTargets({ response, amaxDb, aminDb, fp, fs, order }) {
	const k = transitionRatio(fp, fs);
	const aminSized = response === 'chebyshev' ? aminDb + amaxDb : aminDb;
	const minOrder = response === 'chebyshev' ? chebyshevOrder(amaxDb, aminSized, k) : butterworthOrder(amaxDb, aminDb, k);
	const n = Math.max(2, 2 * Math.ceil((order ?? minOrder) / 2));
	const proto = response === 'chebyshev' ? chebyshevStages(n, amaxDb) : butterworthStages(n);
	const eps = Math.sqrt(10 ** (amaxDb / 10) - 1);
	const wc = 2 * Math.PI * fp * (response === 'chebyshev' ? 1 : eps ** (-1 / n));
	return { n, minOrder, stages: proto.stages.map((s) => ({ wn: wc * Math.sqrt(s.b), q: Math.sqrt(s.b) / s.a })) };
}

/**
 * Whether the Sallen-Key rule of a design needs its fallback: a stage none
 * of whose capacitor pairs reaches Ctop >= 4 Q^2 Cbottom (a pair close to it
 * counts as short, so the file's arithmetic never falls on the other side).
 */
export function sallenKeyFallback(stages, capacitors) {
	const caps = capacitors ?? capacitorCandidates(null);
	return stages.some((st) => !caps.some((ctop) => caps.some((cbottom) => ctop / cbottom > 4 * st.q * st.q * (1 + 1e-6))));
}

/** Section "the order". */
export function orderSection(file, a) {
	const cheb = a.response === 'chebyshev';
	file.add(
		[
			comment(
				cheb
					? 'Chebyshev ripples over the passband and falls fastest past it:\n    n >= acosh(sqrt((10^(A/10) - 1) / (10^(amax/10) - 1))) / acosh(1 / k)\nEach stage has a gain of 1 in size at DC, so an even order, whose DC sits in a ripple valley, peaks amax above it: for the ripple to end up amin under every part of the message, the order is sized for A = amin + amax. Second-order stages only, so the order is even, at least 2; the page builds 8 at most.'
					: 'Butterworth loses 10 log10(1 + eps^2 (f / fm_max)^(2n)) with eps^2 = 10^(amax/10) - 1, and reaches amin at fs when\n    n >= log10((10^(amin/10) - 1) / (10^(amax/10) - 1)) / (2 log10(1 / k))\nSecond-order stages only, so the order is even, at least 2; the page builds 8 at most.'
			),
			...(cheb
				? ['ratio = (10 ** ((amin + amax) / 10) - 1) / (10 ** (amax / 10) - 1)', 'n_exact = math.acosh(math.sqrt(ratio)) / math.acosh(1 / k)']
				: ['ratio = (10 ** (amin / 10) - 1) / (10 ** (amax / 10) - 1)', 'n_exact = math.log10(ratio) / (2 * math.log10(1 / k))']),
			'n = max(2, 2 * math.ceil((n_exact if order is None else order) / 2))',
			'if n > 8:',
			pyRaise('That needs more than 8 poles, more stages than a demodulator should carry: lower amin, raise amax, or move the carrier further from the message.', '    '),
			'said = "one stage" if n == 2 else f"{n // 2} stages"',
			'if order is None:',
			'    print(f"  n >= {n_exact:.4f}, so n = {n}: {said}")',
			'else:',
			'    print(f"  n >= {n_exact:.4f} would do; the order set gives n = {n}: {said}")'
		].join('\n')
	);
}

/** Section "the poles and the stages". */
export function polesSection(file, a) {
	const cheb = a.response === 'chebyshev';
	file.add(
		[
			comment(
				cheb
					? 'The poles of Chebyshev lie on an ellipse: at theta_i = (2i + 1) pi / (2n), with beta = asinh(1 / eps) / n,\n    sigma = -sinh(beta) sin(theta_i),  omega = cosh(beta) cos(theta_i)\nso each pair is a stage s^2 + a s + b, a = -2 sigma, b = sigma^2 + omega^2. The prototype is normalized to the ripple\'s edge, so wc = 2 pi fm_max, and each stage has w0 = wc sqrt(b), Q = sqrt(b) / a.'
					: "The poles of Butterworth lie on the unit circle, at theta_i = (2i + 1) pi / (2n) from the imaginary axis: each pair is a stage s^2 + 2 sin(theta_i) s + 1. Its circle's radius moves to eps^(-1/n) to lose exactly amax at fm_max, so wc = 2 pi fm_max eps^(-1/n), and each stage has w0 = wc, Q = 1 / (2 sin(theta_i))."
			),
			'eps = math.sqrt(10 ** (amax / 10) - 1)',
			...(cheb
				? [
						'beta = math.asinh(1 / eps) / n',
						'wc = 2 * math.pi * fm_max  # rad/s',
						'stages = []  # the target of each stage: w0 in rad/s, Q',
						'for i in range(n // 2):',
						'    theta = ((2 * i + 1) * math.pi) / (2 * n)',
						'    sigma, omega = -math.sinh(beta) * math.sin(theta), math.cosh(beta) * math.cos(theta)',
						'    a, b = -2 * sigma, sigma * sigma + omega * omega',
						'    stages.append({"w0": wc * math.sqrt(b), "q": math.sqrt(b) / a})'
					]
				: [
						'wc = 2 * math.pi * fm_max * eps ** (-1 / n)  # rad/s',
						'stages = []  # the target of each stage: w0 in rad/s, Q',
						'for i in range(n // 2):',
						'    theta = ((2 * i + 1) * math.pi) / (2 * n)',
						'    stages.append({"w0": wc, "q": 1 / (2 * math.sin(theta))})'
					]),
			'for i, st in enumerate(stages):',
			'    print(f"  stage {i + 1}: f0 = {eng(st[\'w0\'] / (2 * math.pi), \'Hz\')}, Q = {st[\'q\']:.4f}")',
			...(a.topology === 'mfb'
				? [
						'print("  the gain at DC is", (-1) ** (n // 2), "(-1 per MFB stage), so the message comes out")',
						'print("    " + ("upside down, its level negative" if (n // 2) % 2 else "upright"))'
					]
				: [])
		].join('\n')
	);
}

/** The Python of a circuit's choices and figures. */
function circuitCode(circuit, fallback) {
	if (circuit === 'mfb') {
		return [
			'def choices(st):',
			'    """MFB low-pass of gain -1, for each pair of the stock with C1 >= 8 Q^2 C2 (real resistors):',
			'    x = 1 / R1 = 1 / R3 and y = 1 / R2 solve 2x + y = a C1 and x y = w0^2 C1 C2, a = w0 / Q,',
			'    both roots."""',
			'    w0, a = st["w0"], st["w0"] / st["q"]',
			'    for c1, c2 in itertools.product(capacitors, capacitors):',
			'        disc = (a * c1) ** 2 - 8 * w0 * w0 * c1 * c2',
			'        if disc < 0:',
			'            continue',
			'        for x in ((a * c1 + math.sqrt(disc)) / 4, (a * c1 - math.sqrt(disc)) / 4):',
			'            yield {"R1": 1 / x, "R2": 1 / (a * c1 - 2 * x), "R3": 1 / x, "C1": c1, "C2": c2}',
			'',
			'',
			'def figures(p):',
			'    """w0 (rad/s) and Q of an MFB low-pass."""',
			'    w0 = 1 / math.sqrt(p["R2"] * p["R3"] * p["C1"] * p["C2"])',
			'    return {"w0": w0, "q": w0 / ((1 / p["R1"] + 1 / p["R2"] + 1 / p["R3"]) / p["C1"])}'
		].join('\n');
	}
	return [
		'def choices(st):',
		'    """Sallen-Key low-pass of gain 1, for each pair of the stock with Ctop >= 4 Q^2 Cbottom: R1 and',
		'    R2 add up to 1 / (w0 Q Cbottom) and multiply to 1 / (w0^2 Ctop Cbottom), the two roots of',
		`    R^2 - total R + product = 0; swapped, they give the same stage.${fallback ? ' With no pair that high,' : '"""'}`,
		...(fallback ? ['    the pairs of the highest ratio take R1 = R2, which sets w0, and Q falls short."""'] : []),
		'    w0 = st["w0"]',
		...(fallback ? ['    pairs = list(itertools.product(capacitors, capacitors))', '    exact = False', '    for ctop, cbottom in pairs:'] : ['    for ctop, cbottom in itertools.product(capacitors, capacitors):']),
		'        total = 1 / (w0 * st["q"] * cbottom)  # R1 + R2',
		'        disc = total * total - 4 / (w0 * w0 * ctop * cbottom)',
		'        if disc < 0:',
		'            continue',
		...(fallback ? ['        exact = True'] : []),
		'        r1 = (total + math.sqrt(disc)) / 2',
		'        yield {"R1": r1, "R2": total - r1, "Ctop": ctop, "Cbottom": cbottom}',
		...(fallback
			? [
					'    if not exact:',
					'        top = max(ctop / cbottom for ctop, cbottom in pairs)',
					'        print(f"  the stage at {eng(w0 / (2 * math.pi), \'Hz\')} needs Ctop / Cbottom >= 4 Q^2 ="',
					'              f" {4 * st[\'q\'] ** 2:.4g}, its capacitors reach {top:.4g}:")',
					'        print("  R1 = R2 there, and Q falls short")',
					'        for ctop, cbottom in pairs:',
					'            if ctop / cbottom == top:',
					'                r = 1 / (w0 * math.sqrt(ctop * cbottom))',
					'                yield {"R1": r, "R2": r, "Ctop": ctop, "Cbottom": cbottom}'
				]
			: []),
		'',
		'',
		'def figures(p):',
		'    """w0 (rad/s) and Q of a Sallen-Key low-pass of gain 1."""',
		'    w0 = 1 / math.sqrt(p["R1"] * p["R2"] * p["Ctop"] * p["Cbottom"])',
		'    return {"w0": w0, "q": 1 / (w0 * (p["R1"] + p["R2"]) * p["Cbottom"])}'
	].join('\n');
}

/** Section "the parts of each stage": the file's own rule. */
export function partsSection(file, a, { fallback }) {
	const circuit = CIRCUITS[a.topology] ?? 'sallen_key';
	const mfb = circuit === 'mfb';
	file.add(
		[
			comment(
				[
					`The file's own rule, stage by stage, each a ${CIRCUIT_WORDS[circuit]}:`,
					`  a. every pair of capacitors of the stock the circuit allows is tried, and its formulas give the resistors${mfb ? ' (R1 = R3, which sets the gain at -1)' : ''};`,
					'  b. every choice is rounded as c says, and the one whose rounded parts land closest to its exact ones is kept, from those within the page\'s limits (every resistor over 200 ohm and under 2 Mohm), else from all, flagged; the resistors nearest 10 kohm break a tie, such as two choices a decade apart;',
					`  c. each resistor is rounded down or up to the stock${mfb ? ' (R3 with R1)' : ''}, keeping the combination whose f0 and Q land closest to the exact parts'.`
				].join('\n')
			),
			'R_MIN, R_MAX = 200.0, 2e6  # ohm, the page\'s limits on the resistors'
		].join('\n')
	);
	file.add(circuitCode(circuit, fallback));
	file.add(
		[
			'def within(p):',
			'    """Rule b: every resistor over R_MIN and under R_MAX."""',
			'    return all(R_MIN < v < R_MAX for name, v in p.items() if name[0] == "R")',
			'',
			'',
			'def level(p):',
			'    """Rule b\'s tie: how far the resistors sit from 10 kohm, the mean of ln(R / 10 kohm)^2."""',
			'    values = [v for name, v in p.items() if name[0] == "R"]',
			'    return sum(math.log(v / 10e3) ** 2 for v in values) / len(values)'
		].join('\n')
	);
	neighboursHelper(file);
	file.add(
		[
			'def miss(got, want):',
			'    """How far a stage\'s figures land from others: the worse |ln(got / want)| of w0 and Q."""',
			'    return max(abs(math.log(got[key] / want[key])) for key in ("w0", "q"))',
			'',
			'',
			'def rounded(p):',
			...(mfb
				? ['    """Rule c: each resistor to its neighbour below or above (R3 with R1), keeping the', '    combination whose figures miss the exact parts\' least."""']
				: ['    """Rule c: each resistor to its neighbour below or above, keeping the combination whose', '    figures miss the exact parts\' least."""']),
			'    target = figures(p)',
			`    names = [name for name in p if name[0] == "R"${mfb ? ' and name != "R3"' : ''}]`,
			'    best, best_miss = None, math.inf',
			'    for values in itertools.product(*(neighbours(p[name]) for name in names)):',
			'        trial = {**p, **dict(zip(names, values))}',
			...(mfb ? ['        trial["R3"] = trial["R1"]'] : []),
			'        off = miss(figures(trial), target)',
			'        if off < best_miss:',
			'            best, best_miss = trial, off',
			'    return best',
			'',
			'',
			'def closest(tried):',
			'    """Rule b: every choice rounded (rule c), keeping the one whose rounded figures miss its exact',
			'    ones least; of those that miss as little (to 1e-9: choices a decade apart land the same), the',
			'    one whose resistors sit nearest 10 kohm. Returns its exact and its rounded parts."""',
			'    pairs = [(p, rounded(p)) for p in tried]',
			'    misses = [miss(figures(parts), figures(p)) for p, parts in pairs]',
			'    least = min(misses)',
			'    ties = [pair for pair, m in zip(pairs, misses) if m <= least + 1e-9]',
			'    return min(ties, key=lambda pair: level(pair[0]))'
		].join('\n')
	);
	file.add(
		[
			'own_stages = []  # the parts of each stage',
			'for i, st in enumerate(stages):',
			'    tried = list(choices(st))',
			'    if not tried:',
			'        print(f"  stage {i + 1}: no pair of the stock builds it; the page\'s parts are"',
			'              " checked alone")',
			'        own_stages = None',
			'        break',
			'    kept = [p for p in tried if within(p)]',
			'    exact, parts = closest(kept or tried)',
			'    own_stages.append(parts)',
			'    print(f"  stage {i + 1}: {len(kept)} of {len(tried)} choices keep the limits"',
			'          + ("" if kept else ", none: the closest of all, flagged"))',
			'    for name, v in parts.items():',
			'        moved = name[0] == "R" and v != exact[name]',
			'        unit = "ohm" if name[0] == "R" else "F"',
			'        print(f"    {name} = " + (f"{eng(exact[name], unit)} -> " if moved else "") + eng(v, unit))',
			'    got = figures(parts)',
			'    print(f"    after rounding: f0 {eng(got[\'w0\'] / (2 * math.pi), \'Hz\')}"',
			'          f" ({100 * (got[\'w0\'] / st[\'w0\'] - 1):+.1f} %),"',
			'          f" Q {got[\'q\']:.4g} ({100 * (got[\'q\'] / st[\'q\'] - 1):+.1f} %)")'
		].join('\n')
	);
}
