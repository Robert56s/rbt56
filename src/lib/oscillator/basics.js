/**
 * The oscillator tool introduced from the beginning, in nine steps: the
 * wave and its two numbers, the loop through a microphone's howl, the
 * rule written down, one resistor and one capacitor in time, the curves
 * that pick the frequency, the circuit chosen, what holds the size, the
 * op-amp's lag, then a map of the panels below. Every number in the prose
 * and in the equations comes from the design object; when one is missing
 * or not finite the prose falls back to a general sentence and the
 * equation to its symbolic line. The text follows design.topology and
 * design.limiter.kind.
 */

const h = (text) => ({ h: text });
const p = (text) => ({ p: text });
const eq = (tex, intro) => ({ eq: tex, intro });
const widget = (name, props) => ({ widget: name, props });
const terms = (list) => ({ terms: list });

/** Joins the sentences that apply, dropping the ones a guard left out. */
const say = (...parts) => parts.filter(Boolean).join(' ');
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const pos = (...xs) => xs.every((x) => num(x) && x > 0);
const pct = (x, digits = 1) => (100 * x).toFixed(digits);
const deg = (x) => (180 / Math.PI) * x;

// the loop figure's slider starts between these two excesses
const LOOP_LOW = 0.02;
const LOOP_HIGH = 0.15;
// past this lag of one stage the page stops trusting the retune
const LAG_LIMIT = 25;
// the AM tool's carrier, quoted beside the lag figure
const AM_CARRIER = 55000;
// the stage of the plain phase-shift ladder runs at N = 1 + 29 or so
const PLAIN_LADDER_N = 30;

const PREFIXES = [
	{ exp: 9, p: 'G' },
	{ exp: 6, p: 'M' },
	{ exp: 3, p: 'k' },
	{ exp: 0, p: '' },
	{ exp: -3, p: 'm' },
	{ exp: -6, p: 'μ' },
	{ exp: -9, p: 'n' },
	{ exp: -12, p: 'p' }
];

/**
 * Three significant figures and an SI prefix, as the page's own
 * formatters give them, except that the digits follow the rounded value:
 * 9.9985 k reads 10.0 k, not 10.00 k.
 */
function siParts(value) {
	const abs = Math.abs(value);
	const e = PREFIXES.find((x) => abs >= 10 ** x.exp * 0.999) ?? PREFIXES[PREFIXES.length - 1];
	const scaled = value / 10 ** e.exp;
	const rounded = Math.abs(Number(scaled.toPrecision(3)));
	const digits = rounded >= 100 ? 0 : rounded >= 10 ? 1 : 2;
	return { n: scaled.toFixed(digits), prefix: e.p };
}
function si(value, unit) {
	const { n, prefix } = siParts(value);
	return `${n} ${prefix}${unit}`;
}
const formatHz = (f) => si(f, 'Hz');
const formatOhms = (r) => si(r, 'Ω');
const formatVolts = (v) => si(v, 'V');
const formatSeconds = (t) => si(t, 's');

/** The same value and unit as TeX. */
function texSI(value, unit) {
	const { n, prefix } = siParts(value);
	const micro = prefix === 'μ';
	let tex;
	if (unit === 'ohm') tex = `${micro ? '\\mu' : prefix ? `\\text{${prefix}}` : ''}\\Omega`;
	else tex = micro ? `\\mu\\text{${unit}}` : `\\text{${prefix}${unit}}`;
	return `${n}\\,${tex}`;
}
const texHz = (f) => texSI(f, 'Hz');
const texOhm = (r) => texSI(r, 'ohm');
const texF = (c) => texSI(c, 'F');

/**
 * A - 1 printed with just enough decimals that Rf divided by the printed
 * value gives the printed result: 20.0 k / 2.0012 = 9.99 k, never
 * 20.0 k / 2.00 = 9.99 k.
 */
function gainLess1(rf, gain) {
	const exact = texOhm(rf / (gain - 1));
	for (const digits of [2, 3, 4]) {
		const shown = (gain - 1).toFixed(digits);
		if (texOhm(rf / Number(shown)) === exact) return shown;
	}
	return (gain - 1).toFixed(5);
}

/**
 * What each topology brings: its name in a sentence, the props of the
 * network figure, and the square root in its frequency constant.
 */
const TOPOLOGY = {
	wien: { name: 'the Wien bridge', heading: 'This circuit: the Wien bridge', network: { kind: 'wien', k: 1, gain: 3 }, root: null },
	phaseShift: { name: 'the phase-shift ladder', heading: 'This circuit: the phase-shift ladder', network: { kind: 'ladder', sections: 3, buffered: false, k: 1 / Math.sqrt(6), gain: 29 }, root: 6 },
	bufferedPhaseShift: { name: 'the buffered ladder', heading: 'This circuit: the buffered ladder', network: { kind: 'ladder', sections: 3, buffered: true, k: 1 / Math.sqrt(3), gain: 8 }, root: 3 },
	bubba: { name: 'the Bubba', heading: 'This circuit: the Bubba', network: { kind: 'ladder', sections: 4, buffered: true, k: 1, gain: 4 }, root: null },
	quadrature: { name: 'the quadrature oscillator', heading: 'This circuit: the quadrature oscillator', network: { kind: 'quadrature', k: 1, gain: 1 }, root: null }
};

const HOOK =
	'An oscillator has nothing connected to its input, yet a clean sine wave comes out. Inside is a loop that hands the output back to the input at exactly the right size and exactly in step, and designing one means meeting those two conditions and keeping them met.';

/* ------------------------------------------------------ 1. the wave itself */

function waveFromNothing(d) {
	const f = pos(d.frequency) ? d.frequency : null;
	const a = pos(d.amplitude) ? d.amplitude : null;
	return [
		h('A wave from nothing'),
		p(
			say(
				'When the supply comes on, a sine wave appears at the output with nothing feeding the input.',
				'The circuit is one to four op-amps, the amplifier chips, and a few resistors and capacitors.',
				'Two numbers describe the wave.',
				f
					? `The frequency is how many cycles it makes each second, in hertz: at ${formatHz(f)} one cycle lasts ${formatSeconds(1 / f)}.`
					: 'The frequency is how many cycles it makes each second, in hertz.',
				a
					? `The amplitude is its height from the middle line to a peak, in volts: ${formatVolts(a)} peak swings from -${formatVolts(a)} to +${formatVolts(a)}.`
					: 'The amplitude is its height from the middle line to a peak, in volts.'
			)
		),
		p(
			say(
				'Those are the first two numbers in the Specification above.',
				'The tool turns them into part values, predicts what the finished circuit will really give, and writes a schematic for a simulator.',
				'The sections below explain where the wave comes from and what holds it steady.'
			)
		)
	];
}

/* ------------------------------------------------ 2. the howl and the loop */

function howl(d) {
	const L = d.limiter;
	const quad = d.topology === 'quadrature';
	// the quadrature loop has no excess gain: its start-up growth plays that part
	const raw = quad ? d.growthPerCycle : d.loopExcess;
	const known = num(raw);
	const excess0 = known ? raw : 0.05;
	const shown = Math.min(LOOP_HIGH, Math.max(LOOP_LOW, excess0));

	let start;
	if (!known) start = `from a typical loop gain, ${(1 + excess0).toFixed(3)}`;
	else if (excess0 < LOOP_LOW) start = excess0 > 0 ? `from ${(1 + shown).toFixed(3)}, just above the ${(1 + excess0).toFixed(3)} this design starts with` : `from ${(1 + shown).toFixed(3)}, since this design's own ${(1 + excess0).toFixed(3)} would not start at all`;
	else if (excess0 > LOOP_HIGH) start = `from the top of its slider, ${(1 + shown).toFixed(3)}`;
	else if (quad) start = `from ${(1 + excess0).toFixed(3)}, the growth per trip this design starts with`;
	else start = `from the loop gain this design starts with, ${(1 + excess0).toFixed(3)}`;

	let closing = '';
	const continuous = 'In the real circuit the wave goes round continuously, not one trip at a time.';
	if (quad) {
		if (known && excess0 > LOOP_HIGH) closing = `The page's start-up growth, ${pct(excess0)} percent per cycle, is past the top of the figure's slider.`;
		else if (known && excess0 < LOOP_LOW) closing = `The page's own start-up rate, ${pct(excess0)} percent per cycle, is a little under what the figure shows.`;
		else if (known) closing = `That is the page's own start-up rate, ${pct(excess0)} percent per cycle, so here the figure grows as the real circuit does.`;
	} else if (L.kind === 'diodes') {
		const g = d.growthPerCycle;
		const gText = pos(g) ? pct(g, g < 0.1 ? 1 : 0) : null;
		if (!gText) closing = continuous;
		else if (g > shown) closing = `In the real circuit the wave goes round continuously and grows faster: ${gText} percent per cycle here, the row in section 02.`;
		else closing = `In the real circuit the wave goes round continuously and grows ${gText} percent per cycle, the row in section 02.`;
	} else if (!known) {
		closing = continuous;
	} else if (excess0 > LOOP_HIGH) {
		closing = `In the real circuit the wave goes round continuously and grows faster than the figure shows: at switch-on this design's loop gain is ${(1 + excess0).toFixed(2)}.`;
	} else {
		closing = 'In the real circuit the wave goes round continuously and grows faster than the figure shows.';
	}

	const props = { excess0 };
	const f0 = pos(d.f0) ? d.f0 : pos(d.fIdeal) ? d.fIdeal : null;
	if (f0) props.f0 = f0;
	const target = pos(L.amplitudeActual) ? L.amplitudeActual : pos(d.amplitude) ? d.amplitude : null;
	if (target) props.target = target;

	return [
		h('The howl of a microphone: a loop that feeds itself'),
		p(
			say(
				'Everyone has heard a microphone howl.',
				'Sound from the speaker reaches the microphone, is amplified and comes out louder, again and again.',
				'Past a certain volume one pitch takes over, grows until the amplifier can give no more, and stays; turned down, it dies away.',
				'An oscillator is that howl built on purpose.'
			)
		),
		p(
			say(
				'An amplifier multiplies a wave by its gain, A.',
				'Here it sends its output back to its own input through a network of resistors and capacitors, which hands back a fraction, beta.',
				'Each trip round the loop multiplies whatever is there, even a trace of noise, by A times beta, the loop gain: under 1 it fades, over 1 it grows.',
				`The figure runs a wave round such a loop, one trip per cycle, ${start}; the limiter switch stands for the part that holds the size.`,
				closing
			)
		),
		widget('loop', props),
		p(
			say(
				'At a loop gain of 0.990 the wave fades, at 1.000 it holds only while nothing disturbs it, and at 1.050 it grows.',
				target
					? `With the limiter on, every gain above 1 heads for the same ${formatVolts(target)}, so the limiter, not the gain, sets the final size.`
					: 'With the limiter on, every gain above 1 heads for the same size, so the limiter, not the gain, sets the final size.',
				quad ? 'That is why the Specification asks for a start-up growth instead of a loop set exactly at 1.' : 'That is why the Specification asks for an excess gain instead of exactly 1.'
			)
		)
	];
}

/* ------------------------------------------------------- 3. the one rule */

function theRule(d) {
	const t = TOPOLOGY[d.topology];
	const n = num(d.idealGain) ? Math.round(d.idealGain) : null;
	// the gain once the op-amp's lag is counted, quoted only where it differs
	const lagClause = n !== null && num(d.requiredGain) && d.requiredGain.toFixed(2) !== d.idealGain.toFixed(2) ? `, ${d.requiredGain.toFixed(2)} once the op-amp's lag is counted` : '';

	let variant;
	if (d.topology === 'quadrature') {
		variant = say(
			'The quadrature oscillator chosen above works the other way round.',
			'Its network is two integrators, op-amps with a capacitor in their feedback, and its amplifier is an inverter, an op-amp that flips the wave upside down.',
			'Their angle is right at every frequency, so the size picks the frequency f0: the one where the two integrators hand back the whole wave, and where the inverter needs a gain of only 1.'
		);
	} else if (n === null) {
		variant = `${t.name[0].toUpperCase()}${t.name.slice(1)}, chosen above, asks its amplifier for exactly that.`;
	} else if (d.topology === 'wien') {
		variant = `With the Wien bridge chosen above, the network passes one third of the wave there, so the amplifier must multiply by ${n}${lagClause}.`;
	} else if (d.topology === 'bubba') {
		variant = `With the Bubba chosen above, the four pairs pass 1/${n} of the wave there, so the amplifier must multiply by ${n}${lagClause}.`;
	} else {
		variant = `With ${t.name} chosen above, the ladder passes ${d.topology === 'phaseShift' ? 'only ' : ''}1/${n} of the wave there, so the amplifier must multiply by ${n}${lagClause}.`;
	}

	const rule = 'A\\,\\beta = 1 \\quad\\Longleftrightarrow\\quad |A\\,\\beta| = 1 \\ \\text{ and } \\ \\angle(A\\beta) = 0^\\circ';
	const here = n !== null && pos(d.fIdeal) ? ` \\\\ \\text{here: } |\\beta(f_0)| = ${n === 1 ? '1' : `\\dfrac{1}{${n}}`} \\ \\text{ at } f_0 = ${texHz(d.fIdeal)} \\ \\Rightarrow\\ A = ${n}` : '';

	return [
		h('The one rule, written down'),
		p(
			say(
				'One trip round the loop multiplies the wave by A, then by beta.',
				'The wave keeps its size only when the product is exactly 1.',
				'It also has to come back in step: a wave that returns a little early or late does not line up with the one already there.',
				"Those two conditions together are Barkhausen's condition, and every circuit on this page obeys it."
			)
		),
		p(
			say(
				'In the Wien bridge and the ladders the network turns the wave by a different angle at every frequency, so the angle picks the one frequency that comes back lined up, called f0.',
				'The size condition then says what the amplifier must supply: exactly what the network throws away there.',
				d.topology === 'quadrature' ? '' : variant
			)
		),
		// the quadrature loop works the other way round: its own paragraph
		...(d.topology === 'quadrature' ? [p(variant)] : []),
		eq(here ? `\\begin{gathered} ${rule}${here} \\end{gathered}` : rule, "Barkhausen's condition, then what it asks of this design's amplifier:")
	];
}

/* ------------------------------------------ 4. one resistor, one capacitor */

function rcPair(d) {
	const known = pos(d.r, d.c);
	const fc = known ? 1 / (2 * Math.PI * d.r * d.c) : null;
	const variant = {
		wien: 'The Wien bridge uses one pair of each kind.',
		phaseShift: 'The ladders use the first kind, three or four in a row.',
		bufferedPhaseShift: 'The ladders use the first kind, three or four in a row.',
		bubba: 'The ladders use the first kind, three or four in a row.',
		quadrature: 'The quadrature oscillator puts its capacitors to work in integrators instead, two sections below.'
	}[d.topology];
	const symbolic = 'f_c = \\dfrac{1}{2\\pi RC}';
	return [
		h('One resistor and one capacitor'),
		p(
			say(
				'The capacitor is what turns the wave.',
				'A capacitor passes changes and blocks steady voltages, so it lets fast waves through and holds slow ones back.',
				'With a capacitor in the signal path and a resistor to ground, the pair does two things to a sine: it makes it smaller, and it shifts it along in time.',
				'The shift is the phase, called the turn on this page, in degrees out of the 360 of one cycle.'
			)
		),
		p(
			say(
				'Both effects depend on frequency, and one number sets them, the corner frequency: there the pair passes 71 percent of the wave and turns it by 45 degrees, an eighth of a cycle.',
				"R, the resistor's value, and C, the capacitor's, alone fix it.",
				'With the parts swapped, capacitor to ground, the pair does the mirror image: it passes slow waves and shifts them later instead of earlier.',
				variant
			)
		),
		eq(known ? `${symbolic} = \\dfrac{1}{2\\pi \\times ${texOhm(d.r)} \\times ${texF(d.c)}} = ${texHz(fc)}` : symbolic, "The corner frequency of one pair, then with this design's R and C:"),
		...(known ? [widget('rc-pair', { r0: d.r, c0: d.c })] : []),
		p(
			say(
				'Far below the corner, the pair with the capacitor in the path passes almost nothing, and shifts what it passes nearly a quarter cycle earlier.',
				'Far above, it passes everything with no shift.',
				'At the corner it passes 71 percent and turns 45 degrees.',
				d.topology === 'wien'
					? "The switch gives the mirror image, the same 45 degrees but later, which is how the Wien bridge's two pairs cancel."
					: 'The switch gives the mirror image, the same 45 degrees but later.',
				RC_WORKING_POINT[d.topology],
				'A larger R lowers the corner in proportion, which is how the tool sets the frequency.'
			)
		)
	];
}

/** Where the chosen circuit works each pair, read off the RC figure. */
const RC_WORKING_POINT = {
	phaseShift: 'A lone pair turns 60 degrees at 0.58 of the corner; the plain ladder, whose pairs load each other, has to run lower still, at 0.41 of it.',
	bufferedPhaseShift: "At 0.58 of the corner the first kind turns 60 degrees and passes exactly half: the buffered ladder's working point.",
	bubba: 'That corner is exactly where the Bubba works each of its four pairs.'
};

/* --------------------------------------------- 5. what picks the frequency */

function whatPicks(d) {
	const quad = d.topology === 'quadrature';
	const t = TOPOLOGY[d.topology];
	const blocks = [
		h('What picks the frequency'),
		p(
			say(
				'The network in the loop is built from resistors and capacitors, and the figure shows what it does to a wave at every frequency.',
				'The upper curve is how much of the wave survives, in decibels, a logarithmic count: -9.5 dB is one third, -20 dB one tenth.',
				'The lower curve is the turn, in degrees.'
			)
		),
		p(
			quad
				? say(
						"Here the network is the two integrators, and it behaves differently: it turns the wave by exactly half a cycle at every frequency, which the inverter's flip completes, so the turn picks nothing.",
						'The size does.',
						'The upper curve falls steadily and crosses 0 dB, the whole wave coming back, at one frequency only: that is f0, where an inverter gain of 1 is enough.'
					)
				: say(
						'The loop can only run where the turn is the one the amplifier needs: 0 degrees for the Wien bridge, whose amplifier leaves the wave upright, and 180 degrees for the ladders, whose amplifier flips it upside down.',
						'The lower curve crosses that line once.',
						'That crossing is f0, and the height of the upper curve there is what the amplifier must make up.'
					)
		)
	];
	if (pos(d.fIdeal)) blocks.push(widget('network', { ...t.network, f0: d.fIdeal }));
	let notice;
	if (quad) notice = 'On the quadrature loop the turn is flat, so the size alone decides.';
	else if (d.topology === 'wien') notice = say('The lower curve crosses its guide line exactly once.', 'On the Wien bridge the upper curve peaks right there, at one third, -9.5 dB.');
	else if (pos(d.idealGain))
		notice = say(
			'The lower curve crosses its guide line exactly once.',
			`On this ladder the upper curve sits at ${(-20 * Math.log10(d.idealGain)).toFixed(1)} dB there, against -9.5 dB for the Wien bridge, which is why it asks for so much more gain.`
		);
	else notice = 'The lower curve crosses its guide line exactly once, and the height of the upper curve there is the loss the amplifier makes up.';
	blocks.push(p(notice));
	return blocks;
}

/* --------------------------------------------------- 6. the circuit chosen */

function thisCircuit(d) {
	const t = TOPOLOGY[d.topology];
	const n = num(d.idealGain) ? Math.round(d.idealGain) : null;
	const tap = pos(d.tapAmplitude) ? formatVolts(d.tapAmplitude) : null;
	let prose;
	if (d.topology === 'wien') {
		prose = [
			say(
				'The Wien network is a resistor and a capacitor in series, feeding a resistor and a capacitor in parallel to ground, with the same R and C in both.',
				'The series pair holds slow waves back, the parallel pair shorts fast ones to ground.',
				'At the corner of the pairs their two shifts cancel, and the wave comes through with no turn and one third of its size.',
				n !== null ? `So the amplifier multiplies by ${n}, and R and C alone fix the frequency.` : 'So R and C alone fix the frequency.'
			),
			say(
				n !== null ? `A gain of ${n} is less than any ladder asks for, and one op-amp does the whole job.` : 'Its gain is less than any ladder asks for, and one op-amp does the whole job.',
				'That is why the page recommends this one by default: it is simple, it asks little of its op-amp, and with the right part holding its size its sine is among the cleanest here.',
				'One op-amp, two resistors and two capacitors in the network, and a resistor pair to set the gain.'
			)
		];
	} else if (d.topology === 'phaseShift') {
		prose = [
			say(
				'An op-amp wired to flip its input already turns the wave by half a cycle, 180 degrees.',
				'Three pairs in a row, a ladder, add the other half, about 60 degrees each.',
				'A lone pair turns 45 degrees at its corner, so to turn 60 degrees the pairs must work below it.',
				n !== null
					? `Each pair also throws much of the wave away, and because each one draws current from the one before, the loss is worse than three lone pairs: only 1/${n} survives, so the amplifier must multiply by ${n}.`
					: 'Each pair also throws much of the wave away, and because each one draws current from the one before, the loss is worse than three lone pairs.'
			),
			say(
				'The same loading pulls the frequency down to the corner divided by the square root of 6.',
				'This is the circuit most textbooks start with, because it uses the fewest parts.',
				'It is also the hardest on the op-amp, which is why the buffered ladder and the Bubba exist.',
				tap ? `The cleanest output is the tap after the ladder, a point where the wave is taken off, at ${tap}.` : 'The cleanest output is the tap after the ladder, a point where the wave is taken off.'
			)
		];
	} else if (d.topology === 'bufferedPhaseShift') {
		prose = [
			say(
				'The same three pairs as the plain ladder, with a follower between them: a helper op-amp of gain 1 that stops each pair drawing current from the one before.',
				'Each pair then works exactly as the resistor and capacitor figure shows.',
				'It turns 60 degrees at the corner divided by the square root of 3, and there it passes one half of the wave.',
				n !== null ? `Three halves make one eighth, so the amplifier multiplies by ${n} instead of 29.` : 'Three halves make one eighth, so the amplifier multiplies by 8 instead of 29.'
			),
			say(
				'The price is two more op-amps.',
				`The frequency lands where the formula says, the gain stage works far less hard than in the plain ladder, and the cleanest output is the tap after the last pair, a point where the wave is taken off${tap ? `, at ${tap}` : ''}.`
			)
		];
	} else if (d.topology === 'bubba') {
		prose = [
			say(
				'Four pairs in a row, each with its own op-amp after it, so that no pair draws current from the one before.',
				'Each turns the wave by 45 degrees, an eighth of a cycle.',
				'That is the turn of a lone pair at its corner, so the Bubba runs at the corner frequency itself.',
				n !== null ? `There each pair passes 71 percent of the wave, and four of them pass one quarter, so the amplifier multiplies by ${n}.` : 'There each pair passes 71 percent of the wave, and four of them pass one quarter.'
			),
			say(
				"Spreading the turn over four pairs also makes the total turn change faster with frequency, so anything that nudges the loop's phase moves the frequency less: this circuit holds its frequency best.",
				'A second output, a tap taken off after two pairs, sits a quarter cycle from the main one: a cosine next to a sine.',
				'Four op-amps, exactly one common quad chip.'
			)
		];
	} else {
		prose = [
			say(
				'An integrator is an op-amp with a capacitor in its feedback.',
				'It adds up its input over time, which turns a sine into a cosine: a quarter cycle of turn at every frequency, and a smaller wave as the frequency rises.',
				'Two integrators in a row make half a cycle.',
				'A third op-amp that flips the wave makes the other half, and the loop closes.'
			),
			say(
				'The frequency is where the two integrators together hand back the whole wave, which is the corner frequency of their R and C.',
				'The two integrator outputs are a sine and a cosine of the same size, which no other circuit here gives without trimming.',
				'The loop has a quirk: a stronger inverter does not make the wave grow, it makes it run faster.',
				'What starts it and stops it is the next section.'
			)
		];
	}

	// f0 = k fc: the ladders carry a square root in k, the others have k = 1
	const symbolic = 'f_0 = k\\,f_c = \\dfrac{k}{2\\pi RC}';
	let tex;
	if (t.root) {
		const kTex = `k = \\dfrac{1}{\\sqrt{${t.root}}}`;
		tex = pos(d.r, d.c, d.fIdeal) ? `${symbolic}, \\qquad ${kTex} \\ \\Rightarrow\\ f_0 = \\dfrac{${texHz(1 / (2 * Math.PI * d.r * d.c))}}{\\sqrt{${t.root}}} = ${texHz(d.fIdeal)}` : `${symbolic}, \\qquad ${kTex}`;
	} else {
		tex = pos(d.fIdeal) ? `${symbolic}, \\qquad k = 1 \\ \\Rightarrow\\ f_0 = f_c = ${texHz(d.fIdeal)}` : `${symbolic}, \\qquad k = 1`;
	}

	return [h(t.heading), ...prose.map(p), eq(tex, "The frequency is the corner of one pair times a factor k set by the network, then with this design's parts:")];
}

/* ------------------------------------------------ 7. what holds the size */

const CLIPS = 'A loop set above 1 grows until the op-amp hits its supply rails, the limits of its output, and clips the peaks flat.';

function diodeLimiter(d) {
	const L = d.limiter;
	const ladder = d.topology !== 'wien';
	const req = num(d.requiredGain) ? d.requiredGain.toFixed(2) : null;
	const part = pos(L.rf1, L.rf2) ? (L.rf2 <= L.rf1 ? 'the smaller part, Rf2' : 'the larger part, Rf2') : 'one part, Rf2';
	const first = say(
		CLIPS,
		req ? `Something gentler has to bring the gain back to ${req} first.` : 'Something gentler has to bring the gain back to what the loop needs first.',
		ladder
			? "The ladder's amplifier flips the wave and multiplies by Rf/Rg, with Rf from the output back to the input and Rg, the last ladder resistor, into the input."
			: 'The amplifier multiplies by 1 + Rf/Rg, with Rf from the output back to the input and Rg from the input to ground.',
		`Here Rf is split in two, with two diodes back to back across ${part}.`
	);
	const amp = pos(L.amplitudeActual) ? `, at about ${formatVolts(L.amplitudeActual)} peak` : '';
	const thd = pos(d.thd) ? pct(d.thd, 2) : null;
	const second = say(
		num(L.gainStart)
			? `A diode passes almost no current below about half a volt, its knee, so at switch-on the diodes do nothing and the gain is ${L.gainStart.toFixed(2)}.`
			: 'A diode passes almost no current below about half a volt, its knee, so at switch-on the diodes do nothing and the gain is at its highest.',
		'As the wave grows, the voltage across Rf2 reaches that knee, the diodes conduct and bypass part of Rf2, and the gain falls.',
		req ? `The wave settles where the gain is exactly ${req}${amp}.` : `The wave settles where the gain is exactly what the loop needs${amp}.`,
		ladder
			? thd
				? `Diodes round the peaks slightly, and the ladder filters much of that before the tap: ${thd} percent distortion in section 02.`
				: 'Diodes round the peaks slightly, and the ladder filters much of that before the tap.'
			: thd
				? `Diodes bend rather than switch, so they round the peaks slightly: the ${thd} percent distortion in section 02.`
				: 'Diodes bend rather than switch, so they round the peaks slightly.',
		L.regulates === false ? 'With these parts the diodes cannot hold the size asked for; section 03 says what to change.' : ''
	);

	const one = ladder ? '' : '1 + ';
	const startSym = `A_{\\text{start}} = ${one}\\dfrac{R_{f1} + R_{f2}}{R_g}`;
	const limitedSym = `A_{\\text{limited}} = ${one}\\dfrac{R_{f1}}{R_g}`;
	const tex =
		pos(L.rf1, L.rf2, d.rg) && num(L.gainStart) && num(L.gainLimited) && req
			? `\\begin{gathered} ${startSym} = ${one}\\dfrac{${texOhm(L.rf1)} + ${texOhm(L.rf2)}}{${texOhm(d.rg)}} = ${L.gainStart.toFixed(2)} \\\\ ${limitedSym} = ${one}\\dfrac{${texOhm(L.rf1)}}{${texOhm(d.rg)}} = ${L.gainLimited.toFixed(2)}, \\qquad \\text{needed: } ${req} \\end{gathered}`
			: `\\begin{gathered} ${startSym} \\\\ ${limitedSym} \\end{gathered}`;
	const intro = ladder
		? 'On the inverting stage the gain is Rf/Rg; with the diodes off and fully on it has to straddle what the loop needs:'
		: 'The gain with the diodes off and with them fully on has to straddle what the loop needs:';
	return [h('Holding the size of the wave: two diodes'), p(first), p(second), eq(tex, intro)];
}

function lampLimiter(d) {
	const L = d.limiter;
	const req = num(d.requiredGain) ? d.requiredGain.toFixed(2) : null;
	const thd = pos(d.thd) ? pct(d.thd, 2) : null;
	const first = say(
		CLIPS,
		'Here a tiny incandescent lamp stops it first, used as a resistor that changes with heat.',
		'The amplifier multiplies by 1 + Rf/Rg, with Rf from the output back to the input and Rg from the input to ground, and here the lamp is Rg.',
		pos(L.rCold) && num(L.gainStart)
			? `At switch-on the filament is cold, about ${formatOhms(L.rCold)}, so the gain is ${L.gainStart.toFixed(1)} and the wave starts at once.`
			: 'At switch-on the filament is cold, its resistance is low, the gain is high and the wave starts at once.'
	);
	const settles =
		pos(L.rHot) && req
			? `The loop settles where the lamp reaches ${formatOhms(L.rHot)}, the value a gain of ${req} needs${pos(L.amplitudeActual) ? `, at ${formatVolts(L.amplitudeActual)} peak` : ''}.`
			: 'The loop settles where the lamp reaches the value the gain the loop needs asks for.';
	const second = say(
		'A bigger wave pushes more current through the filament: it warms, its resistance rises and the gain falls.',
		settles,
		thd ? `Nothing bends or clips, so this is the cleanest sine of the group, ${thd} percent distortion.` : 'Nothing bends or clips, so this is the cleanest sine of the group.',
		'The catches: it reacts slowly, drifts with room temperature, and lamps of the right rating are getting hard to buy.'
	);
	const symbolic = 'A = 1 + \\dfrac{R_f}{R_{\\text{lamp}}} \\ \\Rightarrow\\ R_{\\text{lamp,hot}} = \\dfrac{R_f}{A - 1}';
	const tex = pos(L.rf, L.rHot) && num(d.requiredGain) && d.requiredGain > 1 ? `${symbolic} = \\dfrac{${texOhm(L.rf)}}{${gainLess1(L.rf, d.requiredGain)}} = ${texOhm(L.rHot)}` : symbolic;
	return [h('Holding the size of the wave: a small lamp'), p(first), p(second), eq(tex, 'The resistance the lamp must reach at the wanted size:')];
}

function jfetLimiter(d) {
	const L = d.limiter;
	const heading = h('Holding the size of the wave: a transistor used as a resistor');
	const what = 'a transistor that behaves like a resistor whose value is set by the voltage on its gate, higher as the gate goes more negative.';
	// a JFET the detector cannot drive far enough: the tool could not size the loop
	if (!num(L.gainStart) || !pos(L.amplitudeActual)) {
		return [
			heading,
			p(
				say(
					CLIPS,
					`Here a JFET is meant to stop it first: ${what}`,
					pos(L.minAmplitude)
						? `This JFET cannot hold the size asked for: it needs at least ${formatVolts(L.minAmplitude)} at the output to be controlled at all.`
						: 'This JFET cannot hold the size asked for: it needs a larger wave at the output to be controlled at all.',
					'Section 03 says what to change.'
				)
			)
		];
	}
	const req = num(d.requiredGain) ? d.requiredGain.toFixed(2) : null;
	const thd = pos(d.thd) ? pct(d.thd, 2) : null;
	const cycles = pos(L.cyclesPerTau) ? Math.max(10, 10 * Math.round(L.cyclesPerTau / 10)) : null;
	const first = say(
		CLIPS,
		`Here a JFET stops it first: ${what}`,
		'The amplifier multiplies by 1 + Rf/Rg, with Rf from the output back to the input.',
		pos(L.rSeries) ? `Here Rg is the JFET's channel, its resistive path, in series with a fixed ${formatOhms(L.rSeries)}.` : "Here Rg is the JFET's channel, its resistive path, in series with a fixed resistor."
	);
	const second = say(
		`A small detector turns the output's peaks into a steady negative voltage for the gate, averaged over ${cycles ? `about ${cycles}` : 'many'} cycles so the gate does not follow the wave itself.`,
		'A bigger wave means a higher resistance in that leg and a weaker amplifier.',
		req ? `The loop settles where the gain is exactly ${req}, at about ${formatVolts(L.amplitudeActual)} peak.` : `The loop settles at about ${formatVolts(L.amplitudeActual)} peak.`,
		thd
			? `Nothing in the wave's path clips, so the sine stays clean, ${thd} percent distortion, and unlike the lamp every part is still sold.`
			: "Nothing in the wave's path clips, so the sine stays clean, and unlike the lamp every part is still sold."
	);
	const symbolic = 'A = 1 + \\dfrac{R_f}{R_{\\text{ser}} + r_{\\text{DS}}} \\ \\Rightarrow\\ R_{\\text{ser}} + r_{\\text{DS}} = \\dfrac{R_f}{A - 1}';
	let tex = symbolic;
	if (pos(L.rf) && num(d.requiredGain) && d.requiredGain > 1) {
		const leg = L.rf / (d.requiredGain - 1);
		const rds = pos(L.rSeries) ? leg - L.rSeries : NaN;
		const line1 = `${symbolic} = \\dfrac{${texOhm(L.rf)}}{${gainLess1(L.rf, d.requiredGain)}} = ${texOhm(leg)}`;
		tex = pos(rds) ? `\\begin{gathered} ${line1} \\\\ r_{\\text{DS}} = ${texOhm(leg)} - ${texOhm(L.rSeries)} = ${texOhm(rds)} \\end{gathered}` : line1;
	}
	return [heading, p(first), p(second), eq(tex, 'At balance the lower leg must add up to:')];
}

function clampLimiter(d) {
	const L = d.limiter;
	const g = pos(L.growthPerCycle) ? L.growthPerCycle : null;
	const thd = pos(d.thd) ? pct(d.thd, 2) : null;
	const first = say(
		'This loop cannot be held by gain, so it is held by damping, a kind of electrical friction.',
		"One resistor, Rn, feeds the inverter's output into the second integrator's input.",
		`That output is the negative of the integrator's own, so this is negative damping: the wave grows on its own${g ? `, ${pct(g)} percent every cycle` : ''}${d.starts ? ', and the loop always starts' : ''}.`
	);
	const second = say(
		pos(L.amplitudeActual)
			? `A pair of diodes behind a voltage divider adds positive damping, but only once the wave reaches the size the divider is set for, about ${formatVolts(L.amplitudeActual)} peak.`
			: 'A pair of diodes behind a voltage divider adds positive damping, but only once the wave reaches the size the divider is set for.',
		'The wave grows to that size and stops.',
		thd
			? `The diodes act on the integrator's input, not its output, so the little bending they do is smoothed before it reaches either output: ${thd} percent distortion here.`
			: "The diodes act on the integrator's input, not its output, so the little bending they do is smoothed before it reaches either output.",
		pos(L.amplitudeActual) ? '' : 'With these parts no divider reaches the size asked for; section 03 says what to change.',
		'For this circuit the Specification asks for this growth per cycle instead of an excess gain.'
	);
	const symbolic = '\\text{growth per cycle} = e^{\\pi R / R_n} - 1';
	let tex = symbolic;
	let intro = "The start-up growth from Rn, then with this design's parts:";
	if (pos(d.r, L.rn)) {
		const ideal = Math.exp((Math.PI * d.r) / L.rn) - 1;
		tex = `${symbolic} = e^{\\pi \\times ${texOhm(d.r)} / ${texOhm(L.rn)}} - 1 = ${pct(ideal)}\\,\\%`;
		if (g && pct(g) !== pct(ideal)) intro = `The start-up growth from Rn, then with this design's parts (the page's ${pct(g)} percent also counts the op-amps' lag):`;
	}
	return [h('Starting and holding the quadrature loop'), p(first), p(second), eq(tex, intro)];
}

const LIMITER = { diodes: diodeLimiter, lamp: lampLimiter, jfet: jfetLimiter, clamp: clampLimiter };

/* ---------------------------------------------- 8. the op-amp answers late */

function opampLate(d) {
	const o = d.opamp ?? {};
	const L = d.limiter;
	const N = pos(o.noiseGain) ? o.noiseGain : null;
	const f0 = pos(d.f0) ? d.f0 : pos(d.fIdeal) ? d.fIdeal : null;
	const lag = num(o.lagDeg) ? o.lagDeg : null;
	const lagText = lag !== null ? lag.toFixed(lag < 1 ? 2 : 1) : null;

	const first = say(
		'An op-amp is not infinitely fast.',
		pos(o.gbw) ? `Its speed is its gain-bandwidth, ${formatHz(o.gbw)} here: the frequency at which its gain has fallen to 1.` : 'Its speed is its gain-bandwidth: the frequency at which its gain has fallen to 1.',
		'Long before that it starts to answer late, and a late amplifier adds a turn of its own, one the network no longer has to supply, so the loop settles a little away from the frequency R and C alone would give.',
		N ? `The lag grows with the frequency and with N, which follows the gain of the stage, ${N.toFixed(2)} here.` : 'The lag grows with the frequency and with N, which follows the gain of the stage.'
	);

	const un = d.uncompensatedError;
	const textbook = num(un) ? `With textbook R and C this op-amp would put the loop ${pct(Math.abs(un), 2)} percent ${un < 0 ? 'low' : 'high'}.` : '';
	const retune = num(d.retunePercent)
		? `The tool solves the loop with the lag inside it and ${d.retunePercent < 0 ? 'lowers' : 'raises'} the product R C by ${pct(Math.abs(d.retunePercent), 2)} percent to cancel ${textbook ? 'that' : 'the lag'}.`
		: `The tool solves the loop with the lag inside it and adjusts the product R C to cancel ${textbook ? 'that' : 'the lag'}.`;
	// the retune is trusted while the lag stays modest, as the page rules it
	const lagTooMuch = (lag !== null && lag > LAG_LIMIT) || (num(un) && un <= -0.2);
	let landing = '';
	if (pos(d.f0, d.frequency)) {
		// the f0 of the equations above is that of R and C alone; say how
		// the lag takes the loop from there to the prediction
		const fromRC = pos(d.fIdeal) && formatHz(d.fIdeal) !== formatHz(d.f0) ? `R and C alone now give ${formatHz(d.fIdeal)}, the f0 worked out above, and the lag brings the loop to ` : '';
		const onTarget = formatHz(d.f0) === formatHz(d.frequency);
		// the rounding claim holds only while the retune can be trusted
		if (lagTooMuch) landing = fromRC ? `${fromRC}${formatHz(d.f0)}, against the ${formatHz(d.frequency)} asked for.` : `The prediction is ${formatHz(d.f0)} against the ${formatHz(d.frequency)} asked for.`;
		else if (onTarget) landing = fromRC ? `${fromRC}the ${formatHz(d.frequency)} asked for, give or take the rounding of R and C to stock values.` : `The prediction then lands on the ${formatHz(d.frequency)} asked for, give or take the rounding of R and C to stock values.`;
		else landing = fromRC ? `${fromRC}${formatHz(d.f0)}, which differs from the ${formatHz(d.frequency)} asked for only by the rounding of R and C to stock values.` : `The prediction, ${formatHz(d.f0)}, then differs from the ${formatHz(d.frequency)} asked for only by the rounding of R and C to stock values.`;
	}
	// a JFET that cannot regulate is not the op-amp's doing: section 7 covers it
	const jfetFails = L.kind === 'jfet' && !(num(L.gainStart) && pos(L.amplitudeActual));
	let flag = '';
	if (jfetFails) flag = lagTooMuch ? 'Here the lag is more than the correction can be trusted with; section 04 says what to change.' : '';
	else if (d.starts === false) flag = 'With this op-amp the loop does not start at this frequency; section 04 says what to change.';
	else if (o.opampOk === false) flag = 'Here the lag is more than the correction can be trusted with; section 04 says what to change.';
	const second = say(textbook, retune, landing, `The figure draws the lag against frequency; past ${LAG_LIMIT} degrees the page stops trusting the correction.`, flag);

	const symbolic = '\\varphi = \\arctan\\dfrac{f\\,N}{\\text{GBW}}';
	const tex = f0 && N && pos(o.gbw) && lagText ? `${symbolic} = \\arctan\\dfrac{${texHz(f0)} \\times ${N.toFixed(2)}}{${texHz(o.gbw)}} = ${lagText}^\\circ` : symbolic;

	const blocks = [h('The op-amp answers late'), p(first), p(second), eq(tex, "The lag of one stage, then with this design's numbers:")];
	if (pos(o.gbw) && N) {
		const props = { gbw: o.gbw, noiseGain: N, limitDeg: LAG_LIMIT };
		if (f0) props.f0 = f0;
		blocks.push(widget('opamp-lag', props));
		const atCarrier = deg(Math.atan((AM_CARRIER * N) / o.gbw));
		const nearCarrier = f0 && Math.abs(f0 / AM_CARRIER - 1) < 0.1;
		// the plain ladder's stage runs at N of about 30: how far left of
		// this circuit's its curve sits
		const times = Math.round(PLAIN_LADDER_N / N);
		let ladder = '';
		if (d.topology === 'phaseShift')
			ladder = `Here N is ${N.toFixed(1)}, against about 3 for the Wien bridge, so this curve sits about a decade further left: that is why this ladder's "10 % point" in section 05 is the lowest of the five.`;
		else if (times >= 2)
			ladder = `On the plain phase-shift ladder N is about ${PLAIN_LADDER_N}, about ${times} times the ${N.toFixed(1)} here, so its curve reaches the same lag at a frequency ${times} times lower: that is why its "10 % point" in section 05 is the lowest of the five.`;
		blocks.push(
			p(
				say(
					f0 && lagText ? `At ${formatHz(f0)} on this ${formatHz(o.gbw)} op-amp the lag is ${lagText} degrees${lag < 1 ? ', a rounding error' : ''}.` : '',
					nearCarrier ? '' : `At ${formatHz(AM_CARRIER)}, the AM tool's carrier, it would be about ${atCarrier.toFixed(1)} degrees.`,
					'A chip ten times slower moves the whole curve a decade to the left.',
					ladder
				)
			)
		);
	}
	return blocks;
}

/* ----------------------------------------------- 9. the rest of the page */

const READING = [
	[
		'The panels below follow one order.',
		'02 Circuit: the drawing, R and C, the gain the loop needs, the size to expect and the distortion.',
		'03 Amplitude stabilization: the parts that hold the size, and whether they can.',
		'04 What the op-amp does to the loop: the lag, the retune, and whether the chip is fast enough, with the slew rate and output swing it must reach.'
	],
	[
		'05 Which one to build: all five circuits at the same frequency, size and op-amp, and a verdict, the Wien bridge unless a sine and cosine pair or a very steady frequency is needed.',
		'06 Download: a schematic for LTspice, a free circuit simulator.',
		'Its run starts at the design size and its log reports the frequency and size the circuit holds.',
		'A flag under a table means a figure is stretched or has to change, and each Show the math block derives the numbers.'
	]
];

const GLOSSARY = [
	['op-amp', 'the amplifier chip; two resistors around it set its gain'],
	['gain (A)', 'output size over input size; a gain of 3 means three times'],
	['beta', 'the fraction of the wave the network hands back to the input, with the turn it gives it'],
	['loop gain (A beta)', 'what one trip round the loop multiplies the wave by; exactly 1 holds the size'],
	['phase (turn)', 'how far along its cycle a wave is, in degrees out of 360; in step means a turn of 0'],
	['V peak', 'the height of the wave from its middle line to a peak; 3 V peak swings from -3 V to +3 V'],
	['excess gain', 'how far above what the loop needs the amplifier is set at switch-on, in percent, so the wave always starts'],
	['distortion (THD)', 'how far the wave is from a pure sine, in percent; a few percent is hard to see on a scope'],
	['gain-bandwidth (GBW)', "the op-amp's speed: the frequency at which its gain has fallen to 1"],
	['slew rate', "the fastest the op-amp's output can change, in volts per microsecond; a sine climbs fastest through zero, at 2π f times its peak"]
];

export function oscillatorBasics(design) {
	if (!design || !TOPOLOGY[design.topology] || !design.limiter) return [];
	const d = design;
	const limiter = LIMITER[d.limiter.kind];
	return [
		p(HOOK),
		...waveFromNothing(d),
		...howl(d),
		...theRule(d),
		...rcPair(d),
		...whatPicks(d),
		...thisCircuit(d),
		...(limiter ? limiter(d) : []),
		...opampLate(d),
		h('Reading the rest of the page'),
		...READING.map((sentences) => p(say(...sentences))),
		h('Words used on this page'),
		terms(GLOSSARY)
	];
}
