/**
 * Real parts the guide points to, each with the manufacturer's datasheet
 * (link checked to open the PDF), its pinout as it sits on a breadboard
 * and the lines of its datasheet that matter, each with the condition it
 * is measured at: [line, value, condition].
 *   pinout  { package, legs, tab?, note? } for a TO-92, TO-220, TO-247,
 *           TO-126, TO-225 or SOT-23: legs left to right seen from the
 *           front (flat or printed face toward the viewer, legs down), or
 *           pins 1, 2, 3 for a SOT-23; { package, text, note? } for any
 *           other package, the pins in words
 *   read    which lines to read first, and why
 */
export const PARTS = {
	'2N3904': {
		id: '2N3904',
		part: '2N3904',
		kind: 'NPN, small signal',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/pdf/datasheet/2n3903-d.pdf',
		pinout: { package: 'TO-92', legs: ['E', 'B', 'C'], note: 'flat face toward the viewer; a BC547 has the reverse order' },
		values: [
			[r`$V_{CEO}$`, '40 V max', 'base open'],
			[r`$I_C$`, '200 mA max', 'continuous'],
			[r`$h_{FE}$`, '100 to 300', r`$I_C = 10$ mA, $V_{CE} = 1$ V`],
			[r`$h_{FE}$`, '30 min', r`$I_C = 100$ mA, $V_{CE} = 1$ V`],
			[r`$V_{CE(sat)}$`, '0.2 V max', r`$I_C = 10$ mA, $I_B = 1$ mA`],
			[r`$V_{CE(sat)}$`, '0.3 V max', r`$I_C = 50$ mA, $I_B = 5$ mA`],
			[r`$V_{BE(sat)}$`, '0.65 to 0.85 V', r`$I_C = 10$ mA, $I_B = 1$ mA`],
			[r`$V_{EBO}$`, '6 V max', 'emitter-base, reverse'],
			[r`$f_T$`, '300 MHz min', r`$I_C = 10$ mA, $V_{CE} = 20$ V, $f = 100$ MHz`],
			[r`$P_D$, $R_{\theta JA}$`, '625 mW, 200 °C/W', r`$T_A = 25$ °C, derate 5.0 mW/°C`]
		],
		read: r`$h_{FE}$ at the current of the job: 100 minimum at 10 mA but only 30 at 100 mA, and the "typical 300" quoted online is the 10 mA maximum. Then $V_{CE(sat)}$, measured at $I_C / I_B = 10$, which is the forced beta to design a switch with.`
	},
	PN2222A: {
		id: 'PN2222A',
		part: 'PN2222A',
		kind: 'NPN, small signal, higher current',
		maker: 'onsemi (Fairchild)',
		package: 'TO-92',
		url: 'https://www.onsemi.com/pdf/datasheet/pn2222a-d.pdf',
		pinout: { package: 'TO-92', legs: ['E', 'B', 'C'], note: 'flat face toward the viewer; the onsemi P2N2222A, also sold as "2N2222A", is C B E' },
		values: [
			[r`$V_{CEO}$`, '40 V max', 'base open'],
			[r`$I_C$`, '1.0 A max', 'absolute maximum, steady state'],
			[r`$h_{FE}$`, '100 to 300', r`$I_C = 150$ mA, $V_{CE} = 10$ V, pulsed`],
			[r`$h_{FE}$`, '50 min', r`$I_C = 150$ mA, $V_{CE} = 1$ V`],
			[r`$h_{FE}$`, '40 min', r`$I_C = 500$ mA, $V_{CE} = 10$ V`],
			[r`$V_{CE(sat)}$`, '0.3 V max', r`$I_C = 150$ mA, $I_B = 15$ mA`],
			[r`$V_{CE(sat)}$`, '1.0 V max', r`$I_C = 500$ mA, $I_B = 50$ mA`],
			[r`$V_{BE(sat)}$`, '0.6 to 1.2 V', r`$I_C = 150$ mA, $I_B = 15$ mA`],
			[r`$f_T$`, '300 MHz min', r`$I_C = 20$ mA, $V_{CE} = 20$ V, $f = 100$ MHz`],
			[r`$P_D$, $R_{\theta JA}$`, '625 mW, 200 °C/W', r`$T_A = 25$ °C, derate 5.0 mW/°C`]
		],
		read: r`The 1 A on page 1 is a stress limit: at 500 mA the table guarantees an $h_{FE}$ of only 40 and allows 1.0 V of $V_{CE(sat)}$, so a relay or LED switch is designed from the 150 mA rows. Then the body marking, since the PN2222A and the P2N2222A have opposite pinouts.`
	},
	BC547: {
		id: 'BC547',
		part: 'BC547B',
		kind: 'NPN, small signal',
		maker: 'onsemi (Fairchild)',
		package: 'TO-92',
		url: 'https://www.onsemi.com/pdf/datasheet/bc550-d.pdf',
		pinout: { package: 'TO-92', legs: ['C', 'B', 'E'], note: 'flat face toward the viewer; the reverse of a 2N3904' },
		values: [
			[r`$V_{CEO}$`, '45 V max', 'base open'],
			[r`$I_C$`, '100 mA max', 'continuous'],
			[r`$P_C$`, '500 mW max', 'absolute maximum; no thermal resistance in this document'],
			[r`$h_{FE}$`, '200 to 450', r`$I_C = 2$ mA, $V_{CE} = 5$ V, B grade (A: 110 to 220, C: 420 to 800)`],
			[r`$V_{BE(on)}$`, '0.58 to 0.70 V', r`$I_C = 2$ mA, $V_{CE} = 5$ V (0.66 V typ)`],
			[r`$V_{CE(sat)}$`, '0.25 V max (0.09 typ)', r`$I_C = 10$ mA, $I_B = 0.5$ mA`],
			[r`$V_{CE(sat)}$`, '0.6 V max (0.25 typ)', r`$I_C = 100$ mA, $I_B = 5$ mA`],
			[r`$f_T$`, '300 MHz typ', r`$I_C = 10$ mA, $V_{CE} = 5$ V, $f = 100$ MHz; no minimum given`],
			[r`$C_{ob}$`, '6.0 pF max (3.5 typ)', r`$V_{CB} = 10$ V, $I_E = 0$, $f = 1$ MHz`]
		],
		read: 'The suffix first: A, B and C are gain grades of the same die, and the pinout, which is the reverse of the 2N3904. The often-linked onsemi bc546-d.pdf is marked obsolete on every page; this bc550-d.pdf is the current document.'
	},
	'2N3906': {
		id: '2N3906',
		part: '2N3906',
		kind: 'PNP, small signal',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/pdf/datasheet/2n3906-d.pdf',
		pinout: { package: 'TO-92', legs: ['E', 'B', 'C'], note: 'flat face toward the viewer; same as the 2N3904, the reverse of a BC557' },
		values: [
			[r`$V_{CEO}$`, '40 V max', 'base open; printed as a magnitude'],
			[r`$I_C$`, '200 mA max', 'continuous'],
			[r`$h_{FE}$`, '100 to 300', r`$I_C = 10$ mA, $V_{CE} = 1$ V`],
			[r`$h_{FE}$`, '30 min', r`$I_C = 100$ mA, $V_{CE} = 1$ V`],
			[r`$V_{CE(sat)}$`, '0.25 V max', r`$I_C = 10$ mA, $I_B = 1$ mA`],
			[r`$V_{CE(sat)}$`, '0.4 V max', r`$I_C = 50$ mA, $I_B = 5$ mA`],
			[r`$V_{BE(sat)}$`, '0.65 to 0.85 V', r`$I_C = 10$ mA, $I_B = 1$ mA`],
			[r`$V_{EBO}$`, '5.0 V max', 'emitter-base, reverse'],
			[r`$f_T$`, '250 MHz min', r`$I_C = 10$ mA, $V_{CE} = 20$ V, $f = 100$ MHz`],
			[r`$P_D$, $R_{\theta JA}$`, '625 mW, 200 °C/W', r`$T_A = 25$ °C, derate 5.0 mW/°C`]
		],
		read: r`Every voltage and current is printed as a magnitude: in the circuit the collector sits below the emitter, and the base and collector currents flow out of the part. Otherwise it reads like the 2N3904, with a slightly higher $V_{CE(sat)}$ (0.25 V against 0.2 V at 10 mA).`
	},
	BC557: {
		id: 'BC557',
		part: 'BC557B',
		kind: 'PNP, small signal',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/pdf/datasheet/bc556b-d.pdf',
		pinout: { package: 'TO-92', legs: ['C', 'B', 'E'], note: 'flat face toward the viewer; like the BC547, the reverse of a 2N3906' },
		values: [
			[r`$V_{CEO}$`, '-45 V max', 'base open'],
			[r`$I_C$`, '-100 mA max', 'continuous (-200 mA peak)'],
			[r`$h_{FE}$`, '180 to 460 (290 typ)', r`$I_C = -2$ mA, $V_{CE} = -5$ V, B grade (A: 120 to 220, C: 420 to 800)`],
			[r`$V_{BE(on)}$`, '-0.55 to -0.70 V', r`$I_C = -2$ mA, $V_{CE} = -5$ V (-0.62 V typ)`],
			[r`$V_{CE(sat)}$`, '-0.3 V max (-0.075 typ)', r`$I_C = -10$ mA, $I_B = -0.5$ mA`],
			[r`$V_{CE(sat)}$`, '-0.65 V max (-0.25 typ)', r`$I_C = -100$ mA, $I_B = -5$ mA`],
			[r`$f_T$`, '320 MHz typ', r`$I_C = -10$ mA, $V_{CE} = -5$ V, $f = 100$ MHz; no minimum given`],
			[r`$C_{ob}$`, '6.0 pF max (3.0 typ)', r`$V_{CB} = -10$ V, $I_C = 0$, $f = 1$ MHz`],
			[r`$P_D$, $R_{\theta JA}$`, '625 mW, 200 °C/W', r`$T_A = 25$ °C, derate 5.0 mW/°C`]
		],
		read: 'The pinout first: C B E like the BC547, so a 2N3906 does not drop into its place. This sheet prints the PNP voltages and currents with their minus signs, where the 2N3906 sheet prints magnitudes.'
	},
	TIP120: {
		id: 'TIP120',
		part: 'TIP120',
		kind: 'NPN Darlington, power',
		maker: 'onsemi',
		package: 'TO-220',
		url: 'https://www.onsemi.com/pdf/datasheet/tip120-d.pdf',
		pinout: { package: 'TO-220', legs: ['B', 'C', 'E'], tab: 'C', note: 'printed face toward the viewer, tab behind; the tab is the collector' },
		values: [
			[r`$V_{CEO}$`, '60 V max', 'base open (TIP121: 80 V, TIP122: 100 V)'],
			[r`$I_C$`, '5.0 A max', 'continuous (8.0 A peak)'],
			[r`$I_B$`, '120 mA max', 'absolute maximum'],
			[r`$h_{FE}$`, '1000 min', r`$I_C = 0.5$ A and 3.0 A, $V_{CE} = 3.0$ V`],
			[r`$V_{CE(sat)}$`, '2.0 V max', r`$I_C = 3.0$ A, $I_B = 12$ mA`],
			[r`$V_{CE(sat)}$`, '4.0 V max', r`$I_C = 5.0$ A, $I_B = 20$ mA`],
			[r`$V_{BE(on)}$`, '2.5 V max', r`$I_C = 3.0$ A, $V_{CE} = 3.0$ V`],
			[r`$P_D$`, '65 W, 2.0 W', r`$T_C = 25$ °C (case), $T_A = 25$ °C (free air)`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '1.92 °C/W, 62.5 °C/W', 'junction to case, junction to ambient'],
			[r`$R_1$, $R_2$`, 'about 8 kΩ, 120 Ω', 'built in, across the B-E of the driver and of the output transistor (Fig. 1)']
		],
		read: r`$V_{CE(sat)}$ before $h_{FE}$: 2 V at 3 A is 6 W in the part, so it needs a heatsink. The internal diode runs from emitter to collector and does not replace a flyback diode across a relay or motor coil.`
	},
	ULN2003A: {
		id: 'ULN2003A',
		part: 'ULN2003A',
		kind: 'Seven NPN Darlingtons with clamp diodes',
		maker: 'Texas Instruments',
		package: 'PDIP-16',
		url: 'https://www.ti.com/lit/ds/symlink/uln2003a.pdf',
		pinout: {
			package: 'PDIP-16',
			text: 'Inputs 1B to 7B on pins 1 to 7. Pin 8: E, the common emitter, to ground. Pin 9: COM, the common cathode of the seven flyback diodes. Outputs 7C to 1C on pins 10 to 16, so each output faces its input (1B on pin 1, 1C on pin 16).',
			note: 'Top view, notch up, pin 1 at top left. The SOIC and TSSOP versions have the same pinout.'
		},
		values: [
			[r`$V_{CE}$`, '50 V max', 'absolute maximum, each output'],
			[r`$I_C$`, '500 mA max', 'peak, each output; duty-cycle limits in Figs. 5-4 and 5-5'],
			[r`$I_E$`, '2.5 A max', 'total through pin 8, all outputs together'],
			[r`$V_{CE(sat)}$`, '1.1 V max (0.9 typ)', r`$I_C = 100$ mA, $I_I = 250$ µA`],
			[r`$V_{CE(sat)}$`, '1.3 V max (1.0 typ)', r`$I_C = 200$ mA, $I_I = 350$ µA`],
			[r`$V_{CE(sat)}$`, '1.6 V max (1.2 typ)', r`$I_C = 350$ mA, $I_I = 500$ µA`],
			[r`$V_{I(on)}$`, '2.4 V max', r`$I_C = 200$ mA, $V_{CE} = 2$ V (2.7 V at 250 mA, 3 V at 300 mA)`],
			[r`$V_F$`, '2 V max (1.7 typ)', r`clamp diode, $I_F = 350$ mA`],
			[r`$I_{CEX}$`, '50 µA max', r`$V_{CE} = 50$ V, input open ($I_I = 0$)`],
			[r`$R_{\theta JA}$`, '66.7 °C/W', 'PDIP (88.6 °C/W in SOIC)']
		],
		read: r`$V_{CE(sat)}$ first: about 1 V, so seven outputs at 200 mA make 1.4 W, a 93 °C rise in the PDIP, and the duty-cycle curves decide how many can stay on. Then pin 9: COM goes to the coil supply, otherwise the clamp diodes do nothing.`
	},
	TEPT4400: {
		id: 'TEPT4400',
		part: 'TEPT4400',
		kind: 'NPN phototransistor, ambient light',
		maker: 'Vishay',
		package: 'T-1 (3 mm), two leads',
		url: 'https://www.vishay.com/docs/81341/tept4400.pdf',
		pinout: {
			package: 'T-1 (3 mm)',
			text: 'Two leads, collector and emitter. The base has no lead: light is its only drive.',
			note: 'The package drawing puts E over the longer lead and C over the shorter one. It is not stated in words, so check before powering; reversed, the part survives only 1.5 V.'
		},
		values: [
			[r`Light current, $I_{PCE}$`, '15 to 70 µA', r`$E_v = 20$ lx, CIE illuminant A, $V_{CE} = 5$ V; bins A 15 to 28.4, B 23.5 to 44.6, C 36.9 to 70 µA`],
			[r`Light current, $I_{PCE}$`, '200 µA typ', r`$E_v = 100$ lx, CIE illuminant A, $V_{CE} = 5$ V`],
			[r`Dark current, $I_{CEO}$`, '50 nA max (3 typ)', r`$V_{CE} = 5$ V, no light`],
			[r`$V_{CEO}$`, '6 V max', 'absolute maximum'],
			[r`$V_{ECO}$`, '1.5 V max', 'reverse, emitter to collector'],
			[r`$I_C$`, '20 mA max', 'absolute maximum'],
			[r`$P_V$`, '100 mW max', r`$T_{amb} \le 55$ °C, absolute maximum`],
			[r`$R_{thJA}$`, '300 K/W', r`junction to ambient; $T_j$ 100 °C max`],
			[r`$\lambda_p$`, '570 nm', 'peak sensitivity, close to the eye']
		],
		read: r`The light current at 20 lx first: the three bins span 15 to 70 µA, so a design works from 15 µA. Then $V_{CEO}$, only 6 V: the part belongs on 5 V, never across the 15 V rail.`
	},
	'4N25': {
		id: '4N25',
		part: '4N25',
		kind: 'Optocoupler, phototransistor output',
		maker: 'Vishay',
		package: 'DIP-6',
		url: 'https://www.vishay.com/docs/83725/4n25.pdf',
		pinout: {
			package: 'DIP-6',
			text: 'Top view, pin 1 at the dot. LED side: 1 anode, 2 cathode, 3 not connected. Transistor side: 4 emitter, 5 collector, 6 base.',
			note: 'Pin 6 is usually left open; a resistor to pin 4 trades sensitivity for speed.'
		},
		values: [
			['CTR', '20 % min (50 typ)', r`$I_F = 10$ mA, $V_{CE} = 10$ V`],
			[r`$V_{CE(sat)}$`, '0.5 V max', r`$I_C = 2$ mA, $I_F = 50$ mA`],
			[r`$t_r$, $t_f$`, '2 µs typ', r`$V_{CE} = 10$ V, $I_F = 10$ mA, $R_L = 100$ Ω`],
			[r`$BV_{CEO}$`, '30 V min', r`$I_C = 1$ mA (the absolute maximum table says 70 V)`],
			[r`$I_F$`, '60 mA max', 'LED, absolute maximum'],
			[r`$V_F$`, '1.5 V max (1.3 typ)', r`LED, $I_F = 50$ mA`],
			[r`Dark current, $I_{CEO}$`, '50 nA max (5 typ)', r`$V_{CE} = 10$ V, base open, LED off`],
			[r`$V_{ISO}$`, '5000 V RMS', 'input to output, Vishay isolation test (JEDEC registered value: 2500 V)']
		],
		read: r`The CTR first: 20 % is the guaranteed minimum at 10 mA and 10 V, 50 % only typical, and it shifts with temperature and drops in saturation (Figs. 2 to 5). Then the tested $BV_{CEO}$ of 30 V, which is the output voltage to design to, not the 70 V of the absolute maximum table.`
	},
	J111: {
		id: 'J111',
		part: 'J111',
		kind: 'N-channel JFET, switch',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/pdf/datasheet/mmbfj113-d.pdf',
		pinout: { package: 'TO-92', legs: ['D', 'S', 'G'], note: "flat face toward the viewer (Case 135AN). InterFET's J111 swaps D and S, which is harmless: the datasheet says they are interchangeable" },
		values: [
			[r`$V_{GS(off)}$`, '-3.0 to -10 V', r`$V_{DS} = 5$ V, $I_D = 1.0$ µA (J112: -1 to -5 V, J113: -0.5 to -3 V)`],
			[r`$I_{DSS}$`, '20 mA min, no max', r`$V_{DS} = 15$ V, $V_{GS} = 0$, pulsed (300 µs, 2 % duty)`],
			[r`$r_{DS(on)}$`, '30 Ω max', r`$V_{DS} \le 0.1$ V, $V_{GS} = 0$`],
			[r`$V_{DG}$, $V_{GS}$`, '35 V, -35 V max', 'absolute maximum'],
			[r`$I_{GF}$`, '50 mA max', 'gate forward current, absolute maximum'],
			[r`$I_{GSS}$`, '-1.0 nA max', r`$V_{GS} = -15$ V, $V_{DS} = 0$`],
			[r`$I_{D(off)}$`, '1.0 nA max', r`$V_{DS} = 5$ V, $V_{GS} = -10$ V`],
			[r`$C_{dg(off)}$, $C_{sg(off)}$`, '5.0 pF max each', r`$V_{DS} = 0$, $V_{GS} = -10$ V, $f = 1$ MHz`],
			[r`$C_{dg(on)} + C_{sg(on)}$`, '28 pF max', r`$V_{DS} = 0$, $V_{GS} = 0$, $f = 1$ MHz`],
			[r`$P_D$, $R_{\theta JA}$`, '625 mW, 200 °C/W', r`TO-92, $T_A = 25$ °C; the older J111/D gives 350 mW, the safer figure`]
		],
		read: r`$I_{DSS}$ has only a minimum, 20 mA, so a drain or source resistor always limits the current: a part passing 50 mA with 15 V across it dissipates 0.75 W. Then $V_{GS(off)}$, -3 to -10 V: only a gate at -10 V or below turns every part off.`
	},
	'2N5457': {
		id: '2N5457',
		part: '2N5457',
		kind: 'N-channel JFET, general purpose',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/pdf/datasheet/2n5457-d.pdf',
		pinout: { package: 'TO-92', legs: ['D', 'S', 'G'], note: 'flat face toward the viewer; same as the J111, and Central Semiconductor uses the same order' },
		values: [
			[r`$V_{GS(off)}$`, '-0.5 to -6.0 V', r`$V_{DS} = 15$ V, $I_D = 10$ nA`],
			[r`$I_{DSS}$`, '1.0 to 5.0 mA (3.0 typ)', r`$V_{DS} = 15$ V, $V_{GS} = 0$, pulsed`],
			[r`$\lvert Y_{fs} \rvert$`, '1.0 to 5.0 mS (3.0 typ)', r`$V_{DS} = 15$ V, $V_{GS} = 0$, $f = 1$ kHz; printed as 1000 to 5000 µmhos`],
			[r`$\lvert Y_{os} \rvert$`, '50 µS max (10 typ)', r`$V_{DS} = 15$ V, $V_{GS} = 0$, $f = 1$ kHz`],
			[r`$V_{GS}$`, '-2.5 V typ', r`$V_{DS} = 15$ V, $I_D = 100$ µA`],
			[r`$C_{iss}$`, '7.0 pF max (4.5 typ)', r`$V_{DS} = 15$ V, $V_{GS} = 0$; printed at 1 kHz, the MMBF5457 sheet says 1 MHz`],
			[r`$C_{rss}$`, '3.0 pF max (1.5 typ)', r`$V_{DS} = 15$ V, $V_{GS} = 0$`],
			[r`$V_{DS}$, $V_{DG}$`, '25 V max', 'absolute maximum'],
			[r`$I_{GSS}$`, '-1.0 nA max', r`$V_{GS} = -15$ V, $V_{DS} = 0$ (-200 nA at 100 °C)`],
			[r`$P_D$`, '310 mW', r`$T_A = 25$ °C, derate 2.82 mW/°C; $T_J$ 135 °C max`]
		],
		read: r`$V_{GS(off)}$ and $I_{DSS}$ together: a 12:1 and a 5:1 spread, so the bias point comes from a source resistor and is measured on each part. Then $\lvert Y_{fs} \rvert$, the gain that the J111 sheet does not guarantee.`
	},
	LSK170: {
		id: 'LSK170',
		part: 'LSK170',
		kind: 'N-channel JFET, low noise',
		maker: 'Linear Integrated Systems',
		package: 'TO-92',
		url: 'https://www.linearsystems.com/_files/ugd/7e8069_a086ff7323054b5da3b91e364c90b3d4.pdf',
		pinout: { package: 'TO-92', legs: ['D', 'G', 'S'], note: 'flat face toward the viewer; the gate is in the middle, unlike the J111 and the 2N5457' },
		values: [
			[r`$I_{DSS}$`, '2.6 to 30 mA', r`$V_{DS} = 10$ V, $V_{GS} = 0$; grades A 2.6 to 6.5, B 6 to 12, C 10 to 20, D 18 to 30 mA`],
			[r`$V_{GS(off)}$`, '-0.2 to -2.0 V', r`$V_{DS} = 10$ V, $I_D = 1$ nA`],
			[r`$e_n$`, '1.9 nV/√Hz max (0.9 typ)', r`$f = 1$ kHz, $V_{DS} = 10$ V, $I_D = 2$ mA, 1 Hz bandwidth`],
			[r`$e_n$`, '4.0 nV/√Hz max (1.4 typ)', r`$f = 10$ Hz, $V_{DS} = 10$ V, $I_D = 2$ mA`],
			[r`$G_{fs}$`, '14 mS min (22 typ)', r`$V_{DS} = 10$ V, $V_{GS} = 0$, $f = 1$ kHz`],
			[r`$G_{fs}$`, '6 mS min (10 typ)', r`$V_{DS} = 15$ V, $I_D = 1$ mA`],
			[r`$C_{iss}$, $C_{rss}$`, '20 pF, 5 pF typ', r`$V_{DS} = 15$ V, $I_D = 100$ µA, $f = 1$ MHz; page 1 says 22 pF max`],
			[r`$I_G$`, '-0.5 nA max', r`$V_{DG} = 10$ V, $I_D = 1$ mA`],
			[r`$V_{GSS}$, $V_{GDS}$`, '40 V max', 'absolute maximum'],
			[r`$P_D$`, '400 mW', '25 °C']
		],
		read: r`The grade letter first: $I_{DSS}$ comes in four bands from 2.6 to 30 mA, and $V_{GS(off)}$ is small, -0.2 to -2 V. Then the noise lines, guaranteed only at $I_D = 2$ mA, and the input capacitance, about 20 pF, high for an audio JFET.`
	},
	'2N5460': {
		id: '2N5460',
		part: '2N5460',
		kind: 'P-channel JFET, general purpose',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/download/data-sheet/pdf/2n5460-d.pdf',
		pinout: { package: 'TO-92', legs: ['S', 'D', 'G'], note: "onsemi's order (Case 29, Style 7). Central Semiconductor's 2N5460 is D S G: drain and source swap, the gate stays at the end" },
		values: [
			[r`$V_{GS(off)}$`, '0.75 to 6.0 V', r`$V_{DS} = 15$ V as printed, $I_D = 1.0$ µA`],
			[r`$I_{DSS}$`, '-1.0 to -5.0 mA', r`$V_{DS} = 15$ V, $V_{GS} = 0$`],
			[r`$V_{GS}$`, '0.5 to 4.0 V', r`$V_{DS} = 15$ V, $I_D = 0.1$ mA`],
			[r`$\lvert y_{fs} \rvert$`, '1.0 to 4.0 mS', r`$V_{DS} = 15$ V, $V_{GS} = 0$, $f = 1$ kHz; printed as 1000 to 4000 µmhos`],
			[r`$C_{iss}$`, '7.0 pF max (5.0 typ)', r`$V_{DS} = 15$ V, $V_{GS} = 0$, $f = 1$ MHz`],
			[r`$C_{rss}$`, '2.0 pF max (1.0 typ)', r`$f = 1$ MHz`],
			[r`$e_n$`, '115 nV/√Hz max (60 typ)', r`$V_{DS} = 15$ V, $V_{GS} = 0$, $f = 100$ Hz, 1 Hz bandwidth`],
			[r`$V_{DG}$, $V_{GSR}$`, '40 V max', 'absolute maximum'],
			[r`$I_{GSS}$`, '5.0 nA max', r`$V_{GS} = 20$ V, $V_{DS} = 0$ (1.0 µA at 100 °C)`],
			[r`$P_D$`, '350 mW', r`$T_A = 25$ °C, derate 2.8 mW/°C`]
		],
		read: r`Signs first: the sheet prints $V_{DS}$ as +15 V but $I_{DSS}$ as negative, so its values read as magnitudes. In the circuit the source sits above the drain, and taking the gate positive of the source turns the part off.`
	},
	J176: {
		id: 'J176',
		part: 'J176',
		kind: 'P-channel JFET, switch',
		maker: 'onsemi',
		package: 'TO-92, leads pre-formed',
		url: 'https://www.onsemi.com/download/data-sheet/pdf/j175-d.pdf',
		pinout: { package: 'TO-92', legs: ['D', 'G', 'S'], note: "gate in the middle, unlike the J111. Pin 1 read at the left as in onsemi's straight Case 135AN (the formed 135AR outline was not checked); the datasheet says source and drain are interchangeable, so only the middle gate matters" },
		values: [
			[r`$V_{GS(off)}$`, '1.0 to 4.0 V', r`$V_{DS} = -15$ V, $I_D = -10$ nA`],
			[r`$I_{DSS}$`, '-2.0 to -25 mA', r`$V_{DS} = -15$ V, $V_{GS} = 0$, pulsed (300 µs)`],
			[r`$r_{DS(on)}$`, '250 Ω max', r`$V_{DS} \le 0.1$ V, $V_{GS} = 0$`],
			[r`$V_{(BR)GSS}$`, '30 V min', r`$I_G = 1.0$ µA, $V_{DS} = 0$`],
			[r`$I_{GSS}$`, '1.0 nA max', r`$V_{GS} = 20$ V, $V_{DS} = 0$`],
			[r`$V_{DG}$, $V_{GS}$`, '-30 V, 30 V max', 'absolute maximum'],
			[r`$I_{GF}$`, '50 mA max', 'gate forward current, absolute maximum'],
			[r`$P_D$, $R_{\theta JA}$`, '350 mW, 357 °C/W', r`TO-92, $T_A = 25$ °C, derate 2.8 mW/°C`]
		],
		read: r`$r_{DS(on)}$ first: 250 Ω max, more than eight times the J111's 30 Ω, so the P-channel switch drops more for the same current. The document is named J175/D but now covers the J176 only.`
	},
	DN2540: {
		id: 'DN2540',
		part: 'DN2540N3',
		kind: 'N-MOSFET, depletion mode',
		maker: 'Microchip (Supertex)',
		package: 'TO-92',
		url: 'https://ww1.microchip.com/downloads/en/DeviceDoc/DN2540%20B060313.pdf',
		pinout: { package: 'TO-92', legs: ['S', 'G', 'D'], note: "flat face toward the viewer, from the numbered pin table of Microchip's newer DS20006717A; the page-1 photo labels are ambiguous" },
		values: [
			[r`$BV_{DSX}$`, '400 V min', r`$V_{GS} = -5.0$ V, $I_D = 100$ µA`],
			[r`$V_{GS(OFF)}$`, '-1.5 to -3.5 V', r`$V_{DS} = 25$ V, $I_D = 10$ µA`],
			[r`$I_{DSS}$`, '150 mA min', r`$V_{GS} = 0$, $V_{DS} = 25$ V`],
			[r`$R_{DS(ON)}$`, '25 Ω max (17 typ)', r`$V_{GS} = 0$, $I_D = 120$ mA`],
			[r`$I_D$`, '120 mA, 500 mA', 'TO-92: continuous, pulsed'],
			[r`$P_D$`, '1.0 W', r`$T_C = 25$ °C, the case, not the air`],
			[r`$\theta_{ja}$`, '132 °C/W typ', 'TO-92'],
			[r`$G_{FS}$`, '325 mS typ', r`$V_{DS} = 10$ V, $I_D = 100$ mA`],
			[r`$C_{ISS}$`, '300 pF max (200 typ)', r`$V_{GS} = -10$ V, $V_{DS} = 25$ V, $f = 1$ MHz`],
			[r`$V_{GS}$`, '±20 V max', 'absolute maximum']
		],
		read: r`$I_{DSS}$ first: at least 150 mA with the gate on the source, so the part conducts with no drive, and 15 V across it would mean over 2 W where 132 °C/W allows about 0.95 W in free air. The 1.0 W rating holds only for a case at 25 °C.`
	},
	BSS139I: {
		id: 'BSS139I',
		part: 'BSS139I',
		kind: 'N-MOSFET, depletion mode',
		maker: 'Infineon',
		package: 'SOT-23',
		url: 'https://www.infineon.com/dgdl/Infineon-BSS139I-DataSheet-v02_01-EN.pdf?fileId=5546d46277921c320177a421f99f1d4f',
		pinout: { package: 'SOT-23', legs: ['G', 'S', 'D'], note: 'pins 1, 2, 3; surface mount only, on an adapter for a breadboard' },
		values: [
			[r`$V_{(BR)DSS}$`, '250 V min', r`$V_{GS} = -3$ V, $I_D = 250$ µA`],
			[r`$V_{GS(th)}$`, '-2.1 to -1.0 V (-1.4 typ)', r`$V_{DS} = 3$ V, $I_D = 56$ µA`],
			[r`$I_{DSS}$`, '30 mA min', r`$V_{GS} = 0$, $V_{DS} = 10$ V`],
			[r`$R_{DS(on)}$`, '30 Ω max (12.5 typ)', r`$V_{GS} = 0$, $I_D = 15$ mA`],
			[r`$R_{DS(on)}$`, '14 Ω max (7.8 typ)', r`$V_{GS} = 10$ V, $I_D = 0.1$ A`],
			[r`$I_D$`, '0.10 A max', r`$T_A = 25$ °C (0.08 A at 70 °C, 0.4 A pulsed)`],
			[r`$g_{fs}$`, '0.060 S min (0.13 typ)', r`$\lvert V_{DS} \rvert > 2 \lvert I_D \rvert R_{DS(on)max}$, $I_D = 0.08$ A`],
			[r`$C_{iss}$`, '60 pF typ', r`$V_{GS} = -3$ V, $V_{DS} = 25$ V, $f = 1$ MHz`],
			[r`$P_{tot}$, $R_{thJA}$`, '0.36 W, 350 K/W', r`$T_A = 25$ °C, minimal footprint`],
			[r`$V_{GS}$`, '±20 V max', 'absolute maximum']
		],
		read: r`The threshold is negative: the part conducts at $V_{GS} = 0$ and needs -2.1 V or lower to turn every one off. It is also ESD class 0, under 250 V human-body model.`
	},
	'2N7000': {
		id: '2N7000',
		part: '2N7000',
		kind: 'N-MOSFET, small signal',
		maker: 'onsemi (Fairchild)',
		package: 'TO-92',
		url: 'https://www.onsemi.com/download/data-sheet/pdf/nds7002a-d.pdf',
		pinout: { package: 'TO-92', legs: ['S', 'G', 'D'], note: 'flat face toward the viewer; the reverse of a BS170' },
		values: [
			[r`$V_{DSS}$`, '60 V max', 'absolute maximum'],
			[r`$I_D$`, '200 mA, 500 mA', 'continuous, pulsed'],
			[r`$V_{GS(th)}$`, '0.8 to 3 V (2.1 typ)', r`$V_{DS} = V_{GS}$, $I_D = 1$ mA`],
			[r`$R_{DS(on)}$`, '5 Ω max (1.2 typ)', r`$V_{GS} = 10$ V, $I_D = 500$ mA (9 Ω max at 125 °C)`],
			[r`$R_{DS(on)}$`, '5.3 Ω max (1.8 typ)', r`$V_{GS} = 4.5$ V, $I_D = 75$ mA`],
			[r`$g_{FS}$`, '100 mS min (320 typ)', r`$V_{DS} = 10$ V, $I_D = 200$ mA`],
			[r`$C_{iss}$, $C_{oss}$, $C_{rss}$`, '50, 25, 5 pF max', r`$V_{DS} = 25$ V, $V_{GS} = 0$, $f = 1$ MHz`],
			[r`$t_{on}$, $t_{off}$`, '10 ns max', r`$V_{DD} = 15$ V, $I_D = 500$ mA, $V_{GS} = 10$ V, $R_L = R_{GEN} = 25$ Ω`],
			[r`$V_{GSS}$`, '±20 V max', 'continuous (±40 V non-repetitive)'],
			[r`$P_D$, $R_{\theta JA}$`, '400 mW, 312.5 °C/W', 'derate 3.2 mW/°C']
		],
		read: r`$R_{DS(on)}$ at the gate voltage of the job: it is guaranteed only at 10 V and 4.5 V, and $V_{GS(th)}$ reaches 3 V, so a 3.3 V logic pin does not turn every part fully on. The threshold row is measured at only 1 mA.`
	},
	BS170: {
		id: 'BS170',
		part: 'BS170',
		kind: 'N-MOSFET, small signal',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/download/data-sheet/pdf/bs170-d.pdf',
		pinout: { package: 'TO-92', legs: ['D', 'G', 'S'], note: 'flat face toward the viewer; the reverse of a 2N7000' },
		values: [
			[r`$V_{DS}$`, '60 V max', 'absolute maximum'],
			[r`$I_D$`, '0.5 A max', 'absolute maximum'],
			[r`$V_{GS(th)}$`, '0.8 to 3.0 V (2.0 typ)', r`$V_{DS} = V_{GS}$, $I_D = 1.0$ mA`],
			[r`$r_{DS(on)}$`, '5.0 Ω max (1.8 typ)', r`$V_{GS} = 10$ V, $I_D = 200$ mA, the only gate voltage given`],
			[r`$g_{fs}$`, '200 mS typ', r`$V_{DS} = 10$ V, $I_D = 250$ mA`],
			[r`$C_{iss}$`, '60 pF max', r`$V_{DS} = 10$ V, $V_{GS} = 0$, $f = 1$ MHz`],
			[r`$t_{on}$, $t_{off}$`, '10 ns max (4.0 typ)', r`$I_D = 0.2$ A, test circuit of Fig. 1`],
			[r`$I_{D(off)}$`, '0.5 µA max', r`$V_{DS} = 25$ V, $V_{GS} = 0$`],
			[r`$V_{GS}$`, '±20 V max', 'continuous (±40 V non-repetitive, 50 µs max)'],
			[r`$P_D$`, '350 mW', r`$T_A = 25$ °C; no thermal resistance given`]
		],
		read: r`The pinout first: placed in a 2N7000's holes, drain and source swap and the body diode conducts. Then $r_{DS(on)}$, given only at $V_{GS} = 10$ V.`
	},
	BSS138: {
		id: 'BSS138',
		part: 'BSS138',
		kind: 'N-MOSFET, logic level',
		maker: 'onsemi',
		package: 'SOT-23',
		url: 'https://www.onsemi.com/pdf/datasheet/bss138-d.pdf',
		pinout: { package: 'SOT-23', legs: ['G', 'S', 'D'], note: 'pins 1, 2, 3; surface mount only, on an adapter for a breadboard' },
		values: [
			[r`$V_{DSS}$`, '50 V max', 'absolute maximum'],
			[r`$I_D$`, '0.22 A, 0.88 A', 'continuous, pulsed'],
			[r`$V_{GS(th)}$`, '0.8 to 1.5 V (1.3 typ)', r`$V_{DS} = V_{GS}$, $I_D = 1$ mA`],
			[r`$R_{DS(on)}$`, '3.5 Ω max (0.7 typ)', r`$V_{GS} = 10$ V, $I_D = 0.22$ A`],
			[r`$R_{DS(on)}$`, '6.0 Ω max (1.0 typ)', r`$V_{GS} = 4.5$ V, $I_D = 0.22$ A`],
			[r`$g_{FS}$`, '0.12 S min (0.5 typ)', r`$V_{DS} = 10$ V, $I_D = 0.22$ A`],
			[r`$C_{iss}$, $C_{oss}$, $C_{rss}$`, '27, 13, 6 pF typ', r`$V_{DS} = 25$ V, $V_{GS} = 0$, $f = 1$ MHz`],
			[r`$Q_g$`, '2.4 nC max (1.7 typ)', r`$V_{DS} = 25$ V, $I_D = 0.22$ A, $V_{GS} = 10$ V`],
			[r`$P_D$, $R_{\theta JA}$`, '0.36 W, 350 °C/W', 'minimum pad'],
			[r`$V_{GSS}$`, '±20 V max', 'absolute maximum']
		],
		read: r`"Logic level" here means $R_{DS(on)}$ is guaranteed at 4.5 V; at 2.5 to 3.3 V there are only typical curves (Fig. 2). The threshold, 1.5 V at most, is measured at 1 mA, far below a working current.`
	},
	BSS84: {
		id: 'BSS84',
		part: 'BSS84',
		kind: 'P-MOSFET, small signal',
		maker: 'onsemi',
		package: 'SOT-23',
		url: 'https://www.onsemi.com/pdf/datasheet/bss84-d.pdf',
		pinout: { package: 'SOT-23', legs: ['G', 'S', 'D'], note: 'pins 1, 2, 3; surface mount only, on an adapter for a breadboard' },
		values: [
			[r`$V_{DSS}$`, '-50 V max', 'absolute maximum'],
			[r`$I_D$`, '-0.13 A, -0.52 A', 'continuous, pulsed'],
			[r`$V_{GS(th)}$`, '-0.8 to -2 V (-1.7 typ)', r`$V_{DS} = V_{GS}$, $I_D = -1$ mA`],
			[r`$R_{DS(on)}$`, '10 Ω max (1.2 typ)', r`$V_{GS} = -5$ V, $I_D = -0.10$ A (17 Ω max at 125 °C)`],
			[r`$g_{FS}$`, '0.05 S min (0.6 typ)', r`$V_{DS} = -25$ V, $I_D = -0.10$ A`],
			[r`$C_{iss}$, $C_{oss}$, $C_{rss}$`, '73, 10, 5 pF typ', r`$V_{DS} = -25$ V, $V_{GS} = 0$, $f = 1$ MHz`],
			[r`$Q_g$`, '1.3 nC max (0.9 typ)', r`$V_{DS} = -25$ V, $I_D = -0.10$ A, $V_{GS} = -5$ V`],
			[r`$V_{SD}$`, '-1.2 V max (-0.8 typ)', r`body diode, $V_{GS} = 0$, $I_S = -0.26$ A`],
			[r`$P_D$, $R_{\theta JA}$`, '0.36 W, 350 °C/W', 'absolute maximum'],
			[r`$V_{GSS}$`, '±20 V max', 'absolute maximum']
		],
		read: r`$R_{DS(on)}$ is given only at $V_{GS} = -5$ V, 10 Ω at most. As a high-side switch the source sits on the positive rail and the gate is pulled below it to turn the part on.`
	},
	BS250P: {
		id: 'BS250P',
		part: 'BS250P',
		kind: 'P-MOSFET, small signal',
		maker: 'Diodes Incorporated (Zetex)',
		package: 'E-Line, TO-92 compatible',
		url: 'https://www.diodes.com/assets/Datasheets/BS250P.pdf',
		pinout: { package: 'TO-92 (E-Line)', legs: ['D', 'G', 'S'], note: 'flat face toward the viewer, like the BS170. Read from an unnumbered sketch, so confirm with the diode test' },
		values: [
			[r`$V_{DS}$`, '-45 V max', 'absolute maximum'],
			[r`$I_D$`, '-230 mA max', 'continuous (-3 A pulsed)'],
			[r`$V_{GS(TH)}$`, '-1 to -3.5 V', r`$I_D = -1$ mA, $V_{DS} = V_{GS}$`],
			[r`$R_{DS(ON)}$`, '14 Ω max', r`$V_{GS} = -10$ V, $I_D = -200$ mA, pulsed`],
			[r`$g_{fs}$`, '150 mS typ', r`$V_{DS} = -10$ V, $I_D = -200$ mA`],
			[r`$C_{iss}$`, '60 pF typ', r`$V_{GS} = 0$, $V_{DS} = -10$ V, $f = 1$ MHz`],
			[r`$t_{(on)}$, $t_{(off)}$`, '20 ns max', r`$V_{DD} \approx -25$ V, $I_D = -500$ mA`],
			[r`$I_{DSS}$`, '-500 nA max', r`$V_{GS} = 0$, $V_{DS} = -25$ V`],
			[r`$V_{GS}$`, '±20 V max', 'absolute maximum'],
			[r`$P_{TOT}$`, '700 mW', r`$T_A = 25$ °C; no thermal resistance given`]
		],
		read: r`$R_{DS(ON)}$ is given only at $V_{GS} = -10$ V and $V_{GS(TH)}$ reaches -3.5 V, so a 5 V gate swing guarantees nothing. The two-page sheet has no graphs, body-diode or gate-charge lines: it refers to the ZVP2106A for curves.`
	},
	CD4007UB: {
		id: 'CD4007UB',
		part: 'CD4007UBE',
		kind: 'CMOS array, 3 P and 3 N MOSFETs',
		maker: 'Texas Instruments',
		package: 'PDIP-14',
		url: 'https://www.ti.com/lit/ds/symlink/cd4007ub.pdf',
		pinout: {
			package: 'PDIP-14',
			text: 'Top view, notch up, pin 1 at top left. P-MOSFETs between pins 14 and 13, 2 and 1, 11 and 12; N-MOSFETs between 8 and 7, 5 and 4, 12 and 9 (pairs 1, 2, 3). Shared gates: pin 6, pin 3, pin 10. Pin 14 is VDD and every P substrate, pin 7 is VSS and every N substrate, so pair 1 has one end on each rail and only pairs 2 and 3 are free. One inverter: 14 to VDD, 7 to VSS, input on 6, output on 13 and 8 tied together.',
			note: 'The terminal diagram calls pins 14 and 11 P drains, yet both go to VDD in the inverter wiring (Fig. 2a): in use, the P source is the end at the higher voltage.'
		},
		values: [
			[r`$V_{DD}$`, '-0.5 to 20 V', 'absolute maximum, referred to VSS'],
			[r`$V_{DD}$`, '3 to 18 V', 'recommended'],
			[r`$I_{OL}$`, '0.51 mA min (1 typ)', r`$V_{DD} = 5$ V, $V_O = 0.4$ V, 25 °C`],
			[r`$I_{OL}$`, '3.4 mA min (6.8 typ)', r`$V_{DD} = 15$ V, $V_O = 1.5$ V, 25 °C`],
			[r`$I_{OH}$`, '-3.4 mA min (-6.8 typ)', r`$V_{DD} = 15$ V, $V_O = 13.5$ V, 25 °C`],
			[r`$V_{IL}$, $V_{IH}$`, '1 V max, 4 V min', r`$V_{DD} = 5$ V (2.5 V and 12.5 V at 15 V)`],
			[r`$I_{DD}$`, '0.25 µA max', r`quiescent, $V_{DD} = 5$ V, 25 °C (5 µA at 20 V)`],
			[r`$t_{PHL}$, $t_{PLH}$`, '110 ns max (55 typ)', r`$V_{DD} = 5$ V, $C_L = 50$ pF (50 ns max at 15 V)`],
			[r`$P_D$`, '100 mW max', 'each output transistor (500 mW for the package)'],
			[r`$I_{IN}$`, '±10 mA max', 'DC, any input']
		],
		read: r`$V_{DD}$ first: 20 V absolute maximum, so the ±15 V lab supply, 30 V across the chip, is too much; +15 V and 0 V, or ±7.5 V, are safe. The sheet gives no threshold voltage: the typical drain-current curves or a measurement stand in for it.`
	},
	IRLZ44N: {
		id: 'IRLZ44N',
		part: 'IRLZ44NPbF',
		kind: 'N-MOSFET, power, logic level',
		maker: 'Infineon (International Rectifier)',
		package: 'TO-220AB',
		url: 'https://www.infineon.com/dgdl/irlz44npbf.pdf?fileId=5546d462533600a40153567217c32725',
		pinout: { package: 'TO-220', legs: ['G', 'D', 'S'], tab: 'D', note: 'printed face toward the viewer, tab behind; the tab is the drain. The IRFZ44N, one letter away, has the same pinout but is not logic level' },
		values: [
			[r`$V_{(BR)DSS}$`, '55 V min', r`$V_{GS} = 0$, $I_D = 250$ µA`],
			[r`$V_{GS}$`, '±16 V max', 'absolute maximum (±20 V on the IRF540N)'],
			[r`$I_D$`, '47 A max', r`$V_{GS} = 10$ V, case held at $T_C = 25$ °C (33 A at $T_C = 100$ °C)`],
			[r`$R_{DS(on)}$`, '22 mΩ max', r`$V_{GS} = 10$ V, $I_D = 25$ A`],
			[r`$R_{DS(on)}$`, '25 mΩ max', r`$V_{GS} = 5.0$ V, $I_D = 25$ A`],
			[r`$R_{DS(on)}$`, '35 mΩ max', r`$V_{GS} = 4.0$ V, $I_D = 21$ A`],
			[r`$V_{GS(th)}$`, '1.0 to 2.0 V', r`$V_{DS} = V_{GS}$, $I_D = 250$ µA`],
			[r`$Q_g$`, '48 nC max', r`$V_{GS} = 5.0$ V, $V_{DS} = 44$ V, $I_D = 25$ A ($Q_{gd}$ 25 nC max)`],
			[r`$E_{AS}$`, '210 mJ max', r`single pulse, $I_{AS} = 25$ A, $L = 470$ µH, $V_{DD} = 25$ V, $R_G = 25$ Ω`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '1.4, 62 °C/W max', r`junction to case, junction to free air; $P_D = 110$ W only at $T_C = 25$ °C`]
		],
		read: r`The three $R_{DS(on)}$ lines first: 25 mΩ at 5.0 V and 35 mΩ at 4.0 V are guaranteed, which is what "logic level" means; below 4 V only the typical curves of Fig. 1 remain, so a 3.3 V pin guarantees nothing. Then $V_{GS}$: ±16 V, not ±20 V, so +15 V is the most a gate driver may apply.`
	},
	IRF540N: {
		id: 'IRF540N',
		part: 'IRF540NPbF',
		kind: 'N-MOSFET, power, standard gate',
		maker: 'Infineon (International Rectifier)',
		package: 'TO-220',
		url: 'https://www.infineon.com/dgdl/irf540npbf.pdf?fileId=5546d462533600a4015355e396cd199f',
		pinout: { package: 'TO-220', legs: ['G', 'D', 'S'], tab: 'D', note: 'printed face toward the viewer, tab behind; the tab is the drain, live, so it needs an insulating pad on a shared heatsink' },
		values: [
			[r`$V_{(BR)DSS}$`, '100 V min', r`$V_{GS} = 0$, $I_D = 250$ µA`],
			[r`$V_{GS}$`, '±20 V max', 'absolute maximum'],
			[r`$I_D$`, '33 A max', r`$V_{GS} = 10$ V, case held at $T_C = 25$ °C (23 A at $T_C = 100$ °C)`],
			[r`$R_{DS(on)}$`, '44 mΩ max', r`$V_{GS} = 10$ V, $I_D = 16$ A; the only gate voltage given, no line at 5 V or 4.5 V`],
			[r`$V_{GS(th)}$`, '2.0 to 4.0 V', r`$V_{DS} = V_{GS}$, $I_D = 250$ µA`],
			[r`$Q_g$`, '71 nC max', r`$V_{GS} = 10$ V, $V_{DS} = 80$ V, $I_D = 16$ A ($Q_{gs}$ 14, $Q_{gd}$ 21 nC max)`],
			[r`$C_{iss}$, $C_{oss}$, $C_{rss}$`, '1960, 250, 40 pF typ', r`$V_{GS} = 0$, $V_{DS} = 25$ V, $f = 1$ MHz`],
			[r`$E_{AS}$`, '185 mJ max', r`single pulse, $I_{AS} = 16$ A, $L = 1.5$ mH, calculated to $T_J = 175$ °C; the 700 mJ beside it is a typical value at destruction, not a rating`],
			[r`$t_{rr}$, $Q_{rr}$`, '170 ns, 760 nC max (115, 505 typ)', r`body diode, $I_F = 16$ A, $di/dt = 100$ A/µs`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '1.15, 62 °C/W max', r`junction to case, junction to free air; $P_D = 130$ W only at $T_C = 25$ °C`]
		],
		read: r`$R_{DS(on)}$ is given at $V_{GS} = 10$ V only, and a part in spec can have $V_{GS(th)} = 4.0$ V, where it passes just 250 µA: from a 5 V or 3.3 V pin nothing is guaranteed. The 33 A also needs a case held at 25 °C; in free air, $(175 - 25) / 62 \approx 2.4$ W is the limit.`
	},
	IRF9540N: {
		id: 'IRF9540N',
		part: 'IRF9540NPbF',
		kind: 'P-MOSFET, power',
		maker: 'Infineon (International Rectifier)',
		package: 'TO-220',
		url: 'https://www.infineon.com/assets/row/public/documents/24/49/infineon-irf9540npbf-datasheet-en.pdf',
		pinout: { package: 'TO-220', legs: ['G', 'D', 'S'], tab: 'D', note: 'printed face toward the viewer, tab behind; the same G D S order as the N-channel IRF540N, and the tab is the drain' },
		values: [
			[r`$V_{(BR)DSS}$`, '-100 V min', r`$V_{GS} = 0$, $I_D = -250$ µA`],
			[r`$V_{GS}$`, '±20 V max', 'absolute maximum'],
			[r`$I_D$`, '-23 A max', r`$V_{GS} = -10$ V, case held at $T_C = 25$ °C (-16 A at $T_C = 100$ °C)`],
			[r`$R_{DS(on)}$`, '0.117 Ω max', r`$V_{GS} = -10$ V, $I_D = -11$ A; the only gate voltage given`],
			[r`$V_{GS(th)}$`, '-2.0 to -4.0 V', r`$V_{DS} = V_{GS}$, $I_D = -250$ µA`],
			[r`$Q_g$`, '97 nC max', r`$V_{GS} = -10$ V, $V_{DS} = -80$ V, $I_D = -11$ A ($Q_{gs}$ 15, $Q_{gd}$ 51 nC max)`],
			[r`$E_{AS}$`, '430 mJ max', r`single pulse, $I_{AS} = -11$ A, $L = 7.1$ mH, $R_G = 25$ Ω`],
			[r`$V_{SD}$`, '-1.6 V max', r`body diode, $I_S = -11$ A, $V_{GS} = 0$`],
			[r`$t_{rr}$, $Q_{rr}$`, '220 ns, 1200 nC max (150, 830 typ)', r`body diode, $I_F = -11$ A, $di/dt = 100$ A/µs`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '1.1, 62 °C/W max', r`junction to case, junction to free air; $P_D = 140$ W only at $T_C = 25$ °C`]
		],
		read: r`Every line is negative: the gate goes about 10 V below the source to turn the part on, and $R_{DS(on)}$ is guaranteed only at -10 V. On a +15 V high side a gate pulled to 0 V sees -15 V, inside the ±20 V rating; the 0.117 Ω is about 2.7 times the 44 mΩ of the N-channel IRF540N.`
	},
	IKW40N120H3: {
		id: 'IKW40N120H3',
		part: 'IKW40N120H3',
		kind: 'IGBT, 1200 V, with anti-parallel diode',
		maker: 'Infineon',
		package: 'TO-247-3',
		url: 'https://www.infineon.com/dgdl/Infineon-IKW40N120H3-DS-v02_01-EN.pdf',
		pinout: { package: 'TO-247', legs: ['G', 'C', 'E'], tab: 'C', note: 'printed face toward the viewer, tab behind, as the page-1 picture labels the legs; the pin definition makes pin C and the back the collector' },
		values: [
			[r`$V_{CE}$`, '1200 V max', 'absolute maximum'],
			[r`$I_C$`, '80 A, 40 A max', r`case held at $T_C = 25$ °C, at $T_C = 100$ °C`],
			[r`$V_{CE(sat)}$`, '2.40 V max (2.05 typ)', r`$V_{GE} = 15$ V, $I_C = 40$ A, $T_{vj} = 25$ °C (2.50 V typ at 125 °C, 2.70 V at 175 °C)`],
			[r`$V_{GE(th)}$`, '5.0 to 6.5 V (5.8 typ)', r`$V_{CE} = V_{GE}$, $I_C = 1$ mA`],
			[r`$V_{GE}$`, '±20 V max', r`absolute maximum (±30 V transient, $t_p \le 10$ µs, $D < 0.01$)`],
			[r`$Q_G$`, '185 nC typ', r`$V_{CC} = 960$ V, $I_C = 40$ A, $V_{GE} = 15$ V`],
			[r`$E_{off}$, $t_f$`, '1.20 mJ, 16 ns typ', r`$V_{CC} = 600$ V, $I_C = 40$ A, $V_{GE} = 0/15$ V, $R_G = 12$ Ω, 25 °C ($E_{off}$ 2.60 mJ at 175 °C)`],
			[r`$E_{ts}$`, '4.40 mJ typ', 'same test, 25 °C, tail and diode recovery included (7.00 mJ at 175 °C)'],
			[r`$t_{SC}$`, '10 µs', r`short circuit, $V_{GE} = 15$ V, $V_{CC} \le 600$ V, $T_{vj} = 175$ °C`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '0.31 (diode 1.11), 40 °C/W max', 'junction to case, junction to free air']
		],
		read: r`$V_{CE(sat)}$ at the working current and a hot junction, then the energies: the 16 ns fall time hides the tail, which $E_{off}$ includes and which more than doubles from 25 to 175 °C. The threshold alone reaches 6.5 V, so the gate needs a 15 V driver, and the 10 µs short-circuit time is the budget for its protection.`
	},
	FGH40N60SMD: {
		id: 'FGH40N60SMD',
		part: 'FGH40N60SMD',
		kind: 'IGBT, 600 V, with co-packed diode',
		maker: 'onsemi (Fairchild)',
		package: 'TO-247-3LD',
		url: 'https://www.onsemi.com/download/data-sheet/pdf/fgh40n60smd-d.pdf',
		pinout: { package: 'TO-247', legs: ['G', 'C', 'E'], tab: 'C', note: 'printed face toward the viewer, tab behind; the tab is the collector. The page-1 picture labels the legs E, C, G because it shows the part lying face up with its legs pointing away; stood legs down, face toward the viewer, the order is G C E. No table on the sheet names the numbered legs.' },
		values: [
			[r`$V_{CES}$`, '600 V max', 'absolute maximum'],
			[r`$V_{GES}$`, '±20 V max', 'absolute maximum (±30 V transient)'],
			[r`$I_C$`, '80 A, 40 A max', r`case held at $T_C = 25$ °C, at $T_C = 100$ °C`],
			[r`$V_{CE(sat)}$`, '2.5 V max (1.9 typ)', r`$I_C = 40$ A, $V_{GE} = 15$ V (2.1 V typ at $T_C = 175$ °C)`],
			[r`$V_{GE(th)}$`, '3.5 to 6.0 V (4.5 typ)', r`$V_{CE} = V_{GE}$, $I_C = 250$ µA`],
			[r`$E_{on}$, $E_{off}$`, '1.30, 0.34 mJ max (0.87, 0.26 typ)', r`$V_{CC} = 400$ V, $I_C = 40$ A, $V_{GE} = 15$ V, $R_G = 6$ Ω, inductive, $T_C = 25$ °C ($E_{off}$ 0.60 mJ typ at 175 °C)`],
			[r`$Q_g$`, '180 nC max (119 typ)', r`$V_{CE} = 400$ V, $I_C = 40$ A, $V_{GE} = 15$ V`],
			[r`$V_{FM}$`, '2.8 V max (2.3 typ)', r`diode, $I_F = 20$ A, $T_C = 25$ °C`],
			[r`$t_{rr}$, $Q_{rr}$`, '36 ns, 46.8 nC typ', r`diode, $I_F = 20$ A, $dI_F/dt = 200$ A/µs, 25 °C (110 ns, 445 nC at 175 °C)`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '0.43 (diode 1.5), 40 °C/W max', 'junction to case, junction to free air']
		],
		read: r`No $R_{DS(on)}$: the on-state line is $V_{CE(sat)}$, 1.9 V typical at 40 A, and switching is given as energies, with the tail inside $E_{off}$, which more than doubles from 25 to 175 °C. $V_{GE(th)}$ reaches 6 V, so the gate needs a 15 V driver, never a logic pin.`
	},
	EPC2045: {
		id: 'EPC2045',
		part: 'EPC2045',
		kind: 'GaN HEMT, enhancement mode',
		maker: 'EPC (Efficient Power Conversion)',
		package: 'bumped die, 2.5 × 1.5 mm',
		url: 'https://epc-co.com/epc/Portals/0/epc/documents/datasheets/EPC2045_datasheet.pdf',
		pinout: {
			package: 'Bumped die',
			text: 'A bare die, 2.5 by 1.5 mm, with 15 solder bumps underneath in five columns of three. From the gate end: a column with the gate bump (bump 1, under the corner marked by the dot on top) and two source bumps, then a drain column, a source column, a drain column and a source column. The top of the die is connected to the source.',
			note: 'Not a breadboard part: it is soldered to a printed board next to its driver, or used on an EPC development board.'
		},
		values: [
			[r`$V_{DS}$`, '100 V max', 'continuous (120 V for up to 10,000 pulses of 5 ms at 150 °C)'],
			[r`$V_{GS}$`, '+6 V, -4 V max', 'absolute maximum; drive is 5 V on, 0 V off'],
			[r`$I_D$`, '16 A max', r`continuous, $T_A = 25$ °C (130 A pulsed, 300 µs)`],
			[r`$R_{DS(on)}$`, '7 mΩ max (5.6 typ)', r`$V_{GS} = 5$ V, $I_D = 16$ A`],
			[r`$V_{GS(th)}$`, '0.8 to 2.5 V (1.4 typ)', r`$V_{DS} = V_{GS}$, $I_D = 5$ mA`],
			[r`$I_{GSS}$`, '1.3 mA max (0.01 typ)', r`$V_{GS} = 5$ V (5 mA max at $T_J = 125$ °C)`],
			[r`$Q_G$`, '7.8 nC max (6 typ)', r`$V_{DS} = 50$ V, $V_{GS} = 5$ V, $I_D = 16$ A ($Q_{GD}$ 0.8 nC typ)`],
			[r`$C_{ISS}$, $C_{OSS}$, $C_{RSS}$`, '767, 295, 3 pF typ', r`$V_{DS} = 50$ V, $V_{GS} = 0$`],
			[r`$V_{SD}$`, '1.7 V typ', r`reverse conduction, $I_S = 0.5$ A, $V_{GS} = 0$; no PN diode, $Q_{RR} = 0$`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '1.4, 64 °C/W typ', r`$R_{\theta JA}$ on one square inch of 2 oz copper on FR4`]
		],
		read: r`The gate limit first: +6 V absolute maximum against a 5 V drive, so a 10 to 15 V MOSFET driver destroys it and ringing on the 5 V edge must stay below 6 V. The part has no avalanche rating, only the 120 V pulse allowance, and its gate draws current, up to 1.3 mA at 5 V, where a silicon gate draws nA.`
	},
	C3M0065090D: {
		id: 'C3M0065090D',
		part: 'C3M0065090D',
		kind: 'SiC N-MOSFET, 900 V',
		maker: 'Wolfspeed',
		package: 'TO-247-3',
		url: 'https://assets.wolfspeed.com/uploads/2024/01/Wolfspeed_C3M0065090D_data_sheet.pdf',
		pinout: { package: 'TO-247', legs: ['G', 'D', 'S'], tab: 'D', note: 'printed face toward the viewer, tab behind; from the pin table of the outline page: 1 gate, 2 drain, 3 source, 4 (the back) drain' },
		values: [
			[r`$V_{DS}$`, '900 V max', r`$T_C = 25$ °C`],
			[r`$V_{GS(max)}$`, '-8 V, +19 V', 'transient limits; operate at -4 V off and 15 V on (15 V ±5 % recommended)'],
			[r`$I_D$`, '36 A, 23 A max', r`$V_{GS} = 15$ V, case held at $T_C = 25$ °C, at 100 °C`],
			[r`$R_{DS(on)}$`, '78 mΩ max (65 typ)', r`$V_{GS} = 15$ V, $I_D = 20$ A (90 mΩ typ at $T_J = 150$ °C)`],
			[r`$V_{GS(th)}$`, '1.8 to 3.5 V (2.1 typ)', r`$V_{DS} = V_{GS}$, $I_D = 5$ mA (1.6 V typ at 150 °C)`],
			[r`$Q_g$`, '33 nC typ', r`$V_{DS} = 400$ V, $V_{GS} = -4/15$ V, $I_D = 20$ A ($Q_{gd}$ 12 nC)`],
			[r`$E_{on}$, $E_{off}$`, '250, 48 µJ typ', r`$V_{DS} = 400$ V, $I_D = 20$ A, $R_{G(ext)} = 2.5$ Ω, $T_J = 150$ °C`],
			[r`$V_{SD}$`, '4.4 V typ', r`body diode, $V_{GS} = -4$ V, $I_{SD} = 10$ A`],
			[r`$E_{AS}$`, '110 mJ max', r`single pulse, $I_D = 22$ A, $V_{DD} = 50$ V`],
			[r`$R_{\theta JC}$, $R_{\theta JA}$`, '1.0, 40 °C/W max', r`junction to case, junction to free air; $T_J$ 150 °C max`]
		],
		read: r`The gate lines first: the part runs at -4 V off and 15 V on within transient limits of -8 and +19 V, so a ±15 V supply breaks the -8 V limit, and a 10 V silicon driver under-drives it ($R_{DS(on)}$ rises once the gate falls to 11 to 13 V, Fig. 6). Then the body diode: 4.4 V, against 1.2 V at most for the silicon IRF540N.`
	},
	'2N2646': {
		id: '2N2646',
		part: '2N2646',
		kind: 'UJT, unijunction',
		maker: 'Digitron Semiconductors',
		package: 'TO-18 metal can',
		url: 'https://digitroncorp.com/getmedia/02B5A3A9-5151-49EB-B9C2-A883A4D3EF4C/2N2646-2c-2N2647.aspx?ext=.pdf',
		pinout: {
			package: 'TO-18',
			text: 'Three leads and a tab, no flat face. The emitter is the middle lead, 90° from both bases, beside the tab; base 2 is the other lead beside the tab; base 1 sits opposite base 2, farthest from the tab. Legs down, turned so that B2 and B1 stand side by side across the view with the tab on the left, the legs read B2, E, B1, with E slightly in front of or behind the other two.',
			note: "Digitron's drawing says neither top nor bottom view, so this uses only which leads sit by the tab, which holds either way. A meter confirms it: E to each base reads as a diode, B1 to B2 reads 4.7 to 9.1 kΩ both ways. COMSET's sheet ties the can to base 2."
		},
		values: [
			[r`$\eta$`, '0.56 to 0.75', r`$V_{B2B1} = 10$ V; $\eta = (V_P - V_F) / V_{B2B1}$, $V_F \approx 0.45$ V at 10 µA (2N2647: 0.68 to 0.82)`],
			[r`$r_{BB}$`, '4.7 to 9.1 kΩ (7 typ)', r`$V_{B2B1} = 3$ V, $I_E = 0$`],
			[r`$I_P$`, '5 µA max (1 typ)', r`$V_{B2B1} = 25$ V`],
			[r`$I_V$`, '4 mA min (6 typ)', r`$V_{B2B1} = 20$ V, $R_{B2} = 100$ Ω, pulsed`],
			[r`$I_{EB2O}$`, '12 µA max (0.005 typ)', r`$V_{B2E} = 30$ V, $I_{B1} = 0$`],
			[r`$V_{OB1}$`, '3 V min (5 typ)', 'base-one peak pulse, test circuit of Fig. 3'],
			[r`$V_{B2B1}$`, '35 V max', 'interbase, absolute maximum'],
			[r`$V_{B2E}$`, '30 V max', 'emitter reverse, absolute maximum'],
			[r`$I_E$`, '50 mA RMS, 2 A peak', 'peak from a capacitor of 10 µF or less charged to 30 V or less'],
			[r`$P_D$`, '300 mW', 'derate 3 mW/°C']
		],
		read: r`$\eta$ and its spread first: 0.56 to 0.75 moves the firing point and spreads the period of an oscillator 1.7 to 1. The sheet gives no valley voltage, and $I_P$ and $I_V$ are measured at 25 V and 20 V, not at the supply of the circuit.`
	},
	'2N6027': {
		id: '2N6027',
		part: '2N6027',
		kind: 'PUT, programmable unijunction',
		maker: 'onsemi',
		package: 'TO-92',
		url: 'https://www.onsemi.com/download/data-sheet/pdf/2n6027-d.pdf',
		pinout: { package: 'TO-92', legs: ['A', 'G', 'K'], note: 'flat face toward the viewer, pins 1, 2, 3 (Case 029, Style 16); the reverse of an SCR such as the 2N5060, which reads K G A' },
		values: [
			[r`$I_P$`, '2.0 µA max (1.25 typ)', r`$V_S = 10$ V, $R_G = 1$ MΩ`],
			[r`$I_P$`, '5.0 µA max (4.0 typ)', r`$V_S = 10$ V, $R_G = 10$ kΩ`],
			[r`$V_T$`, '0.2 to 1.6 V (0.70 typ)', r`$V_S = 10$ V, $R_G = 1$ MΩ; $V_T = V_P - V_S$`],
			[r`$V_T$`, '0.2 to 0.6 V (0.35 typ)', r`$V_S = 10$ V, $R_G = 10$ kΩ`],
			[r`$I_V$`, '50 µA max (18 typ)', r`$V_S = 10$ V, $R_G = 1$ MΩ; no minimum given`],
			[r`$I_V$`, '70 µA min (150 typ)', r`$V_S = 10$ V, $R_G = 10$ kΩ (1.5 mA min at 200 Ω)`],
			[r`$V_F$`, '1.5 V max (0.8 typ)', r`$I_F = 50$ mA peak, pulsed`],
			[r`$V_{AK}$, $V_{GKR}$`, '±40 V, -5 V max', 'absolute maximum'],
			[r`$E$`, '250 µJ max', r`capacitor discharge energy, $0.5\,C V^2$`],
			[r`$P_F$, $R_{\theta JA}$`, '300 mW, 200 °C/W', 'derate 4.0 mW/°C']
		],
		read: r`Every line depends on $R_G$, the resistance of the gate divider seen from the gate: $I_V$ is guaranteed, 70 µA at least, only at $R_G = 10$ kΩ, and at 1 MΩ it has no minimum. Then the 250 µJ limit: 10 µF charged to 15 V holds 1.1 mJ, so the capacitor or its series resistor is sized against it.`
	}
};

function r(strings, ...values) {
	return String.raw(strings, ...values);
}
