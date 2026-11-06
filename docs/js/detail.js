import { historySeries, linePoints, pickStock, sparkPoints } from './logic.js';
import { badges, escapeHtml as esc, formatPrice, formatVolume, pctText, tone, vsText } from './display.js';

export function detailMarkup(stock, snapshot, history = null, watched = false) {
  const labels = { prev: '前收', open: '開盤', high: '最高', low: '最低', price: '現價' };
  const points = sparkPoints(stock);
  const intraday = linePoints(historySeries(history, stock.key));
  const historyLabel = '今日盤中走勢（依快照累積，約每 1–2 分鐘一點，非逐筆分時）';
  const value = (label, content) => `<div><dt>${label}</dt><dd>${content}</dd></div>`;
  return `<p class="detail-market">${stock.mkt === 'otc' ? '上櫃' : '上市'} · ${esc(stock.ind)}${stock.etf ? ' · ETF' : ''}</p>
    <p>${badges(stock)}</p>
    <div class="detail-actions"><button type="button" data-watch="${esc(stock.code)}" aria-pressed="${watched}">${watched ? '移出觀察' : '加入觀察'}</button><button type="button" data-compare="${esc(stock.code)}">加入比較</button></div>
    <div class="detail-price"><strong>${formatPrice(stock.price)}</strong><b class="${tone(stock.pct)}">${pctText(stock.pct)}</b></div>
    <p class="${tone(stock.vs)}">${vsText(stock.vs)}</p>
    ${stock.price === null ? '<p class="quiet">目前未成交，價格未提供。</p>' : ''}
    <dl class="detail-values">${value('成交量（張）', formatVolume(stock.vol))}${value('前收', formatPrice(stock.prev))}${value('開盤', formatPrice(stock.open))}${value('最高', formatPrice(stock.high))}${value('最低', formatPrice(stock.low))}${value('漲停', formatPrice(stock.lu))}${value('跌停', formatPrice(stock.ld))}</dl>
    ${intraday.length >= 2 ? `<figure class="detail-spark"><svg viewBox="0 0 320 108" role="img" aria-label="${historyLabel}"><polyline points="${intraday.map(p => `${p.x},${p.y}`).join(' ')}"/></svg><figcaption>${historyLabel}</figcaption></figure>` : points.length ? `<figure class="detail-spark"><svg viewBox="0 0 320 108" role="img" aria-label="今日價位區間示意（非分時圖）"><polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}"/>${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3"><title>${labels[p.field]} ${formatPrice(p.value)}</title></circle>`).join('')}</svg><figcaption>今日價位區間示意（非分時圖）</figcaption><p class="fine-print">${points.map(p => `${labels[p.field]} ${formatPrice(p.value)}`).join(' → ')}<br>依上述欄位排列，非價格發生順序。</p></figure>` : '<p class="quiet">開高低或現價缺漏，暫無價位區間示意。</p>'}
    <div class="detail-time"><p>個股報價時間：${esc(stock.date ?? '日期未提供')} ${esc(stock.time ?? '（未提供個股時刻）')}</p><p>快照最新報價：${esc(snapshot.marketDate ?? '日期未提供')} ${esc(snapshot.quoteTime ?? '（時刻未提供）')}<br><span class="quiet">快照最新時刻不代表此檔成交時刻。</span></p></div>`;
}

export function createStockPanel({ dialog, getStocks, getSnapshot, getHistory = () => null, isWatched = () => false, onWatch = () => {}, onCompare = () => {} }) {
  const title = dialog.querySelector('#detail-title'), content = dialog.querySelector('#detail-content');
  let selection = new URL(location.href).searchParams.get('q') ?? '', urlTimer, returnTarget, returnSelector;
  function updateUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const url = new URL(location.href);
      if (selection) url.searchParams.set('q', pickStock(getStocks(), selection)?.code ?? selection);
      else url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }, 180);
  }
  function refresh(trigger) {
    if (!selection || !getSnapshot()) return;
    const stock = pickStock(getStocks(), selection);
    title.innerHTML = stock ? `${esc(stock.code)} ${esc(stock.name)}` : '找不到這檔股票';
    content.innerHTML = stock ? detailMarkup(stock, getSnapshot(), getHistory(), isWatched(stock.code)) : `<p>目前快照沒有代碼「${esc(selection)}」的資料，請關閉明細後重新搜尋。</p>`;
    if (!dialog.open) {
      returnTarget = trigger ?? document.activeElement;
      const source = returnTarget?.closest('[data-stock-key], [data-key]');
      const key = source?.dataset.stockKey ?? source?.dataset.key;
      const region = source?.closest('[id]')?.id;
      returnSelector = key ? `${region ? `#${CSS.escape(region)} ` : ''}${source.dataset.key ? '.heat-tile[data-key' : 'button[data-stock-key'}="${CSS.escape(key)}"]` : null;
      dialog.showModal(); document.body.classList.add('detail-open');
    }
  }
  function open(key, trigger) { selection = key; refresh(trigger); updateUrl(); }
  function close(sync = true) {
    selection = ''; clearTimeout(urlTimer);
    if (dialog.open) dialog.close();
    if (sync) updateUrl();
  }
  for (const button of dialog.querySelectorAll('[data-close-detail]')) button.addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => {
    const watch = event.target.closest?.('[data-watch]'), compare = event.target.closest?.('[data-compare]');
    if (watch) { onWatch(watch.dataset.watch); refresh(); content.querySelector('[data-watch]')?.focus(); return; }
    if (compare) { onCompare(compare.dataset.compare); return; }
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('detail-open');
    const target = returnTarget?.isConnected ? returnTarget : returnSelector ? document.querySelector(returnSelector) : null;
    (target ?? document.getElementById('refresh')).focus({ preventScroll: true });
  });
  // Native modal dialogs make the background inert; keep Tab cycling inside too.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  function syncUrl() {
    clearTimeout(urlTimer);
    const key = new URL(location.href).searchParams.get('q');
    if (key) { selection = key; refresh(); } else close(false);
  }
  return { open, close, refresh, syncUrl, dispose() { clearTimeout(urlTimer); } };
}
