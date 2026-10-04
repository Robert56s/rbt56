// The P-channel enhancement MOSFET. Content of one page of the transistor
// guide: see src/lib/transistors/types/index.js for what each field is.
// Strings with formulas use String.raw so a LaTeX backslash stays one
// backslash.
const r = String.raw;

export default {
	slug: 'p-mosfet',
	name: 'P-channel enhancement MOSFET',
	short: 'P-MOSFET',
	family: 'fet',
	symbol: { name: 'p_channel_e_mosfet_transistor_horz', flipY: true, labels: { drain: 'D', gate: 'G', source: 'S' } },
	control: 'Voltage from gate to source, negative to turn it on',
	normally: 'off',
	fullyOn: r`A resistance $R_{DS(on)}$ at a stated gate voltage: 10 Ω max for a BSS84 at $V_{GS} = -5$ V, $I_D = -0.10$ A`,
	terminals: [
		['G', 'gate'],
		['D', 'drain'],
		['S', 'source']
	],
	oneLiner: r`The N-MOSFET with every polarity reversed: with its source on the positive rail, it conducts from source to drain when its gate is pulled several volts below the source, as far as its datasheet's $R_{DS(on)}$ line asks.`,
	usedFor: ['High-side switches and load switches, with the load tied to ground', 'Reverse-battery protection with a small voltage drop', 'The upper half of CMOS logic, half-bridges and H-bridges'],

	howItWorks: [
		{
			p: r`A P-channel enhancement MOSFET is the N-MOSFET with every layer swapped: a P-type source and drain set into an N-type body, and a gate on a thin insulating oxide above the gap between them. With the gate at the source voltage there is no channel and the part is off: "enhancement" means the gate has to make the channel. Pulling the gate below the source draws holes, the missing electrons that carry current in P-type silicon, to the surface under the oxide. Past the threshold $V_{GS(th)}$ they form a P channel from source to drain. The N-MOSFET page's physics holds, with every voltage and every current reversed, but not its numbers: holes move less easily than electrons.`
		},
		{
			list: [
				'In a discrete part the source is the pin tied to the body. In normal use it is the terminal at the higher voltage, on the positive rail in a high-side switch, and current flows in at the source and out at the drain.',
				r`$V_{GS}$ is negative in use, and so is the threshold: $V_{GS(th)}$ is -0.8 to -2 V on a BSS84 (at $I_D = -1$ mA), -2 to -4 V on an IRF9540 (at -250 µA), both with $V_{DS} = V_{GS}$. Written as $V_{SG} = V_S - V_G$, the drive is a positive number, and the equations below use it that way.`,
				r`The body is tied to the source inside the package, which leaves a **body diode** from drain (anode) to source (cathode). It conducts whenever the drain goes a diode drop above the source, whatever the gate does.`,
				'In the symbol the arrow sits on the body and points out, from the P channel to the N body; on an N-MOSFET it points in. The channel line is broken in three: enhancement, off with no drive.'
			]
		},
		{
			eq: r`I_D = \tfrac{k}{2}\,\big(V_{SG} - |V_{th}|\big)^2 \qquad V_{SD} \ge V_{SG} - |V_{th}|`,
			intro: r`Written with the source-gate and source-drain voltages, both positive in use, the N-MOSFET's square law holds unchanged. In the current-source region:`
		},
		{
			p: r`$I_D$ is the drain current, counted out of the drain. $V_{th}$ is the model's threshold, close to the datasheet's $V_{GS(th)}$. $k = \mu_p C_{ox} W / L$, in A/V², grows with the width $W$ of the channel and the capacitance $C_{ox}$ of the oxide per unit area, and shrinks with the channel length $L$; $\mu_p$ is the mobility of holes, how easily they move. Below the edge $V_{SD} = V_{SG} - |V_{th}|$ the channel is a resistor that the gate sets:`
		},
		{
			eq: r`I_D = k\,\Big[\big(V_{SG} - |V_{th}|\big)\,V_{SD} - \tfrac12\, V_{SD}^2\Big] \qquad R_{DS} \approx \frac{1}{k\,\big(V_{SG} - |V_{th}|\big)}`
		},
		{
			p: r`The second form holds at small $V_{SD}$, the fully-on switch. A datasheet gives that resistance as $R_{DS(on)}$ at one gate voltage: 10 Ω max for a BSS84 at $V_{GS} = -5$ V and $I_D = -0.10$ A, 0.20 Ω max for an IRF9540 at -10 V and -11 A. The further the gate goes below the source, the lower it falls, but the datasheet guarantees it only at the voltage printed next to it.`
		},
		{ h: 'Why a P-channel part costs more' },
		{
			p: r`Holes move less easily than electrons, so on the same die area a P channel has more resistance, up to about twice as much by onsemi's note AND9093. A P part built for the same resistance needs a larger die, with more capacitance. The catalogues show it: Vishay's IRF540 guarantees at most 0.077 Ω with 10 V of gate drive, its P-channel counterpart the IRF9540 at most 0.20 Ω, 2.6 times more, though the two dies need not be the same size. A P part earns its place where its polarity saves a circuit. On the high side its gate only has to go below the rail, a voltage every circuit has. An N part there needs its gate above the rail, which takes an extra supply or a gate driver.`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Source-gate', 'Source-drain', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff)', r`$V_{SG} < |V_{th}|$`, 'positive', 'only leakage flows', 'open switch'],
					['Current source (saturation)', r`$V_{SG} > |V_{th}|$`, r`$V_{SD} \ge V_{SG} - |V_{th}|$`, r`$I_D$ set by $V_{SG}$, nearly independent of $V_{SD}$`, 'amplifier, current source, linear regulator'],
					['Fully on, a resistor (triode, ohmic)', r`well above $|V_{th}|$`, r`$V_{SD} < V_{SG} - |V_{th}|$`, r`a resistance set by $V_{SG}$: $R_{DS(on)}$ at the datasheet's $V_{GS}$`, 'closed switch'],
					['Reverse', 'any', 'negative: the drain above the source', r`the body diode conducts from drain to source; with $V_{SG}$ past the threshold the channel carries the current instead`, 'reverse-battery protection, the freewheeling path of a bridge']
				]
			}
		},
		{
			note: r`On and off are set by the gate voltage measured from the source, not from ground. With the source on a 12 V rail, a gate at 12 V is off and a gate at 0 V is fully on, $V_{GS} = -12$ V. The words clash with the BJT's as on the N-MOSFET page: a FET's "saturation" is its current-source region, the BJT's active region, and the fully-on switch is the triode region, which the simulator's hover calls "linear". Power-MOSFET app notes use "linear mode" for the current-source region instead.`,
			tone: 'warn'
		},
		{
			more: [
				{ p: r`Around an operating point in its current-source region the P-MOSFET is a transconductance, with the N-MOSFET's formulas:` },
				{ eq: r`g_m = k\,\big(V_{SG} - |V_{th}|\big) = \frac{2\, I_D}{V_{SG} - |V_{th}|} = \sqrt{2\, k\, I_D}` },
				{ p: r`The BSS84 datasheet gives it as $g_{FS}$: 0.05 S minimum and 0.6 S typical at -0.10 A, a twelvefold spread that leaves the bias of an amplifier to resistors and feedback, as on every transistor page.` },
				{ p: r`Temperature moves the two numbers a switch depends on. $R_{DS(on)}$ rises: the BSS84's maximum goes from 10 Ω at 25 °C to 17 Ω at 125 °C. The threshold's magnitude falls, so a hot part turns on with less gate drive and stays off with less margin. In the current-source region the falling threshold can win: below the zero-temperature-coefficient point, where a datasheet's hot and cold transfer curves cross, heating raises the current. Linear use, such as the pass element of a regulator, takes a part rated for it (Nexperia AN50006).` },
				{ p: r`In an IC the body is not always at the source. The CD4007UB ties every P substrate to $V_{DD}$, so a P transistor whose source sits below $V_{DD}$ has its body above its source, and its threshold magnitude grows: the body effect.` }
			],
			summary: 'Small-signal model and temperature'
		}
	],

	curves: {
		widget: 'fetTransfer',
		props: { channel: 'p' },
		caption: r`Drain current against gate-source voltage for three P-channel FETs, with 10 V from source to drain. The P-MOSFET of this model (threshold -2 V, $k = 5$ mA/V²) is off from 0 V down to -2 V, then grows with the square of the excess: about 11 mA at -4 V, 44 mA at -6 V. The P-JFET and the depletion part conduct at 0 V and turn off when the gate goes a few volts above the source. The plot shows the size of the current, which flows out of the drain.`
	},

	sims: ['pmos-high-side', 'reverse-polarity', 'cmos-inverter'],

	rules: [
		{
			title: 'A high-side switch: a pull-up to the source, a level shifter to pull the gate down',
			body: [
				{ p: r`The source goes on the rail, the drain to the load, and the load's other end to ground. A resistor $R_{GS}$ from gate to source holds $V_{GS} = 0$, off, whenever nothing drives the gate. A small N-MOSFET or NPN, the level shifter (a stage that translates the logic voltage to the rail's), pulls the gate toward 0 V to turn the switch on. The logic pin only drives the shifter, so it never sees the rail, and a logic high turns the load on: the pair does not invert. The first simulation is this circuit.` },
				{ eq: r`\text{off: } V_{SG} \approx 0 \qquad \text{on: } V_{SG} \ge |V_{GS}| \text{ of the } R_{DS(on)} \text{ line}`, intro: 'The two states, read on the datasheet:' },
				{ p: r`A pin wired straight to the gate works only when its supply is the rail the source sits on. On a 12 V rail a 3.3 V logic high leaves $V_{GS} = 3.3 - 12 = -8.7$ V: the switch stays fully on, and the pull-up pushes $(12 - 3.3)\ \text{V} / 10\ \text{k}\Omega = 0.87$ mA into the pin. With the shifter, a 10 kΩ pull-up costs $12\ \text{V} / 10\ \text{k}\Omega = 1.2$ mA, or 14 mW, only while the load is on. onsemi's load-switch note AND9093 gives 1 to 10 kΩ for it; a smaller value charges the gate back to the source faster at turn-off.` },
					{ p: r`The pull-up also sets how fast the switch turns off: the gate charge $Q_G$ has to flow back through it, so the edge lasts about $t \approx Q_G\, R_{GS} / V_{SG}$. An IRF9540N (97 nC max at $V_{GS} = -10$ V and $V_{DS} = -80$ V) with 10 kΩ and 10 V of drive takes about 100 µs, a tenth of every period of a 1 kHz PWM, spent half on and heating. A load switched now and then does not notice; PWM takes a smaller pull-up or a push-pull gate driver.` },
				{ p: r`An inductive load, a relay coil or a small motor, needs a flyback diode across it on the high side too: anode on ground, cathode on the drain. At turn-off the coil keeps its current flowing and drives the drain below ground; the diode clamps it one diode drop under 0 V.` }
			]
		},
		{
			title: r`The gate limit: $|V_{GS}|$ of 20 V on most parts`,
			body: [
				{ p: r`The gate oxide is thin. The BSS84 and the IRF540N allow ±20 V from gate to source, the logic-level IRLZ44N only ±16 V, and Nexperia notes that the oxide's life shortens with gate voltage and temperature (AN11158). A level shifter that pulls the gate to 0 V gives $V_{GS} = -V_{rail}$: fine on 12 V, past the limit on 24 V.` },
				{ eq: r`V_{SG} = V_{rail}\, \frac{R_2}{R_1 + R_2} \le V_{SG,\,max}`, intro: r`onsemi's fix (AND9093) is a divider. $R_2$ is the pull-up from gate to source, $R_1$ goes in series with the shifter, and the gate stops part of the way down, inside the gate rating $V_{SG,\,max}$:` },
				{ p: r`On a 24 V rail, $R_1 = R_2 = 10$ kΩ gives $V_{SG} = 12$ V, that is $V_{GS} = -12$ V: past the -4 V worst threshold of an IRF9540 and beyond the -10 V at which its $R_{DS(on)}$ is guaranteed. The divider scales with the rail, so a rail sagging to 18 V leaves only $V_{GS} = -9$ V, short of that line.` },
				{ p: r`The common alternative is a zener from gate to source, cathode on the source, with $R_1$ limiting its current: it holds $V_{SG}$ at its own voltage whatever the rail. With a 12 V zener and $R_1 = 4.7$ kΩ on 24 V, $(24 - 12)\ \text{V} / 4.7\ \text{k}\Omega = 2.55$ mA flows, 1.2 mA of it through the 10 kΩ pull-up and 1.35 mA through the zener.` }
			]
		},
		{
			title: r`Conduction loss is $I^2 R_{DS(on)}$: at high current an N part with a driver wins`,
			body: [
				{ eq: r`P = I_D^2\, R_{DS(on)}`, intro: 'Fully on, the switch is a resistor, and its loss grows with the square of the current:' },
				{ p: r`$R_{DS(on)}$ is the maximum at the gate voltage the circuit really gives, and the hot value: silicon parts rise 1.5 to 2.2 times from 25 °C to 125 °C, the BSS84's maximum from 10 Ω to 17 Ω. An IRF9540 switching 2 A at $V_{GS} = -10$ V loses at most $2^2 \times 0.20 = 0.8$ W cold, about 1.6 W hot. Its N-channel counterpart, the IRF540, guaranteed at 0.077 Ω, loses 0.31 W at the same current, 2.6 times less; at 5 A the gap is 5 W against 1.9 W.` },
				{ p: r`These are Vishay's figures for the IRF9540 and the IRF540. The IRF9540N on the card below is a newer part with its own lines, 0.117 Ω max against 0.044 Ω for its complement the IRF540N: the loss is worked out from the card of the part on the bench.` },
				{ p: r`The N part's catch is its gate. On the high side its source rises to the rail with the load, so its gate needs about 10 V above the rail, from a bootstrap capacitor or a charge pump in a gate-driver IC (TI SLUA618). A bootstrap recharges only while the switch is off, so it cannot hold a switch on at 100 % duty without a charge pump. A P-MOSFET needs no extra rail (onsemi AND9093). That makes it the part for load switches at moderate current, and the N-MOSFET with a driver the part for high current and fast PWM.` }
			]
		},
		{
			title: 'Reverse-battery protection: a P-MOSFET placed backwards',
			body: [
				{ p: r`A diode in series with the supply blocks a battery connected backwards, but drops 0.7 to 1 V all the time. A P-MOSFET in the positive line does the same job with a fraction of the drop. It is mounted the other way round from a switch: drain to the battery, source to the load, gate to ground through a resistor, 10 kΩ in the second simulation.` },
				{
					steps: [
						r`Battery the right way round: the body diode, anode on the drain, conducts first and lifts the source to about 11.3 V on a 12 V battery.`,
						r`The gate sits at 0 V, so $V_{GS}$ is about -11 V: the channel turns on and carries the current from drain to source, the reverse of its usual direction. A MOSFET channel conducts both ways once it is on, and with its drop under a diode drop the body diode carries nothing.`,
						r`Battery reversed: the drain sits at -12 V, the body diode is reverse-biased, and the source stays at 0 V, so $V_{GS} = 0$. The part is off and nothing flows.`
					]
				},
				{ eq: r`P_{diode} = V_F\, I \qquad P_{MOSFET} = I^2\, R_{DS(on)}`, intro: 'The gain is in the loss:' },
				{ p: r`At 1 A an IRF9540 drops at most $1\ \text{A} \times 0.20\ \Omega = 0.2$ V and loses 0.2 W, where the 1N4004 of the simulation drops about 0.95 V and loses about 0.95 W. At 2 A it is 0.4 V and 0.8 W against about 1 V and 2 W. The channel's drop has to stay well under a diode drop, or the body diode starts to share the current. A battery above 20 V would take $V_{GS}$ past its limit: the zener of the gate-limit rule then goes from gate to source.` }
			]
		},
		{
			title: 'CMOS: a P on top, an N below, never both on',
			body: [
				{ p: r`A P-MOSFET from the supply and an N-MOSFET to ground, gates tied together as the input and drains tied together as the output, make a CMOS inverter. Input at 0 V: the P is on, the N off, and the output sits at $V_{DD}$. Input at $V_{DD}$: the reverse. At either end no current flows from the supply and the output swings from rail to rail. Between the two both conduct, and a current shoots through from the supply to ground. The switching point $V_M$, with both transistors in their current-source region, is:` },
				{ eq: r`V_M = \frac{V_{Tn} + \sqrt{k_p / k_n}\,\big(V_{DD} - |V_{Tp}|\big)}{1 + \sqrt{k_p / k_n}}` },
				{ p: r`$V_{Tn}$ and $|V_{Tp}|$ are the two thresholds, $k_n$ and $k_p$ the two transistors' $k$. Equal values put $V_M$ at $V_{DD}/2$. Equal sizes do not give equal $k$: with electrons 2.5 times as mobile as holes and thresholds of 1.5 V, $V_M$ falls to 2.27 V on 5 V, so a balanced inverter has a wider P transistor. At $V_M$ the shoot-through current of a balanced pair peaks at:` },
				{ eq: r`I_{peak} = \tfrac{k}{2}\,\Big(\frac{V_{DD}}{2} - V_T\Big)^2` },
				{ p: r`With $k = 1$ mA/V² and $V_T = 1.5$ V that is 0.5 mA on 5 V, 6.1 mA on 10 V and 18 mA on 15 V: three times the supply, 36 times the current. The simulation's transistors have $k = 20$ mA/V² and thresholds of 1.5 V, so its ammeter reads about 10 mA at 2.5 V. A slow input edge spends longer in the middle and costs more, and an input left halfway draws it all the time (TI SCAA035). The CD4007UB brings three N and three P transistors out to their own pins: the part to try this on a breadboard.` },
				{ p: r`The same pair built from power parts is a half-bridge, one switch from each rail to an output. Two half-bridges with a motor between their outputs make an H-bridge: the P of one leg and the N of the other drive the motor one way, the other diagonal drives it the other way. Both transistors of one leg on at once short the supply. So the drive leaves a dead time, both off, between turning one off and the other on. The motor's inductance keeps its current flowing through that gap, through a body diode: the N's from ground, or the P's up to the supply. An H-bridge driver IC handles that timing.` }
			]
		}
	],

	mistakes: [
		['A P-MOSFET high-side switch can be driven straight from a 5 V or 3.3 V pin.', r`Only when the pin's supply is the source rail. On 12 V a 3.3 V logic high leaves $V_{GS} = -8.7$ V, and the switch stays fully on whatever the pin does. A level shifter and a pull-up from gate to source make it work.`],
		['0 V on the gate means off.', r`With the source on the rail, 0 V on the gate is fully on: $V_{GS} = -12$ V on a 12 V rail. Off is the gate at the source voltage.`],
		['The gate draws no current, so it can be left floating.', 'An undriven gate keeps whatever charge it last had, or drifts with leakage and stray coupling, and can settle half on, in the current-source region where the part heats. The pull-up from gate to source is what defines off.'],
		[r`$V_{GS(th)}$ is the voltage that turns the switch on.`, r`It is a test point where a small current flows: -1 mA for the BSS84, with $V_{DS} = V_{GS}$. The BSS84's $R_{DS(on)}$ is guaranteed only at $V_{GS} = -5$ V and the IRF9540's only at -10 V. The gate goes as far below the source as the $R_{DS(on)}$ line asks.`],
		['An off MOSFET blocks current both ways.', r`The body diode conducts from drain to source whatever the gate does, with up to 1.2 V across it at 0.26 A on a BSS84. A switch whose drain is pulled above its rail, by a second supply on the load side, feeds that rail backwards. Reverse-battery protection puts the same diode to use.`],
		['A P-MOSFET is an N-MOSFET with the signs changed, numbers included.', r`The physics flips, the numbers do not. Holes move less easily than electrons: Vishay's IRF9540 guarantees 0.20 Ω where its N counterpart, the IRF540, guarantees 0.077 Ω, both at 10 V of gate drive. For the same resistance a P part needs a larger die, with more capacitance.`]
	],

	variants: [
		{ p: r`**Small through-hole parts.** The BSS84 is surface-mount only. The BS250P (Diodes Inc., -45 V, -230 mA) fits a breadboard directly, but its $R_{DS(ON)}$ is guaranteed only at $V_{GS} = -10$ V, 14 Ω max, and its $V_{GS(TH)}$ reaches -3.5 V, so a 5 V gate swing guarantees nothing.` },
		{ p: r`**Complementary pairs.** The BSS84 is the P-channel complement of the BSS138, the IRF9540 of the IRF540: an N and a P part of similar ratings for push-pull stages and half-bridges. As with the 2N3904 and 2N3906, complementary means the opposite polarity, not matched parameters.` },
		{ p: r`**The N-MOSFET on the high side.** Where the loss or the switching speed matters, high-side switches use an N-MOSFET with a gate driver that lifts its gate above the rail, through a bootstrap capacitor recharged every cycle or a charge pump for a switch held on. A high-side switch IC is the packaged alternative to both.` },
		{ p: r`**CMOS arrays.** The CD4007UB holds three P and three N transistors with their pins brought out, the pairs every CMOS logic gate is built from. The UB version is unbuffered, a single stage, which also lets it work as a linear amplifier.` }
	],

	bench: [
		{ p: r`**Meter check.** On the diode range, red lead on the drain and black on the source: the body diode, a silicon junction drop. Nothing with the leads swapped. An N-MOSFET shows its body diode the other way, red lead on the source. The gate reads open to both other pins, but the meter's own voltage can charge it and turn the channel on, so the gate is shorted to the source for a moment before each reading. A 9 V battery held briefly with its negative terminal on the gate and its positive on the source charges the gate to -9 V, inside the ±20 V limit and past the -4 V worst threshold of an IRF9540: drain to source then reads a low resistance both ways, until the gate is shorted to the source again. The BSS84 is SOT-23 (pin 1 gate, 2 source, 3 drain) and needs an adapter; the IRF9540N's pin order is on its card. Small MOSFET gates are static-sensitive and are handled like CMOS ICs.` },
		{ p: r`**First build: the high-side switch of the first simulation.** On the +15 V rail: a BSS84 on its adapter, or a BS250P (D-G-S with the flat face toward the viewer, read from the datasheet's sketch, so checked with the meter first), with its source on the rail and 10 kΩ from gate to source. A 2N7000 (S-G-D, flat face toward the viewer) has its drain on that gate, its source on ground, 100 kΩ from its gate to ground, and its gate on a 0 or 5 V wire through 100 Ω. The load is a red LED and 1 kΩ from the drain to ground. With the wire at 0 V the gate reads 15 V, $V_{GS} = 0$, and the LED is off. At 5 V the 2N7000 pulls the gate to within about 8 mV of ground (1.5 mA through at most 5.3 Ω), $V_{GS}$ is about -15 V, inside the ±20 V limit, and the LED takes about $(15 - 1.8)\ \text{V} / 1\ \text{k}\Omega = 13$ mA. From source to drain the meter reads a fraction of a volt: at most 0.13 V for a BSS84 (10 Ω max) and 0.18 V for a BS250P (14 Ω max).` },
		{ p: r`**Second build: a CMOS inverter on a CD4007UB.** Pin 14 to +5 V, pin 7 to ground, the input on pin 6 from a potentiometer across the supply, the output on pins 13 and 8 tied together, and the unused gate pins 3 and 10 tied to ground. Never the ±15 V pair: 30 V is past the chip's 20 V absolute maximum, while 0 and +15 V is fine. As the input turns from 0 to 5 V, the output falls from about 5 V to about 0 V around the middle. The datasheet guarantees a valid output only for inputs under 1 V or over 4 V on 5 V: a single unbuffered stage has a gentle slope.` },
		{ p: r`A milliammeter in series with pin 14 reads almost nothing at either end, 0.25 µA at most by the datasheet, and a peak in the middle: the shoot-through current. A square-law estimate from the datasheet's output currents puts it under 1 mA on 5 V and at a few milliamps on 15 V. The datasheet also gives the P and N transistors the same typical output current, 1 mA at 5 V with 0.4 V across: the P transistors are made larger to match the N ones, which puts the switching point near the middle of the supply.` }
	],

	quiz: [
		[r`A BSS84 switches a 50 mA load on a 5 V rail, its gate driven from a 5 V logic pin. What does it drop, worst case, cold and hot?`, r`Logic low gives $V_{GS} = -5$ V, exactly where $R_{DS(on)}$ is guaranteed: at most 10 Ω, so $50\ \text{mA} \times 10\ \Omega = 0.5$ V and 25 mW; a typical part (1.2 Ω) drops 60 mV. At 125 °C the maximum is 17 Ω, or 0.85 V. Logic high gives $V_{GS} = 0$: off. That works only because the pin's supply is the source rail; on a 12 V rail the same pin could not turn it off.`],
		[r`An IRF9540 switches a 24 V rail. The level shifter pulls the gate down through $R_1$, with $R_2 = 10$ kΩ from gate to source. What $R_1$ gives $V_{SG} = 15$ V, and is it safe if the rail rises to 30 V?`, r`$R_2 / (R_1 + R_2) = 15 / 24$, so $R_1 + R_2 = 16$ kΩ and $R_1 = 6$ kΩ. Rounding up to the E12 value 6.8 kΩ keeps the gate on the safe side: $24 \times 10 / 16.8 = 14.3$ V, still past the -10 V line. At 30 V the divider gives $30 \times 10 / 16.8 = 17.9$ V, inside ±20 V. With 5.6 kΩ it would be 19.2 V, with almost no margin. A rail that can rise further gets a zener from gate to source instead.`],
		[r`In reverse-battery protection the P-MOSFET has its drain toward the battery. What happens with a reversed 12 V battery if it is mounted the usual way, source to the battery and drain to the load?`, r`The source sits at -12 V while the load ties the drain toward 0 V. The drain is above the source, so the body diode, anode on the drain, conducts, and the load sees about -11.3 V. The channel is off ($V_{GS} = +12$ V), but the diode alone defeats the protection. Mounted backwards, the reversed battery puts that diode in reverse and $V_{GS}$ at 0.`]
	],

	parts: ['BSS84', 'IRF9540N', 'BS250P', 'CD4007UB'],
	related: ['n-mosfet', 'pnp']
};
