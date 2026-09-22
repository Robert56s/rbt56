import { formatHz, formatVolts } from '../modulation/format';

/**
 * The oscillator tool in plain words, for a reader who has not met the
 * vocabulary yet. Follows the topology and the amplitude control chosen,
 * and uses the design's own numbers where a number helps.
 */

const h = (text) => ({ h: text });
const p = (text) => ({ p: text });
const terms = (list) => ({ terms: list });

const TOPOLOGY_STORY = {
	wien: [
		h('This circuit: the Wien bridge'),
		p(
			'Two resistors and two capacitors form a small filter that is fussy about one frequency: only at that frequency does the signal come out of the filter lined up with the signal that went in, and at that frequency exactly a third of it survives. The amplifier makes it three times bigger again and feeds it back to the start. The loop supports itself at that one frequency, and nowhere else.'
		),
		p(
			'A gain of three is a very small ask, which is why this is the circuit to build by default: the amplifier hardly has to work, it stays accurate at frequencies where the others give up, and its amplitude control lives in a corner of its own where it cannot spoil the waveform.'
		)
	],
	phaseShift: [
		h('This circuit: the phase-shift ladder'),
		p(
			'An amplifier that flips the signal upside down (that is half a turn) is followed by three resistor-capacitor pairs that each turn it a further sixth of a turn. Together that is a full turn, so the signal comes back to the start pointing the same way it left, and the loop feeds itself. Each pair also throws most of the signal away, which is why the amplifier has to make it twenty-nine times bigger.'
		),
		p(
			'It is the circuit every textbook starts with because it uses the fewest parts. It is also the hardest on the amplifier, and the tool shows why the buffered version and the Bubba exist.'
		)
	],
	bufferedPhaseShift: [
		h('This circuit: the buffered phase-shift ladder'),
		p(
			'The same three resistor-capacitor pairs as the plain ladder, but with a small helper amplifier between the pairs so that each one works alone instead of dragging on its neighbour. The pairs then behave as the simple formula says, and the amplifier only has to make the signal eight times bigger instead of twenty-nine. The price is two more amplifiers.'
		)
	],
	bubba: [
		h('This circuit: the Bubba'),
		p(
			'Four resistor-capacitor pairs instead of three, each with its own helper amplifier, each turning the signal by an eighth of a turn. Spreading the turn over more pairs makes the frequency harder to push around, so this one holds its pitch best, and because the pairs are an eighth of a turn apart, two of the taps give a sine and a cosine at once. Four amplifiers, which is exactly one common chip.'
		)
	],
	quadrature: [
		h('This circuit: the quadrature oscillator'),
		p(
			'Two amplifiers wired as integrators (each one turns a sine into a cosine, a quarter turn late) and a third that flips the sign. Half a turn from the integrators plus half a turn from the flip is a full turn, so the loop feeds itself, and the two integrator outputs are a sine and a cosine of the same size, which no other circuit here gives without trimming.'
		),
		p(
			'This one has a quirk the others do not: making the loop stronger does not make it grow, it only makes it faster. What starts and stops it is friction, added and removed on purpose, which the amplitude control section explains.'
		)
	]
};

const STABILIZER_STORY = {
	diodes: (d) => [
		h('Holding the size of the wave: two diodes'),
		p(
			`A loop that feeds itself would grow until the amplifier hits the limit of its power supply and flattens the tops of the wave. So the amplifier is set just a little too strong on purpose, and two diodes sit across part of the resistor that sets its strength. Below a certain size the diodes do nothing; once the wave is big enough they start to conduct and quietly take some of that strength away. The wave settles where the two effects balance, here at about ${formatVolts(d.limiter.amplitudeActual ?? d.amplitude)} peak.`
		),
		p(
			'The diodes do not switch on cleanly, they bend, so they bend the tops of the wave a little too. That is the distortion figure on the page. A couple of percent is invisible on a scope and harmless for a carrier; for clean audio the lamp or the JFET does better.'
		)
	],
	lamp: () => [
		h('Holding the size of the wave: a small lamp'),
		p(
			'A tiny incandescent lamp is used as a resistor that changes with heat. A bigger wave pushes more current through it, the filament warms, its resistance rises, and that lowers the amplifier\'s strength. Nothing ever bends or clips, which makes this the cleanest sine of the group. The catch is that it reacts slowly and drifts with room temperature, and suitable lamps are getting hard to buy.'
		)
	],
	jfet: () => [
		h('Holding the size of the wave: a transistor used as a resistor'),
		p(
			'A JFET is a transistor that behaves like a resistor whose value is set by the voltage on its gate. A small detector watches the size of the output wave, turns it into a steady voltage, and uses it to squeeze the transistor: a bigger wave means a tighter squeeze, a higher resistance, and a weaker amplifier. Like the lamp, nothing in the signal path clips, so the wave stays clean, and unlike the lamp every part is still sold.'
		)
	],
	clamp: (d) => [
		h('Starting and holding the quadrature loop'),
		p(
			`One resistor deliberately adds a little negative friction to the loop, so the wave grows on its own by a few percent every cycle. Then a pair of diodes behind a voltage divider adds positive friction, but only once the wave reaches the size the divider is set for, here about ${formatVolts(d.limiter.amplitudeActual ?? d.amplitude)} peak. The wave grows to that size and stops. Because the diodes act on the integrator's input rather than on the output, what little they bend is smoothed out before it reaches the outputs.`
		)
	]
};

export function oscillatorBasics(design) {
	if (!design) return [];
	const { limiter, f0, opamp } = design;
	const blocks = [
		h('What this tool makes'),
		p(
			`A circuit that produces a pure sine wave, a smooth up-and-down signal at one frequency, from nothing but an amplifier chip, resistors and capacitors. There is no input: the circuit feeds its own output back to its input in a way that only works at one frequency, and it keeps that frequency going by itself. Enter the frequency and the size wanted, and the tool picks the parts.`
		),
		...TOPOLOGY_STORY[design.topology],
		...STABILIZER_STORY[limiter.kind](design),
		h('What the amplifier chip does to the frequency'),
		p(
			`An amplifier chip is not infinitely fast. At ${formatHz(f0)} this one answers a little late, about ${opamp.lagDeg.toFixed(1)} degrees of a cycle, and a late amplifier makes the loop settle at a slightly lower frequency than the resistors and capacitors alone would give. The tool knows this and chooses the parts so that the finished circuit lands on the frequency asked for, not on the textbook one. It also says when the chip is too slow to be trusted and which circuit would ask less of it.`
		),
		h('Words used on this page'),
		terms([
			['op-amp', 'the amplifier chip, an operational amplifier; it makes a small signal bigger by a factor set with two resistors'],
			['gain', 'that factor: a gain of 3 means the output is three times the input'],
			['feedback', 'sending part of the output back to the input; here it is what keeps the wave going'],
			['phase', 'how far along its cycle a wave is; two waves in phase rise and fall together'],
			['amplitude', 'the size of the wave, measured here from the middle to a peak, in volts'],
			['distortion (THD)', 'how far the wave is from a perfect sine, as a percentage; zero would be perfect'],
			['gain-bandwidth', 'how fast the chip is: the frequency at which its gain drops to 1'],
			['LTspice', 'a free program that simulates circuits; the download opens straight in it']
		])
	];
	return blocks;
}
