import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchMisQuotes, fetchSnapshot, requestJson, SOURCES } from '../scripts/fetch-snapshot.mjs';
import { decodeSnapshot } from '../docs/js/logic.js';
const fixtures = Object.fromEntries(await Promise.all(Object.entries({ tse: 'twse_STOCK_DAY_ALL', otc: 'tpex_daily_close_quotes', tseIndustry: 'twse_t187ap03_L', otcIndustry: 'tpex_t187ap03_O', mis: 'mis_getStockInfo' }).map(async ([key, file]) => [key, JSON.parse(await readFile(new URL(`fixtures/${file}.sample.json`, import.meta.url), 'utf8'))])));
const response = data => ({ ok: true, status: 200, text: async () => `\n\n${JSON.stringify(data)}` });
const pause = async () => {};
function transport({ misFails = false, allFail = false, missing = null, calls = [], onMis = null } = {}) {
  return async (url, options) => {
    const address = String(url), key = Object.keys(SOURCES).find(k => address.startsWith(SOURCES[k]));
    calls.push({ url: address, options });
    if (allFail || key === missing || key === 'mis' && misFails) throw new Error('fixture: blocked');
    return response(key === 'mis' && onMis ? onMis(new URL(url)) : fixtures[key]);
  };
}
async function withOutput(callback) {
  const out = await mkdtemp(join(tmpdir(), 'cow-pasture-test-'));
  try { return await callback(out); } finally { await rm(out, { recursive: true, force: true }); }
}

test('requestJson 15 秒 timeout、UA、兩次重試與退避，解析前去除空白', async () => {
  let calls = 0; const delays = [];
  const result = await requestJson('https://fixture.invalid', { pause: async ms => delays.push(ms), fetcher: async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal); assert.match(options.headers['User-Agent'], /Mozilla/);
    if (++calls < 3) return { ok: false, status: 503 };
    return response(fixtures.mis);
  } });
  assert.equal(calls, 3); assert.deepEqual(delays, [600, 1200]); assert.deepEqual(result, fixtures.mis);
});
test('快照抓取以真實 fixtures 寫出緊湊 JSON，完全離線', () => withOutput(async out => {
  const calls = [];
  const snapshot = await fetchSnapshot({ out, fetcher: transport({ calls }), pause, log: () => {} });
  assert.equal(snapshot.mode, 'mis'); assert.equal(snapshot.meta.count, 15); assert.equal(snapshot.meta.misOk, 1);
  assert.equal(snapshot.meta.fallbackCount, 9); assert.equal(calls.length, 5);
  assert.deepEqual(JSON.parse(await readFile(join(out, 'snapshot.json'), 'utf8')), snapshot);
  assert.equal(decodeSnapshot(snapshot).find(s => s.code === '2330').price, 2080);
}));
test('MIS 全失敗仍產生盤後快照且保留真實日期與缺指數', () => withOutput(async out => {
  const snapshot = await fetchSnapshot({ out, fetcher: transport({ misFails: true }), pause, log: () => {} });
  assert.equal(snapshot.mode, 'eod'); assert.equal(snapshot.meta.fallbackCount, 15);
  assert.equal(snapshot.marketDate, '2026-11-05'); assert.equal(snapshot.indices.taiex.price, null);
}));
test('全部來源失敗不覆寫既有快照，不把舊價格重標為今日', () => withOutput(async out => {
  await fetchSnapshot({ out, fetcher: transport(), pause, log: () => {} });
  const original = await readFile(join(out, 'snapshot.json'), 'utf8');
  await assert.rejects(fetchSnapshot({ out, fetcher: transport({ allFail: true }), pause, log: () => {} }), /保留上次部署/);
  assert.equal(await readFile(join(out, 'snapshot.json'), 'utf8'), original);
}));
test('無股票清單時只有兩個 MIS 指數也不能當成全市場成功', () => withOutput(async out => {
  await assert.rejects(fetchSnapshot({ out, fetcher: async url => {
    if (String(url).startsWith(SOURCES.mis)) return response({ ...fixtures.mis, msgArray: fixtures.mis.msgArray.filter(s => s.c === 't00' || s.c === 'o00') });
    throw new Error('blocked');
  }, pause, log: () => {} }), /無可用股票報價/);
}));
test('產業來源失敗仍能取得行情，缺少產業歸其他並記錄失敗來源', () => withOutput(async out => {
  const snapshot = await fetchSnapshot({ out, fetcher: transport({ missing: 'tseIndustry' }), pause, log: () => {} });
  assert.ok(snapshot.meta.failedSources.includes('tseIndustry'));
  assert.equal(decodeSnapshot(snapshot).find(s => s.code === '2330').ind, '其他');
}));
test('MIS 參數錯誤回應也會重試，不誤判為成功批次', () => withOutput(async out => {
  let attempts = 0;
  const fetcher = transport({ onMis: () => { attempts++; return attempts < 3 ? { rtcode: '5000', rtmessage: '參數不足' } : fixtures.mis; } });
  const snapshot = await fetchSnapshot({ out, fetcher, pause, log: () => {} });
  assert.equal(attempts, 3); assert.equal(snapshot.meta.misOk, 1);
}));
test('MIS 每批最多 120 代碼，循序處理、間隔 350ms 並容忍中段批次失敗', async () => {
  // Repeated real fixture symbols exercise transport capacity without inventing codes or quotes.
  const symbols = Array.from({ length: 251 }, (_, i) => {
    const row = fixtures.mis.msgArray[i % fixtures.mis.msgArray.length]; return `${row.ex}_${row.c}.tw`;
  });
  let attempt = 0, inFlight = 0; const delays = [], sizes = [];
  const fetcher = async url => {
    const channels = new URL(url).searchParams.get('ex_ch').split('|'); sizes.push(channels.length); attempt++;
    assert.equal(inFlight++, 0); await Promise.resolve(); inFlight--;
    if (attempt >= 2 && attempt <= 4) throw new Error('middle batch blocked');
    return response(fixtures.mis);
  };
  const result = await fetchMisQuotes(symbols, { fetcher, pause: async ms => delays.push(ms), log: () => {} });
  assert.equal(result.misOk, 2); assert.equal(attempt, 5);
  assert.deepEqual(sizes, [120, 120, 120, 120, 11]);
  assert.deepEqual(delays, [350, 600, 1200, 350]);
});
test('端點連續三批失敗即停止 MIS，避免耗盡部署時間', async () => {
  let attempts = 0;
  const result = await fetchMisQuotes(Array(480).fill('tse_2330.tw'), { fetcher: async () => { attempts++; throw new Error('blocked'); }, pause, log: () => {} });
  assert.equal(attempts, 9); assert.equal(result.misOk, 0);
});
test('MIS 預算耗盡時跳過請求，讓部署能使用盤後回補', async () => {
  let called = false;
  const result = await fetchMisQuotes(['tse_2330.tw'], { deadline: 0, fetcher: async () => { called = true; }, pause, log: () => {} });
  assert.equal(called, false); assert.equal(result.misOk, 0); assert.deepEqual(result.mis, []);
});

test('四個清單與產業來源同時啟動，不會循序等待', () => withOutput(async out => {
  const started = new Set();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const snapshotPromise = fetchSnapshot({ out, pause, log: () => {}, fetcher: async url => {
    const key = Object.keys(SOURCES).find(k => String(url).startsWith(SOURCES[k]));
    if (key !== 'mis') {
      started.add(key);
      await gate;
    }
    return response(fixtures[key]);
  } });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([...started].sort(), ['otc', 'otcIndustry', 'tse', 'tseIndustry']);
  } finally {
    release();
    await snapshotPromise;
  }
}));
