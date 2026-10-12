import { boctorFeasible, designBoctorNotch } from './boctor';
import { capacitorCandidates } from './eseries';
import { mfbBpFits, mfbBpFitsWith } from './mfbBandPass';
import { notchOptions } from './stages';

/**
 * Counting op-amps, to choose between the two ways of building a band
 * filter: the cascade (a high-pass and a low-pass in series for a
 * band-pass, two branches and a summing amplifier for a band-stop) and
 * the transformation of one low-pass prototype. Each stage is counted with
 * the topology it will really get, Boctor's fallbacks included.
 */

export const OPAMPS_PER_STAGE = {
	mfb: 1,
	sallenKey: 1,
	mfbHp: 1,
	sallenKeyHp: 1,
	firstOrder: 1,
	firstOrderHp: 1,
	boctor: 1,
	boctorHp: 1,
	mfbBp: 1,
	towThomas: 3,
	towThomasHp: 3,
	towThomasNotch: 3,
	towThomasBp: 3
};

/**
 * Whether designMfbBandPass can build a stage on the default capacitor
 * grid (E6, 1 pF to 6.8 uF): some pair of capacitors within the ratio it
 * allows keeps all three ideal resistors inside (200 ohm, 2 Mohm), which
 * also needs the gain under its ceiling Q^2 (1 + C2/C1). With `gbw` (Hz)
 * the stage is built for a single-pole op-amp of that gain-bandwidth, and
 * the pair must also leave it a loop gain of at least 2 (mfbBpFitsWith).
 */
export function mfbBandPassFeasible(wn, q, gain, gbw = null) {
	const size = Math.abs(gain);
	if (![wn, q, size].every((v) => Number.isFinite(v) && v > 0)) return false;
	const caps = capacitorCandidates(null);
	if (Number.isFinite(gbw) && gbw > 0) return caps.some((C1) => caps.some((C2) => mfbBpFitsWith(wn, q, size, C1, C2, gbw) !== null));
	return caps.some((C1) => caps.some((C2) => mfbBpFits(wn, q, size, C1, C2)));
}

// The plan asks Boctor for the same stages again and again (both methods,
// every menu, every redraw), and one search takes a few milliseconds.
const BAND_BOCTOR_CACHE = new Map();
const BAND_BOCTOR_CACHE_SIZE = 256;

/**
 * designBoctorNotch(wn, q, wz, { lowSide }) on the full grid (E24
 * resistors, E6 capacitors 1 pF to 6.8 uF, no pairs), the grid the page
 * falls back to, remembered for the last few hundred stages. null when
 * Boctor cannot build the stage. The design is shared between callers:
 * read it, copy it to change it.
 */
export function bandBoctorDesign(wn, q, wz, lowSide) {
	const key = `${wn} ${q} ${wz} ${lowSide}`;
	if (BAND_BOCTOR_CACHE.has(key)) return BAND_BOCTOR_CACHE.get(key);
	const design = boctorFeasible(wn, q, wz, lowSide) ? designBoctorNotch(wn, q, wz, { lowSide }) : null;
	if (BAND_BOCTOR_CACHE.size >= BAND_BOCTOR_CACHE_SIZE) BAND_BOCTOR_CACHE.delete(BAND_BOCTOR_CACHE.keys().next().value);
	BAND_BOCTOR_CACHE.set(key, design);
	return design;
}

// Boctor sets its own gain. A notch of a transformed design keeps Boctor
// only when that gain lands within BAND_BOCTOR_LEVEL_DB of the stage's
// target (gain 1 at f0 in a band-pass, at DC in a band-stop) and its zero
// sits on target (within 0.5 %, at least 40 dB deep); otherwise the stage
// would move the whole passband, and a Tow-Thomas notch takes it.
const BAND_BOCTOR_LEVEL_DB = 1;

function boctorHoldsStage(stage, design) {
	const a = design.actual;
	const at = (w) => Math.hypot(a.gain * (a.wz * a.wz - w * w), (a.numeratorS ?? 0) * w) / Math.hypot(a.wn * a.wn - w * w, (a.wn * w) / a.q);
	const level = stage.gainAt === 'dc' ? Math.abs(a.dcGain) : Number.isFinite(stage.w0) ? at(stage.w0) : 1;
	if (!(Math.abs(20 * Math.log10(level)) <= BAND_BOCTOR_LEVEL_DB)) return false;
	return Math.abs(a.wz / stage.wz - 1) <= 0.005 && at(stage.wz) <= 0.01 * level;
}

/**
 * The topology a stage will be built with, under the page's menus.
 * A cascade design takes { method: 'cascade', highpass, lowpass }, one
 * menu per side ('mfb' | 'sallenKey' | 'towThomas' | 'boctor'); a
 * transformed one { method: 'transformed', bandpass: 'mfb' | 'towThomas',
 * notch: 'boctor' | 'towThomas' }, and gbw (Hz) when its MFB band-pass
 * stages are built for a single-pole op-amp of that gain-bandwidth (left
 * out or null: an ideal op-amp). Boctor counts only where its search
 * really finds parts on the full grid (bandBoctorDesign), as the page then
 * builds it. Returns { topology, fallback, unavailable }: fallback is true
 * for a notch of a transformed design that Boctor cannot build, which goes
 * to Tow-Thomas instead, and then why says the reason: 'symmetric' (its
 * zero on its own f0), 'limit' (the high-pass form's Q limit), 'parts' (no
 * parts on the full grid) or 'level' (Boctor's own gain or zero misses the
 * stage's target, see boctorHoldsStage); unavailable is the reason the
 * stage cannot be built at all (topology null then), as for a cascade
 * notch Boctor cannot build.
 */
export function plannedTopology(stage, menus) {
	const built = (topology, fallback = false) => ({ topology, fallback, unavailable: null });
	const blocked = (reason) => ({ topology: null, fallback: false, unavailable: reason });
	const notch = Number.isFinite(stage.wz);

	if (menus.method === 'transformed') {
		if (stage.filterType === 'bandpass') {
			if (menus.bandpass === 'towThomas') return built('towThomasBp');
			const gbw = menus.gbw ?? null;
			if (mfbBandPassFeasible(stage.wn, stage.q, stage.gain, gbw)) return built('mfbBp');
			// with the op-amp, say when it alone is what stops the stage
			return blocked(gbw !== null && mfbBandPassFeasible(stage.wn, stage.q, stage.gain) ? 'MFB band-pass leaves the op-amp a loop gain under 2 at this Q and f0' : 'MFB band-pass cannot reach this Q and gain');
		}
		if (notch && menus.notch === 'boctor') {
			const lowSide = notchOptions(stage).boctorLowSide;
			const found = lowSide === null ? null : bandBoctorDesign(stage.wn, stage.q, stage.wz, lowSide);
			if (found && boctorHoldsStage(stage, found)) return built(lowSide ? 'boctor' : 'boctorHp');
			const why = lowSide === null ? 'symmetric' : !boctorFeasible(stage.wn, stage.q, stage.wz, lowSide) ? 'limit' : found ? 'level' : 'parts';
			return { ...built('towThomasNotch', true), why };
		}
		return built('towThomasNotch');
	}

	const hp = stage.filterType === 'highpass';
	const menu = hp ? menus.highpass : menus.lowpass;
	if (stage.order === 1) return built(hp ? 'firstOrderHp' : 'firstOrder');
	if (notch) {
		if (menu === 'boctor') {
			const lowSide = notchOptions(stage).boctorLowSide;
			return bandBoctorDesign(stage.wn, stage.q, stage.wz, lowSide) ? built(lowSide ? 'boctor' : 'boctorHp') : blocked('Boctor cannot build this notch');
		}
		if (menu === 'towThomas') return built('towThomasNotch');
		return blocked('a notch needs Tow-Thomas or Boctor');
	}
	if (menu === 'towThomas' || menu === 'boctor') return built(hp ? 'towThomasHp' : 'towThomas');
	if (menu === 'sallenKey') return built(hp ? 'sallenKeyHp' : 'sallenKey');
	return built(hp ? 'mfbHp' : 'mfb');
}

/**
 * The op-amps a design takes under the menus: the sum over its stages,
 * plus the summing amplifier of a parallel band-stop. Infinity, with the
 * first reason, when a stage cannot be built. fallbacks lists the stages
 * (from 1) that leave Boctor for Tow-Thomas.
 */
export function opampCount(design, menus) {
	if (!design) return null;
	let opamps = design.method === 'parallel' ? 1 : 0;
	let unavailable = null;
	const fallbacks = [];
	const topologies = design.stages.map((stage, i) => {
		const plan = plannedTopology(stage, menus);
		if (!plan.unavailable) opamps += OPAMPS_PER_STAGE[plan.topology];
		else if (unavailable === null) unavailable = `stage ${i + 1}: ${plan.unavailable}`;
		if (plan.fallback) fallbacks.push(i + 1);
		return plan.topology;
	});
	return { opamps: unavailable ? Infinity : opamps, stages: design.stages.length, unavailable, fallbacks, topologies };
}

/**
 * Which method to use, from the two opampCount results (either may be
 * null): the transformation when it can be built and takes strictly fewer
 * op-amps, or when only it can be built; the cascade otherwise.
 */
export function chooseBandMethod({ cascade, transformed }) {
	const usable = (c) => !!c && !c.unavailable && Number.isFinite(c.opamps);
	if (!usable(transformed)) return 'cascade';
	if (!usable(cascade)) return 'transformed';
	return transformed.opamps < cascade.opamps ? 'transformed' : 'cascade';
}
