// The families check-python.mjs runs, one module each: a family fills its
// own module, never this list. Each module's default export:
//   name     what it covers, as the summary names it
//   key      its name for CHECK_PYTHON_SWEEP (band, narrow, notch...)
//   strict   true when the file's H(s) are the page's figures to rounding:
//            the checks against the measures then hold to 1e-6 dB, not the
//            spec's 0.01 (a narrow band-pass has its own tolerances)
//   circuits per Python circuit { choices, figures, stage } (rule.mjs,
//            mfb.mjs): the rule in JavaScript and the library's stage;
//            capacitors(st, capacitors, typed) where the rule may draw on
//            others than the stock's (notch.mjs: the E6 series)
//   cases    [label, args, opts], the designs every run checks: args as the
//            page's download passes them (downloadScript, or
//            downloadNarrowScript for filterType 'narrowband'; designIndex
//            'last' for the last of the "Next design" list), opts:
//              guards  [[setting, Python value, the stop's message (RegExp),
//                      or null for a file that still runs, more]], more
//                      optional: { says: RegExp the edited file's printout
//                      matches, samePage: true where the edit leaves the
//                      template as it was, so the page's parts check the same }
//              plot    run it with matplotlib too
//              lines   [min, max], the file's length (the default low-pass)
//              e6      the stages (from 1) whose rule takes the E6 series, no
//                      pair of the stock building them (check-python.mjs finds
//                      them from the circuits' capacitors on every design, the
//                      file saying so for each; e6 must agree)
//              unbuilt the page leaves a stage of it unbuilt
//              expect  [label, (results, stdout) => problems]: what more the
//                      file must show for this design
//   sweep    optional, more designs: CHECK_PYTHON_SWEEP=<key>[,<key>] (or
//            all) runs them too

import band from './band.mjs';
import mfb from './mfb.mjs';
import narrow from './narrow.mjs';
import notch from './notch.mjs';
import pageCases from './pageCases.mjs';
import sallenKeyTowThomas from './sallenKeyTowThomas.mjs';

export const FAMILIES = [mfb, sallenKeyTowThomas, notch, band, narrow, pageCases];
