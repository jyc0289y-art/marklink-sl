// OfficeLink SL — Document Editor (WYSIWYG)

import { t } from '../ui/i18n.js';
import { escapeHtml as _escapeHtmlShared } from '../utils/sanitize.js';

let editorEl = null;
let dirty = false;
let outlineVisible = false;
let docEditorInitialized = false;

// Auto-save state
let autoSaveInterval = null;
const AUTO_SAVE_KEY = 'doc-autosave-content';
const AUTO_SAVE_TS_KEY = 'doc-autosave-timestamp';
const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

// Word count goals & session tracking
const WRITING_STREAK_KEY = 'doc-writing-streak';
const SESSION_START_KEY = 'doc-session-start';
let sessionStartTime = Date.now();
let sessionWordCountStart = 0;
let wordsPerMinuteTracker = { lastCheck: Date.now(), lastWords: 0, wpm: 0 };

// Auto-correct state
let autoCorrectEnabled = false;
const AUTO_CORRECT_MAP = {
  'teh': 'the', 'adn': 'and', 'taht': 'that', 'wiht': 'with', 'hte': 'the',
  'fo': 'of', 'ot': 'to', 'ti': 'it', 'si': 'is', 'nad': 'and',
  'tahn': 'than', 'waht': 'what', 'htat': 'that', 'thier': 'their',
  'recieve': 'receive', 'occurence': 'occurrence', 'seperate': 'separate',
  'definately': 'definitely', 'accomodate': 'accommodate', 'occured': 'occurred',
  'untill': 'until', 'wich': 'which', 'becuase': 'because', 'beacuse': 'because',
  'dont': "don't", 'wont': "won't", 'cant': "can't", 'didnt': "didn't",
  'doesnt': "doesn't", 'isnt': "isn't", 'wasnt': "wasn't", 'werent': "weren't",
  'thats': "that's", 'whats': "what's", 'heres': "here's", 'theres': "there's",
  'Im': "I'm", 'Ive': "I've", 'Id': "I'd", 'youre': "you're",
  'theyre': "they're", 'weve': "we've", 'shouldve': "should've",
  'couldve': "could've", 'wouldve': "would've",
  'alot': 'a lot', 'noone': 'no one', 'eachother': 'each other',
};
const AUTO_CORRECT_KEY = 'doc-autocorrect-enabled';

// Stored event handlers for cleanup
const _docHandlers = [];
const _docIntervals = [];

function _addHandler(el, event, fn) {
  if (!el) return;
  el.addEventListener(event, fn);
  _docHandlers.push({ el, event, fn });
}

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
  docEditorInitialized = true;
  editorEl = document.getElementById('doc-editor');
  if (!editorEl) return;

  // Track dirty state + word count + outline (debounced for performance)
  let wordCountTimer;
  const debouncedWordCount = () => { clearTimeout(wordCountTimer); wordCountTimer = setTimeout(() => updateWordCount(), 300); };
  let outlineTimer;
  const debouncedOutline = () => { clearTimeout(outlineTimer); outlineTimer = setTimeout(() => { updateDocOutline(); updateDocOutlineNav(); }, 500); };
  editorEl.addEventListener('input', () => {
    dirty = true;
    debouncedWordCount();
    if (outlineVisible) debouncedOutline();
    else if (outlineNavVisible) debouncedOutline();
  });

  // Image resize handles
  editorEl.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      showImageResizeHandles(e.target);
    } else {
      removeImageResizeHandles();
    }
  });

  // Document Outline toggle
  document.getElementById('doc-outline-toggle')?.addEventListener('click', toggleDocOutline);
  document.getElementById('doc-outline-close')?.addEventListener('click', toggleDocOutline);

  // Insert Date/Time
  document.getElementById('doc-insert-datetime')?.addEventListener('click', () => showDateTimePicker());

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

  // Document Compare
  document.getElementById('doc-compare')?.addEventListener('click', () => showDocCompare());

  // Focus Mode
  document.getElementById('doc-focus-mode')?.addEventListener('click', () => toggleFocusMode());

  // Reading Mode
  document.getElementById('doc-reading-mode')?.addEventListener('click', () => toggleReadingMode());

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

  // Font size — apply to selection, not entire editor
  const fontSize = document.getElementById('doc-font-size');
  if (fontSize) {
    fontSize.addEventListener('change', () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && editorEl.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontSize = fontSize.value;
        try {
          range.surroundContents(span);
        } catch {
          // If range crosses element boundaries, use execCommand fallback
          const sizeMap = { '9px': 1, '10px': 1, '11px': 2, '12px': 3, '14px': 4, '16px': 4, '18px': 5, '20px': 5, '24px': 6, '28px': 6, '32px': 7, '36px': 7, '48px': 7, '72px': 7 };
          document.execCommand('fontSize', false, sizeMap[fontSize.value] || 4);
          // Override the font element size with actual px
          editorEl.querySelectorAll('font[size]').forEach((f) => {
            const s = document.createElement('span');
            s.style.fontSize = fontSize.value;
            s.innerHTML = f.innerHTML;
            f.replaceWith(s);
          });
        }
      } else {
        // No selection — set as default for new text
        editorEl.style.fontSize = fontSize.value;
      }
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
      if (c === 'transparent') swatch.innerHTML = '<span style="font-size:14px;line-height:28px">✕</span>';
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
    // Paste as plain text (Ctrl+Shift+V)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        document.execCommand('insertText', false, text);
      }).catch(() => {});
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
  });

  // Smart paste: handle images from clipboard and clean external HTML
  editorEl.addEventListener('paste', (e) => {
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
    const html = e.clipboardData.getData('text/html');
    if (html && (html.includes('data-meta') || html.includes('MsoNormal') || html.includes('docs-internal'))) {
      e.preventDefault();
      const cleaned = html
        .replace(/<meta[^>]*>/gi, '')
        .replace(/class="[^"]*"/gi, '')
        .replace(/style="[^"]*mso[^"]*"/gi, '')
        .replace(/<o:p>.*?<\/o:p>/gi, '')
        .replace(/<!--.*?-->/gs, '')
        .replace(/<\/?span[^>]*>/gi, '')
        .replace(/<\/?font[^>]*>/gi, '');
      document.execCommand('insertHTML', false, cleaned);
    }

    // Handle tab-separated data paste — auto-create table
    const text = e.clipboardData.getData('text/plain');
    if (!html && text && text.includes('\t') && text.includes('\n')) {
      e.preventDefault();
      const rows = text.split('\n').filter((r) => r.trim().length > 0);
      const tableRows = rows.map((row, i) => {
        const cells = row.split('\t');
        const tag = i === 0 ? 'th' : 'td';
        return `<tr>${cells.map((c) => `<${tag}>${c.replace(/</g, '&lt;')}</${tag}>`).join('')}</tr>`;
      }).join('');
      const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:8px 0"><tbody>${tableRows}</tbody></table>`;
      document.execCommand('insertHTML', false, tableHtml);
    }
  });

  // Auto-Save, Version Diff, Smart Styles, Outline Nav — use setTimeout to avoid hoisting issues
  setTimeout(() => {
    if (typeof initAutoSave === 'function') initAutoSave();
  }, 0);

  // Version Compare/Diff (enhanced)
  document.getElementById('doc-version-diff')?.addEventListener('click', () => { if (typeof showVersionDiffDialog === 'function') showVersionDiffDialog(); });

  // Smart Styles (enhanced)
  document.getElementById('doc-smart-styles')?.addEventListener('click', () => { if (typeof showSmartStyleGallery === 'function') showSmartStyleGallery(); });

  // Document Outline Navigator (enhanced - drag reorder headings)
  document.getElementById('doc-outline-nav')?.addEventListener('click', () => { if (typeof toggleDocOutlineNav === 'function') toggleDocOutlineNav(); });
  document.getElementById('doc-outline-nav-close')?.addEventListener('click', () => toggleDocOutlineNav());

  // Word Count Goals (enhanced)
  document.getElementById('doc-writing-stats')?.addEventListener('click', () => showWritingStatsDialog());

  // Session tracking
  sessionStartTime = Date.now();
  sessionWordCountStart = typeof getWordCount === 'function' ? getWordCount() : 0;
  if (typeof SESSION_START_KEY !== 'undefined') localStorage.setItem(SESSION_START_KEY, String(sessionStartTime));
  if (typeof updateWritingStreak === 'function') updateWritingStreak();

  // Initial word count + ruler
  updateWordCount();
  setTimeout(() => renderRuler(), 100);

  // Table context toolbar
  editorEl.addEventListener('click', (e) => {
    const td = e.target.closest('td, th');
    const table = td?.closest('table');
    if (table && editorEl.contains(table)) {
      showTableToolbar(table, td);
    } else {
      hideTableToolbar();
    }
  });

  // Auto-correct toggle
  autoCorrectEnabled = localStorage.getItem(AUTO_CORRECT_KEY) === 'true';
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
    dirty = true;
  };
  editorEl.addEventListener('keydown', autoCorrectHandler);
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
    autoSaveInterval = null;
  }
  for (const id of _docIntervals) {
    clearInterval(id);
  }
  _docIntervals.length = 0;

  // Remove dynamic overlays
  document.querySelector('.doc-focus-overlay')?.remove();
  document.querySelector('.doc-reading-overlay')?.remove();
  document.querySelector('.doc-highlight-palette')?.remove();
  document.querySelector('.doc-table-color-picker')?.remove();
  hideTableToolbar();

  // Reset state
  editorEl = null;
  dirty = false;
  docEditorInitialized = false;
  highlightedNodes = [];
  findBarEl = null;
  findInput = null;
  replaceInput = null;

  // Remove goal progress bar
  document.getElementById('doc-goal-progress')?.remove();
}

// ─── Table Context Toolbar ─────────────────────────────────
let activeTableToolbar = null;

function hideTableToolbar() {
  if (activeTableToolbar) {
    activeTableToolbar.remove();
    activeTableToolbar = null;
  }
}

function showTableToolbar(table, td) {
  hideTableToolbar();

  const toolbar = document.createElement('div');
  toolbar.className = 'doc-table-toolbar';
  toolbar.style.cssText = 'position:absolute;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px;display:flex;gap:2px;z-index:1500;font-size:11px';

  const actions = [
    { label: '+Row↑', title: 'Insert Row Above', fn: () => insertTableRow(table, td, 'before') },
    { label: '+Row↓', title: 'Insert Row Below', fn: () => insertTableRow(table, td, 'after') },
    { label: '+Col←', title: 'Insert Column Left', fn: () => insertTableCol(table, td, 'before') },
    { label: '+Col→', title: 'Insert Column Right', fn: () => insertTableCol(table, td, 'after') },
    { label: '−Row', title: 'Delete Row', fn: () => deleteTableRow(table, td) },
    { label: '−Col', title: 'Delete Column', fn: () => deleteTableCol(table, td) },
    { label: 'Header', title: 'Toggle Header Row', fn: () => toggleTableHeader(table) },
    { label: 'Color', title: 'Cell Color', fn: (e) => showTableCellColor(td, e.currentTarget) },
    { label: '🗑', title: 'Delete Table', fn: () => { table.remove(); hideTableToolbar(); dirty = true; } },
  ];

  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:4px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);cursor:pointer;font-size:11px;color:var(--text-primary);white-space:nowrap';
    btn.textContent = a.label;
    btn.title = a.title;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => { a.fn(e); dirty = true; });
    toolbar.appendChild(btn);
  });

  // Position toolbar above the table
  const tableRect = table.getBoundingClientRect();
  const editorRect = editorEl.getBoundingClientRect();
  toolbar.style.left = (tableRect.left - editorRect.left) + 'px';
  toolbar.style.top = (tableRect.top - editorRect.top - 36) + 'px';

  editorEl.style.position = 'relative';
  editorEl.appendChild(toolbar);
  activeTableToolbar = toolbar;
}

function insertTableRow(table, td, position) {
  const row = td.closest('tr');
  if (!row) return;
  const colCount = row.cells.length;
  const newRow = document.createElement('tr');
  for (let i = 0; i < colCount; i++) {
    const cell = document.createElement('td');
    cell.style.cssText = 'border:1px solid var(--border-color);padding:8px 12px';
    cell.innerHTML = '&nbsp;';
    newRow.appendChild(cell);
  }
  if (position === 'before') row.before(newRow);
  else row.after(newRow);
}

function insertTableCol(table, td, position) {
  const colIdx = Array.from(td.closest('tr').cells).indexOf(td);
  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    const refCell = row.cells[colIdx];
    if (!refCell) return;
    const isHeader = refCell.tagName === 'TH';
    const cell = document.createElement(isHeader ? 'th' : 'td');
    cell.style.cssText = refCell.style.cssText;
    cell.innerHTML = '&nbsp;';
    if (position === 'before') refCell.before(cell);
    else refCell.after(cell);
  });
}

function deleteTableRow(table, td) {
  const row = td.closest('tr');
  if (!row || table.querySelectorAll('tr').length <= 1) return;
  row.remove();
}

function deleteTableCol(table, td) {
  const colIdx = Array.from(td.closest('tr').cells).indexOf(td);
  const rows = table.querySelectorAll('tr');
  if (rows[0]?.cells.length <= 1) return;
  rows.forEach(row => {
    if (row.cells[colIdx]) row.cells[colIdx].remove();
  });
}

function toggleTableHeader(table) {
  const firstRow = table.querySelector('tr');
  if (!firstRow) return;
  const cells = firstRow.querySelectorAll('td, th');
  const isHeader = cells[0]?.tagName === 'TH';
  cells.forEach(cell => {
    const newCell = document.createElement(isHeader ? 'td' : 'th');
    newCell.innerHTML = cell.innerHTML;
    newCell.style.cssText = cell.style.cssText;
    if (!isHeader) {
      newCell.style.fontWeight = '600';
      newCell.style.background = 'rgba(0,0,0,0.05)';
    } else {
      newCell.style.fontWeight = '';
      newCell.style.background = '';
    }
    cell.replaceWith(newCell);
  });
}

function showTableCellColor(td, btn) {
  const existing = document.querySelector('.doc-table-color-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.className = 'doc-table-color-picker';
  picker.style.cssText = 'position:fixed;z-index:2000;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;display:grid;grid-template-columns:repeat(5,1fr);gap:4px';

  const rect = btn.getBoundingClientRect();
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.left = rect.left + 'px';

  const colors = ['transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa', '#fce7f3', '#e5e7eb', '#1f2937'];
  colors.forEach(c => {
    const swatch = document.createElement('button');
    swatch.style.cssText = `width:24px;height:24px;border:1px solid var(--border-color);border-radius:3px;cursor:pointer;background:${c === 'transparent' ? 'var(--bg-primary)' : c}`;
    if (c === 'transparent') swatch.innerHTML = '<span style="font-size:10px">✕</span>';
    swatch.addEventListener('click', () => {
      td.style.background = c === 'transparent' ? '' : c;
      picker.remove();
    });
    picker.appendChild(swatch);
  });

  document.body.appendChild(picker);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

// ─── Find / Replace ────────────────────────────────────────
let findBarEl = null;
let findInput = null;
let replaceInput = null;
let highlightedNodes = [];
let findUseRegex = false;
let findMatchCase = false;

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

  // Regex toggle
  const regexBtn = document.getElementById('doc-find-regex');
  regexBtn?.addEventListener('click', () => {
    findUseRegex = !findUseRegex;
    regexBtn.style.opacity = findUseRegex ? '1' : '0.6';
    regexBtn.style.background = findUseRegex ? 'var(--accent-color)' : '';
    regexBtn.style.color = findUseRegex ? '#fff' : '';
    doFind();
  });
  // Case toggle
  const caseBtn = document.getElementById('doc-find-case');
  caseBtn?.addEventListener('click', () => {
    findMatchCase = !findMatchCase;
    caseBtn.style.opacity = findMatchCase ? '1' : '0.6';
    caseBtn.style.background = findMatchCase ? 'var(--accent-color)' : '';
    caseBtn.style.color = findMatchCase ? '#fff' : '';
    doFind();
  });
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

  if (findUseRegex) {
    let re;
    try { re = new RegExp(query, findMatchCase ? 'g' : 'gi'); } catch { updateFindCount(0, 0); return; }
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        matches.push({ node, start: m.index, length: m[0].length });
      }
    }
  } else {
    while ((node = walker.nextNode())) {
      let idx = 0;
      const text = node.textContent;
      const searchText = findMatchCase ? text : text.toLowerCase();
      const searchQuery = findMatchCase ? query : query.toLowerCase();
      while ((idx = searchText.indexOf(searchQuery, idx)) !== -1) {
        matches.push({ node, start: idx, length: query.length });
        idx += query.length;
      }
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
  const count = highlightedNodes.length;
  for (const span of highlightedNodes) {
    span.replaceWith(document.createTextNode(replaceInput.value));
  }
  editorEl?.normalize();
  highlightedNodes = [];
  dirty = true;
  updateFindCount(0, 0);
  // Show replacement count notification
  const countEl = document.getElementById('doc-find-count');
  if (countEl) countEl.textContent = `${t('ui.replaced')} ${count}`;
  setTimeout(() => { if (countEl && countEl.textContent.startsWith(t('ui.replaced'))) countEl.textContent = ''; }, 2500);
}

// ─── Auto-Correct ──────────────────────────────────────────
function toggleAutoCorrect() {
  autoCorrectEnabled = !autoCorrectEnabled;
  localStorage.setItem(AUTO_CORRECT_KEY, String(autoCorrectEnabled));
  const btn = document.getElementById('doc-autocorrect');
  if (btn) {
    btn.style.opacity = autoCorrectEnabled ? '1' : '0.6';
    btn.style.background = autoCorrectEnabled ? 'var(--accent-color)' : '';
    btn.style.color = autoCorrectEnabled ? '#fff' : '';
  }
}

// ─── Word Count ────────────────────────────────────────────
let wordGoal = 0; // 0 = no goal

function updateWordCount() {
  const statusEl = document.getElementById('doc-status-bar');
  if (!statusEl || !editorEl) return;
  const text = editorEl.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const paras = editorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').length || 1;
  const readingTime = Math.max(1, Math.ceil(words / 200));
  const pages = Math.max(1, Math.ceil(words / 250));

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
  const syllables = text.split(/\s+/).reduce((acc, word) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return acc + 1;
    let count = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)?.length || 1;
    return acc + count;
  }, 0);
  const fkGrade = words > 30 ? Math.round((0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59) * 10) / 10 : 0;
  const readLevel = fkGrade <= 0 ? '' : fkGrade <= 5 ? '(Easy)' : fkGrade <= 8 ? '(Medium)' : fkGrade <= 12 ? '(Advanced)' : '(Expert)';

  let goalStr = '';
  if (wordGoal > 0) {
    const pct = Math.min(100, Math.round((words / wordGoal) * 100));
    goalStr = `  |  Goal: ${pct}% (${words}/${wordGoal})`;
  }

  statusEl.innerHTML = `<span id="doc-stats-clickable" style="cursor:pointer" title="Click for detailed statistics">Words: ${words.toLocaleString()}  |  Chars: ${chars.toLocaleString()} (${charsNoSpace.toLocaleString()})  |  ¶${paras}  |  ~${readingTime} min read  |  ~${pages} pg${fkGrade > 0 ? `  |  Grade ${fkGrade} ${readLevel}` : ''}${goalStr}</span>  <button id="doc-word-goal-btn" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--text-tertiary);text-decoration:underline">${wordGoal > 0 ? 'Edit Goal' : 'Set Goal'}</button>`;

  document.getElementById('doc-stats-clickable')?.addEventListener('click', () => {
    showDocStatsDialog(words, chars, charsNoSpace, paras, readingTime, pages, sentences, fkGrade, readLevel, syllables);
  });

  // Update progress bar if goal is set
  let bar = document.getElementById('doc-goal-progress');
  if (wordGoal > 0) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'doc-goal-progress';
      bar.style.cssText = 'height:3px;background:var(--border-color);position:relative';
      statusEl.parentElement?.insertBefore(bar, statusEl);
    }
    const pct = Math.min(100, (words / wordGoal) * 100);
    bar.innerHTML = `<div style="height:100%;width:${pct}%;background:${pct >= 100 ? '#34a853' : '#4285f4'};transition:width 0.3s;border-radius:2px"></div>`;
  } else if (bar) {
    bar.remove();
  }

  document.getElementById('doc-word-goal-btn')?.addEventListener('click', () => {
    const val = prompt('Set word count goal (0 to clear):', wordGoal || '');
    if (val !== null) {
      wordGoal = parseInt(val, 10) || 0;
      updateWordCount();
    }
  });
}

function showDocStatsDialog(words, chars, charsNoSpace, paras, readingTime, pages, sentences, fkGrade, readLevel, syllables) {
  document.querySelector('.doc-stats-dialog')?.remove();

  // Selection stats
  const sel = window.getSelection();
  let selWords = 0, selChars = 0;
  if (sel && !sel.isCollapsed) {
    const selText = sel.toString();
    selWords = selText.trim() ? selText.trim().split(/\s+/).length : 0;
    selChars = selText.length;
  }

  // Count specific elements
  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
  const images = editorEl.querySelectorAll('img').length;
  const links = editorEl.querySelectorAll('a').length;
  const tables = editorEl.querySelectorAll('table').length;
  const lists = editorEl.querySelectorAll('ul, ol').length;

  const avgWordLen = words > 0 ? (charsNoSpace / words).toFixed(1) : 0;
  const avgSentLen = sentences > 0 ? (words / sentences).toFixed(1) : 0;
  const speakingTime = Math.max(1, Math.ceil(words / 130));

  const dlg = document.createElement('div');
  dlg.className = 'ai-setup-modal doc-stats-dialog';
  dlg.innerHTML = `
    <div class="ai-setup-content" style="width:400px">
      <div class="ai-setup-header">
        <h3>Document Statistics</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tbody>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Words</td><td style="padding:6px 8px;font-weight:600;text-align:right">${words.toLocaleString()}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Characters (with spaces)</td><td style="padding:6px 8px;font-weight:600;text-align:right">${chars.toLocaleString()}</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Characters (no spaces)</td><td style="padding:6px 8px;font-weight:600;text-align:right">${charsNoSpace.toLocaleString()}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Sentences</td><td style="padding:6px 8px;font-weight:600;text-align:right">${sentences}</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Paragraphs</td><td style="padding:6px 8px;font-weight:600;text-align:right">${paras}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Pages (est.)</td><td style="padding:6px 8px;font-weight:600;text-align:right">${pages}</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Syllables</td><td style="padding:6px 8px;font-weight:600;text-align:right">${syllables.toLocaleString()}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Avg word length</td><td style="padding:6px 8px;font-weight:600;text-align:right">${avgWordLen} chars</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Avg sentence length</td><td style="padding:6px 8px;font-weight:600;text-align:right">${avgSentLen} words</td></tr>
          </tbody>
        </table>

        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color,#0071e3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Time Estimates</div>
          <div style="display:flex;gap:12px;font-size:13px">
            <div style="flex:1;padding:8px;background:var(--sidebar-bg);border-radius:6px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${readingTime}</div>
              <div style="font-size:10px;color:var(--text-secondary)">min reading</div>
            </div>
            <div style="flex:1;padding:8px;background:var(--sidebar-bg);border-radius:6px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${speakingTime}</div>
              <div style="font-size:10px;color:var(--text-secondary)">min speaking</div>
            </div>
            <div style="flex:1;padding:8px;background:var(--sidebar-bg);border-radius:6px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${fkGrade || '-'}</div>
              <div style="font-size:10px;color:var(--text-secondary)">FK Grade ${readLevel}</div>
            </div>
          </div>
        </div>

        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color,#0071e3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Elements</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px">
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Headings: ${headings}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Images: ${images}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Links: ${links}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Tables: ${tables}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Lists: ${lists}</span>
          </div>
        </div>

        ${selWords > 0 ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color,#0071e3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Selection</div>
          <div style="font-size:13px;color:var(--text-secondary)">${selWords} words, ${selChars} characters selected</div>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(dlg);
  dlg.querySelector('.ai-setup-close')?.addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
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
  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length === 0) {
    alert('No headings found. Add headings (H1-H6) first.');
    return;
  }

  // Build hierarchical numbering
  const counters = [0, 0, 0, 0, 0, 0]; // h1-h6

  // Build TOC
  const toc = document.createElement('div');
  toc.className = 'doc-toc';
  toc.contentEditable = 'false';

  let tocHtml = `<div class="doc-toc-title" style="font-size:18px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--accent-color, #0071e3)">Table of Contents</div>
  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">${headings.length} sections</div>
  <nav class="doc-toc-list">`;

  headings.forEach((h, i) => {
    const level = parseInt(h.tagName[1]);
    const id = `toc-heading-${i}`;
    h.id = id;

    // Update counters
    counters[level - 1]++;
    for (let j = level; j < 6; j++) counters[j] = 0;

    // Build number string (e.g., "1.2.3")
    const numParts = [];
    for (let j = 0; j < level; j++) {
      if (counters[j] > 0) numParts.push(counters[j]);
    }
    const numStr = numParts.join('.');

    const indent = (level - 1) * 20;
    const fontSize = Math.max(11, 15 - level);
    const fontWeight = level <= 2 ? '600' : '400';
    const color = level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)';

    tocHtml += `<a href="#${id}" class="doc-toc-item" style="padding-left:${indent}px;font-size:${fontSize}px;font-weight:${fontWeight};color:${color};display:flex;align-items:baseline;gap:6px;text-decoration:none;padding:4px 8px;border-radius:4px;transition:background 0.15s" onclick="event.preventDefault();document.getElementById('${id}').scrollIntoView({behavior:'smooth'})" onmouseenter="this.style.background='var(--hover-bg, #f0f0f0)'" onmouseleave="this.style.background='transparent'">
      <span style="color:var(--accent-color, #0071e3);font-size:${fontSize - 1}px;min-width:${level * 16}px">${numStr}</span>
      <span style="flex:1">${h.textContent}</span>
      <span style="border-bottom:1px dotted var(--border-color);flex:1;min-width:20px;margin:0 4px"></span>
    </a>`;
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
let hfConfig = {
  headerText: '', footerText: '',
  headerHeight: 28, footerHeight: 28,
  differentFirstPage: false,
  differentOddEven: false,
  firstPageHeader: '', firstPageFooter: '',
  oddHeader: '', oddFooter: '',
  evenHeader: '', evenFooter: '',
};

function showHeaderFooterDialog() {
  document.querySelector('.doc-hf-dialog')?.remove();

  const wrapper = editorEl?.closest('.doc-page-wrapper');
  const existingHeader = wrapper?.querySelector('.doc-page-header');
  const existingFooter = wrapper?.querySelector('.doc-page-footer');

  // Restore from existing
  if (existingHeader && !hfConfig.headerText) hfConfig.headerText = existingHeader.innerHTML;
  if (existingFooter && !hfConfig.footerText) hfConfig.footerText = existingFooter.innerHTML;

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-hf-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:520px">
      <div class="ai-setup-header">
        <h3>Headers & Footers</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <!-- Main header/footer -->
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Header</label>
          <div id="hf-header-edit" contenteditable="true" style="width:100%;min-height:36px;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);outline:none">${hfConfig.headerText || ''}</div>
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Footer</label>
          <div id="hf-footer-edit" contenteditable="true" style="width:100%;min-height:36px;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);outline:none">${hfConfig.footerText || ''}</div>
        </div>

        <!-- Insert fields -->
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-secondary)">Insert Field</label>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="hf-field-btn toolbar-btn" data-field="pagenum" style="font-size:11px;padding:4px 8px">Page Number</button>
            <button class="hf-field-btn toolbar-btn" data-field="date" style="font-size:11px;padding:4px 8px">Date</button>
            <button class="hf-field-btn toolbar-btn" data-field="time" style="font-size:11px;padding:4px 8px">Time</button>
            <button class="hf-field-btn toolbar-btn" data-field="title" style="font-size:11px;padding:4px 8px">Document Title</button>
            <button class="hf-field-btn toolbar-btn" data-field="filename" style="font-size:11px;padding:4px 8px">File Name</button>
          </div>
        </div>

        <!-- Options -->
        <div style="margin-bottom:14px;border:1px solid var(--border-color);border-radius:8px;padding:12px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:8px">
            <input type="checkbox" id="hf-diff-first" ${hfConfig.differentFirstPage ? 'checked' : ''}>
            Different first page / 첫 페이지 다르게
          </label>
          <div id="hf-first-page-fields" style="display:${hfConfig.differentFirstPage ? 'block' : 'none'};padding-left:24px;margin-bottom:8px">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">First page header</label>
            <input type="text" id="hf-first-header" class="doc-find-input" style="width:100%;margin-bottom:6px" value="${hfConfig.firstPageHeader}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">First page footer</label>
            <input type="text" id="hf-first-footer" class="doc-find-input" style="width:100%" value="${hfConfig.firstPageFooter}">
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:8px">
            <input type="checkbox" id="hf-diff-oddeven" ${hfConfig.differentOddEven ? 'checked' : ''}>
            Different odd/even pages / 홀짝 페이지 다르게
          </label>
          <div id="hf-oddeven-fields" style="display:${hfConfig.differentOddEven ? 'block' : 'none'};padding-left:24px">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Odd page header</label>
            <input type="text" id="hf-odd-header" class="doc-find-input" style="width:100%;margin-bottom:4px" value="${hfConfig.oddHeader}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Even page header</label>
            <input type="text" id="hf-even-header" class="doc-find-input" style="width:100%;margin-bottom:6px" value="${hfConfig.evenHeader}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Odd page footer</label>
            <input type="text" id="hf-odd-footer" class="doc-find-input" style="width:100%;margin-bottom:4px" value="${hfConfig.oddFooter}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Even page footer</label>
            <input type="text" id="hf-even-footer" class="doc-find-input" style="width:100%" value="${hfConfig.evenFooter}">
          </div>
        </div>

        <!-- Height adjustment -->
        <div style="margin-bottom:14px;display:flex;gap:16px">
          <label style="flex:1;font-size:12px;color:var(--text-secondary)">Header height (px)
            <input type="number" id="hf-header-height" value="${hfConfig.headerHeight}" min="16" max="100" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
          </label>
          <label style="flex:1;font-size:12px;color:var(--text-secondary)">Footer height (px)
            <input type="number" id="hf-footer-height" value="${hfConfig.footerHeight}" min="16" max="100" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
          </label>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="hf-remove">Remove All</button>
          <button class="ai-pull-btn" id="hf-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Toggle sections
  dialog.querySelector('#hf-diff-first').addEventListener('change', (e) => {
    dialog.querySelector('#hf-first-page-fields').style.display = e.target.checked ? 'block' : 'none';
  });
  dialog.querySelector('#hf-diff-oddeven').addEventListener('change', (e) => {
    dialog.querySelector('#hf-oddeven-fields').style.display = e.target.checked ? 'block' : 'none';
  });

  // Insert field buttons
  dialog.querySelectorAll('.hf-field-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fieldMap = {
        pagenum: '{{page}}',
        date: '{{date}}',
        time: '{{time}}',
        title: '{{title}}',
        filename: '{{filename}}',
      };
      const field = fieldMap[btn.dataset.field] || '';
      // Insert into whichever header/footer field is focused
      const active = document.activeElement;
      if (active && (active.id === 'hf-header-edit' || active.id === 'hf-footer-edit')) {
        document.execCommand('insertText', false, field);
      } else {
        // Default: append to header
        const headerEdit = dialog.querySelector('#hf-header-edit');
        headerEdit.focus();
        document.execCommand('insertText', false, field);
      }
    });
  });

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#hf-apply')?.addEventListener('click', () => {
    hfConfig.headerText = dialog.querySelector('#hf-header-edit').innerHTML;
    hfConfig.footerText = dialog.querySelector('#hf-footer-edit').innerHTML;
    hfConfig.headerHeight = parseInt(dialog.querySelector('#hf-header-height').value) || 28;
    hfConfig.footerHeight = parseInt(dialog.querySelector('#hf-footer-height').value) || 28;
    hfConfig.differentFirstPage = dialog.querySelector('#hf-diff-first').checked;
    hfConfig.differentOddEven = dialog.querySelector('#hf-diff-oddeven').checked;
    hfConfig.firstPageHeader = dialog.querySelector('#hf-first-header')?.value || '';
    hfConfig.firstPageFooter = dialog.querySelector('#hf-first-footer')?.value || '';
    hfConfig.oddHeader = dialog.querySelector('#hf-odd-header')?.value || '';
    hfConfig.oddFooter = dialog.querySelector('#hf-odd-footer')?.value || '';
    hfConfig.evenHeader = dialog.querySelector('#hf-even-header')?.value || '';
    hfConfig.evenFooter = dialog.querySelector('#hf-even-footer')?.value || '';
    applyHeaderFooter();
    dialog.remove();
  });

  dialog.querySelector('#hf-remove')?.addEventListener('click', () => {
    hfConfig = { headerText: '', footerText: '', headerHeight: 28, footerHeight: 28, differentFirstPage: false, differentOddEven: false, firstPageHeader: '', firstPageFooter: '', oddHeader: '', oddFooter: '', evenHeader: '', evenFooter: '' };
    const w = editorEl?.closest('.doc-page-wrapper');
    w?.querySelector('.doc-page-header')?.remove();
    w?.querySelector('.doc-page-footer')?.remove();
    dialog.remove();
  });
}

function resolveHFFields(text) {
  const now = new Date();
  const title = editorEl?.querySelector('h1')?.textContent || 'Untitled';
  const fileName = document.getElementById('file-name')?.textContent || 'document';
  return text
    .replace(/\{\{page\}\}/g, '<span class="hf-page-num">1</span>')
    .replace(/\{\{date\}\}/g, now.toLocaleDateString())
    .replace(/\{\{time\}\}/g, now.toLocaleTimeString())
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{filename\}\}/g, fileName);
}

function applyHeaderFooter() {
  const wrapper = editorEl?.closest('.doc-page-wrapper');
  if (!wrapper) return;

  // Remove existing
  wrapper.querySelector('.doc-page-header')?.remove();
  wrapper.querySelector('.doc-page-footer')?.remove();

  const headerContent = resolveHFFields(hfConfig.headerText);
  const footerContent = resolveHFFields(hfConfig.footerText);

  if (headerContent) {
    const header = document.createElement('div');
    header.className = 'doc-page-header';
    header.contentEditable = 'true';
    header.style.minHeight = hfConfig.headerHeight + 'px';
    header.innerHTML = headerContent;
    // Insert after ruler if exists, otherwise first
    const ruler = wrapper.querySelector('.doc-ruler');
    if (ruler) ruler.after(header);
    else wrapper.insertBefore(header, wrapper.firstChild);
  }

  if (footerContent) {
    const footer = document.createElement('div');
    footer.className = 'doc-page-footer';
    footer.contentEditable = 'true';
    footer.style.minHeight = hfConfig.footerHeight + 'px';
    footer.innerHTML = footerContent;
    wrapper.appendChild(footer);
  }
}

// ─── Page Setup Dialog ───────────────────────────────────────
const PAGE_SIZES = {
  'A4':      { w: 210, h: 297, label: 'A4 (210 × 297 mm)' },
  'A3':      { w: 297, h: 420, label: 'A3 (297 × 420 mm)' },
  'B5':      { w: 176, h: 250, label: 'B5 (176 × 250 mm)' },
  'Letter':  { w: 215.9, h: 279.4, label: 'Letter (8.5 × 11 in)' },
  'Legal':   { w: 215.9, h: 355.6, label: 'Legal (8.5 × 14 in)' },
  '16K':     { w: 195, h: 270, label: '16절 (195 × 270 mm)' },
  'Custom':  { w: 210, h: 297, label: 'Custom' },
};

let currentPageSize = 'A4';
let currentOrientation = 'portrait'; // 'portrait' | 'landscape'
let currentMargins = { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 }; // mm
let currentApplyTo = 'whole'; // 'whole' | 'section'

function showPageSetupDialog() {
  document.querySelector('.doc-ps-dialog')?.remove();

  const curSize = PAGE_SIZES[currentPageSize];
  const isCustom = currentPageSize === 'Custom';

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-ps-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:560px">
      <div class="ai-setup-header">
        <h3>Page Setup / 용지 설정</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body" style="display:flex;gap:24px">
        <div style="flex:1">
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Paper Size / 용지 크기</label>
            <select id="ps-size" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              ${Object.entries(PAGE_SIZES).map(([k, v]) =>
                `<option value="${k}" ${k === currentPageSize ? 'selected' : ''}>${v.label}</option>`
              ).join('')}
            </select>
          </div>
          <div id="ps-custom-dims" style="margin-bottom:14px;display:${isCustom ? 'flex' : 'none'};gap:8px">
            <label style="flex:1;font-size:12px;color:var(--text-secondary)">Width (mm)
              <input type="number" id="ps-cw" value="${curSize.w}" min="50" max="600" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
            <label style="flex:1;font-size:12px;color:var(--text-secondary)">Height (mm)
              <input type="number" id="ps-ch" value="${curSize.h}" min="50" max="1000" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
          </div>
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Orientation / 방향</label>
            <div style="display:flex;gap:8px">
              <button id="ps-portrait" class="toolbar-btn" style="flex:1;padding:10px;border:2px solid ${currentOrientation === 'portrait' ? 'var(--brand-color)' : 'var(--border-color)'};border-radius:8px;display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--bg-primary);cursor:pointer">
                <div style="width:24px;height:32px;border:2px solid currentColor;border-radius:2px"></div>
                <span style="font-size:11px">Portrait</span>
              </button>
              <button id="ps-landscape" class="toolbar-btn" style="flex:1;padding:10px;border:2px solid ${currentOrientation === 'landscape' ? 'var(--brand-color)' : 'var(--border-color)'};border-radius:8px;display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--bg-primary);cursor:pointer">
                <div style="width:32px;height:24px;border:2px solid currentColor;border-radius:2px"></div>
                <span style="font-size:11px">Landscape</span>
              </button>
            </div>
          </div>
          <div style="margin-bottom:14px">
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
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Apply to / 적용 대상</label>
            <select id="ps-apply-to" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              <option value="whole" ${currentApplyTo === 'whole' ? 'selected' : ''}>Whole document / 전체 문서</option>
              <option value="section" ${currentApplyTo === 'section' ? 'selected' : ''}>Current section / 현재 구역</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="ai-pull-btn" id="ps-cancel">Cancel</button>
            <button class="ai-pull-btn" id="ps-apply" style="background:var(--brand-color);color:#fff">Apply</button>
          </div>
        </div>
        <div style="width:180px;display:flex;flex-direction:column;align-items:center;gap:8px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Preview</label>
          <div id="ps-preview-container" style="width:160px;height:220px;display:flex;align-items:center;justify-content:center;background:var(--sidebar-bg);border-radius:8px;border:1px solid var(--border-color)">
            <div id="ps-preview-page" style="background:white;border:1px solid #ccc;box-shadow:0 2px 8px rgba(0,0,0,0.1);position:relative;transition:all 0.2s"></div>
          </div>
          <div id="ps-preview-dims" style="font-size:11px;color:var(--text-secondary);text-align:center"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  let selectedOrientation = currentOrientation;
  let selectedSize = currentPageSize;

  const updatePreview = () => {
    const sizeKey = dialog.querySelector('#ps-size').value;
    const sz = PAGE_SIZES[sizeKey];
    let pw = sizeKey === 'Custom' ? (parseFloat(dialog.querySelector('#ps-cw')?.value) || 210) : sz.w;
    let ph = sizeKey === 'Custom' ? (parseFloat(dialog.querySelector('#ps-ch')?.value) || 297) : sz.h;
    if (selectedOrientation === 'landscape') { [pw, ph] = [ph, pw]; }

    const mt = parseFloat(dialog.querySelector('#ps-mt').value) || 0;
    const mb = parseFloat(dialog.querySelector('#ps-mb').value) || 0;
    const ml = parseFloat(dialog.querySelector('#ps-ml').value) || 0;
    const mr = parseFloat(dialog.querySelector('#ps-mr').value) || 0;

    // Scale to fit within 140x200 preview area
    const maxW = 140, maxH = 200;
    const scale = Math.min(maxW / pw, maxH / ph);
    const dispW = pw * scale;
    const dispH = ph * scale;

    const page = dialog.querySelector('#ps-preview-page');
    page.style.width = dispW + 'px';
    page.style.height = dispH + 'px';

    // Draw margin lines inside the page
    const mtS = mt * scale, mbS = mb * scale, mlS = ml * scale, mrS = mr * scale;
    page.innerHTML = `<div style="position:absolute;top:${mtS}px;left:${mlS}px;right:${mrS}px;bottom:${mbS}px;border:1px dashed rgba(0,113,227,0.4);border-radius:1px"></div>
      <div style="position:absolute;top:${mtS + 4}px;left:${mlS + 3}px;right:${mrS + 3}px">
        <div style="height:2px;background:#ccc;margin-bottom:3px;width:80%"></div>
        <div style="height:2px;background:#ddd;margin-bottom:3px;width:60%"></div>
        <div style="height:2px;background:#ddd;margin-bottom:3px"></div>
        <div style="height:2px;background:#ddd;margin-bottom:3px;width:90%"></div>
        <div style="height:2px;background:#eee;width:40%"></div>
      </div>`;

    const dimsEl = dialog.querySelector('#ps-preview-dims');
    dimsEl.textContent = `${Math.round(pw)} x ${Math.round(ph)} mm (${selectedOrientation})`;
  };

  // Orientation buttons
  dialog.querySelector('#ps-portrait').addEventListener('click', () => {
    selectedOrientation = 'portrait';
    dialog.querySelector('#ps-portrait').style.borderColor = 'var(--brand-color)';
    dialog.querySelector('#ps-landscape').style.borderColor = 'var(--border-color)';
    updatePreview();
  });
  dialog.querySelector('#ps-landscape').addEventListener('click', () => {
    selectedOrientation = 'landscape';
    dialog.querySelector('#ps-landscape').style.borderColor = 'var(--brand-color)';
    dialog.querySelector('#ps-portrait').style.borderColor = 'var(--border-color)';
    updatePreview();
  });

  // Size change
  dialog.querySelector('#ps-size').addEventListener('change', (e) => {
    selectedSize = e.target.value;
    const customDims = dialog.querySelector('#ps-custom-dims');
    customDims.style.display = selectedSize === 'Custom' ? 'flex' : 'none';
    updatePreview();
  });

  // Margin + custom dim changes update preview
  ['#ps-mt','#ps-mb','#ps-ml','#ps-mr','#ps-cw','#ps-ch'].forEach(sel => {
    dialog.querySelector(sel)?.addEventListener('input', () => updatePreview());
  });

  // Initial preview render
  updatePreview();

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
    currentOrientation = selectedOrientation;
    currentMargins = { top: mt, right: mr, bottom: mb, left: ml };
    currentApplyTo = dialog.querySelector('#ps-apply-to').value;

    // Update custom dimensions if Custom selected
    if (size === 'Custom') {
      PAGE_SIZES.Custom.w = parseFloat(dialog.querySelector('#ps-cw').value) || 210;
      PAGE_SIZES.Custom.h = parseFloat(dialog.querySelector('#ps-ch').value) || 297;
    }

    applyPageLayout();
    dialog.remove();
  });
}

function applyPageLayout() {
  if (!editorEl) return;
  const ps = PAGE_SIZES[currentPageSize];
  let w = ps.w, h = ps.h;
  if (currentOrientation === 'landscape') { [w, h] = [h, w]; }

  if (currentApplyTo === 'section') {
    // Apply to current section only: find nearest section break container
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const section = node ? (node.nodeType === 3 ? node.parentElement : node)?.closest('.doc-section-content') : null;
    if (section) {
      section.style.width = w + 'mm';
      section.style.minHeight = h + 'mm';
      section.style.padding = `${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm`;
    }
  } else {
    editorEl.style.width = w + 'mm';
    editorEl.style.minHeight = h + 'mm';
    editorEl.style.padding = `${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm`;
  }
  renderRuler();
}

// ─── Document Ruler ──────────────────────────────────────────
function renderRuler() {
  const ruler = document.getElementById('doc-ruler');
  if (!ruler || !editorEl) return;

  const editorWidth = editorEl.offsetWidth;
  const leftMarginPx = currentMargins.left * 3.78; // mm to px (approx)
  const rightMarginPx = currentMargins.right * 3.78;
  const contentWidth = editorWidth - leftMarginPx - rightMarginPx;

  // Match ruler width to the editor's CSS width (210mm) rather than offsetWidth
  const editorStyle = getComputedStyle(editorEl);
  const rulerWidth = parseFloat(editorStyle.width) || editorWidth;
  ruler.style.width = rulerWidth + 'px';

  let html = '';
  // Draw ruler marks every 1cm (approximately 37.8px)
  const cmPx = 37.8;
  const totalCm = Math.floor(editorWidth / cmPx);

  // Left margin indicator
  html += `<div class="ruler-margin-left" style="position:absolute;left:0;top:0;width:${leftMarginPx}px;height:100%;background:var(--border-color);opacity:0.3"></div>`;
  // Right margin indicator
  html += `<div class="ruler-margin-right" style="position:absolute;right:0;top:0;width:${rightMarginPx}px;height:100%;background:var(--border-color);opacity:0.3"></div>`;

  for (let cm = 0; cm <= totalCm; cm++) {
    const x = cm * cmPx;
    // Full cm marks
    html += `<div style="position:absolute;left:${x}px;bottom:0;width:1px;height:${cm % 5 === 0 ? 12 : 8}px;background:var(--text-tertiary)"></div>`;
    // Labels every 5cm
    if (cm > 0 && cm % 5 === 0) {
      html += `<span style="position:absolute;left:${x - 5}px;top:1px;font-size:8px;color:var(--text-secondary)">${cm}</span>`;
    }
    // Half cm marks
    if (cm < totalCm) {
      html += `<div style="position:absolute;left:${x + cmPx / 2}px;bottom:0;width:1px;height:5px;background:var(--text-tertiary);opacity:0.5"></div>`;
    }
  }

  ruler.innerHTML = html;
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

// ─── Endnotes ──────────────────────────────────────────────
let endnoteCounter = 0;

function insertEndnote() {
  if (!editorEl) return;

  endnoteCounter++;
  const id = `en-${endnoteCounter}`;

  // Insert superscript reference at cursor (Roman numeral style for distinction)
  const romanNum = toRoman(endnoteCounter);
  const refHtml = `<sup class="doc-en-ref" data-en="${id}" style="color:#9333ea;cursor:pointer;font-weight:700">[${romanNum}]</sup>`;
  insertHTMLAtCursor(refHtml);

  // Add/update endnote section at the very end
  let enSection = editorEl.querySelector('.doc-endnotes');
  if (!enSection) {
    enSection = document.createElement('div');
    enSection.className = 'doc-endnotes';
    enSection.contentEditable = 'false';
    enSection.innerHTML = '<hr style="margin-top:48px;border-top:2px double var(--border-color)"><div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Endnotes</div>';
    editorEl.appendChild(enSection);
  }
  // Ensure endnotes section is always after footnotes
  const fnSection = editorEl.querySelector('.doc-footnotes');
  if (fnSection && fnSection.nextSibling !== enSection) {
    editorEl.appendChild(enSection);
  }

  const enItem = document.createElement('div');
  enItem.className = 'doc-en-item';
  enItem.contentEditable = 'true';
  enItem.id = id;
  enItem.style.cssText = 'font-size:12px;color:var(--text-secondary);padding:3px 0;margin-left:20px;text-indent:-20px';
  enItem.innerHTML = `<sup style="color:#9333ea;font-weight:700">[${romanNum}]</sup> <span>Enter endnote text...</span>`;
  enSection.appendChild(enItem);

  enItem.focus();
  dirty = true;
}

function toRoman(n) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r.toLowerCase();
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

// ─── Quick Style Gallery ────────────────────────────────────
function showStyleGallery() {
  const existing = document.querySelector('.doc-style-gallery');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('doc-styles');
  const rect = btn.getBoundingClientRect();

  const styles = [
    { name: 'Title', css: 'font-size:28px;font-weight:800;color:var(--text-primary);margin:0 0 8px;line-height:1.2', tag: 'h1' },
    { name: 'Subtitle', css: 'font-size:18px;font-weight:400;color:var(--text-secondary);margin:0 0 16px;line-height:1.4', tag: 'p' },
    { name: 'Heading 1', css: 'font-size:24px;font-weight:700;color:#1a73e8;border-bottom:2px solid #1a73e8;padding-bottom:4px;margin:24px 0 8px', tag: 'h1' },
    { name: 'Heading 2', css: 'font-size:20px;font-weight:600;color:#333;margin:20px 0 6px', tag: 'h2' },
    { name: 'Quote', css: 'font-size:16px;font-style:italic;color:#555;border-left:4px solid #1a73e8;padding:8px 16px;margin:12px 0;background:rgba(26,115,232,0.05)', tag: 'blockquote' },
    { name: 'Code Block', css: 'font-family:monospace;font-size:13px;background:#f5f5f5;padding:12px 16px;border-radius:6px;border:1px solid #e0e0e0;white-space:pre-wrap;margin:12px 0', tag: 'pre' },
    { name: 'Lead Paragraph', css: 'font-size:18px;font-weight:300;color:#444;line-height:1.7;margin:12px 0', tag: 'p' },
    { name: 'Highlight Box', css: 'background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Info Box', css: 'background:#e3f2fd;border:1px solid #2196f3;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Success Box', css: 'background:#e8f5e9;border:1px solid #4caf50;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Danger Box', css: 'background:#ffebee;border:1px solid #f44336;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Caption', css: 'font-size:12px;color:#888;text-align:center;font-style:italic;margin:4px 0 16px', tag: 'p' },
  ];

  const gallery = document.createElement('div');
  gallery.className = 'doc-style-gallery';
  gallery.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;width:320px;max-height:400px;overflow:auto;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;z-index:2000`;

  styles.forEach(s => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px;cursor:pointer;border-radius:4px;margin-bottom:2px;transition:background 0.15s';
    item.innerHTML = `<div style="${s.css};pointer-events:none;font-size:${Math.min(parseInt(s.css.match(/font-size:(\d+)/)?.[1] || 14), 16)}px;line-height:1.3;max-height:28px;overflow:hidden">${s.name}</div>`;
    item.onmouseenter = () => item.style.background = 'var(--hover-bg)';
    item.onmouseleave = () => item.style.background = '';
    item.onclick = () => {
      editorEl.focus();
      const html = `<${s.tag} style="${s.css}">${s.name === 'Code Block' ? 'code here...' : 'Type here...'}</${s.tag}>`;
      document.execCommand('insertHTML', false, html);
      dirty = true;
      gallery.remove();
    };
    gallery.appendChild(item);
  });

  document.body.appendChild(gallery);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!gallery.contains(e.target) && e.target !== btn) {
        gallery.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

// ─── Section Break ──────────────────────────────────────────
function insertSectionBreak() {
  if (!editorEl) return;
  const html = `<div class="doc-section-break" contenteditable="false" style="
    border-top: 2px dashed var(--border-color);
    margin: 24px 0;
    padding: 8px 0;
    text-align: center;
    font-size: 11px;
    color: var(--text-secondary);
    user-select: none;
    page-break-before: always;
  ">— Section Break —</div>`;
  editorEl.focus();
  document.execCommand('insertHTML', false, html);
  dirty = true;
}

// ─── Columns Layout ─────────────────────────────────────────
function showColumnsMenu() {
  const existing = document.querySelector('.doc-cols-menu');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('doc-columns');
  const rect = btn.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.className = 'doc-cols-menu';
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.12);padding:8px;z-index:2000;display:flex;flex-direction:column;gap:2px;min-width:160px`;

  const layouts = [
    { label: '1 Column', cols: 1, icon: '▮' },
    { label: '2 Columns', cols: 2, icon: '▮▮' },
    { label: '3 Columns', cols: 3, icon: '▮▮▮' },
    { label: '2 Columns (Left wide)', cols: '2-left', icon: '▮▯' },
    { label: '2 Columns (Right wide)', cols: '2-right', icon: '▯▮' },
  ];

  layouts.forEach(l => {
    const item = document.createElement('button');
    item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;background:transparent;text-align:left;cursor:pointer;font-size:12px;color:var(--text-primary);border-radius:4px;width:100%';
    item.innerHTML = `<span style="font-family:monospace;letter-spacing:2px;font-size:14px">${l.icon}</span> ${l.label}`;
    item.onmouseenter = () => item.style.background = 'var(--hover-bg)';
    item.onmouseleave = () => item.style.background = 'transparent';
    item.onclick = () => {
      applyColumnLayout(l.cols);
      menu.remove();
    };
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 50);
}

function applyColumnLayout(cols) {
  if (!editorEl) return;
  const sel = window.getSelection();
  let target = editorEl;

  // If text is selected, wrap it in a column container
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const content = range.extractContents();
    const wrapper = document.createElement('div');

    if (cols === 1) {
      wrapper.style.cssText = 'column-count:1';
    } else if (cols === 2) {
      wrapper.style.cssText = 'column-count:2;column-gap:24px;column-rule:1px solid var(--border-color)';
    } else if (cols === 3) {
      wrapper.style.cssText = 'column-count:3;column-gap:20px;column-rule:1px solid var(--border-color)';
    } else if (cols === '2-left') {
      wrapper.style.cssText = 'display:flex;gap:24px';
      const left = document.createElement('div');
      left.style.cssText = 'flex:2';
      const right = document.createElement('div');
      right.style.cssText = 'flex:1;border-left:1px solid var(--border-color);padding-left:16px';
      left.appendChild(content);
      right.innerHTML = '<p>Right column content...</p>';
      wrapper.appendChild(left);
      wrapper.appendChild(right);
      range.insertNode(wrapper);
      dirty = true;
      return;
    } else if (cols === '2-right') {
      wrapper.style.cssText = 'display:flex;gap:24px';
      const left = document.createElement('div');
      left.style.cssText = 'flex:1;border-right:1px solid var(--border-color);padding-right:16px';
      const right = document.createElement('div');
      right.style.cssText = 'flex:2';
      left.innerHTML = '<p>Left column content...</p>';
      right.appendChild(content);
      wrapper.appendChild(left);
      wrapper.appendChild(right);
      range.insertNode(wrapper);
      dirty = true;
      return;
    }

    wrapper.appendChild(content);
    range.insertNode(wrapper);
  } else {
    // Apply to entire editor
    if (cols === 1) {
      editorEl.style.columnCount = '1';
      editorEl.style.columnGap = '';
      editorEl.style.columnRule = '';
    } else if (typeof cols === 'number') {
      editorEl.style.columnCount = String(cols);
      editorEl.style.columnGap = '24px';
      editorEl.style.columnRule = '1px solid var(--border-color)';
    }
  }
  dirty = true;
}

// ─── Mail Merge ─────────────────────────────────────────────
function showMailMergeDialog() {
  if (!editorEl) return;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:600px;max-height:85vh;overflow:auto">
    <h3 style="margin:0 0 4px">Mail Merge</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin:0 0 16px">
      Use <code>{{field_name}}</code> placeholders in your document. Upload CSV data to generate merged documents.
    </p>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Step 1: Data Source (CSV)</label>
      <input type="file" id="mm-file" accept=".csv,.tsv,.txt" style="font-size:12px">
      <div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">Or paste data below:</div>
      <textarea id="mm-data" rows="4" placeholder="name,email,company&#10;John,john@example.com,Acme Inc&#10;Jane,jane@example.com,Corp Ltd" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:4px;font-family:monospace;font-size:11px;background:var(--bg-primary);color:var(--text-primary);margin-top:4px;resize:vertical"></textarea>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Step 2: Available Fields</label>
      <div id="mm-fields" style="display:flex;flex-wrap:wrap;gap:4px;min-height:30px;padding:8px;border:1px solid var(--border-color);border-radius:4px;background:var(--hover-bg)">
        <span style="font-size:11px;color:var(--text-secondary)">Load data to see fields</span>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Step 3: Preview</label>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
        <button id="mm-prev-rec" class="toolbar-btn" style="padding:2px 8px">◀</button>
        <span id="mm-rec-num" style="font-size:12px">Record 1</span>
        <button id="mm-next-rec" class="toolbar-btn" style="padding:2px 8px">▶</button>
      </div>
      <div id="mm-preview" style="border:1px solid var(--border-color);border-radius:4px;padding:12px;min-height:100px;font-size:13px;max-height:200px;overflow:auto;background:var(--bg-primary)"></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="toolbar-btn" id="mm-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="mm-generate" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Generate All Documents</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  let records = [];
  let headers = [];
  let previewIdx = 0;

  function parseCSVData(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return;
    headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    records = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const rec = {};
      headers.forEach((h, j) => { rec[h] = vals[j] || ''; });
      records.push(rec);
    }
    updateFields();
    updatePreview();
  }

  function updateFields() {
    const fieldsEl = dlg.querySelector('#mm-fields');
    fieldsEl.innerHTML = headers.map(h =>
      `<button class="mm-field-btn" data-field="${h}" style="padding:2px 8px;font-size:11px;border:1px solid var(--accent-color);border-radius:4px;background:transparent;color:var(--accent-color);cursor:pointer" title="Click to insert {{${h}}} at cursor">{{${h}}}</button>`
    ).join('');
    fieldsEl.querySelectorAll('.mm-field-btn').forEach(btn => {
      btn.onclick = () => {
        editorEl.focus();
        document.execCommand('insertText', false, `{{${btn.dataset.field}}}`);
      };
    });
  }

  function mergeTemplate(template, record) {
    let result = template;
    for (const [key, val] of Object.entries(record)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }
    return result;
  }

  function updatePreview() {
    if (records.length === 0) return;
    previewIdx = Math.max(0, Math.min(previewIdx, records.length - 1));
    dlg.querySelector('#mm-rec-num').textContent = `Record ${previewIdx + 1} of ${records.length}`;
    const merged = mergeTemplate(editorEl.innerHTML, records[previewIdx]);
    dlg.querySelector('#mm-preview').innerHTML = merged;
  }

  // File upload
  dlg.querySelector('#mm-file').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      dlg.querySelector('#mm-data').value = ev.target.result;
      parseCSVData(ev.target.result);
    };
    reader.readAsText(file);
  };

  // Paste data
  dlg.querySelector('#mm-data').onblur = () => {
    const text = dlg.querySelector('#mm-data').value;
    if (text.trim()) parseCSVData(text);
  };

  dlg.querySelector('#mm-prev-rec').onclick = () => { previewIdx--; updatePreview(); };
  dlg.querySelector('#mm-next-rec').onclick = () => { previewIdx++; updatePreview(); };
  dlg.querySelector('#mm-cancel').onclick = () => dlg.remove();

  dlg.querySelector('#mm-generate').onclick = () => {
    if (records.length === 0) { alert('No data loaded.'); return; }
    // Generate merged documents in a new window
    const win = window.open('', '_blank');
    let html = `<!DOCTYPE html><html><head><title>Mail Merge Results</title>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 20px; }
      .merge-doc { border: 1px solid #ccc; padding: 24px 32px; margin-bottom: 24px; page-break-after: always; max-width: 700px; margin-left: auto; margin-right: auto; }
      .merge-doc:last-child { page-break-after: auto; }
      .merge-header { font-size: 11px; color: #999; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px dashed #ccc; }
      @media print { .merge-header { display: none; } }
    </style></head><body>
    <h2 style="text-align:center;margin-bottom:24px">Mail Merge — ${records.length} Documents</h2>`;

    records.forEach((rec, i) => {
      const merged = mergeTemplate(editorEl.innerHTML, rec);
      html += `<div class="merge-doc">
        <div class="merge-header">Document ${i + 1} — ${Object.values(rec)[0] || ''}</div>
        ${merged}
      </div>`;
    });

    html += '<script>setTimeout(()=>window.print(),500)<\/script></body></html>';
    win.document.write(html);
    win.document.close();
    dlg.remove();
  };
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

/* ==================== Comments (Enhanced with Threads & Panel) ==================== */

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
  const selectedText = selection.toString();
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
    context: selectedText.substring(0, 60),
    replies: [],
    el: wrapper,
  });

  // Click to view/edit/resolve/delete
  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    showCommentPopup(wrapper, commentId);
  });

  dirty = true;
  updateCommentsPanel();
}

function showCommentPopup(el, commentId) {
  document.querySelector('.doc-comment-popup')?.remove();

  const comment = comments.find(c => c.id === commentId);
  if (!comment) return;

  const rect = el.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'doc-comment-popup';
  popup.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 300)}px;width:280px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:12px;z-index:2000;font-size:13px;max-height:400px;overflow-y:auto`;

  let repliesHtml = '';
  if (comment.replies.length > 0) {
    repliesHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color)">';
    comment.replies.forEach(r => {
      repliesHtml += `<div style="margin-bottom:6px;padding:4px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:11px;color:var(--text-primary)">${r.author}</strong>
          <span style="font-size:9px;color:var(--text-tertiary)">${r.timestamp}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${r.text}</div>
      </div>`;
    });
    repliesHtml += '</div>';
  }

  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <strong style="font-size:12px;color:var(--text-primary)">${comment.author}</strong>
      <span style="font-size:10px;color:var(--text-tertiary)">${comment.timestamp}</span>
    </div>
    ${comment.resolved ? '<span style="font-size:10px;color:#22c55e;font-weight:600">[Resolved]</span>' : ''}
    <p style="margin:4px 0 8px;color:var(--text-primary);line-height:1.5">${comment.text}</p>
    ${repliesHtml}
    <div style="margin-top:8px;display:flex;gap:4px">
      <input type="text" class="cmt-reply-input" placeholder="Reply..." style="flex:1;padding:5px 8px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);outline:none">
      <button class="cmt-reply-btn" style="padding:5px 10px;font-size:11px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer">Reply</button>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="cmt-resolve" style="flex:1;padding:5px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:var(--text-primary)">${comment.resolved ? '↺ Unresolve' : '✓ Resolve'}</button>
      <button class="cmt-delete" style="flex:1;padding:5px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:#e74c3c">Delete</button>
    </div>
  `;

  document.body.appendChild(popup);

  // Reply
  const replyInput = popup.querySelector('.cmt-reply-input');
  const replyBtn = popup.querySelector('.cmt-reply-btn');
  const submitReply = () => {
    const replyText = replyInput.value.trim();
    if (!replyText) return;
    comment.replies.push({
      author: 'User',
      text: replyText,
      timestamp: new Date().toLocaleString()
    });
    replyInput.value = '';
    popup.remove();
    showCommentPopup(el, commentId); // Re-render
    updateCommentsPanel();
  };
  replyBtn.addEventListener('click', submitReply);
  replyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitReply(); });

  popup.querySelector('.cmt-resolve').addEventListener('click', () => {
    comment.resolved = !comment.resolved;
    if (comment.resolved) {
      el.style.background = 'rgba(34, 197, 94, 0.2)';
      el.style.borderBottom = '2px solid #22c55e';
      el.title = `[Resolved] ${comment.text}`;
    } else {
      el.style.background = 'rgba(255, 213, 79, 0.4)';
      el.style.borderBottom = '2px solid #f59e0b';
      el.title = `Comment: ${comment.text}`;
    }
    popup.remove();
    updateCommentsPanel();
  });

  popup.querySelector('.cmt-delete').addEventListener('click', () => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    comments = comments.filter(c => c.id !== commentId);
    popup.remove();
    dirty = true;
    updateCommentsPanel();
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popup.contains(e.target) && e.target !== el) {
        popup.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

/* Comments Panel */
let commentsPanelVisible = false;

function toggleCommentsPanel() {
  commentsPanelVisible = !commentsPanelVisible;
  const panel = document.getElementById('doc-comments-sidebar');
  if (panel) panel.classList.toggle('hidden', !commentsPanelVisible);
  if (commentsPanelVisible) updateCommentsPanel();
}

function updateCommentsPanel() {
  const list = document.getElementById('doc-comments-list');
  if (!list) return;

  if (comments.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No comments yet.<br>Select text and click "Add Comment".</div>';
    return;
  }

  const resolved = comments.filter(c => c.resolved).length;
  const open = comments.length - resolved;

  let html = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;padding:4px 6px;background:var(--hover-bg);border-radius:4px">${open} open, ${resolved} resolved</div>`;

  comments.forEach(c => {
    html += `
      <div class="doc-comment-item ${c.resolved ? 'resolved' : ''}" data-comment-id="${c.id}">
        <div class="doc-comment-item-header">
          <span class="doc-comment-item-author">${c.author}</span>
          <span class="doc-comment-item-time">${c.timestamp}</span>
        </div>
        ${c.context ? `<div class="doc-comment-item-context">"${c.context}"</div>` : ''}
        <div class="doc-comment-item-text">${c.text}</div>
        ${c.replies.length > 0 ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${c.replies.length} repl${c.replies.length === 1 ? 'y' : 'ies'}</div>` : ''}
      </div>
    `;
  });

  list.innerHTML = html;

  // Click to scroll to comment in document
  list.querySelectorAll('.doc-comment-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.commentId);
      const comment = comments.find(c => c.id === id);
      if (comment?.el) {
        comment.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        comment.el.style.outline = '2px solid var(--brand-color)';
        setTimeout(() => { if (comment.el) comment.el.style.outline = ''; }, 2000);
        showCommentPopup(comment.el, id);
      }
    });
  });
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

/* ==================== Track Changes (Enhanced) ==================== */

let trackChangesEnabled = false;
let trackChangesList = []; // { id, type: 'insert'|'delete', text, el, timestamp }
let trackChangeId = 0;

function toggleTrackChanges() {
  trackChangesEnabled = !trackChangesEnabled;
  const btn = document.getElementById('doc-track-changes');
  const panelBtn = document.getElementById('doc-track-panel');
  const acceptBtn = document.getElementById('doc-accept-all');
  const rejectBtn = document.getElementById('doc-reject-all');

  if (btn) {
    btn.style.background = trackChangesEnabled ? 'var(--brand-color)' : '';
    btn.style.color = trackChangesEnabled ? '#fff' : '';
    btn.title = trackChangesEnabled ? 'Track Changes: ON (click to disable)' : 'Track Changes: OFF';
  }

  // Show/hide track changes toolbar buttons
  [panelBtn, acceptBtn, rejectBtn].forEach(b => {
    if (b) b.style.display = trackChangesEnabled ? '' : 'none';
  });

  if (trackChangesEnabled && editorEl) {
    // Intercept typing via keydown to wrap insertions
    if (!editorEl._trackKeyHandler) {
      editorEl._trackKeyHandler = (e) => {
        if (!trackChangesEnabled) return;
        // Only handle printable characters + Enter, Backspace, Delete
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          handleTrackDelete(e.key === 'Backspace' ? 'back' : 'forward');
          return;
        }
      };
      editorEl.addEventListener('keydown', editorEl._trackKeyHandler);
    }

    // Intercept input to mark inserted text
    if (!editorEl._trackInputHandler) {
      editorEl._trackInputHandler = (e) => {
        if (!trackChangesEnabled) return;
        if (e.inputType === 'insertText' || e.inputType === 'insertParagraph') {
          wrapLastInsertionAsChange();
        }
      };
      editorEl.addEventListener('input', editorEl._trackInputHandler);
    }
  }
}

function wrapLastInsertionAsChange() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode;
  if (!node || !editorEl.contains(node)) return;

  // Check if already inside a track-insert span
  if (node.parentElement?.closest('.doc-track-insert')) return;

  // If the node is a text node and its parent is not already marked
  if (node.nodeType === 3) {
    const parent = node.parentElement;
    if (parent && !parent.classList?.contains('doc-track-insert')) {
      // Check if we can extend an adjacent track-insert span
      const prevSibling = node.previousSibling;
      if (prevSibling && prevSibling.nodeType === 1 && prevSibling.classList?.contains('doc-track-insert')) {
        // Move the text into the previous sibling
        prevSibling.textContent += node.textContent;
        const range = document.createRange();
        range.selectNodeContents(prevSibling);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        node.remove();
        return;
      }
    }
  }
}

function handleTrackDelete(direction) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  // If there's a selection, mark the entire selection as deleted
  if (!sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const text = sel.toString();
    if (!text) return;

    const delSpan = document.createElement('span');
    delSpan.className = 'doc-track-delete';
    delSpan.dataset.changeId = ++trackChangeId;
    delSpan.dataset.timestamp = new Date().toISOString();

    try {
      range.surroundContents(delSpan);
    } catch {
      const fragment = range.extractContents();
      delSpan.appendChild(fragment);
      range.insertNode(delSpan);
    }

    trackChangesList.push({
      id: trackChangeId,
      type: 'delete',
      text: text,
      el: delSpan,
      timestamp: new Date().toLocaleString()
    });

    // Set up click handler for individual accept/reject
    delSpan.addEventListener('click', (ev) => {
      ev.stopPropagation();
      showChangePopup(delSpan, trackChangeId);
    });

    sel.collapseToEnd();
    updateChangesPanel();
    dirty = true;
    return;
  }

  // Single character delete
  const range = sel.getRangeAt(0).cloneRange();
  if (direction === 'back') {
    range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
  } else {
    range.setEnd(range.endContainer, Math.min(range.endContainer.length || 0, range.endOffset + 1));
  }

  const text = range.toString();
  if (!text) return;

  // Check if already in a delete span
  const existingDel = range.startContainer.parentElement?.closest('.doc-track-delete');
  if (existingDel) {
    // Actually remove from the doc
    range.deleteContents();
    editorEl.normalize();
    dirty = true;
    return;
  }

  const delSpan = document.createElement('span');
  delSpan.className = 'doc-track-delete';
  delSpan.dataset.changeId = ++trackChangeId;
  delSpan.dataset.timestamp = new Date().toISOString();

  try {
    range.surroundContents(delSpan);
  } catch {
    const content = range.extractContents();
    delSpan.appendChild(content);
    range.insertNode(delSpan);
  }

  trackChangesList.push({
    id: trackChangeId,
    type: 'delete',
    text: text,
    el: delSpan,
    timestamp: new Date().toLocaleString()
  });

  delSpan.addEventListener('click', (ev) => {
    ev.stopPropagation();
    showChangePopup(delSpan, trackChangeId);
  });

  // Move cursor past the deleted span
  const afterRange = document.createRange();
  afterRange.setStartAfter(delSpan);
  afterRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(afterRange);

  updateChangesPanel();
  dirty = true;
}

function showChangePopup(el, changeId) {
  document.querySelector('.doc-change-popup')?.remove();

  const rect = el.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'doc-change-popup';
  popup.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 200)}px;width:180px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.15);padding:8px;z-index:2000;font-size:12px`;

  const type = el.classList.contains('doc-track-insert') ? 'Insertion' : 'Deletion';
  popup.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;color:var(--text-primary)">${type}</div>
    <div style="color:var(--text-secondary);margin-bottom:8px;word-break:break-word">"${el.textContent.substring(0, 50)}${el.textContent.length > 50 ? '...' : ''}"</div>
    <div style="display:flex;gap:4px">
      <button class="ch-accept" style="flex:1;padding:5px;font-size:11px;border:1px solid #22c55e;border-radius:4px;background:var(--bg-primary);cursor:pointer;color:#16a34a">Accept</button>
      <button class="ch-reject" style="flex:1;padding:5px;font-size:11px;border:1px solid #ef4444;border-radius:4px;background:var(--bg-primary);cursor:pointer;color:#ef4444">Reject</button>
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector('.ch-accept').addEventListener('click', () => {
    acceptChange(el, changeId);
    popup.remove();
  });
  popup.querySelector('.ch-reject').addEventListener('click', () => {
    rejectChange(el, changeId);
    popup.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

function acceptChange(el, changeId) {
  if (el.classList.contains('doc-track-insert')) {
    // Accept insertion: keep the text, remove tracking markup
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    parent.normalize();
  } else if (el.classList.contains('doc-track-delete')) {
    // Accept deletion: remove the text entirely
    el.remove();
  }
  trackChangesList = trackChangesList.filter(c => c.id !== changeId);
  updateChangesPanel();
  editorEl?.normalize();
  dirty = true;
}

function rejectChange(el, changeId) {
  if (el.classList.contains('doc-track-insert')) {
    // Reject insertion: remove the inserted text
    el.remove();
  } else if (el.classList.contains('doc-track-delete')) {
    // Reject deletion: keep the text, remove tracking markup
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    parent.normalize();
  }
  trackChangesList = trackChangesList.filter(c => c.id !== changeId);
  updateChangesPanel();
  editorEl?.normalize();
  dirty = true;
}

function acceptAllChanges() {
  if (trackChangesList.length === 0) return;
  if (!confirm(`Accept all ${trackChangesList.length} changes?`)) return;
  // Process in reverse to avoid DOM mutation issues
  [...trackChangesList].reverse().forEach(c => {
    if (c.el && c.el.parentNode) acceptChange(c.el, c.id);
  });
  trackChangesList = [];
  updateChangesPanel();
}

function rejectAllChanges() {
  if (trackChangesList.length === 0) return;
  if (!confirm(`Reject all ${trackChangesList.length} changes?`)) return;
  [...trackChangesList].reverse().forEach(c => {
    if (c.el && c.el.parentNode) rejectChange(c.el, c.id);
  });
  trackChangesList = [];
  updateChangesPanel();
}

/* Changes Panel */
let changesPanelVisible = false;

function toggleChangesPanel() {
  changesPanelVisible = !changesPanelVisible;
  const panel = document.getElementById('doc-changes-panel');
  if (panel) panel.classList.toggle('hidden', !changesPanelVisible);
  if (changesPanelVisible) updateChangesPanel();
}

function updateChangesPanel() {
  const list = document.getElementById('doc-changes-list');
  if (!list) return;

  // Also scan DOM for any tracked changes not in our list
  const insertEls = editorEl?.querySelectorAll('.doc-track-insert') || [];
  const deleteEls = editorEl?.querySelectorAll('.doc-track-delete') || [];

  if (insertEls.length === 0 && deleteEls.length === 0 && trackChangesList.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No changes tracked yet.<br>Enable Track Changes and start editing.</div>';
    return;
  }

  let html = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;padding:4px 6px;background:var(--hover-bg);border-radius:4px">${insertEls.length} insertions, ${deleteEls.length} deletions</div>`;

  trackChangesList.forEach(c => {
    const icon = c.type === 'insert' ? '<span style="color:#22c55e;font-weight:700">+</span>' : '<span style="color:#ef4444;font-weight:700">-</span>';
    html += `
      <div class="doc-change-item" data-change-id="${c.id}">
        <div class="doc-change-item-meta">${icon} ${c.type === 'insert' ? 'Inserted' : 'Deleted'} &middot; ${c.timestamp}</div>
        <div class="doc-change-item-text">${c.text.substring(0, 80)}${c.text.length > 80 ? '...' : ''}</div>
        <div class="doc-change-item-actions">
          <button class="accept-btn" data-id="${c.id}">Accept</button>
          <button class="reject-btn" data-id="${c.id}">Reject</button>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;

  // Wire up buttons
  list.querySelectorAll('.accept-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const change = trackChangesList.find(c => c.id === id);
      if (change?.el) acceptChange(change.el, id);
    });
  });
  list.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const change = trackChangesList.find(c => c.id === id);
      if (change?.el) rejectChange(change.el, id);
    });
  });

  // Click on item to scroll to change
  list.querySelectorAll('.doc-change-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.changeId);
      const change = trackChangesList.find(c => c.id === id);
      if (change?.el) {
        change.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        change.el.style.outline = '2px solid var(--brand-color)';
        setTimeout(() => { if (change.el) change.el.style.outline = ''; }, 2000);
      }
    });
  });
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

/* ==================== Image Resize Handles ==================== */

let activeResizeImg = null;

function removeImageResizeHandles() {
  document.querySelectorAll('.doc-img-resize-wrap').forEach(wrap => {
    const img = wrap.querySelector('img');
    if (img) wrap.parentNode.insertBefore(img, wrap);
    wrap.remove();
  });
  activeResizeImg = null;
}

function showImageResizeHandles(img) {
  removeImageResizeHandles();
  activeResizeImg = img;

  const wrapper = document.createElement('span');
  wrapper.className = 'doc-img-resize-wrap';
  wrapper.contentEditable = 'false';
  wrapper.style.cssText = 'display:inline-block;position:relative;line-height:0;border:2px solid #3b82f6;';
  img.parentNode.insertBefore(wrapper, img);
  wrapper.appendChild(img);

  // 8 resize handles: corners + edges
  const handles = [
    { cursor: 'nw-resize', pos: 'top:0;left:0;transform:translate(-50%,-50%)' },
    { cursor: 'n-resize', pos: 'top:0;left:50%;transform:translate(-50%,-50%)' },
    { cursor: 'ne-resize', pos: 'top:0;right:0;transform:translate(50%,-50%)' },
    { cursor: 'e-resize', pos: 'top:50%;right:0;transform:translate(50%,-50%)' },
    { cursor: 'se-resize', pos: 'bottom:0;right:0;transform:translate(50%,50%)' },
    { cursor: 's-resize', pos: 'bottom:0;left:50%;transform:translate(-50%,50%)' },
    { cursor: 'sw-resize', pos: 'bottom:0;left:0;transform:translate(-50%,50%)' },
    { cursor: 'w-resize', pos: 'top:50%;left:0;transform:translate(-50%,-50%)' },
  ];

  handles.forEach(h => {
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;${h.pos};width:8px;height:8px;background:#3b82f6;border:1px solid #fff;border-radius:50%;cursor:${h.cursor};z-index:2;`;
    dot.addEventListener('mousedown', (e) => startImageResize(e, img, h.cursor));
    wrapper.appendChild(dot);
  });

  // Size label
  const label = document.createElement('div');
  label.className = 'doc-img-size-label';
  label.style.cssText = 'position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);background:#333;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;white-space:nowrap;pointer-events:none;';
  label.textContent = `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`;
  wrapper.appendChild(label);
}

function startImageResize(e, img, cursor) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX, startY = e.clientY;
  const startW = img.offsetWidth, startH = img.offsetHeight;
  const ratio = startW / startH;
  const label = img.parentNode?.querySelector('.doc-img-size-label');

  const onMove = (ev) => {
    let dx = ev.clientX - startX;
    let dy = ev.clientY - startY;
    let newW = startW, newH = startH;

    if (cursor.includes('e')) newW = startW + dx;
    if (cursor.includes('w')) newW = startW - dx;
    if (cursor.includes('s')) newH = startH + dy;
    if (cursor.includes('n')) newH = startH - dy;

    // Maintain aspect ratio for corner handles
    if (cursor.length > 2) {
      newH = newW / ratio;
    }

    newW = Math.max(20, newW);
    newH = Math.max(20, newH);
    img.style.width = newW + 'px';
    img.style.height = newH + 'px';
    if (label) label.textContent = `${Math.round(newW)} × ${Math.round(newH)}`;
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    dirty = true;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ==================== Paragraph Spacing ==================== */

function showParagraphSpacingDialog() {
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const block = node?.nodeType === 3 ? node.parentElement?.closest('p, h1, h2, h3, h4, h5, h6, li, div') : node?.closest('p, h1, h2, h3, h4, h5, h6, li, div');

  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:10px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:10000;width:320px;font-size:14px;color:#333;';
  dlg.innerHTML = `
    <h3 style="margin:0 0 16px">Paragraph Spacing</h3>
    <div style="display:flex;gap:16px;margin-bottom:16px">
      <div style="flex:1">
        <label style="font-weight:600;font-size:12px">Before (px):</label>
        <input type="number" id="ps-before" value="${parseInt(block?.style.marginTop) || 0}" min="0" max="100" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px">
      </div>
      <div style="flex:1">
        <label style="font-weight:600;font-size:12px">After (px):</label>
        <input type="number" id="ps-after" value="${parseInt(block?.style.marginBottom) || 0}" min="0" max="100" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px">
      </div>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-weight:600;font-size:12px">Quick Presets:</label>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="ps-preset" data-before="0" data-after="0" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:11px">Compact</button>
        <button class="ps-preset" data-before="6" data-after="6" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:11px">Normal</button>
        <button class="ps-preset" data-before="12" data-after="12" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:11px">Open</button>
        <button class="ps-preset" data-before="24" data-after="24" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:11px">Double</button>
      </div>
    </div>
    <div style="text-align:right">
      <button id="ps-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;border-radius:4px;cursor:pointer">Cancel</button>
      <button id="ps-apply" style="padding:6px 16px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer">Apply</button>
    </div>
  `;
  document.body.appendChild(dlg);

  dlg.querySelectorAll('.ps-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      dlg.querySelector('#ps-before').value = btn.dataset.before;
      dlg.querySelector('#ps-after').value = btn.dataset.after;
    });
  });

  dlg.querySelector('#ps-cancel').addEventListener('click', () => dlg.remove());
  dlg.querySelector('#ps-apply').addEventListener('click', () => {
    const before = dlg.querySelector('#ps-before').value + 'px';
    const after = dlg.querySelector('#ps-after').value + 'px';
    if (block) {
      block.style.marginTop = before;
      block.style.marginBottom = after;
    }
    dlg.remove();
    editorEl?.focus();
    dirty = true;
  });
}

/* ==================== Document Compare ==================== */

function showDocCompare() {
  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  const inputStyle = 'width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box;font-size:13px';

  dlg.innerHTML = `<div class="modal-content" style="width:90vw;max-width:900px;max-height:90vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">Document Compare</h3>
      <button id="doc-compare-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-secondary)">&times;</button>
    </div>
    <div style="margin-bottom:12px">
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Paste or upload the comparison text below. The current document will be compared against it.</p>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="toolbar-btn" id="doc-compare-paste" style="padding:4px 12px;font-size:12px">Paste Text</button>
        <button class="toolbar-btn" id="doc-compare-file" style="padding:4px 12px;font-size:12px">Load File</button>
        <input type="file" id="doc-compare-file-input" accept=".txt,.html,.htm,.md" style="display:none">
      </div>
      <textarea id="doc-compare-input" style="${inputStyle};height:120px;resize:vertical" placeholder="Paste comparison text here..."></textarea>
    </div>
    <button class="toolbar-btn" id="doc-compare-run" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px;margin-bottom:12px">Compare</button>
    <div id="doc-compare-result" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:8px;font-size:12px">
        <span style="background:#d4edda;padding:2px 8px;border-radius:4px">Added</span>
        <span style="background:#f8d7da;padding:2px 8px;border-radius:4px;text-decoration:line-through">Removed</span>
        <span style="color:var(--text-secondary)">| <span id="doc-compare-stats"></span></span>
      </div>
      <div id="doc-compare-output" style="border:1px solid var(--border-color);border-radius:8px;padding:16px;max-height:400px;overflow:auto;font-size:13px;line-height:1.8;background:var(--bg-primary)"></div>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  dlg.querySelector('#doc-compare-close').onclick = () => dlg.remove();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  const fileInput = dlg.querySelector('#doc-compare-file-input');
  dlg.querySelector('#doc-compare-file').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (file) {
      const text = await file.text();
      dlg.querySelector('#doc-compare-input').value = text;
    }
  };

  dlg.querySelector('#doc-compare-run').onclick = () => {
    const compareText = dlg.querySelector('#doc-compare-input').value;
    if (!compareText.trim()) return;

    // Extract plain text from current document
    const currentText = editorEl?.innerText || '';
    const diff = computeWordDiff(currentText, compareText);

    const resultEl = dlg.querySelector('#doc-compare-result');
    const outputEl = dlg.querySelector('#doc-compare-output');
    const statsEl = dlg.querySelector('#doc-compare-stats');
    resultEl.style.display = 'block';

    let added = 0, removed = 0;
    let html = '';
    for (const part of diff) {
      if (part.type === 'add') {
        html += `<span style="background:#d4edda;padding:1px 2px">${escapeHtml(part.text)}</span>`;
        added++;
      } else if (part.type === 'remove') {
        html += `<span style="background:#f8d7da;padding:1px 2px;text-decoration:line-through">${escapeHtml(part.text)}</span>`;
        removed++;
      } else {
        html += escapeHtml(part.text);
      }
    }
    outputEl.innerHTML = html;
    statsEl.textContent = `${added} additions, ${removed} deletions`;
  };
}

function escapeHtml(str) {
  return _escapeHtmlShared(str);
}

function computeWordDiff(oldText, newText) {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const result = [];

  // Simple LCS-based diff
  const m = oldWords.length, n = newWords.length;
  // For large texts, use a simplified approach
  if (m * n > 1000000) {
    return simpleDiff(oldWords, newWords);
  }

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  let i = m, j = n;
  const parts = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      parts.unshift({ type: 'same', text: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ type: 'add', text: newWords[j - 1] });
      j--;
    } else {
      parts.unshift({ type: 'remove', text: oldWords[i - 1] });
      i--;
    }
  }

  // Merge consecutive same-type parts
  for (const part of parts) {
    if (result.length > 0 && result[result.length - 1].type === part.type) {
      result[result.length - 1].text += part.text;
    } else {
      result.push({ ...part });
    }
  }
  return result;
}

function simpleDiff(oldWords, newWords) {
  // Line-based simplified diff for large documents
  const result = [];
  const oldSet = new Set(oldWords.filter(w => w.trim()));
  const newSet = new Set(newWords.filter(w => w.trim()));

  for (const w of oldWords) {
    if (!w.trim()) { result.push({ type: 'same', text: w }); continue; }
    if (newSet.has(w)) result.push({ type: 'same', text: w });
    else result.push({ type: 'remove', text: w });
  }
  for (const w of newWords) {
    if (!w.trim()) continue;
    if (!oldSet.has(w)) result.push({ type: 'add', text: w });
  }
  return result;
}

/* ── Insert Date/Time Picker ── */
function showDateTimePicker() {
  const existing = document.querySelector('.datetime-picker-dialog');
  if (existing) { existing.remove(); return; }

  const now = new Date();
  const formats = [
    { label: 'Full Date', fn: () => now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Short Date', fn: () => now.toLocaleDateString('en-US') },
    { label: 'ISO Date', fn: () => now.toISOString().slice(0, 10) },
    { label: 'Date & Time', fn: () => now.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    { label: 'Time Only', fn: () => now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
    { label: 'ISO DateTime', fn: () => now.toISOString().slice(0, 16).replace('T', ' ') },
    { label: 'Korean Date', fn: () => now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Korean DateTime', fn: () => now.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
  ];

  const dlg = document.createElement('div');
  dlg.className = 'datetime-picker-dialog';
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:20px;z-index:10010;min-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3)';

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h3 style="margin:0;font-size:15px;color:var(--text-primary)">Insert Date / Time</h3>
    <button id="dt-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-secondary)">&times;</button>
  </div>
  <div style="display:flex;flex-direction:column;gap:6px">`;

  formats.forEach((f, i) => {
    const val = f.fn();
    html += `<button class="dt-fmt-btn" data-idx="${i}" style="text-align:left;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;font-size:13px;color:var(--text-primary);transition:background 0.15s">
      <span style="color:var(--text-secondary);font-size:11px">${f.label}</span><br>
      <span style="font-weight:500">${val}</span>
    </button>`;
  });

  html += `</div>
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
    <label style="font-size:12px;color:var(--text-secondary)">Custom format</label>
    <div style="display:flex;gap:8px;margin-top:4px">
      <input id="dt-custom" type="text" value="${now.toISOString().slice(0, 10)}" style="flex:1;padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
      <button id="dt-insert-custom" class="toolbar-btn" style="padding:6px 14px;background:var(--accent-color);color:white;border-radius:6px;font-size:12px">Insert</button>
    </div>
  </div>`;

  dlg.innerHTML = html;
  document.body.appendChild(dlg);

  const editorEl = document.getElementById('doc-editor');

  dlg.querySelector('#dt-close').onclick = () => dlg.remove();
  dlg.querySelectorAll('.dt-fmt-btn').forEach(btn => {
    btn.onmouseenter = () => btn.style.background = 'var(--accent-color-light, rgba(66,133,244,0.1))';
    btn.onmouseleave = () => btn.style.background = 'var(--bg-primary)';
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      insertTextAtCursor(formats[idx].fn());
      dlg.remove();
    };
  });
  dlg.querySelector('#dt-insert-custom').onclick = () => {
    const val = dlg.querySelector('#dt-custom').value;
    if (val) { insertTextAtCursor(val); dlg.remove(); }
  };

  function insertTextAtCursor(text) {
    editorEl.focus();
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      document.execCommand('insertText', false, text);
    }
  }
}

/* ── Focus Mode (Zen) ── */
let focusModeActive = false;
let focusModeOverlay = null;

function toggleFocusMode() {
  const editorEl = document.getElementById('doc-editor');
  if (!editorEl) return;

  focusModeActive = !focusModeActive;
  const btn = document.getElementById('doc-focus-mode');

  if (focusModeActive) {
    // Create overlay
    focusModeOverlay = document.createElement('div');
    focusModeOverlay.className = 'doc-focus-overlay';
    focusModeOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg-primary);z-index:9999;display:flex;justify-content:center;overflow-y:auto';

    const container = document.createElement('div');
    container.style.cssText = 'width:700px;max-width:90vw;padding:80px 40px;min-height:100vh';

    // Clone editor content
    const editArea = document.createElement('div');
    editArea.contentEditable = 'true';
    editArea.id = 'doc-focus-editor';
    editArea.style.cssText = 'font-size:18px;line-height:1.8;color:var(--text-primary);outline:none;font-family:Georgia,serif;letter-spacing:0.01em';
    editArea.innerHTML = editorEl.innerHTML;
    container.appendChild(editArea);

    // ESC to exit hint
    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:white;padding:8px 20px;border-radius:20px;font-size:12px;opacity:0.6;z-index:10000';
    hint.textContent = t('ui.pressEscFocus');
    focusModeOverlay.appendChild(hint);

    // Word count in corner
    const wc = document.createElement('div');
    wc.style.cssText = 'position:fixed;top:20px;right:30px;font-size:12px;color:var(--text-tertiary);z-index:10000';
    focusModeOverlay.appendChild(wc);

    const updateWC = () => {
      const text = editArea.innerText || '';
      const words = text.trim().split(/\s+/).filter(w => w).length;
      wc.textContent = `${words} words`;
    };
    editArea.addEventListener('input', updateWC);
    updateWC();

    focusModeOverlay.appendChild(container);
    document.body.appendChild(focusModeOverlay);
    editArea.focus();

    // Fade out hint after 3s
    setTimeout(() => { hint.style.transition = 'opacity 1s'; hint.style.opacity = '0'; }, 3000);

    // ESC handler
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        // Sync content back
        editorEl.innerHTML = editArea.innerHTML;
        toggleFocusMode();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    if (btn) btn.style.background = 'var(--accent-color)';
  } else {
    if (focusModeOverlay) {
      // Sync content from focus editor back
      const focusEditor = focusModeOverlay.querySelector('#doc-focus-editor');
      if (focusEditor) {
        editorEl.innerHTML = focusEditor.innerHTML;
      }
      focusModeOverlay.remove();
      focusModeOverlay = null;
    }
    if (btn) btn.style.background = '';
  }
}

/* ── Reading Mode ── */
let readingModeActive = false;
let readingModeOverlay = null;

function toggleReadingMode() {
  const editorEl = document.getElementById('doc-editor');
  if (!editorEl) return;

  readingModeActive = !readingModeActive;
  const btn = document.getElementById('doc-reading-mode');

  if (readingModeActive) {
    readingModeOverlay = document.createElement('div');
    readingModeOverlay.className = 'doc-reading-overlay';
    readingModeOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg-primary);z-index:9999;display:flex;overflow-y:auto';

    // TOC sidebar
    const tocPanel = document.createElement('div');
    tocPanel.className = 'reading-toc-panel';
    tocPanel.style.cssText = 'width:260px;min-width:260px;background:var(--bg-secondary);border-right:1px solid var(--border-color);padding:60px 16px 24px;overflow-y:auto;position:sticky;top:0;height:100vh;flex-shrink:0;display:none';

    const tocHeader = document.createElement('div');
    tocHeader.style.cssText = 'font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:12px;padding:0 4px';
    tocHeader.textContent = 'Table of Contents';
    tocPanel.appendChild(tocHeader);

    const tocList = document.createElement('div');
    tocList.className = 'reading-toc-list';
    tocList.style.cssText = 'font-size:13px;line-height:1.6';
    tocPanel.appendChild(tocList);
    readingModeOverlay.appendChild(tocPanel);

    // Main content area (centered)
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = 'flex:1;display:flex;justify-content:center;overflow-y:auto';

    const container = document.createElement('div');
    container.style.cssText = 'width:680px;max-width:90vw;padding:60px 40px;min-height:100vh';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'position:fixed;top:0;left:0;right:0;display:flex;justify-content:center;gap:8px;padding:10px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);z-index:10000';
    toolbar.innerHTML = `
      <button id="read-toc-toggle" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px" title="Toggle Table of Contents">TOC</button>
      <button id="read-font-up" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">A+</button>
      <button id="read-font-down" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">A-</button>
      <button id="read-serif-toggle" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">Serif</button>
      <button id="read-sepia" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">Sepia</button>
      <button id="read-close" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">Close</button>
    `;
    readingModeOverlay.appendChild(toolbar);

    // Content (read-only)
    const content = document.createElement('div');
    content.className = 'reading-mode-content';
    content.style.cssText = 'font-size:18px;line-height:2;color:var(--text-primary);font-family:Georgia,serif;margin-top:60px';
    content.innerHTML = editorEl.innerHTML;

    // Make images responsive
    content.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.margin = '16px 0';
    });

    // Style headings
    content.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h, idx) => {
      if (!h.id) h.id = `reading-heading-${idx}`;
      h.style.marginTop = '1.5em';
      h.style.marginBottom = '0.5em';
    });

    // Style paragraphs
    content.querySelectorAll('p').forEach((p) => {
      p.style.marginBottom = '1em';
      p.style.textAlign = 'justify';
    });

    // Style blockquotes
    content.querySelectorAll('blockquote').forEach((bq) => {
      bq.style.cssText = 'border-left:3px solid var(--accent-color);padding:8px 20px;margin:16px 0;font-style:italic;opacity:0.85;background:rgba(0,0,0,0.02);border-radius:0 6px 6px 0';
    });

    container.appendChild(content);

    // Reading progress bar
    const progressBar = document.createElement('div');
    progressBar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:var(--accent-color);z-index:10001;transition:width 0.15s';
    readingModeOverlay.appendChild(progressBar);

    contentWrapper.appendChild(container);
    readingModeOverlay.appendChild(contentWrapper);
    document.body.appendChild(readingModeOverlay);

    // Build TOC from headings in content
    let tocVisible = false;
    const buildTOC = () => {
      const headings = content.querySelectorAll('h1, h2, h3, h4, h5, h6');
      tocList.innerHTML = '';
      if (headings.length === 0) {
        tocList.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 4px">No headings found in document.</div>';
        return;
      }

      headings.forEach((h, idx) => {
        const level = parseInt(h.tagName[1]);
        const item = document.createElement('div');
        item.className = 'reading-toc-item';
        item.dataset.idx = idx;
        item.style.cssText = `padding:4px ${4 + (level - 1) * 16}px;cursor:pointer;border-radius:4px;color:var(--text-primary);transition:background 0.15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:${level <= 2 ? '13px' : '12px'};font-weight:${level <= 2 ? '600' : '400'};opacity:${level <= 2 ? '1' : '0.8'}`;
        item.textContent = h.textContent || 'Untitled';
        item.title = h.textContent || 'Untitled';

        item.addEventListener('click', () => {
          h.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Highlight
          tocList.querySelectorAll('.reading-toc-item').forEach((el) => { el.style.background = ''; el.style.color = 'var(--text-primary)'; });
          item.style.background = 'var(--accent-color)';
          item.style.color = '#fff';
        });
        item.addEventListener('mouseenter', () => { if (item.style.background !== 'var(--accent-color)') item.style.background = 'var(--hover-bg)'; });
        item.addEventListener('mouseleave', () => { if (item.style.color !== '#fff') item.style.background = ''; });
        tocList.appendChild(item);
      });
    };
    buildTOC();

    // Scroll listener to update progress bar and highlight current heading in TOC
    const scrollHandler = () => {
      const scrollTop = contentWrapper.scrollTop;
      const scrollHeight = contentWrapper.scrollHeight - contentWrapper.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      progressBar.style.width = pct + '%';

      // Highlight current heading in TOC
      if (tocVisible) {
        const headings = content.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let activeIdx = 0;
        headings.forEach((h, idx) => {
          const rect = h.getBoundingClientRect();
          if (rect.top < 150) activeIdx = idx;
        });
        tocList.querySelectorAll('.reading-toc-item').forEach((el, idx) => {
          if (idx === activeIdx) {
            el.style.background = 'var(--accent-color)';
            el.style.color = '#fff';
            el.scrollIntoView({ block: 'nearest' });
          } else {
            el.style.background = '';
            el.style.color = 'var(--text-primary)';
          }
        });
      }
    };
    contentWrapper.addEventListener('scroll', scrollHandler);

    let fontSize = 18;
    let isSerif = true;
    let isSepia = false;

    toolbar.querySelector('#read-toc-toggle').addEventListener('click', () => {
      tocVisible = !tocVisible;
      tocPanel.style.display = tocVisible ? '' : 'none';
      toolbar.querySelector('#read-toc-toggle').style.background = tocVisible ? 'var(--accent-color)' : 'var(--bg-primary)';
      toolbar.querySelector('#read-toc-toggle').style.color = tocVisible ? '#fff' : 'var(--text-primary)';
      if (tocVisible) scrollHandler(); // Update highlighting
    });
    toolbar.querySelector('#read-font-up').addEventListener('click', () => {
      fontSize = Math.min(fontSize + 2, 32);
      content.style.fontSize = fontSize + 'px';
    });
    toolbar.querySelector('#read-font-down').addEventListener('click', () => {
      fontSize = Math.max(fontSize - 2, 12);
      content.style.fontSize = fontSize + 'px';
    });
    toolbar.querySelector('#read-serif-toggle').addEventListener('click', () => {
      isSerif = !isSerif;
      content.style.fontFamily = isSerif ? 'Georgia, serif' : '-apple-system, sans-serif';
    });
    toolbar.querySelector('#read-sepia').addEventListener('click', () => {
      isSepia = !isSepia;
      readingModeOverlay.style.background = isSepia ? '#f5f0e8' : 'var(--bg-primary)';
      tocPanel.style.background = isSepia ? '#ede5d5' : 'var(--bg-secondary)';
      content.style.color = isSepia ? '#3e2c1c' : 'var(--text-primary)';
    });
    toolbar.querySelector('#read-close').addEventListener('click', () => toggleReadingMode());

    // ESC + Ctrl+Shift+R handler
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        toggleReadingMode();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);

    if (btn) btn.style.background = 'var(--accent-color)';
  } else {
    if (readingModeOverlay) {
      readingModeOverlay.remove();
      readingModeOverlay = null;
    }
    if (btn) btn.style.background = '';
  }
}

// ─── Feature 1: Multi-Column Layout ─────────────────────────
function showMultiColumnPicker() {
  document.querySelector('.doc-multicol-picker')?.remove();
  const btn = document.getElementById('doc-multi-column');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.className = 'doc-multicol-picker';
  picker.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.18);padding:12px;z-index:2000;display:flex;gap:10px`;

  [1, 2, 3].forEach(n => {
    const opt = document.createElement('button');
    opt.style.cssText = 'padding:12px 16px;border:2px solid var(--border-color);border-radius:8px;background:var(--bg-primary);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--text-primary);transition:border-color 0.15s,background 0.15s';
    const colVisual = Array(n).fill('<div style="width:18px;height:32px;border:1px solid var(--text-secondary);border-radius:2px;background:var(--sidebar-bg)"></div>').join('');
    opt.innerHTML = `<div style="display:flex;gap:3px">${colVisual}</div><span style="font-size:11px;font-weight:600">${n} Col${n > 1 ? 's' : ''}</span>`;
    opt.addEventListener('mouseenter', () => { opt.style.borderColor = 'var(--brand-color)'; opt.style.background = 'var(--hover-bg)'; });
    opt.addEventListener('mouseleave', () => { opt.style.borderColor = 'var(--border-color)'; opt.style.background = 'var(--bg-primary)'; });
    opt.addEventListener('click', () => {
      if (!editorEl) return;
      if (n === 1) {
        editorEl.style.columnCount = '';
        editorEl.style.columnGap = '';
        editorEl.style.columnRule = '';
      } else {
        editorEl.style.columnCount = n;
        editorEl.style.columnGap = '24px';
        editorEl.style.columnRule = '1px solid var(--border-color)';
      }
      picker.remove();
      dirty = true;
    });
    picker.appendChild(opt);
  });

  document.body.appendChild(picker);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

// ─── Feature 2: Paragraph Drag-Reorder ──────────────────────
let dragReorderEnabled = false;
let dragSrcEl = null;

function toggleParagraphDragReorder() {
  dragReorderEnabled = !dragReorderEnabled;
  const btn = document.getElementById('doc-drag-reorder');
  if (btn) {
    btn.style.background = dragReorderEnabled ? 'var(--accent-color)' : '';
    btn.style.color = dragReorderEnabled ? '#fff' : '';
  }

  if (!editorEl) return;

  if (dragReorderEnabled) {
    applyDragHandles();
    editorEl.addEventListener('input', applyDragHandles);
  } else {
    removeDragHandles();
    editorEl.removeEventListener('input', applyDragHandles);
  }
}

function applyDragHandles() {
  if (!editorEl || !dragReorderEnabled) return;
  removeDragHandles();

  const blocks = editorEl.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > blockquote, :scope > table, :scope > div:not(.doc-toc):not(.doc-footnotes):not(.doc-endnotes):not(.doc-references)');

  blocks.forEach(block => {
    block.setAttribute('draggable', 'true');
    block.classList.add('doc-draggable-block');

    block.addEventListener('dragstart', handleDragStart);
    block.addEventListener('dragover', handleDragOver);
    block.addEventListener('dragenter', handleDragEnter);
    block.addEventListener('dragleave', handleDragLeave);
    block.addEventListener('drop', handleDrop);
    block.addEventListener('dragend', handleDragEnd);
  });
}

function removeDragHandles() {
  if (!editorEl) return;
  const blocks = editorEl.querySelectorAll('.doc-draggable-block');
  blocks.forEach(block => {
    block.removeAttribute('draggable');
    block.classList.remove('doc-draggable-block', 'doc-drag-over');
    block.removeEventListener('dragstart', handleDragStart);
    block.removeEventListener('dragover', handleDragOver);
    block.removeEventListener('dragenter', handleDragEnter);
    block.removeEventListener('dragleave', handleDragLeave);
    block.removeEventListener('drop', handleDrop);
    block.removeEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  dragSrcEl = this;
  this.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter() {
  this.classList.add('doc-drag-over');
}

function handleDragLeave() {
  this.classList.remove('doc-drag-over');
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  if (dragSrcEl !== this) {
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      this.parentNode.insertBefore(dragSrcEl, this);
    } else {
      this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
    }
    dirty = true;
  }
  this.classList.remove('doc-drag-over');
  return false;
}

function handleDragEnd() {
  this.style.opacity = '1';
  const blocks = editorEl?.querySelectorAll('.doc-draggable-block') || [];
  blocks.forEach(b => b.classList.remove('doc-drag-over'));
}

// ─── Feature 3: Smart Table Operations ──────────────────────
function showSmartTableOps() {
  if (!editorEl) return;

  const tables = editorEl.querySelectorAll('table');
  if (tables.length === 0) {
    alert('No tables found in the document. Insert a table first.');
    return;
  }

  const sel = window.getSelection();
  let targetTable = null;
  if (sel && sel.rangeCount > 0) {
    const node = sel.anchorNode;
    targetTable = node?.closest?.('table') || node?.parentElement?.closest?.('table');
  }
  if (!targetTable) targetTable = tables[tables.length - 1];

  document.querySelector('.doc-tableops-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-tableops-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:440px">
      <div class="ai-setup-header">
        <h3>Smart Table Operations</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Target Table (${tables.length} table${tables.length > 1 ? 's' : ''} found)</label>
          <select id="tblops-target" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            ${Array.from(tables).map((t, i) => {
              const firstRow = t.querySelector('tr');
              const preview = firstRow ? Array.from(firstRow.cells).slice(0, 3).map(c => c.textContent.trim().substring(0, 15)).join(', ') : 'Empty';
              return `<option value="${i}" ${t === targetTable ? 'selected' : ''}>Table ${i + 1}: ${preview}...</option>`;
            }).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color);text-transform:uppercase;letter-spacing:0.5px;grid-column:span 2;margin-bottom:4px">Sort</div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary)">Column</label>
            <select id="tblops-sort-col" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            </select>
          </div>
          <div style="display:flex;gap:4px;align-items:flex-end">
            <button id="tblops-sort-asc" class="ai-pull-btn" style="flex:1;font-size:11px">Sort A-Z</button>
            <button id="tblops-sort-desc" class="ai-pull-btn" style="flex:1;font-size:11px">Sort Z-A</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color);text-transform:uppercase;letter-spacing:0.5px;grid-column:span 2;margin-bottom:4px">Filter Rows</div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary)">Column</label>
            <select id="tblops-filter-col" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary)">Contains</label>
            <div style="display:flex;gap:4px">
              <input id="tblops-filter-val" type="text" placeholder="keyword" style="flex:1;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
              <button id="tblops-filter-apply" class="ai-pull-btn" style="font-size:11px">Filter</button>
              <button id="tblops-filter-reset" class="ai-pull-btn" style="font-size:11px">Reset</button>
            </div>
          </div>
        </div>
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Aggregate (Numeric Column)</div>
          <div style="display:flex;gap:6px;align-items:center">
            <select id="tblops-agg-col" style="flex:1;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            </select>
            <button id="tblops-sum" class="ai-pull-btn" style="font-size:11px">Sum</button>
            <button id="tblops-avg" class="ai-pull-btn" style="font-size:11px">Average</button>
            <button id="tblops-min" class="ai-pull-btn" style="font-size:11px">Min</button>
            <button id="tblops-max" class="ai-pull-btn" style="font-size:11px">Max</button>
          </div>
          <div id="tblops-agg-result" style="margin-top:8px;font-size:13px;font-weight:600;color:var(--text-primary);min-height:20px"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  const getSelectedTable = () => tables[parseInt(dialog.querySelector('#tblops-target').value)] || tables[0];

  function populateColumns() {
    const table = getSelectedTable();
    const firstRow = table.querySelector('tr');
    if (!firstRow) return;
    const headers = Array.from(firstRow.cells).map((c, i) => ({ idx: i, label: c.textContent.trim() || `Col ${i + 1}` }));
    const optionsHtml = headers.map(h => `<option value="${h.idx}">${h.label}</option>`).join('');
    dialog.querySelector('#tblops-sort-col').innerHTML = optionsHtml;
    dialog.querySelector('#tblops-filter-col').innerHTML = optionsHtml;
    dialog.querySelector('#tblops-agg-col').innerHTML = optionsHtml;
  }
  populateColumns();
  dialog.querySelector('#tblops-target').addEventListener('change', populateColumns);

  const doSort = (asc) => {
    const table = getSelectedTable();
    const colIdx = parseInt(dialog.querySelector('#tblops-sort-col').value);
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const aVal = a.cells[colIdx]?.textContent.trim() || '';
      const bVal = b.cells[colIdx]?.textContent.trim() || '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
      return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    rows.forEach(r => tbody.appendChild(r));
    dirty = true;
  };
  dialog.querySelector('#tblops-sort-asc').addEventListener('click', () => doSort(true));
  dialog.querySelector('#tblops-sort-desc').addEventListener('click', () => doSort(false));

  dialog.querySelector('#tblops-filter-apply').addEventListener('click', () => {
    const table = getSelectedTable();
    const colIdx = parseInt(dialog.querySelector('#tblops-filter-col').value);
    const keyword = dialog.querySelector('#tblops-filter-val').value.toLowerCase();
    const tbody = table.querySelector('tbody') || table;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(r => {
      const cellText = r.cells[colIdx]?.textContent.toLowerCase() || '';
      r.style.display = cellText.includes(keyword) ? '' : 'none';
    });
  });
  dialog.querySelector('#tblops-filter-reset').addEventListener('click', () => {
    const table = getSelectedTable();
    const tbody = table.querySelector('tbody') || table;
    tbody.querySelectorAll('tr').forEach(r => r.style.display = '');
    dialog.querySelector('#tblops-filter-val').value = '';
  });

  const doAggregate = (fn) => {
    const table = getSelectedTable();
    const colIdx = parseInt(dialog.querySelector('#tblops-agg-col').value);
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.style.display !== 'none');
    const values = rows.map(r => parseFloat(r.cells[colIdx]?.textContent.trim())).filter(v => !isNaN(v));
    let result = '';
    if (values.length === 0) { result = 'No numeric values found'; }
    else {
      switch (fn) {
        case 'sum': result = `Sum = ${values.reduce((a, b) => a + b, 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
        case 'avg': result = `Average = ${(values.reduce((a, b) => a + b, 0) / values.length).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
        case 'min': result = `Min = ${Math.min(...values).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
        case 'max': result = `Max = ${Math.max(...values).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
      }
    }
    dialog.querySelector('#tblops-agg-result').textContent = result;
  };
  dialog.querySelector('#tblops-sum').addEventListener('click', () => doAggregate('sum'));
  dialog.querySelector('#tblops-avg').addEventListener('click', () => doAggregate('avg'));
  dialog.querySelector('#tblops-min').addEventListener('click', () => doAggregate('min'));
  dialog.querySelector('#tblops-max').addEventListener('click', () => doAggregate('max'));
}

// ─── Feature 4: Document Templates ──────────────────────────
const DOC_TEMPLATES = {
  resume: {
    name: 'Resume / CV',
    icon: '\u{1F464}',
    content: `<h1 style="text-align:center;margin-bottom:4px">Your Name</h1>
<p style="text-align:center;color:gray;font-size:14px">your.email@example.com | (123) 456-7890 | City, State | linkedin.com/in/yourname</p>
<hr>
<h2>Professional Summary</h2>
<p>Experienced professional with a proven track record in [industry/field]. Skilled in [key competencies]. Passionate about delivering results and driving innovation.</p>
<h2>Experience</h2>
<h3>Job Title \u2014 Company Name</h3>
<p style="color:gray;font-size:13px"><em>Jan 2022 \u2013 Present | City, State</em></p>
<ul>
<li>Led cross-functional team of 10+ members to deliver projects on time and under budget</li>
<li>Improved operational efficiency by 25% through process optimization</li>
<li>Managed annual budget of $500K with consistent positive variance</li>
</ul>
<h3>Previous Job Title \u2014 Previous Company</h3>
<p style="color:gray;font-size:13px"><em>Jun 2019 \u2013 Dec 2021 | City, State</em></p>
<ul>
<li>Developed and implemented new strategies resulting in 30% revenue growth</li>
<li>Collaborated with stakeholders to define requirements and deliver solutions</li>
</ul>
<h2>Education</h2>
<h3>Degree \u2014 University Name</h3>
<p style="color:gray;font-size:13px"><em>Graduated: May 2019 | GPA: 3.8/4.0</em></p>
<h2>Skills</h2>
<p>Project Management, Data Analysis, Python, JavaScript, SQL, Communication, Leadership</p>`
  },
  report: {
    name: 'Business Report',
    icon: '\u{1F4CA}',
    content: `<h1>Report Title</h1>
<p style="color:gray"><strong>Prepared by:</strong> Author Name | <strong>Date:</strong> ${new Date().toLocaleDateString()} | <strong>Department:</strong> Division Name</p>
<hr>
<h2>1. Executive Summary</h2>
<p>Provide a brief overview of the report's purpose, methodology, key findings, and recommendations.</p>
<h2>2. Introduction</h2>
<p>Describe the background and context for this report.</p>
<h2>3. Methodology</h2>
<p>Detail the approach, data sources, tools, and frameworks used.</p>
<h2>4. Findings</h2>
<h3>4.1 Key Finding One</h3>
<p>Describe the first major finding with supporting data.</p>
<h3>4.2 Key Finding Two</h3>
<p>Describe the second major finding with supporting data.</p>
<h2>5. Recommendations</h2>
<ul>
<li><strong>Recommendation 1:</strong> Description and expected impact</li>
<li><strong>Recommendation 2:</strong> Description and expected impact</li>
</ul>
<h2>6. Conclusion</h2>
<p>Summarize the key takeaways and next steps.</p>
<h2>Appendix</h2>
<p>Additional supporting data, charts, and references.</p>`
  },
  letter: {
    name: 'Formal Letter',
    icon: '\u2709\uFE0F',
    content: `<p style="text-align:right">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
<p><br></p>
<p><strong>Sender Name</strong><br>Sender Address<br>City, State ZIP</p>
<p><br></p>
<p><strong>Recipient Name</strong><br>Recipient Title<br>Company / Organization<br>City, State ZIP</p>
<p><br></p>
<p>Dear [Recipient Name],</p>
<p><br></p>
<p>I am writing to [state the purpose of the letter]. I would like to bring to your attention [briefly describe the main topic].</p>
<p><br></p>
<p>[Body paragraph: Provide detailed information, context, or explanation.]</p>
<p><br></p>
<p>I look forward to your response. Please contact me at [phone] or [email].</p>
<p><br></p>
<p>Sincerely,</p>
<p><br></p>
<p><strong>Your Name</strong><br>Your Title</p>`
  },
  meeting: {
    name: 'Meeting Notes',
    icon: '\u{1F4DD}',
    content: `<h1>Meeting Notes</h1>
<table style="width:100%;margin-bottom:16px">
<tr><td style="width:120px;font-weight:600;padding:6px 10px;border:1px solid var(--border-color)">Date</td><td style="padding:6px 10px;border:1px solid var(--border-color)">${new Date().toLocaleDateString()}</td></tr>
<tr><td style="font-weight:600;padding:6px 10px;border:1px solid var(--border-color)">Time</td><td style="padding:6px 10px;border:1px solid var(--border-color)">10:00 AM \u2013 11:00 AM</td></tr>
<tr><td style="font-weight:600;padding:6px 10px;border:1px solid var(--border-color)">Location</td><td style="padding:6px 10px;border:1px solid var(--border-color)">Conference Room / Video Call</td></tr>
<tr><td style="font-weight:600;padding:6px 10px;border:1px solid var(--border-color)">Attendees</td><td style="padding:6px 10px;border:1px solid var(--border-color)">Name 1, Name 2, Name 3</td></tr>
</table>
<h2>Agenda</h2>
<ol>
<li>Review of previous action items</li>
<li>Topic 1: [Description]</li>
<li>Topic 2: [Description]</li>
<li>Next steps and action items</li>
</ol>
<h2>Discussion Notes</h2>
<h3>Topic 1</h3>
<ul><li>Key point discussed</li><li>Decisions made</li></ul>
<h3>Topic 2</h3>
<ul><li>Key point discussed</li><li>Decisions made</li></ul>
<h2>Action Items</h2>
<table style="width:100%">
<thead><tr><th style="padding:6px 10px;border:1px solid var(--border-color);background:var(--pane-header-bg)">Action</th><th style="padding:6px 10px;border:1px solid var(--border-color);background:var(--pane-header-bg)">Owner</th><th style="padding:6px 10px;border:1px solid var(--border-color);background:var(--pane-header-bg)">Due Date</th><th style="padding:6px 10px;border:1px solid var(--border-color);background:var(--pane-header-bg)">Status</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border:1px solid var(--border-color)">Action item 1</td><td style="padding:6px 10px;border:1px solid var(--border-color)">Name</td><td style="padding:6px 10px;border:1px solid var(--border-color)">Date</td><td style="padding:6px 10px;border:1px solid var(--border-color)">Pending</td></tr>
</tbody>
</table>
<h2>Next Meeting</h2>
<p><strong>Date:</strong> TBD | <strong>Time:</strong> TBD</p>`
  },
  invoice: {
    name: 'Invoice',
    icon: '\u{1F4B0}',
    content: `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
<div>
<h1 style="margin:0;font-size:28px;color:var(--brand-color,#0071e3)">INVOICE</h1>
<p style="margin:4px 0;color:gray;font-size:13px">Invoice #: INV-001</p>
<p style="margin:4px 0;color:gray;font-size:13px">Date: ${new Date().toLocaleDateString()}</p>
<p style="margin:4px 0;color:gray;font-size:13px">Due Date: ${new Date(Date.now() + 30 * 86400000).toLocaleDateString()}</p>
</div>
<div style="text-align:right">
<p style="margin:0;font-weight:700;font-size:16px">Your Company Name</p>
<p style="margin:2px 0;font-size:13px;color:gray">123 Business Street<br>City, State ZIP<br>Phone: (123) 456-7890<br>Email: billing@company.com</p>
</div>
</div>
<hr>
<div style="margin-bottom:20px">
<p style="font-weight:700;font-size:14px;margin-bottom:4px">Bill To:</p>
<p style="margin:0;font-size:13px">Client Name<br>Client Company<br>456 Client Avenue<br>City, State ZIP</p>
</div>
<table style="width:100%;margin-bottom:20px">
<thead>
<tr>
<th style="padding:8px 12px;border:1px solid var(--border-color);background:var(--pane-header-bg);text-align:left">Description</th>
<th style="padding:8px 12px;border:1px solid var(--border-color);background:var(--pane-header-bg);text-align:center;width:80px">Qty</th>
<th style="padding:8px 12px;border:1px solid var(--border-color);background:var(--pane-header-bg);text-align:right;width:100px">Unit Price</th>
<th style="padding:8px 12px;border:1px solid var(--border-color);background:var(--pane-header-bg);text-align:right;width:100px">Amount</th>
</tr>
</thead>
<tbody>
<tr><td style="padding:8px 12px;border:1px solid var(--border-color)">Service / Product 1</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:center">1</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:right">$500.00</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:right">$500.00</td></tr>
<tr><td style="padding:8px 12px;border:1px solid var(--border-color)">Service / Product 2</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:center">2</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:right">$250.00</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:right">$500.00</td></tr>
<tr><td style="padding:8px 12px;border:1px solid var(--border-color)">Service / Product 3</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:center">5</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:right">$100.00</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:right">$500.00</td></tr>
</tbody>
</table>
<div style="text-align:right;margin-bottom:24px">
<p style="margin:4px 0;font-size:14px"><strong>Subtotal:</strong> $1,500.00</p>
<p style="margin:4px 0;font-size:14px"><strong>Tax (10%):</strong> $150.00</p>
<p style="margin:4px 0;font-size:18px;font-weight:700;color:var(--brand-color,#0071e3)"><strong>Total Due:</strong> $1,650.00</p>
</div>
<hr>
<div style="margin-top:16px">
<p style="font-weight:700;font-size:14px;margin-bottom:4px">Payment Terms</p>
<p style="font-size:13px;color:gray">Payment is due within 30 days. Please make checks payable to Your Company Name.</p>
<p style="font-size:12px;color:gray;margin-top:12px;text-align:center">Thank you for your business!</p>
</div>`
  }
};

function showTemplateLibrary() {
  document.querySelector('.doc-template-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-template-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:560px;max-height:80vh;overflow-y:auto">
      <div class="ai-setup-header">
        <h3>Document Templates</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Choose a template to start with. Your current content will be replaced.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${Object.entries(DOC_TEMPLATES).map(([key, tpl]) => `
            <button class="doc-tpl-card" data-tpl="${key}" style="padding:16px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);cursor:pointer;text-align:left;transition:border-color 0.15s,box-shadow 0.15s;color:var(--text-primary)">
              <div style="font-size:24px;margin-bottom:8px">${tpl.icon}</div>
              <div style="font-size:14px;font-weight:700">${tpl.name}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Click to apply this template</div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelectorAll('.doc-tpl-card').forEach(card => {
    card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--brand-color)'; card.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; });
    card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--border-color)'; card.style.boxShadow = 'none'; });
    card.addEventListener('click', () => {
      const tplKey = card.dataset.tpl;
      const tpl = DOC_TEMPLATES[tplKey];
      if (!tpl || !editorEl) return;
      if (editorEl.innerText.trim().length > 30) {
        if (!confirm('This will replace your current document content. Continue?')) return;
      }
      editorEl.innerHTML = tpl.content;
      dirty = true;
      updateWordCount();
      dialog.remove();
    });
  });
}

// ─── Feature 5: Citation / Bibliography ─────────────────────
let citations = [];

function showCitationDialog() {
  document.querySelector('.doc-cite-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-cite-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:520px;max-height:85vh;overflow-y:auto">
      <div class="ai-setup-header">
        <h3>Citation Manager</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border-color);padding-bottom:8px">
          <button id="cite-tab-add" class="ai-pull-btn" style="font-weight:700;background:var(--brand-color);color:#fff">Add Citation</button>
          <button id="cite-tab-list" class="ai-pull-btn">Manage (${citations.length})</button>
        </div>

        <div id="cite-add-panel">
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600">Type</label>
            <select id="cite-type" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              <option value="article">Journal Article</option>
              <option value="book">Book</option>
              <option value="web">Website</option>
              <option value="conference">Conference Paper</option>
            </select>
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:12px;font-weight:600">Authors</label>
            <input id="cite-authors" type="text" placeholder="e.g. Smith, J., & Doe, A." style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:12px;font-weight:600">Title</label>
            <input id="cite-title" type="text" placeholder="Title of the work" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:12px;font-weight:600">Year</label>
              <input id="cite-year" type="text" placeholder="2024" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600">Source / Journal</label>
              <input id="cite-source" type="text" placeholder="Journal name or publisher" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:12px;font-weight:600">Volume / Issue</label>
              <input id="cite-volume" type="text" placeholder="12(3)" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600">Pages</label>
              <input id="cite-pages" type="text" placeholder="45-67" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600">URL / DOI</label>
            <input id="cite-url" type="text" placeholder="https://doi.org/..." style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600">Citation Style</label>
            <select id="cite-style" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              <option value="apa">APA 7th</option>
              <option value="mla">MLA 9th</option>
              <option value="chicago">Chicago</option>
              <option value="ieee">IEEE</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="cite-insert" class="ai-pull-btn" style="background:var(--brand-color);color:#fff;font-weight:600">Insert Citation</button>
            <button id="cite-update-refs" class="ai-pull-btn">Update References</button>
          </div>
        </div>

        <div id="cite-list-panel" style="display:none">
          <div id="cite-list-items" style="margin-bottom:12px"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="cite-clear-all" class="ai-pull-btn" style="color:#ef4444">Clear All</button>
            <button id="cite-regenerate" class="ai-pull-btn" style="background:var(--brand-color);color:#fff">Regenerate References</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  const addPanel = dialog.querySelector('#cite-add-panel');
  const listPanel = dialog.querySelector('#cite-list-panel');

  dialog.querySelector('#cite-tab-add').addEventListener('click', () => {
    addPanel.style.display = '';
    listPanel.style.display = 'none';
    dialog.querySelector('#cite-tab-add').style.background = 'var(--brand-color)';
    dialog.querySelector('#cite-tab-add').style.color = '#fff';
    dialog.querySelector('#cite-tab-list').style.background = '';
    dialog.querySelector('#cite-tab-list').style.color = '';
  });

  dialog.querySelector('#cite-tab-list').addEventListener('click', () => {
    addPanel.style.display = 'none';
    listPanel.style.display = '';
    dialog.querySelector('#cite-tab-list').style.background = 'var(--brand-color)';
    dialog.querySelector('#cite-tab-list').style.color = '#fff';
    dialog.querySelector('#cite-tab-add').style.background = '';
    dialog.querySelector('#cite-tab-add').style.color = '';
    renderCitationList(dialog);
  });

  dialog.querySelector('#cite-insert').addEventListener('click', () => {
    const c = {
      id: 'cite-' + Date.now(),
      type: dialog.querySelector('#cite-type').value,
      authors: dialog.querySelector('#cite-authors').value.trim(),
      title: dialog.querySelector('#cite-title').value.trim(),
      year: dialog.querySelector('#cite-year').value.trim(),
      source: dialog.querySelector('#cite-source').value.trim(),
      volume: dialog.querySelector('#cite-volume').value.trim(),
      pages: dialog.querySelector('#cite-pages').value.trim(),
      url: dialog.querySelector('#cite-url').value.trim(),
    };
    if (!c.authors || !c.title) {
      alert('At least Authors and Title are required.');
      return;
    }
    citations.push(c);
    const idx = citations.length;
    const style = dialog.querySelector('#cite-style').value;
    const inlineText = formatInlineCitation(c, idx, style);
    editorEl?.focus();
    document.execCommand('insertHTML', false, `<span class="doc-cite-ref" data-cite-id="${c.id}" style="color:var(--brand-color);cursor:pointer;font-weight:500" title="${c.authors} (${c.year})">${inlineText}</span>`);
    dirty = true;
    ['#cite-authors', '#cite-title', '#cite-year', '#cite-source', '#cite-volume', '#cite-pages', '#cite-url'].forEach(sel => {
      const el = dialog.querySelector(sel);
      if (el) el.value = '';
    });
    dialog.querySelector('#cite-tab-list').textContent = `Manage (${citations.length})`;
  });

  dialog.querySelector('#cite-update-refs').addEventListener('click', () => {
    const style = dialog.querySelector('#cite-style').value;
    updateReferencesSection(style);
    dialog.remove();
  });

  dialog.querySelector('#cite-regenerate').addEventListener('click', () => {
    const style = dialog.querySelector('#cite-style').value;
    updateReferencesSection(style);
    dialog.remove();
  });

  dialog.querySelector('#cite-clear-all').addEventListener('click', () => {
    if (!confirm('Remove all citations and references?')) return;
    editorEl?.querySelectorAll('.doc-cite-ref').forEach(el => {
      el.replaceWith(document.createTextNode(''));
    });
    editorEl?.querySelector('.doc-references')?.remove();
    citations = [];
    dirty = true;
    dialog.remove();
  });
}

function renderCitationList(dialog) {
  const container = dialog.querySelector('#cite-list-items');
  if (!container) return;
  if (citations.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px">No citations added yet.</p>';
    return;
  }
  container.innerHTML = citations.map((c, i) => `
    <div style="padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">[${i + 1}] ${c.title}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${c.authors} (${c.year})${c.source ? ' \u2014 ' + c.source : ''}</div>
      </div>
      <button class="cite-remove-btn" data-idx="${i}" style="border:none;background:none;cursor:pointer;font-size:16px;color:#ef4444;padding:4px 8px" title="Remove">\u00D7</button>
    </div>
  `).join('');

  container.querySelectorAll('.cite-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const removed = citations.splice(idx, 1)[0];
      editorEl?.querySelector(`.doc-cite-ref[data-cite-id="${removed.id}"]`)?.remove();
      dirty = true;
      renderCitationList(dialog);
      dialog.querySelector('#cite-tab-list').textContent = `Manage (${citations.length})`;
    });
  });
}

function formatInlineCitation(c, idx, style) {
  const surname = c.authors.split(',')[0].trim();
  switch (style) {
    case 'apa': return `(${surname}, ${c.year})`;
    case 'mla': return `(${surname} ${c.pages || ''})`.replace(/ +\)/, ')');
    case 'chicago': return `(${surname} ${c.year}, ${c.pages || ''})`.replace(/, \)/, ')');
    case 'ieee': return `[${idx}]`;
    default: return `(${surname}, ${c.year})`;
  }
}

function formatFullReference(c, idx, style) {
  const a = c.authors;
  const t = c.title;
  const y = c.year;
  const s = c.source;
  const v = c.volume;
  const p = c.pages;
  const u = c.url;

  switch (style) {
    case 'apa':
      return `${a} (${y}). ${t}.${s ? ` <em>${s}</em>` : ''}${v ? `, <em>${v}</em>` : ''}${p ? `, ${p}` : ''}.${u ? ` <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    case 'mla':
      return `${a}. \u201C${t}.\u201D${s ? ` <em>${s}</em>` : ''}${v ? `, vol. ${v}` : ''}${y ? `, ${y}` : ''}${p ? `, pp. ${p}` : ''}.${u ? ` <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    case 'chicago':
      return `${a}. \u201C${t}.\u201D${s ? ` <em>${s}</em>` : ''}${v ? ` ${v}` : ''}${y ? ` (${y})` : ''}${p ? `: ${p}` : ''}.${u ? ` <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    case 'ieee':
      return `[${idx + 1}] ${a}, \u201C${t},\u201D${s ? ` <em>${s}</em>` : ''}${v ? `, vol. ${v}` : ''}${p ? `, pp. ${p}` : ''}${y ? `, ${y}` : ''}.${u ? ` [Online]. Available: <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    default:
      return `${a} (${y}). ${t}.${s ? ` ${s}` : ''}.`;
  }
}

function updateReferencesSection(style) {
  if (!editorEl || citations.length === 0) return;

  editorEl.querySelector('.doc-references')?.remove();

  const refDiv = document.createElement('div');
  refDiv.className = 'doc-references';
  refDiv.contentEditable = 'false';
  refDiv.style.cssText = 'border-top:2px solid var(--border-color);margin-top:32px;padding-top:16px';

  const title = style === 'ieee' ? 'References' : style === 'mla' ? 'Works Cited' : style === 'chicago' ? 'Bibliography' : 'References';

  let html = `<h2 style="font-size:18px;font-weight:700;margin-bottom:16px">${title}</h2>`;
  html += '<div style="font-size:14px;line-height:1.8">';
  citations.forEach((c, i) => {
    const indent = style === 'apa' || style === 'mla' ? 'padding-left:2em;text-indent:-2em' : '';
    html += `<p style="margin-bottom:8px;${indent}">${formatFullReference(c, i, style)}</p>`;
  });
  html += '</div>';
  refDiv.innerHTML = html;

  editorEl.appendChild(refDiv);
  dirty = true;
}

/* ==================== Spell Check ==================== */

let spellCheckEnabled = false;
let customDictionary = JSON.parse(localStorage.getItem('doc-custom-dict') || '[]');

// Basic English word list (common words). Words not in this set are flagged.
// This is a compact list; real spell check would use a larger dictionary.
const BASIC_DICT = new Set();
const COMMON_WORDS = `a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further get got had has have having he her here hers herself him himself his how i if in into is it its itself just know let like make me might more most my myself no nor not now of off on once only or other our ours ourselves out over own part per put re s same she should so some still such t take than that the their theirs them themselves then there these they this those through to too under until up us very want was we were what when where which while who whom why will with would you your yours yourself yourselves able about above absent accept access accident according account across act action active actually add address admit adult advance advice affect afford after afternoon again against age ago agree ahead aim air allow almost alone along already also always amount and animal another answer any anyone anything anyway apart appear apple apply area arm army around arrive art article as ask at attack attempt attention available away baby back bad bag ball bank bar base basic basis be bear beat beautiful because become bed before begin behind believe below beside best better between big bill bit black blood blue board body bone book born both box boy brain break bring brother build burn bus business but buy by call came can capital car card care carry case catch cause central century certain chair chairman chance change character charge check child choice choose church city claim class clear close cold come common community company computer concern condition consider contain continue control cost could country county couple course court cover create cross cup current cut dark data daughter day dead deal dear death decide decision deep degree department depend describe design detail develop development die difference different difficult dinner direction discover discussion do doctor dog door down draw dream dress drink drive drop during each early east eat economic economy edge education effect egg eight either election else employee end energy enjoy enough enter environment especially european even evening event ever every everyone everything evidence exactly example exchange expect experience explain eye face fact fall family far fast father fear feel few field fight figure fill final finally financial find fine finger fish five floor fly follow food foot for force foreign forget form former forward four free friend from front full fund further future game garden general get girl give glass go god good government great green ground group grow growth gun guy hair half hand hang happen happy hard have he head health hear heart heat heavy help her here herself high him himself his hit hold home hope hot hotel hour house how however human hundred husband idea if important in include increase indeed indicate individual industry information inside instead interest into investment involve issue it item its itself job join just keep key kid kill kind king kitchen know knowledge land language large last late later law lay lead leader learn least leave left leg less let letter level lie life light like likely line list listen little live long look lord lose lot love low machine main major make man manage manager many market may maybe me mean meeting member memory mention might million mind minister minute miss model modern moment money month more morning most mother mouth move much music must my myself name nation national nature near nearly necessary need never new news next nice night no none nor north not note nothing notice now number occur of off offer office officer official often oh oil ok old on once one only open operation opportunity option or order organization other our out outside over own page pair paper parent part particular particularly party pass past patient pattern pay people per perhaps period person phone pick picture piece place plan plant play player please point police political poor popular population position possible power practice prepare present president pressure pretty price private probably problem process produce product production program project provide public pull purpose push put quality question quickly quite range rate rather reach read ready real reality realize really reason receive recent recently record red reduce reflect region relate relationship remember report represent require research resource respond rest result return right rise risk road role room rule run safe same save say school science score sea season seat second section security see seek seem sell send senior sense serious serve service set seven several shake shall shape share she shoot short should shoulder show side sign significant similar simple simply since sing single sir sister sit situation six size skill skin small smile so social society soldier some someone something sometimes son soon sort south southern space speak special specific spend spring staff stage stand standard star start state statement stay step still stock stop story strategy street strong structure student study stuff style subject success successful such suddenly suggest summer support sure surface system table take talk tax teacher team technology tell ten tend term test than thank that the their them then there these they thing think third this those though thought three through throw thus time to today together tonight too top total tough toward town trade training travel treat tree trial trip trouble truth try turn tv two type under understand unit until up upon us use usually value various very visit voice vote wait walk wall want war watch water way we weapon wear week weight well west western what whatever when where whether which while white who whole whom whose why wide wife will win window wish with without woman wonder word work worker world worry would write wrong yeah year yes yet young your`;
COMMON_WORDS.split(/\s+/).forEach(w => BASIC_DICT.add(w));

// Extended word list for fewer false positives
const EXTENDED_WORDS = `ability absolute absolutely abstract academic accept acceptable accepted access accessible according account accurate achieve achievement acknowledge acquire across actual add additional address adequate adjust administration administrative adopt advanced advantage advertising affect afternoon agency agent aggregate agree agreement ahead aid aircraft airport align alive alliance allow allowance alongside already alternative although altogether amazing amid amount analysis analyst ancient announce annual anticipate anxiety apparent apparently appeal appearance application apply appointment approach appropriate approval approve approximately archive argue argument arise arrangement array arrive aside aspect assembly assess assessment asset assign assignment assist assistance assistant associate association assume assumption atmosphere attach attempt attend attention attitude attorney attractive attribute audience author authority automatic availability avoid award aware awareness background backward balance band barrier basically bear beat bedroom behavior behind belief belong beneath benefit beside besides beyond billion bind biological blank block blow blue boat bond border bother bottom brain branch brave breast bridge brief bright brilliant broad broken brother brown budget burden burn buyer cabinet cable calculate camera camp campaign candidate capable capacity capital capture carbon careful carefully carrier carry catch category cause celebrate cell center central century ceremony chain chair chairman challenge champion championship channel chapter character characteristic charge charity chart check chief child childhood chip choice christian church cigarette citizen civilian claim classroom clean clearly client climate climb clinical clock closely closer clothes club cluster coach coalition code cognitive collapse colleague collect collection collective college colonial color column combat combination combine comedy comfort comfortable command commander comment commercial commission commit commitment committee common communicate communication community companion compare comparison compete competition competitive complaint complete completely complex complicate component compose composition comprehensive concern conclude conclusion concrete condition conduct conference confidence confirm conflict confront confusion congressional connect connection consciousness consensus consequence conservative consider considerable consideration consist consistent constant constantly constitute constitutional construct construction consultant consumer consumption contact contain container contemporary content contest context continue contract contrast contribute contribution control controversial controversy convention conventional conversation convert conviction cook core corporate correct corridor counter couple courage coverage crack craft crash crazy creature credit crew crime criminal crisis criteria critical criticism critics crop crowd crucial cry cultural culture cup curious current customer cycle daily danger dare darkness database deal dealer debate decade decide decision deck declare decline decrease deep deeply defeat defend defense defensive deficit define definitely definition degree delay deliver delivery demand democracy demonstrate department depend dependent depending deposit depress depression derive describe description desert deserve design designer desire desk despite destroy destruction detail detect determine develop developer development device devote dialogue die diet differ dimension dinner direction directly director disability disappear disaster discipline discount discourse discover discovery discrimination discuss discussion disease dismiss disorder display dispute distance distinction distinguish distribute distribution district diverse diversity divide division doctor document domestic dominant dominate door double doubt downtown dozen draft drag drama dramatic dramatically draw drawing dream dress drink drive driver drop drug dry due during dust duty each earn earning earth ease easily eastern easy eat economic economy edge edition editor education educator effect effectively efficiency effort eight either elderly election element eliminate elite elsewhere embrace emerge emergency emission emotional emphasis emphasize employ employee employer employment empty enable encounter encourage enemy energy enforcement engage engine engineer engineering enhance enjoy enormous enough ensure enter enterprise entertainment entire entirely entrance entry environment environmental episode equal equally equipment era escape especially essay essentially establish establishment estate estimate evaluate evaluation even evening eventually every everything everywhere evidence evil evolution evolve exact exactly examine example exceed excellent except exchange exciting executive exercise exhibit exhibition exist existence existing expand expansion expect expectation expense expensive experience experiment expert explain explanation explicit explicitly explore explosion export expose exposure extend extension extensive extent external extra extraordinary extreme extremely fabric facility factor failure fairly faith familiar family fan fantasy farmer fascinating fashion fast fate fault favorite federal feel fellow female fence fiction field fight fighter figure file fill final finally finance financial finding finger finish fire firm fish fit fitness fix flag flat flight float floor flow flower focus folk follow following football force foreign forest forever forget formation formula forth fortune forward found foundation founder frame framework free freedom frequently fresh friend front fruit fuel fully function fundamental funding furniture gain galaxy game garden garner gas gate gather gaze gene generally generation genetic gentleman gently genuine gift giant girlfriend given glad glance glass global gold golden gonna good grab grade gradually grand grandfather grant grass grave greatly green greet grocery gross ground guard guess guest guide guilty gun habitat half hall hand handle hanging happen happy harbor harm hat hate hay heading headquarters healthy hear hearing heart heat heavily height hell helpful hence hero herself hide highlight highly highway hire historic historical hit hold holiday honest honor hope hopefully horror hospital host hostile hotel household housing huge hurt hypothesis identification identify identity ignore ill illegal illustrate image imagination imagine immediate immediately immigrant impact implement implication imply impose impose impossible impress impression impressive improve improvement incident include income increase increasingly incredible incredibly indeed independence independent index indicate indicator individual industrial industry infant infection inflation influence inform initial initially initiative injury inner innocent innovation innovative input inquiry inside insight insist install instance instead institution institutional instruction instructor instrument insurance intellectual intelligence intend intense intention interest interested interesting internal international internet interpretation intervention interview into introduce introduction invasion investigation investigator investment investor invisible invitation involve involvement iron islamic island isolate isolation issue jacket journey joy judge judgment jump junior jury justice justify keen keeping kick killing kitchen knee knife knock label labor laboratory lack landing landscape largely laser launch lawn lawsuit lawyer layer leading league lean learning leather leave lecture left legal legislation legitimate length lesson letter liberal library lift light limit limited line link literally literary literature loan local locate location logic long loss mainly maintain major majority maker manage management manner manufacturer map margin mark massive match material math matter maximum meaning measure measurement meat mechanism media medical medication medium membership mental mention merely merely message metal method middle military mine minister minor minority minute mirror mission mixture model moderate modern modify moment monitor mood moreover mortgage mostly motion motivation mount mouse multiple murder muscle museum mutual mysterious mystery narrow naturally negotiate negotiation neighborhood nervous network nevertheless newspaper nobody nonetheless nonetheless noise nomination nonetheless norm normal normally northern nose notable noting notion novel nowhere nuclear numerous nurse nutrition object objection observation observe observer obstacle obtain obvious obviously occasion occasionally occupation occupy occurrence odd offense offensive officer official often oil ongoing online only opening operate operation operator opinion opponent opportunity opposite opposition option ordinary organic organism organization organize orientation origin otherwise ought outcome output outside overall overcome overlook overwhelming owner pace pack package page painting pair pale pan panel participate participation particular particularly partly partner passage passenger patient pattern payment peace peak peer penalty per percent percentage perception perform performance perhaps permission permit person personal personality perspective phase phenomenon philosophy photo phrase physical physician piano pile pilot pine pipe pitch place plain plan plane planet planning plate platform player pleasant please pleasure plenty plus pocket poem poet point pollution pool popular popularity portion portrait pose positive possibility possibly potential potentially pour poverty powerful practice prayer predict prefer preference pregnancy prepare presence preserve presidency president presidential pressure prevent previously primary prime principal principle print priority prison prisoner privacy private probably proceed process produce producer product production professional professor profit program project promise promote proportion proposal propose prosecutor prospect protect protection protein protest prove provider province provision psychological psychology pull punch purchase pure purple pursue qualify quarter quiet quite race racial radical rain range rapid rarely rating ratio raw reaction reading ready reality reasonable rebel recipe recognition recommend recommendation record recording recover recovery recruit red reduce reduction reflect reflection reform regard regime region regional register regular regulation reinforce reject relate relation relative relatively release relevant relief religion religious rely remark remarkable remember remind remote remove repeatedly replace reporter represent representation representative request require requirement researcher reserve resident residential resist resistance resolution resolve resort resource respond response responsibility responsible rest restore restrict restriction retain retire retirement reveal revenue review revolution rich ride rifle rise risk rival river road robot rock role romantic roof routine row rural rush sacrifice sad sadly safety salary sand satellite satisfaction satisfy save saving scale scandal scared scenario schedule scholar scholarship scope screen search seat secondary secretary section sector secure seek select selection senate senior senior sense sensitive separate sequence series seriously servant session settle settlement several severe sexual shall shape shelter shift ship shirt shoot shooting shortly shot shoulder shout shut sight silence simple simply sing singer single sister sit site size skill skin sleep slight slightly slow slowly smart smile smoke so so-called soccer social software soil soldier solid solution solve somebody somehow someone something somewhat somewhere sort soul source southern space speak specialist specific specifically spectrum speech spend spirit spiritual spokesman spot spread spring square squeeze stability stable staff stage standard star stare start station status stay steady step stick stock stomach stone stop storage storm straight strategic strategy stream street strength stress stretch strike strongly structure struggle student studio study stupid style subject submit subsequent substantial succeed sufficient sugar suggestion suitable summer summit supply supporter surely surface surgery surprised surprisingly surround surrounding survive suspect sustain sweep sweet swim swing switch symbol symptom table tail talent task tea teaching team technology telephone television temperature temporary tension territory terrorism terrorist thank the themselves theory therapy thin tired toe tone tonight tool topic total totally tough tournament toward tower trace track trade tradition traditional training transfer transform transition translate transport travel treatment tremendous trend trial trip trouble truly trust truth try typical ultimately uncle undergo understand unfortunately unfortunately union unique universe university unknown unless unlikely unusual upon urban use used user usual utility vacation valley variation variety vast vehicle version versus veteran via victim video view viewer village violence virtual virtually virtue visible vision visitor visual vital volume voluntary volunteer vulnerability wage wage wake walk wall warning wash waste wave weakness wealth weapon weather weekend welfare western whatever whom widely widespread willing wind winter wire wish withdraw within without witness wonder wonderful wooden worker workplace works workshop worried worry worth wrap writer writing yard yeah yesterday youth zone`;
EXTENDED_WORDS.split(/\s+/).forEach(w => BASIC_DICT.add(w));

function isWordInDictionary(word) {
  const lower = word.toLowerCase();
  if (BASIC_DICT.has(lower)) return true;
  if (customDictionary.includes(lower)) return true;
  // Allow common suffixes
  if (lower.endsWith('s') && BASIC_DICT.has(lower.slice(0, -1))) return true;
  if (lower.endsWith('ed') && BASIC_DICT.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('ing') && BASIC_DICT.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('ly') && BASIC_DICT.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('er') && BASIC_DICT.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('est') && BASIC_DICT.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('tion') && BASIC_DICT.has(lower.slice(0, -4) + 'te')) return true;
  if (lower.endsWith('ment') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ness') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('able') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ful') && BASIC_DICT.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('less') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith("'s")) return isWordInDictionary(lower.slice(0, -2));
  if (lower.endsWith("n't")) return isWordInDictionary(lower.slice(0, -3));
  // Numbers, single chars, short words
  if (/^\d+$/.test(lower)) return true;
  if (lower.length <= 1) return true;
  return false;
}

function getSuggestions(word) {
  const lower = word.toLowerCase();
  const suggestions = [];
  const candidates = [...BASIC_DICT];

  // Simple edit distance 1 suggestions
  for (const candidate of candidates) {
    if (Math.abs(candidate.length - lower.length) > 2) continue;
    const dist = editDistance(lower, candidate);
    if (dist === 1 || dist === 2) {
      suggestions.push({ word: candidate, dist });
    }
    if (suggestions.length >= 8) break;
  }

  suggestions.sort((a, b) => a.dist - b.dist);
  return suggestions.slice(0, 5).map(s => s.word);
}

function editDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

let spellCheckMarks = [];

function toggleSpellCheck() {
  spellCheckEnabled = !spellCheckEnabled;
  const btn = document.getElementById('doc-spell-check');
  if (btn) {
    btn.style.background = spellCheckEnabled ? 'var(--brand-color)' : '';
    btn.style.color = spellCheckEnabled ? '#fff' : '';
  }

  if (spellCheckEnabled) {
    runSpellCheck();
  } else {
    clearSpellCheckMarks();
  }
}

function clearSpellCheckMarks() {
  for (const mark of spellCheckMarks) {
    if (mark.parentNode) {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  }
  spellCheckMarks = [];
}

function runSpellCheck() {
  clearSpellCheckMarks();
  if (!editorEl) return;

  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Skip elements that shouldn't be spell checked
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.doc-toc, .doc-footnotes, .doc-endnotes, .doc-references, .doc-equation, code, pre, .doc-spell-error')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  // Process in reverse to maintain positions
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const textNode = textNodes[i];
    const text = textNode.textContent;
    const wordRegex = /[a-zA-Z'\u2019]+/g;
    let match;
    const errors = [];

    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      if (word.length < 2) continue;
      if (!isWordInDictionary(word)) {
        errors.push({ start: match.index, length: word.length, word });
      }
    }

    // Wrap errors in reverse order
    for (let j = errors.length - 1; j >= 0; j--) {
      const err = errors[j];
      try {
        const range = document.createRange();
        range.setStart(textNode, err.start);
        range.setEnd(textNode, err.start + err.length);

        const span = document.createElement('span');
        span.className = 'doc-spell-error';
        span.dataset.word = err.word;
        range.surroundContents(span);
        spellCheckMarks.push(span);

        // Right-click and regular click for suggestions
        span.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showSpellSuggestionMenu(span, e);
        });
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          showSpellSuggestionMenu(span, e);
        });
      } catch {
        // Ignore errors from cross-boundary ranges
      }
    }
  }
}

function showSpellSuggestionMenu(span, event) {
  document.querySelector('.doc-spell-menu')?.remove();

  const word = span.dataset.word || span.textContent;
  const suggestions = getSuggestions(word);

  const menu = document.createElement('div');
  menu.className = 'doc-spell-menu';
  menu.style.top = (event.clientY + 4) + 'px';
  menu.style.left = Math.min(event.clientX, window.innerWidth - 200) + 'px';

  let html = '';
  if (suggestions.length > 0) {
    suggestions.forEach(s => {
      html += `<button class="doc-spell-suggestion" data-word="${s}">${s}</button>`;
    });
    html += '<div class="doc-spell-divider"></div>';
  } else {
    html += '<div style="padding:6px 10px;font-size:11px;color:var(--text-tertiary)">No suggestions</div>';
    html += '<div class="doc-spell-divider"></div>';
  }
  html += `<button class="doc-spell-action" data-action="ignore">Ignore</button>`;
  html += `<button class="doc-spell-action" data-action="ignore-all">Ignore All</button>`;
  html += `<button class="doc-spell-action" data-action="add">Add to Dictionary</button>`;

  menu.innerHTML = html;
  document.body.appendChild(menu);

  // Suggestions
  menu.querySelectorAll('.doc-spell-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      const replacement = btn.dataset.word;
      const textNode = document.createTextNode(replacement);
      span.parentNode.replaceChild(textNode, span);
      textNode.parentNode.normalize();
      spellCheckMarks = spellCheckMarks.filter(m => m !== span);
      menu.remove();
      dirty = true;
    });
  });

  // Actions
  menu.querySelectorAll('.doc-spell-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'ignore') {
        // Just remove the error mark for this instance
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
        spellCheckMarks = spellCheckMarks.filter(m => m !== span);
      } else if (action === 'ignore-all') {
        // Remove all marks for this word
        const targetWord = word.toLowerCase();
        [...spellCheckMarks].forEach(mark => {
          if (mark.textContent.toLowerCase() === targetWord && mark.parentNode) {
            const p = mark.parentNode;
            p.replaceChild(document.createTextNode(mark.textContent), mark);
            p.normalize();
          }
        });
        spellCheckMarks = spellCheckMarks.filter(m => m.parentNode);
        // Temporarily add to custom dict for this session
        customDictionary.push(targetWord);
      } else if (action === 'add') {
        // Add to persistent custom dictionary
        const targetWord = word.toLowerCase();
        customDictionary.push(targetWord);
        localStorage.setItem('doc-custom-dict', JSON.stringify(customDictionary));
        // Remove all marks for this word
        [...spellCheckMarks].forEach(mark => {
          if (mark.textContent.toLowerCase() === targetWord && mark.parentNode) {
            const p = mark.parentNode;
            p.replaceChild(document.createTextNode(mark.textContent), mark);
            p.normalize();
          }
        });
        spellCheckMarks = spellCheckMarks.filter(m => m.parentNode);
      }
      menu.remove();
    });
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 10);
}

/* ==================== Feature: Auto-Save ==================== */

function initAutoSave() {
  // Check for recovery data
  const savedContent = localStorage.getItem(AUTO_SAVE_KEY);
  const savedTimestamp = localStorage.getItem(AUTO_SAVE_TS_KEY);
  if (savedContent && editorEl) {
    const currentContent = editorEl.innerHTML.trim();
    const defaultContent = '<h1>Untitled Document</h1>\n            <p>Start typing here...</p>';
    if (savedContent !== currentContent && savedContent !== defaultContent && currentContent.length < 100) {
      const ts = savedTimestamp ? new Date(parseInt(savedTimestamp)).toLocaleString() : 'unknown time';
      showAutoSaveRecoveryDialog(savedContent, ts);
    }
  }

  autoSaveInterval = setInterval(() => {
    if (editorEl && dirty) {
      performAutoSave();
    }
  }, AUTO_SAVE_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && editorEl && dirty) {
      performAutoSave();
    }
  });
}

function performAutoSave() {
  if (!editorEl) return;
  const content = editorEl.innerHTML;
  localStorage.setItem(AUTO_SAVE_KEY, content);
  localStorage.setItem(AUTO_SAVE_TS_KEY, String(Date.now()));
  updateAutoSaveIndicator();
}

function updateAutoSaveIndicator() {
  const statusBar = document.getElementById('doc-status-bar');
  if (!statusBar) return;
  let indicator = document.getElementById('doc-autosave-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.id = 'doc-autosave-indicator';
    indicator.style.cssText = 'margin-left:12px;color:var(--text-tertiary);font-size:11px;transition:opacity 0.3s';
    statusBar.appendChild(indicator);
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  indicator.textContent = `Auto-saved ${timeStr}`;
  indicator.style.opacity = '1';
  setTimeout(() => { if (indicator) indicator.style.opacity = '0.6'; }, 3000);
}

function showAutoSaveRecoveryDialog(savedContent, timestamp) {
  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:450px">
      <h3 style="margin:0 0 8px;display:flex;align-items:center;gap:8px">Recovery Available</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px">
        Unsaved work was found from <strong>${timestamp}</strong>.<br>
        Would you like to recover it?
      </p>
      <div id="recovery-preview" style="max-height:150px;overflow:auto;border:1px solid var(--border-color);border-radius:6px;padding:8px;font-size:12px;color:var(--text-secondary);margin-bottom:12px;background:var(--sidebar-bg)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="recovery-discard" style="padding:6px 16px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px">Discard</button>
        <button id="recovery-restore" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Recover</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  const previewEl = dlg.querySelector('#recovery-preview');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = savedContent;
  previewEl.textContent = tempDiv.textContent.substring(0, 500) + (tempDiv.textContent.length > 500 ? '...' : '');

  dlg.querySelector('#recovery-restore').addEventListener('click', () => {
    if (editorEl) {
      editorEl.innerHTML = savedContent;
      dirty = true;
      updateWordCount();
      if (outlineVisible) updateDocOutline();
    }
    dlg.remove();
  });

  dlg.querySelector('#recovery-discard').addEventListener('click', () => {
    localStorage.removeItem(AUTO_SAVE_KEY);
    localStorage.removeItem(AUTO_SAVE_TS_KEY);
    dlg.remove();
  });
}

/* ==================== Feature: Version Compare/Diff (Enhanced) ==================== */

function showVersionDiffDialog() {
  document.querySelector('.doc-version-diff-dialog')?.remove();
  const versionHistory = JSON.parse(localStorage.getItem('doc-version-history') || '[]');

  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay doc-version-diff-dialog';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:95vw;width:960px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;padding:0">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px">Version Compare / Diff</h3>
        <button id="vdiff-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-secondary)">&times;</button>
      </div>
      <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <label style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Compare with</label>
          <select id="vdiff-source" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);margin-top:4px">
            <option value="paste">Paste / Upload text</option>
            ${versionHistory.map((v, i) => `<option value="v-${i}">Version ${i + 1} -- ${new Date(v.timestamp).toLocaleString()}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end">
          <button id="vdiff-upload" class="toolbar-btn" style="padding:4px 12px;font-size:12px">Upload File</button>
          <input type="file" id="vdiff-file-input" accept=".txt,.html,.htm,.md" style="display:none">
          <button id="vdiff-run" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:12px;font-weight:600">Compare</button>
        </div>
      </div>
      <div id="vdiff-paste-area" style="padding:8px 20px;border-bottom:1px solid var(--border-color)">
        <textarea id="vdiff-input" style="width:100%;height:80px;padding:8px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);resize:vertical;box-sizing:border-box" placeholder="Paste comparison text here..."></textarea>
      </div>
      <div id="vdiff-stats" style="padding:8px 20px;border-bottom:1px solid var(--border-color);font-size:12px;color:var(--text-secondary);display:none">
        <span class="vdiff-stat-additions" style="background:#d4edda;padding:2px 8px;border-radius:4px;margin-right:8px">0 additions</span>
        <span class="vdiff-stat-deletions" style="background:#f8d7da;padding:2px 8px;border-radius:4px;margin-right:8px">0 deletions</span>
        <span class="vdiff-stat-modifications" style="background:#fff3cd;padding:2px 8px;border-radius:4px">0 modifications</span>
      </div>
      <div id="vdiff-result" style="flex:1;overflow:auto;display:none">
        <div style="display:flex;height:100%;min-height:300px">
          <div id="vdiff-left" class="vdiff-pane" style="flex:1;overflow:auto;padding:16px;border-right:1px solid var(--border-color)">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px">Current Document</div>
            <div id="vdiff-left-content" style="font-size:13px;line-height:1.8"></div>
          </div>
          <div id="vdiff-right" class="vdiff-pane" style="flex:1;overflow:auto;padding:16px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px">Previous Version</div>
            <div id="vdiff-right-content" style="font-size:13px;line-height:1.8"></div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(dlg);

  const sourceSelect = dlg.querySelector('#vdiff-source');
  const pasteArea = dlg.querySelector('#vdiff-paste-area');
  const fileInput = dlg.querySelector('#vdiff-file-input');

  sourceSelect.addEventListener('change', () => {
    pasteArea.style.display = sourceSelect.value === 'paste' ? '' : 'none';
    if (sourceSelect.value.startsWith('v-')) {
      const idx = parseInt(sourceSelect.value.split('-')[1]);
      dlg.querySelector('#vdiff-input').value = versionHistory[idx]?.content || '';
    }
  });

  dlg.querySelector('#vdiff-upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) {
      dlg.querySelector('#vdiff-input').value = await file.text();
    }
  });

  dlg.querySelector('#vdiff-close').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelector('#vdiff-run').addEventListener('click', () => {
    const compareText = dlg.querySelector('#vdiff-input').value;
    if (!compareText.trim()) return;

    const currentText = editorEl?.innerText || '';
    const currentLines = currentText.split('\n').filter(l => l.trim());
    const compareLines = compareText.split('\n').filter(l => l.trim());

    const diff = computeLineDiff(currentLines, compareLines);

    let leftHtml = '', rightHtml = '';
    let additions = 0, deletions = 0, modifications = 0;

    diff.forEach(d => {
      if (d.type === 'same') {
        leftHtml += `<div class="vdiff-line vdiff-same">${escapeHtml(d.left)}</div>`;
        rightHtml += `<div class="vdiff-line vdiff-same">${escapeHtml(d.right)}</div>`;
      } else if (d.type === 'add') {
        leftHtml += `<div class="vdiff-line vdiff-empty">&nbsp;</div>`;
        rightHtml += `<div class="vdiff-line vdiff-addition">${escapeHtml(d.right)}</div>`;
        additions++;
      } else if (d.type === 'remove') {
        leftHtml += `<div class="vdiff-line vdiff-deletion">${escapeHtml(d.left)}</div>`;
        rightHtml += `<div class="vdiff-line vdiff-empty">&nbsp;</div>`;
        deletions++;
      } else if (d.type === 'modify') {
        leftHtml += `<div class="vdiff-line vdiff-modification">${highlightWordChanges(d.left, d.right, 'old')}</div>`;
        rightHtml += `<div class="vdiff-line vdiff-modification">${highlightWordChanges(d.left, d.right, 'new')}</div>`;
        modifications++;
      }
    });

    dlg.querySelector('#vdiff-left-content').innerHTML = leftHtml;
    dlg.querySelector('#vdiff-right-content').innerHTML = rightHtml;
    dlg.querySelector('#vdiff-result').style.display = '';
    dlg.querySelector('#vdiff-stats').style.display = '';
    dlg.querySelector('.vdiff-stat-additions').textContent = `${additions} additions`;
    dlg.querySelector('.vdiff-stat-deletions').textContent = `${deletions} deletions`;
    dlg.querySelector('.vdiff-stat-modifications').textContent = `${modifications} modifications`;

    // Sync scroll
    const leftPane = dlg.querySelector('#vdiff-left');
    const rightPane = dlg.querySelector('#vdiff-right');
    let syncing = false;
    leftPane.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      rightPane.scrollTop = leftPane.scrollTop;
      syncing = false;
    });
    rightPane.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      leftPane.scrollTop = rightPane.scrollTop;
      syncing = false;
    });
  });
}

function computeLineDiff(currentLines, compareLines) {
  const result = [];
  const m = currentLines.length;
  const n = compareLines.length;

  if (m * n > 25000000) {
    const cSet = new Set(currentLines);
    const pSet = new Set(compareLines);
    currentLines.forEach(l => {
      if (pSet.has(l)) result.push({ type: 'same', left: l, right: l });
      else result.push({ type: 'remove', left: l, right: '' });
    });
    compareLines.forEach(l => {
      if (!cSet.has(l)) result.push({ type: 'add', left: '', right: l });
    });
    return result;
  }

  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = currentLines[i - 1] === compareLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  let i = m, j = n;
  const parts = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && currentLines[i - 1] === compareLines[j - 1]) {
      parts.unshift({ type: 'same', left: currentLines[i - 1], right: compareLines[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      if (i > 0 && dp[i - 1][j - 1] >= dp[i][j - 1] - 1) {
        const similarity = computeSimilarity(currentLines[i - 1], compareLines[j - 1]);
        if (similarity > 0.4) {
          parts.unshift({ type: 'modify', left: currentLines[i - 1], right: compareLines[j - 1] });
          i--; j--;
          continue;
        }
      }
      parts.unshift({ type: 'add', left: '', right: compareLines[j - 1] });
      j--;
    } else {
      parts.unshift({ type: 'remove', left: currentLines[i - 1], right: '' });
      i--;
    }
  }

  return parts;
}

function computeSimilarity(a, b) {
  if (!a || !b) return 0;
  const aWords = a.split(/\s+/);
  const bWords = new Set(b.split(/\s+/));
  let common = 0;
  aWords.forEach(w => { if (bWords.has(w)) common++; });
  return common / Math.max(aWords.length, bWords.size);
}

function highlightWordChanges(oldLine, newLine, side) {
  const oldWords = oldLine.split(/(\s+)/);
  const newWords = newLine.split(/(\s+)/);
  const oldSet = new Set(oldWords.filter(w => w.trim()));
  const newSet = new Set(newWords.filter(w => w.trim()));

  if (side === 'old') {
    return oldWords.map(w => {
      if (!w.trim()) return escapeHtml(w);
      return newSet.has(w) ? escapeHtml(w) : `<span class="vdiff-word-del">${escapeHtml(w)}</span>`;
    }).join('');
  } else {
    return newWords.map(w => {
      if (!w.trim()) return escapeHtml(w);
      return oldSet.has(w) ? escapeHtml(w) : `<span class="vdiff-word-add">${escapeHtml(w)}</span>`;
    }).join('');
  }
}

export function saveVersionSnapshot() {
  if (!editorEl) return;
  const history = JSON.parse(localStorage.getItem('doc-version-history') || '[]');
  history.push({
    content: editorEl.innerText,
    html: editorEl.innerHTML,
    timestamp: Date.now(),
    wordCount: getWordCount()
  });
  if (history.length > 20) history.splice(0, history.length - 20);
  localStorage.setItem('doc-version-history', JSON.stringify(history));
}

function getWordCount() {
  if (!editorEl) return 0;
  const text = editorEl.innerText || '';
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/* ==================== Feature: Smart Styles (Enhanced) ==================== */

const SMART_STYLES = [
  { name: 'Title', tag: 'h1', css: 'font-size:32px;font-weight:800;color:var(--text-primary);margin:0 0 4px;line-height:1.2;letter-spacing:-0.5px', preview: 'Title' },
  { name: 'Subtitle', tag: 'p', css: 'font-size:20px;font-weight:300;color:var(--text-secondary);margin:0 0 20px;line-height:1.4', preview: 'Subtitle text' },
  { name: 'Abstract', tag: 'div', css: 'font-size:14px;font-style:italic;color:var(--text-secondary);padding:16px 24px;margin:16px 0;border:1px solid var(--border-color);border-radius:8px;background:var(--sidebar-bg);line-height:1.7', preview: 'Abstract paragraph...' },
  { name: 'Block Quote', tag: 'blockquote', css: 'font-size:16px;font-style:italic;color:#555;border-left:4px solid var(--brand-color,#0071e3);padding:12px 20px;margin:16px 0;background:rgba(0,113,227,0.04);border-radius:0 8px 8px 0;line-height:1.7', preview: 'Quoted text...' },
  { name: 'Code Block', tag: 'pre', css: 'font-family:"SF Mono","Fira Code",monospace;font-size:13px;background:#1e1e2e;color:#cdd6f4;padding:16px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;margin:16px 0;line-height:1.5;overflow-x:auto', preview: 'code { ... }' },
  { name: 'Caption', tag: 'p', css: 'font-size:12px;color:var(--text-tertiary);text-align:center;font-style:italic;margin:4px 0 20px;line-height:1.5', preview: 'Figure 1: Caption text' },
  { name: 'List Paragraph', tag: 'div', css: 'font-size:15px;line-height:1.8;padding-left:24px;margin:8px 0;border-left:2px solid var(--border-color)', preview: 'Indented list paragraph' },
  { name: 'Heading 1', tag: 'h1', css: 'font-size:26px;font-weight:700;color:var(--brand-color,#0071e3);border-bottom:2px solid var(--brand-color,#0071e3);padding-bottom:6px;margin:28px 0 12px', preview: 'Heading 1' },
  { name: 'Heading 2', tag: 'h2', css: 'font-size:22px;font-weight:600;color:var(--text-primary);margin:24px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border-color)', preview: 'Heading 2' },
  { name: 'Heading 3', tag: 'h3', css: 'font-size:18px;font-weight:600;color:var(--text-primary);margin:20px 0 6px', preview: 'Heading 3' },
  { name: 'Lead Paragraph', tag: 'p', css: 'font-size:18px;font-weight:300;color:#444;line-height:1.8;margin:12px 0', preview: 'Lead paragraph text...' },
  { name: 'Highlight Box', tag: 'div', css: 'background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Important note...' },
  { name: 'Info Box', tag: 'div', css: 'background:#e3f2fd;border:1px solid #2196f3;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Information...' },
  { name: 'Success Box', tag: 'div', css: 'background:#e8f5e9;border:1px solid #4caf50;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Success message...' },
  { name: 'Danger Box', tag: 'div', css: 'background:#ffebee;border:1px solid #f44336;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Warning/danger...' },
];

const CUSTOM_STYLES_KEY = 'doc-custom-styles';

function getCustomStyles() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_STYLES_KEY) || '[]'); } catch { return []; }
}

function saveCustomStyles(styles) {
  localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify(styles));
}

function showSmartStyleGallery() {
  document.querySelector('.doc-smart-style-gallery')?.remove();

  const btn = document.getElementById('doc-smart-styles');
  const rect = btn?.getBoundingClientRect() || { bottom: 100, left: 100 };
  const customStyles = getCustomStyles();

  const gallery = document.createElement('div');
  gallery.className = 'doc-smart-style-gallery';
  gallery.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 380)}px;width:360px;max-height:500px;overflow-y:auto;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.18);z-index:2000;padding:0`;

  let html = `<div style="padding:12px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:700;font-size:14px;color:var(--text-primary)">Smart Styles</span>
    <button id="ssg-add-custom" style="border:none;background:var(--brand-color);color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600">+ Custom</button>
  </div>
  <div style="padding:8px">`;

  SMART_STYLES.forEach((s, i) => {
    const previewCss = s.css.replace(/font-size:\d+px/, 'font-size:13px').replace(/margin:[^;]+/g, 'margin:0').replace(/padding:[^;]+/g, 'padding:4px 8px');
    html += `<div class="ssg-item" data-idx="${i}" style="cursor:pointer;border-radius:6px;margin-bottom:2px;padding:6px 10px;transition:background 0.15s">
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">${s.name}</div>
      <div style="${previewCss};max-height:24px;overflow:hidden;pointer-events:none;border-radius:4px">${s.preview}</div>
    </div>`;
  });

  if (customStyles.length > 0) {
    html += `<div style="border-top:1px solid var(--border-color);margin:8px 0;padding-top:8px">
      <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;padding:0 10px">Custom Styles</div>`;
    customStyles.forEach((cs, i) => {
      const previewCss = cs.css.replace(/font-size:\d+px/, 'font-size:13px').replace(/margin:[^;]+/g, 'margin:0').replace(/padding:[^;]+/g, 'padding:4px 8px');
      html += `<div class="ssg-item ssg-custom" data-custom-idx="${i}" style="cursor:pointer;border-radius:6px;margin-bottom:2px;padding:6px 10px;transition:background 0.15s;display:flex;align-items:center;gap:8px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">${cs.name}</div>
          <div style="${previewCss};max-height:24px;overflow:hidden;pointer-events:none;border-radius:4px">${cs.name}</div>
        </div>
        <button class="ssg-delete-custom" data-cidx="${i}" style="border:none;background:none;color:#ef4444;cursor:pointer;font-size:14px;padding:4px" title="Delete">&times;</button>
      </div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  gallery.innerHTML = html;
  document.body.appendChild(gallery);

  gallery.querySelectorAll('.ssg-item:not(.ssg-custom)').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      applySmartStyle(SMART_STYLES[idx]);
      gallery.remove();
    });
  });

  gallery.querySelectorAll('.ssg-custom').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', (e) => {
      if (e.target.closest('.ssg-delete-custom')) return;
      const idx = parseInt(item.dataset.customIdx);
      if (customStyles[idx]) applySmartStyle(customStyles[idx]);
      gallery.remove();
    });
  });

  gallery.querySelectorAll('.ssg-delete-custom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.cidx);
      customStyles.splice(idx, 1);
      saveCustomStyles(customStyles);
      gallery.remove();
      showSmartStyleGallery();
    });
  });

  gallery.querySelector('#ssg-add-custom').addEventListener('click', (e) => {
    e.stopPropagation();
    gallery.remove();
    showCustomStyleEditor();
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!gallery.contains(e.target) && e.target !== btn) {
        gallery.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

function applySmartStyle(style) {
  editorEl?.focus();
  const placeholder = style.name === 'Code Block' ? 'code here...' : 'Type here...';
  const html = `<${style.tag} style="${style.css}">${placeholder}</${style.tag}>`;
  document.execCommand('insertHTML', false, html);
  dirty = true;
}

function showCustomStyleEditor() {
  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:420px">
      <h3 style="margin:0 0 12px">Create Custom Style</h3>
      <div style="margin-bottom:10px">
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Style Name</label>
        <input id="cs-name" type="text" placeholder="e.g. My Heading" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Font Family</label>
          <select id="cs-font" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="inherit">Default</option>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans-serif</option>
            <option value="monospace">Monospace</option>
            <option value="Georgia,serif">Georgia</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Font Size (px)</label>
          <input id="cs-size" type="number" value="16" min="8" max="72" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Text Color</label>
          <input id="cs-color" type="color" value="#333333" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:6px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">BG Color</label>
          <input id="cs-bg" type="color" value="#ffffff" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:6px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Border</label>
          <input id="cs-border" type="color" value="#cccccc" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:6px">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Line Height</label>
          <select id="cs-lh" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="1.2">1.2</option><option value="1.5">1.5</option><option value="1.6" selected>1.6</option><option value="1.8">1.8</option><option value="2.0">2.0</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Element</label>
          <select id="cs-tag" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="div">Block (div)</option><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Blockquote</option><option value="pre">Preformatted</option>
          </select>
        </div>
      </div>
      <div id="cs-preview" style="border:1px solid var(--border-color);border-radius:6px;padding:12px;margin-bottom:12px;min-height:40px">
        <div id="cs-preview-text">Preview text</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="cs-cancel" style="padding:6px 16px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px">Cancel</button>
        <button id="cs-save" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Save Style</button>
      </div>
    </div>`;

  document.body.appendChild(dlg);

  const buildCustomCSS = () => {
    const font = dlg.querySelector('#cs-font').value;
    const size = dlg.querySelector('#cs-size').value;
    const color = dlg.querySelector('#cs-color').value;
    const bg = dlg.querySelector('#cs-bg').value;
    const border = dlg.querySelector('#cs-border').value;
    const lh = dlg.querySelector('#cs-lh').value;
    let css = `font-family:${font};font-size:${size}px;color:${color};line-height:${lh};padding:8px;margin:12px 0`;
    if (bg !== '#ffffff') css += `;background:${bg};border-radius:8px`;
    if (border !== '#cccccc') css += `;border:1px solid ${border}`;
    return css;
  };

  const updatePreview = () => {
    const previewText = dlg.querySelector('#cs-preview-text');
    previewText.style.cssText = buildCustomCSS();
    previewText.textContent = dlg.querySelector('#cs-name').value || 'Preview text';
  };

  dlg.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
  });
  updatePreview();

  dlg.querySelector('#cs-cancel').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelector('#cs-save').addEventListener('click', () => {
    const name = dlg.querySelector('#cs-name').value.trim();
    if (!name) { alert('Please enter a style name'); return; }
    const tag = dlg.querySelector('#cs-tag').value;
    const css = buildCustomCSS();
    const customs = getCustomStyles();
    customs.push({ name, tag, css, preview: name });
    saveCustomStyles(customs);
    dlg.remove();
  });
}

/* ==================== Feature: Document Outline Navigator (Right Sidebar) ==================== */

let outlineNavVisible = false;

function toggleDocOutlineNav() {
  const panel = document.getElementById('doc-outline-nav-panel');
  if (!panel) return;
  outlineNavVisible = !outlineNavVisible;
  panel.classList.toggle('hidden', !outlineNavVisible);
  if (outlineNavVisible) updateDocOutlineNav();
}

function updateDocOutlineNav() {
  const list = document.getElementById('doc-outline-nav-list');
  if (!list || !editorEl) return;

  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (!headings.length) {
    list.innerHTML = '<div style="padding:16px;color:var(--text-tertiary);font-size:12px;text-align:center">No headings found.<br>Add headings (H1-H6) to see<br>the document structure.</div>';
    return;
  }

  const pageWrapper = editorEl.closest('.doc-page-wrapper');
  let currentHeadingIdx = 0;
  if (pageWrapper) {
    const wrapperRect = pageWrapper.getBoundingClientRect();
    headings.forEach((h, idx) => {
      const hRect = h.getBoundingClientRect();
      if (hRect.top - wrapperRect.top < wrapperRect.height * 0.3) {
        currentHeadingIdx = idx;
      }
    });
  }

  list.innerHTML = '';

  headings.forEach((h, idx) => {
    const level = parseInt(h.tagName[1]);
    if (!h.id) h.id = `outline-nav-h-${idx}`;

    const item = document.createElement('div');
    item.className = 'doc-outline-nav-item';
    item.dataset.level = level;
    item.dataset.idx = idx;
    if (idx === currentHeadingIdx) item.classList.add('active');

    // Check if has children
    const hasChildren = Array.from(headings).slice(idx + 1).some(nextH => {
      const nextLevel = parseInt(nextH.tagName[1]);
      if (nextLevel <= level) return false;
      return true;
    });

    item.innerHTML = `
      <span class="outline-nav-toggle" style="width:14px;display:inline-block;text-align:center;font-size:10px;cursor:pointer;color:var(--text-tertiary)">${hasChildren ? '&#9660;' : '&nbsp;'}</span>
      <span class="outline-nav-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.textContent || 'Untitled'}</span>
      <span class="outline-nav-drag" draggable="true" style="cursor:grab;color:var(--text-tertiary);font-size:10px;opacity:0;transition:opacity 0.15s" title="Drag to reorder">&#x2630;</span>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('outline-nav-toggle')) {
        toggleOutlineChildren(item, headings, idx, level);
        return;
      }
      h.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origBg = h.style.background;
      h.style.background = 'rgba(59, 130, 246, 0.15)';
      h.style.borderRadius = '4px';
      h.style.transition = 'background 0.3s';
      setTimeout(() => { h.style.background = origBg; h.style.borderRadius = ''; }, 2000);
      list.querySelectorAll('.doc-outline-nav-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
    });

    item.addEventListener('mouseenter', () => {
      const drag = item.querySelector('.outline-nav-drag');
      if (drag) drag.style.opacity = '1';
    });
    item.addEventListener('mouseleave', () => {
      const drag = item.querySelector('.outline-nav-drag');
      if (drag) drag.style.opacity = '0';
    });

    // Drag reorder
    const dragHandle = item.querySelector('.outline-nav-drag');
    if (dragHandle) {
      setupOutlineDrag(dragHandle, item, h, headings, idx, level, list);
    }

    list.appendChild(item);
  });

  // Listen for scroll to update active heading
  if (pageWrapper && !pageWrapper._outlineNavScrollListener) {
    pageWrapper._outlineNavScrollListener = true;
    pageWrapper.addEventListener('scroll', () => {
      if (outlineNavVisible) {
        requestAnimationFrame(() => highlightCurrentHeading(list, headings, pageWrapper));
      }
    });
  }
}

function highlightCurrentHeading(list, headings, pageWrapper) {
  const wrapperRect = pageWrapper.getBoundingClientRect();
  let activeIdx = 0;
  headings.forEach((h, idx) => {
    const hRect = h.getBoundingClientRect();
    if (hRect.top - wrapperRect.top < wrapperRect.height * 0.3) {
      activeIdx = idx;
    }
  });
  list.querySelectorAll('.doc-outline-nav-item').forEach((el, i) => {
    el.classList.toggle('active', i === activeIdx);
  });
  const activeItem = list.querySelector('.doc-outline-nav-item.active');
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
}

function toggleOutlineChildren(item, headings, idx, level) {
  const toggle = item.querySelector('.outline-nav-toggle');
  const isCollapsed = toggle.textContent.trim() === '\u25B6';
  toggle.innerHTML = isCollapsed ? '&#9660;' : '&#9654;';

  let sibling = item.nextElementSibling;
  while (sibling) {
    const sibLevel = parseInt(sibling.dataset.level);
    if (sibLevel <= level) break;
    sibling.style.display = isCollapsed ? '' : 'none';
    sibling = sibling.nextElementSibling;
  }
}

function setupOutlineDrag(dragHandle, item, heading, headings, idx, level, list) {
  dragHandle.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    item.classList.add('dragging');
  });

  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    item.classList.add('drag-over');
  });

  item.addEventListener('dragleave', () => {
    item.classList.remove('drag-over');
  });

  item.addEventListener('drop', (e) => {
    e.preventDefault();
    item.classList.remove('drag-over');
    const srcIdx = parseInt(e.dataTransfer.getData('text/plain'));
    const destIdx = parseInt(item.dataset.idx);
    if (srcIdx === destIdx || isNaN(srcIdx) || isNaN(destIdx)) return;

    moveHeadingBlock(headings, srcIdx, destIdx);
    updateDocOutlineNav();
    dirty = true;
  });

  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
}

function moveHeadingBlock(headings, srcIdx, destIdx) {
  const srcHeading = headings[srcIdx];
  const destHeading = headings[destIdx];
  if (!srcHeading || !destHeading || !editorEl) return;

  const srcLevel = parseInt(srcHeading.tagName[1]);

  const elements = [srcHeading];
  let sibling = srcHeading.nextElementSibling;
  while (sibling) {
    if (/^H[1-6]$/i.test(sibling.tagName) && parseInt(sibling.tagName[1]) <= srcLevel) break;
    elements.push(sibling);
    sibling = sibling.nextElementSibling;
  }

  const frag = document.createDocumentFragment();
  elements.forEach(el => frag.appendChild(el));

  if (srcIdx < destIdx) {
    let insertAfter = destHeading;
    let next = destHeading.nextElementSibling;
    const destLevel = parseInt(destHeading.tagName[1]);
    while (next) {
      if (/^H[1-6]$/i.test(next.tagName) && parseInt(next.tagName[1]) <= destLevel) break;
      insertAfter = next;
      next = next.nextElementSibling;
    }
    insertAfter.after(frag);
  } else {
    destHeading.before(frag);
  }
}

/* ==================== Feature: Word Count Goals & Writing Stats ==================== */

function updateWritingStreak() {
  const streakData = JSON.parse(localStorage.getItem(WRITING_STREAK_KEY) || '{"dates":[],"currentStreak":0,"bestStreak":0}');
  const today = new Date().toISOString().slice(0, 10);

  if (!streakData.dates.includes(today)) {
    streakData.dates.push(today);

    const sorted = [...new Set(streakData.dates)].sort().reverse();
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diff = (prev - curr) / (1000 * 60 * 60 * 24);
      if (diff === 1) streak++;
      else break;
    }
    streakData.currentStreak = streak;
    if (streak > (streakData.bestStreak || 0)) streakData.bestStreak = streak;

    localStorage.setItem(WRITING_STREAK_KEY, JSON.stringify(streakData));
  }

  return streakData;
}

function showWritingStatsDialog() {
  document.querySelector('.doc-writing-stats-dialog')?.remove();

  const text = editorEl?.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const streakData = updateWritingStreak();

  const sessionDuration = Math.round((Date.now() - sessionStartTime) / 1000);
  const sessionMinutes = Math.max(1, Math.round(sessionDuration / 60));
  const sessionWords = Math.max(0, words - sessionWordCountStart);
  const wpm = sessionMinutes > 0 ? Math.round(sessionWords / sessionMinutes) : 0;

  let totalEditTime = parseInt(localStorage.getItem('doc-total-edit-time') || '0');
  totalEditTime += sessionDuration;
  localStorage.setItem('doc-total-edit-time', String(totalEditTime));

  const totalHours = Math.floor(totalEditTime / 3600);
  const totalMins = Math.floor((totalEditTime % 3600) / 60);

  const goalPct = wordGoal > 0 ? Math.min(100, Math.round((words / wordGoal) * 100)) : 0;

  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay doc-writing-stats-dialog';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:480px;padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px">Writing Stats & Goals</h3>
        <button id="ws-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-secondary)">&times;</button>
      </div>
      <div style="padding:16px 20px">
        ${wordGoal > 0 ? `
        <div style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Word Goal Progress</span>
            <span style="font-size:14px;font-weight:700;color:${goalPct >= 100 ? '#34a853' : 'var(--brand-color)'}">${goalPct}%</span>
          </div>
          <div style="height:8px;background:var(--border-color);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${goalPct}%;background:${goalPct >= 100 ? '#34a853' : 'var(--brand-color)'};border-radius:4px;transition:width 0.5s"></div>
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">${words.toLocaleString()} / ${wordGoal.toLocaleString()} words ${goalPct >= 100 ? '-- Goal reached!' : `-- ${(wordGoal - words).toLocaleString()} to go`}</div>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
          <div style="background:var(--sidebar-bg);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--text-primary)">${streakData.currentStreak}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Day Streak</div>
          </div>
          <div style="background:var(--sidebar-bg);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--text-primary)">${streakData.bestStreak || streakData.currentStreak}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Best Streak</div>
          </div>
          <div style="background:var(--sidebar-bg);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--text-primary)">${streakData.dates.length}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Days Active</div>
          </div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:16px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">This Session</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Duration</span><span style="font-weight:600">${sessionMinutes} min</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Words written</span><span style="font-weight:600">${sessionWords.toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Words/min</span><span style="font-weight:600">${wpm}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Total words</span><span style="font-weight:600">${words.toLocaleString()}</span></div>
          </div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:16px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">All-Time</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Total editing time</span><span style="font-weight:600">${totalHours > 0 ? `${totalHours}h ` : ''}${totalMins}m</span></div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:12px">
          <div style="display:flex;gap:8px;align-items:center">
            <label style="font-size:12px;font-weight:600;white-space:nowrap">Set word goal:</label>
            <input id="ws-goal-input" type="number" value="${wordGoal || ''}" placeholder="e.g. 1000" min="0" style="flex:1;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <button id="ws-goal-set" style="padding:5px 12px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:12px;font-weight:600">Set</button>
            ${wordGoal > 0 ? `<button id="ws-goal-clear" style="padding:5px 12px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:12px">Clear</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(dlg);

  dlg.querySelector('#ws-close').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelector('#ws-goal-set').addEventListener('click', () => {
    wordGoal = parseInt(dlg.querySelector('#ws-goal-input').value) || 0;
    updateWordCount();
    dlg.remove();
  });

  dlg.querySelector('#ws-goal-clear')?.addEventListener('click', () => {
    wordGoal = 0;
    updateWordCount();
    dlg.remove();
  });
}
