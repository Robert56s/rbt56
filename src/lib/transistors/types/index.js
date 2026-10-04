/**
 * Every transistor type of the guide, one module per page, in the order
 * the guide presents them. A type module's default export holds:
 *
 *   slug, name, short      URL part, page title, short name
 *   family                 'bipolar' | 'fet' | 'power' (see FAMILIES)
 *   symbol                 { name, labels, flipY, light } for SymbolView
 *   control                what turns it on, a few words
 *   normally               'on' | 'off': conducting with nothing on the control terminal
 *   fullyOn                what "fully on" looks like across it, a few words
 *   terminals              [[letter, name], ...]
 *   oneLiner               one sentence, the type in a nutshell
 *   usedFor                [phrases]
 *   howItWorks             guide blocks (src/lib/components/guides/GuideBlocks.svelte)
 *   curves                 null, or { widget, props, caption }
 *   sims                   ids from src/lib/transistors/circuits.js
 *   rules                  [{ title, body: blocks }]  design rules, with numbers
 *   mistakes               [[the misconception, what is true], ...]
 *   variants               blocks: related forms worth knowing (optional)
 *   bench                  blocks: meter check and a first breadboard build
 *   quiz                   [[question, answer], ...], three of them
 *   parts                  ids from src/lib/transistors/parts.js
 *   related                slugs of other types
 *
 * Text rules (scripts/check-guides.mjs enforces them): English, short
 * sentences, no em or en dash, never "you", formulas as $...$ inline or
 * { eq } on their own line, valid KaTeX.
 */
import npn from './npn.js';
import pnp from './pnp.js';
import darlington from './darlington.js';
import phototransistor from './phototransistor.js';
import njfet from './n-jfet.js';
import pjfet from './p-jfet.js';
import depletion from './depletion-mosfet.js';
import nmosfet from './n-mosfet.js';
import pmosfet from './p-mosfet.js';
import igbt from './igbt.js';
import wideBandgap from './gan-sic.js';
import ujt from './ujt.js';

export const FAMILIES = [
	{ id: 'bipolar', name: 'Bipolar', blurb: 'A current into the base controls the current from collector to emitter.' },
	{ id: 'fet', name: 'Field-effect', blurb: 'A voltage on the gate controls the current through a channel; the gate draws almost nothing.' },
	{ id: 'power', name: 'Power and special', blurb: 'Hybrids built for high voltage and current, new materials, and an odd one out.' }
];

export const TYPES = [npn, pnp, darlington, phototransistor, njfet, pjfet, depletion, nmosfet, pmosfet, igbt, wideBandgap, ujt];

export function typeBySlug(slug) {
	return TYPES.find((t) => t.slug === slug) ?? null;
}

export function typesIn(familyId) {
	return TYPES.filter((t) => t.family === familyId);
}
