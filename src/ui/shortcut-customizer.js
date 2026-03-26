// OfficeLink SL — Keyboard Shortcut Customizer
// Allows users to view, edit, import/export keyboard shortcuts

import { modSymbol, shiftSymbol, altSymbol, formatShortcut } from './shortcuts.js';
import { toastSuccess, toastError, toastInfo, toastWarning } from './toast.js';
import { t } from './i18n.js';

const STORAGE_KEY = 'officelink-custom-shortcuts';

/**
 * Default shortcut definitions: id -> { keys, label, category }
 * `keys` uses normalized format: mod+shift+key, mod+key, etc.
 */
const DEFAULT_SHORTCUTS = {
  save:            { keys: 'mod+s',           label: 'Save',                 category: 'General' },
  saveAs:          { keys: 'mod+shift+s',     label: 'Save As',              category: 'General' },
  open:            { keys: 'mod+o',           label: 'Open File',            category: 'General' },
  undo:            { keys: 'mod+z',           label: 'Undo',                 category: 'General' },
  redo:            { keys: 'mod+shift+z',     label: 'Redo',                 category: 'General' },
  redoAlt:         { keys: 'mod+y',           label: 'Redo (Alt)',           category: 'General' },
  print:           { keys: 'mod+p',           label: 'Print / Export PDF',   category: 'General' },
  find:            { keys: 'mod+f',           label: 'Find',                 category: 'General' },
  settings:        { keys: 'mod+,',           label: 'Settings',             category: 'General' },
  showShortcuts:   { keys: 'mod+/',           label: 'Show Shortcuts',       category: 'General' },
  fullscreen:      { keys: 'f11',             label: 'Toggle Fullscreen',    category: 'General' },
  bold:            { keys: 'mod+b',           label: 'Bold',                 category: 'Formatting' },
  italic:          { keys: 'mod+i',           label: 'Italic',              category: 'Formatting' },
  togglePreview:   { keys: 'mod+shift+v',     label: 'Toggle Preview',       category: 'Markdown' },
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
 * @returns {string|null} conflicting action label or null
 */
const findConflict = (keys, excludeId) => {
  const all = getAllShortcuts();
  for (const [id, sc] of Object.entries(all)) {
    if (id === excludeId) continue;
    if (sc.keys === keys) return sc.label;
  }
  return null;
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
 * Check if a keyboard event matches a specific shortcut action
 * Used by the global shortcut handler to support custom bindings
 * @param {KeyboardEvent} e
 * @param {string} actionId
 * @returns {boolean}
 */
export const matchesShortcut = (e, actionId) => {
  const target = getShortcutKeys(actionId);
  if (!target) return false;
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `officelink-shortcuts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

    // Check for conflicts
    const conflict = findConflict(normalized, actionId);
    if (conflict) {
      toastWarning(`Conflict: "${conflict}" already uses ${displayKeys(normalized)}`);
      const current = getShortcutKeys(actionId);
      kbdEl.textContent = displayKeys(current);
      return;
    }

    // Apply the new shortcut
    setCustomShortcut(actionId, normalized);
    kbdEl.textContent = displayKeys(normalized);

    const isCustom = normalized !== DEFAULT_SHORTCUTS[actionId]?.keys;
    keysSpan.classList.toggle('shortcut-custom', isCustom);
    const resetBtn = row.querySelector('.shortcut-reset-btn');
    if (resetBtn) resetBtn.style.display = isCustom ? '' : 'none';

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
