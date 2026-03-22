// OfficeLink SL — Document Editor (WYSIWYG)

let editorEl = null;
let dirty = false;
let outlineVisible = false;

export function initDocEditor() {
  editorEl = document.getElementById('doc-editor');
  if (!editorEl) return;

  // Track dirty state + word count + outline
  editorEl.addEventListener('input', () => {
    dirty = true;
    updateWordCount();
    if (outlineVisible) updateDocOutline();
  });

  // Document Outline toggle
  document.getElementById('doc-outline-toggle')?.addEventListener('click', toggleDocOutline);
  document.getElementById('doc-outline-close')?.addEventListener('click', toggleDocOutline);

  // Comments
  document.getElementById('doc-insert-comment')?.addEventListener('click', () => addComment());

  // Page Break
  document.getElementById('doc-insert-pagebreak')?.addEventListener('click', () => insertPageBreak());

  // Equation Editor
  document.getElementById('doc-insert-equation')?.addEventListener('click', () => showEquationEditor());

  // Track Changes
  document.getElementById('doc-track-changes')?.addEventListener('click', toggleTrackChanges);

  // Bookmarks
  document.getElementById('doc-insert-bookmark')?.addEventListener('click', () => insertBookmark());

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

  // Line spacing
  const lineSpacing = document.getElementById('doc-line-spacing');
  if (lineSpacing) {
    lineSpacing.addEventListener('change', () => {
      if (editorEl) {
        editorEl.style.lineHeight = lineSpacing.value;
      }
    });
  }

  // Columns layout
  document.getElementById('doc-insert-columns')?.addEventListener('click', () => {
    showColumnsDialog();
  });

  // Footnote
  document.getElementById('doc-insert-footnote')?.addEventListener('click', () => {
    insertFootnote();
  });

  // Watermark
  document.getElementById('doc-watermark')?.addEventListener('click', () => {
    showWatermarkDialog();
  });

  // Print
  document.getElementById('doc-print')?.addEventListener('click', () => {
    printDocument();
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
        case 'p': e.preventDefault(); printDocument(); break;
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

// ─── Columns Layout ─────────────────────────────────────────
function showColumnsDialog() {
  document.querySelector('.doc-cols-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-cols-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:320px">
      <div class="ai-setup-header">
        <h3>Columns Layout / 단 나누기</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="display:flex;gap:12px;margin-bottom:16px">
          ${[1, 2, 3].map(n => `
            <button class="doc-col-opt" data-cols="${n}" style="flex:1;padding:16px 8px;border:2px solid var(--border-color);border-radius:8px;background:var(--bg-primary);cursor:pointer;text-align:center;color:var(--text-primary)">
              <div style="display:flex;gap:3px;justify-content:center;margin-bottom:6px">
                ${Array(n).fill('<div style="width:20px;height:28px;border:1px solid var(--text-secondary);border-radius:2px"></div>').join('')}
              </div>
              <span style="font-size:12px;font-weight:600">${n === 1 ? 'One' : n === 2 ? 'Two' : 'Three'}</span>
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="cols-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.querySelector('#cols-cancel')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelectorAll('.doc-col-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const cols = parseInt(btn.dataset.cols);
      if (editorEl) {
        if (cols === 1) {
          editorEl.style.columnCount = '';
          editorEl.style.columnGap = '';
          editorEl.style.columnRule = '';
        } else {
          editorEl.style.columnCount = cols;
          editorEl.style.columnGap = '24px';
          editorEl.style.columnRule = '1px solid var(--border-color)';
        }
      }
      dialog.remove();
    });
  });
}

// ─── Footnotes ──────────────────────────────────────────────
let footnoteCounter = 0;

function insertFootnote() {
  if (!editorEl) return;

  footnoteCounter++;
  const id = `fn-${footnoteCounter}`;

  // Insert superscript reference at cursor
  const refHtml = `<sup class="doc-fn-ref" data-fn="${id}" style="color:var(--brand-color);cursor:pointer;font-weight:700">[${footnoteCounter}]</sup>`;
  insertHTMLAtCursor(refHtml);

  // Add/update footnote section at the bottom
  let fnSection = editorEl.querySelector('.doc-footnotes');
  if (!fnSection) {
    fnSection = document.createElement('div');
    fnSection.className = 'doc-footnotes';
    fnSection.contentEditable = 'false';
    fnSection.innerHTML = '<hr style="margin-top:32px"><div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">Footnotes</div>';
    editorEl.appendChild(fnSection);
  }

  const fnItem = document.createElement('div');
  fnItem.className = 'doc-fn-item';
  fnItem.contentEditable = 'true';
  fnItem.id = id;
  fnItem.style.cssText = 'font-size:12px;color:var(--text-secondary);padding:2px 0;margin-left:16px;text-indent:-16px';
  fnItem.innerHTML = `<sup style="color:var(--brand-color);font-weight:700">[${footnoteCounter}]</sup> <span>Enter footnote text...</span>`;
  fnSection.appendChild(fnItem);

  // Focus on the footnote text
  fnItem.focus();
  dirty = true;
}

// ─── Watermark ──────────────────────────────────────────────
function showWatermarkDialog() {
  document.querySelector('.doc-wm-dialog')?.remove();

  const wrapper = editorEl?.closest('.doc-page-wrapper');
  const existingWm = wrapper?.querySelector('.doc-watermark');

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-wm-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:380px">
      <div class="ai-setup-header">
        <h3>Watermark / 워터마크</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Text</label>
          <input type="text" id="wm-text" class="doc-find-input" style="width:100%" placeholder="e.g. DRAFT, CONFIDENTIAL" value="${existingWm?.textContent || ''}">
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1">
            <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:2px">Color</label>
            <input type="color" id="wm-color" value="#cccccc" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:4px">
          </div>
          <div style="flex:1">
            <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:2px">Opacity</label>
            <input type="range" id="wm-opacity" min="5" max="50" value="15" style="width:100%">
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="wm-remove">Remove</button>
          <button class="ai-pull-btn" id="wm-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#wm-remove')?.addEventListener('click', () => {
    wrapper?.querySelector('.doc-watermark')?.remove();
    dialog.remove();
  });

  dialog.querySelector('#wm-apply')?.addEventListener('click', () => {
    const text = dialog.querySelector('#wm-text').value.trim();
    if (!text) return;
    const color = dialog.querySelector('#wm-color').value;
    const opacity = parseInt(dialog.querySelector('#wm-opacity').value) / 100;

    wrapper?.querySelector('.doc-watermark')?.remove();

    const wm = document.createElement('div');
    wm.className = 'doc-watermark';
    wm.textContent = text;
    wm.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px; font-weight: 900;
      color: ${color}; opacity: ${opacity};
      pointer-events: none; white-space: nowrap;
      z-index: 0; user-select: none;
    `;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(wm);
    }
    dialog.remove();
  });
}

// ─── Print ──────────────────────────────────────────────────
function printDocument() {
  if (!editorEl) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow pop-ups to print.'); return; }

  const ps = PAGE_SIZES[currentPageSize];
  const wrapper = editorEl.closest('.doc-page-wrapper');
  const header = wrapper?.querySelector('.doc-page-header')?.textContent || '';
  const footer = wrapper?.querySelector('.doc-page-footer')?.textContent || '';

  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Print — OfficeLink SL</title>
    <style>
      @page { size: ${ps.w} ${ps.h}; margin: ${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: ${editorEl.style.lineHeight || '1.6'}; color: #222; margin: 0; padding: 0; }
      ${header ? `.print-header { text-align: center; font-size: 11px; color: #888; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 16px; }` : ''}
      ${footer ? `.print-footer { text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 4px; margin-top: 16px; position: fixed; bottom: 0; left: 0; right: 0; }` : ''}
      table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; } th { background: #f5f5f5; font-weight: 600; }
      img { max-width: 100%; height: auto; }
      h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.17em; }
      .doc-footnotes { margin-top: 24px; }
      .doc-toc { border: 1px solid #ccc; padding: 16px; margin-bottom: 24px; border-radius: 8px; }
    </style>
  </head><body>
    ${header ? `<div class="print-header">${header}</div>` : ''}
    ${editorEl.innerHTML}
    ${footer ? `<div class="print-footer">${footer}</div>` : ''}
  </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
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

/* ==================== Document Outline ==================== */

function toggleDocOutline() {
  const panel = document.getElementById('doc-outline');
  if (!panel) return;
  outlineVisible = !outlineVisible;
  panel.classList.toggle('hidden', !outlineVisible);
  if (outlineVisible) updateDocOutline();
}

function updateDocOutline() {
  const list = document.getElementById('doc-outline-list');
  if (!list || !editorEl) return;

  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (!headings.length) {
    list.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);font-size:12px;text-align:center">No headings found.<br>Add headings (H1-H6) to see the outline.</div>';
    return;
  }

  list.innerHTML = '';
  headings.forEach((h, idx) => {
    const level = parseInt(h.tagName[1]);
    const btn = document.createElement('button');
    btn.className = 'doc-outline-item';
    btn.dataset.level = level;
    btn.textContent = h.textContent || `Heading ${idx + 1}`;
    btn.title = h.textContent;
    btn.addEventListener('click', () => {
      h.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief highlight
      const origBg = h.style.background;
      h.style.background = 'rgba(59, 130, 246, 0.15)';
      h.style.borderRadius = '4px';
      setTimeout(() => {
        h.style.background = origBg;
        h.style.borderRadius = '';
      }, 1500);
    });
    list.appendChild(btn);
  });
}

/* ==================== Comments ==================== */

let comments = [];
let commentCounter = 0;

function addComment() {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) {
    alert('Select text to add a comment');
    return;
  }

  const text = prompt('Enter your comment:');
  if (!text) return;

  const range = selection.getRangeAt(0);
  const commentId = ++commentCounter;

  // Wrap selected text in a comment highlight span
  const wrapper = document.createElement('span');
  wrapper.className = 'doc-comment-highlight';
  wrapper.dataset.commentId = commentId;
  wrapper.title = `Comment: ${text}`;
  wrapper.style.cssText = 'background:rgba(255, 213, 79, 0.4);border-bottom:2px solid #f59e0b;cursor:pointer;position:relative';

  try {
    range.surroundContents(wrapper);
  } catch {
    // If selection crosses element boundaries, wrap text content
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
  }

  comments.push({
    id: commentId,
    text,
    author: 'User',
    timestamp: new Date().toLocaleString(),
    resolved: false,
  });

  // Click to view/edit/resolve/delete
  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    showCommentPopup(wrapper, commentId);
  });

  dirty = true;
}

function showCommentPopup(el, commentId) {
  document.querySelector('.doc-comment-popup')?.remove();

  const comment = comments.find(c => c.id === commentId);
  if (!comment) return;

  const rect = el.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'doc-comment-popup';
  popup.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 280)}px;width:260px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:12px;z-index:2000;font-size:13px`;

  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="font-size:12px;color:var(--text-primary)">${comment.author}</strong>
      <span style="font-size:10px;color:var(--text-tertiary)">${comment.timestamp}</span>
    </div>
    <p style="margin:0 0 10px;color:var(--text-primary);line-height:1.5">${comment.text}</p>
    <div style="display:flex;gap:6px">
      <button class="cmt-resolve" style="flex:1;padding:5px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:var(--text-primary)">✓ Resolve</button>
      <button class="cmt-delete" style="flex:1;padding:5px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:#e74c3c">Delete</button>
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector('.cmt-resolve').addEventListener('click', () => {
    comment.resolved = true;
    el.style.background = 'rgba(34, 197, 94, 0.2)';
    el.style.borderBottom = '2px solid #22c55e';
    el.title = `[Resolved] ${comment.text}`;
    popup.remove();
  });

  popup.querySelector('.cmt-delete').addEventListener('click', () => {
    // Unwrap the span, keeping text
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    comments = comments.filter(c => c.id !== commentId);
    popup.remove();
    dirty = true;
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

/* ==================== Page Break ==================== */

function insertPageBreak() {
  if (!editorEl) return;
  editorEl.focus();

  const breakHtml = `<div class="doc-page-break" contenteditable="false" style="page-break-after:always;border-top:2px dashed var(--border-color);margin:24px 0;padding:4px 0;text-align:center;font-size:10px;color:var(--text-tertiary);user-select:none;cursor:default">— Page Break —</div>`;
  document.execCommand('insertHTML', false, breakHtml);
  dirty = true;
}

/* ==================== Equation Editor ==================== */

function showEquationEditor() {
  const existing = document.querySelector('.doc-eq-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.className = 'doc-eq-dialog';
  dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2000';

  const presets = [
    { label: 'Fraction', tex: '\\frac{a}{b}' },
    { label: 'Square Root', tex: '\\sqrt{x}' },
    { label: 'Power', tex: 'x^{n}' },
    { label: 'Subscript', tex: 'x_{i}' },
    { label: 'Sum', tex: '\\sum_{i=1}^{n} x_i' },
    { label: 'Product', tex: '\\prod_{i=1}^{n} x_i' },
    { label: 'Integral', tex: '\\int_{a}^{b} f(x) dx' },
    { label: 'Limit', tex: '\\lim_{x \\to \\infty} f(x)' },
    { label: 'Matrix', tex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
    { label: 'Quadratic', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    { label: 'E=mc²', tex: 'E = mc^{2}' },
    { label: 'Pythagorean', tex: 'a^{2} + b^{2} = c^{2}' },
    { label: 'Euler', tex: 'e^{i\\pi} + 1 = 0' },
    { label: 'Derivative', tex: '\\frac{dy}{dx}' },
    { label: 'Partial', tex: '\\frac{\\partial f}{\\partial x}' },
    { label: 'Infinity', tex: '\\infty' },
  ];

  dialog.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:20px 24px;width:500px;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text-primary)">Equation Editor</h3>
        <button class="eq-close" style="border:none;background:transparent;font-size:20px;cursor:pointer;color:var(--text-primary)">&times;</button>
      </div>
      <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px">Enter LaTeX-like notation or click a preset:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${presets.map(p => `<button class="eq-preset" data-tex="${p.tex}" style="padding:4px 8px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:var(--text-primary);font-family:'SF Mono',monospace" title="${p.tex}">${p.label}</button>`).join('')}
      </div>
      <textarea id="eq-input" style="width:100%;height:60px;padding:8px;border:1px solid var(--border-color);border-radius:8px;font-family:'SF Mono','Fira Code',monospace;font-size:14px;background:var(--bg-primary);color:var(--text-primary);resize:vertical" placeholder="e.g. E = mc^{2}"></textarea>
      <div style="margin-top:8px;padding:16px;background:var(--hover-bg);border-radius:8px;min-height:40px;text-align:center;font-size:20px" id="eq-preview"></div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="eq-close" style="padding:8px 16px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;color:var(--text-primary);font-size:13px">Cancel</button>
        <button id="eq-insert" style="padding:8px 16px;border:none;border-radius:6px;background:var(--brand-color);cursor:pointer;color:#fff;font-weight:600;font-size:13px">Insert</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector('#eq-input');
  const preview = dialog.querySelector('#eq-preview');

  // Simple TeX to HTML renderer
  function texToHTML(tex) {
    return tex
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle"><span style="border-bottom:1px solid currentColor;padding:0 4px">$1</span><span style="padding:0 4px">$2</span></span>')
      .replace(/\\sqrt\{([^}]+)\}/g, '√<span style="border-top:1px solid currentColor;padding:0 2px">$1</span>')
      .replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, '<span style="font-size:1.4em">∑</span><sub>$1</sub><sup>$2</sup>')
      .replace(/\\prod_\{([^}]+)\}\^\{([^}]+)\}/g, '<span style="font-size:1.4em">∏</span><sub>$1</sub><sup>$2</sup>')
      .replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, '<span style="font-size:1.4em">∫</span><sub>$1</sub><sup>$2</sup>')
      .replace(/\\lim_\{([^}]+)\}/g, 'lim<sub>$1</sub>')
      .replace(/\\begin\{pmatrix\}(.+?)\\end\{pmatrix\}/g, (_, content) => {
        const rows = content.split('\\\\').map(r => r.trim().split('&').map(c => `<td style="padding:2px 8px">${c.trim()}</td>`).join('')).map(r => `<tr>${r}</tr>`).join('');
        return `<span style="display:inline-flex;align-items:center">(<table style="display:inline-table;border-collapse:collapse">${rows}</table>)</span>`;
      })
      .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
      .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
      .replace(/\^(\w)/g, '<sup>$1</sup>')
      .replace(/_(\w)/g, '<sub>$1</sub>')
      .replace(/\\pm/g, '±')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\infty/g, '∞')
      .replace(/\\pi/g, 'π')
      .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ').replace(/\\delta/g, 'δ')
      .replace(/\\theta/g, 'θ').replace(/\\lambda/g, 'λ').replace(/\\mu/g, 'μ').replace(/\\sigma/g, 'σ')
      .replace(/\\phi/g, 'φ').replace(/\\omega/g, 'ω').replace(/\\epsilon/g, 'ε')
      .replace(/\\partial/g, '∂')
      .replace(/\\to/g, '→')
      .replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠')
      .replace(/\\cdot/g, '·')
      .replace(/\\ldots/g, '…')
      .replace(/\\forall/g, '∀').replace(/\\exists/g, '∃')
      .replace(/\\in/g, '∈').replace(/\\subset/g, '⊂').replace(/\\cup/g, '∪').replace(/\\cap/g, '∩')
      .replace(/\\nabla/g, '∇')
      .replace(/\\Delta/g, 'Δ').replace(/\\Sigma/g, 'Σ').replace(/\\Omega/g, 'Ω')
      .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
      .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']');
  }

  input.addEventListener('input', () => {
    preview.innerHTML = texToHTML(input.value) || '<span style="color:var(--text-tertiary)">Preview</span>';
  });

  dialog.querySelectorAll('.eq-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.tex;
      preview.innerHTML = texToHTML(btn.dataset.tex);
    });
  });

  dialog.querySelectorAll('.eq-close').forEach(btn => {
    btn.addEventListener('click', () => dialog.remove());
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#eq-insert').addEventListener('click', () => {
    const tex = input.value.trim();
    if (!tex) return;

    editorEl?.focus();
    const html = `<span class="doc-equation" contenteditable="false" style="display:inline-block;padding:4px 8px;margin:2px 4px;background:var(--hover-bg);border:1px solid var(--border-color);border-radius:6px;font-family:'Times New Roman',serif;font-size:1.1em;cursor:default;user-select:all" title="${tex}">${texToHTML(tex)}</span>`;
    document.execCommand('insertHTML', false, html);
    dirty = true;
    dialog.remove();
  });
}

/* ==================== Track Changes ==================== */

let trackChangesEnabled = false;
let docSnapshots = [];

function toggleTrackChanges() {
  trackChangesEnabled = !trackChangesEnabled;
  const btn = document.getElementById('doc-track-changes');
  if (btn) {
    btn.style.background = trackChangesEnabled ? 'var(--brand-color)' : '';
    btn.style.color = trackChangesEnabled ? '#fff' : '';
    btn.title = trackChangesEnabled ? 'Track Changes: ON' : 'Track Changes: OFF';
  }

  if (trackChangesEnabled) {
    // Take snapshot
    docSnapshots.push({
      timestamp: new Date().toLocaleString(),
      content: editorEl.innerHTML,
    });

    // Watch for changes via MutationObserver
    if (!editorEl._trackObserver) {
      editorEl._trackObserver = new MutationObserver((mutations) => {
        if (!trackChangesEnabled) return;
        mutations.forEach(m => {
          if (m.type === 'childList') {
            m.addedNodes.forEach(node => {
              if (node.nodeType === 1 && !node.classList?.contains('doc-track-insert')) {
                node.classList?.add('doc-track-insert');
              }
            });
          }
        });
      });
      editorEl._trackObserver.observe(editorEl, { childList: true, subtree: true });
    }
  }
}

/* ==================== Bookmarks ==================== */

let bookmarks = [];

function insertBookmark() {
  const name = prompt('Bookmark name:');
  if (!name) return;

  const id = 'bm-' + Date.now();
  const bookmark = { id, name };
  bookmarks.push(bookmark);

  editorEl?.focus();
  const html = `<span class="doc-bookmark" id="${id}" contenteditable="false" style="display:inline-block;width:16px;height:16px;background:#3b82f6;color:#fff;font-size:9px;font-weight:700;text-align:center;line-height:16px;border-radius:3px;cursor:pointer;vertical-align:middle;margin:0 2px;user-select:none" title="Bookmark: ${name}">🔖</span>`;
  document.execCommand('insertHTML', false, html);

  // Clicking a bookmark scrolls to it
  setTimeout(() => {
    const bmEl = document.getElementById(id);
    if (bmEl) {
      bmEl.addEventListener('click', (e) => {
        e.preventDefault();
        showBookmarkJumpMenu();
      });
    }
  }, 100);

  dirty = true;
}

function showBookmarkJumpMenu() {
  const existing = document.querySelector('.doc-bookmark-menu');
  if (existing) existing.remove();

  if (!bookmarks.length) {
    alert('No bookmarks found');
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'doc-bookmark-menu';
  menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:16px;z-index:2000;min-width:240px';

  menu.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:var(--text-primary)">Bookmarks</h3>
    ${bookmarks.map(bm => `
      <button class="bm-item" data-id="${bm.id}" style="display:block;width:100%;text-align:left;padding:8px 12px;margin:4px 0;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:var(--text-primary);font-size:13px">
        🔖 ${bm.name}
      </button>
    `).join('')}
    <button class="bm-close" style="margin-top:8px;width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;color:var(--text-primary);font-size:12px">Close</button>
  `;

  document.body.appendChild(menu);

  menu.querySelectorAll('.bm-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      menu.remove();
    });
  });
  menu.querySelector('.bm-close').addEventListener('click', () => menu.remove());
}
