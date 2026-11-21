import { RESPONSES } from '../approximations';
import { comment, fitCall, pyNum, pyRaise, pyStr, prose } from './emit';
import { ellipticIntegrals, sideLead } from './order';
import { lossCall, lossHelper } from './poles';

/**
 * Section 4, first half: where one side sits in its template, as the page
 * places it (placementWindow and placementInfo in stages.js, explained in
 * explainPlacement.js), and the frequency scale that denormalizes it,
 * v('wc') in rad/s. The setting `placement` is "edge" or "centred".
 *   scale   Butterworth, Bessel, Legendre, inverse Chebyshev: every
 *           frequency of the prototype times sigma (divided for a high-pass),
 *           from 1 (amax exactly at fp) to sigma_s (amin exactly at fs),
 *           centred at sqrt(sigma_s); sigma_s in closed form for
 *           Butterworth, by bisection for the others (scale_for)
 *   ripple  Chebyshev I, elliptic: the ripple factor from eps_min (amin
 *           exactly at fs) to eps_max (amax), centred at sqrt(eps_min
 *           eps_max); Chebyshev's poles are built again with it, an
 *           elliptic's are the page's for its ripple (a guard)
 */

/** scale_for(loss, w, amin): the end of the room, by the page's bisection (placeCrossing in stages.js). */
export function scaleHelper(file) {
	file.once(
		'scale_for',
		[
			'def scale_for(loss, w, amin):',
			'    """The scale sigma at which loss(w / sigma) is exactly amin, by bisection on ln(sigma)."""',
			'    lo, hi = math.log(w) - 40, math.log(w)',
			'    for _ in range(60):',
			'        mid = (lo + hi) / 2',
			'        if amin - loss(w / math.exp(mid)) < 0:',
			'            lo = mid',
			'        else:',
			'            hi = mid',
			'    return math.exp((lo + hi) / 2)'
		].join('\n')
	);
}

/** least_loss(): an inverse Chebyshev's least loss from w on (bandLeastLoss in stages.js). */
export function leastHelper(file) {
	file.once(
		'least_loss',
		[
			'def least_loss(sections, real, w, floor, last):',
			'    """The least loss from w on: past the stopband edge an inverse Chebyshev rises and falls',
			'    between its zeros, never under its floor, until an odd order climbs past `last`."""',
			'    loss = loss_db(sections, real, w)',
			'    return loss if w > last else min(loss, floor)'
		].join('\n')
	);
}

/** discrimination(n, m): the k1^2 an elliptic filter of order n reaches (ellipDiscrimination in approximations.js). */
export function discriminationHelper(file) {
	ellipticIntegrals(file);
	file.once(
		'discrimination',
		[
			'def discrimination(n, m):',
			'    """The k1^2 an elliptic filter of order n reaches at the selectivity m = k^2: the degree',
			"    equation in nomes, q1 = q^n with q = exp(-pi K'(m) / K(m)), and k1^2 from q1 by its",
			'    theta series."""',
			'    q = math.exp(-math.pi * ellip_kp(m) / ellip_k(m)) ** n',
			'    num = sum(q ** (j * (j + 1)) for j in range(8))',
			'    den = 1 + 2 * sum(q ** (j * j) for j in range(1, 9))',
			'    return 16 * q * (num / den) ** 4'
		].join('\n')
	);
}

/**
 * A centred Chebyshev's poles built again for its ripple, from the ripple
 * in dB as the page builds them (and as section 3 builds the edge's from
 * amax), and printed: `ripple` the Python name of the ripple in dB.
 */
export function rebuilt(side, ripple) {
	const { v } = side;
	const { lead } = sideLead(side);
	return [
		'if centred:',
		`    ${v('sections')}, ${v('real')} = chebyshev(${v('n')}, math.sqrt(10 ** (${ripple} / 10) - 1))`,
		`    print(${pyStr(`${lead}the poles again for that ripple:`)})`,
		`    for a, b in ${v('sections')}:`,
		`        print(f"${lead}  s^2 + {a:.6f} s + {b:.6f}   Q = {math.sqrt(b) / a:.4f}")`,
		...(side.circuits.real ? [`    if ${v('real')} is not None:`, `        print(f"${lead}  s + {${v('real')}:.6f}")`] : [])
	].join('\n');
}

export function placement(file, side) {
	const { v, response, design } = side;
	const hp = side.type === 'highpass';
	const k = v('k');
	const n = v('n');
	const sections = v('sections');
	const real = v('real');
	// (the comments name the side's own settings: fp, fs, amax and amin for a low-pass or a high-pass)
	const { fp, fs, amax, amin } = side;
	const { lead, heading } = sideLead(side);
	// (a band filter's second side of the same response: what differs, the first's explanation said above)
	const explain = (full, short) => comment(side.like ? short : full);
	if (response === 'chebyshev' || response === 'elliptic') {
		const cheb = response === 'chebyshev';
		const centredPage = design.placement?.mode === 'centred';
		if (!cheb) discriminationHelper(file);
		file.add(
			[
				explain(
					`The whole order n leaves room: the ripple can shrink from ${amax} down to the one that leaves exactly ${amin} at ${fs}, the passband edge staying on ${fp}. In ripple factors, from ${v('eps_max')} (${amax}) down to\n    ${v('eps_min')} = ${cheb ? `eps_s / cosh(n acosh(1/${k}))` : 'k1 eps_s'}\n${cheb ? `with eps_s from ${amin}` : `with eps_s from ${amin} and k1 the discrimination the order n reaches at this ${k}`}. "edge" keeps ${v('eps_max')}; "centred" takes the geometric middle, ${v('eps')} = sqrt(${v('eps_min')} ${v('eps_max')})${cheb ? ', and builds the poles again for its ripple' : ''}.`,
					`As for the ${side.like}: the ripple factor from ${v('eps_max')} (${amax}) down to ${v('eps_min')} (${amin} exactly at ${fs})${cheb ? ', the poles built again for a centred one' : ''}.`
				),
				`${v('eps_max')} = math.sqrt(10 ** (${side.amax} / 10) - 1)`,
				cheb
					? `${v('eps_min')} = math.sqrt(10 ** (${side.amin} / 10) - 1) / math.cosh(${n} * math.acosh(1 / ${k}))`
					: `${v('eps_min')} = math.sqrt(discrimination(${n}, ${k} * ${k})) * math.sqrt(10 ** (${side.amin} / 10) - 1)`,
				`centred = placement == "centred" and ${v('eps_min')} <= ${v('eps_max')}`,
				`${v('eps')} = math.sqrt(${v('eps_min')} * ${v('eps_max')}) if centred else ${v('eps_max')}`,
				`${v('ripple')} = 10 * math.log10(1 + ${v('eps')} * ${v('eps')})  # dB, the passband ripple`,
				// (an elliptic placed on the edge: section 3's guard holds its placement and amax already)
				...(cheb || !centredPage
					? []
					: [
							`if not math.isclose(${v('ripple')}, ${pyNum(design.placement?.rippleDb?.chosen ?? design.amaxDb)}):`,
							pyRaise(
								`The elliptic poles in 3 are the page's for a ripple of ${prose(design.placement?.rippleDb?.chosen ?? design.amaxDb)} dB, the centred placement: for another ripple or placement, get the file again from the page.`,
								'    '
							)
						]),
				...(heading ? [heading] : []),
				`print(f"${lead}eps from {${v('eps_min')}:.4f} to {${v('eps_max')}:.4f}; {placement}: eps = {${v('eps')}:.4f},"`,
				`      f" a ripple of {${v('ripple')}:.4f} dB")`,
				// (Chebyshev centred: the poles built again for that ripple, as the page builds them, and printed)
				...(cheb ? [rebuilt(side, `${v('ripple')}`)] : []),
				explain(`The prototype's edge is its ripple edge, so\n    ${hp ? `s -> ${v('wc')} / s` : `s -> s / ${v('wc')}`},  ${v('wc')} = 2 pi ${fp}`, `    ${hp ? `s -> ${v('wc')} / s` : `s -> s / ${v('wc')}`},  ${v('wc')} = 2 pi ${fp}`),
				`${v('wc')} = 2 * math.pi * ${side.fp}  # rad/s`,
				`print(f"${lead}${v('wc')} = 2 pi ${fp} = {${v('wc')}:.6g} rad/s")`
			].join('\n')
		);
		return;
	}
	const butter = response === 'butterworth';
	const zeros = Boolean(RESPONSES[response]?.zeros);
	if (!butter) {
		lossHelper(file, side.lossZeros ?? zeros, side.lossReal ?? true);
		scaleHelper(file);
		if (zeros) leastHelper(file);
	}
	const lines = [
		explain(
			`The whole order n leaves room: the ideal design can lose exactly ${amax} at ${fp} and still keep more than ${amin} at ${fs}. Every frequency of the prototype is ${hp ? 'divided' : 'multiplied'} by a scale ${v('sigma')}, from 1 (${amax} exactly at ${fp}) to ${v('sigma_s')} (${amin} exactly at ${fs}); "edge" takes ${v('sigma')} = 1, "centred" the geometric middle, sqrt(${v('sigma_s')}). ${butter ? `For Butterworth\n    ${v('sigma_s')} = (1/${k}) (${v('eps')} / ${v('eps_s')})^(1/n)\nwith ${v('eps')} and ${v('eps_s')} the ripple factors of ${amax} and ${amin}.` : `${v('sigma_s')} is found by bisection, as the page finds it.`}`,
			`As for the ${side.like}: every frequency ${hp ? 'divided' : 'multiplied'} by ${v('sigma')}, from 1 to ${v('sigma_s')} (${amin} exactly at ${fs})${butter ? '' : ', found by bisection'}.`
		)
	];
	if (butter) {
		lines.push(
			`${v('eps')} = math.sqrt(10 ** (${side.amax} / 10) - 1)`,
			`${v('eps_s')} = math.sqrt(10 ** (${side.amin} / 10) - 1)`,
			`${v('sigma_s')} = (1 / ${k}) * (${v('eps')} / ${v('eps_s')}) ** (1 / ${n})`
		);
	} else if (zeros) {
		lines.push(
			...(side.like ? [] : [comment(`An inverse Chebyshev is read on its least loss from w on (least_loss): past its stopband edge it never drops under its floor.`)]),
			`${v('last')} = 1 / (${k} * math.sin(math.pi / (2 * ${n}))) if ${n} % 2 else math.inf  # its last minimum`,
			fitCall(`${v('sigma_s')} = scale_for`, `lambda w: least_loss(${sections}, ${real}, w, ${v('floor')}, ${v('last')})`, `1 / ${k}, ${side.amin}`)
		);
	} else {
		lines.push(`${v('sigma_s')} = scale_for(lambda w: ${lossCall(side, sections, real, 'w')}, 1 / ${k}, ${side.amin})`);
	}
	lines.push(
		`${v('sigma')} = math.sqrt(${v('sigma_s')}) if placement == "centred" and ${v('sigma_s')} >= 1 else 1.0`,
		...(heading ? [heading] : []),
		`print(f"${lead}scale sigma from 1 to {${v('sigma_s')}:.4f} (${amin} at ${fs}); {placement}: {${v('sigma')}:.4f}")`
	);
	if (butter) {
		lines.push(
			explain(
				hp
					? `The unit circle loses 3 dB at w = 1: its radius moves to eps^(1/n) to lose ${amax} at ${fp}, and\n    s -> ${v('wc')} / s,  ${v('wc')} = 2 pi ${fp} eps^(1/n) / ${v('sigma')}`
					: `The unit circle loses 3 dB at w = 1: its radius moves to eps^(-1/n) to lose ${amax} at ${fp}, and\n    s -> s / ${v('wc')},  ${v('wc')} = 2 pi ${fp} eps^(-1/n) ${v('sigma')}`,
				hp ? `    s -> ${v('wc')} / s,  ${v('wc')} = 2 pi ${fp} eps^(1/n) / ${v('sigma')}` : `    s -> s / ${v('wc')},  ${v('wc')} = 2 pi ${fp} eps^(-1/n) ${v('sigma')}`
			),
			hp
				? `${v('wc')} = 2 * math.pi * ${side.fp} * ${v('eps')} ** (1 / ${n}) / ${v('sigma')}  # rad/s`
				: `${v('wc')} = 2 * math.pi * ${side.fp} * ${v('eps')} ** (-1 / ${n}) * ${v('sigma')}  # rad/s`,
			hp ? `print(f"${lead}${v('wc')} = 2 pi ${fp} eps^(1/n) / ${v('sigma')} = {${v('wc')}:.6g} rad/s")` : `print(f"${lead}${v('wc')} = 2 pi ${fp} eps^(-1/n) ${v('sigma')} = {${v('wc')}:.6g} rad/s")`
		);
	} else {
		lines.push(
			explain(`The prototype loses ${amax} at w = 1, so\n    ${hp ? `s -> ${v('wc')} / s,  ${v('wc')} = 2 pi ${fp} / ${v('sigma')}` : `s -> s / ${v('wc')},  ${v('wc')} = 2 pi ${fp} ${v('sigma')}`}`, `    ${hp ? `s -> ${v('wc')} / s,  ${v('wc')} = 2 pi ${fp} / ${v('sigma')}` : `s -> s / ${v('wc')},  ${v('wc')} = 2 pi ${fp} ${v('sigma')}`}`),
			hp ? `${v('wc')} = 2 * math.pi * ${side.fp} / ${v('sigma')}  # rad/s` : `${v('wc')} = 2 * math.pi * ${side.fp} * ${v('sigma')}  # rad/s`,
			hp ? `print(f"${lead}${v('wc')} = 2 pi ${fp} / ${v('sigma')} = {${v('wc')}:.6g} rad/s")` : `print(f"${lead}${v('wc')} = 2 pi ${fp} ${v('sigma')} = {${v('wc')}:.6g} rad/s")`
		);
	}
	file.add(lines.join('\n'));
}
