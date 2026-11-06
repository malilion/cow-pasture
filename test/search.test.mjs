import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearch } from '../docs/js/search.js';

function setup(t) {
  const tasks = new Map(); let nextTask = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const id = ++nextTask; tasks.set(id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', id => tasks.delete(id));
  const document = { activeElement: null };
  class Element extends EventTarget {
    value = ''; textContent = ''; innerHTML = ''; hidden = false; dataset = {}; children = []; replacements = 0;
    append(child) { this.children.push(child); }
    replaceChildren(fragment) { this.children = fragment.children; this.replacements++; }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  document.getElementById = get;
  document.createElement = document.createDocumentFragment = () => new Element();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document; });
  for (const id of ['search-market', 'search-direction', 'search-industry']) get(id).value = 'all';
  let stocks = Array.from({ length: 95 }, (_, i) => ({ code: String(1000 + i), key: `tse:${1000 + i}`, name: `測試股票${i}`, mkt: 'tse', ind: '半導體', pct: 1, price: 101, prev: 100, vol: 10, vs: 0 }));
  stocks[0] = { ...stocks[0], name: '<img onerror="x">', ind: '<script>', key: 'tse:"<1000>', price: null, pct: null };
  stocks[1] = { ...stocks[1], mkt: 'otc', ind: '生技', pct: -1 };
  const search = createSearch({ getStocks: () => stocks });
  t.after(() => search.dispose());
  const fire = (id, type) => { const event = new Event(type, { cancelable: true }); get(id).dispatchEvent(event); return event; };
  const flush = () => { for (const [id, task] of tasks) { tasks.delete(id); task.callback(); } };
  return { search, get, fire, tasks, flush, document, setStocks: next => { stocks = next; } };
}

test('搜尋空結果清除全部條件、取消待處理輸入、重設分頁並返回搜尋框', t => {
  const { search, get, fire, tasks, flush, document } = setup(t);
  search.render();
  assert.equal(get('search-rows').children.length, 30);
  fire('show-more', 'click');
  assert.equal(get('search-rows').children.length, 80);
  get('query').value = '找不到這檔';
  get('search-market').value = 'otc';
  get('search-direction').value = 'up';
  get('search-industry').value = '半導體';
  search.render();
  assert.equal(get('search-empty').hidden, false);
  assert.equal(get('search-results').hidden, true);
  assert.equal(get('show-more').hidden, true);
  assert.equal(get('search-rows').children.length, 0);
  assert.equal(get('search-count').textContent, '0 檔結果 · 已顯示 0');
  fire('query', 'input');
  assert.equal(tasks.size, 1);
  fire('clear-search', 'click');
  assert.equal(tasks.size, 0);
  assert.equal(get('query').value, '');
  for (const id of ['search-market', 'search-direction', 'search-industry']) assert.equal(get(id).value, 'all');
  assert.equal(get('search-empty').hidden, true);
  assert.equal(get('search-results').hidden, false);
  assert.equal(get('show-more').hidden, false);
  assert.equal(get('search-rows').children.length, 30);
  assert.equal(get('search-count').textContent, '95 檔結果 · 已顯示 30');
  assert.equal(document.activeElement, get('query'));
  assert.deepEqual(get('query').focusOptions, { preventScroll: true });
  const renders = get('search-rows').replacements;
  flush(); assert.equal(get('search-rows').replacements, renders);
});

test('篩選交集可獨立產生空結果，清除後仍可輸入與分頁', t => {
  const { search, get, fire, flush, tasks } = setup(t);
  search.render();
  get('search-market').value = 'otc'; fire('search-market', 'change');
  assert.equal(get('search-rows').children.length, 1);
  get('search-direction').value = 'up'; fire('search-direction', 'change');
  assert.equal(get('search-empty').hidden, false);
  fire('clear-search', 'click');
  get('query').value = '1001'; fire('query', 'input');
  assert.equal(get('search-rows').children.length, 30, '輸入尚在防抖期間');
  assert.equal([...tasks.values()][0].delay, 180);
  get('query').value = '1002'; fire('query', 'input');
  assert.equal(tasks.size, 1, '只保留最後一次輸入');
  flush();
  assert.equal(get('search-rows').children.length, 1);
  assert.equal(get('search-rows').children[0].dataset.stockKey, 'tse:1002');
  fire('clear-search', 'click');
  fire('show-more', 'click'); fire('show-more', 'click');
  assert.equal(get('search-rows').children.length, 95);
  assert.equal(get('show-more').hidden, true);
  assert.equal(fire('search-form', 'submit').defaultPrevented, true);
});

test('產業捷徑與篩選立即取消延遲搜尋；快照更新保留篩選，離頁移除事件', t => {
  const { search, get, fire, tasks, setStocks, document } = setup(t);
  get('query').value = '不相符'; fire('query', 'input');
  search.reset({ industry: '生技' });
  assert.equal(tasks.size, 0);
  assert.equal(get('search-industry').value, '生技');
  assert.equal(get('search-rows').children.length, 1);
  assert.equal(document.activeElement, null, '產業捷徑不搶走焦點');
  fire('query', 'input');
  get('search-direction').value = 'up'; fire('search-direction', 'change');
  assert.equal(tasks.size, 0);
  assert.equal(get('search-empty').hidden, false);
  setStocks([{ key: 'otc:1234', code: '1234', name: '新快照', mkt: 'otc', ind: '生技', pct: 1 }]);
  search.render();
  assert.equal(get('search-rows').children.length, 1);
  assert.equal(get('search-industry').value, '生技');
  fire('query', 'input');
  search.dispose(); assert.equal(tasks.size, 0);
  const renders = get('search-rows').replacements;
  fire('query', 'input'); fire('clear-search', 'click'); fire('search-industry', 'change'); fire('show-more', 'click');
  assert.equal(tasks.size, 0);
  assert.equal(get('search-rows').replacements, renders);
});

test('搜尋列保留缺價與來源字串跳脫；無股票時清除仍維持空結果', t => {
  const { search, get, fire, setStocks } = setup(t);
  search.render();
  const html = get('search-rows').children[0].innerHTML;
  assert.match(html, /&lt;img onerror=&quot;x&quot;&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-stock-key="tse:&quot;&lt;1000&gt;"/);
  assert.match(html, /未成交 · 前收 100/);
  assert.doesNotMatch(html, /<img|<script/);
  setStocks([]); fire('clear-search', 'click');
  assert.equal(get('search-empty').hidden, false);
  assert.equal(get('search-results').hidden, true);
  assert.equal(get('show-more').hidden, true);
  assert.equal(get('search-rows').children.length, 0);
});
