import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { breadth, changePct, decodeSnapshot, filterStocks, freshness, industryAggregates, isMarketHours, mood, pickStock, rankings, refreshDelay, snapshotStamp, sparkPoints, topMovers, vsIndex } from '../docs/js/logic.js';
import { detailMarkup } from '../docs/js/detail.js';
import { createSnapshot, industryMap, normalizeEod, parseMis } from '../scripts/lib/normalize.mjs';
import { escapeHtml, format, formatPrice, formatVolume, stockDetail, badges, pctText, tileColor, vsText } from '../docs/js/display.js';
const fixture = async name => JSON.parse(await readFile(new URL(`fixtures/${name}.sample.json`, import.meta.url), 'utf8'));
const [tse, otc, ti, oi, mis] = await Promise.all(['twse_STOCK_DAY_ALL', 'tpex_daily_close_quotes', 'twse_t187ap03_L', 'tpex_t187ap03_O', 'mis_getStockInfo'].map(fixture));
const map = industryMap(ti, oi), eod = [...normalizeEod(tse, 'tse', map), ...normalizeEod(otc, 'otc', map)];
const snapshot = createSnapshot({ eod, mis: parseMis(mis), generatedAt: '2026-11-06T01:41:01Z', misOk: 1 });
const stocks = decodeSnapshot(snapshot);

test('解碼 fixture 快照、計算百分比與對標大盤', () => {
  const q = stocks.find(s => s.code === '2330');
  assert.equal(q.ind, '半導體'); assert.equal(q.pct, changePct(2080, 2240)); assert.equal(q.fallback, false);
  assert.equal(q.vs, q.pct - changePct(38446.21, 41574.72));
  assert.equal(stocks.find(s => s.code === '0056').vs, null, '前一日收盤不對標今日指數');
  assert.throws(() => decodeSnapshot({ ...snapshot, v: 2 }));
});
test('缺價／前收／指數不計漲跌，不把未成交當下跌', () => {
  assert.equal(changePct(null, 100), null); assert.equal(changePct(100, 0), null); assert.equal(changePct(100, null), null);
  assert.equal(vsIndex({ price: 100, prev: 90 }, { price: null, prev: 100 }), null);
});
test('市場廣度與漲跌停使用當日限價', () => {
  const b = breadth(stocks);
  assert.equal(b.count, 15); assert.equal(b.up, 2); assert.equal(b.down, 13); assert.equal(b.flat, 0); assert.equal(b.limitDown, 1); assert.equal(b.limitUp, 0);
  assert.equal(b.up + b.down + b.flat + b.noTrade + b.unknown, b.count);
  const result = breadth([
    { price: 110, prev: 100, lu: 110, ld: 90 }, { price: 90, prev: 100, lu: 110, ld: 90 },
    { price: 100, prev: 100 }, { price: null, prev: 100 }, { price: 100, prev: null },
  ]);
  assert.deepEqual(result, { up: 1, down: 1, flat: 1, noTrade: 1, unknown: 1, limitUp: 1, limitDown: 1, count: 5, declinersRatio: 0.5, pastureIndex: 20 });
});
test('牧場茂盛度、牛數與文案依市場方向變化', () => {
  const green = mood(stocks, changePct(snapshot.indices.taiex.price, snapshot.indices.taiex.prev));
  assert.ok(green.g > 0.85 && green.g < 1); assert.equal(green.cowCount, 11); assert.equal(green.caption, '整片都是草原，牛群已定居');
  const flat = mood([{ price: 100, prev: 100 }], 0); assert.equal(flat.cowCount, 1); assert.equal(flat.caption, '平盤，牛在發呆');
  const red = mood([{ price: 101, prev: 100 }], 1); assert.equal(red.cowCount, 0); assert.equal(red.caption, '紅通通！牛都餓跑了');
  const tiny = mood([{ price: 100, prev: 100 }], -0.001); assert.equal(tiny.cowCount, 1); assert.equal(tiny.caption, '草長出來了…');
  assert.equal(mood([], null).cowCount, 0); assert.equal(mood([], null).caption, '等待資料，牧場準備中');
});
test('氣氛預覽不能修改任何股票報價', () => {
  const before = JSON.stringify(stocks);
  assert.equal(mood(stocks, -7, 'down').caption, '牛聞香而來');
  assert.equal(mood(stocks, 7, 'crash').cowCount, 12);
  assert.equal(mood(stocks, -7, 'flat').caption, '平盤，牛在發呆');
  assert.equal(mood(stocks, -7, 'up').cowCount, 0);
  assert.equal(JSON.stringify(stocks), before);
});
test('漲跌／成交量排序、ETF 與市場篩選，不在漲幅榜放下跌股', () => {
  assert.deepEqual(rankings(stocks, 'up').map(s => s.code), ['00679B', '2881']);
  assert.equal(rankings(stocks, 'down')[0].code, '3105');
  assert.equal(rankings(stocks, 'vol')[0].code, '0050');
  assert.ok(rankings(stocks, 'down', 'etf').every(s => s.etf));
  assert.ok(rankings(stocks, 'vol', 'otc').every(s => s.mkt === 'otc'));
  assert.ok(rankings(stocks, 'vol', 'all', 3).length === 3);
});
test('搜尋名稱／代碼，市場與漲跌篩選可疊加', () => {
  assert.equal(filterStocks(stocks, { query: ' 2330 ' })[0].name, '台積電');
  assert.equal(filterStocks(stocks, { query: '環球', market: 'otc', direction: 'down' })[0].code, '6488');
  assert.equal(filterStocks(stocks, { query: '環球', market: 'tse' }).length, 0);
  assert.equal(filterStocks(stocks, { market: 'etf' }).length, 6);
  assert.equal(filterStocks(stocks, { direction: 'up' }).length, 2);
});
test('產業等權平均、家數與對標加權指數', () => {
  const groups = industryAggregates(stocks, -2), semi = groups.find(s => s.name === '半導體');
  assert.equal(semi.count, 5); assert.equal(semi.down, 5);
  assert.equal(semi.avg, stocks.filter(s => s.ind === '半導體').reduce((n, s) => n + s.pct, 0) / 5);
  assert.equal(semi.vs, semi.avg + 2); assert.ok(groups[0].avg >= groups.at(-1).avg);
  assert.equal(industryAggregates([{ ind: '其他', price: null, prev: 100, pct: null }], null)[0].avg, null);
});
test('臺北市場刷新時間跨 UTC 日期、開盤收盤邊界與週末', () => {
  assert.equal(isMarketHours(new Date('2026-11-06T00:59:59Z')), false);
  assert.equal(isMarketHours(new Date('2026-11-06T01:00:00Z')), true);
  assert.equal(isMarketHours(new Date('2026-11-06T06:29:59Z')), true);
  assert.equal(isMarketHours(new Date('2026-11-06T06:30:00Z')), false);
  assert.equal(isMarketHours(new Date('2026-11-07T01:30:00Z')), false);
  assert.equal(isMarketHours(new Date('2026-11-08T17:00:00Z')), false, '臺北週一凌晨未開盤');
  assert.equal(refreshDelay(new Date('2026-11-06T01:30:00Z')), 60000);
  assert.equal(refreshDelay(new Date('2026-11-07T01:30:00Z')), 600000);
});
test('新鮮度區分擷取時間與行情日期、延遲、盤後模式', () => {
  const active = freshness(snapshot, new Date('2026-11-06T01:51:01Z'));
  assert.equal(active.age, 10); assert.equal(active.modeLabel, '盤中・約每 1–2 分鐘更新'); assert.equal(active.stale, false);
  assert.equal(freshness(snapshot, new Date('2026-11-06T06:20:00Z')).modeLabel, '收盤資料');
  assert.equal(freshness({ ...snapshot, mode: 'eod' }).modeLabel, '盤後資料（前一交易日收盤）');
  assert.equal(freshness(snapshot, new Date('2026-11-07T01:51:01Z')).stale, true);
  assert.equal(freshness({ ...snapshot, generatedAt: 'invalid' }).age, null);
  assert.equal(freshness(snapshot, new Date('2026-11-06T01:40:00Z')).age, 0);
});
test('手動更新戳記比較行情日期、報價與產生時間；首次載入及缺值穩定', () => {
  const input = Object.freeze({ marketDate: '2026-11-06', quoteTime: '09:40:10', generatedAt: '2026-11-06T01:41:01Z' });
  const before = snapshotStamp(input);
  assert.equal(snapshotStamp(null), ''); assert.equal(snapshotStamp(undefined), '');
  assert.notEqual(snapshotStamp(null), before, '首次成功載入不視為相同快照');
  assert.equal(snapshotStamp({ ...input }), before, '內容相同的新物件仍是相同快照');
  assert.equal(snapshotStamp({ ...input, meta: { fixture: true } }), before, '非時間欄位不影響戳記');
  for (const [field, value] of [['marketDate', '2026-11-09'], ['quoteTime', '09:41:00'], ['generatedAt', '2026-11-06T01:42:01Z']]) {
    assert.notEqual(snapshotStamp({ ...input, [field]: value }), before, field);
  }
  assert.equal(snapshotStamp({}), '||');
  assert.equal(snapshotStamp({ marketDate: null, quoteTime: null, generatedAt: null }), snapshotStamp({}));
  assert.equal(snapshotStamp({ marketDate: input.marketDate }), '2026-11-06||');
  assert.equal(snapshotStamp(input), before, '比較不修改原始資料');
});
test('格式化保留缺值、紅綠語意與跳脫來源名稱', () => {
  assert.equal(format(null), '—'); assert.equal(pctText(-1), '−1.00%');
  assert.equal(vsText(1.2), '贏大盤 +1.20 pp'); assert.equal(vsText(-1.2), '輸大盤 −1.20 pp');
  assert.equal(vsText(null), '大盤比較 —'); assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.notEqual(tileColor(-5), tileColor(5)); assert.equal(tileColor(null), '#bfc4b9');
});
test('MIS 個股日期較舊也不能對標當日指數，來源日期不會被重標', () => {
  const quotes = parseMis(mis); quotes.find(s => s.code === '2330').date = '2026-11-05';
  const result = createSnapshot({ eod, mis: quotes });
  const stock = decodeSnapshot(result).find(s => s.code === '2330');
  assert.equal(result.marketDate, '2026-11-06'); assert.equal(stock.date, '2026-11-05');
  assert.equal(stock.stale, true); assert.equal(stock.vs, null); assert.equal(stock.fallback, false);
});

test('價格最多兩位小數、指數兩位、成交量以整數張顯示', () => {
  assert.equal(formatPrice(2080), '2,080'); assert.equal(formatPrice(35.5), '35.5');
  assert.equal(formatPrice(35.58), '35.58'); assert.equal(formatPrice(35.589), '35.59');
  assert.equal(format(38446.2), '38,446.20');
  assert.equal(formatVolume(35566), '35,566'); assert.equal(formatVolume(45175.145), '45,175');
  assert.equal(formatPrice(null), '—'); assert.equal(formatVolume(null), '—');
  const stock = stocks.find(s => s.code === '2330');
  assert.doesNotMatch(badges(stock), /quote-badge/);
  assert.match(stockDetail(stock), /成交量 40,305 張/);
});

test('明細選股以完整代碼或市場鍵值比對，保留 ETF 的前導零', () => {
  assert.equal(pickStock(stocks, ' 2330 '), stocks.find(s => s.code === '2330'));
  assert.equal(pickStock(stocks, 'otc:6488')?.code, '6488');
  assert.equal(pickStock(stocks, '0050')?.code, '0050');
  for (const key of ['', null, '233', '50', '<script>']) assert.equal(pickStock(stocks, key), null);
});

test('異動焦點依絕對漲跌排序並包含正反向，缺值／平盤不列入且不修改輸入', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ code: String(i), pct: -20 + i }));
  rows.push({ code: 'up', pct: 1 }, { code: 'flat', pct: 0 }, { code: 'missing', pct: null }, { code: 'nan', pct: NaN });
  const before = structuredClone(rows), result = topMovers(rows);
  assert.equal(result.length, 8); assert.equal(result[0].pct, -20);
  assert.equal(result.at(-1).code, 'up');
  assert.deepEqual(rows, before);
  assert.equal(topMovers(rows, 1)[0].pct, -20);
  assert.deepEqual(topMovers(rows, 0), []);
  assert.deepEqual(topMovers([{ code: 'a', pct: 0 }, { code: 'b', pct: null }]), []);
  assert.deepEqual(topMovers([{ code: 'b', pct: -2 }, { code: 'a', pct: 2 }]).map(s => s.code), ['a', 'b']);
  assert.equal(topMovers(stocks).length, 8);
});

test('價位示意只使用存在的開高低與現價，可選前收；缺資料不產生路徑', () => {
  const quote = { prev: 100, open: 101, high: 105, low: 98, price: 103 }, before = { ...quote };
  const points = sparkPoints(quote);
  assert.deepEqual(points.map(p => p.value), [100, 101, 105, 98, 103]);
  assert.ok(points[2].y < points[3].y);
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 8 && p.x <= 312 && p.y >= 8 && p.y <= 92));
  assert.equal(sparkPoints({ ...quote, prev: null }).length, 4);
  for (const field of ['open', 'high', 'low', 'price']) {
    for (const missing of [null, undefined, NaN, 0, -1]) assert.deepEqual(sparkPoints({ ...quote, [field]: missing }), []);
  }
  assert.deepEqual(sparkPoints({ ...quote, high: 90 }), []);
  assert.deepEqual(sparkPoints(null), []);
  assert.ok(sparkPoints({ prev: 5, open: 5, high: 5, low: 5, price: 5 }).every(p => p.y === 50));
  assert.deepEqual(quote, before);
});

test('產業精確篩選與代碼／方向／市場條件可疊加', () => {
  assert.ok(filterStocks(stocks, { industry: '半導體' }).length > 0);
  assert.ok(filterStocks(stocks, { industry: '半導體' }).every(s => s.ind === '半導體'));
  assert.equal(filterStocks(stocks, { industry: '半導體', query: '2330', market: 'tse', direction: 'down' })[0].code, '2330');
  assert.equal(filterStocks(stocks, { industry: '不存在' }).length, 0);
});

test('明細不捏造個股時刻，價位示意有明確標示，來源字串均跳脫', () => {
  const stock = stocks.find(s => s.code === '2330');
  const html = detailMarkup({ ...stock, ind: '<img onerror="x">', est: 1 }, snapshot);
  assert.match(html, /今日價位區間示意（非分時圖）/);
  assert.match(html, /未提供個股時刻/);
  assert.match(html, /快照最新時刻不代表此檔成交時刻/);
  assert.match(html, /&lt;img onerror=&quot;x&quot;&gt;/);
  assert.match(html, /委買賣推估，非成交價/);
  assert.match(html, /漲停/); assert.match(html, /跌停/);
  assert.doesNotMatch(detailMarkup({ ...stock, open: null }, snapshot), /<svg/);
  assert.doesNotMatch(detailMarkup({ ...stock, price: null }, snapshot), /<svg/);
});
