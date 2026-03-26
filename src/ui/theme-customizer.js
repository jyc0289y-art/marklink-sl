// OfficeLink SL — Theme Customizer
// Accent color, font family, font size, editor background, custom CSS

const STORAGE_KEY_PREFIX = 'officelink-theme-';
const KEYS = {
  accent: `${STORAGE_KEY_PREFIX}accent`,
  font: `${STORAGE_KEY_PREFIX}font`,
  fontSize: `${STORAGE_KEY_PREFIX}font-size`,
  editorBg: `${STORAGE_KEY_PREFIX}editor-bg`,
  customCss: `${STORAGE_KEY_PREFIX}custom-css`,
};

const DEFAULTS = {
  accent: '#0071e3',
  font: 'system',
  fontSize: 'medium',
  editorBg: 'default',
  customCss: '',
};

const FONT_MAP = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  serif: "'Georgia', 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
};

const FONT_SIZE_MAP = {
  small: '13px',
  medium: '15px',
  large: '17px',
  'extra-large': '20px',
};

const EDITOR_BG_MAP = {
  default: null, // Use theme default
  warm: { light: '#fdf6e3', dark: '#2b2520' },
  cool: { light: '#f0f4f8', dark: '#1a1e26' },
};

let currentSettings = { ...DEFAULTS };
let customStyleEl = null;
let accentStyleEl = null;

/**
 * Load saved theme customization settings
 */
export const loadThemeSettings = () => {
  Object.keys(KEYS).forEach((key) => {
    const val = localStorage.getItem(KEYS[key]);
    if (val !== null) currentSettings[key] = val;
  });
};

/**
 * Apply all theme customization CSS custom properties
 */
export const applyThemeCustomization = () => {
  const root = document.documentElement;

  // Accent color
  if (currentSettings.accent !== DEFAULTS.accent) {
    root.style.setProperty('--brand-color', currentSettings.accent);
    root.style.setProperty('--link-color', currentSettings.accent);
    // Generate light variant
    const hex = currentSettings.accent.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    root.style.setProperty('--brand-color-light', `rgba(${r},${g},${b},0.12)`);
  } else {
    root.style.removeProperty('--brand-color');
    root.style.removeProperty('--link-color');
    root.style.removeProperty('--brand-color-light');
  }

  // Font family
  const fontFamily = FONT_MAP[currentSettings.font] || FONT_MAP.system;
  root.style.setProperty('--custom-font-family', fontFamily);
  document.body.style.fontFamily = fontFamily;

  // Font size
  const fontSize = FONT_SIZE_MAP[currentSettings.fontSize] || FONT_SIZE_MAP.medium;
  root.style.setProperty('--custom-font-size', fontSize);

  // Editor background
  applyEditorBackground();

  // Custom CSS
  applyCustomCss(currentSettings.customCss);
};

/**
 * Apply editor background tint
 */
const applyEditorBackground = () => {
  const bgSetting = currentSettings.editorBg;
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';

  if (bgSetting === 'default' || !EDITOR_BG_MAP[bgSetting]) {
    root.style.removeProperty('--editor-bg-custom');
    root.style.removeProperty('--preview-bg-custom');
  } else {
    const colors = EDITOR_BG_MAP[bgSetting];
    const color = isDark ? colors.dark : colors.light;
    root.style.setProperty('--editor-bg-custom', color);
    root.style.setProperty('--preview-bg-custom', color);
  }
};

/**
 * Apply custom CSS injection
 */
const applyCustomCss = (css) => {
  if (!customStyleEl) {
    customStyleEl = document.createElement('style');
    customStyleEl.id = 'officelink-custom-css';
    document.head.appendChild(customStyleEl);
  }
  // Sanitize: strip any script tags
  const sanitized = css.replace(/<script[\s\S]*?<\/script>/gi, '');
  customStyleEl.textContent = sanitized;
};

/**
 * Save a single setting
 */
const saveSetting = (key, value) => {
  currentSettings[key] = value;
  localStorage.setItem(KEYS[key], value);
  applyThemeCustomization();
  // Broadcast to other tabs
  broadcastThemeChange();
};

/**
 * Reset all customization to defaults
 */
export const resetThemeCustomization = () => {
  Object.keys(KEYS).forEach((key) => {
    localStorage.removeItem(KEYS[key]);
  });
  currentSettings = { ...DEFAULTS };
  applyThemeCustomization();
  broadcastThemeChange();
};

/**
 * Get current settings (for settings panel export)
 */
export const getThemeSettings = () => ({ ...currentSettings });

/**
 * Import settings (from settings panel import)
 */
export const importThemeSettings = (settings) => {
  Object.keys(KEYS).forEach((key) => {
    if (settings[key] !== undefined) {
      saveSetting(key, settings[key]);
    }
  });
};

/**
 * Broadcast theme change to other tabs
 */
const broadcastThemeChange = () => {
  try {
    const channel = new BroadcastChannel('officelink-theme-sync');
    channel.postMessage({ type: 'theme-custom', settings: currentSettings });
    channel.close();
  } catch { /* BroadcastChannel not supported */ }
};

/**
 * Listen for cross-tab theme changes
 */
export const listenThemeSync = () => {
  try {
    const channel = new BroadcastChannel('officelink-theme-sync');
    channel.onmessage = (e) => {
      if (e.data?.type === 'theme-custom' && e.data.settings) {
        currentSettings = { ...DEFAULTS, ...e.data.settings };
        Object.keys(KEYS).forEach((key) => {
          localStorage.setItem(KEYS[key], currentSettings[key]);
        });
        applyThemeCustomization();
      }
    };
  } catch { /* BroadcastChannel not supported */ }
};

/**
 * Initialize theme customizer
 */
export const initThemeCustomizer = () => {
  loadThemeSettings();
  applyThemeCustomization();
  listenThemeSync();

  // Re-apply editor bg when theme toggles (dark/light switch)
  const observer = new MutationObserver(() => {
    applyEditorBackground();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
};

/**
 * Build theme customizer UI panel (returns DOM element)
 */
export const buildThemeCustomizerPanel = () => {
  const panel = document.createElement('div');
  panel.className = 'theme-customizer-panel';

  // ── Accent Color ──
  const accentSection = createSection('Accent Color');
  const accentRow = document.createElement('div');
  accentRow.className = 'settings-row';

  const colorPresets = ['#0071e3', '#ff3b30', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5856d6', '#00c7be'];
  const presetContainer = document.createElement('div');
  presetContainer.className = 'color-presets';
  colorPresets.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    if (currentSettings.accent === color) swatch.classList.add('active');
    swatch.setAttribute('aria-label', `Accent color ${color}`);
    swatch.addEventListener('click', () => {
      saveSetting('accent', color);
      panel.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      colorInput.value = color;
    });
    presetContainer.appendChild(swatch);
  });

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = currentSettings.accent;
  colorInput.className = 'color-picker-input';
  colorInput.addEventListener('input', (e) => {
    saveSetting('accent', e.target.value);
    panel.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
  });

  accentRow.appendChild(presetContainer);
  accentRow.appendChild(colorInput);
  accentSection.appendChild(accentRow);
  panel.appendChild(accentSection);

  // ── Font Family ──
  const fontSection = createSection('Font Family');
  const fontSelect = document.createElement('select');
  fontSelect.className = 'settings-select';
  [
    { value: 'system', label: 'System Default' },
    { value: 'sans', label: 'Sans-serif (Inter)' },
    { value: 'serif', label: 'Serif (Georgia)' },
    { value: 'mono', label: 'Monospace (JetBrains Mono)' },
  ].forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (currentSettings.font === value) opt.selected = true;
    fontSelect.appendChild(opt);
  });
  fontSelect.addEventListener('change', (e) => saveSetting('font', e.target.value));
  fontSection.appendChild(fontSelect);
  panel.appendChild(fontSection);

  // ── Font Size ──
  const sizeSection = createSection('Font Size');
  const sizeRow = document.createElement('div');
  sizeRow.className = 'settings-row size-buttons';
  ['small', 'medium', 'large', 'extra-large'].forEach((size) => {
    const btn = document.createElement('button');
    btn.className = `size-btn${currentSettings.fontSize === size ? ' active' : ''}`;
    btn.textContent = size.charAt(0).toUpperCase() + size.slice(1).replace('-', ' ');
    btn.addEventListener('click', () => {
      saveSetting('fontSize', size);
      sizeRow.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
    sizeRow.appendChild(btn);
  });
  sizeSection.appendChild(sizeRow);
  panel.appendChild(sizeSection);

  // ── Editor Background ──
  const bgSection = createSection('Editor Background');
  const bgRow = document.createElement('div');
  bgRow.className = 'settings-row bg-options';
  [
    { value: 'default', label: 'Default', color: '' },
    { value: 'warm', label: 'Warm (Sepia)', color: '#fdf6e3' },
    { value: 'cool', label: 'Cool (Blue)', color: '#f0f4f8' },
  ].forEach(({ value, label, color }) => {
    const btn = document.createElement('button');
    btn.className = `bg-option-btn${currentSettings.editorBg === value ? ' active' : ''}`;
    btn.innerHTML = `<span class="bg-preview" style="background:${color || 'var(--bg-primary)'}"></span><span>${label}</span>`;
    btn.addEventListener('click', () => {
      saveSetting('editorBg', value);
      bgRow.querySelectorAll('.bg-option-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
    bgRow.appendChild(btn);
  });
  bgSection.appendChild(bgRow);
  panel.appendChild(bgSection);

  // ── Custom CSS ──
  const cssSection = createSection('Custom CSS (Advanced)');
  const cssTextarea = document.createElement('textarea');
  cssTextarea.className = 'custom-css-textarea';
  cssTextarea.placeholder = '/* Add custom CSS rules here */\n.toolbar { opacity: 0.9; }';
  cssTextarea.value = currentSettings.customCss;
  cssTextarea.rows = 4;
  let cssDebounce;
  cssTextarea.addEventListener('input', (e) => {
    clearTimeout(cssDebounce);
    cssDebounce = setTimeout(() => saveSetting('customCss', e.target.value), 500);
  });
  cssSection.appendChild(cssTextarea);
  panel.appendChild(cssSection);

  // ── Reset Button ──
  const resetBtn = document.createElement('button');
  resetBtn.className = 'settings-btn settings-btn-danger';
  resetBtn.textContent = 'Reset to Defaults';
  resetBtn.addEventListener('click', () => {
    resetThemeCustomization();
    // Re-render panel
    const parent = panel.parentElement;
    if (parent) {
      const newPanel = buildThemeCustomizerPanel();
      parent.replaceChild(newPanel, panel);
    }
  });
  panel.appendChild(resetBtn);

  return panel;
};

/**
 * Helper: create a settings section with label
 */
const createSection = (label) => {
  const section = document.createElement('div');
  section.className = 'settings-section';
  const heading = document.createElement('label');
  heading.className = 'settings-label';
  heading.textContent = label;
  section.appendChild(heading);
  return section;
};
