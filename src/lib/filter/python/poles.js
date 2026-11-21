import { RESPONSES } from '../approximations';
import { comment, noted, pyNum, pyRaise, prose } from './emit';
import { PLAIN_NAME, sideLead } from './order';

/**
 * Section 3, the normalized prototype of one side: its pole pairs as
 * sections s^2 + a s + b (with the zero z of a section, its numerator
 * s^2 + z, for the responses that have zeros) and the real pole of an odd
 * order, highest Q first, as the page has them (prototypeSections in
 * stages.js). Defines v('sections') and v('real') (None for an even order),
 * and for an inverse Chebyshev v('floor'), the floor of its stopband.
 *
 * Butterworth, Chebyshev I and inverse Chebyshev are written as their
 * formulas, one function each (butterworth(n), chebyshev(n, eps),
 * inverse_chebyshev(n, eps, k)): a later variant can swap them for another
 * source of poles without touching the rest. Bessel, Legendre and elliptic
 * would need more than about 20 lines (a root finder, Jacobi's functions),
 * so their numbers are the page's, written in, behind a guard on the
 * settings they were computed for, with a self-check of their losses at
 * the edges.
 */

/** The responses whose sections 3 and 4 read loss_db: their poles written in, or their room found by bisection. */
export const LOSS_DB_RESPONSES = ['bessel', 'legendre', 'inverseChebyshev', 'elliptic'];

/**
 * Whether loss_db takes a real pole for these sides (the ones of them that
 * read it): false where none can have one, 'always' where each has one (a
 * written-in prototype's order is fixed by its guard, odd), true where it
 * may be None (an inverse Chebyshev's order is the reader's to change, its
 * poles a formula; or one side odd and the other even).
 */
export function lossReal(sides) {
	const reading = sides.filter((s) => LOSS_DB_RESPONSES.includes(s.response));
	const odd = (s) => s.design.stages.some((st) => st.order === 1);
	if (!reading.some((s) => s.response === 'inverseChebyshev' || odd(s))) return false;
	return reading.every((s) => s.response !== 'inverseChebyshev' && odd(s)) ? 'always' : true;
}

/**
 * The Python of a call of loss_db on a side's prototype at `w` (a Python
 * expression): with its real pole where loss_db takes one (side.lossReal).
 */
export const lossCall = (side, sections, real, w) => (side.lossReal === false ? `loss_db(${sections}, ${w})` : `loss_db(${sections}, ${real}, ${w})`);

/**
 * loss_db(sections, real, w): a prototype's loss at w, its gain at DC 1 (prototypeLossDb in
 * approximations.js). `zeros`: its sections (a, b, z) carry a zero; 'both' for a band filter
 * whose one side's sections do and the other's do not (band.js, side.lossZeros). `real` as
 * lossReal gives it: false where no prototype of the file can have a real pole (loss_db(sections,
 * w) then), 'always' where each one that reads it has one, true where it may be None.
 */
export function lossHelper(file, zeros, real = true) {
	const loop = {
		false: ['    for a, b in sections:', '        g2 *= b * b / ((b - w * w) ** 2 + (a * w) ** 2)'],
		true: ['    for a, b, z in sections:', '        num = (z - w * w) * b / z', '        g2 *= num * num / ((b - w * w) ** 2 + (a * w) ** 2)'],
		both: ['    for a, b, *zero in sections:', '        num = (zero[0] - w * w) * b / zero[0] if zero else b', '        g2 *= num * num / ((b - w * w) ** 2 + (a * w) ** 2)']
	}[zeros];
	const what = real ? 'the product of its sections and of its real pole' : 'the product of its sections';
	file.once(
		'loss_db',
		[
			real ? 'def loss_db(sections, real, w):' : 'def loss_db(sections, w):',
			'    """The loss in dB of a normalized prototype at w (in units of its passband edge), its',
			...(zeros === 'both' ? [`    gain at DC 1: ${what}. A section is (a, b),`, '    or (a, b, z) where it has a zero."""'] : [`    gain at DC 1: ${what}."""`]),
			'    g2 = 1.0',
			...loop,
			...(real === 'always' ? ['    g2 *= real * real / (real * real + w * w)'] : real ? ['    if real is not None:', '        g2 *= real * real / (real * real + w * w)'] : []),
			'    return -10 * math.log10(max(g2, 1e-300))'
		].join('\n')
	);
}

const FORMULAS = {
	butterworth: [
		'def butterworth(n):',
		'    """The Butterworth prototype of order n, the poles of 1 / (1 + w^(2n)) on the unit circle at',
		'    theta_i = (2i + 1) pi / (2n) from the imaginary axis: its sections s^2 + a s + 1 with',
		'    a = 2 sin(theta_i), highest Q first, and the real pole -1 of an odd order (None for an even)."""',
		'    sections = []',
		'    for i in range(n // 2):',
		'        theta = (2 * i + 1) * math.pi / (2 * n)',
		'        sections.append((2 * math.sin(theta), 1.0))',
		'    return sections, (1.0 if n % 2 else None)'
	],
	chebyshev: [
		'def chebyshev(n, eps):',
		'    """The Chebyshev I prototype of order n and ripple factor eps, normalized to its ripple',
		'    edge: the Butterworth angles on an ellipse, sigma_i = -sinh(beta) sin(theta_i) and',
		'    omega_i = cosh(beta) cos(theta_i), beta = asinh(1 / eps) / n. Each pair is the section',
		'    s^2 - 2 sigma_i s + sigma_i^2 + omega_i^2, and an odd order leaves the real pole at',
		'    -sinh(beta). Returns the sections, highest Q first, and the real pole (or None)."""',
		'    beta = math.asinh(1 / eps) / n',
		'    sections = []',
		'    for i in range(n // 2):',
		'        theta = (2 * i + 1) * math.pi / (2 * n)',
		'        sigma = -math.sinh(beta) * math.sin(theta)',
		'        omega = math.cosh(beta) * math.cos(theta)',
		'        sections.append((-2 * sigma, sigma * sigma + omega * omega))',
		'    return sections, (math.sinh(beta) if n % 2 else None)'
	],
	inverseChebyshev: [
		'def inverse_chebyshev(n, eps, k):',
		'    """The inverse Chebyshev (Chebyshev II) prototype of order n, normalized to its passband',
		'    edge: the Chebyshev I poles of the stopband ripple eps_stop = eps cosh(n acosh(1/k)),',
		'    inverted (p -> 1/p) and stretched by 1/k so that the stopband starts at 1/k, with zeros at',
		'    w = 1 / (k cos(theta_i)). Each pole pair, highest Q first, takes the zero nearest it.',
		'    Returns the sections (a, b, z), the real pole (or None) and the floor of the stopband."""',
		'    eps_stop = eps * math.cosh(n * math.acosh(1 / k))  # the stopband ripple n reaches, amin or more',
		'    beta = math.asinh(eps_stop) / n',
		'    poles, zeros = [], []',
		'    for i in range(n):',
		'        theta = (2 * i + 1) * math.pi / (2 * n)',
		'        s = complex(-math.sinh(beta) * math.sin(theta), math.cosh(beta) * math.cos(theta))',
		'        if s.imag < -1e-12:',
		'            continue',
		'        p = 1 / s',
		'        poles.append(complex(p.real / k, abs(p.imag) / k))',
		'        if math.cos(theta) > 1e-12:',
		'            zeros.append(1 / k / math.cos(theta))',
		'    pairs = [(-2 * p.real, p.real * p.real + p.imag * p.imag) for p in poles if p.imag > 1e-9]',
		'    pairs.sort(key=lambda ab: -math.sqrt(ab[1]) / ab[0])',
		'    zeros.sort()',
		'    sections = []',
		'    for a, b in pairs:',
		'        j = min(range(len(zeros)), key=lambda j: abs(math.log(zeros[j] / math.sqrt(b))))',
		'        wz = zeros.pop(j)',
		'        sections.append((a, b, wz * wz))',
		'    real = next((-p.real for p in poles if abs(p.imag) <= 1e-9), None)',
		'    return sections, real, 10 * math.log10(1 + eps_stop * eps_stop)'
	]
};

/** Where the written-in prototypes come from, in a few words. */
const SOURCE = {
	bessel: 'the roots of the reverse Bessel polynomial of order n, scaled so that the response loses exactly amax at w = 1. Finding them takes a polynomial root finder',
	legendre: "the stable roots of 1 + eps^2 L_n(w^2), L_n Papoulis' optimum polynomial, which loses exactly amax at w = 1. Building L_n and finding its roots takes more than a few lines",
	elliptic: "Jacobi's elliptic functions sn, cn and dn at the degree equation's points, with exactly the ripple lost at w = 1. Those functions take more than a few lines"
};

export function poles(file, side) {
	const { v, response, design } = side;
	const zeros = Boolean(RESPONSES[response]?.zeros);
	const sections = v('sections');
	const real = v('real');
	const n = v('n');
	if (FORMULAS[response]) {
		file.once(response, FORMULAS[response].join('\n'));
		const call =
			response === 'butterworth'
				? `${sections}, ${real} = butterworth(${n})`
				: response === 'chebyshev'
					? `${sections}, ${real} = chebyshev(${n}, math.sqrt(10 ** (${side.amax} / 10) - 1))`
					: `${sections}, ${real}, ${v('floor')} = inverse_chebyshev(${n}, ${v('eps')}, ${v('k')})`;
		file.add([call, printSections(side, zeros)].join('\n'));
		return;
	}
	writtenIn(file, side, zeros);
}

/** A band side's name in a sentence ('low-pass branch'). */
const tag = (side) => side.tag;

/** The page's own numbers for a prototype of Bessel, Legendre or elliptic, behind their guard, and the self-check. */
function writtenIn(file, side, zeros) {
	const { v, response, design } = side;
	const name = PLAIN_NAME[response] ?? response;
	const full = { bessel: 'Bessel (Thomson)', legendre: 'Legendre (optimum L)', elliptic: 'elliptic (Cauer)' }[response] ?? name;
	const pairs = design.stages.filter((s) => s.order === 2).map((s) => s.normalized);
	const realStage = design.stages.find((s) => s.order === 1);
	const ripple = design.placement?.kind === 'ripple' ? design.placement.rippleDb?.chosen ?? design.amaxDb : design.amaxDb;
	const ellip = response === 'elliptic';
	// (an elliptic prototype on the passband edge has amax for its ripple: its guard here holds the
	// placement and amax too; a centred one's ripple is found in 4, which guards it there)
	const edge = ellip && design.placement?.mode !== 'centred';
	const what = ellip ? `n = ${design.n} and k = ${prose(design.k)}${edge ? `, a ripple of ${prose(ripple)} dB (amax, the edge placement)` : ''}` : `n = ${design.n} and amax = ${prose(design.amaxDb)} dB`;
	const guard = ellip
		? [`${v('n')} != ${design.n}`, `not math.isclose(${v('k')}, ${pyNum(design.k)})`, ...(edge ? [`placement != "edge"`, `not math.isclose(${side.amax}, ${pyNum(design.amaxDb)})`] : [])]
		: [`${v('n')} != ${design.n}`, `not math.isclose(${side.amax}, ${pyNum(design.amaxDb)})`];
	const test = `if ${guard.join(' or ')}:`;
	file.add(
		[
			comment(
				// (a band filter's second side of the same response: the source of the numbers said above)
				side.like
					? `The ${tag(side)}'s prototype, as for the ${side.like}: the page's own numbers, for ${what}${ellip && !edge ? ` (and a ripple of ${prose(ripple)} dB, checked in 4)` : ''}.`
					: `The ${full} prototype: ${SOURCE[response]}, so its poles${zeros ? ' and zeros' : ''} are the page's own numbers here, for ${what}${ellip && !edge ? ` (and a ripple of ${prose(ripple)} dB, checked in 4)` : ''}. Each section ${zeros ? '(a, b, z) is (s^2 + z) / (s^2 + a s + b)' : '(a, b) is s^2 + a s + b'}, highest Q first${realStage ? ', and the real pole is s = -real' : ''}.`
			),
			test.length <= 100 ? test : `if (${guard.slice(0, 2).join(' or ')}\n        or ${guard.slice(2).join(' or ')}):`,
			pyRaise(`The ${name} poles here are the page's for ${what}: for ${ellip ? (edge ? 'another order, k, amax or placement' : 'another order or k') : 'another order or amax'}, get the file again from the page.`, '    '),
			`${v('sections')} = [`,
			...pairs.map((s) => `    (${[s.a, s.b, ...(zeros ? [s.z] : [])].map(pyNum).join(', ')}),`),
			']',
			`${v('real')} = ${realStage ? pyNum(realStage.normalized.breal) : 'None'}`
		].join('\n')
	);
	lossHelper(file, side.lossZeros ?? zeros, side.lossReal ?? true);
	const sec = v('sections');
	const re = v('real');
	const { lead } = sideLead(side);
	const loss = (w) => lossCall(side, sec, re, w);
	// (each loss on its own line of the printout)
	const check = ellip
		? [
				noted(`${v('top')} = min(${loss('i / 1000')} for i in range(1001))`, 'the top of its passband'),
				`at_edge = ${loss('1')} - ${v('top')}`,
				`at_stop = ${loss(`1 / ${v('k')}`)} - ${v('top')}`,
				`print(f"${lead}self-check, from the top of the passband: w = 1 loses {at_edge:.4f} dB"`,
				`      f" (the ripple, ${prose(ripple)} dB)")`,
				`print(f"${lead}  and w = 1/k loses {at_stop:.2f} dB (amin {${side.amin}:g} dB)")`
			]
		: [
				`at_edge, at_stop = ${loss('1')}, ${loss(`1 / ${v('k')}`)}`,
				`print(f"${lead}self-check: it loses {at_edge:.4f} dB at w = 1 (amax {${side.amax}:g} dB)")`,
				`print(f"${lead}  and {at_stop:.2f} dB at w = 1/k (amin {${side.amin}:g} dB)")`
			];
	file.add([printSections(side, zeros, realStage ? 'real' : 'none'), ...check].join('\n'));
}

/**
 * The sections printed, and the real pole. `real` says what the code knows of
 * it: 'maybe' where the order is the reader's to change (an odd one the file
 * has no first-order stage for stops here), 'real' or 'none' where the
 * numbers written in fix the order.
 */
function printSections(side, zeros, real = 'maybe') {
	const { v } = side;
	const { lead, heading } = sideLead(side);
	const lines = zeros
		? [`for a, b, z in ${v('sections')}:`, `    print(f"${lead}(s^2 + {z:.6f}) / (s^2 + {a:.6f} s + {b:.6f})   Q = {math.sqrt(b) / a:.4f}")`]
		: [`for a, b in ${v('sections')}:`, `    print(f"${lead}s^2 + {a:.6f} s + {b:.6f}   Q = {math.sqrt(b) / a:.4f}")`];
	if (heading) lines.unshift(heading);
	if (real === 'real') lines.push(`print(f"${lead}s + {${v('real')}:.6f}")`);
	if (real === 'maybe') {
		lines.push(
			`if ${v('real')} is not None:`,
			side.circuits.real ? `    print(f"${lead}s + {${v('real')}:.6f}")` : pyRaise('An odd order needs a first-order stage: get the file again from the page.', '    ')
		);
	}
	return lines.join('\n');
}
