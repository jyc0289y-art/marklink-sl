// OfficeLink SL — Global Keyboard Shortcuts

import { switchTab, getCurrentTab } from './tabs.js';
import { showToast, toastInfo } from './toast.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Initialize global keyboard shortcuts
 * @param {Object} actions - Map of action names to handler functions
 */
export const initShortcuts = (actions) => {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    const alt = e.altKey;
    const key = e.key.toLowerCase();

    // ─── Escape: close any modal/panel/overlay ───
    if (key === 'escape') {
      const closed = closeTopOverlay();
      if (closed) { e.preventDefault(); return; }
      // Fallback: exit zen mode
      if (document.body.classList.contains('zen-mode')) {
        e.preventDefault();
        actions.exitZen?.();
        return;
      }
    }

    // ─── F11 or Cmd+Enter: Fullscreen toggle ───
    if (key === 'f11' || (mod && key === 'enter' && !shift && !alt)) {
      e.preventDefault();
      actions.fullscreen?.();
      return;
    }

    // ─── Ctrl+Tab / Ctrl+Shift+Tab: Next/Prev tab ───
    if (e.ctrlKey && key === 'tab') {
      e.preventDefault();
      if (shift) {
        actions.prevTab?.();
      } else {
        actions.nextTab?.();
      }
      return;
    }

    // ─── Mod+Alt+1..9: Switch to tab N ───
    if (mod && alt && key >= '1' && key <= '9') {
      e.preventDefault();
      actions.switchToTab?.(parseInt(key, 10));
      return;
    }

    // ─── Mod+O: Open file ───
    if (mod && key === 'o' && !shift && !alt) {
      e.preventDefault();
      actions.open?.();
      return;
    }

    // ─── Mod+S: Save / Mod+Shift+S: Save As ───
    if (mod && key === 's') {
      e.preventDefault();
      if (shift) {
        actions.saveAs?.();
      } else {
        actions.save?.();
      }
      return;
    }

    // ─── Mod+Z: Undo / Mod+Shift+Z: Redo ───
    if (mod && key === 'z') {
      // Don't prevent default for contenteditable/input — let browser handle natively
      const active = document.activeElement;
      const isNativeEditable = active?.isContentEditable ||
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
      if (!isNativeEditable) {
        e.preventDefault();
      }
      if (shift) {
        actions.redo?.();
      } else {
        actions.undo?.();
      }
      return;
    }

    // ─── Mod+Y: Redo (Windows convention) ───
    if (mod && key === 'y' && !shift && !alt) {
      const active = document.activeElement;
      const isNativeEditable = active?.isContentEditable ||
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
      if (!isNativeEditable) {
        e.preventDefault();
      }
      actions.redo?.();
      return;
    }

    // ─── Mod+P: Print/Export PDF ───
    if (mod && key === 'p' && !shift && !alt) {
      e.preventDefault();
      actions.print?.();
      return;
    }

    // ─── Mod+F: Find in current editor ───
    if (mod && key === 'f' && !shift && !alt) {
      e.preventDefault();
      actions.find?.();
      return;
    }

    // ─── Mod+,: Settings/Preferences ───
    if (mod && key === ',') {
      e.preventDefault();
      actions.settings?.();
      return;
    }

    // ─── Mod+B: Bold ───
    if (mod && key === 'b' && !shift && !alt) {
      e.preventDefault();
      actions.bold?.();
      return;
    }

    // ─── Mod+I: Italic ───
    if (mod && key === 'i' && !shift && !alt) {
      e.preventDefault();
      actions.italic?.();
      return;
    }

    // ─── Mod+/: Show keyboard shortcuts help ───
    if (mod && key === '/') {
      e.preventDefault();
      actions.showShortcuts?.();
      return;
    }

    // ─── Mod+Shift+V: Toggle preview-only mode ───
    if (mod && shift && key === 'v') {
      e.preventDefault();
      actions.togglePreviewOnly?.();
      return;
    }
  });
};

/**
 * Close the topmost open overlay/modal/panel
 * @returns {boolean} true if something was closed
 */
const closeTopOverlay = () => {
  // Priority order: modals, overlays, dropdowns, panels
  const selectors = [
    '.kb-shortcuts-overlay',
    '.export-menu',
    '.context-menu',
    '.md-emoji-picker',
    '.template-library-overlay',
    '.feedback-overlay',
    '.tour-tooltip',
    '.version-history-overlay',
    '[class*="modal"]',
    '[class*="overlay"]:not(.app-overlay-permanent)',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      el.remove();
      return true;
    }
  }
  return false;
};

/**
 * Detect platform modifier symbol for display
 */
export const modSymbol = isMac ? '\u2318' : 'Ctrl';
export const shiftSymbol = isMac ? '\u21e7' : 'Shift';
export const altSymbol = isMac ? '\u2325' : 'Alt';

/**
 * Get human-readable shortcut string
 * @param {string} shortcut - e.g. 'mod+s', 'mod+shift+z'
 */
export const formatShortcut = (shortcut) => {
  return shortcut
    .replace(/mod/gi, modSymbol)
    .replace(/shift/gi, shiftSymbol)
    .replace(/alt/gi, altSymbol)
    .replace(/\+/g, '')
    .toUpperCase();
};

/**
 * Add tooltip with shortcut hint to a toolbar button
 * @param {string} buttonId - DOM element ID
 * @param {string} label - Action description
 * @param {string} shortcut - e.g. 'Mod+S'
 */
export const addShortcutHint = (buttonId, label, shortcut) => {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const hint = formatShortcut(shortcut);
  btn.title = `${label} (${hint})`;
  btn.setAttribute('aria-keyshortcuts', shortcut.replace(/mod/gi, isMac ? 'Meta' : 'Control'));
};

/**
 * Bulk-apply shortcut hints to toolbar buttons
 */
export const applyToolbarShortcutHints = () => {
  const hints = [
    ['btn-open',       'Open File',       'Mod+O'],
    ['btn-save',       'Save',            'Mod+S'],
    ['btn-undo',       'Undo',            'Mod+Z'],
    ['btn-redo',       'Redo',            'Mod+Shift+Z'],
    ['btn-bold',       'Bold',            'Mod+B'],
    ['btn-italic',     'Italic',          'Mod+I'],
    ['btn-export',     'Export',          'Mod+P'],
    ['btn-fullscreen', 'Fullscreen',      'F11'],
  ];
  hints.forEach(([id, label, shortcut]) => addShortcutHint(id, label, shortcut));
};
