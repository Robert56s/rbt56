/**
 * Core AM relationships, re-derived and cross-checked directly:
 *
 *   y(t) = Ap*[1 + n*cos(wm t)]*cos(wp t)
 *
 * Modulation index from the envelope extremes:
 *   n = (Vmax - Vmin) / (Vmax + Vmin)
 *
 * Effective power carried by the modulating tone, relative to total
 * transmitted power (carrier + sidebands):
 *   Pp = Ap^2 / 2                    (carrier power, sinusoid of amplitude Ap)
 *   Pm = n^2 * Ap^2 / 4               (both sidebands combined)
 *   eta = Pm / (Pp + Pm) = n^2 / (2 + n^2)
 * n = 1 (ideal) gives eta = 1/3 = 33%; n = 0.33 gives eta ~= 5.16%.
 */
export function modulationIndexFromEnvelope(vMax, vMin) {
	return (vMax - vMin) / (vMax + vMin);
}

export function powerEfficiency(n) {
	return (n * n) / (2 + n * n);
}

export function modulationQuality(n) {
	if (!(n >= 0)) return 'invalid';
	if (n > 1) return 'over';
	if (n < 0.7) return 'under';
	return 'ideal';
}

/** Sideband frequencies fp-fm and fp+fm for a (possibly non-sinusoidal) modulating band [fmMin, fmMax]. */
export function sidebandEdges(fp, fmMin, fmMax) {
	return { lowerOuter: fp - fmMax, lowerInner: fp - fmMin, upperInner: fp + fmMin, upperOuter: fp + fmMax };
}
