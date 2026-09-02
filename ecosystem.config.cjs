// pm2 config. The .cjs extension matters: package.json sets "type": "module",
// so a plain .js file would be parsed as ESM and module.exports would fail.
module.exports = {
	apps: [
		{
			name: 'rbt56',
			script: 'build/index.js',
			env: {
				NODE_ENV: 'production',
				PORT: 5666
				// Once nginx or Caddy sits in front, add:
				// HOST: '127.0.0.1',
				// ORIGIN: 'https://rbt56.example'
			}
		}
	]
};
