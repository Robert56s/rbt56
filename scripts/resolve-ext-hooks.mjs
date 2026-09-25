export async function resolve(specifier, context, nextResolve) {
	const relative = specifier.startsWith('./') || specifier.startsWith('../');
	const hasExtension = /\.[a-z]+$/i.test(specifier);
	if (relative && !hasExtension && !specifier.endsWith('?raw')) {
		try {
			return await nextResolve(`${specifier}.js`, context);
		} catch {
			// fall through and let the default resolver report the real error
		}
	}
	return nextResolve(specifier, context);
}

// Vite's `import src from './x.js?raw'` (a module's own text, used by the
// tools that write out a standalone script): served as a string here too,
// so those generators can be run and checked from Node.
export async function load(url, context, nextLoad) {
	if (url.endsWith('?raw')) {
		const { readFile } = await import('node:fs/promises');
		const source = await readFile(new URL(url.slice(0, -'?raw'.length)), 'utf8');
		return { format: 'module', source: `export default ${JSON.stringify(source)};`, shortCircuit: true };
	}
	return nextLoad(url, context);
}
