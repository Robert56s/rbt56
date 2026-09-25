/**
 * The op-amps an LTspice export can use.
 *
 * 'ideal' is the single-pole model the tools design against, drawn with
 * LTspice's three-pin Opamps\opamp symbol (its opamp.sub ships with
 * LTspice): open-loop gain Aol, one pole, gain-bandwidth GBW, no supply
 * pins and no output limit.
 *
 * The real parts are drawn with Opamps\opamp2, whose five pins show the
 * supplies, and powered from two rails, +15 V on the net v++ and -15 V on
 * v--. Their subcircuit is written into the file (as a directive in the
 * .asc, as text in the .cir), so a download runs as it is, with no
 * library to install. Both subcircuits take their nodes in the order
 * opamp2 numbers its pins: non-inverting input, inverting input, V+, V-,
 * output.
 *
 *   TL082  Texas Instruments' macromodel, as distributed (PARTS release
 *          4.01, 1989). In LTspice: 3.07 MHz unity gain, 107 dB, 12.8 V/us,
 *          +/-13.5 V into 10 k.
 *   LM741  a Boyle macromodel built here from the typical figures of TI's
 *          LM741 datasheet (SNOSC25D, 6.5, +/-15 V, 25 C) with the standard
 *          design equations: tail current = slew rate x C2 (0.5 V/us x
 *          30 pF), beta = collector current / bias current (7.5 uA / 80 nA),
 *          GA = 2 pi GBW C2 (1 MHz), RE from the pair's transconductance,
 *          C1 for 60 degrees of phase margin, FB for 200 V/mV, GCM for a
 *          95 dB CMRR, the clamps for +/-14 V and 25 mA, RP for 1.7 mA of
 *          supply current. In LTspice: 105.9 dB, 0.50 V/us, 0.29 us rise
 *          time, 4.9 % overshoot, +/-14.0 V into 10 k, 25.6 mA short circuit,
 *          1.70 mA supply current, all on the datasheet's typical values.
 */

export const RAIL_VOLTS = 15;
export const RAIL_POS = 'v++';
export const RAIL_NEG = 'v--';

const TL082 = `* TL082 OPERATIONAL AMPLIFIER "MACROMODEL" SUBCIRCUIT (Texas Instruments)
* CREATED USING PARTS RELEASE 4.01 ON 06/16/89 AT 13:08
* nodes: non-inverting input, inverting input, V+, V-, output
.SUBCKT TL082    1 2 3 4 5
  C1   11 12 3.498E-12
  C2    6  7 15.00E-12
  DC    5 53 DX
  DE   54  5 DX
  DLP  90 91 DX
  DLN  92 90 DX
  DP    4  3 DX
  EGND 99  0 POLY(2) (3,0) (4,0) 0 .5 .5
  FB    7 99 POLY(5) VB VC VE VLP VLN 0 4.715E6 -5E6 5E6 5E6 -5E6
  GA    6  0 11 12 282.8E-6
  GCM   0  6 10 99 8.942E-9
  ISS   3 10 DC 195.0E-6
  HLIM 90  0 VLIM 1K
  J1   11  2 10 JX
  J2   12  1 10 JX
  R2    6  9 100.0E3
  RD1   4 11 3.536E3
  RD2   4 12 3.536E3
  RO1   8  5 150
  RO2   7 99 150
  RP    3  4 2.143E3
  RSS  10 99 1.026E6
  VB    9  0 DC 0
  VC    3 53 DC 2.200
  VE   54  4 DC 2.200
  VLIM  7  8 DC 0
  VLP  91  0 DC 25
  VLN   0 92 DC 25
.MODEL DX D(IS=800.0E-18)
.MODEL JX PJF(IS=15.00E-12 BETA=270.1E-6 VTO=-1)
.ENDS`;

const LM741 = `* LM741 OPERATIONAL AMPLIFIER, Boyle macromodel built by rbt56.com from the
* typical figures of TI's LM741 datasheet (SNOSC25D): 200 V/mV, 1 MHz,
* 0.5 V/us, 80 nA bias, 95 dB CMRR, +/-14 V into 10 k, 25 mA, 1.7 mA
* nodes: non-inverting input, inverting input, V+, V-, output
.SUBCKT LM741    1 2 3 4 5
  C1   11 12 8.661E-12
  C2    6  7 30.00E-12
  DC    5 53 DX
  DE   54  5 DX
  DLP  90 91 DX
  DLN  92 90 DX
  DP    4  3 DX
  EGND 99  0 POLY(2) (3,0) (4,0) 0 .5 .5
  FB    7 99 POLY(5) VB VC VE VLP VLN 0 10.61E6 -10E6 10E6 10E6 -10E6
  GA    6  0 11 12 188.5E-6
  GCM   0  6 10 99 3.352E-9
  IEE  10  4 DC 15.00E-6
  HLIM 90  0 VLIM 1K
  Q1   11  2 13 QX
  Q2   12  1 14 QX
  R2    6  9 100.0E3
  RC1   3 11 5.305E3
  RC2   3 12 5.305E3
  RE1  13 10 1.802E3
  RE2  14 10 1.802E3
  REE  10 99 13.33E6
  RO1   8  5 50
  RO2   7 99 100
  RP    3  4 17.80E3
  VB    9  0 DC 0
  VC    3 53 DC 1.6
  VE   54  4 DC 1.6
  VLIM  7  8 DC 0
  VLP  91  0 DC 25
  VLN   0 92 DC 25
.MODEL DX D(IS=800.0E-18)
.MODEL QX NPN(IS=800.0E-18 BF=93.75)
.ENDS`;

export const OPAMP_MODELS = {
	ideal: { id: 'ideal', label: 'Ideal, one pole (the model the page designs with)', real: false },
	TL082: { id: 'TL082', label: 'TL082 (TI model), on +15 V / -15 V', real: true, part: "TI's TL082 model", note: '* TL082: Texas Instruments macromodel. Pins: +in, -in, V+, V-, out', subckt: TL082 },
	LM741: { id: 'LM741', label: 'LM741, on +15 V / -15 V', real: true, part: 'an LM741 model', note: '* LM741: Boyle macromodel from the TI datasheet figures. Pins: +in, -in, V+, V-, out', subckt: LM741 }
};

/** What the pages offer first: the usual lab part, on the usual rails. */
export const DEFAULT_OPAMP = 'TL082';

export function opampModel(id) {
	return OPAMP_MODELS[id] ?? OPAMP_MODELS.ideal;
}

/**
 * The two rail sources a circuit with real op-amps needs, as elements:
 * +15 V on v++ and -15 V on v--, both from ground.
 */
export function supplyElements(id) {
	if (!opampModel(id).real) return [];
	return [
		{ kind: 'LABEL', text: `op-amp supplies: +${RAIL_VOLTS} V on ${RAIL_POS}, -${RAIL_VOLTS} V on ${RAIL_NEG}` },
		{ kind: 'V', name: 'VPOS', nodes: [RAIL_POS, '0'], spice: `${RAIL_VOLTS}` },
		{ kind: 'V', name: 'VNEG', nodes: [RAIL_NEG, '0'], spice: `-${RAIL_VOLTS}` }
	];
}

/** The subcircuit for a directive on a drawn sheet: one line saying what it is, then its lines without comments. */
export function subcktDirective(id) {
	const m = opampModel(id);
	if (!m.real) return [];
	return [m.note, ...m.subckt.split('\n').filter((l) => !l.startsWith('*'))];
}

/** How a note describes the op-amps a file uses. */
export function opampPhrase(id, gbw = null) {
	const m = opampModel(id);
	if (m.real) return `${m.part} on +${RAIL_VOLTS} V and -${RAIL_VOLTS} V rails`;
	return gbw ? `a single-pole op-amp with a ${gbw}Hz gain-bandwidth` : 'a single-pole op-amp';
}
