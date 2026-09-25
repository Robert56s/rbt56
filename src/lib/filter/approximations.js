/**
 * The low-pass prototypes beyond Butterworth and Chebyshev I. All four are
 * normalized the same way: 1 rad/s is the passband edge, where exactly
 * Amax dB is lost, and the gain at DC is 1.
 *
 *   bessel            Thomson: the most constant delay, so a pulse keeps
 *                     its shape; the gentlest roll-off of all
 *   legendre          Papoulis' optimum L: the steepest roll-off a response
 *                     can have while still falling all the way (no ripple)
 *   inverseChebyshev  Chebyshev II: flat passband, the ripple moved into
 *                     the stopband, with zeros of transmission there
 *   elliptic          Cauer: ripple in both bands and zeros in the stopband,
 *                     the steepest transition any filter of that order has
 *
 * Each prototype is a list of second-order sections s^2 + a s + b, with a
 * zero z (numerator s^2 + z) for the two with a stopband ripple, plus one
 * first-order pole s + breal when the order is odd. The order either has a
 * closed form (elliptic, inverse Chebyshev) or is found by trying n = 1, 2,
 * ... until the stopband is met (Bessel, Legendre).
 */

/* ------------------------------------------------------------ complex */

const cx = (re, im = 0) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => {
	const d = b.re * b.re + b.im * b.im;
	return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cabs = (a) => Math.hypot(a.re, a.im);
function csqrt(a) {
	const r = cabs(a);
	const re = Math.sqrt(Math.max(0, (r + a.re) / 2));
	const im = Math.sqrt(Math.max(0, (r - a.re) / 2));
	return cx(re, a.im < 0 ? -im : im);
}

/* -------------------------------------------------------- polynomials */

/** Value and derivative of sum c[k] z^k at a complex z (Horner). */
function polyEval(c, z) {
	let p = cx(c[c.length - 1]);
	let dp = cx(0);
	for (let k = c.length - 2; k >= 0; k--) {
		dp = cadd(cmul(dp, z), p);
		p = cadd(cmul(p, z), cx(c[k]));
	}
	return { p, dp };
}

/**
 * All roots of the real polynomial sum c[k] z^k, by the Aberth-Ehrlich
 * iteration (every root refined at once, each pushed away from the
 * others), then polished by Newton's method. The polynomial is first
 * rescaled so its roots sit near the unit circle, which keeps the
 * coefficients of the high-order Bessel polynomials from swamping it.
 */
export function polyRoots(coefficients) {
	const n = coefficients.length - 1;
	const lead = coefficients[n];
	const scale = Math.abs(coefficients[0] / lead) ** (1 / n) || 1;
	const c = coefficients.map((v, k) => (v / lead) * scale ** (k - n));
	const z = Array.from({ length: n }, (_, k) => {
		const angle = (2 * Math.PI * k) / n + 0.4;
		return cx(Math.cos(angle), Math.sin(angle));
	});
	for (let iter = 0; iter < 500; iter++) {
		let worst = 0;
		for (let i = 0; i < n; i++) {
			const { p, dp } = polyEval(c, z[i]);
			if (cabs(p) === 0) continue;
			const ratio = cdiv(p, dp);
			let sum = cx(0);
			for (let j = 0; j < n; j++) if (j !== i) sum = cadd(sum, cdiv(cx(1), csub(z[i], z[j])));
			const w = cdiv(ratio, csub(cx(1), cmul(ratio, sum)));
			z[i] = csub(z[i], w);
			worst = Math.max(worst, cabs(w) / Math.max(1, cabs(z[i])));
		}
		if (worst < 1e-15) break;
	}
	return z.map((root) => {
		let r = root;
		for (let k = 0; k < 3; k++) {
			const { p, dp } = polyEval(c, r);
			if (cabs(dp) === 0) break;
			r = csub(r, cdiv(p, dp));
		}
		return cx(r.re * scale, r.im * scale);
	});
}

/** Product of two polynomials given as ascending coefficient arrays. */
function polyMul(a, b) {
	const out = new Array(a.length + b.length - 1).fill(0);
	a.forEach((x, i) => b.forEach((y, j) => (out[i + j] += x * y)));
	return out;
}

/* ------------------------------------------------ poles to sections */

/**
 * Groups left-half-plane poles (and, if any, zero frequencies on the jw
 * axis) into sections. Complex pairs become s^2 + a s + b with
 * a = -2 Re p and b = |p|^2; a real pole becomes the first-order section.
 * Each pole pair takes the zero closest to it (the highest-Q pole, right at
 * the band edge, gets the zero just past the stopband edge), the usual
 * pairing that keeps each section's own peaking small. Sections come out
 * highest Q first, the same order as the Butterworth and Chebyshev stages.
 */
function toSections(poles, zeros = []) {
	const pairs = poles.filter((p) => p.im > 1e-9);
	const reals = poles.filter((p) => Math.abs(p.im) <= 1e-9);
	const sections = pairs
		.map((p) => ({ a: -2 * p.re, b: p.re * p.re + p.im * p.im, pole: p }))
		.sort((x, y) => Math.sqrt(y.b) / y.a - Math.sqrt(x.b) / x.a);
	const free = [...zeros].sort((x, y) => x - y);
	for (const s of sections) {
		if (!free.length) break;
		let best = 0;
		for (let k = 1; k < free.length; k++) {
			if (Math.abs(Math.log(free[k] / Math.sqrt(s.b))) < Math.abs(Math.log(free[best] / Math.sqrt(s.b)))) best = k;
		}
		const wz = free.splice(best, 1)[0];
		s.z = wz * wz;
	}
	const real = reals.length ? { breal: -reals[0].re } : null;
	return { sections, real };
}

/** Loss in dB at normalized frequency w of a prototype with unity gain at DC. */
export function prototypeLossDb({ sections, real }, w) {
	let g2 = 1;
	for (const s of sections) {
		const num = s.z !== undefined ? ((s.z - w * w) * s.b) / s.z : s.b;
		const den2 = (s.b - w * w) ** 2 + (s.a * w) ** 2;
		g2 *= (num * num) / den2;
	}
	if (real) g2 *= (real.breal * real.breal) / (real.breal * real.breal + w * w);
	return -10 * Math.log10(Math.max(g2, 1e-300));
}

/** Loss of a prototype built from its poles alone (unity DC gain). */
function poleLossDb(poles, w) {
	let g2 = 1;
	for (const p of poles) g2 *= (p.re * p.re + p.im * p.im) / (p.re * p.re + (w - p.im) ** 2);
	return -10 * Math.log10(Math.max(g2, 1e-300));
}

/** The frequency where a monotonic set of poles loses `db`, by bisection in log w. */
function lossCrossing(poles, db) {
	let lo = -6;
	let hi = 6;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		if (poleLossDb(poles, 10 ** mid) < db) lo = mid;
		else hi = mid;
	}
	return 10 ** ((lo + hi) / 2);
}

const ripple = (db) => Math.sqrt(10 ** (db / 10) - 1);

/* -------------------------------------------------------------- Bessel */

/**
 * Coefficients of the reverse Bessel polynomial theta_n(s), ascending:
 * a_k = (2n - k)! / (2^(n - k) k! (n - k)!). H(s) = theta_n(0)/theta_n(s)
 * is the Bessel low-pass with a group delay of exactly 1 s at DC.
 */
export function besselPolynomial(n) {
	const c = [];
	for (let k = 0; k <= n; k++) {
		// (2n-k)! / ((n-k)! k! 2^(n-k)), built as a running product to stay exact longer
		let v = 1;
		for (let j = n - k + 1; j <= 2 * n - k; j++) v *= j;
		for (let j = 2; j <= k; j++) v /= j;
		c.push(v / 2 ** (n - k));
	}
	return c;
}

/** Bessel prototype: the roots of theta_n, scaled so that Amax is lost at 1 rad/s. */
export function besselPrototype(n, amaxDb) {
	const raw = n === 1 ? [cx(-1)] : polyRoots(besselPolynomial(n)).filter((p) => p.im >= -1e-9);
	const w = lossCrossing(raw.flatMap((p) => (p.im > 1e-9 ? [p, cx(p.re, -p.im)] : [p])), amaxDb);
	const poles = raw.map((p) => cx(p.re / w, p.im / w));
	return { ...toSections(poles), delayScale: w };
}

/* ------------------------------------------------------------ Legendre */

/** Coefficients (ascending in x) of the Legendre polynomials P_0 .. P_m. */
function legendreP(m) {
	const P = [[1], [0, 1]];
	for (let i = 1; i < m; i++) {
		// (i+1) P_{i+1} = (2i+1) x P_i - i P_{i-1}
		const next = new Array(i + 2).fill(0);
		P[i].forEach((v, k) => (next[k + 1] += ((2 * i + 1) * v) / (i + 1)));
		P[i - 1].forEach((v, k) => (next[k] -= (i * v) / (i + 1)));
		P.push(next);
	}
	return P.slice(0, m + 1);
}

/**
 * Papoulis' L_n as a polynomial in w = omega^2 (ascending coefficients).
 * Its derivative is a perfect square, so |H|^2 = 1/(1 + eps^2 L_n(w))
 * never ripples, and among all such polynomials with L_n(0) = 0 and
 * L_n(1) = 1 it has the steepest slope at the band edge:
 *   n = 2k+1:  L_n = 1/(2(k+1)^2) * integral_{-1}^{2w-1} [sum_{i=0..k} (2i+1) P_i(x)]^2 dx
 *   n = 2k+2:  L_n = 1/((k+1)(k+2)) * integral_{-1}^{2w-1} (x+1) [sum (2i+1) P_i(x)]^2 dx,
 *              the sum over the i of the same parity as k only.
 */
export function legendrePolynomial(n) {
	if (n === 1) return [0, 1];
	const odd = n % 2 === 1;
	const k = odd ? (n - 1) / 2 : (n - 2) / 2;
	const P = legendreP(k);
	let v = [0];
	for (let i = 0; i <= k; i++) {
		if (!odd && (i - k) % 2 !== 0) continue;
		const term = P[i].map((c) => c * (2 * i + 1));
		v = v.length >= term.length ? v.map((c, j) => c + (term[j] ?? 0)) : term.map((c, j) => c + (v[j] ?? 0));
	}
	let g = polyMul(v, v);
	if (!odd) g = polyMul(g, [1, 1]);
	// antiderivative G with G(-1) = 0
	const G = [0, ...g.map((c, j) => c / (j + 1))];
	const atMinusOne = G.reduce((s, c, j) => s + c * (-1) ** j, 0);
	G[0] -= atMinusOne;
	// substitute x = 2w - 1
	let out = [0];
	let power = [1];
	for (let j = 0; j < G.length; j++) {
		const term = power.map((c) => c * G[j]);
		out = out.length >= term.length ? out.map((c, i) => c + (term[i] ?? 0)) : term.map((c, i) => c + (out[i] ?? 0));
		power = polyMul(power, [-1, 2]);
	}
	const norm = odd ? 2 * (k + 1) ** 2 : (k + 1) * (k + 2);
	return out.map((c) => c / norm);
}

const polyAt = (c, x) => c.reduceRight((acc, v) => acc * x + v, 0);

/** Legendre prototype: the stable roots of 1 + eps^2 L_n(-s^2). */
export function legendrePrototype(n, amaxDb) {
	const eps = ripple(amaxDb);
	const L = legendrePolynomial(n);
	const q = L.map((c) => c * eps * eps);
	q[0] += 1;
	// roots in w = -s^2 = omega^2, then s = -sqrt(-w) on the left half-plane
	const ws = n === 1 ? [cx(-q[0] / q[1])] : polyRoots(q);
	const poles = ws.map((w) => {
		const s = csqrt(cx(-w.re, -w.im));
		return cx(-Math.abs(s.re), s.re >= 0 ? -s.im : s.im);
	});
	// keep one of each conjugate pair plus the real pole
	const kept = poles.filter((p) => p.im > 1e-9 || Math.abs(p.im) <= 1e-9);
	return { ...toSections(kept), polynomial: L, eps };
}

/** Loss of the Legendre response at normalized frequency w, straight from L_n. */
export function legendreLossDb(n, amaxDb, w) {
	const eps = ripple(amaxDb);
	return 10 * Math.log10(1 + eps * eps * polyAt(legendrePolynomial(n), w * w));
}

/* ------------------------------------------------- elliptic functions */

function agm(a, b) {
	for (let i = 0; i < 60 && Math.abs(a - b) > 1e-15 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
	return (a + b) / 2;
}

/** Complete elliptic integral of the first kind, K(m), parameter m = k^2. */
export function ellipK(m) {
	return m >= 1 ? Infinity : Math.PI / (2 * agm(1, Math.sqrt(1 - m)));
}

/** The complementary integral K'(m) = K(1 - m), accurate even for tiny m. */
export function ellipKp(m) {
	return m <= 0 ? Infinity : Math.PI / (2 * agm(1, Math.sqrt(m)));
}

/** Jacobi sn, cn, dn of a real argument, by the descending Landen (AGM) recurrence. */
export function ellipJ(u, m) {
	if (m < 1e-14) return { sn: Math.sin(u), cn: Math.cos(u), dn: 1 };
	if (m > 1 - 1e-14) {
		const sech = 1 / Math.cosh(u);
		return { sn: Math.tanh(u), cn: sech, dn: sech };
	}
	const a = [1];
	const c = [Math.sqrt(m)];
	let b = Math.sqrt(1 - m);
	let i = 0;
	while (Math.abs(c[i] / a[i]) > 1e-16 && i < 30) {
		const ai = a[i];
		c.push((ai - b) / 2);
		const t = Math.sqrt(ai * b);
		a.push((ai + b) / 2);
		b = t;
		i++;
	}
	let phi = 2 ** i * a[i] * u;
	let prev = phi;
	for (; i > 0; i--) {
		prev = phi;
		phi = (Math.asin((c[i] * Math.sin(phi)) / a[i]) + phi) / 2;
	}
	const cn = Math.cos(phi);
	return { sn: Math.sin(phi), cn, dn: cn / Math.cos(prev - phi) };
}

/** Carlson's symmetric integral R_F(x, y, z), by duplication. */
function carlsonRF(x, y, z) {
	for (let i = 0; i < 200; i++) {
		const sx = Math.sqrt(x);
		const sy = Math.sqrt(y);
		const sz = Math.sqrt(z);
		const lambda = sx * (sy + sz) + sy * sz;
		x = (x + lambda) / 4;
		y = (y + lambda) / 4;
		z = (z + lambda) / 4;
		const mu = (x + y + z) / 3;
		const dx = 1 - x / mu;
		const dy = 1 - y / mu;
		const dz = 1 - z / mu;
		if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < 1e-4) {
			const e2 = dx * dy - dz * dz;
			const e3 = dx * dy * dz;
			return (1 - e2 / 10 + e3 / 14 + (e2 * e2) / 24 - (3 * e2 * e3) / 44) / Math.sqrt(mu);
		}
	}
	return NaN;
}

/** Incomplete elliptic integral of the first kind F(phi | m), 0 <= phi <= pi/2. */
export function ellipF(phi, m) {
	const s = Math.sin(phi);
	const c = Math.cos(phi);
	return s * carlsonRF(c * c, 1 - m * s * s, 1);
}

/** The nome q = exp(-pi K'/K) of the parameter m. */
function nome(m) {
	return Math.exp((-Math.PI * ellipKp(m)) / ellipK(m));
}

/** The parameter m whose nome is q, by the theta series m = 16 q (sum q^(j(j+1)) / (1 + 2 sum q^(j^2)))^4. */
function paramFromNome(q) {
	let num = 0;
	let den = 0;
	for (let j = 0; j <= 7; j++) num += q ** (j * (j + 1));
	for (let j = 1; j <= 8; j++) den += q ** (j * j);
	return 16 * q * (num / (1 + 2 * den)) ** 4;
}

/**
 * The degree equation in terms of nomes: the elliptic filter of order n
 * with selectivity parameter m = k^2 has discrimination parameter
 * m1 = k1^2 with nome q1 = q^n. Solved both ways:
 *   ellipDeg(n, m1)          the m that n allows for a given m1
 *   ellipDiscrimination(n, m) the m1 that n reaches for a given m
 */
export function ellipDeg(n, m1) {
	return paramFromNome(nome(m1) ** (1 / n));
}

export function ellipDiscrimination(n, m) {
	return paramFromNome(nome(m) ** n);
}

/* -------------------------------------------------------------- orders */

/**
 * Elliptic order from the degree equation n = K(k) K'(k1) / (K'(k) K(k1)),
 * k = omega_p/omega_s the selectivity, k1 = eps_p/eps_s the discrimination.
 */
export function ellipticOrder(amaxDb, aminDb, k) {
	const m = k * k;
	const m1 = (ripple(amaxDb) / ripple(aminDb)) ** 2;
	return (ellipK(m) * ellipKp(m1)) / (ellipKp(m) * ellipK(m1));
}

/** Inverse Chebyshev needs exactly the Chebyshev I order: the same polynomial, turned inside out. */
export function inverseChebyshevOrder(amaxDb, aminDb, k) {
	return Math.acosh(ripple(aminDb) / ripple(amaxDb)) / Math.acosh(1 / k);
}

/* ------------------------------------------------ inverse Chebyshev */

/**
 * Chebyshev II: the Chebyshev I poles for the stopband ripple, inverted
 * (p -> 1/p), with zeros where T_n(1/w) = 0, at w = 1/cos(theta_i), for a
 * prototype whose stopband edge is at 1. The stopband edge is then put at
 * 1/k (fs in units of fp) and the stopband ripple chosen so that exactly
 * Amax is lost at the passband edge:
 *   eps_s' = eps_p cosh(n acosh(1/k))
 * With n rounded up that is more than Amin: the extra order becomes
 * margin in the stopband, where rounded parts would otherwise eat into it.
 */
export function inverseChebyshevPrototype(n, amaxDb, aminDb, k) {
	const epsP = ripple(amaxDb);
	const epsS = epsP * Math.cosh(n * Math.acosh(1 / k));
	const beta = Math.asinh(epsS) / n;
	const stretch = 1 / k;
	const poles = [];
	const zeros = [];
	for (let i = 0; i < n; i++) {
		const theta = ((2 * i + 1) * Math.PI) / (2 * n);
		const s = cx(-Math.sinh(beta) * Math.sin(theta), Math.cosh(beta) * Math.cos(theta));
		if (s.im < -1e-12) continue;
		const inv = cdiv(cx(1), s);
		poles.push(cx(inv.re * stretch, Math.abs(inv.im) * stretch));
		if (Math.abs(Math.cos(theta)) > 1e-12 && Math.cos(theta) > 0) zeros.push(stretch / Math.cos(theta));
	}
	return { ...toSections(poles, zeros), beta, stopEdge: stretch, aminReached: 10 * Math.log10(1 + epsS * epsS) };
}

/* ----------------------------------------------------------- elliptic */

/**
 * Cauer prototype, passband edge at 1 with exactly Amax of ripple,
 * stopband edge at 1/k (fs in units of fp). The degree equation gives the
 * discrimination k1 that the whole order n reaches for that selectivity,
 * and with it the stopband ripple: Amin' = 10 log(1 + (eps_p/k1)^2), at
 * least Amin, so rounding n up buys stopband margin.
 *   zeros:  w = 1 / (k sn(u_j K/n, k^2)),   u_j = j = n-1, n-3, ...
 *   poles:  p = -(c d sv cv + j s dv) / (1 - (d sv)^2), with s, c, d the
 *           Jacobi functions at u_j K/n and sv, cv, dv at v0 with parameter 1-k^2,
 *           v0 = K F(atan(1/eps_p) | 1 - k1^2) / (n K(k1^2))
 */
export function ellipticPrototype(n, amaxDb, aminDb, k) {
	const epsP = ripple(amaxDb);
	const m = k * k;
	const k1 = Math.sqrt(ellipDiscrimination(n, m));
	const K = ellipK(m);
	const v0 = (K * ellipF(Math.atan(1 / epsP), 1 - k1 * k1)) / (n * ellipK(k1 * k1));
	const { sn: sv, cn: cv, dn: dv } = ellipJ(v0, 1 - m);
	const poles = [];
	const zeros = [];
	for (let j = 1 - (n % 2); j < n; j += 2) {
		const { sn: s, cn: c, dn: d } = ellipJ((j * K) / n, m);
		const den = 1 - (d * sv) ** 2;
		poles.push(cx((-c * d * sv * cv) / den, Math.abs((s * dv) / den)));
		if (Math.abs(s) > 1e-12) zeros.push(1 / (Math.sqrt(m) * s));
	}
	return { ...toSections(poles, zeros), m, k1, stopEdge: 1 / Math.sqrt(m), v0, aminReached: 10 * Math.log10(1 + (epsP / k1) ** 2) };
}

/* ------------------------------------------------------------ catalog */

/** What each response is, in the words the page uses (short: the name in a select, when the label is too long for one). */
export const RESPONSES = {
	butterworth: { label: 'Butterworth', zeros: false, best: 'the flattest passband' },
	chebyshev: { label: 'Chebyshev I', zeros: false, best: 'a steeper drop for passband ripple' },
	legendre: { label: 'Legendre (optimum L)', zeros: false, best: 'the steepest drop with no ripple' },
	bessel: { label: 'Bessel (Thomson)', zeros: false, best: 'the flattest delay, pulses keep their shape' },
	inverseChebyshev: { label: 'Inverse Chebyshev (Chebyshev II)', short: 'Inverse Chebyshev', zeros: true, best: 'a flat passband, the ripple moved to the stopband' },
	elliptic: { label: 'Elliptic (Cauer)', zeros: true, best: 'the steepest transition of all, ripple in both bands' }
};

/** The prototype of one of the four responses above, at order n, for a transition ratio k. */
export function prototypeFor(response, n, amaxDb, aminDb, k) {
	if (response === 'bessel') return besselPrototype(n, amaxDb);
	if (response === 'legendre') return legendrePrototype(n, amaxDb);
	if (response === 'inverseChebyshev') return inverseChebyshevPrototype(n, amaxDb, aminDb, k);
	if (response === 'elliptic') return ellipticPrototype(n, amaxDb, aminDb, k);
	throw new Error(`no prototype for response ${response}`);
}

/** The largest order the searches try before reporting that the spec is out of reach. */
export const SEARCH_LIMIT = 20;

/**
 * Minimum order of a searched response: the smallest n whose loss at the
 * normalized stopband edge 1/k reaches Amin. Returns the loss for each n
 * tried, so the page can show why the count stopped where it did.
 */
export function searchedOrder(response, amaxDb, aminDb, k) {
	const tried = [];
	for (let n = 1; n <= SEARCH_LIMIT; n++) {
		const loss = response === 'legendre' ? legendreLossDb(n, amaxDb, 1 / k) : prototypeLossDb(besselPrototype(n, amaxDb), 1 / k);
		tried.push({ n, loss });
		if (loss >= aminDb) return { n, tried };
	}
	return { n: null, tried };
}
