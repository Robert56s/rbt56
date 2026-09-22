/**
 * The filter tool in plain words, for a reader who has not met the
 * vocabulary yet. Follows the filter type, the response and the
 * circuit chosen.
 *   filterType   'lowpass' | 'highpass' | 'bandpass' | 'bandstop'
 *   response     'butterworth' | 'chebyshev'
 *   topology     'mfb' | 'sallenkey'
 */

const h = (text) => ({ h: text });
const p = (text) => ({ p: text });
const terms = (list) => ({ terms: list });

const TYPE = {
	lowpass: [
		h('This filter: low-pass'),
		p(
			'It lets the low notes through and turns the high ones down. Everything below the first frequency entered (the passband edge) comes out almost untouched; everything above the second one (the stopband edge) comes out much quieter; in between, the volume slides from one to the other. A low-pass is what removes hiss, or what picks the slow message out of a fast carrier in a radio.'
		)
	],
	highpass: [
		h('This filter: high-pass'),
		p(
			'The mirror image: the high frequencies pass and the low ones are turned down. Everything above the passband edge comes out almost untouched, everything below the stopband edge comes out much quieter. A high-pass is what removes hum and rumble, or blocks a steady offset while letting the signal through.'
		)
	],
	bandpass: [
		h('This filter: band-pass'),
		p(
			'Only a window of frequencies gets through: below the lower edge and above the upper edge the signal is turned down, in between it passes. Inside, the tool builds it as a high-pass followed by a low-pass, each doing half the job. A band-pass is what picks one radio station out of all the others.'
		)
	],
	bandstop: [
		h('This filter: band-stop'),
		p(
			'The opposite of a band-pass: one window of frequencies is turned down and everything outside it passes. Inside, the tool builds it as a low-pass and a high-pass working side by side, added together. A band-stop is what removes one unwanted tone, such as mains hum, from an otherwise good signal.'
		)
	]
};

const RESPONSE = {
	butterworth: [
		h('The shape of the response: Butterworth'),
		p(
			'A filter cannot go from "pass" to "stop" instantly; it slides. Butterworth is the shape that stays as flat as possible in the passband: no bumps, so a signal inside the band keeps its balance between frequencies. The price is a gentler slide, which needs more stages for the same job.'
		)
	],
	chebyshev: [
		h('The shape of the response: Chebyshev'),
		p(
			'Chebyshev trades a small ripple in the passband, a wobble of at most the number of decibels entered as Amax, for a much steeper slide into the stopband. Fewer stages do the same job, at the cost of that ripple and of a slightly less even response to sharp edges in the signal.'
		)
	]
};

const TOPOLOGY = {
	mfb: [
		h('The circuit for each stage: multiple feedback'),
		p(
			'Each stage is one amplifier chip with two capacitors and three resistors wrapped around it so that the output feeds back to the input through more than one path. It flips the signal upside down on the way (which does not matter for a filter), and it is the more robust of the two circuits when the filter is sharp: its behaviour depends less on the amplifier being perfect.'
		)
	],
	sallenkey: [
		h('The circuit for each stage: Sallen-Key'),
		p(
			'Each stage is one amplifier chip used as a follower (its output copies its input) with two resistors and two capacitors in front of it. It keeps the signal the right way up and is the easiest of the two to understand and to tune, at the cost of being a little more sensitive to the amplifier and to part values when the filter is sharp.'
		)
	]
};

export function filterBasics({ filterType, response, topology, order, stages }) {
	const blocks = [
		h('What this tool makes'),
		p(
			'A circuit that lets some frequencies of a signal through and turns the others down: a filter. "Active" means it is built around a small amplifier chip rather than from coils, which are bulky, expensive and hard to make accurate at audio frequencies. Enter which frequencies should pass, which should be blocked, and how strictly, and the tool works out how many stages are needed, the value of every resistor and capacitor, from the values actually in stock, and draws the circuit.'
		),
		...TYPE[filterType],
		...RESPONSE[response],
		h('Stages and order'),
		p(
			`A single amplifier stage can only slide so steeply. To slide faster, stages are put one after the other, each one adding to the slope. The tool counts how many are needed to meet the two edges entered${Number.isFinite(order) ? `: here the order is ${order}, built as ${stages} stage${stages === 1 ? '' : 's'}` : ''}. The order is that count of slopes; each stage of the circuit provides two of them.`
		),
		...TOPOLOGY[topology],
		h('Words used on this page'),
		terms([
			['passband', 'the frequencies that get through'],
			['stopband', 'the frequencies that are turned down'],
			['dB (decibel)', 'a way of counting volume in ratios: 6 dB is about twice the voltage, 20 dB is ten times, 40 dB a hundred times'],
			['Amax', 'how much the passband may sag or wobble, in dB; smaller is stricter'],
			['Amin', 'how much the stopband must be turned down, in dB; larger is stricter'],
			['order', 'how steep the filter is; the number of stages is half the order'],
			['cutoff', 'the frequency at which the filter starts turning the signal down'],
			['Bode plot', 'the graph of volume against frequency the tool draws for the circuit'],
			['op-amp', 'the amplifier chip each stage is built around'],
			['LTspice', 'a free program that simulates circuits; the download opens straight in it']
		])
	];
	return blocks;
}
