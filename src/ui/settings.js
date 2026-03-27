// OfficeLink SL — Unified Settings Panel
// General, Editor, AI, Storage, About sections
// Accessible via Ctrl+, or gear icon

import { getCurrentTheme, toggleTheme, autoTheme, isAutoTheme } from './theme-toggle.js';
import { buildThemeCustomizerPanel, getThemeSettings, importThemeSettings, resetThemeCustomization } from './theme-customizer.js';
import { getLang, setLang, showLanguagePicker, t } from './i18n.js';
import { getOllamaUrl, setOllamaUrl } from '../ai/ollama-client.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';
import { broadcastThemeChange } from './tab-sync.js';
import { getPluginList, enablePlugin, disablePlugin } from '../plugins/plugin-manager.js';
import { buildShortcutsSettingsPanel } from './shortcut-customizer.js';
import { downloadBlob } from '../utils/download.js';
import { activateFocusTrap } from '../utils/focus-trap.js';
import { hasAnalyticsConsent, setAnalyticsConsent } from '../analytics.js';

const SETTINGS_STORAGE_KEY = 'officelink-settings';
let settingsOverlay = null;
let deactivateSettingsTrap = null;

// Editable settings with defaults
const DEFAULT_SETTINGS = {
  autoSaveInterval: 30,     // seconds
  spellCheck: true,
  lineNumbers: true,
  aiOllamaUrl: '',
  aiModel: '',
  aiApiKey: '',
};

/**
 * Load general settings from localStorage
 */
const loadSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

/**
 * Save general settings
 */
const saveSettings = (settings) => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota */ }
};

/**
 * Get a single setting value
 */
export const getSetting = (key) => {
  const settings = loadSettings();
  return settings[key] ?? DEFAULT_SETTINGS[key];
};

/**
 * Set a single setting value
 */
export const setSetting = (key, value) => {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
};

/**
 * Show the unified settings modal
 */
export const showSettings = () => {
  // Already open?
  if (settingsOverlay) {
    settingsOverlay.remove();
    settingsOverlay = null;
    return;
  }

  const settings = loadSettings();

  settingsOverlay = document.createElement('div');
  settingsOverlay.className = 'settings-overlay';
  settingsOverlay.setAttribute('role', 'dialog');
  settingsOverlay.setAttribute('aria-label', 'Settings');

  const modal = document.createElement('div');
  modal.className = 'settings-modal';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'settings-header';
  header.innerHTML = `
    <h2 class="settings-title">${t('settings.title')}</h2>
    <button class="settings-close-btn" aria-label="Close settings">&#10005;</button>
  `;
  header.querySelector('.settings-close-btn')?.addEventListener('click', () => closeSettings());
  modal.appendChild(header);

  // ── Tab Navigation ──
  const tabNav = document.createElement('div');
  tabNav.className = 'settings-tabs';
  const tabs = [
    { id: 'general', label: t('settings.general'), icon: '&#9881;' },
    { id: 'appearance', label: t('settings.appearance'), icon: '&#127912;' },
    { id: 'editor', label: t('settings.editor'), icon: '&#9998;' },
    { id: 'shortcuts', label: t('settings.shortcuts'), icon: '&#9000;' },
    { id: 'plugins', label: t('settings.plugins'), icon: '&#128268;' },
    { id: 'ai', label: t('settings.ai'), icon: '&#129302;' },
    { id: 'storage', label: t('settings.storage'), icon: '&#128190;' },
    { id: 'about', label: t('settings.about'), icon: '&#8505;' },
  ];

  const contentArea = document.createElement('div');
  contentArea.className = 'settings-content';

  let activeTab = 'general';

  const renderTabContent = (tabId) => {
    activeTab = tabId;
    contentArea.innerHTML = '';
    tabNav.querySelectorAll('.settings-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    switch (tabId) {
      case 'general': renderGeneralTab(contentArea, settings); break;
      case 'appearance': renderAppearanceTab(contentArea); break;
      case 'editor': renderEditorTab(contentArea, settings); break;
      case 'shortcuts': renderShortcutsTab(contentArea); break;
      case 'plugins': renderPluginsTab(contentArea); break;
      case 'ai': renderAiTab(contentArea, settings); break;
      case 'storage': renderStorageTab(contentArea); break;
      case 'about': renderAboutTab(contentArea); break;
    }
  };

  tabs.forEach(({ id, label, icon }) => {
    const btn = document.createElement('button');
    btn.className = `settings-tab-btn${id === activeTab ? ' active' : ''}`;
    btn.dataset.tab = id;
    btn.innerHTML = `<span class="settings-tab-icon">${icon}</span> ${label}`;
    btn.addEventListener('click', () => renderTabContent(id));
    tabNav.appendChild(btn);
  });

  modal.appendChild(tabNav);
  modal.appendChild(contentArea);
  settingsOverlay.appendChild(modal);

  // Close on backdrop click
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  // Close on Escape — handler is cleaned up in closeSettings()
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeSettings();
    }
  };
  document.addEventListener('keydown', escHandler);
  // Store handler reference for cleanup
  settingsOverlay._escHandler = escHandler;

  document.body.appendChild(settingsOverlay);
  renderTabContent('general');

  // Focus trap for accessibility
  deactivateSettingsTrap = activateFocusTrap(settingsOverlay);
};

/**
 * Close settings modal
 */
export const closeSettings = () => {
  if (deactivateSettingsTrap) { deactivateSettingsTrap(); deactivateSettingsTrap = null; }
  // Remove Escape keydown handler to prevent leak
  if (settingsOverlay?._escHandler) {
    document.removeEventListener('keydown', settingsOverlay._escHandler);
  }
  settingsOverlay?.remove();
  settingsOverlay = null;
};

// ── Tab Renderers ──

const renderGeneralTab = (container, settings) => {
  // Language
  const langSection = createSection(t('settings.language'));
  const langRow = document.createElement('div');
  langRow.className = 'settings-row settings-row-between';
  const langLabel = document.createElement('span');
  langLabel.textContent = `${t('settings.currentLang')}: ${getLang().toUpperCase()}`;
  const langBtn = document.createElement('button');
  langBtn.className = 'settings-btn settings-btn-primary';
  langBtn.textContent = t('settings.changeLang');
  langBtn.addEventListener('click', () => {
    closeSettings();
    showLanguagePicker();
  });
  langRow.appendChild(langLabel);
  langRow.appendChild(langBtn);
  langSection.appendChild(langRow);
  container.appendChild(langSection);

  // Theme mode
  const themeSection = createSection(t('settings.themeMode'));
  const themeRow = document.createElement('div');
  themeRow.className = 'settings-row theme-mode-buttons';

  const currentTheme = getCurrentTheme();
  const isAuto = isAutoTheme();

  ['light', 'dark', 'auto'].forEach((mode) => {
    const btn = document.createElement('button');
    const isActive = mode === 'auto' ? isAuto : (!isAuto && currentTheme === mode);
    btn.className = `theme-mode-btn${isActive ? ' active' : ''}`;
    btn.innerHTML = mode === 'light' ? `&#9788; ${t('settings.light')}`
      : mode === 'dark' ? `&#9790; ${t('settings.dark')}`
      : `&#9211; ${t('settings.auto')}`;
    btn.addEventListener('click', () => {
      if (mode === 'auto') {
        autoTheme();
      } else {
        // Explicitly set theme — this exits auto mode and forces the chosen theme.
        // toggleTheme() alone doesn't guarantee the right result if auto detected
        // the same theme as the user's explicit choice.
        localStorage.setItem('marklink-theme', mode);
        if (getCurrentTheme() !== mode) {
          toggleTheme();
        }
      }
      broadcastThemeChange(mode);
      themeRow.querySelectorAll('.theme-mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
    themeRow.appendChild(btn);
  });
  themeSection.appendChild(themeRow);
  container.appendChild(themeSection);

  // Privacy & Analytics
  const privacySection = createSection('Privacy & Analytics');
  const privacyDesc = document.createElement('p');
  privacyDesc.style.cssText = 'font-size:12px;opacity:0.7;margin:0 0 10px;line-height:1.5;';
  privacyDesc.textContent = 'OfficeLink SL runs entirely in your browser. All files stay on your device. Analytics (Google Analytics 4) is optional and only tracks anonymous usage patterns — never file names or document content.';
  privacySection.appendChild(privacyDesc);

  const analyticsRow = document.createElement('div');
  analyticsRow.className = 'settings-row settings-row-between';
  const analyticsLabel = document.createElement('span');
  analyticsLabel.textContent = 'Allow anonymous analytics';
  const analyticsToggle = document.createElement('input');
  analyticsToggle.type = 'checkbox';
  analyticsToggle.checked = hasAnalyticsConsent();
  analyticsToggle.style.cssText = 'width:18px;height:18px;cursor:pointer;';
  analyticsToggle.addEventListener('change', () => {
    setAnalyticsConsent(analyticsToggle.checked);
    toastInfo(analyticsToggle.checked ? 'Analytics enabled' : 'Analytics disabled');
  });
  analyticsRow.appendChild(analyticsLabel);
  analyticsRow.appendChild(analyticsToggle);
  privacySection.appendChild(analyticsRow);
  container.appendChild(privacySection);
};

const renderAppearanceTab = (container) => {
  const panel = buildThemeCustomizerPanel();
  container.appendChild(panel);
};

const renderEditorTab = (container, settings) => {
  // Auto-save interval
  const autoSaveSection = createSection(t('settings.autoSaveInterval'));
  const autoSaveInput = document.createElement('input');
  autoSaveInput.type = 'number';
  autoSaveInput.min = '5';
  autoSaveInput.max = '300';
  autoSaveInput.value = settings.autoSaveInterval;
  autoSaveInput.className = 'settings-input';
  autoSaveInput.addEventListener('change', (e) => {
    const val = Math.max(5, Math.min(300, parseInt(e.target.value) || 30));
    e.target.value = val;
    setSetting('autoSaveInterval', val);
    toastSuccess(`Auto-save interval set to ${val}s`);
  });
  autoSaveSection.appendChild(autoSaveInput);
  container.appendChild(autoSaveSection);

  // Spell check
  const spellSection = createSection(t('settings.spellCheck'));
  const spellToggle = createToggle(settings.spellCheck, (val) => {
    setSetting('spellCheck', val);
    document.querySelectorAll('[contenteditable], textarea').forEach((el) => {
      el.spellcheck = val;
    });
  });
  spellSection.appendChild(spellToggle);
  container.appendChild(spellSection);

  // Line numbers (for markdown editor)
  const lineSection = createSection(t('settings.lineNumbers'));
  const lineToggle = createToggle(settings.lineNumbers, (val) => {
    setSetting('lineNumbers', val);
    document.querySelector('.cm-editor')?.classList.toggle('hide-line-numbers', !val);
  });
  lineSection.appendChild(lineToggle);
  container.appendChild(lineSection);
};

const renderAiTab = (container, settings) => {
  // Ollama URL
  const urlSection = createSection(t('settings.ollamaUrl'));
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.value = getOllamaUrl();
  urlInput.placeholder = 'http://localhost:11434';
  urlInput.className = 'settings-input settings-input-wide';
  urlInput.addEventListener('change', (e) => {
    setOllamaUrl(e.target.value);
    toastSuccess('Ollama URL updated');
  });
  urlSection.appendChild(urlInput);
  container.appendChild(urlSection);

  // Model selection
  const modelSection = createSection(t('settings.aiModel'));
  const modelInput = document.createElement('input');
  modelInput.type = 'text';
  modelInput.value = localStorage.getItem('marklink-ai-model') || '';
  modelInput.placeholder = 'e.g., llama3, gemma2, mistral';
  modelInput.className = 'settings-input settings-input-wide';
  modelInput.addEventListener('change', (e) => {
    localStorage.setItem('marklink-ai-model', e.target.value.trim());
    toastSuccess('AI model updated');
  });
  modelSection.appendChild(modelInput);
  container.appendChild(modelSection);

  // API Key (for cloud endpoints)
  const keySection = createSection(t('settings.apiKey'));
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.value = localStorage.getItem('marklink-ai-apikey') || '';
  keyInput.placeholder = 'sk-...';
  keyInput.className = 'settings-input settings-input-wide';
  keyInput.addEventListener('change', (e) => {
    localStorage.setItem('marklink-ai-apikey', e.target.value.trim());
    toastSuccess('API key saved');
  });
  keySection.appendChild(keyInput);

  const showKeyBtn = document.createElement('button');
  showKeyBtn.className = 'settings-btn settings-btn-small';
  showKeyBtn.textContent = t('settings.show');
  showKeyBtn.addEventListener('click', () => {
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      showKeyBtn.textContent = t('settings.hide');
    } else {
      keyInput.type = 'password';
      showKeyBtn.textContent = t('settings.show');
    }
  });
  keySection.appendChild(showKeyBtn);
  container.appendChild(keySection);

  // Test connection
  const testBtn = document.createElement('button');
  testBtn.className = 'settings-btn settings-btn-primary';
  testBtn.textContent = t('settings.testConnection');
  testBtn.addEventListener('click', async () => {
    testBtn.textContent = t('settings.testing');
    testBtn.disabled = true;
    try {
      const url = getOllamaUrl();
      const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        const models = data.models?.map((m) => m.name).join(', ') || 'none';
        toastSuccess(`Connected! Models: ${models}`);
      } else {
        toastError(`Connection failed: HTTP ${resp.status}`);
      }
    } catch (err) {
      toastError(`Connection failed: ${err.message}`);
    } finally {
      testBtn.textContent = t('settings.testConnection');
      testBtn.disabled = false;
    }
  });
  container.appendChild(testBtn);
};

const renderStorageTab = (container) => {
  // Storage usage
  const usageSection = createSection(t('settings.browserStorage'));
  const usageInfo = document.createElement('div');
  usageInfo.className = 'storage-usage-info';

  // Calculate localStorage usage
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    totalSize += (key.length + (localStorage.getItem(key) || '').length) * 2; // UTF-16
  }
  const sizeKB = (totalSize / 1024).toFixed(1);
  usageInfo.textContent = `localStorage: ~${sizeKB} KB used`;
  usageSection.appendChild(usageInfo);
  container.appendChild(usageSection);

  // Clear cache
  const clearSection = createSection(t('settings.clearData'));
  const clearRow = document.createElement('div');
  clearRow.className = 'settings-row settings-row-gap';

  const clearCacheBtn = document.createElement('button');
  clearCacheBtn.className = 'settings-btn settings-btn-danger';
  clearCacheBtn.textContent = t('settings.clearAutoSave');
  clearCacheBtn.addEventListener('click', () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.includes('autosave') || key.includes('auto-save')) keys.push(key);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    // Clear IndexedDB autosave
    try { indexedDB.deleteDatabase('officelink-autosave'); } catch { /* ignore */ }
    toastSuccess(`Cleared ${keys.length} auto-save entries`);
  });
  clearRow.appendChild(clearCacheBtn);
  clearSection.appendChild(clearRow);
  container.appendChild(clearSection);

  // Export settings
  const exportSection = createSection(t('settings.settingsBackup'));
  const exportRow = document.createElement('div');
  exportRow.className = 'settings-row settings-row-gap';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'settings-btn settings-btn-primary';
  exportBtn.textContent = t('settings.exportSettings');
  exportBtn.addEventListener('click', () => {
    const allSettings = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('marklink-') || key.startsWith('officelink-')) {
        allSettings[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(allSettings, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `officelink-settings-${new Date().toISOString().slice(0, 10)}.json`);
    toastSuccess('Settings exported');
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'settings-btn';
  importBtn.textContent = t('settings.importSettings');
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        let count = 0;
        Object.entries(data).forEach(([key, value]) => {
          if (key.startsWith('marklink-') || key.startsWith('officelink-')) {
            localStorage.setItem(key, value);
            count++;
          }
        });
        toastSuccess(`Imported ${count} settings. Reload recommended.`);
      } catch (err) {
        toastError('Invalid settings file');
      }
    });
    input.click();
  });

  exportRow.appendChild(exportBtn);
  exportRow.appendChild(importBtn);
  exportSection.appendChild(exportRow);
  container.appendChild(exportSection);
};

const renderAboutTab = (container) => {
  const aboutDiv = document.createElement('div');
  aboutDiv.className = 'settings-about';
  aboutDiv.innerHTML = `
    <div class="about-logo">&#9998; OfficeLink SL</div>
    <div class="about-version">Version 1.0.0</div>
    <div class="about-desc">${t('settings.aboutDesc')}</div>
    <div class="about-features">
      <p>Markdown Editor, Document Editor, Spreadsheet, Slide Presenter, PDF Viewer, Photo Editor, Calculator, 3D CAD, Drawing Canvas, AI Assistant</p>
    </div>
    <div class="about-links">
      <a href="https://github.com/seoulink/officelink-sl" target="_blank" rel="noopener">GitHub</a>
      <span class="about-separator">|</span>
      <a href="https://seoulink.com" target="_blank" rel="noopener">SeouLink.com</a>
    </div>
    <div class="about-credits">
      <p>Built with CodeMirror 6, markdown-it, KaTeX, Mermaid, Three.js, and more.</p>
      <p>&copy; 2024-2026 SL Corporation. All rights reserved.</p>
    </div>
  `;
  container.appendChild(aboutDiv);
};

const renderPluginsTab = (container) => {
  const plugins = getPluginList();

  const headerSection = createSection(t('settings.installedPlugins'));
  const headerDesc = document.createElement('p');
  headerDesc.style.cssText = 'font-size:12px;opacity:0.6;margin:0 0 12px;';
  headerDesc.textContent = `${plugins.length} ${t('settings.plugins')} ${t('settings.pluginsDesc')}`;
  headerSection.appendChild(headerDesc);
  container.appendChild(headerSection);

  if (plugins.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'text-align:center;padding:24px;opacity:0.5;font-size:13px;';
    emptyMsg.textContent = t('settings.noPlugins');
    container.appendChild(emptyMsg);
    return;
  }

  plugins.forEach(({ id, name, version, description, enabled }) => {
    const pluginRow = document.createElement('div');
    pluginRow.className = 'settings-section';
    pluginRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border-color,#333);border-radius:8px;margin-bottom:8px;';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;';
    info.innerHTML = `
      <div style="font-weight:600;font-size:13px;color:var(--text-primary,#fff);">${name} <span style="font-size:11px;opacity:0.5;">v${version}</span></div>
      ${description ? `<div style="font-size:11px;opacity:0.6;margin-top:2px;">${description}</div>` : ''}
    `;
    pluginRow.appendChild(info);

    const toggle = createToggle(enabled, (val) => {
      if (val) enablePlugin(id);
      else disablePlugin(id);
      toastSuccess(`${name} ${val ? 'enabled' : 'disabled'}`);
    });
    pluginRow.appendChild(toggle);

    container.appendChild(pluginRow);
  });
};

const renderShortcutsTab = (container) => {
  const panel = buildShortcutsSettingsPanel();
  container.appendChild(panel);
};

// ── Helpers ──

const createSection = (label) => {
  const section = document.createElement('div');
  section.className = 'settings-section';
  const heading = document.createElement('label');
  heading.className = 'settings-label';
  heading.textContent = label;
  section.appendChild(heading);
  return section;
};

const createToggle = (initialValue, onChange) => {
  const toggle = document.createElement('label');
  toggle.className = 'settings-toggle';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = initialValue;
  input.addEventListener('change', (e) => onChange(e.target.checked));

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  toggle.appendChild(input);
  toggle.appendChild(slider);
  return toggle;
};

/**
 * Initialize settings system — call on app startup
 */
export const initSettings = () => {
  // Apply saved editor settings
  const settings = loadSettings();

  // Spell check
  if (!settings.spellCheck) {
    document.querySelectorAll('[contenteditable], textarea').forEach((el) => {
      el.spellcheck = false;
    });
  }

  // Line numbers
  if (!settings.lineNumbers) {
    document.querySelector('.cm-editor')?.classList.add('hide-line-numbers');
  }
};
