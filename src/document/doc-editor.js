// OfficeLink SL — Document Editor (Orchestrator)
// This module wires together all sub-modules and re-exports the public API.

import { sanitizeHtml } from '../utils/sanitize.js';

import {
  editorEl, dirty, setEditorEl, setDirty,
  outlineVisible, outlineNavVisible,
  docEditorInitialized, setDocEditorInitialized,
  autoSaveInterval, setAutoSaveInterval,
  autoCorrectEnabled, setAutoCorrectEnabled, AUTO_CORRECT_MAP, AUTO_CORRECT_KEY,
  SESSION_START_KEY,
  sessionStartTime, setSessionStartTime,
  sessionWordCountStart, setSessionWordCountStart,
  activeResizeImg, setActiveResizeImg,
  _addHandler, _docHandlers, _docIntervals,
  _visibilityHandler, setVisibilityHandler,
  insertHTMLAtCursor, buildTable, showTableInsertDialog,
  highlightedNodes, setHighlightedNodes,
  findBarEl, setFindBarEl,
  findInput, setFindInput,
  replaceInput, setReplaceInput,
  findCurrentIndex, setFindCurrentIndex,
  findUseRegex, setFindUseRegex,
  findMatchCase, setFindMatchCase,
  findWholeWord, setFindWholeWord,
} from './doc-state.js';

// Sub-modules
import { hideTableToolbar, showTableToolbar, initTableColumnResize } from './doc-tables.js';
import { initFindReplace, toggleFindBar, clearHighlights } from './doc-find.js';
import {
  togglePageNumbers, showHeaderFooterDialog, showPageSetupDialog,
  renderRuler, showColumnsDialog, showColumnsMenu,
  showWatermarkDialog, insertSectionBreak, printDocument,
} from './doc-layout.js';
import {
  addComment, toggleCommentsPanel, toggleTrackChanges,
  acceptAllChanges, rejectAllChanges, toggleChangesPanel,
} from './doc-comments.js';
import {
  toggleAutoCorrect, updateWordCount, insertTableOfContents,
  insertFootnote, insertEndnote, showEquationEditor,
  showStyleGallery, showMailMergeDialog,
  showImageInsertDialog, toggleDocOutline, updateDocOutline,
  insertPageBreak, insertBookmark,
  removeImageResizeHandles, showImageResizeHandles,
  showParagraphSpacingDialog, showDocCompare,
  showDateTimePicker, toggleFocusMode, toggleReadingMode,
  showMultiColumnPicker, toggleParagraphDragReorder, showSmartTableOps,
  showTemplateLibrary, showCitationDialog, toggleSpellCheck,
  initAutoSave, showVersionDiffDialog, showSmartStyleGallery,
  toggleDocOutlineNav, updateDocOutlineNav,
  showWritingStatsDialog, initPageBreakIndicators, destroyPageBreakIndicators,
  saveVersionSnapshot, getWordCount, updateWritingStreak,
} from './doc-features.js';

/**
 * Initialize the WYSIWYG document editor.
 * Binds all toolbar buttons (formatting, insert, find/replace, outline, etc.),
 * sets up paste handling (image paste, MS Office cleanup, tab-delimited tables),
 * auto-correct, auto-save, word count tracking, and table context menus.
 * Safe to call multiple times — guards against duplicate initialization.
 *
 * @returns {void}
 */
export function initDocEditor() {
  // Prevent duplicate initialization
  if (docEditorInitialized) return;
  setDocEditorInitialized(true);
  setEditorEl(document.getElementById('doc-editor'));
  if (!editorEl) return;

  // Track dirty state + word count + outline (debounced for performance)
  let wordCountTimer;
  const debouncedWordCount = () => { clearTimeout(wordCountTimer); wordCountTimer = setTimeout(() => updateWordCount(), 300); };
  let outlineTimer;
  const debouncedOutline = () => { clearTimeout(outlineTimer); outlineTimer = setTimeout(() => { updateDocOutline(); updateDocOutlineNav(); }, 500); };
  _addHandler(editorEl, 'input', () => {
    setDirty(true);
    debouncedWordCount();
    if (outlineVisible) debouncedOutline();
    else if (outlineNavVisible) debouncedOutline();
  });

  // Image resize handles
  _addHandler(editorEl, 'click', (e) => {
    if (e.target.tagName === 'IMG') {
      showImageResizeHandles(e.target);
    } else {
      removeImageResizeHandles();
    }
  });

  // Document Outline toggle
  _addHandler(document.getElementById('doc-outline-toggle'), 'click', () => toggleDocOutline());
  _addHandler(document.getElementById('doc-outline-close'), 'click', () => toggleDocOutline());

  // Insert Date/Time
  _addHandler(document.getElementById('doc-insert-datetime'), 'click', () => showDateTimePicker());

  // Comments
  _addHandler(document.getElementById('doc-insert-comment'), 'click', () => addComment());

  // Page Break
  _addHandler(document.getElementById('doc-insert-pagebreak'), 'click', () => insertPageBreak());

  // Equation Editor
  _addHandler(document.getElementById('doc-insert-equation'), 'click', () => showEquationEditor());

  // Track Changes
  _addHandler(document.getElementById('doc-track-changes'), 'click', () => toggleTrackChanges());

  // Bookmarks
  _addHandler(document.getElementById('doc-insert-bookmark'), 'click', () => insertBookmark());

  // Document Compare
  _addHandler(document.getElementById('doc-compare'), 'click', () => showDocCompare());

  // Focus Mode
  _addHandler(document.getElementById('doc-focus-mode'), 'click', () => toggleFocusMode());

  // Reading Mode
  _addHandler(document.getElementById('doc-reading-mode'), 'click', () => toggleReadingMode());

  // Undo / Redo buttons
  const undoBtn = document.getElementById('doc-undo');
  if (undoBtn) {
    _addHandler(undoBtn, 'mousedown', (e) => e.preventDefault());
    _addHandler(undoBtn, 'click', () => { document.execCommand('undo'); editorEl.focus(); });
  }
  const redoBtn = document.getElementById('doc-redo');
  if (redoBtn) {
    _addHandler(redoBtn, 'mousedown', (e) => e.preventDefault());
    _addHandler(redoBtn, 'click', () => { document.execCommand('redo'); editorEl.focus(); });
  }

  // Find/Replace
  initFindReplace();

  // Formatting commands
  document.querySelectorAll('.doc-cmd').forEach((btn) => {
    _addHandler(btn, 'mousedown', (e) => e.preventDefault());
    _addHandler(btn, 'click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      editorEl.focus();
    });
  });

  // Heading select
  const headingSelect = document.getElementById('doc-heading');
  if (headingSelect) {
    _addHandler(headingSelect, 'change', () => {
      const val = headingSelect.value;
      document.execCommand('formatBlock', false, val || 'P');
      editorEl.focus();
    });
  }

  // Font family
  const fontFamily = document.getElementById('doc-font-family');
  if (fontFamily) {
    _addHandler(fontFamily, 'change', () => {
      document.execCommand('fontName', false, fontFamily.value);
      editorEl.focus();
    });
  }

  // Font size — apply to selection, not entire editor
  const fontSize = document.getElementById('doc-font-size');
  if (fontSize) {
    _addHandler(fontSize, 'change', () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && editorEl.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontSize = fontSize.value;
        try {
          range.surroundContents(span);
        } catch {
          const sizeMap = { '9px': 1, '10px': 1, '11px': 2, '12px': 3, '14px': 4, '16px': 4, '18px': 5, '20px': 5, '24px': 6, '28px': 6, '32px': 7, '36px': 7, '48px': 7, '72px': 7 };
          document.execCommand('fontSize', false, sizeMap[fontSize.value] || 4);
          editorEl.querySelectorAll('font[size]').forEach((f) => {
            const s = document.createElement('span');
            s.style.fontSize = fontSize.value;
            s.innerHTML = f.innerHTML;
            f.replaceWith(s);
          });
        }
      } else {
        editorEl.style.fontSize = fontSize.value;
      }
      editorEl.focus();
    });
  }

  // Text color
  const textColor = document.getElementById('doc-color');
  if (textColor) {
    _addHandler(textColor, 'input', () => {
      document.execCommand('foreColor', false, textColor.value);
      editorEl.focus();
    });
  }

  // Background/highlight color
  const bgColor = document.getElementById('doc-bg-color');
  if (bgColor) {
    _addHandler(bgColor, 'input', () => {
      document.execCommand('hiliteColor', false, bgColor.value);
      editorEl.focus();
    });
  }

  // Quick highlight color menu
  document.getElementById('doc-highlight-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = document.querySelector('.doc-highlight-palette');
    if (existing) { existing.remove(); return; }

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const palette = document.createElement('div');
    palette.className = 'doc-highlight-palette';
    palette.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;z-index:2000`;

    const colors = [
      { c: '#fef08a', n: 'Yellow' }, { c: '#bbf7d0', n: 'Green' }, { c: '#bfdbfe', n: 'Blue' },
      { c: '#fecaca', n: 'Red' }, { c: '#e9d5ff', n: 'Purple' }, { c: '#fed7aa', n: 'Orange' },
      { c: '#99f6e4', n: 'Teal' }, { c: '#fce7f3', n: 'Pink' }, { c: '#e5e7eb', n: 'Gray' },
      { c: 'transparent', n: 'None' },
    ];

    colors.forEach(({ c, n }) => {
      const swatch = document.createElement('button');
      swatch.style.cssText = `width:28px;height:28px;border:1px solid var(--border-color);border-radius:4px;cursor:pointer;background:${c === 'transparent' ? 'var(--bg-primary)' : c};position:relative`;
      swatch.title = n;
      if (c === 'transparent') swatch.innerHTML = '<span style="font-size:14px;line-height:28px">\u2715</span>';
      swatch.addEventListener('click', () => {
        editorEl?.focus();
        if (c === 'transparent') {
          document.execCommand('removeFormat', false, null);
        } else {
          document.execCommand('hiliteColor', false, c);
        }
        palette.remove();
      });
      palette.appendChild(swatch);
    });

    document.body.appendChild(palette);
    document.addEventListener('click', function closePalette(ev) {
      if (!palette.contains(ev.target) && ev.target !== btn) {
        palette.remove();
        document.removeEventListener('click', closePalette);
      }
    });
  });

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

  // Line spacing — apply to selected block(s) or fallback to whole editor
  const lineSpacing = document.getElementById('doc-line-spacing');
  if (lineSpacing) {
    lineSpacing.addEventListener('change', () => {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const block = node?.nodeType === 3
        ? node.parentElement?.closest('p, h1, h2, h3, h4, h5, h6, li, div, blockquote')
        : node?.closest('p, h1, h2, h3, h4, h5, h6, li, div, blockquote');
      if (block && editorEl?.contains(block)) {
        block.style.lineHeight = lineSpacing.value;
      } else if (editorEl) {
        editorEl.style.lineHeight = lineSpacing.value;
      }
      setDirty(true);
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

  // Endnote
  document.getElementById('doc-insert-endnote')?.addEventListener('click', () => {
    insertEndnote();
  });

  // Watermark
  document.getElementById('doc-watermark')?.addEventListener('click', () => {
    showWatermarkDialog();
  });

  // Mail Merge
  document.getElementById('doc-mail-merge')?.addEventListener('click', () => {
    showMailMergeDialog();
  });

  // Paragraph spacing
  document.getElementById('doc-para-spacing')?.addEventListener('click', () => {
    showParagraphSpacingDialog();
  });

  // Clear formatting
  document.getElementById('doc-clear-format')?.addEventListener('click', () => {
    document.execCommand('removeFormat');
    editorEl?.focus();
  });

  // Quick Styles
  document.getElementById('doc-styles')?.addEventListener('click', () => {
    showStyleGallery();
  });

  // Section Break
  document.getElementById('doc-section-break')?.addEventListener('click', () => {
    insertSectionBreak();
  });

  // Columns layout
  document.getElementById('doc-columns')?.addEventListener('click', () => {
    showColumnsMenu();
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

  // Multi-Column Layout
  document.getElementById('doc-multi-column')?.addEventListener('click', () => {
    showMultiColumnPicker();
  });

  // Paragraph Drag Reorder
  document.getElementById('doc-drag-reorder')?.addEventListener('click', () => {
    toggleParagraphDragReorder();
  });

  // Smart Table Operations
  document.getElementById('doc-table-ops')?.addEventListener('click', () => {
    showSmartTableOps();
  });

  // Document Templates
  document.getElementById('doc-templates-btn')?.addEventListener('click', () => {
    showTemplateLibrary();
  });

  // Citation / Bibliography
  document.getElementById('doc-citation')?.addEventListener('click', () => {
    showCitationDialog();
  });

  // Track Changes Panel
  document.getElementById('doc-track-panel')?.addEventListener('click', () => toggleChangesPanel());
  document.getElementById('doc-changes-panel-close')?.addEventListener('click', () => toggleChangesPanel());
  document.getElementById('doc-accept-all')?.addEventListener('click', () => acceptAllChanges());
  document.getElementById('doc-reject-all')?.addEventListener('click', () => rejectAllChanges());

  // Spell Check
  document.getElementById('doc-spell-check')?.addEventListener('click', () => toggleSpellCheck());

  // Comments Panel
  document.getElementById('doc-comments-panel')?.addEventListener('click', () => toggleCommentsPanel());
  document.getElementById('doc-comments-sidebar-close')?.addEventListener('click', () => toggleCommentsPanel());

  // Keyboard shortcuts within doc editor
  _addHandler(editorEl, 'keydown', (e) => {
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
    // Ctrl+Y = Redo (Windows standard)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      document.execCommand('redo');
    }
    // Paste as plain text (Ctrl+Shift+V)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        if (text) {
          editorEl.focus();
          document.execCommand('insertText', false, text);
          setDirty(true);
        }
      }).catch(() => {
        // Fallback: listen for the native paste event
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      toggleFindBar(true);
    }
    // Ctrl+Shift+R = Reading Mode toggle
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      toggleReadingMode();
    }
    // Tab / Shift+Tab in tables: move between cells
    if (e.key === 'Tab') {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const cell = node?.nodeType === 3 ? node.parentElement?.closest('td, th') : node?.closest?.('td, th');
      if (cell && editorEl.contains(cell)) {
        e.preventDefault();
        const row = cell.closest('tr');
        const table = cell.closest('table');
        if (!row || !table) return;
        const cells = Array.from(row.cells);
        const cellIdx = cells.indexOf(cell);
        let nextCell = null;
        if (e.shiftKey) {
          if (cellIdx > 0) {
            nextCell = cells[cellIdx - 1];
          } else {
            const prevRow = row.previousElementSibling;
            if (prevRow && prevRow.cells.length > 0) {
              nextCell = prevRow.cells[prevRow.cells.length - 1];
            }
          }
        } else {
          if (cellIdx < cells.length - 1) {
            nextCell = cells[cellIdx + 1];
          } else {
            let nextRow = row.nextElementSibling;
            if (!nextRow) {
              nextRow = document.createElement('tr');
              for (let i = 0; i < cells.length; i++) {
                const newCell = document.createElement('td');
                newCell.style.cssText = 'border:1px solid var(--border-color);padding:8px 12px';
                newCell.innerHTML = '&nbsp;';
                nextRow.appendChild(newCell);
              }
              (table.querySelector('tbody') || table).appendChild(nextRow);
              setDirty(true);
            }
            if (nextRow.cells.length > 0) {
              nextCell = nextRow.cells[0];
            }
          }
        }
        if (nextCell) {
          const range = document.createRange();
          range.selectNodeContents(nextCell);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
    // Delete/Backspace on selected image
    if ((e.key === 'Backspace' || e.key === 'Delete') && activeResizeImg) {
      e.preventDefault();
      const wrap = activeResizeImg.closest('.doc-img-resize-wrap');
      if (wrap) {
        wrap.remove();
      } else {
        activeResizeImg.remove();
      }
      setActiveResizeImg(null);
      setDirty(true);
    }
  });

  // Smart paste: handle images from clipboard and clean external HTML
  _addHandler(editorEl, 'paste', (e) => {
    // Check for image paste from clipboard (screenshot, copy image, etc.)
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const img = document.createElement('img');
              img.src = ev.target.result;
              img.alt = 'Pasted image';
              img.style.maxWidth = '100%';
              img.style.height = 'auto';
              img.style.borderRadius = '4px';
              img.style.margin = '8px 0';
              document.execCommand('insertHTML', false, img.outerHTML);
            };
            reader.readAsDataURL(file);
          }
          return;
        }
      }
    }

    // Clean up external HTML (MS Office, Google Docs)
    const html = e.clipboardData?.getData('text/html');
    if (html && (html.includes('data-meta') || html.includes('MsoNormal') || html.includes('docs-internal'))) {
      e.preventDefault();
      const cleaned = html
        .replace(/<meta[^>]*>/gi, '')
        .replace(/class="[^"]*"/gi, '')
        .replace(/style="[^"]*mso[^"]*"/gi, '')
        .replace(/<o:p>.*?<\/o:p>/gi, '')
        .replace(/<!--.*?-->/gs, '')
        .replace(/\s*id="docs-internal-guid-[^"]*"/gi, '')
        .replace(/\s*data-[a-z-]+="[^"]*"/gi, '')
        .replace(/<span(?:\s+(?!style\b)[a-z-]+=["'][^"']*["'])*\s*>(.*?)<\/span>/gi, '$1')
        .replace(/<\/?font[^>]*>/gi, '');
      document.execCommand('insertHTML', false, sanitizeHtml(cleaned));
    }

    // Handle tab-separated data paste — auto-create table
    const text = e.clipboardData?.getData('text/plain');
    if (!html && text && text.includes('\t') && text.includes('\n')) {
      e.preventDefault();
      const cellStyle = 'border:1px solid var(--border-color);padding:8px 12px';
      const headerStyle = cellStyle + ';font-weight:600;background:rgba(0,0,0,0.05)';
      const rows = text.split('\n').filter((r) => r.trim().length > 0);
      let headerHtml = '';
      let bodyHtml = '';
      rows.forEach((row, i) => {
        const cells = row.split('\t');
        if (i === 0) {
          headerHtml = `<tr>${cells.map((c) => `<th style="${headerStyle}">${c.replace(/</g, '&lt;')}</th>`).join('')}</tr>`;
        } else {
          bodyHtml += `<tr>${cells.map((c) => `<td style="${cellStyle}">${c.replace(/</g, '&lt;')}</td>`).join('')}</tr>`;
        }
      });
      const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table><p>&nbsp;</p>`;
      document.execCommand('insertHTML', false, tableHtml);
    }
  });

  // Auto-Save
  setTimeout(() => initAutoSave(), 0);

  // Version Compare/Diff (enhanced)
  document.getElementById('doc-version-diff')?.addEventListener('click', () => showVersionDiffDialog());

  // Smart Styles (enhanced)
  document.getElementById('doc-smart-styles')?.addEventListener('click', () => showSmartStyleGallery());

  // Document Outline Navigator (enhanced - drag reorder headings)
  document.getElementById('doc-outline-nav')?.addEventListener('click', () => toggleDocOutlineNav());
  document.getElementById('doc-outline-nav-close')?.addEventListener('click', () => toggleDocOutlineNav());

  // Word Count Goals (enhanced)
  document.getElementById('doc-writing-stats')?.addEventListener('click', () => showWritingStatsDialog());

  // Session tracking
  setSessionStartTime(Date.now());
  setSessionWordCountStart(getWordCount());
  localStorage.setItem(SESSION_START_KEY, String(sessionStartTime));
  updateWritingStreak();

  // Initial word count + ruler + page break indicators
  updateWordCount();
  setTimeout(() => renderRuler(), 100);
  setTimeout(() => initPageBreakIndicators(), 200);

  // Table context toolbar
  _addHandler(editorEl, 'click', (e) => {
    const td = e.target.closest('td, th');
    const table = td?.closest('table');
    if (table && editorEl.contains(table)) {
      showTableToolbar(table, td);
    } else {
      hideTableToolbar();
    }
  });

  // Hide table toolbar on scroll (since it's position:fixed)
  const editorContainer = editorEl.closest('.editor-content') || editorEl.parentElement;
  if (editorContainer) {
    _addHandler(editorContainer, 'scroll', () => hideTableToolbar());
  }
  _addHandler(editorEl, 'scroll', () => hideTableToolbar());

  // Column resize via drag
  initTableColumnResize();

  // Auto-correct toggle
  setAutoCorrectEnabled(localStorage.getItem(AUTO_CORRECT_KEY) === 'true');
  const acBtn = document.getElementById('doc-autocorrect');
  if (acBtn) {
    acBtn.style.opacity = autoCorrectEnabled ? '1' : '0.6';
    acBtn.style.background = autoCorrectEnabled ? 'var(--accent-color)' : '';
    acBtn.style.color = autoCorrectEnabled ? '#fff' : '';
    acBtn.addEventListener('click', () => toggleAutoCorrect());
  }

  // Auto-correct input handler — check on space/enter
  const autoCorrectHandler = (e) => {
    if (!autoCorrectEnabled) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent.substring(0, range.startOffset);
    const match = text.match(/(\S+)$/);
    if (!match) return;
    const word = match[1];
    const replacement = AUTO_CORRECT_MAP[word] || AUTO_CORRECT_MAP[word.toLowerCase()];
    if (!replacement) return;
    // Preserve original case for first char
    const corrected = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
    const wordStart = range.startOffset - word.length;
    const r = document.createRange();
    r.setStart(node, wordStart);
    r.setEnd(node, range.startOffset);
    r.deleteContents();
    r.insertNode(document.createTextNode(corrected));
    sel.collapseToEnd();
    setDirty(true);
  };
  _addHandler(editorEl, 'keydown', autoCorrectHandler);
}

/**
 * Destroy the document editor instance: removes all registered event listeners,
 * clears auto-save and tracking intervals, removes dynamic overlays (focus mode,
 * reading mode, table toolbar, etc.), and resets module state. Should be called
 * before re-initializing or when switching away from the document editor tab.
 *
 * @returns {void}
 */
export function destroyDocEditor() {
  // Remove all tracked handlers
  for (const h of _docHandlers) {
    h.el.removeEventListener(h.event, h.fn);
  }
  _docHandlers.length = 0;

  // Clear intervals
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    setAutoSaveInterval(null);
  }
  for (const id of _docIntervals) {
    clearInterval(id);
  }
  _docIntervals.length = 0;

  // Remove track changes handlers (attached directly, not via _addHandler)
  if (editorEl) {
    if (editorEl._trackKeyHandler) {
      editorEl.removeEventListener('keydown', editorEl._trackKeyHandler);
      editorEl._trackKeyHandler = null;
    }
    if (editorEl._trackInputHandler) {
      editorEl.removeEventListener('input', editorEl._trackInputHandler);
      editorEl._trackInputHandler = null;
    }
  }

  // Remove visibilitychange handler
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    setVisibilityHandler(null);
  }

  // Remove dynamic overlays
  document.querySelector('.doc-focus-overlay')?.remove();
  document.querySelector('.doc-reading-overlay')?.remove();
  document.querySelector('.doc-highlight-palette')?.remove();
  document.querySelector('.doc-table-color-picker')?.remove();
  hideTableToolbar();
  destroyPageBreakIndicators();

  // Clear find highlights from DOM before resetting state
  clearHighlights();

  // Reset state
  setEditorEl(null);
  setDirty(false);
  setDocEditorInitialized(false);
  setHighlightedNodes([]);
  setFindBarEl(null);
  setFindInput(null);
  setReplaceInput(null);
  setFindCurrentIndex(0);
  setFindUseRegex(false);
  setFindMatchCase(false);
  setFindWholeWord(false);

  // Remove goal progress bar
  document.getElementById('doc-goal-progress')?.remove();
}

// ─── Public API ──────────────────────────────────────────────

/** Get document HTML content */
export function getDocContent() {
  return editorEl ? editorEl.innerHTML : '';
}

/** Set document HTML content */
export function setDocContent(html) {
  if (editorEl) {
    editorEl.innerHTML = sanitizeHtml(html);
    setDirty(false);
    updateWordCount();
  }
}

/** Check if document has unsaved changes */
export function isDocDirty() {
  return dirty;
}

/** Mark document as saved */
export function markDocClean() {
  setDirty(false);
}

// Re-export saveVersionSnapshot for external use
export { saveVersionSnapshot };
