import { DIODE_MODELS, diodeCurrent } from './diodeLaw';
import { capacitorValues, largestResistorNotAbove, nearestResistor, nearestValue, resistorValues, stockName } from './eseries';

/**
 * Diode + resonant tank AM modulator, built as a switching modulator.
 *
 * An inverting summer adds the carrier, the message and a small DC bias:
 *   v_s(t) = A_d cos(w_p t) + u_m m(t) + V_B
 * A_d is the carrier's amplitude at the diode, u_m the message's and V_B
 * the bias (from -Vcc through R_b, so it comes out positive). The summer's
 * own minus sign only turns the carrier and the message over, which
 * changes nothing in AM. v_s drives a series resistor R_s and a diode into
 * a parallel RLC tank to ground, tuned to the carrier; the tank's voltage
 * is the output.
 *
 * With volt-sized signals a diode is not the gentle square law of a Taylor
 * series: it is a switch, on while v_s is above its knee and off below.
 * Driven mostly by the carrier it is on for half of each carrier cycle, so
 * its current is v_s / R_s times a square wave at the carrier,
 * 1/2 + (2/pi) cos(w_p t) - ... The 1/2 times the carrier gives the
 * carrier line, the (2/pi) cos(w_p t) times the message gives the
 * sidebands, and the tank keeps those three. For an ideal switch
 * (Haykin's switching modulator) the index is n = 4 u_m / (pi A_d).
 *
 * A real diode switches softly: its current grows exponentially over its
 * last few tenths of a volt. So the design works cycle by cycle with the
 * diode law (diodeLaw.js). For each value of the message, one carrier
 * cycle of diode current is computed, and its carrier component is the
 * envelope at that instant; the tank answers that component with a
 * voltage which subtracts from the diode's drive, and the cycle is solved
 * with it. The envelope over one message cycle then gives the index, the
 * carrier out and the distortion. LTspice lands within about a percent.
 *
 * The parts:
 *   C    a stock pair in parallel that puts the tank on the carrier (one
 *        E12 part can miss by several percent and drop a sideband)
 *   R_p  sets the carrier's gain, A_d = (R_f / R_p) A_c
 *   R_s  the series resistor: through the switching diode the tank sees a
 *        source of about 2 R_s, so R_s is taken twice the resistance that
 *        sets the band, which keeps the tank's own resistor in charge
 *   R_t  the tank's resistor, sized so that R_t in parallel with the
 *        source gives the band asked for (the loaded band)
 *   R_b  sets the bias from -Vcc, V_B = (R_f / R_b) Vcc; V_B is the one
 *        that gives the least distortion at the target index
 *   R_m  sets the message's gain, u_m = (R_f / R_m) A_m, solved for the
 *        target index
 *
 * The tank passes the sidebands at f_p +/- f_m with the gain of its
 * loaded band, 1 / sqrt(1 + (2 f_m / BW)^2), so the index a tone at
 * f_m,max carries is that much below the designed one; the sideband
 * margin (BW = 2 x margin x f_m,max) sets how much.
 */

const SUMMER_RF = 10_000;

/** A number close to zero, for the fixed-point loops. */
const TOL = 1e-9;

/**
 * The diode's current as a function of the voltage across it and R_s,
 * tabulated once per design so the cycle-by-cycle work is a lookup. Past
 * the table the current is the resistive straight line it tends to.
 */
function currentTable(r, d, vMin, vMax, N = 8192) {
	const step = (vMax - vMin) / (N - 1);
	const tab = new Float64Array(N);
	for (let k = 0; k < N; k++) tab[k] = diodeCurrent(vMin + k * step, r, d);
	const slope = 1 / (r + d.Rs);
	return (v) => {
		const x = (v - vMin) / step;
		if (x <= 0) return tab[0];
		if (x >= N - 1) return tab[N - 1] + (v - vMax) * slope;
		const k = Math.floor(x);
		return tab[k] + (x - k) * (tab[k + 1] - tab[k]);
	};
}

/** Impedance of the parallel tank at f, as { re, im }. */
export function tankImpedance(f, { r, l, c }) {
	// a component below 0 Hz (f_p - h f_m past the carrier) is at |f|; at DC the coil shorts the tank
	const w = 2 * Math.PI * Math.abs(f);
	if (w === 0) return { re: 0, im: 0 };
	const g = 1 / r;
	const b = w * c - 1 / (w * l);
	const m2 = g * g + b * b;
	return { re: g / m2, im: -b / m2 };
}

/** cos and sin at S points of a cycle, computed once per size. */
const TRIG = new Map();
function trig(S) {
	if (!TRIG.has(S)) {
		const cos = new Float64Array(S);
		const sin = new Float64Array(S);
		for (let s = 0; s < S; s++) {
			cos[s] = Math.cos((2 * Math.PI * s) / S);
			sin[s] = Math.sin((2 * Math.PI * s) / S);
		}
		TRIG.set(S, { cos, sin });
	}
	return TRIG.get(S);
}

/** The carrier component of the diode current, and its peak, for a given tank voltage. */
function fundamentalWith(current, a, u, v1, S) {
	const { cos, sin } = trig(S);
	let re = 0;
	let im = 0;
	let peak = 0;
	for (let s = 0; s < S; s++) {
		const i = current(a * cos[s] + u - (v1.re * cos[s] - v1.im * sin[s]));
		re += i * cos[s];
		im += i * sin[s];
		if (i > peak) peak = i;
	}
	return { re: (2 * re) / S, im: (-2 * im) / S, peak };
}

/**
 * One carrier cycle with the drive a cos(th) + u. The tank answers the
 * carrier component I1 of the diode current with V1 = z I1 (it shorts
 * everything else), and V1 cos(th) subtracts from the drive; the cycle is
 * solved for that. The step is relaxed by `relax`, about 1 / (1 + R_t /
 * 2 R_s): the tank's voltage takes back part of what it gets, and the
 * relaxation cancels that, so a few passes converge. Returns I1 and V1
 * (complex, cosine-referenced) and the largest current. `v1` starts it.
 */
function carrierCycle(current, a, u, z, S, relax, v1 = { re: 0, im: 0 }) {
	let v = v1;
	let f = fundamentalWith(current, a, u, v, S);
	for (let it = 0; it < 100; it++) {
		const next = { re: z.re * f.re - z.im * f.im, im: z.re * f.im + z.im * f.re };
		const dre = next.re - v.re;
		const dim = next.im - v.im;
		v = { re: v.re + relax * dre, im: v.im + relax * dim };
		f = fundamentalWith(current, a, u, v, S);
		if (Math.hypot(dre, dim) < TOL) break;
	}
	return { i1: { re: f.re, im: f.im }, v1: v, peak: f.peak };
}

/**
 * The envelope over one message cycle, m = cos(phi) at P points: the
 * carrier's height at the output for each value of the message. Returns
 * its mean (the carrier out), the index (fundamental over mean), the
 * distortion (harmonics 2 to 5 over the fundamental), the extremes and
 * the largest diode current.
 */
function envelopeOf(current, { a, um, vb, z, relax }, P, S) {
	const e = [];
	let peak = 0;
	let v1;
	for (let k = 0; k < P; k++) {
		const m = Math.cos((2 * Math.PI * k) / P);
		const cyc = carrierCycle(current, a, um * m + vb, z, S, relax, v1);
		v1 = cyc.v1;
		e.push(Math.hypot(cyc.v1.re, cyc.v1.im));
		if (cyc.peak > peak) peak = cyc.peak;
	}
	const mean = e.reduce((s, x) => s + x, 0) / P;
	const harm = (h) => {
		let re = 0;
		let im = 0;
		e.forEach((x, k) => {
			re += x * Math.cos((2 * Math.PI * h * k) / P);
			im += x * Math.sin((2 * Math.PI * h * k) / P);
		});
		return (2 * Math.hypot(re, im)) / P;
	};
	const harmonics = [1, 2, 3, 4, 5].map((h) => (2 * h < P ? harm(h) : 0));
	const h1 = harmonics[0];
	const rest = harmonics.slice(1).reduce((s, x) => s + x * x, 0);
	return { mean, n: h1 / mean, thd: h1 > 0 ? Math.sqrt(rest) / h1 : 0, harmonics, max: Math.max(...e), min: Math.min(...e), peak };
}

/**
 * The message drive u_m that gives index `target` at bias vb. The index
 * rises steadily with u_m, so a bracketed secant (regula falsi, Illinois
 * variant) finds it in a few evaluations.
 */
function driveForIndex(current, base, vb, target, P, S) {
	const f = (um) => envelopeOf(current, { ...base, um, vb }, P, S).n - target;
	let a = 0;
	let fa = -target;
	let b = 1.5 * base.a;
	let fb = f(b);
	if (fb < 0) return null;
	let side = 0;
	for (let it = 0; it < 40; it++) {
		const c = (a * fb - b * fa) / (fb - fa);
		const fc = f(c);
		if (Math.abs(fc) < 1e-5) return c;
		if (fc < 0) {
			a = c;
			fa = fc;
			if (side === -1) fb /= 2;
			side = -1;
		} else {
			b = c;
			fb = fc;
			if (side === 1) fa /= 2;
			side = 1;
		}
		if (b - a < 1e-6 * base.a) break;
	}
	return (a + b) / 2;
}

export function designDiodeMixerModulator({
	fp,
	fmMax,
	sidebandMargin = 3,
	inductance = 1e-3,
	carrierAmplitude = 1,
	modAmplitude = 1,
	targetModulationIndex = 0.8,
	carrierDrive = 2,
	vcc = 12,
	opampSwing = 10.5,
	gbw = 3e6,
	diode = '1N4148',
	resistorSeries = 'E24', // a series name, or a list of the resistors on hand (ohms)
	capacitors = null, // null for E12 capacitors, or a list of the capacitors on hand (farads)
	capacitorStock = capacitors // the same, under the name the downloaded script uses
} = {}) {
	if (!(fp > 0) || !(fmMax > 0) || !(inductance > 0) || !(sidebandMargin > 0)) return null;
	// the band, sidebandMargin x fmMax either side of fp, has to stay clear of the message itself
	if (!(fp - sidebandMargin * fmMax > fmMax)) return null;
	if (!(carrierAmplitude > 0) || !(modAmplitude > 0) || !(carrierDrive > 0) || !(vcc > 0)) return null;
	if (!(targetModulationIndex > 0 && targetModulationIndex <= 1)) return null;
	const d = DIODE_MODELS[diode] ?? DIODE_MODELS['1N4148'];
	const stock = resistorSeries;
	// the summer's feedback resistor: 10 k, or what the stock has nearest
	const rf = nearestResistor(SUMMER_RF, stock);
	const w0 = 2 * Math.PI * fp;

	// the tank capacitor: a main part with a smaller one in parallel (or
	// none), from E12 or the capacitors on hand, the pair closest to the
	// target, preferring the single part on a tie
	const cTarget = 1 / (w0 * w0 * inductance);
	const capAll = capacitorValues(capacitorStock, 'E12', -12, -6);
	const mains = capAll.filter((v) => v <= cTarget * 1.0005);
	const trims = [0, ...capAll];
	let best = null;
	for (const c1 of mains.length ? mains : capAll.slice(0, 1)) {
		for (const c2 of trims) {
			if (c2 > c1) break;
			const err = Math.abs(Math.log((c1 + c2) / cTarget));
			if (!best || err < best.err - 1e-9) best = { c1, c2, err };
		}
	}
	const tankParts = best.c2 > 0 ? [best.c1, best.c2] : [best.c1];
	const c = best.c1 + best.c2;
	const f0Actual = 1 / (2 * Math.PI * Math.sqrt(inductance * c));
	const detuning = f0Actual - fp;

	// the carrier's amplitude at the diode, as asked (the stock R_p that
	// sets it is picked with R_m below)
	const drive = carrierDrive;

	// the loaded band, widened by what detuning the capacitors left, and
	// the resistors that make it: R_s at twice the band's resistance, R_t
	// so that R_t in parallel with the source's 2 R_s gives it (rounded
	// down: a lower R_t only widens the band)
	const bandwidth = 2 * sidebandMargin * fmMax;
	const bandwidthNeeded = bandwidth + 2 * Math.abs(detuning);
	const rEffTarget = 1 / (2 * Math.PI * bandwidthNeeded * c);
	// both from 10 ohm up, the series or the list alike; the smallest one
	// there is the floor under which the band can no longer be set
	const tankRange = resistorValues(stock, 1, 7);
	const floor = tankRange[0];
	const rs = nearestValue(2 * rEffTarget, tankRange);
	const rtTarget = 1 / (1 / rEffTarget - 1 / (2 * rs));
	const rt = largestResistorNotAbove(rtTarget, stock, 1, 7) ?? floor;
	const tank = { r: rt, l: inductance, c };
	const z = tankImpedance(fp, tank);

	// the diode law, tabulated over every voltage the drive can reach
	const reach = 3 * drive + 2;
	const current = currentTable(rs, d, -reach, reach);
	const relax = 1 / (1 + rt / (2 * rs));
	const base = { a: drive, z, relax };

	// the bias with the least distortion at the target index: a coarse
	// sweep, then a golden-section search around the best point
	const P0 = 12;
	const S0 = 64;
	const thdAt = (vb) => {
		const um = driveForIndex(current, base, vb, targetModulationIndex, P0, S0);
		return um === null ? { vb, um, thd: Infinity } : { vb, um, thd: envelopeOf(current, { ...base, um, vb }, P0, S0).thd };
	};
	const vbMax = 0.8;
	let bestVb = null;
	for (let k = 0; k <= 4; k++) {
		const t = thdAt((vbMax * k) / 4);
		if (!bestVb || t.thd < bestVb.thd) bestVb = t;
	}
	if (!Number.isFinite(bestVb.thd)) return null;
	{
		let lo = Math.max(0, bestVb.vb - vbMax / 4);
		let hi = Math.min(vbMax, bestVb.vb + vbMax / 4);
		const g = (Math.sqrt(5) - 1) / 2;
		let x1 = hi - g * (hi - lo);
		let x2 = lo + g * (hi - lo);
		let t1 = thdAt(x1);
		let t2 = thdAt(x2);
		for (let it = 0; it < 6; it++) {
			if (t1.thd < t2.thd) {
				hi = x2;
				x2 = x1;
				t2 = t1;
				x1 = hi - g * (hi - lo);
				t1 = thdAt(x1);
			} else {
				lo = x1;
				x1 = x2;
				t1 = t2;
				x2 = lo + g * (hi - lo);
				t2 = thdAt(x2);
			}
		}
		for (const t of [t1, t2]) if (t.thd < bestVb.thd) bestVb = t;
	}

	// the bias resistor, from -Vcc; a diode whose best bias is next to
	// nothing (a Schottky) gets none
	const rb = bestVb.vb >= 0.02 ? nearestResistor((rf * vcc) / bestVb.vb, stock, 3, 8) : null;
	const vb = rb ? (rf * vcc) / rb : 0;

	// the carrier and message resistors: the index follows u_m / A_d, the
	// ratio of R_p to R_m, so the stock pair that gives the target index
	// best is picked among the neighbours of the ideal values
	const umWanted = driveForIndex(current, base, vb, targetModulationIndex, P0, S0) ?? bestVb.um;
	const rpIdeal = (rf * carrierAmplitude) / carrierDrive;
	const stocked = resistorValues(stock, 1, 8);
	const neighbours = (target) => {
		const k = stocked.findIndex((v) => v >= target);
		const at = k < 0 ? stocked.length : k;
		return stocked.slice(Math.max(0, at - 2), at + 2);
	};
	// R_p within 12 % of its ideal value, or the stock values either side of
	// it when a sparse stock has none that close (the nearest one otherwise)
	const rpNear = neighbours(rpIdeal).filter((v) => Math.abs(Math.log(v / rpIdeal)) < 0.12);
	const rpAround = neighbours(rpIdeal);
	let pick = null;
	for (const rpC of rpNear.length ? rpNear : rpAround.length ? rpAround : [nearestResistor(rpIdeal, stock)]) {
		const driveC = (rf / rpC) * carrierAmplitude;
		const rmIdeal = (rf * modAmplitude) / (umWanted * (driveC / drive));
		const rmAround = neighbours(rmIdeal);
		for (const rmC of rmAround.length ? rmAround : [nearestResistor(rmIdeal, stock)]) {
			const umC = (rf / rmC) * modAmplitude;
			const nC = envelopeOf(current, { ...base, a: driveC, um: umC, vb }, P0, S0).n;
			const err = Math.abs(nC - targetModulationIndex) + 0.02 * Math.abs(Math.log(rpC / rpIdeal));
			if (!pick || err < pick.err) pick = { rp: rpC, rm: rmC, err };
		}
	}
	if (!pick) return null;
	const rp = pick.rp;
	const rm = pick.rm;
	const driveBuilt = (rf / rp) * carrierAmplitude;
	const um = (rf / rm) * modAmplitude;
	const built = { ...base, a: driveBuilt };
	const env = envelopeOf(current, { ...built, um, vb }, 32, 128);
	// parts so far off (a list with nothing near the ohms needed) that the cycle solve breaks down: no design
	if (!Number.isFinite(env.n) || !Number.isFinite(env.mean)) return null;

	// the source the tank sees at the carrier, from how the carrier current
	// gives way when the tank's voltage rises (at the message's zero)
	const at = carrierCycle(current, driveBuilt, vb, z, 128, relax);
	const dv = 1e-3 * Math.max(1e-3, Math.hypot(at.v1.re, at.v1.im));
	const i1a = fundamentalWith(current, driveBuilt, vb, at.v1, 128);
	const i1b = fundamentalWith(current, driveBuilt, vb, { re: at.v1.re + dv, im: at.v1.im }, 128);
	const di = i1a.re - i1b.re;
	const rSource = di > 0 ? dv / di : 2 * rs;
	const rEff = 1 / (1 / rt + 1 / rSource);
	const bwLoaded = 1 / (2 * Math.PI * rEff * c);
	const qLoaded = f0Actual / bwLoaded;
	const bandLow = f0Actual - bwLoaded / 2;
	const bandHigh = f0Actual + bwLoaded / 2;
	const slack = 1e-9 * fp;
	const sidebandsInBand = fp - fmMax >= bandLow - slack && fp + fmMax <= bandHigh + slack;
	// what the loaded tank does to each sideband, relative to the carrier
	const loaded = { r: rEff, l: inductance, c };
	const zc = tankImpedance(fp, loaded);
	const mag = (q) => Math.hypot(q.re, q.im);
	const sideband = (f) => (mag(tankImpedance(fp - f, loaded)) + mag(tankImpedance(fp + f, loaded))) / (2 * mag(zc));
	const gainLow = mag(tankImpedance(fp - fmMax, loaded)) / mag(zc);
	const gainHigh = mag(tankImpedance(fp + fmMax, loaded)) / mag(zc);
	const sidebandGain = (gainLow + gainHigh) / 2;
	// a tone at f_m,max: its envelope's harmonics sit further out, at
	// f_p +/- h f_m, where the tank passes less still
	const hOut = env.harmonics.map((x, k) => x * sideband((k + 1) * fmMax));
	const thdAtFmMax = hOut[0] > 0 ? Math.sqrt(hOut.slice(1).reduce((s, x) => s + x * x, 0)) / hOut[0] : 0;

	// the summer: its peak output and how hard its op-amp works at the carrier
	const summerPeak = driveBuilt + um + vb;

	// what the page cannot vouch for: the diode's junction capacitance passes
	// the drive while the diode is off once 2 pi f_p Cjo R_s is not small (the
	// cycle solve leaves Cjo out, LTspice does not); a tank tuned off the
	// carrier because no capacitor pair reaches it; resistors at the bottom
	// of the search, where the band can no longer be set
	const cjRatio = 2 * Math.PI * fp * (d.cjo ?? 0) * rs;
	// the summer's output current at the crest: the diode's peak through R_s
	// and the feedback current through R_f, which a TL08x keeps to about 20 mA
	const summerCurrent = env.peak + summerPeak / rf;
	// the message itself in the diode current (about u_m / 2 R_s, on half the
	// time), across the loaded tank at f_m: what of it reaches the output
	const messageLeak = (mag(tankImpedance(fmMax, loaded)) * (um / (2 * rs))) / Math.max(1e-12, env.mean);
	const noiseGain = 1 + rf * (1 / rp + 1 / rm + (rb ? 1 / rb : 0));
	const gbwRatio = (fp * noiseGain) / gbw;

	return {
		fp,
		fmMax,
		sidebandMargin,
		bandwidth,
		bandwidthNeeded,
		q: fp / bandwidth,
		inductance,
		capacitance: c,
		capacitors: tankParts,
		cTarget,
		f0Actual,
		detuning,
		diode: d.id,
		diodeLabel: d.label,
		carrierAmplitude,
		modAmplitude,
		targetModulationIndex,
		vcc,
		stockName: stockName(stock),
		summer: {
			rf,
			rp,
			rm,
			rb,
			drive: driveBuilt,
			driveTarget: carrierDrive,
			um,
			vb,
			vbBest: bestVb.vb,
			peak: summerPeak,
			swingOk: summerPeak <= opampSwing,
			opampSwing,
			noiseGain,
			gbwRatio,
			gbwOk: gbwRatio <= 0.2
		},
		rs,
		rt,
		rtTarget,
		rEffTarget,
		rSource,
		rEff,
		bwLoaded,
		qLoaded,
		bandLow,
		bandHigh,
		sidebandsInBand,
		idealIndex: (4 * um) / (Math.PI * driveBuilt),
		idealCarrier: (driveBuilt * rEff) / (2 * rs),
		modulationIndex: env.n,
		thd: env.thd,
		thdAtFmMax,
		carrierOut: env.mean,
		envelopeMax: env.max,
		envelopeMin: env.min,
		peakCurrent: env.peak,
		sidebandGain,
		gainLow,
		gainHigh,
		indexAtFmMax: env.n * sidebandGain,
		cjRatio,
		cjOk: cjRatio <= 0.05,
		tuneOk: Math.abs(f0Actual / fp - 1) <= 0.03,
		resistorFloor: floor,
		rangeOk: rtTarget >= floor * (1 - 1e-9) && 2 * rEffTarget >= floor * 0.95,
		// how far the stock parts leave the index from the target
		indexOk: Math.abs(env.n - targetModulationIndex) <= 0.05 && env.n <= 1,
		summerCurrent,
		currentOk: summerCurrent <= 0.02,
		messageLeak,
		leakOk: messageLeak <= 0.03
	};
}
