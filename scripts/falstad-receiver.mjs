// The other half of scripts/falstad-previews.js: serves a page that reads the
// previews from its own address and posts them back, writes each to
// static/guides/transistors/<id>.svg, then exits.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

// writes into this repository's static/guides/transistors/
const OUT = new URL('../static/guides/transistors/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const headers = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Allow-Private-Network': 'true'
};

const server = createServer((req, res) => {
	if (req.method === 'GET') {
		// a page that reads the data from its own address and posts it back here
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end('<!doctype html><meta charset="utf-8"><body><script>fetch("/save",{method:"POST",body:decodeURIComponent(location.hash.slice(1))}).then(r=>r.text()).then(t=>document.body.textContent=t)</script>');
		return;
	}
	if (req.method === 'OPTIONS') {
		res.writeHead(204, headers);
		res.end();
		return;
	}
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		try {
			const data = JSON.parse(body);
			let n = 0;
			for (const [id, svg] of Object.entries(data)) {
				if (!/^[a-z0-9-]+$/.test(id) || typeof svg !== 'string' || !svg.startsWith('<svg')) continue;
				writeFileSync(new URL(`${id}.svg`, OUT), svg + '\n');
				n++;
			}
			res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' });
			res.end(`wrote ${n}`);
			console.log(`wrote ${n} files`);
			setTimeout(() => process.exit(0), 200);
		} catch (e) {
			res.writeHead(400, headers);
			res.end(String(e));
		}
	});
});
server.listen(7789, () => console.log('listening on 7789'));
setTimeout(() => process.exit(1), 10 * 60 * 1000);
