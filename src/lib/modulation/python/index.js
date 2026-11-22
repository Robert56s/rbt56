import { demodFile } from './demod';
import { diodeFile } from './diode';
import { jfetFile } from './jfet';

/**
 * The AM tool's Python downloads, one readable file per circuit for the
 * design on the page: it works through the design step by step as the
 * circuit's panels and their Show the math do, proposes the parts with its
 * own simple rule and checks them, and checks the parts the page shows the
 * same way, side by side, with a verdict for each.
 *
 *   generateJfetPython(args)    jfet-am-modulator.py      (jfet.js)
 *   generateDiodePython(args)   diode-tank-am-modulator.py (diode.js)
 *   generateDemodPython(args)   am-demodulator.py         (demod.js)
 * Each takes plain data, what the page's download function passes (each
 * module's args comment says it: the inputs as the page has them, the stock,
 * and the page's parts), and returns the file's text.
 *
 * The modules:
 *   shared.js    the docstring, the stock in SETTINGS, eng(), neighbours()
 *                and closer() (the rounding of the files' rules), the
 *                page's parts as data (a pair of resistors as the sum of its
 *                two parts) and the side-by-side table
 *   diodeLaw.js  the diode's SPICE model in SETTINGS and diode_current(),
 *                for the diode modulator and the half-wave rectifier
 *   jfet.js      the JFET modulator: the JFET's line (the datasheet pair,
 *                or the least-squares fit of the readings, done in plain
 *                steps), the window, the gate drive, the gain cell
 *                (non-inverting or inverting), the carrier path, the output
 *                stage, the op-amp's limits at the carrier, the check
 *   diode.js     the diode modulator: the tank's capacitor for the carrier
 *                with the coil given, the band and R_s, R_t, the diode worked
 *                out cycle by cycle, the bias with the least distortion, the
 *                summer's parts, the check
 *   lowpass.js   the demodulator's envelope low-pass: the order, the poles
 *                and the stage targets, the file's rule for each stage
 *                (Sallen-Key or MFB)
 *   demod.js     the demodulator: the template the ripple sets, the
 *                rectifier, the low-pass (lowpass.js), the output coupling,
 *                the check
 *
 * The files' own rule is the filter's (src/lib/filter/python/parts.js)
 * where R and C are free: every capacitor (pair) of the stock tried, the
 * resistors from the formulas, each rounded down or up keeping the
 * combination whose figures land closest, the choice whose rounded parts
 * land closest kept from those within the tool's limits, the resistors
 * nearest 10 kohm breaking a tie to 1e-9. A part that is not a free choice
 * (the coil given, a ceiling such as R_2 or the divider's top, the diode's
 * bias, the JFET's line) is computed or taken the way the page does. The
 * page may build a resistor of two in series; the files' own rules keep to
 * single values.
 *
 * The Python the files hold, as filter-design.py's: Python 3.8 or newer, the
 * standard library only (math, itertools; matplotlib only for the plot, when
 * it imports), ASCII only ("ohm", "uF"), 4-space indents, lines up to 100
 * characters (emit.js PyFile throws past them), English, short plain
 * comments, no second person, no dashes but the hyphen, no word of a class
 * or its teaching. Top-level code that reads step by step and prints as it
 * goes, small functions where a formula is reused, no dead code, nothing
 * generic the design does not use: the generator writes the code of the
 * mode, topology and options the page has. Every result also lives in a
 * plain module-level name, listed in the comment "After a run, these names
 * hold the results: ..." under SETTINGS, which the checks read. The stock's
 * lists are sorted where SETTINGS ends, so an edited list may be in any
 * order. The page's parts are data for the page's own settings: where an
 * edit no longer fits them (the demodulator's order), the file says so and
 * leaves them out, or stops with a message (a number written in, such as
 * the Wien bridge's carrier).
 * Each check missed is followed by what the page says of it.
 *
 * Testing: npm run check:am (scripts/check-am.mjs, through the harness
 * scripts/lib-python.mjs) writes the files of a matrix of the page's
 * designs, runs each with python -W error, parses it for Python 3.8, reads
 * its results through runpy, and compares them with the page's: the design
 * figures, the page's parts and their evaluation, the file's own parts
 * against a JavaScript copy of its rule, and the guards.
 */

export const generateJfetPython = jfetFile;
export const generateDiodePython = diodeFile;
export const generateDemodPython = demodFile;
