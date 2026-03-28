// OfficeLink SL — Sheet Features (merge, CF, filter, freeze, tabs, find/replace, context menu, charts, print, etc.)

import {
  createSheetData, getCell, setCell as _setCell, setCellFormat, getDisplayValue, getRawValue,
  colToLetter, letterToCol as engineLetterToCol, rcToRef, refToRC,
  addRows, addCols, deleteRow, deleteCol,
  recalcAll as _recalcAll, setCellArrayFormula as _setCellArrayFormula,
  sortByColumn,
} from './sheet-engine.js';
import { t } from '../ui/i18n.js';
import { downloadBlob } from '../utils/download.js';
import { escapeHtml } from '../utils/sanitize.js';
import S from './sheet-state.js';
import {
  getSheet, renderGrid, getSelectionRange, getColWidth, getRowHeight,
  cellStyle, scrollIntoView,
} from './sheet-grid.js';
import {
  saveUndoState, pushUndoEntry, pushBulkUndo,
  commitEdit, copySelection, pasteSelection, clearSelection,
  adjustFormulaReferences,
  showAutocomplete, hideAutocomplete, handleAcKeydown,
  sheetUndo, sheetRedo, startEdit, moveSelection,
  getCellInput, highlightFormulaRefs, clearFormulaRefHighlights,
  toggleAbsoluteRef, insertCellReference, updateRangeReference,
  cancelEdit,
} from './sheet-edit.js';

// Engine wrappers that pass all sheets
function setCell(sheet, r, c, rawValue) { _setCell(sheet, r, c, rawValue, S.sheets); }
function setCellArrayFormula(sheet, r, c, rawValue) { _setCellArrayFormula(sheet, r, c, rawValue, S.sheets); }
function recalcAll(sheet) { _recalcAll(sheet, S.sheets); }

// Forward reference for updateSelection — set by sheet-ui.js
let _updateSelectionFn = () => {};
export function setFeaturesDeps(deps) {
  if (deps.updateSelection) _updateSelectionFn = deps.updateSelection;
}
function updateSelection() { _updateSelectionFn(); }

/* ==================== Freeze Rows/Columns ==================== */

export function updateFreezeButtonState() {
  const btn = document.getElementById('sheet-freeze');
  if (btn) {
    btn.classList.toggle('active', S.freezeRows > 0 || S.freezeCols > 0);
    btn.title = S.freezeRows > 0 || S.freezeCols > 0
      ? `Freeze: ${S.freezeRows} rows, ${S.freezeCols} cols (click to unfreeze, Shift+click for options)`
      : 'Freeze Rows/Columns (click or Shift+click for options)';
  }
}

export function showFreezeDialog() {
  const existing = document.querySelector('.sheet-freeze-dialog');
  if (existing) { existing.remove(); return; }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay sheet-freeze-dialog';
  const inputStyle = 'width:80px;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px';
  dlg.innerHTML = `<div class="modal-content" style="width:340px">
    <h3 style="margin:0 0 12px">Freeze Panes</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px">Freeze rows and columns to keep them visible while scrolling.</p>
    <div style="display:flex;gap:16px;margin-bottom:16px">
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Freeze Rows</label>
        <input type="number" id="freeze-rows-input" value="${S.freezeRows}" min="0" max="20" style="${inputStyle}">
        <span style="font-size:11px;color:var(--text-tertiary);display:block;margin-top:2px">Top N rows stay fixed</span>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Freeze Columns</label>
        <input type="number" id="freeze-cols-input" value="${S.freezeCols}" min="0" max="10" style="${inputStyle}">
        <span style="font-size:11px;color:var(--text-tertiary);display:block;margin-top:2px">Left N cols stay fixed</span>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
      <button class="toolbar-btn freeze-preset" data-fr="1" data-fc="0" style="padding:4px 10px;font-size:11px">Freeze Top Row</button>
      <button class="toolbar-btn freeze-preset" data-fr="0" data-fc="1" style="padding:4px 10px;font-size:11px">Freeze First Column</button>
      <button class="toolbar-btn freeze-preset" data-fr="1" data-fc="1" style="padding:4px 10px;font-size:11px">Freeze Row + Column</button>
      <button class="toolbar-btn freeze-preset" data-fr="${S.selectedRow > 0 ? S.selectedRow : 1}" data-fc="${S.selectedCol > 0 ? S.selectedCol : 0}" style="padding:4px 10px;font-size:11px">Freeze at Selection (${rcToRef(S.selectedRow, S.selectedCol)})</button>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="toolbar-btn" id="freeze-unfreeze" style="padding:6px 16px">Unfreeze All</button>
      <button class="toolbar-btn" id="freeze-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="freeze-apply" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Apply</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  // Preset buttons
  dlg.querySelectorAll('.freeze-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      dlg.querySelector('#freeze-rows-input').value = btn.dataset.fr;
      dlg.querySelector('#freeze-cols-input').value = btn.dataset.fc;
    });
  });

  dlg.querySelector('#freeze-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#freeze-unfreeze').onclick = () => {
    S.freezeRows = 0; S.freezeCols = 0;
    renderGrid(); updateSelection(); updateFreezeButtonState();
    dlg.remove();
  };
  dlg.querySelector('#freeze-apply').onclick = () => {
    S.freezeRows = parseInt(dlg.querySelector('#freeze-rows-input').value) || 0;
    S.freezeCols = parseInt(dlg.querySelector('#freeze-cols-input').value) || 0;
    renderGrid(); updateSelection(); updateFreezeButtonState();
    dlg.remove();
  };
}

export function applyFreezeStyles() {
  if (S.freezeRows <= 0 && S.freezeCols <= 0) return;

  // Frozen rows get position: sticky with top offset
  // Compute cumulative top offsets from actual row heights (header row ~25px)
  const frozenRowEls = S.gridEl.querySelectorAll('.sheet-frozen-row');
  let cumTop = 25; // thead header row height
  frozenRowEls.forEach((tr, i) => {
    const th = tr.querySelector('th');
    const tds = tr.querySelectorAll('td');
    const top = cumTop + 'px';
    if (th) { th.style.position = 'sticky'; th.style.top = top; th.style.zIndex = '3'; }
    tds.forEach((td) => {
      td.style.position = 'sticky';
      td.style.top = top;
      td.style.zIndex = '2';
      td.style.background = td.style.background || 'var(--bg-primary)';
    });
    // Advance cumTop by this row's actual height
    const rowIdx = parseInt(tr.dataset?.vrow ?? i);
    cumTop += getRowHeight(rowIdx);
  });

  // Frozen columns — compute left offsets from actual column widths
  const frozenColLefts = [];
  let cumLeft = 40; // row header width
  for (let ci = 0; ci < S.freezeCols; ci++) {
    if (S.hiddenCols.has(ci)) continue;
    frozenColLefts.push(cumLeft);
    cumLeft += getColWidth(ci);
  }
  // Apply sticky to frozen column headers in thead
  const frozenColHeaders = S.gridEl.querySelectorAll('.sheet-frozen-col-header');
  frozenColHeaders.forEach((th, i) => {
    const left = (i < frozenColLefts.length ? frozenColLefts[i] : 40 + i * 80) + 'px';
    th.style.position = 'sticky';
    th.style.left = left;
    th.style.zIndex = '4'; // above frozen rows (z-index 3) to stay in corner
    th.style.background = th.style.background || 'var(--bg-secondary, var(--bg-primary))';
  });
  // Apply sticky to frozen columns in body rows
  const allRows = S.gridEl.querySelectorAll('tbody tr');
  allRows.forEach((tr) => {
    const frozenColEls = tr.querySelectorAll('.sheet-frozen-col');
    frozenColEls.forEach((td, i) => {
      const left = (i < frozenColLefts.length ? frozenColLefts[i] : 40 + i * 80) + 'px';
      td.style.position = 'sticky';
      td.style.left = left;
      td.style.zIndex = '1';
      td.style.background = td.style.background || 'var(--bg-primary)';
    });
  });

  // Visual freeze line indicator
  if (S.freezeRows > 0) {
    const lastFrozenRow = S.gridEl.querySelector(`.sheet-frozen-row:last-of-type`);
    if (lastFrozenRow) {
      lastFrozenRow.querySelectorAll('td, th').forEach(cell => {
        cell.style.borderBottom = '2px solid #3b82f6';
      });
    }
  }
  if (S.freezeCols > 0) {
    const allTrs = S.gridEl.querySelectorAll('tr');
    allTrs.forEach(tr => {
      const cells = tr.querySelectorAll('.sheet-frozen-col');
      const last = cells[cells.length - 1];
      if (last) last.style.borderRight = '2px solid #3b82f6';
    });
  }
}

/* ==================== Sort ==================== */

export function sortColumn(ascending) {
  const sheet = getSheet();
  saveUndoState();
  sortByColumn(sheet, S.selectedCol, ascending);
  recalcAll(sheet);
  renderGrid();
  refreshChartWidgets();
  updateSelection();
}

/* ==================== Sheet Tabs ==================== */

export function getSheetName(idx) {
  return S.sheets[idx]?.name || `Sheet${idx + 1}`;
}

export function renderSheetTabs() {
  const tabsEl = document.getElementById('sheet-tabs');
  if (!tabsEl) return;
  let html = '';
  S.sheets.forEach((s, i) => {
    const name = getSheetName(i);
    html += `<button class="sheet-tab ${i === S.activeSheetIdx ? 'active' : ''}" data-sheet="${i}" title="Double-click to rename, right-click for options">${name}</button>`;
  });
  html += `<button class="sheet-tab-add" id="sheet-add-tab" title="Add Sheet">+</button>`;
  tabsEl.innerHTML = html;

  // Tab click to switch
  tabsEl.querySelectorAll('.sheet-tab[data-sheet]').forEach(tab => {
    // Click to switch
    tab.addEventListener('click', (e) => {
      const idx = parseInt(tab.dataset.sheet, 10);
      if (idx !== S.activeSheetIdx) {
        _saveSheetState();  // Persist freeze/S.condFormats/S.validations to old sheet
        S.activeSheetIdx = idx;
        S.colWidths = {}; S.rowHeights = {};  // Reset for new sheet's imported dims
        _loadSheetState();  // Load freeze/S.condFormats/S.validations from new sheet
        renderSheetTabs(); renderGrid();
        S.selectedRow = 0; S.selectedCol = 0;
        updateSelection();
      }
    });
    // Double-click to rename
    tab.addEventListener('dblclick', (e) => {
      const idx = parseInt(tab.dataset.sheet, 10);
      const currentName = getSheetName(idx);
      const newName = prompt('Rename sheet:', currentName);
      if (newName && newName.trim()) {
        S.sheets[idx].name = newName.trim();
        renderSheetTabs();
      }
    });
    // Right-click context menu
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = parseInt(tab.dataset.sheet, 10);
      showTabContextMenu(e.clientX, e.clientY, idx);
    });
  });

  document.getElementById('sheet-add-tab')?.addEventListener('click', () => {
    const newName = `Sheet${S.sheets.length + 1}`;
    S.sheets.push(createSheetData(undefined, undefined, newName));
    S.activeSheetIdx = S.sheets.length - 1;
    renderSheetTabs(); renderGrid();
    S.selectedRow = 0; S.selectedCol = 0;
    updateSelection();
  });
}

export function showTabContextMenu(x, y, sheetIdx) {
  // Remove old menus
  document.querySelectorAll('.sheet-tab-context-menu').forEach(el => el.remove());
  const menu = document.createElement('div');
  menu.className = 'sheet-tab-context-menu';
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9999;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:6px;padding:4px 0;box-shadow:0 4px 12px rgba(0,0,0,.2);min-width:150px`;
  const items = [
    { label: 'Rename', action: () => {
      const name = prompt('Rename sheet:', getSheetName(sheetIdx));
      if (name?.trim()) { S.sheets[sheetIdx].name = name.trim(); renderSheetTabs(); }
    }},
    { label: 'Duplicate', action: () => {
      const src = S.sheets[sheetIdx];
      const dup = createSheetData(src.rows, src.cols, getSheetName(sheetIdx) + ' (copy)');
      dup.cells = JSON.parse(JSON.stringify(src.cells));
      dup.condFormats = JSON.parse(JSON.stringify(src.condFormats || []));
      dup.merges = JSON.parse(JSON.stringify(src.merges || []));
      S.sheets.splice(sheetIdx + 1, 0, dup);
      S.activeSheetIdx = sheetIdx + 1;
      renderSheetTabs(); renderGrid(); updateSelection();
    }},
    { label: 'Delete', action: () => {
      if (S.sheets.length <= 1) { alert('Cannot delete the only sheet.'); return; }
      if (!confirm(`Delete "${getSheetName(sheetIdx)}"?`)) return;
      S.sheets.splice(sheetIdx, 1);
      if (S.activeSheetIdx >= S.sheets.length) S.activeSheetIdx = S.sheets.length - 1;
      renderSheetTabs(); renderGrid();
      S.selectedRow = 0; S.selectedCol = 0; updateSelection();
    }},
    { label: 'Move Left', action: () => {
      if (sheetIdx === 0) return;
      [S.sheets[sheetIdx - 1], S.sheets[sheetIdx]] = [S.sheets[sheetIdx], S.sheets[sheetIdx - 1]];
      if (S.activeSheetIdx === sheetIdx) S.activeSheetIdx--;
      else if (S.activeSheetIdx === sheetIdx - 1) S.activeSheetIdx++;
      renderSheetTabs();
    }},
    { label: 'Move Right', action: () => {
      if (sheetIdx >= S.sheets.length - 1) return;
      [S.sheets[sheetIdx], S.sheets[sheetIdx + 1]] = [S.sheets[sheetIdx + 1], S.sheets[sheetIdx]];
      if (S.activeSheetIdx === sheetIdx) S.activeSheetIdx++;
      else if (S.activeSheetIdx === sheetIdx + 1) S.activeSheetIdx--;
      renderSheetTabs();
    }},
  ];
  items.forEach(item => {
    const btn = document.createElement('div');
    btn.textContent = item.label;
    btn.style.cssText = 'padding:6px 16px;cursor:pointer;font-size:12px;color:var(--text-primary)';
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
    btn.addEventListener('click', () => { menu.remove(); item.action(); });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

/* ==================== Drag-to-Fill ==================== */

export function executeFill(targetR, targetC) {
  const sheet = getSheet();
  const dr = targetR - S.fillEndRow;
  const dc = targetC - S.fillEndCol;

  // Gather source data
  const srcRows = S.fillEndRow - S.fillStartRow + 1;
  const srcCols = S.fillEndCol - S.fillStartCol + 1;
  const srcData = [];
  for (let r = S.fillStartRow; r <= S.fillEndRow; r++) {
    const row = [];
    for (let c = S.fillStartCol; c <= S.fillEndCol; c++) {
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
      const fillR = direction > 0 ? S.fillEndRow + i : S.fillStartRow - i;
      for (let c = S.fillStartCol; c <= S.fillEndCol; c++) {
        const srcIdx = (direction > 0 ? (i - 1) : (count - i)) % srcRows;
        const src = srcData[srcIdx][c - S.fillStartCol];
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
    for (let r = S.fillStartRow; r <= S.fillEndRow; r++) {
      for (let i = 1; i <= count; i++) {
        const fillC = direction > 0 ? S.fillEndCol + i : S.fillStartCol - i;
        const srcIdx = (direction > 0 ? (i - 1) : (count - i)) % srcCols;
        const src = srcData[r - S.fillStartRow][srcIdx];
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

export const _DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const _DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const _MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const _MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function matchSeriesList(val, list) {
  const upper = val.toUpperCase();
  const idx = list.findIndex(s => s.toUpperCase() === upper);
  return idx >= 0 ? { list, idx } : null;
}

export function preserveCase(template, result) {
  if (template === template.toUpperCase()) return result.toUpperCase();
  if (template === template.toLowerCase()) return result.toLowerCase();
  // Title case
  return result[0].toUpperCase() + result.slice(1).toLowerCase();
}

export function smartFill(raw, displayVal, offset) {
  // If formula, adjust references
  if (raw.startsWith('=')) {
    return adjustFormulaReferences(raw, offset, 0);
  }

  // Day names series (Mon, Tue, Wed... or Monday, Tuesday...)
  for (const list of [_DAYS_FULL, _DAYS_SHORT]) {
    const m = matchSeriesList(displayVal.trim(), list);
    if (m) {
      const newIdx = ((m.idx + offset) % 7 + 7) % 7;
      return preserveCase(displayVal.trim(), m.list[newIdx]);
    }
  }

  // Month names series (Jan, Feb, Mar... or January, February...)
  for (const list of [_MONTHS_FULL, _MONTHS_SHORT]) {
    const m = matchSeriesList(displayVal.trim(), list);
    if (m) {
      const newIdx = ((m.idx + offset) % 12 + 12) % 12;
      return preserveCase(displayVal.trim(), m.list[newIdx]);
    }
  }

  // Text+number pattern (Item1 -> Item2, Q1 -> Q2)
  const textNumMatch = displayVal.match(/^(.+?)(\d+)$/);
  if (textNumMatch) {
    const prefix = textNumMatch[1];
    const num = parseInt(textNumMatch[2], 10);
    return prefix + (num + offset);
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

export function toggleMerge() {
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



export function showCondFmtDialog() {
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
            <option value="color_scale">Color Scale (min→max)</option>
            <option value="data_bars">Data Bars</option>
            <option value="icon_set">Icon Set</option>
          </select>
        </div>
        <div id="cf-value-row" style="display:flex;gap:8px;margin-bottom:10px">
          <input type="text" id="cf-val1" placeholder="Value" style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
          <input type="text" id="cf-val2" placeholder="Max" style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);display:none">
        </div>
        <div id="cf-icon-set-row" style="display:none;margin-bottom:10px">
          <select id="cf-icon-set" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="traffic">🔴🟡🟢 Traffic Lights</option>
            <option value="arrows">⬇️➡️⬆️ Arrows</option>
            <option value="stars">☆☆★ Stars</option>
            <option value="flags">🏳️🟨🟩 Flags</option>
            <option value="rating">1️⃣2️⃣3️⃣ Rating</option>
          </select>
        </div>
        <div id="cf-color-row" style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
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
    const t = typeSelect.value;
    val2Input.style.display = t === 'between' ? '' : 'none';
    dialog.querySelector('#cf-val1').style.display = ['empty', 'notempty', 'color_scale', 'data_bars', 'icon_set'].includes(t) ? 'none' : '';
    dialog.querySelector('#cf-color-row').style.display = ['color_scale', 'data_bars', 'icon_set'].includes(t) ? 'none' : '';
    dialog.querySelector('#cf-icon-set-row').style.display = t === 'icon_set' ? '' : 'none';
  });

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#cf-clear')?.addEventListener('click', () => {
    S.condFormats = S.condFormats.filter(cf =>
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

    const iconSet = dialog.querySelector('#cf-icon-set')?.value || 'traffic';
    S.condFormats.push({
      range: { r1, r2, c1, c2 },
      type, val1, val2, bgColor, textColor, iconSet,
    });
    renderGrid(); updateSelection();
    dialog.remove();
  });
}

export function getCondFmtStyle(r, c) {
  const sheet = getSheet();
  const displayVal = getDisplayValue(sheet, r, c);
  const numVal = parseFloat(displayVal);

  for (const cf of S.condFormats) {
    if (r < cf.range.r1 || r > cf.range.r2 || c < cf.range.c1 || c > cf.range.c2) continue;

    // Icon set — handled in applyIconSets() after render
    if (cf.type === 'icon_set') continue;

    // Color scale / data bars — compute range min/max
    if (cf.type === 'color_scale' || cf.type === 'data_bars') {
      if (isNaN(numVal)) continue;
      let min = Infinity, max = -Infinity;
      for (let rr = cf.range.r1; rr <= cf.range.r2; rr++) {
        for (let cc = cf.range.c1; cc <= cf.range.c2; cc++) {
          const v = parseFloat(getDisplayValue(sheet, rr, cc));
          if (!isNaN(v)) { min = Math.min(min, v); max = Math.max(max, v); }
        }
      }
      const range = max - min || 1;
      const pct = Math.max(0, Math.min(1, (numVal - min) / range));

      if (cf.type === 'color_scale') {
        // Green (low) → Yellow (mid) → Red (high)
        const r2 = pct < 0.5 ? Math.round(87 + pct * 2 * 168) : 255;
        const g = pct < 0.5 ? 200 : Math.round(200 - (pct - 0.5) * 2 * 155);
        const b = Math.round(87 * (1 - pct));
        return `background:rgb(${r2},${g},${b});color:${pct > 0.7 ? '#fff' : '#000'}`;
      } else {
        // Data bars — gradient background
        const barPct = Math.round(pct * 100);
        return `background:linear-gradient(90deg, #4285f4 ${barPct}%, transparent ${barPct}%);color:${barPct > 50 ? '#fff' : 'var(--text-primary)'}`;
      }
    }

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

/* ==================== Auto Filter ==================== */




export function toggleFilter() {
  const sheet = getSheet();
  if (S.filterRow >= 0) {
    // Remove filter
    S.filterRow = -1;
    S.filterValues = {};
    document.getElementById('sheet-filter')?.classList.remove('active');
    renderGrid(); updateSelection();
    return;
  }

  // Set filter on selected row
  S.filterRow = S.selectedRow;
  document.getElementById('sheet-filter')?.classList.add('active');
  renderGrid(); updateSelection();
}

export function showFilterDropdown(colIdx, anchorEl) {
  document.querySelector('.sheet-filter-dropdown')?.remove();
  const sheet = getSheet();

  // Get unique values in this column (below filter row)
  const uniqueVals = new Set();
  for (let r = S.filterRow + 1; r < sheet.rows; r++) {
    uniqueVals.add(getDisplayValue(sheet, r, colIdx));
  }
  const sorted = [...uniqueVals].sort();
  const currentFilter = S.filterValues[colIdx] || new Set();
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
    html += `<label style="display:flex;align-items:center;gap:6px;padding:2px 4px;cursor:pointer" data-val="${escapeHtml(v)}">
      <input type="checkbox" class="filter-item" value="${escapeHtml(v)}" ${checked ? 'checked' : ''}> ${escapeHtml(displayVal)}
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
    delete S.filterValues[colIdx];
    renderGrid(); updateSelection();
    dd.remove();
  };

  // OK
  dd.querySelector('.filter-ok').onclick = () => {
    const selected = new Set();
    dd.querySelectorAll('.filter-item:checked').forEach(cb => selected.add(cb.value));
    if (selected.size === sorted.length || selected.size === 0) {
      delete S.filterValues[colIdx]; // No filter = show all
    } else {
      S.filterValues[colIdx] = selected;
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

export function showSheetFindReplace() {
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
    S.selectedRow = res.r; S.selectedCol = res.c;
    S.selAnchorRow = res.r; S.selAnchorCol = res.c;
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
    bar.querySelector('#sf-count').textContent = t('ui.replacedAll');
  });

  bar.querySelector('#sf-close')?.addEventListener('click', () => bar.remove());

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { bar.querySelector('#sf-next').click(); e.preventDefault(); }
    if (e.key === 'Escape') { bar.remove(); }
  });
}

/* ==================== Cell Context Menu ==================== */

export function showCellContextMenu(x, y, r, c) {
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
    { label: '💬 Comments', action: () => showCommentPanel(r, c) },
    { label: '🔗 Insert Hyperlink', action: () => insertCellHyperlink(r, c) },
    { label: S.sheetProtected ? '🔓 Unlock Cells' : '🔒 Lock Cells', action: () => toggleCellLock(r, c) },
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



/** Show a temporary notification for data validation info messages */
export function showDvNotification(msg, type = 'info') {
  const existing = document.querySelector('.dv-notification');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'dv-notification';
  const bgColor = type === 'warning' ? '#fff3cd' : '#d1ecf1';
  const textColor = type === 'warning' ? '#856404' : '#0c5460';
  el.style.cssText = `position:fixed;top:60px;right:20px;padding:10px 16px;background:${bgColor};color:${textColor};border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:9999;font-size:13px;max-width:300px;transition:opacity 0.3s`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

/** Check data validation rule, returns error message string or null if valid */
export function checkDataValidation(rule, val) {
  if (!rule || val === '') return null;
  switch (rule.type) {
    case 'list':
      if (rule.values && !rule.values.includes(val)) return `Value must be from the list: ${rule.values.join(', ')}`;
      break;
    case 'number': {
      const n = parseFloat(val);
      if (isNaN(n)) return 'A number is required';
      if (rule.operator) {
        const { operator, min, max } = rule;
        if (operator === 'between' && (n < min || n > max)) return `Number must be between ${min} and ${max}`;
        if (operator === 'not_between' && n >= min && n <= max) return `Number must not be between ${min} and ${max}`;
        if (operator === 'gt' && n <= min) return `Number must be greater than ${min}`;
        if (operator === 'gte' && n < min) return `Number must be greater than or equal to ${min}`;
        if (operator === 'lt' && n >= min) return `Number must be less than ${min}`;
        if (operator === 'lte' && n > min) return `Number must be less than or equal to ${min}`;
        if (operator === 'eq' && n !== min) return `Number must equal ${min}`;
        if (operator === 'neq' && n === min) return `Number must not equal ${min}`;
      }
      break;
    }
    case 'integer': {
      const n = parseFloat(val);
      if (isNaN(n) || n !== Math.floor(n)) return 'A whole number is required';
      if (rule.operator) {
        const { operator, min, max } = rule;
        if (operator === 'between' && (n < min || n > max)) return `Number must be between ${min} and ${max}`;
        if (operator === 'not_between' && n >= min && n <= max) return `Number must not be between ${min} and ${max}`;
        if (operator === 'gt' && n <= min) return `Must be greater than ${min}`;
        if (operator === 'gte' && n < min) return `Must be >= ${min}`;
        if (operator === 'lt' && n >= min) return `Must be less than ${min}`;
        if (operator === 'lte' && n > min) return `Must be <= ${min}`;
        if (operator === 'eq' && n !== min) return `Must equal ${min}`;
        if (operator === 'neq' && n === min) return `Must not equal ${min}`;
      }
      break;
    }
    case 'text_length': {
      const len = String(val).length;
      if (rule.operator) {
        const { operator, min, max } = rule;
        if (operator === 'between' && (len < min || len > max)) return `Text length must be between ${min} and ${max}`;
        if (operator === 'gt' && len <= min) return `Text length must be > ${min}`;
        if (operator === 'lt' && len >= min) return `Text length must be < ${min}`;
        if (operator === 'eq' && len !== min) return `Text length must be exactly ${min}`;
      }
      break;
    }
    case 'date': {
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'A valid date is required (YYYY-MM-DD)';
      if (rule.operator) {
        const { operator, min, max } = rule;
        const dMin = min ? new Date(min).getTime() : 0;
        const dMax = max ? new Date(max).getTime() : 0;
        const dt = d.getTime();
        if (operator === 'between' && (dt < dMin || dt > dMax)) return `Date must be between ${min} and ${max}`;
        if (operator === 'gt' && dt <= dMin) return `Date must be after ${min}`;
        if (operator === 'lt' && dt >= dMin) return `Date must be before ${min}`;
      }
      break;
    }
    case 'text':
      if (!isNaN(parseFloat(val)) && isFinite(val)) return 'Only text allowed (not numbers)';
      break;
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'A valid email address is required';
      break;
    }
    case 'url': {
      if (!/^https?:\/\/.+/.test(val)) return 'A valid URL is required (http:// or https://)';
      break;
    }
    case 'custom': {
      // Custom formula validation — attempt to evaluate formula
      // The formula should return true/false
      if (rule.formula) {
        try {
          // Simple custom validation: check if formula references produce a truthy result
          // For now we just validate that a formula was provided; real evaluation is done in the engine
          return null; // Allow value, formula validation happens on recalc
        } catch (e) {
          return 'Custom formula error';
        }
      }
      break;
    }
  }
  return null;
}

export function showDvDropdown(r, c, anchorEl) {
  document.querySelector('.sheet-dv-dropdown')?.remove();
  const key = `${r},${c}`;
  const dv = S.validations[key];
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

export function showDataValidationDialog(r, c) {
  const existing = document.querySelector('.sheet-dv-dialog');
  if (existing) existing.remove();

  const key = `${r},${c}`;
  const current = S.validations[key] || {};
  const inputStyle = 'width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box';

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal sheet-dv-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:420px">
      <div class="ai-setup-header">
        <h3>Data Validation — ${rcToRef(r, c)}</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-secondary)">Criteria</label>
          <select id="dv-type" style="${inputStyle}">
            <option value="list" ${current.type === 'list' ? 'selected' : ''}>Dropdown List</option>
            <option value="number" ${current.type === 'number' ? 'selected' : ''}>Number</option>
            <option value="integer" ${current.type === 'integer' ? 'selected' : ''}>Whole Number</option>
            <option value="text" ${current.type === 'text' ? 'selected' : ''}>Text only</option>
            <option value="text_length" ${current.type === 'text_length' ? 'selected' : ''}>Text Length</option>
            <option value="date" ${current.type === 'date' ? 'selected' : ''}>Date</option>
            <option value="email" ${current.type === 'email' ? 'selected' : ''}>Email</option>
            <option value="url" ${current.type === 'url' ? 'selected' : ''}>URL</option>
            <option value="custom" ${current.type === 'custom' ? 'selected' : ''}>Custom Formula</option>
          </select>
        </div>
        <div id="dv-severity-row" style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-secondary)">On invalid input</label>
          <select id="dv-severity" style="${inputStyle}">
            <option value="error" ${(current.severity || 'error') === 'error' ? 'selected' : ''}>Reject (Error)</option>
            <option value="warning" ${current.severity === 'warning' ? 'selected' : ''}>Show Warning (allow input)</option>
            <option value="info" ${current.severity === 'info' ? 'selected' : ''}>Show Info (allow input)</option>
          </select>
        </div>
        <div id="dv-list-row" style="margin-bottom:12px;display:${current.type === 'list' || !current.type ? 'block' : 'none'}">
          <label style="font-size:12px;color:var(--text-secondary)">List items (comma-separated)</label>
          <input type="text" id="dv-list" style="${inputStyle}" placeholder="Yes, No, Maybe" value="${current.type === 'list' ? (current.values || []).join(', ') : ''}">
        </div>
        <div id="dv-custom-row" style="margin-bottom:12px;display:${current.type === 'custom' ? 'block' : 'none'}">
          <label style="font-size:12px;color:var(--text-secondary)">Custom formula (must return TRUE/FALSE)</label>
          <input type="text" id="dv-formula" style="${inputStyle}" placeholder="=AND(A1>0, A1<100)" value="${current.formula || ''}">
          <span style="font-size:11px;color:var(--text-tertiary)">Use cell references relative to the validation cell</span>
        </div>
        <div id="dv-operator-row" style="margin-bottom:12px;display:${['number','integer','text_length','date'].includes(current.type) ? 'block' : 'none'}">
          <label style="font-size:12px;color:var(--text-secondary)">Condition</label>
          <select id="dv-operator" style="${inputStyle}">
            <option value="">Any</option>
            <option value="between" ${current.operator === 'between' ? 'selected' : ''}>Between</option>
            <option value="not_between" ${current.operator === 'not_between' ? 'selected' : ''}>Not between</option>
            <option value="gt" ${current.operator === 'gt' ? 'selected' : ''}>Greater than</option>
            <option value="gte" ${current.operator === 'gte' ? 'selected' : ''}>Greater than or equal</option>
            <option value="lt" ${current.operator === 'lt' ? 'selected' : ''}>Less than</option>
            <option value="lte" ${current.operator === 'lte' ? 'selected' : ''}>Less than or equal</option>
            <option value="eq" ${current.operator === 'eq' ? 'selected' : ''}>Equal to</option>
            <option value="neq" ${current.operator === 'neq' ? 'selected' : ''}>Not equal to</option>
          </select>
        </div>
        <div id="dv-min-row" style="margin-bottom:12px;display:${current.operator ? 'block' : 'none'}">
          <label style="font-size:12px;color:var(--text-secondary)" id="dv-min-label">Value</label>
          <input type="text" id="dv-min" style="${inputStyle}" value="${current.min ?? ''}">
        </div>
        <div id="dv-max-row" style="margin-bottom:12px;display:${['between','not_between'].includes(current.operator) ? 'block' : 'none'}">
          <label style="font-size:12px;color:var(--text-secondary)">Maximum</label>
          <input type="text" id="dv-max" style="${inputStyle}" value="${current.max ?? ''}">
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-secondary)">Input message (tooltip shown on cell select)</label>
          <input type="text" id="dv-input-msg" style="${inputStyle}" placeholder="e.g. Select a value from the list" value="${current.inputMessage || ''}">
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-secondary)">Error message (optional)</label>
          <input type="text" id="dv-error" style="${inputStyle}" placeholder="Custom error message" value="${current.errorMessage || ''}">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="dv-remove">Remove</button>
          <button class="ai-pull-btn" id="dv-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const typeEl = dialog.querySelector('#dv-type');
  const listRow = dialog.querySelector('#dv-list-row');
  const opRow = dialog.querySelector('#dv-operator-row');
  const minRow = dialog.querySelector('#dv-min-row');
  const maxRow = dialog.querySelector('#dv-max-row');
  const minLabel = dialog.querySelector('#dv-min-label');
  const opEl = dialog.querySelector('#dv-operator');

  const customRow = dialog.querySelector('#dv-custom-row');

  function updateDvUI() {
    const type = typeEl.value;
    const hasOp = ['number','integer','text_length','date'].includes(type);
    listRow.style.display = type === 'list' ? 'block' : 'none';
    customRow.style.display = type === 'custom' ? 'block' : 'none';
    opRow.style.display = hasOp ? 'block' : 'none';
    if (!hasOp) { minRow.style.display = 'none'; maxRow.style.display = 'none'; return; }
    const op = opEl.value;
    minRow.style.display = op ? 'block' : 'none';
    maxRow.style.display = ['between','not_between'].includes(op) ? 'block' : 'none';
    minLabel.textContent = ['between','not_between'].includes(op) ? 'Minimum' : 'Value';
  }

  typeEl.addEventListener('change', updateDvUI);
  opEl.addEventListener('change', updateDvUI);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#dv-remove')?.addEventListener('click', () => {
    const { r1, r2, c1, c2 } = getSelectionRange();
    for (let rr = r1; rr <= r2; rr++)
      for (let cc = c1; cc <= c2; cc++)
        delete S.validations[`${rr},${cc}`];
    renderGrid(); updateSelection();
    dialog.remove();
  });

  dialog.querySelector('#dv-apply')?.addEventListener('click', () => {
    const type = typeEl.value;
    const { r1, r2, c1, c2 } = getSelectionRange();
    const errorMessage = dialog.querySelector('#dv-error').value.trim() || undefined;
    const inputMessage = dialog.querySelector('#dv-input-msg').value.trim() || undefined;
    const severity = dialog.querySelector('#dv-severity').value || 'error';
    let rule = { type, errorMessage, inputMessage, severity };

    if (type === 'custom') {
      const formula = dialog.querySelector('#dv-formula').value.trim();
      if (!formula) return;
      rule.formula = formula;
    } else if (type === 'list') {
      const vals = dialog.querySelector('#dv-list').value.split(',').map(s => s.trim()).filter(Boolean);
      if (vals.length === 0) return;
      rule.values = vals;
    } else if (['number','integer','text_length','date'].includes(type)) {
      const op = opEl.value;
      if (op) {
        rule.operator = op;
        const minVal = dialog.querySelector('#dv-min').value.trim();
        if (type === 'date') {
          rule.min = minVal;
          rule.max = dialog.querySelector('#dv-max').value.trim() || undefined;
        } else {
          rule.min = parseFloat(minVal) || 0;
          rule.max = ['between','not_between'].includes(op) ? (parseFloat(dialog.querySelector('#dv-max').value) || 0) : undefined;
        }
      }
    }

    for (let rr = r1; rr <= r2; rr++)
      for (let cc = c1; cc <= c2; cc++)
        S.validations[`${rr},${cc}`] = { ...rule };

    renderGrid(); updateSelection();
    dialog.remove();
  });
}

/* ==================== Remove Duplicates ==================== */

export function removeDuplicates() {
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

export function textToColumns() {
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

export function printSheet() {
  showPrintPreviewDialog();
}

/**
 * Build the print CSS string for the sheet print window.
 * Pure function — no DOM access, fully testable.
 * @param {object} opts - Print options
 * @returns {string} CSS string
 */
export function buildPrintCSS(opts) {
  const { pageW, pageH, marginMM, showGridlines, showHeaders, repeatHeader, scaleCSS } = opts;
  const gridBorder = showGridlines ? '1px solid #ccc' : '1px solid transparent';

  return `
    @page { size: ${pageW}mm ${pageH}mm; margin: ${marginMM}mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: ${marginMM}mm; color: #000; }
    table { border-collapse: collapse; ${scaleCSS.includes('width:100%') ? 'width:100%;' : ''} }
    th, td { border: ${gridBorder}; padding: 4px 8px; font-size: 12px; vertical-align: middle; }
    th { background: ${showHeaders ? '#f0f0f2' : 'transparent'}; font-weight: 600; font-size: 11px; color: #555; text-align: center; }
    ${!showHeaders ? 'th { display: none; } td:first-child { border-left: ' + gridBorder + '; }' : ''}
    thead { display: table-header-group; }
    thead .print-header-row td { background: #f7f8fa; border-bottom: 2px solid #999; }
    .page-header { text-align: center; font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333; }
    .page-footer { position: fixed; bottom: ${marginMM}mm; left: ${marginMM}mm; right: ${marginMM}mm; text-align: center; font-size: 10px; color: #888; }
    ${scaleCSS}
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { page-break-inside: avoid; }
    }
    @media screen {
      body { max-width: ${pageW}mm; margin: 20px auto; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,.15); background: #fff; }
      .print-toolbar { position: sticky; top: 0; background: #f5f5f7; padding: 10px 16px; margin: -20px -20px 20px; border-bottom: 1px solid #ddd; display: flex; gap: 8px; align-items: center; z-index: 10; }
      .print-toolbar button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
      .print-toolbar .btn-print { background: #3b82f6; color: #fff; }
      .print-toolbar .btn-close { background: #e5e7eb; color: #333; }
    }
  `;
}

/**
 * Build the <table> HTML for sheet print output.
 * Pure function — accepts data, no direct DOM/global access, fully testable.
 * @param {object} sheet - Sheet data with cells, freezeRows, etc.
 * @param {object} opts - Print options: printR1, printR2, printC1, printC2, showHeaders, repeatHeader, showFormatting, hiddenRows, hiddenCols
 * @param {function} getCellFn - (sheet, r, c) => cell
 * @param {function} getDisplayFn - (sheet, r, c) => displayValue
 * @param {function} getColWidthFn - (c) => px width
 * @param {function} escapeFn - (str) => escaped HTML
 * @param {function} colToLetterFn - (c) => "A", "B", etc.
 * @param {function} printCellStyleFn - (cell) => inline CSS string
 * @returns {string} HTML table string
 */
export function buildPrintTableHTML(sheet, opts, getCellFn, getDisplayFn, getColWidthFn, escapeFn, colToLetterFn, printCellStyleFn) {
  const { printR1, printR2, printC1, printC2, showHeaders, repeatHeader, showFormatting, hiddenRows, hiddenCols } = opts;

  // Determine how many data rows go into <thead> for repeat-on-every-page
  const frozenDataRows = repeatHeader ? (sheet.freezeRows > 0 ? sheet.freezeRows : 1) : 0;

  let html = '<table>';

  // --- <thead> ---
  html += '<thead>';
  if (showHeaders) {
    html += '<tr>';
    html += '<th></th>';
    for (let c = printC1; c <= printC2; c++) {
      if (hiddenCols.has(c)) continue;
      const w = getColWidthFn(c);
      html += `<th style="min-width:${w}px">${colToLetterFn(c)}</th>`;
    }
    html += '</tr>';
  }

  // Frozen data rows in thead (repeat on every printed page)
  for (let r = printR1; r < printR1 + frozenDataRows && r <= printR2; r++) {
    if (hiddenRows.has(r)) continue;
    html += '<tr class="print-header-row">';
    if (showHeaders) html += `<th>${r + 1}</th>`;
    for (let c = printC1; c <= printC2; c++) {
      if (hiddenCols.has(c)) continue;
      const cell = getCellFn(sheet, r, c);
      if (cell?.format?.merged) continue;
      const val = getDisplayFn(sheet, r, c);
      const style = showFormatting ? printCellStyleFn(cell) : (typeof cell?.value === 'number' ? 'text-align:right' : '');
      const mergeSpan = cell?.format?.mergeSpan;
      const spanAttrs = mergeSpan ? ` rowspan="${mergeSpan.rows}" colspan="${mergeSpan.cols}"` : '';
      html += `<td style="font-weight:600;${style}"${spanAttrs}>${escapeFn(String(val))}</td>`;
    }
    html += '</tr>';
  }
  html += '</thead><tbody>';

  // Remaining data rows
  const bodyStartRow = printR1 + frozenDataRows;
  for (let r = bodyStartRow; r <= printR2; r++) {
    if (hiddenRows.has(r)) continue;
    html += '<tr>';
    if (showHeaders) html += `<th>${r + 1}</th>`;
    for (let c = printC1; c <= printC2; c++) {
      if (hiddenCols.has(c)) continue;
      const cell = getCellFn(sheet, r, c);
      if (cell?.format?.merged) continue;
      const val = getDisplayFn(sheet, r, c);
      const style = showFormatting ? printCellStyleFn(cell) : (typeof cell?.value === 'number' ? 'text-align:right' : '');
      const mergeSpan = cell?.format?.mergeSpan;
      const spanAttrs = mergeSpan ? ` rowspan="${mergeSpan.rows}" colspan="${mergeSpan.cols}"` : '';
      html += `<td style="${style}"${spanAttrs}>${escapeFn(String(val))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';

  return html;
}

/**
 * Build inline style string for a cell suitable for print output.
 * Mirrors cellStyle() but outputs only print-relevant CSS (no display:none for merged).
 */
export function printCellStyle(cell) {
  const parts = [];
  if (!cell) return '';
  const f = cell.format;
  if (f) {
    if (f.bold) parts.push('font-weight:700');
    if (f.italic) parts.push('font-style:italic');
    const textDeco = [];
    if (f.underline) textDeco.push('underline');
    if (f.strikethrough) textDeco.push('line-through');
    if (textDeco.length) parts.push(`text-decoration:${textDeco.join(' ')}`);
    if (f.align) parts.push(`text-align:${f.align}`);
    else if (typeof cell.value === 'number') parts.push('text-align:right');
    if (f.valign) parts.push(`vertical-align:${f.valign}`);
    if (f.bg && f.bg !== '#ffffff' && f.bg !== '#fff') parts.push(`background:${f.bg}`);
    if (f.color && f.color !== '#000000' && f.color !== '#000') parts.push(`color:${f.color}`);
    if (f.fontSize) parts.push(`font-size:${f.fontSize}px`);
    if (f.fontFamily) parts.push(`font-family:${f.fontFamily}`);
    if (f.indent) parts.push(`padding-left:${f.indent * 12}px`);
    if (f.wrap) parts.push('white-space:pre-wrap;word-wrap:break-word');
    if (f.borderTop) parts.push(`border-top:${f.borderTop}`);
    if (f.borderBottom) parts.push(`border-bottom:${f.borderBottom}`);
    if (f.borderLeft) parts.push(`border-left:${f.borderLeft}`);
    if (f.borderRight) parts.push(`border-right:${f.borderRight}`);
  } else if (typeof cell.value === 'number') {
    parts.push('text-align:right');
  }
  return parts.join(';');
}

/**
 * Show print preview dialog with page setup options.
 */
export function showPrintPreviewDialog() {
  const sheet = getSheet();
  // Determine data range
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  if (maxR === 0 && maxC === 0 && !getCell(sheet, 0, 0)) {
    alert('Sheet is empty — nothing to print.');
    return;
  }

  const { r1, r2, c1, c2 } = getSelectionRange();
  const hasSelection = r1 !== r2 || c1 !== c2;

  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML = `
    <div style="background:var(--bg-primary);color:var(--text-primary);border-radius:12px;padding:24px;box-shadow:0 16px 48px rgba(0,0,0,.3);max-width:480px;width:90%;max-height:90vh;overflow-y:auto;font-size:14px">
      <h3 style="margin:0 0 16px;font-size:18px">Print / Export PDF</h3>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Paper Size</label>
          <select id="pp-paper" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
            <option value="a4" selected>A4 (210 x 297 mm)</option>
            <option value="letter">Letter (8.5 x 11 in)</option>
            <option value="legal">Legal (8.5 x 14 in)</option>
            <option value="a3">A3 (297 x 420 mm)</option>
            <option value="b5">B5 (176 x 250 mm)</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Orientation</label>
          <select id="pp-orient" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
            <option value="portrait" selected>Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Margins</label>
          <select id="pp-margins" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
            <option value="normal" selected>Normal (20mm)</option>
            <option value="narrow">Narrow (10mm)</option>
            <option value="wide">Wide (30mm)</option>
            <option value="none">None</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Scaling</label>
          <select id="pp-scale" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
            <option value="100">100% (Actual Size)</option>
            <option value="fit-width" selected>Fit to Page Width</option>
            <option value="fit-page">Fit to One Page</option>
            <option value="75">75%</option>
            <option value="50">50%</option>
            <option value="150">150%</option>
          </select>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Print Area</label>
        <select id="pp-area" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
          <option value="all">Entire Sheet (used range)</option>
          ${hasSelection ? `<option value="selection" selected>Current Selection (${colToLetter(c1)}${r1+1}:${colToLetter(c2)}${r2+1})</option>` : ''}
        </select>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="pp-gridlines" checked> Show Gridlines
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="pp-headers"> Row/Column Headers
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="pp-repeat-header" checked> Repeat Header Row
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="pp-formatting" checked> Cell Formatting
        </label>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Header (top of page)</label>
          <input type="text" id="pp-header" value="${escapeHtml(getSheetName(S.activeSheetIdx))}" placeholder="e.g. Sheet Report" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Footer (bottom of page)</label>
          <input type="text" id="pp-footer" value="Page {page}" placeholder="Use {page} for page #" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px;box-sizing:border-box">
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button id="pp-cancel" style="padding:8px 20px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:13px">Cancel</button>
        <button id="pp-print" style="padding:8px 20px;border:none;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Print / PDF</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);

  dlg.querySelector('#pp-cancel').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelector('#pp-print').addEventListener('click', () => {
    const paper = dlg.querySelector('#pp-paper').value;
    const orient = dlg.querySelector('#pp-orient').value;
    const margins = dlg.querySelector('#pp-margins').value;
    const scale = dlg.querySelector('#pp-scale').value;
    const area = dlg.querySelector('#pp-area').value;
    const showGridlines = dlg.querySelector('#pp-gridlines').checked;
    const showHeaders = dlg.querySelector('#pp-headers').checked;
    const repeatHeader = dlg.querySelector('#pp-repeat-header').checked;
    const showFormatting = dlg.querySelector('#pp-formatting').checked;
    const headerText = dlg.querySelector('#pp-header').value.trim();
    const footerText = dlg.querySelector('#pp-footer').value.trim();
    dlg.remove();
    executePrint(sheet, { paper, orient, margins, scale, area, showGridlines, showHeaders, repeatHeader, showFormatting, headerText, footerText, maxR, maxC, r1, c1, r2, c2 });
  });
}

/**
 * Execute printing with the given options.
 */
export function executePrint(sheet, opts) {
  const { paper, orient, margins, scale, area, showGridlines, showHeaders, repeatHeader, showFormatting, headerText, footerText } = opts;

  // Determine print range
  let printR1, printR2, printC1, printC2;
  if (area === 'selection') {
    printR1 = opts.r1; printR2 = opts.r2; printC1 = opts.c1; printC2 = opts.c2;
  } else {
    printR1 = 0; printR2 = opts.maxR; printC1 = 0; printC2 = opts.maxC;
  }

  // Paper sizes in mm
  const paperSizes = {
    a4: { w: 210, h: 297 }, letter: { w: 216, h: 279 }, legal: { w: 216, h: 356 },
    a3: { w: 297, h: 420 }, b5: { w: 176, h: 250 }
  };
  const ps = paperSizes[paper] || paperSizes.a4;
  const pageW = orient === 'landscape' ? ps.h : ps.w;
  const pageH = orient === 'landscape' ? ps.w : ps.h;

  const marginMap = { normal: 20, narrow: 10, wide: 30, none: 0 };
  const marginMM = marginMap[margins] ?? 20;

  // Scale CSS
  let scaleCSS = '';
  if (scale === 'fit-width') {
    scaleCSS = `table { width: 100%; table-layout: auto; }`;
  } else if (scale === 'fit-page') {
    scaleCSS = `table { width: 100%; table-layout: auto; } body { height: ${pageH - marginMM * 2}mm; overflow: hidden; }`;
  } else {
    const pct = parseInt(scale) || 100;
    if (pct !== 100) scaleCSS = `table { transform: scale(${pct / 100}); transform-origin: top left; }`;
  }

  const win = window.open('', '_blank');
  if (!win) { alert('Popup blocked — please allow popups for print.'); return; }

  const cssStr = buildPrintCSS({ pageW, pageH, marginMM, showGridlines, showHeaders, repeatHeader, scaleCSS });

  let html = `<!DOCTYPE html><html><head><title>Print Sheet</title><style>${cssStr}</style></head><body>`;

  // Screen-only preview toolbar
  html += `<div class="print-toolbar no-print">
    <button class="btn-print" onclick="window.print()">Print</button>
    <button class="btn-close" onclick="window.close()">Close</button>
    <span style="margin-left:auto;font-size:12px;color:#666">Print Preview — ${paper.toUpperCase()} ${orient}</span>
  </div>`;

  if (headerText) {
    html += `<div class="page-header">${escapeHtml(headerText)}</div>`;
  }

  // Build table using pure function
  html += buildPrintTableHTML(sheet,
    { printR1, printR2, printC1, printC2, showHeaders, repeatHeader, showFormatting, hiddenRows: S.hiddenRows, hiddenCols: S.hiddenCols },
    getCell, getDisplayValue, getColWidth, escapeHtml, colToLetter, printCellStyle
  );

  if (footerText) {
    html += `<div class="page-footer">${escapeHtml(footerText).replace(/\{page\}/g, '<span class="page-num"></span>')}</div>`;
    // Use CSS counters for page numbers
    html += `<style>
      @media print {
        .page-footer { content: counter(page); }
        .page-num::after { content: counter(page); }
      }
      @media screen { .page-num::after { content: '1'; } }
    </style>`;
  }

  html += '</body></html>';

  win.document.write(html);
  win.document.close();
}

/* ==================== Sparklines ==================== */

export function insertSparkline() {
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

  // Show sparkline type/target dialog
  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-primary);color:var(--text-primary);border-radius:8px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2);z-index:10000;min-width:280px;font-size:14px;';
  dlg.innerHTML = `
    <h3 style="margin:0 0 16px">Insert Sparkline</h3>
    <label>Type:</label>
    <div style="display:flex;gap:8px;margin:8px 0 16px">
      <button class="sl-type-btn" data-type="line" style="flex:1;padding:8px;border:2px solid var(--accent-color);border-radius:6px;cursor:pointer;background:var(--hover-bg)">━━ Line</button>
      <button class="sl-type-btn" data-type="bar" style="flex:1;padding:8px;border:2px solid var(--border-color);border-radius:6px;cursor:pointer;background:var(--bg-primary)">▐▐ Bar</button>
      <button class="sl-type-btn" data-type="area" style="flex:1;padding:8px;border:2px solid var(--border-color);border-radius:6px;cursor:pointer;background:var(--bg-primary)">▓▓ Area</button>
      <button class="sl-type-btn" data-type="column" style="flex:1;padding:8px;border:2px solid var(--border-color);border-radius:6px;cursor:pointer;background:var(--bg-primary)">║║ Column</button>
    </div>
    <label>Place at cell:</label>
    <input id="sl-target" value="${colToLetter(c2 + 1)}${r1 + 1}" style="width:80px;padding:6px;margin:4px 8px;border:1px solid #ccc;border-radius:4px;">
    <div style="margin-top:16px;text-align:right">
      <button id="sl-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;border-radius:4px;cursor:pointer">Cancel</button>
      <button id="sl-ok" style="padding:6px 16px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer">Insert</button>
    </div>
  `;
  document.body.appendChild(dlg);

  let sparkType = 'line';
  dlg.querySelectorAll('.sl-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dlg.querySelectorAll('.sl-type-btn').forEach(b => { b.style.borderColor = 'var(--border-color)'; b.style.background = 'var(--bg-primary)'; });
      btn.style.borderColor = 'var(--accent-color)'; btn.style.background = 'var(--hover-bg)';
      sparkType = btn.dataset.type;
    });
  });

  return new Promise(resolve => {
    dlg.querySelector('#sl-cancel').addEventListener('click', () => { dlg.remove(); resolve(); });
    dlg.querySelector('#sl-ok').addEventListener('click', () => {
      const targetRef = dlg.querySelector('#sl-target').value.trim();
      dlg.remove();
      if (!targetRef) return resolve();
      const target = refToRC(targetRef.toUpperCase());
      if (!target) return resolve();

      const svg = generateSparklineSVG(vals, sparkType);
  const key = `${target[0]},${target[1]}`;
  if (!sheet.cells[key]) sheet.cells[key] = { raw: '', value: '', format: {} };
  sheet.cells[key].format.sparkline = svg;
  sheet.cells[key].raw = `[sparkline:${vals.join(',')}]`;
  sheet.cells[key].value = '';

  renderGrid();
  updateSelection();
      resolve();
    });
  });
}

export function generateSparklineSVG(vals, type = 'line') {
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
  } else if (type === 'area') {
    const points = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * (w - 4) + 2;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x},${y}`;
    });
    const polyPoints = [`2,${h - 2}`, ...points, `${w - 2},${h - 2}`].join(' ');
    const linePoints = points.join(' ');
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="${polyPoints}" fill="#3b82f620" stroke="none"/><polyline points="${linePoints}" fill="none" stroke="#3b82f6" stroke-width="1.5"/></svg>`)}`;
  } else if (type === 'column') {
    const gap = 2;
    const barW = Math.max(2, ((w - 4) / vals.length) - gap);
    const cols = vals.map((v, i) => {
      const bh = Math.max(1, ((v - min) / range) * (h - 4));
      const x = 2 + i * (barW + gap);
      const y = h - 2 - bh;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="#10b981" rx="1"/>`;
    }).join('');
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${cols}</svg>`)}`;
  }

  return '';
}

/* ==================== Cell Notes ==================== */



export function addCellNote(r, c) {
  const key = `${r},${c}`;
  const existing = S.cellNotes[key] || '';
  const note = prompt('Cell note:', existing);
  if (note === null) return; // cancelled
  if (note.trim() === '') {
    delete S.cellNotes[key];
  } else {
    S.cellNotes[key] = note;
  }
  renderGrid();
  updateSelection();
}

/* ==================== CSV Import/Export ==================== */

export function importCSV() {
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
      S.selectedRow = 0; S.selectedCol = 0;
      updateSelection();
    };
    reader.readAsText(file);
  };
  input.click();
}

export function parseCSV(text, delimiter = ',') {
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

export function exportCSV() {
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
  downloadBlob(blob, 'spreadsheet.csv');
}

export function exportXLSX() {
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
<S.sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></S.sheets>
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
    downloadBlob(blob, 'spreadsheet.xlsx');
  });
}

export function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function createMinimalZip(files) {
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

export function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}


/* ==================== Charts ==================== */



export function showChartDialog() {
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
          <option value="stacked_column">Stacked Column</option>
          <option value="stacked_bar">Stacked Bar</option>
          <option value="waterfall">Waterfall</option>
        </select>
        <label style="font-size:12px;font-weight:600">Title</label>
        <input id="chart-title" value="Chart" style="width:100%;padding:6px;margin:4px 0 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <label style="font-size:12px;font-weight:600">X-Axis Label</label>
        <input id="chart-x-label" value="" placeholder="X-Axis" style="width:100%;padding:4px;margin:2px 0 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:11px">
        <label style="font-size:12px;font-weight:600">Y-Axis Label</label>
        <input id="chart-y-label" value="" placeholder="Y-Axis" style="width:100%;padding:4px;margin:2px 0 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:11px">
        <label style="font-size:12px;font-weight:600;display:block;margin-top:6px">Title Font Size</label>
        <input id="chart-title-fontsize" type="number" min="8" max="28" value="14" style="width:100%;padding:4px;margin:2px 0 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:11px">
        <label style="font-size:12px"><input type="checkbox" id="chart-legend" checked> Show Legend</label><br>
        <label style="font-size:12px;font-weight:600;display:block;margin-top:4px">Legend Position</label>
        <select id="chart-legend-position" style="width:100%;padding:4px;margin:2px 0 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:11px">
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="none">None</option>
        </select>
        <label style="font-size:12px"><input type="checkbox" id="chart-first-row-labels" checked> First row as labels</label><br>
        <label style="font-size:12px"><input type="checkbox" id="chart-first-col-labels" checked> First column as labels</label><br>
        <label style="font-size:12px"><input type="checkbox" id="chart-trendline"> Show Trendline</label><br>
        <label style="font-size:12px"><input type="checkbox" id="chart-gridlines" checked> Show Gridlines</label>
        <label style="font-size:12px;font-weight:600;margin-top:8px;display:block">Color Theme</label>
        <select id="chart-color-theme" style="width:100%;padding:6px;margin:4px 0 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
          <option value="default">Default</option>
          <option value="ocean">Ocean</option>
          <option value="sunset">Sunset</option>
          <option value="pastel">Pastel</option>
          <option value="monochrome">Monochrome</option>
          <option value="vivid">Vivid</option>
          <option value="earth">Earth</option>
          <option value="neon">Neon</option>
        </select>
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
  const titleFsEl = dlg.querySelector('#chart-title-fontsize');
  const xLabelEl = dlg.querySelector('#chart-x-label');
  const yLabelEl = dlg.querySelector('#chart-y-label');
  const legendEl = dlg.querySelector('#chart-legend');
  const legendPosEl = dlg.querySelector('#chart-legend-position');
  const firstRowEl = dlg.querySelector('#chart-first-row-labels');
  const firstColEl = dlg.querySelector('#chart-first-col-labels');
  const trendlineEl = dlg.querySelector('#chart-trendline');
  const gridlinesEl = dlg.querySelector('#chart-gridlines');
  const colorThemeEl = dlg.querySelector('#chart-color-theme');
  const canvas = dlg.querySelector('#chart-preview-canvas');

  const updatePreview = () => {
    renderChartToCanvas(canvas, dataRows, typeEl.value, titleEl.value, legendEl.checked, firstRowEl.checked, firstColEl.checked, trendlineEl.checked, xLabelEl.value, yLabelEl.value, gridlinesEl.checked, colorThemeEl.value, parseInt(titleFsEl.value) || 14, legendPosEl.value);
  };
  updatePreview();
  typeEl.onchange = updatePreview;
  titleEl.oninput = updatePreview;
  titleFsEl.oninput = updatePreview;
  xLabelEl.oninput = updatePreview;
  yLabelEl.oninput = updatePreview;
  legendEl.onchange = updatePreview;
  legendPosEl.onchange = updatePreview;
  firstRowEl.onchange = updatePreview;
  firstColEl.onchange = updatePreview;
  trendlineEl.onchange = updatePreview;
  gridlinesEl.onchange = updatePreview;
  colorThemeEl.onchange = updatePreview;

  dlg.querySelector('#chart-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#chart-insert').onclick = () => {
    const chartConfig = {
      dataRows: JSON.parse(JSON.stringify(dataRows)),
      sourceRange: { r1, c1, r2, c2, sheetIdx: S.activeSheetIdx },
      type: typeEl.value,
      title: titleEl.value,
      titleFontSize: parseInt(titleFsEl.value) || 14,
      xLabel: xLabelEl.value,
      yLabel: yLabelEl.value,
      showLegend: legendEl.checked,
      legendPosition: legendPosEl.value,
      firstRowLabels: firstRowEl.checked,
      firstColLabels: firstColEl.checked,
      trendline: trendlineEl.checked,
      showGridlines: gridlinesEl.checked,
      colorTheme: colorThemeEl.value,
    };
    insertChartWidget(chartConfig);
    dlg.remove();
  };
}

export function insertChartWidget(config, left = 40, top = 40, width = 480, height = 340) {
  S.chartCounter++;
  const chartId = `chart-${S.chartCounter}`;
  const chartDiv = document.createElement('div');
  chartDiv.className = 'sheet-chart-container';
  chartDiv.id = chartId;
  chartDiv.style.cssText = `position:absolute;width:${width}px;height:${height}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);padding:8px;z-index:100;cursor:move;left:${left}px;top:${top}px;overflow:hidden`;
  chartDiv.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
    <span style="font-size:11px;color:var(--text-secondary)">${config.title || 'Chart'}</span>
    <div style="display:flex;gap:4px">
      <button class="chart-export-btn" style="border:none;background:none;cursor:pointer;font-size:12px;color:var(--text-secondary)" title="Export as PNG">⬇</button>
      <button class="chart-edit-btn" style="border:none;background:none;cursor:pointer;font-size:12px;color:var(--text-secondary)" title="Edit Chart">✎</button>
      <button class="chart-close-btn" style="border:none;background:none;cursor:pointer;font-size:14px;color:var(--text-secondary)" title="Remove">✕</button>
    </div>
  </div>
  <canvas width="${width - 20}" height="${height - 40}"></canvas>
  <div class="chart-resize-handle chart-resize-se" style="position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:se-resize;z-index:10;background:linear-gradient(135deg,transparent 50%,var(--border-color) 50%)"></div>
  <div class="chart-resize-handle chart-resize-e" style="position:absolute;right:0;top:20px;bottom:14px;width:6px;cursor:e-resize;z-index:10"></div>
  <div class="chart-resize-handle chart-resize-s" style="position:absolute;bottom:0;left:14px;right:14px;height:6px;cursor:s-resize;z-index:10"></div>`;
  S.containerEl.style.position = 'relative';
  S.containerEl.appendChild(chartDiv);

  // Store config on the element for editing
  chartDiv._chartConfig = config;

  const canvasEl = chartDiv.querySelector('canvas');
  const rerender = () => {
    renderChartToCanvas(canvasEl, config.dataRows, config.type, config.title, config.showLegend, config.firstRowLabels, config.firstColLabels, config.trendline, config.xLabel, config.yLabel, config.showGridlines, config.colorTheme, config.titleFontSize || 14, config.legendPosition || 'bottom');
  };
  rerender();
  makeDraggable(chartDiv);

  // Close button
  chartDiv.querySelector('.chart-close-btn').onclick = () => chartDiv.remove();

  // Edit button
  chartDiv.querySelector('.chart-edit-btn').onclick = () => editChart(chartDiv);

  // Export as PNG
  chartDiv.querySelector('.chart-export-btn').addEventListener('click', () => {
    const exportCanvas = chartDiv.querySelector('canvas');
    if (!exportCanvas) return;
    const link = document.createElement('a');
    link.download = `${(config.title || 'chart').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  });

  // Custom resize handles
  chartDiv.querySelectorAll('.chart-resize-handle').forEach((handle) => {
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = chartDiv.offsetWidth;
      const startH = chartDiv.offsetHeight;
      const isE = handle.classList.contains('chart-resize-e') || handle.classList.contains('chart-resize-se');
      const isS = handle.classList.contains('chart-resize-s') || handle.classList.contains('chart-resize-se');
      const onMove = (ev) => {
        if (isE) chartDiv.style.width = Math.max(200, startW + ev.clientX - startX) + 'px';
        if (isS) chartDiv.style.height = Math.max(150, startH + ev.clientY - startY) + 'px';
        const cw = chartDiv.clientWidth - 20;
        const ch = chartDiv.clientHeight - 40;
        if (cw > 0 && ch > 0) {
          canvasEl.width = cw;
          canvasEl.height = ch;
          rerender();
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // Resize observer — re-render chart when container is resized (for programmatic resizes)
  const ro = new ResizeObserver(() => {
    const cw = chartDiv.clientWidth - 20;
    const ch = chartDiv.clientHeight - 40;
    if (cw > 0 && ch > 0) {
      canvasEl.width = cw;
      canvasEl.height = ch;
      rerender();
    }
  });
  ro.observe(chartDiv);
}

/** Refresh all chart widgets by re-reading data from their source ranges */
export function refreshChartWidgets() {
  const chartWidgets = S.containerEl?.querySelectorAll('.sheet-chart-container');
  if (!chartWidgets) return;
  chartWidgets.forEach(chartDiv => {
    const config = chartDiv._chartConfig;
    if (!config?.sourceRange) return;
    const { r1, c1, r2, c2, sheetIdx } = config.sourceRange;
    const srcSheet = S.sheets[sheetIdx ?? S.activeSheetIdx];
    if (!srcSheet) return;
    const newData = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) {
        row.push(getDisplayValue(srcSheet, r, c));
      }
      newData.push(row);
    }
    config.dataRows = newData;
    const canvasEl = chartDiv.querySelector('canvas');
    if (canvasEl) {
      renderChartToCanvas(canvasEl, config.dataRows, config.type, config.title, config.showLegend, config.firstRowLabels, config.firstColLabels, config.trendline, config.xLabel, config.yLabel, config.showGridlines, config.colorTheme, config.titleFontSize || 14, config.legendPosition || 'bottom');
    }
  });
}

export function editChart(chartDiv) {
  const config = chartDiv._chartConfig;
  if (!config) return;
  const inputStyle = 'width:100%;padding:6px;margin:4px 0 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)';

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:500px;max-height:90vh;overflow:auto">
    <h3 style="margin:0 0 12px">Edit Chart</h3>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">Chart Type</label>
      <select id="edit-chart-type" style="${inputStyle}">
        <option value="bar" ${config.type==='bar'?'selected':''}>Bar</option>
        <option value="column" ${config.type==='column'?'selected':''}>Column</option>
        <option value="line" ${config.type==='line'?'selected':''}>Line</option>
        <option value="area" ${config.type==='area'?'selected':''}>Area</option>
        <option value="pie" ${config.type==='pie'?'selected':''}>Pie</option>
        <option value="scatter" ${config.type==='scatter'?'selected':''}>Scatter</option>
        <option value="doughnut" ${config.type==='doughnut'?'selected':''}>Doughnut</option>
        <option value="radar" ${config.type==='radar'?'selected':''}>Radar</option>
        <option value="stacked_column" ${config.type==='stacked_column'?'selected':''}>Stacked Column</option>
        <option value="stacked_bar" ${config.type==='stacked_bar'?'selected':''}>Stacked Bar</option>
        <option value="waterfall" ${config.type==='waterfall'?'selected':''}>Waterfall</option>
      </select>
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">Title</label>
      <input id="edit-chart-title" value="${config.title}" style="${inputStyle}">
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">Title Font Size</label>
      <input id="edit-chart-title-fontsize" type="number" min="8" max="28" value="${config.titleFontSize || 14}" style="${inputStyle}">
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">X-Axis Label</label>
      <input id="edit-chart-x-label" value="${config.xLabel || ''}" placeholder="X-Axis" style="${inputStyle}">
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">Y-Axis Label</label>
      <input id="edit-chart-y-label" value="${config.yLabel || ''}" placeholder="Y-Axis" style="${inputStyle}">
    </div>
    <label style="font-size:12px"><input type="checkbox" id="edit-chart-legend" ${config.showLegend?'checked':''}> Show Legend</label><br>
    <div style="margin-bottom:8px;margin-top:4px">
      <label style="font-size:12px;font-weight:600">Legend Position</label>
      <select id="edit-chart-legend-position" style="${inputStyle}">
        ${['bottom','top','left','right','none'].map(p => `<option value="${p}" ${(config.legendPosition||'bottom')===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
      </select>
    </div>
    <label style="font-size:12px"><input type="checkbox" id="edit-chart-trendline" ${config.trendline?'checked':''}> Show Trendline</label><br>
    <label style="font-size:12px"><input type="checkbox" id="edit-chart-gridlines" ${config.showGridlines!==false?'checked':''}> Show Gridlines</label>
    <div style="margin-top:8px">
      <label style="font-size:12px;font-weight:600">Color Theme</label>
      <select id="edit-chart-color-theme" style="${inputStyle}">
        ${Object.keys(CHART_COLOR_THEMES).map(k => `<option value="${k}" ${config.colorTheme===k?'selected':''}>${k.charAt(0).toUpperCase()+k.slice(1)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button class="toolbar-btn" id="edit-chart-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="edit-chart-apply" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Apply</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  dlg.querySelector('#edit-chart-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#edit-chart-apply').onclick = () => {
    config.type = dlg.querySelector('#edit-chart-type').value;
    config.title = dlg.querySelector('#edit-chart-title').value;
    config.titleFontSize = parseInt(dlg.querySelector('#edit-chart-title-fontsize').value) || 14;
    config.xLabel = dlg.querySelector('#edit-chart-x-label').value;
    config.yLabel = dlg.querySelector('#edit-chart-y-label').value;
    config.showLegend = dlg.querySelector('#edit-chart-legend').checked;
    config.legendPosition = dlg.querySelector('#edit-chart-legend-position').value;
    config.trendline = dlg.querySelector('#edit-chart-trendline').checked;
    config.showGridlines = dlg.querySelector('#edit-chart-gridlines').checked;
    config.colorTheme = dlg.querySelector('#edit-chart-color-theme').value;
    chartDiv._chartConfig = config;
    chartDiv.querySelector('span').textContent = config.title;
    const canvasEl = chartDiv.querySelector('canvas');
    renderChartToCanvas(canvasEl, config.dataRows, config.type, config.title, config.showLegend, config.firstRowLabels, config.firstColLabels, config.trendline, config.xLabel, config.yLabel, config.showGridlines, config.colorTheme, config.titleFontSize, config.legendPosition);
    dlg.remove();
  };
}

export function makeDraggable(el) {
  let ox, oy, sx, sy;
  el.onmousedown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'CANVAS' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    ox = e.clientX; oy = e.clientY;
    sx = el.offsetLeft; sy = el.offsetTop;
    const move = (ev) => { el.style.left = (sx + ev.clientX - ox) + 'px'; el.style.top = (sy + ev.clientY - oy) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
}

export const CHART_COLOR_THEMES = {
  default: ['#4285f4','#ea4335','#fbbc05','#34a853','#ff6d01','#46bdc6','#7baaf7','#f07b72','#fdd663','#57bb8a','#ff9e40','#78d5dd'],
  ocean: ['#0077b6','#00b4d8','#90e0ef','#023e8a','#0096c7','#48cae4','#ade8f4','#caf0f8','#005f73','#0a9396','#94d2bd','#e9d8a6'],
  sunset: ['#ff6b6b','#ee5a24','#f0932b','#ffbe76','#ff7979','#eb4d4b','#6ab04c','#badc58','#e056fd','#be2edd','#7ed6df','#22a6b3'],
  pastel: ['#a8dadc','#f4a261','#e76f51','#264653','#2a9d8f','#e9c46a','#f9c74f','#90be6d','#43aa8b','#577590','#f8961e','#f3722c'],
  monochrome: ['#212529','#495057','#6c757d','#868e96','#adb5bd','#ced4da','#343a40','#495057','#dee2e6','#e9ecef','#f1f3f5','#f8f9fa'],
  vivid: ['#ff0054','#ff5400','#ffbd00','#00ff87','#00b4d8','#7b2ff7','#ff006e','#fb5607','#ffbe0b','#3a86ff','#8338ec','#06d6a0'],
  earth: ['#606c38','#283618','#dda15e','#bc6c25','#fefae0','#588157','#344e41','#a3b18a','#dad7cd','#3a5a40','#7f5539','#b08968'],
  neon: ['#39ff14','#ff073a','#00f0ff','#ff00ff','#fff01f','#ff8c00','#7fff00','#00ffff','#ff1493','#ffd700','#00ff7f','#ff4500'],
};

export const CHART_COLORS = CHART_COLOR_THEMES.default;

export function renderChartToCanvas(canvas, dataRows, type, title, showLegend, firstRowLabels, firstColLabels, showTrendline, xAxisLabel, yAxisLabel, showGridlines, colorTheme, titleFontSize, legendPosition) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary') || '#fff';
  ctx.fillRect(0, 0, W, H);
  const colors = CHART_COLOR_THEMES[colorTheme] || CHART_COLOR_THEMES.default;
  const tfs = titleFontSize || 14;
  const legPos = legendPosition || 'bottom';
  // If legend position is 'none', disable legend display
  const effectiveLegend = showLegend && legPos !== 'none';

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
  ctx.font = `bold ${tfs}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(title, W / 2, tfs + 4);

  if (type === 'pie' || type === 'doughnut') {
    renderPieChart(ctx, W, H, series[0] || [], labels, type === 'doughnut', effectiveLegend, textColor, colors, legPos);
    return;
  }
  if (type === 'radar') {
    renderRadarChart(ctx, W, H, series, labels, seriesNames, effectiveLegend, textColor, colors, legPos);
    return;
  }

  // Axis charts (bar, column, line, area, scatter)
  const pad = { top: tfs + 14, right: 20, bottom: 50, left: 55 };
  if (effectiveLegend && legPos === 'bottom') pad.bottom += 20;
  if (effectiveLegend && legPos === 'top') pad.top += 20;
  if (effectiveLegend && legPos === 'right') pad.right += 90;
  if (effectiveLegend && legPos === 'left') pad.left += 90;
  if (xAxisLabel) pad.bottom += 16;
  if (yAxisLabel) pad.left += 16;
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const allVals = series.flat();
  let maxVal = Math.max(...allVals, 1);
  let minVal = Math.min(...allVals, 0);
  if (minVal > 0) minVal = 0;
  const range = maxVal - minVal || 1;

  // Grid lines
  const shouldDrawGridlines = showGridlines !== false;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'right';
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = pad.top + cH - (i / gridSteps) * cH;
    if (shouldDrawGridlines) {
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    }
    const val = minVal + (i / gridSteps) * range;
    ctx.fillText(val % 1 === 0 ? val.toString() : val.toFixed(1), pad.left - 4, y + 3);
  }

  // Y-axis label (rotated)
  if (yAxisLabel) {
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.translate(14, pad.top + cH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
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
        ctx.fillStyle = colors[s % colors.length];
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
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(x + (grpW * 0.15) + s * barW, pad.top + cH - barH, barW, barH);
      }
    }
  } else if (type === 'line' || type === 'area') {
    for (let s = 0; s < series.length; s++) {
      ctx.strokeStyle = colors[s % colors.length];
      ctx.fillStyle = colors[s % colors.length];
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
    // Use first two series as X,Y; additional series as extra scatter groups
    const scatterSeries = series.length >= 2
      ? Array.from({ length: Math.floor(series.length / 2) }, (_, i) => ({ xs: series[i * 2], ys: series[i * 2 + 1] }))
      : [{ xs: series[0] || [], ys: series[0] || [] }];
    const allXs = scatterSeries.flatMap(s => s.xs);
    const allYs = scatterSeries.flatMap(s => s.ys);
    const xMin = Math.min(...allXs, 0);
    const xMax = Math.max(...allXs, 1);
    const yMin = Math.min(...allYs, 0);
    const yMax = Math.max(...allYs, 1);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    // X-axis labels for scatter
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const v = xMin + (i / 5) * xRange;
      const x = pad.left + (i / 5) * cW;
      ctx.fillText(v % 1 === 0 ? v.toString() : v.toFixed(1), x, pad.top + cH + 14);
    }
    scatterSeries.forEach((sg, si) => {
      ctx.fillStyle = colors[si % colors.length];
      for (let i = 0; i < sg.xs.length; i++) {
        const x = pad.left + ((sg.xs[i] - xMin) / xRange) * cW;
        const y = pad.top + cH - ((sg.ys[i] - yMin) / yRange) * cH;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        // Draw a subtle border
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  } else if (type === 'stacked_column') {
    const grpW = cW / n;
    // Recalculate max for stacked
    const stackMax = Math.max(...labels.map((_, i) => series.reduce((sum, s) => sum + Math.max(0, s[i] || 0), 0)), 1);
    for (let i = 0; i < n; i++) {
      const x = pad.left + i * grpW;
      ctx.fillStyle = textColor;
      ctx.fillText(labels[i] || '', x + grpW / 2, pad.top + cH + 14);
      let cumY = 0;
      for (let s = 0; s < series.length; s++) {
        const v = Math.max(0, series[s][i] || 0);
        const barH = (v / stackMax) * cH;
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(x + grpW * 0.15, pad.top + cH - cumY - barH, grpW * 0.7, barH);
        cumY += barH;
      }
    }
  } else if (type === 'stacked_bar') {
    const stackMax = Math.max(...labels.map((_, i) => series.reduce((sum, s) => sum + Math.max(0, s[i] || 0), 0)), 1);
    for (let i = 0; i < n; i++) {
      const baseY = pad.top + (i / n) * cH;
      const barH = cH / n * 0.7;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'right';
      ctx.fillText(labels[i] || '', pad.left - 4, baseY + cH / n / 2 + 3);
      let cumX = 0;
      for (let s = 0; s < series.length; s++) {
        const v = Math.max(0, series[s][i] || 0);
        const barW = (v / stackMax) * cW;
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(pad.left + cumX, baseY + (cH / n - barH) / 2, barW, barH);
        cumX += barW;
      }
    }
  } else if (type === 'waterfall') {
    const vals = series[0] || [];
    const grpW = cW / n;
    let running = 0;
    for (let i = 0; i < n; i++) {
      const v = vals[i] || 0;
      const x = pad.left + i * grpW;
      const barTop = v >= 0 ? running : running + v;
      const barH = Math.abs(v) / range * cH;
      const y = pad.top + cH - ((barTop - minVal) / range) * cH - barH;
      ctx.fillStyle = v >= 0 ? '#34a853' : '#ea4335';
      ctx.fillRect(x + grpW * 0.15, y, grpW * 0.7, barH);
      running += v;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i] || '', x + grpW / 2, pad.top + cH + 14);
    }
  }

  // Trendline (linear regression for first series)
  if (showTrendline && series.length > 0 && !['pie','doughnut','radar','stacked_bar'].includes(type)) {
    const vals = series[0];
    const tN = vals.length;
    if (tN >= 2) {
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < tN; i++) {
        sumX += i; sumY += vals[i]; sumXY += i * vals[i]; sumX2 += i * i;
      }
      const slope = (tN * sumXY - sumX * sumY) / (tN * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / tN;
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      const x0 = pad.left;
      const y0 = pad.top + cH - ((intercept - minVal) / range) * cH;
      const x1 = pad.left + cW;
      const y1 = pad.top + cH - ((slope * (tN - 1) + intercept - minVal) / range) * cH;
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // X-axis label
  if (xAxisLabel) {
    ctx.fillStyle = textColor;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const xLabelY = pad.top + cH + 32 + (xAxisLabel ? 0 : 0);
    ctx.fillText(xAxisLabel, pad.left + cW / 2, xLabelY);
  }

  // Legend
  if (effectiveLegend && series.length > 0) {
    ctx.font = '10px system-ui, sans-serif';
    if (legPos === 'bottom') {
      const ly = H - 14;
      let lx = W / 2 - (seriesNames.length * 70) / 2;
      for (let s = 0; s < seriesNames.length; s++) {
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(lx, ly - 8, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], lx + 16, ly);
        lx += 70;
      }
    } else if (legPos === 'top') {
      const ly = pad.top - 8;
      let lx = W / 2 - (seriesNames.length * 70) / 2;
      for (let s = 0; s < seriesNames.length; s++) {
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(lx, ly - 8, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], lx + 16, ly);
        lx += 70;
      }
    } else if (legPos === 'right') {
      const lx = W - pad.right + 10;
      for (let s = 0; s < seriesNames.length; s++) {
        const ly = pad.top + 10 + s * 18;
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(lx, ly - 8, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], lx + 16, ly);
      }
    } else if (legPos === 'left') {
      const lx = 8;
      for (let s = 0; s < seriesNames.length; s++) {
        const ly = pad.top + 10 + s * 18;
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(lx, ly - 8, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], lx + 16, ly);
      }
    }
  }
}

export function renderPieChart(ctx, W, H, data, labels, isDoughnut, showLegend, textColor, colors, legPos) {
  const total = data.reduce((a, b) => a + b, 0) || 1;
  const lp = legPos || 'bottom';
  const legendSpace = showLegend ? 40 : 0;
  const cx = lp === 'left' ? W / 2 + legendSpace / 2 : lp === 'right' ? W / 2 - legendSpace / 2 : W / 2;
  const cy = lp === 'top' ? H / 2 + legendSpace / 2 + 10 : lp === 'bottom' ? H / 2 : H / 2 + 10;
  const radius = Math.min(W, H) / 2 - (showLegend ? 55 : 35);
  let angle = -Math.PI / 2;

  // Draw slices with slight gap between them
  for (let i = 0; i < data.length; i++) {
    const slice = (data[i] / total) * Math.PI * 2;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fill();
    // Slice border
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label with percentage
    const mid = angle + slice / 2;
    const pct = ((data[i] / total) * 100).toFixed(1);
    const pctNum = parseFloat(pct);
    if (pctNum > 5) {
      // Inside label
      const labelR = isDoughnut ? radius * 0.75 : radius * 0.65;
      const lx = cx + Math.cos(mid) * labelR;
      const ly = cy + Math.sin(mid) * labelR;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(pct + '%', lx, ly + 4);
    } else if (pctNum > 1) {
      // Outside label for small slices
      const outerR = radius + 16;
      const lx = cx + Math.cos(mid) * outerR;
      const ly = cy + Math.sin(mid) * outerR;
      ctx.fillStyle = textColor;
      ctx.font = '9px system-ui';
      ctx.textAlign = Math.cos(mid) > 0 ? 'left' : 'right';
      ctx.fillText(`${labels[i] || ''} ${pct}%`, lx, ly + 3);
    }
    angle += slice;
  }

  if (isDoughnut) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary') || '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Center label showing total
    ctx.fillStyle = textColor;
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(total % 1 === 0 ? total.toString() : total.toFixed(1), cx, cy + 5);
    ctx.font = '9px system-ui';
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.5;
    ctx.fillText('Total', cx, cy - 10);
    ctx.globalAlpha = 1;
  }

  if (showLegend) {
    ctx.font = '10px system-ui';
    const colW = Math.max(60, Math.min(80, (W - 20) / Math.max(labels.length, 1)));
    if (lp === 'bottom') {
      const legendY = H - 14;
      let lx = W / 2 - (labels.length * colW) / 2;
      for (let i = 0; i < labels.length; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(lx, legendY - 8, 10, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        const lbl = (labels[i] || '').length > 8 ? (labels[i] || '').slice(0, 7) + '..' : (labels[i] || '');
        ctx.fillText(lbl, lx + 14, legendY);
        lx += colW;
      }
    } else if (lp === 'top') {
      const legendY = 32;
      let lx = W / 2 - (labels.length * colW) / 2;
      for (let i = 0; i < labels.length; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(lx, legendY - 8, 10, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        const lbl = (labels[i] || '').length > 8 ? (labels[i] || '').slice(0, 7) + '..' : (labels[i] || '');
        ctx.fillText(lbl, lx + 14, legendY);
        lx += colW;
      }
    } else if (lp === 'right') {
      for (let i = 0; i < labels.length; i++) {
        const ly = 40 + i * 16;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(W - 80, ly - 8, 10, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        const lbl = (labels[i] || '').length > 8 ? (labels[i] || '').slice(0, 7) + '..' : (labels[i] || '');
        ctx.fillText(lbl, W - 66, ly);
      }
    } else if (lp === 'left') {
      for (let i = 0; i < labels.length; i++) {
        const ly = 40 + i * 16;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(6, ly - 8, 10, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        const lbl = (labels[i] || '').length > 8 ? (labels[i] || '').slice(0, 7) + '..' : (labels[i] || '');
        ctx.fillText(lbl, 20, ly);
      }
    }
  }
}

export function renderRadarChart(ctx, W, H, series, labels, seriesNames, showLegend, textColor, colors, legPos) {
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
    ctx.strokeStyle = colors[s % colors.length];
    ctx.fillStyle = colors[s % colors.length];
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
    const lp = legPos || 'bottom';
    ctx.font = '10px system-ui';
    if (lp === 'bottom') {
      let lx = W / 2 - (seriesNames.length * 70) / 2;
      for (let s = 0; s < seriesNames.length; s++) {
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(lx, H - 14 - 8, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], lx + 16, H - 14);
        lx += 70;
      }
    } else if (lp === 'top') {
      let lx = W / 2 - (seriesNames.length * 70) / 2;
      for (let s = 0; s < seriesNames.length; s++) {
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(lx, 24, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], lx + 16, 32);
        lx += 70;
      }
    } else if (lp === 'right') {
      for (let s = 0; s < seriesNames.length; s++) {
        const ly = 40 + s * 18;
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(W - 85, ly - 8, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], W - 69, ly);
      }
    } else if (lp === 'left') {
      for (let s = 0; s < seriesNames.length; s++) {
        const ly = 40 + s * 18;
        ctx.fillStyle = colors[s % colors.length];
        ctx.fillRect(6, ly - 8, 12, 8);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(seriesNames[s], 22, ly);
      }
    }
  }
}

/* ==================== Cell Merge ==================== */



export function toggleMergeCells() {
  const sheet = getSheet();
  const { r1, c1, r2, c2 } = getSelectionRange();
  const topCell = getCell(sheet, r1, c1);

  // Check if top-left cell already has a merge span (unmerge)
  if (topCell?.format?.mergeSpan) {
    saveUndoState();
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

export function getMergeInfo(r, c) {
  for (const m of S.mergedCells) {
    if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) {
      return m;
    }
  }
  return null;
}

/* ==================== Conditional Formatting ==================== */

export function showConditionalFormatDialog() {
  const { r1, c1, r2, c2 } = getSelectionRange();
  const rangeStr = `${colToLetter(c1)}${r1 + 1}:${colToLetter(c2)}${r2 + 1}`;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:440px">
    <h3 style="margin:0 0 12px">Conditional Formatting</h3>
    <div style="margin-bottom:8px;font-size:12px">Range: <strong>${rangeStr}</strong></div>
    <label style="font-size:12px;font-weight:600">Format Type</label>
    <select id="cf-type" style="width:100%;padding:6px;margin:4px 0 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
      <option value="colorScale">Color Scale 3-Color (min→mid→max)</option>
      <option value="colorScale2">Color Scale 2-Color (min→max)</option>
      <option value="dataBar">Data Bars</option>
      <option value="iconSet">Icon Set</option>
      <option value="greaterThan">Greater Than</option>
      <option value="lessThan">Less Than</option>
      <option value="equalTo">Equal To</option>
      <option value="between">Between</option>
      <option value="text">Text Contains</option>
      <option value="duplicate">Duplicate Values</option>
      <option value="top10">Top 10</option>
      <option value="uniqueValues">Unique Values</option>
      <option value="aboveAvg">Above Average</option>
      <option value="belowAvg">Below Average</option>
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
    } else if (t === 'colorScale2') {
      html = `<div style="display:flex;gap:8px;margin-top:4px">
        <label style="font-size:12px">Min color: <input type="color" id="cf-min-color" value="#f8696b"></label>
        <label style="font-size:12px">Max color: <input type="color" id="cf-max-color" value="#63be7b"></label>
      </div>`;
    } else if (t === 'dataBar') {
      html = `<label style="font-size:12px">Bar color: <input type="color" id="cf-bar-color" value="#4285f4"></label>
        <label style="font-size:12px;margin-left:12px">Show value: <input type="checkbox" id="cf-bar-show-val" checked></label>`;
    } else if (t === 'iconSet') {
      html = `<select id="cf-icon-set" style="width:100%;padding:4px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
        <option value="arrows">Arrows (↑ → ↓)</option>
        <option value="circles">Circles (🟢 🟡 🔴)</option>
        <option value="stars">Stars (★ ☆)</option>
        <option value="flags">Flags (🟩 🟨 🟥)</option>
        <option value="bars">Bars (▁ ▃ ▅ ▇)</option>
      </select>
      <label style="font-size:12px;margin-top:4px;display:block"><input type="checkbox" id="cf-icon-only"> Show icon only (hide value)</label>`;
    } else if (t === 'greaterThan' || t === 'lessThan' || t === 'equalTo') {
      html = `<input type="text" id="cf-value" placeholder="Value" style="width:100%;padding:6px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
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
    } else if (t === 'uniqueValues') {
      html = `<label style="font-size:12px;margin-top:4px;display:block">Highlight: <input type="color" id="cf-highlight" value="#e8f5e9"></label>`;
    } else if (t === 'aboveAvg' || t === 'belowAvg') {
      html = `<label style="font-size:12px;margin-top:4px;display:block">Highlight: <input type="color" id="cf-highlight" value="${t === 'aboveAvg' ? '#e3f2fd' : '#fff3e0'}"></label>`;
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
    } else if (t === 'colorScale2') {
      config.minColor = dlg.querySelector('#cf-min-color').value;
      config.maxColor = dlg.querySelector('#cf-max-color').value;
    } else if (t === 'dataBar') {
      config.barColor = dlg.querySelector('#cf-bar-color').value;
      config.showValue = dlg.querySelector('#cf-bar-show-val')?.checked !== false;
    } else if (t === 'iconSet') {
      config.iconSet = dlg.querySelector('#cf-icon-set').value;
      config.iconOnly = dlg.querySelector('#cf-icon-only')?.checked || false;
    } else if (t === 'greaterThan' || t === 'lessThan' || t === 'equalTo') {
      config.value = isNaN(parseFloat(dlg.querySelector('#cf-value').value)) ? dlg.querySelector('#cf-value').value : parseFloat(dlg.querySelector('#cf-value').value);
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'between') {
      config.min = parseFloat(dlg.querySelector('#cf-val-min').value) || 0;
      config.max = parseFloat(dlg.querySelector('#cf-val-max').value) || 0;
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'text') {
      config.text = dlg.querySelector('#cf-text').value;
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'duplicate' || t === 'uniqueValues' || t === 'aboveAvg' || t === 'belowAvg') {
      config.highlight = dlg.querySelector('#cf-highlight').value;
    } else if (t === 'top10') {
      config.n = parseInt(dlg.querySelector('#cf-top-n').value) || 10;
      config.highlight = dlg.querySelector('#cf-highlight').value;
    }
    S.condFormats.push({ range: { r1, c1, r2, c2 }, config });
    applyConditionalFormatting();
    dlg.remove();
  };
}

export function applyConditionalFormatting() {
  const sheet = getSheet();
  // Clear previous conditional styles
  S.gridEl.querySelectorAll('[data-cf-style]').forEach(el => {
    el.style.background = '';
    el.removeAttribute('data-cf-style');
    const bar = el.querySelector('.cf-data-bar');
    if (bar) bar.remove();
    const icon = el.querySelector('.cf-icon');
    if (icon) icon.remove();
  });

  for (const cf of S.condFormats) {
    const { r1, c1, r2, c2 } = cf.range;
    const cfg = cf.config;
    if (!cfg) continue; // Old-format S.condFormats (without .config) are handled by getCondFmtStyle in renderGrid

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
        const td = S.gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (!td) continue;
        const raw = getDisplayValue(sheet, r, c);
        const v = parseFloat(raw);

        if (cfg.type === 'colorScale' && !isNaN(v)) {
          const ratio = (v - minV) / rangeV;
          td.style.background = interpolateColor(cfg.minColor, cfg.midColor, cfg.maxColor, ratio);
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'colorScale2' && !isNaN(v)) {
          // 2-color gradient: linear interpolation between min and max
          const ratio = (v - minV) / rangeV;
          td.style.background = interpolate2Color(cfg.minColor, cfg.maxColor, ratio);
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'dataBar' && !isNaN(v)) {
          const pct = Math.max(0, ((v - minV) / rangeV) * 100);
          td.style.position = 'relative';
          const bar = document.createElement('div');
          bar.className = 'cf-data-bar';
          bar.style.cssText = `position:absolute;left:0;bottom:0;height:4px;width:${pct}%;background:${cfg.barColor};opacity:0.7;pointer-events:none;border-radius:0 2px 2px 0;transition:width 0.3s ease`;
          td.appendChild(bar);
          td.setAttribute('data-cf-style', '1');
          if (cfg.showValue === false) {
            td.style.color = 'transparent';
          }
        } else if (cfg.type === 'iconSet' && !isNaN(v)) {
          const ratio = (v - minV) / rangeV;
          const icons = { arrows: ['↓','→','↑'], circles: ['🔴','🟡','🟢'], stars: ['☆','★','★'], flags: ['🟥','🟨','🟩'], bars: ['▁','▃','▅','▇'] };
          const set = icons[cfg.iconSet] || icons.arrows;
          const icon = document.createElement('span');
          icon.className = 'cf-icon';
          icon.style.cssText = 'margin-right:4px;font-size:10px';
          if (set.length === 4) {
            icon.textContent = ratio < 0.25 ? set[0] : ratio < 0.5 ? set[1] : ratio < 0.75 ? set[2] : set[3];
          } else {
            icon.textContent = ratio < 0.33 ? set[0] : ratio < 0.67 ? set[1] : set[2];
          }
          td.insertBefore(icon, td.firstChild);
          td.setAttribute('data-cf-style', '1');
          if (cfg.iconOnly) {
            // Hide the text, show only icon
            Array.from(td.childNodes).forEach(n => {
              if (n !== icon && n.nodeType === 3) n.textContent = '';
            });
          }
        } else if (cfg.type === 'greaterThan' && !isNaN(v) && v > cfg.value) {
          td.style.background = cfg.highlight;
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'lessThan' && !isNaN(v) && v < cfg.value) {
          td.style.background = cfg.highlight;
          td.setAttribute('data-cf-style', '1');
        } else if (cfg.type === 'equalTo') {
          const matches = !isNaN(v) && !isNaN(parseFloat(cfg.value))
            ? v === parseFloat(cfg.value)
            : raw.toString() === String(cfg.value);
          if (matches) {
            td.style.background = cfg.highlight;
            td.setAttribute('data-cf-style', '1');
          }
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
        } else if (cfg.type === 'uniqueValues') {
          let count = 0;
          for (let rr = r1; rr <= r2; rr++) {
            for (let cc = c1; cc <= c2; cc++) {
              if (getDisplayValue(sheet, rr, cc) === raw) count++;
            }
          }
          if (count === 1 && raw !== '') {
            td.style.background = cfg.highlight;
            td.setAttribute('data-cf-style', '1');
          }
        } else if (cfg.type === 'aboveAvg' && !isNaN(v)) {
          const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          if (v > avg) {
            td.style.background = cfg.highlight;
            td.setAttribute('data-cf-style', '1');
          }
        } else if (cfg.type === 'belowAvg' && !isNaN(v)) {
          const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          if (v < avg) {
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

export function interpolateColor(c1, c2, c3, ratio) {
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

export function interpolate2Color(c1, c2, ratio) {
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = hex(c1);
  const [r2, g2, b2] = hex(c2);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `rgb(${r},${g},${b})`;
}

/* ==================== Goal Seek ==================== */

export function showGoalSeekDialog() {
  const sheet = getSheet();
  const currentRef = `${colToLetter(S.selectedCol)}${S.selectedRow + 1}`;

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
      resultEl.textContent = t('ui.fillAllFields');
      return;
    }

    const setRC = refToRC(setRef);
    const changeRC = refToRC(changeRef);
    if (!setRC || !changeRC) {
      resultEl.style.display = 'block';
      resultEl.style.background = '#ffebee';
      resultEl.textContent = t('ui.invalidCellRef');
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

/* ==================== Subtotals ==================== */

export function showSubtotalsDialog() {
  const sheet = getSheet();
  const headers = [];
  for (let c = 0; c < sheet.cols; c++) {
    const v = getDisplayValue(sheet, 0, c);
    if (v) headers.push({ c, label: v });
  }
  if (headers.length < 2) { alert('Need at least 2 columns with headers in row 1.'); return; }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:380px">
    <h3 style="margin:0 0 12px">Subtotals</h3>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">Group by column:</label>
      <select id="st-group" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);margin-top:2px">
        ${headers.map(h => `<option value="${h.c}">${h.label}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">Subtotal column:</label>
      <select id="st-value" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);margin-top:2px">
        ${headers.map((h, i) => `<option value="${h.c}"${i === headers.length - 1 ? ' selected' : ''}>${h.label}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:600">Function:</label>
      <select id="st-fn" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);margin-top:2px">
        <option value="sum">SUM</option><option value="count">COUNT</option><option value="average">AVERAGE</option><option value="min">MIN</option><option value="max">MAX</option>
      </select>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button class="toolbar-btn" id="st-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="st-apply" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Apply</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  dlg.querySelector('#st-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#st-apply').onclick = () => {
    const groupCol = parseInt(dlg.querySelector('#st-group').value);
    const valueCol = parseInt(dlg.querySelector('#st-value').value);
    const fn = dlg.querySelector('#st-fn').value;
    saveUndoState();

    // Sort by group column first
    multiLevelSort([{ col: groupCol, asc: true }], true);

    // Insert subtotal rows
    let lastGroup = null;
    let groupVals = [];
    const insertions = []; // [{afterRow, groupName, result}]

    for (let r = 1; r < sheet.rows; r++) {
      const groupVal = getDisplayValue(sheet, r, groupCol);
      if (!groupVal && !lastGroup) continue;
      if (lastGroup !== null && groupVal !== lastGroup) {
        // Insert subtotal for previous group
        const result = calcAggregate(groupVals, fn);
        insertions.push({ afterRow: r, groupName: lastGroup, result });
        groupVals = [];
      }
      lastGroup = groupVal;
      const v = parseFloat(getDisplayValue(sheet, r, valueCol));
      if (!isNaN(v)) groupVals.push(v);
    }
    // Last group
    if (lastGroup !== null && groupVals.length > 0) {
      insertions.push({ afterRow: sheet.rows, groupName: lastGroup, result: calcAggregate(groupVals, fn) });
    }

    // Insert rows from bottom up
    for (let i = insertions.length - 1; i >= 0; i--) {
      const ins = insertions[i];
      addRows(sheet, ins.afterRow, 1);
      setCell(sheet, ins.afterRow, groupCol, `${ins.groupName} ${fn.toUpperCase()}`);
      setCell(sheet, ins.afterRow, valueCol, String(ins.result));
      setCellFormat(sheet, ins.afterRow, groupCol, 'bold', true);
      setCellFormat(sheet, ins.afterRow, valueCol, 'bold', true);
      setCellFormat(sheet, ins.afterRow, groupCol, 'bg', '#f0f0f0');
      setCellFormat(sheet, ins.afterRow, valueCol, 'bg', '#f0f0f0');
    }

    recalcAll(sheet);
    renderGrid();
    updateSelection();
    dlg.remove();
  };
}

export function calcAggregate(vals, fn) {
  if (vals.length === 0) return 0;
  if (fn === 'sum') return vals.reduce((a, b) => a + b, 0);
  if (fn === 'count') return vals.length;
  if (fn === 'average') return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  if (fn === 'min') return Math.min(...vals);
  if (fn === 'max') return Math.max(...vals);
  return 0;
}

/* ==================== Transpose ==================== */

export function transposeSelection() {
  const sheet = getSheet();
  const { r1, c1, r2, c2 } = getSelectionRange();
  saveUndoState();

  // Read data
  const data = [];
  for (let r = r1; r <= r2; r++) {
    const row = [];
    for (let c = c1; c <= c2; c++) {
      row.push({ raw: getRawValue(sheet, r, c), format: { ...getCell(sheet, r, c)?.format } });
    }
    data.push(row);
  }

  // Clear original range
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      setCell(sheet, r, c, '');
    }
  }

  // Write transposed
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const tr = r1 + c;
      const tc = c1 + r;
      if (tr < sheet.rows && tc < sheet.cols) {
        setCell(sheet, tr, tc, data[r][c].raw);
      }
    }
  }

  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

/* ==================== Multi-Level Sort ==================== */

export function showMultiSortDialog() {
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
  let sortLevels = [{ col: S.selectedCol, asc: true }];

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

export function multiLevelSort(levels, hasHeader) {
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

  // Write sorted data back — clear existing then write new
  for (let r = 0; r < rowData.length; r++) {
    const tr = startRow + r;
    for (let c = 0; c < sheet.cols; c++) {
      const key = `${tr},${c}`;
      const cellData = rowData[r][c];
      if (cellData && (cellData.raw || cellData.value || (cellData.format && Object.keys(cellData.format).length > 0))) {
        sheet.cells[key] = cellData;
      } else {
        delete sheet.cells[key];
      }
    }
  }

  recalcAll(sheet);
  renderGrid();
  updateSelection();
}

/* ==================== Named Ranges ==================== */



export function syncNamedRangesToSheet() {
  // Sync named ranges to the sheet data model for formula resolution
  const sheet = getSheet();
  if (!sheet.namedRanges) sheet.namedRanges = {};
  for (const [name, r] of Object.entries(S.namedRanges)) {
    if (r.sheetIdx === S.activeSheetIdx || r.sheetIdx === undefined) {
      sheet.namedRanges[name] = `${colToLetter(r.c1)}${r.r1 + 1}:${colToLetter(r.c2)}${r.r2 + 1}`;
    }
  }
}

export function showNamedRangeDialog() {
  const { r1, c1, r2, c2 } = getSelectionRange();
  const rangeStr = `${colToLetter(c1)}${r1 + 1}:${colToLetter(c2)}${r2 + 1}`;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:480px">
    <h3 style="margin:0 0 12px">Name Manager</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input type="text" id="nr-name" placeholder="Range name..." style="flex:1;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
      <input type="text" id="nr-range" value="${rangeStr}" style="width:120px;padding:6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
      <button id="nr-add" style="padding:6px 12px;background:var(--accent-color);color:white;border:none;border-radius:4px;cursor:pointer">Add</button>
    </div>
    <p style="font-size:11px;color:var(--text-secondary);margin:0 0 8px">Use named ranges in formulas: =SUM(Revenue), =AVERAGE(Costs)</p>
    <div id="nr-list" style="max-height:250px;overflow:auto;border:1px solid var(--border-color);border-radius:4px"></div>
    <div style="text-align:right;margin-top:12px">
      <button class="toolbar-btn" id="nr-close" style="padding:6px 16px">Close</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  function renderList() {
    const list = dlg.querySelector('#nr-list');
    const entries = Object.entries(S.namedRanges);
    if (entries.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);text-align:center;padding:16px">No named ranges defined. Select cells and add a name.</div>';
      return;
    }
    list.innerHTML = entries.map(([name, r]) => `
      <div class="nr-list-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border-color);font-size:12px">
        <div style="flex:1">
          <strong style="color:var(--text-primary)">${name}</strong>
          <span style="color:var(--text-secondary);margin-left:8px">${colToLetter(r.c1)}${r.r1 + 1}:${colToLetter(r.c2)}${r.r2 + 1}</span>
          <span style="color:var(--text-tertiary);margin-left:4px;font-size:10px">(Sheet ${(r.sheetIdx || 0) + 1})</span>
        </div>
        <div style="display:flex;gap:4px">
          <button data-edit="${name}" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--accent-color);padding:2px 6px" title="Edit range">Edit</button>
          <button data-goto="${name}" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--accent-color);padding:2px 6px" title="Go to range">Go</button>
          <button data-del="${name}" style="border:none;background:none;cursor:pointer;font-size:11px;color:#ef4444;padding:2px 6px" title="Delete">Del</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-goto]').forEach(btn => {
      btn.onclick = () => {
        const r = S.namedRanges[btn.dataset.goto];
        if (r.sheetIdx !== undefined && r.sheetIdx !== S.activeSheetIdx) {
          S.activeSheetIdx = r.sheetIdx;
          renderSheetTabs();
        }
        S.selectedRow = r.r1; S.selectedCol = r.c1;
        S.selAnchorRow = r.r2; S.selAnchorCol = r.c2;
        renderGrid();
        updateSelection();
        dlg.remove();
      };
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => {
        const name = btn.dataset.del;
        delete S.namedRanges[name];
        // Also remove from sheet data
        const sheet = getSheet();
        if (sheet.namedRanges) delete sheet.namedRanges[name];
        renderList();
      };
    });
    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => {
        const name = btn.dataset.edit;
        const r = S.namedRanges[name];
        const newRange = prompt(`Edit range for "${name}":`, `${colToLetter(r.c1)}${r.r1 + 1}:${colToLetter(r.c2)}${r.r2 + 1}`);
        if (!newRange) return;
        // Parse the new range
        const parts = newRange.toUpperCase().split(':');
        if (parts.length !== 2) { alert('Invalid range format. Use A1:B3'); return; }
        const s = refToRC(parts[0].trim());
        const e = refToRC(parts[1].trim());
        if (!s || !e) { alert('Invalid cell reference'); return; }
        S.namedRanges[name] = { r1: Math.min(s[0],e[0]), c1: Math.min(s[1],e[1]), r2: Math.max(s[0],e[0]), c2: Math.max(s[1],e[1]), sheetIdx: S.activeSheetIdx };
        syncNamedRangesToSheet();
        renderList();
      };
    });
  }
  renderList();

  dlg.querySelector('#nr-add').onclick = () => {
    const name = dlg.querySelector('#nr-name').value.trim();
    const rangeInput = dlg.querySelector('#nr-range').value.trim().toUpperCase();
    if (!name) { alert('Please enter a range name'); return; }
    if (!/^[A-Za-z_]\w*$/.test(name)) { alert('Name must start with a letter or underscore, and contain only letters, digits, underscores'); return; }
    // Parse the range
    const parts = rangeInput.split(':');
    let nr1 = r1, nc1 = c1, nr2 = r2, nc2 = c2;
    if (parts.length === 2) {
      const s = refToRC(parts[0].trim());
      const e = refToRC(parts[1].trim());
      if (s && e) { nr1 = Math.min(s[0],e[0]); nc1 = Math.min(s[1],e[1]); nr2 = Math.max(s[0],e[0]); nc2 = Math.max(s[1],e[1]); }
    }
    S.namedRanges[name] = { r1: nr1, c1: nc1, r2: nr2, c2: nc2, sheetIdx: S.activeSheetIdx };
    syncNamedRangesToSheet();
    dlg.querySelector('#nr-name').value = '';
    renderList();
  };
  dlg.querySelector('#nr-close').onclick = () => dlg.remove();
}

/* ==================== Pivot Table ==================== */

export function showPivotTableDialog() {
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

    // Store pivot source metadata for refresh
    pivotSheet.pivotSource = {
      sheetIdx: S.activeSheetIdx,
      r1, c1, r2, c2,
      rowIdx: parseInt(dlg.querySelector('#pivot-row').value),
      colIdx: parseInt(dlg.querySelector('#pivot-col').value),
      valIdx: parseInt(dlg.querySelector('#pivot-val').value),
      aggFn: dlg.querySelector('#pivot-agg').value,
    };

    S.sheets.push(pivotSheet);
    S.activeSheetIdx = S.sheets.length - 1;
    renderSheetTabs();
    renderGrid();
    updateSelection();
    dlg.remove();
  };

  // Auto-preview on load
  renderPreview();
}

/** Refresh pivot table from source data */
export function refreshPivotTable() {
  const sheet = getSheet();
  if (!sheet.pivotSource) {
    alert('This sheet is not a pivot table, or has no linked source data.');
    return;
  }
  const src = sheet.pivotSource;
  const srcSheet = S.sheets[src.sheetIdx];
  if (!srcSheet) { alert('Source sheet not found.'); return; }

  // Get headers from first row
  const headers = [];
  for (let c = src.c1; c <= src.c2; c++) {
    headers.push(getDisplayValue(srcSheet, src.r1, c) || colToLetter(c));
  }

  // Collect data (skip header row)
  const data = [];
  for (let r = src.r1 + 1; r <= src.r2; r++) {
    const rowVal = getDisplayValue(srcSheet, r, src.c1 + src.rowIdx);
    const colVal = src.colIdx >= 0 ? getDisplayValue(srcSheet, r, src.c1 + src.colIdx) : '__total__';
    const numVal = parseFloat(getDisplayValue(srcSheet, r, src.c1 + src.valIdx)) || 0;
    data.push({ row: rowVal, col: colVal, val: numVal });
  }

  const rowVals = [...new Set(data.map(d => d.row))].sort();
  const colVals = [...new Set(data.map(d => d.col))].sort();

  const agg = {};
  rowVals.forEach(rv => { agg[rv] = {}; colVals.forEach(cv => { agg[rv][cv] = []; }); });
  data.forEach(d => { agg[d.row][d.col].push(d.val); });

  const result = {};
  rowVals.forEach(rv => {
    result[rv] = {};
    colVals.forEach(cv => {
      const vals = agg[rv][cv];
      if (vals.length === 0) { result[rv][cv] = ''; return; }
      if (src.aggFn === 'sum') result[rv][cv] = vals.reduce((a, b) => a + b, 0);
      else if (src.aggFn === 'count') result[rv][cv] = vals.length;
      else if (src.aggFn === 'average') result[rv][cv] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
      else if (src.aggFn === 'min') result[rv][cv] = Math.min(...vals);
      else if (src.aggFn === 'max') result[rv][cv] = Math.max(...vals);
    });
  });

  // Clear and rebuild pivot sheet
  sheet.cells = {};
  setCell(sheet, 0, 0, headers[src.rowIdx]);
  if (colVals[0] === '__total__') {
    setCell(sheet, 0, 1, `${src.aggFn.toUpperCase()} of ${headers[src.valIdx]}`);
  } else {
    colVals.forEach((cv, ci) => setCell(sheet, 0, ci + 1, cv));
  }
  rowVals.forEach((rv, ri) => {
    setCell(sheet, ri + 1, 0, rv);
    colVals.forEach((cv, ci) => setCell(sheet, ri + 1, ci + 1, String(result[rv][cv])));
  });
  const gtRow = rowVals.length + 1;
  setCell(sheet, gtRow, 0, 'Grand Total');
  colVals.forEach((cv, ci) => {
    const total = rowVals.reduce((s, rv) => s + (parseFloat(result[rv][cv]) || 0), 0);
    setCell(sheet, gtRow, ci + 1, String(src.aggFn === 'average' ? (total / rowVals.length).toFixed(2) : total));
  });
  // Formatting
  for (let c = 0; c <= colVals.length; c++) {
    setCellFormat(sheet, 0, c, 'bold', true);
    setCellFormat(sheet, 0, c, 'bg', '#e8f0fe');
    setCellFormat(sheet, gtRow, c, 'bold', true);
    setCellFormat(sheet, gtRow, c, 'bg', '#f3f3f3');
  }

  // Store collapsed state for row groups
  if (!sheet.pivotCollapsed) sheet.pivotCollapsed = {};

  renderGrid();
  updateSelection();
}

/** Toggle pivot row group collapse/expand */
export function togglePivotRowCollapse(rowVal) {
  const sheet = getSheet();
  if (!sheet.pivotCollapsed) sheet.pivotCollapsed = {};
  sheet.pivotCollapsed[rowVal] = !sheet.pivotCollapsed[rowVal];
  renderGrid();
  updateSelection();
}

/* ==================== Data Grouping ==================== */

export function toggleGroupRows() {
  const { r1, r2 } = getSelectionRange();
  // Check if selection is already in a group
  const existingIdx = S.rowGroups.findIndex(g => g.r1 === r1 && g.r2 === r2);
  if (existingIdx >= 0) {
    // Ungroup
    S.rowGroups.splice(existingIdx, 1);
  } else if (r1 !== r2) {
    S.rowGroups.push({ r1, r2, collapsed: false });
  }
  renderGrid();
  updateSelection();
}

export function toggleGroupCollapse(groupIdx) {
  const group = S.rowGroups[groupIdx];
  if (!group) return;
  group.collapsed = !group.collapsed;
  renderGrid();
  updateSelection();
}

/* ==================== Flash Fill ==================== */

export function flashFill() {
  const sheet = getSheet();
  const c = S.selectedCol;
  const r = S.selectedRow;

  // Find example pairs: cells in the current column that have values,
  // and corresponding cells in adjacent columns
  // Strategy: look for a pattern between source column (left) and target column (current)
  const srcCol = c - 1;
  if (srcCol < 0) { alert('Flash Fill needs source data in the column to the left.'); return; }

  // Collect example pairs (source → result)
  const examples = [];
  for (let row = 0; row < sheet.rows; row++) {
    const src = getDisplayValue(sheet, row, srcCol);
    const result = getDisplayValue(sheet, row, c);
    if (src && result) {
      examples.push({ src, result, row });
    }
  }

  if (examples.length === 0) {
    alert('Enter at least one example in this column to use Flash Fill.');
    return;
  }

  // Try to detect pattern from examples
  const pattern = detectFlashFillPattern(examples);
  if (!pattern) {
    alert('Could not detect a pattern. Try adding more examples.');
    return;
  }

  // Apply pattern to empty cells
  let filled = 0;
  for (let row = 0; row < sheet.rows; row++) {
    const existing = getDisplayValue(sheet, row, c);
    if (existing) continue; // skip cells with values
    const src = getDisplayValue(sheet, row, srcCol);
    if (!src) continue;
    const result = pattern(src);
    if (result !== null) {
      setCell(sheet, row, c, result);
      filled++;
    }
  }

  if (filled > 0) {
    recalcAll(sheet);
    renderGrid();
    updateSelection();
    alert(`Flash Fill: ${filled} cells filled.`);
  } else {
    alert('No empty cells to fill.');
  }
}

export function detectFlashFillPattern(examples) {
  // Try several heuristic patterns:

  // 1. Substring extraction: if all results are substrings of source
  const allSubstring = examples.every(e => e.src.includes(e.result));
  if (allSubstring && examples.length >= 1) {
    const e = examples[0];
    const start = e.src.indexOf(e.result);
    const len = e.result.length;
    // Check if consistent position
    const consistent = examples.every(ex => ex.src.substring(start, start + len) === ex.result);
    if (consistent) {
      return (src) => src.length >= start + len ? src.substring(start, start + len) : null;
    }
  }

  // 2. Split pattern (e.g., "first last" → "first" or "last")
  const firstExample = examples[0];
  const srcParts = firstExample.src.split(/[\s,;.\-_@]+/);
  for (let i = 0; i < srcParts.length; i++) {
    if (srcParts[i] === firstExample.result) {
      const consistent = examples.every(ex => {
        const parts = ex.src.split(/[\s,;.\-_@]+/);
        return parts[i] === ex.result;
      });
      if (consistent) {
        return (src) => { const parts = src.split(/[\s,;.\-_@]+/); return parts[i] || null; };
      }
    }
  }

  // 3. Prefix/suffix pattern
  if (examples.every(e => e.result.startsWith(e.src))) {
    const suffix = firstExample.result.substring(firstExample.src.length);
    if (examples.every(e => e.result === e.src + suffix)) {
      return (src) => src + suffix;
    }
  }
  if (examples.every(e => e.result.endsWith(e.src))) {
    const prefix = firstExample.result.substring(0, firstExample.result.length - firstExample.src.length);
    if (examples.every(e => e.result === prefix + e.src)) {
      return (src) => prefix + src;
    }
  }

  // 4. Case transformation
  if (examples.every(e => e.result === e.src.toUpperCase())) {
    return (src) => src.toUpperCase();
  }
  if (examples.every(e => e.result === e.src.toLowerCase())) {
    return (src) => src.toLowerCase();
  }
  if (examples.every(e => e.result === e.src.charAt(0).toUpperCase() + e.src.slice(1).toLowerCase())) {
    return (src) => src.charAt(0).toUpperCase() + src.slice(1).toLowerCase();
  }

  // 5. Initial extraction (e.g., "John Smith" → "J.S.")
  if (examples.every(e => {
    const initials = e.src.split(/\s+/).map(w => w[0]?.toUpperCase()).join('.');
    return e.result === initials || e.result === initials + '.';
  })) {
    const withDot = firstExample.result.endsWith('.');
    return (src) => {
      const initials = src.split(/\s+/).map(w => w[0]?.toUpperCase()).join('.');
      return withDot ? initials + '.' : initials;
    };
  }

  return null;
}

/* ==================== Cell Hyperlinks ==================== */



export function insertCellHyperlink(r, c) {
  const key = `${r},${c}`;
  const existing = S.cellHyperlinks[key];
  const url = prompt('Enter URL:', existing?.url || 'https://');
  if (!url) return;
  const label = prompt('Display text:', existing?.label || getDisplayValue(getSheet(), r, c) || url);
  S.cellHyperlinks[key] = { url, label: label || url };
  if (!getCell(getSheet(), r, c)?.raw) {
    setCell(getSheet(), r, c, label || url);
  }
  setCellFormat(getSheet(), r, c, 'hyperlink', url);
  renderGrid();
  updateSelection();
}

export function toggleCellLock() {
  const { r1, r2, c1, c2 } = getSelectionRange();
  const sheet = getSheet();
  const first = getCell(sheet, r1, c1);
  const isLocked = first?.format?.locked !== false;
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      setCellFormat(sheet, r, c, 'locked', !isLocked);
    }
  }
  alert(isLocked ? 'Selected cells are now unlocked (editable when sheet is protected).' : 'Selected cells are now locked.');
}

/* ==================== Sheet Protection ==================== */




export function toggleSheetProtection() {
  if (S.sheetProtected) {
    const pw = prompt('Enter password to unprotect sheet:');
    if (pw === S.protectedPassword) {
      S.sheetProtected = false;
      S.protectedPassword = '';
      const btn = document.getElementById('sheet-protect');
      if (btn) btn.textContent = '\uD83D\uDD12 ' + t('ui.protect');
      alert('Sheet is now unprotected.');
    } else {
      alert('Incorrect password.');
    }
    return;
  }

  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:10px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:10000;width:340px;font-size:14px;color:#333;';
  dlg.innerHTML = `
    <h3 style="margin:0 0 16px">Protect Sheet</h3>
    <p style="font-size:12px;color:#666;margin:0 0 12px">Protected cells cannot be edited. Use "Lock Cells" to toggle which cells are locked.</p>
    <div style="margin-bottom:12px">
      <label style="font-weight:600;font-size:12px">Password (optional):</label>
      <input type="password" id="prot-pw" style="width:100%;padding:8px;margin-top:4px;border:1px solid #ccc;border-radius:4px">
    </div>
    <div style="margin-bottom:16px">
      <label style="font-size:12px"><input type="checkbox" id="prot-lock-all" checked> Lock all cells</label><br>
      <label style="font-size:12px"><input type="checkbox" id="prot-allow-select" checked> Allow selecting cells</label>
    </div>
    <div style="text-align:right">
      <button id="prot-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;border-radius:4px;cursor:pointer">Cancel</button>
      <button id="prot-ok" style="padding:6px 16px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer">Protect</button>
    </div>
  `;
  document.body.appendChild(dlg);

  dlg.querySelector('#prot-cancel').addEventListener('click', () => dlg.remove());
  dlg.querySelector('#prot-ok').addEventListener('click', () => {
    S.protectedPassword = dlg.querySelector('#prot-pw').value;
    const lockAll = dlg.querySelector('#prot-lock-all').checked;
    S.sheetProtected = true;

    if (lockAll) {
      // Mark all cells as locked
      const sheet = getSheet();
      for (let r = 0; r < sheet.rows; r++) {
        for (let c = 0; c < sheet.cols; c++) {
          const cell = getCell(sheet, r, c);
          if (cell) {
            if (!cell.format) cell.format = {};
            cell.format.locked = true;
          }
        }
      }
    }

    const btn = document.getElementById('sheet-protect');
    if (btn) btn.textContent = '\uD83D\uDD13 ' + t('ui.unprotect');
    dlg.remove();
    alert('Sheet is now protected.');
  });
}

export function isCellEditable(r, c) {
  if (!S.sheetProtected) return true;
  const cell = getCell(getSheet(), r, c);
  return cell?.format?.locked === false;
}

/* ==================== Border Menu ==================== */

export function showBorderMenu() {
  const existing = document.querySelector('.sheet-border-menu');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('sheet-borders');
  const rect = btn.getBoundingClientRect();

  const borderStyle = '1px solid #000';
  const options = [
    { label: '━ All Borders', action: 'all' },
    { label: '▣ Outer Borders', action: 'outer' },
    { label: '┃ Left Border', action: 'left' },
    { label: '┃ Right Border', action: 'right' },
    { label: '━ Top Border', action: 'top' },
    { label: '━ Bottom Border', action: 'bottom' },
    { label: '╋ Inner Borders', action: 'inner' },
    { label: '━ Thick Outer', action: 'thick-outer' },
    { label: '✕ No Borders', action: 'none' },
  ];

  const menu = document.createElement('div');
  menu.className = 'sheet-border-menu';
  menu.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom+2}px;background:#fff;border:1px solid #ccc;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:4px 0;z-index:9999;min-width:170px;font-size:13px;`;

  options.forEach(opt => {
    const item = document.createElement('div');
    item.textContent = opt.label;
    item.style.cssText = 'padding:6px 14px;cursor:pointer;';
    item.addEventListener('mouseenter', () => item.style.background = '#e8f0fe');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => {
      applyBorderStyle(opt.action);
      menu.remove();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    const handler = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', handler); } };
    document.addEventListener('mousedown', handler);
  }, 0);
}

export function applyBorderStyle(action) {
  const { r1, r2, c1, c2 } = getSelectionRange();
  const sheet = getSheet();
  const thin = '1px solid #000';
  const thick = '2px solid #000';

  // Clear all borders first for 'none'
  if (action === 'none') {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellFormat(sheet, r, c, 'borderTop', '');
        setCellFormat(sheet, r, c, 'borderBottom', '');
        setCellFormat(sheet, r, c, 'borderLeft', '');
        setCellFormat(sheet, r, c, 'borderRight', '');
      }
    }
    renderGrid(); updateSelection(); return;
  }

  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const isTop = r === r1, isBottom = r === r2;
      const isLeft = c === c1, isRight = c === c2;

      switch (action) {
        case 'all':
          setCellFormat(sheet, r, c, 'borderTop', thin);
          setCellFormat(sheet, r, c, 'borderBottom', thin);
          setCellFormat(sheet, r, c, 'borderLeft', thin);
          setCellFormat(sheet, r, c, 'borderRight', thin);
          break;
        case 'outer':
          if (isTop) setCellFormat(sheet, r, c, 'borderTop', thin);
          if (isBottom) setCellFormat(sheet, r, c, 'borderBottom', thin);
          if (isLeft) setCellFormat(sheet, r, c, 'borderLeft', thin);
          if (isRight) setCellFormat(sheet, r, c, 'borderRight', thin);
          break;
        case 'thick-outer':
          if (isTop) setCellFormat(sheet, r, c, 'borderTop', thick);
          if (isBottom) setCellFormat(sheet, r, c, 'borderBottom', thick);
          if (isLeft) setCellFormat(sheet, r, c, 'borderLeft', thick);
          if (isRight) setCellFormat(sheet, r, c, 'borderRight', thick);
          break;
        case 'inner':
          if (!isTop) setCellFormat(sheet, r, c, 'borderTop', thin);
          if (!isBottom) setCellFormat(sheet, r, c, 'borderBottom', thin);
          if (!isLeft) setCellFormat(sheet, r, c, 'borderLeft', thin);
          if (!isRight) setCellFormat(sheet, r, c, 'borderRight', thin);
          break;
        case 'left':
          if (isLeft) setCellFormat(sheet, r, c, 'borderLeft', thin);
          break;
        case 'right':
          if (isRight) setCellFormat(sheet, r, c, 'borderRight', thin);
          break;
        case 'top':
          if (isTop) setCellFormat(sheet, r, c, 'borderTop', thin);
          break;
        case 'bottom':
          if (isBottom) setCellFormat(sheet, r, c, 'borderBottom', thin);
          break;
      }
    }
  }
  renderGrid(); updateSelection();
}

/* ==================== Conditional Format Rules Manager ==================== */

export function showCondFormatRulesManager() {
  const existing = document.querySelector('.cf-rules-manager');
  if (existing) { existing.remove(); return; }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay cf-rules-manager';

  function renderRules() {
    const rulesHtml = S.condFormats.length === 0
      ? '<p style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px 0">No conditional formatting rules yet.</p>'
      : S.condFormats.map((cf, i) => {
        const range = `${rcToRef(cf.range.r1, cf.range.c1)}:${rcToRef(cf.range.r2, cf.range.c2)}`;
        const type = cf.config ? cf.config.type : cf.type;
        const color = cf.config ? (cf.config.highlight || cf.config.minColor || cf.config.barColor || '#ddd') : (cf.bgColor || '#ddd');
        return `<div style="display:flex;align-items:center;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;margin-bottom:6px;background:var(--bg-primary)">
          <div style="width:20px;height:20px;border-radius:4px;background:${color};margin-right:10px;flex-shrink:0;border:1px solid var(--border-color)"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">${type}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Range: ${range}</div>
          </div>
          <button class="toolbar-btn cf-rule-del" data-idx="${i}" style="color:#e53e3e;font-size:16px;padding:2px 6px" title="Delete rule">&times;</button>
        </div>`;
      }).join('');

    return `<div class="modal-content" style="width:420px;max-height:80vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">Conditional Formatting Rules</h3>
        <button class="toolbar-btn cf-mgr-close" style="font-size:18px">&times;</button>
      </div>
      <div id="cf-rules-list">${rulesHtml}</div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="toolbar-btn" id="cf-mgr-clear-all" style="padding:6px 14px;color:#e53e3e">Clear All</button>
        <button class="toolbar-btn" id="cf-mgr-add" style="padding:6px 14px;background:var(--accent-color);color:white;border-radius:4px">+ Add Rule</button>
      </div>
    </div>`;
  }

  dlg.innerHTML = renderRules();
  document.body.appendChild(dlg);

  function rebind() {
    dlg.innerHTML = renderRules();
    dlg.querySelectorAll('.cf-rule-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        S.condFormats.splice(idx, 1);
        renderGrid(); updateSelection();
        rebind();
      });
    });
    dlg.querySelector('.cf-mgr-close')?.addEventListener('click', () => dlg.remove());
    dlg.querySelector('#cf-mgr-clear-all')?.addEventListener('click', () => {
      S.condFormats.length = 0;
      renderGrid(); updateSelection();
      rebind();
    });
    dlg.querySelector('#cf-mgr-add')?.addEventListener('click', () => {
      dlg.remove();
      showConditionalFormatDialog();
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
  }
  rebind();
}

/* ==================== Sheet Find & Replace ==================== */



export function toggleSheetFindReplace() {
  const bar = document.getElementById('sheet-find-bar');
  if (!bar) return;
  S.sheetFindVisible = !S.sheetFindVisible;
  bar.classList.toggle('hidden', !S.sheetFindVisible);
  if (S.sheetFindVisible) {
    document.getElementById('sheet-find-input')?.focus();
  }
}

export function sheetFindAll(query, matchCase, useRegex) {
  if (!query) return [];
  const sheet = getSheet();
  const results = [];
  const flags = matchCase ? 'g' : 'gi';
  const re = useRegex ? new RegExp(query, flags) : null;

  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const val = getDisplayValue(sheet, r, c);
      if (!val) continue;
      let match = false;
      if (re) {
        match = re.test(val);
        re.lastIndex = 0;
      } else {
        match = matchCase ? val.includes(query) : val.toLowerCase().includes(query.toLowerCase());
      }
      if (match) results.push({ r, c });
    }
  }
  return results;
}

export function initSheetFindReplace() {
  const findInput = document.getElementById('sheet-find-input');
  const replaceInput = document.getElementById('sheet-replace-input');
  const countEl = document.getElementById('sheet-find-count');
  if (!findInput) return;

  let results = [];
  let currentIdx = -1;
  let matchCase = false;
  let useRegex = false;

  document.getElementById('sheet-find-case')?.addEventListener('click', (e) => {
    matchCase = !matchCase;
    e.target.style.opacity = matchCase ? '1' : '0.6';
    doSearch();
  });
  document.getElementById('sheet-find-regex')?.addEventListener('click', (e) => {
    useRegex = !useRegex;
    e.target.style.opacity = useRegex ? '1' : '0.6';
    doSearch();
  });

  function doSearch() {
    results = sheetFindAll(findInput.value, matchCase, useRegex);
    currentIdx = results.length > 0 ? 0 : -1;
    updateCount();
    if (results.length > 0) goTo(0);
  }

  function updateCount() {
    if (countEl) countEl.textContent = results.length > 0 ? `${currentIdx + 1}/${results.length}` : '0';
  }

  function goTo(idx) {
    if (idx < 0 || idx >= results.length) return;
    currentIdx = idx;
    const { r, c } = results[idx];
    S.selectedRow = r; S.selectedCol = c;
    S.selAnchorRow = r; S.selAnchorCol = c;
    updateSelection();
    updateCount();
    // Scroll into view
    const td = S.gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
    td?.scrollIntoView({ block: 'center', inline: 'center' });
  }

  findInput.addEventListener('input', doSearch);
  document.getElementById('sheet-find-next')?.addEventListener('click', () => {
    if (results.length > 0) goTo((currentIdx + 1) % results.length);
  });
  document.getElementById('sheet-find-prev')?.addEventListener('click', () => {
    if (results.length > 0) goTo((currentIdx - 1 + results.length) % results.length);
  });

  document.getElementById('sheet-replace-btn')?.addEventListener('click', () => {
    if (currentIdx < 0) return;
    const { r, c } = results[currentIdx];
    const sheet = getSheet();
    const raw = getRawValue(sheet, r, c);
    const query = findInput.value;
    const replacement = replaceInput?.value || '';
    const flags = matchCase ? 'g' : 'gi';
    const newVal = useRegex ? raw.replace(new RegExp(query, flags), replacement) : raw.split(matchCase ? query : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(replacement);
    setCell(sheet, r, c, newVal);
    recalcAll(sheet);
    renderGrid();
    doSearch();
  });

  document.getElementById('sheet-replace-all')?.addEventListener('click', () => {
    const sheet = getSheet();
    const query = findInput.value;
    const replacement = replaceInput?.value || '';
    if (!query) return;
    const flags = matchCase ? 'g' : 'gi';
    let count = 0;
    for (const { r, c } of results) {
      const raw = getRawValue(sheet, r, c);
      const newVal = useRegex ? raw.replace(new RegExp(query, flags), replacement) : raw.split(matchCase ? query : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(replacement);
      if (newVal !== raw) { setCell(sheet, r, c, newVal); count++; }
    }
    if (count > 0) { recalcAll(sheet); renderGrid(); }
    doSearch();
    alert(`Replaced ${count} occurrence(s).`);
  });

  document.getElementById('sheet-find-close')?.addEventListener('click', () => {
    toggleSheetFindReplace();
  });
}


/* ==================== Icon Set CF (simple S.condFormats) ==================== */

export function applyIconSets() {
  const sheet = getSheet();
  // Only handle old-format icon_set entries (those without .config — new-format ones are handled by applyConditionalFormatting)
  const iconCFs = S.condFormats.filter(cf => cf.type === 'icon_set' && !cf.config);
  if (iconCFs.length === 0) return;

  const iconSets = {
    traffic: ['🔴', '🟡', '🟢'],
    arrows: ['⬇️', '➡️', '⬆️'],
    stars: ['☆', '★', '★★'],
    flags: ['🚩', '🟨', '🟩'],
    rating: ['1️⃣', '2️⃣', '3️⃣'],
  };

  for (const cf of iconCFs) {
    const { r1, c1, r2, c2 } = cf.range;
    let min = Infinity, max = -Infinity;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const v = parseFloat(getDisplayValue(sheet, r, c));
        if (!isNaN(v)) { min = Math.min(min, v); max = Math.max(max, v); }
      }
    }
    const range = max - min || 1;
    const icons = iconSets[cf.iconSet] || iconSets.traffic;

    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const td = S.gridEl?.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (!td) continue;
        const v = parseFloat(getDisplayValue(sheet, r, c));
        if (isNaN(v)) continue;
        const pct = (v - min) / range;
        const iconIdx = pct < 0.33 ? 0 : pct < 0.67 ? 1 : 2;
        const iconSpan = document.createElement('span');
        iconSpan.className = 'cf-icon';
        iconSpan.style.cssText = 'margin-right:4px;font-size:11px';
        iconSpan.textContent = icons[iconIdx];
        td.insertBefore(iconSpan, td.firstChild);
      }
    }
  }
}

/* ==================== Banded Rows ==================== */





export function toggleBandedRows() {
  const existing = document.querySelector('.sheet-banded-dialog');
  if (existing) { existing.remove(); return; }

  const dlg = document.createElement('div');
  dlg.className = 'ai-setup-modal sheet-banded-dialog';
  dlg.innerHTML = `
    <div class="ai-setup-content" style="width:320px">
      <div class="ai-setup-header">
        <h3>Alternating Row Colors</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;font-size:13px;color:var(--text-primary)">
          <input type="checkbox" id="banded-enable" ${S.bandedRowsEnabled ? 'checked' : ''}>
          Enable alternating colors
        </label>
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <label style="flex:1;font-size:12px;color:var(--text-secondary)">
            Even rows
            <input type="color" id="banded-c1" value="${S.bandedColor1}" style="display:block;width:100%;height:28px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;cursor:pointer">
          </label>
          <label style="flex:1;font-size:12px;color:var(--text-secondary)">
            Odd rows
            <input type="color" id="banded-c2" value="${S.bandedColor2}" style="display:block;width:100%;height:28px;margin-top:4px;border:1px solid var(--border-color);border-radius:4px;cursor:pointer">
          </label>
        </div>
        <div style="margin-bottom:12px">
          <span style="font-size:11px;color:var(--text-tertiary)">Presets:</span>
          <div style="display:flex;gap:6px;margin-top:6px">
            ${[
              ['#fff','#f3f4f6','Gray'],
              ['#fff','#dbeafe','Blue'],
              ['#fff','#dcfce7','Green'],
              ['#fff','#fef3c7','Yellow'],
              ['#fff','#fce7f3','Pink'],
            ].map(([c1,c2,n]) => `
              <button class="banded-preset" data-c1="${c1}" data-c2="${c2}" style="width:32px;height:20px;border:1px solid var(--border-color);border-radius:4px;cursor:pointer;background:linear-gradient(to bottom, ${c1} 50%, ${c2} 50%)" title="${n}"></button>
            `).join('')}
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="banded-cancel">Cancel</button>
          <button class="ai-pull-btn" id="banded-apply" style="background:#0071e3;color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dlg);

  dlg.querySelector('.ai-setup-close')?.addEventListener('click', () => dlg.remove());
  dlg.querySelector('#banded-cancel')?.addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelectorAll('.banded-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      dlg.querySelector('#banded-c1').value = btn.dataset.c1;
      dlg.querySelector('#banded-c2').value = btn.dataset.c2;
      dlg.querySelector('#banded-enable').checked = true;
    });
  });

  dlg.querySelector('#banded-apply')?.addEventListener('click', () => {
    S.bandedRowsEnabled = dlg.querySelector('#banded-enable').checked;
    S.bandedColor1 = dlg.querySelector('#banded-c1').value;
    S.bandedColor2 = dlg.querySelector('#banded-c2').value;
    renderGrid();
    const btn = document.getElementById('sheet-banded-rows');
    if (btn) btn.classList.toggle('active', S.bandedRowsEnabled);
    dlg.remove();
  });
}

/* ==================== Formula Audit (Trace Precedents/Dependents) ==================== */



export function ensureTraceOverlay() {
  if (S.traceArrowsSvg && S.traceArrowsSvg.parentElement) return S.traceArrowsSvg;
  const grid = document.querySelector('.sheet-grid');
  if (!grid) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5';
  svg.innerHTML = `<defs>
    <marker id="trace-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#4285f4"/>
    </marker>
    <marker id="trace-arrow-dep" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ea4335"/>
    </marker>
  </defs>`;
  grid.style.position = 'relative';
  grid.appendChild(svg);
  S.traceArrowsSvg = svg;
  return svg;
}

export function getCellCenter(r, c) {
  const grid = document.querySelector('.sheet-grid');
  if (!grid) return null;
  const cell = grid.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
  if (!cell) return null;
  const gridRect = grid.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  return {
    x: cellRect.left + cellRect.width / 2 - gridRect.left + grid.scrollLeft,
    y: cellRect.top + cellRect.height / 2 - gridRect.top + grid.scrollTop
  };
}

export function drawTraceArrow(fromR, fromC, toR, toC, type) {
  const svg = ensureTraceOverlay();
  if (!svg) return;
  const from = getCellCenter(fromR, fromC);
  const to = getCellCenter(toR, toC);
  if (!from || !to) return;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', from.x);
  line.setAttribute('y1', from.y);
  line.setAttribute('x2', to.x);
  line.setAttribute('y2', to.y);
  line.setAttribute('stroke', type === 'precedent' ? '#4285f4' : '#ea4335');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('marker-end', `url(#trace-arrow${type === 'dependent' ? '-dep' : ''})`);
  line.classList.add('trace-arrow-line');
  svg.appendChild(line);

  // Add dot at source
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', from.x);
  dot.setAttribute('cy', from.y);
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', type === 'precedent' ? '#4285f4' : '#ea4335');
  dot.classList.add('trace-arrow-line');
  svg.appendChild(dot);
}

export function parseCellRefs(formula) {
  if (!formula || !formula.startsWith('=')) return [];
  const refs = [];
  const refPattern = /\$?([A-Z]+)\$?(\d+)/gi;
  const expr = formula.substring(1);
  let match;
  while ((match = refPattern.exec(expr)) !== null) {
    const col = letterToCol(match[1].toUpperCase());
    const row = parseInt(match[2]) - 1;
    refs.push({ r: row, c: col });
  }
  return refs;
}

export function tracePrecedents() {
  const sheet = S.sheets[S.activeSheetIdx];
  const key = `${S.selectedRow},${S.selectedCol}`;
  const cell = sheet.cells[key];
  if (!cell || !cell.raw || !cell.raw.startsWith('=')) {
    alert('Select a cell with a formula to trace precedents');
    return;
  }
  const refs = parseCellRefs(cell.raw);
  if (refs.length === 0) {
    alert('No cell references found in formula');
    return;
  }
  refs.forEach(ref => {
    drawTraceArrow(ref.r, ref.c, S.selectedRow, S.selectedCol, 'precedent');
  });
}

export function traceDependents() {
  const sheet = S.sheets[S.activeSheetIdx];
  const deps = [];
  // Scan all cells for formulas referencing the selected cell
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (!cell.raw || !cell.raw.startsWith('=')) continue;
    const refs = parseCellRefs(cell.raw);
    const [r, c] = key.split(',').map(Number);
    if (refs.some(ref => ref.r === S.selectedRow && ref.c === S.selectedCol)) {
      deps.push({ r, c });
    }
  }
  if (deps.length === 0) {
    alert('No dependent cells found');
    return;
  }
  deps.forEach(dep => {
    drawTraceArrow(S.selectedRow, S.selectedCol, dep.r, dep.c, 'dependent');
  });
}

export function clearTraceArrows() {
  if (S.traceArrowsSvg) {
    S.traceArrowsSvg.querySelectorAll('.trace-arrow-line').forEach(el => el.remove());
  }
}

/* ==================== Cell Comments with Threads ==================== */



export function showCommentPanel(r, c) {
  document.querySelector('.sheet-comment-panel')?.remove();
  const key = `${r},${c}`;
  if (!S.cellComments[key]) S.cellComments[key] = { threads: [] };
  const comment = S.cellComments[key];

  const panel = document.createElement('div');
  panel.className = 'sheet-comment-panel';
  const td = S.gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
  const rect = td ? td.getBoundingClientRect() : { right: 300, top: 100 };
  panel.style.cssText = `position:fixed;top:${Math.min(rect.top, window.innerHeight - 360)}px;left:${Math.min(rect.right + 4, window.innerWidth - 300)}px;width:280px;max-height:340px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.18);z-index:3000;display:flex;flex-direction:column;overflow:hidden`;

  function renderThreads() {
    const threadsHtml = comment.threads.length === 0
      ? '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px">No comments yet</div>'
      : comment.threads.map((t, i) => `
        <div class="comment-thread-item" style="padding:8px 12px;border-bottom:1px solid var(--border-color);${t.resolved ? 'opacity:0.5' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-weight:600;font-size:11px;color:var(--text-primary)">${escapeHtml(t.author)}</span>
            <span style="font-size:10px;color:var(--text-tertiary)">${new Date(t.timestamp).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
          </div>
          <div style="font-size:12px;color:var(--text-primary);line-height:1.4;white-space:pre-wrap">${escapeHtml(t.text)}</div>
          <div style="display:flex;gap:6px;margin-top:4px">
            <button class="comment-resolve-btn" data-idx="${i}" style="font-size:10px;color:var(--accent-color);background:none;border:none;cursor:pointer;padding:0">${t.resolved ? 'Reopen' : 'Resolve'}</button>
            <button class="comment-delete-btn" data-idx="${i}" style="font-size:10px;color:#ef4444;background:none;border:none;cursor:pointer;padding:0">Delete</button>
          </div>
        </div>
      `).join('');

    panel.innerHTML = `
      <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;background:var(--pane-header-bg)">
        <span style="font-weight:600;font-size:12px;color:var(--text-primary)">Comments — ${colToLetter(c)}${r + 1}</span>
        <button class="comment-close-btn" style="background:none;border:none;font-size:16px;cursor:pointer;color:var(--text-secondary);line-height:1">&times;</button>
      </div>
      <div class="comment-threads-list" style="overflow-y:auto;flex:1;max-height:220px">${threadsHtml}</div>
      <div style="padding:8px 12px;border-top:1px solid var(--border-color);display:flex;gap:6px">
        <input type="text" class="comment-input" placeholder="Add a comment..." style="flex:1;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);outline:none">
        <button class="comment-send-btn" style="padding:4px 10px;background:var(--accent-color);color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer">Send</button>
      </div>
    `;

    panel.querySelector('.comment-close-btn').addEventListener('click', () => {
      panel.remove();
      if (comment.threads.length === 0) delete S.cellComments[key];
      renderGrid();
      updateSelection();
    });

    panel.querySelector('.comment-send-btn').addEventListener('click', () => {
      const input = panel.querySelector('.comment-input');
      const text = input.value.trim();
      if (!text) return;
      comment.threads.push({ author: 'User', text, timestamp: Date.now(), resolved: false });
      renderThreads();
      renderGrid();
      updateSelection();
    });

    panel.querySelector('.comment-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        panel.querySelector('.comment-send-btn').click();
      }
    });

    panel.querySelectorAll('.comment-resolve-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        comment.threads[idx].resolved = !comment.threads[idx].resolved;
        renderThreads();
        renderGrid();
        updateSelection();
      });
    });

    panel.querySelectorAll('.comment-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        comment.threads.splice(idx, 1);
        renderThreads();
        renderGrid();
        updateSelection();
      });
    });
  }

  renderThreads();
  document.body.appendChild(panel);

  // Auto-focus input
  setTimeout(() => panel.querySelector('.comment-input')?.focus(), 50);

  // Close on click outside
  const closeHandler = (e) => {
    if (!panel.contains(e.target)) {
      panel.remove();
      if (comment.threads.length === 0) delete S.cellComments[key];
      renderGrid();
      updateSelection();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 100);
}

export function hasComment(r, c) {
  const key = `${r},${c}`;
  return S.cellComments[key] && S.cellComments[key].threads.length > 0;
}

export function getCommentIndicatorHTML(r, c) {
  if (!hasComment(r, c)) return '';
  const comment = S.cellComments[`${r},${c}`];
  const unresolvedCount = comment.threads.filter(t => !t.resolved).length;
  return `<span class="cell-comment-indicator" data-comment-row="${r}" data-comment-col="${c}" title="${unresolvedCount} unresolved comment(s)"></span>`;
}

/* ==================== Slicer Widget ==================== */




export function showSlicerDialog() {
  const sheet = getSheet();
  // Get header row values (row 0)
  const headers = [];
  for (let c = 0; c < sheet.cols; c++) {
    const val = getDisplayValue(sheet, 0, c);
    if (val) headers.push({ col: c, label: val });
  }
  if (headers.length === 0) {
    alert('No column headers found in row 1. Add headers first.');
    return;
  }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:360px">
    <h3 style="margin:0 0 12px">Insert Slicer</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Select a column to create a slicer filter:</p>
    <select id="slicer-col" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:13px;margin-bottom:12px">
      ${headers.map(h => `<option value="${h.col}">${escapeHtml(h.label)} (Col ${colToLetter(h.col)})</option>`).join('')}
    </select>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="toolbar-btn" id="slicer-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="slicer-create" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:6px">Create</button>
    </div>
  </div>`;

  document.body.appendChild(dlg);
  dlg.querySelector('#slicer-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#slicer-create').onclick = () => {
    const colIdx = parseInt(dlg.querySelector('#slicer-col').value);
    createSlicer(colIdx);
    dlg.remove();
  };
}

export function createSlicer(colIdx) {
  const sheet = getSheet();
  const header = getDisplayValue(sheet, 0, colIdx) || colToLetter(colIdx);
  const id = ++S.slicerIdCounter;

  // Collect unique values from the column (skip header row 0)
  const uniqueVals = new Set();
  for (let r = 1; r < sheet.rows; r++) {
    const v = getDisplayValue(sheet, r, colIdx);
    if (v) uniqueVals.add(v);
  }

  const slicer = {
    id,
    colIdx,
    title: header,
    x: 100 + (S.slicers.length % 3) * 200,
    y: 60 + Math.floor(S.slicers.length / 3) * 220,
    width: 180,
    height: 200,
    selectedValues: new Set(uniqueVals), // all selected by default
    allValues: [...uniqueVals].sort(),
  };
  S.slicers.push(slicer);
  renderSlicerWidget(slicer);
  applySlicerFilters();
}

export function renderSlicerWidget(slicer) {
  // Remove existing
  document.getElementById(`slicer-${slicer.id}`)?.remove();

  const widget = document.createElement('div');
  widget.id = `slicer-${slicer.id}`;
  widget.className = 'slicer-widget';
  widget.style.cssText = `position:absolute;top:${slicer.y}px;left:${slicer.x}px;width:${slicer.width}px;height:${slicer.height}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:100;display:flex;flex-direction:column;overflow:hidden;user-select:none`;

  const allSelected = slicer.allValues.every(v => slicer.selectedValues.has(v));

  widget.innerHTML = `
    <div class="slicer-header" style="padding:6px 10px;background:var(--accent-color);color:white;font-size:12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;cursor:move;border-radius:10px 10px 0 0">
      <span>${escapeHtml(slicer.title)}</span>
      <div style="display:flex;gap:4px">
        <button class="slicer-toggle-all" title="${allSelected ? 'Clear All' : 'Select All'}" style="background:none;border:none;color:white;cursor:pointer;font-size:11px;padding:0 2px">${allSelected ? '☐' : '☑'}</button>
        <button class="slicer-close" title="Remove slicer" style="background:none;border:none;color:white;cursor:pointer;font-size:14px;padding:0 2px;line-height:1">&times;</button>
      </div>
    </div>
    <div class="slicer-items" style="overflow-y:auto;flex:1;padding:4px 0">
      ${slicer.allValues.map(v => `
        <label class="slicer-item" style="display:flex;align-items:center;gap:6px;padding:3px 10px;cursor:pointer;font-size:12px;color:var(--text-primary)">
          <input type="checkbox" data-val="${escapeHtml(v)}" ${slicer.selectedValues.has(v) ? 'checked' : ''} style="margin:0">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(v)}</span>
        </label>
      `).join('')}
    </div>
  `;

  const container = document.getElementById('sheet-container');
  if (container) {
    container.style.position = 'relative';
    container.appendChild(widget);
  }

  // Drag to move
  let dragOffX = 0, dragOffY = 0, isDraggingSlicer = false;
  const header = widget.querySelector('.slicer-header');
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDraggingSlicer = true;
    dragOffX = e.clientX - widget.offsetLeft;
    dragOffY = e.clientY - widget.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDraggingSlicer) return;
    slicer.x = Math.max(0, e.clientX - dragOffX);
    slicer.y = Math.max(0, e.clientY - dragOffY);
    widget.style.left = slicer.x + 'px';
    widget.style.top = slicer.y + 'px';
  });
  document.addEventListener('mouseup', () => { isDraggingSlicer = false; });

  // Checkbox change
  widget.querySelectorAll('.slicer-items input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const val = cb.dataset.val;
      if (cb.checked) slicer.selectedValues.add(val);
      else slicer.selectedValues.delete(val);
      applySlicerFilters();
      renderSlicerWidget(slicer);
    });
  });

  // Toggle all
  widget.querySelector('.slicer-toggle-all').addEventListener('click', () => {
    if (allSelected) {
      slicer.selectedValues.clear();
    } else {
      slicer.allValues.forEach(v => slicer.selectedValues.add(v));
    }
    applySlicerFilters();
    renderSlicerWidget(slicer);
  });

  // Close/remove slicer
  widget.querySelector('.slicer-close').addEventListener('click', () => {
    S.slicers = S.slicers.filter(s => s.id !== slicer.id);
    widget.remove();
    applySlicerFilters();
  });
}

export function applySlicerFilters() {
  // Build combined filter: a row is visible if it passes ALL S.slicers
  // We use the existing filter mechanism but override for S.slicers
  const sheet = getSheet();
  // Clear slicer-hidden class
  S.gridEl.querySelectorAll('tr[data-slicer-hidden]').forEach(tr => {
    tr.style.display = '';
    tr.removeAttribute('data-slicer-hidden');
  });

  if (S.slicers.length === 0) return;

  for (let r = 1; r < sheet.rows; r++) {
    let visible = true;
    for (const slicer of S.slicers) {
      const val = getDisplayValue(sheet, r, slicer.colIdx);
      if (val && !slicer.selectedValues.has(val)) {
        visible = false;
        break;
      }
    }
    if (!visible) {
      const tr = S.gridEl.querySelector(`tr:has(td[data-row="${r}"])`);
      if (tr) {
        tr.style.display = 'none';
        tr.setAttribute('data-slicer-hidden', '1');
      }
    }
  }
}

/* ==================== Enhanced Export (CSV encoding + JSON) ==================== */

export function showExportDialog() {
  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:400px">
    <h3 style="margin:0 0 12px">Export Spreadsheet</h3>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Format</label>
      <select id="export-format" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
        <option value="csv">CSV (Comma-Separated Values)</option>
        <option value="tsv">TSV (Tab-Separated Values)</option>
        <option value="json">JSON (JavaScript Object Notation)</option>
        <option value="json-records">JSON Records (array of objects)</option>
      </select>
    </div>
    <div id="export-csv-options">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Encoding</label>
      <select id="export-encoding" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:13px;margin-bottom:8px">
        <option value="utf-8">UTF-8</option>
        <option value="utf-8-bom">UTF-8 with BOM (for Excel compatibility)</option>
        <option value="euc-kr">EUC-KR (Korean)</option>
        <option value="shift-jis">Shift-JIS (Japanese)</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px;cursor:pointer">
        <input type="checkbox" id="export-headers" checked> Include header row
      </label>
    </div>
    <div id="export-json-options" style="display:none">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px;cursor:pointer">
        <input type="checkbox" id="export-pretty" checked> Pretty print (indented)
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px;cursor:pointer">
        <input type="checkbox" id="export-all-S.sheets"> Export all S.sheets
      </label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="toolbar-btn" id="export-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="export-go" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:6px">Export</button>
    </div>
  </div>`;

  document.body.appendChild(dlg);

  const fmtEl = dlg.querySelector('#export-format');
  const csvOpts = dlg.querySelector('#export-csv-options');
  const jsonOpts = dlg.querySelector('#export-json-options');

  fmtEl.addEventListener('change', () => {
    const isJson = fmtEl.value.startsWith('json');
    csvOpts.style.display = isJson ? 'none' : 'block';
    jsonOpts.style.display = isJson ? 'block' : 'none';
  });

  dlg.querySelector('#export-cancel').onclick = () => dlg.remove();
  dlg.querySelector('#export-go').onclick = () => {
    const fmt = fmtEl.value;
    if (fmt === 'csv' || fmt === 'tsv') {
      exportDelimited(fmt, dlg);
    } else {
      exportJSON(fmt, dlg);
    }
    dlg.remove();
  };
}

export function getSheetDataMatrix(sheet) {
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  const rows = [];
  for (let r = 0; r <= maxR; r++) {
    const row = [];
    for (let c = 0; c <= maxC; c++) {
      row.push(getDisplayValue(sheet, r, c));
    }
    rows.push(row);
  }
  return rows;
}

export function exportDelimited(fmt, dlg) {
  const delimiter = fmt === 'tsv' ? '\t' : ',';
  const encoding = dlg.querySelector('#export-encoding').value;
  const includeHeaders = dlg.querySelector('#export-headers').checked;
  const matrix = getSheetDataMatrix(getSheet());
  const startRow = includeHeaders ? 0 : 1;

  const lines = [];
  for (let r = startRow; r < matrix.length; r++) {
    const cols = matrix[r].map(val => {
      if (typeof val === 'string' && (val.includes(delimiter) || val.includes('"') || val.includes('\n'))) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    lines.push(cols.join(delimiter));
  }

  let content = lines.join('\n');
  let blob;

  if (encoding === 'utf-8-bom') {
    blob = new Blob(['\uFEFF' + content], { type: `text/${fmt === 'tsv' ? 'tab-separated-values' : 'csv'};charset=utf-8;` });
  } else if (encoding === 'euc-kr' || encoding === 'shift-jis') {
    // For non-UTF encodings, use TextEncoder if available, otherwise fallback
    try {
      const encoder = new TextEncoder(encoding);
      blob = new Blob([encoder.encode(content)], { type: `text/${fmt === 'tsv' ? 'tab-separated-values' : 'csv'}` });
    } catch {
      // Fallback to UTF-8 with BOM for compatibility
      blob = new Blob(['\uFEFF' + content], { type: `text/${fmt === 'tsv' ? 'tab-separated-values' : 'csv'};charset=utf-8;` });
    }
  } else {
    blob = new Blob([content], { type: `text/${fmt === 'tsv' ? 'tab-separated-values' : 'csv'};charset=utf-8;` });
  }

  downloadBlob(blob, `spreadsheet.${fmt}`);
}

export function exportJSON(fmt, dlg) {
  const pretty = dlg.querySelector('#export-pretty').checked;
  const allSheets = dlg.querySelector('#export-all-S.sheets').checked;

  const sheetsToExport = allSheets ? S.sheets : [getSheet()];
  const result = {};

  sheetsToExport.forEach((sheet, idx) => {
    const name = sheet.name || `Sheet${idx + 1}`;
    const matrix = getSheetDataMatrix(sheet);

    if (fmt === 'json-records' && matrix.length > 1) {
      // First row as headers, rest as objects
      const headers = matrix[0];
      const records = [];
      for (let r = 1; r < matrix.length; r++) {
        const obj = {};
        let hasData = false;
        headers.forEach((h, c) => {
          if (h) {
            const val = matrix[r][c];
            obj[h] = val;
            if (val !== '') hasData = true;
          }
        });
        if (hasData) records.push(obj);
      }
      result[name] = records;
    } else {
      result[name] = matrix;
    }
  });

  // If single sheet, flatten
  const output = allSheets ? result : Object.values(result)[0];
  const jsonStr = pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);

  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, 'spreadsheet.json');
}

/* ==================== Sparkline Canvas Rendering ==================== */

export function renderSparklineCanvases() {
  const canvases = S.gridEl.querySelectorAll('.sparkline-canvas');
  canvases.forEach(canvas => {
    const type = canvas.dataset.type || 'line';
    const valStr = canvas.dataset.values || '';
    const vals = valStr.split(',').map(Number).filter(v => !isNaN(v));
    if (vals.length < 2) return;

    const parent = canvas.parentElement;
    const w = parent.clientWidth || 120;
    const h = parent.clientHeight || 24;
    canvas.width = w * 2; // retina
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const pad = 2;

    if (type === 'line') {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = pad + (i / (vals.length - 1)) * (w - 2 * pad);
        const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Dots at min/max
      const minIdx = vals.indexOf(Math.min(...vals));
      const maxIdx = vals.indexOf(Math.max(...vals));
      [minIdx, maxIdx].forEach((idx, ci) => {
        const x = pad + (idx / (vals.length - 1)) * (w - 2 * pad);
        const y = pad + (1 - (vals[idx] - min) / range) * (h - 2 * pad);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = ci === 0 ? '#ef4444' : '#10b981';
        ctx.fill();
      });
    } else if (type === 'bar') {
      const barW = Math.max(2, (w - 2 * pad) / vals.length - 1);
      vals.forEach((v, i) => {
        const bh = Math.max(1, ((v - min) / range) * (h - 2 * pad));
        const x = pad + i * (barW + 1);
        const y = h - pad - bh;
        ctx.fillStyle = v >= 0 ? '#3b82f6' : '#ef4444';
        ctx.fillRect(x, y, barW, bh);
      });
    } else if (type === 'winloss' || type === 'win/loss') {
      const barW = Math.max(2, (w - 2 * pad) / vals.length - 1);
      const midY = h / 2;
      const halfH = (h - 2 * pad) / 2 - 1;
      vals.forEach((v, i) => {
        const x = pad + i * (barW + 1);
        if (v > 0) {
          ctx.fillStyle = '#10b981';
          ctx.fillRect(x, midY - halfH, barW, halfH);
        } else if (v < 0) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x, midY + 1, barW, halfH);
        } else {
          ctx.fillStyle = '#9ca3af';
          ctx.fillRect(x, midY - 1, barW, 2);
        }
      });
      // Center line
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
    } else if (type === 'column') {
      const gap = 2;
      const barW = Math.max(2, (w - 2 * pad) / vals.length - gap);
      vals.forEach((v, i) => {
        const bh = Math.max(1, ((v - min) / range) * (h - 2 * pad));
        const x = pad + i * (barW + gap);
        const y = h - pad - bh;
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, 1);
        ctx.fill();
      });
    }
  });
}

/* ==================== Named Range Dropdown in Formula Bar ==================== */

export function buildNamedRangeDropdown() {
  const sheet = getSheet();
  const names = Object.keys(sheet.namedRanges || {});
  // Also include cross-sheet named ranges from S.namedRanges global
  Object.keys(S.namedRanges).forEach(n => { if (!names.includes(n)) names.push(n); });
  return names;
}

export function initNamedRangeSelector() {
  // Create a dropdown button next to the cell ref input
  let nrBtn = document.getElementById('sheet-nr-dropdown');
  if (nrBtn) return; // already exists

  nrBtn = document.createElement('button');
  nrBtn.id = 'sheet-nr-dropdown';
  nrBtn.className = 'toolbar-btn';
  nrBtn.title = 'Named Ranges';
  nrBtn.style.cssText = 'font-size:10px;padding:2px 4px;margin-left:2px';
  nrBtn.textContent = '▾';

  const cellRefEl = document.getElementById('sheet-cell-ref');
  if (S.cellRefEl?.parentElement) {
    S.cellRefEl.parentElement.insertBefore(nrBtn, S.cellRefEl.nextSibling);
  }

  nrBtn.addEventListener('click', () => {
    const names = buildNamedRangeDropdown();
    if (names.length === 0) {
      showNamedRangeDialog();
      return;
    }

    // Show dropdown
    const existing = document.getElementById('nr-selector-dropdown');
    if (existing) { existing.remove(); return; }

    const dd = document.createElement('div');
    dd.id = 'nr-selector-dropdown';
    dd.style.cssText = 'position:fixed;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:5000;max-height:200px;overflow:auto;min-width:160px';
    const rect = nrBtn.getBoundingClientRect();
    dd.style.left = rect.left + 'px';
    dd.style.top = rect.bottom + 2 + 'px';

    // Add "Manage..." option at top
    dd.innerHTML = `<div class="nr-dd-item" data-action="manage" style="padding:6px 10px;font-size:12px;color:var(--accent-color);cursor:pointer;border-bottom:1px solid var(--border-color)">Manage Named Ranges...</div>` +
      names.map(n => {
        const r = S.namedRanges[n] || {};
        const sheet = getSheet();
        const ref = sheet.namedRanges?.[n] || (r.r1 !== undefined ? `${colToLetter(r.c1)}${r.r1+1}:${colToLetter(r.c2)}${r.r2+1}` : '');
        return `<div class="nr-dd-item" data-name="${n}" style="padding:6px 10px;font-size:12px;cursor:pointer;display:flex;justify-content:space-between;gap:8px">
          <span style="font-weight:600">${n}</span>
          <span style="color:var(--text-secondary);font-size:11px">${ref}</span>
        </div>`;
      }).join('');

    document.body.appendChild(dd);

    dd.addEventListener('click', (e) => {
      const item = e.target.closest('.nr-dd-item');
      if (!item) return;
      dd.remove();
      if (item.dataset.action === 'manage') {
        showNamedRangeDialog();
        return;
      }
      const name = item.dataset.name;
      if (!name) return;
      // Navigate to the named range
      const r = S.namedRanges[name];
      if (r) {
        S.selectedRow = r.r1; S.selectedCol = r.c1;
        S.selAnchorRow = r.r2; S.selAnchorCol = r.c2;
        updateSelection();
      }
      // If editing formula, insert the name
      if (S.isEditing && S.isFormulaMode) {
        const input = S.formulaEditTarget === 'bar' ? S.formulaBarEl : getCellInput();
        if (input) {
          const pos = input.selectionStart;
          const text = input.value;
          input.value = text.slice(0, pos) + name + text.slice(pos);
          input.selectionStart = input.selectionEnd = pos + name.length;
          input.focus();
        }
      }
    });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', function closeDd(ev) {
        if (!dd.contains(ev.target) && ev.target !== nrBtn) {
          dd.remove();
          document.removeEventListener('click', closeDd);
        }
      });
    }, 50);
  });
}

/* ==================== Array Formulas ==================== */

export function getArrayFormulaDisplay(r, c) {
  const cell = getCell(getSheet(), r, c);
  if (!cell) return '';
  if (cell.format?.isArrayFormula) {
    return `{${cell.raw}}`;
  }
  return cell.raw;
}

/* ==================== State Persistence ==================== */

/** Save per-sheet UI state (freeze, condFormats, validations, notes, etc.) back to the sheet data model */
export function _saveSheetState() {
  const sheet = S.sheets[S.activeSheetIdx];
  if (!sheet) return;
  sheet.freezeRows = S.freezeRows;
  sheet.freezeCols = S.freezeCols;
  sheet.condFormats = S.condFormats;
  sheet.validations = S.validations;
  sheet.cellNotes = S.cellNotes;
  sheet.cellHyperlinks = S.cellHyperlinks;
  sheet.cellComments = S.cellComments;
  sheet.hiddenRows = [...S.hiddenRows];
  sheet.hiddenCols = [...S.hiddenCols];
  sheet.rowGroups = S.rowGroups;
  sheet.colWidths = { ...S.colWidths };
  sheet.rowHeights = { ...S.rowHeights };
}

/** Load per-sheet UI state from the sheet data model into module-level vars */
export function _loadSheetState() {
  const sheet = S.sheets[S.activeSheetIdx];
  if (!sheet) return;
  S.freezeRows = sheet.freezeRows || 0;
  S.freezeCols = sheet.freezeCols || 0;
  S.condFormats = sheet.condFormats || [];
  S.validations = sheet.validations || {};
  S.cellNotes = sheet.cellNotes || {};
  S.cellHyperlinks = sheet.cellHyperlinks || {};
  S.cellComments = sheet.cellComments || {};
  S.hiddenRows = new Set(sheet.hiddenRows || []);
  S.hiddenCols = new Set(sheet.hiddenCols || []);
  S.rowGroups = sheet.rowGroups || [];
}
