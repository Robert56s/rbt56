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
	const abs = Math.abs(value);
	const entry = SI.find((e) => abs >= 10 ** e.exp * 0.999) ?? SI[SI.length - 1];
	const scaled = value / 10 ** entry.exp;
	const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
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
