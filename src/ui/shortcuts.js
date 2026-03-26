// OfficeLink SL — Global Keyboard Shortcuts
// Supports custom shortcut bindings via shortcut-customizer

import { switchTab, getCurrentTab } from './tabs.js';
import { showToast, toastInfo } from './toast.js';
import { matchesShortcut, getAllShortcuts, displayKeys, DEFAULT_SHORTCUTS } from './shortcut-customizer.js';

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
    const activeTab = getCurrentTab();

    // ─── Skip shortcuts when typing in input fields (except mod-combos) ───
    const focused = document.activeElement;
    const isTextInput = focused?.tagName === 'INPUT' || focused?.tagName === 'TEXTAREA';
    const isEditable = focused?.isContentEditable;

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

    // ─── ? key (no modifiers): open shortcuts help panel ───
    if (key === '?' && !mod && !alt && !isTextInput && !isEditable) {
      e.preventDefault();
      actions.showShortcuts?.();
      return;
    }

    // ─── Custom shortcut matching with context awareness ───

    if (matchesShortcut(e, 'fullscreen', activeTab)) {
      e.preventDefault(); actions.fullscreen?.(); return;
    }

    // ─── F11 or Cmd+Enter: Fullscreen toggle (fallback) ───
    if (key === 'f11' || (mod && key === 'enter' && !shift && !alt)) {
      e.preventDefault();
      actions.fullscreen?.();
      return;
    }

    // ─── Ctrl+Tab / Ctrl+Shift+Tab: Next/Prev tab ───
    if (matchesShortcut(e, 'nextTab', activeTab)) {
      e.preventDefault(); actions.nextTab?.(); return;
    }
    if (matchesShortcut(e, 'prevTab', activeTab)) {
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

    // ─── New File ───
    if (matchesShortcut(e, 'newFile', activeTab)) {
      e.preventDefault(); actions.newFile?.(); return;
    }

    // ─── Open ───
    if (matchesShortcut(e, 'open', activeTab)) {
      e.preventDefault(); actions.open?.(); return;
    }

    // ─── Save / Save As ───
    if (matchesShortcut(e, 'saveAs', activeTab)) {
      e.preventDefault(); actions.saveAs?.(); return;
    }
    if (matchesShortcut(e, 'save', activeTab)) {
      e.preventDefault(); actions.save?.(); return;
    }

    // ─── Undo / Redo ───
    if (matchesShortcut(e, 'redo', activeTab) || matchesShortcut(e, 'redoAlt', activeTab)) {
      const isNativeEditable = isEditable || isTextInput;
      if (!isNativeEditable) e.preventDefault();
      actions.redo?.();
      return;
    }
    if (matchesShortcut(e, 'undo', activeTab)) {
      const isNativeEditable = isEditable || isTextInput;
      if (!isNativeEditable) e.preventDefault();
      actions.undo?.();
      return;
    }

    // ─── Print ───
    if (matchesShortcut(e, 'print', activeTab)) {
      e.preventDefault(); actions.print?.(); return;
    }

    // ─── Find ───
    if (matchesShortcut(e, 'find', activeTab)) {
      e.preventDefault(); actions.find?.(); return;
    }

    // ─── Settings ───
    if (matchesShortcut(e, 'settings', activeTab)) {
      e.preventDefault(); actions.settings?.(); return;
    }

    // ─── Bold (context: markdown, document) ───
    if (matchesShortcut(e, 'bold', activeTab)) {
      e.preventDefault(); actions.bold?.(); return;
    }

    // ─── Italic (context: markdown, document) ───
    if (matchesShortcut(e, 'italic', activeTab)) {
      e.preventDefault(); actions.italic?.(); return;
    }

    // ─── Show Shortcuts (Ctrl+/) ───
    if (matchesShortcut(e, 'showShortcuts', activeTab)) {
      e.preventDefault(); actions.showShortcuts?.(); return;
    }

    // ─── Toggle Preview Only (context: markdown) ───
    if (matchesShortcut(e, 'togglePreview', activeTab)) {
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

/**
 * Show the keyboard shortcuts help panel with search/filter.
 * Opens with ? or Ctrl+/ (Cmd+/). Searchable by action name or key.
 * Uses the live shortcut registry (respects custom bindings).
 */
export const showShortcutsHelpPanel = () => {
  // Toggle off if already open
  const existing = document.querySelector('.kb-shortcuts-overlay');
  if (existing) { existing.remove(); return; }

  const all = getAllShortcuts();

  // Add extra non-customizable shortcuts for display
  const extraShortcuts = [
    { label: 'Switch to tab N',    keys: `${modSymbol} ${altSymbol} 1-9`, category: 'Navigation' },
    { label: 'Close modal / Exit zen', keys: 'Esc',                      category: 'General' },
    { label: 'Copy / Cut / Paste', keys: `${modSymbol} C/X/V`,           category: 'Editor',  contextNote: 'Sheet' },
    { label: 'Edit cell',          keys: 'F2',                           category: 'Editor',  contextNote: 'Sheet' },
    { label: 'Edit cell / Confirm', keys: 'Enter',                      category: 'Editor',  contextNote: 'Sheet' },
    { label: 'Move to next cell',  keys: 'Tab',                         category: 'Editor',  contextNote: 'Sheet' },
    { label: 'Clear cell',         keys: 'Del',                         category: 'Editor',  contextNote: 'Sheet' },
    { label: 'Start presentation', keys: 'F5',                          category: 'Editor',  contextNote: 'Slide' },
    { label: 'Duplicate slide',    keys: `${modSymbol} ${shiftSymbol} D`, category: 'Editor', contextNote: 'Slide' },
    { label: 'Navigate slides',    keys: '\u2190 \u2192',               category: 'Editor',  contextNote: 'Slide' },
    { label: 'Exit presentation',  keys: 'Esc',                         category: 'Editor',  contextNote: 'Slide' },
  ];

  // Build categorized list from registry
  const categoryOrder = ['File', 'General', 'Editor', 'Navigation'];
  const categories = {};

  for (const [id, sc] of Object.entries(all)) {
    const cat = sc.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    const def = DEFAULT_SHORTCUTS[id];
    const contextNote = def?.context
      ? (Array.isArray(def.context) ? def.context.join(', ') : def.context)
      : null;
    categories[cat].push({
      label: sc.label,
      keysDisplay: displayKeys(sc.keys),
      isCustom: sc.isCustom,
      contextNote,
    });
  }

  // Add extras
  for (const extra of extraShortcuts) {
    const cat = extra.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({
      label: extra.label,
      keysDisplay: extra.keys,
      isCustom: false,
      contextNote: extra.contextNote || null,
    });
  }

  // Sort categories in preferred order
  const sortedCats = [...new Set([...categoryOrder, ...Object.keys(categories)])]
    .filter((c) => categories[c]);

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'kb-shortcuts-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:var(--bg-primary,#fff);color:var(--text-primary,#222);border-radius:16px;padding:28px 32px;max-width:520px;width:92%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.25)';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px';
  header.innerHTML = `<h3 style="margin:0;font-size:18px">Keyboard Shortcuts</h3>
    <span style="font-size:12px;color:var(--text-secondary,#888)">Press <kbd style="background:var(--sidebar-bg,#f5f5f5);border:1px solid var(--border-color,#ddd);border-radius:3px;padding:1px 5px;font-size:11px;font-family:monospace">?</kbd> or <kbd style="background:var(--sidebar-bg,#f5f5f5);border:1px solid var(--border-color,#ddd);border-radius:3px;padding:1px 5px;font-size:11px;font-family:monospace">${modSymbol}/</kbd> to toggle</span>`;
  panel.appendChild(header);

  // Search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Filter shortcuts...';
  searchInput.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--border-color,#ddd);border-radius:8px;font-size:14px;margin-bottom:12px;background:var(--bg-secondary,#f9f9f9);color:var(--text-primary,#222);outline:none;box-sizing:border-box';
  panel.appendChild(searchInput);

  // Scrollable content area
  const content = document.createElement('div');
  content.style.cssText = 'overflow-y:auto;flex:1;min-height:0';

  const renderShortcuts = (filter) => {
    content.innerHTML = '';
    const lowerFilter = (filter || '').toLowerCase();
    let hasResults = false;

    for (const cat of sortedCats) {
      const items = categories[cat].filter((item) => {
        if (!lowerFilter) return true;
        return item.label.toLowerCase().includes(lowerFilter) ||
               item.keysDisplay.toLowerCase().includes(lowerFilter) ||
               (item.contextNote || '').toLowerCase().includes(lowerFilter);
      });
      if (items.length === 0) continue;
      hasResults = true;

      const catHeader = document.createElement('div');
      catHeader.style.cssText = 'font-size:12px;font-weight:700;color:var(--brand-color,#0071e3);text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px';
      catHeader.textContent = cat;
      content.appendChild(catHeader);

      for (const item of items) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:13px';

        const desc = document.createElement('span');
        desc.style.cssText = 'color:var(--text-secondary,#666);display:flex;align-items:center;gap:6px';
        desc.textContent = item.label;
        if (item.contextNote) {
          const badge = document.createElement('span');
          badge.style.cssText = 'font-size:10px;background:var(--sidebar-bg,#f0f0f0);border:1px solid var(--border-color,#ddd);border-radius:3px;padding:1px 5px;color:var(--text-tertiary,#999)';
          badge.textContent = item.contextNote;
          desc.appendChild(badge);
        }

        const kbd = document.createElement('kbd');
        kbd.style.cssText = `background:var(--sidebar-bg,#f5f5f5);border:1px solid var(--border-color,#ddd);border-radius:4px;padding:2px 8px;font-size:12px;font-family:monospace;white-space:nowrap${item.isCustom ? ';color:var(--brand-color,#0071e3);font-weight:600' : ''}`;
        kbd.textContent = item.keysDisplay;

        row.appendChild(desc);
        row.appendChild(kbd);
        content.appendChild(row);
      }
    }

    if (!hasResults) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:var(--text-secondary,#999);padding:24px 0;font-size:14px';
      empty.textContent = 'No shortcuts match your search.';
      content.appendChild(empty);
    }
  };

  renderShortcuts('');
  panel.appendChild(content);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'margin-top:16px;width:100%;padding:10px;border:none;border-radius:8px;background:#0071e3;color:#fff;font-size:15px;font-weight:600;cursor:pointer';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => overlay.remove());
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Focus the search input
  requestAnimationFrame(() => searchInput.focus());

  // Search filtering
  searchInput.addEventListener('input', () => renderShortcuts(searchInput.value));

  // Prevent search input keystrokes from triggering shortcuts
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      return;
    }
    e.stopPropagation();
  });

  // Click overlay to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
};
