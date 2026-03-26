// OfficeLink SL — Document File I/O (.html, .docx, .hwpx)

import { getDocContent, setDocContent, markDocClean } from './doc-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';
import { downloadBlob } from '../utils/download.js';
import { escapeHtml } from '../utils/sanitize.js';

let currentHandle = null;
let currentName = 'untitled.html';

/**
 * Check if a file is DOCX format (by extension or MIME type)
 */
function isDocxFile(file) {
  return /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

/**
 * Check magic bytes (PK header = ZIP = DOCX/XLSX/PPTX)
 * Returns true if file starts with PK\x03\x04
 */
async function hasZipMagicBytes(file) {
  try {
    const header = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(header);
    return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
  } catch {
    return false;
  }
}

/**
 * Check if a file is HWPX format
 */
function isHwpxFile(file) {
  return /\.hwpx$/i.test(file.name);
}

/**
 * Check if a file is HWP (binary or HWPX) format
 */
function isHwpFile(file) {
  return /\.hwp$/i.test(file.name);
}

/**
 * Check for OLE compound file magic bytes (D0 CF 11 E0) — binary HWP
 */
async function hasOleMagicBytes(file) {
  try {
    const header = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(header);
    return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
  } catch {
    return false;
  }
}

/**
 * Process a file — auto-detect format and convert to HTML
 */
async function processDocFile(file) {
  // Check magic bytes for ZIP-based formats (DOCX) even if extension is wrong
  const isZip = await hasZipMagicBytes(file);

  // Check for binary HWP (.hwp with OLE magic bytes) BEFORE generic binary detection
  if (isHwpFile(file) || /\.hwp$/i.test(file.name)) {
    const isOle = await hasOleMagicBytes(file);
    if (isOle) {
      // Binary HWP detected — show clear conversion message
      setDocContent(
        '<div style="text-align:center;padding:60px 20px">' +
        '<p style="font-size:48px;margin-bottom:16px">📄</p>' +
        '<p style="color:#c62828;font-size:18px;font-weight:600;margin-bottom:12px">' +
        '이 파일은 바이너리 HWP 형식입니다.</p>' +
        '<p style="color:#555;font-size:14px;line-height:1.8">' +
        '한컴오피스에서 HWPX 형식으로 다시 저장해 주세요.<br>' +
        '<strong>파일 → 다른 이름으로 저장 → HWPX</strong></p>' +
        '<p style="color:#888;font-size:12px;margin-top:20px">' +
        'This file is in binary HWP format. Please re-save as HWPX in Hancom Office.</p>' +
        '</div>'
      );
      return { name: file.name, content: '' };
    }
    // .hwp file but ZIP-based — could be HWPX saved with .hwp extension
    if (isZip) {
      const { importHwpx } = await import('./hwpx.js');
      return await importHwpx(file);
    }
  }

  if (isDocxFile(file) || (isZip && !isHwpxFile(file) && !isHwpFile(file))) {
    // DOCX → HTML via mammoth (with JSZip fallback)
    const { importDocx } = await import('./docx.js');
    return await importDocx(file);
  }
  if (isHwpxFile(file)) {
    // HWPX → HTML
    const { importHwpx } = await import('./hwpx.js');
    return await importHwpx(file);
  }

  // Check if file content looks like binary (not text/HTML)
  const firstBytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const nullCount = firstBytes.filter((b) => b === 0).length;
  if (nullCount > 50) {
    // Binary file detected — show helpful message instead of garbage
    setDocContent('<p style="color:#c62828;text-align:center;padding:40px"><strong>This file appears to be in a binary format that cannot be displayed directly.</strong><br>Supported formats: HTML, DOCX, HWPX</p>');
    return { name: file.name, content: '' };
  }

  // Default: treat as HTML/text
  const text = await file.text();
  const content = extractBody(text);
  setDocContent(content);
  return { name: file.name, content };
}

/**
 * Open a document file (HTML, DOCX, HWPX — auto-detected)
 */
export async function openDocFile() {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [
        { description: 'Document Files', accept: {
          'text/html': ['.html', '.htm'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/hwpx': ['.hwpx'],
          'application/x-hwp': ['.hwp'],
        }},
      ],
    });
    const file = await handle.getFile();
    const result = await processDocFile(file);
    currentHandle = isDocxFile(file) || isHwpxFile(file) || isHwpFile(file) ? null : handle;
    currentName = file.name;
    return result;
  }

  // Fallback for Safari/Firefox
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.docx,.hwpx,.hwp';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      try {
        const result = await processDocFile(file);
        currentHandle = null;
        currentName = file.name;
        resolve(result);
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

/**
 * Save document as full HTML file
 */
export async function saveDocFile() {
  const html = wrapFullHTML(getDocContent(), currentName);
  const tsName = generateTimestampFilename(currentName, 'html');

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: tsName,
      types: [{ description: 'HTML Files', accept: { 'text/html': ['.html'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(html);
    await writable.close();
    currentHandle = handle;
    currentName = handle.name || tsName;
    markDocClean();
    return { name: currentName };
  }

  // Fallback
  const blob = new Blob([html], { type: 'text/html' });
  downloadBlob(blob, tsName);
  markDocClean();
  return { name: tsName };
}

/**
 * Quick save (reuse existing handle)
 */
export async function quickSaveDoc() {
  if (currentHandle) {
    const html = wrapFullHTML(getDocContent(), currentName);
    const writable = await currentHandle.createWritable();
    await writable.write(html);
    await writable.close();
    markDocClean();
    return { name: currentName };
  }
  return saveDocFile();
}

export function getDocFileName() {
  return currentName;
}

export function setDocFileName(name) {
  currentName = name;
}

/** Extract body innerHTML from a full HTML string */
function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1].trim() : html;
}

/** Wrap content in a full HTML document */
function wrapFullHTML(bodyContent, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title.replace(/\.html?$/i, ''))}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 210mm;
      margin: 0 auto;
      padding: 25.4mm;
      line-height: 1.6;
      color: #333;
    }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 6px 10px; }
    th { background: #f5f5f5; font-weight: 600; }
    img { max-width: 100%; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

