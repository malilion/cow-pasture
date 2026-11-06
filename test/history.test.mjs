import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendHistory, appendHistoryFile, seedLiveHistory, validHistory } from '../scripts/lib/history.mjs';
import { runCycle } from '../scripts/run-cycle.mjs';
import { createSnapshot, normalizeEod } from '../scripts/lib/normalize.mjs';
import { breadth, decodeSnapshot, historySeries, industryAggregates, linePoints, sectorHistory } from '../docs/js/logic.js';
const rows = JSON.parse(await readFile(new URL('fixtures/twse_STOCK_DAY_ALL.sample.json', import.meta.url)));
const snapshot = createSnapshot({ eod: normalizeEod(rows, 'tse'), generatedAt: '2026-11-06T01:41:01Z' });

test('盤中歷史逐項忠實保存快照、等權平均與 null；新舊股票缺點補 null', () => {
  const input = structuredClone(snapshot);
  input.indices.taiex.price = null;
  input.rows[0][input.fields.indexOf('price')] = null;
  const stocks = decodeSnapshot(input), h = appendHistory(null, input);
  assert.ok(validHistory(h));
  assert.equal(h.indices.taiex[0], null);
  for (const s of stocks) assert.deepEqual(h.series[s.key], [s.price]);
  for (const group of industryAggregates(stocks, null)) assert.deepEqual(h.industries[group.name], [group.avg]);
  assert.deepEqual(h.breadth.up, [breadth(stocks).up]);
  const next = { ...input, rows: input.rows.slice(1), generatedAt: '2026-11-06T01:42:01Z' };
  const h2 = appendHistory(h, next);
  assert.equal(h2.series[stocks[0].key][1], null);
  const h3 = appendHistory(h2, { ...input, generatedAt: '2026-11-06T01:43:01Z' });
  assert.deepEqual(h3.series[stocks[0].key], [null, null, null]);
  const newStock = appendHistory(appendHistory(null, next), input);
  assert.equal(newStock.series[stocks[0].key][0], null);
  assert.deepEqual(h.times, [input.quoteTime], '不修改原歷史');
});
test('歷史相同報價時間與產生時間去重、日期重設、所有陣列最多 200 點', () => {
  let h = appendHistory(null, snapshot);
  assert.equal(appendHistory(h, snapshot), h);
  for (let i = 0; i < 205; i++) h = appendHistory(h, { ...snapshot, generatedAt: `sample-${i}` });
  assert.equal(h.times.length, 200); assert.equal(h.generatedAt[0], 'sample-5'); assert.ok(validHistory(h));
  const fresh = appendHistory(h, { ...snapshot, marketDate: '2026-11-09' });
  assert.equal(fresh.times.length, 1); assert.equal(fresh.marketDate, '2026-11-09');
  assert.equal(appendHistory({ v: 2 }, snapshot).times.length, 1);
});
test('原子寫入與線上 seed：驗證格式、15 秒 timeout、既有／競態本機檔優先、失敗忽略', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cow-history-')), path = join(directory, 'history.json');
  try {
    const h = appendHistory(null, snapshot);
    assert.equal(await seedLiveHistory({ out: path, fetcher: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal); return { ok: true, json: async () => h };
    } }), true);
    assert.equal(await seedLiveHistory({ out: path, fetcher: () => assert.fail('已有本機檔') }), false);
    await appendHistoryFile({ path, snapshot: { ...snapshot, generatedAt: 'next' } });
    assert.equal(JSON.parse(await readFile(path)).times.length, 2);
    await rm(path);
    for (const data of [{ v: 2 }, { v: 1, marketDate: 'bad' }]) assert.equal(await seedLiveHistory({ out: path, fetcher: async () => ({ ok: true, json: async () => data }) }), false);
    assert.equal(await seedLiveHistory({ out: path, fetcher: async () => { throw new Error('offline'); } }), false);
    assert.equal(await seedLiveHistory({ out: path, fetcher: async () => {
      await writeFile(path, 'newer local'); return { ok: true, json: async () => h };
    } }), false);
    assert.equal(await readFile(path, 'utf8'), 'newer local');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('兩輪皆在擷取之後追加歷史，僅首輪 seed／檢查', async () => {
  const calls = [];
  for (const cycle of [1, 2]) await runCycle({ cycle, seed: async () => false,
    seedHistory: async () => calls.push('seedHistory'), fetcher: async () => { calls.push('fetch'); return snapshot; },
    append: async options => { assert.equal(options.snapshot, snapshot); calls.push('append'); }, check: async () => calls.push('check'), log: () => {} });
  assert.deepEqual(calls, ['seedHistory', 'fetch', 'append', 'check', 'fetch', 'append']);
});
test('歷史取值與線段忽略 null、保留時間間距、平盤居中且不產生 NaN', () => {
  const h = { v: 1, times: ['a', 'b', 'c'], series: { 'tse:2330': [10, null, 20] }, indices: { taiex: [null, 2, 3] }, industries: { 半導體: [-1, null, 1] } };
  assert.deepEqual(historySeries(h, 'tse:2330'), [10, null, 20]);
  assert.deepEqual(historySeries(h, 'taiex'), [null, 2, 3]);
  assert.deepEqual(sectorHistory(h, '半導體'), [-1, null, 1]);
  assert.deepEqual(historySeries(null, 'x'), []); assert.deepEqual(historySeries(h, 'missing'), []);
  assert.deepEqual(linePoints([null, NaN]), []);
  assert.deepEqual(linePoints([10, null, 20]).map(p => [p.x, p.y]), [[8, 92], [312, 8]]);
  assert.equal(linePoints([5, 5])[0].y, 50);
});
