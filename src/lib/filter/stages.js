import { butterworthOrder, butterworthStages, chebyshevOrder, chebyshevStages, transitionRatio } from './order';
import { RESPONSES, ellipJ, ellipK, ellipticOrder, inverseChebyshevOrder, prototypeFor, prototypeLossDb, searchedOrder } from './approximations';

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
 * Wideband band-pass, the cascade method: a high-pass section (passband
 * edge fl, stopband edge fsl) in series with a low-pass section (passband
 * edge fh, stopband edge fsh), each designed independently with
 * designHighPass/designLowPass above and simply cascaded. This is the
 * practical way to build a band-pass filter when the two edges are well
 * separated (more than about 2 octaves apart). A narrow band wastes
 * op-amps this way: designBandPassTransformed below is the other method,
 * one low-pass prototype turned into band-pass stages.
 * Each returned stage already carries its own filterType ('highpass' or
 * 'lowpass') from whichever section produced it, so the component
 * synthesis, the math explanations and the Bode response treat this
 * design as a mixed list of ordinary low-pass and high-pass stages. Since
 * the two sections are independent, each can have its own response
 * (responseHp, responseLp; both default to `response`) and its own limits
 * (amaxDbHp and aminDbHp at fl and fsl, amaxDbLp and aminDbLp at fh and
 * fsh; all default to amaxDb and aminDb). The result says
 * method: 'cascade', which tells it apart from a transformed design.
 */
export function designBandPass({
	response,
	responseHp = response,
	responseLp = response,
	amaxDb,
	aminDb,
	amaxDbHp = amaxDb,
	aminDbHp = aminDb,
	amaxDbLp = amaxDb,
	aminDbLp = aminDb,
	fl,
	fh,
	fsl,
	fsh,
	orderLow,
	orderHigh
}) {
	const hp = designHighPass({ response: responseHp, amaxDb: amaxDbHp, aminDb: aminDbHp, fp: fl, fs: fsl, order: orderHigh });
	const lp = designLowPass({ response: responseLp, amaxDb: amaxDbLp, aminDb: aminDbLp, fp: fh, fs: fsh, order: orderLow });

	return {
		method: 'cascade',
		hp,
		lp,
		stages: [...hp.stages, ...lp.stages],
		response: responseHp === responseLp ? responseLp : null,
		responseHp,
		responseLp,
		// one figure when both sides share it, null when they differ
		amaxDb: amaxDbHp === amaxDbLp ? amaxDbLp : null,
		aminDb: aminDbHp === aminDbLp ? aminDbLp : null,
		amaxDbHp,
		aminDbHp,
		amaxDbLp,
		aminDbLp,
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
 * Each branch can have its own response and its own limits, as for the
 * band-pass: the low-pass branch's (amaxDbLp, aminDbLp) hold at fl and
 * fsl, the high-pass branch's (amaxDbHp, aminDbHp) at fh and fsh. The page
 * gives both branches the same Amin, though: they share the one stopband
 * and each leaks into all of it (an elliptic branch's stopband stays at its
 * Amin right across), so neither can be held to more than the other.
 * The result says method: 'parallel'; designBandStopTransformed below is
 * the other method, a plain cascade of notch stages with no combiner.
 */
export function designBandStop({
	response,
	responseHp = response,
	responseLp = response,
	amaxDb,
	aminDb,
	amaxDbHp = amaxDb,
	aminDbHp = aminDb,
	amaxDbLp = amaxDb,
	aminDbLp = aminDb,
	fl,
	fh,
	fsl,
	fsh,
	orderLow,
	orderHigh
}) {
	const lp = designLowPass({ response: responseLp, amaxDb: amaxDbLp, aminDb: aminDbLp, fp: fl, fs: fsl, order: orderLow });
	const hp = designHighPass({ response: responseHp, amaxDb: amaxDbHp, aminDb: aminDbHp, fp: fh, fs: fsh, order: orderHigh });

	return {
		method: 'parallel',
		lp,
		hp,
		stages: [...lp.stages, ...hp.stages],
		response: responseHp === responseLp ? responseLp : null,
		responseHp,
		responseLp,
		amaxDb: amaxDbHp === amaxDbLp ? amaxDbLp : null,
		aminDb: aminDbHp === aminDbLp ? aminDbLp : null,
		amaxDbHp,
		aminDbHp,
		amaxDbLp,
		aminDbLp,
		fl,
		fh,
		fsl,
		fsh
	};
}

/* ---------------------------------------------- band filters by transformation */

/**
 * The centre and the width of a band, in Hz: f0 = sqrt(fl fh), the
 * geometric centre the two passband edges sit symmetric about, and
 * B = fh - fl.
 */
export function bandCentre(fl, fh) {
	return { f0: Math.sqrt(fl * fh), B: fh - fl };
}

/**
 * Where a stopband edge fs lands on the low-pass prototype, as a multiple
 * Omega of its passband edge:
 *   band-pass  Omega = |fs^2 - f0^2| / (fs B)
 *   band-stop  Omega = fs B / |f0^2 - fs^2|
 * Both passband edges land exactly on 1, and Omega is above 1 whenever the
 * four edges are in order.
 */
export function bandStopbandRatio(filterType, fl, fh, fs) {
	const B = fh - fl;
	const gap = Math.abs(fs * fs - fl * fh);
	return filterType === 'bandstop' ? (fs * B) / gap : gap / (fs * B);
}

/**
 * The least loss, from the passband peak in dB, that an equiripple
 * prototype of order n with selectivity k keeps from Omega on. In the
 * transition band that is the loss at Omega itself, from the stopband edge
 * 1/k on it is the floor the prototype reaches; an odd order climbs again
 * past its last minimum (towards its zero at infinity), so there it is the
 * loss at Omega again. An even elliptic order has DC in a ripple trough,
 * Amax under the peak.
 */
function bandLeastLoss(response, n, amaxDb, k, proto, omega) {
	const below = response === 'elliptic' && n % 2 === 0 ? amaxDb : 0;
	let last = Infinity;
	if (n % 2) last = response === 'elliptic' ? 1 / (k * ellipJ(ellipK(k * k) / n, k * k).sn) : 1 / (k * Math.sin(Math.PI / (2 * n)));
	const loss = prototypeLossDb(proto, omega) + below;
	return omega > last ? loss : Math.min(loss, proto.aminReached);
}

/**
 * The stopband edge (as k = 1/Omega_s) that gives an equiripple band-pass
 * prototype of order n the most room at both stopband edges: the worst of
 * the two margins (least loss from the edge on, less that edge's Amin) is
 * largest. A log grid of Omega_s from just above 1 to the far edge, then a
 * golden-section step around the best point. Returns the k, the floor the
 * prototype reaches, the least loss at each edge and that worst margin.
 */
function bandEquirippleFit(response, amaxDb, edges, n) {
	const lo = Math.log(1.001);
	const hi = Math.log(Math.max(edges[0].omega, edges[1].omega));
	if (!(hi > lo)) return null;
	const aminMax = Math.max(edges[0].aminDb, edges[1].aminDb);
	const at = (x) => {
		const k = Math.exp(-x);
		const proto = prototypeFor(response, n, amaxDb, aminMax, k);
		const [lossLow, lossHigh] = edges.map((e) => bandLeastLoss(response, n, amaxDb, k, proto, e.omega));
		const margin = Math.min(lossLow - edges[0].aminDb, lossHigh - edges[1].aminDb);
		return { k, floorDb: proto.aminReached, lossLow, lossHigh, margin: Number.isFinite(margin) ? margin : -Infinity };
	};
	const steps = 48;
	let best = null;
	let bestI = 0;
	for (let i = 0; i <= steps; i++) {
		const fit = at(lo + ((hi - lo) * i) / steps);
		if (best === null || fit.margin > best.margin) {
			best = fit;
			bestI = i;
		}
	}
	let a = lo + ((hi - lo) * Math.max(0, bestI - 1)) / steps;
	let b = lo + ((hi - lo) * Math.min(steps, bestI + 1)) / steps;
	const g = (Math.sqrt(5) - 1) / 2;
	let c = b - g * (b - a);
	let d = a + g * (b - a);
	let fc = at(c);
	let fd = at(d);
	for (let i = 0; i < 40; i++) {
		if (fc.margin >= fd.margin) {
			b = d;
			d = c;
			fd = fc;
			c = b - g * (b - a);
			fc = at(c);
		} else {
			a = c;
			c = d;
			fc = fd;
			d = a + g * (b - a);
			fd = at(d);
		}
		for (const fit of [fc, fd]) if (fit.margin > best.margin) best = fit;
	}
	return best;
}

/**
 * The order of the low-pass prototype behind a transformed band filter.
 * Each stopband edge has its own Omega and its own Amin. A response whose
 * stopband keeps falling (Butterworth, Chebyshev, Bessel, Legendre) only
 * has to meet each edge on its own, so n is the larger of the two edge
 * orders; Bessel and Legendre give n = null when either edge is out of
 * reach. A response with zeros (inverse Chebyshev, elliptic) has a stopband
 * that stays at one floor from its own edge on, so it is first counted for
 * the closer edge and the larger Amin together (the larger of the two edge
 * orders can leave the far edge short of its Amin). That count always
 * meets the spec, but when the closer edge needs less than the far one it
 * can be one or more too many: the closer edge may then sit in the
 * transition band, and an odd order climbs again far out. The orders from
 * the larger edge order up are then tried, each with the stopband edge that
 * leaves both edges the most room, and the first that meets both is kept:
 * lowered then holds the closed-form count, and value is that n, as for a
 * searched order. The result also holds the k and the Amin the
 * prototype is built with (for a lowered order, the floor it reaches from
 * 1/k on), and which edge binds.
 */
export function transformedOrder({ filterType, response, amaxDb, aminDbLow, aminDbHigh, fl, fh, fsl, fsh }) {
	const atEdge = (edge, f, aminDb) => {
		const omega = bandStopbandRatio(filterType, fl, fh, f);
		const min = omega > 1 ? minimumOrder(response, amaxDb, aminDb, 1 / omega) : { value: Infinity, n: null, tried: null };
		const reached = Number.isFinite(min.value);
		return { edge, f, omega, aminDb, value: reached ? min.value : Infinity, n: reached ? min.n : null, tried: min.tried };
	};
	const low = atEdge('low', fsl, aminDbLow);
	const high = atEdge('high', fsh, aminDbHigh);
	const edges = [low, high];
	const shared = { omegaLow: low.omega, omegaHigh: high.omega, edges };

	if (RESPONSES[response]?.zeros) {
		const omega = Math.min(low.omega, high.omega);
		const aminDb = Math.max(aminDbLow, aminDbHigh);
		const min = omega > 1 ? minimumOrder(response, amaxDb, aminDb, 1 / omega) : { value: Infinity };
		const reached = Number.isFinite(min.value);
		// one edge binds alone when it holds both the closer Omega and the larger Amin
		const alone = edges.filter((e) => e.omega === omega && e.aminDb === aminDb);
		const rule = {
			n: reached ? min.n : null,
			value: reached ? min.value : Infinity,
			...shared,
			equiripple: true,
			k: 1 / omega,
			aminDb,
			binding: alone.length === 1 ? alone[0].edge : 'both',
			tried: null,
			lowered: null
		};
		if (!reached || low.n === null || high.n === null) return rule;
		let found = null;
		for (let n = Math.max(low.n, high.n); n < rule.n && !found; n++) {
			const fit = bandEquirippleFit(response, amaxDb, edges, n);
			if (fit && fit.margin >= 1e-9) found = { n, fit };
		}
		if (!found) return rule;
		const { n, fit } = found;
		return {
			...rule,
			n,
			value: n,
			k: fit.k,
			aminDb: fit.floorDb,
			binding: 'both',
			lowered: { from: rule.n, value: rule.value, k: rule.k, aminDb: rule.aminDb, omegaS: 1 / fit.k, lossLow: fit.lossLow, lossHigh: fit.lossHigh }
		};
	}

	const reached = low.n !== null && high.n !== null;
	let binding;
	if (reached) binding = low.n > high.n ? 'low' : high.n > low.n ? 'high' : 'both';
	else binding = low.n === null && high.n === null ? 'both' : low.n === null ? 'low' : 'high';
	// the prototype is built for the binding edge; on a tie, the closer one
	const closer = high.omega < low.omega || (high.omega === low.omega && high.aminDb > low.aminDb) ? high : low;
	const source = binding === 'low' ? low : binding === 'high' ? high : closer;
	return {
		n: reached ? Math.max(low.n, high.n) : null,
		value: reached ? Math.max(low.value, high.value) : Infinity,
		...shared,
		equiripple: false,
		k: 1 / source.omega,
		aminDb: source.aminDb,
		binding,
		tried: source.tried,
		lowered: null
	};
}

/**
 * The k and the Amin the prototype of a transformed design is built with
 * at order n: those of the order count, except for an override under the
 * closed-form count of a lowered order, whose stopband edge is fitted the
 * same way (at or above that count, the closed form's own k and Amin).
 */
function bandPrototypeSpec(response, amaxDb, orderInfo, n) {
	const { lowered } = orderInfo;
	if (!lowered || n === orderInfo.n) return { k: orderInfo.k, aminDb: orderInfo.aminDb };
	const fit = n < lowered.from ? bandEquirippleFit(response, amaxDb, orderInfo.edges, n) : null;
	return fit ? { k: fit.k, aminDb: fit.floorDb } : { k: lowered.k, aminDb: lowered.aminDb };
}

/**
 * The two roots of s^2 - P s + w0^2 = 0 for a complex P, as two biquads
 * (wn = |r|, Q = |r| / (-2 Re r)), lower wn first. The roots multiply to
 * w0^2, so their wn sit symmetric about w0 on a log scale, and they share
 * one Q.
 */
function bandSplitPole(pRe, pIm, w0) {
	const dRe = pRe * pRe - pIm * pIm - 4 * w0 * w0;
	const dIm = 2 * pRe * pIm;
	const mod = Math.hypot(dRe, dIm);
	// the square root of d with no cancellation: the larger part from mod, the other from dIm
	let sRe;
	let sIm;
	if (dRe < 0) {
		sIm = (dIm < 0 ? -1 : 1) * Math.sqrt((mod - dRe) / 2);
		sRe = dIm / (2 * sIm);
	} else {
		sRe = Math.sqrt((mod + dRe) / 2);
		sIm = sRe > 0 ? dIm / (2 * sRe) : 0;
	}
	// the root with the larger size first, the other from the product, to keep the digits
	if (sRe * pRe + sIm * pIm < 0) {
		sRe = -sRe;
		sIm = -sIm;
	}
	const r1 = { re: (pRe + sRe) / 2, im: (pIm + sIm) / 2 };
	const m1 = r1.re * r1.re + r1.im * r1.im;
	const r2 = { re: (w0 * w0 * r1.re) / m1, im: (-w0 * w0 * r1.im) / m1 };
	return [r1, r2]
		.map((r) => {
			const wn = Math.hypot(r.re, r.im);
			return { wn, q: wn / (-2 * r.re) };
		})
		.sort((a, b) => a.wn - b.wn);
}

/** The two zeros a prototype zero turns into: wHi = r/2 + sqrt(r^2/4 + w0^2) and wLo = w0^2 / wHi. */
function bandZeroPair(r, w0) {
	const hi = r / 2 + Math.sqrt((r * r) / 4 + w0 * w0);
	return { hi, lo: (w0 * w0) / hi };
}

/** A band-pass biquad whose gain at its own centre leaves it at exactly 1 at f0. */
function bandPassBiquad(wn, q, w0, role, pole, normalized) {
	const detune = wn / w0 - w0 / wn;
	return { order: 2, filterType: 'bandpass', wn, q, gain: Math.sqrt(1 + q * q * detune * detune), w0, role, pole, normalized };
}

/**
 * A notch biquad of a transformed design. In a band-pass it is held at
 * gain 1 at f0 (hfGain is the gain far above its zero that does it); in a
 * band-stop it is held at gain 1 at DC, whichever side its zero is on.
 */
function bandNotchStage(wn, q, wz, w0, gainAt, role, pole, normalized) {
	const notch = role === 'centre' ? 'symmetric' : wz > wn ? 'low' : 'high';
	const stage = { order: 2, filterType: wz >= wn ? 'lowpass' : 'highpass', notch, wn, q, wz, gainAt };
	if (gainAt === 'f0') stage.hfGain = Math.hypot(wn * wn - w0 * w0, (wn * w0) / q) / Math.abs(wz * wz - w0 * w0);
	stage.lowSide = gainAt === 'dc' ? true : wz > wn;
	return { ...stage, w0, role, pole, normalized };
}

/**
 * Builds the low-pass prototype of a transformed design and turns each of
 * its stages into band stages, in its order (highest Q first, the real pole
 * last): a pole pair gives a lower and an upper stage, the real pole one
 * stage at f0. The prototype is a real low-pass with its passband edge at
 * B, so its poles are already in rad/s and already carry the Butterworth
 * eps^(-1/n) scaling; Amax then lands exactly on fl and fh.
 *   band-pass  s_lp = (s^2 + w0^2) / s
 *     pole P   -> roots of s^2 - P s + w0^2: two band-pass biquads
 *     real pole -1/tau -> one biquad at w0, Q = w0 tau
 *     zero Wz  -> zeros at Wz/2 + sqrt(Wz^2/4 + w0^2) and w0^2 over it, the
 *                 upper one with the upper pole (a low-pass notch), the
 *                 lower one with the lower pole (a high-pass notch)
 *   band-stop  s_lp = bw^2 s / (s^2 + w0^2)
 *     pole P   -> roots of s^2 - (bw^2/P) s + w0^2: two notches, zeros at w0
 *     real pole -1/tau -> a notch with wn = wz = w0, Q = w0 / (bw^2 tau)
 *     zero Wz  -> the same pair of zeros with bw^2/Wz in place of Wz, the
 *                 lower one with the lower pole, the upper with the upper
 */
function bandTransformed(filterType, spec, orderInfo, order) {
	const { response, amaxDb, aminDbLow, aminDbHigh, fl, fh, fsl, fsh } = spec;
	const { f0, B } = bandCentre(fl, fh);
	const w0 = 2 * Math.PI * f0;
	const bw = 2 * Math.PI * B;
	const n = order ?? orderInfo.n ?? 1;
	const proto = bandPrototypeSpec(response, amaxDb, orderInfo, n);
	const lowpass = designLowPass({ response, amaxDb, aminDb: proto.aminDb, fp: B, fs: B / proto.k, order: n });
	const stop = filterType === 'bandstop';
	const stages = [];
	lowpass.stages.forEach((st, pole) => {
		const normalized = st.normalized;
		if (st.order === 1) {
			if (stop) stages.push(bandNotchStage(w0, w0 / (bw * bw * st.tau), w0, w0, 'dc', 'centre', pole, normalized));
			else stages.push(bandPassBiquad(w0, w0 * st.tau, w0, 'centre', pole, normalized));
			return;
		}
		// the upper pole P = -sigma + j omega of this prototype stage
		const sigma = st.wn / (2 * st.q);
		const omega = st.wn * Math.sqrt(Math.max(0, 1 - 1 / (4 * st.q * st.q)));
		const scale = (bw * bw) / (st.wn * st.wn);
		const [lower, upper] = stop ? bandSplitPole(-sigma * scale, -omega * scale, w0) : bandSplitPole(-sigma, omega, w0);
		const hasZero = Number.isFinite(st.wz);
		if (!stop && !hasZero) {
			stages.push(bandPassBiquad(lower.wn, lower.q, w0, 'lower', pole, normalized));
			stages.push(bandPassBiquad(upper.wn, upper.q, w0, 'upper', pole, normalized));
			return;
		}
		const zeros = hasZero ? bandZeroPair(stop ? (bw * bw) / st.wz : st.wz, w0) : { hi: w0, lo: w0 };
		const gainAt = stop ? 'dc' : 'f0';
		stages.push(bandNotchStage(lower.wn, lower.q, zeros.lo, w0, gainAt, 'lower', pole, normalized));
		stages.push(bandNotchStage(upper.wn, upper.q, zeros.hi, w0, gainAt, 'upper', pole, normalized));
	});

	return {
		method: 'transformed',
		filterType,
		response,
		amaxDb,
		aminDbLow,
		aminDbHigh,
		aminDb: aminDbLow === aminDbHigh ? aminDbLow : null,
		fl,
		fh,
		fsl,
		fsh,
		f0,
		B,
		w0,
		bw,
		omegaLow: orderInfo.omegaLow,
		omegaHigh: orderInfo.omegaHigh,
		orderInfo,
		minOrder: orderInfo.value,
		orderSearch: orderInfo.tried,
		n,
		lowpass,
		stages
	};
}

/**
 * Band-pass by transformation: one low-pass prototype (passband edge B,
 * stopband edge B Omega) with s_lp = (s^2 + w0^2)/s, so the band edges fl
 * and fh both land on the prototype's passband edge. Every stage is held
 * at gain 1 at f0, so the whole filter is exactly 1 there (an even order of
 * a rippled response then has f0 in a ripple trough, Amax under its peaks).
 * `order` overrides the counted n.
 */
export function designBandPassTransformed({ response, amaxDb, aminDbLow, aminDbHigh, fl, fh, fsl, fsh, order = null }) {
	const spec = { response, amaxDb, aminDbLow, aminDbHigh, fl, fh, fsl, fsh };
	return bandTransformed('bandpass', spec, transformedOrder({ filterType: 'bandpass', ...spec }), order);
}

/**
 * Band-stop by transformation: one low-pass prototype with
 * s_lp = bw^2 s/(s^2 + w0^2), every stage a notch held at gain 1 at DC,
 * so the filter passes exactly 1 at DC and far above the band, with no
 * summing amplifier. One Amin holds across the stopband.
 */
export function designBandStopTransformed({ response, amaxDb, aminDb, fl, fh, fsl, fsh, order = null }) {
	const spec = { response, amaxDb, aminDbLow: aminDb, aminDbHigh: aminDb, fl, fh, fsl, fsh };
	return bandTransformed('bandstop', spec, transformedOrder({ filterType: 'bandstop', ...spec }), order);
}

/**
 * How a notch stage is built, for designBoctorNotch and
 * designTowThomasNotch. A stage of a low-pass or a high-pass (and of a
 * cascade or parallel band filter) holds its own passband at gain 1:
 * lowSide follows its filterType. A transformed stage is sorted by where
 * its zero sits (boctorLowSide is null for a symmetric notch, which Boctor
 * cannot build); Tow-Thomas then holds a band-stop stage at gain 1 at DC
 * and gives a band-pass stage the gain far above its zero that leaves it
 * at gain 1 at f0.
 */
export function notchOptions(stage) {
	if (stage.gainAt === undefined) {
		const lowSide = stage.filterType === 'lowpass';
		return { boctorLowSide: lowSide, towThomas: { lowSide } };
	}
	return {
		boctorLowSide: stage.notch === 'symmetric' ? null : stage.wz > stage.wn,
		towThomas: stage.gainAt === 'dc' ? { lowSide: true } : { gain: stage.hfGain }
	};
}
