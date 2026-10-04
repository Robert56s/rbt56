// The N-channel enhancement MOSFET. Content of one page of the transistor
// guide: see src/lib/transistors/types/index.js for what each field is.
// Strings with formulas use String.raw so a LaTeX backslash stays one backslash.
const r = String.raw;

export default {
	slug: 'n-mosfet',
	name: 'N-channel enhancement MOSFET',
	short: 'N-MOSFET',
	family: 'fet',
	symbol: { name: 'n_channel_e_mosfet_transistor_horz', labels: { drain: 'D', gate: 'G', source: 'S' } },
	control: 'Voltage from gate to source, a few volts positive',
	normally: 'off',
	fullyOn: r`A resistance, $R_{DS(on)}$: milliohms in a power part, ohms in a small one`,
	terminals: [
		['G', 'gate'],
		['D', 'drain'],
		['S', 'source']
	],
	oneLiner: r`A gate held a few volts above the source opens a channel that conducts from drain to source like a small resistor, and the gate itself draws no steady current.`,
	usedFor: ['Low-side switches from logic pins, milliamps to tens of amperes', 'PWM drivers for motors, LED strips and heaters', 'Level shifters between 3.3 V and 5 V logic'],

	howItWorks: [
		{
			p: r`An N-MOSFET (metal-oxide-semiconductor field-effect transistor) is a P-type body with two N-type islands in it, the source and the drain. Above the gap between them sits the gate, a conducting plate on a thin layer of oxide (glass). The gate touches nothing: it is one plate of a capacitor whose other plate is the silicon below. With the gate at the source voltage, source and drain are two N regions separated by P silicon, and nothing flows. Raising the gate above the threshold voltage $V_{th}$ draws enough electrons to the surface under the oxide to turn a thin layer of it N-type: a channel now joins source to drain. The higher the gate, the more electrons and the lower the channel's resistance.`
		},
		{
			p: r`The body is a fourth terminal. A discrete part ties it to the source inside the package, and that tie leaves a PN junction from the source (P body, anode) to the drain (cathode): the **body diode**, drawn in the symbol of most parts. In the symbol the arrow sits on the body and points in, from the P body to the N channel; on a P-MOSFET it points out. The channel line is broken in three: enhancement, off with the gate at the source. A power MOSFET puts many small cells in parallel on one die and runs the current vertically through it, from the drain underneath up to the source on top, which is how one die carries tens of amperes. Like the NPN it is off with its control pin at 0 V, here the gate tied to the source, but a voltage controls it, not a current: once the gate is charged, the 2N7000 guarantees under 10 nA into it at 15 V.`
		},
		{
			eq: r`I_D = k \left[ V_{ov}\, V_{DS} - \tfrac12 V_{DS}^2 \right] \qquad R_{DS} \approx \frac{1}{k\, V_{ov}} \ \text{ for small } V_{DS}`,
			intro: r`Above the threshold the drain current follows the square law, written with the overdrive $V_{ov} = V_{GS} - V_{th}$, the gate voltage in excess of the threshold. While $V_{DS} < V_{ov}$ the channel is a resistor that the gate sets:`
		},
		{
			eq: r`I_D = \tfrac12 k\, V_{ov}^2 \left(1 + \lambda V_{DS}\right) \qquad V_{DS} \ge V_{ov}`,
			intro: 'Once the drain is more than $V_{ov}$ above the source, the channel pinches off at the drain end and the current stops growing: the part becomes a current source set by the gate:'
		},
		{
			p: r`$k = \mu_n C_{ox} W / L$, in A/V², grows with the mobility of electrons $\mu_n$, the oxide capacitance per unit area $C_{ox}$, and the width-to-length ratio of the channel. $\lambda$, per volt, is the small rise of current with $V_{DS}$ in saturation. The curves below use $V_{th} = 2$ V, $k = 5$ mA/V² and $\lambda = 0.01$ /V. At $V_{GS} = 4$ V, $V_{ov} = 2$ V: about 10 mA in saturation, 11 mA at $V_{DS} = 10$ V, and a channel of $1 / (5\ \text{mA/V}^2 \times 2\ \text{V}) = 100\ \Omega$ for small $V_{DS}$. A power MOSFET follows these laws only roughly, and its datasheet gives curves instead of $k$.`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Gate', 'Drain-source', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff)', r`$V_{GS} < V_{th}$`, 'up to the rating', 'only leakage flows', 'open switch'],
					['Fully on (triode, ohmic)', r`above $V_{th}$, well above for a switch`, r`$V_{DS} < V_{GS} - V_{th}$`, r`a resistor set by the gate, $R_{DS(on)}$ on a datasheet; conducts either way`, 'closed switch'],
					['Current source (saturation)', r`above $V_{th}$`, r`$V_{DS} \ge V_{GS} - V_{th}$`, r`$I_D$ set by $V_{GS}$, nearly independent of $V_{DS}$`, 'amplifier, linear regulator, electronic load'],
					['Reverse', r`below $V_{th}$`, 'drain a diode drop below the source', 'the body diode conducts', 'freewheeling, level shifting']
				]
			}
		},
		{
			note: r`The names clash three ways. A BJT's "saturation" is its fully-on switch, but a MOSFET's "saturation" is the current-source region, the BJT's active region. Textbooks and the simulator's hover box call the fully-on region "linear", while power-MOSFET application notes say "linear mode" for the current-source region, where a part works as a regulator or an electronic load; Nexperia uses both meanings in one paragraph. The region is set by $V_{DS}$ against $V_{GS} - V_{th}$, whatever the word.`,
			tone: 'warn'
		},
		{ h: 'The threshold is a test point, not the turn-on voltage' },
		{
			p: r`A datasheet defines $V_{GS(th)}$ as the gate voltage at which a small test current flows with the drain tied to the gate: 1 mA for the 2N7000 and BSS138, 250 µA for the IRF540N and IRLZ44N. At its threshold the part is barely on. The spread is wide, 0.8 to 3 V for the 2N7000 (2.1 V typical), and the threshold falls as the die warms, by 2 mV/°C typical on a BSS138; TI gives about 7 mV/°C as a rough figure. A switch needs the line that guarantees $R_{DS(on)}$ at a stated $V_{GS}$, several volts higher: 4.5 V and 10 V for the 2N7000. The first design rule turns this into the choice of a part.`
		},
		{ h: 'The body diode, and the two-way level shifter' },
		{
			p: r`The body diode conducts whenever the drain goes a diode drop below the source, whatever the gate does: an off N-MOSFET blocks in one direction only. Blocking both ways takes two parts back to back, source to source. The diode is also slow to stop conducting, because it stores charge, and in a bridge that charge costs energy at every switching edge.`
		},
		{
			p: r`The third simulation puts the diode to work in the level shifter of NXP's note AN10441, written for the I2C bus. A BSS138 has its gate on the 3.3 V supply, its source on the 3.3 V line and its drain on the 5 V line, each line with its own pull-up. With nothing pulling down, $V_{GS} = 0$ and each side sits at its own supply. When the 3.3 V side pulls low, $V_{GS}$ rises to 3.3 V and the channel pulls the 5 V side down as well. When the 5 V side pulls low, the body diode drags the 3.3 V side down until $V_{GS}$ passes the threshold, and then the channel takes over. Either side can drive, each side only sees its own voltage, and the note limits the circuit to 400 kbit/s. The margin depends on the lower supply (question 3).`
		},
		{ h: 'Low side and high side' },
		{
			p: r`On the low side, source on ground and the load between the supply and the drain, the gate voltage is the logic voltage itself: a 5 V pin gives $V_{GS} = 5$ V whatever the load's supply. On the high side, drain on the supply and the load under the source, the source rises with the load. Keeping the part on then needs a gate above the supply, from a bootstrap capacitor or a charge pump, usually inside a driver IC. A bootstrap alone cannot hold the switch on at 100 % duty. A P-MOSFET needs no rail above the supply, but its gate must swing from the supply to several volts below it, so on a rail above the logic supply a pin drives it through a small transistor and a pull-up (its own page). It also has a higher resistance for the same die size, because holes move more slowly than electrons. In one catalogue pair, Vishay's IRF540 is 0.077 Ω at most and its P-channel counterpart, the IRF9540, 0.20 Ω, both with 10 V of gate drive ($V_{GS} = -10$ V for the P part), though their dies may differ.`
		},
		{
			more: [
				{ p: r`Biased in saturation, the part amplifies as a current source controlled by $V_{GS}$. Its small-signal numbers follow from the square law:` },
				{ eq: r`g_m = k\, V_{ov} = \frac{2 I_D}{V_{ov}} = \sqrt{2 k I_D} \qquad r_o \approx \frac{1}{\lambda I_D}` },
				{ p: r`A BJT at the same current has $g_m = I_C / V_T$, with $V_T = 25.85$ mV at 300 K the thermal voltage, not the threshold. The MOSFET's is smaller by the factor $V_{ov} / (2 V_T)$: 3.9 times at $V_{ov} = 0.2$ V, 19 times at 1 V. With the curves' $k = 5$ mA/V² at 10 mA, $V_{ov} = 2$ V and $g_m = 10$ mS, against 387 mS for a BJT.` },
				{ eq: r`A_v = -g_m \left(R_D \parallel r_o\right)`, intro: r`A common-source stage, input on the gate and output on the drain with its resistor $R_D$, has the voltage gain:` },
				{ p: r`On the curves at $V_{GS} = 3$ V, $I_D \approx 2.5$ mA, $g_m = 5$ mS and $r_o = 1 / (0.01 \times 2.5\ \text{mA}) = 40\ \text{k}\Omega$. With $R_D = 1$ kΩ the gain is $-5\ \text{mS} \times 976\ \Omega = -4.9$. A BJT at the same current has $g_m = 97$ mS and a gain near $-97$, about 20 times more.` },
				{ p: r`Below the threshold the current does not stop at once. It falls exponentially, tenfold for every $n V_T \ln 10 = 59.5\, n$ mV of gate voltage at 300 K, where $n \ge 1$ depends on the device. Nexperia measured a power part whose current grows 100 000 times over less than 1 V of gate, which is why a threshold means nothing without its test current.` },
				{ p: r`When the source sits above the body, $V_{th}$ rises: the body effect. A discrete part ties body to source, so its threshold is the datasheet's, and the price of that tie is the body diode.` }
			],
			summary: 'Small-signal model, subthreshold, body effect'
		}
	],

	curves: {
		widget: 'fetCurves',
		props: { kind: 'enhancement', vdd: 10, rd: 1000 },
		caption: r`Output curves of the square law with $V_{th} = 2$ V, $k = 5$ mA/V² and $\lambda = 0.01$ /V. Left of the dashed parabola, $V_{DS} = V_{GS} - V_{th}$, the part is fully on, a resistor set by the gate; right of it the curves are nearly flat, a current source. The red line is the load line of $R_D$ on $V_{DD}$: a switch jumps from its bottom right end, off, to its top left end, fully on.`
	},

	sims: ['nmos-low-side', 'logic-level', 'level-shifter'],

	rules: [
		{
			title: r`Choose by $R_{DS(on)}$ at the gate voltage the driver really gives`,
			body: [
				{ p: r`"Logic-level" means the datasheet guarantees $R_{DS(on)}$ at a logic gate voltage, not that $V_{GS(th)}$ is low. The IRLZ44N guarantees at most 22, 25 and 35 mΩ at 10, 5 and 4 V. The IRF540N guarantees 44 mΩ at 10 V only, and its threshold may be as high as 4.0 V, where it passes just 250 µA. From a 5 V pin it is a gamble: one part switches fully, the next sits in its current-source region and overheats.` },
				{ eq: r`V_{DS} = I_D\, R_{DS(on)} \quad \text{with } R_{DS(on)} \text{ read at the real } V_{GS}` },
				{ p: r`The second simulation shows the gamble. Its standard part, modelled with $V_{th} = 3.5$ V and $k = 1.5$ A/V², passes at most $\tfrac12 \times 1.5 \times (5 - 3.5)^2 = 1.69$ A at 5 V, short of the 2 A its 6 Ω load asks for. It stays in saturation with 1.9 V across it and burns 3.2 W, while the logic-level part ($V_{th} = 1.5$ V, $k = 3$ A/V²) drops 0.19 V and loses 0.38 W. At 3.3 V the standard part does not conduct at all. A 3.3 V pin needs a part rated at 2.5 V, such as the AO3400A, 48 mΩ at most at 2.5 V.` }
			]
		},
		{
			title: r`Conduction loss: $I^2 R_{DS(on)}$, with the hot resistance`,
			body: [
				{ eq: r`P = I_{D,rms}^2\, R_{DS(on)}(T_J) \qquad T_J = T_A + P\, R_{\theta JA}` },
				{ p: r`$R_{DS(on)}$ rises with temperature, 1.5 to 2.2 times from 25 °C to 125 °C for silicon parts: 1.58 times typical on a 2N7000, about 1.65 on an IRLZ44N (read from its graph). Loss and temperature feed each other, so the sum is repeated until it settles.` },
				{ p: r`Example: an IRLZ44N switches 5 A from a 5 V pin, in free air at 25 °C, where $R_{\theta JA} = 62$ °C/W. Cold, $P = 5^2 \times 0.025 = 0.63$ W, a rise of 39 °C. The warmer die has a higher resistance, and the loop settles near $T_J = 75$ °C and 0.8 W, well under the 175 °C limit. At 10 A the same part loses 2.5 W cold, already 155 °C of rise, and the loop never settles: thermal runaway. On a 5 °C/W heatsink, with 1.4 °C/W from junction to case and 0.5 °C/W from case to sink, 10 A gives 2.75 W and a junction near 44 °C.` },
				{ p: r`The current printed on the first page of a datasheet assumes the mounting base held at 25 °C, a heatsink no breadboard has; the thermal resistance decides what a part really carries. With PWM, $I_{D,rms}$ is the on-current times the square root of the duty cycle.` }
			]
		},
		{
			title: 'The gate is a capacitor: charge it fast, never leave it floating',
			body: [
				{
					eq: r`I_G \approx \frac{Q_G}{t_{sw}} \qquad P_{sw} \approx \tfrac12 V_{DD}\, I_D \left(t_r + t_f\right) f`,
					intro: r`The driver has to move the total gate charge $Q_G$ within the switching time $t_{sw}$. During the two transitions, $t_r$ and $t_f$, voltage and current overlap in the transistor, at every period of the switching frequency $f$:`
				},
				{ p: r`The IRLZ44N needs at most 48 nC to reach 5 V on its gate. A pin that sources about 20 mA takes up to $48\ \text{nC} / 20\ \text{mA} = 2.4\ \mu\text{s}$ per edge; a gate driver giving 0.48 A does it in 100 ns. With the pin as driver, switching 5 A from 12 V costs at most $\tfrac12 \times 12 \times 5 \times 4.8\ \mu\text{s} = 0.14$ mJ per period, counting the whole charging time as transition. That is 0.14 W at 1 kHz, but 2.9 W at 20 kHz, nine times the 0.31 W of conduction at half duty. With the driver it falls to 0.12 W at 20 kHz. A pin is enough for slow switching; fast PWM wants a gate driver.` },
				{ p: r`On the way up, $V_{GS}$ stops rising for a while: the **Miller plateau**, near $V_{th} + I_D / g_{fs}$ with $g_{fs}$ the forward transconductance. There the drive current goes into the gate-drain capacitance while the drain voltage swings, and the charge spent is $Q_{GD}$ on the datasheet's gate-charge curve. The plateau moves with the load current, and it sits above $V_{GS(th)}$, which was measured at a fraction of a milliamp.` },
				{ p: r`Two resistors complete the drive. A series resistor (100 Ω in the first simulation) limits the current drawn from the pin and damps the ringing of the gate capacitance with the inductance of the wiring. A resistor from gate to source (100 kΩ there) holds the gate at 0 V when the driver is unplugged or a microcontroller pin is still an input after reset. A floating gate keeps whatever charge it last received and can leave the part half on, in its current-source region, heating.` },
				{
					more: [
						{ eq: r`R_{G,opt} = 2 \sqrt{\frac{L_S}{C_{iss}}} - \left(R_{DRV} + R_{G,int}\right)`, intro: 'TI gives the series resistance that critically damps the gate loop, less the driver and the internal gate resistances already in it:' },
						{ p: r`A Vishay IRF540, a different part from the IRF540N, with 7.5 nH inside its package, about 10 nH of wiring and 1700 pF of input capacitance needs $2 \sqrt{17.5\ \text{nH} / 1700\ \text{pF}} = 6.4\ \Omega$ in total.` },
						{ eq: r`R_{GS} < \frac{V_{th}}{C_{GD}\, dv/dt}`, intro: 'A fast edge on the drain couples into the gate through the gate-drain capacitance. The pull-down holds the gate off against it only when it is small enough, with the hot threshold:' },
						{ p: r`For a hot threshold of 2 V and the IRF540's 120 pF of $C_{rss}$ at 25 V, this asks for under 16.7 kΩ at 1 V/µs and 1.7 kΩ at 10 V/µs; $C_{GD}$ grows at low $V_{DS}$, so the real limit is lower. A 100 kΩ pull-down only defines the idle level; while switching, the driver itself has to hold the gate down.` }
					],
					summary: 'Sizing the two gate resistors'
				}
			]
		},
		{
			title: 'An inductive load needs a flyback diode, not the avalanche rating',
			body: [
				{ p: r`A coil keeps its current flowing when the switch opens. With a diode across it, cathode to the supply, the drain stops one diode drop above the supply. Without one, the drain climbs until the MOSFET breaks down (avalanche), and the energy of the coil goes into the die at every turn-off:` },
				{ eq: r`E = \tfrac12 L I^2 \qquad P = E\, f` },
				{ p: r`In the first simulation 10 mH at 1.2 A store $\tfrac12 \times 10\ \text{mH} \times (1.2\ \text{A})^2 = 7.2$ mJ: at 100 Hz, about 0.7 W dumped into the transistor at 62 V. A datasheet rates one such pulse as $E_{AS}$, the energy that heats the die from 25 °C to its maximum: 210 mJ for the IRLZ44N, tested with 470 µH at 25 A on 25 V. Nexperia counts avalanche events as outside the safe operating area: the rating covers accidents, and a design uses the diode.` },
				{
					more: [
						{ eq: r`E = \tfrac12 L I^2\, \frac{V_{BR}}{V_{BR} - V_{DD}}`, intro: 'While the drain sits at its breakdown voltage the supply keeps pushing current through the coil, so the die takes more than the stored energy:' },
						{ p: r`With the IRLZ44N's test conditions and a breakdown near 1.3 times its 55 V rating, Nexperia's rule of thumb, this gives 226 mJ, close to the 210 mJ rated, where $\tfrac12 L I^2$ alone gives 147 mJ.` }
					],
					summary: 'Energy with the supply still connected'
				}
			]
		},
		{
			title: 'Linear mode: below the zero-temperature-coefficient point, heat raises the current',
			body: [
				{ p: r`As a current source, in a linear regulator, an electronic load or a slow hot-swap ramp, the part holds volts and amperes at once. Two effects of temperature then compete: the threshold falls, which raises the current, and the channel resistance rises, which lowers it. Below the zero-temperature-coefficient point (ZTC), where the transfer curves at 25 °C and 175 °C cross, the first one wins: a hotter spot draws more current and heats further. The IRLZ44N's curves cross near 20 A, at about 3.3 V on the gate (read from its graph).` },
				{ eq: r`P = I_D\, V_{DS} = \frac{T_{J(max)} - T_{mb}}{Z_{th(j\text{-}mb)}}`, intro: r`The safe operating area (SOA) plots the power the die can shed for each pulse length, from the thermal impedance $Z_{th}$ between junction and mounting base:` },
				{ p: r`Its lines assume the mounting base held at $T_{mb} = 25$ °C and shrink when it is hotter. Example: an IRLZ44N as a 1 A electronic load on 12 V dissipates 12 W, and on the heatsink of the conduction example its junction reaches $25 + 12 \times 6.9 = 108$ °C, inside the steady-state budget. But 1 A is far below the ZTC. Inside the die the current crowds into hot spots (the Spirito effect), and Nexperia shows a part whose allowed current at 20 V falls from a theoretical 60 A to about 15 A. A linear design picks a part with a DC line on its SOA or a linear-mode rating, and favours older planar parts or a larger die over dense trench parts.` },
				{ p: r`**Parallel parts.** Fully on, they share: the hotter one has the higher $R_{DS(on)}$ and takes less. The sharing is never equal, and each gate gets its own small resistor, or the part with the lowest threshold holds the others on its Miller plateau and switches on first and off last. In linear mode parallel parts do not share at all, and a resistor in each source supplies the feedback.` }
			]
		}
	],

	mistakes: [
		['The gate draws no current, so any drive will do, or none.', r`The gate is a capacitor: no steady current, but amperes for nanoseconds at every edge, 0.48 A to move an IRLZ44N's 48 nC in 100 ns. Left floating it keeps whatever charge it picks up and can hold the part half on. A resistor from gate to source keeps it off.`],
		[r`$V_{GS(th)}$ is the voltage that turns the part on, and logic-level means a low threshold.`, r`At $V_{GS(th)}$ the part passes a test current of 250 µA or 1 mA. Logic-level means $R_{DS(on)}$ is guaranteed at 4.5 V or 5 V, sometimes 2.5 V. An IRF540N may need 4.0 V just to pass 250 µA and is specified fully on only at 10 V.`],
		['A MOSFET in saturation is fully on, like a BJT in saturation.', r`MOSFET saturation is the current-source region, $V_{DS} \ge V_{GS} - V_{th}$, where the part holds volts at full current and heats. Fully on is the triode (ohmic) region, which the simulator labels "linear".`],
		['An off MOSFET blocks current both ways.', 'The body diode conducts from source to drain whenever the drain goes a diode drop below the source. Blocking both ways takes two parts back to back, source to source.'],
		['A MOSFET cannot run away thermally.', r`Fully on, the rising $R_{DS(on)}$ makes parallel parts and the cells of one die share current. But at a fixed current the same rise raises the loss, and on too small a heatsink the loop never settles: 10 A in an IRLZ44N in free air, in the conduction rule. Holding volts and amperes below its zero-temperature-coefficient point, its current rises with temperature and gathers in hot spots.`],
		['Small MOSFETs in the same package share one pinout.', 'The TO-92 2N7000 reads S-G-D with the flat face toward the viewer and the legs down; the BS170 in the same package reads D-G-S. The SOT-23 2N7002, in the same datasheet as the 2N7000, is G-S-D. With drain and source swapped in a low-side switch, the body diode conducts from the load to ground and the load stays on whatever the gate does.']
	],

	variants: [
		{ p: r`**Small-signal parts**, the 2N7000 in TO-92 and the BSS138 in SOT-23, carry about 200 mA with ohms of $R_{DS(on)}$ and tens of picofarads on the gate: for LEDs, relays and logic. **Power parts** such as the IRLZ44N and IRF540N carry amperes through milliohms, and need tens of nanocoulombs of gate charge.` },
		{ p: r`**Logic-level parts** guarantee $R_{DS(on)}$ at 4.5 V or 5 V, some at 2.5 V. Their gate rating is often lower, ±16 V for the IRLZ44N against ±20 V for the IRF540N. A lower threshold also leaves less margin to stay off when hot, so some designs choose a standard part on purpose.` },
		{ p: r`The **depletion-mode MOSFET** is the same structure with a channel built in: on at $V_{GS} = 0$, off only with a negative gate. **GaN and SiC** transistors are N-channel enhancement switches in other materials, each with gate limits of its own. Both have their pages.` }
	],

	bench: [
		{ p: r`**Handling.** The oxide under the gate is thin and these parts are static-sensitive: the 2N7000 datasheet guarantees only 100 V of human-body-model discharge, and the BSS138 sits in class 0A, a very sensitive class. The part stays in its conductive foam until it goes into the board, after a touch on a grounded point, and the gate-source resistor goes in before the rest of the circuit.` },
		{ p: r`**Meter check.** First a short from gate to source empties the gate. On the diode range, red lead on the source and black on the drain: one diode drop, 0.4 to 0.7 V, the body diode. Leads swapped: nothing. Gate to either pin: nothing, either way. Red on the gate and black on the source then charges the gate from the meter: if the meter's test voltage is above the threshold, drain to source reads near zero both ways until the gate is shorted to the source again. Pins: the 2N7000 is S-G-D with the flat face toward the viewer, legs down; the SOT-23 BSS138 and 2N7002 have pin 1 gate, pin 2 source, pin 3 drain, and need an adapter on a breadboard.` },
		{ p: r`**First build.** A 2N7000 low-side switch on 5 V: an LED and 330 Ω from 5 V to the drain, the source to ground, 100 Ω from an input wire to the gate, 100 kΩ from gate to source. Input on 5 V: the LED takes about $(5 - 1.8) / 330\ \Omega = 9.7$ mA, and the meter reads at most $9.7\ \text{mA} \times 5.3\ \Omega = 51$ mV from drain to source, nearer 17 mV with the typical 1.8 Ω. Input on 0 V: the LED is dark. A potentiometer on the input finds this part's own threshold, at 1 mA as on the datasheet: 0.33 V across the 330 Ω. It lies somewhere in the datasheet's 0.8 to 3 V, and the LED already glows faintly a little below it. With the input wire and the 100 kΩ both removed, the LED may stay lit, stay dark, or follow a hand brought near the gate.` }
	],

	quiz: [
		[r`An IRF540N and an IRLZ44N are in the drawer, for a 3 A load switched on the low side by a 5 V pin. Which one, and how warm does it run in free air?`, r`The IRLZ44N: it guarantees 25 mΩ at 5 V, while the IRF540N's 44 mΩ holds only at 10 V and its threshold may reach 4.0 V. $P = 3^2 \times 0.025 = 0.225$ W, a rise of $0.225 \times 62 = 14$ °C; with the resistance growing as it warms, the junction settles near 40 °C in a 25 °C room.`],
		[r`On the curves above ($V_{th} = 2$ V, $k = 5$ mA/V², $V_{DD} = 10$ V, $R_D = 1$ kΩ), the gate goes to 3 V, then to 4 V. Which region each time, and what sets the current?`, r`At 3 V, $V_{ov} = 1$ V and the channel passes about $\tfrac12 \times 5 \times 1^2 = 2.5$ mA, 2.7 mA with $\lambda$, leaving 7.3 V across the part: more than $V_{ov}$, so saturation, and the gate sets the current. At 4 V the gate would allow 10 mA in saturation, but 10 mA through 1 kΩ would leave nothing across the part: the point slides left of the edge to 1.26 V and 8.7 mA, below $V_{ov} = 2$ V, so triode, a channel of about 144 Ω, and the resistor sets the current.`],
		[r`Can the BSS138 level shifter of the third simulation serve a 1.8 V bus against a 5 V one?`, r`Not with a guarantee. With the 1.8 V side driven to a logic low of 0.4 V, $V_{GS} = 1.8 - 0.4 = 1.4$ V, under the BSS138's maximum $V_{GS(th)}$ of 1.5 V, and even 1.5 V only promises 1 mA. At 3.3 V the margin is $3.3 - 0.4 - 1.5 = 1.4$ V, at 2.5 V only 0.6 V. A 2N7000, with its threshold up to 3 V, is not guaranteed even at 3.3 V: $3.3 - 0.4 = 2.9$ V.`]
	],

	parts: ['2N7000', 'BSS138', 'IRLZ44N', 'IRF540N', 'BS170'],
	related: ['p-mosfet', 'igbt', 'npn']
};
