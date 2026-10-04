// The P-channel JFET. Content of one page of the transistor guide:
// see src/lib/transistors/types/index.js for what each field is. Strings
// with formulas use String.raw so a LaTeX backslash stays one backslash.
const r = String.raw;

export default {
	slug: 'p-jfet',
	name: 'P-channel JFET',
	short: 'P-JFET',
	family: 'fet',
	symbol: { name: 'pjfet_transistor_horz', flipY: true, labels: { drain: 'D', gate: 'G', source: 'S' } },
	control: 'Gate voltage above the source, which turns it off',
	normally: 'on',
	fullyOn: r`A resistance at $V_{GS} = 0$: $r_{DS(on)}$ up to 250 Ω on a J176, with at most 0.1 V across it`,
	terminals: [
		['G', 'gate'],
		['D', 'drain'],
		['S', 'source']
	],
	oneLiner: r`The N-JFET with every polarity reversed: current flows from source to drain while the gate sits at the source voltage, and a gate taken a few volts above the source pinches it off.`,
	usedFor: ['Current sources that feed a load returned to ground', 'Analog switches turned off by a positive gate (J176)', 'The P half of complementary JFET pairs, the JFET version of an NPN and PNP pair'],

	howItWorks: [
		{
			p: r`A P-JFET is a bar of P-type silicon, the channel, with a contact at each end, the source and the drain, and N-type gate regions along its sides. The gate and the channel form a PN junction that is kept reverse-biased, the gate at or above the channel. Raising the gate widens the depletion layer, a region emptied of carriers, which narrows the channel until it closes. It is the N-JFET with every layer swapped: every equation of the N-JFET page holds with every voltage and every current reversed, but the values of real parts do not carry over.`
		},
		{
			list: [
				r`The source is the terminal at the higher voltage. Current flows in at the source and out at the drain, so a datasheet prints $I_{DSS}$ (the drain current with the gate shorted to the source, measured in the flat region: $V_{DS} = -15$ V for a J176) as a negative number.`,
				r`The pinch-off voltage $V_P$, printed $V_{GS(off)}$, is positive: +1.0 to +4.0 V on a J176, measured where only 10 nA still flows. A gate taken that far above the source turns the channel off.`,
				r`$V_{GS} = 0$ gives the full $I_{DSS}$: like every JFET, it is on with nothing on its gate.`,
				'The gate must not go more than about 0.5 V below the source or the drain. Past that the junction is forward-biased and current flows out of the gate pin.',
				r`Reverse-biased, the gate draws only leakage: at most 1 nA on a J176 at $V_{GS} = 20$ V, and 5 nA on a 2N5460 at 20 V and 25 °C, which grows to 1 µA at 100 °C.`,
				'The arrow on the gate points out, from the P channel to the N gate. On an N-JFET it points in.'
			]
		},
		{
			eq: r`I_D = I_{DSS} \left(1 - \frac{V_{GS}}{V_P}\right)^2 \qquad 0 \le V_{GS} \le V_P, \quad V_{SD} \ge V_P - V_{GS}`,
			intro: r`Shockley's law holds unchanged, with $V_{GS} = V_G - V_S$ and $V_{SD} = V_S - V_D$, both positive in use. $V_{GS}$ and $V_P$ have the same sign, so their ratio is the same as on an N part, and $I_D$ and $I_{DSS}$ are sizes of currents, counted out of the drain:`
		},
		{
			p: r`With the part of the simulation further down, $I_{DSS} = 3$ mA and $V_P = 1.5$ V, a gate 0.75 V above the source gives $3\ \text{mA} \times (1 - 0.5)^2 = 0.75$ mA. That holds only while $V_{SD}$ stays above $V_P - V_{GS}$. Below it the channel is in the ohmic region, and the current depends on $V_{SD}$ too:`
		},
		{
			eq: r`I_D = \frac{I_{DSS}}{V_P^2} \left[ 2 (V_P - V_{GS})\, V_{SD} - V_{SD}^2 \right] \qquad 0 \le V_{SD} \le V_P - V_{GS}`
		},
		{
			p: r`The two laws give the same current at $V_{SD} = V_P - V_{GS}$. For a small $V_{SD}$ the squared term drops out, and the channel is a resistor set by the gate:`
		},
		{
			eq: r`r_{DS} = \frac{r_{DS0}}{1 - V_{GS}/V_P} \qquad r_{DS0} = \frac{V_P}{2\, I_{DSS}}`
		},
		{
			p: r`$r_{DS0}$ is the resistance at $V_{GS} = 0$ with a small $V_{SD}$, the $r_{DS(on)}$ of a datasheet. A J176 at the corner of its limits, $V_P = 1$ V and $I_{DSS} = 2$ mA, gives exactly its guaranteed maximum, 250 Ω. By the same law a part with $V_P = 4$ V meets it only with 8 mA or more.`
		},
		{ h: 'Why P-channel JFETs are rarer' },
		{
			p: r`Holes, the missing electrons that carry current in P-type silicon, move less easily than electrons. For the same size a P channel conducts about half as well as an N channel (Siliconix AN101): less $I_{DSS}$ and more $r_{DS(on)}$. Matching an N part takes a larger die, and with it more capacitance. The catalogues show it. The N-channel J113 and the J176 both guarantee at least 2 mA of $I_{DSS}$, but the J113 guarantees at most 100 Ω and the J176 at most 250 Ω, both at $V_{GS} = 0$ with at most 0.1 V across the channel. The current J176 datasheet from onsemi (January 2026) no longer lists the J175 and J177. Most JFET circuits use N parts. A P part earns its place where the polarity matters:`
		},
		{
			list: [
				'**Current sources hung from the positive rail.** With source and gate on the rail, it pushes current into a load returned to ground: the N-JFET current source turned upside down, and the simulation further down.',
				'**Analog switches.** A J176 turns off with its gate taken above the signal. A signal that stays between ground and a few volts can then be switched with one positive supply (design rules).',
				r`**Complementary pairs.** An N part and a P part with similar ratings, such as the 2N5457 and the 2N5460, are the JFET version of the NPN and PNP pair, for circuits that need both polarities.`
			]
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Gate-source', 'Source-drain', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff)', r`$V_{GS} \ge V_P$`, 'any', 'only leakage flows', 'open switch'],
					['Current source (saturation)', r`$0 \le V_{GS} < V_P$`, r`$V_{SD} \ge V_P - V_{GS}$`, r`$I_D = I_{DSS}(1 - V_{GS}/V_P)^2$, nearly independent of $V_{SD}$`, 'current source, amplifier'],
					['Resistor (ohmic, triode)', r`$0 \le V_{GS} < V_P$`, r`$V_{SD} < V_P - V_{GS}$`, r`a resistance $r_{DS}$ set by $V_{GS}$`, 'closed switch, voltage-controlled resistor'],
					['Gate conducting', r`$V_{GS}$ below about -0.5 V`, 'any', 'the gate junction is forward-biased, current flows out of the gate', 'never on purpose']
				]
			}
		},
		{
			note: r`A JFET's "saturation" is its current-source region, the BJT's active region, and the simulator's hover reads saturation there. The BJT's saturation, the closed switch, is the JFET's ohmic region. On a P part "off" means the gate high, at least $V_P$ above the source, and "fully on" means the gate at the source voltage, never below it.`,
			tone: 'warn'
		},
		{
			more: [
				{ p: r`For small signals the P-JFET follows the same equations as the N-JFET, with $V_{GS}$ and $V_P$ both positive. Its transconductance, the change of drain current per volt on the gate, follows from Shockley's law:` },
				{ eq: r`g_m = \frac{2\, I_{DSS}}{V_P} \left(1 - \frac{V_{GS}}{V_P}\right) = g_{m0} \sqrt{\frac{I_D}{I_{DSS}}} \qquad g_{m0} = \frac{2\, I_{DSS}}{V_P} = \frac{1}{r_{DS0}}` },
				{ p: r`The simulation's part has $g_{m0} = 4$ mS, and 2 mS at 0.75 mA. A 2N5460 guarantees 1 to 4 mS at $V_{GS} = 0$ ($|y_{fs}|$ of 1000 to 4000 µmhos at 15 V and 1 kHz). The N-JFET page turns these into the gain of a stage.` },
				{ p: r`The drain current does not change with temperature at one bias point, $V_{GS} \approx V_P - 0.65$ V (Siliconix AN103), where Shockley's law gives $I_D \approx I_{DSS} (0.65 / V_P)^2$. For the simulation's part that is $V_{GS} = 0.85$ V and 0.563 mA, set by a source resistor of $0.85\ \text{V} / 0.563\ \text{mA} = 1.51$ kΩ.` }
			],
			summary: 'Small-signal model and temperature'
		}
	],

	curves: {
		widget: 'fetTransfer',
		props: { channel: 'p' },
		caption: r`Drain current against gate-source voltage for three P-channel FETs, with 10 V from source to drain. The P-JFET of this model ($I_{DSS} = 10$ mA, $V_P = +3$ V, with a current that rises 1 % per volt of $V_{SD}$, so 11 mA at 10 V) conducts at $V_{GS} = 0$ and is off from +3 V up; its curve stops at -0.5 V, where the gate junction conducts. The plot shows the size of the current, which flows out of the drain. The N-channel button draws the same curves mirrored.`
	},

	sims: ['pjfet-current-source'],

	rules: [
		{
			title: r`A current source into a grounded load: gate tied to the source, or $R_S$`,
			body: [
				{ eq: r`V_{SD} = V_{DD} - I_{DSS}\, R_L \ge V_P`, intro: r`With gate and source on the positive rail $V_{DD}$, the P-JFET passes $I_{DSS}$ into a load $R_L$ returned to ground, as long as it stays in its current-source region:` },
				{ p: r`The simulation's part (3 mA, $V_P = 1.5$ V) holds 3 mA into 1 kΩ from 4.5 V of supply up. At 4 V it has slipped to 2.84 mA and at 3 V to 2.25 mA: the channel has become a resistor. Siliconix (AN103) asks for $V_{SD}$ at least 1.5 times $V_P$ for a flat current, 2.25 V here, so on 12 V the load can be up to $(12 - 2.25)\ \text{V} / 3\ \text{mA} = 3.25$ kΩ. A real part is less flat than the simulation's: the 2N5460 allows an output admittance $|y_{os}|$ of up to 75 µS at 15 V, $V_{GS} = 0$ and 1 kHz, so its current may still rise by up to 75 µA for each volt more across it.` },
				{ eq: r`R_S = \frac{V_P \left(1 - \sqrt{I_D / I_{DSS}}\right)}{I_D}`, intro: r`For less than $I_{DSS}$, a resistor $R_S$ goes from the rail to the source and the gate stays on the rail. The current through $R_S$ drops the source below the gate, so $V_{GS} = I_D R_S$, positive as a P part needs. With Shockley's law:` },
				{ p: r`For 1 mA from the simulation's part, $R_S = 1.5\ \text{V} \times (1 - \sqrt{1/3}) / 1\ \text{mA} = 634\ \Omega$. The current holds while the drain stays at least $V_P$ below the gate, $V_{DD} - I_D R_L \ge V_P$, the condition above with $I_D$ in place of $I_{DSS}$: on 12 V, 1 mA allows up to $(12 - 1.5)\ \text{V} / 1\ \text{mA} = 10.5$ kΩ of load. Real parts spread widely: a 2N5460 has $I_{DSS}$ from 1 to 5 mA at 15 V and $V_P$ from 0.75 to 6 V at 1 µA, and with 1 kΩ the corners of those limits give 0.32 to 2.1 mA. AN103 suggests sorting parts by $I_{DSS}$ or trimming $R_S$.` }
			]
		},
		{
			title: r`Dissipation: the current times the voltage across it`,
			body: [
				{ eq: r`P = I_D\, V_{SD} \qquad T_J = T_A + P\, R_{\theta JA}` },
				{ p: r`A J176 has an $I_{DSS}$ of 2 to 25 mA. Gate tied to source with 15 V across it, a 25 mA part dissipates $25\ \text{mA} \times 15\ \text{V} = 375$ mW, over its 350 mW rating, which holds at 25 °C and falls by 2.8 mW per °C above it. $T_J$ is the junction temperature, $T_A$ the temperature of the air around the part, and $R_{\theta JA}$ the thermal resistance from junction to air: with 357 °C/W, 350 mW alone means a rise of 125 °C. A 1 kΩ source resistor brings the corners of its limits down to 0.5 to 2.7 mA. A load resistor caps it too: with 1 kΩ in the drain on 15 V, the JFET never dissipates more than $15^2 / (4 \times 1\ \text{k}\Omega) = 56$ mW.` }
			]
		},
		{
			title: r`An analog switch: $V_{GS} = 0$ to close it, the gate 4 V above the signal to open it`,
			body: [
				{ p: r`Closed, the J176 is a resistor of at most 250 Ω, guaranteed at $V_{GS} = 0$ with under 0.1 V across it. Into a 10 kΩ load that costs 2.4 % of the signal, $250 / 10\,250$, as long as the channel stays under 0.1 V. At the 5 V peaks of the signal below, a corner part ($V_P = 1$ V, $I_{DSS} = 2$ mA) has 0.13 V across it, and the square law gives 2.6 %. Open, its gate has to sit at least $V_{GS(off)}$ above both source and drain, and $V_{GS(off)}$ is up to 4 V:` },
				{ eq: r`V_{G,\,off} \ge V_{sig,\,max} + 4\ \text{V} \qquad V_{G,\,on} = V_{sig}` },
				{ p: r`For a signal from -5 to +5 V the gate needs at least 9 V. A TL082 on ±15 V rails is guaranteed to swing its output only to ±10 V into 2 kΩ or more. Through a 1N4148 with its anode on the op-amp, which drops about 0.7 V, it puts the gate at 9.3 V or more when high. That is at least 4.3 V above the top of the signal, enough for every J176. Even with the output at the 15 V rail, the gate stays under 20 V above the bottom of the signal, inside the J176's 30 V gate-source and drain-gate ratings. When the output goes low the diode turns off, and a resistor from gate to source brings $V_{GS}$ back to 0. That low level must not sit above the lowest signal voltage, or the diode conducts again and lifts the gate above the signal.` },
				{ p: r`This is where the P part wins. A signal from 0 to +5 V needs only one supply: a driver going from 0 V to at least 10 V, through the diode, opens and closes the J176. An N-JFET such as the J111, with $V_{GS(off)}$ down to -10 V, needs its gate 10 V below the lowest signal, which takes a negative rail. A signal that swings below ground, like the one above, needs a negative rail with either part, for the low level of the driver.` }
			]
		},
		{
			title: 'Datasheet signs: read them as magnitudes',
			body: [
				{ eq: r`V_{XY} = V_X - V_Y \qquad I > 0 \text{ when it flows into the pin}`, intro: 'A datasheet that prints signs follows two rules:' },
				{ p: r`onsemi prints the J176 that way: $I_{DSS} = -2$ to $-25$ mA at $V_{DS} = -15$ V, and $V_{GS(off)} = +1.0$ to $+4.0$ V at $I_D = -10$ nA. So the current flows out of the drain, the drain sits 15 V below the source (at 0 V with the source on 15 V), and the gate sits above the source to cut it off. The 2N5460 datasheet mixes conventions: it prints $V_{DS} = 15$ V next to a negative $I_{DSS}$. A design works with magnitudes, puts the source on the higher rail and keeps the directions on the schematic.` }
			]
		}
	],

	mistakes: [
		['A P-JFET turns off with a negative gate, like an N-JFET.', r`It turns off with a positive one: $V_{GS(off)}$ is +1.0 to +4.0 V on a J176. A gate more than about 0.5 V below the source forward-biases the junction instead.`],
		['0 V from gate to source means off.', r`$V_{GS} = 0$ is where a JFET conducts its full $I_{DSS}$. Off takes the gate at least $V_{GS(off)}$ above the source.`],
		['The further the gate goes below the source, the harder the P-JFET turns on.', r`Only for the first few tenths of a volt, where Shockley's law still rises past $I_{DSS}$: the transfer curve further up stops at -0.5 V. About 0.5 V below the source the gate junction starts to conduct: current flows out of the gate and the input loses its high impedance. A design takes $V_{GS} = 0$ as fully on. The forward gate current is limited to 50 mA on a J176 and 10 mA on a 2N5460.`],
		['A P-JFET is an N-JFET with the signs changed, numbers included.', r`The polarities flip, the numbers do not. Holes conduct about half as well as electrons, so a P part has less $I_{DSS}$ and more $r_{DS(on)}$ for its size: with the same 2 mA minimum of $I_{DSS}$, the J176 guarantees 250 Ω where the N-channel J113 guarantees 100 Ω.`],
		['A 2N5460 has one pinout.', r`Seen from the flat face, legs down, onsemi's is S-D-G and Central's D-S-G. The gate stays at the same end and only drain and source swap, which a symmetric JFET tolerates, but the labels of a layout no longer match. The 2N5457, its N-channel complement, is D-S-G, and the J176 has its gate in the middle.`]
	],

	variants: [
		{ p: r`**Complementary pairs.** The 2N5457 (N) and 2N5460 (P) are each other's mirror image: both 1 to 5 mA of $I_{DSS}$, a cutoff voltage of up to 6 V, and at least 1 mS of transconductance. As with the 2N3904 and 2N3906, complementary means the opposite polarity with similar ratings, not matched parameters.` },
		{ p: r`**Surface-mount versions.** The MMBFJ176 is the J176 in SOT-23, with another pin order: 1 drain, 2 source, 3 gate, against 1 drain, 2 gate, 3 source on the TO-92. The TO-92 J176 is sold with pre-formed legs (J176-D74Z), so the pitch needs checking before it goes into a breadboard.` }
	],

	bench: [
		{ p: r`**Meter check.** On the diode range, the black (negative) lead on the gate: a silicon junction drop, about 0.6 to 0.7 V, to the source and to the drain, nothing with the leads swapped. That is the N gate and the P channel; an N-JFET reads with the red lead on the gate. Between source and drain the meter reads the same value both ways, a resistance rather than a diode, because the channel conducts with no gate voltage. A PNP also reads with the black lead on its base but shows nothing from collector to emitter, which tells the two apart. The meter cannot tell source from drain; on a J176 they are interchangeable.` },
		{ p: r`**First build.** The current source of the simulation on the +15 V lab rail: a 2N5460 with gate and source on +15 V, the meter on its milliamp range from the drain to a 1 kΩ resistor, and the resistor to ground. The meter reads the part's own $I_{DSS}$, somewhere from 1 to 5 mA. With 1 kΩ in the drain on 15 V the JFET never dissipates more than 56 mW. Then a second 1 kΩ goes between the rail and the source, the gate staying on the rail: the current drops, and the voltage across that resistor is $V_{GS}$, positive. The two readings give the part's own $V_P$:` },
		{ eq: r`V_P = \frac{V_{GS}}{1 - \sqrt{I_D / I_{DSS}}}` },
		{ p: r`A part like the simulation's, 3 mA and 1.5 V, reads 0.75 mA and 0.75 V with the source resistor: $0.75\ \text{V} / (1 - \sqrt{0.75 / 3}) = 1.5$ V.` }
	],

	quiz: [
		[r`A P-JFET with $I_{DSS} = 4$ mA and $V_P = 2$ V has to source 1 mA into a grounded load from +12 V. What source resistor, and where does the gate go?`, r`$V_{GS} = V_P (1 - \sqrt{I_D / I_{DSS}}) = 2\ \text{V} \times (1 - 0.5) = 1$ V, so $R_S = 1\ \text{V} / 1\ \text{mA} = 1$ kΩ, from +12 V to the source. The gate goes to +12 V: the source sits at 11 V, 1 V below its gate.`],
		[r`A J176 switches a signal that swings from -5 V to +5 V. What gate voltage opens the switch for every J176, and what must the gate do to close it?`, r`$V_{GS(off)}$ is at most 4 V, so the gate needs at least $5 + 4 = 9$ V. To close it the gate comes back to the signal's own voltage, $V_{GS} = 0$, not to 0 V: with the signal at +5 V a gate on 0 V would sit 5 V below the source, and the junction would conduct.`],
		[r`The simulation's P-JFET ($I_{DSS} = 3$ mA, $V_P = 1.5$ V), gate tied to source, feeds 1 kΩ to ground. Is it still a current source on a 5 V supply? On 4 V?`, r`At 3 mA the load takes 3 V. On 5 V that leaves $V_{SD} = 2$ V, above $V_P = 1.5$ V: still 3 mA, though under the 2.25 V Siliconix asks for a flat current. On 4 V, 3 mA would leave only 1 V: the channel is in its ohmic region and the current settles at 2.84 mA, where $I_D = \frac{2 I_{DSS}}{V_P^2}(V_P V_{SD} - V_{SD}^2 / 2)$ meets the load line.`]
	],

	parts: ['J176', '2N5460'],
	related: ['n-jfet', 'p-mosfet']
};
