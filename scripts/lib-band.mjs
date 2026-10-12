// Shared by the filter checks: band filters by transformation (one
// low-pass prototype turned into band-pass or notch stages, stages.js
// designBandPassTransformed / designBandStopTransformed). The specs they
// are checked on, the design from either way of writing a spec, and the
// realization rules every consumer of such a design follows (the page,
// the downloaded script, the LTspice export):
//   - plannedTopology (bandMethod.js) picks each stage's circuit under the
//     page's two menus, Boctor's fallbacks to Tow-Thomas included;
//   - a band-pass stage is built at its own centre gain (an MFB one for
//     the single-pole op-amp menus.gbw names, when it names one), a notch
//     with notchOptions (its Boctor form, or the Tow-Thomas gain it is held
//     at);
//   - a stage the stock cannot build takes the full E24 / E6 grid and is
//     flagged stockShortfall, as on the page.

import { plannedTopology } from '../src/lib/filter/bandMethod.js';
import { designBoctorNotch } from '../src/lib/filter/boctor.js';
import { designMfbBandPass } from '../src/lib/filter/mfbBandPass.js';
import { designBandPassTransformed, designBandStopTransformed, notchOptions } from '../src/lib/filter/stages.js';
import { designTowThomasBandPass, designTowThomasNotch } from '../src/lib/filter/towThomas.js';

export const RESPONSE_KEYS = ['butterworth', 'chebyshev', 'legendre', 'bessel', 'inverseChebyshev', 'elliptic'];
export const hasZeros = (response) => response === 'elliptic' || response === 'inverseChebyshev';

// A band-pass has an Amin per stopband edge (aminDbLow at fsl, aminDbHigh
// at fsh), a band-stop one Amin for its one stopband. The narrow band-pass
// is the case the transformation was added for: 7 op-amps as a cascade on
// MFB, 3 as band-pass stages.
export const BAND_SPECS = {
	narrowBp: { filterType: 'bandpass', amaxDb: 3, aminDbLow: 50, aminDbHigh: 30, fl: 40000, fh: 60000, fsl: 10000, fsh: 100000 },
	defaultBp: { filterType: 'bandpass', amaxDb: 3, aminDbLow: 40, aminDbHigh: 40, fl: 1000, fh: 10000, fsl: 300, fsh: 30000 },
	defaultBs: { filterType: 'bandstop', amaxDb: 3, aminDb: 40, fl: 1000, fh: 30000, fsl: 3000, fsh: 10000 },
	narrowBs: { filterType: 'bandstop', amaxDb: 1, aminDb: 30, fl: 9000, fh: 11500, fsl: 9800, fsh: 10300 }
};
export const BAND_SPEC_NAMES = { narrowBp: 'narrow band-pass', defaultBp: 'default band-pass', defaultBs: 'default band-stop', narrowBs: 'narrow band-stop' };

/**
 * The transformed design of a band spec, written either way: with an Amin
 * per edge (aminDbLow, aminDbHigh), per side as the cascade takes it
 * (aminDbHp at fsl, aminDbLp at fsh), or one aminDb. One Amax: amaxDb, or
 * the smaller of the two sides', as the page does.
 */
export function designTransformed(spec, response, order = null) {
	const { filterType, fl, fh, fsl, fsh } = spec;
	const amaxDb = spec.amaxDb ?? Math.min(spec.amaxDbHp, spec.amaxDbLp);
	if (filterType === 'bandstop') return designBandStopTransformed({ response, amaxDb, aminDb: spec.aminDb, fl, fh, fsl, fsh, order });
	const aminDbLow = spec.aminDbLow ?? spec.aminDbHp ?? spec.aminDb;
	const aminDbHigh = spec.aminDbHigh ?? spec.aminDbLp ?? spec.aminDb;
	return designBandPassTransformed({ response, amaxDb, aminDbLow, aminDbHigh, fl, fh, fsl, fsh, order });
}

/** The page's menus for a transformed design: the band-pass stages' circuit and the notch stages'. */
export const transformedMenus = (bandpass, notch) => ({ method: 'transformed', bandpass, notch });

/**
 * One stage of a transformed design as the page builds it, or null when
 * its plan is unavailable or no stock builds it.
 */
export function realizeBandStage(stage, menus, opts = {}) {
	const plan = plannedTopology(stage, menus);
	if (plan.unavailable) return null;
	const build = (o) => {
		if (stage.filterType === 'bandpass') return plan.topology === 'mfbBp' ? designMfbBandPass(stage.wn, stage.q, { ...o, gain: stage.gain, ...(menus.gbw ? { gbw: menus.gbw } : {}) }) : designTowThomasBandPass(stage.wn, stage.q, { ...o, gain: stage.gain });
		const how = notchOptions(stage);
		if (plan.topology === 'boctor' || plan.topology === 'boctorHp') return designBoctorNotch(stage.wn, stage.q, stage.wz, { ...o, lowSide: how.boctorLowSide });
		return designTowThomasNotch(stage.wn, stage.q, stage.wz, { ...o, ...how.towThomas });
	};
	const built = build(opts);
	if (built) return built;
	const fallback = build({ resistorSeries: 'E24', capacitors: null });
	return fallback && { ...fallback, stockShortfall: true };
}

/** Every stage of a transformed design, realized; null where a stage cannot be built. */
export const realizeTransformed = (design, menus, opts = {}) => design.stages.map((stage) => realizeBandStage(stage, menus, opts));

/**
 * A design's target stage as a stage bode.js reads (magnitudePhaseAt), so
 * that the design itself can be measured before any rounding: a band-pass
 * at its centre gain, a notch held where its design holds it.
 */
export function targetStage(stage) {
	if (stage.order === 1) return { order: 1, topology: stage.filterType === 'highpass' ? 'xHp' : 'x', actual: { tau: stage.tau } };
	if (stage.filterType === 'bandpass') return { order: 2, topology: 'xBp', actual: { wn: stage.wn, q: stage.q, gain: stage.gain } };
	if (Number.isFinite(stage.wz)) {
		// bode.js takes a notch's gain far above its zero
		const lowHeld = stage.gainAt === 'dc' || (stage.gainAt === undefined && stage.filterType === 'lowpass');
		const gain = stage.gainAt === 'f0' ? stage.hfGain : lowHeld ? (stage.wn / stage.wz) ** 2 : 1;
		return { order: 2, topology: 'x', actual: { wn: stage.wn, q: stage.q, wz: stage.wz, gain } };
	}
	return { order: 2, topology: stage.filterType === 'highpass' ? 'xHp' : 'x', actual: { wn: stage.wn, q: stage.q } };
}

/**
 * What generateNetlist / generateSchematic (spice.js) and the page take for
 * a transformed design on top of the spec: the method, so a band-stop is
 * one chain with no combiner, the centre and width, the Amin of each edge.
 */
export const transformedNetlistOpts = (design) => ({ method: 'transformed', structure: 'cascade', lpCount: 0, f0: design.f0, B: design.B, response: design.response, amaxDb: design.amaxDb, aminDbLow: design.aminDbLow, aminDbHigh: design.aminDbHigh });
