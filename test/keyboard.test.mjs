import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboardHelp, keyboardHelp, keyboardHelpMarkup, shortcutAction } from '../docs/js/keyboard.js';

test('鍵盤說明涵蓋面板、榜單、田地圖、氣氛與所有深連結，使用按鍵與程式碼語意', () => {
  const html = keyboardHelpMarkup();
  for (const text of ['Tab / Shift+Tab', 'Enter / Space', 'Esc', 'Home / End', '排行榜頁籤', '排行榜的股票', '田地圖同一產業', '牧場氣氛', '?q=2330', '?cmp=2330,2454', '?scene=crash']) assert.ok(html.includes(text), text);
  assert.match(html, /<kbd>\?<\/kbd>/);
  assert.match(html, /<kbd>\/<\/kbd>/);
  for (const parameter of ['q=2330', 'cmp=2330,2454', 'scene=crash']) assert.ok(html.includes(`<code>?${parameter}</code>`));
  for (const scene of ['actual', 'down', 'crash', 'flat', 'up']) assert.ok(html.includes(scene));
  assert.equal((html.match(/<dt>/g) ?? []).length, keyboardHelp.length);
  assert.ok(Object.isFrozen(keyboardHelp) && keyboardHelp.every(Object.isFrozen));
});

test('快捷鍵只接受未被處理的單次 / 或 ?，保留編輯、面板、輸入法與組合鍵', () => {
  assert.equal(shortcutAction({ key: '/' }), 'search');
  assert.equal(shortcutAction({ key: '?', shiftKey: true }), 'help');
  for (const key of ['Escape', 'Enter', 'ArrowRight', 'a']) assert.equal(shortcutAction({ key }), null);
  for (const key of ['/', '?']) {
    for (const flag of ['defaultPrevented', 'isComposing', 'repeat', 'ctrlKey', 'metaKey', 'altKey']) assert.equal(shortcutAction({ key, [flag]: true }), null, `${key}: ${flag}`);
    for (const option of ['editing', 'modalOpen']) assert.equal(shortcutAction({ key }, { [option]: true }), null, `${key}: ${option}`);
  }
});

test('鍵盤說明可從按鈕與 ? 開啟，限制面板焦點並在關閉時返回原入口', t => {
  const document = new EventTarget();
  const install = (name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  };
  let modal = null;
  class Element extends EventTarget {
    isConnected = true; tabIndex = 0;
    constructor(id) { super(); this.id = id; }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    matches() { return false; }
    closest(selector) { return selector.startsWith('input,') && this.editing ? this : null; }
  }
  const button = new Element('keyboard-button'), search = new Element('query'), origin = new Element('origin'), close = new Element('close'), summary = new Element('summary');
  const list = {};
  class Dialog extends Element {
    open = false;
    querySelector(selector) { return selector === 'dl' ? list : close; }
    querySelectorAll() { return [close]; }
    showModal() { this.open = true; modal = this; close.focus(); }
    close() { this.open = false; modal = null; this.dispatchEvent(new Event('close')); }
  }
  const dialog = new Dialog('keyboard-help');
  const picker = { open: false, querySelector: () => summary };
  document.activeElement = origin;
  document.querySelector = selector => selector === 'dialog[open]' ? modal : selector === '.logo-picker[open]' && picker.open ? picker : null;
  install('document', document); install('CSS', { escape: value => value });
  createKeyboardHelp({ dialog, button, search });
  const key = (value, { target = document.activeElement, ...extra } = {}) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { key: value, ...extra });
    Object.defineProperty(event, 'target', { value: target });
    document.dispatchEvent(event);
    return event;
  };
  assert.equal(list.innerHTML, keyboardHelpMarkup());
  button.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, true); assert.equal(document.activeElement, close);
  const tab = new Event('keydown', { cancelable: true }); Object.assign(tab, { key: 'Tab', shiftKey: true });
  dialog.dispatchEvent(tab); assert.equal(tab.defaultPrevented, true); assert.equal(document.activeElement, close);
  assert.equal(key('/').defaultPrevented, false, '開啟面板時不移到背景搜尋框');
  close.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, false); assert.equal(document.activeElement, button);
  origin.focus(); assert.equal(key('?', { shiftKey: true }).defaultPrevented, true);
  assert.equal(dialog.open, true);
  // Native dialog Esc emits close; the focus helper restores the original control.
  dialog.close(); assert.equal(document.activeElement, origin);
  assert.equal(key('/').defaultPrevented, true); assert.equal(document.activeElement, search);
  for (const options of [{ editing: true }, { isContentEditable: true }]) {
    const input = Object.assign(new Element('input'), options); input.focus();
    assert.equal(key('?').defaultPrevented, false); assert.equal(dialog.open, false);
  }
  origin.focus();
  modal = new Dialog('other');
  assert.equal(key('?').defaultPrevented, false); assert.equal(dialog.open, false);
  modal = null;
  const prevented = new Event('keydown', { cancelable: true }); Object.assign(prevented, { key: '?' }); prevented.preventDefault();
  document.dispatchEvent(prevented); assert.equal(dialog.open, false);
  assert.equal(key('?', { isComposing: true }).defaultPrevented, false); assert.equal(dialog.open, false);
  picker.open = true;
  assert.equal(key('Escape', { isComposing: true }).defaultPrevented, false); assert.equal(picker.open, true);
  assert.equal(key('Escape').defaultPrevented, true); assert.equal(picker.open, false); assert.equal(document.activeElement, summary);
  assert.equal(key('Escape').defaultPrevented, false, '選單已關閉時不攔截 Esc');
  assert.equal(key('/', { target: document }).defaultPrevented, true, '非元素事件目標也能安全處理');
});
