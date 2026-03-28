// OfficeLink SL — Sheet Grid (rendering, virtual scroll, cell styles, resize, DOM setup)

import {
  getCell, getDisplayValue, colToLetter,
} from './sheet-engine.js';
import { escapeHtml } from '../utils/sanitize.js';
import S from './sheet-state.js';

// Forward references — set by sheet-ui.js after all modules load
let _applyFreezeStyles = () => {};
let _applyConditionalFormatting = () => {};
let _applyIconSets = () => {};
let _renderSparklineCanvases = () => {};
let _getCondFmtStyle = () => '';
let _hasComment = () => false;
let _trackDocListener = () => {};

export function setGridDeps(deps) {
  if (deps.applyFreezeStyles) _applyFreezeStyles = deps.applyFreezeStyles;
  if (deps.applyConditionalFormatting) _applyConditionalFormatting = deps.applyConditionalFormatting;
  if (deps.applyIconSets) _applyIconSets = deps.applyIconSets;
  if (deps.renderSparklineCanvases) _renderSparklineCanvases = deps.renderSparklineCanvases;
  if (deps.getCondFmtStyle) _getCondFmtStyle = deps.getCondFmtStyle;
  if (deps.hasComment) _hasComment = deps.hasComment;
  if (deps.trackDocListener) _trackDocListener = deps.trackDocListener;
}

/* ==================== Helpers ==================== */

export function getSheet() {
  return S.sheets[S.activeSheetIdx];
}

export function getColWidth(c) { return S.colWidths[c] || 80; }
export function getRowHeight(r) { return S.rowHeights[r] || 24; }

/* ==================== Rendering (Virtual Scrolling) ==================== */

const VSCROLL_BUFFER = 10;

/**
 * Build the list of visible (non-hidden, non-collapsed, non-filtered) row indices.
 */
export const _buildVisibleRows = () => {
  const sheet = getSheet();
  const visible = [];
  for (let r = 0; r < sheet.rows; r++) {
    const collapsedGroup = S.rowGroups.find(g => g.collapsed && r >= g.r1 && r <= g.r2);
    if (collapsedGroup && r > collapsedGroup.r1) continue;
    if (S.hiddenRows.has(r)) continue;
    if (S.filterRow >= 0 && r > S.filterRow) {
      const hasActiveFilter = Object.keys(S.filterValues).length > 0;
      if (hasActiveFilter) {
        const shouldHide = Object.entries(S.filterValues).some(([fc, allowed]) => {
          const cellVal = getDisplayValue(sheet, r, parseInt(fc));
          return allowed.size > 0 && !allowed.has(cellVal);
        });
        if (shouldHide) continue;
      }
    }
    visible.push(r);
  }
  return visible;
};

/**
 * Determine which slice of visibleRows to render based on scroll position.
 */
const _getViewportSlice = (visibleRows) => {
  if (!S.containerEl) return { start: 0, end: visibleRows.length };
  const scrollTop = S.containerEl.scrollTop;
  const viewportH = S.containerEl.clientHeight;
  let cumH = 0;
  let startIdx = 0;
  for (let i = 0; i < visibleRows.length; i++) {
    const rh = getRowHeight(visibleRows[i]);
    if (cumH + rh > scrollTop) { startIdx = i; break; }
    cumH += rh;
    if (i === visibleRows.length - 1) startIdx = visibleRows.length;
  }
  let endIdx = startIdx;
  let accH = 0;
  for (let i = startIdx; i < visibleRows.length; i++) {
    accH += getRowHeight(visibleRows[i]);
    endIdx = i + 1;
    if (accH >= viewportH) break;
  }
  const bufferedStart = Math.max(0, startIdx - VSCROLL_BUFFER);
  const bufferedEnd = Math.min(visibleRows.length, endIdx + VSCROLL_BUFFER);
  return { start: bufferedStart, end: bufferedEnd };
};

/**
 * Render a single row's HTML.
 */
const _renderRowHtml = (sheet, r) => {
  const groupIdx = S.rowGroups.findIndex(g => g.r1 === r);
  const groupIndicator = groupIdx >= 0
    ? `<span class="sheet-group-toggle" data-group="${groupIdx}" style="cursor:pointer;font-size:9px;margin-right:2px;color:var(--accent-color)" title="Toggle group">${S.rowGroups[groupIdx].collapsed ? '▶' : '▼'}</span>`
    : '';
  const rowCls = r < S.freezeRows ? 'sheet-frozen-row' : '';
  const rh = getRowHeight(r);
  let html = `<tr class="${rowCls}" data-vrow="${r}"><th class="sheet-row-header" data-row="${r}" style="height:${rh}px">${groupIndicator}${r + 1}</th>`;
  for (let c = 0; c < sheet.cols; c++) {
    if (S.hiddenCols.has(c)) {
      html += `<td data-row="${r}" data-col="${c}" style="display:none"></td>`;
      continue;
    }
    const cell = getCell(sheet, r, c);
    if (cell?.format?.merged) continue;
    const val = getDisplayValue(sheet, r, c);
    const style = cellStyle(cell, r, c);
    const frozenCls = c < S.freezeCols ? ' sheet-frozen-col' : '';
    const mergeSpan = cell?.format?.mergeSpan;
    const spanAttrs = mergeSpan
      ? ` rowspan="${mergeSpan.rows}" colspan="${mergeSpan.cols}"`
      : '';
    const w = getColWidth(c);
    const noteKey = `${r},${c}`;
    const hasNote = S.cellNotes[noteKey];
    const noteIndicator = hasNote ? '<span class="cell-note-indicator" title="' + escapeHtml(hasNote) + '"></span>' : '';
    const commentIndicator = _hasComment(r, c) ? `<span class="cell-comment-indicator" data-comment-row="${r}" data-comment-col="${c}" title="Click to view comments"></span>` : '';
    const sparkline = cell?.format?.sparkline;
    const hyperlink = cell?.format?.hyperlink;
    let cellContent;
    const isSparklineFormula = typeof val === 'string' && val.startsWith('__SPARKLINE__');
    if (isSparklineFormula) {
      const parts = val.split('__');
      const sparkTypeF = parts[2] || 'line';
      const sparkDataF = parts[3] || '';
      cellContent = `<canvas class="sparkline-canvas" data-type="${sparkTypeF}" data-values="${sparkDataF}" style="width:100%;height:100%"></canvas>`;
    } else if (sparkline) {
      cellContent = `<img src="${sparkline}" style="width:100%;height:100%;object-fit:contain" alt="sparkline">`;
    } else if (hyperlink) {
      const linkLabel = S.cellHyperlinks[`${r},${c}`]?.label || val;
      cellContent = `<a href="${escapeHtml(hyperlink)}" target="_blank" rel="noopener" style="color:#1a73e8;text-decoration:underline;cursor:pointer" onclick="event.stopPropagation()">${escapeHtml(String(linkLabel))}</a>`;
    } else if (cell?.format?.isArrayFormula && cell.raw.startsWith('=')) {
      cellContent = escapeHtml(String(val));
    } else if (cell?.format?.spillSource) {
      cellContent = escapeHtml(String(val));
    } else {
      cellContent = escapeHtml(String(val));
    }
    const filterBtn = (S.filterRow === r)
      ? `<span class="sheet-filter-btn" data-filter-col="${c}" style="cursor:pointer;font-size:9px;float:right;color:${S.filterValues[c] ? 'var(--accent-color)' : 'var(--text-secondary)'};margin-left:2px" title="Filter">▼</span>`
      : '';
    const dvKey = `${r},${c}`;
    const dvIndicator = S.validations[dvKey]?.type === 'list'
      ? `<span class="sheet-dv-btn" data-dv-row="${r}" data-dv-col="${c}" style="cursor:pointer;font-size:8px;float:right;color:var(--text-secondary);margin-left:1px" title="Dropdown">▾</span>`
      : '';
    html += `<td data-row="${r}" data-col="${c}" class="${frozenCls}" style="width:${w}px;min-width:${w}px;height:${rh}px;${style}"${spanAttrs}>${filterBtn}${dvIndicator}${cellContent}${noteIndicator}${commentIndicator}</td>`;
  }
  html += '</tr>';
  return html;
};

export function _syncSheetDimensions(sheet) {
  if (sheet.colWidths) {
    for (const [idx, w] of Object.entries(sheet.colWidths)) {
      const ci = Number(idx);
      if (w && !(ci in S.colWidths)) S.colWidths[ci] = w;
    }
  }
  if (sheet.rowHeights) {
    for (const [idx, h] of Object.entries(sheet.rowHeights)) {
      const ri = Number(idx);
      if (h && !(ri in S.rowHeights)) S.rowHeights[ri] = h;
    }
  }
}

export function renderGrid() {
  const sheet = getSheet();
  _syncSheetDimensions(sheet);
  const visibleRows = _buildVisibleRows();
  S._cachedVisibleRows = visibleRows;

  // Header
  let html = '<thead><tr><th class="sheet-corner"></th>';
  for (let c = 0; c < sheet.cols; c++) {
    if (S.hiddenCols.has(c)) {
      html += `<th class="sheet-col-header sheet-hidden-col" data-col="${c}" style="display:none">${colToLetter(c)}</th>`;
      continue;
    }
    const cls = c < S.freezeCols ? 'sheet-col-header sheet-frozen-col-header' : 'sheet-col-header';
    const w = getColWidth(c);
    html += `<th class="${cls}" data-col="${c}" style="width:${w}px;min-width:${w}px">${colToLetter(c)}</th>`;
  }
  html += '</tr></thead><tbody>';

  // Virtual scrolling: compute viewport slice
  const { start, end } = _getViewportSlice(visibleRows);

  // Top spacer
  let topH = 0;
  for (let i = 0; i < start; i++) topH += getRowHeight(visibleRows[i]);
  const colCount = sheet.cols - S.hiddenCols.size + 1;
  if (topH > 0) {
    html += `<tr class="vscroll-spacer-top" style="height:${topH}px"><td colspan="${colCount}"></td></tr>`;
  }

  // Render visible rows
  for (let i = start; i < end && i < visibleRows.length; i++) {
    html += _renderRowHtml(sheet, visibleRows[i]);
  }

  // Bottom spacer
  let bottomH = 0;
  for (let i = end; i < visibleRows.length; i++) bottomH += getRowHeight(visibleRows[i]);
  if (bottomH > 0) {
    html += `<tr class="vscroll-spacer-bottom" style="height:${bottomH}px"><td colspan="${colCount}"></td></tr>`;
  }

  html += '</tbody>';
  S.gridEl.innerHTML = html;
  S._vsLastStart = start;
  S._vsLastEnd = end;

  _applyFreezeStyles();
  if (S.condFormats.length > 0) _applyConditionalFormatting();
  _applyIconSets();
  _renderSparklineCanvases();

  // Bind scroll listener once for virtual scroll updates
  if (!S._vsScrollBound && S.containerEl) {
    S._vsScrollBound = true;
    let _vsRafId = 0;
    S.containerEl.addEventListener('scroll', () => {
      if (_vsRafId) return;
      _vsRafId = requestAnimationFrame(() => {
        _vsRafId = 0;
        _onVirtualScroll();
      });
    });
  }
}

/**
 * Handle scroll — re-render only if viewport slice changed.
 */
const _onVirtualScroll = () => {
  if (!S._cachedVisibleRows) return;
  const { start, end } = _getViewportSlice(S._cachedVisibleRows);
  if (start === S._vsLastStart && end === S._vsLastEnd) return;
  renderGrid();
};

export function renderCell(r, c) {
  const td = S.gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
  if (!td) return;
  const cell = getCell(getSheet(), r, c);
  td.textContent = getDisplayValue(getSheet(), r, c);
  td.setAttribute('style', cellStyle(cell, r, c));
}

export function cellStyle(cell, r, c) {
  const parts = [];
  if (cell?.format) {
    const f = cell.format;
    if (f.bold) parts.push('font-weight:700');
    if (f.italic) parts.push('font-style:italic');
    const textDeco = [];
    if (f.underline) textDeco.push('underline');
    if (f.strikethrough) textDeco.push('line-through');
    if (textDeco.length) parts.push(`text-decoration:${textDeco.join(' ')}`);
    if (f.textRotation) parts.push(`writing-mode:vertical-rl;transform:rotate(${f.textRotation}deg)`);
    if (f.align) parts.push(`text-align:${f.align}`);
    else if (typeof cell.value === 'number') parts.push('text-align:right');
    if (f.valign) parts.push(`vertical-align:${f.valign}`);
    if (f.bg) parts.push(`background:${f.bg}`);
    else if (S.bandedRowsEnabled) parts.push(`background:${r % 2 === 0 ? S.bandedColor1 : S.bandedColor2}`);
    if (f.color) parts.push(`color:${f.color}`);
    if (f.fontSize) parts.push(`font-size:${f.fontSize}px`);
    if (f.fontFamily) parts.push(`font-family:${f.fontFamily}`);
    if (f.indent) parts.push(`padding-left:${f.indent * 12}px`);
    if (f.wrap) parts.push('white-space:pre-wrap;word-wrap:break-word');
    if (f.merged) parts.push('display:none');
    if (f.mergeSpan) {
      // Applied as attributes, not inline style
    }
    if (f.borderTop) parts.push(`border-top:${f.borderTop}`);
    if (f.borderBottom) parts.push(`border-bottom:${f.borderBottom}`);
    if (f.borderLeft) parts.push(`border-left:${f.borderLeft}`);
    if (f.borderRight) parts.push(`border-right:${f.borderRight}`);
  } else if (cell && typeof cell.value === 'number') {
    parts.push('text-align:right');
    if (S.bandedRowsEnabled && r !== undefined) parts.push(`background:${r % 2 === 0 ? S.bandedColor1 : S.bandedColor2}`);
  } else if (S.bandedRowsEnabled && r !== undefined) {
    parts.push(`background:${r % 2 === 0 ? S.bandedColor1 : S.bandedColor2}`);
  }
  // Conditional formatting
  if (r !== undefined && c !== undefined) {
    const cfStyle = _getCondFmtStyle(r, c);
    if (cfStyle) parts.push(cfStyle);
  }
  return parts.join(';');
}

/* ==================== Column/Row Resize ==================== */

export function initResize() {
  const container = document.getElementById('sheet-container');
  if (!container) return;

  container.addEventListener('mousedown', (e) => {
    const th = e.target.closest('th.sheet-col-header');
    if (th) {
      const rect = th.getBoundingClientRect();
      if (Math.abs(e.clientX - rect.right) < 5) {
        e.preventDefault();
        S.isResizingCol = true;
        S.resizeColIdx = parseInt(th.dataset.col);
        S.resizeStartX = e.clientX;
        S.resizeStartWidth = getColWidth(S.resizeColIdx);
        document.body.style.cursor = 'col-resize';
        return;
      }
    }
    const rh = e.target.closest('th.sheet-row-header');
    if (rh) {
      const rect = rh.getBoundingClientRect();
      if (Math.abs(e.clientY - rect.bottom) < 5) {
        e.preventDefault();
        S.isResizingRow = true;
        S.resizeRowIdx = parseInt(rh.dataset.row);
        S.resizeStartY = e.clientY;
        S.resizeStartHeight = getRowHeight(S.resizeRowIdx);
        document.body.style.cursor = 'row-resize';
        return;
      }
    }
  });

  _trackDocListener('mousemove', (e) => {
    if (S.isResizingCol) {
      const diff = e.clientX - S.resizeStartX;
      const newWidth = Math.max(30, S.resizeStartWidth + diff);
      S.colWidths[S.resizeColIdx] = newWidth;
      applyColumnWidth(S.resizeColIdx, newWidth);
    }
    if (S.isResizingRow) {
      const diff = e.clientY - S.resizeStartY;
      const newHeight = Math.max(16, S.resizeStartHeight + diff);
      S.rowHeights[S.resizeRowIdx] = newHeight;
      applyRowHeight(S.resizeRowIdx, newHeight);
    }

    if (!S.isResizingCol && !S.isResizingRow) {
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

  _trackDocListener('mouseup', () => {
    if (S.isResizingCol || S.isResizingRow) {
      S.isResizingCol = false;
      S.isResizingRow = false;
      document.body.style.cursor = '';
    }
  });
}

export function applyColumnWidth(colIdx, width) {
  if (!S.gridEl) return;
  const cells = S.gridEl.querySelectorAll(`th[data-col="${colIdx}"], td[data-col="${colIdx}"]`);
  cells.forEach(cell => {
    cell.style.width = width + 'px';
    cell.style.minWidth = width + 'px';
  });
}

export function applyRowHeight(rowIdx, height) {
  if (!S.gridEl) return;
  const cells = S.gridEl.querySelectorAll(`th[data-row="${rowIdx}"], td[data-row="${rowIdx}"]`);
  cells.forEach(cell => {
    cell.style.height = height + 'px';
  });
}

/* ==================== Hide/Show Rows & Columns ==================== */

export function hideSelectedRows() {
  const { r1, r2 } = getSelectionRange();
  for (let r = r1; r <= r2; r++) S.hiddenRows.add(r);
  renderGrid();
  updateSelection();
}

export function hideSelectedCols() {
  const { c1, c2 } = getSelectionRange();
  for (let c = c1; c <= c2; c++) S.hiddenCols.add(c);
  renderGrid();
  updateSelection();
}

export function showAllRows() {
  S.hiddenRows.clear();
  renderGrid();
  updateSelection();
}

export function showAllCols() {
  S.hiddenCols.clear();
  renderGrid();
  updateSelection();
}

/* ==================== Selection (shared helpers) ==================== */

export function getSelectionRange() {
  const r1 = Math.min(S.selAnchorRow, S.selectedRow);
  const r2 = Math.max(S.selAnchorRow, S.selectedRow);
  const c1 = Math.min(S.selAnchorCol, S.selectedCol);
  const c2 = Math.max(S.selAnchorCol, S.selectedCol);
  return { r1, r2, c1, c2 };
}

// Forward references for updateSelection / scrollIntoView — set from sheet-ui.js
let _updateSelectionFn = () => {};
export function setUpdateSelection(fn) { _updateSelectionFn = fn; }
function updateSelection() { _updateSelectionFn(); }

export function scrollIntoView() {
  const td = S.gridEl.querySelector(`td[data-row="${S.selectedRow}"][data-col="${S.selectedCol}"]`);
  if (td && S.containerEl) {
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
