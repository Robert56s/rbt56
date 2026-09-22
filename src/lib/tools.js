/**
 * Every tool on the site, and the categories the home page groups them
 * into. `category` is an id from CATEGORIES; the numbering shown on the
 * home page follows this array, so a tool keeps its number when the
 * grouping changes.
 */

export const CATEGORIES = [
	{
		id: 'analog',
		name: 'Analog circuit design',
		blurb: 'Work out real component values from a specification, with the derivation shown and an LTspice file to simulate before building.'
	},
	{
		id: 'audio',
		name: 'Audio and signals',
		blurb: 'Make, measure and manipulate signals in the browser, using the sound card as the instrument.'
	},
	{
		id: 'digital',
		name: 'Digital logic',
		blurb: 'Boolean minimization and the gate circuits that come out of it.'
	}
];

export const tools = [
	{
		name: 'Stereo L/R',
		href: '/tools/stereo/',
		category: 'audio',
		summary:
			'Two tracks in, one stereo file out: the first on the left channel, the second on the right. Either channel can also be a generated waveform or a modulated carrier.',
		tags: ['audio', 'mp3', 'wav'],
		state: 'live'
	},
	{
		name: 'Active Filter Design',
		href: '/tools/filter-design/',
		category: 'analog',
		summary:
			'Low-pass, high-pass, band-pass or band-stop: order, transfer function, real components from the values you actually stock, a Bode plot and an LTspice schematic.',
		tags: ['electronics', 'filters', 'ltspice'],
		state: 'live'
	},
	{
		name: 'AM Modulator / Demodulator Design',
		href: '/tools/am-modulator-demodulator/',
		category: 'analog',
		summary:
			'Design AM circuits: a JFET voltage-controlled-resistor modulator in two cell topologies, a diode plus resonant-tank modulator, and a precision-rectifier envelope demodulator.',
		tags: ['electronics', 'modulation', 'ltspice'],
		state: 'live'
	},
	{
		name: 'Karnaugh Map Solver',
		href: '/tools/karnaugh/',
		category: 'digital',
		summary:
			'Minimize a Boolean function of 2 to 4 variables on a Karnaugh map: groups, prime implicants, the minimal expression with every step, and the two-level gate circuit.',
		tags: ['electronics', 'logic', 'digital'],
		state: 'live'
	},
	{
		name: 'Signal Generator',
		href: '/tools/signal-generator/',
		category: 'audio',
		summary:
			'A live two-channel function generator on the audio output: sine, square, triangle, ramps, noise, AM and FM on left and right, up to what the sound card can hold, with a scope.',
		tags: ['audio', 'electronics', 'generator'],
		state: 'live'
	},
	{
		name: 'Sine Oscillator Design',
		href: '/tools/oscillator/',
		category: 'analog',
		summary:
			'Five ways to make a sine wave from op-amps: Wien bridge, phase shift, buffered, Bubba and quadrature, with amplitude stabilization, distortion, the gain-bandwidth ceiling and which one to build.',
		tags: ['electronics', 'oscillators', 'ltspice'],
		state: 'live'
	}
];

/** The tools of one category, in the order they are declared above. */
export function toolsIn(categoryId) {
	return tools.filter((t) => t.category === categoryId);
}

/** The number a tool is shown under, 1-based over the whole list. */
export function toolNumber(tool) {
	return tools.indexOf(tool) + 1;
}
