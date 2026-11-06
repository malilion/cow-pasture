export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const format = (value, digits = 2, minimum = digits) => Number.isFinite(value) ? value.toLocaleString('zh-TW', { minimumFractionDigits: minimum, maximumFractionDigits: digits }) : '—';
export const formatPrice = value => format(value, 2, 0);
export const formatVolume = value => format(value, 0);
export const signed = (value, digits = 2) => Number.isFinite(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value), digits)}` : '—';
export const pctText = value => Number.isFinite(value) ? `${signed(value)}%` : '—';
export const tone = value => value > 1e-8 ? 'up' : value < -1e-8 ? 'down' : 'flat';
export const vsText = value => !Number.isFinite(value) ? '大盤比較 —' : Math.abs(value) < 0.005 ? '持平大盤 0.00 pp' : `${value > 0 ? '贏' : '輸'}大盤 ${signed(value)} pp`;
export function tileColor(pct) {
  if (!Number.isFinite(pct)) return '#bfc4b9';
  if (Math.abs(pct) < 1e-8) return '#9da99c';
  const strength = Math.min(Math.abs(pct) / 10, 1);
  return pct > 0 ? `hsl(353, ${40 + strength * 15}%, ${69 - strength * 29}%)` : `hsl(145, ${24 + strength * 16}%, ${65 - strength * 35}%)`;
}
export function badges(stock) {
  return `${stock.est ? '<span class="quote-badge" title="委買賣推估，非成交價">估</span>' : ''}${stock.fallback ? `<span class="quote-badge" title="${escapeHtml(stock.date ?? '無可用日期')} 盤後資料">盤後 ${escapeHtml(stock.date ?? '缺資料')}</span>` : ''}${stock.stale && !stock.fallback ? `<span class="quote-badge">資料 ${escapeHtml(stock.date ?? '日期不明')}</span>` : ''}`;
}
export function stockDetail(stock) {
  return `<strong>${escapeHtml(stock.code)} ${escapeHtml(stock.name)}${badges(stock)}</strong><p>${stock.mkt === 'otc' ? '上櫃' : '上市'} · ${escapeHtml(stock.ind)}</p><p>${formatPrice(stock.price)} <b class="${tone(stock.pct)}">${pctText(stock.pct)}</b></p><p class="${tone(stock.vs)}">${vsText(stock.vs)}</p><p>前收 ${formatPrice(stock.prev)} · 成交量 ${formatVolume(stock.vol)} 張${stock.price === null ? ' · 未成交' : stock.pct === null ? ' · 缺比較基準' : ''}</p>`;
}
