import { formatCompare, historySeries, linePoints, loadWatch, logoId, parseCompare, pickStock, toggleWatch } from './logic.js';
import { escapeHtml as esc, formatPrice, formatVolume, pctText, tone, vsText } from './display.js';

export function sparkMarkup(values, label, className = 'mini-spark') {
  const points = linePoints(values);
  return points.length < 2 ? '' : `<svg class="${className}" viewBox="0 0 320 108" role="img" aria-label="${esc(label)}"><polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}"/></svg>`;
}
export function createPersonal({ getStocks, getHistory, openStock }) {
  const $ = id => document.getElementById(id);
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  let watch = loadWatch(read('cowPasture.watch.v1'));
  let compare = parseCompare(new URL(location.href).searchParams.get('cmp')), initialCompare = compare.length === 2;
  let optionsSignature = '';
  function setLogo(value) {
    const id = logoId(value);
    $('brand-logo').src = `logos/${id}.png`;
    document.querySelector('link[rel="icon"]').href = `logos/${id}.png`;
    for (const button of $('logo-options').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.logo === id));
    return id;
  }
  setLogo(read('cowPasture.logo.v1'));
  $('logo-options').addEventListener('click', event => {
    const button = event.target.closest('[data-logo]');
    if (button) write('cowPasture.logo.v1', setLogo(button.dataset.logo));
  });
  const syncInputs = () => { $('compare-a').value = compare[0] ?? ''; $('compare-b').value = compare[1] ?? ''; };
  syncInputs();
  function syncCompareUrl() {
    const url = new URL(location.href), value = formatCompare(compare);
    if (value) url.searchParams.set('cmp', value); else url.searchParams.delete('cmp');
    history.replaceState(null, '', url);
  }
  function compareMarkup() {
    $('compare-content').innerHTML = `<div class="compare-grid">${compare.map(code => {
      const s = pickStock(getStocks(), code);
      if (!s) return `<article><h3>${esc(code)}</h3><p>目前快照沒有這檔股票。</p></article>`;
      const spark = sparkMarkup(historySeries(getHistory(), s.key), `${s.code} 今日盤中價格`, 'compare-spark');
      return `<article><h3>${esc(s.code)} ${esc(s.name)}</h3><dl class="compare-values"><dt>價格</dt><dd>${formatPrice(s.price)}</dd><dt>漲跌幅</dt><dd class="${tone(s.pct)}">${pctText(s.pct)}</dd><dt>對標所屬大盤</dt><dd class="${tone(s.vs)}">${vsText(s.vs)}</dd><dt>成交量（張）</dt><dd>${formatVolume(s.vol)}</dd></dl>${spark || '<p class="quiet">盤中歷史尚不足兩點。</p>'}<button type="button" data-compare-stock="${esc(s.key)}">查看個股明細</button></article>`;
    }).join('')}</div><p class="fine-print">兩圖各自縮放價格範圍。依快照累積，約每 1–2 分鐘一點，非逐筆分時；資料可能延遲，非投資建議。</p>`;
  }
  $('compare-form').addEventListener('submit', event => {
    event.preventDefault();
    const stocks = getStocks();
    const resolve = raw => pickStock(stocks, raw.trim()) ?? stocks.find(s => s.name === raw.trim());
    const a = resolve($('compare-a').value), b = resolve($('compare-b').value);
    if (!a || !b || a.code === b.code) { $('compare-status').textContent = '請選擇快照中的兩檔不同股票。'; return; }
    compare = [a.code, b.code]; syncInputs(); syncCompareUrl(); compareMarkup(); $('compare-dialog').showModal();
  });
  $('compare-content').addEventListener('click', event => {
    const button = event.target.closest('[data-compare-stock]');
    if (button) { $('compare-dialog').close(); openStock(button.dataset.compareStock, button); }
  });
  $('watch-list').addEventListener('click', event => {
    const button = event.target.closest('[data-watch-stock]');
    if (button) openStock(button.dataset.watchStock, button);
    const remove = event.target.closest('[data-remove-watch]');
    if (remove) {
      const index = [...$('watch-list').querySelectorAll('[data-remove-watch]')].indexOf(remove);
      toggle(remove.dataset.removeWatch);
      const remaining = $('watch-list').querySelectorAll('[data-remove-watch]');
      (remaining[Math.min(index, remaining.length - 1)] ?? $('query')).focus();
    }
  });
  function renderWatch() {
    $('watch-list').innerHTML = watch.length ? watch.map(code => {
      const s = pickStock(getStocks(), code);
      return `<li><button type="button" data-watch-stock="${esc(s?.key ?? code)}"><strong>${esc(code)} ${esc(s?.name ?? '快照暫無資料')}</strong><span>${formatPrice(s?.price)} <b class="${tone(s?.pct)}">${pctText(s?.pct)}</b></span></button><button type="button" data-remove-watch="${esc(code)}" aria-label="移出觀察 ${esc(code)}">移出</button></li>`;
    }).join('') : '<li class="quiet">從個股明細加入觀察；名單僅保存在本機。</li>';
  }
  function toggle(code) {
    const full = watch.length >= 40 && !watch.includes(code);
    watch = toggleWatch(watch, code);
    const saved = write('cowPasture.watch.v1', JSON.stringify(watch));
    $('watch-status').textContent = full ? '觀察名單已滿 40 檔，請先移出一檔。' : saved ? '' : '瀏覽器無法儲存，名單僅保留至本頁關閉。';
    renderWatch();
  }
  function addCompare(code) {
    if (!compare.includes(code) && compare.length < 2) compare.push(code);
    syncInputs(); syncCompareUrl();
    $('compare-status').textContent = compare.length === 2 ? `已選 ${compare.join('、')}；可在比較欄調整。` : `已選 ${code}，請再選第二檔。`;
    if (compare.length === 2) { compareMarkup(); if (!$('compare-dialog').open) $('compare-dialog').showModal(); }
  }
  function refresh() {
    renderWatch();
    const stocks = getStocks(), signature = stocks.map(s => `${s.code}:${s.name}`).join('|');
    if (signature !== optionsSignature) {
      optionsSignature = signature;
      $('stock-options').innerHTML = stocks.map(s => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
    }
    if ($('compare-dialog').open) compareMarkup();
    if (initialCompare && stocks.length) { initialCompare = false; compareMarkup(); $('compare-dialog').showModal(); }
  }
  function syncUrl() {
    compare = parseCompare(new URL(location.href).searchParams.get('cmp')); syncInputs();
    if (compare.length === 2) { compareMarkup(); if (!$('compare-dialog').open) $('compare-dialog').showModal(); }
    else $('compare-dialog').close();
  }
  return { toggle, addCompare, refresh, syncUrl, isWatched: code => watch.includes(code) };
}
