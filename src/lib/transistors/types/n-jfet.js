// The N-channel JFET. Content of one page of the transistor guide:
// see src/lib/transistors/types/index.js for what each field is. Strings
// with formulas use String.raw so a LaTeX backslash stays one backslash.
const r = String.raw;

export default {
	slug: 'n-jfet',
	name: 'N-channel JFET',
	short: 'N-JFET',
	family: 'fet',
	symbol: { name: 'njfet_transistor_horz', labels: { drain: 'D', gate: 'G', source: 'S' } },
	control: r`The gate-source voltage: 0 V for fully on, negative to pinch it off`,
	normally: 'on',
	fullyOn: r`A resistance, $r_{DS(on)}$: at most 30 Ω for a J111 at $V_{GS} = 0$`,
	terminals: [
		['G', 'gate'],
		['D', 'drain'],
		['S', 'source']
	],
	oneLiner: r`A channel of N-type silicon that conducts with nothing on its gate; a negative gate voltage widens a reverse-biased junction into the channel and squeezes the current off.`,
	usedFor: ['Voltage-controlled resistors and analog switches', 'Constant-current sources made of two parts', 'Low-noise inputs for high-impedance sources'],

	howItWorks: [
		{
			p: r`An N-JFET (junction field-effect transistor) is a bar of N-type silicon, the channel, with a contact at each end: the source, where the electrons enter, and the drain, where they leave. Conventional current therefore flows from drain to source. Along the channel sits a P-type region, the gate, which forms a PN junction with it. That junction is kept reverse-biased, so the gate draws only leakage: at most 1 nA for a J111 at $V_{GS} = -15$ V. A reverse-biased junction grows a depletion region, a layer emptied of free carriers that does not conduct, and here that layer grows into the channel. There is no insulating layer as in a MOSFET: the gate is one side of a diode. In the symbol the arrow on the gate points in, from the P gate to the N channel, the direction of that diode.`
		},
		{
			p: r`With the gate at the source voltage the channel is wide open, so the JFET conducts with no drive at all: it is **normally on**, the opposite of an NPN or an enhancement MOSFET. Taking the gate negative widens the depletion layers and narrows the channel. At the pinch-off voltage $V_P$ they meet across the whole channel and the current stops. A datasheet calls this voltage $V_{GS(off)}$, the gate-source cutoff voltage. It is negative for an N-channel part: -3 to -10 V for a J111, read at $I_D = 1$ µA and $V_{DS} = 5$ V.`
		},
		{
			p: r`The drain voltage pinches the channel too. The gate-channel voltage is $V_{GS}$ at the source end but $V_{GD} = V_{GS} - V_{DS}$ at the drain end, more negative, so the channel is narrowest at the drain. Once $V_{DS}$ reaches $V_{GS} - V_P$, the drain end is pinched and the current stops growing with $V_{DS}$. The JFET is then a current source, set by the gate alone.`
		},
		{
			eq: r`I_D = I_{DSS}\left(1 - \frac{V_{GS}}{V_P}\right)^2 \qquad V_P \le V_{GS} \le 0, \quad V_{DS} \ge V_{GS} - V_P`,
			intro: r`In that flat region the drain current follows Shockley's square law:`
		},
		{
			p: r`$I_{DSS}$ is the drain current with the gate shorted to the source, measured in the flat region: at $V_{DS} = 15$ V and in short pulses for a J111. It is the most the channel passes while the gate stays reverse-biased. The law is a parabola: halfway to pinch-off, at $V_{GS} = V_P / 2$, the current is already down to a quarter of $I_{DSS}$.`
		},
		{
			eq: r`I_D = \frac{I_{DSS}}{V_P^2}\left[2\,(V_{GS} - V_P)\,V_{DS} - V_{DS}^2\right] \qquad 0 < V_{DS} < V_{GS} - V_P`,
			intro: 'Below that edge the channel is open at both ends and behaves as a resistor whose value the gate sets:'
		},
		{
			eq: r`\frac{1}{r_{DS}} = \frac{2 I_{DSS}}{V_P^2}\,(V_{GS} - V_P) \qquad r_{DS} = \frac{r_{DS0}}{1 - V_{GS}/V_P} \qquad r_{DS0} = \frac{|V_P|}{2 I_{DSS}}`,
			intro: r`For a small $V_{DS}$ the squared term drops out. The conductance of the channel is then a straight line in $V_{GS}$ that reaches zero at $V_P$:`
		},
		{
			p: r`$r_{DS0}$ is the resistance at $V_{GS} = 0$, the $r_{DS(on)}$ of a datasheet: at most 30 Ω for a J111, measured with $V_{DS} \le 0.1$ V. These are the equations of an enhancement MOSFET, whose saturation law is $I_D = \tfrac12 k (V_{GS} - V_{th})^2$, with $k$ a constant of the part in A/V² and $V_{th}$ its threshold. Putting $V_P$ in place of $V_{th}$ and $k = 2 I_{DSS} / V_P^2$ gives the JFET laws above, so the MOSFET square law applies with those two substitutions.`
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'Gate-source', 'Drain-source', 'What happens', 'Used as'],
				rows: [
					['Off (cutoff)', r`$V_{GS} \le V_P$`, 'any, up to breakdown', r`only leakage: 1 nA at most for a J111 ($V_{DS} = 5$ V, $V_{GS} = -10$ V)`, 'open switch'],
					['Resistor (ohmic, also called triode or linear)', r`$V_P < V_{GS} \le 0$`, r`$V_{DS} < V_{GS} - V_P$`, r`$I_D$ grows with $V_{DS}$; near 0 V the channel is a resistance set by the gate`, 'closed switch, voltage-controlled resistor'],
					['Current source (saturation, or pinch-off)', r`$V_P < V_{GS} \le 0$`, r`$V_{DS} \ge V_{GS} - V_P$`, r`$I_D = I_{DSS}(1 - V_{GS}/V_P)^2$, nearly independent of $V_{DS}$`, 'amplifier, current source'],
					['Gate on', 'above about +0.5 V', 'any', 'the gate junction conducts like a diode and the gate draws current', 'never on purpose']
				]
			}
		},
		{
			note: r`"Saturation" is the flat current-source region, the equivalent of the BJT's active region, as for a MOSFET. The fully-on JFET switch sits in the ohmic region. "Pinch-off" names two things: the gate voltage $V_P$ that closes the whole channel, and the pinching of the drain end that starts the saturation region; Siliconix writes $V_{GS(off)}$ for the first to avoid the clash. "Linear region" means the ohmic region in a textbook, while power-MOSFET application notes say "linear mode" for the saturation region.`,
			tone: 'warn'
		},
		{
			eq: r`g_m = \frac{\partial I_D}{\partial V_{GS}} = g_{m0}\left(1 - \frac{V_{GS}}{V_P}\right) = g_{m0}\sqrt{\frac{I_D}{I_{DSS}}} \qquad g_{m0} = \frac{2 I_{DSS}}{|V_P|} = \frac{1}{r_{DS0}}`,
			intro: r`How far the drain current moves per volt on the gate, the transconductance $g_m$, follows from the square law:`
		},
		{
			p: r`$g_{m0}$ is the value at $V_{GS} = 0$. An amplifier datasheet prints it as $|y_{fs}|$ or $g_{fs}$: 1 to 5 mS for a 2N5457 at $V_{DS} = 15$ V and 1 kHz. It also equals the channel conductance at $V_{GS} = 0$, so a JFET with a low $r_{DS(on)}$ has a high $g_{m0}$. For the part of the first and third simulations below ($I_{DSS} = 3$ mA, $V_P = -1.5$ V), $g_{m0} = 4$ mS, and $g_m = 2.51$ mS at 1.185 mA. An NPN at the same current has $I_C / V_T = 45.9$ mS, about 18 times more, so a JFET stage gains far less. What it offers instead is an input that draws next to nothing.`
		},
		{ h: 'Where a JFET is the right part' },
		{
			list: [
				r`**Voltage-controlled resistor.** Between 0 V and $V_P$ the gate sets the channel's resistance over a range of 10:1 or more. The AM modulator of this site uses a J111 this way.`,
				r`**Two-part current source.** With the gate tied to the source, or to the bottom of a source resistor, the current holds while the supply varies, and the gate needs no supply of its own. A current-regulator diode is this circuit in one package.`,
				r`**Analog switch.** On at $V_{GS} = 0$, with $r_{DS(on)}$ at most 30 Ω for a J111; off below $V_{GS(off)}$, with 1 nA of leakage. The J111 datasheet names analog switching, sample-and-hold circuits and chopper-stabilised amplifiers as its uses.`,
				r`**Low-noise, high-impedance input.** The gate of an LSK170 draws at most 0.5 nA at 1 mA and $V_{DG} = 10$ V: 0.5 mV across a 1 MΩ source. An NPN at 1 mA with $\beta = 100$ would need 10 µA of base current, 10 V across the same 1 MΩ. The LSK170's voltage noise is 0.9 nV/√Hz typical at 1 kHz and 2 mA, the thermal noise of a 49 Ω resistor, which counts with a low-impedance source. With a high-impedance source the gate current $I_G$ counts instead: its shot noise, $\sqrt{2 q I_G}$ with $q$ the charge of the electron, is 13 fA/√Hz at 0.5 nA, or 13 nV/√Hz across 1 MΩ, a tenth of that resistor's own 129 nV/√Hz. The TL082 op-amp of the lab bench has a JFET pair at its inputs for the same reason.`
			]
		},
		{
			more: [
				{ p: r`**How exact the law is.** Siliconix notes that the exponent runs from 1.8 to 2.0 depending on the geometry of the part, so the square law is a model to design with, then check on the bench. Near $V_P$ a real channel closes gradually, and $V_{GS(off)}$ is read at a tiny current out in that tail: 1 µA for a J111.` },
				{ p: r`**Output conductance.** The flat curves rise slightly with $V_{DS}$. A datasheet gives that slope as $|y_{os}|$ or $g_{os}$, 50 µS at most for a 2N5457 ($V_{DS} = 15$ V, $V_{GS} = 0$, 1 kHz), and it lowers the common-source gain:` },
				{ eq: r`A_v = -\frac{g_{fs} R_D}{1 + R_D\, g_{os}} \approx -g_{fs} R_D` },
				{ p: r`With $R_D = 2.2$ kΩ the worst case is $R_D\, g_{os} = 0.11$: a gain about 10 % below $g_{fs} R_D$.` },
				{ p: r`**Temperature.** Warming acts two ways. It lowers the mobility of the electrons, how easily they drift through the silicon, which lowers the current. It also lowers the built-in voltage of the gate junction, the barrier it holds with no bias applied, which thins the depletion layers and raises the current. At one bias the two effects cancel. Siliconix places that zero-temperature-coefficient point at:` },
				{ eq: r`|V_{GS(0TC)}| \approx |V_{GS(off)}| - 0.65\ \text{V} \qquad I_{D(0TC)} \approx I_{DSS}\left(\frac{0.65\ \text{V}}{|V_P|}\right)^2` },
				{ p: r`For the part of the first and third simulations (3 mA, -1.5 V) that is $V_{GS} = -0.85$ V and 0.563 mA, set by a 1.51 kΩ source resistor: a current source with almost no drift, at a current well below $I_{DSS}$. The channel resistance of a switch rises with temperature, so $r_{DS(on)}$ at 25 °C is the best case. The gate leakage grows much faster: the 2N5457 guarantees 1 nA at most at 25 °C but 200 nA at 100 °C ($V_{GS} = -15$ V, $V_{DS} = 0$). Through a 1 MΩ gate resistor that is 1 mV cold and 0.2 V hot, a shift of the bias that a warm high-impedance input has to allow for.` }
			],
			summary: 'Deeper model: accuracy, output conductance, temperature'
		}
	],

	curves: {
		widget: 'fetCurves',
		props: { kind: 'njfet', vdd: 10, rd: 1000 },
		caption: r`The output curves of the square-law model of a small N-JFET ($I_{DSS} = 10$ mA, $V_P = -3$ V), for gate voltages from -2.4 V up to 0 V. Left of the dashed parabola, $V_{DS} = V_{GS} - V_P$, the channel is a resistor; right of it the curves are flat and the part is a current source. The red line is the load line of $R_D$ on $V_{DD}$: the JFET can only sit where its curve crosses it. The gate slider runs past pinch-off to -4 V, and the buttons switch to a depletion and an enhancement MOSFET for comparison.`
	},

	sims: ['jfet-current-source', 'jfet-vcr', 'jfet-amp'],

	rules: [
		{
			title: r`Design for the spread of $I_{DSS}$ and $V_P$, never for a typical part`,
			body: [
				{ p: r`Two JFETs with the same number can differ threefold or more. The J111 guarantees $V_{GS(off)}$ only between -3 and -10 V (at $V_{DS} = 5$ V, $I_D = 1$ µA), and $I_{DSS}$ only as a minimum: 20 mA at $V_{DS} = 15$ V, with no maximum. The 2N5457 spans -0.5 to -6 V (at 10 nA) and 1 to 5 mA, both at $V_{DS} = 15$ V. Both numbers come from the doping and the thickness of the channel, $V_P$ from the square of the thickness, and the process does not hold them tightly. Makers sort the parts instead: the J111, J112 and J113 share one datasheet and differ by their $V_{GS(off)}$ window (-3 to -10 V, -1 to -5 V, -0.5 to -3 V), and the LSK170 comes in four $I_{DSS}$ grades, from A (2.6 to 6.5 mA) to D (18 to 30 mA), at $V_{DS} = 10$ V.` },
				{
					eq: r`I_D = 5\ \text{mA} \times \left(1 - \frac{-2\ \text{V}}{-6\ \text{V}}\right)^2 = 2.2\ \text{mA}`,
					intro: r`A fixed gate voltage turns that spread into a spread of current. A 2N5457 with its gate held at -2 V is cut off if its $V_P$ lies between -0.5 and -2 V, and passes this much if it is a -6 V part with 5 mA:`
				},
				{ p: 'A design copes in one of four ways:' },
				{
					list: [
						'**A source resistor** (self-bias, the next rule): negative feedback that narrows the spread of current and never lets a part cut off.',
						r`**Selection**: each part is measured and kept only inside a window, or a bag of them is sorted by $I_{DSS}$.`,
						'**Trimming**: an adjustable source resistor, set on each board.',
						r`**Graded parts**, such as the LSK170 grades, when the circuit needs a known $I_{DSS}$.`
					]
				}
			]
		},
		{
			title: 'Self-bias: the source resistor and the law, solved together',
			body: [
				{ p: r`The gate goes to ground through a large resistor, 1 MΩ in the amplifier simulation, so it sits at 0 V and draws nothing. The drain current through $R_S$ lifts the source, so $V_{GS} = -I_D R_S$ comes out negative with no negative supply. The bias point is where this line crosses the square law:` },
				{ eq: r`I_D = I_{DSS}\left(1 - \frac{V_{GS}}{V_P}\right)^2 \quad \text{and} \quad I_D = -\frac{V_{GS}}{R_S}` },
				{ p: r`Substituting one into the other gives a quadratic, but a few trials are quicker and show what happens. For the amplifier simulation ($I_{DSS} = 3$ mA, $V_P = -1.5$ V, $R_S = 470\ \Omega$):` },
				{
					table: {
						head: [r`Trial $V_{GS}$`, 'The law gives', r`Current that makes it, $-V_{GS}/R_S$`],
						rows: [
							['-0.40 V', '1.61 mA', '0.85 mA'],
							['-0.60 V', '1.08 mA', '1.28 mA'],
							['-0.557 V', '1.185 mA', '1.185 mA']
						]
					}
				},
				{ p: r`At -0.40 V the law gives more current than the resistor allows, at -0.60 V less, so the answer lies between. Halving the interval a few times lands on $V_{GS} = -0.557$ V and $I_D = 1.185$ mA. The quadratic's second root, -4.04 V, lies beyond $V_P$, where the law no longer holds. The drain sits at $12 - 1.185 \times 2.2 = 9.39$ V, so $V_{DS} = 8.84$ V, far above $V_{GS} - V_P = 0.94$ V: the part is in saturation, as an amplifier must be.` },
				{
					eq: r`A_v = -g_m\,(R_D \parallel R_L) = -2.51\ \text{mS} \times 2.15\ \text{k}\Omega = -5.4`,
					intro: r`With $R_S$ bypassed by a capacitor for the signal, $g_m = 4\ \text{mS} \times (1 - 0.557/1.5) = 2.51$ mS, and the gain into the 2.2 kΩ drain resistor and the 100 kΩ load is:`
				},
				{ p: r`Taken from the source instead, with $R_S$ left unbypassed and the drain straight to the supply, the same stage is a source follower, and the input still draws next to nothing: $A_v = g_m R_S / (1 + g_m R_S)$, always below 1. Here $g_m R_S = 2.51\ \text{mS} \times 470\ \Omega = 1.18$ gives only 0.54. A follower close to 1 needs $g_m R_S \gg 1$.` },
				{
					eq: r`R_S = \frac{|V_P|\left(1 - \sqrt{I_D / I_{DSS}}\right)}{I_D}`,
					intro: 'To design the other way round, from a wanted current, Siliconix solves the law for the resistor:'
				},
				{ p: r`1 mA from the same part takes $1.5 \times (1 - \sqrt{1/3}) / 1\ \text{mA} = 634\ \Omega$; 620 Ω from the E24 series gives 1.01 mA. With the spread of the previous rule, the part in hand decides, so $R_S$ is often a trimmer.` }
			]
		},
		{
			title: r`A current source: two parts, and the drain at least $|V_P|$ above the gate`,
			body: [
				{ p: r`With the gate tied to the source, $V_{GS} = 0$ and the JFET passes $I_{DSS}$. With a resistor between them it passes the self-bias current of the previous rule, always below $|V_P| / R_S$, since $V_{GS}$ cannot go past $V_P$. Either way the current holds only while the part stays in saturation, which needs the drain at least $|V_P|$ above the gate:` },
				{ eq: r`V_{DS} \ge V_{GS} - V_P \iff V_{DG} \ge |V_P|` },
				{ p: r`With the gate tied to the source, Siliconix asks for more margin: a $V_{DS}$ at least 50 % above $|V_{GS(off)}|$, where the output conductance is lowest.` },
				{ p: r`A J111 with its gate tied to its source is a poor current source on a breadboard. It passes at least 20 mA, with no upper limit, and the square law ties the 30 Ω limit on $r_{DS(on)}$ to $I_{DSS} \ge |V_P| / 60\ \Omega$: 50 mA for a 3 V part, 167 mA for a 10 V part. On 15 V that is 300 mW at the datasheet minimum, and by the square law at least 750 mW for a 3 V part and 2.5 W for a 10 V part, against 350 mW: the older J111 datasheet's rating, lower and safer than the 625 mW of the newer one. With 1 kΩ from source to gate it passes 2.0 mA (a -3 V part with the minimum 20 mA) to 8.0 mA (a -10 V part with 200 mA), about 56 mW at most.` },
				{ p: r`A **current-regulator diode** is this circuit in a two-lead package, a JFET with its source resistor on the same chip: Siliconix lists the CR160 to CR470 series (±10 %) and the J500 to J511. For a current that does not drift with temperature, the zero-temperature-coefficient point of the deeper model above sets $R_S$.` }
			]
		},
		{
			title: 'A voltage-controlled resistor: small signals, and half the drain fed back to the gate',
			body: [
				{
					eq: r`\frac{1}{r_{DS}} = \frac{2 I_{DSS}}{V_P^2}\,(V_{GS} - V_P) \qquad |V_{DS}| \ll V_{GS} - V_P`,
					intro: r`Used near $V_{DS} = 0$, the channel is a conductance that is a straight line in the gate voltage:`
				},
				{ p: r`For the part of the second simulation ($I_{DSS} = 40$ mA, $V_P = -4$ V) the line falls by 5 mS per volt: 50 Ω at 0 V, 100 Ω at -2 V, 500 Ω at -3.6 V. The first 10:1 takes 3.6 V of gate; the next 10:1, to 5 kΩ, takes only the 0.36 V after it. Siliconix advises staying within about 10:1 for good control.` },
				{ p: r`A conductance linear in the gate voltage is what amplitude modulation needs. The AM modulator of this site puts a J111 channel in place of the bottom resistor of a non-inverting op-amp stage. The feedback resistor $R_b$ runs from the output to the inverting input, above the channel. The gain $1 + R_b / r_{DS}$ is then linear in $V_{GS}$, and a message added to the gate bias moves the carrier's amplitude in proportion.` },
				{ p: r`The catch is the $V_{DS}^2$ term of the ohmic law: the resistance depends on the signal across it. At $V_{GS} = -2$ V the part above measures 105.3 Ω at $V_{DS} = +0.2$ V and 95.2 Ω at -0.2 V, a ±5 % swing that adds second-harmonic distortion. With the drain more than about 0.5 V below the gate, the gate-drain junction conducts as well.` },
				{
					eq: r`I_D = \frac{2 I_{DSS}}{V_P^2}\left(\frac{V_{ctrl}}{2} - V_P\right) V_{DS}`,
					intro: r`Siliconix's fix feeds half the drain voltage back to the gate: one resistor from drain to gate, an equal one from the control voltage $V_{ctrl}$ to the gate, each at least ten times $R_1 \parallel r_{DS} \parallel R_L$ (series resistor, channel and load in parallel), typically 470 kΩ. Then $V_{GS} = (V_{ctrl} + V_{DS}) / 2$, and the square term cancels exactly:`
				},
				{ p: r`The same part now reads 100 Ω across the whole ±0.2 V. The price is a control voltage twice as large: -4 V for 100 Ω here, and about -18 V for 10:1 on a J111 whose $V_P$ is -10 V, more than an op-amp on ±15 V delivers.` }
			]
		},
		{
			title: r`An analog switch: gate at the source to close it, $|V_{GS(off)}|$ below the signal to open it`,
			body: [
				{ p: r`Closed, a J111 is at most 30 Ω ($V_{GS} = 0$, $V_{DS} \le 0.1$ V): in series with a 10 kΩ load it loses 0.3 % of the signal. Open, it leaks at most 1 nA ($V_{DS} = 5$ V, $V_{GS} = -10$ V). Both conditions are measured from the source, and the source moves with the signal:` },
				{ eq: r`\text{on: } V_G = V_S \qquad \text{off: } V_G < V_{S,\text{min}} - |V_{GS(off)}|_{\text{max}}` },
				{ p: r`A common drive holds the gate at the source with a resistor between them and pulls it down through a 1N4148, cathode toward the driver. With the driver at -15 V the gate sits near -14.4 V, so every J111, $V_{GS(off)}$ down to -10 V, stays off for signals down to -4.4 V. The drain-gate voltage then reaches about 30 V at most, inside the J111's 35 V rating. With the driver at +15 V the diode blocks and the resistor holds $V_{GS} = 0$ for any signal below the driver's 15 V. Open, the resistor carries $(V_S - V_G) / R$ out of the signal: 19.4 µA for 1 MΩ with the signal at +5 V and the gate at -14.4 V. When the switch closes, the resistor alone charges the gate capacitance back to the source voltage: up to 28 pF on a J111 ($C_{dg(on)} + C_{sg(on)}$ at $V_{GS} = 0$, 1 MHz), a time constant of up to 28 µs with 1 MΩ. A larger resistor loads the signal less and switches more slowly.` },
				{ p: r`The gate never goes above the source: there the junction conducts and the driver pushes current into the signal. The channel resistance rises with temperature and with the voltage across it, so a precise switch keeps $V_{DS}$ small, as the datasheet does when it measures $r_{DS(on)}$.` }
			]
		}
	],

	mistakes: [
		['0 V on the gate turns a JFET off.', r`0 V turns it fully on: a JFET is normally on. Off takes a gate more negative than $V_{GS(off)}$, as much as 10 V below the source for a J111.`],
		['The gate can be driven positive, like a MOSFET gate.', r`The gate is a PN junction. Past about +0.5 V it conducts like a diode, the input no longer draws next to nothing, and only the resistance in series limits the current (50 mA absolute maximum on a J111). A depletion MOSFET, with an insulated gate, is the normally-on part that can go positive.`],
		[r`$I_{DSS}$ is the current the part passes.`, r`It is a window, often only a minimum: at least 20 mA for a J111 with no maximum, 1 to 5 mA for a 2N5457. A design uses a source resistor, measures the part, or buys a graded one.`],
		['A fixed gate voltage biases a JFET, the way a threshold voltage would.', r`$V_P$ spreads 3:1 on a J111 and 12:1 on a 2N5457. At a fixed -2 V a 2N5457 passes anything from nothing (a part with $V_P$ above -2 V) to 2.2 mA (a -6 V, 5 mA part). A source resistor gives every part a working bias.`],
		['JFET saturation is the fully-on state, as for a BJT.', r`It is the flat current-source region, the equivalent of the BJT active region. The fully-on switch sits in the ohmic region, where the datasheet gives $r_{DS(on)}$.`],
		['All TO-92 JFETs share one pinout.', 'The J111 and 2N5457 read D-S-G with the flat face toward the viewer, legs down; the LSK170 reads D-G-S, gate in the middle. On a J111 the datasheet calls drain and source interchangeable, but the gate has its own place.']
	],

	variants: [
		{ p: r`**Switch JFETs and amplifier JFETs.** The J111, J112 and J113 guarantee what a switch needs: $r_{DS(on)}$ (30, 50 and 100 Ω at most), $V_{GS(off)}$, leakage and capacitance. Their $g_{fs}$ appears only as typical curves. The 2N5457 guarantees what an amplifier needs, $|y_{fs}|$ of 1 to 5 mS and $|y_{os}|$ of 50 µS at most, but no $r_{DS(on)}$. A design picks the part whose datasheet guarantees the numbers it depends on.` },
		{ p: r`**Low-noise JFETs** such as the LSK170 add noise to the guarantees: 1.9 nV/√Hz at most at 1 kHz and 4.0 at 10 Hz ($V_{DS} = 10$ V, $I_D = 2$ mA). Their input capacitance is large, 20 pF typical for the LSK170 ($V_{DS} = 15$ V, $I_D = 100$ µA, 1 MHz).` },
		{ p: r`The **P-channel JFET** is the same part with every polarity reversed: $V_{GS(off)}$ is positive, +1 to +4 V for a J176 (at $I_D = -10$ nA, $V_{DS} = -15$ V), and the source is the terminal at the higher voltage. The **depletion MOSFET** is normally on too, but its gate is insulated, so it can be driven positive without drawing current.` }
	],

	bench: [
		{ p: r`**Meter check.** On the diode range, red lead on the gate: 0.6 to 0.7 V to the drain and to the source, the gate junction conducting; nothing with the leads swapped. Between drain and source the meter reads nearly a short both ways, at most about 30 Ω on the resistance range for a J111: the channel conducts with nothing on the gate. A drop with the red lead on the gate means an N channel; a P-channel part shows it with the black lead there. The meter cannot tell drain from source on a symmetric part such as the J111; its pinout drawing decides (D-S-G, flat face toward the viewer, legs down). A floating gate can keep charge from the previous test and pinch the channel, so touching the gate to the source first makes the readings steady.` },
		{ p: r`**First build.** The current source of the first simulation, with a J111: drain to +15 V, gate to ground, 1 kΩ from source to ground. A voltmeter across the 1 kΩ reads both $|V_{GS}|$ and the current in milliamps: from about 2.0 V for a -3 V part with 20 mA to about 8.0 V for a -10 V part with 200 mA, so 56 mW at most in the JFET. The reading holds as the supply comes down, until the drain gets within $|V_P|$ of the gate. With 1 MΩ in place of the 1 kΩ, only a few microamps can flow, and the source rises almost to $|V_P|$: 4.95 V for a -5 V part.` },
		{
			eq: r`I_{DSS} = \frac{I_D}{(1 - V_{GS}/V_P)^2} = \frac{3.9\ \text{mA}}{(1 - 3.9/4.95)^2} \approx 87\ \text{mA}`,
			intro: r`The two readings give $I_{DSS}$ without ever passing it through the part. For a J111 that reads 3.9 V across 1 kΩ and 4.95 V across 1 MΩ:`
		},
		{ p: r`The division by a small number makes the result sensitive: taking $|V_P|$ as 5.00 V instead of 4.95 V gives 81 mA. It is an estimate, close enough to tell a 30 mA part from a 100 mA one. By the square law this part has $r_{DS0} = 4.95\ \text{V} / (2 \times 87\ \text{mA}) \approx 28\ \Omega$, inside the 30 Ω limit.` }
	],

	quiz: [
		[r`A 2N5457 measures $I_{DSS} = 4$ mA and $V_P = -2$ V. With 1 kΩ in its source, bypassed for the signal, and 4.7 kΩ in its drain on 15 V, what are $I_D$ and the gain?`, r`$I_D = 4\ \text{mA} \times (1 - I_D \times 1\ \text{k}\Omega / 2\ \text{V})^2$ gives, in mA, $I_D^2 - 5 I_D + 4 = 0$: 1 mA or 4 mA. 4 mA would need $V_{GS} = -4$ V, past $V_P$, so $I_D = 1$ mA and $V_{GS} = -1$ V. Then $g_m = 4\ \text{mS} \times (1 - 1/2) = 2$ mS and $A_v = -2\ \text{mS} \times 4.7\ \text{k}\Omega = -9.4$. With $V_{DS} = 15 - 4.7 - 1 = 9.3$ V the part is well in saturation.`],
		[r`A J111 has $r_{DS(on)} = 30\ \Omega$ and $V_P = -5$ V. What gate voltage makes it a 300 Ω resistor, and what does 0.1 V of error on the gate do?`, r`$r_{DS} = r_{DS0} / (1 - V_{GS}/V_P)$, so $1 - V_{GS}/V_P = 0.1$ and $V_{GS} = -4.5$ V. At -4.6 V it is 375 Ω, at -4.4 V 250 Ω: ±0.1 V moves it by +25 % and -17 %, which is why the useful range stops near 10:1. With the drain fed back to the gate the control voltage is -9 V, and the same error on it counts half.`],
		[r`A J111 switch must block signals from -2 V to +5 V. How low must its gate go, and is a -15 V driver through a 1N4148 enough?`, r`Every J111 is off once $V_{GS}$ is below -10 V, its worst $V_{GS(off)}$, so at the lowest signal the gate must be under $-2 - 10 = -12$ V. Through the diode the gate sits near -14.4 V: 2.4 V of margin. At the top of the signal the gate is 19.4 V below it, inside the 35 V rating of the gate junction.`]
	],

	parts: ['J111', '2N5457', 'LSK170'],
	related: ['p-jfet', 'depletion-mosfet', 'n-mosfet']
};
