/**
 * The diode law, i = Is (exp(v / (N Vt)) - 1), with the part's own series
 * resistance, and the stock diodes it describes. The diode modulator and
 * the half-wave detector both run their numbers through it, and the
 * LTspice exports carry the same models, so the page and the simulation
 * work with one diode.
 */

/** kT/q at SPICE's default 27 C. */
export const DIODE_VT = 0.025852;

export const DIODE_MODELS = {
	'1N4148': {
		id: '1N4148',
		label: '1N4148 (silicon, small signal)',
		Is: 2.52e-9,
		N: 1.752,
		Rs: 0.568,
		spice: '.model DX D(Is=2.52n Rs=.568 N=1.752 Cjo=4p M=.4 tt=20n)'
	},
	BAT54: {
		id: 'BAT54',
		label: 'BAT54 (Schottky, lower knee)',
		Is: 1e-7,
		N: 1,
		Rs: 2.2,
		spice: '.model DX D(Is=.1u Rs=2.2 N=1 Cjo=12p M=.3 Eg=.69 Xti=2)'
	}
};

/**
 * Current through a diode in series with a resistance r (the diode's own
 * Rs is added here) when v is across the two. Solves
 *   (r + Rs) i + N Vt ln(1 + i / Is) = v
 * by Newton's method in w = ln(1 + i / Is): the left side rises steadily
 * with w, so the iteration converges from the start it is given, forward
 * or reverse.
 */
export function diodeCurrent(v, r, d) {
	const nvt = d.N * DIODE_VT;
	const rt = r + d.Rs;
	let w = v > 0 ? Math.min(v / nvt, Math.log1p(v / (rt * d.Is))) : v / nvt;
	for (let k = 0; k < 60; k++) {
		const e = Math.exp(w);
		const g = rt * d.Is * (e - 1) + nvt * w - v;
		const step = g / (rt * d.Is * e + nvt);
		w -= step;
		if (Math.abs(step) < 1e-12) break;
	}
	return d.Is * Math.expm1(w);
}

/** The voltage across the diode alone when it carries i. */
export function diodeDrop(i, d) {
	return d.N * DIODE_VT * Math.log1p(i / d.Is) + d.Rs * i;
}
