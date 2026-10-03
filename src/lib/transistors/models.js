/**
 * Device models behind the interactive figures of the transistor guide.
 * They are the textbook large-signal models, chosen to show the right
 * shapes (the saturation knee of a BJT, the triode region of a FET, the
 * Early slope) rather than to match one part to the last percent.
 *
 * Every function works with N-type signs (NPN, N-channel). A P-type part is
 * the same curve with every voltage and current negated, which is how the
 * figures draw it.
 */

/** Thermal voltage kT/q at 300 K, in volts. */
export const VT = 0.025852;

/** A small-signal NPN in the 2N3904 class, rounded. */
export const SMALL_NPN = { is: 1e-14, betaF: 150, betaR: 1, va: 75 };

/**
 * Ebers-Moll (transport form) with the Early effect on the transfer
 * current, for an NPN. Returns { ic, ib } in amperes.
 */
export function ebersMoll(vbe, vce, p = SMALL_NPN) {
	const vbc = vbe - vce;
	const ef = Math.exp(Math.min(vbe / VT, 80)) - 1;
	const er = Math.exp(Math.min(vbc / VT, 80)) - 1;
	const early = 1 + Math.max(vce, 0) / p.va;
	const it = p.is * (ef - er) * early;
	const ic = it - (p.is / p.betaR) * er;
	const ib = (p.is / p.betaF) * ef + (p.is / p.betaR) * er;
	return { ic, ib };
}

/**
 * The base-emitter voltage that draws base current `ib` at a given
 * collector-emitter voltage. The base current rises with V_BE at any V_CE,
 * so a bisection on V_BE always lands.
 */
export function vbeForIb(ib, vce, p = SMALL_NPN) {
	if (!(ib > 0)) return 0;
	let lo = -0.2;
	let hi = 1.2;
	for (let i = 0; i < 80; i++) {
		const mid = 0.5 * (lo + hi);
		if (ebersMoll(mid, vce, p).ib > ib) hi = mid;
		else lo = mid;
	}
	return 0.5 * (lo + hi);
}

/** Collector current for a base current and V_CE: one output curve point. */
export function icForIb(ib, vce, p = SMALL_NPN) {
	if (!(ib > 0)) return 0;
	return ebersMoll(vbeForIb(ib, vce, p), vce, p).ic;
}

/**
 * Where the load line I_C = (V_CC - V_CE) / R_C crosses the output curve of
 * base current `ib`. The curve rises with V_CE and the line falls, so the
 * difference has one root in [0, V_CC]. Returns the operating point and the
 * region it sits in.
 */
export function bjtOperatingPoint(ib, vcc, rc, p = SMALL_NPN) {
	if (!(ib > 0)) return { vce: vcc, ic: 0, vbe: 0, region: 'cutoff' };
	let lo = 0;
	let hi = vcc;
	for (let i = 0; i < 80; i++) {
		const mid = 0.5 * (lo + hi);
		const curve = icForIb(ib, mid, p);
		const line = (vcc - mid) / rc;
		if (curve > line) hi = mid;
		else lo = mid;
	}
	const vce = 0.5 * (lo + hi);
	const vbe = vbeForIb(ib, vce, p);
	const ic = (vcc - vce) / rc;
	// the base-collector junction forward biased past a few tenths of a volt
	// is saturation: the collector current is set by the load, not by beta
	const region = vbe - vce > 0.4 ? 'saturation' : 'active';
	return { vce, ic, vbe, region };
}

/**
 * Square-law MOSFET (SPICE level 1) for an N-channel part.
 *   vth     threshold, V (negative for a depletion-mode part)
 *   k       transconductance parameter k' W / L, A/V^2
 *   lambda  channel-length modulation, 1/V
 * Returns { id, region } with region 'off', 'triode' or 'saturation'.
 */
export function mosfet(vgs, vds, { vth, k, lambda = 0 }) {
	const vov = vgs - vth;
	if (vov <= 0) return { id: 0, region: 'off' };
	const clm = 1 + lambda * Math.max(vds, 0);
	if (vds < vov) return { id: k * (vov * vds - 0.5 * vds * vds) * clm, region: 'triode' };
	return { id: 0.5 * k * vov * vov * clm, region: 'saturation' };
}

/**
 * Shockley's JFET law for an N-channel part.
 *   vp      pinch-off voltage V_P (V_GS(off)), negative
 *   idss    drain current at V_GS = 0 in saturation, A
 *   lambda  channel-length modulation, 1/V
 * A gate taken above about 0.5 V forward biases the gate junction: the
 * model reports it as 'gate on' and keeps the V_GS = 0.5 V current.
 */
export function jfet(vgs, vds, { vp, idss, lambda = 0 }) {
	const gateOn = vgs > 0.5;
	const v = Math.min(vgs, 0.5);
	if (v <= vp) return { id: 0, region: 'off', gateOn: false };
	// the same square law as the MOSFET with V_th = V_P and k = 2 I_DSS / V_P^2
	const { id, region } = mosfet(v, vds, { vth: vp, k: (2 * idss) / (vp * vp), lambda });
	return { id, region, gateOn };
}

/**
 * The FET kinds of the transfer-curve comparison, all N-channel, with the
 * numbers of a typical small part. Each has `id(vgs, vds)`.
 */
export const FET_KINDS = [
	{
		id: 'njfet',
		label: 'N-JFET',
		normally: 'on',
		params: { vp: -3, idss: 0.01, lambda: 0.01 },
		id_: (vgs, vds, p) => jfet(vgs, vds, p)
	},
	{
		id: 'depletion',
		label: 'Depletion N-MOSFET',
		normally: 'on',
		params: { vth: -2, k: 0.005, lambda: 0.01 },
		id_: (vgs, vds, p) => mosfet(vgs, vds, p)
	},
	{
		id: 'enhancement',
		label: 'Enhancement N-MOSFET',
		normally: 'off',
		params: { vth: 2, k: 0.005, lambda: 0.01 },
		id_: (vgs, vds, p) => mosfet(vgs, vds, p)
	}
];

/** The FET drain current where the load line I_D = (V_DD - V_DS) / R_D crosses its output curve. */
export function fetOperatingPoint(model, vgs, vdd, rd) {
	let lo = 0;
	let hi = vdd;
	for (let i = 0; i < 80; i++) {
		const mid = 0.5 * (lo + hi);
		if (model(vgs, mid).id > (vdd - mid) / rd) hi = mid;
		else lo = mid;
	}
	const vds = 0.5 * (lo + hi);
	const r = model(vgs, vds);
	return { vds, id: (vdd - vds) / rd, region: r.region };
}

/**
 * A UJT relaxation oscillator: the emitter capacitor charges through R
 * toward V_BB until it reaches the peak point eta V_BB + V_D, then dumps.
 * Returns the period of the classic approximation (valley voltage taken as 0).
 */
export function ujtPeriod(r, c, eta, vbb, vd = 0.6) {
	const vp = eta * vbb + vd;
	if (!(vp < vbb)) return Infinity;
	return r * c * Math.log(vbb / (vbb - vp));
}
