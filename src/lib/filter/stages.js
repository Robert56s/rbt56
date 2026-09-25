import { butterworthOrder, butterworthStages, chebyshevOrder, chebyshevStages, transitionRatio } from './order';
import { ellipticOrder, inverseChebyshevOrder, prototypeFor, searchedOrder } from './approximations';

/**
 * Ripple factor epsilon = sqrt(10^(Amax/10) - 1): the one number the
 * passband spec Amax turns into. |H(j omega_p)| = 1/sqrt(1 + eps^2) for
 * both responses, so eps = 1 is exactly Amax = 3.0103 dB.
 */
export function rippleFactor(amaxDb) {
	return Math.sqrt(10 ** (amaxDb / 10) - 1);
}

/**
 * The minimum order a response needs for the spec, with k the transition
 * ratio (below 1). Butterworth, Chebyshev I, inverse Chebyshev and elliptic
 * have a closed form, returned as the unrounded value; Bessel and Legendre
 * are counted by trying each order in turn, and return the losses they
 * reached at the stopband edge on the way (n is null when none of the
 * orders tried gets there).
 */
export function minimumOrder(response, amaxDb, aminDb, k) {
	if (response === 'bessel' || response === 'legendre') {
		const { n, tried } = searchedOrder(response, amaxDb, aminDb, k);
		return { value: n ?? Infinity, n, tried };
	}
	const value =
		response === 'chebyshev'
			? chebyshevOrder(amaxDb, aminDb, k)
			: response === 'inverseChebyshev'
				? inverseChebyshevOrder(amaxDb, aminDb, k)
				: response === 'elliptic'
					? ellipticOrder(amaxDb, aminDb, k)
					: butterworthOrder(amaxDb, aminDb, k);
	return { value, n: Math.max(1, Math.ceil(value)), tried: null };
}

/** Butterworth and Chebyshev I have the pole formulas of order.js; the rest come from approximations.js. */
const classic = (response) => response === 'butterworth' || response === 'chebyshev';

/**
 * Where the Butterworth pole circle sits relative to the passband edge.
 *
 * A Butterworth low-pass is |H(j omega)|^2 = 1 / (1 + eps^2 (omega/omega_p)^(2n)),
 * so its n poles lie on a circle of radius omega_0 = omega_p * eps^(-1/n),
 * and omega_0 is also its -3 dB frequency. Only when Amax = 3.0103 dB
 * (eps = 1) does that circle sit exactly at omega_p; for a smaller Amax the
 * poles have to move OUT past omega_p so that only Amax dB is lost there,
 * and for a larger Amax they move in. A high-pass is the mirror image
 * (omega_0 = omega_p * eps^(+1/n): the poles move in for a smaller Amax).
 *
 * Every other response needs no such scaling: Chebyshev's prototype is
 * normalized to the ripple edge omega_p directly, with eps already baked
 * into the pole ellipse through beta (see chebyshevStages), and the
 * prototypes of approximations.js are all built to lose exactly Amax at 1.
 */
export function cutoffScale(response, amaxDb, n, filterType = 'lowpass') {
	if (response !== 'butterworth') return 1;
	const eps = rippleFactor(amaxDb);
	return filterType === 'highpass' ? eps ** (1 / n) : eps ** (-1 / n);
}

/**
 * The normalized low-pass prototype of any response as second-order
 * sections (with the zero z of a notch section when the response has
 * one) and the leftover real pole of an odd order.
 */
function prototypeSections(response, n, amaxDb, aminDb, k) {
	if (classic(response)) {
		const proto = response === 'chebyshev' ? chebyshevStages(n, amaxDb) : butterworthStages(n);
		return { sections: proto.stages, real: proto.real, beta: proto.beta, extra: {} };
	}
	const proto = prototypeFor(response, n, amaxDb, aminDb, k);
	const sections = proto.sections.map((s) => ({ a: s.a, b: s.b, ...(s.z !== undefined ? { z: s.z } : {}), sigma: -s.a / 2, omega: Math.sqrt(Math.max(0, s.b - (s.a * s.a) / 4)) }));
	const { sections: _s, real, ...extra } = proto;
	return { sections, real, beta: undefined, extra };
}

/**
 * Turns a spec (Amax, Amin, fp, fs) into the order and the realizable
 * stages for a low-pass filter, denormalized to the real cutoff.
 *
 * omega_c = 2*pi*fp * cutoffScale (see cutoffScale: 1 for everything but
 * Butterworth, eps^(-1/n) for Butterworth). Substituting s -> s/omega_c into each
 * normalized stage s^2 + a*s + b gives s^2 + (a*omega_c)*s + (b*omega_c^2),
 * i.e. a standard second-order low-pass with:
 *   omega_n = omega_c * sqrt(b)
 *   Q       = sqrt(b) / a
 * built as its own unity-DC-gain block. A stage with a zero (elliptic,
 * inverse Chebyshev) keeps it at omega_z = omega_c * sqrt(z) and is built
 * as a notch with unity DC gain. Every stage stands on its own, so no
 * extra gain stage is needed to cascade them.
 */
export function designLowPass({ response, amaxDb, aminDb, fp, fs, order }) {
	const k = transitionRatio(fp, fs);
	const min = minimumOrder(response, amaxDb, aminDb, k);
	const n = order ?? min.n ?? 1;
	const proto = prototypeSections(response, n, amaxDb, aminDb, k);

	const eps = rippleFactor(amaxDb);
	const wcScale = cutoffScale(response, amaxDb, n, 'lowpass');
	const wc = 2 * Math.PI * fp * wcScale;
	const stages = proto.sections.map((s) => ({
		order: 2,
		filterType: 'lowpass',
		wn: wc * Math.sqrt(s.b),
		q: Math.sqrt(s.b) / s.a,
		...(s.z !== undefined ? { wz: wc * Math.sqrt(s.z) } : {}),
		normalized: s
	}));
	if (proto.real) {
		stages.push({ order: 1, filterType: 'lowpass', tau: 1 / (wc * proto.real.breal), normalized: proto.real });
	}

	return {
		k,
		minOrder: min.value,
		orderSearch: min.tried,
		n,
		wc,
		stages,
		response,
		amaxDb,
		aminDb,
		fp,
		fs,
		eps,
		wcScale,
		filterType: 'lowpass',
		beta: proto.beta,
		prototype: proto.extra
	};
}

/**
 * Turns a spec into the order and realizable stages for a high-pass
 * filter. High-pass is the low-pass prototype with s -> 1/s applied
 * before denormalizing: for a stage s^2 + a*s + b, that gives
 *   a_hp = a / b,   b_hp = 1 / b
 * (Q is invariant under this transform - Q_hp = sqrt(b_hp)/a_hp works out
 * to sqrt(b)/a = Q_lp exactly), and a zero at s^2 = -z moves to
 * s^2 = -1/z, below the passband. The order/k formulas are unchanged from
 * low-pass; only the roles of fp and fs swap (fp is now the higher,
 * passband edge, fs the lower, stopband edge), so k = fs/fp instead of
 * fp/fs. omega_c for denormalizing is 2*pi*fp times cutoffScale, which for
 * Butterworth is eps^(+1/n) here (the poles move in, not out, for a high-pass).
 */
export function designHighPass({ response, amaxDb, aminDb, fp, fs, order }) {
	const k = transitionRatio(fs, fp);
	const min = minimumOrder(response, amaxDb, aminDb, k);
	const n = order ?? min.n ?? 1;
	const proto = prototypeSections(response, n, amaxDb, aminDb, k);

	const eps = rippleFactor(amaxDb);
	const wcScale = cutoffScale(response, amaxDb, n, 'highpass');
	const wc = 2 * Math.PI * fp * wcScale;
	const stages = proto.sections.map((s) => {
		const aHp = s.a / s.b;
		const bHp = 1 / s.b;
		const zHp = s.z !== undefined ? 1 / s.z : undefined;
		return {
			order: 2,
			filterType: 'highpass',
			wn: wc * Math.sqrt(bHp),
			q: Math.sqrt(bHp) / aHp,
			...(zHp !== undefined ? { wz: wc * Math.sqrt(zHp) } : {}),
			normalized: { ...s, aHp, bHp, ...(zHp !== undefined ? { zHp } : {}) }
		};
	});
	if (proto.real) {
		const brealHp = 1 / proto.real.breal;
		stages.push({
			order: 1,
			filterType: 'highpass',
			tau: 1 / (wc * brealHp),
			normalized: { ...proto.real, brealHp }
		});
	}

	return {
		k,
		minOrder: min.value,
		orderSearch: min.tried,
		n,
		wc,
		stages,
		response,
		amaxDb,
		aminDb,
		fp,
		fs,
		eps,
		wcScale,
		filterType: 'highpass',
		beta: proto.beta,
		prototype: proto.extra
	};
}

/**
 * Wideband band-pass: a high-pass section (passband edge fl, stopband
 * edge fsl) in series with a low-pass section (passband edge fh, stopband
 * edge fsh), each designed independently with designHighPass/designLowPass
 * above and simply cascaded. This is the standard, practical way to build
 * a band-pass filter when the two edges are well separated (more than
 * about 2 octaves apart) - narrower band-pass filters need a dedicated
 * band-pass stage design instead, which this does not attempt.
 * Each returned stage already carries its own filterType ('highpass' or
 * 'lowpass') from whichever section produced it, so every downstream
 * consumer (component synthesis, math explanations, circuit diagrams,
 * Bode response) treats a band-pass design as nothing more than a mixed
 * list of ordinary low-pass and high-pass stages - no separate code path
 * needed anywhere else for band-pass itself. Since the two sections are
 * independent, each can have its own response (responseHp, responseLp;
 * both default to `response`).
 */
export function designBandPass({ response, responseHp = response, responseLp = response, amaxDb, aminDb, fl, fh, fsl, fsh, orderLow, orderHigh }) {
	const hp = designHighPass({ response: responseHp, amaxDb, aminDb, fp: fl, fs: fsl, order: orderHigh });
	const lp = designLowPass({ response: responseLp, amaxDb, aminDb, fp: fh, fs: fsh, order: orderLow });

	return {
		hp,
		lp,
		stages: [...hp.stages, ...lp.stages],
		response: responseHp === responseLp ? responseLp : null,
		responseHp,
		responseLp,
		amaxDb,
		aminDb,
		fl,
		fh,
		fsl,
		fsh
	};
}

/**
 * Wideband band-stop (notch): a low-pass branch (passes below fl, blocked
 * above fsl) and a high-pass branch (passes above fh, blocked below fsh)
 * running in PARALLEL from the same input, each an independent cascade,
 * summed by a unity-gain inverting summing amplifier (see
 * buildSummingAmpDiagram in circuits.js) rather than cascaded in series -
 * the opposite arrangement from designBandPass. Edge order here is
 * fl < fsl < fsh < fh (the stopband sits inside the two passband edges),
 * the reverse of band-pass's fsl < fl < fh < fsh.
 *
 * This only works because every stage this tool builds has an exactly
 * known, rounding-independent gain in its own passband (MFB is always
 * exactly -1 via R1=R3, Sallen-Key is always exactly +1, a unity-gain
 * follower) - so summing a fully-passing low-pass branch with a
 * fully-attenuated high-pass branch (or vice versa) reliably reconstructs
 * the original signal outside the stopband, and the notch depth in
 * between is set by the same Amin-driven order search used everywhere
 * else in this tool - no hand-matched precision components required,
 * unlike a Twin-T notch. (The one exception, a low-pass notch stage whose
 * DC gain follows a rounded capacitor ratio, is evened out by the
 * combiner's input resistor for that branch.)
 *
 * design.stages below concatenates both branches purely for listing and
 * per-stage component synthesis (identical to how a single stage is
 * handled regardless of branch); the Bode response must NOT treat this
 * as one cascade - use responseAtParallelSum/sweepParallelSum with
 * [lp.stages-worth of realized stages, hp.stages-worth] kept separate.
 * Each branch can have its own response, as for the band-pass.
 */
export function designBandStop({ response, responseHp = response, responseLp = response, amaxDb, aminDb, fl, fh, fsl, fsh, orderLow, orderHigh }) {
	const lp = designLowPass({ response: responseLp, amaxDb, aminDb, fp: fl, fs: fsl, order: orderLow });
	const hp = designHighPass({ response: responseHp, amaxDb, aminDb, fp: fh, fs: fsh, order: orderHigh });

	return {
		lp,
		hp,
		stages: [...lp.stages, ...hp.stages],
		response: responseHp === responseLp ? responseLp : null,
		responseHp,
		responseLp,
		amaxDb,
		aminDb,
		fl,
		fh,
		fsl,
		fsh
	};
}
