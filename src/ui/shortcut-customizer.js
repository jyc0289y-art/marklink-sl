// OfficeLink SL — Keyboard Shortcut Customizer
// Allows users to view, edit, import/export keyboard shortcuts

import { modSymbol, shiftSymbol, altSymbol, formatShortcut } from './shortcuts.js';
import { toastSuccess, toastError, toastInfo, toastWarning } from './toast.js';
import { t } from './i18n.js';
import { downloadBlob } from '../utils/download.js';

const STORAGE_KEY = 'officelink-custom-shortcuts';

/**
 * Default shortcut definitions: id -> { keys, label, category }
 * `keys` uses normalized format: mod+shift+key, mod+key, etc.
 */
/**
 * Default shortcut definitions: id -> { keys, label, category, context }
 * `keys` uses normalized format: mod+shift+key, mod+key, etc.
 * `context` limits when the shortcut is active:
 *   - undefined/null = always active (global)
 *   - string = active only when that tab is current (e.g. 'sheet', 'markdown')
 *   - array = active when any of the listed tabs is current
 */
export const DEFAULT_SHORTCUTS = {
  // ─── File ───
  save:            { keys: 'mod+s',           label: 'Save',                 category: 'File' },
  saveAs:          { keys: 'mod+shift+s',     label: 'Save As',              category: 'File' },
  open:            { keys: 'mod+o',           label: 'Open File',            category: 'File' },
  print:           { keys: 'mod+p',           label: 'Print / Export PDF',   category: 'File' },

  // ─── General ───
  undo:            { keys: 'mod+z',           label: 'Undo',                 category: 'General' },
  redo:            { keys: 'mod+shift+z',     label: 'Redo',                 category: 'General' },
  redoAlt:         { keys: 'mod+y',           label: 'Redo (Alt)',           category: 'General' },
  find:            { keys: 'mod+f',           label: 'Find',                 category: 'General' },
  settings:        { keys: 'mod+,',           label: 'Settings',             category: 'General' },
  showShortcuts:   { keys: 'mod+/',           label: 'Show Shortcuts',       category: 'General' },
  fullscreen:      { keys: 'f11',             label: 'Toggle Fullscreen',    category: 'General' },

  // ─── Editor (markdown/document) ───
  bold:            { keys: 'mod+b',           label: 'Bold',                 category: 'Editor',     context: ['markdown', 'document'] },
  italic:          { keys: 'mod+i',           label: 'Italic',              category: 'Editor',     context: ['markdown', 'document'] },
  togglePreview:   { keys: 'mod+shift+v',     label: 'Toggle Preview',       category: 'Editor',     context: 'markdown' },

  // ─── Navigation ───
  nextTab:         { keys: 'ctrl+tab',        label: 'Next Tab',             category: 'Navigation' },
  prevTab:         { keys: 'ctrl+shift+tab',  label: 'Previous Tab',         category: 'Navigation' },
};

/** Current custom overrides (merged with defaults) */
let customShortcuts = {};

/**
 * Load custom shortcuts from localStorage
 */
export const loadCustomShortcuts = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    customShortcuts = saved;
  } catch {
    customShortcuts = {};
  }
};

/**
 * Save custom shortcuts to localStorage
 */
const saveCustomShortcuts = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customShortcuts));
  } catch { /* quota */ }
};

/**
 * Get the effective shortcut keys for an action
 * @param {string} actionId
 * @returns {string} normalized keys string
 */
export const getShortcutKeys = (actionId) => {
  if (customShortcuts[actionId]) return customShortcuts[actionId];
  return DEFAULT_SHORTCUTS[actionId]?.keys || '';
};

/**
 * Get all shortcuts (defaults merged with custom)
 * @returns {Object} id -> { keys, label, category }
 */
export const getAllShortcuts = () => {
  const result = {};
  for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
    result[id] = {
      ...def,
      keys: customShortcuts[id] || def.keys,
      isCustom: !!customShortcuts[id],
    };
  }
  return result;
};

/**
 * Check if a key combination conflicts with another shortcut
 * @param {string} keys - normalized key string
 * @param {string} excludeId - action to exclude from conflict check
 * @returns {{ id: string, label: string } | null} conflicting action or null
 */
const findConflict = (keys, excludeId) => {
  const all = getAllShortcuts();
  for (const [id, sc] of Object.entries(all)) {
    if (id === excludeId) continue;
    if (sc.keys === keys) return { id, label: sc.label };
  }
  return null;
};

/**
 * Show a conflict confirmation dialog and return user's choice
 * @param {string} conflictLabel - label of the conflicting action
 * @param {string} keysDisplay - formatted key display string
 * @returns {Promise<boolean>} true if user wants to override
 */
const showConflictDialog = (conflictLabel, keysDisplay) => {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'shortcut-conflict-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-primary,#fff);color:var(--text-primary,#222);border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.25)';

    dialog.innerHTML = `
      <h4 style="margin:0 0 12px;font-size:16px;color:var(--warning-color,#f0ad4e)">Shortcut Conflict</h4>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5">
        This shortcut (<kbd style="background:var(--sidebar-bg,#f5f5f5);border:1px solid var(--border-color,#ddd);border-radius:4px;padding:1px 6px;font-family:monospace">${keysDisplay}</kbd>)
        is already assigned to <strong>"${conflictLabel}"</strong>. Override?
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="conflict-cancel" style="padding:8px 16px;border:1px solid var(--border-color,#ddd);border-radius:6px;background:var(--bg-secondary,#f5f5f5);color:var(--text-primary,#222);cursor:pointer;font-size:14px">Cancel</button>
        <button class="conflict-override" style="padding:8px 16px;border:none;border-radius:6px;background:#f0ad4e;color:#fff;cursor:pointer;font-size:14px;font-weight:600">Override</button>
      </div>`;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    dialog.querySelector('.conflict-cancel').addEventListener('click', () => cleanup(false));
    dialog.querySelector('.conflict-override').addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(false); }
    });
  });
};

/**
 * Normalize a KeyboardEvent into a shortcut key string
 * @param {KeyboardEvent} e
 * @returns {string}
 */
const normalizeKeyEvent = (e) => {
  const parts = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  let key = e.key.toLowerCase();
  // Skip modifier-only presses
  if (['control', 'meta', 'shift', 'alt'].includes(key)) return '';
  // Normalize special keys
  if (key === ' ') key = 'space';
  if (key === 'arrowup') key = 'up';
  if (key === 'arrowdown') key = 'down';
  if (key === 'arrowleft') key = 'left';
  if (key === 'arrowright') key = 'right';

  parts.push(key);
  return parts.join('+');
};

/**
 * Format keys for display with platform symbols
 * @param {string} keys - normalized key string like 'mod+shift+s'
 * @returns {string}
 */
export const displayKeys = (keys) => {
  if (!keys) return '—';
  return keys
    .split('+')
    .map((part) => {
      if (part === 'mod') return modSymbol;
      if (part === 'shift') return shiftSymbol;
      if (part === 'alt') return altSymbol;
      if (part === 'ctrl') return 'Ctrl';
      if (part === 'tab') return 'Tab';
      if (part === 'escape') return 'Esc';
      if (part === 'space') return 'Space';
      if (part === 'enter') return 'Enter';
      if (part === 'backspace') return 'Bksp';
      if (part === 'delete') return 'Del';
      if (part.startsWith('f') && !isNaN(part.slice(1))) return part.toUpperCase();
      return part.toUpperCase();
    })
    .join(' ');
};

/**
 * Set a custom shortcut for an action
 * @param {string} actionId
 * @param {string} keys - normalized
 */
export const setCustomShortcut = (actionId, keys) => {
  if (keys === DEFAULT_SHORTCUTS[actionId]?.keys) {
    delete customShortcuts[actionId];
  } else {
    customShortcuts[actionId] = keys;
  }
  saveCustomShortcuts();
};

/**
 * Reset a single shortcut to default
 * @param {string} actionId
 */
export const resetShortcut = (actionId) => {
  delete customShortcuts[actionId];
  saveCustomShortcuts();
};

/**
 * Reset all shortcuts to defaults
 */
export const resetAllShortcuts = () => {
  customShortcuts = {};
  saveCustomShortcuts();
};

/**
 * Export shortcuts as JSON string
 * @returns {string}
 */
export const exportShortcuts = () => {
  return JSON.stringify(customShortcuts, null, 2);
};

/**
 * Import shortcuts from JSON string
 * @param {string} json
 * @returns {boolean} success
 */
export const importShortcuts = (json) => {
  try {
    const data = JSON.parse(json);
    if (typeof data !== 'object' || Array.isArray(data)) return false;
    // Validate keys
    for (const [id, keys] of Object.entries(data)) {
      if (!DEFAULT_SHORTCUTS[id]) continue;
      if (typeof keys !== 'string') continue;
      customShortcuts[id] = keys;
    }
    saveCustomShortcuts();
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if a keyboard event matches a specific shortcut action.
 * When `activeTab` is provided, context-restricted shortcuts are only
 * matched if the active tab is in their allowed context list.
 * @param {KeyboardEvent} e
 * @param {string} actionId
 * @param {string} [activeTab] - current active tab id for context filtering
 * @returns {boolean}
 */
export const matchesShortcut = (e, actionId, activeTab) => {
  const target = getShortcutKeys(actionId);
  if (!target) return false;

  // Context-aware filtering: skip if shortcut has a context restriction
  // and the active tab doesn't match
  if (activeTab) {
    const def = DEFAULT_SHORTCUTS[actionId];
    if (def?.context) {
      const allowed = Array.isArray(def.context) ? def.context : [def.context];
      if (!allowed.includes(activeTab)) return false;
    }
  }

  const normalized = normalizeKeyEvent(e);
  return normalized === target;
};

/**
 * Build the keyboard shortcuts settings tab UI
 * @returns {HTMLElement}
 */
export const buildShortcutsSettingsPanel = () => {
  const container = document.createElement('div');
  container.className = 'shortcuts-settings-panel';

  // Group by category
  const all = getAllShortcuts();
  const categories = {};
  for (const [id, sc] of Object.entries(all)) {
    if (!categories[sc.category]) categories[sc.category] = [];
    categories[sc.category].push({ id, ...sc });
  }

  for (const [category, shortcuts] of Object.entries(categories)) {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const heading = document.createElement('label');
    heading.className = 'settings-label';
    heading.textContent = category;
    section.appendChild(heading);

    const table = document.createElement('div');
    table.className = 'shortcut-table';

    for (const sc of shortcuts) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      row.dataset.actionId = sc.id;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'shortcut-action-label';
      labelSpan.textContent = sc.label;

      const keysSpan = document.createElement('span');
      keysSpan.className = 'shortcut-keys-display';
      if (sc.isCustom) keysSpan.classList.add('shortcut-custom');

      const kbd = document.createElement('kbd');
      kbd.className = 'shortcut-kbd';
      kbd.textContent = displayKeys(sc.keys);
      keysSpan.appendChild(kbd);

      const actions = document.createElement('span');
      actions.className = 'shortcut-row-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'settings-btn settings-btn-small shortcut-edit-btn';
      editBtn.textContent = t('shortcuts.edit');
      editBtn.addEventListener('click', () => {
        startCapture(row, sc.id, kbd, keysSpan);
      });

      const resetBtn = document.createElement('button');
      resetBtn.className = 'settings-btn settings-btn-small shortcut-reset-btn';
      resetBtn.textContent = t('shortcuts.reset');
      resetBtn.style.display = sc.isCustom ? '' : 'none';
      resetBtn.addEventListener('click', () => {
        resetShortcut(sc.id);
        kbd.textContent = displayKeys(DEFAULT_SHORTCUTS[sc.id].keys);
        keysSpan.classList.remove('shortcut-custom');
        resetBtn.style.display = 'none';
        toastSuccess(`"${sc.label}" reset to default`);
      });

      actions.appendChild(editBtn);
      actions.appendChild(resetBtn);

      row.appendChild(labelSpan);
      row.appendChild(keysSpan);
      row.appendChild(actions);
      table.appendChild(row);
    }

    section.appendChild(table);
    container.appendChild(section);
  }

  // Bottom actions: Reset All, Export, Import
  const bottomActions = document.createElement('div');
  bottomActions.className = 'shortcut-bottom-actions';

  const resetAllBtn = document.createElement('button');
  resetAllBtn.className = 'settings-btn settings-btn-danger';
  resetAllBtn.textContent = t('shortcuts.resetAll');
  resetAllBtn.addEventListener('click', () => {
    resetAllShortcuts();
    // Refresh the panel
    container.innerHTML = '';
    const newPanel = buildShortcutsSettingsPanel();
    container.replaceWith(newPanel);
    toastSuccess('All shortcuts reset to defaults');
  });

  const exportBtn = document.createElement('button');
  exportBtn.className = 'settings-btn settings-btn-primary';
  exportBtn.textContent = t('shortcuts.export');
  exportBtn.addEventListener('click', () => {
    const json = exportShortcuts();
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `officelink-shortcuts-${new Date().toISOString().slice(0, 10)}.json`);
    toastSuccess('Shortcuts exported');
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'settings-btn';
  importBtn.textContent = t('shortcuts.import');
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (importShortcuts(text)) {
          container.innerHTML = '';
          const newPanel = buildShortcutsSettingsPanel();
          container.replaceWith(newPanel);
          toastSuccess('Shortcuts imported. Reload recommended.');
        } else {
          toastError('Invalid shortcuts file');
        }
      } catch {
        toastError('Failed to read file');
      }
    });
    input.click();
  });

  bottomActions.appendChild(resetAllBtn);
  bottomActions.appendChild(exportBtn);
  bottomActions.appendChild(importBtn);
  container.appendChild(bottomActions);

  return container;
};

/**
 * Apply a shortcut key binding to a row's UI elements
 */
const applyShortcutToRow = (actionId, normalized, kbdEl, keysSpan, row) => {
  setCustomShortcut(actionId, normalized);
  kbdEl.textContent = displayKeys(normalized);
  const isCustom = normalized !== DEFAULT_SHORTCUTS[actionId]?.keys;
  keysSpan.classList.toggle('shortcut-custom', isCustom);
  const resetBtn = row.querySelector('.shortcut-reset-btn');
  if (resetBtn) resetBtn.style.display = isCustom ? '' : 'none';
};

/**
 * Start capturing a key combination for a shortcut
 */
const startCapture = (row, actionId, kbdEl, keysSpan) => {
  // Remove any existing capture UI
  document.querySelectorAll('.shortcut-capture-active').forEach((el) => {
    el.classList.remove('shortcut-capture-active');
  });

  row.classList.add('shortcut-capture-active');
  kbdEl.textContent = t('shortcuts.pressKeys');
  kbdEl.classList.add('shortcut-capturing');

  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const normalized = normalizeKeyEvent(e);
    if (!normalized) return; // modifier-only press

    document.removeEventListener('keydown', handler, true);
    row.classList.remove('shortcut-capture-active');
    kbdEl.classList.remove('shortcut-capturing');

    // Check for Escape to cancel
    if (e.key === 'Escape') {
      const current = getShortcutKeys(actionId);
      kbdEl.textContent = displayKeys(current);
      toastInfo('Shortcut edit cancelled');
      return;
    }

    // Check for conflicts — show confirmation dialog if conflict found
    const conflict = findConflict(normalized, actionId);
    if (conflict) {
      const keysDisp = displayKeys(normalized);
      showConflictDialog(conflict.label, keysDisp).then((override) => {
        if (!override) {
          const current = getShortcutKeys(actionId);
          kbdEl.textContent = displayKeys(current);
          toastInfo('Shortcut edit cancelled');
          return;
        }
        // Clear the conflicting shortcut and apply
        setCustomShortcut(conflict.id, '');
        applyShortcutToRow(actionId, normalized, kbdEl, keysSpan, row);
        // Update the conflicting row's display if visible
        const conflictRow = document.querySelector(`.shortcut-row[data-action-id="${conflict.id}"]`);
        if (conflictRow) {
          const ckbd = conflictRow.querySelector('.shortcut-kbd');
          if (ckbd) ckbd.textContent = displayKeys(DEFAULT_SHORTCUTS[conflict.id]?.keys || '');
          const ckeys = conflictRow.querySelector('.shortcut-keys-display');
          if (ckeys) ckeys.classList.remove('shortcut-custom');
          const creset = conflictRow.querySelector('.shortcut-reset-btn');
          if (creset) creset.style.display = 'none';
        }
        toastSuccess(`Shortcut overridden: ${keysDisp}`);
      });
      return;
    }

    // Apply the new shortcut (no conflict)
    applyShortcutToRow(actionId, normalized, kbdEl, keysSpan, row);
    toastSuccess(`Shortcut updated: ${displayKeys(normalized)}`);
  };

  document.addEventListener('keydown', handler, true);
};

/**
 * Initialize shortcut customizer — load saved shortcuts on startup
 */
export const initShortcutCustomizer = () => {
  loadCustomShortcuts();
};
