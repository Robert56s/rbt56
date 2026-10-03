/**
 * Circuits for Falstad's CircuitJS simulator (https://www.falstad.com/circuit/),
 * written in its plain-text circuit format and handed to it in the `cct`
 * query parameter, so every simulation on a guide page is defined here, in
 * the source, and nothing is stored on Falstad's side.
 *
 * The builder knows where each element puts its terminals ("posts"), as
 * measured in the running simulator: a two-terminal part has them at its
 * two ends; a transistor drawn left to right has its base (or gate) at the
 * left end and the other two 16 units above and below the right end. A
 * circuit is described by where its parts go and the wires between their
 * terminals, and `danglingPosts` proves that every terminal lands on
 * another one (scripts/check-guides.mjs runs it on every circuit).
 *
 * Coordinates are CircuitJS grid units (posts on a 16-unit grid); the
 * simulator scales the drawing to its window when it loads.
 */

const BASE = 'https://www.falstad.com/circuit/circuitjs.html';

/**
 * The options of a simulator framed in a page: no menu bar, white like the
 * site, and read-only. Read-only keeps every switch and slider working but
 * stops the mouse wheel from editing parts: over a transistor the wheel
 * would otherwise turn an NPN into a PNP.
 */
const EMBED_OPTIONS = { hideMenu: 'true', whiteBackground: 'true', editable: 'false' };

/**
 * The address that opens a circuit in the simulator. `embed` adds the
 * options for a frame inside the page; without it the link opens the full
 * editor, menus included.
 *
 * CircuitJS reads the query with decodeURI, not decodeURIComponent: an
 * escaped / , : ; stays escaped, and a raw & = # + would cut or split the
 * text. So the text is escaped with encodeURI, which leaves those alone,
 * and must not contain & = # + at all.
 */
export function falstadUrl(text, { embed = true } = {}) {
	const bad = /[&=#+]/.exec(text);
	if (bad) throw new Error(`a Falstad circuit text cannot hold "${bad[0]}"`);
	const params = embed ? Object.entries(EMBED_OPTIONS).map(([k, v]) => `${k}=${v}`) : [];
	return `${BASE}?${[...params, `cct=${encodeURI(text)}`].join('&')}`;
}

// waveform codes of a rail or a source in the text format
const WAVE = { dc: 0, ac: 1, square: 2, triangle: 3, sawtooth: 4, pulse: 5 };

/** A number as the text format writes it: short, no exponent noise. */
function num(v) {
	if (Number.isInteger(v)) return String(v);
	return String(Number(v.toPrecision(6)));
}

const pt = (x, y) => ({ x, y });

/**
 * A text field the way CircuitJS escapes it (CustomLogicModel.escape): a
 * space would end the field, so it becomes \s, and a backslash doubles.
 */
function escapeText(s) {
	return String(s).replace(/\\/g, '\\\\').replace(/ /g, '\\s');
}

/**
 * A new circuit. Options set the simulator's header:
 *   timeStep    simulation time step, s
 *   speed       the "simulation speed" slider position (bigger is faster)
 *   current     the speed of the moving current dots
 *   voltRange   the voltage that reaches full colour on the wires
 *   powerRange  the power that reaches full brightness
 *   dots        draw moving current dots
 */
export function circuit({ timeStep = 5e-6, speed = 10, current = 50, voltRange = 5, powerRange = 50, dots = true } = {}) {
	const elements = [];
	const scopes = [];
	const adjusts = [];

	function add(line, posts, extra = {}) {
		elements.push({ line, posts, ...extra });
		return elements.length - 1;
	}
	const seg = (code, a, b, rest = '') => `${code} ${a.x} ${a.y} ${b.x} ${b.y}${rest}`;

	// a three-terminal part drawn horizontally: the control terminal at
	// `at`, the body 48 units to the right (or left), the other two
	// terminals 16 above and below the far end
	function threeTerminal(at, dir) {
		const end = pt(at.x + (dir === 'left' ? -48 : 48), at.y);
		return { end, upper: pt(end.x, end.y - 16), lower: pt(end.x, end.y + 16) };
	}

	// names given to elements, for the checks that read them back from the
	// running simulator (its getElements() list follows the same order)
	const tags = {};

	const api = {
		elements,
		tags,

		/** Names the element added last, e.g. 'Q1'. */
		tag(name) {
			tags[name] = elements.length - 1;
		},

		/** Wires through a list of points; each run must be horizontal or vertical. */
		wire(...points) {
			for (let i = 1; i < points.length; i++) {
				const a = points[i - 1];
				const b = points[i];
				if (a.x !== b.x && a.y !== b.y) throw new Error(`diagonal wire ${a.x},${a.y} to ${b.x},${b.y}`);
				if (a.x === b.x && a.y === b.y) continue;
				add(seg('w', a, b, ' 0'), [a, b], { wire: true });
			}
			return points[points.length - 1];
		},

		resistor(a, b, ohms) {
			add(seg('r', a, b, ` 0 ${num(ohms)}`), [a, b]);
			return b;
		},

		/**
		 * A capacitor; `v0` is V(a) - V(b) at the start (and after Reset),
		 * so a coupling capacitor can start already charged to its bias and
		 * the circuit opens in its steady state instead of a long transient.
		 */
		capacitor(a, b, farads, v0 = 0) {
			// CircuitJS itself starts a capacitor at 1 mV rather than exactly 0
			add(seg('c', a, b, ` 0 ${num(farads)} ${num(v0)} ${num(v0 || 0.001)}`), [a, b]);
			return b;
		},

		inductor(a, b, henries) {
			add(seg('l', a, b, ` 0 ${num(henries)} 0`), [a, b]);
			return b;
		},

		/** A diode, anode at `a`, cathode at `b`; `model` is a CircuitJS diode model name. */
		diode(a, b, model = '1N4148') {
			add(seg('d', a, b, ` 2 ${model}`), [a, b]);
			return b;
		},

		/** A zener diode, anode at `a`, cathode at `b`, breaking down at `volts` in reverse. */
		zener(a, b, volts) {
			add(seg('z', a, b, ` 1 0.805904783 ${num(volts)}`), [a, b]);
			return b;
		},

		/** An LED, anode at `a`, cathode at `b`. */
		led(a, b) {
			add(seg('162', a, b, ' 2 default-led 1 0 0 0.01'), [a, b]);
			return b;
		},

		/** A toggle switch; `open` starts it open. Clicking it in the simulator flips it. */
		switch(a, b, { open = true } = {}) {
			add(seg('s', a, b, ` 0 ${open ? 1 : 0} false`), [a, b]);
			return b;
		},

		/** A push button, closed only while held down. */
		pushButton(a, b) {
			add(seg('s', a, b, ' 0 1 true'), [a, b]);
			return b;
		},

		/**
		 * A potentiometer from `a` to `b` (horizontal, at least 64 long),
		 * with its wiper 16 units above the middle. Its value gets a slider.
		 */
		pot(a, b, ohms, { position = 0.5, label = 'Resistance' } = {}) {
			if (a.y !== b.y || b.x - a.x < 64) throw new Error('a potentiometer runs left to right, 64 units or more');
			const wiper = pt((a.x + b.x) / 2, a.y - 16);
			add(seg('174', a, b, ` 1 ${num(ohms)} ${num(position)} ${label}`), [a, b, wiper]);
			return { a, b, wiper };
		},

		/** A DC voltage source between two posts: `minus` at a, `plus` at b. */
		battery(minus, plus, volts) {
			add(seg('v', minus, plus, ` 0 0 40 ${num(volts)} 0 0 0.5`), [minus, plus]);
			return plus;
		},

		/**
		 * A one-terminal supply at `at`, drawn toward `dir`: DC, or a wave
		 * ({ wave: 'ac' | 'square' | ..., amp, freq, bias }).
		 */
		rail(at, volts, { dir = 'up', wave = 'dc', amp = volts, freq = 40, bias = 0, duty = 0.5 } = {}) {
			const end = offset(at, dir, 32);
			const w = WAVE[wave];
			const max = wave === 'dc' ? volts : amp;
			add(seg('R', at, end, ` 0 ${w} ${num(freq)} ${num(max)} ${num(wave === 'dc' ? 0 : bias)} 0 ${num(duty)}`), [at]);
			return at;
		},

		/** A supply whose voltage is a slider in the simulator's side panel. */
		slider(at, { min = 0, max = 5, value = (min + max) / 2, label = 'Voltage', dir = 'left' } = {}) {
			const end = offset(at, dir, 32);
			add(seg('172', at, end, ` 0 6 ${num(value)} ${num(max)} ${num(min)} 0 0.5 ${label}`), [at]);
			return at;
		},

		ground(at) {
			add(seg('g', at, pt(at.x, at.y + 16), ' 0'), [at]);
			return at;
		},

		/** A labelled output terminal: the simulator shows its voltage. */
		output(at, dir = 'right') {
			add(seg('O', at, offset(at, dir, 32), ' 0'), [at]);
			return at;
		},

		/** A text label whose top-left corner is near `at` (flags 0: the text is the rest of the line). */
		text(at, words, size = 16) {
			add(`x ${at.x} ${at.y} ${at.x + 40} ${at.y + 4} 0 ${size} ${words}`, [], { label: true });
		},

		npn(at, { dir = 'right', beta = 100 } = {}) {
			const { end, upper, lower } = threeTerminal(at, dir);
			const index = add(seg('t', at, end, ` 0 1 0 0 ${num(beta)} default`), [at, upper, lower]);
			return { b: at, c: upper, e: lower, index };
		},

		pnp(at, { dir = 'right', beta = 100 } = {}) {
			const { end, upper, lower } = threeTerminal(at, dir);
			const index = add(seg('t', at, end, ` 0 -1 0 0 ${num(beta)} default`), [at, upper, lower]);
			return { b: at, e: upper, c: lower, index };
		},

		/**
		 * An N-channel MOSFET, drain on top. `vt` is the threshold (negative
		 * for a depletion part) and `beta` the square-law constant, so that
		 * I_D = (beta / 2) (V_GS - V_t)^2 in saturation; `bodyDiode` draws
		 * and simulates the diode of a power MOSFET.
		 */
		nmos(at, { dir = 'right', vt = 1.5, beta = 0.02, bodyDiode = false } = {}) {
			const { end, upper, lower } = threeTerminal(at, dir);
			const index = add(seg('f', at, end, ` ${bodyDiode ? 32 : 0} ${num(vt)} ${num(beta)}`), [at, upper, lower]);
			return { g: at, d: upper, s: lower, index };
		},

		/**
		 * A P-channel MOSFET, source on top (the way a high-side switch is
		 * drawn, and CircuitJS's own orientation for a P part). `vt` is
		 * given as CircuitJS takes it, a positive magnitude.
		 */
		pmos(at, { dir = 'right', vt = 1.5, beta = 0.02, bodyDiode = false } = {}) {
			const { end, upper, lower } = threeTerminal(at, dir);
			const index = add(seg('f', at, end, ` ${1 + (bodyDiode ? 32 : 0)} ${num(vt)} ${num(beta)}`), [at, upper, lower]);
			return { g: at, s: upper, d: lower, index };
		},

		/**
		 * An N-channel JFET, drain on top; `vt` is the pinch-off voltage V_P
		 * (negative) and I_DSS = beta V_P^2 / 2, so beta = 2 I_DSS / V_P^2.
		 */
		njfet(at, { dir = 'right', vt = -4, beta = 0.00125 } = {}) {
			const { end, upper, lower } = threeTerminal(at, dir);
			const index = add(seg('j', at, end, ` 0 ${num(vt)} ${num(beta)}`), [at, upper, lower]);
			return { g: at, d: upper, s: lower, index };
		},

		/**
		 * A P-channel JFET, source on top. CircuitJS takes `vt` as for the N
		 * part (negative) and mirrors it: vt = -2 pinches off at V_GS = +2 V.
		 */
		pjfet(at, { dir = 'right', vt = -4, beta = 0.00125 } = {}) {
			const { end, upper, lower } = threeTerminal(at, dir);
			const index = add(seg('j', at, end, ` 1 ${num(vt)} ${num(beta)}`), [at, upper, lower]);
			return { g: at, s: upper, d: lower, index };
		},

		/** A unijunction transistor: emitter at `at`, base 2 at the far end, base 1 32 below it. */
		ujt(at) {
			const b2 = pt(at.x + 80, at.y);
			const b1 = pt(b2.x, b2.y + 32);
			const index = add(seg('417', at, b2, ' 1'), [at, b2, b1]);
			return { e: at, b2, b1, index };
		},

		/**
		 * A diagonal wire, for the one drawing that wants it: the crossed
		 * coupling of a multivibrator. Every other wire is horizontal or vertical.
		 */
		diagonal(a, b) {
			add(seg('w', a, b, ' 0'), [a, b], { wire: true });
			return b;
		},

		/** An ammeter from `a` to `b` (current flowing a to b reads positive), showing its reading. */
		ammeter(a, b) {
			add(seg('370', a, b, ' 1 0'), [a, b]);
			return b;
		},

		/**
		 * A slider in the side panel that edits a value of an element already
		 * placed: `item` is the element's edit-item number (0 is a
		 * resistor's resistance or a transistor's beta).
		 */
		adjust(index, { item = 0, min, max, label, log = false }) {
			adjusts.push(`38 ${index} F${log ? 2 : 0} ${item} ${num(min)} ${num(max)} ${escapeText(label)}`);
		},

		/** A raw element line, with the posts it puts down. */
		raw(line, posts = []) {
			return add(line, posts);
		},

		/** A scope under the drawing, as a raw "o" line of the text format. */
		scope(line) {
			scopes.push(line);
		},

		toText() {
			const header = `$ ${dots ? 1 : 0} ${num(timeStep)} ${num(speed)} ${num(current)} ${num(voltRange)} ${num(powerRange)} 5e-11`;
			// a slider line refers to its element by index, so it comes after them
			return [header, ...elements.map((e) => e.line), ...adjusts, ...scopes].join('\n') + '\n';
		}
	};
	return api;
}

function offset(p, dir, d) {
	if (dir === 'up') return pt(p.x, p.y - d);
	if (dir === 'down') return pt(p.x, p.y + d);
	if (dir === 'left') return pt(p.x - d, p.y);
	return pt(p.x + d, p.y);
}

/**
 * Every terminal of a circuit that touches nothing: CircuitJS joins posts
 * only where they share the exact same point, so a post alone at its point
 * is a part left hanging. Returns [{ x, y, line }].
 */
export function danglingPosts(elements) {
	const count = new Map();
	const key = (p) => `${p.x},${p.y}`;
	for (const e of elements) for (const p of e.posts) count.set(key(p), (count.get(key(p)) ?? 0) + 1);
	const out = [];
	for (const e of elements) for (const p of e.posts) if (count.get(key(p)) === 1) out.push({ ...p, line: e.line });
	return out;
}
