import { besselPolynomial, ellipK, ellipKp, legendrePolynomial, RESPONSES } from './approximations';
import { formatFarads, formatHz, formatOhms, formatSeconds } from './format';

/**
 * "Show the math" content for the four responses beyond Butterworth and
 * Chebyshev I (Legendre, Bessel, inverse Chebyshev, elliptic) and for the
 * notch stage their zeros need. Same rule as explain.js: say what the
 * response optimizes and why, give the formula, then this design's numbers.
 */

const n4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : '-');
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');

function p(text) {
	return { type: 'p', text };
}
function eq(tex) {
	return { type: 'eq', tex };
}

const ripple = (db) => Math.sqrt(10 ** (db / 10) - 1);

/** Butterworth and Chebyshev I are derived in explain.js itself. */
export const isClassic = (response) => response === 'butterworth' || response === 'chebyshev';

/** A polynomial with ascending coefficients as TeX, highest power first. */
function polyTex(c, power) {
	const terms = [];
	for (let k = c.length - 1; k >= 0; k--) {
		const a = c[k];
		if (Math.abs(a) < 1e-9) continue;
		const mag = Math.abs(a);
		const whole = Math.abs(mag - Math.round(mag)) < 1e-6 * Math.max(1, mag);
		const num = whole ? String(Math.round(mag)) : n4(mag);
		const factor = k === 0 ? num : whole && Math.round(mag) === 1 ? power(k) : `${num}\\,${power(k)}`;
		terms.push(`${terms.length === 0 ? (a < 0 ? '-' : '') : a < 0 ? ' - ' : ' + '}${factor}`);
	}
	return terms.join('');
}

/** The normalized sections of a prototype as TeX, pole pairs (and zeros) then the real pole. */
function sectionsTex(design) {
	const parts = design.stages.map((s) => {
		const z = s.normalized;
		if (s.order === 1) return `s = -${n4(z.breal)}`;
		const pole = `s = ${n4(z.sigma)} \\pm j\\,${n4(z.omega)}`;
		return z.z !== undefined ? `${pole}\\ \\ (\\text{zeros } \\pm j\\,${n4(Math.sqrt(z.z))})` : pole;
	});
	return parts.join(', \\quad ');
}

/* ------------------------------------------------------------------------ */
/* The response itself (top of the Stages panel)                             */
/* ------------------------------------------------------------------------ */

/** Derives the magnitude response and the poles (and zeros) of one of the four newer responses. */
export function explainModernApproximation(design) {
	const { response, n, amaxDb, aminDb } = design;
	const hp = design.filterType === 'highpass';
	const eps = ripple(amaxDb);
	const epsS = ripple(aminDb);
	const blocks = [];
	if (response === 'bessel') {
		const theta = besselPolynomial(n);
		blocks.push(
			p(
				'Bessel (W. E. Thomson, 1949) spends that freedom on the phase instead of the magnitude. A filter delays each frequency by its group delay, the slope of its phase: τ(ω) = -dφ/dω. When the delay is the same at every frequency of the passband, a pulse or a square wave comes out with its shape intact, only later. Bessel makes the delay as flat as possible at DC: the same "maximally flat" idea as Butterworth, applied to the delay rather than the gain. The denominator that does it is a reverse Bessel polynomial:'
			),
			eq('H(s) = \\dfrac{\\theta_n(0)}{\\theta_n(s)}, \\qquad \\theta_n(s) = \\sum_{k=0}^{n} \\dfrac{(2n-k)!}{2^{\\,n-k}\\,k!\\,(n-k)!}\\, s^k'),
			eq(`\\theta_{${n}}(s) = ${polyTex(theta, (k) => (k === 1 ? 's' : `s^{${k}}`))}`),
			p(
				'That H(s) delays by exactly 1 s at DC. Its poles are the roots of θ_n, found numerically (there is no closed form past n = 2). The spec only fixes where Amax is lost, so the prototype is then stretched in frequency until it loses exactly Amax at ωp. Normalized that way, the poles are:'
			),
			eq(sectionsTex(design)),
			p(
				`The price is selectivity. The loss grows slowly past ωp, and as n grows the response tends to a Gaussian, whose loss in dB grows with the square of the frequency: at twice the frequency where Amax is lost, the loss approaches 4 × Amax = ${n2(4 * amaxDb)} dB whatever the order. That is why a Bessel filter needs a high order for a sharp spec, or cannot meet it at all.`
			)
		);
	} else if (response === 'legendre') {
		const L = legendrePolynomial(n);
		blocks.push(
			p(
				'Legendre (A. Papoulis, 1958, also called the optimum L filter) keeps Butterworth\'s promise that the loss only ever grows with frequency, no ripple anywhere, but gives up the flatness at DC to fall as steeply as possible at the passband edge. Its response is Butterworth\'s with the power (ω/ωp)^(2n) replaced by a polynomial L_n of the same degree:'
			),
			eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon^2 L_n\\!\\left(\\omega^2/\\omega_p^2\\right)}'),
			p(
				'L_n starts at 0 (gain 1 at DC), reaches 1 at the band edge (so exactly Amax is lost there, with the same ε as Butterworth), never decreases in between (its derivative is a perfect square), and among all polynomials that do all three it has the largest slope at the edge. Papoulis found it as an integral of a sum of Legendre polynomials P_i; for an odd order n = 2k+1:'
			),
			eq('L_n(w) = \\dfrac{1}{2(k+1)^2}\\int_{-1}^{2w-1}\\left[\\sum_{i=0}^{k}(2i+1)\\,P_i(x)\\right]^2 dx'),
			p('(an even order uses (x+1) times the square of the sum over the i of the same parity as k, divided by (k+1)(k+2)). For this design:'),
			eq(`L_{${n}}(\\omega^2) = ${polyTex(L, (k) => (k === 1 ? '\\omega^2' : `\\omega^{${2 * k}}`))}, \\qquad \\varepsilon = \\sqrt{10^{A_{max}/10} - 1} = ${n4(eps)}`),
			p('The poles are the stable roots of 1 + ε^2 L_n(-s^2/ωp^2), found numerically:'),
			eq(sectionsTex(design)),
			p(
				'It needs fewer stages than Butterworth for the same spec, and more than Chebyshev, which buys its steepness with ripple instead. What it pays is a passband that starts drooping earlier, and stages with a higher Q than Butterworth\'s.'
			)
		);
	} else if (response === 'inverseChebyshev') {
		const reached = design.prototype?.aminReached;
		const epsReached = ripple(reached);
		blocks.push(
			p(
				'The inverse Chebyshev (Chebyshev type II) turns the Chebyshev idea inside out. The passband is monotonic and flat at DC, like Butterworth, and the ripple goes to the stopband instead, where the loss bounces between a floor and infinity. The infinite loss happens at zeros of transmission, frequencies the filter blocks completely, which no all-pole response has. Written with the stopband edge ωs as the reference:'
			),
			eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\dfrac{1}{\\varepsilon_s^2\\, C_n^2(\\omega_s/\\omega)}}'),
			p(
				'Past ωs the Chebyshev polynomial C_n(ωs/ω) swings between -1 and 1, so the loss never drops below 10log(1+ε_s^2), and wherever C_n is 0 the loss is infinite: those are the zeros. Below ωs, C_n grows and the loss falls to 0 at DC.'
			),
			eq('\\omega_{z,i} = \\dfrac{\\omega_s}{\\cos\\theta_i}, \\qquad \\theta_i = \\dfrac{(2i+1)\\pi}{2n}'),
			p(
				`Here ωs is put exactly at fs, and ε_s is chosen so that exactly Amax is lost at fp, where the argument of C_n is ${hp ? 'ωp/ωs' : 'ωs/ωp'} = 1/k. That floor is at least Amin (it is exactly Amin when n was not rounded up), so the extra order from rounding up becomes margin in the stopband:`
			),
			eq(
				`\\varepsilon_s = \\varepsilon_p\\, C_n(1/k) = ${n4(eps)} \\times \\cosh\\!\\left(${n}\\,\\operatorname{acosh}\\,${n4(1 / design.k)}\\right) = ${n2(epsReached)} \\ \\Rightarrow\\ A_{min}' = 10\\log_{10}(1 + \\varepsilon_s^2) = ${n2(reached)}\\ \\text{dB} \\ge ${aminDb}\\ \\text{dB}`
			),
			p('The poles are those of a Chebyshev I filter with ε = 1/ε_s, inverted: each s_i becomes 1/s_i. Normalized to ωp = 1, the poles and zeros are:'),
			eq(sectionsTex(design)),
			p('Each pole pair is built together with one pair of zeros as a notch stage; the stages that only make poles (MFB, Sallen-Key) cannot place zeros.')
		);
	} else if (response === 'elliptic') {
		const m = design.prototype?.m;
		const k1 = design.prototype?.k1;
		const reached = design.prototype?.aminReached;
		blocks.push(
			p(
				'Elliptic (W. Cauer, 1930s) spends the freedom on both bands at once: ripple of exactly Amax across the passband, an equal ripple across the stopband, and zeros of transmission in the stopband as in the inverse Chebyshev. For a given order no filter falls faster from passband to stopband. Chebyshev\'s polynomial becomes an elliptic rational function R_n, built from Jacobi elliptic functions:'
			),
			eq('\\left|H(j\\omega)\\right|^2 = \\dfrac{1}{1 + \\varepsilon_p^2\\, R_n^2(\\omega/\\omega_p)}, \\qquad \\varepsilon_p = \\sqrt{10^{A_{max}/10} - 1}'),
			p(
				'R_n swings between -1 and 1 in the passband (the Amax ripple) and stays above 1/k1 in the stopband (the stopband ripple, infinite at the zeros), with k1 = εp/εs the discrimination. The selectivity k = ωp/ωs of the spec and k1 are tied to the order by the degree equation (panel 02). Solved for k1 with this whole order and the spec\'s k, it says how deep the stopband gets; with n rounded up that is more than Amin, so the extra order becomes margin in the stopband:'
			),
			eq(
				`k = ${n4(Math.sqrt(m))}, \\quad k_1 = ${n4(k1)} \\ \\Rightarrow\\ A_{min}' = 10\\log_{10}\\!\\left(1 + \\dfrac{\\varepsilon_p^2}{k_1^2}\\right) = ${n2(reached)}\\ \\text{dB} \\ge ${aminDb}\\ \\text{dB}`
			),
			p(
				'(In terms of nomes, q = exp(-πK\'(k)/K(k)), the degree equation is just q1 = q^n, which is how k1 is computed.)'
			),
			p(
				'The zeros and poles come from the Jacobi elliptic functions sn, cn, dn (the elliptic counterparts of sin and cos) at n equally spaced points of the quarter period K, shifted off the axis by v0, which carries Amax:'
			),
			eq('\\omega_{z,i} = \\dfrac{\\omega_p}{k\\,\\operatorname{sn}(u_i K/n,\\ k)}, \\qquad u_i = n-1,\\ n-3,\\ \\ldots'),
			eq(
				'p_i = -\\dfrac{c\\,d\\,s_v c_v + j\\,s\\,d_v}{1 - (d\\,s_v)^2}, \\quad (s, c, d) = \\operatorname{sn},\\operatorname{cn},\\operatorname{dn}(u_i K/n,\\ k), \\quad (s_v, c_v, d_v) \\text{ at } v_0 \\text{ with } k\' = \\sqrt{1-k^2}'
			),
			eq(`v_0 = \\dfrac{K(k)\\,F\\!\\left(\\arctan(1/\\varepsilon_p),\\ k_1'\\right)}{n\\,K(k_1)} = ${n4(design.prototype?.v0)}`),
			p('Normalized to ωp = 1, the poles and zeros of this design:'),
			eq(sectionsTex(design)),
			p(
				'Each pole pair is built with one pair of zeros as a notch stage; with an even order the passband ripples above its DC value, and the top of the passband is the reference for Amax and Amin, as for an even-order Chebyshev.'
			)
		);
	}
	blocks.push(
		p(
			'Each pair of poles becomes one second-order stage (a notch stage when it carries a pair of zeros); for an odd order the real pole has no partner and becomes the first-order stage.'
		)
	);
	if (hp) {
		blocks.push(
			p(
				'This is a high-pass design, built the standard way: design the low-pass prototype above, then flip it with s -> 1/s (done stage by stage below). The loss that was at ω is now at ωp^2/ω, so Amax is still lost at fp, the stopband is below it, and any zeros move below the passband too.'
			)
		);
	}
	return blocks;
}

/* ------------------------------------------------------------------------ */
/* The order (panel 02)                                                      */
/* ------------------------------------------------------------------------ */

/** The one-line order result shown in panel 02, for any response. */
export function orderSummaryTex({ response, minOrder, tried, aminDb }) {
	if (response === 'bessel' || response === 'legendre') {
		if (!tried?.length) return '';
		const last = tried[tried.length - 1];
		const before = tried.length > 1 ? tried[tried.length - 2] : null;
		const reached = last.loss >= aminDb;
		const shown = before ? `A_{${before.n}} = ${n2(before.loss)}\\ \\text{dB},\\ \\ A_{${last.n}} = ${n2(last.loss)}\\ \\text{dB}` : `A_{${last.n}} = ${n2(last.loss)}\\ \\text{dB}`;
		return `A_n\\!\\left(\\tfrac{1}{k}\\right) \\ge A_{min} = ${aminDb}\\ \\text{dB}: \\quad ${shown} \\ \\Rightarrow\\ ${reached ? `n = ${last.n}` : `n > ${last.n}`}`;
	}
	if (response === 'elliptic') {
		return `n \\geq \\dfrac{K(k)\\,K'(k_1)}{K'(k)\\,K(k_1)} = ${n4(minOrder)}`;
	}
	if (response === 'chebyshev' || response === 'inverseChebyshev') {
		return `n \\geq \\dfrac{\\operatorname{acosh}\\!\\sqrt{\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}}}{\\operatorname{acosh}(1/k)} = ${n4(minOrder)}`;
	}
	return `n \\geq \\dfrac{\\log\\!\\left[\\dfrac{10^{A_{min}/10}-1}{10^{A_{max}/10}-1}\\right]}{2\\log(1/k)} = ${n4(minOrder)}`;
}

/** Where the order comes from, for the four newer responses. */
export function explainModernOrder({ response, amaxDb, aminDb, k, minOrder, tried, filterType = 'lowpass', nUsed = null }) {
	const hp = filterType === 'highpass';
	const eps = ripple(amaxDb);
	const epsS = ripple(aminDb);
	const edge = hp ? 'ωp/ωs' : 'ωs/ωp';
	const nFinal = nUsed ?? (Number.isFinite(minOrder) ? Math.max(1, Math.ceil(minOrder)) : null);
	if (response === 'bessel' || response === 'legendre') {
		const blocks = [
			p(
				`The order n is the smallest number of poles that meets both ends of the spec. At fp the loss is exactly Amax by construction; at fs it must reach Amin, where ${edge} = 1/k = ${n4(1 / k)}. For ${RESPONSES[response].label} there is no closed formula for that loss as a function of n, so it is simply computed for n = 1, 2, 3, ... until it reaches Amin:`
			),
			response === 'legendre'
				? eq(`A_n = 10\\log_{10}\\!\\left(1 + \\varepsilon^2 L_n\\!\\left(\\tfrac{1}{k^2}\\right)\\right), \\qquad \\varepsilon = ${n4(eps)}`)
				: eq('A_n = -20\\log_{10}\\left|H_n\\!\\left(j\\,\\tfrac{1}{k}\\right)\\right|, \\qquad H_n \\text{ the Bessel prototype of order } n \\text{ losing } A_{max} \\text{ at } 1')
		];
		for (let i = 0; i < (tried ?? []).length; i += 6) {
			blocks.push(eq((tried ?? []).slice(i, i + 6).map((t) => `A_{${t.n}} = ${n2(t.loss)}`).join(', \\quad ') + '\\ \\text{dB}'));
		}
		const last = tried?.[tried.length - 1];
		blocks.push(
			p(
				last && last.loss >= aminDb
					? `n = ${last.n} is the first order that reaches ${aminDb} dB, so the filter uses n = ${nUsed ?? last.n}. The Bode plot panel checks both edges again with the rounded components.`
					: `None of the orders tried reaches ${aminDb} dB at fs${response === 'bessel' ? ': past a point a Bessel filter barely steepens with order, as its response tends to a Gaussian' : ''}. Loosen Amax, Amin or the edges, or pick a steeper response.`
			)
		);
		return blocks;
	}
	if (response === 'inverseChebyshev') {
		return [
			p(
				`The order n is the smallest number of poles that meets both ends of the spec. The inverse Chebyshev meets Amin exactly across its stopband by construction (that is how ε_s is defined), so the condition left is the passband: at fp the argument of C_n is the ratio of the two edges, ${hp ? 'ωp/ωs' : 'ωs/ωp'} = 1/k, and the loss there must stay within Amax:`
			),
			eq('10\\log_{10}\\!\\left(1 + \\dfrac{\\varepsilon_s^2}{C_n^2(1/k)}\\right) \\le A_{max} \\ \\Rightarrow\\ C_n(1/k) = \\cosh\\!\\left(n\\,\\operatorname{acosh}\\tfrac{1}{k}\\right) \\ge \\dfrac{\\varepsilon_s}{\\varepsilon_p}'),
			p('Undoing the cosh gives the same formula as Chebyshev I: the two responses are one polynomial seen from either side.'),
			eq(
				`n \\ge \\dfrac{\\operatorname{acosh}(\\varepsilon_s/\\varepsilon_p)}{\\operatorname{acosh}(1/k)} = \\dfrac{\\operatorname{acosh}(${n2(epsS)}/${n4(eps)})}{\\operatorname{acosh}(${n4(1 / k)})} = ${n4(minOrder)} \\ \\Rightarrow\\ n = ${nFinal}`
			),
			p('Rounding up leaves margin; it goes to the stopband, which then loses a little more than Amin (panel 03 gives the figure).')
		];
	}
	// elliptic
	const m = k * k;
	const m1 = (eps / epsS) ** 2;
	return [
		p(
			'The order of an elliptic filter comes from the degree equation, which ties three numbers: the order n, the selectivity k = ωp/ωs of the transition, and the discrimination k1 = εp/εs of the two ripples. It is written with the complete elliptic integral of the first kind K and its complement K\'(k) = K(√(1-k^2)):'
		),
		eq('K(k) = \\int_0^{\\pi/2}\\dfrac{d\\phi}{\\sqrt{1 - k^2\\sin^2\\phi}}, \\qquad n = \\dfrac{K(k)\\,K\'(k_1)}{K\'(k)\\,K(k_1)}'),
		eq(`k = ${n4(k)}, \\quad k_1 = \\dfrac{\\varepsilon_p}{\\varepsilon_s} = \\dfrac{${n4(eps)}}{${n2(epsS)}} = ${n4(Math.sqrt(m1))}`),
		eq(
			`n = \\dfrac{${n4(ellipK(m))} \\times ${n4(ellipKp(m1))}}{${n4(ellipKp(m))} \\times ${n4(ellipK(m1))}} = ${n4(minOrder)} \\ \\Rightarrow\\ n = ${nFinal}`
		),
		p(
			'K is computed with the arithmetic-geometric mean: K(k) = π / (2 AGM(1, √(1-k^2))), a few steps to full precision. Rounding n up leaves margin; the prototype spends it on the stopband, which then loses more than Amin (panel 03 gives the figure).'
		)
	];
}

/* ------------------------------------------------------------------------ */
/* One stage of a newer response (Stages panel, per stage)                   */
/* ------------------------------------------------------------------------ */

/** Pole pair (and zero) of one second-order stage of a newer response, low-pass or high-pass. */
export function modernStageBlocks(design, stageIndex) {
	const stage = design.stages[stageIndex];
	const s = stage.normalized;
	const hp = stage.filterType === 'highpass';
	const hasZero = s.z !== undefined;
	const blocks = [
		p(
			`Stage ${stageIndex + 1} takes one pole pair of the prototype listed at the top of this panel, σ ± jω in units of the passband edge${hasZero ? ', together with one pair of zeros ±j√z' : ''}. Multiplying out (s - σ - jω)(s - σ + jω) gives its denominator:`
		),
		eq(`\\sigma = ${n4(s.sigma)}, \\quad \\omega = ${n4(s.omega)} \\ \\Rightarrow\\ a = -2\\sigma = ${n4(s.a)}, \\quad b = \\sigma^2 + \\omega^2 = ${n4(s.b)}`),
		hasZero
			? eq(`H(s) = \\dfrac{b}{z}\\,\\dfrac{s^2 + z}{s^2 + a s + b}, \\qquad z = ${n4(s.z)}\\ \\ (\\text{zero at } \\sqrt{z} = ${n4(Math.sqrt(s.z))})`)
			: eq('H(s) = \\dfrac{b}{s^2 + a s + b}')
	];
	if (hp) {
		blocks.push(
			p('For a high-pass the stage is flipped with s -> 1/s first; the denominator keeps its shape with new coefficients, and a zero at z moves to 1/z:'),
			eq(`a_{hp} = \\dfrac{a}{b} = ${n4(s.aHp)}, \\qquad b_{hp} = \\dfrac{1}{b} = ${n4(s.bHp)}${hasZero ? `, \\qquad z_{hp} = \\dfrac{1}{z} = ${n4(s.zHp)}` : ''}`)
		);
	}
	const A = hp ? s.aHp : s.a;
	const B = hp ? s.bHp : s.b;
	blocks.push(
		p(
			`Denormalizing replaces s by s/ωc with ωc = 2πfp (the prototype already loses exactly Amax at 1 rad/s, so no extra factor): ωc = ${n2(design.wc)} rad/s. Matching the standard form gives the stage's corner and Q${hasZero ? ', and the zero moves with it' : ''}:`
		),
		eq(
			`\\omega_n = \\omega_c\\sqrt{b${hp ? '_{hp}' : ''}} = ${n2(stage.wn)}\\ \\text{rad/s}\\ \\ (f_0 = ${formatHz(stage.wn / (2 * Math.PI))}), \\qquad Q = \\dfrac{\\sqrt{b${hp ? '_{hp}' : ''}}}{a${hp ? '_{hp}' : ''}} = \\dfrac{${n4(Math.sqrt(B))}}{${n4(A)}} = ${n4(stage.q)}`
		)
	);
	if (hasZero) {
		blocks.push(
			eq(`\\omega_z = \\omega_c\\sqrt{z${hp ? '_{hp}' : ''}} = ${n2(stage.wz)}\\ \\text{rad/s}\\ \\ (f_z = ${formatHz(stage.wz / (2 * Math.PI))})`),
			eq(
				hp
					? 'H(s) = \\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2} \\quad (\\text{gain 1 far above the zero})'
					: 'H(s) = \\dfrac{\\omega_n^2}{\\omega_z^2}\\,\\dfrac{s^2 + \\omega_z^2}{s^2 + \\frac{\\omega_n}{Q}s + \\omega_n^2} \\quad (\\text{gain 1 at DC})'
			)
		);
	}
	return blocks;
}

/** The leftover real pole of a newer response (odd order). */
export function modernRealPoleBlocks(design, stage) {
	const hp = stage.filterType === 'highpass';
	return [
		p(
			'A filter of odd order has one pole left over on the real axis. It becomes a plain single-pole RC stage whose time constant tau sets its corner. In the prototype listed at the top of this panel it sits at:'
		),
		eq(`s = -b_{\\text{real}} = -${n4(stage.normalized.breal)}`),
		...(hp
			? [
					p('For a high-pass it is flipped with s -> 1/s, which moves it to 1/b_real, then denormalized with ωc = 2πfp:'),
					eq(`b_{\\text{real,hp}} = \\dfrac{1}{${n4(stage.normalized.breal)}} = ${n4(stage.normalized.brealHp)}, \\qquad \\tau = \\dfrac{1}{\\omega_c\\, b_{\\text{real,hp}}}, \\qquad H(s) = \\dfrac{\\tau s}{\\tau s + 1}`)
				]
			: [p('Denormalized with ωc = 2πfp (no extra factor for this response):'), eq('\\tau = \\dfrac{1}{\\omega_c\\, b_{\\text{real}}}, \\qquad H(s) = \\dfrac{1}{\\tau s + 1}')]),
		eq(`\\omega_c = ${n2(design.wc)}\\ \\text{rad/s} \\ \\Rightarrow\\ \\tau = ${formatSeconds(stage.tau)}`)
	];
}

/* ------------------------------------------------------------------------ */
/* The notch stage's components (Components panel)                           */
/* ------------------------------------------------------------------------ */

/** Tow-Thomas notch (feed-forward) derivation for one realized stage. */
export function explainTowThomasNotch(stageDesign, targetWn, targetQ, targetWz) {
	const st = stageDesign.steps;
	const c = stageDesign.components;
	const a = stageDesign.actual;
	const low = stageDesign.lowSide;
	const f0 = targetWn / (2 * Math.PI);
	const dcDb = 20 * Math.log10(Math.abs(a.dcGain));
	return [
		p(
			'A stage with zeros needs a circuit that can make them. The MFB and Sallen-Key stages here only make poles, so every stage with a pair of zeros is a Tow-Thomas biquad with feed-forward: the loop of the Tow-Thomas high-pass (A1 damped integrator, A2 integrator, A3 inverter, input through Cin into A1), plus one resistor Rz from the input into A2\'s summing node. Node by node:'
		),
		eq(
			'\\text{at N1:}\\ sC_{in}V_{in} + \\dfrac{V_3}{R_a} + V_1\\left(sC + \\dfrac{1}{R_d}\\right) = 0, \\qquad \\text{at N2:}\\ \\dfrac{V_1}{R_b} + \\dfrac{V_{in}}{R_z} + sC V_2 = 0, \\qquad V_3 = -V_2'
		),
		p('Eliminating V_2 and V_3 leaves V_1, the output, with an s^2 term from Cin and a constant from Rz on top, and no s term: a pair of zeros on the jω axis.'),
		eq(
			'\\dfrac{V_{out}}{V_{in}} = -\\dfrac{\\frac{C_{in}}{C}\\,s^2 + \\frac{1}{C^2 R R_z}}{s^2 + \\frac{s}{C R_d} + \\frac{1}{C^2 R^2}}, \\qquad \\omega_n = \\dfrac{1}{RC},\\ \\ Q = \\dfrac{R_d}{R},\\ \\ \\omega_z^2 = \\dfrac{1}{C\\,C_{in} R R_z}'
		),
		p(
			low
				? 'Far above the zero the gain is -Cin/C, at DC it is -R/Rz. A stage of a low-pass must pass DC at gain 1, which sets Rz = R, and then the zero fixes the capacitor ratio:'
				: 'Far above the zero the gain is -Cin/C, at DC it is -R/Rz. A stage of a high-pass must pass high frequencies at gain 1, which sets Cin = C, and then the zero fixes Rz:'
		),
		eq(
			low
				? '\\text{DC gain } 1:\\ R_z = R \\ \\Rightarrow\\ C_{in} = C\\left(\\dfrac{\\omega_n}{\\omega_z}\\right)^2'
				: '\\text{gain } 1 \\text{ above the zero}:\\ C_{in} = C \\ \\Rightarrow\\ R_z = R\\left(\\dfrac{\\omega_n}{\\omega_z}\\right)^2'
		),
		p(
			`This stage's target: f0 = ${formatHz(f0)}, Q = ${targetQ.toFixed(4)}, zero at ${formatHz(targetWz / (2 * Math.PI))}. ${stageDesign.manual ? 'C below was entered by hand.' : `C is picked so that R lands near 10 kilo-ohm${low ? ' and a stocked Cin comes close to its ideal ratio' : ''}.`} R and Rd follow as in any Tow-Thomas stage:`
		),
		eq(`C = ${formatFarads(st.C)}\\ \\Rightarrow\\ R = \\dfrac{1}{\\omega_n C} = ${formatOhms(st.Rtarget)} \\rightarrow ${formatOhms(c.Ra)}, \\qquad R_d = QR \\rightarrow ${formatOhms(c.Rd)}`),
		...(low
			? [
					eq(`C_{in} = C\\left(\\dfrac{\\omega_n}{\\omega_z}\\right)^2 = ${formatFarads(st.CinIdeal)} \\rightarrow ${formatFarads(c.Cin)}`),
					p('Cin comes from the coarse capacitor series, so Rz is solved against the parts actually used, which puts the zero exactly where it belongs and moves the rounding into the DC gain instead:'),
					eq(`R_z = \\dfrac{1}{C\\,C_{in} R\\,\\omega_z^2} = ${formatOhms(st.RzTarget)} \\rightarrow ${formatOhms(c.Rz)}, \\qquad \\text{DC gain} = -\\dfrac{R}{R_z} = ${a.dcGain.toFixed(4)}\\ (${dcDb >= 0 ? '+' : ''}${dcDb.toFixed(2)}\\ \\text{dB})`)
				]
			: [eq(`C_{in} = C = ${formatFarads(c.Cin)}, \\qquad R_z = \\dfrac{1}{C^2 R\\,\\omega_z^2} = ${formatOhms(st.RzTarget)} \\rightarrow ${formatOhms(c.Rz)}`)]),
		p('Recomputing from the rounded values:'),
		eq(
			`f_0' = ${formatHz(a.wn / (2 * Math.PI))}, \\quad Q' = ${a.q.toFixed(4)}, \\quad f_z' = \\dfrac{1}{2\\pi\\sqrt{C\\,C_{in}RR_z}} = ${formatHz(a.wz / (2 * Math.PI))}, \\quad H(\\infty) = ${a.gain.toFixed(4)}`
		),
		p(
			`The stage inverts, like the Tow-Thomas high-pass. Its sensitivities are those of the Tow-Thomas (1/2 and 1, whatever the Q); the zero depends on C, Cin, R and Rz each with sensitivity -1/2, and on nothing that sets the poles alone, which is why notch stages are usually built this way rather than with one op-amp.${low ? ' The small DC gain error from Cin is a flat step across the passband: the spec, measured from the top of the passband, does not see it, and a band-stop evens it out in its combiner.' : ''}`
		)
	];
}
