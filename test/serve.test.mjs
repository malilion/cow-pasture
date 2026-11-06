import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStaticHandler } from '../scripts/serve.mjs';
async function request(url, method = 'GET', handler = createStaticHandler()) {
  const result = {};
  await handler({ url, method }, { writeHead(status, headers) { result.status = status; result.headers = headers; }, end(body) { result.body = body?.toString() ?? ''; } });
  return result;
}
test('靜態檔案處理器提供 HTML／ES modules／CSS／SVG 與正確 MIME', async () => {
  for (const [path, type] of [['/', 'text/html'], ['/js/app.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml'], ['/vendor/THREE_LICENSE.txt', 'text/plain']]) {
    const response = await request(path); assert.equal(response.status, 200); assert.ok(response.headers['Content-Type'].startsWith(type)); assert.ok(response.body.length > 0);
  }
});
test('靜態檔案處理器支援 HEAD／404 並限制路徑、無效 URL 與方法', async () => {
  assert.equal((await request('/missing.json')).status, 404);
  const head = await request('/', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.equal((await request('/', 'POST')).status, 405);
  assert.equal((await request('/%2e%2e%2fpackage.json')).status, 403);
  assert.equal((await request('/%zz')).status, 400);
});
test('JSON MIME 與符號連結不能超出根目錄，測試不需監聽網路', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cow-pasture-server-'));
  try {
    const body = await readFile(new URL('fixtures/mis_getStockInfo.sample.json', import.meta.url), 'utf8');
    await writeFile(join(root, 'snapshot.json'), body);
    await symlink(new URL('../package.json', import.meta.url).pathname, join(root, 'escape.json'));
    const handler = createStaticHandler(root), response = await request('/snapshot.json', 'GET', handler);
    assert.equal(response.status, 200); assert.match(response.headers['Content-Type'], /^application\/json/); assert.equal(response.body, body);
    assert.equal((await request('/escape.json', 'GET', handler)).status, 403);
  } finally { await rm(root, { recursive: true, force: true }); }
});
