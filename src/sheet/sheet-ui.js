// OfficeLink SL — Sheet UI (orchestrator — imports sub-modules, binds events, re-exports)

import {
  createSheetData, getCell, setCell as _setCell, setCellFormat,
  getDisplayValue, getRawValue, colToLetter, rcToRef, refToRC,
  addRows, addCols, deleteRow, deleteCol, recalcAll as _recalcAll,
  setCellArrayFormula as _setCellArrayFormula,
} from './sheet-engine.js';
import { t } from '../ui/i18n.js';
import { escapeHtml } from '../utils/sanitize.js';

import S from './sheet-state.js';
import {
  getSheet, renderGrid, renderCell, cellStyle, initResize,
  getSelectionRange, getColWidth, getRowHeight,
  hideSelectedRows, hideSelectedCols, showAllRows, showAllCols,
  scrollIntoView, setGridDeps, setUpdateSelection as setGridUpdateSelection,
  _syncSheetDimensions,
} from './sheet-grid.js';
import {
  moveSelection, startEdit, commitEdit, cancelEdit,
  getCellInput,
  pushUndoEntry, pushBulkUndo, saveUndoState,
  sheetUndo, sheetRedo,
  copySelection, pasteSelection, clearSelection,
  adjustFormulaReferences,
  insertCellReference, updateRangeReference, highlightRefCell,
  showAutocomplete, hideAutocomplete, handleAcKeydown,
  highlightFormulaRefs, clearFormulaRefHighlights, toggleAbsoluteRef,
  setEditDeps,
} from './sheet-edit.js';
import {
  updateFreezeButtonState, showFreezeDialog, applyFreezeStyles,
  sortColumn, getSheetName, renderSheetTabs, showTabContextMenu,
  executeFill,
  toggleMerge, showCondFmtDialog, getCondFmtStyle,
  toggleFilter, showFilterDropdown,
  showSheetFindReplace, showCellContextMenu,
  showDvNotification, checkDataValidation, showDvDropdown, showDataValidationDialog,
  removeDuplicates, textToColumns,
  printSheet, buildPrintTableHTML, buildPrintCSS, printCellStyle,
  insertSparkline,
  addCellNote,
  importCSV, exportCSV, exportXLSX,
  showChartDialog, refreshChartWidgets,
  toggleMergeCells, showConditionalFormatDialog, applyConditionalFormatting,
  showGoalSeekDialog, showSubtotalsDialog,
  transposeSelection, showMultiSortDialog,
  showNamedRangeDialog,
  showPivotTableDialog, refreshPivotTable,
  toggleGroupRows, toggleGroupCollapse,
  flashFill,
  insertCellHyperlink, toggleCellLock,
  toggleSheetProtection, isCellEditable,
  showBorderMenu,
  showCondFormatRulesManager,
  toggleSheetFindReplace, initSheetFindReplace,
  applyIconSets,
  toggleBandedRows,
  tracePrecedents, traceDependents, clearTraceArrows,
  showCommentPanel, hasComment,
  showSlicerDialog,
  showExportDialog,
  renderSparklineCanvases,
  initNamedRangeSelector,
  _saveSheetState, _loadSheetState,
  setFeaturesDeps,
} from './sheet-features.js';

// Wrappers that pass all sheets for cross-sheet reference support
function setCell(sheet, r, c, rawValue) { _setCell(sheet, r, c, rawValue, S.sheets); }
function recalcAll(sheet) { _recalcAll(sheet, S.sheets); }

// --- Memory leak prevention: tracked document-level listeners ---
const _sheetDocListeners = [];
function _trackDocListener(event, handler, options) {
  document.addEventListener(event, handler, options);
  _sheetDocListeners.push({ event, handler, options });
}

/* ==================== Dependency Wiring ==================== */

function wireModuleDeps() {
  // Wire grid module deps
  setGridDeps({
    applyFreezeStyles: () => applyFreezeStyles(),
    applyConditionalFormatting: () => applyConditionalFormatting(),
    applyIconSets: () => applyIconSets(),
    renderSparklineCanvases: () => renderSparklineCanvases(),
    getCondFmtStyle: (r, c) => getCondFmtStyle(r, c),
    hasComment: (r, c) => hasComment(r, c),
    trackDocListener: _trackDocListener,
  });

  // Wire edit module deps
  setEditDeps({
    renderGrid: () => renderGrid(),
    updateSelection: () => updateSelection(),
    refreshChartWidgets: () => refreshChartWidgets(),
    isCellEditable: (r, c) => isCellEditable(r, c),
    checkDataValidation: (rule, val) => checkDataValidation(rule, val),
    showDvNotification: (msg, type) => showDvNotification(msg, type),
  });

  // Wire features module deps
  setFeaturesDeps({
    updateSelection: () => updateSelection(),
  });

  // Wire grid's updateSelection
  setGridUpdateSelection(() => updateSelection());
}

/* ==================== Init ==================== */

export function initSheetEditor() {
  S.gridEl = document.getElementById('sheet-grid');
  S.cellRefEl = document.getElementById('sheet-cell-ref');
  S.formulaBarEl = document.getElementById('sheet-formula-bar');
  S.containerEl = document.getElementById('sheet-container');
  if (!S.gridEl) return;

  wireModuleDeps();
  renderGrid();
  bindEvents();
  initResize();
  updateSelection();
  initNamedRangeSelector();
}

/* ==================== Selection & Status ==================== */

function updateSelection() {
  S.gridEl.querySelectorAll('.selected, .in-range, .fill-preview').forEach((el) => {
    el.classList.remove('selected', 'in-range', 'fill-preview');
  });

  // Remove old fill handle
  S.gridEl.querySelector('.fill-handle')?.remove();

  const { r1, r2, c1, c2 } = getSelectionRange();
  const isRange = r1 !== r2 || c1 !== c2;

  if (isRange) {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const td = S.gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (td) td.classList.add('in-range');
      }
    }
  }

  const td = S.gridEl.querySelector(`td[data-row="${S.selectedRow}"][data-col="${S.selectedCol}"]`);
  if (td) {
    td.classList.add('selected');

    const anchorTd = isRange
      ? S.gridEl.querySelector(`td[data-row="${r2}"][data-col="${c2}"]`)
      : td;
    if (anchorTd) {
      const handle = document.createElement('div');
      handle.className = 'fill-handle';
      anchorTd.appendChild(handle);
    }
  }

  if (S.cellRefEl) {
    S.cellRefEl.textContent = isRange
      ? `${rcToRef(r1, c1)}:${rcToRef(r2, c2)}`
      : rcToRef(S.selectedRow, S.selectedCol);
  }

  if (S.formulaBarEl && document.activeElement !== S.formulaBarEl && !S.isEditing) {
    const cell = getCell(getSheet(), S.selectedRow, S.selectedCol);
    if (cell?.format?.isArrayFormula && cell.raw.startsWith('=')) {
      S.formulaBarEl.value = `{${cell.raw}}`;
    } else if (cell?.format?.spillSource) {
      S.formulaBarEl.value = cell.raw || '';
    } else {
      S.formulaBarEl.value = getRawValue(getSheet(), S.selectedRow, S.selectedCol);
    }
  }

  // Update toolbar state
  const selCell = getCell(getSheet(), S.selectedRow, S.selectedCol);
  const fmt = selCell?.format || {};
  const boldBtn = document.getElementById('sheet-bold');
  const italicBtn = document.getElementById('sheet-italic');
  const underlineBtn = document.getElementById('sheet-underline');
  const wrapBtn = document.getElementById('sheet-wrap');
  if (boldBtn) boldBtn.style.background = fmt.bold ? 'var(--accent-color)' : '';
  if (italicBtn) italicBtn.style.background = fmt.italic ? 'var(--accent-color)' : '';
  if (underlineBtn) underlineBtn.style.background = fmt.underline ? 'var(--accent-color)' : '';
  if (wrapBtn) wrapBtn.style.background = fmt.wrap ? 'var(--accent-color)' : '';
  const fontFamilyEl = document.getElementById('sheet-font-family');
  const fontSizeEl = document.getElementById('sheet-font-size');
  const numFmtEl = document.getElementById('sheet-number-format');
  if (fontFamilyEl) fontFamilyEl.value = fmt.fontFamily || '';
  if (fontSizeEl) fontSizeEl.value = fmt.fontSize || '';
  if (numFmtEl) numFmtEl.value = fmt.numFormat || '';

  // Show data validation input message
  document.querySelector('.dv-input-tooltip')?.remove();
  const dvKey = `${S.selectedRow},${S.selectedCol}`;
  const dvRule = S.validations[dvKey];
  if (dvRule?.inputMessage && td) {
    const tip = document.createElement('div');
    tip.className = 'dv-input-tooltip';
    tip.style.cssText = 'position:absolute;padding:6px 10px;background:#fffde7;color:#5d4037;border:1px solid #fdd835;border-radius:4px;font-size:11px;z-index:1000;max-width:220px;box-shadow:0 2px 6px rgba(0,0,0,0.1);pointer-events:none;white-space:pre-wrap';
    tip.textContent = dvRule.inputMessage;
    td.style.position = 'relative';
    tip.style.position = 'absolute';
    tip.style.top = '-30px';
    tip.style.left = '0';
    td.appendChild(tip);
  }

  updateStatusBar();
}

function updateStatusBar() {
  const sheet = getSheet();
  const { r1, r2, c1, c2 } = getSelectionRange();
  const leftEl = document.getElementById('sheet-status-left');
  const rightEl = document.getElementById('sheet-status-right');
  if (!leftEl || !rightEl) return;

  const isRange = r1 !== r2 || c1 !== c2;
  if (!isRange) {
    leftEl.textContent = t('ui.ready');
    rightEl.textContent = '';
    return;
  }

  const vals = [];
  let count = 0;
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const v = parseFloat(getDisplayValue(sheet, r, c));
      if (!isNaN(v)) vals.push(v);
      count++;
    }
  }

  leftEl.textContent = `${count} ${t('sheet.cellsSelected')}`;
  if (vals.length > 0) {
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    rightEl.textContent = `Sum: ${sum.toLocaleString()} | Avg: ${avg.toFixed(2)} | Count: ${vals.length} | Min: ${min} | Max: ${max}`;
  } else {
    rightEl.textContent = `Count: ${count}`;
  }
}

/* ==================== Events ==================== */

function bindEvents() {
  // Group toggle click + filter dropdown
  S.gridEl.addEventListener('click', (e) => {
    const toggle = e.target.closest('.sheet-group-toggle');
    if (toggle) {
      const idx = parseInt(toggle.dataset.group);
      toggleGroupCollapse(idx);
      e.stopPropagation();
      return;
    }
    const filterBtn = e.target.closest('.sheet-filter-btn');
    if (filterBtn) {
      showFilterDropdown(parseInt(filterBtn.dataset.filterCol), filterBtn);
      e.stopPropagation();
      return;
    }
    const dvBtn = e.target.closest('.sheet-dv-btn');
    if (dvBtn) {
      showDvDropdown(parseInt(dvBtn.dataset.dvRow), parseInt(dvBtn.dataset.dvCol), dvBtn);
      e.stopPropagation();
      return;
    }
    const commentBtn = e.target.closest('.cell-comment-indicator');
    if (commentBtn) {
      const cr = parseInt(commentBtn.dataset.commentRow);
      const cc = parseInt(commentBtn.dataset.commentCol);
      showCommentPanel(cr, cc);
      e.stopPropagation();
      return;
    }
  });

  // Cell note + error tooltip on hover
  let noteTooltip = null;
  const errorMessages = {
    '#ERROR': 'Formula contains an error. Check syntax.',
    '#REF!': 'Invalid cell reference. The referenced cell may have been deleted.',
    '#N/A': 'Value not available. LOOKUP/MATCH found no result.',
    '#DIV/0!': 'Division by zero.',
    '#VALUE!': 'Wrong value type in formula.',
    '#NAME?': 'Unrecognized formula name.',
    '#NULL!': 'Invalid range intersection.',
    '#CIRC!': 'Circular reference detected.',
  };

  S.gridEl.addEventListener('mouseover', (e) => {
    const indicator = e.target.closest('.cell-note-indicator');
    const td = e.target.closest('td[data-row]');

    if (indicator) {
      if (!td) return;
      const r = parseInt(td.dataset.row), c = parseInt(td.dataset.col);
      const note = S.cellNotes[`${r},${c}`];
      if (!note) return;
      if (noteTooltip) noteTooltip.remove();
      noteTooltip = document.createElement('div');
      noteTooltip.className = 'sheet-note-tooltip';
      noteTooltip.style.cssText = 'position:fixed;background:#fffde7;color:#333;padding:8px 12px;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.2);max-width:250px;font-size:12px;line-height:1.4;z-index:9999;white-space:pre-wrap;border-left:3px solid #f59e0b;';
      noteTooltip.textContent = note;
      const rect = indicator.getBoundingClientRect();
      noteTooltip.style.left = rect.right + 4 + 'px';
      noteTooltip.style.top = rect.top + 'px';
      document.body.appendChild(noteTooltip);
    } else if (td) {
      const cellText = td.textContent.trim();
      const errMsg = errorMessages[cellText];
      if (errMsg) {
        if (noteTooltip) noteTooltip.remove();
        const r = parseInt(td.dataset.row), c = parseInt(td.dataset.col);
        const sheet = getSheet();
        const raw = getCell(sheet, r, c)?.raw || '';
        noteTooltip = document.createElement('div');
        noteTooltip.className = 'sheet-note-tooltip';
        noteTooltip.style.cssText = 'position:fixed;background:#fef2f2;color:#991b1b;padding:8px 12px;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.2);max-width:300px;font-size:12px;line-height:1.4;z-index:9999;border-left:3px solid #ef4444;';
        const escH = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        noteTooltip.innerHTML = `<strong>${escH(cellText)}</strong><br>${escH(errMsg)}${raw ? `<br><code style="font-size:11px;color:#666;margin-top:4px;display:block">${escH(raw)}</code>` : ''}`;
        const rect = td.getBoundingClientRect();
        noteTooltip.style.left = rect.right + 4 + 'px';
        noteTooltip.style.top = rect.top + 'px';
        document.body.appendChild(noteTooltip);
      }
    }
  });
  S.gridEl.addEventListener('mouseout', (e) => {
    if ((e.target.closest('.cell-note-indicator') || e.target.closest('td[data-row]')) && noteTooltip) {
      noteTooltip.remove();
      noteTooltip = null;
    }
  });

  // Corner cell click → select all
  S.gridEl.addEventListener('mousedown', (e) => {
    const corner = e.target.closest('th.sheet-corner');
    if (corner) {
      if (S.isEditing) commitEdit();
      const sheet = getSheet();
      S.selAnchorRow = 0; S.selAnchorCol = 0;
      S.selectedRow = sheet.rows - 1; S.selectedCol = sheet.cols - 1;
      updateSelection();
      e.preventDefault();
      return;
    }

    // Column header click → select entire column
    const colHeader = e.target.closest('th.sheet-col-header');
    if (colHeader) {
      const rect = colHeader.getBoundingClientRect();
      if (Math.abs(e.clientX - rect.right) < 5) return;
      if (S.isEditing) commitEdit();
      const c = parseInt(colHeader.dataset.col, 10);
      const sheet = getSheet();
      if (e.shiftKey) {
        S.selectedCol = c;
        S.selectedRow = sheet.rows - 1;
      } else {
        S.selAnchorRow = 0; S.selAnchorCol = c;
        S.selectedRow = sheet.rows - 1; S.selectedCol = c;
      }
      updateSelection();
      e.preventDefault();
      return;
    }

    // Row header click → select entire row
    const rowHeader = e.target.closest('th.sheet-row-header');
    if (rowHeader) {
      const rect = rowHeader.getBoundingClientRect();
      if (Math.abs(e.clientY - rect.bottom) < 5) return;
      if (S.isEditing) commitEdit();
      const r = parseInt(rowHeader.dataset.row, 10);
      const sheet = getSheet();
      if (e.shiftKey) {
        S.selectedRow = r;
        S.selectedCol = sheet.cols - 1;
      } else {
        S.selAnchorRow = r; S.selAnchorCol = 0;
        S.selectedRow = r; S.selectedCol = sheet.cols - 1;
      }
      updateSelection();
      e.preventDefault();
      return;
    }
  });

  // Cell click → select or insert reference
  S.gridEl.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    const r = parseInt(td.dataset.row, 10);
    const c = parseInt(td.dataset.col, 10);

    if (S.isEditing && S.isFormulaMode) {
      insertCellReference(r, c);
      e.preventDefault();
      return;
    }

    if (S.isEditing) commitEdit();

    if (e.shiftKey) {
      S.selectedRow = r;
      S.selectedCol = c;
    } else {
      S.selectedRow = r;
      S.selectedCol = c;
      S.selAnchorRow = r;
      S.selAnchorCol = c;
    }
    S.isDragging = true;
    updateSelection();
    e.preventDefault();
  });

  // Fill handle drag start
  S.gridEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('fill-handle')) {
      e.preventDefault();
      e.stopPropagation();
      S.isFilling = true;
      const { r1, r2, c1, c2 } = getSelectionRange();
      S.fillStartRow = r1; S.fillStartCol = c1;
      S.fillEndRow = r2; S.fillEndCol = c2;
    }
  });

  S.gridEl.addEventListener('mousemove', (e) => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    const r = parseInt(td.dataset.row, 10);
    const c = parseInt(td.dataset.col, 10);

    if (S.isFilling) {
      S.gridEl.querySelectorAll('.fill-preview').forEach(el => el.classList.remove('fill-preview'));
      const dr = r - S.fillEndRow;
      const dc = c - S.fillEndCol;
      if (Math.abs(dr) >= Math.abs(dc)) {
        const startR = Math.min(S.fillEndRow, r);
        const endR = Math.max(S.fillEndRow, r);
        for (let fr = startR; fr <= endR; fr++) {
          if (fr >= S.fillStartRow && fr <= S.fillEndRow) continue;
          for (let fc = S.fillStartCol; fc <= S.fillEndCol; fc++) {
            const ftd = S.gridEl.querySelector(`td[data-row="${fr}"][data-col="${fc}"]`);
            if (ftd) ftd.classList.add('fill-preview');
          }
        }
      } else {
        const startC = Math.min(S.fillEndCol, c);
        const endC = Math.max(S.fillEndCol, c);
        for (let fr = S.fillStartRow; fr <= S.fillEndRow; fr++) {
          for (let fc = startC; fc <= endC; fc++) {
            if (fc >= S.fillStartCol && fc <= S.fillEndCol) continue;
            const ftd = S.gridEl.querySelector(`td[data-row="${fr}"][data-col="${fc}"]`);
            if (ftd) ftd.classList.add('fill-preview');
          }
        }
      }
      return;
    }

    if (!S.isDragging) return;
    if (r !== S.selectedRow || c !== S.selectedCol) {
      S.selectedRow = r;
      S.selectedCol = c;
      if (S.isEditing && S.isFormulaMode) {
        updateRangeReference(r, c);
      } else {
        updateSelection();
      }
    }
  });

  _trackDocListener('mouseup', (e) => {
    if (S.isFilling) {
      const td = document.elementFromPoint(e.clientX, e.clientY)?.closest('td[data-row]');
      if (td) {
        const r = parseInt(td.dataset.row, 10);
        const c = parseInt(td.dataset.col, 10);
        executeFill(r, c);
      }
      S.isFilling = false;
      S.gridEl?.querySelectorAll('.fill-preview').forEach(el => el.classList.remove('fill-preview'));
    }
    S.isDragging = false;
  });

  // Touch events
  S.gridEl.addEventListener('touchstart', (e) => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    const r = parseInt(td.dataset.row, 10);
    const c = parseInt(td.dataset.col, 10);
    if (S.isEditing) commitEdit();
    S.selectedRow = r; S.selectedCol = c;
    S.selAnchorRow = r; S.selAnchorCol = c;
    updateSelection();
  }, { passive: true });

  S.gridEl.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const td = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('td[data-row]');
    if (!td) return;
    const r = parseInt(td.dataset.row, 10);
    const c = parseInt(td.dataset.col, 10);
    if (r !== S.selectedRow || c !== S.selectedCol) {
      S.selectedRow = r; S.selectedCol = c;
      updateSelection();
    }
  }, { passive: true });

  let lastTapTime = 0;
  S.gridEl.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      startEdit();
    }
    lastTapTime = now;
  });

  S.gridEl.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-row]');
    if (td) startEdit();
  });

  // Formula bar events
  S.formulaBarEl.addEventListener('keydown', (e) => {
    if (handleAcKeydown(e, S.formulaBarEl)) return;

    if (e.key === 'Enter') {
      hideAutocomplete();
      const val = S.formulaBarEl.value;
      const sheet = getSheet();
      const key = `${S.selectedRow},${S.selectedCol}`;
      const oldCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && val.startsWith('=')) {
        const _setCellArrayFormula2 = (sh, r, c, v) => _setCellArrayFormula(sh, r, c, v, S.sheets);
        _setCellArrayFormula2(sheet, S.selectedRow, S.selectedCol, val);
      } else {
        setCell(sheet, S.selectedRow, S.selectedCol, val);
      }
      const newCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
      pushUndoEntry(key, oldCell, newCell);
      recalcAll(sheet);
      S.isEditing = false;
      S.isFormulaMode = false;
      S.formulaEditTarget = null;
      renderGrid();
      moveSelection(1, 0);
      S.formulaBarEl.blur();
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      S.isEditing = false;
      S.isFormulaMode = false;
      S.formulaEditTarget = null;
      S.formulaBarEl.value = getRawValue(getSheet(), S.selectedRow, S.selectedCol);
      renderGrid();
      updateSelection();
      S.formulaBarEl.blur();
    }
  });

  S.formulaBarEl.addEventListener('input', () => {
    S.isFormulaMode = S.formulaBarEl.value.startsWith('=');
    showAutocomplete(S.formulaBarEl);

    if (S.formulaEditTarget === 'cell') {
      const cellInput = getCellInput();
      if (cellInput) cellInput.value = S.formulaBarEl.value;
    }
  });

  S.formulaBarEl.addEventListener('focus', () => {
    if (!S.isEditing) {
      S.isEditing = true;
      S.formulaEditTarget = 'bar';
      S.editingRow = S.selectedRow;
      S.editingCol = S.selectedCol;
      S.formulaBarEl.value = getRawValue(getSheet(), S.selectedRow, S.selectedCol);
      S.isFormulaMode = S.formulaBarEl.value.startsWith('=');
    }
  });

  S.formulaBarEl.addEventListener('blur', () => {
    setTimeout(() => hideAutocomplete(), 150);
  });

  // Keyboard navigation
  _trackDocListener('keydown', (e) => {
    const sheetView = document.getElementById('view-sheet');
    if (!sheetView || !sheetView.classList.contains('active')) return;
    if (document.activeElement === S.formulaBarEl) return;

    const sheet = getSheet();

    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      e.preventDefault(); copySelection(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      e.preventDefault(); pasteSelection(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
      e.preventDefault(); copySelection(); clearSelection(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault(); showSheetFindReplace(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault(); sheetUndo(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault(); sheetRedo(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
      e.preventDefault(); sheetRedo(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault(); document.getElementById('sheet-bold')?.click(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault(); document.getElementById('sheet-italic')?.click(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
      e.preventDefault(); document.getElementById('sheet-underline')?.click(); return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'h' || e.key === 'f')) {
      e.preventDefault();
      if (!S.sheetFindVisible) toggleSheetFindReplace();
      document.getElementById('sheet-find-input')?.focus();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault(); flashFill(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      S.selAnchorRow = 0; S.selAnchorCol = 0;
      S.selectedRow = sheet.rows - 1; S.selectedCol = sheet.cols - 1;
      renderGrid(); updateSelection();
      return;
    }

    if (S.isEditing) {
      if (e.key === 'Enter') {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          commitEdit(true);
        } else {
          commitEdit();
        }
        moveSelection(1, 0);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit();
        moveSelection(0, e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); moveSelection(-1, 0, e.shiftKey); break;
      case 'ArrowDown': e.preventDefault(); moveSelection(1, 0, e.shiftKey); break;
      case 'ArrowLeft': e.preventDefault(); moveSelection(0, -1, e.shiftKey); break;
      case 'ArrowRight': e.preventDefault(); moveSelection(0, 1, e.shiftKey); break;
      case 'Tab':
        e.preventDefault();
        moveSelection(0, e.shiftKey ? -1 : 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey) moveSelection(-1, 0);
        else startEdit();
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        clearSelection();
        break;
      case 'F2':
        e.preventDefault();
        startEdit();
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          startEdit(e.key);
          e.preventDefault();
        }
    }
  });

  // Toolbar buttons
  document.getElementById('sheet-add-row')?.addEventListener('click', () => {
    addRows(getSheet()); renderGrid(); updateSelection();
  });
  document.getElementById('sheet-add-col')?.addEventListener('click', () => {
    addCols(getSheet()); renderGrid(); updateSelection();
  });
  document.getElementById('sheet-del-row')?.addEventListener('click', () => {
    deleteRow(getSheet(), S.selectedRow); renderGrid();
    S.selectedRow = Math.min(S.selectedRow, getSheet().rows - 1);
    updateSelection();
  });
  document.getElementById('sheet-del-col')?.addEventListener('click', () => {
    deleteCol(getSheet(), S.selectedCol); renderGrid();
    S.selectedCol = Math.min(S.selectedCol, getSheet().cols - 1);
    updateSelection();
  });

  // Bold
  document.getElementById('sheet-bold')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    const first = getCell(getSheet(), r1, c1);
    const newBold = !(first?.format?.bold);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'bold', newBold);
      }
    }
    renderGrid(); updateSelection();
  });

  // Italic
  document.getElementById('sheet-italic')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    const first = getCell(getSheet(), r1, c1);
    const newVal = !(first?.format?.italic);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'italic', newVal);
      }
    }
    renderGrid(); updateSelection();
  });

  // Underline
  document.getElementById('sheet-underline')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    const first = getCell(getSheet(), r1, c1);
    const newVal = !(first?.format?.underline);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'underline', newVal);
      }
    }
    renderGrid(); updateSelection();
  });

  // Strikethrough
  document.getElementById('sheet-strikethrough')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    const first = getCell(getSheet(), r1, c1);
    const newVal = !(first?.format?.strikethrough);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'strikethrough', newVal);
      }
    }
    renderGrid(); updateSelection();
  });

  // Format Painter
  let formatPainterData = null;
  document.getElementById('sheet-format-painter')?.addEventListener('click', () => {
    const btn = document.getElementById('sheet-format-painter');
    if (formatPainterData) {
      formatPainterData = null;
      btn.classList.remove('active');
      S.gridEl.style.cursor = '';
      return;
    }
    const cell = getCell(getSheet(), S.selectedRow, S.selectedCol);
    formatPainterData = cell?.format ? { ...cell.format } : {};
    delete formatPainterData.merged;
    delete formatPainterData.mergeSpan;
    delete formatPainterData.merge;
    btn.classList.add('active');
    S.gridEl.style.cursor = 'cell';
  });

  S.gridEl.addEventListener('mouseup', () => {
    if (!formatPainterData) return;
    const { r1, r2, c1, c2 } = getSelectionRange();
    const sheet = getSheet();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        for (const [key, val] of Object.entries(formatPainterData)) {
          setCellFormat(sheet, r, c, key, val);
        }
      }
    }
    formatPainterData = null;
    document.getElementById('sheet-format-painter')?.classList.remove('active');
    S.gridEl.style.cursor = '';
    renderGrid(); updateSelection();
  });

  // Wrap Text
  document.getElementById('sheet-wrap')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    const first = getCell(getSheet(), r1, c1);
    const newVal = !(first?.format?.wrap);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'wrap', newVal);
      }
    }
    renderGrid(); updateSelection();
  });

  // Font Family
  document.getElementById('sheet-font-family')?.addEventListener('change', (e) => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'fontFamily', e.target.value);
      }
    }
    renderGrid(); updateSelection();
  });

  // Font Size
  document.getElementById('sheet-font-size')?.addEventListener('change', (e) => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    const val = e.target.value ? parseInt(e.target.value) : '';
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'fontSize', val);
      }
    }
    renderGrid(); updateSelection();
  });

  // Alignment
  ['left', 'center', 'right'].forEach((align) => {
    document.getElementById(`sheet-align-${align}`)?.addEventListener('click', () => {
      const { r1, r2, c1, c2 } = getSelectionRange();
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          setCellFormat(getSheet(), r, c, 'align', align);
        }
      }
      renderGrid(); updateSelection();
    });
  });

  // Indent
  document.getElementById('sheet-indent-inc')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = getCell(getSheet(), r, c);
        const cur = cell?.format?.indent || 0;
        setCellFormat(getSheet(), r, c, 'indent', cur + 1);
      }
    }
    renderGrid(); updateSelection();
  });
  document.getElementById('sheet-indent-dec')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = getCell(getSheet(), r, c);
        const cur = cell?.format?.indent || 0;
        setCellFormat(getSheet(), r, c, 'indent', Math.max(0, cur - 1));
      }
    }
    renderGrid(); updateSelection();
  });

  // Vertical alignment
  document.getElementById('sheet-valign')?.addEventListener('change', (e) => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'valign', e.target.value);
      }
    }
    renderGrid(); updateSelection();
  });

  // Clear formatting
  document.getElementById('sheet-clear-format')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    const sheet = getSheet();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = getCell(sheet, r, c);
        if (cell) cell.format = {};
      }
    }
    renderGrid(); updateSelection();
  });

  // Background color
  document.getElementById('sheet-bg-color')?.addEventListener('input', (e) => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'bg', e.target.value);
      }
    }
    renderGrid(); updateSelection();
  });

  // Text color
  document.getElementById('sheet-text-color')?.addEventListener('input', (e) => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'color', e.target.value);
      }
    }
    renderGrid(); updateSelection();
  });

  // Cell Borders
  document.getElementById('sheet-borders')?.addEventListener('click', () => showBorderMenu());

  // Number Format
  document.getElementById('sheet-number-format')?.addEventListener('change', (e) => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'numFormat', e.target.value);
      }
    }
    recalcAll(getSheet());
    renderGrid(); updateSelection();
  });

  // Freeze
  document.getElementById('sheet-freeze')?.addEventListener('click', (e) => {
    if (e.shiftKey || e.altKey) {
      showFreezeDialog();
      return;
    }
    if (S.freezeRows > 0 || S.freezeCols > 0) {
      S.freezeRows = 0; S.freezeCols = 0;
    } else {
      S.freezeRows = S.selectedRow > 0 ? S.selectedRow : 1;
      S.freezeCols = S.selectedCol > 0 ? S.selectedCol : 0;
    }
    renderGrid(); updateSelection();
    updateFreezeButtonState();
  });
  document.getElementById('sheet-freeze')?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showFreezeDialog();
  });

  document.getElementById('sheet-freeze-row')?.addEventListener('click', () => {
    if (S.freezeRows === 1 && S.freezeCols === 0) { S.freezeRows = 0; } else { S.freezeRows = 1; S.freezeCols = 0; }
    renderGrid(); updateSelection(); updateFreezeButtonState();
  });
  document.getElementById('sheet-freeze-col')?.addEventListener('click', () => {
    if (S.freezeCols === 1 && S.freezeRows === 0) { S.freezeCols = 0; } else { S.freezeRows = 0; S.freezeCols = 1; }
    renderGrid(); updateSelection(); updateFreezeButtonState();
  });

  // Sort
  document.getElementById('sheet-sort-asc')?.addEventListener('click', () => sortColumn(true));
  document.getElementById('sheet-sort-desc')?.addEventListener('click', () => sortColumn(false));

  // Number format
  document.getElementById('sheet-num-format')?.addEventListener('change', (e) => {
    const fmt = e.target.value;
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(getSheet(), r, c, 'numFormat', fmt === 'general' ? null : fmt);
      }
    }
    renderGrid(); updateSelection();
  });

  // Merge cells
  document.getElementById('sheet-merge')?.addEventListener('click', () => toggleMerge());
  document.getElementById('sheet-banded-rows')?.addEventListener('click', () => toggleBandedRows());
  document.getElementById('sheet-cond-fmt')?.addEventListener('click', () => showCondFmtDialog());
  document.getElementById('sheet-chart')?.addEventListener('click', () => showChartDialog());
  document.getElementById('sheet-filter')?.addEventListener('click', () => toggleFilter());
  document.getElementById('sheet-find')?.addEventListener('click', () => showSheetFindReplace());
  document.getElementById('sheet-undo')?.addEventListener('click', () => sheetUndo());
  document.getElementById('sheet-redo')?.addEventListener('click', () => sheetRedo());
  document.getElementById('sheet-sort-custom')?.addEventListener('click', () => showMultiSortDialog());
  document.getElementById('sheet-named-range')?.addEventListener('click', () => showNamedRangeDialog());
  document.getElementById('sheet-sparkline')?.addEventListener('click', () => insertSparkline());
  document.getElementById('sheet-insert-chart')?.addEventListener('click', () => showChartDialog());
  document.getElementById('sheet-pivot')?.addEventListener('click', () => showPivotTableDialog());
  document.getElementById('sheet-pivot-refresh')?.addEventListener('click', () => refreshPivotTable());
  document.getElementById('sheet-group-rows')?.addEventListener('click', () => toggleGroupRows());
  document.getElementById('sheet-merge-cells')?.addEventListener('click', () => toggleMergeCells());
  document.getElementById('sheet-cond-format')?.addEventListener('click', () => showConditionalFormatDialog());
  document.getElementById('sheet-goal-seek')?.addEventListener('click', () => showGoalSeekDialog());
  document.getElementById('sheet-subtotals')?.addEventListener('click', () => showSubtotalsDialog());
  document.getElementById('sheet-transpose')?.addEventListener('click', () => transposeSelection());
  document.getElementById('sheet-remove-dups')?.addEventListener('click', () => removeDuplicates());
  document.getElementById('sheet-text-to-cols')?.addEventListener('click', () => textToColumns());
  document.getElementById('sheet-print')?.addEventListener('click', () => printSheet());
  document.getElementById('sheet-flash-fill')?.addEventListener('click', () => flashFill());
  document.getElementById('sheet-trace-precedents')?.addEventListener('click', () => tracePrecedents());
  document.getElementById('sheet-trace-dependents')?.addEventListener('click', () => traceDependents());
  document.getElementById('sheet-clear-arrows')?.addEventListener('click', () => clearTraceArrows());
  document.getElementById('sheet-protect')?.addEventListener('click', () => toggleSheetProtection());
  document.getElementById('sheet-data-valid')?.addEventListener('click', () => showDataValidationDialog(S.selectedRow, S.selectedCol));
  document.getElementById('sheet-cf-manager')?.addEventListener('click', () => showCondFormatRulesManager());
  document.getElementById('sheet-find-replace')?.addEventListener('click', () => toggleSheetFindReplace());
  initSheetFindReplace();
  document.getElementById('sheet-import-csv')?.addEventListener('click', () => importCSV());
  document.getElementById('sheet-export-csv')?.addEventListener('click', () => exportCSV());
  document.getElementById('sheet-export-xlsx')?.addEventListener('click', () => exportXLSX());
  document.getElementById('sheet-export-dialog')?.addEventListener('click', () => showExportDialog());
  document.getElementById('sheet-slicer')?.addEventListener('click', () => showSlicerDialog());

  // Context menu
  S.gridEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    showCellContextMenu(e.clientX, e.clientY, parseInt(td.dataset.row), parseInt(td.dataset.col));
  });

  // Sheet tabs
  document.getElementById('sheet-add-tab')?.addEventListener('click', () => {
    _saveSheetState();
    S.sheets.push(createSheetData());
    S.activeSheetIdx = S.sheets.length - 1;
    _loadSheetState();
    renderSheetTabs(); renderGrid();
    S.selectedRow = 0; S.selectedCol = 0;
    updateSelection();
  });

  document.getElementById('sheet-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.sheet-tab');
    if (tab && tab.dataset.sheet != null) {
      const newIdx = parseInt(tab.dataset.sheet, 10);
      if (newIdx !== S.activeSheetIdx) {
        _saveSheetState();
        S.activeSheetIdx = newIdx;
        S.colWidths = {}; S.rowHeights = {};
        _loadSheetState();
      }
      renderSheetTabs(); renderGrid();
      S.selectedRow = 0; S.selectedCol = 0;
      updateSelection();
    }
  });
}

/* ==================== Export ==================== */

export function getSheetsData() {
  _saveSheetState();
  return S.sheets;
}

export function setSheetsData(newSheets) {
  S.sheets = newSheets;
  S.activeSheetIdx = 0;
  S.colWidths = {}; S.rowHeights = {};
  _loadSheetState();
  renderSheetTabs(); renderGrid();
  S.selectedRow = 0; S.selectedCol = 0;
  updateSelection();
}

/* ==================== Destroy / Cleanup ==================== */

export function destroySheetEditor() {
  for (const entry of _sheetDocListeners) {
    document.removeEventListener(entry.event, entry.handler, entry.options);
  }
  _sheetDocListeners.length = 0;

  if (S.gridEl) S.gridEl.innerHTML = '';

  if (S.acEl) { S.acEl.remove(); S.acEl = null; }
  S.acIndex = -1;
  S.acTarget = null;

  document.querySelectorAll(
    '.sheet-find-bar, .sheet-chart-dialog, .sheet-cf-dialog, ' +
    '.sheet-validation-dialog, .sheet-sort-dialog, .sheet-slicer-panel, ' +
    '.sheet-comment-popover, .sheet-named-range-dialog, ' +
    '.sheet-ctx-menu, .sheet-filter-dropdown, .sheet-dv-dropdown, ' +
    '.sheet-note-tooltip, .sheet-tab-context-menu, .sheet-freeze-dialog, ' +
    '.sheet-cond-dialog, .sheet-dv-dialog, .sheet-comment-panel, ' +
    '.dv-notification, .dv-input-tooltip, .modal-overlay'
  ).forEach((el) => el.remove());

  S.undoStack = [];
  S.redoStack = [];
  S.clipboard = null;
  S.cellNotes = {};
  S.cellHyperlinks = {};
  S.cellComments = {};
  S.validations = {};
  S.condFormats = [];
  S.hiddenRows = new Set();
  S.hiddenCols = new Set();
  S.rowGroups = [];
  S.filterRow = -1;
  S.filterValues = {};
  S.isEditing = false;
  S.isDragging = false;
  S.isFilling = false;
  S.isFormulaMode = false;
  S.formulaEditTarget = null;
  S._vsScrollBound = false;
  S._vsLastStart = -1;
  S._vsLastEnd = -1;
  S._cachedVisibleRows = null;
  S.gridEl = null;
  S.cellRefEl = null;
  S.formulaBarEl = null;
  S.containerEl = null;
}

// Test-only exports for internal functions
export const _testOnly = {
  adjustFormulaReferences,
  _saveSheetState,
  _loadSheetState,
  buildPrintTableHTML,
  buildPrintCSS,
  printCellStyle,
  getState: () => ({
    sheets: S.sheets, activeSheetIdx: S.activeSheetIdx, cellNotes: S.cellNotes, cellHyperlinks: S.cellHyperlinks, cellComments: S.cellComments,
    hiddenRows: S.hiddenRows, hiddenCols: S.hiddenCols, rowGroups: S.rowGroups, condFormats: S.condFormats, validations: S.validations,
    freezeRows: S.freezeRows, freezeCols: S.freezeCols, clipboard: S.clipboard, undoStack: S.undoStack, redoStack: S.redoStack,
    isEditing: S.isEditing, isDragging: S.isDragging, isFilling: S.isFilling, _vsScrollBound: S._vsScrollBound, acEl: S.acEl,
    filterRow: S.filterRow, filterValues: S.filterValues,
  }),
};
