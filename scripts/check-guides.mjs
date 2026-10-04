// Checks of the transistor guide (src/lib/transistors/):
//   node --import ./scripts/resolve-ext.mjs scripts/check-guides.mjs [slug...]
//
// - every circuit: each terminal lands on another one (no part hanging),
//   no character the simulator's URL cannot carry, a tag for every check
// - every type page: the fields the page needs, its simulations, widgets,
//   parts and related pages exist, three quiz questions
// - all text: every $...$ and every { eq } renders in KaTeX strict mode,
//   no em or en dash, never "you" or "we", no unbalanced $
// - every part: a manufacturer link, a pinout with as many legs as names
// Exits non-zero on any failure. The simulations themselves are checked
// inside Falstad's simulator: scripts/falstad-suite.mjs and falstad-runner.js.
import { existsSync } from 'node:fs';
import katex from 'katex';
import { CIRCUITS } from '../src/lib/transistors/circuits.js';
import { danglingPosts, falstadUrl } from '../src/lib/guides/falstad.js';
import { PARTS } from '../src/lib/transistors/parts.js';
import { FAMILIES, TYPES } from '../src/lib/transistors/types/index.js';
import { HUB } from '../src/lib/transistors/hub.js';

const WIDGETS = ['bjtCurves', 'fetCurves', 'fetTransfer', 'lossCompare', 'ujtWave'];
const BLOCK_KEYS = ['h', 'p', 'eq', 'list', 'steps', 'terms', 'table', 'note', 'widget', 'sim', 'more'];
const only = process.argv.slice(2);

let fails = 0;
let formulas = 0;
const fail = (where, what) => {
	fails++;
	console.log(`FAIL ${where}: ${what}`);
};

function tex(where, s, display = false) {
	formulas++;
	try {
		katex.renderToString(s, { displayMode: display, throwOnError: true, strict: 'error' });
	} catch (e) {
		fail(where, `KaTeX: ${s} (${e.message.split('\n')[0].slice(0, 90)})`);
	}
}

/** Checks one piece of prose: its inline formulas and its words. */
function text(where, s) {
	if (typeof s !== 'string') {
		fail(where, `not text: ${JSON.stringify(s)?.slice(0, 60)}`);
		return;
	}
	if (/[–—]/.test(s)) fail(where, `em or en dash in "${s.slice(0, 70)}"`);
	if (/\b(you|your|yours|yourself|we|let's|our)\b/i.test(s.replace(/\$[^$]*\$/g, ''))) fail(where, `addresses the reader: "${s.slice(0, 70)}"`);
	if (s.includes('${')) fail(where, 'a template placeholder left in the text');
	const dollars = s.split('$').length - 1;
	if (dollars % 2) fail(where, `unbalanced $ in "${s.slice(0, 70)}"`);
	const re = /\$([^$]*)\$/g;
	let m;
	while ((m = re.exec(s))) tex(where, m[1]);
}

function blocks(where, list) {
	if (!Array.isArray(list)) return fail(where, 'not a list of blocks');
	list.forEach((b, i) => {
		const at = `${where}[${i}]`;
		const keys = Object.keys(b).filter((k) => BLOCK_KEYS.includes(k));
		if (keys.length !== 1) return fail(at, `a block needs exactly one of ${BLOCK_KEYS.join(', ')}: ${Object.keys(b).join(', ')}`);
		if (b.h !== undefined) text(at, b.h);
		if (b.p !== undefined) text(at, b.p);
		if (b.eq !== undefined) {
			tex(at, b.eq, true);
			if (/[–—]/.test(b.eq)) fail(at, 'dash in a formula');
			if (b.intro) text(at, b.intro);
		}
		if (b.list) b.list.forEach((x, k) => text(`${at}.list[${k}]`, x));
		if (b.steps) b.steps.forEach((x, k) => text(`${at}.steps[${k}]`, x));
		if (b.terms) b.terms.forEach(([w, d], k) => (text(`${at}.terms[${k}]`, w), text(`${at}.terms[${k}]`, d)));
		if (b.table) {
			b.table.head.forEach((x) => text(`${at}.head`, x));
			b.table.rows.forEach((row, r) => {
				if (row.length !== b.table.head.length) fail(at, `table row ${r} has ${row.length} cells for ${b.table.head.length} columns`);
				row.forEach((x) => text(`${at}.row${r}`, x));
			});
		}
		if (b.note !== undefined) text(at, b.note);
		if (b.widget !== undefined && !WIDGETS.includes(b.widget)) fail(at, `no widget ${b.widget}`);
		if (b.sim !== undefined && !CIRCUITS[b.sim]) fail(at, `no simulation ${b.sim}`);
		if (b.more) blocks(`${at}.more`, b.more);
	});
}

// ------------------------------------------------------------- circuits
for (const [id, s] of Object.entries(CIRCUITS)) {
	if (only.length) break;
	for (const field of ['title', 'what', 'watch']) text(`circuit ${id}.${field}`, s[field]);
	s.steps.forEach((x, k) => text(`circuit ${id}.steps[${k}]`, x));
	if (!existsSync(new URL(`../static/guides/transistors/${id}.svg`, import.meta.url))) fail(`circuit ${id}`, 'no preview drawing (scripts/falstad-previews.js)');
	const variants = [{}, ...(s.checks ?? []).map((c) => c.set ?? {})];
	for (const set of variants) {
		const c = s.build(set);
		const hang = danglingPosts(c.elements);
		if (hang.length) fail(`circuit ${id} ${JSON.stringify(set)}`, `hanging terminals at ${hang.map((h) => `${h.x},${h.y}`).join(' ')}`);
		try {
			falstadUrl(c.toText());
		} catch (e) {
			fail(`circuit ${id}`, e.message);
		}
		for (const check of s.checks ?? []) for (const ex of check.expect) if (!(ex.tag in c.tags)) fail(`circuit ${id}`, `check names ${ex.tag}, which no element is tagged`);
	}
}

// ---------------------------------------------------------------- types
const slugs = new Set(TYPES.map((t) => t.slug));
const familyIds = new Set(FAMILIES.map((f) => f.id));
for (const t of TYPES) {
	if (only.length && !only.includes(t.slug)) continue;
	const at = `type ${t.slug}`;
	for (const field of ['slug', 'name', 'short', 'control', 'fullyOn', 'oneLiner']) {
		if (!t[field]) fail(at, `missing ${field}`);
		else text(`${at}.${field}`, t[field]);
	}
	if (!familyIds.has(t.family)) fail(at, `family ${t.family}`);
	if (!['on', 'off'].includes(t.normally)) fail(at, `normally ${t.normally}`);
	if (!t.symbol?.name) fail(at, 'no symbol');
	if (!t.terminals?.length) fail(at, 'no terminals');
	if (!t.usedFor?.length) fail(at, 'no usedFor');
	(t.usedFor ?? []).forEach((x) => text(`${at}.usedFor`, x));
	blocks(`${at}.howItWorks`, t.howItWorks);
	if (!t.howItWorks?.length) fail(at, 'no howItWorks');
	if (t.curves) {
		if (!WIDGETS.includes(t.curves.widget)) fail(at, `no widget ${t.curves.widget}`);
		if (t.curves.caption) text(`${at}.curves`, t.curves.caption);
	}
	for (const id of t.sims ?? []) if (!CIRCUITS[id]) fail(at, `no simulation ${id}`);
	(t.rules ?? []).forEach((r, i) => {
		text(`${at}.rules[${i}].title`, r.title);
		blocks(`${at}.rules[${i}]`, r.body);
	});
	if ((t.rules ?? []).length < 3) fail(at, 'fewer than 3 design rules');
	(t.mistakes ?? []).forEach(([a, b], i) => (text(`${at}.mistakes[${i}]`, a), text(`${at}.mistakes[${i}]`, b)));
	if ((t.mistakes ?? []).length < 4) fail(at, 'fewer than 4 traps');
	if (t.variants) blocks(`${at}.variants`, t.variants);
	blocks(`${at}.bench`, t.bench ?? []);
	if (!t.bench?.length) fail(at, 'no bench section');
	if ((t.quiz ?? []).length !== 3) fail(at, `${(t.quiz ?? []).length} quiz questions, wanted 3`);
	(t.quiz ?? []).forEach(([q, a], i) => (text(`${at}.quiz[${i}]`, q), text(`${at}.quiz[${i}]`, a)));
	for (const id of t.parts ?? []) if (!PARTS[id]) fail(at, `no part ${id} in parts.js`);
	for (const s of t.related ?? []) if (!slugs.has(s)) fail(at, `related ${s} is not a type`);
}

// ---------------------------------------------------------------- parts
for (const p of Object.values(PARTS)) {
	if (only.length) break;
	const at = `part ${p.id}`;
	if (!/^https:\/\//.test(p.url ?? '')) fail(at, 'no https link');
	if (!p.pinout?.legs?.length && !p.pinout?.text) fail(at, 'no pinout (legs, or a text for a package without a drawing)');
	if (p.pinout?.legs?.length && !/^(TO-92|TO-220|TO-247|TO-126|TO-225|SOT-23)/.test(p.pinout.package)) fail(at, `no drawing for package ${p.pinout.package}: give pinout.text instead`);
	if (p.pinout?.text) text(`${at}.pinout`, p.pinout.text);
	for (const field of ['part', 'kind', 'maker', 'package']) if (!p[field]) fail(at, `missing ${field}`);
	(p.values ?? []).forEach((row, i) => row.forEach((x) => text(`${at}.values[${i}]`, x ?? '')));
	if (p.read) text(`${at}.read`, p.read);
	if (p.pinout?.note) text(`${at}.pinout`, p.pinout.note);
}

// ------------------------------------------------------------------ hub
if (!only.length && HUB) {
	for (const [key, value] of Object.entries(HUB)) {
		if (Array.isArray(value) && value.every((b) => typeof b === 'object' && !Array.isArray(b) && Object.keys(b).some((k) => BLOCK_KEYS.includes(k)))) blocks(`hub.${key}`, value);
	}
	for (const job of HUB.jobs ?? []) {
		text(`hub.jobs ${job.id}`, job.job);
		text(`hub.jobs ${job.id}`, job.pick);
		text(`hub.jobs ${job.id}`, job.why);
		for (const s of job.types ?? []) if (!slugs.has(s)) fail(`hub.jobs ${job.id}`, `no type ${s}`);
		for (const id of job.parts ?? []) if (!PARTS[id]) fail(`hub.jobs ${job.id}`, `no part ${id}`);
	}
	for (const row of HUB.compare?.rows ?? []) row.forEach((x) => text('hub.compare', x));
	for (const id of HUB.blocksSims ?? []) if (!CIRCUITS[id]) fail('hub', `no simulation ${id}`);
}

console.log(`${Object.keys(CIRCUITS).length} circuits, ${TYPES.length} types, ${Object.keys(PARTS).length} parts, ${formulas} formulas`);
console.log(fails === 0 ? 'guides clean' : `${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
