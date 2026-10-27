/**
 * A small nodal solver for the netlists the filter tool writes: the
 * elements of stageElements (stageElements.js), resistors, capacitors and
 * op-amps, driven by a 1 V source on one node. Modified nodal analysis at
 * one frequency, complex numbers kept as separate real and imaginary
 * parts.
 *
 * An op-amp is a nullor by default (V+ = V-, any output current). With
 * `gbw` (Hz) it is the single-pole op-amp of the LTspice files instead:
 *   V(out) = A(s) (V+ - V-),   A(s) = AOL / (1 + s AOL / (2 pi GBW)),
 * written as V+ - V- = (1/AOL + s / (2 pi GBW)) V(out). AOL is infinite
 * unless `aol` says otherwise, so A(s) = 2 pi GBW / s.
 */

/**
 * V(output) / V(input) at freqHz, as { re, im }. `elements` are
 * { kind: 'R' | 'C' | 'OP', nodes, value }: two nodes for R and C, three
 * for an op-amp ([non-inverting, inverting, output]); '0' is ground.
 * Elements of any other kind are skipped.
 */
export function nodalResponse(elements, freqHz, { input = 'vin', output = 'vout', gbw = null, aol = Infinity } = {}) {
	const w = 2 * Math.PI * freqHz;
	const index = new Map();
	const nodeOf = (name) => {
		if (name === '0') return -1;
		if (!index.has(name)) index.set(name, index.size);
		return index.get(name);
	};
	nodeOf(input);
	const used = elements.filter((e) => e.kind === 'R' || e.kind === 'C' || e.kind === 'OP');
	for (const e of used) e.nodes.forEach(nodeOf);
	const opamps = used.filter((e) => e.kind === 'OP');
	const n = index.size;
	// unknowns: the node voltages, then the source's current, then one output current per op-amp
	const size = n + 1 + opamps.length;
	const re = Array.from({ length: size }, () => new Float64Array(size + 1));
	const im = Array.from({ length: size }, () => new Float64Array(size + 1));
	const stamp = (a, b, yr, yi) => {
		if (a >= 0) {
			re[a][a] += yr;
			im[a][a] += yi;
		}
		if (b >= 0) {
			re[b][b] += yr;
			im[b][b] += yi;
		}
		if (a >= 0 && b >= 0) {
			re[a][b] -= yr;
			im[a][b] -= yi;
			re[b][a] -= yr;
			im[b][a] -= yi;
		}
	};
	for (const e of used) {
		if (e.kind === 'R') stamp(nodeOf(e.nodes[0]), nodeOf(e.nodes[1]), 1 / e.value, 0);
		else if (e.kind === 'C') stamp(nodeOf(e.nodes[0]), nodeOf(e.nodes[1]), 0, w * e.value);
	}
	// the 1 V source on the input node
	const src = n;
	const vin = nodeOf(input);
	re[vin][src] += 1;
	re[src][vin] += 1;
	re[src][size] = 1;
	const finite = Number.isFinite(gbw) && gbw > 0;
	opamps.forEach((e, k) => {
		const row = n + 1 + k;
		const [p, m, out] = e.nodes.map(nodeOf);
		if (out >= 0) re[out][row] += 1;
		if (p >= 0) re[row][p] += 1;
		if (m >= 0) re[row][m] -= 1;
		if (finite && out >= 0) {
			re[row][out] -= Number.isFinite(aol) ? 1 / aol : 0;
			im[row][out] -= w / (2 * Math.PI * gbw);
		}
	});
	// Gaussian elimination with partial pivoting on the augmented matrix
	for (let col = 0; col < size; col++) {
		let piv = col;
		let best = Math.hypot(re[col][col], im[col][col]);
		for (let r = col + 1; r < size; r++) {
			const mag = Math.hypot(re[r][col], im[r][col]);
			if (mag > best) {
				best = mag;
				piv = r;
			}
		}
		if (best === 0) continue;
		if (piv !== col) {
			[re[col], re[piv]] = [re[piv], re[col]];
			[im[col], im[piv]] = [im[piv], im[col]];
		}
		const pr = re[col][col];
		const pi = im[col][col];
		const pd = pr * pr + pi * pi;
		for (let r = col + 1; r < size; r++) {
			const ar = re[r][col];
			const ai = im[r][col];
			if (ar === 0 && ai === 0) continue;
			// f = a / pivot
			const fr = (ar * pr + ai * pi) / pd;
			const fi = (ai * pr - ar * pi) / pd;
			for (let c = col; c <= size; c++) {
				const br = re[col][c];
				const bi = im[col][c];
				if (br === 0 && bi === 0) continue;
				re[r][c] -= fr * br - fi * bi;
				im[r][c] -= fr * bi + fi * br;
			}
		}
	}
	const xr = new Float64Array(size);
	const xi = new Float64Array(size);
	for (let r = size - 1; r >= 0; r--) {
		let sr = re[r][size];
		let si = im[r][size];
		for (let c = r + 1; c < size; c++) {
			sr -= re[r][c] * xr[c] - im[r][c] * xi[c];
			si -= re[r][c] * xi[c] + im[r][c] * xr[c];
		}
		const dr = re[r][r];
		const di = im[r][r];
		const dd = dr * dr + di * di;
		if (dd === 0) continue;
		xr[r] = (sr * dr + si * di) / dd;
		xi[r] = (si * dr - sr * di) / dd;
	}
	const o = index.get(output);
	return o === undefined ? { re: 0, im: 0 } : { re: xr[o], im: xi[o] };
}

/*
 * The natural frequencies of a netlist: the poles of every transfer
 * function it has, the input source shorted. With the unknowns of the
 * solver above (the source left out), the circuit is (G + s Cm) x = 0, G
 * the conductances and the op-amps' static rows, Cm the capacitors and,
 * with `gbw`, the s / (2 pi GBW) of each op-amp. det(G + s Cm) is a
 * polynomial in s of degree at most the count of capacitors and op-amps:
 * its roots are the poles. A pole in the right half plane makes the
 * circuit oscillate, which a magnitude response cannot show (a pole and
 * its mirror image give the same |H(j omega)|).
 */

/** det(G + s Cm) at a complex s, by Gaussian elimination with partial pivoting. */
function nodalDet(G, Cm, sr, si) {
	const size = G.length;
	const re = G.map((row, r) => row.map((g, c) => g + sr * Cm[r][c]));
	const im = G.map((row, r) => row.map((g, c) => si * Cm[r][c]));
	let dr = 1;
	let di = 0;
	for (let col = 0; col < size; col++) {
		let piv = col;
		let best = Math.hypot(re[col][col], im[col][col]);
		for (let r = col + 1; r < size; r++) {
			const mag = Math.hypot(re[r][col], im[r][col]);
			if (mag > best) {
				best = mag;
				piv = r;
			}
		}
		if (best === 0) return { re: 0, im: 0 };
		if (piv !== col) {
			[re[col], re[piv]] = [re[piv], re[col]];
			[im[col], im[piv]] = [im[piv], im[col]];
			dr = -dr;
			di = -di;
		}
		const pr = re[col][col];
		const pi = im[col][col];
		const nr = dr * pr - di * pi;
		di = dr * pi + di * pr;
		dr = nr;
		const pd = pr * pr + pi * pi;
		for (let r = col + 1; r < size; r++) {
			const ar = re[r][col];
			const ai = im[r][col];
			if (ar === 0 && ai === 0) continue;
			const fr = (ar * pr + ai * pi) / pd;
			const fi = (ai * pr - ar * pi) / pd;
			for (let c = col; c < size; c++) {
				const br = re[col][c];
				const bi = im[col][c];
				re[r][c] -= fr * br - fi * bi;
				im[r][c] -= fr * bi + fi * br;
			}
		}
	}
	return { re: dr, im: di };
}

/**
 * The coefficients c[0..d] of det(G + s Cm), d at most `degree`: sampled
 * on circles |s| = r and read back by a discrete Fourier transform. One
 * radius cannot hold them all (an op-amp's pole sits far above f0), so
 * several are taken, from scale/100 up to `top`, and each coefficient is
 * read on the circle where its own term weighs the most.
 */
function nodalPolynomial(G, Cm, degree, scale, top) {
	const M = degree + 1;
	const best = Array.from({ length: M }, () => ({ weight: -1, value: 0 }));
	for (let r = scale / 100; r <= top; r *= 2) {
		const samples = [];
		let largest = 0;
		for (let m = 0; m < M; m++) {
			const a = (2 * Math.PI * m) / M;
			const d = nodalDet(G, Cm, r * Math.cos(a), r * Math.sin(a));
			samples.push(d);
			largest = Math.max(largest, Math.hypot(d.re, d.im));
		}
		if (!(largest > 0) || !Number.isFinite(largest)) continue;
		for (let k = 0; k < M; k++) {
			let sr = 0;
			let si = 0;
			for (let m = 0; m < M; m++) {
				const a = (-2 * Math.PI * k * m) / M;
				sr += samples[m].re * Math.cos(a) - samples[m].im * Math.sin(a);
				si += samples[m].re * Math.sin(a) + samples[m].im * Math.cos(a);
			}
			const weight = Math.hypot(sr, si) / M / largest;
			if (weight > best[k].weight) best[k] = { weight, value: sr / M / r ** k };
		}
	}
	// a coefficient no circle lifts above the rounding is zero
	return best.map((b) => (b.weight > 1e-9 ? b.value : 0));
}

/**
 * The roots of the real polynomial c[0] + c[1] s + ... + c[d] s^d, by the
 * Aberth iteration, each root started on the circle the Newton polygon of
 * |c| gives its size (roots far apart in size converge as fast as close
 * ones). Returns [{ re, im }], or null when it does not converge.
 */
function nodalRoots(c) {
	let d = c.length - 1;
	while (d > 0 && c[d] === 0) d--;
	let low = 0;
	while (low < d && c[low] === 0) low++;
	const zeros = Array.from({ length: low }, () => ({ re: 0, im: 0 }));
	const a = c.slice(low, d + 1);
	const n = a.length - 1;
	if (n < 1) return zeros;
	// the upper convex hull of (k, log|a_k|): one circle per edge, as many roots as the edge is long
	const pts = a.map((v, k) => ({ k, y: v === 0 ? -Infinity : Math.log(Math.abs(v)) })).filter((pt) => Number.isFinite(pt.y));
	const hull = [];
	for (const pt of pts) {
		while (hull.length >= 2) {
			const p1 = hull[hull.length - 2];
			const p2 = hull[hull.length - 1];
			if ((p2.y - p1.y) * (pt.k - p1.k) <= (pt.y - p1.y) * (p2.k - p1.k)) hull.pop();
			else break;
		}
		hull.push(pt);
	}
	const z = [];
	for (let e = 0; e + 1 < hull.length; e++) {
		const i = hull[e].k;
		const j = hull[e + 1].k;
		const rho = Math.exp((hull[e].y - hull[e + 1].y) / (j - i));
		for (let t = 0; t < j - i; t++) {
			const ang = (2 * Math.PI * t) / (j - i) + 0.4 + 0.7 * e;
			z.push({ re: rho * Math.cos(ang), im: rho * Math.sin(ang) });
		}
	}
	// p(x) and p'(x) by Horner, x complex
	const evalAt = (x) => {
		let pr = a[n];
		let pi = 0;
		let qr = 0;
		let qi = 0;
		for (let k = n - 1; k >= 0; k--) {
			const nqr = qr * x.re - qi * x.im + pr;
			qi = qr * x.im + qi * x.re + pi;
			qr = nqr;
			const npr = pr * x.re - pi * x.im + a[k];
			pi = pr * x.im + pi * x.re;
			pr = npr;
		}
		return { pr, pi, qr, qi };
	};
	for (let iter = 0; iter < 500; iter++) {
		let moved = 0;
		for (let k = 0; k < n; k++) {
			const { pr, pi, qr, qi } = evalAt(z[k]);
			const qq = qr * qr + qi * qi;
			if ((pr === 0 && pi === 0) || qq === 0) continue;
			// w = p / p', then the offset w / (1 - w sum 1/(z_k - z_j))
			const wr = (pr * qr + pi * qi) / qq;
			const wi = (pi * qr - pr * qi) / qq;
			let sr = 0;
			let si = 0;
			for (let j = 0; j < n; j++) {
				if (j === k) continue;
				const xr = z[k].re - z[j].re;
				const xi = z[k].im - z[j].im;
				const xx = xr * xr + xi * xi;
				if (xx === 0) continue;
				sr += xr / xx;
				si -= xi / xx;
			}
			const br = 1 - (wr * sr - wi * si);
			const bi = -(wr * si + wi * sr);
			const bb = br * br + bi * bi;
			const or = (wr * br + wi * bi) / bb;
			const oi = (wi * br - wr * bi) / bb;
			z[k] = { re: z[k].re - or, im: z[k].im - oi };
			moved = Math.max(moved, Math.hypot(or, oi) / Math.max(Math.hypot(z[k].re, z[k].im), 1e-300));
		}
		if (moved < 1e-13) return [...zeros, ...z];
	}
	return z.every((x) => Number.isFinite(x.re) && Number.isFinite(x.im)) ? [...zeros, ...z] : null;
}

/**
 * The poles of a netlist (rad/s, { re, im }), the input source shorted,
 * with ideal op-amps or, with gbw (Hz), single-pole ones as nodalResponse
 * models them. `scale` (rad/s) is where to start looking, about the
 * circuit's own omega0. Null when the netlist has no determinate poles.
 */
export function nodalPoles(elements, { input = 'vin', gbw = null, aol = Infinity, scale = 2 * Math.PI * 1000 } = {}) {
	const index = new Map();
	const nodeOf = (name) => {
		if (name === '0' || name === input) return -1;
		if (!index.has(name)) index.set(name, index.size);
		return index.get(name);
	};
	const used = elements.filter((e) => e.kind === 'R' || e.kind === 'C' || e.kind === 'OP');
	for (const e of used) e.nodes.forEach(nodeOf);
	const opamps = used.filter((e) => e.kind === 'OP');
	const n = index.size;
	const size = n + opamps.length;
	if (size === 0) return [];
	const G = Array.from({ length: size }, () => new Array(size).fill(0));
	const Cm = Array.from({ length: size }, () => new Array(size).fill(0));
	const stamp = (M, a, b, y) => {
		if (a >= 0) M[a][a] += y;
		if (b >= 0) M[b][b] += y;
		if (a >= 0 && b >= 0) {
			M[a][b] -= y;
			M[b][a] -= y;
		}
	};
	let dynamic = 0;
	for (const e of used) {
		if (e.kind === 'R') stamp(G, nodeOf(e.nodes[0]), nodeOf(e.nodes[1]), 1 / e.value);
		else if (e.kind === 'C') {
			stamp(Cm, nodeOf(e.nodes[0]), nodeOf(e.nodes[1]), e.value);
			dynamic++;
		}
	}
	const finite = Number.isFinite(gbw) && gbw > 0;
	opamps.forEach((e, k) => {
		const row = n + k;
		const [p, m, out] = e.nodes.map(nodeOf);
		if (out >= 0) G[out][row] += 1;
		if (p >= 0) G[row][p] += 1;
		if (m >= 0) G[row][m] -= 1;
		if (finite && out >= 0) {
			G[row][out] -= Number.isFinite(aol) ? 1 / aol : 0;
			Cm[row][out] -= 1 / (2 * Math.PI * gbw);
			dynamic++;
		}
	});
	if (dynamic === 0) return [];
	// past the fastest RC of the netlist and the op-amps' own pole, every pole is inside
	const rs = used.filter((e) => e.kind === 'R').map((e) => e.value);
	const cs = used.filter((e) => e.kind === 'C').map((e) => e.value);
	const fastest = rs.length && cs.length ? 1 / (Math.min(...rs) * Math.min(...cs)) : scale;
	const top = 1000 * Math.max(scale, fastest, finite ? 2 * Math.PI * gbw : 0);
	const coeffs = nodalPolynomial(G, Cm, dynamic, scale, top);
	if (coeffs.every((v) => v === 0)) return null;
	return nodalRoots(coeffs);
}
