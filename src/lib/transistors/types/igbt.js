// The insulated-gate bipolar transistor. Content of one page of the
// transistor guide: see src/lib/transistors/types/index.js for what each
// field is. Strings with formulas use String.raw so a LaTeX backslash stays
// one backslash.
const r = String.raw;

export default {
	slug: 'igbt',
	name: 'Insulated-gate bipolar transistor (IGBT)',
	short: 'IGBT',
	family: 'power',
	symbol: { name: 'igbt_transistor_horz', labels: { 1: 'E', 2: 'C', 3: 'G' } },
	control: 'Voltage from gate to emitter: 15 V on, 0 V or negative off',
	normally: 'off',
	fullyOn: r`A knee: $V_{CE(sat)}$ of 1.5 to 2.5 V, growing slowly with current`,
	terminals: [
		['G', 'gate'],
		['C', 'collector'],
		['E', 'emitter']
	],
	oneLiner: 'A MOSFET gate driving a bipolar output: switched by a voltage like a MOSFET, it drops a nearly fixed 1.5 to 2.5 V when on, which beats a resistance at high voltage and high current.',
	usedFor: ['Motor drives and inverters', 'Induction heating and welding supplies', 'Switches for 600 V and more, tens of amperes, up to a few tens of kHz'],

	howItWorks: [
		{
			p: r`An IGBT is built like a vertical power MOSFET with one layer added: a $P^+$ layer under the lightly doped $N^-$ drift region, on the collector side. Its gate is a MOSFET gate, insulated by oxide; its collector and emitter carry the names of a bipolar transistor. Application notes draw it as an N-channel MOSFET whose drain current is the base current of a wide-base PNP, and that equivalent circuit is what the simulation further down builds.`
		},
		{
			p: r`A gate-emitter voltage above the threshold $V_{GE(th)}$ forms the MOSFET channel, and electrons flow from the emitter through it into the drift region. That flow is the base current of the PNP, so the $P^+$ layer, which is the emitter of the PNP, injects holes into the drift region. The extra carriers lower the resistance of the region that blocks the high voltage, an effect called **conductivity modulation**. An onsemi application note, AN-9020, finds the drop across it significantly smaller than in a MOSFET.`
		},
		{
			note: 'The names cross over: the collector of the IGBT is the emitter of the PNP inside, and the emitter of the IGBT is tied to the collector of the PNP. From outside the part works like an N-channel MOSFET or an NPN: a positive gate turns it on, and the current flows from collector to emitter.',
			tone: 'info'
		},
		{
			eq: r`V_{CE} = V_{EB(\text{PNP})} + V_{DS(\text{MOS})}`,
			intro: 'In the equivalent circuit the load current enters through the emitter junction of the PNP, and the MOSFET sits between the base of the PNP and the emitter of the IGBT, so:'
		},
		{
			p: r`The first term is a forward-biased junction, so the voltage never falls below about one diode drop, whatever the current. The PNP never saturates either: the MOSFET holds its base $V_{DS}$ above its collector, the way the driver of a Darlington keeps the output transistor out of saturation. An IGBT datasheet therefore gives a saturation voltage $V_{CE(sat)}$ instead of an $R_{DS(on)}$. The 1200 V IKW40N120H3 drops 2.05 V typical and 2.40 V maximum at $I_C = 40$ A, $V_{GE} = 15$ V and 25 °C, and 2.70 V typical at 175 °C. In the simulation the sum is about 0.8 V at 2.3 A, almost all of it the junction. A real part adds the drop of its drift region and channel, and lands between about 1.5 and 2.5 V at its rated current and room temperature.`
		},
		{
			eq: r`P_{MOS} = I^2 R_{DS(on)} \qquad P_{IGBT} \approx V_{CE(sat)}\, I \qquad I^* = \frac{V_{CE(sat)}}{R_{DS(on)}}`,
			intro: r`Fully on, a MOSFET is a resistance and an IGBT a nearly fixed voltage, so their conduction losses at a current $I$ are:`
		},
		{
			p: r`The loss of the MOSFET grows as the square of the current, that of the IGBT about in proportion, and the two are equal at the crossing current $I^*$. Above it the IGBT wastes less. The higher the voltage a part must block, the thicker and more lightly doped its drift region, and a MOSFET pays for that in $R_{DS(on)}$. The IGBT floods that region with holes and pays much less: the 650 V onsemi FGHL40T65MQD drops 1.45 V typical at 40 A and 25 °C, the 1200 V IKW40N120H3 2.05 V, about 0.6 V more for nearly twice the voltage. That is why IGBTs win at high voltage and high current.`
		},
		{ h: 'Turning off: the tail' },
		{
			p: r`Turning off is where the IGBT pays for its holes. The gate closes the channel at once, but the drift region, which is the base of the PNP, has no terminal of its own, so nothing pulls the stored holes out: they must recombine, and until they do a decaying current, the **current tail**, keeps flowing with the full voltage already across the part. AN-9020 notes that a negative gate voltage does not shorten it. The fall time on the datasheet leaves the tail out: the IKW40N120H3 lists a fall time $t_f$ of only 16 ns at 25 °C, worth $\frac{1}{2} \times 600\ \text{V} \times 40\ \text{A} \times 16\ \text{ns} = 0.19$ mJ, yet a turn-off energy $E_{off}$ of 1.20 mJ, and 2.60 mJ at 175 °C ($V_{CC} = 600$ V, $I_C = 40$ A, $R_G = 12\ \Omega$). $E_{off}$ covers the whole turn-off: the voltage rising while the full current still flows, the fall, and the tail. Losses are therefore computed from the energies, not from the times.`
		},
		{
			eq: r`P_{sw} = (E_{on} + E_{off})\, f_{sw} = E_{ts}\, f_{sw}`,
			intro: 'Every cycle has one turn-on and one turn-off, so the switching loss grows in proportion to the frequency:'
		},
		{
			p: r`$E_{on}$ and $E_{off}$ are the energies of one turn-on and one turn-off, $E_{ts}$ their sum and $f_{sw}$ the switching frequency. For the IKW40N120H3 under the same test conditions $E_{ts}$ is 4.40 mJ at 25 °C and 7.00 mJ at 175 °C: 44 to 70 W at 10 kHz, 220 to 350 W at 50 kHz, before any conduction loss. IGBTs therefore switch at a few kHz to a few tens of kHz, and faster switching belongs to MOSFETs.`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Gate', 'Collector to emitter', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff, forward blocking)', r`below $V_{GE(th)}$, 5.0 to 6.5 V on the IKW40N120H3`, 'up to the rating, 1200 V on this part', 'only leakage flows', 'open switch'],
					['Current source (active)', r`above $V_{GE(th)}$`, 'large', r`$I_C$ set by $V_{GE}$ through the channel, nearly independent of $V_{CE}$`, 'crossed at every switching edge; a short circuit holds the part here'],
					['Fully on (saturation)', '15 V', r`$V_{CE(sat)}$, 1.5 to 2.5 V`, r`$I_C$ set by the load`, 'closed switch']
				]
			}
		},
		{
			note: r`"Saturation" here is the bipolar word: $V_{CE(sat)}$ is the fully-on voltage, as on the NPN page, even though the control is a MOSFET gate. On a MOSFET datasheet "saturation" is the current-source region, the opposite. Inside a fully-on IGBT the MOSFET is in its triode region and the PNP is not saturated at all.`,
			tone: 'warn'
		},
		{ h: 'No body diode' },
		{
			p: r`A power MOSFET carries a diode from source to drain for free, its body diode. In an IGBT the $P^+$ collector layer sits under the drift region, where the MOSFET has its drain, so a current from emitter to collector would have to cross that junction backwards: the IGBT has no reverse diode of its own. A bridge, which needs a diode across each switch to carry the load current back, uses parts with one added in the package. The IKW40N120H3 is sold as a "DuoPack" with an anti-parallel diode; the title of a datasheet says whether the diode is there.`
		},
		{ h: 'The thyristor inside' },
		{
			p: r`The structure also holds an NPN, formed by the $N^+$ emitter, the P body and the drift region. With the PNP it makes a four-layer PNPN device, a thyristor, which latches once on. Normal operation keeps it off. If it ever fires, AN-9020 states that the current is no longer controlled by the MOS gate: this **latch-up** is a failure, not a mode of use.`
		},
		{ h: 'Which switch where' },
		{
			p: r`International Rectifier's application note "IGBT or MOSFET: Choose Wisely" gives rules of thumb: IGBTs above 1000 V, above 5 kW and below 20 kHz; MOSFETs below 250 V, below 500 W and above 200 kHz. Between them, from 250 to 1000 V and 10 to 200 kHz, the losses decide, part by part. Motor drives, inverters, induction heaters and welders sit on the IGBT side.`
		},
		{
			table: {
				head: ['Switch', 'Range', 'Frequency', 'Fully on'],
				rows: [
					['Small BJT or MOSFET', 'under 60 V and 0.5 A, driven from logic', 'any', 'a fixed 0.05 to 0.3 V, or a few ohms'],
					['Power MOSFET', 'under 250 V, amperes, under 500 W', 'up to MHz', r`$R_{DS(on)}$, milliohms`],
					['Superjunction MOSFET or IGBT', '250 to 1000 V, above 500 W', '10 to 200 kHz', 'compare the losses'],
					['IGBT', 'above 1000 V, above 5 kW', 'below 20 kHz', r`a knee, $V_{CE(sat)}$ 1.5 to 2.5 V`],
					['SiC MOSFET', 'high voltage, 900 V for the C3M0065090D', 'higher than an IGBT', r`$R_{DS(on)}$, 65 mΩ typical at 25 °C for that part`],
					['GaN transistor', 'up to about 650 V', 'very high', r`$R_{DS(on)}$`]
				]
			}
		},
		{
			more: [
				{ p: r`Over its working range the output curve of the datasheet, $I_C$ against $V_{CE}$, is close to a straight line that misses the origin: a knee voltage $V_{CE0}$ plus a slope resistance $r_{CE}$, both read off the curve at the hot temperature. Averaging $v\, i$ over a period with that line gives the conduction loss:` },
				{ eq: r`V_{CE} \approx V_{CE0} + r_{CE}\, I_C \qquad P_{cond} = V_{CE0}\, \bar I_C + r_{CE}\, I_{C,rms}^2` },
				{ p: r`$\bar I_C$ is the average of the collector current and $I_{C,rms}$ its RMS value. A MOSFET has only the second term. Against a MOSFET of resistance $R_{DS(on)}$ the losses meet at $I^* = V_{CE0} / (R_{DS(on)} - r_{CE})$, the point the curves below mark. With their 0.9 V and 25 mΩ, 40 A for half of each period gives $\bar I_C = 20$ A and $I_{C,rms}^2 = 800\ \text{A}^2$, so $P_{cond} = 0.9 \times 20 + 0.025 \times 800 = 38$ W.` }
			],
			summary: 'Conduction loss with a knee and a slope'
		}
	],

	curves: {
		widget: 'lossCompare',
		props: { rds: 0.08, v0: 0.9, r: 0.025, imax: 40 },
		caption: r`Conduction loss against current, both parts hot. The MOSFET is 80 mΩ: a 650 V superjunction part with 32 mΩ at 25 °C, about 2.5 times that at 150 °C. The IGBT is a knee of 0.9 V plus 25 mΩ, 1.9 V at 40 A, close to the 1.77 V of the 650 V FGHL40T65MQD at 175 °C. The losses meet at $0.9 / (0.08 - 0.025) = 16.4$ A; past it the IGBT wastes less. Switching losses come on top; they favour the MOSFET, unless its body diode has to recover in a bridge.`
	},

	sims: ['igbt-model'],

	rules: [
		{
			title: r`Conduction: $V_{CE(sat)}\, I$ against $I^2 R_{DS(on)}$, both hot`,
			body: [
				{ p: r`At the same current an IGBT dissipates about $V_{CE(sat)}\, I$ and a MOSFET $I^2 R_{DS(on)}$. Both rise with temperature, and a power switch runs hot, so the comparison uses hot values.` },
				{ eq: r`I^* = \frac{V_{CE(sat)}}{R_{DS(on)}}`, intro: 'The losses are equal at the crossing current:' },
				{ p: r`Two 650 V parts at 40 A DC. The onsemi FGHL40T65MQD IGBT drops 1.77 V at 175 °C: $1.77 \times 40 = 71$ W. The onsemi NTH4LN040N65S3H superjunction MOSFET has 32 mΩ typical at 25 °C and about 2.5 times that at 150 °C, 80 mΩ: $0.08 \times 40^2 = 128$ W. Hot, the crossing is $1.77 / 0.08 = 22$ A; cold, $1.45\ \text{V} / 32\ \text{m}\Omega = 45$ A. Both use $V_{CE(sat)}$ at 40 A; at 22 A the IGBT drops less, so the hot crossing sits somewhat lower, as the knee model of the curves shows. Below the crossing this MOSFET conducts better, above it the IGBT does.` },
				{ p: r`Conduction is not the whole comparison. In a hard-switched bridge the body diode of the MOSFET carries the load current back, and the NTH4LN040N65S3H diode stores $Q_{rr} = 11.4\ \mu\text{C}$: recovering it at 400 V costs roughly $11.4\ \mu\text{C} \times 400\ \text{V} = 4.6$ mJ per cycle, more than the whole $E_{ts}$ of the FGHL40T65MQD, 1.38 mJ at 400 V, 40 A and 25 °C. The topology decides as much as $R_{DS(on)}$.` }
			]
		},
		{
			title: r`Switching: $E_{ts}\, f_{sw}$, with the energies at the hot temperature`,
			body: [
				{ p: r`The datasheet measures the energy of each switching event with an inductive load and a diode, the way a bridge works. That energy times the frequency adds to the conduction loss, with $D$ the fraction of the time the IGBT is on:` },
				{ eq: r`P = V_{CE(sat)}\, I\, D + E_{ts}\, f_{sw}` },
				{ p: r`The IKW40N120H3 switching 40 A at 600 V with $R_G = 12\ \Omega$: $E_{ts} = 7.00$ mJ at 175 °C, tail and diode recovery included. Conducting half the time at 2.70 V costs $2.70 \times 40 \times 0.5 = 54$ W; switching adds 35 W at 5 kHz and 140 W at 20 kHz. The two are equal near 7.7 kHz, and above that a faster part saves more than a lower $V_{CE(sat)}$. A gate resistor larger than the test value slows the edges and raises the energies. Energies at other currents and voltages come from the datasheet curves; scaling them in proportion is only an estimate.` }
			]
		},
		{
			title: 'Gate drive: 15 V on, 0 V or negative off, from a driver that gives amperes',
			body: [
				{ p: r`The datasheets test at $V_{GE} = 15$ V, and the threshold of the IKW40N120H3 is 5.0 to 6.5 V, measured at a small current: a 3.3 V logic pin does not reach it, and a 5 V pin reaches at best the minimum, where only that small current flows. The gate is rated ±20 V. Off is 0 V, as in the switching tests of the datasheet, or a negative voltage in a bridge (next rule).` },
				{
					eq: r`I_G \approx \frac{Q_G}{t_{sw}} \qquad \bar I_G = Q_G\, f_{sw} \qquad P_{gate} = V_{DRV}\, Q_G\, f_{sw}`,
					intro: r`The gate is a capacitor: the driver puts a charge $Q_G$ in at every turn-on and takes it out at every turn-off.`
				},
				{ p: r`$t_{sw}$ is the time allowed for an edge and $V_{DRV}$ the swing of the driver. The IKW40N120H3 takes $Q_G = 185$ nC to reach 15 V (at $V_{CC} = 960$ V, $I_C = 40$ A). Moving it in 200 ns takes about 0.9 A, which a gate-driver IC delivers; a TL082 output, good for about 5 mA, would take 37 µs. The average is small: at 20 kHz, $185\ \text{nC} \times 20\ \text{kHz} = 3.7$ mA and 56 mW from a 15 V driver.` }
			]
		},
		{
			title: 'In a bridge, hold the gate down: a negative bias or a Miller clamp',
			body: [
				{ p: r`When the other switch of a bridge leg turns on, the voltage across the off IGBT jumps from near zero to the full supply within one edge. The gate-collector capacitance $C_{GC}$, the Miller capacitance, listed as $C_{res}$ on a datasheet, pushes a current $C_{GC}\, dv/dt$ into the gate. Through the gate resistor it can lift the gate past $V_{GE(th)}$ and turn the IGBT on across the supply: shoot-through.` },
				{
					eq: r`I = C_{GC}\, \frac{dv}{dt} \qquad R_{GE} < \frac{V_{GE(th)}}{C_{GC}\, (dv/dt)}`,
					intro: 'With only a resistor from gate to emitter holding it, as at power-up before the driver runs, the gate stays below the threshold if:'
				},
				{ p: r`With round figures, 100 pF and an edge of 5 V/ns, the current is 0.5 A: $R_{GE}$ would have to be under 10 Ω to hold the gate below 5.0 V, and less on a hot die, whose threshold is lower. Across the 12 Ω gate resistor of the datasheet tests the same current would mean up to 6 V. A resistor that small cannot stay on the gate: with the 12 Ω gate resistor it would divide a 15 V drive down to $15 \times 10 / 22 = 6.8$ V and draw 0.68 A. Bridge drivers therefore hold the gate down harder: with a negative off voltage, which AN-9020 shows also lowers the turn-off loss, or with a **Miller clamp**, a switch in the driver IC that ties the gate straight to the emitter once the IGBT is off, bypassing the gate resistor. A resistor of some kilohms from gate to emitter still keeps the gate from floating while the driver is unpowered, and the formula allows 50 kΩ for a slow edge of 1 V/µs, but it is far too large to hold the gate against a fast edge.` }
			]
		},
		{
			title: 'Short circuit: the protection has 10 µs',
			body: [
				{ p: r`In a short circuit the IGBT leaves saturation: it carries a current limited only by its channel with the whole supply across it, and the die heats in microseconds. The IKW40N120H3 is rated to survive $t_{SC} = 10$ µs of it, at $V_{GE} = 15$ V, $V_{CC} \le 600$ V and a junction at 175 °C. The protection must detect the fault and turn the gate off within that time. The rating holds at 15 V on the gate: a higher gate voltage lets the channel carry more current, and the 10 µs no longer applies.` },
				{
					eq: r`V_{trip} > V_{CE(sat)} \qquad t_{blank} + t_{off} < t_{SC}`,
					intro: r`A gate driver that watches $V_{CE}$ while the gate is on, called desaturation detection, sees the fault as a collector voltage far above the on-state drop. It needs:`
				},
				{ p: r`$V_{trip}$ is the level at which the driver declares a fault, $t_{blank}$ the wait after each turn-on while $V_{CE}$ is still falling, and $t_{off}$ the time to bring the gate down. For the IKW40N120H3 at 40 A, $V_{trip}$ must sit well above 2.70 V, the typical $V_{CE(sat)}$ at 175 °C, and far below the 600 V a short circuit puts across the part; $t_{blank} + t_{off}$ must stay well inside the 10 µs.` }
			]
		}
	],

	mistakes: [
		['An IGBT has a body diode, like a power MOSFET.', r`It has none: the $P^+$ collector layer blocks the reverse path. Parts for bridges add a separate diode in the package, the "DuoPack" of the IKW40N120H3; the title of the datasheet says whether one is there.`],
		['The diode in the package protects a low-side IGBT from an inductive kick.', 'That diode sits across the IGBT, from emitter to collector, and conducts only when the collector falls below the emitter. The kick drives the collector above the supply, so a low-side switch still needs a freewheel diode across the load.'],
		['An IGBT beats a MOSFET at any high current.', r`Only past the crossing current $V_{CE(sat)} / R_{DS(on)}$, about 22 A for the two hot 650 V parts above, and only where switching losses stay small. Below the crossing, and at tens of kHz and more, the MOSFET usually wastes less, unless its body diode must recover in a hard-switched bridge.`],
		['The gate draws no current, so a logic pin or an op-amp can drive it.', r`$V_{GE(th)}$ reaches 6.5 V on the IKW40N120H3, above any logic level, and the datasheets test at 15 V. The gate also needs its charge quickly: 185 nC in 200 ns is about 0.9 A. A TL082 would take 37 µs per edge, leaving the IGBT half on with high voltage across it.`],
		[r`The fall time $t_f$ on the datasheet tells how fast the IGBT turns off.`, r`It leaves out most of the turn-off. The IKW40N120H3 lists $t_f = 16$ ns at 25 °C, worth only about 0.19 mJ at 600 V and 40 A, yet $E_{off} = 1.20$ mJ at 25 °C and 2.60 mJ at 175 °C (600 V, 40 A). Before the fall the voltage rises with the full current still flowing, and after it the stored holes keep a current flowing. Losses come from $E_{off}$, which includes both.`],
		['A TO-247 IGBT handles tens of watts on its own.', r`In free air a TO-247 has about 40 °C/W from junction to air (the onsemi FGHL40T65MQD), so with a 175 °C junction limit it dissipates only $(175 - 25) / 40 = 3.75$ W in a 25 °C room. At 40 A the conduction loss alone is 58 W at 1.45 V and 108 W at 2.70 V: the part lives on a heatsink. The $I_C$ rating on page 1 assumes an ideal heatsink holding the case at a fixed temperature: the onsemi FGH40N60SMD lists 80 A at $T_C = 25$ °C but 40 A at $T_C = 100$ °C.`]
	],

	variants: [
		{ p: r`**Co-packed or bare.** IGBTs come alone or with an anti-parallel diode in the package, sold as DuoPack by Infineon (the IKW40N120H3) or as a co-pack by onsemi (the FGHL40T65MQD). In a bridge that diode carries the load current back, and its recovery charge $Q_{rr}$ shows up in the turn-on energy of the IGBT across from it: it deserves the same reading as the IGBT.` },
		{ p: r`**The thyristor family.** The SCR and the TRIAC use the PNPN latch on purpose: a gate pulse turns them on, and only a fall of the current below the holding current turns them off. The IGBT has the same four layers, kept from latching, so its gate turns it off as well as on.` },
		{ p: r`**SiC MOSFETs** reach IGBT voltages as plain MOSFETs, with a resistance when on and no injected holes, so no tail: the 900 V Wolfspeed C3M0065090D has 65 mΩ typical at 25 °C and 90 mΩ at 150 °C, and is driven at 15 V on and -4 V off. The GaN and SiC page covers them.` }
	],

	bench: [
		{
			note: 'Real IGBT circuits run from hundreds of volts, often rectified mains, and their capacitors stay charged after the power is off. They belong on a printed board with a gate-driver IC, never on a breadboard. The checks below use a meter and 15 V only.',
			tone: 'warn'
		},
		{ p: r`**Meter check.** On the diode range the gate reads open to both other legs, both ways: it is insulated. Between collector and emitter a bare IGBT reads open both ways. With a co-packed diode, as in the IKW40N120H3, red on E and black on C reads that diode, and the other way stays open. A 9 V battery touched for a moment from G (+) to E (-) charges the gate above $V_{GE(th)}$: red on C and black on E then reads about one junction drop, and keeps reading it for a while after the battery is gone, because nothing discharges the insulated gate. Touching G to E turns it off again.` },
		{ p: r`**First build, at 15 V only.** The IGBT on clip leads or a terminal strip, not a breadboard, to keep the habit: a red LED and 1 kΩ from the lab +15 V to the collector, the emitter to 0 V, and the gate fed through 100 Ω from the wiper of a 10 kΩ potentiometer across the 15 V supply. As the potentiometer turns up, the meter on G and E reads the threshold when the LED starts to glow: 5.0 to 6.5 V for the IKW40N120H3, 3.0 to 6.0 V for the FGHL40T65MQD. At 15 V the LED is fully on at about 12 mA, and C to E reads about one junction drop however high the gate goes, the knee of the simulation. A MOSFET of 80 mΩ would drop 1 mV at that current.` }
	],

	quiz: [
		[r`An IGBT drops a nearly constant 1.8 V and a MOSFET has 60 mΩ, both hot. Where are their conduction losses equal, and which part wins at 10 A and at 50 A?`, r`$I^* = 1.8 / 0.06 = 30$ A. At 10 A the MOSFET loses $10^2 \times 0.06 = 6$ W against $1.8 \times 10 = 18$ W for the IGBT. At 50 A it loses $50^2 \times 0.06 = 150$ W against 90 W: past the crossing the IGBT wins.`],
		[r`An IKW40N120H3 switches 40 A at 600 V and conducts half the time at 2.70 V, with $E_{ts} = 7.00$ mJ hot. What is its total loss at 5 kHz and at 50 kHz?`, r`Conduction: $2.70 \times 40 \times 0.5 = 54$ W. Switching: $7.00\ \text{mJ} \times 5\ \text{kHz} = 35$ W, or 350 W at 50 kHz. Total 89 W at 5 kHz and 404 W at 50 kHz, where switching is 87 % of it: the switching energy sets the frequency. Of the 7.00 mJ, the turn-off with its tail is 2.60 mJ; the other 4.40 mJ is the turn-on, which includes the recovery of the diode across.`],
		[r`The gate of an IKW40N120H3 is driven from 0 to 15 V at 20 kHz. What average current and power does it take, and why can a TL082 not drive it?`, r`$\bar I_G = 185\ \text{nC} \times 20\ \text{kHz} = 3.7$ mA and $P = 15 \times 185\ \text{nC} \times 20\ \text{kHz} = 56$ mW: small. But each edge must move the 185 nC quickly. At the 5 mA a TL082 is good for, one edge takes 37 µs, and two edges, 74 µs, last longer than the 50 µs period: the IGBT would never be fully on or fully off, with voltage and current across it at once.`]
	],

	parts: ['IKW40N120H3', 'FGH40N60SMD'],
	related: ['n-mosfet', 'gan-sic', 'darlington']
};
