export const FIELDS = ['code', 'name', 'mkt', 'ind', 'etf', 'price', 'prev', 'open', 'high', 'low', 'vol', 'est', 'lu', 'ld'];
export const INDUSTRIES = {
  '01': '水泥工業', '02': '食品工業', '03': '塑膠工業', '04': '紡織纖維', '05': '電機機械',
  '06': '電器電纜', '08': '玻璃陶瓷', '09': '造紙工業', '10': '鋼鐵工業', '11': '橡膠工業',
  '12': '汽車工業', '14': '建材營造', '15': '航運業', '16': '觀光餐旅', '17': '金融保險',
  '18': '貿易百貨', '19': '綜合', '20': '其他', '21': '化學工業', '22': '生技醫療',
  '23': '油電燃氣', '24': '半導體', '25': '電腦及週邊', '26': '光電', '27': '通信網路',
  '28': '電子零組件', '29': '電子通路', '30': '資訊服務', '31': '其他電子', '32': '文化創意',
  '33': '農業科技', '34': '電子商務', '35': '綠能環保', '36': '數位雲端',
  '37': '運動休閒', '38': '居家生活', '91': '存託憑證',
};
export const validCode = code => /^(\d{4}|00\d{2,4}[A-Z]?)$/.test(String(code));
export const round = value => Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : null;
export function number(value) {
  if (value == null || String(value).trim() === '') return null;
  const str = String(value).trim().replaceAll(',', '').replace('−', '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(str) ? round(Number(str)) : null;
}
export function price(value) {
  const n = number(value);
  return n > 0 ? n : null;
}
export function marketDate(value) {
  const str = String(value ?? '').trim().replaceAll('/', '').replaceAll('-', '');
  if (!/^\d{7,8}$/.test(str)) return null;
  const year = str.length === 7 ? Number(str.slice(0, 3)) + 1911 : Number(str.slice(0, 4));
  const month = str.slice(-4, -2), day = str.slice(-2);
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
export function industryMap(tse = [], otc = []) {
  const map = new Map();
  for (const row of tse) map.set(`tse:${row['公司代號']}`, INDUSTRIES[String(row['產業別']).padStart(2, '0')] ?? '其他');
  for (const row of otc) map.set(`otc:${row.SecuritiesCompanyCode}`, INDUSTRIES[String(row.SecuritiesIndustryCode).padStart(2, '0')] ?? '其他');
  return map;
}
export function normalizeEod(rows, mkt, industries = new Map()) {
  return rows.flatMap(row => {
    const tw = mkt === 'tse', code = String(tw ? row.Code : row.SecuritiesCompanyCode).trim();
    if (!validCode(code)) return [];
    const close = price(tw ? row.ClosingPrice : row.Close), change = number(row.Change);
    const shares = number(tw ? row.TradeVolume : row.TradingShares);
    return [{ code, name: String(tw ? row.Name : row.CompanyName).trim(), mkt,
      ind: code.startsWith('00') ? 'ETF' : industries.get(`${mkt}:${code}`) ?? '其他',
      etf: Number(code.startsWith('00')), price: close,
      prev: close !== null && change !== null ? price(round(close - change)) : null,
      open: price(tw ? row.OpeningPrice : row.Open), high: price(tw ? row.HighestPrice : row.High),
      low: price(tw ? row.LowestPrice : row.Low), vol: shares !== null && shares >= 0 ? round(shares / 1000) : null,
      est: 0, lu: null, ld: null, date: marketDate(row.Date), time: null }];
  });
}
const firstPrice = value => String(value ?? '').split('_').map(price).find(n => n !== null) ?? null;
export function normalizeMis(row) {
  let last = price(row.z) ?? price(row.trade?.z), est = 0;
  if (last === null) {
    const bid = firstPrice(row.b), ask = firstPrice(row.a);
    last = bid !== null && ask !== null ? round((bid + ask) / 2) : bid ?? ask;
    est = last === null ? 0 : 1;
  }
  const volume = number(row.v);
  return { code: row.c, name: row.n, mkt: row.ex, price: last, prev: price(row.y),
    open: price(row.o), high: price(row.h), low: price(row.l),
    vol: volume !== null && volume >= 0 ? volume : null, est, lu: price(row.u), ld: price(row.w),
    date: marketDate(row.d), time: /^\d{2}:\d{2}:\d{2}$/.test(row.t) ? row.t : null };
}
export function parseMis(body) {
  const parsed = typeof body === 'string' ? JSON.parse(body.trim()) : body;
  if (!parsed || (parsed.rtcode && parsed.rtcode !== '0000') || !Array.isArray(parsed.msgArray)) {
    throw new Error('MIS 回應格式錯誤');
  }
  return parsed.msgArray.filter(row => ['tse', 'otc'].includes(row.ex) &&
    (validCode(row.c) || row.c === 't00' || row.c === 'o00')).map(normalizeMis);
}
export function createSnapshot({ eod = [], mis = [], generatedAt = new Date().toISOString(), sources = [], misOk = 0, meta = {} }) {
  const byKey = new Map(mis.map(row => [`${row.mkt}:${row.code}`, row]));
  // An actual no-trade MIS row must remain no-trade, rather than becoming yesterday's close.
  const fallbackSymbols = [];
  const stocks = eod.map(row => {
    const key = `${row.mkt}:${row.code}`, quote = byKey.get(key);
    if (!quote) fallbackSymbols.push(key);
    return quote ? { ...row, ...quote, name: quote.name || row.name } : row;
  }).sort((a, b) => a.code.localeCompare(b.code) || a.mkt.localeCompare(b.mkt));
  const stockKeys = new Set(stocks.map(row => `${row.mkt}:${row.code}`));
  for (const quote of mis) {
    if (validCode(quote.code) && !stockKeys.has(`${quote.mkt}:${quote.code}`)) {
      stocks.push({ ...quote, etf: Number(quote.code.startsWith('00')), ind: quote.code.startsWith('00') ? 'ETF' : '其他' });
    }
  }
  const live = mis.filter(row => row.date), dates = (live.length ? live : stocks).map(row => row.date).filter(Boolean).sort();
  const date = dates.at(-1) ?? null;
  const quoteDates = Object.fromEntries(stocks.filter(row => row.date !== date).map(row => [`${row.mkt}:${row.code}`, row.date]));
  const fallbackKeys = new Set(fallbackSymbols);
  const times = live.filter(row => row.date === date).map(row => row.time).filter(Boolean).sort();
  const index = (code, name) => {
    const q = mis.find(row => row.code === code && row.date === date);
    return { name, price: q?.price ?? null, prev: q?.prev ?? null, open: q?.open ?? null,
      high: q?.high ?? null, low: q?.low ?? null, time: q?.time ?? null };
  };
  const industries = [...new Set(stocks.map(row => row.ind))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  return { v: 1, generatedAt, mode: live.length ? 'mis' : 'eod', marketDate: date,
    quoteTime: times.at(-1) ?? null, indices: { taiex: index('t00', '加權指數'), otc: index('o00', '櫃買指數') }, industries,
    fields: FIELDS, rows: stocks.map(row => FIELDS.map(field => field === 'ind' ? industries.indexOf(row.ind) : row[field] ?? null)),
    meta: { ...meta, count: stocks.length, misOk, fallbackCount: fallbackSymbols.length, fallbackSymbols, quoteDates,
      fallbackDates: Object.fromEntries(eod.filter(row => fallbackKeys.has(`${row.mkt}:${row.code}`)).map(row => [`${row.mkt}:${row.code}`, row.date])), sources } };
}
