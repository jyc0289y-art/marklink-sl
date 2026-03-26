// OfficeLink SL — Global Keyboard Shortcuts
// Supports custom shortcut bindings via shortcut-customizer

import { switchTab, getCurrentTab } from './tabs.js';
import { showToast, toastInfo } from './toast.js';
import { matchesShortcut } from './shortcut-customizer.js';

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

    // ─── Custom shortcut matching (takes priority for remapped keys) ───

    if (matchesShortcut(e, 'fullscreen')) {
      e.preventDefault(); actions.fullscreen?.(); return;
    }

    // ─── F11 or Cmd+Enter: Fullscreen toggle (fallback) ───
    if (key === 'f11' || (mod && key === 'enter' && !shift && !alt)) {
      e.preventDefault();
      actions.fullscreen?.();
      return;
    }

    // ─── Ctrl+Tab / Ctrl+Shift+Tab: Next/Prev tab ───
    if (matchesShortcut(e, 'nextTab')) {
      e.preventDefault(); actions.nextTab?.(); return;
    }
    if (matchesShortcut(e, 'prevTab')) {
      e.preventDefault(); actions.prevTab?.(); return;
    }
    if (e.ctrlKey && key === 'tab') {
      e.preventDefault();
      if (shift) { actions.prevTab?.(); } else { actions.nextTab?.(); }
      return;
    }

    // ─── Mod+Alt+1..9: Switch to tab N ───
    if (mod && alt && key >= '1' && key <= '9') {
      e.preventDefault();
      actions.switchToTab?.(parseInt(key, 10));
      return;
    }

    // ─── Open ───
    if (matchesShortcut(e, 'open')) {
      e.preventDefault(); actions.open?.(); return;
    }

    // ─── Save / Save As ───
    if (matchesShortcut(e, 'saveAs')) {
      e.preventDefault(); actions.saveAs?.(); return;
    }
    if (matchesShortcut(e, 'save')) {
      e.preventDefault(); actions.save?.(); return;
    }

    // ─── Undo / Redo ───
    if (matchesShortcut(e, 'redo') || matchesShortcut(e, 'redoAlt')) {
      const active = document.activeElement;
      const isNativeEditable = active?.isContentEditable ||
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
      if (!isNativeEditable) e.preventDefault();
      actions.redo?.();
      return;
    }
    if (matchesShortcut(e, 'undo')) {
      const active = document.activeElement;
      const isNativeEditable = active?.isContentEditable ||
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
      if (!isNativeEditable) e.preventDefault();
      actions.undo?.();
      return;
    }

    // ─── Print ───
    if (matchesShortcut(e, 'print')) {
      e.preventDefault(); actions.print?.(); return;
    }

    // ─── Find ───
    if (matchesShortcut(e, 'find')) {
      e.preventDefault(); actions.find?.(); return;
    }

    // ─── Settings ───
    if (matchesShortcut(e, 'settings')) {
      e.preventDefault(); actions.settings?.(); return;
    }

    // ─── Bold ───
    if (matchesShortcut(e, 'bold')) {
      e.preventDefault(); actions.bold?.(); return;
    }

    // ─── Italic ───
    if (matchesShortcut(e, 'italic')) {
      e.preventDefault(); actions.italic?.(); return;
    }

    // ─── Show Shortcuts ───
    if (matchesShortcut(e, 'showShortcuts')) {
      e.preventDefault(); actions.showShortcuts?.(); return;
    }

    // ─── Toggle Preview Only ───
    if (matchesShortcut(e, 'togglePreview')) {
      e.preventDefault(); actions.togglePreviewOnly?.(); return;
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
    '.settings-overlay',
    '.feedback-overlay',
    '.perf-dashboard-overlay',
    '.clipboard-history-overlay',
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
    ['btn-settings',   'Settings',        'Mod+,'],
  ];
  hints.forEach(([id, label, shortcut]) => addShortcutHint(id, label, shortcut));
};
