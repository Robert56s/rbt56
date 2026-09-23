const SI = [
	{ exp: 9, suffix: 'G' },
	{ exp: 6, suffix: 'M' },
	{ exp: 3, suffix: 'k' },
	{ exp: 0, suffix: '' },
	{ exp: -3, suffix: 'm' },
	{ exp: -6, suffix: 'u' },
	{ exp: -9, suffix: 'n' },
	{ exp: -12, suffix: 'p' }
];

function siFormat(value, unit) {
	if (!Number.isFinite(value)) return '-';
	if (value === 0) return `0 ${unit}`;
	// round to the three significant figures that get printed first, then
	// pick the prefix: 9998.5 is 10.0 k, not 10.00 k, and 999.7 is 1.00 k
	const rounded = Number(value.toPrecision(3));
	const abs = Math.abs(rounded);
	const entry = SI.find((e) => abs >= 10 ** e.exp * 0.999) ?? SI[SI.length - 1];
	const scaled = rounded / 10 ** entry.exp;
	const size = Math.abs(scaled);
	const digits = size >= 99.95 ? 0 : size >= 9.995 ? 1 : 2;
	return `${scaled.toFixed(digits)} ${entry.suffix}${unit}`;
}

export const formatOhms = (r) => siFormat(r, 'Ω');
export const formatFarads = (c) => siFormat(c, 'F');
export const formatHenries = (l) => siFormat(l, 'H');
export const formatHz = (f) => siFormat(f, 'Hz');
export const formatVolts = (v) => siFormat(v, 'V');
export const formatSeconds = (t) => siFormat(t, 's');

export function formatPercent(x, digits = 2) {
	if (!Number.isFinite(x)) return '-';
	const sign = x > 0 ? '+' : '';
	return `${sign}${x.toFixed(digits)}%`;
}

export function relativeErrorPercent(actual, target) {
	return ((actual - target) / target) * 100;
}
