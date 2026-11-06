import { breadth, changePct, decodeSnapshot, filterStocks, freshness, industryAggregates, historySeries, sectorHistory, isMarketHours, mood, pickStock, rankings, refreshDelay, topMovers } from './logic.js';
import { badges, escapeHtml as esc, format, formatPrice, formatVolume, pctText, signed, tileColor, tone, vsText } from './display.js';
import { createPersonal, sparkMarkup } from './personal.js';
import { createShare } from './share.js';
import { createStockPanel } from './detail.js';

const $ = id => document.getElementById(id);
const state = { snapshot: null, history: null, stocks: [], scene: 'actual', rank: 'up', rankLimit: 20, limit: 30, pasture: null, loadingPasture: false, industriesExpanded: false, industryOpen: new Map() };
const stockPanel = createStockPanel({ dialog: $('stock-panel'), getStocks: () => state.stocks, getSnapshot: () => state.snapshot, getHistory: () => state.history,
  isWatched: code => personal.isWatched(code), onWatch: code => personal.toggle(code), onCompare: code => personal.addCompare(code) });
const personal = createPersonal({ getStocks: () => state.stocks, getHistory: () => state.history, openStock: (key, trigger) => stockPanel.open(key, trigger) });
createShare({ getSnapshot: () => state.snapshot, getStocks: () => state.stocks });
const compactHeatmap = matchMedia('(max-width: 600px)');
const scenes = new Set(['actual', 'down', 'crash', 'flat', 'up']);
const sceneParam = new URL(location.href).searchParams.get('scene');
state.scene = scenes.has(sceneParam) ? sceneParam : 'actual';
for (const input of document.querySelectorAll('input[name=scene]')) input.checked = input.value === state.scene;
let timer, pending = false, aborter, stopped = false, toastTimer;
function snapshotStamp(snapshot) {
  if (!snapshot) return '';
  return `${snapshot.marketDate ?? ''}|${snapshot.quoteTime ?? ''}|${snapshot.generatedAt ?? ''}`;
}
function taipeiClock(date = new Date()) {
  return date.toLocaleTimeString('zh-Hant-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
}
function showRefreshToast(message, same = false) {
  const el = $('refresh-toast');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('is-same', same);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

let pastureNear = false, fallback = false;
const fallbackKeys = () => state.snapshot?.meta?.fallbackCount ?? 0;

function breadthBar(b) {
  const segment = (count, cls) => `<span class="${cls}" style="width:${b.count ? count / b.count * 100 : 0}%"></span>`;
  return `<div class="breadth-bar" role="img" aria-label="上漲 ${b.up}、下跌 ${b.down}、平盤 ${b.flat}、未成交 ${b.noTrade}、漲跌不明 ${b.unknown}">${segment(b.up, 'up-bg')}${segment(b.flat, 'flat-bg')}${segment(b.down, 'down-bg')}${segment(b.unknown, 'unknown-bg')}${segment(b.noTrade, 'no-trade-bg')}</div><div class="breadth-key"><span class="up">▲ 漲 ${b.up}</span><span class="down">▼ 跌 ${b.down}</span><span class="flat">＝ 平 ${b.flat}</span><span class="quiet">未成交 ${b.noTrade}${b.unknown ? ` · 不明 ${b.unknown}` : ''}</span></div>`;
}
function renderFreshness() {
  if (!state.snapshot) return;
  const f = freshness(state.snapshot);
  const content = `<strong>資料時間 ${esc(f.dateLabel)}</strong><span class="freshness-mode">${esc(f.modeLabel)}</span><span class="freshness-age ${f.stale ? 'stale' : ''}">${esc(f.ageLabel)}${f.stale ? ' · 請留意資料日期' : ''}</span>`;
  if ($('freshness').innerHTML !== content) $('freshness').innerHTML = content;
  $('freshness').closest('.freshness-card').classList.toggle('is-stale', f.stale);
  const closed = state.snapshot.mode === 'eod' || !isMarketHours(new Date(), 13 * 60 + 30) || f.modeLabel === '收盤資料';
  $('market-status').hidden = !closed;
  $('market-status').textContent = `目前非盤中／收盤資料 · 快照最新報價 ${f.dateLabel}`;
  $('stale-notice').hidden = !f.stale;
  $('stale-notice').textContent = `資料更新已延遲 · ${f.ageLabel}。最後報價 ${f.dateLabel}，請留意行情日期。`;
}
function renderTicker() {
  const stocks = topMovers(state.stocks);
  $('ticker-track').innerHTML = stocks.length ? stocks.map(s => `<button type="button" class="ticker-stock" data-stock-key="${esc(s.key)}"><span>${esc(s.code)} ${esc(s.name)}</span><b class="${tone(s.pct)}">${s.pct > 0 ? '▲' : '▼'} ${pctText(s.pct)}</b>${badges(s)}</button>`).join('') : '<span class="quiet">目前沒有可比較的異動報價。</span>';
  $('ticker-pause').hidden = !stocks.length;
}
function renderIndices() {
  $('indices').innerHTML = Object.entries(state.snapshot.indices).map(([key, index]) => {
    const pct = changePct(index.price, index.prev), change = pct === null ? null : index.price - index.prev;
    return `<article class="card index-card"><div class="index-top"><h2>${esc(index.name)}</h2><span>${esc(index.time ?? '無可用指數')}</span></div><div class="index-value ${tone(pct)}"><strong>${format(index.price)}</strong><span>${signed(change)} 點（${pctText(pct)}）</span></div><div class="index-range"><span>開盤<b>${format(index.open)}</b></span><span>最高<b>${format(index.high)}</b></span><span>最低<b>${format(index.low)}</b></span></div>${sparkMarkup(historySeries(state.history, key), `${index.name} 今日盤中走勢`)}<span class="index-spark ${tone(pct)}" aria-hidden="true">${pct === null || pct === 0 ? '〜' : pct > 0 ? '↗' : '↘'}</span></article>`;
  }).join('');
}
function renderBreadth() {
  const b = breadth(state.stocks);
  $('stock-count').textContent = `共 ${format(b.count, 0)} 檔${state.snapshot.meta?.fixture ? '樣本' : ''}`;
  $('breadth-summary').innerHTML = `<div class="pasture-number">${format(b.pastureIndex, 1)}<small>%</small><span class="pasture-number-label">牧場指數 · 下跌 / 全部檔數</span></div><div>${breadthBar(b)}</div>`;
  $('breadth-rows').innerHTML = [['上市', state.stocks.filter(s => s.mkt === 'tse')], ['上櫃', state.stocks.filter(s => s.mkt === 'otc')], ['ETF 小計', state.stocks.filter(s => s.etf)], ['合計', state.stocks]].map(([name, rows]) => {
    const n = breadth(rows), lu = rows.some(s => s.lu > 0) ? n.limitUp : '—', ld = rows.some(s => s.ld > 0) ? n.limitDown : '—';
    return `<tr${name === '合計' ? ' class="total"' : ''}><td>${name}</td><td class="up">${n.up}</td><td class="down">${n.down}</td><td>${n.flat}</td><td>${n.noTrade}</td><td>${n.unknown}</td><td><span class="up">${lu}</span> / <span class="down">${ld}</span></td></tr>`;
  }).join('');
}
function renderHeatmap() {
  const groups = new Map();
  for (const stock of state.stocks) {
    if (!groups.has(stock.ind)) groups.set(stock.ind, []);
    groups.get(stock.ind).push(stock);
  }
  const fragment = document.createDocumentFragment();
  const mobile = compactHeatmap.matches;
  for (const [index, [name, stocks]] of [...groups].sort((a, b) => b[1].length - a[1].length).entries()) {
    const group = document.createElement('details');
    group.className = 'heatmap-group'; group.dataset.industry = name;
    group.open = state.industryOpen.get(name) ?? (!mobile || state.industriesExpanded || index < 6);
    const summary = document.createElement('summary');
    summary.addEventListener('click', () => state.industryOpen.set(name, !group.open));
    summary.append(document.createTextNode(name));
    const count = document.createElement('span'); count.textContent = `${stocks.length} 檔`; summary.append(count);
    const tiles = document.createElement('div'); tiles.className = 'heatmap-tiles'; tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-label', `${name} 股票`);
    for (const [i, stock] of stocks.entries()) {
      const tile = document.createElement('button');
      tile.type = 'button'; tile.className = 'heat-tile'; tile.dataset.key = stock.key;
      tile.style.background = tileColor(stock.pct); tile.tabIndex = i === 0 ? 0 : -1;
      tile.setAttribute('aria-label', `${stock.code} ${stock.name} ${pctText(stock.pct)}`);
      tiles.append(tile);
    }
    group.append(summary, tiles); fragment.append(group);
  }
  $('heatmap-grid').replaceChildren(fragment);
  $('expand-industries').hidden = !mobile || state.industriesExpanded || groups.size <= 6;
  $('heatmap-detail').textContent = '選一塊田地，看看誰在長草。';
}
function renderRankings() {
  const all = rankings(state.stocks, state.rank, $('ranking-market').value, 50), rows = all.slice(0, state.rankLimit);
  $('ranking-list').innerHTML = rows.length ? rows.map((s, i) => `<li><button type="button" class="ranking-row" data-stock-key="${esc(s.key)}"><span class="ranking-number">${String(i + 1).padStart(2, '0')}</span><span class="stock-name">${esc(s.name)}${badges(s)}<small>${esc(s.code)} · ${s.mkt === 'otc' ? '上櫃' : '上市'} · ${formatPrice(s.price)}</small></span><span class="ranking-value ${state.rank === 'vol' ? '' : tone(s.pct)}">${state.rank === 'vol' ? `${formatVolume(s.vol)} 張` : pctText(s.pct)}<small class="${tone(s.vs)}">${vsText(s.vs)}</small></span></button></li>`).join('') : '<li class="empty">目前沒有符合條件的報價。</li>';
  $('ranking-more').hidden = all.length <= rows.length;
  $('ranking-count').textContent = `已顯示 ${rows.length} 檔 · 最多前 50 名`;
}
function renderEtf() {
  const stocks = state.stocks.filter(s => s.etf);
  $('etf-breadth').innerHTML = breadthBar(breadth(stocks));
  const popular = ['0050', '0056', '00878', '006208', '00919', '00929'].map(code => stocks.find(s => s.code === code)).filter(Boolean);
  $('popular-etfs').innerHTML = popular.map(s => `<div class="etf-chip"><strong>${esc(s.code)}${badges(s)}</strong><span class="etf-name">${esc(s.name)}</span><b class="${tone(s.pct)}">${pctText(s.pct)}</b><small>${formatPrice(s.price)}</small><small class="${tone(s.vs)}">${vsText(s.vs)}</small></div>`).join('') || '<p class="quiet">目前快照無這些 ETF。</p>';
  $('etf-movers').innerHTML = stocks.filter(s => s.pct !== null).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5).map(s => `<div class="etf-mover"><span>${esc(s.code)} ${esc(s.name)}${badges(s)}</span><span class="${tone(s.pct)}">${pctText(s.pct)}<br><small class="${tone(s.vs)}">${vsText(s.vs)}</small></span></div>`).join('') || '<p class="quiet">暫無可比較報價。</p>';
}
function renderIndustries() {
  const pct = changePct(state.snapshot.indices.taiex?.price, state.snapshot.indices.taiex?.prev);
  // Suppress comparison when an industry's average mixes quote dates.
  const mixedIndustries = new Set(state.stocks.filter(s => s.date !== state.snapshot.marketDate).map(s => s.ind));
  $('industry-rows').innerHTML = industryAggregates(state.stocks, pct).map(s => `<tr data-industry-target="${esc(s.name)}"><td><button type="button" class="row-link" data-industry-target="${esc(s.name)}">${esc(s.name)}${sparkMarkup(sectorHistory(state.history, s.name), `${s.name} 等權平均漲跌幅走勢`)}</button></td><td>${s.count}</td><td class="${tone(s.avg)}">${pctText(s.avg)}</td><td><span class="up">${s.up}</span> / <span class="down">${s.down}</span></td><td class="${tone(mixedIndustries.has(s.name) ? null : s.vs)}">${vsText(mixedIndustries.has(s.name) ? null : s.vs)}</td></tr>`).join('');
  const selected = $('search-industry').value;
  $('search-industry').innerHTML = '<option value="all">所有產業</option>' + [...new Set(state.stocks.map(s => s.ind))].sort((a, b) => a.localeCompare(b, 'zh-Hant')).map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  $('search-industry').value = [...$('search-industry').options].some(o => o.value === selected) ? selected : 'all';
}
function renderSearch(reset = false) {
  if (reset) state.limit = 30;
  const rows = filterStocks(state.stocks, { query: $('query').value, market: $('search-market').value, direction: $('search-direction').value, industry: $('search-industry').value });
  $('search-count').textContent = `${format(rows.length, 0)} 檔結果 · 已顯示 ${Math.min(rows.length, state.limit)}`;
  const fragment = document.createDocumentFragment();
  for (const s of rows.slice(0, state.limit)) {
    const tr = document.createElement('tr');
    tr.dataset.stockKey = s.key;
    tr.innerHTML = `<td class="stock-name"><button type="button" class="row-link" data-stock-key="${esc(s.key)}">${esc(s.code)} ${esc(s.name)}</button>${badges(s)}</td><td>${s.mkt === 'otc' ? '上櫃' : '上市'} / ${esc(s.ind)}</td><td>${formatPrice(s.price)}${s.price === null ? ` <small>未成交 · 前收 ${formatPrice(s.prev)}</small>` : ''}</td><td class="${tone(s.pct)}">${pctText(s.pct)}</td><td>${formatVolume(s.vol)}</td><td class="${tone(s.vs)}">${vsText(s.vs)}</td>`;
    fragment.append(tr);
  }
  if (!rows.length) { const tr = document.createElement('tr'); tr.innerHTML = '<td colspan="6" class="empty">找不到這塊田地，試試別的名稱或代碼。</td>'; fragment.append(tr); }
  $('search-rows').replaceChildren(fragment);
  $('show-more').hidden = rows.length <= state.limit;
}
function getMood() {
  return mood(state.stocks, changePct(state.snapshot?.indices.taiex?.price, state.snapshot?.indices.taiex?.prev), state.scene);
}
function renderFallback() {
  const m = getMood(), root = document.createElement('div'); root.className = 'fallback-scene';
  const field = document.createElement('div'); field.className = `fallback-field ${m.state === 'red' ? 'red-field' : m.state === 'flat' ? 'flat-field' : ''}`;
  const items = m.state === 'red' ? ['🥀', '🌷', '🐄🧳', '🌸'] : [...Array(m.cowCount)].map(() => '🐄').concat(Array(Math.round(m.g * 14)).fill('🌱'));
  if (m.state === 'green') field.style.backgroundColor = `hsl(110, ${20 + m.g * 15}%, ${66 - m.g * 20}%)`;
  for (const item of items) { const span = document.createElement('span'); span.className = 'fallback-cow'; span.textContent = item; field.append(span); }
  root.append(field); $('pasture-view').replaceChildren(root);
  $('pasture-note').textContent = '2D 備援牧場 · 此環境無法使用 3D；下方田地圖可查看全部股票';
  document.querySelector('.camera-controls').hidden = true;
}
function renderMood() {
  const m = getMood();
  $('pasture-caption').textContent = m.caption;
  $('pasture-stats').textContent = `${m.preview ? '預覽模式 · ' : ''}${m.state === 'red' ? '牛群帶著行李離開' : `${m.cowCount} 頭牛`} · 牧草茂盛度 ${Math.round(m.g * 100)}%${fallbackKeys() ? ' · 含盤後回補' : ''}`;
  $('preview-label').textContent = m.preview ? '預覽模式：只改變牧場氣氛，所有報價維持實際資料。' : '氣氛預覽只改變牧場，所有報價維持實際資料。';
  if (fallback) renderFallback();
  else state.pasture?.update(state.stocks, m);
}
async function loadPasture() {
  if (!pastureNear || !state.snapshot || state.pasture || state.loadingPasture || fallback) return;
  state.loadingPasture = true;
  try {
    // Probe first: three.js does not need to load in an environment without WebGL2.
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const { createPasture } = await import('./pasture.js');
    if (stopped) return;
    state.pasture = createPasture($('pasture-view'), { tooltip: $('pasture-tooltip'), moo: $('moo'),
      zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), reset: $('reset-view'),
      onSelect(stock) { stockPanel.open(stock.key); },
      onFailure() { state.pasture?.dispose(); state.pasture = null; fallback = true; renderFallback(); } });
    renderMood();
  } catch { fallback = true; renderFallback(); }
  finally { state.loadingPasture = false; }
}
function render() {
  renderFreshness(); renderIndices(); renderBreadth(); renderHeatmap(); renderRankings(); renderEtf(); renderIndustries(); renderSearch(); renderMood(); renderTicker(); stockPanel.refresh(); personal.refresh(); $('share-market').disabled = false;
  const notes = [], meta = state.snapshot.meta ?? {};
  if (meta.fixture) notes.push('歷史樣本模式：僅顯示隨附的真實 API fixtures，非全市場、非今日報價。');
  if (meta.incompleteUniverse?.length) notes.push(`資料範圍不完整：${meta.incompleteUniverse.join('、')}。`);
  if (meta.failedSources?.length) notes.push(`部分來源無法取得：${meta.failedSources.join('、')}。`);
  const staleMis = state.stocks.filter(s => s.stale && !s.fallback).length;
  if (staleMis) notes.push(`${staleMis} 檔 MIS 報價日期較早或未提供，已標記並停用其大盤比較。`);
  if (meta.fallbackCount) notes.push(`${meta.fallbackCount} 檔採盤後回補，各檔日期已標記；混合日期統計請審慎解讀。`);
  if (state.snapshot.mode === 'eod') notes.push('MIS 無可用報價，已使用盤後資料；本來源未提供指數。');
  $('data-notice').textContent = notes.join(' '); $('data-notice').hidden = !notes.length;
  loadPasture();
}
function schedule() {
  clearTimeout(timer);
  if (!document.hidden && !stopped) timer = setTimeout(fetchData, refreshDelay(new Date()));
}
async function fetchData(options = {}) {
  const manual = options === true || options?.manual === true;
  if (pending || stopped) return;
  if (!manual && document.hidden) return;
  pending = true;
  const refreshBtn = $('refresh');
  const prevLabel = refreshBtn.textContent;
  refreshBtn.disabled = true;
  $('retry').disabled = true;
  if (manual) refreshBtn.textContent = '更新中…';
  clearTimeout(timer);
  const before = snapshotStamp(state.snapshot);
  aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), 20_000);
  try {
    const stamp = Date.now();
    const [response, historyData] = await Promise.all([
      fetch(`data/snapshot.json?t=${stamp}`, { signal: aborter.signal, cache: 'no-store' }),
      fetch(`data/history.json?t=${stamp}`, { signal: aborter.signal, cache: 'no-store' })
        .then(response => response.ok ? response.json() : null).catch(() => null),
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json(), stocks = decodeSnapshot(snapshot);
    if (!snapshot.indices || !snapshot.indices.taiex || !snapshot.indices.otc || !stocks.length) throw new Error('快照沒有可用資料');
    state.history = historyData?.v === 1 && historyData.marketDate === snapshot.marketDate ? historyData : null;
    state.snapshot = snapshot; state.stocks = stocks; $('error-banner').hidden = true; render();
    if (manual) {
      const after = snapshotStamp(snapshot);
      const latest = snapshot.quoteTime || snapshot.generatedAt?.slice(11, 19) || taipeiClock();
      if (before && before === after) showRefreshToast(`資料尚未更新（最新 ${latest}）`, true);
      else showRefreshToast(`已更新 ${taipeiClock()}`, false);
    }
  } catch (error) {
    if (!stopped) {
      $('error-message').textContent = `市場快照暫時無法取得${state.snapshot ? '，保留上次資料' : '，請確認已產生 snapshot.json'}（${error.name === 'AbortError' ? '連線逾時' : error.message}）。`;
      $('error-banner').hidden = false;
      if (!state.snapshot) $('freshness').textContent = '尚無資料 · 可點選重試';
      if (manual) showRefreshToast('更新失敗，請稍後再試', true);
    }
  } finally {
    clearTimeout(timeout); pending = false;
    refreshBtn.disabled = false; refreshBtn.textContent = prevLabel || '↻ 更新資料';
    $('retry').disabled = false; schedule();
  }
}
$('refresh').addEventListener('click', () => { void fetchData({ manual: true }); });
$('retry').addEventListener('click', () => { void fetchData({ manual: true }); });
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden) { renderFreshness(); fetchData(); } });
const freshnessTimer = setInterval(() => { if (!document.hidden) renderFreshness(); }, 60_000);
const observer = new IntersectionObserver(entries => { pastureNear = entries[0].isIntersecting; if (pastureNear) loadPasture(); }, { rootMargin: '250px' });
observer.observe($('pasture-frame'));
$('scene-control').addEventListener('change', event => {
  if (!scenes.has(event.target.value)) return;
  state.scene = event.target.value;
  const url = new URL(location.href); if (state.scene === 'actual') url.searchParams.delete('scene'); else url.searchParams.set('scene', state.scene);
  history.replaceState(null, '', url); renderMood();
});
window.addEventListener('popstate', () => { const scene = new URL(location.href).searchParams.get('scene'); state.scene = scenes.has(scene) ? scene : 'actual'; for (const input of document.querySelectorAll('input[name=scene]')) input.checked = input.value === state.scene; renderMood(); stockPanel.syncUrl(); personal.syncUrl(); });
$('ranking-market').addEventListener('change', () => { state.rankLimit = 20; renderRankings(); });
$('ranking-more').addEventListener('click', () => { state.rankLimit = 50; renderRankings(); $('ranking-list').querySelectorAll('button')[20]?.focus(); });
function selectRank(button) {
  if (!button) return;
  state.rank = button.dataset.rank; state.rankLimit = 20;
  for (const tab of $('ranking-tabs').querySelectorAll('[role=tab]')) { const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; }
  $('ranking-panel').setAttribute('aria-labelledby', button.id); renderRankings();
}
$('ranking-tabs').addEventListener('click', event => selectRank(event.target.closest('[data-rank]')));
$('ranking-tabs').addEventListener('keydown', event => {
  const tabs = [...$('ranking-tabs').querySelectorAll('[role=tab]')], index = tabs.indexOf(document.activeElement);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  selectRank(tabs[next]); tabs[next].focus();
});
let searchTimer;
$('search-form').addEventListener('submit', event => event.preventDefault());
$('query').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderSearch(true), 180); });
for (const id of ['search-market', 'search-direction', 'search-industry']) $(id).addEventListener('change', () => renderSearch(true));
const onHeatmapSize = () => { if (state.snapshot) renderHeatmap(); };
compactHeatmap.addEventListener('change', onHeatmapSize);
$('expand-industries').addEventListener('click', () => {
  state.industriesExpanded = true;
  for (const group of $('heatmap-grid').children) { group.open = true; state.industryOpen.set(group.dataset.industry, true); }
  $('expand-industries').hidden = true;
});
$('show-more').addEventListener('click', () => { state.limit += 50; renderSearch(); });
function showHeatDetail(target) {
  const tile = target.closest('[data-key]'); if (!tile) return;
  const stock = pickStock(state.stocks, tile.dataset.key); if (!stock) return;
  $('heatmap-detail').innerHTML = `<span><b>${esc(stock.code)} ${esc(stock.name)}</b>${badges(stock)}</span><span>${formatPrice(stock.price)}</span><span class="${tone(stock.pct)}">${pctText(stock.pct)}</span><span class="${tone(stock.vs)}">${vsText(stock.vs)}</span><span class="quiet">${stock.mkt === 'otc' ? '上櫃' : '上市'} · ${esc(stock.ind)} · ${formatVolume(stock.vol)} 張${stock.price === null ? ' · 未成交' : ''}</span>`;
}
for (const type of ['pointerover', 'click', 'focusin']) $('heatmap-grid').addEventListener(type, event => showHeatDetail(event.target));
$('heatmap-grid').addEventListener('keydown', event => {
  const tile = event.target.closest('.heat-tile');
  if (!tile || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const tiles = [...tile.parentElement.children], i = tiles.indexOf(tile);
  const columns = getComputedStyle(tile.parentElement).gridTemplateColumns.split(' ').length;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tiles.length - 1 : Math.max(0, Math.min(tiles.length - 1, i + delta));
  tile.tabIndex = -1; tiles[next].tabIndex = 0; tiles[next].focus();
});
// Native buttons handle Enter and Space; row delegation also accepts pointer clicks.
document.addEventListener('click', event => {
  const stockTarget = event.target.closest('[data-stock-key]');
  if (stockTarget) stockPanel.open(stockTarget.dataset.stockKey, stockTarget.matches('button') ? stockTarget : stockTarget.querySelector('button'));
  const tile = event.target.closest('.heat-tile');
  if (tile) stockPanel.open(tile.dataset.key, tile);
  const industry = event.target.closest('[data-industry-target]')?.dataset.industryTarget;
  if (!industry) return;
  clearTimeout(searchTimer);
  $('query').value = ''; $('search-market').value = 'all'; $('search-direction').value = 'all';
  $('search-industry').value = industry; renderSearch(true);
  const group = [...$('heatmap-grid').children].find(el => el.dataset.industry === industry);
  if (group) {
    group.open = true; state.industryOpen.set(industry, true);
    for (const sibling of $('heatmap-grid').children) sibling.classList.toggle('industry-selected', sibling === group);
    group.scrollIntoView({ block: 'center' });
    group.querySelector('summary').focus({ preventScroll: true });
    $('heatmap-detail').textContent = `已展開「${industry}」，下方股票搜尋也已套用此產業。`;
  }
});
$('ticker-pause').addEventListener('click', () => {
  const paused = $('ticker-pause').getAttribute('aria-pressed') !== 'true';
  $('ticker-pause').setAttribute('aria-pressed', String(paused));
  $('ticker-pause').textContent = paused ? '繼續' : '暫停';
  $('movers-ticker').classList.toggle('is-paused', paused);
});
const tickerObserver = new ResizeObserver(entries => {
  $('ticker-track').style.setProperty('--ticker-width', `${entries[0].contentRect.width}px`);
});
tickerObserver.observe($('ticker-viewport'));
window.addEventListener('pagehide', event => { if (!event.persisted) { stopped = true; clearTimeout(timer); clearTimeout(searchTimer); stockPanel.dispose(); tickerObserver.disconnect(); clearInterval(freshnessTimer); aborter?.abort(); observer.disconnect(); compactHeatmap.removeEventListener('change', onHeatmapSize); state.pasture?.dispose(); } });
fetchData();

for (const dialog of document.querySelectorAll('.utility-dialog')) {
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
}
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !event.target.closest('input, textarea, select, dialog, [contenteditable="true"]') && !document.querySelector('dialog[open]')) {
    event.preventDefault(); $('query').focus();
  }
});
$('ranking-list').addEventListener('keydown', event => {
  if (!['Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const buttons = [...$('ranking-list').querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
});
