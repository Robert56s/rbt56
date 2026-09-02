import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// 5173 is the usual Vite port and other projects sit on it, so this one
		// stays out of the way.
		port: Number(process.env.PORT) || 5666,
		strictPort: false
	}
});
