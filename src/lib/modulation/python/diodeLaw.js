import { comment, pyEng, pyNum } from '../../filter/python/emit';
import { DIODE_MODELS, DIODE_VT } from '../diodeLaw';

/**
 * The diode law the diode modulator and the half-wave rectifier run their
 * numbers through (diodeLaw.js): the SPICE model of the diode in SETTINGS,
 * and diode_current(), the current through the diode and a resistance in
 * series, solved by Newton's method as the page solves it.
 */

/** The model of a diode by its id, the 1N4148 for an unknown one (as the page takes it). */
export const diodeModel = (id) => DIODE_MODELS[id] ?? DIODE_MODELS['1N4148'];

/** SETTINGS' lines of the diode's model; `cjo` adds its junction capacitance (the diode modulator's check). */
export function diodeSettings(id, { cjo = false, role = 'The diode' } = {}) {
	const d = diodeModel(id);
	return [
		comment(`${role}, its SPICE model as the page and the LTspice files take it: the ${d.label}.`),
		`diode_is = ${pyEng(d.Is)}  # A, the saturation current`,
		`diode_n = ${pyNum(d.N)}  # the emission coefficient`,
		`diode_rs = ${pyNum(d.Rs)}  # ohm, its own series resistance`,
		...(cjo ? [`diode_cjo = ${pyEng(d.cjo)}  # F, its junction capacitance, which the cycle solve leaves out`] : [])
	].join('\n');
}

/** VT and diode_current(), written once. */
export function diodeCurrentHelper(file) {
	file.once(
		'diode_current',
		[
			`VT = ${pyNum(DIODE_VT)}  # V, kT/q at 27 C, as SPICE takes it`,
			'',
			'',
			'def diode_current(v, r):',
			'    """The current through the diode and r in series when v is across both: Newton\'s method on',
			'    (r + Rs) i + N VT ln(1 + i / Is) = v, in w = ln(1 + i / Is), which rises steadily."""',
			'    nvt = diode_n * VT',
			'    r_total = r + diode_rs',
			'    w = min(v / nvt, math.log1p(v / (r_total * diode_is))) if v > 0 else v / nvt',
			'    for _ in range(60):',
			'        e = math.exp(w)',
			'        step = (r_total * diode_is * (e - 1) + nvt * w - v) / (r_total * diode_is * e + nvt)',
			'        w -= step',
			'        if abs(step) < 1e-12:',
			'            break',
			'    return diode_is * math.expm1(w)'
		].join('\n')
	);
}
