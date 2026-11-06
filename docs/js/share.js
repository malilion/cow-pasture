import { breadth } from './logic.js';
import { escapeHtml as esc, format, formatPrice } from './display.js';
import { createDialogFocus } from './dialog.js';

export function marketCard(snapshot, stocks) {
  const b = breadth(stocks);
  const text = (x, y, size, value, color = '#24463d') => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}">${esc(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="今日牧場延遲快照"><rect width="1200" height="630" rx="32" fill="#f5f6ed"/><path d="M0 485Q240 370 530 492T1200 455V630H0Z" fill="#d7e7cf"/><g font-family="system-ui, sans-serif">${text(64, 85, 24, 'cow-pasture · 台股觀察日誌')}${text(64, 162, 54, '今日牧場觀測')}${text(64, 214, 24, `報價 ${snapshot.marketDate ?? '日期未提供'} ${snapshot.quoteTime ?? '時間未提供'}`)}${text(64, 294, 30, `加權指數  ${formatPrice(snapshot.indices?.taiex?.price)}`)}${text(630, 294, 30, `櫃買指數  ${formatPrice(snapshot.indices?.otc?.price)}`)}${text(64, 386, 34, `上漲 ${b.up}`, '#ad293e')}${text(420, 386, 34, `下跌 ${b.down}`, '#16704c')}${text(790, 386, 34, `平盤 ${b.flat}`)}${text(64, 470, 32, `牧場指數 ${format(b.pastureIndex, 1)}% · 下跌／全部檔數`)}${text(64, 542, 21, `未成交 ${b.noTrade} · 漲跌不明 ${b.unknown}${snapshot.meta?.fixture ? ' · 歷史樣本，非今日報價' : ''}`)}${text(64, 589, 22, '延遲快照，非即時逐筆行情，非投資建議。')}</g></svg>`;
}
export function createShare({ getSnapshot, getStocks }) {
  const $ = id => document.getElementById(id);
  const focus = createDialogFocus($('share-dialog'));
  let svg = '', snapshot;
  const status = message => { $('share-status').textContent = message; };
  function download(url, extension) {
    const a = document.createElement('a'); a.href = url; a.download = `cow-pasture-${snapshot.marketDate}.${extension}`; a.click();
  }
  $('share-market').addEventListener('click', () => {
    snapshot = getSnapshot(); if (!snapshot) return;
    svg = marketCard(snapshot, getStocks()); $('share-preview').innerHTML = svg; status(''); focus.show($('share-market'));
  });
  $('download-svg').addEventListener('click', () => {
    // Data URL also respects the existing img-src policy when previewed elsewhere.
    download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 'svg');
  });
  $('download-png').addEventListener('click', async () => {
    try {
      const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
      const context = canvas.getContext('2d'); if (!context) throw new Error('canvas');
      context.drawImage(img, 0, 0); download(canvas.toDataURL('image/png'), 'png'); status('已產生 PNG。');
    } catch { status('此瀏覽器無法轉為 PNG，請使用 SVG 下載。'); }
  });
  $('native-share').addEventListener('click', async () => {
    const url = new URL(location.href); url.search = ''; url.hash = '';
    try {
      if (!navigator.share) { status(`分享網址：${url}`); return; }
      await navigator.share({ title: '今日牧場', text: `${snapshot.marketDate ?? ''} ${snapshot.quoteTime ?? ''} 台股牧場延遲快照，非投資建議。`, url: String(url) });
    } catch { status('分享未完成，仍可下載卡片。'); }
  });
}
