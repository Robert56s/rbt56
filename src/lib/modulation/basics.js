/**
 * The AM tool in plain words, for a reader who has not met the
 * vocabulary yet. Follows the mode (JFET modulator, diode and tank
 * modulator, demodulator) and, for the JFET modulator, the cell and the
 * carrier source chosen.
 */

const h = (text) => ({ h: text });
const p = (text) => ({ p: text });
const terms = (list) => ({ terms: list });

const AM_INTRO = [
	h('What amplitude modulation is'),
	p(
		'A sound signal has frequencies far too low to send through the air or to keep apart from other signals. So it is carried on a much faster wave, the carrier, whose size is made to rise and fall with the sound: loud moments make the carrier taller, quiet ones make it shorter. Draw a line along the tops of the carrier and the shape of the sound reappears; that line is the envelope. Making the envelope follow the sound is modulation; recovering the sound from the envelope is demodulation.'
	)
];

const AM_TERMS = [
	['carrier', 'the fast wave that does the carrying; here around 55 kHz, above what the ear hears'],
	['message', 'the slow signal to be carried, here audio'],
	['envelope', 'the outline drawn along the peaks of the carrier; it is the message in disguise'],
	['modulation index (n)', 'how deep the envelope dips: 0 is no modulation, 1 is the deepest that can still be recovered cleanly, above 1 the message is mangled'],
	['sidebands', 'the two new frequencies just above and below the carrier that the message creates; they are where the message really travels'],
	['op-amp', 'the amplifier chip the circuits are built around'],
	['LTspice', 'a free program that simulates circuits; the download opens straight in it']
];

function jfetBasics({ topology, carrierFrom, design }) {
	const blocks = [
		...AM_INTRO,
		h('This circuit: a transistor used as a volume knob'),
		p(
			'A JFET is a transistor that behaves like a resistor whose value is set by the voltage on its gate. Put that resistor where it decides how much an amplifier amplifies, feed the carrier into the amplifier and the message into the gate, and the carrier comes out with its size following the message. The message never passes through the amplifier as sound; it only turns the knob.'
		),
		p(
			'The gate needs the message in a particular form: sitting on a steady negative voltage, and neither too large nor too small. The first block on the page, the gate-drive summer, does exactly that with one amplifier chip: it scales the message, adds the negative offset from the supply, and blocks any offset the source might carry.'
		)
	];
	if (topology === 'inverting') {
		blocks.push(
			h('The inverting cell'),
			p(
				'Here the transistor is the input resistor of an amplifier that flips the signal. The amplifier\'s output then equals the carrier divided by the transistor\'s resistance, times a fixed resistor, so the depth of the modulation is set by how far the transistor swings and nothing else; the amplifier\'s own gain only sets the size. A follower in front of the transistor drives it from almost no resistance, which keeps the crests of the envelope from being squashed, and a small extra stage brings the result up to a comfortable level.'
			)
		);
	} else {
		blocks.push(
			h('The non-inverting cell'),
			p(
				'Here the transistor is the lower half of the divider that sets the amplifier\'s gain, and the carrier goes into the amplifier\'s + input. One chip does the whole job. The trade is that the gain now sits on top of a fixed 1, which dilutes the modulation depth, so the tool makes the amplifier work harder to reach the depth asked for, and it checks that the chip is fast enough to keep up at the carrier frequency.'
			)
		);
	}
	blocks.push(
		h(carrierFrom === 'wien' ? 'Where the carrier comes from: an oscillator on the board' : 'Where the carrier comes from: a generator'),
		p(
			carrierFrom === 'wien'
				? 'The carrier is made on the same board by a Wien bridge oscillator, a small self-feeding loop that runs at one frequency by itself. The tool designs it for this carrier frequency and this amplifier chip, and a divider brings its output down to the small size the transistor can take without misbehaving.'
				: 'The carrier comes from an external signal generator (or a sound card, for a slower test). A divider brings it down to the small size the transistor can take without misbehaving: the transistor only behaves as a plain resistor while the voltage across it stays small.'
		)
	);
	if (design) {
		blocks.push(
			h('What the numbers on the page mean'),
			p(
				`The design aims for a modulation index of ${design.modulationIndex.toFixed(2)}. The amplifier chip loses a little at the crests because it is not infinitely fast, and the transistor adds a small steady lift to every peak, so the envelope measured on a scope reads about ${design.opamp.peakModulationIndex.toFixed(2)}. The audio distortion figure says how far the envelope's shape strays from the message: below one percent is clean.`
			)
		);
	}
	blocks.push(h('Words used on this page'), terms([...AM_TERMS, ['JFET', 'the transistor used as a voltage-controlled resistor; V_P and I_DSS are the two numbers that describe one'], ['gate', 'the terminal that sets the transistor\'s resistance'], ['virtual ground', 'an amplifier input that the amplifier holds at zero volts without it being connected to ground']]));
	return blocks;
}

function diodeBasics() {
	return [
		...AM_INTRO,
		h('This circuit: a diode and a tuned circuit'),
		p(
			'The message and the carrier are added together and pushed through a diode, which only lets current through one way and bends what it lets through. That bending mixes the two signals: among what comes out are the carrier with sidebands on either side, exactly the modulated signal wanted, but also the original message, the carrier\'s harmonics and other products that are not wanted. A tuned circuit, a coil and a capacitor that resonate at the carrier frequency, then rings only with the wanted part and lets the rest fall away.'
		),
		p(
			'It is the oldest way to modulate and needs no amplifier, but it depends on a real coil, which is why the project notes on this page steer towards the JFET modulator when coils are not allowed.'
		),
		h('Words used on this page'),
		terms([...AM_TERMS, ['tank', 'the coil-and-capacitor pair that resonates at one frequency'], ['Q', 'how sharply the tank resonates: higher Q rings longer and selects more narrowly'], ['harmonics', 'copies of a signal at two, three, four times its frequency, created whenever a signal is bent']])
	];
}

function demodBasics({ rectifierType }) {
	return [
		...AM_INTRO,
		h('This circuit: getting the message back'),
		p(
			`To recover the message, the negative half of the modulated wave is ${rectifierType === 'full' ? 'flipped upward (full-wave rectification), so every crest of the carrier, top and bottom, points the same way' : 'thrown away (half-wave rectification), so only the top crests remain'}. What is left is a train of bumps whose heights follow the envelope, which is the message plus a fast ripple at the carrier's rate. A low-pass filter then smooths the ripple away and the message is back.`
		),
		p(
			'A plain diode would lose the first fraction of a volt of every crest and mangle small signals. The rectifier here puts the diodes inside an amplifier\'s feedback so that the amplifier corrects for their drop: a precision rectifier. The filter after it is designed with the same method as the Active Filter Design tool, with the message frequencies as the passband and the carrier ripple as the stopband.'
		),
		h('Words used on this page'),
		terms([...AM_TERMS, ['rectifier', 'a circuit that makes a wave all positive, by flipping or removing its negative half'], ['ripple', 'the fast leftover wobble at the carrier\'s rate after rectifying'], ['low-pass filter', 'a circuit that lets slow signals through and turns fast ones down']])
	];
}

export function modulationBasics({ mode, topology, carrierFrom, design, rectifierType }) {
	if (mode === 'diode') return diodeBasics();
	if (mode === 'demod') return demodBasics({ rectifierType });
	return jfetBasics({ topology, carrierFrom, design });
}
