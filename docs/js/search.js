import { filterStocks } from './logic.js';
import { badges, escapeHtml as esc, format, formatPrice, formatVolume, pctText, tone, vsText } from './display.js';

export function createSearch({ getStocks }) {
  const $ = id => document.getElementById(id);
  const query = $('query');
  const filters = ['search-market', 'search-direction', 'search-industry'].map($);
  const events = new AbortController();
  let limit = 30, timer;

  function render(reset = false) {
    if (reset) limit = 30;
    const rows = filterStocks(getStocks(), { query: query.value, market: filters[0].value, direction: filters[1].value, industry: filters[2].value });
    $('search-count').textContent = `${format(rows.length, 0)} 檔結果 · 已顯示 ${Math.min(rows.length, limit)}`;
    const fragment = document.createDocumentFragment();
    for (const s of rows.slice(0, limit)) {
      const tr = document.createElement('tr');
      tr.dataset.stockKey = s.key;
      tr.innerHTML = `<td class="stock-name"><button type="button" class="row-link" data-stock-key="${esc(s.key)}">${esc(s.code)} ${esc(s.name)}</button>${badges(s)}</td><td>${s.mkt === 'otc' ? '上櫃' : '上市'} / ${esc(s.ind)}</td><td>${formatPrice(s.price)}${s.price === null ? ` <small>未成交 · 前收 ${formatPrice(s.prev)}</small>` : ''}</td><td class="${tone(s.pct)}">${pctText(s.pct)}</td><td>${formatVolume(s.vol)}</td><td class="${tone(s.vs)}">${vsText(s.vs)}</td>`;
      fragment.append(tr);
    }
    $('search-rows').replaceChildren(fragment);
    $('search-empty').hidden = rows.length > 0;
    $('search-results').hidden = rows.length === 0;
    $('show-more').hidden = rows.length <= limit;
  }
  function renderNow() { clearTimeout(timer); render(true); }
  function reset({ industry = 'all' } = {}) {
    query.value = '';
    for (const filter of filters) filter.value = 'all';
    filters[2].value = industry;
    renderNow();
  }
  const on = (element, type, listener) => element.addEventListener(type, listener, { signal: events.signal });
  on($('search-form'), 'submit', event => event.preventDefault());
  on(query, 'input', () => { clearTimeout(timer); timer = setTimeout(() => render(true), 180); });
  for (const filter of filters) on(filter, 'change', renderNow);
  on($('clear-search'), 'click', () => { reset(); query.focus({ preventScroll: true }); });
  on($('show-more'), 'click', () => { limit += 50; render(); });
  return { render, reset, dispose() { clearTimeout(timer); events.abort(); } };
}
