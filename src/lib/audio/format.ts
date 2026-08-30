export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	const cs = Math.round((seconds - total) * 100);
	return `${m}:${String(s).padStart(2, '0')}.${String(Math.min(cs, 99)).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDb(db: number): string {
	if (!Number.isFinite(db)) return '-∞ dB';
	const sign = db > 0 ? '+' : '';
	return `${sign}${db.toFixed(1)} dB`;
}

export function formatHz(rate: number): string {
	return `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 1)} kHz`;
}

/** File name without its extension. */
export function baseName(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
}

/** Strips whatever breaks a file name on Windows. */
export function safeFileName(name: string): string {
	return (
		name
			.replace(/[\/:*?"<>|]+/g, '-')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 80) || 'stereo'
	);
}
