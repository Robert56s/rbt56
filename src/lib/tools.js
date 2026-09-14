export const tools = [
	{
		name: 'Stereo L/R',
		href: '/tools/stereo/',
		summary:
			'Two tracks in, one stereo file out: the first on the left channel, the second on the right.',
		tags: ['audio', 'mp3', 'wav'],
		state: 'live'
	},
	{
		name: 'Active Filter Design',
		href: '/tools/filter-design/',
		summary: 'Low-pass filter design: order, transfer function, real components and a Bode plot.',
		tags: ['electronics', 'filters'],
		state: 'live'
	},
	{
		name: 'AM Modulator / Demodulator Design',
		href: '/tools/am-modulator-demodulator/',
		summary:
			'Design AM circuits: a JFET voltage-controlled-resistor modulator, a diode plus resonant-tank modulator, and a precision-rectifier envelope demodulator.',
		tags: ['electronics', 'modulation'],
		state: 'live'
	},
	{
		name: 'Karnaugh Map Solver',
		href: '/tools/karnaugh/',
		summary:
			'Minimize a Boolean function of 2 to 4 variables on a Karnaugh map: groups, prime implicants, the minimal expression with every step, and the two-level gate circuit.',
		tags: ['electronics', 'logic', 'digital'],
		state: 'live'
	}
];
