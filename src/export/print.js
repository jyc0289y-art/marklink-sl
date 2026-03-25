// OfficeLink SL — Print Preview & Print Export

import { render } from '../preview/renderer.js';
import { getCurrentTab } from '../ui/tabs.js';

/* ==================== Page Size Definitions ==================== */
const PAGE_SIZES = {
  A4:      { width: '210mm', height: '297mm', label: 'A4' },
  Letter:  { width: '215.9mm', height: '279.4mm', label: 'Letter' },
  Legal:   { width: '215.9mm', height: '355.6mm', label: 'Legal' },
};

const MARGINS = {
  Normal: { top: '20mm', right: '25mm', bottom: '20mm', left: '25mm' },
  Narrow: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
  Wide:   { top: '25mm', right: '50mm', bottom: '25mm', left: '50mm' },
};

/* ==================== State ==================== */
let currentPageSize = 'A4';
let currentOrientation = 'portrait';
let currentMargin = 'Normal';

/* ==================== Print Preview Modal ==================== */

/**
 * Show the print preview modal.
 * Detects the active editor type and renders the appropriate content.
 * @param {string} [contentHtml] - Optional pre-rendered HTML (for markdown)
 * @param {string} [title] - Document title
 */
export const showPrintPreview = (contentHtml, title = 'OfficeLink SL') => {
  const tab = getCurrentTab();
  const content = _getContentForTab(tab, contentHtml);
  if (!content) return;

  // Remove existing modal if any
  document.getElementById('print-preview-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'print-preview-modal';
  modal.className = 'print-preview-overlay';
  modal.innerHTML = _buildModalHTML(title, tab);
  document.body.appendChild(modal);

  // Render preview
  _renderPreview(content, tab);
  _updatePageCount();

  // Wire up controls
  _initControls(content, tab, title, modal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) _closeModal(modal);
  });

  // Close on Escape
  const onKey = (e) => {
    if (e.key === 'Escape') { _closeModal(modal); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
};

/**
 * Legacy API — opens print preview instead of direct print
 */
export const printDocument = (contentOrMarkdown, title = 'OfficeLink SL') => {
  const tab = getCurrentTab();
  if (tab === 'pdf') {
    // PDF: pass through to browser print
    const iframe = document.querySelector('#view-pdf iframe, #pdf-canvas');
    if (iframe) { window.print(); }
    return;
  }
  showPrintPreview(
    tab === 'markdown' ? render(contentOrMarkdown) : contentOrMarkdown,
    title
  );
};

/* ==================== Content Getters ==================== */

const _getContentForTab = (tab, contentHtml) => {
  switch (tab) {
    case 'markdown':
      return contentHtml || '';
    case 'document': {
      const editor = document.getElementById('doc-editor');
      return editor ? editor.innerHTML : '';
    }
    case 'sheet':
      return _buildSheetHTML();
    case 'slide':
      return _buildSlideHTML();
    case 'pdf':
      return null; // handled separately
    default:
      return contentHtml || '';
  }
};

const _buildSheetHTML = () => {
  const grid = document.querySelector('.sheet-grid');
  if (!grid) return '<p>No sheet data</p>';

  const table = grid.cloneNode(true);
  // Clean up interactive classes
  table.querySelectorAll('.selected, .copy-highlight, .sheet-cell-editing').forEach((el) => {
    el.classList.remove('selected', 'copy-highlight', 'sheet-cell-editing');
  });
  // Remove inputs
  table.querySelectorAll('input').forEach((el) => el.remove());

  return `<div class="print-sheet-wrap">${table.outerHTML}</div>`;
};

const _buildSlideHTML = () => {
  try {
    // Dynamic import to avoid circular deps — but we need sync access
    // So we read the slide canvases from the DOM directly
    const panel = document.querySelector('.slide-panel');
    const thumbs = panel ? panel.querySelectorAll('.slide-thumb') : [];
    if (thumbs.length === 0) {
      const canvas = document.getElementById('slide-canvas');
      return canvas ? `<div class="print-slide-page">${canvas.innerHTML}</div>` : '';
    }

    // Render all slides for print — one per page
    const pages = [];
    const slideCanvas = document.getElementById('slide-canvas');
    const slideContainer = slideCanvas?.closest('.slide-canvas-wrapper') || slideCanvas;

    // Capture current slide HTML plus all thumb content
    thumbs.forEach((thumb, i) => {
      pages.push(`<div class="print-slide-page" data-slide="${i + 1}">
        <div class="print-slide-number">Slide ${i + 1}</div>
        <div class="print-slide-content">${thumb.innerHTML}</div>
      </div>`);
    });

    return pages.join('\n');
  } catch {
    return '<p>Could not render slides for print.</p>';
  }
};

/* ==================== Modal HTML ==================== */

const _buildModalHTML = (title, tab) => `
  <div class="print-preview-modal">
    <div class="print-preview-header">
      <h2>Print Preview</h2>
      <div class="print-preview-controls">
        <label>
          <span>Page Size</span>
          <select id="print-page-size">
            ${Object.entries(PAGE_SIZES).map(([k, v]) =>
              `<option value="${k}" ${k === currentPageSize ? 'selected' : ''}>${v.label}</option>`
            ).join('')}
          </select>
        </label>
        <label>
          <span>Orientation</span>
          <select id="print-orientation">
            <option value="portrait" ${currentOrientation === 'portrait' ? 'selected' : ''}>Portrait</option>
            <option value="landscape" ${currentOrientation === 'landscape' ? 'selected' : ''}>Landscape</option>
          </select>
        </label>
        <label>
          <span>Margins</span>
          <select id="print-margin">
            ${Object.keys(MARGINS).map((k) =>
              `<option value="${k}" ${k === currentMargin ? 'selected' : ''}>${k}</option>`
            ).join('')}
          </select>
        </label>
        <div class="print-page-count" id="print-page-count">~1 page</div>
      </div>
      <div class="print-preview-actions">
        <button class="print-btn-cancel" id="print-cancel">Cancel</button>
        <button class="print-btn-print" id="print-go">Print</button>
      </div>
    </div>
    <div class="print-preview-body" id="print-preview-body">
      <div class="print-preview-page" id="print-preview-page">
        <div class="print-page-header">${_escapeHtml(title)}</div>
        <div class="print-page-content" id="print-page-content"></div>
        <div class="print-page-footer">
          <span>${_escapeHtml(title)}</span>
          <span>Page 1</span>
        </div>
      </div>
    </div>
  </div>
`;

const _escapeHtml = (s) => {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
};

/* ==================== Render Preview ==================== */

const _renderPreview = (content, tab) => {
  const contentEl = document.getElementById('print-page-content');
  if (!contentEl) return;

  contentEl.className = `print-page-content print-content-${tab}`;
  contentEl.innerHTML = content;

  _applyPageStyles();
};

const _applyPageStyles = () => {
  const page = document.getElementById('print-preview-page');
  if (!page) return;

  const size = PAGE_SIZES[currentPageSize];
  const margin = MARGINS[currentMargin];
  const isLandscape = currentOrientation === 'landscape';

  page.style.width = isLandscape ? size.height : size.width;
  page.style.minHeight = isLandscape ? size.width : size.height;
  page.style.padding = `${margin.top} ${margin.right} ${margin.bottom} ${margin.left}`;
};

const _updatePageCount = () => {
  const el = document.getElementById('print-page-count');
  const page = document.getElementById('print-preview-page');
  if (!el || !page) return;

  const size = PAGE_SIZES[currentPageSize];
  const isLandscape = currentOrientation === 'landscape';
  // Approximate page height in px (1mm ~ 3.78px)
  const pageHeightPx = parseFloat(isLandscape ? size.width : size.height) * 3.78;
  const contentHeight = page.scrollHeight;
  const count = Math.max(1, Math.ceil(contentHeight / pageHeightPx));
  el.textContent = `~${count} page${count > 1 ? 's' : ''}`;
};

/* ==================== Controls ==================== */

const _initControls = (content, tab, title, modal) => {
  document.getElementById('print-page-size')?.addEventListener('change', (e) => {
    currentPageSize = e.target.value;
    _applyPageStyles();
    _updatePageCount();
  });

  document.getElementById('print-orientation')?.addEventListener('change', (e) => {
    currentOrientation = e.target.value;
    _applyPageStyles();
    _updatePageCount();
  });

  document.getElementById('print-margin')?.addEventListener('change', (e) => {
    currentMargin = e.target.value;
    _applyPageStyles();
    _updatePageCount();
  });

  document.getElementById('print-cancel')?.addEventListener('click', () => _closeModal(modal));

  document.getElementById('print-go')?.addEventListener('click', () => {
    _closeModal(modal);
    _executePrint(content, tab, title);
  });
};

const _closeModal = (modal) => {
  modal.classList.add('closing');
  setTimeout(() => modal.remove(), 200);
};

/* ==================== Execute Print ==================== */

const _executePrint = (content, tab, title) => {
  const size = PAGE_SIZES[currentPageSize];
  const margin = MARGINS[currentMargin];
  const isLandscape = currentOrientation === 'landscape';

  const pageW = isLandscape ? size.height : size.width;
  const pageH = isLandscape ? size.width : size.height;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const slideCSS = tab === 'slide' ? `
    .print-slide-page {
      page-break-after: always;
      border: 1px solid #e5e5ea;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 16px;
      min-height: 400px;
      position: relative;
    }
    .print-slide-number {
      position: absolute; top: 8px; right: 12px;
      font-size: 11px; color: #999;
    }
    .print-slide-content { width: 100%; }
  ` : '';

  const sheetCSS = tab === 'sheet' ? `
    .print-sheet-wrap { overflow: visible; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
    th { background: #f0f0f0; font-weight: 600; }
  ` : '';

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${_escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <style>
    @page {
      size: ${pageW} ${pageH};
      margin: ${margin.top} ${margin.right} ${margin.bottom} ${margin.left};
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 100%;
      margin: 0 auto;
      padding: 0;
      color: #1d1d1f;
      line-height: 1.7;
      font-size: 14px;
    }
    h1 { font-size: 2em; border-bottom: 1px solid #e5e5ea; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e5e5ea; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    pre { background: #f4f4f8; padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid #e5e5ea; page-break-inside: avoid; }
    code { font-family: 'SF Mono', 'Menlo', monospace; font-size: 0.88em; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    th, td { border: 1px solid #e5e5ea; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f7; font-weight: 600; }
    blockquote { border-left: 4px solid #e5e5ea; margin: 0; padding: 0.5em 1em; color: #6e6e73; }
    img { max-width: 100%; }
    a { color: #0071e3; }
    .print-header, .print-footer {
      font-size: 10px;
      color: #999;
      text-align: center;
      padding: 8px 0;
    }
    .print-footer {
      position: running(footer);
    }
    ${slideCSS}
    ${sheetCSS}
    @media print {
      body { padding: 0; }
      pre { page-break-inside: avoid; }
      img { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="print-header">${_escapeHtml(title)}</div>
  ${content}
</body>
</html>`);
  printWindow.document.close();
  printWindow.onload = () => { printWindow.print(); };
};

/**
 * Print the rendered markdown (legacy direct API)
 * @param {string} markdownText - Current markdown content
 * @param {string} title - Document title
 */
export const printMarkdown = (markdownText, title = 'OfficeLink SL') => {
  const html = render(markdownText);
  showPrintPreview(html, title);
};
