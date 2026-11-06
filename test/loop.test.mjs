import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextSleep, pastUntil, shouldLoop } from '../scripts/lib/loop-policy.mjs';
import { runMarketLoop, seedLiveSnapshot } from '../scripts/market-loop.mjs';
const at = value => new Date(value);

test('臺北工作日 09:00–13:35 循環，收盤排程永遠單次', () => {
  for (const eventName of ['schedule', 'push', 'workflow_dispatch']) {
    assert.equal(shouldLoop({ now: at('2026-11-06T01:00:00Z'), eventName }), true);
    assert.equal(shouldLoop({ now: at('2026-11-06T05:34:59Z'), eventName }), true);
    for (const date of ['2026-11-06T00:59:59Z', '2026-11-06T05:35:00Z', '2026-11-06T15:00:00Z', '2026-11-07T01:00:00Z', '2026-11-08T01:00:00Z']) {
      assert.equal(shouldLoop({ now: at(date), eventName }), false);
    }
  }
  assert.equal(shouldLoop({ now: at('2026-11-06T01:00:00Z'), eventName: 'schedule', schedule: '20 6 * * 1-5' }), false);
});
test('截止時間與目標週期可設定；超時不追加睡眠', () => {
  assert.equal(pastUntil(at('2026-11-06T05:34:59Z')), false);
  assert.equal(pastUntil(at('2026-11-06T05:35:00Z')), true);
  assert.equal(pastUntil(at('2026-11-06T05:35:00Z'), '13:40'), false);
  assert.equal(nextSleep(40_000), 60_000);
  assert.equal(nextSleep(110_000), 0);
  assert.equal(nextSleep(10_000, { targetMs: 80_000, minMs: 90_000 }), 80_000);
  assert.throws(() => pastUntil(new Date(), '25:00'), /時間無效/);
  assert.throws(() => pastUntil(new Date(), '13'), /HH:MM/);
});
async function harness({ time = '2026-11-06T01:00:00Z', fail, env = {}, seed = async () => false, fetchDuration = 15_000, deployDuration = 10_000 } = {}) {
  let clock = Date.parse(time), checks = 0, attempts = 0;
  const fetches = [], deploys = [], sleeps = [], logs = [];
  const fixture = JSON.parse(await readFile(new URL('fixtures/mis_getStockInfo.sample.json', import.meta.url), 'utf8'));
  const result = await runMarketLoop({ env: { GITHUB_EVENT_NAME: 'push', ...env }, seed, now: () => clock,
    pause: async ms => { sleeps.push(ms); clock += ms; }, log: line => logs.push(line),
    fetcher: async options => { fetches.push(options); clock += fetchDuration; return { quoteTime: fixture.msgArray[0].t, generatedAt: new Date(clock).toISOString() }; },
    check: async () => { checks++; }, deploy: async options => {
      deploys.push(options); clock += deployDuration; attempts++;
      const failure = fail?.(attempts);
      if (failure) throw failure instanceof Error ? failure : new Error('fixture deployment failure');
    },
  });
  return { result, fetches, deploys, checks, sleeps, logs, clock };
}
test('首輪完整擷取且只檢查一次，後續 MIS-only；剩餘不足 80 秒不開始', async () => {
  const h = await harness();
  assert.deepEqual(h.fetches.map(f => f.quotesOnly), [false, true, true]);
  assert.equal(h.checks, 1); assert.equal(h.result.successes, 3);
  assert.deepEqual(h.sleeps, [75_000, 65_000]);
  assert.equal(h.logs.filter(line => line.includes('quoteTime')).length, 3);
  assert.deepEqual(h.fetches.map(f => f.budgetMs), [110_000, 110_000, 45_000]);
});
test('線上快照成功時首輪也僅更新 MIS，仍只檢查一次', async () => {
  const h = await harness({ env: { LIVE_SNAPSHOT_URL: 'https://example.com/snapshot.json' }, seed: async options => {
    assert.equal(options.url, 'https://example.com/snapshot.json');
    assert.ok(options.out.endsWith('/docs/data/snapshot.json'));
    return true;
  } });
  assert.deepEqual(h.fetches.map(f => f.quotesOnly), [true, true, true]);
  assert.equal(h.checks, 1);
});
test('線上快照以 GET 與 15 秒 timeout 載入並原子寫入，失敗保留舊檔', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cow-seed-'));
  const out = join(temp, 'data', 'snapshot.json');
  const snapshot = { v: 1, rows: [{ code: '2330' }] };
  const logs = [];
  const options = { out, url: 'https://example.com/snapshot.json', log: line => logs.push(line) };
  try {
    const timeout = AbortSignal.timeout;
    const durations = [];
    try {
      AbortSignal.timeout = ms => { durations.push(ms); return timeout(ms); };
      assert.equal(await seedLiveSnapshot({ ...options, fetcher: async (url, init) => {
        assert.equal(url, options.url);
        assert.equal(init.method, 'GET');
        assert.ok(init.signal instanceof AbortSignal);
        return { ok: true, json: async () => snapshot };
      } }), true);
    } finally { AbortSignal.timeout = timeout; }
    assert.deepEqual(durations, [15_000]);
    assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), snapshot);
    for (const fetcher of [
      async () => { throw new Error('offline'); },
      async () => ({ ok: false, status: 503 }),
      async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }),
      ...[null, { v: 2, rows: [1] }, { v: 1, rows: [] }, { v: 1, rows: { length: 1 } }]
        .map(value => async () => ({ ok: true, json: async () => value })),
    ]) {
      assert.equal(await seedLiveSnapshot({ ...options, fetcher }), false);
      assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), snapshot);
      assert.deepEqual(await readdir(join(temp, 'data')), ['snapshot.json']);
    }
    assert.ok(logs.some(line => line.includes('offline')));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('非盤中僅完整擷取、檢查、部署一次', async () => {
  const h = await harness({ time: '2026-11-07T01:00:00Z' });
  assert.equal(h.fetches.length, 1); assert.equal(h.checks, 1); assert.equal(h.result.successes, 1);
  assert.deepEqual(h.sleeps, []);
});
test('從 GITHUB_EVENT_PATH 辨識收盤 cron，即使測試時間在盤中也僅一次', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cow-loop-'));
  try {
    const path = join(temp, 'event.json'); await writeFile(path, JSON.stringify({ schedule: '20 6 * * 1-5' }));
    const h = await harness({ env: { GITHUB_EVENT_NAME: 'schedule', GITHUB_EVENT_PATH: path } });
    assert.equal(h.fetches.length, 1);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('首輪失敗回傳錯誤，後續失敗重試一次且保留先前成功', async () => {
  await assert.rejects(harness({ fail: () => true }), /fixture deployment failure/);
  const h = await harness({ fail: attempt => attempt === 2 });
  assert.equal(h.result.successes, 3); assert.equal(h.deploys.length, 4); assert.equal(h.checks, 1);
  assert.ok(h.sleeps.includes(5_000));
  const failed = await harness({ fail: attempt => attempt > 1 });
  assert.equal(failed.result.successes, 1); assert.equal(failed.deploys.length, 4);
});
test('跨過臺北截止時間後不開始新週期', async () => {
  const h = await harness({ time: '2026-11-06T05:34:50Z' });
  assert.equal(h.fetches.length, 1);
});
test('慢週期不睡眠，仍於 deadline 前停止', async () => {
  const h = await harness({ fetchDuration: 60_000, deployDuration: 50_000 });
  assert.equal(h.result.successes, 2); assert.deepEqual(h.sleeps, []);
});
test('後續部署無法取消時保留先前成功並停止迴圈', async () => {
  const h = await harness({ fail: attempt => attempt === 2 && Object.assign(new Error('pending cancellation'), { stopLoop: true }) });
  assert.equal(h.result.successes, 1); assert.equal(h.deploys.length, 2);
});
