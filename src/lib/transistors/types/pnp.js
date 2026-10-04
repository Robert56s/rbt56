// The PNP bipolar transistor. Content of one page of the transistor guide:
// see src/lib/transistors/types/index.js for what each field is. Strings
// with formulas use String.raw so a LaTeX backslash stays one backslash.
const r = String.raw;

export default {
	slug: 'pnp',
	name: 'PNP bipolar transistor',
	short: 'PNP',
	family: 'bipolar',
	symbol: { name: 'pnp_bipolar_transistor_down', flipY: true, labels: { collector: 'C', base: 'B', emitter: 'E' } },
	control: 'Current drawn out of the base',
	normally: 'off',
	fullyOn: r`A small fixed drop, $V_{EC(sat)}$ of 0.05 to 0.4 V`,
	terminals: [
		['B', 'base'],
		['C', 'collector'],
		['E', 'emitter']
	],
	oneLiner: r`The NPN reversed: a small current drawn out of the base lets a current about $\beta$ times larger flow from emitter to collector.`,
	usedFor: ['High-side switches, with the load tied to ground', 'Current sources that feed a load from the positive rail', 'The lower half of push-pull output stages'],

	howItWorks: [
		{
			p: r`A PNP is the NPN with every layer swapped: a P-type emitter, a very thin N-type base, and a P-type collector. Forward-biasing the emitter-base junction, emitter about 0.65 V above the base, pushes holes (the missing electrons that carry current in P-type silicon) from the emitter into the base. Almost all of them cross it and reach the collector; only a small fraction leave through the base wire. Everything the NPN page says holds, with every voltage and every current reversed.`
		},
		{
			list: [
				r`The emitter is the terminal at the highest voltage. $V_{BE}$ becomes $V_{EB}$ and $V_{CE}$ becomes $V_{EC}$: written this way, both are positive in normal use. $V_{BC}$ becomes $V_{CB}$, negative in the active region and positive in saturation, as $V_{BC}$ is on an NPN.`,
				'Current flows into the emitter and out of the base and the collector.',
				'The arrow on the emitter points in, from the P emitter to the N base, the direction of conventional current through that junction, like a diode arrow. On an NPN it points out.'
			]
		},
		{
			eq: r`I_C = \beta\, I_B \qquad I_E = I_C + I_B = (\beta + 1)\, I_B`,
			intro: r`The currents obey the NPN's equations, each one counted in its real direction: $I_E$ in, $I_B$ and $I_C$ out. $\beta$ is the current gain, written $h_{FE}$ on a datasheet:`
		},
		{
			eq: r`I_C = I_S\, e^{V_{EB}/V_T} \qquad V_{EB} = V_E - V_B`,
			intro: 'The exponential law is the same too, with the emitter-base voltage in place of the base-emitter one:'
		},
		{
			p: r`$I_S$ is a scale current set by the size of the junction. $V_T = kT/q \approx 25.9$ mV at 300 K is the thermal voltage, with $k$ Boltzmann's constant, $T$ the absolute temperature and $q$ the charge of an electron. So $V_{EB}$ sits near 0.65 V, takes about 60 mV more for ten times more current and falls about 2 mV per degree of warming, as on the NPN page. The difference is where the part fits: it conducts when its base is pulled 0.65 V below its emitter, so it works from the top of a circuit, with its emitter on the positive rail.`
		},
		{ h: 'Why PNPs exist' },
		{
			list: [
				r`**High-side switching.** The PNP sits between the positive rail and the load, and the load keeps one end on ground, shared with the rest of the circuit. An NPN in that place is an emitter follower: the load stays one $V_{BE}$ below the base, so the base would need more than the supply to give the load all of it.`,
				'**Current sources that source.** A PNP current mirror hangs from the positive rail and pushes current into a load returned to ground, where an NPN mirror can only pull current out of one.',
				'**Complementary output stages.** An NPN follower sources current well but sinks it only through its emitter resistor. A PNP follower below it does the sinking: the push-pull stage of the design rules below.'
			]
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Emitter-base', 'Collector-base', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff)', r`$V_{EB}$ under about 0.4 to 0.5 V`, 'reverse', 'only leakage flows', 'open switch'],
					['Current source (forward active)', r`$V_{EB}$ about 0.65 V, forward`, 'reverse', r`$I_C = \beta I_B$, nearly independent of $V_{EC}$`, 'amplifier, current source'],
					['Fully on (saturation)', 'forward', 'forward', r`$V_{EC}$ down to 0.05 to 0.4 V, $I_C$ set by the load, $I_C < \beta I_B$`, 'closed switch'],
					['Reverse active', 'reverse', 'forward', 'collector and emitter swap roles, gain near 1', 'rarely']
				]
			}
		},
		{
			note: r`"High" and "low" are measured from the emitter. With the emitter on the positive rail, a base pulled toward 0 V turns the PNP fully on, and only a base brought back to the emitter voltage turns it off. The BJT and MOSFET meanings of "saturation" differ here exactly as on the NPN page.`,
			tone: 'warn'
		},
		{
			more: [
				{ p: r`Changing the sign of every voltage and every current turns the PNP equations into the NPN ones. So a PNP circuit can be worked out as its mirror image: draw it upside down with an NPN, the +12 V rail becoming -12 V, apply the NPN rules, and change the signs of the answers back.` },
				{ p: r`The small-signal model is identical to the NPN's, signs included. A rise of $v_{eb}$ is a fall of $v_{be}$, and the extra current it sends out of the collector is a fall of the current counted into it. Both flip together, so the small-signal model of the NPN page holds unchanged:` },
				{ eq: r`i_c = g_m\, v_{be} \qquad g_m = \frac{|I_C|}{V_T} \qquad r_\pi = \frac{\beta}{g_m}` },
				{ p: r`At $|I_C| = 1$ mA: $g_m = 38.7$ mS and $r_\pi = 2.6$ kΩ for $\beta = 100$, the same numbers as an NPN at the same current.` }
			],
			summary: 'Working out a PNP circuit as an NPN'
		}
	],

	curves: {
		widget: 'bjtCurves',
		props: { vcc: 10, rc: 1000, ib: 20e-6 },
		caption: r`The output curves of a small transistor ($\beta = 150$, Ebers-Moll model), drawn for an NPN. A PNP has the same curves with every voltage and current reversed: the horizontal axis reads $V_{EC}$, the collector current flows out of the collector, and the base current is drawn out of the base. The red line is the load line of $R_C$ on the supply.`
	},

	sims: ['pnp-switch', 'pnp-high-side'],

	rules: [
		{
			title: 'Off means the base back at the emitter, not at 0 V',
			body: [
				{ eq: r`\text{off:} \quad V_{EB} = V_E - V_B < 0.4\ \text{V}` },
				{ p: r`A logic pin can bring the base that close to the emitter only when the pin's own supply is the emitter rail, as in the 5 V switch above. On a 12 V rail a 3.3 V high leaves the base 8.7 V below the emitter on paper. In practice the junction conducts, the base settles one diode drop under 12 V, and through a 2.2 kΩ base resistor about 3.5 mA flows out of the base into the pin and its protection diode. The PNP stays fully on whatever the pin does.` },
				{ p: r`The fix is the circuit of the second simulation, the one Nexperia's load-switch note AN10909 draws. A small NPN, the level shifter (a stage that translates the logic voltage to the rail's), pulls the PNP base down through $R_B$. A pull-up $R_{BE}$ from base to emitter holds the base at the rail whenever the NPN is off. The NPN's collector takes the 12 V, so the logic pin only sees its own voltage, and a logic high turns the load on: the pair does not invert. $R_{BE}$ also gives the charge stored in the base a way out, which speeds the turn-off.` }
			]
		},
		{
			title: r`Sizing a high-side switch: forced beta 10, plus the pull-up`,
			body: [
				{ eq: r`R_B = \frac{V_{CC} - V_{EB(sat)} - V_{CE(sat),\,Q_1}}{I_C / 10 + V_{EB(sat)} / R_{BE}}`, intro: r`$R_B$ carries the base current and the current of the pull-up, and it sees the rail less two drops, the PNP's emitter-base junction and the saturated level shifter $Q_1$:` },
				{ p: r`Example: a 2N3906 switches 50 mA from 12 V. At 50 mA with 5 mA of base current, the datasheet's own test point, it guarantees at most 0.4 V from emitter to collector and 0.95 V from emitter to base. $I_B = 5$ mA, the 10 kΩ pull-up takes $0.95\ \text{V} / 10\ \text{k}\Omega = 0.095$ mA, and with 0.2 V across the NPN, $R_B = (12 - 0.95 - 0.2) / 5.095\ \text{mA} = 2.13$ kΩ. The E12 value 2.2 kΩ draws 4.8 mA out of the base, a forced beta of 10.3: close enough.` },
				{ p: r`The NPN now sinks about 5 mA. At its own forced beta of 10 from a 3.3 V pin, its base resistor is $(3.3 - 0.75) / 0.5\ \text{mA} = 5.1$ kΩ. The PNP dissipates at most $0.4\ \text{V} \times 50\ \text{mA} + 0.95\ \text{V} \times 5\ \text{mA} = 24.8$ mW, a rise of 5 °C at 200 °C/W.` },
				{ p: r`An inductive load, a relay coil or a small motor, needs a flyback diode on the high side too, across the load: anode on ground, cathode on the collector. When the PNP turns off, the coil keeps its current flowing and drives the collector below ground. The diode clamps it one diode drop under 0 V, so the PNP sees about 12.7 V from emitter to collector, well within the 40 V $V_{CEO}$ of the 2N3906.` }
			]
		},
		{
			title: 'PNP or P-MOSFET on the high side',
			body: [
				{ p: 'Both need the same level shifter and pull-up, and both turn on when their control pin goes below the rail. They differ in what it costs to hold them on.' },
				{ eq: r`R_{eq} = \frac{V_{EC(sat)}}{I_C} = \frac{0.4\ \text{V}}{50\ \text{mA}} = 8\ \Omega`, intro: 'Seen from the load, a saturated PNP is a small drop that changes little with current. Divided by the current, it gives an equivalent resistance that holds at that one current:' },
				{ p: r`The ratio is not a constant. The 0.4 V is the 2N3906's limit at 50 mA. At 10 mA with 1 mA of base current its datasheet guarantees at most 0.25 V, or 25 Ω. Five times the current raises the guaranteed drop only from 0.25 V to 0.4 V, so much of the drop is fixed. It behaves like a resistance only at high current, the point AN10909 makes for its low $V_{CE(sat)}$ parts.` },
				{ p: r`The base current costs more than that drop. In the 50 mA example, $12\ \text{V} \times 4.93\ \text{mA} = 59$ mW is drawn from the rail through $R_B$ for as long as the load is on, more than twice the 24.8 mW lost in the transistor. A P-MOSFET's gate draws no steady current; only its pull-up does, 1.2 mA through 10 kΩ on 12 V, or 14 mW.` },
				{ p: r`For a load of tens of milliamps a 2N3906 does the job. For heavier loads the base current grows with the load, its saturation is guaranteed only up to 50 mA and its minimum $h_{FE}$ falls to 30 at 100 mA. A P-MOSFET then takes over, with its $R_{DS(on)}$ read at the gate voltage the circuit really gives it: the P-MOSFET page covers real parts and their gate limits.` }
			]
		},
		{
			title: 'Datasheet signs: magnitudes or negative numbers',
			body: [
				{ p: r`onsemi prints the ratings of a 2N3906 as magnitudes: $V_{CEO}$ 40 V, $I_C$ 200 mA. Nexperia prints its PNPs with their signs: the BCM857BS has $V_{CEO} = -45$ V, $I_C = -100$ mA, and $V_{BE}$ typically -650 mV at $I_C = -2$ mA. Both describe the same physics. The signed values follow two rules:` },
				{ eq: r`V_{XY} = V_X - V_Y \qquad I > 0 \text{ when it flows into the pin}` },
				{ p: r`So $V_{BE} = -650$ mV puts the base 0.65 V below the emitter, and $I_C = -2$ mA is 2 mA flowing out of the collector. With the emitter on 12 V the base sits at $12 - 0.65 = 11.35$ V. A design works with magnitudes and keeps the directions on the schematic.` }
			]
		},
		{
			title: 'Push-pull: an NPN pushes, a PNP pulls',
			body: [
				{ p: r`Two followers with their emitters joined drive the load: the NPN on top conducts on the positive half of the signal, the PNP below on the negative half. The 2N3904 and 2N3906 are the small-signal pair for it. With the bases tied together (class B), neither conducts while the input is within about 0.6 V of zero, so the output sits flat for a moment at every zero crossing: crossover distortion.` },
				{ eq: r`V_{bias} \approx V_{BE} \left(1 + \frac{R_1}{R_2}\right)`, intro: r`The fix holds the two bases about two $V_{BE}$ apart (class AB), with two diodes or with a $V_{BE}$ multiplier, a transistor with $R_1$ from collector to base and $R_2$ from base to emitter:` },
				{ p: r`With $R_1 = R_2$ the multiplier gives $2 \times 0.65 = 1.3$ V, and making $R_1$ adjustable sets the idle current. The diodes or the multiplier go on the heatsink of the output transistors, or the idle current climbs about 8 % per degree as they warm. The front page of the guide runs class B and class AB side by side in the simulator.` }
			]
		}
	],

	mistakes: [
		['A PNP high-side switch can be driven straight from a 5 V or 3.3 V pin.', r`Only when the pin's supply is the emitter rail. On a higher rail a logic high still leaves the base far below the emitter: the PNP stays on and base current flows into the pin. The base has to come within about 0.4 V of the emitter, which takes a level shifter.`],
		['0 V on the base turns a PNP off.', 'With the emitter on the positive rail, 0 V on the base turns it fully on. Off is the base at the emitter voltage, and a pull-up from base to emitter keeps it there when the driver lets go.'],
		['A PNP needs a negative supply.', 'It needs its emitter to be the most positive of its three terminals, nothing more. A high-side switch on +12 V has no negative voltage anywhere; the minus signs only appear in some datasheet conventions.'],
		['Current flows into the collector of a PNP, as in an NPN.', 'It flows the other way: in at the emitter, out at the base and the collector. The arrow on the emitter points in, the direction of that current through the emitter-base junction.'],
		['A complementary pair is a matched pair.', 'Complementary means the opposite polarity with similar ratings, not equal parameters. At 50 mA and 5 mA the 2N3906 guarantees 0.4 V of saturation where the 2N3904 guarantees 0.3 V, and its emitter-base junction breaks down at 5 V against 6 V.'],
		['An NPN and a PNP follower tied base to base make a clean push-pull output.', 'Neither conducts while the input is within about 0.6 V of zero: crossover distortion. The bases need about 1.2 V of bias between them.']
	],

	variants: [
		{ p: r`**Complementary pairs** are an NPN and a PNP sold as each other's mirror image, for push-pull stages: 2N3904 and 2N3906, TIP31 and TIP32, 2N3055 and MJ2955, and the TIP120 and TIP125 Darlingtons.` },
		{ p: r`The **Sziklai pair** (complementary feedback pair) is an NPN driving a PNP, the two behaving as one NPN with a gain of $\beta_1 (\beta_2 + 1)$, about 10 100 for two parts of 100. It turns on at one $V_{BE}$, about 0.6 V, where a Darlington needs about 1.2 V. Audio output stages use it because its idle current depends on the cool driver's $V_{BE}$, not on the hot output transistor's.` },
		{ p: r`**Matched PNP pairs** such as the BCM857BS put two PNPs in one SOT363 package, with $V_{BE}$ equal within 2 mV at 2 mA and 5 V: the parts for PNP current mirrors that must copy a current accurately.` }
	],

	bench: [
		{ p: r`**Meter check.** On the diode range, the black (negative) lead on the base this time: 0.6 to 0.7 V to the emitter and to the collector, nothing with the leads swapped, nothing between collector and emitter either way. Readings with the red lead on the base mean an NPN. The 2N3906 has the same E-B-C order as the 2N3904; the BC557's order is on its card.` },
		{ p: r`**First build.** The PNP switch of the first simulation: 2N3906 with its emitter on 5 V, 47 kΩ from base to emitter, 4.7 kΩ from the base to an input wire, and an LED with 330 Ω from the collector to ground. Input on 5 V: the LED is off. Input on 0 V: about 0.9 mA leaves the base, the LED takes about $(5 - 0.1 - 1.8) / 330\ \Omega = 9.4$ mA, and with the red lead on the emitter the meter reads 0.65 to 0.85 V to the base and a fraction of a volt to the collector (the datasheet guarantees 0.25 V at most at 10 mA with 1 mA of base current). A third reading, with the input on 3.3 V, shows the trap of a mismatched logic level (question 2 below).` }
	],

	quiz: [
		[r`A 2N3906 has to switch a 10 mA load on a 12 V rail, with a 2N3904 level shifter and a 10 kΩ pull-up from base to emitter. What base resistor?`, r`Forced beta 10 gives $I_B = 1$ mA. At 10 mA the datasheet gives at most 0.85 V from emitter to base, so the pull-up takes 0.085 mA. With 0.2 V across the NPN, $R_B = (12 - 0.85 - 0.2) / 1.085\ \text{mA} = 10.1$ kΩ, so 10 kΩ.`],
		[r`In the PNP switch (emitter on 5 V, 4.7 kΩ to the base, 47 kΩ from base to emitter), the input comes from a 3.3 V logic pin. Does a logic high turn the LED off?`, r`No. With the junction at 0.65 V the base sits at 4.35 V, so $(4.35 - 3.3) / 4.7\ \text{k}\Omega = 0.22$ mA flows through the base resistor, 0.21 mA of it out of the base once the 47 kΩ takes its 0.014 mA. With $h_{FE} \ge 100$ that allows over 20 mA, and the LED needs 9.4 mA: the transistor stays saturated and the LED fully lit.`],
		[r`A class B push-pull stage, bases tied, gets a sine of 2 V peak. For what fraction of each period does the output sit at zero?`, r`Neither transistor conducts while $|v_{in}| < 0.6$ V, that is while $|\sin \omega t| < 0.3$: $\arcsin 0.3 = 17.5$° on each side of each zero crossing, $4 \times 17.5 / 360 = 19$ % of the period. At 5 V peak it falls to 7.7 %: crossover distortion hurts quiet signals most.`]
	],

	parts: ['2N3906', 'BC557'],
	related: ['npn', 'p-mosfet', 'darlington']
};
