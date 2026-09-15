// Renders every circuit schematic into a single self-contained HTML gallery,
// so the diagrams can be eyeballed without the dev server.
//
//   node --import ./scripts/resolve-ext.mjs scripts/render-gallery.mjs <out.html>
import { writeFileSync } from 'node:fs';
import * as filter from '../src/lib/filter/circuits.js';
import * as modulation from '../src/lib/modulation/circuits.js';
import { designTowThomasHighPass, designTowThomasLowPass } from '../src/lib/filter/towThomas.js';
import { buildTwoLevelDiagram } from '../src/lib/karnaugh/circuit.js';
import { literals } from '../src/lib/karnaugh/expression.js';
import { minimizeBoth } from '../src/lib/karnaugh/minimize.js';

function karnaugh(n, ones, dcs, form) {
	const names = ['A', 'B', 'C', 'D'].slice(0, n);
	const { sop, pos } = minimizeBoth(n, ones, dcs);
	const res = form === 'sop' ? sop : pos;
	const constant = form === 'sop' ? sop.constant : pos.constant === null ? null : 1 - pos.constant;
	const terms = constant !== null ? [] : res.cover.map((imp) => literals(imp, n, names, { complement: form === 'pos' }));
	return buildTwoLevelDiagram({ names, terms, form, constant });
}

const CASES = [
	["Karnaugh: B'D' + BD (SOP)", karnaugh(4, [0, 2, 5, 7, 8, 10, 13, 15], [], 'sop')],
	['Karnaugh: same function, POS', karnaugh(4, [0, 2, 5, 7, 8, 10, 13, 15], [], 'pos')],
	['Karnaugh: 7-segment a (SOP)', karnaugh(4, [0, 2, 3, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15], 'sop')],
	['Karnaugh: 8 terms', karnaugh(4, [0, 3, 5, 6, 9, 10, 12, 15], [], 'sop')],
	['MFB low-pass', filter.buildMfbDiagram({ R1: 11000, R2: 5600, R3: 11000, C1: 1e-8, C2: 1e-9 })],
	['Sallen-Key low-pass', filter.buildSallenKeyDiagram({ R1: 11000, R2: 11000, Ctop: 2.2e-8, Cbottom: 1e-8 })],
	['MFB high-pass', filter.buildMfbHpDiagram({ C1: 1e-9, C2: 1e-9, C3: 1e-9, R1: 75000, R2: 336000 })],
	['Sallen-Key high-pass', filter.buildSallenKeyHpDiagram({ C1: 1e-8, C2: 1e-8, Rtop: 22000, Rbottom: 11000 })],
	['First-order high-pass', filter.buildFirstOrderHpDiagram({ R: 16000, C: 1e-8 }, 1.6e-4)],
	['First-order low-pass', filter.buildFirstOrderDiagram({ R: 16000, C: 1e-8 }, 1.6e-4)],
	['Summing amplifier (band-stop)', filter.buildSummingAmpDiagram(10000)],
	['Difference amplifier (band-stop, opposite tails)', filter.buildDifferenceAmpDiagram(10000)],
	['Tow-Thomas biquad, low-pass', filter.buildTowThomasDiagram(designTowThomasLowPass(2 * Math.PI * 10000, 0.7071).components)],
	['Tow-Thomas biquad, high-pass (input capacitor)', filter.buildTowThomasHpDiagram(designTowThomasHighPass(2 * Math.PI * 10000, 1.3066).components)],
	['JFET gain cell', modulation.buildJfetGainCellDiagram({ rb: 13600 })],
	['Gain stage', modulation.buildGainStageDiagram({ rtop: 8200, rbottom: 10000 })],
	['High-pass (DC blocker)', modulation.buildHighPassDiagram({ r: 100000, c: 2.2e-7 })],
	['Summer (2 inputs)', modulation.buildSummerDiagram({ inputs: ['x_m(t) (AC)', 'V_bias (DC)'], r: 10000 })],
	['Summer (3 inputs)', modulation.buildSummerDiagram({ inputs: ['x_p(t)', 'x_m(t)', 'V_DC (bias)'], r: 10000 })],
	['Bias divider', modulation.buildDividerDiagram({ top: 51000, bottom: 10000, vcc: 12 })],
	['Diode + resonant tank', modulation.buildDiodeTankDiagram({ l: 1e-3, c: 1.5e-8, r: 4300 })],
	['Precision full-wave rectifier', modulation.buildPrecisionRectifierDiagram({ r1: 10000, r2: 10000, r3: 10000 })],
	['Envelope low-pass (Sallen-Key)', modulation.buildEnvelopeLowPassDiagram({ R1: 11000, R2: 11000, Ctop: 2.2e-8, Cbottom: 1e-8 })]
];

const cards = CASES.map(([name, d]) =>
	`<figure><figcaption>${name}</figcaption><svg viewBox="${d.viewBox}" xmlns="http://www.w3.org/2000/svg">${d.svg}</svg></figure>`
).join('\n');

const html = `<!doctype html><meta charset="utf-8"><title>rbt56 schematics</title>
<style>
  body { margin: 0; background: #eef1f5; font-family: system-ui, sans-serif; color: #16181d; }
  h1 { padding: 20px 24px 0; font-size: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 18px; padding: 20px 24px 40px; }
  figure { margin: 0; background: #f7f9fb; border: 1px solid #dfe4ea; border-radius: 10px; padding: 12px; }
  figcaption { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #3a4048; }
  svg { width: 100%; height: auto; color: #16181d; display: block; }
  svg text.lbl { font-family: ui-monospace, monospace; font-size: 11px; fill: #2f6fed; }
  svg text.lbl.note { fill: #6b7280; }
</style>
<h1>rbt56 circuit schematics (all 16, harness-verified)</h1>
<div class="grid">${cards}</div>`;

const out = process.argv[2] || 'schematics-gallery.html';
writeFileSync(out, html);
console.log(`wrote ${out} (${CASES.length} diagrams)`);
