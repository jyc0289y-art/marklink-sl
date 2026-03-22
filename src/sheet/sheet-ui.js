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
  'SUM','AVERAGE','COUNT','COUNTA','MIN','MAX','IF','SUMIF','COUNTIF','AVERAGEIF',
  'VLOOKUP','HLOOKUP','INDEX','MATCH','INDIRECT','OFFSET','ROW','COLUMN','ROWS','COLUMNS',
  'CONCATENATE','CONCAT','LEFT','RIGHT','MID','LEN','TRIM','TEXTJOIN','SUBSTITUTE',
  'REPT','FIND','SEARCH','REPLACE','PROPER','EXACT','VALUE','TEXT',
  'UPPER','LOWER','ROUND','ABS','TODAY','NOW',
  'SIN','COS','TAN','ASIN','ACOS','ATAN','ATAN2','SINH','COSH','TANH',
  'SQRT','CBRT','POWER','POW','EXP','LN','LOG','LOG10','LOG2',
  'CEILING','CEIL','FLOOR','MOD','PI','E','DEGREES','RADIANS','SIGN',
  'FACT','COMBIN','PERMUT','GCD','LCM','RAND','RANDBETWEEN',
  'CONVERT','MEDIAN','STDEV','VAR','PRODUCT','SUMPRODUCT',
  'UNIQUE','SORT','FILTER','TRANSPOSE',
  'AND','OR','NOT','IFERROR','IFS','SWITCH','CHOOSE',
  'DATE','YEAR','MONTH','DAY','HOUR','MINUTE','SECOND','WEEKDAY','DATEDIF','EDATE',
  'LARGE','SMALL','RANK','ISBLANK','ISNUMBER','ISTEXT',
];
let acEl = null;
let acIndex = -1;
let acTarget = null; // the input element autocomplete is bound to

// Undo/Redo
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

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
  initResize();
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
    if (hiddenCols.has(c)) {
      html += `<th class="sheet-col-header sheet-hidden-col" data-col="${c}" style="display:none">${colToLetter(c)}</th>`;
      continue;
    }
    const cls = c < freezeCols ? 'sheet-col-header sheet-frozen-col-header' : 'sheet-col-header';
    const w = getColWidth(c);
    html += `<th class="${cls}" data-col="${c}" style="width:${w}px;min-width:${w}px">${colToLetter(c)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let r = 0; r < sheet.rows; r++) {
    // Check if row is in a collapsed group
    const collapsedGroup = rowGroups.find(g => g.collapsed && r >= g.r1 && r <= g.r2);
    if (collapsedGroup && r > collapsedGroup.r1) {
      // Hide rows inside collapsed group (except the first row which shows the toggle)
      continue;
    }
    if (hiddenRows.has(r)) {
      html += `<tr style="display:none" data-hidden-row="${r}"><th class="sheet-row-header" data-row="${r}">${r + 1}</th></tr>`;
      continue;
    }
    // Filter: skip rows that don't match active filters
    if (filterRow >= 0 && r > filterRow) {
      const hasActiveFilter = Object.keys(filterValues).length > 0;
      if (hasActiveFilter) {
        const shouldHide = Object.entries(filterValues).some(([fc, allowed]) => {
          const cellVal = getDisplayValue(sheet, r, parseInt(fc));
          return allowed.size > 0 && !allowed.has(cellVal);
        });
        if (shouldHide) continue;
      }
    }
    // Check if this row starts a group
    const groupIdx = rowGroups.findIndex(g => g.r1 === r);
    const groupIndicator = groupIdx >= 0
      ? `<span class="sheet-group-toggle" data-group="${groupIdx}" style="cursor:pointer;font-size:9px;margin-right:2px;color:var(--accent-color)" title="Toggle group">${rowGroups[groupIdx].collapsed ? '▶' : '▼'}</span>`
      : '';
    const rowCls = r < freezeRows ? 'sheet-frozen-row' : '';
    const rh = getRowHeight(r);
    html += `<tr class="${rowCls}"><th class="sheet-row-header" data-row="${r}" style="height:${rh}px">${groupIndicator}${r + 1}</th>`;
    for (let c = 0; c < sheet.cols; c++) {
      if (hiddenCols.has(c)) {
        html += `<td data-row="${r}" data-col="${c}" style="display:none"></td>`;
        continue;
      }
      const cell = getCell(sheet, r, c);
      // Skip merged cells (hidden by merge)
      if (cell?.format?.merged) continue;
      const val = getDisplayValue(sheet, r, c);
      const style = cellStyle(cell, r, c);
      const frozenCls = c < freezeCols ? ' sheet-frozen-col' : '';
      const mergeSpan = cell?.format?.mergeSpan;
      const spanAttrs = mergeSpan
        ? ` rowspan="${mergeSpan.rows}" colspan="${mergeSpan.cols}"`
        : '';
      const w = getColWidth(c);
      const noteKey = `${r},${c}`;
      const hasNote = cellNotes[noteKey];
      const noteIndicator = hasNote ? '<span class="cell-note-indicator" title="' + escapeHTML(hasNote) + '"></span>' : '';
      const sparkline = cell?.format?.sparkline;
      const cellContent = sparkline
        ? `<img src="${sparkline}" style="width:100%;height:100%;object-fit:contain" alt="sparkline">`
        : escapeHTML(String(val));
      // Filter dropdown on filter header row
      const filterBtn = (filterRow === r)
        ? `<span class="sheet-filter-btn" data-filter-col="${c}" style="cursor:pointer;font-size:9px;float:right;color:${filterValues[c] ? 'var(--accent-color)' : 'var(--text-secondary)'};margin-left:2px" title="Filter">▼</span>`
        : '';
      // Data validation dropdown indicator
      const dvKey = `${r},${c}`;
      const dvIndicator = validations[dvKey]?.type === 'list'
        ? `<span class="sheet-dv-btn" data-dv-row="${r}" data-dv-col="${c}" style="cursor:pointer;font-size:8px;float:right;color:var(--text-secondary);margin-left:1px" title="Dropdown">▾</span>`
        : '';
      html += `<td data-row="${r}" data-col="${c}" class="${frozenCls}" style="width:${w}px;min-width:${w}px;height:${rh}px;${style}"${spanAttrs}>${filterBtn}${dvIndicator}${cellContent}${noteIndicator}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  gridEl.innerHTML = html;
  applyFreezeStyles();
  if (condFormats.length > 0) applyConditionalFormatting();
}

function renderCell(r, c) {
  const td = gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
  if (!td) return;
  const cell = getCell(getSheet(), r, c);
  td.textContent = getDisplayValue(getSheet(), r, c);
  td.setAttribute('style', cellStyle(cell, r, c));
}

function cellStyle(cell, r, c) {
  const parts = [];
  if (cell?.format) {
    const f = cell.format;
    if (f.bold) parts.push('font-weight:700');
    if (f.align) parts.push(`text-align:${f.align}`);
    if (f.bg) parts.push(`background:${f.bg}`);
    if (f.merged) parts.push('display:none');
    if (f.mergeSpan) {
      // Will be applied as attributes, not inline style
    }
  }
  // Conditional formatting
  if (r !== undefined && c !== undefined) {
    const cfStyle = getCondFmtStyle(r, c);
    if (cfStyle) parts.push(cfStyle);
  }
  return parts.join(';');
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ==================== Events ==================== */

function bindEvents() {
  // Group toggle click + filter dropdown
  gridEl.addEventListener('click', (e) => {
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
    }
  });

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

  // Fill handle drag start
  gridEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('fill-handle')) {
      e.preventDefault();
      e.stopPropagation();
      isFilling = true;
      const { r1, r2, c1, c2 } = getSelectionRange();
      fillStartRow = r1; fillStartCol = c1;
      fillEndRow = r2; fillEndCol = c2;
    }
  });

  gridEl.addEventListener('mousemove', (e) => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    const r = parseInt(td.dataset.row, 10);
    const c = parseInt(td.dataset.col, 10);

    // Fill handle drag
    if (isFilling) {
      // Show fill preview
      gridEl.querySelectorAll('.fill-preview').forEach(el => el.classList.remove('fill-preview'));
      const dr = r - fillEndRow;
      const dc = c - fillEndCol;
      // Determine direction: vertical or horizontal
      if (Math.abs(dr) >= Math.abs(dc)) {
        // Vertical fill
        const startR = Math.min(fillEndRow, r);
        const endR = Math.max(fillEndRow, r);
        for (let fr = startR; fr <= endR; fr++) {
          if (fr >= fillStartRow && fr <= fillEndRow) continue;
          for (let fc = fillStartCol; fc <= fillEndCol; fc++) {
            const ftd = gridEl.querySelector(`td[data-row="${fr}"][data-col="${fc}"]`);
            if (ftd) ftd.classList.add('fill-preview');
          }
        }
      } else {
        // Horizontal fill
        const startC = Math.min(fillEndCol, c);
        const endC = Math.max(fillEndCol, c);
        for (let fr = fillStartRow; fr <= fillEndRow; fr++) {
          for (let fc = startC; fc <= endC; fc++) {
            if (fc >= fillStartCol && fc <= fillEndCol) continue;
            const ftd = gridEl.querySelector(`td[data-row="${fr}"][data-col="${fc}"]`);
            if (ftd) ftd.classList.add('fill-preview');
          }
        }
      }
      return;
    }

    if (!isDragging) return;
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
  });

  document.addEventListener('mouseup', (e) => {
    if (isFilling) {
      // Execute fill
      const td = document.elementFromPoint(e.clientX, e.clientY)?.closest('td[data-row]');
      if (td) {
        const r = parseInt(td.dataset.row, 10);
        const c = parseInt(td.dataset.col, 10);
        executeFill(r, c);
      }
      isFilling = false;
      gridEl.querySelectorAll('.fill-preview').forEach(el => el.classList.remove('fill-preview'));
    }
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
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      showSheetFindReplace();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      sheetUndo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      sheetRedo();
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
  document.getElementById('sheet-merge')?.addEventListener('click', () => {
    toggleMerge();
  });

  // Conditional formatting
  document.getElementById('sheet-cond-fmt')?.addEventListener('click', () => {
    showCondFmtDialog();
  });

  // Chart
  document.getElementById('sheet-chart')?.addEventListener('click', () => {
    showChartDialog();
  });

  // Filter
  document.getElementById('sheet-filter')?.addEventListener('click', () => {
    toggleFilter();
  });

  // Find & Replace
  document.getElementById('sheet-find')?.addEventListener('click', () => {
    showSheetFindReplace();
  });

  // Undo/Redo
  document.getElementById('sheet-undo')?.addEventListener('click', () => sheetUndo());
  document.getElementById('sheet-redo')?.addEventListener('click', () => sheetRedo());
  // Custom Sort
  document.getElementById('sheet-sort-custom')?.addEventListener('click', () => showMultiSortDialog());
  // Named Ranges
  document.getElementById('sheet-named-range')?.addEventListener('click', () => showNamedRangeDialog());
  // Sparkline
  document.getElementById('sheet-sparkline')?.addEventListener('click', () => insertSparkline());
  // Chart
  document.getElementById('sheet-insert-chart')?.addEventListener('click', () => showChartDialog());
  // Pivot Table
  document.getElementById('sheet-pivot')?.addEventListener('click', () => showPivotTableDialog());
  // Group Rows
  document.getElementById('sheet-group-rows')?.addEventListener('click', () => toggleGroupRows());
  // Merge Cells
  document.getElementById('sheet-merge-cells')?.addEventListener('click', () => toggleMergeCells());
  // Conditional Formatting
  document.getElementById('sheet-cond-format')?.addEventListener('click', () => showConditionalFormatDialog());
  // Goal Seek
  document.getElementById('sheet-goal-seek')?.addEventListener('click', () => showGoalSeekDialog());
  // Remove Duplicates
  document.getElementById('sheet-remove-dups')?.addEventListener('click', () => removeDuplicates());
  // Text to Columns
  document.getElementById('sheet-text-to-cols')?.addEventListener('click', () => textToColumns());
  // Print Sheet
  document.getElementById('sheet-print')?.addEventListener('click', () => printSheet());

  // CSV Import
  document.getElementById('sheet-import-csv')?.addEventListener('click', () => importCSV());
  // CSV Export
  document.getElementById('sheet-export-csv')?.addEventListener('click', () => exportCSV());
  // XLSX Export
  document.getElementById('sheet-export-xlsx')?.addEventListener('click', () => exportXLSX());

  // Data validation (right-click context menu)
  gridEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    showCellContextMenu(e.clientX, e.clientY, parseInt(td.dataset.row), parseInt(td.dataset.col));
  });

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

// Drag-to-fill state
let isFilling = false;
let fillStartRow = -1;
let fillStartCol = -1;
let fillEndRow = -1;
let fillEndCol = -1;

function updateSelection() {
  gridEl.querySelectorAll('.selected, .in-range, .fill-preview').forEach((el) => {
    el.classList.remove('selected', 'in-range', 'fill-preview');
  });

  // Remove old fill handle
  gridEl.querySelector('.fill-handle')?.remove();

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
  if (td) {
    td.classList.add('selected');

    // Add fill handle to the bottom-right cell of selection
    const anchorTd = isRange
      ? gridEl.querySelector(`td[data-row="${r2}"][data-col="${c2}"]`)
      : td;
    if (anchorTd) {
      const handle = document.createElement('div');
      handle.className = 'fill-handle';
      anchorTd.appendChild(handle);
    }
  }

  if (cellRefEl) {
    cellRefEl.textContent = isRange
      ? `${rcToRef(r1, c1)}:${rcToRef(r2, c2)}`
      : rcToRef(selectedRow, selectedCol);
  }

  if (formulaBarEl && document.activeElement !== formulaBarEl && !isEditing) {
    formulaBarEl.value = getRawValue(getSheet(), selectedRow, selectedCol);
  }

  // Update status bar
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
    leftEl.textContent = 'Ready';
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

  leftEl.textContent = `${count} cells selected`;
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

function saveUndoState() {
  const sheet = getSheet();
  const snapshot = JSON.stringify(sheet.cells);
  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
}

function sheetUndo() {
  if (!undoStack.length) return;
  const sheet = getSheet();
  redoStack.push(JSON.stringify(sheet.cells));
  const prev = undoStack.pop();
  sheet.cells = JSON.parse(prev);
  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

function sheetRedo() {
  if (!redoStack.length) return;
  const sheet = getSheet();
  undoStack.push(JSON.stringify(sheet.cells));
  const next = redoStack.pop();
  sheet.cells = JSON.parse(next);
  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

function commitEdit() {
  const td = gridEl.querySelector(`td[data-row="${editingRow}"][data-col="${editingCol}"]`);
  if (!td) return;
  const input = td.querySelector('input');
  const val = input ? input.value : (formulaEditTarget === 'bar' ? formulaBarEl.value : '');
  if (val !== undefined) {
    saveUndoState();
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

/* ==================== Drag-to-Fill ==================== */

function executeFill(targetR, targetC) {
  const sheet = getSheet();
  const dr = targetR - fillEndRow;
  const dc = targetC - fillEndCol;

  // Gather source data
  const srcRows = fillEndRow - fillStartRow + 1;
  const srcCols = fillEndCol - fillStartCol + 1;
  const srcData = [];
  for (let r = fillStartRow; r <= fillEndRow; r++) {
    const row = [];
    for (let c = fillStartCol; c <= fillEndCol; c++) {
      row.push({
        raw: getRawValue(sheet, r, c),
        val: getDisplayValue(sheet, r, c),
      });
    }
    srcData.push(row);
  }

  if (Math.abs(dr) >= Math.abs(dc) && dr !== 0) {
    // Vertical fill
    const direction = dr > 0 ? 1 : -1;
    const count = Math.abs(dr);
    for (let i = 1; i <= count; i++) {
      const fillR = direction > 0 ? fillEndRow + i : fillStartRow - i;
      for (let c = fillStartCol; c <= fillEndCol; c++) {
        const srcIdx = (direction > 0 ? (i - 1) : (count - i)) % srcRows;
        const src = srcData[srcIdx][c - fillStartCol];
        const newVal = smartFill(src.raw, src.val, i * direction);
        if (fillR >= 0 && fillR < sheet.rows) {
          setCell(sheet, fillR, c, newVal);
        }
      }
    }
  } else if (dc !== 0) {
    // Horizontal fill
    const direction = dc > 0 ? 1 : -1;
    const count = Math.abs(dc);
    for (let r = fillStartRow; r <= fillEndRow; r++) {
      for (let i = 1; i <= count; i++) {
        const fillC = direction > 0 ? fillEndCol + i : fillStartCol - i;
        const srcIdx = (direction > 0 ? (i - 1) : (count - i)) % srcCols;
        const src = srcData[r - fillStartRow][srcIdx];
        const newVal = smartFill(src.raw, src.val, i * direction);
        if (fillC >= 0 && fillC < sheet.cols) {
          setCell(sheet, r, fillC, newVal);
        }
      }
    }
  }

  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

function smartFill(raw, displayVal, offset) {
  // If formula, adjust references
  if (raw.startsWith('=')) {
    return adjustFormulaReferences(raw, offset, 0);
  }

  // If number, increment
  const num = parseFloat(displayVal);
  if (!isNaN(num) && displayVal.trim() !== '') {
    return String(num + offset);
  }

  // If date-like (YYYY-MM-DD), increment days
  if (/^\d{4}-\d{2}-\d{2}$/.test(displayVal)) {
    const d = new Date(displayVal);
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  }

  // Otherwise copy as-is
  return raw;
}

/* ==================== Cell Merge ==================== */

function toggleMerge() {
  const sheet = getSheet();
  const { r1, r2, c1, c2 } = getSelectionRange();
  if (r1 === r2 && c1 === c2) return; // Need at least 2 cells

  // Check if already merged
  const anchor = getCell(sheet, r1, c1);
  if (anchor?.format?.merge) {
    // Unmerge
    setCellFormat(sheet, r1, c1, 'merge', null);
    setCellFormat(sheet, r1, c1, 'mergeSpan', null);
  } else {
    // Merge: keep top-left value, clear others
    const val = getRawValue(sheet, r1, c1);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) continue;
        setCell(sheet, r, c, '');
        setCellFormat(sheet, r, c, 'merged', true); // hidden cell
      }
    }
    setCellFormat(sheet, r1, c1, 'merge', true);
    setCellFormat(sheet, r1, c1, 'mergeSpan', { rows: r2 - r1 + 1, cols: c2 - c1 + 1 });
  }
  renderGrid(); updateSelection();
}

/* ==================== Conditional Formatting ==================== */

let condFormats = []; // { range: {r1,r2,c1,c2}, type, value, color }

function showCondFmtDialog() {
  const existing = document.querySelector('.sheet-cond-dialog');
  if (existing) { existing.remove(); return; }

  const { r1, r2, c1, c2 } = getSelectionRange();
  const rangeStr = `${rcToRef(r1, c1)}:${rcToRef(r2, c2)}`;

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal sheet-cond-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:380px">
      <div class="ai-setup-header">
        <h3>Conditional Formatting</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px">Range: <strong>${rangeStr}</strong></p>
        <div style="margin-bottom:10px">
          <select id="cf-type" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="gt">Greater than</option>
            <option value="lt">Less than</option>
            <option value="eq">Equal to</option>
            <option value="between">Between</option>
            <option value="text">Text contains</option>
            <option value="empty">Is empty</option>
            <option value="notempty">Is not empty</option>
          </select>
        </div>
        <div id="cf-value-row" style="display:flex;gap:8px;margin-bottom:10px">
          <input type="text" id="cf-val1" placeholder="Value" style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
          <input type="text" id="cf-val2" placeholder="Max" style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);display:none">
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <label style="font-size:12px;color:var(--text-secondary)">Highlight color:</label>
          <input type="color" id="cf-color" value="#fde68a" style="width:40px;height:28px;border:1px solid var(--border-color);border-radius:4px">
          <label style="font-size:12px;color:var(--text-secondary);margin-left:8px">Text:</label>
          <input type="color" id="cf-text-color" value="#92400e" style="width:40px;height:28px;border:1px solid var(--border-color);border-radius:4px">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="cf-clear">Clear All</button>
          <button class="ai-pull-btn" id="cf-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const typeSelect = dialog.querySelector('#cf-type');
  const val2Input = dialog.querySelector('#cf-val2');
  typeSelect.addEventListener('change', () => {
    val2Input.style.display = typeSelect.value === 'between' ? '' : 'none';
    dialog.querySelector('#cf-val1').style.display = ['empty', 'notempty'].includes(typeSelect.value) ? 'none' : '';
  });

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#cf-clear')?.addEventListener('click', () => {
    condFormats = condFormats.filter(cf =>
      cf.range.r1 !== r1 || cf.range.r2 !== r2 || cf.range.c1 !== c1 || cf.range.c2 !== c2
    );
    renderGrid(); updateSelection();
    dialog.remove();
  });

  dialog.querySelector('#cf-apply')?.addEventListener('click', () => {
    const type = typeSelect.value;
    const val1 = dialog.querySelector('#cf-val1').value;
    const val2 = dialog.querySelector('#cf-val2').value;
    const bgColor = dialog.querySelector('#cf-color').value;
    const textColor = dialog.querySelector('#cf-text-color').value;

    condFormats.push({
      range: { r1, r2, c1, c2 },
      type, val1, val2, bgColor, textColor,
    });
    renderGrid(); updateSelection();
    dialog.remove();
  });
}

function getCondFmtStyle(r, c) {
  const sheet = getSheet();
  const displayVal = getDisplayValue(sheet, r, c);
  const numVal = parseFloat(displayVal);

  for (const cf of condFormats) {
    if (r < cf.range.r1 || r > cf.range.r2 || c < cf.range.c1 || c > cf.range.c2) continue;

    let match = false;
    switch (cf.type) {
      case 'gt': match = !isNaN(numVal) && numVal > parseFloat(cf.val1); break;
      case 'lt': match = !isNaN(numVal) && numVal < parseFloat(cf.val1); break;
      case 'eq': match = displayVal == cf.val1; break;
      case 'between': match = !isNaN(numVal) && numVal >= parseFloat(cf.val1) && numVal <= parseFloat(cf.val2); break;
      case 'text': match = String(displayVal).toLowerCase().includes(cf.val1.toLowerCase()); break;
      case 'empty': match = displayVal === ''; break;
      case 'notempty': match = displayVal !== ''; break;
    }

    if (match) {
      return `background:${cf.bgColor};color:${cf.textColor}`;
    }
  }
  return '';
}

/* ==================== Charts ==================== */

function showChartDialog() {
  const existing = document.querySelector('.sheet-chart-dialog');
  if (existing) { existing.remove(); return; }

  const { r1, r2, c1, c2 } = getSelectionRange();
  const rangeStr = `${rcToRef(r1, c1)}:${rcToRef(r2, c2)}`;

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal sheet-chart-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:500px">
      <div class="ai-setup-header">
        <h3>Insert Chart</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px">Data range: <strong>${rangeStr}</strong></p>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          ${['bar', 'line', 'pie'].map(t =>
            `<button class="chart-type-btn" data-type="${t}" style="flex:1;padding:10px;border:2px solid var(--border-color);border-radius:8px;background:var(--bg-primary);cursor:pointer;text-align:center;color:var(--text-primary);font-size:13px;font-weight:600">${t === 'bar' ? '📊 Bar' : t === 'line' ? '📈 Line' : '🥧 Pie'}</button>`
          ).join('')}
        </div>
        <canvas id="chart-preview" width="460" height="260" style="border:1px solid var(--border-color);border-radius:8px;width:100%;background:#fff"></canvas>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button class="ai-pull-btn" id="chart-cancel">Cancel</button>
          <button class="ai-pull-btn" id="chart-insert" style="background:var(--brand-color);color:#fff">Insert as Image</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  let chartType = 'bar';

  function drawChart() {
    const canvas = dialog.querySelector('#chart-preview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    const sheet = getSheet();
    const labels = [];
    const values = [];

    // First column = labels, second column = values
    for (let r = r1; r <= r2; r++) {
      labels.push(getDisplayValue(sheet, r, c1) || `Row ${r + 1}`);
      const v = parseFloat(getDisplayValue(sheet, r, c1 < c2 ? c1 + 1 : c1));
      values.push(isNaN(v) ? 0 : v);
    }

    const maxVal = Math.max(...values, 1);
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const pad = 50;

    if (chartType === 'bar') {
      const barW = (W - pad * 2) / values.length - 8;
      ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      values.forEach((v, i) => {
        const x = pad + i * ((W - pad * 2) / values.length) + 4;
        const barH = (v / maxVal) * (H - pad * 2);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, H - pad - barH, barW, barH);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif';
        ctx.fillText(labels[i].slice(0, 8), x + barW / 2, H - pad + 14);
        ctx.fillText(String(v), x + barW / 2, H - pad - barH - 4);
      });
      // Axes
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, pad - 10); ctx.lineTo(pad, H - pad); ctx.lineTo(W - pad + 10, H - pad); ctx.stroke();
    } else if (chartType === 'line') {
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, pad - 10); ctx.lineTo(pad, H - pad); ctx.lineTo(W - pad + 10, H - pad); ctx.stroke();
      const step = (W - pad * 2) / Math.max(values.length - 1, 1);
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = pad + i * step;
        const y = H - pad - (v / maxVal) * (H - pad * 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Points + labels
      values.forEach((v, i) => {
        const x = pad + i * step;
        const y = H - pad - (v / maxVal) * (H - pad * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(labels[i].slice(0, 8), x, H - pad + 14);
      });
    } else if (chartType === 'pie') {
      const total = values.reduce((a, b) => a + b, 0) || 1;
      const cx = W / 2, cy = H / 2 - 10, radius = Math.min(W, H) / 2 - 40;
      let startAngle = -Math.PI / 2;
      values.forEach((v, i) => {
        const slice = (v / total) * Math.PI * 2;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, startAngle, startAngle + slice); ctx.closePath(); ctx.fill();
        // Label
        const midAngle = startAngle + slice / 2;
        const lx = cx + (radius + 16) * Math.cos(midAngle);
        const ly = cy + (radius + 16) * Math.sin(midAngle);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${labels[i].slice(0, 6)} (${Math.round(v / total * 100)}%)`, lx, ly);
        startAngle += slice;
      });
    }
  }

  drawChart();

  dialog.querySelectorAll('.chart-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chartType = btn.dataset.type;
      dialog.querySelectorAll('.chart-type-btn').forEach(b => b.style.borderColor = 'var(--border-color)');
      btn.style.borderColor = 'var(--brand-color)';
      drawChart();
    });
  });
  // Set initial active
  dialog.querySelector(`[data-type="bar"]`).style.borderColor = 'var(--brand-color)';

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.querySelector('#chart-cancel')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#chart-insert')?.addEventListener('click', () => {
    const canvas = dialog.querySelector('#chart-preview');
    const dataUrl = canvas.toDataURL('image/png');
    // Insert chart as image below the sheet
    const chartContainer = document.createElement('div');
    chartContainer.className = 'sheet-chart-embed';
    chartContainer.innerHTML = `<img src="${dataUrl}" style="max-width:100%;border-radius:8px;margin:8px 0">
      <button class="toolbar-btn" style="position:absolute;top:4px;right:4px;font-size:10px" onclick="this.parentElement.remove()">&times;</button>`;
    chartContainer.style.cssText = 'position:relative;display:inline-block;margin:8px';
    containerEl.after(chartContainer);
    dialog.remove();
  });
}

/* ==================== Auto Filter ==================== */

let filterRow = -1; // row index used as filter header
let filterValues = {}; // colIndex → Set of allowed values

function toggleFilter() {
  const sheet = getSheet();
  if (filterRow >= 0) {
    // Remove filter
    filterRow = -1;
    filterValues = {};
    document.getElementById('sheet-filter')?.classList.remove('active');
    renderGrid(); updateSelection();
    return;
  }

  // Set filter on selected row
  filterRow = selectedRow;
  document.getElementById('sheet-filter')?.classList.add('active');
  renderGrid(); updateSelection();
}

function showFilterDropdown(colIdx, anchorEl) {
  document.querySelector('.sheet-filter-dropdown')?.remove();
  const sheet = getSheet();

  // Get unique values in this column (below filter row)
  const uniqueVals = new Set();
  for (let r = filterRow + 1; r < sheet.rows; r++) {
    uniqueVals.add(getDisplayValue(sheet, r, colIdx));
  }
  const sorted = [...uniqueVals].sort();
  const currentFilter = filterValues[colIdx] || new Set();
  const allSelected = currentFilter.size === 0;

  const rect = anchorEl.getBoundingClientRect();
  const dd = document.createElement('div');
  dd.className = 'sheet-filter-dropdown';
  dd.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left - 100}px;width:200px;max-height:300px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:2000;padding:8px;overflow:auto;font-size:12px`;

  let html = `<div style="margin-bottom:6px">
    <input type="text" placeholder="Search..." style="width:100%;padding:4px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:11px" id="filter-search">
  </div>
  <label style="display:flex;align-items:center;gap:6px;padding:4px;cursor:pointer;font-weight:600;border-bottom:1px solid var(--border-color);margin-bottom:4px">
    <input type="checkbox" class="filter-all" ${allSelected ? 'checked' : ''}> Select All
  </label>`;
  sorted.forEach(v => {
    const checked = allSelected || currentFilter.has(v);
    const displayVal = v || '(Blank)';
    html += `<label style="display:flex;align-items:center;gap:6px;padding:2px 4px;cursor:pointer" data-val="${escapeHTML(v)}">
      <input type="checkbox" class="filter-item" value="${escapeHTML(v)}" ${checked ? 'checked' : ''}> ${escapeHTML(displayVal)}
    </label>`;
  });
  html += `<div style="display:flex;gap:4px;margin-top:8px;justify-content:flex-end">
    <button class="toolbar-btn filter-clear" style="padding:2px 8px;font-size:11px">Clear</button>
    <button class="toolbar-btn filter-ok" style="padding:2px 8px;font-size:11px;background:var(--accent-color);color:white;border-radius:4px">OK</button>
  </div>`;
  dd.innerHTML = html;
  document.body.appendChild(dd);

  // Search filter
  dd.querySelector('#filter-search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    dd.querySelectorAll('label[data-val]').forEach(label => {
      const val = label.dataset.val.toLowerCase();
      label.style.display = val.includes(q) ? '' : 'none';
    });
  };

  // Select All
  dd.querySelector('.filter-all').onchange = (e) => {
    dd.querySelectorAll('.filter-item').forEach(cb => { cb.checked = e.target.checked; });
  };

  // Clear
  dd.querySelector('.filter-clear').onclick = () => {
    delete filterValues[colIdx];
    renderGrid(); updateSelection();
    dd.remove();
  };

  // OK
  dd.querySelector('.filter-ok').onclick = () => {
    const selected = new Set();
    dd.querySelectorAll('.filter-item:checked').forEach(cb => selected.add(cb.value));
    if (selected.size === sorted.length || selected.size === 0) {
      delete filterValues[colIdx]; // No filter = show all
    } else {
      filterValues[colIdx] = selected;
    }
    renderGrid(); updateSelection();
    dd.remove();
  };

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!dd.contains(e.target)) { dd.remove(); document.removeEventListener('click', close); }
    });
  }, 100);
}

/* ==================== Find & Replace ==================== */

function showSheetFindReplace() {
  const existing = document.querySelector('.sheet-find-bar');
  if (existing) { existing.remove(); return; }

  const bar = document.createElement('div');
  bar.className = 'sheet-find-bar';
  bar.style.cssText = 'display:flex;gap:6px;padding:6px 12px;background:var(--pane-header-bg);border-bottom:1px solid var(--border-color);align-items:center';
  bar.innerHTML = `
    <input type="text" id="sf-find" placeholder="Find..." style="padding:4px 8px;font-size:13px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);width:160px">
    <input type="text" id="sf-replace" placeholder="Replace..." style="padding:4px 8px;font-size:13px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);width:160px">
    <button class="toolbar-btn" id="sf-next" title="Find Next" style="font-size:12px">▼</button>
    <button class="toolbar-btn" id="sf-replace-btn" title="Replace" style="font-size:11px;width:auto;padding:0 8px">Replace</button>
    <button class="toolbar-btn" id="sf-replace-all" title="Replace All" style="font-size:11px;width:auto;padding:0 8px">All</button>
    <span id="sf-count" style="font-size:11px;color:var(--text-secondary);min-width:50px"></span>
    <button class="toolbar-btn" id="sf-close" title="Close">&times;</button>
  `;

  const toolbar = document.querySelector('#view-sheet .sheet-toolbar');
  toolbar?.after(bar);

  const findInput = bar.querySelector('#sf-find');
  findInput.focus();

  let findResults = [];
  let findIdx = 0;

  function doSearch() {
    findResults = [];
    const query = findInput.value.toLowerCase();
    if (!query) { bar.querySelector('#sf-count').textContent = ''; return; }
    const sheet = getSheet();
    for (let r = 0; r < sheet.rows; r++) {
      for (let c = 0; c < sheet.cols; c++) {
        const val = getDisplayValue(sheet, r, c);
        if (val.toLowerCase().includes(query)) {
          findResults.push({ r, c });
        }
      }
    }
    bar.querySelector('#sf-count').textContent = findResults.length > 0
      ? `${findIdx + 1}/${findResults.length}` : 'No results';
    if (findResults.length > 0) goToResult();
  }

  function goToResult() {
    if (findResults.length === 0) return;
    const res = findResults[findIdx];
    selectedRow = res.r; selectedCol = res.c;
    selAnchorRow = res.r; selAnchorCol = res.c;
    updateSelection(); scrollIntoView();
    bar.querySelector('#sf-count').textContent = `${findIdx + 1}/${findResults.length}`;
  }

  findInput.addEventListener('input', () => { findIdx = 0; doSearch(); });

  bar.querySelector('#sf-next')?.addEventListener('click', () => {
    if (findResults.length === 0) return;
    findIdx = (findIdx + 1) % findResults.length;
    goToResult();
  });

  bar.querySelector('#sf-replace-btn')?.addEventListener('click', () => {
    if (findResults.length === 0) return;
    const res = findResults[findIdx];
    const sheet = getSheet();
    const raw = getRawValue(sheet, res.r, res.c);
    const replaceVal = bar.querySelector('#sf-replace').value;
    const newRaw = raw.replace(new RegExp(findInput.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceVal);
    setCell(sheet, res.r, res.c, newRaw);
    recalcAll(sheet);
    renderGrid(); updateSelection();
    doSearch();
  });

  bar.querySelector('#sf-replace-all')?.addEventListener('click', () => {
    const query = findInput.value;
    if (!query) return;
    const replaceVal = bar.querySelector('#sf-replace').value;
    const sheet = getSheet();
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (let r = 0; r < sheet.rows; r++) {
      for (let c = 0; c < sheet.cols; c++) {
        const raw = getRawValue(sheet, r, c);
        if (raw && raw.toLowerCase().includes(query.toLowerCase())) {
          setCell(sheet, r, c, raw.replace(regex, replaceVal));
        }
      }
    }
    recalcAll(sheet);
    renderGrid(); updateSelection();
    findResults = [];
    bar.querySelector('#sf-count').textContent = 'Replaced all';
  });

  bar.querySelector('#sf-close')?.addEventListener('click', () => bar.remove());

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { bar.querySelector('#sf-next').click(); e.preventDefault(); }
    if (e.key === 'Escape') { bar.remove(); }
  });
}

/* ==================== Cell Context Menu ==================== */

function showCellContextMenu(x, y, r, c) {
  document.querySelector('.sheet-ctx-menu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'sheet-ctx-menu';
  menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px 0;z-index:2000;min-width:180px`;

  const items = [
    { label: '✂️ Cut', action: () => { copySelection(); clearSelection(); } },
    { label: '📋 Copy', action: () => copySelection() },
    { label: '📥 Paste', action: () => pasteSelection() },
    { divider: true },
    { label: '⊞ Merge Cells', action: () => toggleMerge() },
    { label: '🎨 Conditional Format', action: () => showCondFmtDialog() },
    { label: '📈 Insert Chart', action: () => showChartDialog() },
    { divider: true },
    { label: '📋 Set Data Validation', action: () => showDataValidationDialog(r, c) },
    { label: '📝 Add/Edit Note', action: () => addCellNote(r, c) },
    { divider: true },
    { label: '+R Insert Row', action: () => { addRows(getSheet()); renderGrid(); updateSelection(); } },
    { label: '+C Insert Column', action: () => { addCols(getSheet()); renderGrid(); updateSelection(); } },
    { label: '-R Delete Row', action: () => { deleteRow(getSheet(), r); renderGrid(); updateSelection(); } },
    { label: '-C Delete Column', action: () => { deleteCol(getSheet(), c); renderGrid(); updateSelection(); } },
    { divider: true },
    { label: '👁️‍🗨️ Hide Row(s)', action: () => hideSelectedRows() },
    { label: '👁️‍🗨️ Hide Column(s)', action: () => hideSelectedCols() },
    { label: '👁️ Show All Rows', action: () => showAllRows() },
    { label: '👁️ Show All Columns', action: () => showAllCols() },
  ];

  items.forEach(item => {
    if (item.divider) {
      const div = document.createElement('div');
      div.style.cssText = 'height:1px;background:var(--border-color);margin:4px 0';
      menu.appendChild(div);
      return;
    }
    const btn = document.createElement('button');
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 16px;border:none;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer';
    btn.textContent = item.label;
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--hover-bg)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
    btn.addEventListener('click', () => { item.action(); menu.remove(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function close() {
      menu.remove();
      document.removeEventListener('click', close);
    });
  }, 50);
}

/* ==================== Data Validation ==================== */

let validations = {}; // "r,c" → { type, values }

function showDvDropdown(r, c, anchorEl) {
  document.querySelector('.sheet-dv-dropdown')?.remove();
  const key = `${r},${c}`;
  const dv = validations[key];
  if (!dv || dv.type !== 'list') return;

  const rect = anchorEl.getBoundingClientRect();
  const dd = document.createElement('div');
  dd.className = 'sheet-dv-dropdown';
  dd.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left - 60}px;min-width:120px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.12);z-index:2000;padding:4px;font-size:12px`;

  dv.values.forEach(v => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:6px 10px;cursor:pointer;border-radius:4px;transition:background 0.1s';
    item.textContent = v;
    item.onmouseenter = () => item.style.background = 'var(--hover-bg)';
    item.onmouseleave = () => item.style.background = '';
    item.onclick = () => {
      setCell(getSheet(), r, c, v);
      recalcAll(getSheet());
      renderGrid();
      updateSelection();
      dd.remove();
    };
    dd.appendChild(item);
  });

  document.body.appendChild(dd);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!dd.contains(e.target)) { dd.remove(); document.removeEventListener('click', close); }
    });
  }, 50);
}

function showDataValidationDialog(r, c) {
  const existing = document.querySelector('.sheet-dv-dialog');
  if (existing) existing.remove();

  const key = `${r},${c}`;
  const current = validations[key];

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal sheet-dv-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:380px">
      <div class="ai-setup-header">
        <h3>Data Validation — ${rcToRef(r, c)}</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:12px">
          <select id="dv-type" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="list" ${current?.type === 'list' ? 'selected' : ''}>Dropdown List</option>
            <option value="number" ${current?.type === 'number' ? 'selected' : ''}>Number only</option>
            <option value="text" ${current?.type === 'text' ? 'selected' : ''}>Text only</option>
          </select>
        </div>
        <div id="dv-list-row" style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-secondary)">List items (comma-separated)</label>
          <input type="text" id="dv-list" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box" placeholder="Yes, No, Maybe" value="${current?.type === 'list' ? current.values.join(', ') : ''}">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="dv-remove">Remove</button>
          <button class="ai-pull-btn" id="dv-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#dv-remove')?.addEventListener('click', () => {
    delete validations[key];
    renderGrid(); updateSelection();
    dialog.remove();
  });

  dialog.querySelector('#dv-apply')?.addEventListener('click', () => {
    const type = dialog.querySelector('#dv-type').value;
    if (type === 'list') {
      const vals = dialog.querySelector('#dv-list').value.split(',').map(s => s.trim()).filter(Boolean);
      if (vals.length === 0) return;
      // Apply to entire selection range
      const { r1, r2, c1, c2 } = getSelectionRange();
      for (let rr = r1; rr <= r2; rr++) {
        for (let cc = c1; cc <= c2; cc++) {
          validations[`${rr},${cc}`] = { type: 'list', values: vals };
        }
      }
    } else {
      const { r1, r2, c1, c2 } = getSelectionRange();
      for (let rr = r1; rr <= r2; rr++) {
        for (let cc = c1; cc <= c2; cc++) {
          validations[`${rr},${cc}`] = { type };
        }
      }
    }
    renderGrid(); updateSelection();
    dialog.remove();
  });
}

/* ==================== Remove Duplicates ==================== */

function removeDuplicates() {
  const sheet = getSheet();
  const { r1, r2, c1, c2 } = getSelectionRange();

  saveUndoState();

  const seen = new Set();
  let removed = 0;

  for (let r = r1; r <= r2; r++) {
    // Build key from all selected columns
    let rowKey = '';
    for (let c = c1; c <= c2; c++) {
      rowKey += getDisplayValue(sheet, r, c) + '|';
    }

    if (seen.has(rowKey)) {
      // Clear this duplicate row
      for (let c = c1; c <= c2; c++) {
        setCell(sheet, r, c, '');
      }
      removed++;
    } else {
      seen.add(rowKey);
    }
  }

  renderGrid();
  updateSelection();
  alert(`Removed ${removed} duplicate row(s). ${seen.size} unique rows remain.`);
}

/* ==================== Text to Columns ==================== */

function textToColumns() {
  const sheet = getSheet();
  const { r1, r2, c1 } = getSelectionRange();

  const delimiter = prompt('Delimiter (comma, semicolon, tab, space, or custom):', ',');
  if (!delimiter) return;

  const delim = delimiter === 'tab' ? '\t' : delimiter === 'space' ? ' ' : delimiter;

  saveUndoState();

  let maxCols = 0;
  for (let r = r1; r <= r2; r++) {
    const val = getDisplayValue(sheet, r, c1);
    const parts = val.split(delim);
    maxCols = Math.max(maxCols, parts.length);
    for (let i = 0; i < parts.length; i++) {
      setCell(sheet, r, c1 + i, parts[i].trim());
    }
  }

  // Ensure enough columns
  while (sheet.cols < c1 + maxCols + 2) {
    addCols(sheet);
  }

  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

/* ==================== Print Sheet ==================== */

function printSheet() {
  const sheet = getSheet();
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }

  const win = window.open('', '_blank');
  let html = `<!DOCTYPE html><html><head><title>Print Sheet</title><style>
    body { font-family: -apple-system, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; font-size: 11px; }
    @media print { body { margin: 0; } }
  </style></head><body><table><thead><tr><th></th>`;

  for (let c = 0; c <= maxC; c++) {
    html += `<th>${colToLetter(c)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let r = 0; r <= maxR; r++) {
    html += `<tr><th>${r + 1}</th>`;
    for (let c = 0; c <= maxC; c++) {
      html += `<td>${getDisplayValue(sheet, r, c)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></body></html>';

  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

/* ==================== Sparklines ==================== */

function insertSparkline() {
  const sheet = getSheet();
  const { r1, r2, c1, c2 } = getSelectionRange();

  // Collect numeric values from selection
  const vals = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const v = getDisplayValue(sheet, r, c);
      const n = Number(v);
      if (!isNaN(n) && v !== '') vals.push(n);
    }
  }

  if (vals.length < 2) {
    alert('Select at least 2 numeric cells to create a sparkline');
    return;
  }

  // Ask where to place sparkline
  const targetRef = prompt(`Place sparkline at cell (e.g. ${colToLetter(c2 + 1)}${r1 + 1}):`, colToLetter(c2 + 1) + (r1 + 1));
  if (!targetRef) return;
  const target = refToRC(targetRef.toUpperCase());
  if (!target) return;

  // Generate sparkline as SVG data URL
  const svg = generateSparklineSVG(vals, 'line');
  const key = `${target[0]},${target[1]}`;
  if (!sheet.cells[key]) sheet.cells[key] = { raw: '', value: '', format: {} };
  sheet.cells[key].format.sparkline = svg;
  sheet.cells[key].raw = `[sparkline:${vals.join(',')}]`;
  sheet.cells[key].value = '';

  renderGrid();
  updateSelection();
}

function generateSparklineSVG(vals, type = 'line') {
  const w = 120, h = 20;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  if (type === 'line') {
    const points = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * (w - 4) + 2;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x},${y}`;
    }).join(' ');

    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polyline points="${points}" fill="none" stroke="#3b82f6" stroke-width="1.5"/></svg>`)}`;
  } else if (type === 'bar') {
    const barW = (w - 4) / vals.length - 1;
    const bars = vals.map((v, i) => {
      const bh = ((v - min) / range) * (h - 4);
      const x = 2 + i * (barW + 1);
      const y = h - 2 - bh;
      const color = v >= 0 ? '#3b82f6' : '#ef4444';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${color}"/>`;
    }).join('');

    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${bars}</svg>`)}`;
  }
}

/* ==================== Cell Notes ==================== */

let cellNotes = {}; // "r,c" → string

function addCellNote(r, c) {
  const key = `${r},${c}`;
  const existing = cellNotes[key] || '';
  const note = prompt('Cell note:', existing);
  if (note === null) return; // cancelled
  if (note.trim() === '') {
    delete cellNotes[key];
  } else {
    cellNotes[key] = note;
  }
  renderGrid();
  updateSelection();
}

/* ==================== CSV Import/Export ==================== */

function importCSV() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.tsv,.txt';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const delimiter = file.name.endsWith('.tsv') ? '\t' : ',';
      const rows = parseCSV(text, delimiter);
      const sheet = getSheet();
      // Clear current sheet
      sheet.cells = {};
      sheet.rows = Math.max(rows.length + 5, 50);
      sheet.cols = Math.max((rows[0]?.length || 0) + 3, 26);
      // Fill data
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const val = rows[r][c].trim();
          if (val) setCell(sheet, r, c, val);
        }
      }
      renderGrid();
      selectedRow = 0; selectedCol = 0;
      updateSelection();
    };
    reader.readAsText(file);
  };
  input.click();
}

function parseCSV(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip next quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        if (ch === '\r') i++; // skip \n
      } else if (ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  // Last field/row
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function exportCSV() {
  const sheet = getSheet();
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  const lines = [];
  for (let r = 0; r <= maxR; r++) {
    const cols = [];
    for (let c = 0; c <= maxC; c++) {
      let val = getDisplayValue(sheet, r, c);
      // Escape CSV: wrap in quotes if contains comma, quote, or newline
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      cols.push(val);
    }
    lines.push(cols.join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spreadsheet.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function exportXLSX() {
  // Generate a simple XLSX using XML (Office Open XML minimal format)
  const sheet = getSheet();
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }

  // Build sheet XML
  let sheetData = '';
  for (let r = 0; r <= maxR; r++) {
    let rowXml = `<row r="${r + 1}">`;
    for (let c = 0; c <= maxC; c++) {
      const val = getDisplayValue(sheet, r, c);
      if (!val && val !== 0) continue;
      const ref = colToLetter(c) + (r + 1);
      const num = Number(val);
      if (!isNaN(num) && val !== '') {
        rowXml += `<c r="${ref}"><v>${num}</v></c>`;
      } else {
        rowXml += `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(val))}</t></is></c>`;
      }
    }
    rowXml += '</row>';
    sheetData += rowXml;
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetData}</sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  // Create ZIP using JSZip-free approach (minimal zip)
  // Use Blob-based approach
  const files = {
    '_rels/.rels': relsXml,
    'xl/workbook.xml': workbookXml,
    'xl/_rels/workbook.xml.rels': wbRelsXml,
    'xl/worksheets/sheet1.xml': sheetXml,
    '[Content_Types].xml': contentTypesXml,
  };

  createMinimalZip(files).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spreadsheet.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function createMinimalZip(files) {
  // Minimal ZIP file creator (no external dependencies)
  const encoder = new TextEncoder();
  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);

    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true); // signature
    lhView.setUint16(4, 20, true); // version needed
    lhView.setUint16(6, 0, true); // flags
    lhView.setUint16(8, 0, true); // compression (store)
    lhView.setUint16(10, 0, true); // mod time
    lhView.setUint16(12, 0, true); // mod date
    lhView.setUint32(14, crc, true); // crc32
    lhView.setUint32(18, dataBytes.length, true); // compressed size
    lhView.setUint32(22, dataBytes.length, true); // uncompressed size
    lhView.setUint16(26, nameBytes.length, true); // filename length
    lhView.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdEntry.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, dataBytes.length, true);
    cdView.setUint32(24, dataBytes.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0, true);
    cdView.setUint32(42, offset, true);
    cdEntry.set(nameBytes, 46);

    parts.push(localHeader, dataBytes);
    centralDir.push(cdEntry);
    offset += localHeader.length + dataBytes.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, centralDir.length, true);
  eocdView.setUint16(10, centralDir.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);
  parts.push(eocd);

  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/* ==================== Column/Row Resize ==================== */

let isResizingCol = false;
let resizeColIdx = -1;
let resizeStartX = 0;
let resizeStartWidth = 80;
let colWidths = {}; // colIdx → width
let rowHeights = {}; // rowIdx → height
let isResizingRow = false;
let resizeRowIdx = -1;
let resizeStartY = 0;
let resizeStartHeight = 24;

function getColWidth(c) { return colWidths[c] || 80; }
function getRowHeight(r) { return rowHeights[r] || 24; }

function initResize() {
  const container = document.getElementById('sheet-container');
  if (!container) return;

  container.addEventListener('mousedown', (e) => {
    // Check if on column header border (right edge)
    const th = e.target.closest('th.sheet-col-header');
    if (th) {
      const rect = th.getBoundingClientRect();
      if (Math.abs(e.clientX - rect.right) < 5) {
        e.preventDefault();
        isResizingCol = true;
        resizeColIdx = parseInt(th.dataset.col);
        resizeStartX = e.clientX;
        resizeStartWidth = getColWidth(resizeColIdx);
        document.body.style.cursor = 'col-resize';
        return;
      }
    }
    // Check if on row header border (bottom edge)
    const rh = e.target.closest('th.sheet-row-header');
    if (rh) {
      const rect = rh.getBoundingClientRect();
      if (Math.abs(e.clientY - rect.bottom) < 5) {
        e.preventDefault();
        isResizingRow = true;
        resizeRowIdx = parseInt(rh.dataset.row);
        resizeStartY = e.clientY;
        resizeStartHeight = getRowHeight(resizeRowIdx);
        document.body.style.cursor = 'row-resize';
        return;
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isResizingCol) {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(30, resizeStartWidth + diff);
      colWidths[resizeColIdx] = newWidth;
      applyColumnWidth(resizeColIdx, newWidth);
    }
    if (isResizingRow) {
      const diff = e.clientY - resizeStartY;
      const newHeight = Math.max(16, resizeStartHeight + diff);
      rowHeights[resizeRowIdx] = newHeight;
      applyRowHeight(resizeRowIdx, newHeight);
    }

    // Cursor hint on column header right edge
    if (!isResizingCol && !isResizingRow) {
      const th = e.target.closest('th.sheet-col-header');
      if (th) {
        const rect = th.getBoundingClientRect();
        if (Math.abs(e.clientX - rect.right) < 5) {
          th.style.cursor = 'col-resize';
          return;
        }
        th.style.cursor = 'pointer';
      }
      const rh = e.target.closest('th.sheet-row-header');
      if (rh) {
        const rect = rh.getBoundingClientRect();
        if (Math.abs(e.clientY - rect.bottom) < 5) {
          rh.style.cursor = 'row-resize';
          return;
        }
        rh.style.cursor = 'pointer';
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizingCol || isResizingRow) {
      isResizingCol = false;
      isResizingRow = false;
      document.body.style.cursor = '';
    }
  });
}

function applyColumnWidth(colIdx, width) {
  if (!gridEl) return;
  const cells = gridEl.querySelectorAll(`th[data-col="${colIdx}"], td[data-col="${colIdx}"]`);
  cells.forEach(cell => {
    cell.style.width = width + 'px';
    cell.style.minWidth = width + 'px';
  });
}

function applyRowHeight(rowIdx, height) {
  if (!gridEl) return;
  const cells = gridEl.querySelectorAll(`th[data-row="${rowIdx}"], td[data-row="${rowIdx}"]`);
  cells.forEach(cell => {
    cell.style.height = height + 'px';
  });
}

/* ==================== Hide/Show Rows & Columns ==================== */

let hiddenRows = new Set();
let hiddenCols = new Set();

function hideSelectedRows() {
  const { r1, r2 } = getSelectionRange();
  for (let r = r1; r <= r2; r++) hiddenRows.add(r);
  renderGrid();
  updateSelection();
}

function hideSelectedCols() {
  const { c1, c2 } = getSelectionRange();
  for (let c = c1; c <= c2; c++) hiddenCols.add(c);
  renderGrid();
  updateSelection();
}

function showAllRows() {
  hiddenRows.clear();
  renderGrid();
  updateSelection();
}

function showAllCols() {
  hiddenCols.clear();
  renderGrid();
  updateSelection();
}

/* ==================== Charts ==================== */

let chartCounter = 0;

function showChartDialog() {
  const { r1, c1, r2, c2 } = getSelectionRange();
  const sheet = getSheet();

  // Gather data from selection
  const dataRows = [];
  for (let r = r1; r <= r2; r++) {
    const row = [];
    for (let c = c1; c <= c2; c++) {
      row.push(getDisplayValue(sheet, r, c));
    }
    dataRows.push(row);
  }
  if (dataRows.length < 2 || dataRows[0].length < 1) {
    alert('Select at least 2 rows of data to create a chart.');
    return;
  }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:640px;max-height:90vh;overflow:auto">
    <h3 style="margin:0 0 12px">Insert Chart</h3>
    <div style="display:flex;gap:16px">
      <div style="flex:0 0 160px">
        <label style="font-size:12px;font-weight:600">Chart Type</label>
        <select id="chart-type" style="width:100%;padding:6px;margin:4px 0 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
          <option value="bar">Bar Chart</option>
          <option value="column">Column Chart</option>
          <option value="line">Line Chart</option>
          <option value="area">Area Chart</option>
          <option value="pie">Pie Chart</option>
          <option value="scatter">Scatter Plot</option>
          <option value="doughnut">Doughnut</option>
          <option value="radar">Radar Chart</option>
        </select>
        <label style="font-size:12px;font-weight:600">Title</label>
        <input id="chart-title" value="Chart" style="width:100%;padding:6px;margin:4px 0 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <label style="font-size:12px"><input type="checkbox" id="chart-legend" checked> Show Legend</label><br>
        <label style="font-size:12px"><input type="checkbox" id="chart-first-row-labels" checked> First row as labels</label><br>
        <label style="font-size:12px"><input type="checkbox" id="chart-first-col-labels" checked> First column as labels</label>
      </div>
      <div style="flex:1;border:1px solid var(--border-color);border-radius:4px;padding:8px;min-height:300px;display:flex;align-items:center;justify-content:center" id="chart-preview-area">
        <canvas id="chart-preview-canvas" width="400" height="280"></canvas>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button class="toolbar-btn" id="chart-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="chart-insert" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Insert</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  const typeEl = dlg.querySelector('#chart-type');
  const titleEl = dlg.querySelector('#chart-title');
  const legendEl = dlg.querySelector('#chart-legend');
  const firstRowEl = dlg.querySelector('#chart-first-row-labels');
  const firstColEl = dlg.querySelector('#chart-first-col-labels');
  const canvas = dlg.querySelector('#chart-preview-canvas');

  function updatePreview() {
    renderChartToCanvas(canvas, dataRows, typeEl.value, titleEl.value, legendEl.checked, firstRowEl.checked, firstColEl.checked);
  }
  updatePreview();
  typeEl.onchange = updatePreview;
  titleEl.oninput = updatePreview;
  legendEl.onchange = updatePreview;
  firstRowEl.onchange = updatePreview;
  firstColEl.onchange = updatePreview;

  dlg.querySelector('#chart-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#chart-insert').onclick = () => {
    chartCounter++;
    const chartId = `chart-${chartCounter}`;
    const chartDiv = document.createElement('div');
    chartDiv.className = 'sheet-chart-container';
    chartDiv.id = chartId;
    chartDiv.style.cssText = 'position:absolute;width:480px;height:340px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);padding:8px;z-index:100;cursor:move;left:40px;top:40px';
    chartDiv.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:11px;color:var(--text-secondary)">Chart ${chartCounter}</span>
      <button onclick="this.closest('.sheet-chart-container').remove()" style="border:none;background:none;cursor:pointer;font-size:14px;color:var(--text-secondary)">✕</button>
    </div>
    <canvas width="460" height="300"></canvas>`;
    containerEl.style.position = 'relative';
    containerEl.appendChild(chartDiv);
    const c2 = chartDiv.querySelector('canvas');
    renderChartToCanvas(c2, dataRows, typeEl.value, titleEl.value, legendEl.checked, firstRowEl.checked, firstColEl.checked);
    makeDraggable(chartDiv);
    dlg.remove();
  };
}

function makeDraggable(el) {
  let ox, oy, sx, sy;
  el.onmousedown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'CANVAS') return;
    ox = e.clientX; oy = e.clientY;
    sx = el.offsetLeft; sy = el.offsetTop;
    const move = (ev) => { el.style.left = (sx + ev.clientX - ox) + 'px'; el.style.top = (sy + ev.clientY - oy) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
}

const CHART_COLORS = ['#4285f4','#ea4335','#fbbc05','#34a853','#ff6d01','#46bdc6','#7baaf7','#f07b72','#fdd663','#57bb8a','#ff9e40','#78d5dd'];

function renderChartToCanvas(canvas, dataRows, type, title, showLegend, firstRowLabels, firstColLabels) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary') || '#fff';
  ctx.fillRect(0, 0, W, H);

  let labels = [];
  let seriesNames = [];
  let series = [];
  const startRow = firstRowLabels ? 1 : 0;
  const startCol = firstColLabels ? 1 : 0;

  if (firstRowLabels) seriesNames = dataRows[0].slice(startCol);
  if (firstColLabels) labels = dataRows.slice(startRow).map(r => r[0]);

  const numSeries = (dataRows[0] || []).length - startCol;
  for (let s = 0; s < numSeries; s++) {
    const vals = [];
    for (let r = startRow; r < dataRows.length; r++) {
      vals.push(parseFloat(dataRows[r][s + startCol]) || 0);
    }
    series.push(vals);
  }
  if (!labels.length) labels = series[0]?.map((_, i) => `${i + 1}`) || [];
  if (!seriesNames.length) seriesNames = series.map((_, i) => `Series ${i + 1}`);

  const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary') || '#333';
  const gridColor = getComputedStyle(document.body).getPropertyValue('--border-color') || '#ddd';

  // Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, W / 2, 18);

  if (type === 'pie' || type === 'doughnut') {
    renderPieChart(ctx, W, H, series[0] || [], labels, type === 'doughnut', showLegend, textColor);
    return;
  }
  if (type === 'radar') {
    renderRadarChart(ctx, W, H, series, labels, seriesNames, showLegend, textColor);
    return;
  }

  // Axis charts (bar, column, line, area, scatter)
  const pad = { top: 30, right: 20, bottom: 50, left: 50 };
  if (showLegend) pad.bottom += 20;
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const allVals = series.flat();
  let maxVal = Math.max(...allVals, 1);
  let minVal = Math.min(...allVals, 0);
  if (minVal > 0) minVal = 0;
  const range = maxVal - minVal || 1;

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'right';
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = pad.top + cH - (i / gridSteps) * cH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    const val = minVal + (i / gridSteps) * range;
    ctx.fillText(val % 1 === 0 ? val.toString() : val.toFixed(1), pad.left - 4, y + 3);
  }

  // X labels
  ctx.textAlign = 'center';
  ctx.font = '10px system-ui, sans-serif';
  const n = labels.length || 1;

  if (type === 'bar') {
    // Horizontal bars
    const barH = cH / n * 0.7 / Math.max(series.length, 1);
    const gap = cH / n * 0.3;
    for (let i = 0; i < n; i++) {
      const baseY = pad.top + (i / n) * cH;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'right';
      ctx.fillText(labels[i] || '', pad.left - 4, baseY + cH / n / 2 + 3);
      for (let s = 0; s < series.length; s++) {
        const v = series[s][i] || 0;
        const barW = ((v - minVal) / range) * cW;
        ctx.fillStyle = CHART_COLORS[s % CHART_COLORS.length];
        ctx.fillRect(pad.left, baseY + gap / 2 + s * barH, barW, barH);
      }
    }
  } else if (type === 'column') {
    const grpW = cW / n;
    const barW = grpW * 0.7 / Math.max(series.length, 1);
    for (let i = 0; i < n; i++) {
      const x = pad.left + i * grpW;
      ctx.fillStyle = textColor;
      ctx.fillText(labels[i] || '', x + grpW / 2, pad.top + cH + 14);
      for (let s = 0; s < series.length; s++) {
        const v = series[s][i] || 0;
        const barH = ((v - minVal) / range) * cH;
        ctx.fillStyle = CHART_COLORS[s % CHART_COLORS.length];
        ctx.fillRect(x + (grpW * 0.15) + s * barW, pad.top + cH - barH, barW, barH);
      }
    }
  } else if (type === 'line' || type === 'area') {
    for (let s = 0; s < series.length; s++) {
      ctx.strokeStyle = CHART_COLORS[s % CHART_COLORS.length];
      ctx.fillStyle = CHART_COLORS[s % CHART_COLORS.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      const points = [];
      for (let i = 0; i < n; i++) {
        const x = pad.left + (i / (n - 1 || 1)) * cW;
        const y = pad.top + cH - ((series[s][i] - minVal) / range) * cH;
        points.push({ x, y });
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (type === 'area') {
        ctx.lineTo(pad.left + cW, pad.top + cH);
        ctx.lineTo(pad.left, pad.top + cH);
        ctx.closePath();
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      }
      ctx.stroke();
      // dots
      points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
    }
    // x labels
    for (let i = 0; i < n; i++) {
      const x = pad.left + (i / (n - 1 || 1)) * cW;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i] || '', x, pad.top + cH + 14);
    }
  } else if (type === 'scatter') {
    // Use first two series as X,Y
    const xs = series[0] || [];
    const ys = series[1] || series[0] || [];
    const xMax = Math.max(...xs, 1);
    const yMax = Math.max(...ys, 1);
    ctx.fillStyle = CHART_COLORS[0];
    for (let i = 0; i < xs.length; i++) {
      const x = pad.left + (xs[i] / xMax) * cW;
      const y = pad.top + cH - (ys[i] / yMax) * cH;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Legend
  if (showLegend && series.length > 0) {
    const ly = H - 14;
    let lx = W / 2 - (seriesNames.length * 70) / 2;
    ctx.font = '10px system-ui, sans-serif';
    for (let s = 0; s < seriesNames.length; s++) {
      ctx.fillStyle = CHART_COLORS[s % CHART_COLORS.length];
      ctx.fillRect(lx, ly - 8, 12, 8);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(seriesNames[s], lx + 16, ly);
      lx += 70;
    }
  }
}

function renderPieChart(ctx, W, H, data, labels, isDoughnut, showLegend, textColor) {
  const total = data.reduce((a, b) => a + b, 0) || 1;
  const cx = W / 2, cy = H / 2 + 10;
  const radius = Math.min(W, H) / 2 - (showLegend ? 50 : 30);
  let angle = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) {
    const slice = (data[i] / total) * Math.PI * 2;
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fill();
    // Label
    const mid = angle + slice / 2;
    const lx = cx + Math.cos(mid) * radius * 0.65;
    const ly = cy + Math.sin(mid) * radius * 0.65;
    const pct = ((data[i] / total) * 100).toFixed(1);
    if (parseFloat(pct) > 3) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(pct + '%', lx, ly + 4);
    }
    angle += slice;
  }
  if (isDoughnut) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary') || '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (showLegend) {
    ctx.font = '10px system-ui';
    let ly = H - 14;
    let lx = W / 2 - (labels.length * 60) / 2;
    for (let i = 0; i < labels.length; i++) {
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.fillRect(lx, ly - 8, 10, 8);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(labels[i], lx + 14, ly);
      lx += 60;
    }
  }
}

function renderRadarChart(ctx, W, H, series, labels, seriesNames, showLegend, textColor) {
  const cx = W / 2, cy = H / 2 + 10;
  const radius = Math.min(W, H) / 2 - (showLegend ? 50 : 30);
  const n = labels.length || 1;
  const allVals = series.flat();
  const maxVal = Math.max(...allVals, 1);

  // Grid
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border-color') || '#ddd';
  ctx.lineWidth = 0.5;
  for (let ring = 1; ring <= 4; ring++) {
    const r = (ring / 4) * radius;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Spokes + labels
  ctx.font = '10px system-ui';
  ctx.fillStyle = textColor;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
    const lx = cx + Math.cos(a) * (radius + 14);
    const ly = cy + Math.sin(a) * (radius + 14);
    ctx.textAlign = 'center';
    ctx.fillText(labels[i] || '', lx, ly + 4);
  }
  // Data
  for (let s = 0; s < series.length; s++) {
    ctx.strokeStyle = CHART_COLORS[s % CHART_COLORS.length];
    ctx.fillStyle = CHART_COLORS[s % CHART_COLORS.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = (series[s][i] / maxVal) * radius;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  if (showLegend) {
    let lx = W / 2 - (seriesNames.length * 70) / 2;
    ctx.font = '10px system-ui';
    for (let s = 0; s < seriesNames.length; s++) {
      ctx.fillStyle = CHART_COLORS[s % CHART_COLORS.length];
      ctx.fillRect(lx, H - 14 - 8, 12, 8);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(seriesNames[s], lx + 16, H - 14);
      lx += 70;
    }
  }
}

/* ==================== Cell Merge ==================== */

let mergedCells = []; // [{r1,c1,r2,c2}]

function toggleMergeCells() {
  const sheet = getSheet();
  const { r1, c1, r2, c2 } = getSelectionRange();
  const topCell = getCell(sheet, r1, c1);

  // Check if top-left cell already has a merge span (unmerge)
  if (topCell?.format?.mergeSpan) {
    const ms = topCell.format.mergeSpan;
    // Clear merge from all cells in the range
    for (let r = r1; r < r1 + ms.rows; r++) {
      for (let c = c1; c < c1 + ms.cols; c++) {
        const cell = getCell(sheet, r, c);
        if (cell?.format) {
          delete cell.format.merged;
          delete cell.format.mergeSpan;
        }
      }
    }
  } else if (r1 !== r2 || c1 !== c2) {
    // Merge: set top-left as span, rest as hidden
    saveUndoState();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) {
          setCellFormat(sheet, r, c, 'mergeSpan', { rows: r2 - r1 + 1, cols: c2 - c1 + 1 });
        } else {
          setCellFormat(sheet, r, c, 'merged', true);
        }
      }
    }
  }
  renderGrid();
  updateSelection();
}

function getMergeInfo(r, c) {
  for (const m of mergedCells) {
    if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) {
      return m;
    }
  }
  return null;
}

/* ==================== Conditional Formatting ==================== */

let condFormats = []; // [{type, range:{r1,c1,r2,c2}, config:{...}}]

function showConditionalFormatDialog() {
  const { r1, c1, r2, c2 } = getSelectionRange();
  const rangeStr = `${colToLetter(c1)}${r1 + 1}:${colToLetter(c2)}${r2 + 1}`;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:440px">
    <h3 style="margin:0 0 12px">Conditional Formatting</h3>
    <div style="margin-bottom:8px;font-size:12px">Range: <strong>${rangeStr}</strong></div>
    <label style="font-size:12px;font-weight:600">Format Type</label>
    <select id="cf-type" style="width:100%;padding:6px;margin:4px 0 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
      <option value="colorScale">Color Scale (min→max)</option>
      <option value="dataBar">Data Bars</option>
      <option value="iconSet">Icon Set</option>
      <option value="greaterThan">Greater Than</option>
      <option value="lessThan">Less Than</option>
      <option value="between">Between</option>
      <option value="text">Text Contains</option>
      <option value="duplicate">Duplicate Values</option>
      <option value="top10">Top 10</option>
    </select>
    <div id="cf-options"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button class="toolbar-btn" id="cf-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="cf-apply" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Apply</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  const typeEl = dlg.querySelector('#cf-type');
  const optEl = dlg.querySelector('#cf-options');

  function updateOptions() {
    const t = typeEl.value;
    let html = '';
    if (t === 'colorScale') {
      html = `<div style="display:flex;gap:8px;margin-top:4px">
        <label style="font-size:12px">Min color: <input type="color" id="cf-min-color" value="#f8696b"></label>
        <label style="font-size:12px">Mid color: <input type="color" id="cf-mid-color" value="#ffeb84"></label>
        <label style="font-size:12px">Max color: <input type="color" id="cf-max-color" value="#63be7b"></label>
      </div>`;
    } else if (t === 'dataBar') {
      html = `<label style="font-size:12px">Bar color: <input type="color" id="cf-bar-color" value="#4285f4"></label>`;
    } else if (t === 'iconSet') {
      html = `<select id="cf-icon-set" style="width:100%;padding:4px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <option value="arrows">Arrows (↑ → ↓)</option>
        <option value="circles">Circles (🟢 🟡 🔴)</option>
        <option value="stars">Stars (★ ☆)</option>
        <option value="flags">Flags (🟩 🟨 🟥)</option>
      </select>`;
    } else if (t === 'greaterThan' || t === 'lessThan') {
      html = `<input type="number" id="cf-value" placeholder="Value" style="width:100%;padding:6px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <label style="font-size:12px;margin-top:4px;display:block">Highlight: <input type="color" id="cf-highlight" value="#fce4ec"></label>`;
    } else if (t === 'between') {
      html = `<div style="display:flex;gap:8px;margin-top:4px">
        <input type="number" id="cf-val-min" placeholder="Min" style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <input type="number" id="cf-val-max" placeholder="Max" style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
      </div>
      <label style="font-size:12px;margin-top:4px;display:block">Highlight: <input type="color" id="cf-highlight" value="#e8f5e9"></label>`;
    } else if (t === 'text') {
      html = `<input type="text" id="cf-text" placeholder="Text to find" style="width:100%;padding:6px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <label style="font-size:12px;margin-top:4px;display:block">Highlight: <input type="color" id="cf-highlight" value="#fff3e0"></label>`;
    } else if (t === 'duplicate') {
      html = `<label style="font-size:12px;margin-top:4px;display:block">Highlight: <input type="color" id="cf-highlight" value="#fce4ec"></label>`;
    } else if (t === 'top10') {
      html = `<input type="number" id="cf-top-n" value="10" min="1" style="width:80px;padding:6px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <label style="font-size:12px;margin-top:4px;display:block">Highlight: <input type="color" id="cf-highlight" value="#e3f2fd"></label>`;
    }
    optEl.innerHTML = html;
  }
  updateOptions();
  typeEl.onchange = updateOptions;

  dlg.querySelector('#cf-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#cf-apply').onclick = () => {
    const t = typeEl.value;
    const config = { type: t };
    if (t === 'colorScale') {
      config.minColor = dlg.querySelector('#cf-min-color').value;
      config.midColor = dlg.querySelector('#cf-mid-color').value;
      config.maxColor = dlg.querySelector('#cf-max-color').value;
    } else if (t === 'dataBar') {
      config.barColor = dlg.querySelector('#cf-bar-color').value;
    } else if (t === 'iconSet') {
      config.iconSet = dlg.querySelector('#cf-icon-set').value;
    } else if (t === 'greaterThan' || t === 'lessThan') {
      config.value = parseFloat(dlg.querySelector('#cf-value').value) || 0;
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'between') {
      config.min = parseFloat(dlg.querySelector('#cf-val-min').value) || 0;
      config.max = parseFloat(dlg.querySelector('#cf-val-max').value) || 0;
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'text') {
      config.text = dlg.querySelector('#cf-text').value;
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'duplicate') {
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'top10') {
      config.n = parseInt(dlg.querySelector('#cf-top-n').value) || 10;
      config.highlight = dlg.querySelector('#cf-highlight').value;
    }
    condFormats.push({ range: { r1, c1, r2, c2 }, config });
    applyConditionalFormatting();
    dlg.remove();
  };
}

function applyConditionalFormatting() {
  const sheet = getSheet();
  // Clear previous conditional styles
  gridEl.querySelectorAll('[data-cf-style]').forEach(el => {
    el.style.background = '';
    el.removeAttribute('data-cf-style');
    const bar = el.querySelector('.cf-data-bar');
    if (bar) bar.remove();
    const icon = el.querySelector('.cf-icon');
    if (icon) icon.remove();
  });

  for (const cf of condFormats) {
    const { r1, c1, r2, c2 } = cf.range;
    const cfg = cf.config;

    // Gather values
    const vals = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const v = parseFloat(getDisplayValue(sheet, r, c));
        if (!isNaN(v)) vals.push(v);
      }
    }
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const rangeV = maxV - minV || 1;

    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const td = gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (!td) continue;
        const raw = getDisplayValue(sheet, r, c);
        const v = parseFloat(raw);

        if (cfg.type === 'colorScale' && !isNaN(v)) {
          const ratio = (v - minV) / rangeV;
          td.style.background = interpolateColor(cfg.minColor, cfg.midColor, cfg.maxColor, ratio);
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'dataBar' && !isNaN(v)) {
          const pct = Math.max(0, ((v - minV) / rangeV) * 100);
          td.style.position = 'relative';
          const bar = document.createElement('div');
          bar.className = 'cf-data-bar';
          bar.style.cssText = `position:absolute;left:0;bottom:0;height:3px;width:${pct}%;background:${cfg.barColor};opacity:0.6;pointer-events:none`;
          td.appendChild(bar);
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'iconSet' && !isNaN(v)) {
          const ratio = (v - minV) / rangeV;
          const icons = { arrows: ['↓','→','↑'], circles: ['🔴','🟡','🟢'], stars: ['☆','★','★'], flags: ['🟥','🟨','🟩'] };
          const set = icons[cfg.iconSet] || icons.arrows;
          const icon = document.createElement('span');
          icon.className = 'cf-icon';
          icon.style.cssText = 'margin-right:4px;font-size:10px';
          icon.textContent = ratio < 0.33 ? set[0] : ratio < 0.67 ? set[1] : set[2];
          td.insertBefore(icon, td.firstChild);
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'greaterThan' && !isNaN(v) && v > cfg.value) {
          td.style.background = cfg.highlight;
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'lessThan' && !isNaN(v) && v < cfg.value) {
          td.style.background = cfg.highlight;
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'between' && !isNaN(v) && v >= cfg.min && v <= cfg.max) {
          td.style.background = cfg.highlight;
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'text' && raw.toString().toLowerCase().includes(cfg.text.toLowerCase())) {
          td.style.background = cfg.highlight;
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'duplicate') {
          // count occurrences
          let count = 0;
          for (let rr = r1; rr <= r2; rr++) {
            for (let cc = c1; cc <= c2; cc++) {
              if (getDisplayValue(sheet, rr, cc) === raw) count++;
            }
          }
          if (count > 1 && raw !== '') {
            td.style.background = cfg.highlight;
            td.setAttribute('data-cf-style', '1');
          }
        } else if (cfg.type === 'top10' && !isNaN(v)) {
          const sorted = [...vals].sort((a, b) => b - a);
          const threshold = sorted[Math.min(cfg.n - 1, sorted.length - 1)];
          if (v >= threshold) {
            td.style.background = cfg.highlight;
            td.setAttribute('data-cf-style', '1');
          }
        }
      }
    }
  }
}

function interpolateColor(c1, c2, c3, ratio) {
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = hex(c1);
  const [r2, g2, b2] = hex(c2);
  const [r3, g3, b3] = hex(c3);
  let r, g, b;
  if (ratio < 0.5) {
    const t = ratio * 2;
    r = Math.round(r1 + (r2 - r1) * t);
    g = Math.round(g1 + (g2 - g1) * t);
    b = Math.round(b1 + (b2 - b1) * t);
  } else {
    const t = (ratio - 0.5) * 2;
    r = Math.round(r2 + (r3 - r2) * t);
    g = Math.round(g2 + (g3 - g2) * t);
    b = Math.round(b2 + (b3 - b2) * t);
  }
  return `rgb(${r},${g},${b})`;
}

/* ==================== Goal Seek ==================== */

function showGoalSeekDialog() {
  const sheet = getSheet();
  const currentRef = `${colToLetter(selectedCol)}${selectedRow + 1}`;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:380px">
    <h3 style="margin:0 0 12px">Goal Seek</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px">Find the input value needed to achieve a target result.</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div>
        <label style="font-size:12px;font-weight:600">Set cell (formula cell):</label>
        <input type="text" id="gs-set-cell" value="${currentRef}" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);margin-top:2px">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600">To value:</label>
        <input type="number" id="gs-target" value="100" step="any" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);margin-top:2px">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600">By changing cell:</label>
        <input type="text" id="gs-change-cell" placeholder="e.g. B1" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);margin-top:2px">
      </div>
    </div>
    <div id="gs-result" style="margin-top:12px;padding:8px;border-radius:4px;font-size:12px;display:none"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button class="toolbar-btn" id="gs-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="gs-run" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Seek</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  dlg.querySelector('#gs-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#gs-run').onclick = () => {
    const setRef = dlg.querySelector('#gs-set-cell').value.trim().toUpperCase();
    const target = parseFloat(dlg.querySelector('#gs-target').value);
    const changeRef = dlg.querySelector('#gs-change-cell').value.trim().toUpperCase();
    const resultEl = dlg.querySelector('#gs-result');

    if (!setRef || isNaN(target) || !changeRef) {
      resultEl.style.display = 'block';
      resultEl.style.background = '#ffebee';
      resultEl.textContent = 'Please fill in all fields.';
      return;
    }

    const setRC = refToRC(setRef);
    const changeRC = refToRC(changeRef);
    if (!setRC || !changeRC) {
      resultEl.style.display = 'block';
      resultEl.style.background = '#ffebee';
      resultEl.textContent = 'Invalid cell reference.';
      return;
    }

    // Save original value
    const origVal = getRawValue(sheet, changeRC.r, changeRC.c);

    // Binary search / Newton's method to find the right value
    let lo = -1e6, hi = 1e6, mid, bestVal = 0, bestDiff = Infinity;
    const maxIter = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIter; i++) {
      mid = (lo + hi) / 2;
      setCell(sheet, changeRC.r, changeRC.c, String(mid));
      recalcAll(sheet);
      const result = parseFloat(getDisplayValue(sheet, setRC.r, setRC.c)) || 0;
      const diff = result - target;

      if (Math.abs(diff) < Math.abs(bestDiff)) {
        bestDiff = diff;
        bestVal = mid;
      }

      if (Math.abs(diff) < tolerance) break;

      // Try to determine direction
      setCell(sheet, changeRC.r, changeRC.c, String(mid + 1));
      recalcAll(sheet);
      const resultPlus = parseFloat(getDisplayValue(sheet, setRC.r, setRC.c)) || 0;
      const slope = resultPlus - result;

      if (slope > 0) {
        if (diff > 0) hi = mid; else lo = mid;
      } else if (slope < 0) {
        if (diff > 0) lo = mid; else hi = mid;
      } else {
        break;
      }
    }

    // Apply best value
    setCell(sheet, changeRC.r, changeRC.c, String(parseFloat(bestVal.toFixed(6))));
    recalcAll(sheet);
    renderGrid();
    updateSelection();

    resultEl.style.display = 'block';
    if (Math.abs(bestDiff) < 0.01) {
      resultEl.style.background = '#e8f5e9';
      resultEl.innerHTML = `<strong>Solution found!</strong><br>${changeRef} = ${bestVal.toFixed(4)}<br>Result: ${getDisplayValue(sheet, setRC.r, setRC.c)}`;
    } else {
      resultEl.style.background = '#fff3e0';
      resultEl.innerHTML = `<strong>Approximate solution:</strong><br>${changeRef} = ${bestVal.toFixed(4)}<br>Result: ${getDisplayValue(sheet, setRC.r, setRC.c)} (target: ${target})`;
    }
  };
}

/* ==================== Multi-Level Sort ==================== */

function showMultiSortDialog() {
  const sheet = getSheet();
  const { r1, c1, r2, c2 } = getSelectionRange();

  // Get column headers
  const colOptions = [];
  for (let c = 0; c < sheet.cols; c++) {
    const label = getDisplayValue(sheet, 0, c) || colToLetter(c);
    colOptions.push(`<option value="${c}">${colToLetter(c)} — ${label}</option>`);
  }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:480px">
    <h3 style="margin:0 0 12px">Custom Sort</h3>
    <div id="sort-levels" style="display:flex;flex-direction:column;gap:8px"></div>
    <button id="sort-add-level" style="margin-top:8px;padding:4px 12px;font-size:12px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer">+ Add Level</button>
    <label style="font-size:12px;display:block;margin-top:8px"><input type="checkbox" id="sort-has-header" checked> My data has headers</label>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button class="toolbar-btn" id="sort-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="sort-apply" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Sort</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  const levelsEl = dlg.querySelector('#sort-levels');
  let sortLevels = [{ col: selectedCol, asc: true }];

  function renderLevels() {
    levelsEl.innerHTML = sortLevels.map((lvl, i) => `
      <div style="display:flex;gap:8px;align-items:center;padding:8px;background:var(--hover-bg);border-radius:4px">
        <span style="font-size:11px;font-weight:600;min-width:60px">${i === 0 ? 'Sort by' : 'Then by'}</span>
        <select data-level="${i}" data-field="col" style="flex:1;padding:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
          ${colOptions.join('')}
        </select>
        <select data-level="${i}" data-field="order" style="padding:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
          <option value="asc"${lvl.asc ? ' selected' : ''}>A→Z / Small→Large</option>
          <option value="desc"${!lvl.asc ? ' selected' : ''}>Z→A / Large→Small</option>
        </select>
        ${i > 0 ? `<button data-del="${i}" style="border:none;background:none;cursor:pointer;font-size:14px;color:var(--text-secondary)">✕</button>` : ''}
      </div>
    `).join('');

    // Set selected values
    levelsEl.querySelectorAll('select[data-field="col"]').forEach(sel => {
      const i = parseInt(sel.dataset.level);
      sel.value = sortLevels[i].col;
      sel.onchange = () => { sortLevels[i].col = parseInt(sel.value); };
    });
    levelsEl.querySelectorAll('select[data-field="order"]').forEach(sel => {
      const i = parseInt(sel.dataset.level);
      sel.onchange = () => { sortLevels[i].asc = sel.value === 'asc'; };
    });
    levelsEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => { sortLevels.splice(parseInt(btn.dataset.del), 1); renderLevels(); };
    });
  }
  renderLevels();

  dlg.querySelector('#sort-add-level').onclick = () => {
    sortLevels.push({ col: 0, asc: true });
    renderLevels();
  };
  dlg.querySelector('#sort-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#sort-apply').onclick = () => {
    const hasHeader = dlg.querySelector('#sort-has-header').checked;
    multiLevelSort(sortLevels, hasHeader);
    dlg.remove();
  };
}

function multiLevelSort(levels, hasHeader) {
  const sheet = getSheet();
  saveUndoState();

  const startRow = hasHeader ? 1 : 0;
  const rowData = [];
  for (let r = startRow; r < sheet.rows; r++) {
    const row = {};
    for (let c = 0; c < sheet.cols; c++) {
      row[c] = { ...getCell(sheet, r, c) };
    }
    rowData.push(row);
  }

  rowData.sort((a, b) => {
    for (const lvl of levels) {
      const aVal = a[lvl.col]?.value ?? '';
      const bVal = b[lvl.col]?.value ?? '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      let cmp;
      if (!isNaN(aNum) && !isNaN(bNum)) {
        cmp = aNum - bNum;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), 'ko');
      }
      if (!lvl.asc) cmp = -cmp;
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  // Write sorted data back
  for (let r = 0; r < rowData.length; r++) {
    const tr = startRow + r;
    for (let c = 0; c < sheet.cols; c++) {
      const cellData = rowData[r][c];
      if (cellData) {
        const key = `${tr},${c}`;
        sheet.cells[key] = cellData;
      }
    }
  }

  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

/* ==================== Named Ranges ==================== */

let namedRanges = {}; // name → { r1, c1, r2, c2, sheetIdx }

function showNamedRangeDialog() {
  const { r1, c1, r2, c2 } = getSelectionRange();
  const rangeStr = `${colToLetter(c1)}${r1 + 1}:${colToLetter(c2)}${r2 + 1}`;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:420px">
    <h3 style="margin:0 0 12px">Named Ranges</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input type="text" id="nr-name" placeholder="Range name..." style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
      <input type="text" id="nr-range" value="${rangeStr}" style="width:120px;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
      <button id="nr-add" style="padding:6px 12px;background:var(--accent-color);color:white;border:none;border-radius:4px;cursor:pointer">Add</button>
    </div>
    <div id="nr-list" style="max-height:200px;overflow:auto"></div>
    <div style="text-align:right;margin-top:12px">
      <button class="toolbar-btn" id="nr-close" style="padding:6px 16px">Close</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  function renderList() {
    const list = dlg.querySelector('#nr-list');
    const entries = Object.entries(namedRanges);
    if (entries.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);text-align:center;padding:16px">No named ranges defined</div>';
      return;
    }
    list.innerHTML = entries.map(([name, r]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);font-size:12px">
        <span><strong>${name}</strong> → ${colToLetter(r.c1)}${r.r1 + 1}:${colToLetter(r.c2)}${r.r2 + 1}</span>
        <div>
          <button data-goto="${name}" style="border:none;background:none;cursor:pointer;font-size:12px;color:var(--accent-color)">Go</button>
          <button data-del="${name}" style="border:none;background:none;cursor:pointer;font-size:12px;color:var(--text-secondary)">✕</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-goto]').forEach(btn => {
      btn.onclick = () => {
        const r = namedRanges[btn.dataset.goto];
        selectedRow = r.r1; selectedCol = r.c1;
        selAnchorRow = r.r2; selAnchorCol = r.c2;
        updateSelection();
        dlg.remove();
      };
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => { delete namedRanges[btn.dataset.del]; renderList(); };
    });
  }
  renderList();

  dlg.querySelector('#nr-add').onclick = () => {
    const name = dlg.querySelector('#nr-name').value.trim();
    if (!name) return;
    namedRanges[name] = { r1, c1, r2, c2, sheetIdx: activeSheetIdx };
    dlg.querySelector('#nr-name').value = '';
    renderList();
  };
  dlg.querySelector('#nr-close').onclick = () => dlg.remove();
}

/* ==================== Pivot Table ==================== */

function showPivotTableDialog() {
  const sheet = getSheet();
  const { r1, c1, r2, c2 } = getSelectionRange();
  if (r2 - r1 < 1 || c2 - c1 < 0) {
    alert('Select a data range with at least 2 rows (header + data) to create a pivot table.');
    return;
  }

  // Get headers from first row
  const headers = [];
  for (let c = c1; c <= c2; c++) {
    headers.push(getDisplayValue(sheet, r1, c) || colToLetter(c));
  }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:560px;max-height:85vh;overflow:auto">
    <h3 style="margin:0 0 12px">Pivot Table Builder</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin:0 0 16px">Data range: ${colToLetter(c1)}${r1 + 1}:${colToLetter(c2)}${r2 + 1} (${r2 - r1} data rows, ${headers.length} columns)</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Row Field</label>
        <select id="pivot-row" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
          ${headers.map((h, i) => `<option value="${i}">${h}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Column Field (optional)</label>
        <select id="pivot-col" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
          <option value="-1">— None —</option>
          ${headers.map((h, i) => `<option value="${i}">${h}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Value Field</label>
        <select id="pivot-val" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
          ${headers.map((h, i) => `<option value="${i}"${i === headers.length - 1 ? ' selected' : ''}>${h}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Aggregate Function</label>
        <select id="pivot-agg" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
          <option value="sum">SUM</option>
          <option value="count">COUNT</option>
          <option value="average">AVERAGE</option>
          <option value="min">MIN</option>
          <option value="max">MAX</option>
        </select>
      </div>
    </div>
    <div id="pivot-preview" style="margin-top:16px;max-height:300px;overflow:auto;border:1px solid var(--border-color);border-radius:4px"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button class="toolbar-btn" id="pivot-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="pivot-preview-btn" style="padding:6px 16px">Preview</button>
      <button class="toolbar-btn" id="pivot-insert" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Insert as New Sheet</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  function buildPivotData() {
    const rowIdx = parseInt(dlg.querySelector('#pivot-row').value);
    const colIdx = parseInt(dlg.querySelector('#pivot-col').value);
    const valIdx = parseInt(dlg.querySelector('#pivot-val').value);
    const aggFn = dlg.querySelector('#pivot-agg').value;

    // Collect data (skip header row)
    const data = [];
    for (let r = r1 + 1; r <= r2; r++) {
      const rowVal = getDisplayValue(sheet, r, c1 + rowIdx);
      const colVal = colIdx >= 0 ? getDisplayValue(sheet, r, c1 + colIdx) : '__total__';
      const numVal = parseFloat(getDisplayValue(sheet, r, c1 + valIdx)) || 0;
      data.push({ row: rowVal, col: colVal, val: numVal });
    }

    // Get unique row/col values
    const rowVals = [...new Set(data.map(d => d.row))].sort();
    const colVals = [...new Set(data.map(d => d.col))].sort();

    // Build aggregation map
    const agg = {};
    rowVals.forEach(rv => {
      agg[rv] = {};
      colVals.forEach(cv => { agg[rv][cv] = []; });
    });
    data.forEach(d => { agg[d.row][d.col].push(d.val); });

    // Apply aggregate function
    const result = {};
    rowVals.forEach(rv => {
      result[rv] = {};
      colVals.forEach(cv => {
        const vals = agg[rv][cv];
        if (vals.length === 0) { result[rv][cv] = ''; return; }
        if (aggFn === 'sum') result[rv][cv] = vals.reduce((a, b) => a + b, 0);
        else if (aggFn === 'count') result[rv][cv] = vals.length;
        else if (aggFn === 'average') result[rv][cv] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        else if (aggFn === 'min') result[rv][cv] = Math.min(...vals);
        else if (aggFn === 'max') result[rv][cv] = Math.max(...vals);
      });
    });

    return { rowVals, colVals, result, rowHeader: headers[rowIdx], colHeader: colIdx >= 0 ? headers[colIdx] : '', valHeader: headers[valIdx], aggFn };
  }

  function renderPreview() {
    const { rowVals, colVals, result, rowHeader, colHeader, valHeader, aggFn } = buildPivotData();
    const previewEl = dlg.querySelector('#pivot-preview');
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr><th style="border:1px solid var(--border-color);padding:6px;background:var(--hover-bg);font-weight:700">' + rowHeader + '</th>';
    if (colVals[0] === '__total__') {
      html += `<th style="border:1px solid var(--border-color);padding:6px;background:var(--hover-bg);font-weight:700">${aggFn.toUpperCase()} of ${valHeader}</th>`;
    } else {
      colVals.forEach(cv => {
        html += `<th style="border:1px solid var(--border-color);padding:6px;background:var(--hover-bg);font-weight:700">${cv}</th>`;
      });
    }
    html += '</tr></thead><tbody>';
    rowVals.forEach(rv => {
      html += `<tr><td style="border:1px solid var(--border-color);padding:6px;font-weight:600">${rv}</td>`;
      colVals.forEach(cv => {
        html += `<td style="border:1px solid var(--border-color);padding:6px;text-align:right">${result[rv][cv]}</td>`;
      });
      html += '</tr>';
    });
    // Grand total row
    html += `<tr><td style="border:1px solid var(--border-color);padding:6px;font-weight:700;background:var(--hover-bg)">Grand Total</td>`;
    colVals.forEach(cv => {
      const colTotal = rowVals.reduce((sum, rv) => sum + (parseFloat(result[rv][cv]) || 0), 0);
      html += `<td style="border:1px solid var(--border-color);padding:6px;text-align:right;font-weight:700;background:var(--hover-bg)">${aggFn === 'average' ? (colTotal / rowVals.length).toFixed(2) : colTotal}</td>`;
    });
    html += '</tr></tbody></table>';
    previewEl.innerHTML = html;
  }

  dlg.querySelector('#pivot-preview-btn').onclick = renderPreview;
  dlg.querySelector('#pivot-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#pivot-insert').onclick = () => {
    const { rowVals, colVals, result, rowHeader, colHeader, valHeader, aggFn } = buildPivotData();

    // Create new sheet with pivot data
    const pivotSheet = createSheetData();
    // Header row
    setCell(pivotSheet, 0, 0, rowHeader);
    if (colVals[0] === '__total__') {
      setCell(pivotSheet, 0, 1, `${aggFn.toUpperCase()} of ${valHeader}`);
    } else {
      colVals.forEach((cv, ci) => setCell(pivotSheet, 0, ci + 1, cv));
    }
    // Data rows
    rowVals.forEach((rv, ri) => {
      setCell(pivotSheet, ri + 1, 0, rv);
      colVals.forEach((cv, ci) => {
        const v = result[rv][cv];
        setCell(pivotSheet, ri + 1, ci + 1, String(v));
      });
    });
    // Grand total
    const gtRow = rowVals.length + 1;
    setCell(pivotSheet, gtRow, 0, 'Grand Total');
    colVals.forEach((cv, ci) => {
      const total = rowVals.reduce((s, rv) => s + (parseFloat(result[rv][cv]) || 0), 0);
      setCell(pivotSheet, gtRow, ci + 1, String(aggFn === 'average' ? (total / rowVals.length).toFixed(2) : total));
    });

    // Bold header row
    for (let c = 0; c <= colVals.length; c++) {
      setCellFormat(pivotSheet, 0, c, 'bold', true);
      setCellFormat(pivotSheet, 0, c, 'bg', '#e8f0fe');
    }
    // Bold grand total row
    for (let c = 0; c <= colVals.length; c++) {
      setCellFormat(pivotSheet, gtRow, c, 'bold', true);
      setCellFormat(pivotSheet, gtRow, c, 'bg', '#f3f3f3');
    }

    sheets.push(pivotSheet);
    activeSheetIdx = sheets.length - 1;
    renderSheetTabs();
    renderGrid();
    updateSelection();
    dlg.remove();
  };

  // Auto-preview on load
  renderPreview();
}

/* ==================== Data Grouping ==================== */

let rowGroups = []; // [{r1, r2, collapsed}]

function toggleGroupRows() {
  const { r1, r2 } = getSelectionRange();
  // Check if selection is already in a group
  const existingIdx = rowGroups.findIndex(g => g.r1 === r1 && g.r2 === r2);
  if (existingIdx >= 0) {
    // Ungroup
    rowGroups.splice(existingIdx, 1);
  } else if (r1 !== r2) {
    rowGroups.push({ r1, r2, collapsed: false });
  }
  renderGrid();
  updateSelection();
}

function toggleGroupCollapse(groupIdx) {
  const group = rowGroups[groupIdx];
  if (!group) return;
  group.collapsed = !group.collapsed;
  renderGrid();
  updateSelection();
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
