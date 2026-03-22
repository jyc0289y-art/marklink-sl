// OfficeLink SL — Sheet UI (grid rendering + interaction)

import {
  createSheetData, getCell, setCell, setCellFormat,
  getDisplayValue, getRawValue, colToLetter, rcToRef,
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
let acEl = null; // autocomplete dropdown element
let acIndex = -1; // highlighted autocomplete index

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

/**
 * Render the entire grid (headers + data cells)
 */
function renderGrid() {
  const sheet = getSheet();
  let html = '<thead><tr><th class="sheet-corner"></th>';

  // Column headers
  for (let c = 0; c < sheet.cols; c++) {
    html += `<th class="sheet-col-header" data-col="${c}">${colToLetter(c)}</th>`;
  }
  html += '</tr></thead><tbody>';

  // Data rows
  for (let r = 0; r < sheet.rows; r++) {
    html += `<tr><th class="sheet-row-header" data-row="${r}">${r + 1}</th>`;
    for (let c = 0; c < sheet.cols; c++) {
      const cell = getCell(sheet, r, c);
      const val = getDisplayValue(sheet, r, c);
      const style = cellStyle(cell);
      html += `<td data-row="${r}" data-col="${c}" style="${style}">${escapeHTML(String(val))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  gridEl.innerHTML = html;
}

/**
 * Render a single cell without full grid re-render
 */
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

/**
 * Bind all events
 */
function bindEvents() {
  // Cell click → select (with drag support)
  gridEl.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td[data-row]');
    if (td) {
      if (isEditing) commitEdit();
      const r = parseInt(td.dataset.row, 10);
      const c = parseInt(td.dataset.col, 10);
      if (e.shiftKey) {
        // Shift-click: extend selection from anchor
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
    }
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
        updateSelection();
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

  // Formula bar
  formulaBarEl.addEventListener('keydown', (e) => {
    // Autocomplete navigation
    if (acEl && acEl.style.display !== 'none') {
      const items = acEl.querySelectorAll('.sheet-ac-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acIndex = Math.min(acIndex + 1, items.length - 1);
        updateAcHighlight(items);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = Math.max(acIndex - 1, 0);
        updateAcHighlight(items);
        return;
      } else if ((e.key === 'Tab' || e.key === 'Enter') && acIndex >= 0 && items[acIndex]) {
        e.preventDefault();
        acceptAutocomplete(items[acIndex].dataset.fn);
        return;
      } else if (e.key === 'Escape') {
        hideAutocomplete();
        return;
      }
    }

    if (e.key === 'Enter') {
      hideAutocomplete();
      setCell(getSheet(), selectedRow, selectedCol, formulaBarEl.value);
      recalcAll(getSheet());
      renderGrid();
      updateSelection();
      formulaBarEl.blur();
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      formulaBarEl.value = getRawValue(getSheet(), selectedRow, selectedCol);
      formulaBarEl.blur();
    }
  });

  formulaBarEl.addEventListener('input', () => {
    showAutocomplete();
  });

  formulaBarEl.addEventListener('focus', () => {
    formulaBarEl.value = getRawValue(getSheet(), selectedRow, selectedCol);
  });

  formulaBarEl.addEventListener('blur', () => {
    // Delay to allow click on autocomplete item
    setTimeout(() => hideAutocomplete(), 150);
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    // Only handle when sheet view is active and not in formula bar
    const sheetView = document.getElementById('view-sheet');
    if (!sheetView || !sheetView.classList.contains('active')) return;
    if (document.activeElement === formulaBarEl) return;

    const sheet = getSheet();

    if (isEditing) {
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
      case 'Backspace': {
        e.preventDefault();
        const { r1, r2, c1, c2 } = getSelectionRange();
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            setCell(sheet, r, c, '');
          }
        }
        recalcAll(sheet);
        renderGrid();
        updateSelection();
        break;
      }
      case 'F2':
        e.preventDefault();
        startEdit();
        break;
      default:
        // Start typing → enter edit mode
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          startEdit(e.key);
          e.preventDefault();
        }
    }
  });

  // Toolbar: add/delete rows/cols
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
    const cell = getCell(getSheet(), selectedRow, selectedCol);
    const isBold = cell?.format?.bold;
    setCellFormat(getSheet(), selectedRow, selectedCol, 'bold', !isBold);
    renderCell(selectedRow, selectedCol);
    updateSelection();
  });

  // Alignment
  document.getElementById('sheet-align-left')?.addEventListener('click', () => {
    setCellFormat(getSheet(), selectedRow, selectedCol, 'align', 'left');
    renderCell(selectedRow, selectedCol); updateSelection();
  });
  document.getElementById('sheet-align-center')?.addEventListener('click', () => {
    setCellFormat(getSheet(), selectedRow, selectedCol, 'align', 'center');
    renderCell(selectedRow, selectedCol); updateSelection();
  });
  document.getElementById('sheet-align-right')?.addEventListener('click', () => {
    setCellFormat(getSheet(), selectedRow, selectedCol, 'align', 'right');
    renderCell(selectedRow, selectedCol); updateSelection();
  });

  // Background color
  document.getElementById('sheet-bg-color')?.addEventListener('input', (e) => {
    setCellFormat(getSheet(), selectedRow, selectedCol, 'bg', e.target.value);
    renderCell(selectedRow, selectedCol); updateSelection();
  });

  // Sheet tabs
  document.getElementById('sheet-add-tab')?.addEventListener('click', () => {
    sheets.push(createSheetData());
    activeSheetIdx = sheets.length - 1;
    renderSheetTabs();
    renderGrid();
    selectedRow = 0; selectedCol = 0;
    updateSelection();
  });

  document.getElementById('sheet-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.sheet-tab');
    if (tab && tab.dataset.sheet != null) {
      activeSheetIdx = parseInt(tab.dataset.sheet, 10);
      renderSheetTabs();
      renderGrid();
      selectedRow = 0; selectedCol = 0;
      updateSelection();
    }
  });
}

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
  // Clear old selection
  gridEl.querySelectorAll('.selected, .in-range').forEach(el => {
    el.classList.remove('selected', 'in-range');
  });

  const { r1, r2, c1, c2 } = getSelectionRange();
  const isRange = r1 !== r2 || c1 !== c2;

  // Highlight range
  if (isRange) {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const td = gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (td) td.classList.add('in-range');
      }
    }
  }

  // Highlight active cell
  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (td) td.classList.add('selected');

  // Update cell ref display
  if (cellRefEl) {
    cellRefEl.textContent = isRange
      ? `${rcToRef(r1, c1)}:${rcToRef(r2, c2)}`
      : rcToRef(selectedRow, selectedCol);
  }

  // Update formula bar
  if (formulaBarEl && document.activeElement !== formulaBarEl) {
    formulaBarEl.value = getRawValue(getSheet(), selectedRow, selectedCol);
  }
}

function scrollIntoView() {
  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (td && containerEl) {
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function startEdit(initialChar) {
  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (!td) return;
  isEditing = true;
  td.classList.add('editing');
  const raw = initialChar != null ? initialChar : getRawValue(getSheet(), selectedRow, selectedCol);
  td.innerHTML = `<input type="text" value="${escapeHTML(raw)}" />`;
  const input = td.querySelector('input');
  input.focus();
  if (initialChar != null) {
    input.setSelectionRange(input.value.length, input.value.length);
  } else {
    input.select();
  }

  input.addEventListener('keydown', (e) => {
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
    e.stopPropagation();
  });
}

function commitEdit() {
  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (!td) return;
  const input = td.querySelector('input');
  if (input) {
    setCell(getSheet(), selectedRow, selectedCol, input.value);
    recalcAll(getSheet());
  }
  isEditing = false;
  td.classList.remove('editing');
  renderGrid();
  updateSelection();
}

function cancelEdit() {
  isEditing = false;
  renderCell(selectedRow, selectedCol);
  const td = gridEl.querySelector(`td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
  if (td) td.classList.remove('editing');
  updateSelection();
}

function renderSheetTabs() {
  const tabsEl = document.getElementById('sheet-tabs');
  if (!tabsEl) return;
  let html = '';
  sheets.forEach((_, i) => {
    html += `<button class="sheet-tab ${i === activeSheetIdx ? 'active' : ''}" data-sheet="${i}">Sheet${i + 1}</button>`;
  });
  html += `<button class="sheet-tab-add" id="sheet-add-tab" title="Add Sheet">+</button>`;
  tabsEl.innerHTML = html;

  // Rebind add tab
  document.getElementById('sheet-add-tab')?.addEventListener('click', () => {
    sheets.push(createSheetData());
    activeSheetIdx = sheets.length - 1;
    renderSheetTabs();
    renderGrid();
    selectedRow = 0; selectedCol = 0;
    updateSelection();
  });
}

/* ── Formula Autocomplete ── */

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

function positionAcEl() {
  if (!acEl || !formulaBarEl) return;
  const rect = formulaBarEl.getBoundingClientRect();
  acEl.style.top = rect.bottom + 'px';
  acEl.style.left = rect.left + 'px';
  acEl.style.width = rect.width + 'px';
}

function getFormulaToken() {
  const val = formulaBarEl.value;
  const cursor = formulaBarEl.selectionStart;
  // Find the last function-like token before cursor
  const before = val.substring(0, cursor);
  const match = before.match(/(?:^=|[,(+\-*/])([A-Z]+)$/i);
  return match ? match[1].toUpperCase() : null;
}

function showAutocomplete() {
  ensureAcEl();
  const token = getFormulaToken();
  if (!token || token.length < 1) {
    hideAutocomplete();
    return;
  }
  const matches = FORMULA_LIST.filter(f => f.startsWith(token));
  if (matches.length === 0 || (matches.length === 1 && matches[0] === token)) {
    hideAutocomplete();
    return;
  }
  acIndex = 0;
  acEl.innerHTML = matches.slice(0, 8).map((f, i) =>
    `<div class="sheet-ac-item${i === 0 ? ' active' : ''}" data-fn="${f}">${f}()</div>`
  ).join('');
  acEl.style.display = 'block';
  positionAcEl();
}

function hideAutocomplete() {
  if (acEl) {
    acEl.style.display = 'none';
    acEl.innerHTML = '';
  }
  acIndex = -1;
}

function updateAcHighlight(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
}

function acceptAutocomplete(fnName) {
  const val = formulaBarEl.value;
  const cursor = formulaBarEl.selectionStart;
  const before = val.substring(0, cursor);
  const after = val.substring(cursor);
  const match = before.match(/(?:^=|[,(+\-*/])([A-Z]+)$/i);
  if (match) {
    const start = cursor - match[1].length;
    const newVal = val.substring(0, start) + fnName + '(' + after;
    formulaBarEl.value = newVal;
    const newCursor = start + fnName.length + 1;
    formulaBarEl.setSelectionRange(newCursor, newCursor);
    formulaBarEl.focus();
  }
  hideAutocomplete();
}

/** Export current sheets data for file saving */
export function getSheetsData() {
  return sheets;
}

/** Import sheets data (from file load) */
export function setSheetsData(newSheets) {
  sheets = newSheets;
  activeSheetIdx = 0;
  renderSheetTabs();
  renderGrid();
  selectedRow = 0;
  selectedCol = 0;
  updateSelection();
}
