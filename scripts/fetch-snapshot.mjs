import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createSnapshot, industryMap, normalizeEod, parseMis, validCode } from './lib/normalize.mjs';

export const SOURCES = {
  tse: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  otc: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
  tseIndustry: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
  otcIndustry: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',
  mis: 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp',
};
export async function requestJson(url, { fetcher = fetch, pause = sleep, validate = value => value, deadline = Infinity } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('已達 MIS 擷取時間預算');
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, remaining))), headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CowPasture/1.0; Taiwan market dashboard)',
        Accept: 'application/json', Referer: 'https://mis.twse.com.tw/stock/index.jsp',
      } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return validate(JSON.parse((await response.text()).trim()));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await pause(Math.max(0, Math.min(600 * 2 ** attempt, deadline - Date.now())));
    }
  }
  throw lastError;
}
export async function fetchMisQuotes(symbols, { fetcher = fetch, pause = sleep, log = console.log, deadline = Date.now() + 330_000 } = {}) {
  const mis = [], batches = Math.ceil(symbols.length / 120);
  let misOk = 0, consecutiveFailures = 0;
  for (let offset = 0; offset < symbols.length; offset += 120) {
    if (Date.now() >= deadline) { log('MIS 已達擷取時間預算，剩餘股票採盤後回補。'); break; }
    if (offset) await pause(350);
    const url = new URL(SOURCES.mis);
    url.search = new URLSearchParams({ json: '1', delay: '0', ex_ch: symbols.slice(offset, offset + 120).join('|') });
    try {
      const quotes = await requestJson(url, { fetcher, pause, deadline, validate: value => {
        const rows = parseMis(value);
        if (!rows.length) throw new Error('MIS 無有效報價');
        return rows;
      } });
      mis.push(...quotes); misOk++; consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;
      log(`MIS 批次 ${offset / 120 + 1}/${batches} 失敗：${error.message}`);
      // Avoid exhausting the eight-minute deployment window when the entire endpoint is blocked.
      if (consecutiveFailures >= 3) { log('MIS 連續三批失敗，剩餘股票採盤後回補。'); break; }
    }
  }
  return { mis, misOk };
}
export async function fetchSnapshot({ out = 'docs/data', fetcher = fetch, pause = sleep, log = console.log } = {}) {
  const started = Date.now(), request = url => requestJson(url, { fetcher, pause });
  const results = await Promise.allSettled(['tse', 'otc', 'tseIndustry', 'otcIndustry'].map(async key => {
    const rows = await request(SOURCES[key]);
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${key}: 空白或無效資料`);
    return rows;
  }));
  const value = i => results[i].status === 'fulfilled' ? results[i].value : [];
  const industries = industryMap(value(2), value(3));
  const eod = [...normalizeEod(value(0), 'tse', industries), ...normalizeEod(value(1), 'otc', industries)];
  const missingMarkets = ['tse', 'otc'].filter(mkt => !eod.some(row => row.mkt === mkt));
  const failedSources = results.flatMap((r, i) => r.status === 'rejected' ? [Object.keys(SOURCES)[i]] : []);
  // A previous local artifact can supply the universe if an OpenAPI endpoint is temporarily unavailable.
  try {
    const previous = JSON.parse(await readFile(resolve(out, 'snapshot.json'), 'utf8'));
    const available = new Set(eod.map(row => row.mkt));
    for (const row of previous.rows) {
      const q = Object.fromEntries(previous.fields.map((field, i) => [field, row[i]]));
      if (!available.has(q.mkt)) eod.push({ ...q, ind: previous.industries[q.ind], price: null, prev: null,
        open: null, high: null, low: null, vol: null, est: 0, lu: null, ld: null, date: null, time: null });
    }
  } catch { /* First run has no local artifact. */ }
  const symbols = ['tse_t00.tw', 'otc_o00.tw', ...eod.map(row => `${row.mkt}_${row.code}.tw`)];
  const { mis, misOk } = await fetchMisQuotes(symbols, { fetcher, pause, log });
  const batches = Math.ceil(symbols.length / 120);
  const snapshot = createSnapshot({ eod, mis, misOk, sources: Object.values(SOURCES), meta: {
    failedSources, incompleteUniverse: missingMarkets,
  } });
  const usableEod = eod.some(row => row.date && (row.price !== null || row.vol === 0));
  const usableMis = mis.some(row => validCode(row.code) && row.date);
  if (!snapshot.rows.length || (!usableEod && !usableMis)) throw new Error('MIS 與盤後資料皆無可用股票報價；保留上次部署。');
  await mkdir(out, { recursive: true });
  const target = resolve(out, 'snapshot.json'), temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(snapshot));
  await rename(temp, target);
  log(`${snapshot.meta.count} 檔 | MIS ${misOk}/${batches} 批次 | 回補 ${snapshot.meta.fallbackCount} 檔 | ${snapshot.mode} | ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
  return snapshot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), index = args.indexOf('--out');
  fetchSnapshot({ out: index >= 0 ? args[index + 1] : 'docs/data' }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
