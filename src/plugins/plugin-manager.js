// OfficeLink SL — Plugin System
// Lightweight plugin architecture with lifecycle hooks, API, and built-in plugins

import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';
import { getCurrentTab, onTabChange } from '../ui/tabs.js';
import { getContent, setContent } from '../editor/editor.js';
import { t } from '../ui/i18n.js';

// ── Plugin Registry ──
const plugins = new Map();        // id → { plugin, enabled, initialized }
const eventBus = new Map();       // event → Set<handler>
const toolbarButtons = [];        // { tabName, icon, title, onClick, pluginId }
const menuItems = [];             // { menu, label, onClick, pluginId }
const statusBarWidgets = [];      // { id, el, pluginId }

const STORAGE_KEY = 'officelink-plugins-state';

// ── Event Bus ──
const emit = (event, ...args) => {
  const handlers = eventBus.get(event);
  if (handlers) handlers.forEach((fn) => { try { fn(...args); } catch (e) { console.warn(`[Plugin] Event handler error (${event}):`, e); } });
};

// ── Plugin API (passed to init()) ──
const createPluginAPI = (pluginId) => ({
  registerToolbarButton: (tabName, { icon, title, onClick }) => {
    toolbarButtons.push({ tabName, icon, title, onClick, pluginId });
    renderToolbarButton(tabName, icon, title, onClick, pluginId);
  },

  registerMenuItem: (menu, { label, onClick }) => {
    menuItems.push({ menu, label, onClick, pluginId });
  },

  showToast: (message, type = 'info') => {
    if (type === 'success') toastSuccess(message);
    else if (type === 'error') toastError(message);
    else toastInfo(message);
  },

  getCurrentTab: () => getCurrentTab(),

  getEditorContent: (tabName) => {
    if (tabName === 'markdown') return getContent();
    if (tabName === 'document') {
      const docEl = document.getElementById('doc-editor');
      return docEl ? docEl.innerHTML : '';
    }
    return '';
  },

  setEditorContent: (tabName, content) => {
    if (tabName === 'markdown') setContent(content);
    else if (tabName === 'document') {
      const docEl = document.getElementById('doc-editor');
      if (docEl) docEl.innerHTML = content;
    }
  },

  on: (event, handler) => {
    if (!eventBus.has(event)) eventBus.set(event, new Set());
    eventBus.get(event).add(handler);
  },

  off: (event, handler) => {
    const handlers = eventBus.get(event);
    if (handlers) handlers.delete(handler);
  },

  addStatusBarWidget: (id, el) => {
    statusBarWidgets.push({ id, el, pluginId });
    const statusBar = document.querySelector('.status-bar') || document.getElementById('status-bar');
    if (statusBar) statusBar.appendChild(el);
  },

  removeStatusBarWidget: (id) => {
    const idx = statusBarWidgets.findIndex((w) => w.id === id && w.pluginId === pluginId);
    if (idx >= 0) {
      statusBarWidgets[idx].el.remove();
      statusBarWidgets.splice(idx, 1);
    }
  },
});

// ── Toolbar Button Rendering ──
const renderToolbarButton = (tabName, icon, title, onClick, pluginId) => {
  const toolbar = document.getElementById('toolbar') || document.querySelector('.toolbar');
  if (!toolbar) return;
  const btn = document.createElement('button');
  btn.className = 'toolbar-btn plugin-toolbar-btn';
  btn.dataset.pluginId = pluginId;
  btn.dataset.tabName = tabName;
  btn.title = title;
  btn.innerHTML = icon;
  btn.addEventListener('click', onClick);
  toolbar.appendChild(btn);
};

// ── State Persistence ──
const loadPluginStates = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

const savePluginStates = () => {
  const states = {};
  plugins.forEach((entry, id) => {
    states[id] = { enabled: entry.enabled };
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(states)); } catch { /* quota */ }
};

// ── Core Plugin Manager ──

/**
 * Register a plugin definition
 * @param {Object} plugin - Plugin definition with id, name, version, init, destroy, etc.
 */
export const registerPlugin = (plugin) => {
  if (!plugin.id || !plugin.name) {
    console.warn('[Plugin] Invalid plugin: missing id or name');
    return;
  }
  if (plugins.has(plugin.id)) {
    console.warn(`[Plugin] Plugin "${plugin.id}" already registered`);
    return;
  }

  const savedStates = loadPluginStates();
  const enabled = savedStates[plugin.id]?.enabled ?? true;

  plugins.set(plugin.id, {
    plugin,
    enabled,
    initialized: false,
  });

  if (enabled) {
    initPlugin(plugin.id);
  }
};

/**
 * Initialize a plugin (call its init with API)
 */
const initPlugin = (id) => {
  const entry = plugins.get(id);
  if (!entry || entry.initialized) return;

  try {
    const api = createPluginAPI(id);
    entry.plugin.init?.(api);
    entry.initialized = true;
  } catch (e) {
    console.error(`[Plugin] Failed to init "${id}":`, e);
    toastError(`Plugin "${entry.plugin.name}" failed to load`);
  }
};

/**
 * Enable a plugin
 */
export const enablePlugin = (id) => {
  const entry = plugins.get(id);
  if (!entry) return;
  entry.enabled = true;
  if (!entry.initialized) initPlugin(id);
  savePluginStates();
};

/**
 * Disable a plugin
 */
export const disablePlugin = (id) => {
  const entry = plugins.get(id);
  if (!entry) return;
  entry.enabled = false;

  if (entry.initialized) {
    try { entry.plugin.destroy?.(); } catch (e) { console.warn(`[Plugin] Destroy error for "${id}":`, e); }
    entry.initialized = false;
    // Remove toolbar buttons
    document.querySelectorAll(`.plugin-toolbar-btn[data-plugin-id="${id}"]`).forEach((el) => el.remove());
    // Remove status bar widgets
    const widgetIdxs = [];
    statusBarWidgets.forEach((w, i) => { if (w.pluginId === id) { w.el.remove(); widgetIdxs.push(i); } });
    for (let i = widgetIdxs.length - 1; i >= 0; i--) statusBarWidgets.splice(widgetIdxs[i], 1);
  }
  savePluginStates();
};

/**
 * Toggle plugin enabled state
 */
export const togglePlugin = (id) => {
  const entry = plugins.get(id);
  if (!entry) return;
  if (entry.enabled) disablePlugin(id);
  else enablePlugin(id);
};

/**
 * Get all registered plugins (for settings UI)
 * @returns {Array<{id, name, version, description, enabled}>}
 */
export const getPluginList = () => {
  const list = [];
  plugins.forEach((entry, id) => {
    list.push({
      id,
      name: entry.plugin.name,
      version: entry.plugin.version || '1.0.0',
      description: entry.plugin.description || '',
      enabled: entry.enabled,
    });
  });
  return list;
};

// ── Tab Change Hook ──
const notifyTabChange = (tab) => {
  plugins.forEach((entry) => {
    if (entry.enabled && entry.initialized) {
      try { entry.plugin.onTabChange?.(tab); } catch { /* ignore */ }
    }
  });
  emit('tabChange', tab);
};

// ── File Save Hook ──
export const notifyFileSave = (filename) => {
  plugins.forEach((entry) => {
    if (entry.enabled && entry.initialized) {
      try { entry.plugin.onFileSave?.(filename); } catch { /* ignore */ }
    }
  });
  emit('fileSave', filename);
};

// ── Built-in Plugins ──

/**
 * Word Counter Plugin — live word/char/sentence count in status bar
 */
const wordCounterPlugin = {
  id: 'word-counter',
  name: 'Word Counter',
  version: '1.0.0',
  description: 'Shows live word, character, and sentence count in the status bar',
  _widget: null,
  _interval: null,

  init(api) {
    const el = document.createElement('span');
    el.className = 'plugin-word-counter';
    el.style.cssText = 'font-size:11px;opacity:0.7;padding:0 8px;white-space:nowrap;cursor:default;';
    el.title = t('plugin.wordCounter');
    this._widget = el;
    api.addStatusBarWidget('word-counter', el);

    const update = () => {
      const tab = api.getCurrentTab();
      let text = '';
      if (tab === 'markdown') text = api.getEditorContent('markdown') || '';
      else if (tab === 'document') {
        const docEl = document.getElementById('doc-editor');
        text = docEl ? docEl.innerText : '';
      } else {
        el.textContent = '';
        return;
      }

      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
      el.textContent = `${words} ${t('plugin.words')} | ${chars} ${t('plugin.chars')} | ${sentences} ${t('plugin.sentences')}`;
    };

    update();
    this._interval = setInterval(update, 2000);
    api.on('tabChange', update);
  },

  destroy() {
    if (this._interval) clearInterval(this._interval);
    this._widget?.remove();
  },
};

/**
 * Pomodoro Timer Plugin — 25min work / 5min break in status bar
 */
const pomodoroPlugin = {
  id: 'pomodoro-timer',
  name: 'Pomodoro Timer',
  version: '1.0.0',
  description: '25-minute work / 5-minute break timer in the status bar',
  _widget: null,
  _interval: null,
  _running: false,
  _seconds: 25 * 60,
  _isBreak: false,

  init(api) {
    const el = document.createElement('span');
    el.className = 'plugin-pomodoro';
    el.style.cssText = 'font-size:11px;padding:0 8px;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:4px;';
    el.title = t('plugin.pomodoroTip');

    const timerSpan = document.createElement('span');
    timerSpan.textContent = '25:00';
    const toggleBtn = document.createElement('span');
    toggleBtn.textContent = '\u25b6'; // play
    toggleBtn.style.cssText = 'font-size:10px;';
    const resetBtn = document.createElement('span');
    resetBtn.textContent = '\u21bb'; // reset
    resetBtn.style.cssText = 'font-size:12px;opacity:0.6;';
    resetBtn.title = t('plugin.resetTimer');

    el.appendChild(document.createTextNode('\ud83c\udf45 '));
    el.appendChild(timerSpan);
    el.appendChild(toggleBtn);
    el.appendChild(resetBtn);

    this._widget = el;
    api.addStatusBarWidget('pomodoro', el);

    const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const tick = () => {
      if (!this._running) return;
      this._seconds--;
      if (this._seconds <= 0) {
        this._running = false;
        toggleBtn.textContent = '\u25b6';
        if (this._isBreak) {
          api.showToast('Break over! Time to focus.', 'info');
          this._seconds = 25 * 60;
          this._isBreak = false;
          timerSpan.style.color = '';
        } else {
          api.showToast('Pomodoro complete! Take a 5-minute break.', 'success');
          this._seconds = 5 * 60;
          this._isBreak = true;
          timerSpan.style.color = '#10b981';
        }
      }
      timerSpan.textContent = formatTime(this._seconds);
    };

    el.addEventListener('click', (e) => {
      if (e.target === resetBtn) {
        this._running = false;
        this._seconds = 25 * 60;
        this._isBreak = false;
        timerSpan.textContent = '25:00';
        timerSpan.style.color = '';
        toggleBtn.textContent = '\u25b6';
        return;
      }
      this._running = !this._running;
      toggleBtn.textContent = this._running ? '\u23f8' : '\u25b6';
    });

    this._interval = setInterval(tick, 1000);
  },

  destroy() {
    if (this._interval) clearInterval(this._interval);
    this._widget?.remove();
  },
};

/**
 * Clipboard History Plugin — stores last 10 clipboard items, Ctrl+Shift+V popup
 */
const clipboardHistoryPlugin = {
  id: 'clipboard-history',
  name: 'Clipboard History',
  version: '1.0.0',
  description: 'Stores last 10 clipboard items, accessible via Ctrl+Shift+V',
  _history: [],
  _maxItems: 10,
  _handler: null,
  _copyHandler: null,
  _overlay: null,

  init(api) {
    // Listen for copy events to build history
    this._copyHandler = (e) => {
      const text = window.getSelection()?.toString() || '';
      if (text.trim()) {
        // Remove duplicate if exists
        this._history = this._history.filter((item) => item !== text);
        this._history.unshift(text);
        if (this._history.length > this._maxItems) this._history.pop();
      }
    };
    document.addEventListener('copy', this._copyHandler);
    document.addEventListener('cut', this._copyHandler);

    // Ctrl+Shift+V to show clipboard history
    this._handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        // Only intercept if we have history
        if (this._history.length === 0) return;
        e.preventDefault();
        this._showHistory(api);
      }
    };
    document.addEventListener('keydown', this._handler);
  },

  _showHistory(api) {
    // Remove existing overlay
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    if (this._history.length === 0) {
      api.showToast('Clipboard history is empty', 'info');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'clipboard-history-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: var(--bg-primary, #1e1e1e); border: 1px solid var(--border-color, #333);
      border-radius: 12px; padding: 16px; max-width: 480px; width: 90%;
      max-height: 60vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;

    const title = document.createElement('div');
    title.textContent = t('plugin.clipboardHistory');
    title.style.cssText = 'font-weight:600;font-size:14px;margin-bottom:12px;color:var(--text-primary,#fff);';
    panel.appendChild(title);

    this._history.forEach((text, i) => {
      const item = document.createElement('button');
      item.style.cssText = `
        display: block; width: 100%; padding: 8px 12px; margin-bottom: 4px;
        border: 1px solid var(--border-color, #333); border-radius: 6px;
        background: var(--bg-secondary, #252525); color: var(--text-primary, #fff);
        font-size: 12px; text-align: left; cursor: pointer; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis; font-family: monospace;
      `;
      item.textContent = text.length > 80 ? text.slice(0, 80) + '...' : text;
      item.title = text;
      item.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
          // Also insert at cursor if in an editable field
          const active = document.activeElement;
          if (active?.isContentEditable) {
            document.execCommand('insertText', false, text);
          } else if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') {
            const start = active.selectionStart;
            const end = active.selectionEnd;
            active.value = active.value.slice(0, start) + text + active.value.slice(end);
            active.selectionStart = active.selectionEnd = start + text.length;
          }
          api.showToast('Pasted from clipboard history', 'success');
        }).catch(() => {
          api.showToast('Copied to clipboard — paste manually', 'info');
        });
        overlay.remove();
        this._overlay = null;
      });
      item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--accent-color, #0071e3)'; });
      item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--border-color, #333)'; });
      panel.appendChild(item);
    });

    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); this._overlay = null; }
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') { overlay.remove(); this._overlay = null; document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);
    this._overlay = overlay;
  },

  destroy() {
    if (this._handler) document.removeEventListener('keydown', this._handler);
    if (this._copyHandler) {
      document.removeEventListener('copy', this._copyHandler);
      document.removeEventListener('cut', this._copyHandler);
    }
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
  },
};

// ── Initialize Plugin System ──

/**
 * Initialize the plugin system — register built-in plugins, connect tab changes
 */
export const initPluginSystem = () => {
  // Connect tab change events to plugin hooks
  onTabChange((tab) => notifyTabChange(tab));

  // Register built-in plugins
  registerPlugin(wordCounterPlugin);
  registerPlugin(pomodoroPlugin);
  registerPlugin(clipboardHistoryPlugin);
};
