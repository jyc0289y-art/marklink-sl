// OfficeLink SL — Sheet Edit (cell editing, formula mode, undo/redo, clipboard, autocomplete)

import {
  getCell, setCell as _setCell, setCellFormat, getDisplayValue, getRawValue,
  colToLetter, letterToCol as engineLetterToCol, rcToRef, refToRC,
  recalcAll as _recalcAll, setCellArrayFormula as _setCellArrayFormula,
} from './sheet-engine.js';
import { escapeHtml } from '../utils/sanitize.js';
import S from './sheet-state.js';
import { getSheet, renderGrid, getSelectionRange, scrollIntoView, getColWidth } from './sheet-grid.js';

// Engine wrappers that pass all sheets
function setCell(sheet, r, c, rawValue) { _setCell(sheet, r, c, rawValue, S.sheets); }
function setCellArrayFormula(sheet, r, c, rawValue) { _setCellArrayFormula(sheet, r, c, rawValue, S.sheets); }
function recalcAll(sheet) { _recalcAll(sheet, S.sheets); }

// Forward references — set by sheet-ui.js
let _renderGridFn = () => renderGrid();
let _updateSelectionFn = () => {};
let _refreshChartWidgetsFn = () => {};
let _isCellEditableFn = () => true;
let _checkDataValidationFn = () => null;
let _showDvNotificationFn = () => {};

export function setEditDeps(deps) {
  if (deps.renderGrid) _renderGridFn = deps.renderGrid;
  if (deps.updateSelection) _updateSelectionFn = deps.updateSelection;
  if (deps.refreshChartWidgets) _refreshChartWidgetsFn = deps.refreshChartWidgets;
  if (deps.isCellEditable) _isCellEditableFn = deps.isCellEditable;
  if (deps.checkDataValidation) _checkDataValidationFn = deps.checkDataValidation;
  if (deps.showDvNotification) _showDvNotificationFn = deps.showDvNotification;
}

function updateSelection() { _updateSelectionFn(); }

/* ==================== Formula Constants ==================== */

export const FORMULA_LIST = [
  'SUM','AVERAGE','COUNT','COUNTA','MIN','MAX','IF','SUMIF','COUNTIF','AVERAGEIF',
  'SUMIFS','COUNTIFS','AVERAGEIFS',
  'VLOOKUP','HLOOKUP','XLOOKUP','XMATCH','INDEX','MATCH','INDIRECT','OFFSET','ROW','COLUMN','ROWS','COLUMNS','CHOOSE',
  'CONCATENATE','CONCAT','LEFT','RIGHT','MID','LEN','TRIM','TEXTJOIN','SUBSTITUTE',
  'REPT','FIND','SEARCH','REPLACE','PROPER','EXACT','VALUE','TEXT',
  'UPPER','LOWER','CHAR','CODE','CLEAN',
  'ROUND','ROUNDUP','ROUNDDOWN','INT','ABS','TODAY','NOW',
  'SIN','COS','TAN','ASIN','ACOS','ATAN','ATAN2','SINH','COSH','TANH',
  'SQRT','CBRT','POWER','POW','EXP','LN','LOG','LOG10','LOG2',
  'CEILING','CEIL','FLOOR','MOD','PI','E','DEGREES','RADIANS','SIGN',
  'FACT','COMBIN','PERMUT','GCD','LCM','RAND','RANDBETWEEN',
  'CONVERT','MEDIAN','STDEV','VAR','PRODUCT','SUMPRODUCT',
  'UNIQUE','SORT','FILTER','TRANSPOSE','MMULT','SPARKLINE',
  'AND','OR','NOT','XOR','IFERROR','IFS','SWITCH',
  'DATE','DATEVALUE','YEAR','MONTH','DAY','HOUR','MINUTE','SECOND',
  'WEEKDAY','WEEKNUM','DATEDIF','EDATE','EOMONTH','NETWORKDAYS',
  'LARGE','SMALL','RANK','FORECAST',
  'ISBLANK','ISNUMBER','ISTEXT','ISERROR','ISNA','TYPE','N','CELL',
  'PERCENTILE','QUARTILE','STDEVP','VARP','CORREL','COVAR','MODE','COUNTBLANK',
  'SHEET','SHEETS',
];

const MAX_UNDO = 100;

export const REF_COLORS = ['#4285f4', '#ea4335', '#34a853', '#fbbc04', '#ff6d01', '#46bdc6', '#9334e6', '#e91e63'];

/* ==================== Cell Selection & Navigation ==================== */

export function moveSelection(dr, dc, extend = false) {
  const sheet = getSheet();
  S.selectedRow = Math.max(0, Math.min(sheet.rows - 1, S.selectedRow + dr));
  S.selectedCol = Math.max(0, Math.min(sheet.cols - 1, S.selectedCol + dc));
  if (!extend) {
    S.selAnchorRow = S.selectedRow;
    S.selAnchorCol = S.selectedCol;
  }
  updateSelection();
  scrollIntoView();
}

/* ==================== Cell Editing ==================== */

export function startEdit(initialChar) {
  if (!_isCellEditableFn(S.selectedRow, S.selectedCol)) {
    alert('This cell is protected. Unprotect the sheet to edit.');
    return;
  }
  const td = S.gridEl.querySelector(`td[data-row="${S.selectedRow}"][data-col="${S.selectedCol}"]`);
  if (!td) return;
  S.isEditing = true;
  S.editingRow = S.selectedRow;
  S.editingCol = S.selectedCol;
  S.formulaEditTarget = 'cell';
  td.classList.add('editing');
  const raw = initialChar != null ? initialChar : getRawValue(getSheet(), S.selectedRow, S.selectedCol);
  S.isFormulaMode = raw.startsWith('=');
  td.innerHTML = `<input type="text" value="${escapeHtml(raw)}" class="sheet-cell-input" />`;
  const input = td.querySelector('input');
  input.focus();
  if (initialChar != null) {
    input.setSelectionRange(input.value.length, input.value.length);
  } else {
    input.select();
  }

  // Sync to formula bar
  S.formulaBarEl.value = raw;

  // In-cell input events
  input.addEventListener('input', () => {
    S.isFormulaMode = input.value.startsWith('=');
    S.formulaBarEl.value = input.value;
    showAutocomplete(input);
    if (S.isFormulaMode) highlightFormulaRefs(input.value);
    else clearFormulaRefHighlights();
  });
  if (S.isFormulaMode) highlightFormulaRefs(raw);

  input.addEventListener('keydown', (e) => {
    if (handleAcKeydown(e, input)) return;

    if (e.key === 'F4' && S.isFormulaMode) {
      e.preventDefault();
      toggleAbsoluteRef(input);
    } else if (e.key === 'Enter') {
      hideAutocomplete();
      commitEdit();
      moveSelection(1, 0);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      hideAutocomplete();
      commitEdit();
      moveSelection(0, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      cancelEdit();
    }
    e.stopPropagation();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => hideAutocomplete(), 150);
  });
}

export function getCellInput() {
  const td = S.gridEl.querySelector(`td[data-row="${S.editingRow}"][data-col="${S.editingCol}"]`);
  return td?.querySelector('input');
}

/* ==================== Undo/Redo ==================== */

export function pushUndoEntry(key, oldCell, newCell) {
  S.undoStack.push({
    type: 'cell',
    cellKey: key,
    oldValue: oldCell ? JSON.parse(JSON.stringify(oldCell)) : null,
    newValue: newCell ? JSON.parse(JSON.stringify(newCell)) : null,
  });
  if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
  S.redoStack.length = 0;
}

export function pushBulkUndo(changes) {
  if (!changes.length) return;
  S.undoStack.push({ type: 'bulk', changes });
  if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
  S.redoStack.length = 0;
}

export function saveUndoState() {
  const sheet = getSheet();
  const snapshot = JSON.stringify(sheet.cells);
  S.undoStack.push({ type: 'snapshot', data: snapshot });
  if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
  S.redoStack.length = 0;
}

const applyUndoEntry = (entry, sheet) => {
  if (entry.type === 'cell') {
    const key = entry.cellKey;
    if (entry.oldValue) {
      sheet.cells[key] = JSON.parse(JSON.stringify(entry.oldValue));
    } else {
      delete sheet.cells[key];
    }
  } else if (entry.type === 'bulk') {
    entry.changes.forEach((change) => {
      if (change.oldValue) {
        sheet.cells[change.cellKey] = JSON.parse(JSON.stringify(change.oldValue));
      } else {
        delete sheet.cells[change.cellKey];
      }
    });
  } else if (entry.type === 'snapshot') {
    sheet.cells = JSON.parse(entry.data);
  }
};

const applyRedoEntry = (entry, sheet) => {
  if (entry.type === 'cell') {
    const key = entry.cellKey;
    if (entry.newValue) {
      sheet.cells[key] = JSON.parse(JSON.stringify(entry.newValue));
    } else {
      delete sheet.cells[key];
    }
  } else if (entry.type === 'bulk') {
    entry.changes.forEach((change) => {
      if (change.newValue) {
        sheet.cells[change.cellKey] = JSON.parse(JSON.stringify(change.newValue));
      } else {
        delete sheet.cells[change.cellKey];
      }
    });
  } else if (entry.type === 'snapshot') {
    sheet.cells = JSON.parse(entry.data);
  }
};

export function sheetUndo() {
  if (!S.undoStack.length) return;
  const sheet = getSheet();
  const entry = S.undoStack.pop();

  if (entry.type === 'snapshot') {
    S.redoStack.push({ type: 'snapshot', data: JSON.stringify(sheet.cells) });
  } else if (entry.type === 'cell') {
    const currentCell = sheet.cells[entry.cellKey];
    S.redoStack.push({
      type: 'cell',
      cellKey: entry.cellKey,
      oldValue: entry.newValue,
      newValue: currentCell ? JSON.parse(JSON.stringify(currentCell)) : null,
    });
  } else if (entry.type === 'bulk') {
    const redoChanges = entry.changes.map((change) => ({
      cellKey: change.cellKey,
      oldValue: change.newValue,
      newValue: sheet.cells[change.cellKey] ? JSON.parse(JSON.stringify(sheet.cells[change.cellKey])) : null,
    }));
    S.redoStack.push({ type: 'bulk', changes: redoChanges });
  }

  applyUndoEntry(entry, sheet);
  recalcAll(sheet);
  _renderGridFn();
  updateSelection();
}

export function sheetRedo() {
  if (!S.redoStack.length) return;
  const sheet = getSheet();
  const entry = S.redoStack.pop();

  if (entry.type === 'snapshot') {
    S.undoStack.push({ type: 'snapshot', data: JSON.stringify(sheet.cells) });
  } else if (entry.type === 'cell') {
    const currentCell = sheet.cells[entry.cellKey];
    S.undoStack.push({
      type: 'cell',
      cellKey: entry.cellKey,
      oldValue: currentCell ? JSON.parse(JSON.stringify(currentCell)) : null,
      newValue: entry.newValue,
    });
  } else if (entry.type === 'bulk') {
    const undoChanges = entry.changes.map((change) => ({
      cellKey: change.cellKey,
      oldValue: sheet.cells[change.cellKey] ? JSON.parse(JSON.stringify(sheet.cells[change.cellKey])) : null,
      newValue: change.newValue,
    }));
    S.undoStack.push({ type: 'bulk', changes: undoChanges });
  }

  applyRedoEntry(entry, sheet);
  recalcAll(sheet);
  _renderGridFn();
  updateSelection();
}

export function commitEdit(asArrayFormula = false) {
  const td = S.gridEl.querySelector(`td[data-row="${S.editingRow}"][data-col="${S.editingCol}"]`);
  let val;
  if (td) {
    const input = td.querySelector('input');
    val = input ? input.value : (S.formulaEditTarget === 'bar' ? S.formulaBarEl.value : '');
  } else {
    val = S.formulaBarEl?.value ?? '';
  }
  if (val !== undefined) {
    const dvRule = S.validations[`${S.editingRow},${S.editingCol}`];
    if (dvRule && !val.startsWith('=') && val !== '') {
      const dvError = _checkDataValidationFn(dvRule, val);
      if (dvError) {
        const msg = dvRule.errorMessage || dvError;
        const severity = dvRule.severity || 'error';
        if (severity === 'error') {
          alert(msg);
          return;
        } else if (severity === 'warning') {
          if (!confirm(`Warning: ${msg}\n\nDo you want to continue?`)) return;
        } else {
          _showDvNotificationFn(msg, 'info');
        }
      }
    }
    const sheet = getSheet();
    const key = `${S.editingRow},${S.editingCol}`;
    const oldCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
    if (asArrayFormula && val.startsWith('=')) {
      setCellArrayFormula(sheet, S.editingRow, S.editingCol, val);
    } else {
      setCell(sheet, S.editingRow, S.editingCol, val);
    }
    const newCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
    pushUndoEntry(key, oldCell, newCell);
    recalcAll(sheet);
  }
  S.isEditing = false;
  S.isFormulaMode = false;
  S.formulaEditTarget = null;
  if (td) td.classList.remove('editing');
  clearFormulaRefHighlights();
  _renderGridFn();
  _refreshChartWidgetsFn();
  updateSelection();
  hideAutocomplete();
}

export function cancelEdit() {
  S.isEditing = false;
  S.isFormulaMode = false;
  S.formulaEditTarget = null;
  clearFormulaRefHighlights();
  _renderGridFn();
  updateSelection();
  hideAutocomplete();
}

/* ==================== Cell Reference Insertion ==================== */

export function insertCellReference(r, c) {
  const ref = rcToRef(r, c);
  const input = S.formulaEditTarget === 'bar' ? S.formulaBarEl : getCellInput();
  if (!input) return;

  const val = input.value;
  const cursor = input.selectionStart;

  if (S.refInsertStart >= 0 && S.refInsertStart <= cursor) {
    const newVal = val.substring(0, S.refInsertStart) + ref + val.substring(cursor);
    input.value = newVal;
    const newCursor = S.refInsertStart + ref.length;
    input.setSelectionRange(newCursor, newCursor);
  } else {
    S.refInsertStart = cursor;
    const newVal = val.substring(0, cursor) + ref + val.substring(cursor);
    input.value = newVal;
    const newCursor = cursor + ref.length;
    input.setSelectionRange(newCursor, newCursor);
  }

  if (S.formulaEditTarget === 'cell') {
    S.formulaBarEl.value = input.value;
  } else {
    const cellInput = getCellInput();
    if (cellInput) cellInput.value = input.value;
  }

  highlightRefCell(r, c);
  S.isDragging = true;
  input.focus();
}

export function updateRangeReference(r, c) {
  if (S.refInsertStart < 0) return;
  const input = S.formulaEditTarget === 'bar' ? S.formulaBarEl : getCellInput();
  if (!input) return;

  const val = input.value;
  const cursor = input.selectionStart;
  const beforeRef = val.substring(0, S.refInsertStart);
  const afterRef = val.substring(cursor);

  const existingRef = val.substring(S.refInsertStart, cursor);
  const baseRef = existingRef.split(':')[0];
  const baseRC = refToRC(baseRef);
  if (!baseRC) return;

  const rangeRef = (baseRC[0] === r && baseRC[1] === c)
    ? rcToRef(r, c)
    : `${baseRef}:${rcToRef(r, c)}`;

  const newVal = beforeRef + rangeRef + afterRef;
  input.value = newVal;
  const newCursor = S.refInsertStart + rangeRef.length;
  input.setSelectionRange(newCursor, newCursor);

  if (S.formulaEditTarget === 'cell') S.formulaBarEl.value = input.value;
  else { const ci = getCellInput(); if (ci) ci.value = input.value; }
}

export function highlightRefCell(r, c) {
  S.gridEl.querySelectorAll('.ref-highlight').forEach((el) => el.classList.remove('ref-highlight'));
  const td = S.gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
  if (td) td.classList.add('ref-highlight');
}

/* ==================== Copy / Paste ==================== */

export function copySelection() {
  const sheet = getSheet();
  const { r1, r2, c1, c2 } = getSelectionRange();
  const data = [];
  const textRows = [];

  for (let r = r1; r <= r2; r++) {
    const row = [];
    const textCols = [];
    for (let c = c1; c <= c2; c++) {
      const cell = getCell(sheet, r, c);
      row.push({
        raw: getRawValue(sheet, r, c),
        format: cell?.format ? JSON.parse(JSON.stringify(cell.format)) : null,
      });
      textCols.push(getDisplayValue(sheet, r, c));
    }
    data.push(row);
    textRows.push(textCols.join('\t'));
  }

  S.clipboard = { data, r1, c1, r2, c2 };

  const text = textRows.join('\n');
  navigator.clipboard?.writeText(text).catch(() => {});

  S.gridEl.querySelectorAll('.copy-highlight').forEach((el) => el.classList.remove('copy-highlight'));
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const td = S.gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
      if (td) td.classList.add('copy-highlight');
    }
  }
  setTimeout(() => {
    S.gridEl.querySelectorAll('.copy-highlight').forEach((el) => el.classList.remove('copy-highlight'));
  }, 800);
}

export function pasteSelection() {
  const sheet = getSheet();

  navigator.clipboard?.readText().then((text) => {
    if (text && text.trim().length > 0) {
      const rows = text.split('\n').filter((r) => r.length > 0);
      const changes = [];
      for (let r = 0; r < rows.length; r++) {
        const cols = rows[r].includes('\t') ? rows[r].split('\t') : [rows[r]];
        for (let c = 0; c < cols.length; c++) {
          const tr = S.selectedRow + r;
          const tc = S.selectedCol + c;
          if (tr < sheet.rows && tc < sheet.cols) {
            const key = `${tr},${tc}`;
            const oldCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
            setCell(sheet, tr, tc, cols[c]);
            const newCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
            changes.push({ cellKey: key, oldValue: oldCell, newValue: newCell });
          }
        }
      }
      if (changes.length) pushBulkUndo(changes);
      recalcAll(sheet);
      _renderGridFn();
      updateSelection();
      return;
    }
    pasteFromInternal();
  }).catch(() => {
    pasteFromInternal();
  });
}

function pasteFromInternal() {
  if (!S.clipboard) return;
  const sheet = getSheet();
  const { data } = S.clipboard;
  const changes = [];

  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const tr = S.selectedRow + r;
      const tc = S.selectedCol + c;
      if (tr < sheet.rows && tc < sheet.cols) {
        const key = `${tr},${tc}`;
        const oldCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
        const raw = adjustFormulaReferences(data[r][c].raw,
          tr - S.clipboard.r1, tc - S.clipboard.c1);
        setCell(sheet, tr, tc, raw);
        if (data[r][c].format) {
          Object.entries(data[r][c].format).forEach(([k, v]) => {
            if (v != null) setCellFormat(sheet, tr, tc, k, v);
          });
        }
        const newCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
        changes.push({ cellKey: key, oldValue: oldCell, newValue: newCell });
      }
    }
  }
  if (changes.length) pushBulkUndo(changes);
  recalcAll(sheet);
  _renderGridFn();
  updateSelection();
}

export function adjustFormulaReferences(raw, dr, dc) {
  if (!raw || !raw.startsWith('=')) return raw;
  return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, dollarCol, col, dollarRow, row) => {
    const isAbsCol = dollarCol === '$';
    const isAbsRow = dollarRow === '$';
    if (isAbsCol && isAbsRow) return match;

    let newCol = col;
    let newRow = parseInt(row, 10);

    if (!isAbsCol) {
      let colNum = 0;
      for (let i = 0; i < col.length; i++) {
        colNum = colNum * 26 + (col.charCodeAt(i) - 64);
      }
      colNum += dc;
      if (colNum < 1) colNum = 1;
      newCol = colToLetter(colNum - 1);
    }
    if (!isAbsRow) {
      newRow += dr;
      if (newRow < 1) newRow = 1;
    }
    return (isAbsCol ? '$' : '') + newCol + (isAbsRow ? '$' : '') + newRow;
  });
}

export function clearSelection() {
  if (S.sheetProtected) {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (!_isCellEditableFn(r, c)) { alert('Cannot clear protected cells.'); return; }
      }
    }
  }
  const sheet = getSheet();
  const { r1, r2, c1, c2 } = getSelectionRange();
  const changes = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const key = `${r},${c}`;
      const oldCell = sheet.cells[key] ? JSON.parse(JSON.stringify(sheet.cells[key])) : null;
      if (oldCell) {
        changes.push({ cellKey: key, oldValue: oldCell, newValue: null });
      }
      setCell(sheet, r, c, '');
    }
  }
  if (changes.length) pushBulkUndo(changes);
  recalcAll(sheet);
  _renderGridFn();
  updateSelection();
}

/* ==================== Formula Autocomplete ==================== */

function ensureAcEl() {
  if (S.acEl) return;
  S.acEl = document.createElement('div');
  S.acEl.className = 'sheet-ac-dropdown';
  S.acEl.style.display = 'none';
  document.body.appendChild(S.acEl);

  S.acEl.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.sheet-ac-item');
    if (item) {
      e.preventDefault();
      if (item.dataset.colval) {
        acceptColumnValue(item.dataset.fn);
      } else {
        acceptAutocomplete(item.dataset.fn);
      }
    }
  });
}

function getFormulaToken(inputEl) {
  const val = inputEl.value;
  const cursor = inputEl.selectionStart;
  const before = val.substring(0, cursor);
  const match = before.match(/(?:^=|[,(+\-*/])([A-Z]+)$/i);
  return match ? match[1].toUpperCase() : null;
}

/* ==================== Formula Reference Highlighting ==================== */

export function highlightFormulaRefs(formula) {
  clearFormulaRefHighlights();
  if (!formula.startsWith('=')) return;

  const refPattern = /(?:'[^']*'|[A-Z]+\d+)(?::(?:[A-Z]+\d+))?/gi;
  const expr = formula.substring(1);
  let match;
  let colorIdx = 0;

  while ((match = refPattern.exec(expr)) !== null) {
    const ref = match[0];
    if (ref.startsWith("'")) continue;

    const color = REF_COLORS[colorIdx % REF_COLORS.length];
    colorIdx++;

    const parts = ref.split(':');
    const cellPattern = /^([A-Z]+)(\d+)$/i;
    const startMatch = parts[0].match(cellPattern);
    if (!startMatch) continue;

    const startCol = letterToCol(startMatch[1].toUpperCase());
    const startRow = parseInt(startMatch[2]) - 1;
    let endRow = startRow, endCol = startCol;

    if (parts[1]) {
      const endMatch = parts[1].match(cellPattern);
      if (endMatch) {
        endCol = letterToCol(endMatch[1].toUpperCase());
        endRow = parseInt(endMatch[2]) - 1;
      }
    }

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const td = S.gridEl?.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (td) {
          td.style.outline = `2px solid ${color}`;
          td.style.outlineOffset = '-1px';
          td.classList.add('formula-ref-highlight');
        }
      }
    }
  }
}

function letterToCol(letter) {
  return engineLetterToCol(letter);
}

export function toggleAbsoluteRef(input) {
  const val = input.value;
  const pos = input.selectionStart;

  const refPattern = /\$?([A-Z]+)\$?(\d+)/gi;
  let match;
  while ((match = refPattern.exec(val)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (pos >= start && pos <= end) {
      const col = match[1];
      const row = match[2];
      const ref = match[0];

      let newRef;
      if (!ref.includes('$')) {
        newRef = `$${col}$${row}`;
      } else if (ref.startsWith('$') && ref.includes('$' + row)) {
        newRef = `${col}$${row}`;
      } else if (!ref.startsWith('$') && ref.includes('$')) {
        newRef = `$${col}${row}`;
      } else {
        newRef = `${col}${row}`;
      }

      const newVal = val.substring(0, start) + newRef + val.substring(end);
      input.value = newVal;
      S.formulaBarEl.value = newVal;
      input.setSelectionRange(start + newRef.length, start + newRef.length);
      return;
    }
  }
}

export function clearFormulaRefHighlights() {
  S.gridEl?.querySelectorAll('.formula-ref-highlight').forEach(td => {
    td.style.outline = '';
    td.style.outlineOffset = '';
    td.classList.remove('formula-ref-highlight');
  });
}

export function showAutocomplete(inputEl) {
  ensureAcEl();
  S.acTarget = inputEl;

  const val = inputEl.value;

  if (val.startsWith('=')) {
    const token = getFormulaToken(inputEl);
    if (!token || token.length < 1) { hideAutocomplete(); return; }

    const matches = FORMULA_LIST.filter((f) => f.startsWith(token));
    if (matches.length === 0 || (matches.length === 1 && matches[0] === token)) {
      hideAutocomplete(); return;
    }

    S.acIndex = 0;
    S.acEl.innerHTML = matches.slice(0, 8).map((f, i) =>
      `<div class="sheet-ac-item${i === 0 ? ' active' : ''}" data-fn="${f}">${f}()</div>`
    ).join('');
  } else {
    if (!val || val.length < 1) { hideAutocomplete(); return; }
    const sheet = getSheet();
    const col = S.editingCol;
    const seen = new Set();
    const suggestions = [];
    for (let r = 0; r < sheet.rows; r++) {
      if (r === S.editingRow) continue;
      const cv = getDisplayValue(sheet, r, col);
      if (cv && !seen.has(cv) && cv.toLowerCase().startsWith(val.toLowerCase()) && cv !== val) {
        seen.add(cv);
        suggestions.push(cv);
        if (suggestions.length >= 6) break;
      }
    }
    if (suggestions.length === 0) { hideAutocomplete(); return; }

    S.acIndex = 0;
    S.acEl.innerHTML = suggestions.map((s, i) =>
      `<div class="sheet-ac-item${i === 0 ? ' active' : ''}" data-fn="${escapeHtml(s)}" data-colval="1">${escapeHtml(s)}</div>`
    ).join('');
  }

  S.acEl.style.display = 'block';

  const rect = inputEl.getBoundingClientRect();
  S.acEl.style.top = rect.bottom + 'px';
  S.acEl.style.left = rect.left + 'px';
  S.acEl.style.width = Math.max(rect.width, 160) + 'px';
}

export function hideAutocomplete() {
  if (S.acEl) { S.acEl.style.display = 'none'; S.acEl.innerHTML = ''; }
  S.acIndex = -1;
  S.acTarget = null;
  S.refInsertStart = -1;
}

export function handleAcKeydown(e, inputEl) {
  if (!S.acEl || S.acEl.style.display === 'none') return false;
  const items = S.acEl.querySelectorAll('.sheet-ac-item');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    S.acIndex = Math.min(S.acIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === S.acIndex));
    return true;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    S.acIndex = Math.max(S.acIndex - 1, 0);
    items.forEach((el, i) => el.classList.toggle('active', i === S.acIndex));
    return true;
  } else if ((e.key === 'Tab' || e.key === 'Enter') && S.acIndex >= 0 && items[S.acIndex]) {
    e.preventDefault();
    if (items[S.acIndex].dataset.colval) {
      acceptColumnValue(items[S.acIndex].dataset.fn);
    } else {
      acceptAutocomplete(items[S.acIndex].dataset.fn);
    }
    return true;
  } else if (e.key === 'Escape') {
    hideAutocomplete();
    return true;
  }
  return false;
}

function acceptAutocomplete(fnName) {
  const inputEl = S.acTarget || S.formulaBarEl;
  const val = inputEl.value;
  const cursor = inputEl.selectionStart;
  const before = val.substring(0, cursor);
  const after = val.substring(cursor);
  const match = before.match(/(?:^=|[,(+\-*/])([A-Z]+)$/i);
  if (match) {
    const start = cursor - match[1].length;
    const newVal = val.substring(0, start) + fnName + '(' + after;
    inputEl.value = newVal;
    const newCursor = start + fnName.length + 1;
    inputEl.setSelectionRange(newCursor, newCursor);
    inputEl.focus();

    if (inputEl !== S.formulaBarEl) S.formulaBarEl.value = newVal;
    else { const ci = getCellInput(); if (ci) ci.value = newVal; }

    S.isFormulaMode = true;
  }
  hideAutocomplete();
}

function acceptColumnValue(value) {
  const inputEl = S.acTarget || S.formulaBarEl;
  inputEl.value = value;
  inputEl.setSelectionRange(value.length, value.length);
  inputEl.focus();
  if (inputEl !== S.formulaBarEl) S.formulaBarEl.value = value;
  else { const ci = getCellInput(); if (ci) ci.value = value; }
  hideAutocomplete();
}
