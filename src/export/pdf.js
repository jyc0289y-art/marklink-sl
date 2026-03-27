// OfficeLink SL — PDF Export (direct download via html2pdf.js)
import { render } from '../preview/renderer.js';
import { generateTimestampFilename } from './filename-utils.js';
import { showExportProgress } from './progress.js';
import { getPdfPresets, savePresets, PAPER_SIZES, MARGIN_PRESETS } from './presets.js';

// Theme color palettes
const THEMES = {
  light: {
    bg: '#ffffff',
    text: '#1d1d1f',
    textSecondary: '#6e6e73',
    border: '#e5e5ea',
    codeBg: '#f4f4f8',
    headerBg: '#f5f5f7',
    link: '#0071e3',
    codeText: '#e83e8c',
  },
  dark: {
    bg: '#1c1c1e',
    text: '#f5f5f7',
    textSecondary: '#a1a1a6',
    border: '#38383a',
    codeBg: '#2c2c2e',
    headerBg: '#2c2c2e',
    link: '#2997ff',
    codeText: '#ff6b9d',
  },
};

/**
 * Show PDF export dialog with theme selection, presets, and filename
 * @param {string} markdownText - Markdown content
 * @param {string} originalFileName - Original loaded filename
 */
export function exportPDF(markdownText, originalFileName = 'document') {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const defaultFilename = generateTimestampFilename(originalFileName, 'pdf');
  const presets = getPdfPresets();

  showExportDialog({
    defaultFilename,
    currentTheme: presets.theme || currentTheme,
    presets,
    onExport: (filename, theme, opts) => {
      // Save last-used settings
      savePresets({ pdf: { ...opts, theme } });
      generatePDF(markdownText, filename, theme, opts);
    },
  });
}

/**
 * Show export settings dialog with presets
 */
function showExportDialog({ defaultFilename, currentTheme, presets, onExport }) {
  // Remove existing dialog
  document.querySelector('.pdf-export-dialog-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'pdf-export-dialog-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(0,0,0,0.5); display: flex;
    align-items: center; justify-content: center;
  `;

  const _selectStyle = `
    width: 100%; padding: 7px 10px; border-radius: 8px;
    border: 1px solid var(--border-color); background: var(--bg-secondary, var(--bg-primary));
    color: var(--text-primary); font-size: 13px; outline: none; box-sizing: border-box;
  `;
  const _labelStyle = `display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;`;

  const dialog = document.createElement('div');
  dialog.className = 'pdf-export-dialog';
  dialog.style.cssText = `
    background: var(--bg-primary); border-radius: 14px;
    padding: 28px 32px; width: 480px; max-width: 92vw;
    max-height: 90vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    border: 1px solid var(--border-color);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const paperOpts = Object.entries(PAPER_SIZES).map(([k, v]) =>
    `<option value="${k}" ${k === presets.paperSize ? 'selected' : ''}>${v.label}</option>`
  ).join('');

  const marginOpts = Object.keys(MARGIN_PRESETS).map((k) =>
    `<option value="${k}" ${k === presets.margins ? 'selected' : ''}>${k}</option>`
  ).join('');

  dialog.innerHTML = `
    <h3 style="margin: 0 0 18px; font-size: 17px; font-weight: 700; color: var(--text-primary);">
      Export as PDF
    </h3>

    <div style="margin-bottom: 14px;">
      <label style="${_labelStyle}">File Name</label>
      <input type="text" id="pdf-filename" value="${defaultFilename}"
        style="width: 100%; padding: 8px 12px; border-radius: 8px;
        border: 1px solid var(--border-color); background: var(--bg-secondary, var(--bg-primary));
        color: var(--text-primary); font-size: 14px; outline: none; box-sizing: border-box;"
      />
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
      <div>
        <label style="${_labelStyle}">Paper Size</label>
        <select id="pdf-paper-size" style="${_selectStyle}">${paperOpts}</select>
      </div>
      <div>
        <label style="${_labelStyle}">Orientation</label>
        <select id="pdf-orientation" style="${_selectStyle}">
          <option value="portrait" ${presets.orientation === 'portrait' ? 'selected' : ''}>Portrait</option>
          <option value="landscape" ${presets.orientation === 'landscape' ? 'selected' : ''}>Landscape</option>
        </select>
      </div>
      <div>
        <label style="${_labelStyle}">Margins</label>
        <select id="pdf-margins" style="${_selectStyle}">${marginOpts}</select>
      </div>
      <div style="display: flex; flex-direction: column; justify-content: flex-end; gap: 6px;">
        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
          <input type="checkbox" id="pdf-headers" ${presets.includeHeaders ? 'checked' : ''} style="accent-color: var(--brand-color);">
          Include headers
        </label>
        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
          <input type="checkbox" id="pdf-footers" ${presets.includeFooters ? 'checked' : ''} style="accent-color: var(--brand-color);">
          Include footers
        </label>
      </div>
    </div>

    <div style="margin-bottom: 18px;">
      <label style="${_labelStyle}">PDF Theme</label>
      <div style="display: flex; gap: 10px;">
        <button id="pdf-theme-light" class="theme-option" data-theme="light" style="
          flex: 1; padding: 12px 10px; border-radius: 10px; cursor: pointer;
          border: 2px solid ${currentTheme === 'light' ? 'var(--brand-color)' : 'var(--border-color)'};
          background: #ffffff; text-align: center; transition: border-color 0.15s;
        ">
          <div style="font-size: 20px; margin-bottom: 2px;">Light</div>
          <div style="font-size: 11px; color: #6e6e73;">White background</div>
        </button>
        <button id="pdf-theme-dark" class="theme-option" data-theme="dark" style="
          flex: 1; padding: 12px 10px; border-radius: 10px; cursor: pointer;
          border: 2px solid ${currentTheme === 'dark' ? 'var(--brand-color)' : 'var(--border-color)'};
          background: #1c1c1e; text-align: center; transition: border-color 0.15s;
        ">
          <div style="font-size: 20px; margin-bottom: 2px; color: #f5f5f7;">Dark</div>
          <div style="font-size: 11px; color: #a1a1a6;">Dark background</div>
        </button>
      </div>
    </div>

    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button id="pdf-cancel" style="
        padding: 8px 20px; border-radius: 8px; border: 1px solid var(--border-color);
        background: transparent; color: var(--text-primary); font-size: 14px;
        cursor: pointer; font-weight: 500;
      ">Cancel</button>
      <button id="pdf-export-btn" style="
        padding: 8px 24px; border-radius: 8px; border: none;
        background: var(--brand-color); color: white; font-size: 14px;
        cursor: pointer; font-weight: 600;
      ">Export PDF</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Theme selection logic
  let selectedTheme = currentTheme;
  const lightBtn = dialog.querySelector('#pdf-theme-light');
  const darkBtn = dialog.querySelector('#pdf-theme-dark');

  const selectTheme = (theme) => {
    selectedTheme = theme;
    lightBtn.style.borderColor = theme === 'light' ? 'var(--brand-color)' : 'var(--border-color)';
    darkBtn.style.borderColor = theme === 'dark' ? 'var(--brand-color)' : 'var(--border-color)';
  };

  lightBtn.addEventListener('click', () => selectTheme('light'));
  darkBtn.addEventListener('click', () => selectTheme('dark'));

  // Cancel
  const close = () => overlay.remove();
  dialog.querySelector('#pdf-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Export
  dialog.querySelector('#pdf-export-btn').addEventListener('click', () => {
    const filename = dialog.querySelector('#pdf-filename').value.trim() || defaultFilename;
    const opts = {
      paperSize: dialog.querySelector('#pdf-paper-size').value,
      orientation: dialog.querySelector('#pdf-orientation').value,
      margins: dialog.querySelector('#pdf-margins').value,
      includeHeaders: dialog.querySelector('#pdf-headers').checked,
      includeFooters: dialog.querySelector('#pdf-footers').checked,
    };
    close();
    onExport(filename, selectedTheme, opts);
  });

  // Focus filename input and select basename
  const input = dialog.querySelector('#pdf-filename');
  input.focus();
  const dotIdx = input.value.lastIndexOf('.');
  if (dotIdx > 0) input.setSelectionRange(0, dotIdx);

  // Enter key to export
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dialog.querySelector('#pdf-export-btn').click();
    }
    if (e.key === 'Escape') close();
  });
}

/**
 * Generate PDF with specified theme and preset options
 */
async function generatePDF(markdownText, filename, theme = 'light', opts = {}) {
  const {
    paperSize = 'A4',
    orientation = 'portrait',
    margins = 'Normal',
    includeHeaders = true,
    includeFooters = true,
  } = opts;

  const progress = showExportProgress('Rendering PDF...');
  progress.update(10, 'Rendering content...');

  const html = render(markdownText);
  const colors = THEMES[theme];
  const paper = PAPER_SIZES[paperSize] || PAPER_SIZES.A4;
  const marginValues = MARGIN_PRESETS[margins] || MARGIN_PRESETS.Normal;

  const containerWidth = orientation === 'landscape' ? `${paper.height}mm` : `${paper.width}mm`;

  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute; left: -9999px; top: 0; width: ${containerWidth};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px; line-height: 1.7;
    color: ${colors.text}; background: ${colors.bg};
    padding: ${marginValues.top}mm ${marginValues.right}mm ${marginValues.bottom}mm ${marginValues.left}mm;
  `;

  const headerHTML = includeHeaders ? `<div style="text-align:center;font-size:10px;color:${colors.textSecondary};padding-bottom:12px;border-bottom:1px solid ${colors.border};margin-bottom:16px;">${filename.replace(/\.pdf$/i, '')}</div>` : '';
  const footerHTML = includeFooters ? `<div style="text-align:center;font-size:10px;color:${colors.textSecondary};padding-top:12px;border-top:1px solid ${colors.border};margin-top:16px;">Generated by OfficeLink SL</div>` : '';

  container.innerHTML = `
    <style>
      .pdf-wrapper { color: ${colors.text}; }
      .pdf-wrapper h1, .pdf-wrapper h2, .pdf-wrapper h3, .pdf-wrapper h4, .pdf-wrapper h5, .pdf-wrapper h6 {
        margin-top: 1.2em; margin-bottom: 0.5em; font-weight: 700; color: ${colors.text};
      }
      .pdf-wrapper h1 { font-size: 1.8em; border-bottom: 1px solid ${colors.border}; padding-bottom: 0.3em; }
      .pdf-wrapper h2 { font-size: 1.4em; border-bottom: 1px solid ${colors.border}; padding-bottom: 0.3em; }
      .pdf-wrapper h3 { font-size: 1.2em; }
      .pdf-wrapper p { margin-bottom: 0.8em; color: ${colors.text}; }
      .pdf-wrapper a { color: ${colors.link}; text-decoration: none; }
      .pdf-wrapper ul, .pdf-wrapper ol { margin-bottom: 0.8em; padding-left: 2em; color: ${colors.text}; }
      .pdf-wrapper li { margin-bottom: 0.2em; }
      .pdf-wrapper strong { color: ${colors.text}; }
      .pdf-wrapper em { color: ${colors.text}; }
      .pdf-wrapper code {
        padding: 0.1em 0.3em; font-size: 0.85em;
        background: ${colors.codeBg}; border-radius: 3px;
        font-family: 'SF Mono', 'Menlo', monospace;
        color: ${colors.codeText};
      }
      .pdf-wrapper pre {
        margin-bottom: 0.8em; padding: 12px; overflow-x: auto;
        background: ${colors.codeBg}; border-radius: 6px;
        border: 1px solid ${colors.border};
        page-break-inside: avoid;
      }
      .pdf-wrapper pre code {
        padding: 0; background: transparent;
        font-size: 0.85em; color: ${colors.text};
      }
      .pdf-wrapper blockquote {
        margin: 0 0 0.8em 0; padding: 0.5em 1em;
        border-left: 4px solid ${colors.border}; color: ${colors.textSecondary};
        background: ${colors.codeBg};
      }
      .pdf-wrapper table { width: 100%; margin-bottom: 0.8em; border-collapse: collapse; }
      .pdf-wrapper th, .pdf-wrapper td {
        padding: 6px 10px; border: 1px solid ${colors.border};
        text-align: left; color: ${colors.text};
      }
      .pdf-wrapper th { font-weight: 600; background: ${colors.headerBg}; }
      .pdf-wrapper tr:nth-child(even) td { background: ${theme === 'dark' ? '#252528' : '#fafafa'}; }
      .pdf-wrapper hr { height: 1px; margin: 1.5em 0; background: ${colors.border}; border: none; }
      .pdf-wrapper img { max-width: 100%; }
      .pdf-wrapper .mermaid svg { max-width: 100%; }
      .pdf-wrapper .katex-display { margin: 0.8em 0; }
      .pdf-wrapper .katex { color: ${colors.text}; }
      .pdf-wrapper .task-list-item { list-style: none; margin-left: -1.5em; }
      .pdf-wrapper del { color: ${colors.textSecondary}; }
    </style>
    <div class="pdf-wrapper">
      ${headerHTML}
      ${html}
      ${footerHTML}
    </div>
  `;
  document.body.appendChild(container);

  progress.update(30, 'Preparing layout...');
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    progress.update(50, 'Loading PDF engine...');
    const html2pdf = (await import('html2pdf.js')).default;

    // Ensure .pdf extension
    if (!filename.endsWith('.pdf')) filename += '.pdf';

    // Map margins to mm array [top, left, bottom, right]
    const marginArr = [marginValues.top, marginValues.left, marginValues.bottom, marginValues.right];

    progress.update(60, 'Generating PDF pages...');

    await html2pdf()
      .set({
        margin: marginArr,
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          backgroundColor: colors.bg,
        },
        jsPDF: {
          unit: 'mm',
          format: [paper.width, paper.height],
          orientation,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(container.querySelector('.pdf-wrapper'))
      .save();

    progress.update(100, 'Done!');
    setTimeout(() => progress.close(), 500);
  } catch (e) {
    console.error('PDF export error:', e);
    progress.close();
    const { printDocument } = await import('./print.js');
    printDocument(markdownText, filename);
  } finally {
    document.body.removeChild(container);
  }
}
