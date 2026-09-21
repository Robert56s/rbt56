/**
 * Where the JFET's numbers come from. The gain cell only ever needs the
 * straight line G(VGS) = beta (VGS - VP): its slope beta, its intercept VP,
 * and the stretch of gate voltage the design is allowed to use, given as a
 * bias point vc and a half-range around it. Three ways to get there:
 *
 *   modelFromIdss(vp, idss)     the datasheet pair; beta = 2 IDSS / VP^2,
 *                               bias halfway along the range, vc = VP/2
 *   modelFromRdsOn(vp, rdsOn)   the other datasheet pair; rDS(on) is the
 *                               channel at VGS = 0, so beta = 1/(rdsOn |VP|)
 *   fitModel(points, window)    a straight line through measured (VGS, G)
 *                               points inside a chosen VGS window; the bias
 *                               is the window's midpoint and the half-range
 *                               its half-width, so the design never leaves
 *                               the part of the curve that was checked
 *
 * A model also carries whatever it knows for display: the IDSS it implies,
 * the rDS(on) it implies, and for a fit the quality of the line.
 */

const finish = (m) => {
	const { vp, beta } = m;
	return {
		...m,
		idss: (beta * vp * vp) / 2, // the IDSS this line implies
		rdsOn: 1 / (beta * Math.abs(vp)), // the channel at VGS = 0 it implies
		gAt: (vgs) => beta * (vgs - vp)
	};
};

export function modelFromIdss(vp, idss) {
	if (!(vp < 0) || !(idss > 0)) return null;
	return finish({ mode: 'idss', vp, beta: (2 * idss) / (vp * vp), vc: vp / 2, halfRange: Math.abs(vp) / 2 });
}

export function modelFromRdsOn(vp, rdsOn) {
	if (!(vp < 0) || !(rdsOn > 0)) return null;
	// G(0) = beta (0 - VP) = beta |VP| = 1 / rDS(on)
	return finish({ mode: 'rdson', vp, beta: 1 / (rdsOn * Math.abs(vp)), vc: vp / 2, halfRange: Math.abs(vp) / 2 });
}

/**
 * Reads measured rows. Two numbers per row: VGS (V) and rDS (ohm). Four
 * numbers per row: VGS, Vin, VD and Rseries for the divider measurement
 * (Vin through Rseries into the drain, source grounded, VD read at the
 * drain), which gives rDS = Rseries VD / (Vin - VD). Commas, semicolons,
 * tabs or spaces separate the numbers; anything unreadable is skipped.
 */
export function parseMeasurements(text) {
	const rows = [];
	for (const raw of String(text).split(/\r?\n/)) {
		const nums = raw
			.split(/[\s,;]+/)
			.filter(Boolean)
			.map(Number);
		if (nums.length < 2 || nums.some((v) => !Number.isFinite(v))) continue;
		let vgs;
		let rds;
		if (nums.length >= 4) {
			const [g, vin, vd, rs] = nums;
			if (!(rs > 0) || !(vin > vd) || !(vd > 0)) continue;
			vgs = g;
			rds = (rs * vd) / (vin - vd);
			rows.push({ vgs, rds, g: 1 / rds, vd, vin, rs });
		} else {
			[vgs, rds] = nums;
			if (!(rds > 0)) continue;
			rows.push({ vgs, rds, g: 1 / rds });
		}
	}
	return rows.sort((a, b) => a.vgs - b.vgs);
}

/**
 * Least-squares line G = a VGS + b over the points whose VGS lies inside
 * [low, high]. Returns null with fewer than two points there. Along with
 * the model comes what a scope of the fit shows: R^2, and the largest
 * relative gap between a point and the line, so a JFET whose conductance
 * is not straight over the chosen window is caught rather than trusted.
 */
export function fitModel(points, { low, high } = {}) {
	const lo = Number.isFinite(low) ? low : -Infinity;
	const hi = Number.isFinite(high) ? high : Infinity;
	const used = points.filter((pt) => pt.vgs >= lo && pt.vgs <= hi);
	if (used.length < 2) return null;
	const n = used.length;
	let sx = 0;
	let sy = 0;
	let sxx = 0;
	let sxy = 0;
	for (const { vgs, g } of used) {
		sx += vgs;
		sy += g;
		sxx += vgs * vgs;
		sxy += vgs * g;
	}
	const denom = n * sxx - sx * sx;
	if (Math.abs(denom) < 1e-18) return null;
	const a = (n * sxy - sx * sy) / denom;
	const b = (sy - a * sx) / n;
	if (!(a > 0)) return null; // conductance has to rise with VGS for an N-channel part
	const vp = -b / a;
	const meanY = sy / n;
	let ssRes = 0;
	let ssTot = 0;
	let maxDev = 0;
	let maxDevAt = null;
	for (const { vgs, g } of used) {
		const fit = a * vgs + b;
		ssRes += (g - fit) ** 2;
		ssTot += (g - meanY) ** 2;
		// a point the line puts at or below zero conductance (VGS at or past
		// the fitted VP) is off by the whole of itself: report 100%, not more
		const dev = fit > 0 ? Math.abs(g - fit) / fit : 1;
		if (dev > maxDev) {
			maxDev = dev;
			maxDevAt = vgs;
		}
	}
	const wLow = Number.isFinite(low) ? low : used[0].vgs;
	const wHigh = Number.isFinite(high) ? high : used[used.length - 1].vgs;
	return finish({
		mode: 'measured',
		vp,
		beta: a,
		vc: (wLow + wHigh) / 2,
		halfRange: (wHigh - wLow) / 2,
		fit: { a, b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1, maxDev, maxDevAt, count: n, low: wLow, high: wHigh, crossesZero: wLow <= vp },
		points
	});
}

/**
 * Datasheet LIMITS for the J11x family (ON Semiconductor / Fairchild):
 * VGS(off) is given as a range, IDSS as a minimum, rDS(on) as a maximum.
 * A preset therefore describes the worst part the maker will ship, not a
 * typical one, which is why the tool still asks for a measurement. The
 * preset fills the (VP, rDS(on)) mode, with VP at the middle of its range.
 */
export const JFET_PRESETS = {
	J111: { vpRange: [-10, -3], idssMin: 20e-3, rdsOnMax: 30 },
	J112: { vpRange: [-5, -1], idssMin: 5e-3, rdsOnMax: 50 },
	J113: { vpRange: [-3, -0.5], idssMin: 2e-3, rdsOnMax: 100 }
};

/**
 * Why IDSS should not be measured the obvious way on these parts: with
 * VDS large enough to saturate the channel, the drain dissipates VDS x IDSS,
 * and a J111 passes 20 mA or more, so 10 V across it is 200 mW or more
 * in a TO-92 rated for about 350 mW at room temperature, before the
 * lead-in error of a warm channel. The ohmic-region measurement (small VD,
 * a series resistor) puts a few milliwatts in the part and is what the
 * design actually uses.
 */
export const IDSS_WARNING =
	'Do not measure I_DSS of a J111 by shorting the gate and applying a large V_DS: V_DS x I_DSS can exceed what a TO-92 dissipates. Characterize in the ohmic region instead (small V_D through a series resistor) and let the tool fit the line.';
