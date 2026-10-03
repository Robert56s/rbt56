/**
 * The simulations of the transistor guide, one builder per circuit, drawn
 * for Falstad's CircuitJS with src/lib/guides/falstad.js.
 *
 * Each entry has:
 *   title, what   the card's heading and its one-sentence description
 *   steps         what to do in the simulator, in order
 *   watch         what to see, and why
 *   build(v)      the circuit; `v` overrides the starting values (slider
 *                 positions, switch states) so the checks can run variants
 *   checks        variants and what the running simulator must report for
 *                 them: [{ set, expect: [{ tag, has } | { tag, field, near, tol }] }]
 *                 `has` is a word of the element's info lines (e.g. its
 *                 region, "saturation"), `field` one of its readings ("Ic").
 *                 scripts/check-guides.mjs proves the wiring; the checks
 *                 themselves run in the simulator (see scripts/falstad-checks.md).
 */
import { circuit } from '../guides/falstad';

const p = (x, y) => ({ x, y });

export const CIRCUITS = {
	'npn-switch': {
		title: 'NPN switch lighting an LED',
		what: 'A 5 V supply, an LED with its 330 Ω resistor in the collector, and a base resistor fed by an adjustable input voltage.',
		steps: [
			'Drag Input voltage in the right-hand panel slowly from 0 to 5 V.',
			'Stop near 0.9 V and hover the transistor: it reads fwd active, and the LED is dim.',
			'Go on to 5 V and hover again: it reads saturation, with V_CE under 0.1 V.'
		],
		watch: 'Below about 0.6 V no current flows. Between 0.6 and about 1.1 V the LED current grows with the base current: the active region. Past that the LED current stops at about (5 - 1.8) / 330 = 10 mA however hard the base is driven, because the resistor sets it, not the transistor: that is saturation, the closed switch.',
		build({ input = 0 } = {}) {
			const c = circuit({ voltRange: 5 });
			c.rail(p(320, 64), 5);
			c.resistor(p(320, 64), p(320, 144), 330);
			c.tag('RC');
			c.led(p(320, 144), p(320, 208));
			c.tag('LED');
			const q = c.npn(p(272, 240));
			c.tag('Q1');
			c.wire(p(320, 208), q.c);
			c.wire(q.e, p(320, 288));
			c.ground(p(320, 288));
			c.slider(p(160, 240), { min: 0, max: 5, value: input, label: 'Input voltage' });
			c.resistor(p(160, 240), q.b, 4700);
			return c;
		},
		checks: [
			{ set: { input: 0 }, expect: [{ tag: 'Q1', has: 'cutoff' }] },
			{ set: { input: 0.9 }, expect: [{ tag: 'Q1', has: 'fwd active' }] },
			{ set: { input: 5 }, expect: [{ tag: 'Q1', has: 'saturation' }, { tag: 'LED', field: 'I', near: 9.6e-3, tol: 0.1 }] }
		]
	},

	'npn-ce-amp': {
		title: 'Common-emitter amplifier',
		what: 'A divider biases the base, R_E sets the collector current, and a 20 mV sine at 1 kHz comes in through a capacitor. The output is taken from the collector through another capacitor.',
		steps: [
			'Compare the two scopes under the drawing: the output is larger and upside down.',
			'Drag Transistor beta from 50 to 400 and hover the transistor: the collector current hardly moves.',
			'Click the switch next to R_E to connect the 100 µF bypass capacitor, and watch the output grow and flatten on one side.'
		],
		watch: 'Without the bypass capacitor the gain is about R_C / R_E = 4.7: the emitter resistor feeds back and fixes it, and it fixes the bias too, which is why beta can change eightfold with no effect. Bypassing R_E removes that feedback for the signal: the gain jumps to about R_C / r_e, near 250, and the output clips against the supply and against the emitter voltage. High gain, but no longer set by resistors.',
		build({ bypass = false } = {}) {
			const c = circuit({ voltRange: 12, timeStep: 2e-6, speed: 20 });
			c.rail(p(208, 48), 12);
			c.wire(p(208, 48), p(384, 48));
			c.resistor(p(208, 48), p(208, 176), 47000);
			c.resistor(p(208, 176), p(208, 336), 10000);
			c.wire(p(208, 336), p(384, 336));
			c.ground(p(208, 336));
			const q = c.npn(p(336, 176), { beta: 150 });
			c.tag('Q1');
			c.wire(p(208, 176), q.b);
			c.resistor(p(384, 48), q.c, 4700);
			c.resistor(q.e, p(384, 336), 1000);
			c.wire(q.e, p(448, 192));
			c.switch(p(448, 192), p(448, 256), { open: !bypass });
			c.capacitor(p(448, 256), p(448, 336), 100e-6, 1.43);
			c.wire(p(448, 336), p(384, 336));
			const input = c.rail(p(112, 176), 0, { dir: 'left', wave: 'ac', amp: 0.02, freq: 1000 });
			c.tag('IN');
			c.capacitor(input, p(208, 176), 1e-6, -2.03);
			c.wire(q.c, p(512, 160));
			c.capacitor(p(512, 160), p(592, 160), 1e-6, 5.35);
			c.resistor(p(592, 160), p(592, 336), 100000);
			c.wire(p(592, 336), p(448, 336));
			c.output(p(592, 160));
			c.tag('OUT');
			c.adjust(c.tags.Q1, { item: 0, min: 50, max: 400, label: 'Transistor beta' });
			c.scope(`o ${c.tags.IN} 4 0 34 0.05 0.0001 0 -1`);
			c.scope(`o ${c.tags.OUT} 4 0 34 0.2 0.0001 1 -1`);
			return c;
		},
		checks: [{ set: {}, expect: [{ tag: 'Q1', has: 'fwd active' }, { tag: 'Q1', field: 'Ic', near: 1.42e-3, tol: 0.08 }, { tag: 'OUT', swing: 0.088, tol: 0.2 }] }]
	},

	'npn-follower': {
		title: 'Emitter follower',
		what: 'The base gets a 2 V sine around 6 V, the collector sits on 12 V, and the output is the emitter, across 1 kΩ. A switch adds a heavy 100 Ω load.',
		steps: [
			'Compare the two scopes: the output has the same shape as the input, about 0.6 V lower.',
			'Click the switch to add the 100 Ω load, and look at the output again.'
		],
		watch: 'The emitter stays one V_BE below the base whatever the load does, so the voltage gain is about 1. What the follower gives is current: the base supplies only I_E / beta, so a weak source can drive a 100 Ω load through it. That is the buffer used after a high-impedance stage.',
		build({ load = false } = {}) {
			const c = circuit({ voltRange: 12, timeStep: 5e-6, speed: 25 });
			c.rail(p(320, 64), 12);
			const q = c.npn(p(272, 176));
			c.tag('Q1');
			c.wire(p(320, 64), q.c);
			c.rail(p(176, 176), 6, { dir: 'left', wave: 'ac', amp: 2, freq: 200, bias: 6 });
			c.tag('IN');
			c.wire(p(176, 176), q.b);
			c.resistor(q.e, p(320, 336), 1000);
			c.ground(p(320, 336));
			c.wire(q.e, p(432, 192));
			c.output(p(432, 192));
			c.tag('OUT');
			c.switch(p(432, 192), p(432, 256), { open: !load });
			c.resistor(p(432, 256), p(432, 336), 100);
			c.wire(p(432, 336), p(320, 336));
			c.scope(`o ${c.tags.IN} 16 0 34 10 0.05 0 -1`);
			c.scope(`o ${c.tags.OUT} 16 0 34 10 0.05 1 -1`);
			return c;
		},
		checks: [
			{ set: {}, expect: [{ tag: 'Q1', has: 'fwd active' }, { tag: 'OUT', mean: 5.45, tol: 0.1 }] },
			{ set: { load: true }, expect: [{ tag: 'Q1', has: 'fwd active' }, { tag: 'OUT', mean: 5.34, tol: 0.1 }] }
		]
	},

	'pnp-switch': {
		title: 'PNP switch on the same supply',
		what: 'The PNP sits between the 5 V supply and the LED. Its base goes to the input through 4.7 kΩ, with 47 kΩ from base to emitter.',
		steps: [
			'The input starts at 5 V and the LED is off. Drag Input voltage down to 0 V.',
			'Hover the transistor at 5 V, 4 V and 0 V and read its state.'
		],
		watch: 'A PNP turns on when its base goes about 0.6 V BELOW its emitter, so the logic is the other way round from an NPN: a high input is off, a low input is on. The 47 kΩ resistor holds the base at the emitter, firmly off, whenever the input is left floating.',
		build({ input = 5 } = {}) {
			const c = circuit({ voltRange: 5 });
			c.rail(p(320, 64), 5);
			c.wire(p(240, 64), p(320, 64));
			const q = c.pnp(p(272, 176));
			c.tag('Q1');
			c.wire(p(320, 64), q.e);
			c.resistor(p(240, 64), p(240, 176), 47000);
			c.wire(p(240, 176), q.b);
			c.slider(p(128, 176), { min: 0, max: 5, value: input, label: 'Input voltage' });
			c.resistor(p(128, 176), p(240, 176), 4700);
			c.led(q.c, p(320, 256));
			c.tag('LED');
			c.resistor(p(320, 256), p(320, 336), 330);
			c.ground(p(320, 336));
			return c;
		},
		checks: [
			{ set: { input: 5 }, expect: [{ tag: 'Q1', has: 'cutoff' }] },
			{ set: { input: 0 }, expect: [{ tag: 'Q1', has: 'saturation' }, { tag: 'LED', field: 'I', near: 9.5e-3, tol: 0.12 }] }
		]
	},

	'pnp-high-side': {
		title: 'High-side switch for a 12 V load from 5 V logic',
		what: 'A PNP switches the 12 V supply to the load. A 5 V logic signal cannot turn it off directly, so a small NPN pulls its base down instead.',
		steps: ['Drag Logic input from 0 to 5 V.', 'Hover each transistor at 0 V and at 5 V.'],
		watch: 'At 0 V the NPN is off, the 10 kΩ pull-up holds the PNP base at 12 V and the load is off. At 5 V the NPN saturates, pulls the PNP base down through 4.7 kΩ, and the PNP saturates: the load gets nearly the whole 12 V. The load stays tied to ground on one side, which is why a high-side switch is used.',
		build({ logic = 0 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.rail(p(448, 48), 12);
			c.wire(p(368, 48), p(448, 48));
			const q2 = c.pnp(p(400, 128));
			c.tag('Q2');
			c.wire(p(448, 48), q2.e);
			c.resistor(p(368, 48), p(368, 128), 10000);
			c.wire(p(368, 128), q2.b);
			const q1 = c.npn(p(320, 224));
			c.tag('Q1');
			c.resistor(p(368, 128), q1.c, 4700);
			c.wire(q1.e, p(368, 304));
			c.slider(p(192, 224), { min: 0, max: 5, value: logic, label: 'Logic input' });
			c.resistor(p(192, 224), q1.b, 10000);
			c.led(q2.c, p(448, 208));
			c.tag('LED');
			c.resistor(p(448, 208), p(448, 304), 1000);
			c.wire(p(368, 304), p(448, 304));
			c.ground(p(368, 304));
			return c;
		},
		checks: [
			{ set: { logic: 0 }, expect: [{ tag: 'Q1', has: 'cutoff' }, { tag: 'Q2', has: 'cutoff' }] },
			{ set: { logic: 5 }, expect: [{ tag: 'Q1', has: 'saturation' }, { tag: 'Q2', has: 'saturation' }, { tag: 'LED', field: 'I', near: 9.9e-3, tol: 0.1 }] }
		]
	},

	darlington: {
		title: 'One transistor against a Darlington pair',
		what: 'The same input drives two 100 mA loads (120 Ω on 12 V) through the same 47 kΩ base resistor: on the left one NPN, on the right two NPNs in a Darlington pair.',
		steps: ['Drag Input voltage up to 5 V.', 'Hover each load resistor and compare the currents, then hover the right-hand transistors.'],
		watch: 'Through 47 kΩ the base gets about 90 µA. One transistor with beta 100 turns that into 9 mA, far short of the 100 mA load. The Darlington multiplies by beta twice and saturates easily, but its saturation voltage is a V_BE plus a V_CE(sat), about 0.8 V instead of 0.1 V, so it dissipates more when on.',
		build({ input = 0 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.rail(p(320, 64), 12);
			c.wire(p(320, 64), p(592, 64));
			// left: one transistor
			c.resistor(p(320, 64), p(320, 224), 120);
			c.tag('RA');
			const qa = c.npn(p(272, 240));
			c.tag('QA');
			c.wire(p(320, 224), qa.c);
			c.wire(qa.e, p(320, 320));
			c.ground(p(320, 320));
			c.slider(p(128, 240), { min: 0, max: 5, value: input, label: 'Input voltage' });
			c.resistor(p(128, 240), qa.b, 47000);
			// right: a Darlington pair
			c.resistor(p(592, 64), p(592, 192), 120);
			c.tag('RB');
			const q1 = c.npn(p(496, 240));
			c.tag('Q1');
			const q2 = c.npn(p(544, 288));
			c.tag('Q2');
			c.wire(q1.e, q2.b);
			c.wire(q1.c, p(544, 192), p(592, 192));
			c.wire(p(592, 192), q2.c);
			c.wire(q2.e, p(592, 352));
			c.ground(p(592, 352));
			c.resistor(p(400, 240), q1.b, 47000);
			c.wire(p(128, 240), p(128, 384), p(400, 384), p(400, 240));
			return c;
		},
		checks: [
			{ set: { input: 0 }, expect: [{ tag: 'QA', has: 'cutoff' }, { tag: 'RB', field: 'I', below: 1e-6 }] },
			{ set: { input: 5 }, expect: [{ tag: 'QA', has: 'fwd active' }, { tag: 'RA', field: 'I', near: 9.3e-3, tol: 0.1 }, { tag: 'RB', field: 'I', near: 92.5e-3, tol: 0.03 }] }
		]
	},

	phototransistor: {
		title: 'Phototransistor with a pull-up resistor',
		what: 'The simulator has no phototransistor, so the light is what it amounts to: a small current into the base, set by the Light slider (0 to 5 µA). A 10 kΩ pull-up on 5 V turns the collector current into an output voltage.',
		steps: ['Start in the dark (Light at 0) and read the output: 5 V.', 'Raise Light slowly and watch the output fall, then hit the bottom.'],
		watch: 'In the dark only leakage flows and the output sits at the supply. Light makes base current that the transistor multiplies by beta, about 300 here, and the drop across 10 kΩ pulls the output down until the transistor saturates near 0.1 V. The bigger the pull-up, the less light it takes, and the slower the output, because the junction capacitance charges through it.',
		build({ light = 0 } = {}) {
			const c = circuit({ voltRange: 5 });
			c.rail(p(320, 64), 5);
			c.resistor(p(320, 64), p(320, 224), 10000);
			const q = c.npn(p(272, 240), { beta: 300 });
			c.tag('Q1');
			c.wire(p(320, 224), q.c);
			c.wire(q.c, p(416, 224));
			c.output(p(416, 224));
			c.tag('OUT');
			c.wire(q.e, p(320, 320));
			c.ground(p(320, 320));
			// the photocurrent: a slider through 1 MΩ, so 1 V means 1 µA
			c.slider(p(128, 240), { min: 0, max: 5, value: light, label: 'Light (µA of photocurrent)' });
			c.resistor(p(128, 240), q.b, 1e6);
			return c;
		},
		checks: [
			{ set: { light: 0 }, expect: [{ tag: 'Q1', has: 'cutoff' }, { tag: 'OUT', mean: 5, tol: 0.01 }] },
			{ set: { light: 1 }, expect: [{ tag: 'Q1', has: 'fwd active' }] },
			{ set: { light: 5 }, expect: [{ tag: 'Q1', has: 'saturation' }] }
		]
	},

	// ------------------------------------------------------------------ JFET

	'jfet-current-source': {
		title: 'JFET current source',
		what: 'An N-channel JFET (I_DSS 3 mA, V_P = -1.5 V) under a 1 kΩ load, with its gate tied to the bottom of a 330 Ω source resistor. A switch shorts the resistor.',
		steps: [
			'With the switch closed (V_GS = 0) drag Supply voltage from 15 V down to 3 V and read the ammeter.',
			'Open the switch to put the 330 Ω resistor in the source, and do it again.'
		],
		watch: 'With the gate at the source, the JFET passes its I_DSS, 3 mA here, whatever the supply, as long as V_DS stays above the pinch-off voltage. The source resistor makes V_GS negative by I_D R_S, which settles at a smaller current, about 1.4 mA. Two parts, no supply for the gate: the simplest current source there is, and the origin of the current-regulator diode.',
		build({ supply = 12, shorted = true } = {}) {
			const c = circuit({ voltRange: 12 });
			c.slider(p(320, 48), { min: 0, max: 15, value: supply, label: 'Supply voltage', dir: 'up' });
			c.resistor(p(320, 48), p(320, 112), 1000);
			c.ammeter(p(320, 112), p(320, 176));
			c.tag('AM');
			const j = c.njfet(p(272, 192), { vt: -1.5, beta: (2 * 3e-3) / 1.5 ** 2 });
			c.tag('J1');
			c.resistor(j.s, p(320, 288), 330);
			c.wire(j.s, p(384, 208));
			c.switch(p(384, 208), p(384, 288), { open: !shorted });
			c.wire(p(384, 288), p(320, 288));
			c.wire(j.g, p(272, 288), p(320, 288));
			c.ground(p(320, 288));
			return c;
		},
		checks: [
			{ set: { supply: 12 }, expect: [{ tag: 'J1', has: 'saturation' }, { tag: 'J1', field: 'Ids', near: 3e-3, tol: 0.05 }] },
			{ set: { supply: 5 }, expect: [{ tag: 'J1', field: 'Ids', near: 3e-3, tol: 0.05 }] },
			{ set: { supply: 12, shorted: false }, expect: [{ tag: 'J1', field: 'Ids', near: 1.42e-3, tol: 0.08 }] }
		]
	},

	'jfet-vcr': {
		title: 'JFET as a voltage-controlled resistor',
		what: 'A 0.2 V sine goes through 2.2 kΩ into the drain of an N-JFET (V_P = -4 V) whose source is grounded. The gate voltage is a slider; the output is the drain.',
		steps: ['Start with Gate voltage at -5 V: the output is the whole input.', 'Move the gate toward 0 V and watch the output shrink.'],
		watch: 'Past pinch-off the channel is open and nothing is lost. Above it the channel is a resistor, r_DS = 1 / (beta (V_GS - V_P)) while V_DS stays small, so the divider attenuates more and more as the gate rises: the JFET is a volume knob turned by a voltage. This is the part an AM modulator, an AGC or a Wien oscillator uses it for.',
		build({ gate = -5 } = {}) {
			const c = circuit({ voltRange: 0.2, timeStep: 2e-6, speed: 20 });
			const input = c.rail(p(128, 160), 0, { dir: 'left', wave: 'ac', amp: 0.2, freq: 1000 });
			c.tag('IN');
			c.resistor(input, p(320, 160), 2200);
			c.wire(p(320, 160), p(320, 208));
			const j = c.njfet(p(272, 224), { vt: -4, beta: (2 * 0.04) / 16 });
			c.tag('J1');
			c.wire(j.s, p(320, 304));
			c.ground(p(320, 304));
			c.slider(p(176, 224), { min: -5, max: 0, value: gate, label: 'Gate voltage' });
			c.wire(p(176, 224), j.g);
			c.wire(p(320, 160), p(416, 160));
			c.output(p(416, 160));
			c.tag('OUT');
			c.scope(`o ${c.tags.IN} 4 0 34 0.2 0.0001 0 -1`);
			c.scope(`o ${c.tags.OUT} 4 0 34 0.2 0.0001 1 -1`);
			return c;
		},
		checks: [
			{ set: { gate: -5 }, expect: [{ tag: 'J1', has: 'off' }, { tag: 'OUT', swing: 0.2, tol: 0.05 }] },
			{ set: { gate: -3.8 }, expect: [{ tag: 'OUT', swing: 0.062, tol: 0.25 }] },
			{ set: { gate: 0 }, expect: [{ tag: 'OUT', swing: 0.0044, tol: 0.3 }] }
		]
	},

	'jfet-amp': {
		title: 'Common-source JFET amplifier',
		what: 'Self-bias: the gate sits at 0 V through 1 MΩ and a 470 Ω source resistor lifts the source, so V_GS comes out negative on its own. A 50 mV sine comes in on the gate.',
		steps: ['Compare the scopes: the output is about five times larger and upside down.', 'Hover the JFET to read I_D and V_GS.'],
		watch: 'No negative supply is needed: the drain current through R_S sets V_GS = -I_D R_S, which settles where the JFET law agrees, about 1.2 mA here. The gain is -g_m R_D: the transconductance of a JFET is small next to a BJT at the same current (2.5 mA/V against 46 mA/V), so the gain is modest, but the input draws no current at all.',
		build() {
			const c = circuit({ voltRange: 12, timeStep: 2e-6, speed: 20 });
			c.rail(p(336, 48), 12);
			c.resistor(p(336, 48), p(336, 160), 2200);
			const j = c.njfet(p(288, 192), { vt: -1.5, beta: (2 * 3e-3) / 1.5 ** 2 });
			c.tag('J1');
			c.resistor(j.s, p(336, 336), 470);
			c.wire(j.s, p(400, 208));
			c.capacitor(p(400, 208), p(400, 336), 100e-6, 0.557);
			c.wire(p(400, 336), p(336, 336));
			c.wire(p(240, 192), j.g);
			c.resistor(p(240, 192), p(240, 336), 1e6);
			c.wire(p(240, 336), p(336, 336));
			c.ground(p(336, 336));
			const input = c.rail(p(112, 192), 0, { dir: 'left', wave: 'ac', amp: 0.05, freq: 1000 });
			c.tag('IN');
			c.capacitor(input, p(240, 192), 1e-6);
			c.wire(p(336, 160), j.d);
			c.wire(p(336, 160), p(480, 160));
			c.capacitor(p(480, 160), p(560, 160), 1e-6, 9.39);
			c.resistor(p(560, 160), p(560, 336), 100000);
			c.wire(p(560, 336), p(400, 336));
			c.output(p(560, 160));
			c.tag('OUT');
			c.scope(`o ${c.tags.IN} 4 0 34 0.05 0.0001 0 -1`);
			c.scope(`o ${c.tags.OUT} 4 0 34 0.5 0.0001 1 -1`);
			return c;
		},
		checks: [{ set: {}, expect: [{ tag: 'J1', has: 'saturation' }, { tag: 'J1', field: 'Ids', near: 1.18e-3, tol: 0.06 }, { tag: 'OUT', swing: 0.27, tol: 0.2 }] }]
	},

	'pjfet-current-source': {
		title: 'P-channel JFET current source',
		what: 'The same current source upside down: a P-JFET (I_DSS 3 mA) hangs from the supply with its gate tied to its source, and the 1 kΩ load goes to ground.',
		steps: ['Drag Supply voltage from 15 V down to 3 V and read the ammeter.'],
		watch: 'A P-channel part is the N one with every voltage and current reversed: the source is the terminal at the higher voltage, current leaves through the drain, and a POSITIVE gate-source voltage pinches it off. Tied gate to source, it passes I_DSS into a grounded load, which is how a current is sourced rather than sunk.',
		build({ supply = 12 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.slider(p(320, 48), { min: 0, max: 15, value: supply, label: 'Supply voltage', dir: 'up' });
			const j = c.pjfet(p(272, 128), { vt: -1.5, beta: (2 * 3e-3) / 1.5 ** 2 });
			c.tag('J1');
			c.wire(p(320, 48), j.s);
			c.wire(j.g, p(272, 48), p(320, 48));
			c.ammeter(j.d, p(320, 208));
			c.tag('AM');
			c.resistor(p(320, 208), p(320, 288), 1000);
			c.ground(p(320, 288));
			return c;
		},
		checks: [
			{ set: { supply: 12 }, expect: [{ tag: 'J1', has: 'saturation' }, { tag: 'J1', field: 'Isd', near: 3e-3, tol: 0.05 }] },
			{ set: { supply: 6 }, expect: [{ tag: 'J1', field: 'Isd', near: 3e-3, tol: 0.05 }] }
		]
	},

	// ------------------------------------------------------------- MOSFETs

	'depletion-mosfet': {
		title: 'Depletion MOSFET: on with no gate voltage',
		what: 'An N-channel depletion MOSFET (V_th = -2 V) with its source grounded and a 470 Ω load on 12 V. The gate voltage is a slider from -3 to +2 V.',
		steps: ['Start at 0 V on the gate: current already flows.', 'Go negative until it stops, then positive past 0 V.'],
		watch: 'A depletion part conducts at V_GS = 0, like a JFET, and needs a negative gate voltage to turn off, here about -2 V. Unlike a JFET its gate is insulated, so it can also go positive and conduct more. Used with a resistor from source to gate, it makes a current source that runs straight off a high-voltage line, as in the start-up circuit of a switching supply.',
		build({ gate = 0 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.rail(p(320, 48), 12);
			c.resistor(p(320, 48), p(320, 112), 470);
			c.ammeter(p(320, 112), p(320, 176));
			const m = c.nmos(p(272, 192), { vt: -2, beta: 0.01 });
			c.tag('M1');
			c.wire(m.s, p(320, 272));
			c.ground(p(320, 272));
			c.slider(p(176, 192), { min: -3, max: 2, value: gate, label: 'Gate voltage' });
			c.wire(p(176, 192), m.g);
			return c;
		},
		checks: [
			{ set: { gate: 0 }, expect: [{ tag: 'M1', has: 'saturation' }, { tag: 'M1', field: 'Ids', near: 0.02, tol: 0.05 }] },
			{ set: { gate: -2.5 }, expect: [{ tag: 'M1', field: 'Ids', below: 1e-6 }] },
			{ set: { gate: 1.5 }, expect: [{ tag: 'M1', has: 'linear' }] }
		]
	},

	'nmos-low-side': {
		title: 'MOSFET switching a motor coil',
		what: 'A power N-MOSFET switches a coil (10 Ω and 10 mH, like a small motor or a relay) to ground, driven by a 0 to 5 V square wave at 100 Hz through 100 Ω, with 100 kΩ holding the gate low. A diode across the coil can be switched out. The 62 V zener stands for the avalanche breakdown of the MOSFET itself.',
		steps: [
			'Watch the drain voltage on the scope: about 0 V while on, 12 V while off.',
			'Click the switch to disconnect the flyback diode and look at the scope again.'
		],
		watch: 'A coil keeps its current flowing. At turn-off the diode gives it a path back to the supply, so the drain stops one diode drop above 12 V. Without the diode the current has nowhere to go: the drain climbs until the MOSFET breaks down, at 62 V here, and the energy of the coil, L I² / 2 = 7 mJ, is dumped into the transistor at every turn-off. A datasheet rates that as the avalanche energy E_AS; a design never counts on it. The 100 kΩ keeps the gate off when the driver is unplugged, and the 100 Ω tames the ringing of the gate capacitance.',
		build({ diode = true } = {}) {
			const c = circuit({ voltRange: 12, timeStep: 2e-6, speed: 25 });
			c.rail(p(448, 48), 12);
			c.resistor(p(448, 48), p(448, 128), 10);
			c.inductor(p(448, 128), p(448, 208), 0.01);
			c.wire(p(448, 208), p(448, 224));
			const m = c.nmos(p(400, 240), { vt: 2, beta: 2, bodyDiode: true });
			c.tag('M1');
			c.wire(m.s, p(448, 304));
			c.wire(p(448, 208), p(528, 208));
			c.switch(p(528, 208), p(528, 144), { open: !diode });
			c.diode(p(528, 144), p(528, 48), '1N4004');
			c.wire(p(528, 48), p(448, 48));
			c.rail(p(208, 240), 0, { dir: 'left', wave: 'square', amp: 2.5, bias: 2.5, freq: 100 });
			c.resistor(p(208, 240), p(304, 240), 100);
			c.wire(p(304, 240), m.g);
			c.resistor(p(304, 240), p(304, 304), 100000);
			c.wire(p(304, 304), p(448, 304));
			c.ground(p(448, 304));
			c.wire(m.d, p(496, 224), p(608, 224));
			c.zener(p(496, 304), p(496, 224), 62);
			c.wire(p(448, 304), p(496, 304));
			c.output(p(608, 224));
			c.tag('OUT');
			c.scope(`o ${c.tags.OUT} 64 0 34 20 0.01 0 -1`);
			return c;
		},
		checks: [
			{ set: { diode: true }, settle: 2500, expect: [{ tag: 'OUT', maxBelow: 13.5 }] },
			{ set: { diode: false }, settle: 2500, expect: [{ tag: 'OUT', maxAbove: 55 }, { tag: 'OUT', maxBelow: 70 }] }
		]
	},

	'logic-level': {
		title: 'Logic-level against standard MOSFET',
		what: 'The same gate voltage drives two N-MOSFETs, each switching a 6 Ω load (2 A) on 12 V: on the left a logic-level part (V_th = 1.5 V), on the right a standard one (V_th = 3.5 V), the kind whose datasheet gives R_DS(on) at V_GS = 10 V.',
		steps: ['Set Gate voltage to 3.3 V, then 5 V, then 10 V, and hover each MOSFET: compare V_DS and the power P.'],
		watch: 'At 10 V both are fully on, with a fraction of a volt across them. At 5 V the standard part is not: it sits in its saturation region, limits the current, and burns watts. At 3.3 V it hardly conducts. The datasheet line to check is R_DS(on) at the gate voltage the driver really has, not V_GS(th), which is the voltage where it only starts to conduct.',
		build({ gate = 5 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.rail(p(320, 48), 12);
			c.wire(p(320, 48), p(528, 48));
			c.resistor(p(320, 48), p(320, 208), 6);
			const a = c.nmos(p(272, 224), { vt: 1.5, beta: 3 });
			c.tag('MA');
			c.wire(a.s, p(320, 304));
			c.ground(p(320, 304));
			c.resistor(p(528, 48), p(528, 208), 6);
			const b = c.nmos(p(480, 224), { vt: 3.5, beta: 1.5 });
			c.tag('MB');
			c.wire(b.s, p(528, 304));
			c.ground(p(528, 304));
			c.slider(p(176, 224), { min: 0, max: 10, value: gate, label: 'Gate voltage' });
			c.wire(p(176, 224), a.g);
			c.wire(p(176, 224), p(176, 352), p(416, 352), p(416, 224), b.g);
			return c;
		},
		checks: [
			{ set: { gate: 10 }, expect: [{ tag: 'MA', has: 'linear' }, { tag: 'MB', has: 'linear' }] },
			{ set: { gate: 5 }, expect: [{ tag: 'MA', has: 'linear' }, { tag: 'MB', has: 'saturation' }] }
		]
	},

	'level-shifter': {
		title: 'Two-way level shifter, 3.3 V to 5 V',
		what: 'The classic one-MOSFET shifter (a BSS138): gate on 3.3 V, source on the 3.3 V side, drain on the 5 V side, a 10 kΩ pull-up on each. A switch on each side pulls that side low, like an I2C device.',
		steps: ['With both switches open, read both outputs: 3.3 V and 5 V.', 'Close the 3.3 V side switch, then open it and close the 5 V side switch.'],
		watch: 'Pulling the 3.3 V side low raises V_GS to 3.3 V: the channel turns on and pulls the 5 V side down with it. Pulling the 5 V side low first drags the 3.3 V side down through the body diode, which raises V_GS and turns the channel on again. Either side can drive, and each side only ever sees its own voltage.',
		build({ lowA = false, lowB = false } = {}) {
			const c = circuit({ voltRange: 5 });
			c.rail(p(352, 160), 3.3);
			c.wire(p(352, 160), p(352, 240));
			const m = c.nmos(p(352, 240), { vt: 1.5, beta: 0.5, bodyDiode: true });
			c.tag('M1');
			c.rail(p(400, 64), 5);
			c.resistor(p(400, 64), p(400, 176), 10000);
			c.wire(p(400, 176), m.d);
			c.wire(p(400, 176), p(464, 176), p(528, 176));
			c.output(p(528, 176));
			c.tag('B');
			c.switch(p(464, 176), p(464, 240), { open: !lowB });
			c.ground(p(464, 240));
			c.wire(m.s, p(400, 304));
			c.rail(p(256, 304), 3.3, { dir: 'left' });
			c.resistor(p(256, 304), p(400, 304), 10000);
			c.wire(p(400, 304), p(464, 304), p(528, 304));
			c.output(p(528, 304));
			c.tag('A');
			c.switch(p(464, 304), p(464, 368), { open: !lowA });
			c.ground(p(464, 368));
			return c;
		},
		checks: [
			{ set: {}, expect: [{ tag: 'A', mean: 3.3, tol: 0.05 }, { tag: 'B', mean: 5, tol: 0.05 }] },
			{ set: { lowA: true }, expect: [{ tag: 'A', mean: 0, tol: 0.05 }, { tag: 'B', maxBelow: 0.4 }] },
			{ set: { lowB: true }, expect: [{ tag: 'B', mean: 0, tol: 0.05 }, { tag: 'A', maxBelow: 0.4 }] }
		]
	},

	'pmos-high-side': {
		title: 'P-MOSFET high-side switch',
		what: 'A P-MOSFET between 12 V and the load, its gate held at 12 V by 10 kΩ. A small N-MOSFET, driven by a 5 V logic signal, pulls the gate down to switch it on.',
		steps: ['Drag Logic input from 0 to 5 V.', 'Hover the P-MOSFET at each end and read V_GS.'],
		watch: 'A P-channel part turns on when its gate goes BELOW its source: here V_GS swings from 0 to -12 V. The logic signal never reaches 12 V, so the small N-MOSFET does the pulling, and it also keeps the logic pin away from the 12 V rail. A gate pulled 12 V under the source is fine for most parts, which take +/-20 V; at 24 V a zener from source to gate would be needed.',
		build({ logic = 0 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.rail(p(448, 48), 12);
			c.wire(p(368, 48), p(448, 48));
			const q = c.pmos(p(400, 128), { vt: 1.5, beta: 1, bodyDiode: true });
			c.tag('M2');
			c.wire(p(448, 48), q.s);
			c.resistor(p(368, 48), p(368, 128), 10000);
			c.wire(p(368, 128), q.g);
			const n = c.nmos(p(320, 224), { vt: 2, beta: 0.1 });
			c.tag('M1');
			c.wire(p(368, 128), n.d);
			c.wire(n.s, p(368, 304));
			c.slider(p(192, 224), { min: 0, max: 5, value: logic, label: 'Logic input' });
			c.resistor(p(192, 224), n.g, 100);
			c.led(q.d, p(448, 208));
			c.tag('LED');
			c.resistor(p(448, 208), p(448, 304), 1000);
			c.wire(p(368, 304), p(448, 304));
			c.ground(p(368, 304));
			return c;
		},
		checks: [
			{ set: { logic: 0 }, expect: [{ tag: 'LED', field: 'I', below: 1e-6 }] },
			{ set: { logic: 5 }, expect: [{ tag: 'M2', has: 'linear' }, { tag: 'LED', field: 'I', near: 9.9e-3, tol: 0.08 }] }
		]
	},

	'reverse-polarity': {
		title: 'Reverse-battery protection: diode against P-MOSFET',
		what: 'A battery whose voltage is a slider from -12 V (connected backwards) to +12 V feeds two 100 Ω loads: one through a P-MOSFET, the other through a series diode.',
		steps: ['At +12 V read both load voltages.', 'Drag the battery to -12 V and read them again.'],
		watch: 'Both block a reversed battery. Forward, the diode costs its 0.7 V and its loss, watts at high current. The P-MOSFET is placed backwards on purpose: its body diode conducts first, that pulls the source up, V_GS goes to about -12 V and the channel turns on and shorts the diode, so the loss is only I squared times R_DS(on). Reversed, the body diode blocks and V_GS stays near 0: off.',
		build({ battery = 12 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.slider(p(352, 288), { min: -12, max: 12, value: battery, label: 'Battery voltage', dir: 'down' });
			const m = c.pmos(p(304, 176), { vt: 2, beta: 2, bodyDiode: true });
			c.tag('M1');
			c.wire(p(352, 288), m.d);
			c.wire(m.s, p(352, 96), p(448, 96));
			c.resistor(p(448, 96), p(448, 256), 100);
			c.ground(p(448, 256));
			c.output(p(448, 96), 'up');
			c.tag('OUTM');
			c.resistor(m.g, p(304, 256), 10000);
			c.ground(p(304, 256));
			c.wire(p(352, 288), p(560, 288));
			c.diode(p(560, 288), p(560, 192), '1N4004');
			c.wire(p(560, 192), p(560, 96), p(640, 96));
			c.resistor(p(640, 96), p(640, 256), 100);
			c.ground(p(640, 256));
			c.output(p(640, 96), 'up');
			c.tag('OUTD');
			return c;
		},
		checks: [
			{ set: { battery: 12 }, expect: [{ tag: 'OUTM', mean: 11.9, tol: 0.15 }, { tag: 'OUTD', mean: 11.2, tol: 0.25 }] },
			{ set: { battery: -12 }, expect: [{ tag: 'OUTM', mean: 0, tol: 0.05 }, { tag: 'OUTD', mean: 0, tol: 0.05 }] }
		]
	},

	'cmos-inverter': {
		title: 'CMOS inverter',
		what: 'A P-MOSFET from 5 V and an N-MOSFET to ground, gates tied together as the input, drains tied together as the output. An ammeter reads the supply current.',
		steps: ['Drag Input voltage from 0 to 5 V and watch the output.', 'Stop around 2.5 V and read the ammeter.'],
		watch: 'At either end one transistor is fully on and the other fully off: the output sits at a rail and no current flows from the supply, which is why CMOS logic draws almost nothing when it is not switching. In the middle both conduct at once and a current shoots through: every edge of a CMOS signal costs a little of it, and a slow input edge costs a lot.',
		build({ input = 0 } = {}) {
			const c = circuit({ voltRange: 5 });
			c.rail(p(320, 32), 5);
			c.ammeter(p(320, 32), p(320, 112));
			c.tag('AM');
			const pm = c.pmos(p(272, 128));
			c.tag('MP');
			const nm = c.nmos(p(272, 240));
			c.tag('MN');
			c.wire(pm.d, p(320, 176), nm.d);
			c.wire(p(320, 176), p(416, 176));
			c.output(p(416, 176));
			c.tag('OUT');
			c.wire(pm.g, p(272, 176), nm.g);
			c.slider(p(176, 176), { min: 0, max: 5, value: input, label: 'Input voltage' });
			c.wire(p(176, 176), p(272, 176));
			c.wire(nm.s, p(320, 304));
			c.ground(p(320, 304));
			return c;
		},
		checks: [
			{ set: { input: 0 }, expect: [{ tag: 'OUT', mean: 5, tol: 0.02 }, { tag: 'MN', field: 'Ids', below: 1e-6 }] },
			{ set: { input: 5 }, expect: [{ tag: 'OUT', mean: 0, tol: 0.02 }] },
			{ set: { input: 2.5 }, expect: [{ tag: 'MN', field: 'Ids', near: 0.01, tol: 0.1 }] }
		]
	},

	// ------------------------------------------------------- power, special

	'igbt-model': {
		title: 'Inside an IGBT: a MOSFET driving a PNP',
		what: 'The simulator has no IGBT, so this is the equivalent circuit datasheets draw: an N-MOSFET whose drain current is the base current of a wide-base PNP. Gate, collector and emitter are the IGBT terminals, switching a 10 Ω load on 24 V.',
		steps: ['Drag Gate voltage from 0 to 15 V.', 'Hover the PNP and the MOSFET at 15 V and add up the voltage between collector and emitter.'],
		watch: 'The gate is a MOSFET gate, insulated and charge-driven, but the current flows through a bipolar junction, so the on-state voltage never falls under about one diode drop, whatever the current: an IGBT is rated by V_CE(sat), 1.5 to 2 V, not by an on-resistance. That is a loss at low current and a gain at high current and high voltage, where a MOSFET of the same size would have a large R_DS(on).',
		build({ gate = 0 } = {}) {
			const c = circuit({ voltRange: 24 });
			c.rail(p(400, 48), 24);
			c.resistor(p(400, 48), p(400, 144), 10);
			c.tag('RL');
			const q = c.pnp(p(352, 160), { beta: 10 });
			c.tag('Q1');
			c.wire(q.b, p(304, 160), p(304, 208));
			const m = c.nmos(p(256, 224), { vt: 4, beta: 2 });
			c.tag('M1');
			c.wire(m.s, p(304, 304));
			c.wire(q.c, p(400, 304));
			c.wire(p(304, 304), p(400, 304));
			c.ground(p(400, 304));
			c.slider(p(128, 224), { min: 0, max: 15, value: gate, label: 'Gate voltage' });
			c.resistor(p(128, 224), m.g, 100);
			c.text(p(432, 136), 'collector');
			c.text(p(432, 296), 'emitter');
			c.text(p(112, 256), 'gate');
			return c;
		},
		checks: [
			{ set: { gate: 0 }, expect: [{ tag: 'RL', field: 'I', below: 1e-5 }] },
			{ set: { gate: 15 }, expect: [{ tag: 'RL', field: 'I', near: 2.32, tol: 0.03 }] }
		]
	},

	'ujt-oscillator': {
		title: 'UJT relaxation oscillator',
		what: 'A capacitor charges through R toward 10 V. When it reaches the UJT\'s peak point the emitter junction breaks down, the capacitor dumps into base 1, and the cycle starts over. A slider sets R.',
		steps: ['Watch the two scopes: a sawtooth on the capacitor, a short pulse across the 47 Ω resistor.', 'Drag Charging resistor and watch the period change.'],
		watch: 'The UJT fires at a fixed fraction of the supply, V_P = eta V_BB + V_D, with eta the intrinsic stand-off ratio of the part (0.56 to 0.75 for a 2N2646). The period is about R C ln(1 / (1 - eta)), so it depends on R, C and eta but hardly on the supply. The pulse across the base-1 resistor is what used to fire a thyristor.',
		build() {
			const c = circuit({ voltRange: 10, timeStep: 5e-6, speed: 30 });
			c.rail(p(352, 48), 10);
			c.wire(p(352, 48), p(496, 48));
			c.resistor(p(352, 48), p(352, 176), 100000);
			c.tag('R');
			c.capacitor(p(352, 176), p(352, 304), 10e-9);
			c.tag('C');
			const u = c.ujt(p(416, 176));
			c.tag('U1');
			c.wire(p(352, 176), u.e);
			c.resistor(p(496, 48), u.b2, 470);
			c.resistor(u.b1, p(496, 304), 47);
			c.tag('R1');
			c.wire(p(352, 304), p(496, 304));
			c.ground(p(352, 304));
			c.adjust(c.tags.R, { item: 0, min: 10000, max: 470000, label: 'Charging resistor', log: true });
			c.scope(`o ${c.tags.C} 64 0 34 10 0.05 0 -1`);
			c.scope(`o ${c.tags.R1} 64 0 34 5 0.05 1 -1`);
			return c;
		},
		checks: [{ set: {}, settle: 2000, expect: [{ tag: 'C', sample: 'Vd', reach: [3, 5] }] }]
	},

	// ---------------------------------------------- several transistors

	'current-mirror': {
		title: 'Current mirror',
		what: 'Q1 is wired as a diode: its collector feeds its own base, so 10 kΩ from 12 V sets about 1.1 mA through it. Q2 shares its base voltage and copies that current into whatever its collector is tied to, here a voltage set by a slider.',
		steps: ['Drag Collector voltage from 12 V down to 1 V and read the ammeter.', 'Go under about 0.3 V and watch the copy fail.'],
		watch: 'Two matched transistors with the same V_BE carry the same collector current, so the output current is set by the 10 kΩ and not by what Q2 drives, down to the point where Q2 saturates. Real mirrors drift a little with V_CE (the Early effect) and need their two transistors at the same temperature, which is why they come on one chip.',
		build({ vc = 12 } = {}) {
			const c = circuit({ voltRange: 12 });
			c.rail(p(208, 48), 12);
			c.resistor(p(208, 48), p(208, 192), 10000);
			const q1 = c.npn(p(256, 240), { dir: 'left' });
			c.tag('Q1');
			const q2 = c.npn(p(288, 240));
			c.tag('Q2');
			c.wire(p(208, 192), q1.c);
			c.wire(p(208, 192), p(272, 192), p(272, 240));
			c.wire(q1.b, p(272, 240));
			c.wire(p(272, 240), q2.b);
			c.ammeter(p(336, 128), q2.c);
			c.tag('AM');
			c.slider(p(336, 128), { min: 0, max: 12, value: vc, label: 'Collector voltage', dir: 'up' });
			c.wire(q1.e, p(208, 304), p(272, 304), p(336, 304));
			c.wire(q2.e, p(336, 304));
			c.ground(p(272, 304));
			return c;
		},
		checks: [
			{ set: { vc: 12 }, expect: [{ tag: 'Q2', has: 'fwd active' }, { tag: 'Q2', field: 'Ic', near: 1.12e-3, tol: 0.05 }] },
			{ set: { vc: 2 }, expect: [{ tag: 'Q2', field: 'Ic', near: 1.12e-3, tol: 0.05 }] }
		]
	},

	'diff-pair': {
		title: 'Differential pair',
		what: 'Two NPNs share a 1 mA tail current from -12 V. One base gets a 10 mV sine, the other is grounded; each collector has 10 kΩ to 12 V.',
		steps: ['Compare the two collector scopes: same size, opposite phase.'],
		watch: 'The tail current is fixed, so whatever one transistor gains the other loses: the pair amplifies the DIFFERENCE between its two bases, gain about g_m R_C / 2 on each side, near 100 here. The same voltage on both bases would only move the emitters. That is the input stage of every op-amp.',
		build() {
			const c = circuit({ voltRange: 12, timeStep: 2e-6, speed: 20 });
			c.rail(p(304, 48), 12);
			c.wire(p(256, 48), p(304, 48));
			c.wire(p(304, 48), p(352, 48));
			c.resistor(p(256, 48), p(256, 160), 10000);
			c.resistor(p(352, 48), p(352, 160), 10000);
			const q1 = c.npn(p(208, 208));
			c.tag('Q1');
			const q2 = c.npn(p(400, 208), { dir: 'left' });
			c.tag('Q2');
			c.wire(q1.e, p(256, 256), p(304, 256));
			c.wire(q2.e, p(352, 256), p(304, 256));
			c.resistor(p(304, 256), p(304, 352), 11000);
			c.rail(p(304, 352), -12, { dir: 'down' });
			const input = c.rail(p(112, 208), 0, { dir: 'left', wave: 'ac', amp: 0.01, freq: 1000 });
			c.wire(input, q1.b);
			c.wire(q2.b, p(448, 208));
			c.ground(p(448, 208));
			c.wire(p(256, 160), q1.c);
			c.wire(p(352, 160), q2.c);
			c.wire(p(256, 160), p(160, 160));
			c.output(p(160, 160), 'left');
			c.tag('OUT1');
			c.wire(p(352, 160), p(448, 160));
			c.output(p(448, 160));
			c.tag('OUT2');
			c.scope(`o ${c.tags.OUT1} 4 0 34 10 0.0001 0 -1`);
			c.scope(`o ${c.tags.OUT2} 4 0 34 10 0.0001 1 -1`);
			return c;
		},
		checks: [{ set: {}, expect: [{ tag: 'Q1', has: 'fwd active' }, { tag: 'Q2', has: 'fwd active' }, { tag: 'OUT1', swing: 0.95, tol: 0.25 }, { tag: 'OUT2', swing: 0.95, tol: 0.25 }] }]
	},

	'push-pull': {
		title: 'Push-pull output: class B against class AB',
		what: 'Two complementary emitter followers (an NPN pushing, a PNP pulling) drive 100 Ω loads from +/-12 V with the same 5 V sine. On the left the bases are tied to the input (class B); on the right two diodes hold them 1.2 V apart (class AB).',
		steps: ['Compare the two output scopes, especially where the wave crosses zero.'],
		watch: 'A follower only conducts once its base is a V_BE past the emitter, so with tied bases neither transistor conducts while the input is within about 0.6 V of zero: a flat step at every zero crossing, crossover distortion, which the ear hears clearly. The two diodes pre-bias both transistors to the edge of conduction, and the step disappears. Real amplifiers add small emitter resistors so the idle current cannot run away with temperature.',
		build() {
			const c = circuit({ voltRange: 12, timeStep: 5e-6, speed: 25 });
			// left: class B
			c.rail(p(256, 48), 12);
			const n1 = c.npn(p(208, 160));
			c.tag('QB1');
			const p1 = c.pnp(p(208, 288));
			c.tag('QB2');
			c.wire(p(256, 48), n1.c);
			c.wire(n1.e, p(256, 224), p1.e);
			c.wire(p1.c, p(256, 368));
			c.rail(p(256, 368), -12, { dir: 'down' });
			c.wire(n1.b, p(208, 224), p1.b);
			c.rail(p(112, 224), 0, { dir: 'left', wave: 'ac', amp: 5, freq: 100 });
			c.wire(p(112, 224), p(208, 224));
			c.wire(p(256, 224), p(320, 224));
			c.resistor(p(320, 224), p(320, 368), 100);
			c.ground(p(320, 368));
			c.output(p(320, 224), 'up');
			c.tag('OUTB');
			// right: class AB
			c.rail(p(608, 48), 12);
			c.wire(p(560, 48), p(608, 48));
			const n2 = c.npn(p(560, 160));
			c.tag('QA1');
			const p2 = c.pnp(p(560, 288));
			c.tag('QA2');
			c.wire(p(608, 48), n2.c);
			c.wire(n2.e, p(608, 224), p2.e);
			c.wire(p2.c, p(608, 368));
			c.rail(p(608, 368), -12, { dir: 'down' });
			c.resistor(p(560, 48), n2.b, 2200);
			c.diode(n2.b, p(560, 224));
			c.diode(p(560, 224), p2.b);
			c.resistor(p2.b, p(560, 368), 2200);
			c.wire(p(560, 368), p(608, 368));
			c.rail(p(464, 224), 0, { dir: 'left', wave: 'ac', amp: 5, freq: 100 });
			c.wire(p(464, 224), p(560, 224));
			c.wire(p(608, 224), p(672, 224));
			c.resistor(p(672, 224), p(672, 368), 100);
			c.ground(p(672, 368));
			c.output(p(672, 224), 'up');
			c.tag('OUTAB');
			c.scope(`o ${c.tags.OUTB} 16 0 34 10 0.05 0 -1`);
			c.scope(`o ${c.tags.OUTAB} 16 0 34 10 0.05 1 -1`);
			return c;
		},
		checks: [{ set: {}, settle: 2000, expect: [{ tag: 'OUTB', reach: [-4.2, 4.2] }, { tag: 'OUTAB', reach: [-4.6, 4.6] }] }]
	},

	multivibrator: {
		title: 'Astable multivibrator',
		what: 'Two NPNs, each with an LED in its collector, each holding the other off through a capacitor: the oldest transistor oscillator, two LEDs taking turns.',
		steps: ['Watch the LEDs alternate and the base-emitter voltage of Q2 on the scope.', 'Drag Timing resistor R_B1 to change how long one half lasts.'],
		watch: 'When Q1 switches on, its collector drops by about 5 V and the capacitor carries that step to the base of Q2, which goes negative and turns off. The base of Q2 then charges back up through its resistor; at about 0.6 V Q2 turns on and the roles swap. Each half lasts about 0.69 R C. The base swings to -4 V or so, close to the 5 to 6 V a base-emitter junction survives in reverse: at higher supplies a diode in each base is needed.',
		build() {
			const c = circuit({ voltRange: 5, timeStep: 1e-4, speed: 60 });
			c.rail(p(112, 48), 5, { dir: 'left' });
			c.wire(p(112, 48), p(208, 48), p(288, 48), p(384, 48));
			c.resistor(p(112, 48), p(112, 112), 330);
			c.led(p(112, 112), p(112, 176));
			c.resistor(p(384, 48), p(384, 112), 330);
			c.led(p(384, 112), p(384, 176));
			c.resistor(p(208, 48), p(208, 176), 47000);
			c.tag('RB1');
			c.resistor(p(288, 48), p(288, 176), 47000);
			c.tag('RB2');
			c.capacitor(p(112, 176), p(208, 176), 4.7e-6);
			c.capacitor(p(384, 176), p(288, 176), 4.7e-6);
			const q1 = c.npn(p(160, 256), { dir: 'left' });
			c.tag('Q1');
			const q2 = c.npn(p(336, 256));
			c.tag('Q2');
			c.wire(p(112, 176), q1.c);
			c.wire(p(384, 176), q2.c);
			c.diagonal(p(208, 176), q2.b);
			c.diagonal(p(288, 176), q1.b);
			c.ground(q1.e);
			c.ground(q2.e);
			c.adjust(c.tags.RB1, { item: 0, min: 10000, max: 100000, label: 'Timing resistor R_B1', log: true });
			// the scope plots V_BE of Q2 (value 4 of a transistor)
			c.scope(`o ${c.tags.Q2} 64 4 34 5 0.0001 0 -1`);
			return c;
		},
		checks: [{ set: {}, settle: 2500, expect: [{ tag: 'Q1', sample: 'Ic', samples: 400, reach: [1e-4, 5e-3] }] }]
	}
};

/** One simulation as the page shows it: the card's text and the circuit for the frame. */
export function sim(id) {
	const s = CIRCUITS[id];
	if (!s) throw new Error(`Unknown simulation: ${id}`);
	return { id, title: s.title, what: s.what, steps: s.steps, watch: s.watch, text: s.build().toText() };
}
