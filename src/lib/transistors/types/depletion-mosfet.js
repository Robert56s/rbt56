// The N-channel depletion-mode MOSFET. Content of one page of the transistor
// guide: see src/lib/transistors/types/index.js for what each field is.
// Strings with formulas use String.raw so a LaTeX backslash stays one
// backslash.
const r = String.raw;

export default {
	slug: 'depletion-mosfet',
	name: 'Depletion-mode MOSFET',
	short: 'Depletion',
	family: 'fet',
	symbol: { name: 'n_channel_d_mosfet_transistor_horz', labels: { drain: 'D', gate: 'G', source: 'S' } },
	control: 'Voltage from gate to source, negative to turn it off',
	normally: 'on',
	fullyOn: r`A resistance $R_{DS(on)}$, already at $V_{GS} = 0$: 25 Ω max for a DN2540`,
	terminals: [
		['G', 'gate'],
		['D', 'drain'],
		['S', 'source']
	],
	oneLiner: r`A MOSFET built with its channel already in place: it conducts with the gate at 0 V, and only a negative gate-source voltage turns it off.`,
	usedFor: ['Current sources and current limiters, up to hundreds of volts', 'Start-up supplies fed straight from a high-voltage line', 'Normally-closed solid-state switches'],

	howItWorks: [
		{
			p: r`An N-channel depletion MOSFET is built like the ordinary (enhancement) N-MOSFET: an N-type source and drain, a gate on a thin insulating oxide, and a body tied to the source inside the package, which leaves a body diode from source to drain. The difference is that a conducting N channel already exists under the gate when the part is made. With the gate at the source voltage the part is on, and current flows from drain to source through the channel as through a resistor. The symbol shows this with a solid channel line, where an enhancement MOSFET's line is broken in three.`
		},
		{
			p: r`A negative gate-source voltage pushes electrons out of the channel and narrows it: the channel is depleted, which gives the part its name. Near $V_{GS(off)}$, a few volts below zero, the channel is almost gone: a small current still flows there, and a little further down the part is off. A positive gate does the opposite and draws more electrons in, so the part conducts better than at 0 V. That is the difference from a JFET, which behaves the same below 0 V: the JFET's gate is a PN junction that conducts once forward-biased, while this gate is insulated and may go positive up to its rating, ±20 V on a DN2540.`
		},
		{
			eq: r`I_D = \tfrac{k}{2}\,(V_{GS} - V_{th})^2 = I_{DSS}\Big(1 - \frac{V_{GS}}{V_{th}}\Big)^2 \qquad I_{DSS} = \tfrac{k}{2}\, V_{th}^2`,
			intro: r`In its current-source region the part follows the square law of every MOSFET, with a negative threshold $V_{th}$:`
		},
		{
			p: r`$k$, in A/V², grows with the width of the channel and shrinks with its length. $I_{DSS}$ is the current at $V_{GS} = 0$, the number a datasheet gives, and $V_{th}$ is close to the datasheet's $V_{GS(off)}$. The second form is the JFET's own law: everything the JFET page says about biasing carries over. It holds for $V_{DS} \ge V_{GS} - V_{th}$, which at $V_{GS} = 0$ means a drain-source voltage above $|V_{th}|$.`
		},
		{
			eq: r`R_{DS} = \frac{1}{k\,(V_{GS} - V_{th})} \qquad R_{DS}\big|_{V_{GS} = 0} = \frac{|V_{th}|}{2\, I_{DSS}}`,
			intro: r`Below that edge the channel acts as a resistor whose value the gate sets. At small $V_{DS}$:`
		},
		{
			p: r`A datasheet gives that resistance at $V_{GS} = 0$ as $R_{DS(on)}$: 17 Ω typical and 25 Ω max for a DN2540, at 120 mA. A positive gate lowers it further: the BSS139I goes from 30 Ω max at $V_{GS} = 0$ (15 mA) to 14 Ω max at $V_{GS} = 10$ V (0.1 A).`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Gate-source', 'Drain-source', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff)', r`below $V_{GS(off)}$`, 'any', 'only leakage flows; the body diode still conducts from source to drain', 'open switch'],
					['Current source (saturation)', r`above $V_{GS(off)}$`, r`$V_{DS} \ge V_{GS} - V_{th}$`, r`$I_D$ set by $V_{GS}$, nearly independent of $V_{DS}$`, 'current source, current limiter, start-up supply'],
					['Fully on, a resistor (triode, ohmic)', r`above $V_{GS(off)}$, 0 V included`, r`$V_{DS} < V_{GS} - V_{th}$`, r`the channel is a resistor, $R_{DS(on)}$ at $V_{GS} = 0$`, 'closed switch']
				]
			}
		},
		{
			note: r`Three words clash. A FET's "saturation" is its current-source region, the equivalent of the BJT's active region, not the fully-on BJT switch. Power-MOSFET app notes call that same region "linear mode", while Falstad's hover label "linear" means triode. And the turn-off voltage goes by two names: $V_{GS(OFF)}$ on the DN2540, a negative $V_{GS(th)}$ on the BSS139I. Both are test points where a small current still flows, 10 µA and 56 µA, not the voltage at which the part blocks.`,
			tone: 'warn'
		},
		{
			more: [
				{ p: r`Around an operating point in its current-source region, the drain current follows small changes of the gate through the transconductance $g_m$, the change in $I_D$ per volt of $V_{GS}$, as in any FET:` },
				{ eq: r`g_m = \frac{2\, I_{DSS}}{|V_{th}|}\Big(1 - \frac{V_{GS}}{V_{th}}\Big) = k\,(V_{GS} - V_{th}) = \sqrt{2\, k\, I_D}` },
				{ p: r`A datasheet gives it as $G_{FS}$ or $g_{fs}$ at one current: 325 mS typical at 100 mA for the DN2540, 0.13 S typical at 80 mA for the BSS139I. Temperature moves two other numbers. $V_{GS(off)}$ shifts by up to -4.5 mV/°C on a DN2540, so a hot part needs a more negative gate to turn off. $R_{DS(on)}$ rises by up to 1.1 %/°C, so a hot switch drops more. The square law itself is only rough for a vertical power part like the DN2540, worst near cutoff where current sources run: a design built on it plans to trim a resistor.` }
			],
			summary: 'Small-signal model and temperature'
		}
	],

	curves: {
		widget: 'fetCurves',
		props: { kind: 'depletion', vdd: 12, rd: 470 },
		caption: r`The output curves of a model depletion MOSFET ($V_{th} = -2$ V, $I_{DSS} = 10$ mA). The curve marked 0 V already carries about 10 mA: the part is on with no gate drive. The curve below it is for a negative gate, the ones above for positive gates: unlike a JFET, the gate works both ways. The red line is the load line of 470 Ω on 12 V; with the slider at 0 V the part sits at 10.7 mA with 7.0 V across it. The simulation below uses the same threshold with twice the $k$, so $I_{DSS} = 20$ mA: at 0 V on the gate it reads 20 mA with 2.6 V across the part.`
	},

	sims: ['depletion-mosfet'],

	rules: [
		{
			title: 'A current source: one resistor from source to gate',
			body: [
				{ p: r`The gate goes to the bottom of a resistor $R_S$, the source to its top. The drain current lifts the source above the gate, so $V_{GS} = -I_D R_S$: more current makes the gate more negative, which cuts the current back. The part settles where that line meets its own law, exactly like a self-biased JFET. Solved for the resistor:` },
				{ eq: r`R_S = \frac{|V_{GS(off)}|\,\big(1 - \sqrt{I_D / I_{DSS}}\big)}{I_D}` },
				{ p: r`A DN2540 for 1 mA: $V_{GS(off)}$ runs from -1.5 to -3.5 V and $I_{DSS}$ is at least 150 mA, so $R_S$ comes out between 1.38 kΩ and 3.21 kΩ. Raising $I_{DSS}$ to 500 mA moves it by only 4 %: the unknown $I_{DSS}$ hardly matters, the spread of $V_{GS(off)}$ does. A fixed 2.2 kΩ gives anywhere from 0.64 to 1.5 mA depending on the part, so a precise source has its resistor trimmed on the bench.` },
				{ p: r`In series with a load, the same two parts make a current limiter: below the set current they drop at most about $|V_{GS(off)}|$, up to 3.5 V on a DN2540, mostly across $R_S$. In the square law, $I_D R_S$ plus the $V_{GS} - V_{th}$ the channel needs adds up to exactly $|V_{th}|$, and that is also the least voltage the current source needs across it to regulate, its compliance voltage. On a short circuit the current stops at the set value. The DN2540 holds off 400 V doing it, where a J111 JFET stops at 35 V.` }
			]
		},
		{
			title: r`Dissipation is the real limit: $P = V_{DS}\, I_D$`,
			body: [
				{ eq: r`P = V_{DS}\, I_D \qquad T_J = T_A + P\, R_{\theta JA}` },
				{ p: r`A current source drops most of the supply across itself. 1 mA from a 300 V line is 0.3 W; with $R_{\theta JA} = 132$ °C/W for the DN2540 in TO-92, that is 40 °C above the room. The datasheet's 1.0 W assumes the case held at 25 °C. In free air at 25 °C the TO-92 takes about 0.95 W before the junction reaches its 150 °C limit.` },
				{ p: r`The breadboard trap is the gate tied to the source with nothing in series. A DN2540 then passes at least 150 mA, past its 120 mA continuous rating, and across a 15 V supply that is at least 2.25 W, more than twice what the package can shed.` }
			]
		},
		{
			title: 'A start-up supply straight from a high-voltage line',
			body: [
				{ p: r`The controller of an off-line switching supply needs power before the converter runs. A depletion MOSFET current source between the rectified line and the controller's supply capacitor charges it at a fixed current whatever the line voltage:` },
				{ eq: r`t = \frac{C\, \Delta V}{I_D}` },
				{ p: r`1 mA charges a 10 µF capacitor to 12 V in 120 ms, and costs 0.3 W from a 300 V line. A resistor in its place would be sized for the lowest line voltage and would pass, and waste, more at the highest. Once the converter supplies its own controller, the start-up current is only heat: a design that minds the 0.3 W pulls the gate to -5 V or beyond, well past $V_{GS(off)}$, to switch it off. The DN2540 lists power supply circuits among its applications.` },
				{ note: 'A rectified mains line is lethal and has no place on a breadboard. The builds below stay on the ±15 V lab supply.', tone: 'warn' }
			]
		},
		{
			title: 'Off takes a negative gate, with margin',
			body: [
				{ p: r`A normally-closed switch is on with no drive and off when its gate goes below $V_{GS(off)}$: below it for every part of the type, and when hot. $\Delta V_{GS(off)}$ is the datasheet's temperature coefficient:` },
				{ eq: r`V_{GS(off)}(T) = V_{GS(off)}(25\,^{\circ}\mathrm{C}) + \Delta V_{GS(off)} \cdot (T - 25\,^{\circ}\mathrm{C})` },
				{ p: r`A DN2540 at the bad end, -3.5 V with -4.5 mV/°C, needs -3.95 V at 125 °C. The datasheet rates the blocking voltage at $V_{GS} = -5$ V and the off leakage at -10 V, so a design drives the gate to -5 V or beyond, inside the ±20 V gate limit. A resistor from gate to source keeps the switch closed when the drive is gone: on is the default, the opposite of an enhancement MOSFET.` },
				{ p: r`Off, it still conducts backwards through its body diode, from source to drain. Two parts in series with their sources joined, and one gate drive for both, block either polarity, as a switch on an AC signal needs. Normally-on switches and solid-state relays head the DN2540's list of applications.` }
			]
		}
	],

	mistakes: [
		['A gate at 0 V, or left floating, means off.', r`Only an enhancement MOSFET is off at $V_{GS} = 0$, and even there a floating gate can leave it half on. A depletion part is on at $V_{GS} = 0$: with 25 V across it, a DN2540 passes at least 150 mA. A floating gate has no defined voltage, and anywhere above $V_{GS(off)}$ the channel conducts: an undriven depletion MOSFET is treated as on.`],
		['A depletion MOSFET is a JFET under another name.', r`The equations match, but the gate is insulated: it draws at most 100 nA at ±20 V on a DN2540 and may go positive, where a JFET's gate junction would conduct. A positive gate opens the channel further, from 30 Ω max at $V_{GS} = 0$ to 14 Ω max at 10 V on the BSS139I.`],
		[r`At $V_{GS(off)}$ the part blocks.`, r`$V_{GS(off)}$ is a test point where 10 µA still flows (DN2540, $V_{DS} = 25$ V). The datasheet rates blocking at -5 V, and the BSS139I rates its off leakage at -3 V against a worst threshold of -2.1 V. A design drives the gate past it with margin.`],
		[r`The datasheet's $I_{DSS}$ is the current a given part passes at $V_{GS} = 0$.`, r`It is only a minimum, with no maximum: 150 mA for the DN2540 at $V_{DS} = 25$ V, 30 mA for the BSS139I at 10 V. A real part passes that or more, by an amount the datasheet leaves open. A current source set by $I_{DSS}$ alone is unpredictable; the source resistor and the part's $V_{GS(off)}$ set the current.`],
		['"Free from thermal runaway" on the datasheet makes any operating point safe.', r`That holds fully on, where $R_{DS(on)}$ rises with heat and the current falls. A current source runs at low current and high $V_{DS}$, where heating lowers the threshold and raises the current. The safe operating area and the dissipation decide, not that sentence.`],
		['An off MOSFET blocks current both ways.', r`The body diode conducts from source to drain whatever the gate does, with up to 1.8 V across it at 120 mA on a DN2540. Blocking both polarities takes two parts in series, sources joined.`]
	],

	variants: [
		{ p: r`**Low-current parts.** Some depletion MOSFETs are built only to limit current. The LND150 (Microchip, TO-92, 500 V) has an $I_{DSS}$ of 1 to 3 mA at $V_{DS} = 25$ V and about 1 kΩ of on-resistance. With its gate tied to its source it is already a current limiter, and a safe one on a ±15 V breadboard: about 3 mA at most, 90 mW across 30 V against its 0.74 W rating. Infineon's BSS126 (SOT-23, 600 V) passes at least 7 mA, with no maximum given, so a defined current still takes a source resistor.` },
		{ p: r`**Few parts, one channel type.** Depletion MOSFETs are a niche. The DN2540 has a single maker, Microchip (ex-Supertex), which also makes the LND150; Infineon makes the BSS139I and BSS126. All are N-channel and built for high voltage at modest current. A P-channel depletion MOSFET exists in principle, solid channel line with the arrow pointing out, but is rarely seen as a discrete part.` },
		{ p: r`**The JFET** is the other normally-on FET: the same law below 0 V, a gate junction that must stay reverse-biased, and a lower voltage rating, 35 V for a J111 against 400 V for the DN2540.` }
	],

	bench: [
		{ p: r`**Meter check.** Shorting the gate to the source for a moment empties the gate. The gate then reads open to both other pins, both ways: it is insulated. The meter's own voltage can leave the gate a few volts negative, enough to close the channel, so the gate is shorted to the source once more. Drain to source then reads a low resistance in both directions, tens of ohms or less, the channel itself; an enhancement MOSFET shows only its body diode there. With a 9 V battery holding the gate 9 V below the source, negative terminal on the gate, the channel closes and the diode range shows the body diode, red lead on the source. The DN2540 in TO-92 is S-G-D, flat face toward the viewer, legs down. The BSS139I is SOT-23 only (pin 1 gate, 2 source, 3 drain), needs an adapter for a breadboard, and is ESD class 0: static under 250 V can damage it.` },
		{ p: r`**First build: a 1 mA current source.** On the +15 V lab supply: the meter on its mA range from +15 V to the drain of a DN2540, 2.2 kΩ from source to ground, gate to ground. The meter reads 0.6 to 1.5 mA depending on the part, and hardly moves as the supply is turned from about 5 V up to 15 V. The voltage across the 2.2 kΩ is the part's own $|V_{GS}|$, a little under its $|V_{GS(off)}|$. At most 23 mW: nothing gets warm.` },
		{ p: r`**Second build: a normally-closed switch.** The same DN2540 with its source on ground, a red LED and 1 kΩ from +15 V to the drain, and 100 kΩ from gate to ground. The LED lights with nothing driving the gate: about 12.7 mA, with 0.2 to 0.3 V from drain to source. A wire from the gate to the -15 V rail ($V_{GS} = -15$ V, inside the ±20 V limit) turns it off, and the drain rises toward 15 V. Removing the wire turns it back on. Without the 1 kΩ and the LED, the same part across 15 V would pass at least 150 mA and burn 2.25 W.` }
	],

	quiz: [
		[r`A DN2540 with $V_{GS(off)} = -2.5$ V and $I_{DSS} = 200$ mA must source 2 mA. What resistor from source to gate, and how hot does it run with 100 V across it?`, r`$R_S = 2.5 \times (1 - \sqrt{2/200}) / 2\ \text{mA} = 1125\ \Omega$; 1.1 kΩ gives 2.04 mA. At 100 V it dissipates 0.2 W, 26 °C above the room in TO-92 (132 °C/W). On a real part the resistor gets trimmed: the square law is a first guess.`],
		[r`A BSS139I has its gate tied to its source and a 1 kΩ load to 12 V. Which region, and what is $V_{DS}$?`, r`Fully on, in the resistor (triode) region: the load allows at most 12 mA, well under the 30 mA minimum $I_{DSS}$. With $R_{DS(on)}$ 12.5 Ω typical and 30 Ω max at $V_{GS} = 0$, $I_D$ is 11.7 to 11.9 mA and $V_{DS}$ 0.15 to 0.35 V. The switch is closed with no gate drive at all.`],
		[r`A normally-closed switch uses a DN2540 and must stay off up to 85 °C. Is a gate drive of -4 V enough?`, r`Barely. The worst part has $V_{GS(off)} = -3.5$ V at 25 °C and moves by up to -4.5 mV/°C: at 85 °C, $-3.5 - 0.0045 \times 60 = -3.77$ V. -4 V clears it by only 0.23 V, and $V_{GS(off)}$ is defined where 10 µA still flows. -5 V or beyond, where the datasheet rates its blocking voltage, is the safe drive.`]
	],

	parts: ['DN2540', 'BSS139I'],
	related: ['n-jfet', 'n-mosfet']
};
