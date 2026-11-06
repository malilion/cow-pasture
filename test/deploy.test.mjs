import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveDocs, deployPages } from '../scripts/deploy-pages-once.mjs';
const exec = promisify(execFile);
const env = { GITHUB_REPOSITORY: 'fixture/cow-pasture', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };

test('Pages archive 為官方相容的未壓縮 tar，含隱藏檔與 .nojekyll，排除 git 並解參照連結', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cow-archive-'));
  try {
    const docs = join(temp, 'docs'); await mkdir(join(docs, '.git'), { recursive: true });
    await writeFile(join(docs, '.git', 'config'), 'excluded');
    await writeFile(join(docs, '.hidden'), 'included');
    await writeFile(join(docs, 'index.html'), await readFile(new URL('../docs/index.html', import.meta.url)));
    await symlink('index.html', join(docs, 'linked.html'));
    const archive = join(temp, 'artifact.tar'); await archiveDocs(docs, archive);
    const bytes = await readFile(archive); assert.notDeepEqual([...bytes.subarray(0, 2)], [0x1f, 0x8b]);
    const { stdout } = await exec('tar', ['-tf', archive]);
    assert.ok(stdout.includes('./.hidden') && stdout.includes('./.nojekyll') && stdout.includes('./index.html'));
    assert.ok(!stdout.includes('.git/'));
    const { stdout: detail } = await exec('tar', ['-tvf', archive]);
    assert.ok(detail.split('\n').filter(line => line.includes('linked.html')).every(line => line.startsWith('-')));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
function mocked({ statuses = ['succeed'], postError, cancelError } = {}) {
  const calls = [], uploads = [], outputs = [], logs = [];
  let clock = 0, index = 0;
  const clients = {
    artifact: { uploadArtifact: async (...args) => { uploads.push(args); return { id: 456 }; } },
    core: { getIDToken: async (...args) => { assert.deepEqual(args, []); return 'fixture-oidc'; }, setOutput: (...args) => outputs.push(args) },
    octokit: { request: async (route, payload) => {
      calls.push({ route, payload });
      if (route.endsWith('/cancel')) { if (cancelError) throw cancelError; return { data: {} }; }
      if (route.startsWith('POST')) { if (postError) throw postError; return { data: { id: 'deployment-1', page_url: 'https://fixture.github.io/cow-pasture/' } }; }
      return { data: { status: statuses[Math.min(index++, statuses.length - 1)] } };
    } },
  };
  const run = () => deployPages({ env, clients, now: () => clock, pause: async ms => { clock += ms; }, timeoutMs: 10_000,
    log: line => logs.push(line), pack: async (_docs, archive) => writeFile(archive, 'archive fixture') });
  return { run, calls, uploads, outputs, logs };
}
test('Pages 上傳使用獨立 artifact id、預設 OIDC audience，輪詢到成功並清理暫存', async () => {
  const h = mocked({ statuses: ['deployment_queued', 'deployment_in_progress', 'succeed'] });
  // Allow three status requests before the test deadline.
  const success = mocked({ statuses: ['deployment_queued', 'succeed'] });
  const result = await success.run();
  assert.equal(result.artifactId, 456); assert.equal(result.id, 'deployment-1');
  const [name, paths, root, options] = success.uploads[0];
  assert.match(name, /^github-pages-123-/); assert.equal(paths[0], join(root, 'artifact.tar'));
  assert.equal(options.retentionDays, 1);
  assert.equal(options.compressionLevel, 6);
  await assert.rejects(readFile(join(root, 'artifact.tar')), /ENOENT/);
  const payload = success.calls[0].payload;
  assert.equal(payload.artifact_id, 456); assert.equal(payload.oidc_token, 'fixture-oidc');
  assert.equal(payload.pages_build_version, '123-2-1');
  assert.deepEqual(success.outputs, [['page_url', 'https://fixture.github.io/cow-pasture/']]);
  assert.ok(success.calls.slice(1).every(call => call.route.startsWith('GET') && call.payload.deploymentId === 'deployment-1'));
  await h.run().then(() => assert.fail('expected timeout'), error => assert.match(error.message, /逾時/));
});
test('Pages 每次上傳唯一 artifact 名稱', async () => {
  const h = mocked(); await h.run(); await h.run();
  assert.notEqual(h.uploads[0][0], h.uploads[1][0]);
});
test('Pages 最終失敗狀態直接報錯；逾時則取消尚未結束部署', async () => {
  const failed = mocked({ statuses: ['deployment_content_failed'] });
  await assert.rejects(failed.run(), /deployment_content_failed/);
  assert.ok(!failed.calls.some(call => call.route.endsWith('/cancel')));
  const pending = mocked({ statuses: ['deployment_in_progress'] });
  await assert.rejects(pending.run(), /逾時/);
  assert.ok(pending.calls.at(-1).route.endsWith('/cancel'));
});
test('Pages rate limit 記錄並拋出，錯誤訊息不洩漏 OIDC payload', async () => {
  const h = mocked({ postError: Object.assign(new Error('fixture-oidc rate limit'), {
    status: 403, response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1234' } },
  }) });
  await assert.rejects(h.run(), /速率限制/);
  assert.ok(h.logs.some(line => line.includes('1234')));
  assert.ok(h.logs.every(line => !line.includes('fixture-oidc')));
});
test('無法確認取消時阻止迴圈重試，避免發起另一筆部署', async () => {
  const h = mocked({ statuses: ['deployment_in_progress'], cancelError: new Error('fixture network failure') });
  await assert.rejects(h.run(), error => error.stopLoop === true && /尚未確認取消/.test(error.message));
});
