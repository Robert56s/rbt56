import { designFirstOrderLowPass, designFirstOrderLowPassFromCap } from './firstOrder';

/**
 * First-order high-pass stage: H(s) = RCs / (RCs + 1) = s / (s + 1/(RC)),
 * used for the leftover real pole of an odd-order filter. Same R and C in
 * series as the low-pass version (tau = RC either way), just with the
 * output taken across R instead of C - so the component search is
 * literally the same math, reused here rather than re-implemented.
 */

export function designFirstOrderHighPass(tau, opts) {
	const r = designFirstOrderLowPass(tau, opts);
	return r && { ...r, topology: 'firstOrderHp' };
}

export function designFirstOrderHighPassFromCap(tau, C, opts) {
	const r = designFirstOrderLowPassFromCap(tau, C, opts);
	return { ...r, topology: 'firstOrderHp' };
}
