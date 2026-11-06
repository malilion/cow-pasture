import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWatch, toggleWatch, parseCompare, formatCompare, logoId } from '../docs/js/logic.js';
import { marketCard } from '../docs/js/share.js';
import { detailMarkup } from '../docs/js/detail.js';

test('觀察名單驗證代碼、唯一、最多 40 檔與純函式切換', () => {
  assert.deepEqual(loadWatch('broken'), []); assert.deepEqual(loadWatch('{"shares":100}'), []);
  assert.deepEqual(loadWatch('["2330","2330","0050","00679B","01001T","2330<script>",42]'), ['2330', '0050', '00679B']);
  const list = ['2330']; assert.deepEqual(toggleWatch(list, '0050'), ['2330', '0050']); assert.deepEqual(list, ['2330']);
  assert.deepEqual(toggleWatch(list, '2330'), []); assert.deepEqual(toggleWatch(list, '<x>'), list);
  const many = Array.from({ length: 45 }, (_, i) => String(1000 + i));
  assert.equal(loadWatch(many).length, 40); assert.equal(toggleWatch(loadWatch(many), '2330').length, 40);
});
test('比較參數僅保留兩檔有效不同代碼，格式化可往返', () => {
  assert.deepEqual(parseCompare('2330,2454'), ['2330', '2454']);
  assert.deepEqual(parseCompare('2330,2330, 0050 ,2454'), ['2330', '0050']);
  assert.deepEqual(parseCompare('<script>,01001T,00679B'), ['00679B']);
  assert.deepEqual(parseCompare(null), []); assert.deepEqual(parseCompare(''), []);
  assert.equal(formatCompare(['2330', '2454']), '2330,2454');
});
test('四款標誌識別與預設回退', () => {
  for (const id of ['cute', 'fine', 'mature', 'lion']) assert.equal(logoId(id), id);
  for (const id of [null, 'unknown', '../x', '<script>']) assert.equal(logoId(id), 'cute');
});
test('分享卡取目前快照、缺價為破折號並跳脫來源文字；歷史不足保留非分時圖', () => {
  const card = marketCard({ marketDate: '<x>', quoteTime: '09:30:01', indices: { taiex: { price: 123.45 }, otc: { price: null } } }, []);
  assert.match(card, /123.45/); assert.match(card, /&lt;x&gt;/); assert.doesNotMatch(card, /<x>/); assert.match(card, /櫃買指數  —/);
  const s = { key: 'tse:2330', code: '2330', name: '<script>', ind: '<x>', price: 10, open: 11, low: 9, high: 12, prev: 10 };
  const history = { v: 1, times: ['a', 'b'], series: { 'tse:2330': [10, 11] } };
  assert.match(detailMarkup(s, {}, history), /今日盤中走勢/);
  assert.match(detailMarkup(s, {}, null), /非分時圖/);
  assert.match(detailMarkup(s, {}), /&lt;x&gt;/);
});

test('觀察、比較與標誌介面事件：本機儲存僅代碼、名稱跳脫、比較 URL 保留 q', async t => {
  const { createPersonal } = await import('../docs/js/personal.js');
  const install = (name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  };
  class Element extends EventTarget {
    value = ''; innerHTML = ''; textContent = ''; open = false; attrs = {};
    constructor(dataset = {}) { super(); this.dataset = dataset; }
    setAttribute(key, value) { this.attrs[key] = value; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const elements = new Map(), get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const logos = ['cute', 'fine', 'mature', 'lion'].map(id => new Element({ logo: id }));
  get('logo-options').querySelectorAll = () => logos;
  const saved = new Map([['cowPasture.logo.v1', '../../bad']]);
  const location = { href: 'https://example.test/?q=2330&cmp=2330,2454' };
  install('document', { getElementById: get, querySelector: () => get('icon') });
  install('localStorage', { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) });
  install('location', location); install('history', { replaceState: (_a, _b, url) => { location.href = String(url); } });
  const stocks = [{ code: '2330', name: '<img onerror="bad">', key: 'tse:2330', price: null }, { code: '2454', name: '比較股票', key: 'tse:2454', price: null }];
  const personal = createPersonal({ getStocks: () => stocks, getHistory: () => null, openStock: () => {} });
  assert.equal(get('brand-logo').src, 'logos/cute.png');
  personal.toggle('2330');
  assert.equal(saved.get('cowPasture.watch.v1'), '["2330"]');
  assert.match(get('watch-list').innerHTML, /&lt;img/); assert.doesNotMatch(get('watch-list').innerHTML, /<img/);
  personal.refresh(); assert.equal(get('compare-dialog').open, true);
  assert.match(get('compare-content').innerHTML, /&lt;img/); assert.match(get('stock-options').innerHTML, /&lt;img/);
  get('compare-dialog').close();
  get('compare-a').value = '2330'; get('compare-b').value = '2454';
  get('compare-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const url = new URL(location.href);
  assert.equal(url.searchParams.get('q'), '2330'); assert.equal(url.searchParams.get('cmp'), '2330,2454');
  const click = new Event('click'); Object.defineProperty(click, 'target', { value: { closest: () => logos[3] } });
  get('logo-options').dispatchEvent(click);
  assert.equal(saved.get('cowPasture.logo.v1'), 'lion'); assert.equal(get('icon').href, 'logos/lion.png');
  assert.equal(logos[3].attrs['aria-pressed'], 'true');
});
