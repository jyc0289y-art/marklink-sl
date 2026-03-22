// OfficeLink SL — Document Editor (WYSIWYG)

let editorEl = null;
let dirty = false;

export function initDocEditor() {
  editorEl = document.getElementById('doc-editor');
  if (!editorEl) return;

  // Track dirty state + word count
  editorEl.addEventListener('input', () => {
    dirty = true;
    updateWordCount();
  });

  // Undo / Redo buttons
  const undoBtn = document.getElementById('doc-undo');
  if (undoBtn) {
    undoBtn.addEventListener('mousedown', (e) => e.preventDefault());
    undoBtn.addEventListener('click', () => { document.execCommand('undo'); editorEl.focus(); });
  }
  const redoBtn = document.getElementById('doc-redo');
  if (redoBtn) {
    redoBtn.addEventListener('mousedown', (e) => e.preventDefault());
    redoBtn.addEventListener('click', () => { document.execCommand('redo'); editorEl.focus(); });
  }

  // Find/Replace
  initFindReplace();

  // Formatting commands
  document.querySelectorAll('.doc-cmd').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      editorEl.focus();
    });
  });

  // Heading select
  const headingSelect = document.getElementById('doc-heading');
  if (headingSelect) {
    headingSelect.addEventListener('change', () => {
      const val = headingSelect.value;
      document.execCommand('formatBlock', false, val || 'P');
      editorEl.focus();
    });
  }

  // Font family
  const fontFamily = document.getElementById('doc-font-family');
  if (fontFamily) {
    fontFamily.addEventListener('change', () => {
      document.execCommand('fontName', false, fontFamily.value);
      editorEl.focus();
    });
  }

  // Font size
  const fontSize = document.getElementById('doc-font-size');
  if (fontSize) {
    fontSize.addEventListener('change', () => {
      editorEl.style.fontSize = fontSize.value;
      editorEl.focus();
    });
  }

  // Text color
  const textColor = document.getElementById('doc-color');
  if (textColor) {
    textColor.addEventListener('input', () => {
      document.execCommand('foreColor', false, textColor.value);
      editorEl.focus();
    });
  }

  // Background/highlight color
  const bgColor = document.getElementById('doc-bg-color');
  if (bgColor) {
    bgColor.addEventListener('input', () => {
      document.execCommand('hiliteColor', false, bgColor.value);
      editorEl.focus();
    });
  }

  // Insert link
  document.getElementById('doc-insert-link')?.addEventListener('click', () => {
    const url = prompt('Enter URL:');
    if (url) document.execCommand('createLink', false, url);
    editorEl.focus();
  });

  // Insert image — dialog with URL input or file browse
  document.getElementById('doc-insert-image')?.addEventListener('click', () => {
    showImageInsertDialog();
  });

  // Insert table
  document.getElementById('doc-insert-table')?.addEventListener('click', () => {
    showTableInsertDialog((rows, cols) => {
      insertHTMLAtCursor(buildTable(rows, cols));
      editorEl.focus();
    });
  });

  // Insert horizontal rule
  document.getElementById('doc-insert-hr')?.addEventListener('click', () => {
    document.execCommand('insertHorizontalRule', false, null);
    editorEl.focus();
  });

  // Table of Contents
  document.getElementById('doc-insert-toc')?.addEventListener('click', () => {
    insertTableOfContents();
    editorEl.focus();
  });

  // Page numbers toggle
  document.getElementById('doc-page-numbers')?.addEventListener('click', () => {
    togglePageNumbers();
  });

  // Header & Footer
  document.getElementById('doc-header-footer')?.addEventListener('click', () => {
    showHeaderFooterDialog();
  });

  // Page Setup
  document.getElementById('doc-page-setup')?.addEventListener('click', () => {
    showPageSetupDialog();
  });

  // HWPX import
  document.getElementById('doc-import-hwpx')?.addEventListener('click', async () => {
    const { importHwpx } = await import('./hwpx.js');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hwpx,.hwp';
    input.onchange = async () => {
      if (!input.files[0]) return;
      try {
        const result = await importHwpx(input.files[0]);
        const fileNameEl = document.getElementById('file-name');
        if (fileNameEl) fileNameEl.textContent = result.name;
        updateWordCount();
      } catch (e) {
        alert('HWPX import error: ' + e.message);
      }
    };
    input.click();
  });

  // HWPX export
  document.getElementById('doc-export-hwpx')?.addEventListener('click', async () => {
    const { exportHwpx } = await import('./hwpx.js');
    try {
      await exportHwpx('document');
    } catch (e) {
      if (e.name !== 'AbortError') alert('HWPX export error: ' + e.message);
    }
  });

  // DOCX import
  document.getElementById('doc-import-docx')?.addEventListener('click', async () => {
    const { importDocx } = await import('./docx.js');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx';
    input.onchange = async () => {
      if (!input.files[0]) return;
      try {
        const result = await importDocx(input.files[0]);
        const fileNameEl = document.getElementById('file-name');
        if (fileNameEl) fileNameEl.textContent = result.name;
        updateWordCount();
      } catch (e) {
        alert('DOCX import error: ' + e.message);
      }
    };
    input.click();
  });

  // DOCX export
  document.getElementById('doc-export-docx')?.addEventListener('click', async () => {
    const { exportDocx } = await import('./docx.js');
    try {
      await exportDocx('document');
    } catch (e) {
      if (e.name !== 'AbortError') alert('DOCX export error: ' + e.message);
    }
  });

  // Keyboard shortcuts within doc editor
  editorEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); document.execCommand('bold'); break;
        case 'i': e.preventDefault(); document.execCommand('italic'); break;
        case 'u': e.preventDefault(); document.execCommand('underline'); break;
        case 'z': e.preventDefault(); document.execCommand('undo'); break;
        case 'f': e.preventDefault(); toggleFindBar(); break;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      document.execCommand('redo');
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      toggleFindBar(true);
    }
  });

  // Initial word count
  updateWordCount();
}

// ─── Find / Replace ────────────────────────────────────────
let findBarEl = null;
let findInput = null;
let replaceInput = null;
let highlightedNodes = [];

function initFindReplace() {
  findBarEl = document.getElementById('doc-find-bar');
  findInput = document.getElementById('doc-find-input');
  replaceInput = document.getElementById('doc-replace-input');
  if (!findBarEl || !findInput) return;

  findInput.addEventListener('input', () => doFind());
  document.getElementById('doc-find-next')?.addEventListener('click', () => doFind(true));
  document.getElementById('doc-find-prev')?.addEventListener('click', () => doFind(false));
  document.getElementById('doc-replace-btn')?.addEventListener('click', () => doReplace());
  document.getElementById('doc-replace-all')?.addEventListener('click', () => doReplaceAll());
  document.getElementById('doc-find-close')?.addEventListener('click', () => closeFindBar());
}

function toggleFindBar(showReplace) {
  if (!findBarEl) return;
  const isOpen = !findBarEl.classList.contains('hidden');
  if (isOpen && !showReplace) {
    closeFindBar();
    return;
  }
  findBarEl.classList.remove('hidden');
  if (showReplace) {
    findBarEl.classList.add('show-replace');
  }
  findInput?.focus();

  // Pre-fill with selection
  const sel = window.getSelection();
  if (sel && sel.toString().trim()) {
    findInput.value = sel.toString().trim();
    doFind();
  }
}

function closeFindBar() {
  if (findBarEl) {
    findBarEl.classList.add('hidden');
    findBarEl.classList.remove('show-replace');
  }
  clearHighlights();
  editorEl?.focus();
}

function doFind(forward = true) {
  clearHighlights();
  const query = findInput?.value;
  if (!query || !editorEl) return;

  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  let node;
  const matches = [];
  while ((node = walker.nextNode())) {
    let idx = 0;
    const text = node.textContent;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
      matches.push({ node, start: idx, length: query.length });
      idx += query.length;
    }
  }

  if (matches.length === 0) {
    updateFindCount(0, 0);
    return;
  }

  // Highlight all matches
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const range = document.createRange();
    range.setStart(m.node, m.start);
    range.setEnd(m.node, m.start + m.length);
    const span = document.createElement('mark');
    span.className = 'doc-find-highlight';
    range.surroundContents(span);
    highlightedNodes.push(span);
  }
  highlightedNodes.reverse();

  // Focus first match
  if (highlightedNodes.length > 0) {
    highlightedNodes[0].classList.add('doc-find-current');
    highlightedNodes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  updateFindCount(1, highlightedNodes.length);
}

function clearHighlights() {
  for (const span of highlightedNodes) {
    const parent = span.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    }
  }
  highlightedNodes = [];
}

function updateFindCount(current, total) {
  const countEl = document.getElementById('doc-find-count');
  if (countEl) countEl.textContent = total > 0 ? `${current}/${total}` : 'No results';
}

function doReplace() {
  if (!replaceInput || highlightedNodes.length === 0) return;
  const current = highlightedNodes.find(n => n.classList.contains('doc-find-current'));
  if (current) {
    current.replaceWith(document.createTextNode(replaceInput.value));
    editorEl?.normalize();
    dirty = true;
  }
  highlightedNodes = highlightedNodes.filter(n => n !== current);
  doFind();
}

function doReplaceAll() {
  if (!replaceInput || highlightedNodes.length === 0) return;
  for (const span of highlightedNodes) {
    span.replaceWith(document.createTextNode(replaceInput.value));
  }
  editorEl?.normalize();
  highlightedNodes = [];
  dirty = true;
  updateFindCount(0, 0);
}

// ─── Word Count ────────────────────────────────────────────
function updateWordCount() {
  const statusEl = document.getElementById('doc-status-bar');
  if (!statusEl || !editorEl) return;
  const text = editorEl.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const paras = editorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').length || 1;
  statusEl.textContent = `Words: ${words}  |  Characters: ${chars} (${charsNoSpace})  |  Paragraphs: ${paras}`;
}

// ─── Helpers ────────────────────────────────────────────────
function showTableInsertDialog(onInsert) {
  const overlay = document.createElement('div');
  overlay.className = 'doc-dialog-overlay';
  overlay.innerHTML = `
    <div class="doc-dialog">
      <h3 style="margin:0 0 12px">Insert Table</h3>
      <div style="display:flex;gap:12px;margin-bottom:12px">
        <label style="flex:1">
          <span style="font-size:12px;color:var(--text-secondary)">Rows</span>
          <input type="number" id="tbl-rows" value="3" min="1" max="100" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:14px;background:var(--bg-primary);color:var(--text-primary)">
        </label>
        <label style="flex:1">
          <span style="font-size:12px;color:var(--text-secondary)">Columns</span>
          <input type="number" id="tbl-cols" value="3" min="1" max="26" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:14px;background:var(--bg-primary);color:var(--text-primary)">
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="tbl-cancel" style="padding:6px 16px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px">Cancel</button>
        <button id="tbl-ok" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Insert</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const rowsInput = overlay.querySelector('#tbl-rows');
  const colsInput = overlay.querySelector('#tbl-cols');
  rowsInput.focus();
  rowsInput.select();

  const close = () => { overlay.remove(); };
  overlay.querySelector('#tbl-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#tbl-ok').addEventListener('click', () => {
    const rows = parseInt(rowsInput.value, 10) || 3;
    const cols = parseInt(colsInput.value, 10) || 3;
    close();
    onInsert(rows, cols);
  });
  // Enter key to submit
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { overlay.querySelector('#tbl-ok').click(); }
    if (e.key === 'Escape') { close(); }
  });
}

function buildTable(rows, cols) {
  let html = '<table><thead><tr>';
  for (let c = 0; c < cols; c++) html += `<th>Header ${c + 1}</th>`;
  html += '</tr></thead><tbody>';
  for (let r = 0; r < rows - 1; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
    html += '</tr>';
  }
  html += '</tbody></table><p>&nbsp;</p>';
  return html;
}

function insertHTMLAtCursor(html) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const frag = range.createContextualFragment(html);
  range.insertNode(frag);
  sel.collapseToEnd();
}

/** Get document HTML content */
export function getDocContent() {
  return editorEl ? editorEl.innerHTML : '';
}

/** Set document HTML content */
export function setDocContent(html) {
  if (editorEl) {
    editorEl.innerHTML = html;
    dirty = false;
    updateWordCount();
  }
}

/** Check if document has unsaved changes */
export function isDocDirty() {
  return dirty;
}

/** Mark document as saved */
export function markDocClean() {
  dirty = false;
}

// ─── Table of Contents ──────────────────────────────────────
function insertTableOfContents() {
  if (!editorEl) return;

  // Remove existing TOC
  editorEl.querySelector('.doc-toc')?.remove();

  // Find all headings in the document
  const headings = editorEl.querySelectorAll('h1, h2, h3, h4');
  if (headings.length === 0) {
    alert('No headings found. Add headings (H1-H4) first.');
    return;
  }

  // Build TOC
  const toc = document.createElement('div');
  toc.className = 'doc-toc';
  toc.contentEditable = 'false';

  let tocHtml = '<div class="doc-toc-title">Table of Contents</div><nav class="doc-toc-list">';
  headings.forEach((h, i) => {
    const level = parseInt(h.tagName[1]);
    const id = `toc-heading-${i}`;
    h.id = id;
    const indent = (level - 1) * 20;
    tocHtml += `<a href="#${id}" class="doc-toc-item" style="padding-left:${indent}px" onclick="event.preventDefault();document.getElementById('${id}').scrollIntoView({behavior:'smooth'})">${h.textContent}</a>`;
  });
  tocHtml += '</nav>';
  toc.innerHTML = tocHtml;

  // Insert at the beginning of the document
  editorEl.insertBefore(toc, editorEl.firstChild);
  dirty = true;
}

// ─── Page Numbers ───────────────────────────────────────────
let pageNumbersEnabled = false;

function togglePageNumbers() {
  pageNumbersEnabled = !pageNumbersEnabled;
  const wrapper = editorEl?.closest('.doc-page-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('show-page-numbers', pageNumbersEnabled);
  }
  document.getElementById('doc-page-numbers')?.classList.toggle('active', pageNumbersEnabled);
}

// ─── Header & Footer ────────────────────────────────────────
function showHeaderFooterDialog() {
  // Remove existing dialog
  document.querySelector('.doc-hf-dialog')?.remove();

  const wrapper = editorEl?.closest('.doc-page-wrapper');
  const existingHeader = wrapper?.querySelector('.doc-page-header');
  const existingFooter = wrapper?.querySelector('.doc-page-footer');

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-hf-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:400px">
      <div class="ai-setup-header">
        <h3>Header & Footer</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Header text</label>
          <input type="text" id="hf-header" class="doc-find-input" style="width:100%" placeholder="e.g. Company Name" value="${existingHeader?.textContent || ''}">
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Footer text</label>
          <input type="text" id="hf-footer" class="doc-find-input" style="width:100%" placeholder="e.g. Confidential" value="${existingFooter?.textContent || ''}">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="hf-remove">Remove</button>
          <button class="ai-pull-btn" id="hf-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#hf-apply')?.addEventListener('click', () => {
    const headerText = dialog.querySelector('#hf-header').value;
    const footerText = dialog.querySelector('#hf-footer').value;
    applyHeaderFooter(headerText, footerText);
    dialog.remove();
  });

  dialog.querySelector('#hf-remove')?.addEventListener('click', () => {
    const wrapper = editorEl?.closest('.doc-page-wrapper');
    wrapper?.querySelector('.doc-page-header')?.remove();
    wrapper?.querySelector('.doc-page-footer')?.remove();
    dialog.remove();
  });
}

function applyHeaderFooter(headerText, footerText) {
  const wrapper = editorEl?.closest('.doc-page-wrapper');
  if (!wrapper) return;

  // Remove existing
  wrapper.querySelector('.doc-page-header')?.remove();
  wrapper.querySelector('.doc-page-footer')?.remove();

  if (headerText) {
    const header = document.createElement('div');
    header.className = 'doc-page-header';
    header.contentEditable = 'true';
    header.textContent = headerText;
    wrapper.insertBefore(header, wrapper.firstChild);
  }

  if (footerText) {
    const footer = document.createElement('div');
    footer.className = 'doc-page-footer';
    footer.contentEditable = 'true';
    footer.textContent = footerText;
    wrapper.appendChild(footer);
  }
}

// ─── Page Setup Dialog ───────────────────────────────────────
const PAGE_SIZES = {
  'A4':      { w: '210mm',   h: '297mm',   label: 'A4 (210 × 297 mm)' },
  'A3':      { w: '297mm',   h: '420mm',   label: 'A3 (297 × 420 mm)' },
  'B5':      { w: '176mm',   h: '250mm',   label: 'B5 (176 × 250 mm)' },
  'Letter':  { w: '8.5in',   h: '11in',    label: 'Letter (8.5 × 11 in)' },
  'Legal':   { w: '8.5in',   h: '14in',    label: 'Legal (8.5 × 14 in)' },
  '16K':     { w: '195mm',   h: '270mm',   label: '16절 (195 × 270 mm)' },
};

let currentPageSize = 'A4';
let currentMargins = { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 }; // mm

function showPageSetupDialog() {
  document.querySelector('.doc-ps-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-ps-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:400px">
      <div class="ai-setup-header">
        <h3>Page Layout / 용지 설정</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Paper Size / 용지 크기</label>
          <select id="ps-size" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:14px;background:var(--bg-primary);color:var(--text-primary)">
            ${Object.entries(PAGE_SIZES).map(([k, v]) =>
              `<option value="${k}" ${k === currentPageSize ? 'selected' : ''}>${v.label}</option>`
            ).join('')}
          </select>
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Margins (mm) / 여백</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <label style="font-size:12px;color:var(--text-secondary)">Top / 위
              <input type="number" id="ps-mt" value="${currentMargins.top}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
            <label style="font-size:12px;color:var(--text-secondary)">Bottom / 아래
              <input type="number" id="ps-mb" value="${currentMargins.bottom}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
            <label style="font-size:12px;color:var(--text-secondary)">Left / 왼쪽
              <input type="number" id="ps-ml" value="${currentMargins.left}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
            <label style="font-size:12px;color:var(--text-secondary)">Right / 오른쪽
              <input type="number" id="ps-mr" value="${currentMargins.right}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="ps-cancel">Cancel</button>
          <button class="ai-pull-btn" id="ps-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.querySelector('#ps-cancel')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#ps-apply')?.addEventListener('click', () => {
    const size = dialog.querySelector('#ps-size').value;
    const mt = parseFloat(dialog.querySelector('#ps-mt').value) || 25.4;
    const mb = parseFloat(dialog.querySelector('#ps-mb').value) || 25.4;
    const ml = parseFloat(dialog.querySelector('#ps-ml').value) || 25.4;
    const mr = parseFloat(dialog.querySelector('#ps-mr').value) || 25.4;

    currentPageSize = size;
    currentMargins = { top: mt, right: mr, bottom: mb, left: ml };

    applyPageLayout();
    dialog.remove();
  });
}

function applyPageLayout() {
  if (!editorEl) return;
  const ps = PAGE_SIZES[currentPageSize];
  editorEl.style.width = ps.w;
  editorEl.style.minHeight = ps.h;
  editorEl.style.padding = `${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm`;
}

// ─── Image Insert Dialog ────────────────────────────────────
function showImageInsertDialog() {
  document.querySelector('.doc-img-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-img-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:420px">
      <div class="ai-setup-header">
        <h3>Insert Image</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Browse from your device</label>
          <div id="img-drop-zone" style="border:2px dashed var(--border-color);border-radius:8px;padding:24px;text-align:center;cursor:pointer;transition:border-color 0.2s">
            <span style="font-size:32px;display:block;margin-bottom:8px">🖼</span>
            <span style="font-size:13px;color:var(--text-secondary)">Click to browse or drag & drop an image here</span>
            <input type="file" id="img-file-input" accept="image/*" style="display:none">
          </div>
          <div id="img-preview" style="display:none;margin-top:12px;text-align:center">
            <img id="img-preview-el" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border-color)">
          </div>
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Or enter URL</label>
          <input type="text" id="img-url-input" class="doc-find-input" style="width:100%" placeholder="https://example.com/image.png">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="img-cancel">Cancel</button>
          <button class="ai-pull-btn" id="img-insert" style="background:var(--brand-color);color:#fff">Insert</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  let selectedDataUrl = '';

  const fileInput = dialog.querySelector('#img-file-input');
  const dropZone = dialog.querySelector('#img-drop-zone');
  const previewDiv = dialog.querySelector('#img-preview');
  const previewImg = dialog.querySelector('#img-preview-el');
  const urlInput = dialog.querySelector('#img-url-input');

  // Click to browse
  dropZone.addEventListener('click', () => fileInput.click());

  // File selected
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleImageFile(fileInput.files[0]);
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--brand-color)';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border-color)';
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file);
  });

  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedDataUrl = e.target.result;
      previewImg.src = selectedDataUrl;
      previewDiv.style.display = '';
      urlInput.value = '';
    };
    reader.readAsDataURL(file);
  }

  // Close
  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.querySelector('#img-cancel')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  // Insert
  dialog.querySelector('#img-insert')?.addEventListener('click', () => {
    const src = selectedDataUrl || urlInput.value.trim();
    if (!src) return;

    editorEl?.focus();
    // Use insertImage command for URL, or insert <img> for data URL
    if (src.startsWith('data:')) {
      insertHTMLAtCursor(`<img src="${src}" style="max-width:100%" />`);
    } else {
      document.execCommand('insertImage', false, src);
    }
    dirty = true;
    dialog.remove();
  });
}
