import { escapeHtml as esc } from './display.js';
import { createDialogFocus } from './dialog.js';

export const keyboardHelp = Object.freeze([
  ['/', '移到股票搜尋框。'],
  ['Esc', '關閉目前的明細、比較、分享或鍵盤說明；也可收起標誌選單。'],
  ['← / →', '在排行榜頁籤切換漲幅榜、跌幅榜與成交量榜。'],
  ['↑ / ↓', '在排行榜的股票之間移動；Enter 開啟明細。Home / End 移到首尾。'],
  ['?', '開啟鍵盤說明（輸入文字時不會觸發快捷鍵）。'],
  ['?q=2330', '在網址指定股票代碼，直接開啟個股明細。'],
  ['?cmp=2330,2454', '在網址指定兩檔股票代碼，開啟比較。'],
  ['?scene=crash', '預覽牧場氣氛：actual 實際、down 小跌、crash 大跌、flat 平盤、up 大漲；報價維持實際資料。'],
  ['Tab / Enter', '移到「更新資料」後按 Enter，重新取得快照；盤中頁面也會自動更新。']
].map(entry => Object.freeze(entry)));

export function keyboardHelpMarkup() {
  return keyboardHelp.map(([key, description]) => `<div><dt><code>${esc(key)}</code></dt><dd>${esc(description)}</dd></div>`).join('');
}

export function shortcutAction(event, { editing = false, modalOpen = false } = {}) {
  if (editing || modalOpen || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  return event.key === '?' ? 'help' : event.key === '/' ? 'search' : null;
}

export function createKeyboardHelp({ dialog, button, search }) {
  const focus = createDialogFocus(dialog, { fallback: () => button });
  dialog.querySelector('dl').innerHTML = keyboardHelpMarkup();
  button.addEventListener('click', () => focus.show(button));
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  document.addEventListener('keydown', event => {
    const modalOpen = Boolean(document.querySelector('dialog[open]'));
    if (event.key === 'Escape' && !modalOpen) {
      const picker = document.querySelector('.logo-picker[open]');
      if (picker) { event.preventDefault(); picker.open = false; picker.querySelector('summary').focus(); }
    }
    const action = shortcutAction(event, {
      editing: Boolean(event.target.isContentEditable || event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')),
      modalOpen
    });
    if (!action) return;
    event.preventDefault();
    if (action === 'help') focus.show(); else search.focus();
  });
}
