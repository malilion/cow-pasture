export function changePct(price, prev) {
  return Number.isFinite(price) && Number.isFinite(prev) && prev > 0 ? (price - prev) / prev * 100 : null;
}
export function decodeSnapshot(snapshot) {
  if (snapshot.v !== 1 || !Array.isArray(snapshot.rows) || !Array.isArray(snapshot.fields) || !Array.isArray(snapshot.industries)) throw new Error('資料版本或格式不支援');
  const fallback = new Set(snapshot.meta?.fallbackSymbols ?? []);
  return snapshot.rows.map(row => {
    const stock = Object.fromEntries(snapshot.fields.map((field, i) => [field, row[i]]));
    stock.ind = snapshot.industries[stock.ind] ?? '其他';
    stock.key = `${stock.mkt}:${stock.code}`;
    stock.fallback = fallback.has(stock.key);
    const quoteDates = snapshot.meta?.quoteDates ?? {};
    stock.date = Object.hasOwn(quoteDates, stock.key) ? quoteDates[stock.key] : stock.fallback ? snapshot.meta?.fallbackDates?.[stock.key] ?? null : snapshot.marketDate;
    stock.stale = stock.date !== snapshot.marketDate;
    stock.pct = changePct(stock.price, stock.prev);
    const index = snapshot.indices[stock.mkt === 'otc' ? 'otc' : 'taiex'];
    stock.vs = stock.date === snapshot.marketDate ? vsIndex(stock, index) : null;
    return stock;
  });
}
export function vsIndex(stock, index) {
  const own = changePct(stock.price, stock.prev), benchmark = changePct(index?.price, index?.prev);
  return own === null || benchmark === null ? null : own - benchmark;
}
export function breadth(stocks) {
  const result = { up: 0, down: 0, flat: 0, noTrade: 0, unknown: 0, limitUp: 0, limitDown: 0, count: stocks.length };
  for (const stock of stocks) {
    const pct = changePct(stock.price, stock.prev);
    if (stock.price === null) result.noTrade++;
    else if (pct === null) result.unknown++;
    else if (pct > 1e-8) result.up++;
    else if (pct < -1e-8) result.down++;
    else result.flat++;
    if (stock.price !== null && stock.lu > 0 && stock.price >= stock.lu - 1e-6) result.limitUp++;
    if (stock.price !== null && stock.ld > 0 && stock.price <= stock.ld + 1e-6) result.limitDown++;
  }
  result.declinersRatio = result.up + result.down ? result.down / (result.up + result.down) : 0;
  result.pastureIndex = result.count ? result.down / result.count * 100 : 0;
  return result;
}
const clamp = x => Math.max(0, Math.min(1, x));
export function mood(stocks, taiexPct, scene = 'actual') {
  const b = breadth(stocks), actualG = clamp(-(taiexPct ?? 0) / 3) * 0.6 + clamp((b.declinersRatio - 0.5) * 2) * 0.4;
  const preview = { down: { g: 0.22, state: 'green' }, crash: { g: 1, state: 'green' }, flat: { g: 0, state: 'flat' }, up: { g: 0, state: 'red' } }[scene];
  const state = (taiexPct ?? 0) < 0 || b.down > b.up ? 'green' : (taiexPct ?? 0) > 0 || b.up > b.down ? 'red' : 'flat';
  const g = preview?.g ?? actualG, kind = preview?.state ?? state;
  const noData = scene === 'actual' && !stocks.length && taiexPct === null;
  const cowCount = noData || kind === 'red' ? 0 : kind === 'flat' ? 1 : Math.max(1, Math.round(g * 12));
  const caption = noData ? '等待資料，牧場準備中' : kind === 'red' ? '紅通通！牛都餓跑了' : kind === 'flat' ? '平盤，牛在發呆' :
    g < 0.2 ? '草長出來了…' : g < 0.45 ? '牛聞香而來' : g < 0.75 ? '牧場正式開張 🐄' : '整片都是草原，牛群已定居';
  return { g, state: kind, cowCount, caption, preview: Boolean(preview) };
}
export function filterStocks(stocks, { query = '', market = 'all', direction = 'all', industry = 'all' } = {}) {
  const text = query.trim().toLocaleLowerCase('zh-Hant');
  return stocks.filter(s => (!text || `${s.code} ${s.name}`.toLocaleLowerCase('zh-Hant').includes(text)) &&
    (market === 'all' || (market === 'etf' ? Boolean(s.etf) : s.mkt === market)) &&
    (industry === 'all' || s.ind === industry) &&
    (direction === 'all' || direction === 'up' && s.pct > 0 || direction === 'down' && s.pct < 0 || direction === 'flat' && s.pct === 0));
}
export function pickStock(stocks, selection) {
  const key = String(selection ?? '').trim();
  return key ? stocks.find(s => s.key === key || s.code === key) ?? null : null;
}
export function topMovers(stocks, limit = 8) {
  const sorted = stocks.filter(s => Number.isFinite(s.pct) && s.pct !== 0)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.code.localeCompare(b.code));
  const rows = sorted.slice(0, Math.max(0, limit));
  // Include the strongest opposite mover when one direction dominates the list.
  if (rows.length > 1 && rows.every(s => Math.sign(s.pct) === Math.sign(rows[0].pct))) {
    const opposite = sorted.find(s => Math.sign(s.pct) !== Math.sign(rows[0].pct));
    if (opposite) rows[rows.length - 1] = opposite;
  }
  return rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.code.localeCompare(b.code));
}
export function sparkPoints(stock) {
  const required = ['open', 'high', 'low', 'price'];
  if (!stock || required.some(field => !Number.isFinite(stock[field]) || stock[field] <= 0) || stock.high < stock.low) return [];
  const fields = Number.isFinite(stock.prev) && stock.prev > 0 ? ['prev', ...required] : required;
  const values = fields.map(field => stock[field]), min = Math.min(...values), range = Math.max(...values) - min;
  return fields.map((field, i) => ({ field, value: stock[field], x: 8 + i / (fields.length - 1) * 304,
    y: 8 + (range ? (min + range - stock[field]) / range : 0.5) * 84 }));
}
export function rankings(stocks, type = 'up', market = 'all', limit = 20) {
  return filterStocks(stocks, { market }).filter(s => type === 'vol' ? Number.isFinite(s.vol) : Number.isFinite(s.pct) && (type === 'up' ? s.pct > 0 : s.pct < 0))
    .sort((a, b) => (type === 'vol' ? b.vol - a.vol : type === 'down' ? a.pct - b.pct : b.pct - a.pct) || a.code.localeCompare(b.code)).slice(0, limit);
}
export function industryAggregates(stocks, taiexPct) {
  const groups = new Map();
  for (const stock of stocks) {
    if (!groups.has(stock.ind)) groups.set(stock.ind, []);
    groups.get(stock.ind).push(stock);
  }
  return [...groups].map(([name, rows]) => {
    const values = rows.map(s => s.pct).filter(Number.isFinite);
    const avg = values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : null;
    return { name, avg, vs: avg === null || taiexPct === null ? null : avg - taiexPct, ...breadth(rows) };
  }).sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity) || a.name.localeCompare(b.name, 'zh-Hant'));
}
export function taipeiParts(now = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
}
export function isMarketHours(now = new Date(), until = 14 * 60 + 30) {
  const p = taipeiParts(now), minutes = Number(p.hour) * 60 + Number(p.minute);
  return !['Sat', 'Sun'].includes(p.weekday) && minutes >= 9 * 60 && minutes < until;
}
export const refreshDelay = now => isMarketHours(now) ? 60_000 : 600_000;
export function freshness(snapshot, now = new Date()) {
  const elapsed = now.valueOf() - Date.parse(snapshot.generatedAt);
  const age = Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 60_000)) : null;
  const p = taipeiParts(now), today = `${p.year}-${p.month}-${p.day}`;
  const active = isMarketHours(now, 13 * 60 + 30) && snapshot.marketDate === today;
  return { age, ageLabel: age === null ? '更新時間不明' : age === 0 ? '剛剛更新' : `約 ${age.toLocaleString('zh-TW')} 分鐘前更新`,
    modeLabel: snapshot.mode === 'eod' ? '盤後資料（前一交易日收盤）' : active ? '盤中・約每 1–2 分鐘更新' : '收盤資料',
    stale: age === null || age > 30, dateLabel: `${snapshot.marketDate ?? '日期未提供'}${snapshot.quoteTime ? ` ${snapshot.quoteTime}` : '（未提供時間）'}` };
}

const validCode = code => typeof code === 'string' && /^(\d{4}|00\d{2,4}[A-Z]?)$/.test(code);
export function loadWatch(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? [...new Set(value.filter(validCode))].slice(0, 40) : [];
  } catch { return []; }
}
export function toggleWatch(list, code) {
  const clean = loadWatch(list);
  if (!validCode(code)) return clean;
  return clean.includes(code) ? clean.filter(x => x !== code) : [...clean, code].slice(0, 40);
}
export function parseCompare(raw) {
  return typeof raw === 'string' ? [...new Set(raw.split(',').map(s => s.trim()).filter(validCode))].slice(0, 2) : [];
}
export const formatCompare = list => parseCompare(Array.isArray(list) ? list.join(',') : '').join(',');
export const logoId = value => ['cute', 'fine', 'mature', 'lion'].includes(value) ? value : 'cute';
export function historySeries(history, key) {
  if (history?.v !== 1 || !Array.isArray(history.times)) return [];
  const values = history.series?.[key] ?? history.indices?.[key];
  return Array.isArray(values) && values.length === history.times.length ? values.map(x => Number.isFinite(x) ? x : null) : [];
}
export function sectorHistory(history, name) {
  return historySeries(history && { ...history, series: history.industries, indices: {} }, name);
}
export function linePoints(values) {
  if (!Array.isArray(values)) return [];
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [];
  const min = Math.min(...finite), range = Math.max(...finite) - min;
  return values.flatMap((value, i) => Number.isFinite(value) ? [{ value, x: 8 + (values.length > 1 ? i / (values.length - 1) : 0.5) * 304,
    y: 8 + (range ? 1 - (value - min) / range : 0.5) * 84 }] : []);
}
