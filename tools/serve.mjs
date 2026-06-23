// Tiny static server for local player testing. Mirrors the sandbox origin layout:
//   GET /{slug}/            -> examples/demo/index.html   (any prototype plays the demo)
//   GET /prototir.js[.map]  -> dist/prototir.js[.map]     (the built SDK)
// Run after `npm run build`. Default port 8080 (matches the API's Sandbox__BaseUrl).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT) || 8080;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json' };

async function send(res, file, status = 200) {
	const body = await readFile(file);
	const ext = file.slice(file.lastIndexOf('.'));
	res.writeHead(status, { 'content-type': types[ext] ?? 'application/octet-stream' });
	res.end(body);
}

const server = createServer(async (req, res) => {
	try {
		const path = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);

		if (path === '/prototir.js') return await send(res, join(root, 'dist/prototir.js'));
		if (path === '/prototir.js.map') return await send(res, join(root, 'dist/prototir.js.map'));

		// /{slug}/ or /{slug}/index.html -> the demo prototype
		if (/^\/[^/]+\/?(index\.html)?$/.test(path) && path !== '/') {
			return await send(res, join(root, 'examples/demo/index.html'));
		}

		res.writeHead(404, { 'content-type': 'text/plain' });
		res.end('not found');
	} catch (err) {
		res.writeHead(500, { 'content-type': 'text/plain' });
		res.end(String(err));
	}
});

server.listen(port, () => console.log(`prototir-sdk demo origin → http://localhost:${port}/{slug}/`));
