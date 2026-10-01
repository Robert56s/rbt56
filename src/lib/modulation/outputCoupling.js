import { capacitorNotBelow } from './eseries';

/**
 * The demodulator's output into its load (earphones, an amplifier's
 * input) through a series capacitor. The filter hands the message back on
 * a DC level, the rectifier's average of the carrier ((2/pi) A_c with the
 * precision rectifier, less with the bare diode, negative after an odd
 * count of MFB stages). A load would take that level as a steady current:
 * earphones would pass it through their coil, pushing the membrane off
 * centre, and the op-amp would have to supply it. The capacitor blocks it
 * and passes the message: with the load R_L it is a first-order high-pass,
 *
 *   H(s) = s R_L C / (1 + s R_L C),   f_c = 1 / (2 pi R_L C)
 *
 * It is sized on the passband spec, like the low-pass: at most Amax lost
 * at the lowest message frequency,
 *
 *   f_c <= fmMin sqrt(10^(Amax/10) - 1),   C >= 1 / (2 pi R_L f_c)
 *
 * then rounded up, to the list on hand or else to E6, the steps
 * electrolytics come in: a larger C only makes the low end flatter.
 *
 * At that size it is an electrolytic, so its + plate goes to whichever
 * side sits higher in DC: the filter's output when the level is positive,
 * the load (held at 0 V through R_L) when it is negative. What the load
 * then draws is the tone over R_L, and past about 10 mA a TL08x no longer
 * drives it cleanly (the same limit the JFET cell is held to).
 *
 * A load of 600 ohm or less is taken for earphones or headphones, which
 * someone listens to: the power the tone puts in them, V^2 / (2 R_L), is
 * worth a warning past 1 mW, where most of them already play loud (around
 * 100 dB of sound). Above 600 ohm the load is an input, and its power
 * means nothing.
 *
 *   rLoad, fmMin   the load in ohms and the lowest message frequency
 *   fm, amaxDb     the highest message frequency and the passband spec
 *   level, tone    the filter output's signed DC level and the tone's
 *                  amplitude at fm, for the carrier `amplitude` at the
 *                  demodulator's input
 *   capacitors     the list on hand, or null for the usual values
 */
export const LOAD_CURRENT_LIMIT = 0.01; // A
export const LOAD_POWER_LIMIT = 1e-3; // W, where most earphones already play loud
export const HEADPHONE_MAX_OHMS = 600; // earphones and headphones run from 16 to 600 ohm

export function designOutputCoupling({ rLoad, fmMin, fm, amaxDb, level, tone, amplitude = 1, capacitors = null }) {
	const fcMax = fmMin * Math.sqrt(10 ** (amaxDb / 10) - 1);
	const cTarget = 1 / (2 * Math.PI * rLoad * fcMax);
	const own = capacitorNotBelow(cTarget, capacitors);
	const c = own ?? capacitorNotBelow(cTarget);
	const fc = 1 / (2 * Math.PI * rLoad * c);
	const gainAt = (f) => 1 / Math.sqrt(1 + (fc / f) ** 2);
	const toneAtLoad = tone * gainAt(fm);
	const peakCurrent = toneAtLoad / rLoad;
	const power = toneAtLoad ** 2 / (2 * rLoad);
	const listened = rLoad <= HEADPHONE_MAX_OHMS;
	return {
		rLoad,
		fmMin,
		fm,
		amaxDb,
		fcMax,
		cTarget,
		c,
		fc,
		// a list was given and nothing on it reaches the value: the E6 value instead
		stockShortfall: Array.isArray(capacitors) && own === null,
		lossAtFmMin: -20 * Math.log10(gainAt(fmMin)),
		gainAtFm: gainAt(fm),
		level,
		tone,
		amplitude,
		toneAtLoad,
		plusToward: level < 0 ? 'load' : 'filter',
		dcCurrentBlocked: Math.abs(level) / rLoad,
		peakCurrent,
		currentOk: peakCurrent <= LOAD_CURRENT_LIMIT,
		power,
		listened,
		powerOk: !listened || power <= LOAD_POWER_LIMIT,
		timeConstant: rLoad * c
	};
}

/** |H(j 2 pi f)| of the coupling high-pass. */
export function couplingGainAt(coupling, f) {
	return 1 / Math.sqrt(1 + (coupling.fc / f) ** 2);
}
