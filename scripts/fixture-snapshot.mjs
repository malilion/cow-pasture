// Offline development uses the supplied real samples, explicitly labelled as incomplete historical data.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createSnapshot, industryMap, normalizeEod, parseMis } from './lib/normalize.mjs';
const read = async name => JSON.parse(await readFile(new URL(`../test/fixtures/${name}.sample.json`, import.meta.url), 'utf8'));
const [tse, otc, ti, oi, mis] = await Promise.all(['twse_STOCK_DAY_ALL', 'tpex_daily_close_quotes', 'twse_t187ap03_L', 'tpex_t187ap03_O', 'mis_getStockInfo'].map(read));
const industries = industryMap(ti, oi), quotes = parseMis(mis);
const snapshot = createSnapshot({ eod: [...normalizeEod(tse, 'tse', industries), ...normalizeEod(otc, 'otc', industries)], mis: quotes,
  generatedAt: '2026-11-06T01:41:01.000Z', misOk: 1,
  sources: ['test/fixtures/：交易所真實回應樣本'], meta: { fixture: true, incompleteUniverse: ['僅 fixtures 樣本，非全市場'] } });
const i = process.argv.indexOf('--out'), out = i >= 0 ? process.argv[i + 1] : 'docs/data';
await mkdir(out, { recursive: true });
await writeFile(`${out}/snapshot.json`, JSON.stringify(snapshot));
console.log(`已產生 ${snapshot.meta.count} 檔真實歷史樣本；介面將顯示樣本警示。`);
