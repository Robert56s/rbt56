// The phototransistor, and the optocoupler built around one. Content of one
// page of the transistor guide: see src/lib/transistors/types/index.js for
// what each field is. Strings with formulas use String.raw so a LaTeX
// backslash stays one backslash.
const r = String.raw;

export default {
	slug: 'phototransistor',
	name: 'Phototransistor and optocoupler',
	short: 'Phototransistor',
	family: 'bipolar',
	symbol: { name: 'npn_bipolar_transistor_down', light: true, labels: { collector: 'C', emitter: 'E' } },
	control: 'Light on the collector-base junction',
	normally: 'off',
	fullyOn: r`A small fixed drop like the NPN's, at most 0.5 V in a 4N25 (2 mA, $I_F$ = 50 mA)`,
	terminals: [
		['C', 'collector'],
		['E', 'emitter'],
		['B', 'base (on some parts only)']
	],
	oneLiner: 'An NPN whose collector-base junction is a photodiode: light makes a small current in the base, and the transistor multiplies it like a base current.',
	usedFor: ['Ambient-light sensing', 'Detecting an infrared LED or beam', 'Isolated signals, inside an optocoupler'],

	howItWorks: [
		{
			p: r`A phototransistor is an NPN built so that light reaches its collector-base junction, which is made large and sits under a lens or a clear window. That junction is reverse biased, so it works as a photodiode: a photon absorbed in or near it creates an electron and a hole, and the junction's field sweeps the hole into the base and the electron into the collector. Those holes are exactly what a base current would bring. The photocurrent $I_{ph}$ forward-biases the base-emitter junction, and the transistor multiplies it as the NPN multiplies a base current.`
		},
		{
			eq: r`I_C \approx (\beta + 1)\, I_{ph} + I_{CEO}`,
			intro: 'The standard device model, which the datasheets do not print, treats the photocurrent as a base current:'
		},
		{
			p: r`$I_{ph}$ flows from the collector into the base, so the collector carries it plus $\beta$ times it, hence $\beta + 1$. $I_{CEO}$ is the dark current. The leakage $I_{CBO}$ of the same junction enters the base the same way and is multiplied the same way, so $I_{CEO} \approx (\beta + 1)\, I_{CBO}$. In practice a datasheet specifies the collector current at a stated light level, the **light current**, and a design works from that number: 15 to 70 µA at 20 lx for a TEPT4400 (sold in three sensitivity bins), about 200 µA typical at 100 lx. The lux (lx) measures light weighted by the eye's sensitivity; infrared parts are specified in mW/cm² instead.`
		},
		{ h: 'Two leads or three' },
		{
			p: r`The TEPT4400 and the TEFT4300 bring out only the collector and the emitter: the base floats, and light is its only drive. The BPV11 brings the base out on a third lead, and the 4N25 optocoupler on pin 6. A resistor $R_{BE}$ from that base to the emitter takes part of the photocurrent before the transistor gets any, about $V_{BE} / R_{BE}$, so 6 µA for 100 kΩ. It costs sensitivity and buys speed, because the charge stored in the base now has a way out through $R_{BE}$; without it, that charge can only recombine or leave through the base-emitter junction. The leakage takes the same path, so the dark current is no longer multiplied.`
		},
		{ h: 'Two ways to connect it' },
		{
			p: r`Like any transistor it needs a resistor $R_L$ to turn its current into a voltage. In the **common-emitter** connection $R_L$ runs from the supply to the collector, the emitter goes to ground, and the output is the collector: it falls as the light grows. In the **common-collector** connection the collector goes to the supply, $R_L$ runs from the emitter to ground, and the output is the emitter: it rises with the light.`
		},
		{
			eq: r`\text{CE: } V_{out} = V_{CC} - I_C R_L \qquad \text{CC: } V_{out} = I_C R_L`,
			intro: 'Both outputs follow from the drop across the resistor, until the transistor saturates:'
		},
		{
			p: r`Either way, enough light saturates it: the collector current can no longer grow, $V_{CE}$ sits at $V_{CE(sat)}$ and the output stops moving. A small $R_L$ keeps it in the linear part, for a sensor that measures light. A large one makes it a light-operated switch.`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Light', 'What happens', 'Common-emitter output', 'Used as'],
				rows: [
					['Dark (cutoff)', 'none', r`only the dark current $I_{CEO}$ flows, nanoamps`, r`at $V_{CC}$`, 'off state of a switch'],
					['Linear (active)', 'moderate', r`$I_C$ roughly in proportion to the light, set by the light and not by $R_L$`, r`$V_{CC} - I_C R_L$, follows the light`, 'light meter, analog link'],
					['Fully on (saturation)', 'strong', r`$V_{CE}$ down to $V_{CE(sat)}$, $I_C$ set by $R_L$`, 'a few tenths of a volt', 'light switch, digital optocoupler']
				]
			}
		},
		{
			note: r`"Linear" here means the output follows the light in proportion: the BJT's active region. It has nothing to do with the MOSFET's "linear region", which is its fully-on, resistor-like state. And the "light current" of a datasheet is the collector current under light, not the photocurrent $I_{ph}$, which is $\beta + 1$ times smaller.`,
			tone: 'warn'
		},
		{ h: 'Speed against sensitivity' },
		{
			p: r`Speed is where the phototransistor pays for its gain. Its collector-base junction is large to catch light, so its capacitance $C_{CB}$ is large: 19 pF ($C_{CBO}$) on the BPV11. In the common-emitter connection that capacitance sits between the output and the base, and the output moves many times more than the base does, so the base sees it multiplied: the **Miller effect**. Only the small photocurrent charges it, and with nothing else on the base, only the base-emitter junction discharges it. A bigger base area catches more light and adds more capacitance, so sensitivity and speed trade against each other.`
		},
		{
			p: r`The two Vishay infrared parts fit the pattern. Under the same test (5 V, $I_C$ = 5 mA, $R_L$ = 100 Ω) the TEFT4300, 0.8 to 3.2 mA at 1 mW/cm², turns on in 2 µs and off in 2.3 µs. The BPV11, 3 to 10 mA at 1 mW/cm², takes 6 µs and 5 µs. A 100 Ω load is chosen for speed: at 5 mA it gives only 0.5 V of output swing.`
		},
		{ h: 'The optocoupler' },
		{
			p: r`An optocoupler puts an infrared LED and a phototransistor face to face in one package, separated by a clear insulator. Light is the only link: the input and the output share no conductor, so they can sit at very different voltages. That separation is **galvanic isolation**, rated 5000 V RMS for the 4N25. The input is an LED, driven through a series resistor like any LED. The output is a phototransistor, and everything above applies to it.`
		},
		{
			eq: r`\text{CTR} = \frac{I_C}{I_F} \times 100\ \%`,
			intro: r`Its gain is the current transfer ratio, the collector current over the LED forward current $I_F$:`
		},
		{
			p: r`The 4N25 guarantees a CTR of at least 20 % at $I_F$ = 10 mA and $V_{CE}$ = 10 V, typically 50 %: at least 2 mA out, typically 5 mA, for 10 mA in. The CTR lumps together the LED's efficiency, the share of its light that reaches the base and the transistor's gain, and it moves with $I_F$, $V_{CE}$ and temperature. The LED also dims as it ages, so the CTR falls over the years. Like $\beta$, it is a minimum to design to, never a typical value to count on.`
		},
		{
			note: r`The simulator further down has no phototransistor, so light enters it as what it amounts to: a current into the base of an ordinary NPN ($\beta = 300$), fed from the Light slider through 1 MΩ. Each volt above the 0.55 V or so the base sits at gives 1 µA, and about 1.6 µA saturates the transistor under its 10 kΩ pull-up. In the real part the photocurrent also flows in at the collector, hence $\beta + 1$ instead of $\beta$, a difference of 0.3 % here.`,
			tone: 'info'
		},
		{
			more: [
				{ p: r`The dark current sets the faintest light a circuit can read. The TEPT4400 specifies 3 nA typical and 50 nA maximum at 5 V, against at least 15 µA at 20 lx: a ratio of 300 even for the least sensitive part with the worst leakage. The dark current rises with temperature and the light current drifts with it too (the datasheet's Figs. 2 and 3), so a sensor that must read faint light when hot is checked on both curves at its highest temperature.` },
				{ p: r`Each part also has its own colour. The TEPT4400 peaks at 570 nm, close to the eye's response, which suits an ambient-light sensor. The TEFT4300 peaks at 925 nm and the BPV11 at 850 nm, in the infrared, to match infrared emitters.` }
			],
			summary: 'Dark current, temperature and colour'
		}
	],

	curves: {
		widget: 'bjtCurves',
		props: { vcc: 5, rc: 1000, ib: 10e-6 },
		caption: r`The NPN's output curves, with the base current read as photocurrent: on a phototransistor each curve is one level of light. The model has $\beta = 150$. The red line is the load line of $R_L$ on the supply, and more light walks the point from dark, through the linear part, into saturation.`
	},

	sims: ['phototransistor'],

	rules: [
		{
			title: 'The load resistor decides: linear sensor or switch',
			body: [
				{ p: r`The output stays linear as long as the strongest light cannot pull the transistor into saturation. It switches cleanly if the weakest light that must count as "on" already does.` },
				{ eq: r`\text{linear: } R_L < \frac{V_{CC} - V_{CE(sat)}}{I_{C,max}} \qquad \text{switch: } R_L > \frac{V_{CC} - V_{CE(sat)}}{I_{C,min}}` },
				{ p: r`A TEPT4400 on 5 V, with $V_{CE(sat)}$ taken as 0.3 V. As a light meter up to 100 lx (200 µA typical): $R_L < 4.7\ \text{V} / 200\ \mu\text{A} = 23.5$ kΩ, and 10 kΩ leaves room for a part 2.35 times more sensitive than typical. As a switch that must trip at 20 lx for every bin (15 µA at least): $R_L > 4.7\ \text{V} / 15\ \mu\text{A} = 313$ kΩ, so 330 kΩ. In the dark, 50 nA of leakage drops only 16.5 mV across it. The same spread moves the threshold: a part from the most sensitive bin, 70 µA at 20 lx, already draws the 14 µA that saturates it near 4 lx, if its current scales with the light. A switch that must trip at a set light level needs parts from one bin, or a trimmer in place of the fixed resistor.` }
			]
		},
		{
			title: 'Speed costs sensitivity',
			body: [
				{ p: r`Vishay's application note on faster couplers ranks what sets the switching time of a phototransistor, from the strongest effect to the weakest:` },
				{
					steps: [
						'The load resistor: smaller is faster.',
						r`A base-emitter resistor $R_{BE}$, on parts with a base lead: it speeds the part up and costs sensitivity.`,
						r`The gain $h_{FE}$.`,
						'The junction capacitance.',
						'The connection: common-collector escapes the Miller effect, but only when the base has its own path to ground, such as 100 kΩ from the base pin. With the base open, both connections switch at the same speed.',
						'The speed of the LED, which hardly matters.'
					]
				},
				{ eq: r`\tau \approx (\beta + 1)\, R_L\, C_{CB}`, intro: r`The load resistor matters most because the output swing, $I_C R_L$, is a swing of $V_{CB}$ too, and the photocurrent, $\beta + 1$ times smaller than $I_C$, must move the charge of $C_{CB}$ through all of it. The time constant $\tau$ grows in step with $R_L$ and does not depend on the light:` },
				{ p: r`For a BPV11 ($\beta$ about 450, $C_{CBO}$ = 19 pF) this term alone gives 0.86 µs at 100 Ω, where the datasheet measures 6 µs, and 86 µs at 10 kΩ. The datasheet times come from a 100 Ω load: about 2 µs for the rise and fall of a 4N25. A 4N25 that delivers 2 mA and must swing 4.5 V for a logic input needs $R_L$ = 2.25 kΩ at least, more than 20 times the test load, and its edges come out slower than the table says. When speed matters, $R_{BE}$ on the base pin buys some of it back. The common-collector connection helps only with a resistor from the base pin to ground; on a two-lead part, or with the base open, it changes nothing.` }
			]
		},
		{
			title: 'An optocoupler is designed to its minimum CTR, with margin',
			body: [
				{ eq: r`I_{C,min} = \text{CTR}_{min}\, I_F \qquad R_L \ge \frac{V_{CC} - V_{CE(sat)}}{I_{C,min}}` },
				{ p: r`A 4N25 at $I_F$ = 10 mA: the minimum CTR of 20 % guarantees 2 mA on a new part, where the typical 50 % suggests 5 mA. A design that needs 5 mA works on the bench and fails on the next part. The LED dims with age and the CTR moves with temperature, so the design also keeps a margin under the 2 mA. Planning on half of it, 1 mA, a 5 V pull-up needs $R_L \ge (5 - 0.5)\ \text{V} / 1\ \text{mA} = 4.5$ kΩ, so 4.7 kΩ or more.` }
			]
		},
		{
			title: 'A worked optocoupler input: LED resistor and pull-up',
			body: [
				{ p: 'A 0 to 15 V signal from the lab supply has to reach a 5 V logic input, isolated. The LED gets about 10 mA, the current the CTR is specified at.' },
				{ eq: r`R_F = \frac{V_{in} - V_F}{I_F} = \frac{15 - 1.2}{10\ \text{mA}} = 1.38\ \text{k}\Omega` },
				{ p: r`$V_F$ is taken as 1.2 V for the infrared LED (the exact value is on the datasheet): against 15 V, an error of 0.3 V moves $I_F$ by only 2 %. The E12 value 1.2 kΩ gives 11.5 mA. On the output side, a 10 kΩ pull-up to 5 V needs $(5 - 0.5)\ \text{V} / 10\ \text{k}\Omega = 0.45$ mA to bring the output under 0.5 V. That is a CTR of 3.9 %, close to the 4 % (2 mA for 50 mA) at which the datasheet guarantees the 0.5 V, and the 2 mA a new part guarantees is 4.4 times what it needs: room for years of ageing. The output is low when the input is high: the stage inverts. A signal that can swing negative, such as a TL082 output on ±15 V, would reverse-bias the LED far past the few volts it tolerates (the figure is on the datasheet). A 1N4148 across the LED, its cathode on the LED's anode, clamps the reverse voltage near 0.7 V, and the same series resistor limits its current.` }
			]
		},
		{
			title: 'The TEPT4400 survives only 6 V',
			body: [
				{ p: r`In the dark the transistor is off and the whole supply sits across it, so the supply must stay below $V_{CEO}$. The TEPT4400's $V_{CEO}$ is 6 V: it belongs on 5 V. On the lab's 15 V rail it would see 2.5 times its rating, where the TEFT4300 and the BPV11 are rated 70 V. The TEPT4400 also allows only 1.5 V in reverse ($V_{ECO}$), 20 mA and 100 mW.` },
				{ eq: r`V_{CC} < V_{CEO} \qquad P_{max} = \frac{V_{CC}^2}{4 R_L}`, intro: r`The supply limit, and the most power a load resistor lets into the part, at $V_{CE} = V_{CC} / 2$:` },
				{ p: r`With $R_L$ = 1 kΩ on 5 V the transistor never dissipates more than 6.25 mW and never carries more than $V_{CC} / R_L$ = 5 mA, well inside 100 mW and 20 mA.` }
			]
		}
	],

	mistakes: [
		['The light powers the output current.', r`The light only makes a small current in the base. The collector current comes from the supply through $R_L$, enabled by that base current, as in the NPN.`],
		['The typical light current or CTR is the value to design with.', r`Both spread widely: the TEPT4400 is sold in three bins from 15 to 70 µA at 20 lx, and a 4N25's CTR is at least 20 % but typically 50 %. The CTR also falls as the LED ages. A design uses the minimum, with margin.`],
		['The switching time on the datasheet holds in any circuit.', 'It is measured with a 100 Ω load. The load resistor is the biggest factor in the speed, and a 10 kΩ pull-up makes the same part slower.'],
		['The spare base pin of an optocoupler should be grounded like an unused input.', r`Tying the base to the emitter shunts the photocurrent past the base-emitter junction: the transistor never turns on, and only the bare photocurrent, $\beta + 1$ times smaller, reaches the output. Left open, the base gives the most sensitivity; a resistor $R_{BE}$ to the emitter trades some of it for speed.`],
		['A phototransistor sees the light the eye sees.', 'Only parts like the TEPT4400 (peak at 570 nm) follow the eye. The TEFT4300 (925 nm) and the BPV11 (850 nm) peak in the infrared, made for infrared emitters.'],
		['In the dark the output sits exactly at the supply.', 'The dark current still flows, up to 50 nA at 5 V for a TEPT4400, and more when hot. Across a large pull-up it becomes a measurable drop: 16.5 mV across 330 kΩ, more as the part warms.']
	],

	variants: [
		{ p: r`A **photo-Darlington** follows the phototransistor with a second transistor, as in the Darlington pair: the gain multiplies again, and so do the Darlington's faults, a saturation voltage of a $V_{BE}$ plus a $V_{CE(sat)}$ and a slower turn-off.` },
		{ p: r`A **photodiode** is the light-sensing junction on its own, without the transistor: its current is the bare photocurrent, $\beta + 1$ times smaller, and the Miller effect does not slow it. On a part with a base lead, using only the collector and the base turns the phototransistor into one.` }
	],

	bench: [
		{ p: r`**Meter check.** On a part with a base lead the transistor reads like an NPN on the diode range: red lead on the base (pin 6 of the 4N25), about 0.6 to 0.7 V to the emitter (pin 4) and to the collector (pin 5), nothing with the leads swapped. The 4N25's LED, anode on pin 1 and cathode on pin 2, reads a forward drop with the red lead on pin 1 and nothing the other way. A two-lead part has no junction the meter can reach alone, and the TEPT4400 allows only 1.5 V in reverse, so it stays off the diode range: the datasheet drawing is the only reference for its leads.` },
		{ p: r`**First build.** A TEPT4400 with a 10 kΩ pull-up on 5 V, emitter to ground, the meter from collector to ground. Expected, from the datasheet light currents: close to 5 V with the window covered, 4.3 to 4.85 V at 20 lx depending on the bin, about 3 V at 100 lx for a typical part, and a few tenths of a volt when a lamp close by saturates it.` },
		{ p: r`**Then the optocoupler.** The worked input above: a 4N25 with 1.2 kΩ from the 15 V input to the LED anode (pin 1), the LED cathode (pin 2) to the input's ground, 10 kΩ from 5 V to the collector (pin 5) and the emitter (pin 4) to the output's ground; pin 3 is not connected. With the input at 15 V the output reads under 0.5 V and the LED takes about 11.5 mA; at 0 V the output reads 5 V. With the pull-up replaced by the meter on its mA range, the reading is $I_C$ at $V_{CE}$ = 5 V, and $I_C / I_F$ is the part's CTR: at least 20 % and typically about 50 % for a new part, figures specified at 10 mA and 10 V.` }
	],

	quiz: [
		[r`A TEPT4400 has a 10 kΩ pull-up on 5 V. What does the output read at 20 lx, for a part from any of the three bins?`, r`The light current is 15 to 70 µA at 20 lx, so the drop across 10 kΩ is 0.15 to 0.7 V and the output reads 4.3 to 4.85 V. That is almost a factor of five between parts: a sensor that must read lux accurately needs a calibration, or parts from one bin.`],
		[r`A 4N25 runs at $I_F$ = 10 mA into a 2.2 kΩ pull-up on 5 V. Is a low output under 0.5 V guaranteed?`, r`No. Pulling the output down to 0.5 V takes $(5 - 0.5)\ \text{V} / 2.2\ \text{k}\Omega = 2.05$ mA, and the minimum CTR of 20 % guarantees only 2 mA, on a new part, before any ageing. A 10 kΩ pull-up needs only 0.45 mA and leaves a fourfold margin.`],
		[r`A phototransistor has its collector on 5 V and 10 kΩ from its emitter to ground. Which way does the output move with light, and what does it read at $I_C$ = 200 µA?`, r`This is the common-collector connection: the output is the emitter and rises with light, $V_{out} = I_C R_L = 200\ \mu\text{A} \times 10\ \text{k}\Omega = 2$ V. It tops out near $5\ \text{V} - V_{CE(sat)}$. It is no faster than the common-emitter connection: with the base open, the same current flows around the same loop of supply, transistor and resistor, and only the node taken as the output changes. Vishay's Application Note 41 measures the two at the same speed with the base open (Fig. 26).`]
	],

	parts: ['TEPT4400', '4N25'],
	related: ['npn', 'darlington']
};
