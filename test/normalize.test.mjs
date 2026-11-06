import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSnapshot, FIELDS, industryMap, marketDate, normalizeEod, normalizeMis, number, parseMis, validCode } from '../scripts/lib/normalize.mjs';
const fixture = async name => JSON.parse(await readFile(new URL(`fixtures/${name}.sample.json`, import.meta.url), 'utf8'));
const [tse, otc, ti, oi, mis] = await Promise.all(['twse_STOCK_DAY_ALL', 'tpex_daily_close_quotes', 'twse_t187ap03_L', 'tpex_t187ap03_O', 'mis_getStockInfo'].map(fixture));
const industries = industryMap(ti, oi);

test('股票與 ETF 代碼過濾，排除權證／債券／受益證券', () => {
  for (const code of ['2330', '6488', '0050', '006208', '00919', '00679B', '00400A']) assert.equal(validCode(code), true, code);
  for (const code of ['01001T', '020001', '700019', '2330A', 'B12345', '00', '12345', 't00']) assert.equal(validCode(code), false, code);
});
test('嚴格數字與民國日期，不誤解析除息等狀態字串', () => {
  assert.equal(number(' -1.53 '), -1.53); assert.equal(number('+0.51'), 0.51); assert.equal(number('1,234.50'), 1234.5);
  for (const input of ['---', '除息', '除權息', '', 'NaN', null, '1.3abc', 'Infinity']) assert.equal(number(input), null);
  assert.equal(marketDate('1151105'), '2026-11-05'); assert.equal(marketDate('115/11/05'), '2026-11-05');
  assert.equal(marketDate('20261106'), '2026-11-06'); assert.equal(marketDate('1150230'), null); assert.equal(marketDate('---'), null);
});
test('TWSE 盤後正規化、產業、前收與股數轉張', () => {
  const rows = normalizeEod(tse, 'tse', industries), q = rows.find(s => s.code === '2330');
  assert.equal(rows.length, tse.length - 1); assert.equal(q.ind, '半導體'); assert.equal(q.date, '2026-11-05');
  assert.equal(q.price, 2240); assert.equal(q.prev, 2260); assert.equal(q.vol, 45175.145); assert.equal(q.lu, null);
  assert.equal(rows.find(s => s.code === '00400A').ind, 'ETF');
});
test('TPEx 排除非目標商品、尾端空白 Change 與次日限價不可當當日限價', () => {
  const rows = normalizeEod(otc, 'otc', industries);
  assert.equal(rows.length, 6); assert.equal(rows.find(s => s.code === '006201').prev, 37.11);
  assert.equal(rows.find(s => s.code === '6488').ld, null);
  const special = normalizeEod([{ ...otc[0], Change: '除息' }, { ...otc[0], Close: '---', Change: '---' }], 'otc');
  assert.equal(special[0].price, 35.58); assert.equal(special[0].prev, null);
  assert.equal(special[1].price, null); assert.equal(special[1].prev, null);
});
test('MIS 可解析開頭空白行，最近成交回補不標估價，量單位為張', () => {
  const rows = parseMis(`\n\n${JSON.stringify(mis)}`), q = rows.find(s => s.code === '2330');
  assert.equal(q.price, 2080); assert.equal(q.est, 0); assert.equal(q.vol, 40305); assert.equal(q.prev, 2240);
  assert.equal(q.lu, 2460); assert.equal(q.ld, 2020); assert.equal(q.date, '2026-11-06');
  assert.equal(rows.find(s => s.code === 't00').price, 38446.21);
  assert.throws(() => parseMis({ rtcode: '5000', msgArray: [] }));
  assert.throws(() => parseMis({ rtcode: '0000' }));
});
test('MIS 有成交 z 優先，依序使用 trade.z／中點／單邊價／null', () => {
  const source = { c: '2330', ex: 'tse', y: '100', z: '102', trade: { z: '101' }, b: '0.0000_99_-', a: '-_103_0.0000' };
  assert.equal(normalizeMis(source).price, 102); assert.equal(normalizeMis(source).est, 0);
  const trade = normalizeMis({ ...source, z: '-' });
  assert.equal(trade.price, 101); assert.equal(trade.est, 0);
  const mid = normalizeMis({ ...source, z: '-', trade: null }); assert.equal(mid.price, 101); assert.equal(mid.est, 1);
  const bid = normalizeMis({ ...source, z: '-', trade: { z: '-' }, a: '-' });
  assert.equal(bid.price, 99); assert.equal(bid.est, 1);
  const ask = normalizeMis({ ...source, z: '-', trade: null, b: '-' });
  assert.equal(ask.price, 103); assert.equal(ask.est, 1);
  const empty = normalizeMis({ ...source, z: '-', trade: null, a: '0.0000', b: '-' });
  assert.equal(empty.price, null); assert.equal(empty.prev, 100); assert.equal(empty.est, 0);
});
test('快照保留真正未成交；缺 MIS 的個股才回補並附日期', () => {
  const eod = normalizeEod(tse, 'tse', industries);
  const live = parseMis(mis);
  live.find(s => s.code === '2330').price = null;
  const snapshot = createSnapshot({ eod, mis: live, misOk: 1 });
  assert.deepEqual(snapshot.fields, FIELDS); assert.equal(snapshot.mode, 'mis'); assert.equal(snapshot.marketDate, '2026-11-06');
  assert.equal(snapshot.quoteTime, '09:40:10');
  const q = snapshot.rows.find(s => s[0] === '2330'); assert.equal(q[5], null); assert.equal(q[6], 2240);
  assert.equal(snapshot.meta.fallbackCount, 5); assert.equal(snapshot.meta.fallbackDates['tse:0056'], '2026-11-05');
  assert.equal(snapshot.meta.count, snapshot.rows.length);
});
test('MIS 全失敗以盤後日期封裝，不合成指數與時間', () => {
  const snapshot = createSnapshot({ eod: normalizeEod(otc, 'otc', industries) });
  assert.equal(snapshot.mode, 'eod'); assert.equal(snapshot.marketDate, '2026-11-05'); assert.equal(snapshot.quoteTime, null);
  assert.equal(snapshot.indices.taiex.price, null); assert.equal(snapshot.indices.otc.time, null);
  assert.equal(snapshot.meta.fallbackCount, snapshot.meta.count);
});
