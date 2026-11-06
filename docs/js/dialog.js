const focusableSelector = 'button, a[href], input, select, textarea, [tabindex]';
const stockAttributes = ['data-stock-key', 'data-key', 'data-watch-stock', 'data-compare-stock', 'data-compare', 'data-watch'];

function available(element) {
  if (!element || element.isConnected === false) return false;
  if (typeof element.matches === 'function') {
    try {
      if (element.matches(':disabled, [hidden], [inert]')) return false;
    } catch { /* mock environments may lack CSS selectors */ }
  }
  // Ignore bogus closest() mocks that return the node for every selector.
  if (typeof element.closest === 'function') {
    const hidden = element.closest('[hidden], [inert]');
    if (hidden && hidden !== element) return false;
  }
  if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
  return true;
}

function attrValue(target, name) {
  if (typeof target.getAttribute === 'function' && typeof target.hasAttribute === 'function') {
    return target.hasAttribute(name) ? target.getAttribute(name) : null;
  }
  const camel = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const value = target.dataset?.[camel];
  return value == null || value === '' ? null : String(value);
}

// Resolve the same control after a snapshot replaces its DOM node.
function rememberFocus(target) {
  if (!target) return () => null;
  let selector = target.id ? `#${CSS.escape(target.id)}` : null;
  if (!selector) {
    const attribute = stockAttributes.find(name => attrValue(target, name) != null);
    if (attribute) {
      const value = attrValue(target, attribute);
      const region = typeof target.closest === 'function' ? target.closest('[id]') : null;
      const tag = target.localName || 'button';
      selector = `${region?.id ? `#${CSS.escape(region.id)} ` : ''}${tag}[${attribute}="${CSS.escape(value)}"]`;
    }
  }
  return () => available(target) ? target : selector ? document.querySelector(selector) : null;
}

export function createDialogFocus(dialog, { fallback = () => document.getElementById('refresh') } = {}) {
  let resolveReturn = () => null;
  const controls = () => [...(dialog.querySelectorAll?.(focusableSelector) ?? [])].filter(el => (el.tabIndex ?? 0) >= 0 && available(el));
  function returnTarget() {
    const target = resolveReturn();
    return available(target) ? target : fallback();
  }
  function show(trigger = document.activeElement) {
    if (dialog.open) return;
    resolveReturn = rememberFocus(trigger);
    dialog.showModal();
  }
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    const target = returnTarget();
    const active = document.activeElement;
    // If focus already sits in a different open dialog, do not steal it.
    if (active && typeof active.closest === 'function') {
      const other = active.closest('dialog[open]');
      if (other && other !== dialog) return;
    }
    if (available(target)) target.focus?.({ preventScroll: true });
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = controls(), first = buttons[0], last = buttons.at(-1), active = document.activeElement;
    if (!first) { event.preventDefault(); dialog.focus?.(); return; }
    if (!buttons.includes(active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus?.();
    }
  });
  function preserveFocus(render) {
    const active = document.activeElement;
    const resolve = dialog.open && typeof dialog.contains === 'function' && dialog.contains(active)
      ? rememberFocus(active)
      : null;
    render();
    if (resolve && !available(active)) (resolve() ?? controls()[0] ?? dialog).focus?.({ preventScroll: true });
  }
  return { show, returnTarget, preserveFocus };
}
