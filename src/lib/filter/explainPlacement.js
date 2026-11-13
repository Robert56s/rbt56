import { RESPONSES } from './approximations';
import { rippleFactor } from './stages';

/**
 * Where a design sits in its template, in numbers and in words: the room its
 * whole order leaves for one free parameter, the point chosen in it, and the
 * margins the ideal design keeps there (design.placement, from
 * placementWindow in stages.js). The Order panel shows placementTex and
 * placementReason; explainPlacement is its "show the math" block.
 *
 * The parameter is the frequency scale sigma for Butterworth, Bessel,
 * Legendre and inverse Chebyshev (the frequency where the ideal design loses
 * exactly Amax moves out from fp to sigma fp, in for a high-pass), and the
 * ripple factor eps for Chebyshev and elliptic (the edge stays on fp, the
 * ripple shrinks under Amax), between eps_min (exactly Amin at the stopband
 * edge) and eps_max (the ripple of Amax). Prose names the figures as the
 * page's notes do, fA, σs, εmax; the equations as TeX.
 */

const n4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : '-');
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
/** A frequency in Hz to six figures, as a formula prints it. */
const num = (f) => String(Number(f.toPrecision(6)));
const hz = (f) => `${num(f)}\\ \\text{Hz}`;
/** A loss in dB to three decimals, at most. */
const db = (x) => String(Number(x.toFixed(3)));

/** The placement of a design: its own, or a transformed design's prototype's. */
const infoOf = (design) => design?.placement ?? null;

/** The frequency scale a design is placed with: 1 on the passband edge or for a response placed by its ripple. */
export function placedScale(design) {
	const p = infoOf(design);
	return p && p.kind === 'scale' && p.mode !== 'edge' && !p.empty ? p.value : 1;
}

/** The ripple a design is placed with, in dB, when it is not Amax (a centred Chebyshev or elliptic), else null. */
export function placedRipple(design) {
	const p = infoOf(design);
	if (!p || p.kind !== 'ripple' || p.mode === 'edge' || p.empty) return null;
	return p.rippleDb.chosen;
}

/** Whether the design is a high-pass, whose frequency scale divides. */
const isHp = (design) => design.filterType === 'highpass';

/**
 * The window and the point chosen, as short equations with this design's
 * numbers, in rows of one statement each: [the window, the point], the
 * frequency or ripple it gives, the margins kept. A page sets each row's
 * equations side by side where they fit and one under the other on a phone.
 * `design` is a low-pass, a high-pass, one side of a band filter or a
 * transformed design (whose prototype it reads, and whose band edges it
 * names).
 */
export function placementTex(design) {
	const p = infoOf(design);
	if (!p) return [];
	const transformed = design.method === 'transformed';
	const rows = [];
	const centred = p.mode !== 'edge' && !p.empty;
	/** A window of frequencies in Hz, its ends in order. */
	const span = (a, b) => `[${num(Math.min(a, b))},\\ ${num(Math.max(a, b))}]\\ \\text{Hz}`;
	if (p.kind === 'scale') {
		rows.push([`\\sigma \\in [1,\\ \\sigma_s] = [1,\\ ${n4(p.high)}]`, centred ? `\\sigma = \\sqrt{\\sigma_s} = ${n4(p.value)}` : '\\sigma = 1']);
		if (transformed) {
			// the prototype's edge at sigma B lands on two band frequencies, as fl and fh do at sigma = 1
			const [lo, hi] = p.amaxAt.chosen;
			const [slo, shi] = p.amaxAt.stop;
			const [elo, ehi] = p.amaxAt.edge;
			rows.push([`f_{A,l} = ${hz(lo)}`, `f_{A,l} \\in ${span(elo, slo)}`]);
			rows.push([`f_{A,h} = ${hz(hi)}`, `f_{A,h} \\in ${span(ehi, shi)}`]);
		} else {
			rows.push([`f_A = f_p ${isHp(design) ? '/' : '\\times'} \\sigma = ${hz(p.amaxAt.chosen)}`, `f_A \\in ${span(p.amaxAt.edge, p.amaxAt.stop)}`]);
			if (design.response === 'butterworth') {
				// the -3 dB frequency, the pole circle's radius, moves with it
				const edge3 = design.fp * design.wcScale;
				const stop3 = isHp(design) ? edge3 / p.high : edge3 * p.high;
				rows.push([`f_{3\\,dB} = f_A\\,\\varepsilon^{${isHp(design) ? '+' : '-'}1/n} = ${hz(design.wc / (2 * Math.PI))}`, `f_{3\\,dB} \\in ${span(edge3, stop3)}`]);
			}
		}
	} else {
		rows.push([`\\varepsilon \\in [\\varepsilon_{\\min},\\ \\varepsilon_{\\max}] = [${n4(p.low)},\\ ${n4(p.high)}]`, centred ? `\\varepsilon = \\sqrt{\\varepsilon_{\\min}\\,\\varepsilon_{\\max}} = ${n4(p.value)}` : `\\varepsilon = \\varepsilon_{\\max} = ${n4(p.high)}`]);
		rows.push([`A_r = 10\\log_{10}(1 + \\varepsilon^2) = ${db(p.rippleDb.chosen)}\\ \\text{dB}`, `A_r \\in [${db(p.rippleDb.stop)},\\ ${db(p.rippleDb.edge)}]\\ \\text{dB}`]);
	}
	rows.push(marginTex(design));
	return rows;
}

/** The margins the ideal design keeps, one equation each: at the passband edge(s), and at each stopband edge. */
function marginTex(design) {
	const m = infoOf(design).margins;
	if (design.method === 'transformed') {
		const [low, high] = m.edges;
		return [`A_{max} - A(f_l, f_h) = ${n2(m.pass)}\\ \\text{dB}`, `A(f_{sl}) - A_{min} = ${n2(low)}\\ \\text{dB}`, `A(f_{sh}) - A_{min} = ${n2(high)}\\ \\text{dB}`];
	}
	return [`A_{max} - A(f_p) = ${n2(m.pass)}\\ \\text{dB}`, `A(f_s) - A_{min} = ${n2(m.stop)}\\ \\text{dB}`];
}

/** The one-line reason under the numbers. */
export function placementReason(design) {
	const p = infoOf(design);
	if (!p) return '';
	if (p.empty) return 'This order leaves no room between the two edges, so the design stays on the passband edge.';
	const what =
		p.kind !== 'scale'
			? 'the ripple Ar'
			: design.method === 'transformed'
				? 'each of the two frequencies where the ideal design loses exactly Amax (fA,l and fA,h above)'
				: 'the frequency where the ideal design loses exactly Amax (fA above)';
	if (p.mode === 'edge') {
		return `On the passband edge, the textbook way: Amax is lost exactly at the passband edge, and all the room the whole order leaves goes to the stopband. Any rounding that moves the response in breaks Amax.`;
	}
	return `Centred in the template: ${what} sits at the geometric middle of the room the whole order leaves, so the ideal design keeps a margin at both edges, room for rounding and part tolerances either way.`;
}

/**
 * Where the window comes from, for the Order panel's "show the math": each
 * end of it, why the middle is the geometric one, and what the search does
 * with the margin.
 */
export function explainPlacement(design) {
	const p = infoOf(design);
	if (!p) return [];
	const pp = (text) => ({ type: 'p', text });
	const eq = (tex) => ({ type: 'eq', tex });
	const transformed = design.method === 'transformed';
	const proto = transformed ? design.lowpass : design;
	const n = proto.n;
	const blocks = [
		pp(
			`The order is a whole number, so it usually does more than the spec asks: with n = ${n} the ideal design can lose exactly Amax at the passband edge and still keep more than Amin at the stopband edge. That leaves room for one free parameter, between two ends: one where Amax is lost exactly at the passband edge, the other where exactly Amin is lost at the stopband edge.`
		)
	];
	const name = RESPONSES[proto.response]?.short ?? RESPONSES[proto.response]?.label ?? proto.response;
	if (p.kind === 'scale') {
		blocks.push(
			pp(
				`For ${name} the parameter is a frequency scale σ: every frequency of the prototype is ${isHp(design) ? 'divided' : 'multiplied'} by σ, so the point where it loses exactly Amax moves from the passband edge out towards the stopband. σ = 1 is the first end. The other end, σs, is the scale that leaves exactly Amin at the stopband edge${transformed ? ' closer to the band (each stopband edge against its own Amin)' : ''}.`
			)
		);
		if (proto.response === 'butterworth' && !transformed) {
			const epsP = rippleFactor(design.amaxDb);
			const epsS = rippleFactor(design.aminDb);
			const hp = isHp(design);
			blocks.push(
				pp(
					`For a Butterworth both ends have a closed form. With εp from Amax the loss is 10 log(1 + εp² (${hp ? 'fA/f' : 'f/fA'})^(2n)), so with εs from Amin the scale σs solves this, written out below:`
				),
				eq(`\\varepsilon_p^2 \\left(${hp ? '\\dfrac{f_p}{\\sigma_s f_s}' : '\\dfrac{f_s}{\\sigma_s f_p}'}\\right)^{2n} = \\varepsilon_s^2`),
				eq(`\\sigma_s = \\dfrac{1}{k}\\left(\\dfrac{\\varepsilon_p}{\\varepsilon_s}\\right)^{1/n} = \\dfrac{1}{${n4(design.k)}}\\left(\\dfrac{${n4(epsP)}}{${n4(epsS)}}\\right)^{1/${n}} = ${n4(p.high)}`),
				pp(
					p.mode === 'edge'
						? 'Centred in the template (panel 01), the middle of the window would put the -3 dB frequency at the geometric mean of the two edges, with the ripple factors of both limits:'
						: 'The middle of the window then puts the -3 dB frequency at the geometric mean of the two edges, with the ripple factors of both limits:'
				),
				eq(`f_{3\\,dB} = \\sqrt{f_p f_s}\\,\\left(\\varepsilon_p\\,\\varepsilon_s\\right)^{${hp ? '+' : '-'}1/(2n)} = ${hz(Math.sqrt(design.fp * design.fs) * (epsP * epsS) ** ((hp ? 1 : -1) / (2 * n)))}`)
			);
		} else {
			blocks.push(pp('For this response σs is found by bisection: the scale at which the ideal prototype loses exactly Amin at the stopband edge.'));
		}
	} else {
		blocks.push(
			pp(
				`For ${name} the passband edge stays on ${transformed ? 'fl and fh' : 'fp'} and the parameter is the ripple factor ε: εmax = √(10^(Amax/10) - 1), the ripple of Amax, is one end. A smaller ripple costs loss in the stopband at the same order${proto.response === 'elliptic' ? ' (the elliptic floor follows the ripple at a fixed order and selectivity)' : ''}, and the other end, εmin, is the ripple factor that leaves exactly Amin at the stopband edge${transformed ? ' closer to the band' : ''}.`
			)
		);
		if (proto.response === 'chebyshev' && !transformed) {
			blocks.push(
				pp('For a Chebyshev it has a closed form: the loss at the stopband edge is 10 log(1 + ε² cosh²(n acosh(1/k))), set equal to Amin:'),
				eq(`\\varepsilon_{\\min} = \\dfrac{\\sqrt{10^{A_{min}/10} - 1}}{\\cosh\\!\\left(n\\,\\operatorname{acosh}(1/k)\\right)} = \\dfrac{${n2(rippleFactor(design.aminDb))}}{\\cosh(${n}\\,\\operatorname{acosh}\\,${n4(1 / design.k)})} = ${n4(p.low)}`)
			);
		}
	}
	const middle = p.kind === 'scale' ? 'σ = √σs, the way frequencies are read: the point where Amax is lost then sits' : 'ε = √(εmin εmax): the ripple factor then sits';
	blocks.push(
		pp(
			p.mode === 'edge'
				? `Centred in the template (panel 01), the middle would be taken on a logarithmic axis, ${middle} the same ratio away from each end of the window. On the passband edge the design takes the first end instead.`
				: `The middle is taken on a logarithmic axis, ${middle} the same ratio away from each end of the window.`
		),
		pp(
			p.mode === 'edge'
				? 'On the passband edge the ideal design keeps no margin in the passband. The parts are chosen for the whole filter within the limits on the parts: to meet the template, then to stay closest to the ideal response.'
				: `The parts are chosen for the whole filter within the limits on the parts: to keep up to the smaller of those margins (${n2(p.idealMargin)} dB here), then to stay closest to the ideal response.`
		)
	);
	return blocks;
}
