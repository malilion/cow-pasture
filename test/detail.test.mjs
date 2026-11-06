import test from 'node:test';
import assert from 'node:assert/strict';
import { createStockPanel } from '../docs/js/detail.js';

test('明細在資料就緒後開啟深連結，防抖保留其他參數，鍵盤／背景關閉並返回焦點', t => {
  const tasks = new Map(); let nextTask = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const id = ++nextTask; tasks.set(id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', id => tasks.delete(id));
  const flush = () => { for (const [id, task] of tasks) { tasks.delete(id); task.callback(); } };
  const install = (name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  };
  const classes = new Set(), replacements = [];
  const document = { activeElement: null, body: { classList: { add: x => classes.add(x), remove: x => classes.delete(x) } } };
  class Button extends EventTarget {
    constructor(key) {
      super();
      this.dataset = key ? { stockKey: key } : {};
      this.isConnected = true;
      this.localName = 'button';
      this.tabIndex = 0;
    }
    closest(selector = '') {
      if (selector === 'dialog[open]') return null;
      if (selector === '[id]') return null;
      return this.dataset.stockKey ? this : null;
    }
    hasAttribute(name) { return name === 'data-stock-key' && Boolean(this.dataset.stockKey); }
    getAttribute(name) { return name === 'data-stock-key' ? this.dataset.stockKey : null; }
    matches() { return false; }
    getClientRects() { return [{ x: 0, y: 0, width: 1, height: 1 }]; }
    focus() { document.activeElement = this; }
  }
  const x = new Button(), bottomClose = new Button(), origin = new Button('tse:2330'), refreshedOrigin = new Button('tse:2330');
  const title = {}, content = {};
  class Dialog extends EventTarget {
    open = false;
    shows = 0;
    querySelector(selector) { return selector === '#detail-title' ? title : content; }
    querySelectorAll() { return [x, bottomClose]; }
    showModal() { this.open = true; this.shows++; x.focus(); }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    getBoundingClientRect() { return { left: 600, right: 1000, top: 0, bottom: 800 }; }
  }
  document.activeElement = origin;
  document.getElementById = () => origin;
  document.querySelector = () => refreshedOrigin;
  const location = { href: 'https://example.test/?scene=crash&q=2330#search' };
  install('document', document); install('location', location); install('CSS', { escape: value => value });
  install('history', { replaceState(_state, _title, url) { location.href = String(url); replacements.push(String(url)); } });
  // Deliberately missing quotes: the panel must preserve all unavailable values.
  const stocks = [{ key: 'tse:2330', code: '2330', name: '台積電', mkt: 'tse', ind: '半導體', price: null, prev: null, pct: null, vs: null },
    { key: 'tse:0050', code: '0050', name: '<img onerror="x">', mkt: 'tse', ind: 'ETF', price: null, prev: null, pct: null, vs: null }];
  let snapshot = null;
  const dialog = new Dialog(), panel = createStockPanel({ dialog, getStocks: () => stocks, getSnapshot: () => snapshot });
  t.after(() => panel.dispose());
  panel.refresh(); assert.equal(dialog.open, false);
  snapshot = { marketDate: null, quoteTime: null };
  panel.refresh(); assert.equal(dialog.open, true); assert.match(title.innerHTML, /2330 台積電/);
  assert.equal(document.activeElement, x); assert.ok(classes.has('detail-open'));
  panel.refresh(); assert.equal(dialog.shows, 1, '刷新明細不重新開啟對話框');
  panel.open('0050'); assert.match(title.innerHTML, /&lt;img onerror=&quot;x&quot;&gt;/);
  panel.open('2330');
  assert.equal(tasks.size, 1); assert.equal([...tasks.values()][0].delay, 180);
  flush(); assert.equal(replacements.length, 1);
  assert.equal(location.href, 'https://example.test/?scene=crash&q=2330#search');

  const key = shiftKey => { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key: 'Tab', shiftKey }); return event; };
  x.focus(); const reverse = key(true); dialog.dispatchEvent(reverse);
  assert.ok(reverse.defaultPrevented); assert.equal(document.activeElement, bottomClose);
  const forward = key(false); dialog.dispatchEvent(forward);
  assert.ok(forward.defaultPrevented); assert.equal(document.activeElement, x);
  origin.isConnected = false;
  const escape = new Event('cancel', { cancelable: true }); dialog.dispatchEvent(escape);
  assert.ok(escape.defaultPrevented); assert.equal(dialog.open, false);
  assert.equal(document.activeElement, refreshedOrigin, '入口重繪後返回同一股票的新按鈕');
  assert.equal(classes.has('detail-open'), false);
  flush(); assert.equal(new URL(location.href).searchParams.has('q'), false);
  assert.equal(new URL(location.href).searchParams.get('scene'), 'crash');

  panel.open('2330', refreshedOrigin);
  const inside = new Event('click'); Object.assign(inside, { clientX: 700, clientY: 100 }); dialog.dispatchEvent(inside);
  assert.equal(dialog.open, true);
  const backdrop = new Event('click'); Object.assign(backdrop, { clientX: 100, clientY: 100 }); dialog.dispatchEvent(backdrop);
  assert.equal(dialog.open, false); flush();
  panel.open('2330', refreshedOrigin); x.dispatchEvent(new Event('click')); flush();
  assert.equal(dialog.open, false); assert.equal(new URL(location.href).searchParams.has('q'), false);

  location.href = 'https://example.test/?q=%3Cscript%3E&scene=up'; panel.syncUrl();
  assert.equal(dialog.open, true); assert.equal(title.innerHTML, '找不到這檔股票');
  assert.match(content.innerHTML, /&lt;script&gt;/);
  assert.equal(tasks.size, 0, '瀏覽歷史同步不回寫網址');
  location.href = 'https://example.test/?scene=up'; panel.syncUrl();
  assert.equal(dialog.open, false); assert.equal(tasks.size, 0);
  panel.open('0050'); panel.close(); flush();
  assert.equal(new URL(location.href).searchParams.has('q'), false, '快速選取後清除不殘留 q');
});
