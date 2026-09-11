export async function resolve(specifier, context, nextResolve) {
	const relative = specifier.startsWith('./') || specifier.startsWith('../');
	const hasExtension = /\.[a-z]+$/i.test(specifier);
	if (relative && !hasExtension) {
		try {
			return await nextResolve(`${specifier}.js`, context);
		} catch {
			// fall through and let the default resolver report the real error
		}
	}
	return nextResolve(specifier, context);
}
