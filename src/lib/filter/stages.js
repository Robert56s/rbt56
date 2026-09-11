import { butterworthOrder, butterworthStages, chebyshevOrder, chebyshevStages, transitionRatio } from './order';

/**
 * Turns a spec (Amax, Amin, fp, fs) into the order and the realizable
 * stages for a low-pass filter, denormalized to the real cutoff.
 *
 * For a low-pass, omega_c = omega_max = 2*pi*fp. Substituting s ->
 * s/omega_c into each normalized stage s^2 + a*s + b gives
 * s^2 + (a*omega_c)*s + (b*omega_c^2), i.e. a standard second-order
 * low-pass with:
 *   omega_n = omega_c * sqrt(b)
 *   Q       = sqrt(b) / a
 * built as its own unity-DC-gain block. Every normalized stage here already
 * has b chosen so H(0) = 1 (Butterworth: b = 1 always; Chebyshev: see the
 * numerator convention in order.js), so no extra gain stage is needed to
 * cascade a pure low-pass: each stage stands on its own.
 */
export function designLowPass({ response, amaxDb, aminDb, fp, fs, order }) {
	const k = transitionRatio(fp, fs);
	const minOrder =
		response === 'chebyshev' ? chebyshevOrder(amaxDb, aminDb, k) : butterworthOrder(amaxDb, aminDb, k);
	const n = order ?? Math.max(1, Math.ceil(minOrder));

	const proto =
		response === 'chebyshev' ? chebyshevStages(n, amaxDb) : butterworthStages(n);

	const wc = 2 * Math.PI * fp;
	const stages = proto.stages.map((s) => ({
		order: 2,
		filterType: 'lowpass',
		wn: wc * Math.sqrt(s.b),
		q: Math.sqrt(s.b) / s.a,
		normalized: s
	}));
	if (proto.real) {
		stages.push({ order: 1, filterType: 'lowpass', tau: 1 / (wc * proto.real.breal), normalized: proto.real });
	}

	return {
		k,
		minOrder,
		n,
		wc,
		stages,
		response,
		amaxDb,
		aminDb,
		fp,
		fs,
		eps: proto.eps,
		beta: proto.beta
	};
}

/**
 * Turns a spec into the order and realizable stages for a high-pass
 * filter. High-pass is the low-pass prototype with s -> 1/s applied
 * before denormalizing: for a stage s^2 + a*s + b, that gives
 *   a_hp = a / b,   b_hp = 1 / b
 * (Q is invariant under this transform - Q_hp = sqrt(b_hp)/a_hp works out
 * to sqrt(b)/a = Q_lp exactly). The order/k formulas are unchanged from
 * low-pass; only the roles of fp and fs swap (fp is now the higher,
 * passband edge, fs the lower, stopband edge), so k = fs/fp instead of
 * fp/fs. omega_c for denormalizing is still 2*pi*fp, the passband edge.
 */
export function designHighPass({ response, amaxDb, aminDb, fp, fs, order }) {
	const k = transitionRatio(fs, fp);
	const minOrder =
		response === 'chebyshev' ? chebyshevOrder(amaxDb, aminDb, k) : butterworthOrder(amaxDb, aminDb, k);
	const n = order ?? Math.max(1, Math.ceil(minOrder));

	const proto =
		response === 'chebyshev' ? chebyshevStages(n, amaxDb) : butterworthStages(n);

	const wc = 2 * Math.PI * fp;
	const stages = proto.stages.map((s) => {
		const aHp = s.a / s.b;
		const bHp = 1 / s.b;
		return {
			order: 2,
			filterType: 'highpass',
			wn: wc * Math.sqrt(bHp),
			q: Math.sqrt(bHp) / aHp,
			normalized: { ...s, aHp, bHp }
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
		minOrder,
		n,
		wc,
		stages,
		response,
		amaxDb,
		aminDb,
		fp,
		fs,
		eps: proto.eps,
		beta: proto.beta
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
 * needed anywhere else for band-pass itself.
 */
export function designBandPass({ response, amaxDb, aminDb, fl, fh, fsl, fsh, orderLow, orderHigh }) {
	const hp = designHighPass({ response, amaxDb, aminDb, fp: fl, fs: fsl, order: orderHigh });
	const lp = designLowPass({ response, amaxDb, aminDb, fp: fh, fs: fsh, order: orderLow });

	return {
		hp,
		lp,
		stages: [...hp.stages, ...lp.stages],
		response,
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
 * unlike a Twin-T notch.
 *
 * design.stages below concatenates both branches purely for listing and
 * per-stage component synthesis (identical to how a single stage is
 * handled regardless of branch); the Bode response must NOT treat this
 * as one cascade - use responseAtParallelSum/sweepParallelSum with
 * [lp.stages-worth of realized stages, hp.stages-worth] kept separate.
 */
export function designBandStop({ response, amaxDb, aminDb, fl, fh, fsl, fsh, orderLow, orderHigh }) {
	const lp = designLowPass({ response, amaxDb, aminDb, fp: fl, fs: fsl, order: orderLow });
	const hp = designHighPass({ response, amaxDb, aminDb, fp: fh, fs: fsh, order: orderHigh });

	return {
		lp,
		hp,
		stages: [...lp.stages, ...hp.stages],
		response,
		amaxDb,
		aminDb,
		fl,
		fh,
		fsl,
		fsh
	};
}
