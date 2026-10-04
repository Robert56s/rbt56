// The Darlington pair, with the Sziklai pair. Content of one page of the
// transistor guide: see src/lib/transistors/types/index.js for what each
// field is. Strings with formulas use String.raw so a LaTeX backslash stays
// one backslash.
const r = String.raw;

export default {
	slug: 'darlington',
	name: 'Darlington and Sziklai pairs',
	short: 'Darlington',
	family: 'bipolar',
	symbol: { name: 'darlington_pair_transistor_right', labels: { 1: 'B', 2: 'E', 3: 'C' } },
	control: r`Current into the base, past two $V_{BE}$ drops`,
	normally: 'off',
	fullyOn: r`A $V_{BE}$ plus a $V_{CE(sat)}$: about 0.9 V at 100 mA, up to 2 V at 3 A`,
	terminals: [
		['B', 'base'],
		['C', 'collector'],
		['E', 'emitter']
	],
	oneLiner: r`Two transistors wired to act as one, with a current gain near the product of their two gains: thousands instead of a hundred.`,
	usedFor: ['Relay, solenoid and lamp drivers fed from a weak logic pin', 'Seven-channel driver arrays such as the ULN2003A', 'Audio power output stages (Sziklai pair)'],

	howItWorks: [
		{
			p: r`A Darlington pair is two NPN transistors wired to behave as one. The emitter of the first, Q1, drives the base of the second, Q2, and the two collectors are tied together. Only three terminals come out, so the pair is used like a single NPN. Sidney Darlington patented the connection at Bell Labs in 1953. A TIP120 holds both transistors on one die; a ULN2003A holds seven pairs.`
		},
		{
			p: r`Like the NPN, Q1 multiplies its base current by $\beta_1$. Its whole emitter current, $(\beta_1 + 1)$ times its base current, then becomes the base current of Q2, which multiplies it again by $\beta_2$.`
		},
		{
			eq: r`I_C = \beta_1 I_B + \beta_2 (\beta_1 + 1)\, I_B = (\beta_1 \beta_2 + \beta_1 + \beta_2)\, I_B \approx \beta_1 \beta_2\, I_B`,
			intro: r`With $I_B$ the base current of the pair, adding the two collector currents gives its collector current $I_C$:`
		},
		{
			p: r`Two transistors with $\beta = 100$ make a pair with a gain of 10 200. A TIP120 is guaranteed a gain, written $h_{FE}$ on the datasheet, of at least 1000 at 0.5 A and at 3 A ($V_{CE}$ = 3 V), and a ULN2003A channel reaches about 10 000 at some currents. A fraction of a milliamp from a logic pin can then hold a load of hundreds of milliamps.`
		},
		{
			eq: r`V_{BE} = V_{BE1} + V_{BE2} \approx 1.2\ \text{to}\ 1.4\ \text{V}`,
			intro: 'The price is paid in voltage. Two base-emitter junctions sit in series between base and emitter, so the pair turns on at about twice the NPN figure:'
		},
		{
			p: r`At high current it is more: a TIP120 may need up to 2.5 V at 3 A. A signal that only reaches 1 V turns a single NPN on and leaves a Darlington off.`
		},
		{
			eq: r`V_{CE} = V_{CE1} + V_{BE2} \ \ge\ V_{CE(sat)1} + V_{BE2}`,
			intro: 'The same series connection sets the lowest voltage the pair can reach. The collector-emitter voltage of Q2 is that of Q1 plus the base-emitter drop of Q2:'
		},
		{
			p: r`Q1 can saturate, but its 0.1 V or so sits on top of a whole $V_{BE2}$, around 0.7 V. The base-collector voltage of Q2 is $-V_{CE1}$, never positive, so Q2 never saturates: it stays at the edge of the active region. A ULN2003A reaches 0.9 V typical (1.1 V max) at 100 mA and 1.2 V typical (1.6 V max) at 350 mA; a TIP120 is specified at 2.0 V max at 3 A and 4.0 V max at 5 A. A single NPN gets down to 0.05 to 0.3 V. That drop times the load current is heat.`
		},
		{
			p: r`Q1 can push current into the base of Q2 but cannot pull any out. When the drive stops, the charge stored in Q2's base leaves only through a resistor from that base to the emitter, so Darlington parts build the resistors in: a TIP120 has about 8 kΩ across Q1's base-emitter junction and about 120 Ω across Q2's; a ULN2003A has 7.2 kΩ and 3 kΩ, plus 2.7 kΩ in series with each input. They also drain the leakage of Q1, which Q2 would otherwise multiply by its own gain. Turn-off stays slow all the same: the TIP120 datasheet presents it as a part for low-speed switching.`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Base to emitter', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff)', 'under about 1 V', 'only leakage flows', 'open switch'],
					['Current source (active)', 'about 1.2 to 1.4 V', r`$I_C \approx \beta_1 \beta_2 I_B$, nearly independent of $V_{CE}$`, 'emitter follower, linear output stage'],
					['Fully on (saturation)', 'about 1.2 V and up', r`Q1 saturated, Q2 at the edge of active: $V_{CE}$ about 0.7 to 2 V, $I_C$ set by the load, $I_C < \beta_1 \beta_2 I_B$`, 'closed switch']
				]
			}
		},
		{
			note: r`A Darlington datasheet still writes $V_{CE(sat)}$, but only Q1 saturates. No base current pulls the pair below $V_{BE2} + V_{CE(sat)1}$, so the forced beta of 10 that suits a single NPN only wastes drive here. As on the NPN page, this "saturation" is the closed switch, the opposite of a MOSFET's saturation.`,
			tone: 'warn'
		},
		{ h: 'The Sziklai pair' },
		{
			p: r`The Sziklai pair, also called the complementary feedback pair, reaches the same gain with an NPN driving a PNP. Q1, the NPN, takes the input on its base, and its collector pulls current out of the base of Q2, a PNP. The collector of Q2 joins the emitter of Q1, which is the emitter of the pair; the emitter of Q2 is the collector of the pair. With an NPN driver the whole behaves as one NPN, with a PNP driver as one PNP: the driver sets the polarity.`
		},
		{
			eq: r`I_C = (\beta_2 + 1)\, \beta_1 I_B \approx \beta_1 \beta_2\, I_B \qquad V_{CE} = V_{EB2} + V_{CE1} \ \ge\ V_{EB2} + V_{CE(sat)1}`,
			intro: r`The collector current of Q1 is the base current of Q2, so the gain is again a product (two gains of 100 give 10 100), and the lowest $V_{CE}$ has the same form as before:`
		},
		{
			p: r`Only the junction of Q1 lies between base and emitter, so the pair turns on at a single $V_{BE}$, about 0.6 V. It saturates no better than a Darlington.`
		},
		{
			p: r`Audio designers use it in push-pull output stages for its bias. The idle current of such a stage is set by the base-emitter voltages between input and output. In a Sziklai pair that is the $V_{BE}$ of the small driver, which stays cool, not that of the hot output transistor, so the bias drifts less with heat. The stage is also more linear than one built from Darlington followers. Figures from Douglas Self's work on power amplifiers put its best idle current near 10 mA, against 100 mA or more for a Darlington stage.`
		},
		{
			table: {
				head: ['Property', 'Single NPN', 'Darlington', 'Sziklai'],
				rows: [
					['Current gain', r`$\beta$, 100 to 300`, r`$\approx \beta_1 \beta_2$`, r`$\approx \beta_1 \beta_2$`],
					['Turns on at, base to emitter', 'about 0.65 V', 'about 1.2 to 1.4 V', 'about 0.6 V'],
					['Fully on, collector to emitter', '0.05 to 0.3 V', r`$V_{BE2} + V_{CE(sat)1}$ or more`, r`$V_{EB2} + V_{CE(sat)1}$ or more`],
					['Turn-on voltage drift', 'falls 2 mV/°C', 'falls about 4 mV/°C, two junctions', 'falls about 2 mV/°C, the cool driver only']
				]
			}
		},
		{
			more: [
				{ p: r`Q1 runs at only about $I_{C2} / \beta_2$. Its transconductance, the change of collector current per volt on the base, is $g_{m1} = I_{C1} / V_T$ like that of any bipolar transistor ($V_T = kT/q \approx 25.85$ mV at 300 K), so it is $\beta_2$ times smaller than $g_{m2}$ of Q2, and a small input signal splits about equally between the two junctions. The pair's transconductance $g_m$ is half that of Q2 alone, and its input resistance $r_\pi$ is very large:` },
				{ eq: r`g_m \approx \frac{g_{m2}}{2} = \frac{I_C}{2 V_T} \qquad r_\pi \approx \frac{2 \beta_1 \beta_2}{g_{m2}}` },
				{ p: r`At $I_C = 100$ mA with two gains of 100: $g_m \approx 1.93$ S instead of 3.87 S, and $r_\pi \approx 5.2$ kΩ instead of 26 Ω for one transistor, 200 times more. The built-in resistors change these numbers at low current, where they take a large share of the emitter current of Q1.` }
			],
			summary: 'Small-signal model'
		}
	],

	// bjtCurves draws a single NPN with a fixed beta: it would show the wrong
	// device, so this page has no curves section
	curves: null,

	sims: ['darlington'],

	rules: [
		{
			title: r`Base drive: a quarter of the minimum $h_{FE}$, through two $V_{BE}$`,
			body: [
				{ p: r`The minimum gain holds only at the currents the datasheet lists, and saturation needs margin. The TIP120 datasheet tests $V_{CE(sat)}$ at $I_C / I_B = 250$, a quarter of its 1000 minimum; the ULN2003A at 400 to 700. Driving harder changes little, since the pair cannot drop below $V_{BE2} + V_{CE(sat)1}$.` },
				{ eq: r`R_B = \frac{V_{drive} - V_{BE(on)}}{4\, I_C / h_{FE(min)}}` },
				{ p: r`A TIP120 switching 0.5 A from a 5 V pin: $I_B = 0.5\ \text{A} / 250 = 2$ mA. With the worst-case $V_{BE(on)}$ of 2.5 V, specified at 3 A and so pessimistic at 0.5 A, $R_B = (5 - 2.5) / 2\ \text{mA} = 1.25$ kΩ, so 1.2 kΩ. At a more likely 1.4 V the base gets 3 mA, against the 50 mA a single NPN would need at a forced beta of 10.` }
			]
		},
		{
			title: 'Count the saturation voltage as heat',
			body: [
				{ eq: r`P \approx V_{CE(sat)}\, I_C + V_{BE}\, I_B \qquad T_J = T_A + P\, R_{\theta JA}` },
				{ p: r`A TIP120 at 3 A: $P \approx 2.0 \times 3 + 2.5 \times 0.012 = 6.0$ W. In free air ($R_{\theta JA} = 62.5$ °C/W) the junction would reach about 400 °C in a 25 °C room. To stay at its 150 °C limit, junction to air must total $(150 - 25) / 6.03 = 20.7$ °C/W or less: after the 1.92 °C/W from junction to case, 18.8 °C/W for the heatsink and its pad. The 2 V also comes off the load: a 12 V solenoid gets only 10 V. The solenoid still needs its own flyback diode across the coil, cathode to the supply: the diode built into the TIP120 runs from emitter to collector and does not clamp the kick at turn-off.` }
			]
		},
		{
			title: 'The ULN2003A: seven drivers, their flyback diodes, one package to cool',
			body: [
				{ p: r`Each of the seven channels is an open-collector Darlington with a 2.7 kΩ resistor in series with its input, so a 3.3 V or 5 V logic pin drives it directly: about $(5 - 1.4) / 2.7\ \text{k}\Omega \approx 1.3$ mA from 5 V. The input needs at most 2.4 V to sink 200 mA and 3.0 V for 300 mA, both at $V_{CE}$ = 2 V. All emitters share pin E (pin 8 on the DIP), and each output has a flyback diode to the common cathode pin COM (pin 9). The diodes clamp only when COM is tied to the coil supply.` },
				{ eq: r`P = \sum_{i} V_{CE(sat),i}\, I_{C,i} \qquad T_J = T_A + P\, R_{\theta JA}`, intro: 'The heat of all the channels ends up in one die:' },
				{ p: r`Seven channels at 200 mA and 1.0 V typical: $P = 7 \times 0.2 \times 1.0 = 1.4$ W. With $R_{\theta JA} = 66.7$ °C/W for the DIP, the junction reaches 118 °C in a 25 °C room, and 146 °C with the 1.3 V maximum, past the 125 °C TI recommends; the SOIC (88.6 °C/W) runs hotter still. Each output takes 500 mA peak, but the common emitter pin is rated 2.5 A in total, 357 mA per channel with all seven on. The duty-cycle curves of the datasheet tell how many channels can run at a given current.` }
			]
		},
		{
			title: 'Above about 0.5 A from logic, a logic-level MOSFET usually wins',
			body: [
				{ p: r`At these currents a Darlington drops about 1 to 2 V; a MOSFET that is fully on behaves as a resistance $R_{DS(on)}$. The MOSFET dissipates less whenever:` },
				{ eq: r`I^2 R_{DS(on)} < V_{CE(sat)}\, I \quad \Longleftrightarrow \quad R_{DS(on)} < \frac{V_{CE(sat)}}{I}` },
				{ p: r`At 3 A the 2.0 V of the TIP120 amounts to $2.0 / 3 = 0.67\ \Omega$: a MOSFET of 50 mΩ dissipates $3^2 \times 0.05 = 0.45$ W instead of 6 W, and its gate takes no steady current. The condition is the gate voltage: the MOSFET must be logic-level, with $R_{DS(on)}$ specified at 4.5 V, or at 2.5 V for a 3.3 V pin, not only a low $V_{GS(th)}$. The Darlington keeps its place for small loads in numbers: seven channels with their diodes in one 16-pin ULN2003A.` }
			]
		}
	],

	mistakes: [
		['A Darlington saturates like a single transistor, at about 0.1 V.', r`Its output transistor never saturates. The drop is at least $V_{BE2} + V_{CE(sat)1}$: 0.9 V typical at 100 mA for a ULN2003A, up to 2.0 V at 3 A for a TIP120.`],
		['More base current lowers the on-voltage, as with a single NPN.', r`Once Q1 saturates, more base current changes almost nothing: $V_{BE2}$ stays. The datasheets test at forced betas of 250 (TIP120) and 400 to 700 (ULN2003A), not 10.`],
		[r`An $h_{FE}$ of 1000 means 1 mA of base current switches 1 A.`, r`1 mA times 1000 lands exactly on the edge of the active region, with no margin: a colder or weaker part leaves volts across the pair. The 1000 is a minimum at stated currents, 0.5 A and 3 A for the TIP120; a design uses about a quarter of it.`],
		['A Darlington turns on at 0.65 V like any bipolar transistor.', 'Two junctions in series need about 1.2 to 1.4 V, and up to 2.5 V for a TIP120 at 3 A. The Sziklai pair is the one that turns on at a single base-emitter drop.'],
		['The ULN2003A has flyback diodes, so a relay on it is protected.', 'Only with COM (pin 9) tied to the coil supply. With COM left open the diodes have nowhere to send the coil current, and the output flies up at turn-off as if they were absent.'],
		['Each ULN2003A channel takes 500 mA, so the chip drives seven 500 mA loads.', 'The 500 mA is a peak per channel. The common emitter pin is rated 2.5 A in total, and seven channels at only 200 mA already dissipate about 1.4 W, enough to heat a DIP 93 °C above the room.']
	],

	variants: [
		{ p: r`**PNP Darlingtons** are the complements, for high-side switches and push-pull stages: the TIP125 to TIP127 pair with the TIP120 to TIP122, with every polarity reversed.` },
		{ p: r`A **discrete Darlington**, for example a 2N3904 driving a TIP31, works the same way. The first transistor carries the base current of the second, $I_C / \beta_2$. That is 40 mA at 1 A, where the TIP31 has an $h_{FE}$ of at least 25, but up to 300 mA at 3 A, where its minimum is 10: past the 200 mA a 2N3904 is rated for. The pair also lacks the built-in resistors, so a resistor from the second base to the emitter, like the 120 Ω inside a TIP120, gives the stored charge a way out and keeps the leakage of the first transistor from being amplified.` },
		{ p: r`Used as an **emitter follower**, the pair multiplies the load seen from its input by about $\beta_1 \beta_2$: with two gains of 100, a 10 Ω load looks like about 100 kΩ, at the cost of an output two $V_{BE}$ below the input.` }
	],

	bench: [
		{ p: r`**Meter check (TIP120).** Seen from the printed face with the legs down, the legs are B, C, E from left to right, and the tab is C. On the diode range, red on B and black on C reads one junction, about 0.6 V. Red on E and black on C also reads a junction: the built-in diode from emitter to collector, a reading a plain NPN never gives; the other way round shows nothing. It is not a flyback diode. Between B and E the reading depends on the meter, since two junctions with resistors across them are in series. On the resistance range, red on E and black on B reads the two internal resistors in series, about 8.1 kΩ.` },
		{ p: r`**Meter check (ULN2003A).** On the diode range, red on an output (pins 10 to 16) and black on COM (pin 9) reads the flyback diode, and nothing the other way round. Red on E (pin 8) and black on an output also reads a junction: the substrate diodes, which stay reverse-biased in normal use.` },
		{ p: r`**First build.** The simulation on a breadboard, at smaller currents: two 2N3904 wired as a Darlington (emitter of the first to the base of the second, collectors together) next to a single 2N3904. Each gets a red LED and 330 Ω from 5 V to its collector, and each base is fed from 5 V through 1 MΩ, about 4 µA. The single transistor turns that into about 1 mA or less: a faint glow, about 0.6 V from base to emitter and about 3 V from collector to emitter. The Darlington lights its LED fully, about 7 mA, with about 1.3 V from base to emitter and 0.8 V from collector to emitter, where one transistor driven hard reads under 0.1 V.` }
	],

	quiz: [
		[r`A Darlington is built from a driver with $\beta_1 = 150$ and a power transistor with $\beta_2 = 40$, both minimum values. What base current just reaches 2 A, and what should a design use?`, r`$\beta = 150 \times 40 + 150 + 40 = 6190$, so $I_B = 2\ \text{A} / 6190 = 323\ \mu\text{A}$ reaches the edge of the active region with no margin. A quarter of the minimum gain, the ratio the TIP120 datasheet tests at, gives $I_B = 2\ \text{A} / 1548 \approx 1.3$ mA.`],
		[r`A ULN2003A in a DIP drives four loads of 200 mA each in a 25 °C room. How hot does its junction get?`, r`With the typical 1.0 V, $P = 4 \times 0.2 \times 1.0 = 0.8$ W and $T_J = 25 + 0.8 \times 66.7 = 78$ °C. With the 1.3 V maximum, 1.04 W and 94 °C: under the 125 °C TI recommends. All seven channels at 200 mA would reach 118 °C with the typical 1.0 V and 146 °C with the maximum, past that limit.`],
		[r`An input sits 1.0 V above the emitter. Does a Darlington conduct? A Sziklai pair?`, r`The Darlington needs about 1.2 to 1.4 V across its two junctions, so it stays off or nearly so. The Sziklai pair has a single junction between base and emitter, about 0.6 V, so it conducts. Fully on, both still drop at least a $V_{BE}$ plus a $V_{CE(sat)}$.`]
	],

	parts: ['TIP120', 'ULN2003A'],
	related: ['npn', 'n-mosfet', 'igbt']
};
