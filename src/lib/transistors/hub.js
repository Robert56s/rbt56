// The text of the guide's front page (/tools/transistors/). Blocks follow
// src/lib/components/guides/GuideBlocks.svelte; strings with LaTeX use
// String.raw so a backslash stays one backslash.
const r = String.raw;

export const HUB = {
	start: [
		{
			p: r`A transistor has a control terminal and two power terminals. A small signal on the control terminal sets how much current flows between the two others. That one idea serves two jobs: as a **switch**, the transistor is either fully off or fully on and turns a load on and off; as an **amplifier**, it sits in between, and a small change at the control makes a larger copy at the output.`
		},
		{
			p: r`The kinds differ in what the control is. In a **bipolar** transistor (BJT) a current into the base controls the current from collector to emitter. In a **field-effect** transistor (FET) a voltage on the gate controls a channel between drain and source, and the gate draws almost no current. The rest of the family are combinations and specialists: the IGBT puts a MOSFET gate in front of a bipolar output, GaN and SiC are field-effect transistors in new materials, the UJT is an old timing part.`
		},
		{ h: 'Three questions for any transistor' },
		{
			steps: [
				r`**What turns it on?** A current (BJT) or a voltage (FET, IGBT), and of which polarity, counted from the emitter or the source: N-type parts turn on with a positive control, P-type parts with a negative one.`,
				r`**Is it on or off with nothing on the control?** Most are off. A JFET and a depletion MOSFET conduct until the gate turns them off.`,
				r`**What does fully on look like?** A BJT keeps a small drop, $V_{CE(sat)}$, 0.05 to 0.4 V, that grows with the current. A MOSFET becomes a resistor, $R_{DS(on)}$. An IGBT keeps a knee of about one diode drop plus a little resistance.`
			]
		},
		{ h: 'The same three regions, two vocabularies' },
		{
			table: {
				head: ['What it does', 'BJT name', 'FET name', 'Used as'],
				rows: [
					['Nothing flows', 'cutoff', 'cutoff', 'open switch'],
					['A current set by the control, nearly independent of the output voltage', 'active', 'saturation', 'amplifier, current source'],
					['Fully on: a small drop or a small resistance', 'saturation', 'triode, ohmic, or "linear"', 'closed switch']
				]
			}
		},
		{
			note: r`The word "saturation" names opposite regions in the two families: the fully-on switch for a BJT, the current-source region for a FET. Datasheets and websites mix them up. This guide names a region by what it does, with the textbook name next to it.`,
			tone: 'warn'
		}
	],

	normally: [
		{
			p: r`With the gate at the source voltage, $V_{GS} = 0$, a JFET and a depletion MOSFET already conduct: they are **normally on** and need a gate voltage of the other polarity to turn off. An enhancement MOSFET, like a BJT, is **normally off**. The symbols say it: a solid channel line for normally on, a broken one for normally off.`
		},
		{ widget: 'fetTransfer', props: { channel: 'n' } }
	],

	// "which transistor for the job": one entry per job
	jobs: [
		{
			id: 'logic-small',
			job: 'Switch an LED, a relay or a small load (under 100 mA) from a logic pin',
			pick: 'A small NPN (2N3904) with a base resistor, or a small N-MOSFET (2N7000, BSS138)',
			why: r`The NPN needs about $I_C / 10$ of base current, the MOSFET a gate voltage well above its threshold: check $R_{DS(on)}$ at the gate voltage the pin really gives. A relay coil needs a flyback diode either way.`,
			types: ['npn', 'n-mosfet'],
			parts: ['2N3904', '2N7000'],
			sims: ['npn-switch']
		},
		{
			id: 'logic-big',
			job: 'Switch amperes at low voltage (a motor, an LED strip, a heater) from 3.3 or 5 V logic',
			pick: 'A logic-level N-MOSFET on the low side',
			why: r`Its loss is $I^2 R_{DS(on)}$, a few hundred milliwatts where a BJT or a Darlington would waste watts. "Logic-level" has to mean $R_{DS(on)}$ guaranteed at the gate voltage the pin really gives, 4.5 V or less for a 5 V pin and 2.5 V for a 3.3 V pin, not merely a low $V_{GS(th)}$. The IRLZ44N is guaranteed at 5.0 V and 4.0 V (25 and 35 mΩ), so it suits a 5 V pin, not a 3.3 V one; the AO3400A, guaranteed at 2.5 V (48 mΩ), suits a 3.3 V pin.`,
			types: ['n-mosfet'],
			parts: ['IRLZ44N'],
			sims: ['logic-level', 'nmos-low-side']
		},
		{
			id: 'high-side',
			job: 'Switch the positive supply of a load whose other end is grounded',
			pick: 'A P-MOSFET (or a PNP for small currents) with a small N-type transistor pulling its gate down',
			why: 'When the load rail is above the logic supply, a logic pin cannot pull the gate or base up to that rail, so it cannot turn the high-side P-type part off. A small N-type transistor pulls the gate or base down to turn it on, and a resistor from gate to source (or base to emitter) holds it off.',
			types: ['p-mosfet', 'pnp'],
			parts: ['IRF9540N', '2N3906'],
			sims: ['pmos-high-side', 'pnp-high-side']
		},
		{
			id: 'amplify',
			job: 'Amplify a small signal',
			pick: 'A BJT for gain and predictability; a JFET for a very high-impedance or low-noise source',
			why: r`A BJT gives the most transconductance per milliamp, $g_m = I_C / V_T$, and its stages are set by resistors. A JFET input draws almost no current, 1 nA at most for a J111, at the price of a lower and less predictable gain.`,
			types: ['npn', 'n-jfet'],
			parts: ['2N3904', 'J111'],
			sims: ['npn-ce-amp', 'jfet-amp']
		},
		{
			id: 'current',
			job: 'Make a constant current',
			pick: 'A JFET with its gate on its source, or with a source resistor; a depletion MOSFET for high voltage; a current mirror inside a circuit',
			why: r`A JFET with $V_{GS} = 0$ passes its $I_{DSS}$ as long as $V_{DS}$ stays above about 1.5 times $|V_P|$; below that the channel acts as a resistor. A J111 passes 20 mA or more this way, at least 0.3 W at 15 V against a 350 mW rating, so on a breadboard a source resistor sets a smaller current. The spread of $I_{DSS}$ between parts is wide, so a precise current needs trimming or an op-amp.`,
			types: ['n-jfet', 'depletion-mosfet'],
			parts: ['J111', 'DN2540'],
			sims: ['jfet-current-source', 'current-mirror']
		},
		{
			id: 'analog-switch',
			job: 'Vary a resistance with a voltage, or switch an analog signal',
			pick: 'A JFET in its ohmic region, or a CMOS analog switch',
			why: r`For small voltages across it a JFET channel is a resistor set by the gate, $r_{DS} = V_P^2 / (2 I_{DSS} (V_{GS} - V_P))$: 44 Ω at $V_{GS} = 0$ for a part with $I_{DSS} = 25$ mA and $V_P = -2.2$ V, rising toward an open circuit as $V_{GS}$ nears $V_P$. It is the part behind AGC loops, voltage-controlled attenuators and AM modulators.`,
			types: ['n-jfet', 'n-mosfet'],
			parts: ['J111'],
			sims: ['jfet-vcr']
		},
		{
			id: 'light',
			job: 'Sense light, or pass a signal across an isolation barrier',
			pick: 'A phototransistor; an optocoupler for isolation',
			why: 'Light makes base current, and the transistor multiplies it. An optocoupler puts an LED and a phototransistor in one package. Its current transfer ratio spreads between parts and falls with age, so a design uses the minimum.',
			types: ['phototransistor'],
			parts: ['TEPT4400', '4N25'],
			sims: ['phototransistor']
		},
		{
			id: 'power',
			job: 'Switch hundreds of volts and tens of amperes (motor drives, inverters, mains)',
			pick: 'An IGBT at high current and low frequency; a SiC MOSFET at high voltage and higher frequency; GaN up to about 650 V at very high frequency',
			why: 'All need a gate driver and a careful layout, and none belongs on a breadboard. The IGBT drops a fixed knee voltage, which wins at high current; the MOSFETs drop a resistance and switch faster.',
			types: ['igbt', 'gan-sic'],
			parts: [],
			sims: ['igbt-model']
		},
		{
			id: 'timing',
			job: 'Make a slow oscillator or a timing pulse',
			pick: 'A 555 timer today; the UJT relaxation oscillator is how it was done, and still a good lesson',
			why: 'A UJT fires at a fixed fraction of its supply, so its period depends on R and C and hardly on the supply.',
			types: ['ujt'],
			parts: [],
			sims: ['ujt-oscillator', 'multivibrator']
		}
	],

	// the side-by-side table
	compare: {
		head: ['Type', 'Controlled by', 'With no drive', 'Fully on', 'Typical drive', 'Typical range', 'Main trap'],
		rows: [
			['NPN', 'base current', 'off', r`$V_{CE(sat)}$ 0.05 to 0.4 V`, r`0.7 V and $I_C / 10$ into the base`, 'milliamps to about 15 A (a 2N3904 0.2 A, a 2N3055 15 A)', r`$\beta$ spreads threefold`],
			['PNP', 'base current, out of the base', 'off', r`$V_{EC(sat)}$ 0.05 to 0.4 V`, 'base pulled 0.7 V below the emitter', 'as the NPN', 'a logic pin cannot turn off a PNP on a higher rail'],
			['Darlington', 'base current', 'off', r`about 0.7 to 2 V`, r`1.2 to 1.4 V on the base, tiny current`, 'up to several amperes', 'high saturation voltage, heat'],
			['Phototransistor', 'light', 'off', r`$V_{CE(sat)}$, a few tenths of a volt`, 'light on the junction', 'microamps to milliamps', 'slow with a large pull-up'],
			['N-JFET', 'gate voltage, negative', 'on', r`a resistance, tens to hundreds of ohms`, r`$V_{GS}$ between $V_P$ and 0`, 'milliamps', r`$I_{DSS}$ and $V_P$ spread widely`],
			['P-JFET', 'gate voltage, positive', 'on', 'a resistance', r`$V_{GS}$ between 0 and $V_P$`, 'milliamps', 'all signs reversed'],
			['Depletion MOSFET', 'gate voltage, either sign', 'on', r`$R_{DS(on)}$`, r`negative $V_{GS}$ to turn off`, 'milliamps, up to hundreds of volts', 'zero volts on the gate is on'],
			['N-MOSFET', 'gate voltage, positive', 'off', r`$R_{DS(on)}$, milliohms to ohms`, '10 V standard, 4.5 V or 2.5 V logic-level', 'milliamps to hundreds of amperes', r`$V_{GS(th)}$ is not the on voltage`],
			['P-MOSFET', 'gate voltage, negative', 'off', r`$R_{DS(on)}$, higher than an N part of the same size`, r`gate 10 V below the source`, 'up to tens of amperes', 'gate swing must stay within its rating'],
			['IGBT', 'gate voltage, positive', 'off', r`a knee, $V_{CE(sat)}$ 1.5 to 2.5 V`, '15 V on, 0 or negative off', '600 V to kV, tens to hundreds of amperes', 'tail current at turn-off'],
			['GaN, SiC', 'gate voltage', 'off', r`$R_{DS(on)}$`, 'GaN 5 V, with 6 V the absolute maximum; SiC 15 to 20 V, negative off', '100 V to over 1 kV', 'narrow gate-voltage window'],
			['UJT', 'emitter voltage reaching a fraction of the supply', 'off', 'a negative-resistance discharge', r`$\eta V_{BB}$ plus a diode drop`, 'pulses', 'obsolete; a 555 does the job']
		]
	},

	datasheet: [
		{
			p: r`Most datasheets follow the same layout, and two of their sections are often confused. **Absolute maximum ratings** are limits not to be exceeded even for an instant; running a part at them guarantees nothing. **Electrical characteristics** are what the part does, each line guaranteed only at the test condition printed next to it. "Typ" is a typical value, not a promise: a design uses min and max.`
		},
		{
			steps: [
				r`**The pinout drawing.** The same part number can have different pinouts from different manufacturers, and the package drawing is the only reference.`,
				r`**The voltage rating** ($V_{CEO}$, $V_{DSS}$), with margin for spikes.`,
				r`**The on-state line at the conditions of the job**: $V_{CE(sat)}$ at the collector and base currents of the circuit, or $R_{DS(on)}$ at the gate voltage the driver really has.`,
				r`**The gain or the threshold, with its spread**: $h_{FE}$ min at the current of the job; $V_{GS(th)}$ min and max, measured at a tiny current (often 250 µA or 1 mA), which is where the part only starts to conduct.`,
				r`**The thermal resistance**, to turn power into temperature: $T_J = T_A + P R_{\theta JA}$. The current rating on page one usually assumes a case held at 25 °C, which no breadboard does.`,
				'**The graphs**: they show how every number moves with current and temperature, and the safe operating area of a power part.'
			]
		},
		{
			eq: r`P = I_D^2\, R_{DS(on)} \qquad T_J = T_A + P\, R_{\theta JA}`,
			intro: 'The calculation that decides whether a switch survives, for a MOSFET:'
		},
		{
			p: r`An example with real numbers: a 2N7000 switching 75 mA from a 5 V pin. Its datasheet guarantees $R_{DS(on)} \le 5.3\ \Omega$ at $V_{GS} = 4.5$ V, $I_D = 75$ mA and 25 °C; at 125 °C the resistance can be up to 1.8 times larger, some 9.5 Ω. So $P \approx 0.075^2 \times 9.5 = 0.053$ W, and with $R_{\theta JA} = 312.5$ °C/W for its TO-92 the junction runs about 17 °C above the room: fine. At its 200 mA rating the 4.5 V line no longer applies, since it is tested at 75 mA, and even 9.5 Ω gives 0.38 W and some 120 °C of rise: time for a larger MOSFET.`
		}
	],

	bench: [
		{
			p: r`A multimeter on its diode range finds the junctions. A bipolar transistor reads like two diodes back to back: 0.5 to 0.7 V from the base to each of the other two pins (red lead on the base for an NPN, black for a PNP), nothing between collector and emitter. A power MOSFET shows its body diode, 0.4 to 0.7 V from source to drain for an N-channel part, and nothing else, unless the gate holds charge from the last touch: shorting gate to source first discharges it.`
		},
		{
			note: r`Two parts in the same TO-92 can have mirror-image pinouts: a 2N3904 is E-B-C seen from the flat face, a BC547 is C-B-E. The 2N7000 is S-G-D in TO-92, while the SOT-23 2N7002 in the same datasheet is G-S-D. The drawings below come from each manufacturer's datasheet.`,
			tone: 'warn'
		}
	],

	blocksIntro: [
		{
			p: 'Most real circuits use transistors in pairs or groups. These five building blocks run in the simulator, and each is the core of a larger circuit: the pair and its current mirror at the input of an op-amp, the push-pull at the output of most audio amplifiers, the multivibrator in an LED flasher, and the CMOS inverter in CMOS logic gates.'
		}
	],
	blocksSims: ['current-mirror', 'diff-pair', 'push-pull', 'multivibrator', 'cmos-inverter']
};
