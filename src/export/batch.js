// OfficeLink SL — Batch Export (Export All as ZIP)

import JSZip from 'jszip';
import { render } from '../preview/renderer.js';
import { showExportProgress } from './progress.js';
import { generateSmartFilename } from './filename-utils.js';
import { downloadBlob } from '../utils/download.js';

/**
 * Collect exportable content from all open editor tabs.
 * Returns an array of { name, content, type } objects.
 * @returns {Array<{ name: string, content: string, type: string }>}
 */
const _collectDocuments = () => {
  const docs = [];

  // 1. Markdown editor content
  try {
    const cmEl = document.querySelector('.cm-content');
    if (cmEl && cmEl.textContent.trim()) {
      const md = cmEl.textContent;
      const title = _extractTitle(md) || 'markdown-document';
      docs.push({
        name: generateSmartFilename(title, 'md'),
        content: md,
        type: 'markdown',
      });
      // Also add rendered HTML version
      const html = _wrapHTML(render(md), title);
      docs.push({
        name: generateSmartFilename(title, 'html'),
        content: html,
        type: 'html',
      });
    }
  } catch { /* editor not available */ }

  // 2. Document editor content
  try {
    const docEditor = document.getElementById('doc-editor');
    if (docEditor && docEditor.innerHTML.trim() && docEditor.innerHTML !== '<p><br></p>') {
      const title = _extractTitleFromHTML(docEditor) || 'document';
      const html = _wrapHTML(docEditor.innerHTML, title);
      docs.push({
        name: generateSmartFilename(title, 'html'),
        content: html,
        type: 'document',
      });
    }
  } catch { /* doc editor not available */ }

  // 3. Sheet data
  try {
    const grid = document.querySelector('.sheet-grid');
    if (grid) {
      const table = grid.cloneNode(true);
      table.querySelectorAll('.selected, .copy-highlight, .sheet-cell-editing').forEach((el) => {
        el.classList.remove('selected', 'copy-highlight', 'sheet-cell-editing');
      });
      table.querySelectorAll('input').forEach((el) => el.remove());
      const html = _wrapHTML(`<div style="overflow:auto">${table.outerHTML}</div>`, 'Spreadsheet');
      docs.push({
        name: generateSmartFilename('spreadsheet', 'html'),
        content: html,
        type: 'sheet',
      });
    }
  } catch { /* sheet not available */ }

  // 4. Slide content
  try {
    const panel = document.querySelector('.slide-panel');
    const thumbs = panel ? panel.querySelectorAll('.slide-thumb') : [];
    if (thumbs.length > 0) {
      const pages = Array.from(thumbs).map((thumb, i) =>
        `<div style="page-break-after:always;border:1px solid #ccc;border-radius:8px;padding:24px;margin:16px 0;min-height:400px;">
          <div style="font-size:11px;color:#999;text-align:right;">Slide ${i + 1}</div>
          ${thumb.innerHTML}
        </div>`
      ).join('\n');
      const html = _wrapHTML(pages, 'Slides');
      docs.push({
        name: generateSmartFilename('slides', 'html'),
        content: html,
        type: 'slide',
      });
    }
  } catch { /* slides not available */ }

  return docs;
};

/**
 * Export all open documents as a ZIP file.
 */
export const exportAll = async () => {
  const docs = _collectDocuments();

  if (docs.length === 0) {
    _showToast('No documents to export');
    return;
  }

  const progress = showExportProgress('Preparing batch export...');

  try {
    const zip = new JSZip();
    const total = docs.length;

    for (let i = 0; i < total; i++) {
      const doc = docs[i];
      zip.file(doc.name, doc.content);
      progress.update(((i + 1) / total) * 80, `Adding ${doc.name}...`);
    }

    progress.update(85, 'Generating ZIP...');
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (meta) => {
        progress.update(85 + (meta.percent * 0.15), 'Compressing...');
      }
    );

    progress.update(100, 'Done!');

    // Generate ZIP filename with timestamp
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const zipName = `${ts}_OfficeLink_Export.zip`;

    // Download
    downloadBlob(blob, zipName);

    setTimeout(() => progress.close(), 600);
    _showToast(`Exported ${docs.length} file(s) as ZIP`);
  } catch (err) {
    console.error('Batch export error:', err);
    progress.close();
    _showToast('Export failed: ' + err.message);
  }
};

/* ── Helpers ── */

const _extractTitle = (markdown) => {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
};

const _extractTitleFromHTML = (el) => {
  const h = el.querySelector('h1, h2, h3');
  return h ? h.textContent.trim() : null;
};

const _wrapHTML = (body, title) => `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="OfficeLink SL">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 860px; margin: 0 auto; padding: 40px 24px;
      color: #1d1d1f; line-height: 1.7; font-size: 15px;
    }
    h1,h2,h3,h4,h5,h6 { margin-top:1.5em; margin-bottom:0.6em; font-weight:700; }
    h1 { font-size:2em; border-bottom:1px solid #e5e5ea; padding-bottom:0.3em; }
    h2 { font-size:1.5em; border-bottom:1px solid #e5e5ea; padding-bottom:0.3em; }
    p { margin-bottom:1em; }
    a { color:#0071e3; text-decoration:none; }
    code { padding:0.15em 0.4em; font-size:0.88em; background:#f4f4f8; border-radius:4px; }
    pre { margin-bottom:1em; padding:16px; background:#f4f4f8; border-radius:8px; border:1px solid #e5e5ea; overflow-x:auto; }
    pre code { padding:0; background:transparent; }
    table { width:100%; margin-bottom:1em; border-collapse:collapse; }
    th,td { padding:8px 12px; border:1px solid #e5e5ea; text-align:left; }
    th { font-weight:600; background:#f5f5f7; }
    blockquote { margin:0 0 1em 0; padding:0.5em 1em; border-left:4px solid #e5e5ea; color:#6e6e73; }
    img { max-width:100%; }
    ul,ol { margin-bottom:1em; padding-left:2em; }
  </style>
</head>
<body>
  ${body}
  <hr style="margin:2em 0;border:none;height:1px;background:#e5e5ea;">
  <p style="text-align:center;font-size:12px;color:#6e6e73;">Generated by OfficeLink SL</p>
</body>
</html>`;

const _showToast = (msg) => {
  // Use existing toast system if available
  const fn = window.__officelink_toast || ((m) => {
    const t = document.createElement('div');
    t.textContent = m;
    t.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      padding:10px 20px;border-radius:8px;background:var(--bg-primary,#333);
      color:var(--text-primary,#fff);font-size:13px;z-index:4000;
      box-shadow:0 4px 12px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  });
  fn(msg);
};
