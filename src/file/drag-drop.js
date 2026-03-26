// OfficeLink SL — Enhanced Drag & Drop Handler

import { t } from '../ui/i18n.js';

/**
 * File type icon mapping for drop overlay
 */
const FILE_ICONS = {
  md: { icon: '📝', label: 'Markdown' },
  markdown: { icon: '📝', label: 'Markdown' },
  txt: { icon: '📄', label: 'Text' },
  docx: { icon: '📘', label: 'Word' },
  hwpx: { icon: '📙', label: 'Hangul' },
  html: { icon: '🌐', label: 'HTML' },
  htm: { icon: '🌐', label: 'HTML' },
  pdf: { icon: '📕', label: 'PDF' },
  png: { icon: '🖼️', label: 'Image' },
  jpg: { icon: '🖼️', label: 'Image' },
  jpeg: { icon: '🖼️', label: 'Image' },
  gif: { icon: '🖼️', label: 'Image' },
  webp: { icon: '🖼️', label: 'Image' },
  bmp: { icon: '🖼️', label: 'Image' },
  svg: { icon: '🖼️', label: 'Image' },
  tif: { icon: '🖼️', label: 'Image' },
  tiff: { icon: '🖼️', label: 'Image' },
  xlsx: { icon: '📊', label: 'Spreadsheet' },
  csv: { icon: '📊', label: 'CSV' },
  pptx: { icon: '📽️', label: 'Presentation' },
};

let dragCounter = 0;

/**
 * Initialize drag and drop for all supported file types
 * @param {Function} onFileLoad - Callback with {name, content} for markdown files
 */
export const initDragDrop = (onFileLoad) => {
  const overlay = document.getElementById('drop-overlay');

  // Prevent default browser drag behavior
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Set a11y attributes on drop overlay
  if (overlay) {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'File drop zone');
  }

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (overlay) {
      overlay.classList.remove('hidden');
      _updateOverlayPreview(e.dataTransfer, overlay);
    }
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay?.classList.add('hidden');
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    overlay?.classList.add('hidden');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Check if drop target is inside document editor — insert image at cursor
    const docEditor = document.getElementById('doc-editor');
    const isDocEditorDrop = docEditor && (e.target === docEditor || docEditor.contains(e.target));

    if (isDocEditorDrop) {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        for (const imgFile of imageFiles) {
          await _insertImageIntoDocument(imgFile, docEditor);
        }
        return;
      }
    }

    // Multi-file: process first file, queue rest
    const fileList = Array.from(files);
    await _processFile(fileList[0], onFileLoad);

    // Queue remaining files (open after short delay)
    if (fileList.length > 1) {
      _showMultiFileToast(fileList.length);
    }
  });
};

/* ==================== Overlay Preview ==================== */

const _updateOverlayPreview = (dataTransfer, overlay) => {
  const items = dataTransfer?.items;
  const messageEl = overlay.querySelector('.drop-message');
  if (!messageEl) return;

  const iconContainer = overlay.querySelector('.drop-file-icons') || document.createElement('div');
  iconContainer.className = 'drop-file-icons';
  iconContainer.innerHTML = '';

  if (items && items.length > 0) {
    const types = new Set();
    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const ext = _getExtFromType(item.type);
        const info = FILE_ICONS[ext] || { icon: '📄', label: 'File' };
        types.add(info.label);
        const span = document.createElement('span');
        span.className = 'drop-file-icon-item';
        span.textContent = info.icon;
        iconContainer.appendChild(span);
      }
    }

    const textEl = messageEl.querySelector('.drop-text');
    if (textEl) {
      const count = items.length;
      textEl.textContent = count > 1
        ? `Drop ${count} files to open`
        : `Drop file to open`;
    }
  }

  if (!overlay.querySelector('.drop-file-icons')) {
    messageEl.insertBefore(iconContainer, messageEl.querySelector('.drop-text'));
  }
};

const _getExtFromType = (mimeType) => {
  const map = {
    'text/markdown': 'md',
    'text/plain': 'txt',
    'text/html': 'html',
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  return map[mimeType] || 'txt';
};

/* ==================== File Processing ==================== */

const _processFile = async (file, onFileLoad) => {
  const name = file.name.toLowerCase();

  // DOCX -> switch to document tab and import via mammoth
  if (name.endsWith('.docx')) {
    try {
      const { switchTab } = await import('../ui/tabs.js');
      switchTab('document');
      const { importDocx } = await import('../document/docx.js');
      const result = await importDocx(file);
      const { setDocFileName } = await import('../document/doc-file.js');
      setDocFileName(file.name);
      const fileNameEl = document.getElementById('file-name');
      if (fileNameEl) fileNameEl.textContent = result.name;
    } catch (err) {
      console.error('DOCX drag-drop import error:', err);
      alert('DOCX import error: ' + err.message);
    }
    return;
  }

  // HWPX -> switch to document tab and import
  if (name.endsWith('.hwpx')) {
    try {
      const { switchTab } = await import('../ui/tabs.js');
      switchTab('document');
      const { importHwpx } = await import('../document/hwpx.js');
      const result = await importHwpx(file);
      const { setDocFileName } = await import('../document/doc-file.js');
      setDocFileName(file.name);
      const fileNameEl = document.getElementById('file-name');
      if (fileNameEl) fileNameEl.textContent = result.name;
    } catch (err) {
      console.error('HWPX drag-drop import error:', err);
      alert('HWPX import error: ' + err.message);
    }
    return;
  }

  // HTML -> switch to document tab
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    try {
      const { switchTab } = await import('../ui/tabs.js');
      switchTab('document');
      const { setDocContent } = await import('../document/doc-editor.js');
      const { setDocFileName } = await import('../document/doc-file.js');
      const text = await file.text();
      const match = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      setDocContent(match ? match[1].trim() : text);
      setDocFileName(file.name);
      const fileNameEl = document.getElementById('file-name');
      if (fileNameEl) fileNameEl.textContent = file.name;
    } catch (err) {
      console.error('HTML drag-drop import error:', err);
    }
    return;
  }

  // PDF -> switch to PDF tab
  if (name.endsWith('.pdf')) {
    try {
      const { switchTab } = await import('../ui/tabs.js');
      switchTab('pdf');
      const { loadPdfFromFile } = await import('../pdf/pdf-viewer.js');
      if (loadPdfFromFile) await loadPdfFromFile(file);
    } catch (err) {
      console.error('PDF drag-drop import error:', err);
    }
    return;
  }

  // Image -> check active tab first, then default to photo tab
  if (name.match(/\.(png|jpe?g|gif|webp|bmp|svg|tiff?)$/)) {
    try {
      const { switchTab, getCurrentTab } = await import('../ui/tabs.js');
      const currentTab = getCurrentTab();

      // If currently in document tab, insert image at cursor
      if (currentTab === 'document') {
        const docEditor = document.getElementById('doc-editor');
        if (docEditor) {
          await _insertImageIntoDocument(file, docEditor);
          return;
        }
      }

      // Default: open in photo editor
      switchTab('photo');
      const reader = new FileReader();
      reader.onload = () => {
        const event = new CustomEvent('photo-file-drop', { detail: { dataUrl: reader.result, name: file.name } });
        document.dispatchEvent(event);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Image drag-drop import error:', err);
    }
    return;
  }

  // Markdown / text files
  if (name.match(/\.(md|markdown|txt)$/)) {
    const content = await file.text();
    onFileLoad({ name: file.name, content });
    return;
  }

  console.warn('Unsupported file type:', file.name);
};

/* ==================== Insert Image into Document ==================== */

const _insertImageIntoDocument = (file, editorEl) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.alt = file.name;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '4px';
      img.style.margin = '8px 0';

      // Insert at cursor if selection is inside doc editor
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && editorEl.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);
        range.setStartAfter(img);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Append at end
        editorEl.appendChild(document.createElement('br'));
        editorEl.appendChild(img);
      }
      resolve();
    };
    reader.readAsDataURL(file);
  });
};

/* ==================== Multi-file Toast ==================== */

const _showMultiFileToast = (count) => {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
    background: var(--bg-primary, #1d1d1f); color: var(--text-primary, #fff);
    padding: 8px 16px; border-radius: 8px; font-size: 13px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3); z-index: 9999;
    border: 1px solid var(--border-color, #333);
  `;
  toast.textContent = t('dragdrop.openedOneOf').replace('{count}', count);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};
