// The NPN bipolar transistor. Content of one page of the transistor guide:
// see src/lib/transistors/types/index.js for what each field is. Strings
// with formulas use String.raw so a LaTeX backslash stays one backslash.
const r = String.raw;

export default {
	slug: 'npn',
	name: 'NPN bipolar transistor',
	short: 'NPN',
	family: 'bipolar',
	symbol: { name: 'npn_bipolar_transistor_down', labels: { collector: 'C', base: 'B', emitter: 'E' } },
	control: 'Current into the base',
	normally: 'off',
	fullyOn: r`A small fixed drop, $V_{CE(sat)}$ of 0.05 to 0.4 V`,
	terminals: [
		['B', 'base'],
		['C', 'collector'],
		['E', 'emitter']
	],
	oneLiner: r`A small current into the base lets a current about $\beta$ times larger flow from collector to emitter.`,
	usedFor: ['Low-side switches for LEDs, relays, small motors', 'Small-signal amplifiers', 'Current sources, mirrors, differential pairs'],

	howItWorks: [
		{
			p: r`An NPN is three layers of silicon: an N-type emitter, a very thin P-type base, and an N-type collector. Forward-biasing the base-emitter junction, about 0.65 V, pushes electrons from the emitter into the base. The base is so thin that almost all of them cross it, and the reverse-biased collector-base junction (collector above base) sweeps them into the collector; only a small fraction leave through the base wire.`
		},
		{
			eq: r`I_C = \beta\, I_B \qquad I_E = I_C + I_B = (\beta + 1)\, I_B`,
			intro: r`So the base current sets a collector current $\beta$ times larger:`
		},
		{
			p: r`$\beta$, written $h_{FE}$ on a datasheet, is between 100 and 300 for a 2N3904 at 10 mA, with only 30 guaranteed at 100 mA. It also changes with temperature and from one part to the next. A circuit that works only for one value of $\beta$ is a fragile circuit.`
		},
		{
			eq: r`I_C = I_S\, e^{V_{BE}/V_T} \qquad V_T = \frac{kT}{q} \approx 25.9\ \text{mV at } 300\ \text{K}`,
			intro: r`Seen from the base-emitter voltage instead, the collector current is exponential, like a diode:`
		},
		{
			p: r`$I_S$, the saturation current, is a tiny scale factor (6.7 fA in the 2N3904 SPICE model). $V_T$ is the thermal voltage: $k$ is Boltzmann's constant, $T$ the absolute temperature and $q$ the electron charge. Ten times more current takes only $V_T \ln 10 \approx 60$ mV more on the base. That is why $V_{BE}$ hardly moves, about 0.6 to 0.72 V from 0.1 mA to 10 mA, and why a design can treat it as a fixed 0.65 V. At a fixed current it also falls by about 2 mV for every degree of warming.`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Base-emitter', 'Base-collector', 'What happens', 'Used as'],
				rows: [
					['Cutoff', r`under about 0.5 V`, 'reverse', 'only leakage flows', 'open switch'],
					['Active', r`about 0.65 V, forward`, 'reverse', r`$I_C = \beta I_B$, nearly independent of $V_{CE}$`, 'amplifier, current source'],
					['Saturation', 'forward', 'forward', r`$V_{CE}$ down to 0.05 to 0.4 V, $I_C$ set by the load, $I_C < \beta I_B$`, 'closed switch'],
					['Reverse active', 'reverse', 'forward', r`collector and emitter swap roles, gain near 1`, 'rarely']
				]
			}
		},
		{
			note: r`"Saturation" means opposite things for a BJT and a MOSFET. In a BJT it is the fully-on switch, with almost no voltage across it. A MOSFET's "saturation" is its flat, current-source region, the equivalent of the BJT's active region.`,
			tone: 'warn'
		},
		{
			more: [
				{ p: r`Around an operating point in the active region the transistor behaves, for small signals, like a controlled current source. Four numbers describe it: the transconductance $g_m$, the resistance $r_e$ seen looking into the emitter, the resistance $r_\pi$ seen looking into the base, and the output resistance $r_o$. The first two follow from the current alone, $r_\pi$ also needs $\beta$, and $r_o$ needs the Early voltage $V_A$:` },
				{ eq: r`g_m = \frac{I_C}{V_T} \qquad r_e = \frac{V_T}{I_E} \approx \frac{1}{g_m} \qquad r_\pi = \frac{\beta}{g_m} \qquad r_o = \frac{V_A}{I_C}` },
				{ p: r`At $I_C = 1$ mA: $g_m = 38.7$ mS, $r_e \approx 26\ \Omega$, $r_\pi = 2.6$ kΩ for $\beta = 100$, and with $V_A \approx 74$ V (the 2N3904 SPICE model) $r_o \approx 74$ kΩ. The gain of a common-emitter stage or a follower is then a ratio of resistors to $r_e$.` }
			],
			summary: 'Small-signal model'
		}
	],

	curves: {
		widget: 'bjtCurves',
		props: { vcc: 10, rc: 1000, ib: 20e-6 },
		caption: r`The output curves a curve tracer draws, from the Ebers-Moll model of a small NPN ($\beta = 150$). The red line is the load line of $R_C$ on $V_{CC}$: the transistor can only sit where its curve crosses it.`
	},

	sims: ['npn-switch', 'npn-ce-amp', 'npn-follower'],

	rules: [
		{
			title: r`A saturated switch: a base current of $I_C / 10$`,
			body: [
				{ p: r`To be sure the transistor saturates whatever its $\beta$, the base gets about a tenth of the collector current: a "forced beta" of 10, which is also the ratio the 2N3904 and PN2222A datasheets test $V_{CE(sat)}$ at (the BC547 sheet uses 20).` },
				{ eq: r`R_B = \frac{V_{drive} - V_{BE(sat)}}{I_C / 10}` },
				{ p: r`A 2N3904 switching 100 mA from 5 V logic: $I_B = 10$ mA and $V_{BE(sat)} \approx 0.9$ V, read off the typical curve at 100 mA (the table guarantees values only up to 50 mA), so $R_B = (5 - 0.9) / 10\ \text{mA} = 410\ \Omega$, 390 Ω in the E12 series. 10 mA is a lot for a logic pin. A forced beta of 20 halves it (820 Ω) at the cost of margin when cold, and a Darlington, a ULN2003 or a logic-level MOSFET needs far less drive.` }
			]
		},
		{
			title: 'An inductive load needs a flyback diode',
			body: [
				{ p: r`A relay coil, a solenoid or a motor keeps its current flowing when the transistor turns off, and the collector flies far above the supply until something breaks down. A diode across the coil, cathode to the supply, gives that current a path and clamps the collector one diode drop above the supply.` },
				{
					eq: r`v = L\,\frac{di}{dt} \qquad E = \tfrac{1}{2} L I^2 \qquad \tau = \frac{L}{R_{coil}}`,
					intro: r`The coil's inductance $L$ sets the voltage $v$ it makes when its current $i$ changes, the energy $E$ it stores at a current $I$, and the time constant $\tau$ of the current dying away through its own resistance $R_{coil}$:`
				},
				{ p: r`A 5 V relay coil of 100 Ω and 100 mH carries 50 mA. Cut off in 50 ns, the maximum fall time of a 2N3904, it would need $0.1 \times 0.05 / 50\ \text{ns} = 100$ kV to keep that current flowing. The transistor is rated 40 V ($V_{CEO}$) and breaks down long before, and the 0.125 mJ stored in the coil ends up in its junction at every turn-off. With the diode the collector stops one diode drop above 5 V, and the current dies away with $\tau = 0.1\ \text{H} / 100\ \Omega = 1$ ms.` }
			]
		},
		{
			title: 'An amplifier is biased by resistors, not by beta',
			body: [
				{ p: r`A divider sets the base voltage and an emitter resistor $R_E$ turns it into a current: $I_E \approx (V_B - 0.65) / R_E$. With about 1 V across $R_E$ and a divider "stiff" enough, $R_1 \parallel R_2 \le (\beta_{min} + 1) R_E / 10$, the collector current moves by a few percent over a threefold spread of $\beta$.` },
				{ p: r`On the +15 V lab rail, for 1 mA: $R_E = 1.5$ kΩ puts 1.5 V on the emitter and 2.15 V on the base. $R_1 = 56$ kΩ on top and $R_2 = 10$ kΩ below act as 2.27 V in series with 8.5 kΩ, under the 15.2 kΩ limit for $\beta_{min} = 100$. $I_E$ is then 1.024 mA at $\beta = 100$ and 1.062 mA at $\beta = 300$, 3.7 % apart.` },
				{ eq: r`A_v \approx -\frac{R_C}{r_e + R_E}`, intro: 'The gain of the common-emitter stage is then set by resistors too:' }
			]
		},
		{
			title: 'Heat: power times thermal resistance',
			body: [
				{ eq: r`P = V_{CE}\, I_C + V_{BE}\, I_B \qquad T_J = T_A + P\, R_{\theta JA}` },
				{ p: r`A TO-92 part has $R_{\theta JA} \approx 200$ °C/W: 0.5 W already lifts the junction 100 °C above the room, and 0.625 W takes it from 25 °C to its 150 °C limit. A datasheet's derating line (5 mW/°C for the 2N3904) is just $1/R_{\theta JA}$.` }
			]
		},
		{
			title: 'The base-emitter junction breaks down at only 5 to 6 V in reverse',
			body: [
				{ p: r`$V_{EBO}$ is 6 V on a 2N3904. An op-amp output swinging to -13 V on ±15 V rails, driving a base through its resistor, takes the junction into breakdown, which lowers $\beta$ at low current over time. A 1N4148 from emitter (anode) to base (cathode) clamps the reverse voltage near 0.7 V, and the base resistor limits the op-amp current through it.` }
			]
		}
	],

	mistakes: [
		['The base current flows on to the collector.', 'The base current leaves through the emitter. The collector current comes from the collector supply, enabled by the base current; the emitter carries both.'],
		[r`$\beta$ is a design value.`, r`$\beta$ varies two- to threefold between parts of the same number and with current and temperature. A good design depends on resistors and uses $\beta$ only as a minimum.`],
		[r`$V_{BE}$ is exactly 0.7 V.`, r`It runs from about 0.6 V at 0.1 mA to about 0.72 V at 10 mA and drops about 2 mV/°C at a fixed current. 0.65 V is a starting guess, never a constant to subtract precisely.`],
		['Saturation is the most amplification the transistor can give.', r`It is the opposite: in saturation the transistor no longer amplifies, $I_C$ is set by the load and $I_C / I_B$ falls below $\beta$.`],
		['All TO-92 transistors have the same pinout.', 'A 2N3904 is E-B-C seen from the flat face, a BC547 C-B-E, and a TO-92 "2N2222A" can be either: the PN2222A is E-B-C, the P2N2222A C-B-E. The drawing in the datasheet of the exact part number, then a diode-test check, settle it.']
	],

	variants: [
		{ p: r`A **resistor-equipped transistor** (also sold as a digital or pre-biased transistor) has its base resistor, and often a base-emitter resistor, built in: a logic pin drives it directly. Its resistors are only ±30 %, so it is used as a switch, never to bias an amplifier.` },
		{ p: r`**Matched pairs and arrays** put two or more transistors in one package, often on one die, so their $V_{BE}$ match (2 mV at most for a BCM847BS at 2 mA, 0.45 mV typical and 5 mV at most for an LM3046 at 1 mA) and track in temperature: the parts for current mirrors and differential pairs that have to be accurate.` }
	],

	bench: [
		{ p: r`**Meter check.** On the diode range, red lead on the base: 0.6 to 0.7 V to the emitter and to the collector, nothing with the leads swapped, nothing between collector and emitter either way. The base-emitter reading is usually a few millivolts higher than the base-collector one, which tells the emitter from the collector.` },
		{ p: r`**First build.** The LED switch above on a breadboard: 2N3904, 4.7 kΩ to the base, 330 Ω and an LED from 5 V to the collector. Fully on, the meter reads about 0.75 V from base to emitter and under 0.1 V from collector to emitter.` }
	],

	quiz: [
		[r`A 2N3904 has to switch a 50 mA load from a 3.3 V logic pin. What base resistor?`, r`Forced beta 10 gives $I_B = 5$ mA. The datasheet guarantees $V_{BE(sat)} \le 0.95$ V at exactly 50 mA and 5 mA, so $R_B = (3.3 - 0.95) / 5\ \text{mA} = 470\ \Omega$, an E12 value. Check that the pin can source 5 mA.`],
		[r`A transistor with $\beta = 150$ carries $I_C = 12$ mA for $I_B = 1$ mA, with $V_{CE} = 0.1$ V. Which region?`, r`Saturation: $I_C / I_B = 12$ is far below $\beta$ and the collector sits at 0.1 V. The load, not the transistor, sets the current.`],
		['Why does an emitter resistor keep the bias of an amplifier stable?', r`$I_E \approx (V_B - V_{BE}) / R_E$ depends on resistors and on $V_{BE}$, not on $\beta$. With $V_B = 2.15$ V and $R_E = 1.5$ kΩ, $I_E = 1$ mA. Warming by 50 °C takes 0.1 V off $V_{BE}$, and $I_E$ only rises to 1.07 mA. With no $R_E$ and the base held at a fixed voltage, the same 0.1 V would multiply the current by about $e^{0.1/V_T} \approx 48$. The mechanism is negative feedback: if the current rises, the emitter voltage rises and cuts $V_{BE}$.`]
	],

	parts: ['2N3904', 'PN2222A', 'BC547'],
	related: ['pnp', 'darlington', 'n-mosfet']
};
