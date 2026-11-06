import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveDocs, deployPages, getPagesOIDCToken } from '../scripts/deploy-pages-once.mjs';
const exec = promisify(execFile);
const env = { GITHUB_REPOSITORY: 'fixture/cow-pasture', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };
const oidcEnv = { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://runner.example/token?api-version=2.0',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-request-token' };

test('OIDC 優先直接 GET runner endpoint，保留查詢參數並明確指定 owner audience', async () => {
  const token = await getPagesOIDCToken({ owner: 'fixture', env: oidcEnv,
    core: { getIDToken: async () => assert.fail('must use raw fetch') },
    fetcher: async (url, init) => {
      assert.equal(url, `${oidcEnv.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=https%3A%2F%2Fgithub.com%2Ffixture`);
      assert.equal(init.method, 'GET');
      assert.deepEqual(init.headers, { Authorization: 'Bearer fixture-request-token' });
      assert.ok(init.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ value: 'fixture-oidc' }) };
    },
  });
  assert.equal(token, 'fixture-oidc');
});
test('OIDC 僅在 runner 環境變數缺少時回退 toolkit，audience 相同', async () => {
  for (const missing of Object.keys(oidcEnv)) {
    const token = await getPagesOIDCToken({ owner: 'fixture', env: { ...oidcEnv, [missing]: undefined },
      fetcher: async () => assert.fail('must use toolkit fallback'),
      core: { getIDToken: async audience => {
        assert.equal(audience, 'https://github.com/fixture'); return 'fallback-oidc';
      } },
    });
    assert.equal(token, 'fallback-oidc');
  }
});
test('OIDC endpoint 失敗、無效 JSON 或空 token 明確報錯且不回退、不輸出憑證', async () => {
  for (const [fetcher, message] of [
    [async () => { throw new Error('fixture-request-token'); }, /網路錯誤或逾時/],
    [async () => ({ ok: false, status: 403 }), /HTTP 403/],
    [async () => ({ ok: true, json: async () => { throw new Error('fixture-request-token'); } }), /有效 JSON/],
    ...[{}, { value: '' }, { value: '  ' }, { value: 123 }].map(body =>
      [async () => ({ ok: true, json: async () => body }), /token 為空/]),
  ]) {
    await assert.rejects(getPagesOIDCToken({ owner: 'fixture', env: oidcEnv, fetcher,
      core: { getIDToken: async () => assert.fail('must not fall back after endpoint failure') },
    }), error => message.test(error.message) && !error.message.includes('fixture-request-token'));
  }
  await assert.rejects(getPagesOIDCToken({ owner: 'fixture', env: {},
    core: { getIDToken: async () => '' } }), /token 為空/);
});

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
function mocked({ statuses = ['succeed'], postError, cancelError, artifactId = 456,
  deployEnv = env, fetcher } = {}) {
  const calls = [], uploads = [], outputs = [], logs = [];
  let clock = 0, index = 0;
  const clients = {
    artifact: { uploadArtifact: async (...args) => { uploads.push(args); return { id: artifactId }; } },
    core: { getIDToken: async (...args) => { assert.deepEqual(args, ['https://github.com/fixture']); return 'fixture-oidc'; }, setOutput: (...args) => outputs.push(args) },
    octokit: { request: async (route, payload) => {
      calls.push({ route, payload });
      if (route.endsWith('/cancel')) { if (cancelError) throw cancelError; return { data: {} }; }
      if (route.startsWith('POST')) { if (postError) throw postError; return { data: { id: 'deployment-1', page_url: 'https://fixture.github.io/cow-pasture/' } }; }
      return { data: { status: statuses[Math.min(index++, statuses.length - 1)] } };
    } },
  };
  const run = () => deployPages({ env: deployEnv, clients, fetcher, now: () => clock, pause: async ms => { clock += ms; }, timeoutMs: 10_000,
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
test('Pages 以 raw OIDC token 與 JSON number artifact_id 建立部署，支援超過 32 位元的字串 id', async () => {
  let requests = 0;
  const h = mocked({ artifactId: '13473960691', deployEnv: { ...env, ...oidcEnv }, fetcher: async () => {
    requests++; return { ok: true, json: async () => ({ value: 'raw-oidc' }) };
  } });
  const result = await h.run();
  const payload = JSON.parse(JSON.stringify(h.calls[0].payload));
  assert.equal(requests, 1);
  assert.equal(payload.artifact_id, 13473960691);
  assert.equal(typeof payload.artifact_id, 'number');
  assert.equal(payload.oidc_token, 'raw-oidc');
  assert.equal(result.artifactId, 13473960691);
});
test('Pages 無效 artifact id 或空 OIDC token 不會送出部署 API', async () => {
  for (const artifactId of [null, '', 'invalid', '0', '-1', '1.5', '9007199254740992']) {
    const h = mocked({ artifactId });
    await assert.rejects(h.run(), /有效的數字 id/);
    assert.equal(h.calls.length, 0);
  }
  const empty = mocked({ deployEnv: { ...env, ...oidcEnv },
    fetcher: async () => ({ ok: true, json: async () => ({ value: '' }) }) });
  await assert.rejects(empty.run(), /token 為空/);
  assert.equal(empty.calls.length, 0);
  await assert.rejects(readFile(join(empty.uploads[0][2], 'artifact.tar')), /ENOENT/);
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
test('Pages 404 記錄 status、response data 與 request id，遮蔽所有 token 欄位及回顯的憑證', async () => {
  const data = { message: 'Not Found; echoed fixture-oidc and github-secret',
    oidc_token: 'fixture-oidc', nested: { access_token: 'other-secret', Authorization: 'Bearer hidden' },
    errors: [{ token: 'another-secret' }], documentation_url: 'https://docs.github.com/rest/pages' };
  for (const body of [data, JSON.stringify(data)]) {
    const h = mocked({ deployEnv: { ...env, GITHUB_TOKEN: 'github-secret' },
      postError: Object.assign(new Error('fixture-oidc'), { status: 404,
        response: { data: body, headers: { 'x-github-request-id': 'request-404' } } }),
    });
    await assert.rejects(h.run(), /404/);
    const logs = h.logs.join('\n');
    assert.match(logs, /HTTP 404/); assert.match(logs, /request-404/);
    assert.match(logs, /Not Found/); assert.match(logs, /documentation_url/);
    assert.match(logs, /\[REDACTED\]/);
    for (const secret of ['fixture-oidc', 'github-secret', 'other-secret', 'Bearer hidden', 'another-secret']) {
      assert.ok(!logs.includes(secret));
    }
  }
});
test('無法確認取消時阻止迴圈重試，避免發起另一筆部署', async () => {
  const h = mocked({ statuses: ['deployment_in_progress'], cancelError: new Error('fixture network failure') });
  await assert.rejects(h.run(), error => error.stopLoop === true && /尚未確認取消/.test(error.message));
});
