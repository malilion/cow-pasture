import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const defaultRoot = await realpath(new URL('../docs', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
export function createStaticHandler(root = defaultRoot) {
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    try {
      const url = new URL(request.url, 'http://localhost'), path = decodeURIComponent(url.pathname);
      let file = resolve(root, `.${path}`);
      if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403); response.end('Forbidden'); return; }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      file = await realpath(file);
      if (!file.startsWith(root + sep)) { response.writeHead(403); response.end('Forbidden'); return; }
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('無法取得檔案');
    }
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createServer(createStaticHandler());
  server.listen(Number(process.env.PORT ?? 5173), '0.0.0.0', () => console.log(`牧場已開門：http://localhost:${server.address().port}`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
