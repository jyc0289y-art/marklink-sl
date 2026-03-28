// OfficeLink SL — Document Editor Shared State
// All module-level mutable state variables live here so sub-modules can share them.

import { t } from '../ui/i18n.js';
import { escapeHtml } from '../utils/sanitize.js';

// Re-export dependencies so sub-modules can import from one place
export { t, escapeHtml };

// ─── Core state ─────────────────────────────────────────────
export let editorEl = null;
export let dirty = false;
export let outlineVisible = false;
export let docEditorInitialized = false;

export function setEditorEl(el) { editorEl = el; }
export function setDirty(val) { dirty = val; }
export function setOutlineVisible(val) { outlineVisible = val; }
export function setDocEditorInitialized(val) { docEditorInitialized = val; }

// ─── Auto-save state ────────────────────────────────────────
export let autoSaveInterval = null;
export const AUTO_SAVE_KEY = 'doc-autosave-content';
export const AUTO_SAVE_TS_KEY = 'doc-autosave-timestamp';
export const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

export function setAutoSaveInterval(val) { autoSaveInterval = val; }

// ─── Word count goals & session tracking ────────────────────
export const WRITING_STREAK_KEY = 'doc-writing-streak';
export const SESSION_START_KEY = 'doc-session-start';
export let sessionStartTime = Date.now();
export let sessionWordCountStart = 0;
export let wordsPerMinuteTracker = { lastCheck: Date.now(), lastWords: 0, wpm: 0 };
export let wordGoal = 0;

export function setSessionStartTime(val) { sessionStartTime = val; }
export function setSessionWordCountStart(val) { sessionWordCountStart = val; }
export function setWordGoal(val) { wordGoal = val; }

// ─── Auto-correct state ────────────────────────────────────
export let autoCorrectEnabled = false;
export const AUTO_CORRECT_MAP = {
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
export const AUTO_CORRECT_KEY = 'doc-autocorrect-enabled';

export function setAutoCorrectEnabled(val) { autoCorrectEnabled = val; }

// ─── Event handler tracking ─────────────────────────────────
export const _docHandlers = [];
export const _docIntervals = [];
export let _visibilityHandler = null;

export function setVisibilityHandler(val) { _visibilityHandler = val; }

export function _addHandler(el, event, fn) {
  if (!el) return;
  el.addEventListener(event, fn);
  _docHandlers.push({ el, event, fn });
}

// ─── Find / Replace state ───────────────────────────────────
export let findBarEl = null;
export let findInput = null;
export let replaceInput = null;
export let highlightedNodes = [];
export let findUseRegex = false;
export let findMatchCase = false;
export let findWholeWord = false;
export let findCurrentIndex = 0;

export function setFindBarEl(val) { findBarEl = val; }
export function setFindInput(val) { findInput = val; }
export function setReplaceInput(val) { replaceInput = val; }
export function setHighlightedNodes(val) { highlightedNodes = val; }
export function setFindUseRegex(val) { findUseRegex = val; }
export function setFindMatchCase(val) { findMatchCase = val; }
export function setFindWholeWord(val) { findWholeWord = val; }
export function setFindCurrentIndex(val) { findCurrentIndex = val; }

// ─── Page break indicator state ─────────────────────────────
export let pageBreakObserver = null;
export let pageBreakDebounceTimer = null;

export function setPageBreakObserver(val) { pageBreakObserver = val; }
export function setPageBreakDebounceTimer(val) { pageBreakDebounceTimer = val; }

// ─── Table toolbar state ────────────────────────────────────
export let activeTableToolbar = null;
export function setActiveTableToolbar(val) { activeTableToolbar = val; }

// ─── Page setup state ───────────────────────────────────────
export const PAGE_SIZES = {
  'A4':      { w: 210, h: 297, label: 'A4 (210 × 297 mm)' },
  'A3':      { w: 297, h: 420, label: 'A3 (297 × 420 mm)' },
  'B5':      { w: 176, h: 250, label: 'B5 (176 × 250 mm)' },
  'Letter':  { w: 215.9, h: 279.4, label: 'Letter (8.5 × 11 in)' },
  'Legal':   { w: 215.9, h: 355.6, label: 'Legal (8.5 × 14 in)' },
  '16K':     { w: 195, h: 270, label: '16절 (195 × 270 mm)' },
  'Custom':  { w: 210, h: 297, label: 'Custom' },
};

export let currentPageSize = 'A4';
export let currentOrientation = 'portrait';
export let currentMargins = { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 };
export let currentApplyTo = 'whole';

export function setCurrentPageSize(val) { currentPageSize = val; }
export function setCurrentOrientation(val) { currentOrientation = val; }
export function setCurrentMargins(val) { currentMargins = val; }
export function setCurrentApplyTo(val) { currentApplyTo = val; }

// ─── Page numbers state ─────────────────────────────────────
export let pageNumbersEnabled = false;
export function setPageNumbersEnabled(val) { pageNumbersEnabled = val; }

// ─── Header/Footer state ────────────────────────────────────
export let hfConfig = {
  headerText: '', footerText: '',
  headerHeight: 28, footerHeight: 28,
  differentFirstPage: false,
  differentOddEven: false,
  firstPageHeader: '', firstPageFooter: '',
  oddHeader: '', oddFooter: '',
  evenHeader: '', evenFooter: '',
};
export function setHfConfig(val) { hfConfig = val; }

// ─── Footnotes / Endnotes state ─────────────────────────────
export let footnoteCounter = 0;
export let endnoteCounter = 0;
export function setFootnoteCounter(val) { footnoteCounter = val; }
export function setEndnoteCounter(val) { endnoteCounter = val; }

// ─── Comments state ─────────────────────────────────────────
export let comments = [];
export let commentCounter = 0;
export let commentsPanelVisible = false;

export function setComments(val) { comments = val; }
export function setCommentCounter(val) { commentCounter = val; }
export function setCommentsPanelVisible(val) { commentsPanelVisible = val; }

// ─── Track changes state ────────────────────────────────────
export let trackChangesEnabled = false;
export let trackChangesList = [];
export let trackChangeId = 0;
export let changesPanelVisible = false;

export function setTrackChangesEnabled(val) { trackChangesEnabled = val; }
export function setTrackChangesList(val) { trackChangesList = val; }
export function setTrackChangeId(val) { trackChangeId = val; }
export function incrTrackChangeId() { return ++trackChangeId; }
export function setChangesPanelVisible(val) { changesPanelVisible = val; }

// ─── Bookmarks state ────────────────────────────────────────
export let bookmarks = [];
export function setBookmarks(val) { bookmarks = val; }

// ─── Image resize state ─────────────────────────────────────
export let activeResizeImg = null;
export function setActiveResizeImg(val) { activeResizeImg = val; }

// ─── Focus / Reading mode state ─────────────────────────────
export let focusModeActive = false;
export let focusModeOverlay = null;
export let readingModeActive = false;
export let readingModeOverlay = null;

export function setFocusModeActive(val) { focusModeActive = val; }
export function setFocusModeOverlay(val) { focusModeOverlay = val; }
export function setReadingModeActive(val) { readingModeActive = val; }
export function setReadingModeOverlay(val) { readingModeOverlay = val; }

// ─── Drag reorder state ─────────────────────────────────────
export let dragReorderEnabled = false;
export let dragSrcEl = null;

export function setDragReorderEnabled(val) { dragReorderEnabled = val; }
export function setDragSrcEl(val) { dragSrcEl = val; }

// ─── Outline nav state ──────────────────────────────────────
export let outlineNavVisible = false;
export function setOutlineNavVisible(val) { outlineNavVisible = val; }

// ─── Spell check state ──────────────────────────────────────
export let spellCheckEnabled = false;
export let spellCheckMarks = [];

export function setSpellCheckEnabled(val) { spellCheckEnabled = val; }
export function setSpellCheckMarks(val) { spellCheckMarks = val; }

// ─── Shared helpers ─────────────────────────────────────────

export function insertHTMLAtCursor(html) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const frag = range.createContextualFragment(html);
  range.insertNode(frag);
  sel.collapseToEnd();
}

export function buildTable(rows, cols) {
  const cellStyle = 'border:1px solid var(--border-color);padding:8px 12px';
  let html = '<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead><tr>';
  for (let c = 0; c < cols; c++) html += `<th style="${cellStyle};font-weight:600;background:rgba(0,0,0,0.05)">Header ${c + 1}</th>`;
  html += '</tr></thead><tbody>';
  for (let r = 0; r < rows - 1; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) html += `<td style="${cellStyle}">&nbsp;</td>`;
    html += '</tr>';
  }
  html += '</tbody></table><p>&nbsp;</p>';
  return html;
}

export function showTableInsertDialog(onInsert) {
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
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { overlay.querySelector('#tbl-ok').click(); }
    if (e.key === 'Escape') { close(); }
  });
}
