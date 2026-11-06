import { escapeHtml as esc } from './display.js';
import { createDialogFocus } from './dialog.js';

export const keyboardHelp = Object.freeze([
  ['Tab / Shift+Tab', '依序或反向移動焦點；開啟面板時，焦點會留在面板內。'],
  ['Enter / Space', '啟用目前的按鈕，例如更新資料、開啟股票明細或清除搜尋與篩選；也可展開或收合產業。'],
  ['/', '移到股票搜尋框。'],
  ['?', '開啟鍵盤說明；一般鍵盤可按 Shift+/。'],
  ['Esc', '關閉最上層的明細、比較、分享或鍵盤說明，並返回開啟前的控制項；也可收起標誌選單。'],
  ['← / →', '在排行榜頁籤切換漲幅榜、跌幅榜與成交量榜；Home / End 移到第一個或最後一個頁籤。'],
  ['↑ / ↓', '在排行榜的股票之間移動；Home / End 移到第一檔或最後一檔。'],
  ['← / → / ↑ / ↓', '在田地圖同一產業內，依欄或列移動；Home / End 移到該產業第一塊或最後一塊田。'],
  ['方向鍵', '焦點在牧場氣氛選項時，切換實際、小跌、大跌、平盤與大漲預覽。'],
  ['?q=2330', '在網址指定股票代碼，直接開啟個股明細。'],
  ['?cmp=2330,2454', '在網址指定兩檔股票代碼，開啟比較。'],
  ['?scene=crash', '預覽牧場氣氛：actual 實際、down 小跌、crash 大跌、flat 平盤、up 大漲；報價維持實際資料。']
].map(entry => Object.freeze(entry)));

export function keyboardHelpMarkup() {
  return keyboardHelp.map(([key, description]) => {
    const tag = key.startsWith('?') && key !== '?' ? 'code' : 'kbd';
    return `<div><dt><${tag}>${esc(key)}</${tag}></dt><dd>${esc(description)}</dd></div>`;
  }).join('');
}

export function shortcutAction(event, { editing = false, modalOpen = false } = {}) {
  if (editing || modalOpen || event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  return event.key === '?' ? 'help' : event.key === '/' ? 'search' : null;
}

export function createKeyboardHelp({ dialog, button, search }) {
  const focus = createDialogFocus(dialog, { fallback: () => button });
  dialog.querySelector('dl').innerHTML = keyboardHelpMarkup();
  button.addEventListener('click', () => focus.show(button));
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    const modalOpen = Boolean(document.querySelector('dialog[open]'));
    if (event.key === 'Escape' && !modalOpen) {
      const picker = document.querySelector('.logo-picker[open]');
      if (picker) { event.preventDefault(); picker.open = false; picker.querySelector('summary').focus(); }
    }
    const action = shortcutAction(event, {
      editing: Boolean(event.target?.isContentEditable || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')),
      modalOpen
    });
    if (!action) return;
    event.preventDefault();
    if (action === 'help') focus.show(); else search.focus();
  });
}
