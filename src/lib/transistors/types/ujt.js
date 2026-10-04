// The unijunction transistor (UJT), with the programmable UJT (PUT). Content
// of one page of the transistor guide: see src/lib/transistors/types/index.js
// for what each field is. Strings with formulas use String.raw so a LaTeX
// backslash stays one backslash.
const r = String.raw;

export default {
	slug: 'ujt',
	name: 'Unijunction transistor',
	short: 'UJT',
	family: 'power',
	symbol: { name: 'unijunction_transistor_horz', labels: { 1: 'B2', 2: 'B1', 3: 'E' } },
	control: r`The emitter voltage: it fires when $V_E$ passes the peak point $\eta V_{BB} + V_D$`,
	normally: 'off',
	fullyOn: r`Not a switch: past the valley the emitter conducts like a diode, $V_{EB1(sat)} \le 2.5$ V at 50 mA and $V_{B2B1}$ = 10 V (2N2646)`,
	terminals: [
		['E', 'emitter'],
		['B1', 'base 1'],
		['B2', 'base 2']
	],
	oneLiner: r`A bar of N silicon with one P emitter: it stays off until the emitter reaches a fixed fraction $\eta$ of the supply, then fires and dumps a capacitor in one pulse.`,
	usedFor: ['Relaxation oscillators and sawtooth generators', 'Trigger pulses for thyristors and triacs', 'Timing in older designs, a 555 today'],

	howItWorks: [
		{
			p: r`The UJT is not an amplifier, and a transistor only by name. It is a bar of N-type silicon with an ohmic contact at each end, base 1 (B1) and base 2 (B2), and one P-type emitter (E) in the side of the bar. That is a single P-N junction where the NPN has two, hence "unijunction". It has no gain. It is a special-purpose trigger device, which Motorola filed with the thyristor triggers, and it sits in this guide for its name and for what it teaches.`
		},
		{
			p: r`With a voltage $V_{BB}$ from B2 to B1 (written $V_{B2B1}$ on a datasheet), the bar is a resistor divider, and the point facing the emitter sits at a fixed fraction of $V_{BB}$. Below that voltage, the emitter junction is reverse-biased and only leakage flows. Within one diode drop above it, the junction is forward-biased but passes only microamps. Past that, it turns on and injects holes into the B1 half of the bar. The extra carriers make that half conduct better, so its resistance falls, the point facing the emitter drops, and the junction is pushed further on. The emitter voltage falls while its current rises: a negative resistance.`
		},
		{
			eq: r`\eta = \frac{r_{B1}}{r_{BB}} = \frac{r_{B1}}{r_{B1} + r_{B2}}`,
			intro: r`The divider ratio is the **intrinsic stand-off ratio** $\eta$ (eta):`
		},
		{
			p: r`$r_{B1}$ and $r_{B2}$ are the resistances of the bar from the emitter to each base. Their sum $r_{BB}$ is the **interbase resistance**, given on a datasheet as $R_{BBO}$, measured with the emitter open: 4.7 to 9.1 kΩ for a 2N2646 at $V_{B2B1} = 3$ V. $\eta$ is fixed when the part is made, with a wide spread: 0.56 to 0.75 for a 2N2646 at $V_{B2B1} = 10$ V, 0.68 to 0.82 for a 2N2647. Since $\eta$ is above 0.5, $r_{B1}$ is the longer part of the bar and the emitter sits nearer B2.`
		},
		{
			eq: r`V_P = \eta\, V_{BB} + V_D`,
			intro: r`The emitter fires at the **peak-point** voltage:`
		},
		{
			p: r`$V_D$ is the forward drop of the emitter junction. The Digitron 2N2646 sheet uses about 0.45 V at 10 µA to define $\eta$ but guarantees no value; this page takes 0.6 V, a usual silicon diode drop, as a round estimate. The current the emitter needs at that point to start firing is the peak-point current $I_P$, at most 5 µA for a 2N2646 at $V_{B2B1} = 25$ V. The fall ends at the **valley point** ($V_V$, $I_V$): past it, more current needs more voltage again, as in a forward diode. $I_V$ is at least 4 mA at $V_{B2B1} = 20$ V. The sheet gives no figure for $V_V$.`
		},
		{ h: 'Regions of the emitter characteristic' },
		{
			table: {
				head: ['Region', 'Emitter voltage', 'Emitter current', 'What happens', 'In the oscillator'],
				rows: [
					['Off (cutoff)', r`below $V_P$`, r`leakage, then a forward current under $I_P$`, r`junction reverse-biased, then barely forward-biased in the last diode drop; the bar is a plain resistor $r_{BB}$`, 'the capacitor charges'],
					['Firing (negative resistance)', r`falls from $V_P$ to $V_V$`, r`rises from $I_P$ to $I_V$`, 'holes injected toward B1 make that half of the bar conduct better', 'the capacitor dumps into the base-1 resistor'],
					['On (saturation)', r`above $V_V$, rising slowly`, r`above $I_V$`, 'a forward diode with some series resistance', r`only if $R$ feeds more than $I_V$: the oscillator latches`]
				]
			}
		},
		{
			note: r`Three words mislead here. The junction does not "break down" when the UJT fires: it is forward-biased, and what collapses is the resistance of the B1 half of the bar. "Negative resistance" is a negative slope, less voltage at more current; $V/I$ stays positive and the part dissipates power, so the energy of the pulse comes from the capacitor. And the UJT's emitter is its control input, where an NPN is controlled at its base.`,
			tone: 'warn'
		},
		{ h: 'The relaxation oscillator' },
		{
			p: r`The UJT is known for one circuit. A resistor $R$ from the supply charges a capacitor $C$ on the emitter. Base 2 goes to the supply, often through a few hundred ohms, and base 1 to ground through a small resistor of tens of ohms. When the capacitor reaches $V_P$ the UJT fires, and the capacitor dumps through emitter and base 1 into that small resistor. Once the current falls below $I_V$ the UJT turns off, and the capacitor charges again from about $V_V$. A slow charge, then a sudden release: that is what "relaxation" means.`
		},
		{
			eq: r`T = RC \ln\frac{V_{BB} - V_V}{V_{BB} - V_P} \qquad V_P = \eta\, V_{BB} + V_D`,
			intro: r`Charging from the valley to the peak point takes:`
		},
		{
			p: r`$V_{BB}$ is the supply, here also the voltage across the bar, and the short discharge adds a little on top. When $V_D$ and $V_V$ are small next to the supply they drop out, and so does the supply itself:`
		},
		{ eq: r`T \approx RC \ln\frac{1}{1 - \eta}` },
		{
			p: r`The period depends on $R$, $C$ and $\eta$, and hardly on the supply, because the peak point is a fixed fraction of it. That is what made the UJT a timing part. The textbook shortcut $T \approx RC$ holds only for $\eta = 1 - 1/e \approx 0.63$. The interactive figure further down draws the exact sawtooth and gives both periods.`
		},
		{
			p: r`The useful output was the pulse across the base-1 resistor. Fed to the gate of an SCR or a triac, it fired the thyristor once per period of the oscillator. That was the UJT's main job, and the reason Motorola's thyristor data book covers it.`
		},
		{ h: 'Why a 555 replaced it' },
		{
			p: r`A 555 timer is a relaxation oscillator on a chip. Two comparators watch the capacitor, with levels at about one third and two thirds of the supply, set by a resistor divider inside the chip (TI NE555 datasheet, SLFS022K). Those levels are a ratio of resistors, not a property of the silicon like $\eta$. The output is a rectangle that sinks or sources up to 200 mA, and the duty cycle is adjustable. The UJT oscillator is still worth building for what it shows: a part with a negative-resistance region turns an RC into an oscillator, with a slow charge and a fast release between two thresholds. The 555 and the DIAC that triggers a triac work on the same idea.`
		},
		{
			more: [
				{ p: r`Through $R$, the capacitor voltage rises toward the supply with the time constant $RC$, starting from the valley:` },
				{ eq: r`v_C(t) = V_{BB} - (V_{BB} - V_V)\, e^{-t/RC}` },
				{ p: r`Setting $v_C(T) = V_P$ and solving for $T$ gives the exact period. With $V_V = 0$ and $V_D = 0$, the peak is $\eta V_{BB}$ and the supply cancels: $T = RC \ln(V_{BB} / (V_{BB} - \eta V_{BB})) = RC \ln(1/(1-\eta))$. The two corrections pull opposite ways. $V_D$ raises the peak and lengthens the charge; $V_V$ starts each charge higher and shortens it. With the figure's values, $\eta = 0.65$ on 12 V with 47 kΩ and 100 nF, $V_P = 8.4$ V and the exact period is 4.80 ms, against 4.93 ms for the shortcut.` },
				{ p: r`$\eta$ is often said not to depend on temperature. Motorola's data book says it does: both $\eta$ and $V_D$ fall as the part warms, and the peak point drifts with them. A resistor in series with base 2 compensates: chosen right, it holds $V_P$ within 1 % over 50 °C.` }
			],
			summary: 'The period, derived, and the drift with temperature'
		}
	],

	curves: {
		widget: 'ujtWave',
		props: { r: 47000, c: 100e-9, eta: 0.65, vbb: 12, vv: 2, vd: 0.6 },
		caption: r`The capacitor voltage of the relaxation oscillator on 12 V. It charges through $R$ toward the supply, fires at the peak point $V_P = \eta V_{BB} + V_D$ and drops to the valley; the first charge starts from 0 V and lasts longer. The readout compares the exact period with $RC \ln(1/(1-\eta))$. The 2 V valley and the 0.6 V diode drop are example values, not datasheet figures.`
	},

	sims: ['ujt-oscillator'],

	rules: [
		{
			title: 'The charging resistor must sit inside a window',
			body: [
				{ p: r`Too large an $R$ cannot supply the peak-point current at $V_P$: the capacitor stalls just below the peak and the UJT never fires. Too small an $R$ still supplies more than the valley current after the discharge: the UJT stays on and the oscillator latches.` },
				{ eq: r`R_{max} = \frac{V_{BB} - V_P}{I_P} \qquad R_{min} = \frac{V_{BB} - V_V}{I_V}` },
				{ p: r`A 2N2646 on 15 V: $V_P$ is 9.0 V for $\eta = 0.56$ and 11.85 V for $\eta = 0.75$. With $I_P \le 5\ \mu\text{A}$ the worst case is $R_{max} = (15 - 11.85) / 5\ \mu\text{A} = 630$ kΩ. With $I_V \ge 4$ mA and a valley taken anywhere from 0 to 3 V (the sheet gives no $V_V$), $R_{min}$ is 3.0 to 3.75 kΩ. Motorola advises two to three times $R_{min}$ to be sure the UJT turns off, so $R$ runs from about 10 kΩ to a few hundred kΩ. $I_P$ and $I_V$ are specified at $V_{B2B1}$ = 25 V and 20 V, not at the supply of the circuit, so the window at 15 V is an estimate and $R$ belongs well inside it.` }
			]
		},
		{
			title: r`The period is about $RC \ln(1/(1-\eta))$, and $\eta$ spreads it 1.7 to 1`,
			body: [
				{ eq: r`T = RC \ln\frac{V_{BB}}{V_{BB} - V_P} \quad (V_V \approx 0)` },
				{ p: r`With $R = 47$ kΩ and $C = 100$ nF on 15 V, $V_D = 0.6$ V and $V_V \approx 0$: 4.3 ms for $\eta = 0.56$ and 7.3 ms for $\eta = 0.75$, so 232 Hz down to 136 Hz. The shortcut gives 3.9 and 6.5 ms: at 15 V the diode drop adds about 12 %. The spread of $\eta$ alone moves the period 1.7 to 1 between two parts of the same number, so the frequency is trimmed with a potentiometer in series with $R$, kept inside the window of the rule above.` }
			]
		},
		{
			title: 'The pulse comes from a small resistor in base 1',
			body: [
				{ p: r`Between pulses the bar itself carries a standing current, and the base-1 resistor $R_{B1}$ turns it into a standing voltage on the thyristor gate. That voltage has to stay far below what fires a gate, which is why $R_{B1}$ is tens of ohms.` },
				{ eq: r`V_{R_{B1}} = V_{BB}\, \frac{R_{B1}}{r_{BB} + R_{B1}}` },
				{ p: r`On 15 V with base 2 straight to the supply, $R_{B1} = 47\ \Omega$ and $r_{BB}$ taken as the 4.7 to 9.1 kΩ of a 2N2646: 1.6 to 3.2 mA, so 0.08 to 0.15 V on the gate. A 2N5060 SCR is sure to fire with 0.8 V and 200 µA on its gate at 25 °C ($V_{AK}$ = 7 V, $R_L$ = 100 Ω), but that is what the least sensitive part needs. The sheet guarantees no firing only below its gate non-trigger voltage, 0.1 V, at 110 °C with the rated voltage on the anode. 0.15 V is above that. 22 Ω in base 1 brings the standing voltage down to 0.04 to 0.07 V, under that limit, at the cost of a smaller pulse. A 4.7 kΩ in the same place would sit at a third to a half of the supply and hold the thyristor on. The capacitor has limits too: 10 µF or less, charged to 30 V or less, for a 2N2646, with 2 A peak and 50 mA RMS in the emitter.` }
			]
		},
		{
			title: r`A PUT sets its own $\eta$ with two resistors`,
			body: [
				{
					eq: r`V_S = \frac{R_1}{R_1 + R_2}\, V_B \qquad R_G = \frac{R_1 R_2}{R_1 + R_2} \qquad V_P = V_S + V_T`,
					intro: r`$R_1$ goes from gate to cathode, $R_2$ from gate to the supply $V_B$:`
				},
				{ p: r`$V_T$ is the PUT's offset voltage, not the thermal voltage of the NPN page. A 2N6027 on 15 V with $R_1 = R_2 = 20$ kΩ: $V_S = 7.5$ V, an $\eta$ of 0.5, and $R_G = 10$ kΩ. At $R_G = 10$ kΩ the datasheet gives $V_T$ = 0.2 to 0.6 V, so $V_P \approx 7.7$ to 8.1 V. $I_P \le 5\ \mu\text{A}$ gives $R_{max} = (15 - 8.1) / 5\ \mu\text{A} \approx 1.4$ MΩ, and $I_V \ge 70\ \mu\text{A}$, with a valley between 0 and 1.5 V (it sits below the forward drop, at most 1.5 V at 50 mA), gives $R_{min} \approx 190$ to 215 kΩ. $R = 470$ kΩ and $C = 100$ nF then give $T \approx RC \ln(V_B / (V_B - V_P))$ = 34 to 37 ms, about 28 Hz. The datasheet tests at $V_S = 10$ V, not 7.5 V, so these are estimates.` }
			]
		}
	],

	mistakes: [
		['A UJT is a transistor, so it amplifies.', r`It has one junction and no gain. It is a trigger: off until the emitter reaches $V_P$, on until the current falls below $I_V$. "Transistor" is a historical name.`],
		['The emitter junction breaks down when the UJT fires.', 'It turns on in the forward direction. The holes it injects make the base-1 half of the bar conduct, and that resistance collapses. Nothing is driven into reverse breakdown.'],
		['Negative resistance means the part gives out energy.', r`Only the slope is negative: between the peak and the valley, more current comes with less voltage. $V \times I$ stays positive and the UJT dissipates. The energy of the pulse was stored in the capacitor.`],
		[r`$\eta$ is precise, so $R$ and $C$ set the frequency.`, r`$\eta$ spreads from 0.56 to 0.75 on the 2N2646, which moves the period 1.7 to 1 for the same $R$ and $C$. A trimmer sets the frequency.`],
		['The PUT is an improved UJT.', r`It is a four-layer device, a small thyristor with its anode gate brought out. It acts like a UJT only in the oscillator, with $\eta$ set by two resistors, and it stays latched like a thyristor until its current falls below $I_V$.`],
		['The metal can of a 2N2646 is isolated.', 'The TO-18 case is connected to base 2. In the oscillator that is the supply, so the can must not touch anything grounded.']
	],

	variants: [
		{ p: r`The **programmable UJT** (PUT), such as the 2N6027, is not a unijunction at all. It is a four-layer PNPN device, a small thyristor that brings out its anode gate instead of the usual cathode gate; its transistor model is a PNP and an NPN, like an SCR. Its terminals are anode, gate and cathode, pins 1, 2 and 3 of the TO-92. A divider holds the gate at a fraction of the supply: $V_S$ is its open-circuit voltage and $R_G$ its Thevenin resistance, the two divider resistors in parallel. When the anode climbs one offset voltage above it, the device latches and dumps the capacitor into the cathode resistor, and it turns off when the current falls below $I_V$. The divider ratio plays the part of $\eta$, now chosen by the designer, though the offset $V_T$ still spreads from part to part.` },
		{ p: r`Motorola calls the PUT faster and more sensitive than the UJT. The 2N6027 at $V_S = 10$ V: with $R_G = 1$ MΩ, $I_P$ is 1.25 µA typical (2 µA max) and $I_V$ 18 µA typical; with $R_G = 10$ kΩ, $I_P$ is 4 µA typical (5 µA max) and $I_V$ at least 70 µA. A smaller $R_G$ raises both, which moves the window for $R$. Two limits matter on a breadboard: the energy dumped from the capacitor, $\tfrac{1}{2} C V^2$, must stay under 250 µJ, and the gate must not go more than 5 V below the cathode. 10 µF charged to 15 V holds 1.1 mJ, four and a half times the limit.` }
	],

	bench: [
		{ p: r`**Meter check.** On the resistance range, B1 to B2 reads the bar, near the 4.7 to 9.1 kΩ the 2N2646 datasheet gives at 3 V, and the same in both directions. On the diode range, red lead on the emitter gives a forward reading to either base, and nothing with the leads swapped: the P emitter into the N bar. The pin left out of the resistor pair is the emitter. On the TO-18 can, pin 1 is the emitter, pin 2 base 1 and pin 3 base 2, and the continuity beeper finds the can tied to base 2. On a 2N6027 PUT the only diode reading is anode (red) to gate; gate to cathode reads open both ways.` },
		{ p: r`**First build.** The oscillator of the rules: 2N2646, base 2 straight to +15 V, 47 Ω from base 1 to ground, 47 kΩ from +15 V to the emitter, 100 nF from the emitter to ground. On a scope the capacitor shows a sawtooth that climbs to the peak point, about 9 to 12 V depending on the part's $\eta$, and drops at once; the period lands near 4.3 to 7.3 ms, a little less because of the valley voltage. Across the 47 Ω, a narrow positive pulse each cycle, standing on 0.08 to 0.15 V between pulses. A 2N6027 builds the same way, with its gate on a 20 kΩ and 20 kΩ divider, 470 kΩ and 100 nF on the anode and 47 Ω from cathode to ground: about 28 Hz, with peaks near 8 V.` }
	],

	quiz: [
		[r`A 2N2646 with $\eta = 0.65$ runs on 12 V with $R = 47$ kΩ and $C = 100$ nF. Where does it fire, and what period does the shortcut give?`, r`$V_P = 0.65 \times 12 + 0.6 = 8.4$ V. $T \approx 4.7\ \text{ms} \times \ln(1/0.35) = 4.93$ ms, about 203 Hz. With a 2 V valley the exact charge from 2 to 8.4 V takes 4.80 ms: the shortcut is 3 % long, because the valley shortens the charge more than the diode drop lengthens it.`],
		[r`The same oscillator, $\eta = 0.65$ and $V_V \approx 0$, sees its supply fall from 15 V to 12 V. How much does the period change?`, r`At 15 V: $V_P = 10.35$ V and $\ln(15/4.65) = 1.171$. At 12 V: $V_P = 8.4$ V and $\ln(12/3.6) = 1.204$. The period grows by 2.8 % for a 20 % drop of the supply, and only $V_D$ keeps that from being zero.`],
		[r`A 2N6027 PUT on 15 V has its gate on two 20 kΩ resistors. Does a 1 MΩ charging resistor oscillate?`, r`$V_S = 7.5$ V, $R_G = 10$ kΩ, and $V_P$ is at most 8.1 V. At the peak, 1 MΩ passes $(15 - 8.1) / 1\ \text{M}\Omega = 6.9\ \mu\text{A}$, above the 5 µA maximum $I_P$: it fires. At the valley it passes under 15 µA, far below the 70 µA minimum $I_V$: it turns off. So it oscillates, with the caveat that the datasheet figures hold at $V_S = 10$ V.`]
	],

	parts: ['2N2646', '2N6027'],
	related: ['npn', 'darlington']
};
