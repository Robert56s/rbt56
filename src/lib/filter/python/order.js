import { RESPONSES } from '../approximations';
import { comment, listWords, pyList, pyNum, pyRaise, pyStr, prose } from './emit';

/**
 * Section 2, the order of one side (filter.js): the response's formula,
 * n_exact and n, or the order the page was given (side.order is None for
 * the minimum). Butterworth, Chebyshev I, inverse Chebyshev and elliptic
 * have a closed form (minimumOrder in stages.js); Bessel and Legendre are
 * counted by trying n = 1, 2, ... (searchedOrder in approximations.js),
 * whose losses the file carries as numbers, behind a guard on the settings
 * they were computed for. Defines v('k')'s order: v('n_exact') and v('n').
 */

/** A response's name inside a sentence of the file. */
export const PLAIN_NAME = { butterworth: 'Butterworth', chebyshev: 'Chebyshev I', legendre: 'Legendre', bessel: 'Bessel', inverseChebyshev: 'inverse Chebyshev', elliptic: 'elliptic' };

/** The elliptic integrals K and K' by the arithmetic-geometric mean (ellipK, ellipKp in approximations.js). */
export function ellipticIntegrals(file) {
	file.once(
		'agm',
		[
			'def agm(a, b):',
			'    """The arithmetic-geometric mean of a and b."""',
			'    for _ in range(60):',
			'        if abs(a - b) <= 1e-15 * a:',
			'            break',
			'        a, b = (a + b) / 2, math.sqrt(a * b)',
			'    return (a + b) / 2',
			'',
			'',
			'def ellip_k(m):',
			'    """The complete elliptic integral of the first kind K(m), m = k^2."""',
			'    return math.pi / (2 * agm(1.0, math.sqrt(1 - m)))',
			'',
			'',
			'def ellip_kp(m):',
			'    """K\'(m) = K(1 - m), written with sqrt(m) so that it stays exact for a tiny m."""',
			'    return math.pi / (2 * agm(1.0, math.sqrt(m)))'
		].join('\n')
	);
}

/**
 * What a section prints for one side: `lead` before each line, and the
 * side's own heading first (side.tag, a band filter's 'high-pass section'
 * or 'low-pass branch': its lines then sit one step in under it).
 */
export function sideLead(side) {
	return side.tag ? { lead: '    ', heading: `print(${pyStr(`  ${side.tag}:`)})` } : { lead: '  ', heading: null };
}

export function order(file, side) {
	const { v, response, design } = side;
	const amax = side.amax;
	const amin = side.amin;
	const k = v('k');
	const hp = side.type === 'highpass';
	const name = PLAIN_NAME[response] ?? RESPONSES[response]?.label ?? response;
	const { lead, heading } = sideLead(side);
	// (the comments name the side's own settings: fp, fs, amax, amin and k for a low-pass or a high-pass)
	const { fp, fs } = side;
	const pick = `${v('n')} = max(1, math.ceil(${v('n_exact')})) if ${side.order} is None else ${side.order}`;
	// (a band filter's second side of the same response: one line in place of the formula said above)
	const say = (words) => comment(side.like ? `As for the ${side.like}, with ${listWords([fs, amax, amin, k])}:` : words);
	const show = [heading, `print(f"${lead}n >= {${v('n_exact')}:.4f}, so n = {${v('n')}}")`].filter(Boolean).join('\n');
	if (response === 'butterworth' || response === 'chebyshev') {
		const butter = response === 'butterworth';
		file.add(
			[
				say(
					butter
						? `Butterworth loses 10 log10(1 + eps^2 (${hp ? `${fp} / f` : `f / ${fp}`})^(2n)), eps^2 = 10^(${amax}/10) - 1. At ${fs} that reaches ${amin} when\n    n >= log10((10^(${amin}/10) - 1) / (10^(${amax}/10) - 1)) / (2 log10(1/${k}))`
						: `Chebyshev I loses 10 log10(1 + eps^2 C_n(${hp ? `${fp} / f` : `f / ${fp}`})^2), eps^2 = 10^(${amax}/10) - 1, and past the edge C_n(x) = cosh(n acosh(x)). At ${fs} that reaches ${amin} when\n    n >= acosh(sqrt((10^(${amin}/10) - 1) / (10^(${amax}/10) - 1))) / acosh(1/${k})`
				),
				`${v('ratio')} = (10 ** (${amin} / 10) - 1) / (10 ** (${amax} / 10) - 1)`,
				butter
					? `${v('n_exact')} = math.log10(${v('ratio')}) / (2 * math.log10(1 / ${k}))`
					: `${v('n_exact')} = math.acosh(math.sqrt(${v('ratio')})) / math.acosh(1 / ${k})`,
				pick,
				show
			].join('\n')
		);
		return;
	}
	if (response === 'inverseChebyshev') {
		file.add(
			[
				say(
					`Inverse Chebyshev needs the Chebyshev I order: the same polynomial turned inside out, its ripple in the stopband. With ${v('eps')} and ${v('eps_s')} the ripple factors of ${amax} and ${amin}:\n    n >= acosh(${v('eps_s')} / ${v('eps')}) / acosh(1/${k})`
				),
				`${v('eps')} = math.sqrt(10 ** (${amax} / 10) - 1)`,
				`${v('eps_s')} = math.sqrt(10 ** (${amin} / 10) - 1)`,
				`${v('n_exact')} = math.acosh(${v('eps_s')} / ${v('eps')}) / math.acosh(1 / ${k})`,
				pick,
				show
			].join('\n')
		);
		return;
	}
	if (response === 'elliptic') {
		ellipticIntegrals(file);
		file.add(
			[
				say(
					`Elliptic (Cauer): the degree equation, with k1 = eps / eps_s the discrimination, eps and eps_s the ripple factors of ${amax} and ${amin}:\n    n >= K(${k}^2) K'(k1^2) / (K'(${k}^2) K(k1^2))`
				),
				`${v('k1_sq')} = (10 ** (${amax} / 10) - 1) / (10 ** (${amin} / 10) - 1)`,
				`${v('n_exact')} = ellip_k(${k} * ${k}) * ellip_kp(${v('k1_sq')}) / (ellip_kp(${k} * ${k}) * ellip_k(${v('k1_sq')}))`,
				pick,
				show
			].join('\n')
		);
		return;
	}
	// Bessel and Legendre: the losses of the search, as numbers
	const tried = design.orderSearch ?? [];
	const losses = v('losses');
	file.add(
		[
			say(
				`${name} has no closed form for its order: n = 1, 2, ... is tried until the loss at the stopband edge reaches ${amin}. The losses there (dB, at w = 1/${k} in units of the passband edge) of the prototypes the page builds for ${amax} = ${prose(design.amaxDb)} dB, for n = 1, 2, ...:`
			),
			pyList(losses, tried.map((t) => pyNum(t.loss))),
			`if not (math.isclose(${amax}, ${pyNum(design.amaxDb)}) and math.isclose(${k}, ${pyNum(design.k)})):`,
			pyRaise(`The ${name} losses here are the page's for amax = ${prose(design.amaxDb)} dB and k = ${prose(design.k)}: for other settings, get the file again from the page.`, '    '),
			`${v('enough')} = [i + 1 for i, loss in enumerate(${losses}) if loss >= ${amin}]`,
			`if not ${v('enough')}:`,
			pyRaise(`None of the ${tried.length} orders written here reaches amin: get the file again from the page.`, '    '),
			`${v('n_exact')} = ${v('enough')}[0]  # a whole number: the first order that reaches amin`,
			`${v('n')} = ${v('n_exact')} if ${side.order} is None else ${side.order}`,
			...(heading ? [heading] : []),
			`print(f"${lead}the loss at ${fs} first reaches ${amin} with n = {${v('n_exact')}}"`,
			`      f" ({${losses}[${v('n_exact')} - 1]:.2f} dB), so n = {${v('n')}}")`
		].join('\n')
	);
}
