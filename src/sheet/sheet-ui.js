// OfficeLink SL — Sheet UI (grid rendering + interaction)

import {
  createSheetData, getCell, setCell, setCellFormat,
  getDisplayValue, getRawValue, colToLetter, rcToRef, refToRC,
  addRows, addCols, deleteRow, deleteCol, recalcAll,
} from './sheet-engine.js';

let sheets = [createSheetData()];
let activeSheetIdx = 0;
let selectedRow = 0;
let selectedCol = 0;
let isEditing = false;

// Range selection
let selAnchorRow = 0;
let selAnchorCol = 0;
let isDragging = false;

// Formula editing state — tracks whether user is building a formula
let isFormulaMode = false; // true when editing cell value starts with =
let formulaEditTarget = null; // 'cell' or 'bar' — where editing started
let editingRow = -1; // cell being edited (for reference insertion)
let editingCol = -1;

// Clipboard
let clipboard = null; // { data: [[{raw, format}]], r1, c1, r2, c2 }

// Freeze
let freezeRows = 0;
let freezeCols = 0;

// Formula autocomplete
const FORMULA_LIST = [
  'SUM','AVERAGE','COUNT','COUNTA','MIN','MAX','IF','SUMIF','COUNTIF',
  'VLOOKUP','CONCATENATE','CONCAT','LEFT','RIGHT','MID','LEN','TRIM',
  'UPPER','LOWER','ROUND','ABS','TODAY','NOW',
  'SIN','COS','TAN','ASIN','ACOS','ATAN','ATAN2','SINH','COSH','TANH',
  'SQRT','CBRT','POWER','POW','EXP','LN','LOG','LOG10','LOG2',
  'CEILING','CEIL','FLOOR','MOD','PI','E','DEGREES','RADIANS','SIGN',
  'FACT','COMBIN','PERMUT','GCD','LCM','RAND','RANDBETWEEN',
  'CONVERT','MEDIAN','STDEV','VAR','PRODUCT',
];
let acEl = null;
let acIndex = -1;
let acTarget = null; // the input element autocomplete is bound to

// DOM refs
let gridEl, cellRefEl, formulaBarEl, containerEl;

export function initSheetEditor() {
  gridEl = document.getElementById('sheet-grid');
  cellRefEl = document.getElementById('sheet-cell-ref');
  formulaBarEl = document.getElementById('sheet-formula-bar');
  containerEl = document.getElementById('sheet-container');
  if (!gridEl) return;

  renderGrid();
  bindEvents();
  updateSelection();
}

function getSheet() {
  return sheets[activeSheetIdx];
}

/* ==================== Rendering ==================== */

function renderGrid() {
  const sheet = getSheet();
  let html = '<thead><tr><th class="sheet-corner"></th>';

  for (let c = 0; c < sheet.cols; c++) {
    const cls = c < freezeCols ? 'sheet-col-header sheet-frozen-col-header' : 'sheet-col-header';
    html += `<th class="${cls}" data-col="${c}">${colToLetter(c)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let r = 0; r < sheet.rows; r++) {
    const rowCls = r < freezeRows ? 'sheet-frozen-row' : '';
    html += `<tr class="${rowCls}"><th class="sheet-row-header" data-row="${r}">${r + 1}</th>`;
    for (let c = 0; c < sheet.cols; c++) {
      const cell = getCell(sheet, r, c);
      const val = getDisplayValue(sheet, r, c);
      const style = cellStyle(cell);
      const frozenCls = c < freezeCols ? ' sheet-frozen-col' : '';
      html += `<td data-row="${r}" data-col="${c}" class="${frozenCls}" style="${style}">${escapeHTML(String(val))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  gridEl.innerHTML = html;
  applyFreezeStyles();
}

function renderCell(r, c) {
  const td = gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
  if (!td) return;
  const cell = getCell(getSheet(), r, c);
  td.textContent = getDisplayValue(getSheet(), r, c);
  td.setAttribute('style', cellStyle(cell));
}

function cellStyle(cell) {
  if (!cell || !cell.format) return '';
  const f = cell.format;
  const parts = [];
  if (f.bold) parts.push('font-weight:700');
  if (f.align) parts.push(`text-align:${f.align}`);
  if (f.bg) parts.push(`background:${f.bg}`);
  return parts.join(';');
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ==================== Events ==================== */

function bindEvents() {
  // Cell click → select or insert reference
  gridEl.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    const r = parseInt(td.dataset.row, 10);
    const c = parseInt(td.dataset.col, 10);

    // If editing a formula, insert cell reference instead of changing selection
    if (isEditing && isFormulaMode) {
      insertCellReference(r, c);
      e.preventDefault();
      return;
    }

    if (isEditing) commitEdit();

    if (e.shiftKey) {
      selectedRow = r;
      selectedCol = c;
    } else {
      selectedRow = r;
      selectedCol = c;
      selAnchorRow = r;
      selAnchorCol = c;
    }
    isDragging = true;
    updateSelection();
    e.preventDefault();
  });

  gridEl.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const td = e.target.closest('td[data-row]');
    if (td) {
      const r = parseInt(td.dataset.row, 10);
      const c = parseInt(td.dataset.col, 10);
      if (r !== selectedRow || c !== selectedCol) {
        selectedRow = r;
        selectedCol = c;

        // If dragging during formula mode, extend range reference
        if (isEditing && isFormulaMode) {
          updateRangeReference(r, c);
        } else {
          updateSelection();
        }
      }
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Double-click → edit
  gridEl.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-row]');
    if (td) startEdit();
  });

  // Formula bar events
  formulaBarEl.addEventListener('keydown', (e) => {
    if (handleAcKeydown(e, formulaBarEl)) return;

    if (e.key === 'Enter') {
      hideAutocomplete();
      setCell(getSheet(), selectedRow, selectedCol, formulaBarEl.value);
      recalcAll(getSheet());
      isEditing = false;
      isFormulaMode = false;
      formulaEditTarget = null;
      renderGrid();
      updateSelection();
      formulaBarEl.blur();
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      isEditing = false;
      isFormulaMode = false;
      formulaEditTarget = null;
      formulaBarEl.value = getRawValue(getSheet(), selectedRow, selectedCol);
      formulaBarEl.blur();
    }
  });

  formulaBarEl.addEventListener('input', () => {
    isFormulaMode = formulaBarEl.value.startsWith('=');
    showAutocomplete(formulaBarEl);

    // Sync to cell input if editing in cell
    if (formulaEditTarget === 'cell') {
      const cellInput = getCellInput();
      if (cellInput) cellInput.value = formulaBarEl.value;
    }
  });

  formulaBarEl.addEventListener('focus', () => {
    if (!isEditing) {
      isEditing = true;
      formulaEditTarget = 'bar';
      editingRow = selectedRow;
      editingCol = selectedCol;
      formulaBarEl.value = getRawValue(getSheet(), selectedRow, selectedCol);
      isFormulaMode = formulaBarEl.value.startsWith('=');
    }
  });

  formulaBarEl.addEventListener('blur', () => {
    setTimeout(() => hideAutocomplete(), 150);
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const sheetView = document.getElementById('view-sheet');
    if (!sheetView || !sheetView.classList.contains('active')) return;
    if (document.activeElement === formulaBarEl) return;

    const sheet = getSheet();

    // Copy/Paste
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      e.preventDefault();
      copySelection();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      e.preventDefault();
      pasteSelection();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
      e.preventDefault();
      copySelection();
      clearSelection();
      return;
    }

    if (isEditing) {
      // In-cell editing: only handle Enter/Tab/Escape
      if (e.key === 'Enter') {
        commitEdit();
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
    deleteRow(getSheet(), selectedRow); renderGrid();
    selectedRow = Math.min(selectedRow, getSheet().rows - 1);
    updateSelection();
  });
  document.getElementById('sheet-del-col')?.addEventListener('click', () => {
    deleteCol(getSheet(), selectedCol); renderGrid();
    selectedCol = Math.min(selectedCol, getSheet().cols - 1);
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

  // Freeze toggle
  document.getElementById('sheet-freeze')?.addEventListener('click', () => {
    if (freezeRows > 0 || freezeCols > 0) {
      freezeRows = 0; freezeCols = 0;
    } else {
      freezeRows = selectedRow > 0 ? selectedRow : 1;
      freezeCols = selectedCol > 0 ? selectedCol : 0;
    }
    renderGrid(); updateSelection();
    const btn = document.getElementById('sheet-freeze');
    if (btn) btn.classList.toggle('active', freezeRows > 0 || freezeCols > 0);
  });

  // Sort
  document.getElementById('sheet-sort-asc')?.addEventListener('click', () => sortColumn(true));
  document.getElementById('sheet-sort-desc')?.addEventListener('click', () => sortColumn(false));

  // Sheet tabs
  document.getElementById('sheet-add-tab')?.addEventListener('click', () => {
    sheets.push(createSheetData());
    activeSheetIdx = sheets.length - 1;
    renderSheetTabs(); renderGrid();
    selectedRow = 0; selectedCol = 0;
    updateSelection();
  });

  document.getElementById('sheet-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.sheet-tab');
    if (tab && tab.dataset.sheet != null) {
      activeSheetIdx = parseInt(tab.dataset.sheet, 10);
      renderSheetTabs(); renderGrid();
      selectedRow = 0; selectedCol = 0;
      updateSelection();
    }
  });
}

/* ==================== Cell Selection & Navigation ==================== */

function moveSelection(dr, dc, extend = false) {
  const sheet = getSheet();
  selectedRow = Math.max(0, Math.min(sheet.rows - 1, selectedRow + dr));
  selectedCol = Math.max(0, Math.min(sheet.cols - 1, selectedCol + dc));
  if (!extend) {
    selAnchorRow = selectedRow;
    selAnchorCol = selectedCol;
  }
  updateSelection();
  scrollIntoView();
}

function getSelectionRange() {
  const r1 = Math.min(selAnchorRow, selectedRow);
  const r2 = Math.max(selAnchorRow, selectedRow);
  const c1 = Math.min(selAnchorCol, selectedCol);
  const c2 = Math.max(selAnchorCol, selectedCol);
  return { r1, r2, c1, c2 };
}

function updateSelection() {
  gridEl.querySelectorAll('.selected, .in-range').forEach((el) => {
    el.classList.remove('selected', 'in-range');
  });

  const { r1, r2, c1, c2 } = getSelectionRange();
  const isRange = r1 !== r2 || c1 !== c2;

  if (isRange) {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const td = gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (td) td.classList.add('in-range');
      }
    }
  }

  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (td) td.classList.add('selected');

  if (cellRefEl) {
    cellRefEl.textContent = isRange
      ? `${rcToRef(r1, c1)}:${rcToRef(r2, c2)}`
      : rcToRef(selectedRow, selectedCol);
  }

  if (formulaBarEl && document.activeElement !== formulaBarEl && !isEditing) {
    formulaBarEl.value = getRawValue(getSheet(), selectedRow, selectedCol);
  }
}

function scrollIntoView() {
  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (td && containerEl) {
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/* ==================== Cell Editing ==================== */

function startEdit(initialChar) {
  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (!td) return;
  isEditing = true;
  editingRow = selectedRow;
  editingCol = selectedCol;
  formulaEditTarget = 'cell';
  td.classList.add('editing');
  const raw = initialChar != null ? initialChar : getRawValue(getSheet(), selectedRow, selectedCol);
  isFormulaMode = raw.startsWith('=');
  td.innerHTML = `<input type="text" value="${escapeHTML(raw)}" class="sheet-cell-input" />`;
  const input = td.querySelector('input');
  input.focus();
  if (initialChar != null) {
    input.setSelectionRange(input.value.length, input.value.length);
  } else {
    input.select();
  }

  // Sync to formula bar
  formulaBarEl.value = raw;

  // In-cell input events
  input.addEventListener('input', () => {
    isFormulaMode = input.value.startsWith('=');
    formulaBarEl.value = input.value;
    showAutocomplete(input);
  });

  input.addEventListener('keydown', (e) => {
    if (handleAcKeydown(e, input)) return;

    if (e.key === 'Enter') {
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

function getCellInput() {
  const td = gridEl.querySelector(`td[data-row="${editingRow}"][data-col="${editingCol}"]`);
  return td?.querySelector('input');
}

function commitEdit() {
  const td = gridEl.querySelector(`td[data-row="${editingRow}"][data-col="${editingCol}"]`);
  if (!td) return;
  const input = td.querySelector('input');
  const val = input ? input.value : (formulaEditTarget === 'bar' ? formulaBarEl.value : '');
  if (val !== undefined) {
    setCell(getSheet(), editingRow, editingCol, val);
    recalcAll(getSheet());
  }
  isEditing = false;
  isFormulaMode = false;
  formulaEditTarget = null;
  td.classList.remove('editing');
  renderGrid();
  updateSelection();
  hideAutocomplete();
}

function cancelEdit() {
  isEditing = false;
  isFormulaMode = false;
  formulaEditTarget = null;
  renderCell(editingRow, editingCol);
  const td = gridEl.querySelector(`td[data-row="${editingRow}"][data-col="${editingCol}"]`);
  if (td) td.classList.remove('editing');
  updateSelection();
  hideAutocomplete();
}

/* ==================== Cell Reference Insertion ==================== */

let refInsertStart = -1; // cursor position where ref insertion started

function insertCellReference(r, c) {
  const ref = rcToRef(r, c);
  const input = formulaEditTarget === 'bar' ? formulaBarEl : getCellInput();
  if (!input) return;

  const val = input.value;
  const cursor = input.selectionStart;

  // Check if we should replace a previous reference (e.g., when dragging range)
  if (refInsertStart >= 0 && refInsertStart <= cursor) {
    // Replace from refInsertStart to cursor
    const newVal = val.substring(0, refInsertStart) + ref + val.substring(cursor);
    input.value = newVal;
    const newCursor = refInsertStart + ref.length;
    input.setSelectionRange(newCursor, newCursor);
  } else {
    // Insert at cursor
    refInsertStart = cursor;
    const newVal = val.substring(0, cursor) + ref + val.substring(cursor);
    input.value = newVal;
    const newCursor = cursor + ref.length;
    input.setSelectionRange(newCursor, newCursor);
  }

  // Sync between cell input and formula bar
  if (formulaEditTarget === 'cell') {
    formulaBarEl.value = input.value;
  } else {
    const cellInput = getCellInput();
    if (cellInput) cellInput.value = input.value;
  }

  // Highlight the referenced cell
  highlightRefCell(r, c);

  // Start drag tracking for range reference
  isDragging = true;
  input.focus();
}

function updateRangeReference(r, c) {
  if (refInsertStart < 0) return;
  const startRef = rcToRef(editingRow === r && editingCol === c ? r : Math.min(selAnchorRow, r),
                           editingRow === r && editingCol === c ? c : Math.min(selAnchorCol, c));
  // For range references during drag, use the anchor of the click + current position
  const input = formulaEditTarget === 'bar' ? formulaBarEl : getCellInput();
  if (!input) return;

  // Find the anchor cell (first cell clicked during formula ref insertion)
  // We stored the cursor start in refInsertStart
  const val = input.value;
  const cursor = input.selectionStart;
  const beforeRef = val.substring(0, refInsertStart);
  const afterRef = val.substring(cursor);

  // Build range ref from initial click to current drag position
  // We need to track initial ref click — use a simple approach:
  // The first reference was already inserted, now extend to range
  const existingRef = val.substring(refInsertStart, cursor);
  const baseRef = existingRef.split(':')[0]; // Get the base cell (e.g., A1 from A1:B3)
  const baseRC = refToRC(baseRef);
  if (!baseRC) return;

  const rangeRef = (baseRC[0] === r && baseRC[1] === c)
    ? rcToRef(r, c) // Same cell, just single ref
    : `${baseRef}:${rcToRef(r, c)}`; // Range

  const newVal = beforeRef + rangeRef + afterRef;
  input.value = newVal;
  const newCursor = refInsertStart + rangeRef.length;
  input.setSelectionRange(newCursor, newCursor);

  if (formulaEditTarget === 'cell') formulaBarEl.value = input.value;
  else { const ci = getCellInput(); if (ci) ci.value = input.value; }
}

function highlightRefCell(r, c) {
  gridEl.querySelectorAll('.ref-highlight').forEach((el) => el.classList.remove('ref-highlight'));
  const td = gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
  if (td) td.classList.add('ref-highlight');
}

/* ==================== Copy / Paste ==================== */

function copySelection() {
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
        format: cell?.format ? { ...cell.format } : null,
      });
      textCols.push(getDisplayValue(sheet, r, c));
    }
    data.push(row);
    textRows.push(textCols.join('\t'));
  }

  clipboard = { data, r1, c1, r2, c2 };

  // Also copy to system clipboard as TSV
  const text = textRows.join('\n');
  navigator.clipboard?.writeText(text).catch(() => {});

  // Visual feedback
  gridEl.querySelectorAll('.copy-highlight').forEach((el) => el.classList.remove('copy-highlight'));
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const td = gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
      if (td) td.classList.add('copy-highlight');
    }
  }
  setTimeout(() => {
    gridEl.querySelectorAll('.copy-highlight').forEach((el) => el.classList.remove('copy-highlight'));
  }, 800);
}

function pasteSelection() {
  const sheet = getSheet();

  // Try system clipboard first
  navigator.clipboard?.readText().then((text) => {
    if (text && text.includes('\t')) {
      // Parse TSV from system clipboard
      const rows = text.split('\n').filter((r) => r.length > 0);
      for (let r = 0; r < rows.length; r++) {
        const cols = rows[r].split('\t');
        for (let c = 0; c < cols.length; c++) {
          const tr = selectedRow + r;
          const tc = selectedCol + c;
          if (tr < sheet.rows && tc < sheet.cols) {
            setCell(sheet, tr, tc, cols[c]);
          }
        }
      }
      recalcAll(sheet);
      renderGrid();
      updateSelection();
      return;
    }
    pasteFromInternal();
  }).catch(() => {
    pasteFromInternal();
  });
}

function pasteFromInternal() {
  if (!clipboard) return;
  const sheet = getSheet();
  const { data } = clipboard;

  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const tr = selectedRow + r;
      const tc = selectedCol + c;
      if (tr < sheet.rows && tc < sheet.cols) {
        // Adjust relative references in formulas
        const raw = adjustFormulaReferences(data[r][c].raw,
          tr - clipboard.r1, tc - clipboard.c1);
        setCell(sheet, tr, tc, raw);
        if (data[r][c].format) {
          Object.entries(data[r][c].format).forEach(([k, v]) => {
            if (v != null) setCellFormat(sheet, tr, tc, k, v);
          });
        }
      }
    }
  }
  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

function adjustFormulaReferences(raw, dr, dc) {
  if (!raw || !raw.startsWith('=')) return raw;
  // Adjust cell references: A1 → shifted by dr rows and dc cols
  return raw.replace(/\$?([A-Z]+)\$?(\d+)/g, (match, col, row) => {
    const isAbsCol = match.startsWith('$');
    const isAbsRow = match.includes('$' + row);
    if (isAbsCol && isAbsRow) return match; // $A$1 — absolute, no shift

    let newCol = col;
    let newRow = parseInt(row, 10);

    if (!isAbsCol) {
      // Shift column
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

function clearSelection() {
  const sheet = getSheet();
  const { r1, r2, c1, c2 } = getSelectionRange();
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      setCell(sheet, r, c, '');
    }
  }
  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

/* ==================== Freeze Rows/Columns ==================== */

function applyFreezeStyles() {
  if (freezeRows <= 0 && freezeCols <= 0) return;

  // Frozen rows get position: sticky with top offset
  const frozenRowEls = gridEl.querySelectorAll('.sheet-frozen-row');
  frozenRowEls.forEach((tr, i) => {
    const th = tr.querySelector('th');
    const tds = tr.querySelectorAll('td');
    const top = (i + 1) * 25 + 'px'; // header row height ~25px
    if (th) { th.style.position = 'sticky'; th.style.top = top; th.style.zIndex = '3'; }
    tds.forEach((td) => {
      td.style.position = 'sticky';
      td.style.top = top;
      td.style.zIndex = '2';
      td.style.background = td.style.background || 'var(--bg-primary)';
    });
  });

  // Frozen columns
  const allRows = gridEl.querySelectorAll('tbody tr');
  allRows.forEach((tr) => {
    const frozenCols = tr.querySelectorAll('.sheet-frozen-col');
    frozenCols.forEach((td, i) => {
      const left = 40 + i * 80 + 'px';
      td.style.position = 'sticky';
      td.style.left = left;
      td.style.zIndex = '1';
      td.style.background = td.style.background || 'var(--bg-primary)';
    });
  });
}

/* ==================== Sort ==================== */

function sortColumn(ascending) {
  const sheet = getSheet();
  const col = selectedCol;

  // Gather all data rows (skip headers)
  const rowData = [];
  for (let r = 0; r < sheet.rows; r++) {
    const row = {};
    for (let c = 0; c < sheet.cols; c++) {
      row[c] = { ...getCell(sheet, r, c) };
    }
    row._sortVal = getDisplayValue(sheet, r, col);
    rowData.push(row);
  }

  rowData.sort((a, b) => {
    const va = a._sortVal, vb = b._sortVal;
    const na = parseFloat(va), nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) return ascending ? na - nb : nb - na;
    return ascending ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  // Write sorted data back
  for (let r = 0; r < rowData.length; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const d = rowData[r][c];
      if (d && d.raw != null) {
        sheet.cells[`${r},${c}`] = d;
      } else {
        delete sheet.cells[`${r},${c}`];
      }
    }
  }

  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

/* ==================== Sheet Tabs ==================== */

function renderSheetTabs() {
  const tabsEl = document.getElementById('sheet-tabs');
  if (!tabsEl) return;
  let html = '';
  sheets.forEach((_, i) => {
    html += `<button class="sheet-tab ${i === activeSheetIdx ? 'active' : ''}" data-sheet="${i}">Sheet${i + 1}</button>`;
  });
  html += `<button class="sheet-tab-add" id="sheet-add-tab" title="Add Sheet">+</button>`;
  tabsEl.innerHTML = html;

  document.getElementById('sheet-add-tab')?.addEventListener('click', () => {
    sheets.push(createSheetData());
    activeSheetIdx = sheets.length - 1;
    renderSheetTabs(); renderGrid();
    selectedRow = 0; selectedCol = 0;
    updateSelection();
  });
}

/* ==================== Formula Autocomplete ==================== */

function ensureAcEl() {
  if (acEl) return;
  acEl = document.createElement('div');
  acEl.className = 'sheet-ac-dropdown';
  acEl.style.display = 'none';
  document.body.appendChild(acEl);

  acEl.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.sheet-ac-item');
    if (item) {
      e.preventDefault();
      acceptAutocomplete(item.dataset.fn);
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

function showAutocomplete(inputEl) {
  ensureAcEl();
  acTarget = inputEl;
  const token = getFormulaToken(inputEl);
  if (!token || token.length < 1) { hideAutocomplete(); return; }

  const matches = FORMULA_LIST.filter((f) => f.startsWith(token));
  if (matches.length === 0 || (matches.length === 1 && matches[0] === token)) {
    hideAutocomplete(); return;
  }

  acIndex = 0;
  acEl.innerHTML = matches.slice(0, 8).map((f, i) =>
    `<div class="sheet-ac-item${i === 0 ? ' active' : ''}" data-fn="${f}">${f}()</div>`
  ).join('');
  acEl.style.display = 'block';

  // Position near the input element
  const rect = inputEl.getBoundingClientRect();
  acEl.style.top = rect.bottom + 'px';
  acEl.style.left = rect.left + 'px';
  acEl.style.width = Math.max(rect.width, 160) + 'px';
}

function hideAutocomplete() {
  if (acEl) { acEl.style.display = 'none'; acEl.innerHTML = ''; }
  acIndex = -1;
  acTarget = null;
  refInsertStart = -1;
}

function handleAcKeydown(e, inputEl) {
  if (!acEl || acEl.style.display === 'none') return false;
  const items = acEl.querySelectorAll('.sheet-ac-item');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
    return true;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, 0);
    items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
    return true;
  } else if ((e.key === 'Tab' || e.key === 'Enter') && acIndex >= 0 && items[acIndex]) {
    e.preventDefault();
    acceptAutocomplete(items[acIndex].dataset.fn);
    return true;
  } else if (e.key === 'Escape') {
    hideAutocomplete();
    return true;
  }
  return false;
}

function acceptAutocomplete(fnName) {
  const inputEl = acTarget || formulaBarEl;
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

    // Sync
    if (inputEl !== formulaBarEl) formulaBarEl.value = newVal;
    else { const ci = getCellInput(); if (ci) ci.value = newVal; }

    // Enter formula mode for cell reference insertion
    isFormulaMode = true;
  }
  hideAutocomplete();
}

/* ==================== Export ==================== */

export function getSheetsData() { return sheets; }

export function setSheetsData(newSheets) {
  sheets = newSheets;
  activeSheetIdx = 0;
  renderSheetTabs(); renderGrid();
  selectedRow = 0; selectedCol = 0;
  updateSelection();
}
