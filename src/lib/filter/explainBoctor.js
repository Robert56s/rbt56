// Original derivation and rounded-circuit interpretation of the Boctor networks.
export function explainBoctor(d) {
	const p = text => ({ type: 'p', text });
	const eq = tex => ({ type: 'eq', tex });
	return [
		p('Boctor places one pair of poles and one pair of stopband zeros with one op-amp, six resistors and two capacitors. Component rounding changes both the poles and the numerator. The plotted curve includes that change.'),
		eq(String.raw`H(s)=\frac{b_2s^2+b_1s+b_0}{s^2+(\omega_0/Q)s+\omega_0^2},\quad \omega_z=\sqrt{b_0/b_2}`),
		p(d.lowSide ? 'The upper input is inverting. C2 feeds the first node, R6 links it to the upper input, and C1 feeds back from the output. R3 and R5 divide the input at the lower, non-inverting input. The capacitor search sets the ideal DC gain to one.' : 'The upper input is inverting. C2 and R2 feed it, with R4 and R5 closing the feedback loop. C1 and R1 feed the lower input, R3 returns the output there, and R6 connects it to ground. This form needs gain above one and has a limit on Q.'),
		...(d.lowSide ? [eq(String.raw`G=\frac1{R_2}+\frac1{R_4}+\frac1{R_6},\quad k=\frac{R_5}{R_3+R_5},\quad \omega_0^2=\frac1{R_4R_6C_1C_2},\quad \frac{\omega_0}{Q}=\frac{G}{C_2}`)] : [eq(String.raw`\omega_0^2=\frac{1/R_1+1/R_6-R_5/(R_3R_4)}{R_2C_1C_2},\quad Q_{\rm target}<\frac1{1-(\omega_{z,\rm target}/\omega_{0,\rm target})^2}`)]),
		p(`From the rounded parts: f0 = ${(d.actual.wn / (2 * Math.PI)).toFixed(2)} Hz, Q = ${d.actual.q.toFixed(4)}, fz = ${(d.actual.wz / (2 * Math.PI)).toFixed(2)} Hz. The numerator coefficient b1 is ${d.actual.numeratorS.toPrecision(4)} per second. An exact null needs b1 = 0; a nonzero value leaves a finite minimum near fz. Trimming the resistor ratios restores the rejection.`),
		eq(String.raw`b_2=${d.actual.gain.toPrecision(5)},\quad b_1=${d.actual.numeratorS.toPrecision(5)},\quad b_0=${(d.actual.gain * d.actual.wz ** 2).toPrecision(5)}`)
	];
}
