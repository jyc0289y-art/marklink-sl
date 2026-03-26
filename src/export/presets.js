// OfficeLink SL — Export Presets (localStorage-backed)

const STORAGE_KEY = 'officelink-export-presets';

/** Default preset values */
const DEFAULTS = {
  pdf: {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: 'Normal',
    includeHeaders: true,
    includeFooters: true,
    theme: 'light',
  },
  html: {
    standalone: true,       // true = inline CSS, false = linked CSS
    includeMetadata: true,  // include <meta> tags (author, date, generator)
  },
};

/** Paper size dimensions (mm) */
export const PAPER_SIZES = {
  A4:     { width: 210, height: 297, label: 'A4 (210 x 297 mm)' },
  Letter: { width: 216, height: 279, label: 'Letter (8.5 x 11 in)' },
  Legal:  { width: 216, height: 356, label: 'Legal (8.5 x 14 in)' },
};

/** Margin presets (mm) */
export const MARGIN_PRESETS = {
  Normal: { top: 20, right: 25, bottom: 20, left: 25 },
  Narrow: { top: 12, right: 12, bottom: 12, left: 12 },
  Wide:   { top: 25, right: 50, bottom: 25, left: 50 },
  None:   { top: 5, right: 5, bottom: 5, left: 5 },
};

/**
 * Load saved presets from localStorage, merged with defaults.
 * @returns {{ pdf: object, html: object }}
 */
export const loadPresets = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      return {
        pdf: { ...DEFAULTS.pdf, ...stored.pdf },
        html: { ...DEFAULTS.html, ...stored.html },
      };
    }
  } catch { /* ignore parse errors */ }
  return structuredClone(DEFAULTS);
};

/**
 * Save presets to localStorage.
 * @param {{ pdf?: object, html?: object }} presets
 */
export const savePresets = (presets) => {
  const current = loadPresets();
  const merged = {
    pdf: { ...current.pdf, ...presets.pdf },
    html: { ...current.html, ...presets.html },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
};

/**
 * Get PDF presets.
 * @returns {object}
 */
export const getPdfPresets = () => loadPresets().pdf;

/**
 * Get HTML presets.
 * @returns {object}
 */
export const getHtmlPresets = () => loadPresets().html;
