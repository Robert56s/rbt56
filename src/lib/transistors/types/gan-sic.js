// GaN and SiC power transistors. Content of one page of the transistor
// guide: see src/lib/transistors/types/index.js for what each field is.
// Strings with formulas use String.raw so a LaTeX backslash stays one
// backslash.
const r = String.raw;

export default {
	slug: 'gan-sic',
	name: 'GaN and SiC transistors',
	short: 'GaN/SiC',
	family: 'power',
	symbol: { name: 'n_channel_e_mosfet_transistor_horz', labels: { drain: 'D', gate: 'G', source: 'S' } },
	control: r`Gate-source voltage: 5 V for GaN, +15 V on and -4 V off for SiC`,
	normally: 'off',
	fullyOn: r`A resistance $R_{DS(on)}$, like a silicon MOSFET, but lower for the voltage it blocks`,
	terminals: [
		['G', 'gate'],
		['D', 'drain'],
		['S', 'source']
	],
	oneLiner: r`Power transistors in gallium nitride or silicon carbide, whose wider bandgap blocks the same voltage with a thinner layer: less resistance and less gate charge than silicon, so faster switches that waste less.`,
	usedFor: [
		'Compact, fast converters: USB-C power, point-of-load, lidar (GaN)',
		'EV battery chargers, renewable energy, high-voltage DC/DC (SiC)',
		r`High-voltage switching where an IGBT's tail current limits the frequency (SiC)`
	],

	howItWorks: [
		{
			p: r`A power transistor that blocks hundreds of volts holds that voltage across a thick, lightly doped layer next to the channel, the **drift layer**. When the part is on, the current has to cross that layer, so at high voltage its resistance is most of $R_{DS(on)}$. GaN (gallium nitride) and SiC (silicon carbide) are **wide-bandgap** semiconductors: an electron needs more energy than in silicon to break free of its bond. That also makes them harder to break down. A carrier has to be pushed by a stronger field before it gains enough energy to knock new carriers loose, so the **critical field** $E_c$, where avalanche starts, is much higher.`
		},
		{
			eq: r`W = \frac{2 V_{BR}}{E_c} \qquad N_D = \frac{\varepsilon E_c^2}{2 q V_{BR}} \qquad R_{on} A = \frac{W}{q \mu N_D} = \frac{4 V_{BR}^2}{\varepsilon \mu E_c^3}`,
			intro: r`A drift layer that just reaches $E_c$ at its breakdown voltage $V_{BR}$ has a thickness, a doping and a resistance per area set by $E_c$:`
		},
		{
			p: r`$W$ is the thickness, $N_D$ the doping (donor atoms per volume), $\varepsilon$ the permittivity of the material, $\mu$ the electron mobility, $q$ the electron charge and $R_{on} A$ the resistance times the die area. A higher critical field makes the layer thinner and lets it hold more dopant, so the resistance falls as the cube of $E_c$: twice the field, an eighth of the resistance for the same voltage and area. For one material the resistance rises at least as the square of the voltage: a silicon MOSFET built for 1200 V has at least four times the resistance of a 600 V one of the same size. Real silicon does a little worse, since its critical field falls at the lighter doping a higher voltage needs. That is why plain silicon MOSFETs give way to IGBTs at high voltage, and why a SiC part can stay a plain MOSFET there.`
		},
		{
			p: r`Less resistance per area means a smaller die for the same $R_{DS(on)}$, and a smaller die has smaller capacitances and less gate charge: the part switches faster. The wide gap also helps with heat, because far fewer carriers are created thermally across it, so the material keeps blocking at temperatures where silicon would not. The datasheet rating is still what counts: both example parts below are rated for a 150 °C junction. The SiC part's $R_{DS(on)}$ rises less with heat than silicon's: from 65 to 90 mΩ typical between 25 and 150 °C on the C3M0065090D, a factor of 1.38, where silicon parts rise 1.5 to 2.2 times by 125 °C. GaN sits inside that range: EPC gives a factor of 1.65 at 125 °C for its GaN parts, against 2.2 for a typical 100 V silicon MOSFET.`
		},
		{ h: 'SiC MOSFET: a vertical MOSFET with a 15 V gate' },
		{
			p: r`A SiC MOSFET is built like a silicon power MOSFET: source and gate on top, drain on the back, the current flowing down through the drift layer. Like any power MOSFET it has a **body diode** from source (anode) to drain (cathode). A PN junction in a wide-bandgap material has a far higher forward drop, though: 4.4 V at 10 A with $V_{GS} = -4$ V on the 900 V C3M0065090D. That diode is fast but still stores charge, 185 nC recovered at 150 °C.`
		},
		{
			p: r`The gate is an oxide, as in silicon. $R_{DS(on)}$, 65 mΩ typical and 78 mΩ maximum at 20 A, is specified at $V_{GS} = 15$ V, and Wolfspeed asks for 15 V within ±5 %. Off, the gate is held at -4 V; the transient limits are -8 V and +19 V. The threshold is low, 1.8 to 3.5 V at 5 mA and 1.6 V typical at 150 °C, which is why the off-voltage is negative.`
		},
		{ h: 'GaN HEMT: a lateral transistor on a sheet of electrons' },
		{
			p: r`HEMT stands for high-electron-mobility transistor. On a silicon wafer, a layer of GaN is grown, then a thin layer of AlGaN (aluminium gallium nitride) on top. GaN is piezoelectric: the strain between the two layers pulls electrons to their interface, where they form a thin sheet, the **two-dimensional electron gas** (2DEG), a ready-made channel of high mobility. Source, gate and drain all sit on the top surface and the current flows sideways along the sheet: a **lateral** device. A higher voltage rating comes from a longer gap between gate and drain, the lateral version of the drift layer.`
		},
		{
			p: r`With a 2DEG under it, a plain HEMT conducts at $V_{GS} = 0$. In an **enhancement-mode** part such as the EPC2045, the 2DEG under the gate is removed, so it is off at 0 V and a positive gate restores the channel: threshold 0.8 to 2.5 V at 5 mA. Source and drain are not joined by a PN junction, so the part has no body diode and recovers zero charge, $Q_{rr} = 0$. The channel still conducts backwards: once the drain falls below the gate by the threshold, the 2DEG opens in reverse.`
		},
		{
			eq: r`V_{SD} \approx V_{GS(th)} - V_{GS}`,
			intro: r`So reverse current, with the gate at $V_{GS}$ and a threshold $V_{GS(th)}$, starts at a source-drain voltage $V_{SD}$ of about:`
		},
		{
			p: r`With the gate at 0 V the EPC2045 drops 1.7 V typical at 0.5 A, and every volt of negative gate adds a volt to that drop; EPC specifies 0 V for off. The gate leaks far more than a silicon MOSFET's, up to 1.3 mA at 5 V, and its window is narrow: 5 V to turn on, absolute maximum +6 V and -4 V.`
		},
		{ h: 'GaN or SiC' },
		{
			table: {
				head: ['Feature', 'GaN HEMT', 'SiC MOSFET'],
				rows: [
					['Structure', 'lateral, on a silicon wafer', 'vertical, like a silicon power MOSFET'],
					['Example', 'EPC2045, 100 V, enhancement mode (a cascode GaN part differs: see Relatives)', 'C3M0065090D, 900 V'],
					['Gate drive', '5 V on, 0 V off; +6 V absolute maximum', '+15 V on, -4 V off; +19 V and -8 V transient'],
					['Reverse current', 'through the channel, no stored charge', 'through a body diode with a high drop and some stored charge'],
					['Avalanche', 'not rated', 'rated'],
					['Uses the maker lists', 'USB-C, point-of-load converters, lidar, class-D audio', 'renewable energy, EV battery chargers, high-voltage DC/DC converters']
				]
			}
		},
		{ h: 'Regions of operation' },
		{
			table: {
				head: ['Region', 'GaN HEMT', 'SiC MOSFET', 'Used as'],
				rows: [
					['Off (cutoff)', r`$V_{GS} = 0$ V, blocks the drain voltage`, r`$V_{GS} = -4$ V, blocks the drain voltage`, 'open switch'],
					['Fully on (triode, ohmic)', r`$V_{GS} = 5$ V and $V_{DS} < V_{GS} - V_{GS(th)}$: a resistance $R_{DS(on)}$`, r`$V_{GS} = 15$ V and $V_{DS} < V_{GS} - V_{GS(th)}$: a resistance $R_{DS(on)}$`, 'closed switch, current either way'],
					['Current source (saturation)', r`gate above $V_{GS(th)}$ and $V_{DS} \ge V_{GS} - V_{GS(th)}$`, r`gate above $V_{GS(th)}$ and $V_{DS} \ge V_{GS} - V_{GS(th)}$`, 'crossed only during an edge'],
					['Reverse, gate off', r`channel opens backwards, $V_{SD} \approx V_{GS(th)} - V_{GS}$`, 'body diode, 4.4 V at 10 A', 'dead time in a half-bridge']
				]
			}
		},
		{
			note: r`These parts live in two regions, off and fully on, and cross the current-source region only during an edge. The names clash: a textbook calls the current-source region "saturation" and the fully-on region "triode" or "linear", power-MOSFET app notes call the current-source region "linear mode", and a BJT's "saturation" is the fully-on switch.`,
			tone: 'warn'
		},
		{
			more: [
				{ p: r`Across a uniformly doped layer, Gauss's law makes the field fall in a straight line, from $E_c$ at the junction to zero at the far side. Its slope is $q N_D / \varepsilon$ and the area under it is the voltage held:` },
				{ eq: r`V_{BR} = \tfrac{1}{2} E_c W \qquad \frac{q N_D}{\varepsilon} = \frac{E_c}{W}` },
				{ p: r`Solving the two for $W$ and $N_D$ gives the formulas above, and the resistance of a slab of length $W$ and conductivity $q \mu N_D$ gives $R_{on} A$. Real parts add the channel, the substrate and the contacts, so the drift layer is a lower limit, closest to the truth at high voltage. In a lateral GaN HEMT the voltage is held along the surface, and the 2DEG's low resistivity keeps the cost of a longer gap small. A silicon **superjunction** MOSFET is built to get under this one-dimensional limit: its drift layer alternates N and P columns whose charges cancel, so the N columns can be doped more heavily for the same voltage. It is the silicon MOSFET of the 250 to 1000 V range, where IGBTs, SiC parts and 650 V GaN parts compete with it: the 650 V NTH4LN040N65S3H has 32 mΩ typical at 25 °C.` }
			],
			summary: 'Where the drift-layer formula comes from'
		},
		{
			more: [
				{ p: r`A switch's figure of merit is $R_{DS(on)} Q_G$, since a lower resistance usually costs gate charge. With maximum values, the 100 V EPC2045 has $7\ \text{m}\Omega \times 7.8\ \text{nC} \approx 55\ \text{m}\Omega\,\text{nC}$, and the 100 V silicon IRF540 $77\ \text{m}\Omega \times 72\ \text{nC} \approx 5500\ \text{m}\Omega\,\text{nC}$: about a hundred times more. The test conditions differ, so this is an order of magnitude only.` },
				{
					eq: r`t_{edge} \approx \frac{Q_{GD}}{I_G} \qquad P_{gate} = V_{drv}\, Q_G\, f`,
					intro: r`The drain swings while the driver supplies the gate-drain charge $Q_{GD}$, and the driver pays for the whole gate charge $Q_G$ every cycle:`
				},
				{ p: r`$I_G$ is the gate current, $V_{drv}$ the full swing of the drive and $f$ the switching frequency. With 1 A of gate current, the EPC2045's 0.8 nC of $Q_{GD}$ moves its drain in about 0.8 ns, and the C3M0065090D's 12 nC in about 12 ns. Gate power: 5 V × 6 nC × 1 MHz = 30 mW for the EPC2045; 19 V (from -4 to +15 V) × 33 nC × 100 kHz = 63 mW for the C3M0065090D.` }
			],
			summary: 'Where the speed comes from'
		}
	],

	curves: {
		widget: 'lossCompare',
		props: { rds: 0.09, v0: 1.0, r: 0.02, imax: 40 },
		caption: r`A SiC MOSFET fully on is a resistor like any MOSFET, so its conduction loss is $I^2 R_{DS(on)}$; an IGBT drops a knee voltage plus a little resistance. The sliders start at 90 mΩ, the C3M0065090D hot at 150 °C (65 mΩ at 25 °C), against an IGBT of 1.0 V plus 20 mΩ, 1.8 V at 40 A. Rated 900 V, the SiC part sits between the 650 V and 1200 V IGBTs, and in that range it competes with them: on curves like these, and on switching loss, where a MOSFET has no tail current.`
	},

	sims: [],

	rules: [
		{
			title: 'GaN gate: 5 V drive, 1 V below the absolute maximum',
			body: [
				{ p: r`The EPC2045 is driven at 5 V, and EPC asks for 5 V ±0.5 V at most, ±0.25 V preferred, against an absolute maximum of +6 V. The gate loop, from the driver to the gate and back from the source, has an inductance $L$ that forms a resonant circuit with the input capacitance $C_{iss}$: undamped, a 5 V step can ring to nearly 10 V. The resistance that just damps it, from TI's gate-drive note, is:` },
				{ eq: r`R_{G,opt} = 2\sqrt{\frac{L}{C_{iss}}} - (R_{drv} + R_{G,int})` },
				{ p: r`$R_{drv}$ is the driver's output resistance and $R_{G,int}$ the gate resistance inside the part. With $C_{iss} = 767$ pF typical and a tight layout of 2 nH: $2\sqrt{2\ \text{nH} / 767\ \text{pF}} = 3.2\ \Omega$, less the 0.6 Ω inside the part, so about 2.6 Ω is left for the driver and an external resistor. Wire leads of 20 nH would ring at 41 MHz and need 10 Ω, which slows the gate: the driver sits right next to the transistor, on the same board. The power loop matters as much, since $L\,di/dt$ adds to the drain voltage and a GaN part has no avalanche rating, only a transient limit: 120 V for the 100 V EPC2045.` }
			]
		},
		{
			title: 'SiC gate: +15 V on, a negative voltage off',
			body: [
				{ p: r`$R_{DS(on)}$ is specified at 15 V and is higher at 11 to 13 V, so a 10 V silicon gate driver under-drives a SiC MOSFET, and logic-level drive does not apply. Off, every fast edge of the drain, rising at $dv/dt$, pushes a current $C_{GD}\,dv/dt$ into the gate through the gate-drain capacitance $C_{GD}$, and the threshold is low. The resistance of the off path must keep that current from lifting the gate from its off-voltage $V_{off}$ up to the threshold:` },
				{ eq: r`R_{off} < \frac{V_{GS(th)} - V_{off}}{C_{GD}\, dv/dt}` },
				{ p: r`$C_{GD}$ is taken as its average over the swing, $Q_{GD} / V = 12\ \text{nC} / 400\ \text{V} = 30$ pF. An edge of 400 V in 10 ns, 40 V/ns, injects 1.2 A. With the gate held at 0 V and the hot threshold of 1.6 V, the whole off path must stay under 1.3 Ω, less than the 3.5 Ω inside the part itself. Held at -4 V, it may reach 4.7 Ω, which leaves about 1.2 Ω for the driver and any external resistor. The estimate ignores the share of the current that charges $C_{GS}$, so it errs on the safe side: Wolfspeed's own switching tests use 2.5 Ω outside the part with a -4 V off-voltage.` }
			]
		},
		{
			title: r`Conduction: $I^2 R_{DS(on)}$ against the IGBT's knee`,
			body: [
				{ eq: r`P_{MOS} = I^2 R_{DS(on)} \qquad P_{IGBT} = (V_0 + r I)\, I \qquad I^* = \frac{V_0}{R_{DS(on)} - r}` },
				{ p: r`$V_0$ is the IGBT's knee voltage, $r$ its slope resistance and $I^*$ the current where both losses are equal. The curves above use 1.0 V and 20 mΩ: 1.8 V at 40 A, close to the 1.77 V of the 650 V FGHL40T65MQD at 40 A and 175 °C. Then $I^* = 1.0 / (0.065 - 0.020) = 22$ A with the C3M0065090D at 25 °C, but $1.0 / (0.090 - 0.020) = 14$ A at 150 °C. At 20 A the hot SiC part wastes $20^2 \times 0.090 = 36$ W against 28 W for the IGBT. A design reads $R_{DS(on)}$ at its hot junction temperature, never at 25 °C. Parts in parallel divide the resistance, and they share the current because $R_{DS(on)}$ rises with heat.` }
			]
		},
		{
			title: 'Switching: energy per period against the IGBT tail',
			body: [
				{ eq: r`P_{sw} = (E_{on} + E_{off})\, f` },
				{ p: r`$E_{on}$ and $E_{off}$ are the energies a datasheet gives for one turn-on and one turn-off, at a stated voltage, current and temperature, and $f$ is the switching frequency. At 400 V and 20 A, the C3M0065090D loses $250 + 48 = 298\ \mu\text{J}$ per period at 150 °C: 6 W at 20 kHz, 30 W at 100 kHz. The FGHL40T65MQD IGBT loses $0.60 + 0.42 = 1.02$ mJ at 175 °C, 3.4 times more: 20 W at 20 kHz, 102 W at 100 kHz. Its turn-off alone, where the tail current flows, costs 0.42 mJ against 48 µJ. The tests differ in gate resistor (2.5 Ω outside the SiC part, 10 Ω for the IGBT) and in temperature, so the ratio is rough. The conduction curves favour the IGBT at high current; the switching energies favour the SiC part, more so as the frequency rises.` }
			]
		},
		{
			title: 'Dead time: short, then conduct through the channel',
			body: [
				{ p: r`In a **half-bridge**, two switches in series across the supply with the output taken between them, both are held off for a short **dead time** at each edge so that they never conduct together. The load current then has to flow backwards through one of the switches while it is off: through the body diode of a SiC MOSFET, through the reversed channel of a GaN HEMT. Both drops are high, so the dead time is kept short, and the switch is then turned on so that the current flows through its channel at $I\,R_{DS(on)}$.` },
				{ eq: r`P_{dead} = V_{SD}\, I\, (2 t_{dead})\, f \qquad P_{rr} = Q_{rr}\, V f` },
				{ p: r`$t_{dead}$ is the dead time at each of the two edges per period, $f$ the switching frequency, $Q_{rr}$ the charge the diode gives back when reverse-biased and $V$ the supply. The C3M0065090D at 10 A, 100 ns of dead time per edge and 100 kHz: $4.4 \times 10 \times 200\ \text{ns} \times 100\ \text{kHz} = 0.88$ W, where the channel, once on, drops only $10 \times 0.065 = 0.65$ V. Its diode's 185 nC, measured at 20 A, 400 V and 150 °C, costs $185\ \text{nC} \times 400\ \text{V} = 74\ \mu\text{J}$ each time the other switch turns on: 7.4 W at 100 kHz. A GaN HEMT recovers no charge, and EPC prefers a dead time of 20 ns or less.` }
			]
		}
	],

	mistakes: [
		['A GaN or SiC transistor drops in where a silicon MOSFET was.', r`The gate drives differ. A 10 or 12 V silicon driver exceeds the +6 V maximum of a GaN gate and under-drives a SiC MOSFET, whose $R_{DS(on)}$ is specified at 15 V. The driver, its voltages and the layout are chosen for the part.`],
		['With no body diode, a GaN HEMT blocks current in both directions.', r`Its channel opens backwards once the drain falls about $V_{GS(th)}$ below the gate: 1.7 V typical at 0.5 A on the EPC2045, more with a negative gate. It cannot block a larger reverse voltage than that.`],
		['The gate of a field-effect transistor draws no current.', r`A GaN gate leaks: up to 1.3 mA at 5 V on the EPC2045, where a silicon MOSFET leaks a few nanoamperes. The driver supplies that current for as long as the part is on.`],
		['The body diode of a SiC MOSFET works like a silicon one.', r`It drops 4.4 V at 10 A with the gate at -4 V, against at most 1.2 V at 16 A for the body diode of a silicon IRF540N, and it still stores charge, 185 nC at 150 °C. A design keeps the dead time short and turns the channel on to carry the reverse current.`],
		[r`$V_{GS(th)}$ tells the gate voltage to use.`, r`The C3M0065090D's threshold is 1.8 to 3.5 V at only 5 mA, yet its $R_{DS(on)}$ is guaranteed at 15 V. The drive voltage to use is the one printed next to $R_{DS(on)}$.`],
		['A GaN transistor survives an inductive kick by avalanche, like a silicon MOSFET.', r`GaN parts are not avalanche-rated. The 100 V EPC2045 allows 120 V for up to 10,000 pulses of 5 ms and no more, so a clamp or a snubber holds the drain below that. The SiC C3M0065090D does carry an avalanche rating: 110 mJ in a single pulse at 22 A from a 50 V supply.`]
	],

	variants: [
		{ p: r`A **cascode GaN** part puts a high-voltage GaN HEMT and a low-voltage silicon MOSFET in one package, sold as a single normally-off transistor. The Nexperia GAN041-650WSB (650 V, 35 mΩ typical, TO-247) has an ordinary silicon gate: ±20 V, driven from 0 to 10 or 12 V, threshold 3.4 to 4.5 V. It is driven like a silicon MOSFET, but it has a recovered charge, 150 nC typical, where an enhancement-mode GaN part has none.` }
	],

	bench: [
		{ p: r`**Not breadboard parts.** The EPC2045 is a bare die of 2.5 × 1.5 mm with solder bumps, made to be soldered to a printed board right next to its driver: there is nothing to probe on a breadboard. The C3M0065090D comes in a TO-247 with legs (1 gate, 2 drain, 3 source, the tab on the drain). It can be checked with a meter and tried slowly at 15 V; its 900 V and its nanosecond edges belong on a printed board with a gate driver.` },
		{ p: r`**Meter check (C3M0065090D).** The gate is shorted to the source first, since a gate charged by the meter can leave the channel on. On the diode range, gate to source and gate to drain read open both ways, an insulated gate. Red on the source and black on the drain reads the body diode, but a SiC junction needs far more voltage than a silicon one, so the reading is much higher than a silicon diode's, or the meter shows OL. With the leads swapped, open.` },
		{ p: r`**First build: a static test.** C3M0065090D, drain through 100 Ω (5 W, it dissipates 2.25 W) to the +15 V rail, source to ground. The gate comes from the wiper of a 10 kΩ potentiometer across +15 V and ground, through 1 kΩ to damp ringing, with 100 kΩ from gate to source. Turning the gate up, the drain starts to fall once the gate passes the threshold, 1.8 to 3.5 V, where 5 mA flows and the drain sits 0.5 V below 15 V. With the wiper at the top, 150 mA flows and the meter reads about 10 mV from drain to source, measured on the legs: 9.8 mV at 65 mΩ typical, 11.7 mV at 78 mΩ maximum. On the way the part dissipates at most 0.56 W, with the drain at 7.5 V: about 22 °C of rise with the 40 °C/W of a TO-247 in free air.` }
	],

	quiz: [
		[r`A GaN gate driver set to 5.5 V, the top of EPC's tolerance, rings 15 % above its level at each edge. Is the EPC2045 gate safe?`, r`No: $5.5 \times 1.15 = 6.3$ V, over the +6 V absolute maximum. At 5.5 V the margin is $6 / 5.5 = 1.09$: only 9 % of overshoot is allowed, so the gate loop has to be shortened or damped, or the drive set nearer 5 V.`],
		[r`Two C3M0065090D in parallel, each at 90 mΩ hot, against one IGBT of 1.0 V knee and 20 mΩ slope, at 30 A. Which conducts with less loss, and where do they cross?`, r`The pair is 45 mΩ: $30^2 \times 0.045 = 40.5$ W, against $(1.0 + 0.02 \times 30) \times 30 = 48$ W for the IGBT. They cross at $I^* = 1.0 / (0.045 - 0.020) = 40$ A. One SiC part alone would cross at 14 A and lose 81 W at 30 A.`],
		[r`A 600 V silicon MOSFET is redesigned for 1200 V on the same die area. How does its drift-layer resistance change, and what would a material with twice the critical field give at 1200 V?`, r`$R_{on} A \propto V_{BR}^2 / E_c^3$. Doubling the voltage multiplies it by 4, a little more in real silicon. Doubling $E_c$ divides it by $2^3 = 8$, so the 1200 V part in that material has $4 / 8 = 0.5$ times the resistance of the 600 V silicon one, before mobility and permittivity are counted.`]
	],

	parts: ['EPC2045', 'C3M0065090D'],
	related: ['n-mosfet', 'igbt']
};
